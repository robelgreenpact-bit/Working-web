import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ACTIVE_ASSET_LOAN_STATUSES, isAssetAvailable } from "@/lib/assets";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServiceClient();
  const { data: assets, error } = await serviceClient
    .from("assets")
    .select("id, asset_tag, category, item_name, serial_number, status, location, borrowed_by, assigned_to, return_requested")
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: activeLoans, error: loansError } = await serviceClient
    .from("asset_loans")
    .select("asset_id, borrower_id, status, due_date")
    .in("status", [...ACTIVE_ASSET_LOAN_STATUSES]);
  if (loansError) {
    return NextResponse.json({ error: loansError.message }, { status: 500 });
  }

  const loansByAsset = new Map((activeLoans || []).map((loan) => [loan.asset_id, loan]));
  const userIds = [...new Set([
    ...(assets || []).map((asset) => asset.borrowed_by).filter(Boolean),
    ...(assets || []).map((asset) => asset.assigned_to).filter(Boolean),
    ...(activeLoans || []).map((loan) => loan.borrower_id),
  ])];
  const { data: users } = userIds.length
    ? await serviceClient.from("public_users").select("id, name").in("id", userIds)
    : { data: [] };
  const userNames = new Map((users || []).map((profile) => [profile.id, profile.name]));

  const inventoryMap = new Map<string, {
    category: string;
    item_name: string | null;
    total_count: number;
    available_count: number;
    borrowed_count: number;
    under_repair_count: number;
  }>();

  for (const asset of assets || []) {
    const key = `${asset.category || "other"}-${asset.item_name || "unnamed"}`;

    if (!inventoryMap.has(key)) {
      inventoryMap.set(key, {
        category: asset.category || "other",
        item_name: asset.item_name,
        total_count: 0,
        available_count: 0,
        borrowed_count: 0,
        under_repair_count: 0,
      });
    }

    const item = inventoryMap.get(key)!;
    const loan = loansByAsset.get(asset.id);
    item.total_count++;
    if (asset.borrowed_by) item.borrowed_count++;
    if (asset.status === "under_repair") item.under_repair_count++;
    if (isAssetAvailable(asset.status, asset.borrowed_by, Boolean(loan), asset.assigned_to)) {
      item.available_count++;
    }
  }

  const inventory = Array.from(inventoryMap.values());
  const inventoryAssets = (assets || []).map((asset) => {
    const loan = loansByAsset.get(asset.id);
    const holderId = asset.borrowed_by || loan?.borrower_id || asset.assigned_to || null;
    const overdue = loan?.status === "issued" && loan.due_date && loan.due_date < new Date().toISOString().slice(0, 10);
    const status = asset.borrowed_by
      ? asset.return_requested
        ? "return_requested"
        : overdue
          ? "overdue"
          : "borrowed"
      : asset.status === "under_repair" || asset.status === "retired"
        ? asset.status
        : asset.assigned_to
          ? "assigned"
        : loan?.status === "requested" || loan?.status === "approved"
          ? "reserved"
          : "available";

    return {
      id: asset.id,
      asset_tag: asset.asset_tag,
      category: asset.category,
      item_name: asset.item_name,
      serial_number: asset.serial_number,
      location: asset.location,
      status,
      due_date: loan?.due_date || null,
      current_holder: holderId ? userNames.get(holderId) || "Unknown" : null,
    };
  });

  return NextResponse.json({ inventory, assets: inventoryAssets });
}
