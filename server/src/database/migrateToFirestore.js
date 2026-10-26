/**
 * Migrate PostgreSQL / SQLite Database Data to Cloud Firestore
 *
 * Reads existing records from PostgreSQL (DATABASE_URL) or local SQLite (peer_buddy.db)
 * and batches them into Firestore collections with their corresponding primary keys.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
// pg and sql.js are optional sources for historical data import only
const { getFirestore } = require('../utils/firebaseAdmin');

const TABLE_PRIMARY_KEYS = {
  users: 'user_id',
  student_profiles: 'user_id',
  staff_profiles: 'user_id',
  schools: 'id',
  programs: 'id',
  skills: 'skill_id',
  user_skills: 'id',
  interests: 'interest_id',
  user_interests: 'id',
  availability: 'availability_id',
  buddy_requests: 'request_id',
  mentor_reviews: 'review_id',
  connections: 'connection_id',
  messages: 'message_id',
  study_sessions: 'session_id',
  session_attendance: 'id',
  reviews: 'review_id',
  resources: 'resource_id',
  resource_allocations: 'allocation_id',
  notifications: 'notification_id',
  reports: 'report_id',
  audit_log: 'log_id',
  settings: 'key',
  password_resets: 'token',
  email_verifications: 'token',
  guidance_messages: 'guidance_id'
};

const TABLE_ORDER = Object.keys(TABLE_PRIMARY_KEYS);

async function migrateData() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log('====================================================');
  console.log(` Cloud Firestore Data Migration`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (Validation only)' : 'LIVE MIGRATION'}`);
  console.log('====================================================');

  const db = getFirestore();
  let sourceRecords = {};

  // Try PostgreSQL source first
  if (process.env.DATABASE_URL) {
    console.log('[Migrate] Connecting to PostgreSQL source...');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      const client = await pool.connect();
      console.log('[Migrate] ✓ Connected to PostgreSQL.');

      for (const table of TABLE_ORDER) {
        try {
          const res = await client.query(`SELECT * FROM ${table}`);
          sourceRecords[table] = res.rows;
          console.log(`[Source PG] ${table}: ${res.rows.length} rows`);
        } catch (tableErr) {
          sourceRecords[table] = [];
        }
      }
      client.release();
      await pool.end();
    } catch (pgErr) {
      console.warn('[Migrate] PostgreSQL connection failed:', pgErr.message);
    }
  }

  // Fallback to SQLite if PostgreSQL gave no records
  const totalPgRows = Object.values(sourceRecords).reduce((acc, rows) => acc + rows.length, 0);
  const sqliteFilePath = path.resolve(__dirname, '../../../peer_buddy.db');

  if (totalPgRows === 0 && fs.existsSync(sqliteFilePath)) {
    console.log('[Migrate] Reading from local SQLite database:', sqliteFilePath);
    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(sqliteFilePath);
      const sqlDb = new SQL.Database(fileBuffer);

      for (const table of TABLE_ORDER) {
        try {
          const stmt = sqlDb.prepare(`SELECT * FROM ${table}`);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          sourceRecords[table] = rows;
          console.log(`[Source SQLite] ${table}: ${rows.length} rows`);
        } catch (sqliteErr) {
          sourceRecords[table] = [];
        }
      }
      sqlDb.close();
    } catch (err) {
      console.warn('[Migrate] SQLite read failed:', err.message);
    }
  }

  if (isDryRun) {
    console.log('\n[Dry-Run Complete] Source data summary above. No writes made to Firestore.');
    return;
  }

  // Write to Firestore in batches (max 500 per batch)
  console.log('\n[Migrate] Writing to Cloud Firestore...');
  let totalMigrated = 0;

  for (const table of TABLE_ORDER) {
    const rows = sourceRecords[table] || [];
    if (rows.length === 0) continue;

    const pkField = TABLE_PRIMARY_KEYS[table];
    const colRef = db.collection(table);

    // Process in chunks of 400
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const batch = db.batch();

      for (const row of chunk) {
        const docId = String(row[pkField] || row.id || row.key || Math.random().toString(36).substring(2));
        const docRef = colRef.doc(docId);
        batch.set(docRef, { ...row }, { merge: true });
      }

      await batch.commit();
      totalMigrated += chunk.length;
    }
    console.log(`[Migrate] ✓ ${table}: ${rows.length} documents written to Firestore.`);
  }

  console.log(`\n====================================================`);
  console.log(`✓ Migration to Cloud Firestore completed successfully!`);
  console.log(`Total documents written: ${totalMigrated}`);
  console.log(`====================================================`);
}

if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrateData;
