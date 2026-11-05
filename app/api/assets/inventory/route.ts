import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type AssetRow = {
  id: string;
  asset_tag: string;
  category: string | null;
  electronics_subcategory: string | null;
  item_name: string | null;
  serial_number?: string | null;
  status: string;
  location: string | null;
  borrowed_by: string | null;
  assigned_to: string | null;
  return_requested: boolean | null;
};

type CurrentLoan = {
  id: string;
  asset_id: string;
  borrower_id: string;
  return_requested_at: string | null;
};

type LegacyLoan = {
  id: string;
  asset_id: string;
  borrower_id: string | null;
  status: string;
};

type InventoryItem = {
  category: string;
  electronics_subcategory: string | null;
  item_name: string | null;
  total_count: number;
  available_count: number;
  borrowed_count: number;
  under_repair_count: number;
  retired_count: number;
  reserved_count: number;
  assigned_count: number;
  unavailable_count: number;
  return_requested_count: number;
};

type HoldingStatus =
  | "available"
  | "borrowed"
  | "return_requested"
  | "under_repair"
  | "retired"
  | "reserved"
  | "assigned"
  | "unavailable";

const PAGE_SIZE = 500;

const LEGACY_ACTIVE_STATUSES = [
  "requested",
  "approved",
  "issued",
  "return_requested",
];

