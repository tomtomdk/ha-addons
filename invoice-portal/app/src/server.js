const express = require("express");
const session = require("express-session");
const BetterSqlite3SessionStore = require("better-sqlite3-session-store")(session);
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const db = require("./db");
const { requireAuth, redirectIfAuthed } = require("./auth");
const { invoicePdfStream, invoicePdfBuffer, money } = require("./pdf");
const { lookupCvr } = require("./cvr");
const { accountingReportPdfStream } = require("./reports");
const { imapConfigured, listInboxMessages, readMessage, getUnreadCount, setMessageSeen } = require("./mail");
const { defaultLanguage, normalizeLanguage, t } = require("./i18n");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const DEFAULT_LANGUAGE = defaultLanguage();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const RECEIPT_DIR = path.join(DATA_DIR, "uploads", "receipts");
const DOCUMENT_DIR = path.join(DATA_DIR, "uploads", "documents");
const COMPANY_DIR = path.join(DATA_DIR, "uploads", "company");
const SESSION_DB_PATH = path.join(DATA_DIR, "sessions.sqlite");

function normalizeBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function getExternalBasePath(req) {
  return normalizeBasePath(req.get("x-ingress-path") || process.env.APP_BASE_PATH || "");
}

fs.mkdirSync(RECEIPT_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });
fs.mkdirSync(COMPANY_DIR, { recursive: true });

const sessionDb = new Database(SESSION_DB_PATH);
sessionDb.pragma("journal_mode = WAL");

const allowedReceiptMimes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const receiptStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, RECEIPT_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : "";
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: function (_req, file, cb) {
    if (!allowedReceiptMimes.has(file.mimetype)) {
      return cb(new Error("Kun PDF, JPG, PNG og WEBP er tilladt som kvittering."));
    }
    cb(null, true);
  }
});


const allowedDocumentMimes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

const documentStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, DOCUMENT_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : "";
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const documentUpload = multer({
  storage: documentStorage,
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: function (_req, file, cb) {
    if (!allowedDocumentMimes.has(file.mimetype)) {
      return cb(new Error("Filtypen er ikke tilladt. Brug PDF, billeder, TXT, CSV, Word eller Excel."));
    }

    cb(null, true);
  }
});


const allowedLogoMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const logoStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, COMPANY_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : "";
    cb(null, `logo-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (_req, file, cb) {
    if (!allowedLogoMimes.has(file.mimetype)) {
      return cb(new Error("Logo skal være JPG, PNG eller WEBP."));
    }

    cb(null, true);
  }
});

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.set("view engine", "ejs");
app.set("views", "views");

app.use((req, _res, next) => {
  const ingressPath = getExternalBasePath(req);
  if (ingressPath && req.url.startsWith(`${ingressPath}/`)) {
    req.url = req.url.slice(ingressPath.length) || "/";
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use((req, res, next) => {
  const basePath = getExternalBasePath(req);
  res.locals.basePath = basePath;
  res.locals.appUrl = function appUrl(target) {
    const pathValue = String(target || "/");
    if (/^[a-z][a-z0-9+.-]*:/i.test(pathValue)) return pathValue;
    if (pathValue.startsWith("//")) return pathValue;
    return `${basePath}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
  };

  const originalRedirect = res.redirect.bind(res);
  res.redirect = function redirectWithBase(statusOrUrl, urlMaybe) {
    if (typeof statusOrUrl === "number") {
      const target = typeof urlMaybe === "string" && urlMaybe.startsWith("/") && !urlMaybe.startsWith("//")
        ? `${basePath}${urlMaybe}`
        : urlMaybe;
      return originalRedirect(statusOrUrl, target);
    }

    const target = typeof statusOrUrl === "string" && statusOrUrl.startsWith("/") && !statusOrUrl.startsWith("//")
      ? `${basePath}${statusOrUrl}`
      : statusOrUrl;
    return originalRedirect(target);
  };

  next();
});

app.use(session({
  name: "faktura.sid",
  store: new BetterSqlite3SessionStore({
    client: sessionDb
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.TRUST_PROXY === "true",
    maxAge: 1000 * 60 * 60 * 8
  }
}));



function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) return `${minutes} min.`;
  return `${hours} t. ${minutes} min.`;
}

function formatDateTimeDk(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function datetimeLocalToIso(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function secondsBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function getOpenTimeEntry(taskId) {
  return db.prepare(`
    SELECT *
    FROM time_entries
    WHERE task_id = ?
      AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `).get(taskId);
}

function getTaskTotals(taskId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN ended_at IS NULL THEN duration_seconds + CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)
          ELSE duration_seconds
        END
      ), 0) AS total_seconds
    FROM time_entries
    WHERE task_id = ?
  `).get(taskId);

  return {
    total_seconds: Number(row?.total_seconds || 0)
  };
}

function getTimeTask(taskId) {
  return db.prepare(`
    SELECT
      t.*,
      c.name AS customer_name,
      i.invoice_no AS linked_invoice_no,
      ex.description AS linked_expense_description,
      (
        SELECT COUNT(*)
        FROM time_entries e
        WHERE e.task_id = t.id
          AND e.ended_at IS NULL
      ) AS running_count,
      (
        SELECT COALESCE(SUM(
          CASE
            WHEN e.ended_at IS NULL THEN e.duration_seconds + CAST((julianday('now') - julianday(e.started_at)) * 86400 AS INTEGER)
            ELSE e.duration_seconds
          END
        ), 0)
        FROM time_entries e
        WHERE e.task_id = t.id
      ) AS total_seconds
    FROM time_tasks t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN invoices i ON i.id = t.invoice_id
    LEFT JOIN expenses ex ON ex.id = t.expense_id
    WHERE t.id = ?
  `).get(taskId);
}

function formatMailDateParts(value) {
  if (!value) {
    return {
      date: "",
      time: ""
    };
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return {
      date: "",
      time: ""
    };
  }

  return {
    date: d.toLocaleDateString("da-DK"),
    time: d.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  };
}

app.use((req, res, next) => {
  const language = normalizeLanguage(req.session.language || DEFAULT_LANGUAGE);
  req.language = language;
  res.locals.language = language;
  res.locals.t = (key) => t(language, key);
  res.locals.user = req.session.user;
  res.locals.money = money;
  res.locals.formatMailDateParts = formatMailDateParts;
  res.locals.formatDuration = formatDuration;
  res.locals.formatDateTimeDk = formatDateTimeDk;
  res.locals.formatDateDk = formatDateDk;
  res.locals.currentPath = req.path;
  next();
});

app.post("/language", (req, res) => {
  req.session.language = normalizeLanguage(req.body.language);
  const fallback = "/";
  const rawReturnTo = String(req.body.return_to || fallback);
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : fallback;
  res.redirect(returnTo);
});

function getSettings() {
  return db.prepare("SELECT * FROM settings WHERE id = 1").get();
}

function getCustomer(id) {
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
}

function getInvoice(id) {
  return db.prepare(`
    SELECT invoices.*, customers.name AS customer_name
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    WHERE invoices.id = ?
  `).get(id);
}

function getItems(invoiceId) {
  return db.prepare(`
    SELECT * FROM invoice_items
    WHERE invoice_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(invoiceId);
}

function nextInvoiceNo(issueDate) {
  const year = dayjs(issueDate).format("YYYY");
  const row = db.prepare(`
    SELECT invoice_no FROM invoices
    WHERE invoice_no LIKE ?
    ORDER BY invoice_no DESC
    LIMIT 1
  `).get(`${year}-%`);

  let next = 1;
  if (row && row.invoice_no) {
    const last = Number(row.invoice_no.split("-")[1] || "0");
    next = last + 1;
  }

  return `${year}-${String(next).padStart(3, "0")}`;
}

function invoiceTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

function parseAmount(value) {
  return Number(String(value || "0").replace(",", "."));
}


function roundQuantity(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(value || 0) * factor) / factor;
}

function getClosedTimeEntries(taskId) {
  return db.prepare(`
    SELECT *
    FROM time_entries
    WHERE task_id = ?
      AND ended_at IS NOT NULL
    ORDER BY started_at ASC, id ASC
  `).all(taskId);
}

