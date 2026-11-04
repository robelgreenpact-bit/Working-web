import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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

export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("requests")
    .select(
      "*, approvals(decision, comment, role_at_time, created_at, approver_id)",
    )
    .in("status", ["approved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceClient = getServiceClient();
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

  const withDetails = await Promise.all(
    (data || []).map(async (req) => {
      const { data: requester } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", req.requester_id)
        .single();

      const approvalsWithNames = await Promise.all(
        (req.approvals || []).map(
          async (a: { approver_id: string; [key: string]: unknown }) => {
            const { data: approver } = await serviceClient
              .from("public_users")
              .select("name")
              .eq("id", a.approver_id)
              .single();
            return { ...a, approver };
          },
        ),
      );

      return {
        ...req,
        requester,
        approvals: approvalsWithNames,
        request_assets: assetsByRequest.get(req.id) || [],
      };
    }),
  );

  return NextResponse.json({ requests: withDetails });
}
