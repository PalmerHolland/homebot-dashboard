// netlify/functions/lib/homebot-api.js
// Shared Homebot API client used by all Netlify functions.
// Handles auth, requests, response normalization, and equity calculation.
//
// Required env vars:
//   HOMEBOT_API_TOKEN        — your personal Homebot API token
//   HOMEBOT_API_BASE_URL     — defaults to https://api.homebotapp.com

const BASE_URL = process.env.HOMEBOT_API_BASE_URL || "https://api.homebotapp.com";

// ─── CORE REQUEST ─────────────────────────────────────────────────────────────

async function homebotRequest(path, options = {}, apiToken = null) {
  const token = apiToken || process.env.HOMEBOT_API_TOKEN;
  if (!token) throw new Error("Missing Homebot API token");

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `open-api-token-v1 ${token}`,
      "Content-Type": "application/vnd.api+json",
      "Accept": "application/vnd.api+json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Homebot API error ${res.status}: ${errorText}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── CLIENT ENDPOINTS ─────────────────────────────────────────────────────────

async function getClientById(clientId, apiToken = null) {
  const data = await homebotRequest(`/clients/${clientId}`, {}, apiToken);
  return normalizeClient(data?.data);
}

async function getClientByEmail(email, apiToken = null) {
  const encoded = encodeURIComponent(email);
  const data = await homebotRequest(`/clients?filter[email]=${encoded}`, {}, apiToken);
  const clients = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return clients.map(normalizeClient);
}

async function getClientsBySource(source = "homebot-lo-dashboard", apiToken = null) {
  const encoded = encodeURIComponent(source);
  const data = await homebotRequest(`/clients?filter[external-entity-source]=${encoded}`, {}, apiToken);
  const clients = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return clients.map(normalizeClient);
}

async function getClientsByExternalId(externalId, apiToken = null) {
  const encoded = encodeURIComponent(externalId);
  const data = await homebotRequest(`/clients?filter[external-entity-id]=${encoded}`, {}, apiToken);
  const clients = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return clients.map(normalizeClient);
}

// ─── HOME ENDPOINTS ───────────────────────────────────────────────────────────

async function getClientHomes(clientId, apiToken = null) {
  const data = await homebotRequest(`/clients/${clientId}/homes`, {}, apiToken);
  const homes = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return homes.map(normalizeHome);
}

async function getHomeLoans(homeId, apiToken = null) {
  const data = await homebotRequest(`/homes/${homeId}/loans`, {}, apiToken);
  const loans = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return loans.map(normalizeLoan);
}

// ─── PARTNER ENDPOINTS ────────────────────────────────────────────────────────

async function getRealEstateAgent(agentId, apiToken = null) {
  const data = await homebotRequest(`/real-estate-agents/${agentId}`, {}, apiToken);
  return normalizeAgent(data?.data);
}

async function getRealEstateAgentByExternalId(externalId, apiToken = null) {
  const data = await homebotRequest(`/real-estate-agents/external/${externalId}`, {}, apiToken);
  return normalizeAgent(data?.data);
}

// ─── LO PROFILE ───────────────────────────────────────────────────────────────

async function getLOProfile(loId, apiToken = null) {
  const data = await homebotRequest(`/loan-officers/${loId}`, {}, apiToken);
  return normalizeLOProfile(data?.data);
}

async function getCustomerProfile(externalId, apiToken = null) {
  const data = await homebotRequest(`/customer-profiles/external/${externalId}`, {}, apiToken);
  return normalizeLOProfile(data?.data);
}

// ─── WEBHOOK CLIENT ───────────────────────────────────────────────────────────

async function createWebhookClient(netlifyUrl, apiToken = null) {
  const data = await homebotRequest("/webhook-clients", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "webhook-client",
        attributes: {
          name: "homebot-lo-dashboard",
          url: netlifyUrl,
          "event-sources-whitelist": "home-digest,system,email,buyer-digest,calculators,listing-details,listings-search,listing-details",
        },
      },
    }),
  }, apiToken);
  return data?.data;
}

async function getWebhookEvents(webhookClientId, apiToken = null) {
  const data = await homebotRequest(`/webhook-clients/${webhookClientId}/webhook-events`, {}, apiToken);
  const events = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  return events;
}

