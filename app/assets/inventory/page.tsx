"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

type InventoryAsset = {
  id: string;
  asset_tag: string | null;
  category: string | null;
  electronics_subcategory: string | null;
  item_name: string | null;
  serial_number?: string | null;
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
    available: assets.filter((a) => a.status === "available").length,
    borrowed: assets.filter((a) =>
      ["borrowed", "return_requested"].includes(a.status),
    ).length,
    underRepair: assets.filter((a) => a.status === "under_repair").length,
    returnRequested: assets.filter(
      (a) => a.status === "return_requested",
    ).length,
    retired: assets.filter((a) => a.status === "retired").length,
    reserved: assets.filter((a) => a.status === "reserved").length,
    assigned: assets.filter((a) => a.status === "assigned").length,
    unavailable: assets.filter(
      (a) =>
        ![
          "available",
          "borrowed",
          "return_requested",
          "under_repair",
          "retired",
          "reserved",
          "assigned",
        ].includes(a.status),
    ).length,
  };
}

function displayName(asset: InventoryAsset) {
  if (
    asset.category === "electronics" &&
    asset.electronics_subcategory === "tablet"
  ) {
    return "Tablet";
  }

  if (
    asset.category === "electronics" &&
    asset.electronics_subcategory === "pc"
  ) {
    return "PC";
  }

  return asset.item_name?.trim() || "Unnamed item";
}

function StockHeader() {
  return (
    <thead className="bg-gray-50 text-gray-600">
      <tr>
        <th scope="col" className="px-4 py-3">Item / group</th>
        <th scope="col" className="px-4 py-3 text-center">Total</th>
        <th scope="col" className="px-4 py-3 text-center">Available</th>
        <th scope="col" className="px-4 py-3 text-center">Borrowed</th>
        <th scope="col" className="px-4 py-3 text-center whitespace-nowrap">
          Under Repair
        </th>
      </tr>
    </thead>
  );
}

function CountCells({ assets }: { assets: InventoryAsset[] }) {
  const counts = countAssets(assets);

  return (
    <>
      <td className="px-4 py-4 text-center font-semibold">
        {counts.total}
      </td>
      <td className="px-4 py-4 text-center font-semibold text-green-700">
        {counts.available}
      </td>
      <td className="px-4 py-4 text-center font-semibold text-blue-700">
        {counts.borrowed}
      </td>
      <td className="px-4 py-4 text-center font-semibold text-amber-700">
        {counts.underRepair}
      </td>
    </>
  );
}

