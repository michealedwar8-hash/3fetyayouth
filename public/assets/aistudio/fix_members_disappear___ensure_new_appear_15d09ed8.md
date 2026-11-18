# الدفعة الهندسية الحاسمة والنهائية (1000% Permanent Stabilization of New Members 97+ + Stop Auto-Logout Bug + Permanent Role & Permission Lock + Eliminate All UI/Sync Lag via Lightweight Delta Architecture)

<strict_root_cause_fixes>
⚠️ **الأسباب الـ 4 الحقيقية للمشاكل الحالية والتي يجب القضاء عليها برمجياً بنسبة 100% بدون أي استثناء:**
1. **سبب ظهور واختفاء الأعضاء الجدد (97+):**
   - جهاز آخر مفتوح يرسل قائمة قديمة (تحتوي على الـ 96 عضواً فقط) فيكتب فوق `CLEAN_MASTER_DB_V1` ويمسح العضو الجديد، أو أن كود `VERIFIED_96_MANIFEST` يعيد بناء القائمة من الـ 96 فقط!
   - **الحل القاطع:** إيقاف إعادة تشغيل `VERIFIED_96_MANIFEST` نهائياً، وإجبار الـ Worker والمتصفح على **الدمج التراكمي للأعضاء الجدد (`Additive Member Retention`)**: أي عضو مسجل في السيرفر أو المتصفح (وليس في `PERMANENT_BLACKLIST`) يظل محفوظاً للأبد ولا يمكن لأي جهاز متأخر أن يمسحه!
2. **سبب تسجيل الخروج المفاجئ تلقائياً للعضو الجديد بعد دخوله (`Auto-Logout Bug`):**
   - وجود `useEffect` في `App.tsx` يتحقق من وجود `currentUser` داخل `members`، وعندما تهتز القائمة أثناء المزامنة يطرد المستخدم عبر `setCurrentUser(null)` أو `logout()`!
   - **الحل القاطع:** **حذف وإلغاء أي كود يقوم بعمل `logout` أو `setCurrentUser(null)` تلقائياً!** لا يخرج المستخدم من حسابه إلا إذا ضغط بيده على زر **"تسجيل الخروج"** (أو إذا قام `مسؤول المجتمع` بحذفه صراحةً في `PERMANENT_BLACKLIST`). وإذا كان `currentUser` غير موجود في مصفوفة `members` القادمة، يتم إضافته فوراً إلى `members` ورفعه للسيرفر!
3. **سبب اختفاء الرتب والصلاحيات الممنوحة للعضو:**
   - دالة الدمج أو الترحيل كانت تعيد الكتابة فوق `role` و `permissions` بالقيمة الافتراضية `'مخدوم'` و `[]` عندما تأتي دورة Polling قديمة!
   - **الحل القاطع:** ختم كل تعديل رتبة أو صلاحية بـ `roleUpdatedAt: Date.now()` وحفظ خريطة مستقلة للرتب والصلاحيات (`memberRolesMap`) في `CLEAN_MASTER_DB_V1` وفي `localStorage`؛ وتلتزم دالة الدمج دائماً بأخذ الرتبة والصلاحيات صاحبة الـ `roleUpdatedAt` الأحدث، ويُمنع إرجاع أي صاحب رتبة إلى `'مخدوم'` تلقائياً!
4. **سبب بقاء اللاق وثقل الصفحات عند فتح الداشبورد أو عمل Actions:**
   - إرسال واستقبال وتحليل مصفوفة ضخمة تحتوي على 96+ صورة `Base64` (عدة ميجابايتات) مع كل ضغطة زر وكل دورة Polling، وإعادة رندرة كل البطاقات دفعة واحدة!
   - **الحل القاطع:** فصل الصور الثقيلة عن دورات الفحص الدورية، واستخدام `Delta Endpoints` ترسل فقط الكائن المعدل (`1 KB`) بدلاً من رفع قاعدة البيانات كلها في كل ضغطة زر!
</strict_root_cause_fixes>

---

<tasks>
نفذ المهام الـ 5 التالية بدقة جراحية قاطعة 100%، وافصل بين حل كل مهمة بعنوان واضح (`## Task 1`, `## Task 2`...):

