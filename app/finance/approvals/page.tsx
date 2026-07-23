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

type AvailableAsset = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  category: string;
};

function daysAgo(dateStr: string) {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function FinancePage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [processing, setProcessing] = useState<string | null>(null);
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [inventoryChoice, setInventoryChoice] = useState<
    Record<string, string>
  >({});

  const loadData = async () => {
    setLoading(true);
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

  useEffect(() => {
    loadData();
    loadHistory();
    fetch("/api/assets/available")
      .then((res) => res.json())
      .then((data) => setAvailableAssets(data.assets || []))
      .catch(() => {});
  }, []);

  const handleDecision = async (
    id: string,
    decision: "approved" | "rejected"
  ) => {
    setProcessing(id);
    const chosenAssetId = inventoryChoice[id];
    const res = await fetch(`/api/finance/requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        comment: commentDrafts[id] || "",
        issueFromInventory: !!chosenAssetId,
        assetId: chosenAssetId || null,
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
                      {r.requester?.email}) — {r.type.replace("_", " ")}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    Submitted {daysAgo(r.created_at)}
                  </span>
                </div>

                {r.description && (
                  <p className="mb-2 text-sm text-gray-700">
                    {r.description}
                  </p>
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
                            
                             <a href={a.signed_url}
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

                {(r.type === "physical_good" || r.type === "other_asset") && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Fulfill from Inventory (optional)
                    </label>
                    <select
                      value={inventoryChoice[r.id] || ""}
                      onChange={(e) =>
                        setInventoryChoice({
                          ...inventoryChoice,
                          [r.id]: e.target.value,
                        })
                      }
                      className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                    >
                      <option value="">— Buy new instead —</option>
                      {availableAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.asset_tag} — {a.item_name} ({a.category})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

                <div className="flex gap-3">
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
                    className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
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
                      {r.type.replace("_", " ")}
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
                    {r.status.replace("_", " ")}
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