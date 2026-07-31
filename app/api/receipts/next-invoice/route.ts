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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServiceClient();

  const { data } = await serviceClient
    .from("receipt_number_sequence")
    .select("last_number")
    .eq("id", 1)
    .single();

  const next = (data?.last_number || 0) + 1;

  await serviceClient
    .from("receipt_number_sequence")
    .update({ last_number: next })
    .eq("id", 1);

  const padded = String(next).padStart(4, "0");

  return NextResponse.json({ invoiceNo: padded });
}
