# الدفعة الهندسية الحاسمة (100% Ultra-Fast Instant Login & Registration in <0.5s + Instant Permanent Member Deletion + Eradicate "الاسم غير موجود" Error + Smart Tombstone-Aware Never-Shrink State)

<permanent_architectural_constitution>
⚠️ **القواعد الدستورية الثابتة (يجب الالتزام بها حرفياً 100%):**
1. **قاعدة `Smart Tombstone-Aware Never-Shrink State`:**
   - نحافظ 100% على جميع الأعضاء الفعليين (الـ 94+ عضواً: الشباب والشابات وكل من يسجل جديداً) ونمنع تقلص القائمة بسبب أخطاء الشبكة أو فلاتر العرض.
   - **الاستثناء الوحيد المسموح به لإنقاص العدد هو (الحذف الصريح / إلغاء العضوية بواسطة الإدارة):** عندما يقوم المسؤول بإلغاء عضوية شخص، يُوضع الـ `id` الخاص به في `deletedTombstones`، وتلتزم دالة `Never-Shrink` بعدم إعادته أبداً!
2. **قاعدة السرعة الفائقة (`Zero-Blocking Instant UI` - أقل من 0.5 ثانية):**
   - يُمنع منعاً باتاً إرسال مصفوفة الـ 94+ عضواً بالكامل مع صورهم (`Base64`) عند تسجيل عضو واحد أو حذف عضو واحد أو تسجيل الدخول!
   - يُمنع استخدام أي طابور معطل (`writeQueue` يعلق الطلبات) أو انتظار طلبات شبكة طويلة قبل فتح بطاقة العضو أو تسجيل دخوله أو حذفه.
3. **قاعدة `Zero State Mutation by Filters`:**
   - فلاتر الجنس (`سجل المخدومين` و `سجل المخدومين الآخر`[cite: 1]) للعرض فقط عبر `useMemo`.
</permanent_architectural_constitution>

---

<project_context>
- **المشروع:** تطبيق ويب (`3fetyayouth.online`) مرتبط بـ `Cloudflare Database` (`threefetyayouth-api`)[cite: 1].
- **المشكلات الـ 4 الطارئة التي يجب حلها جذرياً وبسرعة البرق (100%):**
  1. **بطء شديد جداً في تسجيل الدخول (Login):** يستغرق وقتاً طويلاً جداً لأنه ينتظر سحب قاعدة البيانات بالكامل مع الصور قبل فحص الاسم.
  2. **بطء شديد جداً في تسجيل العضوية (Register) وإصدار البطاقة:** يستغرق دقائق لأن المتصفح يحاول رفع مصفوفة الأعضاء كاملة أو ينتظر طابور السيرفر الثقيل قبل إظهار بطاقة العضوية.
  3. **ظهور خطأ `"الاسم غير موجود في النظام"` عند تسجيل الدخول من الهاتف (أندرويد/آيفون) أو الكمبيوتر على الدومين الرسمي رغم وجود الاسم في الداشبورد وCloudflare!**
  4. **تعليق "إلغاء العضوية / حذف عضو" لأكثر من 5 دقائق وعدم انحذاف الاسم:** لأن دالة `Never-Shrink State` كانت تعيد دمج العضو المحذوف من الذاكرة المحلية (`prevMembers` / `SAFE_BACKUP_MEMBERS`) ولأن طلب الحذف كان يرسل البيانات كلها بدلاً من أمر حذف خفيف ومباشر!
</project_context>

---

<tasks>
نفذ المهام الـ 5 التالية بدقة برمجية قاطعة، وافصل بين حل كل مهمة بعنوان واضح (`## Task 1`, `## Task 2`...):

### Task 1: القضاء النهائي على خطأ ("الاسم غير موجود في النظام") وجعل تسجيل الدخول فورياً في 0.1 ثانية (`Instant Smart Login`)
- **التشخيص الدقيق:** لماذا يظهر `"الاسم غير موجود"` رغم أن الاسم موجود في الداشبورد وCloudflare؟
  1. لأن دالة الدخول تقارن النص بحرفية صارمة أو تفشل بسبب المسافات/الهمزات/الأرقام العربية أو تبحث في `m.name` فقط وتنسى `m.fullName`، أو لأنها تنتظر طلب شبكة بطيء يقطع بـ Timeout قبل أن يبحث!
