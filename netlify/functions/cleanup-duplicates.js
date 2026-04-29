// netlify/functions/cleanup-duplicates.js
// Finds and removes duplicate client records caused by clients being stored
// under both hb_* (own) and partner_*_* (partner) keys.
//
// Logic:
// - If a client email exists under BOTH hb_* and partner_natalee_parker_*,
//   keep hb_* (your own) and remove the partner_* duplicate
// - If a client ONLY exists under partner_natalee_parker_*, keep it as hers
// - If a client ONLY exists under hb_*, keep it as yours
//
// POST /.netlify/functions/cleanup-duplicates
// Body: { "dry_run": true }  -- see what will be fixed
// Body: { "dry_run": false } -- apply the fix

const { getStore } = require("@netlify/blobs");

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

  const secret = event.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const dryRun = body.dry_run !== false;

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    // Load all indexes
    let ownKeys = [];
    try { ownKeys = await indexStore.get("client_keys", { type: "json" }) || []; } catch {}

    const knownPartners = Object.keys(JSON.parse(process.env.PARTNER_TOKENS || "{}"));
    const partnerKeyMap = {};
    for (const pid of knownPartners) {
      try {
        partnerKeyMap[pid] = await indexStore.get(`partner_${pid}_keys`, { type: "json" }) || [];
      } catch { partnerKeyMap[pid] = []; }
    }

    console.log(`Own keys: ${ownKeys.length}`);
    for (const [pid, keys] of Object.entries(partnerKeyMap)) {
      console.log(`Partner ${pid} keys: ${keys.length}`);
    }

    // Build email -> key map for own clients
    const ownEmailToKey = {};
    const ownClientData = {};

    for (const key of ownKeys) {
      try {
        const client = await clientStore.get(key, { type: "json" });
        if (client && client.email) {
          ownEmailToKey[client.email.toLowerCase()] = key;
          ownClientData[client.email.toLowerCase()] = client;
        }
      } catch {}
    }

    console.log(`Own clients with email: ${Object.keys(ownEmailToKey).length}`);

    // Now check partner clients — find duplicates
    const toDelete = []; // partner keys to delete (duplicates of own clients)
    const toKeep = [];   // partner keys that are genuinely partner clients
    const toFixOwn = []; // own keys that have wrong partner_id

    for (const [partnerId, keys] of Object.entries(partnerKeyMap)) {
      for (const key of keys) {
        try {
          const client = await clientStore.get(key, { type: "json" });
          if (!client) continue;

          const email = (client.email || "").toLowerCase();

          if (email && ownEmailToKey[email]) {
            // This email exists in BOTH own and partner — it's a duplicate
            // Keep the own record (hb_*), delete this partner record
            toDelete.push({
              key,
              email,
              name: client.name,
              partner_id: partnerId,
              own_key: ownEmailToKey[email],
            });
          } else {
            // Unique to partner — keep it, just ensure correct partner_id
            if (client.partner_id !== partnerId) {
              toKeep.push({ key, email, name: client.name, fix_partner_id: partnerId });
            }
          }
        } catch {}
      }
    }

    // Also fix own clients that have wrong partner_id set
    for (const [email, key] of Object.entries(ownEmailToKey)) {
      const client = ownClientData[email];
      if (client && client.partner_id !== null && client.partner_id !== undefined) {
        toFixOwn.push({ key, email, name: client.name, wrong_partner_id: client.partner_id });
      }
    }

    console.log(`Duplicates to delete: ${toDelete.length}`);
    console.log(`Partner records to fix: ${toKeep.length}`);
    console.log(`Own records with wrong partner_id: ${toFixOwn.length}`);

    if (!dryRun) {
      // Delete duplicate partner records
      for (const item of toDelete) {
        try {
          await clientStore.delete(item.key);
          // Remove from partner index
          for (const [pid, keys] of Object.entries(partnerKeyMap)) {
            const idx = keys.indexOf(item.key);
            if (idx > -1) {
              keys.splice(idx, 1);
              await indexStore.setJSON(`partner_${pid}_keys`, keys);
            }
          }
        } catch (err) {
          console.error(`Failed to delete ${item.key}:`, err.message);
        }
      }

      // Fix partner records with wrong partner_id
      for (const item of toKeep) {
        try {
          const client = await clientStore.get(item.key, { type: "json" });
          if (client) {
            client.partner_id = item.fix_partner_id;
            await clientStore.setJSON(item.key, client);
          }
        } catch {}
      }

      // Fix own records with wrong partner_id
      for (const item of toFixOwn) {
        try {
          const client = await clientStore.get(item.key, { type: "json" });
          if (client) {
            client.partner_id = null;
            await clientStore.setJSON(item.key, client);
          }
        } catch {}
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        dry_run: dryRun,
        duplicates_found: toDelete.length,
        partner_records_to_fix: toKeep.length,
        own_records_to_fix: toFixOwn.length,
        sample_duplicates: toDelete.slice(0, 10).map(d => ({ name: d.name, email: d.email })),
        sample_own_fixes: toFixOwn.slice(0, 10).map(d => ({ name: d.name, wrong_partner_id: d.wrong_partner_id })),
        message: dryRun
          ? `DRY RUN: Found ${toDelete.length} duplicate records and ${toFixOwn.length} own clients with wrong partner tags. Run with dry_run: false to fix.`
          : `Fixed: deleted ${toDelete.length} duplicates, fixed ${toFixOwn.length} own client partner tags, fixed ${toKeep.length} partner records.`,
      }),
    };
  } catch (err) {
    console.error("Cleanup error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
