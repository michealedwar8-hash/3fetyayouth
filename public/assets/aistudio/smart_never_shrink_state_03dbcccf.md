# الدستور الهندسي المصحح (1000% Smart Never-Shrink State + Instant Permanent Delete by ID & Name + Zero Polling Lag on Roles/Permissions/Gender + Purge 17 Old Mock Members & "عضو مسجل #")

<smart_never_shrink_constitution>
⚠️ **القاعدة الهندسية المصححة (`Smart Never-Shrink State` - حماية الأعضاء الحقيقيين مع احترام الحذف النهائي 100%):**
1. **حماية ضد انهيار الشبكة ولقطة الـ 1 عضو (في الهاتف) ولقطة الـ 17 عضواً (في AI Studio):**
   - إذا كانت قائمة الأعضاء الحالية أو النسخة الاحتياطية تحتوي على القائمة الكاملة للأعضاء الحقيقيين (`> 30 عضواً`)، وجاء رد تالف أو قديم من الشبكة أو من كاش قديم يحتوي على عدد صغير شاذ (`<= 25 عضواً` مثل `1 عضو [مسؤول المجتمع]` أو `17 عضواً قدامى`)، **يرفض الكود هذا الرد الشاذ فوراً ويحتفظ بالقائمة الحقيقية الكاملة!**
2. **منع الدمج الأعمى للكاش المحلي القديم (الذي كان يعيد الأسماء المحذوفة!):**
   - **يُمنع منعاً باتاً** إعادة دمج أسماء قديمة من كاش المتصفح (`prevMembers`) إذا كانت محذوفة أو موجودة في القائمة السوداء الأبدية (`PERMANENT_BLACKLIST`)!
   - أي اسم يقوم `مسؤول المجتمع` بحذفه يُسجل بالـ `ID` وبالاسم العربي المطبّع في `PERMANENT_BLACKLIST` (محلياً وفي `serverTombstones` في Cloudflare)، وتلتزم دالة `Smart Never-Shrink` بطرده فوراً وعدم إعادته ولو بعد 100,000 سنة!
3. **قفل التعديل الفوري (`10-Second Polling Freeze on Any User Action`):**
   - بمجرد ضغط المستخدم على أي زر (حذف عضو، تغيير رتبة، تعديل صلاحيات، تبديل جنس)، يتجمد الـ Polling تماماً لمدة 10 ثوانٍ لمنع أي لاق أو رجوع للبيانات القديمة.
</smart_never_shrink_constitution>

---

<tasks>
نفذ المهام الـ 6 التالية بدقة برمجية قاطعة 100%، وافصل بين حل كل مهمة بعنوان واضح (`## Task 1`, `## Task 2`...):

### Task 1: تطبيق دالة `applySmartNeverShrinkState` المصححة في `App.tsx` و `cloudSync.ts` والـ Worker
- **المطلوب بالتفصيل:**
  1. **التخلص من خطأ الدمج الأعمى السابق واستبداله بالدالة الذكية المحمية بـ `PERMANENT_BLACKLIST` و `lastModifiedAt`:**
     ```javascript
     export function applySmartNeverShrinkState(prevMembers: any[], incomingMembers: any[], serverBlacklist: any = {}) {
       // 1. دمج القائمة السوداء للمحذوفين (IDs + الأسماء المطبّعة)
       const deletedIds = getPermanentDeletedIdsSet(serverBlacklist?.ids);
       const deletedNames = getPermanentDeletedNamesSet(serverBlacklist?.names);

       const cleanList = (list: any[]) => (Array.isArray(list) ? list : []).filter(m => {
         if (isGarbageOrGhostMember(m)) return false; // طرد "عضو مسجل #1" وأي سجل فارغ
         const idStr = String(m.id || '').trim();
         const origIdStr = String(m.originalId || '').trim();
         const normName = ultraNormalizeArabic(m.name || m.fullName || '');
         if (idStr && deletedIds.has(idStr)) return false;
         if (origIdStr && deletedIds.has(origIdStr)) return false;
         if (normName && deletedNames.has(normName)) return false;
         return true;
       });

       const cleanPrev = cleanList(prevMembers);

       // 2. إذا فشل طلب الشبكة أو رجع فارغاً، احتفظ بالقائمة الحالية النظيفة (Never Shrink on Network Error)
       if (!incomingMembers || !Array.isArray(incomingMembers) || incomingMembers.length === 0) {
         return cleanPrev;
       }

       const cleanIncoming = cleanList(incomingMembers);

       // 3. درع الحماية الذكي (Smart Never-Shrink):
       // إذا كان لدينا القائمة الكاملة للأعضاء الحقيقيين (مثلاً > 30 عضواً) ورجعت استجابة شاذة فيها 1 عضو (مسؤول المجتمع) أو 17 عضواً قدامى، ارفض الاستجابة الشاذة واحتفظ بالقائمة الحقيقية الكاملة!
       if (cleanPrev.length > 30 && cleanIncoming.length <= 25) {
         console.warn('Smart Never-Shrink blocked partial/corrupted state drop:', cleanIncoming.length);
         return cleanPrev;
       }

       // 4. تحديث الأعضاء مع احترام أحدث تعديل محلي (الرتبة، الصلاحيات، وتبديل الجنس lastModifiedAt)
       const prevMap = new Map();
       cleanPrev.forEach(m => {
         if (m && m.id) prevMap.set(String(m.id), m);
       });

       const seenIds = new Set();
       const finalMembers = cleanIncoming.map((serverMem, idx) => {
         let safeId = String(serverMem.id || '').trim();
         if (!safeId || seenIds.has(safeId)) {
           safeId = `${safeId || 'CF'}-${idx + 1}`;
         }
         seenIds.add(safeId);

         const localMem = prevMap.get(safeId) || prevMap.get(String(serverMem.id));
         // إذا كان المسؤول قد عدّل رتبة أو صلاحيات أو جنس هذا العضو محلياً منذ لحظات، احتفظ بتعديله الأحدث ولا تمسحه!
         const useLocalEdits = localMem && (Number(localMem.lastModifiedAt || 0) > Number(serverMem.lastModifiedAt || 0));
         const merged = useLocalEdits ? { ...serverMem, ...localMem } : { ...(localMem || {}), ...serverMem };

         return {
           ...merged,
           id: safeId,
           originalId: serverMem.id || localMem?.originalId || safeId,
           name: String(merged.name || merged.fullName || '').trim(),
           role: merged.role || 'مخدوم',
           status: 'active',
           isDeleted: false
         };
       });

       if (finalMembers.length > 25) {
         try { localStorage.setItem('SAFE_BACKUP_MEMBERS', JSON.stringify(finalMembers)); } catch (e) {}
       }
       return finalMembers;
     }
     ```
  2. **داخل الـ Cloudflare Worker:**
     - طبّق نفس قاعدة الحماية: إذا كانت قاعدة البيانات في السيرفر تحتوي على `> 30 عضواً`، وجاء طلب حفظ عام يحتوي على `<= 25 عضواً` (مثل الـ 17 عضواً من AI Studio أو الـ 1 عضو من هاتف قديم)، **يرفض الـ Worker استبدال قاعدة البيانات بهذا الطلب الناقص!**
     - بينما إذا جاء طلب حذف صريح (`DELETE_MEMBERS`) أو تعديل عضو (`UPDATE_MEMBER`) من `مسؤول المجتمع`، ينفذه الـ Worker فوراً وفي أجزاء من الثانية!

