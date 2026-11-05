import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

type AssetDetails = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  category: string | null;
  electronics_subcategory: string | null;
  serial_number: string | null;
  location: string | null;
};

function timestamp(value: string | null): number | null {
  if (!value) return null;

  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export async function GET() {
  try {
    const supabase = await createClient();

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

    if (
      !profile ||
      !["worker", "manager", "finance", "admin", "accountant"].includes(profile.role)
    ) {
      return json({ error: "Forbidden." }, 403);
    }

    const canManage = ["finance", "admin"].includes(profile.role);

    // The equipment_loans SELECT policy must permit all four roles
    // to read the shared borrowed list.
    function getLoansPage(offset: number) {
      return supabase
        .from("equipment_loans")
        .select(
          `
            id,
            asset_id,
            request_id,
            borrower_id,
            borrowed_at,
            return_requested_at,
            returned_at,
            return_condition
          `,
        )
        .order("borrowed_at", {
          ascending: true,
          nullsFirst: false,
        })
        .order("id", { ascending: true })
        .range(offset, offset + 99);
    }

    const { data: firstPage, error: firstError } =
      await getLoansPage(0);

    if (firstError) {
      console.error("Equipment loans query failed:", firstError);

      return json(
        { error: "Unable to load borrowed items." },
        500,
      );
    }

    const loans = [...(firstPage || [])];
    let pageLength = firstPage?.length || 0;
    let offset = 100;

    while (pageLength === 100) {
      const { data: page, error: pageError } =
        await getLoansPage(offset);

      if (pageError) {
        console.error("Equipment loans query failed:", pageError);

        return json(
          { error: "Unable to load all borrowed items." },
          500,
        );
      }

      loans.push(...(page || []));
      pageLength = page?.length || 0;
      offset += 100;
    }

    const serviceClient = getServiceClient();

    const assetIds = [
      ...new Set(loans.map((loan) => loan.asset_id)),
    ];
    const borrowerIds = [
      ...new Set(loans.map((loan) => loan.borrower_id)),
    ];

    const assetsById = new Map<string, AssetDetails>();
    const namesById = new Map<string, string | null>();

    // Only enrich loans already readable by the signed-in user.
    for (let index = 0; index < assetIds.length; index += 100) {
      const batch = assetIds.slice(index, index + 100);

      const { data: assets, error: assetsError } = await serviceClient
        .from("assets")
        .select(
          `
            id,
            asset_tag,
            item_name,
            category,
            electronics_subcategory,
            serial_number,
            location
          `,
        )
        .in("id", batch);

      if (assetsError) {
        console.error("Borrowed asset lookup failed:", assetsError);

        return json(
          { error: "Unable to load device details." },
          500,
        );
      }

      for (const asset of assets || []) {
        assetsById.set(asset.id, asset);
      }
    }

    for (let index = 0; index < borrowerIds.length; index += 100) {
      const batch = borrowerIds.slice(index, index + 100);

      const { data: people, error: peopleError } = await serviceClient
        .from("public_users")
        .select("id, name")
        .in("id", batch);

      if (peopleError) {
        console.error("Borrower lookup failed:", peopleError);

        return json(
          { error: "Unable to load worker names." },
          500,
        );
      }

      for (const person of people || []) {
        namesById.set(person.id, person.name);
      }
    }

    const now = Date.now();
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    const results = loans.map((loan) => {
      const asset = assetsById.get(loan.asset_id);
      const isMine = loan.borrower_id === user.id;

      const status = loan.returned_at
        ? "returned"
        : loan.return_requested_at
          ? "return_requested"
          : "borrowed";

      const borrowedTime = timestamp(loan.borrowed_at);
      const endTime = loan.returned_at
        ? timestamp(loan.returned_at)
        : now;

      const daysBorrowed =
        borrowedTime !== null && endTime !== null
          ? Math.max(
              0,
              Math.floor(
                (endTime - borrowedTime) / millisecondsPerDay,
              ),
            )
          : null;

      return {
        id: loan.id,
        asset_id: loan.asset_id,
        request_id: loan.request_id,
        borrower_id: loan.borrower_id,
        worker_name:
          namesById.get(loan.borrower_id) || "Unknown worker",
        device_name: asset?.item_name || "Unknown device",
        asset_tag: asset?.asset_tag || null,
        category: asset?.category || null,
        electronics_subcategory:
          asset?.electronics_subcategory || null,
        location: asset?.location || null,

        // Never include serial numbers in worker/manager responses.
        ...(canManage
          ? { serial_number: asset?.serial_number || null }
          : {}),

        borrowed_at: loan.borrowed_at,
        days_borrowed: daysBorrowed,
        status,
        return_requested_at: loan.return_requested_at,
        returned_at: loan.returned_at,
        return_condition: loan.return_condition,
        is_mine: isMine,

        can_return:
          profile.role === "worker" &&
          isMine &&
          status === "borrowed",

        can_confirm_return:
          canManage && status === "return_requested",
      };
    });

    // Active borrowing first, longest-held first.
    // Unknown historical dates remain unknown and sort last.
    // Returned history is ordered by most recent return.
    results.sort((a, b) => {
      const aReturned = a.status === "returned";
      const bReturned = b.status === "returned";

      if (aReturned !== bReturned) {
        return aReturned ? 1 : -1;
      }

      if (aReturned && bReturned) {
        const difference =
          (timestamp(b.returned_at) || 0) -
          (timestamp(a.returned_at) || 0);

        return difference || a.id.localeCompare(b.id);
      }

      const aBorrowed =
        timestamp(a.borrowed_at) ?? Number.POSITIVE_INFINITY;
      const bBorrowed =
        timestamp(b.borrowed_at) ?? Number.POSITIVE_INFINITY;

      if (aBorrowed !== bBorrowed) {
        return aBorrowed < bBorrowed ? -1 : 1;
      }

      return a.id.localeCompare(b.id);
    });

    return json({
      loans: results,
      current_user_id: user.id,
      role: profile.role,
      can_manage: canManage,
      summary: {
        all_borrowed: results.filter(
          (loan) => loan.status !== "returned",
        ).length,
        my_items: results.filter(
          (loan) => loan.is_mine && loan.status !== "returned",
        ).length,
        return_requested: results.filter(
          (loan) => loan.status === "return_requested",
        ).length,
        returned: results.filter(
          (loan) => loan.status === "returned",
        ).length,
      },
    });
  } catch (error) {
    console.error("Borrowed list endpoint failed:", error);

    return json(
      { error: "Unable to load borrowed items. Please try again." },
      500,
    );
  }
}