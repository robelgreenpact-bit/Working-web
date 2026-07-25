import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

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

  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = fs.readFileSync(
      path.join(process.cwd(), "public", "logo.png"),
    );
  } catch {
    logoBuffer = null;
  }

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
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => {});

  // Helper function for text
  const text = (str: string, options: any = {}) => {
    doc.fontSize(options.size || 12).fillColor(options.color || "black");
    if (options.bold) doc.font("Helvetica-Bold");
    else doc.font("Helvetica");
    doc.text(str, options);
  };

  // Top green bar
  doc.rect(50, 50, 495, 20).fill(BRAND_GREEN);

  // Logo and company name
  if (logoBuffer) {
    doc.image(logoBuffer, 50, 80, { width: 60, height: 60 });
  }
  doc.fontSize(22).fillColor(DARK_GREEN).font("Helvetica-Bold");
  doc.text("Greenpact Research Solutions", 130, 90, { align: "center" });

  // Title bar
  doc.rect(50, 150, 495, 40).fill(BRAND_GREEN);
  doc.fontSize(22).fillColor("white").font("Helvetica-Bold");
  doc.text("Purchase Request Authorization Form", 50, 160, { align: "center" });
  doc.fontSize(12).fillColor("white").font("Helvetica-Oblique");
  doc.text("( This form is for any Service and Goods purchase request )", 50, 180, {
    align: "center",
  });

  doc.moveDown(2);

  // Info fields
  const lineHeight = 20;
  let y = doc.y;

  text("Date:", { bold: true });
  doc.text(dateStr, { continued: false });
  y = doc.y + 10;

  text("PR Number:", { bold: true });
  doc.text(pr.pr_number, { continued: false });
  y = doc.y + 10;

  text("Requestor Name:", { bold: true });
  doc.text(requester?.name || "Unknown", { continued: false });
  y = doc.y + 10;

  text("Project Name /Class:", { bold: true });
  doc.text(pr.project_class || "", { continued: false });
  y = doc.y + 10;

  text("Activity Line (Purpose):", { bold: true });
  doc.text(pr.activity_line || "", { continued: false });

  doc.moveDown(2);

  // Vendor and priority
  doc.rect(50, doc.y, 270, 60).stroke();
  doc.rect(320, doc.y, 225, 60).stroke();

  const vendorY = doc.y;
  text("SUGGESTED VENDOR(S):", { bold: true, x: 55, y: vendorY + 5 });
  doc.text(pr.suggested_vendor || "", { x: 55, y: vendorY + 25 });

  text("SUPPLY PRIORITY:", { bold: true, x: 325, y: vendorY + 5 });
  priorities.forEach((p, i) => {
    const checked = pr.supply_priority === p ? "[X]" : "[ ]";
    doc.text(
      `${checked} ${p.charAt(0).toUpperCase() + p.slice(1)}`,
      { x: 325, y: vendorY + 25 + i * 12 },
    );
  });

  doc.moveDown(4);

  // Items table
  const tableTop = doc.y;
  const colWidths = [100, 120, 50, 40, 60, 60];
  const rowHeight = 25;

  // Header
  doc.rect(50, tableTop, 495, rowHeight).fill(BRAND_GREEN);
  doc.fillColor("white").fontSize(12).font("Helvetica-Bold");
  const headers = ["Item Name", "Description", "Unit", "Qty", "Unit price", "Total price"];
  headers.forEach((h, i) => {
    doc.text(h, 55 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop + 8);
  });

  // Items
  doc.fillColor("black").fontSize(10).font("Helvetica");
  items.forEach((it: any, i: number) => {
    const rowY = tableTop + rowHeight + i * rowHeight;
    doc.rect(50, rowY, 495, rowHeight).stroke();
    const values = [
      it.item_name,
      it.description || "",
      it.unit || "",
      String(it.qty),
      it.unit_price.toFixed(2),
      it.total_price.toFixed(2),
    ];
    values.forEach((val, j) => {
      doc.text(
        val,
        55 + colWidths.slice(0, j).reduce((a, b) => a + b, 0),
        rowY + 8,
        { width: colWidths[j] - 10, ellipsis: true },
      );
    });
  });

  doc.moveDown(4);

  // Totals
  const totalsY = doc.y;
  text("Subtotal:", { bold: true, x: 400, y: totalsY });
  doc.text(subtotal.toFixed(2), { x: 450, y: totalsY });

  text("VAT(15%):", { bold: true, x: 400, y: totalsY + 20 });
  doc.text(vat.toFixed(2), { x: 450, y: totalsY + 20 });

  text("Total:", { bold: true, color: "#C00000", x: 400, y: totalsY + 40 });
  doc.text(total.toFixed(2), { x: 450, y: totalsY + 40 });

  doc.moveDown(3);

  // Note
  doc.rect(50, doc.y, 120, 30).stroke();
  doc.rect(170, doc.y, 375, 30).stroke();
  text("Note /Comment:", { bold: true, x: 55, y: doc.y + 5 });
  doc.text(pr.decision_comment || "", { x: 175, y: doc.y + 5 });

  doc.moveDown(4);

  // Signatures
  const sigY = doc.y;
  text("Requested By:", { bold: true, x: 50, y: sigY });
  doc.text(requester?.name || "", { x: 150, y: sigY });

  text("Approved by:", { bold: true, x: 300, y: sigY });
  doc.text("Solomon Bizuayehu", { x: 380, y: sigY });

  doc.text("Signature:", { bold: true, x: 50, y: sigY + 30 });
  doc.rect(150, sigY + 30, 100, 20).stroke();

  doc.text("Signature:", { bold: true, x: 300, y: sigY + 30 });
  doc.rect(380, sigY + 30, 100, 20).stroke();

  doc.text("Date:", { bold: true, x: 50, y: sigY + 60 });
  doc.rect(150, sigY + 60, 100, 20).stroke();

  doc.text("Date:", { bold: true, x: 300, y: sigY + 60 });
  doc.rect(380, sigY + 60, 100, 20).stroke();

  doc.moveDown(6);

  // Footer
  if (logoBuffer) {
    doc.image(logoBuffer, 50, doc.y, { width: 50, height: 50 });
  }
  doc.fontSize(10).fillColor("#666666");
  doc.text("Address 1: Kebele 01, Bahir Dar, Ethiopia", { x: 110, y: doc.y - 40 });
  doc.text("Address 2: Yeka subcity, woreda 09, Addis Ababa, Ethiopia", { x: 110, y: doc.y - 28 });
  doc.text("Phone: +251939965895", { x: 110, y: doc.y - 16 });
  doc.text("Email: info@greenpactconsulting.com", { x: 110, y: doc.y - 4 });
  doc.text("Website: www.greenpactconsulting.com", { x: 110, y: doc.y + 8 });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(
        new NextResponse(pdfBuffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="GP_PR_${pr.pr_number}_${new Date(
              pr.created_at,
            )
              .toISOString()
              .slice(0, 10)}.pdf"`,
          },
        }),
      );
    });
  });
}
