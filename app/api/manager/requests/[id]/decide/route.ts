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

  const newStatus = decision === "approved" ? "pending_finance" : "rejected";

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
    role_at_time: "manager",
    decision,
    comment: comment || null,
  });

  if (approvalError) {
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }

  // Get request details for notification
  const { data: requestData } = await supabase
    .from("requests")
    .select("requester_id, title")
    .eq("id", id)
    .single();

  // If manager approved, create a corresponding payment_request so Finance can act
  if (decision === "approved" && requestData) {
    try {
      const { data: reqFull } = await supabase
        .from("requests")
        .select("*, attachments(*)")
        .eq("id", id)
        .single();

      const serviceClient = getServiceClient();
      const prNumber = await getNextPRNumber();

      const { data: newRequest, error: insertErr } = await serviceClient
        .from("payment_requests")
        .insert({
          pr_number: prNumber,
          title: reqFull.title,
          project_class: null,
          activity_line: reqFull.title,
          suggested_vendor: null,
          supply_priority: "regular",
          required_date: null,
          amount: reqFull.estimated_cost || 0,
          created_by: reqFull.requester_id,
          status: "pending_finance",
        })
        .select()
        .single();

      if (!insertErr && newRequest) {
        // create one payment_request_item reflecting the request
        const qty = reqFull.quantity || 1;
        const unitPrice = reqFull.estimated_cost || 0;
        await serviceClient.from("payment_request_items").insert({
          payment_request_id: newRequest.id,
          item_name: reqFull.title,
          description: reqFull.description || null,
          unit: null,
          qty,
          unit_price: unitPrice,
          total_price: qty * unitPrice,
        });

        // copy attachments if any
        const { data: attachments } = await serviceClient
          .from("attachments")
          .select("*")
          .eq("request_id", id);

        if (attachments && attachments.length > 0) {
          const attachRows = attachments.map((a: any) => ({
            payment_request_id: newRequest.id,
            file_url: a.file_url,
            uploaded_by: reqFull.requester_id,
          }));

          await serviceClient.from("payment_request_attachments").insert(attachRows);
        }
      } else if (insertErr) {
        console.error("Failed to insert synced payment_request:", insertErr.message);
      }
    } catch (err) {
      // don't block approval flow on sync errors
      console.error("Failed to sync request to payment_requests:", err);
    }
  }

  if (requestData && decision === "approved") {
    // Create notification for the requester
    await supabase.from("notifications").insert({
      user_id: requestData.requester_id,
      type: "request_approved",
      title: "Request Approved",
      message: `Your request "${requestData.title}" has been approved by manager and is pending finance approval.`,
      link: "/worker",
      metadata: { request_id: id },
    });
  } else if (requestData && decision === "rejected") {
    // Create notification for the requester
    await supabase.from("notifications").insert({
      user_id: requestData.requester_id,
      type: "request_rejected",
      title: "Request Rejected",
      message: `Your request "${requestData.title}" has been rejected by manager.`,
      link: "/worker",
      metadata: { request_id: id },
    });
  }

  return NextResponse.json({ success: true });
}
