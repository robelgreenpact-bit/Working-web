import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
} from "docx";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const supabase = await createServerClient();

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

  if (!profile || !["admin", "manager", "finance"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "xlsx";
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  const serviceClient = getServiceClient();

  let query = serviceClient
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (startDate) {
    query = query.gte("created_at", startDate);
  }
  if (endDate) {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte("created_at", endOfDay.toISOString());
  }

  const { data: requests, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = await Promise.all(
    (requests || []).map(async (r) => {
      const { data: requester } = await serviceClient
        .from("public_users")
        .select("name, email")
        .eq("id", r.requester_id)
        .single();

      return {
        title: r.title,
        type: r.type,
        requesterName: requester?.name || "Unknown",
        requesterEmail: requester?.email || "",
        quantity: r.quantity ?? "",
        cost: r.estimated_cost ?? 0,
        status: r.status,
        taxRegistered: r.tax_registered ? "Yes" : "No",
        taxReference: r.tax_reference || "",
        date: new Date(r.created_at).toLocaleDateString(),
      };
    }),
  );
  const today = new Date().toISOString().split("T")[0];
  const rangeLabel =
    startDate && endDate
      ? `${startDate}_to_${endDate}`
      : startDate
        ? `from_${startDate}`
        : endDate
          ? `until_${endDate}`
          : "all";
  const filenameBase = `requests-history_${rangeLabel}_downloaded-${today}`;

  if (format === "docx") {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Greenpact - Regular Requests History",
                  bold: true,
                  size: 32,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    "Title",
                    "Type",
                    "Requester",
                    "Cost",
                    "Status",
                    "Tax Reg.",
                    "Date",
                  ].map(
                    (h) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: h, bold: true })],
                          }),
                        ],
                      }),
                  ),
                }),
                ...rows.map(
                  (r) =>
                    new TableRow({
                      children: [
                        r.title,
                        r.type,
                        r.requesterName,
                        String(r.cost),
                        r.status,
                        r.taxRegistered,
                        r.date,
                      ].map(
                        (val) =>
                          new TableCell({
                            children: [new Paragraph(String(val))],
                          }),
                      ),
                    }),
                ),
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
        "Content-Disposition": `attachment; filename="${filenameBase}.docx"`,
      },
    });
  }

  // Default: xlsx
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Requests History");

  sheet.columns = [
    { header: "Title", key: "title", width: 25 },
    { header: "Type", key: "type", width: 18 },
    { header: "Requester", key: "requesterName", width: 20 },
    { header: "Email", key: "requesterEmail", width: 28 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Cost (ETB)", key: "cost", width: 14 },
    { header: "Status", key: "status", width: 16 },
    { header: "Tax Registered", key: "taxRegistered", width: 14 },
    { header: "Tax Reference", key: "taxReference", width: 18 },
    { header: "Date", key: "date", width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
    },
  });
}
