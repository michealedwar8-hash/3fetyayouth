import React, { useState, useMemo } from 'react';
import { Registrant, UserRole } from '../../types';
import { 
  storageService, 
  getFridaysForMonth, 
  MonthFriday, 
  exportToCSV 
} from '../../services/storageService';
import { MeetingLogoStamp } from '../MeetingLogoStamp';
import { 
  Gift, 
  Sparkles, 
  CheckCircle2, 
  Calendar, 
  Search, 
  Download, 
  MessageCircle, 
  Phone, 
  User, 
  Award, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Clock, 
  Flame, 
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  XCircle,
  AlertTriangle
} from 'lucide-react';

interface AttendanceGiftsViewProps {
  registrants: Registrant[];
  onRefresh: () => void;
  currentUserRole?: UserRole;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const AttendanceGiftsView: React.FC<AttendanceGiftsViewProps> = ({
  registrants,
  onRefresh,
  currentUserRole
}) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(now.getMonth());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'qualified' | 'all' | 'delivered' | 'pending'>('qualified');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const monthKey = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;

  // Get dynamic Fridays for selected month
  const monthFridays = useMemo(() => {
    return getFridaysForMonth(selectedYear, selectedMonthIndex);
  }, [selectedYear, selectedMonthIndex]);

  // Delivered gifts map
  const [deliveredMap, setDeliveredMap] = useState<Record<string, boolean>>(() => {
    return storageService.getDeliveredGifts();
  });

