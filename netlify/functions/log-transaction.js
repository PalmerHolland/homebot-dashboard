// netlify/functions/log-transaction.js
// Saves a transaction attribution to Netlify Blobs
//
// POST body: { client_id, client_name, partner_id, type, close_date, loan_amount, notes, signal }

const { getStore } = require("@netlify/blobs");

function getBlobStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const isNetlifyContext = !!process.env.NETLIFY_BLOBS_CONTEXT;
  if (!isNetlifyContext && siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
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

  const { client_id, client_name, partner_id, type, close_date, loan_amount, notes, signal } = body;

  if (!client_id || !client_name) {
    return { statusCode: 400, body: JSON.stringify({ error: "client_id and client_name required" }) };
  }

  try {
    const store = getBlobStore("transactions");
    const indexStore = getBlobStore("indexes");
    const clientStore = getBlobStore("clients");

    const id = `txn_${Date.now()}_${client_id.replace(/[^a-z0-9]/gi, '_')}`;
    const transaction = {
      id,
      client_id,
      client_name,
      partner_id: partner_id || null,
      type: type || "general",
      close_date: close_date || new Date().toISOString().split("T")[0],
      loan_amount: loan_amount ? parseFloat(loan_amount) : null,
      notes: notes || "",
      signal: signal || "general",
      attributed_at: new Date().toISOString(),
    };

    // Save transaction
    await store.setJSON(id, transaction);

    // Update index
    let keys = [];
    try { keys = await indexStore.get("transaction_keys", { type: "json" }) || []; } catch {}
    keys.push(id);
    await indexStore.setJSON("transaction_keys", keys);

    // Tag the client record as having a transaction
    try {
      const client = await clientStore.get(client_id, { type: "json" });
      if (client) {
        client.transaction_attributed = true;
        client.last_transaction = transaction;
        await clientStore.setJSON(client_id, client);
      }
    } catch {}

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, transaction }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
