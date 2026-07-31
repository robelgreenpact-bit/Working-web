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

  const { data: existingRequest } = await supabase
    .from("leave_requests")
    .select("requester_id, days_count, start_date, end_date")
    .eq("id", id)
    .single();

  if (!existingRequest) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("leave_requests")
    .update({
      status: decision,
      manager_comment: comment || null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("notifications").insert({
    user_id: existingRequest.requester_id,
    type: decision === "approved" ? "leave_approved" : "leave_rejected",
    title: decision === "approved" ? "Leave Approved" : "Leave Rejected",
    message:
      decision === "approved"
        ? `Your leave request from ${existingRequest.start_date} to ${existingRequest.end_date} (${existingRequest.days_count} day${existingRequest.days_count === 1 ? "" : "s"}) was approved.`
        : `Your leave request from ${existingRequest.start_date} to ${existingRequest.end_date} (${existingRequest.days_count} day${existingRequest.days_count === 1 ? "" : "s"}) was rejected.`,
    link: "/leave",
    metadata: { leave_request_id: id },
  });

  return NextResponse.json({ success: true });
}
