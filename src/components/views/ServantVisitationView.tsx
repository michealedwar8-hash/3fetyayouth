import React, { useState, useMemo } from 'react';
import { Registrant, UserRole, VisitationNote } from '../../types';
import { storageService, formatServantDisplayName } from '../../services/storageService';
import { WhatsAppSelectorModal } from '../WhatsAppSelectorModal';
import { 
  HeartHandshake, 
  Search, 
  CheckCircle2, 
  Circle, 
  Phone, 
  MessageCircle, 
  MapPin, 
  FileText, 
  Shuffle, 
  Calendar, 
  User, 
  Clock, 
  Sparkles,
  ChevronLeft,
  X,
  Check,
  Plus,
  CheckSquare,
  Square,
  Lock
} from 'lucide-react';

interface ServantVisitationViewProps {
  currentServantName: string;
  currentServantRole: UserRole;
  currentServantGender?: 'male' | 'female';
  registrants: Registrant[];
  onRefresh: () => void;
}

export const ServantVisitationView: React.FC<ServantVisitationViewProps> = ({
  currentServantName,
  currentServantRole,
  currentServantGender,
  registrants,
  onRefresh
}) => {
  // Special assignments designated for this servant
  const mySpecialAssignments = useMemo(() => {
    const allAssignments = storageService.getSpecialAssignments();
    return allAssignments.filter(a => 
      a.servantName === currentServantName || 
      (a.servantId && registrants.some(r => r.id === a.servantId && r.fullName === currentServantName))
    );
  }, [currentServantName, registrants]);

  const [visitationMode, setVisitationMode] = useState<'special' | 'general' | 'random_batch'>(() => {
    return storageService.getActiveVisitationMode();
  });

  // Real-time synchronization for community visitation mode
  React.useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setVisitationMode(storageService.getActiveVisitationMode());
    });
    return () => unsub();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteMember, setSelectedNoteMember] = useState<Registrant | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  
  const isResponsibleLeader = 
    currentServantRole === 'priest' ||
    currentServantRole === 'meeting_secretary' || 
    currentServantRole === 'community_manager' || 
    currentServantRole === 'community_owner' ||
    currentServantRole === 'service_secretary';

  // WhatsApp modal state
  const [whatsAppModalData, setWhatsAppModalData] = useState<{ phone: string; name: string } | null>(null);

  // Random batch state stored in local storage
  const RANDOM_BATCH_KEY = `three_youths_servant_batch_${currentServantName.replace(/\s+/g, '_')}`;
  const [randomBatchIds, setRandomBatchIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RANDOM_BATCH_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Resolve servant gender:
  // 1. Explicit prop
  // 2. Or matched registrant by name
  // 3. Defaults to male
  const servantGender: 'male' | 'female' = useMemo(() => {
    if (currentServantGender) return currentServantGender;
    const match = registrants.find(r => r.fullName === currentServantName || (r.phone && r.fullName.includes(currentServantName)));
    if (match?.gender) return match.gender;
    return 'male';
  }, [currentServantGender, registrants, currentServantName]);

  // Strict User Requirement:
  // "يظهر فيها كل المخدومين من جنسه فقط"
  // (Filter members exclusively to the servant's same gender)
  const sameGenderMembers = useMemo(() => {
    return registrants.filter(r => {
      if (!r || r.status === 'cancelled' || r.status === 'blocked') return false;
      const mGender = r.gender || 'male';
      return mGender === servantGender;
    });
  }, [registrants, servantGender]);

  // Filtered members in general mode
  const filteredGeneralMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sameGenderMembers.filter(m => {
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        (m.uniqueCode && m.uniqueCode.toLowerCase().includes(q)) ||
        (m.address && m.address.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    });
  }, [sameGenderMembers, searchQuery]);

  // Generate / regenerate random batch (e.g. 7 youth to follow up with)
  const handleGenerateRandomBatch = () => {
    if (sameGenderMembers.length === 0) return;
    const shuffled = [...sameGenderMembers].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(7, sameGenderMembers.length)).map(m => m.id);
    setRandomBatchIds(selected);
    try {
      localStorage.setItem(RANDOM_BATCH_KEY, JSON.stringify(selected));
    } catch {}
  };

  // If random batch is empty, generate initial one
  React.useEffect(() => {
    if (randomBatchIds.length === 0 && sameGenderMembers.length > 0) {
      handleGenerateRandomBatch();
    }
  }, [sameGenderMembers]);

  // Members in the random batch
  const randomBatchMembers = useMemo(() => {
    const batchSet = new Set(randomBatchIds);
    return sameGenderMembers.filter(m => batchSet.has(m.id));
  }, [sameGenderMembers, randomBatchIds]);

  // Toggle visited checkmark
  const handleToggleVisited = (member: Registrant) => {
    const isCurrentlyVisited = Boolean(member.isVisitedGeneral);
    const updatedMember: Registrant = {
      ...member,
      isVisitedGeneral: !isCurrentlyVisited,
      lastVisitedAt: !isCurrentlyVisited ? new Date().toISOString() : undefined,
      lastVisitedBy: !isCurrentlyVisited ? formatServantDisplayName(currentServantName, currentServantRole) : undefined
    };
    storageService.updateRegistrant(updatedMember, currentServantRole);
    onRefresh();
  };

  // Add pastoral note
  const handleAddNote = () => {
    if (!selectedNoteMember || !newNoteText.trim()) return;
    storageService.addVisitationNote({
      memberId: selectedNoteMember.id,
      memberName: selectedNoteMember.fullName,
      authorName: formatServantDisplayName(currentServantName, currentServantRole),
      authorRole: currentServantRole,
      notes: newNoteText.trim()
    });
    setNewNoteText('');
    onRefresh();
  };

  const cairoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const todayDateStr = `${cairoNow.getDate()}/${cairoNow.getMonth() + 1}/${cairoNow.getFullYear()}`;

  const currentDisplayList = visitationMode === 'general' ? filteredGeneralMembers : randomBatchMembers;
  const visitedCount = currentDisplayList.filter(m => m.isVisitedGeneral).length;

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-emerald-600/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-3xl border border-white/20 shadow-inner">
              <HeartHandshake className="w-8 h-8 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">داشبورد الافتقاد الرعوي</h2>
                <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-400/30">
                  {servantGender === 'male' ? 'مخدومي الاجتماع (شباب 👦)' : 'مخدومات الاجتماع (بنات 👧)'}
                </span>
              </div>
              <p className="text-xs text-emerald-200/90 font-medium mt-1">
                مرحباً {formatServantDisplayName(currentServantName, currentServantRole)} • يمكنك متابعة الافتقاد الميداني والتواصل المباشر مع مخدوميك وتسجيل الزيارات لحظياً.
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-black/20 p-2 rounded-2xl border border-white/10 text-xs">
            <div className="px-3 py-1 text-center border-l border-white/10">
              <span className="block text-slate-300 text-[10px]">إجمالي المخدومين</span>
              <strong className="text-sm font-mono font-black text-white">{sameGenderMembers.length}</strong>
            </div>
            <div className="px-3 py-1 text-center">
              <span className="block text-emerald-300 text-[10px]">المفتقدين</span>
              <strong className="text-sm font-mono font-black text-emerald-400">{visitedCount}</strong>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-2xl flex-wrap">
            {mySpecialAssignments.length > 0 && (
              <button
                type="button"
                onClick={() => setVisitationMode('special')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  visitationMode === 'special'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-purple-200 hover:text-white bg-purple-900/40'
                }`}
              >
                <Sparkles className="w-4 h-4 text-purple-300" />
                <span>الافتقاد الخاص الموجه لي 🎯 ({mySpecialAssignments.reduce((acc, a) => acc + (a.assignedMemberIds?.length || 0), 0)})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setVisitationMode('general')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                visitationMode === 'general'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <HeartHandshake className="w-4 h-4" />
              <span>الافتقاد العام ({sameGenderMembers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setVisitationMode('random_batch')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                visitationMode === 'random_batch'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>قرعة المتابعة الدورية ({randomBatchMembers.length})</span>
            </button>
          </div>

          {visitationMode === 'random_batch' && (
            <button
              type="button"
              onClick={handleGenerateRandomBatch}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>إعادة اختيار مجموعة جديدة 🎲</span>
            </button>
          )}

          {visitationMode === 'general' && (
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="بحث بالاسم، الكود، الهاتف، العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-xl bg-white/10 text-white placeholder-emerald-200/60 border border-white/20 py-2 pr-8 pl-3 focus:outline-hidden focus:bg-white/20"
              />
              <Search className="w-4 h-4 text-emerald-200/60 absolute right-2.5 top-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* SPECIAL ASSIGNMENTS VIEW (الافتقاد الخاص الموجه لي) */}
      {visitationMode === 'special' && (
        <div className="space-y-6">
          {mySpecialAssignments.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200 shadow-xs">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-30 text-purple-600" />
              <h3 className="text-base font-bold text-slate-700">لا توجد تكليفات افتقاد خاص موجهة لك حالياً</h3>
              <p className="text-xs text-slate-400 mt-1">
                يقوم أمين الاجتماع أو إدارة المجتمع بتكليفك بمجموعة مخدومين بصورة دورية عشوائية للمتابعة الخاصة.
              </p>
            </div>
          ) : (
            mySpecialAssignments.map((assignment) => {
              const assignedYouths = registrants.filter(r => (assignment.assignedMemberIds || []).includes(r.id));
              const now = Date.now();
              const end = new Date(assignment.endDate).getTime();
              const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
              const isExpired = diffDays <= 0;
              const completedIds = assignment.completedMemberIds || [];
              const completedCount = assignedYouths.filter(y => completedIds.includes(y.id)).length;
              const progressPercent = assignedYouths.length > 0 ? Math.round((completedCount / assignedYouths.length) * 100) : 0;

              return (
                <div key={assignment.id} className="bg-white rounded-3xl p-6 border border-purple-200 shadow-sm space-y-5">
                  {/* Assignment Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-purple-100 text-purple-900 font-black px-3 py-1 rounded-full border border-purple-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          <span>تكليف الافتقاد الخاص الدوري الموجه لك</span>
                        </span>
                        {isExpired ? (
                          <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-0.5 rounded-full">
                            انتهت الفترة (يمكنك التدوير لمخدومين جدد)
                          </span>
                        ) : (
                          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>متبقي {diffDays} يوم في الفترة</span>
                          </span>
                        )}
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          completedCount === assignedYouths.length && assignedYouths.length > 0
                            ? 'bg-emerald-500 text-white'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          اكتمل {completedCount} من {assignedYouths.length} ({progressPercent}%)
                        </span>
                      </div>

                      <h3 className="text-base font-black text-slate-900 mt-2">
                        مخدوموك المخصصون لهذه الفترة ({assignedYouths.length} شباب)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        تواصل معهم وضع علامة صح في مربع التصحيح عند افتقادهم، وسيتم حفظ الملاحظات لمسؤولي الاجتماع فقط 🔒.
                      </p>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden max-w-md">
                        <div 
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Rotate Button */}
                    <button
                      type="button"
                      onClick={() => {
                        storageService.rotateSpecialAssignment(assignment.id);
                        onRefresh();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs flex items-center gap-1.5 transition border border-purple-200 cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                      title="تدوير واختيار مخدومين جدد مختلفين عشوائياً"
                    >
                      <Shuffle className="w-4 h-4 text-purple-600" />
                      <span>تدوير عشوائي (مخدومين مختلفين) 🎲</span>
                    </button>
                  </div>

                  {/* Youths Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignedYouths.map((youth) => {
                      const isCompleted = completedIds.includes(youth.id);

                      return (
                        <div
                          key={youth.id}
                          className={`p-4 rounded-2xl border transition duration-200 flex flex-col justify-between gap-3 ${
                            isCompleted
                              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
                              : 'bg-slate-50/90 border-slate-200 hover:bg-white hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-14 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200 flex items-center justify-center">
                              {youth.photoUrl && youth.photoUrl.trim() !== '' ? (
                                <img src={youth.photoUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-slate-400">{(youth.fullName || '?').charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono text-[10px] text-slate-400 font-bold">
                                  {youth.uniqueCode}
                                </span>
                                {isCompleted && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                                    تم الافتقاد ✓
                                  </span>
                                )}
                              </div>
                              <h4 className="text-sm font-black text-slate-900 truncate mt-0.5">
                                {youth.fullName}
                              </h4>
                              <p className="text-xs font-mono text-slate-600 mt-0.5" dir="ltr">
                                {youth.phone}
                              </p>
                            </div>
                          </div>

                          {/* Actions Row: Check-off box, Call, WhatsApp, Notes */}
                          <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2 flex-wrap">
                            {/* مربع التصحيح: إذا افتقده يعمل صح */}
                            <button
                              type="button"
                              onClick={() => {
                                storageService.toggleSpecialAssignmentMemberVisited(assignment.id, youth.id, currentServantName);
                                onRefresh();
                              }}
                              className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 cursor-pointer text-xs font-bold ${
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

                            <div className="flex items-center gap-1.5">
                              {/* اتصال هاتفي */}
                              <a
                                href={`tel:${youth.phone.replace(/\s+/g, '')}`}
                                className="p-2 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 transition flex items-center gap-1 text-xs font-bold shadow-2xs"
                                title="اتصال هاتفي مباشر"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">اتصال</span>
                              </a>

                              {/* واتساب */}
                              <button
                                type="button"
                                onClick={() => setWhatsAppModalData({ phone: youth.whatsapp || youth.phone, name: youth.fullName })}
                                className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1 text-xs font-bold shadow-2xs cursor-pointer"
                                title="محادثة واتساب"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">واتساب</span>
                              </button>

                              {/* إرسال ملاحظات */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedNoteMember(youth);
                                  setNewNoteText('');
                                }}
                                className="p-2 rounded-xl bg-purple-100 text-purple-800 hover:bg-purple-200 transition flex items-center gap-1 text-xs font-bold cursor-pointer shadow-2xs"
                                title="إرسال ملاحظات خاصة للمسؤولين الكبار 🔒"
                              >
                                <FileText className="w-3.5 h-3.5 text-purple-700" />
                                <span className="hidden sm:inline">ملاحظات 🔒</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Main Members Cards Grid (الافتقاد العام وقرعة المتابعة) */}
      {visitationMode !== 'special' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentDisplayList.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
            <HeartHandshake className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <h3 className="text-base font-bold text-slate-700">لا يوجد مخدومين في هذه القائمة حالياً</h3>
            <p className="text-xs text-slate-400 mt-1">تأكد من شروط البحث أو قم بإعادة القرعة</p>
          </div>
        ) : (
          currentDisplayList.map((member) => {
            const isVisited = Boolean(member.isVisitedGeneral);
            const notes = storageService.getVisitationNotes(member.id);

            return (
              <div 
                key={member.id} 
                className={`bg-white rounded-3xl p-4.5 border transition duration-200 shadow-xs flex flex-col justify-between ${
                  isVisited 
                    ? 'border-emerald-300 ring-2 ring-emerald-500/20 bg-emerald-50/20' 
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Row: Avatar & Info */}
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      {member.photoUrl && member.photoUrl.trim() !== '' ? (
                        <img 
                          src={member.photoUrl} 
                          alt={member.fullName}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <span className="text-base font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] text-slate-400 font-bold">
                          {member.uniqueCode}
                        </span>
                        {isVisited ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                            <Check className="w-3 h-3" />
                            <span>تم الافتقاد ✓</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                            <span>لم يُفتقد بعد</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-black text-slate-900 truncate mt-0.5">
                        {member.fullName}
                      </h3>

                      <p className="text-xs font-mono text-slate-600 mt-0.5" dir="ltr">
                        {member.phone}
                      </p>
                    </div>
                  </div>

                  {/* Middle Details: Address & Notes */}
                  <div className="mt-3.5 space-y-1.5 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{member.address || <span className="text-slate-400 italic">العنوان غير محدد</span>}</span>
                    </div>

                    {member.notes && (
                      <div className="flex items-start gap-1.5 text-[11px] text-slate-600">
                        <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{member.notes}</span>
                      </div>
                    )}

                    {isVisited && member.lastVisitedBy && (
                      <div className="pt-1 text-[10px] text-emerald-700 flex items-center justify-between border-t border-emerald-100">
                        <span>مفتقد بواسطة: <strong>{member.lastVisitedBy}</strong></span>
                        <span>{member.lastVisitedAt ? new Date(member.lastVisitedAt).toLocaleDateString('ar-EG') : todayDateStr}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions: Call, WhatsApp, Notes & Visit Checkmark */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {/* Direct Call */}
                    <a
                      href={`tel:${member.phone.replace(/\s+/g, '')}`}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                      title="اتصال هاتفي مباشر"
                    >
                      <Phone className="w-4 h-4" />
                    </a>

                    {/* WhatsApp & WhatsApp Business Selector Modal */}
                    <button
                      type="button"
                      onClick={() => setWhatsAppModalData({ phone: member.whatsapp || member.phone, name: member.fullName })}
                      className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                      title="مراسلة عبر واتساب أو واتساب للأعمال"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>

                    {/* View / Add Notes */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteMember(member);
                        setNewNoteText('');
                      }}
                      className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer relative"
                      title="ملاحظات الافتقاد الرعوي"
                    >
                      <FileText className="w-4 h-4" />
                      {notes.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-600 text-white font-bold text-[9px] flex items-center justify-center">
                          {notes.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Big Toggle Visited Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleVisited(member)}
                    className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                      isVisited
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
                    }`}
                  >
                    {isVisited ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>افتُقد اليوم ✓</span>
                      </>
                    ) : (
                      <>
                        <Circle className="w-4 h-4" />
                        <span>تسجيل افتقاد</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* WhatsApp & WhatsApp Business Selector Modal */}
      {whatsAppModalData && (
        <WhatsAppSelectorModal
          isOpen={Boolean(whatsAppModalData)}
          onClose={() => setWhatsAppModalData(null)}
          phoneNumber={whatsAppModalData.phone}
          recipientName={whatsAppModalData.name}
          defaultMessage={`سلام ونعمة يا ${whatsAppModalData.name.split(' ')[0]} 🕊️، بطمن عليك من خدمة الثلاثة فتية... منتظرينك في الاجتماع! ❤️✨`}
        />
      )}

      {/* Pastoral Notes Modal */}
      {selectedNoteMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">ملاحظات افتقاد المخدوم</h3>
                  <p className="text-xs text-slate-500 font-medium">{selectedNoteMember.fullName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNoteMember(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              {/* Add Note Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  إضافة ملاحظة افتقاد جديدة:
                </label>
                <textarea
                  rows={2}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="اكتب ملاحظات الزيارة أو الاتصال أو حالة المخدوم..."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:outline-hidden focus:border-emerald-500 resize-none"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={!newNoteText.trim()}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>حفظ الملاحظة الرعوية</span>
                </button>
              </div>

              {/* Existing Notes List - Strictly visible to Senior Leaders Only */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-purple-600" />
                    <span>سجل الملاحظات الرعوية</span>
                  </h4>
                  <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                    {isResponsibleLeader ? 'خاص بالمسؤولين الكبار 🔒' : 'سرية ومحمية 🔒'}
                  </span>
                </div>

                {isResponsibleLeader ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {storageService.getVisitationNotes(selectedNoteMember.id).length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">لا توجد ملاحظات سابقة مسجلة لهذا المخدوم.</p>
                    ) : (
                      storageService.getVisitationNotes(selectedNoteMember.id).map(n => (
                        <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                          <p className="leading-relaxed">{n.notes}</p>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                            <span>بواسطة: {n.authorName}</span>
                            <span>{new Date(n.createdAt).toLocaleDateString('ar-EG')}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>ملاحظات المتابعة الرعوية مخصصة للمسؤولين الكبار فقط</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      أي ملاحظة تكتبها الآن يتم حفظها بسرية وتصل مباشرة لأمين الاجتماع وأبونا وإدارة المجتمع للمتابعة الرعوية الخاصة.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNoteMember(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
