export type UserRole = 
  | 'priest'                // أبونا (Same permissions as meeting_secretary, displayed as "أبونا فلان")
  | 'community_owner'      // مسؤول المجتمع (Hoster/Owner - Highest authority)
  | 'community_manager'    // مدير المجتمع (Same powers as owner, but cannot appoint community_managers, and cannot touch owner)
  | 'meeting_secretary'    // أمين اجتماع (Lead Admin)
  | 'service_secretary'    // أمين خدمة (Service Head)
  | 'servant'              // خادم (Visitation, Attendance, Member care)
  | 'member';              // مخدوم (Regular youth member)

export const ROLE_LABELS: Record<UserRole, string> = {
  priest: 'أبونا (كاهن الاجتماع)',
  community_owner: 'مسؤول المجتمع (Owner)',
  community_manager: 'مدير المجتمع',
  meeting_secretary: 'أمين اجتماع',
  service_secretary: 'أمين خدمة',
  servant: 'خادم',
  member: 'مخدوم'
};

export interface AdminPermissions {
  canScanAttendance: boolean;
  canViewDatabase: boolean;
  canExportData: boolean;
  canPrintCards: boolean;
  canManageAdmins: boolean;
  canCancelMembership: boolean;
  canManageVisitation: boolean;
  canEditMembers?: boolean; // صلاحية تعديل بيانات المخدومين والأعضاء
  canSendAnnouncements?: boolean; // صلاحية خاصة للخدام: إرسال ونشر الإعلانات
  canViewMakhdomeen?: boolean; // صلاحية خاصة للخدام: معاينة داشبورد سجل الأسماء والمخدومين الرئيسي
  canManageKahoot?: boolean; // صلاحية خاصة للخدام: عمل مسابقات الثلاثة فتية ونشرها
  canManageEvents?: boolean; // صلاحية إدارة الرحلات والمؤتمرات والأيام الروحية
  canManageEventPayments?: boolean; // صلاحية إدارة المدفوعات والخصومات في الفعاليات
  canScanEventAttendance?: boolean; // صلاحية مسح حضور الفعاليات والرحلات
  canViewAllGendersVisitation?: boolean; // صلاحية أمين الخدمة لرؤية كل المخدومين (ذكور وإناث) بدلاً من نفس جنسه فقط
  viewOppositeGenderMembers?: boolean; // سجل المخدومين الآخر: عرض سجل المخدومين والأعضاء من الجنس الآخر مع أرقام هواتفهم
}

export const FEMALE_FIRST_NAMES = new Set([
  'مريم', 'ماريا', 'مارينا', 'مهرائيل', 'مهراييل', 'نونيسيا', 'دميانه', 'دميانة', 'فيرينا', 'فرينا',
  'كيريا', 'كريستين', 'كرستين', 'كريستينا', 'مارتينا', 'يوستينا', 'ايريني', 'إيريني', 'اريني',
  'ساره', 'سارة', 'ساندرا', 'سيلفيا', 'سلفيا', 'تريزا', 'تريز', 'مادونا', 'مونيكا', 'مادلين',
  'فيبي', 'فبرونيا', 'فيبرونيا', 'كلارا', 'نانسي', 'ناردين', 'نيرمين', 'نرمين', 'نيفين', 'نادين',
  'هيلانه', 'هيلانة', 'هيلين', 'بربارا', 'باربارا', 'انطونيا', 'أنطونيا', 'كاترين', 'كارولين', 'كارول',
  'جوليا', 'جوليانا', 'جومانا', 'جيسي', 'جيسيكا', 'جاكلين', 'جورجيت', 'جانيت', 'يرثيا', 'ياسمين',
  'استير', 'أستير', 'انجي', 'إنجي', 'انجيل', 'إنجيل', 'ايمان', 'إيمان', 'اميره', 'أميرة', 'امل', 'أمل',
  'اليس', 'أليس', 'الين', 'ألين', 'اماني', 'أماني', 'نعمه', 'نعمة', 'نورهان', 'نورا', 'نور', 'ندى', 'ندي',
  'رنا', 'رانيا', 'ريم', 'ريهام', 'روز', 'روان', 'رضوى', 'رحمه', 'رحمة', 'دينا', 'داليا', 'دوللي', 'دعاء',
  'مارسيل', 'مارجريت', 'ماجي', 'ماجده', 'ماجدة', 'مها', 'مروه', 'مروة', 'منال', 'منى', 'مني', 'مي', 'ميار',
  'ميرنا', 'ميريت', 'سوزان', 'سهام', 'سلوى', 'سلوي', 'سماح', 'سميره', 'سميرة', 'سلمى', 'سلمي', 'سوسن',
  'شيرين', 'شرين', 'شذى', 'شهد', 'شيماء', 'صفاء', 'صوفيا', 'عبير', 'علا', 'علياء', 'عفاف', 'غاده', 'غادة',
  'فاتن', 'فايزه', 'فايزة', 'فرح', 'فريده', 'فريدة', 'فاطمه', 'فاطمة', 'كاميليا', 'كندا', 'لينا', 'ليلى', 'ليلي',
  'ليليان', 'لمياء', 'لوسي', 'لوسيندا', 'لورا', 'تاسوني', 'ابرار', 'أبرار', 'اسراء', 'إسراء', 'آيه', 'آية', 'ايه',
  'بتول', 'بسنت', 'امثال', 'أمثال', 'اناسيمون', 'أناسيمون', 'اوغسطينا', 'أوغسطينا', 'تكل', 'تكلا', 'تؤام',
  'حنان', 'حبيبه', 'حبيبة', 'خلود', 'دلال', 'راشيل', 'رفقه', 'رفقة', 'ريتا', 'سالي', 'سمر', 'سهير', 'سيسيل',
  'عايده', 'عايدة', 'ليديا', 'لورين', 'مارتا', 'مارثا', 'ماتيلدا', 'مورين', 'ميرا', 'ميريام', 'ناديه', 'نادية',
  'ناهد', 'نجلاء', 'نجوى', 'نهى', 'نهي', 'نهال', 'هايدي', 'هدير', 'هدى', 'هدي', 'هبه', 'هبة', 'هنا', 'هناء', 'هنادي', 'وفاء', 'ولاء', 'يوأنا', 'يوانا',
  'مارولينا', 'مارولا', 'نونسيا', 'اربسيما', 'ديانا', 'كيلارا', 'ماري', 'سيسليا', 'فلورينا', 'ڤيرونيا', 'فيرونيا', 'ڤيرونيكا', 'فيرونيكا',
  'مهراتي', 'ايلاريا', 'جويس', 'ايزيس', 'أردينا', 'اردينا', 'فيرا', 'ناريمان', 'ماريمنا', 'مريانا', 'سوسنه', 'سوسنة', 'بوتيتو',
  'جيسكا', 'كاترينا', 'دولاجي', 'جسيكا', 'بارثينا', 'الكساندرا', 'الكسندرا', 'اليسا', 'فيرينيا', 'ايناس', 'إيناس',
  'بيرلا', 'دوناتلا', 'شيري', 'شيرى', 'مارلين', 'مايا', 'ڤرونيا', 'فرونيا'
]);

