import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GET() {
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

  if (!profile || !["admin", "finance", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: assets, error } = await supabase
    .from("assets")
    .select("asset_tag, category, item_name, serial_number")
    .is("borrowed_by", null)
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inventoryMap = new Map<string, {
    category: string;
    item_name: string;
    available_count: number;
  }>();

  for (const asset of assets || []) {
    const key = `${asset.category || "other"}-${asset.item_name || "unnamed"}`;

    if (!inventoryMap.has(key)) {
      inventoryMap.set(key, {
        category: asset.category || "other",
        item_name: asset.item_name,
        available_count: 0,
      });
    }

    const item = inventoryMap.get(key)!;
    item.available_count++;
  }

  const inventory = Array.from(inventoryMap.values());

  return NextResponse.json({ inventory, assets: assets || [] });
}
