import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const VALID_REQUEST_TYPES = [
  "physical_good",
  "electronics",
  "travel_expense",
  "reimbursement",
  "other_asset",
  "document_request",
  "per_diem",
];

const VALID_ASSET_CATEGORIES = [
  "electronics",
  "furniture",
  "vehicle",
  "office_supplies",
  "other",
];

const VALID_ELECTRONICS_TYPES = ["tablet", "pc", "other"];

type ApprovalRow = {
  decision: string;
  comment: string | null;
  role_at_time: string;
  created_at: string;
};

type LoanRow = {
  id: string;
  asset_id: string;
  borrowed_at: string | null;
  return_requested_at: string | null;
  returned_at: string | null;
  return_condition: string | null;
  asset: {
    id: string;
    asset_tag: string;
    item_name: string | null;
  } | null;
};

type RequestRow = {
  id: string;
  status: string;
  approvals: ApprovalRow[] | null;
  equipment_loans: LoanRow[] | null;
  [key: string]: unknown;
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

function getText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("Unauthorized.", 401);
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return fail("Invalid form submission.");
    }

    const type = getText(formData, "type");
    const submittedTitle = getText(formData, "title");
    const description = getText(formData, "description");
    const quantityText = getText(formData, "quantity");
    const costText = getText(formData, "estimated_cost");
    const submittedCategory = getText(formData, "asset_category");
    const electronicsType = getText(
      formData,
      "electronics_subcategory",
    );
    const justification = getText(formData, "justification");

    if (!VALID_REQUEST_TYPES.includes(type)) {
      return fail("Select a valid request type.");
    }

    if (
      type === "electronics" &&
      !VALID_ELECTRONICS_TYPES.includes(electronicsType)
    ) {
      return fail("Select Tablet, PC, or Other electronics.");
    }

    const isEquipment =
      type === "electronics" &&
      ["tablet", "pc"].includes(electronicsType);

    const needsAssetDetails = [
      "physical_good",
      "electronics",
      "other_asset",
    ].includes(type);

    // Tablet/PC requests are matched by subtype only.
    const needsItemName = needsAssetDetails && !isEquipment;

    const needsCost = ![
      "document_request",
      "per_diem",
      "electronics",
    ].includes(type);

    const assetCategory =
      type === "electronics"
        ? "electronics"
        : submittedCategory || "other";

    if (
      needsAssetDetails &&
      !VALID_ASSET_CATEGORIES.includes(assetCategory)
    ) {
      return fail("Select a valid asset category.");
    }

    // Ignore old item-name fields for Tablet/PC requests.
    let canonicalItemName = needsItemName
      ? getText(formData, "item_name")
      : "";

    if (needsItemName && !canonicalItemName) {
      return fail("Item name is required for this request.");
    }

    if (needsAssetDetails && !justification) {
      return fail("Enter a justification for this request.");
    }

    let quantity: number | null = null;

    if (needsAssetDetails || needsCost) {
      // Never silently substitute a quantity for Tablet/PC.
      if (isEquipment && !quantityText) {
        return fail("Enter the number of devices requested.");
      }

      quantity = Number(quantityText || "1");

      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return fail("Quantity must be a positive whole number.");
      }
    }

    let estimatedCost = 0;

    if (needsCost) {
      if (!costText) {
        return fail(
          "Estimated cost is required for this request type.",
        );
      }

      estimatedCost = Number(costText);

      if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
        return fail("Estimated cost must be zero or greater.");
      }
    }

    // Preserve name canonicalization for OTHER asset request types.
    // Tablet/PC requests never query the item-name catalog.
    if (needsItemName) {
      const serviceClient = getServiceClient();
      const normalizedName = canonicalItemName.toLowerCase();

      let matchedName: string | null = null;
      let offset = 0;
      const pageSize = 500;

      while (true) {
        let query = serviceClient
          .from("assets")
          .select("item_name")
          .eq("category", assetCategory)
          .not("item_name", "is", null)
          .order("item_name", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (type === "electronics") {
          query = query.eq(
            "electronics_subcategory",
            electronicsType,
          );
        }

        const { data: catalogItems, error: catalogError } =
          await query;

        if (catalogError) {
          console.error("Item name lookup failed:", catalogError);

          return fail(
            "Unable to verify item names. Please try again.",
            500,
          );
        }

        for (const item of catalogItems || []) {
          const name =
            typeof item.item_name === "string"
              ? item.item_name.trim()
              : "";

          if (name && name.toLowerCase() === normalizedName) {
            matchedName = name;
            break;
          }
        }

        if (matchedName || (catalogItems || []).length < pageSize) {
          break;
        }

        offset += pageSize;
      }

      // Custom names remain supported for these request types.
      canonicalItemName = matchedName || canonicalItemName;
    }

    const title = isEquipment
      ? `${electronicsType === "tablet" ? "Tablet" : "PC"} request`
      : type === "electronics"
        ? `${canonicalItemName} request`
        : submittedTitle;

    if (!title) {
      return fail("Request title is required.");
    }

    const { data: newRequest, error: insertError } = await supabase
      .from("requests")
      .insert({
        requester_id: user.id,
        type,
        title,
        description: isEquipment ? null : description || null,
        quantity,
        estimated_cost: estimatedCost,
        asset_category: needsAssetDetails ? assetCategory : null,

        // Device names stay in inventory, not in Tablet/PC requests.
        item_name: needsItemName ? canonicalItemName : null,
        requested_item_name: null,

        electronics_subcategory:
          type === "electronics" ? electronicsType : null,
        justification: justification || null,
        status: "pending_manager",
      })
      .select()
      .single();

    if (insertError || !newRequest) {
      console.error("Request creation failed:", insertError);

      return fail(
        insertError?.message || "Unable to create the request.",
        500,
      );
    }

    // Attachment failures must not imply that request creation failed.
    const warnings: string[] = [];

    const files = formData
      .getAll("files")
      .filter(
        (entry): entry is File =>
          typeof entry !== "string" && entry.size > 0,
      );

    for (const file of files) {
      const safeName =
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) ||
        "attachment";

      const filePath =
        `requests/${newRequest.id}/${crypto.randomUUID()}-${safeName}`;

      try {
        const arrayBuffer = await file.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(filePath, arrayBuffer, {
            contentType: file.type || "application/octet-stream",
          });

        if (uploadError) {
          warnings.push(`Could not upload "${file.name}".`);
          continue;
        }

        const { error: attachmentError } = await supabase
          .from("attachments")
          .insert({
            request_id: newRequest.id,
            file_url: filePath,
            uploaded_by: user.id,
          });

        if (attachmentError) {
          warnings.push(`Could not attach "${file.name}".`);

          try {
            await supabase.storage
              .from("attachments")
              .remove([filePath]);
          } catch {
            // The saved request remains successful.
          }
        }
      } catch {
        warnings.push(`Could not process "${file.name}".`);
      }
    }

    return json(
      {
        request: newRequest,
        warnings,
      },
      201,
    );
  } catch (error) {
    console.error("Request submission failed:", error);

    return fail(
      "The submission could not be confirmed. Check My Requests before trying again.",
      500,
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("Unauthorized.", 401);
    }

    const serviceClient = getServiceClient();
    const requests: RequestRow[] = [];

    const pageSize = 100;
    let offset = 0;

    while (true) {
      // Service access is restricted to this user's own requests.
      const { data, error } = await serviceClient
        .from("requests")
        .select(`
          *,
          attachments(*),
          approvals(
            decision,
            comment,
            role_at_time,
            created_at
          ),
          equipment_loans(
            id,
            asset_id,
            borrowed_at,
            return_requested_at,
            returned_at,
            return_condition,
            asset:assets(
              id,
              asset_tag,
              item_name
            )
          )
        `)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Worker requests query failed:", error);

        return fail(
          "Unable to load your requests and approval details.",
          500,
        );
      }

      const page = (data || []) as unknown as RequestRow[];
      requests.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;
    }

    const result = requests.map((requestRow) => {
      const approvals = [...(requestRow.approvals || [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );

      const rejection =
        requestRow.status === "rejected"
          ? approvals.find(
              (approval) => approval.decision === "rejected",
            )
          : undefined;

      const loans = [...(requestRow.equipment_loans || [])].sort(
        (a, b) => {
          if (!a.borrowed_at && !b.borrowed_at) return 0;
          if (!a.borrowed_at) return 1;
          if (!b.borrowed_at) return -1;

          return (
            new Date(a.borrowed_at).getTime() -
            new Date(b.borrowed_at).getTime()
          );
        },
      );

      const equipmentLoans = loans.map((loan) => ({
        ...loan,
        status: loan.returned_at
          ? "returned"
          : loan.return_requested_at
            ? "return_requested"
            : "borrowed",
      }));

      return {
        ...requestRow,
        approvals,
        rejection_reason: rejection?.comment?.trim() || null,
        rejected_by_role: rejection?.role_at_time || null,
        equipment_loans: equipmentLoans,
        borrowed_count: equipmentLoans.filter(
          (loan) => loan.status !== "returned",
        ).length,
      };
    });

    return json({ requests: result });
  } catch (error) {
    console.error("Worker requests endpoint failed:", error);

    return fail(
      "Unable to load your requests. Please try again.",
      500,
    );
  }
}