// netlify/functions/backfill-events.js
// Pulls historical webhook events from Homebot and stores them against client records.
// This populates the Activity Feed with existing data (viewed digest, CMA, refi etc.)
//
// POST body: { offset: 0, batch_size: 20, partner_id: null }
// Call repeatedly until done: true

const { getStore } = require("@netlify/blobs");
const { homebotRequest } = require("./lib/homebot-api");

function getBlobStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

// Map Homebot webhook event types to our internal trigger names
const EVENT_TO_TRIGGER = {
  "cma-request": "cma_requested",
  "cma_requested": "cma_requested",
  "viewed-refi-details": "refi_viewed",
  "refi-slider-interaction": "refi_viewed",
  "used-cashout-calculator": "refi_viewed",
  "likely-to-sell": "likely_to_sell",
  "highly-likely-to-sell": "likely_to_sell",
  "prequal-request": "likely_to_buy",
  "listings-prequal-request": "likely_to_buy",
  "loan-application-cta-click": "likely_to_buy",
  "listing-favorited-event": "likely_to_buy",
  "homeowner-digest-email-open": "highly_engaged",
  "homeowner-digest-email-click": "highly_engaged",
  "view": "highly_engaged",
  "homeowner-direct-message": "highly_engaged",
  "schedule-a-call-cta-click": "highly_engaged",
  "viewed-should-you-sell": "likely_to_sell",
  "instant-offer-requested": "likely_to_sell",
};

