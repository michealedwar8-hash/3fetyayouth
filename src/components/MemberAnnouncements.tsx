import React, { useState, useEffect, useRef } from 'react';
import {
  storageService,
  notificationService,
  formatServantDisplayName,
} from '../services/storageService';
import { oneSignalService } from '../services/oneSignalService';
import { Announcement, Registrant, UserRole } from '../types';
import { Bell, CheckCircle2, Maximize2, X } from 'lucide-react';

interface MemberAnnouncementsProps {
  member: Registrant;
  className?: string;
}

const REACTION_EMOJIS = [
  { emoji: '❤️', label: 'محبة' },
  { emoji: '🙏', label: 'آمين / صلاة' },
  { emoji: '🕊️', label: 'سلام ونعمة' },
  { emoji: '👍', label: 'تمام حاضر' },
  { emoji: '🎉', label: 'فرحان' },
  { emoji: '🔥', label: 'حماس' },
];

export const MemberAnnouncements: React.FC<MemberAnnouncementsProps> = ({
  member,
  className = '',
}) => {
  const [announcements, setAnnouncements] = useState<
    Array<{ announcement: Announcement; personalizedText: string }>
  >([]);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    notificationService.getPermission()
  );
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    oneSignalService.isPushEnabled()
  );
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [showNotifToast, setShowNotifToast] = useState(false);
  const [showTestShadeToast, setShowTestShadeToast] = useState(false);
  const [showSystemPermissionGuide, setShowSystemPermissionGuide] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const loadAnnouncements = (recordViews = false) => {
    const items = storageService.getAnnouncementsForMember(member);
    setAnnouncements(items);

    if (recordViews) {
      items.forEach((item) => {
        if (!recordedViewsRef.current.has(item.announcement.id)) {
          recordedViewsRef.current.add(item.announcement.id);
          storageService.recordAnnouncementView(item.announcement.id, member);
        }
      });
    }
  };

  useEffect(() => {
    loadAnnouncements(true);
    storageService
      .fetchLiveAnnouncementsFromCloud()
      .then(() => loadAnnouncements(true))
      .catch(() => {});

    if (notificationService.isSupported()) {
      setPermission(notificationService.getPermission());
    }
    setPushEnabled(oneSignalService.isPushEnabled());

    // Automatically synchronize logged-in member identity with OneSignal & Global VAPID Hub
    oneSignalService
      .syncUserIdentity({
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        gender: member.gender,
        uniqueCode: member.uniqueCode,
      })
      .catch(() => {});

    // Automatically check and dispatch today's birthday system tray notification
    oneSignalService
      .checkAndDispatchTodayBirthdayNotifications(storageService.getRegistrants(), {
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        gender: member.gender || 'male',
      })
      .catch(() => {});

    const unsub = storageService.subscribe(() => {
      loadAnnouncements(true);
    });

    const unsubPush = oneSignalService.subscribePushState(() => {
      setPushEnabled(oneSignalService.isPushEnabled());
      if (notificationService.isSupported()) {
        setPermission(notificationService.getPermission());
      }
    });

    const pollTimer = setInterval(() => {
      storageService
        .fetchLiveAnnouncementsFromCloud()
        .then(() => loadAnnouncements(true))
        .catch(() => {});
    }, 1500);

    return () => {
      clearInterval(pollTimer);
      unsub();
      unsubPush();
    };
  }, [member.id, member.fullName, member.role, member.gender, member.uniqueCode]);

  const handleEnableNotifications = async () => {
    if (isEnablingPush) return;
    setIsEnablingPush(true);

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([120, 60, 180]);
        } catch {
          // ignore
        }
      }

      const granted = await oneSignalService.requestPermission({
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        gender: member.gender,
        uniqueCode: member.uniqueCode,
      });

      const currentPerm = notificationService.isSupported()
        ? notificationService.getPermission()
        : 'default';

      setPermission(currentPerm);
      setPushEnabled(oneSignalService.isPushEnabled());

      if (currentPerm !== 'granted' && !granted) {
        setShowSystemPermissionGuide(true);
        setShowNotifToast(false);
        return;
      }

      setShowSystemPermissionGuide(false);
      setShowNotifToast(true);

      const firstName = (member.fullName || 'أخي الحبيب').trim().split(/\s+/)[0];
      await oneSignalService
        .showNativeServiceWorkerNotification({
          title: 'الثلاثة فتية - اجتماع الشباب السوداني',
          body: `أهلاً بك يا ${firstName}! تم تفعيل إشعارات OneSignal وستارة إشعارات الهاتف بنجاح 🔔✨`,
          senderRole: 'community_owner',
          tag: `welcome_push_${Date.now()}`,
          force: true,
        })
        .catch(() => {});

      setTimeout(() => setShowNotifToast(false), 6000);
    } finally {
      setIsEnablingPush(false);
    }
  };

  const handleTestShadeNotification = async () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 150]);
      } catch {
        // ignore
      }
    }

    if (!oneSignalService.isPushEnabled()) {
      await oneSignalService.requestPermission({
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        gender: member.gender,
        uniqueCode: member.uniqueCode,
      });
      setPermission(
        notificationService.isSupported() ? notificationService.getPermission() : 'default'
      );
      setPushEnabled(oneSignalService.isPushEnabled());
    }

    const firstName = (member.fullName || 'أخي الحبيب').trim().split(/\s+/)[0];
    const sent = await oneSignalService
      .showNativeServiceWorkerNotification({
        title: 'الثلاثة فتية - اجتماع الشباب السوداني',
        body: `إشعار تجريبي مباشر يا ${firstName} — إشعارات ستارة الهاتف و OneSignal تعمل لديك بكفاءة 100% 🔔📲`,
        senderRole: 'community_owner',
        tag: `test_shade_${Date.now()}`,
        force: true,
      })
      .catch(() => false);

    if (sent) {
      oneSignalService.playIphoneNotificationChime();
      setShowSystemPermissionGuide(false);
      setShowTestShadeToast(true);
      setTimeout(() => setShowTestShadeToast(false), 4500);
    } else {
      setShowSystemPermissionGuide(true);
    }
  };

  const handleReaction = (announcementId: string, emoji: string) => {
    storageService.toggleAnnouncementReaction(announcementId, member.id, emoji);
    loadAnnouncements();
  };

  const getRoleBadgeLabel = (role: UserRole): string => {
    switch (role) {
      case 'priest':
        return 'أبونا ✝️';
      case 'community_owner':
        return 'مسؤول المجتمع (Owner) 👑';
      case 'community_manager':
        return 'مدير المجتمع ⚡';
      case 'meeting_secretary':
        return 'أمين الاجتماع 🕊️';
      case 'service_secretary':
        return 'أمين الخدمة ✝️';
      case 'servant':
        return 'خادم الاجتماع 🤝';
      default:
        return 'خادم';
    }
  };

  return (
    <div className={`space-y-4 text-right select-none ${className}`}>
      {/* Header & Notification Enable Button */}
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
          {announcements.length} إعلان نشط
        </span>
      </div>

      {/* Prominent Mandatory Notification Activation Banner */}
      {!pushEnabled && permission !== 'granted' ? (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-blue-400/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl shrink-0 shadow-inner">
              🔔
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                <span>تفعيل تنبيهات وإشعارات الاجتماع</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-2 py-0.2 rounded-full">
                  إلزامية
                </span>
              </h4>
              <p className="text-[11px] text-blue-100 mt-0.5 leading-relaxed">
                يرجى الضغط على السماح بالإشعارات (Allow Notifications) لتصلك مواعيد الاجتماع ورسائل الافتقاد ومحبة الخدام في ستارة إشعارات هاتفك!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleEnableNotifications}
            disabled={isEnablingPush}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-black text-xs transition shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-70"
          >
            <Bell className={`w-4 h-4 text-blue-700 ${isEnablingPush ? 'animate-bounce' : ''}`} />
            <span>
              {isEnablingPush ? 'جاري تفعيل الإشعارات...' : 'السماح بالإشعارات (Allow) 🔔'}
            </span>
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 shadow-2xs">
              ✓
            </span>
            <div>
              <span className="text-[11px] font-black text-emerald-950 block">
                إشعارات الهاتف (OneSignal) مفعلة ومتصلة بحسابك 🔔
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold block">
                تصلك جميع إعلانات الاجتماع ورسائل الافتقاد مباشرة في ستارة إشعارات تلفونك
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestShadeNotification}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[11px] font-black transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>اختبار إشعار في ستارة الهاتف 📲</span>
          </button>
        </div>
      )}

      {showSystemPermissionGuide && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl p-3 text-[11px] leading-relaxed flex items-start justify-between gap-2 animate-fadeIn">
          <div>
            <p className="font-black text-amber-900">
              💡 تنبيه هام لتفعيل ظهور الإشعارات في ستارة الهاتف العلوية:
            </p>
            <p className="text-amber-800 mt-0.5">
              إشعارات النظام غير مسموح بها حالياً لهذا التطبيق في إعدادات هاتفك. لتفعيلها فوراً: اضغط مطولاً على أيقونة التطبيق (أو اضغط على علامة القفل 🔒 بجانب الرابط في المتصفح) ← اختر{' '}
              <strong>معلومات التطبيق (App Info) / الإشعارات (Notifications) ← سماح بالإشعارات (Allow)</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSystemPermissionGuide(false)}
            className="text-amber-700 hover:text-amber-950 font-black px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {(showNotifToast || showTestShadeToast) && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            {showTestShadeToast
              ? 'تم إرسال إشعار تجريبي الآن إلى ستارة إشعارات هاتفك! اسحب ستارة الهاتف من الأعلى للمشاهدة 🔔📲'
              : 'تم تفعيل الإشعارات بنجاح! ستصلك كافة التنبيهات وتذكيرات الاجتماع فوراً في ستارة إشعارات الهاتف 🔔✨'}
          </span>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-3.5">
        {announcements.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 text-center shadow-xs space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mx-auto shadow-inner">
              📢
            </div>
            <h4 className="text-xs font-black text-slate-800">
              لوحة إعلانات اجتماع الثلاثة فتية
            </h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
              ستظهر هنا فوراً كافة التنبيهات الرسمية، وتذكيرات مواعيد الاجتماع الأسبوعية، والكلمات الروحية وتصلك أيضاً في ستارة الإشعارات وشاشة هاتفك.
            </p>
          </div>
        ) : (
          announcements.map(({ announcement, personalizedText }) => {
            const reactions = announcement.reactions || {};

            return (
              <div
                key={announcement.id}
                className="bg-gradient-to-b from-white to-blue-50/20 rounded-3xl p-4 sm:p-5 border-2 border-blue-200 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group"
              >
                {/* Top Corner Spiritual Accent */}
                <div className="absolute left-2 top-2 text-6xl opacity-5 pointer-events-none">
                  ✝️
                </div>

                {/* Sender Header */}
                <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
                      <img
                        src={storageService.getAnnouncementSenderIcon(announcement)}
                        alt="شعار الاجتماع"
                        className={
                          announcement.senderRole === 'priest' && announcement.senderPhotoUrl
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
                          {announcement.senderName || 'اجتماع الثلاثة فتية للشباب السوداني'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono font-medium self-start sm:self-auto">
                    {new Date(announcement.createdAt).toLocaleDateString('ar-EG', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* Personalized Announcement Message Content + Optional Attached Image */}
                <div className="my-3 space-y-2.5">
                  <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-blue-100 shadow-2xs">
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-semibold whitespace-pre-wrap font-['Cairo',sans-serif]">
                      {personalizedText}
                    </p>
                  </div>

                  {announcement.imageUrl && announcement.imageUrl.trim() !== '' && (
                    <div
                      onClick={() => setExpandedImage(announcement.imageUrl!)}
                      className="relative group/img rounded-2xl overflow-hidden border border-blue-200 bg-slate-950/5 max-h-80 flex items-center justify-center cursor-pointer"
                    >
                      <img
                        src={announcement.imageUrl}
                        alt={announcement.title || 'صورة الإعلان'}
                        className="max-h-80 w-full object-cover transition duration-300 group-hover/img:scale-[1.01]"
                      />
                      <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                        <Maximize2 className="w-3.5 h-3.5 text-cyan-300" />
                        <span>تكبير الصورة</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Interactive Reactions Bar */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span>تفاعل مع الرسالة:</span>
                    {(announcement.isVisitationTaskAlert ||
                      announcement.targetAudience === 'servant_personal' ||
                      announcement.title?.includes('تكليف افتقاد')) && (
                      <button
                        type="button"
                        onClick={() => storageService.deleteAnnouncement(announcement.id)}
                        className="px-2.5 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold transition cursor-pointer"
                        title="تم الاطلاع على التكليف وحذفه نهائياً"
                      >
                        إغلاق وحذف التنبيه ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {REACTION_EMOJIS.map(({ emoji, label }) => {
                      const reactedUsers = reactions[emoji] || [];
                      const hasReacted = reactedUsers.includes(member.id);
                      const count = reactedUsers.length;

                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReaction(announcement.id, emoji)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 transform active:scale-95 ${
                            hasReacted
                              ? 'bg-blue-600 text-white shadow-xs scale-105 ring-2 ring-blue-400/40 font-black'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                          title={`${label} (${count})`}
                        >
                          <span className="text-sm">{emoji}</span>
                          <span
                            className={`text-[11px] font-mono font-bold ${
                              hasReacted ? 'text-white' : 'text-slate-600'
                            }`}
                          >
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

      {/* Fullscreen Lightbox for Attached Announcement Image */}
      {expandedImage && (
        <div
          onClick={() => setExpandedImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="fixed top-5 left-5 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={expandedImage}
            alt="صورة الإعلان مكبرة"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/15 cursor-default"
          />
        </div>
      )}
    </div>
  );
};
