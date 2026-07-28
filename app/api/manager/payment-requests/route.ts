import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getNextPRNumber(serviceClient: ReturnType<typeof getServiceClient>) {
  const { data } = await serviceClient
    .from("pr_number_sequence")
    .select("last_number")
    .eq("id", 1)
    .single();

  const next = (data?.last_number || 0) + 1;

  await serviceClient
    .from("pr_number_sequence")
    .update({ last_number: next })
    .eq("id", 1);

  return String(next);
}

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, payment_request_attachments(*), payment_request_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = getServiceClient();
  const withNames = await Promise.all(
    (data || []).map(async (r) => {
      const { data: creator } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", r.created_by)
        .single();
      return {
        ...r,
        creator_name: creator?.name,
        creator_email: creator?.email,
      };
    }),
  );

  return NextResponse.json({ requests: withNames });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const serviceClient = getServiceClient();

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

  if (!profile || profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const activityLine = body.activity_line?.trim() || body.title?.trim() || "Manager PR";
  const description = body.description?.trim() || null;
  const amount = Number(body.amount || 0);
  const projectClass = body.project_class?.trim() || null;
  const suggestedVendor = body.suggested_vendor?.trim() || null;
  const supplyPriority = body.supply_priority?.trim() || "regular";
  const requiredDate = body.required_date?.trim() || null;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount is required" }, { status: 400 });
  }

  const prNumber = await getNextPRNumber(serviceClient);

  const { data: newRequest, error } = await serviceClient
    .from("payment_requests")
    .insert({
      pr_number: prNumber,
      title: activityLine,
      project_class: projectClass,
      activity_line: activityLine,
      suggested_vendor: suggestedVendor,
      supply_priority: supplyPriority,
      required_date: requiredDate,
      amount,
      created_by: user.id,
      status: "pending_finance",
      decided_by: user.id,
      decision_comment: "Self-approved by manager",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await serviceClient.from("payment_request_items").insert({
    payment_request_id: newRequest.id,
    item_name: activityLine,
    description,
    unit: null,
    qty: 1,
    unit_price: amount,
    total_price: amount,
  });

  return NextResponse.json({ request: newRequest });
}
