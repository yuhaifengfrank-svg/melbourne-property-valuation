import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = new URL("./outputs/aushomevalue-leads-export.json", import.meta.url);
const outputPath = new URL("./outputs/AusHomeValue_Lead_Analysis.xlsx", import.meta.url);
const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
const leads = data.leads || [];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const source = workbook.worksheets.add("Lead Data");
summary.showGridLines = false;
source.showGridLines = false;

summary.mergeCells("A1:H2");
summary.getRange("A1").values = [["AusHomeValue Customer Lead Analysis"]];
summary.getRange("A1:H2").format = {
  fill: "#15372F",
  font: { bold: true, color: "#FFFFFF", size: 20 },
  horizontalAlignment: "center",
  verticalAlignment: "center"
};
summary.mergeCells("A3:H3");
summary.getRange("A3").values = [[`Database export generated ${new Date().toLocaleString("en-AU")} · Test data only · Do not contact`]];
summary.getRange("A3:H3").format = {
  fill: "#E8F3EF",
  font: { color: "#0D6B57", italic: true },
  horizontalAlignment: "center"
};

summary.getRange("A5:H5").values = [[
  "Total Records", "", "Hot Leads", "", "Contact Consent", "", "PDF Requests", ""
]];
summary.getRange("A6:H6").values = [[
  data.summary?.total || 0, "", data.summary?.hot || 0, "",
  data.summary?.consented || 0, "", data.summary?.pdf_requests || 0, ""
]];
for (const range of ["A5:B6", "C5:D6", "E5:F6", "G5:H6"]) {
  summary.getRange(range).format = {
    fill: "#F7FAF8",
    borders: { preset: "outside", style: "thin", color: "#DBE2DE" }
  };
}
summary.getRange("A5:H5").format.font = { bold: true, color: "#66736D" };
summary.getRange("A6:H6").format.font = { bold: true, color: "#17211D", size: 20 };

summary.getRange("A9:B12").values = [
  ["Priority", "Count"],
  ["Hot", leads.filter((lead) => lead.priority === "Hot").length],
  ["Warm", leads.filter((lead) => lead.priority === "Warm").length],
  ["Early", leads.filter((lead) => lead.priority === "Early").length]
];
summary.getRange("A9:B9").format = {
  fill: "#0D6B57",
  font: { bold: true, color: "#FFFFFF" }
};
summary.getRange("A9:B12").format.borders = { preset: "all", style: "thin", color: "#DBE2DE" };
summary.getRange("A10:A12").format.font = { bold: true };

summary.getRange("D9:H13").values = [
  ["Lead Scoring Notes", "", "", "", ""],
  ["Phone supplied", "+25 points", "", "", ""],
  ["Contact consent", "+25 points", "", "", ""],
  ["PDF request", "+20 points", "", "", ""],
  ["Other engagement", "Up to +30 points", "", "", ""]
];
summary.mergeCells("D9:H9");
summary.getRange("D9:H9").format = {
  fill: "#D7653B",
  font: { bold: true, color: "#FFFFFF" }
};
summary.getRange("D10:H13").format = {
  fill: "#FFF8F4",
  borders: { preset: "all", style: "thin", color: "#F2D5AD" }
};

summary.mergeCells("B15:H15");
summary.mergeCells("B16:H16");
summary.mergeCells("B17:H17");
summary.getRange("A15:B17").values = [
  ["Data Source", "Neon PostgreSQL cloud database"],
  ["Database Region", "Sydney, Australia"],
  ["Privacy", "Approximate visitor region is exported; full IP address is not displayed."]
];
summary.getRange("A15:H17").format = {
  fill: "#F7FAF8",
  font: { color: "#66736D" },
  wrapText: true
};
summary.getRange("A15:A17").format.font = { bold: true, color: "#17211D" };

const headers = [
  "Priority", "Lead Score", "Name", "Email", "Phone", "Contact Consent", "PDF Download",
  "Property Address", "Property Type", "Estimated Value", "Midpoint Value", "Confidence",
  "Selected LVR", "Event Type", "Approximate Region", "Submitted At"
];
const rows = leads.map((lead) => [
  lead.priority,
  Number(lead.lead_score),
  lead.name,
  lead.email,
  lead.phone || "",
  lead.contact_consent ? "Yes" : "No",
  lead.pdf_download ? "Yes" : "No",
  lead.property_address,
  lead.property_type || "",
  lead.estimated_value || "",
  Number(lead.midpoint_value || 0),
  lead.confidence || "",
  Number(lead.selected_lvr || 0),
  lead.event_type,
  [lead.ip_city, lead.ip_region, lead.ip_country].filter(Boolean).join(", "),
  new Date(lead.created_at)
]);

source.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
if (rows.length) source.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
source.getRangeByIndexes(0, 0, rows.length + 1, headers.length).format.borders = {
  preset: "all",
  style: "thin",
  color: "#DBE2DE"
};
source.getRangeByIndexes(0, 0, 1, headers.length).format = {
  fill: "#15372F",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true
};
if (rows.length) {
  source.tables.add(`A1:P${rows.length + 1}`, true, "LeadDataTable");
  source.getRange(`K2:K${rows.length + 1}`).format.numberFormat = "$#,##0";
  source.getRange(`M2:M${rows.length + 1}`).format.numberFormat = '0"%"';
  source.getRange(`P2:P${rows.length + 1}`).setNumberFormat("yyyy-mm-dd hh:mm");
  source.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add("dataBar", { color: "#0D6B57" });
}
source.freezePanes.freezeRows(1);

const widths = [12, 11, 30, 26, 16, 16, 14, 34, 14, 18, 16, 14, 12, 16, 24, 20];
widths.forEach((width, index) => {
  source.getRangeByIndexes(0, index, rows.length + 1, 1).format.columnWidth = width;
});
summary.getRange("A:H").format.columnWidth = 18;
summary.getRange("A1:H17").format.rowHeight = 22;

const chart = summary.charts.add("bar", summary.getRange("A9:B12"));
chart.title = "Lead Priority Distribution";
chart.hasLegend = false;
chart.setPosition("A20", "H36");

await fs.mkdir(new URL("./outputs/", import.meta.url), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const preview = await workbook.render({ sheetName: "Summary", range: "A1:H36", scale: 1.5, format: "png" });
await fs.writeFile(new URL("./outputs/AusHomeValue_Lead_Analysis_preview.png", import.meta.url), new Uint8Array(await preview.arrayBuffer()));

console.log((await workbook.inspect({
  kind: "table",
  range: "Summary!A1:H17",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 10
})).ndjson);
