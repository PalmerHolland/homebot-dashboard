// netlify/functions/homebot-webhook.js
// Receives native Homebot ClientEvents and updates Netlify Blobs in real time.
// Homebot POSTs directly to this URL — no Zapier needed.
//
// Required env vars:
//   HOMEBOT_API_TOKEN  — your Homebot API token
//   WEBHOOK_SECRET     — shared secret to validate incoming POSTs
//   PARTNER_TOKENS     — JSON string of {partnerId: apiToken} pairs

const { getStore } = require("@netlify/blobs");

// Helper to get a Blobs store with explicit credentials when needed
function getBlobStore(name) {
  // Inside Netlify functions, auth is handled automatically
  // Only pass manual credentials if explicitly set AND we're not in a Netlify context
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const isNetlifyContext = !!process.env.NETLIFY_BLOBS_CONTEXT;
  
  if (!isNetlifyContext && siteID && token) {
    // Local/manual context — use explicit credentials
    return getStore({ name, siteID, token });
  }
  // Inside Netlify — use automatic auth
  return getStore(name);
}
const {
  getClientById,
  getClientHomes,
  getHomeLoans,
  mergeClientData,
  computeOpportunityScore,
  HIGH_VALUE_EVENTS,
} = require("./lib/homebot-api");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const incomingSecret = event.headers["x-webhook-secret"] ||
    event.headers["authorization"]?.replace("Bearer ", "");
  if (!process.env.WEBHOOK_SECRET || incomingSecret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const partnerId = event.queryStringParameters?.partner_id || null;
  const apiToken = resolveApiToken(partnerId);

  try {
    const events = Array.isArray(payload) ? payload : [payload];
    const results = [];
    for (const webhookEvent of events) {
      const result = await processEvent(webhookEvent, partnerId, apiToken);
      if (result) results.push(result);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, processed: results.length }),
    };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function processEvent(webhookEvent, partnerId, apiToken) {
  const eventData = webhookEvent?.attributes?.event_data || webhookEvent?.event_data;
  if (!eventData?.client_id) return null;

  const { client_id, action, source, properties, created_at, id: eventId } = eventData;
  const storeKey = partnerId ? `partner_${partnerId}_${client_id}` : `hb_${client_id}`;

  const clientStore = getBlobStore("clients");
  const eventStore = getBlobStore("client_events");
  const indexStore = getBlobStore("indexes");

  let record = null;
  try { record = await clientStore.get(storeKey, { type: "json" }); } catch {}

  if (!record) {
    try {
      const clientData = await getClientById(client_id, apiToken);
      let homeData = null, loanData = null;
      try {
        const homes = await getClientHomes(client_id, apiToken);
        if (homes.length > 0) {
          homeData = homes[0];
          const loans = await getHomeLoans(homeData.homebot_home_id, apiToken);
          loanData = loans.find(l => l.lien_position === "first") || loans[0] || null;
        }
      } catch {}
      record = { ...mergeClientData(clientData, homeData, loanData), id: storeKey, partner_id: partnerId };
    } catch {
      record = buildMinimalRecord(client_id, storeKey, partnerId);
    }
  }

  const signal = HIGH_VALUE_EVENTS[action] || null;
  record = applySignal(record, action, source, signal, eventId);
  await clientStore.setJSON(storeKey, record);

  let history = [];
  try { history = await eventStore.get(`${storeKey}_events`, { type: "json" }) || []; } catch {}
  history = [{ id: eventId || `ev_${Date.now()}`, event_type: action, source, properties: properties || {}, occurred_at: created_at || new Date().toISOString(), event_score: signal?.activity_points || 5 }, ...history].slice(0, 50);
  await eventStore.setJSON(`${storeKey}_events`, history);

  const indexKey = partnerId ? `partner_${partnerId}_keys` : "client_keys";
  let index = [];
  try { index = await indexStore.get(indexKey, { type: "json" }) || []; } catch {}
  if (!index.includes(storeKey)) { index.push(storeKey); await indexStore.setJSON(indexKey, index); }

  return { client_id, store_key: storeKey, event: action, opportunity_score: record.opportunity_score };
}

