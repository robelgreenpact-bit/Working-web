import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("requests")
    .select(
      "*, requester:public_users!requests_requester_id_fkey(name, email), approvals(decision, comment, role_at_time, created_at, approver:public_users!approvals_approver_id_fkey(name))",
    )
    .in("status", ["approved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data });
}