const CONFIRMED_FEMALE_FULL_NAMES = new Set([
  'الكسندرا نظير سامي',
  'بيرلا بول فايز',
  'دوناتلا اميل بولس',
  'شيري طلعت بشري',
  'مارلين اندراوس حنا',
  'مايا كمال ظريف',
  'فرونيا نشئت جيد',
  'فرونيا نشات جيد'
]);

function normalizeGenderCheckName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ڤ/g, 'ف')
    .replace(/[\u064B-\u065F\u0670]/g, '');
}

const MALE_ENDING_WITH_TA = new Set([
  'اسامه', 'أسامة', 'حمزه', 'حمزة', 'طلحه', 'طلحة', 'عبيده', 'عبيدة',
  'معاويه', 'معاوية', 'شحاته', 'شحاتة', 'عطيه', 'عطية', 'سلامه', 'سلامة'
]);

export function getMemberGender(member: any): 'male' | 'female' {
  if (!member || typeof member !== 'object') return 'male';
  if (member.role === 'community_owner' || member.id === 'reg_owner_main') return 'male';

  const fullName = String(member.name || member.fullName || '').trim();
  const normFull = normalizeGenderCheckName(fullName);

  const checkExplicit = (val: any): 'male' | 'female' | null => {
    const s = String(val || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'female' || s === 'انثى' || s === 'أنثى' || s === 'شابة' || s === 'شابه' || s === 'شابات') return 'female';
    if (s === 'male' || s === 'ذكر' || s === 'شاب' || s === 'شباب') return 'male';
    return null;
  };

  // 0. Confirmed permanent female members (never allowed to revert to male)
  if (normFull && CONFIRMED_FEMALE_FULL_NAMES.has(normFull)) {
    return 'female';
  }

  // 1. Prioritize manualGender & genderCode set by Community Owner or explicit registration choice
  const manual = checkExplicit(member.manualGender);
  if (manual) return manual;

  const code = checkExplicit(member.genderCode);
  if (code) return code;

  // 2. Respect genderLocked + explicit gender/sex/type/category fields
  if (member.genderLocked) {
    const locked = checkExplicit(member.gender) || checkExplicit(member.sex) || checkExplicit(member.type) || checkExplicit(member.category);
    if (locked) return locked;
  }

  const rawFields = `${member.gender || ''} ${member.sex || ''} ${member.type || ''} ${member.category || ''} ${member.role || ''}`.toLowerCase();
  if (
    rawFields.includes('انث') ||
    rawFields.includes('أنث') ||
    rawFields.includes('شابات') ||
    rawFields.includes('شابة') ||
    rawFields.includes('شابه') ||
    rawFields.includes('بنات') ||
    rawFields.includes('بنت') ||
    rawFields.includes('خادمة') ||
    rawFields.includes('خادمه') ||
    rawFields.includes('female')
  ) {
    return 'female';
  }
  if (member.gender === 'male' && member.genderLocked) {
    return 'male';
  }

  const originalFirstName = fullName.split(/\s+/)[0] || '';
  const firstName = originalFirstName
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ڤ/g, 'ف');

  if (FEMALE_FIRST_NAMES.has(firstName) || FEMALE_FIRST_NAMES.has(originalFirstName)) {
    return 'female';
  }

  if (originalFirstName.endsWith('ة') && !MALE_ENDING_WITH_TA.has(originalFirstName) && !MALE_ENDING_WITH_TA.has(firstName)) {
    return 'female';
  }

  return 'male';
}

