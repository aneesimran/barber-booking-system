#!/usr/bin/env node

/**
 * Firestore Restore Script
 * Safely restores Firestore collections from a backup directory or full-backup.json.
 * Features:
 *   --dry-run: Previews changes without writing to Firestore
 *   --yes: Bypasses interactive confirmation prompt
 * Usage:
 *   npm run restore:firestore -- --dry-run
 *   npm run restore:firestore backups/firestore/latest/full-backup.json
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, writeBatch, Timestamp } from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUPS_DIR = path.join(ROOT_DIR, "backups", "firestore");

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

// Reconstruct native Firestore types from serialized JSON
export function deserializeFirestoreData(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "object") {
    if (val._type === "Timestamp") {
      if (val.seconds !== undefined && val.nanoseconds !== undefined) {
        return new Timestamp(val.seconds, val.nanoseconds);
      }
      if (val.iso) {
        return Timestamp.fromDate(new Date(val.iso));
      }
    }
    if (Array.isArray(val)) {
      return val.map((item) => deserializeFirestoreData(item));
    }
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = deserializeFirestoreData(v);
    }
    return result;
  }
  return val;
}

export function loadBackupPayload(targetPath) {
  let resolvedPath = targetPath;
  if (!resolvedPath) {
    resolvedPath = path.join(BACKUPS_DIR, "latest", "full-backup.json");
  } else if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(ROOT_DIR, resolvedPath);
  }

  // If path is a directory, look for full-backup.json or individual collections
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    const fullBackupFile = path.join(resolvedPath, "full-backup.json");
    if (fs.existsSync(fullBackupFile)) {
      resolvedPath = fullBackupFile;
    } else {
      // Build bundle from individual json files
      const bundle = { metadata: { collections: {} }, collections: {} };
      const files = fs.readdirSync(resolvedPath);
      for (const file of files) {
        if (file.endsWith(".json") && file !== "metadata.json") {
          const colName = file.replace(/\.json$/, "");
          const content = JSON.parse(fs.readFileSync(path.join(resolvedPath, file), "utf-8"));
          bundle.collections[colName] = content;
          bundle.metadata.collections[colName] = Object.keys(content).length;
        }
      }
      return bundle;
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Backup file not found at: ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
}

export async function restoreFirestore(payload, options = {}) {
  const isDryRun = Boolean(options.dryRun);
  const db = getDb();
  const collections = payload.collections || {};
  const collectionNames = Object.keys(collections);

  console.log("\n========================================================");
  console.log(isDryRun ? "🔍  FIRESTORE RESTORE (DRY RUN PREVIEW)" : "🚨  EXECUTING FIRESTORE RESTORE");
  console.log(`🎯  Target Project: ${firebaseConfig.projectId}`);
  console.log("========================================================");

  let totalDocsToRestore = 0;
  for (const col of collectionNames) {
    const count = Object.keys(collections[col]).length;
    totalDocsToRestore += count;
    console.log(`  • ${col.padEnd(20)}: ${count} documents`);
  }
  console.log(`  Total: ${totalDocsToRestore} documents across ${collectionNames.length} collections.\n`);

  if (isDryRun) {
    console.log("✅ Dry run complete. No data was modified in Cloud Firestore.");
    return { success: true, dryRun: true, totalDocsToRestore };
  }

  const startTime = Date.now();
  let totalRestored = 0;

  for (const colName of collectionNames) {
    const docsObj = collections[colName];
    const docIds = Object.keys(docsObj);
    if (docIds.length === 0) continue;

    console.log(`⏳ Restoring collection: "${colName}" (${docIds.length} docs)...`);

    // Firestore batch limit is 500; use batches of 400
    const BATCH_SIZE = 400;
    for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
      const chunk = docIds.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const id of chunk) {
        const rawData = docsObj[id];
        const deserializedData = deserializeFirestoreData(rawData);
        const docRef = doc(db, colName, id);
        batch.set(docRef, deserializedData, { merge: true });
      }

      await batch.commit();
      totalRestored += chunk.length;
      console.log(`  ✓ Restored ${totalRestored} / ${totalDocsToRestore} docs...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n========================================================");
  console.log("✅  FIRESTORE RESTORATION COMPLETED SUCCESSFULLY!");
  console.log(`📊  Restored ${totalRestored} documents in ${durationSec}s.`);
  console.log("========================================================\n");

  return { success: true, dryRun: false, totalRestored };
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const bypassConfirm = args.includes("--yes") || args.includes("-y");
  const targetPath = args.find((a) => !a.startsWith("-"));

  let payload;
  try {
    payload = loadBackupPayload(targetPath);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  if (isDryRun) {
    await restoreFirestore(payload, { dryRun: true });
    return;
  }

  if (!bypassConfirm) {
    console.log("\n⚠️  WARNING: Restoring will overwrite existing documents in Cloud Firestore with the backup data.");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Type "RESTORE" to confirm: ', async (ans) => {
      rl.close();
      if (ans.trim() !== "RESTORE") {
        console.log("Restoration aborted.");
        process.exit(0);
      }
      try {
        await restoreFirestore(payload, { dryRun: false });
      } catch (err) {
        console.error("Restore failed:", err);
        process.exit(1);
      }
    });
  } else {
    await restoreFirestore(payload, { dryRun: false });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
