"use client";

import { useEffect, useState } from "react";
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

type LoanQueueRequest = {
  id: string;
  purpose: string;
  requester: { name: string; email: string } | null;
  items: {
    id: string;
    asset_id: string;
    status: string;
    due_date: string | null;
    borrowed_at: string | null;
    returned_at: string | null;
    return_condition: string | null;
    return_note: string | null;
    asset: {
      asset_tag: string;
      item_name: string | null;
      serial_number: string | null;
      location?: string | null;
    } | null;
  }[];
};

type PendingReturn = Omit<LoanQueueRequest, "items"> & {
  item: LoanQueueRequest["items"][number];
};

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  in_use: "bg-green-100 text-green-800",
  under_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-200 text-gray-600",
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [pendingHandovers, setPendingHandovers] = useState<LoanQueueRequest[]>([]);
  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([]);
  const [loanHistory, setLoanHistory] = useState<PendingReturn[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [returnConditions, setReturnConditions] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("all");
  const [registryTab, setRegistryTab] = useState("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    category: "",
    electronics_subcategory: "",
    item_name: "",
    serial_number: "",
    assigned_to: "",
    purchase_cost: "",
    purchase_date: "",
    status: "new",
    location: "",
    quantity: "",
  });

  const loadAssets = async () => {
    const res = await fetch("/api/assets");
    const data = await res.json();
    setAssets(data.assets || []);
    setLoading(false);
  };

  const loadLoanQueue = async () => {
    const res = await fetch("/api/admin/asset-loans");
    if (!res.ok) return;
    const data = await res.json();
    setPendingHandovers(data.handovers || []);
    setPendingReturns(data.returns || []);
    setLoanHistory(data.history || []);
  };

  useEffect(() => {
    fetch("/api/assets")
      .then((res) => res.json())
      .then((data) => {
        setAssets(data.assets || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/admin/asset-loans")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setPendingHandovers(data.handovers || []);
        setPendingReturns(data.returns || []);
        setLoanHistory(data.history || []);
      })
      .catch(() => {});
    fetch("/api/dashboard-role")
      .then((res) => res.json())
      .then((data) => setRole(data.role || null));
    fetch("/api/users/list")
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => {});
  }, []);

  const canAdd = role === "admin" || role === "finance";
  const canEdit = role === "admin" || role === "finance";

  const resetForm = () => {
    setForm({
      category: "",
      electronics_subcategory: "",
      item_name: "",
      serial_number: "",
      assigned_to: "",
      purchase_cost: "",
      purchase_date: "",
      status: "new",
      location: "",
      quantity: "",
    });
    setEditingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const payload = {
      ...form,
      purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      assigned_to: form.assigned_to || null,
      electronics_subcategory: form.electronics_subcategory || null,
      serial_number: form.serial_number || null,
      quantity: form.quantity ? Number(form.quantity) : null,
    };

    const res = editingId
      ? await fetch(`/api/assets/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = await res.json();
    setCreating(false);

    if (!res.ok) {
      alert(data.error || "Failed to save asset");
      return;
    }

    resetForm();
    setShowForm(false);
    loadAssets();
  };

  const handleEditClick = (asset: Asset) => {
    setForm({
      category: asset.category,
      electronics_subcategory: asset.electronics_subcategory || "",
      item_name: asset.item_name || "",
      serial_number: asset.serial_number || "",
      assigned_to: asset.assigned_to || "",
      purchase_cost: asset.purchase_cost ? String(asset.purchase_cost) : "",
      purchase_date: asset.purchase_date || "",
      status: asset.status,
      location: asset.location || "",
      quantity: asset.quantity ? String(asset.quantity) : "",
    });
    setEditingId(asset.id);
    setShowForm(true);
    // Scroll to form
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleCancelForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    if (!confirm(`Change this asset's condition to ${status.replaceAll("_", " ")}?`)) return;
    await fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadAssets();
  };

  const handleDelete = async (id: string) => {
    if (assets.find((asset) => asset.id === id)?.borrowed_by) {
      alert("Borrowed assets cannot be deleted.");
      return;
    }
    if (!confirm("Delete this asset record? This cannot be undone.")) return;
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete asset");
      return;
    }
    loadAssets();
  };

  const handleConfirmReturn = async (id: string) => {
    if (!confirm("Confirm this asset has been returned?")) return;
    const pendingReturn = pendingReturns.find((entry) => entry.item.asset_id === id);
    if (!pendingReturn) {
      alert("This return is not in the pending returns queue.");
      return;
    }
    const res = await fetch(`/api/admin/asset-loans/${pendingReturn.item.id}/confirm-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        return_condition:
          returnConditions[pendingReturn.item.id] || pendingReturn.item.return_condition || "good",
        note: pendingReturn.item.return_note || "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to confirm return");
      return;
    }
    loadAssets();
    loadLoanQueue();
  };

  const handleIssueLoan = async (requestId: string) => {
    if (!confirm("Confirm handover of all assets in this approved request?")) return;
    const res = await fetch(`/api/admin/asset-loans/${requestId}/issue`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to issue assets");
      return;
    }
    loadAssets();
    loadLoanQueue();
  };

  const registryAssets = registryTab === "borrowed"
    ? assets.filter((asset) => Boolean(asset.borrowed_by))
    : registryTab === "return_pending"
      ? assets.filter((asset) => asset.return_requested)
      : assets;
  const filteredAssets = registryAssets.filter((asset) => {
    const matchesStatus = filter === "all" || asset.status === filter;
    const matchesCategory = categoryFilter === "all" || asset.category === categoryFilter;
    const matchesLocation = locationFilter === "all" || asset.location === locationFilter;
    const search = assetSearch.trim().toLowerCase();
    const matchesSearch = !search || [asset.item_name, asset.asset_tag, asset.serial_number]
      .some((value) => value?.toLowerCase().includes(search));
    return matchesStatus && matchesCategory && matchesLocation && matchesSearch;
  });
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || null;
  const selectedAssetLoans = loanHistory.filter(
    (entry) => entry.item.asset_id === selectedAssetId,
  );

  return (
    <div>
      <Navbar title="Asset Registry" />
      <div className="mx-auto max-w-7xl p-8">
        <div className="mb-8 flex items-center justify-between fade-in">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">Asset Registry</h1>
            <p className="mt-1 text-sm text-gray-500">Manage and track all company assets</p>
          </div>
          {canAdd && (
            <button
              onClick={() =>
                showForm ? handleCancelForm() : setShowForm(true)
              }
              className="rounded-full bg-linear-to-r from-brand-deep to-brand-dark px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105"
            >
              {showForm ? "Cancel" : "+ Add Asset"}
            </button>
          )}
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total", value: assets.length, color: "text-brand-deep" },
            { label: "Available", value: assets.filter((asset) => !asset.borrowed_by && !asset.assigned_to && ["new", "in_use"].includes(asset.status)).length, color: "text-green-700" },
            { label: "Borrowed", value: assets.filter((asset) => Boolean(asset.borrowed_by)).length, color: "text-amber-700" },
            { label: "Return Pending", value: assets.filter((asset) => asset.return_requested).length, color: "text-orange-700" },
            { label: "Under Repair", value: assets.filter((asset) => asset.status === "under_repair").length, color: "text-red-700" },
          ].map((summary) => (
            <div key={summary.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">{summary.label}</p>
              <p className={`mt-2 text-2xl font-bold ${summary.color}`}>{summary.value}</p>
            </div>
          ))}
        </div>

        {role === "admin" && (
          <section className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-brand-deep">Pending handovers</h2>
              {pendingHandovers.length === 0 ? (
                <p className="text-sm text-gray-500">No approved borrow requests awaiting issue.</p>
              ) : (
                <div className="space-y-3">
                  {pendingHandovers.map((request) => (
                    <div key={request.id} className="border-b border-gray-100 pb-3 last:border-0">
                      <p className="font-medium">{request.purpose}</p>
                      <p className="mb-2 text-xs text-gray-500">{request.requester?.name || "Borrower"}</p>
                      <ul className="mb-3 text-sm text-gray-700">
                        {request.items.map((item) => (
                          <li key={item.id}>
                            {item.asset?.item_name || "Asset"} · {item.asset?.asset_tag}
                            {item.asset?.serial_number ? ` · SN ${item.asset.serial_number}` : ""}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => handleIssueLoan(request.id)}
                        className="rounded bg-brand-deep px-3 py-2 text-xs font-medium text-white"
                      >
                        Confirm handover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-brand-deep">Pending returns</h2>
              {pendingReturns.length === 0 ? (
                <p className="text-sm text-gray-500">No returns waiting for confirmation.</p>
              ) : (
                <div className="space-y-3">
                  {pendingReturns.map((entry) => (
                    <div key={entry.item.id} className="border-b border-gray-100 pb-3 last:border-0">
                      <p className="font-medium">
                        {entry.item.asset?.item_name || "Asset"} · {entry.item.asset?.asset_tag}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.requester?.name || "Borrower"} · Reported condition: {entry.item.return_condition || "Not provided"}
                      </p>
                      {entry.item.return_note && <p className="my-1 text-sm text-gray-700">{entry.item.return_note}</p>}
                      <div className="mt-2 flex gap-2">
                        <select
                          aria-label="Confirmed return condition"
                          value={returnConditions[entry.item.id] || entry.item.return_condition || "good"}
                          onChange={(e) => setReturnConditions({ ...returnConditions, [entry.item.id]: e.target.value })}
                          className="rounded border border-gray-300 p-2 text-xs text-gray-900"
                        >
                          <option value="good">Good</option>
                          <option value="damaged">Damaged</option>
                          <option value="lost">Lost</option>
                        </select>
                        <button
                          onClick={() => handleConfirmReturn(entry.item.asset_id)}
                          className="rounded bg-green-700 px-3 py-2 text-xs font-medium text-white"
                        >
                          Confirm return
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-8 grid grid-cols-1 gap-4 rounded-2xl border-t-4 border-brand bg-white/95 backdrop-blur-sm p-8 shadow-xl fade-in sm:grid-cols-2"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, electronics_subcategory: "" })}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              >
                <option value="">— Select category —</option>
                <option value="electronics">Electronics</option>
                <option value="furniture">Furniture</option>
                <option value="vehicle">Vehicle</option>
                <option value="office_supplies">Office Supplies</option>
                <option value="other">Other</option>
              </select>
            </div>

            {form.category === "electronics" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Electronics Type
                  </label>
                  <select
                    value={form.electronics_subcategory}
                    onChange={(e) => setForm({ ...form, electronics_subcategory: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
                  >
                    <option value="">— Select type —</option>
                    <option value="tablet">Tablet</option>
                    <option value="pc">PC</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    value={form.serial_number}
                    onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                    placeholder="e.g. SN123456789"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Item Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Dell Laptop, Office Chair"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              />
            </div>

            {form.category === "furniture" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Assigned To
              </label>
              <select
                value={form.assigned_to}
                onChange={(e) =>
                  setForm({ ...form, assigned_to: e.target.value })
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              >
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Purchase Cost (ETB)
              </label>
              <input
                type="number"
                min={0}
                value={form.purchase_cost}
                onChange={(e) =>
                  setForm({ ...form, purchase_cost: e.target.value })
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Purchase Date
              </label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) =>
                  setForm({ ...form, purchase_date: e.target.value })
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              >
                <option value="new">New</option>
                <option value="in_use">In Use</option>
                <option value="under_repair">Under Repair</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Location
              </label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
              >
                <option value="">— Select location —</option>
                <option value="Bahir Dar Office">Bahir Dar Office</option>
                <option value="Addis Ababa Office">Addis Ababa Office</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-linear-to-r from-brand-deep to-brand-dark px-6 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed sm:col-span-2"
            >
              {creating
                ? "Saving..."
                : editingId
                  ? "Update Asset"
                  : "Add Asset"}
            </button>
          </form>
        )}

        <div className="mb-6 flex flex-wrap gap-3 fade-in">
          <button
            onClick={() =>
              (window.location.href = "/api/reports/assets?format=xlsx")
            }
            className="rounded-full bg-linear-to-r from-brand-deep to-brand-dark px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105"
          >
            Download Excel
          </button>
          <button
            onClick={() =>
              (window.location.href = "/api/reports/assets?format=docx")
            }
            className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 shadow-md transition-all duration-200 hover:bg-gray-200 hover:shadow-lg hover:scale-105"
          >
            Download Word
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { id: "all", label: "All" },
            { id: "borrowed", label: "Borrowed" },
            { id: "return_pending", label: "Return Pending" },
            ...(role === "admin" ? [{ id: "history", label: "History" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRegistryTab(tab.id)}
              className={`rounded px-4 py-2 text-sm font-medium ${
                registryTab === tab.id ? "bg-brand-deep text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {registryTab !== "history" && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <input
              type="search"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Search item, tag, or serial number"
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="all">All categories</option>
              <option value="electronics">Electronics</option>
              <option value="furniture">Furniture</option>
              <option value="vehicle">Vehicle</option>
              <option value="office_supplies">Office supplies</option>
              <option value="other">Other</option>
            </select>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="all">All locations</option>
              <option value="Bahir Dar Office">Bahir Dar Office</option>
              <option value="Addis Ababa Office">Addis Ababa Office</option>
            </select>
          </div>
        )}

        {registryTab !== "history" && <div className="mb-6 flex flex-wrap gap-2 fade-in">
          {["all", "new", "in_use", "under_repair", "retired"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                filter === f
                  ? "bg-brand-deep text-white shadow-lg scale-105"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-md hover:scale-105"
              }`}
            >
              {f === "all" ? "All" : (f || "").replace("_", " ")}
            </button>
          ))}
        </div>}

        <div className="rounded-2xl border-t-4 border-brand bg-white/95 backdrop-blur-sm p-6 shadow-xl fade-in">
          {registryTab === "history" ? (
            loanHistory.length === 0 ? (
              <p className="text-gray-500">No completed loan history found.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="px-3 py-2">Asset</th>
                      <th className="px-3 py-2">Borrower</th>
                      <th className="px-3 py-2">Purpose</th>
                      <th className="px-3 py-2">Due</th>
                      <th className="px-3 py-2">Returned</th>
                      <th className="px-3 py-2">Condition</th>
                      <th className="px-3 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanHistory.map((entry) => (
                      <tr key={entry.item.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{entry.item.asset?.item_name || "Asset"} · {entry.item.asset?.asset_tag}</td>
                        <td className="px-3 py-2">{entry.requester?.name || "Unknown"}</td>
                        <td className="px-3 py-2">{entry.purpose}</td>
                        <td className="px-3 py-2">{entry.item.due_date || "—"}</td>
                        <td className="px-3 py-2">{entry.item.returned_at ? new Date(entry.item.returned_at).toLocaleDateString() : "—"}</td>
                        <td className="px-3 py-2 capitalize">{entry.item.return_condition || "—"}</td>
                        <td className="px-3 py-2">{entry.item.return_note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : loading ? (
            <div className="space-y-4">
              <div className="h-8 shimmer rounded-lg" />
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-12 w-24 shimmer rounded-lg" />
                    <div className="h-12 flex-1 shimmer rounded-lg" />
                    <div className="h-12 w-16 shimmer rounded-lg" />
                    <div className="h-12 w-16 shimmer rounded-lg" />
                    <div className="h-12 w-16 shimmer rounded-lg" />
                    <div className="h-12 w-32 shimmer rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <p className="text-gray-500">No assets found.</p>
          ) : (
            <div className="space-y-8">
              {(() => {
                // Group assets by category
                const grouped = filteredAssets.reduce((acc, a) => {
                  const cat = a.category || "other";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(a);
                  return acc;
                }, {} as Record<string, typeof filteredAssets>);

                const categoryLabels: Record<string, string> = {
                  electronics: "Electronics",
                  furniture: "Furniture",
                  vehicle: "Vehicles",
                  office_supplies: "Office Supplies",
                  other: "Other",
                };

                const categoryIcons: Record<string, string> = {
                  electronics: "💻",
                  furniture: "🪑",
                  vehicle: "🚗",
                  office_supplies: "📦",
                  other: "📦",
                };

                return Object.entries(grouped).map(([category, assets]) => (
                  <div key={category} className="fade-in">
                    <div 
                      className="mb-4 flex items-center justify-between gap-3 border-b-2 border-brand/20 pb-3 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg px-2 -mx-2"
                      onClick={() => setCollapsedCategories({
                        ...collapsedCategories,
                        [category]: !collapsedCategories[category]
                      })}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{categoryIcons[category] || "📦"}</span>
                        <div>
                          <h3 className="text-xl font-bold text-brand-deep">
                            {categoryLabels[category] || category}
                          </h3>
                          <p className="text-sm text-gray-500">{assets.length} item{assets.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <button className="text-2xl text-gray-400 hover:text-brand-deep transition-colors">
                        {collapsedCategories[category] ? '▶' : '▼'}
                      </button>
                    </div>
                    {!collapsedCategories[category] && (
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-600">
                            <th className="px-4 py-3 font-semibold">Tag</th>
                            <th className="px-4 py-3 font-semibold">Item</th>
                            <th className="px-4 py-3 font-semibold">Serial No</th>
                            <th className="px-4 py-3 font-semibold">Holder</th>
                            <th className="px-4 py-3 font-semibold">Holding Status</th>
                            <th className="px-4 py-3 font-semibold">Cost</th>
                            <th className="px-4 py-3 font-semibold">Location</th>
                            <th className="px-4 py-3 font-semibold">Condition</th>
                            {canEdit && <th className="px-4 py-3 font-semibold"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {assets.map((a) => (
                            <tr
                              key={a.id}
                              onClick={() => setSelectedAssetId(a.id)}
                              className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand/5 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-xs font-medium text-brand-deep">{a.asset_tag}</td>
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-900">{a.item_name}</span>
                                {a.electronics_subcategory && (
                                  <span className="ml-2 text-xs text-brand-deep bg-brand/10 px-2 py-0.5 rounded-full">
                                    {(a.electronics_subcategory || "").replace("_", " ")}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs text-gray-600">{a.serial_number || "—"}</span>
                              </td>
                              <td className="px-4 py-3">{a.borrower_name || a.assignee_name || "—"}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium capitalize text-gray-700">
                                  {a.borrowed_by
                                    ? a.return_requested
                                      ? "Return pending"
                                      : "Borrowed"
                                    : a.status === "under_repair"
                                      ? "Under repair"
                                      : a.status === "retired"
                                        ? "Retired"
                                        : a.assigned_to
                                          ? "Assigned"
                                        : "Available"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {a.purchase_cost ? (
                                  <span className="font-medium">{a.purchase_cost} ETB</span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">{a.location || "—"}</td>
                              <td className="px-4 py-3">
                                {canEdit ? (
                                  <select
                                    value={a.status}
                                    onChange={(e) =>
                                      handleStatusChange(a.id, e.target.value)
                                    }
                                    className={`rounded-full border-0 px-3 py-1.5 text-xs font-medium shadow-sm transition-all duration-200 hover:shadow-md ${
                                      statusColors[a.status]
                                    }`}
                                  >
                                    <option value="new">New</option>
                                    <option value="in_use">In Use</option>
                                    <option value="under_repair">Under Repair</option>
                                    <option value="retired">Retired</option>
                                  </select>
                                ) : (
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${
                                      statusColors[a.status]
                                    }`}
                                  >
                                    {(a.status || "").replace("_", " ")}
                                  </span>
                                )}
                              </td>
                              {canEdit && (
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => handleEditClick(a)}
                                      className="rounded-full px-3 py-1.5 text-xs font-medium text-brand-deep hover:bg-brand/10 transition-all duration-200 hover:scale-105"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(a.id)}
                                      className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-all duration-200 hover:scale-105"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {selectedAsset && (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-deep">
                  {selectedAsset.item_name || "Asset details"} · {selectedAsset.asset_tag}
                </h2>
                <p className="text-sm text-gray-500">
                  Serial {selectedAsset.serial_number || "—"} · Holder {selectedAsset.borrower_name || selectedAsset.assignee_name || "—"} · Condition {(selectedAsset.status || "").replaceAll("_", " ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssetId(null)}
                className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
              >
                Close
              </button>
            </div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Loan history</h3>
            {selectedAssetLoans.length === 0 ? (
              <p className="text-sm text-gray-500">No loans recorded for this asset.</p>
            ) : (
              <div className="space-y-2">
                {selectedAssetLoans.map((entry) => (
                  <div key={entry.item.id} className="flex flex-wrap justify-between gap-2 border-t border-gray-100 py-2 text-sm">
                    <span>
                      {entry.requester?.name || "Unknown borrower"} · {entry.purpose}
                    </span>
                    <span className="text-gray-500">
                      Issued {entry.item.borrowed_at ? new Date(entry.item.borrowed_at).toLocaleDateString() : "—"}
                      {entry.item.due_date ? ` · Due ${entry.item.due_date}` : ""}
                      {entry.item.returned_at ? ` · Returned ${new Date(entry.item.returned_at).toLocaleDateString()}` : " · Not returned"}
                      {entry.item.return_condition ? ` · ${entry.item.return_condition}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
