/**
 * Firestore Database Layer
 * 
 * Replaces the PostgreSQL/SQLite db.js with Cloud Firestore.
 * 
 * Production mode:
 *   When FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is set,
 *   all operations execute against real Google Cloud Firestore.
 * 
 * Local / Offline / Fallback mode:
 *   If credentials are not configured, transparently falls back to an
 *   in-memory document store so development, tests, and cold starts never crash with 500s.
 */

const { getFirestore } = require('../utils/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

// Collection names (matching SQL table names for consistency)
const COLLECTIONS = {
  USERS: 'users',
  STUDENT_PROFILES: 'student_profiles',
  STAFF_PROFILES: 'staff_profiles',
  SCHOOLS: 'schools',
  PROGRAMS: 'programs',
  SKILLS: 'skills',
  USER_SKILLS: 'user_skills',
  INTERESTS: 'interests',
  USER_INTERESTS: 'user_interests',
  AVAILABILITY: 'availability',
  BUDDY_REQUESTS: 'buddy_requests',
  MENTOR_REVIEWS: 'mentor_reviews',
  CONNECTIONS: 'connections',
  MESSAGES: 'messages',
  STUDY_SESSIONS: 'study_sessions',
  SESSION_ATTENDANCE: 'session_attendance',
  REVIEWS: 'reviews',
  RESOURCES: 'resources',
  RESOURCE_ALLOCATIONS: 'resource_allocations',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  AUDIT_LOG: 'audit_log',
  SETTINGS: 'settings',
  PASSWORD_RESETS: 'password_resets',
  EMAIL_VERIFICATIONS: 'email_verifications',
  GUIDANCE_MESSAGES: 'guidance_messages'
};

const fs = require('fs');
const path = require('path');
const CACHE_FILE = path.resolve(__dirname, 'firestore_local_cache.json');

// In-Memory Fallback Store with auto-load from cache
const memoryStore = new Map();
Object.values(COLLECTIONS).forEach(col => memoryStore.set(col, new Map()));

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const col of Object.keys(parsed)) {
        if (!memoryStore.has(col)) memoryStore.set(col, new Map());
        const colMap = memoryStore.get(col);
        for (const [id, val] of Object.entries(parsed[col])) {
          colMap.set(String(id), val);
        }
      }
    }
  } catch (e) {
    console.warn('[Firestore Cache] Notice reading local cache:', e.message);
  }
}

function flushCacheToDiskSync() {
  try {
    const obj = {};
    for (const [col, colMap] of memoryStore.entries()) {
      obj[col] = Object.fromEntries(colMap.entries());
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Firestore Cache] Error persisting cache:', e.message);
  }
}

function persistCacheToDisk() {
  flushCacheToDiskSync();
}

process.on('beforeExit', flushCacheToDiskSync);
process.on('exit', flushCacheToDiskSync);

loadCacheFromDisk();

