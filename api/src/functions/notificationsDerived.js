/**
 * GET /api/notifications  (overrides the generic CRUD list)
 * Computes low-stock, out-of-stock, expiring, overdue-inspection, pending-reorder,
 * and coverage-gap alerts directly from current SQL state. Replaces the in-memory
 * `notifications()` selector that used to derive these client-side from the store.
 *
 * Generic POST/PUT/DELETE on notifications remain available through the CRUD
 * layer (e.g. for acknowledging persisted incident records).
 */
const { app } = require('@azure/functions');
const { getPool } = require('../db');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}

app.http('notifications-derived', {
  route: 'notifications',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const url = new URL(request.url);
      const site = url.searchParams.get('site');
      const useSite = site && site !== 'All CHI Metro';
      const filter = useSite ? ' WHERE site = @site' : '';
      const pool = await getPool();
      const r = pool.request();
      if (useSite) r.input('site', site);

      const [spares, inspections, reorders, equipment] = await Promise.all([
        r.query(`SELECT id, part_name, quantity, min_stock, expiry_date FROM dbo.spares${filter}`),
        pool.request().query(`SELECT id, spare_id, next_due FROM dbo.inspections${useSite ? ` WHERE site = '${site.replace(/'/g, "''")}'` : ''}`),
        pool.request().query(`SELECT id, spare_id, status, created_at FROM dbo.reorders${useSite ? ` WHERE site = '${site.replace(/'/g, "''")}'` : ''}`),
        pool.request().query(`SELECT id, name, criticality FROM dbo.equipment${useSite ? ` WHERE site = '${site.replace(/'/g, "''")}'` : ''}`),
      ]);

      // For coverage gaps we need spare<->equipment links
      const coverage = await pool.request().query(
        `SELECT id, equipment_supported FROM dbo.spares${filter}`
      );
      const covered = new Set();
      for (const row of coverage.recordset) {
        try {
          const arr = JSON.parse(row.equipment_supported || '[]');
          for (const e of arr) covered.add(e);
        } catch { /* ignore */ }
      }

      const now = Date.now();
      const list = [];
      for (const s of spares.recordset) {
        if (s.quantity === 0) {
          list.push({ id: `n-oos-${s.id}`, type: 'out-of-stock', severity: 'critical',
            message: `${s.part_name} is out of stock`, timestamp: new Date().toISOString(), read: false });
        } else if (s.quantity < s.min_stock) {
          list.push({ id: `n-low-${s.id}`, type: 'low-stock', severity: 'warning',
            message: `${s.part_name} below minimum (${s.quantity}/${s.min_stock})`,
            timestamp: new Date().toISOString(), read: false });
        }
        if (s.expiry_date && new Date(s.expiry_date).getTime() - now < 1000 * 86400 * 120) {
          list.push({ id: `n-exp-${s.id}`, type: 'expiry', severity: 'warning',
            message: `${s.part_name} expires soon`, timestamp: new Date().toISOString(), read: false });
        }
      }
      for (const i of inspections.recordset) {
        if (i.next_due && new Date(i.next_due).getTime() < now) {
          list.push({ id: `n-ins-${i.id}`, type: 'inspection', severity: 'warning',
            message: `Inspection overdue for spare ${i.spare_id}`,
            timestamp: new Date().toISOString(), read: false });
        }
      }
      for (const r of reorders.recordset) {
        if (r.status === 'Pending Approval') {
          list.push({ id: `n-ro-${r.id}`, type: 'reorder', severity: 'info',
            message: `Reorder pending approval for spare ${r.spare_id}`,
            timestamp: r.created_at, read: false });
        }
      }
      for (const e of equipment.recordset) {
        if (e.criticality === 'Critical' && !covered.has(e.id)) {
          list.push({ id: `n-cov-${e.id}`, type: 'coverage', severity: 'critical',
            message: `Critical asset has no spare coverage: ${e.name}`,
            timestamp: new Date().toISOString(), read: false });
        }
      }

      return json(200, list);
    } catch (e) {
      ctx.error('[notifications] derive error', e);
      return json(500, { error: e.message });
    }
  },
});
