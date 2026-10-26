// Bump V on every release, and bump the ?v= on the css/js links in index.html to match.
// A new CACHE name makes the browser install a complete, consistent set of files at once,
// so an old cached index.html can never be paired with newer scripts.
const V = "4";
const CACHE = "headclear-v" + V;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=" + V,
  "./js/core.js?v=" + V,
  "./js/today.js?v=" + V,
  "./js/daily.js?v=" + V,
  "./js/train.js?v=" + V,
  "./js/tests.js?v=" + V,
  "./js/plan.js?v=" + V,
  "./js/history.js?v=" + V,
  "./js/report.js?v=" + V,
  "./js/info.js?v=" + V,
  "./js/boot.js?v=" + V,
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the app shell, falling back to network; successful network
// responses top up the cache so the app keeps working offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- push reminders ----------
self.addEventListener("push", (e) => {
  let data = { title: "Head Clear", body: "Time for your check-in.", tag: "headclear" };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
