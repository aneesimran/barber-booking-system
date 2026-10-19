"use client";
import { useState, useEffect, useRef } from "react";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  Timestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

const COLLECTIONS = [
  "appointments",
  "customers",
  "barberSchedules",
  "blockedSlots",
  "dateSchedules",
];

function serializeForExport(val) {
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
      return val.map(serializeForExport);
    }
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeForExport(v);
    }
    return res;
  }
  return val;
}

function deserializeForImport(val) {
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
      return val.map(deserializeForImport);
    }
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = deserializeForImport(v);
    }
    return res;
  }
  return val;
}

export default function BackupsPage() {
  const [stats, setStats] = useState({
    appointments: 0,
    customers: 0,
    blockedSlots: 0,
    dateSchedules: 0,
    loading: true,
  });

  const [cloudBackups, setCloudBackups] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isTriggeringCloud, setIsTriggeringCloud] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restorePayload, setRestorePayload] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreLogs, setRestoreLogs] = useState([]);
  const fileInputRef = useRef(null);

  // 1. Fetch live database document counts
  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const counts = {};
        for (const col of COLLECTIONS) {
          const snap = await getDocs(collection(db, col));
          counts[col] = snap.size;
        }
        if (isMounted) {
          setStats({
            appointments: counts.appointments || 0,
            customers: counts.customers || 0,
            blockedSlots: counts.blockedSlots || 0,
            dateSchedules: counts.dateSchedules || 0,
            loading: false,
          });
        }
      } catch (err) {
        console.error("Failed to load stats:", err);
        if (isMounted) setStats((prev) => ({ ...prev, loading: false }));
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real-time subscription to _system_backups collection
  useEffect(() => {
    try {
      const q = query(
        collection(db, "_system_backups"),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list = [];
          snap.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          setCloudBackups(list);
          setCloudLoading(false);
        },
        (err) => {
          console.warn("Could not subscribe to _system_backups (may not exist yet):", err.message);
          setCloudLoading(false);
        }
      );
      return () => unsubscribe();
    } catch {
      setCloudLoading(false);
    }
  }, []);

  // 3. Export Live Database to JSON download
  const handleExportDatabase = async () => {
    setIsExporting(true);
    setActionMessage(null);
    try {
      const backupBundle = {
        metadata: {
          version: "1.0",
          timestamp: new Date().toISOString(),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "barber-booking-d6dd5",
          collections: {},
          totalDocuments: 0,
        },
        collections: {},
      };

      for (const colName of COLLECTIONS) {
        const snapshot = await getDocs(collection(db, colName));
        const docs = {};
        snapshot.forEach((d) => {
          docs[d.id] = serializeForExport(d.data());
        });
        const count = Object.keys(docs).length;
        backupBundle.collections[colName] = docs;
        backupBundle.metadata.collections[colName] = count;
        backupBundle.metadata.totalDocuments += count;
      }

      // Generate downloadable JSON file
      const blob = new Blob([JSON.stringify(backupBundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `barber-booking-backup-${datePart}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setActionMessage({
        type: "success",
        text: `Export complete! Downloaded ${backupBundle.metadata.totalDocuments} records across ${COLLECTIONS.length} collections.`,
      });
    } catch (err) {
      console.error("Export failed:", err);
      setActionMessage({ type: "error", text: `Export failed: ${err.message}` });
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Trigger Instant Cloud Backup
  const handleTriggerCloudBackup = async () => {
    setIsTriggeringCloud(true);
    setActionMessage(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/cron/backup-database", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger backup");
      }
      setActionMessage({
        type: "success",
        text: `Cloud snapshot created successfully! Backed up ${data.totalDocuments} documents.`,
      });
    } catch (err) {
      console.error("Trigger backup failed:", err);
      setActionMessage({ type: "error", text: err.message });
    } finally {
      setIsTriggeringCloud(false);
    }
  };

  // 5. Handle File Selection for Manual Restore
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.collections && typeof parsed === "object") {
          // If flat collections object
          setRestorePayload({ collections: parsed, metadata: { totalDocuments: 0 } });
        } else {
          setRestorePayload(parsed);
        }
        setRestoreConfirmation("");
        setRestoreLogs([]);
        setRestoreProgress(0);
        setRestoreModalOpen(true);
      } catch (err) {
        alert("Invalid JSON backup file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // 6. Handle Restore from a Cloud Backup item
  const handleRestoreFromCloudBackup = (backupItem) => {
    try {
      let collections = {};
      if (backupItem.payloadJson) {
        collections = JSON.parse(backupItem.payloadJson);
      } else if (backupItem.collections) {
        collections = backupItem.collections;
      }
      setRestorePayload({
        metadata: {
          timestamp: backupItem.createdAt,
          totalDocuments: backupItem.totalDocuments,
          collections: backupItem.collectionCounts || {},
        },
        collections,
      });
      setRestoreConfirmation("");
      setRestoreLogs([]);
      setRestoreProgress(0);
      setRestoreModalOpen(true);
    } catch (err) {
      alert("Failed to load cloud backup payload: " + err.message);
    }
  };

  // 7. Download a Cloud Backup JSON
  const handleDownloadCloudBackup = (backupItem) => {
    try {
      let collections = {};
      if (backupItem.payloadJson) {
        collections = JSON.parse(backupItem.payloadJson);
      } else if (backupItem.collections) {
        collections = backupItem.collections;
      }
      const bundle = {
        metadata: {
          version: "1.0",
          backupId: backupItem.backupId,
          timestamp: backupItem.createdAt,
          totalDocuments: backupItem.totalDocuments,
          collections: backupItem.collectionCounts,
        },
        collections,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${backupItem.backupId || "cloud-backup"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download: " + err.message);
    }
  };

  // 8. Execute Restoration
  const executeRestore = async () => {
    if (restoreConfirmation !== "RESTORE") return;
    setIsRestoring(true);
    setRestoreLogs(["🚀 Starting restoration process..."]);

    try {
      const collections = restorePayload.collections || {};
      const colNames = Object.keys(collections);
      let totalDocs = 0;
      colNames.forEach((c) => {
        totalDocs += Object.keys(collections[c] || {}).length;
      });

      let restoredCount = 0;

      for (const colName of colNames) {
        const docsObj = collections[colName] || {};
        const docIds = Object.keys(docsObj);
        if (docIds.length === 0) continue;

        setRestoreLogs((prev) => [
          ...prev,
          `Restoring collection "${colName}" (${docIds.length} records)...`,
        ]);

        const BATCH_SIZE = 400;
        for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
          const chunk = docIds.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);

          for (const id of chunk) {
            const rawData = docsObj[id];
            const deserialized = deserializeForImport(rawData);
            const docRef = doc(db, colName, id);
            batch.set(docRef, deserialized, { merge: true });
          }

          await batch.commit();
          restoredCount += chunk.length;
          const pct = Math.round((restoredCount / totalDocs) * 100);
          setRestoreProgress(pct);
        }

        setRestoreLogs((prev) => [
          ...prev,
          `✓ "${colName}" complete (${docIds.length} restored)`,
        ]);
      }

      setRestoreLogs((prev) => [
        ...prev,
        `🎉 All ${restoredCount} documents restored successfully!`,
      ]);
      setActionMessage({
        type: "success",
        text: `Restoration complete! Successfully restored ${restoredCount} documents.`,
      });
    } catch (err) {
      console.error("Restoration error:", err);
      setRestoreLogs((prev) => [
        ...prev,
        `❌ Error during restore: ${err.message}`,
      ]);
      setActionMessage({
        type: "error",
        text: `Restoration failed: ${err.message}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in text-white">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#222] pb-6">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-white mb-1"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Backups & Disaster Recovery
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Continuous Google Cloud PITR, automated daily snapshots, and one-click data protection
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportDatabase}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--gold)] text-[#0a0a0a] font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(201,168,76,0.2)] disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            {isExporting ? "Exporting..." : "Export Live Database"}
          </button>

          <button
            onClick={handleTriggerCloudBackup}
            disabled={isTriggeringCloud}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#222] hover:bg-[#2a2a2a] text-white font-medium text-sm border border-[#333] active:scale-95 transition-all disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 7 5 11"></polyline><line x1="9" y1="7" x2="9" y2="21"></line></svg>
            {isTriggeringCloud ? "Snapshotting..." : "Save Cloud Snapshot"}
          </button>

          <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] text-[var(--gold)] font-medium text-sm border border-[var(--gold)]/30 cursor-pointer active:scale-95 transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Restore Backup File
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between animate-fade-in ${
            actionMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{actionMessage.type === "success" ? "✓" : "⚠️"}</span>
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Live Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#141414] border border-[#222]">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Appointments
          </p>
          <div className="text-2xl font-bold text-white">
            {stats.loading ? "..." : stats.appointments}
          </div>
          <p className="text-[11px] text-emerald-400 mt-1">Live in Firestore</p>
        </div>
        <div className="p-5 rounded-xl bg-[#141414] border border-[#222]">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Customers
          </p>
          <div className="text-2xl font-bold text-white">
            {stats.loading ? "..." : stats.customers}
          </div>
          <p className="text-[11px] text-emerald-400 mt-1">Directory count</p>
        </div>
        <div className="p-5 rounded-xl bg-[#141414] border border-[#222]">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Blocked Slots
          </p>
          <div className="text-2xl font-bold text-white">
            {stats.loading ? "..." : stats.blockedSlots}
          </div>
          <p className="text-[11px] text-yellow-400/80 mt-1">Active blocks</p>
        </div>
        <div className="p-5 rounded-xl bg-[#141414] border border-[#222]">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Schedule Overrides
          </p>
          <div className="text-2xl font-bold text-white">
            {stats.loading ? "..." : stats.dateSchedules}
          </div>
          <p className="text-[11px] text-blue-400 mt-1">Custom hours/holidays</p>
        </div>
      </div>

      {/* Google Cloud PITR Protection Status */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#161a22] to-[#111317] border border-[#2b3240] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Cloud Disaster Recovery Engine
            </span>
          </div>
          <h3 className="text-lg font-bold text-white">
            Google Cloud Continuous Point-in-Time Recovery (PITR)
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-2xl leading-relaxed">
            Google Firestore automatically logs all writes, updates, and deletes in real time. If a feature or accident deletes data, you can roll back your entire live database to any exact second in the past 7 days.
          </p>
        </div>
        <div className="shrink-0">
          <div className="p-3 bg-[#0a0a0a] rounded-lg border border-[#333] text-xs font-mono text-[var(--gold)]">
            gcloud firestore databases update --enable-pitr
          </div>
        </div>
      </div>

      {/* Automated Daily Cloud Snapshots Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-0.5" style={{ fontFamily: "'Playfair Display', serif" }}>
              Automated Cloud Snapshots
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Daily snapshots created automatically by cloud cron. Kept for 30 days.
            </p>
          </div>
          <span className="text-xs text-[var(--text-muted)] bg-[#1a1a1a] px-3 py-1 rounded-full border border-[#2a2a2a]">
            {cloudBackups.length} snapshots recorded
          </span>
        </div>

        {cloudLoading ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)] border border-[#222] rounded-xl bg-[#111]">
            Loading automated snapshots...
          </div>
        ) : cloudBackups.length === 0 ? (
          <div className="p-12 text-center border border-[#222] rounded-xl bg-[#111] space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#1c1c1c] text-[var(--text-muted)] flex items-center justify-center mx-auto text-xl">
              ☁️
            </div>
            <p className="text-sm font-medium text-white">No automated cloud snapshots yet</p>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
              Automated backups run nightly via your App Hosting cron schedule. You can also click &quot;Save Cloud Snapshot&quot; above to create one right now!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#222] rounded-xl bg-[#111]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#161616] border-b border-[#222] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Total Docs</th>
                  <th className="py-3 px-4">Breakdown</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {cloudBackups.map((bk) => {
                  const dateStr = bk.createdAt
                    ? new Date(bk.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Unknown date";
                  const counts = bk.collectionCounts || {};
                  return (
                    <tr key={bk.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                          {bk.totalDocuments || 0} docs
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {counts.appointments || 0} appts • {counts.customers || 0} customers • {counts.blockedSlots || 0} blocks
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleDownloadCloudBackup(bk)}
                          className="px-2.5 py-1 text-xs rounded bg-[#222] hover:bg-[#333] text-[var(--gold)] border border-[#333] transition-colors"
                        >
                          Download JSON
                        </button>
                        <button
                          onClick={() => handleRestoreFromCloudBackup(bk)}
                          className="px-2.5 py-1 text-xs rounded bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/40 transition-colors"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Command-Line Recovery Reference */}
      <div className="p-6 rounded-2xl bg-[#111] border border-[#222] space-y-4">
        <h3 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
          Terminal & Developer Backup Commands
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          When adding new features or refactoring code in your terminal, use these instant commands:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
          <div className="p-3 bg-[#0c0c0c] rounded-lg border border-[#222] flex items-center justify-between">
            <span className="text-[var(--gold)]">npm run checkpoint &quot;msg&quot;</span>
            <span className="text-[var(--text-muted)] text-[10px]">Code safety snapshot</span>
          </div>
          <div className="p-3 bg-[#0c0c0c] rounded-lg border border-[#222] flex items-center justify-between">
            <span className="text-[var(--gold)]">npm run rollback</span>
            <span className="text-[var(--text-muted)] text-[10px]">Undo broken feature</span>
          </div>
          <div className="p-3 bg-[#0c0c0c] rounded-lg border border-[#222] flex items-center justify-between">
            <span className="text-[var(--gold)]">npm run backup:firestore</span>
            <span className="text-[var(--text-muted)] text-[10px]">Export local JSON dump</span>
          </div>
          <div className="p-3 bg-[#0c0c0c] rounded-lg border border-[#222] flex items-center justify-between">
            <span className="text-[var(--gold)]">npm run feature:start &quot;name&quot;</span>
            <span className="text-[var(--text-muted)] text-[10px]">Safe isolated branch</span>
          </div>
        </div>
      </div>

      {/* Restore Wizard Modal */}
      {restoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#222] pb-4">
              <div>
                <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                  <span>🚨</span> Confirm Database Restoration
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  This will restore/overwrite documents in Cloud Firestore.
                </p>
              </div>
              {!isRestoring && (
                <button
                  onClick={() => setRestoreModalOpen(false)}
                  className="text-[var(--text-muted)] hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Payload Preview */}
            <div className="p-4 rounded-xl bg-[#0a0a0a] border border-[#222] space-y-2 text-xs">
              <p className="font-semibold text-white">Backup Contents:</p>
              <div className="grid grid-cols-2 gap-2 text-[var(--text-muted)]">
                {Object.entries(restorePayload?.collections || {}).map(([col, docs]) => (
                  <div key={col} className="flex justify-between border-b border-[#1c1c1c] pb-1">
                    <span>{col}:</span>
                    <span className="font-bold text-white">{Object.keys(docs || {}).length} docs</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Bar during Restore */}
            {isRestoring && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Restoring...</span>
                  <span className="text-[var(--gold)]">{restoreProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#222] overflow-hidden">
                  <div
                    className="h-full bg-[var(--gold)] transition-all duration-300"
                    style={{ width: `${restoreProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Execution Logs */}
            {restoreLogs.length > 0 && (
              <div className="p-3 bg-black rounded-lg border border-[#222] font-mono text-[11px] text-[var(--text-muted)] max-h-36 overflow-y-auto space-y-1">
                {restoreLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}

            {/* Safety Confirmation Input */}
            {!isRestoring && restoreProgress < 100 && (
              <div className="space-y-2">
                <label className="text-xs text-[var(--text-muted)]">
                  Type <strong className="text-red-400">RESTORE</strong> to enable execution:
                </label>
                <input
                  type="text"
                  value={restoreConfirmation}
                  onChange={(e) => setRestoreConfirmation(e.target.value.trim().toUpperCase())}
                  placeholder="Type RESTORE here"
                  className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#333] rounded-lg text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoreModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#222] hover:bg-[#2a2a2a] text-sm text-white disabled:opacity-50"
              >
                {restoreProgress === 100 ? "Close" : "Cancel"}
              </button>
              {restoreProgress < 100 && (
                <button
                  type="button"
                  disabled={restoreConfirmation !== "RESTORE" || isRestoring}
                  onClick={executeRestore}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {isRestoring ? "Restoring..." : "Execute Restore"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
