"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type PaymentItem = {
  id: string;
  item_name: string;
  description: string | null;
  unit: string | null;
  qty: number;
  unit_price: number;
  total_price: number;
};

type PaymentRequestRow = {
  id: string;
  pr_number: string;
  title: string;
  project_class: string | null;
  activity_line: string;
  suggested_vendor: string | null;
  supply_priority: string;
  amount: number;
  status: string;
  creator_name?: string;
  creator_email?: string;
  created_at: string;
  payment_request_items: PaymentItem[];
};

type HistoryPaymentRow = PaymentRequestRow & {
  decision_comment: string | null;
};

export default function ManagerPaymentsPage() {
  const [pending, setPending] = useState<PaymentRequestRow[]>([]);
  const [history, setHistory] = useState<HistoryPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activityLine, setActivityLine] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const loadAll = async () => {
    setLoading(true);
    const res = await fetch("/api/manager/payment-requests");
    const data = await res.json();
    const all: PaymentRequestRow[] = data.requests || [];
    setPending(all.filter((r) => r.status === "pending_manager"));
    setHistory(
      all.filter((r) => r.status !== "pending_manager") as HistoryPaymentRow[],
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDecision = async (
    id: string,
    decision: "approved" | "rejected",
  ) => {
    const res = await fetch(`/api/manager/payment-requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comment[id] || "" }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to submit decision");
      return;
    }

    loadAll();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/manager/payment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_line: activityLine,
        description,
        amount: Number(amount),
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to submit payment request");
      return;
    }

    setActivityLine("");
    setAmount("");
    setDescription("");
    setShowForm(false);
    loadAll();
  };

  return (
    <div>
      <Navbar title="Payment Approvals" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-brand-deep">
            Purchase Request Approvals
          </h1>
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            {showForm ? "Cancel" : "+ Submit My Own PR"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-lg border-l-4 border-brand bg-white p-6 shadow"
          >
            {error && (
              <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm text-gray-600">
                  Purpose / Activity Line
                </label>
                <input
                  required
                  value={activityLine}
                  onChange={(e) => setActivityLine(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Amount (ETB)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Description
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit PR"}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : pending.length === 0 ? (
          <div className="rounded-lg border-l-4 border-brand bg-white p-6 text-gray-500 shadow">
            No payment requests waiting for your approval.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border-l-4 border-brand bg-white p-6 shadow"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      PR #{r.pr_number} — {r.activity_line}
                    </h2>
                    <p className="text-sm text-gray-500">
                      From {r.creator_name || "Unknown"} ({r.creator_email})
                      {r.project_class && ` — ${r.project_class}`}
                    </p>
                  </div>
                  <span className="rounded bg-brand/20 px-2 py-1 text-xs capitalize text-brand-deep">
                    {r.supply_priority}
                  </span>
                </div>

                {r.suggested_vendor && (
                  <p className="mb-2 text-sm text-gray-700">
                    Suggested Vendor: {r.suggested_vendor}
                  </p>
                )}

                <table className="mb-2 w-full text-left text-xs text-gray-700">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="pb-1">Item</th>
                      <th className="pb-1">Description</th>
                      <th className="pb-1">Unit</th>
                      <th className="pb-1">Qty</th>
                      <th className="pb-1">Unit Price</th>
                      <th className="pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.payment_request_items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="py-1">{it.item_name}</td>
                        <td className="py-1">{it.description || "—"}</td>
                        <td className="py-1">{it.unit || "—"}</td>
                        <td className="py-1">{it.qty}</td>
                        <td className="py-1">{it.unit_price}</td>
                        <td className="py-1">{it.total_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mb-3 text-right text-sm font-semibold text-gray-800">
                  Total: {r.amount} ETB
                </p>
                <div className="mb-3 flex justify-end">
                  <button
                    onClick={() =>
                      (window.location.href = `/api/payment-requests/${r.id}/download`)
                    }
                    className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-300"
                  >
                    Download PR
                  </button>
                </div>
                <textarea
                  placeholder="Optional comment..."
                  value={comment[r.id] || ""}
                  onChange={(e) =>
                    setComment({ ...comment, [r.id]: e.target.value })
                  }
                  rows={2}
                  className="mb-3 w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecision(r.id, "approved")}
                    className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(r.id, "rejected")}
                    className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
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

        {history.length === 0 ? (
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
                    <p className="font-medium">
                      PR #{r.pr_number} — {r.activity_line}
                    </p>
                    <p className="text-sm text-gray-500">
                      From {r.creator_name || "Unknown"} — {r.amount} ETB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        r.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : r.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {r.status}
                    </span>
                    <button
                      onClick={() =>
                        (window.location.href = `/api/payment-requests/${r.id}/download`)
                      }
                      className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-300"
                    >
                      Download
                    </button>
                  </div>
                </div>
                {r.decision_comment && (
                  <p className="mt-2 border-t pt-2 text-sm text-gray-600">
                    Comment: &quot;{r.decision_comment}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
