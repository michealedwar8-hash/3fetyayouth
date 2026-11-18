import type { Registrant, UserRole } from '../types';

const ONESIGNAL_APP_ID = '195c5a47-9662-45ce-886a-e048636af0c1';
const VAPID_PUBLIC_KEY =
  'BGbv4i2BfU6a-nfOd49_-ykPhchNeGSvSHLNSxt6PhyY2jZNlpsWkUETRyNsm7bSmrOMk5o883cDsqy1aifX6Cw';
const VAPID_HUB_V1_EXT_ID = 'three_youths_vapid_hub_v1';
const VAPID_HUB_V2_EXT_ID = 'three_youths_vapid_hub_v2';
const ANNOUNCEMENTS_HUB_EXT_ID = 'three_youths_announcements_hub_v1';

export const OFFICIAL_NOTIFICATION_TITLE = 'الثلاثة فتية - اجتماع الشباب السوداني';

const COLOR_EMBLEM_URL = '/icon-192x192.png?v=3';
const NOTIFICATION_BADGE_URL = '/icon-192x192.png?v=3';
const NOTIFICATION_COLOR_ICON_URL = '/icon-192x192.png?v=3';

const PUSH_ENABLED_STORAGE_KEY = 'three_youths_push_enabled_v1';
const SUB_META_STORAGE_KEY = 'three_youths_vapid_sub_meta_v2';

let lastSyncedUserFingerprint = '';
const playedChimeIds = new Set<string>();
const sessionNotifiedIds = new Set<string>();
const pushStateListeners = new Set<() => void>();

function notifyPushStateListeners(): void {
  pushStateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function fnv1aHashHex(str: string): { hex: string; bucket: number } {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    hex: hash.toString(16).padStart(8, '0'),
    bucket: hash % 2,
  };
}

