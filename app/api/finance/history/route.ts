import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

const HISTORY_FIELDS = `
  id,
  requester_id,
  type,
  title,
  description,
  quantity,
  asset_category,
  requested_item_name,
  item_name,
  electronics_subcategory,
  estimated_cost,
  justification,
  status,
  created_at,
  updated_at,
  tax_registered,
  tax_reference,
  approvals (
    decision,
    comment,
    role_at_time,
    created_at,
    approver_id
  )
`;

export async function GET() {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized." }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("public_users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return json({ error: "Unable to verify your role." }, 500);
    }

    if (!profile || !["finance", "admin"].includes(profile.role)) {
      return json({ error: "Forbidden." }, 403);
    }

    // Keep request visibility controlled by the signed-in user's RLS.
    // Preserve the existing history limit of 50 completed requests.
    const { data: requests, error: requestsError } = await supabase
      .from("requests")
      .select(HISTORY_FIELDS)
      .in("status", ["approved", "rejected"])
      .order("updated_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("id", { ascending: true })
      .limit(50);

    if (requestsError) {
      console.error("Finance history query failed:", requestsError);

      return json(
        { error: "Unable to load finance history." },
        500,
      );
    }

    if (!requests?.length) {
      return json({ requests: [] });
    }

    const personIds = new Set<string>();

    for (const row of requests) {
      if (row.requester_id) {
        personIds.add(row.requester_id);
      }

      for (const approval of row.approvals || []) {
        if (approval.approver_id) {
          personIds.add(approval.approver_id);
        }
      }
    }

    // Fetch only people associated with requests already visible
    // to this authorized finance/admin user.
    const serviceClient = getServiceClient();

    const peopleById = new Map<
      string,
      {
        name: string | null;
        email: string | null;
      }
    >();

    const ids = [...personIds];

    for (let index = 0; index < ids.length; index += 100) {
      const batch = ids.slice(index, index + 100);

      const { data: people, error: peopleError } = await serviceClient
        .from("public_users")
        .select("id, name, email")
        .in("id", batch);

      if (peopleError) {
        console.error("Finance history names lookup failed:", peopleError);

        return json(
          { error: "Unable to load requester and approver details." },
          500,
        );
      }

      for (const person of people || []) {
        peopleById.set(person.id, {
          name: person.name,
          email: person.email,
        });
      }
    }

    const requestsWithDetails = requests.map((row) => {
      const approvals = [...(row.approvals || [])]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .map((approval) => {
          const approver = approval.approver_id
            ? peopleById.get(approval.approver_id)
            : null;

          return {
            ...approval,
            approver: approver
              ? { name: approver.name }
              : null,
          };
        });

      const rejection =
        row.status === "rejected"
          ? approvals.find(
              (approval) => approval.decision === "rejected",
            )
          : undefined;

      return {
        ...row,
        requester: peopleById.get(row.requester_id) || null,
        approvals,
        rejection_reason: rejection?.comment || null,
        rejected_by_role: rejection?.role_at_time || null,
      };
    });

    return json({ requests: requestsWithDetails });
  } catch (error) {
    console.error("Finance history endpoint failed:", error);

    return json(
      { error: "Unable to load finance history. Please try again." },
      500,
    );
  }
}