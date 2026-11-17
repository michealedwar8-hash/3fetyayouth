# الدفعة الهندسية القاطعة (100% Eliminate Duplicate Members in Dashboard via Smart Entity Deduplication & Preserve Smart Never-Shrink, Instant Delete, Gender Lock & Zero-Lag Controls)

<permanent_architectural_constitution>
⚠️ **الثوابت والاتفاقات المقدسة (ممنوع كسر أي منها نهائياً في هذا التعديل):**
1. **الحفاظ على `Smart Never-Shrink State`:** منع سقوط القائمة إلى 1 عضو (في الهاتف) أو 17 عضواً قديماً (في AI Studio) عند ضعف الشبكة، مع السماح الفوري بتقليص العدد عند إزالة النسخ المكررة (Duplicates) أو عند الحذف الصريح بواسطة `مسؤول المجتمع`.
2. **الحفاظ على `10-Second Polling Freeze` (`lockPollingForMutation`):** بقاء الرتب، الصلاحيات، تبديل الجنس، والحذف الفوري خالية تماماً من اللاق (`0.01s`) وبدون أي رجوع للبيانات القديمة.
3. **الحفاظ على `PERMANENT_BLACKLIST` وإبادة أشباح `عضو مسجل #`:** أي اسم محذوف لا يعود للأبد.
4. **الحفاظ على حصرية أدوات `مسؤول المجتمع`:** (صلاحيات الرتب، إعادة تعيين الـ QR، تبديل الجنس السريع، والتحديد المتعدد للحذف الفوري) مخفية تماماً عن كل الرتب ولا تظهر إلا لـ `مسؤول المجتمع` فقط، مع إخفاء عبارة `محمي بالكامل` وأيقونة القفل من بطاقته.
5. **الحفاظ على الفلاتر المختصرة (`الكل` / `شباب` / `شابات` مع العدد الموحد مع القائمة الجانبية)، وصلاحية `سجل المخدومين الآخر`[span_0](start_span)[span_0](end_span)، واختيار دولة الواتساب والتلفون (`+249` = 9 أرقام، `+20` = 10 أرقام)[span_1](start_span)[span_1](end_span)، وظهور الحضور في داشبورد الحضور والغياب.**
</permanent_architectural_constitution>

---

<root_cause_of_duplication>
- **السبب الجذري لتدبل الأعضاء (ظهور العضو الواحد مرتين في الداشبورد):**
  1. في التعديلات السابقة، تم توليد معرّفات فرعية مثل `id-ROW-1` أو `id-1` بجانب المعرّف الأصلي `id`، أو حفظ نسختين لنفس المخدوم في `Cloudflare Database` و `SAFE_BACKUP_MEMBERS` بمعرّفين مختلفين.
  2. عندما قامت دالة العرض أو الدمج بجمع القائمة، اعتبرت النسختين شخصين مختلفين لأن `m1.id !== m2.id` رغم أنهما يحملان **نفس الاسم الثلاثي/الرباعي الكامل ونفس البيانات**!
- **الحل الهندسي النهائي القاطع (100% Zero Duplicates):**
  بناء دالة توحيد وإزالة تكرار ذكية (`deduplicateAndMergeMembers`) تمنع تماماً توليد أي لاحقة `-ROW-` لنفس الشخص، وتقوم بطيّ ودمج أي نسختين تحملان نفس `id` الأساسي (بعد إزالة أي لواحق `-ROW-` أو أرقام فرعية) أو تحملان **نفس الاسم العربي المطبّع الكامل (`ultraNormalizeArabic(name)`)** في **عضو واحد فريد فقط** يجمع أحدث بياناته وكامل أختامه وحضوره!
</root_cause_of_duplication>

---

<tasks>
نفذ المهام الـ 4 التالية بدقة برمجية قاطعة 100%، وافصل بين حل كل مهمة بعنوان واضح (`## Task 1`, `## Task 2`...):

