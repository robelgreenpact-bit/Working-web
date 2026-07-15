import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getNextPRNumber() {
  const serviceClient = getServiceClient();

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, payment_request_attachments(*), payment_request_items(*)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const project_class = formData.get("project_class") as string;
  const activity_line = formData.get("activity_line") as string;
  const suggested_vendor = formData.get("suggested_vendor") as string;
  const supply_priority = formData.get("supply_priority") as string;
  const itemsJson = formData.get("items") as string;
  const files = formData.getAll("files") as File[];

  if (!activity_line || !itemsJson) {
    return NextResponse.json(
      { error: "Activity line and items are required" },
      { status: 400 },
    );
  }

  const items = JSON.parse(itemsJson) as {
    item_name: string;
    description: string;
    unit: string;
    qty: number;
    unit_price: number;
  }[];

  if (items.length === 0) {
    return NextResponse.json(
      { error: "At least one item is required" },
      { status: 400 },
    );
  }

  const totalAmount = items.reduce(
    (sum, it) => sum + it.qty * it.unit_price,
    0,
  );

  const prNumber = await getNextPRNumber();

  const { data: newRequest, error } = await supabase
    .from("payment_requests")
    .insert({
      pr_number: prNumber,
      title: activity_line,
      project_class: project_class || null,
      activity_line,
      suggested_vendor: suggested_vendor || null,
      supply_priority: supply_priority || "regular",
      amount: totalAmount,
      created_by: user.id,
      status: "pending_manager",
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

  await supabase.from("payment_request_items").insert(itemRows);

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const filePath = `payment-requests/${newRequest.id}/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, { contentType: file.type });

    if (uploadError) continue;

    await supabase.from("payment_request_attachments").insert({
      payment_request_id: newRequest.id,
      file_url: filePath,
      uploaded_by: user.id,
    });
  }

  return NextResponse.json({ request: newRequest });
}
