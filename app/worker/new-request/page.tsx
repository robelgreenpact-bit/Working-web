"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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

const initialPerDiemFields = {
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
};

type PerDiemFields = typeof initialPerDiemFields;

const perDiemRows: {
  key: keyof PerDiemFields;
  label: string;
  type: string;
}[] = [
  { key: "employee_name", label: "Employee's Name", type: "text" },
  { key: "salary", label: "Perdium amount", type: "text" },
  {
    key: "field_deployment_location",
    label: "Field Deployment Location",
    type: "text",
  },
  {
    key: "field_deployment_date",
    label: "Field Deployment Date",
    type: "text",
  },
  {
    key: "date_returned",
    label: "Date Returned from Deployment",
    type: "text",
  },
  {
    key: "number_of_days",
    label: "Number of Days",
    type: "number",
  },
  {
    key: "payable_amount",
    label: "Growth amount",
    type: "text",
  },
];

const signatureFields: {
  key: keyof PerDiemFields;
  label: string;
}[] = [
  {
    key: "requester_name",
    label: "Requester's Name & Signature",
  },
  {
    key: "reviewer_name",
    label: "Reviewer's Name & Signature",
  },
  {
    key: "approver_name",
    label: "Approver's Name & Signature",
  },
];

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-deep/20 disabled:bg-gray-100 disabled:text-gray-500";

function buildPerDiemDescription(fields: PerDiemFields) {
  const blank = "__________________";

  return [
    "**Perdium Request**",
    `**Date:** ${fields.date || blank}`,
    "**Title of Form:** Field Allowance Evidence Form for Deploying Employees",
    "",
    "---",
    "",
    "Main Table (Employee Details)",
    "",
    "Field Label (Left Column) | Field/Status (Right Column)",
    `**Employee's Name** | ${fields.employee_name || blank}`,
    `**Perdium amount** | ${fields.salary || blank}`,
    `**Field Deployment Location** | ${fields.field_deployment_location || blank}`,
    `**Field Deployment Date** | ${fields.field_deployment_date || blank}`,
    `**Date Returned from Deployment** | ${fields.date_returned || blank}`,
    `**Number of Days** | ${fields.number_of_days || blank}`,
    `**Payable / Total Amount Due** | ${fields.payable_amount || blank}`,
    "",
    "---",
    "",
    "Approval and Signatures Table",
    "",
    "Requester's Name & Signature | Reviewer's Name & Signature | Approver's Name & Signature",
    `${fields.requester_name || blank} | ${fields.reviewer_name || blank} | ${fields.approver_name || blank}`,
    "",
    "---",
    "",
    "Report Section",
    "**Brief Report of the activities completed**",
    fields.report || "",
  ].join("\n");
}

type ItemNamesState = {
  key: string;
  names: string[];
  error: string;
};

