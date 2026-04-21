// ============================================
// LEAD RADAR — API Server
// Simple Express server serving leads to dashboard
// Deploy on same VPS as poller
// ============================================

const http = require("http");
const url  = require("url");

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
  async get(key)          { return await this.cmd("GET", key); }
  async llen(key)         { return await this.cmd("LLEN", key); }
  async lset(key, i, val) { return await this.cmd("LSET", key, i, val); }
}

const redis = new RedisClient();

function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data));
}

async function router(req, res) {
  const { pathname, query } = url.parse(req.url, true);

  // CORS preflight
  if (req.method === "OPTIONS") return json(res, {});

  // ── GET /api/leads ───────────────────────────────────────────────
  if (pathname === "/api/leads" && req.method === "GET") {
    const limit    = parseInt(query.limit)    || 50;
    const minScore = parseInt(query.minScore) || 0;
    const category = query.category || null;

    const listKey = category ? `leads:${category}` : "leads:all";
    const raw = await redis.lrange(listKey, 0, limit - 1);
    const leads = (raw || [])
      .map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean)
      .filter(l => l.score >= minScore);

    return json(res, { leads, count: leads.length });
  }

  // ── GET /api/queue ───────────────────────────────────────────────
  // Approval queue — leads with drafts ready to review
  if (pathname === "/api/queue" && req.method === "GET") {
    const raw = await redis.lrange("queue:approval", 0, 49);
    const leads = (raw || [])
      .map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean);
    return json(res, { leads, count: leads.length });
  }

  // ── GET /api/stats ───────────────────────────────────────────────
  if (pathname === "/api/stats" && req.method === "GET") {
    const [allLen, hotLen, queueLen, lastPoll, lastScored] = await Promise.all([
      redis.llen("leads:all"),
      redis.llen("leads:hot"),
      redis.llen("queue:approval"),
      redis.get("meta:lastPoll"),
      redis.get("meta:lastScored"),
    ]);
    return json(res, { allLen, hotLen, queueLen, lastPoll, lastScored });
  }

  // ── POST /api/approve ────────────────────────────────────────────
  // Mark a lead as actioned
  if (pathname === "/api/approve" && req.method === "POST") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", async () => {
      try {
        const { leadId, action } = JSON.parse(body); // action: "posted" | "skipped"
        // In a full build: update lead status, log to Redis
        // For now: acknowledge
        return json(res, { ok: true, leadId, action });
      } catch {
        return json(res, { error: "Bad request" }, 400);
      }
    });
    return;
  }

  return json(res, { error: "Not found" }, 404);
}

const PORT = process.env.PORT || 3001;
http.createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (err) {
    console.error("[API]", err);
    json(res, { error: "Internal error" }, 500);
  }
}).listen(PORT, () => {
  console.log(`[API] Running on port ${PORT}`);
});
