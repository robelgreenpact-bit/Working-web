"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type InventoryItem = {
  category: string;
  item_name: string;
  total_count: number;
  available_count: number;
  borrowed_count: number;
  borrowed_by: string[];
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assets/inventory")
      .then((res) => res.json())
      .then((data) => {
        setInventory(data.inventory || []);
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">Item Name</th>
                    <th className="pb-3 text-center font-semibold">Total</th>
                    <th className="pb-3 text-center font-semibold">Available</th>
                    <th className="pb-3 text-center font-semibold">Borrowed</th>
                    <th className="pb-3 font-semibold">Borrowed By</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, index) => (
                    <tr
                      key={`${item.category}-${item.item_name}-${index}`}
                      className="border-b border-gray-100 last:border-0 hover:bg-brand/5 transition-colors"
                    >
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${
                            categoryColors[item.category] || categoryColors.other
                          }`}
                        >
                          {(item.category || "other").replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 font-medium text-gray-900">{item.item_name || "—"}</td>
                      <td className="py-3 text-center">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-deep to-brand-dark text-white font-bold shadow-md">
                          {item.total_count}
                        </span>
                      </td>
                      <td className="py-3 text-center">
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
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm transition-all duration-200 hover:scale-110 ${
                            item.borrowed_count > 0
                              ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white"
                              : "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700"
                          }`}
                        >
                          {item.borrowed_count}
                        </span>
                      </td>
                      <td className="py-3">
                        {item.borrowed_by.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.borrowed_by.map((borrower, idx) => (
                              <span
                                key={idx}
                                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-200 transition-colors"
                              >
                                {borrower}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 fade-in">
          <div className="rounded-2xl border-t-4 border-brand bg-white/95 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-shadow">
            <p className="text-sm font-medium text-gray-500">Total Items</p>
            <p className="mt-3 text-3xl font-bold text-brand-deep">
              {inventory.reduce((sum, item) => sum + item.total_count, 0)}
            </p>
          </div>
          <div className="rounded-2xl border-t-4 border-green-500 bg-white/95 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-shadow">
            <p className="text-sm font-medium text-gray-500">Available</p>
            <p className="mt-3 text-3xl font-bold text-green-700">
              {inventory.reduce((sum, item) => sum + item.available_count, 0)}
            </p>
          </div>
          <div className="rounded-2xl border-t-4 border-amber-500 bg-white/95 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-shadow">
            <p className="text-sm font-medium text-gray-500">Borrowed</p>
            <p className="mt-3 text-3xl font-bold text-amber-700">
              {inventory.reduce((sum, item) => sum + item.borrowed_count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
