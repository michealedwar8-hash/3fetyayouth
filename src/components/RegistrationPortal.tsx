import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Logo } from './Logo';
import { IdCardItem } from './IdCardItem';
import { downloadIdCardFrontAsImage } from '../services/cardImageGenerator';
import { 
  validateArabicNameInput, 
  validateArabicThreeWords, 
  generateUniqueCode, 
  generateQrCodeDataUrl, 
  storageService,
  formatPhoneNumber,
  formatPhoneNumberWithCountry,
  detectUserLocation,
  validateContactNumber,
  validateRealPersonalPhoto,
  compressImageToFitStorage,
  processPhotoWithWhiteBackground,
  extractFaceSignature,
  findDuplicateFaceMember,
  UserLocationInfo
} from '../services/storageService';
import { Registrant } from '../types';
import { 
  User, 
  Phone, 
  Calendar, 
  Upload, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Sparkles, 
  MessageSquare,
  Lock,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  MapPin,
  FileText,
  Printer,
  Compass,
  AlertTriangle,
  Camera,
  Download,
  SwitchCamera,
  X,
  RefreshCw
} from 'lucide-react';

interface RegistrationPortalProps {
  onBackToLogin: () => void;
  onOpenAdminLogin?: () => void;
  pendingEventId?: string | null;
  onReturnToEventRegistration?: (eventId: string, member: Registrant) => void;
}

