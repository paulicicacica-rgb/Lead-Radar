// ============================================
// LEAD RADAR — Scorer Service
// Reads from queue:score, embeds each post,
// scores against ideal lead profile, stores result
// ============================================

const { IDEAL_LEAD_PROFILE, THRESHOLDS } = require("../config/feeds");

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
  async rpop(key)              { return await this.cmd("RPOP", key); }
  async lpush(key, val)        { return await this.cmd("LPUSH", key, val); }
  async llen(key)              { return await this.cmd("LLEN", key); }
  async ltrim(key, start, stop){ return await this.cmd("LTRIM", key, start, stop); }
  async set(key, val, ttlSecs) { return ttlSecs ? await this.cmd("SET", key, val, "EX", ttlSecs) : await this.cmd("SET", key, val); }
}

// ── GEMINI EMBEDDINGS ───────────────────────────────────────────────
async function embed(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: text.slice(0, 2000) }] }
      })
    }
  );
  const data = await res.json();
  if (!data.embedding) throw new Error("Gemini embed failed: " + JSON.stringify(data));
  return data.embedding.values;
}

// ── COSINE SIMILARITY ───────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function getLabel(score) {
  if (score >= THRESHOLDS.HOT)  return "HOT";
  if (score >= THRESHOLDS.WARM) return "WARM";
  if (score >= THRESHOLDS.COOL) return "COOL";
  return "NOISE";
}

// ── MAIN SCORER ─────────────────────────────────────────────────────
async function score() {
  const redis = new RedisClient();

  // Embed the ideal lead profile once per run
  console.log("[SCORER] Embedding ideal lead profile...");
  const idealVector = await embed(IDEAL_LEAD_PROFILE);

  const queueLen = await redis.llen("queue:score");
  console.log(`[SCORER] ${queueLen} posts to score`);

  if (queueLen === 0) {
    console.log("[SCORER] Queue empty, nothing to do.");
    return;
  }

  let processed = 0;
  let hot = 0;

  while (true) {
    const raw = await redis.rpop("queue:score");
    if (!raw) break;

    let post;
    try {
      post = JSON.parse(raw);
    } catch {
      continue;
    }

    try {
      // Embed the post title + text combined
      const postText = `${post.title} ${post.text}`.trim();
      const postVector = await embed(postText);

      // Cosine similarity → 0 to 100
      const sim = cosineSim(idealVector, postVector);
      const score = Math.round(((sim + 1) / 2) * 100); // normalize -1..1 → 0..100

      post.score     = score;
      post.scoreLabel = getLabel(score);
      post.scoredAt  = new Date().toISOString();

      // Only store if above noise threshold
      if (score >= THRESHOLDS.COOL) {
        // Push to leads list (keep last 500)
        await redis.lpush("leads:all", JSON.stringify(post));
        await redis.ltrim("leads:all", 0, 499);

        // Also push to category-specific list
        await redis.lpush(`leads:${post.category}`, JSON.stringify(post));
        await redis.ltrim(`leads:${post.category}`, 0, 199);

        if (score >= THRESHOLDS.HOT) {
          await redis.lpush("leads:hot", JSON.stringify(post));
          await redis.ltrim("leads:hot", 0, 99);
          hot++;
        }

        console.log(`[SCORER] ${post.scoreLabel} (${score}) — ${post.label}: ${post.title?.slice(0, 60)}`);
      }

      processed++;

      // Small delay to respect Gemini rate limits (free tier: 1500 req/day)
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`[SCORER] Failed to score post: ${err.message}`);
    }
  }

  await redis.set("meta:lastScored", new Date().toISOString());
  console.log(`[SCORER] Done. Processed: ${processed} | Hot leads: ${hot}`);
}

score().catch(console.error);
