import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = getServiceClient();
  const { data: requests, error } = await serviceClient
    .from("asset_loan_requests")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requestIds = (requests || []).map((request) => request.id);
  if (!requestIds.length) {
    return NextResponse.json({ handovers: [], returns: [] });
  }

  const { data: loans, error: loansError } = await serviceClient
    .from("asset_loans")
    .select("*")
    .in("request_id", requestIds);
  if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 });

  const assetIds = [...new Set((loans || []).map((loan) => loan.asset_id))];
  const requesterIds = [...new Set((requests || []).map((request) => request.requester_id))];
  const [{ data: assets }, { data: users }] = await Promise.all([
    serviceClient
      .from("assets")
      .select("id, asset_tag, item_name, category, serial_number, location")
      .in("id", assetIds),
    serviceClient
      .from("public_users")
      .select("id, name, email")
      .in("id", requesterIds),
  ]);
  const assetById = new Map((assets || []).map((asset) => [asset.id, asset]));
  const userById = new Map((users || []).map((requester) => [requester.id, requester]));
  const rows = (requests || []).map((request) => ({
    ...request,
    requester: userById.get(request.requester_id) || null,
    items: (loans || [])
      .filter((loan) => loan.request_id === request.id)
      .map((loan) => ({ ...loan, asset: assetById.get(loan.asset_id) || null })),
  }));

  return NextResponse.json({
    handovers: rows.filter(
      (request) => request.status === "approved" && request.finance_selected_at,
    ),
    returns: rows.flatMap((request) =>
      request.items
        .filter((loan: { status: string }) => loan.status === "return_requested")
        .map((loan: { status: string }) => ({ ...request, item: loan })),
    ),
    history: rows.flatMap((request) =>
      request.items
        .filter((loan: { status: string }) => ["issued", "return_requested", "returned"].includes(loan.status))
        .map((loan: { status: string }) => ({ ...request, item: loan })),
    ),
  });
}