const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pgPool = null;
let sqlJsDB = null;
let SQL = null;
const dbFilePath = path.join(__dirname, '../../../peer_buddy.db');

// Check if PostgreSQL (Supabase or Render PG) is configured
function isPostgresConfigured() {
  return Boolean(
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD)
  );
}

// PostgreSQL Connection Pool Setup
function getPgPool() {
  if (pgPool) return pgPool;

  const connectionString = process.env.DATABASE_URL;
  const poolConfig = connectionString
    ? {
        connectionString,
        // Supabase / Render PG requires SSL with rejectUnauthorized: false when self-signed/proxy certs are used
        ssl: { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 20000,
        statement_timeout: 30000
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'peer_buddy',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      };

  pgPool = new Pool(poolConfig);

  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client pool:', err.message);
  });

  return pgPool;
}

// Fallback SQLite / sql.js Database instance for local testing
async function getSqlJsDB() {
  if (sqlJsDB) return sqlJsDB;

  if (!SQL) {
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
  }

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    sqlJsDB = new SQL.Database(fileBuffer);
  } else {
    sqlJsDB = new SQL.Database();
    persistSqlJs();
  }

  return sqlJsDB;
}

function persistSqlJs() {
  if (!sqlJsDB) return;
  const data = sqlJsDB.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbFilePath, buffer);
}

// Helper to convert queries between ? placeholders (SQLite) and $1, $2 (PostgreSQL)
function convertPlaceholdersToPg(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

function normalizeSqlForEngine(sql, isPg) {
  let res = sql;
  if (isPg) {
    // Convert ? to $1, $2, ...
    res = convertPlaceholdersToPg(res);
    // Replace SQLite datetime('now') with CURRENT_TIMESTAMP
    res = res.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    // Replace SQLite double-quoted literals like "student" with 'student' where needed in standard queries
    res = res.replace(/="([^"]+)"/g, "='$1'");
    res = res.replace(/!= "([^"]+)"/g, "!= '$1'");
    res = res.replace(/IN \("([^"]+)"/g, "IN ('$1'");
    res = res.replace(/, "([^"]+)"\)/g, ", '$1')");
  } else {
    // Convert $1, $2 to ? for sql.js
    res = res.replace(/\$(\d+)/g, '?');
    // Replace CURRENT_TIMESTAMP with datetime('now') if needed
    res = res.replace(/CURRENT_TIMESTAMP/gi, "datetime('now')");
  }
  return res;
}

// Universal query function compatible with both PostgreSQL and SQLite
async function query(sql, params = []) {
  if (isPostgresConfigured()) {
    const pool = getPgPool();
    const normalized = normalizeSqlForEngine(sql, true);
    try {
      const res = await pool.query(normalized, params);
      return {
        rows: res.rows || [],
        rowCount: res.rowCount || 0
      };
    } catch (err) {
      console.error('PostgreSQL Query Error:', err.message, 'in SQL:', normalized, 'params:', params);
      throw err;
    }
  } else {
    const db = await getSqlJsDB();
    const normalized = normalizeSqlForEngine(sql, false);
    const trimmed = normalized.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA');

    try {
      if (isSelect) {
        const stmt = db.prepare(normalized);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return { rows, rowCount: rows.length };
      } else {
        db.run(normalized, params);
        persistSqlJs();
        return { rows: [], rowCount: db.getRowsModified() };
      }
    } catch (err) {
      console.error('SQLite Query Error:', err.message, 'in SQL:', normalized, 'params:', params);
      throw err;
    }
  }
}

// Universal exec for schema/DDL
async function exec(sql) {
  if (isPostgresConfigured()) {
    const pool = getPgPool();
    const normalized = normalizeSqlForEngine(sql, true);
    await pool.query(normalized);
  } else {
    const db = await getSqlJsDB();
    const normalized = normalizeSqlForEngine(sql, false);
    db.exec(normalized);
    persistSqlJs();
  }
}

// Transaction helper executing a callback with a dedicated client
async function withTransaction(callback) {
  if (isPostgresConfigured()) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txQuery = async (sql, params = []) => {
        const normalized = normalizeSqlForEngine(sql, true);
        const res = await client.query(normalized, params);
        return {
          rows: res.rows || [],
          rowCount: res.rowCount || 0
        };
      };
      const result = await callback(txQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // For local development sql.js (in-memory WebAssembly SQLite), operations execute atomically in memory
    try {
      const result = await callback(query);
      persistSqlJs();
      return result;
    } catch (err) {
      throw err;
    }
  }
}

// Graceful pool shutdown
async function closePool() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

module.exports = {
  isPostgresConfigured,
  getPgPool,
  getDB: getSqlJsDB,
  query,
  exec,
  withTransaction,
  closePool,
  persistDB: persistSqlJs
};
