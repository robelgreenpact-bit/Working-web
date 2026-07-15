import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServiceClient();

 const [usersRes, assetsRes, pendingRes] = await Promise.all([
    serviceClient
      .from("public_users")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    serviceClient.from("assets").select("id", { count: "exact", head: true }),
    serviceClient
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_manager", "pending_finance"]),
  ]);

  return NextResponse.json({
    users: usersRes.count || 0,
    assets: assetsRes.count || 0,
    pendingRequests: pendingRes.count || 0,
  });
}