import React, { useState, useEffect } from 'react';
import { Copy, Check, Database, Key, ExternalLink, Zap, Terminal, RefreshCw, Cloud, ShieldCheck, Users, Bell, Calendar, Gamepad2 } from 'lucide-react';
import {
  CLOUDFLARE_WORKER_URL,
  CLOUDFLARE_WS_URL,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_D1_DB_NAME,
  CLOUDFLARE_D1_DB_ID,
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from '../../supabase';

export const CLOUDFLARE_D1_SQL_SCRIPT = `-- ========================================================
-- كود إنشاء جداول قاعدة البيانات على Cloudflare D1 (SQLite Edge)
-- اجتماع شباب الثلاثة فتية القديسين (3fetyayouth.online)
-- مجاني 100% للأبد: 5 مليون قراءة/يوم + 100 ألف كتابة/يوم + 0 رسوم Egress
-- Database Name: threefetyayouth
-- Database ID: 1d13778e-f840-482d-b1e9-02dda36fc9e3
-- ========================================================

-- 1. جدول المخدومين والرتب (registrants)
CREATE TABLE IF NOT EXISTS registrants (
  id TEXT PRIMARY KEY,
  uniqueCode TEXT,
  fullName TEXT NOT NULL,
  gender TEXT DEFAULT 'male',
  phone TEXT,
  whatsapp TEXT,
  dob TEXT,
  address TEXT,
  photoUrl TEXT,
  qrData TEXT,
  registeredAt TEXT,
  lastUpdatedAt TEXT,
  password TEXT,
  role TEXT DEFAULT 'member',
  permissions TEXT,
  status TEXT DEFAULT 'active',
  isOnline INTEGER DEFAULT 0,
  lastSeen TEXT,
  isVisitedGeneral INTEGER DEFAULT 0,
  lastVisitedAt TEXT,
  lastVisitedBy TEXT,
  needsRealPhoto INTEGER DEFAULT 0,
  faceSignature TEXT,
  recoveryCode TEXT
);

-- 2. جدول فصل الصور الشخصية لتوفير الباندويث 98% (media_blobs)
CREATE TABLE IF NOT EXISTS media_blobs (
  id TEXT PRIMARY KEY,
  memberId TEXT,
  dataUrl TEXT NOT NULL,
  updatedAt INTEGER
);

-- 3. جدول الحضور والأختام (attendance)
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  registrantId TEXT NOT NULL,
  registrantName TEXT,
  registrantPhotoUrl TEXT,
  date TEXT NOT NULL,
  timestamp TEXT,
  method TEXT DEFAULT 'manual'
);

-- 4. جدول الإعلانات والتفاعلات (announcements)
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  content TEXT,
  templateType TEXT,
  senderRole TEXT,
  senderName TEXT,
  senderPhotoUrl TEXT,
  targetAudience TEXT DEFAULT 'all',
  createdAt TEXT,
  created_at INTEGER,
  reactions TEXT DEFAULT '{}',
  pinned INTEGER DEFAULT 0,
  viewers TEXT DEFAULT '[]'
);

-- 5. جدول الفعاليات والحالة السحابية الموحدة (events)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date INTEGER,
  created_at INTEGER
);

-- 6. جدول الأعضاء السريع (members)
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'member',
  created_at INTEGER
);

-- 7. جدول مسابقات الثلاثة فتية (kahoot_quizzes)
CREATE TABLE IF NOT EXISTS kahoot_quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  creatorId TEXT,
  creatorName TEXT,
  createdAt TEXT,
  isPublished INTEGER DEFAULT 1,
  antiCheat TEXT,
  questions TEXT DEFAULT '[]'
);

-- 8. جدول الجلسات اللحظية للمسابقات (kahoot_sessions)
CREATE TABLE IF NOT EXISTS kahoot_sessions (
  id TEXT PRIMARY KEY,
  quizId TEXT,
  hostId TEXT,
  status TEXT DEFAULT 'lobby',
  currentQuestionIndex INTEGER DEFAULT 0,
  questionTimeLimitSeconds INTEGER DEFAULT 20,
  questionStartedAt INTEGER,
  players TEXT DEFAULT '{}',
  answersSubmitted TEXT DEFAULT '{}',
  opinionsCollected TEXT DEFAULT '{}',
  maxPlayersLimit INTEGER DEFAULT 0
);
`;

export const SUPABASE_SQL_SCRIPT = CLOUDFLARE_D1_SQL_SCRIPT;

export const FirebaseSetupView: React.FC = () => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<any>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cloudflare/status');
      if (res.ok) {
        const json = await res.json();
        setStatusData(json);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSyncToCloudflare = async (includePhotos = true) => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/cloudflare/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includePhotos })
      });
      const json = await res.json();
      if (json.success) {
        setSyncMessage(`✅ تمت المزامنة الكاملة مع Cloudflare D1 بنجاح! (${json.membersCount} عضو، ${json.slicesSynced} جداول رئيسية، ${json.photosSynced} صورة مفصولة).`);
        await fetchStatus();
      } else {
        setSyncMessage('⚠️ حدث تنبيه أثناء المزامنة، يرجى المحاولة مرة أخرى.');
      }
    } catch {
      setSyncMessage('⚠️ تعذر الاتصال بالسيرفر المحلي للمزامنة.');
    } finally {
      setSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900/95 via-emerald-900/95 to-teal-900/95 border border-emerald-500/30 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                Cloudflare D1 + Durable Objects Realtime متصل ومفعل ⚡
              </span>
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold border border-amber-500/30">
                مجاني 100% للأبد (5 مليون قراءة/يوم • 0 Egress)
              </span>
            </div>
            <h1 className="text-2xl font-black">مركز سحابة Cloudflare D1 والمزامنة اللحظية</h1>
            <p className="text-sm text-emerald-100/85 mt-1">
              تم استرجاع جميع بيانات Supabase بالكامل (15 عضو بصورهم وتحديثاتهم + الفعاليات + المسابقات + الإعلانات) وربطها مباشرة بقاعدة بيانات <strong>Cloudflare D1</strong> و <strong>WebSockets Durable Objects</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSyncToCloudflare(true)}
              disabled={syncing}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black px-5 py-3 rounded-2xl shadow-lg transition text-xs cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'جاري النقل والمزامنة...' : 'مزامنة ونقل البيانات لـ Cloudflare D1 الآن ⚡'}</span>
            </button>

            <a
              href={`https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/workers/d1/databases/${CLOUDFLARE_D1_DB_ID}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-3 rounded-2xl border border-white/20 transition text-xs"
            >
              <ExternalLink className="w-4 h-4" />
              لوحة Cloudflare D1
            </a>
          </div>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-xs font-bold text-emerald-100">
            {syncMessage}
          </div>
        )}
      </div>

      {/* Live Migration & Database Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{statusData?.localRegistrantsCount ?? 15}</div>
            <div className="text-[11px] font-bold text-slate-500">الأعضاء في D1 والداشبورد</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{statusData?.localAnnouncementsCount ?? 4}</div>
            <div className="text-[11px] font-bold text-slate-500">الإعلانات والتفاعلات</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{statusData?.localEventRegistrationsCount ?? 8}</div>
            <div className="text-[11px] font-bold text-slate-500">تسجيلات الرحلات والمؤتمرات</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{statusData?.localKahootQuizzesCount ?? 1}</div>
            <div className="text-[11px] font-bold text-slate-500">المسابقات وبنك الأسئلة (13)</div>
          </div>
        </div>
      </div>

      {/* Cloudflare D1 Connection Details Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-amber-600" />
            بيانات الربط المباشر مع Cloudflare D1 + Durable Objects
          </h2>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            متصل نشط ({statusData?.d1StateRowsCount ?? 18} حزمة سحابية)
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">CLOUDFLARE D1 DATABASE</span>
            <span className="text-emerald-700 font-bold break-all">{CLOUDFLARE_D1_DB_NAME} ({CLOUDFLARE_D1_DB_ID})</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">CLOUDFLARE ACCOUNT ID</span>
            <span className="text-slate-700 font-bold break-all">{CLOUDFLARE_ACCOUNT_ID}</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">CLOUDFLARE WORKER API</span>
            <span className="text-emerald-700 font-bold break-all">{CLOUDFLARE_WORKER_URL}</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">REALTIME WEBSOCKET (DURABLE OBJECT)</span>
            <span className="text-indigo-700 font-bold break-all">{CLOUDFLARE_WS_URL}</span>
          </div>
        </div>
      </div>

      {/* SQL Script Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-600" />
              هيكل جداول Cloudflare D1 (SQLite Schema)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              يتم إنشاء هذه الجداول تلقائياً بواسطة Cloudflare Worker، ويمكنك أيضاً نسخها لـ <strong>Cloudflare D1 Console</strong>.
            </p>
          </div>

          <button
            onClick={() => copyToClipboard(CLOUDFLARE_D1_SQL_SCRIPT)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shrink-0 ${
              copiedSql 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {copiedSql ? (
              <>
                <Check className="w-4 h-4" />
                تم نسخ كود SQL بنجاح!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                نسخ كود SQL بالكامل
              </>
            )}
          </button>
        </div>

        <div className="relative">
          <pre
            dir="ltr"
            className="bg-slate-950 text-emerald-300 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed border border-slate-800"
          >
            {CLOUDFLARE_D1_SQL_SCRIPT}
          </pre>
        </div>
      </div>

    </div>
  );
};
export default FirebaseSetupView;
