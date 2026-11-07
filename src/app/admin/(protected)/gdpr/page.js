"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";

export default function AdminGdprPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  // Selected customer inspector state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [customerAppointments, setCustomerAppointments] = useState([]);
  const [stripeRecords, setStripeRecords] = useState([]);
  const [stripeError, setStripeError] = useState("");

  // Right to Erasure modal state
  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const [eraseConfirmText, setEraseConfirmText] = useState("");
  const [appointmentHandling, setAppointmentHandling] = useState("anonymize"); // "anonymize" | "delete"
  const [erasing, setErasing] = useState(false);
  const [eraseError, setEraseError] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(collection(db, "customers"));
      const list = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        let createdAtIso = null;
        if (data.createdAt?.toDate) {
          createdAtIso = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === "string") {
          createdAtIso = data.createdAt;
        }
        list.push({
          id: docSnap.id,
          name: data.name || "Unknown Customer",
          email: data.email || "",
          phone: data.phone || "",
          stripeCustomerId: data.stripeCustomerId || null,
          createdAt: createdAtIso,
        });
      });
      // Sort newest first or alphabetically
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setCustomers(list);
    } catch (err) {
      console.error("Failed to fetch customers for GDPR panel:", err);
      setError("Failed to load customer directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.replace(/\s+/g, "").toLowerCase().includes(q.replace(/\s+/g, "")) ||
        c.id.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const getBarberName = (barberId) => {
    const b = barbers.find((item) => item.id === barberId);
    return b ? b.name : barberId;
  };

  // Inspect a customer's full footprint across Firestore + Stripe
  const handleInspectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setInspectorLoading(true);
    setCustomerAppointments([]);
    setStripeRecords([]);
    setStripeError("");
    setEraseError("");

    try {
      // 1. Fetch linked appointments in Firestore
      const apptQuery = query(
        collection(db, "appointments"),
        where("customerId", "==", customer.id)
      );
      const apptSnap = await getDocs(apptQuery);
      const appts = [];
      apptSnap.forEach((d) => {
        const data = d.data();
        appts.push({
          id: d.id,
          barberId: data.barberId,
          barberName: getBarberName(data.barberId),
          date: data.date,
          time: data.time,
          duration: data.duration,
          status: data.status,
          stripeSetupIntentId: data.stripeSetupIntentId || null,
          stripeChargeId: data.stripeChargeId || null,
        });
      });
      appts.sort((a, b) => `${b.date}_${b.time}`.localeCompare(`${a.date}_${a.time}`));
      setCustomerAppointments(appts);

      // 2. Fetch Stripe footprint via Admin API
      const token = await auth.currentUser?.getIdToken();
      if (token && (customer.stripeCustomerId || customer.email)) {
        const params = new URLSearchParams();
        if (customer.stripeCustomerId) params.set("stripeCustomerId", customer.stripeCustomerId);
        if (customer.email) params.set("email", customer.email);

        const res = await fetch(`/api/admin/gdpr?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (res.ok && data.stripeRecords) {
          setStripeRecords(data.stripeRecords);
        } else if (!res.ok) {
          setStripeError(data.error || "Could not load Stripe records");
        }
      }
    } catch (err) {
      console.error("Error inspecting customer footprint:", err);
      setStripeError(err.message || "Error loading customer details");
    } finally {
      setInspectorLoading(false);
    }
  };

  // Export SAR Data Package as JSON
  const handleExportJson = () => {
    if (!selectedCustomer) return;
    const exportPayload = {
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        regulation: "UK GDPR (Articles 15 & 20 - Right of Access & Data Portability)",
        dataController: "Anees Hairdressers",
      },
      customerProfile: {
        firestoreDocumentId: selectedCustomer.id,
        name: selectedCustomer.name,
        email: selectedCustomer.email,
        phone: selectedCustomer.phone,
        stripeCustomerId: selectedCustomer.stripeCustomerId,
        createdAt: selectedCustomer.createdAt,
      },
      stripePaymentVault: stripeRecords,
      appointmentHistory: customerAppointments,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const safeEmail = (selectedCustomer.email || selectedCustomer.id).replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const dateStr = formatLocalDate(new Date());
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdpr-export-${safeEmail}-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setAuditLogs((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        type: "info",
        text: `Exported SAR JSON package for ${selectedCustomer.name} (${selectedCustomer.email}).`,
      },
      ...prev,
    ]);
  };

  // Export SAR Data Package as CSV
  const handleExportCsv = () => {
    if (!selectedCustomer) return;
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const rows = [
      ["Record Type", "ID", "Name / Barber", "Email / Date", "Phone / Time", "Status / Card Details", "Created At"],
      [
        "CUSTOMER_PROFILE",
        selectedCustomer.id,
        selectedCustomer.name,
        selectedCustomer.email,
        selectedCustomer.phone,
        selectedCustomer.stripeCustomerId ? `Stripe ID: ${selectedCustomer.stripeCustomerId}` : "No Stripe ID",
        selectedCustomer.createdAt || "",
      ],
    ];

    for (const sr of stripeRecords) {
      const cardSummary =
        sr.cards && sr.cards.length > 0
          ? sr.cards.map((c) => `${c.brand.toUpperCase()} ****${c.last4} (${c.expMonth}/${c.expYear})`).join("; ")
          : "No vaulted cards";
      rows.push([
        "STRIPE_RECORD",
        sr.id,
        sr.name || "",
        sr.email || "",
        sr.phone || "",
        cardSummary,
        sr.created || "",
      ]);
    }

    for (const appt of customerAppointments) {
      rows.push([
        "APPOINTMENT",
        appt.id,
        appt.barberName,
        appt.date,
        appt.time,
        `${appt.status} (${appt.duration}m)`,
        "",
      ]);
    }

    const csvContent = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const safeEmail = (selectedCustomer.email || selectedCustomer.id).replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const dateStr = formatLocalDate(new Date());
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdpr-export-${safeEmail}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setAuditLogs((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        type: "info",
        text: `Exported SAR CSV package for ${selectedCustomer.name} (${selectedCustomer.email}).`,
      },
      ...prev,
    ]);
  };

  // Execute UK GDPR Right to Erasure
  const handleExecuteErasure = async () => {
    if (!selectedCustomer || eraseConfirmText.trim().toUpperCase() !== "DELETE") return;
    setErasing(true);
    setEraseError("");

    const customerToErase = selectedCustomer;
    const todayStr = formatLocalDate(new Date());

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("Admin session expired. Please sign in again.");
      }

      // 1. Erase Stripe customer(s) & vaulted cards
      let deletedStripeIds = [];
      if (customerToErase.stripeCustomerId || customerToErase.email) {
        const stripeRes = await fetch("/api/admin/gdpr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            stripeCustomerId: customerToErase.stripeCustomerId,
            email: customerToErase.email,
          }),
        });
        const stripeData = await stripeRes.json();
        if (!stripeRes.ok) {
          throw new Error(stripeData.error || "Failed to erase Stripe customer data");
        }
        deletedStripeIds = stripeData.deletedStripeCustomerIds || [];
      }

      // 2. Process linked appointments in Firestore
      let processedApptCount = 0;
      for (const appt of customerAppointments) {
        const apptRef = doc(db, "appointments", appt.id);
        if (appointmentHandling === "delete") {
          await deleteDoc(apptRef);
          processedApptCount++;
        } else {
          // Anonymize: cancel if future confirmed, sever customerId & tokens
          const isFutureConfirmed = appt.status === "confirmed" && appt.date >= todayStr;
          await updateDoc(apptRef, {
            customerId: "gdpr_erased",
            stripeSetupIntentId: null,
            managementToken: "gdpr_erased_token_000000",
            ...(isFutureConfirmed ? { status: "cancelled" } : {}),
            updatedAt: new Date().toISOString(),
          });
          processedApptCount++;
        }
      }

      // 3. Delete customer PII document in Firestore
      await deleteDoc(doc(db, "customers", customerToErase.id));

      // 4. Update UI state and log completion
      setCustomers((prev) => prev.filter((c) => c.id !== customerToErase.id));
      setAuditLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          type: "success",
          text: `[ERASED] ${customerToErase.name} (${customerToErase.email}) — Firestore customer deleted, ${processedApptCount} appointment(s) ${
            appointmentHandling === "delete" ? "deleted" : "anonymized"
          }, ${deletedStripeIds.length} Stripe profile(s) purged.`,
        },
        ...prev,
      ]);

      setEraseModalOpen(false);
      setEraseConfirmText("");
      setSelectedCustomer(null);
      setCustomerAppointments([]);
      setStripeRecords([]);
    } catch (err) {
      console.error("GDPR Erasure error:", err);
      setEraseError(err.message || "Failed to complete GDPR erasure.");
    } finally {
      setErasing(false);
    }
  };

  const vaultedCount = useMemo(
    () => customers.filter((c) => !!c.stripeCustomerId).length,
    [customers]
  );

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-white mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            GDPR &amp; Customer Privacy
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            Manage UK GDPR Subject Access Requests (Data Export) and Right to Erasure across Firestore and Stripe.
          </p>
        </div>

        <button
          onClick={loadCustomers}
          disabled={loading}
          className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#222] text-xs font-semibold uppercase tracking-wider text-[var(--gold)] border border-[#333] rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Directory"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Stored Customer Profiles
          </p>
          <p className="text-2xl font-bold text-white">{customers.length}</p>
        </div>
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Linked Stripe Vault IDs
          </p>
          <p className="text-2xl font-bold text-[var(--gold)]">{vaultedCount}</p>
        </div>
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Session GDPR Actions
          </p>
          <p className="text-2xl font-bold text-green-400">{auditLogs.length}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Customer Search & Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <h2
                className="text-lg font-bold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Customer Directory
              </h2>
              <span className="text-xs text-[var(--text-muted)]">
                Showing {filteredCustomers.length} of {customers.length} records
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer by name, email, or UK mobile number..."
                id="gdpr-search-input"
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[var(--gold)] transition-colors"
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-3.5 top-3.5 text-[#555]"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            {/* Customer List */}
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-10 text-sm text-[var(--text-muted)]">
                No matching customer records found.
              </div>
            ) : (
              <div className="divide-y divide-[#222] max-h-[520px] overflow-y-auto pr-1">
                {filteredCustomers.map((cust) => {
                  const isSelected = selectedCustomer?.id === cust.id;
                  return (
                    <div
                      key={cust.id}
                      onClick={() => handleInspectCustomer(cust)}
                      className={`p-3.5 rounded-xl cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        isSelected
                          ? "bg-[var(--gold)]/10 border border-[var(--gold)]/50"
                          : "hover:bg-[#181818]"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">
                            {cust.name}
                          </span>
                          {cust.stripeCustomerId && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] border border-[var(--gold)]/30">
                              Stripe Vaulted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {cust.email} • {cust.phone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInspectCustomer(cust);
                        }}
                        className="self-start sm:self-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a1a] hover:bg-[#252525] text-[var(--gold)] border border-[#333] transition-colors"
                      >
                        Inspect / Manage
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Session GDPR Audit Log */}
          {auditLogs.length > 0 && (
            <div className="bg-[#111] border border-[#222] rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Session GDPR Activity Log
              </h3>
              <div className="bg-[#050505] border border-[#222] rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1.5">
                {auditLogs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[#555] shrink-0">[{log.time}]</span>
                    <span
                      className={
                        log.type === "success" ? "text-green-400" : "text-gray-300"
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Customer Data Inspector & GDPR Actions */}
        <div className="space-y-6">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl space-y-5 relative">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--gold)] rounded-t-2xl" />
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Data Subject Inspector
            </h2>

            {!selectedCustomer ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed py-8 text-center">
                Select a customer from the directory to view their stored PII, inspect vaulted Stripe cards, export their Subject Access Request (SAR) file, or execute Right to Erasure.
              </p>
            ) : inspectorLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-6 h-6 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
                <p className="text-xs text-[var(--text-muted)]">
                  Gathering Firestore &amp; Stripe records...
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Firestore Profile Summary */}
                <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold)] mb-1">
                    Firestore Profile (customers/{selectedCustomer.id})
                  </p>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Full Name:</span>
                    <span className="text-white font-medium">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Email:</span>
                    <span className="text-white font-mono">{selectedCustomer.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Phone:</span>
                    <span className="text-white font-mono">{selectedCustomer.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Created:</span>
                    <span className="text-white">
                      {selectedCustomer.createdAt
                        ? new Date(selectedCustomer.createdAt).toLocaleDateString("en-GB")
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Stripe Payment Vault Summary */}
                <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold)] mb-1">
                    Stripe Payment Processor Footprint
                  </p>
                  {stripeError ? (
                    <p className="text-amber-400 text-xs">{stripeError}</p>
                  ) : stripeRecords.length === 0 ? (
                    <p className="text-[var(--text-muted)]">
                      No active Stripe customer profile found.
                    </p>
                  ) : (
                    stripeRecords.map((sr) => (
                      <div key={sr.id} className="space-y-1.5 border-b border-[#1a1a1a] last:border-none pb-2 last:pb-0">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Stripe ID:</span>
                          <span className="text-white font-mono">{sr.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Vaulted Cards:</span>
                          <span className="text-white">
                            {sr.cards?.length > 0
                              ? sr.cards
                                  .map(
                                    (c) =>
                                      `${c.brand.toUpperCase()} •••• ${c.last4} (${c.expMonth}/${c.expYear})`
                                  )
                                  .join(", ")
                              : "None"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Linked Appointments */}
                <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
                      Appointment History
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {customerAppointments.length} record(s)
                    </span>
                  </div>
                  {customerAppointments.length === 0 ? (
                    <p className="text-[var(--text-muted)]">No appointments linked.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {customerAppointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="flex justify-between items-center py-1 border-b border-[#181818] last:border-none"
                        >
                          <span className="text-white">
                            {appt.date} at {appt.time} ({appt.barberName})
                          </span>
                          <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-[#1a1a1a] text-[var(--text-muted)]">
                            {appt.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SAR Export Actions (Art. 15 & 20) */}
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Subject Access Request (Data Export)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleExportJson}
                      id="gdpr-export-json-btn"
                      className="py-2.5 px-3 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] text-white border border-[#333] text-xs font-semibold transition-all active:scale-95"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      id="gdpr-export-csv-btn"
                      className="py-2.5 px-3 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] text-white border border-[#333] text-xs font-semibold transition-all active:scale-95"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Right to Erasure Action (Art. 17) */}
                <div className="pt-3 border-t border-[#222]">
                  <button
                    type="button"
                    onClick={() => {
                      setEraseError("");
                      setEraseConfirmText("");
                      setEraseModalOpen(true);
                    }}
                    id="gdpr-open-erase-modal-btn"
                    className="w-full py-3 rounded-xl bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/50 text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                  >
                    Erase Customer Data (Right to be Forgotten)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right to Erasure Confirmation Modal */}
      {eraseModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#111] border border-[#222] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-red-500" />
            <div className="p-6 space-y-5">
              <div className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
                <div>
                  <h3
                    className="text-lg font-bold text-white"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    Confirm GDPR Right to Erasure
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Permanently erase personal data for{" "}
                    <strong className="text-white">{selectedCustomer.name}</strong> (
                    {selectedCustomer.email}).
                  </p>
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2 text-xs text-[var(--text-muted)]">
                <p className="font-semibold text-white">This action will immediately:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Delete the customer&apos;s profile and vaulted card(s) from{" "}
                    <strong className="text-white">Stripe</strong>.
                  </li>
                  <li>
                    Delete the customer PII document from{" "}
                    <strong className="text-white">Cloud Firestore</strong>.
                  </li>
                  <li>
                    Cancel any upcoming confirmed appointments and process{" "}
                    {customerAppointments.length} linked appointment record(s).
                  </li>
                </ul>
              </div>

              {/* Appointment Handling Option */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Historical Appointment Records
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0a0a0a] border border-[#222] cursor-pointer">
                    <input
                      type="radio"
                      name="appointmentHandling"
                      checked={appointmentHandling === "anonymize"}
                      onChange={() => setAppointmentHandling("anonymize")}
                      className="mt-0.5 accent-[var(--gold)]"
                    />
                    <span>
                      <strong className="text-white block">
                        Anonymize past appointments (Recommended)
                      </strong>
                      <span className="text-[var(--text-muted)]">
                        Severs customer ID and payment tokens while keeping anonymous slot counts in Shop Performance Reports.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0a0a0a] border border-[#222] cursor-pointer">
                    <input
                      type="radio"
                      name="appointmentHandling"
                      checked={appointmentHandling === "delete"}
                      onChange={() => setAppointmentHandling("delete")}
                      className="mt-0.5 accent-[var(--gold)]"
                    />
                    <span>
                      <strong className="text-white block">
                        Delete all appointment documents completely
                      </strong>
                      <span className="text-[var(--text-muted)]">
                        Permanently removes all {customerAppointments.length} appointment record(s) from Firestore.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Type DELETE confirmation */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Type <span className="text-white font-bold">DELETE</span> to Confirm
                </label>
                <input
                  type="text"
                  value={eraseConfirmText}
                  onChange={(e) => setEraseConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  id="gdpr-confirm-delete-input"
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl p-3 text-white text-center text-sm font-semibold tracking-wider placeholder-[#444] focus:outline-none focus:border-red-500 transition-colors uppercase"
                />
              </div>

              {eraseError && (
                <p className="text-xs text-red-400 text-center">{eraseError}</p>
              )}
            </div>

            <div className="bg-[#1a1a1a] p-4 border-t border-[#222] flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEraseModalOpen(false);
                  setEraseConfirmText("");
                }}
                disabled={erasing}
                className="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#444] rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteErasure}
                disabled={
                  erasing || eraseConfirmText.trim().toUpperCase() !== "DELETE"
                }
                id="gdpr-execute-erase-btn"
                className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                  erasing || eraseConfirmText.trim().toUpperCase() !== "DELETE"
                    ? "bg-[#222] text-[#444] border border-[#333] cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.25)] active:scale-95"
                }`}
              >
                {erasing ? "Erasing Data..." : "Permanently Erase"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

