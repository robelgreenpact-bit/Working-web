import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function generateAssetTag() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `AST-${random}`;
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

  const { decision, comment } = await request.json();

  if (!decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const { data: reqData, error: fetchError } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !reqData) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const newStatus = decision === "approved" ? "approved" : "rejected";

  const { error: updateError } = await supabase
    .from("requests")
    .update({ status: newStatus })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: approvalError } = await supabase.from("approvals").insert({
    request_id: id,
    approver_id: user.id,
    role_at_time: "finance",
    decision,
    comment: comment || null,
  });

  if (approvalError) {
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }

  // If approved AND it's a durable/physical item, create an asset record
  const durableTypes = ["physical_good", "other_asset"];
  if (decision === "approved" && durableTypes.includes(reqData.type)) {
    const { error: assetError } = await supabase.from("assets").insert({
      request_id: id,
      asset_tag: generateAssetTag(),
      assigned_to: reqData.requester_id,
      purchase_cost: reqData.estimated_cost,
      purchase_date: new Date().toISOString().split("T")[0],
      status: "in_use",
    });

    if (assetError) {
      // Don't fail the whole approval if asset creation has an issue, but flag it
      return NextResponse.json({
        success: true,
        warning:
          "Request approved but asset creation failed: " + assetError.message,
      });
    }
  }

  return NextResponse.json({ success: true });
}
