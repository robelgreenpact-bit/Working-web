"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Item = {
  id: string;
  kind: string;
  title?: string;
  activity_line?: string;
  pr_number?: string;
  invoice_no?: string;
  payer_name?: string;
  credited_party_name?: string;
  estimated_cost?: number;
  amount?: number;
  requester_name?: string;
  creator_name?: string;
  tax_registered: boolean;
  tax_reference: string | null;
};

export default function AdminRegistrationsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    invoice_no: "",
    payment_date: "",
    payer_name: "",
    credited_party_name: "",
    amount: "",
    payment_reason: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/registrations");
    const data = await res.json();
    setItems([
      ...(data.requests || []),
      ...(data.payments || []),
      ...(data.receipts || []),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    fetch("/api/dashboard-role")
      .then((res) => res.json())
      .then((data) => setRole(data.role || null));
  }, []);

  const canAddReceipt = role === "admin" || role === "finance";

  const handleOpenForm = async () => {
    if (showForm) {
      setShowForm(false);
      return;
    }
    const res = await fetch("/api/receipts/next-invoice");
    const data = await res.json();
    setForm((prev) => ({ ...prev, invoice_no: data.invoiceNo || "" }));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, value);
    });
    if (file) formData.append("file", file);

    const res = await fetch("/api/receipts", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to register receipt");
      return;
    }

    setForm({
      invoice_no: "",
      payment_date: "",
      payer_name: "",
      credited_party_name: "",
      amount: "",
      payment_reason: "",
    });
    setFile(null);
    setShowForm(false);
    loadData();
  };

  const kindLabel = (item: Item) => {
    if (item.kind === "request") return "Worker Request";
    if (item.kind === "payment") return "Finance Payment";
    return "Receipt";
  };

  const itemTitle = (item: Item) => {
    if (item.kind === "request") return item.title;
    if (item.kind === "payment")
      return `PR #${item.pr_number} — ${item.activity_line}`;
    return `Receipt ${item.invoice_no ? `#${item.invoice_no}` : ""}`;
  };

  const itemFrom = (item: Item) => {
    if (item.kind === "receipt") {
      return `${item.payer_name || "Unknown"} → ${
        item.credited_party_name || "Unknown"
      }`;
    }
    return item.requester_name || item.creator_name || "—";
  };

  return (
    <div>
      <Navbar title="Tax Registry" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">
            Tax / Books Registry
          </h1>
          {canAddReceipt && (
            <button
              onClick={handleOpenForm}
              className="rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              {showForm ? "Cancel" : "+ Register Receipt"}
            </button>
          )}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Invoice No.
                </label>
                <input
                  type="text"
                  value={form.invoice_no}
                  readOnly
                  className="w-full rounded border border-gray-300 bg-gray-100 p-2 text-gray-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={form.payment_date}
                  onChange={(e) =>
                    setForm({ ...form, payment_date: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payer Name
                </label>
                <input
                  type="text"
                  value={form.payer_name}
                  onChange={(e) =>
                    setForm({ ...form, payer_name: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Credited Party (Recipient)
                </label>
                <input
                  type="text"
                  value={form.credited_party_name}
                  onChange={(e) =>
                    setForm({ ...form, credited_party_name: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Amount (ETB)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payment Reason (optional)
                </label>
                <input
                  type="text"
                  value={form.payment_reason}
                  onChange={(e) =>
                    setForm({ ...form, payment_reason: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-gray-600">
                Receipt Photo/Scan (optional)
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded border border-gray-300 p-2 text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Receipt"}
            </button>
          </form>
        )}

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">No records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">From</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={`${item.kind}-${item.id}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2">{itemTitle(item)}</td>
                      <td className="py-2">{kindLabel(item)}</td>
                      <td className="py-2">{itemFrom(item)}</td>
                      <td className="py-2">
                        {item.estimated_cost || item.amount} ETB
                      </td>
                      <td className="py-2">
                        {item.tax_registered ? (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                            Registered
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-2">{item.tax_reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
