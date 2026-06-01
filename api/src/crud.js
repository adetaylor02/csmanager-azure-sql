const { app } = require('@azure/functions');
const { getPool } = require('./db');
const TABLES = require('./tables');
const { fromDb, toDb } = require('./mapping');

function jsonResponse(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: body == null ? '' : JSON.stringify(body),
  };
}

function quoteIdent(name) {
  return '[' + String(name).replace(/]/g, ']]') + ']';
}

function pickColumns(meta, payload) {
  const out = {};
  for (const c of meta.columns) {
    if (payload[c] !== undefined) out[c] = payload[c];
  }
  return out;
}

async function listAll(resource, meta, query) {
  const pool = await getPool();
  const req = pool.request();
  let sqlText = `SELECT * FROM ${meta.table}`;
  const where = [];
  if (query.site && meta.columns.includes('site')) {
    req.input('site', query.site);
    where.push('site = @site');
  }
  if (where.length) sqlText += ' WHERE ' + where.join(' AND ');
  sqlText += ` ORDER BY ${quoteIdent(meta.pk)}`;
  const res = await req.query(sqlText);
  return res.recordset.map((r) => fromDb(resource, r));
}

async function getOne(resource, meta, id) {
  const pool = await getPool();
  const res = await pool.request()
    .input('id', id)
    .query(`SELECT TOP 1 * FROM ${meta.table} WHERE ${quoteIdent(meta.pk)} = @id`);
  return res.recordset[0] ? fromDb(resource, res.recordset[0]) : null;
}

async function insertOne(resource, meta, payloadUi) {
  const payload = toDb(resource, payloadUi);
  const data = pickColumns(meta, payload);
  if (data[meta.pk] === undefined || data[meta.pk] === null || data[meta.pk] === '') {
    data[meta.pk] = (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID());
  }
  const cols = Object.keys(data);
  const pool = await getPool();
  const req = pool.request();
  cols.forEach((c, i) => req.input('p' + i, data[c]));
  const sqlText = `INSERT INTO ${meta.table} (${cols.map(quoteIdent).join(',')})
    OUTPUT INSERTED.* VALUES (${cols.map((_, i) => '@p' + i).join(',')})`;
  const res = await req.query(sqlText);
  return fromDb(resource, res.recordset[0]);
}

async function updateOne(resource, meta, id, payloadUi) {
  const payload = toDb(resource, payloadUi);
  const data = pickColumns(meta, payload);
  delete data[meta.pk];
  const cols = Object.keys(data);
  if (!cols.length) return getOne(resource, meta, id);
  const pool = await getPool();
  const req = pool.request().input('id', id);
  cols.forEach((c, i) => req.input('p' + i, data[c]));
  const sqlText = `UPDATE ${meta.table} SET ${cols.map((c, i) => `${quoteIdent(c)} = @p${i}`).join(',')}
    OUTPUT INSERTED.* WHERE ${quoteIdent(meta.pk)} = @id`;
  const res = await req.query(sqlText);
  return res.recordset[0] ? fromDb(resource, res.recordset[0]) : null;
}

async function deleteOne(meta, id) {
  const pool = await getPool();
  const res = await pool.request()
    .input('id', id)
    .query(`DELETE FROM ${meta.table} WHERE ${quoteIdent(meta.pk)} = @id`);
  return res.rowsAffected[0] > 0;
}

function registerCrud(resource, options = {}) {
  const meta = TABLES[resource];
  if (!meta) throw new Error('Unknown resource ' + resource);

  // Allow specialized handlers (transactions, notifications) to own the
  // collection-level GET while the generic CRUD still serves POST.
  const collectionMethods = (options.skipCollectionGet ? ['POST'] : ['GET', 'POST']);

  app.http(`${resource}-collection`, {
    route: resource,
    methods: collectionMethods,
    authLevel: 'anonymous',
    handler: async (request, ctx) => {
      try {
        if (request.method === 'GET') {
          const query = Object.fromEntries(new URL(request.url).searchParams);
          const rows = await listAll(resource, meta, query);
          return jsonResponse(200, rows);
        }
        const body = await request.json();
        const row = await insertOne(resource, meta, body);
        return jsonResponse(201, row);
      } catch (e) {
        ctx.error(`[${resource}] collection error`, e);
        return jsonResponse(500, { error: e.message });
      }
    },
  });


  app.http(`${resource}-item`, {
    route: `${resource}/{id}`,
    methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
    authLevel: 'anonymous',
    handler: async (request, ctx) => {
      const id = request.params.id;
      try {
        if (request.method === 'GET') {
          const row = await getOne(resource, meta, id);
          return row ? jsonResponse(200, row) : jsonResponse(404, { error: 'Not found' });
        }
        if (request.method === 'DELETE') {
          const ok = await deleteOne(meta, id);
          return ok ? jsonResponse(204, null) : jsonResponse(404, { error: 'Not found' });
        }
        const body = await request.json();
        const row = await updateOne(resource, meta, id, body);
        return row ? jsonResponse(200, row) : jsonResponse(404, { error: 'Not found' });
      } catch (e) {
        ctx.error(`[${resource}] item error`, e);
        return jsonResponse(500, { error: e.message });
      }
    },
  });
}

module.exports = { registerCrud, jsonResponse, TABLES, listAll, getOne, insertOne, updateOne, deleteOne };
