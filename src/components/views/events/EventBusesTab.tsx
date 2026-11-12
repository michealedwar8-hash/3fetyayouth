import React, { useState, useMemo } from 'react';
import {
  CommunityEvent,
  EventBus,
  Registrant,
  PaymentStatus,
  ROLE_LABELS,
} from '../../../types';
import {
  saveEventBus,
  deleteEventBus,
  assignMemberToBus,
  getAvailableServantsFromMakhdomeen,
  EnrichedEventRegistration,
  eventsService,
} from '../../../services/eventsService';
import {
  Bus,
  Plus,
  Edit2,
  Trash2,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Phone,
  Search,
  GripVertical,
  ArrowLeftRight,
  DollarSign,
  CheckCircle2,
  Clock,
  ShieldAlert,
  X,
} from 'lucide-react';

interface EventBusesTabProps {
  event: CommunityEvent;
  registrations: EnrichedEventRegistration[];
  buses: EventBus[];
  attendancesCountByBus: Record<string, number>;
  currentUser: Registrant;
  canManageEvents: boolean;
  onRefresh: () => void;
}

const PAYMENT_BADGES: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: 'خالص الدفع', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  partially_paid: { label: 'دفع جزئي', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  pending_confirmation: { label: 'بانتظار تأكيد الدفع', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  unpaid: { label: 'لم يدفع', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  waived: { label: 'إعفاء كامل', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  cancelled: { label: 'ملغي', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export const EventBusesTab: React.FC<EventBusesTabProps> = ({
  event,
  registrations,
  buses,
  currentUser,
  canManageEvents,
  onRefresh,
}) => {
  const [selectedBusId, setSelectedBusId] = useState<string | null>(
    buses.length > 0 ? buses[0].id : null
  );
  // View mode inside Selected Bus:
  // 'registered' = الموزعون مسبقاً على هذا الباص (Original Assigned Bus)
  // 'actually_boarded' = الركاب الفعليون الذين صعدوا هذا الباص (Actual Boarding Bus)
  // 'not_checked_in' = الموزعون على هذا الباص ولم يحضروا بعد
  // 'event_absent' = كل من لم يسجل حضور بعد في الفعالية مع عرض الباص المخصص له
  const [busFilterTab, setBusFilterTab] = useState<
    'registered' | 'actually_boarded' | 'not_checked_in' | 'event_absent'
  >('registered');
  const [searchQuery, setSearchQuery] = useState('');
  const [unassignedSearch, setUnassignedSearch] = useState('');

  // Create / Edit Bus Modal State
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<EventBus | null>(null);
  const [busName, setBusName] = useState('');
  const [responsibleServantId, setResponsibleServantId] = useState<string>('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [busCapacity, setBusCapacity] = useState<number>(50);
  const [busNotes, setBusNotes] = useState('');

  const availableServants = useMemo(() => getAvailableServantsFromMakhdomeen(), [buses]);

  // Delete Confirmation Modal
  const [busToDelete, setBusToDelete] = useState<EventBus | null>(null);

  // Drag & Drop State
  const [draggedRegId, setDraggedRegId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  // Capacity Override Confirmation Modal
  const [overrideWarning, setOverrideWarning] = useState<{
    registrationId: string;
    targetBusId: string;
    busName: string;
    currentCount: number;
    capacity: number;
  } | null>(null);

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const busesMap = useMemo(() => {
    const map = new Map<string, EventBus>();
    buses.forEach((b) => map.set(b.id, b));
    return map;
  }, [buses]);

  const activeRegistrations = useMemo(
    () => registrations.filter((r) => r.registrationStatus !== 'cancelled'),
    [registrations]
  );

  const unassignedMembers = useMemo(() => {
    const q = unassignedSearch.trim().toLowerCase();
    return activeRegistrations.filter((r) => {
      if (r.assignedBusId) return false;
      if (!q) return true;
      return (
        r.member?.fullName.toLowerCase().includes(q) ||
        r.member?.phone.includes(q) ||
        r.member?.uniqueCode.toLowerCase().includes(q) ||
        r.registrationReference.toLowerCase().includes(q)
      );
    });
  }, [activeRegistrations, unassignedSearch]);

  // Original Assigned Bus mapping
  const membersByBus = useMemo(() => {
    const map: Record<string, EnrichedEventRegistration[]> = {};
    for (const bus of buses) {
      map[bus.id] = [];
    }
    for (const reg of activeRegistrations) {
      if (reg.assignedBusId && map[reg.assignedBusId]) {
        map[reg.assignedBusId].push(reg);
      }
    }
    return map;
  }, [buses, activeRegistrations]);

  // Actual Boarded Bus mapping (based on actualBusId recorded at check-in, falling back to assignedBusId if present)
  const actualBoardedByBus = useMemo(() => {
    const map: Record<string, EnrichedEventRegistration[]> = {};
    for (const bus of buses) {
      map[bus.id] = [];
    }
    for (const reg of activeRegistrations) {
      if (!reg.attendance) continue;
      const effectiveActualBusId =
        reg.actualBusId || reg.attendance.actualBusId || reg.assignedBusId;
      if (effectiveActualBusId && map[effectiveActualBusId]) {
        map[effectiveActualBusId].push(reg);
      }
    }
    return map;
  }, [buses, activeRegistrations]);

  const selectedBus = useMemo(
    () => buses.find((b) => b.id === selectedBusId) || (buses.length > 0 ? buses[0] : null),
    [buses, selectedBusId]
  );

  // Comprehensive Bus Boarding Statistics + Financial Summary for Selected Bus
  const selectedBusSummary = useMemo(() => {
    if (!selectedBus) {
      return {
        totalRegistered: 0,
        actuallyBoarded: 0,
        movedIn: 0,
        movedOut: 0,
        notCheckedIn: 0,
        totalRequired: 0,
        totalPaid: 0,
        totalRemaining: 0,
      };
    }
    const assignedList = membersByBus[selectedBus.id] || [];
    const boardedList = actualBoardedByBus[selectedBus.id] || [];

    const movedIn = boardedList.filter((r) => r.assignedBusId !== selectedBus.id).length;
    const movedOut = assignedList.filter((r) => {
      if (!r.attendance) return false;
      const actualId = r.actualBusId || r.attendance.actualBusId || r.assignedBusId;
      return Boolean(actualId && actualId !== selectedBus.id);
    }).length;
    const notCheckedIn = assignedList.filter((r) => !r.attendance).length;

    const totalRequired = assignedList.reduce((sum, r) => sum + r.finalRequiredAmount, 0);
    const totalPaid = assignedList.reduce((sum, r) => sum + r.totalPaidAmount, 0);
    const totalRemaining = assignedList.reduce((sum, r) => sum + r.remainingAmount, 0);

    return {
      totalRegistered: assignedList.length,
      actuallyBoarded: boardedList.length,
      movedIn,
      movedOut,
      notCheckedIn,
      totalRequired,
      totalPaid,
      totalRemaining,
    };
  }, [selectedBus, membersByBus, actualBoardedByBus]);

  const allEventNotCheckedInCount = useMemo(
    () => activeRegistrations.filter((r) => !r.attendance).length,
    [activeRegistrations]
  );

  const selectedBusMembers = useMemo(() => {
    if (!selectedBus) return [];
    const q = searchQuery.trim().toLowerCase();

    let sourceList: EnrichedEventRegistration[] = [];
    if (busFilterTab === 'registered') {
      sourceList = membersByBus[selectedBus.id] || [];
    } else if (busFilterTab === 'actually_boarded') {
      sourceList = actualBoardedByBus[selectedBus.id] || [];
    } else if (busFilterTab === 'not_checked_in') {
      sourceList = (membersByBus[selectedBus.id] || []).filter((r) => !r.attendance);
    } else if (busFilterTab === 'event_absent') {
      sourceList = activeRegistrations.filter((r) => !r.attendance);
    }

    if (!q) return sourceList;
    return sourceList.filter(
      (reg) =>
        reg.member?.fullName.toLowerCase().includes(q) ||
        reg.member?.phone.includes(q) ||
        reg.member?.uniqueCode.toLowerCase().includes(q)
    );
  }, [selectedBus, membersByBus, actualBoardedByBus, activeRegistrations, busFilterTab, searchQuery]);

  const openCreateBusModal = () => {
    setEditingBus(null);
    setBusName(`باص ${buses.length + 1}`);
    setResponsibleServantId('');
    setDriverName('');
    setDriverPhone('');
    setBusCapacity(50);
    setBusNotes('');
    setIsBusModalOpen(true);
  };

  const openEditBusModal = (bus: EventBus) => {
    setEditingBus(bus);
    setBusName(bus.name);
    setResponsibleServantId(bus.responsibleServantId || '');
    setDriverName(bus.responsibleServantName || bus.driverName || '');
    setDriverPhone(bus.responsibleServantPhone || bus.driverPhone || '');
    setBusCapacity(bus.capacity);
    setBusNotes(bus.notes || '');
    setIsBusModalOpen(true);
  };

  const handleSelectResponsibleServant = (servantId: string) => {
    setResponsibleServantId(servantId);
    if (!servantId) {
      setDriverName('');
      setDriverPhone('');
      return;
    }
    const servant = availableServants.find((s) => s.id === servantId);
    if (servant) {
      setDriverName(servant.fullName);
      setDriverPhone(servant.whatsapp || servant.phone || '');
    }
  };

  const handleSaveBus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busName.trim()) return;

    const saved = saveEventBus(
      {
        id: editingBus?.id,
        eventId: event.id,
        name: busName.trim(),
        responsibleServantId: responsibleServantId || undefined,
        responsibleServantName: driverName.trim(),
        responsibleServantPhone: driverPhone.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        capacity: Math.max(1, Number(busCapacity) || 50),
        notes: busNotes.trim(),
      },
      { id: currentUser.id, name: currentUser.fullName }
    );

    setIsBusModalOpen(false);
    setSelectedBusId(saved.id);
    setFeedbackBanner({
      type: 'success',
      message: editingBus
        ? `تم تحديث بيانات "${saved.name}" وتعيين الخادم المسؤول (${saved.responsibleServantName || 'غير محدد'}) بنجاح`
        : `تم إنشاء "${saved.name}" بسعة ${saved.capacity} مقعد وتعيين الخادم المسؤول بنجاح`,
    });
    onRefresh();
  };

  const handleConfirmDeleteBus = () => {
    if (!busToDelete) return;
    deleteEventBus(busToDelete.id, { id: currentUser.id, name: currentUser.fullName });
    if (selectedBusId === busToDelete.id) {
      const remaining = buses.filter((b) => b.id !== busToDelete.id);
      setSelectedBusId(remaining.length > 0 ? remaining[0].id : null);
    }
    setFeedbackBanner({
      type: 'warning',
      message: `تم حذف "${busToDelete.name}" وإلغاء تسكين أعضائه ليعودوا لقائمة غير المسكنين`,
    });
    setBusToDelete(null);
    onRefresh();
  };

  const handleAssignMember = (
    registrationId: string,
    targetBusId: string | undefined,
    allowCapacityOverride = false
  ) => {
    const result = assignMemberToBus({
      registrationId,
      busId: targetBusId,
      allowCapacityOverride,
      performedBy: { id: currentUser.id, name: currentUser.fullName },
    });

    if (!result.success) {
      if (result.requiresOverride && targetBusId) {
        const targetBus = buses.find((b) => b.id === targetBusId);
        const currentCount = targetBus ? (membersByBus[targetBus.id] || []).length : 0;
        if (targetBus) {
          setOverrideWarning({
            registrationId,
            targetBusId,
            busName: targetBus.name,
            currentCount,
            capacity: targetBus.capacity,
          });
          return;
        }
      }
      setFeedbackBanner({ type: 'error', message: result.error || 'تعذر تسكين العضو' });
      return;
    }

    if (result.warning) {
      setFeedbackBanner({ type: 'warning', message: result.warning });
    } else {
      setFeedbackBanner({
        type: 'success',
        message: targetBusId ? 'تم تسكين العضو في الباص بنجاح' : 'تم إزالة العضو من الباص',
      });
    }
    onRefresh();
  };

  // HTML5 Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, registrationId: string) => {
    if (!canManageEvents) return;
    setDraggedRegId(registrationId);
    e.dataTransfer.setData('text/plain', registrationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!canManageEvents) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTargetId !== targetId) {
      setDragOverTargetId(targetId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTargetId(null);
  };

  const handleDropOnBus = (e: React.DragEvent, targetBusId: string | undefined) => {
    e.preventDefault();
    setDragOverTargetId(null);
    const regId = e.dataTransfer.getData('text/plain') || draggedRegId;
    setDraggedRegId(null);
    if (!regId) return;

    const reg = activeRegistrations.find((r) => r.id === regId);
    if (!reg) return;
    if ((reg.assignedBusId || undefined) === targetBusId) return;

    handleAssignMember(regId, targetBusId, false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : feedbackBanner.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{feedbackBanner.message}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Create Bus Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
            <Bus className="w-5 h-5 text-sky-400" />
            <span>إدارة الباصات، التسكين المسبق، والركاب الفعليين (Transport & Boarding)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            يفصل النظام بدقة بين «الباص الموزع مسبقاً» و«الباص الفعلي الذي صعده العضو عند فحص QR» مع إحصائيات المنتقلين من وإلى كل باص.
          </p>
        </div>
        {canManageEvents && (
          <button
            onClick={openCreateBusModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-sky-500/20 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة باص / مجموعة جديدة</span>
          </button>
        )}
      </div>

      {/* Buses Overview Strip (Drop Zones) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {buses.map((bus) => {
          const assignedList = membersByBus[bus.id] || [];
          const boardedList = actualBoardedByBus[bus.id] || [];
          const count = assignedList.length;
          const actualBoardedCount = boardedList.length;
          const movedInCount = boardedList.filter((r) => r.assignedBusId !== bus.id).length;
          const movedOutCount = assignedList.filter((r) => {
            if (!r.attendance) return false;
            const actualId = r.actualBusId || r.attendance.actualBusId || r.assignedBusId;
            return Boolean(actualId && actualId !== bus.id);
          }).length;
          const notCheckedInCount = assignedList.filter((r) => !r.attendance).length;
          const busRequiredMoney = assignedList.reduce(
            (sum, r) => sum + (Number(r.finalRequiredAmount) || 0),
            0
          );
          const busCollectedMoney = assignedList.reduce(
            (sum, r) => sum + (Number(r.totalPaidAmount) || 0),
            0
          );

          const isFull = count >= bus.capacity;
          const isOverCapacity = count > bus.capacity;
          const isSelected = selectedBus?.id === bus.id;
          const isDragOver = dragOverTargetId === bus.id;
          const fillPercent = Math.min(100, Math.round((count / Math.max(1, bus.capacity)) * 100));

          return (
            <div
              key={bus.id}
              onClick={() => setSelectedBusId(bus.id)}
              onDragOver={(e) => handleDragOver(e, bus.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnBus(e, bus.id)}
              className={`cursor-pointer rounded-2xl p-4 border transition-all relative ${
                isDragOver
                  ? 'border-sky-400 bg-sky-500/15 scale-[1.02] shadow-lg shadow-sky-500/20'
                  : isSelected
                  ? 'border-sky-500/70 bg-slate-900 shadow-lg shadow-sky-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Bus className={`w-4 h-4 ${isSelected ? 'text-sky-400' : 'text-slate-400'}`} />
                    <h4 className="font-bold text-white text-base">{bus.name}</h4>
                  </div>
                  {(bus.responsibleServantName || bus.driverName) && (
                    <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5 font-semibold">
                      <span className="text-sky-400">الخادم المسؤول:</span>
                      <span>{bus.responsibleServantName || bus.driverName}</span>
                      {(bus.responsibleServantPhone || bus.driverPhone) && (
                        <span className="font-mono text-emerald-400" dir="ltr">
                          ({bus.responsibleServantPhone || bus.driverPhone})
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {canManageEvents && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEditBusModal(bus)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="تعديل الباص"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setBusToDelete(bus)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="حذف الباص"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Capacity Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">الموزعون مسبقاً / السعة:</span>
                  <span
                    className={`font-mono font-bold ${
                      isOverCapacity
                        ? 'text-rose-400'
                        : isFull
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {count} / {bus.capacity} مقعد
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isOverCapacity
                        ? 'bg-rose-500'
                        : isFull
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
              </div>

              {/* Bus Boarding Statistics Badges */}
              <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
                <span className="text-emerald-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  صعدوا فعلياً: <strong className="font-mono">{actualBoardedCount}</strong>
                </span>
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  لم يحضر: <strong className="font-mono">{notCheckedInCount}</strong>
                </span>
                {movedInCount > 0 && (
                  <span className="text-amber-300 font-bold">
                    ↪ انضم من باص آخر: +{movedInCount}
                  </span>
                )}
                {movedOutCount > 0 && (
                  <span className="text-sky-300 font-bold">
                    ↩ صعد باصاً آخر: {movedOutCount}
                  </span>
                )}
              </div>

              {/* Bus Total Financial Amount Badge */}
              <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-emerald-300 font-bold flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>إجمالي أموال الباص:</span>
                </span>
                <span className="font-mono font-extrabold text-emerald-400">
                  {busCollectedMoney.toLocaleString()} / {busRequiredMoney.toLocaleString()} {event.currency}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split Workspace: Unassigned Pool (Right) + Selected Bus View (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Unassigned Registered Members Pool */}
        <div
          onDragOver={(e) => handleDragOver(e, 'UNASSIGNED')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDropOnBus(e, undefined)}
          className={`lg:col-span-4 bg-slate-900/90 border rounded-2xl p-4 flex flex-col max-h-[680px] transition ${
            dragOverTargetId === 'UNASSIGNED'
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div>
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>أعضاء بانتظار التسكين</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                اسحب العضو إلى الباص المطلوب أو اختر الباص من القائمة
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs">
              {unassignedMembers.length}
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={unassignedSearch}
              onChange={(e) => setUnassignedSearch(e.target.value)}
              placeholder="بحث في غير المسكنين..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {unassignedMembers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                جميع المسجلين النشطين تم تسكينهم في الباصات بنجاح!
              </div>
            ) : (
              unassignedMembers.map((reg) => {
                const badge = PAYMENT_BADGES[reg.paymentStatus] || PAYMENT_BADGES.unpaid;
                return (
                  <div
                    key={reg.id}
                    draggable={canManageEvents}
                    onDragStart={(e) => handleDragStart(e, reg.id)}
                    className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 hover:border-slate-700 transition flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <GripVertical className="w-4 h-4 text-slate-600 shrink-0" />
                      {reg.member?.photoUrl ? (
                        <img
                          src={reg.member.photoUrl}
                          alt={reg.member.fullName}
                          className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                          {reg.member?.fullName?.charAt(0) || '؟'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {reg.member?.fullName || 'عضو غير معروف'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            دفع {reg.totalPaidAmount} ج.م
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManageEvents && buses.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignMember(reg.id, e.target.value, false);
                          }
                        }}
                        className="bg-slate-900 border border-slate-700 text-xs text-sky-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-500 shrink-0"
                      >
                        <option value="">تسكين في...</option>
                        {buses.map((b) => {
                          const c = (membersByBus[b.id] || []).length;
                          return (
                            <option key={b.id} value={b.id}>
                              {b.name} ({c}/{b.capacity})
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Bus Workspace & Bus Boarding Statistics */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          {!selectedBus ? (
            <div className="text-center py-20 space-y-3">
              <Bus className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-slate-300">لا توجد باصات مضافة حتى الآن</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                قم بإنشاء باص أو مجموعة انتقالات لتوزيع الأعضاء المسجلين ومتابعة كشف الركاب والماليات الخاصة بكل باص.
              </p>
              {canManageEvents && (
                <button
                  onClick={openCreateBusModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء أول باص الآن</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                {/* Selected Bus Header & 5 Bus Boarding Statistics Counters */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <Bus className="w-5 h-5" />
                      </span>
                      <div>
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                          <span>كشف وإحصائيات {selectedBus.name}</span>
                          {selectedBusSummary.totalRegistered >= selectedBus.capacity && (
                            <span className="px-2 py-0.5 text-xs rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              مكتمل ({selectedBusSummary.totalRegistered}/{selectedBus.capacity})
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                          <span>السائق: {selectedBus.driverName || 'غير محدد'}</span>
                          {selectedBus.driverPhone && (
                            <span className="flex items-center gap-1 font-mono text-slate-300" dir="ltr">
                              <Phone className="w-3 h-3 text-sky-400" />
                              {selectedBus.driverPhone}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 5 Bus Boarding Statistics Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="block text-[10px] text-slate-400">الموزعون مسبقاً</span>
                      <span className="font-mono font-bold text-sm text-sky-400">
                        {selectedBusSummary.totalRegistered} / {selectedBus.capacity}
                      </span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                      <span className="block text-[10px] text-emerald-300">صعدوا فعلياً</span>
                      <span className="font-mono font-bold text-sm text-emerald-400">
                        {selectedBusSummary.actuallyBoarded}
                      </span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25">
                      <span className="block text-[10px] text-amber-300">انضموا من باص آخر</span>
                      <span className="font-mono font-bold text-sm text-amber-400">
                        +{selectedBusSummary.movedIn}
                      </span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25">
                      <span className="block text-[10px] text-purple-300">صعدوا باصاً آخر</span>
                      <span className="font-mono font-bold text-sm text-purple-400">
                        {selectedBusSummary.movedOut}
                      </span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25">
                      <span className="block text-[10px] text-rose-300">لم يحضروا بعد</span>
                      <span className="font-mono font-bold text-sm text-rose-400">
                        {selectedBusSummary.notCheckedIn}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dual View Tabs (Registered vs Actually Boarded vs Absent) & Search */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setBusFilterTab('registered')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        busFilterTab === 'registered'
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👥 الموزعون مسبقاً ({selectedBusSummary.totalRegistered})
                    </button>
                    <button
                      onClick={() => setBusFilterTab('actually_boarded')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        busFilterTab === 'actually_boarded'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🟢 الركاب الفعليون بالباص ({selectedBusSummary.actuallyBoarded})
                    </button>
                    <button
                      onClick={() => setBusFilterTab('not_checked_in')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        busFilterTab === 'not_checked_in'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ⏳ غائبون من هذا الباص ({selectedBusSummary.notCheckedIn})
                    </button>
                    <button
                      onClick={() => setBusFilterTab('event_absent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        busFilterTab === 'event_absent'
                          ? 'bg-rose-500 text-white'
                          : 'text-rose-300/80 hover:text-rose-200'
                      }`}
                    >
                      🔴 لم يحضروا بالفعالية ({allEventNotCheckedInCount})
                    </button>
                  </div>

                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث داخل القائمة..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Members Table inside Selected Bus */}
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-xl border border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-3 font-semibold">#</th>
                        <th className="py-3 px-3 font-semibold">العضو</th>
                        <th className="py-3 px-3 font-semibold">الباص الموزع / حركة الصعود</th>
                        <th className="py-3 px-3 font-semibold">حالة الدفع</th>
                        <th className="py-3 px-3 font-semibold">المدفوع / المتبقي</th>
                        <th className="py-3 px-3 font-semibold">حالة الحضور</th>
                        {canManageEvents && (
                          <th className="py-3 px-3 font-semibold text-center">نقل التسكين المسبق</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {selectedBusMembers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canManageEvents ? 7 : 6}
                            className="py-10 text-center text-slate-500"
                          >
                            لا يوجد أعضاء مطابقون للفلتر الحالي في هذا العرض.
                          </td>
                        </tr>
                      ) : (
                        selectedBusMembers.map((reg, idx) => {
                          const payBadge = PAYMENT_BADGES[reg.paymentStatus] || PAYMENT_BADGES.unpaid;
                          const originalBus = reg.assignedBusId
                            ? busesMap.get(reg.assignedBusId) || null
                            : null;
                          const effectiveActualBusId =
                            reg.actualBusId || reg.attendance?.actualBusId || reg.assignedBusId;
                          const actualBus = effectiveActualBusId
                            ? busesMap.get(effectiveActualBusId) || null
                            : null;
                          const movedFromAnotherBus = Boolean(
                            reg.attendance &&
                              effectiveActualBusId === selectedBus.id &&
                              reg.assignedBusId !== selectedBus.id
                          );
                          const movedToAnotherBus = Boolean(
                            reg.attendance &&
                              reg.assignedBusId === selectedBus.id &&
                              effectiveActualBusId &&
                              effectiveActualBusId !== selectedBus.id
                          );

                          return (
                            <tr
                              key={reg.id}
                              draggable={canManageEvents}
                              onDragStart={(e) => handleDragStart(e, reg.id)}
                              className="hover:bg-slate-800/40 transition"
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  {reg.member?.photoUrl ? (
                                    <img
                                      src={reg.member.photoUrl}
                                      alt={reg.member.fullName}
                                      className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                                      {reg.member?.fullName?.charAt(0) || '؟'}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-bold text-white">
                                      {reg.member?.fullName || 'عضو غير معروف'}
                                    </p>
                                    <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                                      {reg.member?.phone} • #{reg.member?.uniqueCode}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-bold">
                                    <Bus className="w-3 h-3" />
                                    موزع: {originalBus ? originalBus.name : 'غير معين'}
                                  </span>
                                  {movedFromAnotherBus && (
                                    <span className="block text-[10px] text-amber-300 font-bold">
                                      🟢 صعد هذا الباص (قادم من: {originalBus ? originalBus.name : 'غير مسكن'})
                                    </span>
                                  )}
                                  {movedToAnotherBus && actualBus && (
                                    <span className="block text-[10px] text-purple-300 font-bold">
                                      ⚠️ صعد فعلياً في: {actualBus.name}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${payBadge.className}`}
                                >
                                  {payBadge.label}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                <span className="text-emerald-400 font-bold">
                                  {reg.totalPaidAmount} ج.م
                                </span>
                                {reg.remainingAmount > 0 && (
                                  <span className="text-rose-400 block text-[10px]">
                                    متبقي: {reg.remainingAmount} ج.م
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {reg.attendance ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                                      <UserCheck className="w-3.5 h-3.5" />
                                      🟢 حاضر ({new Date(reg.attendance.checkInTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                                    </span>
                                    {movedFromAnotherBus && (
                                      <span className="block text-[10px] text-emerald-300 font-bold">
                                        (من {originalBus ? originalBus.name : 'غير مسكن'})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                                    <UserX className="w-3.5 h-3.5" />
                                    🔴 لم يحضر بعد
                                  </span>
                                )}
                              </td>
                              {canManageEvents && (
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <select
                                      value={reg.assignedBusId || 'UNASSIGNED'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        handleAssignMember(
                                          reg.id,
                                          val === 'UNASSIGNED' ? undefined : val,
                                          false
                                        );
                                      }}
                                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                                    >
                                      <option value="UNASSIGNED">-- إلغاء التسكين --</option>
                                      {buses.map((b) => (
                                        <option key={b.id} value={b.id}>
                                          تسكين في: {b.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const res = eventsService.cancelRegistration(
                                          reg.id,
                                          'إلغاء التسجيل وإخلاء مقعد الباص',
                                          currentUser.fullName || 'المسؤول'
                                        );
                                        if (res.success) {
                                          onRefresh();
                                        }
                                      }}
                                      className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-bold transition cursor-pointer shrink-0"
                                      title="إلغاء تسجيل العضو من الفعالية"
                                    >
                                      إلغاء التسجيل
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bus Financial Summary Footer */}
              <div className="mt-5 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    الملخص المالي لركاب {selectedBus.name} (Bus Financial Summary)
                  </h5>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">إجمالي المسجلين بالباص</span>
                    <span className="text-base font-mono font-bold text-white mt-0.5 block">
                      {selectedBusSummary.totalRegistered} عضو
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">إجمالي المبلغ المطلوب</span>
                    <span className="text-base font-mono font-bold text-sky-400 mt-0.5 block">
                      {selectedBusSummary.totalRequired.toLocaleString()} {event.currency}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                    <span className="text-[11px] text-emerald-300 block">إجمالي المحصل الفعلي</span>
                    <span className="text-base font-mono font-bold text-emerald-400 mt-0.5 block">
                      {selectedBusSummary.totalPaid.toLocaleString()} {event.currency}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25">
                    <span className="text-[11px] text-rose-300 block">إجمالي المتبقي للتحصيل</span>
                    <span className="text-base font-mono font-bold text-rose-400 mt-0.5 block">
                      {selectedBusSummary.totalRemaining.toLocaleString()} {event.currency}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create / Edit Bus Modal */}
      {isBusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Bus className="w-5 h-5 text-sky-400" />
                <span>{editingBus ? 'تعديل بيانات الباص' : 'إضافة باص / مجموعة جديدة'}</span>
              </h4>
              <button
                onClick={() => setIsBusModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم الباص / المجموعة *
                </label>
                <input
                  type="text"
                  required
                  value={busName}
                  onChange={(e) => setBusName(e.target.value)}
                  placeholder="مثال: باص 1 - القاهرة الجديدة"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    السعة القصوى (عدد المقاعد) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={busCapacity}
                    onChange={(e) => setBusCapacity(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    الخادم المسؤول عن الباص (Responsible Servant) *
                  </label>
                  <select
                    value={responsibleServantId}
                    onChange={(e) => handleSelectResponsibleServant(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
                  >
                    <option value="">
                      {driverName
                        ? `${driverName} (${driverPhone || 'بدون رقم'})`
                        : '-- اختر الخادم المسؤول من سجل الخدام والرتب --'}
                    </option>
                    {availableServants.map((servant) => (
                      <option key={servant.id} value={servant.id}>
                        {servant.fullName} — ({ROLE_LABELS[servant.role] || servant.role}) —{' '}
                        {servant.whatsapp || servant.phone}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    اسم الخادم المسؤول (يدرج تلقائياً)
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="يتم جلبه تلقائياً عند اختيار الخادم"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    هاتف الخادم المسؤول (يدرج تلقائياً)
                  </label>
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="sm:col-span-2 text-[11px] text-sky-400 font-semibold">
                  💡 عند تعيين خادم مسؤول عن هذا الباص، تُمنح له تلقائياً صلاحية «BUS_ATTENDANCE_ONLY» لفتح ماسح QR وتحضير ركاب هذا الباص فقط.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  ملاحظات نقطة التجمع والتحرك
                </label>
                <textarea
                  rows={2}
                  value={busNotes}
                  onChange={(e) => setBusNotes(e.target.value)}
                  placeholder="مثال: التحرك الساعة 6:30 صباحاً من أمام الكنيسة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBusModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-bold hover:bg-sky-400"
                >
                  {editingBus ? 'حفظ التعديلات' : 'إنشاء الباص'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Capacity Override Warning Modal */}
      {overrideWarning && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="w-7 h-7 shrink-0" />
              <h4 className="text-base font-bold">تنبيه: الباص مكتمل السعة (Bus Full)!</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              الباص <strong>«{overrideWarning.busName}»</strong> وصل إلى سعته القصوى (
              <span className="font-mono font-bold text-amber-300">
                {overrideWarning.currentCount} / {overrideWarning.capacity}
              </span>
              ). هل ترغب بصفتك مسؤولاً في تجاوز السعة (Admin Override) وتسكين العضو على أي حال؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setOverrideWarning(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const { registrationId, targetBusId } = overrideWarning;
                  setOverrideWarning(null);
                  handleAssignMember(registrationId, targetBusId, true);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400"
              >
                تأكيد التجاوز والتسكين (Admin Override)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Bus Confirmation Modal */}
      {busToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold">تأكيد حذف {busToDelete.name}</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من حذف <strong>{busToDelete.name}</strong>؟ سيتم إرجاع جميع الأعضاء المسكنين فيه تلقائياً إلى قائمة «أعضاء بانتظار التسكين» دون حذف تسجيلاتهم أو مدفوعاتهم.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setBusToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
              >
                تراجع
              </button>
              <button
                onClick={handleConfirmDeleteBus}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600"
              >
                تأكيد حذف الباص
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
