import React, { useState, useMemo, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Registrant, UserRole } from '../../types';
import { storageService } from '../../services/storageService';
import { oneSignalService } from '../../services/oneSignalService';
import { 
  Cake, 
  Sparkles, 
  Calendar, 
  Clock, 
  MessageCircle, 
  Phone, 
  History, 
  Gift,
  Heart,
  Users,
  ShieldCheck,
  Star,
  CheckCircle2,
  Crown
} from 'lucide-react';

interface BirthdaysViewProps {
  registrants: Registrant[];
  currentUserRole?: UserRole;
  currentUserGender?: 'male' | 'female';
}

export const BirthdaysView: React.FC<BirthdaysViewProps> = ({ 
  registrants,
  currentUserRole = 'community_owner',
  currentUserGender = 'male'
}) => {
  const isServantRole = currentUserRole === 'servant';
  const isGenderRestrictedRole = currentUserRole === 'servant' || currentUserRole === 'service_secretary';

  // Main Category: 'servants' vs 'members' (Locked to 'members' for servant role so they only see same-gender makhdomeen birthdays)
  const [activeCategory, setActiveCategory] = useState<'servants' | 'members'>(
    isServantRole ? 'members' : 'servants'
  );
  const [activeGroup, setActiveGroup] = useState<'all' | 'today' | 'recent' | 'last'>('all');

  const isOfficialLeader = 
    !isGenderRestrictedRole && (
      currentUserRole === 'community_owner' || 
      currentUserRole === 'community_manager' || 
      currentUserRole === 'meeting_secretary' || 
      currentUserRole === 'priest'
    );

  const [genderFilter, setGenderFilter] = useState<'matched' | 'all' | 'male' | 'female'>('matched');

  // Automated System Tray Push Notifications check for today's birthdays
  useEffect(() => {
    oneSignalService.checkAndDispatchTodayBirthdayNotifications(registrants, {
      role: currentUserRole,
      gender: currentUserGender,
    });
  }, [registrants, currentUserRole, currentUserGender]);

  // 1. All Servants
  const allServants = useMemo(() => {
    const seen = new Set<string>();
    return registrants.filter((m) => {
      if (!m || !m.id || seen.has(m.id) || m.status === 'cancelled' || m.role === 'member') return false;
      if (isGenderRestrictedRole && (m.gender || 'male') !== currentUserGender) return false;
      seen.add(m.id);
      return true;
    });
  }, [registrants, isGenderRestrictedRole, currentUserGender]);

  // 2. Makhdomeen / Youth (Strictly locked to currentUserGender for servant & service_secretary)
  const filteredMakhdomeen = useMemo(() => {
    const seen = new Set<string>();
    return registrants.filter((m) => {
      if (!m || !m.id || seen.has(m.id) || m.status === 'cancelled' || m.role !== 'member') return false;
      seen.add(m.id);
      if (isGenderRestrictedRole) {
        return (m.gender || 'male') === currentUserGender;
      }
      if (genderFilter === 'matched') {
        return (m.gender || 'male') === currentUserGender;
      }
      if (genderFilter === 'male') {
        return (m.gender || 'male') === 'male';
      }
      if (genderFilter === 'female') {
        return (m.gender || 'male') === 'female';
      }
      return true;
    });
  }, [registrants, isGenderRestrictedRole, genderFilter, currentUserGender]);

  // Active dataset depending on category (Servant role strictly sees filteredMakhdomeen of their own gender)
  const effectiveCategory = isServantRole ? 'members' : activeCategory;
  const activeDataset = effectiveCategory === 'servants' ? allServants : filteredMakhdomeen;

  // Calculate the 3 Groups based on Cairo/Egypt timezone
  const { today, recent, last } = storageService.getBirthdayGroups(activeDataset);

  // Stats counters for quick tab badges
  const servantsGroups = useMemo(() => storageService.getBirthdayGroups(allServants), [allServants]);
  const makhdomeenGroups = useMemo(() => storageService.getBirthdayGroups(filteredMakhdomeen), [filteredMakhdomeen]);

  // Trigger confetti for today's birthdays on button click
  const triggerBirthdayCheer = () => {
    try {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch {
      // ignore
    }
  };

  const getRoleInfo = (role: UserRole, gender: 'male' | 'female') => {
    switch (role) {
      case 'priest':
        return { 
          title: 'أبونا الراعي الموقر', 
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
          icon: '✝️'
        };
      case 'community_owner':
        return { 
          title: 'مسؤول وصاحب المجتمع', 
          badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
          icon: '👑'
        };
      case 'community_manager':
        return { 
          title: 'مدير المجتمع', 
          badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          icon: '⭐'
        };
      case 'meeting_secretary':
        return { 
          title: 'أمين الاجتماع', 
          badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          icon: '📜'
        };
      case 'service_secretary':
        return { 
          title: 'أمين الخدمة', 
          badgeClass: 'bg-teal-100 text-teal-900 border-teal-300',
          icon: '📋'
        };
      case 'servant':
        return { 
          title: gender === 'female' ? 'خادمة بالاجتماع' : 'خادم بالاجتماع', 
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
          icon: gender === 'female' ? '👩' : '👨'
        };
      default:
        return { 
          title: 'مخدوم', 
          badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: '👤'
        };
    }
  };

  const getWhatsAppBirthdayLink = (whatsapp: string, fullName: string, role: UserRole, gender: 'male' | 'female') => {
    const clean = whatsapp.replace(/\D/g, '');
    const first = fullName.split(' ')[0];

    if (role !== 'member') {
      const roleTitle = getRoleInfo(role, gender).title;
      const text = encodeURIComponent(
        `🎉 كل سنة وحضرتك طيب وبألف خير وصحة يا ${roleTitle} ${fullName}! 🎂✨\nعيد ميلاد سعيد ومبارك، ربنا يبارك خدمتك وتعب محبتك ويديم أثمارك في حقل الرب ويفرح قلبك بكل بركة سماوية. 🕊️✝️\n\nمحبتنا الخالصة من جميع إخوتك في أسرة خدمة اجتماع الثلاثة فتية القديسين 🤍`
      );
      return `https://wa.me/${clean}?text=${text}`;
    }

    const text = encodeURIComponent(
      `🎉 كل سنة وأنت طيب وبألف خير وصحة يا ${first}! 🎂\nعيد ميلاد سعيد ونتمنى لك سنة مباركة مليانة سلام وفرح مع ربنا يسوع المسيح. 🕊️✨\n\nمحبتنا من أسرة اجتماع الثلاثة فتية - الشباب السوداني ✝️`
    );
    return `https://wa.me/${clean}?text=${text}`;
  };

  const getTelLink = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    return `tel:${clean.startsWith('+') ? clean : '+' + clean}`;
  };

  const calculateAge = (dob: string) => {
    const birthYear = parseInt(dob.split('-')[0], 10);
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-xs mb-2">
            <Cake className="w-3.5 h-3.5 text-amber-300" />
            <span>نظام أعياد الميلاد الرعوي (بتوقيت مصر العالمي)</span>
          </div>
          <h2 className="text-2xl font-black text-white">
            {effectiveCategory === 'servants' 
              ? 'أعياد ميلاد أسرة الخدام والخادمات ✝️' 
              : 'أعياد ميلاد المخدومين 🎂'}
          </h2>
          <p className="text-xs text-emerald-100 mt-1 max-w-xl">
            {effectiveCategory === 'servants'
              ? 'يظهر هنا الخدام والخادمات معاً ذكوراً وإناثاً للاحتفال بأعياد ميلاد بعضهم البعض لكافة الرتب لمشاركة المحبة والتهنئة الأخوية.'
              : 'يتم فحص تواريخ الميلاد تلقائياً ومطابقتها بتوقيت القاهرة الحالي وتقسيمها إلى 3 مجموعات لمعايدتهم دون نسيان أي أحد.'}
          </p>
        </div>

        {today.length > 0 && (
          <button
            type="button"
            onClick={triggerBirthdayCheer}
            className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md shadow-amber-400/30 transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-900" />
            <span>احتفال بمواليد اليوم! 🎉</span>
          </button>
        )}
      </div>

      {/* Primary Category Switcher (Hidden for servant so they only see their same-gender makhdomeen birthdays) */}
      {!isServantRole && (
        <div className="bg-white p-2 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Tab 1: Servants */}
            <button
              type="button"
              onClick={() => {
                setActiveCategory('servants');
                setActiveGroup('all');
              }}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                effectiveCategory === 'servants'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>✝️ أعياد ميلاد أسرة الخدام والخادمات</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                effectiveCategory === 'servants' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
              }`}>
                ({allServants.length})
              </span>
              {servantsGroups.today.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            {/* Tab 2: Makhdomeen */}
            <button
              type="button"
              onClick={() => {
                setActiveCategory('members');
                setActiveGroup('all');
              }}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                effectiveCategory === 'members'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>👥 أعياد ميلاد المخدومين</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                effectiveCategory === 'members' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}>
                ({filteredMakhdomeen.length})
              </span>
              {makhdomeenGroups.today.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Info pill about current display rule */}
          <div className="text-[11px] text-slate-500 font-bold px-2 text-center sm:text-left">
            {effectiveCategory === 'servants' ? (
              <span className="text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full inline-block">
                ✨ مخصص للخدام: يظهر الخدام والخادمات معاً لكافة الرتب
              </span>
            ) : (
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full inline-block">
                🛡️ مخصص للمخدومين: مفعل بحسب مطابقة نوع الخدمة ({currentUserGender === 'female' ? 'مخدومات إناث' : 'مخدومين ذكور'})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Category Specific Explanatory Banner */}
      {effectiveCategory === 'servants' ? (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50/50 to-white p-4 rounded-2xl border border-purple-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              ✝️
            </div>
            <div>
              <span className="font-black text-purple-950 block text-sm">
                أسرة الخدام والخادمات الواحدة
              </span>
              <span className="text-purple-700 text-[11px]">
                الخدام والخادمات هم الوحيدون الذين تظهر أعياد ميلادهم لبعضهم البعض معاً (ذكور وإناث من آباء كهنة ومسؤولين وأمناء وخدام) لمشاركة الفرح والمحبة الأخوية.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-white text-purple-900 border border-purple-200 px-3 py-1 rounded-xl font-black text-[11px] shadow-2xs">
              إجمالي الخدام المسجلين: {allServants.length}
            </span>
          </div>
        </div>
      ) : (
        /* Gender Matching Pastoral Banner for Makhdomeen */
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${
              currentUserGender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {currentUserGender === 'female' ? '👩' : '👨'}
            </div>
            <div>
              <span className="font-black text-slate-800 block">
                نظام الافتقاد ومطابقة الخدمة للمخدومين بحسب النوع:
              </span>
              <span className="text-slate-500 text-[11px]">
                {currentUserGender === 'female' 
                  ? 'عرض أعياد ميلاد المخدومات الشابات (إناث) للخادمات 👩' 
                  : 'عرض أعياد ميلاد المخدومين الشباب (ذكور) للخدام 👨'}
              </span>
            </div>
          </div>

          {isOfficialLeader && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setGenderFilter('matched')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  genderFilter === 'matched' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                مطابقة لخدمتي ({currentUserGender === 'female' ? 'إناث' : 'ذكور'})
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  genderFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                كافة المخدومين ({registrants.filter(r => r.status !== 'cancelled' && r.role === 'member').length})
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter('male')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  genderFilter === 'male' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                ذكور فقط
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter('female')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  genderFilter === 'female' ? 'bg-pink-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                إناث فقط
              </button>
            </div>
          )}
        </div>
      )}

      {/* Group Stats Quick Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Group 1: Today */}
        <button
          onClick={() => setActiveGroup('today')}
          className={`p-4 rounded-3xl border text-right transition-all flex items-center justify-between cursor-pointer ${
            activeGroup === 'today' 
              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-400' 
              : 'bg-white border-slate-200/80 hover:border-amber-300 shadow-2xs'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
              <span>🎂 أعياد ميلاد اليوم (Today)</span>
            </div>
            <div className="text-2xl font-black">
              {today.length} <span className="text-xs font-medium">أعياد ميلاد</span>
            </div>
          </div>
          <span className="text-2xl">🎉</span>
        </button>

        {/* Group 2: Recent (Upcoming 7 Days) */}
        <button
          onClick={() => setActiveGroup('recent')}
          className={`p-4 rounded-3xl border text-right transition-all flex items-center justify-between cursor-pointer ${
            activeGroup === 'recent' 
              ? activeCategory === 'servants'
                ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-400'
                : 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400' 
              : 'bg-white border-slate-200/80 hover:border-emerald-300 shadow-2xs'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
              <span>📅 القادمة خلال 7 أيام (Recent)</span>
            </div>
            <div className="text-2xl font-black">
              {recent.length} <span className="text-xs font-medium">قادم قريباً</span>
            </div>
          </div>
          <span className="text-2xl">⏳</span>
        </button>

        {/* Group 3: Last (Past 7 Days) */}
        <button
          onClick={() => setActiveGroup('last')}
          className={`p-4 rounded-3xl border text-right transition-all flex items-center justify-between cursor-pointer ${
            activeGroup === 'last' 
              ? 'bg-slate-800 text-white border-slate-800 shadow-md ring-2 ring-slate-600' 
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
              <span>🕰️ السابقة خلال 7 أيام (Last)</span>
            </div>
            <div className="text-2xl font-black">
              {last.length} <span className="text-xs font-medium">مضى في الأسبوع</span>
            </div>
          </div>
          <span className="text-2xl">💌</span>
        </button>
      </div>

      {/* Tab Filter Reset */}
      {activeGroup !== 'all' && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="font-bold text-slate-700">
            أنت تستعرض الآن: {activeGroup === 'today' ? 'أعياد ميلاد اليوم فقط' : activeGroup === 'recent' ? 'القادمة خلال 7 أيام' : 'السابقة خلال 7 أيام'}
          </span>
          <button
            onClick={() => setActiveGroup('all')}
            className="text-emerald-700 hover:underline font-bold cursor-pointer"
          >
            عرض كافة المجموعات الثلاث
          </button>
        </div>
      )}

      {/* ========================================================
          GROUP 1: TODAY (مواليد اليوم بتوقيت القاهرة)
          ======================================================== */}
      {(activeGroup === 'all' || activeGroup === 'today') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span className="text-xl">🎂</span>
              <span>المجموعة الأولى: أعياد ميلاد اليوم (Today - بتوقيت مصر العالمي)</span>
              <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {today.length} اليوم
              </span>
            </h3>
          </div>

          {today.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-slate-200/80">
              <Cake className="w-10 h-10 mx-auto mb-1 opacity-30 text-amber-500" />
              <p className="text-xs font-bold">لا يوجد أعياد ميلاد تصادف تاريخ اليوم بتوقيت القاهرة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {today.map((member) => {
                const roleInfo = getRoleInfo(member.role, member.gender);
                return (
                  <div 
                    key={member.id}
                    className="bg-gradient-to-r from-amber-50/80 via-white to-amber-100/40 rounded-3xl p-5 border-2 border-amber-400 shadow-md relative overflow-hidden flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-amber-400 shrink-0 shadow-xs flex items-center justify-center">
                        {member.photoUrl && member.photoUrl.trim() !== '' ? (
                          <img src={member.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                        )}
                      </div>

                      <div className="flex-1 text-right">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase">
                            🎉 اليوم عيد ميلاده!
                          </span>
                          <span className="text-xs font-bold text-amber-900">
                            العمر: {calculateAge(member.dob)} سنة
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1">
                          <h4 className="text-base font-black text-slate-900">
                            {member.fullName}
                          </h4>
                          {member.role !== 'member' && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${roleInfo.badgeClass}`}>
                              {roleInfo.icon} {roleInfo.title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                            {member.gender === 'female' ? 'أنثى 👩' : 'ذكر 👨'}
                          </span>
                          <span className="text-[11px] text-amber-800 font-bold">
                            تاريخ الميلاد: {member.dob}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 mt-1 font-mono" dir="ltr">
                          {member.phone}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-amber-200/80 flex items-center justify-between gap-2">
                      <a
                        href={getTelLink(member.phone)}
                        className="flex-1 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>اتصال</span>
                      </a>

                      <a
                        href={getWhatsAppBirthdayLink(member.whatsapp, member.fullName, member.role, member.gender)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-2 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>إرسال تهنئة فورية بالواتساب 🎂</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          GROUP 2: RECENT (القادمة في الـ 7 أيام القادمة)
          ======================================================== */}
      {(activeGroup === 'all' || activeGroup === 'recent') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span className="text-xl">📅</span>
              <span>المجموعة الثانية: أعياد الميلاد القادمة (Recent - خلال 7 أيام)</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                activeCategory === 'servants' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {recent.length} قادم
              </span>
            </h3>
          </div>

          {recent.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center text-slate-400 border border-slate-200/80">
              <Calendar className="w-8 h-8 mx-auto mb-1 opacity-30 text-emerald-500" />
              <p className="text-xs font-bold">لا توجد أعياد ميلاد قادمة في الأيام الـ 7 القادمة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {recent.map(({ member, daysUntil, targetDateStr }) => {
                const roleInfo = getRoleInfo(member.role, member.gender);
                return (
                  <div 
                    key={member.id}
                    className="bg-white rounded-3xl p-4 border border-slate-200/80 hover:border-emerald-300 hover:shadow-sm transition flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                        {member.photoUrl && member.photoUrl.trim() !== '' ? (
                          <img src={member.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                        )}
                      </div>

                      <div className="flex-1 text-right">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            activeCategory === 'servants' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {daysUntil === 1 ? 'غداً بمشيئة الرب!' : `بعد ${daysUntil} أيام (${targetDateStr})`}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            {member.gender === 'female' ? 'أنثى 👩' : 'ذكر 👨'}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 mt-1">
                          {member.fullName}
                        </h4>

                        {member.role !== 'member' && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${roleInfo.badgeClass}`}>
                            {roleInfo.icon} {roleInfo.title}
                          </span>
                        )}

                        <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                          {member.phone}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">
                        سيبلغ {calculateAge(member.dob)} عاماً
                      </span>

                      <div className="flex items-center gap-2">
                        <a
                          href={getTelLink(member.phone)}
                          className="text-slate-600 hover:text-blue-700 font-bold flex items-center gap-1 text-[11px]"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3 h-3 text-blue-600" />
                          <span>اتصال</span>
                        </a>

                        <a
                          href={getWhatsAppBirthdayLink(member.whatsapp, member.fullName, member.role, member.gender)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 text-[11px]"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>تجهيز تهنئة</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          GROUP 3: LAST (السابقة في آخر 7 أيام)
          ======================================================== */}
      {(activeGroup === 'all' || activeGroup === 'last') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span className="text-xl">🕰️</span>
              <span>المجموعة الثالثة: أعياد الميلاد السابقة (Last - آخر 7 أيام)</span>
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {last.length} مضى
              </span>
            </h3>
          </div>

          {last.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center text-slate-400 border border-slate-200/80">
              <History className="w-8 h-8 mx-auto mb-1 opacity-30 text-slate-400" />
              <p className="text-xs font-bold">لا يوجد أعياد ميلاد مضت خلال الأيام الـ 7 السابقة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {last.map(({ member, daysAgo, targetDateStr }) => {
                const roleInfo = getRoleInfo(member.role, member.gender);
                return (
                  <div 
                    key={member.id}
                    className="bg-white rounded-3xl p-4 border border-slate-200/80 hover:border-slate-300 transition flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                        {member.photoUrl && member.photoUrl.trim() !== '' ? (
                          <img src={member.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                        )}
                      </div>

                      <div className="flex-1 text-right">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full inline-block">
                            {daysAgo === 1 ? 'أمس' : `منذ ${daysAgo} أيام (${targetDateStr})`}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            {member.gender === 'female' ? 'أنثى 👩' : 'ذكر 👨'}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 mt-1">
                          {member.fullName}
                        </h4>

                        {member.role !== 'member' && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${roleInfo.badgeClass}`}>
                            {roleInfo.icon} {roleInfo.title}
                          </span>
                        )}

                        <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                          {member.phone}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">
                        تم {calculateAge(member.dob)} عاماً
                      </span>

                      <div className="flex items-center gap-2">
                        <a
                          href={getTelLink(member.phone)}
                          className="text-slate-600 hover:text-blue-700 font-bold flex items-center gap-1 text-[11px]"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3 h-3 text-blue-600" />
                          <span>اتصال</span>
                        </a>

                        <a
                          href={getWhatsAppBirthdayLink(member.whatsapp, member.fullName, member.role, member.gender)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 hover:text-emerald-700 font-bold flex items-center gap-1 text-[11px]"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>معايدة متأخرة</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
