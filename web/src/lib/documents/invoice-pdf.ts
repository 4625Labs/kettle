import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney } from "./dates";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceDocData {
  vendorName: string;
  vendorAddress: string;
  invoiceNumber: string;
  poNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  billTo: string;
  lineItems: InvoiceLineItem[];
  note?: string;
}

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.48);
const RULE = rgb(0.75, 0.75, 0.78);

// A realistic-looking single-page vendor invoice (vendor header, invoice/PO numbers, a line-item
// table, and totals computed here in code — never by a model). Feeds F6 extraction.
export async function renderInvoicePdf(data: InvoiceDocData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(data.vendorName, { x: MARGIN, y, size: 20, font: bold, color: INK });
  y -= 18;
  for (const line of data.vendorAddress.split("\n")) {
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: MUTED });
    y -= 13;
  }

  page.drawText("INVOICE", { x: PAGE_WIDTH - MARGIN - 90, y: PAGE_HEIGHT - MARGIN, size: 20, font: bold, color: INK });

  y -= 10;
  drawRule(page, y);
  y -= 22;

  y = drawLabelValueRow(page, font, bold, y, [
    ["Invoice #", data.invoiceNumber],
    ["PO #", data.poNumber],
  ]);
  y = drawLabelValueRow(page, font, bold, y, [
    ["Issue Date", data.issueDate],
    ["Due Date", data.dueDate],
  ]);

  y -= 6;
  page.drawText("Bill To:", { x: MARGIN, y, size: 10, font: bold, color: MUTED });
  y -= 13;
  page.drawText(data.billTo, { x: MARGIN, y, size: 11, font, color: INK });
  y -= 26;

  drawRule(page, y);
  y -= 16;

  const columns = [
    { label: "Description", x: MARGIN, width: 260 },
    { label: "Qty", x: MARGIN + 270, width: 60 },
    { label: "Unit Price", x: MARGIN + 340, width: 100 },
    { label: "Total", x: MARGIN + 440, width: 100 },
  ];
  for (const col of columns) {
    page.drawText(col.label, { x: col.x, y, size: 10, font: bold, color: MUTED });
  }
  y -= 8;
  drawRule(page, y);
  y -= 18;

  let subtotal = 0;
  for (const item of data.lineItems) {
    const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    subtotal += lineTotal;
    page.drawText(item.description, { x: columns[0].x, y, size: 11, font, color: INK });
    page.drawText(String(item.quantity), { x: columns[1].x, y, size: 11, font, color: INK });
    page.drawText(formatMoney(item.unitPrice), { x: columns[2].x, y, size: 11, font, color: INK });
    page.drawText(formatMoney(lineTotal), { x: columns[3].x, y, size: 11, font, color: INK });
    y -= 20;
  }
  subtotal = Math.round(subtotal * 100) / 100;

  y -= 6;
  drawRule(page, y);
  y -= 24;

  page.drawText("Total Due:", { x: columns[2].x, y, size: 13, font: bold, color: INK });
  page.drawText(formatMoney(subtotal), { x: columns[3].x, y, size: 13, font: bold, color: INK });

  if (data.note) {
    y -= 34;
    page.drawText(data.note, { x: MARGIN, y, size: 9, font, color: MUTED });
  }

  return doc.save();
}

function drawRule(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: RULE });
}

function drawLabelValueRow(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  y: number,
  pairs: [string, string][],
): number {
  let x = MARGIN;
  for (const [label, value] of pairs) {
    page.drawText(`${label}:`, { x, y, size: 10, font: bold, color: MUTED });
    page.drawText(value, { x: x + 70, y, size: 10, font, color: INK });
    x += 260;
  }
  return y - 16;
}
