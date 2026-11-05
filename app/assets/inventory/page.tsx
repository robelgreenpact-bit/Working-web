"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type InventoryAsset = {
  id: string;
  asset_tag: string;
  category: string;
  electronics_subcategory: string | null;
  item_name: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  asset_condition: string;
  is_available: boolean;
  current_holder: string | null;
};

type InventoryResponse = {
  assets: InventoryAsset[];
  can_manage: boolean;
};

type ItemGroup = {
  key: string;
  category: string;
  electronicsType: string | null;
  name: string;
  assets: InventoryAsset[];
};

const categoryLabels: Record<string, string> = {
  electronics: "Electronics",
  furniture: "Furniture",
  vehicle: "Vehicles",
  office_supplies: "Office Supplies",
  other: "Other",
};

const typeLabels: Record<string, string> = {
  tablet: "Tablet",
  pc: "PC",
  other: "Other electronics",
};

const statusLabels: Record<string, string> = {
  available: "Available",
  borrowed: "Borrowed",
  return_requested: "Return requested",
  under_repair: "Under Repair",
  retired: "Retired",
  reserved: "Reserved",
  assigned: "Assigned",
  unavailable: "Unavailable",
};

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  borrowed: "bg-blue-100 text-blue-800",
  return_requested: "bg-orange-100 text-orange-800",
  under_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-200 text-gray-700",
  reserved: "bg-purple-100 text-purple-800",
  assigned: "bg-slate-100 text-slate-700",
  unavailable: "bg-gray-100 text-gray-700",
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-deep/20";

function countAssets(assets: InventoryAsset[]) {
  return {
    total: assets.length,
    available: assets.filter((asset) => asset.status === "available")
      .length,
    borrowed: assets.filter((asset) =>
      ["borrowed", "return_requested"].includes(asset.status),
    ).length,
    underRepair: assets.filter(
      (asset) => asset.status === "under_repair",
    ).length,
    returnRequested: assets.filter(
      (asset) => asset.status === "return_requested",
    ).length,
    retired: assets.filter((asset) => asset.status === "retired")
      .length,
    reserved: assets.filter((asset) => asset.status === "reserved")
      .length,
    assigned: assets.filter((asset) => asset.status === "assigned")
      .length,
    unavailable: assets.filter(
      (asset) =>
        ![
          "available",
          "borrowed",
          "return_requested",
          "under_repair",
          "retired",
          "reserved",
          "assigned",
        ].includes(asset.status),
    ).length,
  };
}

