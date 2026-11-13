# دفعة المهام الآمنة (Safe Read-First Sync for AI Studio Preview & CORS Fix without Overwriting Production Data)

<project_context>
- **الوضع الحالي المستقر:** البيانات والمشتركون يظهرون الآن بشكل صحيح 100% في `Cloudflare Database` وفي الدومين الرسمي (`https://3fetyayouth.online`).
- **المشكلة المتبقية فقط:** داخل شاشة معاينة **Google AI Studio** فقط، لا تظهر هذه الأسماء الجديدة (بسبب استخدام مسار نسبي `/api` لا يعمل داخل iframe معاينة AI Studio، أو بسبب حظر CORS، أو قراءة `localStorage` القديم داخل AI Studio).
- **تحذير صارم جداً (CRITICAL SAFETY RULE):**
  يُمنع منعاً باتاً أن تقوم بيئة معاينة AI Studio بكتابة أو إرسال حالتها المحلية القديمة فوق قاعدة بيانات Cloudflare! البيانات الموجودة حالياً في Cloudflare وعلى الدومين الرسمي هي المرجع الأساسي ويجب حمايتها 100%.
</project_context>

---

<tasks>
نفذ المهام الـ 3 التالية بحذر شديد ودون المساس بهيكلة البيانات العاملة حالياً على الدومين الرسمي:

### Task 1: ربط معاينة AI Studio بالرابط الكامل (Absolute API URL) وفتح CORS في الـ Worker
- **السبب التقني:** داخل `3fetyayouth.online`، الطلبات تتصل بالسيرفر بنجاح، لكن داخل معاينة `AI Studio` (التي تعمل على دومين `.scf.usercontent.goog` أو `aistudio.google.com`)، تفشل الطلبات النسبية أو تُحظر بسبب CORS.
- **المطلوب بالتفصيل:**
  1. في ملف الاتصال بـ Cloudflare (`cloudSync` / `api`)، تأكد من استخدام الرابط الكامل الثابت للـ Worker/API (Absolute URL مثل `https://threefetyayouth-api.<subdomain>.workers.dev` أو `https://3fetyayouth.online/api/...`) بدلاً من المسار النسبي `/api/...` عندما يكون الموقع مفتوحاً داخل بيئة المعاينة.
  2. في كود الـ Cloudflare Worker، تأكد أن هيدرز الـ `CORS` تسمح بالطلبات القادمة من معاينة AI Studio:
     `Access-Control-Allow-Origin: *` (أو السماح بدومين `3fetyayouth.online` ودومينات المعاينة)، مع `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.

---

### Task 2: تطبيق قاعدة (Pull-First / Server-Wins) لمنع AI Studio من مسح بيانات السيرفر
- **المطلوب بالتفصيل:**
  1. عند فتح التطبيق في أي بيئة (خصوصاً داخل AI Studio)، يجب أن يبدأ النظام بعملية **`GET` (سحب القراءة فقط)** من `Cloudflare Database` أولاً.
  2. **منع الكتابة العكسية التلقائية (No Blind Overwrite):** إذا كانت قائمة الأعضاء في المتصفح المحلي أقل من القائمة الموجودة في `Cloudflare Database`، أو لم تكتمل عملية الجلب الأولية (`initialFetchCompleted === true`)، **امنع تماماً** إرسال أي طلب `POST/PUT` يكتب فوق قاعدة بيانات Cloudflare.
  3. بمجرد نجاح جلب البيانات من Cloudflare إلى داخل نافذة AI Studio، استبدل أي كاش قديم في `localStorage` بالبيانات الحية القادمة من السيرفر لتظهر جميع الأسماء داخل AI Studio تماماً كما هي ظاهرة في `3fetyayouth.online`.

---

### Task 3: الحفاظ على نظام الحذف الموثق (Tombstones) بدون المساس بالبيانات الحالية
- **المطلوب بالتفصيل:**
  1. حافظ على عمل الحذف الصريح (عند الضغط يدوياً على "إلغاء عضوية" أو حذف حضور/فعالية/مسابقة) بحيث يحذف العنصر المحدد فقط بالـ `ID` الخاص به دون استبدال باقي الجدول.
</tasks>

---

<output_rules>
1. ادخل في الحل البرمجي مباشرة بدون مقدمات.
2. اكتب اسم الملف المستهدف ثم الكود المعدل مباشرة.
3. لا تقم بتغيير أسماء الجداول أو المفاتيح الحالية في Cloudflare Database لأنها تعمل الآن بشكل سليم على الدومين الرسمي.
</output_rules>
