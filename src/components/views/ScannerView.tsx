import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Registrant, AttendanceRecord, UserRole } from '../../types';
import { storageService, playAttendanceBeep, getFridaysForMonth } from '../../services/storageService';
import { 
  Camera, 
  CameraOff, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  Clock, 
  User, 
  Keyboard, 
  Sparkles,
  Calendar,
  X,
  Trash2
} from 'lucide-react';

interface ScannerViewProps {
  registrants: Registrant[];
  sessionToken: string;
  onRefreshToken: () => void;
  tokenExpiresAt: number;
  currentUserRole?: UserRole;
  currentUserName?: string;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  registrants,
  sessionToken,
  onRefreshToken,
  tokenExpiresAt,
  currentUserRole = 'community_owner',
  currentUserName = 'المسؤول',
}) => {
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Dynamic Month Fridays for current month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  const monthFridays = getFridaysForMonth(currentYear, currentMonthIndex);
  const cairoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const todayStr = `${cairoNow.getFullYear()}-${String(cairoNow.getMonth() + 1).padStart(2, '0')}-${String(cairoNow.getDate()).padStart(2, '0')}`;
  
  // Default to today if today is one of month fridays, or first/closest friday
  const defaultFriday = monthFridays.find(f => f.dateStr === todayStr) || monthFridays[0];
  const [selectedFridayDate, setSelectedFridayDate] = useState<string>(defaultFriday?.dateStr || todayStr);
  
  // Last scanned scan result modal
  const [lastScannedResult, setLastScannedResult] = useState<{
    registrant: Registrant;
    isDuplicate: boolean;
    timestamp: string;
    totalCount?: number;
    date?: string;
  } | null>(null);

  // Manual code entry
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [scanNoticeError, setScanNoticeError] = useState<string | null>(null);
  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    member: Registrant;
    time: string;
  } | null>(null);

  // Attendance Gift Completion Grand Celebration Modal
  const [giftCelebrationModal, setGiftCelebrationModal] = useState<{
    registrant: Registrant;
    totalFridays: number;
  } | null>(null);

  // ==========================================
  // ATTENDANCE SESSION DURATION CONTROLLER (التحكم في مدة جلسة الحضور بالتايمر)
  // Requirement: "في الماسح الضوئي خلي ابدأ جلسة اخد الحضور هي من صلاحية المسوؤلين الكبار فقط وخلي الزرار ده ما يكون ظاهر الا للمسوؤلين الكبار فقط ولما ابدا الجلسة بواسطة المسوؤلين الكبار الخطأ ده ما يظهر ليهم"
  // ==========================================
  const isSeniorAdmin = currentUserRole === 'community_owner' || 
    currentUserRole === 'community_manager' || 
    currentUserRole === 'priest' || 
    currentUserRole === 'meeting_secretary' || 
    currentUserRole === 'service_secretary';

  const initialSession = storageService.getAttendanceSession();
  const [sessionMinutes, setSessionMinutes] = useState<number>(initialSession.durationMinutes || 60);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(initialSession.isActive);
  const [sessionEndTime, setSessionEndTime] = useState<number | null>(initialSession.isActive ? initialSession.endTime : null);
  const [sessionRemainingFormatted, setSessionRemainingFormatted] = useState<string>('00:00:00');
  const [unauthorizedAlert, setUnauthorizedAlert] = useState<string | null>(null);

  const [attendanceTick, setAttendanceTick] = useState(0);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  // Sync with storageService for attendance session updates and live attendance records
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setAttendanceTick(t => t + 1);
      const sess = storageService.getAttendanceSession();
      if (sess.isActive && sess.endTime > Date.now()) {
        setIsSessionActive(true);
        setSessionEndTime(sess.endTime);
        setSessionMinutes(sess.durationMinutes);
      } else if (!sess.isActive) {
        setIsSessionActive(false);
        setSessionEndTime(null);
      }
    });
    return unsub;
  }, []);

  // Today's attended members list sorted descending (newest to oldest)
  const todayAttendedRecords = useMemo(() => {
    const allRecords = storageService.getAttendanceRecords();
    const forDay = allRecords.filter(r => r.date === selectedFridayDate);
    // Sort descending by timestamp (newest first)
    return [...forDay].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedFridayDate, attendanceTick, lastScannedResult]);

  // Session Duration Countdown Timer
  useEffect(() => {
    if (!isSessionActive || !sessionEndTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = sessionEndTime - now;

      if (diff <= 0) {
        setIsSessionActive(false);
        setSessionEndTime(null);
        setSessionRemainingFormatted('انتهت الجلسة');
        storageService.setAttendanceSession({
          isActive: false,
          endTime: 0,
          durationMinutes: sessionMinutes
        });
        setUnauthorizedAlert('⚠️ انتهت مدة جلسة أخذ الحضور المحددة. الكاميرا متوقفة تلقائياً وعادت الحالة لـ "بانتظار بدء الجلسة".');
        stopScanner();
      } else {
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setSessionRemainingFormatted(
          `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, sessionEndTime, sessionMinutes]);

  // Handler to start the attendance session with full minutes flexibility (Exclusive to Senior Admins)
  const handleStartAttendanceSession = () => {
    if (!isSeniorAdmin) {
      setUnauthorizedAlert('⚠️ وصول غير مصرح به: بدء جلسة أخذ الحضور وتحديد مدتها من صلاحيات المسؤولين الكبار فقط (أمين الاجتماع، أمين الخدمة، كاهن الاجتماع، إدارة المجتمع)!');
      return;
    }

    const totalMinutes = Math.max(1, Number(sessionMinutes) || 1);
    const end = Date.now() + totalMinutes * 60 * 1000;
    setSessionEndTime(end);
    setIsSessionActive(true);
    setUnauthorizedAlert(null);
    setScanNoticeError(null);

    storageService.setAttendanceSession({
      isActive: true,
      endTime: end,
      durationMinutes: totalMinutes,
      startedBy: currentUserName || 'المسؤول',
      startedAt: new Date().toISOString()
    });

    // Automatically initiate camera with authorization flag
    setTimeout(() => {
      startScanner(true);
    }, 150);
  };

  // Handler to terminate the attendance session
  const handleEndAttendanceSession = () => {
    if (!isSeniorAdmin) {
      setUnauthorizedAlert('⚠️ وصول غير مصرح به: إنهاء جلسة أخذ الحضور من صلاحيات المسؤولين الكبار فقط!');
      return;
    }
    setIsSessionActive(false);
    setSessionEndTime(null);
    storageService.setAttendanceSession({
      isActive: false,
      endTime: 0,
      durationMinutes: sessionMinutes
    });
    stopScanner();
    setUnauthorizedAlert(null);
  };

  // Load cameras on mount
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length) {
          setCameras(devices);
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          setCameraError('لم يتم العثور على كاميرات متصلة بالجهاز.');
        }
      })
      .catch((err) => {
        console.warn('Could not enumerate cameras:', err);
      });

    return () => {
      stopScanner();
    };
  }, []);

  // Stop scanner utility
  const stopScanner = async () => {
    if (html5QrCodeRef.current && isScanningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        isScanningRef.current = false;
        setScannerActive(false);
      }
    }
  };

  // Start scanner (Enforces session start requirement)
  const startScanner = async (isAuthorizedStart = false) => {
    const isNowActive = isAuthorizedStart || isSessionActive || (sessionEndTime !== null && sessionEndTime > Date.now());

    if (!isNowActive) {
      if (isSeniorAdmin) {
        // Senior admin: start session seamlessly without showing unauthorized alert
        handleStartAttendanceSession();
        return;
      } else {
        setUnauthorizedAlert('⚠️ وصول غير مصرح به: لا يمكن تشغيل الكاميرا قبل بدء جلسة أخذ الحضور من قِبل المسؤولين الكبار!');
        return;
      }
    }

    setCameraError(null);
    setUnauthorizedAlert(null);

    try {
      const qrRegionId = 'qr-reader';
      const element = document.getElementById(qrRegionId);
      if (!element) return;

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(qrRegionId);
      }

      const cameraIdOrConfig = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: 'environment' };

      await html5QrCodeRef.current.start(
        cameraIdOrConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // ignore scan frame errors
        }
      );

      isScanningRef.current = true;
      setScannerActive(true);
    } catch (err: unknown) {
      console.error('Error starting html5-qrcode:', err);
      setCameraError('تعذر الوصول للكاميرا. يرجى التأكد من منح الإذن لاستخدام الكاميرا، أو استخدام الإدخال اليدوي أدناه.');
      setScannerActive(false);
    }
  };

  // Scan Success Processing
  const handleScanSuccess = (rawCode: string) => {
    const isNowActive = isSessionActive || (sessionEndTime !== null && sessionEndTime > Date.now());
    if (!isNowActive) {
      setUnauthorizedAlert('⚠️ وصول غير مصرح به: لا يمكن أخذ الحضور بالكاميرا قبل بدء جلسة الحضور بالتايمر بواسطة المسؤولين الكبار!');
      stopScanner();
      return;
    }

    const cleanCode = rawCode.trim();
    
    // Look up attendee by unique code or ID
    const registrant = registrants.find(
      r => r.uniqueCode.toLowerCase() === cleanCode.toLowerCase() || r.id === cleanCode
    );

    if (registrant) {
      // Clear previous error
      setScanNoticeError(null);

      // Play audio chime
      playAttendanceBeep();

      // Record attendance
      const { isDuplicate, totalCount } = storageService.recordAttendance(registrant, 'camera_scan', selectedFridayDate);

      const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setLastScannedResult({
        registrant,
        isDuplicate,
        timestamp: timeStr,
        totalCount,
        date: selectedFridayDate
      });

      if (isDuplicate) {
        setDuplicateWarningModal({
          member: registrant,
          time: timeStr
        });
      } else {
        // Check if this attendance completes all Fridays of the month for gifts
        const monthly = storageService.getMemberMonthlyAttendance(registrant.id, currentYear, currentMonthIndex);
        if (monthly.isCompletedAllFridays) {
          setGiftCelebrationModal({
            registrant,
            totalFridays: monthly.totalFridaysCount
          });
        }
      }

      // Temporarily pause scanner for 2 seconds to prevent rapid multiple reads
      if (html5QrCodeRef.current && isScanningRef.current) {
        html5QrCodeRef.current.pause();
        setTimeout(() => {
          if (html5QrCodeRef.current && isScanningRef.current) {
            html5QrCodeRef.current.resume();
          }
        }, 2500);
      }
    } else {
      // Unknown code without using window.alert
      setScanNoticeError(`الرمز المقروء (${cleanCode}) غير مسجل في قاعدة بيانات الاجتماع!`);
    }
  };

  // Quick attendance trigger for testing
  const handleQuickAttendance = (registrant: Registrant) => {
    const isNowActive = isSessionActive || (sessionEndTime !== null && sessionEndTime > Date.now());
    if (!isNowActive) {
      if (isSeniorAdmin) {
        handleStartAttendanceSession();
      } else {
        setUnauthorizedAlert('⚠️ وصول غير مصرح به: يجب أولاً بدء جلسة أخذ الحضور بواسطة المسؤولين الكبار لتسجيل الحضور!');
        return;
      }
    }
    playAttendanceBeep();
    const { isDuplicate, totalCount } = storageService.recordAttendance(registrant, 'manual', selectedFridayDate);
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setLastScannedResult({
      registrant,
      isDuplicate,
      timestamp: timeStr,
      totalCount,
      date: selectedFridayDate
    });

    if (isDuplicate) {
      setDuplicateWarningModal({
        member: registrant,
        time: timeStr
      });
    } else {
      const monthly = storageService.getMemberMonthlyAttendance(registrant.id, currentYear, currentMonthIndex);
      if (monthly.isCompletedAllFridays) {
        setGiftCelebrationModal({
          registrant,
          totalFridays: monthly.totalFridaysCount
        });
      }
    }
  };

  // Manual code submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setScanNoticeError(null);

    const isNowActive = isSessionActive || (sessionEndTime !== null && sessionEndTime > Date.now());
    if (!isNowActive) {
      if (isSeniorAdmin) {
        handleStartAttendanceSession();
      } else {
        setUnauthorizedAlert('⚠️ وصول غير مصرح به: لا يمكن إدخال الحضور قبل بدء جلسة أخذ الحضور بواسطة المسؤولين الكبار!');
        return;
      }
    }

    const code = manualCode.trim();
    if (!code) return;

    const registrant = registrants.find(
      r => r.uniqueCode.toLowerCase() === code.toLowerCase() || r.id === code
    );

    if (registrant) {
      playAttendanceBeep();
      const { isDuplicate, totalCount } = storageService.recordAttendance(registrant, 'manual', selectedFridayDate);
      const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setLastScannedResult({
        registrant,
        isDuplicate,
        timestamp: timeStr,
        totalCount,
        date: selectedFridayDate
      });

      if (isDuplicate) {
        setDuplicateWarningModal({
          member: registrant,
          time: timeStr
        });
      } else {
        const monthly = storageService.getMemberMonthlyAttendance(registrant.id, currentYear, currentMonthIndex);
        if (monthly.isCompletedAllFridays) {
          setGiftCelebrationModal({
            registrant,
            totalFridays: monthly.totalFridaysCount
          });
        }
      }

      setManualCode('');
    } else {
      setManualError(`لم يتم العثور على عضو مسجل بالكود: ${code}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ========================================================
          ATTENDANCE SESSION DURATION CONTROLLER (التحكم في مدة جلسة أخذ الحضور)
          Requirement: الغي المربع الفيو جلسة ماسح ضوئي مؤمنة برمز متغير ومتبقى كذا وتجديد الرمز وخلي في خيار ان اختار مده الوقت بعدد الدقايق في اريحية كاملة في تحديد مده الجلسة ولما الجلسة تبدا المربع الفيو (بانتظار بدء الجلسة) يبقا (جلسة نشطة) باللون الاخضر ولما تنتهي يرجع (بانتظار بدء الجلسة)
          ======================================================== */}
      <div className={`rounded-3xl p-5 border-2 shadow-sm space-y-4 transition-all ${
        isSessionActive 
          ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-white border-emerald-400' 
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-xs transition-all ${
              isSessionActive 
                ? 'bg-emerald-600 text-white animate-pulse shadow-emerald-500/30 shadow-md' 
                : 'bg-slate-100 text-slate-700'
            }`}>
              {isSessionActive ? '⏱️' : '⏳'}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  التحكم في مدة جلسة أخذ الحضور
                </h3>

                {/* Status Box: (بانتظار بدء الجلسة) / (جلسة نشطة) باللون الأخضر */}
                {isSessionActive ? (
                  <span className="text-xs font-black bg-emerald-600 text-white px-3.5 py-1 rounded-full border-2 border-emerald-400 flex items-center gap-1.5 shadow-md animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
                    <span>(جلسة نشطة) 🟢</span>
                  </span>
                ) : (
                  <span className="text-xs font-black bg-amber-100 text-amber-900 px-3 py-1 rounded-full border border-amber-300 flex items-center gap-1 shadow-2xs">
                    <span>🔒 (بانتظار بدء الجلسة)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isSessionActive 
                  ? 'الجلسة نشطة ومصرح بها حالياً باللون الأخضر. الكاميرا تعمل وتقبل مسح الحضور.'
                  : 'حدد مدة الجلسة بعدد الدقائق بأريحية كاملة، ثم اضغط "ابدأ جلسة أخذ الحضور" لتفعيل الكاميرا وقبول الحضور.'
                }
              </p>
            </div>
          </div>

          {/* Active Session Countdown and End Button */}
          {isSessionActive && (
            <div className="flex items-center gap-2">
              <div className="bg-slate-900 text-emerald-400 font-mono text-base sm:text-lg font-black px-4 py-2 rounded-2xl border border-emerald-500/40 shadow-inner flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400 animate-spin" />
                <span dir="ltr">{sessionRemainingFormatted}</span>
              </div>
              {isSeniorAdmin && (
                <button
                  type="button"
                  onClick={handleEndAttendanceSession}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs transition shadow-xs cursor-pointer active:scale-95"
                  title="إنهاء الجلسة وإعادة الكاميرا لحالة الانتظار"
                >
                  إنهاء الجلسة ⏹️
                </button>
              )}
            </div>
          )}
        </div>

        {/* If Senior Admin: Full Duration Controller and Start Button.
            If Normal Servant: Informative status banner only (Duration settings and Start Button are hidden!) */}
        {isSeniorAdmin ? (
          !isSessionActive ? (
            <div className="space-y-4 pt-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
                <div className="flex-1">
                  <label className="text-xs sm:text-sm font-black text-slate-800 block mb-1">
                    ⏱️ تحديد مدة الجلسة بعدد الدقائق (أريحية كاملة في تحديد أي مدة):
                  </label>
                  <p className="text-xs text-slate-500">
                    صلاحية خاصة بالمسؤولين الكبار: حدد مدة الجلسة بعدد الدقائق ثم انقر "ابدأ جلسة أخذ الحضور".
                  </p>
                </div>

                {/* Direct Minutes Input with Steppers */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSessionMinutes(prev => Math.max(1, prev - 5))}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-black text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                    title="إنقاص 5 دقائق"
                  >
                    -5
                  </button>
                  
                  <div className="flex items-center gap-1.5 bg-white border-2 border-indigo-400 rounded-xl px-2.5 py-1 shadow-inner focus-within:border-emerald-500">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={sessionMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSessionMinutes(isNaN(val) ? 1 : Math.max(1, Math.min(1440, val)));
                      }}
                      className="w-16 sm:w-20 text-center text-lg sm:text-xl font-black text-slate-900 bg-transparent focus:outline-hidden"
                    />
                    <span className="text-xs font-bold text-slate-600">دقيقة</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSessionMinutes(prev => Math.min(1440, prev + 5))}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-black text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                    title="زيادة 5 دقائق"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionMinutes(prev => Math.min(1440, prev + 15))}
                    className="w-11 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-black text-xs flex items-center justify-center transition cursor-pointer shadow-2xs"
                    title="زيادة 15 دقيقة"
                  >
                    +15
                  </button>
                </div>
              </div>

              {/* Quick Presets & Start Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold ml-1">أوقات جاهزة:</span>
                  {[15, 30, 45, 60, 90, 120, 180].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSessionMinutes(m)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        sessionMinutes === m
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {m < 60 ? `${m} دقيقة` : m === 60 ? 'ساعة (60 د)' : m === 120 ? 'ساعتان (120 د)' : `${m / 60} ساعات (${m} د)`}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleStartAttendanceSession}
                  className="py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer active:scale-95 shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>ابدأ جلسة أخذ الحضور ⏱️</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-3.5 flex items-center justify-between text-xs sm:text-sm text-emerald-950 font-bold">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>جلسة أخذ الحضور مصرح بها ونشطة الآن باللون الأخضر. الكاميرا تقبل الحضور حتى انتهاء الوقت.</span>
              </span>
              <span className="font-mono text-emerald-800 bg-white px-3 py-1 rounded-xl border border-emerald-300 shadow-2xs font-black">
                المدة: {sessionMinutes} دقيقة
              </span>
            </div>
          )
        ) : (
          /* Normal Servant View */
          isSessionActive ? (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-emerald-950 font-bold">
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>جلسة أخذ الحضور نشطة ✅ الكاميرا جاهزة لأخذ الحضور.</span>
              </span>
              <span className="font-mono text-emerald-800 bg-white px-3 py-1 rounded-xl border border-emerald-300 shadow-2xs font-black shrink-0">
                المتبقي: {sessionRemainingFormatted}
              </span>
            </div>
          ) : (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 font-bold">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-black text-sm text-amber-900">
                    (بانتظار بدء الجلسة)
                  </p>
                  <p className="text-xs text-amber-800 font-normal mt-0.5">
                    ستتفعل الكاميرا للمسح تلقائياً فور بدء الجلسة.
                  </p>
                </div>
              </div>
              <span className="text-[11px] bg-amber-100 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-300 shrink-0 font-bold">
                في انتظار الإشارة ⏳
              </span>
            </div>
          )
        )}

        {/* Unauthorized Alert Banner */}
        {unauthorizedAlert && (
          <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 text-xs font-bold text-red-950 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="leading-relaxed">{unauthorizedAlert}</span>
            </div>
            <button
              type="button"
              onClick={() => setUnauthorizedAlert(null)}
              className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-[11px] shrink-0 font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>

      {/* Friday Attendance Target Session Selector */}
      <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold shrink-0">
            <Calendar className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900">
              جلسة الحضور والختم ({monthFridays.length} جمعات لهذا الشهر):
            </h4>
            <p className="text-[11px] text-slate-500">
              حدد موعد الجمعة المستهدفة لمسح الحضور أو تسجيل الأختام:
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {monthFridays.map((f) => {
            const isSelected = selectedFridayDate === f.dateStr;
            const isToday = f.dateStr === todayStr;
            return (
              <button
                key={f.fridayIndex}
                type="button"
                onClick={() => {
                  setSelectedFridayDate(f.dateStr);
                  setLastScannedResult(null);
                  setScanNoticeError(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
              >
                <span>({f.formattedDate})</span>
                {isToday && <span className="text-[9px] bg-emerald-500 text-white px-1 rounded-sm">اليوم</span>}
                {f.fridayIndex === monthFridays.length && <span>🎁</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Scanner Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Camera View Area */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-5 shadow-xs border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-amber-600" />
                  <span>كاميرا المسح الضوئي المباشر</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  وجّه الكاميرا نحو رمز QR على بطاقة هوية الشاب لتسجيل حضوره فوراً.
                </p>
              </div>

              {scannerActive ? (
                <button
                  onClick={stopScanner}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <CameraOff className="w-3.5 h-3.5 text-red-500" />
                  <span>إيقاف الكاميرا</span>
                </button>
              ) : (
                <button
                  onClick={() => startScanner()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>تشغيل الكاميرا</span>
                </button>
              )}
            </div>

            {/* Camera Select dropdown if multiple cameras */}
            {cameras.length > 1 && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-slate-500">اختر الكاميرا:</span>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    if (scannerActive) {
                      stopScanner().then(() => setTimeout(() => startScanner(), 200));
                    }
                  }}
                  className="rounded-lg border border-slate-300 py-1 px-2.5 text-xs bg-white text-slate-800"
                >
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || `كاميرا ${cam.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Camera Frame Container */}
            <div className="mt-4 flex-1 flex flex-col items-center justify-center min-h-[320px] bg-slate-900 rounded-2xl relative overflow-hidden border-2 border-slate-800">
              
              <div id="qr-reader" className="w-full h-full max-w-[420px] text-white"></div>

              {!scannerActive && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-amber-400">
                    <Camera className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">الكاميرا متوقفة حالياً</h4>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    انقر على زر "تشغيل الكاميرا" للبدء بمسح بطاقات هوية الشباب في الاجتماع.
                  </p>
                  <button
                    onClick={() => startScanner()}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/30 transition flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>تشغيل الكاميرا الآن</span>
                  </button>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-x-4 bottom-4 bg-red-950/90 border border-red-500/60 p-3 rounded-xl text-red-200 text-xs">
                  {cameraError}
                </div>
              )}

              {scanNoticeError && (
                <div className="absolute inset-x-4 top-4 z-20 bg-red-900/95 border border-red-400 p-3 rounded-xl text-white text-xs flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                    <span>{scanNoticeError}</span>
                  </div>
                  <button 
                    onClick={() => setScanNoticeError(null)}
                    className="p-1 text-white/80 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 text-center text-[11px] text-slate-400">
              💡 نصيحة: تأكد من وضوح الإضاءة وتوجيه بطاقة العضو مباشرة أمام العدسة.
            </div>
          </div>

          {/* Right Column: Attendance Result Card & Manual Code Entry */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Scanned Result Banner & Descending Live Attendance Stream */}
            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>نتيجة آخر مسح وسجل الحضور المباشر</span>
                </h3>
                <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {todayAttendedRecords.length} حاضر في هذا التاريخ
                </span>
              </div>

              {/* 1. Highlight Card for Most Recent Scan on this day */}
              {lastScannedResult && (!lastScannedResult.date || lastScannedResult.date === selectedFridayDate) && (
                <div className={`p-4 rounded-2xl border transition-all ${
                  lastScannedResult.isDuplicate 
                    ? 'bg-amber-50/70 border-amber-300' 
                    : 'bg-emerald-50/70 border-emerald-300'
                }`}>
                  <div className="flex items-start gap-3.5">
                    <div className="w-14 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 shadow-xs flex items-center justify-center">
                      {lastScannedResult.registrant.photoUrl && lastScannedResult.registrant.photoUrl.trim() !== '' ? (
                        <img 
                          src={lastScannedResult.registrant.photoUrl} 
                          alt={lastScannedResult.registrant.fullName} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <span className="text-lg font-bold text-slate-400">{(lastScannedResult.registrant.fullName || '?').charAt(0)}</span>
                      )}
                    </div>

                    <div className="flex-1 text-right">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          lastScannedResult.isDuplicate 
                            ? 'bg-amber-200 text-amber-950 border border-amber-300' 
                            : 'bg-emerald-200 text-emerald-900'
                        }`}>
                          {lastScannedResult.isDuplicate ? '⚠️ تم التسجيل مسبقا' : 'تم تسجيل الحضور بنجاح ✅'}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {lastScannedResult.timestamp}
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold text-slate-900 mt-1">
                        {lastScannedResult.registrant.fullName}
                      </h4>

                      <div className="text-xs text-slate-600 mt-1 flex items-center justify-between flex-wrap gap-1">
                        <span>الكود: <strong className="font-mono text-emerald-900">{lastScannedResult.registrant.uniqueCode}</strong></span>
                        {lastScannedResult.totalCount !== undefined && (
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                            {lastScannedResult.totalCount >= monthFridays.length 
                              ? `🎉 أكمل كافة جمعات الشهر (${monthFridays.length}/${monthFridays.length}) - يستحق هدية الحضور 🎁` 
                              : `🎁 خُتم الحضور بنجاح`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. All Attended Members Today - Sorted Descending from Newest to Oldest */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>جميع الأسماء المأخوذ لها حضور لهذا التاريخ ({todayAttendedRecords.length} مخدوم):</span>
                  </h4>
                  {todayAttendedRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        todayAttendedRecords.forEach(r => storageService.deleteAttendanceRecord(r.id));
                        setLastScannedResult(null);
                        setAttendanceTick(t => t + 1);
                      }}
                      className="text-[10px] text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-lg border border-red-200 font-bold transition flex items-center gap-1 cursor-pointer"
                      title="حذف كافة سجلات هذا اليوم"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>إفراغ الحضور لهذا اليوم</span>
                    </button>
                  )}
                </div>

                {todayAttendedRecords.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <User className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">في انتظار مسح أي بطاقة عضوية لهذا التاريخ...</p>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                    {todayAttendedRecords.map((record: AttendanceRecord, index: number) => {
                      const member = registrants.find(r => r.id === record.registrantId);
                      const timeStr = new Date(record.timestamp).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      });
                      const isFirst = index === 0;

                      return (
                        <div
                          key={record.id}
                          className={`pt-2 pb-1.5 flex items-center justify-between gap-3 rounded-xl px-2 transition ${
                            isFirst ? 'bg-emerald-50/70 border border-emerald-200' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[10px] font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              isFirst ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              #{index + 1}
                            </span>
                            <div className="w-8 h-9 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {member?.photoUrl && member.photoUrl.trim() !== '' ? (
                                <img
                                  src={member.photoUrl}
                                  alt={record.registrantName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">
                                  {(record.registrantName || '?').charAt(0)}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-extrabold text-slate-900">
                                  {record.registrantName}
                                </span>
                                {isFirst && (
                                  <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                                    الأحدث ✨
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                <span>{member?.uniqueCode || '—'}</span>
                                <span>•</span>
                                <span>{record.method === 'camera_scan' ? '📷 كاميرا' : '✍️ يدوي'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-left">
                              <span className="text-[10px] font-mono font-bold text-slate-600 block" dir="ltr">
                                {timeStr}
                              </span>
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full inline-block mt-0.5">
                                حاضر ✅
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                storageService.deleteAttendanceRecord(record.id);
                                if (lastScannedResult?.registrant?.id === record.registrantId) {
                                  setLastScannedResult(null);
                                }
                                setAttendanceTick(t => t + 1);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                              title="حذف هذا الحضور"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Manual Code Input Option */}
            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-amber-600" />
                <span>تسجيل حضور يدوي (بالكود)</span>
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                إذا تعذر استخدام الكاميرا، أدخل كود العضو مباشرة (مثل: TY-1011):
              </p>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="TY-1011"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 font-mono uppercase text-center rounded-xl border border-slate-300 py-2.5 px-3 text-sm focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
                  >
                    تسجيل الحضور
                  </button>
                </div>

                {manualError && (
                  <p className="text-xs text-red-600 font-medium">{manualError}</p>
                )}
              </form>

              {/* Quick test buttons for registered attendees */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 block mb-2 font-medium">
                  أزرار سريعة لتجربة وتسجيل الحضور بنقرة واحدة:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {registrants.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleQuickAttendance(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-mono border border-amber-200 transition font-bold flex items-center gap-1 shadow-2xs"
                      title={`تسجيل حضور ${r.fullName} للجلسة المحددة`}
                    >
                      <span>{r.fullName.split(' ')[0]}</span>
                      <span className="text-[10px] text-amber-700">({r.uniqueCode})</span>
                      <span className="text-[10px] text-emerald-600">✓</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>

      {/* ========================================================
          DUPLICATE ATTENDANCE POPUP ("تم التسجيل مسبقا")
          Requirement: "لو في شخص اخدنا ليو حضور مسبقا وجينا عملنا اسكان لل كود بتاعه تظهر رساله تم التسجيل مسبقا"
          ======================================================== */}
      {duplicateWarningModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-amber-300 text-center space-y-4">
            
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center border border-amber-200 shadow-xs">
              <AlertTriangle className="w-9 h-9 text-amber-600 animate-bounce" />
            </div>

            <div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                تنبيه الحضور المتكرر
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-2">
                تم التسجيل مسبقاً!
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                هذا الشخص تم تسجيل حضوره بالفعل اليوم في اجتماع الثلاثة فتية.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-right flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-300 flex items-center justify-center">
                {duplicateWarningModal.member.photoUrl && duplicateWarningModal.member.photoUrl.trim() !== '' ? (
                  <img 
                    src={duplicateWarningModal.member.photoUrl} 
                    alt={duplicateWarningModal.member.fullName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <span className="text-base font-bold text-slate-400">{(duplicateWarningModal.member.fullName || '?').charAt(0)}</span>
                )}
              </div>
              <div className="truncate">
                <h4 className="text-sm font-black text-slate-900 truncate">
                  {duplicateWarningModal.member.fullName}
                </h4>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  كود العضوية: {duplicateWarningModal.member.uniqueCode}
                </div>
                <div className="text-[10px] text-amber-800 font-bold mt-0.5">
                  مسجل في السجل اليوم ✓
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDuplicateWarningModal(null)}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition"
            >
              حسناً، فهمت
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          GRAND CELEBRATION MODAL FOR ATTENDANCE GIFTS
          "فرحنا بانتظامك معانا ونتمنى نشوفك دايما معانا و بخير"
          ======================================================== */}
      {giftCelebrationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-gradient-to-b from-amber-50 via-white to-amber-50/50 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-amber-300 text-center space-y-4 my-auto relative overflow-hidden">
            
            {/* Top Glowing Ribbon */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-amber-500/30 text-3xl animate-bounce">
              🎁
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black border border-amber-300 shadow-2xs">
                <span>🌟 هَدَايَا الْحُضُورِ الشَّهْرِيَّة 🌟</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                مَبْرُوكْ! أَتْمَمْتَ كَافَّةَ جُمُعَاتِ الشَّهْرِ!
              </h3>
              
              <div className="mt-2 p-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm shadow-md">
                «فَرِحْنَا بِانْتِظَامِكَ مَعَانَا وَنَتَمَنَّى نَشُوفَكَ دَايْمًا مَعَانَا وَبِخَيْر!» 🕊️❤️✨
              </div>
            </div>

            {/* Attendee Profile Snippet */}
            <div className="p-3.5 rounded-2xl bg-white border border-amber-200 text-right flex items-center gap-3 shadow-xs">
              <div className="w-14 h-16 rounded-2xl overflow-hidden shrink-0 border-2 border-amber-300 shadow-xs flex items-center justify-center bg-slate-100">
                {giftCelebrationModal.registrant.photoUrl && giftCelebrationModal.registrant.photoUrl.trim() !== '' ? (
                  <img 
                    src={giftCelebrationModal.registrant.photoUrl} 
                    alt={giftCelebrationModal.registrant.fullName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <span className="text-xl font-bold text-amber-700">{(giftCelebrationModal.registrant.fullName || '?').charAt(0)}</span>
                )}
              </div>
              <div className="truncate flex-1">
                <h4 className="text-base font-black text-slate-900 truncate">
                  {giftCelebrationModal.registrant.fullName}
                </h4>
                <div className="text-xs text-amber-700 font-mono font-bold mt-0.5">
                  كود العضوية: {giftCelebrationModal.registrant.uniqueCode}
                </div>
                <div className="text-[11px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
                  <span>✓ تم تسجيلك تلقائياً في قائمة هدايا الحضور</span>
                </div>
              </div>
            </div>

            {/* Bible Verses with Arabic Tashkeel */}
            <div className="bg-amber-100/60 p-4 rounded-2xl border border-amber-200/90 text-right space-y-2.5 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-bold text-amber-950 block border-b border-amber-200/80 pb-1">
                📖 آيَاتٌ مُبَارَكَةٌ مِنَ الْكِتَابِ الْمُقَدَّسِ:
              </span>

              <div className="text-xs text-amber-950/90 font-medium leading-relaxed space-y-2 font-['Cairo',sans-serif]">
                <p>
                  <strong>مزمور 122:1 :</strong> «فَرِحْتُ بِالْقَائِلِينَ لِي: إِلَى بَيْتِ الرَّبِّ نَذْهَبُ.»
                </p>
                <p>
                  <strong>مزمور 84:1-4 :</strong> «مَا أَحْلَى مَسَاكِنَكَ يَا رَبَّ الْجُنُودِ! تَشْتَاقُ بَلْ تَتُوقُ نَفْسِي إِلَى دِيَارِ الرَّبِّ... طُوبَى لِلسَّاكِنِينَ فِي بَيْتِكَ، أَبَدًا يُسَبِّحُونَكَ.»
                </p>
                <p>
                  <strong>متى 25:21 :</strong> «نِعِمَّا أَيُّهَا الْعَبْدُ الصَّالِحُ وَالأَمِينُ! كُنْتَ أَمِينًا فِي الْقَلِيلِ فَأُقِيمُكَ عَلَى الْكَثِيرِ. اُدْخُلْ إِلَى فَرَحِ سَيِّدِكَ.»
                </p>
                <p>
                  <strong>راعوث 2:12 :</strong> «لِيُكَافِئِ الرَّبُّ عَمَلَكِ، وَلْيَكُنْ أَجْرُكِ كَامِلاً مِنْ عِنْدِ الرَّبِّ إِلَهِ إِسْرَائِيلَ الَّذِي جِئْتِ لِتَحْتَمِي تَحْتَ جَنَاحَيْهِ.»
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setGiftCelebrationModal(null)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-sm shadow-lg shadow-amber-600/30 transition flex items-center justify-center gap-2"
            >
              <span>آمين، شكراً لكم! استلم هديتك 🎁</span>
            </button>

          </div>
        </div>
      )}

    </div>
  );
};