function getTimeTaskBillingSummary(taskId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS entry_count,
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      MIN(started_at) AS first_started_at,
      MAX(ended_at) AS last_ended_at
    FROM time_entries
    WHERE task_id = ?
      AND ended_at IS NOT NULL
  `).get(taskId);

  const totalSeconds = Number(row?.total_seconds || 0);
  const hours = roundQuantity(totalSeconds / 3600, 2);

  return {
    entry_count: Number(row?.entry_count || 0),
    total_seconds: totalSeconds,
    hours,
    first_started_at: row?.first_started_at || "",
    last_ended_at: row?.last_ended_at || "",
    amount: 0
  };
}

function formatDateDk(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function buildTimeTaskLineDescription(task, summary) {
  const parts = [`Timer: ${task.name}`];

  if (summary.first_started_at && summary.last_ended_at) {
    parts.push(`Periode: ${formatDateDk(summary.first_started_at)} - ${formatDateDk(summary.last_ended_at)}`);
  }

  if (summary.entry_count) {
    parts.push(`${summary.entry_count} tidsregistrering${summary.entry_count === 1 ? "" : "er"}`);
  }

  return parts.join("\n");
}

function dashboardStats() {
  const year = dayjs().format("YYYY");

  const invoiceRevenue = db.prepare(`
    SELECT COALESCE(SUM(line_total), 0) AS revenue, COUNT(*) AS invoice_count
    FROM (
      SELECT invoices.id, SUM(invoice_items.quantity * invoice_items.unit_price) AS line_total
      FROM invoices
      LEFT JOIN invoice_items ON invoice_items.invoice_id = invoices.id
      WHERE strftime('%Y', invoices.issue_date) = ?
      GROUP BY invoices.id
    )
  `).get(year);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS expenses, COUNT(*) AS expense_count
    FROM expenses
    WHERE strftime('%Y', expense_date) = ?
  `).get(year);

  return {
    invoice_count: invoiceRevenue.invoice_count || 0,
    revenue: invoiceRevenue.revenue || 0,
    expense_count: expenses.expense_count || 0,
    expenses: expenses.expenses || 0,
    result: Number(invoiceRevenue.revenue || 0) - Number(expenses.expenses || 0)
  };
}


function renderMessage(res, statusCode, options = {}) {
  return res.status(statusCode).render("error", {
    icon: options.icon || "!",
    title: options.title || "Handlingen kunne ikke gennemføres",
    message: options.message || "Der opstod en fejl.",
    details: options.details || "",
    backHref: options.backHref || "/",
    backLabel: options.backLabel || "Tilbage",
    secondaryHref: options.secondaryHref || "",
    secondaryLabel: options.secondaryLabel || ""
  });
}


function addFrequency(date, frequency) {
  const d = dayjs(date);
  if (frequency === "weekly") return d.add(1, "week").format("YYYY-MM-DD");
  if (frequency === "quarterly") return d.add(3, "month").format("YYYY-MM-DD");
  if (frequency === "yearly") return d.add(1, "year").format("YYYY-MM-DD");
  return d.add(1, "month").format("YYYY-MM-DD");
}

function generateDueRecurringExpenses(untilDate) {
  const until = dayjs(untilDate || dayjs().format("YYYY-MM-DD"));
  const recurring = db.prepare(`
    SELECT * FROM recurring_expenses
    WHERE active = 1 AND date(next_date) <= date(?)
    ORDER BY next_date ASC, id ASC
  `).all(until.format("YYYY-MM-DD"));

  let created = 0;

  const tx = db.transaction(() => {
    const insertExpense = db.prepare(`
      INSERT INTO expenses (
        expense_date, description, supplier, category, amount,
        bilag_no, notes, recurring_expense_id
      )
      VALUES (
        @expense_date, @description, @supplier, @category, @amount,
        @bilag_no, @notes, @recurring_expense_id
      )
    `);

    const updateRecurring = db.prepare(`
      UPDATE recurring_expenses
      SET next_date = @next_date
      WHERE id = @id
    `);

    for (const item of recurring) {
      let nextDate = item.next_date;

      while (dayjs(nextDate).isBefore(until.add(1, "day"))) {
        const exists = db.prepare(`
          SELECT id FROM expenses
          WHERE recurring_expense_id = ?
            AND expense_date = ?
          LIMIT 1
        `).get(item.id, nextDate);

        if (!exists) {
          const dateForBilag = dayjs(nextDate).format("YYYYMM");
          const bilagNo = item.bilag_prefix ? `${item.bilag_prefix}-${dateForBilag}` : "";

          insertExpense.run({
            expense_date: nextDate,
            description: item.description,
            supplier: item.supplier,
            category: item.category,
            amount: item.amount,
            bilag_no: bilagNo,
            notes: item.notes || "Oprettet fra tilbagevendende udgift.",
            recurring_expense_id: item.id
          });
          created += 1;
        }

        nextDate = addFrequency(nextDate, item.frequency);
      }

      updateRecurring.run({
        id: item.id,
        next_date: nextDate
      });
    }
  });

  tx();
  return created;
}

function getAccountingReportData(from, to) {
  const invoices = db.prepare(`
    SELECT invoices.*, customers.name AS customer_name,
      COALESCE(SUM(invoice_items.quantity * invoice_items.unit_price), 0) AS total
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    LEFT JOIN invoice_items ON invoice_items.invoice_id = invoices.id
    WHERE date(invoices.issue_date) >= date(?)
      AND date(invoices.issue_date) <= date(?)
    GROUP BY invoices.id
    ORDER BY invoices.issue_date ASC, invoices.id ASC
  `).all(from, to);

  const expenses = db.prepare(`
    SELECT * FROM expenses
    WHERE date(expense_date) >= date(?)
      AND date(expense_date) <= date(?)
    ORDER BY expense_date ASC, id ASC
  `).all(from, to);

  const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  return {
    invoices,
    expenses,
    totals: {
      revenue,
      expenses: expenseTotal,
      result: revenue - expenseTotal
    }
  };
}



function appendEmailSignature(body, signature) {
  const cleanBody = String(body || "").trimEnd();
  const cleanSignature = String(signature || "").trim();

  if (!cleanSignature) return cleanBody;

  return `${cleanBody}\n\n${cleanSignature}`;
}

function getCompanyLogoPath(settings) {
  if (!settings || !settings.logo_file) return "";

  const logoPath = path.join(COMPANY_DIR, settings.logo_file);
  return fs.existsSync(logoPath) ? logoPath : "";
}

function renderTemplate(template, context) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    return context[key] == null ? "" : String(context[key]);
  });
}

function smtpConfigured(settings) {
  return Boolean(settings.smtp_host && settings.smtp_port && settings.smtp_from);
}

function createTransport(settings) {
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port || 587),
    secure: Number(settings.smtp_secure || 0) === 1,
    auth: settings.smtp_user || settings.smtp_pass ? {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    } : undefined
  });
}

app.get("/login", redirectIfAuthed, (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", redirectIfAuthed, async (req, res) => {
  const { username, password } = req.body;

  const userOk = String(username || "") === ADMIN_USERNAME;
  let passOk = false;

  if (String(ADMIN_PASSWORD).startsWith("$2a$") || String(ADMIN_PASSWORD).startsWith("$2b$") || String(ADMIN_PASSWORD).startsWith("$2y$")) {
    passOk = await bcrypt.compare(String(password || ""), ADMIN_PASSWORD);
  } else {
    passOk = String(password || "") === String(ADMIN_PASSWORD);
  }

  if (!userOk || !passOk) {
    return res.status(401).render("login", { error: "Forkert brugernavn eller adgangskode." });
  }

  req.session.user = { username: ADMIN_USERNAME };
  res.redirect("/");
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/", requireAuth, (req, res) => {
  const invoices = db.prepare(`
    SELECT invoices.*, customers.name AS customer_name,
      COALESCE(SUM(invoice_items.quantity * invoice_items.unit_price), 0) AS total
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    LEFT JOIN invoice_items ON invoice_items.invoice_id = invoices.id
    GROUP BY invoices.id
    ORDER BY invoices.issue_date DESC, invoices.id DESC
    LIMIT 20
  `).all();

  res.render("dashboard", { invoices, stats: dashboardStats() });
});

app.get("/api/cvr", requireAuth, async (req, res) => {
  try {
    const result = await lookupCvr(req.query.q || "");
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "LOOKUP_FAILED",
      message: error.message || "CVR-opslag fejlede."
    });
  }
});

app.get("/settings", requireAuth, (req, res) => {
  res.render("settings", { settings: getSettings(), saved: req.query.saved === "1" });
});


