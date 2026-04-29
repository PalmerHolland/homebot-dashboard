// netlify/functions/get-clients.js
// Returns all clients from Netlify Blobs — own + all partner databases.
// Called by the dashboard on load and every 60 seconds for live updates.

const { getStore } = require("@netlify/blobs");

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
    const clientStore = getStore("clients");
    const eventStore = getStore("client_events");
    const indexStore = getStore("indexes");

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

        let events = [];
        try { events = await eventStore.get(`${key}_events`, { type: "json" }) || []; } catch {}

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
