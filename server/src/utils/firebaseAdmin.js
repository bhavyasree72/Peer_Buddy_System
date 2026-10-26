const admin = require('firebase-admin');

let firebaseApp = null;

function initializeFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  // Option 1: FIREBASE_SERVICE_ACCOUNT_JSON env var (JSON string)
  // Option 2: GOOGLE_APPLICATION_CREDENTIALS env var (path to JSON file — auto-detected by SDK)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
      });
    } catch (err) {
      console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
      throw err;
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // SDK auto-discovers the service account file
    firebaseApp = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID || 'seproject-feefe'}.firebasestorage.app`
    });
  } else {
    console.warn('[Firebase Admin] No credentials configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
    // Initialize without credentials for development (will fail on actual Firestore/Auth calls)
    try {
      firebaseApp = admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'seproject-feefe'
      });
    } catch (e) {
      // Already initialized
      firebaseApp = admin.app();
    }
  }

  console.log('[Firebase Admin] Initialized for project:', firebaseApp.options.projectId || 'unknown');
  return firebaseApp;
}

// Lazy getters
function getFirestore() {
  initializeFirebaseAdmin();
  return admin.firestore();
}

function getAuth() {
  initializeFirebaseAdmin();
  return admin.auth();
}

function getStorage() {
  initializeFirebaseAdmin();
  return admin.storage();
}

module.exports = {
  initializeFirebaseAdmin,
  getFirestore,
  getAuth: getAuth,
  getStorage,
  admin
};
