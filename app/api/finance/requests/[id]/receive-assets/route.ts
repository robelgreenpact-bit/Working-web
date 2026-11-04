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
  if (!profile || !["finance", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (
    !Array.isArray(body.serial_numbers) ||
    body.serial_numbers.some((serial: unknown) => typeof serial !== "string")
  ) {
    return NextResponse.json({ error: "Enter one serial number per received unit" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("register_request_asset_arrivals", {
    p_request_id: id,
    p_serial_numbers: body.serial_numbers,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ assets: data || [] });
}
