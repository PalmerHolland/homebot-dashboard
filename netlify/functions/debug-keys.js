// netlify/functions/debug-keys.js
// ONE-TIME debug function to check what keys are stored in Netlify Blobs

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
  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const indexStore = getBlobStore("indexes");
    const clientStore = getBlobStore("clients");

    // Get the stored index
    let ownKeys = [];
    try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch (e) { ownKeys = [`ERROR: ${e.message}`]; }

    // Get first 5 keys to see format
    const sampleKeys = ownKeys.slice(0, 5);
    const sampleRecords = [];
    for (const key of sampleKeys) {
      try {
        const r = await clientStore.get(key, { type: "json" });
        sampleRecords.push({ key, name: r?.name, email: r?.email, homebot_client_id: r?.homebot_client_id });
      } catch (e) {
        sampleRecords.push({ key, error: e.message });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total_own_keys: ownKeys.length,
        sample_keys: sampleKeys,
        sample_records: sampleRecords,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
