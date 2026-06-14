(() => {
  const language = String(window.INVOICE_PORTAL_LANGUAGE || document.body?.dataset?.language || "da").toLowerCase();
  if (language !== "en") return;

  const text = new Map(Object.entries({
    "Dashboard": "Dashboard",
    "Overblik over fakturaer, udgifter og estimeret resultat.": "Overview of invoices, expenses and estimated result.",
    "Opret faktura": "Create invoice",
    "Dokumenter": "Documents",
    "Fakturaer i år": "Invoices this year",
    "Omsætning i år": "Revenue this year",
    "Udgifter i år": "Expenses this year",
    "Estimeret resultat": "Estimated result",
    "Seneste fakturaer": "Latest invoices",
    "Ingen fakturaer endnu.": "No invoices yet.",
    "Nr.": "No.",
    "Kunde": "Customer",
    "Dato": "Date",
    "Status": "Status",
    "Beløb": "Amount",
    "Åbn": "Open",

    "Fakturaer": "Invoices",
    "Ny faktura": "New invoice",
    "Rediger faktura": "Edit invoice",
    "Duplikér": "Duplicate",
    "Send email": "Send email",
    "Download PDF": "Download PDF",
    "Fakturanr.": "Invoice no.",
    "Fakturadato": "Invoice date",
    "Forfaldsdato": "Due date",
    "Linjer": "Lines",
    "Beskrivelse": "Description",
    "Antal": "Quantity",
    "Enhedspris": "Unit price",
    "Total": "Total",
    "Gem faktura": "Save invoice",
    "Tilføj linje": "Add line",
    "Fjern": "Remove",
    "Fakturaen blev gemt.": "The invoice was saved.",
    "Fakturaen blev oprettet fra tidsopgaven.": "The invoice was created from the time task.",
    "Faktura sendt": "Invoice sent",
    "Faktura kunne ikke sendes": "Invoice could not be sent",

    "Kunder": "Customers",
    "Opret kunde": "Create customer",
    "Ny kunde": "New customer",
    "Rediger kunde": "Edit customer",
    "Navn": "Name",
    "Email": "Email",
    "Telefon": "Phone",
    "Adresse": "Address",
    "CVR": "Business ID",
    "Gem kunde": "Save customer",
    "Søg CVR": "Look up business ID",
    "Ingen kunder endnu.": "No customers yet.",

    "Tid": "Time",
    "Tidsopgaver": "Time tasks",
    "Ny tidsopgave": "New time task",
    "Opgave": "Task",
    "Type": "Type",
    "Indtægt": "Income",
    "Udgift": "Expense",
    "Timepris/sats": "Hourly rate",
    "Start timer": "Start timer",
    "Stop timer": "Stop timer",
    "Luk opgave": "Close task",
    "Genåbn opgave": "Reopen task",
    "Tidsregistreringer": "Time entries",
    "Manuel registrering": "Manual entry",
    "Start": "Start",
    "Slut": "End",
    "Varighed": "Duration",
    "Overfør til faktura": "Transfer to invoice",
    "Overfør til udgift": "Transfer to expense",
    "Tidsopgaven blev overført til faktura.": "The time task was transferred to an invoice.",
    "Tidsopgaven blev overført til udgifter.": "The time task was transferred to expenses.",
    "Tilbage til Tid": "Back to Time",

    "Økonomi": "Finance",
    "Udgifter": "Expenses",
    "Ny udgift": "New expense",
    "Kategori": "Category",
    "Kvittering": "Receipt",
    "Gem udgift": "Save expense",
    "Faste udgifter": "Recurring expenses",
    "Rapporter": "Reports",
    "Regnskabsrapport": "Accounting report",
    "Periode": "Period",
    "Fra": "From",
    "Til": "To",
    "Vis rapport": "Show report",
    "Download rapport PDF": "Download report PDF",
    "Fakturaer i perioden": "Invoices in the period",
    "Udgifter i perioden": "Expenses in the period",

    "Arkiv": "Archive",
    "Dokumentarkiv": "Document archive",
    "Upload dokument": "Upload document",
    "Fil": "File",
    "Titel": "Title",
    "Noter": "Notes",
    "Upload": "Upload",
    "Ingen dokumenter endnu.": "No documents yet.",

    "Mail": "Mail",
    "Mailkonti": "Mail accounts",
    "Skriv mail": "Compose mail",
    "Svar": "Reply",
    "Send": "Send",
    "Send mail": "Send mail",
    "Til": "To",
    "Emne": "Subject",
    "Besked": "Message",
    "Indbakke": "Inbox",
    "Ingen mails fundet.": "No emails found.",
    "Tilbage": "Back",

    "Indstillinger": "Settings",
    "Indstillinger gemt.": "Settings saved.",
    "Firma": "Company",
    "Firmanavn": "Company name",
    "Firmaadresse": "Company address",
    "Firmalogo": "Company logo",
    "Fakturanote": "Invoice note",
    "Email / SMTP": "Email / SMTP",
    "Gem indstillinger": "Save settings",
    "Tilbage til Indstillinger": "Back to Settings",

    "Log ind": "Log in",
    "Brugernavn": "Username",
    "Adgangskode": "Password",
    "Log ud": "Log out",
    "Gem": "Save",
    "Slet": "Delete",
    "Annuller": "Cancel",
    "Opret": "Create",
    "Rediger": "Edit",
    "Luk": "Close",
    "Aktiv": "Active",
    "Lukket": "Closed",
    "Kladde": "Draft",
    "Sendt": "Sent",
    "Betalt": "Paid",
    "Forfalden": "Overdue",
    "Ingen data endnu.": "No data yet."
  }));

  const placeholders = new Map(Object.entries({
    "Fx Faktura / Support": "E.g. Invoice / Support",
    "Fx Webdesign": "E.g. Web design",
    "Kort note": "Short note"
  }));

  function translateTextNode(node) {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed || !text.has(trimmed)) return;
    node.nodeValue = raw.replace(trimmed, text.get(trimmed));
  }

  function translateAttribute(el, attr, dictionary = text) {
    const value = el.getAttribute(attr);
    if (!value) return;
    const trimmed = value.trim();
    if (dictionary.has(trimmed)) {
      el.setAttribute(attr, value.replace(trimmed, dictionary.get(trimmed)));
    }
  }

  function translatePage() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateTextNode);

    document.querySelectorAll("input, textarea, button, option, a, select").forEach((el) => {
      translateAttribute(el, "value");
      translateAttribute(el, "title");
      translateAttribute(el, "aria-label");
      translateAttribute(el, "placeholder", placeholders);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", translatePage);
  } else {
    translatePage();
  }
})();
