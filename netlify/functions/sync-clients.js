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
  homebotRequest,
  getClientHomes,
  getHomeLoans,
  mergeClientData,
  normalizeClient,
  computeOpportunityScore,
  deriveTriggers,
} = require("./lib/homebot-api");

// Fetch ALL clients from Homebot with pagination
async function getAllClients(apiToken) {
  const clients = [];
  let nextUrl = "/clients?page[size]=100";
  while (nextUrl) {
    const data = await homebotRequest(nextUrl, {}, apiToken);
    const batch = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
    clients.push(...batch.map(normalizeClient));
    // Check for next page link
    const nextLink = data?.links?.next;
    if (nextLink) {
      // Extract path from full URL
      nextUrl = nextLink.replace("https://api.homebotapp.com", "");
    } else {
      nextUrl = null;
    }
  }
  return clients;
}

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

    // Fetch all clients from Homebot
    // First sync: pull everything directly
    // Subsequent syncs: can filter by source tag
    let clients = [];
    const source = partnerId ? `partner-${partnerId}` : "homebot-lo-dashboard";

    try {
      // Try source filter first (works after first sync tags clients)
      clients = await getClientsBySource(source, apiToken);
    } catch (err) {
      console.log("Source filter returned nothing — falling back to full pull");
    }

    // If no tagged clients found, pull all clients directly (first-time sync)
    if (clients.length === 0) {
      try {
        console.log("Pulling all clients directly from Homebot API...");
        clients = await getAllClients(apiToken);
        console.log(`Found ${clients.length} clients via direct pull`);
      } catch (err) {
        console.error("Failed to fetch clients:", err.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ success: false, error: "Failed to fetch clients from Homebot", detail: err.message }),
        };
      }
    }

    console.log(`Found ${clients.length} clients to sync`);

    const indexKey = partnerId ? `partner_${partnerId}_keys` : "client_keys";
    let existingIndex = [];
    try { existingIndex = await indexStore.get(indexKey, { type: "json" }) || []; } catch {}

    let synced = 0;
    let failed = 0;
    const newKeys = [];

    // Process clients in batches to avoid timeout
    // Store client records without home/loan data first (fast)
    // Home/loan data gets enriched by webhook events over time
    for (const client of clients) {
      const storeKey = partnerId
        ? `partner_${partnerId}_${client.homebot_client_id}`
        : `hb_${client.homebot_client_id}`;

      try {
        const record = {
          id: storeKey,
          homebot_client_id: client.homebot_client_id,
          external_client_id: client.homebot_client_id,
          partner_id: partnerId,
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
            estimated_value: 0,
            equity_amount: 0,
            equity_percent: 0,
            current_rate: 0,
            loan_amount: 0,
            likely_to_sell_score: client.likely_to_sell_score || 0,
            likely_to_buy_score: 0,
            activity_score: 0,
            refinance_opportunity: false,
            highly_engaged: false,
            just_listed: false,
            cma_requested: false,
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

        await clientStore.setJSON(storeKey, record);
        newKeys.push(storeKey);
        synced++;
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
