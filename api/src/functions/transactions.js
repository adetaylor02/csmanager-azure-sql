/**
 * Inventory movement endpoints. Each call runs inside a single SQL transaction
 * that (1) inserts the dbo.transactions row, (2) adjusts dbo.spares.quantity,
 * (3) writes a dbo.audit_logs row. Replaces the in-memory checkOut/In/Transfer
 * actions from the previous Zustand store.
 *
 * Routes:
 *   POST /api/transactions/check-out  { spareId, quantity, technician, workOrder?, assetId?, reason? }
 *   POST /api/transactions/check-in   { spareId, quantity, technician, condition, toLocation, reason? }
 *   POST /api/transactions/transfer   { spareId, quantity, technician, fromLocation, toLocation }
 */
const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { fromDb } = require('../mapping');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}
const uuid = () => globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID();

async function runMovement(kind, body, ctxUser) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Lock + read current spare
    const spareRes = await new sql.Request(tx)
      .input('id', body.spareId)
      .query('SELECT id, part_name, quantity, site FROM dbo.spares WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
    const spare = spareRes.recordset[0];
    if (!spare) throw new Error(`Spare ${body.spareId} not found`);

    let newQty = spare.quantity;
    if (kind === 'check-out') {
      if (body.quantity > spare.quantity) throw new Error('Insufficient stock');
      newQty -= body.quantity;
    } else if (kind === 'check-in') {
      newQty += body.quantity;
    } // transfer = no quantity delta

    const txId = uuid();
    await new sql.Request(tx)
      .input('id', txId)
      .input('type', kind)
      .input('spare_id', body.spareId)
      .input('quantity', body.quantity)
      .input('technician', body.technician)
      .input('work_order', body.workOrder ?? null)
      .input('asset_id', body.assetId ?? null)
      .input('from_location', body.fromLocation ?? null)
      .input('to_location', body.toLocation ?? null)
      .input('condition', body.condition ?? null)
      .input('reason', body.reason ?? null)
      .input('site', body.site ?? spare.site ?? null)
      .query(`INSERT INTO dbo.transactions
        (id,type,spare_id,quantity,technician,work_order,asset_id,from_location,to_location,condition,reason,site,ts)
        VALUES (@id,@type,@spare_id,@quantity,@technician,@work_order,@asset_id,@from_location,@to_location,@condition,@reason,@site,SYSUTCDATETIME())`);

    if (newQty !== spare.quantity) {
      await new sql.Request(tx)
        .input('id', body.spareId)
        .input('q', newQty)
        .query('UPDATE dbo.spares SET quantity = @q, updated_at = SYSUTCDATETIME() WHERE id = @id');
    }

    await new sql.Request(tx)
      .input('user', ctxUser || body.technician || 'system')
      .input('site', body.site ?? spare.site ?? null)
      .input('action', kind)
      .input('entity', 'transaction')
      .input('entity_id', txId)
      .input('details', `${kind} ${body.quantity} × ${spare.part_name}`)
      .query(`INSERT INTO dbo.audit_logs([user],site,action,entity,entity_id,details)
              VALUES (@user,@site,@action,@entity,@entity_id,@details)`);

    await tx.commit();
    return { id: txId, type: kind, spareId: body.spareId, quantity: body.quantity, newQuantity: newQty };
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

for (const kind of ['check-out', 'check-in', 'transfer']) {
  app.http(`transactions-${kind}`, {
    route: `transactions/${kind}`,
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, ctx) => {
      try {
        const body = await request.json();
        const user = request.headers.get('x-user') || null;
        const result = await runMovement(kind, body, user);
        return json(201, result);
      } catch (e) {
        ctx.error(`[transactions/${kind}] error`, e);
        return json(400, { error: e.message });
      }
    },
  });
}

// Convenience: list transactions, mapped to UI shape.
app.http('transactions-list', {
  route: 'transactions',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const url = new URL(request.url);
      const pool = await getPool();
      const req = pool.request();
      let sqlText = 'SELECT * FROM dbo.transactions';
      const site = url.searchParams.get('site');
      if (site) { req.input('site', site); sqlText += ' WHERE site = @site'; }
      sqlText += ' ORDER BY ts DESC';
      const res = await req.query(sqlText);
      return json(200, res.recordset.map((r) => fromDb('transactions', r)));
    } catch (e) {
      ctx.error('[transactions] list error', e);
      return json(500, { error: e.message });
    }
  },
});
