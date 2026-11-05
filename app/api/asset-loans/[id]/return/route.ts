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
    return json({ error: "Invalid loan ID." }, 400);
  }

  try {
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

    if (!profile || profile.role !== "worker") {
      return json(
        { error: "Only workers can request returns here." },
        403,
      );
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
      return json(
        { error: "Request body must be valid JSON." },
        400,
      );
    }

    const condition = body.return_condition;

    if (
      typeof condition !== "string" ||
      !["good", "damaged", "lost"].includes(condition)
    ) {
      return json(
        { error: "Select a condition: good, damaged or lost." },
        400,
      );
    }

    // Notes are not stored by the simplified return flow.
    // Do not silently discard text sent by an older page.
    if (
      body.note !== undefined &&
      body.note !== null &&
      (typeof body.note !== "string" || body.note.trim() !== "")
    ) {
      return json(
        {
          error:
            "Return notes are no longer supported. Use the updated Borrowed page and select the device condition.",
        },
        400,
      );
    }

    const { error } = await supabase.rpc(
      "request_equipment_loan_return",
      {
        p_loan_id: id,
        p_return_condition: condition,
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
              "The equipment return database function is missing. Run the supplied return SQL first.",
          },
          500,
        );
      }

      if (error.code === "42501") {
        return json(
          { error: "You can only return your own borrowed devices." },
          403,
        );
      }

      if (error.code === "P0002") {
        return json({ error: "Borrowed item not found." }, 404);
      }

      if (error.code === "22023") {
        return json({ error: error.message }, 400);
      }

      if (error.code === "P0001") {
        return json({ error: error.message }, 409);
      }

      if (
        ["40001", "40P01", "55P03"].includes(error.code)
      ) {
        return json(
          {
            error:
              "The device record changed while saving. Refresh the Borrowed page before trying again.",
          },
          409,
        );
      }

      console.error("Equipment return request failed:", error);

      return json(
        { error: "Unable to request this return." },
        500,
      );
    }

    return json({
      success: true,
      status: "return_requested",
      return_condition: condition,
      message:
        "Return requested. Finance or admin must confirm it before the device status changes.",
    });
  } catch (error) {
    console.error("Equipment return endpoint failed:", error);

    return json(
      {
        error:
          "Could not confirm the result. Refresh the Borrowed page and check the device status before trying again.",
      },
      500,
    );
  }
}