### Task 1: منع تسجيل الخروج التلقائي نهائياً (`Eradicate Auto-Logout`) وتثبيت الأعضاء الجدد (97+) للأبد
- **المطلوب بالتفصيل في `App.tsx`, `Login.tsx`, `Register.tsx`, و `cloudSync.ts`:**
  1. **إلغاء أي طرد تلقائي لـ `currentUser` (`Absolute Session Persistence`):**
     - ابحث في `App.tsx` وجميع الملفات عن أي `useEffect` أو شرط يقوم بعمل `setCurrentUser(null)` أو `localStorage.removeItem('currentUser')` عندما لا يجد المستخدم في `members`، **واحذفه فوراً!**
     - استبدله بقاعدة الحماية العكسية (`Self-Healing Current User`):
       ```javascript
       useEffect(() => {
         if (!currentUser || !currentUser.name) return;
         const deletedIds = getPermanentDeletedIdsSet();
         const deletedNames = getPermanentDeletedNamesSet();
         const normCurrent = ultraNormalizeArabic(currentUser.name || currentUser.fullName);
         
         // فقط إذا قام مسؤول المجتمع بحذف هذا العضو صراحة في القائمة السوداء، يتم إخراجه:
         if (deletedIds.has(String(currentUser.id)) || deletedNames.has(normCurrent)) {
           setCurrentUser(null);
           localStorage.removeItem('currentUser');
           return;
         }

         // إذا كان العضو مسجلاً دخوله حالياً (عضو جديد مثلاً) ولم يظهر بعد في مصفوفة members، قم بتثبيته فوراً داخل members ولا تخرجه أبداً!
         setMembers(prev => {
           const exists = prev.some(m => ultraNormalizeArabic(m.name || m.fullName) === normCurrent);
           if (!exists) {
             const updated = [...prev, { ...currentUser, isPermanentMember: true, status: 'active' }];
             return updated;
           }
           // تحديث بيانات currentUser بأحدث رتبة وصلاحيات وأختام من القائمة دون إخراجه
           const matched = prev.find(m => ultraNormalizeArabic(m.name || m.fullName) === normCurrent);
           if (matched && (matched.role !== currentUser.role || JSON.stringify(matched.permissions) !== JSON.stringify(currentUser.permissions))) {
             const syncedUser = { ...currentUser, ...matched };
             setCurrentUser(syncedUser);
             try { localStorage.setItem('currentUser', JSON.stringify(syncedUser)); } catch {}
           }
           return prev;
         });
       }, [members, currentUser?.id]);
       ```
  2. **حماية الأعضاء الجدد في الدمج المحلي والسحابي (`Never Drop New Registered Members`):**
     - في دالة تحديث الأعضاء (`applySmartNeverShrinkState` في المتصفح، وداخل الـ Worker عند الحفظ):
       - **يُمنع منعاً باتاً** استبدال مصفوفة الأعضاء بمصفوفة تمسح الأعضاء الجدد!
       - بدلاً من استبدال `prevMembers` بـ `incomingMembers`، قم بدمجهما معاً حسب الاسم المطبّع (`ultraNormalizeArabic(name)`):
         - كل عضو موجود في `prevMembers` (بما في ذلك أي عضو سجل جديداً منذ ثانية!) وكل عضو موجود في `incomingMembers` (طالما ليس في `PERMANENT_BLACKLIST`) **يبقى محفوظاً 100% في النتيجة النهائية!**
         - بذلك لو سجل عضو جديد رقم 97 أو 98، يظهر فوراً في الداشبورد ويثبت إلى الأبد ولا يمكن لأي دورة Polling أن تخفيه ولا لثانية واحدة!

---

