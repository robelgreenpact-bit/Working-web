import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return json({ error: "Invalid request ID." }, 400);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized." }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return json({ error: "Unable to verify your role." }, 500);
  }

  if (!profile || !["finance", "admin"].includes(profile.role)) {
    return json({ error: "Forbidden." }, 403);
  }

  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return json({ error: "Invalid request body." }, 400);
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const { decision, comment, forTaxRegistry, assetIds } = body;

  if (decision !== "approved" && decision !== "rejected") {
    return json(
      { error: "Decision must be approved or rejected." },
      400,
    );
  }

  if (
    comment !== undefined &&
    comment !== null &&
    typeof comment !== "string"
  ) {
    return json({ error: "Comment must be text." }, 400);
  }

  const trimmedComment =
    typeof comment === "string" ? comment.trim() : "";

  if (decision === "rejected" && !trimmedComment) {
    return json(
      { error: "Enter a rejection reason for the worker." },
      400,
    );
  }

  if (
    forTaxRegistry !== undefined &&
    typeof forTaxRegistry !== "boolean"
  ) {
    return json(
      { error: "Tax registry selection must be true or false." },
      400,
    );
  }

  if (
    assetIds !== undefined &&
    (!Array.isArray(assetIds) ||
      assetIds.some(
        (assetId: unknown) =>
          typeof assetId !== "string" ||
          !UUID_PATTERN.test(assetId),
      ))
  ) {
    return json({ error: "Invalid device selection." }, 400);
  }

  const selectedIds =
    assetIds === undefined ? [] : (assetIds as string[]);

  if (new Set(selectedIds).size !== selectedIds.length) {
    return json(
      { error: "Each selected device must be different." },
      400,
    );
  }

  // These controls belong to the retired approval flow.
  // Reject old clients rather than silently changing their intent.
  const obsoleteFields = [
    "fulfillmentMode",
    "purchaseQuantity",
    "dueDate",
  ];

  if (
    obsoleteFields.some((field) =>
      Object.prototype.hasOwnProperty.call(body, field),
    )
  ) {
    return json(
      {
        error:
          "This page is using the old approval flow. Refresh the updated finance approvals page and try again.",
      },
      400,
    );
  }

  try {
    // The database function checks:
    // - caller role and pending_finance status
    // - requested quantity, subtype and item name
    // - selected devices and their current availability
    //
    // It locks the records and saves approval, device assignment
    // and equipment loans together in one transaction.
    const { error } = await supabase.rpc(
      "finance_decide_equipment_request",
      {
        p_request_id: id,
        p_decision: decision,
        p_asset_ids: decision === "approved" ? selectedIds : [],
        p_comment: trimmedComment || null,
        p_tax:
          decision === "approved" && forTaxRegistry === true,
        p_legacy_subcategory: null,
      },
    );

    if (error) {
      if (
        error.code === "PGRST202" ||
        error.code === "42883"
      ) {
        return json(
          {
            error:
              "The finance approval database function is missing or its signature does not match. Install the equipment borrowing SQL before approving requests.",
          },
          500,
        );
      }

      if (error.code === "42501") {
        return json(
          { error: "You do not have permission to decide this request." },
          403,
        );
      }

      if (error.code === "P0002") {
        return json({ error: "Request not found." }, 404);
      }

      if (
        error.code === "22023" ||
        error.code === "22P02"
      ) {
        return json({ error: error.message }, 400);
      }

      if (
        error.code === "40001" ||
        error.code === "40P01" ||
        error.code === "55P03"
      ) {
        return json(
          {
            error:
              "The request or inventory changed while saving. Refresh the list, check the request status and select available devices again.",
          },
          409,
        );
      }

      if (
        error.code === "P0001" ||
        error.code === "23505" ||
        error.code === "23514"
      ) {
        return json({ error: error.message }, 409);
      }

      console.error("Finance approval failed:", error);

      return json(
        { error: "Unable to save the finance decision." },
        500,
      );
    }

    return json({
      success: true,
      status: decision,
      message:
        decision === "approved"
          ? "Request approved successfully."
          : "Request rejected. The reason is saved in the approval history.",
    });
  } catch (error) {
    console.error("Finance approval response failed:", error);

    return json(
      {
        error:
          "Could not confirm the result. Refresh and check the request status before trying again.",
      },
      500,
    );
  }
}