import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const category = params.get("category");
  const subcategory = params.get("subcategory");
  if (!category) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("assets")
    .select("item_name")
    .eq("category", category)
    .not("item_name", "is", null)
    .order("item_name", { ascending: true });
  if (category === "electronics" && subcategory) {
    query = query.eq("electronics_subcategory", subcategory);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const namesByNormalizedValue = new Map<string, string>();
  for (const row of data || []) {
    const name = row.item_name?.trim();
    if (name && !namesByNormalizedValue.has(name.toLocaleLowerCase())) {
      namesByNormalizedValue.set(name.toLocaleLowerCase(), name);
    }
  }

  return NextResponse.json({ item_names: [...namesByNormalizedValue.values()] });
}
