const PDFDocument = require("pdfkit");
const { money, drawCompanyLogo, formatDateDk } = require("./pdf");

function drawLine(doc, y) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
  doc.strokeColor("#000000");
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed > 760) {
    doc.addPage();
    return 50;
  }
  return y;
}

function accountingReportPdfStream({ settings, from, to, invoices, expenses, totals, logoPath = "" }) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  drawCompanyLogo(doc, logoPath, 50, 42, 115, 56);
  doc.font("Helvetica-Bold").fontSize(22).text("REGNSKABSRAPPORT", 50, 45, {
    width: 495,
    align: "center"
  });
  doc.font("Helvetica").fontSize(10).text(`Periode: ${formatDateDk(from)} til ${formatDateDk(to)}`, 50, 75, {
    width: 495,
    align: "center"
  });

  doc.font("Helvetica").fontSize(10).text(settings.company_name || "", 390, 50);
  if (settings.cvr) doc.text(`CVR: ${settings.cvr}`, 390);
  if (settings.email) doc.text(settings.email, 390);

  drawLine(doc, 110);

  let y = 130;
  doc.font("Helvetica-Bold").fontSize(13).text("Opsummering", 50, y);
  y += 25;

  doc.font("Helvetica").fontSize(11);
  doc.text("Omsætning", 70, y);
  doc.text(money(totals.revenue), 430, y, { width: 115, align: "right" });
  y += 18;

  doc.text("Udgifter", 70, y);
  doc.text(money(totals.expenses), 430, y, { width: 115, align: "right" });
  y += 18;

  drawLine(doc, y + 4);
  y += 18;

  doc.font("Helvetica-Bold");
  doc.text("Resultat før skat", 70, y);
  doc.text(money(totals.result), 430, y, { width: 115, align: "right" });
  y += 42;

  doc.font("Helvetica-Bold").fontSize(14).text("Indtægter / fakturaer", 50, y);
  y += 24;

  if (!invoices.length) {
    doc.font("Helvetica").fontSize(10).text("Ingen fakturaer i perioden.", 70, y);
    y += 28;
  } else {
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Dato", 50, y);
    doc.text("Nr.", 105, y);
    doc.text("Kunde", 170, y);
    doc.text("Status", 350, y);
    doc.text("Beløb", 455, y, { width: 90, align: "right" });
    y += 16;
    drawLine(doc, y);
    y += 8;

    doc.font("Helvetica").fontSize(9);
    for (const invoice of invoices) {
      y = ensureSpace(doc, y);
      doc.text(invoice.issue_date, 50, y);
      doc.text(invoice.invoice_no, 105, y);
      doc.text(invoice.customer_name || "", 170, y, { width: 165 });
      doc.text(invoice.status || "", 350, y);
      doc.text(money(invoice.total || 0), 455, y, { width: 90, align: "right" });
      y += 18;
    }
    y += 20;
  }

  y = ensureSpace(doc, y, 80);
  doc.font("Helvetica-Bold").fontSize(14).text("Udgifter", 50, y);
  y += 24;

  if (!expenses.length) {
    doc.font("Helvetica").fontSize(10).text("Ingen udgifter i perioden.", 70, y);
  } else {
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Dato", 50, y);
    doc.text("Bilag", 105, y);
    doc.text("Beskrivelse", 170, y);
    doc.text("Kategori", 340, y);
    doc.text("Beløb", 455, y, { width: 90, align: "right" });
    y += 16;
    drawLine(doc, y);
    y += 8;

    doc.font("Helvetica").fontSize(9);
    for (const expense of expenses) {
      y = ensureSpace(doc, y);
      doc.text(expense.expense_date, 50, y);
      doc.text(expense.bilag_no || "", 105, y, { width: 55 });
      doc.text(expense.description || "", 170, y, { width: 155 });
      doc.text(expense.category || "", 340, y, { width: 95 });
      doc.text(money(expense.amount || 0), 455, y, { width: 90, align: "right" });
      y += 18;
    }
  }

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).text("Noter", 50, 50);
  doc.font("Helvetica").fontSize(10).text(
    "Denne rapport er en intern regnskabsoversigt baseret på de fakturaer og udgifter, der er registreret i portalen. Gem altid originale fakturaer, kvitteringer og bankbilag som dokumentation.",
    50,
    78,
    { width: 495, lineGap: 4 }
  );

  doc.end();
  return doc;
}

module.exports = {
  accountingReportPdfStream
};
