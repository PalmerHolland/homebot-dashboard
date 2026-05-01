import { useState, useEffect, useRef, useMemo } from "react";

// ─── MOCK DATA SEED ───────────────────────────────────────────────────────────
const PARTNERS = [
  { id: "p1", name: "Sarah Chen", type: "Realtor", email: "sarah@chenrealty.com", brokerage: "Compass" },
  { id: "p2", name: "Marcus Williams", type: "Realtor", email: "marcus@mwrealty.com", brokerage: "Keller Williams" },
  { id: "p3", name: "Priya Patel", type: "Realtor", email: "priya@patelhomes.com", brokerage: "RE/MAX" },
  { id: "p4", name: "Tom Nguyen", type: "Realtor", email: "tom@nguyengroup.com", brokerage: "Coldwell Banker" },
  { id: "p5", name: "Lisa Monroe", type: "Realtor", email: "lisa@monroeluxury.com", brokerage: "Sotheby's" },
];

const TRIGGER_TYPES = {
  cma_requested: { label: "CMA Requested", color: "#f59e0b", icon: "📋" },
  refinance_viewed: { label: "Refi Viewed", color: "#3b82f6", icon: "📉" },
  high_equity: { label: "High Equity", color: "#10b981", icon: "💰" },
  highly_engaged: { label: "Highly Engaged", color: "#8b5cf6", icon: "🔥" },
  likely_to_sell: { label: "Likely to Sell", color: "#f97316", icon: "🏠" },
  likely_to_buy: { label: "Likely to Buy", color: "#06b6d4", icon: "🔑" },
  just_listed: { label: "Just Listed", color: "#ec4899", icon: "📍" },
  equity_increase: { label: "Equity Increase", color: "#84cc16", icon: "📈" },
  repeated_property_views: { label: "Repeat Views", color: "#a78bfa", icon: "👁" },
};

function generateClients() {
  const firstNames = ["Jennifer","Michael","Amanda","David","Stephanie","Robert","Ashley","James","Jessica","Christopher","Megan","Daniel","Lauren","Kevin","Rachel","Brian","Melissa","Jason","Sarah","Matthew","Nicole","Ryan","Emily","Andrew","Brittany","Joshua","Heather","Justin","Amber","Eric"];
  const lastNames = ["Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Moore","Young","Allen","King","Wright","Scott","Hill","Green","Adams","Baker","Nelson","Carter","Mitchell","Roberts"];
  const streets = ["Oak Lane","Maple Ave","Sunset Blvd","Cedar Dr","Pine St","Elm Court","Willow Way","Birch Rd","Hickory Ln","Magnolia Dr"];
  const cities = [["Austin","TX"],["Denver","CO"],["Phoenix","AZ"],["Nashville","TN"],["Charlotte","NC"],["Tampa","FL"],["Portland","OR"],["Raleigh","NC"],["Las Vegas","NV"],["Atlanta","GA"]];
  const clients = [];
  for (let i = 0; i < 42; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const city = cities[i % cities.length];
    const partnerId = PARTNERS[i % PARTNERS.length].id;
    const equity_pct = Math.floor(Math.random() * 60) + 15;
    const est_value = Math.floor(Math.random() * 600000) + 250000;
    const equity_amt = Math.floor(est_value * equity_pct / 100);
    const current_rate = (Math.random() * 2.5 + 5.5).toFixed(2);
    const sell_score = Math.floor(Math.random() * 95) + 5;
    const buy_score = Math.floor(Math.random() * 90) + 5;
    const activity_score = Math.floor(Math.random() * 100) + 1;
    const refi_opp = parseFloat(current_rate) > 6.5;
    const triggers = [];
    if (sell_score > 70) triggers.push("likely_to_sell");
    if (buy_score > 70) triggers.push("likely_to_buy");
    if (equity_pct > 50) triggers.push("high_equity");
    if (activity_score > 80) triggers.push("highly_engaged");
    if (refi_opp) triggers.push("refinance_viewed");
    if (Math.random() > 0.75) triggers.push("cma_requested");
    if (Math.random() > 0.85) triggers.push("just_listed");
    if (Math.random() > 0.8) triggers.push("equity_increase");
    if (Math.random() > 0.8) triggers.push("repeated_property_views");
    const opp_score = Math.round(
      sell_score * 0.35 + activity_score * 0.20 + (refi_opp ? 85 : 20) * 0.15 +
      equity_pct * 0.15 + (triggers.length > 0 ? Math.min(triggers.length * 15, 100) : 0) * 0.10 +
      (triggers.length > 1 ? 80 : 30) * 0.05
    );
    const daysAgo = Math.floor(Math.random() * 30);
    const contactedDays = Math.floor(Math.random() * 60);
    clients.push({
      id: `c${i + 1}`,
      external_client_id: `hb_${Math.random().toString(36).substr(2, 9)}`,
      partner_id: partnerId,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@email.com`,
      phone: `(${Math.floor(Math.random()*900)+100}) ${Math.floor(Math.random()*900)+100}-${Math.floor(Math.random()*9000)+1000}`,
      property_address: `${Math.floor(Math.random()*9000)+1000} ${streets[i % streets.length]}`,
      city: city[0], state: city[1], zip: `${Math.floor(Math.random()*90000)+10000}`,
      created_at: new Date(Date.now() - Math.random() * 365 * 24 * 3600000).toISOString(),
      metrics: {
        likely_to_sell_score: sell_score, likely_to_buy_score: buy_score,
        activity_score, equity_percent: equity_pct, equity_amount: equity_amt,
        estimated_value: est_value, current_rate: parseFloat(current_rate),
        refinance_opportunity: refi_opp, highly_engaged: activity_score > 80,
        just_listed: triggers.includes("just_listed"), cma_requested: triggers.includes("cma_requested"),
        updated_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      },
      triggers,
      opportunity_score: Math.min(opp_score, 99),
      last_activity: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      last_contacted: contactedDays === 0 ? null : new Date(Date.now() - contactedDays * 86400000).toISOString(),
      events: generateEvents(i),
      notes: [],
    });
  }
  return clients.sort((a, b) => b.opportunity_score - a.opportunity_score);
}

function generateEvents(seed) {
  const types = ["viewed_report","opened_email","cma_requested","refinance_viewed","property_viewed","equity_update"];
  const events = [];
  const count = Math.floor(Math.random() * 6) + 2;
  for (let i = 0; i < count; i++) {
    events.push({
      id: `e${seed}_${i}`,
      event_type: types[Math.floor(Math.random() * types.length)],
      occurred_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
      event_score: Math.floor(Math.random() * 40) + 10,
    });
  }
  return events.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}

const ALL_CLIENTS = generateClients();

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = {
  currency: (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`,
  pct: (n) => `${n}%`,
  rate: (n) => `${n.toFixed(2)}%`,
  score: (n) => Math.round(n),
  date: (d) => { if (!d) return "—"; const diff = Math.floor((Date.now() - new Date(d)) / 86400000); if (diff === 0) return "Today"; if (diff === 1) return "Yesterday"; if (diff < 7) return `${diff}d ago`; if (diff < 30) return `${Math.floor(diff/7)}w ago`; return `${Math.floor(diff/30)}mo ago`; },
  fullDate: (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
};

function urgency(score) {
  if (score >= 85) return { label: "Call Today", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (score >= 70) return { label: "Call This Week", color: "#f97316", bg: "rgba(249,115,22,0.12)" };
  if (score >= 50) return { label: "Nurture", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  return { label: "Monitor", color: "#6b7280", bg: "rgba(107,114,128,0.12)" };
}

// Years owned calculation
function yearsOwned(closeDate) {
  if (!closeDate) return null;
  const diff = (Date.now() - new Date(closeDate)) / (1000 * 60 * 60 * 24 * 365.25);
  return diff > 0 ? Math.floor(diff) : null;
}

// Strong refi opportunity: rate > market + 0.75% AND equity > 20%
function isStrongRefi(client) {
  const rate = parseFloat(client.metrics?.current_rate || 0);
  const equity = parseFloat(client.metrics?.equity_percent || 0);
  const marketRate = parseFloat(typeof window !== 'undefined' ? (localStorage.getItem('hb_market_rate') || '6.75') : '6.75');
  return rate > 0 && rate > (marketRate + 0.75) && equity >= 20;
}

function nextAction(client) {
  const triggers = client.triggers || [];
  const metrics = client.metrics || {};
  if (triggers.includes("cma_requested") || metrics.cma_requested) return "Call Today — CMA Interest";
  if (isStrongRefi(client)) return "Call Today — Refi Opportunity";
  if ((triggers.includes("likely_to_sell") || triggers.includes("highly_likely_to_sell")) && (metrics.likely_to_sell_score||0) > 75) return "Call Today — Seller Signal";
  if ((metrics.equity_percent||0) >= 50 && (triggers.includes("high_equity") || metrics.equity_amount > 0)) return "Call Today — High Equity";
  if (metrics.refinance_opportunity) return "Refinance Review";
  if (triggers.includes("likely_to_buy")) return "Buyer Consultation";
  if (triggers.includes("just_listed")) return "Listing Opportunity";
  if ((metrics.likely_to_sell_score||0) >= 70) return "Seller Conversation";
  return "General Nurture";
}

function suggestedScript(client) {
  const yrs = yearsOwned(client.close_date);
  const firstName = client.first_name || client.name?.split(' ')[0] || 'there';
  const rateStr = parseFloat(client.metrics?.current_rate||0) > 0 ? parseFloat(client.metrics.current_rate).toFixed(2) + '%' : null;
  const equityDollar = client.metrics?.equity_amount > 0 ? `$${Math.round(client.metrics.equity_amount/1000)}K` : null;
  const equityPct = client.metrics?.equity_percent > 0 ? Math.round(client.metrics.equity_percent) + '%' : null;
  const yrStr = yrs ? ` — you have owned your home for ${yrs} year${yrs !== 1 ? 's' : ''} now` : '';
  const action = nextAction(client);

  const scripts = {
    "CMA Follow-up": `Hi ${firstName}, this is Palmer Holland${yrStr}. I noticed you recently requested a market analysis through Homebot and wanted to reach out personally. I would love to walk you through what I'm seeing in your market — values are moving fast and your equity position looks strong. When is a good time to connect?`,
    "Seller Conversation": `Hi ${firstName}, this is Palmer Holland${yrStr ? yrStr + ' and' : ' —'} I have been watching your Homebot signals and wanted to reach out. Based on current market trends${equityDollar ? ' and your ' + equityDollar + ' equity position' : ''}, it might be worth a conversation about your options. Are you thinking about a move in the next year?`,
    "Refinance Review": `Hi ${firstName}, this is Palmer Holland. I was reviewing your profile and noticed you're ${rateStr ? 'currently at ' + rateStr : 'at a rate'} — with ${equityPct ? equityPct + ' equity' : 'the equity you have built up'}${yrStr}, there may be a real opportunity to restructure and improve your financial position. Do you have 10-15 minutes this week to run through some numbers?`,
    "Equity Review": `Hi ${firstName}, Palmer Holland here${yrStr}. Your home equity has been building nicely — you are sitting at ${equityPct || 'a strong position'} right now${equityDollar ? ' (' + equityDollar + ')' : ''}. There are some smart ways to leverage that, whether it is a move-up, cash-out, or just good to know. Worth a quick conversation?`,
    "Buyer Consultation": `Hi ${firstName}, this is Palmer Holland. I see you have been exploring some properties — the market is competitive right now and I would love to help you get pre-positioned so you can move fast when the right home comes along. Do you have 15 minutes to chat this week?`,
    "Listing Opportunity": `Hi ${firstName}, Palmer Holland here. I wanted to reach out about some exciting activity in your neighborhood. There are buyers actively looking right now and${equityDollar ? ' with ' + equityDollar + ' in equity' : ''} your timing could be really strong. Would you be open to a quick conversation?`,
    "General Nurture": `Hi ${firstName}, this is Palmer Holland — just checking in${yrStr ? yrStr + ',' : ''} and wanted to see how things are going with the home. Markets have been interesting lately. Let me know if you ever want a quick update on your property's value or just want to talk through your options.`,
  };
  return scripts[action] || scripts["General Nurture"];
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  :root {
    --bg: #13161f;
    --surface: #1a1e2a;
    --surface2: #222736;
    --surface3: #2a3045;
    --border: rgba(255,255,255,0.09);
    --border2: rgba(255,255,255,0.16);
    --text: #eef0f6;
    --text2: #9da3b4;
    --text3: #666d82;
    --accent: #4f8ef7;
    --accent2: #6366f1;
    --green: #10b981;
    --orange: #f97316;
    --red: #ef4444;
    --yellow: #f59e0b;
    --purple: #8b5cf6;
    --pink: #ec4899;
    --cyan: #06b6d4;
  }
  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 14px; overflow: hidden; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  .layout { display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar { width: 220px; min-width: 220px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 0; position: relative; z-index: 10; }
  .sidebar-logo { padding: 20px 20px 16px; border-bottom: 1px solid var(--border); }
  .sidebar-logo .logo-mark { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px; letter-spacing: -0.3px; color: var(--text); }
  .sidebar-logo .logo-sub { font-size: 10px; color: var(--text3); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px; }
  .sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
  .nav-section { margin-bottom: 4px; }
  .nav-label { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text3); padding: 8px 10px 4px; font-weight: 600; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; cursor: pointer; transition: all 0.15s; color: var(--text2); font-size: 13.5px; font-weight: 400; user-select: none; }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: rgba(79,142,247,0.12); color: var(--accent); font-weight: 500; }
  .nav-item .nav-icon { font-size: 15px; width: 20px; text-align: center; }
  .nav-item .nav-badge { margin-left: auto; background: var(--red); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 20px; }
  .sidebar-footer { padding: 12px; border-top: 1px solid var(--border); }
  .user-card { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .user-card:hover { background: var(--surface2); }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 12px; color: #fff; flex-shrink: 0; }
  .user-info .user-name { font-size: 13px; font-weight: 500; color: var(--text); }
  .user-info .user-role { font-size: 11px; color: var(--text3); }

  /* MAIN */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
  .topbar-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: var(--text); }
  .topbar-subtitle { font-size: 12px; color: var(--text3); margin-left: 4px; }
  .topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; font-family: 'DM Sans', sans-serif; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #3d7ef5; }
  .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
  .btn-ghost:hover { background: var(--surface2); color: var(--text); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

  /* CONTENT */
  .content { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

  /* SUMMARY CARDS */
  .summary-pills { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
  .pill { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: all 0.15s; user-select: none; }
  .pill:hover { border-color: var(--border2); background: var(--surface2); }
  .pill.active { border-color: var(--accent); background: rgba(79,142,247,0.1); }
  .pill-label { font-size: 12px; color: var(--text2); white-space: nowrap; }
  .pill-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: var(--text); }
  .pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  /* WIDGETS ROW */
  .widgets-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex-shrink: 0; }
  .widget { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .widget-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .widget-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px; color: var(--text); letter-spacing: -0.2px; }
  .widget-list { display: flex; flex-direction: column; gap: 8px; }
  .widget-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface2); border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .widget-row:hover { background: var(--surface3); }
  .widget-rank { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 11px; color: var(--text3); width: 16px; text-align: center; flex-shrink: 0; }
  .widget-name { flex: 1; font-size: 13px; color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .widget-meta { font-size: 11px; color: var(--text2); flex-shrink: 0; }
  .score-bar { height: 4px; border-radius: 2px; background: var(--surface3); overflow: hidden; }
  .score-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* FILTERS */
  .filters-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
  .search-box { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; flex: 1; min-width: 200px; max-width: 280px; }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; font-family: 'DM Sans', sans-serif; width: 100%; }
  .search-box input::placeholder { color: var(--text3); }
  .filter-select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--text2); font-size: 12.5px; font-family: 'DM Sans', sans-serif; cursor: pointer; outline: none; transition: all 0.15s; }
  .filter-select:hover, .filter-select:focus { border-color: var(--border2); color: var(--text); }
  .filter-count { font-size: 12px; color: var(--text3); margin-left: auto; white-space: nowrap; }

  /* TABLE */
  .table-container { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .table-header-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .selected-actions { display: flex; align-items: center; gap: 8px; }
  .table-scroll { overflow: auto; flex: 1; }
  table { width: 100%; border-collapse: collapse; min-width: 1100px; }
  thead th { background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--text3); letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; position: sticky; top: 0; z-index: 2; cursor: pointer; user-select: none; transition: color 0.15s; }
  thead th:hover { color: var(--text2); }
  thead th.sort-active { color: var(--accent); }
  tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; cursor: pointer; }
  tbody tr:hover { background: rgba(255,255,255,0.025); }
  tbody tr:last-child { border-bottom: none; }
  tbody tr.selected { background: rgba(79,142,247,0.07); }
  td { padding: 11px 12px; vertical-align: middle; }
  .td-name { font-weight: 500; color: var(--text); font-size: 13.5px; }
  .td-email { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .td-partner { font-size: 12.5px; color: var(--text2); }
  .score-num { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; }
  .score-high { color: #ef4444; }
  .score-med { color: #f97316; }
  .score-low { color: var(--text2); }

  /* BADGES */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .trigger-chips { display: flex; flex-wrap: wrap; gap: 4px; }

  /* OPPORTUNITY SCORE */
  .opp-score { display: flex; align-items: center; gap: 8px; }
  .opp-ring { width: 34px; height: 34px; flex-shrink: 0; }
  .opp-val { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; }
  .opp-label { font-size: 10px; color: var(--text3); margin-top: 1px; }

  .quick-look-btn { padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text3); font-size: 11.5px; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; }
  .quick-look-btn:hover { background: var(--surface2); color: var(--text); border-color: var(--border2); }

  /* QUICK LOOK PANEL */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; backdrop-filter: blur(4px); animation: fadeIn 0.15s; }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 480px; background: var(--surface); border-left: 1px solid var(--border); z-index: 101; overflow-y: auto; animation: slideIn 0.2s ease-out; }
  @keyframes slideIn { from{transform:translateX(40px);opacity:0} to{transform:translateX(0);opacity:1} }
  .drawer-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 2; }
  .drawer-close { position: absolute; top: 16px; right: 20px; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); background: transparent; color: var(--text2); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.15s; }
  .drawer-close:hover { background: var(--surface2); color: var(--text); }
  .drawer-name { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px; color: var(--text); margin-bottom: 4px; }
  .drawer-addr { font-size: 12.5px; color: var(--text2); }
  .drawer-section { padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .drawer-section-title { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text3); font-weight: 600; margin-bottom: 12px; }
  .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .metric-card { background: var(--surface2); border-radius: 8px; padding: 12px; }
  .metric-label { font-size: 10.5px; color: var(--text3); margin-bottom: 4px; }
  .metric-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; color: var(--text); }
  .metric-value.accent { color: var(--accent); }
  .metric-value.green { color: var(--green); }
  .metric-value.orange { color: var(--orange); }
  .metric-value.red { color: var(--red); }

  .action-box { background: rgba(79,142,247,0.08); border: 1px solid rgba(79,142,247,0.2); border-radius: 10px; padding: 14px 16px; margin-bottom: 8px; }
  .action-title { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 6px; }
  .action-label { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; color: var(--text); }
  .urgency-box { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600; margin-top: 6px; }

  .script-box { background: var(--surface2); border-radius: 10px; padding: 14px; font-size: 13px; color: var(--text2); line-height: 1.6; border-left: 3px solid var(--accent); position: relative; }
  .script-copy-btn { position: absolute; top: 10px; right: 10px; background: var(--surface3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 10px; color: var(--text3); cursor: pointer; }
  .script-copy-btn:hover { color: var(--text); background: var(--surface2); }

  .timeline { display: flex; flex-direction: column; gap: 0; }
  .timeline-item { display: flex; gap: 12px; padding: 8px 0; position: relative; }
  .timeline-item::before { content: ''; position: absolute; left: 5px; top: 20px; bottom: -8px; width: 1px; background: var(--border); }
  .timeline-item:last-child::before { display: none; }
  .timeline-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent); background: var(--surface); flex-shrink: 0; margin-top: 3px; }
  .timeline-content { flex: 1; }
  .timeline-type { font-size: 12.5px; color: var(--text); font-weight: 500; }
  .timeline-date { font-size: 11px; color: var(--text3); margin-top: 1px; }

  .notes-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; resize: vertical; min-height: 70px; outline: none; transition: border-color 0.15s; }
  .notes-input:focus { border-color: var(--accent); }

  /* PARTNER VIEW */
  .partner-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .partner-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.15s; }
  .partner-card:hover { border-color: var(--border2); background: var(--surface2); }
  .partner-card.selected { border-color: var(--accent); background: rgba(79,142,247,0.05); }
  .partner-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 2px; }
  .partner-brokerage { font-size: 11.5px; color: var(--text3); margin-bottom: 12px; }
  .partner-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .partner-stat { background: var(--surface2); border-radius: 6px; padding: 8px 10px; }
  .partner-stat-label { font-size: 10px; color: var(--text3); margin-bottom: 2px; }
  .partner-stat-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; }

  /* ACTIVITY FEED */
  .activity-feed { display: flex; flex-direction: column; gap: 0; }
  .activity-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .activity-item:last-child { border-bottom: none; }
  .activity-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: var(--surface2); }
  .activity-text { flex: 1; }
  .activity-name { font-size: 13px; color: var(--text); font-weight: 500; }
  .activity-desc { font-size: 12px; color: var(--text2); margin-top: 2px; }
  .activity-time { font-size: 11px; color: var(--text3); flex-shrink: 0; }

  /* EMPTY STATE */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 12px; }
  .empty-icon { font-size: 40px; opacity: 0.3; }
  .empty-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: var(--text2); }
  .empty-desc { font-size: 13px; color: var(--text3); text-align: center; max-width: 300px; }

  /* RESPONSIVE */
  @media (max-width: 900px) {
    .sidebar { width: 56px; min-width: 56px; }
    .sidebar-logo .logo-sub, .nav-item span:not(.nav-icon), .user-info, .nav-badge { display: none; }
    .sidebar-logo .logo-mark { font-size: 12px; }
    .nav-item { justify-content: center; padding: 10px; }
    .user-card { justify-content: center; }
    .content { padding: 12px; }
    .widgets-row { grid-template-columns: 1fr; }
    .drawer { width: 100%; }
  }

  .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .checkbox { width: 15px; height: 15px; border-radius: 4px; border: 1.5px solid var(--border2); cursor: pointer; flex-shrink: 0; appearance: none; background: transparent; transition: all 0.15s; }
  .checkbox:checked { background: var(--accent); border-color: var(--accent); }
  .sort-indicator { margin-left: 4px; color: var(--accent); }

  code { font-family: monospace; }

  .settings-nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .settings-nav-item:hover { background: var(--surface2); }
  .settings-nav-item.active { background: rgba(79,142,247,0.1); color: var(--accent); border-left: 2px solid var(--accent); font-weight: 500; }

  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface2); border: 1px solid var(--border2); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--text); z-index: 200; animation: slideUp 0.2s; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
  @keyframes slideUp { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 34 }) {
  const u = urgency(score);
  const r = 13; const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34">
      <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
      <circle cx="17" cy="17" r={r} fill="none" stroke={u.color} strokeWidth="3"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 17 17)" style={{transition:'stroke-dasharray 0.4s'}}/>
      <text x="17" y="17" textAnchor="middle" dominantBaseline="central" fill={u.color}
        style={{fontSize:'8px',fontFamily:'Syne,sans-serif',fontWeight:'800'}}>{score}</text>
    </svg>
  );
}

