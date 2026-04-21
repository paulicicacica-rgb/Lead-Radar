// ============================================
// LEAD RADAR — Feed Config
// Add as many feeds as you want here.
// Categories: legal, housing, employment, immigration, finance, general
// ============================================

const FEEDS = [

  // ── REDDIT ──────────────────────────────────────────────────────
  { id: "reddit_legaladvice_ie",    url: "https://www.reddit.com/r/LegalAdviceIreland.rss",  source: "Reddit", category: "legal",       label: "r/LegalAdviceIreland" },
  { id: "reddit_ireland",           url: "https://www.reddit.com/r/ireland.rss",              source: "Reddit", category: "general",     label: "r/ireland" },
  { id: "reddit_dublin",            url: "https://www.reddit.com/r/Dublin.rss",               source: "Reddit", category: "general",     label: "r/Dublin" },
  { id: "reddit_irishpersonalfin",  url: "https://www.reddit.com/r/irishpersonalfinance.rss", source: "Reddit", category: "finance",     label: "r/irishpersonalfinance" },
  { id: "reddit_tenants_ie",        url: "https://www.reddit.com/r/TenantRightsIreland.rss",  source: "Reddit", category: "housing",     label: "r/TenantRightsIreland" },
  { id: "reddit_immigration_ie",    url: "https://www.reddit.com/r/immigration.rss",           source: "Reddit", category: "immigration", label: "r/immigration" },
  { id: "reddit_legaladvice",       url: "https://www.reddit.com/r/legaladvice.rss",           source: "Reddit", category: "legal",       label: "r/legaladvice" },
  { id: "reddit_expats",            url: "https://www.reddit.com/r/expats.rss",                source: "Reddit", category: "immigration", label: "r/expats" },
  { id: "reddit_askireland",        url: "https://www.reddit.com/r/AskIreland.rss",            source: "Reddit", category: "general",     label: "r/AskIreland" },
  { id: "reddit_movetoireland",     url: "https://www.reddit.com/r/MoveToIreland.rss",         source: "Reddit", category: "immigration", label: "r/MoveToIreland" },

  // ── GOOGLE ALERTS (set these up at google.com/alerts → RSS output) ──
  // Replace the URLs below with your actual Google Alert RSS URLs
  // Suggested alerts to create:
  //   "solicitor Ireland"
  //   "legal advice Ireland"
  //   "need a solicitor Dublin"
  //   "personal injury Ireland"
  //   "employment law Ireland"
  //   "landlord dispute Ireland"
  //   "immigration solicitor Ireland"
  //   "accident claim Ireland"
  //   "unfair dismissal Ireland"
  //   "debt collection Ireland"
  { id: "galert_solicitor",         url: "PASTE_GOOGLE_ALERT_RSS_URL_HERE",  source: "Google Alert", category: "legal",      label: "Alert: solicitor Ireland" },
  { id: "galert_legal_advice",      url: "PASTE_GOOGLE_ALERT_RSS_URL_HERE",  source: "Google Alert", category: "legal",      label: "Alert: legal advice Ireland" },
  { id: "galert_personal_injury",   url: "PASTE_GOOGLE_ALERT_RSS_URL_HERE",  source: "Google Alert", category: "legal",      label: "Alert: personal injury Ireland" },
  { id: "galert_employment_law",    url: "PASTE_GOOGLE_ALERT_RSS_URL_HERE",  source: "Google Alert", category: "employment", label: "Alert: employment law Ireland" },
  { id: "galert_landlord_dispute",  url: "PASTE_GOOGLE_ALERT_RSS_URL_HERE",  source: "Google Alert", category: "housing",    label: "Alert: landlord dispute Ireland" },

  // ── BOARDS.IE ───────────────────────────────────────────────────
  { id: "boards_legal",             url: "https://www.boards.ie/c/legal-issues.rss",           source: "Boards.ie", category: "legal",      label: "Boards: Legal Issues" },
  { id: "boards_accommodation",     url: "https://www.boards.ie/c/accommodation.rss",          source: "Boards.ie", category: "housing",    label: "Boards: Accommodation" },
  { id: "boards_work_employment",   url: "https://www.boards.ie/c/work-employment.rss",        source: "Boards.ie", category: "employment", label: "Boards: Work & Employment" },
  { id: "boards_personal_finance",  url: "https://www.boards.ie/c/personal-finance.rss",      source: "Boards.ie", category: "finance",    label: "Boards: Personal Finance" },
  { id: "boards_immigration",       url: "https://www.boards.ie/c/immigrationvisas.rss",       source: "Boards.ie", category: "immigration",label: "Boards: Immigration" },

  // ── ADD MORE FEEDS HERE ─────────────────────────────────────────
  // { id: "unique_id", url: "https://...", source: "Source Name", category: "legal", label: "Human label" },
];

// ── IDEAL LEAD PROFILE ──────────────────────────────────────────────
// This is what gets embedded and compared against every post.
// Edit this to tune what counts as a high-score lead.
const IDEAL_LEAD_PROFILE = `
  Person in Ireland urgently needs a solicitor or legal advice.
  They have a real legal problem: personal injury, road accident, 
  employment dispute, unfair dismissal, landlord or tenant issue, 
  immigration problem, debt, criminal matter, or family law issue.
  They are asking for help, recommendations, or guidance on what to do.
  They are confused, stressed, or unsure of their rights.
  They would benefit from speaking to a qualified Irish solicitor immediately.
`;

// ── SCORE THRESHOLDS ────────────────────────────────────────────────
const THRESHOLDS = {
  HOT:   80,  // immediate action
  WARM:  65,  // worth reviewing
  COOL:  50,  // maybe relevant
  NOISE: 0,   // ignore
};

module.exports = { FEEDS, IDEAL_LEAD_PROFILE, THRESHOLDS };