// ─── FULL CLIENT ENRICHMENT ───────────────────────────────────────────────────
// Fetches client + home + loan data and merges into a single dashboard record.

async function enrichClient(clientId, apiToken = null) {
  const client = await getClientById(clientId, apiToken);
  if (!client) return null;

  let home = null;
  let loan = null;

  try {
    const homes = await getClientHomes(clientId, apiToken);
    if (homes.length > 0) {
      home = homes[0]; // primary home
      const loans = await getHomeLoans(home.homebot_home_id, apiToken);
      if (loans.length > 0) {
        // Use first-lien loan (most relevant for refi)
        loan = loans.find(l => l.lien_position === "first") || loans[0];
      }
    }
  } catch (err) {
    console.warn(`Could not enrich home/loan for client ${clientId}:`, err.message);
  }

  return mergeClientData(client, home, loan);
}

// ─── NORMALIZERS ──────────────────────────────────────────────────────────────

function normalizeClient(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  return {
    homebot_client_id: raw.id,
    name: `${a["first-name"] || ""} ${a["last-name"] || ""}`.trim(),
    first_name: a["first-name"] || "",
    last_name: a["last-name"] || "",
    email: (a["email"] || "").toLowerCase().trim(),
    phone: a["mobile"] || "",
    buyers_access: a["buyers-access"] || null,
    close_date: a["close-date"] || null,
    lead_source: a["lead-source"] || null,
    locale: a["locale"] || "en",
    likely_to_sell_score: parseFloat(a["likelihood-to-sell-score"]) || 0,
    created_at: a["created-at"] || new Date().toISOString(),
    updated_at: a["updated-at"] || new Date().toISOString(),
    external_mappings: a["external-mappings"] || [],
  };
}

function normalizeHome(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  return {
    homebot_home_id: raw.id,
    property_address: a["address-street"] || "",
    address_unit: a["address-unit"] || "",
    zip: a["address-zip"] || "",
    appraised_value: parseFloat(a["appraised-value"]) || 0,
    appraised_date: a["appraised-date"] || null,
    bedrooms: parseInt(a["bedrooms"]) || 0,
    bathrooms: parseFloat(a["bathrooms"]) || 0,
    finished_sqft: parseInt(a["finished-sqft"]) || 0,
    year_built: parseInt(a["year-built"]) || 0,
    occupancy_status: a["occupancy-status"] || null,
    sold_date: a["sold-date"] || null,
    sold_price: parseFloat(a["sold-price"]) || 0,
    expenses_total: parseFloat(a["expenses-total"]) || 0,
    hoa_dues: parseFloat(a["hoa-dues"]) || 0,
    hazard_insurance_monthly: parseFloat(a["hazard-insurance-monthly"]) || 0,
    flood_insurance_monthly: parseFloat(a["flood-insurance-monthly"]) || 0,
    lot_size_sqft: parseInt(a["lot-size-sqft"]) || 0,
    total_rooms: parseInt(a["total-rooms"]) || 0,
  };
}

function normalizeLoan(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  return {
    homebot_loan_id: raw.id,
    amount: parseFloat(a["amount"]) || 0,
    rate: parseFloat(a["rate"]) || 0,
    apr: parseFloat(a["apr"]) || 0,
    term_years: parseInt(a["term-years"]) || 30,
    loan_type: a["loan-type"] || "",
    loan_program: a["loan-program"] || "",
    finance_type: a["finance-type"] || "",
    adjustable: a["adjustable"] === true || a["adjustable"] === "true",
    refi: a["refi"] === true || a["refi"] === "true",
    refi_purpose: a["refi-purpose"] || null,
    lien_position: a["lien-position"] || "first",
    pmi_monthly: parseFloat(a["pmi-monthly"]) || 0,
    fha_mi_monthly: parseFloat(a["fha-mi-monthly"]) || 0,
    escrow_monthly: parseFloat(a["escrow-monthly"]) || 0,
    total_monthly_payment: parseFloat(a["total-monthly-payment"]) || 0,
    first_payment_due_date: a["first-payment-due-date"] || null,
    date: a["date"] || null,
    company_loan_id: a["company-loan-id"] || null,
    lo_nmls: a["lo-nmls"] || null,
    arm_years_initial: parseInt(a["arm-years-initial"]) || 0,
    arm_rate_cap: parseFloat(a["arm-rate-cap"]) || 0,
  };
}

