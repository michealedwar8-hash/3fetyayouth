import React, { useState, useEffect, useRef } from 'react';
import { Registrant, Announcement } from '../types';
import { 
  storageService, 
  formatServantDisplayName,
  notificationService
} from '../services/storageService';
import { oneSignalService } from '../services/oneSignalService';
import { Bell, CheckCircle2, ZoomIn, X } from 'lucide-react';

interface MemberAnnouncementsProps {
  member: Registrant;
  className?: string;
}

const REACTION_OPTIONS = [
  { emoji: '❤️', label: 'محبة' },
  { emoji: '🙏', label: 'آمين / صلاة' },
  { emoji: '🕊️', label: 'سلام ونعمة' },
  { emoji: '👍', label: 'تمام حاضر' },
  { emoji: '🎉', label: 'فرحان' },
  { emoji: '🔥', label: 'حماس' }
];

export const MemberAnnouncements: React.FC<MemberAnnouncementsProps> = ({
  member,
  className = ''
}) => {
  const [items, setItems] = useState<Array<{ announcement: Announcement; personalizedText: string; isTargeted: boolean }>>([]);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>(() => notificationService.getPermission());
  const [permSuccessMsg, setPermSuccessMsg] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const refreshAnnouncements = (shouldRecordViews = false) => {
    const list = storageService.getAnnouncementsForMember(member);
    setItems(list);
    // Record view for this member for each announcement they see ("الشافوا الإعلان حتى لو ما اتفاعلو")
    if (shouldRecordViews) {
      list.forEach(item => {
        if (!recordedViewsRef.current.has(item.announcement.id)) {
          recordedViewsRef.current.add(item.announcement.id);
          storageService.recordAnnouncementView(item.announcement.id, member);
        }
      });
    }
  };

  useEffect(() => {
    refreshAnnouncements(true);
    // Check permission state
    if (notificationService.isSupported()) {
      setNotificationPerm(notificationService.getPermission());
    }

    const unsub = storageService.subscribe(() => {
      refreshAnnouncements(false);
    });

    return () => {
      unsub();
    };
  }, [member.id]);

  const handleRequestNotifications = async () => {
    const granted = await oneSignalService.requestPermission();
    const perm = granted ? 'granted' : notificationService.getPermission();
    setNotificationPerm(perm);
    if (perm === 'granted') {
      setPermSuccessMsg(true);
      oneSignalService.showNativeServiceWorkerNotification({
        title: 'اجتماع الثلاثة فتية للشباب 🕊️',
        body: `أهلاً بك يا ${member.fullName.split(' ')[0]}! تم تفعيل إشعارات الهاتف الأساسية وتنبيهات الاجتماع بنجاح.`,
        senderRole: 'community_owner'
      }).catch(() => {});
      setTimeout(() => setPermSuccessMsg(false), 5000);
    }
  };

  const handleToggleReaction = (announcementId: string, emoji: string) => {
    storageService.toggleAnnouncementReaction(announcementId, member.id, emoji);
    refreshAnnouncements();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'priest': return 'أبونا ✝️';
      case 'community_owner': return 'مسؤول المجتمع (Owner) 👑';
      case 'community_manager': return 'مدير المجتمع ⚡';
      case 'meeting_secretary': return 'أمين الاجتماع 🕊️';
      case 'service_secretary': return 'أمين الخدمة ✝️';
      case 'servant': return 'خادم الاجتماع 🤝';
      default: return 'خادم';
    }
  };

  return (
    <div className={`space-y-4 text-right select-none ${className}`}>
      
      {/* Announcements Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-sm shadow-2xs">
            📢
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>الاعلانات</span>
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            </h3>
            <p className="text-[11px] text-slate-500">
              تنبيهات وتذكيرات مباشرة لشباب اجتماع الثلاثة فتية
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
          {items.length} إعلان نشط
        </span>
      </div>

      {/* Notification Permission Request Banner */}
      {notificationPerm !== 'granted' && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-3xl p-4 sm:p-5 shadow-sm border border-blue-400/40 flex flex-col sm:flex-row items-center justify-between gap-3.5 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl shrink-0 shadow-inner">
              🔔
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                <span>تفعيل تنبيهات وإشعارات الاجتماع</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-2 py-0.2 rounded-full">إلزامية</span>
              </h4>
              <p className="text-[11px] text-blue-100 mt-0.5 leading-relaxed">
                يرجى الضغط على السماح بالإشعارات (Allow Notifications) لتصلك مواعيد الاجتماع ورسائل الافتقاد ومحبة الخدام في ستارة إشعارات هاتفك!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestNotifications}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 font-black text-xs transition shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Bell className="w-4 h-4 text-blue-700" />
            <span>السماح بالإشعارات (Allow) 🔔</span>
          </button>
        </div>
      )}

      {/* Permission Granted Confirmation */}
      {permSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>تم تفعيل الإشعارات بنجاح! ستصلك كافة التنبيهات وتذكيرات الاجتماع فوراً 🔔✨</span>
        </div>
      )}

      {/* Announcements Feed */}
      <div className="space-y-3.5">
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 text-center shadow-xs space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mx-auto shadow-inner">
              📢
            </div>
            <h4 className="text-xs font-black text-slate-800">لوحة إعلانات اجتماع الثلاثة فتية</h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
              ستظهر هنا فوراً كافة التنبيهات الرسمية، وتذكيرات مواعيد الاجتماع الأسبوعية، والكلمات الروحية وتصلك أيضاً في ستارة الإشعارات وشاشة هاتفك.
            </p>
          </div>
        ) : (
          items.map(({ announcement: ann, personalizedText }) => {
          const reactions = ann.reactions || {};

          return (
            <div
              key={ann.id}
              className="bg-gradient-to-b from-white to-blue-50/20 rounded-3xl p-4 sm:p-5 border-2 border-blue-200 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group"
            >
              
              {/* Subtle watermarked background cross */}
              <div className="absolute left-2 top-2 text-6xl opacity-5 pointer-events-none">
                ✝️
              </div>

              {/* Top Source Banner (Priest photo ONLY if Priest, otherwise Official Site Logo) */}
              <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
                    <img 
                      src={storageService.getAnnouncementSenderIcon(ann)} 
                      alt="شعار الاجتماع" 
                      className={
                        ann.senderRole === 'priest' && ann.senderPhotoUrl
                          ? 'w-full h-full object-cover'
                          : 'w-full h-full object-contain scale-[1.28] translate-y-1 bg-transparent'
                      } 
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-blue-900 bg-blue-100/90 px-2 py-0.5 rounded-md border border-blue-200/80">
                        الاعلانات
                      </span>
                      <span className="text-xs sm:text-sm font-black text-slate-900">
                        {formatServantDisplayName(ann.senderName, ann.senderRole)}
                      </span>
                    </div>
                    <span className="text-[10px] text-blue-700 font-bold mt-0.5 block">
                      {getRoleLabel(ann.senderRole)}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 font-mono font-medium self-start sm:self-auto">
                  {new Date(ann.createdAt).toLocaleDateString('ar-EG', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>

              {/* Message Box & Attached Image (WhatsApp Style) */}
              <div className="my-3 space-y-2.5">
                <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-blue-100 shadow-2xs">
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-semibold whitespace-pre-wrap font-['Cairo',sans-serif]">
                    {personalizedText}
                  </p>
                </div>

                {ann.imageUrl && ann.imageUrl.trim() !== '' && (
                  <div 
                    onClick={() => setZoomedImageUrl(ann.imageUrl!)}
                    className="relative group/img rounded-2xl overflow-hidden border border-blue-200 bg-slate-950/5 max-h-80 flex items-center justify-center cursor-pointer"
                  >
                    <img
                      src={ann.imageUrl}
                      alt={ann.title || 'صورة الإعلان'}
                      className="max-h-80 w-full object-cover transition duration-300 group-hover/img:scale-[1.01]"
                    />
                    <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                      <ZoomIn className="w-3.5 h-3.5 text-cyan-300" />
                      <span>تكبير الصورة</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Emoji Reactions & Dismiss */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                  <span>تفاعل مع الرسالة:</span>
                  {(ann.isVisitationTaskAlert || ann.targetAudience === 'servant_personal' || ann.title?.includes('تكليف افتقاد')) && (
                    <button
                      type="button"
                      onClick={() => storageService.deleteAnnouncement(ann.id)}
                      className="px-2.5 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold transition cursor-pointer"
                      title="تم الاطلاع على التكليف وحذفه نهائياً"
                    >
                      إغلاق وحذف التنبيه ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {REACTION_OPTIONS.map(({ emoji, label }) => {
                    const memberList = reactions[emoji] || [];
                    const hasUserReacted = memberList.includes(member.id);
                    const count = memberList.length;

                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(ann.id, emoji)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 transform active:scale-95 ${
                          hasUserReacted
                            ? 'bg-blue-600 text-white shadow-xs scale-105 ring-2 ring-blue-400/40 font-black'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                        }`}
                        title={`${label} (${count})`}
                      >
                        <span className="text-sm">{emoji}</span>
                        <span className={`text-[11px] font-mono font-bold ${hasUserReacted ? 'text-white' : 'text-slate-600'}`}>
                          {count}
                        </span>
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

      {/* Full-Screen Zoomed Image Lightbox */}
      {zoomedImageUrl && (
        <div 
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setZoomedImageUrl(null)}
            className="fixed top-5 left-5 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedImageUrl}
            alt="صورة الإعلان مكبرة"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/15 cursor-default"
          />
        </div>
      )}

    </div>
  );
};
