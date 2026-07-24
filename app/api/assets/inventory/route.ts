import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createServerClient();
  const serviceClient = getServiceClient();

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

  if (!profile || !["admin", "finance", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all assets
  const { data: assets, error } = await supabase
    .from("assets")
    .select("category, item_name, borrowed_by")
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by category and item_name
  const inventoryMap = new Map<string, {
    category: string;
    item_name: string;
    total_count: number;
    available_count: number;
    borrowed_count: number;
    borrowed_by: string[];
  }>();

  for (const asset of assets || []) {
    const key = `${asset.category}-${asset.item_name || "unnamed"}`;
    
    if (!inventoryMap.has(key)) {
      inventoryMap.set(key, {
        category: asset.category,
        item_name: asset.item_name,
        total_count: 0,
        available_count: 0,
        borrowed_count: 0,
        borrowed_by: [],
      });
    }

    const item = inventoryMap.get(key)!;
    item.total_count++;

    if (asset.borrowed_by) {
      item.borrowed_count++;
      // Get borrower name
      const { data: borrower } = await serviceClient
        .from("public_users")
        .select("name")
        .eq("id", asset.borrowed_by)
        .single();
      
      if (borrower?.name && !item.borrowed_by.includes(borrower.name)) {
        item.borrowed_by.push(borrower.name);
      }
    } else {
      item.available_count++;
    }
  }

  const inventory = Array.from(inventoryMap.values());

  return NextResponse.json({ inventory });
}
