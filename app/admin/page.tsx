"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Stats = {
  projects: number;
  users: number;
  assets: number;
  pendingRequests: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      });
  }, []);

  const cards = [
    { label: "Active Users", value: stats?.users, href: "/admin/users" },
    { label: "Registered Assets", value: stats?.assets, href: "/assets" },
    {
      label: "Pending Requests (Company-wide)",
      value: stats?.pendingRequests,
      href: null,
    },
  ];

  return (
    <div>
      <Navbar title="Manage Users" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Welcome back
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const content = (
              <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow transition hover:shadow-md">
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="mt-2 text-3xl font-bold text-brand-deep">
                  {loading ? "—" : c.value}
                </p>
              </div>
            );

            return c.href ? (
              <a key={c.label} href={c.href}>
                {content}
              </a>
            ) : (
              <div key={c.label}>{content}</div>
            );
          })}
        </div>

        <div className="mt-8 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-brand-deep">
            Quick Links
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/users"
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Manage Users
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