app.get("/settings/logo", requireAuth, (req, res) => {
  const settings = getSettings();
  const logoPath = getCompanyLogoPath(settings);

  if (!logoPath) {
    return renderMessage(res, 404, {
      title: "Logo ikke fundet",
      message: "Der er ikke uploadet et firmalogo endnu.",
      backHref: "/settings",
      backLabel: "Tilbage til indstillinger"
    });
  }

  res.setHeader("Content-Type", settings.logo_mime || "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(logoPath);
});

app.post("/settings", requireAuth, (req, res) => {
  logoUpload.single("logo")(req, res, (uploadError) => {
    if (uploadError) {
      return renderMessage(res, 400, {
        title: "Logo kunne ikke uploades",
        message: uploadError.message,
        backHref: "/settings",
        backLabel: "Tilbage til indstillinger"
      });
    }

    const currentSettings = getSettings();

    const fields = [
      "company_name", "cvr", "owner_name", "address", "zip_city", "phone", "email",
      "bank_name", "reg_no", "account_no", "iban", "bic", "mobilepay", "invoice_note",
      "smtp_host", "smtp_user", "smtp_pass", "smtp_from", "invoice_email_subject", "invoice_email_body",
      "imap_host", "imap_user", "imap_pass", "imap_mailbox", "email_signature"
    ];

    const values = {};
    for (const field of fields) values[field] = String(req.body[field] || "").trim();

    values.payment_days = Math.max(0, Number(req.body.payment_days || 8));
    values.smtp_port = Number(req.body.smtp_port || 587);
    values.smtp_secure = req.body.smtp_secure === "1" ? 1 : 0;
    values.imap_port = Number(req.body.imap_port || 993);
    values.imap_secure = req.body.imap_secure === "0" ? 0 : 1;

    values.logo_file = currentSettings.logo_file || "";
    values.logo_original_name = currentSettings.logo_original_name || "";
    values.logo_mime = currentSettings.logo_mime || "";

    if (req.body.remove_logo === "1") {
      const oldLogoPath = getCompanyLogoPath(currentSettings);
      if (oldLogoPath) {
        fs.unlinkSync(oldLogoPath);
      }

      values.logo_file = "";
      values.logo_original_name = "";
      values.logo_mime = "";
    }

    if (req.file) {
      const oldLogoPath = getCompanyLogoPath(currentSettings);
      if (oldLogoPath) {
        fs.unlinkSync(oldLogoPath);
      }

      values.logo_file = req.file.filename;
      values.logo_original_name = req.file.originalname || req.file.filename;
      values.logo_mime = req.file.mimetype || "";
    }

    db.prepare(`
      UPDATE settings SET
        company_name = @company_name,
        cvr = @cvr,
        owner_name = @owner_name,
        address = @address,
        zip_city = @zip_city,
        phone = @phone,
        email = @email,
        bank_name = @bank_name,
        reg_no = @reg_no,
        account_no = @account_no,
        iban = @iban,
        bic = @bic,
        mobilepay = @mobilepay,
        payment_days = @payment_days,
        invoice_note = @invoice_note,
        smtp_host = @smtp_host,
        smtp_port = @smtp_port,
        smtp_secure = @smtp_secure,
        smtp_user = @smtp_user,
        smtp_pass = @smtp_pass,
        smtp_from = @smtp_from,
        invoice_email_subject = @invoice_email_subject,
        invoice_email_body = @invoice_email_body,
        imap_host = @imap_host,
        imap_port = @imap_port,
        imap_secure = @imap_secure,
        imap_user = @imap_user,
        imap_pass = @imap_pass,
        imap_mailbox = @imap_mailbox,
        logo_file = @logo_file,
        logo_original_name = @logo_original_name,
        logo_mime = @logo_mime,
        email_signature = @email_signature
      WHERE id = 1
    `).run(values);

    res.redirect("/settings?saved=1");
  });
});

app.get("/customers", requireAuth, (req, res) => {
  const customers = db.prepare("SELECT * FROM customers ORDER BY name ASC").all();
  res.render("customers", { customers });
});

app.post("/customers", requireAuth, (req, res) => {
  db.prepare(`
    INSERT INTO customers (type, name, cvr, address, zip_city, email, phone)
    VALUES (@type, @name, @cvr, @address, @zip_city, @email, @phone)
  `).run({
    type: req.body.type === "company" ? "company" : "private",
    name: String(req.body.name || "").trim(),
    cvr: String(req.body.cvr || "").trim(),
    address: String(req.body.address || "").trim(),
    zip_city: String(req.body.zip_city || "").trim(),
    email: String(req.body.email || "").trim(),
    phone: String(req.body.phone || "").trim()
  });

  res.redirect("/customers");
});

app.get("/customers/:id/edit", requireAuth, (req, res) => {
  const customer = getCustomer(req.params.id);
  if (!customer) {
    return renderMessage(res, 404, {
      title: "Kunde ikke fundet",
      message: "Kunden findes ikke længere eller kunne ikke indlæses.",
      backHref: "/customers",
      backLabel: "Tilbage til kunder"
    });
  }
  res.render("customer-edit", { customer });
});

app.post("/customers/:id/edit", requireAuth, (req, res) => {
  db.prepare(`
    UPDATE customers SET
      type = @type,
      name = @name,
      cvr = @cvr,
      address = @address,
      zip_city = @zip_city,
      email = @email,
      phone = @phone
    WHERE id = @id
  `).run({
    id: Number(req.params.id),
    type: req.body.type === "company" ? "company" : "private",
    name: String(req.body.name || "").trim(),
    cvr: String(req.body.cvr || "").trim(),
    address: String(req.body.address || "").trim(),
    zip_city: String(req.body.zip_city || "").trim(),
    email: String(req.body.email || "").trim(),
    phone: String(req.body.phone || "").trim()
  });

  res.redirect("/customers");
});

app.post("/customers/:id/delete", requireAuth, (req, res) => {
  const used = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE customer_id = ?").get(req.params.id);
  if (used.count > 0) {
    return renderMessage(res, 400, {
      title: "Kunden kan ikke slettes",
      message: "Der findes allerede fakturaer til denne kunde. Af hensyn til regnskabshistorik bør kunden derfor bevares.",
      details: "Du kan i stedet redigere kundens oplysninger, eller slette de tilknyttede fakturaer først, hvis de kun var testdata.",
      backHref: `/customers/${req.params.id}/edit`,
      backLabel: "Tilbage til kunden",
      secondaryHref: "/customers",
      secondaryLabel: "Alle kunder"
    });
  }
  db.prepare("DELETE FROM customers WHERE id = ?").run(req.params.id);
  res.redirect("/customers");
});




app.get("/time", requireAuth, (req, res) => {
  const tasks = db.prepare(`
    SELECT
      t.*,
      c.name AS customer_name,
      i.invoice_no AS linked_invoice_no,
      ex.description AS linked_expense_description,
      (
        SELECT COUNT(*)
        FROM time_entries e
        WHERE e.task_id = t.id
          AND e.ended_at IS NULL
      ) AS running_count,
      (
        SELECT COALESCE(SUM(
          CASE
            WHEN e.ended_at IS NULL THEN e.duration_seconds + CAST((julianday('now') - julianday(e.started_at)) * 86400 AS INTEGER)
            ELSE e.duration_seconds
          END
        ), 0)
        FROM time_entries e
        WHERE e.task_id = t.id
      ) AS total_seconds
    FROM time_tasks t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN invoices i ON i.id = t.invoice_id
    LEFT JOIN expenses ex ON ex.id = t.expense_id
    ORDER BY
      CASE WHEN t.status = 'active' THEN 0 ELSE 1 END,
      t.created_at DESC,
      t.id DESC
  `).all();

  const customers = db.prepare("SELECT id, name FROM customers ORDER BY name COLLATE NOCASE ASC").all();

  const billingStats = tasks.reduce((acc, task) => {
    const seconds = Number(task.total_seconds || 0);
    const amount = (seconds / 3600) * Number(task.hourly_rate || 0);
    if (task.kind === "income" && !task.invoice_id) {
      acc.unbilledIncomeSeconds += seconds;
      acc.unbilledIncomeAmount += amount;
    }
    if (task.kind === "expense" && !task.expense_id) {
      acc.unbookedExpenseSeconds += seconds;
      acc.unbookedExpenseAmount += amount;
    }
    return acc;
  }, {
    unbilledIncomeSeconds: 0,
    unbilledIncomeAmount: 0,
    unbookedExpenseSeconds: 0,
    unbookedExpenseAmount: 0
  });

  res.render("time", {
    tasks,
    customers,
    billingStats,
    saved: req.query.saved === "1",
    invoiced: req.query.invoiced === "1",
    expensed: req.query.expensed === "1"
  });
});

app.post("/time/tasks", requireAuth, (req, res) => {
  const name = String(req.body.name || "").trim();
  const kind = req.body.kind === "expense" ? "expense" : "income";
  const customerId = req.body.customer_id ? Number(req.body.customer_id) : null;
  const hourlyRate = Math.max(0, Number(String(req.body.hourly_rate || "0").replace(",", ".")) || 0);
  const notes = String(req.body.notes || "").trim();

  if (!name) {
    return renderMessage(res, 400, {
      title: "Opgaven mangler navn",
      message: "Skriv et navn på opgaven før du gemmer.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  db.prepare(`
    INSERT INTO time_tasks (name, kind, customer_id, hourly_rate, notes)
    VALUES (@name, @kind, @customer_id, @hourly_rate, @notes)
  `).run({
    name,
    kind,
    customer_id: customerId,
    hourly_rate: hourlyRate,
    notes
  });

  res.redirect("/time?saved=1");
});

app.get("/time/tasks/:id", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  const entries = db.prepare(`
    SELECT *
    FROM time_entries
    WHERE task_id = ?
    ORDER BY started_at DESC, id DESC
  `).all(task.id);

  const customers = db.prepare("SELECT id, name FROM customers ORDER BY name COLLATE NOCASE ASC").all();

  const billingSummary = getTimeTaskBillingSummary(task.id);
  billingSummary.amount = billingSummary.hours * Number(task.hourly_rate || 0);

  res.render("time-task", {
    task,
    entries,
    customers,
    openEntry: getOpenTimeEntry(task.id),
    billingSummary
  });
});

app.post("/time/tasks/:id/update", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  const name = String(req.body.name || "").trim();
  const kind = req.body.kind === "expense" ? "expense" : "income";
  const customerId = req.body.customer_id ? Number(req.body.customer_id) : null;
  const hourlyRate = Math.max(0, Number(String(req.body.hourly_rate || "0").replace(",", ".")) || 0);
  const notes = String(req.body.notes || "").trim();

  if (!name) {
    return renderMessage(res, 400, {
      title: "Opgaven mangler navn",
      message: "Skriv et navn på opgaven før du gemmer.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  db.prepare(`
    UPDATE time_tasks SET
      name = @name,
      kind = @kind,
      customer_id = @customer_id,
      hourly_rate = @hourly_rate,
      notes = @notes
    WHERE id = @id
  `).run({
    id: task.id,
    name,
    kind,
    customer_id: customerId,
    hourly_rate: hourlyRate,
    notes
  });

  res.redirect(`/time/tasks/${task.id}`);
});

app.post("/time/tasks/:id/start", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  if (task.status !== "active") {
    return renderMessage(res, 400, {
      title: "Opgaven er lukket",
      message: "Du kan ikke starte timer på en lukket opgave.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const existing = getOpenTimeEntry(task.id);
  if (!existing) {
    db.prepare(`
      INSERT INTO time_entries (task_id, started_at, note)
      VALUES (?, ?, ?)
    `).run(task.id, new Date().toISOString(), String(req.body.note || "").trim());
  }

  res.redirect(`/time/tasks/${task.id}`);
});

app.post("/time/tasks/:id/stop", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  const openEntry = getOpenTimeEntry(task.id);

  if (openEntry) {
    const endedAt = new Date().toISOString();
    const durationSeconds = secondsBetween(openEntry.started_at, endedAt);

    db.prepare(`
      UPDATE time_entries SET
        ended_at = @ended_at,
        duration_seconds = @duration_seconds
      WHERE id = @id
    `).run({
      id: openEntry.id,
      ended_at: endedAt,
      duration_seconds: durationSeconds
    });
  }

  res.redirect(`/time/tasks/${task.id}`);
});

app.post("/time/tasks/:id/manual-entry", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  const startedAt = datetimeLocalToIso(req.body.started_at);
  const endedAt = datetimeLocalToIso(req.body.ended_at);
  const note = String(req.body.note || "").trim();

  if (!startedAt || !endedAt || new Date(endedAt) <= new Date(startedAt)) {
    return renderMessage(res, 400, {
      title: "Ugyldig tidsregistrering",
      message: "Starttid og sluttid skal udfyldes, og sluttid skal være efter starttid.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  db.prepare(`
    INSERT INTO time_entries (task_id, started_at, ended_at, duration_seconds, note)
    VALUES (@task_id, @started_at, @ended_at, @duration_seconds, @note)
  `).run({
    task_id: task.id,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: secondsBetween(startedAt, endedAt),
    note
  });

  res.redirect(`/time/tasks/${task.id}`);
});

app.post("/time/entries/:id/delete", requireAuth, (req, res) => {
  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id);

  if (!entry) {
    return res.redirect("/time");
  }

  db.prepare("DELETE FROM time_entries WHERE id = ?").run(entry.id);
  res.redirect(`/time/tasks/${entry.task_id}`);
});

app.post("/time/tasks/:id/toggle-status", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  if (task.status === "active") {
    const openEntry = getOpenTimeEntry(task.id);
    if (openEntry) {
      const endedAt = new Date().toISOString();
      db.prepare(`
        UPDATE time_entries SET ended_at = ?, duration_seconds = ?
        WHERE id = ?
      `).run(endedAt, secondsBetween(openEntry.started_at, endedAt), openEntry.id);
    }

    db.prepare("UPDATE time_tasks SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
  } else {
    db.prepare("UPDATE time_tasks SET status = 'active', closed_at = NULL WHERE id = ?").run(task.id);
  }

  res.redirect(`/time/tasks/${task.id}`);
});


app.post("/time/tasks/:id/create-invoice", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  if (task.kind !== "income") {
    return renderMessage(res, 400, {
      title: "Kan ikke oprette faktura",
      message: "Kun tidsopgaver af typen Indtægt kan overføres til en faktura.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  if (task.invoice_id) {
    return res.redirect(`/invoices/${task.invoice_id}`);
  }

  if (!task.customer_id) {
    return renderMessage(res, 400, {
      title: "Kunde mangler",
      message: "Vælg en kunde på tidsopgaven, før du opretter en faktura.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  if (getOpenTimeEntry(task.id)) {
    return renderMessage(res, 400, {
      title: "Timeren kører stadig",
      message: "Stop timeren, før opgaven overføres til en faktura.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const summary = getTimeTaskBillingSummary(task.id);
  if (!summary.entry_count || summary.total_seconds <= 0) {
    return renderMessage(res, 400, {
      title: "Ingen afsluttet tid",
      message: "Opgaven har ingen afsluttede tidsregistreringer at fakturere.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const hourlyRate = Number(task.hourly_rate || 0);
  if (hourlyRate <= 0) {
    return renderMessage(res, 400, {
      title: "Timepris mangler",
      message: "Angiv en timepris på opgaven, før du opretter fakturaen.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const settings = getSettings();
  const issueDate = dayjs().format("YYYY-MM-DD");
  const dueDate = dayjs().add(Number(settings.payment_days || 8), "day").format("YYYY-MM-DD");
  const invoiceNo = nextInvoiceNo(issueDate);
  const description = buildTimeTaskLineDescription(task, summary);

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO invoices (invoice_no, customer_id, issue_date, due_date, status, notes, source_time_task_id)
      VALUES (@invoice_no, @customer_id, @issue_date, @due_date, @status, @notes, @source_time_task_id)
    `).run({
      invoice_no: invoiceNo,
      customer_id: Number(task.customer_id),
      issue_date: issueDate,
      due_date: dueDate,
      status: "draft",
      notes: String(req.body.notes || task.billing_note || "").trim(),
      source_time_task_id: task.id
    });

    const invoiceId = result.lastInsertRowid;
    db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (?, ?, ?, ?, 0)
    `).run(invoiceId, description, summary.hours, hourlyRate);

    db.prepare(`
      UPDATE time_tasks
      SET invoice_id = ?, billed_at = CURRENT_TIMESTAMP, status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(invoiceId, task.id);

    return invoiceId;
  });

  const invoiceId = create();
  res.redirect(`/invoices/${invoiceId}?from_time=1`);
});

app.post("/time/tasks/:id/create-expense", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (!task) {
    return renderMessage(res, 404, {
      title: "Opgave ikke fundet",
      message: "Opgaven findes ikke længere.",
      backHref: "/time",
      backLabel: "Tilbage til Tid"
    });
  }

  if (task.kind !== "expense") {
    return renderMessage(res, 400, {
      title: "Kan ikke oprette udgift",
      message: "Kun tidsopgaver af typen Udgift kan overføres til udgifter.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  if (task.expense_id) {
    return res.redirect("/expenses");
  }

  if (getOpenTimeEntry(task.id)) {
    return renderMessage(res, 400, {
      title: "Timeren kører stadig",
      message: "Stop timeren, før opgaven overføres til en udgift.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const summary = getTimeTaskBillingSummary(task.id);
  const hourlyRate = Number(task.hourly_rate || 0);
  const amount = roundQuantity(summary.hours * hourlyRate, 2);

  if (!summary.entry_count || summary.total_seconds <= 0) {
    return renderMessage(res, 400, {
      title: "Ingen afsluttet tid",
      message: "Opgaven har ingen afsluttede tidsregistreringer at bogføre.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  if (amount <= 0) {
    return renderMessage(res, 400, {
      title: "Beløb mangler",
      message: "Angiv en sats/timepris på opgaven, før du opretter udgiften.",
      backHref: `/time/tasks/${task.id}`,
      backLabel: "Tilbage til opgaven"
    });
  }

  const description = `Tidsudgift: ${task.name}`;
  const notes = [
    buildTimeTaskLineDescription(task, summary),
    task.notes ? `Opgavenote: ${task.notes}` : ""
  ].filter(Boolean).join("\n\n");

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO expenses (
        expense_date, description, supplier, category, amount, bilag_no,
        receipt_file, receipt_original_name, receipt_mime, notes, source_time_task_id
      )
      VALUES (
        @expense_date, @description, @supplier, @category, @amount, '',
        '', '', '', @notes, @source_time_task_id
      )
    `).run({
      expense_date: dayjs().format("YYYY-MM-DD"),
      description,
      supplier: task.customer_name || "",
      category: "Tidsforbrug",
      amount,
      notes,
      source_time_task_id: task.id
    });

    const expenseId = result.lastInsertRowid;
    db.prepare(`
      UPDATE time_tasks
      SET expense_id = ?, billed_at = CURRENT_TIMESTAMP, status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(expenseId, task.id);

    return expenseId;
  });

  create();
  res.redirect("/time?expensed=1");
});

app.post("/time/tasks/:id/clear-billing", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);
  if (task) {
    db.prepare(`
      UPDATE time_tasks
      SET invoice_id = NULL, expense_id = NULL, billed_at = NULL
      WHERE id = ?
    `).run(task.id);
  }
  res.redirect(`/time/tasks/${req.params.id}`);
});

app.post("/time/tasks/:id/delete", requireAuth, (req, res) => {
  const task = getTimeTask(req.params.id);

  if (task) {
    db.prepare("DELETE FROM time_tasks WHERE id = ?").run(task.id);
  }

  res.redirect("/time");
});


app.get("/documents", requireAuth, (req, res) => {
  const documents = db.prepare(`
    SELECT *
    FROM company_documents
    ORDER BY
      CASE WHEN document_date = '' THEN 1 ELSE 0 END,
      document_date DESC,
      created_at DESC,
      id DESC
  `).all();

  res.render("documents", {
    documents,
    saved: req.query.saved === "1"
  });
});

app.post("/documents", requireAuth, (req, res) => {
  documentUpload.single("document")(req, res, (error) => {
    if (error) {
      return renderMessage(res, 400, {
        title: "Dokumentet kunne ikke uploades",
        message: error.message,
        backHref: "/documents",
        backLabel: "Tilbage til dokumenter"
      });
    }

    if (!req.file) {
      return renderMessage(res, 400, {
        title: "Dokument mangler",
        message: "Vælg en fil, før du gemmer dokumentet.",
        backHref: "/documents",
        backLabel: "Tilbage"
      });
    }

    db.prepare(`
      INSERT INTO company_documents (
        title,
        category,
        document_date,
        file_name,
        original_name,
        mime_type,
        size_bytes,
        notes
      )
      VALUES (
        @title,
        @category,
        @document_date,
        @file_name,
        @original_name,
        @mime_type,
        @size_bytes,
        @notes
      )
    `).run({
      title: String(req.body.title || req.file.originalname || "Dokument").trim(),
      category: String(req.body.category || "Diverse").trim(),
      document_date: String(req.body.document_date || "").trim(),
      file_name: req.file.filename,
      original_name: req.file.originalname || req.file.filename,
      mime_type: req.file.mimetype || "",
      size_bytes: req.file.size || 0,
      notes: String(req.body.notes || "").trim()
    });

    res.redirect("/documents?saved=1");
  });
});

app.get("/documents/:id/file", requireAuth, (req, res) => {
  const document = db.prepare("SELECT * FROM company_documents WHERE id = ?").get(req.params.id);

  if (!document) {
    return renderMessage(res, 404, {
      title: "Dokument ikke fundet",
      message: "Dokumentet findes ikke længere.",
      backHref: "/documents",
      backLabel: "Tilbage til dokumenter"
    });
  }

  const filePath = path.join(DOCUMENT_DIR, document.file_name);

  if (!fs.existsSync(filePath)) {
    return renderMessage(res, 404, {
      title: "Dokumentfil mangler",
      message: "Dokumentet findes i databasen, men selve filen mangler på disken.",
      details: "Tjek om ./data/uploads/documents er blevet flyttet eller ikke er med i backup.",
      backHref: "/documents",
      backLabel: "Tilbage til dokumenter"
    });
  }

  res.setHeader("Content-Type", document.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(document.original_name)}"`);
  res.sendFile(filePath);
});

app.post("/documents/:id/delete", requireAuth, (req, res) => {
  const document = db.prepare("SELECT * FROM company_documents WHERE id = ?").get(req.params.id);

  if (document) {
    const filePath = path.join(DOCUMENT_DIR, document.file_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare("DELETE FROM company_documents WHERE id = ?").run(req.params.id);
  }

  res.redirect("/documents");
});

app.get("/recurring-expenses", requireAuth, (req, res) => {
  const recurring = db.prepare(`
    SELECT * FROM recurring_expenses
    ORDER BY active DESC, next_date ASC, id DESC
  `).all();

  res.render("recurring-expenses", {
    recurring,
    created: req.query.created || "",
    saved: req.query.saved === "1"
  });
});

app.post("/recurring-expenses", requireAuth, (req, res) => {
  const startDate = req.body.start_date || dayjs().format("YYYY-MM-DD");

  db.prepare(`
    INSERT INTO recurring_expenses (
      description, supplier, category, amount, frequency,
      start_date, next_date, active, bilag_prefix, notes
    )
    VALUES (
      @description, @supplier, @category, @amount, @frequency,
      @start_date, @next_date, @active, @bilag_prefix, @notes
    )
  `).run({
    description: String(req.body.description || "").trim(),
    supplier: String(req.body.supplier || "").trim(),
    category: String(req.body.category || "Diverse").trim(),
    amount: parseAmount(req.body.amount),
    frequency: ["weekly", "monthly", "quarterly", "yearly"].includes(req.body.frequency) ? req.body.frequency : "monthly",
    start_date: startDate,
    next_date: req.body.next_date || startDate,
    active: req.body.active === "0" ? 0 : 1,
    bilag_prefix: String(req.body.bilag_prefix || "").trim(),
    notes: String(req.body.notes || "").trim()
  });

  res.redirect("/recurring-expenses?saved=1");
});

app.post("/recurring-expenses/generate", requireAuth, (req, res) => {
  const untilDate = req.body.until_date || dayjs().format("YYYY-MM-DD");
  const created = generateDueRecurringExpenses(untilDate);
  res.redirect(`/recurring-expenses?created=${created}`);
});

app.post("/recurring-expenses/:id/toggle", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(req.params.id);
  if (!item) {
    return renderMessage(res, 404, {
      title: "Tilbagevendende udgift ikke fundet",
      message: "Udgiften findes ikke længere.",
      backHref: "/recurring-expenses",
      backLabel: "Tilbage"
    });
  }

  db.prepare("UPDATE recurring_expenses SET active = ? WHERE id = ?").run(item.active ? 0 : 1, req.params.id);
  res.redirect("/recurring-expenses");
});

app.post("/recurring-expenses/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM recurring_expenses WHERE id = ?").run(req.params.id);
  res.redirect("/recurring-expenses");
});

app.get("/expenses", requireAuth, (req, res) => {
  const expenses = db.prepare("SELECT * FROM expenses ORDER BY expense_date DESC, id DESC").all();
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  res.render("expenses", { expenses, total });
});

app.post("/expenses", requireAuth, uploadReceipt.single("receipt"), (req, res) => {
  db.prepare(`
    INSERT INTO expenses (
      expense_date,
      description,
      supplier,
      category,
      amount,
      bilag_no,
      receipt_file,
      receipt_original_name,
      receipt_mime,
      notes
    )
    VALUES (
      @expense_date,
      @description,
      @supplier,
      @category,
      @amount,
      @bilag_no,
      @receipt_file,
      @receipt_original_name,
      @receipt_mime,
      @notes
    )
  `).run({
    expense_date: req.body.expense_date || dayjs().format("YYYY-MM-DD"),
    description: String(req.body.description || "").trim(),
    supplier: String(req.body.supplier || "").trim(),
    category: String(req.body.category || "Diverse").trim(),
    amount: parseAmount(req.body.amount),
    bilag_no: String(req.body.bilag_no || "").trim(),
    receipt_file: req.file ? req.file.filename : "",
    receipt_original_name: req.file ? req.file.originalname : "",
    receipt_mime: req.file ? req.file.mimetype : "",
    notes: String(req.body.notes || "").trim()
  });

  res.redirect("/expenses");
});

app.get("/expenses/:id/receipt", requireAuth, (req, res) => {
  const expense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
  if (!expense || !expense.receipt_file) {
    return renderMessage(res, 404, {
      title: "Kvittering ikke fundet",
      message: "Der er ikke tilknyttet en kvittering til denne udgift.",
      backHref: "/expenses",
      backLabel: "Tilbage til udgifter"
    });
  }

  const filePath = path.join(RECEIPT_DIR, expense.receipt_file);
  if (!filePath.startsWith(RECEIPT_DIR) || !fs.existsSync(filePath)) {
    return renderMessage(res, 404, {
      title: "Kvitteringsfil ikke fundet",
      message: "Udgiften findes, men selve filen mangler på serveren.",
      details: "Tjek om data-mappen er blevet flyttet, gendannet uden uploads eller ikke er mounted korrekt i Docker.",
      backHref: "/expenses",
      backLabel: "Tilbage til udgifter"
    });
  }

  res.setHeader("Content-Type", expense.receipt_mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(expense.receipt_original_name || expense.receipt_file)}"`);
  res.sendFile(filePath);
});

app.post("/expenses/:id/delete", requireAuth, (req, res) => {
  const expense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);

  if (expense && expense.receipt_file) {
    const filePath = path.join(RECEIPT_DIR, expense.receipt_file);
    if (filePath.startsWith(RECEIPT_DIR) && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore file deletion errors.
      }
    }
  }

  db.prepare("UPDATE time_tasks SET expense_id = NULL, billed_at = NULL WHERE expense_id = ?").run(req.params.id);
  db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
  res.redirect("/expenses");
});






