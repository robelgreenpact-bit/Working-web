import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST() {
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

    if (profile?.role !== "admin") {
      return json({ error: "Forbidden." }, 403);
    }

    return json(
      {
        error:
          "The separate handover step has been removed. Finance assigns devices during approval, and they immediately appear on the Borrowed page.",
        code: "HANDOVER_REMOVED",
      },
      410,
    );
  } catch (error) {
    console.error("Retired handover endpoint failed:", error);

    return json(
      { error: "Unable to process this request." },
      500,
    );
  }
}