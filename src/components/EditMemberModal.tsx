import React, { useState, useEffect } from 'react';
import { Registrant, UserRole, getMemberGender } from '../types';
import { 
  storageService, 
  isUserCommunityOwner,
  lockPollingForMutation,
  generateQrCodeDataUrl,
  validateArabicNameInput, 
  validateArabicThreeWords, 
  validateContactNumber, 
  formatPhoneNumberWithCountry,
  validateRealPersonalPhoto, 
  compressImageToBase64,
  resolveSafePhotoUrl,
  processPhotoWithWhiteBackground,
  findDuplicateFaceMember,
  extractFaceSignature,
  detectUserLocation 
} from '../services/storageService';
import { 
  X, 
  User, 
  Phone, 
  MessageCircle, 
  Calendar, 
  MapPin, 
  FileText, 
  Lock, 
  ShieldCheck, 
  Camera, 
  Check, 
  AlertCircle, 
  Crown,
  KeyRound,
  Sparkles,
  Trash2,
  RefreshCw,
  QrCode as QrIcon
} from 'lucide-react';

interface EditMemberModalProps {
  member: Registrant;
  currentUserRole?: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updated: Registrant) => void;
  onNotification?: (message: string) => void;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  currentUserRole,
  isOpen,
  onClose,
  onSaveSuccess,
  onNotification
}) => {
  if (!isOpen) return null;

  const isTargetOwner =
    member.role === 'community_owner' ||
    (member.role as string) === 'مسؤول المجتمع' ||
    (member.role as string) === 'مسؤل المجتمع' ||
    (member as any).isOwner === true ||
    member.id === 'reg_owner_main';

  const resolveActiveActor = () => {
    try {
      const list = storageService.getRegistrants();
      const adminRaw = sessionStorage.getItem('three_youths_admin_session_v2') || sessionStorage.getItem('three_youths_admin_session_v1');
      if (adminRaw) {
        const sess = JSON.parse(adminRaw);
        const matched = list.find(r => (sess.id && r.id === sess.id) || (sess.name && r.fullName === sess.name));
        if (matched) return matched;
        return { ...sess, role: currentUserRole || sess.role };
      }
      const memRaw = sessionStorage.getItem('three_youths_member_session_v2') || sessionStorage.getItem('three_youths_member_session_v1');
      if (memRaw) {
        const mem = JSON.parse(memRaw);
        const matched = list.find(r => r.id === mem.id || r.fullName === mem.fullName);
        if (matched) return matched;
        return mem;
      }
    } catch {}
    return { role: currentUserRole || 'member' };
  };

  const activeActor = resolveActiveActor();

  // STRICT SOVEREIGN PROTOCOL: Member Profile Modal access & editing is 100% exclusive to Community Owner (ميخائيل ادور راتب)
  const isActorOwner =
    isUserCommunityOwner(activeActor) ||
    isUserCommunityOwner(currentUserRole) ||
    storageService.isCommunityOwnerLoggedIn();

  if (!isActorOwner) return null;

  const canEditThisMember = isActorOwner;

  const detectInitialCountry = (val?: string): 'sudan' | 'egypt' => {
    const s = String(val || '').trim();
    if (s.startsWith('+20') || s.startsWith('0020') || /^01[0125]/.test(s)) return 'egypt';
    return 'sudan';
  };

  const stripPrefixForInput = (val: string, country: 'sudan' | 'egypt'): string => {
    const res = formatPhoneNumberWithCountry(val, country);
    return res.nationalDigits || val;
  };

  const initialPhoneCountry = detectInitialCountry(member.phone);
  const initialWhatsappCountry = detectInitialCountry(member.whatsapp || member.phone);

  // Form State
  const [fullName, setFullName] = useState(member.fullName || (member as any).name || '');
  const [phoneCountry, setPhoneCountry] = useState<'sudan' | 'egypt'>(initialPhoneCountry);
  const [whatsappCountry, setWhatsappCountry] = useState<'sudan' | 'egypt'>(initialWhatsappCountry);
  const [phone, setPhone] = useState(() => stripPrefixForInput(member.phone || '', initialPhoneCountry));
  const [whatsapp, setWhatsapp] = useState(() => stripPrefixForInput(member.whatsapp || member.phone || '', initialWhatsappCountry));
  const [dob, setDob] = useState(member.dob || (member as any).birthDate || '');
  const initialGender = getMemberGender(member);
  const [gender, setGender] = useState<'male' | 'female'>(initialGender);
  const [address, setAddress] = useState(member.address || (member as any).residence || '');
  const [notes, setNotes] = useState(
    member.notes || (member as any).talents || (member as any).skills || ''
  );
  const [photoUrl, setPhotoUrl] = useState(
    resolveSafePhotoUrl(member.photoUrl || (member as any).avatar || (member as any).image, member.id) ||
      member.photoUrl ||
      ''
  );
  const [password, setPassword] = useState(member.password || '');
  const [recoveryCode, setRecoveryCode] = useState(member.recoveryCode || '');
  const [unlockCredentialsEdit, setUnlockCredentialsEdit] = useState(false);
  const [memberRole, setMemberRole] = useState<UserRole>(member.role || 'member');
  const isMeetingSecretaryRevoked = storageService.isRoleRevoked('meeting_secretary');

  // Unified QR Display & Regeneration State (uniqueCode is 100% FIXED forever; ONLY qrData rotates!)
  const [displayUniqueCode] = useState<string>(member.uniqueCode || '');
  const [displayQrData, setDisplayQrData] = useState<string>(String(member.qrData || member.qrCode || member.uniqueCode || '').trim());
  const [displayQrCodeUrl, setDisplayQrCodeUrl] = useState<string>('');
  const [isRegeneratingQr, setIsRegeneratingQr] = useState<boolean>(false);
  const [qrRegenToast, setQrRegenToast] = useState<string | null>(null);

  useEffect(() => {
    const qrPayload = String(displayQrData || displayUniqueCode || '').trim();
    if (!qrPayload) return;
    let active = true;
    generateQrCodeDataUrl(qrPayload)
      .then((url) => {
        if (active && url) setDisplayQrCodeUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [displayQrData, displayUniqueCode]);

  const handleRegenerateQrInsideProfile = async () => {
    if (!isActorOwner || isTargetOwner || isRegeneratingQr) return;
    lockPollingForMutation();
    setIsRegeneratingQr(true);
    setQrRegenToast(null);
    setGeneralError(null);
    try {
      const res = await storageService.regenerateMemberQrCode(member.id, 'community_owner');
      const nextQrToken = res.newQrData || res.registrant?.qrData || res.newCode;
      if (res.success && nextQrToken) {
        setDisplayQrData(nextQrToken);
        if (res.newQrDataUrl) {
          setDisplayQrCodeUrl(res.newQrDataUrl);
        } else {
          const freshUrl = await generateQrCodeDataUrl(nextQrToken);
          if (freshUrl) setDisplayQrCodeUrl(freshUrl);
        }
        const confirmedMsg = `تم تحديث رمز الـ QR وربطه نهائياً باسم (${member.fullName}) مع ثبات كود العضوية (${displayUniqueCode}) ✓`;
        setQrRegenToast(confirmedMsg);
        onNotification?.(confirmedMsg);
        setTimeout(() => setQrRegenToast(null), 4500);
      } else {
        setGeneralError(res.error || 'تعذر إعادة تعيين رمز الـ QR.');
      }
    } catch {
      setGeneralError('حدث خطأ أثناء إعادة تعيين رمز الـ QR.');
    } finally {
      setIsRegeneratingQr(false);
    }
  };

  // Validation & UI State
  const [nameError, setNameError] = useState<string | null>(null);
  const [hasEnglishError, setHasEnglishError] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const phoneAnalysis = formatPhoneNumberWithCountry(phone, phoneCountry);
  const whatsappAnalysis = formatPhoneNumberWithCountry(whatsapp || phone, whatsapp ? whatsappCountry : phoneCountry);

  const handleDeleteMemberFromCloud = async () => {
    if (!isActorOwner || isTargetOwner) return;
    lockPollingForMutation();
    setIsDeleting(true);
    try {
      await storageService.deleteRegistrant(member.id, 'community_owner');
      onNotification?.('تم تحديث البيانات بنسبة 100%');
      onSaveSuccess({ ...member, status: 'cancelled' });
      onClose();
    } catch {
      setGeneralError('حدث خطأ أثناء مسح بيانات العضو من السحابة.');
      setIsDeleting(false);
    }
  };

  // Real-time Name Validation
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFullName(val);

    if (!val) {
      setNameError(null);
      setHasEnglishError(false);
      return;
    }

    const check = validateArabicNameInput(val);
    if (check.hasEnglish) {
      setHasEnglishError(true);
      setNameError('خطأ: يرجى كتابة الاسم باللغة العربية فقط! الحروف الإنجليزية غير مسموح بها.');
    } else if (!check.isValid && check.error) {
      setHasEnglishError(false);
      setNameError(check.error);
    } else {
      setHasEnglishError(false);
      setNameError(null);
    }
  };

  // Photo Upload Handler with Verification
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('يرجى اختيار ملف صورة صالح (JPEG أو PNG).');
      return;
    }

    setIsVerifyingPhoto(true);
    setPhotoError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        setIsVerifyingPhoto(false);
        return;
      }

      try {
        const compressed = await compressImageToBase64(rawDataUrl, 250, 0.75);
        // Validate real photo
        const verification = await validateRealPersonalPhoto(compressed);
        if (!verification.isValid) {
          setIsVerifyingPhoto(false);
          setPhotoError(verification.error || 'عذراً، يجب أن تكون الصورة فوتوغرافية حقيقية للوجه.');
          return;
        }

        // Check duplicate face (exclude current editing member)
        const dupCheck = await findDuplicateFaceMember(compressed, member.id);
        if (dupCheck.isDuplicate && dupCheck.matchedMember) {
          setIsVerifyingPhoto(false);
          setPhotoError(`عذراً، ملامح هذا الوجه مسجلة بالفعل باسم مخدوم آخر: (${dupCheck.matchedMember.fullName} - كود: ${dupCheck.matchedMember.uniqueCode}).`);
          return;
        }

        setIsVerifyingPhoto(false);
        setPhotoUrl(compressed);
        setPhotoError(null);
      } catch {
        setIsVerifyingPhoto(false);
        setPhotoUrl(rawDataUrl);
        setPhotoError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyPhoneToWhatsapp = () => {
    setWhatsappCountry(phoneCountry);
    setWhatsapp(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!canEditThisMember || !isActorOwner) {
      setGeneralError('عذراً: الدخول للملف الشخصي وتعديل البيانات مقصور على مسؤول المجتمع فقط.');
      return;
    }

    // 1. Validate Arabic Full Name (3 words)
    const nameVal = validateArabicThreeWords(fullName);
    if (!nameVal.isValid) {
      setGeneralError(nameVal.error || 'يرجى كتابة الاسم ثلاثياً باللغة العربية');
      return;
    }

    // 2. Validate Phone with selected country
    const phoneVal = formatPhoneNumberWithCountry(phone, phoneCountry);
    if (!phoneVal.isValid) {
      setGeneralError(phoneVal.error || 'خطأ : الرقم ناقص');
      return;
    }

    // 3. Validate WhatsApp with selected country
    const effectiveWhatsappInput = whatsapp.trim() || phone.trim();
    const effectiveWhatsappCountry = whatsapp.trim() ? whatsappCountry : phoneCountry;
    const whatsappVal = formatPhoneNumberWithCountry(effectiveWhatsappInput, effectiveWhatsappCountry);
    if (!whatsappVal.isValid) {
      setGeneralError(whatsappVal.error || 'خطأ : الرقم ناقص');
      return;
    }

    lockPollingForMutation();
    setIsSaving(true);

    try {
      let processedPhoto = resolveSafePhotoUrl(photoUrl, member.id) || photoUrl || '';
      if (processedPhoto && processedPhoto.startsWith('data:image/')) {
        try {
          processedPhoto = await compressImageToBase64(processedPhoto, 250, 0.75);
        } catch {}
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const cleanFullName = fullName.trim().replace(/\s+/g, ' ');
      const cleanPhone = phoneVal.formatted.trim();
      const cleanWhatsapp = whatsappVal.formatted.trim();
      const cleanDob = dob.trim() || member.dob || '';
      const cleanAddress = address.trim();
      const cleanNotes = notes.trim();
      const finalRole: UserRole = isTargetOwner ? 'community_owner' : memberRole;
      const roleChanged = finalRole !== member.role;
      const effectiveCode = String(member.uniqueCode || displayUniqueCode || '').trim();
      const effectiveQr = String(displayQrData || member.qrData || member.qrCode || effectiveCode).trim();

      const updatedRegistrant: Registrant = {
        ...member,
        uniqueCode: effectiveCode || member.uniqueCode,
        qrData: effectiveQr || effectiveCode,
        qrCode: effectiveQr || effectiveCode,
        fullName: cleanFullName,
        name: cleanFullName,
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        dob: cleanDob,
        birthDate: cleanDob,
        gender,
        sex: gender,
        genderCode: gender,
        manualGender: gender,
        genderLabel: gender === 'female' ? 'أنثى' : 'ذكر',
        type: gender === 'female' ? 'شابة' : 'شاب',
        category: gender === 'female' ? 'شابات' : 'شباب',
        genderLocked: true,
        ownerGenderModifiedAt: nowMs,
        role: finalRole,
        ...(roleChanged
          ? {
              roleUpdatedAt: nowMs,
              roleLocked: true,
              permissions: {
                ...storageService.getRolePermissions(finalRole),
                __permissionsUpdatedAt: nowMs
              }
            }
          : {}),
        lastModifiedAt: nowMs,
        address: cleanAddress,
        residence: cleanAddress,
        notes: cleanNotes,
        talents: cleanNotes,
        skills: cleanNotes,
        photoUrl: processedPhoto,
        avatar: processedPhoto,
        image: processedPhoto,
        ...(unlockCredentialsEdit && password.trim() && password.trim() !== String(member.password || '').trim()
          ? {
              password: password.trim(),
              explicitPasswordChange: true,
              passwordUpdatedAt: nowMs,
              passwordLocked: true
            }
          : {
              password: member.password
            }),
        ...(unlockCredentialsEdit && recoveryCode.trim() && recoveryCode.trim() !== String(member.recoveryCode || '').trim()
          ? {
              recoveryCode: recoveryCode.trim(),
              securityCode: recoveryCode.trim(),
              explicitRecoveryCodeChange: true,
              passwordUpdatedAt: nowMs
            }
          : {
              recoveryCode: member.recoveryCode,
              securityCode: (member as any).securityCode || member.recoveryCode
            }),
        updatedAt: nowMs,
        lastUpdatedAt: nowIso,
        updatedFields: ['تعديل بواسطة مسؤول المجتمع'],
        ...(cleanFullName !== String(member.fullName || '').trim()
          ? {
              isOwnerNameEdit: true,
              previousFullName: member.fullName
            }
          : {})
      } as Registrant;

      const success = await storageService.updateRegistrant(updatedRegistrant, 'community_owner');

      if (!success) {
        setIsSaving(false);
        setGeneralError('تعذر تحديث البيانات. التحقق من صلاحيات الأمان فشل.');
        return;
      }

      // If updating the currently logged-in member session, sync it immediately
      const savedMemberStr = sessionStorage.getItem('three_youths_member_session_v2');
      if (savedMemberStr) {
        try {
          const currentLogged = JSON.parse(savedMemberStr);
          if (currentLogged && String(currentLogged.id) === String(member.id)) {
            sessionStorage.setItem('three_youths_member_session_v2', JSON.stringify(updatedRegistrant));
            sessionStorage.setItem('three_youths_member_session_v1', JSON.stringify(updatedRegistrant));
          }
        } catch (e) {
          console.error(e);
        }
      }

      // If updating the admin session of the current user, sync session name & gender
      const savedAdminStr = sessionStorage.getItem('three_youths_admin_session_v2');
      if (savedAdminStr) {
        try {
          const currentAdmin = JSON.parse(savedAdminStr);
          if (
            currentAdmin &&
            ((currentAdmin.role === 'community_owner' && member.role === 'community_owner') ||
              String(currentAdmin.id) === String(member.id))
          ) {
            currentAdmin.name = updatedRegistrant.fullName;
            currentAdmin.gender = updatedRegistrant.gender;
            sessionStorage.setItem('three_youths_admin_session_v2', JSON.stringify(currentAdmin));
          }
        } catch (e) {
          console.error(e);
        }
      }

      setIsSaving(false);
      onNotification?.('تم تحديث البيانات بنسبة 100%');
      onSaveSuccess(updatedRegistrant);
      onClose();
    } catch (err) {
      setIsSaving(false);
      setGeneralError('حدث خطأ غير متوقع أثناء حفظ التعديلات.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 animate-fadeIn my-auto max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 overflow-hidden flex items-center justify-center shrink-0">
              {photoUrl && photoUrl.trim() !== '' ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-emerald-600" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900">
                  {isTargetOwner && isActorOwner ? 'تعديل بياناتي الشخصية (Community Owner)' : 'تعديل بيانات المخدوم / العضو'}
                </h3>
                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                  {displayUniqueCode || member.uniqueCode}
                </span>
                {isTargetOwner && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                    <Crown className="w-3 h-3 text-amber-700" />
                    <span>مسؤول المجتمع</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                شاشة الملف الشخصي الشاملة (حصرية لمسؤول المجتمع) — التعديل الفوري مع مزامنة CLEAN_MASTER_DB_V1.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        {!canEditThisMember ? null : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            
            {generalError && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{generalError}</span>
              </div>
            )}

            {qrRegenToast && (
              <div className="p-3 rounded-2xl bg-emerald-600 text-white text-xs font-black flex items-center justify-between gap-2 shadow-md animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-100 shrink-0" />
                  <span>{qrRegenToast} — الكود الجديد: ({displayUniqueCode})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQrRegenToast(null)}
                  className="p-1 rounded-lg hover:bg-emerald-700 text-emerald-100 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Unified Member QR Code Panel (Same System as ID Cards Gallery & Attendance) */}
            <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex flex-col items-center shrink-0 gap-2">
                <div className="w-24 h-24 bg-white p-1.5 rounded-2xl border-2 border-emerald-500 shadow-xs flex items-center justify-center">
                  {displayQrCodeUrl ? (
                    <img
                      src={displayQrCodeUrl}
                      alt={`QR Code ${displayUniqueCode}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <QrIcon className="w-10 h-10 text-slate-300" />
                  )}
                </div>
                {!isTargetOwner ? (
                  <button
                    type="button"
                    disabled={isRegeneratingQr}
                    onClick={handleRegenerateQrInsideProfile}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    title="إعادة توليد وتعيين رمز QR جديد لهذا العضو وحفظه فوراً في CLEAN_MASTER_DB_V1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingQr ? 'animate-spin' : ''}`} />
                    <span>{isRegeneratingQr ? 'جاري التوليد والحفظ...' : 'إعادة تعيين / توليد QR Code'}</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                    <Crown className="w-3 h-3 text-amber-700" />
                    <span>كود مسؤول المجتمع الدائم</span>
                  </span>
                )}
              </div>

              <div className="flex-1 text-center sm:text-right space-y-1.5">
                <span className="text-[11px] font-black text-emerald-900 block">
                  كود الحضور الرسمي الموحد (QR Code)
                </span>
                <div className="inline-flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="font-mono text-sm font-black text-emerald-800 tracking-wider">
                    {displayUniqueCode || member.uniqueCode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  نفس نظام رمز الحضور المعتمد في معرض بطاقات الهوية والماسح الضوئي. عند الضغط على زر إعادة التعيين يتم توليد رمز فريد جديد وحفظه فوراً في السحابة دون المساس بباقي بيانات العضو.
                </p>
              </div>
            </div>

            {/* Photo Preview & Upload */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-20 h-24 rounded-2xl bg-white border-2 border-slate-200 overflow-hidden shrink-0 shadow-sm relative group flex items-center justify-center">
                {photoUrl && photoUrl.trim() !== '' ? (
                  <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-300" />
                )}
                {isVerifyingPhoto && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[10px] font-bold">
                    جاري الفحص...
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-right w-full">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    الصورة الشخصية (صورة حقيقية واضحة للوجه)
                  </label>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition">
                    <Camera className="w-3.5 h-3.5" />
                    <span>رفع صورة جديدة</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handlePhotoUpload} 
                      className="hidden" 
                      disabled={isVerifyingPhoto}
                    />
                  </label>
                </div>

                <input 
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="أو ضع رابط مباشر للصورة هنا..."
                  className="w-full text-xs rounded-xl border border-slate-300 py-1.5 px-3 focus:outline-hidden focus:border-emerald-500 font-mono text-left"
                  dir="ltr"
                />

                {photoError && (
                  <p className="text-[11px] text-red-600 font-bold">{photoError}</p>
                )}
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الاسم بالكامل (ثلاثي باللغة العربية حصراً) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={fullName}
                  onChange={handleNameChange}
                  placeholder="مثال: ميخائيل ادور راتب"
                  className={`w-full text-xs font-bold rounded-xl border py-2.5 pr-8 pl-3 focus:outline-hidden transition ${
                    hasEnglishError 
                      ? 'border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-400' 
                      : nameError 
                      ? 'border-amber-400 focus:border-amber-500' 
                      : 'border-slate-300 focus:border-emerald-500'
                  }`}
                />
                <User className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              {nameError && (
                <p className={`text-[11px] font-bold mt-1 ${hasEnglishError ? 'text-red-600' : 'text-amber-600'}`}>
                  {nameError}
                </p>
              )}
            </div>

            {/* Phone & WhatsApp with Country Selector & Exact Digit Validation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Phone Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  رقم الهاتف الأساسي (اختر الدولة) *
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPhoneCountry('sudan')}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      phoneCountry === 'sudan'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇸🇩</span>
                    <span>السودان (+249)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoneCountry('egypt')}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      phoneCountry === 'egypt'
                        ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇪🇬</span>
                    <span>مصر (+20)</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <div className={`px-2.5 py-2.5 rounded-r-xl border border-l-0 text-xs font-black font-mono flex items-center gap-1 shrink-0 ${
                    phoneCountry === 'sudan'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-blue-50 border-blue-300 text-blue-900'
                  }`}>
                    <span>{phoneCountry === 'sudan' ? '🇸🇩' : '🇪🇬'}</span>
                    <span dir="ltr">{phoneCountry === 'sudan' ? '+249' : '+20'}</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={phoneCountry === 'sudan' ? '9 أرقام (مثال: 912345678)' : '10 أرقام (مثال: 1012345678)'}
                    className={`w-full text-xs rounded-l-xl rounded-r-none border py-2.5 px-3 focus:outline-hidden font-mono text-left ${
                      phone.trim() && !phoneAnalysis.isValid
                        ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    dir="ltr"
                  />
                </div>
                {phone.trim() && !phoneAnalysis.isValid && phoneAnalysis.error && (
                  <p className="text-[11px] font-black text-red-600">{phoneAnalysis.error}</p>
                )}
              </div>

              {/* WhatsApp Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    رقم الواتساب (اختر الدولة) *
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyPhoneToWhatsapp}
                    className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                  >
                    نفس الهاتف
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWhatsappCountry('sudan')}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      whatsappCountry === 'sudan'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇸🇩</span>
                    <span>السودان (+249)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhatsappCountry('egypt')}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      whatsappCountry === 'egypt'
                        ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇪🇬</span>
                    <span>مصر (+20)</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <div className={`px-2.5 py-2.5 rounded-r-xl border border-l-0 text-xs font-black font-mono flex items-center gap-1 shrink-0 ${
                    whatsappCountry === 'sudan'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-blue-50 border-blue-300 text-blue-900'
                  }`}>
                    <span>{whatsappCountry === 'sudan' ? '🇸🇩' : '🇪🇬'}</span>
                    <span dir="ltr">{whatsappCountry === 'sudan' ? '+249' : '+20'}</span>
                  </div>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder={whatsappCountry === 'sudan' ? '9 أرقام (مثال: 912345678)' : '10 أرقام (مثال: 1012345678)'}
                    className={`w-full text-xs rounded-l-xl rounded-r-none border py-2.5 px-3 focus:outline-hidden font-mono text-left ${
                      whatsapp.trim() && !whatsappAnalysis.isValid
                        ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                    dir="ltr"
                  />
                </div>
                {whatsapp.trim() && !whatsappAnalysis.isValid && whatsappAnalysis.error && (
                  <p className="text-[11px] font-black text-red-600">{whatsappAnalysis.error}</p>
                )}
              </div>
            </div>

            {/* DOB & Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تاريخ الميلاد (YYYY-MM-DD)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  النوع
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      gender === 'male'
                        ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-2xs font-black'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>ذكر 👨</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      gender === 'female'
                        ? 'border-pink-500 bg-pink-50 text-pink-900 shadow-2xs font-black'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>أنثى 👩</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عنوان السكن
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: الخرطوم، بحري / القاهرة، مدينة نصر"
                  className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500"
                />
                <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ملاحظات السجل والخدمة
              </label>
              <div className="relative">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات حول الموهبة أو الافتقاد أو الرعاية..."
                  className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 resize-none"
                />
                <FileText className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Role Selector (Community Owner Only, non-owner target) */}
            {!isTargetOwner && (
              <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 space-y-1.5">
                <label className="block text-xs font-black text-amber-950">
                  رتبة العضو في المجتمع (تحكم مسؤول المجتمع):
                </label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as UserRole)}
                  className="w-full text-xs font-bold rounded-xl border border-amber-300 bg-white py-2.5 px-3 text-slate-900 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="member">مخدوم عادي</option>
                  <option value="servant">خادم (Servant)</option>
                  <option value="service_secretary">أمين خدمة</option>
                  {(!isMeetingSecretaryRevoked || memberRole === 'meeting_secretary') && (
                    <option value="meeting_secretary">أمين اجتماع</option>
                  )}
                  <option value="priest">أبونا الكاهن ✝️</option>
                  <option value="community_manager">مدير المجتمع (Community Manager)</option>
                </select>
              </div>
            )}

            {/* Password & Recovery Code (Protected & Locked by Default) */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>إدارة كلمة المرور وأمان الحساب</span>
                  {!unlockCredentialsEdit && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      مقفول ومحمى تلقائياً 🔒
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setUnlockCredentialsEdit((prev) => !prev)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border transition cursor-pointer ${
                    unlockCredentialsEdit
                      ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {unlockCredentialsEdit ? 'إعادة قفل الحقول 🔒' : 'فتح تعديل كلمة المرور 🔓'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    كلمة المرور (Password)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={password}
                      readOnly={!unlockCredentialsEdit}
                      onChange={(e) => unlockCredentialsEdit && setPassword(e.target.value)}
                      placeholder="كلمة المرور المسجلة..."
                      className={`w-full text-xs rounded-xl border py-2 pr-8 pl-3 focus:outline-hidden font-mono ${
                        unlockCredentialsEdit
                          ? 'bg-white border-amber-400 focus:border-emerald-500 text-slate-900'
                          : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                      }`}
                    />
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    كود الأمان السداسي (Recovery Code)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={recoveryCode}
                      readOnly={!unlockCredentialsEdit}
                      onChange={(e) => unlockCredentialsEdit && setRecoveryCode(e.target.value)}
                      placeholder="6 أرقام"
                      className={`w-full text-xs rounded-xl border py-2 pr-8 pl-3 focus:outline-hidden font-mono tracking-widest text-center font-bold ${
                        unlockCredentialsEdit
                          ? 'bg-white border-amber-400 focus:border-emerald-500 text-slate-900'
                          : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                      }`}
                    />
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5 shrink-0 flex-wrap">
              <div>
                {isActorOwner && !isTargetOwner && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving || isDeleting}
                    className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="إلغاء عضوية ومسح بيانات هذا العضو نهائياً من قاعدة بيانات السحابة والسيرفر"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>إلغاء العضوية وحذف البيانات من السحابة</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving || isDeleting}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSaving || isDeleting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <span>جاري الحفظ...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ التعديلات في السجل</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-fadeIn text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-black text-slate-900">
                تأكيد إلغاء العضوية والحذف النهائي من السحابة
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                بصفتك مسؤول المجتمع (Community Owner): هل أنت متأكد من إلغاء عضوية <span className="font-bold text-slate-900">({member.fullName})</span>؟ سيتم مسح بياناته تماماً وفوراً من قاعدة بيانات السحابة (Cloudflare) ومن السيرفر المركزي، ولن يظهر هذا العضو بعد الآن في الداشبورد وسيتم تعطيل تسجيل دخوله بحسابه الملغي دون حظر اسمه إذا رغب في التسجيل مجدداً.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={handleDeleteMemberFromCloud}
                  disabled={isDeleting}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <span>جاري الحذف من السحابة...</span>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>نعم، احذف العضو نهائياً</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
