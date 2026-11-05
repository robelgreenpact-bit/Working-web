"use client";

import { useEffect, useState, type FormEvent } from "react";
import Navbar from "@/app/components/Navbar";

type Asset = {
  id: string;
  asset_tag: string;
  category: string;
  item_name: string | null;
  serial_number: string | null;
  electronics_subcategory: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  borrowed_by: string | null;
  borrower_name: string | null;
  return_requested: boolean;
  purchase_cost: number | null;
  purchase_date: string | null;
  status: string;
  location: string | null;
  quantity: number | null;
};

type UserOption = {
  id: string;
  name: string;
};

type AssetForm = {
  category: string;
  electronics_subcategory: string;
  item_name: string;
  serial_number: string;
  assigned_to: string;
  purchase_cost: string;
  purchase_date: string;
  status: string;
  location: string;
  quantity: string;
};

const emptyForm: AssetForm = {
  category: "",
  electronics_subcategory: "",
  item_name: "",
  serial_number: "",
  assigned_to: "",
  purchase_cost: "",
  purchase_date: "",
  status: "new",
  location: "",
  quantity: "1",
};

const categoryLabels: Record<string, string> = {
  electronics: "Electronics",
  furniture: "Furniture",
  vehicle: "Vehicles",
  office_supplies: "Office Supplies",
  other: "Other",
};

