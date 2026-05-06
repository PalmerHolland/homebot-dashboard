// netlify/functions/get-messages.js
// Fetches direct messages sent by clients through Homebot
// Also returns highly engaged clients list

const { homebotRequest } = require("./lib/homebot-api");

function getBlobStore(name) {
  const { getStore } = require("@netlify/blobs");
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const isNetlifyContext = !!process.env.NETLIFY_BLOBS_CONTEXT;
  if (!isNetlifyContext && siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const apiToken = process.env.HOMEBOT_API_TOKEN;
    const partnerTokens = JSON.parse(process.env.PARTNER_TOKENS || "{}");
    const allTokens = { own: apiToken, ...partnerTokens };

    const allMessages = [];
    const engagedMap = {}; // clientId -> { name, email, activity_count, partner_id }

    // Fetch messages from each account
    for (const [accountId, token] of Object.entries(allTokens)) {
      const partnerId = accountId === "own" ? null : accountId;
      try {
        // Try to get messages via clients endpoint
        // Homebot stores messages in the event/activity stream
        // We look for homeowner-direct-message events
        const data = await homebotRequest("/clients?page[size]=100", {}, token);
        const clients = Array.isArray(data?.data) ? data.data : [];

        for (const client of clients) {
          const attrs = client.attributes || {};
          const name = `${attrs["first-name"] || ""} ${attrs["last-name"] || ""}`.trim();
          const email = attrs.email || "";
          const clientId = client.id;

          // Check if client has sent messages (direct_message flag)
          if (attrs["has-direct-message"] || attrs["direct-message-count"] > 0) {
            // Try to fetch their messages
            try {
              const msgData = await homebotRequest(`/clients/${clientId}/messages`, {}, token);
              const messages = Array.isArray(msgData?.data) ? msgData.data : [];
              for (const msg of messages) {
                const ma = msg.attributes || {};
                if (!ma.read && ma.body) {
                  allMessages.push({
                    id: msg.id,
                    client_id: clientId,
                    client_name: name,
                    client_email: email,
                    partner_id: partnerId,
                    message: ma.body,
                    sent_at: ma["created-at"] || ma.created_at,
                    read: ma.read || false,
                  });
                }
              }
            } catch {}
          }

          // Track activity for highly engaged
          const activityScore = attrs["activity-score"] || attrs["engagement-score"] || 0;
          if (activityScore > 0) {
            engagedMap[clientId] = {
              client_id: clientId,
              name,
              email,
              partner_id: partnerId,
              activity_count: activityScore,
            };
          }
        }
      } catch (err) {
        console.warn(`Error fetching for account ${accountId}:`, err.message);
      }
    }

    // Also pull messages from stored client events in Blobs
    try {
      const clientStore = getBlobStore("clients");
      const indexStore = getBlobStore("indexes");
      let allKeys = [];
      try { allKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}
      const partnerKeys = JSON.parse(process.env.PARTNER_TOKENS || "{}");
      for (const pid of Object.keys(partnerKeys)) {
        try {
          const pk = await indexStore.get(`partner_${pid}_keys`, { type: "json" }) || [];
          allKeys = [...allKeys, ...pk];
        } catch {}
      }

      for (const key of allKeys.slice(0, 200)) {
        try {
          const client = await clientStore.get(key, { type: "json" });
          if (!client?.events) continue;

          for (const ev of client.events) {
            if (ev.event_type === "homeowner-direct-message" && ev.properties?.message) {
              const existing = allMessages.find(m => m.client_id === client.homebot_client_id && m.message === ev.properties.message);
              if (!existing) {
                allMessages.push({
                  id: ev.event_id || `msg_${Date.now()}`,
                  client_id: client.homebot_client_id,
                  client_name: client.name,
                  client_email: client.email,
                  partner_id: client.partner_id,
                  message: ev.properties.message,
                  sent_at: ev.occurred_at,
                  read: false,
                  from_events: true,
                });
              }
            }
            // Track highly engaged from events
            if (["view", "homeowner-digest-email-open", "homeowner-digest-email-click"].includes(ev.event_type)) {
              if (!engagedMap[client.homebot_client_id]) {
                engagedMap[client.homebot_client_id] = {
                  client_id: client.homebot_client_id,
                  name: client.name,
                  email: client.email,
                  partner_id: client.partner_id,
                  activity_count: 0,
                };
              }
              engagedMap[client.homebot_client_id].activity_count++;
            }
          }
        } catch {}
      }
    } catch {}

    const engagedList = Object.values(engagedMap)
      .sort((a, b) => b.activity_count - a.activity_count)
      .slice(0, 10);

    allMessages.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        messages: allMessages,
        highly_engaged: engagedList,
        unread_count: allMessages.filter(m => !m.read).length,
      }),
    };
  } catch (err) {
    console.error("get-messages error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
