import React from 'react';
import { Announcement } from '../types';
import { storageService } from '../services/storageService';
import { 
  X, 
  Share2,
  ZoomIn
} from 'lucide-react';

interface AnnouncementModalProps {
  announcement: Announcement;
  onClose: () => void;
  currentUserId?: string;
  memberFirstName?: string;
  onOpenWhatsApp?: (phone: string, text: string) => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  announcement,
  onClose,
  currentUserId,
  memberFirstName
}) => {
  const [reaction, setReaction] = React.useState<string | null>(null);
  const [isImageZoomed, setIsImageZoomed] = React.useState(false);

  React.useEffect(() => {
    if (currentUserId) {
      const mem = storageService.getRegistrants().find(r => r.id === currentUserId);
      if (mem) {
        storageService.recordAnnouncementView(announcement.id, mem);
      }
    }
  }, [currentUserId, announcement.id]);

  // Format message text
  let content = announcement.content;
  if (memberFirstName) {
    content = content
      .replace(/\[الاسم الأول\]/g, memberFirstName)
      .replace(/\[الاسم الاول\]/g, memberFirstName)
      .replace(/\[الاسم\]/g, memberFirstName)
      .replace(/\bفلان\b/g, memberFirstName);
  } else {
    content = content
      .replace(/\[الاسم الأول\]/g, 'أخي الحبيب')
      .replace(/\[الاسم الاول\]/g, 'أخي الحبيب')
      .replace(/\[الاسم\]/g, 'أخي الحبيب')
      .replace(/\bفلان\b/g, 'أخي الحبيب');
  }

  const handleReact = (emoji: string) => {
    setReaction(emoji);
    if (currentUserId) {
      storageService.toggleAnnouncementReaction(announcement.id, currentUserId, emoji);
    }
  };

  const handleShare = async () => {
    const publicOrigin = (typeof window !== 'undefined' ? window.location.origin : 'https://3fetya-youths.com')
      .replace(/https?:\/\/3fetya-youths\.ai\.studio/gi, 'https://3fetya-youths.com');
    if (navigator.share) {
      try {
        await navigator.share({
          title: announcement.title,
          text: `${announcement.title}\n\n${content}\n\n— اجتماع الثلاثة فتية للشباب 🕊️`,
          url: publicOrigin
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(`${announcement.title}\n\n${content}\n${publicOrigin}`);
    }
  };

  const handleClose = () => {
    if (
      announcement.isVisitationTaskAlert || 
      announcement.targetAudience === 'servant_personal' || 
      announcement.title?.includes('تكليف افتقاد')
    ) {
      storageService.deleteAnnouncement(announcement.id);
    }
    onClose();
  };

  const senderRole =
    announcement.senderRole === 'priest'
      ? '✝️ أبونا'
      : announcement.senderRole === 'community_owner'
        ? '👑 مسؤول المجتمع'
        : announcement.senderRole === 'community_manager'
          ? '⚡ مدير المجتمع'
          : '🕊️ خادم بالاجتماع';

  const senderAvatarUrl = storageService.getAnnouncementSenderIcon(announcement);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 text-right select-none my-auto animate-scaleUp"
        dir="rtl"
      >
        {/* Modal Header (Priest Photo ONLY if Priest, otherwise Official Site Logo) */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white relative">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white flex items-center justify-center text-white shrink-0 border-2 border-white/80 shadow-md">
              <img 
                src={senderAvatarUrl} 
                alt={announcement.senderName || 'شعار الاجتماع'} 
                className={
                  announcement.senderRole === 'priest' && announcement.senderPhotoUrl
                    ? 'w-full h-full object-cover rounded-2xl'
                    : 'w-full h-full object-contain scale-[1.28] translate-y-1 bg-transparent'
                } 
              />
            </div>

            <div className="min-w-0 pr-1">
              <span className="text-[11px] font-black bg-emerald-900/60 px-2.5 py-0.5 rounded-full inline-block border border-emerald-400/30">
                {senderRole}
              </span>
              <h3 className="text-base font-black text-white leading-tight mt-1 truncate">
                {announcement.senderName || 'إدارة الاجتماع'}
              </h3>
              <p className="text-[11px] text-emerald-100 flex items-center gap-2 mt-0.5 font-mono">
                <span>{new Date(announcement.createdAt).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Announcement Image if provided (WhatsApp Style Expandable) */}
        {announcement.imageUrl && announcement.imageUrl.trim() !== '' && (
          <div 
            onClick={() => setIsImageZoomed(true)}
            className="relative w-full max-h-80 overflow-hidden bg-slate-950 border-b border-slate-100 cursor-pointer group"
          >
            <img 
              src={announcement.imageUrl} 
              alt={announcement.title} 
              className="w-full max-h-80 object-contain mx-auto transition duration-300 group-hover:scale-[1.02]" 
            />
            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
              <ZoomIn className="w-3.5 h-3.5 text-cyan-300" />
              <span>تكبير الصورة</span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block mb-1.5">
              📢 إعلان وتنبيه رسمي
            </span>
            <h2 className="text-lg font-black text-slate-900 leading-snug">
              {announcement.title}
            </h2>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-line">
            {content}
          </div>

          {/* Quick Reaction Bar */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">
              تفاعل مع الإعلان:
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { emoji: '❤️', label: 'محبة' },
                { emoji: '🙏', label: 'آمين' },
                { emoji: '👍', label: 'حاضر' },
                { emoji: '🕊️', label: 'سلام ونعمة' },
                { emoji: '🎉', label: 'فرحان' }
              ].map(opt => (
                <button
                  key={opt.emoji}
                  type="button"
                  onClick={() => handleReact(opt.emoji)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    reaction === opt.emoji
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-950 scale-105 shadow-xs'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-base">{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleShare}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>مشاركة</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition cursor-pointer"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Full-Screen Image Lightbox */}
      {isImageZoomed && announcement.imageUrl && (
        <div
          onClick={() => setIsImageZoomed(false)}
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setIsImageZoomed(false)}
            className="fixed top-5 left-5 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={announcement.imageUrl}
            alt={announcement.title}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/15 cursor-default"
          />
        </div>
      )}
    </div>
  );
};
