const supportedLanguages = new Set(["da", "en"]);

function normalizeLanguage(value) {
  const lang = String(value || "").trim().toLowerCase();
  if (supportedLanguages.has(lang)) return lang;
  return "da";
}

function defaultLanguage() {
  return normalizeLanguage(process.env.APP_LANGUAGE || "da");
}

const translations = {
  da: {
    appName: "Invoice Portal",
    dashboard: "Dashboard",
    invoices: "Fakturaer",
    newInvoice: "Ny faktura",
    customers: "Kunder",
    time: "Tid",
    finance: "Økonomi",
    expenses: "Udgifter",
    recurringExpenses: "Faste udgifter",
    reports: "Rapporter",
    archive: "Arkiv",
    documents: "Dokumenter",
    settings: "Indstillinger",
    settingsOverview: "Alle indstillinger",
    mailAccounts: "Mailkonti",
    logout: "Log ud",
    language: "Sprog",
    danish: "Dansk",
    english: "English"
  },
  en: {
    appName: "Invoice Portal",
    dashboard: "Dashboard",
    invoices: "Invoices",
    newInvoice: "New invoice",
    customers: "Customers",
    time: "Time",
    finance: "Finance",
    expenses: "Expenses",
    recurringExpenses: "Recurring expenses",
    reports: "Reports",
    archive: "Archive",
    documents: "Documents",
    settings: "Settings",
    settingsOverview: "All settings",
    mailAccounts: "Mail accounts",
    logout: "Log out",
    language: "Language",
    danish: "Dansk",
    english: "English"
  }
};

function t(language, key) {
  const lang = normalizeLanguage(language);
  return translations[lang]?.[key] || translations.da[key] || key;
}

module.exports = { defaultLanguage, normalizeLanguage, t };
