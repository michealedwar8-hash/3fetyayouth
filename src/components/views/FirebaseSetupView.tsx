import React, { useState } from 'react';
import { Copy, Check, Database, Key, ExternalLink, Zap, Terminal } from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabase';

export const SUPABASE_SQL_SCRIPT = `-- ========================================================
-- كود إنشاء جداول قاعدة البيانات وتفعيل Realtime على Supabase
-- اجتماع شباب الثلاثة فتية القديسين
-- الصق هذا الكود بالكامل في Supabase SQL Editor واضغط RUN
-- ========================================================

-- 1. جدول المسجلين (registrants)
CREATE TABLE IF NOT EXISTS registrants (
  id TEXT PRIMARY KEY,
  "uniqueCode" TEXT,
  "fullName" TEXT NOT NULL,
  gender TEXT DEFAULT 'male',
  phone TEXT,
  whatsapp TEXT,
  dob TEXT,
  address TEXT,
  "photoUrl" TEXT,
  "qrData" TEXT,
  "registeredAt" TEXT,
  "lastUpdatedAt" TEXT,
  password TEXT,
  role TEXT DEFAULT 'member',
  permissions JSONB,
  status TEXT DEFAULT 'active',
  "isOnline" BOOLEAN DEFAULT false,
  "lastSeen" TEXT,
  "isVisitedGeneral" BOOLEAN DEFAULT false,
  "lastVisitedAt" TEXT,
  "lastVisitedBy" TEXT,
  "needsRealPhoto" BOOLEAN DEFAULT false,
  "faceSignature" TEXT
);

-- 2. جدول الحضور (attendance)
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  "registrantId" TEXT NOT NULL,
  "registrantName" TEXT,
  "registrantPhotoUrl" TEXT,
  date TEXT NOT NULL,
  timestamp TEXT,
  method TEXT DEFAULT 'manual'
);

-- 3. جدول الإعلانات والتنبيهات (announcements)
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  "templateType" TEXT,
  "senderRole" TEXT,
  "senderName" TEXT,
  "senderPhotoUrl" TEXT,
  "targetAudience" TEXT DEFAULT 'all',
  "createdAt" TEXT,
  reactions JSONB DEFAULT '{}'::jsonb,
  pinned BOOLEAN DEFAULT false,
  viewers JSONB DEFAULT '[]'::jsonb
);

-- 4. جدول مسابقات كاهوت (kahoot_quizzes)
CREATE TABLE IF NOT EXISTS kahoot_quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  "creatorId" TEXT,
  "creatorName" TEXT,
  "createdAt" TEXT,
  "isPublished" BOOLEAN DEFAULT true,
  "antiCheat" JSONB,
  questions JSONB DEFAULT '[]'::jsonb
);

-- 5. جدول جلسات كاهوت الحية (kahoot_sessions)
CREATE TABLE IF NOT EXISTS kahoot_sessions (
  id TEXT PRIMARY KEY,
  "quizId" TEXT,
  "hostId" TEXT,
  status TEXT DEFAULT 'lobby',
  "currentQuestionIndex" INTEGER DEFAULT 0,
  "questionTimeLimitSeconds" INTEGER DEFAULT 20,
  "questionStartedAt" BIGINT,
  players JSONB DEFAULT '{}'::jsonb,
  "answersSubmitted" JSONB DEFAULT '{}'::jsonb,
  "opinionsCollected" JSONB DEFAULT '{}'::jsonb,
  "maxPlayersLimit" INTEGER DEFAULT 0
);

-- 6. جدول نتائج المسابقات الفردية (kahoot_solo_scores)
CREATE TABLE IF NOT EXISTS kahoot_solo_scores (
  id TEXT PRIMARY KEY,
  "quizId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "playerName" TEXT,
  score INTEGER DEFAULT 0,
  "correctAnswersCount" INTEGER DEFAULT 0,
  "totalQuestions" INTEGER DEFAULT 0,
  "completedAt" TEXT
);

-- 7. جدول المستخدمين المحظورين (blocked_users)
CREATE TABLE IF NOT EXISTS blocked_users (
  id TEXT PRIMARY KEY,
  "fullName" TEXT,
  phone TEXT,
  whatsapp TEXT,
  "uniqueCode" TEXT,
  reason TEXT,
  "blockedAt" TEXT,
  "blockedBy" TEXT
);

-- 8. جدول السجلات المحذوفة لمنع الاسترجاع (deleted_records)
CREATE TABLE IF NOT EXISTS deleted_records (
  id TEXT PRIMARY KEY,
  type TEXT,
  "deletedAt" TEXT
);

-- ========================================================
-- تفعيل التحديث اللحظي (Realtime) لجميع الجداول
-- ========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'registrants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE registrants;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attendance') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'announcements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kahoot_quizzes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kahoot_quizzes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kahoot_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kahoot_sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kahoot_solo_scores') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kahoot_solo_scores;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'blocked_users') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE blocked_users;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'deleted_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE deleted_records;
  END IF;
END $$;

-- ========================================================
-- تعطيل RLS للسماح بوصول تطبيق الويب و Realtime للـ anon role
-- ========================================================
ALTER TABLE registrants DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE kahoot_quizzes DISABLE ROW LEVEL SECURITY;
ALTER TABLE kahoot_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE kahoot_solo_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_records DISABLE ROW LEVEL SECURITY;

-- منح كامل الصلاحيات لجميع الأدوار للتشغيل الفوري السلس
GRANT ALL ON TABLE registrants TO anon, authenticated, service_role;
GRANT ALL ON TABLE attendance TO anon, authenticated, service_role;
GRANT ALL ON TABLE announcements TO anon, authenticated, service_role;
GRANT ALL ON TABLE kahoot_quizzes TO anon, authenticated, service_role;
GRANT ALL ON TABLE kahoot_sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE kahoot_solo_scores TO anon, authenticated, service_role;
GRANT ALL ON TABLE blocked_users TO anon, authenticated, service_role;
GRANT ALL ON TABLE deleted_records TO anon, authenticated, service_role;
`;

