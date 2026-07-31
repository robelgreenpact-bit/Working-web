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
