function cleanText(value) {
  return String(value || "").trim();
}

function cleanCvr(value) {
  return cleanText(value).replace(/[^0-9]/g, "");
}

function normalizeCvrError(error, statusCode) {
  const code = cleanText(error);
  const messages = {
    DISABLED: "CVR-opslag er slået fra.",
    TOO_SHORT: "Søg efter mindst 2 tegn.",
    INVALID_UA: "CVR API afviste User-Agent. Gå til add-on Configuration og sæt cvr_user_agent til en tydelig tekst med app/projekt og din kontakt, fx 'Invoice Portal - My Company - admin@example.com'.",
    QUOTA_EXCEEDED: "CVR API-grænsen er nået for denne IP. Prøv igen senere, eller brug en CVR token/API-adgang.",
    BANNED: "CVR API har blokeret IP-adressen midlertidigt/permanent.",
    INVALID_VAT: "CVR-nummeret er ikke i korrekt format.",
    NOT_FOUND: "Ingen virksomhed fundet.",
    INTERNAL_ERROR: "CVR API returnerede en intern fejl. Prøv igen senere.",
    BAD_RESPONSE: "CVR-tjenesten returnerede ikke gyldig JSON.",
    EMPTY_RESPONSE: "Intet svar fra CVR-tjenesten.",
    TIMEOUT: "CVR-opslag tog for lang tid og blev afbrudt.",
    NETWORK_ERROR: "Kunne ikke kontakte CVR-tjenesten. Tjek at Home Assistant/add-on har internetadgang."
  };

  return {
    ok: false,
    error: code || "LOOKUP_FAILED",
    message: messages[code] || code || "CVR-opslag fejlede.",
    statusCode: statusCode || null
  };
}

function normalizeCvrResult(data) {
  if (Array.isArray(data)) {
    data = data.find((entry) => entry && typeof entry === "object") || null;
  }

  if (!data || typeof data !== "object") return null;

  if (data.error) {
    const normalized = normalizeCvrError(data.error);
    if (data.message) normalized.message = cleanText(data.message);
    return normalized;
  }

  const zipcode = cleanText(data.zipcode || data.zip || data.postal_code);
  const city = cleanText(data.city || data.cityname || data.city_name);
  const zipCity = [zipcode, city].filter(Boolean).join(" ");

  const name = cleanText(data.name || data.companyname || data.company_name);
  const cvr = cleanCvr(data.vat || data.cvr || data.vatnumber || data.vat_number);

  if (!name && !cvr) return null;

  return {
    ok: true,
    name,
    cvr,
    address: cleanText(data.address || data.street || data.location),
    zip_city: zipCity,
    phone: cleanText(data.phone || data.telephone),
    email: cleanText(data.email || data.mail),
    source: "cvrapi.dk"
  };
}

function buildParams(q) {
  const params = new URLSearchParams();
  params.set("search", q);
  params.set("country", "dk");
  params.set("format", "json");
  params.set("version", "6");

  const token = cleanText(process.env.CVR_TOKEN || "");
  if (token) params.set("token", token);

  return params;
}

async function requestCvrApi(q, method) {
  const userAgent = cleanText(process.env.CVR_USER_AGENT) || "Invoice Portal Home Assistant Add-on - replace-with-your-contact";
  const params = buildParams(q);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CVR_TIMEOUT_MS || 8000));

  const headers = {
    "Accept": "application/json",
    "User-Agent": userAgent
  };

  let url = "https://cvrapi.dk/api";
  const options = {
    method,
    headers,
    signal: controller.signal
  };

  if (method === "GET") {
    url += `?${params.toString()}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    options.body = params.toString();
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return normalizeCvrError("BAD_RESPONSE", response.status);
    }

    const normalized = normalizeCvrResult(data) || normalizeCvrError("EMPTY_RESPONSE", response.status);
    normalized.statusCode = response.status;

    if (!response.ok && normalized.ok) {
      return {
        ok: false,
        error: "HTTP_ERROR",
        message: `CVR API returnerede HTTP ${response.status}.`,
        statusCode: response.status
      };
    }

    return normalized;
  } catch (error) {
    if (error.name === "AbortError") return normalizeCvrError("TIMEOUT");
    return normalizeCvrError("NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupCvr(search) {
  if (process.env.CVR_LOOKUP_ENABLED === "false") {
    return normalizeCvrError("DISABLED");
  }

  const raw = cleanText(search);
  const digits = cleanCvr(raw);
  const q = digits.length === 8 ? digits : raw;

  if (q.length < 2) {
    return normalizeCvrError("TOO_SHORT");
  }

  const first = await requestCvrApi(q, "GET");
  if (first.ok || !["BAD_RESPONSE", "NETWORK_ERROR", "HTTP_ERROR"].includes(first.error)) {
    return first;
  }

  return requestCvrApi(q, "POST");
}

module.exports = {
  lookupCvr
};