export function detectAndRepairGender(member: any): 'male' | 'female' {
  return getMemberGender(member);
}

export function getNormalizedGender(member: any): 'male' | 'female' {
  return getMemberGender(member);
}

export interface VisitationRecord {
  memberId: string;
  visitedAt: string; // ISO string
  servantId: string;
  servantName: string;
  notes?: string;
  type: 'general' | 'special';
}

export interface SpecialVisitedRecord {
  memberId: string;
  visitedBy: string;
  visitedAt: string; // ISO string
  assignmentId?: string;
}

export interface SpecialAssignment {
  id: string;
  servantId: string;
  servantName: string;
  assignedMemberIds: string[];
  completedMemberIds?: string[]; // معرّفات المخدومين الذين تم وضع علامة صح (تم افتقادهم) لهم في النظام الخاص
  completedDetails?: Record<string, { visitedBy: string; visitedAt: string }>; // تفاصيل افتقاد كل مخدوم في النظام الخاص فقط
  historyMemberIds?: string[]; // سجل معرّفات المخدومين السابقين لمنع تكرار نفس الأسماء في التكليفات القادمة
  startDate: string; // ISO
  endDate: string; // ISO
  periodDays: number;
  status: 'active' | 'completed';
}

export interface BlockedUser {
  id: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  uniqueCode?: string;
  ipAddress?: string;
  reason?: string;
  blockedAt: string; // ISO string
  blockedBy: string; // e.g. 'Community Owner'
}

export interface Registrant {
  id: string;
  uniqueCode: string; // e.g. "TY-8492"
  fullName: string; // 3 words in Arabic strictly
  gender: 'male' | 'female'; // ذكر / أنثى
  genderCode?: 'male' | 'female';
  manualGender?: 'male' | 'female';
  genderLabel?: string;
  type?: string;
  category?: string;
  genderLocked?: boolean; // قفل الجنس عند تعديله يدوياً بواسطة مسؤول المجتمع
  ownerGenderModifiedAt?: number;
  isOwner?: boolean;
  registeredInCleanMasterV1?: boolean;
  phone: string;
  whatsapp: string;
  phoneCountry?: string;
  whatsappCountry?: string;
  email?: string; // بريد إلكتروني اختياري
  dob: string; // YYYY-MM-DD
  photoUrl: string;
  avatar?: string;
  image?: string;
  registeredAt: string; // ISO string
  qrData: string; // encoded QR payload
  qrCode?: string;
  password?: string; // member password for login
  recoveryCode?: string; // الكود السداسي للأمان واستعادة كلمة المرور
  securityCode?: string; // مرادف لكود الأمان السداسي في CLEAN_MASTER_DB_V1
  deviceRecoveryToken?: string; // مفتاح الجهاز الموثوق المشفر لاستعادة الحساب عبر الهاتف/البصمة
  address?: string; // عنوان المنزل (اختياري)
  residence?: string; // مرادف لعنوان السكن
  location?: string;
  notes?: string; // ملاحظات (اختياري)
  bio?: string;
  talents?: string; // المواهب والمهارات
  skills?: string; // المهارات
  hobbies?: string;
  university?: string;
  college?: string;
  graduationYear?: string;
  confessionFather?: string;
  name?: string; // مرادف للاسم الثلاثي
  sex?: 'male' | 'female'; // مرادف للجنس
  birthDate?: string; // مرادف لتاريخ الميلاد
  role: UserRole;
  status: 'active' | 'cancelled' | 'blocked';
  permissions?: AdminPermissions;
  ipAddress?: string; // عنوان الـ IP الخاص بالجهاز عند التسجيل أو الدخول
  
  // Visitation tracking
  lastVisitedAt?: string;
  lastVisitedBy?: string;
  isVisitedGeneral?: boolean;

