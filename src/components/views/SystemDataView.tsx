import React, { useState } from 'react';
import { Registrant, AdminPermissions, UserRole, BlockedUser, getMemberGender } from '../../types';
import { exportToCSV, storageService, DEFAULT_ADMIN_PERMISSIONS, ROLE_PERMISSIONS, normalizeArabicNameForComparison, normalizeMember, filterOutDeletedAndGhosts } from '../../services/storageService';
import { EditMemberModal } from '../EditMemberModal';
import { WhatsAppSelectorModal } from '../WhatsAppSelectorModal';
import { 
  Search, 
  Download, 
  MessageCircle, 
  Trash2, 
  Calendar, 
  User, 
  Phone, 
  ShieldCheck, 
  UserX, 
  UserCheck, 
  Settings, 
  Check, 
  X,
  Sparkles,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  MapPin,
  FileText,
  Edit3,
  Crown,
  Ban,
  Lock
} from 'lucide-react';

interface SystemDataViewProps {
  registrants: Registrant[];
  onRefresh: () => void;
  currentUserRole?: UserRole;
}

export function calculateAge(dobString: string): { age: number | null; label: string } {
  if (!dobString) return { age: null, label: '—' };
  const parts = dobString.split('-');
  if (parts.length < 3) return { age: null, label: '—' };
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10) - 1;
  const birthDay = parseInt(parts[2], 10);
  if (isNaN(birthYear) || isNaN(birthMonth) || isNaN(birthDay)) {
    return { age: null, label: '—' };
  }
  const birthDate = new Date(birthYear, birthMonth, birthDay);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return { age: age >= 0 ? age : 0, label: age >= 0 ? `${age} سنة` : '—' };
}

