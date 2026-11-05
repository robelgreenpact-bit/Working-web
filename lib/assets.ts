import type { SupabaseClient } from "@supabase/supabase-js";

// These are the database condition values for usable devices.
// A device is available only when it also has no holder,
// active loan or pending return.
export const AVAILABLE_ASSET_STATUSES = ["new", "in_use"] as const;

// Keep these for legacy asset_loans checks until old records
// have been migrated and all old borrowing routes are retired.
//
// The new equipment_loans table uses returned_at IS NULL
// to identify active loans.
export const ACTIVE_ASSET_LOAN_STATUSES = [
  "requested",
  "approved",
  "issued",
  "return_requested",
] as const;

const categoryPrefixes: Record<string, string> = {
  electronics: "GPEL",
  furniture: "GPFU",
  vehicle: "GPVE",
  office_supplies: "GPOF",
  other: "GPOT",
};

export async function generateAssetTag(
  supabase: SupabaseClient,
  category: string,
): Promise<string> {
  const prefix = categoryPrefixes[category] || categoryPrefixes.other;

  let highestNumber = 0;
  let offset = 0;
  const pageSize = 500;

  // Read matching tags in pages and compare numeric suffixes.
  // Text sorting alone gives incorrect results after 9999.
  // Search by prefix across categories to avoid prefix collisions.
  while (true) {
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, asset_tag")
      .like("asset_tag", `${prefix}%`)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        `Unable to generate an asset code: ${error.message}`,
      );
    }

    for (const asset of assets || []) {
      const tag = asset.asset_tag;

      if (typeof tag !== "string" || !tag.startsWith(prefix)) {
        continue;
      }

      const suffix = tag.slice(prefix.length);

      // Ignore malformed historical codes.
      if (!/^\d+$/.test(suffix)) continue;

      const number = Number(suffix);

      if (!Number.isSafeInteger(number)) {
        throw new Error(
          `Asset code ${tag} exceeds the supported numbering range.`,
        );
      }

      highestNumber = Math.max(highestNumber, number);
    }

    if (!assets || assets.length < pageSize) break;

    offset += pageSize;
  }

  const nextNumber = highestNumber + 1;

  if (!Number.isSafeInteger(nextNumber)) {
    throw new Error("The asset numbering range has been exhausted.");
  }

  // Preserve the existing sequence bookkeeping.
  // This upsert is not an atomic number reservation.
  const { error: sequenceError } = await supabase
    .from("asset_tag_sequence")
    .upsert(
      {
        category,
        last_number: nextNumber,
      },
      {
        onConflict: "category",
      },
    );

  if (sequenceError) {
    throw new Error(
      `Unable to update asset numbering: ${sequenceError.message}`,
    );
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export function isAssetAvailable(
  status: string | null | undefined,
  borrowedBy: string | null,
  hasOpenLoanRequest: boolean,
  assignedTo: string | null = null,
  returnRequested: boolean = false,
): boolean {
  const usableCondition = AVAILABLE_ASSET_STATUSES.some(
    (availableStatus) => availableStatus === status,
  );

  return (
    usableCondition &&
    !borrowedBy &&
    !assignedTo &&
    !hasOpenLoanRequest &&
    !returnRequested
  );
}