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

type LineItem = {
  item_name: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
};

const emptyItem = (): LineItem => ({
  item_name: "",
  description: "",
  unit: "",
  qty: 1,
  unit_price: 0,
});

export default function ManagerPaymentsPage() {
  const [pending, setPending] = useState<PaymentRequestRow[]>([]);
  const [history, setHistory] = useState<HistoryPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [projectClass, setProjectClass] = useState("");
  const [activityLine, setActivityLine] = useState("");
  const [vendor, setVendor] = useState("");
  const [priority, setPriority] = useState("regular");
  const [requiredDate, setRequiredDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [files, setFiles] = useState<FileList | null>(null);

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

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    const updated = [...items];
    if (field === "qty" || field === "unit_price") {
      updated[index][field] = Number(value) as never;
    } else {
      updated[index][field] = value as never;
    }
    setItems(updated);
  };

  const addItemRow = () => setItems([...items, emptyItem()]);
  const removeItemRow = (index: number) =>
    setItems(items.filter((_, i) => i !== index));

  const totalAmount = items.reduce(
    (sum, it) => sum + it.qty * it.unit_price,
    0,
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData();
    formData.append("project_class", projectClass);
    formData.append("activity_line", activityLine);
    formData.append("suggested_vendor", vendor);
    formData.append("supply_priority", priority);
    formData.append("required_date", requiredDate);
    formData.append("items", JSON.stringify(items));

    if (files) {
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    }

    const res = await fetch("/api/manager/payment-requests", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to submit payment request");
      return;
    }

    setProjectClass("");
    setActivityLine("");
    setVendor("");
    setPriority("regular");
    setRequiredDate("");
    setItems([emptyItem()]);
    setFiles(null);
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
            {showForm ? "Cancel" : "+ New PR"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-lg border-t-4 border-brand bg-white p-6 shadow"
          >
            {error && (
              <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Project Name / Class
                </label>
                <input
                  type="text"
                  value={projectClass}
                  onChange={(e) => setProjectClass(e.target.value)}
                  placeholder="e.g. Office_AA"
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Activity Line (Purpose)
                </label>
                <input
                  type="text"
                  required
                  value={activityLine}
                  onChange={(e) => setActivityLine(e.target.value)}
                  placeholder="e.g. perdiem"
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Reciver
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Supply Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                >
                  <option value="emergency">Emergency</option>
                  <option value="urgent">Urgent</option>
                  <option value="regular">Regular</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Required By Date
                </label>
                <input
                  type="date"
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900"
                />
              </div>
            </div>

            <label className="mb-1 block text-sm text-gray-600">Items</label>
            <div className="mb-3 overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2">Item Name</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Unit Price</th>
                    <th className="p-2">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1">
                        <input
                          type="text"
                          required
                          value={it.item_name}
                          onChange={(e) =>
                            updateItem(idx, "item_name", e.target.value)
                          }
                          className="w-full rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={it.description}
                          onChange={(e) =>
                            updateItem(idx, "description", e.target.value)
                          }
                          className="w-full rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={it.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                          placeholder="e.g. number"
                          className="w-20 rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={(e) => updateItem(idx, "qty", e.target.value)}
                          className="w-16 rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          min={0}
                          value={it.unit_price}
                          onChange={(e) =>
                            updateItem(idx, "unit_price", e.target.value)
                          }
                          className="w-24 rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-2 text-gray-700">
                        {(it.qty * it.unit_price).toFixed(2)}
                      </td>
                      <td className="p-1">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addItemRow}
              className="mb-4 text-sm text-brand-deep hover:underline"
            >
              + Add Item
            </button>

            <p className="mb-4 text-right text-sm font-semibold text-gray-700">
              Total: {totalAmount.toFixed(2)} ETB
            </p>

            <div className="mb-6">
              <label className="mb-1 block text-sm text-gray-600">
                Attachments (invoice, quote, etc.)
              </label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFiles(e.target.files)}
                className="w-full rounded border border-gray-300 p-2 text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
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
                    Reciver: {r.suggested_vendor}
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
