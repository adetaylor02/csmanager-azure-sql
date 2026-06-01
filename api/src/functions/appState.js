const { app } = require('@azure/functions');
const { getPool } = require('../db');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}

// GET /api/app-state          -> { data: {...} }
// PUT /api/app-state          -> upserts the singleton JSON blob
app.http('app-state', {
  route: 'app-state',
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const pool = await getPool();
      if (request.method === 'GET') {
        const res = await pool.request().query(
          "SELECT data, updated_at FROM dbo.app_state WHERE id = 'singleton'"
        );
        const row = res.recordset[0];
        return json(200, row ? { data: JSON.parse(row.data), updated_at: row.updated_at } : { data: null });
      }
      const body = await request.json();
      const payload = JSON.stringify(body?.data ?? body ?? {});
      await pool.request()
        .input('data', payload)
        .query(`
          MERGE dbo.app_state AS t
          USING (SELECT 'singleton' AS id) AS s ON t.id = s.id
          WHEN MATCHED THEN UPDATE SET data = @data, updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (id, data) VALUES ('singleton', @data);
        `);
      return json(200, { ok: true });
    } catch (e) {
      ctx.error('[app-state] error', e);
      return json(500, { error: e.message });
    }
  },
});