---

### Task 2: قفل منع اللاق والتداخل (`10-Second Polling Freeze`) لتثبيت الرتب والصلاحيات والجنس والحذف فوراً
- **المطلوب بالتفصيل في `cloudSync.ts`, `App.tsx`, و `MembersDashboard.tsx`:**
  1. أنشئ قفل التعديل العالمي:
     ```javascript
     export let lastUserMutationTime = 0;
     export let isMutatingNow = false;
     export function lockPollingForMutation() {
       isMutatingNow = true;
       lastUserMutationTime = Date.now();
     }
     export function unlockPollingAfterMutation() {
       isMutatingNow = false;
       lastUserMutationTime = Date.now();
     }
     ```
  2. في أي `setInterval` أو دالة Polling تسحب البيانات من السيرفر:
     - أضف في أول سطر:
       ```javascript
       if (isMutatingNow || (Date.now() - lastUserMutationTime < 10000)) {
         return; // تجميد كامل للـ Polling لمدة 10 ثوانٍ بعد أي ضغطة زر لمنع اللاق ورجوع البيانات القديمة!
       }
       ```
  3. عند تغيير **رتبة أي عضو** أو **تحديد صلاحياته** أو **تعديل صلاحيات الرتب**:
     - استدعِ `lockPollingForMutation()` فوراً.
     - حدّث الـ State في `0.01 ثانية` مع وضع `lastModifiedAt: Date.now()` على العضو.
     - احفظ التعديل في `SAFE_BACKUP_MEMBERS` وأرسله للسيرفر، ثم استدعِ `unlockPollingAfterMutation()`. بذلك تثبت الرتبة والصلاحيات من أول ضغطة بنسبة 100% بدون أي رمشة أو لاق!

---

### Task 3: المسح الأبدي للـ 17 عضواً القدامى في AI Studio ولأشباح (`عضو مسجل #1`, `عضو مسجل #2`...)
- **المطلوب بالتفصيل في `constants.ts`, `mockData.ts`, `App.tsx`, `cloudSync.ts`, والـ Worker:**
  1. **تفريغ جميع مصفوفات الأعضاء الابتدائية في ملفات الكود (`INITIAL_MEMBERS = []`):**
     - امسح الـ 17 اسماً القدامى من أي ملف `constants` أو `mockData` أو `App.tsx` واجعل القيمة الابتدائية `[]` حتى يستحيل على `AI Studio` إظهارهم مرة أخرى!
  2. **إبادة أشباح `عضو مسجل #1` و `عضو مسجل #2` من الجذور:**
     - أنشئ دالة `isGarbageOrGhostMember(m)`:
       ```javascript
       export function isGarbageOrGhostMember(m: any): boolean {
         if (!m || typeof m !== 'object') return true;
         const rawName = String(m.name || m.fullName || '').trim();
         if (!rawName || rawName.length < 2) return true;
         if (
           rawName.includes('عضو مسجل') ||
           /^عضو\s*#?\s*\d+$/i.test(rawName) ||
           rawName === 'undefined' ||
           rawName === 'null'
         ) {
           return true;
         }
         return false;
       }
       ```
     - **امسح من الكود نهائياً** أي جملة تعوض الاسم الفارغ بـ `'عضو مسجل #' + idx` أو `'عضو ' + (idx + 1)`! أي سجل تالف بدون اسم حقيقي يُحذف تلقائياً من السيرفر والمتصفح.

