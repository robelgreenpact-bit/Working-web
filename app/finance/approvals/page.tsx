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
  purchase_quantity: number;
  asset_category: string | null;
  item_name: string | null;
  electronics_subcategory: string | null;
  estimated_cost: number;
  justification: string | null;
  created_at: string;
  attachments: Attachment[];
  requester: { name: string; email: string } | null;
};

type HistoryRow = RequestRow & {
  status: string;
  fulfillment_status: string;
  request_assets: {
    id: string;
    fulfillment_mode: string;
    source: string;
    due_date: string | null;
    asset: LoanChoice | null;
  }[];
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
  electronics_subcategory?: string | null;
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
  const [purchaseAssets, setPurchaseAssets] = useState<LoanChoice[]>([]);
  const [purchaseSelections, setPurchaseSelections] = useState<Record<string, string[]>>({});
  const [purchaseModes, setPurchaseModes] = useState<Record<string, string>>({});
  const [purchaseDueDates, setPurchaseDueDates] = useState<Record<string, string>>({});
  const [purchaseSearches, setPurchaseSearches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [arrivalSerials, setArrivalSerials] = useState<Record<string, string[]>>({});
  const [receivingRequest, setReceivingRequest] = useState<string | null>(null);
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
    const nextRequests: RequestRow[] = data.requests || [];
    setRequests(nextRequests);
    setPurchaseSelections((current) => {
      const next = { ...current };
      for (const request of nextRequests) {
        if (["electronics", "physical_good", "other_asset"].includes(request.type) && !next[request.id]) {
          next[request.id] = Array(Math.max(1, request.quantity || 1)).fill("");
        }
      }
      return next;
    });
    setLoading(false);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/finance/history");
    const data = await res.json();
    const nextHistory: HistoryRow[] = data.requests || [];
    setHistory(nextHistory);
    setArrivalSerials((current) => {
      const next = { ...current };
      for (const request of nextHistory) {
        const receivedCount = request.request_assets.filter((asset) => asset.source === "purchase").length;
        const remainingCount = Math.max(0, request.purchase_quantity - receivedCount);
        if (!next[request.id] || next[request.id].length !== remainingCount) {
          next[request.id] = Array(remainingCount).fill("");
        }
      }
      return next;
    });
    setHistoryLoading(false);
  };

  const registerArrivedAssets = async (request: HistoryRow) => {
    const serialNumbers = (arrivalSerials[request.id] || []).map((serial) => serial.trim()).filter(Boolean);
    if (!serialNumbers.length) {
      alert("Enter at least one received unit's serial number.");
      return;
    }

    setReceivingRequest(request.id);
    const res = await fetch(`/api/finance/requests/${request.id}/receive-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial_numbers: serialNumbers }),
    });
    const data = await res.json();
    setReceivingRequest(null);
    if (!res.ok) {
      alert(data.error || "Failed to register received assets");
      return;
    }
    const createdLabels = (data.assets || []).map(
      (asset: { asset_tag: string; serial_number: string }) => `${asset.asset_tag} (SN ${asset.serial_number})`,
    );
    alert(`Registered and assigned: ${createdLabels.join(", ")}`);
    loadHistory();
  };

  useEffect(() => {
    fetch("/api/finance/requests")
      .then((res) => res.json())
      .then((data) => {
        const nextRequests: RequestRow[] = data.requests || [];
        setRequests(nextRequests);
        setPurchaseSelections(
          Object.fromEntries(
            nextRequests
              .filter((request) => ["electronics", "physical_good", "other_asset"].includes(request.type))
              .map((request) => [request.id, Array(Math.max(1, request.quantity || 1)).fill("")]),
          ),
        );
        setLoading(false);
      });
    fetch("/api/finance/history")
      .then((res) => res.json())
      .then((data) => {
        const nextHistory: HistoryRow[] = data.requests || [];
        setHistory(nextHistory);
        setArrivalSerials(
          Object.fromEntries(
            nextHistory.map((request) => {
              const receivedCount = request.request_assets.filter((asset) => asset.source === "purchase").length;
              return [request.id, Array(Math.max(0, request.purchase_quantity - receivedCount)).fill("")];
            }),
          ),
        );
        setHistoryLoading(false);
      });
    fetch("/api/assets/available")
      .then((res) => res.json())
      .then((data) => setPurchaseAssets(data.assets || []))
      .catch(() => setPurchaseAssets([]));
  }, []);

  const handleDecision = async (
    id: string,
    decision: "approved" | "rejected",
  ) => {
    const requestRow = requests.find((request) => request.id === id);
    const isDurable = Boolean(requestRow && ["electronics", "physical_good", "other_asset"].includes(requestRow.type));
    const selections = purchaseSelections[id] || [];
    if (decision === "approved" && isDurable) {
      const expectedQuantity = Math.max(1, requestRow?.quantity || 1);
      if (selections.length !== expectedQuantity || selections.some((selection) => !selection)) {
        alert("Select an inventory unit or mark each unit as needs purchase.");
        return;
      }
      const selectedIds = selections.filter((selection) => selection !== "purchase");
      if (new Set(selectedIds).size !== selectedIds.length) {
        alert("Select a different inventory unit for each requested item.");
        return;
      }
      if (selections.some(Boolean) && purchaseModes[id] === "lend" && !purchaseDueDates[id]) {
        alert("Choose a return date for units being lent.");
        return;
      }
    }

    setProcessing(id);
    const res = await fetch(`/api/finance/requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        comment: commentDrafts[id] || "",
        forTaxRegistry: taxRegistryChoice[id] || false,
        assetIds: selections.filter((selection) => selection !== "purchase"),
        fulfillmentMode: purchaseModes[id] || "assign",
        purchaseQuantity: selections.filter((selection) => selection === "purchase").length,
        dueDate: purchaseDueDates[id] || null,
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

  const compatibleAssets = (request: RequestRow) => {
    const hasDistinctItemName = Boolean(request.item_name && request.item_name !== request.title);
    return purchaseAssets.filter((asset) =>
      asset.category === (request.asset_category || (request.type === "electronics" ? "electronics" : "other")) &&
      (!hasDistinctItemName || asset.item_name === request.item_name) &&
      (request.type !== "electronics" || (
        (!request.electronics_subcategory || asset.electronics_subcategory === request.electronics_subcategory) &&
        Boolean(asset.serial_number?.trim())
      )),
    );
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

                {["electronics", "physical_good", "other_asset"].includes(r.type) && (
                  <section className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">Assign requested units</h3>
                        <p className="text-sm text-gray-600">
                          {r.item_name || r.title}
                          {r.electronics_subcategory ? ` · ${r.electronics_subcategory.toUpperCase()}` : ""}
                          {` · Quantity ${Math.max(1, r.quantity || 1)}`}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {compatibleAssets(r).length} matching units available
                      </span>
                    </div>

                    <div className="space-y-3">
                      {Array.from({ length: Math.max(1, r.quantity || 1) }, (_, unitIndex) => {
                        const searchKey = `${r.id}-${unitIndex}`;
                        const searchTerm = (purchaseSearches[searchKey] || "").trim().toLowerCase();
                        const selected = purchaseSelections[r.id]?.[unitIndex] || "";
                        const candidates = compatibleAssets(r).filter((asset) =>
                          !searchTerm || [asset.asset_tag, asset.serial_number, asset.item_name]
                            .some((value) => value?.toLowerCase().includes(searchTerm)),
                        );
                        return (
                          <div key={searchKey} className="grid gap-2 sm:grid-cols-[5rem_1fr_2fr] sm:items-center">
                            <span className="text-sm font-medium text-gray-700">Unit {unitIndex + 1}</span>
                            <input
                              type="search"
                              value={purchaseSearches[searchKey] || ""}
                              onChange={(e) => setPurchaseSearches({ ...purchaseSearches, [searchKey]: e.target.value })}
                              placeholder="Scan/type serial"
                              aria-label={`Search serial number for unit ${unitIndex + 1}`}
                              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                            <select
                              value={selected}
                              onChange={(e) => {
                                const next = [...(purchaseSelections[r.id] || [])];
                                next[unitIndex] = e.target.value;
                                setPurchaseSelections({ ...purchaseSelections, [r.id]: next });
                              }}
                              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            >
                              <option value="">Select available unit</option>
                              <option value="purchase">Needs purchase</option>
                              {candidates.map((asset) => (
                                <option
                                  key={asset.id}
                                  value={asset.id}
                                  disabled={(purchaseSelections[r.id] || []).some(
                                    (assetId, index) => assetId === asset.id && index !== unitIndex,
                                  )}
                                >
                                  {asset.asset_tag}{asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
                                  {asset.location ? ` · ${asset.location}` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-gray-700">
                          Fulfillment
                          <select
                            value={purchaseModes[r.id] || "assign"}
                            onChange={(e) => setPurchaseModes({ ...purchaseModes, [r.id]: e.target.value })}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          >
                            <option value="assign">Assign permanently</option>
                            <option value="lend">Lend (returnable)</option>
                          </select>
                        </label>
                        {purchaseModes[r.id] === "lend" && (
                          <label className="text-sm text-gray-700">
                            Return date
                            <input
                              type="date"
                              min={new Date().toISOString().slice(0, 10)}
                              value={purchaseDueDates[r.id] || ""}
                              onChange={(e) => setPurchaseDueDates({ ...purchaseDueDates, [r.id]: e.target.value })}
                              className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                          </label>
                        )}
                    </div>
                  </section>
                )}

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
                    disabled={processing === r.id || (
                      ["electronics", "physical_good", "other_asset"].includes(r.type) &&
                      ((purchaseSelections[r.id] || []).length !== Math.max(1, r.quantity || 1) ||
                        (purchaseSelections[r.id] || []).some((selection) => !selection) ||
                        ((purchaseSelections[r.id] || []).some(Boolean) &&
                          purchaseModes[r.id] === "lend" && !purchaseDueDates[r.id]))
                    )}
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

                {r.fulfillment_status && r.fulfillment_status !== "not_applicable" && (
                  <p className="mt-2 text-sm font-medium capitalize text-gray-700">
                    Fulfillment: {r.fulfillment_status.replaceAll("_", " ")}
                  </p>
                )}

                {r.status === "approved" && r.purchase_quantity > 0 && (
                  (() => {
                    const receivedCount = (r.request_assets || []).filter((asset) => asset.source === "purchase").length;
                    const remainingCount = Math.max(0, r.purchase_quantity - receivedCount);
                    if (remainingCount === 0) return null;
                    return (
                      <section className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
                        <p className="mb-2 text-sm font-medium text-amber-900">
                          Register arrived units ({remainingCount} remaining)
                        </p>
                        <div className="space-y-2">
                          {Array.from({ length: remainingCount }, (_, index) => (
                            <input
                              key={`${r.id}-arrival-${index}`}
                              type="text"
                              value={arrivalSerials[r.id]?.[index] || ""}
                              onChange={(e) => {
                                const next = [...(arrivalSerials[r.id] || Array(remainingCount).fill(""))];
                                next[index] = e.target.value;
                                setArrivalSerials({ ...arrivalSerials, [r.id]: next });
                              }}
                              placeholder={`Serial number for received unit ${index + 1}`}
                              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => registerArrivedAssets(r)}
                          disabled={receivingRequest === r.id || !(arrivalSerials[r.id] || []).some((serial) => serial.trim())}
                          className="mt-3 rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {receivingRequest === r.id ? "Registering..." : "Register received units"}
                        </button>
                      </section>
                    );
                  })()
                )}

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

                {(r.request_assets || []).length > 0 && (
                  <div className="mt-2 border-t pt-2 text-sm">
                    <p className="font-medium text-gray-800">Units assigned by finance</p>
                    <ul className="mt-1 space-y-1 text-gray-600">
                      {r.request_assets.map((assigned) => (
                        <li key={assigned.id}>
                          {assigned.asset?.asset_tag || "Asset"}
                          {assigned.asset?.serial_number ? ` · SN ${assigned.asset.serial_number}` : ""}
                          {` · ${assigned.fulfillment_mode === "lend" ? "Lent" : "Assigned"}`}
                          {assigned.source === "purchase" ? " · Purchased" : " · From inventory"}
                        </li>
                      ))}
                    </ul>
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