app.get("/api/mail/unread-count", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const accounts = getMailAccounts(true).filter((account) => imapConfigured(account));

  if (!accounts.length) {
    return res.json({ unread: 0, accounts: [] });
  }

  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const unread = await withTimeout(getUnreadCount(account), 1800, 0);
      return {
        id: account.id,
        name: account.name,
        email: account.email || account.imap_user,
        unread
      };
    })
  );

  const accountCounts = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const account = accounts[index];
    return {
      id: account.id,
      name: account.name,
      email: account.email || account.imap_user,
      unread: 0,
      error: result.reason?.message || "Kunne ikke hente ulæste mails"
    };
  });

  const unread = accountCounts.reduce((sum, account) => sum + Number(account.unread || 0), 0);

  res.json({ unread, accounts: accountCounts });
});

app.get("/mail-accounts", requireAuth, (req, res) => {
  const accounts = db.prepare(`
    SELECT * FROM email_accounts
    ORDER BY active DESC, name ASC, email ASC
  `).all();

  res.render("mail-accounts", {
    accounts,
    saved: req.query.saved === "1"
  });
});

app.post("/mail-accounts", requireAuth, (req, res) => {
  db.prepare(`
    INSERT INTO email_accounts (
      name, email, display_name,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
      imap_host, imap_port, imap_secure, imap_user, imap_pass, imap_mailbox,
      active
    )
    VALUES (
      @name, @email, @display_name,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass,
      @imap_host, @imap_port, @imap_secure, @imap_user, @imap_pass, @imap_mailbox,
      @active
    )
  `).run({
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim(),
    display_name: String(req.body.display_name || "").trim(),
    smtp_host: String(req.body.smtp_host || "").trim(),
    smtp_port: Number(req.body.smtp_port || 587),
    smtp_secure: req.body.smtp_secure === "1" ? 1 : 0,
    smtp_user: String(req.body.smtp_user || "").trim(),
    smtp_pass: String(req.body.smtp_pass || ""),
    imap_host: String(req.body.imap_host || "").trim(),
    imap_port: Number(req.body.imap_port || 993),
    imap_secure: req.body.imap_secure === "0" ? 0 : 1,
    imap_user: String(req.body.imap_user || "").trim(),
    imap_pass: String(req.body.imap_pass || ""),
    imap_mailbox: String(req.body.imap_mailbox || "INBOX").trim(),
    active: req.body.active === "0" ? 0 : 1
  });

  res.redirect("/mail-accounts?saved=1");
});

