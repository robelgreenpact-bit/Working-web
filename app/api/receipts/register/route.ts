import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, reference } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "Receipt id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("receipts")
    .update({
      tax_registered: true,
      tax_registered_by: user.id,
      tax_registered_at: new Date().toISOString(),
      tax_reference: reference || null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
