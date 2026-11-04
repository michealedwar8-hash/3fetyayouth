import React, { useState, useEffect } from 'react';
import { Announcement, Registrant, UserRole } from '../types';
import { storageService, notificationService } from '../services/storageService';
import { oneSignalService } from '../services/oneSignalService';
import { 
  Bell, 
  X, 
  ChevronDown, 
  CheckCheck, 
  Megaphone, 
  MessageCircle, 
  Clock, 
  Calendar, 
  ExternalLink,
  Volume2,
  Sparkles,
  ShieldCheck,
  ChevronLeft,
  Share2
} from 'lucide-react';

interface NotificationShadeProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnnouncement: (ann: Announcement) => void;
  currentUser?: Registrant | null;
  currentUserRole?: UserRole;
}

export const NotificationShade: React.FC<NotificationShadeProps> = ({
  isOpen,
  onClose,
  onOpenAnnouncement,
  currentUser,
  currentUserRole
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('three_youths_read_announcements');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>(() => 
    notificationService.isSupported() ? notificationService.getPermission() : 'default'
  );
  const [iosTipOpen, setIosTipOpen] = useState(false);

  const [expandedImageIds, setExpandedImageIds] = useState<Set<string>>(new Set());

  const toggleExpandImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedImageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAnnouncements = () => {
    const list = storageService.getAnnouncements().filter(a =>
      storageService.isMemberTargetedByAnnouncement(
        a,
        currentUser,
        currentUserRole,
        currentUser?.fullName,
        currentUser?.id
      )
    );
    setAnnouncements(list);
  };

  useEffect(() => {
    refreshAnnouncements();
    const unsub = storageService.subscribe(refreshAnnouncements);
    return () => unsub();
  }, [currentUserRole, currentUser]);

  const handleMarkAllAsRead = () => {
    const allIds = announcements.map(a => a.id);
    const newSet = new Set([...readIds, ...allIds]);
    setReadIds(newSet);
    try {
      localStorage.setItem('three_youths_read_announcements', JSON.stringify(Array.from(newSet)));
    } catch {}
  };

  const handleEnablePushNotifications = async () => {
    if (oneSignalService.isIos() && !oneSignalService.isStandalone()) {
      setIosTipOpen(true);
    }
    const granted = await oneSignalService.requestPermission();
    if (granted) {
      setNotificationPerm('granted');
      oneSignalService.showNativeServiceWorkerNotification({
        title: 'اجتماع الثلاثة فتية للشباب 🕊️',
        body: 'تم تفعيل إشعارات الهاتف الأساسية بنجاح! ستصلك تنبيهات ورسائل الاجتماع فور نشرها في ستارة إشعارات الهاتف.',
        senderRole: 'community_owner'
      }).catch(() => {});
    } else {
      setNotificationPerm(notificationService.getPermission());
    }
  };

  if (!isOpen) return null;

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn select-none" dir="rtl">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-down Shade Container (Phone Notification Shade Style) */}
      <div className="relative max-w-lg w-full mx-auto mt-0 sm:mt-3 shadow-2xl transition-all">
        <div className="bg-slate-900 text-white rounded-b-3xl sm:rounded-3xl border-b sm:border border-slate-700/80 overflow-hidden max-h-[88vh] flex flex-col shadow-2xl">
          
          {/* Native Top Drag Handle */}
          <div className="pt-2.5 pb-1 flex justify-center cursor-pointer" onClick={onClose}>
            <div className="w-12 h-1.5 rounded-full bg-slate-700 hover:bg-slate-500 transition" />
          </div>

          {/* Header */}
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/25">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span>لوحة وستارة الإشعارات</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded-full animate-pulse">
                      {unreadCount} جديد
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  الثلاثة فتية • تنبيهات الاجتماع المباشرة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تحديد كمقروء</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Push Notification Enable Bar */}
          {notificationPerm !== 'granted' && (
            <div className="p-3 bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-blue-900/60 border-b border-blue-500/30 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="text-blue-100 text-[11px] font-semibold leading-tight">
                  فعّل إشعارات شاشة القفل والهاتف عبر OneSignal لتصلك الرسائل كرسائل الواتساب!
                </span>
              </div>
              <button
                type="button"
                onClick={handleEnablePushNotifications}
                className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-[11px] shrink-0 transition shadow-xs cursor-pointer"
              >
                تفعيل الإشعارات 🔔
              </button>
            </div>
          )}

          {/* iOS Safari Home Screen Tip */}
          {iosTipOpen && (
            <div className="p-3 bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
              <Share2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-bold text-[11px]">
                  خطوة إضافية لمستخدمي آيفون (iPhone):
                </p>
                <p className="text-[10px] text-amber-300/90 leading-relaxed">
                  لتلقي إشعارات شاشة القفل على نظام iOS: انقر على زر <strong>المشاركة (Share)</strong> في أسفل متصفح Safari، ثم اختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIosTipOpen(false)}
                className="text-amber-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Notifications List (Shade Cards) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/60">
            {announcements.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <div className="w-14 h-14 rounded-3xl bg-slate-800/80 flex items-center justify-center text-2xl mx-auto mb-2 text-slate-500">
                  📭
                </div>
                <h4 className="text-xs font-bold text-slate-300">لا توجد إشعارات جديدة حالياً</h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  كل إعلان أو تذكير يتم إرساله من إدارة وخدام الاجتماع سيظهر هنا وفي شاشة هاتفك فوراً.
                </p>
              </div>
            ) : (
              announcements.map((ann) => {
                const isRead = readIds.has(ann.id);
                const senderName = ann.senderName || 'إدارة الاجتماع';
                const senderRoleLabel = ann.senderRole === 'priest' ? 'أبونا ✝️' : ann.senderRole === 'community_owner' ? 'مسؤول المجتمع' : 'خادم بالاجتماع';
                const hasImage = Boolean(ann.imageUrl && ann.imageUrl.trim() !== '');
                const isImageExpanded = expandedImageIds.has(ann.id);

                return (
                  <div
                    key={ann.id}
                    onClick={() => {
                      // Mark this one as read
                      setReadIds(prev => {
                        const next = new Set(prev);
                        next.add(ann.id);
                        try {
                          localStorage.setItem('three_youths_read_announcements', JSON.stringify(Array.from(next)));
                        } catch {}
                        return next;
                      });
                      onClose();
                      onOpenAnnouncement(ann);
                    }}
                    className={`pt-3 first:pt-0 group cursor-pointer transition rounded-2xl p-3 ${
                      isRead ? 'bg-slate-900/60 hover:bg-slate-800/60' : 'bg-slate-800/90 border border-emerald-500/40 hover:bg-slate-800 shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar (Priest photo ONLY if Priest, otherwise Official Site Logo) */}
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center text-white font-bold shadow-xs">
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
                        <div className={`absolute -bottom-1 -left-1 w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] border border-slate-900 ${
                          ann.title.includes('🎯') ? 'bg-purple-500' : 'bg-emerald-500'
                        }`}>
                          <MessageCircle className="w-2.5 h-2.5 fill-current" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`text-xs font-black truncate ${
                              ann.title.includes('🎯') ? 'text-purple-300' : 'text-emerald-400'
                            }`}>
                              {senderName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({senderRoleLabel})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(ann.createdAt).toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' })}
                            </span>
                            {hasImage && (
                              <button
                                type="button"
                                onClick={(e) => toggleExpandImage(ann.id, e)}
                                className="w-6 h-6 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-amber-300 flex items-center justify-center transition"
                                title="اسحب السهم لعرض الصورة المرفقة بدون فتح الإعلان"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isImageExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-xs font-bold text-white leading-snug line-clamp-1">
                            {ann.title}
                          </h4>
                          {ann.title.includes('🎯') && (
                            <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1.5 py-0.2 rounded-md font-bold border border-purple-400/40 shrink-0">
                              تكليف افتقاد
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                          {ann.content.replace(/\[الاسم الأول\]/g, currentUser?.fullName?.split(' ')[0] || 'أخي الحبيب')}
                        </p>

                        {/* Expandable WhatsApp-style Image when arrow is pulled down */}
                        {hasImage && isImageExpanded && (
                          <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 max-h-56 flex items-center justify-center animate-fadeIn">
                            <img
                              src={ann.imageUrl}
                              alt={ann.title}
                              className="w-full max-h-56 object-cover"
                            />
                          </div>
                        )}

                        <div className="mt-2.5 flex items-center justify-between text-[10px]">
                          <span className={`font-bold flex items-center gap-1 group-hover:underline ${
                            ann.title.includes('🎯') ? 'text-purple-400' : 'text-emerald-400'
                          }`}>
                            <span>{ann.title.includes('🎯') ? 'عرض تفاصيل تكليف الافتقاد' : hasImage ? '📷 مرفق صورة • انقر لفتح الإعلان' : 'عرض الإعلان والتفاعل'}</span>
                            <ChevronLeft className="w-3 h-3" />
                          </span>
                          {!isRead && (
                            <span className={`w-2 h-2 rounded-full shadow-xs ${
                              ann.title.includes('🎯') ? 'bg-purple-400 shadow-purple-400' : 'bg-emerald-400 shadow-emerald-400'
                            }`} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-950/70 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-400">
              اجتماع الثلاثة فتية للشباب السوداني • خدمة ورعاية ومحبة
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};