app.post("/mail-accounts/:id/toggle", requireAuth, (req, res) => {
  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(req.params.id);
  if (!account) {
    return renderMessage(res, 404, {
      title: "Mailkonto ikke fundet",
      message: "Mailkontoen findes ikke længere.",
      backHref: "/mail-accounts",
      backLabel: "Tilbage"
    });
  }

  db.prepare("UPDATE email_accounts SET active = ? WHERE id = ?").run(account.active ? 0 : 1, req.params.id);
  res.redirect("/mail-accounts");
});

app.post("/mail-accounts/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM email_accounts WHERE id = ?").run(req.params.id);
  res.redirect("/mail-accounts");
});


app.post("/mail/:uid/mark-read", requireAuth, async (req, res) => {
  const accountId = req.body.account || req.query.account || "settings";
  const account = getMailAccount(accountId);

  if (!account || !imapConfigured(account)) {
    return renderMessage(res, 400, {
      title: "IMAP er ikke sat op",
      message: "Mailkontoen kan ikke ændre læst-status.",
      backHref: "/mail",
      backLabel: "Tilbage til Mail"
    });
  }

  try {
    await setMessageSeen(account, req.params.uid, true);
    res.redirect(`/mail/${req.params.uid}?account=${accountId}`);
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Mail kunne ikke markeres som læst",
      message: error.message || "IMAP-serveren returnerede en fejl.",
      backHref: `/mail/${req.params.uid}?account=${accountId}`,
      backLabel: "Tilbage til mail"
    });
  }
});

