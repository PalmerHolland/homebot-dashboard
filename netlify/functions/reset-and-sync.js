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
  const isNetlifyContext = !!process.env.NETLIFY_BLOBS_CONTEXT;
  if (!isNetlifyContext && siteID && token) {
    return getStore({ name, siteID, token });
  }
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
  const mode = body.mode || "reset"; // reset | sync_own | sync_partner
  const partnerId = body.partner_id || null;
  const offset = body.offset || 0;
  const limit = 50; // process 50 clients at a time

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    // ── MODE: reset — clear all data ─────────────────────────────────────
    if (mode === "reset") {
      if (!confirmed) {
        return { statusCode: 200, body: JSON.stringify({ success: false, message: "Add confirm: 'yes_reset_everything' to reset" }) };
      }
      // Clear own keys
      let ownKeys = [];
      try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}
      for (const key of ownKeys) { try { await clientStore.delete(key); } catch {} }
      await indexStore.setJSON("client_keys", []);

      // Clear all partner keys
      const knownPartners = Object.keys(JSON.parse(process.env.PARTNER_TOKENS || "{}"));
      for (const pid of knownPartners) {
        let pKeys = [];
        try { pKeys = await indexStore.get(`partner_${pid}_keys`, { type: "json" }) || []; } catch {}
        for (const key of pKeys) { try { await clientStore.delete(key); } catch {} }
        await indexStore.setJSON(`partner_${pid}_keys`, []);
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: `Cleared ${ownKeys.length} own records. Now run mode: sync_own then mode: sync_partner` }),
      };
    }

    // ── MODE: sync_own — sync your clients in batches of 50 ──────────────
    if (mode === "sync_own") {
      const allClients = await fetchAllClients(process.env.HOMEBOT_API_TOKEN);
      const batch = allClients.slice(offset, offset + limit);
      let existingKeys = [];
      try { existingKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}

      for (const client of batch) {
        const key = `hb_${client.homebot_client_id}`;
        await clientStore.setJSON(key, {
          id: key, homebot_client_id: client.homebot_client_id,
          partner_id: null, name: client.name,
          first_name: client.first_name, last_name: client.last_name,
          email: client.email, phone: client.phone || "",
          property_address: "", city: "", state: "", zip: "",
          lead_source: client.lead_source || "",
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
          last_contacted: null, events: [],
          created_at: client.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(), last_synced: new Date().toISOString(),
        });
        if (!existingKeys.includes(key)) existingKeys.push(key);
      }
      await indexStore.setJSON("client_keys", existingKeys);
      const remaining = Math.max(allClients.length - offset - limit, 0);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true, synced: batch.length, total: allClients.length,
          remaining, next_offset: offset + limit, done: remaining === 0,
          message: remaining === 0 ? `All ${allClients.length} own clients synced cleanly` : `${batch.length} synced, ${remaining} remaining`,
        }),
      };
    }

    // ── MODE: sync_partner — sync one partner's clients ───────────────────
    if (mode === "sync_partner") {
      if (!partnerId) return { statusCode: 400, body: JSON.stringify({ error: "partner_id required" }) };
      const partnerTokens = JSON.parse(process.env.PARTNER_TOKENS || "{}");
      const partnerToken = partnerTokens[partnerId];
      if (!partnerToken) return { statusCode: 400, body: JSON.stringify({ error: `No token for partner ${partnerId}` }) };

      const allClients = await fetchAllClients(partnerToken);
      const batch = allClients.slice(offset, offset + limit);
      let existingKeys = [];
      try { existingKeys = await indexStore.get(`partner_${partnerId}_keys`, { type: "json" }) || []; } catch {}

      for (const client of batch) {
        const key = `partner_${partnerId}_${client.homebot_client_id}`;
        await clientStore.setJSON(key, {
          id: key, homebot_client_id: client.homebot_client_id,
          partner_id: partnerId, name: client.name,
          first_name: client.first_name, last_name: client.last_name,
          email: client.email, phone: client.phone || "",
          property_address: "", city: "", state: "", zip: "",
          lead_source: client.lead_source || "",
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
          last_contacted: null, events: [],
          created_at: client.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(), last_synced: new Date().toISOString(),
        });
        if (!existingKeys.includes(key)) existingKeys.push(key);
      }
      await indexStore.setJSON(`partner_${partnerId}_keys`, existingKeys);

      // Update partner index
      let partnerIndex = {};
      try { partnerIndex = await indexStore.get("partner_index", { type: "json" }) || {}; } catch {}
      partnerIndex[partnerId] = { id: partnerId, client_count: existingKeys.length, last_synced: new Date().toISOString() };
      await indexStore.setJSON("partner_index", partnerIndex);

      const remaining = Math.max(allClients.length - offset - limit, 0);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true, partner_id: partnerId, synced: batch.length,
          total: allClients.length, remaining, next_offset: offset + limit,
          done: remaining === 0,
          message: remaining === 0 ? `All ${allClients.length} partner clients synced` : `${batch.length} synced, ${remaining} remaining`,
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown mode. Use: reset, sync_own, sync_partner" }) };
  } catch (err) {
    console.error("Reset error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
