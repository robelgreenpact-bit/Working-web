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

function calculateDaysInMonth(startDate: string, endDate: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  const overlapStart = start > monthStart ? start : monthStart;
  const overlapEnd = end < monthEnd ? end : monthEnd;

  if (overlapEnd < overlapStart) {
    return 0;
  }

  const diffInDays = Math.round(
    (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffInDays + 1;
}

function calculateDaysInYear(startDate: string, endDate: string, year: number) {
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  const yearEnd = new Date(`${year}-12-31T00:00:00`);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  const overlapStart = start > yearStart ? start : yearStart;
  const overlapEnd = end < yearEnd ? end : yearEnd;

  if (overlapEnd < overlapStart) {
    return 0;
  }

  const diffInDays = Math.round(
    (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24),
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

  const requests = data || [];
  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const approvedDays = requests.reduce((sum: number, request: { status: string; start_date: string; end_date: string }) => {
    if (request.status !== "approved") {
      return sum;
    }
    return sum + calculateDaysInMonth(request.start_date, request.end_date);
  }, 0);

  const pendingDays = requests.reduce((sum: number, request: { status: string; start_date: string; end_date: string }) => {
    if (request.status !== "pending") {
      return sum;
    }
    return sum + calculateDaysInMonth(request.start_date, request.end_date);
  }, 0);

  return NextResponse.json({
    requests,
    monthly_summary: {
      month: monthLabel,
      approved_days: approvedDays,
      pending_days: pendingDays,
      total_days: approvedDays + pendingDays,
    },
  });
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

  if (daysCount > 30) {
    return NextResponse.json(
      { error: "Leave requests cannot exceed 30 days in a year" },
      { status: 400 },
    );
  }

  const requestYear = new Date(`${startDate}T00:00:00`).getFullYear();
  const { data: existingRequests, error: existingError } = await supabase
    .from("leave_requests")
    .select("start_date, end_date, status")
    .eq("requester_id", user.id)
    .in("status", ["approved", "pending"]);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const usedDaysInYear = (existingRequests || []).reduce((sum: number, request: { start_date: string; end_date: string; status: string }) => {
    if (request.status === "rejected") {
      return sum;
    }

    return sum + calculateDaysInYear(request.start_date, request.end_date, requestYear);
  }, 0);

  if (usedDaysInYear + daysCount > 30) {
    return NextResponse.json(
      { error: "You can only have up to 30 leave days in a year" },
      { status: 400 },
    );
  }

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
