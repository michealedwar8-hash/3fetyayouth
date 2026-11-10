const VAPID_PUBLIC_KEY_FALLBACK =
  'BGbv4i2BfU6a-nfOd49_-ykPhchNeGSvSHLNSxt6PhyY2jZNlpsWkUETRyNsm7bSmrOMk5o883cDsqy1aifX6Cw';

const PUSH_USER_CACHE_KEY = 'three_youths_active_push_user_v1';

interface CachedPushUser {
  id: string;
  name: string;
  fullName: string;
  role: string;
  gender: 'male' | 'female';
}

function getCachedPushUser(): CachedPushUser | null {
  try {
    const raw = localStorage.getItem(PUSH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}

function setCachedPushUser(user: Partial<CachedPushUser>) {
  try {
    const prev = getCachedPushUser() || {
      id: '',
      name: '',
      fullName: '',
      role: 'member',
      gender: 'male' as const,
    };
    const fullName = String(user.fullName || prev.fullName || '').trim();
    const firstName = String(
      user.name || (fullName ? fullName.split(/\s+/)[0] : '') || prev.name || ''
    ).trim();
    const next: CachedPushUser = {
      id: String(user.id || prev.id || ''),
      name: firstName,
      fullName,
      role: String(user.role || prev.role || 'member'),
      gender: user.gender === 'female' ? 'female' : prev.gender || 'male',
    };
    localStorage.setItem(PUSH_USER_CACHE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as any).standalone)
  );
}

export function playIphoneNotificationChime(_mode?: any): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1046.5, now); // C6
    osc1.frequency.setValueAtTime(1318.5, now + 0.11); // E6
    osc2.frequency.setValueAtTime(523.25, now); // C5
    osc2.frequency.setValueAtTime(659.25, now + 0.11); // E5
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.46);
    osc2.stop(now + 0.46);
  } catch {
    // ignore audio autoplay restriction
  }
}

let cachedSwReg: ServiceWorkerRegistration | null = null;

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  if (cachedSwReg) return cachedSwReg;

  try {
    const reg = await navigator.serviceWorker.register('/OneSignalSDKWorker.js?v=10', {
      scope: '/',
      updateViaCache: 'none',
    });
    reg.update().catch(() => {});
    await navigator.serviceWorker.ready;
    cachedSwReg = reg;
    return reg;
  } catch (err) {
    console.warn('Service Worker registration warning:', err);
    return null;
  }
}

export async function ensureWebPushSubscribed(
  role: string = 'member',
  memberId: string = '',
  requestPermissionIfNeeded: boolean = false,
  extraMeta?: { fullName?: string; gender?: 'male' | 'female' }
): Promise<{ subscribed: boolean; permission: string }> {
  if (!isPushSupported()) {
    return { subscribed: false, permission: 'unsupported' };
  }

  let permission = Notification.permission;
  if (permission === 'default' && requestPermissionIfNeeded) {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  if (permission !== 'granted') {
    return { subscribed: false, permission };
  }

  try {
    const reg = await registerPushServiceWorker();
    if (!reg || !reg.pushManager) {
      return { subscribed: false, permission };
    }

    let publicKey = VAPID_PUBLIC_KEY_FALLBACK;
    try {
      const keyRes = await fetch('/api/push-notification?action=vapid_public_key', {
        cache: 'no-store',
      });
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        if (keyData?.publicKey) publicKey = keyData.publicKey;
      }
    } catch {
      // use fallback public key
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const cachedUser = getCachedPushUser();
    const resolvedMemberId = memberId || cachedUser?.id || '';
    const resolvedRole = role || cachedUser?.role || 'member';
    const resolvedFullName = extraMeta?.fullName || cachedUser?.fullName || '';
    const resolvedFirstName =
      (resolvedFullName ? resolvedFullName.trim().split(/\s+/)[0] : '') ||
      cachedUser?.name ||
      '';
    const resolvedGender = extraMeta?.gender || cachedUser?.gender || 'male';

    await fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        subscription: sub.toJSON(),
        role: resolvedRole,
        memberId: resolvedMemberId,
        id: resolvedMemberId,
        name: resolvedFirstName,
        fullName: resolvedFullName,
        full: resolvedFullName,
        gender: resolvedGender,
        g: resolvedGender,
      }),
    });

    return { subscribed: true, permission: 'granted' };
  } catch (err) {
    console.warn('Web push subscription warning:', err);
    return { subscribed: false, permission };
  }
}

export async function requestNotificationPermissionAndSubscribe(
  role: string = 'member',
  memberId: string = ''
): Promise<boolean> {
  const res = await ensureWebPushSubscribed(role, memberId, true);
  return res.subscribed;
}

export async function showNativeServiceWorkerNotification(opts: {
  title: string;
  body: string;
  url?: string;
  announcementId?: string;
  senderRole?: string;
  senderPhotoUrl?: string;
  imageUrl?: string;
  tag?: string;
}): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await registerPushServiceWorker();
    if (!reg) return false;
    await reg.showNotification(opts.title, {
      body: opts.body,
      badge: '/notif-logo-color.png?v=10',
      icon: '/notif-empty.png?v=10',
      image: opts.imageUrl || undefined,
      tag: opts.tag || (opts.announcementId ? `three-youths-ann-${opts.announcementId}` : `three-youths-local-${Date.now()}`),
      renotify: true,
      vibrate: [200, 100, 200],
      dir: 'rtl',
      lang: 'ar',
      data: {
        url: opts.url || '/?tab=announcements',
        announcementId: opts.announcementId,
      },
    } as any);
    return true;
  } catch {
    return false;
  }
}

