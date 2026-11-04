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

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { decision, comment } = await request.json();
  const { error } = await supabase.rpc("decide_asset_loan_request", {
    p_request_id: id,
    p_decision: decision,
    p_comment: comment || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ success: true });
}