  // Member self-update & admin-update tracking
  updatedAt?: number;
  lastUpdatedAt?: string;
  lastModifiedAt?: number;
  updatedFields?: string[];
  detectedCountry?: string;

  // Face biometrics / uniqueness signature
  faceSignature?: string; // بصمة ملامح الوجه المشفرة لمنع تكرار الحسابات بالوجه
  needsRealPhoto?: boolean; // تنبيه بالحاجة لصورة حقيقية للتعرف على العضو في الاجتماع
  needsRealPhotoReminder?: boolean; // تنبيه لطيف بالحاجة لصورة حقيقية

  // Online Presence & Last Seen Tracking
  isOnline?: boolean;
  lastSeen?: string; // ISO string

  // Direct Member Attendance & Stamp Tracking
  originalId?: string;
  stamps?: Record<string, any>;
  fridayStamps?: Record<string, any>;
  attendanceDates?: string[];
  attendanceHistory?: any[];
  attendance?: any[];
  presentDates?: string[];
  lastAttendance?: string;
}

export interface AttendanceRecord {
  id: string;
  registrantId: string;
  registrantName: string;
  uniqueCode?: string;
  registrantPhotoUrl: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string
  scannedAt?: string;
  timeString?: string;
  orderNumber?: number;
  method: 'camera_scan' | 'manual';
}

export interface AdminSession {
  id?: string;
  email: string;
  name: string;
  token: string;
  role: UserRole;
  gender?: 'male' | 'female';
  permissions?: AdminPermissions;
  scannerSessionToken?: string;
  scannerTokenExpiresAt?: number;
}

export interface MemberSession {
  registrant: Registrant;
  token: string;
}

export interface VisitationNote {
  id: string;
  memberId: string;
  memberName: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string; // ISO string
  notes: string;
}

export type AnnouncementTargetAudience = 
  | 'all' 
  | 'absent_today' 
  | 'attended_today' 
  | 'males_only' 
  | 'females_only'
  | 'community_owner_only'
  | 'servant_personal';

export type ReactionType = 'amen' | 'love' | 'like' | 'fire' | 'celebrate';

export interface AnnouncementViewer {
  memberId: string;
  memberName: string;
  viewedAt: string; // ISO string
  photoUrl?: string;
  gender?: 'male' | 'female';
  reaction?: ReactionType;
}

export interface Announcement {
  id: string;
  title: string;
  content: string; // May include placeholder [الاسم الأول] or فلان
  authorName?: string;
  priority?: 'normal' | 'important' | 'urgent';
  updatedAt?: string;
  templateType?: 'meeting_reminder_7pm' | 'absence_care_9pm' | 'attendance_thanks' | 'custom' | 'spiritual_word';
  senderRole?: UserRole;
  senderName?: string;
  senderPhotoUrl?: string;
  targetAudience?: AnnouncementTargetAudience;
  targetDate?: string; // YYYY-MM-DD
  createdAt: string; // ISO string
  reactions?: Record<string, string[]>; // emoji -> array of memberIds
  viewers?: AnnouncementViewer[]; // من شاهدوا الإعلان
  pinned?: boolean;
  imageUrl?: string;
  expiresAt?: string;
  targetUserId?: string;
  targetServantName?: string;
  isVisitationTaskAlert?: boolean;
}

// ==========================================
// KAHOOT COMPETITIONS & OPINIONS TYPES
// ==========================================

export type KahootQuestionType = 
  // 1. Competitive / Scored Types (أنواع الأسئلة التنافسية):
  | 'quiz'             // اختيار من متعدد (2 إلى 6 خيارات) مع إجابة واحدة أو متعددة
  | 'true_false'       // صح أو خطأ
  | 'puzzle'           // ترتيب عناصر (Ordering / Puzzle)
  | 'matching'         // مطابقة عناصر من مجموعتين (Matching)
  | 'type_answer'      // إجابة قصيرة نصية (Short Answer)
  | 'image_quiz'       // سؤال بالصور (Image Question)
  | 'slider'           // شريط تمرير رقمي مع هامش خطأ
  | 'audio_quiz'       // سؤال صوتي مدمج
  | 'pin_answer'       // تحديد منطقة صحيحة على صورة (Hotspot)
  // 2. Collect Opinions / Unscored Types (أنواع جمع الآراء والتصويت):
  | 'word_cloud'       // سحابة كلمات (Word Cloud)
  | 'poll'             // استطلاع رأي / تصويت مباشر (Poll)
  | 'open_ended'       // سؤال مفتوح (Open Question)
  | 'rating'           // سؤال تقييم (Rating ⭐ 1-5 أو مقياس موافقة)
  | 'brainstorm'       // عصف ذهني مع تصويت Upvote
  | 'drop_pin'         // وضع دبابيس حرة على صورة
  | 'scale';           // مقياس تقييم مع المتوسط والتوزيع