app.post("/mail/:uid/mark-unread", requireAuth, async (req, res) => {
  const accountId = req.body.account || req.query.account || "settings";
  const account = getMailAccount(accountId);

  if (!account || !imapConfigured(account)) {
    return renderMessage(res, 400, {
      title: "IMAP er ikke sat op",
      message: "Mailkontoen kan ikke ændre læst-status.",
      backHref: "/mail",
      backLabel: "Tilbage til Mail"
    });
  }

  try {
    await setMessageSeen(account, req.params.uid, false);
    res.redirect(`/mail?account=${accountId}`);
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Mail kunne ikke markeres som ulæst",
      message: error.message || "IMAP-serveren returnerede en fejl.",
      backHref: `/mail/${req.params.uid}?account=${accountId}`,
      backLabel: "Tilbage til mail"
    });
  }
});

app.get("/mail/compose/new", requireAuth, (req, res) => {
  const accounts = getMailAccounts(true);
  const selectedAccountId = req.query.account || firstSendableMailAccountId(accounts) || "settings";

  res.render("mail-compose", {
    accounts,
    selectedAccountId,
    customerEmails: getCustomerEmailSuggestions(),
    to: req.query.to || "",
    subject: req.query.subject || "",
    body: req.query.body || "",
    replyAccountId: "",
    replyUid: ""
  });
});

app.get("/mail/:uid/reply", requireAuth, async (req, res) => {
  const selectedAccountId = req.query.account || "settings";
  const account = getMailAccount(selectedAccountId);

  if (!account || !imapConfigured(account)) {
    return renderMessage(res, 400, {
      title: "IMAP er ikke sat op",
      message: "Mailkontoen kan ikke læse den mail, du vil svare på.",
      backHref: "/mail",
      backLabel: "Tilbage til Mail"
    });
  }

  try {
    const message = await readMessage(account, req.params.uid, true);
    if (!message) {
      return renderMessage(res, 404, {
        title: "Email ikke fundet",
        message: "Mailen findes ikke længere i indbakken.",
        backHref: `/mail?account=${selectedAccountId}`,
        backLabel: "Tilbage til Mail"
      });
    }

    const accounts = getMailAccounts(true);
    const quoted = message.text
      ? `\\n\\n--- Oprindelig besked ---\\nFra: ${message.from}\\nDato: ${message.date ? new Date(message.date).toLocaleString("da-DK") : ""}\\nEmne: ${message.subject}\\n\\n${message.text}`
      : "";

    res.render("mail-compose", {
      accounts,
      selectedAccountId,
      customerEmails: getCustomerEmailSuggestions(),
      to: extractReplyTo(message),
      subject: replySubject(message.subject),
      body: quoted,
      replyAccountId: selectedAccountId,
      replyUid: req.params.uid
    });
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Svar kunne ikke oprettes",
      message: error.message || "Mailen kunne ikke indlæses.",
      backHref: `/mail/${req.params.uid}?account=${selectedAccountId}`,
      backLabel: "Tilbage til mail"
    });
  }
});

