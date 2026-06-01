const { app } = require('@azure/functions');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPool, sql } = require('../db');

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Minimal HS256 JWT signer (no external dep). Replace with a hardened lib for production.
function signJwt(payload, secret, ttlSeconds = 60 * 60 * 8) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + ttlSeconds, ...payload };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = `${b64(header)}.${b64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// POST /api/auth/login  { email, password }
app.http('auth-login', {
  route: 'auth/login',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const { email, password } = await request.json();
      if (!email || !password) return json(400, { error: 'email and password are required' });

      const pool = await getPool();
      const userRes = await pool.request()
        .input('email', sql.NVarChar(160), email)
        .query('SELECT TOP 1 id, email, display_name, password_hash, active FROM dbo.users WHERE email = @email');
      const user = userRes.recordset[0];
      if (!user || !user.active || !user.password_hash) {
        return json(401, { error: 'Invalid credentials' });
      }
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return json(401, { error: 'Invalid credentials' });

      const rolesRes = await pool.request()
        .input('uid', sql.UniqueIdentifier, user.id)
        .query('SELECT role FROM dbo.user_roles WHERE user_id = @uid');
      const roles = rolesRes.recordset.map((r) => r.role);

      const secret = process.env.JWT_SECRET || 'dev-only-not-secret';
      const token = signJwt({ sub: user.id, email: user.email, roles }, secret);

      return json(200, {
        token,
        user: { id: user.id, email: user.email, display_name: user.display_name, roles },
      });
    } catch (e) {
      ctx.error('[auth/login] error', e);
      return json(500, { error: e.message });
    }
  },
});

// POST /api/auth/register  { email, password, display_name }
app.http('auth-register', {
  route: 'auth/register',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, ctx) => {
    try {
      const { email, password, display_name } = await request.json();
      if (!email || !password) return json(400, { error: 'email and password are required' });

      const hash = await bcrypt.hash(password, 10);
      const pool = await getPool();

      const exists = await pool.request()
        .input('email', sql.NVarChar(160), email)
        .query('SELECT TOP 1 id FROM dbo.users WHERE email = @email');
      if (exists.recordset[0]) return json(409, { error: 'Email already registered' });

      const insert = await pool.request()
        .input('email', sql.NVarChar(160), email)
        .input('name', sql.NVarChar(160), display_name ?? email.split('@')[0])
        .input('hash', sql.NVarChar(255), hash)
        .query(`INSERT INTO dbo.users(email, display_name, password_hash)
                OUTPUT INSERTED.id, INSERTED.email, INSERTED.display_name
                VALUES (@email, @name, @hash)`);
      const user = insert.recordset[0];

      // First user becomes Admin, everybody else Viewer
      const count = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.users');
      const role = count.recordset[0].n === 1 ? 'Admin' : 'Viewer';
      await pool.request()
        .input('uid', sql.UniqueIdentifier, user.id)
        .input('role', sql.NVarChar(40), role)
        .query('INSERT INTO dbo.user_roles(user_id, role) VALUES (@uid, @role)');

      return json(201, { user: { ...user, roles: [role] } });
    } catch (e) {
      ctx.error('[auth/register] error', e);
      return json(500, { error: e.message });
    }
  },
});
