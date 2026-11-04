"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type InventoryItem = {
  category: string;
  item_name: string | null;
  total_count: number;
  available_count: number;
  borrowed_count: number;
  under_repair_count: number;
};

type InventoryAsset = {
  id: string;
  asset_tag: string;
  category: string | null;
  item_name: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  due_date: string | null;
  current_holder: string | null;
};

export default function InventoryPage() {
  const [inventoryAssets, setInventoryAssets] = useState<InventoryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [serialSearch, setSerialSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [locationFilter, setLocationFilter] = useState("all");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assets/inventory")
      .then((res) => res.json())
      .then((data) => {
        setInventoryAssets(data.assets || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
    fetch("/api/dashboard-role")
      .then((res) => res.json())
      .then((data) => setRole(data.role || null))
      .catch(() => {});
  }, []);

  const filteredAssets = inventoryAssets.filter((asset) =>
    locationFilter === "all" || asset.location === locationFilter,
  );

  const inventory = filteredAssets.reduce((items, asset) => {
    const category = asset.category || "other";
    const key = `${category}-${asset.item_name || "unnamed"}`;
    let item = items.find((entry) => `${entry.category}-${entry.item_name || "unnamed"}` === key);
    if (!item) {
      item = {
        category,
        item_name: asset.item_name,
        total_count: 0,
        available_count: 0,
        borrowed_count: 0,
        under_repair_count: 0,
      };
      items.push(item);
    }
    item.total_count++;
    if (asset.status === "available") item.available_count++;
    if (asset.status === "borrowed" || asset.status === "return_requested") item.borrowed_count++;
    if (asset.status === "under_repair") item.under_repair_count++;
    return items;
  }, [] as InventoryItem[]);

  const matchingAssets = serialSearch.trim()
    ? filteredAssets.filter((asset) =>
        asset.serial_number?.toLowerCase().includes(serialSearch.trim().toLowerCase()),
      )
    : [];

  return (
    <div>
      <Navbar title="Inventory" />
      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-8 flex items-center justify-between fade-in">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">Inventory Overview</h1>
            <p className="mt-1 text-sm text-gray-500">Track and manage all inventory items</p>
          </div>
          <a
            href="/assets"
            className="rounded-full bg-gray-100 px-6 py-3 font-medium text-gray-700 shadow-md transition-all duration-200 hover:bg-gray-200 hover:shadow-lg hover:scale-105"
          >
            ← Back to Assets
          </a>
        </div>

        <div className="rounded-2xl border-t-4 border-brand bg-white/95 backdrop-blur-sm p-6 shadow-xl fade-in">
          <label className="mb-5 block max-w-xl">
            <span className="mb-2 block text-sm font-medium text-gray-700">
              Search by serial number
            </span>
            <input
              type="search"
              value={serialSearch}
              onChange={(e) => setSerialSearch(e.target.value)}
              placeholder="Enter a serial number, especially for tablets"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20 focus:outline-none"
            />
          </label>

          <label className="mb-5 block max-w-xs">
            <span className="mb-2 block text-sm font-medium text-gray-700">Location</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
            >
              <option value="all">All locations</option>
              <option value="Bahir Dar Office">Bahir Dar Office</option>
              <option value="Addis Ababa Office">Addis Ababa Office</option>
            </select>
          </label>

          {serialSearch.trim() && !loading && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-brand-deep">
                Matching assets
              </h2>
              {matchingAssets.length === 0 ? (
                <p className="text-sm text-gray-500">No assets match that serial number.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 font-semibold">Serial Number</th>
                        <th className="px-4 py-3 font-semibold">Asset Tag</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Holder</th>
                        <th className="px-4 py-3 font-semibold">Location</th>
                        {role === "worker" && <th className="px-4 py-3 font-semibold"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {matchingAssets.map((asset) => (
                        <tr key={asset.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-gray-900">{asset.item_name || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{asset.serial_number}</td>
                          <td className="px-4 py-3 font-mono text-xs">{asset.asset_tag}</td>
                          <td className="px-4 py-3">{(asset.category || "other").replaceAll("_", " ")}</td>
                          <td className="px-4 py-3 capitalize">{asset.status.replaceAll("_", " ")}</td>
                          <td className="px-4 py-3">{asset.current_holder || "—"}</td>
                          <td className="px-4 py-3">{asset.location || "—"}</td>
                          {role === "worker" && (
                            <td className="px-4 py-3">
                              {asset.status === "available" && (
                                <a
                                  href={`/worker/new-request?mode=borrow&assetId=${asset.id}`}
                                  className="whitespace-nowrap rounded bg-brand-deep px-3 py-2 text-xs font-medium text-white"
                                >
                                  Request to borrow
                                </a>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {loading ? (
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
          ) : inventory.length === 0 ? (
            <p className="text-gray-500">No inventory data found.</p>
          ) : (
            <div className="space-y-8">
              {(() => {
                // Group inventory by category
                const grouped = inventory.reduce((acc, item) => {
                  const cat = item.category || "other";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(item);
                  return acc;
                }, {} as Record<string, typeof inventory>);

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

                return Object.entries(grouped).map(([category, items]) => (
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
                          <p className="text-sm text-gray-500">{items.length} item type{items.length !== 1 ? 's' : ''}</p>
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
                            <th className="px-4 py-3 font-semibold">Item Name</th>
                            <th className="px-4 py-3 text-center font-semibold">Total</th>
                            <th className="px-4 py-3 text-center font-semibold">Available</th>
                            <th className="px-4 py-3 text-center font-semibold">Borrowed</th>
                            <th className="px-4 py-3 text-center font-semibold">Under Repair</th>
                          </tr>
                        </thead>
                          {items.map((item, index) => {
                            const itemKey = `${item.category}-${item.item_name}-${index}`;
                            const details = filteredAssets.filter(
                              (asset) => asset.category === item.category && asset.item_name === item.item_name,
                            );
                            return (
                              <tbody key={itemKey}>
                                <tr className="border-b border-gray-100 hover:bg-brand/5 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedItems({ ...expandedItems, [itemKey]: !expandedItems[itemKey] })}
                                      className="mr-2 text-brand-deep"
                                      aria-expanded={Boolean(expandedItems[itemKey])}
                                    >
                                      {expandedItems[itemKey] ? "−" : "+"}
                                    </button>
                                    {item.item_name || "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">{item.total_count}</td>
                                  <td className={`px-4 py-3 text-center font-semibold ${item.available_count === 0 ? "text-red-700" : item.available_count <= 2 ? "text-amber-700" : "text-green-700"}`}>{item.available_count}</td>
                                  <td className="px-4 py-3 text-center">{item.borrowed_count}</td>
                                  <td className="px-4 py-3 text-center">{item.under_repair_count}</td>
                                </tr>
                                {expandedItems[itemKey] && details.map((asset) => (
                                  <tr key={asset.id} className="border-b border-gray-100 bg-gray-50 text-xs">
                                    <td className="px-4 py-2 pl-10">{asset.asset_tag} · {asset.serial_number || "No serial"}</td>
                                    <td className="px-4 py-2" colSpan={2}>{asset.location || "No location"}</td>
                                    <td className="px-4 py-2 capitalize">{asset.current_holder || asset.status.replaceAll("_", " ")}</td>
                                    <td className="px-4 py-2">
                                      {role === "worker" && asset.status === "available" ? (
                                        <a href={`/worker/new-request?mode=borrow&assetId=${asset.id}`} className="text-brand-deep underline">Request to borrow</a>
                                      ) : asset.status.replaceAll("_", " ")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            );
                          })}
                      </table>
                    </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total", value: filteredAssets.length, color: "text-brand-deep" },
            { label: "Available", value: filteredAssets.filter((asset) => asset.status === "available").length, color: "text-green-700" },
            { label: "Borrowed", value: filteredAssets.filter((asset) => ["borrowed", "overdue", "return_requested"].includes(asset.status)).length, color: "text-amber-700" },
            { label: "Return Pending", value: filteredAssets.filter((asset) => asset.status === "return_requested").length, color: "text-orange-700" },
            { label: "Under Repair", value: filteredAssets.filter((asset) => asset.status === "under_repair").length, color: "text-red-700" },
          ].map((summary) => (
            <div key={summary.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">{summary.label}</p>
              <p className={`mt-2 text-2xl font-bold ${summary.color}`}>{summary.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
