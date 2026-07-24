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
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
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
  const [menuOpen, setMenuOpen] = useState(false);

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
  const closeMenu = () => setMenuOpen(false);

  const links = (
    <>
      <NavLink href={homeHref} active={isActive(homeHref)} onClick={closeMenu}>
        Dashboard
      </NavLink>

      {canSeeAssets ? (
        <>
          <NavLink
            href="/assets"
            active={isActive("/assets")}
            onClick={closeMenu}
          >
            Assets
          </NavLink>
          <NavLink
            href="/assets/inventory"
            active={isActive("/assets/inventory")}
            onClick={closeMenu}
          >
            Inventory
          </NavLink>
        </>
      ) : null}

      {canSeeReports ? (
        <NavLink
          href="/reports"
          active={isActive("/reports")}
          onClick={closeMenu}
        >
          Reports
        </NavLink>
      ) : null}

      {canSeeTaxRegistry ? (
        <NavLink
          href="/admin/registrations"
          active={isActive("/admin/registrations")}
          onClick={closeMenu}
        >
          Tax Registry
        </NavLink>
      ) : null}

      {role === "admin" ? (
        <>
          <NavLink
            href="/admin/requests"
            active={isActive("/admin/requests")}
            onClick={closeMenu}
          >
            My Requests
          </NavLink>

          <NavLink
            href="/admin/users"
            active={isActive("/admin/users")}
            onClick={closeMenu}
          >
            Users
          </NavLink>
        </>
      ) : null}

      {role === "manager" ? (
        <>
          <NavLink
            href="/manager/approvals"
            active={isActive("/manager/approvals")}
            onClick={closeMenu}
          >
            Approvals
            <Badge count={badges.approvals || 0} />
          </NavLink>
          <NavLink
            href="/manager/payments"
            active={isActive("/manager/payments")}
            onClick={closeMenu}
          >
            Payment Approvals
            <Badge count={badges.payments || 0} />
          </NavLink>
        </>
      ) : null}

      {role === "finance" ? (
        <>
          <NavLink
            href="/finance/approvals"
            active={isActive("/finance/approvals")}
            onClick={closeMenu}
          >
            Approvals
            <Badge count={badges.finance || 0} />
          </NavLink>
          <NavLink
            href="/finance/payments"
            active={isActive("/finance/payments")}
            onClick={closeMenu}
          >
            Payment Requests
          </NavLink>
        </>
      ) : null}

      {canSeeRegisterQueue ? (
        <>
          <NavLink
            href="/accountant/requests"
            active={isActive("/accountant/requests")}
            onClick={closeMenu}
          >
            My Requests
          </NavLink>
          <NavLink
            href="/accountant/register"
            active={isActive("/accountant/register")}
            onClick={closeMenu}
          >
            Register
          </NavLink>
        </>
      ) : null}
    </>
  );

  return (
    <div className="relative border-b border-brand-deep/10 bg-white px-4 py-3 shadow-sm sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Greenpact"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {links}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {name ? (
            <span className="hidden text-sm font-medium text-gray-600 sm:inline">
              {name}
            </span>
          ) : null}
          <button
            onClick={handleLogout}
            className="hidden rounded-full bg-brand-deep px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark md:block"
          >
            Log Out
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-brand-deep hover:bg-brand/20 md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-brand-deep/10 bg-white p-4 shadow-md md:hidden">
          {name ? (
            <p className="mb-2 border-b border-gray-100 pb-2 text-sm font-medium text-gray-600">
              {name}
            </p>
          ) : null}
          {links}
          <button
            onClick={handleLogout}
            className="mt-2 rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            Log Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
