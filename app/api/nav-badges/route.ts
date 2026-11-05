import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
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

    const role = profile?.role;

    if (
      !role ||
      !["worker", "manager", "finance", "admin", "accountant"].includes(
        role,
      )
    ) {
      return json({ error: "Forbidden." }, 403);
    }

    // Use the signed-in client so badge counts follow the same
    // access policies as the corresponding lists.
    if (role === "manager") {
      const [approvalsResult, paymentsResult] = await Promise.all([
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_manager"),

        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_manager"),
      ]);

      if (approvalsResult.error || paymentsResult.error) {
        console.error(
          "Manager badge query failed:",
          approvalsResult.error || paymentsResult.error,
        );

        return json(
          { error: "Unable to load navigation counts." },
          500,
        );
      }

      return json({
        approvals: approvalsResult.count ?? 0,
        payments: paymentsResult.count ?? 0,
      });
    }

    if (role === "finance") {
      const [financeResult, returnsResult] = await Promise.all([
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_finance"),

        supabase
          .from("equipment_loans")
          .select("id", { count: "exact", head: true })
          .not("return_requested_at", "is", null)
          .is("returned_at", null),
      ]);

      if (financeResult.error || returnsResult.error) {
        console.error(
          "Finance badge query failed:",
          financeResult.error || returnsResult.error,
        );

        return json(
          { error: "Unable to load navigation counts." },
          500,
        );
      }

      return json({
        finance: financeResult.count ?? 0,
        returns: returnsResult.count ?? 0,
      });
    }

    if (role === "admin") {
      const { count, error } = await supabase
        .from("equipment_loans")
        .select("id", { count: "exact", head: true })
        .not("return_requested_at", "is", null)
        .is("returned_at", null);

      if (error) {
        console.error("Admin return badge query failed:", error);

        return json(
          { error: "Unable to load navigation counts." },
          500,
        );
      }

      return json({
        returns: count ?? 0,
      });
    }

    return json({});
  } catch (error) {
    console.error("Navigation badges endpoint failed:", error);

    return json(
      { error: "Unable to load navigation counts." },
      500,
    );
  }
}