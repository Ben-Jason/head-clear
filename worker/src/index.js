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
    const payload = isMorning
      ? { title: "Head Clear — morning check-in", body: "Log your wake-up habits and how you're feeling today.", tag: "headclear-am" }
      : { title: "Head Clear — evening check-in", body: "Log today's symptoms, journal, and rhythm before bed.", tag: "headclear-pm" };

    const res = await sendToSubscription(subscription, payload, env);
    if (!res.ok && (res.status === 404 || res.status === 410)) {
      // subscription expired/revoked on the push service's end — clear it
      await env.SUBS.delete("sub");
    }
  },
};
