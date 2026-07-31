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

  const serviceClient = getServiceClient();

  const [approvalsRes, paymentsRes, assetsRes] = await Promise.all([
    serviceClient
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_finance"),
    serviceClient
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .eq("status", "pending_manager"),
    serviceClient.from("assets").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    pendingApprovals: approvalsRes.count || 0,
    pendingPayments: paymentsRes.count || 0,
    assets: assetsRes.count || 0,
  });
}