const conditionLabels: Record<string, string> = {
  new: "New",
  in_use: "Serviceable",
  under_repair: "Under Repair",
  retired: "Retired",
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-deep/20";

const buttonClass =
  "rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50";

function isEquipment(asset: {
  category: string;
  electronics_subcategory: string | null;
}) {
  return (
    asset.category === "electronics" &&
    ["tablet", "pc"].includes(asset.electronics_subcategory || "")
  );
}

function hasActiveLoan(asset: Asset) {
  return Boolean(asset.borrowed_by || asset.return_requested);
}

function isAvailable(asset: Asset) {
  return (
    !hasActiveLoan(asset) &&
    !asset.assigned_to &&
    ["new", "in_use"].includes(asset.status)
  );
}

function holdingStatus(asset: Asset) {
  if (asset.return_requested) return "Return requested";
  if (asset.borrowed_by) return "Borrowed";
  if (asset.status === "under_repair") return "Under Repair";
  if (asset.status === "retired") return "Retired";
  if (asset.assigned_to) return "Assigned";
  if (isAvailable(asset)) return "Available";
  return "Unavailable";
}

function statusColor(asset: Asset) {
  switch (holdingStatus(asset)) {
    case "Available":
      return "bg-green-100 text-green-800";
    case "Borrowed":
      return "bg-blue-100 text-blue-800";
    case "Return requested":
      return "bg-orange-100 text-orange-800";
    case "Under Repair":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "The request could not be completed.");
  }

  if (!data) {
    throw new Error("The server returned an empty response.");
  }

  return data;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [role, setRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userLoadError, setUserLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetForm>({ ...emptyForm });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const canManage = role === "admin" || role === "finance";
  const equipmentForm = isEquipment(form);
  const editingAsset = assets.find((asset) => asset.id === editingId);

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      try {
        const profileResponse = await fetch("/api/dashboard-role", {
          signal: controller.signal,
        });
        const profile = await readResponse(profileResponse);

        if (controller.signal.aborted) return;

        setRole(profile.role || null);

        const assetsResponse = await fetch("/api/assets", {
          signal: controller.signal,
        });
        const assetData = await readResponse(assetsResponse);

        if (controller.signal.aborted) return;

        setAssets(assetData.assets || []);

        if (["admin", "finance"].includes(profile.role)) {
          try {
            const usersResponse = await fetch("/api/users/list", {
              signal: controller.signal,
            });
            const userData = await readResponse(usersResponse);

            if (!controller.signal.aborted) {
              setUsers(userData.users || []);
            }
          } catch {
            if (!controller.signal.aborted) {
              setUserLoadError(
                "The staff list could not be loaded. Existing assignments will be preserved.",
              );
            }
          }
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => controller.abort();
  }, []);

  async function loadAssets() {
    const response = await fetch("/api/assets");
    const data = await readResponse(response);
    setAssets(data.assets || []);
  }

  async function refreshAssets() {
    setLoading(true);
    setError("");

    try {
      await loadAssets();
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setLoading(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function openNewForm() {
    setError("");
    setNotice("");
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(asset: Asset) {
    if (!canManage) return;

    if (hasActiveLoan(asset)) {
      setError(
        "This device is borrowed or awaiting return confirmation. Complete its return on the Borrowed page before editing.",
      );
      return;
    }

    setError("");
    setNotice("");
    setEditingId(asset.id);

    setForm({
      category: asset.category || "",
      electronics_subcategory: asset.electronics_subcategory || "",
      item_name: asset.item_name || "",
      serial_number: asset.serial_number || "",
      assigned_to: asset.assigned_to || "",
      purchase_cost:
        asset.purchase_cost === null ? "" : String(asset.purchase_cost),
      purchase_date: asset.purchase_date?.slice(0, 10) || "",
      status: asset.status || "new",
      location: asset.location || "",
      quantity: String(asset.quantity || 1),
    });

    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || saving) return;

    setError("");
    setNotice("");

    if (!form.category || !form.item_name.trim()) {
      setError("Select a category and enter an item name.");
      return;
    }

    if (
      form.category === "electronics" &&
      !form.electronics_subcategory
    ) {
      setError("Select the electronics type.");
      return;
    }

    if (equipmentForm && !form.serial_number.trim()) {
      setError("Enter the serial number for this device.");
      return;
    }

    if (equipmentForm && !form.location.trim()) {
      setError("Enter the device location.");
      return;
    }

    if (editingAsset && hasActiveLoan(editingAsset)) {
      setError("This device must be returned before it can be edited.");
      return;
    }

    if (
      form.category === "furniture" &&
      (!Number.isSafeInteger(Number(form.quantity)) ||
        Number(form.quantity) < 1)
    ) {
      setError("Furniture quantity must be a positive whole number.");
      return;
    }

    const serial = form.serial_number.trim();

    if (
      equipmentForm &&
      assets.some(
        (asset) =>
          asset.id !== editingId &&
          asset.serial_number?.trim().toLowerCase() ===
            serial.toLowerCase(),
      )
    ) {
      setError(
        "An asset with this serial number already exists. Check the existing record.",
      );
      return;
    }

    const payload: Record<string, unknown> = {
      category: form.category,
      electronics_subcategory:
        form.category === "electronics"
          ? form.electronics_subcategory
          : null,
      item_name: form.item_name.trim(),
      serial_number: serial || null,
      location: form.location.trim() || null,
      status: form.status,
    };

    if (equipmentForm) {
      // A Tablet or PC is always one physical device per record.
      payload.quantity = 1;

      // New devices start unassigned.
      // Existing assignments are not silently cleared during edits.
      if (!editingId) {
        payload.assigned_to = null;
      }

      // Do not overwrite historical purchase information.
    } else {
      payload.assigned_to = form.assigned_to || null;
      payload.purchase_cost =
        form.purchase_cost === "" ? null : Number(form.purchase_cost);
      payload.purchase_date = form.purchase_date || null;
      payload.quantity =
        form.category === "furniture"
          ? Number(form.quantity)
          : editingAsset?.quantity ?? null;
    }

    setSaving(true);

    try {
      const response = await fetch(
        editingId ? `/api/assets/${editingId}` : "/api/assets",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      await readResponse(response);

      const wasEditing = Boolean(editingId);
      closeForm();

      setNotice(
        wasEditing
          ? "Asset updated successfully."
          : "Asset registered successfully.",
      );

      try {
        await loadAssets();
      } catch {
        setError(
          "The asset was saved, but the list could not refresh. Click Refresh; do not submit the same device again.",
        );
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(asset: Asset) {
    if (!canManage || busyId || saving) return;

    if (hasActiveLoan(asset) || asset.assigned_to) {
      setError(
        "Borrowed or assigned assets cannot be deleted from this page.",
      );
      return;
    }

    if (
      !window.confirm(
        `Delete ${asset.asset_tag}? This cannot be undone. Devices with loan history should be retired instead.`,
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setBusyId(asset.id);

    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
      });

      await readResponse(response);

      if (editingId === asset.id) closeForm();

      setNotice("Asset deleted successfully.");

      try {
        await loadAssets();
      } catch {
        setError("The asset was deleted. Click Refresh to reload the list.");
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusyId(null);
    }
  }

  const locations = Array.from(
    new Set(
      [
        "Bahir Dar Office",
        "Addis Ababa Office",
        ...assets.map((asset) => asset.location || ""),
      ].filter(Boolean),
    ),
  ).sort();

  const itemNames = Array.from(
    new Set(
      assets
        .filter(
          (asset) =>
            asset.category === form.category &&
            (form.category !== "electronics" ||
              asset.electronics_subcategory ===
                form.electronics_subcategory),
        )
        .map((asset) => asset.item_name || "")
        .filter(Boolean),
    ),
  ).sort();

  const filteredAssets = assets
    .filter((asset) => {
      const text = search.trim().toLowerCase();

      const searchableValues = [
        asset.item_name,
        asset.asset_tag,
        ...(canManage ? [asset.serial_number] : []),
      ];

      return (
        (!text ||
          searchableValues.some((value) =>
            value?.toLowerCase().includes(text),
          )) &&
        (categoryFilter === "all" ||
          asset.category === categoryFilter) &&
        (typeFilter === "all" ||
          (asset.category === "electronics" &&
            asset.electronics_subcategory === typeFilter)) &&
        (locationFilter === "all" ||
          asset.location === locationFilter) &&
        (statusFilter === "all" ||
          holdingStatus(asset) === statusFilter)
      );
    })
    .sort(
      (a, b) =>
        (a.item_name || "").localeCompare(b.item_name || "") ||
        a.asset_tag.localeCompare(b.asset_tag),
    );

  const summaries = [
    { label: "Total", count: assets.length },
    {
      label: "Available",
      count: assets.filter(isAvailable).length,
    },
    {
      label: "Borrowed",
      count: assets.filter((asset) => Boolean(asset.borrowed_by)).length,
    },
    {
      label: "Under Repair",
      count: assets.filter(
        (asset) => asset.status === "under_repair",
      ).length,
    },
    {
      label: "Retired",
      count: assets.filter((asset) => asset.status === "retired").length,
    },
  ];

  return (
    <div>
      <Navbar title="Asset Registry" />

      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">
              Asset Registry
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Register each Tablet or PC once, as an individual device.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/assets/borrowed"
              className="rounded-lg border border-brand-deep px-4 py-2.5 text-sm font-medium text-brand-deep"
            >
              Borrowed & Returns
            </a>

            {["admin", "finance", "manager"].includes(role || "") && (
              <a
                href="/assets/inventory"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700"
              >
                Inventory
              </a>
            )}

            {canManage && (
              <button
                type="button"
                disabled={saving || Boolean(busyId)}
                onClick={showForm ? closeForm : openNewForm}
                className={buttonClass}
              >
                {showForm ? "Close form" : "+ Register asset"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {notice}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {summaries.map((summary) => (
            <div
              key={summary.label}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-gray-500">{summary.label}</p>
              <p className="mt-2 text-3xl font-bold text-brand-deep">
                {loading ? "—" : summary.count}
              </p>
            </div>
          ))}
        </div>

        <p className="mb-6 text-sm text-gray-500">
          Borrowed totals include devices awaiting return confirmation.
          Manage returns and loan history on the Borrowed page.
        </p>

        {showForm && canManage && (
          <form
            onSubmit={handleSave}
            className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-brand-deep">
                {editingId ? "Edit asset" : "Register asset"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {editingAsset
                  ? `Asset code: ${editingAsset.asset_tag}`
                  : "The asset code is generated automatically when saved."}
              </p>
            </div>

            <fieldset
              disabled={saving}
              className="grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-medium text-gray-700">
                Category
                <select
                  required
                  value={form.category}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      category: event.target.value,
                      electronics_subcategory: "",
                      assigned_to: editingAsset?.assigned_to || "",
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Select category</option>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {form.category === "electronics" && (
                <label className="text-sm font-medium text-gray-700">
                  Electronics type
                  <select
                    required
                    value={form.electronics_subcategory}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        electronics_subcategory: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">Select type</option>
                    <option value="tablet">Tablet</option>
                    <option value="pc">PC</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              )}

              <label className="text-sm font-medium text-gray-700">
                Item name
                <input
                  required
                  type="text"
                  list="registered-item-names"
                  value={form.item_name}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      item_name: event.target.value,
                    }))
                  }
                  placeholder="For example: Samsung Galaxy Tab A9"
                  className={inputClass}
                />
                <datalist id="registered-item-names">
                  {itemNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Use the same item name for devices of the same model.
                </span>
              </label>

              <label className="text-sm font-medium text-gray-700">
                Serial number {equipmentForm ? "" : "(optional)"}
                <input
                  required={equipmentForm}
                  type="text"
                  value={form.serial_number}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      serial_number: event.target.value,
                    }))
                  }
                  placeholder="Serial number printed on the device"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-gray-700">
                Location
                <input
                  required={equipmentForm}
                  type="text"
                  list="asset-locations"
                  value={form.location}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      location: event.target.value,
                    }))
                  }
                  placeholder="Select or enter a location"
                  className={inputClass}
                />
                <datalist id="asset-locations">
                  {locations.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>
              </label>

              <label className="text-sm font-medium text-gray-700">
                Asset condition
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      status: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {equipmentForm ? (
                <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900 sm:col-span-2">
                  One record represents one physical device. Finance assigns
                  devices through approved worker requests.
                  {editingAsset?.assigned_to && !editingAsset.borrowed_by && (
                    <p className="mt-2 font-medium">
                      This record has an existing assignment. Editing will
                      preserve it; the device is not available for borrowing.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {form.category === "furniture" && (
                    <label className="text-sm font-medium text-gray-700">
                      Quantity
                      <input
                        required
                        type="number"
                        min={1}
                        step={1}
                        value={form.quantity}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            quantity: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  )}

                  <label className="text-sm font-medium text-gray-700">
                    Assigned to
                    <select
                      value={form.assigned_to}
                      disabled={Boolean(userLoadError)}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          assigned_to: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">Unassigned</option>

                      {form.assigned_to &&
                        !users.some((user) => user.id === form.assigned_to) && (
                          <option value={form.assigned_to}>
                            {editingAsset?.assignee_name ||
                              "Existing assignee"}
                          </option>
                        )}

                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    {userLoadError && (
                      <span className="mt-1 block text-xs text-amber-700">
                        {userLoadError}
                      </span>
                    )}
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    Purchase cost (ETB)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.purchase_cost}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          purchase_cost: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    Purchase date
                    <input
                      type="date"
                      value={form.purchase_date}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          purchase_date: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              <div className="flex gap-3 sm:col-span-2">
                <button type="submit" className={buttonClass}>
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Register asset"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-brand-deep">
              Registered assets
            </h2>

            <div className="flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                onClick={refreshAssets}
                disabled={loading || saving || Boolean(busyId)}
                className="font-medium text-brand-deep underline disabled:opacity-50"
              >
                Refresh
              </button>

              {canManage && (
                <>
                  <a
                    href="/api/reports/assets?format=xlsx"
                    className="font-medium text-brand-deep underline"
                  >
                    Download Excel
                  </a>
                  <a
                    href="/api/reports/assets?format=docx"
                    className="font-medium text-brand-deep underline"
                  >
                    Download Word
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium text-gray-600">
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  canManage ? "Item, code, or serial" : "Item or asset code"
                }
                className={inputClass}
              />
            </label>

            <label className="text-xs font-medium text-gray-600">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setTypeFilter("all");
                }}
                className={inputClass}
              >
                <option value="all">All categories</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-gray-600">
              Electronics type
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  if (event.target.value !== "all") {
                    setCategoryFilter("electronics");
                  }
                }}
                className={inputClass}
              >
                <option value="all">All types</option>
                <option value="tablet">Tablet</option>
                <option value="pc">PC</option>
                <option value="other">Other electronics</option>
              </select>
            </label>

            <label className="text-xs font-medium text-gray-600">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All statuses</option>
                {[
                  "Available",
                  "Borrowed",
                  "Return requested",
                  "Under Repair",
                  "Retired",
                  "Assigned",
                  "Unavailable",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-gray-600">
              Location
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-3">Asset code</th>
                  <th className="px-3 py-3">Item name</th>
                  <th className="px-3 py-3">Category / Type</th>
                  {canManage && (
                    <th className="px-3 py-3">Serial number</th>
                  )}
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Condition</th>
                  {canManage && (
                    <th className="px-3 py-3">Actions</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={canManage ? 8 : 6}
                      className="p-8 text-center text-gray-500"
                    >
                      Loading assets...
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 8 : 6}
                      className="p-8 text-center text-gray-500"
                    >
                      No assets match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-t border-gray-100 align-top hover:bg-gray-50"
                    >
                      <td className="px-3 py-4 font-mono text-xs font-semibold text-brand-deep">
                        {asset.asset_tag}
                      </td>

                      <td className="px-3 py-4 font-medium text-gray-900">
                        {asset.item_name || "Unnamed asset"}
                      </td>

                      <td className="px-3 py-4 text-gray-600">
                        {categoryLabels[asset.category] || asset.category}
                        {asset.electronics_subcategory && (
                          <div className="mt-1 text-xs uppercase">
                            {asset.electronics_subcategory}
                          </div>
                        )}
                      </td>

                      {canManage && (
                        <td className="px-3 py-4 font-mono text-xs">
                          {asset.serial_number || "—"}
                        </td>
                      )}

                      <td className="px-3 py-4">
                        {asset.location || "—"}
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(asset)}`}
                        >
                          {holdingStatus(asset)}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        {conditionLabels[asset.status] ||
                          asset.status ||
                          "Not recorded"}
                      </td>

                      {canManage && (
                        <td className="px-3 py-4">
                          {hasActiveLoan(asset) ? (
                            <a
                              href="/assets/borrowed"
                              className="text-xs font-medium text-brand-deep underline"
                            >
                              View on Borrowed page
                            </a>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                disabled={saving || Boolean(busyId)}
                                onClick={() => openEditForm(asset)}
                                className="text-xs font-medium text-brand-deep underline disabled:opacity-50"
                              >
                                Edit
                              </button>

                              {!asset.assigned_to && (
                                <button
                                  type="button"
                                  disabled={saving || Boolean(busyId)}
                                  onClick={() => handleDelete(asset)}
                                  className="text-xs font-medium text-red-700 underline disabled:opacity-50"
                                >
                                  {busyId === asset.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && (
            <p className="mt-4 text-xs text-gray-500">
              Showing {filteredAssets.length} of {assets.length} registered
              assets.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}