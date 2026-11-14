/* eslint-disable no-restricted-globals */
// Official Service Worker for الثلاثة فتية - اجتماع الشباب السوداني (sw.js & OneSignalSDKWorker.js)
// Enforces Network-Only (no-store) for all API & Cloudflare Database requests and instant auto-update on iOS & Android PWAs

const SW_VERSION = "v21_live_sync";
const CACHE_NAME = `3fetya-pwa-${SW_VERSION}`;
const OFFICIAL_NOTIFICATION_TITLE = "الثلاثة فتية - اجتماع الشباب السوداني";
const DEFAULT_BADGE_URL = "/icon-192x192.png?v=3";
const DEFAULT_COLOR_ICON_URL = "/icon-192x192.png?v=3";

const notifiedAnnouncementIds = new Set();

function resolveSenderNotificationIcon(senderRole, senderPhotoUrl) {
  if (
    senderRole === "priest" &&
    typeof senderPhotoUrl === "string" &&
    senderPhotoUrl.trim() !== ""
  ) {
    return senderPhotoUrl.trim();
  }
  return DEFAULT_COLOR_ICON_URL;
}

// 1. Install: Immediately skipWaiting so iOS & Android PWAs activate new code without uninstalling
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((name) => caches.delete(name)))
    )
  );
});

// 2. Activate: Purge ALL old caches and immediately claim all open PWA clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
            return Promise.resolve();
          })
        );
      } catch (_err) {
        // ignore cache delete errors
      }
      await self.clients.claim();
    })()
  );
});

// 3. Fetch: Strictly Network-Only (no-store) for all API / Cloudflare Worker / dynamic requests
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!req || req.method !== "GET") {
    return;
  }

  let url;
  try {
    url = new URL(req.url);
  } catch (_e) {
    return;
  }

  // Strictly Network-Only for any API route, Cloudflare Worker, OneSignal, or query-busted endpoint
  const isApiOrCloudflare =
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("cloudflare") ||
    url.hostname.includes("onesignal.com") ||
    url.searchParams.has("t") ||
    url.searchParams.has("v");

  if (isApiOrCloudflare) {
    event.respondWith(
      fetch(req, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      })
    );
    return;
  }

  // For HTML navigation & JS/CSS bundles: Network-First with cache: 'no-cache' so iOS Home Screen PWA always runs latest code
  if (
    req.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-cache" }).catch(() => caches.match(req))
    );
  }
});

// 4. Native Web Push listener
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      if (event.data) {
        try {
          payload = event.data.json();
        } catch (_e) {
          try {
            payload = { body: event.data.text() };
          } catch (_e2) {
            payload = {};
          }
        }
      }

      const customData =
        (payload.custom && payload.custom.a) ||
        payload.data ||
        payload.additionalData ||
        {};

      const rawBody =
        payload.alert ||
        payload.body ||
        payload.message ||
        payload.contents?.ar ||
        payload.contents?.en ||
        customData.body ||
        customData.message ||
        "إشعار جديد من اجتماع الثلاثة فتية القديسين";

      const annId =
        customData.announcementId ||
        payload.announcementId ||
        payload.tag ||
        `push_${Date.now()}`;

      const senderRole = customData.senderRole || payload.senderRole || "";
      const senderPhotoUrl =
        customData.senderPhotoUrl || payload.senderPhotoUrl || "";

      const iconUrl = resolveSenderNotificationIcon(senderRole, senderPhotoUrl);
      const badgeUrl = DEFAULT_BADGE_URL;
      const targetUrl =
        customData.url ||
        (customData.launchURL ? customData.launchURL : null) ||
        (annId && String(annId).startsWith("ann_")
          ? `/?annId=${encodeURIComponent(annId)}`
          : "/");

      const notifOptions = {
        body: String(rawBody),
        icon: iconUrl,
        badge: badgeUrl,
        tag: `ann_${annId}`,
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        dir: "rtl",
        lang: "ar",
        data: {
          url: targetUrl,
          announcementId: annId,
        },
      };

      const imageUrl =
        customData.imageUrl ||
        payload.image ||
        payload.big_picture ||
        payload.chrome_web_image;
      if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        notifOptions.image = imageUrl;
      }

      notifiedAnnouncementIds.add(String(annId));
      await self.registration.showNotification(
        OFFICIAL_NOTIFICATION_TITLE,
        notifOptions
      );

      // Tell any open PWA clients to sync live from Cloudflare D1 immediately
      try {
        const clientList = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          client.postMessage({
            type: "FORCE_CLOUDFLARE_SYNC",
            announcementId: annId,
          });
        }
      } catch (_err) {
        // ignore
      }
    })()
  );
});

// 5. Client postMessage handler (SKIP_WAITING, CLEAR_ALL_CACHES, SHOW_NATIVE_NOTIFICATION)
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "CLEAR_ALL_CACHES") {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
    );
    return;
  }

  if (data.type === "MARK_ANNOUNCEMENT_NOTIFIED" && data.announcementId) {
    notifiedAnnouncementIds.add(String(data.announcementId));
    return;
  }

  if (data.type === "SHOW_NATIVE_NOTIFICATION") {
    const annId =
      data.announcementId ||
      (data.options && data.options.data && data.options.data.announcementId) ||
      null;

    if (annId && !data.force && notifiedAnnouncementIds.has(String(annId))) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ ok: true, deduplicated: true });
      }
      return;
    }
    if (annId) {
      notifiedAnnouncementIds.add(String(annId));
    }

    const baseOpts = data.options || {};
    const senderRole = data.senderRole || baseOpts.senderRole || "";
    const senderPhotoUrl = data.senderPhotoUrl || baseOpts.senderPhotoUrl || "";
    const resolvedIcon =
      baseOpts.icon || resolveSenderNotificationIcon(senderRole, senderPhotoUrl);

    const options = Object.assign({}, baseOpts, {
      body: data.body || baseOpts.body || "",
      badge: baseOpts.badge || DEFAULT_BADGE_URL,
      icon: resolvedIcon,
      dir: "rtl",
      lang: "ar",
      renotify: true,
      vibrate: [200, 100, 200],
    });

    event.waitUntil(
      self.registration
        .showNotification(OFFICIAL_NOTIFICATION_TITLE, options)
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ ok: true });
          }
        })
        .catch((err) => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ ok: false, error: String(err) });
          }
        })
    );
  }
});

// 6. Notification Click Handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || "/";
  const announcementId = notifData.announcementId || null;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({
              type: "NOTIFICATION_CLICKED",
              announcementId,
              url: targetUrl,
            });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// Load OneSignal Worker SDK if available
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (_e) {
  // Continue smoothly with native push & cache-free SW
}
