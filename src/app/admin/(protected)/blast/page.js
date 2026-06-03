"use client";

import { useState, useEffect, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { formatLocalDate } from "@/lib/appointments";

export default function BlastPage() {
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState(["sms"]); // "sms" | "email"
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Blast execution states
  const [blastRunning, setBlastRunning] = useState(false);
  const [blastAborted, setBlastAborted] = useState(false);
  const [progress, setProgress] = useState({ total: 0, processed: 0, success: 0, failure: 0 });
  const [logs, setLogs] = useState([]);
  
  // Confirmation states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  
  const blastAbortedRef = useRef(false);
  const consoleEndRef = useRef(null);

  // Fetch customers directory on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "customers"));
        const list = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            name: data.name || "Unknown Customer",
            email: data.email || "",
            phone: data.phone || ""
          });
        });
        setCustomers(list);
      } catch (err) {
        console.error("Failed to load customer directory:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Handle Channel Toggles
  const handleChannelToggle = (channel) => {
    setChannels((prev) => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev; // Must select at least one channel
        return prev.filter((c) => c !== channel);
      }
      return [...prev, channel];
    });
  };

  // Directory Stats & Cost Estimations
  const totalCustomers = customers.length;
  const smsEligibleList = customers.filter((c) => !!c.phone);
  const emailEligibleList = customers.filter((c) => !!c.email);

  const smsSelected = channels.includes("sms");
  const emailSelected = channels.includes("email");

  // Twilio SMS segments billing calculation (160 characters per segment)
  const smsSegments = Math.ceil(message.length / 160) || 1;
  const estimatedSmsCost = smsSelected ? smsEligibleList.length * 0.04 * smsSegments : 0;

  const isFormInvalid = message.trim().length === 0 || channels.length === 0;

  // Start Bulk sending
  const handleStartBlast = async () => {
    setConfirmOpen(false);
    setBlastRunning(true);
    setBlastAborted(false);
    blastAbortedRef.current = false;
    setConfirmInput("");
    
    setLogs([{
      time: new Date().toLocaleTimeString(),
      type: "info",
      text: "Initializing bulk blast messages broadcast..."
    }]);

    // Filter recipients based on selected channels
    const recipients = customers.filter((c) => {
      if (smsSelected && emailSelected) return c.phone || c.email;
      if (smsSelected) return !!c.phone;
      if (emailSelected) return !!c.email;
      return false;
    });

    const totalToProcess = recipients.length;
    setProgress({ total: totalToProcess, processed: 0, success: 0, failure: 0 });

    if (totalToProcess === 0) {
      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          type: "error",
          text: "Aborted: No eligible customer records found matching the selected dispatch channels."
        }
      ]);
      setBlastRunning(false);
      return;
    }

    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        type: "info",
        text: `Target list initialized: ${totalToProcess} recipients.`
      }
    ]);

    // Get Admin Auth Token
    let token = "";
    try {
      token = await auth.currentUser?.getIdToken(true);
    } catch (err) {
      console.error(err);
      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          type: "error",
          text: "Authentication Failure: Could not retrieve current session ID token. " + err.message
        }
      ]);
      setBlastRunning(false);
      return;
    }

    const batchSize = 5;
    let processed = 0;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      if (blastAbortedRef.current) {
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            type: "info",
            text: "Broadcast aborted by administrator."
          }
        ]);
        break;
      }

      const batch = recipients.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(recipients.length / batchSize);

      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          type: "info",
          text: `Dispatching Batch ${batchNum}/${totalBatches} (recipients ${i + 1} to ${Math.min(i + batchSize, recipients.length)})...`
        }
      ]);

      try {
        const res = await fetch("/api/admin/send-blast", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            message,
            channels,
            recipients: batch
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Batch request failed");
        }

        data.results.forEach((r) => {
          processed++;
          let itemSuccess = true;
          const details = [];

          if (smsSelected && r.phone) {
            if (r.smsSuccess) {
              details.push("SMS OK");
            } else {
              itemSuccess = false;
              details.push(`SMS Fail (${r.smsError})`);
            }
          }

          if (emailSelected && r.email) {
            if (r.emailSuccess) {
              details.push("Email OK");
            } else {
              itemSuccess = false;
              details.push(`Email Fail (${r.emailError})`);
            }
          }

          if (itemSuccess) {
            successCount++;
            setLogs((prev) => [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                type: "success",
                text: `[SUCCESS] ${r.name} - ${details.join(", ")}`
              }
            ]);
          } else {
            failureCount++;
            setLogs((prev) => [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                type: "error",
                text: `[FAILURE] ${r.name} - ${details.join(", ")}`
              }
            ]);
          }

          setProgress((prev) => ({
            ...prev,
            processed,
            success: successCount,
            failure: failureCount
          }));
        });

      } catch (err) {
        console.error("Batch dispatch error:", err);
        batch.forEach(() => {
          processed++;
          failureCount++;
        });

        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            type: "error",
            text: `[BATCH FAULT] Failed to complete batch: ${err.message || "Unknown error"}`
          }
        ]);

        setProgress((prev) => ({
          ...prev,
          processed,
          failure: failureCount
        }));
      }

      // 500ms throttle delay between API queries
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        type: "info",
        text: `Broadcast complete. Successful: ${successCount}. Failures: ${failureCount}.`
      }
    ]);
    setBlastRunning(false);
  };

  const handleAbort = () => {
    blastAbortedRef.current = true;
    setBlastAborted(true);
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        type: "info",
        text: "Abort signal received. Terminating after current batch resolves..."
      }
    ]);
  };

  const clearConsole = () => {
    setLogs([]);
    setProgress({ total: 0, processed: 0, success: 0, failure: 0 });
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Blast Messages
        </h1>
        <p className="text-[var(--text-muted)]">
          Send bulk notifications or promotional campaigns to saved customers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Message Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Compose Broadcast
            </h2>

            {/* Channels Select */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Select Dispatch Channels
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SMS Selector */}
                <div
                  onClick={() => !blastRunning && handleChannelToggle("sms")}
                  className={`border p-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                    smsSelected
                      ? "bg-[var(--gold)]/5 border-[var(--gold)] text-white"
                      : "bg-[#0a0a0a] border-[#222] text-[var(--text-muted)] hover:text-white hover:border-[#333]"
                  } ${blastRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <div>
                      <span className="font-semibold text-sm block">SMS Text Message</span>
                      <span className="text-[10px] text-[var(--text-muted)] block">Estimated cost applies</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={smsSelected}
                    readOnly
                    className="accent-[var(--gold)]"
                    disabled={blastRunning}
                  />
                </div>

                {/* Email Selector */}
                <div
                  onClick={() => !blastRunning && handleChannelToggle("email")}
                  className={`border p-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                    emailSelected
                      ? "bg-[var(--gold)]/5 border-[var(--gold)] text-white"
                      : "bg-[#0a0a0a] border-[#222] text-[var(--text-muted)] hover:text-white hover:border-[#333]"
                  } ${blastRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <div>
                      <span className="font-semibold text-sm block">Email Campaign</span>
                      <span className="text-[10px] text-[var(--text-muted)] block">Included via Resend</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailSelected}
                    readOnly
                    className="accent-[var(--gold)]"
                    disabled={blastRunning}
                  />
                </div>
              </div>
            </div>

            {/* Message Body Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Message Content
                </label>
                <span className={`text-[10px] font-mono ${message.length > 160 ? "text-amber-500 font-bold" : "text-[var(--text-muted)]"}`}>
                  {message.length} chars {smsSelected && `(${smsSegments} segment${smsSegments > 1 ? "s" : ""})`}
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={blastRunning}
                placeholder="Write your broadcast update or offer here..."
                rows="6"
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl p-4 text-white text-sm placeholder-[#444] focus:outline-none focus:border-[var(--gold)] transition-colors resize-none disabled:opacity-50"
              />
              {smsSelected && message.length > 160 && (
                <p className="text-[10px] text-amber-500/80 leading-normal flex items-start gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <span>Note: Standard SMS limit is 160 characters. Exceeding this splits your broadcast into multiple billed segments per user.</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Status & Cost Panels */}
        <div className="space-y-6">
          {/* Directory Summary */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Directory Summary
            </h2>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm border-b border-[#222] pb-2">
                  <span className="text-[var(--text-muted)]">Total Customers</span>
                  <span className="font-semibold text-white">{totalCustomers}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-[#222] pb-2">
                  <span className="text-[var(--text-muted)]">SMS Eligible (Phone saved)</span>
                  <span className="font-semibold text-white">{smsEligibleList.length}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--text-muted)]">Email Eligible (Email saved)</span>
                  <span className="font-semibold text-white">{emailEligibleList.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Cost Estimation */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-4 relative">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--gold)]" />
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Cost Estimation
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-muted)]">
                  SMS Broadcast {smsSelected && `(${smsEligibleList.length} x ${smsSegments} seg)`}
                </span>
                <span className="font-mono text-white">
                  {smsSelected ? `£${estimatedSmsCost.toFixed(2)}` : "£0.00"}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-[#222] pb-2">
                <span className="text-[var(--text-muted)]">Email Broadcast</span>
                <span className="text-green-400 font-semibold font-mono">Free</span>
              </div>
              <div className="flex justify-between items-center font-bold text-base pt-1">
                <span className="text-[var(--gold)]">Estimated Cost</span>
                <span className="text-[var(--gold)] font-mono">
                  £{estimatedSmsCost.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={isFormInvalid || blastRunning || loading}
              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all mt-4 ${
                isFormInvalid || blastRunning || loading
                  ? "bg-[#222] text-[#555] border border-[#333] cursor-not-allowed"
                  : "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_15px_rgba(201,168,76,0.15)] hover:scale-[1.02] active:scale-95"
              }`}
            >
              {blastRunning ? "Dispatching..." : "Send Blast"}
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Live Console Output */}
      {(blastRunning || logs.length > 0) && (
        <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Dispatch Console
            </h2>
            <div className="flex items-center gap-3">
              {blastRunning ? (
                <button
                  onClick={handleAbort}
                  disabled={blastAborted}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    blastAborted
                      ? "bg-red-950/20 text-red-500/50 border-red-900/30 cursor-not-allowed"
                      : "bg-red-950/20 hover:bg-red-950/40 text-red-400 border-red-900/50 active:scale-95"
                  }`}
                >
                  {blastAborted ? "Aborting..." : "Abort Broadcast"}
                </button>
              ) : (
                <button
                  onClick={clearConsole}
                  className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] text-[var(--text-muted)] hover:text-white border border-[#333] rounded-lg text-xs font-semibold transition-all active:scale-95"
                >
                  Clear Console
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar Panel */}
          {progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-[var(--text-muted)]">
                <span>Processed: {progress.processed} / {progress.total} recipients</span>
                <span className="font-mono">
                  {Math.round((progress.processed / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-[#0a0a0a] h-2.5 rounded-full overflow-hidden border border-[#222] p-0.5">
                <div
                  className="bg-[var(--gold)] h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(201,168,76,0.5)]"
                  style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-400">Success: {progress.success}</span>
                <span className="text-red-400">Failed: {progress.failure}</span>
              </div>
            </div>
          )}

          {/* Developer Terminal Console Logs */}
          <div className="bg-[#050505] border border-[#222] rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs space-y-1.5 shadow-inner">
            {logs.map((log, idx) => (
              <div key={idx} className="flex gap-3 items-start leading-relaxed">
                <span className="text-[#444] shrink-0">[{log.time}]</span>
                <span
                  className={
                    log.type === "success"
                      ? "text-green-400"
                      : log.type === "error"
                      ? "text-red-400 font-bold"
                      : "text-gray-400"
                  }
                >
                  {log.text}
                </span>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}

      {/* Double Confirmation Dialog Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#111] border border-[#222] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-amber-500" />
            
            <div className="p-6 space-y-6">
              {/* Modal Title */}
              <div className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Confirm Broadcast Sending
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    This action will initiate API requests and incur charges.
                  </p>
                </div>
              </div>

              {/* Broadcast Summary */}
              <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Channels Selected:</span>
                  <span className="font-semibold text-white uppercase">
                    {channels.join(" & ")}
                  </span>
                </div>
                {smsSelected && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">SMS Recipients:</span>
                    <span className="font-semibold text-white">{smsEligibleList.length}</span>
                  </div>
                )}
                {emailSelected && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Email Recipients:</span>
                    <span className="font-semibold text-white">{emailEligibleList.length}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#222] pt-2 font-bold text-sm">
                  <span className="text-[var(--gold)]">Total SMS Costs:</span>
                  <span className="text-[var(--gold)] font-mono">£{estimatedSmsCost.toFixed(2)}</span>
                </div>
              </div>

              {/* Text Verification Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Verify Dispatch
                </label>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  To proceed, please type <span className="font-bold text-white select-none">SEND</span> in the field below to verify.
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type SEND to confirm"
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl p-3 text-white text-center text-sm font-semibold tracking-wider placeholder-[#444] focus:outline-none focus:border-amber-500 transition-colors uppercase"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-[#1a1a1a] p-4 border-t border-[#222] flex gap-3 justify-end">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmInput("");
                }}
                className="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#444] rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-white transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleStartBlast}
                disabled={confirmInput.trim().toUpperCase() !== "SEND"}
                className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                  confirmInput.trim().toUpperCase() !== "SEND"
                    ? "bg-[#222] text-[#444] border border-[#333] cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.15)] active:scale-95"
                }`}
              >
                Initiate Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