### Task 2: التثبيت الأبدي للرتب والصلاحيات الممنوحة (`Permanent Role & Permissions Lock`)
- **المطلوب بالتفصيل في `MembersDashboard.tsx`, `App.tsx`, `cloudSync.ts`, والـ Worker:**
  1. **إيقاف `VERIFIED_96_MANIFEST` عن إعادة تعيين الرتب أو العمل المتكرر:**
     - مصفوفة `VERIFIED_96_MANIFEST` تُستخدم فقط إذا كانت قاعدة البيانات فارغة تماماً عند التأسيس الأول، **ويُمنع منعاً باتاً** تشغيلها في كل دورة جلب حتى لا تعيد رتب الأعضاء إلى `'مخدوم'` أو تمسح الأعضاء الجدد!
  2. **بصمة الزمن لتعديل الرتب والصلاحيات (`roleUpdatedAt` & `LOCKED_ROLES_MAP`):**
     - عندما يقوم `مسؤول المجتمع` (`ميخائيل ادور راتب`) بتغيير رتبة أي عضو (`member.role`) أو منحه/سحب صلاحيات فردية (`member.permissions`) أو تعديل صلاحيات الرتب العامة (`rolePermissions`):
       1. استدعِ `lockPollingForMutation()` لتجميد الـ Polling لمدة **15 ثانية كاملة**.
       2. ضع داخل كائن العضو المعدل:
          ```javascript
          const now = Date.now();
          const updatedMember = {
            ...targetMember,
            role: newRole,
            permissions: newPermissions,
            roleLocked: true,
            roleUpdatedAt: now,
            lastModifiedAt: now
          };
          ```
       3. احفظ نسخة سريعة من تعديلات الرتب والصلاحيات في `localStorage` تحت مفتاح خفيف `LOCKED_MEMBER_ROLES_V1` (يربط `normalizedName -> { role, permissions, roleUpdatedAt }`).
       4. في أي دالة دمج (سواء في المتصفح أو داخل الـ Worker):
          - عند دمج نسختين لنفس العضو (`local` و `server`)، قارن `Number(m1.roleUpdatedAt || 0)` مع `Number(m2.roleUpdatedAt || 0)`؛ **واعتمد دائماً الرتبة والصلاحيات ذات الـ `roleUpdatedAt` الأحدث!**
          - وكذلك طبّق أي رتبة أو صلاحية أحدث محفوظة في `LOCKED_MEMBER_ROLES_V1`.
          - بهذا يستحيل 1000% أن تختفي رتبة أو صلاحية منحتها لأي عضو أو أن تعود للوضع القديم!

---

### Task 3: القضاء النهائي على لاق وثقل الصفحات والأزرار (`Zero-Payload-Bloat & Delta Sync Architecture`)
- **لماذا كانت الصفحات والأزرار لا تزال ثقيلة؟**
  لأن كل تعديل بسيط (إضافة عضو، تعديل رتبة، تسجيل حضور، إضافة فعالية) كان يقوم بإرسال كائن `CLEAN_MASTER_DB_V1` بالكامل (الذي يحتوي على 96+ صورة `Base64` حجمها عدة ميجابايتات!) عبر الإنترنت، كما أن المتصفح كان يعيد رندرة الصور الضخمة في كل حركة!