function normalizeAgent(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  return {
    homebot_agent_id: raw.id,
    name: `${a["first-name"] || ""} ${a["last-name"] || ""}`.trim(),
    first_name: a["first-name"] || "",
    last_name: a["last-name"] || "",
    email: (a["email"] || "").toLowerCase().trim(),
    phone: a["mobile-phone"] || "",
    photo_uri: a["photo-uri"] || null,
    share_uri: a["share-uri"] || null,
    buyer_share_uri: a["buyer-share-uri"] || null,
    clients_count: parseInt(a["clients-count"]) || 0,
    buyers_count: parseInt(a["buyers-count"]) || 0,
    homes_count: parseInt(a["homes-count"]) || 0,
    has_sponsor: a["has-sponsor"] === true || a["has-sponsor"] === "true",
    state_license: a["state-license"] || "",
    website_uri: a["website-uri"] || null,
    linkedin_uri: a["linkedin-uri"] || null,
    title: a["title"] || "Real Estate Agent",
    state: a["state"] || "",
  };
}

function normalizeLOProfile(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  return {
    homebot_lo_id: raw.id,
    name: `${a["first-name"] || ""} ${a["last-name"] || ""}`.trim(),
    first_name: a["first-name"] || "",
    last_name: a["last-name"] || "",
    email: (a["email"] || "").toLowerCase().trim(),
    phone: a["mobile-phone"] || "",
    photo_uri: a["photo-uri"] || null,
    nmls: a["nmls"] || "",
    title: a["title"] || "Loan Officer",
    state_license: a["state-license"] || "",
    website_uri: a["website-uri"] || null,
    linkedin_uri: a["linkedin-uri"] || null,
    share_uri: a["share-uri"] || null,
    buyer_share_uri: a["buyer-share-uri"] || null,
    clients_count: parseInt(a["clients-count"]) || 0,
    buyers_count: parseInt(a["buyers-count"]) || 0,
    homes_count: parseInt(a["homes-count"]) || 0,
    partner_count: parseInt(a["partner-count"]) || 0,
  };
}

// ─── MERGE CLIENT + HOME + LOAN ───────────────────────────────────────────────

function mergeClientData(client, home, loan) {
  // Estimate outstanding loan balance using simple amortization
  const estimatedBalance = loan ? estimateOutstandingBalance(loan) : 0;
  const appraisedValue = home?.appraised_value || 0;
  const equityAmount = appraisedValue - estimatedBalance;
  const equityPercent = appraisedValue > 0
    ? Math.round((equityAmount / appraisedValue) * 100)
    : 0;

  // Refi opportunity flags
  const CURRENT_MARKET_RATE = parseFloat(process.env.CURRENT_MARKET_RATE || "6.75");
  const refiOpportunity = loan ? (
    (loan.rate > CURRENT_MARKET_RATE + 0.5) ||
    loan.adjustable ||
    (loan.pmi_monthly > 0 && equityPercent >= 20)
  ) : false;

  // Derive triggers from data
  const triggers = deriveTriggers(client, loan, equityPercent, refiOpportunity);

  // Compute opportunity score
  const opportunityScore = computeOpportunityScore(
    client.likely_to_sell_score,
    0, // activity score — updated by webhook events
    refiOpportunity,
    equityPercent,
    triggers
  );

  return {
    // Identity
    id: `hb_${client.homebot_client_id}`,
    homebot_client_id: client.homebot_client_id,
    external_client_id: client.homebot_client_id,
    name: client.name,
    first_name: client.first_name,
    last_name: client.last_name,
    email: client.email,
    phone: client.phone,
    lead_source: client.lead_source,
    buyers_access: client.buyers_access,
    created_at: client.created_at,
    updated_at: new Date().toISOString(),

    // Property
    property_address: home?.property_address || "",
    address_unit: home?.address_unit || "",
    zip: home?.zip || "",
    city: "", // not in Homebot — can be derived from zip later
    state: "",
    homebot_home_id: home?.homebot_home_id || null,
    bedrooms: home?.bedrooms || 0,
    bathrooms: home?.bathrooms || 0,
    finished_sqft: home?.finished_sqft || 0,
    year_built: home?.year_built || 0,
    occupancy_status: home?.occupancy_status || null,
    sold_price: home?.sold_price || 0,
    sold_date: home?.sold_date || null,

    // Financials
    homebot_loan_id: loan?.homebot_loan_id || null,
    metrics: {
      estimated_value: appraisedValue,
      equity_amount: Math.max(equityAmount, 0),
      equity_percent: Math.max(equityPercent, 0),
      estimated_balance: estimatedBalance,
      current_rate: loan?.rate || 0,
      apr: loan?.apr || 0,
      loan_amount: loan?.amount || 0,
      loan_type: loan?.loan_type || "",
      loan_program: loan?.loan_program || "",
      finance_type: loan?.finance_type || "",
      term_years: loan?.term_years || 30,
      adjustable: loan?.adjustable || false,
      pmi_monthly: loan?.pmi_monthly || 0,
      total_monthly_payment: loan?.total_monthly_payment || 0,
      likely_to_sell_score: client.likely_to_sell_score,
      likely_to_buy_score: 0, // updated by webhook events
      activity_score: 0,      // updated by webhook events
      refinance_opportunity: refiOpportunity,
      highly_engaged: false,  // updated by webhook events
      just_listed: false,
      cma_requested: false,
      updated_at: new Date().toISOString(),
    },

    // Signals
    triggers,
    opportunity_score: opportunityScore,
    last_activity: new Date().toISOString(),
    last_contacted: null,
    events: [],
    notes: [],
    external_mappings: client.external_mappings,
  };
}

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────

