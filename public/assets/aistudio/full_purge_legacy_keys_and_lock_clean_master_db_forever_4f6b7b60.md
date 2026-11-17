# الدفعة الهندسية الختامية المدققة: المراجعة العميقة للـ 96 اسماً بكامل بياناتهم وصورهم وباسورداتهم وأختامهم فرداً فرداً داخل (CLEAN_MASTER_DB_V1) قبل المسح النهائي للمفاتيح القديمة + استقرار التسجيل الجديد والمزامنة الشاملة 1000%

<zero_error_deep_audit_protocol>
⚠️ **بروتوكول الفحص العميق الإجباري قبل مسح أي مفتاح قديم (`Pre-Purge Deep Field & Photo Audit`):**
1. **يُمنع منعاً باتاً الاكتفاء بفحص عدد الأعضاء فقط (`length >= 90`) قبل مسح المفاتيح القديمة!**
2. **يجب تنفيذ دورة فحص واسترجاع عميقة (`deepAuditAndEnrichBeforePurge`) تمر على الـ 96 عضواً المعتمدين اسماً اسماً، وتتحقق من كل حقل من حقولهم:**
   - **الاسم الكامل والجنس المعتمد** (`name`, `gender`, `manualGender`).
   - **الصورة الشخصية** (`photoUrl` / `avatar` / `image`) مع التحقق من ملكية الصورة (`photoOwnerName`) وعدم تصادمها مع عضو آخر.
   - **بيانات الدخول والأمان** (`password`, `recoveryCode`, `securityCode`).
   - **بيانات التواصل والتفاصيل** (`phone`, `whatsapp`, `address`, `notes`, `role`, `permissions`, `qrCode`).
   - **سجل الحضور والأختام** (`stamps`, `attendanceDates`, `attendanceHistory`).
3. **قاعدة الإنقاذ التلقائي قبل المسح:**
   - إذا وجد الفحص العميق أن أي عضو من الـ 96 عضواً داخل `CLEAN_MASTER_DB_V1` ينقصه حقل واحد (مثلاً صورته أو رقم هاتفه أو باسورده أو أختامه فارغة في `CLEAN_MASTER_DB_V1` ولكنها موجودة في أحد المفاتيح القديمة `app_state` أو `members` أو الكاش)، **يقوم الكود فوراً بنسخ واستكمال هذه البيانات الناقصة إلى داخل `CLEAN_MASTER_DB_V1` وحفظها أولاً!**
4. **شرط المسح النهائي (`Strict Purge Gate`):**
   - فقط وحصرياً بعد اكتمال فحص الـ 96 عضواً والتأكد برمجياً بنسبة 100% من استيفاء جميع أسمائهم وبياناتهم وصورهم وأختامهم + نقل الفعاليات (`events`) والمسابقات (`competitions`) وسجلات الحضور (`attendanceRecords`) وصلاحيات الرتب (`rolePermissions`) إلى `CLEAN_MASTER_DB_V1`، يتم مسح المفاتيح القديمة بأمان تام!
</zero_error_deep_audit_protocol>

---

<verified_96_members_manifest>
القائمة الكاملة المعتمدة للـ 96 عضواً (الـ 95 الأساسيين + `مارتينا انطونيوس بقطر` + التأكيد الصارم على وجود `دينا اسحق غنامي` و`فؤاد فواز يسي` و`ميخائيل ادور راتب` كـ `مسؤول المجتمع`):

