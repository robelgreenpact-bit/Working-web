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

  if (!profile || !["admin", "manager", "finance"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = getServiceClient();

  const { data: requests } = await serviceClient
    .from("requests")
    .select("*")
    .eq("status", "approved")
    .order("updated_at", { ascending: false });

  const { data: payments } = await serviceClient
    .from("payment_requests")
    .select("*")
    .eq("status", "paid")
    .order("updated_at", { ascending: false });
  const { data: receipts } = await serviceClient
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });

  const requestsWithNames = await Promise.all(
    (requests || []).map(async (r) => {
      const { data: requester } = await serviceClient
        .from("public_users")
        .select("name")
        .eq("id", r.requester_id)
        .single();
      return { ...r, requester_name: requester?.name, kind: "request" };
    }),
  );

  const paymentsWithNames = await Promise.all(
    (payments || []).map(async (p) => {
      const { data: creator } = await serviceClient
        .from("public_users")
        .select("name")
        .eq("id", p.created_by)
        .single();
      return { ...p, creator_name: creator?.name, kind: "payment" };
    }),
  );

  const receiptsFormatted = (receipts || []).map((r) => ({
    ...r,
    kind: "receipt",
  }));

  return NextResponse.json({
    requests: requestsWithNames,
    payments: paymentsWithNames,
    receipts: receiptsFormatted,
  });
}
