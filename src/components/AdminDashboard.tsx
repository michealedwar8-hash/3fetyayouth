import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { AdminSession, Registrant, AttendanceRecord, UserRole, getMemberGender, Announcement } from '../types';
import { storageService, ROLE_PERMISSIONS, hasAccess, normalizeArabicNameForComparison, isThreePartNameMatch, isPermanentCommunityOwner, normalizeMember } from '../services/storageService';
import { applySmartNeverShrinkState, filterOutDeletedAndGhosts, isPollingFrozen, deduplicateAndMergeMembers, ensureUniqueSingleCardPerMember, getFastStateSignature, mergeNewMembersAdditive, forceFetchAndSyncAllMembers, getPermanentDeletedIdsSet, getPermanentDeletedNamesSet, getBaseMemberId } from '../cloudflareDb';
import { oneSignalService } from '../services/oneSignalService';

const MakhdomeenView = lazy(() => import('./views/MakhdomeenView').then(m => ({ default: m.MakhdomeenView })));
const NotificationShade = lazy(() => import('./NotificationShade').then(m => ({ default: m.NotificationShade })));
const AnnouncementModal = lazy(() => import('./AnnouncementModal').then(m => ({ default: m.AnnouncementModal })));
const VisitationView = lazy(() => import('./views/VisitationView').then(m => ({ default: m.VisitationView })));
const BirthdaysView = lazy(() => import('./views/BirthdaysView').then(m => ({ default: m.BirthdaysView })));
const IdCardsGallery = lazy(() => import('./views/IdCardsGallery').then(m => ({ default: m.IdCardsGallery })));
const SystemDataView = lazy(() => import('./views/SystemDataView').then(m => ({ default: m.SystemDataView })));
const ScannerView = lazy(() => import('./views/ScannerView').then(m => ({ default: m.ScannerView })));
const AttendanceLogView = lazy(() => import('./views/AttendanceLogView').then(m => ({ default: m.AttendanceLogView })));
const AttendanceGiftsView = lazy(() => import('./views/AttendanceGiftsView').then(m => ({ default: m.AttendanceGiftsView })));
const AnnouncementsDashboard = lazy(() => import('./views/AnnouncementsDashboard').then(m => ({ default: m.AnnouncementsDashboard })));
const FirebaseSetupView = lazy(() => import('./views/FirebaseSetupView').then(m => ({ default: m.FirebaseSetupView })));
const KahootDashboard = lazy(() => import('./views/KahootDashboard').then(m => ({ default: m.KahootDashboard })));
const EventsDashboard = lazy(() => import('./views/EventsDashboard').then(m => ({ default: m.EventsDashboard })));

const DashboardViewFallback = (
  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
    <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
    <span className="text-xs font-bold">جاري تحميل القسم...</span>
  </div>
);
import { 
  Users, 
  HeartHandshake, 
  Cake, 
  CreditCard, 
  Database, 
  Scan, 
  CalendarCheck, 
  ShieldAlert, 
  LogOut, 
  ExternalLink, 
  Menu, 
  X,
  Crown,
  ChevronLeft,
  ShieldCheck,
  Award,
  Sparkles,
  Gift,
  Megaphone,
  RefreshCw,
  CheckCircle2,
  Bell,
  Gamepad2,
  Palette,
  Tent
} from 'lucide-react';


interface AdminDashboardProps {
  session: AdminSession;
  onLogout: () => void;
  onViewPublicPortal: () => void;
  onInspectMember?: (member: Registrant) => void;
  isImpersonatedView?: boolean;
}

