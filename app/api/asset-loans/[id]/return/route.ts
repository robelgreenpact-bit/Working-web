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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { return_condition, note } = await request.json();
  const { error } = await supabase.rpc("request_asset_loan_return", {
    p_loan_id: id,
    p_return_condition: return_condition,
    p_note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ success: true });
}