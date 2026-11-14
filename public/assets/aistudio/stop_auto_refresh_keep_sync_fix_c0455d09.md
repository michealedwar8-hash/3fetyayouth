# دفعة المهام الصارمة (100% Stop Automatic Page Refresh Loop Every 5 Seconds While Preserving Full Cloudflare Members Sync)

<project_context>
- **المشروع:** تطبيق ويب (`3fetyayouth.online`) مرتبط بـ `Cloudflare Database` (`threefetyayouth-api`).
- **الوضع الحالي الممتاز (يجب الحفاظ عليه 100%):**
  مشكلة اختفاء الأعضاء ومزامنة القائمة الكاملة من `Cloudflare Database` تم حلها بنجاح تام 100%، وجميع الأعضاء يظهرون الآن بشكل سليم. **يُمنع منعاً باتاً المساس بمنطق جلب وعرض الأعضاء (`lossLessMembers` و `cloudSync`) الذي حل هذه المشكلة!**
- **المشكلة الوحيدة المطلوب حلها الآن:**
  على الدومين الرسمي (`3fetyayouth.online`)، تقوم الصفحة بعمل **إعادة تحميل كاملة تلقائياً (`Full Page Refresh / Reload`) كل 5 ثوانٍ من تلقاء نفسها!**
- **السبب التقني الجذري:**
  1. وجود استدعاء لدالة `window.location.reload()` (أو `location.href = ...`) داخل حلقة الـ `setInterval` الخاصة بالمزامنة، أو داخل كود فحص إصدار الكاش (`FORCE_CLOUDFLARE_SYNC_RESET`) حيث لا يتم حفظ علامة الإصدار بشكل ثابت أو يتم مسح `localStorage.clear()` بالكامل فيمسح علامة الإصدار نفسها ويعيد عمل Reload في حلقة لا نهائية!
  2. أو وجود مستمع `navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())` مع كود يقوم بإلغاء تسجيل أو تحديث الـ Service Worker بشكل متكرر كل بضع ثوانٍ.
  3. أو أن دالة المزامنة كل 5 ثوانٍ تقوم بتوليد `id` عشوائي جديد في كل دورة (`Date.now()`) وتعيد ضبط حالة التطبيق بالكامل (`isLoading = true` أو إعادة رندرة شجرة المكونات من الصفر).
</project_context>

---

<tasks>
نفذ المهام الـ 3 التالية بدقة صارمة وجذرية، وافصل بين حل كل مهمة بعنوان واضح (`## Task 1`, `## Task 2`, `## Task 3`):

### Task 1: إزالة أي `window.location.reload()` تلقائي من كود المزامنة والـ Service Worker و `index.html`
- **المطلوب بالتفصيل في `index.html`, `sw.js`, `App.tsx`, و `cloudSync.ts`:**
  1. ابحث في جميع ملفات المشروع عن أي استخدام لـ `window.location.reload()` أو `location.reload()` أو `window.location.href`.
  2. **احذف فوراً أي `reload()` يتم استدعاؤه تلقائياً** داخل:
     - مستمعات الـ Service Worker (`controllerchange`, `updatefound`, `unregister`).
     - دوال المزامنة الدورية (`setInterval` / `pollCloudflare`).
     - كود التحقق من الإصدار (`FORCE_CLOUDFLARE_SYNC_RESET`).
  3. **إصلاح فخ `localStorage.clear()`:**
     - إذا كان الكود يمسح الكاش المحلي، **لا تستخدم `localStorage.clear()` داخل دورة متكررة** ولا تمسح مفتاح التحقق ولا جلسة المستخدم الحالي (`currentUser`)؛ بل اكتفِ بتحديث الـ React State (`setMembers`) بهدوء في الخلفية دون إعادة تحميل الصفحة إطلاقاً!

---

### Task 2: تثبيت المزامنة الصامتة في الخلفية (Silent Background State Sync Without UI Flicker or Remount)
- **المطلوب بالتفصيل في `cloudSync.ts` و `App.tsx`:**
  1. **منع تفعيل شاشة التحميل أثناء المزامنة الدورية:**
     - حالة التحميل (`isLoading / isInitialLoading`) تعمل **مرة واحدة فقط** عند فتح الموقع لأول مرة، ولا يجوز أبداً تفعيل `setIsLoading(true)` أثناء المزامنة الدورية كل بضع ثوانٍ حتى لا تختفي الصفحة وتومض أمام المستخدم.
  2. **توليد معرّف ثابت وحتمي للسجلات (`Deterministic Fallback ID`):**
     - في دالة `lossLessMembers` التي تحافظ على 100% من الأعضاء، إذا كان هناك عضو ينقصه `id` أو مكرر الـ `id`، لا تولد له معرّفاً يتغير كل 5 ثوانٍ بـ `Date.now()` أو `Math.random()` (لأن تغير الـ `id` كل 5 ثوانٍ يجعل React يهدم ويعيد بناء الجدول بالكامل!).
     - بدلاً من ذلك، ولّد له معرّفاً ثابتاً مبنياً على اسمه وترتيبه:
       ```javascript
       if (!safeId || seenIds.has(safeId)) {
         const cleanNameSlug = String(member.name || '').trim().replace(/\s+/g, '_');
         safeId = `CF-STATIC-${index}-${cleanNameSlug}`;
       }
       ```
  3. **التحديث الذكي عند وجود تغيير فعلي فقط (`Shallow/JSON Diff Check`):**
     - عندما تجلب دالة المزامنة الدورية البيانات كل 4-5 ثوانٍ من `Cloudflare Database`، قارن البيانات القادمة مع الحالة الحالية؛ وإذا لم يتغير شيء، لا تقم بإعادة رندرة غير ضرورية، وإذا وجد تغيير، حدّث الـ State في الخلفية بسلاسة تامة بدون أي Refresh للصفحة.

---

### Task 3: الحفاظ التام 100% على منطق عرض جميع أعضاء Cloudflare وتسجيل الدخول
- **قاعدة صارمة:**
  - احتفظ بكافة التعديلات السابقة التي ضمنت ظهور جميع الأعضاء الـ 93+ من `Cloudflare Database` بدون أي نقصان، ومنطق تسجيل الدخول المرن بدون خطأ `"الاسم غير موجود"`.
</tasks>

---

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:
1. ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.
2. لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. تأكد من القضاء التام 100% على مشكلة الـ Refresh التلقائي كل 5 ثوانٍ مع بقاء المزامنة اللحظية صامتة وسلسة في الخلفية.
</output_rules>
