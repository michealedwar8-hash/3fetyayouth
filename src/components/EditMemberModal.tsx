import React, { useState } from 'react';
import { Registrant, UserRole } from '../types';
import { 
  storageService, 
  validateArabicNameInput, 
  validateArabicThreeWords, 
  validateContactNumber, 
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
  Trash2
} from 'lucide-react';

interface EditMemberModalProps {
  member: Registrant;
  currentUserRole?: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updated: Registrant) => void;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  currentUserRole,
  isOpen,
  onClose,
  onSaveSuccess
}) => {
  if (!isOpen) return null;

  const isTargetOwner = member.role === 'community_owner';
  const isActorOwner = currentUserRole === 'community_owner';
  const isActorManager = currentUserRole === 'community_manager';
  
  // Community manager cannot edit community owner
  const canEditThisMember = isActorOwner || (isActorManager && !isTargetOwner);

  // Form State
  const [fullName, setFullName] = useState(member.fullName);
  const [phone, setPhone] = useState(member.phone);
  const [whatsapp, setWhatsapp] = useState(member.whatsapp || member.phone);
  const [dob, setDob] = useState(member.dob || '');
  const [gender, setGender] = useState<'male' | 'female'>(member.gender);
  const [address, setAddress] = useState(member.address || '');
  const [notes, setNotes] = useState(member.notes || '');
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl);
  const [password, setPassword] = useState(member.password || '');
  const [recoveryCode, setRecoveryCode] = useState(member.recoveryCode || '');

  // Validation & UI State
  const [nameError, setNameError] = useState<string | null>(null);
  const [hasEnglishError, setHasEnglishError] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteMemberFromCloud = async () => {
    if (!isActorOwner || isTargetOwner) return;
    setIsDeleting(true);
    try {
      await storageService.deleteRegistrant(member.id, currentUserRole);
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
        const compressed = await compressImageToBase64(rawDataUrl, 250, 0.7);
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
    setWhatsapp(phone);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!canEditThisMember) {
      setGeneralError('ليس لديك صلاحية لتعديل بيانات هذا العضو أو مسؤول المجتمع.');
      return;
    }

    // 1. Validate Arabic Full Name (3 words)
    const nameVal = validateArabicThreeWords(fullName);
    if (!nameVal.isValid) {
      setGeneralError(nameVal.error || 'يرجى كتابة الاسم ثلاثياً باللغة العربية');
      return;
    }

    // 2. Validate Phone
    const userLoc = detectUserLocation();
    const phoneVal = validateContactNumber(phone, userLoc);
    if (!phoneVal.isValid) {
      setGeneralError(phoneVal.error || 'رقم الهاتف غير صالح');
      return;
    }

    // 3. Validate WhatsApp
    const whatsappVal = validateContactNumber(whatsapp, userLoc);
    if (!whatsappVal.isValid) {
      setGeneralError(whatsappVal.error || 'رقم الواتساب غير صالح');
      return;
    }

    // 4. Validate Photo
    if (!photoUrl) {
      setGeneralError('يرجى تحديد أو رفع صورة شخصية صالحة.');
      return;
    }

    setIsSaving(true);

    try {
      const safeFinalPhoto = resolveSafePhotoUrl(photoUrl, member.id);
      const updatedRegistrant: Registrant = {
        ...member,
        fullName: fullName.trim(),
        phone: phoneVal.formatted.trim(),
        whatsapp: whatsappVal.formatted.trim(),
        dob: dob.trim() || member.dob,
        gender,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        photoUrl: safeFinalPhoto,
        avatar: safeFinalPhoto,
        password: password.trim() || member.password,
        recoveryCode: recoveryCode.trim() || member.recoveryCode || '123456',
        lastUpdatedAt: new Date().toISOString(),
        updatedFields: ['تعديل بواسطة الإدارة']
      };

      const success = storageService.updateRegistrant(updatedRegistrant, currentUserRole);

      if (!success) {
        setIsSaving(false);
        setGeneralError('تعذر تحديث البيانات. التحقق من صلاحيات الأمان فشل.');
        return;
      }

      // If updating the currently logged-in member session, sync it
      const savedMemberStr = sessionStorage.getItem('three_youths_member_session_v2');
      if (savedMemberStr) {
        try {
          const currentLogged = JSON.parse(savedMemberStr);
          if (currentLogged.id === member.id) {
            sessionStorage.setItem('three_youths_member_session_v2', JSON.stringify(updatedRegistrant));
          }
        } catch (e) {
          console.error(e);
        }
      }

      // If updating the admin session of the owner, sync session name
      const savedAdminStr = sessionStorage.getItem('three_youths_admin_session_v2');
      if (savedAdminStr) {
        try {
          const currentAdmin = JSON.parse(savedAdminStr);
          if (currentAdmin.role === 'community_owner' && member.role === 'community_owner') {
            currentAdmin.name = updatedRegistrant.fullName;
            sessionStorage.setItem('three_youths_admin_session_v2', JSON.stringify(currentAdmin));
          }
        } catch (e) {
          console.error(e);
        }
      }

      setIsSaving(false);
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
                  {member.uniqueCode}
                </span>
                {isTargetOwner && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                    <Crown className="w-3 h-3 text-amber-700" />
                    <span>مسؤول المجتمع</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {canEditThisMember ? 'يمكنك تعديل كافة الحقول والمعلومات الشخصية وحفظها فوراً في السجل.' : '🔒 محمي: لا يمكن تعديل بيانات مسؤول المجتمع إلا من قبله شخصياً.'}
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
        {!canEditThisMember ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">صلاحية التعديل محجوبة</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              بيانات مسؤول المجتمع (Community Owner) محمية بموجب قواعد الأمان، ولا يمكن تعديلها إلا من حساب مسؤول المجتمع نفسه.
            </p>
            <div className="pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            
            {generalError && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{generalError}</span>
              </div>
            )}

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
                  type="url"
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

            {/* Phone & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الهاتف الأساسي *
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+249 09... أو +20 01..."
                    className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 font-mono text-left"
                    dir="ltr"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    رقم الواتساب *
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyPhoneToWhatsapp}
                    className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                  >
                    نفس الهاتف
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+249 09... أو +20 01..."
                    className="w-full text-xs rounded-xl border border-slate-300 py-2.5 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 font-mono text-left"
                    dir="ltr"
                  />
                  <MessageCircle className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
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

            {/* Password & Recovery Code */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>إدارة كلمة المرور وأمان الحساب</span>
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
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="كلمة المرور المسجلة..."
                      className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 font-mono"
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
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="6 أرقام"
                      className="w-full text-xs rounded-xl border border-slate-300 py-2 pr-8 pl-3 focus:outline-hidden focus:border-emerald-500 font-mono tracking-widest text-center font-bold"
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
                بصفتك مسؤول المجتمع (Community Owner): هل أنت متأكد من إلغاء عضوية <span className="font-bold text-slate-900">({member.fullName})</span>؟
                <br />
                سيتم مسح بياناته تماماً وفوراً من قاعدة بيانات السحابة (Supabase) والسيرفر المركزي والسجل. لن يظهر هذا العضو بعد الآن في الداشبورد، وسيتم تعطيل تسجيل دخوله بحسابه الملغى دون حظر اسمه إذا رغب في التسجيل مجدداً.
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
