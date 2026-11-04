import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ACTIVE_ASSET_LOAN_STATUSES, AVAILABLE_ASSET_STATUSES } from "@/lib/assets";

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
  const { data: activeLoans, error: loansError } = await serviceClient
    .from("asset_loans")
    .select("asset_id")
    .in("status", [...ACTIVE_ASSET_LOAN_STATUSES]);
  if (loansError) {
    return NextResponse.json({ error: loansError.message }, { status: 500 });
  }

  const reservedAssetIds = new Set((activeLoans || []).map((loan) => loan.asset_id));
  const { data, error } = await serviceClient
    .from("assets")
    .select("id, asset_tag, item_name, category, serial_number, status, location, assigned_to")
    .in("status", [...AVAILABLE_ASSET_STATUSES])
    .is("borrowed_by", null)
    .is("assigned_to", null)
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    assets: (data || []).filter((asset) => !reservedAssetIds.has(asset.id)),
  });
}
