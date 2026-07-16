"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs font-bold text-white">
      {count}
    </span>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    
      <a href={href}
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-deep text-white"
          : "text-brand-deep hover:bg-brand/20"
      }`}
    >
      {children}
    </a>
  );
}

export default function Navbar({ title }: { title: string }) {
  void title;
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/dashboard-role")
      .then((res) => res.json())
      .then((data) => {
        setRole(data.role || null);
        setName(data.name || null);
      })
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
  const canSeeTaxRegistry =
    role === "admin" || role === "manager" || role === "finance";
  const canSeeRegisterQueue = role === "accountant";

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-brand-deep/10 bg-white px-6 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Image
          src="/logo.png"
          alt="Greenpact"
          width={48}
          height={48}
          className="mr-2 h-12 w-12 object-contain"
        />

        <NavLink href={homeHref} active={isActive(homeHref)}>
          Dashboard
        </NavLink>

        {canSeeAssets && (
          <NavLink href="/assets" active={isActive("/assets")}>
            Assets
          </NavLink>
        )}

        {canSeeReports && (
          <NavLink href="/reports" active={isActive("/reports")}>
            Reports
          </NavLink>
        )}

        {canSeeTaxRegistry && (
          <NavLink
            href="/admin/registrations"
            active={isActive("/admin/registrations")}
          >
            Tax Registry
          </NavLink>
        )}

        {role === "admin" && (
          <>
            <NavLink
              href="/admin/requests"
              active={isActive("/admin/requests")}
            >
              My Requests
            </NavLink>
            <NavLink href="/admin/users" active={isActive("/admin/users")}>
              Users
            </NavLink>
          </>
        )}

        {role === "manager" && (
          <>
            <NavLink
              href="/manager/approvals"
              active={isActive("/manager/approvals")}
            >
              Approvals
              <Badge count={badges.approvals || 0} />
            </NavLink>
            <NavLink
              href="/manager/payments"
              active={isActive("/manager/payments")}
            >
              Payment Approvals
              <Badge count={badges.payments || 0} />
            </NavLink>
          </>
        )}

        {role === "finance" && (
          <>
            <NavLink
              href="/finance/approvals"
              active={isActive("/finance/approvals")}
            >
              Approvals
              <Badge count={badges.finance || 0} />
            </NavLink>
            <NavLink
              href="/finance/payments"
              active={isActive("/finance/payments")}
            >
              Payment Requests
            </NavLink>
          </>
        )}

        {canSeeRegisterQueue && (
          <>
            <NavLink
              href="/accountant/requests"
              active={isActive("/accountant/requests")}
            >
              My Requests
            </NavLink>
            <NavLink
              href="/accountant/register"
              active={isActive("/accountant/register")}
            >
              Register
            </NavLink>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {name && (
          <span className="text-sm font-medium text-gray-600">{name}</span>
        )}
        <button
          onClick={handleLogout}
          className="rounded-full bg-brand-deep px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}