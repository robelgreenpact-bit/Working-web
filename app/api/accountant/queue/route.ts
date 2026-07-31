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

  const { data: requests } = await supabase
    .from("requests")
    .select("*")
    .eq("status", "approved")
    .eq("for_tax_registry", true)
    .order("updated_at", { ascending: false });

  const { data: payments } = await supabase
    .from("payment_requests")
    .select("*, payment_request_items(*)")
    .eq("status", "paid")
    .eq("for_tax_registry", true)
    .order("updated_at", { ascending: false });

  const requestsWithNames = await Promise.all(
    (requests || []).map(async (r) => {
      const { data: requester } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", r.requester_id)
        .single();
      return { ...r, requester, kind: "request" as const };
    }),
  );

  const paymentsWithNames = await Promise.all(
    (payments || []).map(async (p) => {
      const { data: creator } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", p.created_by)
        .single();
      return { ...p, creator, kind: "payment" as const };
    }),
  );

  const { data: receipts } = await supabase
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    requests: requestsWithNames,
    payments: paymentsWithNames,
    receipts: receipts || [],
  });
}