export default function NewRequestPage() {
  const router = useRouter();
  const submitting = useRef(false);

  const [form, setForm] = useState({
    type: "physical_good",
    title: "",
    item_name: "",
    justification: "",
    description: "",
    quantity: "1",
    estimated_cost: "",
    asset_category: "",
    electronics_subcategory: "",
  });

  const [customItemName, setCustomItemName] = useState("");
  const [perDiemFields, setPerDiemFields] = useState<PerDiemFields>({
    ...initialPerDiemFields,
  });

  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [namesRetry, setNamesRetry] = useState(0);
  const [itemNamesState, setItemNamesState] = useState<ItemNamesState>({
    key: "",
    names: [],
    error: "",
  });

  const config = typeConfig[form.type];

  const isEquipment =
    form.type === "electronics" &&
    ["tablet", "pc"].includes(form.electronics_subcategory);

  const needsJustification = [
    "electronics",
    "physical_good",
    "other_asset",
  ].includes(form.type);

  // Tablet/PC requests do not require an item name.
  // Preserve item names for the other existing request types.
  const needsItemName =
    ["physical_good", "other_asset"].includes(form.type) ||
    (form.type === "electronics" &&
      form.electronics_subcategory === "other");

  const itemCategory =
    form.type === "electronics"
      ? "electronics"
      : ["physical_good", "other_asset"].includes(form.type)
        ? form.asset_category
        : "";

  const canLoadNames = needsItemName && Boolean(itemCategory);

  const params = new URLSearchParams();

  if (canLoadNames) {
    params.set("category", itemCategory);

    if (
      form.type === "electronics" &&
      form.electronics_subcategory
    ) {
      params.set("subcategory", form.electronics_subcategory);
    }
  }

  // No item-name request is made for Tablet or PC.
  const namesUrl = canLoadNames
    ? `/api/assets/item-names?${params.toString()}`
    : "";

  const namesKey = namesUrl ? `${namesUrl}|${namesRetry}` : "";
  const namesReady =
    Boolean(namesKey) && itemNamesState.key === namesKey;
  const namesLoading = Boolean(namesKey) && !namesReady;
  const namesError = namesReady ? itemNamesState.error : "";
  const inventoryItemNames = namesReady ? itemNamesState.names : [];

  useEffect(() => {
    if (!namesUrl) return;

    const controller = new AbortController();

    async function loadNames() {
      try {
        const response = await fetch(namesUrl, {
          signal: controller.signal,
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load item names.");
        }

        if (
          !Array.isArray(data.item_names) ||
          !data.item_names.every(
            (name: unknown) => typeof name === "string",
          )
        ) {
          throw new Error("The item-name response is incomplete.");
        }

        if (!controller.signal.aborted) {
          setItemNamesState({
            key: namesKey,
            names: data.item_names,
            error: "",
          });
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setItemNamesState({
            key: namesKey,
            names: [],
            error:
              loadError instanceof Error
                ? loadError.message
                : "Unable to load item names.",
          });
        }
      }
    }

    void loadNames();

    return () => controller.abort();
  }, [namesUrl, namesKey]);

  function handleTypeChange(value: string) {
    setError("");
    setCustomItemName("");

    setForm((previous) => ({
      ...previous,
      type: value,
      item_name: "",
      description: "",
      quantity: "1",
      asset_category: value === "electronics" ? "electronics" : "",
      electronics_subcategory: "",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    setError("");

    if (
      form.type === "electronics" &&
      !["tablet", "pc", "other"].includes(
        form.electronics_subcategory,
      )
    ) {
      setError("Select the electronics type.");
      return;
    }

    if (
      ["physical_good", "other_asset"].includes(form.type) &&
      !form.asset_category
    ) {
      setError("Select an asset category.");
      return;
    }

    const requestedItemName = needsItemName
      ? (
          form.item_name === "__custom__"
            ? customItemName
            : form.item_name
        ).trim()
      : "";

    if (needsItemName && !requestedItemName) {
      setError("Select or enter an item name.");
      return;
    }

    if (needsJustification && !form.justification.trim()) {
      setError("Enter a justification for your request.");
      return;
    }

    const requestedQuantity = Number(form.quantity);

    if (
      config.needsQuantity &&
      (
        !form.quantity.trim() ||
        !Number.isSafeInteger(requestedQuantity) ||
        requestedQuantity < 1
      )
    ) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    if (
      config.needsCost &&
      (
        form.estimated_cost.trim() === "" ||
        !Number.isFinite(Number(form.estimated_cost)) ||
        Number(form.estimated_cost) < 0
      )
    ) {
      setError("Enter a valid estimated cost of zero or greater.");
      return;
    }

    const submissionTitle = isEquipment
      ? `${form.electronics_subcategory === "tablet" ? "Tablet" : "PC"} request`
      : form.type === "electronics"
        ? `${requestedItemName} request`
        : form.title.trim();

    if (!submissionTitle) {
      setError("Enter a request title.");
      return;
    }

    const formData = new FormData();

    formData.append("type", form.type);
    formData.append("title", submissionTitle);

    formData.append(
      "description",
      form.type === "per_diem"
        ? buildPerDiemDescription(perDiemFields)
        : isEquipment
          ? ""
          : form.description.trim(),
    );

    formData.append(
      "asset_category",
      form.type === "electronics"
        ? "electronics"
        : form.asset_category,
    );

    // Equipment is requested by Tablet/PC type only.
    // Do not send a placeholder item name or requested_item_name.
    if (needsItemName) {
      formData.append("item_name", requestedItemName);
    }

    if (needsJustification) {
      formData.append("justification", form.justification.trim());
    }

    if (form.type === "electronics") {
      formData.append(
        "electronics_subcategory",
        form.electronics_subcategory,
      );
    }

    if (config.needsQuantity) {
      formData.append("quantity", String(requestedQuantity));
    }

    if (config.needsCost) {
      formData.append("estimated_cost", form.estimated_cost);
    }

    for (const file of files) {
      formData.append("files", file);
    }

    submitting.current = true;
    setLoading(true);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "Failed to submit the request.");
        submitting.current = false;
        setLoading(false);
        return;
      }

      router.push("/worker");
      router.refresh();
    } catch {
      setError(
        "The submission could not be confirmed. Check My Requests before trying again to avoid submitting it twice.",
      );
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div>
      <Navbar title="New Request" />

      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand-deep">
            Submit New Request
          </h1>
          <a
            href="/worker"
            className="text-sm font-medium text-brand-deep underline"
          >
            My Requests
          </a>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border-t-4 border-brand bg-white p-5 shadow sm:p-6"
        >
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <fieldset disabled={loading} className="space-y-5">
            <label className="block text-sm font-medium text-gray-700">
              What do you want to request?
              <select
                value={form.type}
                onChange={(event) =>
                  handleTypeChange(event.target.value)
                }
                className={inputClass}
              >
                {Object.entries(typeConfig).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>

            {["physical_good", "other_asset"].includes(form.type) && (
              <label className="block text-sm font-medium text-gray-700">
                Asset category
                <select
                  required
                  value={form.asset_category}
                  onChange={(event) => {
                    const value = event.target.value;

                    setCustomItemName("");
                    setForm((previous) => ({
                      ...previous,
                      asset_category: value,
                      item_name: "",
                      electronics_subcategory: "",
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Select category</option>
                  <option value="electronics">Electronics</option>
                  <option value="furniture">Furniture</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="office_supplies">
                    Office supplies
                  </option>
                </select>
              </label>
            )}

            {form.type === "electronics" && (
              <label className="block text-sm font-medium text-gray-700">
                Electronics type
                <select
                  required
                  value={form.electronics_subcategory}
                  onChange={(event) => {
                    const value = event.target.value;

                    setCustomItemName("");
                    setError("");
                    setForm((previous) => ({
                      ...previous,
                      electronics_subcategory: value,
                      item_name: "",
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Select type</option>
                  <option value="tablet">Tablet</option>
                  <option value="pc">PC</option>
                  <option value="other">Other</option>
                </select>
              </label>
            )}

            {needsItemName && (
              <div>
                <label
                  htmlFor="request-item"
                  className="block text-sm font-medium text-gray-700"
                >
                  Item name
                </label>

                {!canLoadNames ? (
                  <p className="mt-2 text-sm text-gray-500">
                    Select the asset category first.
                  </p>
                ) : namesLoading ? (
                  <p className="mt-2 text-sm text-gray-500">
                    Loading item names…
                  </p>
                ) : inventoryItemNames.length > 0 ? (
                  <>
                    <select
                      id="request-item"
                      required
                      value={form.item_name}
                      onChange={(event) => {
                        const value = event.target.value;

                        setCustomItemName("");
                        setForm((previous) => ({
                          ...previous,
                          item_name: value,
                        }));
                      }}
                      className={inputClass}
                    >
                      <option value="">Select an item name</option>
                      {inventoryItemNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__custom__">
                        Other / not listed
                      </option>
                    </select>

                    {form.item_name === "__custom__" && (
                      <input
                        aria-label="Custom item name"
                        required
                        type="text"
                        value={customItemName}
                        onChange={(event) =>
                          setCustomItemName(event.target.value)
                        }
                        placeholder="Enter item name"
                        className={inputClass}
                      />
                    )}
                  </>
                ) : (
                  <input
                    id="request-item"
                    required
                    type="text"
                    value={
                      form.item_name === "__custom__"
                        ? customItemName
                        : form.item_name
                    }
                    onChange={(event) => {
                      const value = event.target.value;

                      setForm((previous) => ({
                        ...previous,
                        item_name: "__custom__",
                      }));
                      setCustomItemName(value);
                    }}
                    placeholder="Enter item name"
                    className={inputClass}
                  />
                )}

                {namesError && (
                  <p role="alert" className="mt-2 text-sm text-red-700">
                    {namesError}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setNamesRetry((previous) => previous + 1)
                      }
                      className="font-medium underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            )}

            {form.type !== "electronics" && (
              <label className="block text-sm font-medium text-gray-700">
                Request title
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      title: value,
                    }));
                  }}
                  placeholder="Enter request title"
                  className={inputClass}
                />
              </label>
            )}

            {form.type === "per_diem" ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="mb-4 text-lg font-semibold text-brand-deep">
                  Perdium Request
                </h2>

                <label className="mb-4 block text-sm text-gray-700">
                  Date
                  <input
                    type="date"
                    value={perDiemFields.date}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPerDiemFields((previous) => ({
                        ...previous,
                        date: value,
                      }));
                    }}
                    className={inputClass}
                  />
                </label>

                <div className="space-y-3">
                  {perDiemRows.map((field) => (
                    <label
                      key={field.key}
                      className="block text-sm text-gray-700"
                    >
                      {field.label}
                      <input
                        type={field.type}
                        value={perDiemFields[field.key]}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPerDiemFields((previous) => ({
                            ...previous,
                            [field.key]: value,
                          }));
                        }}
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {signatureFields.map((field) => (
                    <label
                      key={field.key}
                      className="block text-sm text-gray-700"
                    >
                      {field.label}
                      <input
                        type="text"
                        value={perDiemFields[field.key]}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPerDiemFields((previous) => ({
                            ...previous,
                            [field.key]: value,
                          }));
                        }}
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>

                <label className="mt-4 block text-sm text-gray-700">
                  Brief Report of the activities completed
                  <textarea
                    rows={4}
                    value={perDiemFields.report}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPerDiemFields((previous) => ({
                        ...previous,
                        report: value,
                      }));
                    }}
                    className={inputClass}
                  />
                </label>
              </section>
            ) : !isEquipment ? (
              <label className="block text-sm font-medium text-gray-700">
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      description: value,
                    }));
                  }}
                  className={inputClass}
                />
              </label>
            ) : null}

            {config.needsQuantity && (
              <label className="block text-sm font-medium text-gray-700">
                {isEquipment ? "Number of devices" : "Quantity"}
                <input
                  required
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantity}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      quantity: value,
                    }));
                  }}
                  className={inputClass}
                />
              </label>
            )}

            {needsJustification && (
              <label className="block text-sm font-medium text-gray-700">
                Justification
                <textarea
                  required
                  rows={3}
                  value={form.justification}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      justification: value,
                    }));
                  }}
                  placeholder="Explain why you need these items."
                  className={inputClass}
                />
              </label>
            )}

            {config.needsCost && (
              <label className="block text-sm font-medium text-gray-700">
                Estimated Cost (ETB)
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.estimated_cost}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      estimated_cost: value,
                    }));
                  }}
                  className={inputClass}
                />
              </label>
            )}

            {isEquipment && (
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                Your request goes to the manager first. After approval,
                finance selects the requested number of available{" "}
                {form.electronics_subcategory === "tablet"
                  ? "tablets"
                  : "PCs"}{" "}
                from inventory. You do not need to choose a brand,
                item name or individual device.
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700">
              Attachments (optional)
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files || []))
                }
                className={inputClass}
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">
                Images, PDFs, and Word documents are supported.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-deep px-5 py-2.5 font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Submitting…" : "Submit Request"}
            </button>
          </fieldset>
        </form>
      </main>
    </div>
  );
}