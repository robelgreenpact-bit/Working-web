"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";

const perDiemTemplate = `**Per Diem Request**
**Date:** ____________________
**Title of Form:** Field Allowance Evidence Form for Deploying Employees

---

Main Table (Employee Details)

Field Label (Left Column) | Field/Status (Right Column)
**Employee's Name** | ____________________
**Investigation / Status** | ____________________
**Salary** | ____________________
**Field Deployment Location** | ____________________
**Field Deployment Date** | ____________________
**Date Returned from Deployment** | ____________________
**Number of Days** | ____________________
**Payable / Total Amount Due** | ____________________

---

Approval and Signatures Table

Requester's Name & Signature | Reviewer's Name & Signature | Approver's Name & Signature

---

Report Section
**Brief Report of the activities completed**
*(Blank section box for notes)*`;

const typeConfig: Record<
  string,
  { label: string; needsCost: boolean; needsQuantity: boolean }
> = {
  physical_good: {
    label: "Physical Good / Equipment",
    needsCost: true,
    needsQuantity: true,
  },
  per_diem: {
    label: "Perdium Request",
    needsCost: false,
    needsQuantity: false,
  },
  electronics: {
    label: "Electronics",
    needsCost: false,
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
    label: "Perdium for field",
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
  const [inventoryItemNames, setInventoryItemNames] = useState<string[]>([]);
  const [customItemName, setCustomItemName] = useState("");
  const [form, setForm] = useState({
    type: "physical_good",
    title: "",
    item_name: "",
    justification: "",
    description: "",
    quantity: 1,
    estimated_cost: "",
    asset_category: "",
    electronics_subcategory: "",
  });
  const [perDiemFields, setPerDiemFields] = useState({
    date: "",
    employee_name: "",
    salary: "",
    field_deployment_location: "",
    field_deployment_date: "",
    date_returned: "",
    number_of_days: "",
    payable_amount: "",
    requester_name: "",
    reviewer_name: "",
    approver_name: "",
    report: "",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const config = typeConfig[form.type];

  useEffect(() => {
    const category = form.type === "electronics"
      ? "electronics"
      : ["physical_good", "other_asset"].includes(form.type)
        ? form.asset_category
        : "";
    if (!category) return;

    const params = new URLSearchParams({ category });
    if (category === "electronics" && form.electronics_subcategory) {
      params.set("subcategory", form.electronics_subcategory);
    }
    fetch(`/api/assets/item-names?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setInventoryItemNames(data.item_names || []))
      .catch(() => setInventoryItemNames([]));
  }, [form.type, form.asset_category, form.electronics_subcategory]);

  const buildPerDiemDescription = () => {
    const lines = [
      "**Perdium Request**",
      `**Date:** ${perDiemFields.date || "__________________"}`,
      "**Title of Form:** Field Allowance Evidence Form for Deploying Employees",
      "",
      "---",
      "",
      "Main Table (Employee Details)",
      "",
      "Field Label (Left Column) | Field/Status (Right Column)",
      `**Employee's Name** | ${perDiemFields.employee_name || "__________________"}`,
      `**Perdium amount** | ${perDiemFields.salary || "__________________"}`,
      `**Field Deployment Location** | ${perDiemFields.field_deployment_location || "__________________"}`,
      `**Field Deployment Date** | ${perDiemFields.field_deployment_date || "__________________"}`,
      `**Date Returned from Deployment** | ${perDiemFields.date_returned || "__________________"}`,
      `**Number of Days** | ${perDiemFields.number_of_days || "__________________"}`,
      `**Payable / Total Amount Due** | ${perDiemFields.payable_amount || "__________________"}`,
      "",
      "---",
      "",
      "Approval and Signatures Table",
      "",
      `Requester's Name & Signature | Reviewer's Name & Signature | Approver's Name & Signature`,
      `${perDiemFields.requester_name || "__________________"} | ${perDiemFields.reviewer_name || "__________________"} | ${perDiemFields.approver_name || "__________________"}`,
      "",
      "---",
      "",
      "Report Section",
      "**Brief Report of the activities completed**",
      perDiemFields.report || "",
    ];

    return lines.join("\n");
  };

  const handleTypeChange = (value: string) => {
    setInventoryItemNames([]);
    setCustomItemName("");
    setForm((prev) => ({
      ...prev,
      type: value,
      item_name: "",
      description:
        value === "per_diem" ? perDiemTemplate : "",
      asset_category:
        value === "electronics" ? "electronics" : prev.asset_category,
      electronics_subcategory: "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const requestedItemName = (form.item_name === "__custom__" ? customItemName : form.item_name).trim();
    const submissionTitle =
      form.type === "electronics" && requestedItemName
        ? `${requestedItemName} request`
        : (form.type === "per_diem" || form.type === "other_asset") && !form.title.trim()
        ? "Perdium Request"
        : form.title;
    const submissionDescription =
      form.type === "per_diem" ? buildPerDiemDescription() : form.description;

    const formData = new FormData();
    formData.append("type", form.type);
    formData.append("title", submissionTitle);
    formData.append("description", submissionDescription);
    formData.append("asset_category", form.asset_category);
    formData.append("item_name", requestedItemName || submissionTitle);
    formData.append("justification", form.justification);
    formData.append("electronics_subcategory", form.electronics_subcategory);

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
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
            >
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {(form.type === "physical_good" || form.type === "other_asset") && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-600">Asset category</label>
              <select
                required
                value={form.asset_category}
                onChange={(e) => {
                  setInventoryItemNames([]);
                  setCustomItemName("");
                  setForm({ ...form, asset_category: e.target.value, item_name: "" });
                }}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="">Select category</option>
                <option value="electronics">Electronics</option>
                <option value="furniture">Furniture</option>
                <option value="vehicle">Vehicle</option>
                <option value="office_supplies">Office supplies</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          {form.type === "electronics" && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-600">
                Electronics Type
              </label>
              <select
                required
                value={form.electronics_subcategory}
                onChange={(e) => {
                  setInventoryItemNames([]);
                  setCustomItemName("");
                  setForm({ ...form, item_name: "", electronics_subcategory: e.target.value });
                }}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="">— Select type —</option>
                <option value="tablet">Tablet</option>
                <option value="pc">PC</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          {(form.type === "electronics" || form.type === "physical_good" || form.type === "other_asset") && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-600">
                Item name
              </label>
              {inventoryItemNames.length > 0 ? (
                <select
                  required
                  value={form.item_name}
                  onChange={(e) => {
                    setForm({ ...form, item_name: e.target.value });
                    setCustomItemName("");
                  }}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                >
                  <option value="">Select an item name</option>
                  {inventoryItemNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  <option value="__custom__">Other / not listed</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={form.item_name === "__custom__" ? customItemName : form.item_name}
                  onChange={(e) => {
                    setForm({ ...form, item_name: "__custom__" });
                    setCustomItemName(e.target.value);
                  }}
                  required
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                  placeholder="For example, Samsung Galaxy tablet"
                />
              )}
              {form.item_name === "__custom__" && inventoryItemNames.length > 0 && (
                <input
                  type="text"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  required
                  placeholder="Enter item name"
                  className="mt-2 w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              )}
            </div>
          )}

          {form.type !== "electronics" && <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">
              Request title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              placeholder="Enter request title"
            />
          </div>}

          {form.type === "per_diem" ? (
            <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-3 text-lg font-semibold text-brand-deep">
                Perdium Request
              </h2>
              <div className="mb-4">
                <label className="mb-1 block text-sm text-gray-600">Date</label>
                <input
                  type="date"
                  value={perDiemFields.date}
                  onChange={(e) =>
                    setPerDiemFields({ ...perDiemFields, date: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>

              <div className="overflow-hidden rounded border border-gray-200 bg-white">
                <div className="grid grid-cols-[1.2fr_1fr] border-b bg-gray-50 text-sm font-medium text-gray-700">
                  <div className="border-r px-3 py-2">Field Label (Left Column)</div>
                  <div className="px-3 py-2">Field/Status (Right Column)</div>
                </div>

                {[
                  { key: "employee_name", label: "Employee's Name" },
                  { key: "salary", label: "Perdium amount" },
                  { key: "field_deployment_location", label: "Field Deployment Location" },
                  { key: "field_deployment_date", label: "Field Deployment Date" },
                  { key: "date_returned", label: "Date Returned from Deployment" },
                  { key: "number_of_days", label: "Number of Days" },
                  { key: "payable_amount", label: "Growth amount" },
                ].map((row) => (
                  <div key={row.key} className="grid grid-cols-[1.2fr_1fr] border-b last:border-b-0">
                    <div className="border-r px-3 py-2 text-sm text-gray-700">
                      {row.label}
                    </div>
                    <div className="px-3 py-2">
                      <input
                        type={row.key === "number_of_days" ? "number" : "text"}
                        value={perDiemFields[row.key as keyof typeof perDiemFields]}
                        onChange={(e) =>
                          setPerDiemFields({
                            ...perDiemFields,
                            [row.key]: e.target.value,
                          })
                        }
                        className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { key: "requester_name", label: "Requester's Name & Signature" },
                  { key: "reviewer_name", label: "Reviewer's Name & Signature" },
                  { key: "approver_name", label: "Approver's Name & Signature" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-sm text-gray-600">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={perDiemFields[field.key as keyof typeof perDiemFields]}
                      onChange={(e) =>
                        setPerDiemFields({
                          ...perDiemFields,
                          [field.key]: e.target.value,
                        })
                      }
                      className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm text-gray-600">
                  Brief Report of the activities completed
                </label>
                <textarea
                  value={perDiemFields.report}
                  onChange={(e) =>
                    setPerDiemFields({ ...perDiemFields, report: e.target.value })
                  }
                  rows={4}
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                />
              </div>
            </div>
          ) : (
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
          )}

          {(form.type === "electronics" || form.type === "physical_good" || form.type === "other_asset") && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-600">Justification</label>
              <textarea
                required
                value={form.justification}
                onChange={(e) => setForm({ ...form, justification: e.target.value })}
                rows={3}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>
          )}

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
