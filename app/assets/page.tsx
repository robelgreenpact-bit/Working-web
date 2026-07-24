"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type Asset = {
  id: string;
  asset_tag: string;
  category: string;
  item_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  borrowed_by: string | null;
  borrower_name: string | null;
  return_requested: boolean;
  purchase_cost: number | null;
  purchase_date: string | null;
  status: string;
  location: string | null;
};

type UserOption = {
  id: string;
  name: string;
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
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: "",
    item_name: "",
    assigned_to: "",
    purchase_cost: "",
    purchase_date: "",
    status: "new",
    location: "",
  });

  const loadAssets = async () => {
    setLoading(true);
    const res = await fetch("/api/assets");
    const data = await res.json();
    setAssets(data.assets || []);
    setLoading(false);
  };

  useEffect(() => {
    loadAssets();
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
      item_name: "",
      assigned_to: "",
      purchase_cost: "",
      purchase_date: "",
      status: "new",
      location: "",
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
      item_name: asset.item_name || "",
      assigned_to: asset.assigned_to || "",
      purchase_cost: asset.purchase_cost ? String(asset.purchase_cost) : "",
      purchase_date: asset.purchase_date || "",
      status: asset.status,
      location: asset.location || "",
    });
    setEditingId(asset.id);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadAssets();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this asset record? This cannot be undone.")) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    loadAssets();
  };

  const handleConfirmReturn = async (id: string) => {
    if (!confirm("Confirm this asset has been returned?")) return;
    const res = await fetch(`/api/assets/${id}/confirm-return`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to confirm return");
      return;
    }
    loadAssets();
  };

  const filteredAssets =
    filter === "all" ? assets : assets.filter((a) => a.status === filter);

  return (
    <div>
      <Navbar title="Asset Registry" />
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">Asset Registry</h1>
          {canAdd && (
            <button
              onClick={() =>
                showForm ? handleCancelForm() : setShowForm(true)
              }
              className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
            >
              {showForm ? "Cancel" : "+ Add Asset"}
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 grid grid-cols-1 gap-3 rounded-lg border-t-4 border-brand bg-white p-6 shadow sm:grid-cols-2"
          >
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Category
              </label>
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="">— Select category —</option>
                <option value="electronics">Electronics</option>
                <option value="furniture">Furniture</option>
                <option value="vehicle">Vehicle</option>
                <option value="office_supplies">Office Supplies</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
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
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Assigned To
              </label>
              <select
                value={form.assigned_to}
                onChange={(e) =>
                  setForm({ ...form, assigned_to: e.target.value })
                }
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
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
              <label className="mb-1 block text-sm text-gray-600">
                Purchase Cost (ETB)
              </label>
              <input
                type="number"
                min={0}
                value={form.purchase_cost}
                onChange={(e) =>
                  setForm({ ...form, purchase_cost: e.target.value })
                }
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Purchase Date
              </label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) =>
                  setForm({ ...form, purchase_date: e.target.value })
                }
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="new">New</option>
                <option value="in_use">In Use</option>
                <option value="under_repair">Under Repair</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Location
              </label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="">— Select location —</option>
                <option value="Bahir Dar Office">Bahir Dar Office</option>
                <option value="Addis Ababa Office">Addis Ababa Office</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="rounded bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50 sm:col-span-2"
            >
              {creating
                ? "Saving..."
                : editingId
                  ? "Update Asset"
                  : "Add Asset"}
            </button>
          </form>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <button
            onClick={() =>
              (window.location.href = "/api/reports/assets?format=xlsx")
            }
            className="rounded-full bg-brand-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            Download Excel
          </button>
          <button
            onClick={() =>
              (window.location.href = "/api/reports/assets?format=docx")
            }
            className="rounded-full bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
          >
            Download Word
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {["all", "new", "in_use", "under_repair", "retired"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-sm ${
                filter === f
                  ? "bg-brand-deep text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "All" : f.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-gray-500">No assets found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-2">Tag</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Assigned To</th>
                    <th className="pb-2">Borrowed By</th>
                    <th className="pb-2">Cost</th>
                    <th className="pb-2">Location</th>
                    <th className="pb-2">Status</th>
                    {canEdit && <th className="pb-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{a.asset_tag}</td>
                      <td className="py-2">
                        {a.item_name}
                        <span className="ml-1 text-xs text-gray-400">
                          ({(a.category || "other").replace("_", " ")})
                        </span>
                      </td>
                      <td className="py-2">{a.assignee_name || "—"}</td>
                      <td className="py-2">
                        {a.borrower_name ? (
                          <div>
                            <span>{a.borrower_name}</span>
                            {a.return_requested && (
                              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                Return requested
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        {a.purchase_cost ? `${a.purchase_cost} ETB` : "—"}
                      </td>
                      <td className="py-2">{a.location || "—"}</td>
                      <td className="py-2">
                        {canEdit ? (
                          <select
                            value={a.status}
                            onChange={(e) =>
                              handleStatusChange(a.id, e.target.value)
                            }
                            className={`rounded border-0 px-2 py-1 text-xs ${
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
                            className={`rounded px-2 py-1 text-xs ${
                              statusColors[a.status]
                            }`}
                          >
                            {a.status.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2">
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => handleEditClick(a)}
                              className="text-xs text-brand-deep hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                            {a.borrowed_by && (
                              <button
                                onClick={() => handleConfirmReturn(a.id)}
                                className="text-xs text-green-700 hover:underline"
                              >
                                Confirm Return
                              </button>
                            )}
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
      </div>
    </div>
  );
}