app.post("/mail/send", requireAuth, async (req, res) => {
  const accountId = req.body.account || "settings";
  const account = getMailAccount(accountId);

  if (!mailAccountSmtpReady(account)) {
    return renderMessage(res, 400, {
      title: "SMTP er ikke sat op",
      message: "Den valgte mailkonto mangler SMTP-oplysninger.",
      backHref: "/mail-accounts",
      backLabel: "Mailkonti"
    });
  }

  const to = String(req.body.to || "").trim();
  const subject = String(req.body.subject || "").trim();
  const body = String(req.body.body || "").trim();

  if (!to || !subject || !body) {
    return renderMessage(res, 400, {
      title: "Mail mangler indhold",
      message: "Udfyld modtager, emne og besked.",
      backHref: "/mail/compose/new",
      backLabel: "Tilbage"
    });
  }

  try {
    const transporter = createAccountTransport(account);

    await transporter.sendMail({
      from: accountFromAddress(account),
      to,
      subject,
      text: appendEmailSignature(body, account.email_signature || getSettings().email_signature)
    });

    return renderMessage(res, 200, {
      icon: "✓",
      title: "Email sendt",
      message: `Email blev sendt til ${to}.`,
      backHref: `/mail?account=${accountId}`,
      backLabel: "Tilbage til Mail",
      secondaryHref: "/mail/compose/new",
      secondaryLabel: "Skriv ny"
    });
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Email kunne ikke sendes",
      message: error.message || "SMTP-serveren afviste afsendelsen.",
      details: "Tjek SMTP host, port, TLS/SSL, brugernavn, adgangskode og afsenderadresse.",
      backHref: "/mail/compose/new",
      backLabel: "Prøv igen",
      secondaryHref: "/mail-accounts",
      secondaryLabel: "Mailkonti"
    });
  }
});


function withTimeout(promise, ms, fallbackValue) {
  let timeoutId;

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function accountFromSettings(settings) {
  const email = settings.imap_user || settings.smtp_user || settings.email || "";
  return {
    id: "settings",
    name: email ? `Standard (${email})` : "Standard mailkonto",
    email,
    display_name: settings.company_name || "",
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port,
    smtp_secure: settings.smtp_secure,
    smtp_user: settings.smtp_user,
    smtp_pass: settings.smtp_pass,
    imap_host: settings.imap_host,
    imap_port: settings.imap_port,
    imap_secure: settings.imap_secure,
    imap_user: settings.imap_user,
    imap_pass: settings.imap_pass,
    imap_mailbox: settings.imap_mailbox || "INBOX",
    active: 1
  };
}


function getCustomerEmailSuggestions() {
  return db.prepare(`
    SELECT id, name, email
    FROM customers
    WHERE email IS NOT NULL
      AND trim(email) != ''
    ORDER BY name COLLATE NOCASE ASC
  `).all();
}

function getMailAccounts(includeSettings = true) {
  const accounts = db.prepare(`
    SELECT * FROM email_accounts
    WHERE active = 1
    ORDER BY name ASC, email ASC
  `).all();

  if (includeSettings) {
    const settingsAccount = accountFromSettings(getSettings());

    // Only show the legacy/default settings account if it actually has mail server settings.
    // A company email alone is not enough, because it creates a non-working "Standard" account.
    if (settingsAccount.imap_host || settingsAccount.smtp_host) {
      accounts.unshift(settingsAccount);
    }
  }

  return accounts;
}

function getMailAccount(id) {
  if (!id || id === "settings") {
    return accountFromSettings(getSettings());
  }

  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(id);
  return account || null;
}

function accountFromAddress(account) {
  const email = account.email || account.smtp_user || account.imap_user;
  if (account.display_name && email) return `${account.display_name} <${email}>`;
  return email || account.smtp_user || account.imap_user;
}

function mailAccountSmtpReady(account) {
  return Boolean(account && account.smtp_host && account.smtp_port && account.smtp_user && account.smtp_pass);
}

function firstReadableMailAccountId(accounts) {
  const readable = accounts.find((account) => imapConfigured(account));
  return readable ? String(readable.id) : (accounts[0] ? String(accounts[0].id) : "");
}

function firstSendableMailAccountId(accounts) {
  const sendable = accounts.find((account) => mailAccountSmtpReady(account));
  return sendable ? String(sendable.id) : (accounts[0] ? String(accounts[0].id) : "");
}

function createAccountTransport(account) {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: Number(account.smtp_port || 587),
    secure: Number(account.smtp_secure || 0) === 1,
    auth: {
      user: account.smtp_user,
      pass: account.smtp_pass
    }
  });
}

function replySubject(subject) {
  const clean = String(subject || "").trim();
  if (/^re:/i.test(clean)) return clean;
  return `Re: ${clean || "(uden emne)"}`;
}

function extractReplyTo(message) {
  const from = String(message.from || "").trim();
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

app.get("/mail", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const accounts = getMailAccounts(true);
  const selectedAccountId = req.query.account || firstReadableMailAccountId(accounts) || "settings";
  const account = getMailAccount(selectedAccountId);

  if (!account || !imapConfigured(account)) {
    return res.render("mail", {
      configured: false,
      accounts,
      selectedAccountId,
      messages: [],
      error: "",
      limit: 25
    });
  }

  const limit = Math.min(100, Math.max(5, Number(req.query.limit || 25)));

  try {
    const messages = await listInboxMessages(account, limit);
    res.render("mail", {
      configured: true,
      accounts,
      selectedAccountId,
      messages,
      error: "",
      limit
    });
  } catch (error) {
    res.render("mail", {
      configured: true,
      accounts,
      selectedAccountId,
      messages: [],
      error: error.message || "Kunne ikke hente emails.",
      limit
    });
  }
});

app.get("/mail/:uid", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const selectedAccountId = req.query.account || "settings";
  const account = getMailAccount(selectedAccountId);

  if (!account || !imapConfigured(account)) {
    return renderMessage(res, 400, {
      title: "IMAP er ikke sat op",
      message: "Udfyld IMAP-indstillinger under Indstillinger eller Mailkonti, før du kan læse mails.",
      backHref: "/mail-accounts",
      backLabel: "Gå til mailkonti"
    });
  }

  try {
    const message = await readMessage(account, req.params.uid, true);
    if (!message) {
      return renderMessage(res, 404, {
        title: "Email ikke fundet",
        message: "Mailen findes ikke længere i indbakken.",
        backHref: `/mail?account=${selectedAccountId}`,
        backLabel: "Tilbage til Mail"
      });
    }

    res.render("mail-view", { message, accountId: selectedAccountId });
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Email kunne ikke indlæses",
      message: error.message || "IMAP-serveren returnerede en fejl.",
      details: "Tjek IMAP host, port, SSL/TLS, brugernavn og adgangskode.",
      backHref: `/mail?account=${selectedAccountId}`,
      backLabel: "Tilbage til Mail",
      secondaryHref: "/mail-accounts",
      secondaryLabel: "Mailkonti"
    });
  }
});

app.get("/reports", requireAuth, (req, res) => {
  const today = dayjs();
  const from = req.query.from || today.startOf("year").format("YYYY-MM-DD");
  const to = req.query.to || today.format("YYYY-MM-DD");
  const data = getAccountingReportData(from, to);

  res.render("reports", {
    from,
    to,
    invoices: data.invoices,
    expenses: data.expenses,
    totals: data.totals
  });
});

