// netlify/functions/log-referral.js
// Logs which clients were referred to an agent for a given week
// and tracks outcomes (listing, purchase, referral)
//
// POST body actions:
//   action: "add_referral" — add a weekly referral
//   action: "log_outcome" — log a win outcome against a referral
//   action: "get_referrals" — get all referrals for a partner
//   action: "get_stats" — get win stats for reporting

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

  const { action, partner_id } = body;

  try {
    const store = getBlobStore("referrals");
    const indexStore = getBlobStore("indexes");

    // ── ADD WEEKLY REFERRAL ───────────────────────────────────────────────
    if (action === "add_referral") {
      const { client_id, client_name, client_email, week_of, notes, triggers, opportunity_score } = body;
      if (!partner_id || !client_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "partner_id and client_id required" }) };
      }

      const weekOf = week_of || getWeekStart();
      const id = `ref_${partner_id}_${client_id}_${weekOf.replace(/-/g, '')}`;

      const referral = {
        id,
        partner_id,
        client_id,
        client_name,
        client_email,
        week_of: weekOf,
        referred_at: new Date().toISOString(),
        notes: notes || "",
        triggers: triggers || [],
        opportunity_score: opportunity_score || 0,
        outcome: null, // listing | purchase | referral | no_response | not_ready
        outcome_date: null,
        outcome_notes: "",
        outcome_value: null,
      };

      await store.setJSON(id, referral);

      // Update index
      let keys = [];
      try { keys = await indexStore.get(`referral_keys_${partner_id}`, { type: "json" }) || []; } catch {}
      if (!keys.includes(id)) {
        keys.push(id);
        await indexStore.setJSON(`referral_keys_${partner_id}`, keys);
      }

      // Also update global referral index
      let allKeys = [];
      try { allKeys = await indexStore.get("all_referral_keys", { type: "json" }) || []; } catch {}
      if (!allKeys.includes(id)) {
        allKeys.push(id);
        await indexStore.setJSON("all_referral_keys", allKeys);
      }

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, referral }),
      };
    }

    // ── LOG OUTCOME ───────────────────────────────────────────────────────
    if (action === "log_outcome") {
      const { referral_id, outcome, outcome_notes, outcome_value } = body;
      if (!referral_id) return { statusCode: 400, body: JSON.stringify({ error: "referral_id required" }) };

      const referral = await store.get(referral_id, { type: "json" });
      if (!referral) return { statusCode: 404, body: JSON.stringify({ error: "Referral not found" }) };

      const updated = {
        ...referral,
        outcome,
        outcome_date: new Date().toISOString(),
        outcome_notes: outcome_notes || "",
        outcome_value: outcome_value || null,
      };

      await store.setJSON(referral_id, updated);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, referral: updated }),
      };
    }

    // ── GET REFERRALS FOR PARTNER ─────────────────────────────────────────
    if (action === "get_referrals") {
      const { week_of, include_all } = body;
      let keys = [];
      try { keys = await indexStore.get(`referral_keys_${partner_id}`, { type: "json" }) || []; } catch {}

      const referrals = [];
      for (const key of keys) {
        try {
          const r = await store.get(key, { type: "json" });
          if (r) referrals.push(r);
        } catch {}
      }

      // Filter by week if specified
      const filtered = week_of && !include_all
        ? referrals.filter(r => r.week_of === week_of)
        : referrals;

      filtered.sort((a, b) => new Date(b.referred_at) - new Date(a.referred_at));

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, referrals: filtered }),
      };
    }

    // ── GET WIN STATS ─────────────────────────────────────────────────────
    if (action === "get_stats") {
      // Get all referrals across all partners or specific partner
      let allKeys = [];
      if (partner_id) {
        try { allKeys = await indexStore.get(`referral_keys_${partner_id}`, { type: "json" }) || []; } catch {}
      } else {
        try { allKeys = await indexStore.get("all_referral_keys", { type: "json" }) || []; } catch {}
      }

      const referrals = [];
      for (const key of allKeys) {
        try {
          const r = await store.get(key, { type: "json" });
          if (r) referrals.push(r);
        } catch {}
      }

      // Calculate stats
      const total_referrals = referrals.length;
      const listings = referrals.filter(r => r.outcome === "listing").length;
      const purchases = referrals.filter(r => r.outcome === "purchase").length;
      const referral_outs = referrals.filter(r => r.outcome === "referral").length;
      const no_response = referrals.filter(r => r.outcome === "no_response").length;
      const pending = referrals.filter(r => !r.outcome).length;
      const total_wins = listings + purchases + referral_outs;
      const conversion_rate = total_referrals > 0 ? Math.round((total_wins / total_referrals) * 100) : 0;

      // Group by partner
      const by_partner = {};
      for (const r of referrals) {
        if (!by_partner[r.partner_id]) {
          by_partner[r.partner_id] = { total: 0, listings: 0, purchases: 0, referrals: 0, pending: 0 };
        }
        by_partner[r.partner_id].total++;
        if (r.outcome === "listing") by_partner[r.partner_id].listings++;
        if (r.outcome === "purchase") by_partner[r.partner_id].purchases++;
        if (r.outcome === "referral") by_partner[r.partner_id].referrals++;
        if (!r.outcome) by_partner[r.partner_id].pending++;
      }

      // Recent wins for display
      const recent_wins = referrals
        .filter(r => r.outcome && r.outcome !== "no_response" && r.outcome !== "not_ready")
        .sort((a, b) => new Date(b.outcome_date) - new Date(a.outcome_date))
        .slice(0, 10);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          stats: {
            total_referrals, listings, purchases,
            referral_outs, no_response, pending,
            total_wins, conversion_rate, by_partner,
          },
          recent_wins,
          all_referrals: referrals,
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };

  } catch (err) {
    console.error("log-referral error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}
