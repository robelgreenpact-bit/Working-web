"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type RequestItem = {
  id: string;
  kind: "request";
  title: string;
  type: string;
  estimated_cost: number;
  tax_registered: boolean;
  tax_reference: string | null;
  requester: { name: string; email: string } | null;
};

type PaymentItem = {
  id: string;
  kind: "payment";
  pr_number: string;
  activity_line: string;
  amount: number;
  tax_registered: boolean;
  tax_reference: string | null;
  creator: { name: string; email: string } | null;
};

type ReceiptItem = {
  id: string;
  kind: "receipt";
  invoice_no: string | null;
  payer_name: string | null;
  credited_party_name: string | null;
  amount: number;
  tax_registered: boolean;
  tax_reference: string | null;
};

type QueueItem = RequestItem | PaymentItem | ReceiptItem;

export default function AccountantRegisterPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refDrafts, setRefDrafts] = useState<Record<string, string>>({});
  const [showRegistered, setShowRegistered] = useState(false);

  const loadQueue = async () => {
    setLoading(true);
    const res = await fetch("/api/accountant/queue");
    const data = await res.json();
    const receiptsWithKind: ReceiptItem[] = (data.receipts || []).map(
      (r: Omit<ReceiptItem, "kind">) => ({ ...r, kind: "receipt" as const }),
    );
    const all: QueueItem[] = [
      ...(data.requests || []),
      ...(data.payments || []),
      ...receiptsWithKind,
    ];
    setItems(all);
    setLoading(false);
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleRegister = async (
    id: string,
    kind: "request" | "payment" | "receipt",
  ) => {
    const reference = refDrafts[id] || "";

    const endpoint =
      kind === "receipt"
        ? "/api/receipts/register"
        : "/api/accountant/register";

    const body =
      kind === "receipt" ? { id, reference } : { id, kind, reference };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to register");
      return;
    }

    loadQueue();
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm("Remove this request from tax registry queue?")) return;

    const res = await fetch(`/api/requests/${id}/tax-registry`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to remove request");
      return;
    }

    loadQueue();
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm("Remove this payment from tax registry queue?")) return;

    const res = await fetch(`/api/payment-requests/${id}/tax-registry`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to remove payment");
      return;
    }

    loadQueue();
  };

  const handleDeleteReceipt = async (id: string) => {
    if (!confirm("Delete this receipt entry? This cannot be undone.")) return;

    const res = await fetch(`/api/receipts/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to delete receipt");
      return;
    }

    loadQueue();
  };

  const filteredItems = items.filter((i) =>
    showRegistered ? true : !i.tax_registered,
  );

  return (
    <div>
      <Navbar title="Registration Queue" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">
            Tax / Books Registration
          </h1>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showRegistered}
              onChange={(e) => setShowRegistered(e.target.checked)}
            />
            Show already registered
          </label>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border-l-4 border-brand bg-white p-6 text-gray-500 shadow">
            Nothing to register right now.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="rounded-lg border-l-4 border-brand bg-white p-6 shadow"
              >
                {item.kind === "request" ? (
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-gray-500">
                        Worker Request — {(item.type || "").replace("_", " ")} — From{" "}
                        {item.requester?.name || "Unknown"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        {item.estimated_cost} ETB
                      </span>
                      <button
                        onClick={() => handleDeleteRequest(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : item.kind === "payment" ? (
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">
                        PR #{item.pr_number} — {item.activity_line}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Finance Payment — From {item.creator?.name || "Unknown"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        {item.amount} ETB
                      </span>
                      <button
                        onClick={() => handleDeletePayment(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">
                        Receipt {item.invoice_no ? `#${item.invoice_no}` : ""}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {item.payer_name || "Unknown payer"} →{" "}
                        {item.credited_party_name || "Unknown recipient"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        {item.amount} ETB
                      </span>
                      <button
                        onClick={() => handleDeleteReceipt(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {item.tax_registered ? (
                  <p className="text-sm text-green-700">
                    ✓ Registered{" "}
                    {item.tax_reference && `— Ref: ${item.tax_reference}`}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Reference / ledger number (optional)"
                      value={refDrafts[item.id] || ""}
                      onChange={(e) =>
                        setRefDrafts({
                          ...refDrafts,
                          [item.id]: e.target.value,
                        })
                      }
                      className="flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                    />
                    <button
                      onClick={() => handleRegister(item.id, item.kind)}
                      className="rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
                    >
                      Mark Registered
                    </button>
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