export interface KahootOption {
  id: string;
  text: string;
  imageUrl?: string;
  isCorrect?: boolean;
  color?: 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange';
  shape?: 'triangle' | 'diamond' | 'circle' | 'square' | 'hexagon' | 'star';
}

export interface KahootPuzzleItem {
  id: string;
  text: string;
  correctIndex: number; // 0, 1, 2, 3...
}

export interface KahootMatchingPair {
  id: string;
  leftText: string;
  rightText: string;
}

export interface KahootQuestion {
  id: string;
  type: KahootQuestionType;
  title: string;
  description?: string;
  // Media support: Image, Video, YouTube (with start/end seconds), Audio
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'youtube';
  imageReveal?: boolean; // كشف الصورة تدريجياً مربعاً تلو الآخر أثناء العد التنازلي
  youtubeStartSec?: number;
  youtubeEndSec?: number;
  timeLimitSeconds: number; // 5 to 240 seconds
  pointsMultiplier: number; // 1 (1000 base), 2 (2000 double), 0 (unscored)
  customPoints?: number; // نقاط مخصصة للسؤال (اختياري)
  options?: KahootOption[];
  multiSelect?: boolean; // إمكانية اختيار أكثر من إجابة صحيحة (Multiple Select)
  // For Puzzle / Ordering:
  puzzleItems?: KahootPuzzleItem[];
  // For Matching (مطابقة):
  matchingPairs?: KahootMatchingPair[];
  // For Type Answer / Short Answer:
  correctTextAnswer?: string;
  acceptableTextAnswers?: string[];
  ignoreCase?: boolean;
  ignoreDiacritics?: boolean; // تجاهل التشكيل والهمزات والمسافات الزائدة
  // For Slider:
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderCorrectValue?: number;
  sliderMarginOfError?: number; // هامش الخطأ المقبول
  // For Pin Answer & Drop Pin:
  pinCoordinates?: { xPercent: number; yPercent: number; tolerancePercent: number };
  pinHotspot?: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
  // For Scale & Rating:
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: { min: string; max: string };
  ratingStyle?: 'stars' | ' numeric' | 'agreement';
  isOpinion?: boolean;
  // Spiritual & Pedagogical Enrichment (إضافات روحية وتعليمية):
  explanation?: string;         // شرح الإجابة الصحيحة بعد ظهور النتيجة
  biblicalReference?: string;   // مرجع كتابي اختياري (مثال: دانيال 3: 17)
  feedbackText?: string;        // رسالة تشجيعية أو Feedback بعد الإجابة
  servantNote?: string;         // ملاحظة خاصة للخادم لا تظهر للمشاركين
  isDisabled?: boolean;         // تعطيل السؤال مؤقتاً دون حذفه
  category?: string;            // تصنيف السؤال
  tags?: string[];              // وسوم السؤال
}

export interface KahootQuestionBankItem {
  id: string;
  question: KahootQuestion;
  category: string;
  tags: string[];
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt?: string;
  usageCount?: number;
}

export type KahootQuizStatus = 'draft' | 'published' | 'live' | 'finished' | 'archived';
export type KahootGameMode = 'live' | 'self_paced' | 'team' | 'anonymous_poll';

export interface KahootQuizSettings {
  enablePoints?: boolean;
  basePoints?: number; // Default 1000
  speedBonus?: boolean;
  streakBonus?: boolean;
  defaultTimeLimit?: number;
  allowReentry?: boolean;
  allowRetry?: boolean; // السماح للمخدوم بإعادة المسابقة لتحسين السكور في التحدي الذاتي
  selfPacedTimerEnabled?: boolean; // تفعيل التايمر أو بدون تايمر في وضع التحدي الذاتي (افتراضي true)
  showParticipantNames?: boolean;
  leaderboardVisibility?: 'after_each' | 'every_few' | 'end_only' | 'hidden';
  showCorrectAnswers?: boolean;
  showFeedback?: boolean;
  allowLateJoin?: boolean;
  allowMemberViewResults?: boolean;
}

export interface KahootTeamConfigItem {
  id: string;
  name: string;
  color: string;
  icon?: string;
  pin?: string;
}

