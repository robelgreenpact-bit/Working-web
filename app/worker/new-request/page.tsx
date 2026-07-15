"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";

const typeConfig: Record<
  string,
  { label: string; needsCost: boolean; needsQuantity: boolean }
> = {
  physical_good: {
    label: "Physical Good / Equipment",
    needsCost: true,
    needsQuantity: true,
  },
  travel_expense: {
    label: "Travel Expense",
    needsCost: true,
    needsQuantity: false,
  },
  reimbursement: {
    label: "Reimbursement / Money Refund",
    needsCost: true,
    needsQuantity: false,
  },
  other_asset: {
    label: "Other Asset",
    needsCost: true,
    needsQuantity: true,
  },
  document_request: {
    label: "Letter / Document Request",
    needsCost: false,
    needsQuantity: false,
  },
};

export default function NewRequestPage() {
  const [form, setForm] = useState({
    type: "physical_good",
    title: "",
    description: "",
    quantity: 1,
    estimated_cost: "",
    justification: "",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const config = typeConfig[form.type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("type", form.type);
    formData.append("title", form.title);
    formData.append("description", form.description);
    formData.append("justification", form.justification);

    if (config.needsQuantity) {
      formData.append("quantity", String(form.quantity));
    }
    if (config.needsCost) {
      formData.append("estimated_cost", form.estimated_cost);
    }

    if (files) {
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    }

    const res = await fetch("/api/requests", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to submit request");
      return;
    }

    router.push("/worker");
  };

  return (
    <div>
      <Navbar title="New Request" />
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Submit New Request
        </h1>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border-t-4 border-brand bg-white p-6 shadow"
        >
          {error && (
            <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">
              What do you want to request?
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
            >
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. New laptop for development work"
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
            />
          </div>

          {(config.needsQuantity || config.needsCost) && (
            <div className="mb-4 grid grid-cols-2 gap-4">
              {config.needsQuantity && (
                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: Number(e.target.value) })
                    }
                    className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                  />
                </div>
              )}

              {config.needsCost && (
                <div className={config.needsQuantity ? "" : "col-span-2"}>
                  <label className="mb-1 block text-sm text-gray-600">
                    Estimated Cost (ETB)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.estimated_cost}
                    onChange={(e) =>
                      setForm({ ...form, estimated_cost: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                  />
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">
              Justification
            </label>
            <textarea
              value={form.justification}
              onChange={(e) =>
                setForm({ ...form, justification: e.target.value })
              }
              rows={3}
              placeholder="Why is this needed?"
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
            />
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm text-gray-600">
              Attachments (receipt, quote, itinerary, etc.)
            </label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => setFiles(e.target.files)}
              className="w-full rounded border border-gray-300 p-2 text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">
              You can attach images, PDFs, or Word documents. Multiple files
              allowed.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
