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

  const { data } = await supabase
    .from("asset_tag_sequence")
    .select("last_number")
    .eq("category", category)
    .single();

  const next = (data?.last_number || 0) + 1;

  await supabase
    .from("asset_tag_sequence")
    .update({ last_number: next })
    .eq("category", category);

  return `${prefix}${String(next).padStart(4, "0")}`;
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
      return { ...a, assignee_name: assigneeName };
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

 const assetTag = await generateAssetTag(supabase, category);

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
