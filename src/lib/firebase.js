import { initializeApp, getApps } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Firebase configuration — all values read from environment variables.
 * Copy .env.local.example to .env.local and fill in your Firebase project credentials.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialise Firebase (prevent re-initialisation in dev with HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore database instance with long polling to fix hanging in API routes
let db;
try {
  console.log("[Firebase] Initializing Firestore with experimentalForceLongPolling: true...");
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
  console.log("[Firebase] Firestore initialized successfully with long polling!");
} catch (err) {
  console.log("[Firebase] Firestore initialization failed/already done, getting current instance. Error:", err.message);
  db = getFirestore(app);
}

// Auth instance
const auth = getAuth(app);

export { app, db, auth };