const LEGACY_STATUS_PRIORITY: Record<string, number> = {
  requested: 1,
  approved: 2,
  issued: 3,
  return_requested: 4,
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

function normalizeName(value: string | null): string {
  return (value || "").trim().toLowerCase();
}

function getHoldingStatus(
  asset: AssetRow,
  loan: CurrentLoan | undefined,
  legacyLoan: LegacyLoan | undefined,
): HoldingStatus {
  // A return request never makes a device available.
  if (
    asset.return_requested ||
    loan?.return_requested_at ||
    legacyLoan?.status === "return_requested"
  ) {
    return "return_requested";
  }

  if (
    asset.borrowed_by ||
    loan ||
    legacyLoan?.status === "issued"
  ) {
    return "borrowed";
  }

  if (asset.status === "under_repair") {
    return "under_repair";
  }

  if (asset.status === "retired") {
    return "retired";
  }

  if (legacyLoan) {
    return "reserved";
  }

  if (asset.assigned_to) {
    return "assigned";
  }

  if (["new", "in_use"].includes(asset.status)) {
    return "available";
  }

  return "unavailable";
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
      !["admin", "finance", "manager"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const canManage = ["admin", "finance"].includes(profile.role);
    const serviceClient = getServiceClient();

    // Retrieve serial numbers only for finance/admin.
    const fields = [
      "id",
      "asset_tag",
      "category",
      "electronics_subcategory",
      "item_name",
      "status",
      "location",
      "borrowed_by",
      "assigned_to",
      "return_requested",
    ];

    if (canManage) {
      fields.push("serial_number");
    }

    const assets: AssetRow[] = [];
    let assetOffset = 0;

    while (true) {
      const { data, error } = await serviceClient
        .from("assets")
        .select(fields.join(","))
        .order("id", { ascending: true })
        .range(assetOffset, assetOffset + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json(
          { error: "Unable to load inventory assets." },
          { status: 500 },
        );
      }

      const page = (data || []) as unknown as AssetRow[];
      assets.push(...page);

      if (page.length < PAGE_SIZE) break;

      assetOffset += PAGE_SIZE;
    }

    // Current simplified borrowing system.
    const loansByAsset = new Map<string, CurrentLoan>();
    let loanOffset = 0;

    while (true) {
      const { data, error } = await serviceClient
        .from("equipment_loans")
        .select("id, asset_id, borrower_id, return_requested_at")
        .is("returned_at", null)
        .order("id", { ascending: true })
        .range(loanOffset, loanOffset + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json(
          {
            error:
              "Unable to verify active equipment loans. Inventory counts could not be calculated.",
          },
          { status: 500 },
        );
      }

      const page = (data || []) as CurrentLoan[];

      for (const loan of page) {
        loansByAsset.set(loan.asset_id, loan);
      }

      if (page.length < PAGE_SIZE) break;

      loanOffset += PAGE_SIZE;
    }

    // Keep older active requests from being counted as available.
    const legacyLoansByAsset = new Map<string, LegacyLoan>();
    let legacyOffset = 0;

    while (true) {
      const { data, error } = await serviceClient
        .from("asset_loans")
        .select("id, asset_id, borrower_id, status")
        .in("status", LEGACY_ACTIVE_STATUSES)
        .order("id", { ascending: true })
        .range(legacyOffset, legacyOffset + PAGE_SIZE - 1);

      if (error) {
        const missingLegacyTable = [
          "42P01",
          "PGRST205",
        ].includes(error.code);

        if (missingLegacyTable) break;

        return NextResponse.json(
          {
            error:
              "Unable to verify reservations in the older borrowing system.",
          },
          { status: 500 },
        );
      }

      const page = (data || []) as LegacyLoan[];

      for (const loan of page) {
        const existing = legacyLoansByAsset.get(loan.asset_id);

        // Prefer issued/return-requested records if several
        // older active records refer to the same device.
        if (
          !existing ||
          (LEGACY_STATUS_PRIORITY[loan.status] || 0) >
            (LEGACY_STATUS_PRIORITY[existing.status] || 0)
        ) {
          legacyLoansByAsset.set(loan.asset_id, loan);
        }
      }

      if (page.length < PAGE_SIZE) break;

      legacyOffset += PAGE_SIZE;
    }

    const holderIds = new Set<string>();

    for (const asset of assets) {
      if (asset.borrowed_by) holderIds.add(asset.borrowed_by);
      if (asset.assigned_to) holderIds.add(asset.assigned_to);
    }

    for (const loan of loansByAsset.values()) {
      holderIds.add(loan.borrower_id);
    }

    for (const loan of legacyLoansByAsset.values()) {
      if (
        loan.borrower_id &&
        ["issued", "return_requested"].includes(loan.status)
      ) {
        holderIds.add(loan.borrower_id);
      }
    }

    const userNames = new Map<string, string>();
    const personIds = Array.from(holderIds);

    for (let index = 0; index < personIds.length; index += 100) {
      const { data: people, error } = await serviceClient
        .from("public_users")
        .select("id, name")
        .in("id", personIds.slice(index, index + 100));

      if (error) {
        return NextResponse.json(
          { error: "Unable to load equipment holder names." },
          { status: 500 },
        );
      }

      for (const person of people || []) {
        userNames.set(person.id, person.name || "Unknown");
      }
    }

    const inventoryMap = new Map<string, InventoryItem>();

    const inventoryAssets = assets.map((asset) => {
      const loan = loansByAsset.get(asset.id);
      const legacyLoan = legacyLoansByAsset.get(asset.id);

      const holdingStatus = getHoldingStatus(
        asset,
        loan,
        legacyLoan,
      );

      const category = asset.category || "other";
      const electronicsType =
        category === "electronics"
          ? asset.electronics_subcategory || null
          : null;

      const itemName = asset.item_name?.trim() || null;

      // Tablets and PCs remain separate even if their names match.
      const groupKey = JSON.stringify([
        category,
        electronicsType,
        normalizeName(itemName),
      ]);

      let item = inventoryMap.get(groupKey);

      if (!item) {
        item = {
          category,
          electronics_subcategory: electronicsType,
          item_name: itemName,
          total_count: 0,
          available_count: 0,
          borrowed_count: 0,
          under_repair_count: 0,
          retired_count: 0,
          reserved_count: 0,
          assigned_count: 0,
          unavailable_count: 0,
          return_requested_count: 0,
        };

        inventoryMap.set(groupKey, item);
      }

      // Count physical records, not a stored batch quantity.
      item.total_count++;

      switch (holdingStatus) {
        case "available":
          item.available_count++;
          break;

        case "borrowed":
          item.borrowed_count++;
          break;

        case "return_requested":
          // Awaiting confirmation still counts as borrowed.
          item.borrowed_count++;
          item.return_requested_count++;
          break;

        case "under_repair":
          item.under_repair_count++;
          break;

        case "retired":
          item.retired_count++;
          break;

        case "reserved":
          item.reserved_count++;
          break;

        case "assigned":
          item.assigned_count++;
          break;

        default:
          item.unavailable_count++;
      }

      const legacyBorrower =
        legacyLoan &&
        ["issued", "return_requested"].includes(legacyLoan.status)
          ? legacyLoan.borrower_id
          : null;

      const holderId =
        loan?.borrower_id ||
        asset.borrowed_by ||
        legacyBorrower ||
        asset.assigned_to ||
        null;

      return {
        id: asset.id,
        asset_tag: asset.asset_tag,
        category,
        electronics_subcategory: electronicsType,
        item_name: itemName,
        serial_number: canManage
          ? asset.serial_number || null
          : null,
        location: asset.location,
        status: holdingStatus,
        asset_condition: asset.status,
        is_available: holdingStatus === "available",
        current_holder: holderId
          ? userNames.get(holderId) || "Unknown"
          : null,
      };
    });

    const inventory = Array.from(inventoryMap.values()).sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        (a.electronics_subcategory || "").localeCompare(
          b.electronics_subcategory || "",
        ) ||
        (a.item_name || "").localeCompare(b.item_name || ""),
    );

    inventoryAssets.sort(
      (a, b) =>
        (a.item_name || "").localeCompare(b.item_name || "") ||
        a.asset_tag.localeCompare(b.asset_tag),
    );

    const summary = inventory.reduce(
      (totals, item) => ({
        total_count: totals.total_count + item.total_count,
        available_count:
          totals.available_count + item.available_count,
        borrowed_count:
          totals.borrowed_count + item.borrowed_count,
        under_repair_count:
          totals.under_repair_count + item.under_repair_count,
        retired_count:
          totals.retired_count + item.retired_count,
        reserved_count:
          totals.reserved_count + item.reserved_count,
        assigned_count:
          totals.assigned_count + item.assigned_count,
        unavailable_count:
          totals.unavailable_count + item.unavailable_count,
        return_requested_count:
          totals.return_requested_count + item.return_requested_count,
      }),
      {
        total_count: 0,
        available_count: 0,
        borrowed_count: 0,
        under_repair_count: 0,
        retired_count: 0,
        reserved_count: 0,
        assigned_count: 0,
        unavailable_count: 0,
        return_requested_count: 0,
      },
    );

    return NextResponse.json(
      {
        inventory,
        assets: inventoryAssets,
        summary,
        can_manage: canManage,
        borrowed_page_url: "/assets/borrowed",
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
          "Unable to load inventory. Please refresh and try again.",
      },
      { status: 500 },
    );
  }
}