  React.useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setDeliveredMap(storageService.getDeliveredGifts());
      onRefresh();
    });
    return unsub;
  }, [onRefresh]);

  const handleToggleDelivery = (registrantId: string) => {
    const isNowDelivered = storageService.toggleGiftDelivered(monthKey, registrantId);
    setDeliveredMap(prev => ({
      ...prev,
      [`${monthKey}_${registrantId}`]: isNowDelivered
    }));
  };

  const isDelivered = (registrantId: string) => {
    return !!deliveredMap[`${monthKey}_${registrantId}`];
  };

  // Evaluate each member's monthly attendance
  const membersMonthlyData = useMemo(() => {
    return registrants.map(member => {
      const attendance = storageService.getMemberMonthlyAttendance(
        member.id,
        selectedYear,
        selectedMonthIndex
      );
      const giftGiven = isDelivered(member.id);

      return {
        member,
        ...attendance,
        isGiftDelivered: giftGiven
      };
    });
  }, [registrants, selectedYear, selectedMonthIndex, deliveredMap]);

  // Filtered members
  const qualifiedMembers = useMemo(() => {
    return membersMonthlyData.filter(m => m.isCompletedAllFridays);
  }, [membersMonthlyData]);

  const nearlyQualifiedMembers = useMemo(() => {
    return membersMonthlyData.filter(m => !m.isCompletedAllFridays && m.attendedFridaysCount === monthFridays.length - 1 && monthFridays.length > 1);
  }, [membersMonthlyData, monthFridays]);

  const displayedMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const seenGiftMemberIds = new Set<string>();
    return membersMonthlyData.filter(item => {
      // Search check
      if (!item || !item.member || !item.member.id || seenGiftMemberIds.has(item.member.id)) return false;
      seenGiftMemberIds.add(item.member.id);
      const matchSearch = 
        (item.member.fullName || '').toLowerCase().includes(q) ||
        (item.member.uniqueCode || '').toLowerCase().includes(q) ||
        (item.member.phone || '').includes(q);

      if (!matchSearch) return false;

      // Tab check
      if (filterTab === 'qualified') return item.isCompletedAllFridays;
      if (filterTab === 'delivered') return item.isCompletedAllFridays && item.isGiftDelivered;
      if (filterTab === 'pending') return item.isCompletedAllFridays && !item.isGiftDelivered;
      return true; // 'all'
    });
  }, [membersMonthlyData, searchQuery, filterTab]);

  // Month navigation
  const handlePrevMonth = () => {
    if (selectedMonthIndex === 0) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonthIndex(11);
    } else {
      setSelectedMonthIndex(selectedMonthIndex - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonthIndex === 11) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonthIndex(0);
    } else {
      setSelectedMonthIndex(selectedMonthIndex + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonthIndex(now.getMonth());
  };

  const isOwner = currentUserRole === 'community_owner';

  // Admin Toggle Friday Stamp - restricted to Community Owner
  const handleToggleFridayStamp = (member: Registrant, friday: MonthFriday) => {
    if (!isOwner) return;
    storageService.toggleFridayStampOnly(member.id, friday.dateStr);
    onRefresh();
  };

  // Reset entire month stamps only (does not delete attendance log records)
  const handleResetCurrentMonth = () => {
    if (!isOwner) return;
    storageService.resetMonthlyStampsOnly(selectedYear, selectedMonthIndex);
    setShowResetConfirm(false);
    onRefresh();
  };

  // Reset single member's stamps for current month
  const handleResetMemberMonth = (registrantId: string) => {
    if (!isOwner) return;
    storageService.resetMemberMonthlyStampsOnly(registrantId, selectedYear, selectedMonthIndex);
    onRefresh();
  };

  // Export to CSV
  const handleExportCSV = () => {
    const rows = qualifiedMembers.map((item, idx) => ({
      '#': idx + 1,
      'الاسم بالكامل': item.member.fullName,
      'كود العضوية': item.member.uniqueCode,
      'رقم الهاتف': item.member.phone,
      'رقم الواتساب': item.member.whatsapp || item.member.phone,
      'الشهر': `${ARABIC_MONTHS[selectedMonthIndex]} ${selectedYear}`,
      'عدد الجمعات المحضورة': `${item.attendedFridaysCount} من ${monthFridays.length}`,
      'تواريخ الحضور': item.attendedDates.join(' ، '),
      'حالة استلام الهدية': item.isGiftDelivered ? 'تم التسليم ✓' : 'في انتظار الاستلام'
    }));
    exportToCSV(`كشف_هدايا_الحضور_${ARABIC_MONTHS[selectedMonthIndex]}_${selectedYear}`, rows);
  };

  // Generate WhatsApp Congrats link
  const getWhatsAppCongratsUrl = (item: typeof membersMonthlyData[0]) => {
    const cleanPhone = (item.member?.whatsapp || item.member?.phone || '').replace(/[^0-9]/g, '');
    const monthName = ARABIC_MONTHS[selectedMonthIndex];
    const text = `سلام ونعمة يا ${item.member.fullName} الغالي 🕊️\nمَبْرُوكْ! فرحنا بانتظامك ومواظبتك معانا في اجتماع الشباب (الثلاثة فتية) طوال شهر ${monthName} ${selectedYear}، وحضرت جميع جمعات الشهر (${monthFridays.length} جمعات) بدون غياب! 🎉🎁\n\nهديتك في انتظارك من الخدام في الاجتماع القادم! ✨\n\n«فَرِحْتُ بِالْقَائِلِينَ لِي: إِلَى بَيْتِ الرَّبِّ نَذْهَبُ.» (مزمور 122:1)`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
        <div className="absolute right-1/3 -bottom-10 w-52 h-52 rounded-full bg-amber-400/15 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-100 text-xs font-bold mb-2.5 border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>نظام تكريم المواظبة الشهرية والتحدي الأسبوعي</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
              <span>هدايا الحضور</span>
              <span className="text-3xl">🎁</span>
            </h2>
            <p className="text-amber-100 text-xs sm:text-sm mt-1 max-w-xl font-medium leading-relaxed">
              تكريم الشباب الملتزمين بالحضور في كافة جمعات الشهر دون انقطاع. يتم احتساب الحضور من أول جمعة إلى آخر جمعة في الشهر وتتجدد الدورة مع مطلع كل شهر جديد.
            </p>
          </div>

          {/* Month Selector Carousel */}
          <div className="bg-slate-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/15 flex items-center gap-2 shrink-0 self-start md:self-auto">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white transition"
              title="الشهر السابق"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="text-center px-3 min-w-[140px]">
              <span className="block text-sm font-black text-amber-200">
                {ARABIC_MONTHS[selectedMonthIndex]} {selectedYear}
              </span>
              <span className="text-[10px] text-amber-100/80 font-mono font-bold">
                {monthFridays.length === 5 ? '⭐ 5 جمعات' : '⭐ 4 جمعات'}
              </span>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white transition"
              title="الشهر التالي"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {(selectedYear !== now.getFullYear() || selectedMonthIndex !== now.getMonth()) && (
              <button
                onClick={handleCurrentMonth}
                className="px-2.5 py-1 text-[10px] bg-white/20 hover:bg-white/30 text-white rounded-lg font-bold transition ml-1"
              >
                الشهر الحالي
              </button>
            )}
          </div>
        </div>

        {/* Friday Dates Bar */}
        <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <Calendar className="w-4 h-4 text-amber-200" />
            <span>جمعات شهر {ARABIC_MONTHS[selectedMonthIndex]} ({monthFridays.length} جمعات):</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {monthFridays.map((f) => (
                <span 
                  key={f.fridayIndex}
                  className="px-2.5 py-1 rounded-lg bg-black/30 text-amber-200 font-mono font-bold text-xs border border-white/10"
                >
                  ({f.formattedDate})
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-1 rounded-xl bg-black/35 hover:bg-rose-600 text-white font-bold text-[11px] transition flex items-center gap-1 border border-white/20 shadow-2xs mr-auto"
              title="تفريغ أختام هذا الشهر لكافة المخدومين والبدء بدورة جديدة"
            >
              <RotateCcw className="w-3 h-3 text-amber-300" />
              <span>تفريغ أختام الشهر 🔄</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* 1. المستحقون الكاملون */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">مستحقي هدايا الحضور</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-base">
              🎁
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
              {qualifiedMembers.length}
            </span>
            <span className="text-xs text-slate-500 font-bold">
              مخدوم أكملوا {monthFridays.length}/{monthFridays.length}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>مواظبة بنسبة 100% للشهر</span>
          </div>
        </div>

        {/* 2. جمعات الشهر */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">جمعات هذا الشهر</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">
              🗓️
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-blue-700 font-mono">
              {monthFridays.length}
            </span>
            <span className="text-xs text-slate-500 font-bold">
              جمعات مطلوبة
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 font-semibold font-mono">
            {monthFridays.map(f => `(${f.formattedDate})`).join(' ')}
          </div>
        </div>

        {/* 3. الهدايا المستلمة */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-emerald-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">تم تسليم الهدية</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm">
              ✨
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">
              {qualifiedMembers.filter(m => m.isGiftDelivered).length}
            </span>
            <span className="text-xs text-slate-500 font-bold">
              من أصل {qualifiedMembers.length}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-bold">
            {qualifiedMembers.length > 0 
              ? `${Math.round((qualifiedMembers.filter(m => m.isGiftDelivered).length / qualifiedMembers.length) * 100)}% تم التوزيع`
              : 'في انتظار التوزيع'}
          </div>
        </div>

        {/* 4. متبقي جمعة واحدة */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">متبقي جمعة واحدة</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center text-sm">
              ⏳
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-purple-700 font-mono">
              {nearlyQualifiedMembers.length}
            </span>
            <span className="text-xs text-slate-500 font-bold">
              مخدومين
            </span>
          </div>
          <div className="mt-2 text-[11px] text-purple-700 font-bold">
            حضروا {monthFridays.length - 1} من {monthFridays.length} جمعات
          </div>
        </div>

      </div>

      {/* Filter Tabs and Actions Toolbar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterTab('qualified')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === 'qualified'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎁 مستحقي الهدية ({qualifiedMembers.length})</span>
          </button>

          <button
            onClick={() => setFilterTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>👥 كافة الشباب ({membersMonthlyData.length})</span>
          </button>

          <button
            onClick={() => setFilterTab('delivered')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === 'delivered'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>✓ تم التسليم ({qualifiedMembers.filter(m => m.isGiftDelivered).length})</span>
          </button>

          <button
            onClick={() => setFilterTab('pending')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === 'pending'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>⏳ بانتظار التسليم ({qualifiedMembers.filter(m => !m.isGiftDelivered).length})</span>
          </button>
        </div>

        {/* Search & Export Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الكود..."
              className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-amber-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-xs"
            title="تصدير كشف المستحقين للإكسيل"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تصدير الكشف</span>
          </button>
        </div>

      </div>

      {/* Main Members Grid / Cards */}
      {displayedMembers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-2xl mx-auto mb-3">
            🎁
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            لا يوجد نتائج مطابقة في هذا التصنيف
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterTab === 'qualified' 
              ? `لم يكمل أي عضو حتى الآن حضور كافة جمعات شهر ${ARABIC_MONTHS[selectedMonthIndex]} (${monthFridays.length} جمعات).`
              : 'جرب تغيير كلمة البحث أو الانتقال لشهر آخر.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedMembers.map((item) => {
            const isQualified = item.isCompletedAllFridays;
            const giftDelivered = item.isGiftDelivered;

            return (
              <div 
                key={item.member.id}
                className={`bg-white rounded-3xl p-4.5 border transition-all flex flex-col justify-between relative group ${
                  isQualified
                    ? 'border-amber-300 shadow-md ring-2 ring-amber-400/20 bg-gradient-to-b from-white to-amber-50/20'
                    : 'border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  
                  {/* Top Badge: Qualified or Attendance Rate */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      {item.member.uniqueCode}
                    </span>

                    {isQualified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2.5 py-0.5 rounded-full shadow-xs">
                        <span>مستحق للهدية</span>
                        <span>🎁</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                        حضر {item.attendedFridaysCount} من {monthFridays.length}
                      </span>
                    )}
                  </div>

                  {/* Member Details */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      {item.member.photoUrl && item.member.photoUrl.trim() !== '' ? (
                        <img 
                          src={item.member.photoUrl} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-400">{(item.member.fullName || '?').charAt(0)}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-right">
                      <h4 className="text-sm font-black text-slate-900 truncate">
                        {item.member.fullName}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                        {item.member.phone}
                      </p>

                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {item.member.gender === 'male' ? 'ذكر' : 'أنثى'} •
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {item.member.role === 'community_owner' ? 'Owner' : item.member.role === 'community_manager' ? 'Manager' : item.member.role === 'servant' ? 'خادم' : 'مخدوم'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Friday Stamps Progress Bar (Interactive with Meeting Logo & Cancel controls) */}
                  <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                      <span>أختام شهر {ARABIC_MONTHS[selectedMonthIndex]} ({monthFridays.length} جمعات):</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-700 font-black">
                          {item.attendedFridaysCount}/{monthFridays.length}
                        </span>
                        {isOwner && item.attendedFridaysCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleResetMemberMonth(item.member.id)}
                            className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline"
                            title="تفريغ أختام هذا الشهر لهذا المخدوم فقط"
                          >
                            تفريغ 🔄
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={`grid ${monthFridays.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5`}>
                      {monthFridays.map((friday) => {
                        const status = item.fridayStatusMap[friday.fridayIndex];
                        const isAttended = status?.isAttended;
                        const dateText = friday.formattedDate; // e.g. "02/10"

                        return (
                          <button
                            key={friday.fridayIndex}
                            type="button"
                            onClick={() => isOwner && handleToggleFridayStamp(item.member, friday)}
                            className={`py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center transition relative group/stamp overflow-hidden ${
                              isOwner ? 'cursor-pointer' : 'cursor-default'
                            } ${
                              isAttended
                                ? 'bg-blue-50/70 border-blue-500 shadow-2xs font-extrabold'
                                : 'bg-white border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600'
                            }`}
                            title={
                              isOwner
                                ? (isAttended ? `انقر هنا لإلغاء ختم تاريخ (${dateText}) ✕` : `انقر لتسجيل ختم تاريخ (${dateText}) ✓`)
                                : (isAttended ? `تم حضور جمعة (${dateText})` : `جمعة (${dateText})`)
                            }
                          >
                            {isAttended ? (
                              <div className="w-8 h-8 flex items-center justify-center">
                                <MeetingLogoStamp size={30} dateText={dateText} className="w-full h-full" />
                              </div>
                            ) : (
                              <span className="text-[11px] font-black text-slate-300 group-hover/stamp:text-blue-600 h-8 flex items-center justify-center">
                                {isOwner ? '+ ختم' : '—'}
                              </span>
                            )}
                            
                            {/* Strictly (dd/mm) under the stamp - NO (جمعة 1/2/3/4) */}
                            <span className={`text-[9px] font-mono font-bold leading-none mt-0.5 px-1 py-0.2 rounded-xs ${
                              isAttended ? 'text-blue-900 bg-blue-100/90 font-black' : 'text-slate-400'
                            }`}>
                              ({dateText})
                            </span>

                            {/* Quick cancel badge overlay on hover (Community Owner Only) */}
                            {isOwner && (
                              <div className={`absolute inset-0 opacity-0 group-hover/stamp:opacity-100 flex items-center justify-center text-white text-[9px] font-black transition backdrop-blur-2xs shadow-xs ${
                                isAttended ? 'bg-rose-600/85' : 'bg-emerald-600/85'
                              }`}>
                                {isAttended ? 'إلغاء ✕' : 'ختم ✓'}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Footer Controls */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  
                  {/* Delivery Status Button (Only for qualified members) */}
                  {isQualified ? (
                    <button
                      type="button"
                      onClick={() => handleToggleDelivery(item.member.id)}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                        giftDelivered
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                      }`}
                    >
                      {giftDelivered ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تم تسليم الهدية ✓</span>
                        </>
                      ) : (
                        <>
                          <Gift className="w-3.5 h-3.5 text-amber-700" />
                          <span>تسليم الهدية الآن</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex-1 text-[11px] text-slate-400 font-semibold text-center py-1">
                      ينقصه {monthFridays.length - item.attendedFridaysCount} جمعة للهدية
                    </div>
                  )}

                  {/* WhatsApp Congratulations Button */}
                  {isQualified && (
                    <a
                      href={getWhatsAppCongratsUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs"
                      title="إرسال تهنئة عبر الواتساب"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}

                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Month Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-rose-300 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 mx-auto flex items-center justify-center border border-rose-200 shadow-xs">
              <AlertTriangle className="w-8 h-8 text-rose-600 animate-pulse" />
            </div>

            <div>
              <span className="text-[11px] font-bold text-rose-800 bg-rose-100 px-3 py-1 rounded-full border border-rose-200">
                تصفير وتفريغ الدورة الشهرية
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-2">
                تفريغ أختام شهر {ARABIC_MONTHS[selectedMonthIndex]} {selectedYear}؟
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                سيتم مسح كافة أختام الحضور المسجلة لهذا الشهر لجميع المخدومين والبدء من الأول في الدورة الجديدة.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={handleResetCurrentMonth}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition"
              >
                نعم، تفريغ الأختام 🔄
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