function doesSubscriptionMatchVapidKey(
  sub: PushSubscription,
  expectedKeyBytes: Uint8Array
): boolean {
  try {
    const subKeyBuf = sub.options?.applicationServerKey;
    if (!subKeyBuf) return false;
    const actualBytes = new Uint8Array(subKeyBuf);
    if (actualBytes.length !== expectedKeyBytes.length) return false;
    for (let i = 0; i < actualBytes.length; i++) {
      if (actualBytes[i] !== expectedKeyBytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface PushSubscriberMeta {
  id?: string;
  memberId?: string;
  name?: string;
  fullName?: string;
  role?: string;
  gender?: 'male' | 'female' | string;
  uniqueCode?: string;
}

export function getSavedSubscriberMeta(): PushSubscriberMeta {
  try {
    const raw = localStorage.getItem(SUB_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  try {
    const memberRaw =
      sessionStorage.getItem('three_youths_member_session') ||
      localStorage.getItem('three_youths_remembered_user');
    if (memberRaw) {
      const m = JSON.parse(memberRaw);
      if (m && (m.id || m.fullName)) {
        return {
          id: m.id,
          memberId: m.id,
          name: String(m.fullName || '').trim().split(/\s+/)[0] || '',
          fullName: m.fullName || '',
          role: m.role || 'member',
          gender: m.gender || 'male',
          uniqueCode: m.uniqueCode || '',
        };
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveSubscriberMeta(meta: PushSubscriberMeta): PushSubscriberMeta {
  const prev = getSavedSubscriberMeta();
  const fullName = String(meta.fullName || prev.fullName || meta.name || prev.name || '').trim();
  const firstName = String(
    meta.name || (fullName ? fullName.split(/\s+/)[0] : '') || prev.name || ''
  ).trim();
  const resolvedId = String(meta.id || meta.memberId || prev.id || prev.memberId || '');
  const merged: PushSubscriberMeta = {
    id: resolvedId,
    memberId: resolvedId,
    name: firstName,
    fullName,
    role: meta.role || prev.role || 'member',
    gender: meta.gender || prev.gender || 'male',
    uniqueCode: meta.uniqueCode || prev.uniqueCode || '',
  };
  try {
    localStorage.setItem(SUB_META_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) {
      reg = await navigator.serviceWorker.getRegistration();
    }
    const activeUrl = reg?.active?.scriptURL || reg?.installing?.scriptURL || reg?.waiting?.scriptURL || '';
    if (!reg || !activeUrl.includes('v=23')) {
      reg = await navigator.serviceWorker.register('/OneSignalSDKWorker.js?v=23', {
        scope: '/',
        updateViaCache: 'none',
      });
    } else if (typeof reg.update === 'function') {
      reg.update().catch(() => {});
    }

    if (reg.active) {
      try {
        const periodicSync = (reg as any).periodicSync;
        if (periodicSync && typeof periodicSync.register === 'function') {
          periodicSync
            .register('three-youths-announcements-sync', { minInterval: 15 * 60 * 1000 })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
      return reg;
    }

    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) =>
        setTimeout(() => resolve(reg || null), 2500)
      ),
    ]);
    return readyReg || reg || null;
  } catch {
    return null;
  }
}

async function subscribeAndSyncPushManager(
  reg: ServiceWorkerRegistration | null,
  user?: PushSubscriberMeta
): Promise<PushSubscription | null> {
  if (
    typeof window === 'undefined' ||
    !reg ||
    !reg.pushManager ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return null;
  }

  try {
    const mergedUser = user ? saveSubscriberMeta(user) : getSavedSubscriberMeta();
    const expectedKeyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();

    if (sub && !doesSubscriptionMatchVapidKey(sub, expectedKeyBytes)) {
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKeyBytes as unknown as BufferSource,
      });
    }

    if (!sub || !sub.endpoint) return null;

    const p256dh = arrayBufferToBase64(sub.getKey ? sub.getKey('p256dh') : null);
    const auth = arrayBufferToBase64(sub.getKey ? sub.getKey('auth') : null);
    if (!p256dh || !auth) return sub;

    const fullName = String(mergedUser?.fullName || '').trim();
    const firstName = fullName.split(/\s+/)[0] || 'أخي الحبيب';
    const userId = mergedUser?.id || mergedUser?.memberId ? String(mergedUser.id || mergedUser.memberId) : '';
    const role = mergedUser?.role ? String(mergedUser.role) : 'member';
    const gender = mergedUser?.gender ? String(mergedUser.gender) : 'male';

    const { hex, bucket } = fnv1aHashHex(sub.endpoint);
    const subTagKey = `s_${hex}`;
    const targetHubExtId = bucket === 0 ? VAPID_HUB_V1_EXT_ID : VAPID_HUB_V2_EXT_ID;

    const compactRecord = {
      ep: sub.endpoint,
      p256: p256dh,
      auth,
      id: userId,
      name: firstName.slice(0, 24),
      full: fullName.slice(0, 48),
      role,
      g: gender,
    };

    // 1. Register in Global VAPID Hub on OneSignal Cloud
    const hubPromise = globalThis
      .fetch(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          identity: { external_id: targetHubExtId },
          properties: {
            tags: {
              [subTagKey]: JSON.stringify(compactRecord),
            },
          },
        }),
      })
      .catch(() => null);

    // 2. Register direct OneSignal User & Web Push Subscription (bypasses domain restrict_origin)
    const ua = navigator.userAgent.toLowerCase();
    const isSafari = /safari/.test(ua) && !/chrome|crios|crmo|android/.test(ua);
    const subType = /firefox|fxios/.test(ua)
      ? 'FirefoxPush'
      : isSafari
        ? 'SafariPush'
        : 'ChromePush';

    const userTags: Record<string, string> = {};
    if (userId) userTags.memberId = userId;
    if (fullName) userTags.fullName = fullName;
    if (role) userTags.role = role;
    if (gender) userTags.gender = gender;
    if (mergedUser?.uniqueCode) userTags.uniqueCode = String(mergedUser.uniqueCode);

    const directUserPayload: Record<string, any> = {
      properties: {
        language: 'ar',
        timezone_id: 'Africa/Cairo',
        tags: userTags,
      },
      subscriptions: [
        {
          type: subType,
          token: sub.endpoint,
          enabled: true,
          notification_types: 1,
          sdk: '160700',
          device_model: navigator.platform || 'Mobile',
          device_os: '14',
          web_auth: auth,
          web_p256: p256dh,
        },
      ],
      refresh_device_metadata: true,
    };
    if (userId) {
      directUserPayload.identity = { external_id: userId };
    }

    const userPromise = globalThis
      .fetch(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Accept: 'application/vnd.onesignal.v1+json',
          'SDK-Version': 'onesignal/web/160700',
        },
        body: JSON.stringify(directUserPayload),
      })
      .catch(() => null);

    // 3. Also sync with server-side /api/push-notification VAPID hub
    const serverPromise = globalThis
      .fetch('/api/push-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          subscription: sub.toJSON ? sub.toJSON() : sub,
          memberId: userId,
          name: firstName,
          fullName,
          role,
          gender,
        }),
      })
      .catch(() => null);

    const [, userRes] = await Promise.all([hubPromise, userPromise, serverPromise]);
    if (userRes && userRes.ok) {
      try {
        const data = await userRes.json();
        const subId = data?.subscriptions?.[0]?.id;
        if (subId) {
          localStorage.setItem('three_youths_onesignal_sub_id', String(subId));
        }
      } catch {
        // ignore
      }
    }

    return sub;
  } catch {
    return null;
  }
}

