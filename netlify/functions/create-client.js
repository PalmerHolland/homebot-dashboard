// netlify/functions/create-client.js
// Creates a new client in Homebot under a specific partner's account,
// then optionally adds their home and loan data.
//
// POST body:
//   partner_id       — which partner's account to add them to (null = your own)
//   first_name       — required
//   last_name        — required
//   email            — required, must be unique in Homebot
//   mobile           — optional
//   address_street   — optional
//   address_zip      — optional
//   close_date       — optional (ISO date string)
//   lead_source      — optional
//   loan_amount      — optional
//   loan_rate        — optional
//   loan_date        — optional
//   loan_type        — optional (e.g. "Conventional", "FHA", "VA")
//   home_value       — optional

const { getStore } = require("@netlify/blobs");
const {
  homebotRequest,
  getClientByEmail,
  getClientHomes,
  getHomeLoans,
  mergeClientData,
  normalizeClient,
  normalizeHome,
  normalizeLoan,
  computeOpportunityScore,
  deriveTriggers,
} = require("./lib/homebot-api");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const {
    partner_id,
    first_name, last_name, email, mobile,
    address_street, address_zip,
    close_date, lead_source,
    loan_amount, loan_rate, loan_date, loan_type, loan_term_years,
    home_value,
  } = body;

  if (!first_name || !last_name || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "first_name, last_name and email are required" }),
    };
  }

  // Resolve which API token to use
  const apiToken = resolveApiToken(partner_id);
  if (!apiToken) {
    return { statusCode: 400, body: JSON.stringify({ error: "No API token found for this partner" }) };
  }

  try {
    // ── Step 1: Check for duplicate email ──────────────────────────────────
    let existingClients = [];
    try {
      existingClients = await getClientByEmail(email, apiToken);
    } catch {}

    if (existingClients.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "duplicate_email",
          message: `A client with email ${email} already exists in this Homebot account.`,
          existing_client_id: existingClients[0].homebot_client_id,
        }),
      };
    }

    // ── Step 2: Create the client in Homebot ───────────────────────────────
    const clientPayload = {
      data: {
        type: "clients",
        attributes: {
          "first-name": first_name.trim(),
          "last-name": last_name.trim(),
          "email": email.toLowerCase().trim(),
          ...(mobile && { "mobile": mobile }),
          ...(close_date && { "close-date": close_date }),
          ...(lead_source && { "lead-source": lead_source }),
          // Tag with dashboard external mapping so we can find them later
          "external-mappings": [
            {
              "external-entity-source": "homebot-lo-dashboard",
              "external-entity-id": `dashboard_${Date.now()}`,
            },
          ],
        },
      },
    };

    const clientResponse = await homebotRequest("/clients", {
      method: "POST",
      body: JSON.stringify(clientPayload),
    }, apiToken);

    const homebotClientId = clientResponse?.data?.id;
    if (!homebotClientId) {
      throw new Error("Homebot did not return a client ID");
    }

    console.log(`✓ Created client ${first_name} ${last_name} in Homebot (${homebotClientId})`);

    // ── Step 3: Add home if address provided ──────────────────────────────
    let homebotHomeId = null;
    if (address_street && address_zip) {
      try {
        const homePayload = {
          data: {
            type: "homes",
            attributes: {
              "address-street": address_street.trim(),
              "address-zip": address_zip.trim(),
              ...(home_value && { "appraised-value": parseFloat(home_value) }),
            },
          },
        };
        const homeResponse = await homebotRequest(`/clients/${homebotClientId}/homes`, {
          method: "POST",
          body: JSON.stringify(homePayload),
        }, apiToken);
        homebotHomeId = homeResponse?.data?.id;
        console.log(`✓ Added home for client ${homebotClientId} (home: ${homebotHomeId})`);
      } catch (err) {
        console.warn(`Could not add home for ${homebotClientId}:`, err.message);
      }
    }

    // ── Step 4: Add loan if rate/amount provided ───────────────────────────
    if (homebotHomeId && loan_rate && loan_amount) {
      try {
        const loanPayload = {
          data: {
            type: "loans",
            attributes: {
              "amount": parseFloat(loan_amount),
              "rate": parseFloat(loan_rate),
              ...(loan_date && { "date": loan_date }),
              ...(loan_type && { "loan-type": loan_type }),
              ...(loan_term_years && { "term-years": parseInt(loan_term_years) }),
              "lien-position": "first",
            },
          },
        };
        await homebotRequest(`/homes/${homebotHomeId}/loans`, {
          method: "POST",
          body: JSON.stringify(loanPayload),
        }, apiToken);
        console.log(`✓ Added loan for home ${homebotHomeId}`);
      } catch (err) {
        console.warn(`Could not add loan for home ${homebotHomeId}:`, err.message);
      }
    }

    // ── Step 5: Fetch full enriched record and store in Netlify Blobs ──────
    let clientRecord = null;
    try {
      const clientData = normalizeClient(clientResponse.data);
      let homeData = null;
      let loanData = null;

      if (homebotHomeId) {
        const homes = await getClientHomes(homebotClientId, apiToken);
        if (homes.length > 0) {
          homeData = homes[0];
          const loans = await getHomeLoans(homebotHomeId, apiToken);
          loanData = loans[0] || null;
        }
      }

      const merged = mergeClientData(clientData, homeData, loanData);
      const storeKey = partner_id
        ? `partner_${partner_id}_${homebotClientId}`
        : `hb_${homebotClientId}`;

      clientRecord = { ...merged, id: storeKey, partner_id: partner_id || null };

      const clientStore = getStore("clients");
      const indexStore = getStore("indexes");

      await clientStore.setJSON(storeKey, clientRecord);

      const indexKey = partner_id ? `partner_${partner_id}_keys` : "client_keys";
      let index = [];
      try { index = await indexStore.get(indexKey, { type: "json" }) || []; } catch {}
      if (!index.includes(storeKey)) {
        index.push(storeKey);
        await indexStore.setJSON(indexKey, index);
      }
    } catch (err) {
      console.warn("Could not store client record:", err.message);
    }

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        homebot_client_id: homebotClientId,
        homebot_home_id: homebotHomeId,
        partner_id: partner_id || null,
        client: clientRecord,
        message: `${first_name} ${last_name} has been added to Homebot${partner_id ? ` under ${partner_id}` : ""}. They will receive a welcome email shortly.`,
      }),
    };
  } catch (err) {
    console.error("create-client error:", err);
    // Return helpful error messages
    const msg = err.message || "";
    if (msg.includes("422") || msg.includes("already")) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: "validation_error", message: "This email may already exist in Homebot or the data is invalid." }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "server_error", message: err.message }),
    };
  }
};

function resolveApiToken(partnerId) {
  if (!partnerId) return process.env.HOMEBOT_API_TOKEN;
  try {
    return JSON.parse(process.env.PARTNER_TOKENS || "{}")[partnerId] || process.env.HOMEBOT_API_TOKEN;
  } catch {
    return process.env.HOMEBOT_API_TOKEN;
  }
}
