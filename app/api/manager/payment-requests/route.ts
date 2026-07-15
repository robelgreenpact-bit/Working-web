import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, payment_request_attachments(*), payment_request_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = getServiceClient();
  const withNames = await Promise.all(
    (data || []).map(async (r) => {
      const { data: creator } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", r.created_by)
        .single();
      return {
        ...r,
        creator_name: creator?.name,
        creator_email: creator?.email,
      };
    }),
  );

  return NextResponse.json({ requests: withNames });
}
