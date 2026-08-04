import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const BRAND_GREEN = rgb(0.56, 0.73, 0.42);
const DARK_GREEN = rgb(0.12, 0.62, 0.35);
const GRAY = rgb(0.4, 0.4, 0.4);

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

  let y = height - 50;

  page.drawRectangle({
    x: 50,
    y: y - 10,
    width: width - 100,
    height: 20,
    color: BRAND_GREEN,
  });
  y -= 40;

  page.drawText("Greenpact Research Solutions", {
    x: width / 2 - 100,
    y,
    size: 22,
    font: fontBold,
    color: DARK_GREEN,
  });
  y -= 40;

  page.drawRectangle({
    x: 50,
    y: y - 10,
    width: width - 100,
    height: 30,
    color: BRAND_GREEN,
  });
  page.drawText("Per Diem Request Form", {
    x: width / 2 - 90,
    y: y + 5,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  y -= 50;

  const drawField = (label: string, value: string) => {
    page.drawText(label, {
      x: 50,
      y,
      size: 11,
      font: fontBold,
    });
    page.drawText(value, {
      x: 160,
      y,
      size: 11,
      font: font,
    });
    y -= 24;
  };

  drawField("Date:", requestRow.created_at ? new Date(requestRow.created_at).toLocaleDateString() : "");
  drawField("Title:", requestRow.title || "");
  drawField("Type:", requestRow.type || "");
  y -= 10;

  const descriptionText = requestRow.description
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

  const ignoredLines = new Set([
    "Perdium Request",
    "Per Diem Request",
    "Date:",
    "Title of Form: Field Allowance Evidence Form for Deploying Employees",
    "Main Table (Employee Details)",
    "Field Label (Left Column) | Field/Status (Right Column)",
    "Approval and Signatures Table",
    "Requester's Name & Signature | Reviewer's Name & Signature | Approver's Name & Signature",
    "Report Section",
    "Brief Report of the activities completed",
    "--------------------------------",
    "---",
    "Requester's Name & Signature",
    "Reviewer's Name & Signature",
    "Approver's Name & Signature",
    "Employee's Name",
    "Perdium amount",
    "Field Deployment Location",
    "Field Deployment Date",
    "Date Returned from Deployment",
    "Number of Days",
    "Payable / Total Amount Due",
  ]);

  const cleanedDescriptionText = descriptionText.filter((line) => !ignoredLines.has(line));

  if (cleanedDescriptionText.length > 0) {
    page.drawText("Submitted Details:", {
      x: 50,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 12;

    const tableX = 50;
    const leftColWidth = 180;
    const rowHeight = 18;

    page.drawRectangle({
      x: tableX,
      y: y - rowHeight,
      width: width - 100,
      height: rowHeight,
      color: BRAND_GREEN,
    });
    page.drawText("Field", {
      x: tableX + 8,
      y: y - rowHeight + 5,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Value", {
      x: tableX + leftColWidth + 8,
      y: y - rowHeight + 5,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    y -= rowHeight;

    const rows = cleanedDescriptionText
      .map((line) => {
        if (line.includes("|")) {
          const [left, right] = line.split("|");
          return [left.trim(), right?.trim() || ""];
        }
        const parts = line.split(":");
        if (parts.length >= 2) {
          return [parts[0].trim(), parts.slice(1).join(":").trim()];
        }
        return [line, ""];
      })
      .filter(([left, right]) => left && right);

    rows.forEach(([left, right]) => {
      const currentY = y - rowHeight;
      page.drawRectangle({
        x: tableX,
        y: currentY,
        width: width - 100,
        height: rowHeight,
        borderColor: GRAY,
        borderWidth: 1,
      });
      page.drawText(left || "", {
        x: tableX + 8,
        y: currentY + 5,
        size: 8.5,
        font: fontBold,
      });
      page.drawText(right || "", {
        x: tableX + leftColWidth + 8,
        y: currentY + 5,
        size: 8.5,
        font: font,
      });
      y -= rowHeight;
    });
  }

  y -= 20;

  const reportText = requestRow.description
    ? String(requestRow.description)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/\*\*/g, ""))
        .map((line) => line.replace(/^\*\s*/, ""))
        .map((line) => line.replace(/^\*+/, ""))
        .map((line) => line.replace(/\*+$/, ""))
        .filter((line) => !ignoredLines.has(line))
        .filter((line) => !line.toLowerCase().includes("brief report") && !line.toLowerCase().includes("activities completed"))
        .filter((line) => !line.includes("|") && !line.includes(":"))
    : [];

  if (reportText.length > 0) {
    page.drawText("Brief Report of the activities completed", {
      x: 50,
      y,
      size: 12,
      font: fontBold,
    });
    y -= 14;

    const maxWidth = width - 120;
    const words = reportText.join(" ").split(/\s+/);
    let currentLine = "";
    const lines: string[] = [];

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, 10);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    lines.forEach((line) => {
      page.drawText(line, {
        x: 60,
        y,
        size: 10,
        font: font,
      });
      y -= 12;
    });
  }

  y -= 20;

  const footerY = 70;
  const footerStartX = 30;
  const divider1X = footerStartX + 140;
  const divider2X = footerStartX + 280;

  page.drawLine({
    start: { x: 30, y: footerY + 30 },
    end: { x: width - 30, y: footerY + 30 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: divider1X, y: footerY + 30 },
    end: { x: divider1X, y: footerY - 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: divider2X, y: footerY + 30 },
    end: { x: divider2X, y: footerY - 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawText("Address 1", {
    x: divider1X + 10,
    y: footerY + 20,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Kebele 01, Bahir Dar, Ethiopia", {
    x: divider1X + 10,
    y: footerY + 10,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Address 2", {
    x: divider1X + 10,
    y: footerY - 2,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Yeka subcity, woreda 09,", {
    x: divider1X + 10,
    y: footerY - 12,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Addis Ababa, Ethiopia", {
    x: divider1X + 10,
    y: footerY - 22,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });

  page.drawText("PHONE 1", {
    x: divider2X + 10,
    y: footerY + 20,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("+251939965895", {
    x: divider2X + 70,
    y: footerY + 20,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });

  page.drawText("EMAIL", {
    x: divider2X + 10,
    y: footerY + 8,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("info@greenpactconsulting.com", {
    x: divider2X + 70,
    y: footerY + 8,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });

  page.drawText("WEBSITE", {
    x: divider2X + 10,
    y: footerY - 4,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("www.greenpactconsulting.com", {
    x: divider2X + 70,
    y: footerY - 4,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="perdium-request-${id}.pdf"`,
    },
  });
}
