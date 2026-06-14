function cleanText(value) {
  return String(value || "").trim();
}

function normalizeCvrResult(data) {
  if (!data || typeof data !== "object") return null;
  if (data.error) {
    return {
      ok: false,
      error: data.error,
      message: data.message || data.error
    };
  }

  const zipcode = cleanText(data.zipcode);
  const city = cleanText(data.city);
  const zipCity = [zipcode, city].filter(Boolean).join(" ");

  return {
    ok: true,
    name: cleanText(data.name),
    cvr: cleanText(data.vat),
    address: cleanText(data.address),
    zip_city: zipCity,
    phone: cleanText(data.phone),
    email: cleanText(data.email),
    raw: data
  };
}

async function lookupCvr(search) {
  if (process.env.CVR_LOOKUP_ENABLED === "false") {
    return { ok: false, error: "DISABLED", message: "CVR-opslag er slået fra." };
  }

  const q = cleanText(search);
  if (q.length < 2) {
    return { ok: false, error: "TOO_SHORT", message: "Søg efter mindst 2 tegn." };
  }

  const userAgent = process.env.CVR_USER_AGENT || "Invoice Portal - local selfhosted invoice app";

  const url = new URL("https://cvrapi.dk/api");
  url.searchParams.set("search", q);
  url.searchParams.set("country", "dk");

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": userAgent
    }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: "CVR-tjenesten returnerede ikke gyldig JSON."
    };
  }

  const normalized = normalizeCvrResult(data);
  if (!normalized) {
    return {
      ok: false,
      error: "EMPTY_RESPONSE",
      message: "Intet svar fra CVR-tjenesten."
    };
  }

  return normalized;
}

module.exports = {
  lookupCvr
};