- **الحل الهندسي القاطع في `Login.tsx` و `App.tsx` و `cloudSync.ts`:**
  1. **دالة التطبيع الذكي الشامل للعربية والأرقام (`ultraNormalizeArabic`):**
     ```javascript
     export function ultraNormalizeArabic(str: any): string {
       if (!str) return '';
       return String(str)
         .trim()
         .toLowerCase()
         // تحويل الأرقام الهندية/العربية إلى إنجليزية
         .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
         // إزالة التشكيل والمد (التطويل)
         .replace(/[\u064B-\u065F\u0640]/g, '')
         // توحيد جميع أشكال الألف (أ، إ، آ، ا، ٱ)
         .replace(/[أإآٱ]/g, 'ا')
         // توحيد التاء المربوطة والهاء (ة -> ه)
         .replace(/ة/g, 'ه')
         // توحيد الياء والألف المقصورة (ى -> ي)
         .replace(/[ىئ]/g, 'ي')
         // توحيد الواو المهموزة (ؤ -> و)
         .replace(/ؤ/g, 'و')
         // توحيد الأسماء المركبة الشائعة (عبدالله -> عبد الله)
         .replace(/عبد\s+/g, 'عبد')
         // إزالة أي رموز غير الحروف والأرقام وتوحيد المسافات
         .replace(/\s+/g, ' ')
         .trim();
     }
     ```
  2. **البحث الفوري المزدوج (الذاكرة أولاً في 0.05 ثانية + السحابة السريعة عند الحاجة):**
     - عندما يضغط العضو على **"تسجيل الدخول"** (في أندرويد، آيفون، أو كمبيوتر):
       - **الخطوة 1 (فورية 0.05 ثانية):** اجمع الأعضاء الموجودين حالياً في `members` + المخزنين في `SAFE_BACKUP_MEMBERS` داخل `localStorage`.
       - ابحث عن العضو عبر دالة `findMemberFlexibly(query, allAvailableMembers)` التي تطابق أياً مما يلي:
         1. تطابق الاسم الكامل المطبّع (`ultraNormalizeArabic(m.name || m.fullName) === ultraNormalizeArabic(query)`).
         2. أو تطابق بدون مسافات نهائياً (`noSpaces(m.name) === noSpaces(query)`).
         3. أو إذا كتب العضو اسمه الثلاثي أو الثنائي (3 كلمات فأكثر أو كلمتين مميزتين) وكان اسمه في النظام رباعياً يبدأ بنفس الكلمات (`normalizedMemberName.startsWith(normalizedQuery)` أو يحتوي على جميع كلمات البحث بالترتيب!).
         4. أو تطابق آخر 9 أرقام من رقم الهاتف أو الواتساب (`cleanDigits(m.phone).slice(-9) === cleanDigits(query).slice(-9)`).
       - **إذا وُجد العضو في الذاكرة المحلية:** افتح له صفحته الشخصية **فوراً في نفس اللحظة (0.05 ثانية)** بدون انتظار أي تحميل من السيرفر! ثم حدّث بياناته في الخلفية بهدوء.
       - **الخطوة 2 (إذا كانت ذاكرة الهاتف فارغة عند أول فتح):** اسحب القائمة من السيرفر بـ Timeout سريع، وحدّث الذاكرة، وابحث بنفس الدالة المرنة `findMemberFlexibly` وافتح صفحته فوراً!
       - بهذا يستحيل 1000% أن يظهر خطأ `"الاسم غير موجود في النظام"` لأي عضو موجود في الداشبورد أو في Cloudflare!

---

### Task 2: جعل تسجيل العضوية وإصدار البطاقة يتم في أقل من ثانية واحدة (`Instant Optimistic Registration`)
- **لماذا كان تسجيل العضوية بطيئاً جداً؟**
  لأن المتصفح كان يضغط الصورة بحجم كبير أو يرسل مصفوفة الـ 94 عضواً بالكامل، وينتظر رد السيرفر الثقيل قبل أن يفتح البطاقة!
- **الحل الهندسي القاطع في `Register.tsx` و `cloudSync.ts` و الـ Worker:**
  1. **ضغط خفيف وفوري للصورة (`Fast Lightweight Thumbnail`):**
     - اضغط صورة العضو إلى أبعاد `180x180` وجودة `0.65` (حجمها لا يتعدى `8 KB` فقط بدلاً من ميجابايتات!) بحيث تكتمل في `0.05 ثانية`.
  2. **العرض الفوري للبطاقة (`Optimistic UI` - أقل من 0.3 ثانية):**
     - بمجرد ضغط العضو على زر **"إتمام التسجيل"** (بعد التحقق من صحة الحقول ورقم الهاتف/الواتساب):
       - أنشئ كائن `newMember` بمعرّفه الفريد و الـ QR Code الخاص به.
       - أضفه **فوراً في نفس اللحظة** إلى حالة التطبيق (`setMembers` و `setCurrentUser(newMember)`) واحفظه في `SAFE_BACKUP_MEMBERS`.
       - **اعرض بطاقة العضوية وصفحة العضو فوراً أمام المستخدم في أقل من نصف ثانية!**
       - في نفس اللحظة في الخلفية (وعبر `POST /api/register` يرسل كائن العضو الجديد فقط `8 KB` وليس قاعدة البيانات كلها!)، يتم حفظه في `Cloudflare Database` مع إعادة المحاولة التلقائية (`Auto-Retry`) في الخلفية إذا كانت شبكة الهاتف ضعيفة!

