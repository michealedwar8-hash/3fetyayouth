import React, { useState, useMemo } from 'react';
import { Registrant, UserRole, Announcement, AnnouncementTargetAudience } from '../../types';
import { 
  storageService, 
  formatServantDisplayName,
  isAnnouncementExpired,
  notificationService,
  compressImageToFitStorage
} from '../../services/storageService';
import { oneSignalService } from '../../services/oneSignalService';
import { 
  Bell, 
  Send, 
  Sparkles, 
  Users, 
  Clock, 
  UserCheck, 
  UserX, 
  MessageCircle, 
  Check, 
  Trash2, 
  Crown, 
  ShieldCheck, 
  Heart, 
  ThumbsUp, 
  Flame, 
  AlertCircle, 
  Calendar,
  Share2,
  X,
  Plus,
  Eye,
  CheckCircle2,
  Image as ImageIcon,
  Upload,
  ZoomIn
} from 'lucide-react';

interface AnnouncementsDashboardProps {
  currentUserRole: UserRole;
  currentUserName: string;
  registrants: Registrant[];
  onRefresh?: () => void;
}

const TEMPLATE_PRESETS = [
  {
    id: 'meeting_reminder_7pm' as const,
    name: 'تذكير موعد الاجتماع (7:00 م) 🕊️',
    title: 'تذكير بموعد اجتماع الشباب الليلة 🕊️',
    content: '[الاسم الأول] ! ما تنسى تجي الاجتماع الليلة الساعة 7 منتظرينك ❤️🕊️✨',
    target: 'all' as AnnouncementTargetAudience,
    description: 'يُرسل قبل الاجتماع لتذكير كافة الشباب بالحضور، ويتم استبدال [الاسم الأول] باسم كل مخدوم تلقائياً.'
  },
  {
    id: 'absence_care_9pm' as const,
    name: 'افتقاد الغائبين بعد الاجتماع (9:00 م) ✝️',
    title: 'افتقاد ومحبة بعد انتهاء الاجتماع ✝️',
    content: 'الليلة افتقدناك يا [الاسم الأول]، ما تكسل ومنتظرينك الأسبوع الجاي! ❤️🕊️🙏',
    target: 'absent_today' as AnnouncementTargetAudience,
    description: 'يُرسل بعد انتهاء الاجتماع للشباب الذين لم يسجلوا حضور اليوم لتشجيعهم وافتقادهم.'
  },
  {
    id: 'attendance_thanks' as const,
    name: 'شكر للشباب الحضور الليلة 🎉❤️',
    title: 'شكراً لحضورك ومشاركتك معنا الليلة 💖✨',
    content: 'شكراً يا [الاسم الأول] إنك كنت معانا الليلة وفرحنا جداً بوجودك! ❤️🕊️✨🙏🌹',
    target: 'attended_today' as AnnouncementTargetAudience,
    description: 'يُرسل للشباب الذين حضروا وسجلوا حضور الليلة لشكرهم والتعبير عن الفرحة والامتنان بوجودهم.'
  },
  {
    id: 'spiritual_word' as const,
    name: 'كلمة روحية وآية الأسبوع 📖',
    title: 'آية الأسبوع وبركة اليوم ✝️',
    content: 'يا [الاسم الأول]، تذكر قول الرب: «فَرِحْتُ بِالْقَائِلِينَ لِي: إِلَى بَيْتِ الرَّبِّ نَذْهَبُ» (مز 122:1). يومك مبارك ومليان سلام! 🕊️✨',
    target: 'all' as AnnouncementTargetAudience,
    description: 'آية تشجيعية وبركة روحية لجميع الشباب.'
  },
  {
    id: 'custom' as const,
    name: 'إعلان مخصص (كتابة نص حر) ✍️',
    title: 'إعلان هام لشباب الاجتماع 📢',
    content: 'أحبائي شباب الثلاثة فتية، [اكتب نص الإعلان هنا]... منتظرين مشاركتكم محبتنا! 🕊️✨',
    target: 'all' as AnnouncementTargetAudience,
    description: 'صياغة رسالة حرة مخصصة لجميع الشباب أو لمجموعة محددة.'
  }
];

const REACTION_EMOJIS = ['❤️', '🙏', '🕊️', '👍', '🎉', '🔥'];

