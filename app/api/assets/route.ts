import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
const categoryPrefixes: Record<string, string> = {
  electronics: "GPEL",
  furniture: "GPFU",
  vehicle: "GPVE",
  office_supplies: "GPOF",
  other: "GPOT",
};

async function generateAssetTag(
  supabase: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  category: string,
) {
  const prefix = categoryPrefixes[category] || "GPOT";

  // Query the highest existing asset tag for this category
  const { data: existingAssets } = await supabase
    .from("assets")
    .select("asset_tag")
    .eq("category", category)
    .like("asset_tag", `${prefix}%`)
    .order("asset_tag", { ascending: false })
    .limit(1);

  let nextNumber = 1;

  if (existingAssets && existingAssets.length > 0) {
    const lastTag = existingAssets[0].asset_tag;
    const lastNumber = parseInt(lastTag.replace(prefix, ""), 10);
    nextNumber = lastNumber + 1;
  }

  // Update the sequence table for tracking
  await supabase
    .from("asset_tag_sequence")
    .upsert({ category, last_number: nextNumber }, { onConflict: "category" });

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: assets, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = getServiceClient();
  const assetsWithNames = await Promise.all(
    (assets || []).map(async (a) => {
      let assigneeName = null;
      if (a.assigned_to) {
        const { data: assignee } = await serviceClient
          .from("public_users")
          .select("name")
          .eq("id", a.assigned_to)
          .single();
        assigneeName = assignee?.name || null;
      }

      let borrowerName = null;
      if (a.borrowed_by) {
        const { data: borrower } = await serviceClient
          .from("public_users")
          .select("name")
          .eq("id", a.borrowed_by)
          .single();
        borrowerName = borrower?.name || null;
      }

      return { ...a, assignee_name: assigneeName, borrower_name: borrowerName };
    }),
  );

  return NextResponse.json({ assets: assetsWithNames });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "finance"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    category,
    item_name,
    assigned_to,
    purchase_cost,
    purchase_date,
    status,
    location,
  } = body;

  if (!category) {
    return NextResponse.json(
      { error: "Category is required" },
      { status: 400 },
    );
  }

  let assetTag = await generateAssetTag(supabase, category);
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const { error } = await supabase.from("assets").insert({
      asset_tag: assetTag,
      category,
      item_name: item_name || null,
      assigned_to: assigned_to || null,
      purchase_cost: purchase_cost || null,
      purchase_date: purchase_date || null,
      status: status || "in_use",
      location: location || null,
    });

    if (error) {
      if (error.code === "23505") {
        // Duplicate key error - generate a new tag and retry
        attempts++;
        assetTag = await generateAssetTag(supabase, category);
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Failed to generate unique asset tag after multiple attempts" },
    { status: 500 },
  );
}
