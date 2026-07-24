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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-deep">Inventory Overview</h1>
          <a
            href="/assets"
            className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-800 transition hover:bg-gray-300"
          >
            Back to Assets
          </a>
        </div>

        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : inventory.length === 0 ? (
            <p className="text-gray-500">No inventory data found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-3">Category</th>
                    <th className="pb-3">Item Name</th>
                    <th className="pb-3 text-center">Total</th>
                    <th className="pb-3 text-center">Available</th>
                    <th className="pb-3 text-center">Borrowed</th>
                    <th className="pb-3">Borrowed By</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, index) => (
                    <tr
                      key={`${item.category}-${item.item_name}-${index}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-3">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            categoryColors[item.category] || categoryColors.other
                          }`}
                        >
                          {item.category.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 font-medium">{item.item_name || "—"}</td>
                      <td className="py-3 text-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep text-white font-bold">
                          {item.total_count}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-bold ${
                            item.available_count > 0
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {item.available_count}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-bold ${
                            item.borrowed_count > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.borrowed_count}
                        </span>
                      </td>
                      <td className="py-3">
                        {item.borrowed_by.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.borrowed_by.map((borrower, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
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

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border-t-4 border-brand bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Total Items</p>
            <p className="mt-2 text-2xl font-bold text-brand-deep">
              {inventory.reduce((sum, item) => sum + item.total_count, 0)}
            </p>
          </div>
          <div className="rounded-lg border-t-4 border-green-500 bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Available</p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {inventory.reduce((sum, item) => sum + item.available_count, 0)}
            </p>
          </div>
          <div className="rounded-lg border-t-4 border-amber-500 bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Borrowed</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {inventory.reduce((sum, item) => sum + item.borrowed_count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
