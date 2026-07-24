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

  const { decision, comment, issueFromInventory, assetId, forTaxRegistry } =
    await request.json();

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
  const durableTypes = ["physical_good", "other_asset"];
  if (decision === "approved" && durableTypes.includes(reqData.type)) {
    if (issueFromInventory && assetId) {
      const { error: issueError } = await supabase
        .from("assets")
        .update({
          borrowed_by: reqData.requester_id,
          borrowed_at: new Date().toISOString(),
        })
        .eq("id", assetId)
        .is("borrowed_by", null);

      if (issueError) {
        return NextResponse.json({
          success: true,
          warning:
            "Request approved but issuing from inventory failed: " +
            issueError.message,
        });
      }
    } else {
      const { error: assetError } = await supabase.from("assets").insert({
        request_id: id,
        asset_tag: generateAssetTag(),
        assigned_to: reqData.requester_id,
        purchase_cost: reqData.estimated_cost,
        purchase_date: new Date().toISOString().split("T")[0],
        status: "in_use",
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
  return NextResponse.json({ success: true });
}
