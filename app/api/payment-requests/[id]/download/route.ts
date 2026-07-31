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
  const total = items.reduce(
    (sum: number, it: { qty: number; unit_price: number }) =>
      sum + it.qty * it.unit_price,
    0,
  );

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

  // Description section with text wrapping
  const description = pr.title || "";
  if (description) {
    page.drawText("Description:", {
      x: 50,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 15;
    
    // Calculate needed height for description
    const maxWidth = width - 120;
    const lineHeight = 12;
    const words = description.split(' ');
    let currentLine = '';
    let lineCount = 0;
    
    // First pass: count lines needed
    words.forEach((word: string) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 10);
      
      if (testWidth > maxWidth && currentLine) {
        lineCount++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lineCount++;
    
    const descBoxHeight = Math.max(40, (lineCount + 1) * lineHeight);
    
    // Draw description box
    page.drawRectangle({
      x: 50,
      y: y - descBoxHeight,
      width: width - 100,
      height: descBoxHeight,
      borderColor: GRAY,
      borderWidth: 1,
    });
    
    // Wrap text within the box
    currentLine = '';
    let currentLineIndex = 0;
    
    words.forEach((word: string) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 10);
      
      if (testWidth > maxWidth && currentLine) {
        page.drawText(currentLine, {
          x: 60,
          y: y - 10 - (currentLineIndex * lineHeight),
          size: 10,
          font: font,
        });
        currentLineIndex++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) {
      page.drawText(currentLine, {
        x: 60,
        y: y - 10 - (currentLineIndex * lineHeight),
        size: 10,
        font: font,
      });
    }
    
    y -= descBoxHeight + 10;
  }

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

  page.drawText("Reciver", {
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
  const colWidths = [80, 150, 40, 30, 50, 50];
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
    // Calculate row height based on description length
    const descText = it.description || "";
    const descMaxWidth = 150;
    const descWords = descText.split(' ');
    let descLineCount = 0;
    let currentLine = '';
    
    descWords.forEach((word: string) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 8);
      if (testWidth > descMaxWidth && currentLine) {
        descLineCount++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) descLineCount++;
    
    const itemRowHeight = Math.max(20, (descLineCount + 1) * 10);
    
    page.drawRectangle({
      x: tableX,
      y: y - itemRowHeight,
      width: width - 100,
      height: itemRowHeight,
      borderColor: GRAY,
      borderWidth: 1,
    });

    // Draw item name (truncated if needed)
    const itemName = it.item_name.length > 15 ? it.item_name.substring(0, 15) + "..." : it.item_name;
    page.drawText(itemName, {
      x: tableX + 5,
      y: y - itemRowHeight + 10,
      size: 8,
      font: font,
    });
    
    // Draw description with wrapping
    let descY = y - itemRowHeight + 10;
    currentLine = '';
    descWords.forEach((word: string) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 8);
      if (testWidth > descMaxWidth && currentLine) {
        page.drawText(currentLine, {
          x: tableX + 85,
          y: descY,
          size: 8,
          font: font,
        });
        descY -= 10;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) {
      page.drawText(currentLine, {
        x: tableX + 85,
        y: descY,
        size: 8,
        font: font,
      });
    }
    
    // Draw other columns
    page.drawText(it.unit || "", {
      x: tableX + 235,
      y: y - itemRowHeight + 10,
      size: 8,
      font: font,
    });
    page.drawText(String(it.qty), {
      x: tableX + 275,
      y: y - itemRowHeight + 10,
      size: 8,
      font: font,
    });
    page.drawText(it.unit_price.toFixed(2), {
      x: tableX + 305,
      y: y - itemRowHeight + 10,
      size: 8,
      font: font,
    });
    page.drawText(it.total_price.toFixed(2), {
      x: tableX + 355,
      y: y - itemRowHeight + 10,
      size: 8,
      font: font,
    });
    
    y -= itemRowHeight;
  });

  y -= 20;

  // Totals
  const totalsX = width - 150;
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
  page.drawText("Note /Comment:", { x: 55, y: y - 8, size: 10, font: fontBold });
  page.drawText(pr.decision_comment || "", { x: 160, y: y - 8, size: 10, font: font });
  y -= 40;

  // Signatures
  page.drawText("Requested By: ", { x: 50, y, size: 12, font: fontBold });
  page.drawText(requester?.name || "", { x: 145, y, size: 12, font: font });
  page.drawText("Approved by: ", { x: 300, y, size: 12, font: fontBold });
  page.drawText("Solomon Bizuayehu", { x: 395, y, size: 12, font: font });
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

  // Black thin line separator between body and footer
  page.drawLine({
    start: { x: 30, y: y + 10 },
    end: { x: width - 30, y: y + 10 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Footer at bottom of page with three-section layout
  const footerY = 70;
  const footerStartX = 30;
  const footerWidth = width - 60;
  
  // Load and embed logo image from filesystem
  let logoImage;
  try {
    const fs = require('fs');
    const path = require('path');
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoImage = await pdfDoc.embedPng(logoBuffer);
    }
  } catch (error) {
    console.error('Failed to load logo:', error);
  }
  
  // First vertical divider (after logo section)
  const divider1X = footerStartX + 140;
  page.drawLine({
    start: { x: divider1X, y: footerY + 30 },
    end: { x: divider1X, y: footerY - 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Second vertical divider (after address section)
  const divider2X = footerStartX + 280;
  page.drawLine({
    start: { x: divider2X, y: footerY + 30 },
    end: { x: divider2X, y: footerY - 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Left Section - Logo image
  if (logoImage) {
    const logoDims = logoImage.scale(0.06);
    page.drawImage(logoImage, {
      x: footerStartX + 10,
      y: footerY - 5,
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
  const addressX = divider1X + 10;
  page.drawText("Address 1", {
    x: addressX,
    y: footerY + 20,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Kebele 01, Bahir Dar, Ethiopia", {
    x: addressX,
    y: footerY + 10,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Address 2", {
    x: addressX,
    y: footerY - 2,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("Yeka subcity, woreda 09,", {
    x: addressX,
    y: footerY - 12,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Addis Ababa, Ethiopia", {
    x: addressX,
    y: footerY - 22,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  // Right Section - Contact Info
  const contactX = divider2X + 10;
  const labelX = contactX;
  const valueX = contactX + 60;
  
  page.drawText("PHONE 1", {
    x: labelX,
    y: footerY + 20,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("+251939965895", {
    x: valueX,
    y: footerY + 20,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  page.drawText("EMAIL", {
    x: labelX,
    y: footerY + 8,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("info@greenpactconsulting.com", {
    x: valueX,
    y: footerY + 8,
    size: 8,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  page.drawText("WEBSITE", {
    x: labelX,
    y: footerY - 4,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("www.greenpactconsulting.com", {
    x: valueX,
    y: footerY - 4,
    size: 8,
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