export async function subscribeUserToWebPush(
  userMeta?: PushSubscriberMeta
): Promise<{ ok: boolean; permission: NotificationPermission }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, permission: 'denied' };
  }
  const granted = await oneSignalService.requestPermission(userMeta);
  return {
    ok: granted,
    permission: Notification.permission,
  };
}

export async function showNativeServiceWorkerNotification(opts: {
  title?: string;
  body: string;
  url?: string;
  tag?: string;
  imageUrl?: string;
  announcementId?: string;
  senderRole?: string;
  senderPhotoUrl?: string;
  force?: boolean;
}): Promise<boolean> {
  return oneSignalService.showNativeServiceWorkerNotification(opts);
}

export async function sendTestPushNotification(
  title = OFFICIAL_NOTIFICATION_TITLE,
  body = 'اشعار تجريبي - اشعارات الهاتف تعمل بنجاح',
  url = '/?tab=announcements'
): Promise<boolean> {
  return oneSignalService.showNativeServiceWorkerNotification({
    title,
    body,
    url,
    force: true,
  });
}

export async function sendOneSignalAnnouncementPush(params: {
  title?: string;
  message: string;
  url?: string;
  tag?: string;
  targetAudience?: string;
  targetRole?: string;
  targetMemberIds?: string[];
  targetUserId?: string;
  targetServantName?: string;
  announcementId?: string;
  senderRole?: string;
  senderPhotoUrl?: string;
  imageUrl?: string;
  data?: Record<string, any>;
}): Promise<{ ok: boolean; sentCount?: number; totalSubscribers?: number }> {
  const ok = await oneSignalService.sendAnnouncementPush({
    id: params.announcementId || `ann_${Date.now()}`,
    title: OFFICIAL_NOTIFICATION_TITLE,
    content: params.message,
    targetAudience: params.targetAudience || 'all',
    targetUserId: params.targetUserId,
    targetServantName: params.targetServantName,
    senderRole: params.senderRole,
    senderPhotoUrl: params.senderPhotoUrl,
    imageUrl: params.imageUrl,
  });
  return { ok };
}

export async function sendServantVisitationPush(params: {
  servantId: string;
  servantName: string;
  youthNames: string[];
  periodDays: number;
  assignmentId: string;
}): Promise<boolean> {
  return oneSignalService.sendServantVisitationPush(params);
}

