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

export async function GET() {
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

    if (!profile || !["admin", "finance"].includes(profile.role)) {
      return json({ error: "Forbidden." }, 403);
    }

    return json(
      {
        error:
          "The separate admin borrowing list has been removed. Use the shared Borrowed page to view devices, confirm returns and see returned history.",
        code: "ADMIN_BORROWING_LIST_REMOVED",
        page_url: "/assets/borrowed",
        api_url: "/api/asset-loans",
      },
      410,
    );
  } catch (error) {
    console.error("Retired admin borrowing endpoint failed:", error);

    return json(
      { error: "Unable to process this request." },
      500,
    );
  }
}