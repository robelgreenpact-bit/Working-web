"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.endsWith("@greenpactconsulting.com")) {
      setError("Please use your company email (@greenpactconsulting.com)");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-xl border-t-4 border-brand bg-white p-8 shadow-lg"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="Greenpact"
            width={140}
            height={140}
            className="mb-3 h-32 w-32 object-contain"
          />
          <h1 className="text-xl font-semibold text-brand-deep">
            Greenpact Request Portal
          </h1>
        </div>

        {error && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <label className="mb-1 block text-sm text-gray-600">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
          placeholder="name@greenpactconsulting.com"
        />

        <label className="mb-1 block text-sm text-gray-600">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mb-6 w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand-deep p-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <a
          href="/forgot-password"
          className="mt-4 block text-center text-sm text-brand-deep hover:underline"
        >
          Forgot password?
        </a>
      </form>
    </div>
  );
}