export const FirebaseSetupView: React.FC = () => {
  const [copiedSql, setCopiedSql] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-900/90 to-teal-900/90 border border-emerald-500/30 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                سحابة Supabase متصلة ومفعلة بنجاح ⚡
              </span>
            </div>
            <h1 className="text-2xl font-black">إعداد قاعدة بيانات Supabase و Realtime</h1>
            <p className="text-sm text-emerald-100/80 mt-1">
              تم استبدال Firebase Firestore بالكامل بـ Supabase لحل مشكلة استهلاك الكوتا والتكرار اللانهائي نهائياً.
            </p>
          </div>

          <a
            href="https://supabase.com/dashboard/project/jkuvkkitkmemqopbrhin/sql"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-3 rounded-2xl shadow-lg transition text-xs shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            فتح Supabase SQL Editor
          </a>
        </div>
      </div>

      {/* Supabase Connection Details Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
          <Key className="w-5 h-5 text-emerald-600" />
          بيانات الربط الحالية (Supabase Config)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">SUPABASE URL</span>
            <span className="text-emerald-700 font-bold break-all">{SUPABASE_URL}</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[11px] text-slate-500 font-sans mb-1 font-bold">SUPABASE ANON KEY</span>
            <span className="text-slate-700 font-bold break-all">{SUPABASE_ANON_KEY}</span>
          </div>
        </div>
      </div>

      {/* SQL Script Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-600" />
              كود الـ SQL لإنشاء الجداول وتفعيل الـ Realtime
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              انسخ هذا الكود والصقه مباشرة في <strong>Supabase SQL Editor</strong> ثم اضغط على زر <strong>RUN</strong>.
            </p>
          </div>

          <button
            onClick={() => copyToClipboard(SUPABASE_SQL_SCRIPT)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs transition shrink-0 ${
              copiedSql
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {copiedSql ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>تم النسخ بنجاح!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>نسخ كود الـ SQL بالكامل</span>
              </>
            )}
          </button>
        </div>

        <div className="relative">
          <pre className="bg-slate-950 text-emerald-400 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-96 border border-slate-800 leading-relaxed text-left" dir="ltr">
            {SUPABASE_SQL_SCRIPT}
          </pre>
        </div>

        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-2">
          <p className="font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ماذا يفعل هذا الكود في قاعدة بياناتك؟
          </p>
          <ul className="list-disc list-inside space-y-1 text-emerald-800 text-[11px] pr-2">
            <li>ينشئ الجداول: <code className="bg-emerald-100 px-1 rounded">registrants</code>, <code className="bg-emerald-100 px-1 rounded">attendance</code>, <code className="bg-emerald-100 px-1 rounded">announcements</code>, <code className="bg-emerald-100 px-1 rounded">kahoot_quizzes</code>, <code className="bg-emerald-100 px-1 rounded">kahoot_sessions</code>, <code className="bg-emerald-100 px-1 rounded">kahoot_solo_scores</code>, <code className="bg-emerald-100 px-1 rounded">blocked_users</code>.</li>
            <li>يفعل التحديث اللحظي (<code className="bg-emerald-100 px-1 rounded">supabase_realtime</code>) لتنعكس أي إضافة أو تعديل في الداشبورد فوراً.</li>
            <li>يعطل الـ RLS ويمنح صلاحيات القراءة والكتابة لـ <code className="bg-emerald-100 px-1 rounded">anon</code> ليعمل التطبيق والـ Realtime مباشرة وبدون أي تعقيد.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