```javascript
export const VERIFIED_96_MANIFEST = [
  { num: 1, name: 'مارولينا كمال بدري', gender: 'female' },
  { num: 2, name: 'اندراوس مبارك هرون', gender: 'male' },
  { num: 3, name: 'مارولا روماني فوزي', gender: 'female' },
  { num: 4, name: 'مهرائيل بيتر شكري', gender: 'female' },
  { num: 5, name: 'نونسيا ناصر كرزون', gender: 'female' },
  { num: 6, name: 'مارتينا ماركو ميشيل', gender: 'female' },
  { num: 7, name: 'اربسيما انطونيوس الفي', gender: 'female' },
  { num: 8, name: 'توماس جودت وهب', gender: 'male' },
  { num: 9, name: 'باڤلي ريمون يعقوب', gender: 'male' },
  { num: 10, name: 'دميانة ادور راتب', gender: 'female' },
  { num: 11, name: 'ماريا جرجس نصري', gender: 'female' },
  { num: 12, name: 'اسطفانوس ادور صديق', gender: 'male' },
  { num: 13, name: 'وليم انيس حليم', gender: 'male' },
  { num: 14, name: 'مارينا جون راشد', gender: 'female' },
  { num: 15, name: 'مهرائيل حافظ بدري', gender: 'female' },
  { num: 16, name: 'جورج ناصر فتحي', gender: 'male' },
  { num: 17, name: 'ديانا اسحق غنامي', gender: 'female' },
  { num: 18, name: 'ماريا امين بشاي', gender: 'female' },
  { num: 19, name: 'كيلارا ماهر سمير', gender: 'female' },
  { num: 20, name: 'نانسي انسي حليم', gender: 'female' },
  { num: 21, name: 'مريم وجدي وليم', gender: 'female' },
  { num: 22, name: 'ماري روماني فكري', gender: 'female' },
  { num: 23, name: 'سيسليا رزيقي سليمان', gender: 'female' },
  { num: 24, name: 'صرابامون اسعد ميشيل', gender: 'male' },
  { num: 25, name: 'مريم سمير لبيب', gender: 'female' },
  { num: 26, name: 'فلورينا فاروق نظيم', gender: 'female' },
  { num: 27, name: 'ميخاءيل امير عبدله', gender: 'male' },
  { num: 28, name: 'ڤيرونيا جوروج جابر', gender: 'female' },
  { num: 29, name: 'مكاريوس منير إسكندر', gender: 'male' },
  { num: 30, name: 'ابانوب اسعد ثابت', gender: 'male' },
  { num: 31, name: 'مينا رأفت عيسى', gender: 'male' },
  { num: 32, name: 'مينا عاصم نصري', gender: 'male' },
  { num: 33, name: 'مادونا منتصر عادل', gender: 'female' },
  { num: 34, name: 'مارتينا مدحت ثابت', gender: 'female' },
  { num: 35, name: 'ڤيرونيكا رامي سامي', gender: 'female' },
  { num: 36, name: 'مهراتي ملاك فؤاد', gender: 'female' },
  { num: 37, name: 'ايلاريا ميخائيل شوقي', gender: 'female' },
  { num: 38, name: 'يوانا صمؤيل صبحي', gender: 'female' },
  { num: 39, name: 'دينا اسحق غنامي', gender: 'female' },
  { num: 40, name: 'جويس هاني فاروق', gender: 'female' },
  { num: 41, name: 'ثابت مدحت ثابت', gender: 'male' },
  { num: 42, name: 'بافلي روماني فكري', gender: 'male' },
  { num: 43, name: 'كيرلس ملاك فؤاد', gender: 'male' },
  { num: 44, name: 'مريم مكين جرجس', gender: 'female' },
  { num: 45, name: 'يوستينا عاطف جرجس', gender: 'female' },
  { num: 46, name: 'سارة نادر صدقي', gender: 'female' },
  { num: 47, name: 'كلارا عاطف رفعت', gender: 'female' },
  { num: 48, name: 'مهرائيل سعيد فوزي', gender: 'female' },
  { num: 49, name: 'ايزيس عاطف منير', gender: 'female' },
  { num: 50, name: 'بيشوي رافت فرج', gender: 'male' },
  { num: 51, name: 'بيمن روماني بقطر', gender: 'male' },
  { num: 52, name: 'أردينا حداد ساويرس', gender: 'female' },
  { num: 53, name: 'فايز فيكتور فايز', gender: 'male' },
  { num: 54, name: 'فيرا رفاعي اسحق', gender: 'female' },
  { num: 55, name: 'ديفيد رؤوف رمزي', gender: 'male' },
  { num: 56, name: 'ميخائيل ادور راتب', gender: 'male', isOwner: true },
  { num: 57, name: 'استيف اسحق عادل', gender: 'male' },
  { num: 58, name: 'ناريمان نصري ملك', gender: 'female' },
  { num: 59, name: 'فبرونيا فادي فوزي', gender: 'female' },
  { num: 60, name: 'ماريمنا ناجي رياض', gender: 'female' },
  { num: 61, name: 'كريستينا انسي حليم', gender: 'female' },
  { num: 62, name: 'انطونيا سمير ادوارد', gender: 'female' },
  { num: 63, name: 'مارتينا اكرم هلال', gender: 'female' },
  { num: 64, name: 'انطوني نصري سلاطين', gender: 'male' },
  { num: 65, name: 'نرمين أنيس حليم', gender: 'female' },
  { num: 66, name: 'مريانا مفتي عطالله', gender: 'female' },
  { num: 67, name: 'انتوني رافت زاهر', gender: 'male' },
  { num: 68, name: 'سوسنه عادل يوسف', gender: 'female' },
  { num: 69, name: 'كيرلس راجي اسعد', gender: 'male' },
  { num: 70, name: 'مايكل القمص أبرام', gender: 'male' },
  { num: 71, name: 'ماري شنوده اسعد', gender: 'female' },
  { num: 72, name: 'فؤاد فواز يسي', gender: 'male' },
  { num: 73, name: 'جوليانا ناجي اديب', gender: 'female' },
  { num: 74, name: 'مارينا مجدي إبراهيم', gender: 'female' },
  { num: 75, name: 'بوتيتو امين بشاي', gender: 'female' },
  { num: 76, name: 'ارسان وجدى فكتور', gender: 'male' },
  { num: 77, name: 'جيسكا رامي سامي', gender: 'female' },
  { num: 78, name: 'مريم سعيد برسوم', gender: 'female' },
  { num: 79, name: 'مكاريوس صليب صبحي', gender: 'male' },
  { num: 80, name: 'كاترينا امير لطفى', gender: 'female' },
  { num: 81, name: 'ايلاريا ناجي عبده', gender: 'female' },
  { num: 82, name: 'دولاجي فتحي عزمي', gender: 'female' },
  { num: 83, name: 'مقار روماني وليم', gender: 'male' },
  { num: 84, name: 'جسيكا بدري فوزي', gender: 'female' },
  { num: 85, name: 'بارثينا ايمن عزمي', gender: 'female' },
  { num: 86, name: 'مونيكا مينا ثابت', gender: 'female' },
  { num: 87, name: 'الكساندرا امير ادوارد', gender: 'female' },
  { num: 88, name: 'سارة رضا وليم', gender: 'female' },
  { num: 89, name: 'ايليا جمال صادق', gender: 'male' },
  { num: 90, name: 'اليسا صبري ابراهيم', gender: 'female' },
  { num: 91, name: 'دانيال مجدي نبيل', gender: 'male' },
  { num: 92, name: 'فيرينيا هاني فيليب', gender: 'female' },
  { num: 93, name: 'مادونا مينا ثروت', gender: 'female' },
  { num: 94, name: 'كيرلس جوزيف فوزي', gender: 'male' },
  { num: 95, name: 'ايناس حنا خليل', gender: 'female' },
  { num: 96, name: 'مارتينا انطونيوس بقطر', gender: 'female' }
];

</verified_96_members_manifest>

Task 1: دالة المراجعة العميقة للاسم والبيانات والصور (deepVerifyAndEnrichAllMembersBeforePurge) قبل مسح المفاتيح القديمة
المطلوب بالتفصيل في ملف الـ Worker (worker.js / worker.ts) وملف cloudSync.ts:

قبل حذف أي مفتاح قديم، قم بتشغيل دالة deepVerifyAndEnrichAllMembersBeforePurge التي تقوم بالتالي:

تقرأ المحتوى الحالي لـ CLEAN_MASTER_DB_V1.

تقرأ جميع المفاتيح القديمة المتوفرة (app_state, members, threefetya_state, backup_members, إلخ) كـ مخزن إنقاذ ومراجعة (legacyPool).

المراجعة الفردية لكل اسم من الـ 96 اسماً بالبيانات والصور (Field-by-Field & Photo Audit):

function deepAuditAndMergeMember(manifestEntry, currentMasterRecords, legacyPoolRecords, usedPhotosSet) {
  const targetNormName = ultraNormalizeArabic(manifestEntry.name);

  // جمع كل النسخ المطابقة لهذا الاسم في الماستر وفي المفاتيح القديمة (مع عدم خلط دينا اسحق غنامي مع ديانا اسحق غنامي!)
  const allMatches = [...currentMasterRecords, ...legacyPoolRecords].filter(r => {
    if (!r || (!r.name && !r.fullName)) return false;
    return ultraNormalizeArabic(r.name || r.fullName) === targetNormName;
  });

  // استخلاص أفضل وأكمل قيمة لكل حقل من جميع النسخ المطابقة لضمان عدم ضياع أي بيان أو صورة
  const pickBestField = (...fieldNames) => {
    for (const rec of allMatches) {
      for (const f of fieldNames) {
        const val = rec?.[f];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val) !== 'undefined') {
          return val;
        }
      }
    }
    return '';
  };

  // فحص واسترجاع الصورة الصحيحة الخاصة بهذا العضو فقط (دون تكرار صورة شخص آخر)
  let verifiedPhoto = '';
  for (const rec of allMatches) {
    const candidatePhoto = rec?.photoUrl || rec?.avatar || rec?.image || '';
    if (candidatePhoto && String(candidatePhoto).trim().length > 10) {
      // التأكد أن الصورة لم يتم إعطاؤها بالخطأ لعضو سابق مختلف في الاسم
      const photoHash = String(candidatePhoto).slice(-120) + '_' + String(candidatePhoto).length;
      if (!usedPhotosSet.has(photoHash)) {
        verifiedPhoto = candidatePhoto;
        usedPhotosSet.add(photoHash);
        break;
      }
    }
  }

  // جمع ودمج كافة أختام وتواريخ وسجلات الحضور من كل النسخ
  const mergedStamps = Array.from(new Set(allMatches.flatMap(r => Array.isArray(r?.stamps) ? r.stamps : [])));
  const mergedAttendanceDates = Array.from(new Set(allMatches.flatMap(r => Array.isArray(r?.attendanceDates) ? r.attendanceDates : [])));
  const mergedAttendanceHistory = allMatches.flatMap(r => Array.isArray(r?.attendanceHistory) ? r.attendanceHistory : []);

  const canonicalId = String(pickBestField('originalId', 'id') || `3FY-M-${manifestEntry.num}`).replace(/-ROW-\d+$/i, '');
  const canonicalQr = String(pickBestField('qrCode') || `3FY-QR-${canonicalId}`);
  const isOwner = Boolean(manifestEntry.isOwner || targetNormName.includes('ميخائيل ادور راتب'));
  const genderAr = manifestEntry.gender === 'female' ? 'أنثى' : 'ذكر';

  // الاحتفاظ بأي حقول إضافية كانت مسجلة للعضو
  const baseRecord = allMatches[0] || {};

  return {
    ...baseRecord,
    id: canonicalId,
    originalId: canonicalId,
    qrCode: canonicalQr,
    name: manifestEntry.name,
    fullName: manifestEntry.name,
    gender: genderAr,
    genderCode: manifestEntry.gender,
    manualGender: manifestEntry.gender,
    sex: genderAr,
    type: manifestEntry.gender === 'female' ? 'شابة' : 'شاب',
    category: manifestEntry.gender === 'female' ? 'شابات' : 'شباب',
    genderLocked: true,
    role: isOwner ? 'مسؤول المجتمع' : (pickBestField('role') || 'مخدوم'),
    isOwner: isOwner,
    permissions: isOwner ? ['ALL'] : (allMatches.find(r => Array.isArray(r?.permissions) && r.permissions.length > 0)?.permissions || []),
    phone: pickBestField('phone', 'mobile', 'phoneNumber'),
    whatsapp: pickBestField('whatsapp', 'whatsappNumber', 'phone'),
    phoneCountry: pickBestField('phoneCountry') || '+20',
    whatsappCountry: pickBestField('whatsappCountry') || '+20',
    password: pickBestField('password', 'pass', 'pin', 'userPassword'),
    recoveryCode: pickBestField('recoveryCode', 'securityCode', 'backupCode', 'secretCode', 'resetCode'),
    securityCode: pickBestField('securityCode', 'recoveryCode', 'backupCode', 'secretCode', 'resetCode'),
    address: pickBestField('address', 'location', 'residence'),
    notes: pickBestField('notes', 'bio', 'comment'),
    photoUrl: verifiedPhoto,
    avatar: verifiedPhoto,
    photoOwnerName: targetNormName,
    stamps: mergedStamps,
    attendanceDates: mergedAttendanceDates,
    attendanceHistory: mergedAttendanceHistory,
    status: 'active',
    isDeleted: false,
    updatedAt: Date.now()
  };
}

إضافة أي أعضاء جدد حقيقيين (رقم 97 فما فوق) سجلوا بعد القائمة:

أي عضو حقيقي موجود في CLEAN_MASTER_DB_V1 وليس ضمن القائمة السوداء للمحذوفين (PERMANENT_BLACKLIST) وليس من أشباح عضو مسجل #، يُحتفظ به أيضاً بكامل بياناته وصورته بدون تكرار.

Task 2: المسح النهائي والآمن للمفاتيح القديمة فقط بعد نجاح المراجعة الشاملة (Verified Safe Purge)
المطلوب بالتفصيل في الـ Worker و cloudSync.ts:

التحقق من اكتمال الفحص (verifyAuditSuccess):

بعد بناء مصفوفة الأعضاء المدققة (auditedMembers)، وتأمين نقل attendanceRecords, events, competitions, rolePermissions داخل كائن CLEAN_MASTER_DB_V1:

تحقق برمجياً من أن:

auditedMembers.length >= 96 (جميع الـ 96 عضواً المعتمدين موجودون بلا استثناء).

auditedMembers.some(m => m.isOwner && ultraNormalizeArabic(m.name).includes('ميخائيل ادور راتب')) === true.

تم حفظ الكائن المدقق بنجاح داخل المفتاح CLEAN_MASTER_DB_V1 في Cloudflare (await env.THREE_FETYA_KV.put('CLEAN_MASTER_DB_V1', JSON.stringify(masterState))).

مسح المفاتيح القديمة بعد نجاح الحفظ والفحص (Purge Legacy Keys):

بمجرد نجاح التحقق أعلاه، قم بحذف المفاتيح القديمة (app_state, members, threefetya_state, backup_members) من مخزن Cloudflare ومن localStorage القديم في المتصفح، مع وضع علامة legacyAuditAndPurgeCompleted: true داخل CLEAN_MASTER_DB_V1 حتى لا تتكرر هذه العملية مرة أخرى ويقرأ النظام دائماً من CLEAN_MASTER_DB_V1 مباشرة بسرعة فائقة!

Task 3: مزامنة وإثراء تلقائي من متصفح المسؤول إذا كان يحمل صوراً أو بيانات إضافية محلياً (Client-to-Master Photo & Data Shield)
المطلوب بالتفصيل في cloudSync.ts و App.tsx:

عند فتح الموقع على جهاز المسؤول (اللابتوب أو الهاتف أو AI Studio):

قبل تنظيف أي كاش محلي قديم في المتصفح، يفحص الكود ما إذا كان في localStorage المحلي أي عضو من الـ 96 عضواً يمتلك photoUrl أو phone أو password أو recoveryCode أو stamps غير موجودة بعد في نسخة السيرفر؛ فإذا وجدها، يدمجها فوراً ويرفعها إلى CLEAN_MASTER_DB_V1 في السيرفر قبل مسح المفاتيح المحلية القديمة!

هذا يضمن بنسبة 1000% أنه حتى لو كانت صورة عضو أو باسورده محفوظة في ذاكرة المتصفح فقط، فسيتم إنقاذها وتثبيتها في CLEAN_MASTER_DB_V1 قبل مسح الكاش القديم!

Task 4: ضمان التسجيل الجديد، وتسجيل الدخول، والمزامنة الشاملة (Unified All-Over Sync) عبر كل الأجهزة والمنصات
المطلوب بالتفصيل في Register.tsx, Login.tsx, App.tsx, و AttendanceDashboard.tsx:

أي شخص جديد يسجل مستقبلاً (عضو 97+):

يتم حفظ كافة بياناته (الاسم، الجنس المثبت، التلفون، الواتساب مع اختيار الدولة والعلم والتحقق من 9 أرقام للسودان +249 و10 أرقام لمصر +20، الباسورد، كود الأمان، العنوان، الصورة، والـ QR الفريد) مباشرة في CLEAN_MASTER_DB_V1.   
opposite gender permission and whatsapp country validation.md

يظهر فوراً في الداشبورد وقاعدة البيانات ومعرض الهويات على جميع الأجهزة (AI Studio, Custom Domain على iPhone, Android, Desktop, و Web Apps) في نفس اللحظة بدون أي لاق أو أخطاء.

منع تكرار الأسماء نهائياً:

إذا حاول عضو مسجل مسبقاً التسجيل مرة أخرى في "تسجيل عضوية جديدة"، يمنعه النظام من عمل بطاقة ثانية ويحوله فوراً لتسجيل الدخول بحسابه الموجود.

تسجيل الدخول السريع (< 0.3s) بدون خطأ "الاسم غير موجود":

يعمل على جميع هواتف الأندرويد والآيفون والكمبيوتر وAI Studio بمطابقة ذكية للاسم أو الهاتف مع التحقق من الباسورد أو كود الأمان.

استقرار كافة الوظائف والفعاليات وسجل الحضور والغياب:

جميع الفعاليات، المسابقات، صلاحيات الرتب، والماسح الضوئي وسجل الحضور والغياب تقرأ وتكتب في CLEAN_MASTER_DB_V1 بتزامن لحظي شامل (Unified All-Over Sync).

Task 5: الحفاظ الكامل على سيادة ميخائيل ادور راتب والفلاتر والصلاحيات المعتمدة
المطلوب بالتفصيل:

حصر (صلاحيات الرتب، إعادة تعيين QR Code، تبديل الجنس السريع، التحديد المتعدد والحذف الفوري، ومسح الصورة الخاطئة) لـ ميخائيل ادور راتب (مسؤول المجتمع) فقط، مع عدم إظهار عبارة محمي بالكامل أو أيقونة القفل على بطاقته.

بقاء الفلاتر المختصرة في أعلى الداشبورد: الكل (العدد) | شباب (العدد) | شابات (العدد) مطابقة للعدد في القائمة الجانبية 100%.

بقاء صلاحية سجل المخدومين (نفس الجنس فقط) وصلاحية سجل المخدومين الآخر (الجنس الآخر كاملاً مع أرقام التلفونات والواتساب).
   
opposite gender permission and whatsapp country validation.md
+ 1

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:

ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.

لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.

تأكد 100% من تنفيذ دالة deepAuditAndMergeMember لفحص واستكمال كل اسم من الـ 96 اسماً ببياناته وصورته وباسورده وكود أمانه وأختامه قبل حذف أي مفتاح قديم في الـ Worker أو المتصفح.
</output_rules>