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

  if (!profile || !["finance", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { decision, comment, forTaxRegistry } = await request.json();

  if (!decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const nextStatus = decision === "approved"
    ? forTaxRegistry
      ? "paid"
      : "approved"
    : "rejected";

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: nextStatus,
      decided_by: user.id,
      decision_comment: comment || null,
      for_tax_registry: decision === "approved" ? Boolean(forTaxRegistry) : false,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
