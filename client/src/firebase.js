// Firebase Client SDK initialization
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA1S-nmVIn6cvdL2kZ4qFzl4fe9oZFHS4U",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "seproject-feefe.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "seproject-feefe",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "seproject-feefe.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "485893318608",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:485893318608:web:7fbc555090e5dbed52bbd5",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-BE8JKTQG29"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase Auth (local persistence ensures session persists across page reloads and reopened tabs)
export const auth = getAuth(app);
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Firebase Auth] Local persistence warning:', err);
  });
}

// Firestore (for future client-side listeners / offline access)
export const db = getFirestore(app);

// Firebase Storage (for client uploads)
export const storage = getStorage(app);

// Analytics (safely initialized in browser environments)
export let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export default app;
