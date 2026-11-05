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

const REQUEST_FIELDS = `
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
  attachments (
    id,
    file_url
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

    // Keep request access under the signed-in user's RLS policies.
    function getRequestsPage(offset: number) {
      return supabase
        .from("requests")
        .select(REQUEST_FIELDS)
        .eq("status", "pending_finance")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 99);
    }

    const { data: firstPage, error: firstPageError } =
      await getRequestsPage(0);

    if (firstPageError) {
      console.error("Finance requests query failed:", firstPageError);

      return json(
        { error: "Unable to load pending finance requests." },
        500,
      );
    }

    const requests = [...(firstPage || [])];

    // Fetch additional pages so requests are not silently omitted.
    let pageLength = firstPage?.length || 0;
    let offset = 100;

    while (pageLength === 100) {
      const { data: page, error: pageError } =
        await getRequestsPage(offset);

      if (pageError) {
        console.error("Finance requests query failed:", pageError);

        return json(
          { error: "Unable to load all pending finance requests." },
          500,
        );
      }

      requests.push(...(page || []));
      pageLength = page?.length || 0;
      offset += 100;
    }

    if (requests.length === 0) {
      return json({ requests: [] });
    }

    // Use privileged access only for names associated with requests
    // already visible to this authorized finance/admin user.
    const serviceClient = getServiceClient();

    const requesterIds = [
      ...new Set(requests.map((row) => row.requester_id)),
    ];

    const requestersById = new Map<
      string,
      { name: string | null; email: string | null }
    >();

    for (let index = 0; index < requesterIds.length; index += 100) {
      const batch = requesterIds.slice(index, index + 100);

      const { data: people, error: peopleError } = await serviceClient
        .from("public_users")
        .select("id, name, email")
        .in("id", batch);

      if (peopleError) {
        console.error("Requester lookup failed:", peopleError);

        return json(
          { error: "Unable to load requester details." },
          500,
        );
      }

      for (const person of people || []) {
        requestersById.set(person.id, {
          name: person.name,
          email: person.email,
        });
      }
    }

    async function enrichRequest(row: (typeof requests)[number]) {
      const attachmentsWithUrls = [];

      for (const attachment of row.attachments || []) {
        let signedUrl: string | null = null;

        if (attachment.file_url) {
          try {
            const { data: signedData, error: signingError } =
              await supabase.storage
                .from("attachments")
                .createSignedUrl(attachment.file_url, 60 * 10);

            if (!signingError) {
              signedUrl = signedData?.signedUrl || null;
            }
          } catch {
            // Keep the request visible if an attachment preview fails.
            signedUrl = null;
          }
        }

        attachmentsWithUrls.push({
          ...attachment,
          signed_url: signedUrl,
        });
      }

      return {
        ...row,
        requester: requestersById.get(row.requester_id) || null,
        attachments: attachmentsWithUrls,
      };
    }

    const requestsWithDetails: Awaited<
      ReturnType<typeof enrichRequest>
    >[] = [];

    // Limit concurrent attachment signing work.
    for (let index = 0; index < requests.length; index += 10) {
      const batch = requests.slice(index, index + 10);

      const enrichedBatch = await Promise.all(
        batch.map(enrichRequest),
      );

      requestsWithDetails.push(...enrichedBatch);
    }

    return json({ requests: requestsWithDetails });
  } catch (error) {
    console.error("Finance requests endpoint failed:", error);

    return json(
      { error: "Unable to load finance requests. Please try again." },
      500,
    );
  }
}