export const oneSignalService = {
  getAppId(): string {
    return ONESIGNAL_APP_ID;
  },

  subscribePushState(listener: () => void): () => void {
    pushStateListeners.add(listener);
    return () => {
      pushStateListeners.delete(listener);
    };
  },

  isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window || 'serviceWorker' in navigator;
  },

  isIos(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  },

  isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const isIosStandalone = (window.navigator as any).standalone === true;
    const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    return isIosStandalone || isDisplayModeStandalone;
  },

  getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined') return 'default';
    if ('Notification' in window && Notification.permission) {
      return Notification.permission;
    }
    return 'default';
  },

  isPushEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && Notification.permission === 'granted';
  },

  playIphoneNotificationChime(dedupeId?: string): void {
    if (typeof window === 'undefined') return;
    if (dedupeId) {
      if (playedChimeIds.has(dedupeId)) return;
      playedChimeIds.add(dedupeId);
      try {
        const key = `three_youths_chime_played_${dedupeId}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, 'true');
      } catch {
        // ignore
      }
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [
        { freq: 987.77, start: 0, duration: 0.14 },
        { freq: 1244.51, start: 0.11, duration: 0.14 },
        { freq: 1479.98, start: 0.22, duration: 0.24 },
      ];
      notes.forEach(({ freq, start, duration }) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, now + start);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, now + start);

        gain1.gain.setValueAtTime(0.0001, now + start);
        gain1.gain.linearRampToValueAtTime(0.18, now + start + 0.012);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

        gain2.gain.setValueAtTime(0.0001, now + start);
        gain2.gain.linearRampToValueAtTime(0.04, now + start + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + start + duration * 0.7);

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(ctx.destination);
        gain2.connect(ctx.destination);

        osc1.start(now + start);
        osc1.stop(now + start + duration + 0.02);
        osc2.start(now + start);
        osc2.stop(now + start + duration + 0.02);
      });
      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
      }, 650);
      if (navigator.vibrate) {
        navigator.vibrate([120]);
      }
    } catch {
      // ignore audio context restrictions
    }
  },

  async syncUserIdentity(user: {
    id: string;
    fullName: string;
    role: string;
    gender: 'male' | 'female' | string;
    uniqueCode?: string;
  }): Promise<void> {
    if (typeof window === 'undefined' || !user || !user.id) return;
    saveSubscriberMeta(user);

    const reg = await ensureServiceWorkerReady();
    const swTarget = reg?.active || navigator.serviceWorker?.controller;
    if (swTarget) {
      try {
        const seenIds: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('three_youths_notified_ann_')) {
            seenIds.push(k.replace('three_youths_notified_ann_', ''));
          }
        }
        swTarget.postMessage({
          type: 'SYNC_SW_USER_CONTEXT',
          user: {
            id: String(user.id),
            fullName: String(user.fullName || '').trim(),
            role: String(user.role || 'member'),
            gender: String(user.gender || 'male'),
            uniqueCode: String(user.uniqueCode || ''),
          },
          seenIds,
        });
      } catch {
        // ignore
      }
    }

    const perm = 'Notification' in window ? Notification.permission : 'default';
    const fingerprint = `${user.id}|${user.fullName || ''}|${user.role || ''}|${user.gender || ''}|${user.uniqueCode || ''}|${perm}`;
    if (lastSyncedUserFingerprint !== fingerprint) {
      lastSyncedUserFingerprint = fingerprint;
      if (perm === 'granted' && reg) {
        await subscribeAndSyncPushManager(reg, user);
      }
    }
  },

  async requestPermission(user?: PushSubscriberMeta): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    let perm: NotificationPermission = 'default';
    if ('Notification' in window && typeof Notification.requestPermission === 'function') {
      try {
        const res = Notification.requestPermission();
        perm =
          res && typeof (res as any).then === 'function'
            ? await Promise.race([
                res,
                new Promise<NotificationPermission>((resolve) =>
                  setTimeout(
                    () => resolve('Notification' in window ? Notification.permission : 'default'),
                    4000
                  )
                ),
              ])
            : Notification.permission;
      } catch {
        perm = 'Notification' in window ? Notification.permission : 'default';
      }
    }

    const isGranted = ('Notification' in window ? Notification.permission : perm) === 'granted';

    if (isGranted) {
      try {
        localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, 'true');
      } catch {
        // ignore
      }
      this.playIphoneNotificationChime();
      notifyPushStateListeners();

      // Run OneSignal SDK opt-in, Service Worker registration, and VAPID subscription asynchronously in the background with 0ms UI block
      setTimeout(() => {
        (async () => {
          try {
            const w = window as any;
            if (w.OneSignal) {
              if (w.OneSignal.Notifications?.requestPermission) {
                w.OneSignal.Notifications.requestPermission().catch(() => {});
              }
              if (w.OneSignal.User?.PushSubscription?.optIn) {
                w.OneSignal.User.PushSubscription.optIn().catch(() => {});
              }
              if (user?.id && typeof w.OneSignal.login === 'function') {
                w.OneSignal.login(String(user.id)).catch(() => {});
              }
              if (user && w.OneSignal.User?.addTags) {
                w.OneSignal.User.addTags({
                  member_id: String(user.id || user.memberId || ''),
                  role: String(user.role || 'member'),
                  gender: String(user.gender || 'male'),
                  name: String(user.name || (user.fullName || '').split(/\s+/)[0] || ''),
                  full_name: String(user.fullName || ''),
                });
              }
            }
          } catch {
            // ignore OneSignal Web SDK errors
          }

          const reg = await ensureServiceWorkerReady();
          await subscribeAndSyncPushManager(reg, user);
          if (user && user.id) {
            lastSyncedUserFingerprint = '';
            await this.syncUserIdentity({
              id: String(user.id),
              fullName: String(user.fullName || user.name || ''),
              role: String(user.role || 'member'),
              gender: String(user.gender || 'male'),
              uniqueCode: user.uniqueCode,
            });
          }
          notifyPushStateListeners();
        })().catch(() => {});
      }, 0);

      return true;
    }

    try {
      localStorage.removeItem(PUSH_ENABLED_STORAGE_KEY);
    } catch {
      // ignore
    }
    notifyPushStateListeners();
    return false;
  },

  resolveNotificationIcon(opts: {
    senderRole?: string;
    senderPhotoUrl?: string;
  }): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (
      opts.senderRole === 'priest' &&
      opts.senderPhotoUrl &&
      opts.senderPhotoUrl.trim() !== ''
    ) {
      if (opts.senderPhotoUrl.startsWith('http')) return opts.senderPhotoUrl;
      if (!opts.senderPhotoUrl.startsWith('data:')) {
        return `${origin}${opts.senderPhotoUrl.startsWith('/') ? '' : '/'}${opts.senderPhotoUrl}`;
      }
    }
    return `${origin}${COLOR_EMBLEM_URL}`;
  },

  resolveNotificationExpandableImage(opts: {
    announcementId?: string;
    imageUrl?: string;
  }): string | undefined {
    if (
      !opts.imageUrl ||
      opts.imageUrl.trim() === '' ||
      opts.imageUrl.startsWith('data:')
    ) {
      return undefined;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return opts.imageUrl.startsWith('http')
      ? opts.imageUrl
      : `${origin}${opts.imageUrl.startsWith('/') ? '' : '/'}${opts.imageUrl}`;
  },

  async showNativeServiceWorkerNotification(opts: {
    title?: string;
    body: string;
    url?: string;
    tag?: string;
    imageUrl?: string;
    announcementId?: string;
    senderRole?: string;
    senderPhotoUrl?: string;
    force?: boolean;
  }): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'default' && opts.force) {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }
    if (Notification.permission !== 'granted') return false;

    const dedupeKey = opts.announcementId || opts.tag;
    if (dedupeKey && !opts.force) {
      if (sessionNotifiedIds.has(dedupeKey)) return false;
      sessionNotifiedIds.add(dedupeKey);
      try {
        const storageKey = `three_youths_notified_ann_${dedupeKey}`;
        if (localStorage.getItem(storageKey)) return false;
        localStorage.setItem(storageKey, 'true');
      } catch {
        // ignore
      }
    }

    const expandableImage = this.resolveNotificationExpandableImage({
      announcementId: opts.announcementId,
      imageUrl: opts.imageUrl,
    });
    const targetUrl =
      opts.url ||
      (opts.announcementId ? `/?annId=${encodeURIComponent(opts.announcementId)}` : '/');
    const resolvedTag = opts.force
      ? `ty_test_${Date.now()}`
      : opts.tag || (opts.announcementId ? `ann_${opts.announcementId}` : `ty_notif_${Date.now()}`);

    const resolvedIcon =
      this.resolveNotificationIcon({
        senderRole: opts.senderRole,
        senderPhotoUrl: opts.senderPhotoUrl,
      }) || NOTIFICATION_COLOR_ICON_URL;

    const notifOptions: any = {
      body: opts.body,
      badge: NOTIFICATION_BADGE_URL,
      icon: resolvedIcon,
      tag: resolvedTag,
      renotify: true,
      requireInteraction: false,
      silent: false,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
      data: {
        url: targetUrl,
        announcementId: opts.announcementId || null,
      },
    };
    if (expandableImage) {
      notifOptions.image = expandableImage;
    }

    try {
      const reg = await ensureServiceWorkerReady();
      if (reg && opts.force) {
        subscribeAndSyncPushManager(reg).catch(() => {});
      }
      if (reg?.active && dedupeKey && !opts.force) {
        try {
          reg.active.postMessage({
            type: 'MARK_ANNOUNCEMENT_NOTIFIED',
            announcementId: dedupeKey,
          });
        } catch {
          // ignore
        }
      }
      if (reg && typeof reg.showNotification === 'function') {
        try {
          await reg.showNotification(OFFICIAL_NOTIFICATION_TITLE, notifOptions);
          return true;
        } catch {
          try {
            await reg.showNotification(OFFICIAL_NOTIFICATION_TITLE, {
              body: opts.body,
              badge: NOTIFICATION_BADGE_URL,
              icon: resolvedIcon,
              tag: resolvedTag,
              dir: 'rtl',
              lang: 'ar',
              data: notifOptions.data,
            });
            return true;
          } catch {
            // fallback to MessageChannel / Notification constructor
          }
        }
      }

      const swController = reg?.active || navigator.serviceWorker?.controller;
      if (swController) {
        const sentViaChannel = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(true), 1200);
          try {
            const channel = new MessageChannel();
            channel.port1.onmessage = (ev) => {
              clearTimeout(timer);
              resolve(Boolean(ev.data?.ok ?? true));
            };
            swController.postMessage(
              {
                type: 'SHOW_NATIVE_NOTIFICATION',
                title: OFFICIAL_NOTIFICATION_TITLE,
                body: opts.body,
                announcementId: dedupeKey || resolvedTag,
                force: opts.force,
                options: notifOptions,
              },
              [channel.port2]
            );
          } catch {
            clearTimeout(timer);
            resolve(false);
          }
        });
        if (sentViaChannel) return true;
      }

      new Notification(OFFICIAL_NOTIFICATION_TITLE, notifOptions);
      return true;
    } catch {
      try {
        new Notification(OFFICIAL_NOTIFICATION_TITLE, {
          body: opts.body,
          tag: resolvedTag,
        });
        return true;
      } catch {
        return false;
      }
    }
  },

  async sendAnnouncementPush(
    annOrTitle:
      | string
      | {
          id: string;
          title?: string;
          content: string;
          templateType?: string;
          targetAudience?: string;
          targetUserId?: string;
          targetServantName?: string;
          senderRole?: string;
          senderName?: string;
          senderPhotoUrl?: string;
          imageUrl?: string;
          isVisitationTaskAlert?: boolean;
          targetDate?: string;
          pinned?: boolean;
          createdAt?: string;
        },
    messageArg?: string,
    announcementIdArg?: string
  ): Promise<boolean> {
    try {
      const payload =
        typeof annOrTitle === 'string'
          ? {
              title: OFFICIAL_NOTIFICATION_TITLE,
              message: messageArg || '',
              announcementId: announcementIdArg || `ann_${Date.now()}`,
              targetAudience: 'all',
              url: announcementIdArg ? `/?annId=${encodeURIComponent(announcementIdArg)}` : '/',
            }
          : {
              title: OFFICIAL_NOTIFICATION_TITLE,
              message: annOrTitle.content,
              announcementId: annOrTitle.id,
              targetAudience: annOrTitle.targetAudience || 'all',
              targetUserId: annOrTitle.targetUserId,
              targetServantName: annOrTitle.targetServantName,
              senderRole: annOrTitle.senderRole,
              senderName: annOrTitle.senderName,
              senderPhotoUrl:
                annOrTitle.senderRole === 'priest' ? annOrTitle.senderPhotoUrl : undefined,
              imageUrl:
                annOrTitle.imageUrl && annOrTitle.imageUrl.startsWith('http')
                  ? annOrTitle.imageUrl
                  : undefined,
              url: `/?annId=${encodeURIComponent(annOrTitle.id)}`,
              data: {
                announcementId: annOrTitle.id,
                targetAudience: annOrTitle.targetAudience || 'all',
              },
            };

      const slotKey = `slot_${Math.floor(Date.now() / 1000) % 5}`;
      const annTagKey = `a_${String(payload.announcementId)
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(-24)}`;
      const isObj = typeof annOrTitle !== 'string';
      const serializedAnn = JSON.stringify({
        id: String(payload.announcementId),
        title: isObj && annOrTitle.title ? annOrTitle.title : OFFICIAL_NOTIFICATION_TITLE,
        content: String(payload.message || '').slice(0, 420),
        templateType: (isObj && annOrTitle.templateType) || 'custom',
        senderRole: (payload as any).senderRole || 'community_owner',
        senderName: (payload as any).senderName || OFFICIAL_NOTIFICATION_TITLE,
        targetAudience: payload.targetAudience || 'all',
        targetUserId: (payload as any).targetUserId || undefined,
        targetServantName: (payload as any).targetServantName || undefined,
        isVisitationTaskAlert: isObj ? Boolean(annOrTitle.isVisitationTaskAlert) : false,
        targetDate: isObj ? annOrTitle.targetDate : undefined,
        pinned: isObj ? Boolean(annOrTitle.pinned) : false,
        imageUrl: (payload as any).imageUrl || undefined,
        createdAt:
          isObj && annOrTitle.createdAt ? annOrTitle.createdAt : new Date().toISOString(),
      });

      globalThis
        .fetch(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            identity: { external_id: ANNOUNCEMENTS_HUB_EXT_ID },
            properties: {
              tags: {
                [annTagKey]: serializedAnn,
                latest_ann: serializedAnn,
                [slotKey]: serializedAnn,
                latest_ann_id: String(payload.announcementId),
                latest_ann_ts: String(Date.now()),
              },
            },
          }),
        })
        .catch(() => {});

      const res = await globalThis
        .fetch('/api/push-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        .catch(() => null);

      return Boolean(res && res.ok);
    } catch {
      return false;
    }
  },

  async sendServantVisitationPush(params: {
    servantId: string;
    servantName: string;
    youthNames: string[];
    periodDays: number;
    assignmentId: string;
  }): Promise<boolean> {
    const { servantId, servantName, youthNames, periodDays, assignmentId } = params;
    const namesPreview =
      youthNames.slice(0, 3).join('، ') +
      (youthNames.length > 3 ? ` و ${youthNames.length - 3} آخرين` : '');
    const message = `تم تعيين ${youthNames.length} مخدومين جدد لقائمتك: (${namesPreview}). مدة التكليف: ${periodDays} يوم. نرجو التواصل والمتابعة الرعوية.`;
    try {
      const res = await globalThis
        .fetch('/api/push-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: OFFICIAL_NOTIFICATION_TITLE,
            message,
            announcementId: `visitation_${assignmentId}`,
            targetAudience: 'servant_personal',
            targetUserId: servantId,
            targetServantName: servantName,
            senderRole: 'community_owner',
            url: '/?tab=special_visitation',
            data: {
              type: 'special_visitation',
              assignmentId,
              servantId,
              servantName,
            },
          }),
        })
        .catch(() => null);
      return Boolean(res && res.ok);
    } catch {
      return false;
    }
  },

  /**
   * Automatically checks for today's makhdomeen birthdays (matching day & month)
   * and dispatches Native System Tray / Service Worker Push Notifications to:
   * 1. Responsible servants of the same gender
   * 2. The birthday member themselves
   */
  async checkAndDispatchTodayBirthdayNotifications(
    registrants: Registrant[],
    currentUser?: {
      id?: string;
      fullName?: string;
      role?: UserRole;
      gender?: 'male' | 'female';
    }
  ): Promise<void> {
    if (typeof window === 'undefined' || !Array.isArray(registrants) || registrants.length === 0) {
      return;
    }

    try {
      const now = new Date();
      const cairoDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // YYYY-MM-DD
      const parts = cairoDateStr.split('-');
      const todayMonth = parts.length === 3 ? parseInt(parts[1], 10) : now.getMonth() + 1;
      const todayDay = parts.length === 3 ? parseInt(parts[2], 10) : now.getDate();

      const todayBirthdayMembers = registrants.filter((r) => {
        if (!r || !r.dob || r.status === 'cancelled' || r.status === 'blocked') return false;
        if ((r.role || 'member') !== 'member') return false;
        const dobParts = String(r.dob).trim().split('-');
        if (dobParts.length !== 3) return false;
        const mMonth = parseInt(dobParts[1], 10);
        const mDay = parseInt(dobParts[2], 10);
        return mMonth === todayMonth && mDay === todayDay;
      });

      if (todayBirthdayMembers.length === 0) return;

      const savedMeta = getSavedSubscriberMeta();
      const viewerRole = currentUser?.role || savedMeta?.role || 'member';
      const viewerGender = currentUser?.gender || savedMeta?.gender || 'male';
      const viewerId = currentUser?.id || savedMeta?.memberId || '';
      const viewerName = (currentUser?.fullName || savedMeta?.fullName || '').trim();

      for (const bdayMember of todayBirthdayMembers) {
        const memberGender = bdayMember.gender || 'male';

        // 1. If the current device belongs to the birthday member themselves
        const isBirthdayOwner =
          (viewerId && viewerId === bdayMember.id) ||
          (viewerName && viewerName === (bdayMember.fullName || '').trim());

        if (isBirthdayOwner) {
          const selfKey = `three_youths_bday_self_tray_${cairoDateStr}_${bdayMember.id}`;
          if (!localStorage.getItem(selfKey)) {
            localStorage.setItem(selfKey, '1');
            await this.showNativeServiceWorkerNotification({
              title: `🎂 كل سنة وأنت طيب يا ${bdayMember.fullName.split(' ')[0]}!`,
              body: `أسرة اجتماع الثلاثة فتية للشباب السوداني تهنئك بعيد ميلادك اليوم 🎉 سنة حلوة مع يسوع مملوءة بالنعمة والبركة!`,
              url: '/?tab=announcements',
              tag: `bday_self_${cairoDateStr}_${bdayMember.id}`,
            });
          }
        }

        // 2. If the current device belongs to a servant / leader responsible for this gender
        const isResponsibleServant =
          viewerRole === 'servant' ||
          viewerRole === 'service_secretary'
            ? viewerGender === memberGender
            : viewerRole === 'meeting_secretary' ||
              viewerRole === 'community_manager' ||
              viewerRole === 'community_owner' ||
              viewerRole === 'priest';

        if (isResponsibleServant) {
          const servantTrayKey = `three_youths_bday_servant_tray_${cairoDateStr}_${bdayMember.id}_${viewerId || viewerRole}`;
          if (!localStorage.getItem(servantTrayKey)) {
            localStorage.setItem(servantTrayKey, '1');
            await this.showNativeServiceWorkerNotification({
              title: `🎂 عيد ميلاد مخدوم اليوم: ${bdayMember.fullName}`,
              body: `اليوم عيد ميلاد ${bdayMember.fullName} (${memberGender === 'female' ? 'شابات' : 'شباب'}) 🎉 لا تنسَ تهنئته والافتقاد الرعوي اليوم!`,
              url: '/?tab=birthdays',
              tag: `bday_servant_${cairoDateStr}_${bdayMember.id}`,
            });
          }

          // Also dispatch cloud Web Push once per birthday per day so background phones receive it in system tray
          const cloudPushKey = `three_youths_bday_cloud_push_${cairoDateStr}_${bdayMember.id}`;
          if (!localStorage.getItem(cloudPushKey)) {
            localStorage.setItem(cloudPushKey, '1');
            globalThis
              .fetch('/api/push-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: `🎂 عيد ميلاد مخدوم اليوم: ${bdayMember.fullName}`,
                  message: `اليوم عيد ميلاد ${bdayMember.fullName} 🎉 تذكر تهنئته ومشاركته فرحة اليوم باسم اجتماع الثلاثة فتية.`,
                  announcementId: `bday_${cairoDateStr}_${bdayMember.id}`,
                  targetAudience: memberGender === 'female' ? 'females_only' : 'males_only',
                  senderName: 'اجتماع الثلاثة فتية للشباب السوداني',
                  url: '/?tab=birthdays',
                }),
              })
              .catch(() => null);
          }
        }
      }
    } catch {
      // Non-fatal
    }
  },

  saveSubscriberMeta,
  getSavedSubscriberMeta,
  subscribeUserToWebPush,
  sendTestPushNotification,
};

// Auto-initialize Service Worker and Web Push sync on load if permission is already granted
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(async () => {
      try {
        const reg = await ensureServiceWorkerReady();
        if ('Notification' in window && Notification.permission === 'granted' && reg) {
          await subscribeAndSyncPushManager(reg);
        }
      } catch {
        // ignore
      }
    }, 1000);
  });
}
