import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateAssetTag } from "@/lib/assets";

const VALID_CATEGORIES = [
  "electronics",
  "furniture",
  "vehicle",
  "office_supplies",
  "other",
];

const VALID_ELECTRONICS_TYPES = ["tablet", "pc", "other"];

const VALID_STATUSES = [
  "new",
  "in_use",
  "under_repair",
  "retired",
];

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

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
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

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Unable to verify your account role." },
        { status: 403 },
      );
    }

    // The registry is for admin, finance, and managers.
    // All roles will use the separate shared Borrowed page.
    if (!["admin", "finance", "manager"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const canManage = ["admin", "finance"].includes(profile.role);

    // Explicit fields prevent accidentally exposing future columns.
    const assetFields = [
      "id",
      "asset_tag",
      "category",
      "item_name",
      "electronics_subcategory",
      "assigned_to",
      "borrowed_by",
      "borrowed_at",
      "return_requested",
      "return_requested_at",
      "purchase_cost",
      "purchase_date",
      "status",
      "location",
      "quantity",
      "created_at",
    ];

    if (canManage) {
      assetFields.push("serial_number");
    }

    // Load all records instead of silently stopping at the first page.
    const assets: Record<string, unknown>[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("assets")
        .select(assetFields.join(","))
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }

      const page = (data || []) as unknown as Record<
        string,
        unknown
      >[];

      assets.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;
    }

    const personIds = Array.from(
      new Set(
        assets.flatMap((asset) =>
          [asset.assigned_to, asset.borrowed_by].filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          ),
        ),
      ),
    );

    const names = new Map<string, string>();
    const serviceClient = getServiceClient();

    // Fetch names in batches rather than one query per asset.
    for (let index = 0; index < personIds.length; index += 100) {
      const batch = personIds.slice(index, index + 100);

      const { data: people, error: peopleError } =
        await serviceClient
          .from("public_users")
          .select("id, name")
          .in("id", batch);

      if (peopleError) {
        return NextResponse.json(
          { error: "Unable to load asset holder names." },
          { status: 500 },
        );
      }

      for (const person of people || []) {
        names.set(person.id, person.name || "Unknown");
      }
    }

    const assetsWithNames = assets.map((asset) => ({
      ...asset,
      serial_number: canManage
        ? asset.serial_number ?? null
        : null,
      assignee_name:
        typeof asset.assigned_to === "string"
          ? names.get(asset.assigned_to) || null
          : null,
      borrower_name:
        typeof asset.borrowed_by === "string"
          ? names.get(asset.borrowed_by) || null
          : null,
    }));

    return NextResponse.json(
      { assets: assetsWithNames },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load assets. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let createdCount = 0;

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
      !["admin", "finance"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Only finance or admin can register assets." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request data." },
        { status: 400 },
      );
    }

    const category = cleanText(body.category);
    const itemName = cleanText(body.item_name);
    const serialNumber = cleanText(body.serial_number);
    const location = cleanText(body.location);
    const assignedTo = cleanText(body.assigned_to);

    const electronicsType =
      category === "electronics"
        ? cleanText(body.electronics_subcategory)
        : null;

    const status = cleanText(body.status) || "new";

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Select a valid asset category." },
        { status: 400 },
      );
    }

    if (!itemName) {
      return NextResponse.json(
        { error: "Item name is required." },
        { status: 400 },
      );
    }

    if (
      category === "electronics" &&
      !VALID_ELECTRONICS_TYPES.includes(electronicsType || "")
    ) {
      return NextResponse.json(
        { error: "Select Tablet, PC, or Other electronics." },
        { status: 400 },
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Select a valid asset condition." },
        { status: 400 },
      );
    }

    const isEquipment =
      category === "electronics" &&
      ["tablet", "pc"].includes(electronicsType || "");

    const quantity =
      body.quantity === undefined ||
      body.quantity === null ||
      body.quantity === ""
        ? 1
        : Number(body.quantity);

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return NextResponse.json(
        { error: "Quantity must be a positive whole number." },
        { status: 400 },
      );
    }

    if (isEquipment) {
      if (quantity !== 1) {
        return NextResponse.json(
          {
            error:
              "Register each Tablet or PC separately. One record must represent one device.",
          },
          { status: 400 },
        );
      }

      if (!serialNumber) {
        return NextResponse.json(
          { error: "A serial number is required for this device." },
          { status: 400 },
        );
      }

      if (!location) {
        return NextResponse.json(
          { error: "A location is required for this device." },
          { status: 400 },
        );
      }

      if (assignedTo) {
        return NextResponse.json(
          {
            error:
              "Tablets and PCs must be assigned through finance approval of a worker request.",
          },
          { status: 400 },
        );
      }
    }

    if (assignedTo && !isUuid(assignedTo)) {
      return NextResponse.json(
        { error: "Select a valid staff member." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();

    if (assignedTo) {
      const { data: assignee, error: assigneeError } =
        await serviceClient
          .from("public_users")
          .select("id")
          .eq("id", assignedTo)
          .maybeSingle();

      if (assigneeError) {
        return NextResponse.json(
          { error: "Unable to verify the selected staff member." },
          { status: 500 },
        );
      }

      if (!assignee) {
        return NextResponse.json(
          { error: "The selected staff member does not exist." },
          { status: 400 },
        );
      }
    }

    // Check existing serials without relying on client-side checks.
    if (serialNumber) {
      const { data: duplicate, error: duplicateError } =
        await serviceClient
          .from("assets")
          .select("id")
          .ilike("serial_number", escapeLike(serialNumber))
          .limit(1);

      if (duplicateError) {
        return NextResponse.json(
          { error: "Unable to verify the serial number." },
          { status: 500 },
        );
      }

      if (duplicate && duplicate.length > 0) {
        return NextResponse.json(
          {
            error:
              "An asset with this serial number already exists.",
          },
          { status: 409 },
        );
      }
    }

    // Preserve the existing furniture batch-registration behavior.
    const recordsToCreate = category === "furniture" ? quantity : 1;

    if (recordsToCreate > 1 && serialNumber) {
      return NextResponse.json(
        {
          error:
            "Register individually numbered items separately. A batch cannot share one serial number.",
        },
        { status: 400 },
      );
    }

    let purchaseCost: number | null = null;
    let purchaseDate: string | null = null;

    // Tablet/PC borrowing does not involve purchasing.
    if (!isEquipment) {
      if (
        body.purchase_cost !== undefined &&
        body.purchase_cost !== null &&
        body.purchase_cost !== ""
      ) {
        purchaseCost = Number(body.purchase_cost);

        if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
          return NextResponse.json(
            { error: "Purchase cost must be zero or greater." },
            { status: 400 },
          );
        }
      }

      purchaseDate = cleanText(body.purchase_date) || null;

      if (purchaseDate) {
        const parsed = new Date(`${purchaseDate}T00:00:00Z`);

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ||
          Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== purchaseDate
        ) {
          return NextResponse.json(
            { error: "Enter a valid purchase date." },
            { status: 400 },
          );
        }
      }
    }

    function creationFailure(message: string, httpStatus = 500) {
      return NextResponse.json(
        {
          error:
            createdCount > 0
              ? `${createdCount} asset(s) were registered before the operation stopped. Refresh the registry before adding the remaining items. ${message}`
              : message,
          created_count: createdCount,
        },
        { status: httpStatus },
      );
    }

    for (let index = 0; index < recordsToCreate; index++) {
      let inserted = false;

      for (let attempt = 0; attempt < 5; attempt++) {
        const assetTag = await generateAssetTag(supabase, category);

        const { error } = await supabase.from("assets").insert({
          asset_tag: assetTag,
          category,
          electronics_subcategory: electronicsType,
          item_name: itemName,
          serial_number: serialNumber || null,
          assigned_to: isEquipment ? null : assignedTo || null,
          purchase_cost: purchaseCost,
          purchase_date: purchaseDate,
          status,
          location: location || null,
          quantity:
            isEquipment || category === "furniture"
              ? 1
              : quantity,
        });

        if (!error) {
          createdCount++;
          inserted = true;
          break;
        }

        if (error.code !== "23505") {
          return creationFailure(error.message);
        }

        // A unique constraint failed. Retry only when this
        // attempt's generated asset tag already exists.
        const { data: existingTag, error: tagCheckError } =
          await serviceClient
            .from("assets")
            .select("id")
            .eq("asset_tag", assetTag)
            .maybeSingle();

        if (tagCheckError) {
          return creationFailure(
            "Unable to verify the generated asset code.",
          );
        }

        if (!existingTag) {
          return creationFailure(
            "An asset with these unique details already exists. Check its serial number.",
            409,
          );
        }
      }

      if (!inserted) {
        return creationFailure(
          "Unable to generate a unique asset code. Please try again.",
          409,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        count: createdCount,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          createdCount > 0
            ? `${createdCount} asset(s) were registered before an error occurred. Refresh the registry before retrying.`
            : "Registration could not be completed. Refresh the registry before retrying to check whether the asset was saved.",
        created_count: createdCount,
      },
      { status: 500 },
    );
  }
}