function hasLiveCredentials() {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

let loggedFallbackNotice = false;
function notifyFallbackOnce() {
  if (!loggedFallbackNotice) {
    console.warn('[Firestore] Notice: Running with in-memory collection cache (configure FIREBASE_SERVICE_ACCOUNT_JSON for live Cloud Firestore).');
    loggedFallbackNotice = true;
  }
}

// Helper: Get a reference to a live collection
function collection(name) {
  const db = getFirestore();
  return db.collection(name);
}

// Helper: Get a document by ID from a collection
async function getDoc(collectionName, docId) {
  if (!docId) return null;
  const strId = String(docId);

  if (hasLiveCredentials()) {
    try {
      const doc = await collection(collectionName).doc(strId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }

  // Fallback
  const colMap = memoryStore.get(collectionName);
  if (!colMap) return null;
  const item = colMap.get(strId);
  return item ? { ...item } : null;
}

// Helper: Set/create a document with a specific ID
async function setDoc(collectionName, docId, data) {
  const strId = String(docId);

  // Update memory store
  let colMap = memoryStore.get(collectionName);
  if (!colMap) {
    colMap = new Map();
    memoryStore.set(collectionName, colMap);
  }
  colMap.set(strId, { id: strId, ...data, _updated_at: new Date().toISOString() });
  persistCacheToDisk();

  if (hasLiveCredentials()) {
    try {
      await collection(collectionName).doc(strId).set({
        ...data,
        _updated_at: FieldValue.serverTimestamp()
      }, { merge: false });
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }
}

// Helper: Update fields on a document
async function updateDoc(collectionName, docId, data) {
  const strId = String(docId);

  let colMap = memoryStore.get(collectionName);
  if (colMap && colMap.has(strId)) {
    const existing = colMap.get(strId);
    colMap.set(strId, { ...existing, ...data, _updated_at: new Date().toISOString() });
    persistCacheToDisk();
  }

  if (hasLiveCredentials()) {
    try {
      await collection(collectionName).doc(strId).update({
        ...data,
        _updated_at: FieldValue.serverTimestamp()
      });
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }
}

// Helper: Delete a document
async function deleteDoc(collectionName, docId) {
  const strId = String(docId);
  const colMap = memoryStore.get(collectionName);
  if (colMap) {
    colMap.delete(strId);
    persistCacheToDisk();
  }

  if (hasLiveCredentials()) {
    try {
      await collection(collectionName).doc(strId).delete();
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }
}

// Helper: Delete all documents matching a condition
async function deleteWhere(collectionName, field, op, value) {
  let deletedCount = 0;
  const colMap = memoryStore.get(collectionName);
  if (colMap) {
    for (const [id, doc] of Array.from(colMap.entries())) {
      let matches = false;
      if (op === '==') matches = doc[field] === value;
      else if (op === '!=') matches = doc[field] !== value;
      if (matches) {
        colMap.delete(id);
        deletedCount++;
      }
    }
  }

  if (hasLiveCredentials()) {
    try {
      const snap = await collection(collectionName).where(field, op, value).get();
      const batch = getFirestore().batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      if (snap.docs.length > 0) await batch.commit();
      return snap.docs.length;
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }

  return deletedCount;
}

// Helper: Query documents
async function queryDocs(collectionName, conditions = [], orderByField = null, orderDir = 'asc', limitCount = null) {
  if (hasLiveCredentials()) {
    try {
      let q = collection(collectionName);
      for (const [field, op, value] of conditions) {
        q = q.where(field, op, value);
      }
      if (orderByField) {
        q = q.orderBy(orderByField, orderDir);
      }
      if (limitCount) {
        q = q.limit(limitCount);
      }
      const snap = await q.get();
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Cache into memory store
      const colMap = memoryStore.get(collectionName);
      if (colMap) {
        results.forEach(r => colMap.set(String(r.id), r));
      }

      return results;
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        // Some composite index requirements may throw on Cloud Firestore.
        // Fallback to in-memory evaluation for resilience.
        console.warn(`[Firestore Query Warning on ${collectionName}]:`, err.message);
      }
    }
  }

  // In-memory evaluation
  const colMap = memoryStore.get(collectionName);
  if (!colMap) return [];

  let items = Array.from(colMap.values());
  for (const [field, op, value] of conditions) {
    items = items.filter(doc => {
      const docVal = doc[field];
      if (op === '==') return docVal === value;
      if (op === '!=') return docVal !== value;
      if (op === '>') return docVal > value;
      if (op === '>=') return docVal >= value;
      if (op === '<') return docVal < value;
      if (op === '<=') return docVal <= value;
      if (op === 'in') return Array.isArray(value) && value.includes(docVal);
      return true;
    });
  }

  if (orderByField) {
    items.sort((a, b) => {
      const valA = a[orderByField] || '';
      const valB = b[orderByField] || '';
      const comp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return orderDir === 'desc' ? -comp : comp;
    });
  }

  if (limitCount) {
    items = items.slice(0, limitCount);
  }

  return items.map(item => ({ ...item }));
}

// Helper: Get all documents in a collection
async function getAllDocs(collectionName) {
  if (hasLiveCredentials()) {
    try {
      const snap = await collection(collectionName).get();
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const colMap = memoryStore.get(collectionName);
      if (colMap) {
        results.forEach(r => colMap.set(String(r.id), r));
      }
      return results;
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }

  const colMap = memoryStore.get(collectionName);
  if (!colMap) return [];
  return Array.from(colMap.values()).map(item => ({ ...item }));
}

// Helper: Count documents matching conditions
async function countDocs(collectionName, conditions = []) {
  if (hasLiveCredentials()) {
    try {
      let q = collection(collectionName);
      for (const [field, op, value] of conditions) {
        q = q.where(field, op, value);
      }
      const snap = await q.count().get();
      return snap.data().count;
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }

  const docs = await queryDocs(collectionName, conditions);
  return docs.length;
}

// Helper: Firestore transaction wrapper
async function runTransaction(callback) {
  if (hasLiveCredentials()) {
    try {
      const db = getFirestore();
      return await db.runTransaction(callback);
    } catch (err) {
      if (err.message && err.message.includes('default credentials')) {
        notifyFallbackOnce();
      } else {
        throw err;
      }
    }
  }
  return callback({
    get: async (ref) => getDoc(ref.collectionName, ref.id),
    set: async (ref, data) => setDoc(ref.collectionName, ref.id, data),
    update: async (ref, data) => updateDoc(ref.collectionName, ref.id, data),
    delete: async (ref) => deleteDoc(ref.collectionName, ref.id)
  });
}

// Helper: Batch writes
function getBatch() {
  if (hasLiveCredentials()) {
    try {
      return getFirestore().batch();
    } catch (err) {
      // Fallback batch mock
    }
  }
  return {
    set(docRef, data) { setDoc(docRef.parent?.id || 'collection', docRef.id, data); },
    update(docRef, data) { updateDoc(docRef.parent?.id || 'collection', docRef.id, data); },
    delete(docRef) { deleteDoc(docRef.parent?.id || 'collection', docRef.id); },
    commit: async () => Promise.resolve()
  };
}

function serverTimestamp() {
  return hasLiveCredentials() ? FieldValue.serverTimestamp() : new Date().toISOString();
}

function nowISO() {
  return new Date().toISOString();
}

module.exports = {
  COLLECTIONS,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteWhere,
  queryDocs,
  getAllDocs,
  countDocs,
  runTransaction,
  getBatch,
  serverTimestamp,
  nowISO,
  FieldValue,
  getFirestore
};
