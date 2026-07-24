"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs font-bold text-white shadow-lg pulse">
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
      className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-brand-deep text-white shadow-lg scale-105"
          : "text-brand-deep hover:bg-brand/20 hover:scale-105"
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
  const [assetsDropdownOpen, setAssetsDropdownOpen] = useState(false);

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
        <div className="relative">
          <button
            onClick={() => setAssetsDropdownOpen(!assetsDropdownOpen)}
            className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
              isActive("/assets") || isActive("/assets/inventory")
                ? "bg-brand-deep text-white shadow-lg scale-105"
                : "text-brand-deep hover:bg-brand/20 hover:scale-105"
            }`}
          >
            Assets
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform duration-200 ${assetsDropdownOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {assetsDropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm p-2 shadow-xl fade-in min-w-[160px]">
              <a
                href="/assets"
                onClick={() => {
                  setAssetsDropdownOpen(false);
                  closeMenu();
                }}
                className={`block rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive("/assets")
                    ? "bg-brand-deep text-white shadow-md"
                    : "text-brand-deep hover:bg-brand/10 hover:shadow-md"
                }`}
              >
                Asset Registry
              </a>
              <a
                href="/assets/inventory"
                onClick={() => {
                  setAssetsDropdownOpen(false);
                  closeMenu();
                }}
                className={`block rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive("/assets/inventory")
                    ? "bg-brand-deep text-white shadow-md"
                    : "text-brand-deep hover:bg-brand/10 hover:shadow-md"
                }`}
              >
                Inventory
              </a>
            </div>
          )}
        </div>
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
    <div className="relative border-b border-brand-deep/10 bg-white/80 backdrop-blur-sm px-4 py-3 shadow-lg sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Image
              src="/logo.png"
              alt="Greenpact"
              width={56}
              height={56}
              className="h-14 w-14 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
            />
            <div className="absolute inset-0 rounded-full bg-brand/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {links}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {name ? (
            <div className="hidden items-center gap-2 rounded-full bg-brand/10 px-4 py-2 sm:flex">
              <div className="h-8 w-8 rounded-full bg-brand-deep flex items-center justify-center text-white font-semibold text-sm">
                {name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700">{name}</span>
            </div>
          ) : null}
          <button
            onClick={handleLogout}
            className="hidden rounded-full bg-gradient-to-r from-brand-deep to-brand-dark px-5 py-2 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 md:block"
          >
            Log Out
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-deep hover:bg-brand/20 hover:scale-110 transition-all duration-200 md:hidden"
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
                className="transition-transform duration-200 rotate-90"
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
        <div className="absolute left-0 right-0 top-full z-50 flex flex-col gap-2 border-b border-brand-deep/10 bg-white/95 backdrop-blur-sm p-4 shadow-xl md:hidden fade-in">
          {name ? (
            <div className="flex items-center gap-3 rounded-full bg-brand/10 px-4 py-3">
              <div className="h-10 w-10 rounded-full bg-brand-deep flex items-center justify-center text-white font-semibold">
                {name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700">{name}</span>
            </div>
          ) : null}
          {links}
          <button
            onClick={handleLogout}
            className="mt-2 rounded-full bg-gradient-to-r from-brand-deep to-brand-dark px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            Log Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
