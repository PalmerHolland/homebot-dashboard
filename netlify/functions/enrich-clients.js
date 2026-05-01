// netlify/functions/enrich-clients.js
// Enriches stored client records with home and loan data from Homebot API.
// Runs in small batches to avoid Netlify's 10-second function timeout.
//
// Call repeatedly until all clients are enriched:
//   POST /.netlify/functions/enrich-clients
//   Headers: x-webhook-secret, Content-Type: application/json
//   Body: {} (or {"batch_size": 20, "offset": 0})
//
// Returns:
//   { enriched, skipped, remaining, total, done }
//
// Keep calling until "done": true

const { getStore } = require("@netlify/blobs");
const {
  getClientHomes,
  getHomeLoans,
  mergeClientData,
  normalizeClient,
} = require("./lib/homebot-api");

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

  const batchSize = body.batch_size || 15;
  const offset = body.offset || 0;
  const partnerId = body.partner_id || null;
  const apiToken = resolveApiToken(partnerId);

  try {
    const clientStore = getBlobStore("clients");
    const indexStore = getBlobStore("indexes");

    const indexKey = partnerId ? `partner_${partnerId}_keys` : "client_keys";
    let allKeys = [];
    try { allKeys = await indexStore.get(indexKey, { type: "json" }) || []; } catch {}

    if (allKeys.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enriched: 0, skipped: 0, remaining: 0, total: 0, done: true, message: "No clients found to enrich" }),
      };
    }

    // Get the batch to process
    const batch = allKeys.slice(offset, offset + batchSize);
    const remaining = Math.max(allKeys.length - offset - batchSize, 0);

    let enriched = 0;
    let skipped = 0;

    for (const storeKey of batch) {
      try {
        const client = await clientStore.get(storeKey, { type: "json" });
        if (!client || !client.homebot_client_id) { skipped++; continue; }

        // Skip if already enriched with real data
        if (client.metrics?.estimated_value > 0 && client.metrics?.current_rate > 0) {
          skipped++;
          continue;
        }

        // Fetch home data
        let homeData = null;
        let loanData = null;

        try {
          const homes = await getClientHomes(client.homebot_client_id, apiToken);
          if (homes.length > 0) {
            homeData = homes[0];
            console.log(`Home data for ${client.name}: value=${homeData.appraised_value}, equity_amt=${homeData.equity_amount}, equity_pct=${homeData.equity_percent}, balance=${homeData.outstanding_balance}`);
            try {
              const loans = await getHomeLoans(homeData.homebot_home_id, apiToken);
              // Pick first-lien purchase loan, not refi
              loanData = loans.find(l => l.lien_position === "first" && !l.refi)
                || loans.find(l => l.lien_position === "first")
                || loans[0] || null;
              if (loanData) {
                console.log(`Loan data for ${client.name}: rate=${loanData.rate}, amount=${loanData.amount}, type=${loanData.loan_type}`);
              }
            } catch {}
          }
        } catch (err) {
          console.warn(`Could not fetch home for ${client.homebot_client_id}:`, err.message);
          skipped++;
          continue;
        }

        if (!homeData && !loanData) { skipped++; continue; }

        // Build a normalized client object for merging
        const clientForMerge = {
          homebot_client_id: client.homebot_client_id,
          name: client.name,
          first_name: client.first_name || "",
          last_name: client.last_name || "",
          email: client.email,
          phone: client.phone || "",
          likely_to_sell_score: client.metrics?.likely_to_sell_score || 0,
          lead_source: client.lead_source || "",
          buyers_access: client.buyers_access || null,
          close_date: client.close_date || null,
          created_at: client.created_at,
          updated_at: client.updated_at,
          external_mappings: client.external_mappings || [],
        };

        const merged = mergeClientData(clientForMerge, homeData, loanData);

        // Merge enriched data into existing record, preserving activity signals
        // Build enriched record — prioritize real Homebot data over stored zeros
        const enrichedMetrics = {
          ...client.metrics,
          // Only update if merged has real values (non-zero)
          estimated_value: merged.metrics.estimated_value > 0 ? merged.metrics.estimated_value : (client.metrics?.estimated_value || 0),
          equity_amount: merged.metrics.equity_amount > 0 ? merged.metrics.equity_amount : (client.metrics?.equity_amount || 0),
          equity_percent: merged.metrics.equity_percent > 0 ? merged.metrics.equity_percent : (client.metrics?.equity_percent || 0),
          estimated_balance: merged.metrics.estimated_balance > 0 ? merged.metrics.estimated_balance : (client.metrics?.estimated_balance || 0),
          current_rate: merged.metrics.current_rate > 0 ? merged.metrics.current_rate : (client.metrics?.current_rate || 0),
          apr: merged.metrics.apr > 0 ? merged.metrics.apr : (client.metrics?.apr || 0),
          loan_amount: merged.metrics.loan_amount > 0 ? merged.metrics.loan_amount : (client.metrics?.loan_amount || 0),
          loan_type: merged.metrics.loan_type || client.metrics?.loan_type || "",
          loan_program: merged.metrics.loan_program || client.metrics?.loan_program || "",
          finance_type: merged.metrics.finance_type || client.metrics?.finance_type || "",
          term_years: merged.metrics.term_years > 0 ? merged.metrics.term_years : (client.metrics?.term_years || 30),
          adjustable: merged.metrics.adjustable,
          pmi_monthly: merged.metrics.pmi_monthly,
          total_monthly_payment: merged.metrics.total_monthly_payment > 0 ? merged.metrics.total_monthly_payment : (client.metrics?.total_monthly_payment || 0),
          refinance_opportunity: merged.metrics.refinance_opportunity,
          // Preserve activity signals from webhook events
          highly_engaged: client.metrics?.highly_engaged || false,
          cma_requested: client.metrics?.cma_requested || false,
          just_listed: client.metrics?.just_listed || false,
          likely_to_sell_score: merged.metrics.likely_to_sell_score || client.metrics?.likely_to_sell_score || 0,
          activity_score: client.metrics?.activity_score || 0,
          updated_at: new Date().toISOString(),
        };

        // High equity flag
        if (enrichedMetrics.equity_percent >= 50) enrichedMetrics.high_equity = true;

        const enrichedRecord = {
          ...client,
          property_address: merged.property_address || client.property_address || "",
          zip: merged.zip || client.zip || "",
          homebot_home_id: merged.homebot_home_id || client.homebot_home_id,
          homebot_loan_id: merged.homebot_loan_id || client.homebot_loan_id,
          close_date: client.close_date || merged.close_date || null,
          bedrooms: merged.bedrooms || client.bedrooms || 0,
          bathrooms: merged.bathrooms || client.bathrooms || 0,
          finished_sqft: merged.finished_sqft || client.finished_sqft || 0,
          year_built: merged.year_built || client.year_built || 0,
          metrics: enrichedMetrics,
          triggers: [...new Set([...(client.triggers || []), ...(merged.triggers || [])])],
          opportunity_score: Math.max(merged.opportunity_score || 0, client.opportunity_score || 0),
          enriched_at: new Date().toISOString(),
        };

        await clientStore.setJSON(storeKey, enrichedRecord);
        enriched++;

        // Small delay to avoid Homebot rate limiting
        await new Promise(r => setTimeout(r, 150));

      } catch (err) {
        console.error(`Error enriching ${storeKey}:`, err.message);
        skipped++;
      }
    }

    const done = remaining === 0;

    console.log(`Batch ${offset}-${offset + batchSize}: enriched=${enriched}, skipped=${skipped}, remaining=${remaining}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enriched,
        skipped,
        remaining,
        total: allKeys.length,
        next_offset: offset + batchSize,
        done,
        message: done
          ? `Enrichment complete — processed all ${allKeys.length} clients`
          : `Batch complete — ${remaining} clients remaining. Call again with offset: ${offset + batchSize}`,
      }),
    };
  } catch (err) {
    console.error("Enrich error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function resolveApiToken(partnerId) {
  if (!partnerId) return process.env.HOMEBOT_API_TOKEN;
  try {
    return JSON.parse(process.env.PARTNER_TOKENS || "{}")[partnerId] || process.env.HOMEBOT_API_TOKEN;
  } catch {
    return process.env.HOMEBOT_API_TOKEN;
  }
}