export default function InventoryPage() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const [expandedItems, setExpandedItems] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    async function loadInventory() {
      try {
        const response = await fetch("/api/assets/inventory", {
          signal: controller.signal,
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Unable to load inventory.",
          );
        }

        if (!Array.isArray(result.assets)) {
          throw new Error("The inventory response is incomplete.");
        }

        if (!controller.signal.aborted) {
          setData({
            assets: result.assets,
            can_manage: result.can_manage === true,
          });
          setError("");
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load inventory.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInventory();

    return () => controller.abort();
  }, [refreshVersion]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshVersion((previous) => previous + 1);
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter("all");
    setTypeFilter("all");
    setLocationFilter("all");
  }

  const assets = data?.assets || [];
  const canManage = data?.can_manage === true;

  const locations = Array.from(
    new Set(
      assets
        .map((asset) => asset.location)
        .filter((location): location is string => Boolean(location)),
    ),
  ).sort();

  const searchText = search.trim().toLowerCase();

  const filteredAssets = assets.filter((asset) => {
    const searchableValues = [
      asset.item_name,
      asset.asset_tag,
      asset.current_holder,
      ...(canManage ? [asset.serial_number] : []),
    ];

    const matchesSearch =
      !searchText ||
      searchableValues.some((value) =>
        value?.toLowerCase().includes(searchText),
      );

    const matchesCategory =
      categoryFilter === "all" ||
      asset.category === categoryFilter;

    const matchesType =
      typeFilter === "all" ||
      (asset.category === "electronics" &&
        asset.electronics_subcategory === typeFilter);

    const matchesLocation =
      locationFilter === "all" ||
      asset.location === locationFilter;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesType &&
      matchesLocation
    );
  });

  const groupMap = new Map<string, ItemGroup>();

  for (const asset of filteredAssets) {
    const category = asset.category || "other";
    const electronicsType =
      category === "electronics"
        ? asset.electronics_subcategory
        : null;

    const name = asset.item_name?.trim() || "";

    const key = JSON.stringify([
      category,
      electronicsType,
      name.toLowerCase(),
    ]);

    let group = groupMap.get(key);

    if (!group) {
      group = {
        key,
        category,
        electronicsType,
        name: name || "Unnamed item",
        assets: [],
      };

      groupMap.set(key, group);
    }

    group.assets.push(asset);
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.electronicsType || "").localeCompare(
        b.electronicsType || "",
      ) ||
      a.name.localeCompare(b.name),
  );

  for (const group of groups) {
    group.assets.sort((a, b) =>
      a.asset_tag.localeCompare(b.asset_tag),
    );
  }

  const counts = countAssets(filteredAssets);

  const otherCount =
    counts.retired +
    counts.reserved +
    counts.assigned +
    counts.unavailable;

  const hasFilters =
    Boolean(searchText) ||
    categoryFilter !== "all" ||
    typeFilter !== "all" ||
    locationFilter !== "all";

  const summaries = [
    {
      label: "Total",
      value: counts.total,
      color: "text-brand-deep",
    },
    {
      label: "Available",
      value: counts.available,
      color: "text-green-700",
    },
    {
      label: "Borrowed",
      value: counts.borrowed,
      color: "text-blue-700",
    },
    {
      label: "Under Repair",
      value: counts.underRepair,
      color: "text-amber-700",
    },
  ];

  return (
    <div>
      <Navbar title="Inventory" />

      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">
              Inventory Overview
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              View stock by item and inspect each registered device.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/assets/borrowed"
              className="rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Borrowed & Returns
            </a>

            <a
              href="/assets"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700"
            >
              Asset Registry
            </a>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="ml-3 font-medium underline disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-gray-700">
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  canManage
                    ? "Item, code, serial, or worker"
                    : "Item, code, or worker"
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
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

            <label className="text-sm font-medium text-gray-700">
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

            <label className="text-sm font-medium text-gray-700">
              Location
              <select
                value={locationFilter}
                onChange={(event) =>
                  setLocationFilter(event.target.value)
                }
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

          {hasFilters && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Counts and device lists reflect the current filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-brand-deep underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaries.map((summary) => (
            <div
              key={summary.label}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-gray-500">
                {summary.label}
              </p>
              <p className={`mt-2 text-3xl font-bold ${summary.color}`}>
                {loading || error ? "—" : summary.value}
              </p>
            </div>
          ))}
        </div>

        {!loading && !error && (
          <div className="mb-6 space-y-1 text-sm text-gray-600">
            <p>
              Borrowed includes {counts.returnRequested} device
              {counts.returnRequested === 1 ? "" : "s"} awaiting
              return confirmation.
            </p>

            {otherCount > 0 && (
              <p>
                Total also includes: {counts.retired} retired,{" "}
                {counts.reserved} reserved, {counts.assigned} assigned,
                and {counts.unavailable} otherwise unavailable.
              </p>
            )}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-brand-deep">
              Stock by item
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Select an item to see its individual devices.
            </p>
          </div>

          {loading ? (
            <p role="status" className="py-8 text-center text-gray-500">
              Loading inventory...
            </p>
          ) : error ? (
            <p className="py-8 text-center text-gray-500">
              Inventory could not be loaded. Use Retry above.
            </p>
          ) : groups.length === 0 ? (
            <p className="py-8 text-center text-gray-500">
              {hasFilters
                ? "No devices match these filters."
                : "No registered inventory was found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Item name</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-center">Available</th>
                    <th className="px-4 py-3 text-center">Borrowed</th>
                    <th className="px-4 py-3 text-center">
                      Under Repair
                    </th>
                  </tr>
                </thead>

                {groups.map((group) => {
                  const itemCounts = countAssets(group.assets);
                  const expanded = Boolean(expandedItems[group.key]);

                  const additionalCount =
                    itemCounts.retired +
                    itemCounts.reserved +
                    itemCounts.assigned +
                    itemCounts.unavailable;

                  return (
                    <tbody key={group.key}>
                      <tr className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedItems((previous) => ({
                                ...previous,
                                [group.key]: !previous[group.key],
                              }))
                            }
                            className="flex items-start gap-3 text-left"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-0.5 font-bold text-brand-deep"
                            >
                              {expanded ? "−" : "+"}
                            </span>

                            <span>
                              <span className="block font-semibold text-gray-900">
                                {group.name}
                              </span>
                              <span className="mt-1 block text-xs text-gray-500">
                                {categoryLabels[group.category] ||
                                  group.category}
                                {group.electronicsType
                                  ? ` · ${
                                      typeLabels[group.electronicsType] ||
                                      group.electronicsType
                                    }`
                                  : ""}
                              </span>
                            </span>
                          </button>
                        </td>

                        <td className="px-4 py-4 text-center font-semibold">
                          {itemCounts.total}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-green-700">
                          {itemCounts.available}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-blue-700">
                          {itemCounts.borrowed}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-amber-700">
                          {itemCounts.underRepair}
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="border-t border-gray-100">
                          <td colSpan={5} className="bg-gray-50 p-4">
                            {additionalCount > 0 && (
                              <p className="mb-3 text-xs text-gray-600">
                                Also included in this item’s total:{" "}
                                {itemCounts.retired} retired,{" "}
                                {itemCounts.reserved} reserved,{" "}
                                {itemCounts.assigned} assigned, and{" "}
                                {itemCounts.unavailable} unavailable.
                              </p>
                            )}

                            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-gray-100 text-gray-600">
                                  <tr>
                                    <th className="px-3 py-3">
                                      Asset code
                                    </th>
                                    {canManage && (
                                      <th className="px-3 py-3">
                                        Serial number
                                      </th>
                                    )}
                                    <th className="px-3 py-3">
                                      Location
                                    </th>
                                    <th className="px-3 py-3">
                                      Current holder
                                    </th>
                                    <th className="px-3 py-3">
                                      Status
                                    </th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {group.assets.map((asset) => (
                                    <tr
                                      key={asset.id}
                                      className="border-t border-gray-100"
                                    >
                                      <td className="px-3 py-3 font-mono font-medium text-brand-deep">
                                        {asset.asset_tag}
                                      </td>

                                      {canManage && (
                                        <td className="px-3 py-3 font-mono">
                                          {asset.serial_number ||
                                            "Not recorded"}
                                        </td>
                                      )}

                                      <td className="px-3 py-3">
                                        {asset.location || "Not recorded"}
                                      </td>

                                      <td className="px-3 py-3">
                                        {asset.current_holder || "—"}
                                      </td>

                                      <td className="px-3 py-3">
                                        <span
                                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-medium ${
                                            statusColors[asset.status] ||
                                            statusColors.unavailable
                                          }`}
                                        >
                                          {statusLabels[asset.status] ||
                                            asset.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}