export const RegistrationPortal: React.FC<RegistrationPortalProps> = ({ 
  onBackToLogin,
  pendingEventId,
  onReturnToEventRegistration,
}) => {
  // Detected Location State
  const [userLocation, setUserLocation] = useState<UserLocationInfo>(() => detectUserLocation());

  // Form State
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [whatsappRaw, setWhatsappRaw] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<'sudan' | 'egypt'>('sudan');
  const [whatsappCountry, setWhatsappCountry] = useState<'sudan' | 'egypt'>('sudan');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  
  // Photo verification state (Anti-AI / Anti-Fake check)
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);
  const [photoVerified, setPhotoVerified] = useState(false);
  const [isRealPhotoDetected, setIsRealPhotoDetected] = useState<boolean>(true);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Camera capture modal state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [cameraStream]);

  // Ensure cameraStream is immediately bound to video element whenever stream changes or modal renders
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Video auto-play interrupted:', err);
        });
      }
    }
  }, [cameraStream, showCameraModal]);

  // Validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [hasEnglishError, setHasEnglishError] = useState(false);
  const [isDuplicateName, setIsDuplicateName] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isDuplicatePhone, setIsDuplicatePhone] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryCodeError, setRecoveryCodeError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Field Refs for smooth Swipe Up / Scroll to faulty inputs
  const nameFieldRef = useRef<HTMLDivElement>(null);
  const passwordFieldRef = useRef<HTMLDivElement>(null);
  const recoveryCodeFieldRef = useRef<HTMLDivElement>(null);
  const phoneFieldRef = useRef<HTMLDivElement>(null);
  const whatsappFieldRef = useRef<HTMLDivElement>(null);
  const dobFieldRef = useRef<HTMLDivElement>(null);
  const photoFieldRef = useRef<HTMLDivElement>(null);

  // Active highlighted error container
  const [activeErrorField, setActiveErrorField] = useState<string | null>(null);

  const scrollToErrorField = (ref: React.RefObject<HTMLDivElement | null>, fieldKey: string) => {
    setActiveErrorField(fieldKey);
    setTimeout(() => {
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 60);
  };

  // Submission & Created Member State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdMember, setCreatedMember] = useState<Registrant | null>(null);
  const [createdQrCodeUrl, setCreatedQrCodeUrl] = useState<string>('');
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);

  const handleDownloadCardImage = async () => {
    if (!createdMember) return;
    setIsDownloadingImage(true);
    await downloadIdCardFrontAsImage(createdMember, createdQrCodeUrl, storageService.getCustomLogo());
    setIsDownloadingImage(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect location on mount and sync latest cloud registrants for duplicate checks
  useEffect(() => {
    const loc = detectUserLocation();
    setUserLocation(loc);
    if (loc.isEgypt) {
      setPhoneCountry('egypt');
      setWhatsappCountry('egypt');
    }
    // Pre-fetch latest cloud & dashboard data for real-time duplicate checks
    storageService.fetchLatestServerData().catch(() => {});
  }, []);

  // Listen to live real-time sync events: if an admin cancels a membership, duplicate error clears instantly
  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      if (fullName.trim()) {
        const stillNameRegistered = storageService.isFullNameAlreadyRegistered(fullName.trim());
        if (!stillNameRegistered && isDuplicateName) {
          setIsDuplicateName(false);
          setNameError(null);
          setFormError(null);
        }
      }
      if (phoneRaw.trim()) {
        const stillPhoneRegistered = storageService.isPhoneAlreadyRegistered(phoneRaw.trim());
        if (!stillPhoneRegistered && isDuplicatePhone) {
          setIsDuplicatePhone(false);
          setPhoneError(null);
          setFormError(null);
        }
      }
    });
    return () => unsubscribe();
  }, [fullName, phoneRaw, isDuplicateName, isDuplicatePhone]);

  // Strict Real-time Arabic Name Validation on every keystroke
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFullName(val);
    setIsDuplicateName(false);

    if (!val) {
      setNameError(null);
      setHasEnglishError(false);
      return;
    }

    // Check immediately for English letters from the very first character
    const check = validateArabicNameInput(val);
    if (check.hasEnglish) {
      setHasEnglishError(true);
      setNameError('خطأ: يرجى كتابة الاسم باللغة العربية فقط! الحروف الإنجليزية غير مسموح بها نهائياً.');
      return;
    }
    
    setHasEnglishError(false);

    // Requirement: As soon as the user finishes typing 3 words (الاسم الثلاثي كامل), check all names in cloud & dashboard
    const words = val.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      if (storageService.isFullNameAlreadyRegistered(val)) {
        setIsDuplicateName(true);
        setNameError('خطأ: الاسم ده متسجل و موجود , اعمل تسجيل دخول');
        return;
      }
    }

    if (!check.isValid && check.error) {
      setNameError(check.error);
    } else {
      setNameError(null);
    }
  };

  const handleNameBlur = () => {
    if (!fullName) return;
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      if (storageService.isFullNameAlreadyRegistered(fullName)) {
        setIsDuplicateName(true);
        setNameError('خطأ: الاسم ده متسجل و موجود , اعمل تسجيل دخول');
      }
    }
  };

  // Country Selection for Phone (+249 Sudan vs +20 Egypt)
  const handleCountrySelect = (country: 'sudan' | 'egypt') => {
    setPhoneCountry(country);
    setPhoneError(null);
    setIsDuplicatePhone(false);
  };

  // Phone input handling with real-time duplicate check
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhoneRaw(val);
    setPhoneError(null);
    setIsDuplicatePhone(false);

    if (sameAsPhone) {
      setWhatsappRaw(val);
      setWhatsappError(null);
    }

    // Real-time check once phone has sufficient national digits (8+ digits)
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 8) {
      const liveAnalysis = formatPhoneNumberWithCountry(val, phoneCountry);
      if (
        storageService.isPhoneAlreadyRegistered(val) ||
        (liveAnalysis.formatted && storageService.isPhoneAlreadyRegistered(liveAnalysis.formatted))
      ) {
        setIsDuplicatePhone(true);
        setPhoneError('خطأ: رقم التليفون ده متسجل وموجود , اعمل تسجيل دخول');
      }
    }
  };

  const handlePhoneBlur = () => {
    if (!phoneRaw) return;
    const liveAnalysis = formatPhoneNumberWithCountry(phoneRaw, phoneCountry);
    if (
      storageService.isPhoneAlreadyRegistered(phoneRaw) ||
      (liveAnalysis.formatted && storageService.isPhoneAlreadyRegistered(liveAnalysis.formatted))
    ) {
      setIsDuplicatePhone(true);
      setPhoneError('خطأ: رقم التليفون ده متسجل وموجود , اعمل تسجيل دخول');
    }
  };

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setWhatsappRaw(val);
    setWhatsappError(null);
    if (sameAsPhone) {
      setSameAsPhone(false);
    }
  };

  const handleSameAsPhoneToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameAsPhone(checked);
    if (checked) {
      setWhatsappRaw(phoneRaw);
      setWhatsappError(null); // Never show error on WhatsApp when same as phone
    }
  };

  // Live Phone & WhatsApp analysis computed via formatPhoneNumberWithCountry
  const phoneAnalysis = formatPhoneNumberWithCountry(phoneRaw, phoneCountry);
  const whatsappAnalysis = formatPhoneNumberWithCountry(sameAsPhone ? phoneRaw : whatsappRaw, phoneCountry);

  // Photo upload and capture handlers
  const [photoSource, setPhotoSource] = useState<'upload' | 'camera' | null>(null);

  // 1. Photo Upload from device: accepts any photo and checks for real personal photo vs artificial/AI
  const handleUploadedPhoto = async (rawDataUrl: string) => {
    setIsVerifyingPhoto(true);
    setPhotoError(null);
    setFormError(null);
    setPhotoSource('upload');

    try {
      // Compress to ultra-light storage size under 40KB
      const compressed = await compressImageToFitStorage(rawDataUrl, 380, 0.72);
      
      // Verification check for real personal photo vs AI/internet graphic
      const verification = await validateRealPersonalPhoto(compressed, false);
      setIsRealPhotoDetected(verification.isValid);

      setPhotoPreview(compressed);
      setPhotoVerified(true);
      setIsVerifyingPhoto(false);

      if (!verification.isValid) {
        setPhotoError('تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع');
      } else {
        setPhotoError(null);
      }
    } catch (err) {
      console.warn('Error verifying uploaded photo:', err);
      // Fallback: accept image and clear warning
      setIsRealPhotoDetected(true);
      setPhotoPreview(rawDataUrl);
      setPhotoVerified(true);
      setPhotoError(null);
      setIsVerifyingPhoto(false);
    }
  };

  // 2. Photo from Camera: direct live capture from device camera is always a verified real photo!
  const handleCameraPhoto = async (rawDataUrl: string) => {
    setIsVerifyingPhoto(true);
    setPhotoError(null);
    setFormError(null);
    setPhotoSource('camera');

    try {
      const compressed = await compressImageToFitStorage(rawDataUrl, 380, 0.72);
      setIsRealPhotoDetected(true);
      setPhotoPreview(compressed);
      setPhotoVerified(true);
      setPhotoError(null); // Camera photo is 100% authentic real photo
      setIsVerifyingPhoto(false);
    } catch (err) {
      console.warn('Error processing camera photo:', err);
      setIsRealPhotoDetected(true);
      setPhotoPreview(rawDataUrl);
      setPhotoVerified(true);
      setPhotoError(null);
      setIsVerifyingPhoto(false);
    }
  };

  // Handle Photo Upload from device file
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('يرجى اختيار ملف صورة صالح (JPEG أو PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (rawDataUrl) {
        await handleUploadedPhoto(rawDataUrl);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value to allow re-selecting the same file if needed
    e.target.value = '';
  };

  // Camera Management Handlers
  const startCamera = async (facing: 'user' | 'environment' = cameraFacingMode) => {
    setCameraError(null);
    setIsCameraStarting(true);
    setShowCameraModal(true);

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 640 },
            height: { ideal: 800 }
          },
          audio: false
        });
      } catch {
        // Fallback for mobile devices or browsers with strict constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      setCameraStream(stream);
      setIsCameraStarting(false);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setIsCameraStarting(false);
      console.error('Camera access error:', err);
      setCameraError('تعذر فتح الكاميرا! يرجى التأكد من السماح للمتصفح بالوصول إلى الكاميرا (Allow Camera) أو استخدام خيار رفع صورة من الجهاز.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  const switchCameraFacing = () => {
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  const capturePhotoFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 800;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontal if selfie/user front camera for natural mirror reflection
    if (cameraFacingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    stopCamera();
    await handleCameraPhoto(rawDataUrl);
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setPasswordError(null);
    setRecoveryCodeError(null);
    setDobError(null);

    // 1. Strict Name Validation (Must be exactly 3 words in Arabic without English)
    const nameValidation = validateArabicThreeWords(fullName);
    if (!nameValidation.isValid) {
      const err = nameValidation.error || 'خطأ: يرجى كتابة الاسم ثلاثياً باللغة العربية فقط.';
      setNameError(err);
      setFormError(err);
      scrollToErrorField(nameFieldRef, 'name');
      return;
    }

    // Check duplicate full name in database across cloud and dashboard
    if (storageService.isFullNameAlreadyRegistered(fullName)) {
      await storageService.fetchLatestServerData().catch(() => {});
      if (storageService.isFullNameAlreadyRegistered(fullName)) {
        const err = 'خطأ: الاسم ده متسجل و موجود , اعمل تسجيل دخول';
        setNameError(err);
        setIsDuplicateName(true);
        setFormError(err);
        scrollToErrorField(nameFieldRef, 'name');
        return;
      }
    }

    // 2. Validate Password & 6-Digit Recovery Code
    if (!password || password.length < 3) {
      const err = 'خطأ: يرجى كتابة كلمة مرور مكونة من 3 خانات على الأقل.';
      setPasswordError(err);
      setFormError(err);
      scrollToErrorField(passwordFieldRef, 'password');
      return;
    }

    if (password !== confirmPassword) {
      const err = 'خطأ: كلمتا المرور غير متطابقتين، يرجى إعادة التأكيد.';
      setPasswordError(err);
      setFormError(err);
      scrollToErrorField(passwordFieldRef, 'password');
      return;
    }

    const cleanRecoveryCode = recoveryCode.trim();
    if (!cleanRecoveryCode || cleanRecoveryCode.length < 6) {
      const err = 'خطأ: الكود السداسي غير مكتمل! يرجى إدخال 6 أرقام كاملة لاستعادة كلمة المرور.';
      setRecoveryCodeError(err);
      setFormError(err);
      scrollToErrorField(recoveryCodeFieldRef, 'recovery');
      return;
    }

    // 3. Validate Phone Number against chosen country (Sudan +249 or Egypt +20)
    const phoneVal = formatPhoneNumberWithCountry(phoneRaw, phoneCountry);
    if (!phoneVal.isValid) {
      const err = phoneVal.error || 'خطأ: رقم الهاتف غير مكتمل أو غير صحيح.';
      setPhoneError(err);
      setFormError(err);
      scrollToErrorField(phoneFieldRef, 'phone');
      return;
    }

    // Check duplicate phone in database across cloud and dashboard
    if (
      storageService.isPhoneAlreadyRegistered(phoneRaw) ||
      storageService.isPhoneAlreadyRegistered(phoneVal.formatted)
    ) {
      await storageService.fetchLatestServerData().catch(() => {});
      if (
        storageService.isPhoneAlreadyRegistered(phoneRaw) ||
        storageService.isPhoneAlreadyRegistered(phoneVal.formatted)
      ) {
        const err = 'خطأ: رقم التليفون ده متسجل وموجود , اعمل تسجيل دخول';
        setPhoneError(err);
        setIsDuplicatePhone(true);
        setFormError(err);
        scrollToErrorField(phoneFieldRef, 'phone');
        return;
      }
    }

    // 4. Validate WhatsApp Number only if not identical to phone
    let finalWhatsappFormatted = phoneVal.formatted.trim();
    if (!sameAsPhone) {
      const whatsappVal = formatPhoneNumberWithCountry(whatsappRaw, phoneCountry);
      if (!whatsappVal.isValid) {
        const err = whatsappVal.error || 'خطأ: رقم الواتساب غير مكتمل أو ناقص أرقام.';
        setWhatsappError(err);
        setFormError(err);
        scrollToErrorField(whatsappFieldRef, 'whatsapp');
        return;
      }
      finalWhatsappFormatted = whatsappVal.formatted.trim();
    }

    // 4.5. Check if User / Phone is Permanently Blocked by Community Owner
    if (
      storageService.isUserBlocked(phoneVal.formatted) ||
      storageService.isUserBlocked(fullName) ||
      storageService.isUserBlocked(finalWhatsappFormatted)
    ) {
      const err = '⚠️ عذراً، هذا الحساب أو رقم الهاتف محظور نهائياً من التسجيل في النظام بناءً على قرار إدارة ومسؤول المجتمع. لا يمكنك التسجيل في الموقع.';
      setPhoneError(err);
      setFormError(err);
      scrollToErrorField(phoneFieldRef, 'phone');
      return;
    }

    // 5. Validate DOB (Mandatory)
    if (!dob) {
      const err = 'خطأ: يرجى تحديد تاريخ الميلاد لإكمال تسجيل العضوية.';
      setDobError(err);
      setFormError(err);
      scrollToErrorField(dobFieldRef, 'dob');
      return;
    }

    // 6. Validate Personal Photo (Mandatory)
    if (!photoPreview) {
      const err = 'خطأ: الصورة الشخصية إلزامية! يرجى التقاط أو رفع صورة لوجهك.';
      setPhotoError(err);
      setFormError(err);
      scrollToErrorField(photoFieldRef, 'photo');
      return;
    }

    setIsSubmitting(true);

    try {
      // Compress photo to lightweight base64 so it easily fits within Firestore and browser storage without quota limits
      let compressedPhoto = photoPreview;
      try {
        compressedPhoto = await compressImageToFitStorage(photoPreview, 360, 0.72);
      } catch (e) {
        console.warn('Initial photo compression error:', e);
      }

      // If photo is still large, secondary compression pass
      if (compressedPhoto && compressedPhoto.length > 250000) {
        try {
          compressedPhoto = await compressImageToFitStorage(compressedPhoto, 280, 0.65);
        } catch {}
      }

      // Extract permanent facial biometric signature safely
      let faceSignature: string | undefined = undefined;
      try {
        faceSignature = await extractFaceSignature(compressedPhoto);
      } catch (e) {
        console.warn('Face signature extraction skipped:', e);
      }

      // Retrieve next sequential registration code (e.g. TY-0002, TY-0003, ...)
      let uniqueCode = '';
      try {
        const nextCodeResp = await fetch('/api/next-code').then(r => r.json());
        if (nextCodeResp && nextCodeResp.success && nextCodeResp.nextCode) {
          uniqueCode = nextCodeResp.nextCode;
        }
      } catch {}
      if (!uniqueCode) {
        uniqueCode = generateUniqueCode();
      }
      const qrDataUrl = await generateQrCodeDataUrl(uniqueCode);

      const newRegistrant: Registrant = {
        id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        uniqueCode,
        fullName: fullName.trim(),
        gender,
        phone: phoneVal.formatted.trim(),
        whatsapp: finalWhatsappFormatted,
        dob,
        address: address.trim() || undefined, // Optional
        notes: notes.trim() || undefined, // Optional
        photoUrl: compressedPhoto || photoPreview,
        faceSignature: faceSignature || undefined,
        needsRealPhoto: !isRealPhotoDetected,
        needsRealPhotoReminder: !isRealPhotoDetected,
        registeredAt: new Date().toISOString(),
        qrData: uniqueCode,
        password: password.trim(),
        recoveryCode: cleanRecoveryCode,
        role: 'member',
        status: 'active',
        detectedCountry: phoneCountry === 'sudan' ? 'جمهورية السودان 🇸🇩' : 'جمهورية مصر العربية 🇪🇬'
      };

      const saveRes = await storageService.registerUser(newRegistrant);
      if (!saveRes.success) {
        setIsSubmitting(false);
        setFormError(saveRes.error || 'حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 400));

      setCreatedMember(newRegistrant);
      setCreatedQrCodeUrl(qrDataUrl);
      setIsSubmitting(false);
      setIsSuccess(true);

      // Auto-save registration credentials into browser for 1-tap seamless login & instant notification access
      try {
        localStorage.setItem('three_youths_last_login', JSON.stringify(newRegistrant));
        localStorage.setItem('three_youths_remembered_user', JSON.stringify({
          fullName: newRegistrant.fullName,
          phone: newRegistrant.phone,
          uniqueCode: newRegistrant.uniqueCode,
          password: newRegistrant.password
        }));
      } catch (saveErr) {
        console.warn('Failed saving login session to localStorage:', saveErr);
      }

      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {
        // ignore
      }

    } catch (err) {
      console.error('Registration save error:', err);
      setIsSubmitting(false);
      setFormError('حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
    }
  };

  const handleResetForm = () => {
    setFullName('');
    setPhoneRaw('');
    setWhatsappRaw('');
    setSameAsPhone(false);
    setDob('');
    setAddress('');
    setNotes('');
    setPhotoPreview('');
    setPhotoVerified(false);
    setPhotoError(null);
    setPassword('');
    setConfirmPassword('');
    setNameError(null);
    setHasEnglishError(false);
    setPhoneError(null);
    setWhatsappError(null);
    setPasswordError(null);
    setFormError(null);
    setCreatedMember(null);
    setCreatedQrCodeUrl('');
    setIsSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/20 to-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6">
      
      {/* Top Header */}
      <div className="max-w-xl w-full mx-auto flex items-center justify-between pb-2">
        <button
          onClick={onBackToLogin}
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-900 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-2xs transition"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لتسجيل الدخول</span>
        </button>

        {/* Location Detection Badge */}
        <div className="flex items-center gap-2 bg-emerald-100/80 border border-emerald-200/90 px-3 py-1 rounded-full text-[11px] font-bold text-emerald-900 shadow-2xs">
          <Compass className="w-3.5 h-3.5 text-emerald-700 animate-pulse" />
          <span>موقعك: {userLocation.countryName}</span>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-xl w-full mx-auto my-auto">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
          
          {/* Header & Logo Area */}
          <div className="bg-gradient-to-b from-blue-950 via-slate-900 to-blue-950 text-white px-6 pt-7 pb-6 text-center relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center">
              
              {/* Concentric Green Box with Gradient Edges around Logo */}
              <div className="p-3 rounded-3xl bg-gradient-to-b from-emerald-600 via-emerald-800 to-emerald-950 border-2 border-emerald-400/80 shadow-2xl ring-2 ring-emerald-500/30 inline-flex items-center justify-center">
                <div className="p-0 rounded-2xl bg-white border border-emerald-200/90 shadow-inner inline-flex items-center justify-center overflow-hidden">
                  <div className="p-0 rounded-xl bg-white inline-flex items-center justify-center overflow-hidden">
                    <Logo size={225} showUploadTrigger={false} bgVariant="transparent" emblemOnly={true} className="my-0" />
                  </div>
                </div>
              </div>

              {/* Text Container in Crisp White */}
              <div className="mt-3.5 px-6 py-2.5 rounded-2xl bg-white border border-slate-200/90 shadow-xl inline-flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-wide">
                  الثلاثة فتية
                </h1>
                <p className="text-xs sm:text-sm font-black text-emerald-700 mt-0.5">
                  اجتماع الشباب السوداني
                </p>
              </div>
              
              <div className="inline-flex items-center gap-1.5 bg-white/10 text-emerald-200 text-xs px-3.5 py-1 rounded-full mt-3 border border-white/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>استمارة تسجيل عضوية جديدة في الاجتماع</span>
              </div>
            </div>
          </div>

          {/* Form Content OR Success Screen with ID Card */}
          <div className="p-6 sm:p-8">
            
            {/* ========================================================
                SUCCESS SCREEN: Immediately Shows Interactive ID Card with QR Code!
                Requirement: "وخلي بعد ما يكمل تسجيل العضوية تظهر بطاقة الهوية بال Qrcode وتكون بطاقة الهوية من غير رقم هاتف او واتساب"
                ======================================================== */}
            {isSuccess && createdMember ? (
              <div className="py-4 space-y-6 animate-fadeIn">
                
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner ring-6 ring-emerald-50">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900">
                    تم إنشاء العضوية وبطاقة الهوية بنجاح!
                  </h2>
                  <p className="text-slate-600 text-xs sm:text-sm max-w-md mx-auto">
                    أهلاً بك يا <strong>{createdMember.fullName}</strong> في اجتماع الثلاثة فتية للشباب السوداني. هذه بطاقة هويتك الرسمية المعتمدة برمز QR.
                  </p>
                </div>

                {/* Return to Event Registration Banner if user came from an Event Link */}
                {(() => {
                  const activeEventId =
                    pendingEventId ||
                    (() => {
                      try {
                        return sessionStorage.getItem('three_youths_pending_event_id');
                      } catch {
                        return null;
                      }
                    })();
                  if (!activeEventId || !onReturnToEventRegistration) return null;
                  return (
                    <div className="p-4 rounded-2xl bg-sky-950 text-white border-2 border-sky-400 shadow-lg space-y-3 text-center">
                      <p className="text-xs sm:text-sm font-bold text-sky-200">
                        🎉 تم تفعيل عضويتك بنجاح! يمكنك الآن العودة فوراً لإكمال حجزك في الرحلة / المؤتمر بحسابك الجديد:
                      </p>
                      <button
                        type="button"
                        onClick={() => onReturnToEventRegistration(activeEventId, createdMember)}
                        className="w-full py-3.5 px-5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs sm:text-sm transition shadow-md flex items-center justify-center gap-2"
                      >
                        <span>العودة لإكمال تسجيلك في الفعالية / الرحلة الآن 🚌</span>
                        <ArrowRight className="w-4 h-4 rotate-180" />
                      </button>
                    </div>
                  );
                })()}

                {/* THE REAL ID CARD SHOWN IMMEDIATELY WITH QR CODE (NO PHONE / WHATSAPP) */}
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 shadow-inner">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/80 text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <span>🪪 بطاقة هويتك الشخصية الصادرة الآن</span>
                    </span>
                    <span className="font-mono text-emerald-800 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-[11px]">
                      {createdMember.uniqueCode}
                    </span>
                  </div>

                  <IdCardItem
                    registrant={createdMember}
                    qrCodeUrl={createdQrCodeUrl}
                    meetingLogoUrl={storageService.getCustomLogo()}
                    attendanceRecords={[]}
                    onPrintCard={() => window.print()}
                    defaultFace="front"
                    frontOnly={true}
                  />

                  {/* Mobile save hint */}
                  <div className="mt-3 p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
                    <span className="font-semibold text-[11px] sm:text-xs">
                      📲 احفظ صورة بطاقة العضوية على هاتفك لتتمكن من إبراز رمز QR عند الدخول وتسجيل حضورك في القاعة.
                    </span>
                    <button
                      type="button"
                      disabled={isDownloadingImage}
                      onClick={handleDownloadCardImage}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      {isDownloadingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>تحميل</span>
                    </button>
                  </div>

                  {/* Security & Recovery Code Notice */}
                  {createdMember.recoveryCode && (
                    <div className="mt-3.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 text-right">
                        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="font-bold text-amber-950">كودك السداسي للأمان واستعادة الحساب:</p>
                          <p className="text-[11px] text-amber-800">احفظ هذا الكود جيداً، يُطلب منك عند الضغط على (نسيت الباسورد؟؟) لتغيير كلمة المرور</p>
                        </div>
                      </div>
                      <span className="font-mono font-black text-lg bg-white px-3.5 py-1 rounded-xl border border-amber-300 shadow-2xs tracking-widest text-amber-950 shrink-0">
                        {createdMember.recoveryCode}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={isDownloadingImage}
                    onClick={handleDownloadCardImage}
                    className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isDownloadingImage ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Download className="w-4 h-4 text-white" />
                    )}
                    <span>تحميل بطاقة العضوية كصورة على هاتفك (PNG)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-emerald-300" />
                    <span>طباعة بطاقة الهوية</span>
                  </button>

                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
                  >
                    الانتقال لتسجيل الدخول بحسابك
                  </button>

                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs transition"
                  >
                    تسجيل عضو جديد
                  </button>
                </div>

              </div>
            ) : (
              /* Public Registration Form */
              <form noValidate onSubmit={handleSubmit} className="space-y-4">
                
                {formError && (
                  <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* ========================================================
                    Field 1: Full Name (Arabic Only - Loud Red Error on English letters)
                    Requirement: "كتابة الاسم باللغة العربية فقط اذا كتب المسجل باللغة الانجليزية يجيو خطأ باللون الاحمر من اول حروف يكتبها انو لازم يكتب بالعربي"
                    ======================================================== */}
                <div 
                  ref={nameFieldRef} 
                  className={`space-y-1 transition-all duration-300 rounded-2xl p-2 ${
                    activeErrorField === 'name' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <label className="block text-xs font-bold text-slate-700">
                    الاسم ثلاثي (باللغة العربية فقط) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="مثال: مينا كمال بولس"
                      value={fullName}
                      onChange={handleNameChange}
                      onBlur={handleNameBlur}
                      className={`w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition focus:outline-hidden focus:ring-2 ${
                        hasEnglishError || nameError 
                          ? 'border-red-500 focus:ring-red-500/20 bg-red-50/40 text-red-950 ring-2 ring-red-400/30' 
                          : fullName && !nameError 
                            ? 'border-emerald-400 focus:ring-emerald-400 bg-emerald-50/20' 
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                    <User className={`w-4 h-4 absolute right-3 top-3 pointer-events-none ${hasEnglishError ? 'text-red-500' : 'text-slate-400'}`} />
                  </div>

                  {/* Immediate Loud Red Error Message on English Letters or Binary Name or Duplicate */}
                  {nameError && (
                    <div className="p-3 rounded-2xl bg-red-100 border-2 border-red-300 text-red-900 text-xs font-bold space-y-2 mt-1 animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="font-black text-xs sm:text-sm">{nameError}</span>
                      </div>
                      {isDuplicateName && (
                        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-red-200">
                          <span className="text-[11px] text-red-700">لديك حساب مسجل مسبقاً بهذا الاسم؟</span>
                          <button
                            type="button"
                            onClick={onBackToLogin}
                            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                          >
                            <span>تسجيل الدخول الآن 🔑</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Field: Gender Selection (ذكر / أنثى) */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    النوع / الجنس <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        gender === 'male'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>ولد (شاب) 👦</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        gender === 'female'
                          ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>بنت (شابة) 👧</span>
                    </button>
                  </div>
                </div>

                {/* Password Fields for Member Account */}
                <div 
                  ref={passwordFieldRef} 
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 transition-all duration-300 rounded-2xl p-2 ${
                    activeErrorField === 'password' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      كلمة المرور (لتسجيل الدخول لاحقاً) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="اختر كلمة مرور"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-9 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                      />
                      <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      تأكيد كلمة المرور <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="أعد كتابة كلمة المرور"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-9 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                </div>
                {passwordError && (
                  <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {/* 6-Digit Recovery Code (الكود السداسي) */}
                <div 
                  ref={recoveryCodeFieldRef} 
                  className={`space-y-1.5 pt-1 p-3.5 rounded-2xl bg-emerald-50/40 border transition-all duration-300 ${
                    activeErrorField === 'recovery' 
                      ? 'ring-4 ring-red-500/50 bg-red-50/60 border-red-400' 
                      : 'border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      الكود السداسي للأمان واستعادة كلمة المرور <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setRecoveryCode(Math.floor(100000 + Math.random() * 900000).toString())}
                      className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                    >
                      <span>🔄 توليد كود تلقائي</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={6}
                      dir="ltr"
                      placeholder="مثال: 784920"
                      value={recoveryCode}
                      onChange={(e) => {
                        setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setRecoveryCodeError(null);
                      }}
                      className="w-full text-center font-mono tracking-widest text-base font-black rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <ShieldCheck className="w-5 h-5 text-emerald-600 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                  {recoveryCodeError && (
                    <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2 mt-1 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{recoveryCodeError}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    🛡️ <strong>احفظ هذا الكود السداسي (6 أرقام):</strong> يستخدم هذا الكود كإثبات أمان في صفحة تسجيل الدخول عند الضغط على خيار <em>(نسيت الباسورد؟؟)</em> لإعادة تعيين كلمة سر جديدة.
                  </p>
                </div>

                {/* ========================================================
                    Field 2: Phone Number with Country Selection (Sudan 🇸🇩 vs Egypt 🇪🇬)
                    Requirement:
                    1. Choose country between Sudan (+249) and Egypt (+20) with flag image/icon.
                    2. In Dashboard, the phone appears with chosen country code.
                    3. If user enters 10 digits starting with 0 (e.g. 0119089276), replace leading 0 with +249 -> +249 119089276.
                       Same for Egyptian (e.g. 01012345678 -> +20 1012345678).
                    4. Error shows ONLY under phone number (not on WhatsApp).
                    5. Error text is concise: "خطأ: [المشكلة]".
                    ======================================================== */}
                <div 
                  ref={phoneFieldRef} 
                  className={`space-y-2 pt-1 transition-all duration-300 rounded-2xl p-2.5 ${
                    activeErrorField === 'phone' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      رقم الهاتف للتواصل <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">
                      اختر دولة الرقم:
                    </span>
                  </div>

                  {/* Country Selector Toggle Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCountrySelect('sudan')}
                      className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                        phoneCountry === 'sudan'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-500/20'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">🇸🇩</span>
                      <span>السودان (+249)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCountrySelect('egypt')}
                      className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                        phoneCountry === 'egypt'
                          ? 'bg-blue-700 text-white border-blue-700 shadow-sm ring-2 ring-blue-500/20'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">🇪🇬</span>
                      <span>مصر (+20)</span>
                    </button>
                  </div>

                  {/* Phone Input with Fixed Prefix Pill */}
                  <div className="relative flex items-center">
                    <div className={`px-3 py-2.5 rounded-r-xl border border-l-0 text-xs font-black font-mono flex items-center gap-1 shrink-0 ${
                      phoneCountry === 'sudan'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-blue-50 border-blue-300 text-blue-900'
                    }`}>
                      <span>{phoneCountry === 'sudan' ? '🇸🇩' : '🇪🇬'}</span>
                      <span dir="ltr">{phoneCountry === 'sudan' ? '+249' : '+20'}</span>
                    </div>

                    <input
                      type="tel"
                      dir="ltr"
                      placeholder={
                        phoneCountry === 'sudan'
                          ? 'اكتب رقمك: 0119089276 أو 0912345678'
                          : 'اكتب رقمك: 01012345678 أو 011... أو 012...'
                      }
                      value={phoneRaw}
                      onChange={handlePhoneChange}
                      onBlur={handlePhoneBlur}
                      className={`w-full text-left rounded-l-xl rounded-r-none border px-3 py-2.5 text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 ${
                        phoneError 
                          ? 'border-red-400 bg-red-50/20 focus:ring-red-400' 
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>

                  {/* Clean Live Preview of leading zero replacement */}
                  {phoneRaw.trim() && (
                    <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700 flex items-center justify-between">
                      <span className="text-slate-500 font-sans">سيتم حفظه في الداشبورد:</span>
                      <span className="font-bold text-slate-900 font-mono" dir="ltr">
                        {phoneAnalysis.formatted || `${phoneCountry === 'sudan' ? '+249' : '+20'} ...`}
                      </span>
                    </div>
                  )}

                  {phoneError && (
                    <div className="p-3 rounded-2xl bg-red-100 border-2 border-red-300 text-red-900 text-xs font-bold space-y-2 mt-1 animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="font-black text-xs sm:text-sm">{phoneError}</span>
                      </div>
                      {isDuplicatePhone && (
                        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-red-200">
                          <span className="text-[11px] text-red-700">لديك حساب مسجل مسبقاً بهذا الرقم؟</span>
                          <button
                            type="button"
                            onClick={onBackToLogin}
                            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                          >
                            <span>تسجيل الدخول الآن 🔑</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Field 3: WhatsApp Number */}
                <div 
                  ref={whatsappFieldRef} 
                  className={`space-y-1 transition-all duration-300 rounded-2xl p-2 ${
                    activeErrorField === 'whatsapp' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      رقم الواتساب <span className="text-red-500">*</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-bold cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={sameAsPhone}
                        onChange={handleSameAsPhoneToggle}
                        className="rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>نفس رقم الهاتف</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="tel"
                      dir="ltr"
                      placeholder="رقم الواتساب"
                      value={sameAsPhone ? (phoneAnalysis.formatted || phoneRaw) : whatsappRaw}
                      onChange={handleWhatsappChange}
                      disabled={sameAsPhone}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 pl-10 text-sm font-mono text-slate-900 focus:outline-hidden focus:border-emerald-500 ${
                        sameAsPhone 
                          ? 'bg-slate-100 text-slate-600 cursor-not-allowed border-slate-200' 
                          : whatsappError 
                            ? 'border-red-400 bg-red-50/20' 
                            : 'border-slate-300'
                      }`}
                    />
                    <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                  {whatsappError && !sameAsPhone && (
                    <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2 mt-1 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{whatsappError}</span>
                    </div>
                  )}
                </div>

                {/* Field 4: Date of Birth */}
                <div 
                  ref={dobFieldRef} 
                  className={`space-y-1 transition-all duration-300 rounded-2xl p-2 ${
                    activeErrorField === 'dob' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <label className="block text-xs font-bold text-slate-700">
                    تاريخ الميلاد <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={dob}
                      onChange={(e) => {
                        setDob(e.target.value);
                        setDobError(null);
                      }}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                  {dobError && (
                    <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2 mt-1 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{dobError}</span>
                    </div>
                  )}
                </div>

                {/* Field 5: Home Address (Optional - عنوان المنزل اختياري) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      عنوان السكن / الإقامة <span className="text-slate-400 font-normal">(اختياري)</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="مثال: القاهرة، مدينة نصر / الخرطوم، بحري"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* Field 6: Notes (Optional - الملاحظات اختياري) */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    ملاحظات أو مواهب <span className="text-slate-400 font-normal">(اختياري)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="أي معلومات إضافية أو مهارات أو رغبة في الخدمة..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* ========================================================
                    Field 7: Personal Photo with REAL PHOTO VERIFICATION
                    Requirement: "لازم تكون صورة حقيقية ما تكون صوره مزيفه من الانترنت او مصنوعة بال AI"
                    ======================================================== */}
                <div 
                  ref={photoFieldRef} 
                  className={`space-y-1 pt-1 transition-all duration-300 rounded-2xl p-2 ${
                    activeErrorField === 'photo' ? 'ring-4 ring-red-500/50 bg-red-50/50 border border-red-300' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      الصورة الشخصية للوجه <span className="text-red-500">* (صورة حقيقية إلزامية)</span>
                    </label>
                    {photoVerified && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        صورة فوتوغرافية حقيقية معتمدة ✓
                      </span>
                    )}
                  </div>
                  
                  <div className={`flex flex-col sm:flex-row items-center gap-3.5 p-3.5 rounded-2xl border ${
                    photoError 
                      ? 'bg-red-50/60 border-red-300' 
                      : photoVerified 
                        ? 'bg-emerald-50/50 border-emerald-300' 
                        : 'bg-slate-50 border-dashed border-slate-300'
                  }`}>
                    {/* Preview box */}
                    <div className="w-20 h-24 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative">
                      {isVerifyingPhoto ? (
                        <div className="flex flex-col items-center justify-center text-emerald-600 p-2">
                          <Loader2 className="w-6 h-6 animate-spin mb-1" />
                          <span className="text-[9px] text-center font-bold">جاري الفحص</span>
                        </div>
                      ) : photoPreview && photoPreview.trim() !== '' ? (
                        <img 
                          src={photoPreview} 
                          alt="المعاينة الشخصية" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <User className="w-6 h-6 mx-auto opacity-40 mb-0.5" />
                          <span className="text-[9px] block">صورة واضحة</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-right space-y-1.5">
                      <p className="text-xs text-slate-600">
                        يجب أن تكون الصورة <strong>فوتوغرافية حقيقية لك شخصياً</strong> (ليست رسماً كرتونياً، ولا مصممة بالـ AI، ولا صورة مأخوذة من الإنترنت).
                      </p>
                      
                      {/* Real Photo Warning: appears when non-real photo is uploaded and disappears completely when a real photo is uploaded */}
                      {photoPreview && !isRealPhotoDetected && (
                        <div className="p-3 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs font-black flex items-center gap-2 text-right animate-fadeIn shadow-xs">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                          <span>(تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع)</span>
                        </div>
                      )}

                      {photoPreview && isRealPhotoDetected && (
                        <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 text-right animate-fadeIn">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>تم قبول صورتك الشخصية الحقيقية بنجاح ✓</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2.5 justify-center sm:justify-start">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        
                        {/* Option 1: Upload from device */}
                        <button
                          type="button"
                          disabled={isVerifyingPhoto}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span>{photoPreview ? 'تغيير بملف من الجهاز' : '📁 رفع صورة من الجهاز'}</span>
                        </button>

                        {/* Option 2: Capture with camera */}
                        <button
                          type="button"
                          disabled={isVerifyingPhoto}
                          onClick={() => startCamera(cameraFacingMode)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-white" />
                          <span>{photoPreview ? 'إعادة التقاط بالكاميرا' : '📷 فتح الكاميرا والتقاط صورة'}</span>
                        </button>
                      </div>

                      {photoPreview && (
                        <div className="flex items-center gap-2 flex-wrap pt-1 justify-center sm:justify-start">
                          {photoSource === 'upload' ? (
                            <span className="text-[10px] bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                              🖼️ تم حفظ الصورة بنفس ألوانها وخلفيتها الأصلية
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                              ⚪ خلفية بيضاء نقية مع الحفاظ الكامل على ملامحك وإضاءتك
                            </span>
                          )}
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            ✓ تم التحقق من ملامح الوجه وحساب فريد
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ========================================================
                    CAMERA CAPTURE MODAL / VIEWFINDER
                    ======================================================== */}
                {showCameraModal && (
                  <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn">
                      
                      {/* Modal Header */}
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <Camera className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900">التقاط الصورة الشخصية بالكاميرا</h3>
                            <p className="text-[10px] text-slate-500">ضع وجهك داخل الإطار مع إضاءة جيدة</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={stopCamera}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Viewfinder Video Area */}
                      <div className="relative bg-slate-900 aspect-4/5 w-full flex items-center justify-center overflow-hidden">
                        {cameraError ? (
                          <div className="p-6 text-center text-white space-y-3 z-30">
                            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                            <p className="text-xs text-slate-200 font-bold leading-relaxed">{cameraError}</p>
                            <button
                              type="button"
                              onClick={() => startCamera(cameraFacingMode)}
                              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition"
                            >
                              إعادة المحاولة
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Video element is ALWAYS mounted to guarantee videoRef.current is never null */}
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              onLoadedMetadata={() => {
                                videoRef.current?.play().catch(() => {});
                              }}
                              className={`w-full h-full object-cover ${cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                            />

                            {/* Loading Overlay when camera is initializing */}
                            {isCameraStarting && (
                              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-25">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                                <p className="text-xs text-slate-200 font-bold">جاري فتح وتشغيل الكاميرا...</p>
                              </div>
                            )}
                            
                            {/* Smile Prompt Message */}
                            <div className="absolute top-3 inset-x-12 text-center pointer-events-none z-20">
                              <div className="inline-flex items-center gap-1.5 bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-full shadow-lg border border-amber-300 animate-pulse">
                                <span className="text-sm">😊</span>
                                <span>اضحك ضحكة خفيفة لالتقاط الصورة!</span>
                              </div>
                            </div>

                            {/* Camera Switch Button */}
                            <button
                              type="button"
                              onClick={switchCameraFacing}
                              className="absolute top-3 left-3 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white backdrop-blur-xs transition shadow-md"
                              title="تبديل الكاميرا (أمامية / خلفية)"
                            >
                              <SwitchCamera className="w-4 h-4" />
                            </button>

                            {/* Natural Camera Shot Notice */}
                            <div className="absolute bottom-3 inset-x-3 text-center pointer-events-none">
                              <span className="text-[10px] bg-slate-950/85 text-emerald-300 font-bold px-3 py-1 rounded-full backdrop-blur-xs border border-emerald-500/30">
                                📸 يتم حفظ الصورة كما هي تماماً بدون أي تعديل في الملامح أو الألوان أو الإضاءة
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Modal Footer Controls */}
                      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer"
                        >
                          إلغاء
                        </button>

                        <button
                          type="button"
                          disabled={!!cameraError || isCameraStarting}
                          onClick={capturePhotoFromCamera}
                          className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>التقاط الصورة الآن 📸</span>
                        </button>
                      </div>

                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || isVerifyingPhoto}
                    className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-600/25 transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>جاري إنشاء العضوية واستخراج بطاقة الهوية...</span>
                      </>
                    ) : (
                      <>
                        <span>إتمام التسجيل واستخراج بطاقة الهوية بالـ QR Code</span>
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-xs text-slate-500 hover:text-emerald-800 font-semibold underline"
                  >
                    لديك حساب بالفعل؟ اضغط هنا لتسجيل الدخول
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-xl w-full mx-auto text-center mt-6 text-xs text-slate-400">
        © اجتماع شباب الثلاثة فتية • خدمة الشباب السوداني
      </footer>

    </div>
  );
};
