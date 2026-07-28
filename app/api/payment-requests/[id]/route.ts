import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  // Handle mark as paid action
  if (action === "mark_paid") {
    const { data: profile } = await supabase
      .from("public_users")
      .select("role")
      .eq("id", user.id)
      .single();

    const { data: existing } = await supabase
      .from("payment_requests")
      .select("status, created_by")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Only finance role can mark as paid
    const isFinance = profile?.role === "finance";

    if (!isFinance) {
      return NextResponse.json({ error: "Only finance can mark as paid" }, { status: 403 });
    }

    if (existing.status !== "pending_finance" && existing.status !== "approved") {
      return NextResponse.json(
        { error: "Only manager-approved requests can be marked as paid" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("payment_requests")
      .update({ status: "paid" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service client for delete operations
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Check if user owns this PR
  const { data: pr } = await serviceClient
    .from("payment_requests")
    .select("created_by, status")
    .eq("id", id)
    .single();

  if (!pr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (pr.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete items first
  await serviceClient
    .from("payment_request_items")
    .delete()
    .eq("payment_request_id", id);

  // Delete attachments
  const { data: attachments } = await serviceClient
    .from("payment_request_attachments")
    .select("file_url")
    .eq("payment_request_id", id);

  for (const attachment of attachments || []) {
    await serviceClient.storage.from("attachments").remove([attachment.file_url]);
  }

  await serviceClient
    .from("payment_request_attachments")
    .delete()
    .eq("payment_request_id", id);

  // Delete the PR
  const { error } = await serviceClient
    .from("payment_requests")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service client for update operations
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const formData = await request.formData();
  const project_class = formData.get("project_class") as string;
  const activity_line = formData.get("activity_line") as string;
  const suggested_vendor = formData.get("suggested_vendor") as string;
  const supply_priority = formData.get("supply_priority") as string;
  const required_date = formData.get("required_date") as string;
  const itemsJson = formData.get("items") as string;
  const files = formData.getAll("files") as File[];

  // Check if user owns this PR
  const { data: pr } = await serviceClient
    .from("payment_requests")
    .select("created_by, status")
    .eq("id", id)
    .single();

  if (!pr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (pr.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // Update the PR
  const { error: updateError } = await serviceClient
    .from("payment_requests")
    .update({
      project_class: project_class || null,
      activity_line,
      suggested_vendor: suggested_vendor || null,
      supply_priority: supply_priority || "regular",
      required_date: required_date || null,
      amount: totalAmount,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Delete existing items
  await serviceClient
    .from("payment_request_items")
    .delete()
    .eq("payment_request_id", id);

  // Insert new items
  const itemRows = items.map((it) => ({
    payment_request_id: id,
    item_name: it.item_name,
    description: it.description || null,
    unit: it.unit || null,
    qty: it.qty,
    unit_price: it.unit_price,
    total_price: it.qty * it.unit_price,
  }));

  await serviceClient.from("payment_request_items").insert(itemRows);

  // Handle new file attachments
  for (const file of files) {
    if (!file || file.size === 0) continue;

    const filePath = `payment-requests/${id}/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await serviceClient.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, { contentType: file.type });

    if (uploadError) continue;

    await serviceClient.from("payment_request_attachments").insert({
      payment_request_id: id,
      file_url: filePath,
      uploaded_by: user.id,
    });
  }

  return NextResponse.json({ success: true });
}
