import React, { useState, useMemo, useEffect } from 'react';
import { Registrant, UserRole, AdminPermissions, getNormalizedGender } from '../../types';
import { storageService, ROLE_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS, resolveSafePhotoUrl, normalizeArabicNameForComparison, normalizeMember } from '../../services/storageService';
import { EditMemberModal } from '../EditMemberModal';
import { IdCardItem } from '../IdCardItem';
import { 
  Users, 
  Search, 
  ShieldCheck, 
  Award, 
  CheckCircle2, 
  X, 
  ChevronDown, 
  Phone, 
  MessageCircle, 
  UserPlus, 
  Crown,
  Sparkles,
  UserCheck,
  ShieldAlert,
  Trash2,
  Edit3,
  CreditCard,
  Clock,
  RefreshCw,
  Ban,
  Gamepad2,
  Megaphone,
  Check
} from 'lucide-react';

interface MakhdomeenViewProps {
  registrants: Registrant[];
  onRefresh: () => void;
  currentUserRole: UserRole;
  currentUserGender?: 'male' | 'female';
  currentUserName?: string;
  currentUserId?: string;
}

export const MakhdomeenView: React.FC<MakhdomeenViewProps> = ({
  registrants,
  onRefresh,
  currentUserRole,
  currentUserGender = 'male',
  currentUserName,
  currentUserId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'member' | 'servant' | 'service_secretary' | 'meeting_secretary' | 'priest' | 'community_manager' | 'recently_updated' | 'new_members' | 'blocked'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [activeGenderTab, setActiveGenderTab] = useState<'same' | 'opposite' | 'all'>('all');
  const blockedUsersList = storageService.getBlockedUsers();
  
  // Promotion & Permissions modal
  const [selectedMember, setSelectedMember] = useState<Registrant | null>(null);
  const [editingTargetRole, setEditingTargetRole] = useState<UserRole>('servant');
  const [currentPermissions, setCurrentPermissions] = useState<AdminPermissions>(DEFAULT_ADMIN_PERMISSIONS);
  const [roleActionNotification, setRoleActionNotification] = useState<string | null>(null);

  const isCommunityOwner = Boolean(
    currentUserRole === 'community_owner' ||
      (currentUserRole as any) === 'مسؤول المجتمع' ||
      (currentUserRole as any) === 'مسؤل المجتمع' ||
      (currentUserRole as any) === 'Community Owner' ||
      currentUserId === 'reg_owner_main' ||
      storageService.isCommunityOwnerLoggedIn()
  );

  const isTargetMemberOwner = (m?: Registrant | null): boolean => {
    if (!m) return false;
    return Boolean(
      m.role === 'community_owner' ||
        (m as any).role === 'مسؤول المجتمع' ||
        (m as any).role === 'مسؤل المجتمع' ||
        (m as any).role === 'Community Owner' ||
        m.id === 'reg_owner_main' ||
        (m as any).isOwner === true
    );
  };

  // Role-wide permissions management modal state
  const [isRoleConfigModalOpen, setIsRoleConfigModalOpen] = useState(false);
  const [selectedRoleForConfig, setSelectedRoleForConfig] = useState<UserRole>('servant');
  const [roleConfigPermissions, setRoleConfigPermissions] = useState<AdminPermissions>(() => storageService.getRolePermissions('servant'));

  const handleSelectRoleForConfig = (role: UserRole) => {
    if (!isCommunityOwner) {
      setIsRoleConfigModalOpen(false);
      return;
    }
    setSelectedRoleForConfig(role);
    setRoleConfigPermissions(storageService.getRolePermissions(role));
  };

  const handleSaveRoleConfig = () => {
    if (!isCommunityOwner) {
      setIsRoleConfigModalOpen(false);
      return;
    }
    storageService.updateRolePermissions(selectedRoleForConfig, roleConfigPermissions, 'community_owner');
    setIsRoleConfigModalOpen(false);
    const roleLabels: Record<UserRole, string> = {
      servant: 'خادم (Servant)',
      service_secretary: 'أمين خدمة (Service Secretary)',
      meeting_secretary: 'أمين اجتماع (Meeting Secretary)',
      priest: 'أبونا (Priest)',
      community_manager: 'مدير مجتمع (Community Manager)',
      community_owner: 'مسؤول المجتمع',
      member: 'مخدوم'
    };
    setRoleActionNotification(`تم حفظ وتطبيق صلاحيات رتبة (${roleLabels[selectedRoleForConfig] || selectedRoleForConfig}) فوراً على جميع الأجهزة والجلسات النشطة!`);
    setTimeout(() => setRoleActionNotification(null), 5000);
    onRefresh();
  };

  const handleOpenRoleModal = (member: Registrant) => {
    const freshMember = storageService.getRegistrants().find(r => r.id === member.id) || member;
    if (isTargetMemberOwner(freshMember)) return;
    setSelectedMember(freshMember);
    const initialRole: UserRole = freshMember.role === 'member' ? 'servant' : freshMember.role;
    setEditingTargetRole(initialRole);
    if (freshMember.role === 'member' || !freshMember.permissions) {
      setCurrentPermissions(storageService.getRolePermissions(initialRole));
    } else {
      setCurrentPermissions(storageService.resolvePermissions(initialRole, freshMember.permissions));
    }
  };

  const handleToggleMemberPermission = (updates: Partial<AdminPermissions>) => {
    if (!selectedMember || isTargetMemberOwner(selectedMember)) return;
    if (editingTargetRole === 'community_owner' && !isCommunityOwner) return;
    const nextPerms: AdminPermissions = {
      ...currentPermissions,
      ...updates
    };
    setCurrentPermissions(nextPerms);
    storageService.updateMemberRole(selectedMember.id, editingTargetRole, nextPerms, currentUserRole);
    setSelectedMember(curr => (curr ? { ...curr, role: editingTargetRole, permissions: nextPerms } : null));
    onRefresh();
  };

  const handleSaveRoleAndPermissions = () => {
    if (!selectedMember || isTargetMemberOwner(selectedMember)) return;
    if (editingTargetRole === 'community_owner' && !isCommunityOwner) return;
    storageService.updateMemberRole(selectedMember.id, editingTargetRole, currentPermissions, currentUserRole);
    const memberName = selectedMember.fullName;
    setSelectedMember(null);
    setRoleActionNotification(`تم تحديث رتبة وصلاحيات (${memberName}) ومزامنتها مع Cloudflare فوراً.`);
    setTimeout(() => setRoleActionNotification(null), 4000);
    onRefresh();
  };

  const handleDemoteToMember = () => {
    if (!selectedMember || isTargetMemberOwner(selectedMember)) return;
    storageService.updateMemberRole(selectedMember.id, 'member', undefined, currentUserRole);
    const memberName = selectedMember.fullName;
    setSelectedMember(null);
    setRoleActionNotification(`تم إلغاء رتبة (${memberName}) وإعادته كمخدوم.`);
    setTimeout(() => setRoleActionNotification(null), 4000);
    onRefresh();
  };

  // Full Edit Member modal (for Community Owner & Community Manager)
  const [editingMember, setEditingMember] = useState<Registrant | null>(null);

  // ID Card & Attendance Stamps Quick Modal
  const [cardViewingMember, setCardViewingMember] = useState<Registrant | null>(null);

  // WhatsApp / Instagram style Photo Zoom Lightbox Modal
  const [enlargedPhotoMember, setEnlargedPhotoMember] = useState<Registrant | null>(null);

  // Keyboard shortcut: close enlarged photo on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && enlargedPhotoMember) {
        setEnlargedPhotoMember(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedPhotoMember]);

  // Community Owner Exclusive: Cancel Membership & Delete from Cloud Confirmation
  const [cancellingMember, setCancellingMember] = useState<Registrant | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  const handleConfirmCancelMembership = async () => {
    if (!cancellingMember || !isCommunityOwner || isTargetMemberOwner(cancellingMember)) return;
    setIsDeletingMember(true);
    try {
      await storageService.deleteRegistrant(cancellingMember.id, 'community_owner');
      setCancellingMember(null);
      onRefresh();
    } finally {
      setIsDeletingMember(false);
    }
  };

  // Community Owner Exclusive: Permanent Block Member
  const [blockingMember, setBlockingMember] = useState<Registrant | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [isBlockingMember, setIsBlockingMember] = useState(false);

  const handleConfirmBlockMember = async () => {
    if (!blockingMember || !isCommunityOwner || isTargetMemberOwner(blockingMember)) return;
    setIsBlockingMember(true);
    try {
      await storageService.blockMember(blockingMember.id, blockReasonInput.trim(), 'community_owner');
      setBlockingMember(null);
      setBlockReasonInput('');
      onRefresh();
    } finally {
      setIsBlockingMember(false);
    }
  };

  const canManageRoles = currentUserRole === 'community_owner' || currentUserRole === 'community_manager' || currentUserRole === 'meeting_secretary' || currentUserRole === 'priest';

  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLiveTick(t => t + 1), 3000);
    return () => clearInterval(timer);
  }, []);

  // Real-time synchronization for member status and changes
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setLiveTick(t => t + 1);
      onRefresh();
    });
    return () => unsub();
  }, [onRefresh]);

  // Full non-destructive normalized member list (94+ members: 31+ males and 63+ females)
  const allNormalizedRegistrants = useMemo(() => {
    const liveStorageList = storageService.getRegistrants();
    const sourceArray =
      Array.isArray(liveStorageList) && liveStorageList.length > (Array.isArray(registrants) ? registrants.length : 0)
        ? liveStorageList
        : (Array.isArray(registrants) ? registrants : []);
    const seenIds = new Set<string>();
    return sourceArray.map((r, idx) => {
      const norm = normalizeMember(r, idx) as Registrant;
      let safeId = String(norm.id || '').trim();
      if (!safeId || seenIds.has(safeId)) {
        safeId = `${safeId || 'CF'}-ROW-${idx + 1}`;
      }
      seenIds.add(safeId);
      return { ...norm, id: safeId };
    });
  }, [registrants, liveTick]);

  // Identify the logged in user themselves accurately from the full normalized list
  const currentViewerMember = useMemo(() => {
    if (currentUserId) {
      const found = allNormalizedRegistrants.find(r => r.id === currentUserId);
      if (found) return found;
    }
    if (currentUserName) {
      const cleanName = currentUserName.trim();
      const found = allNormalizedRegistrants.find(r => r.fullName && r.fullName.trim() === cleanName);
      if (found) return found;
    }
    try {
      const rawMem = sessionStorage.getItem('three_youths_member_session_v2');
      if (rawMem) {
        const parsed = JSON.parse(rawMem);
        if (parsed?.id) {
          const found = allNormalizedRegistrants.find(r => r.id === parsed.id);
          if (found) return found;
        }
      }
      const rawAdm = sessionStorage.getItem('three_youths_admin_session_v2');
      if (rawAdm) {
        const parsed = JSON.parse(rawAdm);
        if (parsed?.id) {
          const found = allNormalizedRegistrants.find(r => r.id === parsed.id);
          if (found) return found;
        }
        if (parsed?.name) {
          const found = allNormalizedRegistrants.find(r => r.fullName && r.fullName.trim() === String(parsed.name).trim());
          if (found) return found;
        }
      }
    } catch {}
    if (currentUserRole === 'community_owner') {
      return allNormalizedRegistrants.find(r => r.id === 'reg_owner_main' || r.role === 'community_owner');
    }
    return undefined;
  }, [allNormalizedRegistrants, currentUserId, currentUserName, currentUserRole]);

  const viewerGender: 'male' | 'female' = useMemo(() => {
    if (currentViewerMember) return getNormalizedGender(currentViewerMember);
    return currentUserGender === 'female' ? 'female' : 'male';
  }, [currentViewerMember, currentUserGender]);

  const viewerResolvedPermissions = useMemo(() => {
    if (isCommunityOwner) return ROLE_PERMISSIONS.community_owner;
    const effectiveRole = currentViewerMember?.role || currentUserRole;
    return storageService.resolvePermissions(effectiveRole, currentViewerMember?.permissions);
  }, [isCommunityOwner, currentViewerMember, currentUserRole]);

  const hasSameGenderAccess = Boolean(
    isCommunityOwner ||
    viewerResolvedPermissions.canViewMakhdomeen
  );

  const hasOppositeGenderAccess = Boolean(
    isCommunityOwner ||
    viewerResolvedPermissions.viewOppositeGenderMembers ||
    viewerResolvedPermissions.canViewAllGendersVisitation
  );

  const isGenderRestrictedRole = !isCommunityOwner && !(hasSameGenderAccess && hasOppositeGenderAccess);

  // Non-destructive useMemo gender scoping based on viewer permissions (never mutates original registrants array!)
  const displayedMembers = useMemo(() => {
    // الحالة أ: مسؤول المجتمع أو حامل الصلاحيتين معاً (سجل المخدومين + سجل المخدومين الآخر)
    if (isCommunityOwner || (hasSameGenderAccess && hasOppositeGenderAccess)) {
      if (activeGenderTab === 'same') {
        return allNormalizedRegistrants.filter(m => getNormalizedGender(m) === viewerGender || (currentViewerMember && m.id === currentViewerMember.id));
      }
      if (activeGenderTab === 'opposite') {
        return allNormalizedRegistrants.filter(m => getNormalizedGender(m) !== viewerGender);
      }
      return allNormalizedRegistrants;
    }
    // الحالة ب: صلاحية (سجل المخدومين) فقط — نفس الجنس فقط 100%
    if (hasSameGenderAccess && !hasOppositeGenderAccess) {
      return allNormalizedRegistrants.filter(m => getNormalizedGender(m) === viewerGender || (currentViewerMember && m.id === currentViewerMember.id));
    }
    // الحالة ج: صلاحية (سجل المخدومين الآخر) فقط — الجنس الآخر فقط 100%
    if (!hasSameGenderAccess && hasOppositeGenderAccess) {
      return allNormalizedRegistrants.filter(m => getNormalizedGender(m) !== viewerGender || (currentViewerMember && m.id === currentViewerMember.id));
    }
    return [];
  }, [
    allNormalizedRegistrants,
    isCommunityOwner,
    hasSameGenderAccess,
    hasOppositeGenderAccess,
    activeGenderTab,
    viewerGender,
    currentViewerMember
  ]);

  const genderScopedRegistrants = displayedMembers;

  const recentlyUpdatedMembers = displayedMembers.filter(r => Boolean(r.lastUpdatedAt));

  const canActorEditMember = (targetMember: Registrant): boolean => {
    const actor = currentViewerMember || { id: currentUserId, role: currentUserRole };
    return storageService.canEditMemberData(actor, targetMember.id, targetMember.role);
  };

  // Strict sorting: Current logged in user is ALWAYS FIRST, then all others alphabetically (Arabic collation أ-ي)
  const filtered = useMemo(() => {
    const list = genderScopedRegistrants.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      const q = searchQuery.toLowerCase().trim();
      const normQ = normalizeArabicNameForComparison(searchQuery);
      const fullName = r.fullName || '';
      const normFullName = normalizeArabicNameForComparison(fullName);
      const uniqueCode = r.uniqueCode || '';
      const phone = r.phone || '';
      const matchesSearch =
        !q ||
        fullName.toLowerCase().includes(q) ||
        (normQ && normFullName.includes(normQ)) ||
        uniqueCode.toLowerCase().includes(q) ||
        phone.includes(q);
      if (!matchesSearch) return false;

      if (roleFilter === 'recently_updated') {
        if (!r.lastUpdatedAt) return false;
      } else if (roleFilter === 'new_members') {
        if (r.role === 'community_owner') return false;
      } else if (roleFilter !== 'all' && (r.role || 'member') !== roleFilter) {
        return false;
      }

      if (!isGenderRestrictedRole && genderFilter !== 'all' && (r.gender || 'male') !== genderFilter) return false;

      return true;
    });

    return [...list].sort((a, b) => {
      if (roleFilter === 'new_members') {
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        const numA = parseInt((a.uniqueCode || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.uniqueCode || '').replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      }

      const isACurrentUser = Boolean(currentViewerMember && a.id === currentViewerMember.id);
      const isBCurrentUser = Boolean(currentViewerMember && b.id === currentViewerMember.id);
      if (isACurrentUser && !isBCurrentUser) return -1;
      if (!isACurrentUser && isBCurrentUser) return 1;

      return (a.fullName || '').localeCompare(b.fullName || '', 'ar', { sensitivity: 'base' });
    });
  }, [genderScopedRegistrants, isGenderRestrictedRole, currentUserGender, searchQuery, roleFilter, genderFilter, currentViewerMember]);

  const handlePromote = (role: UserRole) => {
    if (!selectedMember) return;
    storageService.updateMemberRole(selectedMember.id, role, undefined, currentUserRole);
    setSelectedMember(null);
    onRefresh();
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'priest':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-950 text-amber-300 border border-amber-400/60 px-2.5 py-0.5 rounded-full text-xs font-black shadow-xs">
            <span>✝️</span>
            <span>أبونا</span>
          </span>
        );
      case 'community_owner':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full text-xs font-black shadow-2xs">
            <Crown className="w-3.5 h-3.5 text-amber-700" />
            <span>Community Owner</span>
          </span>
        );
      case 'community_manager':
        return (
          <span className="inline-flex items-center gap-1 bg-cyan-100 text-cyan-900 border border-cyan-300 px-2.5 py-0.5 rounded-full text-xs font-black shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-700" />
            <span>Community Manager</span>
          </span>
        );
      case 'meeting_secretary':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-0.5 rounded-full text-xs font-black">
            <Sparkles className="w-3.5 h-3.5 text-purple-700" />
            <span>أمين اجتماع</span>
          </span>
        );
      case 'service_secretary':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <Award className="w-3.5 h-3.5 text-blue-700" />
            <span>أمين خدمة</span>
          </span>
        );
      case 'servant':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>خادم</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
            <span>مخدوم</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Role Action Notification Banner */}
      {roleActionNotification && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl font-bold text-xs flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-100" />
            <span>{roleActionNotification}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setRoleActionNotification(null)}
            className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900">
              سجل المخدومين وإدارة رتب الخدمة
            </h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {filtered.length} شخص
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            جميع الشباب المسجلين في الاجتماع. اضغط على أي شخص لاختيار ترقيته وتحديد رتبته كـ (خادم - أمين خدمة - أمين اجتماع).
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Switcher Tabs for Community Owner OR Dual-Permission Holder (الكل / سجل المخدومين / سجل المخدومين الآخر) */}
          {(isCommunityOwner || (hasSameGenderAccess && hasOppositeGenderAccess)) && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveGenderTab('all');
                  setGenderFilter('all');
                }}
                className={`px-2.5 py-1 rounded-xl font-bold transition text-[11px] cursor-pointer ${
                  activeGenderTab === 'all' && genderFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                الكل ({allNormalizedRegistrants.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveGenderTab('same');
                  setGenderFilter('all');
                }}
                className={`px-2.5 py-1 rounded-xl font-bold transition text-[11px] cursor-pointer ${
                  activeGenderTab === 'same' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                سجل المخدومين ({viewerGender === 'male' ? 'الشباب 👦' : 'الشابات 👧'} - {allNormalizedRegistrants.filter(m => getNormalizedGender(m) === viewerGender).length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveGenderTab('opposite');
                  setGenderFilter('all');
                }}
                className={`px-2.5 py-1 rounded-xl font-bold transition text-[11px] cursor-pointer ${
                  activeGenderTab === 'opposite' ? 'bg-pink-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                سجل المخدومين الآخر ({viewerGender === 'male' ? 'الشابات / الإناث 👧' : 'الشباب / الذكور 👦'} - {allNormalizedRegistrants.filter(m => getNormalizedGender(m) !== viewerGender).length})
              </button>
            </div>
          )}

          {/* Search box */}
          <div className="relative flex-1 md:w-56">
            <input 
              type="text"
              placeholder="بحث بالاسم أو الكود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
          </div>

          {/* Configure Role Permissions (Strictly Exclusive to Community Owner) */}
          {isCommunityOwner && (
            <button
              type="button"
              onClick={() => {
                if (!isCommunityOwner) return;
                setSelectedRoleForConfig('servant');
                setRoleConfigPermissions(storageService.getRolePermissions('servant'));
                setIsRoleConfigModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
              title="تخصيص الصلاحيات الافتراضية لكل رتبة وتطبيقها فوراً على الجميع"
            >
              <ShieldCheck className="w-4 h-4 text-purple-200" />
              <span>صلاحيات الرتب ⚙️</span>
            </button>
          )}

          {/* Instant Sync / Refresh Button */}
          <button
            type="button"
            onClick={async () => {
              await storageService.fetchLatestServerData();
              onRefresh();
            }}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 transition flex items-center justify-center cursor-pointer shadow-2xs shrink-0"
            title="تحديث ومزامنة فورية الآن مع السيرفر وجميع الهواتف"
          >
            <RefreshCw className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      </div>

      {/* Role Tabs */}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <button
          onClick={() => setRoleFilter('all')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          الكل ({genderScopedRegistrants.length})
        </button>
        <button
          onClick={() => setRoleFilter('member')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'member' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          المخدومين فقط ({genderScopedRegistrants.filter(r => r.role === 'member').length})
        </button>
        <button
          onClick={() => setRoleFilter('servant')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'servant' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          الخدام ({genderScopedRegistrants.filter(r => r.role === 'servant').length})
        </button>
        <button
          onClick={() => setRoleFilter('service_secretary')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'service_secretary' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          أمناء الخدمة ({genderScopedRegistrants.filter(r => r.role === 'service_secretary').length})
        </button>
        <button
          onClick={() => setRoleFilter('meeting_secretary')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'meeting_secretary' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          أمناء الاجتماع ({genderScopedRegistrants.filter(r => r.role === 'meeting_secretary').length})
        </button>
        {!isGenderRestrictedRole && (
          <button
            onClick={() => setRoleFilter('priest')}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1 ${
              roleFilter === 'priest' ? 'bg-purple-950 text-amber-300 border-amber-400 font-bold shadow-xs' : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
            }`}
          >
            <span>✝️ الآباء الكهنة ({genderScopedRegistrants.filter(r => r.role === 'priest').length})</span>
          </button>
        )}
        <button
          onClick={() => setRoleFilter('community_manager')}
          className={`px-3 py-1.5 rounded-xl border transition ${
            roleFilter === 'community_manager' ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          مديرو المجتمع ({genderScopedRegistrants.filter(r => r.role === 'community_manager').length})
        </button>
        <button
          onClick={() => setRoleFilter('new_members')}
          className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 ${
            roleFilter === 'new_members'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <span>✨ الأعضاء الجدد ({genderScopedRegistrants.filter(r => r && r.role !== 'community_owner' && r.status !== 'cancelled' && r.status !== 'blocked').length})</span>
        </button>
        {recentlyUpdatedMembers.length > 0 && (
          <button
            onClick={() => setRoleFilter('recently_updated')}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 ${
              roleFilter === 'recently_updated' ? 'bg-amber-600 text-white border-amber-600 shadow-2xs' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span>🔔 تحديثات الأعضاء الأخيرة ({recentlyUpdatedMembers.length})</span>
          </button>
        )}
        {currentUserRole === 'community_owner' && (
          <button
            onClick={() => setRoleFilter('blocked')}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
              roleFilter === 'blocked'
                ? 'bg-red-600 text-white border-red-600 shadow-2xs font-bold'
                : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100 font-bold'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>المحظورين نهائياً ({blockedUsersList.length})</span>
          </button>
        )}
      </div>

      {/* Banned Users Section (when roleFilter === 'blocked') */}
      {roleFilter === 'blocked' && currentUserRole === 'community_owner' && (
        <div className="bg-white rounded-3xl shadow-xs border border-red-200 overflow-hidden mb-4">
          <div className="p-4 bg-red-50/80 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-sm text-red-950">قائمة المحظورين نهائياً (الأشخاص وعناوين الـ IP)</h3>
                <p className="text-xs text-red-700">يتم حظر الاسم ورقم الهاتف وعنوان الـ IP الخاص بالجهاز، ويمكنك إلغاء الحظر في أي وقت بضغطة زر.</p>
              </div>
            </div>
            <span className="text-xs bg-red-600 text-white font-bold px-3 py-1 rounded-full">
              {blockedUsersList.length} محظور
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">الاسم</th>
                  <th className="py-3 px-4">عنوان الـ IP</th>
                  <th className="py-3 px-4">رقم الهاتف</th>
                  <th className="py-3 px-4">تاريخ الحظر</th>
                  <th className="py-3 px-4 text-center">إلغاء الحظر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {blockedUsersList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                      لا يوجد أي مستخدم محظور حالياً في النظام
                    </td>
                  </tr>
                ) : (
                  blockedUsersList.map((b, idx) => (
                    <tr key={b.id || idx} className="hover:bg-red-50/20">
                      <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{b.fullName}</td>
                      <td className="py-3 px-4 font-mono text-red-700 font-bold" dir="ltr">
                        {b.ipAddress ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 border border-red-200 text-[11px]">
                            {b.ipAddress}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-red-600 font-bold" dir="ltr">{b.phone}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {b.blockedAt ? new Date(b.blockedAt).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={async () => {
                            await storageService.unblockUser(b.id);
                            setRoleActionNotification(`تم إلغاء الحظر عن (${b.fullName}) وعنوان الـ IP الخاص به بنجاح!`);
                            setTimeout(() => setRoleActionNotification(null), 4000);
                            onRefresh();
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>إلغاء الحظر 🔓</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid of Makhdomeen Cards */}
      {(() => {
        if (roleFilter === 'blocked') return null;
        const membersToRender = filtered;
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {membersToRender.map((member) => {
                const isOwner = isTargetMemberOwner(member);
                const isOwnerProtected = isOwner && !isCommunityOwner;
                const isSelf = Boolean(currentViewerMember && member.id === currentViewerMember.id);

          return (
            <div 
              key={member.id}
              onClick={() => {
                if (isOwnerProtected) return;
                if (isOwner && isCommunityOwner) {
                  setEditingMember(member);
                  return;
                }
                if (canManageRoles) {
                  handleOpenRoleModal(member);
                } else {
                  setCardViewingMember(member);
                }
              }}
              className={`bg-white rounded-3xl p-4 border transition-all flex flex-col justify-between group relative ${
                isSelf
                  ? 'border-amber-400 bg-amber-50/15 shadow-md shadow-amber-500/10 ring-2 ring-amber-400/30'
                  : isOwnerProtected 
                  ? 'border-slate-200/80 bg-white cursor-default' 
                  : 'border-slate-200/80 hover:border-emerald-400 hover:shadow-md cursor-pointer'
              }`}
            >
              <div>
                {/* Current Viewer / User Badge */}
                {isSelf && (
                  <div className="mb-2.5 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-black flex items-center justify-between shadow-xs">
                    <span className="flex items-center gap-1.5">
                      <span>⭐</span>
                      <span>أنت (بطاقتك الشخصية وحسابك)</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardViewingMember(member);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] text-white font-bold transition"
                    >
                      عرض البطاقة 🪪
                    </button>
                  </div>
                )}
                {/* New Member Registration Date Badge */}
                {(roleFilter === 'new_members' || (member.registeredAt && (Date.now() - new Date(member.registeredAt).getTime() <= 7 * 24 * 60 * 60 * 1000))) && member.registeredAt && (
                  <div className="mb-2.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200/90 text-[11px] font-bold text-emerald-900 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span>✨ عضو جديد • تاريخ التسجيل:</span>
                    </span>
                    <span className="text-[10px] text-emerald-700 font-mono">
                      {new Date(member.registeredAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                )}
                {/* Recent Member Self-Update Notification Badge */}
                {member.lastUpdatedAt && (
                  <div className="mb-2.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] font-bold text-amber-900 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span>🔄 تم تحديث: {(member.updatedFields || []).join('، ') || 'البيانات'}</span>
                    </span>
                    <span className="text-[10px] text-amber-700 font-mono">
                      {new Date(member.lastUpdatedAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3.5">
                  {(() => {
                    const safeMemberPhoto = resolveSafePhotoUrl(
                      member.photoUrl || (member as any).avatar || (member as any).image,
                      member.id
                    );
                    return (
                      <div 
                        onClick={(e) => {
                          if (safeMemberPhoto) {
                            e.stopPropagation();
                            setEnlargedPhotoMember({ ...member, photoUrl: safeMemberPhoto });
                          }
                        }}
                        title={safeMemberPhoto ? 'انقر لتكبير صورة المخدوم بدقة عالية (WhatsApp/Instagram Zoom) 🔍' : undefined}
                        className={`w-14 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative transition-all duration-300 ${
                          safeMemberPhoto 
                            ? 'cursor-pointer hover:ring-3 hover:ring-emerald-500 hover:scale-105 shadow-xs group/photo' 
                            : ''
                        }`}
                      >
                        {safeMemberPhoto ? (
                          <>
                            <img 
                              src={safeMemberPhoto} 
                              alt={member.fullName || 'عضو'} 
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover/photo:brightness-105 transition-all" 
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold pointer-events-none">
                              🔍
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold text-lg">
                            {(member.fullName || '?').charAt(0)}
                          </div>
                        )}
                        <span className="absolute bottom-0 inset-x-0 text-center text-[9px] bg-black/60 text-white font-bold py-0.5">
                          {(member.gender || 'male') === 'male' ? 'ذكر' : 'أنثى'}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-slate-400 font-bold">
                        {member.uniqueCode}
                      </span>
                      {getRoleBadge(member.role)}
                    </div>

                    <h3 className="text-base font-black transition mt-1 text-slate-900 group-hover:text-emerald-700">
                      {member.role === 'priest' ? ((member.fullName || '').startsWith('أبونا') ? member.fullName : `أبونا ${member.fullName}`) : member.fullName}
                    </h3>

                    {/* Contact Info: Visible to officials, same-gender servants, and anyone granted viewOppositeGenderMembers */}
                    {(() => {
                      const memberGender = getNormalizedGender(member);
                      const isOfficial =
                        isCommunityOwner ||
                        currentUserRole === 'community_manager' ||
                        currentUserRole === 'meeting_secretary' ||
                        currentUserRole === 'priest';
                      const isSameGenderAllowed = hasSameGenderAccess && memberGender === viewerGender;
                      const isOppositeGenderAllowed = hasOppositeGenderAccess && memberGender !== viewerGender;
                      const canView = isOfficial || isSameGenderAllowed || isOppositeGenderAllowed;

                      if (canView) {
                        const cleanWa = (member.whatsapp || member.phone || '').replace(/\D/g, '');
                        const cleanPhone = (member.phone || '').replace(/[^0-9+]/g, '');
                        const telLink = cleanPhone ? `tel:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}` : '#';
                        const waLink = cleanWa ? `https://wa.me/${cleanWa}` : '#';

                        return (
                          <div className="mt-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* 1. Phone number with Call button */}
                            {member.phone && (
                              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs">
                                <span className="font-mono font-bold text-slate-800" dir="ltr">{member.phone}</span>
                                <a
                                  href={telLink}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold text-[11px] flex items-center gap-1 transition shadow-2xs cursor-pointer active:scale-95"
                                  title="اتصال هاتفي مباشر بالمخدوم"
                                >
                                  <Phone className="w-3 h-3 text-slate-700 shrink-0" />
                                  <span>اتصال</span>
                                </a>
                              </div>
                            )}

                            {/* 2. WhatsApp number with WhatsApp button */}
                            {member.whatsapp && (
                              <div className="flex items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-2.5 py-1 text-xs">
                                <span className="font-mono font-bold text-emerald-900" dir="ltr">{member.whatsapp}</span>
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center gap-1 transition shadow-2xs cursor-pointer active:scale-95"
                                  title="محادثة واتساب مباشرة مع المخدوم"
                                >
                                  <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.27 7.49C9.09 7.49 8.89 7.5 8.71 7.53C8.49 7.56 8.27 7.7 8.16 7.91C7.8 8.64 7.22 10.15 7.9 11.75C8.58 13.34 9.92 14.98 12.09 15.93C13.88 16.71 15.08 16.47 15.54 16.24C16 16.01 17.03 14.96 17.24 14.36C17.45 13.77 17.45 13.26 17.39 13.15C17.32 13.05 17.18 12.98 16.94 12.86C16.7 12.74 15.51 12.16 15.29 12.08C15.06 12 14.9 11.96 14.73 12.2C14.57 12.44 14.1 13.03 13.96 13.19C13.82 13.35 13.68 13.37 13.44 13.25C13.2 13.13 12.43 12.88 11.51 12.06C10.79 11.42 10.3 10.63 10.16 10.39C10.02 10.15 10.15 10.02 10.27 9.9C10.38 9.79 10.51 9.61 10.64 9.47C10.76 9.32 10.8 9.21 10.88 9.04C10.96 8.88 10.92 8.74 10.86 8.62C10.8 8.5 10.33 7.35 10.13 6.87C9.93 6.4 9.73 6.46 9.57 6.45C9.42 6.45 9.27 6.45 9.27 7.49Z" />
                                  </svg>
                                  <span>واتساب</span>
                                </a>
                              </div>
                            )}

                            {/* 3. Online Presence & Last Seen: Underneath phone and WhatsApp */}
                            {isOfficial && (
                              <div className="mt-1.5">
                                {(() => {
                                  const isOwnerOnlineNow =
                                    isSelf ||
                                    (member.role === 'community_owner' && storageService.isCommunityOwnerLoggedIn());
                                  const pres = isOwnerOnlineNow
                                    ? { label: 'متصل الآن 🟢', isOnlineNow: true }
                                    : storageService.formatLastSeen(member.lastSeen, member.isOnline);
                                  if (pres.isOnlineNow) {
                                    return (
                                      <div className="flex items-center justify-between gap-1.5 bg-emerald-50 border border-emerald-300 rounded-xl px-2.5 py-1 text-xs">
                                        <span className="flex items-center gap-1.5 font-bold text-emerald-800 text-[11px]">
                                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-300" />
                                          <span>متصل الآن (Online)</span>
                                        </span>
                                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                                          أونلاين 🟢
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/90 rounded-xl px-2.5 py-1 text-xs">
                                      <span className="text-slate-500 font-bold flex items-center gap-1 text-[11px]">
                                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>آخر ظهور:</span>
                                      </span>
                                      <span className="font-bold text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                        {pres.label}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="mt-1">
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono" dir="ltr">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>••••••••••</span>
                          </div>
                          <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg mt-1 inline-flex items-center gap-1 font-semibold">
                            🔒 محجوب (متاح لـ {member.gender === 'female' ? 'الخادمات' : 'الخدام'} والمسؤولين)
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Action trigger footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                {isOwnerProtected ? (
                  <div className="w-full flex items-center justify-between text-amber-900 bg-amber-50/80 border border-amber-200/80 px-3 py-1.5 rounded-xl font-bold text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-700" />
                      <span>مسؤول المجتمع</span>
                    </span>
                  </div>
                ) : isOwner && isCommunityOwner ? (
                  <div className="w-full flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-xl font-bold text-[11px]">
                      <Crown className="w-3.5 h-3.5 text-amber-700" />
                      <span>بياناتي (Owner)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCardViewingMember(member);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-[11px] flex items-center gap-1 transition"
                        title="عرض بطاقتي وأختام الحضور"
                      >
                        <CreditCard className="w-3 h-3 text-blue-700" />
                        <span>أختامي 🪪</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingMember(member);
                        }}
                        className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>تعديل بياناتي</span>
                      </button>
                    </div>
                  </div>
                ) : (isCommunityOwner || currentUserRole === 'community_manager' || canActorEditMember(member)) ? (
                  <div className="w-full flex items-center justify-between gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMember(member);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] flex items-center gap-1 transition"
                      title="تعديل كافة بيانات المخدوم في السجل"
                    >
                      <Edit3 className="w-3 h-3 text-emerald-700" />
                      <span>{currentViewerMember && String(currentViewerMember.id) === String(member.id) ? 'تعديل بياناتي' : 'تعديل'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardViewingMember(member);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-[11px] flex items-center gap-1 transition"
                      title="عرض بطاقة الهوية وأختام الحضور وإدارتها"
                    >
                      <CreditCard className="w-3 h-3 text-blue-700" />
                      <span>الأختام 🪪</span>
                    </button>

                    {canManageRoles && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRoleModal(member);
                        }}
                        className="font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-xl text-[11px] transition flex items-center gap-1"
                        title="تحديد الرتبة والامتيازات"
                      >
                        <span>الرتبة والامتيازات ⚙️</span>
                      </button>
                    )}

                    {currentUserRole === 'community_owner' && member.role !== 'community_owner' && member.id !== 'reg_owner_main' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancellingMember(member);
                          }}
                          className="px-2 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                          title="إلغاء العضوية ومسح بيانات هذا العضو نهائياً من قاعدة بيانات السحابة (Cloudflare) والسيرفر المركزي"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                          <span>إلغاء العضوية</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBlockingMember(member);
                          }}
                          className="px-2 py-1 rounded-xl bg-rose-950 text-rose-200 hover:bg-rose-900 border border-rose-800 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                          title="حظر العضو نهائياً بالاسم ورقم الهاتف ومنعه من الدخول والتسجيل"
                        >
                          <Ban className="w-3 h-3 text-rose-400" />
                          <span>حظر 🚫</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : canManageRoles ? (
                  <div className="w-full flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardViewingMember(member);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-[11px] flex items-center gap-1 transition"
                      title="عرض أختام الحضور والتحكم بها"
                    >
                      <CreditCard className="w-3 h-3 text-blue-700" />
                      <span>الأختام 🪪</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRoleModal(member);
                      }}
                      className="font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-xl text-[11px] transition"
                    >
                      تحديد الرتبة والامتيازات ⚙️
                    </button>
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardViewingMember(member);
                      }}
                      className="w-full py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-[11px] flex items-center justify-center gap-1 transition"
                      title="عرض بطاقة الهوية وأختام الحضور"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-blue-700" />
                      <span>عرض بطاقة الهوية والأختام 🪪</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

        </>
      );
    })()}

      {/* ========================================================
          PROMOTION MODAL (3 Options: خادم - أمين خدمة - أمين اجتماع)
          ======================================================== */}
      {selectedMember && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedMember(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-fadeIn overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 flex items-start justify-between border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                  {selectedMember.photoUrl && selectedMember.photoUrl.trim() !== '' ? (
                    <img src={selectedMember.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base font-bold text-slate-400">{(selectedMember.fullName || '?').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                    تحديد رتبة وامتيازات الخدمة
                  </h3>
                  <p className="text-xs text-slate-600 font-bold mt-0.5">
                    {selectedMember.fullName} ({selectedMember.uniqueCode})
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {getRoleBadge(selectedMember.role)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                title="إغلاق والتراجع"
              >
                <X className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              {/* Quick switch to Edit Personal Data for Owner, Manager, or any authorized Servant */}
              {(currentUserRole === 'community_owner' || currentUserRole === 'community_manager' || canActorEditMember(selectedMember)) && (
                <div className="mb-2 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-900 font-bold">
                    هل ترغب بتعديل بياناته الشخصية (الاسم، الهاتف، الصورة، كلمة المرور)؟
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const m = selectedMember;
                      setSelectedMember(null);
                      setEditingMember(m);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>تعديل</span>
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {/* 1. Role Selection */}
                <div>
                  <label className="text-xs text-slate-700 font-black block mb-2">
                    الرتبة الكنسية والإدارية:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Servant */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTargetRole('servant');
                        setCurrentPermissions(storageService.getRolePermissions('servant'));
                      }}
                      className={`p-3 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer ${
                        editingTargetRole === 'servant'
                          ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/30'
                          : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">🕊️</span>
                          <span className="text-xs font-black text-slate-900">خادم (Servant)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">افتقاد رعوي، حضور، وأعياد ميلاد</p>
                      </div>
                      {editingTargetRole === 'servant' && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>

                    {/* Service Secretary */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTargetRole('service_secretary');
                        setCurrentPermissions(storageService.getRolePermissions('service_secretary'));
                      }}
                      className={`p-3 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer ${
                        editingTargetRole === 'service_secretary'
                          ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/30'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">⭐</span>
                          <span className="text-xs font-black text-slate-900">أمين خدمة</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">صلاحيات موسعة وإشراف مباشر</p>
                      </div>
                      {editingTargetRole === 'service_secretary' && <Check className="w-4 h-4 text-blue-600" />}
                    </button>

                    {/* Meeting Secretary */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTargetRole('meeting_secretary');
                        setCurrentPermissions(storageService.getRolePermissions('meeting_secretary'));
                      }}
                      className={`p-3 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer ${
                        editingTargetRole === 'meeting_secretary'
                          ? 'border-purple-500 bg-purple-50/70 ring-2 ring-purple-500/30'
                          : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">🌟</span>
                          <span className="text-xs font-black text-slate-900">أمين اجتماع</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">إدارة الخدام والتكليفات</p>
                      </div>
                      {editingTargetRole === 'meeting_secretary' && <Check className="w-4 h-4 text-purple-600" />}
                    </button>

                    {/* Priest */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTargetRole('priest');
                        setCurrentPermissions(storageService.getRolePermissions('priest'));
                      }}
                      className={`p-3 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer ${
                        editingTargetRole === 'priest'
                          ? 'border-purple-900 bg-purple-950/10 ring-2 ring-purple-900/30'
                          : 'border-slate-200 hover:border-purple-900 hover:bg-purple-50/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">✝️</span>
                          <span className="text-xs font-black text-purple-950">أبونا (Priest)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">رعاية روحية وصلاحيات عليا</p>
                      </div>
                      {editingTargetRole === 'priest' && <Check className="w-4 h-4 text-purple-900" />}
                    </button>

                    {/* Community Manager (if owner) */}
                    {currentUserRole === 'community_owner' && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTargetRole('community_manager');
                          setCurrentPermissions(storageService.getRolePermissions('community_manager'));
                        }}
                        className={`p-3 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer sm:col-span-2 ${
                          editingTargetRole === 'community_manager'
                            ? 'border-cyan-500 bg-cyan-50/70 ring-2 ring-cyan-500/30'
                            : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">⚡</span>
                            <span className="text-xs font-black text-slate-900">مدير مجتمع (Community Manager)</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">صلاحيات إدارية كاملة لإدارة المجتمع</p>
                        </div>
                        {editingTargetRole === 'community_manager' && <Check className="w-4 h-4 text-cyan-600" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Customizable Permissions Checklist */}
                <div className="border border-slate-200 bg-slate-50/60 rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🛡️</span>
                      <h4 className="text-xs font-black text-slate-900">
                        تخصيص الامتيازات والصلاحيات الإدارية:
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                      تتغير وتمنح بشكل مخصص
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    يمكنك تفعيل أو إلغاء أي امتياز لهذا الخادم بشكل فردي، وتنعكس الصلاحيات فوراً على حسابه:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* canManageKahoot - Three Youths Competition */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canManageKahoot ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎮</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">مسابقات الثلاثة فتية</div>
                          <div className="text-[10px] text-slate-500">إنشاء، تعديل، ونشر المسابقات</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canManageKahoot)}
                        onChange={(e) => handleToggleMemberPermission({ canManageKahoot: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </label>

                    {/* canScanAttendance */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canScanAttendance ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📷</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">الماسح الضوئي للحضور</div>
                          <div className="text-[10px] text-slate-500">مسح بطاقات QR وتسجيل الحضور</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canScanAttendance)}
                        onChange={(e) => handleToggleMemberPermission({ canScanAttendance: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    {/* canManageVisitation */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canManageVisitation ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🕊️</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">الافتقاد الرعوي</div>
                          <div className="text-[10px] text-slate-500">متابعة الافتقاد العام والخاص وكتابة الملاحظات</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canManageVisitation)}
                        onChange={(e) => handleToggleMemberPermission({ canManageVisitation: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>

                    {/* canSendAnnouncements */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canSendAnnouncements ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📢</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">بث الإعلانات والتنبيهات</div>
                          <div className="text-[10px] text-slate-500">إرسال التنبيهات للأعضاء والمخدومين</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canSendAnnouncements)}
                        onChange={(e) => handleToggleMemberPermission({ canSendAnnouncements: e.target.checked })}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </label>

                    {/* canViewMakhdomeen */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canViewMakhdomeen ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">👥</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">سجل المخدومين</div>
                          <div className="text-[10px] text-slate-500">عرض سجل المخدومين والأعضاء من نفس الجنس</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canViewMakhdomeen)}
                        onChange={(e) => handleToggleMemberPermission({ canViewMakhdomeen: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>

                    {/* viewOppositeGenderMembers */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.viewOppositeGenderMembers ? 'bg-pink-50/80 border-pink-300 ring-1 ring-pink-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🔄</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">سجل المخدومين الآخر</div>
                          <div className="text-[10px] text-slate-500">عرض سجل المخدومين والأعضاء من الجنس الآخر مع أرقام هواتفهم</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.viewOppositeGenderMembers)}
                        onChange={(e) => handleToggleMemberPermission({ viewOppositeGenderMembers: e.target.checked })}
                        className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                      />
                    </label>

                    {/* canViewDatabase */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canViewDatabase ? 'bg-cyan-50/80 border-cyan-300 ring-1 ring-cyan-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🗄️</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">قاعدة البيانات الشاملة</div>
                          <div className="text-[10px] text-slate-500">الوصول لبيانات النظام وسجل الملاحظات</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canViewDatabase)}
                        onChange={(e) => handleToggleMemberPermission({ canViewDatabase: e.target.checked })}
                        className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                    </label>

                    {/* canPrintCards */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canPrintCards ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🪪</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">طباعة بطاقات الهوية</div>
                          <div className="text-[10px] text-slate-500">تصدير وطباعة بطاقات عضوية QR</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canPrintCards)}
                        onChange={(e) => handleToggleMemberPermission({ canPrintCards: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </label>

                    {/* canEditMembers */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canEditMembers ? 'bg-teal-50/80 border-teal-300 ring-1 ring-teal-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">✏️</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">تعديل بيانات المخدومين</div>
                          <div className="text-[10px] text-slate-500">تعديل الاسم ورقم الهاتف والمعلومات الشخصية</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canEditMembers)}
                        onChange={(e) => handleToggleMemberPermission({ canEditMembers: e.target.checked })}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </label>

                    {/* canExportData */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canExportData ? 'bg-violet-50/80 border-violet-300 ring-1 ring-violet-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📊</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">تصدير التقارير والكشوفات</div>
                          <div className="text-[10px] text-slate-500">تصدير ملفات Excel و CSV</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canExportData)}
                        onChange={(e) => handleToggleMemberPermission({ canExportData: e.target.checked })}
                        className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                    </label>

                    {/* canManageEvents */}
                    <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      currentPermissions.canManageEvents ? 'bg-sky-50/80 border-sky-300 ring-1 ring-sky-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🏕️</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">الرحلات والمؤتمرات والأيام الروحية</div>
                          <div className="text-[10px] text-slate-500">إدارة الفعاليات والتسجيلات والأتوبيسات</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(currentPermissions.canManageEvents)}
                        onChange={(e) => handleToggleMemberPermission({
                          canManageEvents: e.target.checked,
                          canManageEventPayments: e.target.checked,
                          canScanEventAttendance: e.target.checked
                        })}
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                    </label>

                    {/* canCancelMembership */}
                    {(currentUserRole === 'community_owner' || currentUserRole === 'community_manager') && (
                      <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        currentPermissions.canCancelMembership ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-300/40' : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🚫</span>
                          <div>
                            <div className="text-xs font-bold text-rose-900">إلغاء وإيقاف العضوية</div>
                            <div className="text-[10px] text-slate-500">صلاحية إيقاف أو حظر الأعضاء</div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(currentPermissions.canCancelMembership)}
                          onChange={(e) => handleToggleMemberPermission({ canCancelMembership: e.target.checked })}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Option to revert to regular member */}
                {selectedMember.role !== 'member' && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleDemoteToMember}
                      className="w-full py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100/70 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إلغاء الرتبة وإعادته كـ "مخدوم عادي" بدون أي صلاحيات خادم</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                إلغاء وتراجع
              </button>

              <button
                type="button"
                onClick={handleSaveRoleAndPermissions}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>حفظ الرتبة والامتيازات المحددة</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          ROLE-WIDE PERMISSIONS CONFIGURATION MODAL (Strictly Exclusive to Community Owner)
          ======================================================== */}
      {isCommunityOwner && isRoleConfigModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-fadeIn">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-lg">
                  🛡️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black">
                    تخصيص وتعيين صلاحيات الرتب
                  </h3>
                  <p className="text-[11px] text-purple-200 font-medium mt-0.5">
                    تحديد الصلاحيات الممنوحة لكل رتبة وتطبيقها فوراً على جميع الحسابات والجلسات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleConfigModalOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Role Selector Tabs */}
              <div>
                <label className="text-xs font-black text-slate-800 block mb-2">
                  اختر الرتبة المراد تخصيص وضبط صلاحياتها:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* Servant */}
                  <button
                    type="button"
                    onClick={() => handleSelectRoleForConfig('servant')}
                    className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between ${
                      selectedRoleForConfig === 'servant'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-black ring-2 ring-emerald-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>🕊️</span>
                      <span className="text-xs">خادم (Servant)</span>
                    </div>
                    {selectedRoleForConfig === 'servant' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>

                  {/* Service Secretary */}
                  <button
                    type="button"
                    onClick={() => handleSelectRoleForConfig('service_secretary')}
                    className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between ${
                      selectedRoleForConfig === 'service_secretary'
                        ? 'border-blue-500 bg-blue-50 text-blue-950 font-black ring-2 ring-blue-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>⭐</span>
                      <span className="text-xs">أمين خدمة</span>
                    </div>
                    {selectedRoleForConfig === 'service_secretary' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>

                  {/* Meeting Secretary */}
                  <button
                    type="button"
                    onClick={() => handleSelectRoleForConfig('meeting_secretary')}
                    className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between ${
                      selectedRoleForConfig === 'meeting_secretary'
                        ? 'border-purple-500 bg-purple-50 text-purple-950 font-black ring-2 ring-purple-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>🌟</span>
                      <span className="text-xs">أمين اجتماع</span>
                    </div>
                    {selectedRoleForConfig === 'meeting_secretary' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                  </button>

                  {/* Priest */}
                  <button
                    type="button"
                    onClick={() => handleSelectRoleForConfig('priest')}
                    className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between ${
                      selectedRoleForConfig === 'priest'
                        ? 'border-purple-900 bg-purple-50 text-purple-950 font-black ring-2 ring-purple-900/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>✝️</span>
                      <span className="text-xs">أبونا (Priest)</span>
                    </div>
                    {selectedRoleForConfig === 'priest' && <Check className="w-3.5 h-3.5 text-purple-900" />}
                  </button>

                  {/* Community Manager (if owner) */}
                  {currentUserRole === 'community_owner' && (
                    <button
                      type="button"
                      onClick={() => handleSelectRoleForConfig('community_manager')}
                      className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between ${
                        selectedRoleForConfig === 'community_manager'
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-950 font-black ring-2 ring-cyan-500/30'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>⚡</span>
                        <span className="text-xs">مدير مجتمع</span>
                      </div>
                      {selectedRoleForConfig === 'community_manager' && <Check className="w-3.5 h-3.5 text-cyan-600" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200/80 text-xs text-slate-600 flex items-center gap-2">
                <span className="text-sm">💡</span>
                <span>
                  أي صلاحية تُفعّل هنا تصبح الصلاحية الأساسية لجميع أصحاب هذه الرتبة، وتتحدث جلساتهم فوراً دون الحاجة لتسجيل الخروج.
                </span>
              </div>

              {/* Permissions Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* 1. canManageKahoot */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canManageKahoot ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎮</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">مسابقات الثلاثة فتية</div>
                      <div className="text-[10px] text-slate-500">إنشاء، تعديل، ونشر المسابقات</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canManageKahoot)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canManageKahoot: e.target.checked }))}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 2. canScanAttendance */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canScanAttendance ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">📷</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">الماسح الضوئي للحضور</div>
                      <div className="text-[10px] text-slate-500">مسح بطاقات QR وتسجيل الحضور</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canScanAttendance)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canScanAttendance: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 3. canManageVisitation */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canManageVisitation ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🕊️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">الافتقاد الرعوي</div>
                      <div className="text-[10px] text-slate-500">متابعة الافتقاد العام والخاص وكتابة الملاحظات</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canManageVisitation)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canManageVisitation: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* تخصيص نطاق جنس المخدومين في الافتقاد لرتبة أمين الخدمة (حصري لمسؤول المجتمع) */}
                {selectedRoleForConfig === 'service_secretary' && (
                  <div className="col-span-1 sm:col-span-2 p-3.5 rounded-2xl bg-blue-50/80 border-2 border-blue-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                        <span>👥</span>
                        <span>نطاق إظهار المخدومين لأمين الخدمة في الافتقاد وسجل المخدومين:</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                        تحكم مسؤول المجتمع
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={currentUserRole !== 'community_owner'}
                        onClick={() => setRoleConfigPermissions(p => ({ ...p, canViewAllGendersVisitation: false }))}
                        className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                          !roleConfigPermissions.canViewAllGendersVisitation
                            ? 'bg-blue-600 text-white border-blue-700 font-bold shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50'
                        }`}
                      >
                        <div className="text-xs font-black">الوضع الأول (الافتراضي) ✓</div>
                        <div className={`text-[10px] mt-0.5 ${!roleConfigPermissions.canViewAllGendersVisitation ? 'text-blue-100' : 'text-slate-500'}`}>
                          إظهار المخدومين من نفس جنسه فقط لأمين الخدمة
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={currentUserRole !== 'community_owner'}
                        onClick={() => setRoleConfigPermissions(p => ({ ...p, canViewAllGendersVisitation: true }))}
                        className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                          roleConfigPermissions.canViewAllGendersVisitation
                            ? 'bg-emerald-600 text-white border-emerald-700 font-bold shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                        }`}
                      >
                        <div className="text-xs font-black">الوضع الثاني (شامل) 🌐</div>
                        <div className={`text-[10px] mt-0.5 ${roleConfigPermissions.canViewAllGendersVisitation ? 'text-emerald-100' : 'text-slate-500'}`}>
                          إظهار كل المخدومين (ذكور وإناث) لأمين الخدمة
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. canSendAnnouncements */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canSendAnnouncements ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">📢</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">بث الإعلانات والتنبيهات</div>
                      <div className="text-[10px] text-slate-500">إرسال التنبيهات للأعضاء والمخدومين</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canSendAnnouncements)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canSendAnnouncements: e.target.checked }))}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 5. canViewMakhdomeen */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canViewMakhdomeen ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">👥</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">سجل المخدومين</div>
                      <div className="text-[10px] text-slate-500">عرض سجل المخدومين والأعضاء من نفس الجنس</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canViewMakhdomeen)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canViewMakhdomeen: e.target.checked }))}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 5b. viewOppositeGenderMembers (سجل المخدومين الآخر) */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.viewOppositeGenderMembers ? 'bg-pink-50 border-pink-300 ring-1 ring-pink-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔄</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">سجل المخدومين الآخر</div>
                      <div className="text-[10px] text-slate-500">عرض سجل المخدومين والأعضاء من الجنس الآخر مع أرقام هواتفهم</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.viewOppositeGenderMembers)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, viewOppositeGenderMembers: e.target.checked }))}
                    className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 6. canViewDatabase */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canViewDatabase ? 'bg-cyan-50 border-cyan-300 ring-1 ring-cyan-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🗄️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">قاعدة البيانات الشاملة</div>
                      <div className="text-[10px] text-slate-500">الوصول لبيانات النظام وسجل الملاحظات</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canViewDatabase)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canViewDatabase: e.target.checked }))}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 7. canPrintCards */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canPrintCards ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🪪</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">طباعة بطاقات الهوية</div>
                      <div className="text-[10px] text-slate-500">تصدير وطباعة بطاقات عضوية QR</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canPrintCards)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canPrintCards: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 8. canEditMembers */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canEditMembers ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">✏️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">تعديل بيانات المخدومين</div>
                      <div className="text-[10px] text-slate-500">تعديل الاسم ورقم الهاتف والمعلومات الشخصية</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canEditMembers)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canEditMembers: e.target.checked }))}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 9. canExportData */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canExportData ? 'bg-violet-50 border-violet-300 ring-1 ring-violet-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">📊</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">تصدير التقارير والكشوفات</div>
                      <div className="text-[10px] text-slate-500">تصدير ملفات Excel و CSV</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canExportData)}
                    onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canExportData: e.target.checked }))}
                    className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 9b. canManageEvents */}
                <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                } ${
                  roleConfigPermissions.canManageEvents ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-300/50' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏕️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">الرحلات والمؤتمرات والأيام الروحية</div>
                      <div className="text-[10px] text-slate-500">إدارة الفعاليات والتسجيلات والأتوبيسات</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={currentUserRole !== 'community_owner'}
                    checked={Boolean(roleConfigPermissions.canManageEvents)}
                    onChange={(e) => setRoleConfigPermissions(p => ({
                      ...p,
                      canManageEvents: e.target.checked,
                      canManageEventPayments: e.target.checked,
                      canScanEventAttendance: e.target.checked
                    }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  />
                </label>

                {/* 10. canCancelMembership */}
                {(currentUserRole === 'community_owner' || currentUserRole === 'community_manager') && (
                  <label className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    currentUserRole === 'community_owner' ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    roleConfigPermissions.canCancelMembership ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300/50' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚫</span>
                      <div>
                        <div className="text-xs font-bold text-rose-900">إلغاء وإيقاف العضوية</div>
                        <div className="text-[10px] text-slate-500">صلاحية إيقاف أو حظر الأعضاء</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={currentUserRole !== 'community_owner'}
                      checked={Boolean(roleConfigPermissions.canCancelMembership)}
                      onChange={(e) => setRoleConfigPermissions(p => ({ ...p, canCancelMembership: e.target.checked }))}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsRoleConfigModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>

              {currentUserRole === 'community_owner' && (
                <button
                  type="button"
                  onClick={handleSaveRoleConfig}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ وتطبيق فوراً على جميع أصحاب هذه الرتبة</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          FULL EDIT MEMBER MODAL (Community Owner & Manager)
          ======================================================== */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          currentUserRole={currentUserRole}
          isOpen={!!editingMember}
          onClose={() => setEditingMember(null)}
          onSaveSuccess={() => {
            setEditingMember(null);
            onRefresh();
          }}
        />
      )}

      {/* ========================================================
          ID CARD & ATTENDANCE STAMPS MODAL
          ======================================================== */}
      {cardViewingMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-5 shadow-2xl border border-slate-200 my-auto space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-100 text-blue-800 text-sm">🪪</span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    بطاقة العضو وأختام الحضور
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {cardViewingMember.fullName} ({cardViewingMember.uniqueCode})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCardViewingMember(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-w-md mx-auto">
              <IdCardItem
                registrant={cardViewingMember}
                defaultFace="back"
                viewerRole={currentUserRole}
                attendanceRecords={storageService.getAttendanceRecords()}
                onRefresh={onRefresh}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          COMMUNITY OWNER: CONFIRM PERMANENT MEMBERSHIP CANCEL / DELETE
          ======================================================== */}
      {cancellingMember && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-fadeIn text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-black text-slate-900">
              تأكيد إلغاء العضوية والحذف النهائي من السحابة
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              بصفتك مسؤول المجتمع (Community Owner): هل أنت متأكد من إلغاء عضوية <span className="font-bold text-slate-900">({cancellingMember.fullName})</span>؟ سيتم مسح بياناته تماماً وفوراً من قاعدة بيانات السحابة (Cloudflare) ومن السيرفر المركزي، ولن يظهر هذا العضو بعد الآن في الداشبورد وسيتم تعطيل تسجيل دخوله بحسابه الملغي دون حظر اسمه إذا رغب في التسجيل مجدداً.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancellingMember(null)}
                disabled={isDeletingMember}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelMembership}
                disabled={isDeletingMember}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingMember ? (
                  <span>جاري المسح من Cloudflare...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، الغِ العضوية وامسح البيانات</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          COMMUNITY OWNER: CONFIRM PERMANENT BLOCK MODAL
          ======================================================== */}
      {blockingMember && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-300 animate-fadeIn text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto shadow-inner ring-4 ring-rose-50">
              <Ban className="w-6 h-6" />
            </div>
            <h4 className="text-base font-black text-slate-900">
              تأكيد حظر العضو نهائياً (Block)
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              بصفتك مسؤول المجتمع (Community Owner): هل أنت متأكد من حظر <span className="font-bold text-slate-900">({blockingMember.fullName})</span>؟
              <br />
              سيتم حفظ اسمه ورقم هاتفه في جدول المحظورين بقاعدة بيانات السحابة (Cloudflare) والسيرفر المركزي، ويُمنع تماماً من تسجيل الدخول أو إعادة التسجيل في الموقع حتى تقوم بفك الحظر عنه (Unblock).
            </p>
            <div className="text-right">
              <label className="text-[11px] font-bold text-slate-700 block mb-1">سبب الحظر (اختياري):</label>
              <input
                type="text"
                value={blockReasonInput}
                onChange={(e) => setBlockReasonInput(e.target.value)}
                placeholder="اكتب سبب الحظر هنا..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 text-right"
              />
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setBlockingMember(null);
                  setBlockReasonInput('');
                }}
                disabled={isBlockingMember}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmBlockMember}
                disabled={isBlockingMember}
                className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-lg shadow-rose-700/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isBlockingMember ? (
                  <span>جاري الحظر في Cloudflare...</span>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    <span>تأكيد الحظر النهائي 🚫</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          WHATSAPP / INSTAGRAM / FACEBOOK STYLE PHOTO ZOOM MODAL
          Requirement: "اذا داسوا على صورة اي مخدوم في بطاقته صوره تكبر بصوره كبيره وواضحة بنفس الحركة الموجودة في الواتساب و الفيسبوك و الانستقرام واذا داس في اي مكان برا الصورة بعد ما الورة كبرت ترجع لحجمها في بطاقة المخدوم"
          ======================================================== */}
      {enlargedPhotoMember && enlargedPhotoMember.photoUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-all duration-300 animate-fadeIn"
          onClick={() => setEnlargedPhotoMember(null)}
        >
          {/* Top Bar with Member Details & Close Button */}
          <div 
            className="max-w-lg w-full flex items-center justify-between pb-3 text-white px-2 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <h3 className="font-black text-sm sm:text-base text-white leading-tight">
                  {enlargedPhotoMember.fullName}
                </h3>
                <span className="font-mono text-xs text-emerald-300">
                  {enlargedPhotoMember.uniqueCode}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEnlargedPhotoMember(null)}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg"
              title="إغلاق (Esc أو النقر بالخارج)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* High-Resolution Photo Container with Instagram/WhatsApp Zoom-in animation */}
          <div 
            className="relative max-w-lg w-full max-h-[75vh] flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black transform transition-transform duration-300 ease-out scale-100 hover:scale-102"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={resolveSafePhotoUrl(enlargedPhotoMember.photoUrl || (enlargedPhotoMember as any).avatar || (enlargedPhotoMember as any).image, enlargedPhotoMember.id)}
              alt={enlargedPhotoMember.fullName}
              className="w-full h-auto max-h-[72vh] object-contain select-none"
            />
          </div>

          {/* Bottom Hint */}
          <div 
            className="mt-4 text-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white/80 text-xs font-bold flex items-center justify-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <span>👈 انقر في أي مكان خارج الصورة للرجوع لبطاقة المخدوم ✕</span>
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