export interface KahootQuiz {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  category?: string;          // التصنيف (الكتاب المقدس، تاريخ الكنيسة، سفر دانيال والثلاثة فتية، عقيدة وطقس، عام...)
  ageGroup?: string;          // الفئة العمرية (شباب، إعدادي وثانوي، جميع الأعمار...)
  tags?: string[];            // الوسوم (Tags)
  language?: 'ar' | 'en';     // اللغة والاتجاه
  status?: KahootQuizStatus;  // حالة المسابقة (draft | published | live | finished | archived)
  gameMode?: KahootGameMode;  // وضع التشغيل الافتراضي (live | self_paced | team | anonymous_poll)
  activePlayMode?: KahootGameMode; // الوضع النشط الحالي المحفوظ للمسابقة
  activeSessionId?: string;   // معرف الجلسة المباشرة النشطة إن وجدت
  teamAssignmentMode?: 'random' | 'manual_or_pin'; // توزيع عشوائي أو اختيار كل فريق / PIN خاص لكل فريق
  customTeams?: KahootTeamConfigItem[]; // إعدادات وأسماء وعدد الفرق المخصصة
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt?: string;
  playCount?: number;         // عدد مرات التشغيل
  participantsCount?: number; // إجمالي عدد المشاركين
  questions: KahootQuestion[];
  isPublished: boolean;
  isVisibleToMembers?: boolean; // إظهار أو إخفاء يدوي من صفحة المخدومين (افتراضياً true)
  isScheduled?: boolean; // تفعيل جدولة التوقيت للمسابقة
  availableFromDate?: string; // YYYY-MM-DD تاريخ بداية فتح المسابقة
  availableToDate?: string;   // YYYY-MM-DD تاريخ نهاية إغلاق المسابقة
  availableFromTime?: string; // HH:mm ساعة بداية فتح المسابقة
  availableToTime?: string;   // HH:mm ساعة نهاية إغلاق المسابقة
  autoHideOnExpiry?: boolean; // إخفاء وإلغاء الدخول تلقائياً عند انتهاء التوقيت (افتراضياً true)
  customAiPrompt?: string;    // وصف وتوجيهات الذكاء الاصطناعي المخصصة عند إنشاء المسابقة
  maxPlayersLimit?: number; // 0 or undefined = unlimited
  settings?: KahootQuizSettings;
  antiCheat: {
    secondScreenMode?: boolean; // نص السؤال على شاشة العرض فقط، وعلى شاشة اللاعب الأشكال فقط
    detectTabSwitch: boolean; // منع قفل أو مغادرة الصفحة
    blockAiAssist: boolean; // منع أدوات الذكاء الاصطناعي وإضافات المتصفح
    canvasTextProtection?: boolean; // رسم نص السؤال داخل عنصر Canvas لمنع أدوات وسكرابر الذكاء الاصطناعي من قراءة الـ DOM
    freezeOnBlur?: boolean; // تجميد السؤال أو تصفير النقاط عند مغادرة التبويب
    disableCopyPaste?: boolean; // منع النسخ واللصق والنقر الأيمن
    randomizeQuestions?: boolean; // خلط ترتيب الأسئلة
    randomizeAnswers?: boolean; // خلط ترتيب الخيارات
  };
}

export interface KahootPlayer {
  id: string;
  name: string;
  avatar?: string;
  teamId?: string;
  teamName?: string;
  score: number;
  streak: number;
  currentRank: number;
  previousRank?: number; // For rank change indicator (up/down/same)
  lastAnswerCorrect?: boolean;
  lastPointsEarned?: number;
  lastAnswerTimeMs?: number;
  correctCount?: number;
  totalAnswered?: number;
  totalTimeMs?: number;
  cheatWarningsCount?: number;
  isOnline: boolean;
}

export interface KahootTeam {
  id: string;
  name: string;
  color: string;
  icon: string;
  pin?: string;           // كود PIN خاص بالفريق للانضمام المباشر أو عبر QR
  score: number;
  lastQuestionPoints?: number;
  currentRank?: number;
  previousRank?: number;
  memberCount?: number;
}

export interface KahootLiveSession {
  id: string; // Game PIN e.g. "592104"
  quizId: string;
  quizTitle?: string;
  quizCoverImage?: string;
  hostId: string;
  hostName?: string;
  status: 'lobby' | 'question_countdown' | 'question_active' | 'answer_reveal' | 'leaderboard' | 'podium' | 'finished';
  gameMode?: KahootGameMode;
  teamAssignmentMode?: 'random' | 'manual_or_pin';
  isLocked?: boolean;         // قفل الانضمام للجلسة
  allowLateJoin?: boolean;    // السماح بالانضمام المتأخر أثناء اللعب
  leaderboardVisibility?: 'after_each' | 'every_few' | 'end_only' | 'hidden';
  showParticipantNames?: boolean;
  currentQuestionIndex: number;
  questionStartedAt?: number;
  questionTimeLimitSeconds: number;
  secondScreenMode?: boolean;
  randomizeAnswers?: boolean;
  canvasTextProtection?: boolean;
  freezeOnBlur?: boolean;
  players: Record<string, KahootPlayer>;
  teams?: Record<string, KahootTeam>;
  answersSubmitted: Record<string, {
    playerId: string;
    playerName?: string;
    teamId?: string;
    questionId: string;
    answer: any;
    answerLabel?: string;
    isCorrect: boolean;
    points: number;
    timeElapsedMs: number;
    submittedAt: number;
  }>;
  opinionsCollected?: Record<string, Array<{ playerId: string; playerName: string; response: any; createdAt: number; upvotes?: number }>>;
  maxPlayersLimit?: number; // 0 = unlimited
  startedAt?: string;
  finishedAt?: string;
  updatedAtMs?: number;
  stateVersion?: number;
}

