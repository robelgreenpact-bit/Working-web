import type { SupabaseClient } from "@supabase/supabase-js";

export const AVAILABLE_ASSET_STATUSES = ["new", "in_use"] as const;
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

export async function generateAssetTag(supabase: SupabaseClient, category: string) {
  const prefix = categoryPrefixes[category] || categoryPrefixes.other;
  const { data: existingAssets } = await supabase
    .from("assets")
    .select("asset_tag")
    .eq("category", category)
    .like("asset_tag", `${prefix}%`)
    .order("asset_tag", { ascending: false })
    .limit(1);

  const lastTag = existingAssets?.[0]?.asset_tag;
  const nextNumber = lastTag ? parseInt(lastTag.replace(prefix, ""), 10) + 1 : 1;

  await supabase
    .from("asset_tag_sequence")
    .upsert({ category, last_number: nextNumber }, { onConflict: "category" });

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export function isAssetAvailable(
  status: string,
  borrowedBy: string | null,
  hasOpenLoanRequest: boolean,
  assignedTo: string | null = null,
) {
  return (
    AVAILABLE_ASSET_STATUSES.includes(status as (typeof AVAILABLE_ASSET_STATUSES)[number]) &&
    !borrowedBy &&
    !assignedTo &&
    !hasOpenLoanRequest
  );
}