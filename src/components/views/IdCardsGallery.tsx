import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Registrant, AttendanceRecord, UserRole } from '../../types';
import { storageService, getFridaysForMonth, deduplicateAndMergeMembers, ensureUniqueSingleCardPerMember } from '../../services/storageService';
import { IdCardItem } from '../IdCardItem';
import { Printer, Search, Gift, Sparkles, User, RefreshCw, LayoutGrid } from 'lucide-react';

interface IdCardsGalleryProps {
  registrants: Registrant[];
  currentUserRole?: UserRole;
  onRefresh?: () => void;
}

// Module-level QR code cache to prevent repeated canvas re-renders
const qrCodeGlobalCache = new Map<string, string>();

export const IdCardsGallery: React.FC<IdCardsGalleryProps> = ({ registrants, currentUserRole, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [selectedCardForPrint, setSelectedCardForPrint] = useState<Registrant | null>(null);
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [meetingLogo, setMeetingLogo] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [globalCardFace, setGlobalCardFace] = useState<'front' | 'back' | 'both'>('front');

  // Dynamic Fridays count for current month
  const now = new Date();
  const currentMonthFridaysCount = getFridaysForMonth(now.getFullYear(), now.getMonth()).length;

  const refreshAttendance = () => {
    setAttendanceRecords(storageService.getAttendanceRecords());
    if (onRefresh) onRefresh();
  };

  useEffect(() => {
    setMeetingLogo(storageService.getCustomLogo());
    setAttendanceRecords(storageService.getAttendanceRecords());
    const unsub = storageService.subscribe(() => {
      setAttendanceRecords(storageService.getAttendanceRecords());
      setMeetingLogo(storageService.getCustomLogo());
    });
    return unsub;
  }, []);

  const uniqueGalleryRegistrants = ensureUniqueSingleCardPerMember(
    deduplicateAndMergeMembers(Array.isArray(registrants) ? registrants : [])
  ) as Registrant[];
  const filteredRegistrants = uniqueGalleryRegistrants.filter(r => {
    if (!r || !r.id) return false;
    const q = searchQuery.toLowerCase().trim();
    return (
      (r.fullName || '').toLowerCase().includes(q) || 
      (r.uniqueCode || '').toLowerCase().includes(q) ||
      (r.phone || '').includes(searchQuery.trim())
    );
  });

  const cardsToRender = isPrintingAll || searchQuery.trim() !== ''
    ? filteredRegistrants
    : filteredRegistrants.slice(0, visibleCount);

  // Generate QR codes ONLY for rendered cards and use global cache (prevents mobile phone freezing)
  useEffect(() => {
    let isCancelled = false;
    const generateNeededQrs = async () => {
      const updates: Record<string, string> = {};
      let hasChanged = false;

      for (const reg of cardsToRender) {
        if (!reg || !reg.uniqueCode) continue;
        const codeKey = String(reg.qrData || reg.uniqueCode).trim();
        let url = qrCodeGlobalCache.get(codeKey);
        if (!url) {
          try {
            url = await QRCode.toDataURL(codeKey, {
              width: 240,
              margin: 1,
              color: { dark: '#0f172a', light: '#ffffff' }
            });
            qrCodeGlobalCache.set(codeKey, url);
          } catch (e) {
            console.error(e);
          }
        }
        if (url) {
          updates[reg.id] = url;
          if (qrCodeMap[reg.id] !== url) {
            hasChanged = true;
          }
        }
      }

      if (!isCancelled && (hasChanged || Object.keys(updates).length > Object.keys(qrCodeMap).length)) {
        setQrCodeMap(prev => ({ ...prev, ...updates }));
      }
    };

    generateNeededQrs();
    return () => { isCancelled = true; };
  }, [cardsToRender]);

  // Listen to immediate QR code regeneration events from Community Owner
  useEffect(() => {
    const handleQrRegenerated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.memberId && detail.uniqueCode && detail.qrCodeUrl) {
        qrCodeGlobalCache.set(detail.uniqueCode, detail.qrCodeUrl);
        setQrCodeMap(prev => ({
          ...prev,
          [detail.memberId]: detail.qrCodeUrl
        }));
      }
      if (onRefresh) {
        onRefresh();
      }
    };
    window.addEventListener('three_youths_qr_regenerated', handleQrRegenerated);
    return () => window.removeEventListener('three_youths_qr_regenerated', handleQrRegenerated);
  }, [onRefresh]);

  const handlePrintAll = () => {
    setIsPrintingAll(true);
    setTimeout(() => {
      window.print();
      setIsPrintingAll(false);
    }, 250);
  };

  const handlePrintSingle = (reg: Registrant) => {
    setSelectedCardForPrint(reg);
    setTimeout(() => {
      window.print();
      setSelectedCardForPrint(null);
    }, 150);
  };

  return (
    <div className="space-y-6">
      
      {/* Top action header (hidden during print) */}
      <div className="no-print bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>معرض بطاقات الهوية الرسمية (ID Cards Gallery)</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
              {filteredRegistrants.length} بطاقة
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            بطاقات الهوية ذات الوجهين: الوجه الأمامي (الصورة والبيانات والـ QR) والوجه الخلفي (دوائر تحدي جمعات الشهر ({currentMonthFridaysCount} جمعات) وختم الاجتماع).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Card face global switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs">
            <button
              onClick={() => setGlobalCardFace('front')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                globalCardFace === 'front' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
              }`}
            >
              الوجه الأمامي
            </button>
            <button
              onClick={() => setGlobalCardFace('back')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1 ${
                globalCardFace === 'back' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Gift className="w-3.5 h-3.5 text-emerald-600" />
              <span>الخلفي ({currentMonthFridaysCount} جمعات)</span>
            </button>
            <button
              onClick={() => setGlobalCardFace('both')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                globalCardFace === 'both' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'
              }`}
            >
              الوجهين للطباعة
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 md:w-56">
            <input 
              type="text"
              placeholder="بحث بالاسم أو الكود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
          </div>

          <button
            onClick={handlePrintAll}
            className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة البطاقات</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredRegistrants.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200">
          <User className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">لا توجد بطاقات مطابقة لنتائج البحث</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cardsToRender.map((reg) => {
              const isSinglePrint = selectedCardForPrint && selectedCardForPrint.id === reg.id;
              const printClass = selectedCardForPrint 
                ? (isSinglePrint ? 'block' : 'no-print') 
                : 'block';

              return (
                <div key={reg.id} className={printClass}>
                  <IdCardItem
                    key={`${reg.id}-${globalCardFace}`}
                    registrant={reg}
                    qrCodeUrl={qrCodeMap[reg.id]}
                    meetingLogoUrl={meetingLogo}
                    attendanceRecords={attendanceRecords}
                    onPrintCard={() => handlePrintSingle(reg)}
                    onRefresh={refreshAttendance}
                    defaultFace={globalCardFace}
                    viewerRole={currentUserRole}
                  />
                </div>
              );
            })}
          </div>

          {/* Show more button if not all cards are displayed */}
          {!isPrintingAll && searchQuery.trim() === '' && filteredRegistrants.length > visibleCount && (
            <div className="no-print pt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount(prev => prev + 15)}
                className="px-6 py-2.5 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-800 font-black text-xs border border-emerald-200 shadow-xs transition cursor-pointer"
              >
                <span>عرض المزيد من البطاقات (+15) — معروض {cardsToRender.length} من {filteredRegistrants.length}</span>
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
};
