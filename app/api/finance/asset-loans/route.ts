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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["finance", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = getServiceClient();
  const { data: requests, error } = await serviceClient
    .from("asset_loan_requests")
    .select("*")
    .eq("status", "approved")
    .is("finance_selected_at", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requestIds = (requests || []).map((request) => request.id);
  if (!requestIds.length) return NextResponse.json({ requests: [] });

  const [loanResult, assetResult, userResult] = await Promise.all([
    serviceClient
      .from("asset_loans")
      .select("id, request_id, asset_id, due_date, created_at, status")
      .in("request_id", requestIds)
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    serviceClient
      .from("assets")
      .select("id, asset_tag, item_name, category, serial_number, location, status, borrowed_by, assigned_to")
      .in("status", [...AVAILABLE_ASSET_STATUSES])
      .is("borrowed_by", null)
      .is("assigned_to", null),
    serviceClient
      .from("public_users")
      .select("id, name, email")
      .in("id", [...new Set((requests || []).map((request) => request.requester_id))]),
  ]);
  if (loanResult.error || assetResult.error || userResult.error) {
    return NextResponse.json(
      { error: loanResult.error?.message || assetResult.error?.message || userResult.error?.message },
      { status: 500 },
    );
  }

  const loans = loanResult.data || [];
  const assets = assetResult.data || [];
  const usersById = new Map((userResult.data || []).map((requester) => [requester.id, requester]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const activeLoanResult = await serviceClient
    .from("asset_loans")
    .select("asset_id, request_id")
    .in("status", [...ACTIVE_ASSET_LOAN_STATUSES]);
  if (activeLoanResult.error) {
    return NextResponse.json({ error: activeLoanResult.error.message }, { status: 500 });
  }

  const reservationsByAsset = new Map<string, string[]>();
  for (const loan of activeLoanResult.data || []) {
    const requestsForAsset = reservationsByAsset.get(loan.asset_id) || [];
    requestsForAsset.push(loan.request_id);
    reservationsByAsset.set(loan.asset_id, requestsForAsset);
  }

  return NextResponse.json({
    requests: (requests || []).map((request) => ({
      ...request,
      requester: usersById.get(request.requester_id) || null,
      items: loans
        .filter((loan) => loan.request_id === request.id)
        .map((loan) => {
          const asset = assetsById.get(loan.asset_id) || null;
          const reservedByOtherRequest = (asset && reservationsByAsset.get(asset.id) || [])
            .some((requestId) => requestId !== request.id);
          const choices = asset
            ? assets.filter((candidate) => {
                if (
                  candidate.category !== asset.category ||
                  candidate.item_name !== asset.item_name
                ) return false;
                if (candidate.category === "electronics" && !candidate.serial_number?.trim()) {
                  return false;
                }
                return !(reservationsByAsset.get(candidate.id) || [])
                  .some((requestId) => requestId !== request.id);
              })
            : [];
          return {
            ...loan,
            asset: reservedByOtherRequest ? null : asset,
            choices,
          };
        }),
    })),
  });
}
