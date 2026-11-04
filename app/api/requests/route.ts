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

type RequestAssetRow = {
  id: string;
  request_id: string;
  fulfillment_mode: string;
  source: string;
  due_date: string | null;
  asset: {
    id: string;
    asset_tag: string;
    item_name: string | null;
    serial_number: string | null;
  } | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const quantity = formData.get("quantity") as string;
  const estimated_cost = formData.get("estimated_cost") as string;
  const submittedAssetCategory = formData.get("asset_category") as string;
  const itemName = formData.get("item_name") as string;
  const electronicsSubcategory = formData.get("electronics_subcategory") as string;
  const justification = formData.get("justification") as string;
  const files = formData.getAll("files") as File[];

  const needsCost = type !== "document_request" && type !== "per_diem" && type !== "electronics";
  const needsAssetDetails = ["physical_good", "electronics", "other_asset"].includes(type);
  const assetCategory = type === "electronics"
    ? "electronics"
    : submittedAssetCategory || "other";

  if (!type || !title) {
    return NextResponse.json(
      { error: "Type and title are required" },
      { status: 400 },
    );
  }

  if (!VALID_REQUEST_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Invalid request type" },
      { status: 400 },
    );
  }

  if (needsCost && !estimated_cost) {
    return NextResponse.json(
      { error: "Estimated cost is required for this request type" },
      { status: 400 },
    );
  }

  if (
    needsAssetDetails &&
    !["electronics", "furniture", "vehicle", "office_supplies", "other"].includes(
      type === "electronics" ? "electronics" : assetCategory,
    )
  ) {
    return NextResponse.json({ error: "Invalid asset category" }, { status: 400 });
  }
  if (type === "electronics" && !["tablet", "pc", "other"].includes(electronicsSubcategory)) {
    return NextResponse.json({ error: "Select an electronics type" }, { status: 400 });
  }
  if (needsAssetDetails && !itemName?.trim()) {
    return NextResponse.json({ error: "Item name is required for asset requests" }, { status: 400 });
  }
  if (needsAssetDetails && !justification?.trim()) {
    return NextResponse.json({ error: "Justification is required for asset requests" }, { status: 400 });
  }
  const requestedQuantity = Number(quantity || 1);
  if (needsAssetDetails && (!Number.isInteger(requestedQuantity) || requestedQuantity < 1)) {
    return NextResponse.json({ error: "Quantity must be a positive whole number" }, { status: 400 });
  }

  let canonicalItemName = (itemName || title).normalize("NFKC").trim().replace(/\s+/g, " ");
  if (needsAssetDetails) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    let itemQuery = serviceClient
      .from("assets")
      .select("item_name")
      .eq("category", assetCategory)
      .not("item_name", "is", null);
    if (type === "electronics") {
      itemQuery = itemQuery.eq("electronics_subcategory", electronicsSubcategory);
    }
    const { data: catalogItems, error: catalogError } = await itemQuery;
    if (catalogError) {
      return NextResponse.json({ error: catalogError.message }, { status: 500 });
    }
    const normalizedName = canonicalItemName.toLocaleLowerCase();
    const canonicalMatch = (catalogItems || []).find(
      (item) => item.item_name?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedName,
    );
    if (canonicalMatch?.item_name) canonicalItemName = canonicalMatch.item_name.trim().replace(/\s+/g, " ");
  }

  const { data: newRequest, error } = await supabase
    .from("requests")
    .insert({
      requester_id: user.id,
      type,
      title,
      description: description || null,
      quantity: needsAssetDetails ? requestedQuantity : needsCost ? (quantity ? Number(quantity) : 1) : null,
      estimated_cost: needsCost ? Number(estimated_cost) : 0,
      asset_category: needsAssetDetails ? assetCategory : null,
      item_name: needsAssetDetails ? canonicalItemName : null,
      electronics_subcategory: type === "electronics" ? electronicsSubcategory || null : null,
      justification: justification || null,
      status: "pending_manager",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upload attachments, if any
  for (const file of files) {
    if (!file || file.size === 0) continue;

    const filePath = `requests/${newRequest.id}/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
      });

    if (uploadError) {
      continue; // skip this file but don't fail the whole request
    }

    await supabase.from("attachments").insert({
      request_id: newRequest.id,
      file_url: filePath,
      uploaded_by: user.id,
    });
  }

  return NextResponse.json({ request: newRequest });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("requests")
    .select("*, attachments(*)")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const requestIds = (data || []).map((request) => request.id);
  const { data: requestAssets, error: requestAssetsError } = requestIds.length
    ? await serviceClient
        .from("request_assets")
        .select("id, request_id, fulfillment_mode, source, due_date, asset:assets(id, asset_tag, item_name, serial_number)")
        .in("request_id", requestIds)
    : { data: [], error: null };
  if (requestAssetsError) {
    return NextResponse.json({ error: requestAssetsError.message }, { status: 500 });
  }

  const assetsByRequest = new Map<string, RequestAssetRow[]>();
  for (const requestAsset of (requestAssets || []) as RequestAssetRow[]) {
    const linkedAssets = assetsByRequest.get(requestAsset.request_id) || [];
    linkedAssets.push(requestAsset);
    assetsByRequest.set(requestAsset.request_id, linkedAssets);
  }

  return NextResponse.json({
    requests: (data || []).map((request) => ({
      ...request,
      request_assets: assetsByRequest.get(request.id) || [],
    })),
  });
}
