import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CommunityEvent,
  EventBus,
  Registrant,
  PaymentStatus,
} from '../../../types';
import {
  recordEventAttendance,
  revokeEventAttendance,
  EnrichedEventRegistration,
  EventCheckInResult,
} from '../../../services/eventsService';
import { playAttendanceBeep } from '../../../services/storageService';
import {
  QrCode,
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  UserCheck,
  UserX,
  Bus,
  Clock,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  ArrowLeftRight,
} from 'lucide-react';

interface EventAttendanceTabProps {
  event: CommunityEvent;
  registrations: EnrichedEventRegistration[];
  buses: EventBus[];
  currentUser: Registrant;
  canScanAttendance: boolean;
  assignedBusIds?: string[];
  isBusAttendanceOnly?: boolean;
  canViewPaymentDetails?: boolean;
  onRefresh: () => void;
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: 'خالص الدفع', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  partially_paid: { label: 'دفع جزئي', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  pending_confirmation: { label: 'بانتظار تأكيد الدفع', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  unpaid: { label: 'غير مدفوع', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  waived: { label: 'إعفاء كامل', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  cancelled: { label: 'ملغي', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export const EventAttendanceTab: React.FC<EventAttendanceTabProps> = ({
  event,
  registrations,
  buses,
  currentUser,
  canScanAttendance,
  assignedBusIds = [],
  isBusAttendanceOnly = false,
  canViewPaymentDetails = true,
  onRefresh,
}) => {
  const visibleBuses = useMemo(() => {
    if (isBusAttendanceOnly && assignedBusIds.length > 0) {
      return buses.filter((b) => assignedBusIds.includes(b.id));
    }
    return buses;
  }, [buses, isBusAttendanceOnly, assignedBusIds]);

  // Mandatory Bus Selection before QR Scan when buses exist
  const [selectedScannerBusId, setSelectedScannerBusId] = useState<string>(() =>
    visibleBuses.length === 1 ? visibleBuses[0].id : ''
  );
  const [rosterBusFilter, setRosterBusFilter] = useState<string>(() =>
    isBusAttendanceOnly && visibleBuses.length === 1 ? visibleBuses[0].id : 'ALL'
  );
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScanResult, setLastScanResult] = useState<EventCheckInResult | null>(null);

  const [manualSearch, setManualSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [quickCodeInput, setQuickCodeInput] = useState('');

  const scannerRef = useRef<any>(null);
  const lastScannedTextRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const scannerRegionId = `event-qr-reader-${event.id.replace(/[^a-zA-Z0-9]/g, '')}`;

  const busesMap = useMemo(() => {
    const map = new Map<string, EventBus>();
    buses.forEach((b) => map.set(b.id, b));
    return map;
  }, [buses]);

  const selectedScannerBus = useMemo(
    () => (selectedScannerBusId ? busesMap.get(selectedScannerBusId) || null : null),
    [selectedScannerBusId, busesMap]
  );

  const activeRegistrations = useMemo(
    () => registrations.filter((r) => r.registrationStatus !== 'cancelled'),
    [registrations]
  );

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scannerRef.current?.clear();
            } catch {}
            scannerRef.current = null;
          });
      }
    };
  }, []);

  const requiresBusSelection = visibleBuses.length > 0 && !selectedScannerBusId;

  const processQrScan = (decodedText: string) => {
    if (buses.length > 0 && !selectedScannerBusId) {
      setCameraError('يرجى أولاً اختيار الباص الذي تقوم بتحضيره من الخطوة (1) بالأعلى قبل فحص الكود.');
      playAttendanceBeep('error');
      return;
    }

    const now = Date.now();
    if (
      lastScannedTextRef.current.text === decodedText &&
      now - lastScannedTextRef.current.time < 3000
    ) {
      return;
    }
    lastScannedTextRef.current = { text: decodedText, time: now };

    const result = recordEventAttendance({
      eventId: event.id,
      qrOrMemberInput: decodedText,
      selectedBusId: selectedScannerBusId || undefined,
      method: 'qr',
      checkedInBy: { id: currentUser.id, name: currentUser.fullName },
    });

    setLastScanResult(result);

    if (result.status === 'confirmed' || result.status === 'bus_changed') {
      playAttendanceBeep('success');
      onRefresh();
    } else if (result.status === 'already_checked_in') {
      playAttendanceBeep('duplicate');
    } else {
      playAttendanceBeep('error');
    }
  };

  const startScanner = async (mode: 'environment' | 'user' = facingMode) => {
    if (buses.length > 0 && !selectedScannerBusId) {
      setCameraError('⚠️ يجب اختيار الباص أولاً (الخطوة 1 بالأعلى) قبل تشغيل كاميرا ماسح الـ QR.');
      return;
    }

    setCameraError(null);
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        try {
          scannerRef.current.clear();
        } catch {}
        scannerRef.current = null;
      }

      setIsScanning(true);

      setTimeout(async () => {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          const html5QrCode = new Html5Qrcode(scannerRegionId);
          scannerRef.current = html5QrCode;
          await html5QrCode.start(
            { facingMode: mode },
            {
              fps: 12,
              qrbox: { width: 240, height: 240 },
            },
            (decodedText) => {
              processQrScan(decodedText);
            },
            () => {}
          );
        } catch (err: any) {
          setIsScanning(false);
          setCameraError(
            'تعذر فتح الكاميرا. تأكد من منح صلاحية الكاميرا للمتصفح أو استخدم التحضير اليدوي بالأسفل.'
          );
        }
      }, 150);
    } catch (err) {
      setIsScanning(false);
      setCameraError('حدث خطأ أثناء تشغيل ماسح الـ QR Code');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const toggleCameraFacing = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isScanning) {
      await startScanner(nextMode);
    }
  };

  const handleQuickCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCodeInput.trim()) return;
    if (buses.length > 0 && !selectedScannerBusId) {
      setCameraError('⚠️ يرجى اختيار الباص أولاً من الأعلى قبل تسجيل الحضور.');
      playAttendanceBeep('error');
      return;
    }
    setCameraError(null);
    processQrScan(quickCodeInput.trim());
    setQuickCodeInput('');
  };

  const handleManualCheckIn = (reg: EnrichedEventRegistration) => {
    if (!reg.member) return;
    const effectiveBusId = selectedScannerBusId || reg.assignedBusId || undefined;
    if (buses.length > 0 && !effectiveBusId) {
      setCameraError('⚠️ يرجى اختيار الباص من الأعلى لتسجيل صعود العضو عليه.');
      playAttendanceBeep('error');
      return;
    }
    setCameraError(null);
    const result = recordEventAttendance({
      eventId: event.id,
      qrOrMemberInput: reg.member.id,
      selectedBusId: effectiveBusId,
      method: 'manual',
      checkedInBy: { id: currentUser.id, name: currentUser.fullName },
    });

    setLastScanResult(result);
    if (result.status === 'confirmed' || result.status === 'bus_changed') {
      playAttendanceBeep('success');
      onRefresh();
    } else if (result.status === 'already_checked_in') {
      playAttendanceBeep('duplicate');
    }
  };

  const handleRevokeCheckIn = (reg: EnrichedEventRegistration) => {
    const ok = revokeEventAttendance(event.id, reg.memberId, {
      id: currentUser.id,
      name: currentUser.fullName,
    });
    if (ok) {
      setLastScanResult(null);
      onRefresh();
    }
  };

  const filteredRegistrations = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    return activeRegistrations.filter((reg) => {
      const effectiveBusFilter = rosterBusFilter !== 'ALL' ? rosterBusFilter : selectedScannerBusId || 'ALL';
      if (effectiveBusFilter !== 'ALL') {
        if (effectiveBusFilter === 'UNASSIGNED') {
          if (reg.assignedBusId) return false;
        } else {
          const matchesAssigned = reg.assignedBusId === effectiveBusFilter;
          const matchesActual = (reg.actualBusId || reg.attendance?.actualBusId) === effectiveBusFilter;
          if (!matchesAssigned && !matchesActual) return false;
        }
      }

      if (attendanceFilter === 'present' && !reg.attendance) return false;
      if (attendanceFilter === 'absent' && reg.attendance) return false;

      if (!q) return true;
      return (
        reg.member?.fullName.toLowerCase().includes(q) ||
        reg.member?.phone.includes(q) ||
        reg.member?.uniqueCode.toLowerCase().includes(q) ||
        reg.registrationReference.toLowerCase().includes(q)
      );
    });
  }, [activeRegistrations, rosterBusFilter, selectedScannerBusId, attendanceFilter, manualSearch]);

  const stats = useMemo(() => {
    if (selectedScannerBusId) {
      const assignedToBus = activeRegistrations.filter((r) => r.assignedBusId === selectedScannerBusId);
      const actuallyBoardedBus = activeRegistrations.filter(
        (r) => Boolean(r.attendance) && (r.actualBusId || r.attendance?.actualBusId || r.assignedBusId) === selectedScannerBusId
      );
      const movedIn = actuallyBoardedBus.filter(
        (r) => r.assignedBusId !== selectedScannerBusId
      ).length;
      const movedOut = assignedToBus.filter(
        (r) => Boolean(r.attendance) && (r.actualBusId || r.attendance?.actualBusId) && (r.actualBusId || r.attendance?.actualBusId) !== selectedScannerBusId
      ).length;
      const notCheckedIn = assignedToBus.filter((r) => !r.attendance).length;

      return {
        total: assignedToBus.length,
        present: actuallyBoardedBus.length,
        absent: notCheckedIn,
        movedIn,
        movedOut,
      };
    }

    const present = activeRegistrations.filter((r) => Boolean(r.attendance)).length;
    return {
      total: activeRegistrations.length,
      present,
      absent: activeRegistrations.length - present,
      movedIn: 0,
      movedOut: 0,
    };
  }, [activeRegistrations, selectedScannerBusId]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Step 1: Mandatory Bus Selection Bar before QR Scanning */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black">
                الخطوة 1
              </span>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bus className="w-5 h-5 text-sky-400" />
                <span>اختر الباص الذي تقوم بتحضير ركابه الآن</span>
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              لتسجيل الباص الفعلي الذي صعده كل عضو بدقة دون المساس بالباص الأصلي الموزع عليه مسبقاً، اختر الباص أولاً ثم افتح ماسح الـ QR.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold">
              الموزعون مسبقاً: <strong className="font-mono">{stats.total}</strong>
            </span>
            <span className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
              صعدوا فعلياً: <strong className="font-mono">{stats.present}</strong>
            </span>
            {stats.movedIn > 0 && (
              <span className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                قادمون من باص آخر: <strong className="font-mono">+{stats.movedIn}</strong>
              </span>
            )}
            <span className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
              لم يحضروا بعد: <strong className="font-mono">{stats.absent}</strong>
            </span>
          </div>
        </div>

        {visibleBuses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
            {visibleBuses.map((bus) => {
              const isSelected = selectedScannerBusId === bus.id;
              const assignedCount = activeRegistrations.filter((r) => r.assignedBusId === bus.id).length;
              const actualBoardedCount = activeRegistrations.filter(
                (r) =>
                  Boolean(r.attendance) &&
                  (r.actualBusId || r.attendance?.actualBusId || r.assignedBusId) === bus.id
              ).length;

              return (
                <button
                  key={bus.id}
                  type="button"
                  onClick={() => {
                    setSelectedScannerBusId(bus.id);
                    setRosterBusFilter(bus.id);
                    setCameraError(null);
                  }}
                  className={`p-3.5 rounded-2xl border text-right transition flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-400 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-400/30'
                      : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bus className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-sky-400'}`} />
                      <span className="font-black text-sm text-white">{bus.name}</span>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                        الباص النشط للفحص ✓
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80 font-mono">
                    <span>موزع: {assignedCount}/{bus.capacity}</span>
                    <span className="text-emerald-400 font-bold">صعد فعلياً: {actualBoardedCount}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
            هذه الفعالية لا تحتوي على تقسيم باصات — يمكنك بدء فحص الـ QR Code مباشرة.
          </div>
        )}
      </div>

      {/* Scanner + Instant Status Result Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Camera QR Scanner Card */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-black">
                  الخطوة 2
                </span>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-sky-400" />
                  <span>ماسح الكاميرا السريع (QR Scanner)</span>
                </h4>
              </div>
              {selectedScannerBus && (
                <p className="text-[11px] text-emerald-400 font-bold mt-1">
                  🚌 الباص المحدد حالياً للفحص: {selectedScannerBus.name}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isScanning && (
                <button
                  onClick={toggleCameraFacing}
                  className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1"
                  title="تبديل الكاميرا"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تبديل العدسة</span>
                </button>
              )}
              {canScanAttendance && (
                <button
                  onClick={() => (isScanning ? stopScanner() : startScanner())}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    isScanning
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                      : requiresBusSelection
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <CameraOff className="w-4 h-4" />
                      <span>إيقاف الكاميرا</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>تشغيل ماسح QR</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Camera Viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 min-h-[260px] flex items-center justify-center">
            <div id={scannerRegionId} className="w-full" />
            {!isScanning && (
              <div className="text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <QrCode className="w-7 h-7" />
                </div>
                {requiresBusSelection ? (
                  <p className="text-xs text-amber-300 font-bold max-w-xs mx-auto">
                    👆 اختر الباص أولاً من البطاقات في الخطوة (1) بالأعلى، ثم اضغط على «تشغيل ماسح QR».
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    اضغط على «تشغيل ماسح QR» لتوجيه الكاميرا نحو كارت العضو لتسجيل صعوده في{' '}
                    <strong className="text-emerald-300">
                      {selectedScannerBus ? selectedScannerBus.name : 'الفعالية'}
                    </strong>
                    .
                  </p>
                )}
              </div>
            )}
          </div>

          {cameraError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold">
              {cameraError}
            </div>
          )}

          {/* Quick Code / Barcode Gun Input */}
          <form onSubmit={handleQuickCodeSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={quickCodeInput}
              onChange={(e) => setQuickCodeInput(e.target.value)}
              placeholder="أو أدخل كود العضو / امسح بجهاز قارئ الباركود..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition shrink-0 cursor-pointer"
            >
              فحص وتحـضير
            </button>
          </form>
        </div>

        {/* Instant Verification & 4 Scan Result States Display */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-center">
          {!lastScanResult ? (
            <div className="text-center py-12 space-y-3">
              <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-slate-300">
                بانتظار فحص QR Code أو اختيار عضو للتحضير
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                يعالج النظام 4 حالات تلقائياً: (1) صعود في نفس الباص المخصص ✅، (2) صعود في باص مختلف مع حفظ الباص الأصلي والباص الفعلي ⚠️، (3) عضو غير مسجل بالفعالية ❌، (4) منع تكرار التحضير مرتين ⚠️.
              </p>
            </div>
          ) : (
            <div
              className={`rounded-2xl p-6 border-2 transition-all ${
                lastScanResult.status === 'confirmed'
                  ? 'bg-emerald-500/10 border-emerald-500/50'
                  : lastScanResult.status === 'bus_changed'
                  ? 'bg-amber-500/15 border-amber-400/70'
                  : lastScanResult.status === 'already_checked_in'
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-rose-500/10 border-rose-500/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {lastScanResult.status === 'confirmed' ? (
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" />
                  ) : lastScanResult.status === 'bus_changed' ? (
                    <ArrowLeftRight className="w-10 h-10 text-amber-400 shrink-0" />
                  ) : lastScanResult.status === 'already_checked_in' ? (
                    <AlertTriangle className="w-10 h-10 text-amber-400 shrink-0" />
                  ) : (
                    <XCircle className="w-10 h-10 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block mb-1 ${
                        lastScanResult.status === 'confirmed'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : lastScanResult.status === 'bus_changed'
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                          : lastScanResult.status === 'already_checked_in'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {lastScanResult.status === 'confirmed'
                        ? '✅ Attendance Confirmed'
                        : lastScanResult.status === 'bus_changed'
                        ? '⚠️ Bus Difference Detected — Attendance Recorded'
                        : lastScanResult.status === 'already_checked_in'
                        ? '⚠️ Already Checked In'
                        : lastScanResult.status === 'not_registered'
                        ? '❌ Not Registered for This Event'
                        : '❌ Member Not Found'}
                    </span>
                    <h4 className="text-lg font-extrabold text-white">{lastScanResult.message}</h4>
                  </div>
                </div>
              </div>

              {/* Case 2 Highlight Banner: Registered Bus vs Actual Boarding Bus */}
              {lastScanResult.status === 'bus_changed' && (
                <div className="mt-4 p-3.5 rounded-xl bg-amber-950/60 border border-amber-400/40 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Registered (الباص الموزع مسبقاً):</span>
                    <span className="font-black text-sky-300 text-sm flex items-center gap-1.5 mt-1">
                      <Bus className="w-4 h-4 text-sky-400" />
                      {lastScanResult.bus ? lastScanResult.bus.name : 'غير معين'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40">
                    <span className="text-emerald-300 block text-[11px]">Actual (الباص الفعلي الذي صعده الآن):</span>
                    <span className="font-black text-emerald-300 text-sm flex items-center gap-1.5 mt-1">
                      <Bus className="w-4 h-4 text-emerald-400" />
                      {lastScanResult.actualBus ? lastScanResult.actualBus.name : selectedScannerBus?.name || 'الباص الحالي'}
                    </span>
                  </div>
                  <div className="sm:col-span-2 text-emerald-300 font-bold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>تم تسجيل الحضور بنجاح في الباص الفعلي مع الاحتفاظ بسجل الباص الأصلي في النظام.</span>
                  </div>
                </div>
              )}

              {/* Case 4 Highlight Banner: Already Checked In Details */}
              {lastScanResult.status === 'already_checked_in' && lastScanResult.attendance && (
                <div className="mt-4 p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/30 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-amber-300/80 block text-[11px]">Previous Bus (الباص الذي سُجل صعوده فيه):</span>
                    <span className="font-black text-white text-sm flex items-center gap-1.5 mt-0.5">
                      <Bus className="w-4 h-4 text-amber-400" />
                      {lastScanResult.actualBus?.name || lastScanResult.bus?.name || 'تم التحضير بالفعالية'}
                    </span>
                  </div>
                  <div>
                    <span className="text-amber-300/80 block text-[11px]">Previous Time (وقت التحضير السابق):</span>
                    <span className="font-mono font-black text-white text-sm block mt-0.5">
                      {new Date(lastScanResult.attendance.checkInTime).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              )}

              {/* Member & Registration Details Card inside Result */}
              {lastScanResult.member && (
                <div className="mt-5 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {lastScanResult.member.photoUrl ? (
                      <img
                        src={lastScanResult.member.photoUrl}
                        alt={lastScanResult.member.fullName}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-700"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-xl font-bold text-white">
                        {lastScanResult.member.fullName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h5 className="text-base font-bold text-white">
                        {lastScanResult.member.fullName}
                      </h5>
                      <p className="text-xs text-slate-300 font-mono mt-0.5" dir="ltr">
                        {lastScanResult.member.phone} • #{lastScanResult.member.uniqueCode}
                      </p>
                      {lastScanResult.registration && (
                        <p className="text-xs text-sky-400 font-mono mt-1">
                          رقم الحجز: {lastScanResult.registration.registrationReference}
                        </p>
                      )}
                    </div>
                  </div>

                  {lastScanResult.registration && (
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">الباص الموزع مسبقاً</span>
                        <span className="font-bold text-sky-300 block mt-0.5">
                          {lastScanResult.bus ? lastScanResult.bus.name : 'غير مسكن في باص'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">الباص الفعلي للصعود</span>
                        <span className="font-bold text-emerald-300 block mt-0.5">
                          {lastScanResult.actualBus
                            ? lastScanResult.actualBus.name
                            : lastScanResult.bus
                            ? lastScanResult.bus.name
                            : 'بدون باص'}
                        </span>
                      </div>
                      {canViewPaymentDetails && (
                        <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">حالة الدفع</span>
                          <span className="font-bold text-emerald-300 block mt-0.5">
                            {(PAYMENT_STATUS_LABELS[lastScanResult.registration.paymentStatus] || PAYMENT_STATUS_LABELS.unpaid).label}{' '}
                            ({lastScanResult.registration.totalPaidAmount} ج.م)
                          </span>
                        </div>
                      )}
                      {lastScanResult.attendance && (
                        <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-center">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            وقت التحضير:
                          </span>
                          <span className="font-mono font-bold text-white mt-0.5">
                            {new Date(lastScanResult.attendance.checkInTime).toLocaleTimeString(
                              'ar-EG',
                              { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Check-In & Registered Roster Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-sky-400" />
              <span>كشف التحضير اليدوي السريع وحركة الباصات (Manual Check-In)</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              ابحث عن العضو المسجل بالاسم أو الهاتف أو الكود واضغط على «تحضير يدوي» لتسجيل صعوده في{' '}
              <strong className="text-emerald-300">
                {selectedScannerBus ? selectedScannerBus.name : 'الباص المحدد'}
              </strong>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={rosterBusFilter}
              onChange={(e) => setRosterBusFilter(e.target.value)}
              disabled={isBusAttendanceOnly && visibleBuses.length === 1}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-80"
            >
              {!isBusAttendanceOnly && (
                <option value="ALL">عرض كل الباصات ({activeRegistrations.length})</option>
              )}
              {visibleBuses.map((b) => (
                <option key={b.id} value={b.id}>
                  ركاب {b.name}
                </option>
              ))}
              {!isBusAttendanceOnly && <option value="UNASSIGNED">غير مسكنين في باص</option>}
            </select>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setAttendanceFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  attendanceFilter === 'all'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({stats.total})
              </button>
              <button
                onClick={() => setAttendanceFilter('present')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  attendanceFilter === 'present'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                حضر ({stats.present})
              </button>
              <button
                onClick={() => setAttendanceFilter('absent')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  attendanceFilter === 'absent'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                لم يحضر ({stats.absent})
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="بحث بالاسم، الهاتف، أو الكود..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3 font-semibold">#</th>
                <th className="py-3 px-3 font-semibold">العضو المسجل</th>
                <th className="py-3 px-3 font-semibold">الباص الموزع مسبقاً</th>
                <th className="py-3 px-3 font-semibold">الباص الفعلي للصعود</th>
                {canViewPaymentDetails && <th className="py-3 px-3 font-semibold">الماليات</th>}
                <th className="py-3 px-3 font-semibold">حالة الحضور</th>
                {canScanAttendance && (
                  <th className="py-3 px-3 font-semibold text-center">إجراء التحضير</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    لا توجد سجلات مطابقة لمعايير البحث الحالية.
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((reg, index) => {
                  const payBadge = PAYMENT_STATUS_LABELS[reg.paymentStatus] || PAYMENT_STATUS_LABELS.unpaid;
                  const isPresent = Boolean(reg.attendance);
                  const actualBusId = reg.actualBusId || reg.attendance?.actualBusId || reg.assignedBusId;
                  const actualBus = actualBusId ? busesMap.get(actualBusId) || null : null;
                  const busDiffers = Boolean(
                    isPresent &&
                      reg.assignedBusId &&
                      actualBusId &&
                      reg.assignedBusId !== actualBusId
                  );

                  return (
                    <tr key={reg.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono text-slate-400">{index + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
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
                      <td className="py-3 px-3">
                        {reg.bus ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
                            <Bus className="w-3.5 h-3.5" />
                            {reg.bus.name}
                          </span>
                        ) : (
                          <span className="text-slate-500">غير مسكن</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isPresent ? (
                          actualBus ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold border ${
                                  busDiffers
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                <Bus className="w-3.5 h-3.5" />
                                {actualBus.name}
                              </span>
                              {busDiffers && reg.bus && (
                                <span className="block text-[10px] text-amber-300 font-bold">
                                  ⚠️ من {reg.bus.name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-400 font-bold">حضر بدون باص</span>
                          )
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      {canViewPaymentDetails && (
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] border ${payBadge.className}`}
                          >
                            {payBadge.label}
                          </span>
                          <span className="block font-mono text-[11px] text-slate-400 mt-0.5">
                            مدفوع: {reg.totalPaidAmount} / {reg.finalRequiredAmount} ج.م
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-3">
                        {isPresent && reg.attendance ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              حضر ({reg.attendance.method === 'qr' ? 'QR' : 'يدوي'})
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(reg.attendance.checkInTime).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              • بواسطة {reg.attendance.checkedInByName}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400">
                            <UserX className="w-3.5 h-3.5" />
                            لم يحضر
                          </span>
                        )}
                      </td>
                      {canScanAttendance && (
                        <td className="py-3 px-3 text-center">
                          {isPresent ? (
                            <button
                              onClick={() => handleRevokeCheckIn(reg)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 text-xs font-bold transition cursor-pointer"
                              title="إلغاء التحضير"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>إلغاء التحضير</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleManualCheckIn(reg)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>
                                تحضير في {selectedScannerBus ? selectedScannerBus.name : reg.bus?.name || 'الفعالية'}
                              </span>
                            </button>
                          )}
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
    </div>
  );
};