function estimateOutstandingBalance(loan) {
  if (!loan || !loan.amount || !loan.rate || !loan.term_years) return 0;
  const loanDate = loan.first_payment_due_date || loan.date;
  if (!loanDate) return loan.amount * 0.85; // conservative estimate

  const monthlyRate = loan.rate / 100 / 12;
  const totalPayments = loan.term_years * 12;
  const monthsElapsed = Math.floor(
    (Date.now() - new Date(loanDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );
  const remainingPayments = Math.max(totalPayments - monthsElapsed, 0);

  if (monthlyRate === 0) return (loan.amount / totalPayments) * remainingPayments;

  const monthlyPayment = loan.amount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments))
    / (Math.pow(1 + monthlyRate, totalPayments) - 1);

  return monthlyPayment * (1 - Math.pow(1 + monthlyRate, -remainingPayments)) / monthlyRate;
}

function deriveTriggers(client, loan, equityPercent, refiOpportunity) {
  const triggers = [];
  if (client.likely_to_sell_score >= 70) triggers.push("likely_to_sell");
  if (equityPercent >= 50) triggers.push("high_equity");
  if (refiOpportunity) triggers.push("refinance_viewed");
  if (loan?.adjustable) triggers.push("repeated_property_views");
  return triggers;
}

function computeOpportunityScore(sellScore, activityScore, refiOpp, equityPct, triggers) {
  const refiScore = refiOpp ? 85 : 20;
  const triggerCount = triggers.length;
  const triggerRecency = triggerCount > 0 ? Math.min(triggerCount * 15, 100) : 0;
  const triggerSeverity = triggerCount > 1 ? 80 : 30;

  return Math.min(Math.round(
    sellScore * 0.35 +
    activityScore * 0.20 +
    refiScore * 0.15 +
    equityPct * 0.15 +
    triggerRecency * 0.10 +
    triggerSeverity * 0.05
  ), 99);
}

// ─── HIGH VALUE EVENT MAP ─────────────────────────────────────────────────────
// Maps Homebot event action names to dashboard trigger types and score boosts.