export interface ScannerSessionGuard {
  isActive: boolean;
  durationMinutes: number;
  startedAt?: number;
  expiresAt?: number;
  startedBy?: string;
}

export interface KahootSoloScore {
  id: string;
  quizId: string;
  quizTitle: string;
  playerId: string;
  playerName: string;
  playerAvatar?: string;
  score: number;
  previousRank?: number;
  correctCount: number;
  totalQuestions: number;
  currentQuestionIndex?: number;
  status?: 'in_progress' | 'completed';
  startedAt?: string;
  updatedAt?: string;
  attemptCount?: number;
  avgTimeMs?: number;
  completedAt: string;
  answersDetail?: Array<{
    questionId: string;
    questionTitle: string;
    answer: any;
    answerLabel?: string;
    isCorrect: boolean;
    points: number;
    timeElapsedMs: number;
  }>;
}


export interface CardTemplate {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  subtextColor: string;
  bgType: 'gradient' | 'solid' | 'custom_image';
  bgGradientStart: string;
  bgGradientEnd: string;
  bgGradientDirection?: 'to-br' | 'to-b' | 'to-r';
  customBgImageUrl?: string | null;
  bgImageOpacity: number;
  bgImageOverlayColor?: string;
  patternType: 'none' | 'crosses' | 'coptic_ornaments' | 'geometric' | 'dots' | 'waves';
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  topBandStyle: 'gradient' | 'solid' | 'gold' | 'none';
  badgeBgColor: string;
  badgeTextColor: string;
  badgeBorderColor: string;
  qrBorderColor: string;
  updatedAt?: string;
  updatedBy?: string;
}

// ==========================================
// EVENTS MANAGEMENT SYSTEM (الرحلات والأيام الروحية والمؤتمرات)
// ==========================================

export type EventType = 'trip' | 'spiritual_day' | 'conference' | 'retreat' | 'other';

export type EventStatus = 'draft' | 'registration_open' | 'registration_closed' | 'completed' | 'cancelled' | 'archived';

export type PaymentMethodType = 'bank_transfer' | 'vodafone_cash' | 'instapay' | 'cash' | 'other';

export type PaymentStatus =
  | 'pending_confirmation'
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'waived'
  | 'cancelled';

export type EventRegistrationStatus = 'registered' | 'cancelled' | 'waitlisted';

export type EventStaffRole =
  | 'EVENT_MANAGER'
  | 'REGISTRATION_ORGANIZER'
  | 'PAYMENT_MANAGER'
  | 'BUS_ORGANIZER'
  | 'QR_ATTENDANCE'
  | 'BUS_ATTENDANCE_ONLY'
  | 'OVERRIDE_EVENT_REGISTRATION_LIMITS';

export type EventPermissionKey =
  | 'VIEW_ASSIGNED_REGISTRATIONS'
  | 'CONFIRM_REGISTRATION'
  | 'CANCEL_REGISTRATION'
  | 'VIEW_PAYMENT_DETAILS'
  | 'CONFIRM_PAYMENT'
  | 'ADD_PARTIAL_PAYMENT'
  | 'APPLY_DISCOUNT'
  | 'VIEW_BUS_ASSIGNMENTS'
  | 'ASSIGN_MEMBERS_TO_BUSES'
  | 'MOVE_MEMBERS_BETWEEN_BUSES'
  | 'PREPARE_QR_ATTENDANCE'
  | 'SCAN_QR_CODES'
  | 'MANUAL_ATTENDANCE'
  | 'OVERRIDE_EVENT_REGISTRATION_LIMITS'
  | 'BUS_ATTENDANCE_ONLY';

export type EventAvailabilityState =
  | 'draft'
  | 'registration_closed'
  | 'deadline_passed'
  | 'capacity_full'
  | 'open';

