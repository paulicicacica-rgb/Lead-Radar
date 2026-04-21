// ============================================
// LEAD RADAR — Poller Service
// Fetches all RSS feeds, deduplicates, queues new posts
// ============================================

const { FEEDS } = require("../config/feeds");

// ── REDIS CLIENT ────────────────────────────────────────────────────
// Uses Upstash Redis via HTTP (works from anywhere, no native driver needed)
class RedisClient {
  constructor() {
    this.url   = process.env.UPSTASH_REDIS_REST_URL;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!this.url || !this.token) throw new Error("Missing Upstash env vars");
  }

  async cmd(...args) {
    const res = await fetch(`${this.url}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async exists(key)              { return await this.cmd("EXISTS", key); }
  async set(key, val, ttlSecs)   { return ttlSecs ? await this.cmd("SET", key, val, "EX", ttlSecs) : await this.cmd("SET", key, val); }
  async lpush(key, val)          { return await this.cmd("LPUSH", key, val); }
  async lrange(key, start, stop) { return await this.cmd("LRANGE", key, start, stop); }
  async llen(key)                { return await this.cmd("LLEN", key); }
}

// ── RSS PARSER ──────────────────────────────────────────────────────
async function parseFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "LeadRadar/1.0 RSS Reader" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseXML(xml, feed);
  } catch (err) {
    console.error(`[POLLER] Failed ${feed.label}: ${err.message}`);
    return [];
  }
}

function parseXML(xml, feed) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i"));
      return m ? (m[1] || m[2] || "").trim() : "";
    };

    const title   = get("title");
    const link    = get("link") || get("guid");
    const pubDate = get("pubDate") || get("published") || get("updated");
    const desc    = get("description") || get("summary") || get("content:encoded");

    if (!title && !desc) continue;

    // Generate stable ID from URL or title
    const id = `${feed.id}::${link || title}`.replace(/\s+/g, "_").slice(0, 200);

    items.push({
      id,
      feedId:    feed.id,
      source:    feed.source,
      category:  feed.category,
      label:     feed.label,
      title:     title,
      text:      stripHTML(desc || title).slice(0, 1000),
      url:       link,
      pubDate:   pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      score:     null, // filled by scorer service
    });
  }

  return items;
}

function stripHTML(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── MAIN POLL FUNCTION ──────────────────────────────────────────────
async function poll() {
  const redis = new RedisClient();
  console.log(`[POLLER] Starting poll of ${FEEDS.length} feeds...`);

  let totalNew = 0;
  let totalSkipped = 0;

  // Filter out unconfigured Google Alert placeholders
  const activeFeed = FEEDS.filter(f => !f.url.includes("PASTE_GOOGLE_ALERT"));

  for (const feed of activeFeed) {
    const items = await parseFeed(feed);
    let newCount = 0;

    for (const item of items) {
      const seenKey = `seen::${item.id}`;
      const alreadySeen = await redis.exists(seenKey);

      if (alreadySeen) {
        totalSkipped++;
        continue;
      }

      // Mark as seen (7 day TTL)
      await redis.set(seenKey, "1", 60 * 60 * 24 * 7);

      // Push to scoring queue
      await redis.lpush("queue:score", JSON.stringify(item));

      newCount++;
      totalNew++;
    }

    if (newCount > 0) {
      console.log(`[POLLER] ${feed.label}: +${newCount} new`);
    }
  }

  // Update poll metadata
  await redis.set("meta:lastPoll", new Date().toISOString());
  await redis.set("meta:totalNew", totalNew);

  const queueLen = await redis.llen("queue:score");
  console.log(`[POLLER] Done. New: ${totalNew} | Skipped: ${totalSkipped} | Queue: ${queueLen}`);
}

// ── RUN ─────────────────────────────────────────────────────────────
poll().catch(console.error);
