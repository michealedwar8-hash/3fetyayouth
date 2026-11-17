# الدفعة الهندسية القاطعة والنهائية: ترحيل الـ 95 عضواً المعتمدين بكامل بياناتهم (شاملة كلمة المرور وكود الأمان) إلى الملف الموحد (CLEAN_MASTER_DB_V1) + القضاء النهائي على تكرار البطاقات + منع إعادة تسجيل الاسم المسجل + مزامنة موحدة 100% عبر (AI Studio, Android, iOS, Desktop & Web App) بدون خطأ "الاسم غير موجود"

<critical_safety_and_security_constitution>
⚠️ **القواعد الدستورية الثابتة والمقدسة (تُطبق بصرامة 100% في هذا الكود وفي أي كود مستقبلي):**
1. **عدم حذف أي مفتاح أو ملف قديم في Cloudflare Database (`DO NOT DELETE OLD KEYS`):**
   - اترك جميع المفاتيح والجداول القديمة (`app_state`, `members`, إلخ) محفوظة كما هي في Cloudflare كمرجع أمان ولا تحذفها أبداً إلى أن يأمر `مسؤول المجتمع` بحذفها لاحقاً بعد التأكد التام.
2. **الترحيل الشامل لـ 100% من بيانات كل عضو (شاملة الباسورد وكود الأمان):**
   - عند بناء الملف الجديد `CLEAN_MASTER_DB_V1`، يجب سحب ونقل كافة البيانات المسجلة لكل عضو من الـ 95 عضواً:
     - **كلمة المرور (`password` / `pass` / `pin` / `secret`)**.
     - **كود الأمان / كود الاسترداد (`recoveryCode` / `securityCode` / `backupCode` / `resetCode`)**.
     - **رقم التلفون (`phone`) ورقم الواتساب (`whatsapp`) ورمز الدولة**.
     - **العنوان (`address` / `location`) والملاحظات (`notes` / `bio`) وكافة الحقول الشخصية**.
     - **الحضور والأختام (`stamps`, `attendanceDates`, `attendanceHistory`) بالكامل**.
     - **الصورة الشخصية (`photoUrl` / `avatar`) مع منع تصادم الصور بين شخصين مختلفين**.
     - **الرتبة (`role`) والصلاحيات (`permissions`) والمعرّف (`id`) والـ (`qrCode`) الثابت**.
3. **قاعدة البطاقة الواحدة الفريدة (`100% Zero Duplicate Cards in DB & Dashboard`):**
   - يُمنع منعاً باتاً وجود بطاقتين أو سجلين لنفس الشخص في قاعدة البيانات أو في الداشبورد!
   - كل اسم (بعد التطبيع العربي الذكي `ultraNormalizeArabic`) له **سجل واحد فقط وبطاقة واحدة فقط** في `CLEAN_MASTER_DB_V1` وفي جميع الداشبوردات (`المخدومين والرتب`، `قاعدة البيانات`، `معرض الهويات وأختام الحضور`). إذا وُجدت عدة نسخ قديمة لنفس الاسم، تُدمج جميع بياناتها وأختامها وباسوردها وكود أمانها في **بطاقة واحدة فقط**!
4. **قاعدة الأمان الصارمة لمنع إعادة التسجيل (`Block Duplicate Registration -> Redirect to Login`):**
   - إذا حاول أي شخص موجود اسمه بالفعل في قاعدة البيانات والداشبورد أن يسجل من جديد عبر شاشة **"تسجيل عضوية جديدة"**:
     - **يُمنع منعاً باتاً إنشاء بطاقة ثانية له!**
     - يظهر له تنبيه واضح وأنيق: **"هذا الاسم مسجل بالفعل في النظام! يرجى تسجيل الدخول إلى حسابك"** ويتم تحويله تلقائياً إلى شاشة **تسجيل الدخول** مع وضع اسمه جاهزاً في خانة الدخول!
5. **المزامنة السحابية الموحدة الشاملة (`Unified Cloudflare Sync Across AI Studio, Custom Domain, Android, iOS & PWA`):**
   - جميع البيئات (`Google AI Studio`, الدومين الرسمي `3fetyayouth.online` على الكمبيوتر، متصفحات `Android` و `iOS Safari/Chrome`، وتطبيق الـ `PWA / Web App`) تقرأ وتكتب في نفس المفتاح الموحد `CLEAN_MASTER_DB_V1` عبر نفس رابط الـ Cloudflare Worker الفعلي، ويتم القضاء نهائياً وإلى الأبد على خطأ `"الاسم غير موجود"`!
