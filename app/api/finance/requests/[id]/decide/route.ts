import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAssetTag } from "@/lib/assets";

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

  const { decision, comment, forTaxRegistry } = await request.json();

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

  const updateData: { status: string; for_tax_registry?: boolean } = {
    status: newStatus,
  };

  if (decision === "approved" && forTaxRegistry) {
    updateData.for_tax_registry = true;
  }

  const { error: updateError } = await supabase
    .from("requests")
    .update(updateData)
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

  // If approved AND it's a durable/physical item, either issue from inventory or create a new asset
  const durableTypes = ["physical_good", "other_asset", "electronics"];
  if (decision === "approved" && durableTypes.includes(reqData.type)) {
    const category = reqData.asset_category ||
      (reqData.type === "electronics" ? "electronics" : "other");
    const itemName = reqData.item_name || reqData.title;
    const quantity = Math.max(1, Number(reqData.quantity) || 1);
    for (let index = 0; index < quantity; index++) {
      const assetTag = await generateAssetTag(supabase, category);
      const { error: assetError } = await supabase.from("assets").insert({
        request_id: id,
        asset_tag: assetTag,
        category,
        item_name: itemName,
        electronics_subcategory: reqData.electronics_subcategory || null,
        assigned_to: reqData.requester_id,
        purchase_cost: reqData.estimated_cost,
        purchase_date: new Date().toISOString().split("T")[0],
        status: "in_use",
        quantity: 1,
      });

      if (assetError) {
        return NextResponse.json({
          success: true,
          warning:
            "Request approved but asset creation failed: " + assetError.message,
        });
      }
    }
  }

  // Create notification for the requester when finally approved
  if (decision === "approved") {
    await supabase.from("notifications").insert({
      user_id: reqData.requester_id,
      type: "request_finally_approved",
      title: "Request Approved",
      message: `Your request "${reqData.title}" has been fully approved and processed.`,
      link: "/worker",
      metadata: { request_id: id },
    });
  } else if (decision === "rejected") {
    await supabase.from("notifications").insert({
      user_id: reqData.requester_id,
      type: "request_rejected",
      title: "Request Rejected",
      message: `Your request "${reqData.title}" has been rejected by finance.`,
      link: "/worker",
      metadata: { request_id: id },
    });
  }

  return NextResponse.json({ success: true });
}
