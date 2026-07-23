"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type LineItem = {
  item_name: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
};

type PaymentRequest = {
  id: string;
  pr_number: string;
  title: string;
  project_class: string | null;
  activity_line: string;
  suggested_vendor: string | null;
  supply_priority: string;
  amount: number;
  status: string;
  decision_comment: string | null;
  created_at: string;
  payment_request_items: {
    id: string;
    item_name: string;
    description: string | null;
    unit: string | null;
    qty: number;
    unit_price: number;
    total_price: number;
  }[];
};

const statusLabels: Record<string, string> = {
  pending_manager: "Pending Manager Approval",
  approved: "Approved — Ready to Pay",
  rejected: "Rejected",
  paid: "Paid",
};

const statusColors: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
};

const emptyItem = (): LineItem => ({
  item_name: "",
  description: "",
  unit: "",
  qty: 1,
  unit_price: 0,
});

export default function FinancePaymentsPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [projectClass, setProjectClass] = useState("");
  const [activityLine, setActivityLine] = useState("");
  const [vendor, setVendor] = useState("");
  const [priority, setPriority] = useState("regular");
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [files, setFiles] = useState<FileList | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    const res = await fetch("/api/payment-requests");
    const data = await res.json();
    setRequests(data.requests || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData();
    formData.append("project_class", projectClass);
    formData.append("activity_line", activityLine);
    formData.append("suggested_vendor", vendor);
    formData.append("supply_priority", priority);
    formData.append("items", JSON.stringify(items));

    if (files) {
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    }

    const res = await fetch("/api/payment-requests", {
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
    setItems([emptyItem()]);
    setFiles(null);
    setShowForm(false);
    loadRequests();
  };

  const handleMarkPaid = async (id: string) => {
    if (!confirm("Confirm this payment has been made?")) return;
    const res = await fetch(`/api/payment-requests/${id}/mark-paid`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to mark as paid");
      return;
    }
    loadRequests();
  };

  return (
    <div>
      <Navbar title="Payment Requests" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">
            Purchase Request Authorization
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
          >
            {showForm ? "Cancel" : "+ New PR"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
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
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
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
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Suggested Vendor(s)
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Supply Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                >
                  <option value="emergency">Emergency</option>
                  <option value="urgent">Urgent</option>
                  <option value="regular">Regular</option>
                </select>
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
                          onChange={(e) =>
                            updateItem(idx, "unit", e.target.value)
                          }
                          placeholder="e.g. number"
                          className="w-20 rounded border border-gray-300 p-1 text-gray-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(idx, "qty", e.target.value)
                          }
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
              {submitting ? "Submitting..." : "Submit for Approval"}
            </button>
          </form>
        )}

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-500">No payment requests yet.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => (
                <div key={r.id} className="rounded border border-gray-200 p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">PR #{r.pr_number}</h3>
                      <p className="text-sm text-gray-500">
                        {r.activity_line}
                        {r.project_class && ` — ${r.project_class}`} —{" "}
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-1 text-xs ${statusColors[r.status]}`}
                    >
                      {statusLabels[r.status]}
                    </span>
                  </div>

                  <table className="mb-2 w-full text-left text-xs text-gray-700">
                    <thead className="text-gray-400">
                      <tr>
                        <th className="pb-1">Item</th>
                        <th className="pb-1">Unit</th>
                        <th className="pb-1">Qty</th>
                        <th className="pb-1">Unit Price</th>
                        <th className="pb-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payment_request_items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-0.5">{it.item_name}</td>
                          <td className="py-0.5">{it.unit || "—"}</td>
                          <td className="py-0.5">{it.qty}</td>
                          <td className="py-0.5">{it.unit_price}</td>
                          <td className="py-0.5">{it.total_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="mb-1 text-sm font-medium">
                    Total: {r.amount} ETB
                  </p>

                  {r.decision_comment && (
                    <p className="mb-2 text-sm italic text-gray-600">
                      Manager comment: &quot;{r.decision_comment}&quot;
                    </p>
                  )}

                  <div className="mt-2 flex gap-2">
                    {r.status === "approved" && (
                      <button
                        onClick={() => handleMarkPaid(r.id)}
                        className="rounded bg-brand-deep px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
                      >
                        Mark as Paid
                      </button>
                    )}
                    <button
                      onClick={() =>
                        (window.location.href = `/api/payment-requests/${r.id}/download`)
                      }
                      className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-300"
                    >
                      Download PR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
