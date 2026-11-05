import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const VALID_CATEGORIES = [
  "electronics",
  "furniture",
  "vehicle",
  "office_supplies",
  "other",
];

const VALID_ELECTRONICS_TYPES = ["tablet", "pc", "other"];

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

export async function GET(request: Request) {
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

    const params = new URL(request.url).searchParams;

    const category = (params.get("category") || "")
      .trim()
      .toLowerCase();

    // Keep the existing parameter name and accept the explicit
    // database field name for compatibility with other pages.
    const subcategoryParam = (params.get("subcategory") || "")
      .trim()
      .toLowerCase();

    const electronicsTypeParam = (
      params.get("electronics_subcategory") || ""
    )
      .trim()
      .toLowerCase();

    if (
      subcategoryParam &&
      electronicsTypeParam &&
      subcategoryParam !== electronicsTypeParam
    ) {
      return NextResponse.json(
        { error: "Conflicting electronics types were provided." },
        { status: 400 },
      );
    }

    const subcategory =
      subcategoryParam || electronicsTypeParam;

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Select a valid category." },
        { status: 400 },
      );
    }

    if (subcategory && category !== "electronics") {
      return NextResponse.json(
        {
          error:
            "Electronics type can only be used with the electronics category.",
        },
        { status: 400 },
      );
    }

    if (
      subcategory &&
      !VALID_ELECTRONICS_TYPES.includes(subcategory)
    ) {
      return NextResponse.json(
        { error: "Select Tablet, PC, or Other electronics." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();
    const namesByNormalizedValue = new Map<string, string>();

    const pageSize = 500;
    let offset = 0;

    while (true) {
      let query = serviceClient
        .from("assets")
        .select("item_name")
        .eq("category", category)
        .not("item_name", "is", null)
        .order("item_name", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (category === "electronics" && subcategory) {
        query = query.eq(
          "electronics_subcategory",
          subcategory,
        );
      }

      // No availability filter: workers can request registered
      // items even when all matching devices are unavailable.
      const { data, error } = await query;

      if (error) {
        return NextResponse.json(
          {
            error:
              "Unable to load registered item names. Please try again.",
          },
          { status: 500 },
        );
      }

      for (const row of data || []) {
        const name =
          typeof row.item_name === "string"
            ? row.item_name.trim()
            : "";

        if (!name) continue;

        // Match the normalization used by finance assignment.
        const normalizedName = name.toLowerCase();

        if (!namesByNormalizedValue.has(normalizedName)) {
          namesByNormalizedValue.set(normalizedName, name);
        }
      }

      if ((data || []).length < pageSize) break;

      offset += pageSize;
    }

    const itemNames = Array.from(
      namesByNormalizedValue.values(),
    ).sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );

    return NextResponse.json(
      {
        item_names: itemNames,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load item names. Please try again." },
      { status: 500 },
    );
  }
}