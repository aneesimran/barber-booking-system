"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function AdminSidebar({ isOpen, onClose }) {
  const pathname = usePathname();

  const links = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/blocked", label: "Blocked Slots" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/blast", label: "Blast Messages" },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
        />
      )}

      {/* Sidebar Panel */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 w-64 bg-[#111] border-r border-[#222] flex flex-col h-full shrink-0 z-50 transform md:transform-none transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Admin</h2>
            <p className="text-xs text-[var(--text-muted)]">Anees Hairdressers</p>
          </div>
          {/* Close button on mobile */}
          <button 
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-white md:hidden active:scale-95 transition-all"
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose} // Auto close drawer on mobile link click
                className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                  active 
                    ? "bg-[var(--gold)] text-[#0a0a0a] font-medium shadow-[0_0_15px_rgba(201,168,76,0.2)]" 
                    : "text-[var(--text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#222]">
          <Link 
            href="/" 
            className="block w-full text-left px-4 py-2 mb-2 text-sm text-[var(--text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
          >
            Back to Site
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
