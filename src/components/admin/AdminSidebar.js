"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function AdminSidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/blocked", label: "Blocked Slots" },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <aside className="w-64 bg-[#111] border-r border-[#222] flex flex-col h-full shrink-0">
      <div className="p-6">
        <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Admin</h2>
        <p className="text-xs text-[var(--text-muted)]">Anees Hairdressers</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
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
        <Link href="/" className="block w-full text-left px-4 py-2 mb-2 text-sm text-[var(--text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors">
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
  );
}
