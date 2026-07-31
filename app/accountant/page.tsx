"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

export default function AccountantDashboard() {
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/accountant/stats")
      .then((res) => res.json())
      .then((data) => setPending(data.pendingRegistration));
  }, []);

  return (
    <div>
      <Navbar title="Accountant Dashboard" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Welcome back
        </h1>

        <a href="/accountant/register">
          <div className="max-w-xs rounded-lg border-t-4 border-brand bg-white p-6 shadow transition hover:shadow-md">
            <p className="text-sm text-gray-500">Pending Registration</p>
            <p className="mt-2 text-3xl font-bold text-brand-deep">
              {pending === null ? "—" : pending}
            </p>
          </div>
        </a>

        <div className="mt-8 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Quick Links
          </h2>
          
           <a href="/accountant/register"
            className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            Go to Registration Queue
          </a>
        </div>
      </div>
    </div>
  );
}