// Friendly labels for activity feed display
const EVENT_LABELS = {
  "view": "Explored the Home Digest",
  "homeowner-digest-email-open": "Opened Home Digest Email",
  "homeowner-digest-email-click": "Clicked Home Digest Email",
  "cma-request": "Requested a CMA",
  "viewed-refi-details": "Explored Refinance Details",
  "refi-slider-interaction": "Used Refi Calculator",
  "used-cashout-calculator": "Used Cash-Out Calculator",
  "likely-to-sell": "Showing Seller Signals",
  "highly-likely-to-sell": "Strong Seller Signal",
  "prequal-request": "Requested Pre-Qualification",
  "loan-application-cta-click": "Clicked Loan Application",
  "listing-favorited-event": "Favorited a Listing",
  "homeowner-direct-message": "Sent a Direct Message",
  "schedule-a-call-cta-click": "Clicked Schedule a Call",
  "viewed-should-you-sell": "Explored Should You Sell",
  "instant-offer-requested": "Requested Instant Offer",
  "buyer-digest-email-open": "Opened Buyer Digest Email",
  "listings-prequal-request": "Requested Pre-Qual from Listings",
  "ai-insight": "Viewed AI Insight",
};

function applySignal(record, action, source, signal, eventId) {
  const now = new Date().toISOString();
  record.last_activity = now;
  record.updated_at = now;

  // Store event on client record for Activity Feed
  const eventRecord = {
    event_id: eventId || `ev_${Date.now()}`,
    event_type: action,
    label: EVENT_LABELS[action] || action.replace(/-/g, " ").replace(/\w/g, c => c.toUpperCase()),
    occurred_at: now,
    source: source || "homebot",
  };
  const existingEvents = record.events || [];
  const alreadyExists = existingEvents.some(e => e.event_id === eventRecord.event_id);
  if (!alreadyExists) {
    record.events = [eventRecord, ...existingEvents].slice(0, 50);
  }

  if (!signal) return record;

  const m = record.metrics || {};
  if (signal.trigger === "cma_requested") m.cma_requested = true;
  if (signal.trigger === "refinance_viewed") m.refinance_opportunity = true;
  if (signal.trigger === "highly_engaged") {
    m.highly_engaged = true;
    m.activity_score = Math.min((m.activity_score || 0) + signal.activity_points, 100);
  }
  if (signal.trigger === "likely_to_buy") {
    m.likely_to_buy_score = Math.min((m.likely_to_buy_score || 0) + 15, 99);
    m.just_listed = true; // buyer signal
  }
  if (signal.trigger === "likely_to_sell") {
    m.likely_to_sell_score = Math.min((m.likely_to_sell_score || 0) + 10, 99);
  }
  if (!m.activity_score) m.activity_score = 0;
  m.activity_score = Math.min(m.activity_score + (signal.activity_points || 5), 100);
  m.updated_at = now;
  record.metrics = m;

  if (!record.triggers) record.triggers = [];
  if (!record.triggers.includes(signal.trigger)) record.triggers = [...record.triggers, signal.trigger];

  record.opportunity_score = computeOpportunityScore(
    m.likely_to_sell_score || 0, m.activity_score || 0,
    m.refinance_opportunity || false, m.equity_percent || 0, record.triggers
  );
  return record;
}

function buildMinimalRecord(clientId, storeKey, partnerId) {
  return {
    id: storeKey, homebot_client_id: clientId, partner_id: partnerId,
    name: "Loading...", email: "", phone: "", property_address: "",
    metrics: { estimated_value: 0, equity_amount: 0, equity_percent: 0, current_rate: 0, likely_to_sell_score: 0, likely_to_buy_score: 0, activity_score: 0, refinance_opportunity: false, highly_engaged: false, just_listed: false, cma_requested: false, updated_at: new Date().toISOString() },
    triggers: [], opportunity_score: 0, last_activity: new Date().toISOString(),
    last_contacted: null, events: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function resolveApiToken(partnerId) {
  if (!partnerId) return process.env.HOMEBOT_API_TOKEN;
  try { return JSON.parse(process.env.PARTNER_TOKENS || "{}")[partnerId] || process.env.HOMEBOT_API_TOKEN; }
  catch { return process.env.HOMEBOT_API_TOKEN; }
}
