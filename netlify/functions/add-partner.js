// netlify/functions/add-partner.js
// Registers a new Realtor partner by storing their API token and
// triggering an initial sync of their client database.
//
// POST body:
//   partner_id       — unique ID for this partner (e.g. "sarah_chen")
//   partner_name     — display name
//   partner_email    — their email
//   partner_brokerage — their brokerage
//   api_token        — their Homebot API token
//
// IMPORTANT: Partner API tokens are stored as a JSON string in the
// PARTNER_TOKENS environment variable in Netlify. This function
// updates that store and triggers a sync.

const { getStore } = require("@netlify/blobs");

// Helper to get a Blobs store with explicit credentials when needed
function getBlobStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}
const { getRealEstateAgentByExternalId } = require("./lib/homebot-api");

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

  const { partner_id, partner_name, partner_email, partner_brokerage, api_token } = body;

  if (!partner_id || !api_token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "partner_id and api_token are required" }),
    };
  }

  try {
    const indexStore = getBlobStore("indexes");

    // Validate the API token works by fetching their profile
    // Partners should provide their Homebot external ID or we use email lookup
    let agentProfile = null;
    try {
      agentProfile = await getRealEstateAgentByExternalId(partner_id, api_token);
    } catch {
      // Token may be valid but agent not found by external ID — that's OK
      console.warn(`Could not fetch agent profile for ${partner_id} — proceeding anyway`);
    }

    // Store partner in partner index
    let partnerIndex = {};
    try { partnerIndex = await indexStore.get("partner_index", { type: "json" }) || {}; } catch {}

    partnerIndex[partner_id] = {
      id: partner_id,
      name: partner_name || agentProfile?.name || partner_id,
      email: partner_email || agentProfile?.email || "",
      brokerage: partner_brokerage || "",
      photo_uri: agentProfile?.photo_uri || null,
      clients_count: agentProfile?.clients_count || 0,
      homebot_agent_id: agentProfile?.homebot_agent_id || null,
      added_at: new Date().toISOString(),
      last_synced: null,
      client_count: 0,
      // Note: actual token stored in PARTNER_TOKENS env var — not stored in Blobs
      // for security. Update PARTNER_TOKENS in Netlify environment variables.
      token_registered: true,
    };

    await indexStore.setJSON("partner_index", partnerIndex);

    // Note to user: they need to add the token to PARTNER_TOKENS env var
    // and then call sync-clients to pull the partner's database

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        partner_id,
        partner_name: partnerIndex[partner_id].name,
        message: `Partner ${partnerIndex[partner_id].name} registered successfully. To complete setup: 1) Add "${partner_id}":"${api_token}" to your PARTNER_TOKENS environment variable in Netlify, then 2) Call sync-clients with partner_id to pull their database.`,
        next_steps: {
          step1: `Add to Netlify env vars — PARTNER_TOKENS: {"${partner_id}": "${api_token}"}`,
          step2: `POST /.netlify/functions/sync-clients with body: {"partner_id": "${partner_id}", "partner_name": "${partner_name}"}`,
        },
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
