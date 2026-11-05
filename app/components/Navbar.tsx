"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Badge({ count }: { count: number }) {
  if (!Number.isFinite(count) || count <= 0) return null;

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
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-deep text-white shadow"
          : "text-brand-deep hover:bg-brand/20"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Navbar({ title }: { title: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [assetsDropdownOpen, setAssetsDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let badgesLoading = false;

    async function loadProfile() {
      try {
        const response = await fetch("/api/dashboard-role", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active) {
          setRole(typeof data.role === "string" ? data.role : null);
          setName(typeof data.name === "string" ? data.name : null);
        }
      } catch {
        // Page APIs enforce their own authentication and permissions.
      }
    }

    async function loadBadges() {
      if (badgesLoading || !active) return;

      badgesLoading = true;

      try {
        const response = await fetch("/api/nav-badges", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data: unknown = await response.json();

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return;
        }

        const next: Record<string, number> = {};

        for (const [key, value] of Object.entries(data)) {
          if (
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0
          ) {
            next[key] = value;
          }
        }

        if (active) setBadges(next);
      } catch {
        // A badge failure should not hide navigation.
      } finally {
        badgesLoading = false;
      }
    }

    void loadProfile();
    void loadBadges();

    const interval = window.setInterval(() => {
      void loadBadges();
    }, 30000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAssetsDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAssetsDropdownOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

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

  const canSeeAssets = ["admin", "manager", "finance"].includes(
    role || "",
  );
  const canSeeReports = canSeeAssets;
  const canSeeTaxRegistry = canSeeAssets;

  const canSeeBorrowed = [
    "worker",
    "manager",
    "finance",
    "admin",
    "accountant",
  ].includes(role || "");

  const canSeeLeave = Boolean(role) && role !== "manager";

  function closeMenu() {
    setMenuOpen(false);
    setAssetsDropdownOpen(false);
  }

  function isActive(path: string) {
    return pathname === path;
  }

  const extraLinks: {
    href: string;
    label: string;
    badge?: number;
  }[] = [];

  if (canSeeReports) {
    extraLinks.push({ href: "/reports", label: "Reports" });
  }

  if (canSeeTaxRegistry) {
    extraLinks.push({
      href: "/admin/registrations",
      label: "Tax Registry",
    });
  }

  if (canSeeLeave) {
    extraLinks.push({ href: "/leave", label: "Leave" });
  }

  if (role === "admin") {
    extraLinks.push(
      { href: "/admin/requests", label: "My Requests" },
      { href: "/admin/users", label: "Users" },
    );
  }

  if (role === "manager") {
    extraLinks.push(
      {
        href: "/manager/approvals",
        label: "Approvals",
        badge: badges.approvals,
      },
      {
        href: "/manager/payments",
        label: "Payment Approvals",
        badge: badges.payments,
      },
      { href: "/manager/leaves", label: "Leave Approvals" },
    );
  }

  if (role === "finance") {
    extraLinks.push(
      {
        href: "/finance/approvals",
        label: "Approvals",
        badge: badges.finance,
      },
      { href: "/finance/payments", label: "Payment Requests" },
    );
  }

  if (role === "accountant") {
    extraLinks.push(
      { href: "/accountant/requests", label: "My Requests" },
      { href: "/accountant/register", label: "Register" },
    );
  }

  const links = (
    <>
      {role && (
        <NavLink
          href={homeHref}
          active={isActive(homeHref)}
          onClick={closeMenu}
        >
          Dashboard
        </NavLink>
      )}

      {canSeeAssets && (
        <div className="relative">
          <button
            type="button"
            aria-expanded={assetsDropdownOpen}
            onClick={() => setAssetsDropdownOpen((open) => !open)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive("/assets") || isActive("/assets/inventory")
                ? "bg-brand-deep text-white shadow"
                : "text-brand-deep hover:bg-brand/20"
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
              aria-hidden="true"
              className={assetsDropdownOpen ? "rotate-180" : ""}
            >
              <path
                d="M6 9l6 6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {assetsDropdownOpen && (
            <div className="z-50 mt-2 min-w-44 space-y-1 rounded-xl border bg-white p-2 shadow-xl lg:absolute lg:left-0 lg:top-full">
              {[
                { href: "/assets", label: "Asset Registry" },
                { href: "/assets/inventory", label: "Inventory" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block rounded-lg px-4 py-2.5 text-sm font-medium ${
                    isActive(item.href)
                      ? "bg-brand-deep text-white"
                      : "text-brand-deep hover:bg-brand/10"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

     {canSeeBorrowed && (
  <NavLink
    href="/assets/borrowed"
    active={isActive("/assets/borrowed")}
    onClick={closeMenu}
  >
    Borrowed
    {(role === "finance" || role === "admin") && (
      <Badge count={badges.returns || 0} />
    )}
  </NavLink>
)}

      {extraLinks.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          active={isActive(item.href)}
          onClick={closeMenu}
        >
          {item.label}
          <Badge count={item.badge || 0} />
        </NavLink>
      ))}
    </>
  );

  return (
    <header className="relative z-40 border-b border-brand-deep/10 bg-white px-4 py-3 shadow-sm sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Image
            src="/logo.png"
            alt="Greenpact"
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-contain"
          />

          <span className="truncate font-semibold text-brand-deep lg:hidden">
            {title}
          </span>

          <nav
            aria-label="Main navigation"
            className="hidden flex-wrap items-center gap-1 lg:flex"
          >
            {links}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {name && (
            <div className="hidden items-center gap-2 rounded-full bg-brand/10 px-3 py-2 xl:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep text-sm font-semibold text-white">
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-40 truncate text-sm font-medium text-gray-700">
                {name}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            className="hidden rounded-full bg-brand-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-50 lg:block"
          >
            {loggingOut ? "Logging out…" : "Log Out"}
          </button>

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              setMenuOpen((open) => !open);
              setAssetsDropdownOpen(false);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-deep hover:bg-brand/20 lg:hidden"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d={
                  menuOpen
                    ? "M18 6L6 18M6 6l12 12"
                    : "M3 12h18M3 6h18M3 18h18"
                }
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {logoutError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {logoutError}
        </p>
      )}

      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="absolute left-0 right-0 top-full z-50 flex max-h-[75vh] flex-col gap-2 overflow-y-auto border-b bg-white p-4 shadow-xl lg:hidden"
        >
          {name && (
            <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm font-medium text-gray-700">
              {name}
            </p>
          )}

          {links}

          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            className="mt-2 rounded-full bg-brand-deep px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loggingOut ? "Logging out…" : "Log Out"}
          </button>
        </nav>
      )}
    </header>
  );
}