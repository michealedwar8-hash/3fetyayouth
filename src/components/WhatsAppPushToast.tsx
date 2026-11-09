import React, { useEffect, useState, useRef } from 'react';
import { Announcement } from '../types';
import { storageService } from '../services/storageService';
import { oneSignalService } from '../services/oneSignalService';
import { MessageCircle, X, ChevronLeft, ChevronDown } from 'lucide-react';

interface WhatsAppPushToastProps {
  announcement: Announcement | null;
  onOpenAnnouncement: (ann: Announcement) => void;
  onDismiss: () => void;
  memberFirstName?: string;
}

export const WhatsAppPushToast: React.FC<WhatsAppPushToastProps> = ({
  announcement,
  onOpenAnnouncement,
  onDismiss,
  memberFirstName
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const playedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (announcement && announcement.id) {
      setIsVisible(true);
      if (playedForIdRef.current !== announcement.id) {
        playedForIdRef.current = announcement.id;
        setIsExpanded(false);
        // Play authentic iPhone notification chime strictly ONCE when the announcement arrives
        oneSignalService.playIphoneNotificationChime(announcement.id);
      }

      // Auto hide toast after 12 seconds if not expanded
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 400);
      }, 12000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [announcement?.id]);

  if (!announcement || !isVisible) return null;

  // Format content with member name if available
  let previewText = announcement.content;
  if (memberFirstName) {
    previewText = previewText
      .replace(/\[الاسم الأول\]/g, memberFirstName)
      .replace(/\[الاسم الاول\]/g, memberFirstName)
      .replace(/\[الاسم\]/g, memberFirstName)
      .replace(/\bفلان\b/g, memberFirstName);
  } else {
    previewText = previewText
      .replace(/\[الاسم الأول\]/g, 'أخي الحبيب')
      .replace(/\[الاسم الاول\]/g, 'أخي الحبيب')
      .replace(/\[الاسم\]/g, 'أخي الحبيب')
      .replace(/\bفلان\b/g, 'أخي الحبيب');
  }

  const senderName = announcement.senderName || 'اجتماع الثلاثة فتية';
  const senderRoleLabel =
    announcement.senderRole === 'priest'
      ? 'أبونا ✝️'
      : announcement.senderRole === 'community_owner'
        ? 'مسؤول المجتمع'
        : 'خادم بالاجتماع';
  const hasImage = Boolean(announcement.imageUrl && announcement.imageUrl.trim() !== '');
  const senderAvatarUrl = storageService.getAnnouncementSenderIcon(announcement);

  return (
    <div className="fixed top-3 inset-x-3 md:inset-x-auto md:right-6 md:w-96 z-50 animate-bounceIn drop-shadow-2xl">
      <div 
        onClick={() => {
          setIsVisible(false);
          onOpenAnnouncement(announcement);
        }}
        className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-3.5 border border-emerald-500/40 shadow-2xl cursor-pointer hover:bg-slate-900 transition transform hover:scale-[1.01] select-none"
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          {/* Official Site Logo or Priest Photo (Never Servant/Manager/Owner Personal Photo) */}
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center text-white font-bold shadow-md">
              <img 
                src={senderAvatarUrl} 
                alt={senderName} 
                className={
                  announcement.senderRole === 'priest' && announcement.senderPhotoUrl
                    ? 'w-full h-full object-cover rounded-2xl'
                    : 'w-full h-full object-contain scale-[1.28] translate-y-1 bg-transparent'
                } 
              />
            </div>
            <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-slate-900 shadow-xs">
              <MessageCircle className="w-3 h-3 fill-current" />
            </div>
          </div>

          {/* Notification Body */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-xs font-black text-emerald-400 truncate">
                  {senderName}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ({senderRoleLabel})
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-400 font-mono">الآن</span>
                {hasImage && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(prev => !prev);
                    }}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center justify-center transition"
                    title="اضغط السهم لإظهار الصورة بدون فتح الإعلان"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            <h4 className="text-xs font-bold text-white leading-snug truncate">
              {announcement.title}
            </h4>

            <p className={`text-[11px] text-slate-300 leading-relaxed mt-0.5 ${isExpanded ? '' : 'line-clamp-2'}`}>
              {previewText}
            </p>

            {/* Expandable WhatsApp-Style Image when arrow is pulled down */}
            {hasImage && isExpanded && (
              <div className="mt-2.5 rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 max-h-56 flex items-center justify-center animate-fadeIn">
                <img
                  src={announcement.imageUrl}
                  alt={announcement.title}
                  className="w-full max-h-56 object-cover"
                />
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded-xl border border-emerald-500/20">
              <span className="flex items-center gap-1">
                <span>{hasImage && !isExpanded ? '📷 مرفق صورة • اسحب السهم أو انقر للفتح' : 'انقر هنا لفتح الإعلان الكامل'}</span>
                <span>⚡</span>
              </span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
