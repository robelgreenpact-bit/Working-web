import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function calculateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffInDays = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffInDays + 1;
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
    .from("leave_requests")
    .select("*")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data });
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
  const startDate = body.start_date as string | undefined;
  const endDate = body.end_date as string | undefined;
  const reason = body.reason as string | undefined;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "Start date and end date are required" },
      { status: 400 },
    );
  }

  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  if (end < start) {
    return NextResponse.json(
      { error: "End date cannot be before start date" },
      { status: 400 },
    );
  }

  const daysCount = calculateDays(startDate, endDate);

  const { data: newRequest, error } = await supabase
    .from("leave_requests")
    .insert({
      requester_id: user.id,
      start_date: startDate,
      end_date: endDate,
      days_count: daysCount,
      reason: reason.trim(),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: newRequest });
}
