import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { storageService } from '../services/storageService';
import { Registrant } from '../types';
import { 
  User, 
  Lock, 
  Sparkles, 
  ArrowLeft, 
  AlertCircle, 
  ShieldCheck, 
  UserPlus, 
  KeyRound,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  ArrowRight,
  ExternalLink,
  RotateCcw
} from 'lucide-react';

interface MemberLoginProps {
  onLoginSuccess: (member: Registrant) => void;
  onGoToRegister: () => void;
  onOpenAdminLogin?: () => void;
  pendingQuizId?: string | null;
}

export const MemberLogin: React.FC<MemberLoginProps> = ({
  onLoginSuccess,
  onGoToRegister,
  onOpenAdminLogin,
  pendingQuizId,
}) => {
  // Remembered Login State (1-Tap Quick Login)
  const [rememberedMember, setRememberedMember] = useState<Registrant | null>(() => {
    try {
      const saved = localStorage.getItem('three_youths_last_login');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          const deleted = storageService.getDeletedRegistrantIds();
          if (deleted.has(parsed.id)) {
            storageService.purgeLocalMemberData(parsed.id);
            return null;
          }
          const list = storageService.getRegistrants();
          const fresh = list.find(r => r.id === parsed.id || r.fullName === parsed.fullName);
          if (!fresh || fresh.status === 'cancelled' || fresh.status === 'blocked' || storageService.isUserBlocked(fresh.phone)) {
            storageService.purgeLocalMemberData(parsed.id);
            return null;
          }
          return fresh;
        }
      }
    } catch {}
    return null;
  });

  // Validate remembered member dynamically against central server and keep in sync
  useEffect(() => {
    let isMounted = true;
    const validateRememberedStatus = async () => {
      try {
        const saved = localStorage.getItem('three_youths_last_login');
        if (!saved) {
          if (isMounted) setRememberedMember(null);
          return;
        }
        let parsed: Registrant | null = null;
        try { parsed = JSON.parse(saved); } catch {}
        if (!parsed || !parsed.id) {
          storageService.purgeLocalMemberData();
          if (isMounted) setRememberedMember(null);
          return;
        }

        const deletedIds = storageService.getDeletedRegistrantIds();
        if (deletedIds.has(parsed.id)) {
          storageService.purgeLocalMemberData(parsed.id);
          if (isMounted) setRememberedMember(null);
          return;
        }

        // Live check against central server
        const check = await storageService.verifyMemberStatusOnline(parsed.id);
        if (!check.valid || !check.registrant || check.registrant.status !== 'active') {
          storageService.purgeLocalMemberData(parsed.id);
          if (isMounted) setRememberedMember(null);
          return;
        }

        if (isMounted) {
          setRememberedMember(check.registrant);
          localStorage.setItem('three_youths_last_login', JSON.stringify(check.registrant));
        }
      } catch {
        storageService.purgeLocalMemberData();
        if (isMounted) setRememberedMember(null);
      }
    };

    validateRememberedStatus();
    const unsub = storageService.subscribe(() => {
      validateRememberedStatus();
    });

    // Initial server fetch to catch any recent cancellations or changes
    storageService.fetchLatestServerData().then(() => {
      validateRememberedStatus();
    }).catch(() => {});

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Standard Login State
  const [fullName, setFullName] = useState(() => {
    try {
      const rem = localStorage.getItem('three_youths_remembered_user');
      if (rem) {
        const parsed = JSON.parse(rem);
        return parsed.fullName || parsed.uniqueCode || '';
      }
    } catch {}
    return '';
  });
  const [password, setPassword] = useState(() => {
    try {
      const rem = localStorage.getItem('three_youths_remembered_user');
      if (rem) {
        const parsed = JSON.parse(rem);
        return parsed.password || '';
      }
    } catch {}
    return '';
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Quick 1-Tap Login Handler
  const handleQuickLogin = async () => {
    if (!rememberedMember) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Immediately verify directly against central server before allowing any entry
      const check = await storageService.verifyMemberStatusOnline(rememberedMember.id);

      if (!check.valid || !check.registrant || check.registrant.status !== 'active') {
        storageService.purgeLocalMemberData(rememberedMember.id);
        setRememberedMember(null);
        setError(
          check.reason === 'cancelled' || check.registrant?.status === 'cancelled'
            ? '⚠️ تم إلغاء هذه العضوية من قبل إدارة المجتمع. لا يمكنك الدخول للموقع.'
            : check.reason === 'blocked' || check.registrant?.status === 'blocked' || storageService.isUserBlocked(check.registrant?.phone || '')
            ? '⚠️ هذا الحساب محظور نهائياً من قبل إدارة ومسؤول المجتمع.'
            : '⚠️ بيانات هذه العضوية غير موجودة في قاعدة البيانات المركزية أو تم حذفها نهائياً.'
        );
        setIsLoading(false);
        return;
      }

      if (storageService.isUserBlocked(check.registrant.phone) || storageService.isUserBlocked(check.registrant.fullName)) {
        storageService.purgeLocalMemberData(rememberedMember.id);
        setRememberedMember(null);
        setError('⚠️ هذا الحساب محظور نهائياً من قبل إدارة ومسؤول المجتمع.');
        setIsLoading(false);
        return;
      }

      // Valid active member: update local storage with fresh central data and proceed
      localStorage.setItem('three_youths_last_login', JSON.stringify(check.registrant));
      onLoginSuccess(check.registrant);
    } catch {
      setError('تعذر التحقق من العضوية عبر السيرفر. يرجى إدخال البيانات يدوياً.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgetQuickLogin = () => {
    try {
      if (rememberedMember?.id) {
        storageService.purgeLocalMemberData(rememberedMember.id);
      }
      localStorage.removeItem('three_youths_last_login');
      localStorage.removeItem('three_youths_remembered_user');
      localStorage.removeItem('three_youths_member_session');
      sessionStorage.removeItem('three_youths_member_session');
    } catch {}
    setRememberedMember(null);
    setFullName('');
    setPassword('');
    setError('تمت إزالة الحساب القديم بنجاح من هذا المتصفح. يمكنك الآن كتابة بيانات أي حساب آخر للدخول.');
  };

  const handleClearBrowserStorage = () => {
    try {
      localStorage.removeItem('three_youths_last_login');
      localStorage.removeItem('three_youths_remembered_user');
      localStorage.removeItem('three_youths_member_session');
      sessionStorage.removeItem('three_youths_member_session');
    } catch {}
    setRememberedMember(null);
    setFullName('');
    setPassword('');
    setError('تم مسح جميع بيانات الحسابات المحفوظة من متصفح هذا الهاتف.');
  };

  // Forgot Password / Reset State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetFullName, setResetFullName] = useState('');
  const [resetRecoveryCode, setResetRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<{ 
    type: 'success' | 'error'; 
    message: string; 
    whatsappUrl?: string; 
    oldPassword?: string;
    whatsappNumber?: string;
  } | null>(null);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);

  // Handle Standard Login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await storageService.memberLoginAsync(fullName, password);
      if (res.success && res.registrant) {
        onLoginSuccess(res.registrant);
      } else {
        setError(res.error || 'تعذر تسجيل الدخول. يرجى التحقق من الاسم ثلاثي أو الرمز وكلمة المرور.');
      }
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Reset (الاسم الثلاثي + الكود السداسي => تغيير كلمة المرور)
  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);
    setWhatsappStatus(null);

    if (!resetFullName.trim()) {
      setResetError('يرجى كتابة الاسم ثلاثياً باللغة العربية.');
      return;
    }

    if (!resetRecoveryCode.trim()) {
      setResetError('يرجى إدخال الكود السداسي المخصص لاستعادة كلمة المرور.');
      return;
    }

    if (newPassword.length < 3) {
      setResetError('كلمة المرور الجديدة قصيرة جداً (3 خانات على الأقل).');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setResetError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsResetting(true);

    setTimeout(() => {
      const res = storageService.resetMemberPassword(
        resetFullName, 
        resetRecoveryCode, 
        newPassword
      );

      if (res.success && res.registrant) {
        setResetSuccess(`تم تغيير كلمة المرور بنجاح للحساب (${res.registrant.fullName})! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.`);
        setFullName(res.registrant.fullName);
        setPassword(newPassword);
      } else {
        setResetError(res.error || 'تعذر تغيير كلمة المرور. يرجى التأكد من صحة الاسم والكود السداسي.');
      }
      setIsResetting(false);
    }, 500);
  };

  // Handle WhatsApp Old Password Dispatch (إرسال كلمة السر القديمة على رقم الواتساب دون تغييرها)
  const handleSendOldPasswordToWhatsapp = () => {
    setResetError(null);
    setWhatsappStatus(null);

    if (!resetFullName.trim()) {
      setResetError('يرجى كتابة الاسم ثلاثياً أولاً في الخانة المخصصة بالأعلى للتعرف على رقم الواتساب المسجل لحسابك.');
      return;
    }

    setIsSendingWhatsapp(true);

    setTimeout(() => {
      const res = storageService.getMemberOldPasswordForWhatsApp(resetFullName, resetRecoveryCode);
      setIsSendingWhatsapp(false);

      if (res.success && res.whatsapp && res.password) {
        // Pre-fill login credentials in case they want to log in immediately with the old password
        setFullName(res.fullName || resetFullName);
        setPassword(res.password);

        // Try opening WhatsApp window
        if (res.whatsappUrl) {
          try {
            window.open(res.whatsappUrl, '_blank');
          } catch (e) {
            console.warn('Popup blocked', e);
          }
        }

        setWhatsappStatus({
          type: 'success',
          message: `تم تجهيز إرسال كلمة المرور القديمة إلى رقم الواتساب الخاص بك (${res.whatsapp}) بنجاح! كلمة مرورك القديمة لم تتغير وتظل صالحة للاستخدام كما هي.`,
          whatsappUrl: res.whatsappUrl,
          oldPassword: res.password,
          whatsappNumber: res.whatsapp
        });
      } else {
        setWhatsappStatus({
          type: 'error',
          message: res.error || 'تعذر العثور على حساب بهذا الاسم الثلاثي لإرسال كلمة المرور على الواتساب.'
        });
      }
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/20 to-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6">
      
      {/* Top Header: تسجيل دخول موحد لجميع الأعضاء والخدام والإدارة */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center pb-3">
        <div className="flex items-center gap-2 bg-emerald-100/70 border border-emerald-200/80 px-3.5 py-1 rounded-full shadow-2xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-bold text-emerald-900">
            بوابة تسجيل الدخول • اجتماع الثلاثة فتية
          </span>
        </div>
      </div>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-auto">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
          
          {/* Top Logo & Welcome Banner: المربع اللي برا خالص بلون أزرق كحلي ملكي عميق (هو الأكثر انسجاماً مع الهوية) */}
          <div className="bg-gradient-to-b from-blue-950 via-slate-900 to-blue-950 text-white pt-7 pb-5 px-6 text-center border-b border-blue-900/60 relative">
            <div className="relative z-10 flex flex-col items-center">
              
              {/* Concentric Nested Boxes */}
              {/* 1. المربع الخارجي للشعار: تم إرجاعه للأخضر مع حواف متدرجة انسيابية (Gradient Edges) */}
              <div className="p-3.5 rounded-3xl bg-gradient-to-b from-emerald-600 via-emerald-800 to-emerald-950 border-2 border-emerald-400/80 shadow-2xl ring-2 ring-emerald-500/30 inline-flex items-center justify-center transition-all">
                {/* 2. المربع الداخلي الأبيض الذي يملؤه الشعار بالكامل */}
                <div className="p-0 rounded-2xl bg-white border border-emerald-200/90 shadow-inner inline-flex items-center justify-center overflow-hidden">
                  <div className="p-0 rounded-xl bg-white inline-flex items-center justify-center overflow-hidden">
                    <Logo size={230} showUploadTrigger={false} bgVariant="transparent" emblemOnly={true} className="my-0" />
                  </div>
                </div>
              </div>

              {/* حاوية النصوص (الثلاثة فتية - اجتماع الشباب السوداني) باللون الأبيض الناصع */}
              <div className="mt-4 px-7 py-3 rounded-2xl bg-white border border-slate-200/90 shadow-xl inline-flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-wide">
                  الثلاثة فتية
                </h1>
                <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                  اجتماع الشباب السوداني
                </p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 sm:p-8">
            {pendingQuizId && (() => {
              const invitedQuiz = storageService.getKahootQuizzes().find(q => q.id === pendingQuizId);
              const modeLabel = (invitedQuiz?.activePlayMode || invitedQuiz?.gameMode) === 'team'
                ? '🛡️ نظام الفرق (Team Mode)'
                : (invitedQuiz?.activePlayMode || invitedQuiz?.gameMode) === 'self_paced'
                ? '🎯 تحدي ذاتي (Self-Paced)'
                : '⚡ تفاعل مباشر (Live Mode)';
              return (
                <div className="mb-5 rounded-3xl overflow-hidden bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 border-2 border-amber-400/80 text-white shadow-xl animate-fadeIn">
                  {invitedQuiz?.coverImage && (
                    <div className="w-full h-36 sm:h-44 relative overflow-hidden border-b border-amber-400/30">
                      <img
                        src={invitedQuiz.coverImage}
                        alt={invitedQuiz.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-purple-950/90 via-purple-950/30 to-transparent" />
                      <span className="absolute bottom-2.5 right-3 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-[10px] font-black shadow-md">
                        {modeLabel}
                      </span>
                    </div>
                  )}
                  <div className="p-4 flex items-start gap-3">
                    {!invitedQuiz?.coverImage && (
                      <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl shrink-0 shadow-md">
                        🎮
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/40">
                          🔥 مسابقة الثلاثة فتية
                        </span>
                        {!invitedQuiz?.coverImage && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-800/80 text-purple-200 border border-purple-500/40">
                            {modeLabel}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-amber-300 leading-snug">
                        {invitedQuiz?.title || 'دعوة للمشاركة في مسابقة الثلاثة فتية! 🏆'}
                      </h4>
                      {invitedQuiz?.description && (
                        <p className="text-[11px] text-purple-200 mt-0.5 line-clamp-2">
                          {invitedQuiz.description}
                        </p>
                      )}
                      <p className="text-[11px] text-purple-100 mt-1.5 leading-relaxed">
                        سجّل دخولك بحسابك الآن ليتم نقلك تلقائياً إلى شاشة المسابقة والمنافسة على الصدارة! 🚀
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {!showForgotPassword ? (
              /* =========================================================
                 1. Normal Login View with "نسيت الباسورد؟؟"
                 ========================================================= */
              <>
                {/* 1-Tap Quick Login Card for Saved/Remembered User */}
                {rememberedMember && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border-2 border-emerald-300 text-emerald-950 shadow-md animate-fadeIn">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden bg-emerald-100 border-2 border-emerald-500 shadow-xs shrink-0 flex items-center justify-center">
                        {rememberedMember.photoUrl && rememberedMember.photoUrl.trim() !== '' ? (
                          <img 
                            src={rememberedMember.photoUrl} 
                            alt={rememberedMember.fullName}
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="text-base font-bold text-emerald-700">{(rememberedMember.fullName || '?').charAt(0)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full inline-block">
                            ⚡ حساب محفوظ في المتصفح
                          </span>
                          <button
                            type="button"
                            onClick={handleForgetQuickLogin}
                            className="text-[11px] text-red-600 hover:text-red-700 font-black bg-red-50 hover:bg-red-100 px-2.5 py-0.5 rounded-lg border border-red-200 transition"
                            title="تبديل الحساب أو إزالة هذا الحساب من الهاتف"
                          >
                            تبديل الحساب ✕
                          </button>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 truncate mt-0.5">
                          مرحباً، {rememberedMember.fullName}
                        </h4>
                        <p className="text-[11px] text-slate-600 font-mono" dir="ltr">
                          {rememberedMember.uniqueCode} • {rememberedMember.phone}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleQuickLogin}
                        disabled={isLoading}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
                        <span>الدخول السريع بنقرة واحدة كـ {rememberedMember.fullName.split(' ')[0]} 🚀</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleForgetQuickLogin}
                        className="w-full py-1.5 px-3 bg-white/90 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-300 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>🔄 إزالة هذا الحساب القديم من الهاتف والدخول بحساب آخر</span>
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الاسم ثلاثي أو رمز العضوية (Code) أو رقم الهاتف
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="مثال: مينا كمال بولس أو TY-0001 أو رقم هاتفك"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-3 pr-10 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <User className="w-5 h-5 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        كلمة المرور (أو رقم هاتفك / الكود)
                      </label>
                      
                      {/* ===================================================
                          Requirement: "عايز تضيف لي في صفحه تسجيل الدخول (نسيت الباسورد؟؟) كخيار"
                          =================================================== */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                          setResetFullName(fullName);
                          setResetError(null);
                          setResetSuccess(null);
                          setWhatsappStatus(null);
                        }}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline transition cursor-pointer flex items-center gap-1"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>نسيت الباسورد؟؟</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="كلمة المرور أو رقم الهاتف أو الكود السداسي"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-3 pr-10 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <KeyRound className="w-5 h-5 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <span>جاري تسجيل الدخول...</span>
                    ) : (
                      <>
                        <span>تسجيل الدخول للملف الشخصي</span>
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                      </>
                    )}
                  </button>
                </form>

                {/* Link to Registration Form */}
                <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-3">
                  <p className="text-sm font-bold text-slate-700">
                    لسه ما سجلت معانا 🤔!!منتظر شنو 👊🏻؟؟
                  </p>
                  
                  <button
                    type="button"
                    onClick={onGoToRegister}
                    className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold text-xs transition flex items-center justify-center gap-2 border border-slate-200 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-emerald-600" />
                    <span>تسجيل عضوية جديدة في الاجتماع</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearBrowserStorage}
                    className="w-full py-1.5 px-3 text-[11px] text-slate-400 hover:text-red-600 transition font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    title="مسح الحساب القديم المحفوظ في المتصفح والبدء بحساب نظيف"
                  >
                    <span>🧹 مسح أي حساب قديم محفوظ في متصفح هذا الهاتف</span>
                  </button>
                </div>
              </>
            ) : (
              /* =========================================================
                 2. Dedicated "نسيت الباسورد؟؟" View (Password Recovery & Reset)
                 Requirement:
                 - يطلب منه الاسم الثلاثي
                 - يطلب منه الكود السداسي
                 - تغيير كلمة المرور
                 - خيار قاعد براو تحت: ارسال كلمة السر القديمة على رقم الواتساب
                 ========================================================= */
              <div className="space-y-5 animate-fadeIn">
                
                {/* Header with back button */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">
                        استعادة أو تغيير كلمة المرور
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        اجتماع الثلاثة فتية
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetError(null);
                      setResetSuccess(null);
                      setWhatsappStatus(null);
                    }}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>العودة للدخول</span>
                  </button>
                </div>

                {/* Error Banner */}
                {resetError && (
                  <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{resetError}</span>
                  </div>
                )}

                {/* Success Banner */}
                {resetSuccess && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-3">
                    <div className="flex items-start gap-2 font-bold">
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                      <span>{resetSuccess}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(false);
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
                    >
                      تسجيل الدخول بكلمة المرور الجديدة الآن 🚀
                    </button>
                  </div>
                )}

                {/* Reset Password Form */}
                <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                  
                  {/* Field 1: الاسم الثلاثي */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      الاسم ثلاثي (المسجل به في العضوية) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="مثال: مينا كمال بولس"
                        value={resetFullName}
                        onChange={(e) => setResetFullName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Field 2: الكود السداسي */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        الكود السداسي للأمان <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        (الكود المسجل في صفحة العضوية)
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        dir="ltr"
                        maxLength={10}
                        placeholder="مثال: 654321 أو 123456"
                        value={resetRecoveryCode}
                        onChange={(e) => setResetRecoveryCode(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-xs font-mono font-bold tracking-wider text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                      />
                      <ShieldCheck className="w-4 h-4 text-emerald-600 absolute right-3 top-3 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      💡 الكود المكون من 6 أرقام الذي اخترته أو حصلت عليه عند تسجيل العضوية.
                    </p>
                  </div>

                  {/* Field 3: كلمة المرور الجديدة */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        كلمة المرور الجديدة <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          placeholder="كلمة مرور جديدة"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                        />
                        <KeyRound className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        تأكيد كلمة المرور <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          placeholder="تأكيد الكلمة"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                        />
                        <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button to change password */}
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {isResetting ? (
                      <span>جاري التحقق وتغيير كلمة المرور...</span>
                    ) : (
                      <>
                        <span>تغيير كلمة المرور وحفظ التعديل</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      </>
                    )}
                  </button>
                </form>

                {/* ========================================================
                    Requirement:
                    "وخيار اخير ارسال كلمة السر القديمة على رقم الواتساب ده يكون خيار قاعد براو تحت البيانات البتتملي في اعاده تعيين كلمة السر , بعد ما الباسورد يترسل ليو في الواتساب اذا عايز يستخدمه القديم ذي ما هو ما يتغير اما اذا عايز يغيره بعد ما يملا الاسم الثلاثي و الكود السداسي كلمة السر تتغير"
                    ======================================================== */}
                <div className="pt-4 border-t-2 border-dashed border-slate-200">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-200/90 text-right space-y-2.5 shadow-2xs">
                    
                    <div className="flex items-center gap-2 text-emerald-950 font-black text-xs">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <span>خيار بديل: إرسال كلمة السر القديمة على رقم الواتساب</span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                      إذا أردت معرفة كلمة مرورك القديمة والاستمرار باستخدامها <strong>كما هي دون أي تغيير</strong>، اضغط الزر أدناه وسنرسلها مباشرة إلى رقم الواتساب المسجل لحسابك.
                    </p>

                    <button
                      type="button"
                      onClick={handleSendOldPasswordToWhatsapp}
                      disabled={isSendingWhatsapp}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSendingWhatsapp ? (
                        <span>جاري البحث عن رقم الواتساب وكلمة السر...</span>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          <span>إرسال كلمة السر القديمة على رقم الواتساب</span>
                        </>
                      )}
                    </button>

                    {/* WhatsApp Status Alert */}
                    {whatsappStatus && (
                      <div className={`p-3 rounded-xl text-xs font-semibold mt-2.5 space-y-2 animate-fadeIn ${
                        whatsappStatus.type === 'success' 
                          ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' 
                          : 'bg-red-100 text-red-900 border border-red-300'
                      }`}>
                        <p className="leading-relaxed">{whatsappStatus.message}</p>
                        
                        {whatsappStatus.type === 'success' && (
                          <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
                            {whatsappStatus.whatsappUrl && (
                              <a
                                href={whatsappStatus.whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-[11px] shadow-xs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>فتح الواتساب الآن 💬</span>
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setShowForgotPassword(false);
                              }}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 rounded-lg font-bold text-[11px] shadow-xs cursor-pointer"
                            >
                              <span>استخدام كلمة المرور القديمة والعودة للدخول ✓</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 mt-6">
        اجتماع الثلاثة فتية القديسين • خدمة الشباب السوداني
      </footer>

    </div>
  );
};