### Task 1: بناء محرك إزالة التدبيل والدمج الذكي (`deduplicateAndMergeMembers`) في المتصفح والـ Worker
- **المطلوب بالتفصيل في `cloudSync.ts`, `App.tsx`, `MembersDashboard.tsx`, وملف الـ Worker:**
  1. **تنظيف الـ ID من لواحق التكرار السابقة (`getBaseMemberId`):**
     ```javascript
     export function getBaseMemberId(rawId: any): string {
       if (!rawId) return '';
       // إزالة أي لواحق سببت التدبيل مثل -ROW-1 أو -ROW-25 التي أضيفت في الأكواد السابقة
       return String(rawId).trim().replace(/-ROW-\d+$/i, '');
     }
     ```
  2. **دالة التوحيد ومنع التدبيل القاطعة (`deduplicateAndMergeMembers`):**
     - تمر أي قائمة أعضاء (سواء في المتصفح داخل `applySmartNeverShrinkState` أو داخل الـ Worker قبل الحفظ وعند الجلب) على هذه الدالة التي تضمن أن **كل مخدوم يظهر مرة واحدة فقط مستحيل يتدبل**:
     ```javascript
     export function deduplicateAndMergeMembers(rawList: any[], serverBlacklist: any = {}): any[] {
       if (!Array.isArray(rawList)) return [];
       const deletedIds = getPermanentDeletedIdsSet(serverBlacklist?.ids);
       const deletedNames = getPermanentDeletedNamesSet(serverBlacklist?.names);

       // خريطة توحيد الأعضاء حسب البصمة الفريدة (الاسم العربي المطبّع الكامل) لضمان عدم ظهور نفس الشخص مرتين أبداً
       const byNormalizedName = new Map<string, any>();

       for (const item of rawList) {
         if (!item || isGarbageOrGhostMember(item)) continue;

         const baseId = getBaseMemberId(item.originalId || item.id);
         const currentId = getBaseMemberId(item.id);
         const normName = ultraNormalizeArabic(item.name || item.fullName || '');

         if (!normName) continue;

         // استبعاد أي عضو في القائمة السوداء للمحذوفين
         if (
           (baseId && deletedIds.has(baseId)) ||
           (currentId && deletedIds.has(currentId)) ||
           (item.id && deletedIds.has(String(item.id))) ||
           deletedNames.has(normName)
         ) {
           continue;
         }

         const existing = byNormalizedName.get(normName);

         if (!existing) {
           // أول ظهور لهذا العضو: نثبته بمعرّفه النظيف بدون أي لواحق -ROW
           const cleanId = baseId || currentId || `3FY-${normName.replace(/\s+/g, '_')}`;
           byNormalizedName.set(normName, {
             ...item,
             id: cleanId,
             originalId: cleanId,
             name: String(item.name || item.fullName || '').trim()
           });
         } else {
           // وُجدت نسخة ثانية (Duplicate) لنفس العضو! ندمج النسختين في بطاقة واحدة دون تكرار:
           const itemTime = Number(item.lastModifiedAt || item.updatedAt || 0);
           const existingTime = Number(existing.lastModifiedAt || existing.updatedAt || 0);
           const newer = itemTime >= existingTime ? item : existing;
           const older = itemTime >= existingTime ? existing : item;

           // 1. دمج كافة الأختام وتواريخ الحضور من النسختين معاً حتى لا يضيع أي ختم حضور
           const mergedStamps = Array.from(new Set([
             ...(Array.isArray(older.stamps) ? older.stamps : []),
             ...(Array.isArray(newer.stamps) ? newer.stamps : [])
           ]));
           const mergedAttendanceDates = Array.from(new Set([
             ...(Array.isArray(older.attendanceDates) ? older.attendanceDates : []),
             ...(Array.isArray(newer.attendanceDates) ? newer.attendanceDates : [])
           ]));

           // 2. الحفاظ على الجنس المعدل يدوياً (manualGender / genderLocked) إن وجد في أي من النسختين
           const lockedGenderObj = newer.genderLocked || newer.manualGender
             ? newer
             : (older.genderLocked || older.manualGender ? older : newer);

           // 3. اختيار الـ ID الأصلي الثابت (الأقدم/النظيف الخالي من ROW)
           const canonicalId = getBaseMemberId(older.originalId || older.id) || getBaseMemberId(newer.id);

           byNormalizedName.set(normName, {
             ...older,
             ...newer,
             id: canonicalId,
             originalId: canonicalId,
             name: String(newer.name || older.name || '').trim(),
             phone: newer.phone || older.phone || '',
             whatsapp: newer.whatsapp || older.whatsapp || '',
             photoUrl: newer.photoUrl || older.photoUrl || newer.avatar || older.avatar || '',
             avatar: newer.avatar || older.avatar || newer.photoUrl || older.photoUrl || '',
             qrCode: newer.qrCode || older.qrCode || canonicalId,
             role: newer.role || older.role || 'مخدوم',
             permissions: newer.permissions || older.permissions || [],
             gender: lockedGenderObj.gender,
             genderCode: lockedGenderObj.genderCode,
             manualGender: lockedGenderObj.manualGender,
             sex: lockedGenderObj.sex,
             type: lockedGenderObj.type,
             category: lockedGenderObj.category,
             genderLocked: Boolean(lockedGenderObj.genderLocked || lockedGenderObj.manualGender),
             stamps: mergedStamps,
             attendanceDates: mergedAttendanceDates,
             lastModifiedAt: Math.max(itemTime, existingTime)
           });
         }
       }

       return Array.from(byNormalizedName.values());
     }
     ```

