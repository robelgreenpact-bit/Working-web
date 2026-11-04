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

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: loan, error: loanError } = await supabase
    .from("asset_loans")
    .select("id, return_condition")
    .eq("asset_id", id)
    .eq("status", "return_requested")
    .single();
  if (loanError || !loan) {
    return NextResponse.json({ error: "No pending loan return found for this asset" }, { status: 404 });
  }

  const { error } = await supabase.rpc("confirm_asset_loan_return", {
    p_loan_id: loan.id,
    p_return_condition: loan.return_condition || "good",
    p_note: null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
