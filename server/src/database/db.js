const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let dbInstance = null;
let SQL = null;
const dbFilePath = path.join(__dirname, '../../../peer_buddy.db');

async function getDB() {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
    persistDB();
  }

  return dbInstance;
}

function persistDB() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbFilePath, buffer);
}

// Universal query helper
async function query(sql, params = []) {
  const db = await getDB();
  
  // Convert parameterized placeholders $1, $2 or ? to sql.js compatible
  // If query uses $1, $2, replace with ?
  let normalizedSql = sql.replace(/\$(\d+)/g, '?');

  const trimmed = normalizedSql.trim().toUpperCase();
  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA');

  try {
    if (isSelect) {
      const stmt = db.prepare(normalizedSql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows, rowCount: rows.length };
    } else {
      // Execute INSERT / UPDATE / DELETE
      db.run(normalizedSql, params);
      persistDB();
      return { rows: [], rowCount: db.getRowsModified() };
    }
  } catch (err) {
    console.error('SQL Execution Error:', err.message, 'in SQL:', normalizedSql, 'params:', params);
    throw err;
  }
}

async function exec(sql) {
  const db = await getDB();
  db.exec(sql);
  persistDB();
}

module.exports = {
  getDB,
  query,
  exec,
  persistDB
};