export const SystemDataView: React.FC<SystemDataViewProps> = ({ 
  registrants, 
  onRefresh,
  currentUserRole 
}) => {
  const isCommunityOwner =
    currentUserRole === 'community_owner' ||
    (currentUserRole as string) === 'مسؤول المجتمع' ||
    (currentUserRole as string) === 'مسؤل المجتمع' ||
    storageService.isCommunityOwnerLoggedIn();

  const isTargetOwner = (m?: Partial<Registrant> | null): boolean => {
    if (!m) return false;
    return (
      m.role === 'community_owner' ||
      (m.role as string) === 'مسؤول المجتمع' ||
      (m.role as string) === 'مسؤل المجتمع' ||
      (m as any).isOwner === true ||
      m.id === 'reg_owner_main'
    );
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled' | 'admins' | 'blocked'>('all');
  
  // Admin permissions modal state
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<Registrant | null>(null);
  const [editingTargetRole, setEditingTargetRole] = useState<UserRole>('servant');
  const [currentPermissions, setCurrentPermissions] = useState<AdminPermissions>(DEFAULT_ADMIN_PERMISSIONS);

  // WhatsApp & WhatsApp Business Selector Modal state
  const [whatsAppModalData, setWhatsAppModalData] = useState<{ phone: string; name: string } | null>(null);
  
  // Quick Edit Address & Notes modal state
  const [editingNotesUser, setEditingNotesUser] = useState<Registrant | null>(null);
  const [tempAddress, setTempAddress] = useState('');
  const [tempNotes, setTempNotes] = useState('');

  // Full Edit Member modal state (for Community Owner and Community Manager)
  const [editingFullMember, setEditingFullMember] = useState<Registrant | null>(null);

  // Community Owner Exclusive: Permanent Delete Confirmation
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<Registrant | null>(null);

  // Community Owner Exclusive: Permanent Block Confirmation
  const [blockConfirmUser, setBlockConfirmUser] = useState<Registrant | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // Notification banner
  const [actionNotification, setActionNotification] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Blocked users list
  const blockedUsersList = storageService.getBlockedUsers();

  // Filter logic (normalize all records while excluding ghosts and permanently deleted members)
  const seenNormIds = new Set<string>();
  const normalizedRegistrants: Registrant[] = [];
  const rawCleaned = filterOutDeletedAndGhosts(Array.isArray(registrants) ? registrants : []);
  for (let idx = 0; idx < rawCleaned.length; idx++) {
    const r = rawCleaned[idx];
    const norm = normalizeMember(r, idx) as Registrant | null;
    if (!norm) continue;
    const g = getMemberGender(norm);
    let safeId = String(norm.id || '').trim();
    if (!safeId || seenNormIds.has(safeId)) {
      safeId = `${safeId || 'CF'}-ROW-${idx + 1}`;
    }
    seenNormIds.add(safeId);
    normalizedRegistrants.push({ ...norm, id: safeId, gender: g, sex: g });
  }
  const filtered = normalizedRegistrants.filter((r) => {
    if (!r || !r.id) return false;
    const q = searchQuery.toLowerCase().trim();
    const normQ = normalizeArabicNameForComparison(searchQuery);
    const normFullName = normalizeArabicNameForComparison(r.fullName || '');
    const matchesSearch =
      !q ||
      (r.fullName || '').toLowerCase().includes(q) ||
      (normQ && normFullName.includes(normQ)) ||
      (r.phone || '').includes(q) ||
      (r.whatsapp || '').includes(q) ||
      (r.address && r.address.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q)) ||
      (r.uniqueCode || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    const memberStatus = r.status || 'active';
    const memberRole = r.role || 'member';
    if (statusFilter === 'active') return memberStatus === 'active';
    if (statusFilter === 'cancelled') return memberStatus === 'cancelled';
    if (statusFilter === 'admins') return memberRole !== 'member';

    return true;
  });

  const filteredBlocked = blockedUsersList.filter(b => {
    if (!b) return false;
    const q = searchQuery.toLowerCase().trim();
    return (
      (b.fullName || '').toLowerCase().includes(q) ||
      (b.phone || '').includes(q) ||
      (b.whatsapp || '').includes(q) ||
      (b.reason && b.reason.toLowerCase().includes(q))
    );
  });

  const handleOpenPermissionsModal = (user: Registrant) => {
    if (isTargetOwner(user)) return;
    setEditingPermissionsUser(user);
    const initialRole = user.role === 'member' ? 'servant' : user.role;
    setEditingTargetRole(initialRole);
    setCurrentPermissions(user.permissions || ROLE_PERMISSIONS[initialRole] || DEFAULT_ADMIN_PERMISSIONS);
  };

  const handleSavePermissions = () => {
    if (!editingPermissionsUser) return;
    if (isTargetOwner(editingPermissionsUser) || editingTargetRole === 'community_owner') return;
    storageService.updateMemberRole(editingPermissionsUser.id, editingTargetRole, currentPermissions, currentUserRole);
    const memberName = editingPermissionsUser.fullName;
    setEditingPermissionsUser(null);
    setActionNotification(`تم تحديث رتبة وصلاحيات (${memberName}) بنجاح.`);
    setTimeout(() => setActionNotification(null), 4000);
    onRefresh();
  };

  const handleOpenNotesModal = (user: Registrant) => {
    if (isTargetOwner(user) && !isCommunityOwner) return;
    setEditingNotesUser(user);
    setTempAddress(user.address || '');
    setTempNotes(user.notes || '');
  };

  const handleSaveNotes = async () => {
    if (!editingNotesUser) return;
    if (isTargetOwner(editingNotesUser) && !isCommunityOwner) return;
    const trimmedNotes = tempNotes.trim();
    const trimmedAddress = tempAddress.trim();
    if (!trimmedNotes) {
      storageService.clearVisitationNotesForMember(editingNotesUser.id);
    }
    const nowMs = Date.now();
    const updated: Registrant = {
      ...editingNotesUser,
      address: trimmedAddress,
      residence: trimmedAddress,
      notes: trimmedNotes,
      talents: trimmedNotes,
      skills: trimmedNotes,
      updatedAt: nowMs,
      lastUpdatedAt: new Date(nowMs).toISOString()
    } as Registrant;
    await storageService.updateRegistrant(updated, currentUserRole);
    setEditingNotesUser(null);
    onRefresh();
  };

  const handleDemoteAdmin = (user: Registrant) => {
    if (user.role === 'community_owner') return;
    storageService.updateMemberRole(user.id, 'member', undefined, currentUserRole);
    onRefresh();
  };

  const handleToggleMembershipStatus = async (user: Registrant) => {
    if (!isCommunityOwner || user.role === 'community_owner') return;
    setIsProcessingAction(true);
    try {
      if (user.status === 'cancelled') {
        storageService.activateMembership(user.id, currentUserRole);
        setActionNotification(`تمت إعادة تفعيل عضوية (${user.fullName}) بنجاح.`);
      } else {
        await storageService.cancelMembership(user.id, currentUserRole);
        setActionNotification(`تم إلغاء عضوية (${user.fullName}). لن يتمكن من الدخول للموقع.`);
      }
    } finally {
      setIsProcessingAction(false);
    }
    setTimeout(() => setActionNotification(null), 4000);
    onRefresh();
  };

  // 1. Permanent Delete Handler (Community Owner Only)
  const handleConfirmPermanentDelete = async () => {
    if (!deleteConfirmUser || !isCommunityOwner) return;
    setIsProcessingAction(true);
    const targetName = deleteConfirmUser.fullName;
    const targetId = deleteConfirmUser.id;
    setDeleteConfirmUser(null);

    await storageService.deleteRegistrant(targetId, currentUserRole);
    setIsProcessingAction(false);
    onRefresh();
    setActionNotification(`تم مسح بيانات (${targetName}) تماماً من الموقع وقواعد البيانات السحابية.`);
    setTimeout(() => setActionNotification(null), 5000);
  };

  // 2. Permanent Block Handler (Community Owner Only)
  const handleConfirmPermanentBlock = async () => {
    if (!blockConfirmUser || !isCommunityOwner) return;
    setIsProcessingAction(true);
    const targetName = blockConfirmUser.fullName;
    const targetId = blockConfirmUser.id;
    const reason = blockReason.trim();
    setBlockConfirmUser(null);
    setBlockReason('');

    const res = await storageService.blockMember(targetId, reason, currentUserRole);
    setIsProcessingAction(false);
    if (res.success) {
      onRefresh();
      setActionNotification(`تم حظر (${targetName}) نهائياً ومسحه ومنع رقم هاتفه من التسجيل في الموقع.`);
      setTimeout(() => setActionNotification(null), 5000);
    }
  };

  // 3. Unblock Handler (Community Owner Only)
  const handleUnblock = async (blocked: BlockedUser) => {
    if (!isCommunityOwner) return;
    setIsProcessingAction(true);
    await storageService.unblockUser(blocked.id, currentUserRole);
    setIsProcessingAction(false);
    onRefresh();
    setActionNotification(`تم فك الحظر عن (${blocked.fullName}) بنجاح، ويمكنه التسجيل الآن.`);
    setTimeout(() => setActionNotification(null), 4000);
  };

  const handleExportCSV = () => {
    const rows = filtered.map((r, idx) => {
      const ageInfo = calculateAge(r.dob);
      return {
        '#': idx + 1,
        'الكود التعريفي': r.uniqueCode,
        'اسم المخدوم (ثلاثي)': r.fullName,
        'الرتبة': r.role === 'priest' ? 'أبونا (كاهن الاجتماع)' : r.role === 'community_owner' ? 'Community Owner' : r.role === 'community_manager' ? 'Community Manager' : r.role === 'meeting_secretary' ? 'أمين اجتماع' : r.role === 'service_secretary' ? 'أمين خدمة' : r.role === 'servant' ? 'خادم' : 'مخدوم',
        'حالة العضوية': r.status === 'cancelled' ? 'عضوية ملغاة' : 'نشط',
        'رقم الهاتف': r.phone,
        'رقم الواتساب': r.whatsapp,
        'عنوان المنزل': r.address || '—',
        'تاريخ الميلاد': r.dob,
        'العمر (بالسنوات)': ageInfo.label,
        'ملاحظات': r.notes || '—',
        'تاريخ التسجيل': new Date(r.registeredAt).toLocaleDateString('ar-EG'),
      };
    });
    exportToCSV(`سجل_أسماء_وبيانات_المخدومين_${new Date().toISOString().split('T')[0]}`, rows);
  };

  return (
    <div className="space-y-6">
      
      {/* Action Notification Banner */}
      {actionNotification && (
        <div className="p-4 rounded-2xl bg-emerald-950 text-emerald-200 border border-emerald-500/50 flex items-center justify-between text-xs font-bold shadow-md animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotification}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setActionNotification(null)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Bar with Search & Export */}
      <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>قاعدة البيانات وإدارة المشرفين والعضويات</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
              {statusFilter === 'blocked' ? `${blockedUsersList.length} محظور` : `${filtered.length} مسجل`}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isCommunityOwner 
              ? 'بصفتك مسؤول المجتمع (Community Owner): لديك الصلاحية الحصرية لإلغاء عضوية ومسح بيانات أي شخص نهائياً، أو حظره نهائياً ومنع رقم هاتفه من التسجيل.'
              : 'يمكنك هنا استعراض بيانات المسجلين وتحديد صلاحيات المشرفين.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Status filter buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-[11px] cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({registrants.length})
            </button>
            <button
              onClick={() => setStatusFilter('admins')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-[11px] cursor-pointer ${
                statusFilter === 'admins' ? 'bg-amber-500 text-slate-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الخدام والأمناء ({registrants.filter(r => r.role !== 'member').length})
            </button>
            {isCommunityOwner && (
              <button
                onClick={() => setStatusFilter('blocked')}
                className={`px-3 py-1.5 rounded-xl font-bold transition text-[11px] cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'blocked' ? 'bg-red-600 text-white shadow-2xs' : 'text-red-700 hover:bg-red-50'
                }`}
              >
                <Ban className="w-3 h-3" />
                <span>المحظورين نهائياً ({blockedUsersList.length})</span>
              </button>
            )}
          </div>

          {/* Search box */}
          <div className="relative flex-1 md:w-56">
            <input 
              type="text"
              placeholder="بحث بالاسم، الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
          </div>

          {/* Export to CSV */}
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* Main Table or Blocked Users View */}
      {statusFilter === 'blocked' ? (
        <div className="bg-white rounded-3xl shadow-xs border border-red-200 overflow-hidden">
          <div className="p-4 bg-red-50/80 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-sm text-red-950">قائمة المحظورين نهائياً من التسجيل بالموقع</h3>
                <p className="text-xs text-red-700">هؤلاء الأشخاص تم حظرهم ومسحهم من الموقع، ولا يمكنهم التسجيل مجدداً إلا بفك الحظر من جانبك كمسؤول للمجتمع.</p>
              </div>
            </div>
            <span className="text-xs bg-red-600 text-white font-bold px-3 py-1 rounded-full">
              {filteredBlocked.length} محظور
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">الاسم</th>
                  <th className="py-3 px-4">عنوان الـ IP المحظور</th>
                  <th className="py-3 px-4">رقم الهاتف المحظور</th>
                  <th className="py-3 px-4">رقم الواتساب</th>
                  <th className="py-3 px-4">كود العضوية السابق</th>
                  <th className="py-3 px-4">سبب الحظر</th>
                  <th className="py-3 px-4">تاريخ الحظر</th>
                  <th className="py-3 px-4">بواسطة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredBlocked.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-600" />
                      <p className="text-sm font-bold text-slate-500">لا يوجد أي مستخدم محظور حالياً في النظام</p>
                    </td>
                  </tr>
                ) : (
                  filteredBlocked.map((b, idx) => (
                    <tr key={b.id || idx} className="hover:bg-red-50/20">
                      <td className="py-3 px-4 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{b.fullName}</td>
                      <td className="py-3 px-4 font-mono text-red-700 font-bold" dir="ltr">
                        {b.ipAddress ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 border border-red-200 text-[11px]">
                            {b.ipAddress}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-red-600 font-bold" dir="ltr">{b.phone}</td>
                      <td className="py-3 px-4 font-mono text-slate-600" dir="ltr">{b.whatsapp || b.phone}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{b.uniqueCode || '—'}</td>
                      <td className="py-3 px-4 text-slate-600">{b.reason || 'حظر نهائي ومسح العضوية'}</td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {b.blockedAt ? new Date(b.blockedAt).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{b.blockedBy || 'مسؤول المجتمع'}</td>
                      <td className="py-3 px-4 text-center">
                        {isCommunityOwner && (
                          <button
                            type="button"
                            onClick={() => handleUnblock(b)}
                            disabled={isProcessingAction}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs transition flex items-center gap-1 mx-auto cursor-pointer"
                            title="إلغاء الحظر عن الشخص والـ IP والسماح بالتسجيل مرة أخرى"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>إلغاء الحظر 🔓</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-bold text-slate-600">
                  <th className="py-3.5 px-4">#</th>
                  <th className="py-3.5 px-4">الصورة</th>
                  <th className="py-3.5 px-4">اسم المخدوم</th>
                  <th className="py-3.5 px-4">الرتبة</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4">الهاتف</th>
                  <th className="py-3.5 px-4">الواتساب</th>
                  <th className="py-3.5 px-4">عنوان المنزل</th>
                  <th className="py-3.5 px-4">تاريخ الميلاد</th>
                  <th className="py-3.5 px-4">العمر</th>
                  <th className="py-3.5 px-4">ملاحظات</th>
                  <th className="py-3.5 px-4 text-center">إدارة الصلاحيات والإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">لا توجد سجلات مطابقة للبحث أو التصفية</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((reg, index) => {
                    const isCancelled = reg.status === 'cancelled';
                    const isLeader = reg.role !== 'member';

                    const cleanWa = (reg.whatsapp || reg.phone || '').replace(/[^0-9]/g, '');
                    const waLink = cleanWa ? `https://wa.me/${cleanWa}` : '#';
                    const cleanPhone = (reg.phone || '').replace(/[^0-9+]/g, '');
                    const telLink = cleanPhone ? `tel:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}` : '#';
                    const ageInfo = calculateAge(reg.dob || '');

                    return (
                      <tr 
                        key={reg.id || `reg_${index}`} 
                        className={`hover:bg-slate-50/80 transition ${isCancelled ? 'bg-red-50/30 opacity-75' : ''}`}
                      >
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {index + 1}
                        </td>

                        <td className="py-3 px-4">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-2xs">
                            {reg.photoUrl && reg.photoUrl.trim() !== '' ? (
                              <img 
                                src={reg.photoUrl} 
                                alt={reg.fullName || 'عضو'} 
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold text-xs">
                                {reg.fullName ? reg.fullName.charAt(0) : '?'}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-sm text-slate-900">
                            {reg.fullName}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 block">
                            {reg.uniqueCode}
                          </span>
                        </td>

                        {/* Role */}
                        <td className="py-3 px-4">
                          {isLeader ? (
                            <span className={`inline-flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full text-[11px] border ${
                              reg.role === 'priest' ? 'bg-purple-900 text-amber-300 border-amber-400 font-black' :
                              reg.role === 'community_owner' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                              reg.role === 'community_manager' ? 'bg-cyan-100 text-cyan-900 border-cyan-300' :
                              reg.role === 'meeting_secretary' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                              reg.role === 'service_secretary' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                              'bg-emerald-100 text-emerald-900 border-emerald-300'
                            }`}>
                              <ShieldCheck className="w-3 h-3 text-current" />
                              <span>
                                {reg.role === 'priest' ? '✝️ أبونا' :
                                 reg.role === 'community_owner' ? '👑 Community Owner' :
                                 reg.role === 'community_manager' ? '⚡ Community Manager' :
                                 reg.role === 'meeting_secretary' ? 'أمين اجتماع' :
                                 reg.role === 'service_secretary' ? 'أمين خدمة' : 'خادم'}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-500 font-medium">
                              مخدوم
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full text-[11px] border border-red-200">
                              <UserX className="w-3 h-3" />
                              <span>عضوية ملغاة</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                              <UserCheck className="w-3 h-3" />
                              <span>نشط</span>
                            </span>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="py-3 px-4 font-mono text-slate-600" dir="ltr">
                          <a 
                            href={telLink}
                            className="inline-flex items-center gap-1 hover:text-emerald-700 hover:underline"
                            title="اتصال هاتفي مباشر"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{reg.phone}</span>
                          </a>
                        </td>

                        {/* WhatsApp */}
                        <td className="py-3 px-4">
                          <button 
                            type="button"
                            onClick={() => setWhatsAppModalData({ phone: reg.whatsapp || reg.phone, name: reg.fullName })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition font-mono text-[11px] cursor-pointer"
                            dir="ltr"
                            title="مراسلة عبر واتساب أو واتساب للأعمال"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            <span>{reg.whatsapp}</span>
                          </button>
                        </td>

                        {/* Home Address (عنوان المنزل) */}
                        <td className="py-3 px-4 text-slate-700 max-w-[160px] truncate" title={reg.address || 'غير محدد'}>
                          {reg.address ? (
                            <span className="inline-flex items-center gap-1 text-slate-800">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">{reg.address}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">غير محدد</span>
                          )}
                        </td>

                        {/* DOB */}
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {reg.dob}
                        </td>

                        {/* Age (العمر) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {ageInfo.age !== null ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-bold text-[11px] border border-blue-200">
                              {ageInfo.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Notes (ملاحظات) */}
                        <td className="py-3 px-4 max-w-[150px] truncate" title={reg.notes || 'لا توجد ملاحظات'}>
                          <div className="flex items-center gap-1">
                            <span className="truncate text-slate-700">
                              {reg.notes || <span className="text-slate-400 italic">لا توجد</span>}
                            </span>
                            {(!isTargetOwner(reg) || isCommunityOwner) && (
                              <button
                                type="button"
                                onClick={() => handleOpenNotesModal(reg)}
                                className="p-1 text-slate-400 hover:text-emerald-700 rounded-md hover:bg-slate-100 transition shrink-0"
                                title="تعديل العنوان والملاحظات"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          {isTargetOwner(reg) ? (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-950 border border-amber-300 text-xs font-black shadow-xs">
                                <Crown className="w-3.5 h-3.5 text-amber-600" />
                                <span>مسؤول المجتمع</span>
                              </div>
                              {isCommunityOwner && (
                                <button
                                  type="button"
                                  onClick={() => setEditingFullMember(reg)}
                                  className="px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition border cursor-pointer bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
                                  title="تعديل بياناتي الشخصية كمسؤول للمجتمع"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                                  <span>تعديل بياناتي</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              
                              {/* Full Edit Info: Available for Community Owner, Community Manager, or any user with canEditMembers */}
                              {(currentUserRole === 'community_owner' ||
                                currentUserRole === 'community_manager' ||
                                storageService.canEditMemberData({ role: currentUserRole }, reg.id, reg.role)) && (
                                <button
                                  type="button"
                                  onClick={() => setEditingFullMember(reg)}
                                  className="px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition border cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                                  title="تعديل كافة بيانات المخدوم في السجل"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>تعديل</span>
                                </button>
                              )}

                              {/* Promote/Edit Admin Permissions */}
                              <button
                                type="button"
                                onClick={() => handleOpenPermissionsModal(reg)}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                title="تحديد امتيازات المشرف"
                              >
                                <Settings className="w-3.5 h-3.5 text-amber-700" />
                                <span>{isLeader ? 'الامتيازات' : 'رتبة'}</span>
                              </button>

                              {/* COMMUNITY OWNER EXCLUSIVE: Cancel Membership & Wipe Data Completely */}
                              {isCommunityOwner && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmUser(reg)}
                                  className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-300 font-bold text-[11px] flex items-center gap-1 transition shadow-2xs cursor-pointer"
                                  title="إلغاء العضوية ومسح كافة بيانات هذا العضو تماماً من الموقع وقائمة المخدومين"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-orange-700" />
                                  <span>إلغاء العضوية ومسح البيانات</span>
                                </button>
                              )}

                              {/* COMMUNITY OWNER EXCLUSIVE: Permanent Block */}
                              {isCommunityOwner && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBlockConfirmUser(reg);
                                    setBlockReason('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs cursor-pointer"
                                  title="حظر نهائي ومنع هذا الشخص ورقم هاتفه من التسجيل في الموقع مجدداً"
                                >
                                  <Ban className="w-3.5 h-3.5 text-white" />
                                  <span>حظر نهائي 🚫</span>
                                </button>
                              )}

                            </div>
                          )}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          ADMIN PERMISSIONS MODAL (تحديد الامتيازات المتغيرة لكل مشرف)
          ======================================================== */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn">
            
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تحديد امتيازات المشرف (Admin Permissions)
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    العضو: <strong className="text-slate-900">{editingPermissionsUser.fullName}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingPermissionsUser(null)}
                className="p-1 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 max-h-[70vh] overflow-y-auto px-1">
              {/* Role Selection Dropdown */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                <label className="block text-xs font-black text-amber-950 mb-1.5">
                  رتبة العضو في الخدمة:
                </label>
                <select
                  value={editingTargetRole}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setEditingTargetRole(r);
                    setCurrentPermissions(ROLE_PERMISSIONS[r] || DEFAULT_ADMIN_PERMISSIONS);
                  }}
                  className="w-full text-xs font-bold rounded-xl border border-amber-300 bg-white py-2 px-3 text-slate-900 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="servant">خادم (متابعة افتقاد وحضور وأعياد ميلاد)</option>
                  <option value="service_secretary">أمين خدمة</option>
                  <option value="meeting_secretary">أمين اجتماع</option>
                  <option value="priest">أبونا الكاهن ✝️</option>
                  {isCommunityOwner && (
                    <option value="community_manager">مدير المجتمع (Community Manager)</option>
                  )}
                  <option value="member">مخدوم عادي (بدون صلاحيات إدارية)</option>
                </select>
                <p className="text-[11px] text-amber-800 font-medium mt-1">
                  يمكنك تخصيص أي صلاحية أدناه بإلغاء تفعيلها أو تفعيلها بحرية لهذا الخادم/المشرف:
                </p>
              </div>

              <p className="text-xs text-slate-600 font-bold mt-2">
                قائمة الصلاحيات المخصصة (يمكنك تفعيل أو إلغاء أي منها):
              </p>

              {/* Permission 1: Scanner (أخذ الحضور بالماسح الضوئي) */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">أخذ وتسجيل الحضور بالماسح الضوئي (Scanner)</span>
                  <span className="text-[11px] text-slate-500">الوصول للكاميرا ومسح بطاقات هوية الشباب</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canScanAttendance)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canScanAttendance: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 2: Visitation (متابعة ونظام الافتقاد) */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">نظام ومتابعة الافتقاد الرعوي (Visitation)</span>
                  <span className="text-[11px] text-slate-500">الوصول لقوائم الافتقاد وتسجيل الزيارات والملاحظات</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canManageVisitation)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canManageVisitation: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 3: View Database */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">عرض قاعدة البيانات الشاملة وأرقام الهواتف</span>
                  <span className="text-[11px] text-slate-500">استعراض سجلات الشباب المسجلين والبحث</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canViewDatabase)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canViewDatabase: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 4: Edit Members */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">تعديل بيانات وسجلات المخدومين</span>
                  <span className="text-[11px] text-slate-500">تعديل الاسم أو الهاتف أو الصورة أو العنوان</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canEditMembers)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canEditMembers: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 5: Export CSV */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">تصدير البيانات (Excel / CSV)</span>
                  <span className="text-[11px] text-slate-500">تحميل كشوفات الحضور وقواعد البيانات إلى جهاز المشرف</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canExportData)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canExportData: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 6: Print Cards */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">طباعة بطاقات الهوية (ID Cards)</span>
                  <span className="text-[11px] text-slate-500">طباعة الهويات الرسمية ذات الوجهين</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canPrintCards)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canPrintCards: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 7: Cancel Membership */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">إلغاء وإيقاف عضوية الأشخاص</span>
                  <span className="text-[11px] text-slate-500">إلغاء حسابات الأعضاء ومنعهم من الدخول للموقع</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canCancelMembership)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canCancelMembership: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 8: Manage Admins */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer border border-slate-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">تعيين وإدارة المشرفين الآخرين</span>
                  <span className="text-[11px] text-slate-500">صلاحية ترقية أعضاء آخرين لمشرفين</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canManageAdmins)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canManageAdmins: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 9: Can Send Announcements */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/70 hover:bg-blue-100/80 cursor-pointer border border-blue-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-blue-950 block">إرسال وبث الإعلانات والتنبيهات (Announcements) 📢</span>
                  <span className="text-[11px] text-blue-700">منح الخادم امتياز إرسال الإعلانات لشباب الاجتماع من حسابه</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canSendAnnouncements)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canSendAnnouncements: e.target.checked })}
                  className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>

              {/* Permission 10: Can View Makhdomeen Dashboard */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/70 hover:bg-emerald-100/80 cursor-pointer border border-emerald-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-950 block">معاينة داشبورد سجل الأسماء والمخدومين الرئيسي 👥</span>
                  <span className="text-[11px] text-emerald-700">إتاحة ظهور داشبورد الأسماء وبطاقات الهوية والرتب لهذا الخادم</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canViewMakhdomeen)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canViewMakhdomeen: e.target.checked })}
                  className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              {/* Permission 11: Can Manage Competitions (عمل ونشر المسابقات) */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-purple-50/70 hover:bg-purple-100/80 cursor-pointer border border-purple-200/80 transition">
                <div className="text-right">
                  <span className="text-xs font-bold text-purple-950 block">عمل مسابقات الثلاثة فتية ونشرها (Kahoot Competitions) 🎮</span>
                  <span className="text-[11px] text-purple-700">إتاحة ظهور داشبورد مسابقات الثلاثة فتية للخادم وتمكينه من إنشاء ونشر المسابقات التفاعلية</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentPermissions.canManageKahoot)}
                  onChange={(e) => setCurrentPermissions({ ...currentPermissions, canManageKahoot: e.target.checked })}
                  className="w-4 h-4 rounded-md text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </label>

            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              {editingPermissionsUser.role !== 'member' ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDemoteAdmin(editingPermissionsUser);
                    setEditingPermissionsUser(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-red-600 hover:bg-red-50 text-xs font-bold transition"
                >
                  إلغاء الرتبة وتحويله لمخدوم عادي
                </button>
              ) : <div></div>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPermissionsUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ الصلاحيات</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          EDIT ADDRESS & NOTES MODAL (تعديل عنوان المنزل والملاحظات)
          ======================================================== */}
      {editingNotesUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    تعديل العنوان والملاحظات
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingNotesUser.fullName} ({editingNotesUser.uniqueCode})
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setEditingNotesUser(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  عنوان المنزل
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tempAddress}
                    onChange={(e) => setTempAddress(e.target.value)}
                    placeholder="مثال: الخرطوم، بحري / القاهرة، مدينة نصر"
                    className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  ملاحظات الخادم أو السجل
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={tempNotes}
                    onChange={(e) => setTempNotes(e.target.value)}
                    placeholder="اكتب أي ملاحظات أو مواهب أو رعاية مطلوبة..."
                    className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 resize-none"
                  />
                  <FileText className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingNotesUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          FULL EDIT MEMBER MODAL (Community Owner & Manager)
          ======================================================== */}
      {editingFullMember && (
        <EditMemberModal
          member={editingFullMember}
          currentUserRole={currentUserRole}
          isOpen={!!editingFullMember}
          onClose={() => setEditingFullMember(null)}
          onSaveSuccess={() => {
            setEditingFullMember(null);
            onRefresh();
          }}
        />
      )}
      {/* ========================================================
          COMMUNITY OWNER: CONFIRM PERMANENT MEMBERSHIP CANCELLATION & WIPE
          ======================================================== */}
      {deleteConfirmUser && isCommunityOwner && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  إلغاء العضوية ومسح البيانات نهائياً
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  العضو: <strong className="text-slate-900">{deleteConfirmUser.fullName}</strong> ({deleteConfirmUser.uniqueCode})
                </p>
              </div>
            </div>

            <div className="my-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>تحذير مسح نهائي:</span>
              </p>
              <p className="leading-relaxed text-[11px]">
                سيتم مسح حساب وبيانات العضو بالكامل من الموقع، وقائمة المخدومين، وقواعد البيانات السحابية فوراً.
              </p>
              <p className="leading-relaxed text-[11px] font-semibold text-red-950">
                عند محاولته الدخول للموقع سيظهر له أن بياناته غير مسجلة في النظام.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                disabled={isProcessingAction}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                disabled={isProcessingAction}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isProcessingAction ? 'جاري المسح...' : 'نعم، إلغاء العضوية ومسح البيانات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          COMMUNITY OWNER: CONFIRM PERMANENT BLOCK MODAL (حظر نهائي 🚫)
          ======================================================== */}
      {blockConfirmUser && isCommunityOwner && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-300 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  حظر نهائي ومنع من التسجيل بالموقع 🚫
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  الشخص: <strong className="text-slate-900">{blockConfirmUser.fullName}</strong>
                </p>
                <p className="text-xs font-mono text-red-700 font-bold" dir="ltr">
                  {blockConfirmUser.phone}
                </p>
              </div>
            </div>

            <div className="my-4 p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-xs text-red-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-red-600 shrink-0" />
                <span>ما الذي سيحدث عند الحظر الدائم؟</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                <li>سيتم مسح بياناته من الموقع ومن قائمة المخدومين تماماً.</li>
                <li>سيتم حظر رقم هاتفه والواتساب نهائياً ومنعه تماماً من إنشاء حساب جديد أو التسجيل مجدداً.</li>
                <li>إذا حاول الدخول سيظهر له إشعار فوري بأنه محظور بقرار إدارة المجتمع.</li>
              </ul>
            </div>

            <div className="mb-4 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                سبب الحظر (اختياري، للتوثيق في السجل):
              </label>
              <input
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="مثال: إزعاج متكرر، سلوك غير لائق، رقم مزيف..."
                className="w-full text-xs rounded-xl border border-slate-300 py-2.5 px-3 focus:outline-hidden focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setBlockConfirmUser(null);
                  setBlockReason('');
                }}
                disabled={isProcessingAction}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentBlock}
                disabled={isProcessingAction}
                className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-md shadow-red-700/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                <span>{isProcessingAction ? 'جاري الحظر...' : 'تأكيد الحظر الدائم والمسح 🚫'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp & WhatsApp Business Selector Modal */}
      {whatsAppModalData && (
        <WhatsAppSelectorModal
          isOpen={Boolean(whatsAppModalData)}
          onClose={() => setWhatsAppModalData(null)}
          phoneNumber={whatsAppModalData.phone}
          recipientName={whatsAppModalData.name}
          defaultMessage={`سلام ونعمة يا ${whatsAppModalData.name.split(' ')[0]} 🕊️، بطمن عليك من خدمة الثلاثة فتية... منتظرينك في الاجتماع! ❤️✨`}
        />
      )}

    </div>
  );
};
