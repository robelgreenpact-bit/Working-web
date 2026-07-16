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
    .from("requests")
    .select(
      "*, approvals(decision, comment, role_at_time, created_at, approver_id)",
    )
    .neq("status", "pending_manager")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = getServiceClient();

  const withDetails = await Promise.all(
    (data || []).map(async (req) => {
      const { data: requester } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", req.requester_id)
        .single();

      const approvalsWithNames = await Promise.all(
        (req.approvals || []).map(
          async (a: { approver_id: string; [key: string]: unknown }) => {
            const { data: approver } = await serviceClient
              .from("public_users")
              .select("name")
              .eq("id", a.approver_id)
              .single();
            return { ...a, approver };
          },
        ),
      );

      return { ...req, requester, approvals: approvalsWithNames };
    }),
  );

  return NextResponse.json({ requests: withDetails });
}
