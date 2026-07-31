import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [reqRes, payRes] = await Promise.all([
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("tax_registered", false),
    supabase
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .eq("tax_registered", false),
  ]);

  return NextResponse.json({
    pendingRegistration: (reqRes.count || 0) + (payRes.count || 0),
  });
}
