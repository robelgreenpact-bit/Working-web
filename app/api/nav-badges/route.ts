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
    const [approvalsRes, paymentsRes] = await Promise.all([
      serviceClient
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_manager"),
      serviceClient
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_manager"),
    ]);

    return NextResponse.json({
      approvals: approvalsRes.count || 0,
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

  return NextResponse.json({});
}
