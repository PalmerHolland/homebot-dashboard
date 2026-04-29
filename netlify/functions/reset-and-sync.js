// netlify/functions/reset-and-sync.js
// Wipes all client data from Netlify Blobs and does a fresh clean sync.
// Your clients (hb_*) get partner_id: null
// Partner clients (partner_X_*) get partner_id: X
//
// POST body: { "confirm": "yes_reset_everything" }

const { getStore } = require("@netlify/blobs");
const { getAllClients, homebotRequest, normalizeClient } = require("./lib/homebot-api");

function getBlobStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

// Fetch all clients with pagination
async function fetchAllClients(apiToken) {
  const clients = [];
  let path = "/clients?page[size]=100";
  let pages = 0;
  while (path && pages < 20) {
    const data = await homebotRequest(path, {}, apiToken);
    const batch = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
    clients.push(...batch.map(normalizeClient).filter(Boolean));
    const nextLink = data?.links?.next;
    path = nextLink ? nextLink.replace("https://api.homebotapp.com", "") : null;
    pages++;
  }
  return clients;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const confirmed = body.confirm === "yes_reset_everything";
  const partnerOnly = body.partner_only || false; // only reset partner data
  const partnerId = body.partner_id || null;

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    // ── STEP 1: Clear existing data ──────────────────────────────────────
    if (!partnerOnly) {
      // Clear own client keys
      let ownKeys = [];
      try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}
      console.log(`Clearing ${ownKeys.length} own client records...`);
      if (confirmed) {
        for (const key of ownKeys) {
          try { await clientStore.delete(key); } catch {}
        }
        await indexStore.setJSON("client_keys", []);
      }
    }

    // Clear partner data if partner_id specified or clearing all
    const knownPartners = partnerId
      ? [partnerId]
      : Object.keys(JSON.parse(process.env.PARTNER_TOKENS || "{}"));

    for (const pid of knownPartners) {
      let pKeys = [];
      try { pKeys = await indexStore.get(`partner_${pid}_keys`, { type: "json" }) || []; } catch {}
      console.log(`Clearing ${pKeys.length} records for partner ${pid}...`);
      if (confirmed) {
        for (const key of pKeys) {
          try { await clientStore.delete(key); } catch {}
        }
        await indexStore.setJSON(`partner_${pid}_keys`, []);
      }
    }

    if (!confirmed) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: "DRY RUN — add confirm: 'yes_reset_everything' to actually reset",
        }),
      };
    }

    // ── STEP 2: Re-sync own clients with correct partner_id: null ────────
    let ownSynced = 0;
    if (!partnerOnly) {
      console.log("Fetching own clients from Homebot...");
      try {
        const ownClients = await fetchAllClients(process.env.HOMEBOT_API_TOKEN);
        console.log(`Got ${ownClients.length} own clients`);
        const newOwnKeys = [];
        for (const client of ownClients) {
          const key = `hb_${client.homebot_client_id}`;
          const record = {
            id: key,
            homebot_client_id: client.homebot_client_id,
            external_client_id: client.homebot_client_id,
            partner_id: null, // ← explicitly null for own clients
            name: client.name,
            first_name: client.first_name,
            last_name: client.last_name,
            email: client.email,
            phone: client.phone || "",
            property_address: "",
            city: "", state: "", zip: "",
            lead_source: client.lead_source || "",
            buyers_access: client.buyers_access || null,
            metrics: {
              estimated_value: 0, equity_amount: 0, equity_percent: 0,
              current_rate: 0, loan_amount: 0,
              likely_to_sell_score: client.likely_to_sell_score || 0,
              likely_to_buy_score: 0, activity_score: 0,
              refinance_opportunity: false, highly_engaged: false,
              just_listed: false, cma_requested: false,
              updated_at: new Date().toISOString(),
            },
            triggers: client.likely_to_sell_score >= 70 ? ["likely_to_sell"] : [],
            opportunity_score: Math.round((client.likely_to_sell_score || 0) * 0.35),
            last_activity: client.updated_at || new Date().toISOString(),
            last_contacted: null,
            events: [],
            created_at: client.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
          };
          await clientStore.setJSON(key, record);
          newOwnKeys.push(key);
          ownSynced++;
        }
        await indexStore.setJSON("client_keys", newOwnKeys);
        console.log(`Stored ${ownSynced} own clients`);
      } catch (err) {
        console.error("Own client sync failed:", err.message);
      }
    }

    // ── STEP 3: Re-sync partner clients with correct partner_id ──────────
    const partnerSynced = {};
    const partnerTokens = JSON.parse(process.env.PARTNER_TOKENS || "{}");

    for (const pid of knownPartners) {
      const partnerToken = partnerTokens[pid];
      if (!partnerToken) { console.warn(`No token for partner ${pid}`); continue; }

      console.log(`Fetching clients for partner ${pid}...`);
      try {
        const partnerClients = await fetchAllClients(partnerToken);
        console.log(`Got ${partnerClients.length} clients for ${pid}`);
        const newPartnerKeys = [];

        for (const client of partnerClients) {
          const key = `partner_${pid}_${client.homebot_client_id}`;
          const record = {
            id: key,
            homebot_client_id: client.homebot_client_id,
            external_client_id: client.homebot_client_id,
            partner_id: pid, // ← explicitly set to partner ID
            name: client.name,
            first_name: client.first_name,
            last_name: client.last_name,
            email: client.email,
            phone: client.phone || "",
            property_address: "",
            city: "", state: "", zip: "",
            lead_source: client.lead_source || "",
            buyers_access: client.buyers_access || null,
            metrics: {
              estimated_value: 0, equity_amount: 0, equity_percent: 0,
              current_rate: 0, loan_amount: 0,
              likely_to_sell_score: client.likely_to_sell_score || 0,
              likely_to_buy_score: 0, activity_score: 0,
              refinance_opportunity: false, highly_engaged: false,
              just_listed: false, cma_requested: false,
              updated_at: new Date().toISOString(),
            },
            triggers: client.likely_to_sell_score >= 70 ? ["likely_to_sell"] : [],
            opportunity_score: Math.round((client.likely_to_sell_score || 0) * 0.35),
            last_activity: client.updated_at || new Date().toISOString(),
            last_contacted: null,
            events: [],
            created_at: client.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
          };
          await clientStore.setJSON(key, record);
          newPartnerKeys.push(key);
        }

        await indexStore.setJSON(`partner_${pid}_keys`, newPartnerKeys);
        partnerSynced[pid] = newPartnerKeys.length;
        console.log(`Stored ${newPartnerKeys.length} clients for partner ${pid}`);

        // Update partner index
        let partnerIndex = {};
        try { partnerIndex = await indexStore.get("partner_index", { type: "json" }) || {}; } catch {}
        partnerIndex[pid] = {
          ...partnerIndex[pid],
          id: pid,
          client_count: newPartnerKeys.length,
          last_synced: new Date().toISOString(),
        };
        await indexStore.setJSON("partner_index", partnerIndex);
      } catch (err) {
        console.error(`Partner ${pid} sync failed:`, err.message);
        partnerSynced[pid] = `error: ${err.message}`;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        own_clients_synced: ownSynced,
        partner_clients_synced: partnerSynced,
        message: `Clean reset complete. ${ownSynced} own clients and ${JSON.stringify(partnerSynced)} partner clients stored with correct ownership.`,
      }),
    };
  } catch (err) {
    console.error("Reset error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