app.get("/reports/pdf", requireAuth, (req, res) => {
  const today = dayjs();
  const from = req.query.from || today.startOf("year").format("YYYY-MM-DD");
  const to = req.query.to || today.format("YYYY-MM-DD");
  const data = getAccountingReportData(from, to);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="regnskabsrapport-${from}-til-${to}.pdf"`);

  const settings = getSettings();
  const doc = accountingReportPdfStream({
    settings,
    logoPath: getCompanyLogoPath(settings),
    from,
    to,
    invoices: data.invoices,
    expenses: data.expenses,
    totals: data.totals
  });

  doc.pipe(res);
});

app.get("/invoices/new", requireAuth, (req, res) => {
  const customers = db.prepare("SELECT * FROM customers ORDER BY name ASC").all();
  const settings = getSettings();
  const issueDate = dayjs().format("YYYY-MM-DD");
  const dueDate = dayjs().add(Number(settings.payment_days || 8), "day").format("YYYY-MM-DD");

  res.render("invoice-new", {
    customers,
    issueDate,
    dueDate
  });
});

app.post("/invoices", requireAuth, (req, res) => {
  const issueDate = req.body.issue_date || dayjs().format("YYYY-MM-DD");
  const invoiceNo = nextInvoiceNo(issueDate);

  const descriptions = Array.isArray(req.body.description) ? req.body.description : [req.body.description];
  const quantities = Array.isArray(req.body.quantity) ? req.body.quantity : [req.body.quantity];
  const prices = Array.isArray(req.body.unit_price) ? req.body.unit_price : [req.body.unit_price];

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO invoices (invoice_no, customer_id, issue_date, due_date, status, notes)
      VALUES (@invoice_no, @customer_id, @issue_date, @due_date, @status, @notes)
    `).run({
      invoice_no: invoiceNo,
      customer_id: Number(req.body.customer_id),
      issue_date: issueDate,
      due_date: req.body.due_date || issueDate,
      status: req.body.status || "draft",
      notes: String(req.body.notes || "").trim()
    });

    const invoiceId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    descriptions.forEach((description, index) => {
      const cleanDescription = String(description || "").trim();
      if (!cleanDescription) return;

      insertItem.run(
        invoiceId,
        cleanDescription,
        parseAmount(quantities[index] || "1"),
        parseAmount(prices[index] || "0"),
        index
      );
    });

    return invoiceId;
  });

  const invoiceId = create();
  res.redirect(`/invoices/${invoiceId}`);
});


app.get("/invoices/:id/edit", requireAuth, (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const customers = db.prepare("SELECT * FROM customers ORDER BY name ASC").all();
  const items = getItems(invoice.id);

  res.render("invoice-edit", {
    invoice,
    customers,
    items
  });
});

app.post("/invoices/:id/update", requireAuth, (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const descriptions = Array.isArray(req.body.description) ? req.body.description : [req.body.description];
  const quantities = Array.isArray(req.body.quantity) ? req.body.quantity : [req.body.quantity];
  const prices = Array.isArray(req.body.unit_price) ? req.body.unit_price : [req.body.unit_price];

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE invoices SET
        customer_id = @customer_id,
        issue_date = @issue_date,
        due_date = @due_date,
        status = @status,
        notes = @notes
      WHERE id = @id
    `).run({
      id: invoice.id,
      customer_id: Number(req.body.customer_id),
      issue_date: req.body.issue_date || invoice.issue_date,
      due_date: req.body.due_date || invoice.due_date,
      status: ["draft", "sent", "paid"].includes(req.body.status) ? req.body.status : "draft",
      notes: String(req.body.notes || "").trim()
    });

    db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(invoice.id);

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    descriptions.forEach((description, index) => {
      const cleanDescription = String(description || "").trim();
      if (!cleanDescription) return;

      insertItem.run(
        invoice.id,
        cleanDescription,
        parseAmount(quantities[index] || "1"),
        parseAmount(prices[index] || "0"),
        index
      );
    });
  });

  update();
  res.redirect(`/invoices/${invoice.id}?saved=1`);
});

app.post("/invoices/:id/duplicate", requireAuth, (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const items = getItems(invoice.id);
  const settings = getSettings();
  const issueDate = dayjs().format("YYYY-MM-DD");
  const dueDate = dayjs().add(Number(settings.payment_days || 8), "day").format("YYYY-MM-DD");
  const invoiceNo = nextInvoiceNo(issueDate);

  const duplicate = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO invoices (invoice_no, customer_id, issue_date, due_date, status, notes)
      VALUES (@invoice_no, @customer_id, @issue_date, @due_date, 'draft', @notes)
    `).run({
      invoice_no: invoiceNo,
      customer_id: invoice.customer_id,
      issue_date: issueDate,
      due_date: dueDate,
      notes: invoice.notes || ""
    });

    const newInvoiceId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    items.forEach((item, index) => {
      insertItem.run(newInvoiceId, item.description, item.quantity, item.unit_price, index);
    });

    return newInvoiceId;
  });

  const newInvoiceId = duplicate();
  res.redirect(`/invoices/${newInvoiceId}/edit`);
});

app.get("/invoices/:id", requireAuth, (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const customer = getCustomer(invoice.customer_id);
  const items = getItems(invoice.id);
  const total = invoiceTotal(items);

  res.render("invoice-view", {
    settings: getSettings(),
    invoice,
    customer,
    items,
    total,
    saved: req.query.saved === "1",
    fromTime: req.query.from_time === "1"
  });
});

app.post("/invoices/:id/status", requireAuth, (req, res) => {
  db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(req.body.status || "draft", req.params.id);
  res.redirect(`/invoices/${req.params.id}`);
});


app.get("/invoices/:id/email", requireAuth, (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const customer = getCustomer(invoice.customer_id);
  const settings = getSettings();

  const context = {
    invoice_no: invoice.invoice_no,
    customer_name: customer.name,
    company_name: settings.company_name || "din virksomhed",
    due_date: invoice.due_date
  };

  res.render("invoice-email", {
    invoice,
    customer,
    settings,
    smtpReady: smtpConfigured(settings),
    customerEmails: getCustomerEmailSuggestions(),
    to: customer.email || "",
    subject: renderTemplate(settings.invoice_email_subject, context),
    body: appendEmailSignature(renderTemplate(settings.invoice_email_body, context), settings.email_signature)
  });
});

app.post("/invoices/:id/email", requireAuth, async (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const customer = getCustomer(invoice.customer_id);
  const items = getItems(invoice.id);
  const settings = getSettings();

  if (!smtpConfigured(settings)) {
    return renderMessage(res, 400, {
      title: "Mail er ikke sat op",
      message: "Udfyld SMTP-indstillinger under Indstillinger, før du sender fakturaer.",
      backHref: "/settings",
      backLabel: "Gå til indstillinger",
      secondaryHref: `/invoices/${invoice.id}`,
      secondaryLabel: "Tilbage til faktura"
    });
  }

  const to = String(req.body.to || "").trim();
  if (!to) {
    return renderMessage(res, 400, {
      title: "Modtager mangler",
      message: "Der skal angives en emailadresse til kunden.",
      backHref: `/invoices/${invoice.id}/email`,
      backLabel: "Tilbage"
    });
  }

  try {
    const pdfBuffer = await invoicePdfBuffer({
      settings,
      logoPath: getCompanyLogoPath(settings),
      invoice,
      customer,
      items
    });

    const transporter = createTransport(settings);

    await transporter.sendMail({
      from: settings.smtp_from,
      to,
      subject: String(req.body.subject || "").trim() || `Faktura ${invoice.invoice_no}`,
      text: String(req.body.body || "").trim(),
      attachments: [
        {
          filename: `${invoice.invoice_no}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    db.prepare("UPDATE invoices SET status = ? WHERE id = ? AND status = ?").run("sent", invoice.id, "draft");

    return renderMessage(res, 200, {
      icon: "✓",
      title: "Faktura sendt",
      message: `Faktura ${invoice.invoice_no} blev sendt til ${to}.`,
      backHref: `/invoices/${invoice.id}`,
      backLabel: "Tilbage til faktura",
      secondaryHref: "/",
      secondaryLabel: "Dashboard"
    });
  } catch (error) {
    return renderMessage(res, 500, {
      title: "Faktura kunne ikke sendes",
      message: error.message || "SMTP-serveren afviste afsendelsen.",
      details: "Tjek SMTP host, port, brugernavn, adgangskode, afsenderadresse og om din mailudbyder kræver app password.",
      backHref: `/invoices/${invoice.id}/email`,
      backLabel: "Prøv igen",
      secondaryHref: "/settings",
      secondaryLabel: "SMTP-indstillinger"
    });
  }
});

app.get("/invoices/:id/pdf", requireAuth, (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!invoice) {
    return renderMessage(res, 404, {
      title: "Faktura ikke fundet",
      message: "Fakturaen findes ikke længere eller kunne ikke indlæses.",
      backHref: "/",
      backLabel: "Tilbage til dashboard"
    });
  }

  const customer = getCustomer(invoice.customer_id);
  const items = getItems(invoice.id);
  const settings = getSettings();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_no}.pdf"`);

  const doc = invoicePdfStream({
    settings,
    logoPath: getCompanyLogoPath(settings),
    invoice,
    customer,
    items
  });
  doc.pipe(res);
});

app.post("/invoices/:id/delete", requireAuth, (req, res) => {
  db.prepare("UPDATE time_tasks SET invoice_id = NULL, billed_at = NULL WHERE invoice_id = ?").run(req.params.id);
  db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

app.use((error, _req, res, _next) => {
  if (error) {
    return renderMessage(res, 400, {
      title: "Upload eller handling fejlede",
      message: error.message || "Der opstod en fejl.",
      backHref: "/expenses",
      backLabel: "Tilbage til udgifter"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Invoice Portal is running on port ${PORT}`);
});
