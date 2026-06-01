const sql = require('mssql');

let poolPromise = null;

function getConfig() {
  const cs = process.env.SQL_CONNECTION_STRING;
  if (!cs) throw new Error('SQL_CONNECTION_STRING is not configured');
  // mssql accepts the ADO.NET-style connection string directly
  return cs;
}

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(getConfig()).catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function query(text, params = {}) {
  const pool = await getPool();
  const req = pool.request();
  for (const [name, value] of Object.entries(params)) {
    req.input(name, value);
  }
  return req.query(text);
}

module.exports = { sql, getPool, query };
