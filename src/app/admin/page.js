"use client";
import { useState, useEffect, Suspense } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "unauthorized") {
      setError("Your account is not authorized to access the admin dashboard.");
    }
    
    // Auto redirect if already logged in
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/admin/dashboard");
      }
    });
    return () => unsubscribe();
  }, [router, searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin/dashboard");
    } catch (err) {
      console.error("Login error details:", err);
      let errMsg = "Invalid email or password.";
      if (err.code) {
        errMsg += ` (${err.code})`;
      } else if (err.message) {
        errMsg += ` (${err.message})`;
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-2xl p-8 shadow-2xl relative overflow-hidden animate-fade-in-up">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-[var(--gold)] rounded-b-full shadow-[0_0_20px_var(--gold)]" />
      
      <h1 className="text-3xl font-bold text-white mb-2 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>Admin Login</h1>
      <p className="text-[var(--text-muted)] text-center mb-8 text-sm">Sign in to manage appointments</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[var(--gold)] transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[var(--gold)] transition-colors"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--gold)] text-[#0a0a0a] font-bold py-3 rounded-lg mt-4 hover:shadow-[0_0_15px_rgba(201,168,76,0.3)] transition-all flex items-center justify-center"
        >
          {loading ? (
             <div className="w-5 h-5 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" />
          ) : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col justify-center items-center p-4">
      <Suspense fallback={<div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
