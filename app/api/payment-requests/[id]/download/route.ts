import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
// @ts-ignore
import { jsPDF } from "jspdf";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BRAND_GREEN = "#8FBC6B";
const DARK_GREEN = "#1E9E5A";

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

  // Create PDF document using jsPDF
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  let y = margin;

  // Helper function for text
  const text = (str: string, x: number, y: number, options: any = {}) => {
    doc.setFontSize(options.size || 12);
    doc.setTextColor(options.color || "black");
    if (options.bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(str, x, y);
  };

  // Top green bar
  doc.setFillColor(143, 188, 107);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  y += 12;

  // Logo and company name
  text("Greenpact Research Solutions", pageWidth / 2, y + 10, {
    bold: true,
    size: 16,
    color: [30, 158, 90],
  });
  y += 30;

  // Title bar
  doc.setFillColor(143, 188, 107);
  doc.rect(margin, y, pageWidth - 2 * margin, 15, "F");
  text("Purchase Request Authorization Form", pageWidth / 2, y + 5, {
    bold: true,
    size: 14,
    color: [255, 255, 255],
  });
  text("( This form is for any Service and Goods purchase request )", pageWidth / 2, y + 10, {
    size: 9,
    color: [255, 255, 255],
  });
  y += 20;

  // Info fields
  text("Date:", margin, y, { bold: true });
  text(dateStr, margin + 30, y);
  y += 8;

  text("PR Number:", margin, y, { bold: true });
  text(pr.pr_number, margin + 30, y);
  y += 8;

  text("Requestor Name:", margin, y, { bold: true });
  text(requester?.name || "Unknown", margin + 30, y);
  y += 8;

  text("Project Name /Class:", margin, y, { bold: true });
  text(pr.project_class || "", margin + 30, y);
  y += 8;

  text("Activity Line (Purpose):", margin, y, { bold: true });
  text(pr.activity_line || "", margin + 30, y);
  y += 12;

  // Vendor and priority
  doc.setDrawColor(200);
  doc.rect(margin, y, 70, 25);
  doc.rect(margin + 75, y, pageWidth - 2 * margin - 75, 25);

  text("SUGGESTED VENDOR(S):", margin + 2, y + 5, { bold: true, size: 10 });
  text(pr.suggested_vendor || "", margin + 2, y + 12, { size: 10 });

  text("SUPPLY PRIORITY:", margin + 77, y + 5, { bold: true, size: 10 });
  priorities.forEach((p, i) => {
    const checked = pr.supply_priority === p ? "[X]" : "[ ]";
    text(`${checked} ${p.charAt(0).toUpperCase() + p.slice(1)}`, margin + 77, y + 12 + i * 4, {
      size: 10,
    });
  });
  y += 30;

  // Items table
  const colWidths = [30, 35, 15, 12, 18, 18];
  const rowHeight = 8;

  // Header
  doc.setFillColor(143, 188, 107);
  doc.rect(margin, y, pageWidth - 2 * margin, rowHeight, "F");
  const headers = ["Item Name", "Description", "Unit", "Qty", "Unit price", "Total price"];
  let x = margin + 2;
  headers.forEach((h, i) => {
    text(h, x, y + 5, { bold: true, size: 9, color: [255, 255, 255] });
    x += colWidths[i];
  });
  y += rowHeight;

  // Items
  items.forEach((it: any) => {
    doc.setDrawColor(200);
    doc.rect(margin, y, pageWidth - 2 * margin, rowHeight);
    const values = [
      it.item_name,
      it.description || "",
      it.unit || "",
      String(it.qty),
      it.unit_price.toFixed(2),
      it.total_price.toFixed(2),
    ];
    x = margin + 2;
    values.forEach((val, j) => {
      const truncated = val.length > 20 ? val.substring(0, 20) + "..." : val;
      text(truncated, x, y + 5, { size: 8 });
      x += colWidths[j];
    });
    y += rowHeight;
  });

  y += 10;

  // Totals
  const totalsX = pageWidth - margin - 60;
  text("Subtotal:", totalsX, y, { bold: true });
  text(subtotal.toFixed(2), totalsX + 30, y);
  y += 6;

  text("VAT(15%):", totalsX, y, { bold: true });
  text(vat.toFixed(2), totalsX + 30, y);
  y += 6;

  text("Total:", totalsX, y, { bold: true, color: [192, 0, 0] });
  text(total.toFixed(2), totalsX + 30, y);
  y += 12;

  // Note
  doc.setDrawColor(200);
  doc.rect(margin, y, 35, 12);
  doc.rect(margin + 38, y, pageWidth - 2 * margin - 38, 12);
  text("Note /Comment:", margin + 2, y + 5, { bold: true, size: 10 });
  text(pr.decision_comment || "", margin + 40, y + 5, { size: 10 });
  y += 18;

  // Signatures
  text("Requested By:", margin, y, { bold: true });
  text(requester?.name || "", margin + 25, y);

  text("Approved by:", margin + 75, y, { bold: true });
  text("Solomon Bizuayehu", margin + 100, y);
  y += 8;

  text("Signature:", margin, y, { bold: true });
  doc.setDrawColor(200);
  doc.rect(margin + 25, y, 30, 8);

  text("Signature:", margin + 75, y, { bold: true });
  doc.rect(margin + 100, y, 30, 8);
  y += 8;

  text("Date:", margin, y, { bold: true });
  doc.rect(margin + 25, y, 30, 8);

  text("Date:", margin + 75, y, { bold: true });
  doc.rect(margin + 100, y, 30, 8);
  y += 20;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Address 1: Kebele 01, Bahir Dar, Ethiopia", margin, y + 5);
  doc.text("Address 2: Yeka subcity, woreda 09, Addis Ababa, Ethiopia", margin, y + 10);
  doc.text("Phone: +251939965895", margin, y + 15);
  doc.text("Email: info@greenpactconsulting.com", margin, y + 20);
  doc.text("Website: www.greenpactconsulting.com", margin, y + 25);

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
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
