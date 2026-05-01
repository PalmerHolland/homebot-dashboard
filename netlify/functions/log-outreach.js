// netlify/functions/log-outreach.js
// Logs a call, email, or note against a client and updates last_contacted.

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { store_key, outreach_type, note, outcome, next_follow_up_at } = body;
  if (!store_key) {
    return { statusCode: 400, body: JSON.stringify({ error: "store_key is required" }) };
  }

  try {
    const clientStore = getBlobStore("clients");
    const outreachStore = getBlobStore("outreach_log");

    // Update client last_contacted
    try {
      const client = await clientStore.get(store_key, { type: "json" });
      if (client) {
        client.last_contacted = new Date().toISOString();
        client.last_outreach = {
          note: body.note || "",
          logged_at: new Date().toISOString(),
          type: body.type || "call",
        };
        await clientStore.setJSON(store_key, client);
      }
    } catch {}

    // Append to outreach log
    let log = [];
    try { log = await outreachStore.get(`${store_key}_outreach`, { type: "json" }) || []; } catch {}

    const entry = {
      id: `out_${Date.now()}`,
      store_key,
      outreach_type: outreach_type || "note",
      note: note || "",
      outcome: outcome || "",
      next_follow_up_at: next_follow_up_at || null,
      created_at: new Date().toISOString(),
    };

    log = [entry, ...log].slice(0, 100);
    await outreachStore.setJSON(`${store_key}_outreach`, log);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, entry }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
