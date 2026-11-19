// Service Worker cho PWA Web Push (LonTonVocab)

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "LonTonVocab",
      body: event.data ? event.data.text() : "Bạn có nhắc nhở học từ vựng hôm nay.",
    };
  }

  const title = data.title || "LonTonVocab";
  const options = {
    body: data.body || "Bạn có nhắc nhở học từ vựng hôm nay.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "lontonvocab-reminder",
    renotify: true,
    data: {
      url: data.url || "/notifications",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const origin = self.location.origin;
      const targetUrl = targetPath.startsWith("http") ? targetPath : `${origin}${targetPath}`;

      for (const client of clientList) {
        if (client.url.startsWith(origin) && "focus" in client) {
          if ("navigate" in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