6. **السيادة المطلقة لـ `ميخائيل ادور راتب` (العضو رقم 56):**
   - هو `مسؤول المجتمع` (`Community Owner`) الوحيد بكامل الصلاحيات السيادية المطلقة (`isOwner: true`, `role: 'مسؤول المجتمع'`), وتنحصر فيه وحده أدوات الإدارة السيادية (صلاحيات الرتب، إعادة تعيين QR، تبديل الجنس السريع، الحذف الفوري/المتعدد، مسح الصورة)، مع عدم إظهار عبارة `محمي بالكامل` أو أيقونة القفل على بطاقته.
</critical_safety_and_security_constitution>

---

<verified_95_members_manifest>
هذه هي القائمة الرسمية المعتمدة للـ 95 عضواً مع الجنس الدقيق لكل اسم (`male` = 33 شاباً، `female` = 62 شابة):

```javascript
export const VERIFIED_95_MANIFEST = [
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
  { num: 95, name: 'ايناس حنا خليل', gender: 'female' }
];

</verified_95_members_manifest>

Task 1: بناء محرك الترحيل الشامل (buildCleanMasterDatabaseV1) ونقل كافة البيانات (شاملة الباسورد وكود الأمان) مع منع التكرار نهائياً
المطلوب بالتفصيل في ملف الـ Worker (worker.js / worker.ts) وملف cloudSync.ts:

دالة التطبيع الذكي للمطابقة ومنع التكرار (ultraNormalizeArabic):

export function ultraNormalizeArabic(str: any): string {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئء]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ڤ/g, 'ف')
    .replace(/عبد\s+/g, 'عبد')
    .replace(/\s+/g, ' ')
    .trim();
}

قراءة كافة المفاتيح القديمة دون حذفها (Read-Only Legacy Harvest):

اجمع كافة سجلات الأعضاء القديمة من المفاتيح القديمة (app_state, members, إلخ في السيرفر، ومن SAFE_BACKUP_MEMBERS و members في المتصفح) دون حذف أي مفتاح قديم.

دمج ونقل 100% من معلومات كل عضو من الـ 95 عضواً في سجل واحد فريد فقط (Single Card Per Person):

لكل عضو في VERIFIED_95_MANIFEST:

ابحث في كافة السجلات القديمة عن أي سجل يطابق اسمه عبر ultraNormalizeArabic.

إذا وُجد أكثر من سجل قديم لنفس الشخص (النسخ المتدبلة السابقة)، ادمجها جميعاً في كائن واحد فريد فقط بحيث تأخذ:

كلمة المرور (password): انقل password || pass || pin || userPassword المحفوظة له (بدون ضياع حرف واحد!).

كود الأمان / الاسترداد (recoveryCode): انقل recoveryCode || securityCode || backupCode || secretCode || resetCode المحفوظ له (وإذا كان له كود أمان في أي حقل مشابه، انسخه في كل من recoveryCode و securityCode معاً لضمان عمله في كل الشاشات!).

التلفون والواتساب: phone, whatsapp, phoneCountry, whatsappCountry.

العنوان والملاحظات وكافة التفاصيل: address, location, notes, bio, university, college, graduationYear, birthDate, confessionFather, talents, hobbies.

الحضور والأختام (stamps, attendanceDates, attendanceHistory): اجمع كل تواريخ حضوره وأختامه من جميع نسخه القديمة ومن سجل الماسح الضوئي بدون ضياع أي ختم!

الصورة الشخصية (photoUrl, avatar): انقل صورته المحفوظة بشرط التأكد من عدم تكرار نفس الصورة لشخص آخر مختلف.

المعرّف والـ QR Code: احتفظ بمعرّفه الأصلي النظيف (بعد إزالة أي لاحقة -ROW- سببت التدبيل سابقاً) وبـ qrCode الخاص به.

الجنس والرتبة:

الجنس يُضبط بدقة من VERIFIED_95_MANIFEST ('أنثى' لـ female و 'ذكر' لـ male مع manualGender: item.gender, genderLocked: true).

لـ ميخائيل ادور راتب (رقم 56): اضبط رتبته إجبارياً على مسؤول المجتمع مع isOwner: true وكامل الصلاحيات السيادية.

لباقي الأعضاء: انقل رتبتهم وصلاحياتهم المحفوظة (role, permissions).

ضمان عدم التكرار المطلق (Strict Unique Name & ID Map):

داخل CLEAN_MASTER_DB_V1، المفتاح الفريد لكل عضو هو ultraNormalizeArabic(member.name).

يستحيل برمجياً أن يحتوي CLEAN_MASTER_DB_V1 أو مصفوفة members في المتصفح على بطاقتين لنفس الاسم! كل شخص له بطاقة واحدة فقط في الداشبورد وفي معرض الهويات وفي قاعدة البيانات.

Task 2: تطبيق قاعدة الأمان الصارمة: منع إعادة تسجيل الاسم الموجود وتحويله لتسجيل الدخول + قبول الأعضاء الجدد (96+) فوراً
المطلوب بالتفصيل في Register.tsx, Login.tsx, App.tsx, والـ Worker:

فحص الاسم عند التسجيل في Register.tsx وفي الـ Worker (POST /api/register):

عندما يحاول مستخدم التسجيل في شاشة "تسجيل عضوية جديدة":

طبّع الاسم الذي كتبه عبر ultraNormalizeArabic(inputName).

ابحث في قائمة الأعضاء الحالية (members القادمة من CLEAN_MASTER_DB_V1):

الحالة أ (الاسم موجود بالفعل ضمن الـ 95 عضواً أو مسجل مسبقاً في قاعدة البيانات):

امنع إنشاء حساب مكرر أو بطاقة ثانية له قطعياً!

اعرض له رسالة تنبيه واضحة ومباشرة:
"هذا الاسم مسجل بالفعل في قاعدة البيانات! لا يمكن التسجيل مرتين، يرجى تسجيل الدخول بحسابك."

ووفّر زراً فورياً (أو حوّله تلقائياً) إلى شاشة تسجيل الدخول (Login) مع ملء اسمه تلقائياً في حقل تسجيل الدخول ليُدخل كلمة المرور (أو يستخدم كود الأمان عند نسيانها) ويدخل لبطاقته الموجودة!

الحالة ب (شخص جديد تماماً ليس مسجلاً في النظام - عضو رقم 96 فما فوق):

يُقبل تسجيله فوراً وبسرعة البرق (< 0.5 ثانية) بدون أي أخطاء، ويُحفظ له اسمه، جنسه، رقم تلفونه، رقم واتسابه، كلمة المرور (password)، وكود الأمان (recoveryCode / securityCode)، وبطاقته في CLEAN_MASTER_DB_V1، وتفتح له صفحته وبطاقته فوراً على أي جهاز (Android, iPhone, Laptop, AI Studio)!

Task 3: القضاء الأبدي على خطأ ("الاسم غير موجود") في تسجيل الدخول واسترداد كلمة المرور بكود الأمان على جميع الأجهزة
المطلوب بالتفصيل في Login.tsx, App.tsx, و cloudSync.ts:

مطابقة ذكية شاملة للاسم أو الهاتف (findExistingMemberSmart):

عند قيام أي عضو بتسجيل الدخول (من هاتف Android، أو iPhone، أو كمبيوتر، أو Web App، أو AI Studio):

إذا كانت ذاكرة المتصفح لا تزال تحمّل البيانات، يسحب الكود أولاً القائمة الموحدة من CLEAN_MASTER_DB_V1 (أو يقرأ من SAFE_BACKUP_MEMBERS المحملة من CLEAN_MASTER_DB_V1، أو يطابق مع VERIFIED_95_MANIFEST).

يبحث عن العضو عبر ultraNormalizeArabic (بحيث يتجاهل فروق الهمزات أ/إ/آ/ا، التاء المربوطة ة/ه، الياء ى/ي، حرف ڤ/ف، والمسافات المزدوجة) أو عبر رقم التلفون/الواتساب.

يتحقق من كلمة المرور (password) المحفوظة للعضو (وإذا نسي كلمة المرور، يتحقق من كود الأمان recoveryCode || securityCode المحفوظ له ويسمح له بالدخول أو تعيين كلمة مرور جديدة وحفظها في CLEAN_MASTER_DB_V1).

ممنوع نهائياً ظهور خطأ "الاسم غير موجود في النظام" لأي عضو من الـ 95 عضواً أو أي عضو يسجل جديداً!

Task 4: المزامنة السحابية الموحدة 100% (Unified Cloudflare Sync) بين AI Studio والدومين الرسمي (Android / iOS / Web App)
المطلوب بالتفصيل في cloudSync.ts, App.tsx, وملف الـ Worker:

توحيد نقطة الاتصال والمفتاح السحابي (CLEAN_MASTER_DB_V1):

تأكد من استخدام نفس رابط الـ Cloudflare Worker الفعلي الشغال في المشروع في جميع البيئات (AI Studio, 3fetyayouth.online على الموبايل والكمبيوتر).

أضف في جميع طلبات الجلب cache: 'no-store' ورؤوس منع الكاش حتى لا يقرأ هاتف Android أو iPhone نسخة قديمة أبداً.

إثراء تلقائي لبيانات الـ 95 عضواً عند أول فتح (Auto-Enrich Master DB):

عند فتح الموقع على اللابتوب أو الهاتف أو AI Studio، إذا وجد المتصفح في ذاكرته المحلية (localStorage) بيانات إضافية لأي من الـ 95 عضواً (مثل password, recoveryCode, phone, whatsapp, photoUrl, stamps, address, notes) لم تكن قد اكتملت في السيرفر بعد، يقوم فوراً بدمج هذه الحقول داخل سجل العضو الوحيد في CLEAN_MASTER_DB_V1 ورفعها للسيرفر مرة واحدة، لتتطابق البيانات بنسبة 100% على كل الأجهزة!

قفل منع اللاق والرعشة (10-Second Mutation Freeze & Deep Equality Check):

حافظ على تجميد الـ Polling لمدة 10 ثوانٍ (lockPollingForMutation) عند قيام مسؤول المجتمع بأي إجراء (تعديل رتبة/صلاحية، تبديل جنس، حذف، مسح صورة)، ولا تقم بتحديث الـ State أثناء الـ Polling إلا إذا حدث تغيير فعلي في البيانات.

Task 5: منع تكرار البطاقات في جميع شاشات العرض (MembersDashboard, DatabaseDashboard, IdBadgesGallery)
المطلوب بالتفصيل:

قبل عرض مصفوفة members في أي داشبورد أو في معرض الهويات:

مررها على دالة ensureUniqueSingleCardPerMember(members) التي تضمن بالاسم المطبّع ultraNormalizeArabic(m.name) عدم ظهور أي عضو مرتين إطلاقاً.

في القائمة الجانبية (Sidebar) وفي أعلى فلاتر داشبورد المخدومين والرتب:

يظهر العدد الصافي الدقيق بدون أي تكرار:

الكل (95)

شباب (33)

شابات (62)
(ويتحدث العدد تلقائياً إذا سجل عضو جديد رقم 96+ أو إذا حذف مسؤول المجتمع عضواً).

Task 6: الحفاظ الكامل على كافة الميزات المعتمدة بدون أي نقص
المطلوب بالتفصيل:

بقاء الأدوات السيادية الحصرية لـ ميخائيل ادور راتب (مسؤول المجتمع) فقط:

صلاحيات الرتب، إعادة تعيين QR Code، تبديل الجنس السريع (ذكر ⇄ أنثى)، التحديد المتعدد والحذف الفوري النهائي، ومسح الصورة الخاطئة، مع إخفاء عبارة محمي بالكامل وأيقونة القفل من بطاقته.

بقاء صلاحية سجل المخدومين (نفس الجنس) و سجل المخدومين الآخر (الجنس الآخر مع أرقام التلفونات والواتساب).   
opposite gender permission and whatsapp country validation.md

بقاء اختيار الدولة مع العلم فوق رقم الواتساب والتلفون (🇸🇩 السودان +249 = 9 أرقام، و 🇪🇬 مصر +20 = 10 أرقام) مع رسائل خطأ : الرقم زايد و خطأ : الرقم ناقص.   
opposite gender permission and whatsapp country validation.md

بقاء ظهور الحاضرين في داشبورد سجل الحضور والغياب من أختام الأعضاء وسجلات المسح بنفس التوقيت والترتيب.

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:

ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.

لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.

تأكد 100% من نقل (الباسورد password وكود الأمان recoveryCode وكافة البيانات والأختام والصور) للـ 95 عضواً إلى CLEAN_MASTER_DB_V1 دون حذف المفاتيح القديمة، ومنع تكرار أي اسم في الداشبورد، ومنع إعادة تسجيل الاسم الموجود وتحويله لتسجيل الدخول.
</output_rules>