const HIGH_VALUE_EVENTS = {
  "likely-to-sell":               { trigger: "likely_to_sell",    score_boost: 30, urgency: "call_today",  activity_points: 40 },
  "highly-likely-to-sell":        { trigger: "likely_to_sell",    score_boost: 45, urgency: "call_today",  activity_points: 50 },
  "cma-request":                  { trigger: "cma_requested",     score_boost: 35, urgency: "call_today",  activity_points: 45 },
  "cma-completed":                { trigger: "cma_requested",     score_boost: 20, urgency: "call_week",   activity_points: 30 },
  "viewed-refi-details":          { trigger: "refinance_viewed",  score_boost: 25, urgency: "call_today",  activity_points: 35 },
  "refi-slider-interaction":      { trigger: "refinance_viewed",  score_boost: 20, urgency: "call_week",   activity_points: 25 },
  "used-cashout-calculator":      { trigger: "high_equity",       score_boost: 20, urgency: "call_week",   activity_points: 30 },
  "viewed-cashout-details":       { trigger: "high_equity",       score_boost: 15, urgency: "nurture",     activity_points: 20 },
  "viewed-cashout-debt-details":  { trigger: "high_equity",       score_boost: 15, urgency: "nurture",     activity_points: 20 },
  "prequal-request":              { trigger: "likely_to_buy",     score_boost: 45, urgency: "call_today",  activity_points: 50 },
  "listings-prequal-request":     { trigger: "likely_to_buy",     score_boost: 45, urgency: "call_today",  activity_points: 50 },
  "listing-favorited-event":      { trigger: "likely_to_buy",     score_boost: 20, urgency: "call_week",   activity_points: 25 },
  "saved-search-created-event":   { trigger: "likely_to_buy",     score_boost: 15, urgency: "nurture",     activity_points: 20 },
  "listings-request-visit":       { trigger: "likely_to_buy",     score_boost: 35, urgency: "call_today",  activity_points: 40 },
  "schedule-a-call-cta-click":    { trigger: "highly_engaged",    score_boost: 40, urgency: "call_today",  activity_points: 45 },
  "loan-application-cta-click":   { trigger: "highly_engaged",    score_boost: 45, urgency: "call_today",  activity_points: 50 },
  "homeowner-direct-message":     { trigger: "highly_engaged",    score_boost: 40, urgency: "call_today",  activity_points: 45 },
  "buyer-direct-message":         { trigger: "highly_engaged",    score_boost: 40, urgency: "call_today",  activity_points: 45 },
  "viewed-should-you-sell":       { trigger: "likely_to_sell",    score_boost: 25, urgency: "call_week",   activity_points: 30 },
  "viewed-purchasing-sell-and-pocket": { trigger: "likely_to_sell", score_boost: 20, urgency: "call_week", activity_points: 25 },
  "instant-offer-requested":      { trigger: "likely_to_sell",    score_boost: 40, urgency: "call_today",  activity_points: 45 },
  "mortgage-coach-tca-requested": { trigger: "refinance_viewed",  score_boost: 30, urgency: "call_today",  activity_points: 35 },
  "used-affordability-calculator":{ trigger: "likely_to_buy",     score_boost: 15, urgency: "nurture",     activity_points: 20 },
  "buyer-viewed-report":          { trigger: "highly_engaged",    score_boost: 10, urgency: "nurture",     activity_points: 15 },
  "view":                         { trigger: "highly_engaged",    score_boost: 5,  urgency: "monitor",     activity_points: 10 },
  "homeowner-digest-email-open":  { trigger: "highly_engaged",    score_boost: 5,  urgency: "monitor",     activity_points: 8  },
  "homeowner-digest-email-click": { trigger: "highly_engaged",    score_boost: 8,  urgency: "nurture",     activity_points: 12 },
  "client-add-home":              { trigger: "highly_engaged",    score_boost: 15, urgency: "nurture",     activity_points: 20 },
  "client-registered-as-buyer":   { trigger: "likely_to_buy",     score_boost: 20, urgency: "call_week",   activity_points: 25 },
  "avm-up":                       { trigger: "high_equity",       score_boost: 10, urgency: "nurture",     activity_points: 10 },
  "buyer-shifted-to-monthly-digests": { trigger: "likely_to_buy", score_boost: 10, urgency: "nurture",     activity_points: 15 },
};

module.exports = {
  homebotRequest,
  getClientById,
  getClientByEmail,
  getClientsBySource,
  getClientsByExternalId,
  getClientHomes,
  getHomeLoans,
  getRealEstateAgent,
  getRealEstateAgentByExternalId,
  getLOProfile,
  getCustomerProfile,
  createWebhookClient,
  getWebhookEvents,
  enrichClient,
  normalizeClient,
  normalizeHome,
  normalizeLoan,
  normalizeAgent,
  normalizeLOProfile,
  mergeClientData,
  computeOpportunityScore,
  estimateOutstandingBalance,
  deriveTriggers,
  HIGH_VALUE_EVENTS,
};
