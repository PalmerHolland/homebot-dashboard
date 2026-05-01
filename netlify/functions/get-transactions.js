// netlify/functions/get-transactions.js
// Retrieves all logged transactions stored in Netlify Blobs

const { getStore } = require("@netlify/blobs");

function getBlobStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const store = getBlobStore("transactions");
    const indexStore = getBlobStore("indexes");

    let keys = [];
    try { keys = await indexStore.get("transaction_keys", { type: "json" }) || []; } catch {}

    const transactions = [];
    for (const key of keys) {
      try {
        const t = await store.get(key, { type: "json" });
        if (t) transactions.push(t);
      } catch {}
    }

    // Sort newest first
    transactions.sort((a, b) => new Date(b.attributed_at) - new Date(a.attributed_at));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, transactions }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
