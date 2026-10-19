import { collection, getDocs, doc, setDoc, deleteDoc, query, where, getFirestore, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

const COLLECTIONS = [
  "appointments",
  "customers",
  "barberSchedules",
  "blockedSlots",
  "dateSchedules",
];

function serializeData(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "object") {
    if (typeof val.toDate === "function" || (val.seconds !== undefined && val.nanoseconds !== undefined)) {
      return {
        _type: "Timestamp",
        seconds: val.seconds,
        nanoseconds: val.nanoseconds || 0,
        iso: typeof val.toDate === "function" ? val.toDate().toISOString() : new Date(val.seconds * 1000).toISOString(),
      };
    }
    if (Array.isArray(val)) {
      return val.map(serializeData);
    }
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeData(v);
    }
    return res;
  }
  return val;
}

/**
 * Execute a complete Firestore database snapshot and store it in _system_backups
 */
async function performBackupSnapshot() {
  const backupId = `backup-${Date.now()}`;
  const backupData = {
    collections: {},
    metadata: {
      timestamp: new Date().toISOString(),
      totalDocuments: 0,
      collections: {},
    },
  };

  for (const colName of COLLECTIONS) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      const docs = {};

      snapshot.forEach((docSnap) => {
        docs[docSnap.id] = serializeData(docSnap.data());
      });

      const count = Object.keys(docs).length;
      backupData.collections[colName] = docs;
      backupData.metadata.collections[colName] = count;
      backupData.metadata.totalDocuments += count;
    } catch (err) {
      console.error(`[Auto-Backup] Failed to read collection ${colName}:`, err);
      backupData.collections[colName] = {};
      backupData.metadata.collections[colName] = 0;
    }
  }

  // Store snapshot in _system_backups
  const backupDocRef = doc(db, "_system_backups", backupId);
  await setDoc(backupDocRef, {
    backupId,
    createdAt: new Date().toISOString(),
    totalDocuments: backupData.metadata.totalDocuments,
    collectionCounts: backupData.metadata.collections,
    // Store stringified JSON payload to avoid nested map depth issues
    payloadJson: JSON.stringify(backupData.collections),
  });

  // Prune backups older than 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const systemBackupsRef = collection(db, "_system_backups");
    const oldQuery = query(systemBackupsRef, where("createdAt", "<", thirtyDaysAgo));
    const oldSnaps = await getDocs(oldQuery);
    for (const oldDoc of oldSnaps.docs) {
      await deleteDoc(oldDoc.ref);
    }
  } catch (pruneErr) {
    console.warn("[Auto-Backup] Pruning old backups failed non-critically:", pruneErr.message);
  }

  return {
    backupId,
    timestamp: backupData.metadata.timestamp,
    totalDocuments: backupData.metadata.totalDocuments,
    collections: backupData.metadata.collections,
  };
}

/**
 * GET /api/cron/backup-database?secret=YOUR_CRON_SECRET
 * Automated nightly endpoint for Cloud Scheduler / App Hosting cron.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET || "temp_secret";

    if (secret !== cronSecret) {
      return Response.json(
        { error: "Unauthorized: Invalid cron secret" },
        { status: 401 }
      );
    }

    const result = await performBackupSnapshot();
    return Response.json({
      success: true,
      message: "Automated cloud backup completed successfully",
      ...result,
    });
  } catch (error) {
    console.error("[Auto-Backup] Cron error:", error);
    return Response.json(
      { error: error.message || "Failed to execute automated backup" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/backup-database
 * Allows verified admin users or authenticated service calls to trigger a backup.
 */
export async function POST(request) {
  try {
    // 1. Check for cron secret or admin authorization
    const authHeader = request.headers.get("authorization");
    let isAuthorized = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const cronSecret = process.env.CRON_SECRET || "temp_secret";
      
      if (token === cronSecret) {
        isAuthorized = true;
      } else {
        // Verify Firebase Auth ID token
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
        const authRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: token }),
          }
        );

        if (authRes.ok) {
          const authData = await authRes.json();
          const email = authData.users?.[0]?.email;
          const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
            .split(",")
            .map((e) => e.trim().toLowerCase());

          if (email && adminEmails.includes(email.toLowerCase())) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      return Response.json(
        { error: "Unauthorized: Administrator credentials required" },
        { status: 401 }
      );
    }

    const result = await performBackupSnapshot();
    return Response.json({
      success: true,
      message: "Cloud database snapshot created successfully",
      ...result,
    });
  } catch (error) {
    console.error("[Auto-Backup] Trigger error:", error);
    return Response.json(
      { error: error.message || "Failed to trigger cloud backup" },
      { status: 500 }
    );
  }
}
