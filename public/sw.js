const CACHE = "hpo-chat-v2";
const PRECACHE = ["/", "/chat", "/login", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for API and WS; cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  ) {
    return; // Always network for dynamic routes
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Push notification
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "HPO Chat", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "HPO Chat", {
      body: data.body || "New message",
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url || "/chat" },
      vibrate: [200, 100, 200],
      tag: data.tag || "hpo-message",
      renotify: true,
    })
  );
});

// Notification click — focus existing tab or open new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/chat";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return clients.openWindow(target);
      })
  );
});