---

### Task 2: تحديث `applySmartNeverShrinkState` لتسمح بتنظيف المكررات فوراً مع حماية القائمة الحقيقية
- **المطلوب بالتفصيل في `App.tsx` و `cloudSync.ts`:**
  1. اجعل `applySmartNeverShrinkState` تمرر كلاً من `prevMembers` و `incomingMembers` على `deduplicateAndMergeMembers` أولاً!
  2. بذلك إذا كانت القائمة السابقة فيها مثلاً `180` عنصراً بسبب التدبيل، وبعد إزالة التكرار أصبحت `92` عضواً فريداً حقيقياً، **تقبل الدالة العدد الفريد الصحيح فوراً (`92` عضواً بدون أي تكرار)** وتحفظ هذه النسخة النظيفة الخالية من التكرار في `SAFE_BACKUP_MEMBERS` وترسلها لتنظيف `Cloudflare Database` تلقائياً!
  3. ويظل شرط `Smart Never-Shrink` يحمي فقط من السقوط الكارثي إلى `<= 20 عضواً` (مثل سقوط الهاتف إلى `1 عضو [مسؤول المجتمع]` أو سقوط AI Studio إلى `17 عضواً قديماً`).

---

### Task 3: تنظيف قاعدة بيانات Cloudflare في الـ Worker من النسخ المكررة نهائياً
- **المطلوب بالتفصيل في ملف الـ Worker (`worker.js` / `worker.ts`):**
  1. داخل الـ Worker، استدعِ نفس دالة `deduplicateAndMergeMembers` عند قراءة `members` وعند حفظ أي تحديث في `app_state`.
  2. إذا تم تنظيف نسخ مكررة (أي كان `rawMembers.length > deduplicatedMembers.length` وكان `deduplicatedMembers.length > 25`)، يقوم الـ Worker فوراً بحفظ القائمة الموحدة النظيفة (الخالية من أي تدبيل) في `Cloudflare Database` حتى يختفي التدبيل من جذوره في السيرفر وفي جميع الهواتف واللابتوبات وAI Studio للأبد!

---

### Task 4: توحيد الأعداد بعد إزالة التدبيل في (القائمة الجانبية) و(فلاتر الداشبورد: `الكل` / `شباب` / `شابات`)
- **المطلوب بالتفصيل في `MembersDashboard.tsx` و `Sidebar.tsx` / `App.tsx`:**
  1. بعد إزالة التدبيل عبر `deduplicateAndMergeMembers`، تصبح مصفوفة `members` содержаت كل عضو **مرة واحدة فقط**.
  2. القائمة الجانبية (`Sidebar`) وأزرار الفلتر العلوية في داشبورد المخدومين والرتب (`الكل`، `شباب`، `شابات`)[span_2](start_span)[span_2](end_span) تقرأ جميعها من هذه المصفوفة الموحدة الفريدة، فيظهر العدد الحقيقي الفعلي الصافي بدون أي تكرار!
  3. عند قيام `مسؤول المجتمع` بحذف أي عضو أو تبديل جنسه أو تعديل رتبته/صلاحياته، يتم التعديل على هذا السجل الموحد الوحيد مع تفعيل `lockPollingForMutation()` لمدة 10 ثوانٍ، فيثبت التعديل في `0.01 ثانية` بدون أي لاق وبدون أن توجد نسخة ثانية تعيد إظهاره!
</tasks>

---

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:
1. ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.
2. لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. تأكد 100% من تطبيق `deduplicateAndMergeMembers` لإزالة كافة الأعضاء المتدبلين ودمج أختامهم وحضورهم في سجل واحد فريد لكل عضو، مع الحفاظ الكامل على جميع الإصلاحات والثوابت السابقة.
</output_rules>
