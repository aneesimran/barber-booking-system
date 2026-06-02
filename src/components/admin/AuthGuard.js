"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());

export default function AuthGuard({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    console.log("AuthGuard: ADMIN_EMAILS =", ADMIN_EMAILS);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("AuthGuard: onAuthStateChanged user =", user ? user.email : "null");
      if (!user) {
        console.log("AuthGuard: No user, redirecting to /admin");
        router.push("/admin");
      } else if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        console.log("AuthGuard: User not in whitelist, signing out and redirecting");
        // Log out unauthorized users immediately
        auth.signOut();
        router.push("/admin?error=unauthorized");
      } else {
        console.log("AuthGuard: Authorized successfully!");
        setAuthorized(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) return null;

  return <>{children}</>;
}