export async function showLocalServiceWorkerNotification(
  title: string,
  body: string,
  url: string = '/?tab=announcements'
): Promise<boolean> {
  return showNativeServiceWorkerNotification({ title, body, url });
}

export async function sendPushNotification(payload: {
  title: string;
  message: string;
  url?: string;
  tag?: string;
  targetRole?: 'all' | 'servant' | 'member';
  targetAudience?: string;
  targetUserId?: string;
  targetServantName?: string;
  senderRole?: string;
  senderPhotoUrl?: string;
  announcementId?: string;
  imageUrl?: string;
  data?: Record<string, any>;
}): Promise<{ ok: boolean; sentCount?: number; totalSubscribers?: number }> {
  try {
    const res = await fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'broadcast',
        title: payload.title,
        message: payload.message,
        url: payload.url || '/?tab=announcements',
        tag: payload.tag,
        targetRole: payload.targetRole || 'all',
        targetAudience: payload.targetAudience || 'all',
        targetUserId: payload.targetUserId,
        targetServantName: payload.targetServantName,
        senderRole: payload.senderRole,
        senderPhotoUrl: payload.senderPhotoUrl,
        announcementId: payload.announcementId,
        imageUrl: payload.imageUrl,
        data: payload.data || {},
      }),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function sendServantVisitationPush(params: {
  servantId: string;
  servantName: string;
  youthNames: string[];
  periodDays: number;
  assignmentId: string;
}): Promise<{ ok: boolean }> {
  const youthPreview =
    params.youthNames.slice(0, 3).join('، ') +
    (params.youthNames.length > 3 ? ` و ${params.youthNames.length - 3} آخرين` : '');
  return sendPushNotification({
    title: `🎯 تكليف افتقاد جديد: ${params.servantName}`,
    message: `سلام ونعمة يا ${params.servantName} 🕊️، تم تكليفك بافتقاد ${params.youthNames.length} مخدومين: (${youthPreview}) خلال ${params.periodDays} يوم.`,
    targetAudience: 'servant_personal',
    targetUserId: params.servantId,
    targetServantName: params.servantName,
    data: {
      type: 'special_visitation',
      servantId: params.servantId,
      servantName: params.servantName,
      assignmentId: params.assignmentId,
    },
  });
}

export const oneSignalService = {
  isSupported: isPushSupported,
  getPermissionState: getNotificationPermissionState,
  isIos: isIosDevice,
  isStandalone: isStandalonePwa,
  playIphoneNotificationChime,
  init: async (): Promise<void> => {
    await registerPushServiceWorker();
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const cached = getCachedPushUser();
      await ensureWebPushSubscribed(
        cached?.role || 'member',
        cached?.id || '',
        false,
        cached ? { fullName: cached.fullName, gender: cached.gender } : undefined
      );
    }
  },
  isPushEnabled: async (): Promise<boolean> => {
    if (!isPushSupported()) return false;
    if (Notification.permission !== 'granted') return false;
    try {
      const reg = await registerPushServiceWorker();
      if (!reg || !reg.pushManager) return true;
      const sub = await reg.pushManager.getSubscription();
      return Boolean(sub) || Notification.permission === 'granted';
    } catch {
      return Notification.permission === 'granted';
    }
  },
  requestPermission: async (): Promise<boolean> => {
    const cached = getCachedPushUser();
    return await requestNotificationPermissionAndSubscribe(
      cached?.role || 'member',
      cached?.id || ''
    );
  },
  syncUserIdentity: async (user: {
    id: string;
    fullName: string;
    role: string;
    gender?: 'male' | 'female';
    uniqueCode?: string;
    [key: string]: any;
  }): Promise<void> => {
    const saved = setCachedPushUser({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      gender: user.gender || 'male',
    });
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      await ensureWebPushSubscribed(
        saved?.role || user.role || 'member',
        saved?.id || user.id || '',
        false,
        { fullName: user.fullName, gender: user.gender || 'male' }
      );
    }
  },
  getPermission: (): string => {
    const state = getNotificationPermissionState();
    return state === 'unsupported' ? 'default' : state;
  },
  sendAnnouncementPush: async (ann: {
    id: string;
    title: string;
    content: string;
    targetAudience?: string;
    targetUserId?: string;
    targetServantName?: string;
    senderRole?: string;
    senderPhotoUrl?: string;
    imageUrl?: string;
  }) => {
    return sendPushNotification({
      title: ann.title,
      message: ann.content,
      url: `/?annId=${encodeURIComponent(ann.id)}`,
      targetAudience: ann.targetAudience || 'all',
      targetUserId: ann.targetUserId,
      targetServantName: ann.targetServantName,
      senderRole: ann.senderRole,
      senderPhotoUrl: ann.senderPhotoUrl,
      announcementId: ann.id,
      imageUrl: ann.imageUrl,
    });
  },
  sendPushNotification,
  sendServantVisitationPush,
  showLocalNotification: showLocalServiceWorkerNotification,
  showNativeServiceWorkerNotification,
  ensureSubscribed: ensureWebPushSubscribed,
};
