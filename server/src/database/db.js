/**
 * Database Abstraction Layer — Firebase Firestore Edition
 * 
 * This replaces the original PostgreSQL / SQLite dual-mode db.js.
 * Now all data lives in Cloud Firestore.
 *
 * Controllers call Firestore helpers from firestoreDb.js directly.
 * This module re-exports them and provides backward-compatible stubs
 * for any legacy code that still calls query()/exec()/withTransaction().
 */

const fdb = require('./firestoreDb');

// Re-export everything from firestoreDb for controllers
module.exports = {
  // Firestore helpers (new API — controllers should migrate to these)
  ...fdb,

  // Legacy stubs for any code that hasn't been migrated yet
  // These will throw clear errors if accidentally called with SQL
  query: async function(sql, params = []) {
    console.error('[DB LEGACY] Raw SQL query() called — this should be migrated to Firestore helpers.');
    console.error('[DB LEGACY] SQL:', sql);
    throw new Error('Legacy SQL query() is no longer supported. Use Firestore helpers from firestoreDb.js.');
  },

  exec: async function(sql) {
    // No-op for Firestore (no DDL needed — collections are auto-created)
    console.log('[DB] exec() called (no-op in Firestore mode)');
  },

  withTransaction: async function(callback) {
    // Map to Firestore runTransaction
    return fdb.runTransaction(async (transaction) => {
      // Provide a txQuery stub that warns
      const txQuery = async (sql, params = []) => {
        console.error('[DB LEGACY] Transaction SQL query called — migrate to Firestore helpers.');
        throw new Error('Legacy SQL txQuery() is no longer supported.');
      };
      return callback(txQuery);
    });
  },

  // Keep these for backward compat but no-op
  isPostgresConfigured: () => false,
  getPgPool: () => null,
  getDB: () => null,
  closePool: async () => {},
  persistDB: () => {}
};
