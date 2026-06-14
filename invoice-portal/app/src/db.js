const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "faktura.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT '',
  cvr TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  zip_city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  reg_no TEXT NOT NULL DEFAULT '',
  account_no TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT '',
  mobilepay TEXT NOT NULL DEFAULT '',
  payment_days INTEGER NOT NULL DEFAULT 8,
  invoice_note TEXT NOT NULL DEFAULT 'Virksomheden er ikke momsregistreret. Der opkræves derfor ikke moms.',
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure INTEGER NOT NULL DEFAULT 0,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_pass TEXT NOT NULL DEFAULT '',
  smtp_from TEXT NOT NULL DEFAULT '',
  invoice_email_subject TEXT NOT NULL DEFAULT 'Faktura {{invoice_no}} fra {{company_name}}',
  invoice_email_body TEXT NOT NULL DEFAULT 'Hej {{customer_name}},\n\nVedhæftet finder du faktura {{invoice_no}}.\n\nVenlig hilsen\n{{company_name}}',
  imap_host TEXT NOT NULL DEFAULT '',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure INTEGER NOT NULL DEFAULT 1,
  imap_user TEXT NOT NULL DEFAULT '',
  imap_pass TEXT NOT NULL DEFAULT '',
  imap_mailbox TEXT NOT NULL DEFAULT 'INBOX',
  logo_file TEXT NOT NULL DEFAULT '',
  logo_original_name TEXT NOT NULL DEFAULT '',
  logo_mime TEXT NOT NULL DEFAULT '',
  email_signature TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'private',
  name TEXT NOT NULL,
  cvr TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  zip_city TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Diverse',
  amount REAL NOT NULL DEFAULT 0,
  bilag_no TEXT NOT NULL DEFAULT '',
  receipt_file TEXT NOT NULL DEFAULT '',
  receipt_original_name TEXT NOT NULL DEFAULT '',
  receipt_mime TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recurring_expense_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Diverse',
  amount REAL NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  next_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  bilag_prefix TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS company_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Diverse',
  document_date TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure INTEGER NOT NULL DEFAULT 0,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_pass TEXT NOT NULL DEFAULT '',
  imap_host TEXT NOT NULL DEFAULT '',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure INTEGER NOT NULL DEFAULT 1,
  imap_user TEXT NOT NULL DEFAULT '',
  imap_pass TEXT NOT NULL DEFAULT '',
  imap_mailbox TEXT NOT NULL DEFAULT 'INBOX',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

db.prepare(`
INSERT OR IGNORE INTO settings (id, company_name)
VALUES (1, '')
`).run();

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("customers", "type", "TEXT NOT NULL DEFAULT 'private'");
ensureColumn("expenses", "bilag_no", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "iban", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "bic", "TEXT NOT NULL DEFAULT ''");
ensureColumn("expenses", "receipt_file", "TEXT NOT NULL DEFAULT ''");
ensureColumn("expenses", "receipt_original_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("expenses", "receipt_mime", "TEXT NOT NULL DEFAULT ''");


db.exec(`
CREATE TABLE IF NOT EXISTS time_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'income',
  customer_id INTEGER,
  hourly_rate REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES time_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_started_at ON time_entries(started_at);
`);


ensureColumn("time_tasks", "invoice_id", "INTEGER");
ensureColumn("time_tasks", "expense_id", "INTEGER");
ensureColumn("time_tasks", "billed_at", "TEXT");
ensureColumn("time_tasks", "billing_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("invoices", "source_time_task_id", "INTEGER");
ensureColumn("expenses", "source_time_task_id", "INTEGER");


ensureColumn("expenses", "recurring_expense_id", "INTEGER");


ensureColumn("settings", "smtp_host", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "smtp_port", "INTEGER NOT NULL DEFAULT 587");
ensureColumn("settings", "smtp_secure", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("settings", "smtp_user", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "smtp_pass", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "smtp_from", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "invoice_email_subject", "TEXT NOT NULL DEFAULT 'Faktura {{invoice_no}} fra {{company_name}}'");
ensureColumn("settings", "invoice_email_body", "TEXT NOT NULL DEFAULT 'Hej {{customer_name}},\\n\\nVedhæftet finder du faktura {{invoice_no}}.\\n\\nVenlig hilsen\\n{{company_name}}'");

ensureColumn("settings", "imap_host", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "imap_port", "INTEGER NOT NULL DEFAULT 993");
ensureColumn("settings", "imap_secure", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "imap_user", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "imap_pass", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "imap_mailbox", "TEXT NOT NULL DEFAULT 'INBOX'");

ensureColumn("settings", "logo_file", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "logo_original_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "logo_mime", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "email_signature", "TEXT NOT NULL DEFAULT ''");

module.exports = db;