---

### Task 3: جعل "إلغاء العضوية / حذف عضو" يتم في أقل من ثانية واحدة وبشكل دائم لا يعود أبداً (`Instant Permanent Delete`)
- **لماذا كان الحذف يعلق لأكثر من 5 دقائق ولا ينحذف الاسم؟**
  1. لأن دالة `applyNeverShrinkMembersUpdate` كانت تعيد العضو المحذوف من `prevMembers` أو من `SAFE_BACKUP_MEMBERS` لأنها لم تكن تتحقق من قائمة المحذوفين (`deletedTombstones`)!
  2. ولأن طلب الحذف كان ينتظر إعادة رفع قاعدة البيانات كلها!
- **الحل الهندسي القاطع في `MembersDashboard.tsx` و `App.tsx` و `cloudSync.ts` و الـ Worker:**
  1. **سجل الحذف الصريح الفوري (`DELETED_TOMBSTONES_SET`):**
     - احتفظ في `localStorage` وفي الـ Worker بقائمة معرّفات وأسماء الأعضاء الذين تم إلغاء عضويتهم رسمياً بواسطة الإدارة: `CONFIRMED_DELETED_IDS`.
  2. **تنفيذ الحذف في 0.1 ثانية (`Optimistic Instant Delete`):**
     - بمجرد ضغط المسؤول على **"إلغاء العضوية / حذف"** وتأكيد الحذف:
       - **فوراً (في 0.1 ثانية بدون انتظار السيرفر):**
         1. أضف `member.id` و `member.originalId` إلى `CONFIRMED_DELETED_IDS` في `localStorage`.
         2. احذف العضو فوراً من `members` في الـ State (`setMembers(prev => prev.filter(m => m.id !== targetId && m.originalId !== targetId))`) ليختفي من الجدول أمامك في **نفس الجزء من الثانية**!
         3. احذفه فوراً من `SAFE_BACKUP_MEMBERS` في `localStorage` حتى لا يعود عند عمل Refresh.
         4. أرسل في الخلفية طلباً خفيفاً ومباشراً للسيرفر (`DELETE /api/member/${encodeURIComponent(targetId)}` أو `POST /api/delete-member` يحتوي فقط على `{ id: targetId, name: member.name }`) ليحذفه الـ Worker فوراً من مخزن Cloudflare ويضيفه إلى `serverTombstones` في أجزاء من الثانية!
  3. **تحديث دالة `applyNeverShrinkMembersUpdate` لتحترم الحذف الصريح 100%:**
     ```javascript
     function getConfirmedDeletedIds(): Set<string> {
       try {
         const raw = JSON.parse(localStorage.getItem('CONFIRMED_DELETED_IDS') || '[]');
         return new Set(Array.isArray(raw) ? raw.map(String) : []);
       } catch {
         return new Set();
       }
     }

     function applyNeverShrinkMembersUpdate(prevMembers, incomingMembers, serverTombstones = []) {
       const deletedSet = getConfirmedDeletedIds();
       if (Array.isArray(serverTombstones)) {
         serverTombstones.forEach(id => deletedSet.add(String(id)));
       }

       // إذا لم تأتِ بيانات صالحة من السيرفر، احتفظ بالقائمة الحالية (مع استبعاد أي عضو تم حذفه رسمياً)
       if (!incomingMembers || !Array.isArray(incomingMembers) || incomingMembers.length === 0) {
         return prevMembers.filter(m => !deletedSet.has(String(m.id)) && !deletedSet.has(String(m.originalId)));
       }

       // حماية الهاتف من السقوط إلى عضو واحد فقط (مسؤول المجتمع)
       if (prevMembers.length > 5 && incomingMembers.length <= 2) {
         return prevMembers.filter(m => !deletedSet.has(String(m.id)) && !deletedSet.has(String(m.originalId)));
       }

       const unionMap = new Map();
       prevMembers.forEach((m, idx) => {
         if (!m || (!m.id && !m.name)) return;
         if (deletedSet.has(String(m.id)) || deletedSet.has(String(m.originalId))) return; // لا تعيد المحذوف أبداً!
         unionMap.set(String(m.id || m.name).trim(), m);
       });

       incomingMembers.forEach((m, idx) => {
         if (!m || (!m.id && !m.name)) return;
         if (deletedSet.has(String(m.id)) || deletedSet.has(String(m.originalId))) return; // لا تقبل المحذوف أبداً!
         let key = String(m.id || `${m.name}-${idx}`).trim();
         const existing = unionMap.get(key);
         if (existing && ultraNormalizeArabic(existing.name) !== ultraNormalizeArabic(m.name)) {
           key = `${key}-ROW-${idx + 1}`;
         }
         unionMap.set(key, {
           ...(existing || {}),
           ...m,
           id: key,
           originalId: m.id || existing?.id,
           name: String(m.name || m.fullName || existing?.name || `عضو ${idx + 1}`).trim(),
           role: m.role || existing?.role || 'مخدوم',
           status: 'active',
           isDeleted: false
         });
       });

       const finalMembers = Array.from(unionMap.values());
       if (finalMembers.length > 5) {
         try { localStorage.setItem('SAFE_BACKUP_MEMBERS', JSON.stringify(finalMembers)); } catch (e) {}
       }
       return finalMembers;
     }
     ```
     - *(ملاحظة: إذا قام شخص كان محذوفاً في الماضي بتسجيل عضوية جديدة يدوياً من فورم التسجيل، يتم إزالة الـ ID الخاص به من `CONFIRMED_DELETED_IDS` ليُقبل تسجيله الجديد فوراً).*

