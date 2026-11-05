import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DecisionResult = {
  request_id: string;
  requester_id: string;
  title: string;
  status: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return fail("Invalid request ID.");
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return fail("Unauthorized", 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("public_users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["manager", "admin"].includes(profile.role)
    ) {
      return fail(
        "Only a manager or admin can review these requests.",
        403,
      );
    }

    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return fail("Invalid request data.");
    }

    if (!["approved", "rejected"].includes(body.decision)) {
      return fail("Select Approve or Reject.");
    }

    if (
      body.comment !== undefined &&
      body.comment !== null &&
      typeof body.comment !== "string"
    ) {
      return fail("The comment must be text.");
    }

    const decision = body.decision as "approved" | "rejected";
    const comment =
      typeof body.comment === "string"
        ? body.comment.trim()
        : "";

    if (decision === "rejected" && !comment) {
      return fail("Enter a reason for rejecting this request.");
    }

    // The database updates the request and records the decision
    // in one transaction, with a lock against duplicate decisions.
    const { data, error } = await supabase.rpc(
      "manager_decide_request",
      {
        p_request_id: id,
        p_decision: decision,
        p_comment: comment || null,
      },
    );

    if (error) {
      if (error.code === "42501") {
        return fail(
          "You do not have permission to make this decision.",
          403,
        );
      }

      if (error.code === "P0002") {
        return fail("Request not found or access denied.", 404);
      }

      if (error.code === "22023") {
        return fail(error.message, 400);
      }

      if (["40001", "40P01"].includes(error.code)) {
        return fail(
          "This request changed or was already processed. Refresh the approval list.",
          409,
        );
      }

      if (error.code === "PGRST202") {
        return fail(
          "The manager decision function is not available. Run the manager SQL setup first.",
          500,
        );
      }

      return fail(
        "The decision could not be saved. Refresh the list before trying again.",
        500,
      );
    }

    const result = data as DecisionResult | null;

    // The decision has already been committed. Notification
    // failure must not turn it into a failed approval response.
    let notificationWarning: string | null = null;

    if (result?.requester_id) {
      try {
        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: result.requester_id,
            type:
              decision === "approved"
                ? "request_approved"
                : "request_rejected",
            title:
              decision === "approved"
                ? "Request Approved by Manager"
                : "Request Rejected",
            message:
              decision === "approved"
                ? `Your request "${result.title}" has been approved by the manager and sent to finance.`
                : `Your request "${result.title}" has been rejected by the manager. Reason: ${comment}`,
            link: "/worker",
            metadata: {
              request_id: id,
            },
          });

        if (notificationError) {
          notificationWarning =
            "The decision was saved, but the notification could not be delivered.";
        }
      } catch {
        notificationWarning =
          "The decision was saved, but the notification could not be delivered.";
      }
    } else {
      notificationWarning =
        "The decision was saved, but notification details were unavailable.";
    }

    return NextResponse.json({
      success: true,
      status:
        result?.status ||
        (decision === "approved"
          ? "pending_finance"
          : "rejected"),
      ...(notificationWarning
        ? { warning: notificationWarning }
        : {}),
    });
  } catch {
    return fail(
      "The decision could not be confirmed. Refresh the approval list before trying again.",
      500,
    );
  }
}