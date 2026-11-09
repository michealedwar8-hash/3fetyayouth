try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (err) {
  // Ignore if OneSignal CDN script is blocked or unavailable
}
// Official Service Worker for Three Youths (الثلاثة فتية)
// Supports OneSignal Web Push (Android & iOS 16.4+ PWA) + Native Web Push API & Background Notification Watcher

let swUserContext = null;
const swNotifiedIds = new Set();
let swPollTimer = null;
let swApiAvailable = true;

function isAnnouncementTargetedForSwUser(ann, user) {
  if (!ann || !ann.id) return false;
  const role = user?.role || "member";
  const memberId = user?.id || "";
  const fullName = (user?.fullName || "").trim();
  const gender = user?.gender || "male";
  const isOwner = role === "community_owner";

  // 1. Special Visitation Assignment Alert: Strictly ONLY for the assigned servant
  if (
    ann.isVisitationTaskAlert ||
    ann.targetAudience === "servant_personal" ||
    (ann.title && ann.title.includes("تكليف افتقاد") && (ann.targetUserId || ann.targetServantName))
  ) {
    if (isOwner) return false;
    if (!memberId && !fullName) return false;
    const targetName = (ann.targetServantName || "").trim();
    return Boolean(
      (ann.targetUserId && memberId && ann.targetUserId === memberId) ||
      (targetName && fullName && (fullName === targetName || fullName.includes(targetName) || targetName.includes(fullName)))
    );
  }

  // 2. Community Owner Only alert
  if (ann.targetAudience === "community_owner_only" || (ann.title && ann.title.startsWith("🔄 تحديث بيانات:"))) {
    return isOwner;
  }

  // Don't notify the sender of their own announcement
  if (fullName && ann.senderName && fullName === ann.senderName.trim()) {
    return false;
  }

  if (!ann.targetAudience || ann.targetAudience === "all") return true;
  if (ann.targetAudience === "males_only") return gender === "male";
  if (ann.targetAudience === "females_only") return gender === "female";

  return true;
}

async function checkServerAnnouncementsInBackground() {
  if (!swApiAvailable) return;
  try {
    // Only need Service Worker background check when no client window is currently focused/visible
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const anyVisible = clientList.some((c) => c.visibilityState === "visible");
    if (anyVisible) return;

    const res = await fetch("/api/data", { cache: "no-store" });
    const contentType = (res.headers && res.headers.get("content-type")) || "";
    if (!res.ok || !contentType.includes("application/json")) {
      // Running on static hosting (Cloudflare Pages) without Express /api/data
      swApiAvailable = false;
      if (swPollTimer) {
        clearInterval(swPollTimer);
        swPollTimer = null;
      }
      return;
    }
    const body = await res.json();
    const announcements = body?.data?.announcements;
    if (!Array.isArray(announcements) || announcements.length === 0) return;

    const latest = announcements[0];
    if (!latest || !latest.id || swNotifiedIds.has(latest.id)) return;

    // Only notify for announcements created within the last 15 minutes
    const createdMs = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;
    if (Date.now() - createdMs > 15 * 60 * 1000) {
      swNotifiedIds.add(latest.id);
      return;
    }

    if (swUserContext && !isAnnouncementTargetedForSwUser(latest, swUserContext)) {
      swNotifiedIds.add(latest.id);
      return;
    }

    swNotifiedIds.add(latest.id);

    const firstName = (swUserContext?.fullName || "أخي الحبيب").trim().split(/\s+/)[0];
    const formattedBody = (latest.content || "")
      .replace(/\[الاسم الأول\]/g, firstName)
      .replace(/\[الاسم الاول\]/g, firstName)
      .replace(/\[الاسم\]/g, firstName)
      .replace(/\bفلان\b/g, firstName);

    const senderName = latest.senderName || "اجتماع الثلاثة فتية 🕊️";
    const isPriestWithPhoto = latest.senderRole === "priest" && latest.senderPhotoUrl;
    const iconUrl = isPriestWithPhoto ? latest.senderPhotoUrl : "/site-logo.png";

    const notifOptions = {
      body: formattedBody,
      icon: iconUrl,
      badge: "/site-badge.png",
      tag: latest.id,
      renotify: false,
      requireInteraction: false,
      silent: false,
      dir: "rtl",
      lang: "ar",
      vibrate: [120],
      data: {
        url: `/?annId=${encodeURIComponent(latest.id)}`,
        announcementId: latest.id
      }
    };

    if (latest.imageUrl) {
      notifOptions.image = latest.imageUrl;
    }

    await self.registration.showNotification(`${senderName}: ${latest.title || "إعلان جديد"}`, notifOptions);
  } catch {
    // Ignore transient offline errors in background check
  }
}

function startBackgroundWatcher() {
  if (swPollTimer || !swApiAvailable) return;
  swPollTimer = setInterval(checkServerAnnouncementsInBackground, 6000);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  startBackgroundWatcher();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  startBackgroundWatcher();
});

// Listen for client requests to trigger a native phone notification shade banner or sync user context
self.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload) return;

  if (payload.type === "SYNC_SW_USER_CONTEXT") {
    swUserContext = payload.user || null;
    if (Array.isArray(payload.seenIds)) {
      payload.seenIds.forEach((id) => swNotifiedIds.add(id));
    }
    startBackgroundWatcher();
    return;
  }

  if (payload.type === "MARK_ANNOUNCEMENT_NOTIFIED" && payload.announcementId) {
    swNotifiedIds.add(payload.announcementId);
    return;
  }

  if (payload.type !== "SHOW_NATIVE_NOTIFICATION") return;

  const annId = payload.announcementId || (payload.options && payload.options.tag) || `ann_${Date.now()}`;
  if (swNotifiedIds.has(annId)) {
    return;
  }
  swNotifiedIds.add(annId);

  const title = payload.title || "📢 إعلان جديد - الثلاثة فتية";
  const incomingOpts = payload.options || {};
  const options = {
    body: payload.body || incomingOpts.body || "",
    icon: payload.icon || incomingOpts.icon || "/site-logo.png",
    badge: payload.badge || incomingOpts.badge || "/site-badge.png",
    tag: payload.tag || incomingOpts.tag || annId,
    renotify: false,
    requireInteraction: false,
    silent: false,
    dir: "rtl",
    lang: "ar",
    vibrate: [120],
    data: {
      url: payload.url || (incomingOpts.data && incomingOpts.data.url) || "/",
      announcementId: payload.announcementId || (incomingOpts.data && incomingOpts.data.announcementId) || null,
      imageUrl: payload.image || incomingOpts.image || null
    }
  };

  if (payload.image || incomingOpts.image) {
    options.image = payload.image || incomingOpts.image;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicking the notification in the phone's notification shade
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || "/";
  const announcementId = notifData.announcementId || null;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICKED",
            announcementId,
            url: targetUrl
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        const openUrl = announcementId
          ? `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}annId=${encodeURIComponent(announcementId)}`
          : targetUrl;
        return self.clients.openWindow(openUrl);
      }
    })
  );
});
