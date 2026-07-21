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

  const serviceClient = getServiceClient();

  const { data: assets, error } = await serviceClient
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = await Promise.all(
    (assets || []).map(async (a) => {
      let assigneeName = "—";
      if (a.assigned_to) {
        const { data: assignee } = await serviceClient
          .from("public_users")
          .select("name")
          .eq("id", a.assigned_to)
          .single();
        assigneeName = assignee?.name || "—";
      }

      return {
        tag: a.asset_tag,
        itemName: a.item_name || "",
        category: a.category,
        assignee: assigneeName,
        cost: a.purchase_cost || 0,
        purchaseDate: a.purchase_date
          ? new Date(a.purchase_date).toLocaleDateString()
          : "",
        location: a.location || "",
        status: a.status,
      };
    }),
  );

  const today = new Date().toISOString().split("T")[0];
  const filenameBase = `asset-registry_downloaded-${today}`;

  if (format === "docx") {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Greenpact - Asset Registry",
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
                    "Tag",
                    "Item",
                    "Category",
                    "Assigned To",
                    "Cost",
                    "Location",
                    "Status",
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
                        r.tag,
                        r.itemName,
                        r.category,
                        r.assignee,
                        String(r.cost),
                        r.location,
                        r.status,
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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Asset Registry");

  sheet.columns = [
    { header: "Tag", key: "tag", width: 14 },
    { header: "Item Name", key: "itemName", width: 25 },
    { header: "Category", key: "category", width: 18 },
    { header: "Assigned To", key: "assignee", width: 20 },
    { header: "Cost (ETB)", key: "cost", width: 14 },
    { header: "Purchase Date", key: "purchaseDate", width: 16 },
    { header: "Location", key: "location", width: 20 },
    { header: "Status", key: "status", width: 16 },
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
