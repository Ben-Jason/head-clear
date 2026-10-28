import { buildPushPayload } from "@block65/webcrypto-web-push";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Setup-Key, X-Feedback-Key, X-Inbox-Key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function sendToSubscription(subscription, payload, env) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const message = { data: JSON.stringify(payload), options: { ttl: 60 * 60 * 12 } };
  const init = await buildPushPayload(message, subscription, vapid);
  return fetch(subscription.endpoint, init);
}

// SAST is UTC+2 with no daylight saving, so a fixed offset is exact.
function sastToday() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
async function getConfig(env) {
  try {
    const raw = await env.SUBS.get("config");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// Constant-time string compare for the shared keys.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const FEEDBACK_PREFIX = "fb:";
const FEEDBACK_MAX_ITEMS = 100;
const FEEDBACK_TTL = 60 * 60 * 24 * 90; // notes expire after 90 days
const FEEDBACK_STATUSES = ["new", "building", "ready", "needs-info", "declined", "published"];

// The phone can only POST a note (X-Feedback-Key). Only the Mac-side routine can read
// or update them (X-Inbox-Key). Both keys are Worker secrets, never in the repo.
async function handleFeedback(request, env, url) {
  const path = url.pathname;
  if (path === "/feedback" && request.method === "POST") {
    if (!safeEqual(request.headers.get("X-Feedback-Key"), env.FEEDBACK_KEY)) return json({ error: "unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const text = body && typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) return json({ error: "note must be 1-4000 characters" }, 400);
    const existing = await env.SUBS.list({ prefix: FEEDBACK_PREFIX, limit: FEEDBACK_MAX_ITEMS + 1 });
    if (existing.keys.length > FEEDBACK_MAX_ITEMS) return json({ error: "inbox full" }, 429);
    const id = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "-" + Math.random().toString(36).slice(2, 6);
    const meta = body.meta && typeof body.meta === "object" ? { v: String(body.meta.v || "").slice(0, 20), standalone: !!body.meta.standalone } : {};
    const item = { id, text, meta, createdAt: new Date().toISOString(), status: "new" };
    await env.SUBS.put(FEEDBACK_PREFIX + id, JSON.stringify(item), { expirationTtl: FEEDBACK_TTL });
    return json({ ok: true, id });
  }
  if (path === "/feedback/mine" && request.method === "GET") {
    // The phone may see the status and one-line result of its own notes, nothing else.
    if (!safeEqual(request.headers.get("X-Feedback-Key"), env.FEEDBACK_KEY)) return json({ error: "unauthorized" }, 401);
    const list = await env.SUBS.list({ prefix: FEEDBACK_PREFIX, limit: FEEDBACK_MAX_ITEMS });
    const items = [];
    for (const k of list.keys) {
      const raw = await env.SUBS.get(k.name);
      if (!raw) continue;
      const it = JSON.parse(raw);
      items.push({ id: it.id, status: it.status, result: it.result || "", updatedAt: it.updatedAt || it.createdAt });
    }
    return json({ items });
  }
  if (!safeEqual(request.headers.get("X-Inbox-Key"), env.INBOX_KEY)) return json({ error: "unauthorized" }, 401);
  if (path === "/feedback" && request.method === "GET") {
    const want = url.searchParams.get("status");
    const list = await env.SUBS.list({ prefix: FEEDBACK_PREFIX, limit: FEEDBACK_MAX_ITEMS });
    const items = [];
    for (const k of list.keys) {
      const raw = await env.SUBS.get(k.name);
      if (!raw) continue;
      const it = JSON.parse(raw);
      if (!want || it.status === want) items.push(it);
    }
    return json({ items });
  }
  if (path === "/feedback/update" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body.id !== "string" || !FEEDBACK_STATUSES.includes(body.status)) return json({ error: "bad request" }, 400);
    const raw = await env.SUBS.get(FEEDBACK_PREFIX + body.id);
    if (!raw) return json({ error: "not found" }, 404);
    const it = JSON.parse(raw);
    it.status = body.status;
    if (typeof body.result === "string") it.result = body.result.slice(0, 1000);
    it.updatedAt = new Date().toISOString();
    await env.SUBS.put(FEEDBACK_PREFIX + body.id, JSON.stringify(it), { expirationTtl: FEEDBACK_TTL });
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/feedback" || url.pathname.startsWith("/feedback/")) {
      return handleFeedback(request, env, url);
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      // No auth here by design: this is a single-user personal worker and the
      // client is a public static page, so any key shipped to it would be
      // visible anyway. Worst case is someone overwrites the one stored
      // subscription with their own device.
      const subscription = await request.json();
      if (!subscription || !subscription.endpoint) {
        return json({ error: "invalid subscription" }, 400);
      }
      await env.SUBS.put("sub", JSON.stringify(subscription));
      return json({ ok: true });
    }

    if (url.pathname === "/config" && request.method === "POST") {
      // Only the next BCTT date is stored — nothing else about the user.
      const body = await request.json().catch(() => ({}));
      const due = body && typeof body.bcttDue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.bcttDue) ? body.bcttDue : null;
      await env.SUBS.put("config", JSON.stringify({ bcttDue: due }));
      return json({ ok: true });
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      await env.SUBS.delete("sub");
      return json({ ok: true });
    }

    if (url.pathname === "/test-send" && request.method === "POST") {
      if (!env.SETUP_KEY || url.searchParams.get("key") !== env.SETUP_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      const raw = await env.SUBS.get("sub");
      if (!raw) return json({ error: "no subscription stored" }, 404);
      const subscription = JSON.parse(raw);
      const res = await sendToSubscription(
        subscription,
        { title: "Head Clear", body: "Test reminder — tap to open Head Clear.", tag: "headclear-test" },
        env
      );
      return json({ ok: res.ok, status: res.status, body: await res.text() });
    }

    return json({ ok: true, service: "head-clear-reminders" });
  },

  async scheduled(event, env) {
    const raw = await env.SUBS.get("sub");
    if (!raw) return; // nobody has enabled reminders yet

    const subscription = JSON.parse(raw);
    const isMorning = event.cron === "0 6 * * *";
    let payload;
    if (isMorning) {
      let body = "Log how you slept and how you feel after yesterday's session.";
      const cfg = await getConfig(env);
      if (cfg.bcttDue) {
        const n = daysBetween(sastToday(), cfg.bcttDue); // days until the BCTT retest
        if (n === 1) body += " BCTT retest is tomorrow.";
        else if (n === 0) body += " BCTT retest is due today.";
        else if (n === -2) body += " Your BCTT retest is 2 days overdue.";
      }
      payload = { title: "Head Clear — morning check-in", body, tag: "headclear-am" };
    } else {
      payload = {
        title: "Head Clear — evening check-in",
        body: "Log today's symptoms and sessions, and take your evening medication. Screens off soon.",
        tag: "headclear-pm",
      };
    }

    const res = await sendToSubscription(subscription, payload, env);
    if (!res.ok && (res.status === 404 || res.status === 410)) {
      // subscription expired/revoked on the push service's end — clear it
      await env.SUBS.delete("sub");
    }
  },
};
