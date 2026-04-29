// netlify/functions/sync-clients.js
// Performs a full sync of all clients from Homebot API into Netlify Blobs.
// Call this once after deployment to populate the dashboard with existing data.
// Also used to sync partner databases when a new partner API key is added.
//
// POST body: { partner_id?: string, api_token?: string }
// If no body provided — syncs your own database.
// If partner_id + api_token provided — syncs that partner's database.

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
const {
  getClientsBySource,
  getClientHomes,
  getHomeLoans,
  mergeClientData,
  computeOpportunityScore,
  deriveTriggers,
} = require("./lib/homebot-api");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  // Validate secret
  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const partnerId = body.partner_id || null;
  const partnerName = body.partner_name || partnerId;
  const partnerEmail = body.partner_email || "";
  const partnerBrokerage = body.partner_brokerage || "";
  const apiToken = body.api_token || process.env.HOMEBOT_API_TOKEN;

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    console.log(`Starting sync for ${partnerId ? `partner: ${partnerId}` : "own database"}...`);

    // Fetch all clients from Homebot using external entity source filter
    // Own clients are tagged with "homebot-lo-dashboard"
    // Partner clients will be tagged with their own source
    const source = partnerId ? `partner-${partnerId}` : "homebot-lo-dashboard";
    let clients = [];

    try {
      clients = await getClientsBySource(source, apiToken);
    } catch (err) {
      console.warn(`Source filter failed, trying without filter:`, err.message);
      // If no clients tagged yet, this is first sync — we'll get all clients
      // via a broader approach. For now return guidance.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          message: `No clients found with source "${source}". This may be a first-time sync. Please ensure clients are tagged with external-entity-source="${source}" in Homebot, or use the CSV import feature to bulk-tag existing clients.`,
          partner_id: partnerId,
        }),
      };
    }

    console.log(`Found ${clients.length} clients to sync`);

    const indexKey = partnerId ? `partner_${partnerId}_keys` : "client_keys";
    let existingIndex = [];
    try { existingIndex = await indexStore.get(indexKey, { type: "json" }) || []; } catch {}

    let synced = 0;
    let failed = 0;
    const newKeys = [];

    for (const client of clients) {
      const storeKey = partnerId
        ? `partner_${partnerId}_${client.homebot_client_id}`
        : `hb_${client.homebot_client_id}`;

      try {
        // Fetch home and loan data
        let homeData = null;
        let loanData = null;

        try {
          const homes = await getClientHomes(client.homebot_client_id, apiToken);
          if (homes.length > 0) {
            homeData = homes[0];
            const loans = await getHomeLoans(homeData.homebot_home_id, apiToken);
            loanData = loans.find(l => l.lien_position === "first") || loans[0] || null;
          }
        } catch (err) {
          console.warn(`Could not fetch home/loan for ${client.homebot_client_id}:`, err.message);
        }

        const merged = mergeClientData(client, homeData, loanData);
        const record = {
          ...merged,
          id: storeKey,
          partner_id: partnerId,
          last_synced: new Date().toISOString(),
        };

        await clientStore.setJSON(storeKey, record);
        newKeys.push(storeKey);
        synced++;

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`Failed to sync client ${client.homebot_client_id}:`, err.message);
        failed++;
      }
    }

    // Update client index
    const mergedIndex = [...new Set([...existingIndex, ...newKeys])];
    await indexStore.setJSON(indexKey, mergedIndex);

    // If this is a partner sync — register partner in the partner index
    if (partnerId) {
      let partnerIndex = {};
      try { partnerIndex = await indexStore.get("partner_index", { type: "json" }) || {}; } catch {}
      partnerIndex[partnerId] = {
        id: partnerId,
        name: partnerName,
        email: partnerEmail,
        brokerage: partnerBrokerage,
        client_count: synced,
        last_synced: new Date().toISOString(),
        api_token_set: !!body.api_token,
      };
      await indexStore.setJSON("partner_index", partnerIndex);
    }

    console.log(`Sync complete: ${synced} synced, ${failed} failed`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        synced,
        failed,
        total: clients.length,
        partner_id: partnerId,
        message: `Successfully synced ${synced} clients${partnerId ? ` for partner ${partnerName}` : ""}`,
      }),
    };
  } catch (err) {
    console.error("Sync error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