// Friendly display names for activity feed
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
  "listings-bot": "Used Listings Bot",
};

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

  const partnerId = body.partner_id || null;
  const offset = body.offset || 0;
  const batchSize = body.batch_size || 20;

  // Resolve webhook client ID and API token
  const webhookClientId = body.webhook_client_id || process.env.WEBHOOK_CLIENT_ID;
  const apiToken = partnerId
    ? JSON.parse(process.env.PARTNER_TOKENS || "{}")[partnerId]
    : process.env.HOMEBOT_API_TOKEN;

  if (!apiToken) {
    return { statusCode: 400, body: JSON.stringify({ error: "No API token found" }) };
  }

  if (!webhookClientId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "webhook_client_id required",
        hint: "Pass your webhook client ID: c2d8e4b6-14ba-4c29-9ba8-bde6464c2142",
      }),
    };
  }

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    // Fetch webhook events from Homebot
    const eventsPath = `/webhook-clients/${webhookClientId}/webhook-events?page[size]=${batchSize}&page[offset]=${offset}`;
    const eventsData = await homebotRequest(eventsPath, {}, apiToken);
    const events = Array.isArray(eventsData?.data) ? eventsData.data : [];
    const totalCount = eventsData?.meta?.total_count || events.length;
    const remaining = Math.max(totalCount - offset - events.length, 0);

    console.log(`Processing ${events.length} events (offset ${offset}, total ${totalCount})`);
    if (events.length > 0) {
      // Log FULL raw event to see exact Homebot structure
      const sampleEvent = events[0];
      console.log("FULL raw event:", JSON.stringify(sampleEvent).substring(0, 1000));
      console.log("All event keys:", Object.keys(sampleEvent));
      if (sampleEvent.attributes) {
        console.log("Attributes keys:", Object.keys(sampleEvent.attributes));
        console.log("Attributes:", JSON.stringify(sampleEvent.attributes).substring(0, 500));
      }
    }

    let processed = 0;
    let updated = 0;
    const activityLog = [];

    for (const evt of events) {
      processed++;
      // Homebot nests event data at: attributes.body.attributes.event_data
      const topAttrs = evt.attributes || {};
      const body = topAttrs.body || {};
      const bodyAttrs = body.attributes || {};
      const eventData = bodyAttrs.event_data || {};

      // Extract client info
      const clientId = eventData.client_id;
      const clientEmail = eventData.client_email || "";
      const clientName = eventData.client_name || "";
      const eventType = eventData.event_name || eventData.action || topAttrs["event-type"] || "view";
      const occurredAt = eventData.created_at || bodyAttrs.created_at || topAttrs["created-at"] || new Date().toISOString();
      const eventId = eventData.id || evt.id;

      if (!clientId) continue;

      if (!clientId) continue;

      // Find the client record — try multiple key formats
      const ownKey = `hb_${clientId}`;
      const partnerKey = partnerId ? `partner_${partnerId}_${clientId}` : null;
      let storeKey = null;
      let client = null;

      // Our store keys are: hb_{homebot_client_id} for own clients
      // and partner_{pid}_{homebot_client_id} for partner clients
      // Try own key directly
      try {
        const result = await clientStore.get(ownKey, { type: "json" });
        if (result && result.homebot_client_id) { client = result; storeKey = ownKey; }
      } catch {}

      // Try partner keys
      if (!client) {
        const allPartnerTokens = JSON.parse(process.env.PARTNER_TOKENS || "{}");
        for (const pid of Object.keys(allPartnerTokens)) {
          try {
            const pk = `partner_${pid}_${clientId}`;
            const result = await clientStore.get(pk, { type: "json" });
            if (result && result.homebot_client_id) { client = result; storeKey = pk; break; }
          } catch {}
        }
      }

      // Email fallback using index (fast — no full scan)
      if (!client && clientEmail) {
        try {
          // Build email->key map from stored index
          const emailIndex = await indexStore.get("email_index", { type: "json" }) || {};
          const emailKey = clientEmail.toLowerCase();
          if (emailIndex[emailKey]) {
            storeKey = emailIndex[emailKey];
            try { client = await clientStore.get(storeKey, { type: "json" }); } catch {}
          }
        } catch {}
      }

      if (!client || !storeKey) {
        // Store in email index for future lookups
        if (clientEmail && clientId) {
          try {
            const emailIndex = await indexStore.get("email_index", { type: "json" }) || {};
            emailIndex[clientEmail.toLowerCase()] = ownKey;
            await indexStore.setJSON("email_index", emailIndex);
          } catch {}
        }
        continue;
      }

      // Build event record
      const eventRecord = {
        event_id: eventId || evt.id,
        event_type: eventType,
        label: EVENT_LABELS[eventType] || eventType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        occurred_at: occurredAt,
        properties: eventData.properties || {},
        source: eventData.source || "homebot",
      };

      // Update client events array (avoid duplicates)
      const existingEvents = client.events || [];
      const alreadyExists = existingEvents.some(e => e.event_id === evt.id);
      if (alreadyExists) continue;

      const updatedEvents = [eventRecord, ...existingEvents].slice(0, 50); // keep last 50

      // Update triggers and metrics based on event
      const trigger = EVENT_TO_TRIGGER[eventType];
      const updatedTriggers = [...new Set([...(client.triggers || []), ...(trigger ? [trigger] : [])])];

      // Update specific metric flags
      const updatedMetrics = { ...(client.metrics || {}) };
      if (eventType === "cma-request" || eventType === "cma_requested") {
        updatedMetrics.cma_requested = true;
      }
      if (["view", "homeowner-digest-email-open", "homeowner-digest-email-click", "homeowner-direct-message", "schedule-a-call-cta-click"].includes(eventType)) {
        updatedMetrics.highly_engaged = true;
        updatedMetrics.activity_score = Math.min((updatedMetrics.activity_score || 0) + 10, 100);
      }
      if (["viewed-refi-details", "refi-slider-interaction", "used-cashout-calculator"].includes(eventType)) {
        updatedMetrics.refinance_opportunity = true;
      }
      if (["listing-favorited-event", "prequal-request", "loan-application-cta-click"].includes(eventType)) {
        updatedMetrics.just_listed = true; // buyer signal
      }

      // Recalculate opportunity score with updated data
      const activityScore = updatedMetrics.activity_score || 0;
      const sellScore = updatedMetrics.likely_to_sell_score || 0;
      const refiOpp = updatedMetrics.refinance_opportunity ? 1 : 0;
      const equityScore = Math.min((updatedMetrics.equity_percent || 0) / 100, 1);
      const triggerScore = Math.min(updatedTriggers.length * 10, 30);
      const newOpportunityScore = Math.round(
        sellScore * 0.35 +
        activityScore * 0.20 +
        refiOpp * 85 * 0.15 +
        equityScore * 100 * 0.15 +
        triggerScore * 0.10
      );

      const updatedClient = {
        ...client,
        events: updatedEvents,
        triggers: updatedTriggers,
        metrics: updatedMetrics,
        last_activity: occurredAt,
        opportunity_score: Math.max(newOpportunityScore, client.opportunity_score || 0),
      };

      await clientStore.setJSON(storeKey, updatedClient);
      updated++;

      activityLog.push({
        client: client.name,
        event: eventType,
        label: eventRecord.label,
        occurred_at: occurredAt,
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        processed,
        updated,
        remaining,
        next_offset: offset + batchSize,
        done: remaining === 0,
        sample_activity: activityLog.slice(0, 5),
        message: remaining === 0
          ? `Backfill complete — processed ${processed} events, updated ${updated} clients`
          : `Batch done — ${remaining} events remaining. Call again with offset: ${offset + batchSize}`,
      }),
    };
  } catch (err) {
    console.error("Backfill error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
