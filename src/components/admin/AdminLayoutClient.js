"use client";
import { useState } from "react";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayoutClient({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden text-white font-sans">
      {/* Responsive Sidebar */}
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="h-16 border-b border-[#222] bg-[#111] px-4 flex items-center justify-between md:hidden shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-[var(--text-muted)] hover:text-white active:scale-95 transition-all"
              aria-label="Open sidebar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <div>
              <h2 className="font-bold text-white text-sm leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>Admin Portal</h2>
              <p className="text-[10px] text-[var(--text-muted)]">Anees Hairdressers</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] flex items-center justify-center text-xs font-bold border border-[var(--gold)]/20">
            A
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
