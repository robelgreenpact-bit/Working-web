"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Attachment = {
  id: string;
  file_url: string;
  signed_url: string | null;
};

type Approval = {
  decision: string;
  comment: string | null;
  role_at_time: string;
  created_at: string;
  approver: { name: string } | null;
};

type RequestRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  requested_item_name?: string | null;
  item_name?: string | null;
  electronics_subcategory?: string | null;
  quantity: number | null;
  estimated_cost: number | string | null;
  justification: string | null;
  created_at: string;
  attachments?: Attachment[];
  requester: { name: string; email: string } | null;
};

type HistoryRow = RequestRow & {
  status: string;
  tax_registered: boolean;
  tax_reference: string | null;
  approvals: Approval[];
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

function isEquipment(request: RequestRow) {
  return (
    request.type === "electronics" &&
    ["tablet", "pc"].includes(
      request.electronics_subcategory || "",
    )
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function equipmentTypeLabel(value: string | null | undefined) {
  if (value === "tablet") return "Tablet";
  if (value === "pc") return "PC";
  if (value === "other") return "Other electronics";
  return "Not recorded";
}

function getError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

async function fetchRequests<T>(
  url: string,
  signal: AbortSignal,
): Promise<T[]> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load requests.");
  }

  if (!Array.isArray(data.requests)) {
    throw new Error("The request list is incomplete.");
  }

  return data.requests;
}

function RequestDetails({ request }: { request: RequestRow }) {
  const equipment = isEquipment(request);
  const itemName =
    request.requested_item_name || request.item_name;

  const cost = Number(request.estimated_cost);

  return (
    <div className="mt-4 space-y-4">
      {(itemName || request.type === "electronics") && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Item name</dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {itemName || "Not recorded"}
              </dd>
            </div>

            {request.type === "electronics" && (
              <div>
                <dt className="text-gray-500">Equipment type</dt>
                <dd className="mt-1 font-semibold text-gray-900">
                  {equipmentTypeLabel(
                    request.electronics_subcategory,
                  )}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-gray-500">Requested quantity</dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {request.quantity ?? "Not recorded"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {!itemName &&
        request.type !== "electronics" &&
        request.quantity !== null && (
          <p className="text-sm text-gray-700">
            <span className="font-medium">Quantity:</span>{" "}
            {request.quantity}
          </p>
        )}

      {!equipment &&
        Number.isFinite(cost) &&
        cost > 0 && (
          <p className="text-sm text-gray-700">
            <span className="font-medium">Estimated cost:</span>{" "}
            {cost.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            ETB
          </p>
        )}

      {request.justification && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Justification
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
            {request.justification}
          </p>
        </div>
      )}

      {request.description && (
        <div
          className={
            request.type === "per_diem"
              ? "rounded-lg border border-amber-100 bg-amber-50 p-4"
              : ""
          }
        >
          <h3 className="text-sm font-semibold text-gray-800">
            {request.type === "per_diem"
              ? "Per Diem Details"
              : "Description"}
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600">
            {request.description.replace(/\*\*/g, "")}
          </p>
        </div>
      )}

      {Boolean(request.attachments?.length) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Attachments
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {request.attachments?.map((attachment) => (
              <li key={attachment.id}>
                {attachment.signed_url ? (
                  <a
                    href={attachment.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-brand-deep underline"
                  >
                    {attachment.file_url.split("/").pop() ||
                      "Open attachment"}
                  </a>
                ) : (
                  <span className="break-all text-gray-500">
                    {attachment.file_url.split("/").pop() ||
                      "Attachment"}{" "}
                    — unavailable
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ManagerApprovalsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [pendingError, setPendingError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [notice, setNotice] = useState("");

  const [refreshVersion, setRefreshVersion] = useState(0);
  const [commentDrafts, setCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const decisionInProgress = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchRequests<RequestRow>(
      "/api/manager/requests",
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) {
          setRequests(rows);
          setPendingError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPendingError(getError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    fetchRequests<HistoryRow>(
      "/api/manager/history",
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) {
          setHistory(rows);
          setHistoryError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setHistoryError(getError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion]);

  function refresh() {
    setLoading(true);
    setHistoryLoading(true);
    setPendingError("");
    setHistoryError("");
    setRefreshVersion((previous) => previous + 1);
  }

  async function handleDecision(
    id: string,
    decision: "approved" | "rejected",
  ) {
    if (decisionInProgress.current) return;

    const comment = (commentDrafts[id] || "").trim();

    setDecisionError("");
    setNotice("");

    if (decision === "rejected" && !comment) {
      setDecisionError(
        "Enter a rejection reason in the comment box for this request.",
      );
      return;
    }

    decisionInProgress.current = true;
    setProcessing(id);

    try {
      const response = await fetch(
        `/api/manager/requests/${id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            comment,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to submit the decision.",
        );
      }

      setRequests((previous) =>
        previous.filter((request) => request.id !== id),
      );

      setCommentDrafts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });

      setNotice(
        decision === "approved"
          ? "Request approved and sent to finance."
          : "Request rejected with your reason.",
      );

      refresh();
    } catch (error) {
      setDecisionError(
        `${getError(error)} Refresh the list before trying again.`,
      );
    } finally {
      decisionInProgress.current = false;
      setProcessing(null);
    }
  }

  const searchText = search.trim().toLowerCase();

  const visibleRequests = requests.filter((request) =>
    [
      request.title,
      request.requested_item_name,
      request.item_name,
      request.requester?.name,
      request.requester?.email,
      request.justification,
    ].some((value) => value?.toLowerCase().includes(searchText)),
  );

  return (
    <div>
      <Navbar title="Manager Approvals" />

      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">
              Manager Approvals
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Review requests before sending them to finance.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/assets/borrowed"
              className="rounded-lg border border-brand-deep px-4 py-2.5 text-sm font-medium text-brand-deep"
            >
              Borrowed & Returns
            </a>
            <button
              type="button"
              onClick={refresh}
              disabled={
                loading || historyLoading || processing !== null
              }
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {notice && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {notice}
          </p>
        )}

        {decisionError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {decisionError}
          </p>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700">
            Search pending requests
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Worker, item name, or request title"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
            />
          </label>
        </div>

        <h2 className="mb-4 text-xl font-semibold text-brand-deep">
          Pending approval
          {!loading && !pendingError && ` (${requests.length})`}
        </h2>

        {loading ? (
          <p role="status" className="py-6 text-gray-500">
            Loading pending requests...
          </p>
        ) : pendingError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
          >
            {pendingError}
          </p>
        ) : visibleRequests.length === 0 ? (
          <p className="rounded-xl border bg-white p-6 text-gray-500">
            {requests.length === 0
              ? "No requests are waiting for your approval."
              : "No pending requests match your search."}
          </p>
        ) : (
          <div className="space-y-5">
            {visibleRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {request.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      From {request.requester?.name || "Unknown"}
                      {request.requester?.email
                        ? ` (${request.requester.email})`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {typeLabels[request.type] ||
                        request.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Submitted {formatDate(request.created_at)}
                  </p>
                </div>

                <RequestDetails request={request} />

                {isEquipment(request) && (
                  <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    Approval sends this request to finance. Finance
                    checks stock and selects the individual devices.
                  </p>
                )}

                <label className="mt-5 block text-sm font-medium text-gray-700">
                  Comment / rejection reason
                  <textarea
                    rows={3}
                    value={commentDrafts[request.id] || ""}
                    disabled={processing !== null}
                    onChange={(event) =>
                      setCommentDrafts((previous) => ({
                        ...previous,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="Optional when approving. Required when rejecting."
                    className="mt-1 block w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900 disabled:bg-gray-50"
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleDecision(request.id, "approved")
                    }
                    disabled={processing !== null}
                    className="rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {processing === request.id
                      ? "Processing..."
                      : "Approve & send to finance"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDecision(request.id, "rejected")
                    }
                    disabled={
                      processing !== null ||
                      !(commentDrafts[request.id] || "").trim()
                    }
                    className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>

                  {request.type === "per_diem" && (
                    <a
                      href={`/api/requests/${request.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-800"
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <h2 className="mb-4 mt-10 text-xl font-semibold text-brand-deep">
          History
        </h2>

        {historyLoading ? (
          <p role="status" className="py-6 text-gray-500">
            Loading history...
          </p>
        ) : historyError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
          >
            {historyError}
          </p>
        ) : history.length === 0 ? (
          <p className="rounded-xl border bg-white p-6 text-gray-500">
            No approval history yet.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {request.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      From {request.requester?.name || "Unknown"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {typeLabels[request.type] || request.type}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      request.status === "rejected"
                        ? "bg-red-100 text-red-800"
                        : request.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {statusLabels[request.status] ||
                      request.status.replaceAll("_", " ")}
                  </span>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-brand-deep">
                    Request details
                  </summary>
                  <RequestDetails request={request} />
                </details>

                {Boolean(request.approvals?.length) && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    {[...request.approvals]
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime(),
                      )
                      .map((approval, index) => (
                        <div
                          key={`${approval.created_at}-${index}`}
                          className="text-sm text-gray-600"
                        >
                          <p>
                            <span className="font-medium capitalize">
                              {approval.role_at_time}
                            </span>
                            {" "}
                            ({approval.approver?.name || "Unknown"}):
                            {" "}
                            <span className="font-medium">
                              {approval.decision}
                            </span>
                          </p>
                          {approval.comment && (
                            <p className="mt-1 whitespace-pre-wrap">
                              {approval.comment}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            {formatDate(approval.created_at)}
                          </p>
                        </div>
                      ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
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

                  {!isEquipment(request) &&
                    request.status === "approved" && (
                      <p className="text-xs text-gray-600">
                        {request.tax_registered
                          ? `Registered for tax/books${
                              request.tax_reference
                                ? ` — ${request.tax_reference}`
                                : ""
                            }`
                          : "Not yet registered for tax/books"}
                      </p>
                    )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}