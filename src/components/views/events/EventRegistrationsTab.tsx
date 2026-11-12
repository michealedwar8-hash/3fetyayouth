import React, { useState, useMemo, useEffect } from 'react';
import {
  CommunityEvent,
  EventBus,
  EventRegistration,
  EventRegistrationStatus,
  PaymentMethodType,
  PaymentStatus,
  Registrant
} from '../../../types';
import {
  eventsService,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS
} from '../../../services/eventsService';
import {
  Search,
  UserPlus,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bus,
  CreditCard,
  MessageCircle,
  Copy,
  Check,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trash2,
  Share2,
  Calendar,
  Phone,
  Sparkles,
  QrCode,
  X
} from 'lucide-react';

interface EventRegistrationsTabProps {
  event: CommunityEvent;
  registrations: EventRegistration[];
  buses: EventBus[];
  allMembers: Registrant[];
  actorName: string;
  canManagePayments: boolean;
  canOverrideLimits?: boolean;
  canCancelRegistrations?: boolean;
  onRefresh: () => void;
  onOpenPaymentForReg: (reg: EventRegistration) => void;
}

export const EventRegistrationsTab: React.FC<EventRegistrationsTabProps> = ({
  event,
  registrations,
  buses,
  allMembers,
  actorName,
  canManagePayments,
  canOverrideLimits = false,
  canCancelRegistrations = true,
  onRefresh,
  onOpenPaymentForReg
}) => {
  // Servant Internal Registration State
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [debouncedMemberQuery, setDebouncedMemberQuery] = useState('');
  const [selectedMembersToRegister, setSelectedMembersToRegister] = useState<Registrant[]>([]);
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodType>(
    event.availablePaymentMethods?.[0] || 'vodafone_cash'
  );
  const [customDiscount, setCustomDiscount] = useState<string>('0');
  const [customDiscountReason, setCustomDiscountReason] = useState<string>('');
  const [regNotes, setRegNotes] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideConfirmed, setOverrideConfirmed] = useState<boolean>(false);
  const [regFeedback, setRegFeedback] = useState<{
    type: 'success' | 'error' | 'duplicate';
    message: string;
    existingReg?: EventRegistration;
    duplicateMember?: Registrant;
  } | null>(null);

  const availability = useMemo(
    () => eventsService.evaluateEventRegistrationAvailability(event),
    [event, registrations]
  );

  const requiresOverride = useMemo(() => {
    const activeCount = registrations.filter(r => r.registrationStatus === 'registered').length;
    const isUnlimited =
      event.capacityType === 'unlimited' || !event.maxCapacity || Number(event.maxCapacity) <= 0;
    const wouldExceed =
      !isUnlimited &&
      event.maxCapacity > 0 &&
      activeCount + Math.max(1, selectedMembersToRegister.length) > event.maxCapacity;
    return !availability.canRegisterPublicly || wouldExceed;
  }, [availability, registrations, event, selectedMembersToRegister.length]);

  // Table Filters & Pagination State
  const [tableSearch, setTableSearch] = useState('');
  const [debouncedTableSearch, setDebouncedTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EventRegistrationStatus>('registered');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentStatus>('all');
  const [busFilter, setBusFilter] = useState<string>('all');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Cancel & Discount Modal State
  const [cancellingReg, setCancellingReg] = useState<EventRegistration | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [discountingReg, setDiscountingReg] = useState<EventRegistration | null>(null);
  const [modalDiscountAmount, setModalDiscountAmount] = useState<string>('0');
  const [modalDiscountReason, setModalDiscountReason] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Debounce member search (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberQuery(memberSearchQuery), 250);
    return () => clearTimeout(t);
  }, [memberSearchQuery]);

  // Debounce table search (250ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedTableSearch(tableSearch);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [tableSearch]);

  const membersMap = useMemo(() => {
    const map = new Map<string, Registrant>();
    allMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [allMembers]);

  const busesMap = useMemo(() => {
    const map = new Map<string, EventBus>();
    buses.forEach(b => map.set(b.id, b));
    return map;
  }, [buses]);

  // Search results from «المخدومين والرتب»
  const memberSearchResults = useMemo(() => {
    if (!debouncedMemberQuery.trim()) return [];
    return eventsService.searchExistingMembers(debouncedMemberQuery, 10);
  }, [debouncedMemberQuery, allMembers]);

  const handleSelectMemberFromSearch = (member: Registrant) => {
    setRegFeedback(null);
    // Check if already registered in this event
    const existing = eventsService.findActiveMemberRegistration(event.id, member.id);
    if (existing) {
      setRegFeedback({
        type: 'duplicate',
        message: `⚠️ العضو (${member.fullName}) مسجل بالفعل في هذه الفعالية!`,
        existingReg: existing,
        duplicateMember: member
      });
      return;
    }

    if (selectedMembersToRegister.some(m => m.id === member.id)) {
      return;
    }

    setSelectedMembersToRegister(prev => [...prev, member]);
    setMemberSearchQuery('');
  };

  const handleRemoveSelectedMember = (id: string) => {
    setSelectedMembersToRegister(prev => prev.filter(m => m.id !== id));
  };

  const handleCompleteInternalRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setRegFeedback(null);

    if (selectedMembersToRegister.length === 0) {
      setRegFeedback({ type: 'error', message: 'يرجى البحث واختيار عضو واحد على الأقل من سجل المخدومين.' });
      return;
    }

    if (requiresOverride) {
      if (!canOverrideLimits) {
        setRegFeedback({
          type: 'error',
          message: 'التسجيل مغلق أو اكتمل العدد، ولا تملك صلاحية التسجيل الاستثنائي (Override).'
        });
        return;
      }
      if (!overrideConfirmed || !overrideReason.trim()) {
        setRegFeedback({
          type: 'error',
          message: 'يرجى كتابة سبب التسجيل الاستثنائي وتأكيد الموافقة على التجاوز أولاً.'
        });
        return;
      }
    }

    const discountVal = Math.max(0, Number(customDiscount || 0));
    const res = eventsService.registerMembersInEvent({
      eventId: event.id,
      memberIds: selectedMembersToRegister.map(m => m.id),
      primaryMemberId: selectedMembersToRegister[0].id,
      paymentMethod: selectedPaymentMethod,
      registeredBy: actorName,
      notes: regNotes.trim() || undefined,
      customDiscountAmount: discountVal,
      customDiscountReason: customDiscountReason.trim() || undefined,
      busId: selectedBusId || null,
      isOverride: requiresOverride && canOverrideLimits,
      overrideReason: requiresOverride ? overrideReason.trim() : undefined,
      overrideBy: requiresOverride ? actorName : undefined
    });

    if (!res.success) {
      setRegFeedback({
        type: res.existingRegistration ? 'duplicate' : 'error',
        message: res.error || 'تعذر إتمام التسجيل.',
        existingReg: res.existingRegistration,
        duplicateMember: res.duplicateMember
      });
      return;
    }

    const names = selectedMembersToRegister.map(m => m.fullName).join('، ');
    setRegFeedback({
      type: 'success',
      message: `✅ تم تسجيل (${names}) بنجاح في ${event.name}! الرقم المرجعي: ${res.group?.registrationReference || res.createdRegistrations?.[0]?.registrationReference}`
    });
    setSelectedMembersToRegister([]);
    setCustomDiscount('0');
    setCustomDiscountReason('');
    setRegNotes('');
    setOverrideReason('');
    setOverrideConfirmed(false);
    onRefresh();
  };

  const handleCopyPublicLink = () => {
    const link = eventsService.getPublicRegistrationLink(event.id);
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Filtered Registrations Table
  const filteredRegistrations = useMemo(() => {
    const q = debouncedTableSearch.trim().toLowerCase();
    return registrations.filter(reg => {
      if (statusFilter !== 'all' && reg.registrationStatus !== statusFilter) return false;
      if (paymentFilter !== 'all' && reg.paymentStatus !== paymentFilter) return false;
      if (busFilter !== 'all') {
        if (busFilter === 'unassigned' && reg.busId) return false;
        if (busFilter !== 'unassigned' && reg.busId !== busFilter) return false;
      }
      if (attendanceFilter !== 'all' && reg.attendanceStatus !== attendanceFilter) return false;
      if (dateFilter && !reg.registrationDate.startsWith(dateFilter)) return false;

      if (q) {
        const m = membersMap.get(reg.memberId);
        const fullName = (m?.fullName || '').toLowerCase();
        const phone = (m?.phone || '').toLowerCase();
        const code = (m?.uniqueCode || '').toLowerCase();
        const ref = (reg.registrationReference || '').toLowerCase();
        if (!fullName.includes(q) && !phone.includes(q) && !code.includes(q) && !ref.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [
    registrations,
    debouncedTableSearch,
    statusFilter,
    paymentFilter,
    busFilter,
    attendanceFilter,
    dateFilter,
    membersMap
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const paginatedRegistrations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRegistrations.slice(start, start + pageSize);
  }, [filteredRegistrations, currentPage]);

  const handleConfirmCancel = () => {
    if (!cancellingReg) return;
    eventsService.cancelRegistration(
      cancellingReg.id,
      cancelReason.trim() || 'إلغاء الحجز بواسطة الإدارة',
      actorName
    );
    setCancellingReg(null);
    setCancelReason('');
    onRefresh();
  };

  const handleRestoreReg = (regId: string) => {
    eventsService.restoreRegistration(regId, actorName);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* 1. Public Registration Link Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-black">رابط التسجيل العام للمخدومين (Public Event Registration Link)</h3>
          </div>
          <p className="text-xs text-slate-300">
            شارك هذا الرابط في جروب الواتساب ليتمكن الأعضاء من التسجيل الفردي أو الجماعي والتواصل التلقائي مع خادم الدفع:
          </p>
          <div className="mt-1.5 inline-block bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-xl font-mono text-xs text-emerald-300 break-all" dir="ltr">
            {eventsService.getPublicRegistrationLink(event.id)}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
          <button
            type="button"
            onClick={handleCopyPublicLink}
            className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'تم نسخ الرابط بنجاح!' : 'نسخ رابط التسجيل'}</span>
          </button>
          <a
            href={`/?eventRegister=${encodeURIComponent(event.id)}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
          >
            معاينة الرابط ↗
          </a>
        </div>
      </div>

      {/* 2. Servant Internal Member Registration Panel (Shown ONLY if OVERRIDE_EVENT_REGISTRATION_LIMITS is granted) */}
      {canOverrideLimits && (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                تسجيل عضو من قاعدة بيانات «المخدومين والرتب» (Internal Servant Registration)
              </h3>
              <p className="text-xs text-slate-500">
                ابحث بالاسم الثلاثي أو رقم الهاتف أو الكود (`TY-XXXX`) لربط العضو مباشرة بالفعالية دون تكرار بياناته
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-xl border border-slate-200">
            السعر الأساسي: {event.basePrice} {event.currency}
          </span>
        </div>

        {/* Search Input & Live Results Dropdown */}
        <div className="relative">
          <div className="relative">
            <input
              type="text"
              value={memberSearchQuery}
              onChange={e => setMemberSearchQuery(e.target.value)}
              placeholder="ابحث هنا عن اسم المخدوم أو الخادم، رقم الهاتف، أو الكود (مثال: مينا، 012، TY-0001)..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 focus:bg-white px-4 py-3 pr-11 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
            />
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            {memberSearchQuery && (
              <button
                type="button"
                onClick={() => setMemberSearchQuery('')}
                className="absolute left-3 top-3 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search Results List */}
          {debouncedMemberQuery.trim() && (
            <div className="mt-2 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
              {memberSearchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  لا يوجد عضو مسجل في «المخدومين والرتب» يطابق "{debouncedMemberQuery}". يجب تسجيل العضو في الموقع أولاً.
                </div>
              ) : (
                memberSearchResults.map(member => {
                  const existingReg = eventsService.findActiveMemberRegistration(event.id, member.id);
                  const isAlreadySelected = selectedMembersToRegister.some(m => m.id === member.id);

                  return (
                    <div
                      key={member.id}
                      className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {member.photoUrl ? (
                          <img
                            src={member.photoUrl}
                            alt={member.fullName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {member.fullName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-xs sm:text-sm text-slate-900 truncate">
                              {member.fullName}
                            </span>
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                              {member.uniqueCode}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-mono">
                            <span dir="ltr">{member.phone}</span>
                            {member.dob && <span>🎂 {member.dob}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {existingReg ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                            <span>مسجل بالفعل ({existingReg.registrationReference})</span>
                          </span>
                        ) : isAlreadySelected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                            تمت إضافته للقائمة ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectMemberFromSearch(member)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>اختيار للتسجيل</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Selected Members Queue + Registration Options */}
        {selectedMembersToRegister.length > 0 && (
          <form onSubmit={handleCompleteInternalRegistration} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>الأعضاء المختارون للتسجيل ({selectedMembersToRegister.length}):</span>
              </span>
              <span className="text-xs font-mono font-bold text-emerald-800">
                الإجمالي المطلوب قبل الخصم: {selectedMembersToRegister.length * event.basePrice} {event.currency}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedMembersToRegister.map((m, idx) => (
                <div
                  key={m.id}
                  className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs"
                >
                  {m.photoUrl && (
                    <img src={m.photoUrl} alt={m.fullName} className="w-6 h-6 rounded-lg object-cover" />
                  )}
                  <span className="font-bold text-slate-900">
                    {idx === 0 && selectedMembersToRegister.length > 1 ? '⭐ ' : ''}
                    {m.fullName}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">({m.uniqueCode})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSelectedMember(m.id)}
                    className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة الدفع المبدئية</label>
                <select
                  value={selectedPaymentMethod}
                  onChange={e => setSelectedPaymentMethod(e.target.value as PaymentMethodType)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                >
                  {(event.availablePaymentMethods?.length ? event.availablePaymentMethods : (['vodafone_cash', 'instapay', 'bank_transfer', 'cash'] as PaymentMethodType[])).map(pm => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]?.icon} {PAYMENT_METHOD_LABELS[pm]?.label || pm}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">تعيين الباص / الأتوبيس (اختياري)</label>
                <select
                  value={selectedBusId}
                  onChange={e => setSelectedBusId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="">-- بدون تحديد باص الآن --</option>
                  {buses.map(b => {
                    const count = registrations.filter(r => r.registrationStatus === 'registered' && r.busId === b.id).length;
                    return (
                      <option key={b.id} value={b.id}>
                        {b.name} ({count}/{b.capacity})
                      </option>
                    );
                  })}
                </select>
              </div>

              {canManagePayments && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    خصم خاص للفرد ({event.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={event.basePrice}
                    value={customDiscount}
                    onChange={e => setCustomDiscount(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">ملاحظات التسجيل / سبب الخصم</label>
                <input
                  type="text"
                  value={Number(customDiscount) > 0 ? customDiscountReason : regNotes}
                  onChange={e => {
                    if (Number(customDiscount) > 0) setCustomDiscountReason(e.target.value);
                    else setRegNotes(e.target.value);
                  }}
                  placeholder={Number(customDiscount) > 0 ? 'سبب الخصم/الدعم...' : 'ملاحظات إضافية...'}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Override Registration Warning & Mandatory Reason when event is full/closed/deadline passed */}
            {requiresOverride && (
              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  canOverrideLimits
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : 'bg-red-100 border-red-300 text-red-950'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-black">
                      ⚠️ تنبيه حالة التسجيل العام: «{availability.arabicLabel}»
                    </div>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {canOverrideLimits
                        ? 'بصفتك تملك صلاحية تجاوز حدود التسجيل (OVERRIDE_EVENT_REGISTRATION_LIMITS)، يمكنك إضافة هذا العضو كتسجيل استثنائي مع بقاء التسجيل العام مغلقاً أمام باقي الأعضاء.'
                        : 'لا يمكنك التسجيل حالياً لأن التسجيل العام غير متاح ولا تملك صلاحية التجاوز الاستثنائي.'}
                    </p>
                  </div>
                </div>

                {canOverrideLimits && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-black text-rose-900 mb-1">
                        سبب التسجيل الاستثنائي (إلزامي) *
                      </label>
                      <input
                        type="text"
                        required
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="مثال: موافقة خاصة من أمين الخدمة / حالة استثنائية..."
                        className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs text-slate-900"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-rose-900 bg-white px-3 py-2 rounded-xl border border-rose-300 w-full">
                        <input
                          type="checkbox"
                          checked={overrideConfirmed}
                          onChange={e => setOverrideConfirmed(e.target.checked)}
                          className="rounded border-rose-400 text-rose-600"
                        />
                        <span>أؤكد التسجيل الاستثنائي على مسؤوليتي ({actorName})</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={requiresOverride && !canOverrideLimits}
                className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50 ${
                  requiresOverride
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {requiresOverride
                    ? `تأكيد التسجيل الاستثنائي (${selectedMembersToRegister.length})`
                    : `تأكيد وحفظ التسجيل (${selectedMembersToRegister.length})`}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Duplicate or Action Feedback Banner */}
        {regFeedback && (
          <div
            className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              regFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : regFeedback.type === 'duplicate'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="space-y-1">
              <p className="font-black text-xs sm:text-sm">{regFeedback.message}</p>
              {regFeedback.existingReg && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1">
                  <span>رقم الحجز: {regFeedback.existingReg.registrationReference}</span>
                  <span>الحالة المالية: {PAYMENT_STATUS_LABELS[regFeedback.existingReg.paymentStatus]?.label}</span>
                  <span>المدفوع: {regFeedback.existingReg.totalPaidAmount} / {regFeedback.existingReg.finalRequiredAmount}</span>
                  <span>
                    الباص: {regFeedback.existingReg.busId ? (busesMap.get(regFeedback.existingReg.busId)?.name || 'محدد') : 'غير معين'}
                  </span>
                </div>
              )}
            </div>
            {regFeedback.existingReg && canManagePayments && (
              <button
                type="button"
                onClick={() => onOpenPaymentForReg(regFeedback.existingReg!)}
                className="px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shrink-0 cursor-pointer"
              >
                فتح سجل الدفع والخصم 💳
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* 3. Registrations Management Data Table & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                جدول المسجلين في الفعالية ({filteredRegistrations.length})
              </h3>
              <p className="text-xs text-slate-500">
                متابعة حالة التسجيل، المبالغ المطلوبة والمدفوعة والمتبقية، الباص المخصص، وحالة الحضور
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="بحث بالاسم، الهاتف، الكود، أو رقم الحجز..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 pr-9 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-600"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="all">كل حالات التسجيل ({registrations.length})</option>
              <option value="registered">مسجل نشط (Registered)</option>
              <option value="cancelled">ملغي (Cancelled)</option>
              <option value="waitlisted">قائمة انتظار (Waitlisted)</option>
            </select>

            <select
              value={paymentFilter}
              onChange={e => { setPaymentFilter(e.target.value as any); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="all">كل حالات الدفع</option>
              <option value="pending_confirmation">بانتظار تأكيد الدفع (Pending)</option>
              <option value="paid">مدفوع بالكامل (Paid)</option>
              <option value="partially_paid">مدفوع جزئياً (Partially Paid)</option>
              <option value="unpaid">غير مدفوع (Unpaid)</option>
              <option value="waived">معفى بالكامل (Waived)</option>
            </select>

            <select
              value={busFilter}
              onChange={e => { setBusFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="all">كل الباصات</option>
              <option value="unassigned">بدون باص (غير معين)</option>
              {buses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <select
              value={attendanceFilter}
              onChange={e => { setAttendanceFilter(e.target.value as any); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="all">كل حالات الحضور</option>
              <option value="present">حاضر (Checked In)</option>
              <option value="absent">لم يحضر بعد (Not Checked In)</option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
              title="تصفية حسب تاريخ التسجيل"
            />
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black">
              <tr>
                <th className="py-3 px-3.5">العضو (الاسم والكود)</th>
                <th className="py-3 px-3">الهاتف</th>
                <th className="py-3 px-3">حالة التسجيل</th>
                <th className="py-3 px-3">حالة الدفع</th>
                <th className="py-3 px-3 text-left font-mono">المطلوب</th>
                <th className="py-3 px-3 text-left font-mono">المدفوع</th>
                <th className="py-3 px-3 text-left font-mono">المتبقي</th>
                <th className="py-3 px-3">الباص</th>
                <th className="py-3 px-3">الحضور</th>
                <th className="py-3 px-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    لا توجد تسجيلات مطابقة لمعايير البحث أو التصفية الحالية.
                  </td>
                </tr>
              ) : (
                paginatedRegistrations.map(reg => {
                  const member = membersMap.get(reg.memberId);
                  const bus = reg.busId ? busesMap.get(reg.busId) : null;
                  const payBadge = PAYMENT_STATUS_LABELS[reg.paymentStatus] || PAYMENT_STATUS_LABELS.unpaid;

                  return (
                    <tr
                      key={reg.id}
                      className={`hover:bg-slate-50/80 transition ${
                        reg.registrationStatus === 'cancelled' ? 'opacity-60 bg-red-50/20' : ''
                      }`}
                    >
                      {/* Member Name & Photo */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          {member?.photoUrl ? (
                            <img
                              src={member.photoUrl}
                              alt={member.fullName}
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                              {member?.fullName?.[0] || 'ع'}
                            </div>
                          )}
                          <div>
                            <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{member?.fullName || 'عضو غير معروف'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mt-0.5">
                              <span>{member?.uniqueCode || reg.memberId}</span>
                              <span>•</span>
                              <span className="text-emerald-700 font-bold">{reg.registrationReference}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700" dir="ltr">
                        {member?.phone || '-'}
                      </td>

                      {/* Registration Status */}
                      <td className="py-2.5 px-3">
                        {reg.registrationStatus === 'registered' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                              مسجل ✓
                            </span>
                            {reg.isOverride && (
                              <span
                                className="block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black"
                                title={reg.overrideReason || ''}
                              >
                                استثنائي (Override){reg.overrideReason ? `: ${reg.overrideReason}` : ''}
                              </span>
                            )}
                          </div>
                        ) : reg.registrationStatus === 'cancelled' ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-red-100 text-red-800 border border-red-200 font-bold text-[11px]">
                              ملغي ✕
                            </span>
                            {reg.cancellationReason && (
                              <span className="block text-[10px] text-red-600 mt-0.5">{reg.cancellationReason}</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px]">
                            انتظار
                          </span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border font-bold text-[11px] ${payBadge.badgeClass}`}>
                          {payBadge.label}
                        </span>
                        {reg.discountAmount > 0 && (
                          <span className="block text-[10px] text-purple-700 font-mono mt-0.5">
                            خصم: {reg.discountAmount} {event.currency}
                          </span>
                        )}
                        {(reg.assignedServantName || reg.selectedContactName) && (
                          <span className="block text-[10px] text-slate-600 font-bold mt-0.5">
                            الخادم المسؤول: {reg.assignedServantName || reg.selectedContactName}
                          </span>
                        )}
                      </td>

                      {/* Final Required */}
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-900 tabular-nums">
                        {reg.finalRequiredAmount} <span className="text-[10px] text-slate-400">{event.currency}</span>
                      </td>

                      {/* Total Paid */}
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 tabular-nums">
                        {reg.totalPaidAmount} <span className="text-[10px] text-slate-400">{event.currency}</span>
                      </td>

                      {/* Remaining */}
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-700 tabular-nums">
                        {reg.remainingAmount} <span className="text-[10px] text-slate-400">{event.currency}</span>
                      </td>

                      {/* Bus */}
                      <td className="py-2.5 px-3">
                        {bus ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[11px]">
                            <Bus className="w-3 h-3" />
                            <span>{bus.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">غير معين</span>
                        )}
                      </td>

                      {/* Attendance */}
                      <td className="py-2.5 px-3">
                        {reg.attendanceStatus === 'present' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>حاضر ({reg.checkInMethod || 'QR'})</span>
                            </span>
                            {reg.actualBusId && reg.busId && reg.actualBusId !== reg.busId && (
                              <span className="block text-[10px] text-amber-700 font-bold mt-0.5">
                                صعد فعلياً: {busesMap.get(reg.actualBusId)?.name || 'باص آخر'}
                              </span>
                            )}
                            {reg.checkInTime && (
                              <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                                {new Date(reg.checkInTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[11px]">
                            لم يحضر
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {canManagePayments && reg.remainingAmount > 0 && reg.registrationStatus === 'registered' && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = eventsService.confirmFullRegistrationPayment({
                                  registrationId: reg.id,
                                  paymentMethod: reg.paymentMethod || 'cash',
                                  actorName,
                                  notes: 'تأكيد دفع كامل سريع من جدول التسجيلات'
                                });
                                if (res.success) {
                                  onRefresh();
                                }
                              }}
                              className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                              title="تأكيد سداد كامل المبلغ المتبقي فوراً"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>تأكيد الدفع</span>
                            </button>
                          )}

                          {canManagePayments && reg.registrationStatus === 'registered' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setDiscountingReg(reg);
                                  setModalDiscountAmount(String(reg.discountAmount || 0));
                                  setModalDiscountReason(reg.discountReason || '');
                                }}
                                className="px-2 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                                title="تطبيق خصم مالي على الاشتراك"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>خصم مالي</span>
                              </button>

                              {reg.paymentStatus !== 'waived' && reg.finalRequiredAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const res = eventsService.updateRegistrationDiscount({
                                      registrationId: reg.id,
                                      discountAmount: reg.originalPrice,
                                      discountReason: 'إعفاء كامل (مجاني 0)',
                                      actorName
                                    });
                                    if (res.success) {
                                      onRefresh();
                                    }
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                                  title="إعفاء كامل من الرسوم (مجاني 0)"
                                >
                                  <span>إعفاء كامل (0)</span>
                                </button>
                              )}
                            </>
                          )}

                          {member?.whatsapp && (
                            <a
                              href={`https://wa.me/${(member.whatsapp || member.phone).replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition"
                              title="مراسلة عبر واتساب"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {canCancelRegistrations && (
                            reg.registrationStatus === 'registered' ? (
                              <button
                                type="button"
                                onClick={() => setCancellingReg(reg)}
                                className="px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                                title="إلغاء التسجيل وإخلاء مقعد الباص"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>إلغاء التسجيل</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRestoreReg(reg.id)}
                                className="px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                                title="استعادة التسجيل"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>استعادة</span>
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

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-mono">
              صفحة {currentPage} من {totalPages} (إجمالي {filteredRegistrations.length} سجل)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 font-bold flex items-center gap-1 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>السابق</span>
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Registration Modal (Preserves Financial Records) */}
      {cancellingReg && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>تأكيد إلغاء التسجيل في الفعالية</span>
              </h3>
              <button
                type="button"
                onClick={() => setCancellingReg(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                هل أنت متأكد من تحويل حالة تسجيل{' '}
                <strong className="text-slate-900">
                  {membersMap.get(cancellingReg.memberId)?.fullName}
                </strong>{' '}
                إلى <strong>ملغي (Cancelled)</strong>؟
              </p>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                💡 ملاحظة محاسبية: لن يتم حذف أي سجلات دفع سابقة ({cancellingReg.totalPaidAmount}{' '}
                {event.currency})، وسيتم تحرير مقعد الباص وتسجيل العملية في سجل المراجعة (Audit Log).
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الإلغاء:</label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="مثال: اعتذار العضو عن السفر..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingReg(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs cursor-pointer"
              >
                تأكيد إلغاء التسجيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount & Full Waiver Modal */}
      {discountingReg && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600" />
                <span>تخصيص خصم مالي أو إعفاء للاشتراك</span>
              </h3>
              <button
                type="button"
                onClick={() => setDiscountingReg(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p>
                العضو:{' '}
                <strong className="text-slate-900">
                  {membersMap.get(discountingReg.memberId)?.fullName || discountingReg.registrationReference}
                </strong>{' '}
                (السعر الأساسي: <span className="font-mono font-bold">{discountingReg.originalPrice} {event.currency}</span>)
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  قيمة الخصم المالي ({event.currency}):
                </label>
                <input
                  type="number"
                  min={0}
                  max={discountingReg.originalPrice}
                  value={modalDiscountAmount}
                  onChange={e => setModalDiscountAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الخصم / الإعفاء:</label>
                <input
                  type="text"
                  value={modalDiscountReason}
                  onChange={e => setModalDiscountReason(e.target.value)}
                  placeholder="مثال: دعم خدمة الشباب / إعفاء..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDiscountingReg(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  const discountVal = Math.min(
                    discountingReg.originalPrice,
                    Math.max(0, Number(modalDiscountAmount) || 0)
                  );
                  const res = eventsService.updateRegistrationDiscount({
                    registrationId: discountingReg.id,
                    discountAmount: discountVal,
                    discountReason:
                      modalDiscountReason.trim() ||
                      (discountVal >= discountingReg.originalPrice
                        ? 'إعفاء كامل (مجاني 0)'
                        : `خصم مالي بقيمة ${discountVal} ${event.currency}`),
                    actorName
                  });
                  if (res.success) {
                    setDiscountingReg(null);
                    onRefresh();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer"
              >
                حفظ الخصم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
