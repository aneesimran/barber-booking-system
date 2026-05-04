import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore database instance
const db = getFirestore(app);

export { app, db };
