import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("asset_loan_requests")
    .select(
      "*, items:asset_loans(id, asset_id, status, due_date, borrowed_at, returned_at, return_condition, return_note, return_requested_at, asset:assets(asset_tag, item_name, category, serial_number, location, status))",
    )
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const loans = (data || []).map((request) => ({
    ...request,
    items: (request.items || []).map((item: { status: string; due_date: string | null }) => ({
      ...item,
      status:
        item.status === "issued" && item.due_date && item.due_date < new Date().toISOString().slice(0, 10)
          ? "overdue"
          : item.status,
    })),
  }));

  return NextResponse.json({ requests: loans });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { asset_ids, purpose, due_date } = body;
  if (!Array.isArray(asset_ids) || !purpose || !due_date) {
    return NextResponse.json(
      { error: "Select assets, provide a purpose, and choose a due date" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("create_asset_loan_request", {
    p_asset_ids: asset_ids,
    p_purpose: purpose,
    p_due_date: due_date,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ request_id: data });
}