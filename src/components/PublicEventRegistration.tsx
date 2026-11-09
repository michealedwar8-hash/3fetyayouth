import React, { useState, useEffect, useMemo } from 'react';
import {
  CommunityEvent,
  Registrant,
  PaymentMethodType,
  EventRegistration,
  EventPaymentContact,
} from '../types';
import {
  getEventById,
  searchExistingMembers,
  maskPhoneForPublic,
  getMemberActiveEventRegistration,
  registerMembersInEvent,
  buildEventWhatsAppConfirmationUrl,
  getContactsForPaymentMethod,
  evaluateEventRegistrationAvailability,
  EVENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PENDING_EVENT_REGISTRATION_KEY,
} from '../services/eventsService';
import {
  Tent,
  Calendar,
  MapPin,
  Search,
  UserCheck,
  UserPlus,
  Users,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Phone,
} from 'lucide-react';

interface PublicEventRegistrationProps {
  eventId: string;
  initialMember?: Registrant | null;
  onRedirectToSiteRegistration: (eventId: string) => void;
  onBackToHome: () => void;
}

export const PublicEventRegistration: React.FC<PublicEventRegistrationProps> = ({
  eventId,
  initialMember,
  onRedirectToSiteRegistration,
  onBackToHome,
}) => {
  const [event, setEvent] = useState<CommunityEvent | null>(() => getEventById(eventId) || null);
  const [primaryMember, setPrimaryMember] = useState<Registrant | null>(initialMember || null);

  // Step 1 Search State
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [hasSearchedPrimary, setHasSearchedPrimary] = useState(false);

  // Step 2 Group Registration State
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [companionMembers, setCompanionMembers] = useState<Registrant[]>([]);
  const [companionSearchQuery, setCompanionSearchQuery] = useState('');
  const [companionError, setCompanionError] = useState<string | null>(null);

  // Step 3 Payment Method, Servant Selection & Notes
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethodType>('vodafone_cash');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [registrationNotes, setRegistrationNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4 Completed Confirmation State
  const [completedResult, setCompletedResult] = useState<{
    reference: string;
    registrations: EventRegistration[];
    whatsappUrl: string | null;
    contactName: string | null;
    contactPhone: string | null;
  } | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => {
    const refreshEvent = () => {
      const found = getEventById(eventId);
      setEvent(found || null);
      if (found && found.availablePaymentMethods?.length > 0) {
        setSelectedPaymentMethod((prev) =>
          found.availablePaymentMethods.includes(prev) ? prev : found.availablePaymentMethods[0]
        );
      }
    };
    refreshEvent();
    window.addEventListener('storage_updated', refreshEvent);
    return () => window.removeEventListener('storage_updated', refreshEvent);
  }, [eventId]);

  useEffect(() => {
    if (initialMember) {
      setPrimaryMember(initialMember);
    }
  }, [initialMember]);

  // Compute servants matching the currently selected payment method
  const matchingContacts: EventPaymentContact[] = useMemo(() => {
    if (!event) return [];
    return getContactsForPaymentMethod(event, selectedPaymentMethod);
  }, [event, selectedPaymentMethod]);

  // Auto-select servant if only 1 servant handles this payment method, or ensure valid selection when multiple share it
  useEffect(() => {
    if (matchingContacts.length === 1) {
      setSelectedContactId(matchingContacts[0].id);
    } else if (matchingContacts.length > 1) {
      if (!matchingContacts.some((c) => c.id === selectedContactId)) {
        setSelectedContactId(matchingContacts[0].id);
      }
    } else {
      setSelectedContactId('');
    }
  }, [matchingContacts, selectedContactId]);

  const activeSelectedContact: EventPaymentContact | undefined = useMemo(() => {
    if (matchingContacts.length === 0) return undefined;
    return matchingContacts.find((c) => c.id === selectedContactId) || matchingContacts[0];
  }, [matchingContacts, selectedContactId]);

  // Search results for Step 1 (Primary Member)
  const primarySearchResults = useMemo(() => {
    const q = memberSearchQuery.trim();
    if (q.length < 2) return [];
    return searchExistingMembers(q, 8);
  }, [memberSearchQuery]);

  // Search results for Step 2 (Adding Companions in Group Registration)
  const companionSearchResults = useMemo(() => {
    const q = companionSearchQuery.trim();
    if (q.length < 2) return [];
    return searchExistingMembers(q, 6).filter(
      (m) =>
        m.id !== primaryMember?.id && !companionMembers.some((comp) => comp.id === m.id)
    );
  }, [companionSearchQuery, primaryMember, companionMembers]);

  // Check if primaryMember is already registered in this event
  const existingPrimaryRegistration = useMemo(() => {
    if (!event || !primaryMember) return undefined;
    return getMemberActiveEventRegistration(event.id, primaryMember.id);
  }, [event, primaryMember]);

  const allSelectedMembers = useMemo(() => {
    if (!primaryMember) return [];
    return [primaryMember, ...companionMembers];
  }, [primaryMember, companionMembers]);

  const totalRequiredAmount = useMemo(() => {
    if (!event) return 0;
    return allSelectedMembers.length * event.basePrice;
  }, [event, allSelectedMembers]);

  const handleSelectPrimaryMember = (member: Registrant) => {
    setPrimaryMember(member);
    setMemberSearchQuery('');
    setSubmitError(null);
  };

  const handleAddCompanion = (member: Registrant) => {
    if (!event) return;
    setCompanionError(null);

    const existing = getMemberActiveEventRegistration(event.id, member.id);
    if (existing) {
      setCompanionError(
        `العضو «${member.fullName}» مسجل بالفعل في هذه الفعالية برقم حجز (${existing.registrationReference}).`
      );
      return;
    }

    if (companionMembers.some((c) => c.id === member.id) || primaryMember?.id === member.id) {
      setCompanionError('هذا العضو مضاف بالفعل في قائمة التسجيل الحالية.');
      return;
    }

    setCompanionMembers((prev) => [...prev, member]);
    setCompanionSearchQuery('');
  };

  const handleRemoveCompanion = (memberId: string) => {
    setCompanionMembers((prev) => prev.filter((c) => c.id !== memberId));
  };

  const handleGoToSiteRegistration = () => {
    try {
      sessionStorage.setItem(PENDING_EVENT_REGISTRATION_KEY, eventId);
    } catch {}
    onRedirectToSiteRegistration(eventId);
  };

  const handleConfirmRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !primaryMember) return;
    setSubmitError(null);

    if (matchingContacts.length > 1 && !activeSelectedContact) {
      setSubmitError('يرجى اختيار الخادم الذي تود التواصل معه لتأكيد الدفع.');
      return;
    }

    const memberIds = allSelectedMembers.map((m) => m.id);
    const result = registerMembersInEvent({
      eventId: event.id,
      memberIds,
      primaryMemberId: primaryMember.id,
      paymentMethod: selectedPaymentMethod,
      selectedContactId: activeSelectedContact?.id,
      assignedServantId: activeSelectedContact?.servantId,
      notes: registrationNotes.trim() || undefined,
      registeredBy: 'self',
      actor: { id: primaryMember.id, name: primaryMember.fullName },
      isPublicRegistration: true,
    });

    if (!result.success || result.registrations.length === 0) {
      setSubmitError(result.error || 'تعذر إتمام التسجيل. يرجى المحاولة مرة أخرى.');
      return;
    }

    const reference =
      result.group?.registrationReference || result.registrations[0].registrationReference;

    const waInfo = buildEventWhatsAppConfirmationUrl({
      event,
      primaryMember,
      members: allSelectedMembers,
      paymentMethod: selectedPaymentMethod,
      registrationReference: reference,
      selectedContact: activeSelectedContact || result.selectedWhatsappContact,
    });

    try {
      sessionStorage.removeItem(PENDING_EVENT_REGISTRATION_KEY);
    } catch {}

    setCompletedResult({
      reference,
      registrations: result.registrations,
      whatsappUrl: waInfo?.url || null,
      contactName: waInfo?.contact.name || null,
      contactPhone: waInfo?.contact.phone || null,
    });
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold">الفعالية غير موجودة أو انتهى التسجيل</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            تأكد من صحة رابط التسجيل المرسل إليك من خدام اجتماع الثلاثة فتية للشباب السوداني.
          </p>
          <button
            onClick={onBackToHome}
            className="w-full py-3 rounded-xl bg-sky-500 text-slate-950 font-bold text-sm hover:bg-sky-400 transition"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  const availability = evaluateEventRegistrationAvailability(event);
  const isRegistrationClosed = !availability.canRegisterPublicly;

  return (
    <div className="min-h-screen bg-slate-950 text-white py-8 px-4 sm:px-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 transition"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لبوابة اجتماع الثلاثة فتية</span>
          </button>

          <span className="px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold">
            بوابة التسجيل في الفعاليات والرحلات
          </span>
        </div>

        {/* Event Hero Banner Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="relative h-52 sm:h-64 bg-slate-950">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-950 via-slate-900 to-indigo-950 flex items-center justify-center">
                <Tent className="w-16 h-16 text-sky-400/40" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-bold backdrop-blur-md">
                {EVENT_TYPE_LABELS[event.type].label}
              </span>
            </div>

            <div className="absolute bottom-4 right-5 left-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{event.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 mt-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    {event.startDate}
                    {event.endDate && event.endDate !== event.startDate
                      ? ` إلى ${event.endDate}`
                      : ''}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-rose-400" />
                      {event.location}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-4 py-2 rounded-2xl bg-emerald-500 text-slate-950 font-mono font-extrabold text-sm shrink-0 shadow-lg">
                اشتراك الفرد: {event.basePrice} {event.currency}
              </div>
            </div>
          </div>

          {event.description && (
            <div className="p-5 border-t border-slate-800/80 text-xs sm:text-sm text-slate-300 leading-relaxed">
              {event.description}
            </div>
          )}
        </div>

        {/* If Completed Registration -> Show Confirmation Receipt & WhatsApp Button */}
        {completedResult ? (
          <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                تم تسجيل حجزك بنجاح في النظام (بانتظار تأكيد الدفع)
              </span>
              <h2 className="text-2xl font-extrabold text-white">
                مبارك! تم تسجيلك في «{event.name}»
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
                يرجى الاحتفاظ برقم الحجز المرجعي التالي، والضغط على زر التواصل عبر واتساب لإرسال تأكيد الدفع للخادم المختار.
              </p>
            </div>

            {/* Reference Box */}
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">رقم الحجز المرجعي (Reference)</span>
                <span className="text-lg font-mono font-extrabold text-sky-400">
                  {completedResult.reference}
                </span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(completedResult.reference);
                  setCopiedRef(true);
                  setTimeout(() => setCopiedRef(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5"
              >
                {copiedRef ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>نسخ الرقم</span>
                  </>
                )}
              </button>
            </div>

            {/* Summary Details */}
            <div className="max-w-md mx-auto bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-right space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">عدد الأفراد المسجلين:</span>
                <span className="font-bold text-white">{allSelectedMembers.length} فرد</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الأسماء:</span>
                <span className="font-bold text-sky-300">
                  {allSelectedMembers.map((m) => m.fullName).join(' ، ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">إجمالي المبلغ المطلوب:</span>
                <span className="font-mono font-extrabold text-emerald-400">
                  {totalRequiredAmount} {event.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">طريقة الدفع المختارة:</span>
                <span className="font-bold text-white">
                  {PAYMENT_METHOD_LABELS[selectedPaymentMethod].label}
                </span>
              </div>
              {completedResult.contactName && (
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">الخادم المسؤول عن استلام الدفع:</span>
                  <span className="font-bold text-emerald-300">
                    {completedResult.contactName} ({completedResult.contactPhone})
                  </span>
                </div>
              )}
            </div>

            {/* WhatsApp Direct Confirmation Button */}
            {completedResult.whatsappUrl && (
              <div className="space-y-2 pt-2">
                <a
                  href={completedResult.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 w-full max-w-md py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition shadow-xl shadow-emerald-500/25"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>
                    إرسال رسالة تأكيد الحجز للخادم ({completedResult.contactName}) عبر واتساب
                  </span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                <p className="text-[11px] text-slate-400">
                  سيتم فتح محادثة واتساب جاهزة تحتوي على أسمائكم ورقم الحجز والمبلغ المطلوب.
                </p>
              </div>
            )}
          </div>
        ) : isRegistrationClosed ? (
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-8 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="text-xl font-black text-amber-300">{availability.arabicLabel}</h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
              {availability.arabicMessage}
            </p>
            <p className="text-xs text-slate-400">
              يرجى التواصل مع خدام الاجتماع في حال الرغبة في الاستفسار.
            </p>
          </div>
        ) : (
          /* Active Multi-Step Registration Form */
          <div className="space-y-6">
            {/* STEP 1: Verify Existing Membership in المخدومين والرتب */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-sky-500 text-slate-950 font-extrabold text-xs flex items-center justify-center">
                    1
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      الخطوة الأولى: التحقق من عضويتك في الاجتماع
                    </h3>
                    <p className="text-xs text-slate-400">
                      ابحث باسمك الثلاثي أو رقم هاتفك أو كود العضوية للربط المباشر ببياناتك وباركود الـ QR الخاص بك.
                    </p>
                  </div>
                </div>
                {primaryMember && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrimaryMember(null);
                      setCompanionMembers([]);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400 font-bold"
                  >
                    تغيير الحساب
                  </button>
                )}
              </div>

              {!primaryMember ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => {
                        setMemberSearchQuery(e.target.value);
                        setHasSearchedPrimary(true);
                      }}
                      placeholder="اكتب اسمك هنا (مثال: أبانوب / مينا / مريم) أو رقم هاتفك..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-2xl pr-10 pl-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Search Results List */}
                  {memberSearchQuery.trim().length >= 2 && (
                    <div className="space-y-2">
                      {primarySearchResults.length > 0 ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden">
                          {primarySearchResults.map((m) => (
                            <div
                              key={m.id}
                              onClick={() => handleSelectPrimaryMember(m)}
                              className="p-3.5 hover:bg-slate-900 cursor-pointer flex items-center justify-between gap-3 transition"
                            >
                              <div className="flex items-center gap-3">
                                {m.photoUrl ? (
                                  <img
                                    src={m.photoUrl}
                                    alt={m.fullName}
                                    className="w-10 h-10 rounded-full object-cover border border-slate-700"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-sky-400">
                                    {m.fullName.charAt(0)}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-bold text-white">{m.fullName}</p>
                                  <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                                    هاتف: {maskPhoneForPublic(m.phone)} • كود: #{m.uniqueCode}
                                  </p>
                                </div>
                              </div>
                              <span className="px-3 py-1.5 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-bold">
                                هذا أنا ✓
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        hasSearchedPrimary && (
                          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 text-center">
                            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                            <div className="space-y-1">
                              <h4 className="text-sm font-extrabold text-amber-300">
                                أنت غير مسجل كعضو في الموقع. يرجى التسجيل أولاً.
                              </h4>
                              <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                                لكي تتمكن من التسجيل في الرحلات والمؤتمرات واستخدام باركود الحضور، يجب أولاً تسجيل بياناتك كعضو في سجل «المخدومين والرتب»، ثم ستعود تلقائياً لهذه الصفحة لإكمال حجزك.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleGoToSiteRegistration}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition shadow-lg"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>التسجيل كعضو جديد في الاجتماع ثم العودة للفعالية تلقائياً</span>
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Direct Link for New Members */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>لم تسجل بياناتك في موقع اجتماع الثلاثة فتية من قبل؟</span>
                    <button
                      type="button"
                      onClick={handleGoToSiteRegistration}
                      className="text-sky-400 hover:text-sky-300 font-bold underline"
                    >
                      سجل كعضو جديد أولاً من هنا
                    </button>
                  </div>
                </div>
              ) : (
                /* Verified Primary Member Banner */
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {primaryMember.photoUrl ? (
                      <img
                        src={primaryMember.photoUrl}
                        alt={primaryMember.fullName}
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500/50"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-lg font-extrabold text-emerald-300">
                        {primaryMember.fullName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <UserCheck className="w-4 h-4" />
                        مرحباً {primaryMember.fullName}، تم العثور على حسابك بنجاح!
                      </span>
                      <p className="text-xs text-slate-300 font-mono mt-0.5" dir="ltr">
                        {maskPhoneForPublic(primaryMember.phone)} • QR Code: #{primaryMember.uniqueCode}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Duplicate Registration Alert if already registered */}
              {existingPrimaryRegistration && (
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>أنت مسجل بالفعل في هذه الفعالية!</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    رقم حجزك الحالي هو{' '}
                    <strong className="font-mono text-sky-300">
                      {existingPrimaryRegistration.registrationReference}
                    </strong>{' '}
                    • حالة الدفع:{' '}
                    <strong>
                      مدفوع {existingPrimaryRegistration.totalPaidAmount} من{' '}
                      {existingPrimaryRegistration.finalRequiredAmount} {event.currency}
                    </strong>
                    . لا يمكن تكرار التسجيل لنفس العضو مرتين في نفس الفعالية.
                  </p>
                </div>
              )}
            </div>

            {/* STEP 2 & 3: Only visible once primaryMember is verified and not already registered */}
            {primaryMember && !existingPrimaryRegistration && (
              <form onSubmit={handleConfirmRegistration} className="space-y-6">
                {/* STEP 2: Individual or Group Registration */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-sky-500 text-slate-950 font-extrabold text-xs flex items-center justify-center">
                        2
                      </span>
                      <div>
                        <h3 className="text-base font-extrabold text-white">
                          الخطوة الثانية: نوع الحجز (فردي أو مجموعة)
                        </h3>
                        <p className="text-xs text-slate-400">
                          يمكنك التسجيل لنفسك فقط أو إضافة أصدقائك/إخوتك المسجلين في الاجتماع في حجز جماعي واحد.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsGroupMode(false);
                        setCompanionMembers([]);
                      }}
                      className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                        !isGroupMode
                          ? 'bg-sky-500/15 border-sky-500 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>تسجيل فردي (أنا فقط)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsGroupMode(true)}
                      className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                        isGroupMode
                          ? 'bg-indigo-500/15 border-indigo-500 text-indigo-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>تسجيل جماعي (+ إضافة أشخاص معي)</span>
                    </button>
                  </div>

                  {isGroupMode && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          + إضافة شخص آخر (ابحث بالاسم في سجل أعضاء الاجتماع)
                        </label>
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={companionSearchQuery}
                            onChange={(e) => setCompanionSearchQuery(e.target.value)}
                            placeholder="ابحث باسم العضو المرافق لإضافته للمجموعة..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-3 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>

                      {companionError && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          {companionError}
                        </div>
                      )}

                      {companionSearchQuery.trim().length >= 2 && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
                          {companionSearchResults.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              لا يوجد عضو مطابق بهذا الاسم أو أنه غير مسجل في الموقع. يجب أن يكون كل مرافق عضواً مسجلاً في الاجتماع.
                            </div>
                          ) : (
                            companionSearchResults.map((m) => (
                              <div
                                key={m.id}
                                onClick={() => handleAddCompanion(m)}
                                className="p-3 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                              >
                                <div>
                                  <span className="font-bold text-white">{m.fullName}</span>
                                  <span className="text-slate-400 font-mono mr-2" dir="ltr">
                                    ({maskPhoneForPublic(m.phone)} • #{m.uniqueCode})
                                  </span>
                                </div>
                                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold">
                                  + إضافة للمجموعة
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* List of All Members in Group */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-400 block">
                          قائمة الأشخاص المشمولين في هذا الحجز ({allSelectedMembers.length}):
                        </span>
                        {allSelectedMembers.map((m, idx) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono flex items-center justify-center text-[10px]">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-white">{m.fullName}</span>
                              {idx === 0 && (
                                <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px]">
                                  أنا (صاحب الحجز الأساسي)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-emerald-400 font-bold">
                                {event.basePrice} {event.currency}
                              </span>
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCompanion(m.id)}
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP 3: Price Calculation, Payment Method Selection & Dynamic Servant Routing */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-sky-500 text-slate-950 font-extrabold text-xs flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-white">
                        الخطوة الثالثة: حساب التكلفة واختيار طريقة الدفع والخادم المختص
                      </h3>
                      <p className="text-xs text-slate-400">
                        اختر وسيلة السداد المناسبة لك ليتم توجيهك لواتساب الخادم المختص باستلام هذه الطريقة.
                      </p>
                    </div>
                  </div>

                  {/* Price Calculation Box */}
                  <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                    <div>
                      <span className="text-[11px] text-slate-400 block">عدد الأفراد</span>
                      <span className="text-lg font-mono font-extrabold text-white mt-0.5 block">
                        {allSelectedMembers.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">اشتراك الفرد</span>
                      <span className="text-lg font-mono font-extrabold text-sky-400 mt-0.5 block">
                        {event.basePrice} {event.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-emerald-300 block">الإجمالي المطلوب</span>
                      <span className="text-lg font-mono font-extrabold text-emerald-400 mt-0.5 block">
                        {totalRequiredAmount} {event.currency}
                      </span>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">
                      اختر طريقة الدفع المفضلة *
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(event.availablePaymentMethods?.length
                        ? event.availablePaymentMethods
                        : (['vodafone_cash', 'instapay', 'cash'] as PaymentMethodType[])
                      ).map((method) => (
                        <button
                          type="button"
                          key={method}
                          onClick={() => setSelectedPaymentMethod(method)}
                          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                            selectedPaymentMethod === method
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>{PAYMENT_METHOD_LABELS[method].label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Servant Selection Based on Payment Method:
                      - If MULTIPLE servants share this payment method -> show interactive selector so the member chooses which servant to contact.
                      - If ONLY ONE servant handles this payment method -> show only that servant automatically. */}
                  {matchingContacts.length > 1 && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-sky-500/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-sky-300 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-sky-400" />
                          <span>
                            اختر الخادم الذي تود التواصل معه لتأكيد الدفع عبر (
                            {PAYMENT_METHOD_LABELS[selectedPaymentMethod].label}):
                          </span>
                        </label>
                        <span className="text-[11px] text-slate-400">
                          متاح {matchingContacts.length} خدام لهذه الطريقة
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {matchingContacts.map((contact) => {
                          const isSelected = activeSelectedContact?.id === contact.id;
                          return (
                            <button
                              type="button"
                              key={contact.id}
                              onClick={() => setSelectedContactId(contact.id)}
                              className={`p-3.5 rounded-2xl border text-right flex items-center justify-between gap-3 transition ${
                                isSelected
                                  ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {contact.photoUrl ? (
                                  <img
                                    src={contact.photoUrl}
                                    alt={contact.name}
                                    className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold flex items-center justify-center text-sm shrink-0">
                                    {contact.name.charAt(0)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-white truncate">
                                    {contact.name}
                                  </div>
                                  <div
                                    className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-0.5"
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{contact.phone}</span>
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isSelected ? 'تم الاختيار ✓' : 'اختيار'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {matchingContacts.length === 1 && activeSelectedContact && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {activeSelectedContact.photoUrl ? (
                          <img
                            src={activeSelectedContact.photoUrl}
                            alt={activeSelectedContact.name}
                            className="w-11 h-11 rounded-full object-cover border border-emerald-500/40"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold flex items-center justify-center">
                            {activeSelectedContact.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="text-[11px] text-emerald-300 font-bold block">
                            الخادم المختص باستلام ({PAYMENT_METHOD_LABELS[selectedPaymentMethod].label}):
                          </span>
                          <span className="text-sm font-extrabold text-white block">
                            {activeSelectedContact.name}
                          </span>
                          <span className="text-xs font-mono text-emerald-400" dir="ltr">
                            {activeSelectedContact.phone}
                          </span>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                        توجيه تلقائي ✓
                      </span>
                    </div>
                  )}

                  {/* Payment Instructions Box */}
                  {event.paymentInstructions && (
                    <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-sky-200 leading-relaxed">
                      <strong className="block text-sky-400 mb-1">تعليمات الدفع والتحويل:</strong>
                      {event.paymentInstructions}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      ملاحظات إضافية للخادم (اختياري)
                    </label>
                    <input
                      type="text"
                      value={registrationNotes}
                      onChange={(e) => setRegistrationNotes(e.target.value)}
                      placeholder="مثال: نرغب في التسكين معاً في نفس الباص..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {submitError && (
                    <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold">
                      {submitError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2.5 transition shadow-xl shadow-emerald-500/20"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>
                      تأكيد التسجيل والتواصل مع الخادم
                      {activeSelectedContact ? ` (${activeSelectedContact.name})` : ''}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