---

### Task 4: الحذف الفوري النهائي بالـ ID والاسم معاً (لـ `مسؤول المجتمع` فقط) بحيث لا يعود المحذوف أبداً
- **المطلوب بالتفصيل في `MembersDashboard.tsx`, `cloudSync.ts`, والـ Worker:**
  1. عند ضغط `مسؤول المجتمع` على **"إلغاء عضوية / حذف فوري"** (أو **"حذف المحددين نهائياً"**):
     - استدعِ `lockPollingForMutation()`.
     - أضف **`id` العضو + `originalId` + اسمه العربي المطبّع (`ultraNormalizeArabic(member.name)`)** إلى `PERMANENT_BLACKLIST` في `localStorage` وفي `serverTombstones` داخل `Cloudflare Database`.
     - احذف العضو في `0.01 ثانية` من `members` ومن `SAFE_BACKUP_MEMBERS`، وأرسل للسيرفر أمر الحذف المباشر ليُمسح بالـ ID وبالاسم المطبّع من قاعدة البيانات فلا يعود للظهور أبداً.

---

### Task 5: تثبيت زر (تبديل الجنس السريع) لـ `مسؤول المجتمع` ليُحفظ في بيانات `members` للأبد ولا يرجع أبداً
- **المطلوب بالتفصيل في `MembersDashboard.tsx` و `cloudSync.ts` و الـ Worker:**
  1. عند ضغط `مسؤول المجتمع` على زر تبديل الجنس بجانب أي عضو:
     - استدعِ `lockPollingForMutation()`.
     - اعكس الجنس واحفظه داخل كائن العضو في **جميع حقول الجنس معاً** مع طابع التعديل اليدوي:
       ```javascript
       const newGender = getMemberGender(member) === 'female' ? 'male' : 'female';
       const newGenderAr = newGender === 'female' ? 'أنثى' : 'ذكر';
       const updatedMember = {
         ...member,
         gender: newGenderAr,
         genderCode: newGender,
         manualGender: newGender,
         sex: newGenderAr,
         type: newGender === 'female' ? 'شابة' : 'شاب',
         category: newGender === 'female' ? 'شابات' : 'شباب',
         genderLocked: true,
         lastModifiedAt: Date.now()
       };
       ```
     - حدّث `members` و `SAFE_BACKUP_MEMBERS` فوراً، وأرسل التحديث إلى `Cloudflare Database`.
  2. **دالة `getMemberGender(member)` تقرأ `manualGender` و `genderCode` و `gender` أولاً قبل أي فحص تلقائي:**
     - طالما تم تحديد جنس العضو أو تبديله، يُقرأ من حقله المحفوظ مباشرة ويستحيل أن يتغير أو يرجع للخطأ القديم أبداً!

---

### Task 6: توحيد العدد بين القائمة الجانبية وفلاتر الداشبورد (`شباب` / `شابات`)
- **المطلوب بالتفصيل:**
  1. القائمة الجانبية (`Sidebar`) وأزرار الفلتر العلوية في الداشبورد تقرأ من نفس المصفوفة المنقاة `members` (بعد `filterOutDeletedAndGhosts`):
     - زر الكل: **`الكل (${members.length})`** (ويطابق الرقم في القائمة الجانبية 100%).
     - زر الشباب: **`شباب (${maleCount})`**[span_0](start_span)[span_0](end_span).
     - زر الشابات: **`شابات (${femaleCount})`**[span_1](start_span)[span_1](end_span).
  2. الحفاظ على حصرية (زر تبديل الجنس، الحذف المتعدد والفوري، صلاحيات الرتب، وإعادة تعيين الـ QR) لـ **`مسؤول المجتمع` فقط**، وبقاء ميزات الواتساب وسجل الحضور والغياب كاملة[span_2](start_span)[span_2](end_span).
</tasks>

---

<output_rules>
التزم بالقواعد التالية بدقة في ردك لتوفير الـ Tokens والوقت:
1. ادخل في الحل البرمجي مباشرة بدون مقدمات أو عبارات ترحيبية.
2. لكل مهمة، اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. التزم حرفياً بتطبيق `applySmartNeverShrinkState` و `lockPollingForMutation` لضمان استحالة عودة أي اسم محذوف، واستحالة حدوث لاق في الرتب أو الصلاحيات أو الجنس، وحماية القائمة الحقيقية من السقوط إلى 1 أو 17 عضواً.
</output_rules>
