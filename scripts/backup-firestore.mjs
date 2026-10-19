#!/usr/bin/env node

/**
 * Firestore Backup Script
 * Exports all Firestore collections (appointments, customers, barberSchedules, blockedSlots, dateSchedules)
 * into a timestamped directory and updates backups/firestore/latest.
 * Usage:
 *   npm run backup:firestore
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUPS_DIR = path.join(ROOT_DIR, "backups", "firestore");

// 1. Load environment variables from .env.local
function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnv();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getDb() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  return getFirestore(app);
}

// Convert Firestore field values to serializable JSON while preserving Timestamps
export function serializeFirestoreData(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "object") {
    // Check for Firestore Timestamp
    if (typeof val.toDate === "function" || (val.seconds !== undefined && val.nanoseconds !== undefined)) {
      const iso = typeof val.toDate === "function" ? val.toDate().toISOString() : new Date(val.seconds * 1000).toISOString();
      return {
        _type: "Timestamp",
        seconds: val.seconds,
        nanoseconds: val.nanoseconds || 0,
        iso,
      };
    }
    if (Array.isArray(val)) {
      return val.map((item) => serializeFirestoreData(item));
    }
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = serializeFirestoreData(v);
    }
    return result;
  }
  return val;
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

export async function backupFirestore(options = {}) {
  const startTime = Date.now();
  console.log("⏳ Initializing Firestore backup...");

  const db = getDb();
  const collectionsToBackup = options.collections || [
    "appointments",
    "customers",
    "barberSchedules",
    "blockedSlots",
    "dateSchedules",
  ];

  const timestamp = getTimestamp();
  const backupFolder = path.join(BACKUPS_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupFolder, { recursive: true });

  const backupData = {
    metadata: {
      version: "1.0",
      timestamp: new Date().toISOString(),
      projectId: firebaseConfig.projectId || "unknown",
      totalDocuments: 0,
      collections: {},
    },
    collections: {},
  };

  console.log(`📦 Backing up ${collectionsToBackup.length} collections from project: ${firebaseConfig.projectId}...`);

  for (const colName of collectionsToBackup) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      const docs = {};

      snapshot.forEach((docSnap) => {
        docs[docSnap.id] = serializeFirestoreData(docSnap.data());
      });

      const count = Object.keys(docs).length;
      backupData.collections[colName] = docs;
      backupData.metadata.collections[colName] = count;
      backupData.metadata.totalDocuments += count;

      // Save individual collection JSON
      fs.writeFileSync(
        path.join(backupFolder, `${colName}.json`),
        JSON.stringify(docs, null, 2),
        "utf-8"
      );

      console.log(`  ✓ ${colName.padEnd(18)} : ${count} documents`);
    } catch (err) {
      console.error(`  ❌ Failed to backup collection ${colName}:`, err.message);
      backupData.metadata.collections[colName] = 0;
      backupData.collections[colName] = {};
    }
  }

  // Save metadata & consolidated full-backup.json
  fs.writeFileSync(
    path.join(backupFolder, "metadata.json"),
    JSON.stringify(backupData.metadata, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(backupFolder, "full-backup.json"),
    JSON.stringify(backupData, null, 2),
    "utf-8"
  );

  // Update latest directory
  const latestDir = path.join(BACKUPS_DIR, "latest");
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(
    path.join(latestDir, "metadata.json"),
    JSON.stringify(backupData.metadata, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(latestDir, "full-backup.json"),
    JSON.stringify(backupData, null, 2),
    "utf-8"
  );

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n========================================================");
  console.log("✅  FIRESTORE BACKUP SUCCESSFUL!");
  console.log(`📁  Location:   backups/firestore/backup-${timestamp}/`);
  console.log(`📄  Consolidated: backups/firestore/latest/full-backup.json`);
  console.log(`📊  Total Docs: ${backupData.metadata.totalDocuments}`);
  console.log(`⏱️   Duration:   ${durationSec}s`);
  console.log("========================================================\n");

  return backupData;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  backupFirestore()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Backup failed:", err);
      process.exit(1);
    });
}
