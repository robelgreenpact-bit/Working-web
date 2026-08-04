import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requestRow, error } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !requestRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("public_users")
    .select("role")
    .eq("id", user.id)
    .single();

  const allowedRoles = ["manager", "finance", "admin"];
  if (requestRow.requester_id !== user.id && !allowedRoles.includes(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.56, 0.73, 0.42);

  page.drawRectangle({
    x: 40,
    y: height - 40,
    width: width - 80,
    height: 24,
    color: green,
  });
  page.drawText(
    requestRow.type === "per_diem" ? "Perdium Request" : "Request Details",
    {
      x: 60,
      y: height - 30,
      size: 16,
      font: fontBold,
      color: rgb(1, 1, 1),
    },
  );

  const descriptionLines = requestRow.description
    ? String(requestRow.description)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/\*\*/g, ""))
        .map((line) => line.replace(/^\*\s*/, ""))
        .map((line) => line.replace(/^\*+/, ""))
        .map((line) => line.replace(/\*+$/, ""))
        .map((line) => (line === "---" ? "--------------------------------" : line))
    : [];

  const lines = [
    `Date: ${requestRow.created_at ? new Date(requestRow.created_at).toLocaleDateString() : ""}`,
    `Title: ${requestRow.title || ""}`,
    `Type: ${requestRow.type || ""}`,
    "",
    ...descriptionLines,
  ];

  let y = height - 90;
  lines.forEach((line) => {
    if (line === "") {
      y -= 12;
      return;
    }
    page.drawText(line, {
      x: 50,
      y,
      size: 11,
      font: font,
    });
    y -= 16;
  });

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="perdium-request-${id}.pdf"`,
    },
  });
}
