import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
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

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "finance"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = [
    "category",
    "item_name",
    "assigned_to",
    "purchase_cost",
    "purchase_date",
    "status",
    "location",
    "electronics_subcategory",
    "serial_number",
    "quantity",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if ("category" in updates || "serial_number" in updates) {
    const { data: currentAsset } = await supabase
      .from("assets")
      .select("category, serial_number")
      .eq("id", id)
      .single();
    const nextCategory = String(updates.category ?? currentAsset?.category ?? "");
    const nextSerial = String(updates.serial_number ?? currentAsset?.serial_number ?? "");
    if (nextCategory === "electronics" && !nextSerial.trim()) {
      return NextResponse.json(
        { error: "A serial number is required for electronics assets" },
        { status: 400 },
      );
    }
  }

  if ("status" in updates || "assigned_to" in updates) {
    const { data: asset } = await supabase
      .from("assets")
      .select("borrowed_by")
      .eq("id", id)
      .single();
    if (asset?.borrowed_by) {
      return NextResponse.json(
        { error: "Return the borrowed asset before changing its condition or holder" },
        { status: 409 },
      );
    }
    const { data: openLoans } = await supabase
      .from("asset_loans")
      .select("id")
      .eq("asset_id", id)
      .in("status", ["requested", "approved", "issued", "return_requested"])
      .limit(1);
    if (openLoans?.length) {
      return NextResponse.json(
        { error: "Resolve the open borrow request before changing this asset" },
        { status: 409 },
      );
    }
  }

  const { error } = await supabase.from("assets").update(updates).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
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

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "finance"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("borrowed_by")
    .eq("id", id)
    .single();
  if (assetError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.borrowed_by) {
    return NextResponse.json(
      { error: "Borrowed assets cannot be deleted" },
      { status: 409 },
    );
  }

  const { data: openLoans } = await supabase
    .from("asset_loans")
    .select("id")
    .eq("asset_id", id)
    .in("status", ["requested", "approved", "issued", "return_requested"])
    .limit(1);
  if (openLoans?.length) {
    return NextResponse.json(
      { error: "Assets with open borrow requests cannot be deleted" },
      { status: 409 },
    );
  }

  const { data: loanHistory } = await supabase
    .from("asset_loans")
    .select("id")
    .eq("asset_id", id)
    .limit(1);
  if (loanHistory?.length) {
    return NextResponse.json(
      { error: "Assets with loan history cannot be deleted; retire the asset instead" },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("assets").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
