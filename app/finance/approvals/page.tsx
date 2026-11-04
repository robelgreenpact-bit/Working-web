"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Attachment = {
  id: string;
  file_url: string;
  signed_url: string | null;
};

type RequestRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  quantity: number | null;
  estimated_cost: number;
  justification: string | null;
  created_at: string;
  attachments: Attachment[];
  requester: { name: string; email: string } | null;
};

type HistoryRow = RequestRow & {
  status: string;
  tax_registered: boolean;
  tax_reference: string | null;
  approvals: {
    decision: string;
    comment: string | null;
    role_at_time: string;
    created_at: string;
    approver: { name: string } | null;
  }[];
};

type LoanChoice = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  category: string | null;
  serial_number: string | null;
  location: string | null;
};

type FinanceLoanRequest = {
  id: string;
  purpose: string;
  due_date: string | null;
  requester: { name: string; email: string } | null;
  items: {
    id: string;
    asset_id: string;
    asset: LoanChoice | null;
    choices: LoanChoice[];
  }[];
};

function daysAgo(dateStr: string) {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function parsePerDiemDetails(description: string | null) {
  if (!description) return [] as Array<{ label: string; value: string }>;

  const lines = String(description)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/\*\*/g, ""))
    .map((line) => line.replace(/^\*\s*/, ""))
    .map((line) => line.replace(/^\*+/, ""))
    .map((line) => line.replace(/\*+$/, ""));

  const ignoredLines = new Set([
    "Perdium Request",
    "Per Diem Request",
    "Date:",
    "Title of Form: Field Allowance Evidence Form for Deploying Employees",
    "Main Table (Employee Details)",
    "Field Label (Left Column) | Field/Status (Right Column)",
    "Approval and Signatures Table",
    "Requester's Name & Signature | Reviewer's Name & Signature | Approver's Name & Signature",
    "Report Section",
    "Brief Report of the activities completed",
    "--------------------------------",
    "---",
  ]);

  return lines
    .filter((line) => !ignoredLines.has(line))
    .map((line) => {
      if (line.includes("|")) {
        const [left, right] = line.split("|");
        return { label: left.trim(), value: right?.trim() || "" };
      }
      const parts = line.split(":");
      if (parts.length >= 2) {
        return { label: parts[0].trim(), value: parts.slice(1).join(":").trim() };
      }
      return { label: line, value: "" };
    })
    .filter((item) => item.label && item.value);
}

const handleDownload = (requestId: string) => {
  window.open(`/api/requests/${requestId}/download`, "_blank");
};

