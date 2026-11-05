"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

type LoanStatus = "borrowed" | "return_requested" | "returned";
type ReturnCondition = "good" | "damaged" | "lost";
type Tab = "all" | "mine" | "history";

type Loan = {
  id: string;
  asset_id: string;
  request_id: string | null;
  borrower_id: string;
  worker_name: string;
  device_name: string;
  asset_tag: string | null;
  category: string | null;
  electronics_subcategory: string | null;
  location: string | null;
  serial_number?: string | null;
  borrowed_at: string | null;
  days_borrowed: number | null;
  status: LoanStatus;
  return_requested_at: string | null;
  returned_at: string | null;
  return_condition: ReturnCondition | null;
  is_mine: boolean;
  can_return: boolean;
  can_confirm_return: boolean;
};

type LoansResponse = {
  loans: Loan[];
  current_user_id: string;
  role: string;
  can_manage: boolean;
};

const STATUS_LABELS: Record<LoanStatus, string> = {
  borrowed: "Borrowed",
  return_requested: "Return requested",
  returned: "Returned",
};

const CONDITION_LABELS: Record<ReturnCondition, string> = {
  good: "Good",
  damaged: "Damaged",
  lost: "Lost",
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateNumber(value: string | null) {
  if (!value) return null;

  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function statusClasses(status: LoanStatus) {
  switch (status) {
    case "return_requested":
      return "bg-amber-100 text-amber-900";
    case "returned":
      return "bg-green-100 text-green-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function conditionOutcome(condition: ReturnCondition | null) {
  switch (condition) {
    case "good":
      return "Available";
    case "damaged":
      return "Under Repair";
    case "lost":
      return "Retired";
    default:
      return "Unknown";
  }
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status}).`,
    );
  }

  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid response.");
  }

  return data;
}

export default function BorrowedPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [role, setRole] = useState("");
  const [canManage, setCanManage] = useState(false);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [returnLoanId, setReturnLoanId] = useState<string | null>(null);
  const [condition, setCondition] = useState<ReturnCondition | "">("");
  const [confirmLoanId, setConfirmLoanId] = useState<string | null>(null);

  const [processing, setProcessing] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setLoadError("");

    async function loadLoans() {
      try {
        const response = await fetch("/api/asset-loans", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await readResponse(response);

        if (
          !Array.isArray(data.loans) ||
          typeof data.role !== "string" ||
          typeof data.can_manage !== "boolean"
        ) {
          throw new Error(
            "The borrowed-list API needs the updated response format.",
          );
        }

        const result = data as LoansResponse;

        if (active) {
          setLoans(result.loans);
          setRole(result.role);
          setCanManage(result.can_manage);
        }
      } catch (error) {
        if (active) {
          setLoans([]);
          setRole("");
          setCanManage(false);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load borrowed items.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadLoans();

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshVersion]);

  function closeForms() {
    setReturnLoanId(null);
    setConfirmLoanId(null);
    setCondition("");
  }

  function refresh() {
    closeForms();
    setLoading(true);
    setRefreshVersion((value) => value + 1);
  }

  function changeTab(next: Tab) {
    setTab(next);
    setStatusFilter("");
    closeForms();
    setActionError("");
  }

  async function requestReturn(loan: Loan) {
    if (submitting.current || loading || !loan.can_return) return;

    if (!condition) {
      setActionError("Select the device condition first.");
      return;
    }

    submitting.current = true;
    setProcessing(loan.id);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/asset-loans/${loan.id}/return`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            return_condition: condition,
          }),
        },
      );

      await readResponse(response);

      setNotice(
        `Return requested for ${loan.asset_tag || loan.device_name}. Finance or admin must confirm it.`,
      );
      refresh();
    } catch (error) {
      setActionError(
        `${
          error instanceof Error
            ? error.message
            : "Could not request the return."
        } The list is being refreshed. Check the device status before trying again.`,
      );
      refresh();
    } finally {
      submitting.current = false;
      setProcessing(null);
    }
  }

  async function confirmReturn(loan: Loan) {
    if (
      submitting.current ||
      loading ||
      !loan.can_confirm_return ||
      !loan.return_condition
    ) {
      return;
    }

    submitting.current = true;
    setProcessing(loan.id);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/asset-loans/${loan.id}/confirm-return`,
        {
          method: "POST",
        },
      );

      await readResponse(response);

      setNotice(
        `Return confirmed for ${
          loan.asset_tag || loan.device_name
        }. Inventory status: ${conditionOutcome(loan.return_condition)}.`,
      );
      refresh();
    } catch (error) {
      setActionError(
        `${
          error instanceof Error
            ? error.message
            : "Could not confirm the return."
        } The list is being refreshed. Check the device status before trying again.`,
      );
      refresh();
    } finally {
      submitting.current = false;
      setProcessing(null);
    }
  }

  const activeLoans = loans.filter(
    (loan) => loan.status !== "returned",
  );
  const myLoans = activeLoans.filter((loan) => loan.is_mine);
  const returnedLoans = loans.filter(
    (loan) => loan.status === "returned",
  );
  const pendingReturns = activeLoans.filter(
    (loan) => loan.status === "return_requested",
  );

  const tabLoans =
    tab === "history"
      ? returnedLoans
      : tab === "mine"
        ? myLoans
        : activeLoans;

  const workerNames = new Map<string, string>();

  for (const loan of loans) {
    workerNames.set(loan.borrower_id, loan.worker_name);
  }

  const workers = [...workerNames.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const searchTerm = search.trim().toLowerCase();

  const visibleLoans = tabLoans
    .filter((loan) => {
      if (workerFilter && loan.borrower_id !== workerFilter) {
        return false;
      }

      if (statusFilter && loan.status !== statusFilter) {
        return false;
      }

      if (!searchTerm) return true;

      const searchableValues = [
        loan.worker_name,
        loan.device_name,
        loan.asset_tag,
        loan.location,
        ...(canManage ? [loan.serial_number] : []),
      ];

      return searchableValues.some((value) =>
        value?.toLowerCase().includes(searchTerm),
      );
    })
    .sort((a, b) => {
      if (tab === "history") {
        const difference =
          (dateNumber(b.returned_at) || 0) -
          (dateNumber(a.returned_at) || 0);

        return difference || a.id.localeCompare(b.id);
      }

      const aDate =
        dateNumber(a.borrowed_at) ?? Number.POSITIVE_INFINITY;
      const bDate =
        dateNumber(b.borrowed_at) ?? Number.POSITIVE_INFINITY;

      if (aDate !== bDate) return aDate < bDate ? -1 : 1;

      return a.id.localeCompare(b.id);
    });

  const hasActions = role === "worker" || canManage;

  const tabs: { value: Tab; label: string; count: number }[] = [
    {
      value: "all",
      label: "All borrowed",
      count: activeLoans.length,
    },
    {
      value: "mine",
      label: "My items",
      count: myLoans.length,
    },
    {
      value: "history",
      label: "Returned history",
      count: returnedLoans.length,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Borrowed" />

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-deep">
              Borrowed equipment
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              See who has each device and track returns.
              Equipment stays borrowed until its return is confirmed.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {["manager", "finance", "admin"].includes(role) && (
              <Link
                href="/assets/inventory"
                className="rounded border bg-white px-4 py-2 text-sm text-brand-deep"
              >
                Inventory
              </Link>
            )}

            <button
              type="button"
              onClick={refresh}
              disabled={loading || processing !== null}
              className="rounded border bg-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

        {notice && (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {notice}
          </p>
        )}

        {actionError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {actionError}
          </p>
        )}

        {!loading && !loadError && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Currently borrowed", count: activeLoans.length },
              { label: "My items", count: myLoans.length },
              { label: "Awaiting confirmation", count: pendingReturns.length },
              { label: "Returned records", count: returnedLoans.length },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border bg-white p-4"
              >
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-brand-deep">
                  {card.count}
                </p>
              </div>
            ))}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b p-3">
            {tabs.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={tab === item.value}
                disabled={processing !== null}
                onClick={() => changeTab(item.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  tab === item.value
                    ? "bg-brand-deep text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {item.label}
                {!loading && !loadError && (
                  <span className="ml-2">({item.count})</span>
                )}
              </button>
            ))}
          </div>

          <div className="grid gap-3 border-b p-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="borrowed-search"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Search
              </label>
              <input
                id="borrowed-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  canManage
                    ? "Worker, device, asset code or serial"
                    : "Worker, device or asset code"
                }
                className="w-full rounded border px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="borrowed-worker"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Worker
              </label>
              <select
                id="borrowed-worker"
                value={workerFilter}
                onChange={(event) => setWorkerFilter(event.target.value)}
                className="w-full rounded border bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All workers</option>
                {workers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="borrowed-status"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id="borrowed-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded border bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All statuses in this tab</option>
                {tab === "history" ? (
                  <option value="returned">Returned</option>
                ) : (
                  <>
                    <option value="borrowed">Borrowed</option>
                    <option value="return_requested">
                      Return requested
                    </option>
                  </>
                )}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-gray-500">
              Loading borrowed equipment…
            </p>
          ) : loadError ? (
            <div role="alert" className="p-6 text-red-700">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-3 rounded border px-3 py-2 text-sm"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs text-gray-500">
                <span>
                  {visibleLoans.length} of {tabLoans.length} records
                </span>
                <span>
                  {tab === "history"
                    ? "Most recent returns first"
                    : "Longest-held devices first"}
                </span>
              </div>

              {visibleLoans.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>
                    {tabLoans.length === 0
                      ? tab === "mine"
                        ? "You have no borrowed devices."
                        : tab === "history"
                          ? "No confirmed returns yet."
                          : "No devices are currently borrowed."
                      : "No records match your filters."}
                  </p>

                  {(search || workerFilter || statusFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setWorkerFilter("");
                        setStatusFilter("");
                      }}
                      className="mt-3 text-sm text-brand-deep underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th scope="col" className="p-3">Worker</th>
                        <th scope="col" className="p-3">Device</th>
                        <th scope="col" className="p-3">Asset code</th>
                        {canManage && (
                          <th scope="col" className="p-3">Serial number</th>
                        )}
                        <th scope="col" className="p-3">Borrowed since</th>
                        <th scope="col" className="p-3">Days borrowed</th>
                        <th scope="col" className="p-3">Status</th>
                        <th scope="col" className="p-3">Return condition</th>
                        {tab === "history" && (
                          <th scope="col" className="p-3">Returned on</th>
                        )}
                        {hasActions && tab !== "history" && (
                          <th scope="col" className="p-3">Action</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {visibleLoans.map((loan) => (
                        <tr key={loan.id} className="border-t align-top">
                          <td className="p-3">
                            <p className="font-medium">{loan.worker_name}</p>
                            {loan.is_mine && (
                              <span className="text-xs text-brand-deep">
                                You
                              </span>
                            )}
                          </td>

                          <td className="p-3">
                            <p className="font-medium">{loan.device_name}</p>
                            {loan.electronics_subcategory && (
                              <p className="text-xs uppercase text-gray-500">
                                {loan.electronics_subcategory}
                              </p>
                            )}
                            {loan.location && (
                              <p className="mt-1 text-xs text-gray-500">
                                Location: {loan.location}
                              </p>
                            )}
                          </td>

                          <td className="p-3 font-medium">
                            {loan.asset_tag || "—"}
                          </td>

                          {canManage && (
                            <td className="p-3">
                              {loan.serial_number || "—"}
                            </td>
                          )}

                          <td className="whitespace-nowrap p-3">
                            {formatDate(loan.borrowed_at)}
                          </td>

                          <td className="p-3">
                            {loan.days_borrowed === null
                              ? "Unknown"
                              : `${loan.days_borrowed} ${
                                  loan.days_borrowed === 1 ? "day" : "days"
                                }`}
                          </td>

                          <td className="p-3">
                            <span
                              className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${statusClasses(
                                loan.status,
                              )}`}
                            >
                              {STATUS_LABELS[loan.status]}
                            </span>
                            {loan.status === "return_requested" && (
                              <p className="mt-1 text-xs text-gray-500">
                                Requested {formatDate(loan.return_requested_at)}
                              </p>
                            )}
                          </td>

                          <td className="p-3">
                            {loan.return_condition
                              ? CONDITION_LABELS[loan.return_condition]
                              : "—"}
                          </td>

                          {tab === "history" && (
                            <td className="whitespace-nowrap p-3">
                              {formatDate(loan.returned_at)}
                            </td>
                          )}

                          {hasActions && tab !== "history" && (
                            <td className="min-w-56 p-3">
                              {loan.can_return ? (
                                returnLoanId === loan.id ? (
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      void requestReturn(loan);
                                    }}
                                    className="space-y-2 rounded-lg border bg-gray-50 p-3"
                                  >
                                    <label
                                      htmlFor={`condition-${loan.id}`}
                                      className="block text-xs font-medium"
                                    >
                                      Device condition
                                    </label>

                                    <select
                                      id={`condition-${loan.id}`}
                                      value={condition}
                                      required
                                      disabled={processing !== null}
                                      onChange={(event) =>
                                        setCondition(
                                          event.target.value as ReturnCondition | "",
                                        )
                                      }
                                      className="w-full rounded border bg-white p-2 text-sm"
                                    >
                                      <option value="">Select condition</option>
                                      <option value="good">Good</option>
                                      <option value="damaged">Damaged</option>
                                      <option value="lost">Lost</option>
                                    </select>

                                    <p className="text-xs text-gray-600">
                                      Finance or admin will confirm this return.
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="submit"
                                        disabled={!condition || processing !== null}
                                        className="rounded bg-brand-deep px-3 py-2 text-xs text-white disabled:opacity-50"
                                      >
                                        {processing === loan.id
                                          ? "Saving…"
                                          : "Submit return"}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={processing !== null}
                                        onClick={closeForms}
                                        className="rounded border px-3 py-2 text-xs"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={processing !== null}
                                    onClick={() => {
                                      closeForms();
                                      setReturnLoanId(loan.id);
                                      setActionError("");
                                    }}
                                    className="rounded bg-brand-deep px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                                  >
                                    Return
                                  </button>
                                )
                              ) : loan.can_confirm_return ? (
                                !loan.return_condition ? (
                                  <p className="text-xs text-red-700">
                                    Return condition is missing. This record
                                    needs correction before confirmation.
                                  </p>
                                ) : confirmLoanId === loan.id ? (
                                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs text-gray-800">
                                      {loan.return_condition === "lost"
                                        ? "Confirm the loss report? This device will be retired."
                                        : `Confirm receipt? The device will become ${conditionOutcome(
                                            loan.return_condition,
                                          )}.`}
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={processing !== null}
                                        onClick={() => void confirmReturn(loan)}
                                        className="rounded bg-green-700 px-3 py-2 text-xs text-white disabled:opacity-50"
                                      >
                                        {processing === loan.id
                                          ? "Saving…"
                                          : "Confirm"}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={processing !== null}
                                        onClick={closeForms}
                                        className="rounded border px-3 py-2 text-xs"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={processing !== null}
                                    onClick={() => {
                                      closeForms();
                                      setConfirmLoanId(loan.id);
                                      setActionError("");
                                    }}
                                    className="rounded bg-green-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                                  >
                                    Confirm return
                                  </button>
                                )
                              ) : loan.is_mine &&
                                loan.status === "return_requested" ? (
                                <span className="text-xs text-gray-500">
                                  Awaiting finance/admin confirmation
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}