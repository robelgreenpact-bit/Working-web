"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
      {count}
    </span>
  );
}

export default function Navbar({ title }: { title: string }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/dashboard-role")
      .then((res) => res.json())
      .then((data) => setRole(data.role || null))
      .catch(() => {});

    const loadBadges = () => {
      fetch("/api/nav-badges")
        .then((res) => res.json())
        .then((data) => setBadges(data))
        .catch(() => {});
    };

    loadBadges();
    const interval = setInterval(loadBadges, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const homeHref =
    role === "admin"
      ? "/admin"
      : role === "manager"
        ? "/manager"
        : role === "finance"
          ? "/finance"
          : role === "accountant"
            ? "/accountant"
            : "/worker";

  const canSeeAssets =
    role === "admin" || role === "manager" || role === "finance";
  const canSeeReports =
    role === "admin" || role === "manager" || role === "finance";
  const canSeeRegisterQueue = role === "accountant";

  return (
    <div className="flex items-center justify-between border-b border-brand-deep/10 bg-white px-8 py-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Greenpact"
          width={72}
          height={72}
          className="h-10 w-10  object-contain"
        />
        <h2 className="font-semibold text-brand-deep">{title}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={homeHref}
          className="text-sm font-medium text-brand-deep hover:underline"
        >
          Dashboard
        </a>
        {canSeeAssets ? (
          <a
            href="/assets"
            className="text-sm font-medium text-brand-deep hover:underline"
          >
            Assets
          </a>
        ) : null}
        {canSeeReports ? (
          <a
            href="/reports"
            className="text-sm font-medium text-brand-deep hover:underline"
          >
            Reports
          </a>
        ) : null}
        {role === "admin" ? (
          <>
            <a
              href="/admin/requests"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              My Requests
            </a>

            <a
              href="/admin/users"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              Users
            </a>

            <a
              href="/admin/registrations"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              Tax Registry
            </a>
          </>
        ) : null}
        {role === "manager" ? (
          <>
            <a
              href="/manager/approvals"
              className="flex items-center text-sm font-medium text-brand-deep hover:underline"
            >
              Approvals
              <Badge count={badges.approvals || 0} />
            </a>
            <a
              href="/manager/payments"
              className="flex items-center text-sm font-medium text-brand-deep hover:underline"
            >
              Payment Approvals
              <Badge count={badges.payments || 0} />
            </a>
          </>
        ) : null}
        {role === "finance" ? (
          <>
            <a
              href="/finance/approvals"
              className="flex items-center text-sm font-medium text-brand-deep hover:underline"
            >
              Approvals
              <Badge count={badges.finance || 0} />
            </a>

            <a
              href="/finance/payments"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              Payment Requests
            </a>
          </>
        ) : null}
        {canSeeRegisterQueue ? (
          <>
            <a
              href="/accountant/requests"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              My Requests
            </a>

            <a
              href="/accountant/register"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              Register
            </a>
          </>
        ) : null}
        <button
          onClick={handleLogout}
          className="rounded bg-brand-deep/5 px-4 py-2 text-sm font-medium text-brand-deep hover:bg-brand-deep/10"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
