import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BRAND_GREEN = rgb(0.56, 0.73, 0.42);
const DARK_GREEN = rgb(0.12, 0.62, 0.35);
const ORANGE_RED = rgb(1, 0.4, 0.2);
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

  const serviceClient = getServiceClient();

  const { data: pr, error } = await serviceClient
    .from("payment_requests")
    .select("*, payment_request_items(*)")
    .eq("id", id)
    .single();

  if (error || !pr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: requester } = await serviceClient
    .from("public_users")
    .select("name")
    .eq("id", pr.created_by)
    .single();

  const items = pr.payment_request_items || [];
  const subtotal = items.reduce(
    (sum: number, it: { qty: number; unit_price: number }) =>
      sum + it.qty * it.unit_price,
    0,
  );
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const dateStr = pr.required_date
    ? new Date(pr.required_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date(pr.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const priorities = ["emergency", "urgent", "regular"];

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;

  // Top green bar
  page.drawRectangle({
    x: 50,
    y: y - 10,
    width: width - 100,
    height: 20,
    color: BRAND_GREEN,
  });
  y -= 40;

  // Company name
  page.drawText("Greenpact Research Solutions", {
    x: width / 2 - 100,
    y,
    size: 22,
    font: fontBold,
    color: DARK_GREEN,
  });
  y -= 40;

  // Title bar
  page.drawRectangle({
    x: 50,
    y: y - 10,
    width: width - 100,
    height: 30,
    color: BRAND_GREEN,
  });
  page.drawText("Purchase Request Authorization Form", {
    x: width / 2 - 120,
    y: y + 5,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("( This form is for any Service and Goods purchase request )", {
    x: width / 2 - 130,
    y: y - 10,
    size: 10,
    font: font,
    color: rgb(1, 1, 1),
  });
  y -= 50;

  // Info fields
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
    y -= 30;
  };

  drawField("Date:", dateStr);
  drawField("PR Number:", pr.pr_number);
  drawField("Requestor Name:", requester?.name || "Unknown");
  drawField("Project Name:", pr.project_class || "");
  drawField("Purpose:", pr.activity_line || "");
  y -= 15;

  // Vendor and priority boxes
  page.drawRectangle({
    x: 50,
    y: y - 60,
    width: 200,
    height: 60,
    borderColor: GRAY,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 260,
    y: y - 60,
    width: width - 310,
    height: 60,
    borderColor: GRAY,
    borderWidth: 1,
  });

  page.drawText("SUGGESTED VENDOR(S):", {
    x: 55,
    y: y - 10,
    size: 10,
    font: fontBold,
  });
  page.drawText(pr.suggested_vendor || "", {
    x: 55,
    y: y - 30,
    size: 10,
    font: font,
  });

  page.drawText("SUPPLY PRIORITY:", {
    x: 265,
    y: y - 10,
    size: 10,
    font: fontBold,
  });
  priorities.forEach((p, i) => {
    const checked = pr.supply_priority === p ? "[X]" : "[ ]";
    page.drawText(`${checked} ${p.charAt(0).toUpperCase() + p.slice(1)}`, {
      x: 265,
      y: y - 30 - i * 12,
      size: 10,
      font: font,
    });
  });
  y -= 80;

  // Items table header
  const tableX = 50;
  const colWidths = [80, 80, 40, 30, 50, 50];
  const rowHeight = 20;

  page.drawRectangle({
    x: tableX,
    y: y - rowHeight,
    width: width - 100,
    height: rowHeight,
    color: BRAND_GREEN,
  });

  const headers = ["Item Name", "Description", "Unit", "Qty", "Unit price", "Total price"];
  let headerX = tableX + 5;
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: headerX,
      y: y - rowHeight + 5,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    headerX += colWidths[i];
  });
  y -= rowHeight;

  // Items
  items.forEach((it: any) => {
    page.drawRectangle({
      x: tableX,
      y: y - rowHeight,
      width: width - 100,
      height: rowHeight,
      borderColor: GRAY,
      borderWidth: 1,
    });

    const values = [
      it.item_name,
      it.description || "",
      it.unit || "",
      String(it.qty),
      it.unit_price.toFixed(2),
      it.total_price.toFixed(2),
    ];
    let valueX = tableX + 5;
    values.forEach((val, j) => {
      const truncated = val.length > 15 ? val.substring(0, 15) + "..." : val;
      page.drawText(truncated, {
        x: valueX,
        y: y - rowHeight + 5,
        size: 8,
        font: font,
      });
      valueX += colWidths[j];
    });
    y -= rowHeight;
  });

  y -= 20;

  // Totals
  const totalsX = width - 150;
  page.drawText("Subtotal:", { x: totalsX, y, size: 12, font: fontBold });
  page.drawText(subtotal.toFixed(2), { x: totalsX + 60, y, size: 12, font: font });
  y -= 15;

  page.drawText("VAT(15%):", { x: totalsX, y, size: 12, font: fontBold });
  page.drawText(vat.toFixed(2), { x: totalsX + 60, y, size: 12, font: font });
  y -= 15;

  page.drawText("Total:", { x: totalsX, y, size: 12, font: fontBold, color: rgb(0.75, 0, 0) });
  page.drawText(total.toFixed(2), { x: totalsX + 60, y, size: 12, font: fontBold, color: rgb(0.75, 0, 0) });
  y -= 30;

  // Note
  page.drawRectangle({
    x: 50,
    y: y - 20,
    width: 100,
    height: 20,
    borderColor: GRAY,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 155,
    y: y - 20,
    width: width - 205,
    height: 20,
    borderColor: GRAY,
    borderWidth: 1,
  });
  page.drawText("Note /Comment:", { x: 55, y: y - 5, size: 10, font: fontBold });
  page.drawText(pr.decision_comment || "", { x: 160, y: y - 5, size: 10, font: font });
  y -= 40;

  // Signatures
  page.drawText("Requested By:", { x: 50, y, size: 12, font: fontBold });
  page.drawText(requester?.name || "", { x: 130, y, size: 12, font: font });
  page.drawText("Approved by:", { x: 300, y, size: 12, font: fontBold });
  page.drawText("Solomon Bizuayehu", { x: 380, y, size: 12, font: font });
  y -= 20;

  page.drawText("Signature:", { x: 50, y, size: 12, font: fontBold });
  page.drawRectangle({ x: 130, y: y - 15, width: 100, height: 15, borderColor: GRAY, borderWidth: 1 });
  page.drawText("Signature:", { x: 300, y, size: 12, font: fontBold });
  page.drawRectangle({ x: 380, y: y - 15, width: 100, height: 15, borderColor: GRAY, borderWidth: 1 });
  y -= 20;

  page.drawText("Date:", { x: 50, y, size: 12, font: fontBold });
  page.drawRectangle({ x: 130, y: y - 15, width: 100, height: 15, borderColor: GRAY, borderWidth: 1 });
  page.drawText("Date:", { x: 300, y, size: 12, font: fontBold });
  page.drawRectangle({ x: 380, y: y - 15, width: 100, height: 15, borderColor: GRAY, borderWidth: 1 });
  y -= 40;

  // Footer at bottom of page with three-section layout
  const footerY = 70;
  const footerStartX = 50;
  const footerWidth = width - 100;
  
  // Load and embed logo image
  let logoImage;
  try {
    const logoUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/logo.png`;
    const logoResponse = await fetch(logoUrl);
    const logoBuffer = await logoResponse.arrayBuffer();
    logoImage = await pdfDoc.embedPng(logoBuffer);
  } catch (error) {
    console.error('Failed to load logo:', error);
  }
  
  // First vertical divider (after logo section)
  const divider1X = footerStartX + 200;
  page.drawLine({
    start: { x: divider1X, y: footerY + 35 },
    end: { x: divider1X, y: footerY - 25 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Second vertical divider (after address section)
  const divider2X = footerStartX + 380;
  page.drawLine({
    start: { x: divider2X, y: footerY + 35 },
    end: { x: divider2X, y: footerY - 25 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Left Section - Logo image
  if (logoImage) {
    const logoDims = logoImage.scale(0.15);
    page.drawImage(logoImage, {
      x: footerStartX + 10,
      y: footerY - 10,
      width: logoDims.width,
      height: logoDims.height,
    });
  } else {
    // Fallback if logo fails to load
    page.drawText("Logo", {
      x: footerStartX + 30,
      y: footerY + 10,
      size: 12,
      font: font,
      color: GRAY,
    });
  }
  
  // Middle Section - Addresses
  const addressX = divider1X + 15;
  page.drawText("Address 1", {
    x: addressX,
    y: footerY + 25,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Kebele 01, Bahir Dar, Ethiopia", {
    x: addressX,
    y: footerY + 12,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Address 2", {
    x: addressX,
    y: footerY - 2,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Yeka subcity, woreda 09,", {
    x: addressX,
    y: footerY - 15,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Addis Ababa, Ethiopia", {
    x: addressX,
    y: footerY - 27,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  // Right Section - Contact Info
  const contactX = divider2X + 15;
  const labelX = contactX;
  const valueX = contactX + 80;
  
  page.drawText("PHONE 1", {
    x: labelX,
    y: footerY + 25,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("+251939965895", {
    x: valueX,
    y: footerY + 25,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  page.drawText("EMAIL", {
    x: labelX,
    y: footerY + 10,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("info@greenpactconsulting.com", {
    x: valueX,
    y: footerY + 10,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  page.drawText("WEBSITE", {
    x: labelX,
    y: footerY - 5,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("www.greenpactconsulting.com", {
    x: valueX,
    y: footerY - 5,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="GP_PR_${pr.pr_number}_${new Date(
        pr.created_at,
      )
        .toISOString()
        .slice(0, 10)}.pdf"`,
    },
  });
}