export default function FinancePage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loanRequests, setLoanRequests] = useState<FinanceLoanRequest[]>([]);
  const [loanSelections, setLoanSelections] = useState<Record<string, string[]>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [processing, setProcessing] = useState<string | null>(null);
  const [taxRegistryChoice, setTaxRegistryChoice] = useState<
    Record<string, boolean>
  >({});

  const loadData = async () => {
    const res = await fetch("/api/finance/requests");
    const data = await res.json();
    setRequests(data.requests || []);
    setLoading(false);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/finance/history");
    const data = await res.json();
    setHistory(data.requests || []);
    setHistoryLoading(false);
  };

  const loadLoanRequests = async () => {
    const res = await fetch("/api/finance/asset-loans");
    const data = await res.json();
    const nextRequests: FinanceLoanRequest[] = data.requests || [];
    setLoanRequests(nextRequests);
    setLoanSelections((current) => {
      const next = { ...current };
      for (const loanRequest of nextRequests) {
        if (!next[loanRequest.id]) {
          next[loanRequest.id] = loanRequest.items.map((item) => item.asset_id);
        }
      }
      return next;
    });
  };

  const saveLoanSelection = async (loanRequest: FinanceLoanRequest) => {
    const assetIds = loanSelections[loanRequest.id] || [];
    if (assetIds.length !== loanRequest.items.length || assetIds.some((id) => !id)) {
      alert("Select an asset for every requested item.");
      return;
    }

    setProcessing(`loan-${loanRequest.id}`);
    const res = await fetch(`/api/finance/asset-loans/${loanRequest.id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_ids: assetIds }),
    });
    const data = await res.json();
    setProcessing(null);
    if (!res.ok) {
      alert(data.error || "Failed to save asset selection");
      return;
    }
    await loadLoanRequests();
  };

  useEffect(() => {
    fetch("/api/finance/requests")
      .then((res) => res.json())
      .then((data) => {
        setRequests(data.requests || []);
        setLoading(false);
      });
    fetch("/api/finance/history")
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.requests || []);
        setHistoryLoading(false);
      });
    fetch("/api/finance/asset-loans")
      .then((res) => res.json())
      .then((data) => {
        const nextRequests = data.requests || [];
        setLoanRequests(nextRequests);
        setLoanSelections(
          Object.fromEntries(
            nextRequests.map((loanRequest: FinanceLoanRequest) => [
              loanRequest.id,
              loanRequest.items.map((item) => item.asset_id),
            ]),
          ),
        );
      });
  }, []);

  const handleDecision = async (
    id: string,
    decision: "approved" | "rejected",
  ) => {
    setProcessing(id);
    const res = await fetch(`/api/finance/requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        comment: commentDrafts[id] || "",
        forTaxRegistry: taxRegistryChoice[id] || false,
      }),
    });

    const data = await res.json();
    setProcessing(null);

    if (!res.ok) {
      alert(data.error || "Failed to submit decision");
      return;
    }

    if (data.warning) {
      alert(data.warning);
    }

    loadData();
    loadHistory();
  };

  return (
    <div>
      <Navbar title="Approvals" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Pending Final Approval
        </h1>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-brand-deep">
            Approved borrow requests: select serial numbers
          </h2>
          {loanRequests.length === 0 ? (
            <div className="rounded-lg border-l-4 border-brand bg-white p-5 text-sm text-gray-500 shadow">
              No approved borrow requests are waiting for asset selection.
            </div>
          ) : (
            <div className="space-y-4">
              {loanRequests.map((loanRequest) => (
                <article key={loanRequest.id} className="rounded-lg border-l-4 border-brand bg-white p-5 shadow">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{loanRequest.purpose}</h3>
                      <p className="text-sm text-gray-500">
                        {loanRequest.requester?.name || "Requester"} ({loanRequest.requester?.email || ""})
                      </p>
                    </div>
                    <p className="text-sm text-gray-500">Due {loanRequest.due_date || "—"}</p>
                  </div>
                  <div className="space-y-3">
                    {loanRequest.items.map((item, index) => (
                      <label key={item.id} className="grid gap-2 text-sm sm:grid-cols-[minmax(12rem,1fr)_2fr] sm:items-center">
                        <span className="text-gray-700">
                          {item.asset?.item_name || "Requested item"} · {item.asset?.category || "other"}
                          {item.asset?.serial_number ? ` · Current SN ${item.asset.serial_number}` : ""}
                        </span>
                        <select
                          value={loanSelections[loanRequest.id]?.[index] || ""}
                          onChange={(e) => {
                            const nextSelections = [...(loanSelections[loanRequest.id] || [])];
                            nextSelections[index] = e.target.value;
                            setLoanSelections({ ...loanSelections, [loanRequest.id]: nextSelections });
                          }}
                          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="">Select serial-numbered asset</option>
                          {item.choices.map((choice) => (
                            <option
                              key={choice.id}
                              value={choice.id}
                              disabled={(loanSelections[loanRequest.id] || []).some(
                                (selectedId, selectedIndex) => selectedId === choice.id && selectedIndex !== index,
                              )}
                            >
                              {choice.item_name || "Unnamed"} · {choice.asset_tag}
                              {choice.serial_number ? ` · SN: ${choice.serial_number}` : " · No serial"}
                              {choice.location ? ` · ${choice.location}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">Saving confirms finance&apos;s item selection; admin confirms physical handover.</p>
                    <button
                      onClick={() => saveLoanSelection(loanRequest)}
                      disabled={processing === `loan-${loanRequest.id}`}
                      className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {processing === `loan-${loanRequest.id}` ? "Saving..." : "Save asset selection"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : requests.length === 0 ? (
          <div className="rounded-lg border-l-4 border-brand bg-white p-6 text-gray-500 shadow">
            No requests waiting for your approval.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border-l-4 border-brand bg-white p-6 shadow"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{r.title}</h2>
                    <p className="text-sm text-gray-500">
                      From {r.requester?.name || "Unknown"} (
                      {r.requester?.email}) — {(r.type || "").replace("_", " ")}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    Submitted {daysAgo(r.created_at)}
                  </span>
                </div>

                {r.type === "per_diem" ? (
                  <div className="mb-3 rounded border border-amber-100 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-amber-800">
                      Per Diem Details
                    </p>
                    <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                      {parsePerDiemDetails(r.description).map((item, index) => (
                        <div key={`${item.label}-${index}`}>
                          <span className="font-medium text-gray-900">
                            {item.label}:
                          </span>{" "}
                          {item.value}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  r.description && (
                    <p className="mb-2 text-sm text-gray-700">{r.description}</p>
                  )
                )}

                <div className="mb-2 flex gap-6 text-sm text-gray-700">
                  {r.quantity !== null && <span>Qty: {r.quantity}</span>}
                  {r.estimated_cost > 0 && (
                    <span>Cost: {r.estimated_cost} ETB</span>
                  )}
                </div>

                {r.justification && (
                  <p className="mb-2 text-sm italic text-gray-600">
                    Justification: {r.justification}
                  </p>
                )}

                {r.attachments && r.attachments.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">
                      Attachments:
                    </p>
                    <ul className="text-sm">
                      {r.attachments.map((a) => (
                        <li key={a.id}>
                          {a.signed_url ? (
                            <a
                              href={a.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-deep hover:underline"
                            >
                              {a.file_url.split("/").pop()}
                            </a>
                          ) : (
                            <span className="text-gray-400">
                              {a.file_url.split("/").pop()} (unavailable)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`tax-registry-${r.id}`}
                    checked={taxRegistryChoice[r.id] || false}
                    onChange={(e) =>
                      setTaxRegistryChoice({
                        ...taxRegistryChoice,
                        [r.id]: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-brand-deep focus:ring-brand-deep"
                  />
                  <label
                    htmlFor={`tax-registry-${r.id}`}
                    className="text-sm font-medium text-gray-700"
                  >
                    Send to Tax Registry
                  </label>
                </div>

                <textarea
                  placeholder="Optional comment..."
                  value={commentDrafts[r.id] || ""}
                  onChange={(e) =>
                    setCommentDrafts({
                      ...commentDrafts,
                      [r.id]: e.target.value,
                    })
                  }
                  rows={2}
                  className="mb-3 w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleDecision(r.id, "approved")}
                    disabled={processing === r.id}
                    className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(r.id, "rejected")}
                    disabled={processing === r.id}
                    className="rounded bg-red-600 px-4 py-2 text-sm font-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  {r.type === "per_diem" && (
                    <button
                      onClick={() => handleDownload(r.id)}
                      className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
                    >
                      Download PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-4 mt-10 text-xl font-bold text-brand-deep">
          History
        </h2>

        {historyLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : history.length === 0 ? (
          <div className="rounded-lg border-l-4 border-brand bg-white p-6 text-gray-500 shadow">
            No history yet.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border-l-4 border-brand bg-white p-4 shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-gray-500">
                      From {r.requester?.name || "Unknown"} —{" "}
                      {(r.type || "").replace("_", " ")}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-xs ${
                      r.status === "rejected"
                        ? "bg-red-100 text-red-800"
                        : r.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {(r.status || "").replace("_", " ")}
                  </span>
                </div>

                {r.status === "approved" && (
                  <p className="mt-1 text-xs">
                    {r.tax_registered ? (
                      <span className="text-green-700">
                        ✓ Registered for tax/books
                        {r.tax_reference && ` — Ref: ${r.tax_reference}`}
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        ⏳ Not yet registered
                      </span>
                    )}
                  </p>
                )}

                {r.approvals && r.approvals.length > 0 && (
                  <div className="mt-2 border-t pt-2 text-sm text-gray-600">
                    {r.approvals.map((a, idx) => (
                      <p key={idx}>
                        {a.role_at_time} ({a.approver?.name || "Unknown"}):{" "}
                        <span className="font-medium">{a.decision}</span>
                        {a.comment && ` — "${a.comment}"`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
