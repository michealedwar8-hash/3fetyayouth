import React, { useMemo, useState } from 'react';
import {
  CommunityEvent,
  EventPermissionKey,
  EventStaffAssignment,
  EventStaffRole,
  Registrant,
  ROLE_LABELS
} from '../../../types';
import {
  assignServantToEvent,
  derivePermissionsFromRoles,
  EVENT_PERMISSION_DEFINITIONS,
  EVENT_STAFF_ROLE_LABELS,
  getAvailableServantsFromMakhdomeen,
  getEventStaffAssignments,
  removeServantFromEvent
} from '../../../services/eventsService';
import {
  CheckCircle2,
  Edit3,
  Phone,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users
} from 'lucide-react';

interface EventStaffTabProps {
  event: CommunityEvent;
  currentUser: Registrant | null;
  onRefresh: () => void;
}

const ROLE_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
  roles: EventStaffRole[];
  badgeColor: string;
}> = [
  {
    id: 'reg_pay_only',
    title: 'مسؤول التسجيل والحجوزات وتأكيد الاشتراكات والمدفوعات فقط',
    subtitle:
      'يفتح له تبويب (التسجيلات والمشاركين) فقط، ويرى فقط الأعضاء الذين اختاروه كخادم مسؤول ليؤكد الدفع أو يطبق خصماً أو إعفاءً كاملاً (0).',
    roles: ['REGISTRATION_ORGANIZER', 'PAYMENT_MANAGER'],
    badgeColor: 'border-blue-300 bg-blue-50/70 text-blue-900'
  },
  {
    id: 'bus_only',
    title: 'مسؤول تنظيم وتسكين الباصات فقط',
    subtitle:
      'يفتح له تبويب (تنظيم الباصات والتسكين) فقط لإضافة الباصات وتوزيع الأعضاء المسجلين على الباصات.',
    roles: ['BUS_ORGANIZER'],
    badgeColor: 'border-amber-300 bg-amber-50/70 text-amber-900'
  },
  {
    id: 'qr_only',
    title: 'مسؤول تحضير الـ QR Code فقط (يوم الفعالية)',
    subtitle:
      'يفتح له تبويب (تحضير الـ QR Code والحضور) فقط لمسح كود المخدومين وتسجيل حضورهم في الباص الخاص به.',
    roles: ['QR_ATTENDANCE'],
    badgeColor: 'border-purple-300 bg-purple-50/70 text-purple-900'
  },
  {
    id: 'event_manager',
    title: 'مدير الفعالية الشامل + صلاحية التسجيل الاستثنائي',
    subtitle: 'صلاحية كاملة على جميع أقسام الفعالية والتقارير المالية وزر التسجيل الاستثنائي من قاعدة البيانات.',
    roles: ['EVENT_MANAGER', 'OVERRIDE_EVENT_REGISTRATION_LIMITS'],
    badgeColor: 'border-indigo-300 bg-indigo-50/70 text-indigo-900'
  }
];

