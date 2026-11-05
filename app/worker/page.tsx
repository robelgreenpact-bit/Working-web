"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Approval = {
  decision: string;
  comment: string | null;
  role_at_time: string;
  created_at: string;
};

type RequestRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  requested_item_name: string | null;
  item_name: string | null;
  electronics_subcategory: string | null;
  quantity: number | null;
  estimated_cost: number | string | null;
  justification: string | null;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  rejected_by_role: string | null;
  approvals: Approval[] | null;
};

const typeLabels: Record<string, string> = {
  physical_good: "Physical Good / Equipment",
  electronics: "Electronics",
  travel_expense: "Travel Expense",
  reimbursement: "Reimbursement / Money Refund",
  other_asset: "Perdium for field",
  document_request: "Letter / Document Request",
  per_diem: "Perdium Request",
};

const statusLabels: Record<string, string> = {
  pending_manager: "Pending Manager",
  pending_finance: "Pending Finance",
  approved: "Approved",
  rejected: "Rejected",
};

const statusColors: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-800",
  pending_finance: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function isEquipment(request: RequestRow) {
  return (
    request.type === "electronics" &&
    ["tablet", "pc"].includes(
      request.electronics_subcategory || "",
    )
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCost(request: RequestRow) {
  if (
    isEquipment(request) ||
    request.type === "document_request" ||
    request.type === "per_diem"
  ) {
    return "—";
  }

  if (request.estimated_cost === null) return "—";

  const amount = Number(request.estimated_cost);

  if (!Number.isFinite(amount)) return "—";

  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ETB`;
}

function readableRole(role: string | null) {
  if (!role) return "";

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function WorkerPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedRequests, setExpandedRequests] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    async function loadRequests() {
      try {
        const response = await fetch("/api/requests", {
          signal: controller.signal,
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to load your requests.",
          );
        }

        if (!Array.isArray(data.requests)) {
          throw new Error("The request list is incomplete.");
        }

        if (!controller.signal.aborted) {
          setRequests(data.requests);
          setError("");
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your requests.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRequests();

    return () => controller.abort();
  }, [refreshVersion]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshVersion((previous) => previous + 1);
  }

  const searchText = search.trim().toLowerCase();

  const filteredRequests = requests.filter((request) => {
    const matchesStatus =
      statusFilter === "all" ||
      request.status === statusFilter;

    const matchesSearch =
      !searchText ||
      [
        request.title,
        request.requested_item_name,
        request.item_name,
        request.justification,
        request.rejection_reason,
        typeLabels[request.type] || request.type,
      ].some((value) =>
        value?.toLowerCase().includes(searchText),
      );

    return matchesStatus && matchesSearch;
  });

  const summaries = [
    {
      label: "Total requests",
      count: requests.length,
      color: "text-brand-deep",
    },
    {
      label: "Pending",
      count: requests.filter((request) =>
        ["pending_manager", "pending_finance"].includes(
          request.status,
        ),
      ).length,
      color: "text-amber-700",
    },
    {
      label: "Approved",
      count: requests.filter(
        (request) => request.status === "approved",
      ).length,
      color: "text-green-700",
    },
    {
      label: "Rejected",
      count: requests.filter(
        (request) => request.status === "rejected",
      ).length,
      color: "text-red-700",
    },
  ];

  return (
    <div>
      <Navbar title="Worker Dashboard" />

      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">
              My Requests
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Track your requests and review approval decisions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/assets/borrowed"
              className="rounded-lg border border-brand-deep px-4 py-2.5 text-sm font-medium text-brand-deep"
            >
              Borrowed & Returns
            </a>

            <a
              href="/worker/new-request"
              className="rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + New Request
            </a>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h2 className="font-semibold text-brand-deep">
            Equipment borrowing
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            Request equipment through New Request. After manager
            approval, finance selects the devices. View who has each
            device, return your own items, and check return history on
            the Borrowed page.
          </p>
          <a
            href="/assets/borrowed"
            className="mt-3 inline-block text-sm font-medium text-brand-deep underline"
          >
            Open Borrowed page
          </a>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="ml-3 font-medium underline disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaries.map((summary) => (
            <div
              key={summary.label}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-gray-500">
                {summary.label}
              </p>
              <p className={`mt-2 text-3xl font-bold ${summary.color}`}>
                {loading || error ? "—" : summary.count}
              </p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 text-sm font-medium text-gray-700">
              Search requests
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title, item name, or justification"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <p role="status" className="py-8 text-center text-gray-500">
              Loading your requests...
            </p>
          ) : error ? (
            <p className="py-8 text-center text-gray-500">
              Your requests could not be loaded. Use Retry above.
            </p>
          ) : filteredRequests.length === 0 ? (
            <p className="py-8 text-center text-gray-500">
              {requests.length === 0
                ? "You have not submitted any requests yet."
                : "No requests match your search and status filter."}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request) => {
                const equipment = isEquipment(request);
                const expanded = Boolean(
                  expandedRequests[request.id],
                );

                const itemName =
                  request.requested_item_name ||
                  request.item_name;

                const approvals = [
                  ...(request.approvals || []),
                ].sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                );

                const rejectedApproval = approvals.find(
                  (approval) => approval.decision === "rejected",
                );

                const rejectionReason =
                  request.rejection_reason ||
                  rejectedApproval?.comment ||
                  null;

                const rejectedBy =
                  request.rejected_by_role ||
                  rejectedApproval?.role_at_time ||
                  null;

                return (
                  <article
                    key={request.id}
                    className="rounded-xl border border-gray-200 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-gray-900">
                          {request.title}
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                          {typeLabels[request.type] ||
                            request.type.replaceAll("_", " ")}
                          {request.type === "electronics" &&
                            request.electronics_subcategory && (
                              <>
                                {" · "}
                                {request.electronics_subcategory === "pc"
                                  ? "PC"
                                  : request.electronics_subcategory ===
                                      "tablet"
                                    ? "Tablet"
                                    : "Other"}
                              </>
                            )}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          statusColors[request.status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {statusLabels[request.status] ||
                          request.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-gray-500">Submitted</dt>
                        <dd className="mt-1 font-medium text-gray-800">
                          {formatDate(request.created_at)}
                        </dd>
                      </div>

                      {request.quantity !== null && (
                        <div>
                          <dt className="text-gray-500">
                            Requested quantity
                          </dt>
                          <dd className="mt-1 font-medium text-gray-800">
                            {request.quantity}
                          </dd>
                        </div>
                      )}

                      {!equipment &&
                        !["per_diem", "document_request"].includes(
                          request.type,
                        ) && (
                          <div>
                            <dt className="text-gray-500">
                              Estimated cost
                            </dt>
                            <dd className="mt-1 font-medium text-gray-800">
                              {formatCost(request)}
                            </dd>
                          </div>
                        )}
                    </dl>

                    {itemName && (
                      <p className="mt-3 text-sm text-gray-700">
                        <span className="font-medium">Item:</span>{" "}
                        {itemName}
                      </p>
                    )}

                    {equipment &&
                      request.status === "pending_manager" && (
                        <p className="mt-3 text-sm text-amber-800">
                          Waiting for the manager to review your request.
                        </p>
                      )}

                    {equipment &&
                      request.status === "pending_finance" && (
                        <p className="mt-3 text-sm text-blue-800">
                          Waiting for finance to review availability and
                          assign the requested devices.
                        </p>
                      )}

                    {request.status === "rejected" && (
                      <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
                        <p className="text-sm font-semibold text-red-800">
                          Rejection reason
                          {rejectedBy
                            ? ` — ${readableRole(rejectedBy)}`
                            : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">
                          {rejectionReason ||
                            "No reason was recorded for this request."}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-4">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedRequests((previous) => ({
                            ...previous,
                            [request.id]: !previous[request.id],
                          }))
                        }
                        className="text-sm font-medium text-brand-deep underline"
                      >
                        {expanded ? "Hide details" : "View details"}
                      </button>

                      {equipment && request.status === "approved" && (
                        <a
                          href="/assets/borrowed"
                          className="text-sm font-medium text-brand-deep underline"
                        >
                          View equipment & returns
                        </a>
                      )}

                      {request.type === "per_diem" && (
                        <a
                          href={`/api/requests/${request.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-brand-deep underline"
                        >
                          Download PDF
                        </a>
                      )}
                    </div>

                    {expanded && (
                      <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 text-sm">
                        {request.justification && (
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              Justification
                            </h3>
                            <p className="mt-1 whitespace-pre-wrap text-gray-600">
                              {request.justification}
                            </p>
                          </div>
                        )}

                        {request.description && (
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              {request.type === "per_diem"
                                ? "Per diem details"
                                : "Description"}
                            </h3>
                            <p className="mt-1 whitespace-pre-wrap text-gray-600">
                              {request.description}
                            </p>
                          </div>
                        )}

                        <div>
                          <h3 className="font-semibold text-gray-800">
                            Approval history
                          </h3>

                          {approvals.length === 0 ? (
                            <p className="mt-1 text-gray-500">
                              No decisions recorded yet.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-3">
                              {approvals.map((approval, index) => (
                                <li
                                  key={`${approval.created_at}-${approval.role_at_time}-${index}`}
                                  className="rounded-lg bg-gray-50 p-3"
                                >
                                  <p className="font-medium text-gray-800">
                                    {readableRole(approval.role_at_time)}
                                    {" · "}
                                    {approval.decision}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {formatDate(approval.created_at)}
                                  </p>
                                  {approval.comment && (
                                    <p className="mt-2 whitespace-pre-wrap text-gray-600">
                                      {approval.comment}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!loading && !error && (
            <p className="mt-5 text-xs text-gray-500">
              Showing {filteredRequests.length} of {requests.length} requests.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}