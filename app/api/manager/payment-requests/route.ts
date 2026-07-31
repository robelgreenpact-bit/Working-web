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

  const formData = await request.formData();
  const projectClass = (formData.get("project_class") as string | null)?.trim() || null;
  const activityLine = (formData.get("activity_line") as string | null)?.trim() || "Manager PR";
  const suggestedVendor = (formData.get("suggested_vendor") as string | null)?.trim() || null;
  const supplyPriority = (formData.get("supply_priority") as string | null)?.trim() || "regular";
  const requiredDate = (formData.get("required_date") as string | null)?.trim() || null;
  const itemsJson = formData.get("items") as string | null;
  const files = formData.getAll("files") as File[];

  if (!activityLine || !itemsJson) {
    return NextResponse.json({ error: "Activity line and items are required" }, { status: 400 });
  }

  const items = JSON.parse(itemsJson) as {
    item_name: string;
    description: string;
    unit: string;
    qty: number;
    unit_price: number;
  }[];

  if (items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const totalAmount = items.reduce(
    (sum, it) => sum + it.qty * it.unit_price,
    0,
  );

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
      amount: totalAmount,
      created_by: user.id,
      status: "pending_manager",
      decided_by: user.id,
      decision_comment: "Submitted by manager",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itemRows = items.map((it) => ({
    payment_request_id: newRequest.id,
    item_name: it.item_name,
    description: it.description || null,
    unit: it.unit || null,
    qty: it.qty,
    unit_price: it.unit_price,
    total_price: it.qty * it.unit_price,
  }));

  await serviceClient.from("payment_request_items").insert(itemRows);

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const filePath = `payment-requests/${newRequest.id}/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await serviceClient.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, { contentType: file.type });

    if (uploadError) continue;

    await serviceClient.from("payment_request_attachments").insert({
      payment_request_id: newRequest.id,
      file_url: filePath,
      uploaded_by: user.id,
    });
  }

  return NextResponse.json({ request: newRequest });
}
