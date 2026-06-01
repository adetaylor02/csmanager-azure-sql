/**
 * POST /api/spares/bulk-import
 * Body: { rows: SparePart[], mode: 'skip' | 'update' | 'new' }
 * Returns { batchId, imported, updated, skipped }
 *
 * Replaces the in-memory bulkImportSpares logic. Duplicates are matched by
 * (site, part_name, model_number, serial_number) — case-insensitive.
 */
const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { toDb } = require('../mapping');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}
const uuid = () => globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID();

app.http('spares-bulk-import', {
  route: 'spares/bulk-import',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const body = await request.json();
      const mode = body.mode || 'skip';
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const batchId = `IMP-${Date.now().toString(36).toUpperCase()}`;
      let imported = 0, updated = 0, skipped = 0;

      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const ui of rows) {
          const db = toDb('spares', ui);
          const dup = await new sql.Request(tx)
            .input('site', db.site)
            .input('pn', db.part_name)
            .input('mn', db.model_number || '')
            .input('sn', db.serial_number || '')
            .query(`SELECT id FROM dbo.spares
                    WHERE site = @site
                      AND LOWER(part_name) = LOWER(@pn)
                      AND LOWER(ISNULL(model_number,'')) = LOWER(@mn)
                      AND LOWER(ISNULL(serial_number,'')) = LOWER(@sn)`);
          const existing = dup.recordset[0];

          if (existing) {
            if (mode === 'skip') { skipped++; continue; }
            if (mode === 'update') {
              // narrow update of common fields
              await new sql.Request(tx)
                .input('id', existing.id)
                .input('quantity', db.quantity)
                .input('min_stock', db.min_stock)
                .input('unit_cost', db.unit_cost)
                .input('location_id', db.location_id || null)
                .input('bin', db.bin || null)
                .input('notes', db.notes || null)
                .input('batch_id', batchId)
                .query(`UPDATE dbo.spares
                        SET quantity=@quantity, min_stock=@min_stock, unit_cost=@unit_cost,
                            location_id=@location_id, bin=@bin, notes=@notes,
                            batch_id=@batch_id, updated_at=SYSUTCDATETIME()
                        WHERE id=@id`);
              updated++;
              continue;
            }
          }

          const id = db.id || uuid();
          await new sql.Request(tx)
            .input('id', id)
            .input('part_name', db.part_name)
            .input('description', db.description || null)
            .input('manufacturer', db.manufacturer)
            .input('model_number', db.model_number)
            .input('serial_number', db.serial_number || null)
            .input('equipment_supported', JSON.stringify(ui.equipmentSupported || []))
            .input('category', db.category)
            .input('criticality', db.criticality)
            .input('condition', db.condition)
            .input('min_stock', db.min_stock || 0)
            .input('quantity', db.quantity || 0)
            .input('unit_cost', db.unit_cost || 0)
            .input('lead_time_days', db.lead_time_days || 0)
            .input('expiry_date', db.expiry_date || null)
            .input('site', db.site)
            .input('location_id', db.location_id || null)
            .input('bin', db.bin || null)
            .input('supplier_id', db.supplier_id || null)
            .input('notes', db.notes || null)
            .input('batch_id', batchId)
            .query(`INSERT INTO dbo.spares
              (id,part_name,description,manufacturer,model_number,serial_number,equipment_supported,
               category,criticality,condition,min_stock,quantity,unit_cost,lead_time_days,expiry_date,
               site,location_id,bin,supplier_id,notes,batch_id)
              VALUES (@id,@part_name,@description,@manufacturer,@model_number,@serial_number,
               @equipment_supported,@category,@criticality,@condition,@min_stock,@quantity,@unit_cost,
               @lead_time_days,@expiry_date,@site,@location_id,@bin,@supplier_id,@notes,@batch_id)`);
          imported++;
        }

        await new sql.Request(tx)
          .input('user', request.headers.get('x-user') || 'system')
          .input('action', `Bulk import ${batchId}`)
          .input('entity', 'import')
          .input('entity_id', batchId)
          .input('details', `${imported} created, ${updated} updated, ${skipped} skipped`)
          .query(`INSERT INTO dbo.audit_logs([user],action,entity,entity_id,details)
                  VALUES (@user,@action,@entity,@entity_id,@details)`);

        await tx.commit();
      } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
      }

      return json(200, { batchId, imported, updated, skipped });
    } catch (e) {
      ctx.error('[spares/bulk-import] error', e);
      return json(500, { error: e.message });
    }
  },
});