---

### Task 4: تسريع الـ Cloudflare Worker وإلغاء أي تعليق أو `writeQueue` بطيء
- **المطلوب بالتفصيل في ملف الـ Worker (`worker.js` / `worker.ts`):**
  1. **إزالة أي حلقات قراءة بطيئة أو `writeQueue` متجمد:**
     - إذا حدث خطأ داخل `writeQueue` في الكود السابق، كان الـ Promise يرفض (`Rejected`) فيتوقف الطابور للأبد وتعلق كل طلبات الحذف والتسجيل لمدة 5 دقائق حتى تفصل بـ Timeout!
     - **الحل القاطع:** اجعل أي طابور في الـ Worker محمياً بـ `.catch(() => {})` حتى لا يتجمد أبداً:
       ```javascript
       writeQueue = writeQueue.then(async () => { ... }).catch(err => console.error(err));
       ```
  2. **نقطة نهاية سريعة ومباشرة لحذف العضو (`DELETE /api/member` أو `POST /api/member/delete`):**
     - تستقبل `{ targetId, targetName }`، وتحذفه فوراً من مصفوفة `members` في Cloudflare وتضيف `targetId` إلى `tombstones.members`، وترجع `{ success: true, deletedId: targetId }` في أقل من **50 مللي ثانية** (بدون إعادة إرسال مصفوفة الصور الضخمة كلها في رد الحذف!).

---

### Task 5: الحفاظ الكامل على الميزات المعتمدة
- **المطلوب بالتفصيل:**
  1. بقاء صلاحية `سجل المخدومين` (نفس الجنس) و `سجل المخدومين الآخر` (الجنس الآخر مع أرقام التلفونات والواتساب)[cite: 1] كفلتر عرض سريع بـ `useMemo`، ورؤية `مسؤول المجتمع` للكل افتراضياً[cite: 1].
  2. بقاء اختيار الدولة مع العلم فوق رقم الواتساب والتلفون (`🇸🇩 السودان +249` = 9 أرقام، و `🇪🇬 مصر +20` = 10 أرقام) مع رسائل `خطأ : الرقم زايد` و `خطأ : الرقم ناقص`[cite: 1].
  3. بقاء ظهور كافة الحاضرين في `داشبورد سجل الحضور والغياب` من أختام الأعضاء وسجلات المسح بنفس التوقيت والترتيب.
</tasks>

---

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:
1. ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.
2. لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. تأكد أن (تسجيل الدخول، تسجيل العضوية، وإلغاء العضوية/الحذف) تعمل جميعها في أقل من 0.5 ثانية (Optimistic Instant UI) مع الحفظ المؤكد في Cloudflare Database وبقاء `applyNeverShrinkMembersUpdate` محمية بـ `CONFIRMED_DELETED_IDS`.
</output_rules>