// ============================================
// LEAD RADAR — Sarah Drafter
// Takes hot/warm leads, generates response drafts
// Stores draft alongside the lead in Redis
// ============================================

const RESPONSE_PERSONA = `
You are Sarah, a helpful assistant for eSolicitors.ie — a free service that connects 
people in Ireland with qualified solicitors. You write genuinely helpful, warm, 
human-sounding responses to people who have posted legal questions online.

RULES:
- Never sound like an ad or spam
- Always address their specific situation directly
- Give 1-2 sentences of genuinely useful info first
- Then naturally mention eSolicitors.ie as a free resource
- Keep it under 120 words
- Sound like a knowledgeable friend, not a salesperson
- No exclamation marks, no "Great question!", no cringe
- End with a clear but soft CTA

ESOLICITORS.IE: Free service. User fills a short form, gets matched with a 
qualified Irish solicitor for a free initial consultation.
`;

const CATEGORY_CONTEXT = {
  legal:       "Irish law, solicitors, legal disputes, court procedures",
  housing:     "Irish tenancy law, RTB, landlord disputes, deposit returns, HAP",
  employment:  "WRC, unfair dismissal, employment rights, redundancy, Irish employment law",
  immigration: "Irish immigration, IRP, visa, residency, citizenship",
  finance:     "Irish debt law, revenue, personal insolvency, MABS",
  general:     "general Irish legal and consumer rights",
};

class RedisClient {
  constructor() {
    this.url   = process.env.UPSTASH_REDIS_REST_URL;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  async cmd(...args) {
    const res = await fetch(`${this.url}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }
  async lrange(key, s, e) { return await this.cmd("LRANGE", key, s, e); }
  async lset(key, i, val) { return await this.cmd("LSET", key, i, val); }
  async llen(key)         { return await this.cmd("LLEN", key); }
  async lpush(key, val)   { return await this.cmd("LPUSH", key, val); }
  async ltrim(key, s, e)  { return await this.cmd("LTRIM", key, s, e); }
}

// ── CLAUDE API DRAFT ────────────────────────────────────────────────
async function draftResponse(post) {
  const context = CATEGORY_CONTEXT[post.category] || "Irish legal matters";

  const prompt = `
Context: ${context}

Someone posted this online:
Title: "${post.title}"
Post: "${post.text?.slice(0, 600)}"
Source: ${post.source} (${post.label})

Write a helpful reply as Sarah from eSolicitors.ie.
`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: RESPONSE_PERSONA,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  if (!data.content?.[0]?.text) throw new Error("Claude API failed");
  return data.content[0].text.trim();
}

// ── MAIN DRAFTER ─────────────────────────────────────────────────────
async function draft() {
  const redis = new RedisClient();

  // Get hot + warm leads that don't have a draft yet
  const raw = await redis.lrange("leads:all", 0, 49); // latest 50
  if (!raw || raw.length === 0) {
    console.log("[DRAFTER] No leads found.");
    return;
  }

  let drafted = 0;

  for (let i = 0; i < raw.length; i++) {
    let post;
    try { post = JSON.parse(raw[i]); } catch { continue; }

    // Skip if already has draft or score too low
    if (post.draft) continue;
    if (post.score < 65) continue;

    try {
      console.log(`[DRAFTER] Drafting for: ${post.title?.slice(0, 60)}`);
      const draft = await draftResponse(post);
      post.draft = draft;
      post.draftedAt = new Date().toISOString();

      // Update in-place in Redis list
      await redis.lset("leads:all", i, JSON.stringify(post));

      // Also push to approval queue
      await redis.lpush("queue:approval", JSON.stringify(post));
      await redis.ltrim("queue:approval", 0, 199);

      drafted++;
      console.log(`[DRAFTER] ✓ Drafted (${post.score}) ${post.label}`);

      // Delay between Claude calls
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`[DRAFTER] Failed: ${err.message}`);
    }
  }

  console.log(`[DRAFTER] Done. Drafted: ${drafted}`);
}

draft().catch(console.error);
