import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  ImageRun,
} from "docx";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BRAND_GREEN = "8FBC6B";
const DARK_GREEN = "1E9E5A";

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
};

function cellText(
  text: string,
  opts: { bold?: boolean; color?: string; size?: number } = {},
) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        color: opts.color,
        size: opts.size || 24,
        font: "Calibri Light",
      }),
    ],
  });
}

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

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: {
            font: "Calibri Light",
          },
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          // Top green bar
          new Paragraph({
            spacing: { after: 100 },
            shading: {
              type: ShadingType.SOLID,
              color: BRAND_GREEN,
              fill: BRAND_GREEN,
            },
            children: [new TextRun({ text: " " })],
          }),

          // Logo + Company name
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    width: { size: 80, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: "Greenpact Research Solutions",
                            bold: true,
                            size: 44,
                            color: DARK_GREEN,
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Title bar
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: {
                      type: ShadingType.SOLID,
                      color: BRAND_GREEN,
                      fill: BRAND_GREEN,
                    },
                    borders: noBorder,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: "Purchase Request Authorization Form",
                            bold: true,
                            size: 44,
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: "( This form is for any Service and Goods purchase request )",
                            italics: true,
                            size: 24,
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Info fields
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    children: [cellText("Date", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(dateStr)],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("PR Number", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(pr.pr_number)],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Requestor Name", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(requester?.name || "Unknown")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Project Name /Class", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(pr.project_class || "")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [
                      cellText("Activity Line (Purpose)", { bold: true }),
                    ],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(pr.activity_line || "")],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Vendor + priority
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 55, type: WidthType.PERCENTAGE },
                    borders: thinBorder,
                    children: [
                      cellText("SUGGESTED VENDOR(S):", { bold: true }),
                      cellText(pr.suggested_vendor || ""),
                    ],
                  }),
                  new TableCell({
                    width: { size: 45, type: WidthType.PERCENTAGE },
                    borders: thinBorder,
                    children: [
                      cellText("SUPPLY PRIORITY:", { bold: true }),
                      ...priorities.map((p) =>
                        cellText(
                          `${pr.supply_priority === p ? "[X]" : "[ ]"} ${
                            p.charAt(0).toUpperCase() + p.slice(1)
                          }`,
                        ),
                      ),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Items table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            rows: [
              new TableRow({
                children: [
                  "Item Name",
                  "Description",
                  "Unit",
                  "Qty",
                  "Unit price",
                  "Total price",
                ].map(
                  (h) =>
                    new TableCell({
                      shading: {
                        type: ShadingType.SOLID,
                        color: BRAND_GREEN,
                        fill: BRAND_GREEN,
                      },
                      borders: thinBorder,
                      children: [cellText(h, { bold: true })],
                    }),
                ),
              }),
              ...items.map(
                (it: {
                  item_name: string;
                  description: string | null;
                  unit: string | null;
                  qty: number;
                  unit_price: number;
                  total_price: number;
                }) =>
                  new TableRow({
                    children: [
                      it.item_name,
                      it.description || "",
                      it.unit || "",
                      String(it.qty),
                      it.unit_price.toFixed(2),
                      it.total_price.toFixed(2),
                    ].map(
                      (val) =>
                        new TableCell({
                          borders: thinBorder,
                          children: [cellText(String(val))],
                        }),
                    ),
                  }),
              ),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 100 } }),

          // Totals
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Subtotal", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(subtotal.toFixed(2))],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("VAT(15%)", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText(vat.toFixed(2))],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Total", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [
                      cellText(total.toFixed(2), {
                        bold: true,
                        color: "C00000",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Note
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [cellText("Note /Comment", { bold: true })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    children: [cellText(pr.decision_comment || "")],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Signatures
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [cellText("Requested By", { bold: true })],
                  }),
                  new TableCell({
                    width: { size: 35, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [cellText(requester?.name || "")],
                  }),
                  new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [cellText("Approved by", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Solomon Bizuayehu")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Signature", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Signature", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Date", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [cellText("Date", { bold: true })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { before: 400 } }),

          // Footer with contact info
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [new Paragraph("")],
                  }),
                  new TableCell({
                    width: { size: 85, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Address 1: Kebele 01, Bahir Dar, Ethiopia",
                            size: 20,
                            color: "666666",
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Address 2: Yeka subcity, woreda 09, Addis Ababa, Ethiopia",
                            size: 20,
                            color: "666666",
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Phone: +251939965895",
                            size: 20,
                            color: "666666",
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Email: info@greenpactconsulting.com",
                            size: 20,
                            color: "666666",
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Website: www.greenpactconsulting.com",
                            size: 20,
                            color: "666666",
                            font: "Calibri Light",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="GP_PR_${pr.pr_number}_${new Date(
        pr.created_at,
      )
        .toISOString()
        .slice(0, 10)}.docx"`,
    },
  });
}
