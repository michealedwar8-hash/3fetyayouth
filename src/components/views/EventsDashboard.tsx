import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CommunityEvent,
  EventType,
  EventStatus,
  PaymentMethodType,
  EventPaymentContact,
  Registrant,
  ROLE_LABELS,
} from '../../types';
import {
  getAccessibleEventsForUser,
  getUserEventPermissions,
  isUserSuperAdminForEvents,
  getAvailableServantsFromMakhdomeen,
  getEventStaffAssignments,
  saveEvent,
  deleteEvent,
  archiveEvent,
  getEnrichedEventRegistrations,
  getEventBuses,
  getEventPayments,
  getEventAuditLogs,
  calculateEventKPIs,
  getPublicEventRegistrationUrl,
  evaluateEventRegistrationAvailability,
  isEventVisibleToMembers,
  EVENT_TYPE_LABELS,
  EVENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  EVENT_STAFF_ROLE_LABELS,
} from '../../services/eventsService';
import { storageService } from '../../services/storageService';
import { EventRegistrationsTab } from './events/EventRegistrationsTab';
import { EventPaymentsTab } from './events/EventPaymentsTab';
import { EventBusesTab } from './events/EventBusesTab';
import { EventAttendanceTab } from './events/EventAttendanceTab';
import { EventReportsAndAuditTab } from './events/EventReportsAndAuditTab';
import { EventStaffTab } from './events/EventStaffTab';
import {
  Tent,
  Plus,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Bus,
  QrCode,
  FileBarChart2,
  Edit2,
  Trash2,
  Share2,
  Copy,
  Check,
  ArrowRight,
  Phone,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
  X,
  UserCheck,
  Search,
  Sparkles,
  Archive,
  RotateCcw,
} from 'lucide-react';

interface EventsDashboardProps {
  currentUser: Registrant;
}

type WorkspaceTab = 'registrations' | 'payments' | 'buses' | 'attendance' | 'staff' | 'reports';

const STATUS_BADGE_STYLES: Record<EventStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  registration_open: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  registration_closed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  completed: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  cancelled: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  archived: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

const TYPE_BADGE_STYLES: Record<EventType, string> = {
  trip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  spiritual_day: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  conference: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  retreat: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  other: 'bg-slate-800 text-slate-300 border-slate-700',
};

const ALL_PAYMENT_METHODS: PaymentMethodType[] = [
  'vodafone_cash',
  'instapay',
  'bank_transfer',
  'cash',
  'other',
];

