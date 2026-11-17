/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MemberLogin } from './components/MemberLogin';
import { RegistrationPortal } from './components/RegistrationPortal';
import { MemberPortal } from './components/MemberPortal';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { Registrant, AdminSession, Announcement } from './types';
import { ROLE_PERMISSIONS, storageService, notificationService, isPermanentCommunityOwner } from './services/storageService';
import { oneSignalService } from './services/oneSignalService';
import { WhatsAppPushToast } from './components/WhatsAppPushToast';
import { AnnouncementModal } from './components/AnnouncementModal';
import { PublicEventRegistration } from './components/PublicEventRegistration';
import { PENDING_EVENT_REGISTRATION_KEY } from './services/eventsService';
import { OwnerTextEditor } from './components/OwnerTextEditor';
import { clientToMasterPhotoAndDataShield, enforceNuclearStaleCacheReset, isPollingFrozen } from './cloudflareDb';

const ADMIN_SESSION_STORAGE_KEY = 'three_youths_admin_session_v2';
const MEMBER_SESSION_STORAGE_KEY = 'three_youths_member_session_v2';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'member_login' | 'register' | 'member_portal' | 'admin_login' | 'admin_dashboard' | 'event_register'>('member_login');
  const [activeEventRegistrationId, setActiveEventRegistrationId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const evParam = params.get('eventRegister') || params.get('eventId');
      if (evParam && evParam.trim()) {
        return evParam.trim();
      }
      const pathMatch = window.location.pathname.match(/\/events\/([^/]+)\/register/);
      if (pathMatch && pathMatch[1]) {
        return decodeURIComponent(pathMatch[1]);
      }
      return null;
    } catch {
      return null;
    }
  });
  const [loggedInMember, setLoggedInMember] = useState<Registrant | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [prefilledLoginName, setPrefilledLoginName] = useState<string>('');
  const [activePushAnnouncement, setActivePushAnnouncement] = useState<Announcement | null>(null);
  const [selectedModalAnnouncement, setSelectedModalAnnouncement] = useState<Announcement | null>(null);
  const [pendingQuizId, setPendingQuizId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qId = params.get('quizId');
      if (qId && qId.trim()) {
        sessionStorage.setItem('three_youths_pending_quiz_id', qId.trim());
        return qId.trim();
      }
      return sessionStorage.getItem('three_youths_pending_quiz_id');
    } catch {
      return null;
    }
  });

  // Restore sessions from sessionStorage, sync with server, and check URL search params
  useEffect(() => {
    // 1. Client-to-Master Photo & Data Shield + Safe Legacy Cache Purge
    clientToMasterPhotoAndDataShield();
    enforceNuclearStaleCacheReset();
    try {
      const isStandalone =
        (window.navigator as any).standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (isStandalone && 'caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name))).catch(() => {});
      }
    } catch {}

    storageService.initRealtimeSync();
    storageService.migrateLocalPhotosToCloudflareD1().catch(() => {});
    storageService.fetchLatestServerData(true).catch(() => {});

    // Smart Phone Guard: If local list has <= 2 members (incomplete hydration), retry every 2 seconds until full Cloudflare list arrives
    const hydrationGuardTimer = setInterval(() => {
      if (isPollingFrozen()) return;
      if (storageService.getRegistrants().length <= 2) {
        storageService.fetchLatestServerData(true).catch(() => {});
      } else {
        clearInterval(hydrationGuardTimer);
      }
    }, 2000);

    // Check URL parameters for direct link to registration or shared quiz
    const params = new URLSearchParams(window.location.search);
    const sharedQuizId = params.get('quizId');
    if (sharedQuizId && sharedQuizId.trim()) {
      try {
        sessionStorage.setItem('three_youths_pending_quiz_id', sharedQuizId.trim());
        setPendingQuizId(sharedQuizId.trim());
      } catch {}
    }

    if (params.get('view') === 'register' || params.get('page') === 'register') {
      setCurrentPage('register');
      return () => clearInterval(hydrationGuardTimer);
    }

    const evParam = params.get('eventRegister') || params.get('eventId');
    const pathMatch = window.location.pathname.match(/\/events\/([^/]+)\/register/);
    const resolvedEventId =
      (evParam && evParam.trim()) ||
      (pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : null);

    if (resolvedEventId) {
      setActiveEventRegistrationId(resolvedEventId);
      try {
        const savedMem = sessionStorage.getItem(MEMBER_SESSION_STORAGE_KEY);
        if (savedMem) {
          const parsed = JSON.parse(savedMem);
          const fresh = storageService.getRegistrants().find(r => r.id === parsed.id);
          if (fresh) setLoggedInMember(fresh);
        }
      } catch {}
      setCurrentPage('event_register');
      return () => clearInterval(hydrationGuardTimer);
    }

    const savedMember = sessionStorage.getItem(MEMBER_SESSION_STORAGE_KEY);
    if (savedMember) {
      try {
        let mem = JSON.parse(savedMember);
        const currentRegs = storageService.getRegistrants();
        const freshMember = currentRegs.find(r => r.id === mem.id || r.fullName === mem.fullName);
        if (freshMember) {
          if (storageService.isUserBlocked(freshMember.phone)) {
            sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
            localStorage.removeItem('three_youths_last_login');
            localStorage.removeItem('three_youths_remembered_user');
            setLoggedInMember(null);
            setCurrentPage('member_login');
            return () => clearInterval(hydrationGuardTimer);
          }
          mem = freshMember;
          sessionStorage.setItem(MEMBER_SESSION_STORAGE_KEY, JSON.stringify(mem));
        } else if (currentRegs.length > 2 && mem.role !== 'community_owner') {
          sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
          localStorage.removeItem('three_youths_last_login');
          localStorage.removeItem('three_youths_remembered_user');
          setLoggedInMember(null);
          setCurrentPage('member_login');
          return () => clearInterval(hydrationGuardTimer);
        }

        if (mem.role === 'community_owner' || isPermanentCommunityOwner(mem)) {
          storageService.setOwnerDeviceAuthorized(true);
          const freshOwner = storageService.getRegistrants().find(r => r.id === 'reg_owner_main' || r.role === 'community_owner');
          mem = {
            ...(freshOwner || mem),
            id: 'reg_owner_main',
            uniqueCode: 'TY-0001',
            fullName: 'ميخائيل ادور راتب',
            email: 'admin@threeholyyouth.org',
            role: 'community_owner',
            permissions: { ...ROLE_PERMISSIONS.community_owner }
          };
          sessionStorage.setItem(MEMBER_SESSION_STORAGE_KEY, JSON.stringify(mem));
        }
        setLoggedInMember(mem);

        const existingAdminStr = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
        if (existingAdminStr && mem.role !== 'member') {
          try {
            const parsedAdm = JSON.parse(existingAdminStr);
            if (mem.role === 'community_owner' || isPermanentCommunityOwner(parsedAdm)) {
              parsedAdm.id = 'reg_owner_main';
              parsedAdm.role = 'community_owner';
              parsedAdm.name = 'ميخائيل ادور راتب';
              parsedAdm.email = 'admin@threeholyyouth.org';
              parsedAdm.permissions = { ...ROLE_PERMISSIONS.community_owner };
              sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(parsedAdm));
            }
            setAdminSession(parsedAdm);
            setCurrentPage('admin_dashboard');
            return;
          } catch {}
        }

        setCurrentPage('member_portal');
        return;
      } catch {
        sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
      }
    }

    const savedAdmin = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (savedAdmin) {
      try {
        let adm = JSON.parse(savedAdmin);
        if (adm.role === 'community_owner' || isPermanentCommunityOwner(adm)) {
          storageService.setOwnerDeviceAuthorized(true);
          const freshOwner = storageService.getRegistrants().find(r => r.id === 'reg_owner_main' || r.role === 'community_owner');
          adm = {
            ...adm,
            id: 'reg_owner_main',
            name: freshOwner?.fullName || 'ميخائيل ادور راتب',
            email: 'admin@threeholyyouth.org',
            role: 'community_owner',
            permissions: { ...ROLE_PERMISSIONS.community_owner }
          };
          sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(adm));
        }
        setAdminSession(adm);
        setCurrentPage('admin_dashboard');
      } catch {
        sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      }
    }

    // Global background & wake-up synchronization across iOS & Android Home Screen PWAs and browsers (respecting 10s mutation freeze)
    const handleGlobalVisibilityOrFocus = () => {
      if (isPollingFrozen()) return;
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        storageService.fetchLatestServerData(false).catch(() => {});
      }
    };

    const handlePageShow = () => {
      if (isPollingFrozen()) return;
      storageService.fetchLatestServerData(false).catch(() => {});
    };

    const refreshLiveSessionState = () => {
      try {
        const rawAdmin = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
        if (rawAdmin) {
          const parsedAdmin = JSON.parse(rawAdmin);
          setAdminSession(prev => {
            if (!prev) return parsedAdmin;
            const isOwner = prev.role === 'community_owner' || isPermanentCommunityOwner(prev) || isPermanentCommunityOwner(parsedAdmin);
            const nextRole = isOwner ? 'community_owner' : parsedAdmin.role;
            const nextPerms = isOwner ? ROLE_PERMISSIONS.community_owner : parsedAdmin.permissions;
            if (
              prev.role !== nextRole ||
              JSON.stringify(prev.permissions || {}) !== JSON.stringify(nextPerms || {})
            ) {
              return { ...prev, ...parsedAdmin, role: nextRole, permissions: nextPerms };
            }
            return prev;
          });
        }
        const rawMem = sessionStorage.getItem(MEMBER_SESSION_STORAGE_KEY);
        if (rawMem) {
          const parsedMem = JSON.parse(rawMem);
          const deletedIds = storageService.getDeletedRegistrantIds();
          const currentRegs = storageService.getRegistrants();
          const cancelledExplicitly = currentRegs.some(r => r.id === parsedMem.id && r.status === 'cancelled');
          const isOwner = parsedMem.role === 'community_owner' || isPermanentCommunityOwner(parsedMem) || parsedMem.id === 'reg_owner_main';
          if (!isOwner && (deletedIds.has(parsedMem.id) || cancelledExplicitly)) {
            storageService.purgeLocalMemberData(parsedMem.id);
            setLoggedInMember(null);
            setCurrentPage(prevPage => (prevPage === 'member_portal' ? 'member_login' : prevPage));
            return;
          }
          setLoggedInMember(prev => {
            if (!prev) return parsedMem;
            const ownerFlag = prev.role === 'community_owner' || isPermanentCommunityOwner(prev) || isPermanentCommunityOwner(parsedMem);
            const nextRole = ownerFlag ? 'community_owner' : parsedMem.role;
            const nextPerms = ownerFlag ? ROLE_PERMISSIONS.community_owner : parsedMem.permissions;
            if (
              prev.role !== nextRole ||
              JSON.stringify(prev.permissions || {}) !== JSON.stringify(nextPerms || {})
            ) {
              return { ...prev, ...parsedMem, role: nextRole, permissions: nextPerms };
            }
            return prev;
          });
        } else {
          setLoggedInMember(prev => {
            if (!prev) return null;
            const isOwner = prev.role === 'community_owner' || isPermanentCommunityOwner(prev) || prev.id === 'reg_owner_main';
            if (!isOwner && storageService.getDeletedRegistrantIds().has(prev.id)) {
              setCurrentPage(prevPage => (prevPage === 'member_portal' ? 'member_login' : prevPage));
              return null;
            }
            return prev;
          });
        }
      } catch {}
    };

    const unsubStorage = storageService.subscribe(() => {
      storageService.syncCurrentSession();
      refreshLiveSessionState();
    });

    window.addEventListener('three_youths_session_updated', refreshLiveSessionState);
    window.addEventListener('focus', handleGlobalVisibilityOrFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handlePageShow);
    document.addEventListener('visibilitychange', handleGlobalVisibilityOrFocus);

    const globalSyncInterval = setInterval(() => {
      if (isPollingFrozen()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        storageService.fetchLatestServerData(false).catch(() => {});
        storageService.fetchLatestAttendanceSession().catch(() => {});
      }
    }, 3000);

    return () => {
      unsubStorage();
      window.removeEventListener('three_youths_session_updated', refreshLiveSessionState);
      window.removeEventListener('focus', handleGlobalVisibilityOrFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handlePageShow);
      document.removeEventListener('visibilitychange', handleGlobalVisibilityOrFocus);
      clearInterval(globalSyncInterval);
    };
  }, []);

  // Unified Login Handler for all users (Community Owner, Managers, Servants, Members)
  const handleMemberLoginSuccess = (member: Registrant) => {
    const isOwner = member.role === 'community_owner' || isPermanentCommunityOwner(member);
    const lockedRole = isOwner ? 'community_owner' : member.role;
    const resolvedPermissions = isOwner
      ? { ...ROLE_PERMISSIONS.community_owner }
      : storageService.resolvePermissions(lockedRole, member.permissions);
    const syncedMember: Registrant = {
      ...member,
      id: isOwner ? 'reg_owner_main' : member.id,
      uniqueCode: isOwner ? 'TY-0001' : member.uniqueCode,
      fullName: isOwner ? 'ميخائيل ادور راتب' : member.fullName,
      email: isOwner ? 'admin@threeholyyouth.org' : member.email,
      role: lockedRole,
      permissions: resolvedPermissions
    };
    sessionStorage.setItem(MEMBER_SESSION_STORAGE_KEY, JSON.stringify(syncedMember));
    setLoggedInMember(syncedMember);
    storageService.setOwnerDeviceAuthorized(isOwner);

    // If the logged in user is community_owner, community_manager, meeting_secretary, service_secretary, or servant:
    if (lockedRole !== 'member') {
      const admSession: AdminSession = {
        id: syncedMember.id,
        email: isOwner ? 'admin@threeholyyouth.org' : (syncedMember.phone || `${syncedMember.uniqueCode}@threeyouths.org`),
        name: syncedMember.fullName,
        role: lockedRole,
        gender: syncedMember.gender,
        permissions: resolvedPermissions,
        token: `adm_${Date.now()}`
      };
      sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(admSession));
      setAdminSession(admSession);
      setCurrentPage('admin_dashboard');
    } else {
      // Regular youth member opens personal member portal (ID card & stamps)
      setCurrentPage('member_portal');
    }
  };

  // Synchronize logged-in user identity with OneSignal tags for targeted push delivery
  useEffect(() => {
    const list = storageService.getRegistrants();
    const activeMember = loggedInMember || (adminSession ? list.find(r =>
      r.id === adminSession.id ||
      r.fullName === adminSession.name ||
      (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
      (adminSession.role === 'community_owner' && r.role === 'community_owner')
    ) : null);

    if (activeMember) {
      oneSignalService.syncUserIdentity({
        id: activeMember.id,
        fullName: activeMember.fullName,
        role: activeMember.role,
        gender: activeMember.gender,
        uniqueCode: activeMember.uniqueCode
      }).catch(() => {});
    }
  }, [loggedInMember, adminSession]);

  // Listen for Service Worker notification click or ?annId= query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const annIdParam = params.get('annId');
    if (annIdParam) {
      const targetAnn = storageService.getAnnouncements().find(a => a.id === annIdParam);
      if (targetAnn) {
        setSelectedModalAnnouncement(targetAnn);
      }
    }

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FORCE_CLOUDFLARE_SYNC') {
        storageService.fetchLatestServerData(true).catch(() => {});
      }
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        const clickedId = event.data.announcementId;
        if (clickedId) {
          storageService.fetchLatestServerData(true).finally(() => {
            const targetAnn = storageService.getAnnouncements().find(a => a.id === clickedId);
            if (targetAnn) {
              handleOpenAnnouncementFromPush(targetAnn);
            }
          });
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
  }, [loggedInMember, adminSession]);

  // Listen for announcements and trigger WhatsApp-style push toast & native Service Worker notifications
  useEffect(() => {
    const checkLatestAnnouncements = () => {
      let announcements = storageService.getAnnouncements();
      if (!announcements || announcements.length === 0) return;

      const allRegs = storageService.getRegistrants();
      const resolvedMember: Registrant | null = loggedInMember || (adminSession ? allRegs.find(r =>
        (adminSession.id && r.id === adminSession.id) ||
        (adminSession.name && r.fullName === adminSession.name) ||
        (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
        (adminSession.role === 'community_owner' && r.role === 'community_owner')
      ) || null : null);

      announcements = announcements.filter(a =>
        storageService.isMemberTargetedByAnnouncement(
          a,
          resolvedMember,
          adminSession?.role,
          adminSession?.name,
          adminSession?.id
        )
      );

      if (announcements.length === 0) return;

      const nowMs = Date.now();
      const firstName = (resolvedMember?.fullName || adminSession?.name || 'أخي الحبيب').trim().split(/\s+/)[0];
      const currentActorName = (resolvedMember?.fullName || adminSession?.name || '').trim();

      for (const ann of announcements) {
        if (!ann || !ann.id) continue;
        const createdMs = ann.createdAt ? new Date(ann.createdAt).getTime() : 0;
        if (createdMs > 0 && nowMs - createdMs > 3600000) continue;

        const seenKey = `three_youths_seen_ann_${ann.id}`;
        const notifiedKey = `three_youths_notified_ann_${ann.id}`;
        const isAlreadySeen = localStorage.getItem(seenKey);
        const isAlreadyNotified = localStorage.getItem(notifiedKey);

        if (!isAlreadySeen && !isAlreadyNotified) {
          try {
            localStorage.setItem(notifiedKey, 'true');
          } catch {}

          if (!(currentActorName && ann.senderName && currentActorName === ann.senderName.trim())) {
            setActivePushAnnouncement(ann);
          }

          if (
            oneSignalService.isPushEnabled() ||
            (notificationService.isSupported() && notificationService.getPermission() === 'granted')
          ) {
            try {
              const formattedBody = (ann.content || '')
                .replace(/\[الاسم الأول\]/g, firstName)
                .replace(/\[الاسم الاول\]/g, firstName)
                .replace(/\[الاسم\]/g, firstName)
                .replace(/\bفلان\b/g, firstName);

              oneSignalService.showNativeServiceWorkerNotification({
                title: 'الثلاثة فتية - اجتماع الشباب السوداني',
                body: formattedBody,
                announcementId: ann.id,
                senderRole: ann.senderRole,
                senderPhotoUrl: ann.senderRole === 'priest' ? ann.senderPhotoUrl : undefined,
                imageUrl: ann.imageUrl,
                tag: `ann_${ann.id}`
              }).catch(() => {});
            } catch {}
          }
        }
      }
    };

    checkLatestAnnouncements();

    const unsub = storageService.subscribe(() => {
      const currentAnnouncements = storageService.getAnnouncements();
      const activeAnnIds = new Set(currentAnnouncements.map(a => a.id));
      setActivePushAnnouncement(prev => (prev && !activeAnnIds.has(prev.id) ? null : prev));
      setSelectedModalAnnouncement(prev => (prev && !activeAnnIds.has(prev.id) ? null : prev));

      checkLatestAnnouncements();

      // Check if logged in member was cancelled or deleted by admin in real-time
      if (loggedInMember && loggedInMember.role !== 'community_owner') {
        const deletedIds = storageService.getDeletedRegistrantIds();
        if (deletedIds.has(loggedInMember.id)) {
          sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
          localStorage.removeItem('three_youths_last_login');
          localStorage.removeItem('three_youths_remembered_user');
          setLoggedInMember(null);
          setCurrentPage('member_login');
          return;
        }

        const fresh = storageService.getRegistrants().find(r => r.id === loggedInMember.id);
        if (!fresh || fresh.status === 'cancelled' || fresh.status === 'blocked' || storageService.isUserBlocked(fresh.phone)) {
          sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
          localStorage.removeItem('three_youths_last_login');
          localStorage.removeItem('three_youths_remembered_user');
          setLoggedInMember(null);
          setCurrentPage('member_login');
          return;
        }
      }

      // Check and live-sync admin/servant permissions in real time
      if (adminSession) {
        const isOwnerAdmin = adminSession.role === 'community_owner' || isPermanentCommunityOwner(adminSession);
        if (isOwnerAdmin) {
          if (
            adminSession.role !== 'community_owner' ||
            JSON.stringify(adminSession.permissions) !== JSON.stringify(ROLE_PERMISSIONS.community_owner)
          ) {
            const lockedOwnerSession: AdminSession = {
              ...adminSession,
              id: 'reg_owner_main',
              role: 'community_owner',
              permissions: { ...ROLE_PERMISSIONS.community_owner }
            };
            sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(lockedOwnerSession));
            setAdminSession(lockedOwnerSession);
          }
          return;
        }
        const list = storageService.getRegistrants();
        const match = list.find(r => 
          (adminSession.id && r.id === adminSession.id) ||
          (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
          r.fullName === adminSession.name
        );
        if (match) {
          if (match.status === 'cancelled' || match.status === 'blocked' || storageService.isUserBlocked(match.phone)) {
            sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
            setAdminSession(null);
            setCurrentPage('member_login');
            return;
          }
          const resolvedPerms = storageService.resolvePermissions(match.role, match.permissions);
          if (match.role !== adminSession.role || JSON.stringify(resolvedPerms) !== JSON.stringify(adminSession.permissions)) {
            const updatedSession: AdminSession = {
              ...adminSession,
              role: match.role,
              permissions: resolvedPerms
            };
            sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
            setAdminSession(updatedSession);
          }
        }
      }
    });

    const handleSessionUpdated = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail) {
        setAdminSession(prev => {
          if (!prev) return prev;
          const isOwner = prev.role === 'community_owner' || isPermanentCommunityOwner(prev);
          const newRole = isOwner ? 'community_owner' : (customEvt.detail.role || prev.role);
          const newPerms = isOwner ? { ...ROLE_PERMISSIONS.community_owner } : (customEvt.detail.permissions || prev.permissions);
          if (prev.role === newRole && JSON.stringify(prev.permissions) === JSON.stringify(newPerms)) {
            return prev;
          }
          const updated: AdminSession = {
            ...prev,
            role: newRole,
            permissions: newPerms
          };
          sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
        setLoggedInMember(prev => {
          if (!prev || !customEvt.detail.member || customEvt.detail.member.id !== prev.id) {
            return prev;
          }
          const isOwner = prev.role === 'community_owner' || isPermanentCommunityOwner(prev);
          const nextMem = isOwner
            ? { ...customEvt.detail.member, role: 'community_owner' as const, permissions: { ...ROLE_PERMISSIONS.community_owner } }
            : { ...customEvt.detail.member };
          if (JSON.stringify(prev) === JSON.stringify(nextMem)) {
            return prev;
          }
          return nextMem;
        });
      }
    };
    window.addEventListener('three_youths_session_updated', handleSessionUpdated);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkLatestAnnouncements();
    }, 8000);

    return () => {
      unsub();
      window.removeEventListener('three_youths_session_updated', handleSessionUpdated);
      clearInterval(interval);
    };
  }, [loggedInMember, adminSession]);

  // Online presence & Last Seen tracking for active member or admin
  useEffect(() => {
    const resolveActiveId = (): string | null => {
      if (loggedInMember?.id) return loggedInMember.id;
      if (adminSession?.id) return adminSession.id;
      if (!adminSession) return null;
      if (adminSession.role === 'community_owner') return 'reg_owner_main';
      const list = storageService.getRegistrants();
      const found = list.find(
        r =>
          (adminSession.name && r.fullName === adminSession.name) ||
          (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email))
      );
      return found?.id || null;
    };

    const pingOnline = () => {
      const id = resolveActiveId();
      if (id && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
        storageService.updateUserPresence(id, true);
      }
    };

    // Ping presence immediately
    pingOnline();

    const heartbeat = setInterval(pingOnline, 25000);

    const handleOffline = () => {
      const id = resolveActiveId();
      if (id) {
        storageService.updateUserPresence(id, false);
      }
    };

    window.addEventListener('beforeunload', handleOffline);
    window.addEventListener('pagehide', handleOffline);

    const handleVisibility = () => {
      const id = resolveActiveId();
      if (!id) return;
      if (document.visibilityState === 'hidden') {
        storageService.updateUserPresence(id, false);
      } else if (document.visibilityState === 'visible') {
        storageService.updateUserPresence(id, true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleOffline);
      window.removeEventListener('pagehide', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loggedInMember?.id, adminSession?.id, adminSession?.email, adminSession?.name, adminSession?.role]);

  // Handle clicking WhatsApp push notification banner / toast with verified auto-login
  const handleOpenAnnouncementFromPush = (ann: Announcement) => {
    try {
      localStorage.setItem(`three_youths_seen_ann_${ann.id}`, 'true');
      localStorage.setItem(`three_youths_notified_ann_${ann.id}`, 'true');
    } catch {}
    setActivePushAnnouncement(null);

    const allRegs = storageService.getRegistrants();
    const activeViewer = loggedInMember || (adminSession ? allRegs.find(r =>
      (adminSession.id && r.id === adminSession.id) ||
      (adminSession.name && r.fullName === adminSession.name) ||
      (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
      (adminSession.role === 'community_owner' && r.role === 'community_owner')
    ) : null);

    if (activeViewer) {
      storageService.recordAnnouncementView(ann.id, activeViewer).catch(() => {});
    }

    // If user is NOT currently logged in, execute auto-login only if credentials are valid on server
    if (!loggedInMember && !adminSession) {
      try {
        const savedLast = localStorage.getItem('three_youths_last_login');
        const savedRemembered = localStorage.getItem('three_youths_remembered_user');
        let candidate: Registrant | null = null;
        if (savedLast) {
          candidate = JSON.parse(savedLast);
        } else if (savedRemembered) {
          const rem = JSON.parse(savedRemembered);
          const list = storageService.getRegistrants();
          candidate = list.find(r => r.fullName === rem.fullName || r.phone === rem.phone || r.uniqueCode === rem.uniqueCode) || null;
        }

        if (candidate) {
          const deletedIds = storageService.getDeletedRegistrantIds();
          if (deletedIds.has(candidate.id)) {
            localStorage.removeItem('three_youths_last_login');
            localStorage.removeItem('three_youths_remembered_user');
            return;
          }
          const fresh = storageService.getRegistrants().find(r => r.id === candidate!.id || r.fullName === candidate!.fullName);
          if (fresh && fresh.status !== 'blocked' && fresh.status !== 'cancelled' && !storageService.isUserBlocked(fresh.phone)) {
            handleMemberLoginSuccess(fresh);
          } else {
            // Cancelled or deleted: wipe saved data
            localStorage.removeItem('three_youths_last_login');
            localStorage.removeItem('three_youths_remembered_user');
          }
        }
      } catch (err) {
        console.warn('Auto-login on push click error:', err);
      }
    }

    // Open full announcement modal
    setSelectedModalAnnouncement(ann);
  };

  const handleMemberLogout = () => {
    if (loggedInMember?.id) {
      storageService.updateUserPresence(loggedInMember.id, false);
    }
    storageService.setOwnerDeviceAuthorized(false);
    sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    try {
      localStorage.removeItem('three_youths_last_login');
      localStorage.removeItem('three_youths_remembered_user');
      localStorage.removeItem('three_youths_member_session');
    } catch {}
    setLoggedInMember(null);
    setAdminSession(null);
    setCurrentPage('member_login');
  };

  // Admin Login Handler (legacy support)
  const handleAdminLoginSuccess = (session: AdminSession) => {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    storageService.setOwnerDeviceAuthorized(session.role === 'community_owner');
    setAdminSession(session);
    setCurrentPage('admin_dashboard');
  };

  const handleAdminLogout = () => {
    if (adminSession?.email) {
      const list = storageService.getRegistrants();
      const match = list.find(r => r.fullName === adminSession.name || r.phone === adminSession.email);
      if (match?.id) {
        storageService.updateUserPresence(match.id, false);
      }
    }
    storageService.setOwnerDeviceAuthorized(false);
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(MEMBER_SESSION_STORAGE_KEY);
    try {
      localStorage.removeItem('three_youths_last_login');
      localStorage.removeItem('three_youths_remembered_user');
      localStorage.removeItem('three_youths_member_session');
    } catch {}
    setAdminSession(null);
    setLoggedInMember(null);
    setCurrentPage('member_login');
  };

  const handleSwitchLeaderToMemberPortal = () => {
    const allRegs = storageService.getRegistrants();
    let targetMember: Registrant | undefined = loggedInMember || undefined;
    if (!targetMember && adminSession) {
      targetMember = allRegs.find(r =>
        (adminSession.id && r.id === adminSession.id) ||
        (adminSession.name && r.fullName === adminSession.name) ||
        (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
        (adminSession.role === 'community_owner' && r.role === 'community_owner')
      );
      if (!targetMember) {
        targetMember = {
          id: adminSession.id || 'reg_owner_main',
          uniqueCode: 'TY-0001',
          fullName: adminSession.name || 'ميخائيل ادور راتب',
          gender: adminSession.gender || 'male',
          phone: adminSession.email || '+20 1288651567',
          whatsapp: adminSession.email || '+20 1288651567',
          dob: '1995-01-01',
          address: '',
          photoUrl: '/owner_portrait.jpg',
          registeredAt: new Date().toISOString(),
          qrData: 'TY-0001',
          role: adminSession.role || 'community_owner',
          permissions: adminSession.permissions,
          status: 'active'
        };
      }
    }
    if (targetMember) {
      sessionStorage.setItem(MEMBER_SESSION_STORAGE_KEY, JSON.stringify(targetMember));
      setLoggedInMember(targetMember);
      setCurrentPage('member_portal');
    } else {
      setCurrentPage('member_login');
    }
  };

  const isOwnerAuthenticated = Boolean(
    loggedInMember?.role === 'community_owner' ||
    adminSession?.role === 'community_owner' ||
    storageService.isCommunityOwnerLoggedIn()
  );

  return (
    <div className="min-h-screen bg-slate-50 font-['Cairo',sans-serif]">
      
      {/* 1. Default Landing Page: Unified Login (دخول لجميع الأعضاء والخدام والإدارة والمالك) */}
      {currentPage === 'member_login' && (
        <MemberLogin
          onLoginSuccess={(mem) => {
            setPrefilledLoginName('');
            handleMemberLoginSuccess(mem);
          }}
          onGoToRegister={() => {
            setPrefilledLoginName('');
            setCurrentPage('register');
          }}
          pendingQuizId={pendingQuizId}
          initialFullName={prefilledLoginName}
        />
      )}

      {/* 2. Dedicated Registration Page with separate link/view */}
      {currentPage === 'register' && (
        <RegistrationPortal
          onBackToLogin={() => setCurrentPage('member_login')}
          onRedirectToLoginWithName={(dupName) => {
            setPrefilledLoginName(dupName);
            setCurrentPage('member_login');
          }}
          pendingEventId={activeEventRegistrationId}
          onReturnToEventRegistration={(evId, newMember) => {
            sessionStorage.setItem(MEMBER_SESSION_STORAGE_KEY, JSON.stringify(newMember));
            setLoggedInMember(newMember);
            setActiveEventRegistrationId(evId);
            setCurrentPage('event_register');
          }}
          onOpenAdminLogin={() => {
            if (adminSession) {
              setCurrentPage('admin_dashboard');
            } else {
              setCurrentPage('admin_login');
            }
          }}
        />
      )}

      {/* 2.5 Public Event Registration Flow */}
      {currentPage === 'event_register' && activeEventRegistrationId && (
        <PublicEventRegistration
          eventId={activeEventRegistrationId}
          initialMember={loggedInMember}
          onRedirectToSiteRegistration={(evId) => {
            try {
              sessionStorage.setItem(PENDING_EVENT_REGISTRATION_KEY, evId);
            } catch {}
            setActiveEventRegistrationId(evId);
            setCurrentPage('register');
          }}
          onBackToHome={() => {
            if (loggedInMember) {
              setCurrentPage('member_portal');
            } else if (adminSession) {
              setCurrentPage('admin_dashboard');
            } else {
              setCurrentPage('member_login');
            }
          }}
        />
      )}

      {/* 3. Member Personal Portal & ID Card (with 4 Friday stamps) */}
      {currentPage === 'member_portal' && loggedInMember && (
        <MemberPortal
          member={loggedInMember}
          onLogout={handleMemberLogout}
          onOpenEventRegistration={(evId) => {
            setActiveEventRegistrationId(evId);
            setCurrentPage('event_register');
          }}
          onOpenServantDashboard={() => {
            const servSession: AdminSession = {
              id: loggedInMember.id,
              email: loggedInMember.phone,
              name: loggedInMember.fullName,
              role: loggedInMember.role,
              gender: loggedInMember.gender,
              permissions: loggedInMember.permissions,
              token: `serv_${Date.now()}`
            };
            sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(servSession));
            setAdminSession(servSession);
            setCurrentPage('admin_dashboard');
          }}
        />
      )}

      {/* 4. Admin Login Portal */}
      {currentPage === 'admin_login' && (
        <AdminLogin
          onLoginSuccess={handleAdminLoginSuccess}
          onBackToPublic={() => setCurrentPage('member_login')}
        />
      )}

      {/* 5. Strictly Private Admin Dashboard */}
      {currentPage === 'admin_dashboard' && adminSession && (
        <AdminDashboard
          session={adminSession}
          onLogout={handleAdminLogout}
          onViewPublicPortal={handleSwitchLeaderToMemberPortal}
        />
      )}

      {/* WhatsApp-Style Push Toast (Slides down from top of phone screen like WhatsApp notification) */}
      <WhatsAppPushToast
        announcement={activePushAnnouncement}
        onOpenAnnouncement={handleOpenAnnouncementFromPush}
        onDismiss={() => {
          if (activePushAnnouncement) {
            try {
              localStorage.setItem(`three_youths_seen_ann_${activePushAnnouncement.id}`, 'true');
            } catch {}
            if (
              activePushAnnouncement.isVisitationTaskAlert || 
              activePushAnnouncement.targetAudience === 'servant_personal' || 
              activePushAnnouncement.title?.includes('تكليف افتقاد')
            ) {
              storageService.deleteAnnouncement(activePushAnnouncement.id);
            }
          }
          setActivePushAnnouncement(null);
        }}
        memberFirstName={loggedInMember?.fullName?.split(' ')[0]}
      />

      {/* Full Announcement Modal when clicked from notification */}
      {selectedModalAnnouncement && (() => {
        const allRegs = storageService.getRegistrants();
        const resolvedViewer = loggedInMember || (adminSession ? allRegs.find(r =>
          (adminSession.id && r.id === adminSession.id) ||
          (adminSession.name && r.fullName === adminSession.name) ||
          (adminSession.email && (r.phone === adminSession.email || r.email === adminSession.email)) ||
          (adminSession.role === 'community_owner' && r.role === 'community_owner')
        ) : undefined);

        return (
          <AnnouncementModal
            announcement={selectedModalAnnouncement}
            onClose={() => {
              if (
                selectedModalAnnouncement.isVisitationTaskAlert ||
                selectedModalAnnouncement.targetAudience === 'servant_personal' ||
                selectedModalAnnouncement.title?.includes('تكليف افتقاد')
              ) {
                storageService.deleteAnnouncement(selectedModalAnnouncement.id);
              }
              setSelectedModalAnnouncement(null);
            }}
            currentUserId={resolvedViewer?.id || loggedInMember?.id || adminSession?.id}
            memberFirstName={resolvedViewer?.fullName?.split(' ')[0] || loggedInMember?.fullName?.split(' ')[0] || adminSession?.name?.split(' ')[0]}
          />
        );
      })()}

      {/* Global Live Site Text Editor & Real-Time DOM Text Override Engine (Exclusive to Community Owner) */}
      <OwnerTextEditor
        isOwner={isOwnerAuthenticated}
        currentPage={currentPage}
        onNavigatePage={(targetPage) => {
          if (targetPage === 'member_portal') {
            handleSwitchLeaderToMemberPortal();
          } else if (targetPage === 'admin_dashboard') {
            if (!adminSession) {
              const ownerReg = storageService.getRegistrants().find(r => r.role === 'community_owner');
              if (ownerReg) {
                const sess: AdminSession = {
                  id: ownerReg.id,
                  email: ownerReg.phone,
                  name: ownerReg.fullName,
                  role: 'community_owner',
                  gender: ownerReg.gender || 'male',
                  permissions: ownerReg.permissions,
                  token: `own_${Date.now()}`
                };
                sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(sess));
                setAdminSession(sess);
              }
            }
            setCurrentPage('admin_dashboard');
          } else {
            setCurrentPage(targetPage);
          }
        }}
      />

    </div>
  );
}
