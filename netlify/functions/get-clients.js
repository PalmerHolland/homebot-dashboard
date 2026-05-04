// netlify/functions/get-clients.js
// Returns all clients from Netlify Blobs — own + all partner databases.
// Called by the dashboard on load and every 60 seconds for live updates.

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

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=30",
  };

  try {
    const clientStore = getBlobStore("clients");
    const eventStore = getBlobStore("client_events");
    const indexStore = getBlobStore("indexes");

    // Load own client keys
    let ownKeys = [];
    try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}

    // Load partner client keys — check for all registered partners
    let partnerKeys = [];
    let partnerIndex = {};
    try {
      partnerIndex = await indexStore.get("partner_index", { type: "json" }) || {};
    } catch {}

    for (const partnerId of Object.keys(partnerIndex)) {
      try {
        const pKeys = await indexStore.get(`partner_${partnerId}_keys`, { type: "json" }) || [];
        partnerKeys = [...partnerKeys, ...pKeys];
      } catch {}
    }

    const allKeys = [...new Set([...ownKeys, ...partnerKeys])];

    if (allKeys.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ clients: [], total: 0, partners: partnerIndex }),
      };
    }

    // Fetch all clients in parallel
    const clientPromises = allKeys.map(async (key) => {
      try {
        const client = await clientStore.get(key, { type: "json" });
        if (!client) return null;

        // Events can be stored two ways:
        // 1. Directly on the client record (from backfill/webhook)
        // 2. In a separate event store (legacy)
        // Merge both sources, deduplicate by event_id
        let separateEvents = [];
        try { separateEvents = await eventStore.get(`${key}_events`, { type: "json" }) || []; } catch {}
        
        const clientEvents = Array.isArray(client.events) ? client.events : [];
        const allEventsMap = new Map();
        [...clientEvents, ...separateEvents].forEach(ev => {
          if (ev && (ev.event_id || ev.id)) {
            allEventsMap.set(ev.event_id || ev.id, ev);
          }
        });
        const events = Array.from(allEventsMap.values())
          .sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at))
          .slice(0, 50);

        return { ...client, events };
      } catch { return null; }
    });

    const results = await Promise.all(clientPromises);
    const clients = results
      .filter(Boolean)
      .sort((a, b) => b.opportunity_score - a.opportunity_score);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clients,
        total: clients.length,
        own_count: ownKeys.length,
        partner_count: partnerKeys.length,
        partners: partnerIndex,
        last_updated: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("get-clients error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
