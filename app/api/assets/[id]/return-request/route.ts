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

  const { data: loan, error: loanError } = await supabase
    .from("asset_loans")
    .select("id")
    .eq("asset_id", id)
    .eq("borrower_id", user.id)
    .eq("status", "issued")
    .single();
  if (loanError || !loan) {
    return NextResponse.json({ error: "No active loan found for this asset" }, { status: 404 });
  }

  const { error } = await supabase.rpc("request_asset_loan_return", {
    p_loan_id: loan.id,
    p_return_condition: "good",
    p_note: null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