export const EventStaffTab: React.FC<EventStaffTabProps> = ({
  event,
  currentUser,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServant, setSelectedServant] = useState<Registrant | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<EventStaffRole[]>([
    'REGISTRATION_ORGANIZER',
    'PAYMENT_MANAGER'
  ]);
  const [selectedPermissions, setSelectedPermissions] = useState<EventPermissionKey[]>(() =>
    derivePermissionsFromRoles(['REGISTRATION_ORGANIZER', 'PAYMENT_MANAGER'])
  );
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [assignmentsVersion, setAssignmentsVersion] = useState(0);

  const assignments: EventStaffAssignment[] = useMemo(
    () => getEventStaffAssignments(event.id),
    [event.id, assignmentsVersion, onRefresh]
  );

  const availableServants = useMemo(
    () => getAvailableServantsFromMakhdomeen(searchQuery),
    [searchQuery, assignmentsVersion]
  );

  const actorName = currentUser?.fullName || 'المسؤول';

  const toggleRole = (role: EventStaffRole) => {
    setSelectedRoles(prev => {
      const isRemoving = prev.includes(role);
      const next = isRemoving ? prev.filter(r => r !== role) : [...prev, role];
      const rolePerms = derivePermissionsFromRoles([role]);
      setSelectedPermissions(prevPerms => {
        if (isRemoving) {
          const remainingRolePerms = new Set(derivePermissionsFromRoles(next));
          return prevPerms.filter(p => !rolePerms.includes(p) || remainingRolePerms.has(p));
        } else {
          return Array.from(new Set([...prevPerms, ...rolePerms]));
        }
      });
      return next;
    });
  };

  const toggleGranularPermission = (perm: EventPermissionKey) => {
    setSelectedPermissions(prev => {
      const next = prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm];
      if (perm === 'OVERRIDE_EVENT_REGISTRATION_LIMITS') {
        if (next.includes(perm) && !selectedRoles.includes('OVERRIDE_EVENT_REGISTRATION_LIMITS')) {
          setSelectedRoles(r => [...r, 'OVERRIDE_EVENT_REGISTRATION_LIMITS']);
        } else if (!next.includes(perm) && selectedRoles.includes('OVERRIDE_EVENT_REGISTRATION_LIMITS')) {
          setSelectedRoles(r => r.filter(x => x !== 'OVERRIDE_EVENT_REGISTRATION_LIMITS'));
        }
      }
      return next;
    });
  };

  const applyPreset = (roles: EventStaffRole[]) => {
    setSelectedRoles([...roles]);
    setSelectedPermissions(derivePermissionsFromRoles(roles));
  };

  const handleSelectServant = (servant: Registrant) => {
    setSelectedServant(servant);
    const existing = assignments.find(a => a.userId === servant.id);
    if (existing) {
      setSelectedRoles([...existing.roles]);
      setSelectedPermissions(
        Array.isArray(existing.permissions)
          ? [...existing.permissions]
          : derivePermissionsFromRoles(existing.roles)
      );
    }
    setStatusBanner(null);
  };

  const handleSaveAssignment = () => {
    if (!selectedServant) {
      setStatusBanner({ type: 'error', text: 'يرجى اختيار الخادم من قائمة الخدام أولاً.' });
      return;
    }
    if (selectedRoles.length === 0 && selectedPermissions.length === 0) {
      setStatusBanner({ type: 'error', text: 'يرجى تحديد دور أو صلاحية واحدة على الأقل للخادم في هذه الفعالية.' });
      return;
    }

    assignServantToEvent({
      eventId: event.id,
      servant: selectedServant,
      roles: selectedRoles,
      permissions: selectedPermissions,
      assignedBy: actorName,
      actorUserId: currentUser?.id
    });

    setAssignmentsVersion(v => v + 1);
    setStatusBanner({
      type: 'success',
      text: `✅ تم حفظ صلاحيات الخادم (${selectedServant.fullName}) في فعالية (${event.name}) بنجاح.`
    });
    setSelectedServant(null);
    setSearchQuery('');
    onRefresh();
  };

  const handleEditAssignment = (assignment: EventStaffAssignment) => {
    const servant: Registrant = availableServants.find(s => s.id === assignment.userId) || {
      id: assignment.userId,
      fullName: assignment.userName,
      phone: assignment.userPhone || '',
      whatsapp: assignment.userPhone || '',
      role: assignment.userRole || 'servant',
      photoUrl: assignment.userPhotoUrl || '',
      dob: '',
      gender: 'male',
      registeredAt: assignment.assignedAt || assignment.createdAt,
      uniqueCode: '',
      qrData: '',
      status: 'active'
    };
    setSelectedServant(servant);
    setSelectedRoles([...assignment.roles]);
    setSelectedPermissions(
      Array.isArray(assignment.permissions)
        ? [...assignment.permissions]
        : derivePermissionsFromRoles(assignment.roles)
    );
    setStatusBanner(null);
  };

  const handleRemoveAssignment = (assignment: EventStaffAssignment) => {
    removeServantFromEvent(assignment.id, actorName, currentUser?.id);
    setAssignmentsVersion(v => v + 1);
    setStatusBanner({
      type: 'success',
      text: `تم إلغاء تكليف (${assignment.userName}) من هذه الفعالية.`
    });
    if (selectedServant?.id === assignment.userId) {
      setSelectedServant(null);
    }
    onRefresh();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-indigo-900 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-lg border border-indigo-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                تعيين خدام الفعالية والصلاحيات المخصصة (Event-Specific RBAC)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-3xl">
                الخدام المعينون هنا فقط هم من ستظهر لهم فعالية <span className="font-bold text-amber-300">«{event.name}»</span> في حساباتهم، وسيقتصر وصول كل خادم على التبويبات والمهام المحددة له فقط (مثل التسجيل والمدفوعات والباصات، أو تحضير الـ QR فقط).
              </p>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/15 text-center shrink-0">
            <div className="text-xs text-indigo-200">إجمالي الخدام المكلفين بالفعالية</div>
            <div className="text-2xl font-black text-white">{assignments.length}</div>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-4 rounded-xl border text-sm font-bold flex items-center justify-between ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline opacity-75 hover:opacity-100"
          >
            إغلاق
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Top Column: Search & Assign Servant */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-black text-slate-800 flex items-center gap-2 text-base">
              <UserPlus className="w-5 h-5 text-indigo-600" />
              <span>1. اختر الخادم من سجل «المخدومين والرتب»</span>
            </h4>
            <span className="text-xs font-bold text-slate-500">
              متاح {availableServants.length} خادم وقائد
            </span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الخادم أو رقم الهاتف أو الكود..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Servants List from Makhdomeen */}
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
            {availableServants.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                لا يوجد خدام مطابقون للبحث في سجل المخدومين والرتب.
              </div>
            ) : (
              availableServants.map(servant => {
                const isSelected = selectedServant?.id === servant.id;
                const existingAssignment = assignments.find(a => a.userId === servant.id);
                const phone = servant.whatsapp || servant.phone || 'بدون هاتف';

                return (
                  <button
                    key={servant.id}
                    type="button"
                    onClick={() => handleSelectServant(servant)}
                    className={`w-full text-right p-3 flex items-center justify-between gap-3 transition ${
                      isSelected
                        ? 'bg-indigo-50 border-r-4 border-indigo-600'
                        : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {servant.photoUrl ? (
                        <img
                          src={servant.photoUrl}
                          alt={servant.fullName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm shrink-0">
                          {servant.fullName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                          <span>{servant.fullName}</span>
                          {existingAssignment && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              مُعيّن بالفعل
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-indigo-600">
                            {ROLE_LABELS[servant.role] || servant.role}
                          </span>
                          <span className="flex items-center gap-1" dir="ltr">
                            <Phone className="w-3 h-3" />
                            {phone}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200/70 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'تم الاختيار ✓' : 'اختيار'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Servant Card & Role Selection */}
          {selectedServant && (
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4">
              <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-3">
                  {selectedServant.photoUrl ? (
                    <img
                      src={selectedServant.photoUrl}
                      alt={selectedServant.fullName}
                      className="w-11 h-11 rounded-full object-cover border border-indigo-200"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center">
                      {selectedServant.fullName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-indigo-600 font-bold">الخادم المختار للتكليف:</div>
                    <div className="font-black text-slate-900 text-sm">{selectedServant.fullName}</div>
                    <div className="text-xs text-slate-600 flex items-center gap-2 mt-0.5">
                      <span>{ROLE_LABELS[selectedServant.role] || selectedServant.role}</span>
                      <span>•</span>
                      <span dir="ltr" className="font-mono font-bold text-slate-800">
                        {selectedServant.whatsapp || selectedServant.phone}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedServant(null)}
                  className="text-xs text-slate-500 hover:text-red-600 font-bold px-2 py-1"
                >
                  تغيير
                </button>
              </div>

              {/* Quick Role Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700">
                  2. اختر نوع التكليف السريع (أو خصص الصلاحيات بالأسفل):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ROLE_PRESETS.map(preset => {
                    const isActive =
                      preset.roles.length === selectedRoles.length &&
                      preset.roles.every(r => selectedRoles.includes(r));
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.roles)}
                        className={`text-right p-3 rounded-xl border transition flex flex-col justify-between ${
                          isActive
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white hover:border-indigo-300 text-slate-800'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center justify-between gap-2">
                          <span>{preset.title}</span>
                          {isActive && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                        </div>
                        <p
                          className={`text-[11px] mt-1 leading-relaxed ${
                            isActive ? 'text-indigo-100' : 'text-slate-500'
                          }`}
                        >
                          {preset.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Granular Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-indigo-100">
                <label className="block text-xs font-black text-slate-700">
                  تخصيص الأدوار الرئيسية لهذا الخادم في الفعالية:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(EVENT_STAFF_ROLE_LABELS) as EventStaffRole[]).map(roleKey => {
                    const meta = EVENT_STAFF_ROLE_LABELS[roleKey];
                    const checked = selectedRoles.includes(roleKey);
                    return (
                      <label
                        key={roleKey}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition text-xs ${
                          checked
                            ? 'bg-white border-indigo-500 shadow-xs'
                            : 'bg-white/60 border-slate-200 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(roleKey)}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-bold text-slate-900">{meta.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{meta.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Granular Event-Specific Permissions (15 Fine-Grained Controls) */}
              <div className="space-y-2 pt-2 border-t border-indigo-100">
                <label className="block text-xs font-black text-indigo-900">
                  3. الصلاحيات الدقيقة المستقلة داخل الفعالية (Granular Event Permissions):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {EVENT_PERMISSION_DEFINITIONS.map(def => {
                    const isChecked = selectedPermissions.includes(def.key);
                    const isOverridePerm = def.key === 'OVERRIDE_EVENT_REGISTRATION_LIMITS';
                    return (
                      <label
                        key={def.key}
                        className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition text-[11px] ${
                          isChecked
                            ? isOverridePerm
                              ? 'bg-rose-50 border-rose-400 text-rose-950'
                              : 'bg-white border-emerald-500 text-slate-900'
                            : 'bg-white/50 border-slate-200 text-slate-600 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleGranularPermission(def.key)}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600"
                        />
                        <div>
                          <div className="font-black">{def.label}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">{def.categoryLabel}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveAssignment}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>حفظ تكليف وصلاحيات الخادم في الفعالية</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right / Bottom Column: Assigned Servants List */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-black text-slate-800 flex items-center gap-2 text-base">
              <Users className="w-5 h-5 text-emerald-600" />
              <span>الخدام المعينون لهذه الفعالية ({assignments.length})</span>
            </h4>
          </div>

          {assignments.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                لم يتم تعيين خدام مخصصين لهذه الفعالية بعد
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                حالياً المسؤولون الكبار فقط يرون هذه الفعالية. اختر أي خادم من القائمة المجاورة لمنحه صلاحية تنظيم التسجيلات أو مسح الـ QR Code.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(asgn => (
                <div
                  key={asgn.id}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/60 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {asgn.userPhotoUrl ? (
                        <img
                          src={asgn.userPhotoUrl}
                          alt={asgn.userName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-sm">
                          {asgn.userName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-black text-slate-900 text-sm">{asgn.userName}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          {asgn.userRole && (
                            <span className="font-semibold text-indigo-600">
                              {ROLE_LABELS[asgn.userRole] || asgn.userRole}
                            </span>
                          )}
                          {asgn.userPhone && (
                            <span dir="ltr" className="font-mono text-slate-700">
                              {asgn.userPhone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditAssignment(asgn)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="تعديل الصلاحيات"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignment(asgn)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                        title="إلغاء التكليف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {asgn.roles.map(r => {
                      const meta = EVENT_STAFF_ROLE_LABELS[r];
                      return (
                        <span
                          key={r}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            meta?.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {meta?.label || r}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
