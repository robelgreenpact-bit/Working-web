import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type ApprovalRow = {
  decision: string;
  comment: string | null;
  role_at_time: string;
  created_at: string;
  approver_id: string | null;
};

type HistoryRow = {
  id: string;
  requester_id: string;
  type: string;
  title: string;
  description: string | null;
  requested_item_name: string | null;
  item_name: string | null;
  electronics_subcategory: string | null;
  asset_category: string | null;
  quantity: number | null;
  estimated_cost: number | null;
  justification: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  tax_registered: boolean | null;
  tax_reference: string | null;
  approvals: ApprovalRow[] | null;
};

type Person = {
  name: string | null;
  email: string | null;
};

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

export async function GET() {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("public_users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["manager", "admin"].includes(profile.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Only managers and admins can view manager approval history.",
        },
        { status: 403 },
      );
    }

    // Keep existing request and approval access policies in effect.
    const { data, error } = await supabase
      .from("requests")
      .select(`
        id,
        requester_id,
        type,
        title,
        description,
        requested_item_name,
        item_name,
        electronics_subcategory,
        asset_category,
        quantity,
        estimated_cost,
        justification,
        status,
        created_at,
        updated_at,
        tax_registered,
        tax_reference,
        approvals(
          decision,
          comment,
          role_at_time,
          created_at,
          approver_id
        )
      `)
      .neq("status", "pending_manager")
      .order("updated_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("id", { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: "Unable to load approval history." },
        { status: 500 },
      );
    }

    const history = (data || []) as unknown as HistoryRow[];

    const personIds = new Set<string>();

    for (const row of history) {
      personIds.add(row.requester_id);

      for (const approval of row.approvals || []) {
        if (approval.approver_id) {
          personIds.add(approval.approver_id);
        }
      }
    }

    const peopleById = new Map<string, Person>();
    const ids = Array.from(personIds);

    if (ids.length > 0) {
      const serviceClient = getServiceClient();

      // Only load people referenced by accessible history records.
      for (let index = 0; index < ids.length; index += 100) {
        const { data: people, error: peopleError } =
          await serviceClient
            .from("public_users")
            .select("id, name, email")
            .in("id", ids.slice(index, index + 100));

        if (peopleError) {
          return NextResponse.json(
            {
              error:
                "Unable to load requester and approver names.",
            },
            { status: 500 },
          );
        }

        for (const person of people || []) {
          peopleById.set(person.id, {
            name: person.name,
            email: person.email,
          });
        }
      }
    }

    const requests = history.map((row) => {
      const approvals = [...(row.approvals || [])]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .map((approval) => {
          const person = approval.approver_id
            ? peopleById.get(approval.approver_id)
            : undefined;

          return {
            ...approval,
            approver: person
              ? { name: person.name || "Unknown" }
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
        rejection_reason:
          rejection?.comment?.trim() || null,
        rejected_by_role:
          rejection?.role_at_time || null,
      };
    });

    return NextResponse.json(
      { requests },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to load approval history. Please try again.",
      },
      { status: 500 },
    );
  }
}