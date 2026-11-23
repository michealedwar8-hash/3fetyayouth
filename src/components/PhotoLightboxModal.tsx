import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { fetchHdPhotoOnDemand, hdPhotoMemoryCache } from '../services/hdPhotoService';

interface PhotoLightboxModalProps {
  isOpen: boolean;
  memberId: string;
  fullName: string;
  uniqueCode?: string;
  fallbackPhotoUrl: string;
  onClose: () => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  isOpen,
  memberId,
  fullName,
  uniqueCode,
  fallbackPhotoUrl,
  onClose,
}) => {
  const [hdPhotoUrl, setHdPhotoUrl] = useState<string | null>(() =>
    memberId ? hdPhotoMemoryCache.get(memberId) || null : null
  );
  const [isLoadingHd, setIsLoadingHd] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !memberId) {
      setIsLoadingHd(false);
      return;
    }

    const cached = hdPhotoMemoryCache.get(memberId);
    if (cached) {
      setHdPhotoUrl(cached);
      setIsLoadingHd(false);
      return;
    }

    setHdPhotoUrl(null);
    let cancelled = false;
    setIsLoadingHd(true);

    fetchHdPhotoOnDemand(memberId)
      .then((resolved) => {
        if (cancelled) return;
        if (resolved) {
          setHdPhotoUrl(resolved);
        }
        setIsLoadingHd(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoadingHd(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, memberId]);

  if (!isOpen || !fallbackPhotoUrl) return null;

  const activePhotoSrc = hdPhotoUrl || fallbackPhotoUrl;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-black/92 flex flex-col items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`صورة ${fullName}`}
    >
      {/* Top Bar with Member Details & Close Button */}
      <div
        className="max-w-3xl w-full flex items-center justify-between pb-3 text-white px-2 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-black text-sm sm:text-base text-white leading-tight truncate">
              {fullName}
            </h3>
            {uniqueCode && (
              <span className="font-mono text-xs text-emerald-300">
                {uniqueCode}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg shrink-0"
          title="إغلاق (Esc أو النقر بالخارج)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* High-Resolution Photo Container */}
      <div
        className="relative max-w-[92vw] max-h-[85vh] flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={activePhotoSrc}
          alt={fullName}
          decoding="async"
          className="object-contain max-h-[85vh] max-w-[92vw] w-auto h-auto select-none transition-opacity duration-200"
        />

        {isLoadingHd && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-slate-950/85 text-emerald-200 border border-emerald-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>جاري تحميل الدقة الأصلية...</span>
          </div>
        )}

        {!isLoadingHd && hdPhotoUrl && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-slate-950/80 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-md">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>HD</span>
          </div>
        )}
      </div>

      {/* Bottom Hint */}
      <div
        className="mt-3 text-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white/80 text-xs font-bold flex items-center justify-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/10">
          <span>👈 انقر في أي مكان خارج الصورة للإغلاق ✕</span>
        </p>
      </div>
    </div>
  );
};