export const EventsDashboard: React.FC<EventsDashboardProps> = ({ currentUser }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('registrations');
  const [focusRegistrationId, setFocusRegistrationId] = useState<string | null>(null);

  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<EventType | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<EventStatus | 'ALL'>('ALL');
  const [viewArchiveMode, setViewArchiveMode] = useState<'active' | 'archived'>('active');

  // Create / Edit Event Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<CommunityEvent | null>(null);

  // Servant picker search inside Create/Edit Event Modal for WhatsApp Payment Contacts
  const [contactServantSearch, setContactServantSearch] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<EventType>('trip');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('22:00');
  const [isVisibleToMembers, setIsVisibleToMembers] = useState(true);
  const [autoHideOnExpiry, setAutoHideOnExpiry] = useState(true);
  const [location, setLocation] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [capacityType, setCapacityType] = useState<'limited' | 'unlimited'>('limited');
  const [maxCapacity, setMaxCapacity] = useState<number>(100);
  const [basePrice, setBasePrice] = useState<number>(250);
  const [currency, setCurrency] = useState('EGP');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethodType[]>([
    'vodafone_cash',
    'instapay',
    'cash',
  ]);
  const [whatsappContacts, setWhatsappContacts] = useState<EventPaymentContact[]>([]);
  const [allowOverPayment, setAllowOverPayment] = useState(false);
  const [status, setStatus] = useState<EventStatus>('registration_open');

  const isSuperAdmin = useMemo(
    () => isUserSuperAdminForEvents(currentUser, currentUser.role),
    [currentUser]
  );

  const triggerRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const handler = () => setRefreshTick((t) => t + 1);
    window.addEventListener('storage_updated', handler);
    return () => window.removeEventListener('storage_updated', handler);
  }, []);

  // Only show events that the user has access to (All events for Senior Admins, Assigned Events only for Servants)
  const events = useMemo(
    () => getAccessibleEventsForUser(currentUser, currentUser.role),
    [currentUser, refreshTick]
  );

  const activeEventsCount = useMemo(
    () => events.filter((ev) => ev.status !== 'archived' && !ev.isArchived).length,
    [events]
  );

  const archivedEventsCount = useMemo(
    () => events.filter((ev) => ev.status === 'archived' || ev.isArchived).length,
    [events]
  );

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const isEvArchived = ev.status === 'archived' || Boolean(ev.isArchived);
      if (viewArchiveMode === 'archived') {
        if (!isEvArchived) return false;
      } else {
        if (isEvArchived && filterStatus !== 'archived') return false;
      }
      if (filterType !== 'ALL' && ev.type !== filterType) return false;
      if (filterStatus !== 'ALL' && ev.status !== filterStatus) return false;
      return true;
    });
  }, [events, filterType, filterStatus, viewArchiveMode]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const selectedEventPerms = useMemo(() => {
    if (!selectedEvent) return null;
    return getUserEventPermissions(selectedEvent.id, currentUser, currentUser.role);
  }, [selectedEvent, currentUser, refreshTick]);

  // Ensure activeTab is always allowed for the current user's role in the selected event
  useEffect(() => {
    if (!selectedEventPerms) return;
    const allowedTabs: WorkspaceTab[] = [];
    if (selectedEventPerms.canViewRegistrations) allowedTabs.push('registrations');
    if (selectedEventPerms.canDeletePayments && selectedEventPerms.canManagePayments) {
      allowedTabs.push('payments');
    }
    if (selectedEventPerms.canManageBuses) allowedTabs.push('buses');
    if (selectedEventPerms.canScanAttendance) allowedTabs.push('attendance');
    if (selectedEventPerms.canManageStaff) allowedTabs.push('staff');
    if (selectedEventPerms.canViewReports) {
      allowedTabs.push('reports');
    }

    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [selectedEventPerms, activeTab]);

  const selectedEventData = useMemo(() => {
    if (!selectedEvent) return null;
    const allRegistrations = getEnrichedEventRegistrations(selectedEvent.id);
    const buses = getEventBuses(selectedEvent.id);
    const allPayments = getEventPayments(selectedEvent.id);
    const auditLogs = getEventAuditLogs(selectedEvent.id);
    const kpis = calculateEventKPIs(selectedEvent.id);
    const staffAssignments = getEventStaffAssignments(selectedEvent.id);

    // Filter registrations for Registration/Payment Servants who only see members who selected them
    const scopedRegistrations =
      selectedEventPerms?.onlyOwnAssignedRegistrations && !selectedEventPerms?.isSuperAdmin
        ? allRegistrations.filter((r) => {
            const matchesId =
              r.assignedServantId === currentUser.id ||
              r.selectedContactId === currentUser.id ||
              r.selectedContactId === `staff_contact_${currentUser.id}`;
            const matchesName =
              Boolean(currentUser.fullName) &&
              (r.assignedServantName === currentUser.fullName ||
                r.selectedContactName === currentUser.fullName);
            const matchesPhone =
              Boolean(currentUser.phone || currentUser.whatsapp) &&
              (r.assignedServantPhone === (currentUser.whatsapp || currentUser.phone) ||
                r.selectedContactPhone === (currentUser.whatsapp || currentUser.phone));
            return matchesId || matchesName || matchesPhone;
          })
        : allRegistrations;

    const scopedRegIds = new Set(scopedRegistrations.map((r) => r.id));
    const scopedPayments =
      selectedEventPerms?.onlyOwnAssignedRegistrations && !selectedEventPerms?.isSuperAdmin
        ? allPayments.filter((p) => scopedRegIds.has(p.eventRegistrationId))
        : allPayments;

    return {
      allRegistrations,
      registrations: scopedRegistrations,
      buses,
      payments: scopedPayments,
      auditLogs,
      kpis,
      staffAssignments,
    };
  }, [selectedEvent, selectedEventPerms, currentUser, refreshTick]);

  const availableServantsForContacts = useMemo(
    () => getAvailableServantsFromMakhdomeen(contactServantSearch),
    [contactServantSearch, refreshTick]
  );

  const openCreateEventModal = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditingEvent(null);
    setName('');
    setType('trip');
    setDescription('');
    setImageUrl('');
    setStartDate(today);
    setEndDate(today);
    setStartTime('08:00');
    setEndTime('22:00');
    setIsVisibleToMembers(true);
    setAutoHideOnExpiry(true);
    setLocation('');
    setRegistrationDeadline(today);
    setCapacityType('limited');
    setMaxCapacity(100);
    setBasePrice(300);
    setCurrency('EGP');
    setPaymentInstructions(
      'يرجى تحويل الاشتراك على رقم فودافون كاش أو إنستا باي الموضح وإرسال صورة التحويل على واتساب الخادم المسؤول لتأكيد مقعدك في الباص.'
    );
    setAvailablePaymentMethods(['vodafone_cash', 'instapay', 'cash']);
    setWhatsappContacts([
      {
        id: `contact_${Date.now()}`,
        servantId: currentUser.id,
        name: currentUser.fullName || 'مسؤول اشتراكات الرحلات',
        phone: currentUser.whatsapp || currentUser.phone || '',
        photoUrl: currentUser.photoUrl,
        roleTitle: ROLE_LABELS[currentUser.role] || 'مسؤول تأكيد الحجز والاشتراكات',
        paymentMethods: ['vodafone_cash', 'instapay', 'cash'],
        paymentMethod: 'all',
      },
    ]);
    setContactServantSearch('');
    setAllowOverPayment(false);
    setStatus('registration_open');
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (ev: CommunityEvent) => {
    setEditingEvent(ev);
    setName(ev.name);
    setType(ev.type);
    setDescription(ev.description);
    setImageUrl(ev.imageUrl || '');
    setStartDate(ev.startDate);
    setEndDate(ev.endDate);
    setStartTime(ev.startTime || '08:00');
    setEndTime(ev.endTime || '22:00');
    setIsVisibleToMembers(ev.isVisibleToMembers !== false);
    setAutoHideOnExpiry(ev.autoHideOnExpiry !== false);
    setLocation(ev.location);
    setRegistrationDeadline(ev.registrationDeadline);
    const isUnlim = ev.capacityType === 'unlimited' || Number(ev.maxCapacity || 0) <= 0;
    setCapacityType(isUnlim ? 'unlimited' : 'limited');
    setMaxCapacity(isUnlim ? 0 : ev.maxCapacity);
    setBasePrice(ev.basePrice);
    setCurrency(ev.currency || 'EGP');
    setPaymentInstructions(ev.paymentInstructions || '');
    const methods = ev.availablePaymentMethods?.length
      ? ev.availablePaymentMethods
      : (['vodafone_cash', 'cash'] as PaymentMethodType[]);
    setAvailablePaymentMethods(methods);
    // Normalize existing contacts so paymentMethods array is always populated
    const normalizedContacts = (ev.whatsappContacts || []).map((c) => {
      if (Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0) {
        return c;
      }
      if (c.paymentMethod && c.paymentMethod !== 'all') {
        return { ...c, paymentMethods: [c.paymentMethod as PaymentMethodType] };
      }
      return { ...c, paymentMethods: [...methods] };
    });
    setWhatsappContacts(normalizedContacts);
    setContactServantSearch('');
    setAllowOverPayment(Boolean(ev.allowOverPayment));
    setStatus(ev.status);
    setIsEventModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePaymentMethod = (method: PaymentMethodType) => {
    setAvailablePaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  /**
   * When the admin selects a Servant from the «المخدومين والرتب» list,
   * automatically add them (with their fullName, phone, photoUrl, servantId, and default payment methods) immediately!
   */
  const handleAddServantAsWhatsappContact = (servant: Registrant) => {
    const existing = whatsappContacts.find(
      (c) => c.servantId === servant.id || (c.name === servant.fullName && c.phone === (servant.whatsapp || servant.phone))
    );
    if (existing) return;

    const autoPhone = servant.whatsapp || servant.phone || '';
    const defaultMethods: PaymentMethodType[] =
      availablePaymentMethods.length > 0 ? [...availablePaymentMethods] : ['vodafone_cash', 'cash'];

    setWhatsappContacts((prev) => [
      ...prev,
      {
        id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        servantId: servant.id,
        name: servant.fullName,
        phone: autoPhone,
        photoUrl: servant.photoUrl,
        roleTitle: ROLE_LABELS[servant.role] || 'خادم مسؤول',
        paymentMethods: defaultMethods,
        paymentMethod: 'all',
      },
    ]);
  };

  const handleSelectServantForExistingContactRow = (contactId: string, servantId: string) => {
    const servant = availableServantsForContacts.find((s) => s.id === servantId) ||
      storageService.getRegistrants().find((s) => s.id === servantId);
    if (!servant) return;

    const autoPhone = servant.whatsapp || servant.phone || '';
    setWhatsappContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? {
              ...c,
              servantId: servant.id,
              name: servant.fullName,
              phone: autoPhone,
              photoUrl: servant.photoUrl,
              roleTitle: ROLE_LABELS[servant.role] || 'خادم مسؤول',
            }
          : c
      )
    );
  };

  const toggleContactPaymentMethod = (contactId: string, method: PaymentMethodType) => {
    setWhatsappContacts((prev) =>
      prev.map((c) => {
        if (c.id !== contactId) return c;
        const currentMethods = Array.isArray(c.paymentMethods) ? c.paymentMethods : [];
        const nextMethods = currentMethods.includes(method)
          ? currentMethods.filter((m) => m !== method)
          : [...currentMethods, method];
        return {
          ...c,
          paymentMethods: nextMethods,
          paymentMethod: nextMethods.length === 1 ? nextMethods[0] : 'all',
        };
      })
    );
  };

  const updateWhatsappContactPhone = (contactId: string, newPhone: string) => {
    setWhatsappContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, phone: newPhone } : c))
    );
  };

  const removeWhatsappContactRow = (id: string) => {
    setWhatsappContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveEvent = (e: React.FormEvent, goToStaffAfterSave = false) => {
    e.preventDefault();
    if (!name.trim()) return;

    const cleanContacts = whatsappContacts
      .filter((c) => c.name.trim() && c.phone.trim())
      .map((c) => ({
        ...c,
        paymentMethods:
          Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0
            ? c.paymentMethods
            : availablePaymentMethods,
      }));

    const isCreatingNew = !editingEvent;
    const saved = saveEvent(
      {
        id: editingEvent?.id,
        name: name.trim(),
        type,
        description: description.trim(),
        imageUrl: imageUrl.trim() || undefined,
        startDate,
        endDate: endDate || startDate,
        startTime: startTime || '08:00',
        endTime: endTime || '22:00',
        isVisibleToMembers,
        autoHideOnExpiry,
        location: location.trim(),
        registrationDeadline: registrationDeadline || startDate,
        capacityType,
        maxCapacity: capacityType === 'unlimited' ? 0 : Math.max(1, Number(maxCapacity) || 100),
        basePrice: Math.max(0, Number(basePrice) || 0),
        currency: currency || 'EGP',
        paymentInstructions: paymentInstructions.trim(),
        availablePaymentMethods:
          availablePaymentMethods.length > 0 ? availablePaymentMethods : ['cash'],
        whatsappContacts: cleanContacts,
        allowOverPayment,
        status,
      },
      { id: currentUser.id, name: currentUser.fullName }
    );

    setIsEventModalOpen(false);
    triggerRefresh();
    setSelectedEventId(saved.id);
    if (goToStaffAfterSave || isCreatingNew) {
      setActiveTab('staff');
    }
  };

  const handleToggleEventOpenClosed = (ev: CommunityEvent) => {
    const nextStatus: EventStatus =
      ev.status === 'registration_open' ? 'registration_closed' : 'registration_open';
    saveEvent(
      {
        ...ev,
        status: nextStatus,
      },
      { id: currentUser.id, name: currentUser.fullName }
    );
    triggerRefresh();
  };

  const handleToggleEventVisibility = (ev: CommunityEvent) => {
    const nextVisible = ev.isVisibleToMembers === false ? true : false;
    saveEvent(
      {
        ...ev,
        isVisibleToMembers: nextVisible,
      },
      { id: currentUser.id, name: currentUser.fullName }
    );
    triggerRefresh();
  };

  const handleToggleArchiveEvent = (ev: CommunityEvent) => {
    const isCurrentlyArchived = ev.status === 'archived' || Boolean(ev.isArchived);
    archiveEvent(ev.id, !isCurrentlyArchived, {
      id: currentUser.id,
      name: currentUser.fullName,
    });
    triggerRefresh();
  };

  const handleConfirmDeleteEvent = () => {
    if (!eventToDelete) return;
    deleteEvent(eventToDelete.id, { id: currentUser.id, name: currentUser.fullName });
    if (selectedEventId === eventToDelete.id) {
      setSelectedEventId(null);
    }
    setEventToDelete(null);
    triggerRefresh();
  };

  const handleCopyLink = (eventId: string) => {
    const url = getPublicEventRegistrationUrl(eventId);
    navigator.clipboard.writeText(url);
    setCopiedEventId(eventId);
    setTimeout(() => setCopiedEventId(null), 2500);
  };

  const allServantsList = useMemo(() => getAvailableServantsFromMakhdomeen(), [refreshTick]);

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Main View Switch: Either Selected Event Workspace OR Events Overview Grid */}
      {selectedEvent && selectedEventData && selectedEventPerms ? (
        <div className="space-y-6">
          {/* Selected Event Header Bar */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <button
                onClick={() => setSelectedEventId(null)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0"
                title="العودة لقائمة الفعاليات"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              {selectedEvent.imageUrl ? (
                <img
                  src={selectedEvent.imageUrl}
                  alt={selectedEvent.name}
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0 hidden sm:block"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-500/30 items-center justify-center text-sky-400 shrink-0 hidden sm:flex">
                  <Tent className="w-8 h-8" />
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      TYPE_BADGE_STYLES[selectedEvent.type]
                    }`}
                  >
                    {EVENT_TYPE_LABELS[selectedEvent.type].label}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      STATUS_BADGE_STYLES[selectedEvent.status]
                    }`}
                  >
                    {EVENT_STATUS_LABELS[selectedEvent.status].label}
                  </span>
                  {selectedEventData.kpis.availability && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      حالة البوابة العامة: {selectedEventData.kpis.availability.labelAr}
                    </span>
                  )}
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    الاشتراك الأساسي: {selectedEvent.basePrice} {selectedEvent.currency}
                  </span>
                  {!selectedEventPerms.isSuperAdmin && (
                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                      مهامك المكلف بها:{' '}
                      {selectedEventPerms.assignedRoles
                        .map((r) => EVENT_STAFF_ROLE_LABELS[r]?.label || r)
                        .join(' + ')}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-extrabold text-white mt-1">{selectedEvent.name}</h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    {selectedEvent.startDate}
                    {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate
                      ? ` إلى ${selectedEvent.endDate}`
                      : ''}
                  </span>
                  {selectedEvent.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      {selectedEvent.location}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Event Workspace Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedEventPerms.canManageEventSettings && (
                <>
                  <button
                    onClick={() => handleToggleEventVisibility(selectedEvent)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedEvent.isVisibleToMembers === false
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    <span>
                      {selectedEvent.isVisibleToMembers === false
                        ? '👁️ إظهار في صفحة المخدومين'
                        : '🚫 إخفاء من صفحة المخدومين'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleToggleEventOpenClosed(selectedEvent)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedEvent.status === 'registration_open'
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    <span>
                      {selectedEvent.status === 'registration_open'
                        ? 'إغلاق التسجيل مؤقتاً'
                        : 'إعادة فتح التسجيل'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleToggleArchiveEvent(selectedEvent)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedEvent.status === 'archived' || selectedEvent.isArchived
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                        : 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-500/30'
                    }`}
                  >
                    {selectedEvent.status === 'archived' || selectedEvent.isArchived ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>استعادة من الأرشيف ♻️</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>أرشفة الفعالية (مع حفظ البيانات) 📦</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {(selectedEventPerms.canViewRegistrations || selectedEventPerms.isSuperAdmin) && (
                <button
                  onClick={() => handleCopyLink(selectedEvent.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold transition"
                >
                  {copiedEventId === selectedEvent.id ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">تم نسخ رابط التسجيل العام!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>نسخ رابط التسجيل العام</span>
                    </>
                  )}
                </button>
              )}

              {selectedEventPerms.canManageStaff && (
                <button
                  onClick={() => setActiveTab('staff')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>تعيين خدام الفعالية ({selectedEventData.staffAssignments.length})</span>
                </button>
              )}

              {selectedEventPerms.canManageEventSettings && (
                <button
                  onClick={() => openEditEventModal(selectedEvent)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>إعدادات الفعالية</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Summary Cards (Financial KPIs shown only to those with payment/admin access) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">إجمالي المسجلين</span>
              <span className="text-lg font-mono font-extrabold text-white mt-1 block">
                {selectedEventData.kpis.totalRegistered}{' '}
                <span className="text-xs font-normal text-slate-400">
                  /{' '}
                  {selectedEvent.capacityType === 'unlimited' || selectedEvent.maxCapacity <= 0
                    ? 'مفتوح ∞'
                    : selectedEvent.maxCapacity}
                </span>
              </span>
              {selectedEventData.kpis.overrideRegisteredCount > 0 && (
                <span className="block text-[10px] text-rose-400 font-bold mt-0.5">
                  عادي: {selectedEventData.kpis.normalRegisteredCount} | استثنائي: {selectedEventData.kpis.overrideRegisteredCount}
                </span>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
              <span className="text-[11px] text-emerald-300 block">حضر فعلياً (Checked In)</span>
              <span className="text-lg font-mono font-extrabold text-emerald-400 mt-1 block">
                {selectedEventData.kpis.totalCheckedIn}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25">
              <span className="text-[11px] text-amber-300 block">لم يحضر بعد</span>
              <span className="text-lg font-mono font-extrabold text-amber-400 mt-1 block">
                {selectedEventData.kpis.totalNotCheckedIn}
              </span>
            </div>

            {!selectedEventPerms.isBusAttendanceOnly &&
              (selectedEventPerms.canViewPaymentDetails || selectedEventPerms.canViewReports) && (
                <>
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">إجمالي المطلوب</span>
                    <span className="text-base font-mono font-extrabold text-sky-400 mt-1 block">
                      {selectedEventData.kpis.totalRequiredAmount.toLocaleString()}{' '}
                      <span className="text-[10px]">{selectedEvent.currency}</span>
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                    <span className="text-[11px] text-emerald-300 block">إجمالي المحصل</span>
                    <span className="text-base font-mono font-extrabold text-emerald-400 mt-1 block">
                      {selectedEventData.kpis.totalCollectedAmount.toLocaleString()}{' '}
                      <span className="text-[10px]">{selectedEvent.currency}</span>
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                    <span className="text-[11px] text-rose-300 block">المتبقي للتحصيل</span>
                    <span className="text-base font-mono font-extrabold text-rose-400 mt-1 block">
                      {selectedEventData.kpis.totalPendingAmount.toLocaleString()}{' '}
                      <span className="text-[10px]">{selectedEvent.currency}</span>
                    </span>
                  </div>
                </>
              )}

            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">إجمالي سعة الباصات</span>
              <span className="text-lg font-mono font-extrabold text-indigo-400 mt-1 block">
                {selectedEventData.kpis.totalBusCapacity} مقعد
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">المقاعد الشاغرة</span>
              <span className="text-lg font-mono font-extrabold text-teal-400 mt-1 block">
                {selectedEventData.kpis.availableBusSeats} مقعد
              </span>
            </div>
          </div>

          {/* Workspace Module Tabs (Filtered strictly by Event-Specific RBAC) */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-2 rounded-2xl border border-slate-800">
            {selectedEventPerms.canViewRegistrations && (
              <button
                onClick={() => setActiveTab('registrations')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'registrations'
                    ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>التسجيلات والمشاركين ({selectedEventData.registrations.length})</span>
              </button>
            )}

            {selectedEventPerms.canDeletePayments && selectedEventPerms.canManagePayments && (
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'payments'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>تأكيد المدفوعات والدفعات الجزئية</span>
              </button>
            )}

            {selectedEventPerms.canManageBuses && (
              <button
                onClick={() => setActiveTab('buses')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'buses'
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Bus className="w-4 h-4" />
                <span>تنظيم الباصات والتسكين ({selectedEventData.buses.length})</span>
              </button>
            )}

            {selectedEventPerms.canScanAttendance && (
              <button
                onClick={() => setActiveTab('attendance')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'attendance'
                    ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>تحضير الـ QR Code والحضور ({selectedEventData.kpis.totalCheckedIn})</span>
              </button>
            )}

            {selectedEventPerms.canManageStaff && (
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'staff'
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>خدام الفعالية والصلاحيات ({selectedEventData.staffAssignments.length})</span>
              </button>
            )}

            {selectedEventPerms.canViewReports && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'reports'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <FileBarChart2 className="w-4 h-4" />
                <span>تصدير البيانات والتقارير (Excel / PDF)</span>
              </button>
            )}
          </div>

          {/* Active Workspace Tab Content */}
          {activeTab === 'registrations' && selectedEventPerms.canViewRegistrations && (
            <EventRegistrationsTab
              event={selectedEvent}
              registrations={selectedEventData.registrations}
              buses={selectedEventData.buses}
              allMembers={storageService.getRegistrants()}
              actorName={currentUser.fullName || 'المسؤول'}
              canManagePayments={selectedEventPerms.canManagePayments}
              canOverrideLimits={selectedEventPerms.canOverrideRegistrationLimits}
              canCancelRegistrations={selectedEventPerms.canCancelRegistrations}
              onRefresh={triggerRefresh}
              onOpenPaymentForReg={(reg) => {
                setFocusRegistrationId(reg.id);
                setActiveTab('payments');
              }}
            />
          )}

          {activeTab === 'payments' && selectedEventPerms.canManagePayments && (
            <EventPaymentsTab
              event={selectedEvent}
              registrations={selectedEventData.registrations}
              payments={selectedEventData.payments}
              allMembers={storageService.getRegistrants()}
              actorName={currentUser.fullName || 'المسؤول'}
              isSeniorAdmin={selectedEventPerms.canDeletePayments}
              initialSelectedRegId={focusRegistrationId}
              onClearSelectedReg={() => setFocusRegistrationId(null)}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'buses' && selectedEventPerms.canManageBuses && (
            <EventBusesTab
              event={selectedEvent}
              registrations={selectedEventData.allRegistrations}
              buses={selectedEventData.buses}
              attendancesCountByBus={{}}
              currentUser={currentUser}
              canManageEvents={selectedEventPerms.canManageBuses || selectedEventPerms.canCreateOrDeleteBuses}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'attendance' && selectedEventPerms.canScanAttendance && (
            <EventAttendanceTab
              event={selectedEvent}
              registrations={selectedEventData.allRegistrations}
              buses={selectedEventData.buses}
              currentUser={currentUser}
              canScanAttendance={selectedEventPerms.canScanAttendance}
              assignedBusIds={selectedEventPerms.assignedBusIds}
              isBusAttendanceOnly={selectedEventPerms.isBusAttendanceOnly}
              canViewPaymentDetails={selectedEventPerms.canViewPaymentDetails}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'staff' && selectedEventPerms.canManageStaff && (
            <EventStaffTab
              event={selectedEvent}
              currentUser={currentUser}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'reports' &&
            (selectedEventPerms.canViewReports ||
              selectedEventPerms.canViewRegistrations ||
              selectedEventPerms.isBusAttendanceOnly ||
              selectedEventPerms.canScanAttendance) && (
              <EventReportsAndAuditTab
                event={selectedEvent}
                registrations={selectedEventData.allRegistrations}
                buses={selectedEventData.buses}
                payments={selectedEventData.payments}
                auditLogs={selectedEventData.auditLogs}
                currentUser={currentUser}
                userPermissions={selectedEventPerms}
              />
            )}
        </div>
      ) : (
        /* Main Events Overview Dashboard */
        <div className="space-y-6">
          {/* Top Hero Header */}
          <div className="bg-gradient-to-l from-slate-900 via-slate-900/95 to-sky-950/40 border border-slate-800 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isSuperAdmin
                    ? 'نظام إدارة الرحلات والأيام الروحية والمؤتمرات والخلوات'
                    : 'الفعاليات والرحلات المكلف بخدمتها (My Assigned Events)'}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold text-white">
                {isSuperAdmin
                  ? 'داشبورد الفعاليات والرحلات والمؤتمرات'
                  : 'الفعاليات المكلف بتنظيمها أو تحضيرها'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                {isSuperAdmin
                  ? 'إدارة متكاملة مرتبطة مباشرة بقاعدة بيانات «المخدومين والرتب» ونفس الـ QR Code الخاص بكل عضو، مع تعيين صلاحيات الخدام لكل فعالية، وتوجيه واتساب الدفع الذكي.'
                  : 'تظهر لك هنا فقط الرحلات والمؤتمرات التي تم تكليفك بها من أمناء الخدمة، مع الأدوات المخصصة لدورك في كل فعالية.'}
              </p>
            </div>

            {isSuperAdmin && (
              <button
                onClick={openCreateEventModal}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-sm transition shadow-xl shadow-sky-500/20 shrink-0"
              >
                <Plus className="w-5 h-5" />
                <span>إنشاء رحلة / مؤتمر / يوم روحي جديد</span>
              </button>
            )}
          </div>

          {/* Active Events vs Archive Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setViewArchiveMode('active');
                  if (filterStatus === 'archived') setFilterStatus('ALL');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  viewArchiveMode === 'active'
                    ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Tent className="w-4 h-4" />
                <span>الفعاليات والرحلات والمؤتمرات النشطة ({activeEventsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewArchiveMode('archived')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  viewArchiveMode === 'archived'
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-slate-950 text-purple-300 hover:text-white border border-purple-500/30'
                }`}
              >
                <Archive className="w-4 h-4" />
                <span>الأرشيف المحفوظ بالبيانات 📦 ({archivedEventsCount})</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-400">
              {viewArchiveMode === 'archived'
                ? '📦 الفعاليات المؤرشفة مخفية عن المخدومين مع الاحتفاظ الكامل ببيانات المسجلين والمدفوعات والتقارير.'
                : '💡 يمكنك أرشفة أي فعالية بعد انتهائها لحفظ بياناتها، أو حذفها نهائياً لمسح بياناتها.'}
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold ml-1">نوع الفعالية:</span>
              {(['ALL', 'trip', 'spiritual_day', 'conference', 'retreat', 'other'] as const).map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      filterType === t
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {t === 'ALL' ? 'الكل' : EVENT_TYPE_LABELS[t].label}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">الحالة:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as EventStatus | 'ALL')}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">جميع الحالات</option>
                {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {EVENT_STATUS_LABELS[st].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Events Cards Grid */}
          {filteredEvents.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto text-sky-400">
                <Tent className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {isSuperAdmin
                  ? 'لا توجد رحلات أو مؤتمرات مضافة حالياً'
                  : 'لا توجد فعاليات مكلف بها حالياً'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {isSuperAdmin
                  ? 'ابدأ بإنشاء أول رحلة أو يوم روحي أو مؤتمر لتفعيل رابط التسجيل العام للأعضاء وتسكين الباصات وتعيين الخدام المسؤولين.'
                  : 'عند قيام المسؤولين الكبار بتعيينك في أي رحلة أو مؤتمر، ستظهر لك الفعالية هنا فوراً.'}
              </p>
              {isSuperAdmin && (
                <button
                  onClick={openCreateEventModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء فعالية جديدة الآن</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredEvents.map((ev) => {
                const kpis = calculateEventKPIs(ev.id);
                const busesCount = getEventBuses(ev.id).length;
                const staffCount = getEventStaffAssignments(ev.id).length;
                const evPerms = getUserEventPermissions(ev.id, currentUser, currentUser.role);
                const evAvail = evaluateEventRegistrationAvailability(ev);

                return (
                  <div
                    key={ev.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl overflow-hidden flex flex-col justify-between transition shadow-lg"
                  >
                    <div>
                      {/* Card Image Banner */}
                      <div className="relative h-44 bg-slate-950 overflow-hidden">
                        {ev.imageUrl ? (
                          <img
                            src={ev.imageUrl}
                            alt={ev.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-sky-950 via-slate-900 to-indigo-950 flex items-center justify-center">
                            <Tent className="w-14 h-14 text-sky-400/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

                        <div className="absolute top-3 right-3 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md ${
                              TYPE_BADGE_STYLES[ev.type]
                            }`}
                          >
                            {EVENT_TYPE_LABELS[ev.type].label}
                          </span>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md ${
                              STATUS_BADGE_STYLES[ev.status]
                            }`}
                          >
                            {evAvail.labelAr}
                          </span>
                        </div>

                        <div className="absolute bottom-3 right-4 left-4 flex items-end justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-extrabold text-white leading-snug">
                              {ev.name}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                                {ev.startDate}
                              </span>
                              {ev.location && (
                                <span className="flex items-center gap-1 truncate max-w-[160px]">
                                  <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                  {ev.location}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 font-mono font-extrabold text-xs shrink-0">
                            {ev.basePrice} {ev.currency}
                          </span>
                        </div>
                      </div>

                      {/* Event Card KPIs Grid */}
                      <div className="p-4 grid grid-cols-4 gap-2 text-center border-b border-slate-800/80">
                        <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80">
                          <span className="text-[10px] text-slate-400 block">المسجلين</span>
                          <span className="font-mono font-bold text-sm text-white">
                            {kpis.totalRegistered}/
                            {ev.capacityType === 'unlimited' || ev.maxCapacity <= 0
                              ? '∞'
                              : ev.maxCapacity}
                          </span>
                        </div>
                        {!evPerms.isBusAttendanceOnly &&
                        (evPerms.canViewPaymentDetails || evPerms.canViewReports) ? (
                          <>
                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                              <span className="text-[10px] text-emerald-300 block">المحصل</span>
                              <span className="font-mono font-bold text-xs text-emerald-400">
                                {kpis.totalCollectedAmount.toLocaleString()}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                              <span className="text-[10px] text-rose-300 block">المتبقي</span>
                              <span className="font-mono font-bold text-xs text-rose-400">
                                {kpis.totalPendingAmount.toLocaleString()}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                              <span className="text-[10px] text-indigo-300 block">الباصات</span>
                              <span className="font-mono font-bold text-xs text-indigo-400">
                                {busesCount}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                              <span className="text-[10px] text-amber-300 block">لم يحضر</span>
                              <span className="font-mono font-bold text-xs text-amber-400">
                                {kpis.totalNotCheckedIn}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                          <span className="text-[10px] text-sky-300 block">الحضور</span>
                          <span className="font-mono font-bold text-sm text-sky-400">
                            {kpis.totalCheckedIn}
                          </span>
                        </div>
                      </div>

                      {/* Quick Module Jump Buttons (Filtered by Servant's Event Role) */}
                      <div className="p-4 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          {evPerms.canViewRegistrations && (
                            <button
                              onClick={() => {
                                setSelectedEventId(ev.id);
                                setActiveTab('registrations');
                              }}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold transition"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>التسجيلات ({kpis.totalRegistered})</span>
                            </button>
                          )}

                          {evPerms.canManagePayments && (
                            <button
                              onClick={() => {
                                setSelectedEventId(ev.id);
                                setActiveTab('payments');
                              }}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>تأكيد المدفوعات</span>
                            </button>
                          )}

                          {evPerms.canManageBuses && (
                            <button
                              onClick={() => {
                                setSelectedEventId(ev.id);
                                setActiveTab('buses');
                              }}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition"
                            >
                              <Bus className="w-3.5 h-3.5" />
                              <span>تنظيم الباصات ({busesCount})</span>
                            </button>
                          )}

                          {evPerms.canScanAttendance && (
                            <button
                              onClick={() => {
                                setSelectedEventId(ev.id);
                                setActiveTab('attendance');
                              }}
                              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-xs font-bold transition ${
                                !evPerms.canViewRegistrations &&
                                !evPerms.canManagePayments &&
                                !evPerms.canManageBuses
                                  ? 'col-span-2 py-3 text-sm'
                                  : ''
                              }`}
                            >
                              <QrCode className="w-4 h-4" />
                              <span>ماسح الحضور QR</span>
                            </button>
                          )}
                        </div>

                        {evPerms.canManageStaff && (
                          <button
                            onClick={() => {
                              setSelectedEventId(ev.id);
                              setActiveTab('staff');
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-bold transition"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>تعيين خدام الفعالية والصلاحيات ({staffCount})</span>
                          </button>
                        )}

                        {/* Member Visibility Status & Show/Hide Toggle Button */}
                        {(() => {
                          const visCheck = isEventVisibleToMembers(ev);
                          return (
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
                              <span
                                className={`text-[10px] px-2.5 py-1 rounded-xl font-bold border ${
                                  visCheck.visible
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : visCheck.reason === 'expired'
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {visCheck.visible
                                  ? '🟢 ظاهرة في صفحة المخدومين'
                                  : visCheck.reason === 'expired'
                                  ? '⏰ انتهى موعدها واختفت من المخدومين'
                                  : '🚫 مخفية عن صفحة المخدومين'}
                              </span>

                              {evPerms.canManageEventSettings && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleEventVisibility(ev)}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                                    ev.isVisibleToMembers === false
                                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                                      : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {ev.isVisibleToMembers === false ? '👁️ إظهار للمخدومين' : '🚫 إخفاء عن المخدومين'}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Card Footer Bar */}
                    <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleCopyLink(ev.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 transition"
                      >
                        {copiedEventId === ev.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">تم نسخ الرابط!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ رابط التسجيل العام</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        {(evPerms.canViewReports ||
                          evPerms.canViewRegistrations ||
                          evPerms.isBusAttendanceOnly ||
                          evPerms.canScanAttendance) && (
                          <button
                            onClick={() => {
                              setSelectedEventId(ev.id);
                              setActiveTab('reports');
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                            title="تصدير البيانات والتقارير (Excel / PDF)"
                          >
                            <FileBarChart2 className="w-4 h-4" />
                          </button>
                        )}
                        {evPerms.canManageEventSettings && (
                          <>
                            <button
                              onClick={() => handleToggleArchiveEvent(ev)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                ev.status === 'archived' || ev.isArchived
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                              }`}
                              title={
                                ev.status === 'archived' || ev.isArchived
                                  ? 'استعادة الفعالية من الأرشيف'
                                  : 'أرشفة الفعالية مع الاحتفاظ بجميع بيانات المسجلين والمدفوعات'
                              }
                            >
                              {ev.status === 'archived' || ev.isArchived ? (
                                <>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>استعادة</span>
                                </>
                              ) : (
                                <>
                                  <Archive className="w-3.5 h-3.5" />
                                  <span>أرشيف 📦</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => openEditEventModal(ev)}
                              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                              title="تعديل الفعالية"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => setEventToDelete(ev)}
                                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                title="حذف الفعالية نهائياً مع بياناتها"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
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

      {/* Create / Edit Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Tent className="w-5 h-5 text-sky-400" />
                <span>
                  {editingEvent
                    ? `تعديل الفعالية: ${editingEvent.name}`
                    : 'إنشاء رحلة / مؤتمر / يوم روحي جديد'}
                </span>
              </h3>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => handleSaveEvent(e, false)} className="space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    اسم الفعالية / الرحلة / المؤتمر *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: مؤتمر شباب الثلاثة فتية الصيفي - الإسكندرية"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    نوع الفعالية *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as EventType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                  >
                    {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                      <option key={t} value={t}>
                        {EVENT_TYPE_LABELS[t].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates, Times & Visibility Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    تاريخ البداية *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    تاريخ النهاية
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    آخر موعد للتسجيل
                  </label>
                  <input
                    type="date"
                    value={registrationDeadline}
                    onChange={(e) => setRegistrationDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    حالة التسجيل *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EventStatus)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {EVENT_STATUS_LABELS[st].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Start/End Time + Auto-Hide on Expiry + Manual Show/Hide Toggle */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-bold text-emerald-300 mb-1">
                      🕒 من الساعة (وقت بداية الفعالية)
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-rose-300 mb-1">
                      🕒 إلى الساعة (وقت انتهاء الفعالية)
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsVisibleToMembers((prev) => !prev)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        isVisibleToMembers
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {isVisibleToMembers ? '👁️ الفعالية ظاهرة في صفحة المخدومين' : '🚫 الفعالية مخفية عن صفحة المخدومين'}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-300 pt-1">
                  <input
                    type="checkbox"
                    checked={autoHideOnExpiry}
                    onChange={(e) => setAutoHideOnExpiry(e.target.checked)}
                    className="accent-amber-400 w-4 h-4"
                  />
                  <span>🔒 إخفاء الفعالية تلقائياً من صفحة المخدومين فور انتهاء تاريخ وساعة موعدها المحددين أعلاه</span>
                </label>
              </div>

              {/* Location & Capacity Type (Limited vs Unlimited) & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    المكان / الوجهة *
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: بيت الوادي - وادي النطرون"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    نظام سعة المشتركين (Capacity Mode) *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={capacityType}
                      onChange={(e) => {
                        const mode = e.target.value as 'limited' | 'unlimited';
                        setCapacityType(mode);
                        if (mode === 'unlimited') setMaxCapacity(0);
                        else if (maxCapacity <= 0) setMaxCapacity(100);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
                    >
                      <option value="limited">عدد محدود (Limited)</option>
                      <option value="unlimited">مفتوح بلا حد أقصى (Unlimited)</option>
                    </select>
                    {capacityType === 'limited' && (
                      <input
                        type="number"
                        min={1}
                        required
                        value={maxCapacity}
                        onChange={(e) => setMaxCapacity(Number(e.target.value))}
                        placeholder="الحد الأقصى"
                        className="w-28 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    قيمة الاشتراك الأساسي للفرد (EGP) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Description & Image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    وصف وتفاصيل الفعالية والبرنامج
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="اكتب تفاصيل الرحلة أو المؤتمر، مواعيد التجمع، وما يشمله الاشتراك..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">
                    صورة الفعالية (رابط أو رفع صورة)
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="رابط صورة https://... أو ارفع من جهازك"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer transition">
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    <span>رفع صورة من الجهاز</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Payment Methods & Instructions */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  طرق الدفع المتاحة للفعالية وتعليمات السداد
                </h4>

                <div className="flex flex-wrap gap-2">
                  {ALL_PAYMENT_METHODS.map((method) => {
                    const checked = availablePaymentMethods.includes(method);
                    return (
                      <button
                        type="button"
                        key={method}
                        onClick={() => togglePaymentMethod(method)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                          checked
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {PAYMENT_METHOD_LABELS[method].label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    تعليمات الدفع والتحويل (تظهر للأعضاء أثناء التسجيل)
                  </label>
                  <textarea
                    rows={2}
                    value={paymentInstructions}
                    onChange={(e) => setPaymentInstructions(e.target.value)}
                    placeholder="أرقام فودافون كاش / حساب إنستا باي / مواعيد الدفع النقدي..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Configurable WhatsApp Payment Contacts — Select from «المخدومين والرتب» + Auto-Fill Phone + Multi-Method Selection */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
                <div>
                  <h4 className="text-sm font-extrabold text-sky-400 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <span>
                      الخدام مسؤولو استلام الاشتراكات عبر واتساب (اختيار مباشر من سجل الخدام والرتب)
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    اختر الخادم من قائمة «المخدومين والرتب» وسيتم إدراج اسمه ورقم هاتفه تلقائياً في نفس اللحظة، ثم حدد طريقة أو أكثر من طرق الدفع التي يستلمها. إذا اشترك أكثر من خادم في طريقة دفع واحدة سيختار المخدوم الخادم الذي سيتواصل معه، وإذا كانت الطريقة خاصة بخادم واحد سيظهر له وحده تلقائياً.
                  </p>
                </div>

                {/* Searchable Servant Picker from Makhdomeen & Ranks */}
                <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span>اختر خادماً من «المخدومين والرتب» لإضافته مع رقم هاتفه تلقائياً:</span>
                    </label>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={contactServantSearch}
                        onChange={(e) => setContactServantSearch(e.target.value)}
                        placeholder="ابحث باسم الخادم أو هاتفه..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                    {availableServantsForContacts.map((servant) => {
                      const alreadyAdded = whatsappContacts.some(
                        (c) =>
                          c.servantId === servant.id ||
                          (c.name === servant.fullName &&
                            c.phone === (servant.whatsapp || servant.phone))
                      );
                      const phone = servant.whatsapp || servant.phone || '';
                      return (
                        <button
                          type="button"
                          key={servant.id}
                          onClick={() => handleAddServantAsWhatsappContact(servant)}
                          disabled={alreadyAdded}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition ${
                            alreadyAdded
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 cursor-default'
                              : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          <span className="font-bold">{servant.fullName}</span>
                          <span className="text-[10px] font-mono text-sky-400" dir="ltr">
                            ({phone || 'بدون رقم'})
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {alreadyAdded ? '✓ مضاف' : '+ إضافة'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Configured Servants & Their Multi-Select Payment Methods */}
                <div className="space-y-3">
                  {whatsappContacts.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                      اضغط على اسم أي خادم بالأعلى لإضافته تلقائياً مع رقم هاتفه وتحديد طرق الدفع الخاصة به.
                    </div>
                  ) : (
                    whatsappContacts.map((contact) => {
                      const selectedMethods = Array.isArray(contact.paymentMethods)
                        ? contact.paymentMethods
                        : contact.paymentMethod && contact.paymentMethod !== 'all'
                        ? [contact.paymentMethod as PaymentMethodType]
                        : availablePaymentMethods;

                      return (
                        <div
                          key={contact.id}
                          className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                            {/* Servant Dropdown from Makhdomeen */}
                            <div className="sm:col-span-6">
                              <label className="block text-[10px] text-slate-400 mb-1">
                                الخادم المسؤول (من سجل الخدام والرتب)
                              </label>
                              <select
                                value={contact.servantId || ''}
                                onChange={(e) =>
                                  handleSelectServantForExistingContactRow(
                                    contact.id,
                                    e.target.value
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
                              >
                                <option value="">
                                  {contact.name
                                    ? `${contact.name} (${contact.roleTitle || 'خادم'})`
                                    : '-- اختر الخادم من القائمة --'}
                                </option>
                                {allServantsList.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.fullName} — ({ROLE_LABELS[s.role] || s.role}) —{' '}
                                    {s.whatsapp || s.phone}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Auto-Populated WhatsApp Phone */}
                            <div className="sm:col-span-5">
                              <label className="block text-[10px] text-slate-400 mb-1">
                                رقم هاتف / واتساب الخادم (يدرج تلقائياً مع إمكانية التعديل)
                              </label>
                              <input
                                type="text"
                                value={contact.phone}
                                onChange={(e) =>
                                  updateWhatsappContactPhone(contact.id, e.target.value)
                                }
                                placeholder="رقم واتساب (مثال: 012xxxxxxx)"
                                dir="ltr"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-sky-500"
                              />
                            </div>

                            {/* Remove Button */}
                            <div className="sm:col-span-1 flex justify-end sm:pt-4">
                              <button
                                type="button"
                                onClick={() => removeWhatsappContactRow(contact.id)}
                                className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition"
                                title="حذف هذا الخادم"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Multi-Select Payment Methods for this Servant */}
                          <div className="pt-2 border-t border-slate-800/80">
                            <span className="block text-[11px] font-bold text-slate-300 mb-2">
                              طرق الدفع المسندة إلى ({contact.name || 'هذا الخادم'}) — يمكنك اختيار طريقة أو أكثر:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {ALL_PAYMENT_METHODS.map((m) => {
                                const isChecked = selectedMethods.includes(m);
                                return (
                                  <button
                                    type="button"
                                    key={m}
                                    onClick={() => toggleContactPaymentMethod(contact.id, m)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                                      isChecked
                                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs'
                                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                                    }`}
                                  >
                                    <span>{isChecked ? '☑' : '☐'}</span>
                                    <span>{PAYMENT_METHOD_LABELS[m].icon}</span>
                                    <span>{PAYMENT_METHOD_LABELS[m].label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold hover:bg-sky-400 shadow-lg shadow-sky-500/20"
                >
                  {editingEvent
                    ? 'حفظ التعديلات'
                    : 'إنشاء الفعالية والانتقال لتعيين الخدام المسؤولين ←'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold">تأكيد حذف الفعالية نهائياً أو نقلها للأرشيف</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              عند حذف الفعالية <strong>«{eventToDelete.name}»</strong> نهائياً سيتم <strong>مسح جميع بيانات التسجيلات والمدفوعات والباصات الخاصة بها</strong> من الداشبورد.
              <br />
              أما إذا كنت ترغب في إخفائها مع <strong>حفظ جميع بياناتها وتقاريرها</strong>، يمكنك نقلها إلى <strong>الأرشيف 📦</strong>.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
              >
                تراجع
              </button>
              <button
                onClick={() => {
                  handleToggleArchiveEvent(eventToDelete);
                  setEventToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>نقل للأرشيف (مع حفظ البيانات)</span>
              </button>
              <button
                onClick={handleConfirmDeleteEvent}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600"
              >
                حذف نهائي مع مسح البيانات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
