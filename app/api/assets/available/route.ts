import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const AVAILABLE_STATUSES = ["new", "in_use"];

const LEGACY_ACTIVE_STATUSES = [
  "requested",
  "approved",
  "issued",
  "return_requested",
];

const VALID_CATEGORIES = [
  "electronics",
  "furniture",
  "vehicle",
  "office_supplies",
  "other",
];

const VALID_ELECTRONICS_TYPES = ["tablet", "pc", "other"];

type AvailableAsset = {
  id: string;
  asset_tag: string;
  item_name: string | null;
  category: string;
  electronics_subcategory: string | null;
  serial_number?: string | null;
  status: string;
  location: string | null;
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

export async function GET(request: Request) {
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
      !["admin", "finance", "manager"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const canManage = ["admin", "finance"].includes(profile.role);

    const { searchParams } = new URL(request.url);

    const category = (searchParams.get("category") || "").trim();
    const electronicsType = (
      searchParams.get("electronics_subcategory") || ""
    ).trim();
    const itemName = (searchParams.get("item_name") || "").trim();

    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Invalid asset category." },
        { status: 400 },
      );
    }

    if (
      electronicsType &&
      !VALID_ELECTRONICS_TYPES.includes(electronicsType)
    ) {
      return NextResponse.json(
        { error: "Invalid electronics type." },
        { status: 400 },
      );
    }

    if (
      electronicsType &&
      category &&
      category !== "electronics"
    ) {
      return NextResponse.json(
        {
          error:
            "An electronics type cannot be combined with another category.",
        },
        { status: 400 },
      );
    }

    // Service access is used only after authentication and role checks.
    const serviceClient = getServiceClient();

    const fields = [
      "id",
      "asset_tag",
      "item_name",
      "category",
      "electronics_subcategory",
      "status",
      "location",
    ];

    // Managers can inspect availability without receiving serial numbers.
    if (canManage) {
      fields.push("serial_number");
    }

    const candidates: AvailableAsset[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      let query = serviceClient
        .from("assets")
        .select(fields.join(","))
        .in("status", AVAILABLE_STATUSES)
        .is("borrowed_by", null)
        .is("assigned_to", null)
        .or("return_requested.is.null,return_requested.eq.false")
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (electronicsType) {
        query = query
          .eq("category", "electronics")
          .eq("electronics_subcategory", electronicsType);
      } else if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) {
        return NextResponse.json(
          { error: "Unable to load available inventory." },
          { status: 500 },
        );
      }

      const page = (data || []) as unknown as AvailableAsset[];

      candidates.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;
    }

    // Match the database approval rule:
    // exact item name, ignoring surrounding spaces and letter case.
    const matchingAssets = itemName
      ? candidates.filter(
          (asset) =>
            (asset.item_name || "").trim().toLowerCase() ===
            itemName.toLowerCase(),
        )
      : candidates;

    const reservedIds = new Set<string>();

    // Check loan records as well as the asset's borrower fields.
    // Smaller batches avoid oversized requests and truncated results.
    for (let index = 0; index < matchingAssets.length; index += 100) {
      const assetIds = matchingAssets
        .slice(index, index + 100)
        .map((asset) => asset.id);

      const { data: activeLoans, error: loansError } =
        await serviceClient
          .from("equipment_loans")
          .select("asset_id")
          .in("asset_id", assetIds)
          .is("returned_at", null);

      if (loansError) {
        return NextResponse.json(
          {
            error:
              "Unable to verify active equipment loans. Inventory cannot be shown safely.",
          },
          { status: 500 },
        );
      }

      for (const loan of activeLoans || []) {
        reservedIds.add(loan.asset_id);
      }

      // Protect assets still reserved in the older borrowing system.
      let legacyOffset = 0;

      while (true) {
        const { data: legacyLoans, error: legacyError } =
          await serviceClient
            .from("asset_loans")
            .select("id, asset_id")
            .in("asset_id", assetIds)
            .in("status", LEGACY_ACTIVE_STATUSES)
            .order("id", { ascending: true })
            .range(legacyOffset, legacyOffset + pageSize - 1);

        if (legacyError) {
          const missingLegacyTable = [
            "42P01",
            "PGRST205",
          ].includes(legacyError.code);

          if (missingLegacyTable) break;

          return NextResponse.json(
            {
              error:
                "Unable to verify reservations in the older borrowing system.",
            },
            { status: 500 },
          );
        }

        for (const loan of legacyLoans || []) {
          reservedIds.add(loan.asset_id);
        }

        if ((legacyLoans || []).length < pageSize) break;

        legacyOffset += pageSize;
      }
    }

    const assets = matchingAssets
      .filter((asset) => !reservedIds.has(asset.id))
      .sort(
        (a, b) =>
          (a.item_name || "").localeCompare(b.item_name || "") ||
          a.asset_tag.localeCompare(b.asset_tag),
      )
      .map((asset) => ({
        ...asset,
        serial_number: canManage
          ? asset.serial_number ?? null
          : null,
      }));

    return NextResponse.json(
      {
        assets,
        available_count: assets.length,
      },
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
          "Unable to load available devices. Please try again.",
      },
      { status: 500 },
    );
  }
}