export type AdminViewType = 
  | 'makhdomeen' 
  | 'events'
  | 'announcements'
  | 'kahoot'
  | 'attendance_gifts'
  | 'visitation' 
  | 'birthdays' 
  | 'id_cards' 
  | 'scanner' 
  | 'attendance' 
  | 'database' 
  | 'firebase_rules';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  session,
  onLogout,
  onViewPublicPortal,
  onInspectMember,
  isImpersonatedView = false,
}) => {
  const [pendingQuizId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('quizId') || sessionStorage.getItem('three_youths_pending_quiz_id');
    } catch {
      return null;
    }
  });
  const [activeView, setActiveView] = useState<AdminViewType>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!isImpersonatedView && (params.get('quizId') || sessionStorage.getItem('three_youths_pending_quiz_id'))) {
        return 'kahoot';
      }
    } catch {}
    const isOwnerSession = isImpersonatedView
      ? (session.role === 'community_owner' || isPermanentCommunityOwner(session))
      : (session.role === 'community_owner' || isPermanentCommunityOwner(session) || storageService.isCommunityOwnerLoggedIn());
    return (!isOwnerSession && session.role === 'servant') ? 'visitation' : 'makhdomeen';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const isPermanentOwnerSession = isImpersonatedView
    ? (session.role === 'community_owner' || isPermanentCommunityOwner(session))
    : (session.role === 'community_owner' || isPermanentCommunityOwner(session) || storageService.isCommunityOwnerLoggedIn());
  const isSeniorLeader = isPermanentOwnerSession || session.role === 'community_manager';
  
  // Data state
  const [registrants, setRegistrants] = useState<Registrant[]>(() => storageService.getRegistrants());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => storageService.getAttendanceRecords());

  // Dynamic Scanner Token (Security Requirement)
  const generateNewScannerToken = () => {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `SCN-${Date.now().toString().slice(-4)}-${randomHex}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity
    return { token, expiresAt };
  };

  const [scannerTokenState, setScannerTokenState] = useState(generateNewScannerToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Notification Shade state & unread tracker
  const [isNotificationShadeOpen, setIsNotificationShadeOpen] = useState(false);
  const [selectedShadeAnnouncement, setSelectedShadeAnnouncement] = useState<Announcement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasActiveCompetition, setHasActiveCompetition] = useState<boolean>(() => storageService.hasActiveKahootCompetition());

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const isOwnerRef = useRef(isPermanentOwnerSession);
  isOwnerRef.current = isPermanentOwnerSession;

  const updateUnread = useCallback(() => {
    const sess = sessionRef.current;
    const allRegs = storageService.getRegistrants();
    const matchedMember = allRegs.find(r =>
      (sess.id && r.id === sess.id) ||
      (sess.name && r.fullName === sess.name) ||
      (sess.email && (r.phone === sess.email || r.email === sess.email)) ||
      (sess.role === 'community_owner' && r.role === 'community_owner')
    ) || null;
    const allAnns = storageService.getAnnouncements();
    const activeAnnIds = new Set(allAnns.map(a => a.id));
    setSelectedShadeAnnouncement(prev => (prev && !activeAnnIds.has(prev.id) ? null : prev));

    const list = allAnns.filter(a =>
      storageService.isMemberTargetedByAnnouncement(a, matchedMember, sess.role, sess.name, sess.id)
    );
    try {
      const saved = localStorage.getItem('three_youths_read_announcements');
      const readSet = saved ? new Set(JSON.parse(saved)) : new Set();
      const nextCount = list.filter(a => !readSet.has(a.id)).length;
      setUnreadCount(prev => (prev === nextCount ? prev : nextCount));
    } catch {
      setUnreadCount(prev => (prev === list.length ? prev : list.length));
    }
  }, []);

  const lastRolePermsSigRef = useRef<string>('');
  const [rolePermsVersion, setRolePermsVersion] = useState(0);

  const refreshData = useCallback(() => {
    try {
      const nextRolePermsSig = JSON.stringify(storageService.getAllRolePermissions());
      if (nextRolePermsSig !== lastRolePermsSigRef.current) {
        lastRolePermsSigRef.current = nextRolePermsSig;
        setRolePermsVersion(v => v + 1);
      }
    } catch {}
    const cleanFreshRegistrants = storageService.getRegistrants();
    const deletedIds = getPermanentDeletedIdsSet();
    const deletedNames = getPermanentDeletedNamesSet();
    setRegistrants(prev => {
      if (prev.length > 30 && cleanFreshRegistrants.length <= 25) {
        return prev;
      }
      const nextList = (isPollingFrozen()
        ? cleanFreshRegistrants
        : mergeNewMembersAdditive(prev, cleanFreshRegistrants, deletedIds, deletedNames)) as Registrant[];
      if (
        prev.length === nextList.length &&
        getFastStateSignature(prev) === getFastStateSignature(nextList)
      ) {
        return prev;
      }
      return [...nextList];
    });
    const freshAtt = storageService.getAttendanceRecords();
    setAttendanceRecords(prev => {
      if (
        prev.length === freshAtt.length &&
        prev[0]?.id === freshAtt[0]?.id &&
        prev[prev.length - 1]?.id === freshAtt[freshAtt.length - 1]?.id
      ) {
        return prev;
      }
      return [...freshAtt];
    });
    updateUnread();
    const activeComp = storageService.hasActiveKahootCompetition();
    setHasActiveCompetition(prev => (prev === activeComp ? prev : activeComp));

    if (isOwnerRef.current) {
      return;
    }

    const sess = sessionRef.current;
    const liveMember = cleanFreshRegistrants.find(r => 
      (sess.email && (r.phone === sess.email || r.email === sess.email)) ||
      (sess.name && r.fullName.trim() === sess.name.trim())
    );
    const liveRole = liveMember?.role || sess.role || 'servant';
    const livePerms = storageService.resolvePermissions(liveRole, liveMember?.permissions || sess.permissions);
    const canManageComp = liveRole === 'community_owner' || liveRole === 'community_manager' || liveRole === 'meeting_secretary' || liveRole === 'priest' || liveRole === 'service_secretary' || livePerms?.canManageKahoot === true;
    if (liveRole === 'servant' && !canManageComp && !activeComp && activeViewRef.current === 'kahoot') {
      setActiveView('visitation');
    }
  }, [updateUnread]);

  const handleSyncWithServer = async (manual = false) => {
    if (manual) {
      setIsSyncing(true);
    }
    await storageService.fetchLatestServerData(manual);
    refreshData();
    const now = new Date();
    setLastSyncText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    if (manual) {
      setIsSyncing(false);
      setSyncNotice('تمت مزامنة البيانات مع السحابة المركزية وجميع الهواتف بنجاح!');
      setTimeout(() => setSyncNotice(null), 4000);
    }
  };


  useEffect(() => {
    storageService.initRealtimeSync();
    refreshData();
    // Only fetch on mount if local cache is incomplete (App.tsx & WebSocket handle ongoing live sync with zero redundant bursts)
    if (storageService.getRegistrants().length <= 2) {
      storageService.fetchLatestServerData(true).then(() => refreshData()).catch(() => {});
    }

    // Subscribe to internal storageService updates (instant 0ms updates via Cloudflare Realtime WebSocket & coalesced sync)
    const unsubscribe = storageService.subscribe(() => {
      refreshData();
    });

    const handleSessionUpdated = () => {
      refreshData();
    };
    window.addEventListener('three_youths_session_updated', handleSessionUpdated);

    return () => {
      unsubscribe();
      window.removeEventListener('three_youths_session_updated', handleSessionUpdated);
    };
  }, [refreshData]);

  const handleSelectView = (view: AdminViewType) => {
    if (view === 'events') {
      const liveRolePerms = isPermanentOwnerSession
        ? ROLE_PERMISSIONS.community_owner
        : storageService.resolvePermissions(
            currentRole,
            currentMemberRecord ? currentMemberRecord.permissions : session.permissions
          );
      if (!isPermanentOwnerSession && !liveRolePerms?.canManageEvents) {
        return;
      }
    }
    if (view === 'scanner') {
      if (Date.now() >= scannerTokenState.expiresAt) {
        setScannerTokenState(generateNewScannerToken());
      }
    }
    setActiveView(view);
    setIsMobileMenuOpen(false);
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0 });
    }
    refreshData();
  };

  const handleRefreshToken = () => {
    setScannerTokenState(generateNewScannerToken());
  };

  // User role determination (Dynamically lookup live member record from registrants, permanently locking Community Owner)
  const currentMemberRecord = useMemo(() => {
    if (isPermanentOwnerSession) {
      return registrants.find(r => r.id === 'reg_owner_main' || r.role === 'community_owner') || registrants[0];
    }
    const cleanSessionName = (session.name || '').trim();
    const sessionEmail = (session.email || '').trim().toLowerCase();
    const sessionDigits = sessionEmail.replace(/\D/g, '');
    const sessionCode = sessionEmail.includes('@') ? sessionEmail.split('@')[0].toUpperCase() : '';

    const sessionBaseId = session.id ? getBaseMemberId(session.id) : '';
    return registrants.find(r => {
      if (!r) return false;
      if (session.id && (r.id === session.id || (sessionBaseId && getBaseMemberId(r.id) === sessionBaseId))) return true;
      if (sessionDigits && r.phone && r.phone.replace(/\D/g, '') === sessionDigits) return true;
      if (sessionEmail && r.email && r.email.toLowerCase() === sessionEmail) return true;
      if (sessionCode && r.uniqueCode && r.uniqueCode.toUpperCase() === sessionCode) return true;
      if (cleanSessionName && r.fullName) {
        if (r.fullName.trim() === cleanSessionName) return true;
        if (normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(cleanSessionName)) return true;
        if (isThreePartNameMatch(r.fullName, cleanSessionName)) return true;
      }
      return false;
    });
  }, [registrants, session.id, session.email, session.name, session.role, isPermanentOwnerSession]);

  const currentRole: UserRole = (isPermanentOwnerSession || isPermanentCommunityOwner(currentMemberRecord))
    ? 'community_owner'
    : (currentMemberRecord?.role || session.role || 'servant');

  const resolvedUserGender: 'male' | 'female' = currentMemberRecord
    ? getMemberGender(currentMemberRecord)
    : (session.gender || 'male');

  const visibleRegistrantsCount = useMemo(
    () => filterOutDeletedAndGhosts(registrants).length,
    [registrants]
  );

  useEffect(() => {
    if (isImpersonatedView) return;
    oneSignalService.checkAndDispatchTodayBirthdayNotifications(registrants, {
      id: currentMemberRecord?.id || session.id,
      fullName: currentMemberRecord?.fullName || session.name,
      role: currentRole,
      gender: resolvedUserGender,
    });
  }, [isImpersonatedView, registrants, currentMemberRecord?.id, currentMemberRecord?.fullName, session.id, session.name, currentRole, resolvedUserGender]);
  const roleNameMap: Record<UserRole, { label: string; icon: string; color: string }> = {
    priest: { label: 'أبونا', icon: '✝️', color: 'text-amber-300 bg-purple-950/70 border-amber-400/50' },
    community_owner: { label: 'Community Owner (المالك)', icon: '👑', color: 'text-amber-400 bg-amber-950/60 border-amber-400/40' },
    community_manager: { label: 'Community Manager (مدير المجتمع)', icon: '⚡', color: 'text-cyan-300 bg-cyan-950/60 border-cyan-400/40' },
    meeting_secretary: { label: 'أمين اجتماع', icon: '🌟', color: 'text-purple-300 bg-purple-950/60 border-purple-400/40' },
    service_secretary: { label: 'أمين خدمة', icon: '⭐', color: 'text-blue-300 bg-blue-950/60 border-blue-400/40' },
    servant: { label: 'خادم', icon: '🕊️', color: 'text-emerald-300 bg-emerald-950/60 border-emerald-400/40' },
    member: { label: 'مخدوم', icon: '👤', color: 'text-slate-300 bg-slate-800 border-slate-700' }
  };

  const isOwner = currentRole === 'community_owner' || isPermanentOwnerSession;
  const currentUser = useMemo(() => {
    const resolvedPerms = isOwner
      ? ROLE_PERMISSIONS.community_owner
      : storageService.resolvePermissions(
          currentRole,
          currentMemberRecord ? currentMemberRecord.permissions : session.permissions
        );
    return {
      ...(currentMemberRecord || {}),
      id: isOwner ? 'reg_owner_main' : (currentMemberRecord?.id || session.id),
      fullName: currentMemberRecord?.fullName || session.name,
      role: currentRole,
      permissions: resolvedPerms
    };
  }, [isOwner, currentRole, currentMemberRecord, session.id, session.name, session.permissions, rolePermsVersion]);

  const canScan = hasAccess(currentUser, 'canScanAttendance');
  const canViewDb = hasAccess(currentUser, 'canViewDatabase');
  const canPrint = hasAccess(currentUser, 'canPrintCards');
  const canSendAnnouncements = hasAccess(currentUser, 'canSendAnnouncements');
  const canViewMakhdomeen =
    hasAccess(currentUser, 'canViewMakhdomeen') ||
    hasAccess(currentUser, 'viewOppositeGenderMembers') ||
    hasAccess(currentUser, 'viewOppositeGenderMembersProtected');
  const canManageKahoot = hasAccess(currentUser, 'canManageKahoot');
  const canManageVisitation = hasAccess(currentUser, 'canManageVisitation');
  const canEditMembers = hasAccess(currentUser, 'canEditMembers');
  const canExportData = hasAccess(currentUser, 'canExportData');
  const canCancelMembership = hasAccess(currentUser, 'canCancelMembership');
  const canAccessEvents = hasAccess(currentUser, 'canManageEvents');

  // Immediately redirect away from any view whose permission was revoked in real time
  useEffect(() => {
    if (isOwner) return;
    if (currentRole === 'member') {
      onViewPublicPortal();
      return;
    }
    const getFirstAllowedView = (): AdminViewType => {
      if (canManageVisitation) return 'visitation';
      if (canViewMakhdomeen) return 'makhdomeen';
      if (canAccessEvents) return 'events';
      if (canSendAnnouncements) return 'announcements';
      if (canManageKahoot || hasActiveCompetition) return 'kahoot';
      if (canScan) return 'scanner';
      if (canPrint) return 'id_cards';
      if (canViewDb) return 'database';
      return 'birthdays';
    };

    const fallbackView = getFirstAllowedView();
    if ((activeView === 'scanner' || activeView === 'attendance' || activeView === 'attendance_gifts') && !canScan) {
      setActiveView(fallbackView);
    } else if (activeView === 'makhdomeen' && !canViewMakhdomeen) {
      setActiveView(fallbackView);
    } else if (activeView === 'announcements' && !canSendAnnouncements) {
      setActiveView(fallbackView);
    } else if (activeView === 'id_cards' && !canPrint) {
      setActiveView(fallbackView);
    } else if (activeView === 'database' && !canViewDb) {
      setActiveView(fallbackView);
    } else if (activeView === 'events' && !canAccessEvents) {
      setActiveView(fallbackView);
    } else if (activeView === 'kahoot' && !canManageKahoot && !hasActiveCompetition) {
      setActiveView(fallbackView);
    } else if (activeView === 'visitation' && !canManageVisitation) {
      setActiveView(fallbackView);
    }
  }, [
    isOwner,
    currentRole,
    activeView,
    canScan,
    canViewMakhdomeen,
    canSendAnnouncements,
    canPrint,
    canViewDb,
    canAccessEvents,
    canManageKahoot,
    canManageVisitation,
    hasActiveCompetition,
    onViewPublicPortal
  ]);

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden print:h-auto print:overflow-visible bg-slate-100 flex flex-col md:flex-row">
      
      {/* Sidebar Navigation (Desktop - Fixed full viewport height, all options stacked together) */}
      <aside className="no-print hidden md:flex flex-col w-72 bg-slate-900 text-white shrink-0 border-l border-slate-800 md:h-screen md:overflow-y-auto">
        
        {/* Church Meeting Brand */}
        <div className="p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <span className="text-xl">🕊️</span>
            </div>
            <div>
              <h1 className="text-base font-black text-white leading-tight">
                الثلاثة فتية
              </h1>
              <p className="text-[11px] text-emerald-300 font-semibold">
                اجتماع الشباب السوداني
              </p>
            </div>
          </div>

          {/* User Role Badge */}
          <div className={`flex items-center justify-between mt-3 px-3 py-1.5 rounded-2xl border text-xs font-bold ${roleNameMap[currentRole].color}`}>
            <span className="flex items-center gap-1.5">
              <span>{roleNameMap[currentRole].icon}</span>
              <span>{roleNameMap[currentRole].label}</span>
            </span>
            <span className="text-[10px] opacity-75 font-mono">متصل</span>
          </div>

          {/* Quick Notification Shade Button */}
          <button
            type="button"
            onClick={() => setIsNotificationShadeOpen(true)}
            className="w-full mt-2 py-1.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 hover:text-white transition flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-cyan-400" />
              <span>ستارة الإشعارات 🔔</span>
            </div>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-cyan-500 text-slate-950 font-black px-2 py-0.2 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 shrink-0">
          {currentRole === 'servant' ? (
            /* ========================================================
               SERVANT ROLE SPECIFIC NAVIGATION
               (الافتقاد، أعياد الميلاد، والماسح الضوئي فقط إذا كان مفعل)
               ======================================================== */
            <>
              {/* 1. الافتقاد */}
              {canManageVisitation && (
                <button
                  onClick={() => handleSelectView('visitation')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'visitation'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HeartHandshake className="w-4 h-4 text-emerald-400" />
                    <span>نظام الافتقاد (عام وخاص)</span>
                  </div>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full font-mono text-emerald-300">
                    {registrants.filter(r => r.role === 'member' && r.status !== 'cancelled' && (r.gender || 'male') === (currentMemberRecord?.gender || session.gender || 'male')).length}
                  </span>
                </button>
              )}

              {/* 2. أعياد الميلاد */}
              <button
                onClick={() => handleSelectView('birthdays')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                  activeView === 'birthdays'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Cake className="w-4 h-4 text-amber-400" />
                  <span>أعياد الميلاد (Birthdays Hub)</span>
                </div>
                <span className="text-xs">🎂</span>
              </button>

              {/* 3. الماسح الضوئي (Scanner) - فقط إذا كانت الصلاحية ممنوحة للخادم */}
              {canScan && (
                <button
                  onClick={() => handleSelectView('scanner')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'scanner'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Scan className="w-4 h-4 text-teal-400" />
                    <span>الماسح الضوئي (Scanner)</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </button>
              )}

              {/* المخدومين والرتب (Dashboard) - متاح للخادم إذا منح الصلاحية */}
              {canViewMakhdomeen && (
                <button
                  onClick={() => handleSelectView('makhdomeen')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'makhdomeen'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>المخدومين والرتب (Dashboard)</span>
                  </div>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                    {visibleRegistrantsCount}
                  </span>
                </button>
              )}

              {/* لوحة الإعلانات والتنبيهات 📢 - متاح للخادم إذا منح الصلاحية */}
              {canSendAnnouncements && (
                <button
                  onClick={() => handleSelectView('announcements')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'announcements'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-cyan-300/90 hover:bg-slate-800/80 hover:text-cyan-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Megaphone className="w-4 h-4 text-cyan-400" />
                    <span>لوحة الإعلانات 📢</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="text-[10px] bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                      {unreadCount} جديد
                    </span>
                  )}
                </button>
              )}

              {/* مسابقات كاهوت 🎮 - تظهر للخادم إذا كانت هناك مسابقة نشطة أو إذا كان لديه صلاحية عمل المسابقات */}
              {(hasActiveCompetition || canManageKahoot) && (
                <button
                  onClick={() => handleSelectView('kahoot')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition animate-fadeIn ${
                    activeView === 'kahoot'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25'
                      : 'text-purple-300/90 hover:bg-slate-800/80 hover:text-purple-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Gamepad2 className="w-4 h-4 text-purple-400" />
                    <span>«مسابقات الثلاثة فتية» 🎮</span>
                  </div>
                  {hasActiveCompetition ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  ) : (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/30">
                      إنشاء ونشر
                    </span>
                  )}
                </button>
              )}

              {/* الرحلات والمؤتمرات والأيام الروحية 🏕️ */}
              {canAccessEvents && (
                <button
                  onClick={() => handleSelectView('events')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'events'
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/25'
                      : 'text-sky-300/90 hover:bg-slate-800/80 hover:text-sky-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Tent className="w-4 h-4 text-sky-400" />
                    <span>الرحلات والمؤتمرات والأيام الروحية 🏕️</span>
                  </div>
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-bold border border-sky-500/30">
                    فعاليات
                  </span>
                </button>
              )}

              {/* طباعة بطاقات الهوية - متاح للخادم إذا منح الصلاحية */}
              {canPrint && (
                <button
                  onClick={() => handleSelectView('id_cards')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'id_cards'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>معرض الهويات وأختام الحضور</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}

              {/* قاعدة البيانات الشاملة وإلغاء العضوية - متاح للخادم إذا منح الصلاحية */}
              {canViewDb && (
                <button
                  onClick={() => handleSelectView('database')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'database'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span>قاعدة البيانات وإلغاء العضوية</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}

              {/* ستارة ولوحة الإعلانات والتنبيهات 🔔 */}
              <button
                type="button"
                onClick={() => setIsNotificationShadeOpen(true)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition text-cyan-300 hover:bg-slate-800/80 hover:text-white"
              >
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span>ستارة الإشعارات 🔔</span>
                </div>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                    {unreadCount} جديد
                  </span>
                )}
              </button>
            </>
          ) : (
            /* ========================================================
               LEADERS & OWNER FULL NAVIGATION
               ======================================================== */
            <>
              {/* 1. المخدومين والرتب */}
              {canViewMakhdomeen && (
                <button
                  onClick={() => handleSelectView('makhdomeen')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'makhdomeen'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>المخدومين والرتب (Dashboard)</span>
                  </div>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                    {visibleRegistrantsCount}
                  </span>
                </button>
              )}

              {/* الرحلات والمؤتمرات والأيام الروحية 🏕️🚌 */}
              {canAccessEvents && (
                <button
                  onClick={() => handleSelectView('events')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'events'
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/25'
                      : 'text-sky-300/90 hover:bg-slate-800/80 hover:text-sky-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Tent className="w-4 h-4 text-sky-400" />
                    <span>الرحلات والمؤتمرات والأيام الروحية 🏕️</span>
                  </div>
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-bold border border-sky-500/30">
                    شامل
                  </span>
                </button>
              )}

              {/* Announcements Hub */}
              {canSendAnnouncements && (
                <button
                  onClick={() => handleSelectView('announcements')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'announcements'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-cyan-300/90 hover:bg-slate-800/80 hover:text-cyan-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Megaphone className="w-4 h-4 text-cyan-400" />
                    <span>لوحة الإعلانات 📢</span>
                  </div>
                  <span className="text-[10px] bg-blue-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold border border-blue-500/30">
                    بث للشباب
                  </span>
                </button>
              )}

              {/* Kahoot Competitions Hub */}
              {(hasActiveCompetition || canManageKahoot) && (
                <button
                  onClick={() => handleSelectView('kahoot')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'kahoot'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25'
                      : 'text-purple-300/90 hover:bg-slate-800/80 hover:text-purple-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Gamepad2 className="w-4 h-4 text-purple-400" />
                    <span>«مسابقات الثلاثة فتية» 🎮</span>
                  </div>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/30">
                    {hasActiveCompetition ? 'مسابقة نشطة' : 'إنشاء ونشر'}
                  </span>
                </button>
              )}

              {/* 2. هدايا الحضور (مواظبة جمعات الشهر) */}
              {canScan && (
                <button
                  onClick={() => handleSelectView('attendance_gifts')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'attendance_gifts'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/25'
                      : 'text-amber-300/90 hover:bg-slate-800/80 hover:text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span>هدايا الحضور 🎁</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                    شهري
                  </span>
                </button>
              )}

              {/* 2. الافتقاد */}
              {canManageVisitation && (
                <button
                  onClick={() => handleSelectView('visitation')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'visitation'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HeartHandshake className="w-4 h-4 text-pink-400" />
                    <span>نظام الافتقاد (عام وخاص)</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}

              {/* 3. أعياد الميلاد */}
              <button
                onClick={() => handleSelectView('birthdays')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                  activeView === 'birthdays'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Cake className="w-4 h-4 text-amber-400" />
                  <span>أعياد الميلاد (Birthdays Hub)</span>
                </div>
                <span className="text-xs">🎂</span>
              </button>

              {/* 4. معرض الهويات */}
              {canPrint && (
                <button
                  onClick={() => handleSelectView('id_cards')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'id_cards'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    <span>معرض الهويات وأختام الحضور</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}


              {/* 5. الماسح الضوئي */}
              {canScan && (
                <button
                  onClick={() => handleSelectView('scanner')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'scanner'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Scan className="w-4 h-4 text-teal-400" />
                    <span>الماسح الضوئي (Scanner)</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </button>
              )}

              {/* 6. سجل الحضور */}
              {canScan && (
                <button
                  onClick={() => handleSelectView('attendance')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'attendance'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CalendarCheck className="w-4 h-4 text-purple-400" />
                    <span>سجل الحضور والغياب</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}

              {/* 7. قاعدة البيانات المتقدمة */}
              {canViewDb && (
                <button
                  onClick={() => handleSelectView('database')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'database'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span>قاعدة البيانات وإلغاء العضوية</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}

              {/* 8. إعداد وقواعد السحابة */}
              <div className="pt-2 mt-2 border-t border-slate-800">
                <button
                  onClick={() => handleSelectView('firebase_rules')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                    activeView === 'firebase_rules'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>إعداد سحابة Cloudflare D1 و SQL</span>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/40 text-xs shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white text-[11px]">
              {session.name ? session.name[0] : session.email[0].toUpperCase()}
            </div>
            <div className="truncate flex-1">
              <span className="text-[10px] text-slate-400 block">{session.name || 'المستخدم الحالي'}</span>
              <span className="text-xs font-mono font-medium text-emerald-200 truncate block">
                {session.email}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            {/* Live Cross-Device Sync Button */}
            <button
              onClick={() => handleSyncWithServer(true)}
              disabled={isSyncing}
              className="w-full py-2 px-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition flex items-center justify-between cursor-pointer disabled:opacity-60 shadow-xs"
              title="مزامنة فورية لكافة الأعضاء والحضور المسجلين من الهواتف الأخرى"
            >
              <div className="flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة السجلات مع الهواتف'}</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </button>

            <button
              onClick={onViewPublicPortal}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md border border-cyan-400/40"
              title="الانتقال لمعاينة نفس شكل صفحة المخدومين ومتابعة الإعلانات والأحداث والبطاقات"
            >
              <ExternalLink className="w-4 h-4 text-amber-300" />
              <span>معاينة صفحة المخدومين 👁️</span>
            </button>

            <button
              onClick={onLogout}
              className="w-full py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>

      </aside>

      {/* Mobile Top Header */}
      <header className="no-print md:hidden bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div>
            <h2 className="text-sm font-black text-white">الثلاثة فتية</h2>
            <p className="text-[10px] text-emerald-300 font-bold">{roleNameMap[currentRole].label}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick Switch to Member Portal on Mobile */}
          <button
            type="button"
            onClick={onViewPublicPortal}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-[11px] font-black flex items-center gap-1 shadow-xs border border-cyan-400/40 cursor-pointer"
            title="معاينة صفحة المخدومين"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
            <span>صفحة المخدومين</span>
          </button>

          {/* Mobile Bell Button for Notification Shade */}
          <button
            type="button"
            onClick={() => setIsNotificationShadeOpen(true)}
            className="relative p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-xs"
            title="ستارة ولوحة الإشعارات والتنبيهات 🔔"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleSyncWithServer(true)}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            title="مزامنة مع السيرفر والهواتف"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          <button 
            onClick={onLogout}
            className="text-xs bg-red-950/60 border border-red-800/50 text-red-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1 font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="no-print md:hidden bg-slate-900 text-white p-4 space-y-2 border-b border-slate-800 animate-fadeIn">
          {currentRole === 'servant' ? (
            /* Servant Only Mobile Drawer */
            <>
              {canManageVisitation && (
                <button
                  onClick={() => handleSelectView('visitation')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'visitation' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-emerald-400" />
                    <span>نظام الافتقاد (عام وخاص)</span>
                  </div>
                </button>
              )}

              <button
                onClick={() => handleSelectView('birthdays')}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'birthdays' ? 'bg-emerald-600' : 'bg-slate-800'}`}
              >
                <div className="flex items-center gap-2">
                  <Cake className="w-4 h-4 text-amber-400" />
                  <span>أعياد الميلاد (Birthdays Hub)</span>
                </div>
              </button>

              {canScan && (
                <button
                  onClick={() => handleSelectView('scanner')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'scanner' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Scan className="w-4 h-4 text-teal-400" />
                    <span>الماسح الضوئي (Scanner)</span>
                  </div>
                </button>
              )}

              {/* Makhdomeen Dashboard in Mobile Drawer (if granted to servant) */}
              {canViewMakhdomeen && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('makhdomeen');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'makhdomeen' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>المخدومين والرتب (Dashboard)</span>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded-full">{visibleRegistrantsCount}</span>
                </button>
              )}

              {/* Announcements in Mobile Drawer (if granted to servant) */}
              {canSendAnnouncements && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('announcements');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'announcements' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white' : 'bg-slate-800 text-cyan-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-cyan-400" />
                    <span>لوحة الإعلانات 📢</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="text-[10px] bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                      {unreadCount}
                    </span>
                  )}
                </button>
              )}

              {/* Kahoot Competitions in Mobile Drawer */}
              {(hasActiveCompetition || canManageKahoot) && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('kahoot');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'kahoot' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' : 'bg-slate-800 text-purple-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-purple-400" />
                    <span>«مسابقات الثلاثة فتية» 🎮</span>
                  </div>
                  {hasActiveCompetition && (
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  )}
                </button>
              )}

              {/* Events in Servant Mobile Drawer */}
              {canAccessEvents && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('events');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'events' ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white' : 'bg-slate-800 text-sky-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Tent className="w-4 h-4 text-sky-400" />
                    <span>الرحلات والمؤتمرات والأيام الروحية 🏕️</span>
                  </div>
                </button>
              )}

              {/* ID Cards in Mobile Drawer */}
              {canPrint && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('id_cards');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'id_cards' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>معرض الهويات وأختام الحضور</span>
                  </div>
                </button>
              )}

              {/* Database in Mobile Drawer */}
              {canViewDb && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('database');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'database' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-amber-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span>قاعدة البيانات وإلغاء العضوية</span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsNotificationShadeOpen(true);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold bg-slate-800 text-cyan-300"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span>ستارة الإشعارات 🔔</span>
                </div>
              </button>
            </>
          ) : (
            /* Leaders & Owner Mobile Drawer */
            <>
              {canViewMakhdomeen && (
                <button
                  onClick={() => handleSelectView('makhdomeen')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'makhdomeen' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>المخدومين والرتب (Dashboard)</span>
                  </div>
                  <span>{visibleRegistrantsCount}</span>
                </button>
              )}

              {canAccessEvents && (
                <button
                  onClick={() => handleSelectView('events')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'events' ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white' : 'bg-slate-800 text-sky-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <Tent className="w-4 h-4 text-sky-400" />
                    <span>الرحلات والمؤتمرات والأيام الروحية 🏕️</span>
                  </div>
                </button>
              )}

              {canSendAnnouncements && (
                <button
                  onClick={() => handleSelectView('announcements')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'announcements' ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-cyan-400" />
                    <span>لوحة الإعلانات 📢</span>
                  </div>
                </button>
              )}

              {canScan && (
                <button
                  onClick={() => handleSelectView('attendance_gifts')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'attendance_gifts' ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span>هدايا الحضور 🎁</span>
                  </div>
                </button>
              )}

              {canManageVisitation && (
                <button
                  onClick={() => handleSelectView('visitation')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'visitation' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4" />
                    <span>نظام الافتقاد (عام وخاص)</span>
                  </div>
                </button>
              )}

              <button
                onClick={() => handleSelectView('birthdays')}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'birthdays' ? 'bg-emerald-600' : 'bg-slate-800'}`}
              >
                <div className="flex items-center gap-2">
                  <Cake className="w-4 h-4" />
                  <span>أعياد الميلاد (Birthdays Hub)</span>
                </div>
              </button>

              {canPrint && (
                <button
                  onClick={() => handleSelectView('id_cards')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'id_cards' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>معرض الهويات وأختام الحضور</span>
                  </div>
                </button>
              )}


              {canScan && (
                <button
                  onClick={() => handleSelectView('scanner')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'scanner' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Scan className="w-4 h-4" />
                    <span>الماسح الضوئي (Scanner)</span>
                  </div>
                </button>
              )}

              {canScan && (
                <button
                  onClick={() => handleSelectView('attendance')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'attendance' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4" />
                    <span>سجل الحضور والغياب</span>
                  </div>
                </button>
              )}

              {canViewDb && (
                <button
                  onClick={() => handleSelectView('database')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${activeView === 'database' ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>قاعدة البيانات وإلغاء العضوية</span>
                  </div>
                </button>
              )}
            </>
          )}

          <div className="pt-2">
            <button
              onClick={onViewPublicPortal}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>معاينة صفحة المخدومين 👁️</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main
        ref={mainContentRef}
        className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 md:h-screen md:overflow-y-auto print:h-auto print:overflow-visible"
      >
        <div className="max-w-7xl mx-auto space-y-4">
          
          {/* Cloud Realtime Sync Status Banner (Visible ONLY to senior leaders: Community Owner & Community Manager) */}
          {isSeniorLeader && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm no-print">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <div>
                  <span className="font-bold text-white block">مزامنة سحابية لحظية (Cloudflare Realtime Live Sync) ⚡</span>
                  <span className="text-[11px] text-slate-400">
                    متصل لحظياً مع الهاتف وكافة الأجهزة عبر Cloudflare D1 &amp; WebSockets — أي مخدوم يسجل أو يتعدل يظهر فوراً ({registrants.length} عضو)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {lastSyncText && (
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    آخر تحديث: {lastSyncText}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleSyncWithServer(true)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-60 shadow-xs"
                  title="مزامنة فورية وتحديث بيانات السحابة والهواتف"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة السحابة الآن'}</span>
                </button>
              </div>
            </div>
          )}

          {syncNotice && (
            <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 p-2.5 rounded-xl text-xs flex items-center justify-between animate-fadeIn no-print shadow-sm">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{syncNotice}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setSyncNotice(null)} 
                className="text-emerald-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <Suspense fallback={DashboardViewFallback}>
            {activeView === 'makhdomeen' && canViewMakhdomeen && (
              <MakhdomeenView 
                registrants={registrants} 
                onRefresh={refreshData}
                currentUserRole={currentRole}
                currentUserGender={currentMemberRecord?.gender || session.gender || 'male'}
                currentUserName={currentMemberRecord?.fullName || session.name}
                currentUserId={currentMemberRecord?.id || session.id || (currentRole === 'community_owner' ? 'reg_owner_main' : undefined)}
                isImpersonatedView={isImpersonatedView}
                onInspectMember={
                  !isImpersonatedView && (currentRole === 'community_owner' || isPermanentCommunityOwner(session))
                    ? onInspectMember
                    : undefined
                }
              />
            )}

            {activeView === 'events' && canAccessEvents && (
              <div className="bg-slate-950 rounded-3xl p-4 sm:p-6 border border-slate-800 shadow-xl">
                <EventsDashboard
                  currentUser={
                    currentMemberRecord || {
                      id: session.id || 'admin_owner',
                      uniqueCode: 'ADMIN-01',
                      fullName: session.name || 'المسؤول',
                      dob: '1995-01-01',
                      phone: session.email || '',
                      whatsapp: session.email || '',
                      address: '',
                      photoUrl: '',
                      registeredAt: new Date().toISOString(),
                      qrData: 'ADMIN-01',
                      role: currentRole,
                      gender: session.gender || 'male',
                      permissions: currentUser.permissions,
                      status: 'active',
                    }
                  }
                />
              </div>
            )}

            {activeView === 'kahoot' && (canManageKahoot || hasActiveCompetition) && (
              <KahootDashboard 
                currentUserRole={currentRole}
                currentUserName={session.name || 'المسؤول'}
                registrants={registrants}
                canManageKahoot={canManageKahoot}
                onRefresh={refreshData}
                initialQuizId={pendingQuizId}
              />
            )}

            {activeView === 'announcements' && canSendAnnouncements && (
              <AnnouncementsDashboard 
                currentUserRole={currentRole}
                currentUserName={session.name || 'المسؤول'}
                registrants={registrants}
                onRefresh={refreshData}
              />
            )}

            {activeView === 'attendance_gifts' && canScan && (
              <AttendanceGiftsView
                registrants={registrants}
                onRefresh={refreshData}
                currentUserRole={currentRole}
              />
            )}

            {activeView === 'visitation' && canManageVisitation && (
              <VisitationView 
                registrants={registrants}
                currentServantName={currentMemberRecord?.fullName || session.name || 'الخادم المسؤول'}
                currentServantId={currentMemberRecord?.id || session.id || registrants.find(r => r.fullName === session.name || (session.email && (r.phone === session.email || r.phone.replace(/\D/g, '') === session.email.replace(/\D/g, ''))))?.id}
                currentServantGender={currentMemberRecord?.gender || session.gender || 'male'}
                currentUserRole={currentRole}
                onRefresh={refreshData}
              />
            )}

            {activeView === 'birthdays' && (
              <BirthdaysView 
                registrants={registrants} 
                currentUserRole={currentRole}
                currentUserGender={resolvedUserGender}
              />
            )}

            {activeView === 'id_cards' && canPrint && (
              <IdCardsGallery 
                registrants={registrants} 
                currentUserRole={currentRole}
                onRefresh={refreshData}
              />
            )}

            {activeView === 'scanner' && canScan && (
              <ScannerView
                registrants={registrants}
                sessionToken={scannerTokenState.token}
                tokenExpiresAt={scannerTokenState.expiresAt}
                onRefreshToken={handleRefreshToken}
                currentUserRole={currentRole}
                currentUserName={session.name || 'المسؤول'}
              />
            )}

            {activeView === 'attendance' && canScan && (
              <AttendanceLogView
                registrants={registrants}
                attendanceRecords={attendanceRecords}
                onRefresh={refreshData}
                onGoToGifts={() => handleSelectView('attendance_gifts')}
                currentUserRole={currentRole}
                currentUserName={session.name || 'المسؤول'}
              />
            )}

            {activeView === 'database' && canViewDb && (
              <SystemDataView 
                registrants={registrants} 
                onRefresh={refreshData} 
                currentUserRole={currentRole}
              />
            )}

            {activeView === 'firebase_rules' && isOwner && (
              <FirebaseSetupView />
            )}
          </Suspense>

          {/* Direct Support / دعم فني WhatsApp Footer */}
          <div className="pt-4 border-t border-slate-200/70 flex justify-center no-print">
            <a
              href="https://wa.me/201288651567"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#1f2937] hover:bg-[#111827] text-white font-black text-xs shadow-md shadow-slate-900/20 transition active:scale-95"
            >
              <span>💬</span>
              <span>دعم فني / Support</span>
            </a>
          </div>
        </div>
      </main>

      {/* Phone Notification Shade (Lazy-loaded ONLY when opened!) */}
      {isNotificationShadeOpen && (
        <Suspense fallback={null}>
          <NotificationShade
            isOpen={isNotificationShadeOpen}
            onClose={() => setIsNotificationShadeOpen(false)}
            onOpenAnnouncement={(ann) => setSelectedShadeAnnouncement(ann)}
            currentUserRole={currentRole}
          />
        </Suspense>
      )}

      {/* Full Announcement Modal if clicked from Shade (Lazy-loaded ONLY when opened!) */}
      {selectedShadeAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal
            announcement={selectedShadeAnnouncement}
            onClose={() => setSelectedShadeAnnouncement(null)}
            currentUserId={session.name}
            memberFirstName={session.name?.split(' ')[0]}
          />
        </Suspense>
      )}


    </div>
  );
};
