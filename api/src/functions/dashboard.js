/**
 * GET /api/dashboard/metrics?site=<site|All>
 * Server-side aggregation for the dashboard so the UI no longer scans the
 * entire store client-side.
 */
const { app } = require('@azure/functions');
const { getPool } = require('../db');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}

app.http('dashboard-metrics', {
  route: 'dashboard/metrics',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const url = new URL(request.url);
      const site = url.searchParams.get('site');
      const useSite = site && site !== 'All CHI Metro';
      const where = useSite ? 'WHERE site = @site' : '';
      const pool = await getPool();
      const mk = () => { const r = pool.request(); if (useSite) r.input('site', site); return r; };

      const [totals, low, oos, byCrit, recent, openWO, pendingPO] = await Promise.all([
        mk().query(`SELECT COUNT(*) AS total_parts, ISNULL(SUM(quantity * unit_cost),0) AS total_value
                    FROM dbo.spares ${where}`),
        mk().query(`SELECT COUNT(*) AS low_stock FROM dbo.spares ${where}${where ? ' AND' : 'WHERE'} quantity < min_stock AND quantity > 0`),
        mk().query(`SELECT COUNT(*) AS out_of_stock FROM dbo.spares ${where}${where ? ' AND' : 'WHERE'} quantity = 0`),
        mk().query(`SELECT criticality, COUNT(*) AS c FROM dbo.spares ${where} GROUP BY criticality`),
        mk().query(`SELECT TOP 10 * FROM dbo.transactions ${where} ORDER BY ts DESC`),
        mk().query(`SELECT COUNT(*) AS open_work_orders FROM dbo.work_orders ${where}${where ? ' AND' : 'WHERE'} status NOT IN ('Closed','Completed')`),
        mk().query(`SELECT COUNT(*) AS pending_reorders FROM dbo.reorders ${where}${where ? ' AND' : 'WHERE'} status = 'Pending Approval'`),
      ]);

      const criticality = {};
      for (const row of byCrit.recordset) criticality[row.criticality] = row.c;

      return json(200, {
        totalParts: totals.recordset[0].total_parts,
        totalValue: Number(totals.recordset[0].total_value || 0),
        lowStock: low.recordset[0].low_stock,
        outOfStock: oos.recordset[0].out_of_stock,
        openWorkOrders: openWO.recordset[0].open_work_orders,
        pendingReorders: pendingPO.recordset[0].pending_reorders,
        byCriticality: criticality,
        recentTransactions: recent.recordset,
      });
    } catch (e) {
      ctx.error('[dashboard/metrics] error', e);
      return json(500, { error: e.message });
    }
  },
});
