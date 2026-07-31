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
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withUrls = await Promise.all(
    (data || []).map(async (r) => {
      if (!r.file_url) return { ...r, signed_url: null };
      const { data: signedData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(r.file_url, 60 * 10);
      return { ...r, signed_url: signedData?.signedUrl || null };
    }),
  );

  return NextResponse.json({ receipts: withUrls });
}

export async function POST(request: Request) {
  const supabase = await createClient();

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

  const formData = await request.formData();
  const invoice_no = formData.get("invoice_no") as string;
  const payment_date = formData.get("payment_date") as string;
  const payer_name = formData.get("payer_name") as string;
  const credited_party_name = formData.get("credited_party_name") as string;
  const amount = formData.get("amount") as string;
  const payment_reason = formData.get("payment_reason") as string;
  const file = formData.get("file") as File | null;

  if (!amount) {
    return NextResponse.json({ error: "Amount is required" }, { status: 400 });
  }

  let file_url: string | null = null;

  if (file && file.size > 0) {
    const filePath = `receipts/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, { contentType: file.type });

    if (!uploadError) {
      file_url = filePath;
    }
  }

  const { error } = await supabase.from("receipts").insert({
    invoice_no: invoice_no || null,
    payment_date: payment_date || null,
    payer_name: payer_name || null,
    credited_party_name: credited_party_name || null,
    amount: Number(amount),
    payment_reason: payment_reason || null,
    file_url,
    registered_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
