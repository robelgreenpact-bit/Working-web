import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const quantity = formData.get("quantity") as string;
  const estimated_cost = formData.get("estimated_cost") as string;
  const justification = formData.get("justification") as string;
  const files = formData.getAll("files") as File[];

  const needsCost = type !== "document_request";

  if (!type || !title) {
    return NextResponse.json(
      { error: "Type and title are required" },
      { status: 400 },
    );
  }

  if (needsCost && !estimated_cost) {
    return NextResponse.json(
      { error: "Estimated cost is required for this request type" },
      { status: 400 },
    );
  }

  const { data: newRequest, error } = await supabase
    .from("requests")
    .insert({
      requester_id: user.id,
      type,
      title,
      description: description || null,
      quantity: needsCost ? (quantity ? Number(quantity) : 1) : null,
      estimated_cost: needsCost ? Number(estimated_cost) : 0,
      justification: justification || null,
      status: "pending_manager",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upload attachments, if any
  for (const file of files) {
    if (!file || file.size === 0) continue;

    const filePath = `requests/${newRequest.id}/${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
      });

    if (uploadError) {
      continue; // skip this file but don't fail the whole request
    }

    await supabase.from("attachments").insert({
      request_id: newRequest.id,
      file_url: filePath,
      uploaded_by: user.id,
    });
  }

  return NextResponse.json({ request: newRequest });
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
    .from("requests")
    .select("*, attachments(*)")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data });
}
