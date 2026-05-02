// netlify/functions/fix-partner-tags.js
// One-time cleanup function that corrects partner_id assignments.
// Your own clients (stored as hb_*) should have partner_id: null
// Partner clients (stored as partner_*) keep their partner_id.
//
// POST /.netlify/functions/fix-partner-tags
// Headers: x-webhook-secret

const { getStore } = require("@netlify/blobs");

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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const dryRun = body.dry_run !== false; // default to dry run for safety

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    // Load all indexes
    let ownKeys = [];
    let partnerKeyMap = {}; // { partnerId: [keys] }

    try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}

    // Find all partner key indexes
    // We'll check for natalee_parker and any others
    const knownPartners = Object.keys(JSON.parse(process.env.PARTNER_TOKENS || "{}"));
    for (const pid of knownPartners) {
      try {
        const keys = await indexStore.get(`partner_${pid}_keys`, { type: "json" }) || [];
        partnerKeyMap[pid] = keys;
      } catch {}
    }

    console.log(`Own keys: ${ownKeys.length}`);
    console.log(`Partner key map:`, Object.entries(partnerKeyMap).map(([k,v]) => `${k}: ${v.length}`));

    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;
    const fixLog = [];

    // Get ALL keys from ALL indexes
    const allOwnKeys = new Set(ownKeys);
    const allPartnerKeys = new Map(); // key -> correctPartnerId
    for (const [partnerId, keys] of Object.entries(partnerKeyMap)) {
      for (const k of keys) allPartnerKeys.set(k, partnerId);
    }

    // Combine all keys to process
    const allKeys = [...new Set([...allOwnKeys, ...allPartnerKeys.keys()])];

    console.log(`Processing ${allKeys.length} total keys`);
    console.log(`Own: ${allOwnKeys.size}, Partner: ${allPartnerKeys.size}`);

    for (const key of allKeys) {
      try {
        const client = await clientStore.get(key, { type: "json" });
        if (!client) continue;

        // Determine correct partner_id based on the STORE KEY pattern
        // hb_* = your own clients (partner_id should be null)
        // partner_X_* = partner X's clients (partner_id should be X)
        let correctPartnerId = null;
        if (key.startsWith("partner_")) {
          // Extract partner ID from key: partner_natalee_parker_abc123 -> natalee_parker
          const parts = key.split("_");
          // Find which registered partner this key belongs to
          for (const pid of Object.keys(partnerKeyMap)) {
            if (key.startsWith(`partner_${pid}_`)) {
              correctPartnerId = pid;
              break;
            }
          }
        }
        // hb_* keys = your own clients = null partner_id

        if (client.partner_id !== correctPartnerId) {
          fixLog.push({
            key,
            old_partner_id: client.partner_id,
            new_partner_id: correctPartnerId,
            name: client.name,
          });
          if (!dryRun) {
            client.partner_id = correctPartnerId;
            client.id = key;
            await clientStore.setJSON(key, client);
          }
          fixed++;
        } else {
          alreadyCorrect++;
        }
      } catch (err) {
        errors++;
        console.error(`Error processing ${key}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        dry_run: dryRun,
        fixed,
        already_correct: alreadyCorrect,
        errors,
        total_processed: ownKeys.length + Object.values(partnerKeyMap).flat().length,
        sample_fixes: fixLog.slice(0, 10),
        message: dryRun
          ? `DRY RUN: Would fix ${fixed} clients. Run again with dry_run: false to apply.`
          : `Fixed ${fixed} clients. ${alreadyCorrect} were already correct.`,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
