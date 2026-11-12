import React, { useState, useEffect } from 'react';
import { Registrant, AttendanceRecord, UserRole, CardTemplate } from '../types';
import { MeetingLogoStamp } from './MeetingLogoStamp';
import { downloadIdCardAsImage } from '../services/cardImageGenerator';
import { storageService, getFridaysForMonth, MonthFriday } from '../services/storageService';
import { DEFAULT_CARD_TEMPLATE } from '../services/cardTemplatePresets';
import { Calendar, Phone, QrCode as QrIcon, RotateCcw, Printer, Gift, CheckCircle2, Download, Loader2, ShieldCheck, XCircle } from 'lucide-react';

interface IdCardItemProps {
  registrant: Registrant;
  qrCodeUrl?: string;
  meetingLogoUrl?: string | null;
  attendanceRecords: AttendanceRecord[];
  onPrintCard?: () => void;
  onRefresh?: () => void;
  defaultFace?: 'front' | 'back' | 'both';
  frontOnly?: boolean; // When true, only shows front face with no switcher
  viewerRole?: UserRole; // If official (owner, manager, secretary), show contact details and stamp controls
  onActiveFaceChange?: (face: 'front' | 'back' | 'both') => void;
}

export const IdCardItem: React.FC<IdCardItemProps> = ({
  registrant,
  qrCodeUrl,
  meetingLogoUrl,
  attendanceRecords,
  onPrintCard,
  onRefresh,
  defaultFace = 'front',
  frontOnly = false,
  viewerRole,
  onActiveFaceChange
}) => {
  const [activeFace, setActiveFace] = useState<'front' | 'back' | 'both'>(frontOnly ? 'front' : defaultFace);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleSelectFace = (nextFace: 'front' | 'back' | 'both') => {
    setActiveFace(nextFace);
    onActiveFaceChange?.(nextFace);
  };
  const [stampFeedback, setStampFeedback] = useState<string | null>(null);
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [cardTemplate, setCardTemplate] = useState<CardTemplate>(() => storageService.getCardTemplate());

  // Real-time synchronization for card template changes across devices
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setCardTemplate(storageService.getCardTemplate());
    });
    return unsub;
  }, []);

  // Sync activeFace when defaultFace changes from parent (e.g. Gallery toolbar)
  React.useEffect(() => {
    if (!frontOnly) {
      setActiveFace(defaultFace);
    }
  }, [defaultFace, frontOnly]);

  // Escape key handler for zoomed photo modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPhotoZoomed) {
        setIsPhotoZoomed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPhotoZoomed]);

  // Dynamic calculation for the current month's Fridays (4 or 5 Fridays)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  const monthFridays = getFridaysForMonth(currentYear, currentMonthIndex);
  
  // Calculate attendance for this month
  const monthlyAttendance = storageService.getMemberMonthlyAttendance(registrant.id, currentYear, currentMonthIndex);

  const isOfficialViewer = 
    viewerRole === 'priest' ||
    viewerRole === 'community_owner' || 
    viewerRole === 'community_manager' || 
    viewerRole === 'meeting_secretary' || 
    viewerRole === 'service_secretary' || 
    viewerRole === 'servant';

  // Requirement: "اضافه ختم الحضور و الغائه تكون من صلاحيتي انا فقط community owner"
  const isOwnerViewer = viewerRole === 'community_owner';

  const handleToggleStamp = (friday: MonthFriday, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwnerViewer) {
      return;
    }

    // Toggle ONLY the versioned Friday stamp without creating or deleting attendance records
    const res = storageService.toggleFridayStampOnly(registrant.id, friday.dateStr);
    const msg = res.isStampActive
      ? `تم تفعيل ختم تاريخ (${friday.formattedDate}) بنجاح ✓`
      : `تم إلغاء ختم تاريخ (${friday.formattedDate}) نهائياً ✕`;
    setStampFeedback(msg);

    setTimeout(() => setStampFeedback(null), 2500);

    if (onRefresh) {
      onRefresh();
    }
  };

  const handleResetMemberMonthStamps = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwnerViewer) {
      return;
    }
    storageService.resetMemberMonthlyStampsOnly(registrant.id, currentYear, currentMonthIndex);
    setStampFeedback('تم تفريغ وإعادة ضبط كافة أختام هذا الشهر للمخدوم بنجاح 🔄');
    setTimeout(() => setStampFeedback(null), 2500);
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    const targetFace = frontOnly ? 'front' : activeFace;
    await downloadIdCardAsImage(registrant, targetFace, qrCodeUrl, meetingLogoUrl, cardTemplate);
    setIsDownloading(false);
  };

  return (
    <div 
      className="id-card-print bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between relative"
      style={{
        borderRadius: `${cardTemplate.borderRadius || 32}px`,
        borderColor: cardTemplate.borderColor || '#059669',
        borderWidth: `${cardTemplate.borderWidth || 2.5}px`,
        borderStyle: 'solid'
      }}
    >
      
      {/* Interactive Toolbar (No Print) */}
      <div className="no-print bg-slate-50 border-b border-slate-100 p-2.5 flex items-center justify-between text-xs gap-2">
        {frontOnly ? (
          <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs px-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cardTemplate.primaryColor || '#059669' }}></span>
            <span>الوجه الأمامي للبطاقة (صورة الهوية الرسمية)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleSelectFace('front')}
              className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                activeFace === 'front' 
                  ? 'bg-emerald-600 text-white shadow-2xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الوجه الأمامي
            </button>
            <button
              type="button"
              onClick={() => handleSelectFace('back')}
              className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] flex items-center gap-1 ${
                activeFace === 'back' 
                  ? 'bg-emerald-600 text-white shadow-2xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gift className="w-3 h-3" />
              <span>الخلفي ({monthFridays.length} جمعات)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectFace('both')}
              className={`px-2 py-1 rounded-lg font-bold transition text-[11px] ${
                activeFace === 'both' 
                  ? 'bg-slate-800 text-white shadow-2xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الوجهين معاً
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {/* Download Active Card Face as Image Button */}
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownload}
            className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg transition shadow-2xs disabled:opacity-60 cursor-pointer"
            title={activeFace === 'back' ? 'تحميل الوجه الخلفي (الأختام) كصورة PNG' : 'تحميل الوجه الأمامي للبطاقة كصورة PNG'}
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
            ) : (
              <Download className="w-3.5 h-3.5 text-emerald-700" />
            )}
            <span>{activeFace === 'back' ? 'تحميل الخلفي كصورة' : 'تحميل كصورة'}</span>
          </button>

          {onPrintCard && (
            <button
              type="button"
              onClick={onPrintCard}
              className="text-xs text-slate-700 hover:text-slate-900 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          1. FRONT FACE (الوجه الأمامي للبطاقة)
          Requirement: Photo portrait on LEFT HALF of the card!
          ======================================================== */}
      {(frontOnly || activeFace === 'front' || activeFace === 'both') && (
        <div 
          className="p-4 flex-1 flex flex-col justify-between border-b border-dashed border-slate-200 last:border-b-0 relative overflow-hidden"
          style={{
            background: cardTemplate.bgType === 'solid'
              ? (cardTemplate.bgGradientStart || '#ffffff')
              : `linear-gradient(135deg, ${cardTemplate.bgGradientStart || '#ffffff'}, ${cardTemplate.bgGradientEnd || '#ecfdf5'})`
          }}
        >
          {/* Custom background image if active */}
          {cardTemplate.customBgImageUrl && (
            <div 
              className="absolute inset-0 pointer-events-none bg-cover bg-center"
              style={{
                backgroundImage: `url(${cardTemplate.customBgImageUrl})`,
                opacity: cardTemplate.bgImageOpacity ?? 0.22,
                zIndex: 0
              }}
            />
          )}

          {/* Top Decorative Band */}
          {cardTemplate.topBandStyle !== 'none' && (
            <div 
              className="h-1.5 w-full shrink-0 -mt-4 -mx-4 mb-3 relative z-10"
              style={{
                width: 'calc(100% + 2rem)',
                background: cardTemplate.topBandStyle === 'gold'
                  ? 'linear-gradient(90deg, #b45309, #f59e0b, #fbbf24)'
                  : cardTemplate.topBandStyle === 'solid'
                  ? (cardTemplate.primaryColor || '#047857')
                  : `linear-gradient(90deg, ${cardTemplate.primaryColor || '#047857'}, ${cardTemplate.secondaryColor || '#059669'}, ${cardTemplate.accentColor || '#10b981'})`
              }}
            />
          )}

          {/* Card Top Title Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                <img 
                  src={meetingLogoUrl && meetingLogoUrl.trim() !== '' ? meetingLogoUrl : '/icon-512x512.png?v=2'} 
                  alt="شعار الاجتماع" 
                  className="w-full h-full object-contain scale-[1.28] translate-y-0.5 bg-transparent" 
                />
              </div>
              <div>
                <h4 className="text-sm font-black leading-tight" style={{ color: cardTemplate.textColor || '#0f172a' }}>
                  اجتماع شباب الثلاثة فتية
                </h4>
                <p className="text-[10px] font-semibold" style={{ color: cardTemplate.primaryColor || '#047857' }}>
                  اجتماع الشباب السوداني
                </p>
              </div>
            </div>

            <span 
              className="font-mono text-xs font-bold px-2 py-0.5 rounded-full border shadow-2xs"
              style={{
                backgroundColor: cardTemplate.badgeBgColor || '#ecfdf5',
                color: cardTemplate.badgeTextColor || '#065f46',
                borderColor: cardTemplate.badgeBorderColor || '#a7f3d0'
              }}
            >
              {registrant.uniqueCode}
            </span>
          </div>

          {/* Main Content Area: Split 2 Columns */}
          <div className="grid grid-cols-12 gap-3.5 my-3 items-stretch relative z-10">
            
            {/* RIGHT HALF (النصف الأيمن): Member Information & QR */}
            <div className="col-span-7 flex flex-col justify-between text-right space-y-2">
              <div>
                <span className="text-[9px] block font-medium" style={{ color: cardTemplate.subtextColor || '#94a3b8' }}>
                  الاسم بالكامل
                </span>
                <h3 className="text-sm sm:text-base font-black leading-snug" style={{ color: cardTemplate.textColor || '#0f172a' }}>
                  {registrant.role === 'priest' ? ((registrant.fullName || '').startsWith('أبونا') ? registrant.fullName : `أبونا ${registrant.fullName}`) : registrant.fullName}
                </h3>
              </div>

              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar className="w-3 h-3 shrink-0" style={{ color: cardTemplate.primaryColor || '#047857' }} />
                  <span>الميلاد: <strong style={{ color: cardTemplate.textColor || '#0f172a' }}>{registrant.dob || 'غير محدد'}</strong></span>
                </div>
                
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cardTemplate.accentColor || '#10b981' }}></span>
                  <span className="font-semibold" style={{ color: cardTemplate.textColor || '#334155' }}>
                    {registrant.role === 'priest' ? 'كاهن الاجتماع ✝️' : 'اجتماع الثلاثة فتية القديسين'}
                  </span>
                </div>

                {/* Member Address if provided (وعنوانه إذا كتبه) */}
                {registrant.address && registrant.address.trim() !== '' && (
                  <div className="flex items-center gap-1 text-[11px] truncate" style={{ color: cardTemplate.subtextColor || '#475569' }}>
                    <span className="shrink-0 text-xs">📍</span>
                    <span className="truncate">العنوان: <strong style={{ color: cardTemplate.textColor || '#0f172a' }}>{registrant.address}</strong></span>
                  </div>
                )}

                {/* Only visible to Officials */}
                {isOfficialViewer && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 text-[10px] space-y-0.5 bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
                    <div className="flex items-center gap-1 font-mono text-slate-700" dir="ltr">
                      <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                      <span>{registrant.phone || '—'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Large QR Code */}
              <div className="pt-2 flex items-center gap-2">
                <div 
                  className="w-16 h-16 sm:w-18 sm:h-18 bg-white p-1 rounded-2xl border-2 shadow-xs flex items-center justify-center shrink-0"
                  style={{ borderColor: cardTemplate.qrBorderColor || cardTemplate.borderColor || '#059669' }}
                >
                  {qrCodeUrl && qrCodeUrl.trim() !== '' ? (
                    <img 
                      src={qrCodeUrl} 
                      alt={`QR Code ${registrant.uniqueCode}`} 
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain" 
                    />
                  ) : (
                    <QrIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[9px] block font-bold" style={{ color: cardTemplate.subtextColor || '#94a3b8' }}>
                    كود الحضور الرسمي
                  </span>
                  <span className="font-mono text-xs sm:text-sm font-black block" style={{ color: cardTemplate.primaryColor || '#065f46' }}>
                    {registrant.uniqueCode}
                  </span>
                </div>
              </div>
            </div>

            {/* LEFT HALF (النصف الأيسر): Photo portrait orientation (بالطول) with WhatsApp/Instagram zoom */}
            <div className="col-span-5 flex items-center justify-center">
              <div 
                onClick={() => {
                  if (registrant.photoUrl) {
                    setIsPhotoZoomed(true);
                  }
                }}
                title={registrant.photoUrl ? 'انقر لتكبير صورة المخدوم بدقة عالية 🔍' : undefined}
                className={`w-full h-36 sm:h-40 rounded-2xl overflow-hidden border-2 shadow-xs relative bg-slate-100 ${
                  registrant.photoUrl ? 'cursor-pointer hover:scale-102 transition group/cardphoto' : ''
                }`}
                style={{ borderColor: cardTemplate.borderColor || '#059669' }}
              >
                {registrant.photoUrl && registrant.photoUrl.trim() !== '' ? (
                  <>
                    <img 
                      src={registrant.photoUrl} 
                      alt={registrant.fullName || 'عضو'} 
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover/cardphoto:scale-105 transition-all duration-300" 
                    />
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cardphoto:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold pointer-events-none">
                      🔍 تكبير
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold text-2xl">
                    {(registrant.fullName || '?').charAt(0)}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer Card Ribbon */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span>اجتماع الثلاثة فتية • السوداني</span>
            <span className="font-mono text-emerald-700 font-bold">THE THREE YOUTHS</span>
          </div>

        </div>
      )}

      {/* ========================================================
          2. BACK FACE (الوجه الخلفي للبطاقة)
          Requirement from Video:
          - "اجتماع شباب الثلاثة فتية"
          - "الاسم: ...."
          - "احضر اربعه جمعات بدون غياب و ليك هدية"
          - 4 Circles: when attended, meeting logo without colored background is stamped inside!
          - Gift box icon & @3fetya_youth
          ======================================================== */}
      {!frontOnly && (activeFace === 'back' || activeFace === 'both') && (
        <div className="p-4 flex-1 flex flex-col justify-between bg-white text-slate-800 relative select-none">
          
          {/* Subtle watermark logo in background */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <span className="text-8xl">✝️</span>
          </div>

          {/* Back Header */}
          <div className="text-center pb-2 border-b border-slate-100">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm">🕊️</span>
              <h3 className="text-base font-black text-slate-900 tracking-wide">
                اجتماع شباب الثلاثة فتية
              </h3>
              <span className="text-sm">✝️</span>
            </div>
            
            <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-700">
              <span className="font-bold text-slate-600">الاسم:</span>
              <span className="font-extrabold text-slate-900 border-b border-dotted border-slate-400 px-3 pb-0.5">
                {registrant.fullName}
              </span>
            </div>
          </div>

          {/* Green Promotional Challenge Banner from the video */}
          <div className="my-2 text-center space-y-1">
            <div className="inline-block bg-emerald-50 text-emerald-800 font-extrabold text-xs sm:text-sm px-3.5 py-1 rounded-full border border-emerald-200 shadow-2xs">
              🎁 احضر {monthFridays.length} جمعات بدون غياب و ليك هدية
            </div>

            {/* Stamp Feedback Toast Notification */}
            {stampFeedback && (
              <div className="mx-2 p-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-bold text-center animate-fadeIn shadow-md flex items-center justify-center gap-1.5">
                <span>{stampFeedback}</span>
              </div>
            )}

            {/* Admin Quick Control Hint */}
            {isOwnerViewer && (
              !stampFeedback && (
                <div className="no-print flex items-center justify-between text-[10px] text-slate-600 bg-amber-50/80 border border-amber-200/90 rounded-xl px-2.5 py-1">
                  <span className="font-bold text-amber-900">👑 انقر على أي ختم لتسجيله أو إلغائه (صلاحية Community Owner)</span>
                  {monthlyAttendance.attendedFridaysCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetMemberMonthStamps}
                      className="text-rose-700 hover:text-rose-900 font-bold hover:underline flex items-center gap-0.5"
                      title="تفريغ كافة أختام هذا الشهر للمخدوم والبدء من الأول"
                    >
                      <span>تفريغ الأختام 🔄</span>
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          {/* The Circles (ديناميكي 4 أو 5 جمعات حسب الشهر الحالي) */}
          <div className={`my-2 grid ${monthFridays.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5 px-1`}>
            {monthFridays.map((friday) => {
              const status = monthlyAttendance.fridayStatusMap[friday.fridayIndex];
              const isStamped = status?.isAttended;
              const dateText = friday.formattedDate; // e.g. "02/10"

              return (
                <div key={friday.fridayIndex} className="flex flex-col items-center group/stamp relative">
                  
                  {/* Circle Box */}
                  <div 
                    onClick={(e) => handleToggleStamp(friday, e)}
                    className={`w-13 h-13 sm:w-15 sm:h-15 rounded-full flex items-center justify-center relative transition-all duration-300 overflow-hidden ${
                      isOwnerViewer ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
                    } ${
                      isStamped 
                        ? 'border-2 border-blue-600 bg-blue-50/40 shadow-inner' 
                        : 'border-2 border-dashed border-blue-300/80 bg-white shadow-2xs hover:border-blue-500'
                    }`}
                    title={
                      isOwnerViewer 
                        ? (isStamped ? `انقر هنا لإلغاء ختم تاريخ (${dateText}) ✕` : `انقر لتسجيل ختم تاريخ (${dateText}) ✓`) 
                        : (isStamped ? `تم الحضور بتاريخ: (${dateText})` : `تاريخ الجمعة: (${dateText})`)
                    }
                  >
                    {isStamped ? (
                      /* Stamped with Meeting Logo matching Registration Page */
                      <MeetingLogoStamp size={50} dateText={dateText} className="w-full h-full p-0.5" />
                    ) : (
                      /* Empty circle spot awaiting attendance */
                      <div className="text-center text-slate-300 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-400 font-mono">
                          ({dateText})
                        </span>
                      </div>
                    )}

                    {/* Small gift star on final circle of the month */}
                    {friday.fridayIndex === monthFridays.length && (
                      <span className="absolute -top-1 -right-1 text-xs z-10" title="جمعة إتمام الهدية التراكمية!">
                        🎁
                      </span>
                    )}

                    {/* Admin quick toggle badge on hover (Only for Community Owner) */}
                    {isOwnerViewer && (
                      <div className={`absolute inset-0 rounded-full opacity-0 group-hover/stamp:opacity-100 flex items-center justify-center text-white text-[9px] font-black transition backdrop-blur-2xs shadow-md z-20 ${
                        isStamped ? 'bg-rose-600/85' : 'bg-emerald-600/85'
                      }`}>
                        {isStamped ? 'إلغاء ✕' : 'ختم ✓'}
                      </div>
                    )}
                  </div>

                  {/* Date text strictly displayed in (dd/mm) format under the circle - NO (جمعة 1/2/3/4) */}
                  <span className={`text-[9px] sm:text-[10px] font-mono font-bold mt-1 px-1.5 py-0.5 rounded-md leading-none ${
                    isStamped 
                      ? 'text-blue-900 bg-blue-100/80 font-black border border-blue-200' 
                      : 'text-slate-400 bg-slate-50 border border-slate-100'
                  }`}>
                    ({dateText})
                  </span>
                </div>
              );
            })}
          </div>

          {/* Attendance Status Notice */}
          <div className="text-center text-[10px] text-slate-500 mt-1">
            {monthlyAttendance.isCompletedAllFridays ? (
              <span className="text-emerald-700 font-extrabold bg-emerald-100/80 px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>تم إكمال جميع جمعات الشهر ({monthFridays.length}) بنجاح! هديتك في الانتظار 🎁</span>
              </span>
            ) : (
              <span>
                حضور هذا الشهر: <strong>{monthlyAttendance.attendedFridaysCount}</strong> من <strong>{monthFridays.length}</strong> جمعات
              </span>
            )}
          </div>

          {/* Back Footer from video: Gift Icon + @3fetya_youth */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between px-1">
            <div className="flex items-center gap-1 text-[11px] text-slate-600 font-medium">
              <span className="text-xs">👥</span>
              <span>شباب الكنيسة</span>
            </div>

            {/* Instagram Handle & Gift icon as shown in video */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <Gift className="w-3.5 h-3.5 text-emerald-600" />
              <span dir="ltr">@3fetya_youth</span>
            </div>

            <div className="text-[11px] text-emerald-600 font-bold">
              ختم الاجتماع
            </div>
          </div>

        </div>
      )}

      {/* ========================================================
          WHATSAPP / INSTAGRAM STYLE HIGH-RES PHOTO ZOOM MODAL
          ======================================================== */}
      {isPhotoZoomed && registrant.photoUrl && (
        <div 
          className="no-print fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-all duration-300 animate-fadeIn"
          onClick={() => setIsPhotoZoomed(false)}
        >
          {/* Top Bar with Member Details & Close Button */}
          <div 
            className="max-w-lg w-full flex items-center justify-between pb-3 text-white px-2 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <h3 className="font-black text-sm sm:text-base text-white leading-tight">
                  {registrant.fullName}
                </h3>
                <span className="font-mono text-xs text-emerald-300">
                  {registrant.uniqueCode}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPhotoZoomed(false)}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg"
              title="إغلاق (Esc أو النقر بالخارج)"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* High-Resolution Photo Container with Instagram/WhatsApp Zoom-in animation */}
          <div 
            className="relative max-w-lg w-full max-h-[75vh] flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black transform transition-transform duration-300 ease-out scale-100 hover:scale-102"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={registrant.photoUrl}
              alt={registrant.fullName}
              className="w-full h-auto max-h-[72vh] object-contain select-none"
            />
          </div>

          {/* Bottom Hint */}
          <div 
            className="mt-4 text-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white/80 text-xs font-bold flex items-center justify-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <span>👈 انقر في أي مكان خارج الصورة للرجوع لبطاقة المخدوم ✕</span>
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
