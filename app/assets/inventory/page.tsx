"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type InventoryItem = {
  category: string;
  item_name: string;
  available_count: number;
};

type InventoryAsset = {
  asset_tag: string;
  category: string | null;
  item_name: string | null;
  serial_number: string | null;
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryAssets, setInventoryAssets] = useState<InventoryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [serialSearch, setSerialSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/assets/inventory")
      .then((res) => res.json())
      .then((data) => {
        setInventory(data.inventory || []);
        setInventoryAssets(data.assets || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const categoryColors: Record<string, string> = {
    electronics: "bg-blue-100 text-blue-800",
    furniture: "bg-amber-100 text-amber-800",
    vehicle: "bg-green-100 text-green-800",
    office_supplies: "bg-purple-100 text-purple-800",
    other: "bg-gray-100 text-gray-800",
  };

  const matchingAssets = serialSearch.trim()
    ? inventoryAssets.filter((asset) =>
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

          {serialSearch.trim() && !loading && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-brand-deep">
                Matching available assets
              </h2>
              {matchingAssets.length === 0 ? (
                <p className="text-sm text-gray-500">No available assets match that serial number.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 font-semibold">Serial Number</th>
                        <th className="px-4 py-3 font-semibold">Asset Tag</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingAssets.map((asset) => (
                        <tr key={asset.asset_tag} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-gray-900">{asset.item_name || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{asset.serial_number}</td>
                          <td className="px-4 py-3 font-mono text-xs">{asset.asset_tag}</td>
                          <td className="px-4 py-3">{(asset.category || "other").replaceAll("_", " ")}</td>
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
                            <th className="px-4 py-3 text-center font-semibold">Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => (
                            <tr
                              key={`${item.category}-${item.item_name}-${index}`}
                              className="border-b border-gray-100 last:border-0 hover:bg-brand/5 transition-colors"
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">{item.item_name || "—"}</td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm transition-all duration-200 hover:scale-110 ${
                                    item.available_count > 0
                                      ? "bg-gradient-to-br from-green-400 to-green-600 text-white"
                                      : "bg-gradient-to-br from-red-400 to-red-600 text-white"
                                  }`}
                                >
                                  {item.available_count}
                                </span>
                              </td>
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

        <div className="mt-8 fade-in">
          <div className="rounded-2xl border-t-4 border-green-500 bg-white/95 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-shadow">
            <p className="text-sm font-medium text-gray-500">Available</p>
            <p className="mt-3 text-3xl font-bold text-green-700">
              {inventory.reduce((sum, item) => sum + item.available_count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
