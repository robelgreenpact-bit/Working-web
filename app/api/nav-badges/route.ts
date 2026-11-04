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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  const serviceClient = getServiceClient();

  if (role === "manager") {
    const [approvalsRes, paymentsRes, assetLoansRes] = await Promise.all([
      serviceClient
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_manager"),
      serviceClient
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_manager"),
      serviceClient
        .from("asset_loan_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "requested"),
    ]);

    return NextResponse.json({
      approvals: (approvalsRes.count || 0) + (assetLoansRes.count || 0),
      payments: paymentsRes.count || 0,
    });
  }

  if (role === "finance") {
    const financeRes = await serviceClient
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_finance");

    return NextResponse.json({ finance: financeRes.count || 0 });
  }

  if (role === "admin") {
    const [handoversRes, returnsRes] = await Promise.all([
      serviceClient
        .from("asset_loan_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      serviceClient
        .from("asset_loans")
        .select("id", { count: "exact", head: true })
        .eq("status", "return_requested"),
    ]);
    return NextResponse.json({
      assetLoans: (handoversRes.count || 0) + (returnsRes.count || 0),
    });
  }

  return NextResponse.json({});
}
