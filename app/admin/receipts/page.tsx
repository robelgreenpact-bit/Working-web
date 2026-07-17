"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Receipt = {
  id: string;
  invoice_no: string | null;
  payment_date: string | null;
  payer_name: string | null;
  credited_party_name: string | null;
  amount: number;
  payment_mode: string | null;
  signed_url: string | null;
  tax_registered: boolean;
};

export default function AdminReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    invoice_no: "",
    payment_date: "",
    payer_name: "",
    payer_account: "",
    credited_party_name: "",
    credited_party_account: "",
    amount: "",
    payment_mode: "",
    payment_reason: "",
    payment_channel: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const loadReceipts = async () => {
    setLoading(true);
    const res = await fetch("/api/receipts");
    const data = await res.json();
    setReceipts(data.receipts || []);
    setLoading(false);
  };

  useEffect(() => {
    loadReceipts();
  }, []);

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
      payer_account: "",
      credited_party_name: "",
      credited_party_account: "",
      amount: "",
      payment_mode: "",
      payment_reason: "",
      payment_channel: "",
    });
    setFile(null);
    setShowForm(false);
    loadReceipts();
  };

  return (
    <div>
      <Navbar title="Receipts" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">
            Receipt Registration
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            {showForm ? "Cancel" : "+ Register Receipt"}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Invoice No.
                </label>
                <input
                  type="text"
                  value={form.invoice_no}
                  onChange={(e) =>
                    setForm({ ...form, invoice_no: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
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
                  Payer Account / Phone
                </label>
                <input
                  type="text"
                  value={form.payer_account}
                  onChange={(e) =>
                    setForm({ ...form, payer_account: e.target.value })
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
                  Credited Party Account
                </label>
                <input
                  type="text"
                  value={form.credited_party_account}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      credited_party_account: e.target.value,
                    })
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
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payment Mode
                </label>
                <input
                  type="text"
                  placeholder="e.g. Telebirr, Bank, Cash"
                  value={form.payment_mode}
                  onChange={(e) =>
                    setForm({ ...form, payment_mode: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payment Reason
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

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Payment Channel
                </label>
                <input
                  type="text"
                  placeholder="e.g. API/App, Branch"
                  value={form.payment_channel}
                  onChange={(e) =>
                    setForm({ ...form, payment_channel: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-gray-600">
                Receipt Photo/Scan
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
          ) : receipts.length === 0 ? (
            <p className="text-gray-500">No receipts registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-2">Invoice</th>
                    <th className="pb-2">Payer</th>
                    <th className="pb-2">Recipient</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Mode</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">File</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{r.invoice_no || "—"}</td>
                      <td className="py-2">{r.payer_name || "—"}</td>
                      <td className="py-2">
                        {r.credited_party_name || "—"}
                      </td>
                      <td className="py-2">{r.amount} ETB</td>
                      <td className="py-2">{r.payment_mode || "—"}</td>
                      <td className="py-2">
                        {r.tax_registered ? (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                            Registered
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {r.signed_url ? (
                          
                            <a href={r.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-deep hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
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