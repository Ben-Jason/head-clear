import { buildPushPayload } from "@block65/webcrypto-web-push";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Setup-Key",
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
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
