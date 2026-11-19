# الدفعة الهندسية الحاسمة: المزامنة التراكمية الشاملة لمنع اختفاء الأعضاء الجدد نهائياً (فحص Cloudflare واسترجاع اسطفانوس ادور صديق، اسطفانوس ايمن هلال، وكافة المسجلين الجدد بكامل بياناتهم وصورهم)

<strict_sync_and_persistence_protocol>
⚠️ **القواعد البرمجية الصارمة لمنع فقدان البيانات أو الـ Reset أو رجوع المحذوفين:**
1. **منع الكتابة الكلية (No Full State Overwrite):** يُمنع منعاً باتاً أن يقوم التطبيق باستبدال مصفوفة الأعضاء المحلية بقائمة ثابتة أو ناقصة قادمة من السيرفر.
2. **الدمج التراكمي الإجباري للمسجلين الجدد فقط (Additive Merge for New Members Only):** أي عضو جديد موجود في قاعدة بيانات Cloudflare (`CLEAN_MASTER_DB_V1`) أو في الذاكرة المحلية — **بشرط ألا يكون ضمن القائمة السوداء للمحذوفين (`PERMANENT_BLACKLIST` / `serverTombstones`)** — يجب دمجه تلقائياً وإضافته للمصفوفة المعروضة بكامل بياناته وصورته.
3. **منع عودة الأسماء القديمة المحذوفة:** يُمنع استرجاع أي اسم تم حذفه سابقاً؛ يقتصر الفحص والاسترجاع على الأعضاء الحقيقيين والمسجلين الجدد فقط.
4. **استرجاع كامل البيانات والصور (`Full Data & Photo Integrity`):** عند سحب `اسطفانوس ادور صديق` و `اسطفانوس ايمن هلال` أو أي عضو جديد مسجل في `CLEAN_MASTER_DB_V1`، يجب سحب سجله كاملاً (الاسم، رقم التلفون، رقم الواتساب، كلمة المرور، كود الأمان، العنوان، الملاحظات، الصورة الشخصية `photoUrl` / `avatar`، الـ `qrCode`، وأختام الحضور) بدون إنشاء سجل فارغ أو فقدان الصورة.
5. **الحماية من الـ Reset واللاق (Anti-Reset & Zero-Flicker Shield):** إلغاء أي دالة تقوم بمسح الأعضاء الجدد أو عمل `Reset` للـ State أثناء المزامنة، مع تفعيل قفل التعديل (`lockPollingForMutation`).
</strict_sync_and_persistence_protocol>

---

<tasks>
نفذ المهام الـ 3 التالية بدقة برمجية قاطعة 100%:

### Task 1: تعديل منطق الجلب والدمج التراكمي في `cloudSync.ts` (وملف إدارة الحالة `App.tsx`)
- استبدل منطق الاستبدال الكلي بدالة دمج تراكمي تحفظ كل عضو جديد بكامل بياناته وصورته وتمنع اختفاءه أو تكراره، مع احترام قائمة المحذوفين:

```typescript
// دالة التطبيع العربي الدقيقة للمطابقة
function normalizeName(name: any): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ');
}

// دالة الدمج التراكمي لضمان عدم ضياع أي عضو جديد مع الحفاظ على كامل بياناته وصورته
export function mergeNewMembersAdditive(
  currentMembers: any[],
  cloudDbMembers: any[],
  deletedIds: Set<string> = new Set(),
  deletedNames: Set<string> = new Set()
): any[] {
  if (!Array.isArray(cloudDbMembers)) return currentMembers;
  if (!Array.isArray(currentMembers)) return cloudDbMembers;

  // قائمة الأسماء المستهدفة بالإنقاذ الفوري للتأكد من عدم حجبها بالخطأ
  const protectedRescueNames = new Set([
    normalizeName('اسطفانوس ادور صديق'),
    normalizeName('اسطفانوس ايمن هلال')
  ]);

  const memberMap = new Map<string, any>();

  const upsertIntoMap = (m: any) => {
    if (!m || (!m.name && !m.fullName)) return;
    const normName = normalizeName(m.name || m.fullName);
    const idStr = String(m.id || '').trim();

    // استبعاد المحذوفين نهائياً (مع استثناء الأسماء المحمية المطلوب استرجاعها)
    if (!protectedRescueNames.has(normName)) {
      if ((idStr && deletedIds.has(idStr)) || deletedNames.has(normName)) {
        return;
      }
    }

    const existing = memberMap.get(normName);
    if (!existing) {
      memberMap.set(normName, { ...m, isSynced: true });
    } else {
      // دمج ذكي يحافظ على كامل البيانات والصورة والأختام دون مسح أي حقل ممتلئ بحقل فارغ
      const mergedStamps = Array.from(new Set([
        ...(Array.isArray(existing.stamps) ? existing.stamps : []),
        ...(Array.isArray(m.stamps) ? m.stamps : [])
      ]));
      const mergedDates = Array.from(new Set([
        ...(Array.isArray(existing.attendanceDates) ? existing.attendanceDates : []),
        ...(Array.isArray(m.attendanceDates) ? m.attendanceDates : [])
      ]));

      memberMap.set(normName, {
        ...existing,
        ...m,
        phone: m.phone || existing.phone || '',
        whatsapp: m.whatsapp || existing.whatsapp || '',
        password: m.password || existing.password || '',
        recoveryCode: m.recoveryCode || existing.recoveryCode || '',
        securityCode: m.securityCode || existing.securityCode || '',
        address: m.address || existing.address || '',
        notes: m.notes || existing.notes || '',
        photoUrl: m.photoUrl || existing.photoUrl || m.avatar || existing.avatar || '',
        avatar: m.avatar || existing.avatar || m.photoUrl || existing.photoUrl || '',
        qrCode: m.qrCode || existing.qrCode || existing.id,
        stamps: mergedStamps,
        attendanceDates: mergedDates,
        isSynced: true
      });
    }
  };

  // 1. تثبيت الأعضاء الحاليين أولاً
  currentMembers.forEach(upsertIntoMap);
  // 2. دمج كافة الأعضاء القادمين من Cloudflare (شاملاً اسطفانوس ادور صديق، اسطفانوس ايمن هلال، وأي مسجل جديد)
  cloudDbMembers.forEach(upsertIntoMap);

  return Array.from(memberMap.values());
}

// دالة الفحص الشامل وسحب كافة المسجلين الجدد من Cloudflare Database
export async function forceFetchAndSyncAllMembers(setCurrentMembers: Function) {
  try {
    const response = await fetch(`/api/state?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;

    const data = await response.json();
    const cloudMembers = data?.members || data?.cleanMasterDb?.members || [];
    const serverDeletedIds = new Set<string>((data?.tombstones?.ids || []).map(String));
    const serverDeletedNames = new Set<string>((data?.tombstones?.names || []).map(normalizeName));

    if (cloudMembers.length > 0) {
      setCurrentMembers((prevMembers: any[]) => {
        const updatedList = mergeNewMembersAdditive(
          prevMembers,
          cloudMembers,
          serverDeletedIds,
          serverDeletedNames
        );
        try {
          localStorage.setItem('CLEAN_MASTER_DB_V1_CACHE', JSON.stringify(updatedList));
        } catch (e) {
          console.error('Failed to cache members', e);
        }
        return updatedList;
      });
    }
  } catch (error) {
    console.error('Error syncing with Cloudflare Database:', error);
  }
}

