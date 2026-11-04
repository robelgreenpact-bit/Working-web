import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const {
    decision,
    comment,
    forTaxRegistry,
    assetIds,
    fulfillmentMode,
    purchaseQuantity,
    dueDate,
  } = await request.json();

  if (!decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  if (
    assetIds !== undefined &&
    (!Array.isArray(assetIds) || assetIds.some((assetId: unknown) => typeof assetId !== "string"))
  ) {
    return NextResponse.json({ error: "Invalid asset selection" }, { status: 400 });
  }

  const { error } = await supabase.rpc("decide_finance_request_fulfillment", {
    p_request_id: id,
    p_decision: decision,
    p_comment: comment || null,
    p_for_tax_registry: Boolean(forTaxRegistry),
    p_asset_ids: assetIds || [],
    p_fulfillment_mode: fulfillmentMode || "assign",
    p_purchase_quantity: Number(purchaseQuantity || 0),
    p_due_date: dueDate || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
