// OneSignal & Web Push Service Worker Notification Service for Android & iPhone (iOS PWA)
import { Announcement, UserRole } from '../types';

const ONESIGNAL_APP_ID = "195c5a47-9662-45ce-886a-e048636af0c1";
export const SITE_LOGO_URL = "/site-logo.png";
export const SITE_BADGE_URL = "/site-badge.png";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
    Notification?: any;
    __oneSignalReady?: boolean;
    __oneSignalInitPromise?: Promise<boolean>;
  }
}

let lastSyncedIdentityKey = '';
const playedChimeAnnouncementIds = new Set<string>();
const shownNativeNotifIds = new Set<string>();

export const oneSignalService = {
  getAppId(): string {
    return ONESIGNAL_APP_ID;
  },

  isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return ('Notification' in window) || ('serviceWorker' in navigator);
  },

  isIos(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  },

  isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const isStandaloneNavigator = (window.navigator as any).standalone === true;
    const isStandaloneDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
    return isStandaloneNavigator || isStandaloneDisplayMode;
  },

  getPermissionState(): 'granted' | 'denied' | 'default' {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'default';
    return Notification.permission as 'granted' | 'denied' | 'default';
  },

  /**
   * Plays the authentic iPhone Notification Chime (Apple Tri-Tone / Rebound crystalline chime)
   * STRICTLY ONCE per announcement ID — never loops or repeats!
   */
  playIphoneNotificationChime(announcementId?: string): void {
    if (typeof window === 'undefined') return;
    if (announcementId) {
      if (playedChimeAnnouncementIds.has(announcementId)) {
        return;
      }
      playedChimeAnnouncementIds.add(announcementId);
      try {
        const chimeKey = `three_youths_chime_played_${announcementId}`;
        if (localStorage.getItem(chimeKey)) {
          return;
        }
        localStorage.setItem(chimeKey, 'true');
      } catch {}
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Authentic iPhone Tri-Tone crystalline Marimba/Bell notes: B5 -> D#6 -> F#6 (plays once, ~0.42s total, then stops)
      const notes = [
        { freq: 987.77, start: 0.0, duration: 0.14 },   // B5
        { freq: 1244.51, start: 0.11, duration: 0.14 }, // D#6
        { freq: 1479.98, start: 0.22, duration: 0.24 }  // F#6
      ];

      notes.forEach(({ freq, start, duration }) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const overtoneGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        // Soft bell harmonic overtone for authentic iOS glass/marimba timbre
        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(freq * 2, now + start);

        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(0.18, now + start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

        overtoneGain.gain.setValueAtTime(0.0001, now + start);
        overtoneGain.gain.linearRampToValueAtTime(0.04, now + start + 0.01);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration * 0.7);

        osc.connect(gain);
        overtone.connect(overtoneGain);
        gain.connect(ctx.destination);
        overtoneGain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + duration + 0.02);
        overtone.start(now + start);
        overtone.stop(now + start + duration + 0.02);
      });

      setTimeout(() => {
        try {
          ctx.close();
        } catch {}
      }, 650);

      if (navigator.vibrate) {
        navigator.vibrate([100]);
      }
    } catch {
      // Ignore audio autoplay block if user hasn't interacted yet
    }
  },

  /**
   * Synchronize logged-in member/servant identity & tags with OneSignal AND Service Worker
   * so targeted push notifications are delivered exclusively to the right phone even when in background.
   */
  async syncUserIdentity(member: {
    id: string;
    fullName: string;
    role: UserRole | string;
    gender?: string;
    uniqueCode?: string;
  } | null): Promise<void> {
    if (typeof window === 'undefined' || !member || !member.id) return;

    // Always sync user context to Service Worker for background notification watching
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const activeSw = reg?.active || navigator.serviceWorker.controller;
        if (activeSw) {
          const seenIds: string[] = [];
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && (k.startsWith('three_youths_notified_ann_') || k.startsWith('three_youths_seen_ann_'))) {
                seenIds.push(k.replace('three_youths_notified_ann_', '').replace('three_youths_seen_ann_', ''));
              }
            }
          } catch {}
          activeSw.postMessage({
            type: 'SYNC_SW_USER_CONTEXT',
            user: {
              id: String(member.id),
              fullName: String(member.fullName || '').trim(),
              role: String(member.role || 'member'),
              gender: String(member.gender || 'male'),
              uniqueCode: String(member.uniqueCode || '')
            },
            seenIds
          });
        }
      } catch {}
    }

    const identityKey = `${member.id}|${member.fullName || ''}|${member.role || ''}|${member.gender || ''}|${member.uniqueCode || ''}`;
    if (lastSyncedIdentityKey === identityKey) return;

    try {
      if (window.__oneSignalInitPromise) {
        const ready = await window.__oneSignalInitPromise;
        if (!ready) return;
      }
      if (!window.__oneSignalReady) return;

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal: any) {
        try {
          if (!window.__oneSignalReady || !OneSignal || !OneSignal.context) {
            return;
          }
          lastSyncedIdentityKey = identityKey;
          if (typeof OneSignal.login === 'function') {
            await OneSignal.login(String(member.id));
          }
          if (OneSignal.User && typeof OneSignal.User.addTags === 'function') {
            await OneSignal.User.addTags({
              memberId: String(member.id),
              fullName: String(member.fullName || '').trim(),
              role: String(member.role || 'member'),
              gender: String(member.gender || 'male'),
              uniqueCode: String(member.uniqueCode || '')
            });
          }
        } catch {
          // Ignore SDK context errors when running on non-production preview domains
        }
      });
    } catch {
      // Ignore sync errors silently
    }
  },

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Ensure Service Worker is registered for Web Push API on Android & iOS
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });
      } catch (swErr) {
        console.warn('ServiceWorker registration notice:', swErr);
      }
    }

    // 1. Through OneSignal SDK (ensuring first subscriber registration in OneSignal dashboard)
    try {
      if (window.__oneSignalInitPromise) {
        await Promise.race([
          window.__oneSignalInitPromise,
          new Promise((r) => setTimeout(r, 2500))
        ]);
      }
      if (window.OneSignal) {
        if (window.OneSignal.Notifications?.requestPermission) {
          await window.OneSignal.Notifications.requestPermission();
        } else if (window.OneSignal.Slidedown?.promptPush) {
          await window.OneSignal.Slidedown.promptPush({ force: true });
        }
        if (window.OneSignal.User?.PushSubscription?.optIn) {
          await window.OneSignal.User.PushSubscription.optIn();
        }
        if (window.OneSignal.Notifications?.permission === true || Notification.permission === 'granted') {
          return true;
        }
      }
    } catch {
      // Fallback to standard Notification.requestPermission
    }

    // 2. Direct browser Notification API
    if ('Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted' && window.OneSignal?.User?.PushSubscription?.optIn) {
          try {
            await window.OneSignal.User.PushSubscription.optIn();
          } catch {}
        }
        return result === 'granted';
      } catch {
        return false;
      }
    }

    return false;
  },

  /**
   * Resolves the strict notification icon URL:
   * - ONLY if senderRole === 'priest' and a valid photo exists, show the Priest's photo.
   * - For all other roles (Community Owner, Manager, Secretaries, Servants), ALWAYS show the Official Site Logo.
   */
  resolveNotificationIcon(options: {
    announcementId?: string;
    senderRole?: UserRole | string;
    senderPhotoUrl?: string;
  }): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (options.senderRole === 'priest' && options.senderPhotoUrl && options.senderPhotoUrl.trim() !== '') {
      if (options.senderPhotoUrl.startsWith('http') || options.senderPhotoUrl.startsWith('data:image/')) {
        return options.senderPhotoUrl;
      }
      return `${origin}${options.senderPhotoUrl.startsWith('/') ? '' : '/'}${options.senderPhotoUrl}`;
    }
    return `${origin}${SITE_LOGO_URL}`;
  },

  /**
   * Resolves the expandable notification image URL (WhatsApp-style BigPicture when pulling down the notification arrow)
   */
  resolveNotificationExpandableImage(options: {
    announcementId?: string;
    imageUrl?: string;
  }): string | undefined {
    if (!options.imageUrl || options.imageUrl.trim() === '') return undefined;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (options.imageUrl.startsWith('http') || options.imageUrl.startsWith('data:image/')) {
      return options.imageUrl;
    }
    return `${origin}${options.imageUrl.startsWith('/') ? '' : '/'}${options.imageUrl}`;
  },

  /**
   * Displays a native mobile notification in the phone's main notification shade (ستارة إشعارات الهاتف الأساسية)
   * STRICTLY ONCE per announcement ID — never re-notifies or loops sound.
   */
  async showNativeServiceWorkerNotification(options: {
    title: string;
    body: string;
    announcementId?: string;
    senderRole?: UserRole | string;
    senderPhotoUrl?: string;
    imageUrl?: string;
    tag?: string;
    url?: string;
  }): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return false;
    }

    const dedupeId = options.announcementId || options.tag;
    if (dedupeId) {
      if (shownNativeNotifIds.has(dedupeId)) {
        return false;
      }
      shownNativeNotifIds.add(dedupeId);
      try {
        const swSeenKey = `three_youths_notified_ann_${dedupeId}`;
        if (localStorage.getItem(swSeenKey)) {
          return false;
        }
        localStorage.setItem(swSeenKey, 'true');
      } catch {}
    }

    const origin = window.location.origin;
    const iconUrl = this.resolveNotificationIcon({
      announcementId: options.announcementId,
      senderRole: options.senderRole,
      senderPhotoUrl: options.senderPhotoUrl
    });
    const badgeUrl = `${origin}${SITE_BADGE_URL}`;
    const expandableImageUrl = this.resolveNotificationExpandableImage({
      announcementId: options.announcementId,
      imageUrl: options.imageUrl
    });
    const targetUrl = options.url || (options.announcementId ? `/?annId=${encodeURIComponent(options.announcementId)}` : '/');
    const tag = options.tag || options.announcementId || `ty_notif_${Date.now()}`;

    const notifOptions: any = {
      body: options.body,
      icon: iconUrl,
      badge: badgeUrl,
      tag,
      renotify: false,
      requireInteraction: false,
      silent: false,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [120],
      data: {
        url: targetUrl,
        announcementId: options.announcementId
      }
    };

    if (expandableImageUrl) {
      notifOptions.image = expandableImageUrl;
    }

    try {
      if ('serviceWorker' in navigator) {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });
        }
        if (reg?.active) {
          reg.active.postMessage({
            type: 'MARK_ANNOUNCEMENT_NOTIFIED',
            announcementId: dedupeId || tag
          });
        }
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(options.title, notifOptions);
          return true;
        }
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NATIVE_NOTIFICATION',
            title: options.title,
            announcementId: dedupeId || tag,
            options: notifOptions
          });
          return true;
        }
      }

      new Notification(options.title, notifOptions);
      return true;
    } catch (err) {
      console.warn('Native ServiceWorker notification fallback notice:', err);
      try {
        new Notification(options.title, {
          body: options.body,
          icon: iconUrl,
          badge: badgeUrl,
          tag
        } as any);
        return true;
      } catch {
        return false;
      }
    }
  },

  /**
   * Relay announcement push notification to targeted phones via backend OneSignal & SSE Web Push
   */
  async sendAnnouncementPush(announcementOrTitle: Announcement | string, messageArg?: string, announcementIdArg?: string): Promise<boolean> {
    try {
      const payload = typeof announcementOrTitle === 'string'
        ? {
            title: announcementOrTitle,
            message: messageArg || '',
            announcementId: announcementIdArg || `ann_${Date.now()}`,
            targetAudience: 'all',
            url: announcementIdArg ? `/?annId=${encodeURIComponent(announcementIdArg)}` : '/'
          }
        : {
            title: announcementOrTitle.title,
            message: announcementOrTitle.content,
            announcementId: announcementOrTitle.id,
            targetAudience: announcementOrTitle.targetAudience || 'all',
            targetUserId: announcementOrTitle.targetUserId,
            targetServantName: announcementOrTitle.targetServantName,
            senderRole: announcementOrTitle.senderRole,
            senderName: announcementOrTitle.senderName,
            senderPhotoUrl: announcementOrTitle.senderRole === 'priest' ? announcementOrTitle.senderPhotoUrl : undefined,
            imageUrl: announcementOrTitle.imageUrl,
            url: `/?annId=${encodeURIComponent(announcementOrTitle.id)}`,
            data: {
              announcementId: announcementOrTitle.id,
              targetAudience: announcementOrTitle.targetAudience || 'all'
            }
          };

      const res = await fetch('/api/push-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return res.ok;
    } catch (err) {
      console.warn('Error sending push notification:', err);
      return false;
    }
  },

  /**
   * Relay automated push notification EXCLUSIVELY to the assigned servant
   * when new youths are added to their special visitation list.
   * NEVER triggers a notification on the Community Owner's phone.
   */
  async sendServantVisitationPush(options: {
    servantId?: string;
    servantName: string;
    youthNames: string[];
    periodDays: number;
    assignmentId: string;
  }): Promise<boolean> {
    const { servantId, servantName, youthNames, periodDays, assignmentId } = options;
    const title = `🎯 تكليف افتقاد خاص جديد يا ${servantName}`;
    const youthPreview = youthNames.slice(0, 3).join('، ') + (youthNames.length > 3 ? ` و ${youthNames.length - 3} آخرين` : '');
    const message = `تم تعيين ${youthNames.length} مخدومين جدد لقائمتك: (${youthPreview}). مدة التكليف: ${periodDays} يوم. نرجو التواصل والمتابعة الرعوية.`;

    try {
      const res = await fetch('/api/push-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
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
            servantName
          }
        })
      });

      return res.ok;
    } catch (err) {
      console.warn('Error sending servant visitation push:', err);
      return false;
    }
  }
};
