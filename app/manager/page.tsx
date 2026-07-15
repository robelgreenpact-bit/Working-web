"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Stats = {
  pendingApprovals: number;
  projects: number;
  assets: number;
};

export default function ManagerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      });
  }, []);

  const cards = [
    {
      label: "Pending Your Approval",
      value: stats?.pendingApprovals,
      href: "/manager/approvals",
    },
    { label: "Registered Assets", value: stats?.assets, href: "/assets" },
  ];

  return (
    <div>
      <Navbar title="Manager Dashboard" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Welcome back
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <a key={c.label} href={c.href}>
              <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow transition hover:shadow-md">
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="mt-2 text-3xl font-bold text-brand-deep">
                  {loading ? "—" : c.value}
                </p>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Quick Links
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/manager/approvals"
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Review Approvals
            </a>

        

            <a
              href="/assets"
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              View Assets
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
