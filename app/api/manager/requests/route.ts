import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type AttachmentRow = {
  id: string;
  file_url: string;
};

type PendingRequest = {
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
  attachments: AttachmentRow[] | null;
};

type Requester = {
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
            "Only managers and admins can view pending manager approvals.",
        },
        { status: 403 },
      );
    }

    const requests: PendingRequest[] = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      // Use the signed-in client so existing request access
      // policies remain in effect.
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
          attachments(
            id,
            file_url
          )
        `)
        .eq("status", "pending_manager")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return NextResponse.json(
          {
            error:
              "Unable to load requests awaiting manager approval.",
          },
          { status: 500 },
        );
      }

      const page = (data || []) as unknown as PendingRequest[];
      requests.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;
    }

    const requesterIds = Array.from(
      new Set(requests.map((row) => row.requester_id)),
    );

    const requesters = new Map<string, Requester>();

    if (requesterIds.length > 0) {
      const serviceClient = getServiceClient();

      // Retrieve only the people referenced by accessible requests.
      for (let index = 0; index < requesterIds.length; index += 100) {
        const { data: people, error } = await serviceClient
          .from("public_users")
          .select("id, name, email")
          .in("id", requesterIds.slice(index, index + 100));

        if (error) {
          return NextResponse.json(
            { error: "Unable to load requester details." },
            { status: 500 },
          );
        }

        for (const person of people || []) {
          requesters.set(person.id, {
            name: person.name,
            email: person.email,
          });
        }
      }
    }

    const requestsWithDetails = [];

    // Process requests in small batches to avoid starting
    // attachment-signing operations for every request at once.
    for (let index = 0; index < requests.length; index += 10) {
      const batch = requests.slice(index, index + 10);

      const enrichedBatch = await Promise.all(
        batch.map(async (row) => {
          const attachments = [];

          for (const attachment of row.attachments || []) {
            let signedUrl: string | null = null;

            try {
              const { data: signedData, error: signingError } =
                await supabase.storage
                  .from("attachments")
                  .createSignedUrl(
                    attachment.file_url,
                    60 * 10,
                  );

              if (!signingError) {
                signedUrl = signedData?.signedUrl || null;
              }
            } catch {
              // Keep the request visible when an attachment
              // is unavailable.
            }

            attachments.push({
              id: attachment.id,
              file_url: attachment.file_url,
              signed_url: signedUrl,
            });
          }

          return {
            ...row,
            requester: requesters.get(row.requester_id) || null,
            attachments,
          };
        }),
      );

      requestsWithDetails.push(...enrichedBatch);
    }

    return NextResponse.json(
      { requests: requestsWithDetails },
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
          "Unable to load pending approvals. Please try again.",
      },
      { status: 500 },
    );
  }
}