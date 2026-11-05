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

    if (
      !profile ||
      !["finance", "admin"].includes(profile.role)
    ) {
      return json(
        { error: "Only finance or admin can confirm returns." },
        403,
      );
    }

    // The updated page sends no body, or an empty JSON object.
    // Conditions are read from the loan, never overwritten here.
    const rawBody = await request.text();

    if (rawBody.trim()) {
      let body: unknown;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return json(
          { error: "Request body must be valid JSON." },
          400,
        );
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        return json({ error: "Invalid request body." }, 400);
      }

      if (Object.keys(body).length > 0) {
        return json(
          {
            error:
              "Confirm returns from the updated Borrowed page. The worker's recorded condition is used automatically; do not send a condition or note.",
          },
          400,
        );
      }
    }

    const { error } = await supabase.rpc(
      "confirm_equipment_loan_return",
      {
        p_loan_id: id,
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
              "The return confirmation database function is missing. Run the supplied confirmation SQL first.",
          },
          500,
        );
      }

      if (error.code === "42501") {
        return json(
          { error: "Only finance or admin can confirm returns." },
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

      console.error("Return confirmation failed:", error);

      return json(
        { error: "Unable to confirm this return." },
        500,
      );
    }

    return json({
      success: true,
      status: "returned",
      message:
        "Return confirmed. Inventory reflects the recorded condition.",
    });
  } catch (error) {
    console.error("Return confirmation endpoint failed:", error);

    return json(
      {
        error:
          "Could not confirm the result. Refresh the Borrowed page and check the device status before trying again.",
      },
      500,
    );
  }
}