function TriggerBadge({ type }) {
  const t = TRIGGER_TYPES[type];
  if (!t) return null;
  return (
    <span className="badge" style={{background:`${t.color}18`, color:t.color, border:`1px solid ${t.color}30`}}>
      {t.icon} {t.label}
    </span>
  );
}

function UrgencyBadge({ score }) {
  const u = urgency(score);
  return <span className="badge urgency-box" style={{background:u.bg, color:u.color}}>{u.label}</span>;
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, []);
  return <div className="toast">✓ {msg}</div>;
}

// ─── QUICK LOOK DRAWER ────────────────────────────────────────────────────────
function QuickLook({ client, partner, onClose, onOutreachLogged, onAttributeTransaction, onDisposition, bombBombApiKey }) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const logOutreach = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      if (!USE_MOCK_DATA) {
        await fetch("/.netlify/functions/log-outreach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_key: client.id,
            outreach_type: "note",
            note: note.trim(),
          }),
        });
      }
      setNote("");
      if (onOutreachLogged) onOutreachLogged();
    } catch (err) {
      console.error("Failed to log outreach:", err);
    } finally {
      setSaving(false);
    }
  };
  if (!client) return null;
  const script = suggestedScript(client);
  const action = nextAction(client);
  const u = urgency(client.opportunity_score);

  const copyScript = () => {
    navigator.clipboard?.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="overlay" onClick={onClose}/>
      <div className="drawer">
        <div className="drawer-header">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div style={{position:'absolute',top:'14px',left:'20px'}}>
            <button className="btn btn-ghost btn-sm" style={{color:'var(--red)',borderColor:'rgba(239,68,68,0.3)',fontSize:'10px',padding:'3px 8px'}}
              onClick={() => { if (onDisposition) onDisposition(client); }}>
              ⊘ Disposition
            </button>
          </div>
          <div className="drawer-name">{client.name}</div>
          <div className="drawer-addr">📍 {client.property_address}, {client.city}, {client.state}</div>
          <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
            <UrgencyBadge score={client.opportunity_score}/>
            {client.triggers.slice(0,3).map(t => <TriggerBadge key={t} type={t}/>)}
          </div>
        </div>

        <div className="drawer-section">
          <div className="action-box">
            <div className="action-title">Recommended Next Action</div>
            <div className="action-label">→ {action}</div>
          </div>
          <div className="drawer-section-title" style={{marginTop:'12px'}}>Suggested Script</div>
          <div className="script-box">
            {script}
            <button className="script-copy-btn" onClick={copyScript}>{copied ? "✓ Copied" : "Copy"}</button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Contact</div>
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            <div style={{fontSize:'13px',color:'var(--text2)'}}>✉ {client.email}</div>
            {client.phone && <div style={{fontSize:'13px',color:'var(--text2)'}}>📞 {client.phone}</div>}
            {partner && <div style={{fontSize:'13px',color:'var(--purple)'}}>🤝 {partner.name} · {partner.brokerage}</div>}
            {client.close_date && (
              <div style={{fontSize:'13px',color:'var(--text2)'}}>
                🏠 Purchased {new Date(client.close_date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                {yearsOwned(client.close_date) !== null && (
                  <span style={{color:'var(--text3)',marginLeft:'6px',fontSize:'12px'}}>
                    · {yearsOwned(client.close_date)} yr{yearsOwned(client.close_date) !== 1 ? 's' : ''} owned
                  </span>
                )}
              </div>
            )}
            {isStrongRefi(client) && (
              <div style={{marginTop:'6px',padding:'8px 10px',background:'rgba(59,130,246,0.08)',borderRadius:'8px',borderLeft:'3px solid var(--accent)'}}>
                <div style={{fontSize:'11px',fontWeight:'700',color:'var(--accent)'}}>⚡ Strong Refi Candidate</div>
                <div style={{fontSize:'11px',color:'var(--text2)',marginTop:'2px'}}>
                  Current rate {parseFloat(client.metrics?.current_rate||0).toFixed(2)}% · {Math.round(client.metrics?.equity_percent||0)}% equity
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Property Metrics</div>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Est. Value</div>
              <div className="metric-value accent">{fmt.currency(client.metrics.estimated_value)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Equity Amount</div>
              <div className="metric-value green">{fmt.currency(client.metrics.equity_amount)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Equity %</div>
              <div className="metric-value">{fmt.pct(client.metrics.equity_percent)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Current Rate</div>
              <div className={`metric-value ${client.metrics.refinance_opportunity ? 'orange' : ''}`}>{fmt.rate(client.metrics.current_rate)}</div>
            </div>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Opportunity Scores</div>
          <div className="metrics-grid">
            {[
              { label: "Likely to Sell", val: client.metrics.likely_to_sell_score },
              { label: "Likely to Buy", val: client.metrics.likely_to_buy_score },
              { label: "Activity Score", val: client.metrics.activity_score },
              { label: "Opportunity", val: client.opportunity_score },
            ].map(m => (
              <div key={m.label} className="metric-card">
                <div className="metric-label">{m.label}</div>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
                  <div className="metric-value" style={{fontSize:'22px'}}>{m.val}</div>
                  <div style={{flex:1}}>
                    <div className="score-bar" style={{marginTop:'4px'}}>
                      <div className="score-fill" style={{width:`${m.val}%`,background:'var(--accent)'}}/>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Active Triggers</div>
          <div className="trigger-chips">
            {client.triggers.length > 0 ? client.triggers.map(t => <TriggerBadge key={t} type={t}/>) : <span style={{color:'var(--text3)',fontSize:'12px'}}>No active triggers</span>}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Event Timeline</div>
          <div className="timeline">
            {client.events.map(ev => (
              <div key={ev.id} className="timeline-item">
                <div className="timeline-dot"/>
                <div className="timeline-content">
                  <div className="timeline-type">{ev.event_type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
                  <div className="timeline-date">{fmt.fullDate(ev.occurred_at)}</div>
                </div>
                <span className="badge" style={{background:'rgba(255,255,255,0.05)',color:'var(--text3)'}}>{ev.event_score}pt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        {client.transaction_attributed && client.last_transaction && (
          <div className="drawer-section">
            <div className="drawer-section-title">Transaction History</div>
            <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:'8px',padding:'12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                <span style={{fontSize:'14px'}}>✅</span>
                <span style={{fontSize:'13px',fontWeight:'600',color:'var(--green)'}}>
                  {client.last_transaction.type?.charAt(0).toUpperCase() + client.last_transaction.type?.slice(1)} Closed
                </span>
                {client.last_transaction.loan_amount && (
                  <span style={{fontSize:'12px',color:'var(--text3)'}}>
                    · ${Math.round(client.last_transaction.loan_amount/1000)}K
                  </span>
                )}
              </div>
              {client.last_transaction.close_date && (
                <div style={{fontSize:'12px',color:'var(--text3)'}}>
                  Closed {new Date(client.last_transaction.close_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                </div>
              )}
              {client.last_transaction.signal && client.last_transaction.signal !== 'general' && (
                <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'4px'}}>
                  Signal: {client.last_transaction.signal.replace(/_/g,' ')}
                </div>
              )}
              {client.last_transaction.notes && (
                <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'4px',fontStyle:'italic'}}>
                  "{client.last_transaction.notes}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Last Outreach */}
        {client.last_outreach && (
          <div className="drawer-section">
            <div className="drawer-section-title">Last Outreach</div>
            <div style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px'}}>
              <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'3px'}}>
                {new Date(client.last_outreach.logged_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}
              </div>
              {client.last_outreach.note && (
                <div style={{fontSize:'13px',color:'var(--text2)'}}>{client.last_outreach.note}</div>
              )}
            </div>
          </div>
        )}

        <div className="drawer-section" style={{borderBottom:'none'}}>
          <div className="drawer-section-title">Add Note / Outreach</div>
          <textarea className="notes-input" placeholder="Log a call, email, or note..." value={note} onChange={e=>setNote(e.target.value)}/>
          <div style={{display:'flex',gap:'8px',marginTop:'8px',flexWrap:'wrap'}}>
            <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={logOutreach} disabled={saving}>{saving ? "Saving..." : "📋 Log Outreach"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (!bombBombApiKey) {
                alert('Add your BombBomb API key in Settings → Preferences to enable video sending.');
                return;
              }
              // Open BombBomb compose with client email pre-filled
              const bbUrl = `https://app.bombbomb.com/app/#record?to=${encodeURIComponent(client.email)}&subject=${encodeURIComponent('A quick video for you, ' + (client.first_name || client.name.split(' ')[0]))}&apikey=${bombBombApiKey}`;
              window.open(bbUrl, '_blank', 'width=800,height=600');
            }}>🎬 Send Video</button>
            <button className="btn btn-ghost btn-sm" style={{color:'var(--green)',borderColor:'var(--green)'}}
              onClick={() => { if (onAttributeTransaction) onAttributeTransaction(client); }}>
              ✅ Log Transaction
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── DISPOSITION MODAL ───────────────────────────────────────────────────────
function DispositionModal({ client, onClose, onSave }) {
  const [disposition, setDisposition] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const options = [
    { value: "not_interested", label: "Not Interested", icon: "🚫", color: "var(--red)" },
    { value: "already_listed", label: "Already Listed", icon: "🏷", color: "var(--orange)" },
    { value: "has_lender", label: "Has a Lender", icon: "🔒", color: "var(--yellow)" },
    { value: "not_ready", label: "Not Ready — Nurture Later", icon: "⏰", color: "var(--text3)" },
    { value: "wrong_contact", label: "Wrong Contact Info", icon: "❌", color: "var(--red)" },
    { value: "do_not_contact", label: "Do Not Contact", icon: "⛔", color: "var(--red)" },
    { value: "closed_won", label: "Closed — Won Deal", icon: "✅", color: "var(--green)" },
    { value: "closed_lost", label: "Closed — Lost Deal", icon: "❎", color: "var(--text3)" },
  ];

  const save = async () => {
    if (!disposition) { alert("Select a disposition first"); return; }
    setSaving(true);
    try {
      await fetch("/.netlify/functions/log-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": "PalmerHollandDashboard!@#" },
        body: JSON.stringify({
          store_key: client.id,
          note: `[${disposition.replace(/_/g,' ').toUpperCase()}] ${note}`,
          type: "disposition",
          disposition,
        }),
      });
      if (onSave) onSave({ disposition, note });
      onClose();
    } catch { setSaving(false); }
  };

  return (
    <>
      <div className="overlay" onClick={onClose}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'440px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'24px',zIndex:200,display:'flex',flexDirection:'column',gap:'14px',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'16px'}}>Disposition Client</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer'}}>×</button>
        </div>

        <div style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px'}}>
          <div style={{fontSize:'13px',fontWeight:'600'}}>{client.name}</div>
          <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{client.email}</div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
          {options.map(o => (
            <div key={o.value}
              onClick={() => setDisposition(o.value)}
              style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'8px',cursor:'pointer',border:`1px solid ${disposition===o.value ? o.color : 'var(--border)'}`,background:disposition===o.value?`${o.color}12`:'var(--surface2)',transition:'all 0.15s'}}>
              <span style={{fontSize:'16px'}}>{o.icon}</span>
              <span style={{fontSize:'13px',color:disposition===o.value?o.color:'var(--text)',fontWeight:disposition===o.value?'600':'400'}}>{o.label}</span>
              {disposition===o.value && <span style={{marginLeft:'auto',color:o.color,fontSize:'14px'}}>✓</span>}
            </div>
          ))}
        </div>

        <div>
          <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Note (optional)</div>
          <textarea
            style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'6px',padding:'8px 10px',color:'var(--text)',fontSize:'13px',outline:'none',fontFamily:'DM Sans,sans-serif',height:'70px',resize:'none',boxSizing:'border-box'}}
            placeholder="Add context..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={save} disabled={saving || !disposition}>
          {saving ? '⟳ Saving...' : 'Save Disposition'}
        </button>
      </div>
    </>
  );
}

// ─── TRANSACTION ATTRIBUTION MODAL ──────────────────────────────────────────
function TransactionModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    type: "listing",
    close_date: new Date().toISOString().split("T")[0],
    loan_amount: "",
    notes: "",
    signal: client?.triggers?.[0] || "general",
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    setSaving(true);
    const transaction = {
      client_id: client.id,
      client_name: client.name,
      partner_id: client.partner_id,
      ...form,
      attributed_at: new Date().toISOString(),
    };
    try {
      const res = await fetch("/.netlify/functions/log-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": "PalmerHollandDashboard!@#" },
        body: JSON.stringify(transaction),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaved(true);
        if (onSave) onSave(data.transaction);
        setTimeout(onClose, 1500);
      } else {
        setError("Failed to save — try again");
      }
    } catch (err) {
      setError("Network error — try again");
    }
    setSaving(false);
  };

  const inputStyle = {width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'6px',padding:'8px 10px',color:'var(--text)',fontSize:'13px',outline:'none',fontFamily:'DM Sans,sans-serif'};

  return (
    <>
      <div className="overlay" onClick={onClose}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'440px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'24px',zIndex:200,display:'flex',flexDirection:'column',gap:'14px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'16px'}}>✅ Log Transaction</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer'}}>×</button>
        </div>

        {saved ? (
          <div style={{padding:'20px',textAlign:'center',color:'var(--green)',fontSize:'14px',fontWeight:'600'}}>
            ✓ Transaction attributed to {client.name}
          </div>
        ) : (
          <>
            <div style={{padding:'12px',background:'var(--surface2)',borderRadius:'8px',borderLeft:'3px solid var(--accent)'}}>
              <div style={{fontSize:'13px',fontWeight:'500'}}>{client.name}</div>
              <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>
                Signal: {client.triggers?.join(', ') || 'General monitoring'} · Score: {client.opportunity_score}
              </div>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Transaction Type</div>
                <select style={{...inputStyle,background:'var(--surface3)'}} value={form.type} onChange={e=>set('type',e.target.value)}>
                  <option value="listing">Listing (Seller)</option>
                  <option value="purchase">Purchase (Buyer)</option>
                  <option value="refinance">Refinance</option>
                  <option value="referral">Referral Out</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Close Date</div>
                <input style={inputStyle} type="date" value={form.close_date} onChange={e=>set('close_date',e.target.value)}/>
              </div>
              <div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Loan / Sale Amount</div>
                <input style={inputStyle} placeholder="e.g. 450000" value={form.loan_amount} onChange={e=>set('loan_amount',e.target.value)}/>
              </div>
              <div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Homebot Signal That Started the Conversation</div>
                <select style={{...inputStyle,background:'var(--surface3)'}} value={form.signal} onChange={e=>set('signal',e.target.value)}>
                  <option value="likely_to_sell">Likely to Sell</option>
                  <option value="cma_requested">CMA Requested</option>
                  <option value="refinance_viewed">Viewed Refi Details</option>
                  <option value="high_equity">High Equity Alert</option>
                  <option value="highly_engaged">Highly Engaged</option>
                  <option value="schedule_call">Clicked Schedule a Call</option>
                  <option value="general">General Monitoring</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>Notes</div>
                <textarea style={{...inputStyle,height:'70px',resize:'none'}} placeholder="How did this lead develop..." value={form.notes} onChange={e=>set('notes',e.target.value)}/>
              </div>
            </div>

            {error && <div style={{fontSize:'12px',color:'var(--red)',padding:'8px',background:'rgba(239,68,68,0.08)',borderRadius:'6px'}}>{error}</div>}
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={save} disabled={saving}>
              {saving ? '⟳ Saving...' : '✅ Save Transaction'}
            </button>
            <div style={{fontSize:'11px',color:'var(--text3)',textAlign:'center'}}>
              Saved to your dashboard — visible in Report Card and client profile
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── ADD CLIENT DRAWER ───────────────────────────────────────────────────────
function AddClientDrawer({ partnerId, partnerName, partners, onClose, onSuccess }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", mobile: "",
    address_street: "", address_zip: "",
    close_date: "", lead_source: "",
    loan_amount: "", loan_rate: "", loan_date: "",
    loan_type: "Conventional", loan_term_years: "30",
    home_value: "",
    selected_partner_id: partnerId || "",
  });
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("contact"); // contact | property | loan

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      setStatus("error"); setMessage("First name, last name and email are required."); return;
    }
    setStatus("loading"); setMessage("");
    try {
      const payload = {
        partner_id: form.selected_partner_id || null,
        first_name: form.first_name, last_name: form.last_name,
        email: form.email, mobile: form.mobile || undefined,
        address_street: form.address_street || undefined,
        address_zip: form.address_zip || undefined,
        close_date: form.close_date || undefined,
        lead_source: form.lead_source || undefined,
        loan_amount: form.loan_amount ? parseFloat(form.loan_amount) : undefined,
        loan_rate: form.loan_rate ? parseFloat(form.loan_rate) : undefined,
        loan_date: form.loan_date || undefined,
        loan_type: form.loan_type || undefined,
        loan_term_years: form.loan_term_years ? parseInt(form.loan_term_years) : undefined,
        home_value: form.home_value ? parseFloat(form.home_value) : undefined,
      };

      if (USE_MOCK_DATA) {
        await new Promise(r => setTimeout(r, 1200));
        setStatus("success");
        setMessage(`${form.first_name} ${form.last_name} has been added to Homebot. They will receive a welcome email shortly.`);
        if (onSuccess) onSuccess({ name: `${form.first_name} ${form.last_name}`, email: form.email });
        return;
      }

      const res = await fetch("/.netlify/functions/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": "" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409 || data.error === "duplicate_email") {
        setStatus("duplicate");
        setMessage(`A client with email ${form.email} already exists in this Homebot account.`);
        return;
      }
      if (!res.ok || !data.success) {
        setStatus("error");
        setMessage(data.message || "Something went wrong. Check the details and try again.");
        return;
      }
      setStatus("success");
      setMessage(data.message || `${form.first_name} ${form.last_name} added successfully.`);
      if (onSuccess) onSuccess(data.client);
    } catch (err) {
      setStatus("error");
      setMessage("Network error — check your connection and try again.");
    }
  };

  const resetAndClose = () => {
    setStatus(null); setMessage(""); setSection("contact"); onClose();
  };

  const selectedPartner = partners.find(p => p.id === form.selected_partner_id);
  const inputStyle = { width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 10px", color: "var(--text)", fontSize: "13px", outline: "none", fontFamily: "DM Sans,sans-serif", transition: "border-color 0.15s" };
  const labelStyle = { fontSize: "11px", color: "var(--text3)", marginBottom: "4px", display: "block" };

  const tabs = [
    { id: "contact", label: "Contact", icon: "👤" },
    { id: "property", label: "Property", icon: "🏠" },
    { id: "loan", label: "Loan", icon: "📄" },
  ];

  return (
    <>
      <div className="overlay" onClick={resetAndClose}/>
      <div className="drawer" style={{width: "460px"}}>
        <div className="drawer-header">
          <button className="drawer-close" onClick={resetAndClose}>×</button>
          <div className="drawer-name">Add New Client</div>
          <div className="drawer-addr">
            Adding to: <strong style={{color:"var(--accent)"}}>
              {selectedPartner ? selectedPartner.name : "Your Account"}
            </strong>
          </div>

          {/* Partner selector */}
          <div style={{marginTop:"10px"}}>
            <label style={labelStyle}>Add to Partner Account</label>
            <select style={{...inputStyle, background:"var(--surface3)"}}
              value={form.selected_partner_id}
              onChange={e => set("selected_partner_id", e.target.value)}>
              <option value="">My Own Account</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name} — {p.brokerage}</option>)}
            </select>
          </div>

          {/* Section tabs */}
          <div style={{display:"flex",gap:"6px",marginTop:"12px"}}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setSection(t.id)}
                className={`btn btn-sm ${section===t.id?"btn-primary":"btn-ghost"}`}
                style={{flex:1,justifyContent:"center"}}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{padding:"0 0 80px 0"}}>

          {/* CONTACT SECTION */}
          {section === "contact" && (
            <div className="drawer-section">
              <div className="drawer-section-title">Contact Information</div>
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                  <div>
                    <label style={labelStyle}>First Name *</label>
                    <input style={inputStyle} placeholder="Jennifer" value={form.first_name} onChange={e=>set("first_name",e.target.value)}/>
                  </div>
                  <div>
                    <label style={labelStyle}>Last Name *</label>
                    <input style={inputStyle} placeholder="Johnson" value={form.last_name} onChange={e=>set("last_name",e.target.value)}/>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Email Address *</label>
                  <input style={inputStyle} type="email" placeholder="jennifer@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Mobile Phone</label>
                  <input style={inputStyle} placeholder="(817) 555-0100" value={form.mobile} onChange={e=>set("mobile",e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Close Date</label>
                  <input style={inputStyle} type="date" value={form.close_date} onChange={e=>set("close_date",e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Lead Source</label>
                  <select style={{...inputStyle,background:"var(--surface3)"}} value={form.lead_source} onChange={e=>set("lead_source",e.target.value)}>
                    <option value="">Select source...</option>
                    <option>Realtor Referral</option>
                    <option>Past Client</option>
                    <option>Online Lead</option>
                    <option>Open House</option>
                    <option>Social Media</option>
                    <option>Google</option>
                    <option>Direct Mail</option>
                    <option>Builder</option>
                    <option>Financial Advisor</option>
                    <option>CPA</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" style={{width:"100%",marginTop:"16px",justifyContent:"center"}} onClick={() => setSection("property")}>
                Next → Property Info
              </button>
            </div>
          )}

          {/* PROPERTY SECTION */}
          {section === "property" && (
            <div className="drawer-section">
              <div className="drawer-section-title">Property Information</div>
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div>
                  <label style={labelStyle}>Property Address</label>
                  <input style={inputStyle} placeholder="1234 Oak Lane" value={form.address_street} onChange={e=>set("address_street",e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Zip Code</label>
                  <input style={inputStyle} placeholder="76109" value={form.address_zip} onChange={e=>set("address_zip",e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Estimated Home Value</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:"13px"}}>$</span>
                    <input style={{...inputStyle,paddingLeft:"22px"}} placeholder="450,000" value={form.home_value} onChange={e=>set("home_value",e.target.value)}/>
                  </div>
                </div>
                <div style={{fontSize:"12px",color:"var(--text3)",padding:"10px",background:"var(--surface2)",borderRadius:"8px",borderLeft:"3px solid var(--accent)"}}>
                  Property data enables Homebot to calculate equity, track home value changes, and generate refi opportunities.
                </div>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"16px"}}>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={() => setSection("contact")}>← Back</button>
                <button className="btn btn-primary" style={{flex:1,justifyContent:"center"}} onClick={() => setSection("loan")}>Next → Loan Info</button>
              </div>
            </div>
          )}

          {/* LOAN SECTION */}
          {section === "loan" && (
            <div className="drawer-section">
              <div className="drawer-section-title">Loan Information</div>
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                  <div>
                    <label style={labelStyle}>Loan Amount</label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:"13px"}}>$</span>
                      <input style={{...inputStyle,paddingLeft:"22px"}} placeholder="360,000" value={form.loan_amount} onChange={e=>set("loan_amount",e.target.value)}/>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Interest Rate</label>
                    <div style={{position:"relative"}}>
                      <input style={{...inputStyle,paddingRight:"22px"}} placeholder="6.875" value={form.loan_rate} onChange={e=>set("loan_rate",e.target.value)}/>
                      <span style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:"13px"}}>%</span>
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                  <div>
                    <label style={labelStyle}>Loan Type</label>
                    <select style={{...inputStyle,background:"var(--surface3)"}} value={form.loan_type} onChange={e=>set("loan_type",e.target.value)}>
                      <option>Conventional</option>
                      <option>FHA</option>
                      <option>VA</option>
                      <option>USDA</option>
                      <option>Jumbo</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Term</label>
                    <select style={{...inputStyle,background:"var(--surface3)"}} value={form.loan_term_years} onChange={e=>set("loan_term_years",e.target.value)}>
                      <option value="30">30 Year</option>
                      <option value="20">20 Year</option>
                      <option value="15">15 Year</option>
                      <option value="10">10 Year</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Loan Date / Close Date</label>
                  <input style={inputStyle} type="date" value={form.loan_date} onChange={e=>set("loan_date",e.target.value)}/>
                </div>
                <div style={{fontSize:"12px",color:"var(--text3)",padding:"10px",background:"var(--surface2)",borderRadius:"8px",borderLeft:"3px solid var(--accent)"}}>
                  Loan data enables Homebot to calculate equity, flag refi opportunities, and track PMI removal milestones.
                </div>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"16px"}}>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={() => setSection("property")}>← Back</button>
                <button className="btn btn-primary" style={{flex:2,justifyContent:"center"}} onClick={submit} disabled={status==="loading"}>
                  {status==="loading" ? "⟳ Adding to Homebot..." : "✓ Add Client to Homebot"}
                </button>
              </div>
            </div>
          )}

          {/* STATUS MESSAGES */}
          {status === "success" && (
            <div style={{margin:"16px 24px",padding:"14px",background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"10px"}}>
              <div style={{fontSize:"13px",fontWeight:"600",color:"var(--green)",marginBottom:"6px"}}>✓ Client Added Successfully</div>
              <div style={{fontSize:"12.5px",color:"var(--text2)",lineHeight:"1.5"}}>{message}</div>
              <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
                <button className="btn btn-primary btn-sm" onClick={() => { setStatus(null); setMessage(""); setSection("contact"); setForm(f => ({...f,first_name:"",last_name:"",email:"",mobile:"",address_street:"",address_zip:"",close_date:"",lead_source:"",loan_amount:"",loan_rate:"",loan_date:"",home_value:""})); }}>
                  + Add Another
                </button>
                <button className="btn btn-ghost btn-sm" onClick={resetAndClose}>Done</button>
              </div>
            </div>
          )}
          {status === "duplicate" && (
            <div style={{margin:"16px 24px",padding:"14px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:"10px"}}>
              <div style={{fontSize:"13px",fontWeight:"600",color:"var(--yellow)",marginBottom:"4px"}}>⚠ Duplicate Email</div>
              <div style={{fontSize:"12.5px",color:"var(--text2)"}}>{message}</div>
            </div>
          )}
          {status === "error" && (
            <div style={{margin:"16px 24px",padding:"14px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"10px"}}>
              <div style={{fontSize:"13px",fontWeight:"600",color:"var(--red)",marginBottom:"4px"}}>✗ Error</div>
              <div style={{fontSize:"12.5px",color:"var(--text2)"}}>{message}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// Live mode — always false in production
const USE_MOCK_DATA = false;
const POLL_INTERVAL_MS = 60000;

export default function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [activePill, setActivePill] = useState("All Clients");
  const [search, setSearch] = useState("");
  const [filterPartner, setFilterPartner] = useState("");
  const [filterOpp, setFilterOpp] = useState("");
  const [sortCol, setSortCol] = useState("opportunity_score");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [quickLook, setQuickLook] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerIndex, setPartnerIndex] = useState({});
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [addPartnerForm, setAddPartnerForm] = useState({ partner_id: "", partner_name: "", partner_email: "", partner_brokerage: "", api_token: "" });
  const [addPartnerStatus, setAddPartnerStatus] = useState(null);
  const [marketRate, setMarketRate] = useState("6.75");
  const [pollInterval, setPollInterval] = useState("60");
  const [syncStatus, setSyncStatus] = useState(null);
  const [enrichStatus, setEnrichStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [enrichProgress, setEnrichProgress] = useState({ enriched: 0, total: 0, remaining: 0 });
  const [transactions, setTransactions] = useState([]);
  const [partnerSyncStatus, setPartnerSyncStatus] = useState({});
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [showDispositionModal, setShowDispositionModal] = useState(false);
  const [dispositionClient, setDispositionClient] = useState(null);
  const [bombBombApiKey, setBombBombApiKey] = useState(() => {
    try { return localStorage.getItem('hb_bombbomb_key') || ''; } catch { return ''; }
  });
  const [attributeClient, setAttributeClient] = useState(null);
  const [attributeForm, setAttributeForm] = useState({ type: "listing", close_date: "", loan_amount: "", notes: "", signal: "" });
  const [attributeSaved, setAttributeSaved] = useState(false);
  const [addClientPartnerId, setAddClientPartnerId] = useState(null);
  const [addClientForm, setAddClientForm] = useState({
    first_name: "", last_name: "", email: "", mobile: "",
    address_street: "", address_zip: "",
    close_date: "", lead_source: "",
    loan_amount: "", loan_rate: "", loan_date: "", loan_type: "Conventional", loan_term_years: "30",
    home_value: "",
  });
  const [addClientStatus, setAddClientStatus] = useState(null); // null | 'loading' | 'success' | 'error' | 'duplicate'
  const [addClientMessage, setAddClientMessage] = useState(""); // {partnerId: 'loading'|'success'|'error'}
  const [partnerLastSynced, setPartnerLastSynced] = useState({}); // {partnerId: isoString}
  const [webhookUrl, setWebhookUrl] = useState("");
  const [settingsSection, setSettingsSection] = useState("profile");
  const [loProfile] = useState({
    name: "Palmer Holland",
    title: "Loan Officer & Branch Leader",
    nmls: "",
    email: "",
    phone: "",
    photo_uri: null,
  });
  const [clients, setClients] = useState(USE_MOCK_DATA ? ALL_CLIENTS : []);
  const [loading, setLoading] = useState(!USE_MOCK_DATA);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchClients = useRef(async () => {
    if (USE_MOCK_DATA) return;
    try {
      const res = await fetch("/.netlify/functions/get-clients");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setClients(data.clients || []);
      if (data.partners) setPartnerIndex(data.partners);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to fetch clients:", err);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (USE_MOCK_DATA) return;
    fetchClients.current();
    const interval = setInterval(fetchClients.current, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Load transactions on mount
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    fetch("/.netlify/functions/get-transactions")
      .then(r => r.json())
      .then(d => { if (d.transactions) setTransactions(d.transactions); })
      .catch(() => {});
  }, []);

  const showToast = (msg) => { setToast(msg); };

  const pillCounts = useMemo(() => {
    const base = selectedPartner
      ? clients.filter(c => c.partner_id === selectedPartner)
      : clients;
    return {
      "All Clients": base.length,
      "Ready for Refi": base.filter(c => c.metrics?.refinance_opportunity).length,
      "Just Listed": base.filter(c => c.metrics?.just_listed).length,
      "Likely to Buy": base.filter(c => (c.metrics?.likely_to_buy_score || 0) >= 70).length,
      "Likely to Sell": base.filter(c => (c.metrics?.likely_to_sell_score || 0) >= 70).length,
      "High Equity": base.filter(c => (c.metrics?.equity_percent || 0) >= 50).length,
      "Highly Engaged": base.filter(c => c.metrics?.highly_engaged).length,
      "CMA Requested": base.filter(c => c.metrics?.cma_requested).length,
    };
  }, [clients, selectedPartner]);

  const pillColors = {
    "All Clients": "#4f8ef7", "Ready for Refi": "#3b82f6", "Just Listed": "#ec4899",
    "Likely to Buy": "#06b6d4", "Likely to Sell": "#f97316", "High Equity": "#10b981",
    "Highly Engaged": "#8b5cf6", "CMA Requested": "#f59e0b"
  };

  const filtered = useMemo(() => {
    let list = [...clients];

    // Apply partner filter — selectedPartner (from card click) takes priority over dropdown
    const activePartnerFilter = selectedPartner || filterPartner;
    if (activePartnerFilter) {
      list = list.filter(c => c.partner_id === activePartnerFilter);
    }

    // Apply pill filter — use optional chaining to avoid crashes on missing metrics
    if (activePill !== "All Clients") {
      const map = {
        "Ready for Refi": c => c.metrics?.refinance_opportunity,
        "Just Listed": c => c.metrics?.just_listed,
        "Likely to Buy": c => (c.metrics?.likely_to_buy_score || 0) >= 70,
        "Likely to Sell": c => (c.metrics?.likely_to_sell_score || 0) >= 70,
        "High Equity": c => (c.metrics?.equity_percent || 0) >= 50,
        "Highly Engaged": c => c.metrics?.highly_engaged,
        "CMA Requested": c => c.metrics?.cma_requested,
      };
      if (map[activePill]) list = list.filter(map[activePill]);
    }
    if (filterPartner && !selectedPartner) list = list.filter(c => c.partner_id === filterPartner);
    if (filterOpp) {
      const map2 = { "call_today": c => c.opportunity_score >= 85, "call_week": c => c.opportunity_score >= 70 && c.opportunity_score < 85, "nurture": c => c.opportunity_score >= 50 && c.opportunity_score < 70, "monitor": c => c.opportunity_score < 50 };
      if (map2[filterOpp]) list = list.filter(map2[filterOpp]);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.property_address.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let av, bv;
      if (sortCol === "opportunity_score") { av = a.opportunity_score; bv = b.opportunity_score; }
      else if (sortCol === "sell_score") { av = a.metrics.likely_to_sell_score; bv = b.metrics.likely_to_sell_score; }
      else if (sortCol === "activity") { av = a.metrics.activity_score; bv = b.metrics.activity_score; }
      else if (sortCol === "equity_pct") { av = a.metrics.equity_percent; bv = b.metrics.equity_percent; }
      else if (sortCol === "last_activity") { av = new Date(a.last_activity); bv = new Date(b.last_activity); }
      else { av = a.opportunity_score; bv = b.opportunity_score; }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [clients, activePill, filterPartner, filterOpp, search, sortCol, sortDir, selectedPartner]);

  // topOpps always uses ALL clients for the dashboard widgets
  const topOpps = useMemo(() => [...clients].filter(c => c.name && c.name !== "Loading...").sort((a,b) => b.opportunity_score - a.opportunity_score).slice(0,7), [clients]);
  const topPartners = useMemo(() => {
    // Build partner list ONLY from partnerIndex (real registered partners)
    // Never auto-detect from client data to avoid tagging your own clients
    const partnerList = USE_MOCK_DATA
      ? PARTNERS.map(p => ({ id: p.id, name: p.name, brokerage: p.brokerage, photo_uri: null, last_synced: null }))
      : Object.values(partnerIndex).map(p => ({ id: p.id, name: p.name || p.id, brokerage: p.brokerage || "", photo_uri: p.photo_uri || null, last_synced: p.last_synced || null }));

    // If partnerIndex is empty but we have partner clients, build from unique partner_ids
    // Only do this when there are actually clients with partner_ids set
    const partnerIdsInData = [...new Set(clients.filter(c => c.partner_id && c.partner_id !== "null").map(c => c.partner_id))];
    const registeredIds = partnerList.map(p => p.id);
    const unregisteredIds = partnerIdsInData.filter(id => !registeredIds.includes(id));

    const allPartners = [
      ...partnerList,
      ...unregisteredIds.map(pid => ({
        id: pid,
        name: pid.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        brokerage: "",
        photo_uri: null,
        last_synced: null,
      }))
    ];

    return allPartners.map(p => {
      const pc = clients.filter(c => c.partner_id === p.id);
      const sellers = pc.filter(c => (c.metrics?.likely_to_sell_score || 0) >= 70).length;
      const refi = pc.filter(c => c.metrics?.refinance_opportunity).length;
      const engaged = pc.filter(c => c.metrics?.highly_engaged).length;
      const avgOpp = pc.length ? Math.round(pc.reduce((s,c) => s + (c.opportunity_score || 0), 0) / pc.length) : 0;
      return { ...p, totalClients: pc.length, sellers, refi, engaged, avgOpp };
    }).filter(p => p.totalClients > 0).sort((a,b) => b.totalClients - a.totalClients);
  }, [clients, partnerIndex]);

  const recentActivity = useMemo(() => {
    const events = [];
    clients.slice(0, 20).forEach(c => {
      if (c.events[0]) events.push({ client: c, event: c.events[0] });
    });
    return events.sort((a,b) => new Date(b.event.occurred_at) - new Date(a.event.occurred_at)).slice(0,12);
  }, [clients]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const toggleRow = (id) => {
    setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selectedRows.size === filtered.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filtered.map(c => c.id)));
  };

  const exportCSV = () => {
    const rows = filtered.map(c => [c.name, c.email, c.property_address, c.city, c.state, c.metrics.likely_to_sell_score, c.metrics.activity_score, c.metrics.equity_percent, c.metrics.current_rate, c.opportunity_score].join(","));
    const csv = ["Name,Email,Address,City,State,Sell Score,Activity,Equity%,Rate,Opp Score", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "homebot-clients.csv"; a.click();
    showToast("CSV exported successfully");
  };

  // Sidebar nav — Co-Sponsor removed, merged into Partners
  const navItems = [
    { icon: "⬛", label: "Dashboard" },
    { icon: "📞", label: "Today's Calls" },
    { icon: "👤", label: "Clients" },
    { icon: "🤝", label: "Partners" },
    { icon: "⚡", label: "Activity Feed" },
    { icon: "📊", label: "Reports" },
    { icon: "🏆", label: "Report Card" },
    { icon: "⚙", label: "Settings" },
  ];

  const renderClientScoreCell = (score) => {
    const cls = score >= 75 ? "score-high" : score >= 50 ? "score-med" : "score-low";
    return <span className={`score-num ${cls}`}>{score}</span>;
  };

  // Partner insight banner — shown only when filtering by a specific partner
  const PartnerBanner = (selectedPartner && (activeNav === "Clients" || activeNav === "Dashboard")) ? (() => {
    const p = topPartners.find(x => x.id === selectedPartner);
    if (!p) return null;
    const pc = clients.filter(c => c.partner_id === selectedPartner);
    const sellers = pc.filter(c => (c.metrics?.likely_to_sell_score || 0) >= 70).length;
    const refi = pc.filter(c => c.metrics?.refinance_opportunity).length;
    const cma = pc.filter(c => c.metrics?.cma_requested).length;
    const engaged = pc.filter(c => c.metrics?.highly_engaged).length;
    const callToday = pc.filter(c => c.opportunity_score >= 85).length;
    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px 20px',display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',flex:'0 0 auto'}}>
          <div className="avatar" style={{width:'42px',height:'42px',fontSize:'15px'}}>{p.name.split(' ').map(n=>n[0]).join('')}</div>
          <div>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>{p.name}</div>
            <div style={{fontSize:'11.5px',color:'var(--text3)'}}>{p.brokerage} · {p.totalClients} clients</div>
          </div>
        </div>
        <div style={{display:'flex',gap:'10px',flex:1,flexWrap:'wrap'}}>
          {[
            {label:'Call Today',value:callToday,color:'var(--red)'},
            {label:'Likely to Sell',value:sellers,color:'var(--orange)'},
            {label:'Refi Opp',value:refi,color:'var(--accent)'},
            {label:'CMA Requested',value:cma,color:'var(--yellow)'},
            {label:'Highly Engaged',value:engaged,color:'var(--purple)'},
          ].map(s => (
            <div key={s.label} style={{background:'var(--surface2)',borderRadius:'8px',padding:'8px 14px',textAlign:'center',minWidth:'80px'}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'20px',color:s.color}}>{s.value}</div>
              <div style={{fontSize:'10.5px',color:'var(--text3)',marginTop:'1px'}}>{s.label}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedPartner(null); setActivePill("All Clients"); }}>
          ✕ Clear Filter
        </button>
      </div>
    );
  })() : null;

  const renderContent = () => {
    if (activeNav === "Partners") {
      const addPartner = async () => {
        setAddPartnerStatus("loading");
        try {
          const res = await fetch("/.netlify/functions/add-partner", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-webhook-secret": "YOUR_SECRET" },
            body: JSON.stringify(addPartnerForm),
          });
          const data = await res.json();
          setAddPartnerStatus(data.success ? "success" : "error");
          if (data.success) { setShowAddPartner(false); setAddPartnerForm({ partner_id:"",partner_name:"",partner_email:"",partner_brokerage:"",api_token:"" }); }
        } catch { setAddPartnerStatus("error"); }
      };

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px',marginBottom:'4px'}}>Partner Dashboard</div>
              <div style={{fontSize:'13px',color:'var(--text3)'}}>Monitor Realtor partner databases and opportunities</div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              {selectedPartner && <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedPartner(null); setActiveNav("Partners"); }}>← Back</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { setAddClientPartnerId(null); setAddClientStatus(null); setShowAddClient(true); }}>+ Add Client</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddPartner(!showAddPartner)}>+ Add Partner</button>
            </div>
          </div>

          {showAddPartner && (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px'}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'14px',marginBottom:'14px'}}>Add Realtor Partner</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'12px'}}>
                {[
                  {key:'partner_id',label:'Partner ID (unique, no spaces)',placeholder:'sarah_chen'},
                  {key:'partner_name',label:'Full Name',placeholder:'Sarah Chen'},
                  {key:'partner_email',label:'Email',placeholder:'sarah@compass.com'},
                  {key:'partner_brokerage',label:'Brokerage',placeholder:'Compass'},
                  {key:'api_token',label:'Their Homebot API Token',placeholder:'open-api-token-v1 ...'},
                ].map(f => (
                  <div key={f.key} style={{gridColumn: f.key==='api_token' ? '1/-1' : 'auto'}}>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>{f.label}</div>
                    <input
                      style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'6px',padding:'8px 10px',color:'var(--text)',fontSize:'13px',outline:'none',fontFamily:'DM Sans,sans-serif'}}
                      placeholder={f.placeholder}
                      value={addPartnerForm[f.key]}
                      onChange={e => setAddPartnerForm(prev => ({...prev, [f.key]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <button className="btn btn-primary btn-sm" onClick={addPartner} disabled={addPartnerStatus==='loading'}>
                  {addPartnerStatus==='loading' ? 'Adding...' : 'Add Partner'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddPartner(false)}>Cancel</button>
                {addPartnerStatus==='success' && <span style={{fontSize:'12px',color:'var(--green)'}}>✓ Partner added — sync their clients to see data</span>}
                {addPartnerStatus==='error' && <span style={{fontSize:'12px',color:'var(--red)'}}>Error adding partner — check token and try again</span>}
              </div>
            </div>
          )}

          <div className="partner-grid">
            {topPartners.map(p => (
              <div key={p.id} className={`partner-card ${selectedPartner === p.id ? 'selected' : ''}`}
                onClick={() => { setSelectedPartner(p.id); setActiveNav("Clients"); setActivePill("All Clients"); }}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                  {p.photo_uri
                    ? <img src={p.photo_uri} alt={p.name} style={{width:'38px',height:'38px',borderRadius:'50%',objectFit:'cover'}}/>
                    : <div className="avatar" style={{width:'38px',height:'38px',fontSize:'14px'}}>{p.name.split(' ').map(n=>n[0]).join('')}</div>
                  }
                  <div>
                    <div className="partner-name">{p.name}</div>
                    <div className="partner-brokerage">{p.brokerage}</div>
                  </div>
                  <div style={{marginLeft:'auto'}}><ScoreRing score={p.avgOpp} size={36}/></div>
                </div>
                <div className="partner-stats">
                  <div className="partner-stat"><div className="partner-stat-label">Total Clients</div><div className="partner-stat-value">{p.totalClients}</div></div>
                  <div className="partner-stat"><div className="partner-stat-label">Likely Sellers</div><div className="partner-stat-value" style={{color:'var(--orange)'}}>{p.sellers}</div></div>
                  <div className="partner-stat"><div className="partner-stat-label">Refi Opps</div><div className="partner-stat-value" style={{color:'var(--accent)'}}>{p.refi}</div></div>
                  <div className="partner-stat"><div className="partner-stat-label">Highly Engaged</div><div className="partner-stat-value" style={{color:'var(--purple)'}}>{p.engaged}</div></div>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'10px'}}>
                  <div style={{fontSize:'10px',color:'var(--text3)'}}>
                    {partnerLastSynced[p.id]
                      ? `Synced ${fmt.date(partnerLastSynced[p.id])}`
                      : p.last_synced
                        ? `Synced ${fmt.date(p.last_synced)}`
                        : 'Never synced'}
                  </div>
                  <div style={{display:'flex',gap:'6px'}}>
                    <button className="btn btn-ghost btn-sm" disabled={partnerSyncStatus[p.id]==='loading'}
                      onClick={e => {
                        e.stopPropagation();
                        setPartnerSyncStatus(prev => ({...prev, [p.id]: 'loading'}));
                        const doSync = async () => {
                          try {
                            if (!USE_MOCK_DATA) {
                              const res = await fetch('/.netlify/functions/sync-clients', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'PalmerHollandDashboard!@#' },
                                body: JSON.stringify({ partner_id: p.id, partner_name: p.name, partner_brokerage: p.brokerage }),
                              });
                              const data = await res.json();
                              setPartnerSyncStatus(prev => ({...prev, [p.id]: data.success ? `success:${data.synced}` : 'error'}));
                            } else {
                              await new Promise(r => setTimeout(r, 1500));
                              setPartnerSyncStatus(prev => ({...prev, [p.id]: 'success:' + p.totalClients}));
                            }
                            setPartnerLastSynced(prev => ({...prev, [p.id]: new Date().toISOString()}));
                            setTimeout(() => setPartnerSyncStatus(prev => ({...prev, [p.id]: null})), 4000);
                          } catch {
                            setPartnerSyncStatus(prev => ({...prev, [p.id]: 'error'}));
                          }
                        };
                        doSync();
                      }}>
                      {partnerSyncStatus[p.id]==='loading' ? '⟳ Syncing...' : '🔄 Sync'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setSelectedPartner(p.id);setActiveNav("Clients");}}>View →</button>
                    <button className="btn btn-primary btn-sm" onClick={e=>{e.stopPropagation();setAddClientPartnerId(p.id);setAddClientForm(f=>({...f}));setAddClientStatus(null);setShowAddClient(true);}}>+ Client</button>
                  </div>
                </div>
                {partnerSyncStatus[p.id] && partnerSyncStatus[p.id] !== 'loading' && (
                  <div style={{marginTop:'6px',fontSize:'11px',padding:'6px 8px',borderRadius:'6px',
                    background: partnerSyncStatus[p.id].startsWith('success') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: partnerSyncStatus[p.id].startsWith('success') ? 'var(--green)' : 'var(--red)'}}>
                    {partnerSyncStatus[p.id].startsWith('success')
                      ? `✓ Synced ${partnerSyncStatus[p.id].split(':')[1]} clients`
                      : '✗ Sync failed — check API token'}
                  </div>
                )}
              </div>
            ))}
            {topPartners.length === 0 && (
              <div className="empty-state" style={{gridColumn:'1/-1'}}>
                <div className="empty-icon">🤝</div>
                <div className="empty-title">No partners yet</div>
                <div className="empty-desc">Add a Realtor partner above to start monitoring their client database</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeNav === "Today's Calls") {
      // Top priority clients across ALL databases sorted by opportunity score
      const allPriority = [...clients]
        .filter(c => c.name && c.name !== "Loading...")
        .sort((a,b) => b.opportunity_score - a.opportunity_score)
        .slice(0, 20);

      const callToday = allPriority.filter(c => c.opportunity_score >= 85);
      const callWeek = allPriority.filter(c => c.opportunity_score >= 70 && c.opportunity_score < 85);

      const ClientCallCard = ({ c, rank }) => {
        const u = urgency(c.opportunity_score);
        const partner = topPartners.find(p => p.id === c.partner_id);
        const script = suggestedScript(c);
        const action = nextAction(c);
        const yrs = yearsOwned(c.close_date);
        return (
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px 20px',display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--surface2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:'var(--text3)',flexShrink:0}}>#{rank}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                  <span style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>{c.name}</span>
                  <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',background:u.bg,color:u.color,fontWeight:'600'}}>{u.label}</span>
                  {partner && <span style={{fontSize:'11px',color:'var(--purple)'}}>· {partner.name}</span>}
                </div>
                <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'2px'}}>
                  {c.property_address || c.email}
                  {yrs !== null && <span style={{marginLeft:'8px'}}>· {yrs}yr owner</span>}
                  {c.metrics?.current_rate > 0 && <span style={{marginLeft:'8px'}}>· {parseFloat(c.metrics.current_rate).toFixed(2)}%</span>}
                  {c.metrics?.equity_percent > 0 && <span style={{marginLeft:'8px'}}>· {Math.round(c.metrics.equity_percent)}% equity</span>}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <ScoreRing score={c.opportunity_score} size={40}/>
              </div>
            </div>

            {/* Triggers */}
            {c.triggers?.length > 0 && (
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {c.triggers.map(t => {
                  const tt = TRIGGER_TYPES[t];
                  return tt ? (
                    <span key={t} style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',background:`${tt.color}18`,color:tt.color,fontWeight:'500'}}>
                      {tt.icon} {tt.label}
                    </span>
                  ) : null;
                })}
                {isStrongRefi(c) && (
                  <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',background:'rgba(59,130,246,0.12)',color:'var(--accent)',fontWeight:'500'}}>⚡ Strong Refi</span>
                )}
              </div>
            )}

            {/* Suggested script */}
            <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px 12px',borderLeft:'3px solid var(--accent)'}}>
              <div style={{fontSize:'10px',color:'var(--text3)',marginBottom:'4px',letterSpacing:'1px',textTransform:'uppercase'}}>Suggested Script</div>
              <div style={{fontSize:'12.5px',color:'var(--text2)',lineHeight:'1.5'}}>{script}</div>
            </div>

            {/* Action buttons */}
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <button className="btn btn-primary btn-sm" onClick={() => setQuickLook(c)}>📋 Full Profile</button>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                navigator.clipboard?.writeText(script);
                alert('Script copied!');
              }}>📋 Copy Script</button>
              <button className="btn btn-ghost btn-sm" style={{color:'var(--green)',borderColor:'var(--green)'}}
                onClick={() => { setAttributeClient(c); setAttributeForm(f => ({...f, signal: c.triggers?.[0] || 'general'})); setShowAttributeModal(true); }}>
                ✓ Log Transaction
              </button>
            </div>
          </div>
        );
      };

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'16px',maxWidth:'700px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px'}}>Today's Priority Calls</div>
            <div style={{fontSize:'12px',color:'var(--text3)'}}>Across all {clients.length} clients</div>
          </div>

          {callToday.length > 0 && (
            <div>
              <div style={{fontSize:'11px',color:'var(--red)',fontWeight:'600',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'8px'}}>🔴 Call Today ({callToday.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {callToday.slice(0,5).map((c,i) => <ClientCallCard key={c.id} c={c} rank={i+1}/>)}
              </div>
            </div>
          )}

          {callWeek.length > 0 && (
            <div style={{marginTop:'8px'}}>
              <div style={{fontSize:'11px',color:'var(--orange)',fontWeight:'600',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'8px'}}>🟠 Call This Week ({callWeek.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {callWeek.slice(0,5).map((c,i) => <ClientCallCard key={c.id} c={c} rank={callToday.length+i+1}/>)}
              </div>
            </div>
          )}

          {callToday.length === 0 && callWeek.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📞</div>
              <div className="empty-title">No priority calls right now</div>
              <div className="empty-desc">Clients will appear here as they interact with Homebot and raise their hand.</div>
            </div>
          )}
        </div>
      );
    }

    if (activeNav === "Report Card") {
      // Monthly summary per partner — the story you tell at quarterly meetings
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);

      const getMonthStats = (partnerIdFilter) => {
        const base = partnerIdFilter ? clients.filter(c => c.partner_id === partnerIdFilter) : clients.filter(c => !c.partner_id);
        const contacted = base.filter(c => c.last_contacted && new Date(c.last_contacted) >= monthStart);
        const signals = base.filter(c => c.triggers?.length > 0);
        const sellers = base.filter(c => (c.metrics?.likely_to_sell_score||0) >= 70);
        const refi = base.filter(c => c.metrics?.refinance_opportunity);
        const cma = base.filter(c => c.metrics?.cma_requested);
        const highEquity = base.filter(c => (c.metrics?.equity_percent||0) >= 50);
        const transactions = base.filter(c => c.transaction_attributed);
        const strongRefi = base.filter(c => isStrongRefi(c));
        return { total: base.length, contacted: contacted.length, signals: signals.length, sellers: sellers.length, refi: refi.length, cma: cma.length, highEquity: highEquity.length, transactions: transactions.length, strongRefi: strongRefi.length };
      };

      const PartnerCard = ({ partner, stats, isOwn }) => (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            <div className="avatar" style={{width:'44px',height:'44px',fontSize:'16px',background: isOwn ? 'rgba(79,142,247,0.15)' : 'rgba(139,92,246,0.15)'}}>
              {isOwn ? '🏠' : (partner?.name||'?').split(' ').map(n=>n[0]).join('')}
            </div>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>{isOwn ? 'Your Database' : partner?.name}</div>
              <div style={{fontSize:'12px',color:'var(--text3)'}}>{isOwn ? 'Your own clients' : `${partner?.brokerage} · Co-sponsored`}</div>
            </div>
            <div style={{marginLeft:'auto',textAlign:'right'}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'24px',color:'var(--accent)'}}>{stats.total}</div>
              <div style={{fontSize:'11px',color:'var(--text3)'}}>Total Clients</div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px'}}>
            {[
              {label:'Signals Detected',value:stats.signals,color:'var(--orange)',icon:'⚡'},
              {label:'Likely to Sell',value:stats.sellers,color:'var(--orange)',icon:'🏠'},
              {label:'Refi Candidates',value:stats.refi,color:'var(--accent)',icon:'📉'},
              {label:'Strong Refi',value:stats.strongRefi,color:'var(--accent)',icon:'💡'},
              {label:'CMA Requested',value:stats.cma,color:'var(--yellow)',icon:'📋'},
              {label:'High Equity',value:stats.highEquity,color:'var(--green)',icon:'💰'},
              {label:'Contacted (mo)',value:stats.contacted,color:'var(--purple)',icon:'📞'},
              {label:'Transactions',value:stats.transactions,color:'var(--green)',icon:'✅'},
            ].map(s => (
              <div key={s.label} style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px 12px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'22px',color:s.color}}>{s.value}</div>
                <div style={{fontSize:'10.5px',color:'var(--text3)',marginTop:'1px'}}>{s.icon} {s.label}</div>
              </div>
            ))}
          </div>

          {!isOwn && stats.signals > 0 && (
            <div style={{padding:'12px',background:'rgba(79,142,247,0.06)',borderRadius:'8px',borderLeft:'3px solid var(--accent)'}}>
              <div style={{fontSize:'12px',color:'var(--text)',fontWeight:'600',marginBottom:'4px'}}>📊 Agent Summary</div>
              <div style={{fontSize:'12px',color:'var(--text2)',lineHeight:'1.6'}}>
                Your Homebot co-sponsorship is monitoring {stats.total} clients in {partner?.name?.split(' ')[0]}'s database.
                {stats.sellers > 0 && ` ${stats.sellers} client${stats.sellers !== 1 ? 's are' : ' is'} showing seller signals.`}
                {stats.refi > 0 && ` ${stats.refi} refi opportunit${stats.refi !== 1 ? 'ies' : 'y'} identified.`}
                {stats.cma > 0 && ` ${stats.cma} client${stats.cma !== 1 ? 's' : ''} requested a CMA.`}
                {stats.contacted > 0 && ` ${stats.contacted} conversation${stats.contacted !== 1 ? 's' : ''} initiated this month.`}
              </div>
            </div>
          )}
        </div>
      );

      const ownStats = getMonthStats(null);

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'16px',maxWidth:'800px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px'}}>Partner Report Card</div>
              <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'2px'}}>{now.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const summary = [
                `HOMEBOT OPPORTUNITY REPORT — ${now.toLocaleDateString('en-US',{month:'long',year:'numeric'})}`,
                ``,
                `YOUR DATABASE: ${ownStats.total} clients monitored`,
                `• ${ownStats.signals} signals detected`,
                `• ${ownStats.sellers} likely to sell`,
                `• ${ownStats.refi} refi opportunities`,
                `• ${ownStats.contacted} conversations initiated`,
                ``,
                ...topPartners.map(p => {
                  const s = getMonthStats(p.id);
                  return [
                    `${p.name.toUpperCase()} (${p.brokerage}): ${s.total} clients`,
                    `• ${s.signals} signals · ${s.sellers} sellers · ${s.refi} refi opps · ${s.cma} CMA requests`,
                  ].join('\n');
                }),
              ].join('\n');
              navigator.clipboard?.writeText(summary);
              alert('Report summary copied to clipboard!');
            }}>📋 Copy Summary</button>
          </div>

          <PartnerCard isOwn={true} stats={ownStats}/>
          {topPartners.map(p => <PartnerCard key={p.id} partner={p} stats={getMonthStats(p.id)}/>)}

          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'14px',marginBottom:'12px'}}>📅 Weekly Priority List</div>
            <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'12px'}}>Top opportunities to contact this week across all databases:</div>
            {clients.filter(c=>c.opportunity_score>=70).sort((a,b)=>b.opportunity_score-a.opportunity_score).slice(0,10).map((c,i) => {
              const partner = topPartners.find(p=>p.id===c.partner_id);
              const u = urgency(c.opportunity_score);
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}} onClick={()=>setQuickLook(c)}>
                  <div style={{fontSize:'12px',color:'var(--text3)',width:'20px',textAlign:'right'}}>#{i+1}</div>
                  <ScoreRing score={c.opportunity_score} size={28}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'500'}}>{c.name}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>{partner ? partner.name + ' · ' : ''}{nextAction(c)}</div>
                  </div>
                  <span style={{fontSize:'11px',color:u.color,fontWeight:'600'}}>{u.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }


      // Build activity from ALL clients including partners — read from stored events
      const allActivity = [];
      clients.forEach(c => {
        const evts = c.events || [];
        evts.forEach(ev => allActivity.push({ client: c, event: ev }));
      });
      allActivity.sort((a, b) => new Date(b.event.occurred_at) - new Date(a.event.occurred_at));
      const displayActivity = allActivity.slice(0, 100);

      const eventIcons = {
        'cma-request': '📊', 'cma_requested': '📊',
        'viewed-refi-details': '📉', 'refinance_viewed': '📉', 'refi-slider-interaction': '📉',
        'used-cashout-calculator': '💰',
        'likely-to-sell': '🏠', 'highly-likely-to-sell': '🏠', 'likely_to_sell': '🏠',
        'viewed-should-you-sell': '🏡', 'instant-offer-requested': '🏡',
        'prequal-request': '🔑', 'listings-prequal-request': '🔑', 'loan-application-cta-click': '🔑',
        'listing-favorited-event': '❤️',
        'homeowner-direct-message': '💬', 'buyer-direct-message': '💬',
        'schedule-a-call-cta-click': '📞',
        'view': '👁', 'homeowner-digest-email-open': '✉', 'homeowner-digest-email-click': '✉',
        'buyer-digest-email-open': '✉', 'ai-insight': '🤖', 'listings-bot': '🔍',
        'highly_engaged': '🔥', 'high_equity': '💰',
      };

      // High value events that deserve special highlight
      const highValueEvents = new Set(['cma-request','viewed-refi-details','likely-to-sell','highly-likely-to-sell','prequal-request','homeowner-direct-message','schedule-a-call-cta-click','loan-application-cta-click','instant-offer-requested','listings-prequal-request','used-cashout-calculator']);

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'12px',maxWidth:'780px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px'}}>Activity Feed</div>
              <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'2px'}}>{allActivity.length} events across {clients.length} clients</div>
            </div>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const postmanCall = `POST https://homebotdash.netlify.app/.netlify/functions/backfill-events\nHeaders: x-webhook-secret: PalmerHollandDashboard!@#\nBody: {"webhook_client_id": "c2d8e4b6-14ba-4c29-9ba8-bde6464c2142", "offset": 0}`;
                navigator.clipboard?.writeText(postmanCall);
                alert('Postman call copied! Run this to backfill historical activity.');
              }}>📋 Backfill History</button>
            </div>
          </div>

          {displayActivity.length === 0 ? (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'40px 20px',textAlign:'center'}}>
              <div style={{fontSize:'32px',marginBottom:'12px'}}>⚡</div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'16px',marginBottom:'8px'}}>No Activity Yet</div>
              <div style={{fontSize:'13px',color:'var(--text3)',marginBottom:'16px',maxWidth:'400px',margin:'0 auto 16px'}}>
                As your clients interact with Homebot — viewing their report, requesting a CMA, clicking refi details — those events will appear here in real time.
              </div>
              <div style={{fontSize:'12px',color:'var(--text2)',padding:'12px',background:'var(--surface2)',borderRadius:'8px',display:'inline-block',textAlign:'left'}}>
                <strong style={{color:'var(--accent)'}}>To backfill historical activity:</strong><br/>
                Click "Backfill History" above to copy the Postman call,<br/>
                then run it to pull existing events from Homebot.
              </div>
            </div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden'}}>
              {displayActivity.map((a, i) => {
                const ev = a.event;
                const cl = a.client;
                const isPartner = !!cl.partner_id;
                const partnerName = isPartner ? topPartners.find(p => p.id === cl.partner_id)?.name : null;
                const icon = eventIcons[ev.event_type] || '⚡';
                const isHighValue = highValueEvents.has(ev.event_type);
                const label = ev.label || ev.event_type.replace(/-/g,' ').replace(/_/g,' ').replace(/\w/g, c => c.toUpperCase());

                return (
                  <div key={i} style={{
                    display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',
                    borderBottom: i < displayActivity.length-1 ? '1px solid var(--border)' : 'none',
                    cursor:'pointer',
                    background: isHighValue ? 'rgba(79,142,247,0.03)' : 'transparent',
                    transition:'background 0.1s',
                  }}
                    onClick={() => setQuickLook(cl)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = isHighValue ? 'rgba(79,142,247,0.03)' : 'transparent'}
                  >
                    <div style={{
                      width:'36px',height:'36px',borderRadius:'10px',
                      background: isHighValue ? 'rgba(79,142,247,0.12)' : isPartner ? 'rgba(139,92,246,0.1)' : 'var(--surface2)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0,
                    }}>{icon}</div>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'13px',fontWeight:'600',color:'var(--text)'}}>{cl.name}</span>
                        <span style={{fontSize:'13px',color:'var(--text2)',fontWeight:'400'}}>{label}</span>
                        {isHighValue && <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'8px',background:'rgba(79,142,247,0.12)',color:'var(--accent)',fontWeight:'600'}}>High Value</span>}
                        {isPartner && <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'8px',background:'rgba(139,92,246,0.12)',color:'var(--purple)',fontWeight:'500'}}>{partnerName || cl.partner_id}</span>}
                      </div>
                      {cl.property_address && (
                        <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{cl.property_address}</div>
                      )}
                    </div>

                    <div style={{fontSize:'11.5px',color:'var(--text3)',flexShrink:0,textAlign:'right'}}>
                      {fmt.date(ev.occurred_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
      // Build activity from all clients including partners
      const allActivity = [];
      clients.forEach(c => {
        if (c.events && c.events.length > 0) {
          c.events.forEach(ev => {
            allActivity.push({ client: c, event: ev });
          });
        }
      });
      allActivity.sort((a, b) => new Date(b.event.occurred_at) - new Date(a.event.occurred_at));
      const displayActivity = allActivity.slice(0, 50);

      const eventIcons = {
        'cma-request': '📊', 'cma_requested': '📊',
        'viewed-refi-details': '📉', 'refinance_viewed': '📉',
        'refi-slider-interaction': '📉',
        'likely-to-sell': '🏠', 'highly-likely-to-sell': '🏠', 'likely_to_sell': '🏠',
        'prequal-request': '🔑', 'listings-prequal-request': '🔑',
        'used-cashout-calculator': '💰', 'high_equity': '💰',
        'homeowner-direct-message': '💬', 'buyer-direct-message': '💬',
        'schedule-a-call-cta-click': '📞', 'loan-application-cta-click': '📞',
        'listing-favorited-event': '❤️', 'viewed-should-you-sell': '🏡',
        'view': '👁', 'homeowner-digest-email-open': '✉', 'homeowner-digest-email-click': '✉',
        'viewed_report': '📋', 'opened_email': '✉', 'property_viewed': '🏠', 'equity_update': '📈',
      };

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'12px',maxWidth:'700px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px'}}>Activity Feed</div>
            <div style={{fontSize:'12px',color:'var(--text3)'}}>{displayActivity.length} recent events across all databases</div>
          </div>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'4px 0'}}>
            {displayActivity.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⚡</div>
                <div className="empty-title">No activity yet</div>
                <div className="empty-desc">Events will appear here as your clients interact with Homebot. This populates automatically via the live webhook.</div>
              </div>
            ) : displayActivity.map((a, i) => {
              const ev = a.event;
              const cl = a.client;
              const icon = eventIcons[ev.event_type] || '⚡';
              const isPartner = !!cl.partner_id;
              const partnerName = isPartner ? topPartners.find(p => p.id === cl.partner_id)?.name : null;
              return (
                <div key={i} className="activity-item" style={{cursor:'pointer'}} onClick={() => setQuickLook(cl)}>
                  <div className="activity-icon" style={{background: isPartner ? 'rgba(139,92,246,0.15)' : 'var(--surface2)'}}>{icon}</div>
                  <div className="activity-text">
                    <div className="activity-name" style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      {cl.name}
                      {isPartner && <span className="badge" style={{background:'rgba(139,92,246,0.12)',color:'var(--purple)',fontSize:'9px'}}>{partnerName || cl.partner_id}</span>}
                    </div>
                    <div className="activity-desc">
                      {ev.event_type.replace(/-/g,' ').replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase())}
                      {cl.property_address ? ` · ${cl.property_address}` : ''}
                    </div>
                  </div>
                  <div className="activity-time">{fmt.date(ev.occurred_at)}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeNav === "Reports") {
      const callToday = clients.filter(c => c.opportunity_score >= 85);
      const callWeek = clients.filter(c => c.opportunity_score >= 70 && c.opportunity_score < 85);
      const ownClients = clients.filter(c => !c.partner_id);
      const partnerClients = clients.filter(c => c.partner_id);
      const refiOpps = clients.filter(c => c.metrics?.refinance_opportunity);
      const likelySellers = clients.filter(c => (c.metrics?.likely_to_sell_score || 0) >= 70);
      const cmaRequests = clients.filter(c => c.metrics?.cma_requested);
      const highEquity = clients.filter(c => (c.metrics?.equity_percent || 0) >= 50);
      const neverContacted = clients.filter(c => !c.last_contacted);

      return (
        <div style={{display:'flex',flexDirection:'column',gap:'16px',maxWidth:'900px'}}>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'18px'}}>Reports & Insights</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px'}}>
            {[
              {label:'Total Clients',value:clients.length,color:'var(--accent)',icon:'👤'},
              {label:'Your Database',value:ownClients.length,color:'var(--accent)',icon:'🏠'},
              {label:'Partner Clients',value:partnerClients.length,color:'var(--purple)',icon:'🤝'},
              {label:'Call Today',value:callToday.length,color:'var(--red)',icon:'📞'},
              {label:'Call This Week',value:callWeek.length,color:'var(--orange)',icon:'📅'},
              {label:'Never Contacted',value:neverContacted.length,color:'var(--yellow)',icon:'⚠️'},
              {label:'Likely to Sell',value:likelySellers.length,color:'var(--orange)',icon:'🏡'},
              {label:'Refi Opportunities',value:refiOpps.length,color:'var(--accent)',icon:'📉'},
              {label:'CMA Requested',value:cmaRequests.length,color:'var(--yellow)',icon:'📋'},
              {label:'High Equity',value:highEquity.length,color:'var(--green)',icon:'💰'},
              {label:'Active Partners',value:topPartners.length,color:'var(--purple)',icon:'🤝'},
              {label:'Avg Opp Score',value:clients.length?Math.round(clients.reduce((s,c)=>s+(c.opportunity_score||0),0)/clients.length):0,color:'var(--cyan)',icon:'⭐'},
            ].map(s => (
              <div key={s.label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px 16px'}}>
                <div style={{fontSize:'18px',marginBottom:'6px'}}>{s.icon}</div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'26px',color:s.color}}>{s.value}</div>
                <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'14px',marginBottom:'14px'}}>Partner Breakdown</div>
            {topPartners.length === 0 ? (
              <div style={{fontSize:'13px',color:'var(--text3)'}}>No partners connected yet.</div>
            ) : topPartners.map(p => {
              const pct = clients.length ? Math.round((p.totalClients / clients.length) * 100) : 0;
              return (
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className="avatar" style={{width:'32px',height:'32px',fontSize:'11px',flexShrink:0}}>{p.name.split(' ').map(n=>n[0]).join('')}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}>{p.name}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>{p.brokerage} · {p.totalClients} clients</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:'120px'}}>
                    <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'4px'}}>{pct}% of database</div>
                    <div style={{background:'var(--surface2)',borderRadius:'4px',height:'6px',overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:'var(--accent)',borderRadius:'4px'}}/>
                    </div>
                  </div>
                  <div style={{textAlign:'right',minWidth:'60px'}}>
                    <ScoreRing score={p.avgOpp} size={32}/>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'14px',marginBottom:'14px'}}>Priority Action List</div>
            {callToday.slice(0,10).map(c => {
              const u = urgency(c.opportunity_score);
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}} onClick={() => { setQuickLook(c); }}>
                  <ScoreRing score={c.opportunity_score} size={32}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}>{c.name}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>{c.property_address || 'No address'}</div>
                  </div>
                  <div style={{fontSize:'11px',color:u.color,fontWeight:'600'}}>{nextAction(c)}</div>
                </div>
              );
            })}
            {callToday.length === 0 && <div style={{fontSize:'13px',color:'var(--text3)'}}>No clients in Call Today range.</div>}
          </div>
        </div>
      );
    }

    if (activeNav === "Settings") {
      const sections = [
        { id: "profile", label: "Profile", icon: "👤" },
        { id: "webhook", label: "Webhook", icon: "🔗" },
        { id: "sync", label: "Sync", icon: "🔄" },
        { id: "partners", label: "Partners", icon: "🤝" },
        { id: "preferences", label: "Preferences", icon: "⚙" },
      ];

      const WEBHOOK_SECRET = "PalmerHollandDashboard!@#";
      const HOMEBOT_TOKEN = process.env.REACT_APP_HOMEBOT_TOKEN || "";

      const runSync = async (partnerId = null) => {
        setSyncStatus("loading:0/?");
        try {
          if (!USE_MOCK_DATA) {
            // Call get-clients to refresh display after sync
            // The actual sync happens via Postman for large datasets
            // For dashboard refresh — just reload from Netlify Blobs
            const res = await fetch("/.netlify/functions/get-clients", {
              headers: { "Cache-Control": "no-cache" },
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            setClients(data.clients || []);
            if (data.partners) setPartnerIndex(data.partners);
            setLastRefreshed(new Date());
            setSyncStatus(`success:${data.clients?.length || 0}`);
          } else {
            setTimeout(() => { setSyncStatus("success:42"); }, 800);
          }
        } catch (err) {
          console.error("Sync error:", err);
          setSyncStatus(`error:${err.message}`);
        }
      };

      return (
        <div style={{display:'flex',gap:'20px',maxWidth:'900px'}}>
          <div style={{width:'180px',flexShrink:0}}>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden'}}>
              {sections.map(s => (
                <div key={s.id} onClick={() => setSettingsSection(s.id)}
                  style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px 14px',cursor:'pointer',background:settingsSection===s.id?'rgba(79,142,247,0.1)':'transparent',color:settingsSection===s.id?'var(--accent)':'var(--text2)',borderLeft:settingsSection===s.id?'2px solid var(--accent)':'2px solid transparent',fontSize:'13px',fontWeight:settingsSection===s.id?'500':'400',transition:'all 0.15s'}}>
                  <span>{s.icon}</span><span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{flex:1}}>

            {settingsSection === "profile" && (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>Your Profile</div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',padding:'16px',background:'var(--surface2)',borderRadius:'10px'}}>
                  <div className="avatar" style={{width:'56px',height:'56px',fontSize:'20px'}}>
                    {loProfile.name.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div>
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'16px'}}>{loProfile.name}</div>
                    <div style={{fontSize:'12.5px',color:'var(--text2)',marginTop:'2px'}}>{loProfile.title}</div>
                    {loProfile.nmls && <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>NMLS #{loProfile.nmls}</div>}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  {[
                    {label:'Full Name',value:loProfile.name},
                    {label:'Title',value:loProfile.title},
                    {label:'Email',value:loProfile.email || 'Not set'},
                    {label:'Phone',value:loProfile.phone || 'Not set'},
                    {label:'NMLS',value:loProfile.nmls || 'Not set'},
                  ].map(f => (
                    <div key={f.label} style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px'}}>
                      <div style={{fontSize:'10.5px',color:'var(--text3)',marginBottom:'4px'}}>{f.label}</div>
                      <div style={{fontSize:'13px',color:'var(--text)',fontWeight:'500'}}>{f.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:'12px',color:'var(--text3)',padding:'10px',background:'var(--surface2)',borderRadius:'8px',borderLeft:'3px solid var(--accent)'}}>
                  Profile data is pulled from your Homebot LO profile. To update, log into Homebot directly or use the Homebot API.
                </div>
              </div>
            )}

            {settingsSection === "webhook" && (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>Webhook Configuration</div>
                <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px 14px',background:'var(--surface2)',borderRadius:'8px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:USE_MOCK_DATA?'var(--yellow)':'var(--green)',flexShrink:0}}/>
                  <span style={{fontSize:'13px',color:'var(--text)'}}>{USE_MOCK_DATA ? 'Mock Data Mode — not connected to Homebot' : 'Live — receiving Homebot events'}</span>
                </div>
                <div>
                  <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'6px'}}>Your Webhook URL</div>
                  <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',fontFamily:'monospace',fontSize:'12px',color:'var(--accent)',wordBreak:'break-all'}}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/.netlify/functions/homebot-webhook` : 'https://your-site.netlify.app/.netlify/functions/homebot-webhook'}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'6px'}}>Register this URL in Homebot using Postman</div>
                  <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',fontFamily:'monospace',fontSize:'11px',color:'var(--text2)',lineHeight:'1.6',whiteSpace:'pre-wrap'}}>{`POST https://api.homebotapp.com/webhook-clients
Authorization: open-api-token-v1 YOUR_TOKEN
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "webhook-client",
    "attributes": {
      "name": "homebot-lo-dashboard",
      "url": "YOUR_NETLIFY_URL/.netlify/functions/homebot-webhook",
      "event-sources-whitelist": "home-digest,system,email,buyer-digest,calculators,listing-details"
    }
  }
}`}</div>
                </div>
                <div style={{fontSize:'11px',color:'var(--text3)',padding:'10px',background:'var(--surface2)',borderRadius:'8px',borderLeft:'3px solid var(--yellow)'}}>
                  After registering, Homebot will immediately start sending events to this URL. Make sure WEBHOOK_SECRET is set in your Netlify environment variables.
                </div>
              </div>
            )}

            {settingsSection === "sync" && (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>Sync Controls</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                  {[
                    {label:'Total Clients',value:clients.length,color:'var(--accent)'},
                    {label:'Your Clients',value:clients.filter(c=>!c.partner_id).length,color:'var(--green)'},
                    {label:'Partner Clients',value:clients.filter(c=>c.partner_id).length,color:'var(--purple)'},
                  ].map(s => (
                    <div key={s.label} style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',textAlign:'center'}}>
                      <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'24px',color:s.color}}>{s.value}</div>
                      <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}>Full Database Sync</div>
                    <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>Pull all your clients from Homebot API</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => runSync()} disabled={syncStatus && syncStatus.startsWith('loading')}>
                    {syncStatus && syncStatus.startsWith('loading') ? '⟳ Refreshing...' : '🔄 Sync Now'}
                  </button>
                </div>
                {syncStatus && syncStatus.startsWith('success') && (
                  <div style={{fontSize:'12px',color:'var(--green)',padding:'10px',background:'rgba(16,185,129,0.08)',borderRadius:'8px',borderLeft:'3px solid var(--green)'}}>
                    ✓ Sync complete — {syncStatus.split(':')[1]} clients synced
                  </div>
                )}
                {syncStatus && syncStatus.startsWith('error') && (
                  <div style={{fontSize:'12px',color:'var(--red)',padding:'10px',background:'rgba(239,68,68,0.08)',borderRadius:'8px',borderLeft:'3px solid var(--red)'}}>
                    ✗ Sync failed — {syncStatus.split(':')[1] || 'check your API token and try again'}
                    <div style={{marginTop:'6px',fontSize:'11px',color:'var(--text3)'}}>Check Netlify → Functions → sync-clients logs for details</div>
                  </div>
                )}
                <div style={{fontSize:'11px',color:'var(--text3)',padding:'10px',background:'var(--surface2)',borderRadius:'8px',borderLeft:'3px solid var(--accent)'}}>
                  <strong style={{color:'var(--text2)'}}>Sync Now</strong> — refreshes your dashboard view from stored data.<br/>
                  <strong style={{color:'var(--text2)'}}>For new clients:</strong> run the sync-clients Postman call to pull fresh data from Homebot, then click Sync Now to update the display.
                </div>

                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}>Enrich Client Data</div>
                    <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>Pull home value, equity, rate & loan data for all clients</div>
                    {enrichProgress.total > 0 && (
                      <div style={{fontSize:'11px',color:'var(--accent)',marginTop:'4px'}}>
                        {enrichProgress.enriched} enriched · {enrichProgress.remaining} remaining
                      </div>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={enrichStatus==='loading'}
                    style={{borderColor:'var(--green)',color:'var(--green)'}}
                    onClick={async () => {
                      setEnrichStatus('loading');
                      setEnrichProgress({ enriched: 0, total: 0, remaining: 0 });
                      let offset = 0;
                      let totalEnriched = 0;
                      try {
                        while (true) {
                          const res = await fetch('/.netlify/functions/enrich-clients', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'PalmerHollandDashboard!@#' },
                            body: JSON.stringify({ offset, batch_size: 15 }),
                          });
                          const data = await res.json();
                          totalEnriched += data.enriched || 0;
                          setEnrichProgress({ enriched: totalEnriched, total: data.total || 0, remaining: data.remaining || 0 });
                          if (data.done) break;
                          offset = data.next_offset;
                          await new Promise(r => setTimeout(r, 500));
                        }
                        setEnrichStatus('success');
                        if (!USE_MOCK_DATA) fetchClients.current();
                      } catch { setEnrichStatus('error'); }
                    }}>
                    {enrichStatus==='loading' ? `⟳ Enriching... (${enrichProgress.enriched}/${enrichProgress.total})` : '💎 Enrich Now'}
                  </button>
                </div>
                {enrichStatus==='success' && (
                  <div style={{fontSize:'12px',color:'var(--green)',padding:'10px',background:'rgba(16,185,129,0.08)',borderRadius:'8px',borderLeft:'3px solid var(--green)'}}>
                    ✓ Enrichment complete — home value, equity, and loan data updated for all clients
                  </div>
                )}
                {enrichStatus==='error' && (
                  <div style={{fontSize:'12px',color:'var(--red)',padding:'10px',background:'rgba(239,68,68,0.08)',borderRadius:'8px',borderLeft:'3px solid var(--red)'}}>
                    ✗ Enrichment failed — check your API token and try again
                  </div>
                )}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}>Last Refreshed</div>
                    <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{lastRefreshed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => fetchClients.current()}>↻ Refresh Now</button>
                </div>
              </div>
            )}

            {settingsSection === "partners" && (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>Connected Partners</div>
                {topPartners.length === 0 ? (
                  <div style={{fontSize:'13px',color:'var(--text3)',padding:'20px',textAlign:'center'}}>
                    No partners connected. Go to the Partners tab to add your first Realtor partner.
                  </div>
                ) : topPartners.map(p => (
                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px',background:'var(--surface2)',borderRadius:'10px'}}>
                    <div className="avatar" style={{width:'38px',height:'38px',fontSize:'13px',flexShrink:0}}>{p.name.split(' ').map(n=>n[0]).join('')}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:'600',color:'var(--text)'}}>{p.name}</div>
                      <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{p.brokerage} · {p.totalClients} clients</div>
                      {p.last_synced && <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>Last synced {fmt.date(p.last_synced)}</div>}
                    </div>
                    <div style={{display:'flex',gap:'6px',flexDirection:'column',alignItems:'flex-end'}}>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button className="btn btn-ghost btn-sm"
                          disabled={partnerSyncStatus[p.id]==='loading'}
                          onClick={() => {
                            setPartnerSyncStatus(prev => ({...prev, [p.id]: 'loading'}));
                            const doSync = async () => {
                              try {
                                if (!USE_MOCK_DATA) {
                                  const res = await fetch('/.netlify/functions/sync-clients', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'PalmerHollandDashboard!@#' },
                                    body: JSON.stringify({ partner_id: p.id, partner_name: p.name }),
                                  });
                                  const data = await res.json();
                                  setPartnerSyncStatus(prev => ({...prev, [p.id]: data.success ? `success:${data.synced}` : 'error'}));
                                } else {
                                  await new Promise(r => setTimeout(r, 1500));
                                  setPartnerSyncStatus(prev => ({...prev, [p.id]: 'success:' + p.totalClients}));
                                }
                                setPartnerLastSynced(prev => ({...prev, [p.id]: new Date().toISOString()}));
                                setTimeout(() => setPartnerSyncStatus(prev => ({...prev, [p.id]: null})), 4000);
                              } catch { setPartnerSyncStatus(prev => ({...prev, [p.id]: 'error'})); }
                            };
                            doSync();
                          }}>
                          {partnerSyncStatus[p.id]==='loading' ? '⟳ Syncing...' : '🔄 Sync Now'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedPartner(p.id); setActiveNav("Clients"); }}>View →</button>
                      </div>
                      {partnerSyncStatus[p.id] && partnerSyncStatus[p.id] !== 'loading' && (
                        <div style={{fontSize:'11px',color: partnerSyncStatus[p.id].startsWith('success') ? 'var(--green)' : 'var(--red)'}}>
                          {partnerSyncStatus[p.id].startsWith('success') ? `✓ ${partnerSyncStatus[p.id].split(':')[1]} clients synced` : '✗ Sync failed'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button className="btn btn-primary btn-sm" style={{alignSelf:'flex-start'}} onClick={() => setActiveNav("Partners")}>+ Add New Partner</button>
              </div>
            )}

            {settingsSection === "preferences" && (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'15px'}}>Dashboard Preferences</div>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <div style={{padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'6px'}}>Current Market Rate (used for refi opportunity calculation)</div>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <input
                        style={{width:'100px',background:'var(--surface3)',border:'1px solid var(--border)',borderRadius:'6px',padding:'7px 10px',color:'var(--text)',fontSize:'13px',outline:'none',fontFamily:'DM Sans,sans-serif'}}
                        value={marketRate}
                        onChange={e => setMarketRate(e.target.value)}
                      />
                      <span style={{fontSize:'13px',color:'var(--text2)'}}>% — clients above this + 0.5% are flagged for refi</span>
                    </div>
                  </div>
                  <div style={{padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'6px'}}>Auto-refresh interval</div>
                    <div style={{display:'flex',gap:'8px'}}>
                      {['30','60','120','300'].map(v => (
                        <button key={v} onClick={() => setPollInterval(v)}
                          className={`btn btn-sm ${pollInterval===v?'btn-primary':'btn-ghost'}`}>
                          {v === '30' ? '30s' : v === '60' ? '1 min' : v === '120' ? '2 min' : '5 min'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'6px'}}>BombBomb API Key</div>
                    <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                      <input
                        style={{flex:1,background:'var(--surface3)',border:'1px solid var(--border)',borderRadius:'6px',padding:'7px 10px',color:'var(--text)',fontSize:'13px',outline:'none',fontFamily:'DM Sans,sans-serif'}}
                        type="password"
                        placeholder="Paste your BombBomb API key..."
                        value={bombBombApiKey}
                        onChange={e => {
                          setBombBombApiKey(e.target.value);
                          try { localStorage.setItem('hb_bombbomb_key', e.target.value); } catch {}
                        }}
                      />
                      {bombBombApiKey && <span style={{fontSize:'11px',color:'var(--green)'}}>✓ Set</span>}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'6px'}}>
                      Find in BombBomb → Settings → Integrations → API Key. Enables the Send Video button on client profiles.
                    </div>
                  </div>

                  <div style={{padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'6px'}}>Data Mode</div>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',background:USE_MOCK_DATA?'var(--yellow)':'var(--green)'}}/>
                      <span style={{fontSize:'13px',color:'var(--text)',fontWeight:'500'}}>{USE_MOCK_DATA ? 'Mock Data' : 'Live — connected to Homebot'}</span>
                    </div>
                    {USE_MOCK_DATA && (
                      <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'6px'}}>
                        To go live: set <code style={{background:'var(--surface3)',padding:'1px 4px',borderRadius:'3px',fontSize:'11px'}}>USE_MOCK_DATA = false</code> in homebot-dashboard.jsx and push to GitHub.
                      </div>
                    )}
                  </div>
                  <div style={{padding:'14px',background:'var(--surface2)',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'8px'}}>Opportunity Score Weights</div>
                    {[
                      {label:'Likely to Sell',pct:'35%',color:'var(--orange)'},
                      {label:'Activity Score',pct:'20%',color:'var(--purple)'},
                      {label:'Refi Opportunity',pct:'15%',color:'var(--accent)'},
                      {label:'Equity Position',pct:'15%',color:'var(--green)'},
                      {label:'Trigger Recency',pct:'10%',color:'var(--yellow)'},
                      {label:'Trigger Severity',pct:'5%',color:'var(--text3)'},
                    ].map(w => (
                      <div key={w.label} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                        <div style={{width:'110px',fontSize:'12px',color:'var(--text2)'}}>{w.label}</div>
                        <div style={{flex:1,background:'var(--surface3)',borderRadius:'3px',height:'6px',overflow:'hidden'}}>
                          <div style={{width:w.pct,height:'100%',background:w.color,borderRadius:'3px'}}/>
                        </div>
                        <div style={{fontSize:'11px',color:'var(--text3)',width:'30px',textAlign:'right'}}>{w.pct}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      );
    }

    // Dashboard / Clients view
    // For Dashboard tab — always show all clients view without partner filter
    const isDashboard = activeNav === "Dashboard";

    return (
      <>
        {/* Partner Banner - only in Clients tab when partner selected */}
        {!isDashboard && PartnerBanner}

        <div className="summary-pills">
          {Object.entries(pillCounts).map(([label, count]) => (
            <div key={label} className={`pill ${activePill === label ? 'active' : ''}`} onClick={() => setActivePill(label)}>
              <div className="pill-dot" style={{background: pillColors[label]}}/>
              <span className="pill-label">{label}</span>
              <span className="pill-value">{count}</span>
            </div>
          ))}
        </div>

        {(!selectedPartner && !filterPartner) && (
          <div className="widgets-row">
            <div className="widget">
              <div className="widget-header">
                <span className="widget-title">🔥 Top Opportunities This Week</span>
                <span style={{fontSize:'11px',color:'var(--text3)'}}>By Opp Score</span>
              </div>
              <div className="widget-list">
                {topOpps.map((c, i) => {
                  const u = urgency(c.opportunity_score);
                  return (
                    <div key={c.id} className="widget-row" onClick={() => setQuickLook(c)}>
                      <span className="widget-rank">#{i+1}</span>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div className="widget-name">{c.name}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{nextAction(c)}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'Syne,sans-serif',fontWeight:'800',fontSize:'14px',color:u.color}}>{c.opportunity_score}</div>
                        <div style={{fontSize:'10px',color:u.color,marginTop:'1px'}}>{u.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="widget">
              <div className="widget-header">
                <span className="widget-title">🤝 Partner Opportunities</span>
                <span style={{fontSize:'11px',color:'var(--text3)'}}>Avg Score</span>
              </div>
              <div className="widget-list">
                {topPartners.map((p, i) => (
                  <div key={p.id} className="widget-row" onClick={() => { setSelectedPartner(p.id); setActiveNav("Partners"); }}>
                    <span className="widget-rank">#{i+1}</span>
                    <div style={{flex:1,overflow:'hidden'}}>
                      <div className="widget-name">{p.name}</div>
                      <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{p.totalClients} clients · {p.sellers} sellers</div>
                    </div>
                    <div style={{textAlign:'right',minWidth:'80px'}}>
                      <div style={{marginBottom:'4px'}}>
                        <span className="badge" style={{background:'rgba(16,185,129,0.12)',color:'var(--green)'}}>Avg {p.avgOpp}</span>
                      </div>
                      <div className="score-bar" style={{width:'80px'}}>
                        <div className="score-fill" style={{width:`${p.avgOpp}%`,background:'var(--green)'}}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="filters-row">
          <div className="search-box">
            <span style={{color:'var(--text3)',fontSize:'14px'}}>🔍</span>
            <input placeholder="Search name, address, email..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="filter-select" value={filterPartner} onChange={e => setFilterPartner(e.target.value)}>
            <option value="">All Partners</option>
            {topPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="filter-select" value={filterOpp} onChange={e => setFilterOpp(e.target.value)}>
            <option value="">All Urgency</option>
            <option value="call_today">Call Today (85+)</option>
            <option value="call_week">Call This Week (70–84)</option>
            <option value="nurture">Nurture (50–69)</option>
            <option value="monitor">Monitor (&lt;50)</option>
          </select>
          <span className="filter-count">{filtered.length} clients</span>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
          {selectedRows.size > 0 && (
            <div className="selected-actions">
              <span style={{fontSize:'12px',color:'var(--text2)'}}>{selectedRows.size} selected</span>
              <button className="btn btn-ghost btn-sm">🎬 Send Video</button>
              <button className="btn btn-primary btn-sm">📋 Log Outreach</button>
            </div>
          )}
        </div>

        <div className="table-container">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{width:'40px'}}><input type="checkbox" className="checkbox" checked={selectedRows.size===filtered.length&&filtered.length>0} onChange={toggleAll}/></th>
                  <th>Client</th>
                  <th>Partner</th>
                  <th className={sortCol==='sell_score'?'sort-active':''} onClick={()=>toggleSort('sell_score')}>Sell Score{sortCol==='sell_score'&&<span className="sort-indicator">{sortDir==='desc'?'↓':'↑'}</span>}</th>
                  <th className={sortCol==='activity'?'sort-active':''} onClick={()=>toggleSort('activity')}>Activity{sortCol==='activity'&&<span className="sort-indicator">{sortDir==='desc'?'↓':'↑'}</span>}</th>
                  <th className={sortCol==='equity_pct'?'sort-active':''} onClick={()=>toggleSort('equity_pct')}>Equity %{sortCol==='equity_pct'&&<span className="sort-indicator">{sortDir==='desc'?'↓':'↑'}</span>}</th>
                  <th>Equity $</th>
                  <th>Rate</th>
                  <th>Refi Opp</th>
                  <th>Triggers</th>
                  <th className={sortCol==='last_activity'?'sort-active':''} onClick={()=>toggleSort('last_activity')}>Last Activity{sortCol==='last_activity'&&<span className="sort-indicator">{sortDir==='desc'?'↓':'↑'}</span>}</th>
                  <th>Contacted</th>
                  <th className={sortCol==='opportunity_score'?'sort-active':''} onClick={()=>toggleSort('opportunity_score')} style={{minWidth:'100px'}}>Opp Score{sortCol==='opportunity_score'&&<span className="sort-indicator">{sortDir==='desc'?'↓':'↑'}</span>}</th>
                  <th style={{width:'80px'}}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="14">
                    <div className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <div className="empty-title">No clients found</div>
                      <div className="empty-desc">Try adjusting your filters or search term</div>
                    </div>
                  </td></tr>
                ) : filtered.map(client => {
                  const partner = topPartners.find(p => p.id === client.partner_id);
                  return (
                    <tr key={client.id} className={selectedRows.has(client.id)?'selected':''} onClick={() => setQuickLook(client)}>
                      <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="checkbox" checked={selectedRows.has(client.id)} onChange={()=>toggleRow(client.id)}/></td>
                      <td>
                        <div className="td-name">{client.name}</div>
                        <div className="td-email">{client.email}</div>
                      </td>
                      <td>
                        <div className="td-partner">
                          {partner?.name || (client.partner_id ? client.partner_id.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase()) : '—')}
                        </div>
                        <div style={{fontSize:'10.5px',color:'var(--text3)'}}>{partner?.brokerage || ''}</div>
                      </td>
                      <td>{renderClientScoreCell(client.metrics.likely_to_sell_score)}</td>
                      <td>{renderClientScoreCell(client.metrics.activity_score)}</td>
                      <td><span style={{fontFamily:'Syne,sans-serif',fontWeight:'700',color:client.metrics.equity_percent>=50?'var(--green)':'var(--text)'}}>{fmt.pct(client.metrics.equity_percent)}</span></td>
                      <td style={{color:'var(--green)',fontFamily:'Syne,sans-serif',fontWeight:'600',fontSize:'13px'}}>{fmt.currency(client.metrics.equity_amount)}</td>
                      <td><span style={{color:client.metrics.refinance_opportunity?'var(--orange)':'var(--text2)',fontFamily:'Syne,sans-serif',fontWeight:'600'}}>{fmt.rate(client.metrics.current_rate)}</span></td>
                      <td>{client.metrics.refinance_opportunity ? <span className="badge" style={{background:'rgba(59,130,246,0.12)',color:'#3b82f6'}}>✓ Yes</span> : <span style={{color:'var(--text3)'}}>—</span>}</td>
                      <td>
                        <div className="trigger-chips" style={{gap:'3px',flexWrap:'nowrap',overflow:'hidden',maxWidth:'180px'}}>
                          {client.triggers.slice(0,2).map(t => <TriggerBadge key={t} type={t}/>)}
                          {client.triggers.length > 2 && <span className="badge" style={{background:'rgba(255,255,255,0.05)',color:'var(--text3)'}}>+{client.triggers.length-2}</span>}
                        </div>
                      </td>
                      <td style={{color:'var(--text2)',fontSize:'12.5px'}}>{fmt.date(client.last_activity)}</td>
                      <td style={{color: !client.last_contacted ? 'var(--red)' : 'var(--text3)', fontSize:'12.5px'}}>{client.last_contacted ? fmt.date(client.last_contacted) : "Never"}</td>
                      <td>
                        <div className="opp-score">
                          <ScoreRing score={client.opportunity_score}/>
                          <div>
                            <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{urgency(client.opportunity_score).label}</div>
                          </div>
                        </div>
                      </td>
                      <td onClick={e=>e.stopPropagation()}>
                        <button className="quick-look-btn" onClick={()=>setQuickLook(client)}>Quick Look</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">⬛ Homebot LO</div>
            <div className="logo-sub">Opportunity Dashboard</div>
          </div>
          <div className="sidebar-nav">
            {navItems.map(item => (
              <div key={item.label} className={`nav-item ${activeNav===item.label?'active':''}`}
                onClick={() => {
                  setActiveNav(item.label);
                  // Clear partner filter when navigating away from partner view
                  if (item.label === "Dashboard" || item.label === "Clients") {
                    setSelectedPartner(null);
                    setFilterPartner("");
                    setActivePill("All Clients");
                  }
                }}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            <div className="user-card" style={{cursor:'pointer'}} onClick={() => setActiveNav("Settings")}>
              <div className="avatar" style={{width:'34px',height:'34px',fontSize:'12px',flexShrink:0}}>
                {loProfile.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div className="user-info">
                <div className="user-name">{loProfile.name}</div>
                <div className="user-role">{loProfile.title}</div>
              </div>
              <div style={{marginLeft:'auto',fontSize:'10px',color:'var(--text3)'}}>⚙</div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="main">
          <div className="topbar">
            <div>
              <span className="topbar-title">
                {activeNav === "Clients" && selectedPartner
                  ? `${topPartners.find(p=>p.id===selectedPartner)?.name || selectedPartner}'s Clients`
                  : activeNav === "Clients"
                  ? filterPartner
                    ? `${topPartners.find(p=>p.id===filterPartner)?.name || filterPartner}'s Clients`
                    : "Clients — All Partners"
                  : activeNav}
              </span>
              <span className="topbar-subtitle">
                {activeNav === "Dashboard" ? "· Turn Homebot signals into conversations" : ""}
              </span>
            </div>
            <div className="topbar-actions">
              <div className="live-dot"/>
              <span style={{fontSize:'11.5px',color:'var(--text3)'}}>
                {USE_MOCK_DATA ? "Mock Data" : `Refreshed ${lastRefreshed.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}
              </span>
              {!USE_MOCK_DATA && (
                <button className="btn btn-ghost btn-sm" onClick={() => fetchClients.current()} title="Refresh now">↻</button>
              )}
              <button className="btn btn-ghost btn-sm">🔔</button>
            </div>
          </div>
          <div className="content">
            {renderContent()}
          </div>
        </div>

        {/* Quick Look */}
        {quickLook && (
          <QuickLook
            client={quickLook}
            partner={topPartners.find(p => p.id === quickLook.partner_id)}
            onClose={() => setQuickLook(null)}
            onOutreachLogged={() => showToast('Outreach logged')}
            onAttributeTransaction={(c) => { setAttributeClient(c); setShowAttributeModal(true); setQuickLook(null); }}
            onDisposition={(c) => { setDispositionClient(c); setShowDispositionModal(true); setQuickLook(null); }}
            bombBombApiKey={bombBombApiKey}
          />
        )}

        {/* Disposition Modal */}
        {showDispositionModal && dispositionClient && (
          <DispositionModal
            client={dispositionClient}
            onClose={() => { setShowDispositionModal(false); setDispositionClient(null); }}
            onSave={(d) => showToast(`${dispositionClient.name} dispositioned as ${d.disposition.replace(/_/g,' ')}`)}
          />
        )}

        {/* Transaction Attribution Modal */}
        {showAttributeModal && attributeClient && (
          <TransactionModal
            client={attributeClient}
            onClose={() => { setShowAttributeModal(false); setAttributeClient(null); }}
            onSave={(t) => {
              showToast(`Transaction logged for ${t.client_name}`);
              setShowAttributeModal(false);
              setAttributeClient(null);
            }}
          />
        )}

        {/* Add Client Drawer */}
        {showAddClient && (
          <AddClientDrawer
            partnerId={addClientPartnerId}
            partnerName={topPartners.find(p => p.id === addClientPartnerId)?.name || "Your Account"}
            partners={topPartners}
            onClose={() => { setShowAddClient(false); setAddClientPartnerId(null); }}
            onSuccess={(client) => {
              showToast(client?.name ? `${client.name} added to Homebot` : "Client added successfully");
              if (!USE_MOCK_DATA) fetchClients.current();
            }}
          />
        )}

        {/* Toast */}
        {toast && <Toast msg={toast} onClose={() => setToast(null)}/>}
      </div>
    </>
  );
}
