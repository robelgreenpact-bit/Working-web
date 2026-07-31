"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.endsWith("@greenpactconsulting.com")) {
      setError("Please use your company email (@greenpactconsulting.com)");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("If that email exists in our system, a reset link has been sent.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md"
      >
        <h1 className="mb-2 text-xl font-semibold text-gray-800">
          Forgot Password
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Enter your company email and we&apos;ll send you a reset link.
        </p>

        {error && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {message && (
          <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-600">
            {message}
          </p>
        )}

        <label className="mb-1 block text-sm text-gray-600">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="name@greenpactconsulting.com"
          className="mb-6 w-full rounded border border-gray-300 p-2"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        
          <a href="/login"
          className="mt-4 block text-center text-sm text-blue-600 hover:underline"
        >
          Back to Login
        </a>
      </form>
    </div>
  );
}