import React, { useState, useMemo } from 'react';
import { AttendanceRecord, Registrant, UserRole, VisitationNote } from '../../types';
import { exportToCSV, storageService, playAttendanceBeep } from '../../services/storageService';
import { 
  Calendar, 
  Download, 
  Users, 
  CheckCircle2, 
  Clock, 
  Camera, 
  Keyboard, 
  UserCheck, 
  Printer, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Phone, 
  MessageCircle, 
  CalendarDays,
  Award,
  Check, 
  Trash2, 
  Gift,
  UserX,
  ChevronDown,
  Filter,
  Search,
  FileText,
  Lock,
  ShieldCheck,
  Plus,
  X,
  AlertCircle,
  Edit3,
  Save,
  Crown,
  Upload,
  Zap,
  CheckSquare,
  Square,
  RotateCcw,
  ClipboardList
} from 'lucide-react';

interface AttendanceLogViewProps {
  registrants: Registrant[];
  attendanceRecords: AttendanceRecord[];
  onRefresh?: () => void;
  onGoToGifts?: () => void;
  currentUserRole?: UserRole;
  currentUserName?: string;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const ABSENCE_PRESETS = [
  { label: 'أسبوعين (14+ يوم)', days: 14, badge: '2W' },
  { label: '3 أسابيع (21+ يوم)', days: 21, badge: '3W' },
  { label: 'شهر (30+ يوم)', days: 30, badge: '1M' },
  { label: 'شهرين (60+ يوم)', days: 60, badge: '2M' },
  { label: '3 أشهر (90+ يوم)', days: 90, badge: '3M' },
  { label: '4 أشهر (120+ يوم)', days: 120, badge: '4M' },
  { label: '6 أشهر (نصف سنة)', days: 180, badge: '6M' },
  { label: 'سنة فأكثر (365+ يوم)', days: 365, badge: '1Y' },
  { label: 'سنتين (730+ يوم)', days: 730, badge: '2Y' },
];

export const AttendanceLogView: React.FC<AttendanceLogViewProps> = ({
  registrants,
  attendanceRecords,
  onRefresh,
  onGoToGifts,
  currentUserRole = 'community_owner',
  currentUserName = 'المسؤول'
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [liveSyncVersion, setLiveSyncVersion] = useState<number>(0);

  // Merge prop records with live storageService records so scanned attendance appears immediately
  const effectiveAttendanceRecords = useMemo(() => {
    const fromStorage = storageService.getAttendanceRecords();
    const map = new Map<string, AttendanceRecord>();
    (attendanceRecords || []).forEach(r => {
      if (r && r.id) map.set(r.id, r);
    });
    fromStorage.forEach(r => {
      if (r && r.id) map.set(r.id, r);
    });
    // Filter out any deleted attendance IDs
    const deletedIds = storageService.getDeletedAttendanceIds();
    return Array.from(map.values()).filter(r => !deletedIds.has(r.id));
  }, [attendanceRecords, liveSyncVersion]);

  // Strict deduplication of incoming registrants by ID to prevent duplicate React keys
  const uniqueRegistrants = useMemo(() => {
    const seen = new Set<string>();
    const list: Registrant[] = [];
    (registrants || []).forEach(r => {
      if (r && r.id && !seen.has(r.id)) {
        seen.add(r.id);
        list.push(r);
      }
    });
    return list;
  }, [registrants]);

  const handleDeleteRecord = (recordId: string) => {
    storageService.deleteAttendanceRecord(recordId);
    setDeleteConfirmId(null);
    setLiveSyncVersion(v => v + 1);
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleToggleStampOnly = (registrantId: string, dateStr: string) => {
    storageService.toggleFridayStampOnly(registrantId, dateStr);
    setLiveSyncVersion(v => v + 1);
    if (onRefresh) {
      onRefresh();
    }
  };

  // Subscribe to real-time storage updates (Cloudflare D1 & SSE) to re-render attendance logs instantly
  React.useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setLiveSyncVersion(v => v + 1);
      onRefresh?.();
    });
    return () => unsub();
  }, [onRefresh]);

  // Current time in UTC (Universal Time)
  const utcNow = new Date();
  const todayStr = utcNow.toISOString().split('T')[0];

  // Active section tab:
  // 1 = سجل حضور اليوم الحالي بالتوقيت العالمي
  // 2 = التقويم التفاعلي عبر السنين
  // 3 = نظام فلترة الغائبين ومتابعة الافتقاد
  // 4 = استيراد الحضور السريع الجماعي (خاص بالمالك Community Owner)
  const [activeSection, setActiveSection] = useState<'today_live' | 'multi_year_calendar' | 'absence_filter' | 'fast_import'>('today_live');

  // Fast Bulk Attendance Import State (Community Owner Exclusive)
  const [importYear, setImportYear] = useState<number>(utcNow.getUTCFullYear());
  const [importMonth, setImportMonth] = useState<number>(utcNow.getUTCMonth());
  const [importDay, setImportDay] = useState<number>(utcNow.getUTCDate());
  const [importSearchQuery, setImportSearchQuery] = useState<string>('');
  const [importGenderFilter, setImportGenderFilter] = useState<'all' | 'male' | 'female' | 'selected' | 'unselected'>('all');
  const [importViewMode, setImportViewMode] = useState<'cards' | 'table'>('cards');
  const [quickPasteOpen, setQuickPasteOpen] = useState<boolean>(false);
  const [quickPasteText, setQuickPasteText] = useState<string>('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Multi-Year Calendar State
  const [calendarYear, setCalendarYear] = useState<number>(utcNow.getUTCFullYear());
  const [customYearInput, setCustomYearInput] = useState<string>('');
  const [calendarMonth, setCalendarMonth] = useState<number>(utcNow.getUTCMonth()); // 0-indexed
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(todayStr);

  // ==========================================
  // MANUAL ATTENDANCE TYPING & AUTOCOMPLETE WITH STAMP
  // Requirement: "استيراد الحضور بالكتابة: عايز في سجل الحضور و الغياب خيار انو اقدر اسجل حضور بكتابة الاسم انا و بكتب في كلمات الاسم يظهر لي كل الاسماء الفيها نفس الحروف الانا بكتب فيها بعد كدا اختار الاسم ويتسجل حضور واذا اتسجل بالطرية دي يتعمل ليو معاو ختم الحضور"
  // ==========================================
  const [isTypeAttendanceModalOpen, setIsTypeAttendanceModalOpen] = useState<boolean>(false);
  const [typeSearchQuery, setTypeSearchQuery] = useState<string>('');
  const [typeTargetDate, setTypeTargetDate] = useState<string>(todayStr);
  const [typeSuccessNotice, setTypeSuccessNotice] = useState<string | null>(null);

  const matchingTypeMembers = useMemo(() => {
    const q = typeSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const list: Registrant[] = [];
    for (const r of uniqueRegistrants) {
      if (!r || !r.id || seen.has(r.id) || r.status === 'cancelled' || r.status === 'blocked') continue;
      const name = (r.fullName || '').toLowerCase();
      const code = (r.uniqueCode || '').toLowerCase();
      const phone = r.phone || '';
      if (name.includes(q) || code.includes(q) || phone.includes(q)) {
        seen.add(r.id);
        list.push(r);
        if (list.length >= 20) break;
      }
    }
    return list;
  }, [typeSearchQuery, uniqueRegistrants]);

  const handleRecordTypeAttendance = (member: Registrant) => {
    // 1. Record attendance
    storageService.recordAttendanceForDate(member, typeTargetDate, 'manual');
    // 2. Explicitly grant and activate attendance stamp
    storageService.setFridayStampRevoked(member.id, typeTargetDate, false);
    // 3. Play audio chime
    playAttendanceBeep();
    // 4. Feedback
    setTypeSuccessNotice(`✨ تم بنجاح تسجيل حضور [${member.fullName}] وتفعيل ختم الحضور الرسمي 🏅`);
    setTimeout(() => setTypeSuccessNotice(null), 4000);
    setLiveSyncVersion(v => v + 1);
    // 5. Notify parent & refresh
    onRefresh?.();
  };

  // Absence Filter State
  const [absenceThresholdDays, setAbsenceThresholdDays] = useState<number>(14);
  const [absenceCategoryFilter, setAbsenceCategoryFilter] = useState<'absent_after_attendance' | 'all' | 'never_attended'>('absent_after_attendance');
  const [isCustomAbsenceMode, setIsCustomAbsenceMode] = useState<boolean>(false);
  const [customAbsenceAmount, setCustomAbsenceAmount] = useState<number>(2);
  const [customAbsenceUnit, setCustomAbsenceUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('weeks');
  const [absenceSearchQuery, setAbsenceSearchQuery] = useState<string>('');
  const [absenceSortBy, setAbsenceSortBy] = useState<'longest' | 'shortest' | 'name'>('longest');
  const [absenceGenderFilter, setAbsenceGenderFilter] = useState<'all' | 'male' | 'female'>('all');

  // Pastoral Notes State
  const [visitationNotes, setVisitationNotes] = useState<VisitationNote[]>(() => storageService.getVisitationNotes());
  const [noteModalMember, setNoteModalMember] = useState<Registrant | null>(null);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [noteSaveSuccess, setNoteSaveSuccess] = useState<boolean>(false);

  React.useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setVisitationNotes(storageService.getVisitationNotes());
      setLiveSyncVersion(v => v + 1);
      onRefresh?.();
    });
    return unsub;
  }, [onRefresh]);

  const isSeniorLeader = 
    currentUserRole === 'community_owner' ||
    currentUserRole === 'community_manager' ||
    currentUserRole === 'meeting_secretary' ||
    currentUserRole === 'priest';

  // Map registrants for fast lookup
  const registrantsMap = useMemo(() => {
    const map = new Map<string, Registrant>();
    uniqueRegistrants.forEach(r => map.set(r.id, r));
    return map;
  }, [uniqueRegistrants]);

  // Helper to filter and deduplicate attendance records for a specific UTC date (matching either r.date or r.timestamp UTC date)
  const getRecordsForUtcDate = React.useCallback((targetDateStr: string): AttendanceRecord[] => {
    const seenMembers = new Set<string>();
    const list: AttendanceRecord[] = [];
    for (const r of effectiveAttendanceRecords) {
      if (!r || !r.registrantId) continue;
      const matchesDate = r.date === targetDateStr || Boolean(r.timestamp && r.timestamp.startsWith(targetDateStr));
      if (matchesDate && !seenMembers.has(r.registrantId)) {
        seenMembers.add(r.registrantId);
        list.push(r);
      }
    }
    return list;
  }, [effectiveAttendanceRecords]);

  // Aggregate attendance count by date across ALL time
  // If no attendance was recorded yet, this is strictly empty (size = 0)
  const attendanceCountByDate = useMemo(() => {
    const dateMemberSets = new Map<string, Set<string>>();
    effectiveAttendanceRecords.forEach(r => {
      if (!r || !r.registrantId) return;
      if (r.date) {
        if (!dateMemberSets.has(r.date)) dateMemberSets.set(r.date, new Set());
        dateMemberSets.get(r.date)!.add(r.registrantId);
      }
      if (r.timestamp && r.timestamp.includes('T')) {
        const tsDate = r.timestamp.split('T')[0];
        if (tsDate && tsDate !== r.date) {
          if (!dateMemberSets.has(tsDate)) dateMemberSets.set(tsDate, new Set());
          dateMemberSets.get(tsDate)!.add(r.registrantId);
        }
      }
    });
    const map = new Map<string, number>();
    dateMemberSets.forEach((set, d) => map.set(d, set.size));
    return map;
  }, [effectiveAttendanceRecords]);

  // Overall Historical Metrics
  // Starts strictly at 0 if no attendance was recorded
  const totalMeetingDays = attendanceCountByDate.size;
  const totalCumulativeAttendance = effectiveAttendanceRecords.length;

  // Record day with highest attendance + exact Day, Month, Year
  let peakDay = { date: '', count: 0 };
  attendanceCountByDate.forEach((count, date) => {
    if (count > peakDay.count) {
      peakDay = { date, count };
    }
  });

  const formattedPeakDayDate = useMemo(() => {
    if (!peakDay.date || peakDay.count === 0) return 'لا يوجد حضور حتى الآن';
    const parts = peakDay.date.split('-');
    if (parts.length < 3) return peakDay.date;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [peakDay]);

  // ==========================================
  // SECTION 1: TODAY'S LIVE ATTENDANCE DATA (UTC)
  // ==========================================
  const todayRecords = useMemo(() => {
    return getRecordsForUtcDate(todayStr);
  }, [getRecordsForUtcDate, todayStr]);

  const totalRegistered = uniqueRegistrants.filter(r => r.role === 'member' && r.status !== 'cancelled').length;
  const todayAttendedCount = todayRecords.length;
  const todayAttendanceRate = totalRegistered > 0 ? Math.round((todayAttendedCount / totalRegistered) * 100) : 0;

  const registeredMales = uniqueRegistrants.filter(r => (r.gender === 'male' || !r.gender) && r.role === 'member' && r.status !== 'cancelled').length;
  const registeredFemales = uniqueRegistrants.filter(r => r.gender === 'female' && r.role === 'member' && r.status !== 'cancelled').length;

  const todayAttendedMales = todayRecords.filter(rec => {
    const mem = registrantsMap.get(rec.registrantId);
    return mem ? mem.gender !== 'female' : true;
  }).length;
  const todayAttendedFemales = todayRecords.filter(rec => {
    const mem = registrantsMap.get(rec.registrantId);
    return mem ? mem.gender === 'female' : false;
  }).length;

  const todayMaleAttendanceRate = registeredMales > 0 ? Math.round((todayAttendedMales / registeredMales) * 100) : 0;
  const todayFemaleAttendanceRate = registeredFemales > 0 ? Math.round((todayAttendedFemales / registeredFemales) * 100) : 0;

  const todayFormattedTitle = utcNow.toLocaleDateString('ar-EG', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handleExportTodayCSV = () => {
    const rows = todayRecords.map((r, idx) => {
      const reg = registrantsMap.get(r.registrantId);
      return {
        '#': idx + 1,
        'اسم المخدوم': r.registrantName,
        'كود العضوية': reg?.uniqueCode || '—',
        'تاريخ الحضور': r.date,
        'وقت الحضور': new Date(r.timestamp).toLocaleTimeString('ar-EG'),
        'طريقة التسجيل': r.method === 'camera_scan' ? 'مسح الكاميرا' : 'إدخال يدوي',
        'رقم الهاتف': reg?.phone || '—',
        'رقم الواتساب': reg?.whatsapp || '—',
      };
    });
    exportToCSV(`كشف_حضور_اليوم_${todayStr}`, rows);
  };

  // ==========================================
  // SECTION 2: MULTI-YEAR CALENDAR CALCULATIONS
  // ==========================================
  // Available years dropdown options spanning from 2020 through 2050 and beyond
  const yearOptions = useMemo(() => {
    const yearsSet = new Set<number>();
    for (let y = 2020; y <= 2050; y++) {
      yearsSet.add(y);
    }
    yearsSet.add(calendarYear);
    effectiveAttendanceRecords.forEach(r => {
      const y = parseInt(r.date.split('-')[0], 10);
      if (!isNaN(y)) yearsSet.add(y);
    });
    return Array.from(yearsSet).sort((a, b) => a - b);
  }, [effectiveAttendanceRecords, calendarYear]);

  // Calendar Days Grid for calendarYear and calendarMonth
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    const jsDay = firstDayOfMonth.getDay();
    const startOffset = (jsDay + 1) % 7;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isFriday: boolean;
      isToday: boolean;
      attendeeCount: number;
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      days.push({
        dateStr: '',
        dayNum: 0,
        isCurrentMonth: false,
        isFriday: false,
        isToday: false,
        attendeeCount: 0
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const monthPadded = String(calendarMonth + 1).padStart(2, '0');
      const dayPadded = String(d).padStart(2, '0');
      const dateStr = `${calendarYear}-${monthPadded}-${dayPadded}`;
      const dayDate = new Date(calendarYear, calendarMonth, d);
      const isFriday = dayDate.getDay() === 5; // Friday
      const isToday = dateStr === todayStr;
      const attendeeCount = attendanceCountByDate.get(dateStr) || 0;

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isFriday,
        isToday,
        attendeeCount
      });
    }

    return days;
  }, [calendarYear, calendarMonth, todayStr, attendanceCountByDate]);

  // Records for currently selected calendar date
  const selectedDateRecords = useMemo(() => {
    return getRecordsForUtcDate(selectedCalendarDate);
  }, [getRecordsForUtcDate, selectedCalendarDate]);

  const selectedDateFormattedTitle = useMemo(() => {
    if (!selectedCalendarDate) return '';
    const parts = selectedCalendarDate.split('-');
    if (parts.length < 3) return selectedCalendarDate;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [selectedCalendarDate]);

  const handleExportSelectedDateCSV = () => {
    const rows = selectedDateRecords.map((r, idx) => {
      const reg = registrantsMap.get(r.registrantId);
      return {
        '#': idx + 1,
        'اسم المخدوم': r.registrantName,
        'كود العضوية': reg?.uniqueCode || '—',
        'تاريخ الحضور': r.date,
        'وقت الحضور': new Date(r.timestamp).toLocaleTimeString('ar-EG'),
        'طريقة التسجيل': r.method === 'camera_scan' ? 'مسح الكاميرا' : 'إدخال يدوي',
        'رقم الهاتف': reg?.phone || '—',
        'رقم الواتساب': reg?.whatsapp || '—',
      };
    });
    exportToCSV(`كشف_حضور_${selectedCalendarDate}`, rows);
  };

  // ==========================================
  // SECTION 3: ABSENCE FILTER SYSTEM & DATA
  // ==========================================
  const handleApplyCustomAbsence = () => {
    let multiplier = 1;
    if (customAbsenceUnit === 'weeks') multiplier = 7;
    else if (customAbsenceUnit === 'months') multiplier = 30;
    else if (customAbsenceUnit === 'years') multiplier = 365;

    const totalDays = Math.max(1, customAbsenceAmount * multiplier);
    setAbsenceThresholdDays(totalDays);
    setIsCustomAbsenceMode(true);
  };

  const membersAbsenceData = useMemo(() => {
    const todayMs = new Date(todayStr).getTime();
    const result: Array<{
      member: Registrant;
      lastAttendDate: string | null;
      daysAbsent: number;
      weeksAbsent: number;
      formattedDuration: string;
      hasAttendedBefore: boolean;
      visitationNotes: VisitationNote[];
    }> = [];

    const seenYouthIds = new Set<string>();
    const youthMembers = uniqueRegistrants.filter(r => {
      if (!r || !r.id || seenYouthIds.has(r.id)) return false;
      seenYouthIds.add(r.id);
      return r.role === 'member' && r.status !== 'cancelled';
    });

    youthMembers.forEach(member => {
      const records = attendanceRecords.filter(r => r.registrantId === member.id);
      let lastDate: string | null = null;
      let daysAbsent = 0;
      let weeksAbsent = 0;
      let formattedDuration = '';
      let hasAttendedBefore = false;

      if (records.length > 0) {
        const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
        lastDate = sorted[0].date;
        const lastMs = new Date(lastDate).getTime();
        daysAbsent = Math.max(0, Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24)));
        weeksAbsent = Math.floor(daysAbsent / 7);
        hasAttendedBefore = true;

        if (weeksAbsent === 0) {
          formattedDuration = daysAbsent === 0 ? 'حاضر اليوم' : `${daysAbsent} أيام`;
        } else if (weeksAbsent === 1) {
          formattedDuration = daysAbsent === 7 ? 'أسبوع' : `أسبوع و ${daysAbsent % 7} أيام`;
        } else if (weeksAbsent === 2) {
          formattedDuration = daysAbsent === 14 ? 'أسبوعين' : `أسبوعين و ${daysAbsent % 7} أيام`;
        } else if (weeksAbsent <= 10) {
          formattedDuration = `${weeksAbsent} أسابيع${daysAbsent % 7 > 0 ? ` و ${daysAbsent % 7} أيام` : ''}`;
        } else {
          formattedDuration = `${weeksAbsent} أسبوعاً${daysAbsent % 7 > 0 ? ` و ${daysAbsent % 7} أيام` : ''}`;
        }
      } else {
        // As requested by user:
        // تكون مدة الانقطاع فاضية تماماً إذا الشخص ما عنده أي سجل حضور
        hasAttendedBefore = false;
        lastDate = null;
        daysAbsent = 0;
        weeksAbsent = 0;
        formattedDuration = '';
      }

      const memberNotes = visitationNotes.filter(n => n.memberId === member.id);

      result.push({
        member,
        lastAttendDate: lastDate,
        daysAbsent,
        weeksAbsent,
        formattedDuration,
        hasAttendedBefore,
        visitationNotes: memberNotes
      });
    });

    return result;
  }, [registrants, attendanceRecords, todayStr, visitationNotes]);

  const filteredAbsentList = useMemo(() => {
    let list = membersAbsenceData;

    if (absenceCategoryFilter === 'absent_after_attendance') {
      list = list.filter(item => item.hasAttendedBefore && item.daysAbsent >= absenceThresholdDays);
    } else if (absenceCategoryFilter === 'never_attended') {
      list = list.filter(item => !item.hasAttendedBefore);
    }

    if (absenceGenderFilter !== 'all') {
      list = list.filter(item => item.member.gender === absenceGenderFilter);
    }

    if (absenceSearchQuery.trim()) {
      const q = absenceSearchQuery.toLowerCase().trim();
      list = list.filter(item => {
        if (!item || !item.member) return false;
        return (
          (item.member.fullName || '').toLowerCase().includes(q) ||
          (item.member.phone || '').includes(q) ||
          (item.member.uniqueCode || '').toLowerCase().includes(q)
        );
      });
    }

    if (absenceSortBy === 'longest') {
      list.sort((a, b) => b.daysAbsent - a.daysAbsent);
    } else if (absenceSortBy === 'shortest') {
      list.sort((a, b) => a.daysAbsent - b.daysAbsent);
    } else {
      list.sort((a, b) => a.member.fullName.localeCompare(b.member.fullName, 'ar'));
    }

    return list;
  }, [membersAbsenceData, absenceCategoryFilter, absenceThresholdDays, absenceGenderFilter, absenceSearchQuery, absenceSortBy]);

  const handleExportAbsentListCSV = () => {
    const rows = filteredAbsentList.map((item, idx) => {
      return {
        '#': idx + 1,
        'اسم المخدوم': item.member.fullName,
        'كود العضوية': item.member.uniqueCode,
        'النوع': item.member.gender === 'male' ? 'ذكر' : 'أنثى',
        'مدة الغياب (أيام)': item.daysAbsent,
        'مدة الغياب (أسابيع)': item.weeksAbsent,
        'آخر تاريخ حضور': item.lastAttendDate || 'لم يسجل حضور',
        'رقم الهاتف': item.member.phone,
        'رقم الواتساب': item.member.whatsapp,
        'عدد ملاحظات الافتقاد': item.visitationNotes.length,
        'آخر ملاحظة رعوية': item.visitationNotes[0]?.notes || 'لا يوجد'
      };
    });
    exportToCSV(`كشف_الغائبين_${absenceThresholdDays}_يوم_${todayStr}`, rows);
  };

  const handleSavePastoralNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteModalMember || !newNoteContent.trim()) return;

    storageService.addVisitationNote({
      memberId: noteModalMember.id,
      memberName: noteModalMember.fullName,
      authorName: currentUserName,
      authorRole: currentUserRole,
      notes: newNoteContent.trim()
    });

    setVisitationNotes(storageService.getVisitationNotes());
    setNewNoteContent('');
    setNoteSaveSuccess(true);
    setTimeout(() => {
      setNoteSaveSuccess(false);
      setNoteModalMember(null);
    }, 1500);

    if (onRefresh) {
      onRefresh();
    }
  };

  // ==========================================
  // SECTION 4: FAST BULK ATTENDANCE IMPORT CALCULATIONS
  // ==========================================
  const daysInImportMonth = useMemo(() => {
    return new Date(importYear, importMonth + 1, 0).getDate();
  }, [importYear, importMonth]);

  const safeImportDay = Math.min(importDay, daysInImportMonth);

  const importDateStr = useMemo(() => {
    const m = String(importMonth + 1).padStart(2, '0');
    const d = String(safeImportDay).padStart(2, '0');
    return `${importYear}-${m}-${d}`;
  }, [importYear, importMonth, safeImportDay]);

  const [selectedImportMemberIds, setSelectedImportMemberIds] = useState<Set<string>>(() => {
    const existing = attendanceRecords.filter(r => r.date === todayStr).map(r => r.registrantId);
    return new Set(existing);
  });

  // Automatically sync checked members whenever import date changes
  React.useEffect(() => {
    const existing = attendanceRecords.filter(r => r.date === importDateStr).map(r => r.registrantId);
    setSelectedImportMemberIds(new Set(existing));
  }, [importDateStr, attendanceRecords]);

  const allYouthMembers = useMemo(() => {
    const seen = new Set<string>();
    return uniqueRegistrants.filter(r => {
      if (!r || !r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return r.role === 'member' && r.status !== 'cancelled';
    });
  }, [uniqueRegistrants]);

  const importFormattedTitle = useMemo(() => {
    const parts = importDateStr.split('-');
    if (parts.length < 3) return importDateStr;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [importDateStr]);

  const filteredImportMembers = useMemo(() => {
    let list = allYouthMembers;
    if (importGenderFilter === 'male') {
      list = list.filter(m => m.gender === 'male');
    } else if (importGenderFilter === 'female') {
      list = list.filter(m => m.gender === 'female');
    } else if (importGenderFilter === 'selected') {
      list = list.filter(m => selectedImportMemberIds.has(m.id));
    } else if (importGenderFilter === 'unselected') {
      list = list.filter(m => !selectedImportMemberIds.has(m.id));
    }

    if (importSearchQuery.trim()) {
      const q = importSearchQuery.toLowerCase().trim();
      list = list.filter(m => {
        if (!m) return false;
        return (
          (m.fullName || '').toLowerCase().includes(q) ||
          (m.uniqueCode || '').toLowerCase().includes(q) ||
          (m.phone || '').includes(q)
        );
      });
    }

    const seen = new Set<string>();
    return list.filter(m => {
      if (!m || !m.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [allYouthMembers, importGenderFilter, importSearchQuery, selectedImportMemberIds]);

  const handleToggleImportMember = (memberId: string) => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const handleSelectAllImport = () => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      filteredImportMembers.forEach(m => next.add(m.id));
      return next;
    });
  };

  const handleDeselectAllImport = () => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      filteredImportMembers.forEach(m => next.delete(m.id));
      return next;
    });
  };

  const handleSelectMalesImport = () => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      allYouthMembers.filter(m => m.gender === 'male').forEach(m => next.add(m.id));
      return next;
    });
  };

  const handleSelectFemalesImport = () => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      allYouthMembers.filter(m => m.gender === 'female').forEach(m => next.add(m.id));
      return next;
    });
  };

  const handleInvertSelectionImport = () => {
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      filteredImportMembers.forEach(m => {
        if (next.has(m.id)) next.delete(m.id);
        else next.add(m.id);
      });
      return next;
    });
  };

  const handleReloadExistingAttendance = () => {
    const existing = attendanceRecords.filter(r => r.date === importDateStr).map(r => r.registrantId);
    setSelectedImportMemberIds(new Set(existing));
    setImportFeedback(`تمت استعادة قائمة الحاضرين المسجلين مسبقاً (${existing.length} مخدوم)`);
    setTimeout(() => setImportFeedback(null), 2500);
  };

  const handleQuickPasteAnalyze = () => {
    if (!quickPasteText.trim()) return;
    const tokens = quickPasteText
      .split(/[\n,;،\t]+/)
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    let matched = 0;
    setSelectedImportMemberIds(prev => {
      const next = new Set(prev);
      allYouthMembers.forEach(m => {
        const codeMatch = tokens.some(t => m.uniqueCode.toLowerCase() === t);
        const nameMatch = tokens.some(t => m.fullName.toLowerCase().includes(t) || t.includes(m.fullName.toLowerCase()));
        const phoneMatch = tokens.some(t => m.phone.includes(t));
        if (codeMatch || nameMatch || phoneMatch) {
          next.add(m.id);
          matched++;
        }
      });
      return next;
    });

    setImportFeedback(`تم بنجاح مطابقة وتحديد ${matched} مخدوم من النص المدخل! ✓`);
    setTimeout(() => setImportFeedback(null), 3000);
    setQuickPasteText('');
    setQuickPasteOpen(false);
  };

  const handleSaveBulkAttendance = () => {
    if (currentUserRole !== 'community_owner') return;

    const idsArray = Array.from(selectedImportMemberIds);
    const count = storageService.setBatchAttendanceForDate(importDateStr, idsArray, registrantsMap);

    const parts = importDateStr.split('-');
    const formattedDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    setImportFeedback(`🎉 تم بنجاح تثبيت وحفظ حضور ${count} مخدوم لتاريخ (${formattedDate})!`);
    setTimeout(() => setImportFeedback(null), 4000);

    if (onRefresh) {
      onRefresh();
    }
  };

  const handleSetDateToday = () => {
    const n = new Date();
    setImportYear(n.getFullYear());
    setImportMonth(n.getMonth());
    setImportDay(n.getDate());
  };

  const handleSetDateClosestFriday = () => {
    const d = new Date();
    const currentDayOfWeek = d.getDay(); // 0 Sun, ... 5 Fri
    const diff = (currentDayOfWeek - 5 + 7) % 7;
    d.setDate(d.getDate() - diff);
    setImportYear(d.getFullYear());
    setImportMonth(d.getMonth());
    setImportDay(d.getDate());
  };

  const handleSetDatePrevFriday = () => {
    const d = new Date(importYear, importMonth, safeImportDay);
    d.setDate(d.getDate() - 7);
    setImportYear(d.getFullYear());
    setImportMonth(d.getMonth());
    setImportDay(d.getDate());
  };

  return (
    <div className="space-y-6">

      {/* Main Multi-Section Navigation Switcher (Tabs) */}
      <div className="bg-white p-2 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 w-full md:w-auto p-1 bg-slate-100 rounded-2xl gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSection('today_live')}
            className={`px-3.5 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 ${
              activeSection === 'today_live'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>1. سجل حضور اليوم (UTC)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeSection === 'today_live' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {todayAttendedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('multi_year_calendar')}
            className={`px-3.5 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 ${
              activeSection === 'multi_year_calendar'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>2. التقويم التفاعلي عبر السنين</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeSection === 'multi_year_calendar' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {totalMeetingDays} يوم
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('absence_filter')}
            className={`px-3.5 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 ${
              activeSection === 'absence_filter'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserX className="w-4 h-4" />
            <span>3. فلترة الغائبين والافتقاد 🔍</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeSection === 'absence_filter' ? 'bg-rose-700 text-rose-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {filteredAbsentList.length} غائب
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* استيراد وتسجيل الحضور بالكتابة (بحث ذكي بالاسم وختم الحضور) */}
          <button
            type="button"
            onClick={() => {
              setTypeTargetDate(activeSection === 'multi_year_calendar' ? selectedCalendarDate : todayStr);
              setIsTypeAttendanceModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
            title="تسجيل حضور بكتابة حروف الاسم مع اقتراحات فورية وختم الحضور التلقائي"
          >
            <Keyboard className="w-4 h-4 text-emerald-200" />
            <span>تسجيل الحضور بالكتابة ✍️</span>
            <span className="text-[10px] bg-white/20 text-white font-bold px-1.5 py-0.5 rounded-md">
              ختم فوري 🏅
            </span>
          </button>

          {currentUserRole === 'community_owner' && (
            <button
              type="button"
              onClick={() => setActiveSection('fast_import')}
              className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shadow-xs ${
                activeSection === 'fast_import'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-600/30 ring-2 ring-indigo-300'
                  : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'
              }`}
              title="استيراد وتسجيل الحضور السريع الجماعي لكافة مخدومي السيستم (صلاحية مسؤول الموقع Community Owner حصرياً)"
            >
              <Upload className="w-4 h-4 text-indigo-700" />
              <span>استيراد الحضور ⚡📥</span>
              <span className="text-[10px] bg-indigo-200/90 text-indigo-950 font-bold px-1.5 py-0.5 rounded-md">
                المالك فقط 👑
              </span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: سجل حضور اليوم الحالي بالتوقيت العالمي
          ========================================================================= */}
      {activeSection === 'today_live' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Top Banner Card: Today's Live Attendance */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/40 text-emerald-100 font-bold px-3 py-1 rounded-full border border-emerald-400/30 text-xs mb-2">
                <Clock className="w-3.5 h-3.5 animate-pulse text-emerald-200" />
                <span>سجل الحضور لليوم الحالي بالتوقيت العالمي (UTC)</span>
              </div>
              <h2 className="text-2xl font-black text-white">
                {todayFormattedTitle}
              </h2>
              <p className="text-xs text-emerald-100 mt-1">
                كشف الحضور المحدث في اللحظة الفعلية عند مسح رمز QR بالكاميرا أو الإدخال اليدوي.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportTodayCSV}
                disabled={todayRecords.length === 0}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-emerald-700" />
                <span>تصدير كشف اليوم (Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                title="طباعة كشف الحضور"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            </div>
          </div>

          {/* Quick Stats for Today: Total Today Attendance, Overall Attendance Rate, and Male/Female breakdown percentages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shrink-0">
                <UserCheck className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-bold block">إجمالي حضور اليوم</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-emerald-700 font-mono">{todayAttendedCount}</span>
                  <span className="text-xs text-slate-600 font-bold">حاضر</span>
                </div>
                <span className="text-[11px] text-slate-400 block font-normal">من أصل {totalRegistered} مخدوم مسجل</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-6 h-6 text-teal-700" />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-bold block">نسبة الحضور العامة</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-teal-700 font-mono">{todayAttendanceRate}%</span>
                </div>
                <span className="text-[11px] text-slate-400 block font-normal">معدل الحضور الإجمالي لليوم</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-3xl border border-blue-200 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold shrink-0 text-xl">
                👦
              </div>
              <div>
                <span className="text-xs text-blue-900 font-bold block">نسبة حضور الشباب</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-blue-700 font-mono">{todayMaleAttendanceRate}%</span>
                  <span className="text-xs text-slate-500 font-bold">({todayAttendedMales} من {registeredMales})</span>
                </div>
                <span className="text-[11px] text-slate-400 block font-normal">معدل حضور الشباب الذكور</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-3xl border border-pink-200 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-pink-100 text-pink-800 flex items-center justify-center font-bold shrink-0 text-xl">
                👧
              </div>
              <div>
                <span className="text-xs text-pink-900 font-bold block">نسبة حضور الشابات</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-pink-700 font-mono">{todayFemaleAttendanceRate}%</span>
                  <span className="text-xs text-slate-500 font-bold">({todayAttendedFemales} من {registeredFemales})</span>
                </div>
                <span className="text-[11px] text-slate-400 block font-normal">معدل حضور الشابات الإناث</span>
              </div>
            </div>
          </div>

          {/* Today's Table */}
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">
                  كشف حضور اليوم المباشر ({todayAttendedCount} حاضر)
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">الصورة</th>
                    <th className="py-3 px-4">اسم المخدوم</th>
                    <th className="py-3 px-4">كود العضوية</th>
                    <th className="py-3 px-4">وقت الحضور</th>
                    <th className="py-3 px-4">طريقة التسجيل</th>
                    <th className="py-3 px-4">بيانات التواصل</th>
                    <th className="py-3 px-4 text-center">الحالة / إلغاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {todayRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Clock className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-600" />
                        <p className="text-sm font-bold text-slate-700">
                          لم يتم تسجيل أي حضور حتى الآن لليوم الحالي
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          قم بمسح رمز الاستجابة السريعة (QR) أو تسجيل الحضور لإظهار الأسماء مباشرة هنا.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    todayRecords.map((record, index) => {
                      const member = registrantsMap.get(record.registrantId);
                      const cleanWa = (member?.whatsapp || member?.phone || '').replace(/\D/g, '');
                      const waLink = cleanWa ? `https://wa.me/${cleanWa}` : '#';
                      const cleanPhone = (member?.phone || '').replace(/[^0-9+]/g, '');
                      const telLink = cleanPhone ? `tel:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}` : '#';

                      return (
                        <tr key={record.id} className="hover:bg-emerald-50/20 transition">
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {index + 1}
                          </td>

                          <td className="py-3 px-4">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                              {record.registrantPhotoUrl && record.registrantPhotoUrl.trim() !== '' ? (
                                <img 
                                  src={record.registrantPhotoUrl} 
                                  alt={record.registrantName} 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">{(record.registrantName || '?').charAt(0)}</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                            {record.registrantName}
                          </td>

                          <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-900">
                            {member?.uniqueCode || '—'}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600">
                            {new Date(record.timestamp).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </td>

                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                              record.method === 'camera_scan' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {record.method === 'camera_scan' ? (
                                <>
                                  <Camera className="w-3 h-3" />
                                  <span>مسح بالكاميرا</span>
                                </>
                              ) : (
                                <>
                                  <Keyboard className="w-3 h-3" />
                                  <span>إدخال يدوي</span>
                                </>
                              )}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              {member && (
                                <>
                                  <a
                                    href={telLink}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                    title="اتصال هاتفي"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                  <a
                                    href={waLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"
                                    title="مراسلة واتساب"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </a>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>حاضر اليوم</span>
                              </span>

                              {/* Independent Friday Stamp Toggle (Community Owner Only) */}
                              {currentUserRole === 'community_owner' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStampOnly(record.registrantId, record.date)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                    storageService.isFridayStampRevoked(record.registrantId, record.date)
                                      ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                  title={
                                    storageService.isFridayStampRevoked(record.registrantId, record.date)
                                      ? 'الختم ملغي لهذا اليوم. انقر لإعادة تفعيل الختم'
                                      : 'انقر هنا لإلغاء ختم الحضور فقط مع إبقاء تسجيل الحضور'
                                  }
                                >
                                  {storageService.isFridayStampRevoked(record.registrantId, record.date)
                                    ? 'الختم: ملغي ✕'
                                    : 'الختم: مفعل ✓'}
                                </button>
                              )}

                              {currentUserRole === 'community_owner' && (
                                deleteConfirmId === record.id ? (
                                  <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                                    <span className="text-[10px] text-red-700 font-bold">حذف الحضور والختم؟</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecord(record.id)}
                                      className="px-2 py-0.5 bg-red-600 text-white rounded-md text-[10px] font-bold"
                                    >
                                      نعم
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px]"
                                    >
                                      لا
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(record.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                    title="حذف الحضور والختم معاً بشكل نهائي"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          SECTION 2: التقويم التفاعلي عبر السنين
          ========================================================================= */}
      {activeSection === 'multi_year_calendar' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Header Card: Interactive Calendar */}
          <div className="bg-gradient-to-r from-indigo-700 via-purple-800 to-slate-900 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-500/30 text-indigo-100 font-bold px-3 py-1 rounded-full border border-indigo-400/30 text-xs mb-2">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-200" />
                <span>أرشيف وسجل حضور جميع الأيام عبر السنين</span>
              </div>
              <h2 className="text-2xl font-black text-white">
                التقويم التفاعلي 🗓️
              </h2>
              <p className="text-xs text-indigo-100 mt-1 max-w-xl">
                تنقّل بسلاسة بين كل الشهور والسنوات. اضغط على أي يوم لعرض كشف الحضور التفصيلي وتصديره.
              </p>
            </div>

            {/* Overall Aggregate Highlights */}
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-xs border border-white/20 p-3 rounded-2xl text-center min-w-[90px]">
                <span className="text-[10px] text-indigo-200 block">أيام الاجتماع</span>
                <span className="text-xl font-black text-white font-mono">{totalMeetingDays}</span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs border border-white/20 p-3 rounded-2xl text-center min-w-[90px]">
                <span className="text-[10px] text-indigo-200 block">إجمالي الحضور</span>
                <span className="text-xl font-black text-white font-mono">{totalCumulativeAttendance}</span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs border border-white/20 p-3 rounded-2xl text-center min-w-[130px]">
                <span className="text-[10px] text-indigo-200 block">أعلى يوم حضور</span>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-black text-amber-300 font-mono">{peakDay.count}</span>
                  <span className="text-[10px] text-indigo-100 font-bold truncate max-w-[125px]" title={formattedPeakDayDate}>
                    {formattedPeakDayDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Component */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-5">
            
            {/* 1. Year & Month Selectors Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
              
              {/* Year Dropdown & Custom Year Input (All years to infinity) */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>السنة:</span>
                </span>
                
                {/* Year Select Dropdown */}
                <div className="relative">
                  <select
                    value={calendarYear}
                    onChange={(e) => setCalendarYear(parseInt(e.target.value, 10))}
                    className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs py-2 pr-3 pl-8 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-mono"
                  >
                    {yearOptions.map(yr => (
                      <option key={yr} value={yr}>
                        {yr} {yr === utcNow.getUTCFullYear() ? '(العام الحالي)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Direct Custom Year Input for any year into infinity */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1950"
                    max="3000"
                    placeholder="سنة مخصصة..."
                    value={customYearInput}
                    onChange={(e) => {
                      setCustomYearInput(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed >= 1950 && parsed <= 3000) {
                        setCalendarYear(parsed);
                      }
                    }}
                    className="w-24 px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-center"
                    title="أدخل أي سنة مخصصة إلى ما لا نهاية"
                  />
                </div>
              </div>

              {/* Month Navigation */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear(prev => prev - 1);
                    } else {
                      setCalendarMonth(prev => prev - 1);
                    }
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="text-center min-w-[140px]">
                  <span className="text-sm font-black text-slate-900 block">
                    {ARABIC_MONTHS[calendarMonth]} {calendarYear}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear(prev => prev + 1);
                    } else {
                      setCalendarMonth(prev => prev + 1);
                    }
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                  title="الشهر التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCalendarYear(utcNow.getUTCFullYear());
                    setCalendarMonth(utcNow.getUTCMonth());
                    setSelectedCalendarDate(todayStr);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold transition mr-2"
                >
                  اليوم الحالي
                </button>
              </div>

            </div>

            {/* Quick 12 Months Ribbon */}
            <div className="overflow-x-auto pb-1">
              <div className="flex items-center gap-1.5 min-w-max">
                {ARABIC_MONTHS.map((mName, idx) => {
                  const isSelected = calendarMonth === idx;
                  return (
                    <button
                      key={mName}
                      type="button"
                      onClick={() => setCalendarMonth(idx)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Days Grid */}
            <div className="select-none">
              
              {/* Day of week headers */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-black text-slate-500">
                {WEEKDAYS.map((wd, i) => (
                  <div 
                    key={wd} 
                    className={`py-1.5 rounded-xl ${
                      i === 6 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-50'
                    }`}
                  >
                    <span>{wd}</span>
                    {i === 6 && <span className="text-[10px] block font-normal">(يوم الاجتماع)</span>}
                  </div>
                ))}
              </div>

              {/* Days Tiles */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((dItem, idx) => {
                  if (!dItem.isCurrentMonth) {
                    return (
                      <div 
                        key={`empty_${idx}`} 
                        className="h-20 sm:h-24 rounded-2xl bg-slate-50/40 border border-transparent"
                      />
                    );
                  }

                  const isSelected = dItem.dateStr === selectedCalendarDate;
                  const hasAttendance = dItem.attendeeCount > 0;

                  let dayTileBg = 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-400';
                  
                  if (hasAttendance) {
                    if (dItem.attendeeCount >= 10) {
                      dayTileBg = 'bg-gradient-to-br from-emerald-500 via-teal-600 to-indigo-600 text-white border-emerald-400 shadow-md shadow-emerald-500/25';
                    } else if (dItem.attendeeCount >= 4) {
                      dayTileBg = 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white border-emerald-400 shadow-sm';
                    } else {
                      dayTileBg = 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-teal-400 shadow-2xs';
                    }
                  } else if (dItem.isFriday) {
                    dayTileBg = 'bg-amber-50/70 border-amber-200 text-amber-950 hover:bg-amber-100/70';
                  }

                  return (
                    <button
                      key={dItem.dateStr}
                      type="button"
                      onClick={() => setSelectedCalendarDate(dItem.dateStr)}
                      className={`h-20 sm:h-24 p-2 rounded-2xl border transition-all text-right flex flex-col justify-between relative group ${dayTileBg} ${
                        isSelected 
                          ? 'ring-4 ring-indigo-500 ring-offset-2 scale-102 z-10' 
                          : 'hover:scale-101'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-sm sm:text-base font-black ${
                          hasAttendance ? 'text-white' : 'text-slate-900'
                        }`}>
                          {dItem.dayNum}
                        </span>

                        {dItem.isToday && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-2xs">
                            اليوم
                          </span>
                        )}
                      </div>

                      <div className="w-full text-center">
                        {hasAttendance ? (
                          <div className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-xs text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs">
                            <Check className="w-3 h-3 text-amber-300" />
                            <span>{dItem.attendeeCount} حاضر</span>
                          </div>
                        ) : dItem.isFriday ? (
                          <span className="text-[9px] text-amber-700/80 font-semibold block">
                            جمعة
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-300 block opacity-0 group-hover:opacity-100 transition">
                            لا حضور
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-bold text-slate-700">دليل ألوان التقويم:</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-md bg-gradient-to-br from-emerald-500 to-indigo-600 border border-emerald-400" />
                  <span>يوم مسجل به حضور</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-md bg-amber-100 border border-amber-300" />
                  <span>يوم جمعة (موعد الاجتماع)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-md ring-2 ring-indigo-500 bg-white" />
                  <span>اليوم المختار حالياً</span>
                </div>
              </div>

              <span className="text-[11px] text-slate-400">
                انقر على أي يوم لاستعراض قائمة مخدوميه بالأسفل
              </span>
            </div>

          </div>

          {/* Selected Date Table */}
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs bg-indigo-100 text-indigo-900 font-bold px-3 py-1 rounded-full border border-indigo-200 inline-block mb-1">
                  كشف الحضور التفصيلي لليوم المختار
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  {selectedDateFormattedTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  أسماء وبيانات جميع المخدومين الذين تم تسجيل حضورهم في هذا التاريخ المحدد.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportSelectedDateCSV}
                  disabled={selectedDateRecords.length === 0}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير كشف هذا اليوم</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition flex items-center gap-1.5"
                  title="طباعة الكشف"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">الصورة</th>
                    <th className="py-3 px-4">اسم المخدوم</th>
                    <th className="py-3 px-4">كود العضوية</th>
                    <th className="py-3 px-4">وقت الحضور</th>
                    <th className="py-3 px-4">طريقة التسجيل</th>
                    <th className="py-3 px-4">بيانات التواصل</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {selectedDateRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-600" />
                        <p className="text-sm font-bold text-slate-700">
                          لم يتم تسجيل أي حضور في تاريخ {selectedCalendarDate}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          يمكنك اختيار أي يوم آخر في التقويم أعلاه لعرض الحاضرين فيه.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    selectedDateRecords.map((record, index) => {
                      const member = registrantsMap.get(record.registrantId);
                      const cleanWa = (member?.whatsapp || member?.phone || '').replace(/\D/g, '');
                      const waLink = cleanWa ? `https://wa.me/${cleanWa}` : '#';
                      const cleanPhone = (member?.phone || '').replace(/[^0-9+]/g, '');
                      const telLink = cleanPhone ? `tel:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}` : '#';

                      return (
                        <tr key={record.id} className="hover:bg-indigo-50/20 transition">
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {index + 1}
                          </td>

                          <td className="py-3 px-4">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                              {record.registrantPhotoUrl && record.registrantPhotoUrl.trim() !== '' ? (
                                <img 
                                  src={record.registrantPhotoUrl} 
                                  alt={record.registrantName} 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">{(record.registrantName || '?').charAt(0)}</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                            {record.registrantName}
                          </td>

                          <td className="py-3 px-4 font-mono text-xs font-bold text-indigo-900">
                            {member?.uniqueCode || '—'}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600">
                            {new Date(record.timestamp).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </td>

                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                              record.method === 'camera_scan' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {record.method === 'camera_scan' ? (
                                <>
                                  <Camera className="w-3 h-3" />
                                  <span>مسح بالكاميرا</span>
                                </>
                              ) : (
                                <>
                                  <Keyboard className="w-3 h-3" />
                                  <span>إدخال يدوي</span>
                                </>
                              )}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              {member && (
                                <>
                                  <a
                                    href={telLink}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                    title="اتصال هاتفي"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                  <a
                                    href={waLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"
                                    title="مراسلة واتساب"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </a>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>حاضر</span>
                              </span>

                              {/* Independent Friday Stamp Toggle (Community Owner Only) */}
                              {currentUserRole === 'community_owner' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStampOnly(record.registrantId, record.date)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                    storageService.isFridayStampRevoked(record.registrantId, record.date)
                                      ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                  title={
                                    storageService.isFridayStampRevoked(record.registrantId, record.date)
                                      ? 'الختم ملغي لهذا اليوم. انقر لإعادة تفعيل الختم'
                                      : 'انقر هنا لإلغاء ختم الحضور فقط مع إبقاء تسجيل الحضور'
                                  }
                                >
                                  {storageService.isFridayStampRevoked(record.registrantId, record.date)
                                    ? 'الختم: ملغي ✕'
                                    : 'الختم: مفعل ✓'}
                                </button>
                              )}

                              {currentUserRole === 'community_owner' && (
                                deleteConfirmId === record.id ? (
                                  <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                                    <span className="text-[10px] text-red-700 font-bold">حذف الحضور والختم؟</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecord(record.id)}
                                      className="px-2 py-0.5 bg-red-600 text-white rounded-md text-[10px] font-bold"
                                    >
                                      نعم
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px]"
                                    >
                                      لا
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(record.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                    title="حذف الحضور والختم معاً بشكل نهائي"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          SECTION 3: نظام فلترة الغائبين والافتقاد وملاحظات الحالة الرعوية
          ========================================================================= */}
      {activeSection === 'absence_filter' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-rose-700 via-pink-800 to-slate-900 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-rose-500/30 text-rose-100 font-bold px-3 py-1 rounded-full border border-rose-400/30 text-xs mb-2">
                <UserX className="w-3.5 h-3.5 text-rose-200" />
                <span>نظام متابعة الغياب والافتقاد الرعوي</span>
              </div>
              <h2 className="text-2xl font-black text-white">
                فلترة الغائبين ومتابعة الافتقاد 🔍
              </h2>
              <p className="text-xs text-rose-100 mt-1 max-w-xl">
                تحديد دقيق لفترة الانقطاع (من أسبوعين، 3 أسابيع، شهر، شهرين إلى ما لا نهاية). تظهر ملاحظات الافتقاد الرعوية لكبار المسؤولين للمتابعة الحثيثة.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportAbsentListCSV}
                disabled={filteredAbsentList.length === 0}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-rose-700" />
                <span>تصدير كشف الغائبين (Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2.5 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                title="طباعة كشف الغائبين"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            </div>
          </div>

          {/* Comfortable Filter Controls Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
            
            {/* 0. Filter Category: المنقطعون عن الحضور | الكل | لم يحضروا بعد */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 flex-wrap">
              <span className="text-xs font-black text-slate-700">تصنيف العرض:</span>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs flex-wrap">
                <button
                  type="button"
                  onClick={() => setAbsenceCategoryFilter('absent_after_attendance')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                    absenceCategoryFilter === 'absent_after_attendance'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  المنقطعون بعد حضور سابق ({membersAbsenceData.filter(i => i.hasAttendedBefore).length})
                </button>
                <button
                  type="button"
                  onClick={() => setAbsenceCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                    absenceCategoryFilter === 'all'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  جميع المخدومين ({membersAbsenceData.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAbsenceCategoryFilter('never_attended')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                    absenceCategoryFilter === 'never_attended'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  لم يسجلوا حضور بعد (المدة فاضية) ({membersAbsenceData.filter(i => !i.hasAttendedBefore).length})
                </button>
              </div>
            </div>

            {/* 1. Quick Presets Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-rose-600" />
                  <span>اختر فترة الغياب المطلوبة:</span>
                </span>
                <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                  المحدد حالياً: {absenceThresholdDays} يوم فأكثر ({Math.floor(absenceThresholdDays / 7)} أسابيع)
                </span>
              </div>

              {/* Scrollable / Wrap Preset Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {ABSENCE_PRESETS.map((preset) => {
                  const isSelected = !isCustomAbsenceMode && absenceThresholdDays === preset.days;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => {
                        setAbsenceThresholdDays(preset.days);
                        setIsCustomAbsenceMode(false);
                      }}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2 border ${
                        isSelected
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? 'bg-rose-700 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {preset.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Custom Duration to Infinity Selector */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-700 shrink-0">
                  ♾️ تحديد أي مدة مخصصة إلى ما لا نهاية:
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={customAbsenceAmount}
                    onChange={(e) => setCustomAbsenceAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-center focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <select
                    value={customAbsenceUnit}
                    onChange={(e) => setCustomAbsenceUnit(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="days">يوم</option>
                    <option value="weeks">أسبوع</option>
                    <option value="months">شهر</option>
                    <option value="years">سنة</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyCustomAbsence}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-2xs"
                  >
                    تطبيق
                  </button>
                </div>
              </div>

              {/* Status Note on Senior Leaders Access */}
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                {isSeniorLeader ? (
                  <span className="text-emerald-700 font-bold">
                    أنت مسجل كمسؤول رئيسي — ملاحظات الافتقاد الرعوية معروضة لك بالكامل أدناه.
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">
                    ملاحظات الافتقاد الرعوية محفوظة ومحمية لمسؤولي الاجتماع الكبار.
                  </span>
                )}
              </div>
            </div>

            {/* 3. Search, Gender, and Sort Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث باسم المخدوم، الكود، أو الهاتف..."
                  value={absenceSearchQuery}
                  onChange={(e) => setAbsenceSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {absenceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAbsenceSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Gender & Sort Filters */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setAbsenceGenderFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                      absenceGenderFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbsenceGenderFilter('male')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                      absenceGenderFilter === 'male' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    شباب (ذكور)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbsenceGenderFilter('female')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                      absenceGenderFilter === 'female' ? 'bg-pink-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    شابات (إناث)
                  </button>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-bold text-[11px]">الترتيب:</span>
                  <select
                    value={absenceSortBy}
                    onChange={(e) => setAbsenceSortBy(e.target.value as any)}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="longest">الأطول غياباً أولاً</option>
                    <option value="shortest">الأقصر غياباً أولاً</option>
                    <option value="name">أبجدياً</option>
                  </select>
                </div>
              </div>

            </div>

          </div>

          {/* Results Summary Bar */}
          <div className="flex items-center justify-between px-2 text-xs">
            <span className="font-bold text-slate-600">
              تم العثور على <span className="text-rose-700 font-black">{filteredAbsentList.length}</span> مخدوم منقطع منذ {absenceThresholdDays} يوم فأكثر
            </span>
            <span className="text-slate-400 font-mono">
              تاريخ القياس: {todayStr}
            </span>
          </div>

          {/* Absent Members List Grid */}
          {filteredAbsentList.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-900">
                لا يوجد مخدومين غائبين لهذه الفترة المحددة ({absenceThresholdDays} يوم)!
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                جميع المخدومين منتظمون في الحضور أو فترة غيابهم أقل من {absenceThresholdDays} يوم. يمكنك تقليل مدة الفلتر لاستعراض فئات أخرى.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAbsentList.map((item) => {
                const member = item.member;
                const cleanWa = (member?.whatsapp || member?.phone || '').replace(/\D/g, '');
                const waLink = cleanWa ? `https://wa.me/${cleanWa}` : '#';
                const cleanPhone = (member?.phone || '').replace(/[^0-9+]/g, '');
                const telLink = cleanPhone ? `tel:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}` : '#';

                // Formatted Last Attendance Date
                let formattedLastDate = 'لم يسجل أي حضور منذ الانضمام';
                if (item.lastAttendDate) {
                  const parts = item.lastAttendDate.split('-');
                  if (parts.length === 3) {
                    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                    formattedLastDate = d.toLocaleDateString('ar-EG', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    });
                  } else {
                    formattedLastDate = item.lastAttendDate;
                  }
                }

                return (
                  <div 
                    key={member.id}
                    className="bg-white rounded-3xl p-5 border border-slate-200 hover:border-rose-400 hover:shadow-md transition flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Top Row: Photo, Name, Code, Badges */}
                      <div className="flex items-start gap-3.5">
                        <div className="w-14 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative flex items-center justify-center">
                          {member.photoUrl && member.photoUrl.trim() !== '' ? (
                            <img 
                              src={member.photoUrl} 
                              alt={member.fullName} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <span className="text-lg font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                          )}
                          <span className="absolute bottom-0 inset-x-0 text-center text-[9px] bg-black/60 text-white font-bold py-0.5">
                            {member.gender === 'male' ? 'ذكر' : 'أنثى'}
                          </span>
                        </div>

                        <div className="flex-1 text-right">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 font-bold">
                              {member.uniqueCode}
                            </span>
                            
                            {/* Absence Severity Pill - Only when attended before */}
                            {item.hasAttendedBefore && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                item.daysAbsent >= 60 
                                  ? 'bg-red-50 text-red-800 border-red-200' 
                                  : item.daysAbsent >= 30 
                                  ? 'bg-orange-50 text-orange-800 border-orange-200' 
                                  : 'bg-amber-50 text-amber-900 border-amber-200'
                              }`}>
                                {item.weeksAbsent > 0 
                                  ? `منقطع منذ ${item.weeksAbsent === 1 ? 'أسبوع' : item.weeksAbsent === 2 ? 'أسبوعين' : `${item.weeksAbsent} أسابيع`}`
                                  : `منقطع منذ ${item.daysAbsent} يوم`}
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-black text-slate-900 mt-0.5">
                            {member.fullName}
                          </h3>

                          <div className="mt-1 space-y-0.5 text-xs">
                            <div className="text-slate-500 font-medium text-[11px]">
                              <span>مدة الانقطاع: </span>
                              {item.hasAttendedBefore ? (
                                <strong className="text-rose-700 font-black">
                                  {item.formattedDuration}
                                </strong>
                              ) : (
                                <span className="text-slate-400 font-bold">— (فاضية / لا يوجد حضور سابق)</span>
                              )}
                            </div>

                            <div className="text-slate-400 text-[10px]">
                              <span>آخر حضور: </span>
                              <span className="font-bold text-slate-600">
                                {item.hasAttendedBefore ? formattedLastDate : '— (لم يسجل حضور بعد)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Contact Actions Bar */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <a
                            href={telLink}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1 transition"
                            title="اتصال هاتفي بالمخدوم"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-600" />
                            <span className="font-mono text-[11px]">{member.phone}</span>
                          </a>

                          {member.whatsapp && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1 transition border border-emerald-200"
                              title="مراسلة واتساب للافتقاد"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>واتساب</span>
                            </a>
                          )}
                        </div>

                        {/* Button to write a pastoral note */}
                        <button
                          type="button"
                          onClick={() => setNoteModalMember(member)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1 transition border border-indigo-200 shadow-2xs"
                          title="كتابة ملاحظة افتقاد جديدة عن حالة هذا المخدوم"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>تدوين ملاحظة ✍️</span>
                        </button>
                      </div>

                      {/* ========================================================
                          PASTORAL VISITATION NOTES (CONFIDENTIAL TO SENIOR LEADERS)
                          ======================================================== */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        {isSeniorLeader ? (
                          <div className="bg-slate-50/90 rounded-2xl p-3 border border-slate-200/90 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5 text-indigo-700" />
                                <span>ملاحظات الافتقاد الرعوية</span>
                                <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-mono text-[10px]">
                                  {item.visitationNotes.length}
                                </span>
                              </span>
                              <span className="text-[9px] text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5 text-amber-700" />
                                <span>خاص بالمسؤولين الكبار</span>
                              </span>
                            </div>

                            {item.visitationNotes.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic py-1">
                                لا توجد ملاحظات رعوية مدونة بعد. اضغط "تدوين ملاحظة" لإضافة تقرير الافتقاد.
                              </p>
                            ) : (
                              <div className="space-y-1.5 max-h-36 overflow-y-auto pl-1">
                                {item.visitationNotes.map(n => (
                                  <div key={n.id} className="bg-white p-2.5 rounded-xl border border-slate-200/80 text-right shadow-2xs">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                                      <span className="font-bold text-slate-700">
                                        ✍️ {n.authorName} ({n.authorRole === 'meeting_secretary' ? 'أمين الاجتماع' : n.authorRole === 'priest' ? 'الكاهن' : n.authorRole === 'community_owner' ? 'المالك' : n.authorRole === 'community_manager' ? 'مدير المجتمع' : 'خادم'})
                                      </span>
                                      <span className="font-mono text-slate-400">
                                        {new Date(n.createdAt).toLocaleDateString('ar-EG')}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                                      {n.notes}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-medium">
                            <Lock className="w-3.5 h-3.5 text-amber-600" />
                            <span>ملاحظات الافتقاد الرعوية مخصصة لمسؤولي الاجتماع الكبار (أمين الاجتماع، المالك، مدير المجتمع، الكاهن).</span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* =========================================================================
          SECTION 4: استيراد الحضور السريع الجماعي لكافة المخدومين (خاص بالمالك)
          ========================================================================= */}
      {activeSection === 'fast_import' && (
        <div className="space-y-6 animate-fadeIn">

          {/* Top Banner */}
          <div className="bg-gradient-to-r from-indigo-700 via-purple-800 to-slate-900 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-500/30 text-indigo-100 font-bold px-3 py-1 rounded-full border border-indigo-400/30 text-xs mb-2">
                <Crown className="w-3.5 h-3.5 text-amber-300" />
                <span>خاص حصرياً بمسؤول الموقع Community Owner 👑</span>
              </div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <span>استيراد الحضور السريع الجماعي</span>
                <span className="text-xs bg-indigo-500/40 border border-indigo-300/40 text-indigo-100 px-2.5 py-0.5 rounded-full font-mono">
                  {allYouthMembers.length} مخدوم بالسيستم
                </span>
              </h2>
              <p className="text-xs text-indigo-100 mt-1 max-w-2xl leading-relaxed">
                أسرع طريقة لتنزيل حضور مخدومي الاجتماع في ثوانٍ معدودة: حدد اليوم والشهر والسنة واضغط بنقرة سريعة على المخدومين الحاضرين لتثبيت حضورهم دفعة واحدة دون الحاجة للكاميرا أو الإدخال اليدوي الفردي.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveBulkAttendance}
                className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>تثبيت وحفظ الحضور الآن 💾 ({selectedImportMemberIds.size})</span>
              </button>
            </div>
          </div>

          {/* Feedback Banner */}
          {importFeedback && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-sm flex items-center justify-between shadow-xs animate-fadeIn">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{importFeedback}</span>
              </span>
              <button
                type="button"
                onClick={() => setImportFeedback(null)}
                className="text-xs text-emerald-700 hover:text-emerald-950 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Step 1: Precise Date Selection Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-800 font-black text-xs flex items-center justify-center">
                  1
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  تحديد تاريخ الحضور المراد تنزيله (اليوم، الشهر، السنة)
                </h3>
              </div>

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleSetDateToday}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                >
                  اليوم الحالي 📅
                </button>
                <button
                  type="button"
                  onClick={handleSetDateClosestFriday}
                  className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs transition border border-indigo-200"
                >
                  الجمعة الأخيرة 🕊️
                </button>
                <button
                  type="button"
                  onClick={handleSetDatePrevFriday}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                >
                  الجمعة السابقة ⏪
                </button>
              </div>
            </div>

            {/* Date Selectors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Day Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  اليوم (Day):
                </label>
                <select
                  value={safeImportDay}
                  onChange={(e) => setImportDay(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Array.from({ length: daysInImportMonth }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} ({WEEKDAYS[(new Date(importYear, importMonth, d).getDay() + 1) % 7]})
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  الشهر (Month):
                </label>
                <select
                  value={importMonth}
                  onChange={(e) => setImportMonth(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ARABIC_MONTHS.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}. {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Selector (Infinite Years) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    السنة (Year - مفتوحة لأي سنة):
                  </label>
                  <button
                    type="button"
                    onClick={() => setImportYear(new Date().getFullYear())}
                    className="text-[10px] text-indigo-700 hover:underline font-bold"
                  >
                    السنة الحالية ({new Date().getFullYear()})
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportYear((prev) => Math.max(1970, prev - 1))}
                    className="w-8 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer"
                    title="السنة السابقة"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1970}
                    value={importYear}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) {
                        setImportYear(val);
                      }
                    }}
                    placeholder="اكتب أي سنة..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-2 text-center text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setImportYear((prev) => prev + 1)}
                    className="w-8 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer"
                    title="السنة التالية"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Selected Date Summary & Live State Pill */}
            <div className="bg-indigo-50/80 rounded-2xl p-3.5 border border-indigo-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-700 shrink-0" />
                <span className="font-black text-indigo-950">
                  التاريخ المختار: <span className="underline decoration-indigo-400">{importFormattedTitle}</span>
                </span>
                <span className="font-mono text-[11px] text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                  ({importDateStr})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-900">
                  المسجلون مسبقاً بهذا التاريخ: <strong className="text-emerald-700">{attendanceRecords.filter(r => r.date === importDateStr).length}</strong> مخدوم
                </span>
                <button
                  type="button"
                  onClick={handleReloadExistingAttendance}
                  className="px-2.5 py-1 rounded-xl bg-white hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] border border-indigo-200 transition"
                  title="استعادة كشف الحاضرين المحفوظين في هذا اليوم"
                >
                  تحميل المحفوظ 🔄
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Controls, Bulk Buttons & Search */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-800 font-black text-xs flex items-center justify-center">
                  2
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  لوحة التحكم السريع وتحديد الحاضرين ({selectedImportMemberIds.size} محدد للحضور)
                </h3>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setImportViewMode('cards')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    importViewMode === 'cards' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  كروت سريعة
                </button>
                <button
                  type="button"
                  onClick={() => setImportViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    importViewMode === 'table' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  جدول كشف
                </button>
              </div>
            </div>

            {/* Quick Bulk Action Buttons Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSelectAllImport}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>تحديد الكل (حضور الجميع)</span>
              </button>

              <button
                type="button"
                onClick={handleDeselectAllImport}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs transition flex items-center gap-1.5 border border-slate-300 shadow-2xs cursor-pointer active:scale-95"
              >
                <Square className="w-3.5 h-3.5 text-slate-500" />
                <span>إلغاء تحديد الكل (تفريغ)</span>
              </button>

              <button
                type="button"
                onClick={handleSelectMalesImport}
                className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs transition border border-blue-200"
              >
                <span>👦 تحديد البنين فقط</span>
              </button>

              <button
                type="button"
                onClick={handleSelectFemalesImport}
                className="px-3 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-900 font-bold text-xs transition border border-pink-200"
              >
                <span>👧 تحديد البنات فقط</span>
              </button>

              <button
                type="button"
                onClick={handleInvertSelectionImport}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200"
                title="عكس التحديد الحالي"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>عكس التحديد</span>
              </button>

              <button
                type="button"
                onClick={() => setQuickPasteOpen(!quickPasteOpen)}
                className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs transition border border-purple-200 flex items-center gap-1.5 mr-auto"
              >
                <ClipboardList className="w-3.5 h-3.5 text-purple-700" />
                <span>لصق أكواد/أسماء 📋</span>
              </button>
            </div>

            {/* Quick Paste Accordion Box */}
            {quickPasteOpen && (
              <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2.5 animate-fadeIn">
                <label className="block text-xs font-bold text-purple-950">
                  الصق قائمة الأكواد أو الأسماء مباشرة (مفصولة بأسطر أو فواصل):
                </label>
                <textarea
                  rows={3}
                  value={quickPasteText}
                  onChange={(e) => setQuickPasteText(e.target.value)}
                  placeholder="مثال:&#10;MEM-001&#10;MEM-002&#10;مينا سامي&#10;0123456789"
                  className="w-full p-2.5 bg-white border border-purple-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-purple-800">
                    سيقوم النظام بمطابقة وتحديد كافة المخدومين فوراً بنقرة واحدة.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickPasteOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickPasteAnalyze}
                      disabled={!quickPasteText.trim()}
                      className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-black text-xs transition disabled:opacity-50 flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>تحديد المخدومين من النص ⚡</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Search and Category Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs flex-wrap w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setImportGenderFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    importGenderFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  الكل ({allYouthMembers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setImportGenderFilter('male')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    importGenderFilter === 'male' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  بنين ({allYouthMembers.filter(m => m.gender === 'male').length})
                </button>
                <button
                  type="button"
                  onClick={() => setImportGenderFilter('female')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    importGenderFilter === 'female' ? 'bg-white text-pink-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  بنات ({allYouthMembers.filter(m => m.gender === 'female').length})
                </button>
                <button
                  type="button"
                  onClick={() => setImportGenderFilter('selected')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    importGenderFilter === 'selected' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  المحددون للحضور ({selectedImportMemberIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setImportGenderFilter('unselected')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    importGenderFilter === 'unselected' ? 'bg-slate-700 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  غير محددين ({allYouthMembers.length - selectedImportMemberIds.size})
                </button>
              </div>

              {/* Instant Search Bar */}
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="بحث سريع بالاسم أو الكود..."
                  value={importSearchQuery}
                  onChange={(e) => setImportSearchQuery(e.target.value)}
                  className="w-full text-xs rounded-2xl border border-slate-300 py-2.5 pr-9 pl-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                {importSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setImportSearchQuery('')}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Roster of Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2 text-xs">
              <span className="font-bold text-slate-700">
                المعروض حالياً: <span className="font-black text-indigo-700">{filteredImportMembers.length}</span> مخدوم | 
                المحددون للحضور: <span className="font-black text-emerald-700">{selectedImportMemberIds.size}</span> مخدوم
              </span>
              <span className="text-slate-500 font-bold">
                نسبة حضور اليوم المختار: {allYouthMembers.length > 0 ? Math.round((selectedImportMemberIds.size / allYouthMembers.length) * 100) : 0}%
              </span>
            </div>

            {filteredImportMembers.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">لا توجد أسماء مطابقة لمعايير البحث الحالية</p>
              </div>
            ) : importViewMode === 'cards' ? (
              /* Mode 1: Fast Interactive Cards Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredImportMembers.map((member) => {
                  const isChecked = selectedImportMemberIds.has(member.id);

                  return (
                    <div
                      key={member.id}
                      onClick={() => handleToggleImportMember(member.id)}
                      className={`rounded-2xl p-3 border transition-all cursor-pointer flex items-center justify-between gap-2.5 select-none ${
                        isChecked
                          ? 'bg-emerald-50/90 border-emerald-400 shadow-xs ring-1 ring-emerald-300'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-11 h-13 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative flex items-center justify-center">
                          {member.photoUrl && member.photoUrl.trim() !== '' ? (
                            <img
                              src={member.photoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-bold text-slate-400">{(member.fullName || '?').charAt(0)}</span>
                          )}
                          <span className={`absolute bottom-0 inset-x-0 text-center text-[8px] font-bold py-0.2 text-white ${
                            member.gender === 'male' ? 'bg-blue-600/80' : 'bg-pink-600/80'
                          }`}>
                            {member.gender === 'male' ? 'ذكر' : 'أنثى'}
                          </span>
                        </div>

                        <div className="min-w-0 text-right">
                          <span className="font-mono text-[9px] text-slate-400 font-bold block">
                            {member.uniqueCode}
                          </span>
                          <h4 className="text-xs font-black text-slate-900 truncate">
                            {member.fullName}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-mono block truncate" dir="ltr">
                            {member.phone}
                          </span>
                        </div>
                      </div>

                      {/* Tactile Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleImportMember(member.id);
                        }}
                        className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition shrink-0 flex items-center gap-1 shadow-2xs ${
                          isChecked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-500'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300'
                        }`}
                      >
                        {isChecked ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>حاضر</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" />
                            <span>غائب</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Mode 2: Compact Roster Table */
              <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                    <tr>
                      <th className="py-3 px-3 text-center w-12">الحالة</th>
                      <th className="py-3 px-3">المخدوم</th>
                      <th className="py-3 px-3 font-mono">الكود</th>
                      <th className="py-3 px-3">النوع</th>
                      <th className="py-3 px-3 font-mono">الهاتف</th>
                      <th className="py-3 px-3 text-center">التحكم السريع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredImportMembers.map((member) => {
                      const isChecked = selectedImportMemberIds.has(member.id);
                      return (
                        <tr
                          key={member.id}
                          onClick={() => handleToggleImportMember(member.id)}
                          className={`cursor-pointer transition ${
                            isChecked ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleImportMember(member.id)}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {member.photoUrl && member.photoUrl.trim() !== '' ? (
                                <img src={member.photoUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                                  {(member.fullName || '?').charAt(0)}
                                </div>
                              )}
                              <span className="font-black text-slate-900">{member.fullName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 font-bold">{member.uniqueCode}</td>
                          <td className="py-2.5 px-3 text-slate-600">{member.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600" dir="ltr">{member.phone}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                              isChecked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isChecked ? 'حاضر ✓' : 'غائب ✕'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sticky Bottom Commit Bar */}
          <div className="sticky bottom-4 z-30 bg-slate-900 text-white rounded-3xl p-4 shadow-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center font-black shrink-0">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-xs text-indigo-300 font-bold">
                  تأكيد تنزيل حضور تاريخ: <span className="text-white underline">{importFormattedTitle}</span>
                </div>
                <div className="text-sm font-black flex items-center gap-2 mt-0.5">
                  <span>المحددون للحضور: {selectedImportMemberIds.size} من أصل {allYouthMembers.length}</span>
                  <span className="text-xs bg-emerald-500 text-slate-950 px-2 py-0.2 rounded-md font-bold">
                    {allYouthMembers.length > 0 ? Math.round((selectedImportMemberIds.size / allYouthMembers.length) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDeselectAllImport}
                className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                تفريغ التحديد
              </button>

              <button
                type="button"
                onClick={handleSaveBulkAttendance}
                className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وتثبيت حضور ({selectedImportMemberIds.size}) مخدوم الآن 💾</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          MODAL: تدوين ملاحظة افتقاد رعوية سريعة
          ========================================================================= */}
      {noteModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                  {noteModalMember.photoUrl && noteModalMember.photoUrl.trim() !== '' ? (
                    <img src={noteModalMember.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-slate-400">{(noteModalMember.fullName || '?').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تدوين ملاحظة افتقاد رعوية
                  </h3>
                  <p className="text-xs text-slate-600 font-bold mt-0.5">
                    {noteModalMember.fullName} ({noteModalMember.uniqueCode})
                  </p>
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md font-semibold mt-1 inline-block">
                    🔒 تظهر للمسؤولين الكبار للمتابعة
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNoteModalMember(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePastoralNote} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  اكتب ملاحظتك عن حالة المخدوم، سبب غيابه، أو تفاصيل التواصل معه:
                </label>
                <textarea
                  required
                  rows={4}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="مثال: تم الاتصال به، يعاني من وعكة صحية وسيحضر الجمعة القادمة بمشيئة الرب..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {noteSaveSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold text-center animate-fadeIn">
                  ✓ تم حفظ الملاحظة بنجاح وأصبحت متاحة لمتابعة المسؤولين الكبار!
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ الملاحظة الرعوية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNoteModalMember(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  إلغاء
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================
          MANUAL ATTENDANCE TYPING & AUTOCOMPLETE MODAL
          Requirement: "استيراد الحضور بالكتابة: عايز في سجل الحضور و الغياب خيار انو اقدر اسجل حضور بكتابة الاسم انا و بكتب في كلمات الاسم يظهر لي كل الاسماء الفيها نفس الحروف الانا بكتب فيها بعد كدا اختار الاسم ويتسجل حضور واذا اتسجل بالطرية دي يتعمل ليو معاو ختم الحضور"
          ======================================================== */}
      {isTypeAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 my-auto space-y-4 max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-500/20">
                  ✍️
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>تسجيل واستيراد الحضور بالكتابة</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                      ختم الحضور التلقائي 🏅
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اكتب حروف الاسم لتظهر لك الاقتراحات فوراً، وبمجرد اختيار الاسم يتسجل حضوره ويُمنح ختم الحضور مباشرة!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsTypeAttendanceModalOpen(false);
                  setTypeSearchQuery('');
                  setTypeSuccessNotice(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Date Selector */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700">تاريخ جلسة الحضور المستهدفة:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={typeTargetDate}
                  onChange={(e) => setTypeTargetDate(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 font-mono focus:ring-2 focus:ring-emerald-500"
                />
                {typeTargetDate === todayStr && (
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-1 rounded-lg">
                    اليوم
                  </span>
                )}
              </div>
            </div>

            {/* Feedback Alert */}
            {typeSuccessNotice && (
              <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-xs text-emerald-900 font-bold flex items-center justify-between animate-fadeIn shadow-xs shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{typeSuccessNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTypeSuccessNotice(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-[11px] p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Smart Search Input with Live Autocomplete */}
            <div className="relative shrink-0">
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={typeSearchQuery}
                onChange={(e) => setTypeSearchQuery(e.target.value)}
                autoFocus
                placeholder="اكتب حروف من اسم المخدوم هنا... (مثال: مارك، كيرلس، فادي، يوسف)"
                className="w-full pl-10 pr-11 py-3 text-sm font-bold bg-slate-50 hover:bg-slate-100/60 focus:bg-white border-2 border-slate-200 focus:border-emerald-500 rounded-2xl transition focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
              />
              {typeSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTypeSearchQuery('')}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Autocomplete Suggestions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[380px]">
              {!typeSearchQuery.trim() ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-xl text-slate-500">
                    🔍
                  </div>
                  <h4 className="text-xs font-bold text-slate-700">ابدأ بكتابة أي حرف من اسم المخدوم</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    بمجرد كتابة الحروف ستظهر كافة الأسماء المطابقة فوراً في هذه القائمة لاختيارها وتسجيل الحضور.
                  </p>
                </div>
              ) : matchingTypeMembers.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto text-xl text-amber-500">
                    ⚠️
                  </div>
                  <h4 className="text-xs font-bold text-slate-700">لا يوجد مخدوم يطابق: "{typeSearchQuery}"</h4>
                  <p className="text-[11px] text-slate-400">
                    يرجى التأكد من كتابة الاسم بصورة صحيحة أو تجربة البحث بجزء آخر من الاسم الثلاثي.
                  </p>
                </div>
              ) : (
                matchingTypeMembers.map((member) => {
                  const isAttended = attendanceRecords.some(
                    r => r.registrantId === member.id && r.date === typeTargetDate
                  );

                  return (
                    <div
                      key={member.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isAttended
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-300 shadow-2xs'
                      }`}
                    >
                      {/* Member Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                          {member.photoUrl ? (
                            <img src={member.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-xs">
                              {member.fullName[0]}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                              {member.fullName}
                            </h4>
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.2 rounded-md border border-slate-200 shrink-0">
                              {member.uniqueCode}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono" dir="ltr">{member.phone || member.whatsapp}</span>
                            <span>•</span>
                            <span>{member.gender === 'female' ? 'شابة 👧' : 'شاب 👦'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button & Stamp Status */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isAttended ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 text-xs font-black border border-emerald-300 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span>حاضر ومعه الختم 🏅</span>
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRecordTypeAttendance(member)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                          >
                            <span>تسجيل حضور + ختم ✍️🏅</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1">
                <span>💡 نصيحة: يمكنك كتابة أي مقطع من الاسم الثلاثي.</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsTypeAttendanceModalOpen(false);
                  setTypeSearchQuery('');
                  setTypeSuccessNotice(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
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