export const AnnouncementsDashboard: React.FC<AnnouncementsDashboardProps> = ({
  currentUserRole,
  currentUserName,
  registrants,
  onRefresh
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => storageService.getAnnouncements());
  const [isComposing, setIsComposing] = useState(false);
  const [filterActiveTab, setFilterActiveTab] = useState<'today_active' | 'all'>('today_active');

  React.useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setAnnouncements(storageService.getAnnouncements());
    });
    return () => unsub();
  }, []);
  
  // Compose Form State
  const [selectedTemplateId, setSelectedTemplateId] = useState<'meeting_reminder_7pm' | 'absence_care_9pm' | 'attendance_thanks' | 'spiritual_word' | 'custom'>('meeting_reminder_7pm');
  const [annTitle, setAnnTitle] = useState(TEMPLATE_PRESETS[0].title);
  const [annContent, setAnnContent] = useState(TEMPLATE_PRESETS[0].content);
  const [annImageUrl, setAnnImageUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [targetAudience, setTargetAudience] = useState<AnnouncementTargetAudience>('all');
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  // Reaction Inspection Modal
  const [inspectReactionsAnnouncement, setInspectReactionsAnnouncement] = useState<Announcement | null>(null);
  const [reactionFilterTab, setReactionFilterTab] = useState<string>('all');
  const [inspectModalTab, setInspectModalTab] = useState<'reactions' | 'viewers'>('reactions');

  const canPostAnnouncements = 
    currentUserRole === 'priest' ||
    currentUserRole === 'community_owner' || 
    currentUserRole === 'community_manager' || 
    currentUserRole === 'meeting_secretary' || 
    currentUserRole === 'service_secretary' ||
    currentUserRole === 'servant';

  const cairoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const todayStr = `${cairoNow.getFullYear()}-${String(cairoNow.getMonth() + 1).padStart(2, '0')}-${String(cairoNow.getDate()).padStart(2, '0')}`;

  // Absent & Attended members today
  const absentMembersToday = useMemo(() => {
    return storageService.getAbsentMembersForDate(todayStr);
  }, [registrants, todayStr]);

  const attendedMembersToday = useMemo(() => {
    return storageService.getAttendedMembersForDate(todayStr);
  }, [registrants, todayStr]);

  // Gender-specific active youth (Requirement: تخصيص الإعلانات شباب ذكور فقط أو شابات إناث فقط)
  const activeMales = useMemo(() => {
    return registrants.filter(r => r.status === 'active' && (r.gender || 'male') === 'male');
  }, [registrants]);

  const activeFemales = useMemo(() => {
    return registrants.filter(r => r.status === 'active' && r.gender === 'female');
  }, [registrants]);

  // Target count based on selection
  const targetCount = useMemo(() => {
    if (targetAudience === 'all') return registrants.filter(r => r.status === 'active').length;
    if (targetAudience === 'absent_today') return absentMembersToday.length;
    if (targetAudience === 'attended_today') return attendedMembersToday.length;
    if (targetAudience === 'males_only') return activeMales.length;
    if (targetAudience === 'females_only') return activeFemales.length;
    return registrants.filter(r => r.status === 'active').length;
  }, [targetAudience, registrants, absentMembersToday, attendedMembersToday, activeMales, activeFemales]);

  // Current logged in user object if found in registrants
  const currentUserObj = useMemo(() => {
    return (
      registrants.find(r => r.fullName && currentUserName && r.fullName.trim() === currentUserName.trim()) ||
      registrants.find(r => r.role === currentUserRole)
    );
  }, [registrants, currentUserName, currentUserRole]);

  // Automatically record view when a servant/secretary/manager views active announcements in AnnouncementsDashboard
  React.useEffect(() => {
    if (!currentUserObj || !currentUserObj.id) return;
    announcements.forEach(ann => {
      if (ann && ann.id && !isAnnouncementExpired(ann)) {
        const alreadyViewed = (ann.viewers || []).some(v => v.memberId === currentUserObj.id);
        if (!alreadyViewed) {
          storageService.recordAnnouncementView(ann.id, currentUserObj).catch(() => {});
        }
      }
    });
  }, [announcements.length, currentUserObj?.id]);

  // Sample registrant for preview
  const previewSampleMember = useMemo(() => {
    return registrants[0] || {
      id: 'preview',
      fullName: 'مارك يوسف حنا',
      uniqueCode: 'TY-1001',
      phone: '01234567890',
      whatsapp: '01234567890',
      gender: 'male',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
      role: 'member',
      status: 'active',
      registeredAt: new Date().toISOString(),
      qrData: 'TY-1001',
      dob: '2000-01-01'
    };
  }, [registrants]);

  const previewFormattedContent = useMemo(() => {
    return storageService.formatAnnouncementTextForMember(annContent, previewSampleMember);
  }, [annContent, previewSampleMember]);

  // Template change handler
  const handleSelectTemplate = (templateId: typeof selectedTemplateId) => {
    setSelectedTemplateId(templateId);
    const t = TEMPLATE_PRESETS.find(p => p.id === templateId);
    if (t) {
      setAnnTitle(t.title);
      setAnnContent(t.content);
      setTargetAudience(t.target);
    }
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    setAnnContent(prev => prev + ' ' + placeholder);
  };

  // Optional Image Attachment Upload Handler (WhatsApp BigPicture style)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawDataUrl = ev.target?.result as string;
      if (!rawDataUrl) {
        setIsUploadingImage(false);
        return;
      }
      try {
        const compressed = await compressImageToFitStorage(rawDataUrl, 900, 0.82);
        setAnnImageUrl(compressed);
      } catch {
        setAnnImageUrl(rawDataUrl);
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit announcement
  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) return;

    // Strict Rule: ONLY show personal photo if sender is a Priest ('priest'), otherwise Site Logo is used
    const senderPhotoUrl = currentUserRole === 'priest' ? currentUserObj?.photoUrl : undefined;

    const newAnn = storageService.createAnnouncement({
      title: annTitle.trim(),
      content: annContent.trim(),
      imageUrl: annImageUrl || undefined,
      templateType: selectedTemplateId,
      senderRole: currentUserRole,
      senderName: currentUserName,
      senderPhotoUrl,
      targetAudience,
      targetDate: todayStr,
      pinned: true
    });

    // Relay push notification to targeted mobile phone notification shades via OneSignal & Web Push API
    oneSignalService.sendAnnouncementPush(newAnn).catch(() => {});

    setAnnouncements(storageService.getAnnouncements());
    setAnnImageUrl('');
    setIsComposing(false);
    setSendSuccessMsg(`تم نشر وتوجيه الإعلان إلى ${targetCount} مخدوم وإرسال إشعار الهاتف الفوري بنجاح! 🚀`);
    setTimeout(() => setSendSuccessMsg(null), 4000);

    if (onRefresh) {
      onRefresh();
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    storageService.deleteAnnouncement(id);
    setAnnouncements(storageService.getAnnouncements());
    if (onRefresh) {
      onRefresh();
    }
  };

  // Role Arabic Label & Badge
  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'priest': return 'أبونا ✝️';
      case 'community_owner': return 'مسؤول المجتمع (Owner)';
      case 'community_manager': return 'مدير المجتمع';
      case 'meeting_secretary': return 'أمين الاجتماع';
      case 'service_secretary': return 'أمين الخدمة';
      case 'servant': return 'خادم الاجتماع';
      default: return 'عضو الاجتماع';
    }
  };

  // Filter out personal visitation alerts belonging to other servants
  const visibleAnnouncements = useMemo(() => {
    return announcements.filter(a => {
      if (a.isVisitationTaskAlert || a.targetAudience === 'servant_personal' || (a.title?.includes('تكليف افتقاد') && (a.targetUserId || a.targetServantName))) {
        return storageService.isMemberTargetedByAnnouncement(a, currentUserObj, currentUserRole, currentUserName, currentUserObj?.id);
      }
      return true;
    });
  }, [announcements, currentUserObj, currentUserRole, currentUserName]);

  // Filtered announcements list based on expiration and tab
  const activeAnnouncements = useMemo(() => {
    return visibleAnnouncements.filter(a => !isAnnouncementExpired(a));
  }, [visibleAnnouncements]);

  const displayedAnnouncements = useMemo(() => {
    if (filterActiveTab === 'today_active') {
      return activeAnnouncements;
    }
    return visibleAnnouncements;
  }, [filterActiveTab, activeAnnouncements, visibleAnnouncements]);

  // Total reactions across announcements
  const totalReactionsCount = useMemo(() => {
    let count = 0;
    visibleAnnouncements.forEach(a => {
      Object.values(a.reactions || {}).forEach(arr => {
        count += arr.length;
      });
    });
    return count;
  }, [visibleAnnouncements]);

  return (
    <div className="space-y-6 pb-12 animate-fadeIn select-none">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-blue-500/10 blur-2xl pointer-events-none"></div>
        <div className="absolute left-1/3 -bottom-10 w-60 h-60 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-cyan-200 text-xs font-bold mb-2.5 border border-white/15">
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>نظام البث والتنبيهات المباشرة • موقع الثلاثة فتية</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
              <span>لوحة الإعلانات والتذكيرات</span>
              <span className="text-2xl">📢</span>
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl font-medium leading-relaxed">
              إرسال إعلانات وتذكيرات موجهة لجميع شباب ومخدومي الاجتماع؛ تظهر مباشرة في حساب المخدوم مرسلة من <strong>«موقع الثلاثة فتية»</strong> وتتضمن اسم ورتبة المسؤول، مع دعم استبدال الاسم الأول وتفاعل الإيموجيز.
            </p>
          </div>

          {canPostAnnouncements && (
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-black text-sm shadow-lg shadow-blue-500/30 flex items-center gap-2 transition shrink-0 transform hover:scale-[1.02] active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>إرسال إعلان جديد 🚀</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {sendSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{sendSuccessMsg}</span>
          </div>
          <button onClick={() => setSendSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* 1. إجمالي الإعلانات */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">الإعلانات المنشورة</span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {announcements.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
            📢
          </div>
        </div>

        {/* 2. إجمالي التفاعلات */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">تفاعلات المخدومين</span>
            <span className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">
              {totalReactionsCount}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl">
            ❤️
          </div>
        </div>

        {/* 3. الغائبون اليوم المستهدفون بالافتقاد */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">غائبون لم يسجلوا اليوم</span>
            <span className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
              {absentMembersToday.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl">
            ⚠️
          </div>
        </div>

        {/* 4. إجمالي المخدومين النشطين */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">قاعدة شباب الاجتماع</span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">
              {registrants.filter(r => r.status === 'active').length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl">
            👥
          </div>
        </div>

      </div>

      {/* ========================================================
          COMPOSE ANNOUNCEMENT MODAL / CARD
          ======================================================== */}
      {isComposing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 my-auto space-y-5 max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
                  📢
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    إنشاء وبث إعلان جديد للشباب
                  </h3>
                  <p className="text-xs text-slate-500">
                    المرسل: موقع الثلاثة فتية • {currentUserName} ({getRoleLabel(currentUserRole)})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-4">
              
              {/* Preset Templates Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  اختر من القوالب الجاهزة أو اكتب رسالة حرة:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TEMPLATE_PRESETS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t.id)}
                      className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between ${
                        selectedTemplateId === t.id
                          ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/30'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-slate-900">{t.name}</span>
                        {selectedTemplateId === t.id && (
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  عنوان الإعلان:
                </label>
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="مثال: تذكير بموعد الاجتماع الليلة 🕊️"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Content Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    نص الإعلان أو الرسالة:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">إدراج رمز الاسم:</span>
                    <button
                      type="button"
                      onClick={() => handleInsertPlaceholder('[الاسم الأول]')}
                      className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                      title="يتم استبدال هذا الرمز بالاسم الأول للمخدوم تلقائياً"
                    >
                      + [الاسم الأول]
                    </button>
                  </div>
                </div>

                <textarea
                  rows={3}
                  required
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  placeholder="اكتب نص الإعلان هنا..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm leading-relaxed focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 تلميح: عند كتابة <strong>[الاسم الأول]</strong> أو <strong>فلان</strong> سيتم استبدالها تلقائياً بالاسم الأول لكل مخدوم في حسابه ورسالته.
                </p>
              </div>

              {/* Optional Image Attachment (WhatsApp Expandable Notification Image) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">
                        إرفاق صورة مع الإعلان (اختياري • بنظام الواتساب) 📷
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        تظهر الصورة عند سحب سهم الإشعار للأسفل في ستارة الهاتف بدون فتحه، وتظهر داخل الإعلان عند فتحه
                      </span>
                    </div>
                  </div>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isUploadingImage ? 'جاري تجهيز الصورة...' : annImageUrl ? 'تغيير الصورة المرفقة' : 'اختيار صورة من الجهاز'}</span>
                  </button>
                </div>

                {annImageUrl && (
                  <div className="relative rounded-2xl overflow-hidden border border-emerald-300 bg-white max-h-56 flex items-center justify-center">
                    <img
                      src={annImageUrl}
                      alt="معاينة صورة الإعلان"
                      className="max-h-56 w-auto object-contain mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => setAnnImageUrl('')}
                      className="absolute top-2 left-2 px-2.5 py-1 rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>إزالة الصورة</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Target Audience Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  الفئة المستهدفة بالإعلان:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetAudience('all')}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      targetAudience === 'all'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-black'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-bold'
                    } text-xs cursor-pointer`}
                  >
                    <span>كافة المخدومين</span>
                    <span className="block text-[10px] font-mono mt-0.5 opacity-75">
                      ({registrants.filter(r => r.status === 'active').length} عضو)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetAudience('males_only')}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      targetAudience === 'males_only'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-black ring-2 ring-indigo-300'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-bold'
                    } text-xs cursor-pointer`}
                  >
                    <span>الشباب الذكور فقط 👦</span>
                    <span className="block text-[10px] font-mono mt-0.5 opacity-75">
                      ({activeMales.length} شاب)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetAudience('females_only')}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      targetAudience === 'females_only'
                        ? 'border-pink-600 bg-pink-50 text-pink-900 font-black ring-2 ring-pink-300'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-bold'
                    } text-xs cursor-pointer`}
                  >
                    <span>الشابات الإناث فقط 👧</span>
                    <span className="block text-[10px] font-mono mt-0.5 opacity-75">
                      ({activeFemales.length} شابة)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetAudience('absent_today')}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      targetAudience === 'absent_today'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-black'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-bold'
                    } text-xs cursor-pointer`}
                  >
                    <span>الشباب الغائبين اليوم</span>
                    <span className="block text-[10px] font-mono mt-0.5 opacity-75">
                      ({absentMembersToday.length} غائب)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetAudience('attended_today')}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      targetAudience === 'attended_today'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-black'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-bold'
                    } text-xs cursor-pointer`}
                  >
                    <span>الشباب الحاضرين اليوم</span>
                    <span className="block text-[10px] font-mono mt-0.5 opacity-75">
                      ({attendedMembersToday.length} حاضر)
                    </span>
                  </button>
                </div>
              </div>

              {/* LIVE PREVIEW OF THE ANNOUNCEMENT AS SEEN BY YOUTH */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>معاينة حية كما ستظهر في حساب وستارة إشعارات الهاتف ({previewSampleMember.fullName.split(' ')[0]}):</span>
                  </span>
                  <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-md text-slate-700">Live Preview</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs space-y-2.5 text-right">
                  {/* Sender Header (Priest photo if Priest, otherwise Official Site Logo) */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center text-blue-700 font-bold shrink-0 shadow-xs">
                        <img
                          src={storageService.getAnnouncementSenderIcon({
                            senderRole: currentUserRole,
                            senderPhotoUrl: currentUserObj?.photoUrl
                          })}
                          alt="شعار الاجتماع"
                          className={
                            currentUserRole === 'priest' && currentUserObj?.photoUrl
                              ? 'w-full h-full object-cover'
                              : 'w-full h-full object-contain scale-[1.28] translate-y-1 bg-transparent'
                          }
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            الاعلانات
                          </span>
                          <span className="text-xs font-black text-slate-900">
                            {formatServantDisplayName(currentUserName, currentUserRole)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">الآن</span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Message Box */}
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {previewFormattedContent}
                  </p>

                  {/* Attached Image Preview if selected */}
                  {annImageUrl && (
                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950/5 max-h-56 flex items-center justify-center">
                      <img
                        src={annImageUrl}
                        alt="صورة الإعلان"
                        className="max-h-56 w-full object-cover"
                      />
                    </div>
                  )}

                  {/* Reaction Buttons Preview */}
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-bold">تفاعل المخدوم:</span>
                    {REACTION_EMOJIS.map(emoji => (
                      <span key={emoji} className="px-2 py-0.5 rounded-lg bg-slate-100 text-xs border border-slate-200">
                        {emoji}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsComposing(false)}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="flex-2 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>نشر الإعلان الآن ({targetCount} مخدوم) 🚀</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================
          SENT ANNOUNCEMENTS LIST FEED
          ======================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>سجل الإعلانات والتذكيرات المنشورة</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full font-mono font-bold">
                {displayedAnnouncements.length}
              </span>
            </h3>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              تصل الإعلانات فورياً للمخدومين، وتختفي تلقائياً بانتهاء يوم إرسالها ودخول اليوم الجديد 🌙
            </div>
          </div>

          {/* Filter Tabs: Today's Active vs Archive */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-bold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterActiveTab('today_active')}
              className={`px-3 py-1.5 rounded-xl transition ${
                filterActiveTab === 'today_active' 
                  ? 'bg-white text-emerald-800 shadow-2xs font-black' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🟢 إعلانات اليوم النشطة ({activeAnnouncements.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl transition ${
                filterActiveTab === 'all' 
                  ? 'bg-white text-slate-900 shadow-2xs font-black' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📁 السجل الكامل والأرشيف ({announcements.length})
            </button>
          </div>
        </div>

        {displayedAnnouncements.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200">
            <Bell className="w-12 h-12 mx-auto mb-2 opacity-30 text-blue-500" />
            <p className="text-sm font-bold text-slate-600">
              {filterActiveTab === 'today_active' ? 'لا توجد إعلانات نشطة لليوم الحالي' : 'لا توجد إعلانات منشورة حتى الآن'}
            </p>
            <p className="text-xs text-slate-400 mt-1">انقر على زر "إرسال إعلان جديد" بالأعلى لبث تذكير الحضور للشباب.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedAnnouncements.map((ann) => {
              const isExpired = isAnnouncementExpired(ann);

              // Calculate reactions total for this announcement
              const reactionsMap = ann.reactions || {};
              const totalReactions = Object.values(reactionsMap).reduce((sum, arr) => sum + arr.length, 0);

              return (
                <div
                  key={ann.id}
                  className={`bg-white rounded-3xl p-5 sm:p-6 border shadow-xs hover:shadow-md transition space-y-4 text-right ${
                    isExpired ? 'border-slate-200 bg-slate-50/40 opacity-90' : 'border-blue-200/90'
                  }`}
                >
                  
                  {/* Top Sender Bar (Priest photo only if Priest, otherwise Official Site Logo) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
                        <img 
                          src={storageService.getAnnouncementSenderIcon(ann)} 
                          alt="شعار الاجتماع" 
                          className={
                            ann.senderRole === 'priest' && ann.senderPhotoUrl
                              ? 'w-full h-full object-cover'
                              : 'w-full h-full object-contain scale-[1.28] translate-y-1 bg-transparent'
                          } 
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                            الاعلانات
                          </span>
                          <span className="text-xs font-extrabold text-slate-900">
                            {formatServantDisplayName(ann.senderName, ann.senderRole)}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                            {getRoleLabel(ann.senderRole)}
                          </span>

                          {/* Expiration Status Badge */}
                          {isExpired ? (
                            <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                              ⏳ منتهي (اختفى تلقائياً بنهاية اليوم)
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                              🟢 نشط ومعروض للشباب
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                          {new Date(ann.createdAt).toLocaleDateString('ar-EG', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {/* Target Audience Badge */}
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border ${
                        ann.targetAudience === 'absent_today'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : ann.targetAudience === 'attended_today'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : ann.targetAudience === 'males_only'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : ann.targetAudience === 'females_only'
                                ? 'bg-pink-50 text-pink-800 border-pink-200'
                                : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}>
                        {ann.targetAudience === 'absent_today' 
                          ? '⚠️ الغائبين اليوم' 
                          : ann.targetAudience === 'attended_today' 
                            ? '✓ الحاضرين اليوم' 
                            : ann.targetAudience === 'males_only'
                              ? '👦 الشباب الذكور فقط'
                              : ann.targetAudience === 'females_only'
                                ? '👧 الشابات الإناث فقط'
                                : '👥 كافة المخدومين'}
                      </span>

                      {/* Delete Button */}
                      {canPostAnnouncements && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="حذف هذا الإعلان"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Direct Message Box & Expandable Image (WhatsApp Style) */}
                  <div className="space-y-3">
                    {ann.title && 
                     !ann.title.includes('تذكير') && 
                     !ann.title.includes('افتقاد') && (
                      <h4 className="text-sm font-black text-slate-900 mb-1.5">
                        {ann.title}
                      </h4>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                      {ann.content}
                    </p>

                    {ann.imageUrl && ann.imageUrl.trim() !== '' && (
                      <div 
                        onClick={() => setZoomedImageUrl(ann.imageUrl!)}
                        className="relative group/img rounded-2xl overflow-hidden border border-slate-200 bg-slate-950/5 max-h-80 flex items-center justify-center cursor-pointer"
                      >
                        <img
                          src={ann.imageUrl}
                          alt={ann.title || 'صورة الإعلان'}
                          className="max-h-80 w-full object-cover transition duration-300 group-hover/img:scale-[1.01]"
                        />
                        <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                          <ZoomIn className="w-3.5 h-3.5 text-cyan-300" />
                          <span>تكبير الصورة</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reactions Summary & Inspection Bar (WhatsApp option removed as requested) */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    
                    {/* Reactions display & Interactive Emoji Bar for Servants / Admins / Members */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-500 text-[11px]">تفاعلات الشباب والخدام:</span>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {REACTION_EMOJIS.map((emoji) => {
                          const memberIds = reactionsMap[emoji] || [];
                          const count = memberIds.length;
                          const myId = currentUserObj?.id || currentUserName;
                          const hasReacted = Boolean(myId && (memberIds.includes(myId) || (currentUserName && memberIds.includes(currentUserName))));

                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                if (currentUserObj?.id) {
                                  storageService.toggleAnnouncementReaction(ann.id, currentUserObj.id, emoji);
                                  setAnnouncements(storageService.getAnnouncements());
                                } else {
                                  setInspectReactionsAnnouncement(ann);
                                  setInspectModalTab('reactions');
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold transition shadow-2xs cursor-pointer ${
                                hasReacted
                                  ? 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-300'
                                  : count > 0
                                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                    : 'bg-slate-50/60 hover:bg-slate-100 border-slate-200/70 text-slate-400 opacity-80 hover:opacity-100'
                              }`}
                              title={currentUserObj ? 'انقر للتفاعل بهذا الإيموجي' : 'انقر لعرض المتفاعلين'}
                            >
                              <span>{emoji}</span>
                              {count > 0 && <span className="font-mono text-slate-700 font-bold">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Viewers & Reaction Inspection Buttons */}
                    <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectReactionsAnnouncement(ann);
                          setInspectModalTab('viewers');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                        title="عرض كشف من شاهدوا الإعلان حتى لو لم يتفاعلوا"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        <span>الشافوا الإعلان ({(ann.viewers || []).length}) 👁️</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setInspectReactionsAnnouncement(ann);
                          setInspectModalTab('reactions');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                        title="عرض كشف المتفاعلين بنظام الواتساب"
                      >
                        <span>المتفاعلون ({totalReactions}) ❤️</span>
                      </button>
                    </div>

                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* ========================================================
          INSPECT REACTIONS DETAILS MODAL (نظام الواتساب)
          Requirement: "واذا تفاعل خليها تظهر للمسوؤل للي رسل رسالة التنبيهات عدد الناس الاتفاعلو مع رسالته واسمائهم و صورهم ذي نظام الواتساب"
          ======================================================== */}
      {inspectReactionsAnnouncement && (() => {
        // Always read live announcement from state so new views & reactions appear in real time while modal is open
        const liveAnnouncement = announcements.find(a => a.id === inspectReactionsAnnouncement.id) || inspectReactionsAnnouncement;
        const reactionsMap = liveAnnouncement.reactions || {};
        const liveViewers = liveAnnouncement.viewers || [];

        // Flatten all reacting members with their emoji (matching by id, fullName, or uniqueCode, with graceful fallback)
        const allReactingMembers: Array<{ member: Registrant; emoji: string }> = [];
        Object.entries(reactionsMap).forEach(([emoji, memberIds]) => {
          if (!Array.isArray(memberIds)) return;
          memberIds.forEach(mId => {
            const member =
              registrants.find(r => r.id === mId || r.fullName === mId || r.uniqueCode === mId) ||
              (() => {
                const fromViewer = liveViewers.find(v => v.memberId === mId || v.memberName === mId);
                return {
                  id: String(mId),
                  fullName: fromViewer?.memberName || String(mId),
                  uniqueCode: '—',
                  phone: '',
                  whatsapp: '',
                  dob: '',
                  gender: fromViewer?.gender || 'male',
                  photoUrl: fromViewer?.photoUrl || '',
                  qrData: '',
                  registeredAt: '',
                  role: 'member' as UserRole,
                  status: 'active' as const
                };
              })();
            allReactingMembers.push({ member, emoji });
          });
        });

        // Filter by selected tab
        const filteredList = reactionFilterTab === 'all'
          ? allReactingMembers
          : allReactingMembers.filter(item => item.emoji === reactionFilterTab);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 my-auto space-y-4">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-lg shadow-xs">
                    {inspectModalTab === 'viewers' ? '👁️' : '❤️'}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>{inspectModalTab === 'viewers' ? 'من شاهدوا الإعلان' : 'تفاعلات الشباب على الإعلان'}</span>
                      <span className="text-xs font-mono font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                        {inspectModalTab === 'viewers' ? `${liveViewers.length} مشاهدة` : `${allReactingMembers.length} تفاعل`}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {inspectModalTab === 'viewers'
                        ? 'كشف الأعضاء الذين فتحوا وشاهدوا الإعلان حتى لو لم يتفاعلوا'
                        : 'قائمة المخدومين المتفاعلين مع الإعلان بنظام الواتساب'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setInspectReactionsAnnouncement(null);
                    setReactionFilterTab('all');
                  }}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Switcher: Reactions vs Viewers */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setInspectModalTab('reactions')}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                    inspectModalTab === 'reactions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>المتفاعلون ❤️</span>
                  <span className="text-[10px] bg-slate-200 px-2 py-0.2 rounded-full font-mono font-bold">
                    {allReactingMembers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setInspectModalTab('viewers')}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                    inspectModalTab === 'viewers'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>الشافوا الإعلان 👁️</span>
                  <span className="text-[10px] bg-slate-200 px-2 py-0.2 rounded-full font-mono font-bold">
                    {liveViewers.length}
                  </span>
                </button>
              </div>

              {inspectModalTab === 'reactions' ? (
                <>
                  {/* WhatsApp Filter Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setReactionFilterTab('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                        reactionFilterTab === 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>الكل</span>
                      <span className="font-mono text-[11px] font-black">{allReactingMembers.length}</span>
                    </button>

                    {Object.entries(reactionsMap).map(([emoji, memberIds]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setReactionFilterTab(emoji)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                          reactionFilterTab === emoji
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span className="text-sm">{emoji}</span>
                        <span className="font-mono text-[11px] font-black">{memberIds.length}</span>
                      </button>
                    ))}
                  </div>

                  {/* Members Reactions List (WhatsApp style) */}
                  <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {filteredList.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        لا توجد تفاعلات في هذا القسم
                      </div>
                    ) : (
                      filteredList.map(({ member, emoji }, idx) => {
                        const twoPartName = member.fullName.trim().split(/\s+/).slice(0, 2).join(' ') || member.fullName;

                        return (
                          <div 
                            key={`${member.id}_${emoji}_${idx}`} 
                            className="pt-2.5 pb-2 flex items-center justify-between gap-3 text-right hover:bg-slate-50/80 px-2 rounded-2xl transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border-2 border-emerald-500 shadow-xs flex items-center justify-center">
                                  {member.photoUrl && member.photoUrl.trim() !== '' ? (
                                    <img 
                                      src={member.photoUrl} 
                                      alt={member.fullName} 
                                      className="w-full h-full object-cover" 
                                    />
                                  ) : (
                                    <span className="text-sm font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                                  )}
                                </div>
                                <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-xs">
                                  {emoji}
                                </span>
                              </div>

                              <div className="truncate text-right">
                                <h4 className="text-sm font-black text-slate-900 truncate">
                                  {twoPartName}
                                </h4>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                                  <span>كود: {member.uniqueCode}</span>
                                  <span>•</span>
                                  <span dir="ltr">{member.phone}</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5">
                              <span className="text-2xl">{emoji}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                /* Viewers Tab (من شاهدوا الإعلان حتى لو ما اتفاعلو) */
                <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {liveViewers.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                      <div className="text-2xl mb-1">👁️</div>
                      <p className="font-bold text-slate-600">لا توجد مشاهدات مسجلة بعد لهذا الإعلان</p>
                      <p className="text-[11px] text-slate-400">ستظهر هنا أسماء وصور كل من يفتح الإعلان في حسابه.</p>
                    </div>
                  ) : (
                    liveViewers.map((viewer, idx) => {
                      const matchedMember = registrants.find(r => r.id === viewer.memberId || r.fullName === viewer.memberName);
                      const displayName = matchedMember?.fullName || viewer.memberName || 'مخدوم';
                      const twoPartName = displayName.trim().split(/\s+/).slice(0, 2).join(' ') || displayName;
                      const photo = matchedMember?.photoUrl || viewer.photoUrl;
                      const timeStr = viewer.viewedAt 
                        ? new Date(viewer.viewedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      // Check if viewer reacted
                      let reactedEmoji: string | null = null;
                      Object.entries(reactionsMap).forEach(([e, ids]) => {
                        if (Array.isArray(ids) && (ids.includes(viewer.memberId) || (viewer.memberName && ids.includes(viewer.memberName)))) {
                          reactedEmoji = e;
                        }
                      });

                      return (
                        <div
                          key={`${viewer.memberId}_${idx}`}
                          className="pt-2.5 pb-2 flex items-center justify-between gap-3 text-right hover:bg-slate-50/80 px-2 rounded-2xl transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border-2 border-indigo-400 shadow-xs flex items-center justify-center">
                                {photo && photo.trim() !== '' ? (
                                  <img src={photo} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-sm font-bold text-slate-400">{(displayName || '?').charAt(0)}</span>
                                )}
                              </div>
                              {reactedEmoji && (
                                <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-xs">
                                  {reactedEmoji}
                                </span>
                              )}
                            </div>

                            <div className="truncate text-right">
                              <h4 className="text-sm font-black text-slate-900 truncate">
                                {twoPartName}
                              </h4>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                                <span>كود: {matchedMember?.uniqueCode || '—'}</span>
                                {timeStr && (
                                  <>
                                    <span>•</span>
                                    <span>شاهد: {timeStr}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {reactedEmoji ? (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-1">
                                <span>متفاعل</span>
                                <span>{reactedEmoji}</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-slate-400" />
                                <span>شاهد فقط</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Close Button */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">
                  {inspectModalTab === 'viewers'
                    ? `إجمالي المشاهدات: ${liveViewers.length}`
                    : `إجمالي المتفاعلين: ${allReactingMembers.length}`}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setInspectReactionsAnnouncement(null);
                    setReactionFilterTab('all');
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Full-Screen Zoomed Image Lightbox */}
      {zoomedImageUrl && (
        <div 
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setZoomedImageUrl(null)}
            className="fixed top-5 left-5 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedImageUrl}
            alt="صورة الإعلان مكبرة"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/15 cursor-default"
          />
        </div>
      )}

    </div>
  );
};