Task 2: فحص قاعدة بيانات Cloudflare في الـ Worker (worker.js / worker.ts) وإرجاع كافة المسجلين الجدد ببياناتهم وصورهم
تأكد من أن نقطة نهاية GET /api/state في الـ Worker:

تقرأ CLEAN_MASTER_DB_V1 بالكامل دون أي فلترة تسقط الأعضاء الجدد.

تقوم برفع أي حظر خاطئ من tombstones عن الاسمين: اسطفانوس ادور صديق و اسطفانوس ايمن هلال.

تضمن في نقطة POST /api/register و UPSERT_SINGLE_MEMBER أن أي عضو جديد يسجل يتم حفظه مباشرة داخل masterDb.members في CLEAN_MASTER_DB_V1 بكامل بياناته وصورته (photoUrl, avatar, phone, whatsapp, password, recoveryCode, address, notes, qrCode) مع تحديث lastUpdatedAt.

// داخل معالج الطلب GET /api/state في Cloudflare Worker
async function handleGetState(env) {
  const rawDb = await env.THREE_FETYA_KV.get('CLEAN_MASTER_DB_V1');
  let masterDb = rawDb ? JSON.parse(rawDb) : { members: [], tombstones: { ids: [], names: [] } };

  if (!Array.isArray(masterDb.members)) {
    masterDb.members = [];
  }

  // التأكد من عدم وجود اسطفانوس ادور صديق أو اسطفانوس ايمن هلال في قائمة الحظر بالخطأ
  if (masterDb.tombstones && Array.isArray(masterDb.tombstones.names)) {
    const rescueTargets = ['اسطفانوس ادور صديق', 'اسطفانوس ايمن هلال'];
    masterDb.tombstones.names = masterDb.tombstones.names.filter(
      n => !rescueTargets.some(t => String(n || '').includes(t))
    );
  }

  // إرجاع الحالة الكاملة كما هي ببيانات وصور كافة الأعضاء المسجلين في Cloudflare
  return new Response(JSON.stringify({
    success: true,
    members: masterDb.members,
    tombstones: masterDb.tombstones || { ids: [], names: [] },
    events: masterDb.events || [],
    competitions: masterDb.competitions || [],
    attendanceRecords: masterDb.attendanceRecords || [],
    rolePermissions: masterDb.rolePermissions || {},
    totalCount: masterDb.members.length,
    serverTime: Date.now()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

Task 3: فحص وتثبيت ظهور اسطفانوس ادور صديق و اسطفانوس ايمن هلال وكافة المسجلين الجدد في الداشبورد بدون اختفاء أو لاق
المطلوب في App.tsx و MembersDashboard.tsx:

عند فتح الداشبورد، يتم سحب البيانات الكاملة من CLEAN_MASTER_DB_V1 عبر forceFetchAndSyncAllMembers بحيث يظهر كل من اسطفانوس ادور صديق و اسطفانوس ايمن هلال وأي عضو آخر سجل جديداً في Cloudflare بكامل بياناتهم وصورهم المحفوظة في القاعدة.

إزالة أي كود يعيد فرض قائمة الـ 96 عضواً القديمة كقائمة مغلقة، حتى لا تتسبب دورة المزامنة (Polling) في إخفاء الأعضاء الجدد ثم إرجاعهم (Zero Flicker / Zero Lag).

الحفاظ الكامل على كافة الثوابت المعتمدة: سيادة ميخائيل ادور راتب كـ مسؤول المجتمع، قفل الـ Polling لمدة 10 ثوانٍ عند التعديلات، ومنع تكرار البطاقات.

<output_rules>

ادخل في الحل البرمجي مباشرة بدون مقدمات.

اكتب اسم كل ملف مستهدف ثم الكود المعدل مباشرة.

تأكد 100% من استرجاع اسطفانوس ادور صديق و اسطفانوس ايمن هلال وكافة المسجلين الجدد من CLEAN_MASTER_DB_V1 بكامل بياناتهم وصورهم دون إرجاع أي أسماء قديمة محذوفة.
</output_rules>