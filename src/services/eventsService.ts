import {
  CommunityEvent,
  EventAttendance,
  EventAuditActionType,
  EventAuditLog,
  EventAvailabilityState,
  EventBus,
  EventPaymentContact,
  EventPermissionKey,
  EventRegistration,
  EventStaffAssignment,
  EventStaffRole,
  EventStatus,
  EventType,
  PaymentMethodType,
  PaymentStatus,
  PaymentTransaction,
  Registrant,
  RegistrationGroup,
  UserRole
} from '../types';
import {
  COMMUNITY_EVENTS_STORAGE_KEY,
  DELETED_EVENTS_STORAGE_KEY,
  EVENT_ATTENDANCES_STORAGE_KEY,
  EVENT_AUDIT_LOGS_STORAGE_KEY,
  EVENT_BUSES_STORAGE_KEY,
  EVENT_GROUPS_STORAGE_KEY,
  EVENT_PAYMENTS_STORAGE_KEY,
  EVENT_REGISTRATIONS_STORAGE_KEY,
  EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY,
  markEventsMutated,
  normalizeArabicNameForComparison,
  normalizePhoneForComparison,
  safeStorage,
  storageService
} from './storageService';

export const EVENT_TYPE_LABELS: Record<EventType, { label: string; icon: string; badgeClass: string }> = {
  trip: { label: 'رحلة (Trip)', icon: '🚌', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  spiritual_day: { label: 'يوم روحي (Spiritual Day)', icon: '🕊️', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  conference: { label: 'مؤتمر (Conference)', icon: '🏕️', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  retreat: { label: 'خلوة روحية (Retreat)', icon: '⛪', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  other: { label: 'فعالية أخرى', icon: '✨', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200' }
};

export const EVENT_STATUS_LABELS: Record<EventStatus, { label: string; badgeClass: string }> = {
  draft: { label: 'مسودة (Draft)', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
  registration_open: { label: 'التسجيل مفتوح (Open)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  registration_closed: { label: 'التسجيل مغلق (Closed)', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  completed: { label: 'مكتمل (Completed)', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  cancelled: { label: 'ملغي (Cancelled)', badgeClass: 'bg-red-100 text-red-800 border-red-300' },
  archived: { label: 'مؤرشف في الأرشيف 📦', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' }
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, { label: string; icon: string }> = {
  vodafone_cash: { label: 'فودافون كاش (Vodafone Cash)', icon: '📱' },
  instapay: { label: 'إنستاباي (InstaPay)', icon: '⚡' },
  bank_transfer: { label: 'تحويل بنكي (Bank Transfer)', icon: '🏦' },
  cash: { label: 'كاش في الاجتماع (Cash)', icon: '💵' },
  other: { label: 'طريقة أخرى', icon: '💳' }
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { label: string; badgeClass: string }> = {
  unpaid: { label: 'غير مدفوع (Unpaid)', badgeClass: 'bg-red-100 text-red-800 border-red-200' },
  pending_confirmation: { label: 'في انتظار تأكيد الدفع', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  partially_paid: { label: 'تم دفع جزء من الرسوم', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  paid: { label: 'تم الدفع بنجاح ✅', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  waived: { label: 'معفى بالكامل (Waived)', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  cancelled: { label: 'ملغي (Cancelled)', badgeClass: 'bg-slate-200 text-slate-600 border-slate-300' }
};

export const EVENT_STAFF_ROLE_LABELS: Record<EventStaffRole, { label: string; badgeClass: string; description: string }> = {
  EVENT_MANAGER: {
    label: 'مدير الفعالية الشامل (Event Manager)',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'صلاحية كاملة لإدارة الفعالية والتسجيلات والحسابات والباصات والتحضير والتقارير'
  },
  REGISTRATION_ORGANIZER: {
    label: 'مسؤول التسجيلات والحجوزات',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'عرض وتأكيد وإلغاء تسجيلات الأعضاء التابعين له ومتابعة بياناتهم'
  },
  PAYMENT_MANAGER: {
    label: 'مسؤول تأكيد المدفوعات والاشتراكات',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'تأكيد استلام الدفع الكامل وتسجيل الدفعات الجزئية ومراجعة الحسابات'
  },
  BUS_ORGANIZER: {
    label: 'مسؤول تنظيم وتسكين الباصات',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'توزيع المخدومين على الباصات ونقلهم بين الباصات ومتابعة المقاعد'
  },
  QR_ATTENDANCE: {
    label: 'مسؤول تحضير الـ QR والحضور (يوم الفعالية)',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'فتح كاميرا ماسح الـ QR Code وتسجيل صعود الركاب الفعلي في الباصات'
  },
  BUS_ATTENDANCE_ONLY: {
    label: 'مسؤول حضور باص محدد فقط (Bus Attendance Only)',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    description: 'عرض الباص المسؤول عنه فقط، مسح QR وتسجيل حضور وغياب ركاب هذا الباص بدون صلاحيات مالية'
  },
  OVERRIDE_EVENT_REGISTRATION_LIMITS: {
    label: 'صلاحية التسجيل الاستثنائي فوق الحد أو بعد الإغلاق',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    description: 'إضافة أعضاء يدوياً من الداشبورد حتى بعد اكتمال العدد أو انتهاء موعد التسجيل أو إغلاقه مع تسجيل السبب'
  }
};

export const EVENT_PERMISSION_DEFINITIONS: Array<{
  key: EventPermissionKey;
  category: 'registration' | 'payments' | 'buses' | 'attendance' | 'override';
  categoryLabel: string;
  label: string;
}> = [
  { key: 'VIEW_ASSIGNED_REGISTRATIONS', category: 'registration', categoryLabel: 'التسجيلات', label: 'عرض التسجيلات المخصصة للخادم' },
  { key: 'CONFIRM_REGISTRATION', category: 'registration', categoryLabel: 'التسجيلات', label: 'تأكيد وإضافة التسجيلات' },
  { key: 'CANCEL_REGISTRATION', category: 'registration', categoryLabel: 'التسجيلات', label: 'إلغاء أو استعادة التسجيلات' },
  { key: 'VIEW_PAYMENT_DETAILS', category: 'payments', categoryLabel: 'المدفوعات', label: 'عرض التفاصيل المالية للمسجلين' },
  { key: 'CONFIRM_PAYMENT', category: 'payments', categoryLabel: 'المدفوعات', label: 'تأكيد استلام الدفع الكامل' },
  { key: 'ADD_PARTIAL_PAYMENT', category: 'payments', categoryLabel: 'المدفوعات', label: 'إضافة دفعة جزئية' },
  { key: 'APPLY_DISCOUNT', category: 'payments', categoryLabel: 'المدفوعات', label: 'تخصيص خصم / دعم مالي فردي' },
  { key: 'VIEW_BUS_ASSIGNMENTS', category: 'buses', categoryLabel: 'الباصات والانتقالات', label: 'عرض توزيع الباصات' },
  { key: 'ASSIGN_MEMBERS_TO_BUSES', category: 'buses', categoryLabel: 'الباصات والانتقالات', label: 'تسكين الأعضاء في الباصات' },
  { key: 'MOVE_MEMBERS_BETWEEN_BUSES', category: 'buses', categoryLabel: 'الباصات والانتقالات', label: 'نقل الأعضاء بين الباصات' },
  { key: 'PREPARE_QR_ATTENDANCE', category: 'attendance', categoryLabel: 'الـ QR والحضور', label: 'تجهيز كشوفات الـ QR والحضور' },
  { key: 'SCAN_QR_CODES', category: 'attendance', categoryLabel: 'الـ QR والحضور', label: 'مسح أكواد الـ QR بالكاميرا' },
  { key: 'MANUAL_ATTENDANCE', category: 'attendance', categoryLabel: 'الـ QR والحضور', label: 'تحضير يدوي للركاب' },
  { key: 'BUS_ATTENDANCE_ONLY', category: 'attendance', categoryLabel: 'الـ QR والحضور', label: 'تحضير باص محدد فقط (بدون بيانات مالية)' },
  { key: 'OVERRIDE_EVENT_REGISTRATION_LIMITS', category: 'override', categoryLabel: 'صلاحيات استثنائية', label: 'التسجيل الاستثنائي بعد اكتمال العدد أو انتهاء الموعد' }
];

export interface EventAvailabilityEvaluation {
  state: EventAvailabilityState;
  canRegisterPublicly: boolean;
  labelAr: string;
  arabicLabel: string;
  arabicMessage: string;
  badgeClass: string;
  activeRegisteredCount: number;
  maxCapacity: number;
  isUnlimited: boolean;
  remainingSeats: number;
}

function readJsonArray<T>(key: string): T[] {
  const raw = safeStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, items: T[]): void {
  markEventsMutated();
  safeStorage.setItem(key, JSON.stringify(items));
}

function pushEventsStateToServerAndCloud(actorUserId?: string): void {
  markEventsMutated();
  const payload = {
    actorUserId,
    communityEvents: readJsonArray<CommunityEvent>(COMMUNITY_EVENTS_STORAGE_KEY),
    deletedEventIds: readJsonArray<string>(DELETED_EVENTS_STORAGE_KEY),
    eventGroups: readJsonArray<RegistrationGroup>(EVENT_GROUPS_STORAGE_KEY),
    eventRegistrations: readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY),
    eventPayments: readJsonArray<PaymentTransaction>(EVENT_PAYMENTS_STORAGE_KEY),
    eventBuses: readJsonArray<EventBus>(EVENT_BUSES_STORAGE_KEY),
    eventAttendances: readJsonArray<EventAttendance>(EVENT_ATTENDANCES_STORAGE_KEY),
    eventAuditLogs: readJsonArray<EventAuditLog>(EVENT_AUDIT_LOGS_STORAGE_KEY),
    eventStaffAssignments: readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY)
  };

  fetch('/api/community-events/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});

  storageService.syncSystemState().catch(() => {});
  storageService.notifyUpdate();
}

export function calculatePaymentStatus(
  finalRequiredAmount: number,
  totalPaidAmount: number,
  discountAmount: number,
  originalPrice: number,
  currentStatus?: PaymentStatus
): PaymentStatus {
  if (finalRequiredAmount <= 0 && discountAmount >= originalPrice && originalPrice > 0) {
    return 'waived';
  }
  if (finalRequiredAmount <= 0) {
    return 'paid';
  }
  if (totalPaidAmount >= finalRequiredAmount) {
    return 'paid';
  }
  if (totalPaidAmount > 0 && totalPaidAmount < finalRequiredAmount) {
    return 'partially_paid';
  }
  if (currentStatus === 'pending_confirmation') {
    return 'pending_confirmation';
  }
  return 'unpaid';
}

export function generateRegistrationReference(existingRegistrations: EventRegistration[]): string {
  const year = new Date().getFullYear();
  let maxSeq = 100;
  for (const reg of existingRegistrations) {
    const m = (reg.registrationReference || '').match(/#REG-\d{4}-(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(5, '0');
  return `#REG-${year}-${nextSeq}`;
}

export interface EventSummaryStats {
  totalRegistered: number;
  normalRegisteredCount: number;
  overrideRegisteredCount: number;
  totalCancelled: number;
  totalWaitlisted: number;
  maxCapacity: number;
  isUnlimitedCapacity: boolean;
  availableSeats: number;
  availability: EventAvailabilityEvaluation;
  totalCheckedIn: number;
  totalNotCheckedIn: number;
  totalOriginalPrice: number;
  totalDiscounts: number;
  totalRequiredMoney: number;
  totalCollectedPaid: number;
  totalPendingRemaining: number;
  paidCount: number;
  partiallyPaidCount: number;
  pendingConfirmationCount: number;
  unpaidCount: number;
  waivedCount: number;
  totalBusCapacity: number;
  totalBusAssigned: number;
  availableBusSeats: number;
}

export interface UserEventPermissions {
  isSuperAdmin: boolean;
  hasAccess: boolean;
  assignedRoles: EventStaffRole[];
  grantedPermissions: EventPermissionKey[];
  assignedBusIds: string[];
  isBusAttendanceOnly: boolean;
  onlyOwnAssignedRegistrations: boolean;
  canManageEventSettings: boolean;
  canManageStaff: boolean;
  canViewRegistrations: boolean;
  canManageRegistrations: boolean;
  canCancelRegistrations: boolean;
  canOverrideRegistrationLimits: boolean;
  canViewPaymentDetails: boolean;
  canManagePayments: boolean;
  canAddPartialPayments: boolean;
  canDeletePayments: boolean;
  canManageDiscounts: boolean;
  canViewBuses: boolean;
  canManageBuses: boolean;
  canMoveMembersBetweenBuses: boolean;
  canCreateOrDeleteBuses: boolean;
  canScanAttendance: boolean;
  canManualAttendance: boolean;
  canViewReports: boolean;
  canExportData: boolean;
}

export function derivePermissionsFromRoles(roles: EventStaffRole[], explicitPerms?: EventPermissionKey[]): EventPermissionKey[] {
  if (Array.isArray(explicitPerms)) {
    const explicitSet = new Set<EventPermissionKey>(explicitPerms);
    if (roles.includes('OVERRIDE_EVENT_REGISTRATION_LIMITS')) {
      explicitSet.add('OVERRIDE_EVENT_REGISTRATION_LIMITS');
    }
    return Array.from(explicitSet);
  }
  const set = new Set<EventPermissionKey>();
  for (const r of roles) {
    if (r === 'EVENT_MANAGER') {
      EVENT_PERMISSION_DEFINITIONS.forEach(d => {
        if (d.key !== 'BUS_ATTENDANCE_ONLY') set.add(d.key);
      });
    } else if (r === 'REGISTRATION_ORGANIZER') {
      set.add('VIEW_ASSIGNED_REGISTRATIONS');
      set.add('CONFIRM_REGISTRATION');
      set.add('CANCEL_REGISTRATION');
      set.add('VIEW_PAYMENT_DETAILS');
      set.add('CONFIRM_PAYMENT');
    } else if (r === 'PAYMENT_MANAGER') {
      set.add('VIEW_ASSIGNED_REGISTRATIONS');
      set.add('VIEW_PAYMENT_DETAILS');
      set.add('CONFIRM_PAYMENT');
      set.add('ADD_PARTIAL_PAYMENT');
    } else if (r === 'BUS_ORGANIZER') {
      set.add('VIEW_BUS_ASSIGNMENTS');
      set.add('ASSIGN_MEMBERS_TO_BUSES');
      set.add('MOVE_MEMBERS_BETWEEN_BUSES');
    } else if (r === 'QR_ATTENDANCE') {
      set.add('PREPARE_QR_ATTENDANCE');
      set.add('SCAN_QR_CODES');
      set.add('MANUAL_ATTENDANCE');
    } else if (r === 'BUS_ATTENDANCE_ONLY') {
      set.add('BUS_ATTENDANCE_ONLY');
      set.add('SCAN_QR_CODES');
      set.add('MANUAL_ATTENDANCE');
    } else if (r === 'OVERRIDE_EVENT_REGISTRATION_LIMITS') {
      set.add('OVERRIDE_EVENT_REGISTRATION_LIMITS');
    }
  }
  return Array.from(set);
}

export const eventsService = {
  // ==========================================
  // 0. RBAC & EVENT STAFF ASSIGNMENTS
  // ==========================================
  isUserSuperAdmin(user?: Registrant | null, role?: UserRole): boolean {
    const effectiveRole = role || user?.role;
    if (
      effectiveRole === 'community_owner' ||
      effectiveRole === 'community_manager' ||
      effectiveRole === 'meeting_secretary' ||
      effectiveRole === 'service_secretary' ||
      effectiveRole === 'priest'
    ) {
      return true;
    }
    if (user?.id === 'reg_owner_main') return true;
    if (user?.permissions?.canManageEvents) return true;
    return false;
  },

  evaluateEventRegistrationAvailability(
    eventOrId: CommunityEvent | string | null | undefined
  ): EventAvailabilityEvaluation {
    const event = typeof eventOrId === 'string' ? this.getEventById(eventOrId) : eventOrId;
    if (!event) {
      return {
        state: 'registration_closed',
        canRegisterPublicly: false,
        labelAr: 'التسجيل مغلق',
        arabicLabel: 'التسجيل مغلق',
        arabicMessage: 'التسجيل مغلق حالياً لهذه الفعالية.',
        badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
        activeRegisteredCount: 0,
        maxCapacity: 0,
        isUnlimited: false,
        remainingSeats: 0
      };
    }

    const activeRegs = this.getRegistrations(event.id).filter(
      r => r.registrationStatus === 'registered'
    );
    const activeCount = activeRegs.length;
    const isUnlimited =
      event.capacityType === 'unlimited' || !event.maxCapacity || Number(event.maxCapacity) <= 0;
    const maxCap = isUnlimited ? 0 : Math.max(0, Number(event.maxCapacity || 0));
    const remainingSeats = isUnlimited ? 999999 : Math.max(0, maxCap - activeCount);

    // Priority 0: archived
    if (event.status === 'archived' || event.isArchived) {
      return {
        state: 'registration_closed',
        canRegisterPublicly: false,
        labelAr: 'مؤرشفة في الأرشيف 📦',
        arabicLabel: 'مؤرشفة في الأرشيف 📦',
        arabicMessage: 'هذه الفعالية محفوظة في الأرشيف ولا تقبل تسجيلات جديدة.',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        activeRegisteredCount: activeCount,
        maxCapacity: maxCap,
        isUnlimited,
        remainingSeats
      };
    }

    // Priority 1: draft
    if (event.status === 'draft') {
      return {
        state: 'draft',
        canRegisterPublicly: false,
        labelAr: 'لا تظهر للعامة',
        arabicLabel: 'لا تظهر للعامة',
        arabicMessage: 'هذه الفعالية في وضع المسودة ولا تظهر للعامة حالياً.',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        activeRegisteredCount: activeCount,
        maxCapacity: maxCap,
        isUnlimited,
        remainingSeats
      };
    }

    // Check manual visibility toggle
    if (event.isVisibleToMembers === false) {
      return {
        state: 'registration_closed',
        canRegisterPublicly: false,
        labelAr: 'مخفية عن المخدومين',
        arabicLabel: 'مخفية عن المخدومين',
        arabicMessage: 'هذه الفعالية مخفية حالياً عن صفحة المخدومين من قبل الإدارة.',
        badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
        activeRegisteredCount: activeCount,
        maxCapacity: maxCap,
        isUnlimited,
        remainingSeats
      };
    }

    // Check if event end date & time have passed
    const endYmd = (event.endDate || event.startDate || '').trim();
    if (endYmd) {
      const endTimeStr = (event.endTime || '23:59').trim() || '23:59';
      const endTimestamp = new Date(`${endYmd}T${endTimeStr}:59`).getTime();
      if (!Number.isNaN(endTimestamp) && Date.now() > endTimestamp) {
        return {
          state: 'registration_closed',
          canRegisterPublicly: false,
          labelAr: 'انتهى موعد الفعالية',
          arabicLabel: 'انتهى موعد الفعالية',
          arabicMessage: 'انتهى موعد هذه الفعالية وأُغلق التسجيل بها.',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
          activeRegisteredCount: activeCount,
          maxCapacity: maxCap,
          isUnlimited,
          remainingSeats
        };
      }
    }

    // Priority 2: registration_closed (or completed / cancelled)
    if (
      event.status === 'registration_closed' ||
      event.status === 'completed' ||
      event.status === 'cancelled'
    ) {
      return {
        state: 'registration_closed',
        canRegisterPublicly: false,
        labelAr: 'التسجيل مغلق',
        arabicLabel: 'التسجيل مغلق',
        arabicMessage: 'التسجيل مغلق حالياً لهذه الفعالية من قبل الإدارة.',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        activeRegisteredCount: activeCount,
        maxCapacity: maxCap,
        isUnlimited,
        remainingSeats
      };
    }

    // Priority 3: deadline_passed
    if (event.registrationDeadline && event.registrationDeadline.trim()) {
      const todayYmd = new Date().toISOString().split('T')[0];
      if (todayYmd > event.registrationDeadline.trim()) {
        return {
          state: 'deadline_passed',
          canRegisterPublicly: false,
          labelAr: 'انتهى وقت التسجيل',
          arabicLabel: 'انتهى وقت التسجيل',
          arabicMessage: 'انتهى الموعد النهائي المحدد للتسجيل في هذه الفعالية.',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
          activeRegisteredCount: activeCount,
          maxCapacity: maxCap,
          isUnlimited,
          remainingSeats
        };
      }
    }

    // Priority 4: capacity_full (only when Limited Capacity)
    if (!isUnlimited && maxCap > 0 && activeCount >= maxCap) {
      return {
        state: 'capacity_full',
        canRegisterPublicly: false,
        labelAr: 'اكتمل العدد',
        arabicLabel: 'اكتمل العدد',
        arabicMessage: 'اكتمل العدد الأقصى المتاح للتسجيل في هذه الفعالية.',
        badgeClass: 'bg-red-100 text-red-800 border-red-300',
        activeRegisteredCount: activeCount,
        maxCapacity: maxCap,
        isUnlimited,
        remainingSeats: 0
      };
    }

    // Priority 5: open
    return {
      state: 'open',
      canRegisterPublicly: true,
      labelAr: 'سجل الآن',
      arabicLabel: 'سجل الآن',
      arabicMessage: 'التسجيل مفتوح ومتاح الآن.',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      activeRegisteredCount: activeCount,
      maxCapacity: maxCap,
      isUnlimited,
      remainingSeats
    };
  },

  getEventStaffAssignments(eventId?: string): EventStaffAssignment[] {
    const all = readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY);
    const filtered = eventId ? all.filter(a => a.eventId === eventId) : all;
    return filtered.sort((a, b) => new Date(b.updatedAt || b.assignedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.assignedAt || a.createdAt).getTime());
  },

  assignServantToEvent(params: {
    eventId: string;
    servant: Registrant;
    roles: EventStaffRole[];
    permissions?: EventPermissionKey[];
    assignedBusId?: string | null;
    assignedBy: string;
    actorUserId?: string;
  }): EventStaffAssignment {
    const all = readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY);
    const nowIso = new Date().toISOString();
    const cleanRoles = Array.from(new Set(params.roles));
    const cleanPerms = derivePermissionsFromRoles(cleanRoles, params.permissions);

    const existingIdx = all.findIndex(
      a => a.eventId === params.eventId && a.userId === params.servant.id
    );

    if (existingIdx >= 0) {
      const prev = all[existingIdx];
      const updated: EventStaffAssignment = {
        ...prev,
        userName: params.servant.fullName,
        userPhone: params.servant.whatsapp || params.servant.phone,
        userRole: params.servant.role,
        userPhotoUrl: params.servant.photoUrl,
        roles: cleanRoles,
        permissions: cleanPerms,
        assignedBusId: params.assignedBusId !== undefined ? params.assignedBusId : prev.assignedBusId,
        updatedAt: nowIso
      };
      all[existingIdx] = updated;
      writeJsonArray(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, all);
      this.recordAuditLog({
        eventId: params.eventId,
        memberId: params.servant.id,
        memberName: params.servant.fullName,
        actionType: 'staff_updated',
        oldValue: prev.roles.join(', '),
        newValue: cleanRoles.join(', '),
        reason: 'تحديث صلاحيات الخادم في الفعالية',
        changedBy: params.assignedBy
      });
      pushEventsStateToServerAndCloud(params.actorUserId);
      return updated;
    } else {
      const created: EventStaffAssignment = {
        id: `evstaff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        eventId: params.eventId,
        userId: params.servant.id,
        userName: params.servant.fullName,
        userPhone: params.servant.whatsapp || params.servant.phone,
        userRole: params.servant.role,
        userPhotoUrl: params.servant.photoUrl,
        roles: cleanRoles,
        permissions: cleanPerms,
        assignedBusId: params.assignedBusId || null,
        assignedBy: params.assignedBy,
        assignedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      all.unshift(created);
      writeJsonArray(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, all);
      this.recordAuditLog({
        eventId: params.eventId,
        memberId: params.servant.id,
        memberName: params.servant.fullName,
        actionType: 'staff_assigned',
        newValue: cleanRoles.join(', '),
        reason: 'تعيين خادم مسؤول في الفعالية',
        changedBy: params.assignedBy
      });
      pushEventsStateToServerAndCloud(params.actorUserId);
      return created;
    }
  },

  removeServantFromEvent(assignmentId: string, actorName: string = 'المسؤول', actorUserId?: string): void {
    const all = readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY);
    const target = all.find(a => a.id === assignmentId);
    if (!target) return;

    const remaining = all.filter(a => a.id !== assignmentId);
    writeJsonArray(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, remaining);
    this.recordAuditLog({
      eventId: target.eventId,
      memberId: target.userId,
      memberName: target.userName,
      actionType: 'staff_removed',
      oldValue: target.roles.join(', '),
      reason: 'إلغاء تكليف الخادم من الفعالية',
      changedBy: actorName
    });
    pushEventsStateToServerAndCloud(actorUserId);
  },

  getUserEventPermissions(
    eventId: string,
    user?: Registrant | null,
    role?: UserRole
  ): UserEventPermissions {
    const isSuperAdmin = this.isUserSuperAdmin(user, role);
    if (isSuperAdmin) {
      const allPerms = EVENT_PERMISSION_DEFINITIONS.map(d => d.key).filter(k => k !== 'BUS_ATTENDANCE_ONLY');
      return {
        isSuperAdmin: true,
        hasAccess: true,
        assignedRoles: ['EVENT_MANAGER'],
        grantedPermissions: allPerms,
        assignedBusIds: [],
        isBusAttendanceOnly: false,
        onlyOwnAssignedRegistrations: false,
        canManageEventSettings: true,
        canManageStaff: true,
        canViewRegistrations: true,
        canManageRegistrations: true,
        canCancelRegistrations: true,
        canOverrideRegistrationLimits: true,
        canViewPaymentDetails: true,
        canManagePayments: true,
        canAddPartialPayments: true,
        canDeletePayments: true,
        canManageDiscounts: true,
        canViewBuses: true,
        canManageBuses: true,
        canMoveMembersBetweenBuses: true,
        canCreateOrDeleteBuses: true,
        canScanAttendance: true,
        canManualAttendance: true,
        canViewReports: true,
        canExportData: true
      };
    }

    if (!user?.id || !eventId) {
      return {
        isSuperAdmin: false,
        hasAccess: false,
        assignedRoles: [],
        grantedPermissions: [],
        assignedBusIds: [],
        isBusAttendanceOnly: false,
        onlyOwnAssignedRegistrations: true,
        canManageEventSettings: false,
        canManageStaff: false,
        canViewRegistrations: false,
        canManageRegistrations: false,
        canCancelRegistrations: false,
        canOverrideRegistrationLimits: false,
        canViewPaymentDetails: false,
        canManagePayments: false,
        canAddPartialPayments: false,
        canDeletePayments: false,
        canManageDiscounts: false,
        canViewBuses: false,
        canManageBuses: false,
        canMoveMembersBetweenBuses: false,
        canCreateOrDeleteBuses: false,
        canScanAttendance: false,
        canManualAttendance: false,
        canViewReports: false,
        canExportData: false
      };
    }

    const assignment = this.getEventStaffAssignments(eventId).find(a => a.userId === user.id);
    const myBuses = this.getBuses(eventId).filter(b => b.responsibleServantId === user.id);
    const assignedBusIds = Array.from(
      new Set([
        ...(assignment?.assignedBusId ? [assignment.assignedBusId] : []),
        ...myBuses.map(b => b.id)
      ])
    );

    const roles = [...(assignment?.roles || [])];
    if (myBuses.length > 0 && !roles.includes('BUS_ATTENDANCE_ONLY') && !roles.includes('EVENT_MANAGER') && !roles.includes('QR_ATTENDANCE')) {
      roles.push('BUS_ATTENDANCE_ONLY');
    }

    const perms = derivePermissionsFromRoles(roles, assignment?.permissions);
    const hasPerm = (k: EventPermissionKey) => perms.includes(k);
    const isEventManager = roles.includes('EVENT_MANAGER');

    // Check if servant is also listed in whatsappContacts for this event
    const event = this.getEventById(eventId);
    const isPaymentContactServant = Boolean(
      event?.whatsappContacts?.some(c => c.servantId === user.id)
    );
    if (isPaymentContactServant && !hasPerm('VIEW_ASSIGNED_REGISTRATIONS')) {
      perms.push('VIEW_ASSIGNED_REGISTRATIONS');
    }

    const hasAccess = roles.length > 0 || perms.length > 0 || assignedBusIds.length > 0;
    const isBusAttendanceOnly =
      !isEventManager &&
      (roles.includes('BUS_ATTENDANCE_ONLY') || assignedBusIds.length > 0) &&
      !roles.includes('REGISTRATION_ORGANIZER') &&
      !roles.includes('PAYMENT_MANAGER') &&
      !roles.includes('BUS_ORGANIZER') &&
      !roles.includes('QR_ATTENDANCE');

    const canViewRegistrations =
      !isBusAttendanceOnly &&
      (isEventManager ||
        hasPerm('VIEW_ASSIGNED_REGISTRATIONS') ||
        hasPerm('CONFIRM_REGISTRATION') ||
        hasPerm('VIEW_PAYMENT_DETAILS') ||
        hasPerm('CONFIRM_PAYMENT'));

    const canManageRegistrations =
      !isBusAttendanceOnly && (isEventManager || hasPerm('CONFIRM_REGISTRATION'));
    const canCancelRegistrations =
      !isBusAttendanceOnly && (isEventManager || hasPerm('CANCEL_REGISTRATION'));
    const canOverrideRegistrationLimits =
      isEventManager || hasPerm('OVERRIDE_EVENT_REGISTRATION_LIMITS');

    const canViewPaymentDetails =
      !isBusAttendanceOnly &&
      (isEventManager ||
        hasPerm('VIEW_PAYMENT_DETAILS') ||
        hasPerm('CONFIRM_PAYMENT') ||
        hasPerm('ADD_PARTIAL_PAYMENT'));
    const canManagePayments =
      !isBusAttendanceOnly &&
      (isEventManager || hasPerm('CONFIRM_PAYMENT') || hasPerm('ADD_PARTIAL_PAYMENT'));
    const canAddPartialPayments =
      !isBusAttendanceOnly && (isEventManager || hasPerm('ADD_PARTIAL_PAYMENT'));
    const canManageDiscounts =
      !isBusAttendanceOnly && (isEventManager || hasPerm('APPLY_DISCOUNT'));

    const canViewBuses =
      isEventManager ||
      hasPerm('VIEW_BUS_ASSIGNMENTS') ||
      hasPerm('ASSIGN_MEMBERS_TO_BUSES') ||
      hasPerm('MOVE_MEMBERS_BETWEEN_BUSES');
    const canManageBuses =
      !isBusAttendanceOnly &&
      (isEventManager ||
        hasPerm('ASSIGN_MEMBERS_TO_BUSES') ||
        hasPerm('MOVE_MEMBERS_BETWEEN_BUSES'));
    const canMoveMembersBetweenBuses =
      !isBusAttendanceOnly && (isEventManager || hasPerm('MOVE_MEMBERS_BETWEEN_BUSES'));

    const canScanAttendance =
      isEventManager ||
      hasPerm('SCAN_QR_CODES') ||
      hasPerm('PREPARE_QR_ATTENDANCE') ||
      hasPerm('BUS_ATTENDANCE_ONLY') ||
      assignedBusIds.length > 0;
    const canManualAttendance =
      isEventManager ||
      hasPerm('MANUAL_ATTENDANCE') ||
      hasPerm('BUS_ATTENDANCE_ONLY') ||
      assignedBusIds.length > 0;

    return {
      isSuperAdmin: false,
      hasAccess,
      assignedRoles: roles,
      grantedPermissions: perms,
      assignedBusIds,
      isBusAttendanceOnly,
      onlyOwnAssignedRegistrations: !isEventManager,
      canManageEventSettings: isEventManager,
      canManageStaff: false,
      canViewRegistrations,
      canManageRegistrations,
      canCancelRegistrations,
      canOverrideRegistrationLimits,
      canViewPaymentDetails,
      canManagePayments,
      canAddPartialPayments,
      canDeletePayments: isEventManager,
      canManageDiscounts,
      canViewBuses,
      canManageBuses,
      canMoveMembersBetweenBuses,
      canCreateOrDeleteBuses: isEventManager,
      canScanAttendance,
      canManualAttendance,
      canViewReports: isEventManager,
      canExportData: hasAccess
    };
  },

  getAccessibleEventsForUser(user?: Registrant | null, role?: UserRole): CommunityEvent[] {
    const allEvents = this.getEvents();
    if (this.isUserSuperAdmin(user, role)) {
      return allEvents;
    }
    if (!user?.id) return [];

    const myAssignments = this.getEventStaffAssignments().filter(
      a =>
        a.userId === user.id &&
        ((Array.isArray(a.roles) && a.roles.length > 0) ||
          (Array.isArray(a.permissions) && a.permissions.length > 0))
    );
    const myBuses = this.getBuses().filter(b => b.responsibleServantId === user.id);
    const assignedEventIds = new Set([
      ...myAssignments.map(a => a.eventId),
      ...myBuses.map(b => b.eventId)
    ]);

    for (const ev of allEvents) {
      if (ev.whatsappContacts?.some(c => c.servantId === user.id)) {
        assignedEventIds.add(ev.id);
      }
    }

    return allEvents.filter(ev => assignedEventIds.has(ev.id));
  },

  hasAnyEventAccessForAdminMenu(user?: Registrant | null, role?: UserRole): boolean {
    if (this.isUserSuperAdmin(user, role)) return true;
    if (!user?.id) return false;
    return this.getAccessibleEventsForUser(user, role).length > 0;
  },

  /**
   * Retrieve all existing Servants & Leaders from «المخدومين والرتب» (`role !== 'member'`)
   * so admins can select them for WhatsApp Payment Contacts or Event Staff Assignments.
   */
  getAvailableServantsFromMakhdomeen(searchQuery?: string): Registrant[] {
    const allServants = storageService
      .getRegistrants()
      .filter(r => r && r.status !== 'cancelled' && r.role && r.role !== 'member');

    const q = (searchQuery || '').trim();
    if (!q) {
      return allServants.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
    }

    const normName = normalizeArabicNameForComparison(q);
    const digits = q.replace(/\D/g, '');
    const upper = q.toUpperCase();

    return allServants
      .filter(s => {
        const sNorm = normalizeArabicNameForComparison(s.fullName);
        const sPhone = (s.whatsapp || s.phone || '').replace(/\D/g, '');
        const sCode = (s.uniqueCode || '').toUpperCase();
        return (
          (normName && sNorm.includes(normName)) ||
          (digits.length >= 3 && sPhone.includes(digits)) ||
          (upper.length >= 2 && sCode.includes(upper))
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
  },

  // ==========================================
  // 1. AUDIT LOGGING
  // ==========================================
  getAuditLogs(eventId?: string): EventAuditLog[] {
    const logs = readJsonArray<EventAuditLog>(EVENT_AUDIT_LOGS_STORAGE_KEY);
    const filtered = eventId ? logs.filter(l => l.eventId === eventId) : logs;
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  recordAuditLog(entry: {
    eventId: string;
    registrationId?: string;
    memberId?: string;
    memberName?: string;
    actionType: EventAuditActionType;
    oldValue?: string;
    newValue?: string;
    reason?: string;
    changedBy: string;
  }): EventAuditLog {
    const logs = readJsonArray<EventAuditLog>(EVENT_AUDIT_LOGS_STORAGE_KEY);
    const newLog: EventAuditLog = {
      id: `evlog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: entry.eventId,
      registrationId: entry.registrationId,
      memberId: entry.memberId,
      memberName: entry.memberName,
      actionType: entry.actionType,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      reason: entry.reason,
      changedBy: entry.changedBy || 'المسؤول',
      createdAt: new Date().toISOString()
    };
    logs.unshift(newLog);
    writeJsonArray(EVENT_AUDIT_LOGS_STORAGE_KEY, logs.slice(0, 2000));
    return newLog;
  },

  // ==========================================
  // 2. EVENTS CRUD
  // ==========================================
  getDeletedEventIds(): Set<string> {
    return new Set(readJsonArray<string>(DELETED_EVENTS_STORAGE_KEY));
  },

  getEvents(): CommunityEvent[] {
    const delIds = this.getDeletedEventIds();
    const list = readJsonArray<CommunityEvent>(COMMUNITY_EVENTS_STORAGE_KEY).filter(
      ev => ev && ev.id && !delIds.has(ev.id)
    );
    return list.sort((a, b) => new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime());
  },

  getEventById(eventId: string): CommunityEvent | null {
    if (!eventId) return null;
    return this.getEvents().find(e => e.id === eventId) || null;
  },

  saveEvent(
    eventData: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    actorName: string = 'المسؤول'
  ): CommunityEvent {
    const delIds = this.getDeletedEventIds();
    const list = readJsonArray<CommunityEvent>(COMMUNITY_EVENTS_STORAGE_KEY).filter(e => e && e.id && !delIds.has(e.id));
    const nowIso = new Date().toISOString();

    const existingIdx = eventData.id ? list.findIndex(e => e.id === eventData.id) : -1;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      const updated: CommunityEvent = {
        ...prev,
        ...eventData,
        id: prev.id,
        updatedAt: nowIso
      };
      list[existingIdx] = updated;
      writeJsonArray(COMMUNITY_EVENTS_STORAGE_KEY, list);
      this.recordAuditLog({
        eventId: updated.id,
        actionType: 'event_updated',
        oldValue: `${prev.name} (${prev.basePrice} ${prev.currency}) - ${prev.status}`,
        newValue: `${updated.name} (${updated.basePrice} ${updated.currency}) - ${updated.status}`,
        changedBy: actorName
      });
      pushEventsStateToServerAndCloud();
      return updated;
    } else {
      const created: CommunityEvent = {
        ...eventData,
        id: eventData.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      list.unshift(created);
      writeJsonArray(COMMUNITY_EVENTS_STORAGE_KEY, list);
      this.recordAuditLog({
        eventId: created.id,
        actionType: 'event_created',
        newValue: `${created.name} (${created.basePrice} ${created.currency})`,
        changedBy: actorName
      });
      pushEventsStateToServerAndCloud();
      return created;
    }
  },

  deleteEvent(eventId: string, actorName: string = 'المسؤول'): void {
    const delSet = this.getDeletedEventIds();
    delSet.add(eventId);
    writeJsonArray(DELETED_EVENTS_STORAGE_KEY, Array.from(delSet));

    const existing = this.getEventById(eventId);
    const list = readJsonArray<CommunityEvent>(COMMUNITY_EVENTS_STORAGE_KEY).filter(e => e && e.id && !delSet.has(e.id));
    writeJsonArray(COMMUNITY_EVENTS_STORAGE_KEY, list);

    // Cascade-delete all registrations, groups, payments, buses, attendances, and staff assignments for deleted events
    writeJsonArray(
      EVENT_GROUPS_STORAGE_KEY,
      readJsonArray<RegistrationGroup>(EVENT_GROUPS_STORAGE_KEY).filter(g => g && !delSet.has(g.eventId))
    );
    writeJsonArray(
      EVENT_REGISTRATIONS_STORAGE_KEY,
      readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY).filter(r => r && !delSet.has(r.eventId))
    );
    writeJsonArray(
      EVENT_PAYMENTS_STORAGE_KEY,
      readJsonArray<PaymentTransaction>(EVENT_PAYMENTS_STORAGE_KEY).filter(p => p && !delSet.has(p.eventId))
    );
    writeJsonArray(
      EVENT_BUSES_STORAGE_KEY,
      readJsonArray<EventBus>(EVENT_BUSES_STORAGE_KEY).filter(b => b && !delSet.has(b.eventId))
    );
    writeJsonArray(
      EVENT_ATTENDANCES_STORAGE_KEY,
      readJsonArray<EventAttendance>(EVENT_ATTENDANCES_STORAGE_KEY).filter(a => a && !delSet.has(a.eventId))
    );
    writeJsonArray(
      EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY,
      readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY).filter(s => s && !delSet.has(s.eventId))
    );

    this.recordAuditLog({
      eventId,
      actionType: 'event_deleted',
      oldValue: existing?.name || eventId,
      changedBy: actorName
    });
    pushEventsStateToServerAndCloud();
  },

  archiveEvent(eventId: string, archive: boolean = true, actorName: string = 'المسؤول'): CommunityEvent | null {
    const existing = this.getEventById(eventId);
    if (!existing) return null;
    return this.saveEvent(
      {
        ...existing,
        id: existing.id,
        isArchived: archive,
        status: archive ? 'archived' : 'registration_open',
        isVisibleToMembers: archive ? false : true
      },
      actorName
    );
  },

  // ==========================================
  // 3. MEMBER SEARCH & RELATIONAL RESOLUTION
  // ==========================================
  getMemberById(memberId: string): Registrant | undefined {
    return storageService.getRegistrants().find(r => r.id === memberId);
  },

  /**
   * Search existing members in «المخدومين والرتب» by Arabic name, phone, or uniqueCode.
   * Never creates duplicate members.
   */
  searchExistingMembers(query: string, limit = 15): Registrant[] {
    const q = (query || '').trim();
    if (!q) return [];
    const normNameQuery = normalizeArabicNameForComparison(q);
    const normPhoneQuery = normalizePhoneForComparison(q);
    const upperQuery = q.toUpperCase();
    const digitsOnly = q.replace(/\D/g, '');

    const allMembers = storageService.getRegistrants().filter(r => r.status !== 'cancelled');

    const scored: Array<{ member: Registrant; score: number }> = [];
    for (const m of allMembers) {
      let score = 0;
      const mNormName = normalizeArabicNameForComparison(m.fullName);
      const mNormPhone = normalizePhoneForComparison(m.phone);
      const mCode = (m.uniqueCode || '').toUpperCase();

      if (mCode === upperQuery) {
        score = 100;
      } else if (mNormName === normNameQuery && normNameQuery.length >= 2) {
        score = 95;
      } else if (normNameQuery.length >= 2 && mNormName.startsWith(normNameQuery)) {
        score = 85;
      } else if (normNameQuery.length >= 2 && mNormName.includes(normNameQuery)) {
        score = 75;
      } else if (normPhoneQuery.length >= 5 && mNormPhone.includes(normPhoneQuery)) {
        score = 80;
      } else if (digitsOnly.length >= 4 && (m.phone || '').replace(/\D/g, '').includes(digitsOnly)) {
        score = 70;
      } else if (mCode.includes(upperQuery) && upperQuery.length >= 2) {
        score = 65;
      } else if (normNameQuery.length >= 2) {
        const queryWords = normNameQuery.split(' ').filter(Boolean);
        const allWordsPresent = queryWords.every(w => mNormName.includes(w));
        if (allWordsPresent) score = 60;
      }

      if (score > 0) {
        scored.push({ member: m, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.member);
  },

  maskPhoneForPublicDisplay(phone: string): string {
    const clean = (phone || '').replace(/\s+/g, '');
    if (clean.length < 6) return '***';
    return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
  },

  // ==========================================
  // 4. REGISTRATIONS & GROUP REGISTRATIONS
  // ==========================================
  getRegistrations(eventId?: string): EventRegistration[] {
    const all = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const filtered = eventId ? all.filter(r => r.eventId === eventId) : all;
    return filtered.sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime());
  },

  getRegistrationGroups(eventId?: string): RegistrationGroup[] {
    const all = readJsonArray<RegistrationGroup>(EVENT_GROUPS_STORAGE_KEY);
    return eventId ? all.filter(g => g.eventId === eventId) : all;
  },

  findActiveMemberRegistration(eventId: string, memberId: string): EventRegistration | null {
    const all = this.getRegistrations(eventId);
    return all.find(r => r.memberId === memberId && r.registrationStatus !== 'cancelled') || null;
  },

  /**
   * Internal Servant Registration (single member) OR Public Individual/Group Registration
   */
  registerMembersInEvent(params: {
    eventId: string;
    memberIds: string[];
    primaryMemberId: string;
    paymentMethod?: PaymentMethodType;
    selectedContactId?: string;
    assignedServantId?: string;
    registeredBy: string; // 'public_link' or Servant Name
    notes?: string;
    customDiscountAmount?: number;
    customDiscountReason?: string;
    busId?: string | null;
    isOverride?: boolean;
    overrideReason?: string;
    overrideBy?: string;
  }): {
    success: boolean;
    error?: string;
    requiresOverride?: boolean;
    availabilityState?: EventAvailabilityState;
    duplicateMember?: Registrant;
    existingRegistration?: EventRegistration;
    createdRegistrations?: EventRegistration[];
    group?: RegistrationGroup;
    selectedWhatsappContact?: EventPaymentContact;
  } {
    const event = this.getEventById(params.eventId);
    if (!event) {
      return { success: false, error: 'الفعالية غير موجودة.' };
    }

    const uniqueMemberIds = Array.from(new Set(params.memberIds.filter(Boolean)));
    if (uniqueMemberIds.length === 0) {
      return { success: false, error: 'يرجى اختيار عضو واحد على الأقل للتسجيل.' };
    }

    const allRegistrations = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const activeEventRegistrations = allRegistrations.filter(
      r => r.eventId === event.id && r.registrationStatus === 'registered'
    );

    for (const mId of uniqueMemberIds) {
      const member = this.getMemberById(mId);
      if (!member) {
        return { success: false, error: 'أحد الأشخاص المختارين غير مسجل في قاعدة بيانات المخدومين.' };
      }
      const dup = activeEventRegistrations.find(r => r.memberId === mId);
      if (dup) {
        return {
          success: false,
          error: `⚠️ العضو (${member.fullName}) مسجل بالفعل في هذه الفعالية برقم مرجعي ${dup.registrationReference}`,
          duplicateMember: member,
          existingRegistration: dup
        };
      }
    }

    const availability = this.evaluateEventRegistrationAvailability(event);
    const isUnlimited = availability.isUnlimited;
    const wouldExceedCapacity =
      !isUnlimited &&
      event.maxCapacity > 0 &&
      activeEventRegistrations.length + uniqueMemberIds.length > event.maxCapacity;

    const needsOverride = availability.state !== 'open' || wouldExceedCapacity;

    if (params.registeredBy === 'public_link') {
      if (availability.state === 'draft') {
        return { success: false, error: 'هذه الفعالية غير متاحة للتسجيل حالياً.' };
      }
      if (availability.state === 'registration_closed') {
        return { success: false, error: 'التسجيل مغلق حالياً لهذه الفعالية.' };
      }
      if (availability.state === 'deadline_passed') {
        return { success: false, error: 'عذراً، انتهى وقت التسجيل المحدد لهذه الفعالية.' };
      }
      if (availability.state === 'capacity_full' || wouldExceedCapacity) {
        return {
          success: false,
          error: `عذراً، اكتمل العدد المتاح في (${event.name}).`
        };
      }
    } else if (needsOverride) {
      if (!params.isOverride) {
        return {
          success: false,
          requiresOverride: true,
          availabilityState: wouldExceedCapacity ? 'capacity_full' : availability.state,
          error:
            wouldExceedCapacity || availability.state === 'capacity_full'
              ? `اكتمل العدد الأقصى للفعالية (${activeEventRegistrations.length}/${event.maxCapacity}). يتطلب التسجيل استخدام صلاحية التسجيل الاستثنائي (Override).`
              : availability.state === 'deadline_passed'
              ? `انتهى موعد التسجيل (${event.registrationDeadline}). يتطلب التسجيل استخدام صلاحية التسجيل الاستثنائي (Override).`
              : `التسجيل مغلق حالياً (${availability.labelAr}). يتطلب التسجيل استخدام صلاحية التسجيل الاستثنائي (Override).`
        };
      }
      if (!params.overrideReason || !params.overrideReason.trim()) {
        return {
          success: false,
          requiresOverride: true,
          availabilityState: wouldExceedCapacity ? 'capacity_full' : availability.state,
          error: 'يرجى كتابة سبب التسجيل الاستثنائي (Override Reason) للمتابعة.'
        };
      }
    }

    if (params.busId) {
      const busCheck = this.validateBusCapacity(event.id, params.busId, uniqueMemberIds.length, Boolean(params.isOverride));
      if (!busCheck.canAssign) {
        return { success: false, error: busCheck.error };
      }
    }

    const nowIso = new Date().toISOString();
    const sharedReference = generateRegistrationReference(allRegistrations);
    const chosenPaymentMethod: PaymentMethodType =
      params.paymentMethod || event.availablePaymentMethods?.[0] || 'vodafone_cash';

    // Select WhatsApp payment contact dynamically (explicitly chosen by user or matched by payment method)
    const matchingContacts = this.getContactsForPaymentMethod(event, chosenPaymentMethod);
    const selectedContact =
      (params.selectedContactId
        ? matchingContacts.find(c => c.id === params.selectedContactId || c.servantId === params.selectedContactId) ||
          (event.whatsappContacts || []).find(c => c.id === params.selectedContactId || c.servantId === params.selectedContactId)
        : undefined) ||
      matchingContacts[0] ||
      this.selectPaymentContactForMethod(event, chosenPaymentMethod);

    const resolvedServantId =
      params.assignedServantId ||
      selectedContact?.servantId ||
      (selectedContact?.id?.startsWith('staff_contact_') ? selectedContact.id.replace('staff_contact_', '') : undefined);
    const resolvedServantMember = resolvedServantId ? this.getMemberById(resolvedServantId) : undefined;
    const resolvedServantName = resolvedServantMember?.fullName || selectedContact?.name;
    const resolvedServantPhone =
      resolvedServantMember?.whatsapp || resolvedServantMember?.phone || selectedContact?.phone;

    let createdGroup: RegistrationGroup | undefined;
    if (uniqueMemberIds.length >= 1) {
      const groups = readJsonArray<RegistrationGroup>(EVENT_GROUPS_STORAGE_KEY);
      createdGroup = {
        id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        eventId: event.id,
        primaryMemberId: params.primaryMemberId || uniqueMemberIds[0],
        registrationReference: sharedReference,
        paymentMethod: chosenPaymentMethod,
        selectedContactId: selectedContact?.id,
        selectedContactName: selectedContact?.name,
        selectedContactPhone: selectedContact?.phone,
        assignedServantId: resolvedServantId,
        assignedServantName: resolvedServantName,
        assignedServantPhone: resolvedServantPhone,
        totalPeopleCount: uniqueMemberIds.length,
        totalGroupOriginalPrice: uniqueMemberIds.length * Number(event.basePrice || 0),
        createdAt: nowIso
      };
      groups.unshift(createdGroup);
      writeJsonArray(EVENT_GROUPS_STORAGE_KEY, groups);
    }

    const createdList: EventRegistration[] = [];
    const basePriceSnapshot = Math.max(0, Number(event.basePrice || 0));
    const isOverrideReg = Boolean(needsOverride && params.isOverride);

    uniqueMemberIds.forEach((mId, index) => {
      const member = this.getMemberById(mId);
      const regRef = index === 0 ? sharedReference : `${sharedReference}-${index + 1}`;
      const discount = Math.min(
        basePriceSnapshot,
        Math.max(0, Number(params.customDiscountAmount || 0))
      );
      const finalReq = Math.max(0, basePriceSnapshot - discount);
      const initialPaymentStatus: PaymentStatus =
        finalReq <= 0
          ? calculatePaymentStatus(finalReq, 0, discount, basePriceSnapshot)
          : params.registeredBy === 'public_link'
          ? 'pending_confirmation'
          : 'unpaid';

      const newReg: EventRegistration = {
        id: `evreg_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        eventId: event.id,
        memberId: mId,
        registrationGroupId: createdGroup?.id,
        registrationReference: regRef,
        registrationDate: nowIso,
        registrationStatus: 'registered',
        registeredBy: params.registeredBy || 'المسؤول',
        originalPrice: basePriceSnapshot,
        discountAmount: discount,
        discountReason: params.customDiscountReason || undefined,
        finalRequiredAmount: finalReq,
        totalPaidAmount: 0,
        remainingAmount: finalReq,
        paymentStatus: initialPaymentStatus,
        paymentMethod: chosenPaymentMethod,
        selectedContactId: selectedContact?.id,
        selectedContactName: selectedContact?.name,
        selectedContactPhone: selectedContact?.phone,
        assignedServantId: resolvedServantId,
        assignedServantName: resolvedServantName,
        assignedServantPhone: resolvedServantPhone,
        isOverride: isOverrideReg || undefined,
        overrideReason: isOverrideReg ? params.overrideReason?.trim() : undefined,
        overrideBy: isOverrideReg ? (params.overrideBy || params.registeredBy) : undefined,
        overrideAt: isOverrideReg ? nowIso : undefined,
        busId: params.busId || null,
        actualBusId: null,
        attendanceStatus: 'absent',
        notes: params.notes || undefined,
        updatedAt: nowIso
      };

      allRegistrations.unshift(newReg);
      createdList.push(newReg);

      this.recordAuditLog({
        eventId: event.id,
        registrationId: newReg.id,
        memberId: mId,
        memberName: member?.fullName,
        actionType: isOverrideReg ? 'registration_override' : 'registration_created',
        newValue: `${isOverrideReg ? '[تسجيل استثنائي Override] ' : ''}تسجيل (${regRef}) - المطلوب: ${finalReq} ${event.currency}${resolvedServantName ? ` - الخادم المسؤول: ${resolvedServantName}` : ''}`,
        reason: isOverrideReg
          ? `تسجيل استثنائي بواسطة ${params.overrideBy || params.registeredBy}: ${params.overrideReason}`
          : params.registeredBy === 'public_link'
          ? 'تسجيل عبر الرابط العام (في انتظار تأكيد الدفع)'
          : `تسجيل داخلي بواسطة ${params.registeredBy}`,
        changedBy: params.overrideBy || params.registeredBy
      });
    });

    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegistrations);
    pushEventsStateToServerAndCloud();

    return {
      success: true,
      createdRegistrations: createdList,
      group: createdGroup,
      selectedWhatsappContact: selectedContact
    };
  },

  cancelRegistration(
    registrationId: string,
    reason: string,
    actorName: string = 'المسؤول'
  ): { success: boolean; error?: string } {
    const all = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const idx = all.findIndex(r => r.id === registrationId);
    if (idx === -1) return { success: false, error: 'التسجيل غير موجود.' };

    const reg = all[idx];
    const member = this.getMemberById(reg.memberId);
    const nowIso = new Date().toISOString();

    all[idx] = {
      ...reg,
      registrationStatus: 'cancelled',
      busId: null,
      cancelledAt: nowIso,
      cancelledBy: actorName,
      cancellationReason: reason || 'إلغاء الحجز',
      updatedAt: nowIso
    };

    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, all);
    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: 'registration_cancelled',
      oldValue: 'registered',
      newValue: `cancelled (المدفوع المحفوظ: ${reg.totalPaidAmount})`,
      reason: reason || 'إلغاء الحجز مع حفظ السجل المالي',
      changedBy: actorName
    });
    pushEventsStateToServerAndCloud();
    return { success: true };
  },

  restoreRegistration(registrationId: string, actorName: string = 'المسؤول'): { success: boolean; error?: string } {
    const all = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const idx = all.findIndex(r => r.id === registrationId);
    if (idx === -1) return { success: false, error: 'التسجيل غير موجود.' };

    const reg = all[idx];
    const member = this.getMemberById(reg.memberId);
    const nowIso = new Date().toISOString();

    all[idx] = {
      ...reg,
      registrationStatus: 'registered',
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationReason: undefined,
      updatedAt: nowIso
    };

    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, all);
    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: 'registration_restored',
      oldValue: 'cancelled',
      newValue: 'registered',
      changedBy: actorName
    });
    pushEventsStateToServerAndCloud();
    return { success: true };
  },

  // ==========================================
  // 5. FINANCIALS, DISCOUNTS & PARTIAL PAYMENTS
  // ==========================================
  getPayments(eventId?: string, registrationId?: string): PaymentTransaction[] {
    let list = readJsonArray<PaymentTransaction>(EVENT_PAYMENTS_STORAGE_KEY);
    if (eventId) list = list.filter(p => p.eventId === eventId);
    if (registrationId) list = list.filter(p => p.eventRegistrationId === registrationId);
    return list.sort((a, b) => new Date(b.paymentDate || b.createdAt).getTime() - new Date(a.paymentDate || a.createdAt).getTime());
  },

  updateRegistrationDiscount(params: {
    registrationId: string;
    discountAmount: number;
    discountReason: string;
    actorName: string;
  }): { success: boolean; error?: string; registration?: EventRegistration } {
    const all = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const idx = all.findIndex(r => r.id === params.registrationId);
    if (idx === -1) return { success: false, error: 'التسجيل غير موجود.' };

    const reg = all[idx];
    const discount = Math.max(0, Number(params.discountAmount || 0));
    if (discount > reg.originalPrice) {
      return {
        success: false,
        error: `قيمة الخصم (${discount}) لا يمكن أن تتجاوز السعر الأصلي (${reg.originalPrice}).`
      };
    }

    const newFinalRequired = Math.max(0, reg.originalPrice - discount);
    const newRemaining = Math.max(0, newFinalRequired - reg.totalPaidAmount);
    const newPaymentStatus = calculatePaymentStatus(
      newFinalRequired,
      reg.totalPaidAmount,
      discount,
      reg.originalPrice,
      reg.paymentStatus
    );

    const member = this.getMemberById(reg.memberId);
    const oldDiscount = reg.discountAmount;
    const nowIso = new Date().toISOString();

    const updated: EventRegistration = {
      ...reg,
      discountAmount: discount,
      discountReason: params.discountReason || undefined,
      finalRequiredAmount: newFinalRequired,
      remainingAmount: newRemaining,
      paymentStatus: newPaymentStatus,
      updatedAt: nowIso
    };

    all[idx] = updated;
    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, all);

    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: 'discount_updated',
      oldValue: `خصم: ${oldDiscount} (المطلوب: ${reg.finalRequiredAmount})`,
      newValue: `خصم: ${discount} (المطلوب: ${newFinalRequired})`,
      reason: params.discountReason || 'تعديل دعم/خصم فردي',
      changedBy: params.actorName
    });

    pushEventsStateToServerAndCloud();
    return { success: true, registration: updated };
  },

  addPaymentTransaction(params: {
    registrationId: string;
    amount: number;
    paymentMethod: PaymentMethodType;
    paymentReference?: string;
    receivedBy: string;
    paymentDate?: string;
    notes?: string;
    allowAdminOverPaymentOverride?: boolean;
  }): { success: boolean; error?: string; transaction?: PaymentTransaction; registration?: EventRegistration } {
    const amount = Number(params.amount || 0);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'يرجى إدخال مبلغ دفع صحيح أكبر من صفر.' };
    }

    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const regIdx = allRegs.findIndex(r => r.id === params.registrationId);
    if (regIdx === -1) {
      return { success: false, error: 'سجل الحجز غير موجود.' };
    }

    const reg = allRegs[regIdx];
    const event = this.getEventById(reg.eventId);
    const newTotalPaid = reg.totalPaidAmount + amount;

    const allowOver = Boolean(event?.allowOverPayment || params.allowAdminOverPaymentOverride);
    if (newTotalPaid > reg.finalRequiredAmount && !allowOver) {
      return {
        success: false,
        error: `⚠️ المبلغ المدخل (${amount}) يجعل إجمالي المدفوع (${newTotalPaid}) أكبر من المبلغ المطلوب النهائي (${reg.finalRequiredAmount}). المبلغ المتبقي للدفع هو (${reg.remainingAmount}) فقط.`
      };
    }

    const nowIso = new Date().toISOString();
    const payments = readJsonArray<PaymentTransaction>(EVENT_PAYMENTS_STORAGE_KEY);

    const newTx: PaymentTransaction = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventId: reg.eventId,
      eventRegistrationId: reg.id,
      memberId: reg.memberId,
      amount,
      paymentMethod: params.paymentMethod,
      paymentReference: params.paymentReference?.trim() || undefined,
      receivedBy: params.receivedBy || 'المسؤول',
      paymentDate: params.paymentDate || nowIso.split('T')[0],
      notes: params.notes?.trim() || undefined,
      createdAt: nowIso
    };

    payments.unshift(newTx);
    writeJsonArray(EVENT_PAYMENTS_STORAGE_KEY, payments);

    const newRemaining = Math.max(0, reg.finalRequiredAmount - newTotalPaid);
    const newStatus = calculatePaymentStatus(
      reg.finalRequiredAmount,
      newTotalPaid,
      reg.discountAmount,
      reg.originalPrice
    );

    const updatedReg: EventRegistration = {
      ...reg,
      totalPaidAmount: newTotalPaid,
      remainingAmount: newRemaining,
      paymentStatus: newStatus,
      paymentMethod: params.paymentMethod,
      paymentNotes: params.notes || reg.paymentNotes,
      updatedAt: nowIso
    };

    allRegs[regIdx] = updatedReg;
    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegs);

    const member = this.getMemberById(reg.memberId);
    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: newStatus === 'paid' ? 'payment_confirmed' : 'payment_added',
      oldValue: `المدفوع: ${reg.totalPaidAmount} (${reg.paymentStatus})`,
      newValue: `المدفوع: ${newTotalPaid} (+${amount} عبر ${PAYMENT_METHOD_LABELS[params.paymentMethod]?.label || params.paymentMethod}) -> ${newStatus}`,
      reason: params.notes || params.paymentReference || 'تسجيل دفعة مالية',
      changedBy: params.receivedBy
    });

    pushEventsStateToServerAndCloud();
    return { success: true, transaction: newTx, registration: updatedReg };
  },

  /**
   * 1-Click Confirm Full Remaining Payment (for Registration & Organization / Payment Servants)
   */
  confirmFullRegistrationPayment(params: {
    registrationId: string;
    actorName: string;
    paymentMethod?: PaymentMethodType;
    notes?: string;
  }): { success: boolean; error?: string; registration?: EventRegistration } {
    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const reg = allRegs.find(r => r.id === params.registrationId);
    if (!reg) return { success: false, error: 'سجل التسجيل غير موجود.' };

    const remaining = Math.max(0, reg.finalRequiredAmount - reg.totalPaidAmount);
    if (remaining <= 0) {
      return { success: false, error: 'هذا الاشتراك مسدد بالكامل بالفعل.' };
    }

    return this.addPaymentTransaction({
      registrationId: reg.id,
      amount: remaining,
      paymentMethod: params.paymentMethod || reg.paymentMethod || 'cash',
      receivedBy: params.actorName,
      notes: params.notes || 'تأكيد استلام كامل الاشتراك'
    });
  },

  deletePaymentTransaction(
    transactionId: string,
    reason: string,
    actorName: string = 'المسؤول'
  ): { success: boolean; error?: string } {
    const payments = readJsonArray<PaymentTransaction>(EVENT_PAYMENTS_STORAGE_KEY);
    const tx = payments.find(p => p.id === transactionId);
    if (!tx) return { success: false, error: 'العملية المالية غير موجودة.' };

    const remainingPayments = payments.filter(p => p.id !== transactionId);
    writeJsonArray(EVENT_PAYMENTS_STORAGE_KEY, remainingPayments);

    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const regIdx = allRegs.findIndex(r => r.id === tx.eventRegistrationId);
    if (regIdx >= 0) {
      const reg = allRegs[regIdx];
      const regPayments = remainingPayments.filter(p => p.eventRegistrationId === reg.id);
      const recalculatedPaid = regPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const recalculatedRemaining = Math.max(0, reg.finalRequiredAmount - recalculatedPaid);
      const recalculatedStatus = calculatePaymentStatus(
        reg.finalRequiredAmount,
        recalculatedPaid,
        reg.discountAmount,
        reg.originalPrice
      );

      allRegs[regIdx] = {
        ...reg,
        totalPaidAmount: recalculatedPaid,
        remainingAmount: recalculatedRemaining,
        paymentStatus: recalculatedStatus,
        updatedAt: new Date().toISOString()
      };
      writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegs);

      const member = this.getMemberById(reg.memberId);
      this.recordAuditLog({
        eventId: reg.eventId,
        registrationId: reg.id,
        memberId: reg.memberId,
        memberName: member?.fullName,
        actionType: 'payment_deleted',
        oldValue: `دفعة ملغاة: ${tx.amount} (المدفوع كان: ${reg.totalPaidAmount})`,
        newValue: `المدفوع الحالي: ${recalculatedPaid} (المتبقي: ${recalculatedRemaining})`,
        reason: reason || 'حذف حركة دفع خاطئة',
        changedBy: actorName
      });
    }

    pushEventsStateToServerAndCloud();
    return { success: true };
  },

  // ==========================================
  // 6. BUS / TRANSPORT MANAGEMENT
  // ==========================================
  getBuses(eventId?: string): EventBus[] {
    const all = readJsonArray<EventBus>(EVENT_BUSES_STORAGE_KEY);
    const filtered = eventId ? all.filter(b => b.eventId === eventId) : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  },

  saveBus(
    busData: Omit<EventBus, 'id' | 'createdAt'> & { id?: string },
    actorName: string = 'المسؤول'
  ): EventBus {
    const buses = readJsonArray<EventBus>(EVENT_BUSES_STORAGE_KEY);
    const nowIso = new Date().toISOString();
    const idx = busData.id ? buses.findIndex(b => b.id === busData.id) : -1;

    // Resolve Responsible Servant from المخدومين والرتب if responsibleServantId is provided
    const servantMember = busData.responsibleServantId
      ? this.getMemberById(busData.responsibleServantId)
      : undefined;
    const resolvedServantName =
      servantMember?.fullName || busData.responsibleServantName || busData.driverName || '';
    const resolvedServantPhone =
      servantMember?.whatsapp ||
      servantMember?.phone ||
      busData.responsibleServantPhone ||
      busData.driverPhone ||
      '';

    let savedBus: EventBus;
    if (idx >= 0) {
      const prev = buses[idx];
      savedBus = {
        ...prev,
        ...busData,
        id: prev.id,
        responsibleServantId: busData.responsibleServantId || undefined,
        responsibleServantName: resolvedServantName,
        responsibleServantPhone: resolvedServantPhone,
        driverName: resolvedServantName,
        driverPhone: resolvedServantPhone,
        updatedAt: nowIso
      };
      buses[idx] = savedBus;
      writeJsonArray(EVENT_BUSES_STORAGE_KEY, buses);
      this.recordAuditLog({
        eventId: savedBus.eventId,
        actionType: 'bus_updated',
        oldValue: `${prev.name} (الخادم المسؤول: ${prev.responsibleServantName || prev.driverName || '-'})`,
        newValue: `${savedBus.name} (الخادم المسؤول: ${savedBus.responsibleServantName || '-'} - السعة: ${savedBus.capacity})`,
        changedBy: actorName
      });
    } else {
      savedBus = {
        ...busData,
        id: busData.id || `bus_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        responsibleServantId: busData.responsibleServantId || undefined,
        responsibleServantName: resolvedServantName,
        responsibleServantPhone: resolvedServantPhone,
        driverName: resolvedServantName,
        driverPhone: resolvedServantPhone,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      buses.push(savedBus);
      writeJsonArray(EVENT_BUSES_STORAGE_KEY, buses);
      this.recordAuditLog({
        eventId: savedBus.eventId,
        actionType: 'bus_created',
        newValue: `${savedBus.name} (الخادم المسؤول: ${savedBus.responsibleServantName || '-'} - السعة: ${savedBus.capacity} مقعد)`,
        changedBy: actorName
      });
    }

    // Automatically ensure the responsible servant has BUS_ATTENDANCE_ONLY permission for this bus
    if (servantMember) {
      const allStaff = readJsonArray<EventStaffAssignment>(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY);
      const staffIdx = allStaff.findIndex(
        a => a.eventId === savedBus.eventId && a.userId === servantMember.id
      );
      if (staffIdx >= 0) {
        const existingStaff = allStaff[staffIdx];
        const nextRoles: EventStaffRole[] = existingStaff.roles.includes('BUS_ATTENDANCE_ONLY')
          ? existingStaff.roles
          : [...existingStaff.roles, 'BUS_ATTENDANCE_ONLY'];
        allStaff[staffIdx] = {
          ...existingStaff,
          roles: nextRoles,
          permissions: derivePermissionsFromRoles(nextRoles, existingStaff.permissions),
          assignedBusId: existingStaff.assignedBusId || savedBus.id,
          updatedAt: nowIso
        };
      } else {
        const initialRoles: EventStaffRole[] = ['BUS_ATTENDANCE_ONLY'];
        allStaff.unshift({
          id: `evstaff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          eventId: savedBus.eventId,
          userId: servantMember.id,
          userName: servantMember.fullName,
          userPhone: servantMember.whatsapp || servantMember.phone,
          userRole: servantMember.role,
          userPhotoUrl: servantMember.photoUrl,
          roles: initialRoles,
          permissions: derivePermissionsFromRoles(initialRoles),
          assignedBusId: savedBus.id,
          assignedBy: actorName,
          assignedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
      writeJsonArray(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, allStaff);
    }

    pushEventsStateToServerAndCloud();
    return savedBus;
  },

  deleteBus(busId: string, actorName: string = 'المسؤول'): void {
    const buses = readJsonArray<EventBus>(EVENT_BUSES_STORAGE_KEY);
    const target = buses.find(b => b.id === busId);
    if (!target) return;

    const remainingBuses = buses.filter(b => b.id !== busId);
    writeJsonArray(EVENT_BUSES_STORAGE_KEY, remainingBuses);

    const regs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    let regsChanged = false;
    regs.forEach(r => {
      if (r.busId === busId) {
        r.busId = null;
        r.updatedAt = new Date().toISOString();
        regsChanged = true;
      }
    });
    if (regsChanged) {
      writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, regs);
    }

    this.recordAuditLog({
      eventId: target.eventId,
      actionType: 'bus_deleted',
      oldValue: target.name,
      changedBy: actorName
    });
    pushEventsStateToServerAndCloud();
  },

  validateBusCapacity(
    eventId: string,
    busId: string,
    additionalSeatsNeeded = 1,
    allowAdminOverride = false
  ): { canAssign: boolean; isFull: boolean; currentCount: number; capacity: number; error?: string } {
    const bus = this.getBuses(eventId).find(b => b.id === busId);
    if (!bus) {
      return { canAssign: false, isFull: false, currentCount: 0, capacity: 0, error: 'الباص غير موجود.' };
    }
    const assignedRegs = this.getRegistrations(eventId).filter(
      r => r.registrationStatus === 'registered' && r.busId === busId
    );
    const currentCount = assignedRegs.length;
    const isFull = currentCount + additionalSeatsNeeded > bus.capacity;

    if (isFull && !allowAdminOverride) {
      return {
        canAssign: false,
        isFull: true,
        currentCount,
        capacity: bus.capacity,
        error: `⚠️ الباص (${bus.name}) ممتلئ بالكامل (${currentCount} / ${bus.capacity} مقعد).`
      };
    }

    return {
      canAssign: true,
      isFull,
      currentCount,
      capacity: bus.capacity
    };
  },

  assignMemberToBus(params: {
    registrationId: string;
    busId: string | null;
    actorName: string;
    allowAdminOverride?: boolean;
  }): { success: boolean; error?: string; warning?: string } {
    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const idx = allRegs.findIndex(r => r.id === params.registrationId);
    if (idx === -1) return { success: false, error: 'التسجيل غير موجود.' };

    const reg = allRegs[idx];
    if (reg.busId === params.busId) return { success: true };

    let warningMsg: string | undefined;
    if (params.busId) {
      const capCheck = this.validateBusCapacity(reg.eventId, params.busId, 1, params.allowAdminOverride);
      if (!capCheck.canAssign) {
        return { success: false, error: capCheck.error };
      }
      if (capCheck.isFull && params.allowAdminOverride) {
        warningMsg = `تنبيه: تم تجاوز السعة الرسمية للباص بتفويض المسؤول (${capCheck.currentCount + 1}/${capCheck.capacity}).`;
      }
    }

    const buses = this.getBuses(reg.eventId);
    const oldBusName = reg.busId ? (buses.find(b => b.id === reg.busId)?.name || reg.busId) : 'بدون باص';
    const newBusName = params.busId ? (buses.find(b => b.id === params.busId)?.name || params.busId) : 'بدون باص';

    allRegs[idx] = {
      ...reg,
      busId: params.busId,
      updatedAt: new Date().toISOString()
    };
    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegs);

    const member = this.getMemberById(reg.memberId);
    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: params.busId ? 'bus_assigned' : 'bus_unassigned',
      oldValue: oldBusName,
      newValue: newBusName,
      changedBy: params.actorName
    });

    pushEventsStateToServerAndCloud();
    return { success: true, warning: warningMsg };
  },

  // ==========================================
  // 7. EVENT ATTENDANCE (QR SCANNER & MANUAL)
  // WITH ACTUAL BUS vs. ASSIGNED BUS + UNIQUE(eventId, memberId)
  // ==========================================
  getEventAttendances(eventId?: string): EventAttendance[] {
    const all = readJsonArray<EventAttendance>(EVENT_ATTENDANCES_STORAGE_KEY);
    return eventId ? all.filter(a => a.eventId === eventId) : all;
  },

  /**
   * Process QR Scan or Manual Check-In:
   * - Separates Original Assigned Bus (`reg.busId`) from Actual Attendance Bus (`reg.actualBusId`).
   * - Never overwrites `reg.busId`.
   * - Enforces `UNIQUE(eventId, memberId)` to prevent duplicate attendance across buses.
   * - Supports 4 explicit scan states:
   *   1. `confirmed`: Member is in the same bus as assigned (or event has no bus mismatch).
   *   2. `bus_changed`: Member boarded a different bus than assigned -> Attendance IS recorded in `actualBusId`, keeping `busId`, and logging `attendance_bus_changed`.
   *   3. `not_registered` / `member_not_found`: Member is not registered in this event.
   *   4. `already_checked_in`: Member already checked in previously (displays previous bus & time).
   */
  checkInMemberForEvent(params: {
    eventId: string;
    qrOrCodeOrMemberId: string;
    selectedBusId?: string | 'all';
    method: 'QR' | 'Manual';
    checkedInBy: string;
  }): {
    status: 'confirmed' | 'bus_changed' | 'already_checked_in' | 'not_registered' | 'member_not_found' | 'wrong_bus';
    message: string;
    member?: Registrant;
    registration?: EventRegistration;
    assignedBus?: EventBus | null;
    actualBus?: EventBus | null;
    previousCheckInTime?: string;
  } {
    const rawInput = (params.qrOrCodeOrMemberId || '').trim();
    if (!rawInput) {
      return { status: 'member_not_found', message: '❌ الكود الممسوح فارغ أو غير صالح.' };
    }

    // 1. Resolve Member from existing «المخدومين والرتب» database
    const allMembers = storageService.getRegistrants();
    const upperInput = rawInput.toUpperCase();
    const member = allMembers.find(
      r =>
        r.id === rawInput ||
        (r.uniqueCode && r.uniqueCode.toUpperCase() === upperInput) ||
        (r.qrData && r.qrData.toUpperCase() === upperInput)
    );

    if (!member) {
      return {
        status: 'member_not_found',
        message: `❌ لم يتم العثور على عضو بهذا الكود (${rawInput}) في سجل المخدومين.`
      };
    }

    // 2. Check if Member is registered in this Event
    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const regIdx = allRegs.findIndex(
      r => r.eventId === params.eventId && r.memberId === member.id && r.registrationStatus === 'registered'
    );

    if (regIdx === -1) {
      return {
        status: 'not_registered',
        message: `❌ هذا العضو (${member.fullName}) غير مسجل في هذه الفعالية!`,
        member
      };
    }

    const reg = allRegs[regIdx];
    const buses = this.getBuses(params.eventId);
    const assignedBus = reg.busId ? (buses.find(b => b.id === reg.busId) || null) : null;

    // 3. Enforce Database-Level Unique Constraint: UNIQUE(eventId, memberId)
    const attendances = readJsonArray<EventAttendance>(EVENT_ATTENDANCES_STORAGE_KEY);
    const existingAtt = attendances.find(
      a => a.eventId === params.eventId && a.memberId === member.id && a.status === 'present'
    );

    if (reg.attendanceStatus === 'present' || existingAtt) {
      const prevBusId = reg.actualBusId || existingAtt?.actualBusId || existingAtt?.busId || reg.busId;
      const prevBus = prevBusId ? (buses.find(b => b.id === prevBusId) || null) : null;
      const prevTime = reg.checkInTime || existingAtt?.checkInTime;
      return {
        status: 'already_checked_in',
        message: `⚠️ تم تسجيل حضور (${member.fullName}) مسبقاً${prevBus ? ` في (${prevBus.name})` : ''}!`,
        member,
        registration: reg,
        assignedBus,
        actualBus: prevBus,
        previousCheckInTime: prevTime
      };
    }

    // 4. Determine Actual Boarding Bus vs. Original Assigned Bus
    const actualBoardingBusId =
      params.selectedBusId && params.selectedBusId !== 'all'
        ? params.selectedBusId
        : reg.busId || null;
    const actualBus = actualBoardingBusId ? (buses.find(b => b.id === actualBoardingBusId) || null) : null;

    const isBusDifference = Boolean(
      params.selectedBusId &&
      params.selectedBusId !== 'all' &&
      reg.busId !== params.selectedBusId
    );

    // 5. Confirm Attendance (preserving reg.busId as Original Assigned Bus, saving reg.actualBusId as Actual Boarding Bus)
    const nowIso = new Date().toISOString();
    const updatedReg: EventRegistration = {
      ...reg,
      // CRITICAL: reg.busId is NEVER overwritten during attendance scanning!
      actualBusId: actualBoardingBusId,
      attendanceStatus: 'present',
      checkInTime: nowIso,
      checkedInBy: params.checkedInBy,
      checkInMethod: params.method,
      updatedAt: nowIso
    };
    allRegs[regIdx] = updatedReg;
    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegs);

    const cleanAttendances = attendances.filter(
      a => !(a.eventId === params.eventId && a.memberId === member.id)
    );
    const newAtt: EventAttendance = {
      id: `evatt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventId: params.eventId,
      eventRegistrationId: reg.id,
      memberId: member.id,
      busId: actualBoardingBusId,
      originalBusId: reg.busId || null,
      actualBusId: actualBoardingBusId,
      status: 'present',
      checkInTime: nowIso,
      checkedInBy: params.checkedInBy,
      method: params.method
    };
    cleanAttendances.unshift(newAtt);
    writeJsonArray(EVENT_ATTENDANCES_STORAGE_KEY, cleanAttendances);

    if (isBusDifference) {
      this.recordAuditLog({
        eventId: params.eventId,
        registrationId: reg.id,
        memberId: member.id,
        memberName: member.fullName,
        actionType: 'attendance_bus_changed',
        oldValue: assignedBus ? assignedBus.name : 'بدون باص مسبق',
        newValue: actualBus ? actualBus.name : 'بدون باص',
        reason: `صعود فعلي في (${actualBus?.name || 'باص مختلف'}) بدلاً من الموزع مسبقاً (${assignedBus?.name || 'بدون باص'})`,
        changedBy: params.checkedInBy
      });
    } else {
      this.recordAuditLog({
        eventId: params.eventId,
        registrationId: reg.id,
        memberId: member.id,
        memberName: member.fullName,
        actionType: 'attendance_checked_in',
        oldValue: 'absent',
        newValue: `present (${params.method}) - ${actualBus ? actualBus.name : assignedBus ? assignedBus.name : 'بدون باص'}`,
        changedBy: params.checkedInBy
      });
    }

    pushEventsStateToServerAndCloud();

    if (isBusDifference) {
      return {
        status: 'bus_changed',
        message: `⚠️ تم تسجيل الحضور بنجاح مع رصد اختلاف الباص: المسجل مسبقاً (${assignedBus?.name || 'غير موزع'}) ← الباص الفعلي (${actualBus?.name || 'الحالي'})`,
        member,
        registration: updatedReg,
        assignedBus,
        actualBus
      };
    }

    return {
      status: 'confirmed',
      message: `✅ تم تأكيد حضور ${member.fullName} بنجاح${actualBus ? ` في (${actualBus.name})` : ''}`,
      member,
      registration: updatedReg,
      assignedBus,
      actualBus
    };
  },

  revokeEventAttendance(
    registrationId: string,
    actorName: string = 'المسؤول'
  ): { success: boolean } {
    const allRegs = readJsonArray<EventRegistration>(EVENT_REGISTRATIONS_STORAGE_KEY);
    const idx = allRegs.findIndex(r => r.id === registrationId);
    if (idx === -1) return { success: false };

    const reg = allRegs[idx];
    const member = this.getMemberById(reg.memberId);

    allRegs[idx] = {
      ...reg,
      actualBusId: null,
      attendanceStatus: 'absent',
      checkInTime: undefined,
      checkedInBy: undefined,
      checkInMethod: undefined,
      updatedAt: new Date().toISOString()
    };
    writeJsonArray(EVENT_REGISTRATIONS_STORAGE_KEY, allRegs);

    const attendances = readJsonArray<EventAttendance>(EVENT_ATTENDANCES_STORAGE_KEY).filter(
      a => a.eventRegistrationId !== registrationId && !(a.eventId === reg.eventId && a.memberId === reg.memberId)
    );
    writeJsonArray(EVENT_ATTENDANCES_STORAGE_KEY, attendances);

    this.recordAuditLog({
      eventId: reg.eventId,
      registrationId: reg.id,
      memberId: reg.memberId,
      memberName: member?.fullName,
      actionType: 'attendance_revoked',
      oldValue: 'present',
      newValue: 'absent',
      changedBy: actorName
    });

    pushEventsStateToServerAndCloud();
    return { success: true };
  },

  // ==========================================
  // 8. WHATSAPP ROUTING & MULTI-SERVANT PAYMENT METHOD MATCHING
  // ==========================================
  /**
   * Returns all servants configured in `event.whatsappContacts` that support `paymentMethod`.
   * - If multiple servants share this payment method, all of them are returned so the member can pick which servant to contact.
   * - If only 1 servant supports this payment method, only that single servant is returned.
   */
  getContactsForPaymentMethod(
    event: CommunityEvent,
    paymentMethod: PaymentMethodType
  ): EventPaymentContact[] {
    const contacts = [...(event.whatsappContacts || []).filter(c => c && (c.name || c.phone))];

    // Also include any event staff assigned with REGISTRATION_ORGANIZER / PAYMENT_MANAGER / EVENT_MANAGER who are not yet in contacts
    const staffForEvent = this.getEventStaffAssignments(event.id);
    for (const st of staffForEvent) {
      const stPerms = derivePermissionsFromRoles(st.roles || [], st.permissions);
      const canHandleRegOrPay =
        st.roles.includes('EVENT_MANAGER') ||
        st.roles.includes('REGISTRATION_ORGANIZER') ||
        st.roles.includes('PAYMENT_MANAGER') ||
        stPerms.includes('VIEW_ASSIGNED_REGISTRATIONS') ||
        stPerms.includes('CONFIRM_REGISTRATION') ||
        stPerms.includes('CONFIRM_PAYMENT');

      if (canHandleRegOrPay && st.userPhone && !contacts.some(c => c.servantId === st.userId || c.phone === st.userPhone)) {
        contacts.push({
          id: `staff_contact_${st.userId}`,
          servantId: st.userId,
          name: st.userName,
          phone: st.userPhone,
          photoUrl: st.userPhotoUrl,
          paymentMethod: 'all'
        });
      }
    }

    if (contacts.length === 0) return [];

    // 1. Find contacts whose `paymentMethods` array or `paymentMethod` explicitly includes `paymentMethod`
    const explicitMatches = contacts.filter(c => {
      if (Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0) {
        return c.paymentMethods.includes(paymentMethod);
      }
      return c.paymentMethod === paymentMethod;
    });

    if (explicitMatches.length > 0) {
      return explicitMatches;
    }

    // 2. Fallback to contacts marked as general ('all' or no specific method)
    const generalMatches = contacts.filter(c => {
      if (Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0) {
        return false;
      }
      return !c.paymentMethod || c.paymentMethod === 'all';
    });

    return generalMatches.length > 0 ? generalMatches : [contacts[0]];
  },

  selectPaymentContactForMethod(
    event: CommunityEvent,
    paymentMethod: PaymentMethodType
  ): EventPaymentContact | undefined {
    const matches = this.getContactsForPaymentMethod(event, paymentMethod);
    return matches[0];
  },

  buildWhatsAppBookingUrl(params: {
    event: CommunityEvent;
    reference: string;
    primaryMember: Registrant;
    allMembers: Registrant[];
    paymentMethod: PaymentMethodType;
    contact?: EventPaymentContact;
  }): string {
    const totalCount = params.allMembers.length;
    const totalRequired = totalCount * Number(params.event.basePrice || 0);
    const methodLabel = PAYMENT_METHOD_LABELS[params.paymentMethod]?.label || params.paymentMethod;
    const namesList = params.allMembers.map((m, idx) => `${idx + 1}. ${m.fullName} (${m.uniqueCode})`).join('\n');

    const messageLines = [
      `سلام ونعمة 🕊️`,
      params.contact?.name ? `أهلاً ${params.contact.name}،` : '',
      `أود تأكيد التسجيل والدفع في:`,
      `*${params.event.name}*`,
      ``,
      `🔖 *رقم الحجز:* ${params.reference}`,
      `👤 *الاسم:* ${params.primaryMember.fullName}`,
      `👥 *عدد الأشخاص:* ${totalCount}`,
      totalCount > 1 ? `📋 *الأسماء المسجلة:*\n${namesList}` : '',
      `💰 *المبلغ المطلوب:* ${totalRequired} ${params.event.currency || 'جنيه'}`,
      `💳 *طريقة الدفع:* ${methodLabel}`,
      ``,
      `شكراً لخدمتكم المباركة 🙏`
    ].filter(Boolean);

    const text = encodeURIComponent(messageLines.join('\n'));
    const rawPhone = (params.contact?.phone || '').replace(/\D/g, '');
    if (!rawPhone) {
      return `https://wa.me/?text=${text}`;
    }
    const cleanPhone = rawPhone.startsWith('01') && rawPhone.length === 11 ? `2${rawPhone}` : rawPhone;
    return `https://wa.me/${cleanPhone}?text=${text}`;
  },

  getPublicRegistrationLink(eventId: string): string {
    if (typeof window === 'undefined') return `https://3fetya-youths.com/?eventRegister=${encodeURIComponent(eventId)}`;
    const publicOrigin = window.location.origin.replace(/https?:\/\/3fetya-youths\.ai\.studio/gi, 'https://3fetya-youths.com');
    return `${publicOrigin}/?eventRegister=${encodeURIComponent(eventId)}`;
  },

  // ==========================================
  // 9. DASHBOARD KPI & BUS STATISTICS
  // ==========================================
  getEventSummaryStats(eventId: string): EventSummaryStats {
    const event = this.getEventById(eventId);
    const allRegs = this.getRegistrations(eventId);
    const activeRegs = allRegs.filter(r => r.registrationStatus === 'registered');
    const cancelledRegs = allRegs.filter(r => r.registrationStatus === 'cancelled');
    const waitlistedRegs = allRegs.filter(r => r.registrationStatus === 'waitlisted');
    const buses = this.getBuses(eventId);
    const availability = this.evaluateEventRegistrationAvailability(event);

    const totalRegistered = activeRegs.length;
    const overrideRegisteredCount = activeRegs.filter(r => Boolean(r.isOverride)).length;
    const normalRegisteredCount = Math.max(0, totalRegistered - overrideRegisteredCount);
    const isUnlimitedCapacity = availability.isUnlimited;
    const maxCapacity = isUnlimitedCapacity ? 0 : event?.maxCapacity || 0;
    const availableSeats = isUnlimitedCapacity ? 999999 : Math.max(0, maxCapacity - totalRegistered);

    const totalCheckedIn = activeRegs.filter(r => r.attendanceStatus === 'present').length;
    const totalNotCheckedIn = Math.max(0, totalRegistered - totalCheckedIn);

    let totalOriginalPrice = 0;
    let totalDiscounts = 0;
    let totalRequiredMoney = 0;
    let totalCollectedPaid = 0;
    let totalPendingRemaining = 0;

    let paidCount = 0;
    let partiallyPaidCount = 0;
    let pendingConfirmationCount = 0;
    let unpaidCount = 0;
    let waivedCount = 0;

    for (const r of activeRegs) {
      totalOriginalPrice += Number(r.originalPrice || 0);
      totalDiscounts += Number(r.discountAmount || 0);
      totalRequiredMoney += Number(r.finalRequiredAmount || 0);
      totalCollectedPaid += Number(r.totalPaidAmount || 0);
      totalPendingRemaining += Number(r.remainingAmount || 0);

      if (r.paymentStatus === 'paid') paidCount++;
      else if (r.paymentStatus === 'partially_paid') partiallyPaidCount++;
      else if (r.paymentStatus === 'pending_confirmation') pendingConfirmationCount++;
      else if (r.paymentStatus === 'waived') waivedCount++;
      else unpaidCount++;
    }

    const totalBusCapacity = buses.reduce((sum, b) => sum + Number(b.capacity || 0), 0);
    const totalBusAssigned = activeRegs.filter(r => Boolean(r.busId)).length;
    const availableBusSeats = Math.max(0, totalBusCapacity - totalBusAssigned);

    return {
      totalRegistered,
      normalRegisteredCount,
      overrideRegisteredCount,
      totalCancelled: cancelledRegs.length,
      totalWaitlisted: waitlistedRegs.length,
      maxCapacity,
      isUnlimitedCapacity,
      availableSeats,
      availability,
      totalCheckedIn,
      totalNotCheckedIn,
      totalOriginalPrice,
      totalDiscounts,
      totalRequiredMoney,
      totalCollectedPaid,
      totalPendingRemaining,
      paidCount,
      partiallyPaidCount,
      pendingConfirmationCount,
      unpaidCount,
      waivedCount,
      totalBusCapacity,
      totalBusAssigned,
      availableBusSeats
    };
  }
};

export const PENDING_EVENT_REGISTRATION_KEY = 'three_youths_pending_event_id';

export interface EnrichedEventRegistration extends EventRegistration {
  member?: Registrant;
  bus?: EventBus;
  actualBus?: EventBus;
  assignedBusId?: string | null;
  createdAt: string;
  transactions: PaymentTransaction[];
  attendance?: {
    id: string;
    checkInTime: string;
    checkedInByName: string;
    method: 'qr' | 'manual';
    originalBusId?: string | null;
    actualBusId?: string | null;
  };
}

export interface EventCheckInResult {
  status: 'confirmed' | 'bus_changed' | 'already_checked_in' | 'not_registered' | 'member_not_found' | 'wrong_bus';
  message: string;
  member?: Registrant;
  registration?: EventRegistration;
  bus?: EventBus | null;
  actualBus?: EventBus | null;
  attendance?: {
    checkInTime: string;
    checkedInByName: string;
    method: 'qr' | 'manual';
  };
}

export function getAllEvents(): CommunityEvent[] {
  return eventsService.getEvents();
}

export function getAccessibleEventsForUser(user?: Registrant | null, role?: UserRole): CommunityEvent[] {
  return eventsService.getAccessibleEventsForUser(user, role);
}

export function getUserEventPermissions(
  eventId: string,
  user?: Registrant | null,
  role?: UserRole
): UserEventPermissions {
  return eventsService.getUserEventPermissions(eventId, user, role);
}

export function hasAnyEventAccessForAdminMenu(user?: Registrant | null, role?: UserRole): boolean {
  return eventsService.hasAnyEventAccessForAdminMenu(user, role);
}

export function isUserSuperAdminForEvents(user?: Registrant | null, role?: UserRole): boolean {
  return eventsService.isUserSuperAdmin(user, role);
}

export function getAvailableServantsFromMakhdomeen(searchQuery?: string): Registrant[] {
  return eventsService.getAvailableServantsFromMakhdomeen(searchQuery);
}

export function getEventStaffAssignments(eventId?: string): EventStaffAssignment[] {
  return eventsService.getEventStaffAssignments(eventId);
}

export function evaluateEventRegistrationAvailability(
  eventOrId: CommunityEvent | string | null | undefined
): EventAvailabilityEvaluation {
  return eventsService.evaluateEventRegistrationAvailability(eventOrId);
}

export function assignServantToEvent(params: {
  eventId: string;
  servant: Registrant;
  roles: EventStaffRole[];
  permissions?: EventPermissionKey[];
  assignedBusId?: string | null;
  assignedBy: string;
  actorUserId?: string;
}): EventStaffAssignment {
  return eventsService.assignServantToEvent(params);
}

export function removeServantFromEvent(assignmentId: string, actorName?: string, actorUserId?: string): void {
  eventsService.removeServantFromEvent(assignmentId, actorName, actorUserId);
}

export function getContactsForPaymentMethod(
  event: CommunityEvent,
  paymentMethod: PaymentMethodType
): EventPaymentContact[] {
  return eventsService.getContactsForPaymentMethod(event, paymentMethod);
}

export function confirmFullRegistrationPayment(params: {
  registrationId: string;
  actorName: string;
  paymentMethod?: PaymentMethodType;
  notes?: string;
}): { success: boolean; error?: string; registration?: EventRegistration } {
  return eventsService.confirmFullRegistrationPayment(params);
}

export function getEventById(eventId: string): CommunityEvent | null {
  return eventsService.getEventById(eventId);
}

export function saveEvent(
  eventData: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  actor?: { id: string; name: string }
): CommunityEvent {
  return eventsService.saveEvent(eventData, actor?.name || 'المسؤول');
}

export function deleteEvent(eventId: string, actor?: { id: string; name: string }): void {
  eventsService.deleteEvent(eventId, actor?.name || 'المسؤول');
}

export function archiveEvent(
  eventId: string,
  archive: boolean = true,
  actor?: { id: string; name: string }
): CommunityEvent | null {
  return eventsService.archiveEvent(eventId, archive, actor?.name || 'المسؤول');
}

export function getEventBuses(eventId: string): EventBus[] {
  return eventsService.getBuses(eventId);
}

export function saveEventBus(
  busData: Omit<EventBus, 'id' | 'createdAt'> & { id?: string },
  actor?: { id: string; name: string }
): EventBus {
  return eventsService.saveBus(busData, actor?.name || 'المسؤول');
}

export function deleteEventBus(busId: string, actor?: { id: string; name: string }): void {
  eventsService.deleteBus(busId, actor?.name || 'المسؤول');
}

export function assignMemberToBus(params: {
  registrationId: string;
  busId?: string | null;
  allowCapacityOverride?: boolean;
  performedBy?: { id: string; name: string };
}): { success: boolean; error?: string; warning?: string; requiresOverride?: boolean } {
  const allRegs = eventsService.getRegistrations();
  const reg = allRegs.find(r => r.id === params.registrationId);
  if (reg && params.busId && !params.allowCapacityOverride) {
    const capCheck = eventsService.validateBusCapacity(reg.eventId, params.busId, 1, false);
    if (!capCheck.canAssign && capCheck.isFull) {
      return {
        success: false,
        requiresOverride: true,
        error: capCheck.error
      };
    }
  }
  return eventsService.assignMemberToBus({
    registrationId: params.registrationId,
    busId: params.busId || null,
    actorName: params.performedBy?.name || 'المسؤول',
    allowAdminOverride: params.allowCapacityOverride
  });
}

export function getEventPayments(eventId: string): PaymentTransaction[] {
  return eventsService.getPayments(eventId);
}

export function getEventAuditLogs(eventId: string): Array<
  EventAuditLog & {
    timestamp: string;
    targetMemberName?: string;
    description: string;
    performedByName: string;
  }
> {
  return eventsService.getAuditLogs(eventId).map(log => ({
    ...log,
    timestamp: log.createdAt,
    targetMemberName: log.memberName,
    description: [
      log.newValue ? `${log.newValue}` : '',
      log.oldValue ? `(السابق: ${log.oldValue})` : '',
      log.reason ? `— السبب: ${log.reason}` : ''
    ]
      .filter(Boolean)
      .join(' '),
    performedByName: log.changedBy
  }));
}

export function getEnrichedEventRegistrations(eventId: string): EnrichedEventRegistration[] {
  const regs = eventsService.getRegistrations(eventId);
  const buses = eventsService.getBuses(eventId);
  const payments = eventsService.getPayments(eventId);
  const allMembers = storageService.getRegistrants();

  return regs.map(r => {
    const member = allMembers.find(m => m.id === r.memberId);
    const bus = r.busId ? buses.find(b => b.id === r.busId) : undefined;
    const actualBusId = r.actualBusId || (r.attendanceStatus === 'present' ? r.busId : null);
    const actualBus = actualBusId ? buses.find(b => b.id === actualBusId) : undefined;
    const txList = payments.filter(p => p.eventRegistrationId === r.id);
    const attendance =
      r.attendanceStatus === 'present' && r.checkInTime
        ? {
            id: `att_${r.id}`,
            checkInTime: r.checkInTime,
            checkedInByName: r.checkedInBy || 'المسؤول',
            method: (r.checkInMethod === 'Manual' ? 'manual' : 'qr') as 'qr' | 'manual',
            originalBusId: r.busId || null,
            actualBusId: actualBusId || null
          }
        : undefined;

    return {
      ...r,
      member,
      bus,
      actualBus,
      assignedBusId: r.busId || null,
      createdAt: r.registrationDate,
      transactions: txList,
      attendance
    };
  });
}

export function calculateEventKPIs(eventId: string) {
  const stats = eventsService.getEventSummaryStats(eventId);
  return {
    totalRegistered: stats.totalRegistered,
    normalRegisteredCount: stats.normalRegisteredCount,
    overrideRegisteredCount: stats.overrideRegisteredCount,
    availability: stats.availability,
    totalCheckedIn: stats.totalCheckedIn,
    totalNotCheckedIn: stats.totalNotCheckedIn,
    totalRequiredAmount: stats.totalRequiredMoney,
    totalCollectedAmount: stats.totalCollectedPaid,
    totalPendingAmount: stats.totalPendingRemaining,
    totalBusCapacity: stats.totalBusCapacity,
    availableBusSeats: stats.availableBusSeats
  };
}

export function getPublicEventRegistrationUrl(eventId: string): string {
  return eventsService.getPublicRegistrationLink(eventId);
}

export function searchExistingMembers(query: string, limit = 15): Registrant[] {
  return eventsService.searchExistingMembers(query, limit);
}

export function maskPhoneForPublic(phone: string): string {
  return eventsService.maskPhoneForPublicDisplay(phone);
}

export function getMemberActiveEventRegistration(
  eventId: string,
  memberId: string
): EventRegistration | undefined {
  return eventsService.findActiveMemberRegistration(eventId, memberId) || undefined;
}

export function registerMembersInEvent(params: {
  eventId: string;
  memberIds: string[];
  primaryMemberId: string;
  paymentMethod?: PaymentMethodType;
  selectedContactId?: string;
  assignedServantId?: string;
  notes?: string;
  registeredBy?: string;
  actor?: { id: string; name: string };
  isOverride?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  isPublicRegistration?: boolean;
}): {
  success: boolean;
  error?: string;
  requiresOverride?: boolean;
  availabilityState?: EventAvailabilityState;
  registrations: EventRegistration[];
  group?: RegistrationGroup;
  selectedWhatsappContact?: EventPaymentContact;
} {
  const res = eventsService.registerMembersInEvent({
    eventId: params.eventId,
    memberIds: params.memberIds,
    primaryMemberId: params.primaryMemberId,
    paymentMethod: params.paymentMethod,
    selectedContactId: params.selectedContactId,
    assignedServantId: params.assignedServantId,
    notes: params.notes,
    isOverride: params.isOverride,
    overrideReason: params.overrideReason,
    overrideBy: params.overrideBy || params.actor?.name,
    registeredBy:
      params.registeredBy === 'self'
        ? 'public_link'
        : params.actor?.name || params.registeredBy || 'public_link'
  });

  return {
    success: res.success,
    error: res.error,
    requiresOverride: res.requiresOverride,
    availabilityState: res.availabilityState,
    registrations: res.createdRegistrations || [],
    group: res.group,
    selectedWhatsappContact: res.selectedWhatsappContact
  };
}

export function buildEventWhatsAppConfirmationUrl(params: {
  event: CommunityEvent;
  primaryMember: Registrant;
  members: Registrant[];
  paymentMethod: PaymentMethodType;
  registrationReference: string;
  selectedContact?: EventPaymentContact;
}): { url: string; contact: EventPaymentContact } | null {
  const contact =
    params.selectedContact ||
    eventsService.selectPaymentContactForMethod(params.event, params.paymentMethod) || {
      id: 'default_contact',
      name: 'مسؤول اشتراكات الرحلات والمؤتمرات',
      phone: ''
    };
  const url = eventsService.buildWhatsAppBookingUrl({
    event: params.event,
    reference: params.registrationReference,
    primaryMember: params.primaryMember,
    allMembers: params.members,
    paymentMethod: params.paymentMethod,
    contact
  });
  return { url, contact };
}

export function recordEventAttendance(params: {
  eventId: string;
  qrOrMemberInput: string;
  selectedBusId?: string;
  method: 'qr' | 'manual';
  checkedInBy: { id: string; name: string };
}): EventCheckInResult {
  const res = eventsService.checkInMemberForEvent({
    eventId: params.eventId,
    qrOrCodeOrMemberId: params.qrOrMemberInput,
    selectedBusId: params.selectedBusId || 'all',
    method: params.method === 'qr' ? 'QR' : 'Manual',
    checkedInBy: params.checkedInBy.name || 'المسؤول'
  });

  return {
    status: res.status,
    message: res.message,
    member: res.member,
    registration: res.registration,
    bus: res.assignedBus,
    actualBus: res.actualBus,
    attendance:
      res.registration?.checkInTime || res.previousCheckInTime
        ? {
            checkInTime: (res.registration?.checkInTime || res.previousCheckInTime)!,
            checkedInByName: res.registration?.checkedInBy || params.checkedInBy.name,
            method: params.method
          }
        : undefined
  };
}

export function revokeEventAttendance(
  eventId: string,
  memberId: string,
  actor?: { id: string; name: string }
): boolean {
  const reg = eventsService.findActiveMemberRegistration(eventId, memberId);
  if (!reg) return false;
  return eventsService.revokeEventAttendance(reg.id, actor?.name || 'المسؤول').success;
}

export function isEventVisibleToMembers(
  event: CommunityEvent | null | undefined,
  nowMs: number = Date.now()
): { visible: boolean; isExpired: boolean; reason?: 'draft_or_cancelled' | 'manually_hidden' | 'expired' } {
  if (!event || event.status === 'draft' || event.status === 'cancelled' || event.status === 'archived' || event.isArchived) {
    return { visible: false, isExpired: false, reason: 'draft_or_cancelled' };
  }
  if (event.isVisibleToMembers === false) {
    return { visible: false, isExpired: false, reason: 'manually_hidden' };
  }
  const endYmd = (event.endDate || event.startDate || '').trim();
  let isExpired = false;
  if (endYmd) {
    const endTimeStr = (event.endTime || '23:59').trim() || '23:59';
    const endTimestamp = new Date(`${endYmd}T${endTimeStr}:59`).getTime();
    if (!Number.isNaN(endTimestamp) && nowMs > endTimestamp) {
      isExpired = true;
    }
  }
  if (isExpired && event.autoHideOnExpiry !== false) {
    return { visible: false, isExpired: true, reason: 'expired' };
  }
  return { visible: true, isExpired };
}

