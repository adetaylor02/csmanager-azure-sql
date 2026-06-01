const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) };
}

// GET    /api/user-roles?user_id=<uuid>     -> list role rows (optionally filtered)
// POST   /api/user-roles                    -> { user_id, role }
// DELETE /api/user-roles?user_id=&role=     -> delete a specific (user_id, role) pair
app.http('user-roles-collection', {
  route: 'user-roles',
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const pool = await getPool();
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id');
      const role = url.searchParams.get('role');

      if (request.method === 'GET') {
        const req = pool.request();
        let sqlText = 'SELECT id, user_id, role FROM dbo.user_roles';
        if (userId) { req.input('uid', sql.UniqueIdentifier, userId); sqlText += ' WHERE user_id = @uid'; }
        const res = await req.query(sqlText);
        return json(200, res.recordset);
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const res = await pool.request()
          .input('uid', sql.UniqueIdentifier, body.user_id)
          .input('role', sql.NVarChar(40), body.role)
          .query(`INSERT INTO dbo.user_roles(user_id, role)
                  OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.role
                  VALUES (@uid, @role)`);
        return json(201, res.recordset[0]);
      }
      // DELETE
      if (!userId) return json(400, { error: 'user_id is required' });
      const req = pool.request().input('uid', sql.UniqueIdentifier, userId);
      let sqlText = 'DELETE FROM dbo.user_roles WHERE user_id = @uid';
      if (role) { req.input('role', sql.NVarChar(40), role); sqlText += ' AND role = @role'; }
      await req.query(sqlText);
      return json(204, null);
    } catch (e) {
      ctx.error('[user-roles] error', e);
      return json(500, { error: e.message });
    }
  },
});

// DELETE /api/user-roles/by-user/{userId}   -> delete all roles for a user (replace flow)
app.http('user-roles-by-user', {
  route: 'user-roles/by-user/{userId}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const pool = await getPool();
      await pool.request()
        .input('uid', sql.UniqueIdentifier, request.params.userId)
        .query('DELETE FROM dbo.user_roles WHERE user_id = @uid');
      return json(204, null);
    } catch (e) {
      ctx.error('[user-roles/by-user] error', e);
      return json(500, { error: e.message });
    }
  },
});
