import React, { useState, useEffect } from 'react';
import { Registrant, SpecialAssignment, SpecialVisitedRecord, UserRole, VisitationNote } from '../../types';
import { 
  storageService, 
  safeStorage, 
  normalizeArabicNameForComparison, 
  isThreePartNameMatch,
  isVisitationModeLocked,
  isAssignmentsLocked,
  ACTIVE_VISITATION_MODE_STORAGE_KEY,
  ASSIGNMENTS_STORAGE_KEY,
  VISITATION_NOTES_STORAGE_KEY
} from '../../services/storageService';
import { 
  Phone, 
  MessageCircle, 
  CheckSquare, 
  Square, 
  Users, 
  Shuffle, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  RefreshCw, 
  Plus, 
  Trash2, 
  UserCheck, 
  Filter, 
  Search,
  Sparkles,
  HeartHandshake,
  FileText,
  X,
  Lock,
  ShieldCheck,
  Edit3,
  Save,
  Eye
} from 'lucide-react';

interface VisitationViewProps {
  registrants: Registrant[];
  currentServantName: string;
  currentServantId?: string;
  currentServantGender?: 'male' | 'female';
  currentUserRole: UserRole;
  onRefresh: () => void;
}

export const VisitationView: React.FC<VisitationViewProps> = ({
  registrants,
  currentServantName,
  currentServantId,
  currentServantGender = 'male',
  currentUserRole,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Leadership roles
  const isResponsibleLeader = 
    currentUserRole === 'priest' ||
    currentUserRole === 'meeting_secretary' || 
    currentUserRole === 'community_manager' || 
    currentUserRole === 'community_owner' ||
    currentUserRole === 'service_secretary';

  // Permission: ONLY Community Owner and Community Manager can configure mode and create special assignments
  const isOwnerOrManager = 
    currentUserRole === 'community_owner' || 
    currentUserRole === 'community_manager';

  const canCreateSpecialAssignment = isOwnerOrManager;

  // Active community visitation mode chosen by Owner / Manager
  const [communityVisitationMode, setCommunityVisitationMode] = useState<'general' | 'special'>(() => storageService.getActiveVisitationMode());

  // Tab state:
  // For owner/manager, they can inspect general, special, or notes_log
  // For other roles, it strictly follows the communityVisitationMode (or notes_log for responsible leaders)
  const [activeTab, setActiveTab] = useState<'general' | 'special' | 'notes_log'>(() => storageService.getActiveVisitationMode());

  const effectiveTab: 'general' | 'special' | 'notes_log' = isOwnerOrManager
    ? activeTab
    : (activeTab === 'notes_log' && isResponsibleLeader ? 'notes_log' : communityVisitationMode);

  const handleSelectCommunityMode = (mode: 'general' | 'special') => {
    if (!isOwnerOrManager) return;
    // 1. Immediate UI update
    setCommunityVisitationMode(mode);
    setActiveTab(mode);
    if (mode === 'general') {
      setSpecialAssignments([]);
      safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
    }
    // 2. Central mode persist & broadcast
    storageService.setActiveVisitationMode(mode);
    onRefresh();
  };

  const formatVisitDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  const NON_MEMBER_ROLES = new Set([
    'servant',
    'service_secretary',
    'meeting_secretary',
    'community_manager',
    'community_owner',
    'priest'
  ]);

  const [selectedMemberForNotes, setSelectedMemberForNotes] = useState<Registrant | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [noteSaveSuccess, setNoteSaveSuccess] = useState(false);
  const [visitationNotes, setVisitationNotes] = useState<VisitationNote[]>(() => storageService.getVisitationNotes());
  const [notesSearchQuery, setNotesSearchQuery] = useState('');
  
  const canServiceSecretaryViewAllGenders = Boolean(
    storageService.getRolePermissions('service_secretary')?.canViewAllGendersVisitation
  );
  const isGenderRestrictedUser =
    currentUserRole === 'servant' ||
    (currentUserRole === 'service_secretary' && !canServiceSecretaryViewAllGenders);

  // General visitation gender filter
  const [genderFilter, setGenderFilter] = useState<'servant_matched' | 'all' | 'male' | 'female'>(
    isGenderRestrictedUser ? 'servant_matched' : 'all'
  );
  const [visitedFilter, setVisitedFilter] = useState<'all' | 'unvisited' | 'visited'>('all');

  // Special Assignment creation state
  const [showNewAssignmentModal, setShowNewAssignmentModal] = useState(false);
  const [selectedServantId, setSelectedServantId] = useState('');
  const [assignmentPeriodDays, setAssignmentPeriodDays] = useState(14);
  const [assignmentMemberCount, setAssignmentMemberCount] = useState(3);

  // Visited youths modal state (strictly separated by 'general' vs 'special' mode)
  const [showVisitedYouthModal, setShowVisitedYouthModal] = useState(false);
  const [visitedModalMode, setVisitedModalMode] = useState<'general' | 'special'>('general');
  const [visitedModalSearchQuery, setVisitedModalSearchQuery] = useState('');

  // Special assignments & isolated Special Visitation database state
  const [specialAssignments, setSpecialAssignments] = useState<SpecialAssignment[]>(() => storageService.getSpecialAssignments());
  const [specialVisitedMap, setSpecialVisitedMap] = useState<Record<string, SpecialVisitedRecord>>(() => storageService.getSpecialVisitedMembers());
  // Optimistic visited state for instantaneous 0ms feedback in General Visitation
  const [optimisticGeneralVisited, setOptimisticGeneralVisited] = useState<Record<string, { isVisited: boolean; visitedBy?: string; visitedAt?: string }>>({});

  // 1. Compute youths visited strictly in GENERAL VISITATION (نظام الافتقاد العام فقط)
  const generalVisitedYouths = React.useMemo(() => {
    return registrants
      .filter(r => {
        if (r.role !== 'member' || NON_MEMBER_ROLES.has(r.role)) return false;
        if (r.status === 'cancelled' || r.status === 'blocked') return false;
        if (isGenderRestrictedUser && (r.gender || 'male') !== currentServantGender) return false;
        const opt = optimisticGeneralVisited[r.id];
        const isOptVisited = opt !== undefined ? opt.isVisited : Boolean(r.isVisitedGeneral);
        return isOptVisited;
      })
      .map(r => {
        const opt = optimisticGeneralVisited[r.id];
        return {
          ...r,
          visitedBy: (opt && opt.visitedBy) || r.lastVisitedBy || 'أحد الخدام',
          visitedAt: (opt && opt.visitedAt) || r.lastVisitedAt
        };
      })
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
  }, [registrants, optimisticGeneralVisited, isGenderRestrictedUser, currentServantGender]);

  // 2. Compute youths visited strictly in SPECIAL VISITATION (نظام الافتقاد الخاص فقط - منعزل تماماً عن العام)
  const specialVisitedYouths = React.useMemo(() => {
    const completedInSpecial = new Map<string, { visitedBy: string; visitedAt?: string; assignmentId?: string }>();
    Object.entries(specialVisitedMap || {}).forEach(([memberId, rec]) => {
      if (rec && rec.memberId) {
        completedInSpecial.set(memberId, {
          visitedBy: rec.visitedBy || 'أحد الخدام',
          visitedAt: rec.visitedAt,
          assignmentId: rec.assignmentId
        });
      }
    });
    specialAssignments.forEach(asgn => {
      (asgn.completedMemberIds || []).forEach(id => {
        const details = asgn.completedDetails?.[id];
        completedInSpecial.set(id, {
          visitedBy: details?.visitedBy || asgn.servantName || 'أحد الخدام',
          visitedAt: details?.visitedAt || asgn.startDate,
          assignmentId: asgn.id
        });
      });
    });

    return registrants
      .filter(r => {
        if (r.role !== 'member' || NON_MEMBER_ROLES.has(r.role)) return false;
        if (r.status === 'cancelled' || r.status === 'blocked') return false;
        return completedInSpecial.has(r.id);
      })
      .map(r => {
        const specialInfo = completedInSpecial.get(r.id);
        return {
          ...r,
          visitedBy: specialInfo?.visitedBy || 'أحد الخدام',
          visitedAt: specialInfo?.visitedAt,
          assignmentId: specialInfo?.assignmentId
        };
      })
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
  }, [registrants, specialAssignments, specialVisitedMap]);

  // Sync state on storage updates and fast cross-device polling (2 seconds)
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      const newMode = storageService.getActiveVisitationMode();
      setSpecialAssignments(storageService.getSpecialAssignments());
      setSpecialVisitedMap(storageService.getSpecialVisitedMembers());
      setVisitationNotes(storageService.getVisitationNotes());
      setCommunityVisitationMode(newMode);
      setActiveTab(prev => (prev === 'notes_log' && isResponsibleLeader ? 'notes_log' : newMode));
    });

    // Fast 2s background polling using mutation-locked fetchLatestServerData (reconciles both Cloudflare D1 & Central Server)
    const liveSyncInterval = setInterval(async () => {
      try {
        const res = await storageService.fetchLatestServerData();
        if (!isVisitationModeLocked()) {
          const latestMode = storageService.getActiveVisitationMode();
          setCommunityVisitationMode(latestMode);
          setActiveTab(prev => (prev === 'notes_log' && isResponsibleLeader ? 'notes_log' : latestMode));
        }
        if (!isAssignmentsLocked()) {
          setSpecialAssignments(storageService.getSpecialAssignments());
          setSpecialVisitedMap(storageService.getSpecialVisitedMembers());
        }
        setVisitationNotes(storageService.getVisitationNotes());
        if (res.hasLocalChanges) {
          onRefresh();
        }
      } catch {}
    }, 2000);

    return () => {
      unsub();
      clearInterval(liveSyncInterval);
    };
  }, [isOwnerOrManager, isResponsibleLeader, onRefresh]);

  // Sync assignments and reconcile optimistic visited state when registrants change
  useEffect(() => {
    setSpecialAssignments(storageService.getSpecialAssignments());
    setSpecialVisitedMap(storageService.getSpecialVisitedMembers());
    setOptimisticGeneralVisited(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [id, opt] of Object.entries(next)) {
        const found = registrants.find(r => r.id === id);
        if (found && Boolean(found.isVisitedGeneral) === Boolean(opt.isVisited)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [registrants]);

  const servantsList = registrants.filter(r => r.role === 'servant' || r.role === 'service_secretary' || r.role === 'meeting_secretary' || r.role === 'priest' || r.role === 'community_owner' || r.role === 'community_manager');

  // Filter General Visitation list - STRICTLY makhdomeen only (never servants or leaders)
  const generalList = registrants.filter((member) => {
    // Only regular youths/makhdomeen are being visited (exclude servants, secretaries, managers, owner)
    if (member.role !== 'member' || NON_MEMBER_ROLES.has(member.role)) return false;
    if (member.status === 'cancelled' || member.status === 'blocked') return false;

    // Gender matching rule: servants and default service_secretaries see ONLY makhdomeen of their own gender unless Community Owner enabled all-genders mode
    if (isGenderRestrictedUser) {
      if ((member.gender || 'male') !== currentServantGender) return false;
    } else if (genderFilter === 'servant_matched') {
      if (member.gender !== currentServantGender) return false;
    } else if (genderFilter === 'male') {
      if (member.gender !== 'male') return false;
    } else if (genderFilter === 'female') {
      if (member.gender !== 'female') return false;
    }

    // Visited status filter (with optimistic check)
    const isVisited = optimisticGeneralVisited[member.id] !== undefined
      ? optimisticGeneralVisited[member.id].isVisited
      : Boolean(member.isVisitedGeneral);

    if (visitedFilter === 'unvisited' && isVisited) return false;
    if (visitedFilter === 'visited' && !isVisited) return false;

    // Search
    const q = searchQuery.toLowerCase().trim();
    if (q && !(member.fullName || '').toLowerCase().includes(q) && !(member.phone || '').includes(q) && !(member.uniqueCode || '').toLowerCase().includes(q)) return false;

    return true;
  }).sort((a, b) => {
    const aOpt = optimisticGeneralVisited[a.id];
    const bOpt = optimisticGeneralVisited[b.id];
    const aVisited = aOpt !== undefined ? aOpt.isVisited : Boolean(a.isVisitedGeneral);
    const bVisited = bOpt !== undefined ? bOpt.isVisited : Boolean(b.isVisitedGeneral);

    if (aVisited !== bVisited) {
      return aVisited ? 1 : -1; // Unvisited at the top (false), visited at the bottom (true)
    }
    return (a.fullName || '').localeCompare(b.fullName || '', 'ar');
  });

  // Toggle general visitation with instant optimistic zero-delay update (no hanging/freezing)
  const handleToggleGeneralVisit = (memberId: string) => {
    const youth = registrants.find(r => r.id === memberId);
    const currentlyVisited = optimisticGeneralVisited[memberId] !== undefined
      ? optimisticGeneralVisited[memberId].isVisited
      : Boolean(youth?.isVisitedGeneral);
    const nextState = !currentlyVisited;
    const nowIso = new Date().toISOString();

    // 1. Instant 0ms optimistic UI update (check icon toggles immediately!)
    setOptimisticGeneralVisited(prev => ({
      ...prev,
      [memberId]: {
        isVisited: nextState,
        visitedBy: nextState ? currentServantName : undefined,
        visitedAt: nextState ? nowIso : undefined
      }
    }));

    // 2. Persist in storage & cloud without blocking the UI
    try {
      storageService.toggleGeneralVisitation(memberId, currentServantName);
    } catch (e) {
      console.warn('Could not persist general visitation toggle:', e);
    }

    // 3. Notify parent
    onRefresh();
  };

  // Toggle special assignment member visited with instant optimistic zero-delay update (Isolated strictly to Special Visitation)
  const handleToggleSpecialVisit = (assignmentId: string, memberId: string) => {
    const nowIso = new Date().toISOString();
    let isNowCompleted = false;
    let actorName = currentServantName;

    // 1. Instant 0ms optimistic UI update for special assignments
    setSpecialAssignments(prevAssignments => 
      prevAssignments.map(asgn => {
        if (asgn.id !== assignmentId) return asgn;
        actorName = currentServantName || asgn.servantName || 'خادم';
        const currentCompleted = new Set(asgn.completedMemberIds || []);
        const nextDetails = { ...(asgn.completedDetails || {}) };
        if (currentCompleted.has(memberId)) {
          currentCompleted.delete(memberId);
          delete nextDetails[memberId];
          isNowCompleted = false;
        } else {
          currentCompleted.add(memberId);
          nextDetails[memberId] = { visitedBy: actorName, visitedAt: nowIso };
          isNowCompleted = true;
        }
        return {
          ...asgn,
          completedMemberIds: Array.from(currentCompleted),
          completedDetails: nextDetails
        };
      })
    );

    // 2. Optimistically update ONLY Special Visitation visited database (NEVER General Visitation)
    setSpecialVisitedMap(prev => {
      const next = { ...prev };
      if (isNowCompleted) {
        next[memberId] = {
          memberId,
          visitedBy: actorName,
          visitedAt: nowIso,
          assignmentId
        };
      } else {
        delete next[memberId];
      }
      return next;
    });

    // 3. Persist in storage & cloud via atomic Special Visitation endpoint
    try {
      storageService.toggleSpecialAssignmentMemberVisited(assignmentId, memberId, currentServantName);
    } catch (e) {
      console.warn('Could not persist special visitation toggle:', e);
    }

    // 4. Notify parent
    onRefresh();
  };

  // Toggle/uncheck a member directly from the "تم افتقادهم" modal (General or Special)
  const handleToggleVisitedFromModal = (memberId: string) => {
    if (visitedModalMode === 'general') {
      handleToggleGeneralVisit(memberId);
    } else {
      setSpecialVisitedMap(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      setSpecialAssignments(prev =>
        prev.map(asgn => {
          if (!(asgn.completedMemberIds || []).includes(memberId)) return asgn;
          const nextDetails = { ...(asgn.completedDetails || {}) };
          delete nextDetails[memberId];
          return {
            ...asgn,
            completedMemberIds: (asgn.completedMemberIds || []).filter(id => id !== memberId),
            completedDetails: nextDetails
          };
        })
      );
      storageService.toggleSpecialVisitedMemberDirect(memberId, currentServantName);
      onRefresh();
    }
  };

  // Create Special Assignment (restricted to community_owner and community_manager)
  const handleCreateSpecialAssignment = () => {
    if (!canCreateSpecialAssignment) return;
    if (!selectedServantId) return;
    const targetServant = registrants.find(r => r.id === selectedServantId);
    if (!targetServant) return;

    const newAsgn = storageService.createSpecialAssignment(
      selectedServantId,
      targetServant.fullName,
      assignmentMemberCount,
      assignmentPeriodDays
    );

    // Explicitly guarantee Special mode and new assignment are immediately set and visible in UI
    storageService.setActiveVisitationMode('special');
    setCommunityVisitationMode('special');
    setActiveTab('special');
    setSpecialAssignments(prev => {
      const filtered = prev.filter(a => a.id !== newAsgn.id);
      return [newAsgn, ...filtered];
    });

    setShowNewAssignmentModal(false);
    setSelectedServantId('');
    onRefresh();
  };

  // Rotate special assignment
  const handleRotateAssignment = (assignmentId: string) => {
    const updated = storageService.rotateSpecialAssignment(assignmentId);
    if (updated) {
      setSpecialAssignments(prev => prev.map(a => a.id === assignmentId ? updated : a));
    } else {
      setSpecialAssignments(storageService.getSpecialAssignments());
    }
    onRefresh();
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    setSpecialAssignments(prev => prev.filter(a => a.id !== assignmentId));
    storageService.deleteSpecialAssignment(assignmentId);
    onRefresh();
  };

  // Save manual note for member
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberForNotes || !newNoteText.trim()) return;

    storageService.addVisitationNote({
      memberId: selectedMemberForNotes.id,
      memberName: selectedMemberForNotes.fullName,
      authorName: currentServantName,
      authorRole: currentUserRole,
      notes: newNoteText.trim()
    });

    setVisitationNotes(storageService.getVisitationNotes());
    setNewNoteText('');
    setNoteSaveSuccess(true);
    setTimeout(() => setNoteSaveSuccess(false), 4000);
    onRefresh();
  };

  const handleDeleteNote = (noteId: string) => {
    if (!isResponsibleLeader) return;
    storageService.deleteVisitationNote(noteId);
    setVisitationNotes(storageService.getVisitationNotes());
    onRefresh();
  };

  // Direct Phone Call handler: tel:...
  const getTelLink = (phone: string) => {
    const cleanDigits = phone.replace(/\D/g, '');
    return `tel:${cleanDigits.startsWith('+') ? cleanDigits : '+' + cleanDigits}`;
  };

  // WhatsApp chat link
  const getWhatsAppLink = (whatsapp: string, memberName: string) => {
    const clean = whatsapp.replace(/\D/g, '');
    const greetingMsg = encodeURIComponent(`سلام ونعمة يا ${memberName.split(' ')[0]}، بفتقدك من اجتماع الثلاثة فتية للشباب السوداني.`);
    return `https://wa.me/${clean}?text=${greetingMsg}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <HeartHandshake className="w-6 h-6 text-emerald-600" />
              <span>نظام الافتقاد والمتابعة الرعوية</span>
            </h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
              الخادم الحالي: {currentServantName} ({currentServantGender === 'male' ? 'خادم' : 'خادمة'})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            الاتصال والتواصل المباشر مع المخدومين وتحديد الافتقاد لمنع التكرار بين الخدام، بالإضافة للافتقاد الخاص الدوري.
          </p>
        </div>

        {/* If Owner or Manager: They have the master switch to set the community-wide visitation system AND navigation tabs */}
        {isOwnerOrManager ? (
          <div className="flex flex-col sm:flex-row items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs font-bold">
            <div className="flex items-center gap-1.5 text-slate-600 pl-2 sm:border-l border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>نظام الاجتماع:</span>
            </div>

            {/* مربع تصحيح: النظام العام */}
            <button
              type="button"
              onClick={() => handleSelectCommunityMode('general')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
                communityVisitationMode === 'general' 
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
              title="تفعيل النظام العام لجميع الخدام"
            >
              <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 ${
                communityVisitationMode === 'general' ? 'bg-white text-emerald-600 border-white' : 'border-slate-400 bg-slate-50'
              }`}>
                {communityVisitationMode === 'general' ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
              <Users className="w-3.5 h-3.5" />
              <span>النظام العام</span>
            </button>
            
            {/* مربع تصحيح: النظام الخاص */}
            <button
              type="button"
              onClick={() => handleSelectCommunityMode('special')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
                communityVisitationMode === 'special' 
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
              title="تفعيل الافتقاد الخاص لجميع الخدام"
            >
              <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 ${
                communityVisitationMode === 'special' ? 'bg-white text-emerald-600 border-white' : 'border-slate-400 bg-slate-50'
              }`}>
                {communityVisitationMode === 'special' ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
              <Shuffle className="w-3.5 h-3.5" />
              <span>الافتقاد الخاص</span>
            </button>

            {/* Notes Log */}
            <button
              type="button"
              onClick={() => setActiveTab('notes_log')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
                activeTab === 'notes_log' ? 'bg-purple-900 text-amber-300 border-purple-900 shadow-xs font-black' : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>الملاحظات 🔒 ({visitationNotes.length})</span>
            </button>
          </div>
        ) : (
          /* For Servants & Non-Owner/Manager: Strictly NO switcher tabs! Show ONLY the active system badge */
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/90 px-4 py-2.5 rounded-2xl shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              {communityVisitationMode === 'general' ? <Users className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-emerald-800 font-bold">نظام الافتقاد المعتمد:</span>
                <span className="text-xs font-black text-slate-900 bg-white px-2 py-0.5 rounded-md border border-emerald-300">
                  {communityVisitationMode === 'general' ? 'النظام العام' : 'الافتقاد الخاص (تكليف محدد بفترة)'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                معتمد حالياً بواسطة إدارة المجتمع (مسؤول ومدير المجتمع)
              </p>
            </div>

            {isResponsibleLeader && (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'notes_log' ? communityVisitationMode : 'notes_log')}
                className={`mr-2 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border text-xs font-bold ${
                  activeTab === 'notes_log' ? 'bg-purple-900 text-amber-300 border-purple-900 shadow-xs' : 'bg-purple-100 text-purple-900 border-purple-200 hover:bg-purple-200'
                }`}
                title="متابعة ملاحظات المخدومين"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>متابعة الملاحظات 🔒</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          TAB 1: الافتقاد العام (General Visitation)
          - Male servants see male youths, Female servants see female youths
          - Real-time checkmark: "خلاص تم افتقاده و يفتقدوا واحد غيره"
          - Direct Call and direct WhatsApp buttons
          ======================================================== */}
      {effectiveTab === 'general' && (
        <div className="space-y-4">
          
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            {!isGenderRestrictedUser && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-bold">عرض المخدومين:</span>

                <button
                  type="button"
                  onClick={() => setGenderFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                    genderFilter === 'all' 
                      ? 'bg-slate-900 text-white border-slate-900' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  الكل (ذكور وإناث)
                </button>

                <button
                  type="button"
                  onClick={() => setGenderFilter('servant_matched')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                    genderFilter === 'servant_matched' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  المطابق لرتبتك ({currentServantGender === 'male' ? 'ذكور فقط 👦' : 'إناث فقط 👧'})
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {/* زرار تم افتقادهم في النظام العام */}
              <button
                type="button"
                onClick={() => {
                  setVisitedModalMode('general');
                  setVisitedModalSearchQuery('');
                  setShowVisitedYouthModal(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="عرض المخدومين الذين تم افتقادهم في نظام الافتقاد العام"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>تم افتقادهم ({generalVisitedYouths.length})</span>
              </button>

              {/* Visited / Unvisited filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setVisitedFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${visitedFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                >
                  الكل ({generalList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVisitedFilter('unvisited')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${visitedFilter === 'unvisited' ? 'bg-amber-500 text-slate-950 shadow-2xs' : 'text-slate-500'}`}
                >
                  بانتظار الافتقاد
                </button>
                <button
                  type="button"
                  onClick={() => setVisitedFilter('visited')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${visitedFilter === 'visited' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500'}`}
                >
                  تم افتقادهم ✓
                </button>
              </div>

              {/* Search */}
              <div className="relative w-48">
                <input
                  type="text"
                  placeholder="بحث بالاسم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 py-1.5 pr-7 pl-2 focus:outline-hidden focus:border-emerald-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2" />
              </div>
            </div>
          </div>

          {/* Youths List for General Visitation */}
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {generalList.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold">لا يوجد مخدومين مطابقين لمعايير الفلترة</p>
                </div>
              ) : (
                generalList.map((youth) => {
                  const opt = optimisticGeneralVisited[youth.id];
                  const isVisited = opt !== undefined ? opt.isVisited : Boolean(youth.isVisitedGeneral);
                  const visitedBy = opt !== undefined ? opt.visitedBy : (youth.lastVisitedBy || 'أحد الخدام');
                  const visitedAt = opt !== undefined ? opt.visitedAt : youth.lastVisitedAt;

                  return (
                    <div 
                      key={youth.id} 
                      className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
                        isVisited ? 'bg-emerald-50/20' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Member Info with Checkbox BEFORE the name */}
                      <div className="flex items-center gap-3.5">
                        {/* مربع تصحيح الافتقاد (قبل اسم المخدوم مباشرة) */}
                        <button
                          type="button"
                          onClick={() => handleToggleGeneralVisit(youth.id)}
                          className={`w-7 h-7 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer ${
                            isVisited 
                              ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/30' 
                              : 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-slate-400'
                          }`}
                          title={isVisited ? 'تم الافتقاد ✓ (اضغط للإلغاء)' : 'اضغط لوضع علامة صح (تم افتقاده)'}
                        >
                          {isVisited ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-slate-400" />}
                        </button>

                        <div className="w-11 h-13 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                          {youth.photoUrl && youth.photoUrl.trim() !== '' ? (
                            <img src={youth.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-slate-400">{(youth.fullName || '?').charAt(0)}</span>
                          )}
                        </div>

                        {/* Details */}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {isVisited ? (
                              <del 
                                className="text-sm font-black text-slate-400 select-none block"
                                style={{ 
                                  textDecoration: 'line-through', 
                                  textDecorationColor: '#059669', 
                                  textDecorationThickness: '3px',
                                  color: '#94a3b8'
                                }}
                              >
                                {youth.fullName}
                              </del>
                            ) : (
                              <h4 className="text-sm font-black text-slate-900 select-none">
                                {youth.fullName}
                              </h4>
                            )}
                            {isVisited && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                                تم الافتقاد ✓
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.2 rounded-full font-bold">
                              {youth.gender === 'male' ? 'ولد 👦' : 'بنت 👧'}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.2 rounded-md">
                              {youth.uniqueCode}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono text-slate-700" dir="ltr">{youth.phone}</span>
                            <span>•</span>
                            <span>الميلاد: {youth.dob}</span>
                          </div>

                          {/* Visitation Status Label for other servants & all roles */}
                          {isVisited ? (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-950 font-bold bg-emerald-100/90 border border-emerald-300 px-2.5 py-1 rounded-xl inline-flex flex-wrap shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>تم الافتقاد بواسطة الخادم: <span className="underline decoration-emerald-500 font-black">{visitedBy}</span></span>
                              {visitedAt && (
                                <span className="text-[10px] text-emerald-800 font-mono">({formatVisitDate(visitedAt)})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-bold block mt-0.5">
                              ⏳ بانتظار افتقاده من خادم
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contact Action Buttons (Direct Call, WhatsApp & Pastoral Notes) */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-wrap">
                        {/* Direct Phone Call Button */}
                        <a
                          href={getTelLink(youth.phone)}
                          className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
                          title="اتصال هاتفي مباشر"
                        >
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                          <span>اتصال</span>
                        </a>

                        {/* Direct WhatsApp Chat Button */}
                        <a
                          href={getWhatsAppLink(youth.whatsapp, youth.fullName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
                          title="محادثة واتساب مباشرة"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>محادثة واتساب</span>
                        </a>

                        {/* Pastoral Notes Button (ملاحظات الحالة الرعوية) */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMemberForNotes(youth);
                            setNewNoteText('');
                            setNoteSaveSuccess(false);
                          }}
                          className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="تدوين ملاحظات يدوية عن حالة المخدوم"
                        >
                          <FileText className="w-3.5 h-3.5 text-purple-600" />
                          <span>ملاحظات الحالة</span>
                          {visitationNotes.filter(n => n.memberId === youth.id).length > 0 && (
                            <span className="bg-purple-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                              {visitationNotes.filter(n => n.memberId === youth.id).length}
                            </span>
                          )}
                        </button>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: الافتقاد الخاص (Special Randomized Assignment)
          - Community Owner and system pick Servant
          - System randomly picks youths
          - Set custom period (e.g. 14 days)
          - Rotate youths and period when finished
          ======================================================== */}
      {effectiveTab === 'special' && (
        <div className="space-y-6">
          
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>نظام الافتقاد الخاص العشوائي المحدد بفترة زمنية</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isOwnerOrManager 
                  ? 'بصفتك مسؤول/مدير المجتمع، يمكنك تكليف خادم بمجموعة مخدومين عشوائياً لفترة محددة وتدويرهم.'
                  : 'قائمة المخدومين المخصصين لك عشوائياً بواسطة النظام وإدارة المجتمع لمتابعتهم خلال الفترة المحددة.'}
              </p>
            </div>

            {isOwnerOrManager ? (
              <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowNewAssignmentModal(true)}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء تكليف افتقاد خاص جديد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVisitedModalMode('special');
                    setVisitedModalSearchQuery('');
                    setShowVisitedYouthModal(true);
                  }}
                  className="px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  title="عرض المخدومين الذين تم افتقادهم في نظام الافتقاد الخاص"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>تم افتقادهم ({specialVisitedYouths.length})</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                <span className="text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>الخادم: {currentServantName}</span>
                </span>
              </div>
            )}
          </div>

          {/* List of Special Assignments */}
          {(() => {
            const visibleSpecialAssignments = specialAssignments.filter((assignment) => {
              if (isOwnerOrManager) return true;

              // 1. Direct ID match
              if (currentServantId && assignment.servantId === currentServantId) return true;

              // 2. Exact, trimmed, or substring name match
              if (assignment.servantName && currentServantName) {
                const aName = assignment.servantName.trim();
                const sName = currentServantName.trim();
                if (aName === sName || aName.includes(sName) || sName.includes(aName)) return true;
              }

              // 3. Registered member lookup match (matching phone, uniqueCode, or name)
              const matchedServantReg = registrants.find(r => 
                (currentServantId && r.id === currentServantId) ||
                (r.fullName && r.fullName.trim() === currentServantName.trim()) ||
                (normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(currentServantName))
              );
              if (matchedServantReg && assignment.servantId === matchedServantReg.id) return true;
              if (matchedServantReg && assignment.servantName && normalizeArabicNameForComparison(assignment.servantName) === normalizeArabicNameForComparison(matchedServantReg.fullName)) return true;

              // 4. Normalized Arabic name matching (ignores prefixes and normalizes hamzas)
              const cleanServant = currentServantName.replace(/^(أ\.|أستاذ|أ\/|أبونا)\s*/, '');
              const cleanAssigned = (assignment.servantName || '').replace(/^(أ\.|أستاذ|أ\/|أبونا)\s*/, '');
              const normServant = normalizeArabicNameForComparison(cleanServant);
              const normAssigned = normalizeArabicNameForComparison(cleanAssigned);
              if (normServant && normAssigned) {
                if (normServant === normAssigned || isThreePartNameMatch(cleanServant, cleanAssigned)) {
                  return true;
                }
                const servantParts = normServant.split(/\s+/).filter(Boolean);
                const assignedParts = normAssigned.split(/\s+/).filter(Boolean);
                if (servantParts.length >= 2 && assignedParts.length >= 2) {
                  if (servantParts[0] === assignedParts[0] && servantParts[1] === assignedParts[1]) {
                    return true;
                  }
                }
              }

              return false;
            });

            if (visibleSpecialAssignments.length === 0) {
              if (isOwnerOrManager) {
                return (
                  <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200">
                    <Shuffle className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                    <p className="text-sm font-bold text-slate-700">لا توجد تكليفات افتقاد خاص حالية</p>
                    <p className="text-xs text-slate-400 mt-1">
                      اضغط على زر الإنشاء أعلاه لاختيار خادم وتوليد مخدومين عشوائياً مختلفين كل مرة.
                    </p>
                  </div>
                );
              }

              // FOR SERVANTS WITH NO ASSIGNMENT: Show strictly "(بانتظار توزيع الافتقاد)"
              return (
                <div className="bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-3xl p-12 text-center shadow-xs space-y-3">
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
                    <Clock className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-black text-amber-900 tracking-wide">
                    (بانتظار توزيع الافتقاد)
                  </h3>
                  <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
                    لم يتم تحديد تكليف افتقاد خاص لك بعد من قبل مسؤول المجتمع أو مدير المجتمع. بمجرد قيام الإدارة بإنشاء التكليف ستظهر لك هنا أسماء المخدومين المخصصين لك وفترة الافتقاد.
                  </p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {visibleSpecialAssignments.map((assignment) => {
                  const assignedYouths = registrants.filter(r => 
                    assignment.assignedMemberIds.includes(r.id) &&
                    r.role === 'member' &&
                    !NON_MEMBER_ROLES.has(r.role) &&
                    r.status !== 'cancelled'
                  );
                  const now = Date.now();
                  const end = new Date(assignment.endDate).getTime();
                  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
                  const isExpired = diffDays <= 0;
                  const completedIds = assignment.completedMemberIds || [];
                  const completedCount = assignedYouths.filter(y => completedIds.includes(y.id)).length;
                  const progressPercent = assignedYouths.length > 0 ? Math.round((completedCount / assignedYouths.length) * 100) : 0;

                  return (
                    <div 
                      key={assignment.id}
                      className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between transition-all ${
                        isExpired ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200/80 hover:shadow-md'
                      }`}
                    >
                      <div>
                        {/* Assignment Top Header */}
                        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
                                الخادم المكلف: {assignment.servantName}
                              </span>
                              {isExpired ? (
                                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                                  انتهت الفترة (يرجى التدوير)
                                </span>
                              ) : (
                                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>متبقي {diffDays} يوم في الفترة</span>
                                </span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                completedCount === assignedYouths.length && assignedYouths.length > 0
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                اكتمل {completedCount} من {assignedYouths.length} ({progressPercent}%)
                              </span>
                            </div>

                            <span className="text-xs text-slate-700 font-bold mt-1.5 block">
                              مكلف بافتقادهم لمدة {assignment.periodDays} يوم (حتى {new Date(assignment.endDate).toLocaleDateString('ar-EG')})
                            </span>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Action buttons (only for owner/manager) */}
                          {isOwnerOrManager && (
                            <div className="flex items-center gap-1.5 shrink-0 mr-2">
                              <button
                                type="button"
                                onClick={() => handleRotateAssignment(assignment.id)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1 transition border border-emerald-200 cursor-pointer"
                                title="تدوير واختيار مخدومين جدد مختلفين عشوائياً وتجديد الفترة"
                              >
                                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">تدوير عشوائي</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteAssignment(assignment.id)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                title="حذف هذا التكليف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Assigned Youths in this batch */}
                        <div className="mt-3.5 space-y-2.5">
                          <span className="text-xs font-bold text-slate-700 block">
                            المخدومون المخصصون لهذا الخادم في هذه الفترة ({assignedYouths.length} شباب):
                          </span>

                          <div className="divide-y divide-slate-100 bg-slate-50 rounded-2xl p-2 border border-slate-200/60 space-y-1">
                            {assignedYouths.map((youth) => {
                              const isCompleted = completedIds.includes(youth.id);

                              return (
                                <div 
                                  key={youth.id} 
                                  className={`py-2.5 px-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition ${
                                    isCompleted ? 'bg-emerald-50/70 border border-emerald-200' : 'bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  {/* Youth Info & Photo */}
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center border border-slate-200">
                                      {youth.photoUrl && youth.photoUrl.trim() !== '' ? (
                                        <img src={youth.photoUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[10px] font-bold text-slate-400">{(youth.fullName || '?').charAt(0)}</span>
                                      )}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        {isCompleted ? (
                                          <del 
                                            className="font-black text-slate-400 select-none"
                                            style={{ 
                                              textDecoration: 'line-through', 
                                              textDecorationColor: '#059669', 
                                              textDecorationThickness: '3px',
                                              color: '#94a3b8'
                                            }}
                                          >
                                            {youth.fullName}
                                          </del>
                                        ) : (
                                          <span className="font-black text-slate-900">
                                            {youth.fullName}
                                          </span>
                                        )}
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 font-mono">
                                          {youth.uniqueCode}
                                        </span>
                                        {isCompleted && (
                                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                                            تم الافتقاد ✓
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-mono text-[10px] text-slate-500 block" dir="ltr">{youth.phone}</span>
                                      {isCompleted && (
                                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-950 font-bold bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>تم الافتقاد بواسطة الخادم: <span className="underline decoration-emerald-500 font-black">{assignment.servantName}</span></span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Action Buttons (Check-off box, WhatsApp, Call, Notes) */}
                                  <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
                                    {/* مربع التصحيح: إذا افتقده يعمل صح */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSpecialVisit(assignment.id, youth.id)}
                                      className={`px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 cursor-pointer text-xs font-bold ${
                                        isCompleted
                                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                                      }`}
                                      title={isCompleted ? 'تم الافتقاد ✓ (اضغط للإلغاء)' : 'اضغط لوضع علامة صح (تم افتقاده)'}
                                    >
                                      {isCompleted ? (
                                        <>
                                          <CheckSquare className="w-4 h-4 text-white shrink-0" />
                                          <span>تم الافتقاد ✓</span>
                                        </>
                                      ) : (
                                        <>
                                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                          <span>مربع التصحيح</span>
                                        </>
                                      )}
                                    </button>

                                    {/* زر الاتصال الهاتفي */}
                                    <a
                                      href={getTelLink(youth.phone)}
                                      className="p-1.5 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 transition flex items-center gap-1 font-bold text-xs"
                                      title="اتصال هاتفي مباشر"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      <span className="hidden md:inline">اتصال</span>
                                    </a>

                                    {/* زر الواتساب */}
                                    <a
                                      href={getWhatsAppLink(youth.whatsapp, youth.fullName)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1 font-bold text-xs"
                                      title="محادثة واتساب مباشرة"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      <span className="hidden md:inline">واتساب</span>
                                    </a>

                                    {/* زر إرسال ملاحظات الحالة الرعوية */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedMemberForNotes(youth);
                                        setNewNoteText('');
                                        setNoteSaveSuccess(false);
                                      }}
                                      className="p-1.5 rounded-xl bg-purple-100 text-purple-700 hover:bg-purple-200 transition cursor-pointer flex items-center gap-1 font-bold text-xs"
                                      title="إرسال ملاحظات رعوية (تصل للمسؤولين الكبار فقط 🔒)"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-purple-700" />
                                      <span className="hidden md:inline">ملاحظات 🔒</span>
                                      {visitationNotes.filter(n => n.memberId === youth.id).length > 0 && (
                                        <span className="bg-purple-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                                          {visitationNotes.filter(n => n.memberId === youth.id).length}
                                        </span>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>يتم اختيار مخدومين مختلفين عشوائياً في كل تدوير بدون تكرار نفس الأسماء.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </div>
      )}

      {/* ========================================================
          TAB 3: سجل متابعة ملاحظات المخدومين (خاص بالمسؤولين فقط 🔒)
          Requirement: "وبعد ما تنزل تتحفظ وتظهر للمتابعة للخدام الموؤلين فقط (امين الاجتماع - community manager and owner)"
          ======================================================== */}
      {effectiveTab === 'notes_log' && isResponsibleLeader && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header & Search */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
                  📋
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>سجل متابعة ملاحظات الحالة الرعوية</span>
                    <span className="text-xs bg-purple-100 text-purple-900 font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                      خاص بالمسؤولين فقط 🔒
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    كشف ومتابعة الملاحظات المدونة يدوياً من كافة خدام الاجتماع عن ظروف وحالة كل مخدوم.
                  </p>
                </div>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="بحث باسم المخدوم أو الخادم..."
                value={notesSearchQuery}
                onChange={(e) => setNotesSearchQuery(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-purple-600"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            </div>
          </div>

          {/* Notes Feed */}
          {visitationNotes.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30 text-purple-600" />
              <p className="text-sm font-bold text-slate-700">لا توجد ملاحظات رعوية مدونة حتى الآن</p>
              <p className="text-xs text-slate-400 mt-1">
                يمكن لأي خادم النقر على زر "ملاحظات الحالة" بجانب المخدوم في كشف الافتقاد لتدوين ملاحظة.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visitationNotes
                .filter(note => {
                  if (!notesSearchQuery.trim()) return true;
                  const q = notesSearchQuery.toLowerCase().trim();
                  return note.memberName.toLowerCase().includes(q) || 
                         note.authorName.toLowerCase().includes(q) || 
                         note.notes.toLowerCase().includes(q);
                })
                .map((note) => {
                  const targetMember = registrants.find(r => r.id === note.memberId);

                  return (
                    <div 
                      key={note.id}
                      className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-100 shadow-2xs hover:shadow-sm transition space-y-3 text-right"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        {/* Member & Author info */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-11 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                            {targetMember?.photoUrl && targetMember.photoUrl.trim() !== '' ? (
                              <img src={targetMember.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                                👤
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-black text-slate-900">
                                {note.memberName}
                              </span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                                كود: {targetMember?.uniqueCode || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span>الخادم المدوّن: <strong>{note.authorName}</strong></span>
                              <span>•</span>
                              <span className="font-mono text-slate-400">
                                {new Date(note.createdAt).toLocaleDateString('ar-EG', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          {targetMember && (
                            <a
                              href={getTelLink(targetMember.phone)}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] flex items-center gap-1"
                              title="اتصال هاتفي"
                            >
                              <Phone className="w-3 h-3 text-blue-600" />
                              <span>اتصال</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="حذف الملاحظة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Note Content */}
                      <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-semibold whitespace-pre-wrap">
                          {note.notes}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MEMBER PASTORAL NOTES MODAL (تدوين ومتابعة حالة المخدوم)
          - Any servant can type & save manual notes
          - Only responsible leaders (meeting secretary, owner, manager, priest) can read & follow up
          ======================================================== */}
      {selectedMemberForNotes && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 my-auto space-y-4 max-h-[92vh] overflow-y-auto text-right">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-13 rounded-2xl overflow-hidden bg-slate-100 border-2 border-purple-200 shrink-0 shadow-xs flex items-center justify-center">
                  {selectedMemberForNotes.photoUrl && selectedMemberForNotes.photoUrl.trim() !== '' ? (
                    <img src={selectedMemberForNotes.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-slate-400">{(selectedMemberForNotes.fullName || '?').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    ملاحظات حالة: {selectedMemberForNotes.fullName}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="font-mono text-slate-600" dir="ltr">{selectedMemberForNotes.phone}</span>
                    <span>•</span>
                    <span className="font-bold">{selectedMemberForNotes.gender === 'male' ? 'شاب 👦' : 'شابة 👧'}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMemberForNotes(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section 1: Add New Note (Open to ANY servant) */}
            <form onSubmit={handleSaveNote} className="space-y-3 bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-purple-950 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-purple-700" />
                  <span>تدوين ملاحظة جديدة عن حالة المخدوم (يدوياً):</span>
                </label>
                <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                  الخادم: {currentServantName}
                </span>
              </div>

              <textarea
                required
                rows={3}
                placeholder="اكتب هنا تفاصيل حالة المخدوم (مثال: كلمته بالهاتف وظروفه ممتازة، مسافر الأسبوع القادم، طلب الصلاة من أجل الامتحانات، سبب غيابه...)"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="w-full rounded-xl border border-purple-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
              />

              {noteSaveSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>تم حفظ الملاحظة بنجاح، ومتاحة لمتابعة أمين الاجتماع والمسؤولين.</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newNoteText.trim()}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ الملاحظة الرعوية</span>
                </button>
              </div>
            </form>

            {/* Section 2: Previous Notes Log */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span>سجل المتابعة للحالة</span>
                  <span className="font-mono text-purple-700 font-bold">
                    ({visitationNotes.filter(n => n.memberId === selectedMemberForNotes.id).length})
                  </span>
                </h4>

                {!isResponsibleLeader && (
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    للمسؤولين فقط
                  </span>
                )}
              </div>

              {isResponsibleLeader ? (
                // Responsible Leaders can view all notes
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {visitationNotes.filter(n => n.memberId === selectedMemberForNotes.id).length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      لا توجد ملاحظات سابقة مسجلة لهذا المخدوم بعد.
                    </p>
                  ) : (
                    visitationNotes
                      .filter(n => n.memberId === selectedMemberForNotes.id)
                      .map((note) => (
                        <div key={note.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-bold text-slate-800">
                              الخادم: {note.authorName} ({note.authorRole === 'priest' ? 'أبونا' : note.authorRole === 'community_owner' ? 'مسؤول المجتمع' : note.authorRole === 'meeting_secretary' ? 'أمين اجتماع' : 'خادم'})
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-400">
                                {new Date(note.createdAt).toLocaleDateString('ar-EG', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-slate-400 hover:text-red-600 transition"
                                title="حذف"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                            {note.notes}
                          </p>
                        </div>
                      ))
                  )}
                </div>
              ) : (
                // Regular Servants see confidentially protected message
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>ملاحظات المتابعة المحفوظة مخصصة للمسؤولين فقط</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    تظهر تفاصيل الملاحظات السابقة لأمين الاجتماع ومدير ومسؤول المجتمع فقط لضمان السرية والخصوصية الرعوية للمخدوم. أي ملاحظة تكتبها الآن يتم حفظها وتصل للمسؤولين مباشرة.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMemberForNotes(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}
      {showNewAssignmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Shuffle className="w-5 h-5 text-emerald-600" />
                <span>إنشاء تكليف افتقاد خاص</span>
              </h3>
              <button onClick={() => setShowNewAssignmentModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Select Servant */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اختر الخادم المسؤول عن الافتقاد:
                </label>
                <select
                  value={selectedServantId}
                  onChange={(e) => setSelectedServantId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="">-- اضغط لاختيار خادم --</option>
                  {servantsList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.role === 'priest' ? ((s.fullName || '').startsWith('أبونا') ? s.fullName : `أبونا ${s.fullName}`) : s.fullName} ({s.role === 'priest' ? 'كاهن الاجتماع ✝️' : s.role === 'community_owner' ? 'مسؤول المجتمع' : s.role === 'meeting_secretary' ? 'أمين اجتماع' : s.role === 'service_secretary' ? 'أمين خدمة' : 'خادم'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Number of youths */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  عدد المخدومين العشوائيين المراد اختيارهم:
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={assignmentMemberCount}
                  onChange={(e) => setAssignmentMemberCount(parseInt(e.target.value, 10) || 3)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  السيستم سيختارهم عشوائياً من بين كافة المخدومين النشطين.
                </p>
              </div>

              {/* Duration Days */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مدة فترة الافتقاد (بالأيام):
                </label>
                <div className="flex gap-2">
                  {[7, 14, 21, 30].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setAssignmentPeriodDays(days)}
                      className={`flex-1 py-1.5 rounded-xl font-bold border transition ${
                        assignmentPeriodDays === days 
                          ? 'bg-emerald-600 text-white border-emerald-600' 
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {days} يوم
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewAssignmentModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={!selectedServantId}
                onClick={handleCreateSpecialAssignment}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                توليد التكليف بالسيستم
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          VISITED YOUTHS MODAL ("تم افتقادهم" - منفصل للعام وللخاص)
          ======================================================== */}
      {showVisitedYouthModal && (() => {
        const activeModalList = visitedModalMode === 'special' ? specialVisitedYouths : generalVisitedYouths;
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn select-none" dir="rtl">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 my-auto space-y-4 max-h-[90vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {visitedModalMode === 'special'
                        ? `تم افتقادهم في نظام الافتقاد الخاص (${activeModalList.length})`
                        : `تم افتقادهم في نظام الافتقاد العام (${activeModalList.length})`}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {visitedModalMode === 'special'
                        ? 'قائمة المخدومين الذين تم افتقادهم في النظام الخاص فقط (يتم استبعادهم تلقائياً عند إنشاء تكليف خاص جديد)'
                        : 'قائمة المخدومين الذين تمت زيارتهم في نظام الافتقاد العام فقط (بالترتيب الأبجدي)'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowVisitedYouthModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search within Visited Youths */}
              <div className="relative shrink-0">
                <input
                  type="text"
                  placeholder="بحث في المفتقدين بالاسم، الكود، أو الخادم..."
                  value={visitedModalSearchQuery}
                  onChange={(e) => setVisitedModalSearchQuery(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
              </div>

              {/* List */}
              <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
                {(() => {
                  const q = visitedModalSearchQuery.toLowerCase().trim();
                  const filteredVisited = activeModalList.filter(y => {
                    if (!q) return true;
                    return (
                      (y.fullName || '').toLowerCase().includes(q) ||
                      (y.phone || '').includes(q) ||
                      (y.uniqueCode || '').toLowerCase().includes(q) ||
                      (y.visitedBy || '').toLowerCase().includes(q)
                    );
                  });

                  if (filteredVisited.length === 0) {
                    return (
                      <div className="p-10 text-center text-slate-400 space-y-2">
                        <Users className="w-10 h-10 mx-auto text-slate-300" />
                        <p className="text-xs font-bold">
                          {visitedModalMode === 'special'
                            ? 'لا يوجد مخدومين تم افتقادهم في نظام الافتقاد الخاص حتى الآن'
                            : 'لا يوجد مخدومين تم افتقادهم في نظام الافتقاد العام حالياً'}
                        </p>
                      </div>
                    );
                  }

                  return filteredVisited.map(youth => (
                    <div 
                      key={youth.id}
                      className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:bg-emerald-50/30 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleVisitedFromModal(youth.id)}
                          className="w-7 h-7 rounded-xl bg-emerald-600 hover:bg-red-600 text-white flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs"
                          title="اضغط لإلغاء علامة الافتقاد وإعادته لقائمة غير المفتقدين"
                        >
                          <CheckSquare className="w-4 h-4 text-white" />
                        </button>

                        <div className="w-11 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-300 flex items-center justify-center">
                          {youth.photoUrl && youth.photoUrl.trim() !== '' ? (
                            <img src={youth.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-slate-500">{(youth.fullName || '?').charAt(0)}</span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <del 
                              className="text-xs sm:text-sm font-black text-slate-500 select-none"
                              style={{ 
                                textDecoration: 'line-through', 
                                textDecorationColor: '#059669', 
                                textDecorationThickness: '2.5px'
                              }}
                            >
                              {youth.fullName}
                            </del>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                              {visitedModalMode === 'special' ? 'تم الافتقاد (خاص) ✓' : 'تم الافتقاد (عام) ✓'}
                            </span>
                            <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.2 rounded-md font-mono">
                              {youth.uniqueCode}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-950 font-bold bg-emerald-100/70 border border-emerald-200/80 px-2 py-0.5 rounded-lg inline-flex flex-wrap">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>بواسطة: <span className="underline decoration-emerald-500 font-black">{youth.visitedBy || 'أحد الخدام'}</span></span>
                            {youth.visitedAt && (
                              <span className="text-[10px] text-emerald-800 font-mono">({formatVisitDate(youth.visitedAt)})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Contact Actions */}
                      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 shrink-0">
                        <a
                          href={getTelLink(youth.phone)}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs transition flex items-center gap-1"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                          <span>اتصال</span>
                        </a>

                        <a
                          href={getWhatsAppLink(youth.whatsapp, youth.fullName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1 shadow-2xs"
                          title="محادثة واتساب"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>واتساب</span>
                        </a>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs text-slate-500 font-bold">
                  {visitedModalMode === 'special' ? 'إجمالي المفتقدين (النظام الخاص): ' : 'إجمالي المفتقدين (النظام العام): '}
                  <span className="font-mono text-emerald-700 font-black">{activeModalList.length}</span> عضو
                </span>
                <button
                  type="button"
                  onClick={() => setShowVisitedYouthModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
