import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Registrant, AttendanceRecord, Announcement } from '../types';
import { 
  storageService, 
  safeStorage,
  detectUserLocation, 
  validateContactNumber, 
  validateRealPersonalPhoto, 
  processPhotoWithWhiteBackground,
  findDuplicateFaceMember,
  formatPhoneNumber,
  validateArabicNameInput,
  validateArabicThreeWords,
  compressImageToFitStorage
} from '../services/storageService';
import { downloadIdCardAsImage } from '../services/cardImageGenerator';
import { IdCardItem } from './IdCardItem';
import { MemberAnnouncements } from './MemberAnnouncements';
import { NotificationShade } from './NotificationShade';
import { AnnouncementModal } from './AnnouncementModal';
import { KahootDashboard } from './views/KahootDashboard';
import {
  getAllEvents,
  getEnrichedEventRegistrations,
  evaluateEventRegistrationAvailability,
  isEventVisibleToMembers,
  EVENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../services/eventsService';
import { 
  User, 
  LogOut, 
  Gift, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Printer, 
  ExternalLink,
  Sparkles,
  Edit3,
  Phone,
  MessageSquare,
  MessageCircle,
  Upload,
  Loader2,
  AlertCircle,
  X,
  Save,
  ShieldCheck,
  Download,
  Bell,
  Gamepad2,
  MapPin,
  ChevronLeft,
  Users,
  Tent,
  Bus
} from 'lucide-react';

interface MemberPortalProps {
  member: Registrant;
  onLogout: () => void;
  onOpenServantDashboard?: () => void;
  onOpenEventRegistration?: (eventId: string) => void;
}

export const MemberPortal: React.FC<MemberPortalProps> = ({ 
  member: initialMember, 
  onLogout,
  onOpenServantDashboard,
  onOpenEventRegistration,
}) => {
  const [currentMember, setCurrentMember] = useState<Registrant>(initialMember);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [meetingLogo, setMeetingLogo] = useState<string | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const [activeCardFace, setActiveCardFace] = useState<'front' | 'back' | 'both'>('both');
  const [isNotificationShadeOpen, setIsNotificationShadeOpen] = useState(false);
  const [selectedShadeAnnouncement, setSelectedShadeAnnouncement] = useState<Announcement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingQuizId, setPendingQuizId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('quizId') || sessionStorage.getItem('three_youths_pending_quiz_id');
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<'profile' | 'kahoot'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('quizId') || sessionStorage.getItem('three_youths_pending_quiz_id')) {
        return 'kahoot';
      }
    } catch {}
    return 'profile';
  });
  const [hasActiveCompetition, setHasActiveCompetition] = useState<boolean>(() => storageService.hasActiveKahootCompetition());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const tickInterval = setInterval(() => {
      setNowTick(Date.now());
      setHasActiveCompetition(storageService.hasActiveKahootCompetition());
    }, 5000);
    return () => clearInterval(tickInterval);
  }, []);

  useEffect(() => {
    const updateUnread = () => {
      const allAnns = storageService.getAnnouncements();
      const activeAnnIds = new Set(allAnns.map(a => a.id));
      setSelectedShadeAnnouncement(prev => (prev && !activeAnnIds.has(prev.id) ? null : prev));

      const list = allAnns.filter(a =>
        storageService.isMemberTargetedByAnnouncement(a, currentMember, currentMember.role, currentMember.fullName, currentMember.id)
      );
      try {
        const saved = localStorage.getItem('three_youths_read_announcements');
        const readSet = saved ? new Set(JSON.parse(saved)) : new Set();
        setUnreadCount(list.filter(a => !readSet.has(a.id)).length);
      } catch {
        setUnreadCount(list.length);
      }
    };
    updateUnread();

    const checkActiveComp = () => {
      const active = storageService.hasActiveKahootCompetition();
      setHasActiveCompetition(active);
      try {
        const qId = sessionStorage.getItem('three_youths_pending_quiz_id');
        if (qId) {
          setPendingQuizId(qId);
          setActiveTab('kahoot');
        }
      } catch {}
    };
    checkActiveComp();

    const unsub = storageService.subscribe(() => {
      updateUnread();
      checkActiveComp();

      // Check if logged-in member was cancelled or deleted by Community Owner
      const deletedIds = storageService.getDeletedRegistrantIds();
      if (deletedIds.has(currentMember.id)) {
        onLogout();
        return;
      }

      // Live update attendance records and member profile instantly without page refresh
      const freshAttendances = storageService.getAttendanceForRegistrant(currentMember.id);
      setAttendances(freshAttendances);

      const freshMember = storageService.getRegistrants().find(r => r.id === currentMember.id);
      if (freshMember) {
        if (freshMember.status === 'cancelled' || freshMember.status === 'blocked') {
          onLogout();
          return;
        }
        setCurrentMember(freshMember);
      }
    });

    // Fast 1.5s background polling to guarantee instantaneous cross-device sync on mobile phones
    const liveSyncInterval = setInterval(async () => {
      try {
        await storageService.fetchLatestServerData();
      } catch {}
    }, 1500);

    return () => {
      unsub();
      clearInterval(liveSyncInterval);
    };
  }, [currentMember.id, onLogout]);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState(initialMember.fullName || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [hasEnglishError, setHasEnglishError] = useState(false);
  const [editPhone, setEditPhone] = useState(initialMember.phone || '');
  const [editWhatsapp, setEditWhatsapp] = useState(initialMember.whatsapp || '');
  const [editAddress, setEditAddress] = useState(initialMember.address || '');
  const [editPhotoPreview, setEditPhotoPreview] = useState(initialMember.photoUrl || '');
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentMember(initialMember);
    setEditFullName(initialMember.fullName || '');
    setEditPhone(initialMember.phone || '');
    setEditWhatsapp(initialMember.whatsapp || '');
    setEditAddress(initialMember.address || '');
    setEditPhotoPreview(initialMember.photoUrl || '');
  }, [initialMember]);

  useEffect(() => {
    setMeetingLogo(storageService.getCustomLogo());
    setAttendances(storageService.getAttendanceForRegistrant(currentMember.id));

    QRCode.toDataURL(currentMember.uniqueCode, {
      width: 260,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).then(setQrCodeUrl).catch(console.error);
  }, [currentMember]);

  const attendCount = attendances.length;
  const isServantOrLeader = currentMember.role === 'servant' || currentMember.role === 'service_secretary' || currentMember.role === 'meeting_secretary' || currentMember.role === 'community_manager' || currentMember.role === 'community_owner';

  const handleDownloadCard = async () => {
    setIsDownloadingCard(true);
    await downloadIdCardAsImage(currentMember, activeCardFace, qrCodeUrl, meetingLogo);
    setIsDownloadingCard(false);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEditFullName(val);

    if (!val) {
      setNameError(null);
      setHasEnglishError(false);
      return;
    }

    const check = validateArabicNameInput(val);
    if (check.hasEnglish) {
      setHasEnglishError(true);
      setNameError('خطأ: يرجى كتابة الاسم باللغة العربية فقط! الحروف الإنجليزية غير مسموح بها.');
    } else if (!check.isValid && check.error) {
      setHasEnglishError(false);
      setNameError(check.error);
    } else {
      setHasEnglishError(false);
      setNameError(null);
    }
  };

  // Handle Photo Upload with Real-Photo Verification
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('يرجى اختيار ملف صورة صالح (JPEG أو PNG).');
      return;
    }

    setIsVerifyingPhoto(true);
    setPhotoError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        setIsVerifyingPhoto(false);
        return;
      }

      try {
        const compressed = await compressImageToFitStorage(rawDataUrl, 440, 0.75);
        const verification = await validateRealPersonalPhoto(compressed);
        if (!verification.isValid) {
          setIsVerifyingPhoto(false);
          setEditPhotoPreview(compressed);
          setPhotoError('تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع');
          return;
        }

        const dupCheck = await findDuplicateFaceMember(compressed, currentMember.id);
        if (dupCheck.isDuplicate && dupCheck.matchedMember) {
          setIsVerifyingPhoto(false);
          setPhotoError(`عذراً، ملامح هذا الوجه مسجلة بالفعل باسم مخدوم آخر: (${dupCheck.matchedMember.fullName} - كود: ${dupCheck.matchedMember.uniqueCode}).`);
          return;
        }

        setIsVerifyingPhoto(false);
        setEditPhotoPreview(compressed);
        setPhotoError(null);
      } catch {
        setIsVerifyingPhoto(false);
        setEditPhotoPreview(rawDataUrl);
        setPhotoError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccessMsg(null);

    const userLoc = detectUserLocation();

    // 0. Validate Arabic Full Name
    const nameVal = validateArabicThreeWords(editFullName);
    if (!nameVal.isValid) {
      setSaveError(nameVal.error || 'يرجى كتابة الاسم ثلاثياً باللغة العربية');
      return;
    }

    // 1. Validate Phone
    const phoneVal = validateContactNumber(editPhone, userLoc);
    if (!phoneVal.isValid) {
      setSaveError(phoneVal.error || 'رقم الهاتف غير صالح');
      return;
    }

    // 2. Validate WhatsApp
    const whatsappVal = validateContactNumber(editWhatsapp, userLoc);
    if (!whatsappVal.isValid) {
      setSaveError(whatsappVal.error || 'رقم الواتساب غير صالح');
      return;
    }

    // 3. Validate Photo
    if (!editPhotoPreview) {
      setSaveError('يرجى رفع صورة شخصية حقيقية.');
      return;
    }

    setIsSaving(true);

    try {
      const updatedFields: string[] = [];
      if (editFullName.trim() !== currentMember.fullName) updatedFields.push('الاسم بالكامل');
      if (editPhone !== currentMember.phone) updatedFields.push('رقم الهاتف');
      if (editWhatsapp !== currentMember.whatsapp) updatedFields.push('رقم الواتساب');
      if (editAddress.trim() !== (currentMember.address || '')) updatedFields.push('العنوان ومكان السكن');
      if (editPhotoPreview !== currentMember.photoUrl) updatedFields.push('الصورة الشخصية');

      const updatedRegistrant: Registrant = {
        ...currentMember,
        fullName: editFullName.trim(),
        phone: phoneVal.formatted.trim(),
        whatsapp: whatsappVal.formatted.trim(),
        address: editAddress.trim(),
        photoUrl: editPhotoPreview,
        lastUpdatedAt: new Date().toISOString(),
        updatedFields: updatedFields.length > 0 ? updatedFields : ['البيانات الشخصية'],
        ...({ oldPhone: currentMember.phone })
      };

      // 1. Immediately reflect updates on the client UI (0ms latency)
      setCurrentMember(updatedRegistrant);
      sessionStorage.setItem('three_youths_member_session_v2', JSON.stringify(updatedRegistrant));
      try {
        localStorage.setItem('three_youths_last_login', JSON.stringify(updatedRegistrant));
      } catch {}

      // If member has admin session, sync name
      const adminSessStr = sessionStorage.getItem('three_youths_admin_session_v2');
      if (adminSessStr) {
        try {
          const adm = JSON.parse(adminSessStr);
          adm.name = updatedRegistrant.fullName;
          sessionStorage.setItem('three_youths_admin_session_v2', JSON.stringify(adm));
        } catch (e) {
          console.error(e);
        }
      }

      // 2. High-speed instantaneous update (0ms UI latency, background cloud sync)
      await storageService.updateRegistrant(updatedRegistrant, currentMember.role);

      // 3. Instantly notify servants through the notification shade & bell counter
      if (updatedFields.length > 0) {
        try {
          storageService.createAnnouncement({
            title: `🔄 تحديث بيانات مخدوم: ${updatedRegistrant.fullName}`,
            content: `قام المخدوم ${updatedRegistrant.fullName} (كود: ${updatedRegistrant.uniqueCode}) بتحديث (${updatedFields.join('، ')}). التحديث ظاهر الآن لمسؤول المجتمع في الداشبورد.`,
            templateType: 'custom',
            senderRole: 'community_owner',
            senderName: 'إدارة مجتمع الثلاثة فتية',
            targetAudience: 'community_owner_only',
            pinned: false
          });
        } catch {}
      }

      setIsSaving(false);
      setSaveSuccessMsg('تم حفظ ونشر تحديثات بياناتك بنجاح في السحابة والداشبورد للخدام! ✔️');
      setTimeout(() => {
        setIsEditModalOpen(false);
        setSaveSuccessMsg(null);
      }, 700);

    } catch (err) {
      setIsSaving(false);
      setSaveError('حدث خطأ أثناء حفظ التحديث، يرجى المحاولة مرة أخرى.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 pb-12">
      {/* Leader / Servant Preview Banner to Return to Dashboard */}
      {isServantOrLeader && onOpenServantDashboard && (
        <div className="no-print bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 border-b border-amber-400/50 text-white px-4 py-2.5 shadow-md">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                وضع المعاينة 👁️
              </span>
              <span className="text-slate-200">
                أنت تشاهد الآن <strong>صفحة المخدومين</strong> بنفس الشكل المعروض للأعضاء لمتابعة التغييرات والأحداث والإعلانات
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenServantDashboard}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>العودة للوحة تحكم المسؤولين والخدام</span>
              <span>🛡️</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Top Navbar */}
      <header className="no-print bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center font-bold text-emerald-800 text-sm overflow-hidden">
              {currentMember.photoUrl && currentMember.photoUrl.trim() !== '' ? (
                <img src={currentMember.photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                currentMember.fullName.split(' ')[0][0]
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-slate-900 leading-tight">
                  أهلاً بك، {currentMember.role === 'priest' ? ((currentMember.fullName || '').startsWith('أبونا') ? currentMember.fullName : `أبونا ${currentMember.fullName}`) : currentMember.fullName}
                </h2>
                {isServantOrLeader && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                    {currentMember.role === 'priest' ? '✝️ أبونا' : currentMember.role === 'community_owner' ? '👑 Community Owner' : currentMember.role === 'community_manager' ? '⚡ Community Manager' : currentMember.role === 'meeting_secretary' ? 'أمين اجتماع' : currentMember.role === 'service_secretary' ? 'أمين خدمة' : 'خادم'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold">
                عضوية كود: {currentMember.uniqueCode}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Shade Trigger Button */}
            <button
              type="button"
              onClick={() => setIsNotificationShadeOpen(true)}
              className="relative p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="لوحة وستارة الإشعارات والتنبيهات 🔔"
            >
              <Bell className="w-4 h-4 text-emerald-700" />
              <span className="hidden sm:inline text-xs font-bold">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Update Profile Button */}
            <button
              onClick={() => {
                setEditFullName(currentMember.fullName || '');
                setEditPhone(currentMember.phone || '');
                setEditWhatsapp(currentMember.whatsapp || '');
                setEditAddress(currentMember.address || '');
                setEditPhotoPreview(currentMember.photoUrl || '');
                setNameError(null);
                setHasEnglishError(false);
                setSaveError(null);
                setSaveSuccessMsg(null);
                setIsEditModalOpen(true);
              }}
              className="text-xs text-slate-700 hover:text-emerald-800 font-bold bg-slate-50 hover:bg-emerald-50 px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
              <span>تحديث بياناتي</span>
            </button>

            {isServantOrLeader && onOpenServantDashboard && (
              <button
                onClick={onOpenServantDashboard}
                className="text-xs text-white font-bold bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <span>لوحة الخدام</span>
                <span>🛡️</span>
              </button>
            )}

            <button
              onClick={onLogout}
              className="text-xs text-red-600 hover:text-red-700 font-bold bg-red-50 hover:bg-red-100/80 px-3 py-1.5 rounded-xl border border-red-200 transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Navigation Tabs (البطاقة وسجل الحضور vs مسابقات كاهوت) */}
        <div className="no-print bg-white p-1.5 rounded-2xl border border-purple-200/90 shadow-xs flex items-center justify-between gap-2 animate-fadeIn">
          <div className="grid grid-cols-2 w-full p-1 bg-slate-100 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🪪 بطاقتي والبيانات</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('kahoot')}
              className={`py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'kahoot'
                  ? hasActiveCompetition
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                    : 'bg-purple-900 text-amber-200 shadow-xs'
                  : 'text-purple-700 hover:text-purple-900'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-amber-400" />
              {hasActiveCompetition ? (
                <>
                  <span className="hidden sm:inline">«مسابقات الثلاثة فتية» (نشطة الآن 🎮🔥)</span>
                  <span className="sm:hidden">المسابقات 🔥</span>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">«مسابقات الثلاثة فتية» (لا توجد أي مسابقات الآن ⏳)</span>
                  <span className="sm:hidden">المسابقات ⏳</span>
                </>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'kahoot' ? (
          <div className="no-print">
            <KahootDashboard
              currentUserRole="member"
              currentUserName={currentMember.fullName}
              registrants={storageService.getRegistrants()}
              onRefresh={() => {
                setHasActiveCompetition(storageService.hasActiveKahootCompetition());
              }}
              initialQuizId={pendingQuizId}
            />
          </div>
        ) : (
          <>
            {/* Active Quiz Banner for Members */}
            {hasActiveCompetition && (() => {
              const activeSession = storageService.getActiveKahootSession();
              const allQuizzes = storageService.getKahootQuizzes().filter(q =>
                storageService.isKahootQuizAvailableForMembers(q, nowTick)
              );
              const featuredQuiz = (activeSession ? allQuizzes.find(q => q.id === activeSession.quizId) : null)
                || allQuizzes.find(q => q.status === 'published' && (q.activePlayMode === 'self_paced' || q.gameMode === 'self_paced'))
                || allQuizzes.find(q => q.status === 'published');
              if (!featuredQuiz && !activeSession) return null;
              const featuredCover = activeSession?.quizCoverImage || featuredQuiz?.coverImage;
              const featuredMode = activeSession
                ? (activeSession.gameMode === 'team' ? '🛡️ نظام الفرق (Team Mode)' : '⚡ تفاعل مباشر (Live PIN & QR)')
                : (featuredQuiz?.activePlayMode === 'self_paced' || featuredQuiz?.gameMode === 'self_paced')
                ? '🎯 تحدي ذاتي (Self-Paced)'
                : '🔥 مسابقة تفاعلية';
              return (
                <div
                  onClick={() => setActiveTab('kahoot')}
                  className="no-print bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 border-2 border-amber-400/80 rounded-3xl p-4 sm:p-5 shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-amber-300 transition animate-fadeIn"
                >
                  <div className="flex items-center gap-3.5">
                    {featuredCover ? (
                      <img
                        src={featuredCover}
                        alt={featuredQuiz?.title || 'غلاف المسابقة'}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-amber-400 shadow-md shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-2xl shrink-0 shadow-md">
                        🎮
                      </div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-[10px] font-black">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                          <span>مسابقة نشطة متاحة الآن 🔥</span>
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-purple-800/80 border border-purple-400/40 text-purple-100 text-[10px] font-black">
                          {featuredMode}
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-white">
                        {featuredQuiz?.title || activeSession?.quizTitle || 'توجد مسابقة جديدة في «مسابقات الثلاثة فتية» بانتظارك! 🏆'}
                      </h4>
                      <p className="text-xs text-purple-200 mt-0.5 line-clamp-2">
                        {featuredQuiz?.description || 'اضغط هنا للدخول إلى المسابقة والإجابة على الأسئلة والتنافس على صدارة لوحة الشرف!'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('kahoot');
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition shadow-md shrink-0 cursor-pointer"
                  >
                    شارك في المسابقة الآن 🚀
                  </button>
                </div>
              );
            })()}

            {/* Gentle Real Photo Notification Banner */}
        {(currentMember.needsRealPhotoReminder || currentMember.needsRealPhoto) && (
          <div className="no-print bg-amber-50/95 border border-amber-300 rounded-3xl p-4 sm:p-5 shadow-xs text-slate-800 space-y-2.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-lg font-bold shrink-0 shadow-xs">
                  📸
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-950 flex items-center gap-1.5">
                    <span>(تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع)</span>
                  </h4>
                  {currentMember.gender === 'female' && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-pink-100/90 border border-pink-200 text-pink-900 text-xs font-bold">
                      <span>🌸</span>
                      <span>ما تقلقي صورتك او بياناتك في امان بعيدا عن كل الشباب</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditFullName(currentMember.fullName || '');
                  setEditPhone(currentMember.phone || '');
                  setEditWhatsapp(currentMember.whatsapp || '');
                  setEditPhotoPreview(currentMember.photoUrl || '');
                  setIsEditModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition shadow-xs shrink-0 self-end sm:self-auto cursor-pointer"
              >
                تحديث الصورة الآن 📷
              </button>
            </div>
          </div>
        )}

        {/* Notice of Recent Updates if any */}
        {currentMember.lastUpdatedAt && (
          <div className="no-print bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                تم تحديث بياناتك الشخصية مؤخراً بنجاح ويظهر التحديث لجميع خدام الاجتماع.
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 font-mono">
              {new Date(currentMember.lastUpdatedAt).toLocaleDateString('ar-EG')}
            </span>
          </div>
        )}


        {/* Live Announcements & Meeting Reminders (From Website "الثلاثة فتية") */}
        <div className="no-print">
          <MemberAnnouncements member={currentMember} />
        </div>

        {/* Open Trips, Spiritual Days & Conferences + Member's Active Bookings */}
        {(() => {
          const allEvs = getAllEvents().filter((ev) => isEventVisibleToMembers(ev, nowTick).visible);
          if (allEvs.length === 0) return null;

          return (
            <div className="no-print bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white space-y-4 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <Tent className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      الرحلات والأيام الروحية والمؤتمرات 🏕️🚌
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      سجل لنفسك أو لمجموعتك وتابع حالة اشتراكك والباص المخصص لك
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {allEvs.map((ev) => {
                  const enriched = getEnrichedEventRegistrations(ev.id);
                  const myReg = enriched.find(
                    (r) => r.memberId === currentMember.id && r.registrationStatus !== 'cancelled'
                  );
                  const availability = evaluateEventRegistrationAvailability(ev);

                  return (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                              {EVENT_TYPE_LABELS[ev.type].label}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                availability.canRegisterPublicly
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {availability.arabicLabel}
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold text-white mt-1">{ev.name}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            📅 {ev.startDate} {ev.location ? `• 📍 ${ev.location}` : ''}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-bold text-xs shrink-0">
                          {ev.basePrice} {ev.currency}
                        </span>
                      </div>

                      {myReg ? (
                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-xs space-y-2.5">
                          {/* 1. Registration Status */}
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="font-black text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>حالة التسجيل: تم التسجيل بنجاح</span>
                            </span>
                            <span className="font-mono font-bold text-sky-300 text-[11px]">
                              {myReg.registrationReference}
                            </span>
                          </div>

                          {/* 2. Payment Confirmation Status */}
                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">حالة الدفع:</span>
                              {myReg.paymentStatus === 'paid' || myReg.paymentStatus === 'waived' ? (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black text-[11px]">
                                  تم الدفع بنجاح ✅
                                </span>
                              ) : myReg.paymentStatus === 'partially_paid' ? (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black text-[11px]">
                                  تم دفع جزء من الرسوم
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 font-black text-[11px]">
                                  في انتظار تأكيد الدفع
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-slate-800/70">
                              <div>
                                <span className="text-slate-400">المبلغ المطلوب: </span>
                                <strong className="font-mono text-white">
                                  {myReg.finalRequiredAmount} {ev.currency}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400">المبلغ المدفوع: </span>
                                <strong className="font-mono text-emerald-400">
                                  {myReg.totalPaidAmount} {ev.currency}
                                </strong>
                              </div>
                              {myReg.remainingAmount > 0 && (
                                <div>
                                  <span className="text-slate-400">المبلغ المتبقي: </span>
                                  <strong className="font-mono text-amber-400">
                                    {myReg.remainingAmount} {ev.currency}
                                  </strong>
                                </div>
                              )}
                              <div>
                                <span className="text-slate-400">طريقة الدفع: </span>
                                <strong className="text-sky-300">
                                  {(myReg.paymentMethod && PAYMENT_METHOD_LABELS[myReg.paymentMethod]?.label) ||
                                    myReg.paymentMethod ||
                                    'غير محدد'}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* 3. Transportation & Bus Assignment */}
                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                            {myReg.bus ? (
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center justify-between">
                                  <span className="text-sky-400 font-black flex items-center gap-1">
                                    <Bus className="w-3.5 h-3.5" />
                                    <span>الانتقالات (الباص):</span>
                                  </span>
                                  <strong className="text-white font-black">{myReg.bus.name}</strong>
                                </div>
                                {(myReg.bus.responsibleServantName || myReg.bus.driverName) && (
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span>الخادم المسؤول:</span>
                                    <strong className="text-emerald-300">
                                      {myReg.bus.responsibleServantName || myReg.bus.driverName}
                                    </strong>
                                  </div>
                                )}
                                {(myReg.bus.responsibleServantPhone || myReg.bus.driverPhone) && (
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span>رقم الهاتف:</span>
                                    <strong className="font-mono text-sky-300" dir="ltr">
                                      {myReg.bus.responsibleServantPhone || myReg.bus.driverPhone}
                                    </strong>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Bus className="w-3.5 h-3.5 text-amber-400" />
                                  <span>الانتقالات (الباص):</span>
                                </span>
                                <span className="font-black text-amber-300">جاري توزيع الباصات</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : availability.canRegisterPublicly && onOpenEventRegistration ? (
                        <button
                          type="button"
                          onClick={() => onOpenEventRegistration(ev.id)}
                          className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <span>سجل الآن في {ev.name}</span>
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="text-center py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 text-xs font-black">
                          {availability.arabicLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Challenge Progress Banner (From the Video: 4 Fridays & Gift!) */}
        <div className="no-print bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-xs mb-2">
                <Gift className="w-3.5 h-3.5 text-amber-300" />
                <span>تحدي الحضور والجوائز</span>
              </div>
              <h3 className="text-xl font-black text-amber-100">
                احضر أربعة جمعات بدون غياب وليك هدية 🎁
              </h3>
              <p className="text-xs text-emerald-100 mt-1 max-w-md">
                ختم الاجتماع يوضع تلقائياً في دوائر بطاقتك الخلفية فور كل حضور تسجله بالكاميرا في قاعة الاجتماع.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center shrink-0 w-full md:w-auto">
              <span className="text-xs text-emerald-200 block font-semibold">عدد الجمعات المسجلة</span>
              <div className="text-3xl font-black text-white mt-1">
                {attendCount} <span className="text-sm font-normal text-emerald-200">من 4</span>
              </div>
              <span className="text-[10px] text-amber-200 block mt-1 font-bold">
                {attendCount >= 4 ? '🎉 مبروك! استلم هديتك' : `متبقي ${Math.max(0, 4 - attendCount)} جمعات`}
              </span>
            </div>
          </div>
        </div>


        {/* Member Two-Sided ID Card (with front photo on left half & back with 4 circles - NO phone/whatsapp on card!) */}
        <div>
          <div className="no-print flex items-center justify-between mb-3 px-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>بطاقة عضويتك الرسمية (ID Card)</span>
              <span className="text-xs text-slate-400 font-normal">
                (يمكنك النقر على الأزرار لتبديل الوجهين أو الطباعة)
              </span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditFullName(currentMember.fullName || '');
                  setEditPhone(currentMember.phone || '');
                  setEditWhatsapp(currentMember.whatsapp || '');
                  setEditPhotoPreview(currentMember.photoUrl || '');
                  setNameError(null);
                  setHasEnglishError(false);
                  setSaveError(null);
                  setSaveSuccessMsg(null);
                  setIsEditModalOpen(true);
                }}
                className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                <span>تحديث بياناتي</span>
              </button>

              <button
                onClick={handleDownloadCard}
                disabled={isDownloadingCard}
                className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-2xs disabled:opacity-60"
                title={activeCardFace === 'back' ? 'تحميل الوجه الخلفي (الأختام) كصورة PNG' : 'تحميل الوجه الأمامي للبطاقة كصورة PNG'}
              >
                {isDownloadingCard ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                )}
                <span>{activeCardFace === 'back' ? 'تحميل الوجه الخلفي كصورة' : 'تحميل بطاقتي كصورة'}</span>
              </button>

              <button
                onClick={() => window.print()}
                className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة بطاقتي</span>
              </button>
            </div>
          </div>

          <div className="max-w-md mx-auto">
            <IdCardItem
              registrant={currentMember}
              qrCodeUrl={qrCodeUrl}
              meetingLogoUrl={meetingLogo}
              attendanceRecords={attendances}
              onPrintCard={() => window.print()}
              defaultFace="both"
              onActiveFaceChange={setActiveCardFace}
            />
          </div>
        </div>

        {/* Attendance Records Log */}
        <div className="no-print bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
          <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>سجل حضورك في الاجتماع</span>
          </h4>

          {attendances.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-bold">لم تسجل أي حضور حتى الآن</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                تأكد من إبراز رمز QR الخاص بك في الاجتماع القادم ليقوم الخدام بمسحه!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {attendances.map((rec, index) => (
                <div key={rec.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px]">
                      {index + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-800 block">
                        {new Date(rec.date).toLocaleDateString('ar-EG', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(rec.timestamp).toLocaleTimeString('ar-EG')}
                      </span>
                    </div>
                  </div>

                  {storageService.isFridayStampRevoked(currentMember.id, rec.date) ? (
                    <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-bold text-[11px] border border-slate-200">
                      <span>حاضر (بدون ختم)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold text-[11px] border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تم الختم 🏅</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {/* Direct Support / دعم فني WhatsApp Footer */}
        <div className="no-print pt-4 border-t border-slate-200/80 flex justify-center">
          <a
            href="https://wa.me/201288651567"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#1f2937] hover:bg-[#111827] text-white font-black text-xs shadow-md shadow-slate-900/20 transition active:scale-95"
          >
            <MessageSquare className="w-4 h-4 text-slate-200" />
            <span>دعم فني / Support</span>
          </a>
        </div>

      </main>

      {/* ========================================================
          MODAL: Update Profile (Photo, Phone, WhatsApp)
          Requirement: "وخلي عادي المخدومين وكل الاعضاء يقدروا يعغيروا صورتهم او يعملوا تحديث لرقم تلفونهم او رقم الواتساب اذا غيروه ويظهر لينا التحديث احنا الخدام كلنا"
          ======================================================== */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تحديث بياناتك الشخصية
                  </h3>
                  <p className="text-xs text-slate-500">
                    يمكنك تغيير صورتك الشخصية ورقم الهاتف والواتساب، وسيظهر التحديث لجميع الخدام.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="my-4 p-3 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {saveError && (
              <div className="my-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 py-3">
              
              {/* Full Arabic Name update */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  الاسم بالكامل (ثلاثي باللغة العربية فقط)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    dir="rtl"
                    value={editFullName}
                    onChange={handleNameChange}
                    className={`w-full rounded-xl border px-3.5 py-2.5 pl-10 text-sm font-bold text-slate-900 focus:outline-hidden ${
                      hasEnglishError || nameError
                        ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    placeholder="مثال: يوحنا بولس مرقس"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {nameError && (
                  <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{nameError}</span>
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  تحديث اسمك ينعكس فوراً على بطاقة الهوية الرسمية وفي سجلات الخدام.
                </p>
              </div>

              {/* Photo Update with Real-Photo check */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  الصورة الشخصية للوجه (صورة حقيقية)
                </label>

                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="w-16 h-20 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 relative flex items-center justify-center">
                    {isVerifyingPhoto ? (
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    ) : editPhotoPreview && editPhotoPreview.trim() !== '' ? (
                      <img src={editPhotoPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-slate-400" />
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <p className="text-[11px] text-slate-500">
                      يجب أن تكون صورة حقيقية لك شخصياً وليست مصنوعة بالذكاء الاصطناعي.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isVerifyingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs shadow-2xs transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      <span>اختر صورة حقيقية جديدة</span>
                    </button>
                  </div>
                </div>

                {photoError && (
                  <p className="text-xs text-red-600 font-bold mt-1">{photoError}</p>
                )}
              </div>

              {/* Phone update */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  رقم الهاتف
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={editPhone}
                    onChange={(e) => {
                      const { formatted } = formatPhoneNumber(e.target.value);
                      setEditPhone(formatted);
                    }}
                    className="w-full text-left rounded-xl border border-slate-300 px-3.5 py-2.5 pl-10 text-sm font-mono text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* WhatsApp update */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  رقم الواتساب
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={editWhatsapp}
                    onChange={(e) => {
                      const { formatted } = formatPhoneNumber(e.target.value);
                      setEditWhatsapp(formatted);
                    }}
                    className="w-full text-left rounded-xl border border-slate-300 px-3.5 py-2.5 pl-10 text-sm font-mono text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                  <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Address update */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  العنوان ومكان السكن الحالي
                </label>
                <div className="relative">
                  <input
                    type="text"
                    dir="rtl"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="مثال: مدينة نصر / شبرا / الخرطوم..."
                    className="w-full text-right rounded-xl border border-slate-300 px-3.5 py-2.5 pl-10 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500 font-bold"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400">
                  تحديث عنوانك يتيح للخدام الافتقاد ومتابعة احتياجاتك بدقة وينعكس فوراً في الداشبورد.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isVerifyingPhoto}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>حفظ التحديث وإرساله للخدام</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phone Notification Shade (ستارة ولوحة الإشعارات) */}
      <NotificationShade
        isOpen={isNotificationShadeOpen}
        onClose={() => setIsNotificationShadeOpen(false)}
        onOpenAnnouncement={(ann) => setSelectedShadeAnnouncement(ann)}
        currentUser={currentMember}
        currentUserRole={currentMember.role}
      />

      {/* Announcement Modal if clicked from Shade */}
      {selectedShadeAnnouncement && (
        <AnnouncementModal
          announcement={selectedShadeAnnouncement}
          onClose={() => setSelectedShadeAnnouncement(null)}
          currentUserId={currentMember.id}
          memberFirstName={currentMember.fullName.split(' ')[0]}
        />
      )}

    </div>
  );
};