export interface EventStaffAssignment {
  id: string;
  eventId: string;
  userId: string; // Foreign Key -> Registrant.id (Servant ID from المخدومين والرتب)
  userName: string;
  userPhone?: string;
  userPhotoUrl?: string;
  userRole?: UserRole;
  roles: EventStaffRole[];
  permissions?: EventPermissionKey[];
  assignedBusId?: string | null;
  assignedBy: string;
  assignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventPaymentContact {
  id: string;
  servantId?: string; // Foreign Key -> Registrant.id from المخدومين والرتب
  name: string;
  phone: string;
  photoUrl?: string;
  roleTitle?: string;
  paymentMethods?: PaymentMethodType[]; // Supports multiple payment methods per servant
  paymentMethod?: PaymentMethodType | 'all'; // Legacy fallback
}

export interface CommunityEvent {
  id: string;
  name: string;
  type: EventType;
  description: string;
  imageUrl?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string; // HH:mm وقت بداية الفعالية
  endTime?: string;   // HH:mm وقت انتهاء الفعالية
  isVisibleToMembers?: boolean; // زرار إظهار أو إخفاء الفعالية من صفحة المخدومين (افتراضياً true)
  autoHideOnExpiry?: boolean;   // إخفاء تلقائي من صفحة المخدومين عند انتهاء موعدها (افتراضياً true)
  isArchived?: boolean;         // أرشفة الفعالية مع الاحتفاظ بجميع بيانات المسجلين والمدفوعات
  location: string;
  registrationDeadline: string; // YYYY-MM-DD
  capacityType?: 'limited' | 'unlimited';
  maxCapacity: number; // 0 means unlimited when capacityType === 'unlimited'
  basePrice: number;
  currency: string; // Default 'EGP'
  paymentInstructions: string;
  availablePaymentMethods: PaymentMethodType[];
  whatsappContacts: EventPaymentContact[];
  allowOverPayment?: boolean;
  status: EventStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationGroup {
  id: string;
  eventId: string;
  primaryMemberId: string;
  registrationReference: string; // e.g. #REG-2026-00125
  paymentMethod: PaymentMethodType;
  selectedContactId?: string;
  selectedContactName?: string;
  selectedContactPhone?: string;
  assignedServantId?: string;
  assignedServantName?: string;
  assignedServantPhone?: string;
  totalPeopleCount: number;
  totalGroupOriginalPrice: number;
  createdAt: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  memberId: string; // Foreign Key -> Registrant.id (Never duplicate member data!)
  registrationGroupId?: string; // Foreign Key -> RegistrationGroup.id
  registrationReference: string; // e.g. #REG-2026-00125
  registrationDate: string;
  registrationStatus: EventRegistrationStatus;
  registeredBy: string; // 'public_link' or Servant Name
  originalPrice: number; // Snapshot of event.basePrice at registration time
  discountAmount: number;
  discountReason?: string;
  finalRequiredAmount: number; // originalPrice - discountAmount
  totalPaidAmount: number;
  remainingAmount: number; // finalRequiredAmount - totalPaidAmount
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethodType;
  selectedContactId?: string;
  selectedContactName?: string;
  selectedContactPhone?: string;
  assignedServantId?: string; // Foreign Key -> Registrant.id of the responsible servant
  assignedServantName?: string;
  assignedServantPhone?: string;
  paymentNotes?: string;
  isOverride?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  overrideAt?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  busId?: string | null; // Original Assigned Bus Foreign Key -> EventBus.id
  actualBusId?: string | null; // Actual Attendance Bus Foreign Key -> EventBus.id (Never overwrites busId!)
  seatNumber?: number;
  attendanceStatus: 'present' | 'absent';
  checkInTime?: string;
  checkedInBy?: string;
  checkInMethod?: 'QR' | 'Manual';
  notes?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  eventId: string;
  eventRegistrationId: string;
  memberId: string;
  amount: number;
  paymentMethod: PaymentMethodType;
  paymentReference?: string;
  receivedBy: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

export interface EventBus {
  id: string;
  eventId: string;
  name: string;
  driverName: string;
  driverPhone: string;
  responsibleServantId?: string; // Foreign Key -> Registrant.id (Servant from المخدومين والرتب)
  responsibleServantName?: string;
  responsibleServantPhone?: string;
  capacity: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EventAttendance {
  id: string;
  eventId: string;
  eventRegistrationId: string;
  memberId: string;
  busId?: string | null; // Legacy alias for actualBusId
  originalBusId?: string | null; // Bus assigned during organization
  actualBusId?: string | null;   // Bus actually boarded during QR/Manual check-in
  status: 'present' | 'absent';
  checkInTime: string;
  checkedInBy: string;
  method: 'QR' | 'Manual';
}

export type EventAuditActionType =
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'registration_created'
  | 'registration_override'
  | 'registration_confirmed'
  | 'registration_cancelled'
  | 'registration_restored'
  | 'discount_updated'
  | 'payment_added'
  | 'payment_confirmed'
  | 'payment_deleted'
  | 'payment_status_changed'
  | 'bus_created'
  | 'bus_updated'
  | 'bus_deleted'
  | 'bus_assigned'
  | 'bus_unassigned'
  | 'attendance_checked_in'
  | 'attendance_bus_changed'
  | 'attendance_revoked'
  | 'staff_assigned'
  | 'staff_updated'
  | 'staff_removed';

export interface EventAuditLog {
  id: string;
  eventId: string;
  registrationId?: string;
  memberId?: string;
  memberName?: string;
  targetMemberName?: string;
  actionType: EventAuditActionType;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  description?: string;
  changedBy: string;
  performedByName?: string;
  createdAt: string;
  timestamp?: string;
}