- **الحل الهندسي الجذري للسرعة الفائقة (`< 0.02 ثانية` لكل حركة) في الـ Worker و `cloudSync.ts` و `App.tsx`:**
  1. **إنشاء عمليات التحديث الجزئي الخفيفة (`Lightweight Atomic Delta Actions` - حجم الطلب `< 2 KB` بدلاً من `5 MB`!):**
     - في `cloudSync.ts` وفي الـ Worker، أضف دعم أوامر التحديث الجزئي السريعة في `POST`:
       - `action: 'UPSERT_SINGLE_MEMBER'`: يرسل فقط كائن العضو الواحد (الجديد أو المعدل في رتبته/صلاحياته/جنسه/حضوره) بحجم `1 KB`! ويقوم الـ Worker بدمج هذا العضو الواحد فقط داخل `CLEAN_MASTER_DB_V1` في `5ms` بدون أن يضطر المتصفح لرفع الـ 96 عضواً وصورهم!
       - `action: 'DELETE_MEMBERS'`: يرسل فقط مصفوفة الـ `ids` والأسماء المحذوفة (`< 0.5 KB`)، فيحذفهم الـ Worker فوراً من `CLEAN_MASTER_DB_V1`.
       - `action: 'UPDATE_EVENTS_OR_PERMISSIONS'`: يرسل فقط مصفوفة `events` أو `competitions` أو `rolePermissions` أو `attendanceRecords` المعدلة (`< 5 KB`) без إرسال مصفوفة الأعضاء وصورهم!
  2. **فحص التغيير الخفيف في الـ Polling (`Lightweight Hash Check Before Full Download`):**
     - أضف في الـ Worker دعم باراميتر خفيف `GET /api/state?mode=ping` (أو إرجاع `lastUpdatedAt` و `membersCount`)؛ وفي الـ Polling كل 10 ثوانٍ:
       - إذا لم يتغير `lastUpdatedAt` في السيرفر، لا تقم بتحميل أو فك تشفير ملف الـ JSON الضخم ولا تلمس الـ State في المتصفح نهائياً!
       - هذا وحده يزيل **99% من الحمل على المعالج والشبكة** في هواتف الآيفون والأندرويد والكمبيوتر وAI Studio!
  3. **تسريع رندرة الجداول والبطاقات (`React.memo` & Instant Tab Switching):**
     - استخدم `useMemo` لجميع القوائم المفلترة في `MembersDashboard.tsx` و `IdBadgesGallery.tsx` و `AttendanceDashboard.tsx`.
     - عند التنقل بين الداشبوردات أو فتح أي نافذة، اعرض البيانات من الذاكرة فوراً في `0.01 ثانية` بدون أي طلب شبكة يعطل الواجهة.

---

### Task 4: ضمان التسجيل الفوري للأعضاء الجدد من أي جهاز (Android, iPhone, Desktop, Web App, AI Studio)
- **المطلوب بالتفصيل في `Register.tsx` و الـ Worker:**
  1. عندما يسجل عضو جديد:
     - يُضاف فوراً إلى `members` في الذاكرة وإلى `currentUser` وتفتح له بطاقته في **أقل من `0.1 ثانية`**.
     - يُرسل طلبه عبر `action: 'UPSERT_SINGLE_MEMBER'` (يرسل بيانات هذا العضو الجديد فقط!)، فيُحفظ في `CLEAN_MASTER_DB_V1` في السيرفر خلال أجزاء من الثانية!
     - بفضل `Task 1`، يثبت اسمه في السيرفر وفي جميع الأجهزة إلى الأبد (لا يختفي ولا يرمش ولا يخرج من حسابه تلقائياً أبداً!).

---

### Task 5: الحفاظ الكامل على سيادة `ميخائيل ادور راتب` وكافة القوانين المعتمدة
- **المطلوب بالتفصيل:**
  1. بقاء `ميخائيل ادور راتب` هو `مسؤول المجتمع` (`Community Owner`) الوحيد بكامل الصلاحيات السيادية الحصرية (صلاحيات الرتب، إعادة تعيين QR، تبديل الجنس السريع، الحذف الفوري/المتعدد، مسح الصورة)، بدون عبارة `محمي بالكامل` أو أيقونة القفل على بطاقته.
  2. بقاء الفلاتر المختصرة (`الكل` / `شباب` / `شابات`) مطابقة للقائمة الجانبية 100%، وصلاحية `سجل المخدومين` و`سجل المخدومين الآخر`[span_0](start_span)[span_0](end_span)، واختيار دولة الواتساب والتلفون (`+249` = 9 أرقام، `+20` = 10 أرقام)[span_1](start_span)[span_1](end_span)، وظهور الحضور في داشبورد الحضور والغياب.
</tasks>

---

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:
1. ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.
2. لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. تأكد 100% من: (أ) حذف أي كود يقوم بتسجيل خروج `currentUser` تلقائياً، (ب) تثبيت الأعضاء الجدد والرتب والصلاحيات عبر `UPSERT_SINGLE_MEMBER` و `roleUpdatedAt` دون إعادة الكتابة فوقهم بلقطات قديمة، (ج) إيقاف إرسال الصور الضخمة في كل ضغطة زر ليصبح الموقع سريعاً كالبرق.
</output_rules>