function AssetDetails({
  assets,
  canManage,
}: {
  assets: InventoryAsset[];
  canManage: boolean;
}) {
  const counts = countAssets(assets);
  const additional =
    counts.retired + counts.reserved + counts.assigned + counts.unavailable;

  return (
    <div className="space-y-3">
      {additional > 0 && (
        <p className="text-xs text-gray-600">
          Also included in this item’s total: {counts.retired} retired,{" "}
          {counts.reserved} reserved, {counts.assigned} assigned, and{" "}
          {counts.unavailable} unavailable.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th scope="col" className="px-3 py-3">Asset code</th>
              {canManage && (
                <th scope="col" className="px-3 py-3">Serial number</th>
              )}
              <th scope="col" className="px-3 py-3">Location</th>
              <th scope="col" className="px-3 py-3">Current holder</th>
              <th scope="col" className="px-3 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t border-gray-100">
                <td className="px-3 py-3 font-mono font-medium text-brand-deep">
                  {asset.asset_tag || "Not recorded"}
                </td>

                {canManage && (
                  <td className="px-3 py-3 font-mono">
                    {asset.serial_number || "Not recorded"}
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
                      statusColors[asset.status] || statusColors.unavailable
                    }`}
                  >
                    {statusLabels[asset.status] || asset.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRows({
  group,
  expanded,
  onToggle,
  canManage,
}: {
  group: ItemGroup;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
}) {
  return (
    <>
      <tr className="border-t border-gray-200 hover:bg-gray-50">
        <td className="px-4 py-4">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex items-start gap-3 text-left"
          >
            <span aria-hidden="true" className="font-bold text-brand-deep">
              {expanded ? "−" : "+"}
            </span>
            <span>
              <span className="block font-semibold text-gray-900">
                {group.name}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {categoryLabels[group.category] || group.category}
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
        <CountCells assets={group.assets} />
      </tr>

      {expanded && (
        <tr className="border-t border-gray-100">
          <td colSpan={5} className="bg-gray-50 p-4">
            <AssetDetails assets={group.assets} canManage={canManage} />
          </td>
        </tr>
      )}
    </>
  );
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

  const [officeOpen, setOfficeOpen] = useState(false);
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
          throw new Error(result.error || "Unable to load inventory.");
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
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadInventory();
    return () => controller.abort();
  }, [refreshVersion]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshVersion((value) => value + 1);
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter("all");
    setTypeFilter("all");
    setLocationFilter("all");
  }

  function toggleItem(key: string) {
    setExpandedItems((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
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
    const category = asset.category || "other";
    const searchableValues = [
      displayName(asset),
      asset.item_name,
      asset.asset_tag,
      asset.current_holder,
      asset.location,
      categoryLabels[category] || category,
      ...(canManage ? [asset.serial_number] : []),
    ];

    return (
      (!searchText ||
        searchableValues.some((value) =>
          value?.toLowerCase().includes(searchText),
        )) &&
      (categoryFilter === "all" || category === categoryFilter) &&
      (typeFilter === "all" ||
        (category === "electronics" &&
          asset.electronics_subcategory === typeFilter)) &&
      (locationFilter === "all" || asset.location === locationFilter)
    );
  });

  const groupMap = new Map<string, ItemGroup>();

  for (const asset of filteredAssets) {
    const category = asset.category || "other";
    const electronicsType =
      category === "electronics" ? asset.electronics_subcategory : null;
    const name = displayName(asset);
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
        name,
        assets: [],
      };
      groupMap.set(key, group);
    }

    group.assets.push(asset);
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.electronicsType || "").localeCompare(b.electronicsType || "") ||
      a.name.localeCompare(b.name),
  );

  for (const group of groups) {
    group.assets.sort((a, b) =>
      (a.asset_tag || "").localeCompare(
        b.asset_tag || "",
        undefined,
        { numeric: true },
      ),
    );
  }

  const officeGroups = groups.filter(
    (group) => group.category === "office_supplies",
  );
  const officeAssets = officeGroups.flatMap((group) => group.assets);

  // Search results inside Office Supplies are shown automatically.
  const officeExpanded =
    officeOpen ||
    Boolean(searchText) ||
    categoryFilter === "office_supplies";

  const counts = countAssets(filteredAssets);
  const additional =
    counts.retired + counts.reserved + counts.assigned + counts.unavailable;

  const hasFilters =
    Boolean(searchText) ||
    categoryFilter !== "all" ||
    typeFilter !== "all" ||
    locationFilter !== "all";

  const summaries = [
    { label: "Total", value: counts.total, color: "text-brand-deep" },
    { label: "Available", value: counts.available, color: "text-green-700" },
    { label: "Borrowed", value: counts.borrowed, color: "text-blue-700" },
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
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-deep">
              Inventory Overview
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              View stock totals and expand items to inspect individual assets.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/borrowed"
              className="rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-medium text-white"
            >
              Borrowed & Returns
            </Link>
            <Link
              href="/assets"
              className="rounded-lg border bg-white px-4 py-2.5 text-sm"
            >
              Asset Registry
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border bg-white px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

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
              className="ml-3 underline disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-gray-700">
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  canManage ? "Item, code, serial, or worker" : "Item, code, or worker"
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
                  <option key={value} value={value}>{label}</option>
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
                onChange={(event) => setLocationFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </label>
          </div>

          {hasFilters && (
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <p className="text-xs text-gray-500">
                All counts reflect the current filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-brand-deep underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaries.map((summary) => (
            <div key={summary.label} className="rounded-xl border bg-white p-5 shadow-sm">
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
              Borrowed includes {counts.returnRequested} devices awaiting
              return confirmation.
            </p>
            {additional > 0 && (
              <p>
                Total also includes: {counts.retired} retired,{" "}
                {counts.reserved} reserved, {counts.assigned} assigned,
                and {counts.unavailable} otherwise unavailable.
              </p>
            )}
          </div>
        )}

        <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-brand-deep">Stock by item</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Expand Office Supplies to see its items. Expand any item to see
            its individual assets.
          </p>

          {loading ? (
            <p role="status" className="py-8 text-center text-gray-500">
              Loading inventory…
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
                <StockHeader />
                <tbody>
                  {groups.map((group) => {
                    if (group.category !== "office_supplies") {
                      return (
                        <ItemRows
                          key={group.key}
                          group={group}
                          expanded={Boolean(expandedItems[group.key])}
                          onToggle={() => toggleItem(group.key)}
                          canManage={canManage}
                        />
                      );
                    }

                    // Render one parent row for the whole category.
                    if (group.key !== officeGroups[0]?.key) return null;

                    return (
                      <Fragment key="office-supplies">
                        <tr className="border-t bg-green-50">
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              aria-expanded={officeExpanded}
                              onClick={() => {
                                if (
                                  searchText ||
                                  categoryFilter === "office_supplies"
                                ) {
                                  return;
                                }
                                setOfficeOpen((previous) => !previous);
                              }}
                              className="flex items-start gap-3 text-left"
                            >
                              <span aria-hidden="true" className="font-bold text-brand-deep">
                                {officeExpanded ? "−" : "+"}
                              </span>
                              <span>
                                <span className="block font-semibold text-brand-deep">
                                  Office Supplies
                                </span>
                                <span className="mt-1 block text-xs text-gray-600">
                                  {officeGroups.length} item types
                                  {(searchText || categoryFilter === "office_supplies") &&
                                    " · Expanded for current filters"}
                                </span>
                              </span>
                            </button>
                          </td>
                          <CountCells assets={officeAssets} />
                        </tr>

                        {officeExpanded && (
                          <tr>
                            <td colSpan={5} className="bg-green-50/50 p-3 sm:p-5">
                              <div className="overflow-x-auto rounded-lg border bg-white">
                                <table className="w-full text-left text-sm">
                                  <StockHeader />
                                  <tbody>
                                    {officeGroups.map((officeGroup) => (
                                      <ItemRows
                                        key={officeGroup.key}
                                        group={officeGroup}
                                        expanded={Boolean(expandedItems[officeGroup.key])}
                                        onToggle={() => toggleItem(officeGroup.key)}
                                        canManage={canManage}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}