import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;

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

const EDITABLE_FIELDS = [
  "category",
  "item_name",
  "assigned_to",
  "purchase_cost",
  "purchase_date",
  "status",
  "location",
  "electronics_subcategory",
  "serial_number",
  "quantity",
] as const;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function isEquipment(
  category: unknown,
  electronicsType: unknown,
): boolean {
  return (
    category === "electronics" &&
    ["tablet", "pc"].includes(String(electronicsType || ""))
  );
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function authorize() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      error: fail("Unauthorized", 401),
    };
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
    return {
      supabase,
      error: fail("Only finance or admin can manage assets.", 403),
    };
  }

  return { supabase, error: null };
}

/**
 * Check the current loan table and preserve protections for
 * any records still present in the older borrowing system.
 */
async function checkLoans(
  supabase: DatabaseClient,
  assetId: string,
  includeHistory: boolean,
): Promise<string | null> {
  let currentQuery = supabase
    .from("equipment_loans")
    .select("id")
    .eq("asset_id", assetId);

  if (!includeHistory) {
    currentQuery = currentQuery.is("returned_at", null);
  }

  const { data: currentLoans, error: currentError } =
    await currentQuery.limit(1);

  if (currentError) {
    throw new Error(
      "Unable to check equipment loan records. No changes were made.",
    );
  }

  if (currentLoans?.length) {
    return includeHistory
      ? "This asset has loan history and cannot be deleted. Retire it instead."
      : "This asset has an active loan. Complete its return before editing.";
  }

  let legacyQuery = supabase
    .from("asset_loans")
    .select("id")
    .eq("asset_id", assetId);

  if (!includeHistory) {
    legacyQuery = legacyQuery.in("status", [
      "requested",
      "approved",
      "issued",
      "return_requested",
    ]);
  }

  const { data: legacyLoans, error: legacyError } =
    await legacyQuery.limit(1);

  if (legacyError) {
    // The older table may have been removed after migration.
    const missingLegacyTable = ["42P01", "PGRST205"].includes(
      legacyError.code,
    );

    if (!missingLegacyTable) {
      throw new Error(
        "Unable to check older loan records. No changes were made.",
      );
    }
  }

  if (legacyLoans?.length) {
    return includeHistory
      ? "This asset has history in the older borrowing system. Retire it instead of deleting it."
      : "This asset has an open request in the older borrowing system. Resolve or migrate that request before editing.";
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return fail("Invalid asset ID.");
    }

    const { supabase, error: authError } = await authorize();

    if (authError) return authError;

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid request data.");
    }

    if (
      !EDITABLE_FIELDS.some((field) =>
        Object.prototype.hasOwnProperty.call(body, field),
      )
    ) {
      return fail("No editable asset fields were provided.");
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (assetError) {
      return fail("Unable to load the asset.", 500);
    }

    if (!asset) {
      return fail("Asset not found.", 404);
    }

    if (asset.borrowed_by || asset.return_requested) {
      return fail(
        "This device is borrowed or awaiting return confirmation. Complete its return on the Borrowed page before editing.",
        409,
      );
    }

    const loanProblem = await checkLoans(supabase, id, false);

    if (loanProblem) {
      return fail(loanProblem, 409);
    }

    const updates: Record<string, unknown> = {};

    for (const field of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    const textFields = [
      "category",
      "item_name",
      "electronics_subcategory",
      "serial_number",
      "location",
      "assigned_to",
      "purchase_date",
      "status",
    ];

    for (const field of textFields) {
      if (field in updates) {
        const value = updates[field];

        if (value !== null && typeof value !== "string") {
          return fail(`Invalid value for ${field}.`);
        }

        updates[field] = cleanText(value) || null;
      }
    }

    const next = {
      ...asset,
      ...updates,
    };

    const category = cleanText(next.category);
    const itemName = cleanText(next.item_name);
    const electronicsType = cleanText(next.electronics_subcategory);
    const serialNumber = cleanText(next.serial_number);
    const location = cleanText(next.location);
    const assignedTo = cleanText(next.assigned_to);
    const status = cleanText(next.status);

    if (!VALID_CATEGORIES.includes(category)) {
      return fail("Select a valid asset category.");
    }

    if (!itemName) {
      return fail("Item name is required.");
    }

    if (!VALID_STATUSES.includes(status)) {
      return fail("Select a valid asset condition.");
    }

    if (
      category === "electronics" &&
      !VALID_ELECTRONICS_TYPES.includes(electronicsType)
    ) {
      return fail("Select Tablet, PC, or Other electronics.");
    }

    if (category !== "electronics") {
      updates.electronics_subcategory = null;
    }

    const wasEquipment = isEquipment(
      asset.category,
      asset.electronics_subcategory,
    );

    const willBeEquipment = isEquipment(category, electronicsType);

    // No direct reassignment or silent release of Tablet/PC holders.
    if (
      (wasEquipment || willBeEquipment) &&
      "assigned_to" in updates &&
      assignedTo !== cleanText(asset.assigned_to)
    ) {
      return fail(
        "Tablet and PC assignments must be handled through finance approval and the return process.",
        409,
      );
    }

    // Do not convert an assigned non-equipment record into a
    // Tablet/PC and silently treat that assignment as a new loan.
    if (
      !wasEquipment &&
      willBeEquipment &&
      cleanText(asset.assigned_to)
    ) {
      return fail(
        "Resolve this asset's existing assignment before changing it to a Tablet or PC.",
        409,
      );
    }

    if (willBeEquipment) {
      if (!serialNumber) {
        return fail("A serial number is required for this device.");
      }

      if (!location) {
        return fail("A location is required for this device.");
      }

      if (
        "quantity" in updates &&
        Number(updates.quantity) !== 1
      ) {
        return fail(
          "Each Tablet or PC record must represent exactly one device.",
        );
      }

      updates.quantity = 1;

      // Preserve historical purchase data, but do not edit it
      // through the simplified Tablet/PC workflow.
      delete updates.purchase_cost;
      delete updates.purchase_date;
    } else {
      if (
        "quantity" in updates &&
        updates.quantity !== null
      ) {
        const quantity = Number(updates.quantity);

        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          return fail("Quantity must be a positive whole number.");
        }

        updates.quantity = quantity;
      }

      if ("purchase_cost" in updates) {
        if (
          updates.purchase_cost === null ||
          updates.purchase_cost === ""
        ) {
          updates.purchase_cost = null;
        } else {
          const cost = Number(updates.purchase_cost);

          if (!Number.isFinite(cost) || cost < 0) {
            return fail("Purchase cost must be zero or greater.");
          }

          updates.purchase_cost = cost;
        }
      }

      if (updates.purchase_date) {
        const date = cleanText(updates.purchase_date);
        const parsed = new Date(`${date}T00:00:00Z`);

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== date
        ) {
          return fail("Enter a valid purchase date.");
        }
      }
    }

    if (assignedTo && "assigned_to" in updates) {
      if (!isUuid(assignedTo)) {
        return fail("Select a valid staff member.");
      }

      // Only validate a changed assignment. Existing assignments
      // are preserved when their profile is no longer visible.
      if (assignedTo !== cleanText(asset.assigned_to)) {
        const { data: person, error: personError } = await supabase
          .from("public_users")
          .select("id")
          .eq("id", assignedTo)
          .maybeSingle();

        if (personError) {
          return fail("Unable to verify the selected staff member.", 500);
        }

        if (!person) {
          return fail("The selected staff member does not exist.");
        }
      }
    }

    if (serialNumber) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("assets")
        .select("id")
        .neq("id", id)
        .ilike("serial_number", escapeLike(serialNumber))
        .limit(1);

      if (duplicateError) {
        return fail("Unable to verify the serial number.", 500);
      }

      if (duplicate?.length) {
        return fail(
          "Another asset already has this serial number.",
          409,
        );
      }
    }

    // Apply the edit only if the device remains unborrowed.
    let updateQuery = supabase
      .from("assets")
      .update(updates)
      .eq("id", id)
      .is("borrowed_by", null)
      .or("return_requested.is.null,return_requested.eq.false");

    // Check the original editable values so concurrent edits
    // do not silently overwrite one another.
    for (const field of EDITABLE_FIELDS) {
      const originalValue = asset[field];

      if (originalValue === null || originalValue === undefined) {
        updateQuery = updateQuery.is(field, null);
      } else {
        updateQuery = updateQuery.eq(field, originalValue);
      }
    }

    const { data: updated, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "23505") {
        return fail(
          "Another asset already uses these unique details. Check the serial number.",
          409,
        );
      }

      return fail(updateError.message, 500);
    }

    if (!updated) {
      return fail(
        "This asset changed or was borrowed while you were editing. Refresh the registry and try again.",
        409,
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return fail(
      "The asset could not be updated. Refresh the registry before trying again.",
      500,
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return fail("Invalid asset ID.");
    }

    const { supabase, error: authError } = await authorize();

    if (authError) return authError;

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (assetError) {
      return fail("Unable to load the asset.", 500);
    }

    if (!asset) {
      return fail("Asset not found.", 404);
    }

    if (
      asset.borrowed_by ||
      asset.return_requested ||
      asset.assigned_to
    ) {
      return fail(
        "Borrowed, assigned, or return-pending assets cannot be deleted.",
        409,
      );
    }

    const loanProblem = await checkLoans(supabase, id, true);

    if (loanProblem) {
      return fail(loanProblem, 409);
    }

    let deleteQuery = supabase
      .from("assets")
      .delete()
      .eq("id", id)
      .is("borrowed_by", null)
      .is("assigned_to", null)
      .or("return_requested.is.null,return_requested.eq.false");

    // Do not delete a record that changed after it was checked.
    for (const field of EDITABLE_FIELDS) {
      const originalValue = asset[field];

      if (originalValue === null || originalValue === undefined) {
        deleteQuery = deleteQuery.is(field, null);
      } else {
        deleteQuery = deleteQuery.eq(field, originalValue);
      }
    }

    const { data: deleted, error: deleteError } = await deleteQuery
      .select("id")
      .maybeSingle();

    if (deleteError) {
      if (deleteError.code === "23503") {
        return fail(
          "This asset is linked to existing records and cannot be deleted. Retire it instead.",
          409,
        );
      }

      return fail(deleteError.message, 500);
    }

    if (!deleted) {
      return fail(
        "This asset changed or was assigned while you were deleting it. Refresh the registry.",
        409,
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return fail(
      "The asset could not be deleted. Refresh the registry before trying again.",
      500,
    );
  }
}