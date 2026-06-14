const PDFDocument = require("pdfkit");
const fs = require("fs");

function money(value) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK"
  }).format(Number(value || 0));
}



function formatDateDk(value) {
  if (!value) return "";

  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function centeredText(doc, text, y, options = {}) {
  const font = options.font || "Helvetica-Bold";
  const size = options.size || 24;
  const pageWidth = doc.page.width;
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const width = pageWidth - marginLeft - marginRight;

  doc.font(font).fontSize(size).text(text, marginLeft, y, {
    width,
    align: "center"
  });
}

function drawCompanyLogo(doc, logoPath, x = 50, y = 42, maxWidth = 110, maxHeight = 54) {
  if (!logoPath || !fs.existsSync(logoPath)) return false;

  try {
    doc.image(logoPath, x, y, {
      fit: [maxWidth, maxHeight],
      align: "left",
      valign: "top"
    });
    return true;
  } catch (_error) {
    return false;
  }
}

function drawLine(doc, y) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
  doc.strokeColor("#000000");
}

function invoicePdfStream({ settings, invoice, customer, items, logoPath = "" }) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const total = items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.unit_price || 0);
  }, 0);

  drawCompanyLogo(doc, logoPath, 50, 42, 115, 56);
  centeredText(doc, "FAKTURA", 45, { size: 24 });
  doc.font("Helvetica").fontSize(10).text(`Fakturanr.: ${invoice.invoice_no}`, 400, 50);
  doc.text(`Dato: ${formatDateDk(invoice.issue_date)}`, 400, 65);
  doc.text(`Forfaldsdato: ${formatDateDk(invoice.due_date)}`, 400, 80);

  drawLine(doc, 110);

  doc.font("Helvetica-Bold").fontSize(12).text("Fra", 50, 130);
  doc.font("Helvetica").fontSize(10);
  doc.text(settings.company_name || "");
  if (settings.cvr) doc.text(`CVR: ${settings.cvr}`);
  if (settings.owner_name) doc.text(settings.owner_name);
  if (settings.address) doc.text(settings.address);
  if (settings.zip_city) doc.text(settings.zip_city);
  if (settings.phone) doc.text(`Telefon: ${settings.phone}`);
  if (settings.email) doc.text(`Email: ${settings.email}`);

  doc.font("Helvetica-Bold").fontSize(12).text("Til", 320, 130);
  doc.font("Helvetica").fontSize(10);
  doc.text(customer.name || "", 320);
  if (customer.cvr) doc.text(`CVR: ${customer.cvr}`, 320);
  if (customer.address) doc.text(customer.address, 320);
  if (customer.zip_city) doc.text(customer.zip_city, 320);
  if (customer.email) doc.text(`Email: ${customer.email}`, 320);
  if (customer.phone) doc.text(`Telefon: ${customer.phone}`, 320);

  drawLine(doc, 260);

  const startY = 285;
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Beskrivelse", 50, startY);
  doc.text("Antal", 330, startY, { width: 50, align: "right" });
  doc.text("Pris", 395, startY, { width: 65, align: "right" });
  doc.text("Beløb", 480, startY, { width: 65, align: "right" });

  drawLine(doc, startY + 18);

  let y = startY + 35;
  doc.font("Helvetica").fontSize(10);

  for (const item of items) {
    const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
    doc.text(item.description, 50, y, { width: 260 });
    doc.text(String(item.quantity), 330, y, { width: 50, align: "right" });
    doc.text(money(item.unit_price), 395, y, { width: 65, align: "right" });
    doc.text(money(lineTotal), 480, y, { width: 65, align: "right" });
    y += 25;

    if (y > 680) {
      doc.addPage();
      y = 60;
    }
  }

  drawLine(doc, y + 5);

  y += 25;
  doc.font("Helvetica-Bold");
  doc.text("Subtotal", 395, y, { width: 65, align: "right" });
  doc.text(money(total), 480, y, { width: 65, align: "right" });

  y += 18;
  doc.text("Moms", 395, y, { width: 65, align: "right" });
  doc.text(money(0), 480, y, { width: 65, align: "right" });

  y += 24;
  doc.fontSize(12).text("Total til betaling", 350, y, { width: 110, align: "right" });
  doc.text(money(total), 470, y, { width: 75, align: "right" });

  y += 55;
  doc.font("Helvetica-Bold").fontSize(11).text("Betaling", 50, y);
  doc.font("Helvetica").fontSize(10);
  y += 18;

  if (settings.bank_name) {
    doc.text(`Bank: ${settings.bank_name}`, 50, y);
    y += 14;
  }

  if (settings.reg_no || settings.account_no) {
    doc.text(`Reg.nr.: ${settings.reg_no}    Kontonr.: ${settings.account_no}`, 50, y);
    y += 14;
  }

  if (settings.iban) {
    doc.text(`IBAN: ${settings.iban}`, 50, y);
    y += 14;
  }

  if (settings.bic) {
    doc.text(`BIC/SWIFT: ${settings.bic}`, 50, y);
    y += 14;
  }

  if (settings.mobilepay) {
    doc.text(`MobilePay: ${settings.mobilepay}`, 50, y);
    y += 14;
  }

  doc.text(`Betalingsreference: Faktura ${invoice.invoice_no}`, 50, y);

  y += 35;
  doc.font("Helvetica-Bold").text("Bemærkning", 50, y);
  y += 16;
  doc.font("Helvetica").text(settings.invoice_note || "", 50, y, { width: 495 });
  if (invoice.notes) {
    y += 35;
    doc.text(invoice.notes, 50, y, { width: 495 });
  }

  doc.end();
  return doc;
}

function invoicePdfBuffer(args) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = invoicePdfStream(args);

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

module.exports = {
  invoicePdfStream,
  invoicePdfBuffer,
  drawCompanyLogo,
  formatDateDk,
  money
};
