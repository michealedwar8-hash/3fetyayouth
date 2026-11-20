import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global crash prevention for resilient background operations
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

function getTargetPort(): number {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' && process.argv[i + 1]) {
      return parseInt(process.argv[i + 1], 10);
    }
    if (arg.startsWith('--port=')) {
      return parseInt(arg.split('=')[1], 10);
    }
  }
  // In Cloud Run containers, PORT is often set to 8080 where nginx listens as reverse proxy.
  // The dev server process must strictly run on port 3000.
  if (process.env.PORT && process.env.PORT !== '8080') {
    return parseInt(process.env.PORT, 10);
  }
  return 3000;
}

function getTargetHost(): string {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--host' && process.argv[i + 1]) {
      return process.argv[i + 1];
    }
    if (arg.startsWith('--host=')) {
      return arg.split('=')[1];
    }
  }
  return '0.0.0.0';
}

const app = express();
const PORT = getTargetPort();
const HOST = getTargetHost();

// Universal CORS, Security Headers & Permissions-Policy Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'camera=(self *), microphone=(self *), clipboard-read=(self *), clipboard-write=(self *)');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// High body limit to support base64 personal photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global recursive XSS & script-injection sanitizer for all incoming JSON payloads
function sanitizePayloadValue(val: any): any {
  if (typeof val === 'string') {
    if (val.startsWith('data:image/')) return val;
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<\/?(?:script|iframe|object|embed)\b[^>]*>/gi, '')
      .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
  if (Array.isArray(val)) {
    return val.map(sanitizePayloadValue);
  }
  if (val && typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      cleaned[k] = sanitizePayloadValue(v);
    }
    return cleaned;
  }
  return val;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePayloadValue(req.body);
  }
  next();
});

// Persistence file location
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getServerBaseMemberId(rawId: any): string {
  return String(rawId || '')
    .trim()
    .replace(/^reg_member_reg_/i, 'reg_')
    .replace(/(-ROW-\d+)+$/i, '');
}

function normServerArabicName(s: any): string {
  return String(s || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئء]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ڤ/g, 'ف')
    .replace(/عبد\s+/g, 'عبد')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function deduplicateServerRegistrants(rawList: any[], deletedIds: Set<string> = new Set()): any[] {
  if (!Array.isArray(rawList)) return [];
  const byName = new Map<string, any>();

  const getTs = (m: any) =>
    Math.max(
      Number(m?.lastModifiedAt || 0),
      Number(m?.updatedAt || 0),
      m?.lastUpdatedAt ? new Date(m.lastUpdatedAt).getTime() || 0 : 0
    );

  const mergeStamps = (a: any, b: any) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));
    }
    return {
      ...(a && typeof a === 'object' ? a : {}),
      ...(b && typeof b === 'object' ? b : {})
    };
  };

  for (const r of rawList) {
    if (!r || typeof r !== 'object' || r.status === 'cancelled' || r.status === 'deleted' || r.isDeleted === true) continue;
    const fullName = String(r.fullName || r.name || '').trim().replace(/\s+/g, ' ');
    const nName = normServerArabicName(fullName);
    if (!nName || nName === 'عضو') continue;
    const cleanId = getServerBaseMemberId(r.id);
    if (cleanId && deletedIds.has(cleanId)) continue;
    if (r.id && deletedIds.has(String(r.id))) continue;

    const existing = byName.get(nName);
    if (!existing) {
      const recCode = String(r.recoveryCode || r.securityCode || r.backupCode || '123456').trim();
      byName.set(nName, {
        ...r,
        id: cleanId || r.id || `reg_${Date.now()}`,
        originalId: getServerBaseMemberId(r.originalId || cleanId || r.id),
        fullName,
        name: fullName,
        recoveryCode: recCode,
        securityCode: recCode
      });
      continue;
    }

    const exTs = getTs(existing);
    const inTs = getTs(r);
    const incomingWins = inTs > exTs || (inTs === exTs && Boolean(r.genderLocked || r.manualGender || r.ownerGenderModifiedAt));
    const primary = incomingWins ? r : existing;
    const secondary = incomingWins ? existing : r;
    const maxTs = Math.max(exTs, inTs);
    const canonicalId = !/^CF_/i.test(cleanId) && cleanId
      ? cleanId
      : getServerBaseMemberId(existing.id || cleanId);
    const finalGenderLocked = Boolean(primary.genderLocked || primary.manualGender || primary.ownerGenderModifiedAt || secondary.genderLocked || secondary.manualGender || secondary.ownerGenderModifiedAt);
    const genderSource = (primary.genderLocked || primary.manualGender || primary.ownerGenderModifiedAt || incomingWins) ? primary : secondary;
    const finalGender = genderSource.gender === 'female' ? 'female' : 'male';
    const exPhoto = String(existing.photoUrl || '').trim();
    const inPhoto = String(r.photoUrl || '').trim();
    const validPhoto = (p: string) => p && !p.startsWith('__D1_PHOTO_REF__:') && !p.startsWith('blob:');
    const mergedPhoto = validPhoto(String(primary.photoUrl || ''))
      ? primary.photoUrl
      : (validPhoto(String(secondary.photoUrl || '')) ? secondary.photoUrl : (inPhoto || exPhoto || ''));
    const mergedPassword = String(primary.password || secondary.password || primary.pass || secondary.pass || '123456').trim();
    const mergedRecovery = String(primary.recoveryCode || secondary.recoveryCode || primary.securityCode || secondary.securityCode || '123456').trim();

    byName.set(nName, {
      ...secondary,
      ...primary,
      id: canonicalId,
      originalId: getServerBaseMemberId(secondary.originalId || canonicalId),
      fullName: primary.fullName || secondary.fullName || fullName,
      name: primary.fullName || secondary.fullName || fullName,
      gender: finalGender,
      sex: finalGender,
      genderCode: genderSource.genderCode || finalGender,
      manualGender: finalGenderLocked ? finalGender : genderSource.manualGender,
      genderLocked: finalGenderLocked,
      ownerGenderModifiedAt: Math.max(Number(primary.ownerGenderModifiedAt || 0), Number(secondary.ownerGenderModifiedAt || 0)) || undefined,
      password: mergedPassword,
      recoveryCode: mergedRecovery,
      securityCode: mergedRecovery,
      registeredInCleanMasterV1: Boolean(primary.registeredInCleanMasterV1 || secondary.registeredInCleanMasterV1),
      photoUrl: mergedPhoto,
      stamps: mergeStamps(secondary.stamps, primary.stamps),
      fridayStamps: mergeStamps(secondary.fridayStamps, primary.fridayStamps),
      attendanceDates: Array.from(new Set([...(Array.isArray(secondary.attendanceDates) ? secondary.attendanceDates : []), ...(Array.isArray(primary.attendanceDates) ? primary.attendanceDates : [])])),
      presentDates: Array.from(new Set([...(Array.isArray(secondary.presentDates) ? secondary.presentDates : []), ...(Array.isArray(primary.presentDates) ? primary.presentDates : [])])),
      lastModifiedAt: maxTs || undefined,
      updatedAt: maxTs || primary.updatedAt || secondary.updatedAt
    });
  }
  const seenFinalIds = new Set<string>();
  const uniqueList: any[] = [];
  for (const m of byName.values()) {
    if (!m || typeof m !== 'object') continue;
    let finalId = getServerBaseMemberId(m.id);
    const nName = normServerArabicName(m.fullName || m.name || '');
    const isOwnerMember =
      m.role === 'community_owner' ||
      finalId === 'reg_owner_main' ||
      nName === normServerArabicName('ميخائيل ادور راتب') ||
      nName === normServerArabicName('ميخائيل ادوار راتب');
    if (isOwnerMember) {
      finalId = 'reg_owner_main';
    } else if (!finalId || seenFinalIds.has(finalId)) {
      let hashAcc = 0;
      const seed = nName || String(uniqueList.length + 1);
      for (let i = 0; i < seed.length; i++) {
        hashAcc = ((hashAcc << 5) - hashAcc + seed.charCodeAt(i)) | 0;
      }
      let candidate = `3FY-${Math.abs(hashAcc).toString(36).toUpperCase()}`;
      let suffix = 1;
      while (seenFinalIds.has(candidate)) {
        candidate = `3FY-${Math.abs(hashAcc).toString(36).toUpperCase()}-${suffix++}`;
      }
      finalId = candidate;
    }
    seenFinalIds.add(finalId);
    uniqueList.push({
      ...m,
      id: finalId,
      originalId: isOwnerMember ? 'reg_owner_main' : (getServerBaseMemberId(m.originalId || finalId) || finalId)
    });
  }
  return uniqueList;
}

interface AppData {
  registrants: any[];
  attendance: any[];
  announcements: any[];
  deletedAnnouncementIds?: string[];
  assignments: any[];
  specialVisitedMembers?: Record<string, any>;
  visitationNotes: any[];
  deletedVisitationNoteIds?: string[];
  visitationMode?: 'general' | 'special';
  visitationModeUpdatedAt?: number;
  fridayStamps?: Record<string, { stamped: boolean; version: number; updatedAt: number }>;
  deliveredGifts: Record<string, boolean>;
  logo: string | null;
  cardTemplate?: any;
  blockedUsers: any[];
  deletedRegistrantIds: string[];
  deletedAttendanceIds: string[];
  revokedAttendanceKeys?: string[];
  revokedStamps: Record<string, boolean>;
  rolePermissions?: Record<string, any>;
  kahootQuizzes?: any[];
  deletedKahootQuizIds?: string[];
  kahootSessions?: Record<string, any>;
  kahootSoloScores?: any[];
  kahootQuestionBank?: any[];
  communityEvents?: any[];
  deletedEventIds?: string[];
  eventGroups?: any[];
  eventRegistrations?: any[];
  eventPayments?: any[];
  eventBuses?: any[];
  eventAttendances?: any[];
  eventAuditLogs?: any[];
  eventStaffAssignments?: any[];
  siteTextOverrides?: Record<string, string>;
  lastUpdated: string;
}

let cachedMemoryDb: AppData | null = null;
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;

function getDatabase(): AppData | null {
  if (cachedMemoryDb) {
    return cachedMemoryDb;
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      cachedMemoryDb = JSON.parse(content);
      return cachedMemoryDb;
    } catch (e) {
      console.error('Error reading db.json:', e);
    }
  }
  return null;
}

function saveDatabase(data: AppData): boolean {
  try {
    data.lastUpdated = new Date().toISOString();
    cachedMemoryDb = data;
    if (pendingSaveTimer) {
      clearTimeout(pendingSaveTimer);
    }
    pendingSaveTimer = setTimeout(() => {
      pendingSaveTimer = null;
      if (cachedMemoryDb) {
        fs.promises.writeFile(DB_FILE, JSON.stringify(cachedMemoryDb), 'utf-8').catch((e) => {
          console.error('Error writing db.json:', e);
        });
      }
    }, 300);
    return true;
  } catch (e) {
    console.error('Error writing db.json:', e);
    return false;
  }
}

// Ensure database file exists
function ensureDatabase(initialData?: Partial<AppData>): AppData {
  let db = getDatabase();
  if (!db) {
    db = {
      registrants: initialData?.registrants || [],
      attendance: initialData?.attendance || [],
      announcements: initialData?.announcements || [],
      deletedAnnouncementIds: initialData?.deletedAnnouncementIds || [],
      assignments: initialData?.assignments || [],
      specialVisitedMembers: initialData?.specialVisitedMembers || {},
      visitationNotes: initialData?.visitationNotes || [],
      deletedVisitationNoteIds: initialData?.deletedVisitationNoteIds || [],
      visitationMode: initialData?.visitationMode || 'general',
      deliveredGifts: initialData?.deliveredGifts || {},
      logo: initialData?.logo || null,
      blockedUsers: initialData?.blockedUsers || [],
      deletedRegistrantIds: initialData?.deletedRegistrantIds || [],
      deletedAttendanceIds: initialData?.deletedAttendanceIds || [],
      revokedAttendanceKeys: initialData?.revokedAttendanceKeys || [],
      revokedStamps: initialData?.revokedStamps || {},
      kahootQuizzes: initialData?.kahootQuizzes || [],
      deletedKahootQuizIds: initialData?.deletedKahootQuizIds || [],
      kahootSessions: initialData?.kahootSessions || {},
      kahootSoloScores: initialData?.kahootSoloScores || [],
      kahootQuestionBank: initialData?.kahootQuestionBank || [],
      communityEvents: initialData?.communityEvents || [],
      deletedEventIds: initialData?.deletedEventIds || [],
      eventGroups: initialData?.eventGroups || [],
      eventRegistrations: initialData?.eventRegistrations || [],
      eventPayments: initialData?.eventPayments || [],
      eventBuses: initialData?.eventBuses || [],
      eventAttendances: initialData?.eventAttendances || [],
      eventAuditLogs: initialData?.eventAuditLogs || [],
      eventStaffAssignments: initialData?.eventStaffAssignments || [],
      siteTextOverrides: initialData?.siteTextOverrides || {},
      lastUpdated: new Date().toISOString()
    };
    saveDatabase(db);
  } else {
    // Ensure new arrays & defaults exist
    if (!Array.isArray(db.blockedUsers)) db.blockedUsers = [];
    if (!Array.isArray(db.deletedRegistrantIds)) db.deletedRegistrantIds = [];
    if (!Array.isArray(db.deletedAttendanceIds)) db.deletedAttendanceIds = [];
    if (!Array.isArray(db.revokedAttendanceKeys)) db.revokedAttendanceKeys = [];
    if (!Array.isArray(db.deletedAnnouncementIds)) db.deletedAnnouncementIds = [];
    if (!Array.isArray(db.announcements)) db.announcements = [];
    if (db.deletedAnnouncementIds.length > 0) {
      const delAnnSet = new Set(db.deletedAnnouncementIds);
      db.announcements = db.announcements.filter((a: any) => a && a.id && !delAnnSet.has(a.id));
    }
    if (!Array.isArray(db.assignments)) db.assignments = [];
    if (!db.specialVisitedMembers || typeof db.specialVisitedMembers !== 'object') db.specialVisitedMembers = {};
    if (!Array.isArray(db.visitationNotes)) db.visitationNotes = [];
    if (!Array.isArray(db.deletedVisitationNoteIds)) db.deletedVisitationNoteIds = [];
    if (db.deletedVisitationNoteIds.length > 0) {
      const delSet = new Set(db.deletedVisitationNoteIds);
      db.visitationNotes = db.visitationNotes.filter((n: any) => n && n.id && !delSet.has(n.id));
    }
    if (!db.visitationMode) db.visitationMode = 'general';
    if (typeof db.visitationModeUpdatedAt !== 'number') db.visitationModeUpdatedAt = 0;
    if (!db.fridayStamps || typeof db.fridayStamps !== 'object') db.fridayStamps = {};
    if (!db.revokedStamps || typeof db.revokedStamps !== 'object') db.revokedStamps = {};
    if (!db.rolePermissions || typeof db.rolePermissions !== 'object') db.rolePermissions = {};
    if (!Array.isArray(db.kahootQuizzes)) db.kahootQuizzes = [];
    if (!Array.isArray(db.deletedKahootQuizIds)) db.deletedKahootQuizIds = [];
    if (db.deletedKahootQuizIds.length > 0) {
      const delQuizSet = new Set(db.deletedKahootQuizIds);
      db.kahootQuizzes = db.kahootQuizzes.filter((q: any) => q && q.id && !delQuizSet.has(q.id));
    }
    if (!db.kahootSessions || typeof db.kahootSessions !== 'object') db.kahootSessions = {};
    if (!Array.isArray(db.kahootSoloScores)) db.kahootSoloScores = [];
    if (!Array.isArray(db.kahootQuestionBank)) db.kahootQuestionBank = [];
    if (!Array.isArray(db.communityEvents)) db.communityEvents = [];
    if (!Array.isArray(db.deletedEventIds)) db.deletedEventIds = [];
    if (db.deletedEventIds.length > 0) {
      const delEvSet = new Set(db.deletedEventIds);
      db.communityEvents = db.communityEvents.filter((ev: any) => ev && ev.id && !delEvSet.has(ev.id));
    }
    if (!Array.isArray(db.eventGroups)) db.eventGroups = [];
    if (!Array.isArray(db.eventRegistrations)) db.eventRegistrations = [];
    if (!Array.isArray(db.eventPayments)) db.eventPayments = [];
    if (!Array.isArray(db.eventBuses)) db.eventBuses = [];
    if (!Array.isArray(db.eventAttendances)) db.eventAttendances = [];
    if (!Array.isArray(db.eventAuditLogs)) db.eventAuditLogs = [];
    if (!Array.isArray(db.eventStaffAssignments)) db.eventStaffAssignments = [];
    if (!db.siteTextOverrides || typeof db.siteTextOverrides !== 'object') db.siteTextOverrides = {};
    const protectedRescuedIds = new Set([
      'reg_owner_main',
      'reg_1794592057854_hcqz',
      'reg_1794593070300_martina',
      'reg_1794605308722_yuhs',
      'reg_1794593070300_az5o',
      'reg_1794593070300_az5o-ROW-185',
      'reg_1794572147616_61r9',
      'reg_1794570089486_9210',
      'reg_1794591919447_u2ra'
    ]);
    if (Array.isArray(db.deletedRegistrantIds)) {
      db.deletedRegistrantIds = db.deletedRegistrantIds.filter((id: string) => !protectedRescuedIds.has(String(id || '').trim()));
    }
    if (Array.isArray(db.registrants)) {
      const deletedSet = new Set(db.deletedRegistrantIds || []);
      const deduped = deduplicateServerRegistrants(db.registrants, deletedSet);
      if (deduped.length !== db.registrants.length) {
        db.registrants = deduped;
        saveDatabase(db);
      }
    }

    if (Array.isArray(db.attendance)) {
      const isPurgedTestRecord = (a: any) => {
        if (!a) return true;
        const d = (a.date || '').trim();
        return (
          d === '2026-10-02' || d === '2026-10-09' || d === '2026-10-16' ||
          d.endsWith('-10-02') || d.endsWith('-10-09') || d.endsWith('-10-16') ||
          d.endsWith('/10/02') || d.endsWith('/10/09') || d.endsWith('/10/16') ||
          d.endsWith('10-2') || d.endsWith('10-9') ||
          (typeof a.id === 'string' && a.id.startsWith('att_seed_'))
        );
      };
      const cleanedAtt = db.attendance.filter(a => !isPurgedTestRecord(a));
      if (cleanedAtt.length !== db.attendance.length) {
        db.attendance = cleanedAtt;
        saveDatabase(db);
      }
    }
  }
  return db;
}

// ==========================================
// CLOUDFLARE D1 SERVER ADAPTER (SYNCS 3fetyayouth.online WITH SERVER DB)
// ==========================================
const CLOUDFLARE_D1_WORKER_URL = process.env.VITE_CLOUDFLARE_API_URL || 'https://threefetyayouth-api.michealedwar8.workers.dev';

function createServerCloudflareD1Builder(table: string) {
  let op: 'select' | 'upsert' | 'insert' | 'update' | 'delete' = 'select';
  let payloadData: any = null;
  const filters: Array<{ col: string; val: any }> = [];

  const execute = async (): Promise<{ data: any; error: any }> => {
    try {
      const baseUrl = `${CLOUDFLARE_D1_WORKER_URL.replace(/\/$/, '')}/api/table/${encodeURIComponent(table)}`;
      if (op === 'select') {
        const res = await fetch(baseUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) return { data: null, error: null };
        const json: any = await res.json();
        return { data: Array.isArray(json?.data) ? json.data : [], error: null };
      }
      if (op === 'upsert' || op === 'insert') {
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: Array.isArray(payloadData) ? payloadData : [payloadData] })
        });
        if (!res.ok) return { data: null, error: null };
        const json: any = await res.json();
        return { data: json?.data ?? payloadData, error: null };
      }
      if (op === 'update') {
        const idFilter = filters.find(f => f.col === 'id');
        const res = await fetch(baseUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: idFilter?.val, patch: payloadData, filters })
        });
        if (!res.ok) return { data: null, error: null };
        const json: any = await res.json();
        return { data: json?.data ?? payloadData, error: null };
      }
      if (op === 'delete') {
        const idFilter = filters.find(f => f.col === 'id');
        const res = await fetch(baseUrl, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: idFilter?.val, filters })
        });
        if (!res.ok) return { data: null, error: null };
        return { data: [], error: null };
      }
      return { data: null, error: null };
    } catch {
      return { data: null, error: null };
    }
  };

  let promise: Promise<{ data: any; error: any }> | null = null;
  const getPromise = () => {
    if (!promise) promise = execute();
    return promise;
  };

  const b: any = {
    select: () => { op = 'select'; return b; },
    insert: (d: any) => { op = 'insert'; payloadData = d; return b; },
    upsert: (d: any) => { op = 'upsert'; payloadData = d; return b; },
    update: (d: any) => { op = 'update'; payloadData = d; return b; },
    delete: () => { op = 'delete'; return b; },
    eq: (col: string, val: any) => { filters.push({ col, val }); return b; },
    neq: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    single: () => getPromise(),
    maybeSingle: () => getPromise(),
    then: (onf?: any, onr?: any) => getPromise().then(onf, onr),
    catch: (onr?: any) => getPromise().catch(onr),
    finally: (onfin?: any) => getPromise().finally(onfin)
  };
  return b;
}

const supabaseServer: any = {
  from: (table: string) => createServerCloudflareD1Builder(table)
};

const REGISTRANT_COLUMNS = new Set([
  'id', 'uniqueCode', 'fullName', 'gender', 'phone', 'whatsapp', 'dob',
  'address', 'photoUrl', 'qrData', 'registeredAt', 'lastUpdatedAt',
  'password', 'role', 'permissions', 'status', 'isOnline', 'lastSeen',
  'isVisitedGeneral', 'lastVisitedAt', 'lastVisitedBy', 'needsRealPhoto',
  'faceSignature', 'recoveryCode'
]);

function filterRegistrantForSupabase(member: any) {
  if (!member || typeof member !== 'object') return member;
  const filtered: Record<string, any> = {};
  for (const [key, val] of Object.entries(member)) {
    if (REGISTRANT_COLUMNS.has(key)) {
      filtered[key] = val;
    }
  }
  return filtered;
}

async function persistSystemStateToSupabase(db: AppData) {
  try {
    const ownerIdx = (db.registrants || []).findIndex(r => r && (r.id === 'reg_owner_main' || r.role === 'community_owner'));
    if (ownerIdx >= 0) {
      const owner = db.registrants[ownerIdx];
      const nowIso = new Date().toISOString();
      const updatedPerms = {
        ...(owner.permissions || {}),
        canExportData: true,
        canPrintCards: true,
        canEditMembers: true,
        canManageAdmins: true,
        canViewDatabase: true,
        canScanAttendance: true,
        canViewMakhdomeen: true,
        canCancelMembership: true,
        canManageVisitation: true,
        canSendAnnouncements: true,
        canManageKahoot: true,
        canManageEvents: true,
        canManageEventPayments: true,
        canScanEventAttendance: true,
        __systemVisitationMode: db.visitationMode || 'general',
        __systemAssignments: db.assignments || [],
        __systemSpecialVisited: db.specialVisitedMembers || {},
        __systemVisitationNotes: db.visitationNotes || [],
        __systemDeletedNoteIds: db.deletedVisitationNoteIds || [],
        __systemDeletedAnnouncementIds: db.deletedAnnouncementIds || [],
        __systemKahootQuizzes: db.kahootQuizzes || [],
        __systemDeletedKahootQuizIds: db.deletedKahootQuizIds || [],
        __systemKahootSessions: db.kahootSessions || {},
        __systemKahootSoloScores: db.kahootSoloScores || [],
        __systemKahootQuestionBank: db.kahootQuestionBank || [],
        __systemCommunityEvents: db.communityEvents || [],
        __systemDeletedEventIds: db.deletedEventIds || [],
        __systemEventGroups: db.eventGroups || [],
        __systemEventRegistrations: db.eventRegistrations || [],
        __systemEventPayments: db.eventPayments || [],
        __systemEventBuses: db.eventBuses || [],
        __systemEventAttendances: db.eventAttendances || [],
        __systemEventAuditLogs: db.eventAuditLogs || [],
        __systemEventStaffAssignments: db.eventStaffAssignments || [],
        __systemRolePermissions: db.rolePermissions || {},
        __systemSiteTextOverrides: db.siteTextOverrides || {},
        __systemSiteTextsUpdatedAt: lastServerSiteTextsMutationAt || Date.now(),
        __systemStateUpdatedAt: nowIso
      };
      db.registrants[ownerIdx].permissions = updatedPerms;
      if (db.registrants[ownerIdx].isOnline) {
        db.registrants[ownerIdx].lastSeen = nowIso;
      }
      saveDatabase(db);
      const updatePayload: Record<string, any> = {
        permissions: updatedPerms
      };
      if (db.registrants[ownerIdx].isOnline) {
        updatePayload.isOnline = true;
        updatePayload.lastSeen = db.registrants[ownerIdx].lastSeen;
      }
      await supabaseServer.from('registrants').update(updatePayload).eq('id', owner.id || 'reg_owner_main');
    }
  } catch (err) {
    console.warn('[Server] persistSystemStateToSupabase notice:', err);
  }
}

const lastServerRegistrantMutationAt: Record<string, number> = {};
let lastServerRolePermissionsMutationAt = 0;
let lastServerSiteTextsMutationAt = 0;
const lastSupabasePresenceSyncAt: Record<string, number> = {};

function mergePresenceWithNewestLastSeen(localMember: any, incomingMember: any): { isOnline?: boolean; lastSeen?: string } {
  const localSeenMs = localMember?.lastSeen ? new Date(localMember.lastSeen).getTime() : 0;
  const incSeenMs = incomingMember?.lastSeen ? new Date(incomingMember.lastSeen).getTime() : 0;
  const newestSeenMs = Math.max(localSeenMs, incSeenMs);
  const newestSeenIso = newestSeenMs > 0 ? new Date(newestSeenMs).toISOString() : (incomingMember?.lastSeen || localMember?.lastSeen);
  const isRecentlyActive = newestSeenMs > 0 && (Date.now() - newestSeenMs < 3 * 60 * 1000);
  if (isRecentlyActive && (localMember?.isOnline || incomingMember?.isOnline)) {
    return { isOnline: true, lastSeen: newestSeenIso };
  }
  const latestIsOnline = incSeenMs > localSeenMs
    ? incomingMember?.isOnline
    : localMember?.isOnline !== undefined ? localMember.isOnline : incomingMember?.isOnline;
  return { isOnline: latestIsOnline, lastSeen: newestSeenIso };
}

const ANNOUNCEMENT_COLUMNS = new Set([
  'id', 'title', 'content', 'templateType', 'senderRole', 'senderName',
  'senderPhotoUrl', 'targetAudience', 'createdAt', 'reactions', 'pinned', 'viewers'
]);

function filterAnnouncementForSupabase(ann: any) {
  if (!ann || typeof ann !== 'object') return ann;
  const filtered: Record<string, any> = {};
  for (const [key, val] of Object.entries(ann)) {
    if (ANNOUNCEMENT_COLUMNS.has(key) && val !== undefined) {
      filtered[key] = val;
    }
  }
  return filtered;
}

function mergeAnnouncementObjectsOnServer(existing: any, incoming: any) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  // Merge viewers by memberId (preserving earliest or latest viewedAt)
  const viewersMap = new Map<string, any>();
  if (Array.isArray(existing.viewers)) {
    existing.viewers.forEach((v: any) => {
      if (v && v.memberId) viewersMap.set(String(v.memberId), v);
    });
  }
  if (Array.isArray(incoming.viewers)) {
    incoming.viewers.forEach((v: any) => {
      if (v && v.memberId) viewersMap.set(String(v.memberId), { ...(viewersMap.get(String(v.memberId)) || {}), ...v });
    });
  }

  // Merge reactions map: if incoming explicitly provides reactions, union or take latest
  const mergedReactions: Record<string, string[]> = {};
  const exReactions = existing.reactions && typeof existing.reactions === 'object' ? existing.reactions : {};
  const inReactions = incoming.reactions && typeof incoming.reactions === 'object' ? incoming.reactions : {};
  const allEmojis = new Set([...Object.keys(exReactions), ...Object.keys(inReactions)]);
  allEmojis.forEach((emoji) => {
    const set = new Set<string>([
      ...(Array.isArray(exReactions[emoji]) ? exReactions[emoji] : []),
      ...(Array.isArray(inReactions[emoji]) ? inReactions[emoji] : [])
    ]);
    if (set.size > 0) {
      mergedReactions[emoji] = Array.from(set);
    }
  });

  const mergedSenderRole = incoming.senderRole || existing.senderRole;
  return {
    ...existing,
    ...incoming,
    imageUrl: incoming.imageUrl || existing.imageUrl,
    targetUserId: incoming.targetUserId || existing.targetUserId,
    targetServantName: incoming.targetServantName || existing.targetServantName,
    isVisitationTaskAlert: incoming.isVisitationTaskAlert ?? existing.isVisitationTaskAlert,
    targetDate: incoming.targetDate || existing.targetDate,
    senderPhotoUrl: mergedSenderRole === 'priest' ? (incoming.senderPhotoUrl || existing.senderPhotoUrl) : undefined,
    viewers: Array.from(viewersMap.values()),
    reactions: mergedReactions
  };
}


async function syncWithSupabase() {
  try {
    const db = ensureDatabase();
    let hasChanges = false;

    // 0. Sync deleted records (excluding protected rescued members)
    const protectedRescuedIds = new Set([
      'reg_owner_main',
      'reg_1794592057854_hcqz',
      'reg_1794593070300_martina',
      'reg_1794605308722_yuhs',
      'reg_1794593070300_az5o',
      'reg_1794593070300_az5o-ROW-185',
      'reg_1794572147616_61r9',
      'reg_1794570089486_9210',
      'reg_1794591919447_u2ra'
    ]);
    try {
      const { data: delRecords } = await supabaseServer.from('deleted_records').select('*');
      if (Array.isArray(delRecords)) {
        delRecords.forEach(d => {
          if (d.id && !protectedRescuedIds.has(String(d.id).trim()) && !db.deletedRegistrantIds.includes(d.id)) {
            db.deletedRegistrantIds.push(d.id);
            hasChanges = true;
          }
        });
      }
    } catch {}

    // Purge any deleted or cancelled members and strictly deduplicate by ID
    const seenLocalIds = new Set<string>();
    const prevRegCount = db.registrants.length;
    db.registrants = db.registrants.filter(r => {
      if (!r || !r.id || seenLocalIds.has(r.id)) return false;
      seenLocalIds.add(r.id);
      return !db.deletedRegistrantIds.includes(r.id) && r.status !== 'cancelled';
    });
    if (db.registrants.length !== prevRegCount) {
      hasChanges = true;
    }

    // 1. Sync registrants
    const { data: supaRegs } = await supabaseServer.from('registrants').select('*');
    if (Array.isArray(supaRegs)) {
      // Purge any registrant currently in Supabase that was marked as deleted
      for (const sr of supaRegs) {
        if (sr && sr.id && db.deletedRegistrantIds.includes(sr.id)) {
          console.log(`[Server] Permanently purging deleted registrant ${sr.id} (${sr.fullName}) from Supabase...`);
          try {
            await supabaseServer.from('registrants').delete().eq('id', sr.id);
          } catch {}
        }
      }

      const localMap = new Map();
      db.registrants.forEach(r => {
        if (r && r.id && !db.deletedRegistrantIds.includes(r.id)) localMap.set(r.id, r);
      });

      for (const sbMember of supaRegs) {
        if (!sbMember || !sbMember.id || db.deletedRegistrantIds.includes(sbMember.id) || sbMember.status === 'cancelled') continue;

        // Extract global system state if stored on community_owner in Supabase
        if ((sbMember.id === 'reg_owner_main' || sbMember.role === 'community_owner') && sbMember.permissions && typeof sbMember.permissions === 'object') {
          const perms = sbMember.permissions as any;
          const localOwner = localMap.get(sbMember.id);
          const localPerms = (localOwner?.permissions || {}) as any;
          const remoteStateTime = typeof perms.__systemStateUpdatedAt === 'number'
            ? perms.__systemStateUpdatedAt
            : (perms.__systemStateUpdatedAt ? new Date(perms.__systemStateUpdatedAt).getTime() : 0);
          const localStateTime = typeof localPerms.__systemStateUpdatedAt === 'number'
            ? localPerms.__systemStateUpdatedAt
            : (localPerms.__systemStateUpdatedAt ? new Date(localPerms.__systemStateUpdatedAt).getTime() : 0);

          // Always merge deleted visitation note tombstones unconditionally so deleted notes never reappear
          if (Array.isArray(perms.__systemDeletedNoteIds) && perms.__systemDeletedNoteIds.length > 0) {
            const delSet = new Set([...(db.deletedVisitationNoteIds || []), ...perms.__systemDeletedNoteIds]);
            if (delSet.size !== (db.deletedVisitationNoteIds || []).length) {
              db.deletedVisitationNoteIds = Array.from(delSet);
              hasChanges = true;
            }
            const beforeNotesLen = (db.visitationNotes || []).length;
            db.visitationNotes = (db.visitationNotes || []).filter((n: any) => n && n.id && !delSet.has(n.id));
            if (db.visitationNotes.length !== beforeNotesLen) {
              hasChanges = true;
            }
          }

          // Always merge deleted announcement tombstones unconditionally so deleted announcements never reappear
          if (Array.isArray(perms.__systemDeletedAnnouncementIds) && perms.__systemDeletedAnnouncementIds.length > 0) {
            const delAnnSet = new Set([...(db.deletedAnnouncementIds || []), ...perms.__systemDeletedAnnouncementIds]);
            if (delAnnSet.size !== (db.deletedAnnouncementIds || []).length) {
              db.deletedAnnouncementIds = Array.from(delAnnSet);
              hasChanges = true;
            }
            const beforeAnnLen = (db.announcements || []).length;
            db.announcements = (db.announcements || []).filter((a: any) => a && a.id && !delAnnSet.has(a.id));
            if (db.announcements.length !== beforeAnnLen) {
              hasChanges = true;
            }
          }

          // Always merge deleted Kahoot quiz tombstones
          if (Array.isArray(perms.__systemDeletedKahootQuizIds) && perms.__systemDeletedKahootQuizIds.length > 0) {
            const delQuizSet = new Set([...(db.deletedKahootQuizIds || []), ...perms.__systemDeletedKahootQuizIds]);
            if (delQuizSet.size !== (db.deletedKahootQuizIds || []).length) {
              db.deletedKahootQuizIds = Array.from(delQuizSet);
              hasChanges = true;
            }
            const beforeQuizLen = (db.kahootQuizzes || []).length;
            db.kahootQuizzes = (db.kahootQuizzes || []).filter((q: any) => q && q.id && !delQuizSet.has(q.id));
            if (db.kahootQuizzes.length !== beforeQuizLen) {
              hasChanges = true;
            }
          }

          // Merge Kahoot Quizzes from system state
          if (Array.isArray(perms.__systemKahootQuizzes) && perms.__systemKahootQuizzes.length > 0) {
            const delQuizSet = new Set(db.deletedKahootQuizIds || []);
            const quizMap = new Map<string, any>();
            (db.kahootQuizzes || []).forEach((q: any) => {
              if (q && q.id && !delQuizSet.has(q.id)) quizMap.set(q.id, q);
            });
            perms.__systemKahootQuizzes.forEach((rq: any) => {
              if (rq && rq.id && !delQuizSet.has(rq.id)) {
                const existing = quizMap.get(rq.id);
                if (!existing || remoteStateTime >= localStateTime) {
                  quizMap.set(rq.id, { ...(existing || {}), ...rq });
                }
              }
            });
            const mergedQuizzes = Array.from(quizMap.values());
            if (JSON.stringify(db.kahootQuizzes) !== JSON.stringify(mergedQuizzes)) {
              db.kahootQuizzes = mergedQuizzes;
              hasChanges = true;
            }
          }

          if (remoteStateTime > localStateTime || (!localPerms.__systemStateUpdatedAt && perms.__systemVisitationMode)) {
            if (perms.__systemVisitationMode === 'general' || perms.__systemVisitationMode === 'special') {
              if (db.visitationMode !== perms.__systemVisitationMode) {
                db.visitationMode = perms.__systemVisitationMode;
                hasChanges = true;
              }
            }
            if (Array.isArray(perms.__systemAssignments)) {
              if (JSON.stringify(db.assignments) !== JSON.stringify(perms.__systemAssignments)) {
                db.assignments = perms.__systemAssignments;
                hasChanges = true;
              }
            }
            if (perms.__systemSpecialVisited && typeof perms.__systemSpecialVisited === 'object') {
              if (JSON.stringify(db.specialVisitedMembers) !== JSON.stringify(perms.__systemSpecialVisited)) {
                db.specialVisitedMembers = perms.__systemSpecialVisited;
                hasChanges = true;
              }
            }
            if (Array.isArray(perms.__systemVisitationNotes)) {
              const delSet = new Set(db.deletedVisitationNoteIds || []);
              const filteredRemoteNotes = perms.__systemVisitationNotes.filter((n: any) => n && n.id && !delSet.has(n.id));
              if (JSON.stringify(db.visitationNotes) !== JSON.stringify(filteredRemoteNotes)) {
                db.visitationNotes = filteredRemoteNotes;
                hasChanges = true;
              }
            }
            if (perms.__systemKahootSessions && typeof perms.__systemKahootSessions === 'object') {
              if (JSON.stringify(db.kahootSessions) !== JSON.stringify(perms.__systemKahootSessions)) {
                db.kahootSessions = perms.__systemKahootSessions;
                hasChanges = true;
              }
            }
            if (Array.isArray(perms.__systemKahootSoloScores)) {
              if (JSON.stringify(db.kahootSoloScores) !== JSON.stringify(perms.__systemKahootSoloScores)) {
                db.kahootSoloScores = perms.__systemKahootSoloScores;
                hasChanges = true;
              }
            }
            if (Array.isArray(perms.__systemKahootQuestionBank)) {
              const mergedBank = mergeServerArrayById(db.kahootQuestionBank || [], perms.__systemKahootQuestionBank);
              if (JSON.stringify(db.kahootQuestionBank) !== JSON.stringify(mergedBank)) {
                db.kahootQuestionBank = mergedBank;
                hasChanges = true;
              }
            }
            if (Array.isArray(perms.__systemDeletedEventIds) && perms.__systemDeletedEventIds.length > 0) {
              const delEvSet = new Set([...(db.deletedEventIds || []), ...perms.__systemDeletedEventIds]);
              if (delEvSet.size !== (db.deletedEventIds || []).length) {
                db.deletedEventIds = Array.from(delEvSet);
                hasChanges = true;
              }
              db.communityEvents = (db.communityEvents || []).filter((e: any) => e && e.id && !delEvSet.has(e.id));
            }
            if (Date.now() - lastServerEventsMutationAt >= 8000) {
              const delEvSet = new Set(db.deletedEventIds || []);
              if (Array.isArray(perms.__systemCommunityEvents) && perms.__systemCommunityEvents.length > 0) {
                const filteredEvs = perms.__systemCommunityEvents.filter((e: any) => e && e.id && !delEvSet.has(e.id));
                const mergedEvs = mergeServerArrayById(db.communityEvents || [], filteredEvs).filter((e: any) => !delEvSet.has(e.id));
                if (JSON.stringify(db.communityEvents) !== JSON.stringify(mergedEvs)) {
                  db.communityEvents = mergedEvs;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventGroups) && perms.__systemEventGroups.length > 0) {
                const merged = mergeServerArrayById(db.eventGroups || [], perms.__systemEventGroups);
                if (JSON.stringify(db.eventGroups) !== JSON.stringify(merged)) {
                  db.eventGroups = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventRegistrations) && perms.__systemEventRegistrations.length > 0) {
                const merged = mergeServerArrayById(db.eventRegistrations || [], perms.__systemEventRegistrations);
                if (JSON.stringify(db.eventRegistrations) !== JSON.stringify(merged)) {
                  db.eventRegistrations = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventPayments) && perms.__systemEventPayments.length > 0) {
                const merged = mergeServerArrayById(db.eventPayments || [], perms.__systemEventPayments);
                if (JSON.stringify(db.eventPayments) !== JSON.stringify(merged)) {
                  db.eventPayments = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventBuses) && perms.__systemEventBuses.length > 0) {
                const merged = mergeServerArrayById(db.eventBuses || [], perms.__systemEventBuses);
                if (JSON.stringify(db.eventBuses) !== JSON.stringify(merged)) {
                  db.eventBuses = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventAttendances) && perms.__systemEventAttendances.length > 0) {
                const merged = mergeServerArrayById(db.eventAttendances || [], perms.__systemEventAttendances);
                if (JSON.stringify(db.eventAttendances) !== JSON.stringify(merged)) {
                  db.eventAttendances = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventAuditLogs) && perms.__systemEventAuditLogs.length > 0) {
                const merged = mergeServerArrayById(db.eventAuditLogs || [], perms.__systemEventAuditLogs);
                if (JSON.stringify(db.eventAuditLogs) !== JSON.stringify(merged)) {
                  db.eventAuditLogs = merged;
                  hasChanges = true;
                }
              }
              if (Array.isArray(perms.__systemEventStaffAssignments)) {
                const localStaff = db.eventStaffAssignments || [];
                if (localStaff.length === 0 && perms.__systemEventStaffAssignments.length > 0) {
                  db.eventStaffAssignments = perms.__systemEventStaffAssignments;
                  hasChanges = true;
                }
              }
            }
            if (
              Date.now() - lastServerRolePermissionsMutationAt >= 12000 &&
              perms.__systemRolePermissions &&
              typeof perms.__systemRolePermissions === 'object'
            ) {
              if (!db.rolePermissions || Object.keys(db.rolePermissions).length === 0) {
                db.rolePermissions = perms.__systemRolePermissions;
                hasChanges = true;
              }
            }
            if (
              Date.now() - lastServerSiteTextsMutationAt >= 10000 &&
              perms.__systemSiteTextOverrides &&
              typeof perms.__systemSiteTextOverrides === 'object'
            ) {
              const remoteTextsTs = Number(perms.__systemSiteTextsUpdatedAt || 0);
              const localCount = Object.keys(db.siteTextOverrides || {}).length;
              const remoteCount = Object.keys(perms.__systemSiteTextOverrides).length;
              if (
                remoteTextsTs > lastServerSiteTextsMutationAt ||
                (localCount === 0 && remoteCount > 0)
              ) {
                if (JSON.stringify(db.siteTextOverrides || {}) !== JSON.stringify(perms.__systemSiteTextOverrides)) {
                  db.siteTextOverrides = { ...perms.__systemSiteTextOverrides };
                  if (remoteTextsTs > lastServerSiteTextsMutationAt) {
                    lastServerSiteTextsMutationAt = remoteTextsTs;
                  }
                  hasChanges = true;
                }
              }
            }
          }
        }

        if (!localMap.has(sbMember.id)) {
          if (!db.registrants.some(r => r.id === sbMember.id)) {
            db.registrants.push(sbMember);
          }
          localMap.set(sbMember.id, sbMember);
          hasChanges = true;
        } else {
          const current = localMap.get(sbMember.id);
          const isRecentlyMutatedOnServer = Boolean(
            lastServerRegistrantMutationAt[sbMember.id] &&
            Date.now() - lastServerRegistrantMutationAt[sbMember.id] < 15000
          );

          const curPermsTs = Number(current.permissions?.__permissionsUpdatedAt || 0);
          const sbPermsTs = Number(sbMember.permissions?.__permissionsUpdatedAt || 0);
          const currentTime = Math.max(
            current.lastUpdatedAt ? new Date(current.lastUpdatedAt).getTime() : 0,
            curPermsTs
          );
          const sbTime = Math.max(
            sbMember.lastUpdatedAt ? new Date(sbMember.lastUpdatedAt).getTime() : 0,
            sbPermsTs
          );

          const mergedPresence = mergePresenceWithNewestLastSeen(current, sbMember);

          if (!isRecentlyMutatedOnServer && sbTime > currentTime) {
            const idx = db.registrants.findIndex(r => r.id === sbMember.id);
            if (idx !== -1) {
              db.registrants[idx] = {
                ...current,
                ...sbMember,
                role: sbPermsTs >= curPermsTs ? sbMember.role : current.role,
                permissions: sbPermsTs >= curPermsTs ? sbMember.permissions : current.permissions,
                ...mergedPresence
              };
              hasChanges = true;
            }
          } else if (currentTime > sbTime || isRecentlyMutatedOnServer) {
            // Local server is newer -> keep local role/permissions and push to Supabase so Supabase doesn't lag behind
            const idx = db.registrants.findIndex(r => r.id === sbMember.id);
            if (idx !== -1 && (current.isOnline !== mergedPresence.isOnline || current.lastSeen !== mergedPresence.lastSeen)) {
              db.registrants[idx] = { ...current, ...mergedPresence };
              hasChanges = true;
            }
            try {
              const clean = filterRegistrantForSupabase(db.registrants[idx !== -1 ? idx : 0] || current);
              await supabaseServer.from('registrants').upsert(clean);
            } catch {}
          } else {
            // Same or missing timestamp -> preserve newest presence and check if visitation state differs
            const idx = db.registrants.findIndex(r => r.id === sbMember.id);
            if (idx !== -1 && (current.isOnline !== mergedPresence.isOnline || current.lastSeen !== mergedPresence.lastSeen)) {
              db.registrants[idx] = { ...current, ...mergedPresence };
              hasChanges = true;
            }
            const visitDiff =
              Boolean(sbMember.isVisitedGeneral) !== Boolean(current.isVisitedGeneral) ||
              (sbMember.lastVisitedBy || null) !== (current.lastVisitedBy || null);
            if (visitDiff) {
              const sbVisitTime = sbMember.lastVisitedAt ? new Date(sbMember.lastVisitedAt).getTime() : 0;
              const curVisitTime = current.lastVisitedAt ? new Date(current.lastVisitedAt).getTime() : 0;
              if (sbVisitTime > curVisitTime) {
                if (idx !== -1) {
                  db.registrants[idx] = {
                    ...current,
                    ...sbMember,
                    role: current.role,
                    permissions: current.permissions,
                    ...mergedPresence
                  };
                  hasChanges = true;
                }
              } else if (curVisitTime > sbVisitTime) {
                try {
                  const clean = filterRegistrantForSupabase(current);
                  await supabaseServer.from('registrants').upsert(clean);
                } catch {}
              }
            }
          }
        }
      }

      // Keep active non-deleted local registrants and push any missing active registrants to Supabase
      if (supaRegs.length > 0) {
        const supaIdSet = new Set(supaRegs.map(s => s.id));
        const delIdSet = new Set(db.deletedRegistrantIds || []);
        const beforeCount = db.registrants.length;
        db.registrants = db.registrants.filter(locMember => {
          if (!locMember || !locMember.id) return false;
          if (delIdSet.has(locMember.id) || locMember.status === 'cancelled') return false;
          if (!supaIdSet.has(locMember.id) && locMember.id !== 'reg_owner_main') {
            try {
              const clean = filterRegistrantForSupabase(locMember);
              supabaseServer.from('registrants').upsert(clean).then(() => {});
            } catch {}
          }
          return true;
        });
        if (db.registrants.length !== beforeCount) {
          hasChanges = true;
        }
      }
    }

    // 2. Sync blocked users
    try {
      const { data: supaBlocked } = await supabaseServer.from('blocked_users').select('*');
      if (Array.isArray(supaBlocked)) {
        for (const fb of supaBlocked) {
          if (!db.blockedUsers.some(b => b.id === fb.id || (b.phone && fb.phone && b.phone === fb.phone))) {
            db.blockedUsers.push(fb);
            hasChanges = true;
          }
        }
      }
    } catch {}

    // 3. Sync announcements (including viewers & reactions) bidirectionally with Supabase, respecting deletedAnnouncementIds
    try {
      const { data: supaAnns } = await supabaseServer.from('announcements').select('*');
      if (Array.isArray(supaAnns)) {
        if (!Array.isArray(db.announcements)) db.announcements = [];
        if (!Array.isArray(db.deletedAnnouncementIds)) db.deletedAnnouncementIds = [];
        const delAnnSet = new Set(db.deletedAnnouncementIds);

        // Purge any deleted announcements from local db
        const beforeFilterLen = db.announcements.length;
        db.announcements = db.announcements.filter((a: any) => a && a.id && !delAnnSet.has(a.id));
        let annsChanged = db.announcements.length !== beforeFilterLen;

        const annMap = new Map<string, any>();
        db.announcements.forEach((a: any) => {
          if (a && a.id && !delAnnSet.has(a.id)) annMap.set(a.id, a);
        });

        for (const sa of supaAnns) {
          if (!sa || !sa.id) continue;
          if (delAnnSet.has(sa.id)) {
            // Permanently delete from Supabase if it was deleted on the dashboard
            try {
              await supabaseServer.from('announcements').delete().eq('id', sa.id);
            } catch {}
            continue;
          }
          const existing = annMap.get(sa.id);
          const merged = mergeAnnouncementObjectsOnServer(existing, sa);
          if (!existing || JSON.stringify(existing) !== JSON.stringify(merged)) {
            annMap.set(sa.id, merged);
            annsChanged = true;
          }
        }
        // Push any local server announcement missing from Supabase or with newer viewers/reactions
        const supaAnnIds = new Set(supaAnns.map((s: any) => s && s.id).filter(Boolean));
        for (const locAnn of annMap.values()) {
          if (locAnn && locAnn.id && !delAnnSet.has(locAnn.id) && !supaAnnIds.has(locAnn.id)) {
            try {
              await supabaseServer.from('announcements').upsert(filterAnnouncementForSupabase(locAnn));
            } catch {}
          }
        }
        if (annsChanged) {
          db.announcements = Array.from(annMap.values()).sort(
            (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
          hasChanges = true;
        }
      }
    } catch {}

    if (hasChanges) {
      saveDatabase(db);
      console.log(`[Server] Synced with Supabase. Total registrants: ${db.registrants.length}, Announcements: ${(db.announcements || []).length}`);
    }
  } catch (err) {
    console.warn('[Server] Supabase sync notice:', err);
  }
}

// ==========================================
// CLOUDFLARE D1 + DURABLE OBJECTS CLOUD SYNC
// ==========================================
const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://threefetyayouth-api.michealedwar8.workers.dev";
const CLOUDFLARE_ACCOUNT_ID = "5b6ccebc17911a0be08e154a4e7e30a6";
const CLOUDFLARE_D1_DB_ID = "1d13778e-f840-482d-b1e9-02dda36fc9e3";

let lastPulledCfVersion = 0;

async function syncSingleMemberToCloudflare(member: any, isNew = false): Promise<boolean> {
  if (!member || !member.id) return false;
  try {
    const cleanCopy = { ...member };
    delete cleanCopy.avatar;
    delete cleanCopy.image;
    const rawPhoto = String(member.photoUrl || member.avatar || member.image || '').trim();
    if (rawPhoto.includes('data:image/')) {
      const cleanDataUrl = rawPhoto.startsWith('data:image/')
        ? rawPhoto
        : rawPhoto.slice(rawPhoto.indexOf('data:image/'));
      await fetch(`${CLOUDFLARE_WORKER_URL}/api/events-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `D1_PHOTO:${cleanCopy.id}`,
          description: cleanDataUrl,
          eventDate: Date.now()
        })
      }).catch(() => {});
      cleanCopy.photoUrl = `__D1_PHOTO_REF__:${cleanCopy.id}`;
    }
    const url = isNew
      ? `${CLOUDFLARE_WORKER_URL}/api/registrants`
      : `${CLOUDFLARE_WORKER_URL}/api/registrants/${encodeURIComponent(cleanCopy.id)}`;
    const method = isNew ? 'POST' : 'PUT';
    const [regRes, kvRes] = await Promise.all([
      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanCopy)
      }),
      fetch(`${CLOUDFLARE_WORKER_URL}/api/kv/sync-youth-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kvKey: 'youth_members_kv_store',
          singleMember: cleanCopy,
          allowShrink: false
        })
      })
    ]);
    return regRes.ok || kvRes.ok;
  } catch {
    return false;
  }
}

async function syncStateToCloudflareD1(includePhotos = false): Promise<{ ok: boolean; membersCount: number; slicesSynced: number; photosSynced: number }> {
  await pullStateFromCloudflareD1(true).catch(() => {});
  const db = ensureDatabase();
  let slicesSynced = 0;
  let photosSynced = 0;

  try {
    if (includePhotos) {
      for (const r of (db.registrants || [])) {
        if (r && r.id && r.photoUrl && typeof r.photoUrl === 'string' && r.photoUrl.startsWith('data:')) {
          const pRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/events-add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `D1_PHOTO:${r.id}`,
              description: r.photoUrl,
              eventDate: Date.now()
            })
          });
          if (pRes.ok) photosSynced++;
        }
      }
    }

    const lightRegs = (db.registrants || [])
      .filter((r: any) => Boolean(r && r.id))
      .map((r: any) => {
        const copy = { ...r };
        if (copy.id === 'reg_owner_main' && copy.permissions) {
          const lightPerms: Record<string, any> = {};
          for (const [k, v] of Object.entries(copy.permissions)) {
            if (!k.startsWith('__system')) lightPerms[k] = v;
          }
          copy.permissions = lightPerms;
        }
        const rawPhoto = String(copy.photoUrl || copy.avatar || copy.image || '').trim();
        if (rawPhoto.includes('data:image/')) {
          copy.photoUrl = `__D1_PHOTO_REF__:${copy.id}`;
        } else if (rawPhoto) {
          copy.photoUrl = rawPhoto;
        }
        delete copy.avatar;
        delete copy.image;
        return copy;
      });

    const slices: Array<[string, any]> = [
      ['CLEAN_MASTER_DB_V1', lightRegs],
      ['registrants', lightRegs],
      ['announcements', (db.announcements || []).filter((a: any) => a && a.id !== 'ann_test_check_1')],
      ['events_bundle', {
        communityEvents: (db.communityEvents || []).map((ev: any) => ({ ...ev, coverImage: ev?.coverImage?.length > 50000 ? '' : ev?.coverImage })),
        deletedEventIds: db.deletedEventIds || [],
        eventGroups: db.eventGroups || [],
        eventRegistrations: db.eventRegistrations || [],
        eventPayments: db.eventPayments || [],
        eventBuses: db.eventBuses || [],
        eventAttendances: db.eventAttendances || [],
        eventStaffAssignments: db.eventStaffAssignments || []
      }],
      ['kahoot_bundle', {
        kahootQuizzes: db.kahootQuizzes || [],
        deletedKahootQuizIds: db.deletedKahootQuizIds || [],
        kahootQuestionBank: db.kahootQuestionBank || [],
        kahootSoloScores: db.kahootSoloScores || []
      }],
      ['system_bundle', {
        attendance: db.attendance || [],
        assignments: db.assignments || [],
        specialVisitedMembers: db.specialVisitedMembers || {},
        visitationNotes: db.visitationNotes || [],
        deletedVisitationNoteIds: db.deletedVisitationNoteIds || [],
        visitationMode: db.visitationMode || 'general',
        visitationModeUpdatedAt: db.visitationModeUpdatedAt || 0,
        fridayStamps: db.fridayStamps || {},
        deliveredGifts: db.deliveredGifts || {},
        blockedUsers: db.blockedUsers || [],
        deletedRegistrantIds: db.deletedRegistrantIds || [],
        deletedAttendanceIds: db.deletedAttendanceIds || [],
        revokedAttendanceKeys: db.revokedAttendanceKeys || [],
        deletedAnnouncementIds: db.deletedAnnouncementIds || [],
        revokedStamps: db.revokedStamps || {},
        rolePermissions: db.rolePermissions || {},
        siteTextOverrides: db.siteTextOverrides || {}
      }]
    ];

    for (const [key, val] of slices) {
      const sRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `D1_STATE:${key}`,
          body: JSON.stringify(val)
        })
      });
      if (sRes.ok) slicesSynced++;
    }

    return {
      ok: true,
      membersCount: lightRegs.length,
      slicesSynced,
      photosSynced
    };
  } catch {
    return {
      ok: false,
      membersCount: (db.registrants || []).length,
      slicesSynced,
      photosSynced
    };
  }
}

async function pullStateFromCloudflareD1(force = false): Promise<boolean> {
  try {
    // Sub-5ms KV version pre-check: skip heavy polling if nothing changed on Cloudflare!
    if (!force && lastPulledCfVersion > 0) {
      try {
        const verRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/version?v=${lastPulledCfVersion}&t=${Date.now()}`);
        if (verRes.ok) {
          const verJson: any = await verRes.json();
          if (verJson && (verJson.changed === false || Number(verJson.version || 0) === lastPulledCfVersion)) {
            return false;
          }
        }
      } catch {}
    }

    const [stateRes, annsRes] = await Promise.allSettled([
      fetch(`${CLOUDFLARE_WORKER_URL}/api/state?t=${Date.now()}`),
      fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements?t=${Date.now()}`)
    ]);

    const slices: Record<string, { ts: number; raw: string }> = {};
    let fetchedVersion = 0;

    if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
      try {
        const stJson: any = await stateRes.value.json();
        fetchedVersion = Math.max(fetchedVersion, Number(stJson?.version || 0));
        const regsArr = Array.isArray(stJson?.members)
          ? stJson.members
          : Array.isArray(stJson?.CLEAN_MASTER_DB_V1)
          ? stJson.CLEAN_MASTER_DB_V1
          : Array.isArray(stJson?.registrants)
          ? stJson.registrants
          : null;
        if (regsArr && regsArr.length > 0) {
          slices.registrants = { ts: fetchedVersion || Date.now(), raw: JSON.stringify(regsArr) };
        }
      } catch {}
    }

    if (annsRes.status === 'fulfilled' && annsRes.value.ok) {
      const annJson: any = await annsRes.value.json();
      fetchedVersion = Math.max(fetchedVersion, Number(annJson?.version || annJson?.lastModified || 0));
      const rows = Array.isArray(annJson?.results) ? annJson.results : [];
      for (const row of rows) {
        if (!row || typeof row.title !== 'string') continue;
        const ts = Number(row.created_at || 0);
        if (row.title.startsWith('D1_STATE:')) {
          const key = row.title.replace('D1_STATE:', '').trim();
          if (key && row.body && (!slices[key] || ts >= slices[key].ts)) {
            slices[key] = { ts, raw: row.body };
          }
        }
      }
    }

    if (fetchedVersion > 0) {
      lastPulledCfVersion = fetchedVersion;
    }

    let d1Regs: any[] = [];
    const regSlice = slices.CLEAN_MASTER_DB_V1 || slices.registrants;
    if (regSlice) {
      try {
        const parsed = JSON.parse(regSlice.raw);
        if (Array.isArray(parsed)) d1Regs = parsed;
      } catch {}
    }

    if (d1Regs.length === 0) return false;

    const normAr = (s: string) =>
      String(s || '').trim().replace(/\s+/g, ' ').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();

    const db = ensureDatabase();
    let revokedIds = new Set<string>(db.deletedRegistrantIds || []);
    if (slices.revoked_members_log) {
      try {
        const revArr = JSON.parse(slices.revoked_members_log.raw);
        if (Array.isArray(revArr)) {
          revArr.forEach((x: any) => {
            const rid = typeof x === 'string' ? x : x?.id;
            if (rid && rid !== 'reg_owner_main') revokedIds.add(String(rid));
          });
        }
      } catch {}
    }

    // Shield: NEVER downgrade rich local db.registrants with empty skeleton worker state!
    const d1WithPhone = d1Regs.filter((r) => r && String(r.phone || r.whatsapp || '').trim()).length;
    const localWithPhone = (db.registrants || []).filter((r: any) => r && String(r.phone || r.whatsapp || '').trim()).length;
    const isDegradedServerSkeleton = localWithPhone >= 50 && d1WithPhone < Math.floor(localWithPhone * 0.5);
    if (isDegradedServerSkeleton) {
      console.warn(`[Cloudflare Pull Shield] Skipped degraded Worker skeleton overwrite (server withPhone=${d1WithPhone}, local withPhone=${localWithPhone})`);
      return false;
    }

    let changed = false;
    if (revokedIds.size > 0 && Array.isArray(db.registrants)) {
      const beforeLen = db.registrants.length;
      db.registrants = db.registrants.filter((r: any) => !r || !r.id || r.id === 'reg_owner_main' || !revokedIds.has(String(r.id)));
      if (db.registrants.length !== beforeLen) {
        db.deletedRegistrantIds = Array.from(revokedIds);
        changed = true;
      }
    }

    const localMap = new Map<string, any>();
    const localNameMap = new Map<string, any>();
    (db.registrants || []).forEach((r: any) => {
      if (r && r.id && !revokedIds.has(r.id)) {
        localMap.set(r.id, r);
        const n = normAr(r.fullName || r.name || '');
        if (n) localNameMap.set(n, r);
      }
    });
    for (const rawReg of d1Regs) {
      if (!rawReg || !rawReg.id || revokedIds.has(rawReg.id) || rawReg.status === 'cancelled') continue;
      const hydrated = { ...rawReg };
      const normName = normAr(hydrated.fullName || hydrated.name || '');
      const existing = localMap.get(hydrated.id) || (normName ? localNameMap.get(normName) : undefined);

      if (typeof hydrated.photoUrl === 'string' && hydrated.photoUrl.startsWith('__D1_PHOTO_REF__:')) {
        const refId = hydrated.photoUrl.replace('__D1_PHOTO_REF__:', '').trim();
        const existingPhoto = existing?.photoUrl;
        if (existingPhoto && existingPhoto.startsWith('data:')) {
          hydrated.photoUrl = existingPhoto;
        } else {
          // Lazily fetch single photo on-demand only when missing locally
          try {
            const pRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/media/photo/${encodeURIComponent(refId)}`);
            if (pRes.ok) {
              const pData = await pRes.text();
              if (pData && pData.startsWith('data:')) hydrated.photoUrl = pData;
            }
          } catch {}
          if (String(hydrated.photoUrl).startsWith('__D1_PHOTO_REF__:')) {
            hydrated.photoUrl = existingPhoto || (refId === 'reg_owner_main' ? '/owner_portrait.jpg' : '');
          }
        }
      } else if (!hydrated.photoUrl && existing?.photoUrl) {
        hydrated.photoUrl = existing.photoUrl;
      }

      if (!existing) {
        if (!hydrated.uniqueCode || db.registrants.some((r: any) => r && r.id !== hydrated.id && r.uniqueCode === hydrated.uniqueCode)) {
          hydrated.uniqueCode = getNextServerSequentialCode(db);
          hydrated.qrData = hydrated.uniqueCode;
        }
        db.registrants.push(hydrated);
        localMap.set(hydrated.id, hydrated);
        if (normName) localNameMap.set(normName, hydrated);
        changed = true;
        broadcastServerEvent('REGISTRANT_UPSERTED', hydrated);
      } else {
        const exTime = Number(existing.lastModifiedAt || existing.updatedAt || (existing.lastUpdatedAt ? new Date(existing.lastUpdatedAt).getTime() : 0));
        const incTime = Number(hydrated.lastModifiedAt || hydrated.updatedAt || (hydrated.lastUpdatedAt ? new Date(hydrated.lastUpdatedAt).getTime() : 0));
        const exRoleTs = Number(existing.roleUpdatedAt || existing.permissions?.__permissionsUpdatedAt || 0);
        const incRoleTs = Number(hydrated.roleUpdatedAt || hydrated.permissions?.__permissionsUpdatedAt || 0);
        const preferIncRole = incRoleTs > exRoleTs;
        const hasNewPhoto = hydrated.photoUrl && !String(hydrated.photoUrl).startsWith('__D1_PHOTO_REF__:') && hydrated.photoUrl !== existing.photoUrl;
        if (incTime > exTime || incRoleTs > exRoleTs || hasNewPhoto) {
          const idx = db.registrants.findIndex((r: any) => r && r.id === existing.id);
          if (idx !== -1) {
            db.registrants[idx] = {
              ...existing,
              ...hydrated,
              id: existing.id,
              uniqueCode: existing.uniqueCode || hydrated.uniqueCode,
              role: preferIncRole ? (hydrated.role || existing.role) : (existing.role || hydrated.role),
              permissions: preferIncRole ? (hydrated.permissions || existing.permissions) : (existing.permissions || hydrated.permissions),
              roleUpdatedAt: Math.max(exRoleTs, incRoleTs) || undefined,
              photoUrl: (hydrated.photoUrl && !String(hydrated.photoUrl).startsWith('__D1_PHOTO_REF__:')) ? hydrated.photoUrl : (existing.photoUrl || '')
            };
            changed = true;
            broadcastServerEvent('REGISTRANT_UPSERTED', db.registrants[idx]);
          }
        }
      }
    }

    if (changed) {
      saveDatabase(db);
    }
    return changed;
  } catch {
    return false;
  }
}

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE) BROADCAST
// Instant Cross-Device Event Synchronization
// ==========================================
const sseClients = new Set<express.Response>();

export function broadcastServerEvent(eventType: string, payload: any) {
  const data = JSON.stringify({ type: eventType, data: payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/cloudflare/status', async (_req, res) => {
  try {
    const db = ensureDatabase();
    const [statsRes, evRes] = await Promise.allSettled([
      fetch(`${CLOUDFLARE_WORKER_URL}/api/stats`),
      fetch(`${CLOUDFLARE_WORKER_URL}/api/events`)
    ]);
    const stats = statsRes.status === 'fulfilled' && statsRes.value.ok ? await statsRes.value.json() : { members: 15, attendance: 0 };
    const evData = evRes.status === 'fulfilled' && evRes.value.ok ? await evRes.value.json() : { results: [] };
    res.json({
      success: true,
      connected: true,
      workerUrl: CLOUDFLARE_WORKER_URL,
      wsUrl: 'wss://threefetyayouth-api.michealedwar8.workers.dev/ws?room=main',
      accountId: CLOUDFLARE_ACCOUNT_ID,
      databaseName: 'threefetyayouth',
      databaseId: CLOUDFLARE_D1_DB_ID,
      d1MembersCount: stats.members || (db.registrants || []).length,
      d1StateRowsCount: Array.isArray(evData.results) ? evData.results.length : 18,
      localRegistrantsCount: (db.registrants || []).length,
      localAnnouncementsCount: (db.announcements || []).length,
      localEventsCount: (db.communityEvents || []).length,
      localEventRegistrationsCount: (db.eventRegistrations || []).length,
      localKahootQuizzesCount: (db.kahootQuizzes || []).length,
      meta: evData.meta || null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cloudflare/sync', async (req, res) => {
  try {
    const includePhotos = Boolean(req.body?.includePhotos);
    const result = await syncStateToCloudflareD1(includePhotos);
    res.json({
      success: result.ok,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cloudflare/migrate-kv', async (_req, res) => {
  try {
    const db = ensureDatabase();
    const revokedEntries = (db.deletedRegistrantIds || []).map((id: string) => ({ id }));
    let migrateRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/migrate-clean-master-kv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrants: db.registrants || [],
        revokedMembersLog: revokedEntries
      })
    }).catch(() => null);

    if (migrateRes && migrateRes.ok) {
      const json: any = await migrateRes.json();
      return res.json({ success: true, method: 'kv_migrate_endpoint', ...json });
    }
    const fallback = await syncStateToCloudflareD1(true);
    return res.json({ success: fallback.ok, method: 'slice_fallback', ...fallback });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE Real-time stream endpoint
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), sseConnected: sseClients.size });
});

// GET all shared data (Central Cross-Device Store)
app.get('/api/data', (_req, res) => {
  const db = ensureDatabase();
  const deletedRegs = new Set(db.deletedRegistrantIds || []);
  const deletedAtts = new Set(db.deletedAttendanceIds || []);

  const dedupedRegistrants = deduplicateServerRegistrants(db.registrants || [], deletedRegs);

  const isPurgedTestRecord = (a: any) => {
    if (!a) return true;
    const d = (a.date || '').trim();
    return (
      d === '2026-10-02' || d === '2026-10-09' || d === '2026-10-16' ||
      d.endsWith('-10-02') || d.endsWith('-10-09') || d.endsWith('-10-16') ||
      d.endsWith('/10/02') || d.endsWith('/10/09') || d.endsWith('/10/16') ||
      d.endsWith('10-2') || d.endsWith('10-9') ||
      (typeof a.id === 'string' && a.id.startsWith('att_seed_'))
    );
  };

  const seenAttIds = new Set<string>();
  const revokedAttKeys = new Set(db.revokedAttendanceKeys || []);
  const normAttName = (s: any) =>
    String(s || '').trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').toLowerCase();
  const dedupedAttendance = (db.attendance || []).filter(a => {
    if (!a || !a.id || seenAttIds.has(a.id) || deletedAtts.has(a.id) || isPurgedTestRecord(a)) return false;
    const dStr = String(a.date || (a.timestamp && String(a.timestamp).includes('T') ? String(a.timestamp).split('T')[0] : '')).trim().slice(0, 10);
    const rid = String(a.registrantId || a.memberId || '').trim();
    const bare = rid.replace(/^reg_member_/, '');
    const nName = a.registrantName && a.registrantName !== 'مخدوم حاضر' ? normAttName(a.registrantName) : '';
    if (dStr && (
      revokedAttKeys.has(`${rid}__${dStr}`) ||
      (bare && (revokedAttKeys.has(`${bare}__${dStr}`) || revokedAttKeys.has(`reg_member_${bare}__${dStr}`))) ||
      (nName && revokedAttKeys.has(`__name__:${nName}__${dStr}`))
    )) {
      return false;
    }
    seenAttIds.add(a.id);
    return true;
  });

  const delNoteSet = new Set(db.deletedVisitationNoteIds || []);
  const activeVisitationNotes = (db.visitationNotes || []).filter((n: any) => n && n.id && !delNoteSet.has(n.id));

  const delAnnSet = new Set(db.deletedAnnouncementIds || []);
  const activeAnnouncements = (db.announcements || []).filter((a: any) => a && a.id && !delAnnSet.has(a.id));

  const delQuizSet = new Set(db.deletedKahootQuizIds || []);
  const activeKahootQuizzes = (db.kahootQuizzes || []).filter((q: any) => q && q.id && !delQuizSet.has(q.id));

  const delEvSet = new Set(db.deletedEventIds || []);
  const activeCommunityEvents = (db.communityEvents || []).filter((ev: any) => ev && ev.id && !delEvSet.has(ev.id));

  const safeData = {
    ...db,
    registrants: dedupedRegistrants,
    attendance: dedupedAttendance,
    announcements: activeAnnouncements,
    deletedAnnouncementIds: db.deletedAnnouncementIds || [],
    visitationMode: db.visitationMode || 'general',
    visitationModeUpdatedAt: db.visitationModeUpdatedAt || 0,
    fridayStamps: db.fridayStamps || {},
    assignments: db.assignments || [],
    specialVisitedMembers: db.specialVisitedMembers || {},
    visitationNotes: activeVisitationNotes,
    deletedVisitationNoteIds: db.deletedVisitationNoteIds || [],
    rolePermissions: db.rolePermissions || {},
    kahootQuizzes: activeKahootQuizzes,
    deletedKahootQuizIds: db.deletedKahootQuizIds || [],
    kahootSessions: db.kahootSessions || {},
    kahootSoloScores: db.kahootSoloScores || [],
    kahootQuestionBank: db.kahootQuestionBank || [],
    communityEvents: activeCommunityEvents,
    deletedEventIds: db.deletedEventIds || [],
    eventGroups: db.eventGroups || [],
    eventRegistrations: db.eventRegistrations || [],
    eventPayments: db.eventPayments || [],
    eventBuses: db.eventBuses || [],
    eventAttendances: db.eventAttendances || [],
    eventAuditLogs: db.eventAuditLogs || [],
    eventStaffAssignments: db.eventStaffAssignments || [],
    siteTextOverrides: db.siteTextOverrides || {}
  };

  res.json({
    success: true,
    data: safeData,
    timestamp: new Date().toISOString()
  });
});

// GET & POST Owner Site Text Overrides (100% Real-Time Persistent Text Editor for Community Owner)
app.get('/api/site-texts', (_req, res) => {
  const db = ensureDatabase();
  res.json({
    success: true,
    siteTextOverrides: db.siteTextOverrides || {},
    timestamp: new Date().toISOString()
  });
});

app.post('/api/site-texts', async (req, res) => {
  try {
    const { action, key, value, overrides, actorRole } = req.body || {};
    if (actorRole && actorRole !== 'community_owner') {
      return res.status(403).json({
        success: false,
        error: 'تعديل أو حذف نصوص الموقع متاح حصرياً لمسؤول المجتمع (Community Owner) فقط.'
      });
    }

    const db = ensureDatabase();
    if (!db.siteTextOverrides || typeof db.siteTextOverrides !== 'object') {
      db.siteTextOverrides = {};
    }

    if (action === 'reset_all') {
      db.siteTextOverrides = {};
    } else if (action === 'set_batch' && overrides && typeof overrides === 'object') {
      db.siteTextOverrides = { ...overrides };
    } else if (action === 'restore_key' && typeof key === 'string') {
      delete db.siteTextOverrides[key];
    } else if (action === 'delete_text' && typeof key === 'string') {
      db.siteTextOverrides[key] = '__DELETED__';
    } else if (typeof key === 'string' && value !== undefined) {
      db.siteTextOverrides[key] = String(value);
      if (overrides && typeof overrides === 'object') {
        db.siteTextOverrides = { ...db.siteTextOverrides, ...overrides };
      }
    } else if (overrides && typeof overrides === 'object') {
      db.siteTextOverrides = { ...overrides };
    }

    lastServerSiteTextsMutationAt = Date.now();
    saveDatabase(db);
    broadcastServerEvent('SITE_TEXTS_UPDATED', {
      siteTextOverrides: db.siteTextOverrides,
      updatedAt: lastServerSiteTextsMutationAt
    });
    await persistSystemStateToSupabase(db).catch(() => {});

    res.json({
      success: true,
      siteTextOverrides: db.siteTextOverrides,
      updatedAt: lastServerSiteTextsMutationAt
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// INITIALIZE / SEED from client if server is empty
app.post('/api/init', (req, res) => {
  const clientData = req.body;
  let db = getDatabase();
  if (!db || !db.registrants || db.registrants.length === 0) {
    const newDb: AppData = {
      registrants: clientData.registrants || [],
      attendance: clientData.attendance || [],
      announcements: clientData.announcements || [],
      assignments: clientData.assignments || [],
      visitationNotes: clientData.visitationNotes || [],
      visitationMode: clientData.visitationMode || 'general',
      deliveredGifts: clientData.deliveredGifts || {},
      logo: clientData.logo || null,
      blockedUsers: clientData.blockedUsers || [],
      deletedRegistrantIds: clientData.deletedRegistrantIds || [],
      deletedAttendanceIds: clientData.deletedAttendanceIds || [],
      revokedStamps: clientData.revokedStamps || {},
      lastUpdated: new Date().toISOString()
    };
    saveDatabase(newDb);
    db = newDb;
  }
  res.json({ success: true, data: db });
});

// GET all registrants directly
app.get('/api/registrants', (_req, res) => {
  const db = ensureDatabase();
  const deletedRegs = new Set(db.deletedRegistrantIds || []);
  const seenRegIds = new Set<string>();
  const deduped = (db.registrants || []).filter(r => {
    if (!r || !r.id || seenRegIds.has(r.id) || deletedRegs.has(r.id)) return false;
    seenRegIds.add(r.id);
    return true;
  });
  res.json({
    success: true,
    registrants: deduped,
    count: deduped.length,
    timestamp: new Date().toISOString()
  });
});

// GET single registrant directly to verify active status
app.get('/api/registrants/:id', (req, res) => {
  const { id } = req.params;
  const db = ensureDatabase();
  const deletedSet = new Set(db.deletedRegistrantIds || []);
  if (deletedSet.has(id)) {
    return res.status(404).json({ success: false, error: 'العضو محذوف من النظام', isDeleted: true });
  }
  const reg = (db.registrants || []).find(r => r.id === id);
  if (!reg) {
    return res.status(404).json({ success: false, error: 'العضو غير موجود في قاعدة البيانات', isDeleted: true });
  }
  if (reg.status === 'cancelled') {
    return res.status(403).json({ success: false, error: 'تم إلغاء عضوية هذا المستخدم من قبل إدارة المجتمع', isCancelled: true, registrant: reg });
  }
  if (reg.status === 'blocked') {
    return res.status(403).json({ success: false, error: 'هذا الحساب محظور نهائياً', isBlocked: true, registrant: reg });
  }
  res.json({ success: true, registrant: reg });
});

// POST update presence and lastSeen
app.post('/api/registrants/:id/presence', async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;
    const db = ensureDatabase();
    const reg = (db.registrants || []).find(r => r.id === id);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const prevStatus = Boolean(reg.isOnline);
    const nowMs = Date.now();
    const lastSupaSync = lastSupabasePresenceSyncAt[id] || 0;
    reg.isOnline = Boolean(isOnline);
    reg.lastSeen = new Date(nowMs).toISOString();
    saveDatabase(db);

    broadcastServerEvent('PRESENCE_UPDATED', {
      id,
      isOnline: reg.isOnline,
      lastSeen: reg.lastSeen
    });

    // Sync to Supabase when online status transitions OR every 40 seconds of cumulative time so Supabase never has a stale lastSeen
    if (prevStatus !== reg.isOnline || nowMs - lastSupaSync > 40000) {
      lastSupabasePresenceSyncAt[id] = nowMs;
      try {
        await supabaseServer.from('registrants').update({ isOnline: reg.isOnline, lastSeen: reg.lastSeen }).eq('id', id);
      } catch {}
    }

    res.json({ success: true, isOnline: reg.isOnline, lastSeen: reg.lastSeen });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Strictly monotonic never-reused registration code generator (TY-0118, TY-0119, ...).
// NEVER recycles deleted/revoked member codes so every new member gets a 100% brand-new code forever!
function getNextServerSequentialCode(db: AppData): string {
  const usedCodes = new Set<string>(['TY-0001']);
  let maxNum = Math.max(117, Number((db as any).highestAssignedCodeNum || 117));

  const ingestCode = (raw: any) => {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return;
    usedCodes.add(code);
    const m = code.match(/^TY-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  };

  for (const r of (db.registrants || [])) {
    if (!r) continue;
    ingestCode(r.uniqueCode);
    ingestCode((r as any).qrCode);
  }
  if (Array.isArray((db as any).usedCodesForever)) {
    for (const c of (db as any).usedCodesForever) ingestCode(c);
  }
  if (Array.isArray((db as any).blockedUsers)) {
    for (const b of (db as any).blockedUsers) ingestCode(b?.uniqueCode);
  }

  let candidateNum = maxNum + 1;
  let candidateCode = `TY-${String(candidateNum).padStart(4, '0')}`;
  while (usedCodes.has(candidateCode.toUpperCase())) {
    candidateNum++;
    candidateCode = `TY-${String(candidateNum).padStart(4, '0')}`;
  }

  (db as any).highestAssignedCodeNum = candidateNum;
  if (!Array.isArray((db as any).usedCodesForever)) (db as any).usedCodesForever = [];
  if (!(db as any).usedCodesForever.includes(candidateCode)) {
    (db as any).usedCodesForever.push(candidateCode);
  }
  return candidateCode;
}

// GET next available sequential code
app.get('/api/next-code', (_req, res) => {
  const db = ensureDatabase();
  const nextCode = getNextServerSequentialCode(db);
  res.json({ success: true, nextCode });
});

// Helper to extract client IP address from request headers
function getRequestClientIp(req: express.Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return req.socket?.remoteAddress || '';
}

app.get('/api/client-ip', (req, res) => {
  res.json({ success: true, ip: getRequestClientIp(req) });
});

// Strict FIFO serialization queue for local Express registrations (zero race conditions / mixed phones/photos/QRs)
let localRegistrationQueue: Promise<any> = Promise.resolve();
function enqueueLocalRegistration<T>(task: () => Promise<T>): Promise<T> {
  const next = localRegistrationQueue.then(task, task);
  localRegistrationQueue = next.catch(() => {});
  return next;
}

// POST new registrant (Registered from mobile phone or any browser)
const handleLocalAtomicRegister = async (req: express.Request, res: express.Response) => {
  return await enqueueLocalRegistration(async () => {
    try {
      const incomingBody = req.body;
      const rawName = String(incomingBody?.fullName || incomingBody?.name || '').trim().replace(/\s+/g, ' ');
      if (!incomingBody || !rawName || rawName === 'عضو') {
        return res.status(400).json({ success: false, error: 'بيانات العضو غير مكتملة أو الاسم الثلاثي غير صالح.' });
      }
      const newMember = { ...incomingBody, fullName: rawName, name: rawName };
      const clientIp = newMember.ipAddress || getRequestClientIp(req) || undefined;
      if (clientIp) {
        newMember.ipAddress = clientIp;
      }

      const db = ensureDatabase();

      // Check if user, phone, or IP address is BLOCKED
      const cleanPhoneDigits = (s: string) => (s || '').replace(/\D/g, '');
      const reqDigits = cleanPhoneDigits(newMember.phone);
      const reqName = rawName.toLowerCase();

      const isBlocked = (db.blockedUsers || []).some(b => {
        if (clientIp && b.ipAddress && b.ipAddress.trim() === clientIp.trim()) return true;
        const bDigits = cleanPhoneDigits(b.phone);
        if (reqDigits.length >= 7 && bDigits && (reqDigits.endsWith(bDigits) || bDigits.endsWith(reqDigits))) return true;
        if (b.fullName && b.fullName.trim().toLowerCase() === reqName) return true;
        return false;
      });

      if (isBlocked) {
        return res.status(403).json({
          success: false,
          error: '⚠️ هذا الحساب أو الجهاز (IP) محظور نهائياً من التسجيل بناءً على قرار إدارة ومسؤول المجتمع. لا يمكنك التسجيل في الموقع.'
        });
      }

      // Check duplicate 3-part Arabic name
      const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
      const newNorm = norm(rawName);
      const localDup = db.registrants.find(r => r && r.id !== newMember.id && r.status === 'active' && norm(r.fullName) === newNorm);
      if (localDup && (req.path === '/api/register' || newMember.blockIfExists === true)) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          error: 'هذا الاسم مسجل بالفعل في قاعدة البيانات! لا يمكن التسجيل مرتين، يرجى تسجيل الدخول بحسابك.',
          existingMember: localDup
        });
      }

      // Match existing registrant ONLY by id or exact normalized 3-part name
      const existingIndex = db.registrants.findIndex(
        r => (r && newMember.id && r.id === newMember.id && norm(r.fullName) === newNorm) ||
             (r && norm(r.fullName) === newNorm)
      );

      if (existingIndex !== -1) {
        const prev = db.registrants[existingIndex];
        db.registrants[existingIndex] = {
          ...prev,
          ...newMember,
          id: prev.id || newMember.id,
          uniqueCode: prev.uniqueCode || newMember.uniqueCode,
          qrCode: prev.uniqueCode || newMember.uniqueCode,
          qrData: prev.uniqueCode || newMember.uniqueCode
        };
        Object.assign(newMember, db.registrants[existingIndex]);
      } else {
        // Assign strictly collision-free ID and sequential TY-XXXX code (preserving Cloudflare-verified ones when mirroring)
        const isAlreadyCloudVerified = incomingBody.atomicVerified === true;
        if (!isAlreadyCloudVerified && (req.path === '/api/register' || !newMember.id || db.registrants.some(r => r && r.id === newMember.id))) {
          newMember.id = `reg_member_3FY-${crypto.randomUUID()}`;
        } else if (!newMember.id || db.registrants.some(r => r && r.id === newMember.id)) {
          newMember.id = `reg_member_3FY-${crypto.randomUUID()}`;
        }
        const usedCodesUpper = new Set(db.registrants.map(r => String(r?.uniqueCode || '').trim().toUpperCase()).filter(Boolean));
        if (
          !isAlreadyCloudVerified && (
            req.path === '/api/register' ||
            newMember.strictAtomic === true ||
            !newMember.uniqueCode ||
            usedCodesUpper.has(String(newMember.uniqueCode).trim().toUpperCase())
          )
        ) {
          newMember.uniqueCode = getNextServerSequentialCode(db);
        } else if (!newMember.uniqueCode || usedCodesUpper.has(String(newMember.uniqueCode).trim().toUpperCase())) {
          newMember.uniqueCode = getNextServerSequentialCode(db);
        }
        newMember.qrCode = newMember.uniqueCode;
        newMember.qrData = newMember.uniqueCode;
        if (Array.isArray((db as any).reusableUniqueCodes) && newMember.uniqueCode) {
          const assignedUpper = String(newMember.uniqueCode).trim().toUpperCase();
          (db as any).reusableUniqueCodes = (db as any).reusableUniqueCodes.filter((c: string) => String(c).trim().toUpperCase() !== assignedUpper);
        }
        newMember.registeredInCleanMasterV1 = true;
        newMember.atomicVerified = true;
        newMember.status = 'active';
        db.registrants.push(newMember);
      }

      db.deletedRegistrantIds = (db.deletedRegistrantIds || []).filter(id => id !== newMember.id);
      saveDatabase(db);
      console.log(`[API] Atomic registrant registered: ${newMember.fullName} (${newMember.uniqueCode})`);
      broadcastServerEvent('REGISTRANT_UPSERTED', newMember);

      // Only mirror to Cloudflare when NOT already atomicVerified from Cloudflare
      if (!incomingBody.atomicVerified) {
        syncSingleMemberToCloudflare(newMember, true).catch(() => {});
      }

      return res.json({ success: true, verified: true, registrant: newMember, count: db.registrants.length, version: Date.now() });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
};

app.post('/api/registrants', handleLocalAtomicRegister);
app.post('/api/register', handleLocalAtomicRegister);

// PUT update registrant
app.put('/api/registrants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!updates) {
      return res.status(400).json({ success: false, error: 'لا توجد بيانات للتحديث' });
    }
    const db = ensureDatabase();

    const cleanDigits = (s: string) => (s || '').replace(/\D/g, '');
    const upDigits = cleanDigits(updates.phone);
    const oldDigits = cleanDigits(updates.oldPhone);

    const cleanTargetId = getServerBaseMemberId(updates.id || id);
    const bareTargetId = cleanTargetId.replace(/^reg_member_/, '').replace(/^reg_sql_/, '');
    const normUpName = normServerArabicName(updates.fullName || updates.name || '');

    let index = db.registrants.findIndex(r => {
      if (!r) return false;
      const rid = getServerBaseMemberId(r.id);
      const origRid = getServerBaseMemberId(r.originalId || '');
      const bareRid = rid.replace(/^reg_member_/, '').replace(/^reg_sql_/, '');
      if (rid === getServerBaseMemberId(id) || rid === cleanTargetId || origRid === cleanTargetId || (bareTargetId && bareRid === bareTargetId)) return true;
      if (normUpName && normServerArabicName(r.fullName || r.name || '') === normUpName) return true;
      if (r.uniqueCode && updates.uniqueCode && r.uniqueCode.toUpperCase() === updates.uniqueCode.toUpperCase()) return true;
      if (oldDigits && cleanDigits(r.phone) === oldDigits) return true;
      if (upDigits && cleanDigits(r.phone) === upDigits) return true;
      return false;
    });

    const nowMs = Date.now();
    if (updates.permissions && typeof updates.permissions === 'object') {
      updates.permissions = {
        ...updates.permissions,
        __permissionsUpdatedAt: updates.permissions.__permissionsUpdatedAt || nowMs
      };
    }

    const clientIp = updates.ipAddress || getRequestClientIp(req) || undefined;

    if (index === -1) {
      // Add member if missing from server database (only if fullName is valid and not 'عضو')
      if (!updates.fullName || String(updates.fullName).trim() === 'عضو') {
        return res.status(404).json({ success: false, error: 'العضو غير موجود' });
      }
      const newRec = {
        ...updates,
        id: cleanTargetId || `reg_${nowMs}`,
        ipAddress: clientIp,
        lastModifiedAt: Number(updates.lastModifiedAt || nowMs),
        updatedAt: Number(updates.updatedAt || nowMs),
        lastUpdatedAt: updates.lastUpdatedAt
      };
      db.registrants.push(newRec);
      db.registrants = deduplicateServerRegistrants(db.registrants, new Set(db.deletedRegistrantIds || []));
      index = db.registrants.findIndex(r => r && (getServerBaseMemberId(r.id) === getServerBaseMemberId(newRec.id) || (normUpName && normServerArabicName(r.fullName) === normUpName)));
      if (index === -1) index = db.registrants.length - 1;
      lastServerRegistrantMutationAt[db.registrants[index].id] = nowMs;
    } else {
      // Merge updates and preserve newest presence & immutable identity unless explicitly updated
      const existingReg = db.registrants[index];
      const mergedPresence = mergePresenceWithNewestLastSeen(existingReg, updates);
      const safeFullName = updates.fullName && String(updates.fullName).trim() !== 'عضو'
        ? String(updates.fullName).trim()
        : existingReg.fullName;
      const explicitGenderSent = Boolean(
        updates.genderLocked ||
        updates.manualGender ||
        updates.genderCode ||
        (updates.gender && updates.gender !== existingReg.gender) ||
        (updates.sex && updates.sex !== existingReg.sex)
      );
      const resolvedGender = (updates.gender || existingReg.gender) === 'female' ? 'female' : 'male';
      const resolvedGenderLocked = Boolean(updates.genderLocked ?? (explicitGenderSent ? true : existingReg.genderLocked));
      const updatedRec = {
        ...existingReg,
        ...updates,
        id: getServerBaseMemberId(existingReg.id || cleanTargetId),
        fullName: safeFullName,
        name: safeFullName,
        gender: resolvedGender,
        sex: resolvedGender,
        genderCode: updates.genderCode || resolvedGender,
        manualGender: resolvedGenderLocked ? resolvedGender : (updates.manualGender ?? existingReg.manualGender),
        genderLocked: resolvedGenderLocked,
        ipAddress: updates.ipAddress || existingReg.ipAddress || clientIp,
        ...mergedPresence,
        lastModifiedAt: Math.max(Number(updates.lastModifiedAt || updates.updatedAt || nowMs), nowMs),
        updatedAt: Math.max(Number(updates.updatedAt || updates.lastModifiedAt || nowMs), nowMs),
        lastUpdatedAt: updates.lastUpdatedAt !== undefined ? updates.lastUpdatedAt : existingReg.lastUpdatedAt
      };
      db.registrants[index] = updatedRec;
      db.registrants = deduplicateServerRegistrants(db.registrants, new Set(db.deletedRegistrantIds || []));
      index = db.registrants.findIndex(r => r && (getServerBaseMemberId(r.id) === updatedRec.id || normServerArabicName(r.fullName) === normServerArabicName(safeFullName)));
      if (index === -1) index = 0;
      lastServerRegistrantMutationAt[db.registrants[index].id] = nowMs;
      // If notes were explicitly cleared on a member, also purge their visitationNotes so all devices stay in sync
      if ('notes' in updates && (!updates.notes || String(updates.notes).trim() === '') && db.registrants[index].role === 'member') {
        db.registrants[index].notes = '';
        const targetId = db.registrants[index].id;
        const memberNotes = (db.visitationNotes || []).filter((n: any) => n && n.memberId === targetId);
        if (memberNotes.length > 0) {
          const delSet = new Set(db.deletedVisitationNoteIds || []);
          memberNotes.forEach((n: any) => { if (n.id) delSet.add(n.id); });
          db.deletedVisitationNoteIds = Array.from(delSet);
          db.visitationNotes = (db.visitationNotes || []).filter((n: any) => n && n.memberId !== targetId);
          broadcastServerEvent('VISITATION_NOTES_UPDATED', {
            notes: db.visitationNotes,
            deletedNoteIds: db.deletedVisitationNoteIds
          });
          persistSystemStateToSupabase(db).catch(() => {});
        }
      }
    }
    saveDatabase(db);
    console.log(`[API] Updated registrant successfully: ${db.registrants[index].fullName}`);
    broadcastServerEvent('REGISTRANT_UPSERTED', db.registrants[index]);

    // Return immediate success to client (sub-15ms response)
    res.json({ success: true, registrant: db.registrants[index] });

    // Persist single member update atomically to Cloudflare KV + D1 without bulk overwrite
    syncSingleMemberToCloudflare(db.registrants[index], false).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE / Completely wipe registrant data from system
app.delete('/api/registrants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();

    const target = db.registrants.find(r => r.id === id);
    if (target?.role === 'community_owner' || id === 'reg_owner_main') {
      return res.status(403).json({ success: false, error: 'لا يمكن حذف حساب مسؤول المجتمع الرئيسي.' });
    }

    const targetName = target ? target.fullName : null;
    const targetCode = target ? target.uniqueCode : null;

    // Permanently retire deleted member's uniqueCode (NEVER recycle it for any future member!)
    if (targetCode && /^TY-\d+$/i.test(String(targetCode).trim()) && String(targetCode).trim().toUpperCase() !== 'TY-0001') {
      const normalizedCode = String(targetCode).trim().toUpperCase();
      if (!Array.isArray((db as any).usedCodesForever)) (db as any).usedCodesForever = [];
      if (!(db as any).usedCodesForever.includes(normalizedCode)) {
        (db as any).usedCodesForever.push(normalizedCode);
      }
      const numMatch = normalizedCode.match(/^TY-(\d+)$/);
      if (numMatch) {
        (db as any).highestAssignedCodeNum = Math.max(Number((db as any).highestAssignedCodeNum || 117), parseInt(numMatch[1], 10));
      }
    }

    // Completely wipe from registrants list ONLY by id or exact fullName (never by reused uniqueCode)
    db.registrants = db.registrants.filter(r => {
      if (!r) return false;
      if (r.id === id) return false;
      if (targetName && r.fullName === targetName) return false;
      return true;
    });
    db.attendance = (db.attendance || []).filter(a => a.registrantId !== id);
    if (!db.deletedRegistrantIds.includes(id)) {
      db.deletedRegistrantIds.push(id);
    }
    saveDatabase(db);
    broadcastServerEvent('REGISTRANT_DELETED', { id, fullName: targetName });

    // Sync deletion to Cloudflare D1
    syncStateToCloudflareD1(false).catch(() => {});

    console.log(`[API] Registrant ${id} (${targetName || ''}) completely wiped from server & Cloudflare D1.`);
    res.json({ success: true, message: 'تم مسح العضو وبياناته تماماً من النظام وقاعدة بيانات Cloudflare D1 بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Block a user permanently and prevent future registration
app.post('/api/registrants/block', async (req, res) => {
  try {
    const { memberId, reason, actorRole } = req.body;
    if (actorRole && actorRole !== 'community_owner') {
      return res.status(403).json({ success: false, error: 'صلاحية الحظر مقتصرة حصرياً على مسؤول المجتمع (Community Owner).' });
    }

    const db = ensureDatabase();
    const member = db.registrants.find(r => r.id === memberId);
    if (!member) {
      return res.status(404).json({ success: false, error: 'العضو غير موجود في النظام' });
    }

    if (member.role === 'community_owner' || member.id === 'reg_owner_main') {
      return res.status(403).json({ success: false, error: 'لا يمكن حظر مسؤول المجتمع.' });
    }

    const blockedEntry = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fullName: member.fullName,
      phone: member.phone,
      whatsapp: member.whatsapp || member.phone,
      uniqueCode: member.uniqueCode,
      ipAddress: member.ipAddress || req.body?.ipAddress || undefined,
      reason: reason || 'حظر نهائي بواسطة مسؤول المجتمع',
      blockedAt: new Date().toISOString(),
      blockedBy: 'مسؤول المجتمع (Community Owner)'
    };

    // Add to blockedUsers
    db.blockedUsers = (db.blockedUsers || []).filter(b => b.phone !== member.phone && b.fullName !== member.fullName);
    db.blockedUsers.push(blockedEntry);

    // Permanently retire blocked member's uniqueCode (NEVER recycle it for any future member!)
    if (member.uniqueCode && /^TY-\d+$/i.test(String(member.uniqueCode).trim()) && String(member.uniqueCode).trim().toUpperCase() !== 'TY-0001') {
      const normalizedCode = String(member.uniqueCode).trim().toUpperCase();
      if (!Array.isArray((db as any).usedCodesForever)) (db as any).usedCodesForever = [];
      if (!(db as any).usedCodesForever.includes(normalizedCode)) {
        (db as any).usedCodesForever.push(normalizedCode);
      }
    }

    // Completely remove from registrants and mark as deleted
    db.registrants = db.registrants.filter(r => r.id !== memberId);
    if (!db.deletedRegistrantIds.includes(memberId)) {
      db.deletedRegistrantIds.push(memberId);
    }
    saveDatabase(db);
    broadcastServerEvent('USER_BLOCKED', blockedEntry);
    broadcastServerEvent('REGISTRANT_DELETED', { id: memberId, fullName: member.fullName });

    syncStateToCloudflareD1(false).catch(() => {});

    console.log(`[API] User ${member.fullName} (${member.phone}) permanently blocked.`);
    res.json({ success: true, blockedEntry, message: 'تم حظر المستخدم نهائياً ومسحه من القوائم بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all blocked users
app.get('/api/blocked-users', (_req, res) => {
  const db = ensureDatabase();
  res.json({ success: true, blockedUsers: db.blockedUsers || [] });
});

// DELETE unblock a user
app.delete('/api/blocked-users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    db.blockedUsers = (db.blockedUsers || []).filter(b => b.id !== id);
    saveDatabase(db);
    broadcastServerEvent('USER_UNBLOCKED', { id });
    syncStateToCloudflareD1(false).catch(() => {});

    try {
      await supabaseServer.from('blocked_users').delete().eq('id', id);
    } catch (e) {
      console.warn('[Server] Supabase unblock notice:', e);
    }

    res.json({ success: true, message: 'تم فك الحظر بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to strip attendance permanently from db.attendance, db.registrants, db.fridayStamps, and tombstones
function stripAttendanceFromServerDb(
  db: AppData,
  opts: {
    recordIds?: string[];
    revocationKeys?: string[];
    registrantId?: string;
    dateStr?: string;
    registrantName?: string;
  }
) {
  if (!Array.isArray(db.deletedAttendanceIds)) db.deletedAttendanceIds = [];
  if (!Array.isArray(db.revokedAttendanceKeys)) db.revokedAttendanceKeys = [];
  if (!db.fridayStamps || typeof db.fridayStamps !== 'object') db.fridayStamps = {};
  if (!db.revokedStamps || typeof db.revokedStamps !== 'object') db.revokedStamps = {};

  const normAttName = (s: any) =>
    String(s || '').trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').toLowerCase();

  let regId = String(opts.registrantId || '').trim();
  let dateStr = String(opts.dateStr || '').trim().slice(0, 10);
  let regName = String(opts.registrantName || '').trim();
  const idSet = new Set<string>((opts.recordIds || []).filter(Boolean).map(String));

  for (const ridCandidate of Array.from(idSet)) {
    const hit = (db.attendance || []).find((a: any) => a && a.id === ridCandidate);
    if (hit) {
      if (!regId) regId = String(hit.registrantId || hit.memberId || '').trim();
      if (!dateStr) dateStr = String(hit.date || hit.timestamp || '').trim().slice(0, 10);
      if (!regName) regName = String(hit.registrantName || '').trim();
    }
    const sm = ridCandidate.match(/^att_(?:mhist|mstamp|mem|stamp|hist)_(.+)_(\d{4}-\d{2}-\d{2})$/) || ridCandidate.match(/^att_(.+)_(\d{4}-\d{2}-\d{2})$/);
    if (sm) {
      if (!regId) regId = sm[1].trim();
      if (!dateStr) dateStr = sm[2].trim();
    }
  }

  const bareId = regId.replace(/^reg_member_/, '');
  const normTargetName = regName && regName !== 'مخدوم حاضر' ? normAttName(regName) : '';
  const delSet = new Set<string>(db.deletedAttendanceIds);
  idSet.forEach(x => delSet.add(x));

  const revKeySet = new Set<string>(db.revokedAttendanceKeys);
  (opts.revocationKeys || []).forEach(k => k && revKeySet.add(String(k)));
  if (dateStr) {
    if (regId) revKeySet.add(`${regId}__${dateStr}`);
    if (bareId) {
      revKeySet.add(`${bareId}__${dateStr}`);
      revKeySet.add(`reg_member_${bareId}__${dateStr}`);
    }
    if (normTargetName) revKeySet.add(`__name__:${normTargetName}__${dateStr}`);
  }

  db.attendance = (db.attendance || []).filter((a: any) => {
    if (!a) return false;
    if (a.id && delSet.has(a.id)) return false;
    const ad = String(a.date || a.timestamp || '').trim().slice(0, 10);
    if (dateStr && ad === dateStr) {
      const ar = String(a.registrantId || a.memberId || '').trim();
      const ab = ar.replace(/^reg_member_/, '');
      const an = a.registrantName && a.registrantName !== 'مخدوم حاضر' ? normAttName(a.registrantName) : '';
      if ((regId && ar === regId) || (bareId && ab === bareId) || (normTargetName && an === normTargetName)) {
        if (a.id) delSet.add(a.id);
        return false;
      }
    }
    return true;
  });

  if (dateStr && Array.isArray(db.registrants)) {
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    db.registrants = db.registrants.map((m: any) => {
      if (!m || !m.id) return m;
      const mb = String(m.id).replace(/^reg_member_/, '');
      const mn = normAttName(m.fullName || m.name || '');
      const isMatch =
        (regId && (m.id === regId || m.originalId === regId)) ||
        (bareId && mb === bareId) ||
        (normTargetName && mn === normTargetName);
      if (!isMatch) return m;

      revKeySet.add(`${m.id}__${dateStr}`);
      revKeySet.add(`${mb}__${dateStr}`);
      const copy: any = { ...m };
      let changed = false;
      const filterArr = (arr: any[]) => arr.filter((item: any) => {
        if (!item) return false;
        const d = typeof item === 'string' ? item.slice(0, 10) : String(item.date || item.timestamp || item.scannedAt || '').slice(0, 10);
        if (d === dateStr) { changed = true; return false; }
        return true;
      });
      if (Array.isArray(copy.attendanceDates)) copy.attendanceDates = filterArr(copy.attendanceDates);
      if (Array.isArray(copy.presentDates)) copy.presentDates = filterArr(copy.presentDates);
      if (Array.isArray(copy.attendanceHistory)) copy.attendanceHistory = filterArr(copy.attendanceHistory);
      if (Array.isArray(copy.attendance)) copy.attendance = filterArr(copy.attendance);
      for (const f of ['stamps', 'fridayStamps']) {
        if (Array.isArray(copy[f])) copy[f] = filterArr(copy[f]);
        else if (copy[f] && typeof copy[f] === 'object') {
          const nextObj: any = { ...copy[f] };
          for (const k of Object.keys(nextObj)) {
            const kd = (nextObj[k] && typeof nextObj[k] === 'object' && nextObj[k].date)
              ? String(nextObj[k].date).slice(0, 10)
              : String(k.includes('_') ? k.slice(k.lastIndexOf('_') + 1) : k).slice(0, 10);
            if (kd === dateStr) {
              delete nextObj[k];
              changed = true;
            }
          }
          copy[f] = nextObj;
        }
      }
      if (typeof copy.lastAttendance === 'string' && copy.lastAttendance.slice(0, 10) === dateStr) {
        changed = true;
        copy.lastAttendance = undefined;
      }
      if (changed) {
        copy.lastModifiedAt = nowTs;
        copy.updatedAt = nowIso;
      }
      const fk = `${m.id}_${dateStr}`;
      const prevStamp = db.fridayStamps![fk];
      db.fridayStamps![fk] = { stamped: false, version: Number(prevStamp?.version || 0) + 1, updatedAt: nowTs };
      db.revokedStamps[fk] = true;
      return copy;
    });
  }

  db.deletedAttendanceIds = Array.from(delSet);
  db.revokedAttendanceKeys = Array.from(revKeySet);
  return { regId, dateStr, regName, deletedIds: db.deletedAttendanceIds, revokedKeys: db.revokedAttendanceKeys };
}

// POST Attendance records
app.post('/api/attendance', (req, res) => {
  try {
    const { records, mode } = req.body; // mode: 'replace' | 'append'
    const db = ensureDatabase();

    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'سجلات الحضور غير صالحة' });
    }

    if (mode !== 'replace') {
      // Explicit append clears revocation keys for the newly recorded (registrantId, date)
      const revSet = new Set<string>(db.revokedAttendanceKeys || []);
      const delSet = new Set<string>(db.deletedAttendanceIds || []);
      records.forEach((r: any) => {
        if (!r || !r.registrantId || !r.date) return;
        const dStr = String(r.date).slice(0, 10);
        const rid = String(r.registrantId).trim();
        const bare = rid.replace(/^reg_member_/, '');
        revSet.delete(`${rid}__${dStr}`);
        revSet.delete(`${bare}__${dStr}`);
        revSet.delete(`reg_member_${bare}__${dStr}`);
        if (r.id) delSet.delete(r.id);
      });
      db.revokedAttendanceKeys = Array.from(revSet);
      db.deletedAttendanceIds = Array.from(delSet);
    }

    const deletedAttSet = new Set(db.deletedAttendanceIds || []);
    const revokedKeysSet = new Set(db.revokedAttendanceKeys || []);
    const validRecords = records.filter(r => {
      if (!r || !r.id || deletedAttSet.has(r.id)) return false;
      const dStr = String(r.date || '').slice(0, 10);
      const rid = String(r.registrantId || r.memberId || '').trim();
      const bare = rid.replace(/^reg_member_/, '');
      if (dStr && (revokedKeysSet.has(`${rid}__${dStr}`) || (bare && revokedKeysSet.has(`${bare}__${dStr}`)))) return false;
      return true;
    });

    if (mode === 'replace') {
      db.attendance = validRecords;
    } else {
      // Merge unique records by ID or registrantId + date
      const existingMap = new Map();
      db.attendance.forEach(a => {
        if (a && !deletedAttSet.has(a.id)) {
          existingMap.set(a.id || `${a.registrantId || a.memberId}_${a.date}`, a);
        }
      });
      validRecords.forEach(a => {
        existingMap.set(a.id || `${a.registrantId || a.memberId}_${a.date}`, a);
      });
      db.attendance = Array.from(existingMap.values());
    }

    saveDatabase(db);
    broadcastServerEvent('ATTENDANCE_RECORDED', { records: validRecords, mode });
    syncStateToCloudflareD1(false).catch(() => {});
    res.json({ success: true, count: db.attendance.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Permanent Attendance Revoke (deletes record IDs + strips member dates/stamps + tombstones (member, date))
app.post('/api/attendance/revoke', (req, res) => {
  try {
    const { recordIds, revocationKeys, registrantId, dateStr, registrantName } = req.body || {};
    const db = ensureDatabase();
    const info = stripAttendanceFromServerDb(db, {
      recordIds: Array.isArray(recordIds) ? recordIds : [],
      revocationKeys: Array.isArray(revocationKeys) ? revocationKeys : [],
      registrantId,
      dateStr,
      registrantName
    });
    saveDatabase(db);
    broadcastServerEvent('ATTENDANCE_DELETED', {
      id: (Array.isArray(recordIds) && recordIds[0]) || '',
      deletedIds: info.deletedIds,
      revokedKeys: info.revokedKeys,
      registrantId: info.regId,
      dateStr: info.dateStr,
      registrantName: info.regName
    });
    syncStateToCloudflareD1(false).catch(() => {});
    res.json({ success: true, count: db.attendance.length, ...info });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE Attendance record (supports ?registrantId=&date=&name= for synthetic/duplicate purge)
app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const registrantId = typeof req.query.registrantId === 'string' ? req.query.registrantId : undefined;
    const dateStr = typeof req.query.date === 'string' ? req.query.date : undefined;
    const registrantName = typeof req.query.name === 'string' ? req.query.name : undefined;
    const db = ensureDatabase();

    const info = stripAttendanceFromServerDb(db, {
      recordIds: [id],
      registrantId,
      dateStr,
      registrantName
    });
    saveDatabase(db);
    broadcastServerEvent('ATTENDANCE_DELETED', {
      id,
      deletedIds: info.deletedIds,
      revokedKeys: info.revokedKeys,
      registrantId: info.regId,
      dateStr: info.dateStr,
      registrantName: info.regName
    });
    syncStateToCloudflareD1(false).catch(() => {});

    res.json({ success: true, id, message: 'تم حذف سجل الحضور نهائياً بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Reset Monthly or Member Monthly Attendance Stamps permanently
app.post('/api/attendance/reset', (req, res) => {
  try {
    const { registrantId, year, monthIndex, deletedIds } = req.body;
    const db = ensureDatabase();
    const monthPrefix = (typeof year === 'number' && typeof monthIndex === 'number')
      ? `${year}-${String(monthIndex + 1).padStart(2, '0')}`
      : '';

    const delSet = new Set(db.deletedAttendanceIds || []);
    if (Array.isArray(deletedIds)) {
      deletedIds.forEach((id: string) => {
        if (id) delSet.add(id);
      });
    }

    if (monthPrefix) {
      const removed = (db.attendance || []).filter(r => {
        if (!r || !r.date) return false;
        if (registrantId && (r.registrantId || r.memberId) !== registrantId) return false;
        return r.date.startsWith(monthPrefix);
      });
      removed.forEach(r => {
        if (r && r.id) delSet.add(r.id);
        if (db.revokedStamps && r.date) {
          delete db.revokedStamps[`${r.registrantId || r.memberId}_${r.date}`];
        }
      });
      db.attendance = (db.attendance || []).filter(r => {
        if (!r || !r.date) return false;
        if (delSet.has(r.id)) return false;
        if (registrantId && (r.registrantId || r.memberId) !== registrantId) return true;
        return !r.date.startsWith(monthPrefix);
      });
    } else if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      db.attendance = (db.attendance || []).filter(r => r && !delSet.has(r.id));
    }

    db.deletedAttendanceIds = Array.from(delSet);
    saveDatabase(db);
    broadcastServerEvent('ATTENDANCE_RESET', { registrantId, year, monthIndex, deletedIds: db.deletedAttendanceIds });
    syncStateToCloudflareD1(false).catch(() => {});

    res.json({ success: true, count: db.attendance.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Toggle or set Friday Attendance Stamp (Versioned & Permanent)
app.post('/api/attendance/stamp', (req, res) => {
  try {
    const { registrantId, dateStr, revoked, stamped, version, updatedAt, stamps } = req.body || {};
    const db = ensureDatabase();
    if (!db.fridayStamps || typeof db.fridayStamps !== 'object') db.fridayStamps = {};
    if (!db.revokedStamps || typeof db.revokedStamps !== 'object') db.revokedStamps = {};

    const updatedBatch: Record<string, { stamped: boolean; version: number; updatedAt: number }> = {};

    if (stamps && typeof stamps === 'object') {
      for (const [k, val] of Object.entries(stamps as Record<string, any>)) {
        if (!val || typeof val !== 'object') continue;
        const incVer = Number(val.version || 0);
        const incTs = Number(val.updatedAt || Date.now());
        const incStamped = Boolean(val.stamped);
        const ex = db.fridayStamps[k];
        const exVer = Number(ex?.version || 0);
        const exTs = Number(ex?.updatedAt || 0);
        if (!ex || incVer >= exVer || incTs >= exTs) {
          const entry = {
            stamped: incStamped,
            version: Math.max(incVer, exVer + 1, 1),
            updatedAt: incTs
          };
          db.fridayStamps[k] = entry;
          updatedBatch[k] = entry;
          if (incStamped) delete db.revokedStamps[k];
          else db.revokedStamps[k] = true;
        }
      }
    } else if (registrantId && dateStr) {
      const key = `${registrantId}_${dateStr}`;
      const ex = db.fridayStamps[key];
      const exVer = Number(ex?.version || 0);
      const nextStamped = typeof stamped === 'boolean' ? stamped : !revoked;
      const nextVer = typeof version === 'number' && version > exVer ? version : exVer + 1;
      const nextTs = Number(updatedAt || Date.now());
      const entry = {
        stamped: nextStamped,
        version: nextVer,
        updatedAt: nextTs
      };
      db.fridayStamps[key] = entry;
      updatedBatch[key] = entry;
      if (nextStamped) {
        delete db.revokedStamps[key];
      } else {
        db.revokedStamps[key] = true;
      }
    } else {
      return res.status(400).json({ success: false, error: 'بيانات الختم غير مكتملة' });
    }

    saveDatabase(db);
    broadcastServerEvent('STAMP_CHANGED', {
      registrantId,
      dateStr,
      revoked: Boolean(revoked),
      stamped: typeof stamped === 'boolean' ? stamped : !revoked,
      stamps: updatedBatch
    });
    syncStateToCloudflareD1(false).catch(() => {});
    res.json({ success: true, stamps: updatedBatch });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// PUBLIC IMAGE ENDPOINTS FOR WEB PUSH & ONESIGNAL
// (OneSignal & Web Push ServiceWorkers require HTTP/HTTPS image URLs)
// ==========================================
function sendDataUrlOrFile(res: express.Response, dataUrl: string | null | undefined, fallbackFilePath: string) {
  try {
    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (matches && matches[1] && matches[2]) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(buffer);
      }
    }
    if (dataUrl && typeof dataUrl === 'string' && (dataUrl.startsWith('http://') || dataUrl.startsWith('https://'))) {
      return res.redirect(dataUrl);
    }
  } catch {}

  if (fs.existsSync(fallbackFilePath)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(fallbackFilePath);
  }
  return res.status(404).end();
}

// 1. Official Site Logo (Used on Login Page, Stamps, and Push Notifications)
app.get('/api/images/site-logo.png', (_req, res) => {
  const db = ensureDatabase();
  const fallbackLogo = path.resolve(__dirname, 'public', 'icon-512x512.png');
  return sendDataUrlOrFile(res, db.logo, fallbackLogo);
});

// 2. Transparent Badge for Android Notification Shade
app.get('/api/images/site-badge.png', (_req, res) => {
  const badgeFile = path.resolve(__dirname, 'public', 'icon-192x192.png');
  if (fs.existsSync(badgeFile)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(badgeFile);
  }
  const fallbackLogo = path.resolve(__dirname, 'public', 'icon-512x512.png');
  return res.sendFile(fallbackLogo);
});

// 3. Sender Icon Endpoint — STRICT RULE: Only Priest ('priest') photos are allowed; ALL other roles return Official Site Logo!
app.get('/api/images/announcement-sender/:id.png', (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace(/\.(png|jpg|jpeg)$/i, '');
  const db = ensureDatabase();
  const fallbackLogo = path.resolve(__dirname, 'public', 'icon-512x512.png');

  const ann = (db.announcements || []).find((a: any) => a && a.id === cleanId);
  if (ann && ann.senderRole === 'priest' && ann.senderPhotoUrl && ann.senderPhotoUrl.trim() !== '') {
    return sendDataUrlOrFile(res, ann.senderPhotoUrl, fallbackLogo);
  }

  const reg = (db.registrants || []).find((r: any) => r && r.id === cleanId);
  if (reg && reg.role === 'priest' && reg.photoUrl && reg.photoUrl.trim() !== '') {
    return sendDataUrlOrFile(res, reg.photoUrl, fallbackLogo);
  }

  return sendDataUrlOrFile(res, db.logo, fallbackLogo);
});

// 4. Expandable Attached Announcement Image (WhatsApp-style BigPicture in Notification Shade)
app.get('/api/images/announcement/:id.png', (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace(/\.(png|jpg|jpeg)$/i, '');
  const db = ensureDatabase();
  const ann = (db.announcements || []).find((a: any) => a && a.id === cleanId);
  if (!ann || !ann.imageUrl) {
    return res.status(404).end();
  }
  const fallbackLogo = path.resolve(__dirname, 'public', 'icon-512x512.png');
  return sendDataUrlOrFile(res, ann.imageUrl, fallbackLogo);
});

// Helper to resolve matching member IDs for an announcement target audience
function resolveTargetMemberIds(
  db: AppData,
  targetAudience?: string,
  targetUserId?: string,
  targetServantName?: string,
  targetDate?: string
): string[] {
  const activeRegs = (db.registrants || []).filter((r: any) => r && r.id && r.status === 'active');
  const norm = (s: string) =>
    (s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase();

  // Special Visitation Assignment: Strictly ONLY the assigned servant (never community owner or other servants)
  if (targetAudience === 'servant_personal') {
    const matched = activeRegs.filter((r: any) => {
      if (r.role === 'community_owner') return false;
      if (targetUserId && r.id === targetUserId) return true;
      if (targetServantName && (norm(r.fullName) === norm(targetServantName) || norm(r.fullName).includes(norm(targetServantName)))) {
        return true;
      }
      return false;
    });
    if (matched.length > 0) return matched.map((r: any) => r.id);
    return targetUserId ? [targetUserId] : [];
  }

  if (targetAudience === 'males_only') {
    return activeRegs.filter((r: any) => (r.gender || 'male') === 'male').map((r: any) => r.id);
  }

  if (targetAudience === 'females_only') {
    return activeRegs.filter((r: any) => r.gender === 'female').map((r: any) => r.id);
  }

  const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const todayStr = targetDate || `${cairoNow.getFullYear()}-${String(cairoNow.getMonth() + 1).padStart(2, '0')}-${String(cairoNow.getDate()).padStart(2, '0')}`;
  const attendedSet = new Set(
    (db.attendance || [])
      .filter((a: any) => a && a.date === todayStr)
      .map((a: any) => a.registrantId || a.memberId)
  );

  if (targetAudience === 'absent_today') {
    return activeRegs.filter((r: any) => !attendedSet.has(r.id)).map((r: any) => r.id);
  }

  if (targetAudience === 'attended_today') {
    return activeRegs.filter((r: any) => attendedSet.has(r.id)).map((r: any) => r.id);
  }

  return activeRegs.map((r: any) => r.id);
}

// OneSignal & Web Push Notification Relay + VAPID Hub Handler
app.get('/api/push-notification', async (req, res) => {
  try {
    // @ts-ignore - Dynamic import of ES module handler
    const mod = await import('./api/push-notification.js');
    if (req.query?.action === 'get_announcements') {
      const db = ensureDatabase();
      const cloudList = await mod.hydrateAnnouncementsFromCloud(req.query?.force === '1');
      const delSet = new Set([
        ...(db.deletedAnnouncementIds || []),
        ...(Array.isArray((globalThis as any).__THREE_YOUTHS_LIVE_HUB__?.deletedIds)
          ? (globalThis as any).__THREE_YOUTHS_LIVE_HUB__.deletedIds
          : Array.from((globalThis as any).__THREE_YOUTHS_LIVE_HUB__?.deletedIds || [])),
      ]);
      const mergedMap = new Map<string, any>();
      (cloudList || []).forEach((a: any) => {
        if (a && a.id && !delSet.has(a.id)) mergedMap.set(a.id, a);
      });
      (db.announcements || []).forEach((a: any) => {
        if (a && a.id && !delSet.has(a.id)) {
          const prev = mergedMap.get(a.id);
          mergedMap.set(a.id, prev ? mergeAnnouncementObjectsOnServer(prev, a) : a);
        }
      });
      const combined = Array.from(mergedMap.values()).sort(
        (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      return res.status(200).json({
        ok: true,
        announcements: combined,
        deletedAnnouncementIds: Array.from(delSet),
      });
    }
    const fn = mod.default || mod;
    return await fn(req, res);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Push GET handler error' });
  }
});

app.post('/api/push-notification', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (
      body.action === 'subscribe' ||
      body.action === 'save_announcement' ||
      body.action === 'delete_announcement' ||
      body.action === 'interact_announcement'
    ) {
      // @ts-ignore
      const mod = await import('./api/push-notification.js');
      const fn = mod.default || mod;
      return await fn(req, res);
    }

    const {
      title,
      message,
      url,
      targetAudience = 'all',
      targetUserId,
      targetServantName,
      senderRole,
      senderPhotoUrl,
      announcementId,
      imageUrl,
      data
    } = body;

    const db = ensureDatabase();
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const rawHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '3fetya-youths.com';
    const host = rawHost.replace(/3fetya-youths\.ai\.studio/gi, '3fetya-youths.com');
    const rawBaseUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : `${protocol}://${host}`;
    const baseUrl = rawBaseUrl.replace(/3fetya-youths\.ai\.studio/gi, '3fetya-youths.com');

    // If announcementId and imageUrl were passed, ensure announcement in db has imageUrl saved before OneSignal fetches it
    if (announcementId && imageUrl) {
      const existingAnn = (db.announcements || []).find((a: any) => a && a.id === announcementId);
      if (existingAnn && !existingAnn.imageUrl) {
        existingAnn.imageUrl = imageUrl;
        saveDatabase(db);
      }
    }

    // STRICT ICON RULE: Only Priest ('priest') photos are allowed; ALL other roles use the Official Site Logo!
    const isPriestWithPhoto = senderRole === 'priest' && Boolean(senderPhotoUrl && String(senderPhotoUrl).trim() !== '');
    const iconUrl = isPriestWithPhoto && announcementId
      ? `${baseUrl}/api/images/announcement-sender/${encodeURIComponent(announcementId)}.png`
      : `${baseUrl}/api/images/site-logo.png`;
    const badgeUrl = `${baseUrl}/api/images/site-badge.png`;

    const hasAttachedImage = Boolean(
      (imageUrl && String(imageUrl).trim() !== '') ||
      (announcementId && (db.announcements || []).some((a: any) => a && a.id === announcementId && a.imageUrl))
    );
    const expandedImageUrl = hasAttachedImage && announcementId
      ? `${baseUrl}/api/images/announcement/${encodeURIComponent(announcementId)}.png`
      : undefined;

    const effectiveAudience =
      data?.type === 'special_visitation' || targetAudience === 'servant_personal'
        ? 'servant_personal'
        : targetAudience;

    const targetMemberIds = resolveTargetMemberIds(
      db,
      effectiveAudience,
      targetUserId || data?.servantId,
      targetServantName || data?.servantName
    );

    const formattedTitle = 'الثلاثة فتية - اجتماع الشباب السوداني';

    // Broadcast real-time push event via SSE so connected Service Workers on target devices show native OS notification shade banner immediately
    broadcastServerEvent('PUSH_NOTIFICATION_DISPATCHED', {
      title: formattedTitle,
      message: message || '',
      url: url || '/',
      announcementId: announcementId || data?.announcementId || `push_${Date.now()}`,
      targetAudience: effectiveAudience,
      targetUserId: targetUserId || data?.servantId || null,
      targetServantName: targetServantName || data?.servantName || null,
      targetMemberIds,
      senderRole: senderRole || 'community_owner',
      iconUrl,
      badgeUrl,
      imageUrl: expandedImageUrl || null,
      data: data || {}
    });

    const ONESIGNAL_APP_ID = "195c5a47-9662-45ce-886a-e048636af0c1";
    const apiKey = (
      process.env.ONESIGNAL_REST_API_KEY ||
      process.env.VITE_ONESIGNAL_REST_API_KEY ||
      process.env.ONESIGNAL_API_KEY ||
      ''
    ).trim();

    let onesignalDispatched = false;
    let onesignalResponseInfo: any = null;

    if (apiKey && apiKey !== 'MY_ONESIGNAL_REST_API_KEY') {
      try {
        const cleanMessage = (message || '')
          .replace(/\[الاسم الأول\]/g, 'أخي الحبيب')
          .replace(/\[الاسم الاول\]/g, 'أخي الحبيب')
          .replace(/\[الاسم\]/g, 'أخي الحبيب');

        const payload: Record<string, any> = {
          app_id: ONESIGNAL_APP_ID,
          target_channel: 'push',
          headings: {
            ar: formattedTitle,
            en: formattedTitle
          },
          contents: {
            ar: cleanMessage,
            en: cleanMessage
          },
          url: url ? (url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`) : baseUrl,
          chrome_web_icon: iconUrl,
          chrome_web_badge: badgeUrl,
          firefox_icon: iconUrl,
          ios_sound: 'default',
          android_Visibility: 1,
          priority: 10,
          data: {
            ...(data || {}),
            announcementId,
            targetAudience: effectiveAudience,
            targetUserId: targetUserId || data?.servantId || null,
            targetServantName: targetServantName || data?.servantName || null
          }
        };

        // Attach WhatsApp-style expandable image for Android (chrome_web_image / big_picture) and iPhone (ios_attachments)
        if (expandedImageUrl) {
          payload.chrome_web_image = expandedImageUrl;
          payload.big_picture = expandedImageUrl;
          payload.ios_attachments = { img1: expandedImageUrl };
        }

        // Strict OneSignal Audience Targeting
        if (effectiveAudience === 'servant_personal') {
          const targetId = targetMemberIds[0] || targetUserId || data?.servantId;
          const servantNameVal = targetServantName || data?.servantName;
          if (targetId && servantNameVal) {
            payload.filters = [
              { field: 'tag', key: 'memberId', relation: '=', value: String(targetId) },
              { operator: 'OR' },
              { field: 'tag', key: 'fullName', relation: '=', value: String(servantNameVal) }
            ];
          } else if (targetId) {
            payload.filters = [
              { field: 'tag', key: 'memberId', relation: '=', value: String(targetId) }
            ];
          } else if (servantNameVal) {
            payload.filters = [
              { field: 'tag', key: 'fullName', relation: '=', value: String(servantNameVal) }
            ];
          } else {
            payload.filters = [
              { field: 'tag', key: 'memberId', relation: '=', value: '__nobody__' }
            ];
          }
        } else if (effectiveAudience === 'males_only') {
          payload.filters = [
            { field: 'tag', key: 'gender', relation: '=', value: 'male' }
          ];
        } else if (effectiveAudience === 'females_only') {
          payload.filters = [
            { field: 'tag', key: 'gender', relation: '=', value: 'female' }
          ];
        } else if ((effectiveAudience === 'absent_today' || effectiveAudience === 'attended_today') && targetMemberIds.length > 0 && targetMemberIds.length <= 50) {
          const tagFilters: any[] = [];
          targetMemberIds.forEach((mId, idx) => {
            if (idx > 0) tagFilters.push({ operator: 'OR' });
            tagFilters.push({ field: 'tag', key: 'memberId', relation: '=', value: String(mId) });
          });
          payload.filters = tagFilters;
        } else {
          payload.included_segments = ['Total Subscriptions'];
        }

        // Support both OneSignal v2 Organization/App keys ("Key os_v2_...") and legacy keys ("Basic ...")
        const authHeader = apiKey.startsWith('Key ') || apiKey.startsWith('Basic ')
          ? apiKey
          : apiKey.startsWith('os_v2_')
            ? `Key ${apiKey}`
            : `Basic ${apiKey}`;

        let osRes = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader
          },
          body: JSON.stringify(payload)
        });

        if (!osRes.ok && !apiKey.startsWith('Key ') && !apiKey.startsWith('Basic ')) {
          // Retry with alternate prefix if first attempt returned 401/403
          const altHeader = authHeader.startsWith('Key ') ? `Basic ${apiKey}` : `Key ${apiKey}`;
          osRes = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": altHeader
            },
            body: JSON.stringify(payload)
          });
        }

        onesignalDispatched = osRes.ok;
        try {
          onesignalResponseInfo = await osRes.json();
        } catch {}
        console.log(`[OneSignal] Push dispatch status: ${osRes.status}`, onesignalResponseInfo);
      } catch (e) {
        console.warn('[Server] OneSignal dispatch warning:', e);
      }
    } else {
      console.info('[OneSignal] ONESIGNAL_REST_API_KEY not set in environment; dispatched via Service Worker Web Push & SSE.');
    }

    // Also dispatch RFC 8291 Web Push directly to all VAPID subscribers (personalized with [الاسم الأول] & filtered by targetAudience)
    let vapidResult: any = { totalSubscribers: 0, sentCount: 0 };
    try {
      // @ts-ignore
      const mod = await import('./api/push-notification.js');
      if (mod && typeof mod.broadcastWebPushNotification === 'function') {
        vapidResult = await mod.broadcastWebPushNotification({
          title: formattedTitle,
          message: message || '',
          url: url || '/?tab=announcements',
          tag: announcementId ? `three-youths-ann-${announcementId}` : `three-youths-${Date.now()}`,
          targetAudience: effectiveAudience,
          targetMemberIds,
          targetUserId: targetUserId || data?.servantId || null,
          targetServantName: targetServantName || data?.servantName || null,
          imageUrl: expandedImageUrl || null,
          data: {
            ...(data || {}),
            announcementId,
            targetAudience: effectiveAudience,
            targetUserId: targetUserId || data?.servantId || null,
            targetServantName: targetServantName || data?.servantName || null
          }
        });
      }
    } catch (vapidErr) {
      console.warn('[Server] VAPID broadcast warning:', vapidErr);
    }

    res.json({
      ok: true,
      success: true,
      onesignalAppId: ONESIGNAL_APP_ID,
      onesignalDispatched,
      onesignalConfigured: Boolean(apiKey && apiKey !== 'MY_ONESIGNAL_REST_API_KEY'),
      onesignalResponse: onesignalResponseInfo,
      vapidResult,
      sentCount: vapidResult?.sentCount || 0,
      totalSubscribers: vapidResult?.totalSubscribers || 0,
      iconUrl,
      badgeUrl,
      imageUrl: expandedImageUrl || null,
      targetedCount: targetMemberIds.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Full Data Sync / Backup Restore
app.post('/api/sync', (req, res) => {
  try {
    const payload = req.body;
    const db = ensureDatabase();

    if (Array.isArray(payload.deletedRegistrantIds)) {
      const deletedSet = new Set(db.deletedRegistrantIds || []);
      payload.deletedRegistrantIds.forEach((id: string) => deletedSet.add(id));
      db.deletedRegistrantIds = Array.from(deletedSet);
    }

    const currentDeletedSet = new Set(db.deletedRegistrantIds || []);

    if (Array.isArray(payload.registrants) && payload.registrants.length > 0) {
      // Merge registrants respecting deletions and cancellations
      const map = new Map();
      (db.registrants || []).forEach(r => {
        if (r && r.id && !currentDeletedSet.has(r.id)) {
          map.set(r.id, r);
        }
      });
      payload.registrants.forEach((r: any) => {
        if (r && r.id && !currentDeletedSet.has(r.id)) {
          const existing = map.get(r.id);
          // Don't allow older payload to uncancel a cancelled member
          if (existing && existing.status === 'cancelled' && r.status !== 'cancelled') {
            // Keep cancelled
          } else {
            map.set(r.id, r);
          }
        }
      });
      db.registrants = Array.from(map.values());
    }

    if (Array.isArray(payload.attendance)) {
      const attMap = new Map();
      db.attendance.forEach(a => attMap.set(`${a.memberId}_${a.date}`, a));
      payload.attendance.forEach((a: any) => attMap.set(`${a.memberId}_${a.date}`, a));
      db.attendance = Array.from(attMap.values());
    }

    if (Array.isArray(payload.announcements)) {
      db.announcements = payload.announcements;
    }

    if (Array.isArray(payload.assignments)) {
      db.assignments = payload.assignments;
    }

    if (Array.isArray(payload.visitationNotes)) {
      db.visitationNotes = payload.visitationNotes;
    }

    if (payload.visitationMode === 'general' || payload.visitationMode === 'special') {
      db.visitationMode = payload.visitationMode;
    }

    if (payload.deliveredGifts) {
      db.deliveredGifts = { ...db.deliveredGifts, ...payload.deliveredGifts };
    }

    if (payload.logo !== undefined) {
      db.logo = payload.logo;
    }

    saveDatabase(db);
    res.json({ success: true, data: db });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Meeting Logo (Protected: Community Owner Only)
app.post('/api/logo', (req, res) => {
  try {
    const { logo, actorRole } = req.body;
    if (actorRole && actorRole !== 'community_owner') {
      return res.status(403).json({ success: false, error: 'غير مصرح: تعديل الشعار متاح فقط لمالك المجتمع' });
    }
    const db = ensureDatabase();
    db.logo = logo || null;
    saveDatabase(db);
    res.json({ success: true, logo: db.logo });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Membership Card Template Designer Endpoints
app.get('/api/card-template', (_req, res) => {
  const db = ensureDatabase();
  res.json({ success: true, cardTemplate: db.cardTemplate || null });
});

app.post('/api/card-template', (req, res) => {
  try {
    const { cardTemplate, actorRole } = req.body;
    if (actorRole && actorRole === 'member') {
      return res.status(403).json({ success: false, error: 'غير مصرح: تعديل قالب البطاقات متاح للمسؤولين فقط' });
    }
    const db = ensureDatabase();
    db.cardTemplate = cardTemplate || null;
    saveDatabase(db);
    broadcastServerEvent('CARD_TEMPLATE_UPDATED', { cardTemplate: db.cardTemplate });
    res.json({ success: true, cardTemplate: db.cardTemplate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Delivered Gifts Map
app.post('/api/gifts', (req, res) => {
  try {
    const { key, value } = req.body;
    const db = ensureDatabase();
    db.deliveredGifts = db.deliveredGifts || {};
    db.deliveredGifts[key] = !!value;
    saveDatabase(db);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// ==========================================
// VISITATION MODE (GENERAL / SPECIAL) ENDPOINTS
// ==========================================
app.get('/api/visitation-mode', (_req, res) => {
  const db = ensureDatabase();
  res.json({
    success: true,
    mode: db.visitationMode || 'general',
    updatedAt: db.visitationModeUpdatedAt || 0
  });
});

app.post('/api/visitation-mode', (req, res) => {
  try {
    const { mode, updatedAt } = req.body || {};
    if (mode !== 'general' && mode !== 'special') {
      return res.status(400).json({ success: false, error: 'وضع الافتقاد غير صالح' });
    }
    const db = ensureDatabase();
    const incTs = Number(updatedAt || Date.now());
    const curTs = Number(db.visitationModeUpdatedAt || 0);

    // Reject stale out-of-order requests so Visitation Mode never reverts back to general unintentionally
    if (incTs < curTs) {
      return res.json({
        success: true,
        mode: db.visitationMode || 'general',
        updatedAt: curTs,
        assignments: db.assignments || []
      });
    }

    db.visitationMode = mode;
    db.visitationModeUpdatedAt = incTs;
    
    // When switching to General Visitation: cancel and wipe all special assignments immediately
    if (mode === 'general') {
      db.assignments = [];
      broadcastServerEvent('ASSIGNMENTS_UPDATED', { assignments: [] });
    }

    saveDatabase(db);
    broadcastServerEvent('VISITATION_MODE_CHANGED', {
      mode,
      updatedAt: incTs,
      assignments: db.assignments
    });
    console.log(`[API] Visitation mode switched to: ${mode} at ${incTs} (assignments count: ${db.assignments.length})`);
    
    // Immediate response to client (sub-10ms, no hanging!)
    res.json({
      success: true,
      mode: db.visitationMode,
      updatedAt: db.visitationModeUpdatedAt,
      assignments: db.assignments
    });

    // Non-blocking background sync to Cloudflare D1
    persistSystemStateToSupabase(db).catch(() => {});
    syncStateToCloudflareD1(false).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atomic General Visitation Toggle (Instant cross-device sync)
app.post('/api/visitation/toggle-general', async (req, res) => {
  try {
    const { memberId, servantName, isVisited } = req.body;
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'memberId مطلوب' });
    }
    const db = ensureDatabase();
    const regIdx = (db.registrants || []).findIndex((r: any) => r && (r.id === memberId || r.uniqueCode === memberId));
    if (regIdx === -1) {
      return res.status(404).json({ success: false, error: 'المخدوم غير موجود' });
    }

    const reg = db.registrants[regIdx];
    const nextState = typeof isVisited === 'boolean' ? isVisited : !Boolean(reg.isVisitedGeneral);
    const nowIso = new Date().toISOString();

    reg.isVisitedGeneral = nextState;
    reg.lastVisitedAt = nextState ? nowIso : null;
    reg.lastVisitedBy = nextState ? (servantName || 'خادم') : null;

    saveDatabase(db);
    console.log(`[API] Member ${reg.fullName} visitation toggled: ${nextState} by ${servantName}`);
    broadcastServerEvent('REGISTRANT_UPSERTED', reg);

    // Immediate fast response
    res.json({ success: true, isVisited: nextState, registrant: reg });

    // Background sync to Supabase
    (async () => {
      try {
        const clean = filterRegistrantForSupabase(reg);
        await supabaseServer.from('registrants').upsert(clean);
      } catch {}
    })();
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// CENTRAL PASTORAL VISITATION NOTES (ملاحظات الافتقاد الرعوي المركزية)
// ==========================================
function syncMemberNotesFieldFromVisitation(db: AppData, memberId: string) {
  if (!memberId) return;
  const regIdx = (db.registrants || []).findIndex(r => r && (r.id === memberId || r.uniqueCode === memberId));
  if (regIdx < 0) return;
  const delSet = new Set(db.deletedVisitationNoteIds || []);
  const memberNotes = (db.visitationNotes || [])
    .filter((n: any) => n && n.memberId === memberId && !delSet.has(n.id))
    .sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  if (memberNotes.length === 0) {
    db.registrants[regIdx].notes = '';
  } else {
    db.registrants[regIdx].notes = memberNotes
      .map((n: any) => {
        const dateStr = n.createdAt ? new Date(n.createdAt).toLocaleDateString('ar-EG') : new Date().toLocaleDateString('ar-EG');
        return `[${n.authorName || 'خادم'} - ${dateStr}]: ${n.notes}`;
      })
      .join('\n---\n');
  }
  broadcastServerEvent('REGISTRANT_UPSERTED', db.registrants[regIdx]);
}

app.get('/api/notes', (_req, res) => {
  const db = ensureDatabase();
  const delSet = new Set(db.deletedVisitationNoteIds || []);
  const activeNotes = (db.visitationNotes || []).filter((n: any) => n && n.id && !delSet.has(n.id));
  res.json({ success: true, notes: activeNotes, deletedNoteIds: db.deletedVisitationNoteIds || [] });
});

app.post('/api/notes', (req, res) => {
  try {
    const { notes, newNote, memberId, noteText, authorName, authorRole, memberName, deletedNoteIds } = req.body;
    const db = ensureDatabase();
    if (!Array.isArray(db.visitationNotes)) db.visitationNotes = [];
    if (!Array.isArray(db.deletedVisitationNoteIds)) db.deletedVisitationNoteIds = [];

    if (Array.isArray(deletedNoteIds) && deletedNoteIds.length > 0) {
      const delSet = new Set([...db.deletedVisitationNoteIds, ...deletedNoteIds]);
      db.deletedVisitationNoteIds = Array.from(delSet);
    }

    const delSet = new Set(db.deletedVisitationNoteIds);
    let noteToBroadcast = newNote;

    if (Array.isArray(notes)) {
      db.visitationNotes = notes.filter((n: any) => n && n.id && !delSet.has(n.id));
    } else if (newNote && newNote.id) {
      delSet.delete(newNote.id);
      db.deletedVisitationNoteIds = Array.from(delSet);
      const idx = db.visitationNotes.findIndex((n: any) => n.id === newNote.id);
      if (idx >= 0) db.visitationNotes[idx] = newNote;
      else db.visitationNotes.unshift(newNote);
    } else if (memberId && (noteText || req.body.notes)) {
      const createdNote = {
        id: req.body.id || `vnote_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        memberId,
        memberName: memberName || '',
        authorName: authorName || 'خادم',
        authorRole: authorRole || 'servant',
        notes: noteText || req.body.notes || '',
        createdAt: req.body.createdAt || new Date().toISOString()
      };
      db.visitationNotes.unshift(createdNote);
      noteToBroadcast = createdNote;
    }

    db.visitationNotes = db.visitationNotes.filter((n: any) => n && n.id && !delSet.has(n.id));

    // Synchronize member's notes in db.registrants
    const targetMemberId = (noteToBroadcast && noteToBroadcast.memberId) || memberId;
    if (targetMemberId) {
      syncMemberNotesFieldFromVisitation(db, targetMemberId);
    }

    saveDatabase(db);
    broadcastServerEvent('VISITATION_NOTES_UPDATED', {
      notes: db.visitationNotes,
      newNote: noteToBroadcast,
      deletedNoteIds: db.deletedVisitationNoteIds
    });
    console.log(`[API] Central Visitation Notes updated. Total: ${db.visitationNotes.length}`);
    res.json({
      success: true,
      count: db.visitationNotes.length,
      notes: db.visitationNotes,
      newNote: noteToBroadcast,
      deletedNoteIds: db.deletedVisitationNoteIds
    });
    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/notes/member/:memberId', (req, res) => {
  try {
    const { memberId } = req.params;
    const db = ensureDatabase();
    if (!Array.isArray(db.deletedVisitationNoteIds)) db.deletedVisitationNoteIds = [];
    const delSet = new Set(db.deletedVisitationNoteIds);
    (db.visitationNotes || []).forEach((n: any) => {
      if (n && n.memberId === memberId && n.id) {
        delSet.add(n.id);
      }
    });
    db.deletedVisitationNoteIds = Array.from(delSet);
    db.visitationNotes = (db.visitationNotes || []).filter((n: any) => n && n.memberId !== memberId && !delSet.has(n.id));
    syncMemberNotesFieldFromVisitation(db, memberId);
    saveDatabase(db);
    broadcastServerEvent('VISITATION_NOTES_UPDATED', {
      notes: db.visitationNotes,
      deletedNoteIds: db.deletedVisitationNoteIds,
      clearedMemberId: memberId
    });
    res.json({ success: true, memberId, count: db.visitationNotes.length, notes: db.visitationNotes, deletedNoteIds: db.deletedVisitationNoteIds });
    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    if (!Array.isArray(db.deletedVisitationNoteIds)) db.deletedVisitationNoteIds = [];
    const targetNote = (db.visitationNotes || []).find((n: any) => n && n.id === id);
    if (!db.deletedVisitationNoteIds.includes(id)) {
      db.deletedVisitationNoteIds.push(id);
    }
    const delSet = new Set(db.deletedVisitationNoteIds);
    db.visitationNotes = (db.visitationNotes || []).filter((n: any) => n && n.id !== id && !delSet.has(n.id));

    if (targetNote && targetNote.memberId) {
      syncMemberNotesFieldFromVisitation(db, targetNote.memberId);
    }

    saveDatabase(db);
    broadcastServerEvent('VISITATION_NOTES_UPDATED', {
      notes: db.visitationNotes,
      deletedNoteIds: db.deletedVisitationNoteIds,
      deletedId: id
    });
    res.json({
      success: true,
      id,
      count: db.visitationNotes.length,
      notes: db.visitationNotes,
      deletedNoteIds: db.deletedVisitationNoteIds
    });
    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full State Endpoint (CLEAN_MASTER_DB_V1 additive sync + scrubbed tombstones)
app.get('/api/state', (_req, res) => {
  try {
    const db = ensureDatabase() as any;
    const members = Array.isArray(db.registrants) ? db.registrants : [];
    const rescueTargets = ['اسطفانوس ادور صديق', 'اسطفانوس ايمن هلال'];
    const rawDeletedIds: string[] = Array.isArray(db.deletedRegistrantIds) ? db.deletedRegistrantIds : [];
    const safeDeletedIds = rawDeletedIds.filter(
      (id) => id && id !== 'reg_owner_main' && id !== 'reg_stephanos_ayman_helal'
    );
    const rawDeletedNames: string[] = Array.isArray(db.deletedRegistrantNames) ? db.deletedRegistrantNames : [];
    const safeDeletedNames = rawDeletedNames.filter(
      (n) => !rescueTargets.some((t) => String(n || '').includes(t))
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      success: true,
      members,
      registrants: members,
      CLEAN_MASTER_DB_V1: members,
      cleanMasterDb: { members },
      tombstones: { ids: safeDeletedIds, names: safeDeletedNames },
      events: Array.isArray(db.events) ? db.events : [],
      competitions: Array.isArray(db.kahootQuizzes) ? db.kahootQuizzes : [],
      attendanceRecords: Array.isArray(db.attendance) ? db.attendance : [],
      rolePermissions: db.rolePermissions || {},
      totalCount: members.length,
      serverTime: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Role Permissions API (تخصيص صلاحيات الرتب وربطها بالدور وتحديث الجلسات فوراً)
app.get('/api/role-permissions', (_req, res) => {
  try {
    const db = ensureDatabase();
    res.json({ success: true, rolePermissions: db.rolePermissions || {} });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/role-permissions', (req, res) => {
  try {
    const { role, permissions, allPermissions } = req.body || {};
    const db = ensureDatabase();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    lastServerRolePermissionsMutationAt = nowMs;

    if (!db.rolePermissions || typeof db.rolePermissions !== 'object') {
      db.rolePermissions = {};
    }
    if (allPermissions && typeof allPermissions === 'object') {
      db.rolePermissions = allPermissions;
    } else if (role && permissions) {
      db.rolePermissions[role] = { ...(db.rolePermissions[role] || {}), ...permissions };
    }

    // Also update all registrants with this role
    const updatedRoleMembers: any[] = [];
    if (role && permissions && Array.isArray(db.registrants)) {
      db.registrants = db.registrants.map((r: any) => {
        if (r && r.role === role) {
          lastServerRegistrantMutationAt[r.id] = nowMs;
          const updatedReg = {
            ...r,
            permissions: {
              ...(r.permissions || {}),
              ...permissions,
              __permissionsUpdatedAt: nowMs
            }
          };
          updatedRoleMembers.push(updatedReg);
          return updatedReg;
        }
        return r;
      });
    }

    saveDatabase(db);
    broadcastServerEvent('ROLE_PERMISSIONS_UPDATED', { role, permissions, allPermissions: db.rolePermissions });
    console.log(`[API] Role permissions updated for role ${role}`);
    res.json({ success: true, rolePermissions: db.rolePermissions });
    persistSystemStateToSupabase(db).catch(() => {});
    if (updatedRoleMembers.length > 0) {
      Promise.all(
        updatedRoleMembers.map(m => supabaseServer.from('registrants').upsert(filterRegistrantForSupabase(m)))
      ).catch(() => {});
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Safe Programmatic Role Revocation: "أمين الاجتماع" (meeting_secretary) -> "member" (ZERO deletions, 100% data preserved)
app.post('/api/roles/revoke-meeting-secretary', (_req, res) => {
  try {
    const db = ensureDatabase() as any;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    lastServerRolePermissionsMutationAt = nowMs;

    const isMeetingSecretaryRole = (r: any) => {
      const val = String(r || '').trim();
      return val === 'meeting_secretary' || val === 'أمين اجتماع' || val === 'أمين الاجتماع';
    };

    const updatedMembers: any[] = [];
    if (Array.isArray(db.registrants)) {
      db.registrants = db.registrants.map((r: any) => {
        if (!r || r.id === 'reg_owner_main' || r.role === 'community_owner') return r;
        if (!isMeetingSecretaryRole(r.role)) return r;
        lastServerRegistrantMutationAt[r.id] = nowMs;
        const cleanedPerms = Array.isArray(r.permissions)
          ? r.permissions.filter((p: any) => !isMeetingSecretaryRole(p))
          : undefined;
        const nextMember: any = {
          ...r,
          role: 'member',
          updatedAt: nowMs,
          lastModifiedAt: nowMs,
          lastUpdatedAt: nowIso
        };
        if (cleanedPerms !== undefined) {
          nextMember.permissions = cleanedPerms;
        } else {
          delete nextMember.permissions;
        }
        updatedMembers.push(nextMember);
        return nextMember;
      });
    }

    const prevRevoked: string[] = Array.isArray(db.revokedRoles) ? db.revokedRoles : [];
    db.revokedRoles = Array.from(new Set([...prevRevoked, 'meeting_secretary']));

    saveDatabase(db);
    broadcastServerEvent('ROLE_PERMISSIONS_UPDATED', {
      action: 'REVOKE_MEETING_SECRETARY_ROLE',
      affectedIds: updatedMembers.map((m) => m.id),
      revokedRoles: db.revokedRoles
    });

    res.json({
      success: true,
      affectedCount: updatedMembers.length,
      affectedIds: updatedMembers.map((m) => m.id),
      revokedRoles: db.revokedRoles
    });

    persistSystemStateToSupabase(db).catch(() => {});
    if (updatedMembers.length > 0) {
      Promise.all(
        updatedMembers.map((m) =>
          supabaseServer.from('registrants').upsert(filterRegistrantForSupabase(m))
        )
      ).catch(() => {});
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Announcements (Deep-merging viewers and reactions so they are never overwritten)
app.post('/api/announcements', async (req, res) => {
  try {
    const { announcements, newAnnouncement } = req.body;
    const db = ensureDatabase();
    if (!Array.isArray(db.announcements)) db.announcements = [];
    if (!Array.isArray(db.deletedAnnouncementIds)) db.deletedAnnouncementIds = [];
    const delAnnSet = new Set(db.deletedAnnouncementIds);

    const existingMap = new Map<string, any>();
    db.announcements.forEach((a: any) => {
      if (a && a.id && !delAnnSet.has(a.id)) existingMap.set(a.id, a);
    });

    const sanitizeAnnouncement = (a: any) => {
      if (!a || typeof a !== 'object') return a;
      return {
        ...a,
        senderPhotoUrl: a.senderRole === 'priest' ? a.senderPhotoUrl : undefined
      };
    };

    let createdOrUpdated: any = undefined;

    if (newAnnouncement && newAnnouncement.id) {
      // If a brand new announcement is explicitly created or edited by admin, ensure it's not blocked by old tombstones
      if (delAnnSet.has(newAnnouncement.id)) {
        delAnnSet.delete(newAnnouncement.id);
        db.deletedAnnouncementIds = Array.from(delAnnSet);
      }
      const cleanAnn = sanitizeAnnouncement(newAnnouncement);
      const prev = existingMap.get(cleanAnn.id);
      const merged = mergeAnnouncementObjectsOnServer(prev, cleanAnn);
      existingMap.set(cleanAnn.id, merged);
      createdOrUpdated = merged;
    }

    if (Array.isArray(announcements)) {
      announcements.forEach((inc: any) => {
        if (!inc || !inc.id || delAnnSet.has(inc.id)) return;
        const cleanInc = sanitizeAnnouncement(inc);
        const prev = existingMap.get(cleanInc.id);
        existingMap.set(cleanInc.id, mergeAnnouncementObjectsOnServer(prev, cleanInc));
      });
    }

    db.announcements = Array.from(existingMap.values()).sort(
      (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    saveDatabase(db);
    broadcastServerEvent('ANNOUNCEMENTS_UPDATED', {
      announcements: db.announcements,
      deletedAnnouncementIds: db.deletedAnnouncementIds,
      newAnnouncement: createdOrUpdated,
      updatedAnnouncement: createdOrUpdated
    });

    if (createdOrUpdated && createdOrUpdated.id) {
      try {
        // @ts-ignore
        const mod = await import('./api/push-notification.js');
        if (mod && typeof mod.saveAnnouncementToCloud === 'function') {
          mod.saveAnnouncementToCloud(createdOrUpdated).catch(() => {});
        }
      } catch {}
      try {
        await supabaseServer.from('announcements').upsert(filterAnnouncementForSupabase(createdOrUpdated));
      } catch {}
    }

    res.json({
      success: true,
      count: db.announcements.length,
      announcements: db.announcements,
      deletedAnnouncementIds: db.deletedAnnouncementIds
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Announcement (Permanently deletes across central server, Supabase, and all devices via tombstones & SSE)
app.delete('/api/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    if (!Array.isArray(db.deletedAnnouncementIds)) db.deletedAnnouncementIds = [];
    if (!db.deletedAnnouncementIds.includes(id)) {
      db.deletedAnnouncementIds.push(id);
    }
    const delAnnSet = new Set(db.deletedAnnouncementIds);
    db.announcements = (db.announcements || []).filter((a: any) => a && a.id && !delAnnSet.has(a.id));
    saveDatabase(db);

    broadcastServerEvent('ANNOUNCEMENTS_UPDATED', {
      announcements: db.announcements,
      deletedId: id,
      deletedAnnouncementIds: db.deletedAnnouncementIds
    });

    // Sync deletion to OneSignal Cloud Hub, Supabase announcements table, deleted_records table, and owner system state
    (async () => {
      try {
        // @ts-ignore
        const mod = await import('./api/push-notification.js');
        if (mod && typeof mod.deleteAnnouncementFromCloud === 'function') {
          await mod.deleteAnnouncementFromCloud(id);
        }
      } catch {}
      try {
        await supabaseServer.from('announcements').delete().eq('id', id);
      } catch {}
      try {
        await supabaseServer.from('deleted_records').upsert({
          id,
          type: 'announcement',
          deletedAt: new Date().toISOString()
        });
      } catch {}
      try {
        await persistSystemStateToSupabase(db);
      } catch {}
    })();

    res.json({
      success: true,
      id,
      count: db.announcements.length,
      announcements: db.announcements,
      deletedAnnouncementIds: db.deletedAnnouncementIds
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record viewer on announcement (Atomic & Real-Time SSE Broadcast)
app.post('/api/announcements/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId, memberName, photoUrl, gender } = req.body;
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'memberId required' });
    }
    const db = ensureDatabase();
    if (!Array.isArray(db.announcements)) db.announcements = [];

    let ann = db.announcements.find((a: any) => a && a.id === id);
    if (!ann) {
      // Pull from Supabase if not yet in local db.json
      try {
        const { data: sbAnn } = await supabaseServer.from('announcements').select('*').eq('id', id).maybeSingle();
        if (sbAnn && sbAnn.id) {
          ann = sbAnn;
          db.announcements.unshift(ann);
        }
      } catch {}
    }
    if (!ann) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    if (!Array.isArray(ann.viewers)) {
      ann.viewers = [];
    }
    const existingIndex = ann.viewers.findIndex((v: any) =>
      v && (v.memberId === memberId || (memberName && v.memberName === memberName))
    );
    const viewerEntry = {
      memberId,
      memberName: memberName || 'عضو',
      photoUrl: photoUrl || '',
      gender: gender || 'male',
      viewedAt: existingIndex >= 0 && ann.viewers[existingIndex]?.viewedAt
        ? ann.viewers[existingIndex].viewedAt
        : new Date().toISOString()
    };
    if (existingIndex >= 0) {
      ann.viewers[existingIndex] = { ...ann.viewers[existingIndex], ...viewerEntry };
    } else {
      ann.viewers.push(viewerEntry);
    }
    saveDatabase(db);

    // Broadcast immediately via SSE so AnnouncementsDashboard updates live across all devices
    broadcastServerEvent('ANNOUNCEMENTS_UPDATED', {
      announcements: db.announcements,
      updatedAnnouncement: ann
    });

    // Sync to Supabase
    try {
      await supabaseServer.from('announcements').update({ viewers: ann.viewers }).eq('id', id);
    } catch {}

    res.json({ success: true, viewersCount: ann.viewers.length, viewers: ann.viewers, announcement: ann });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atomic Toggle Reaction on Announcement (Real-Time SSE Broadcast & Supabase Sync)
app.post('/api/announcements/:id/react', async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId, emoji, memberName, photoUrl, gender } = req.body;
    if (!memberId || !emoji) {
      return res.status(400).json({ success: false, error: 'memberId and emoji required' });
    }
    const db = ensureDatabase();
    if (!Array.isArray(db.announcements)) db.announcements = [];

    let ann = db.announcements.find((a: any) => a && a.id === id);
    if (!ann) {
      try {
        const { data: sbAnn } = await supabaseServer.from('announcements').select('*').eq('id', id).maybeSingle();
        if (sbAnn && sbAnn.id) {
          ann = sbAnn;
          db.announcements.unshift(ann);
        }
      } catch {}
    }
    if (!ann) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    if (!ann.reactions || typeof ann.reactions !== 'object') {
      ann.reactions = {};
    }
    if (!Array.isArray(ann.reactions[emoji])) {
      ann.reactions[emoji] = [];
    }

    const idx = ann.reactions[emoji].indexOf(memberId);
    if (idx !== -1) {
      ann.reactions[emoji].splice(idx, 1);
      if (ann.reactions[emoji].length === 0) {
        delete ann.reactions[emoji];
      }
    } else {
      ann.reactions[emoji].push(memberId);
    }

    // Also ensureanyone who reacts is automatically recorded in viewers ("الشافوا الإعلان")
    if (!Array.isArray(ann.viewers)) {
      ann.viewers = [];
    }
    const hasViewed = ann.viewers.some((v: any) => v && v.memberId === memberId);
    if (!hasViewed) {
      const reg = (db.registrants || []).find((r: any) => r && (r.id === memberId || r.fullName === memberId));
      ann.viewers.push({
        memberId,
        memberName: memberName || reg?.fullName || 'عضو',
        photoUrl: photoUrl || reg?.photoUrl || '',
        gender: gender || reg?.gender || 'male',
        viewedAt: new Date().toISOString()
      });
    }

    saveDatabase(db);

    broadcastServerEvent('ANNOUNCEMENTS_UPDATED', {
      announcements: db.announcements,
      updatedAnnouncement: ann
    });

    try {
      await supabaseServer
        .from('announcements')
        .update({ reactions: ann.reactions, viewers: ann.viewers })
        .eq('id', id);
    } catch {}

    res.json({ success: true, reactions: ann.reactions, viewers: ann.viewers, announcement: ann });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SPECIAL VISITATION ASSIGNMENTS (تكليفات الافتقاد الخاص المركزية)
// ==========================================
app.get('/api/assignments', (_req, res) => {
  const db = ensureDatabase();
  res.json({ success: true, assignments: db.assignments || [], mode: db.visitationMode || 'general' });
});

app.post('/api/assignments', (req, res) => {
  try {
    const { assignments, mode } = req.body;
    const newAssignment = req.body.newAssignment || (req.body && req.body.id && Array.isArray(req.body.memberIds) ? req.body : undefined);
    const db = ensureDatabase();
    if (!Array.isArray(db.assignments)) db.assignments = [];

    // Explicit mode transition if requested
    if (mode === 'general' || mode === 'special') {
      db.visitationMode = mode;
      if (mode === 'general') {
        db.assignments = [];
      }
    }

    // Creating a new special assignment explicitly promotes to special mode
    if (newAssignment && newAssignment.id) {
      db.visitationMode = 'special';
    }

    // In General Visitation mode: wipe and reject background stale assignment restoration
    if (db.visitationMode === 'general' && !newAssignment) {
      db.assignments = [];
      saveDatabase(db);
      persistSystemStateToSupabase(db).catch(() => {});
      return res.json({ success: true, count: 0, assignments: [], mode: 'general' });
    }

    if (Array.isArray(assignments)) {
      if (assignments.length === 0) {
        db.assignments = [];
      } else {
        const existingMap = new Map((db.assignments || []).map((a: any) => [a.id, a]));
        assignments.forEach((a: any) => {
          if (a && a.id) {
            existingMap.set(a.id, { ...(existingMap.get(a.id) || {}), ...a });
          }
        });
        db.assignments = Array.from(existingMap.values());
      }
    }

    if (newAssignment && newAssignment.id) {
      const idx = db.assignments.findIndex((a: any) => a.id === newAssignment.id);
      if (idx >= 0) db.assignments[idx] = { ...db.assignments[idx], ...newAssignment };
      else db.assignments.unshift(newAssignment);
    }

    saveDatabase(db);
    broadcastServerEvent('VISITATION_MODE_CHANGED', { mode: db.visitationMode, assignments: db.assignments });
    broadcastServerEvent('ASSIGNMENTS_UPDATED', { assignments: db.assignments, newAssignment });
    console.log(`[API] Central Special Assignments updated. Total: ${db.assignments.length}, Mode: ${db.visitationMode}`);
    res.json({ success: true, count: db.assignments.length, assignments: db.assignments, mode: db.visitationMode });

    // Non-blocking background sync to Supabase
    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atomic Special Assignment Toggle Member Completed (Isolated strictly to Special Visitation database, NEVER touches General Visitation)
app.post('/api/assignments/:id/toggle-completed', async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId, servantName } = req.body;
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'memberId مطلوب' });
    }

    const db = ensureDatabase();
    if (!Array.isArray(db.assignments)) db.assignments = [];
    if (!db.specialVisitedMembers || typeof db.specialVisitedMembers !== 'object') {
      db.specialVisitedMembers = {};
    }

    const asgn = db.assignments.find((a: any) => a.id === id);
    if (!asgn) {
      return res.status(404).json({ success: false, error: 'التكليف غير موجود في النظام' });
    }

    if (!Array.isArray(asgn.completedMemberIds)) {
      asgn.completedMemberIds = [];
    }
    if (!asgn.completedDetails || typeof asgn.completedDetails !== 'object') {
      asgn.completedDetails = {};
    }

    const compSet = new Set<string>(asgn.completedMemberIds);
    let isCompleted = false;
    const nowIso = new Date().toISOString();
    const actorServant = servantName || asgn.servantName || 'خادم';

    if (compSet.has(memberId)) {
      compSet.delete(memberId);
      isCompleted = false;
      delete asgn.completedDetails[memberId];
      delete db.specialVisitedMembers[memberId];
    } else {
      compSet.add(memberId);
      isCompleted = true;
      asgn.completedDetails[memberId] = {
        visitedBy: actorServant,
        visitedAt: nowIso
      };
      db.specialVisitedMembers[memberId] = {
        memberId,
        visitedBy: actorServant,
        visitedAt: nowIso,
        assignmentId: asgn.id
      };
    }

    asgn.completedMemberIds = Array.from(compSet);

    saveDatabase(db);
    console.log(`[API] Special assignment ${id} member ${memberId} toggled (Special Visitation ONLY): ${isCompleted}. Total special visited: ${Object.keys(db.specialVisitedMembers).length}`);
    
    // Broadcast immediately to ALL devices (Strictly Special Visitation events)
    broadcastServerEvent('ASSIGNMENTS_UPDATED', {
      assignments: db.assignments,
      updatedAssignment: asgn,
      specialVisitedMembers: db.specialVisitedMembers
    });
    broadcastServerEvent('SPECIAL_VISITATION_UPDATED', {
      specialVisitedMembers: db.specialVisitedMembers,
      assignments: db.assignments
    });

    res.json({
      success: true,
      assignment: asgn,
      isCompleted,
      completedMemberIds: asgn.completedMemberIds,
      specialVisitedMembers: db.specialVisitedMembers
    });

    // Background sync to Supabase
    (async () => {
      try {
        await persistSystemStateToSupabase(db);
      } catch (e) {
        console.warn('[Server] Supabase assignment toggle save notice:', e);
      }
    })();
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Direct toggle/uncheck of a member in the Special Visitation "تم افتقادهم" database
app.post('/api/visitation/toggle-special', async (req, res) => {
  try {
    const { memberId, servantName, isVisited } = req.body;
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'memberId مطلوب' });
    }

    const db = ensureDatabase();
    if (!db.specialVisitedMembers || typeof db.specialVisitedMembers !== 'object') {
      db.specialVisitedMembers = {};
    }
    if (!Array.isArray(db.assignments)) {
      db.assignments = [];
    }

    const currentlyVisited = Boolean(db.specialVisitedMembers[memberId]) ||
      db.assignments.some((a: any) => Array.isArray(a.completedMemberIds) && a.completedMemberIds.includes(memberId));
    const nextState = typeof isVisited === 'boolean' ? isVisited : !currentlyVisited;
    const nowIso = new Date().toISOString();
    const actorServant = servantName || 'مسؤول المجتمع';

    if (nextState) {
      db.specialVisitedMembers[memberId] = {
        memberId,
        visitedBy: actorServant,
        visitedAt: nowIso
      };
      db.assignments.forEach((a: any) => {
        if (Array.isArray(a.assignedMemberIds) && a.assignedMemberIds.includes(memberId)) {
          const comp = new Set<string>(a.completedMemberIds || []);
          comp.add(memberId);
          a.completedMemberIds = Array.from(comp);
          if (!a.completedDetails || typeof a.completedDetails !== 'object') a.completedDetails = {};
          a.completedDetails[memberId] = { visitedBy: actorServant, visitedAt: nowIso };
        }
      });
    } else {
      delete db.specialVisitedMembers[memberId];
      db.assignments.forEach((a: any) => {
        if (Array.isArray(a.completedMemberIds) && a.completedMemberIds.includes(memberId)) {
          a.completedMemberIds = a.completedMemberIds.filter((id: string) => id !== memberId);
          if (a.completedDetails && typeof a.completedDetails === 'object') {
            delete a.completedDetails[memberId];
          }
        }
      });
    }

    saveDatabase(db);
    broadcastServerEvent('ASSIGNMENTS_UPDATED', {
      assignments: db.assignments,
      specialVisitedMembers: db.specialVisitedMembers
    });
    broadcastServerEvent('SPECIAL_VISITATION_UPDATED', {
      specialVisitedMembers: db.specialVisitedMembers,
      assignments: db.assignments
    });

    res.json({
      success: true,
      isVisited: nextState,
      specialVisitedMembers: db.specialVisitedMembers,
      assignments: db.assignments
    });

    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/assignments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    db.assignments = (db.assignments || []).filter((a: any) => a.id !== id);
    saveDatabase(db);
    broadcastServerEvent('ASSIGNMENTS_UPDATED', { assignments: db.assignments });
    res.json({ success: true, id, count: db.assignments.length });
    persistSystemStateToSupabase(db).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// CENTRAL KAHOOT QUIZZES, LIVE SESSIONS & SOLO SCORES SYNC
// ==========================================
app.get('/api/kahoot/quizzes', (_req, res) => {
  const db = ensureDatabase();
  const delQuizSet = new Set(db.deletedKahootQuizIds || []);
  const quizzes = (db.kahootQuizzes || []).filter((q: any) => q && q.id && !delQuizSet.has(q.id));
  res.json({
    success: true,
    quizzes,
    deletedKahootQuizIds: db.deletedKahootQuizIds || [],
    sessions: db.kahootSessions || {},
    soloScores: db.kahootSoloScores || []
  });
});

app.post('/api/kahoot/quizzes', async (req, res) => {
  try {
    const { quiz, quizzes } = req.body;
    const db = ensureDatabase();
    if (!Array.isArray(db.kahootQuizzes)) db.kahootQuizzes = [];
    if (!Array.isArray(db.deletedKahootQuizIds)) db.deletedKahootQuizIds = [];
    const delQuizSet = new Set(db.deletedKahootQuizIds);

    const quizMap = new Map<string, any>();
    db.kahootQuizzes.forEach((q: any) => {
      if (q && q.id && !delQuizSet.has(q.id)) quizMap.set(q.id, q);
    });

    if (quiz && quiz.id) {
      if (delQuizSet.has(quiz.id)) {
        delQuizSet.delete(quiz.id);
        db.deletedKahootQuizIds = Array.from(delQuizSet);
      }
      const normalizedQuiz = {
        ...quiz,
        isPublished: quiz.isPublished !== false
      };
      quizMap.set(normalizedQuiz.id, normalizedQuiz);

      // If quiz switched to self_paced mode, close any active live sessions for this quiz immediately
      if (normalizedQuiz.activePlayMode === 'self_paced' && db.kahootSessions && typeof db.kahootSessions === 'object') {
        let closedAny = false;
        Object.values(db.kahootSessions).forEach((s: any) => {
          if (s && s.quizId === normalizedQuiz.id && s.status !== 'finished') {
            s.status = 'finished';
            s.finishedAt = s.finishedAt || new Date().toISOString();
            closedAny = true;
          }
        });
        if (closedAny) {
          broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
            sessions: db.kahootSessions
          });
        }
      }
    }

    if (Array.isArray(quizzes)) {
      quizzes.forEach((inc: any) => {
        if (inc && inc.id && !delQuizSet.has(inc.id)) {
          quizMap.set(inc.id, {
            ...inc,
            isPublished: inc.isPublished !== false
          });
        }
      });
    }

    db.kahootQuizzes = Array.from(quizMap.values()).sort(
      (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    saveDatabase(db);

    broadcastServerEvent('KAHOOT_QUIZZES_UPDATED', {
      quizzes: db.kahootQuizzes,
      deletedKahootQuizIds: db.deletedKahootQuizIds,
      updatedQuiz: quiz
    });

    persistSystemStateToSupabase(db).catch(() => {});

    res.json({
      success: true,
      quizzes: db.kahootQuizzes,
      deletedKahootQuizIds: db.deletedKahootQuizIds
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/kahoot/quizzes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    if (!Array.isArray(db.deletedKahootQuizIds)) db.deletedKahootQuizIds = [];
    if (!db.deletedKahootQuizIds.includes(id)) {
      db.deletedKahootQuizIds.push(id);
    }
    const delSet = new Set(db.deletedKahootQuizIds);
    db.kahootQuizzes = (db.kahootQuizzes || []).filter((q: any) => q && q.id && !delSet.has(q.id));
    // Cascade-delete all solo scores and sessions associated with the deleted quiz
    db.kahootSoloScores = (db.kahootSoloScores || []).filter((s: any) => s && s.quizId && !delSet.has(s.quizId));
    const sessionsMap = db.kahootSessions;
    if (sessionsMap && typeof sessionsMap === 'object') {
      Object.keys(sessionsMap).forEach(pin => {
        const sess = sessionsMap[pin];
        if (!sess || !sess.quizId || delSet.has(sess.quizId)) {
          delete sessionsMap[pin];
        }
      });
    }
    saveDatabase(db);

    broadcastServerEvent('KAHOOT_QUIZZES_UPDATED', {
      quizzes: db.kahootQuizzes,
      deletedId: id,
      deletedKahootQuizIds: db.deletedKahootQuizIds,
      soloScores: db.kahootSoloScores,
      sessions: db.kahootSessions
    });

    persistSystemStateToSupabase(db).catch(() => {});

    res.json({
      success: true,
      id,
      quizzes: db.kahootQuizzes,
      deletedKahootQuizIds: db.deletedKahootQuizIds,
      soloScores: db.kahootSoloScores,
      sessions: db.kahootSessions
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const KAHOOT_STATUS_STAGE_ORDER: Record<string, number> = {
  lobby: 0,
  question_countdown: 1,
  question_active: 2,
  answer_reveal: 3,
  leaderboard: 4,
  podium: 5,
  finished: 6
};

function mergeServerKahootSession(existing: any, incoming: any, replacePlayers?: boolean): any {
  if (!existing) {
    return {
      ...incoming,
      updatedAtMs: Date.now(),
      stateVersion: Number(incoming?.stateVersion || 1)
    };
  }
  const exQIdx = Number(existing.currentQuestionIndex || 0);
  const incQIdx = Number(incoming.currentQuestionIndex || 0);
  const exStage = KAHOOT_STATUS_STAGE_ORDER[existing.status] ?? 0;
  const incStage = KAHOOT_STATUS_STAGE_ORDER[incoming.status] ?? 0;

  // Prevent stale requests from rolling question index or status backward
  let resolvedStatus = incoming.status || existing.status;
  let resolvedQIdx = incQIdx;
  let resolvedQuestionStartedAt = incoming.questionStartedAt ?? existing.questionStartedAt;
  let resolvedTimeLimit = incoming.questionTimeLimitSeconds ?? existing.questionTimeLimitSeconds;

  if (existing.status === 'finished' && incoming.status !== 'lobby') {
    resolvedStatus = 'finished';
    resolvedQIdx = exQIdx;
  } else if (incQIdx < exQIdx && incoming.status !== 'lobby') {
    resolvedStatus = existing.status;
    resolvedQIdx = exQIdx;
    resolvedQuestionStartedAt = existing.questionStartedAt;
    resolvedTimeLimit = existing.questionTimeLimitSeconds;
  } else if (incQIdx === exQIdx && incStage < exStage && incoming.status !== 'lobby') {
    // Same question index: never roll backward (e.g. from leaderboard/answer_reveal back to question_active)
    resolvedStatus = existing.status;
    resolvedQuestionStartedAt = existing.questionStartedAt;
  }

  let mergedPlayers: Record<string, any> = {};
  if (replacePlayers) {
    mergedPlayers = { ...(incoming.players || {}) };
  } else {
    mergedPlayers = { ...(existing.players || {}) };
    if (incoming.players && typeof incoming.players === 'object') {
      Object.keys(incoming.players).forEach((pid) => {
        const incP = incoming.players[pid];
        const exP = mergedPlayers[pid];
        if (!exP) {
          mergedPlayers[pid] = incP;
        } else {
          const exAnswered = Number(exP.totalAnswered || 0);
          const incAnswered = Number(incP.totalAnswered || 0);
          const exScore = Number(exP.score || 0);
          const incScore = Number(incP.score || 0);
          if (exAnswered > incAnswered || exScore > incScore) {
            mergedPlayers[pid] = {
              ...incP,
              ...exP,
              currentRank: exP.currentRank || incP.currentRank,
              previousRank: exP.previousRank || incP.previousRank,
              teamId: incP.teamId || exP.teamId,
              teamName: incP.teamName || exP.teamName
            };
          } else {
            mergedPlayers[pid] = { ...exP, ...incP };
          }
        }
      });
    }
  }

  const mergedAnswers = {
    ...(existing.answersSubmitted || {}),
    ...(incoming.answersSubmitted || {})
  };
  const mergedOpinions = {
    ...(existing.opinionsCollected || {}),
    ...(incoming.opinionsCollected || {})
  };

  return {
    ...existing,
    ...incoming,
    status: resolvedStatus,
    currentQuestionIndex: resolvedQIdx,
    questionStartedAt: resolvedQuestionStartedAt,
    questionTimeLimitSeconds: resolvedTimeLimit,
    players: mergedPlayers,
    answersSubmitted: mergedAnswers,
    opinionsCollected: mergedOpinions,
    updatedAtMs: Date.now(),
    stateVersion: Math.max(Number(existing.stateVersion || 0), Number(incoming.stateVersion || 0)) + 1
  };
}

app.get('/api/kahoot/live-state', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const db = ensureDatabase();
  res.json({
    success: true,
    sessions: db.kahootSessions || {},
    quizzes: db.kahootQuizzes || [],
    soloScores: db.kahootSoloScores || [],
    serverTime: Date.now()
  });
});

app.post('/api/kahoot/sessions', async (req, res) => {
  try {
    const { session, sessions, replacePlayers } = req.body;
    const db = ensureDatabase();
    if (!db.kahootSessions || typeof db.kahootSessions !== 'object') db.kahootSessions = {};

    if (session && session.id) {
      // If starting a new session in lobby, close any other active sessions for the same quiz
      if (session.status === 'lobby') {
        Object.values(db.kahootSessions).forEach((s: any) => {
          if (s && s.id !== session.id && s.status !== 'finished') {
            s.status = 'finished';
            s.finishedAt = s.finishedAt || new Date().toISOString();
            s.updatedAtMs = Date.now();
          }
        });
      }
      const existing = db.kahootSessions[session.id];
      db.kahootSessions[session.id] = mergeServerKahootSession(existing, session, replacePlayers);
    } else if (sessions && typeof sessions === 'object') {
      Object.keys(sessions).forEach((sid) => {
        db.kahootSessions![sid] = mergeServerKahootSession(db.kahootSessions![sid], sessions[sid], replacePlayers);
      });
    }
    saveDatabase(db);

    broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
      sessions: db.kahootSessions,
      updatedSession: session ? db.kahootSessions?.[session.id] : undefined,
      serverTime: Date.now()
    });

    persistSystemStateToSupabase(db).catch(() => {});

    res.json({
      success: true,
      sessions: db.kahootSessions,
      session: session ? db.kahootSessions?.[session.id] : undefined,
      serverTime: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/kahoot/sessions/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const db = ensureDatabase();
    if (db.kahootSessions && typeof db.kahootSessions === 'object') {
      delete db.kahootSessions[pin];
    }
    saveDatabase(db);

    broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
      sessions: db.kahootSessions || {},
      deletedPin: pin,
      serverTime: Date.now()
    });

    persistSystemStateToSupabase(db).catch(() => {});

    res.json({ success: true, sessions: db.kahootSessions || {}, serverTime: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kahoot/solo-scores', async (req, res) => {
  try {
    const { record } = req.body;
    const db = ensureDatabase();
    if (!Array.isArray(db.kahootSoloScores)) db.kahootSoloScores = [];

    if (record && record.quizId && record.playerId) {
      const quiz = (db.kahootQuizzes || []).find((q: any) => q && q.id === record.quizId);
      const allowRetry = quiz?.settings?.allowRetry === true;

      const existingIdx = db.kahootSoloScores.findIndex(
        (r: any) => r && r.quizId === record.quizId && (r.playerId === record.playerId || r.playerName === record.playerName)
      );
      if (existingIdx >= 0) {
        const existingRec = db.kahootSoloScores[existingIdx];
        const wasCompleted = existingRec.status === 'completed' || (!existingRec.status && existingRec.completedAt);
        if (wasCompleted && !allowRetry && record.status === 'in_progress') {
          // Do not overwrite completed final score when retry is disabled
          return res.json({ success: true, soloScores: db.kahootSoloScores, retryBlocked: true });
        }
        // Update live progress or update score (if retry allowed or still in progress or higher score)
        if (!wasCompleted || allowRetry || record.status === 'completed') {
          db.kahootSoloScores[existingIdx] = {
            ...existingRec,
            ...record,
            attemptCount: (existingRec.attemptCount || 1) + (wasCompleted && record.status === 'in_progress' ? 1 : 0),
            updatedAt: new Date().toISOString()
          };
        }
      } else {
        db.kahootSoloScores.push({
          ...record,
          status: record.status || 'completed',
          attemptCount: 1,
          updatedAt: new Date().toISOString()
        });
      }
      db.kahootSoloScores.sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0));
      saveDatabase(db);
      broadcastServerEvent('KAHOOT_SOLO_SCORES_UPDATED', {
        soloScores: db.kahootSoloScores,
        updatedRecord: record
      });
      persistSystemStateToSupabase(db).catch(() => {});
    }

    res.json({ success: true, soloScores: db.kahootSoloScores });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// CENTRAL QUESTION BANK («بنك أسئلة الثلاثة فتية»)
// ==========================================
app.get('/api/kahoot/question-bank', (_req, res) => {
  const db = ensureDatabase();
  res.json({
    success: true,
    questionBank: db.kahootQuestionBank || []
  });
});

app.post('/api/kahoot/question-bank', async (req, res) => {
  try {
    const { item, items } = req.body || {};
    const db = ensureDatabase();
    if (!Array.isArray(db.kahootQuestionBank)) db.kahootQuestionBank = [];

    if (item && item.id) {
      const idx = db.kahootQuestionBank.findIndex((b: any) => b && b.id === item.id);
      if (idx >= 0) {
        db.kahootQuestionBank[idx] = { ...db.kahootQuestionBank[idx], ...item, updatedAt: new Date().toISOString() };
      } else {
        db.kahootQuestionBank.unshift({ ...item, createdAt: item.createdAt || new Date().toISOString() });
      }
    }
    if (Array.isArray(items)) {
      const map = new Map<string, any>();
      db.kahootQuestionBank.forEach((b: any) => { if (b && b.id) map.set(b.id, b); });
      items.forEach((b: any) => { if (b && b.id) map.set(b.id, b); });
      db.kahootQuestionBank = Array.from(map.values());
    }

    saveDatabase(db);
    broadcastServerEvent('KAHOOT_QUESTION_BANK_UPDATED', {
      questionBank: db.kahootQuestionBank,
      updatedItem: item
    });
    persistSystemStateToSupabase(db).catch(() => {});

    res.json({ success: true, questionBank: db.kahootQuestionBank });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/kahoot/question-bank/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = ensureDatabase();
    if (!Array.isArray(db.kahootQuestionBank)) db.kahootQuestionBank = [];
    db.kahootQuestionBank = db.kahootQuestionBank.filter((b: any) => b && b.id !== id);
    saveDatabase(db);
    broadcastServerEvent('KAHOOT_QUESTION_BANK_UPDATED', {
      questionBank: db.kahootQuestionBank,
      deletedId: id
    });
    persistSystemStateToSupabase(db).catch(() => {});
    res.json({ success: true, questionBank: db.kahootQuestionBank });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SERVER-AUTHORITATIVE KAHOOT SESSION ACTIONS (JOIN, ANSWER, KICK, CONTROLS)
// ==========================================
app.post('/api/kahoot/sessions/:pin/join', async (req, res) => {
  try {
    const { pin } = req.params;
    const { player, teamId } = req.body || {};
    const db = ensureDatabase();
    let session = db.kahootSessions?.[pin];
    let pinMatchedTeamId: string | undefined;
    if (!session && db.kahootSessions) {
      session = Object.values(db.kahootSessions).find(
        (s: any) => s && s.status !== 'finished' && s.teams && Object.values(s.teams).some((t: any) => t?.pin === pin)
      );
      if (session && session.teams) {
        const matchedTeam: any = Object.values(session.teams).find((t: any) => t?.pin === pin);
        pinMatchedTeamId = matchedTeam?.id;
      }
    }
    if (!session) {
      return res.status(404).json({ success: false, error: 'رقم الجلسة غير موجود أو انتهت المسابقة' });
    }
    if (session.status === 'finished') {
      return res.status(400).json({ success: false, error: 'هذه المسابقة انتهت بالفعل' });
    }
    const existingPlayer = session.players?.[player?.id];
    if (session.isLocked && !existingPlayer) {
      return res.status(403).json({ success: false, error: 'تم قفل الانضمام لهذه الجلسة من قبل الخادم المسؤول 🔒' });
    }
    if (session.status !== 'lobby' && session.allowLateJoin === false && !existingPlayer) {
      return res.status(403).json({ success: false, error: 'المسابقة بدأت بالفعل ولا يُسمح بالانضمام المتأخر' });
    }
    const currentCount = Object.keys(session.players || {}).length;
    if (!existingPlayer && session.maxPlayersLimit && session.maxPlayersLimit > 0 && currentCount >= session.maxPlayersLimit) {
      return res.status(403).json({ success: false, error: `اكتمل العدد الأقصى للمشاركين (${session.maxPlayersLimit})` });
    }

    if (!session.players) session.players = {};
    let assignedTeamId = pinMatchedTeamId || teamId || player?.teamId || existingPlayer?.teamId;
    let assignedTeamName = existingPlayer?.teamName;

    if (session.gameMode === 'team') {
      if (!session.teams || Object.keys(session.teams).length === 0) {
        session.teams = {
          team_1: { id: 'team_1', name: 'فريق شدرخ 🔥', color: 'red', icon: '🔥', score: 0 },
          team_2: { id: 'team_2', name: 'فريق ميشخ ⚡', color: 'blue', icon: '⚡', score: 0 },
          team_3: { id: 'team_3', name: 'فريق عبد نغو 🛡️', color: 'green', icon: '🛡️', score: 0 },
          team_4: { id: 'team_4', name: 'فريق دانيال 🦁', color: 'yellow', icon: '🦁', score: 0 }
        };
      }
      if (!assignedTeamId || !session.teams[assignedTeamId]) {
        // Auto-balance into team with fewest players
        const teamIds = Object.keys(session.teams);
        const counts: Record<string, number> = {};
        teamIds.forEach(tid => { counts[tid] = 0; });
        Object.values(session.players).forEach((p: any) => {
          if (p?.teamId && counts[p.teamId] !== undefined) counts[p.teamId]++;
        });
        assignedTeamId = teamIds.sort((a, b) => counts[a] - counts[b])[0];
      }
      assignedTeamName = session.teams[assignedTeamId]?.name;
    }

    session.players[player.id] = {
      ...(existingPlayer || {
        score: 0,
        streak: 0,
        currentRank: currentCount + 1,
        previousRank: currentCount + 1,
        correctCount: 0,
        totalAnswered: 0,
        totalTimeMs: 0
      }),
      ...player,
      score: existingPlayer?.score ?? player?.score ?? 0,
      streak: existingPlayer?.streak ?? player?.streak ?? 0,
      correctCount: existingPlayer?.correctCount ?? player?.correctCount ?? 0,
      totalAnswered: existingPlayer?.totalAnswered ?? player?.totalAnswered ?? 0,
      totalTimeMs: existingPlayer?.totalTimeMs ?? player?.totalTimeMs ?? 0,
      teamId: assignedTeamId,
      teamName: assignedTeamName,
      isOnline: true
    };

    if (session.gameMode === 'team' && session.teams) {
      Object.keys(session.teams).forEach(tid => {
        session.teams[tid].memberCount = Object.values(session.players).filter((p: any) => p?.teamId === tid).length;
      });
    }

    session.updatedAtMs = Date.now();
    session.stateVersion = Number(session.stateVersion || 0) + 1;

    // Update quiz participantsCount
    const quizIdx = (db.kahootQuizzes || []).findIndex((q: any) => q && q.id === session.quizId);
    if (quizIdx >= 0 && !existingPlayer) {
      db.kahootQuizzes![quizIdx].participantsCount = Math.max(
        Object.keys(session.players).length,
        (db.kahootQuizzes![quizIdx].participantsCount || 0) + 1
      );
    }

    saveDatabase(db);
    broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
      sessions: db.kahootSessions,
      updatedSession: session,
      serverTime: Date.now()
    });
    persistSystemStateToSupabase(db).catch(() => {});

    res.json({ success: true, session, player: session.players[player.id], serverTime: Date.now() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kahoot/sessions/:pin/answer', async (req, res) => {
  try {
    const { pin } = req.params;
    const { playerId, playerName, questionId, answer, answerLabel, isCorrect, points, timeElapsedMs, isOpinion } = req.body || {};
    const db = ensureDatabase();
    if (!db.kahootSessions || !db.kahootSessions[pin]) {
      return res.status(404).json({ success: false, error: 'الجلسة غير موجودة' });
    }
    const session = db.kahootSessions[pin];
    if (!session.answersSubmitted) session.answersSubmitted = {};
    if (!session.players) session.players = {};

    const submissionKey = `${playerId}_${questionId}`;
    // Prevent duplicate submission for the same player & question
    if (session.answersSubmitted[submissionKey]) {
      return res.json({
        success: true,
        duplicate: true,
        session,
        submission: session.answersSubmitted[submissionKey],
        serverTime: Date.now()
      });
    }

    // Reject late answers if status already moved past question_active
    if (session.status !== 'question_active') {
      return res.status(400).json({
        success: false,
        lateRejected: true,
        error: 'انتهى وقت السؤال ولا يمكن قبول إجابات إضافية',
        session,
        serverTime: Date.now()
      });
    }
    if (session.questionStartedAt && session.questionTimeLimitSeconds > 0) {
      const elapsedSinceStartMs = Date.now() - Number(session.questionStartedAt);
      if (elapsedSinceStartMs > (Number(session.questionTimeLimitSeconds) + 3) * 1000) {
        return res.status(400).json({
          success: false,
          lateRejected: true,
          error: 'انتهى وقت السؤال ولا يمكن قبول إجابات إضافية',
          session,
          serverTime: Date.now()
        });
      }
    }

    const earnedPoints = isOpinion ? 0 : Math.max(0, Number(points) || 0);
    const elapsed = Math.max(0, Number(timeElapsedMs) || 0);

    // Ensure player exists in session
    if (!session.players[playerId]) {
      const nextRank = Object.keys(session.players).length + 1;
      session.players[playerId] = {
        id: playerId,
        name: playerName || 'مشارك',
        score: 0,
        streak: 0,
        currentRank: nextRank,
        previousRank: nextRank,
        correctCount: 0,
        totalAnswered: 0,
        totalTimeMs: 0,
        isOnline: true
      };
    }

    const p = session.players[playerId];
    p.totalAnswered = (p.totalAnswered || 0) + 1;
    p.totalTimeMs = (p.totalTimeMs || 0) + elapsed;
    p.lastAnswerTimeMs = elapsed;

    if (isOpinion) {
      if (!session.opinionsCollected) session.opinionsCollected = {};
      if (!Array.isArray(session.opinionsCollected[questionId])) {
        session.opinionsCollected[questionId] = [];
      }
      session.opinionsCollected[questionId].push({
        playerId,
        playerName: session.showParticipantNames === false ? 'مشارك' : (p.name || playerName || 'مشارك'),
        response: answer,
        createdAt: Date.now(),
        upvotes: 1
      });
      p.lastAnswerCorrect = true;
      p.lastPointsEarned = 0;
    } else {
      if (isCorrect) {
        p.streak = (p.streak || 0) + 1;
        p.correctCount = (p.correctCount || 0) + 1;
        // Apply streak bonus (+100 per streak above 1, max +500)
        const streakBonus = p.streak > 1 ? Math.min(500, (p.streak - 1) * 100) : 0;
        const finalPoints = earnedPoints + streakBonus;
        p.score = (p.score || 0) + finalPoints;
        p.lastAnswerCorrect = true;
        p.lastPointsEarned = finalPoints;
      } else {
        p.streak = 0;
        p.lastAnswerCorrect = false;
        p.lastPointsEarned = 0;
      }
    }

    session.answersSubmitted[submissionKey] = {
      playerId,
      playerName: p.name || playerName,
      teamId: p.teamId,
      questionId,
      answer,
      answerLabel,
      isCorrect: Boolean(isCorrect),
      points: p.lastPointsEarned || 0,
      timeElapsedMs: elapsed,
      submittedAt: Date.now()
    };

    // Compute exact pre-question ranks (before this question's points) and post-question ranks
    const allPlayersList: any[] = Object.values(session.players);
    const preSortedPlayers = [...allPlayersList].sort((a: any, b: any) => {
      const aSub = session.answersSubmitted[`${a.id}_${questionId}`];
      const bSub = session.answersSubmitted[`${b.id}_${questionId}`];
      const aPreScore = Math.max(0, Number(a.score || 0) - Number(aSub?.points || 0));
      const bPreScore = Math.max(0, Number(b.score || 0) - Number(bSub?.points || 0));
      if (bPreScore !== aPreScore) return bPreScore - aPreScore;
      return String(a.id).localeCompare(String(b.id));
    });
    const preRankMap: Record<string, number> = {};
    preSortedPlayers.forEach((pl: any, idx: number) => {
      preRankMap[pl.id] = idx + 1;
    });

    const postSortedPlayers = [...allPlayersList].sort((a: any, b: any) => {
      const diff = Number(b.score || 0) - Number(a.score || 0);
      if (diff !== 0) return diff;
      return Number(a.totalTimeMs || 0) - Number(b.totalTimeMs || 0);
    });
    postSortedPlayers.forEach((pl: any, idx: number) => {
      if (session.players[pl.id]) {
        session.players[pl.id].previousRank = preRankMap[pl.id] || (idx + 1);
        session.players[pl.id].currentRank = idx + 1;
      }
    });

    // Recalculate cumulative team scores and ranks
    if (session.gameMode === 'team' && session.teams) {
      Object.values(session.teams).forEach((team: any) => {
        const teamPlayers = Object.values(session.players).filter((pl: any) => pl?.teamId === team.id);
        team.memberCount = teamPlayers.length;
        team.score = teamPlayers.reduce((sum: number, pl: any) => sum + (pl?.score || 0), 0);
        const qPts = Object.values(session.answersSubmitted)
          .filter((sub: any) => sub?.questionId === questionId && sub?.teamId === team.id)
          .reduce((sum: number, sub: any) => sum + (sub?.points || 0), 0);
        team.lastQuestionPoints = qPts;
      });
      const allTeamsList: any[] = Object.values(session.teams);
      const preSortedTeams = [...allTeamsList].sort((a: any, b: any) => {
        const aPre = Math.max(0, Number(a.score || 0) - Number(a.lastQuestionPoints || 0));
        const bPre = Math.max(0, Number(b.score || 0) - Number(b.lastQuestionPoints || 0));
        return bPre - aPre;
      });
      const preTeamRankMap: Record<string, number> = {};
      preSortedTeams.forEach((tm: any, idx: number) => {
        preTeamRankMap[tm.id] = idx + 1;
      });
      const sortedTeams = [...allTeamsList].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      sortedTeams.forEach((tm: any, idx: number) => {
        if (session.teams[tm.id]) {
          session.teams[tm.id].previousRank = preTeamRankMap[tm.id] || (idx + 1);
          session.teams[tm.id].currentRank = idx + 1;
        }
      });
    }

    // If all joined players have answered this question, automatically advance session status to 'leaderboard'
    const totalPlayersCount = Object.keys(session.players).length;
    const submittedForQuestionCount = Object.keys(session.answersSubmitted).filter((k) => k.endsWith(`_${questionId}`)).length;
    if (totalPlayersCount > 0 && submittedForQuestionCount >= totalPlayersCount) {
      session.status = 'leaderboard';
    }

    session.updatedAtMs = Date.now();
    session.stateVersion = Number(session.stateVersion || 0) + 1;

    saveDatabase(db);
    broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
      sessions: db.kahootSessions,
      updatedSession: session,
      serverTime: Date.now()
    });
    persistSystemStateToSupabase(db).catch(() => {});

    res.json({
      success: true,
      session,
      player: session.players[playerId],
      submission: session.answersSubmitted[submissionKey]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kahoot/sessions/:pin/kick', async (req, res) => {
  try {
    const { pin } = req.params;
    const { playerId } = req.body || {};
    const db = ensureDatabase();
    const session = db.kahootSessions?.[pin];
    if (!session) return res.status(404).json({ success: false, error: 'الجلسة غير موجودة' });
    if (session.players && playerId && session.players[playerId]) {
      delete session.players[playerId];
      saveDatabase(db);
      broadcastServerEvent('KAHOOT_SESSIONS_UPDATED', {
        sessions: db.kahootSessions,
        updatedSession: session,
        kickedPlayerId: playerId
      });
      persistSystemStateToSupabase(db).catch(() => {});
    }
    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// GEMINI AI QUIZ GENERATOR FOR THREE YOUTHS
// ==========================================
app.post('/api/kahoot/ai-generate', async (req, res) => {
  try {
    const { 
      mode = 'ai', 
      topic = 'سفر دانيال والفتية الثلاثة', 
      questionsCount = 5, 
      difficulty = 'متوسط',
      url = '',
      docText = '',
      docDataUrl = '',
      customPrompt = '',
      language = 'auto',
      selectedQuestionTypes = []
    } = req.body;

    const count = Math.min(50, Math.max(1, Number(questionsCount) || 5));
    const apiKey = process.env.GEMINI_API_KEY;
    const cleanCustomPrompt = typeof customPrompt === 'string' ? customPrompt.trim() : '';

    // Helper to decode HTML entities (decimal, hex, named) and strip replacement chars (\uFFFD / )
    const sanitizeDecodedText = (input: string): string => {
      if (!input) return '';
      return input
        .replace(/&#(\d+);/g, (_, dec) => {
          const code = parseInt(dec, 10);
          return !isNaN(code) ? String.fromCodePoint(code) : ' ';
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
          const code = parseInt(hex, 16);
          return !isNaN(code) ? String.fromCodePoint(code) : ' ';
        })
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\uFFFD+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Smart buffer decoder that detects windows-1256 / iso-8859-6 (used by st-takla.org & classic Arabic sites)
    const decodeWebpageBuffer = (buf: ArrayBuffer, contentTypeHeader: string): string => {
      const uint8 = new Uint8Array(buf);
      const asciiPreview = new TextDecoder('latin1').decode(uint8.slice(0, 4096));
      const headerLower = (contentTypeHeader || '').toLowerCase();
      const metaLower = asciiPreview.toLowerCase();

      let detectedEncoding = 'utf-8';
      if (headerLower.includes('windows-1256') || metaLower.includes('windows-1256') || headerLower.includes('cp1256') || metaLower.includes('cp1256')) {
        detectedEncoding = 'windows-1256';
      } else if (headerLower.includes('iso-8859-6') || metaLower.includes('iso-8859-6')) {
        detectedEncoding = 'iso-8859-6';
      }

      if (detectedEncoding !== 'utf-8') {
        try {
          return new TextDecoder(detectedEncoding).decode(uint8);
        } catch {
          // fallback below
        }
      }

      const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      // If UTF-8 decoding produced replacement characters (), try windows-1256!
      const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length;
      if (replacementCount > 2) {
        try {
          const win1256Text = new TextDecoder('windows-1256').decode(uint8);
          const winReplacementCount = (win1256Text.match(/\uFFFD/g) || []).length;
          if (winReplacementCount < replacementCount) {
            return win1256Text;
          }
        } catch {}
      }
      return utf8Text;
    };

    let extractedUrlTitle = '';
    let extractedUrlText = '';
    if (mode === 'url' && url && typeof url === 'string') {
      const cleanUrl = url.trim();
      const parseHtmlToText = (rawHtml: string) => {
        const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          extractedUrlTitle = sanitizeDecodedText(titleMatch[1]);
        }
        const ogTitleMatch = rawHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        if (!extractedUrlTitle && ogTitleMatch?.[1]) {
          extractedUrlTitle = sanitizeDecodedText(ogTitleMatch[1]);
        }
        const ogDescMatch = rawHtml.match(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i);
        const strippedText = sanitizeDecodedText(
          rawHtml
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
        ).slice(0, 6000);
        extractedUrlText = [extractedUrlTitle, sanitizeDecodedText(ogDescMatch?.[1] || ''), strippedText].filter(Boolean).join('\n').trim();
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const pageRes = await fetch(cleanUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
          }
        });
        clearTimeout(timeoutId);
        if (pageRes.ok) {
          const buf = await pageRes.arrayBuffer();
          const rawHtml = decodeWebpageBuffer(buf, pageRes.headers.get('content-type') || '');
          parseHtmlToText(rawHtml);
        }
      } catch {
        // Direct fetch failed or timed out; try reader proxy fallback below
      }

      if (!extractedUrlText || extractedUrlText.length < 80) {
        try {
          const jinaController = new AbortController();
          const jinaTimeout = setTimeout(() => jinaController.abort(), 4500);
          const jinaRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
            signal: jinaController.signal,
            headers: {
              'Accept': 'text/plain; charset=utf-8',
              'X-Return-Format': 'text'
            }
          });
          clearTimeout(jinaTimeout);
          if (jinaRes.ok) {
            const buf = await jinaRes.arrayBuffer();
            const readerText = sanitizeDecodedText(decodeWebpageBuffer(buf, jinaRes.headers.get('content-type') || ''));
            if (readerText.length > 40) {
              const firstLine = readerText.split('\n').find(l => l.trim().length > 3)?.replace(/^Title:\s*/i, '').trim() || '';
              if (!extractedUrlTitle && firstLine) {
                extractedUrlTitle = firstLine.slice(0, 120);
              }
              extractedUrlText = readerText.slice(0, 6000);
            }
          }
        } catch {
          // Reader proxy also timed out; proceed immediately with URL & prompt context
        }
      }
    }

    // Determine target language ('ar' or 'en')
    const combinedInputSample = `${topic || ''} ${cleanCustomPrompt || ''} ${extractedUrlTitle || ''} ${docText || ''}`.trim();
    const arabicCharMatches = (combinedInputSample.match(/[\u0600-\u06FF]/g) || []).length;
    const latinCharMatches = (combinedInputSample.match(/[A-Za-z]/g) || []).length;
    const resolvedLang: 'ar' | 'en' =
      language === 'en'
        ? 'en'
        : language === 'ar'
        ? 'ar'
        : latinCharMatches > arabicCharMatches * 2 && latinCharMatches > 10
        ? 'en'
        : 'ar';

    // Determine requested question types
    const validTypes = ['quiz', 'true_false', 'puzzle', 'type_answer', 'matching', 'slider', 'pin_answer', 'poll', 'word_cloud'];
    const requestedTypes: string[] = Array.isArray(selectedQuestionTypes)
      ? selectedQuestionTypes.filter((t: any) => typeof t === 'string' && validTypes.includes(t))
      : [];

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
            timeout: 16000
          }
        });

        let promptContext = '';
        if (mode === 'url' && url) {
          promptContext = resolvedLang === 'en'
            ? `Generate an interactive quiz strictly based on this URL: ${url}.\n${extractedUrlTitle ? `Page Title: ${extractedUrlTitle}\n` : ''}${extractedUrlText ? `Extracted Page Content:\n${extractedUrlText.slice(0, 4000)}` : ''}`
            : `قم بتوليد مسابقة تفاعلية مبنية بدقة على هذا الرابط: ${url}.\n${extractedUrlTitle ? `عنوان الصفحة: ${extractedUrlTitle}\n` : ''}${extractedUrlText ? `محتوى الصفحة المستخرج:\n${extractedUrlText.slice(0, 4000)}` : ''}`;
        } else if (mode === 'scan_doc') {
          promptContext = resolvedLang === 'en'
            ? `Extract and generate interactive quiz questions based on the uploaded document/image${docText ? `:\n"${docText.slice(0, 4000)}"` : '.'}`
            : `قم باستخراج وتوليد أسئلة مسابقة تفاعلية بناءً على المستند/الصورة المرفوعة${docText ? `:\n"${docText.slice(0, 4000)}"` : '.'}`;
        } else {
          promptContext = resolvedLang === 'en'
            ? `Generate a complete interactive quiz about the following topic: "${topic}".`
            : `قم بتوليد مسابقة تفاعلية متكاملة حول الموضوع التالي: "${topic}".`;
        }

        if (cleanCustomPrompt) {
          promptContext += resolvedLang === 'en'
            ? `\n\nCreator Custom Instructions (follow these specifications strictly):\n"${cleanCustomPrompt}"`
            : `\n\nتعليمات وتوصيف منشئ المسابقة المخصص (التزم بهذه المواصفات بدقة تامة كأنك نموذج مصمم خصيصاً لطلبه من حيث نوع الأسئلة، أسلوبها، ومحتواها):\n"${cleanCustomPrompt}"`;
        }

        const typesConstraintText = requestedTypes.length > 0
          ? (resolvedLang === 'en'
              ? `STRICT REQUIREMENT: Generate questions ONLY using these selected question types: [${requestedTypes.join(', ')}]. Distribute the ${count} questions across these selected types.`
              : `شرط إلزامي صارم: قم بتوليد الأسئلة فقط من الأنواع التالية التي اختارها الخادم: [${requestedTypes.join(', ')}]. وزّع الـ ${count} أسئلة على هذه الأنواع المختارة فقط.`)
          : (resolvedLang === 'en'
              ? `Smartly vary the questions across the available question types.`
              : `نوّع الأسئلة بذكاء بين الأنواع المتاحة.`);

        const langInstruction = resolvedLang === 'en'
          ? `IMPORTANT: Generate the entire quiz (title, description, question titles, options, and answers) in ENGLISH.`
          : `مهم جداً: قم بتوليد المسابقة بالكامل (العنوان، الوصف، نصوص الأسئلة، والخيارات) باللغة العربية الفصحى السليمة وبدون أي رموز غير مفهومة.`;

        const systemPrompt = `أنت نموذج ذكاء اصطناعي خبير في تصميم وإنشاء المسابقات التفاعلية بنظام Kahoot.
المطلوب توليد مسابقة تفاعلية تحتوي بالضبط على عدد (${count}) أسئلة بمستوى صعوبة (${difficulty}).
${langInstruction}
${typesConstraintText}

الأنواع المتاحة في النظام وكيفية تمثيلها في JSON:
1. 'quiz': اختيار من متعدد (4 خيارات في حقل options بألوان red, blue, yellow, green وأشكال triangle, diamond, circle, square، وخيار واحد فقط isCorrect: true).
2. 'true_false': صح أم خطأ (خياران في حقل options: الأول صح/True بلون blue وشكل diamond، والثاني خطأ/False بلون red وشكل triangle).
3. 'puzzle': ترتيب 4 عناصر زمنياً أو منطقياً (حقل puzzleItems يحتوي على 4 عناصر لكل منها id, text, correctIndex من 0 إلى 3).
4. 'type_answer': كتابة الإجابة نصياً مع حقل correctTextAnswer ومصفوفة إجابات بديلة مقبولة في acceptableTextAnswers.
5. 'matching': توصيل ومطابقة الأزواج (حقل matchingPairs يحتوي على 4 أزواج لكل منها id, leftText, rightText).
6. 'slider': شريط تمرير رقمي مع sliderMin, sliderMax, sliderStep (مثلاً 1), sliderCorrectValue, sliderMarginOfError.
7. 'pin_answer': تحديد بالدبوس على الصورة مع حقل pinCoordinates: { "xPercent": 50, "yPercent": 50, "tolerancePercent": 18 } وحقل mediaUrl (صورة توضيحية).
8. 'poll': استطلاع رأي بدون نقاط (isOpinion: true مع 4 خيارات في options).
9. 'word_cloud': سحابة كلمات لجمع الآراء بدون نقاط (isOpinion: true).

أرجع النتيجة بصيغة JSON فقط بهذا الشكل الدقيق (مع التأكد أن مصفوفة questions تحتوي على ${count} عنصر بالضبط):
{
  "title": "عنوان جذاب للمسابقة",
  "description": "وصف مشوق للمسابقة",
  "questions": [
    {
      "id": "q1",
      "type": "quiz",
      "title": "نص السؤال؟",
      "timeLimitSeconds": 20,
      "pointsMultiplier": 1,
      "options": [
        { "id": "opt_1", "text": "الخيار الأول", "isCorrect": true, "color": "red", "shape": "triangle" },
        { "id": "opt_2", "text": "الخيار الثاني", "isCorrect": false, "color": "blue", "shape": "diamond" },
        { "id": "opt_3", "text": "الخيار الثالث", "isCorrect": false, "color": "yellow", "shape": "circle" },
        { "id": "opt_4", "text": "الخيار الرابع", "isCorrect": false, "color": "green", "shape": "square" }
      ]
    }
  ]
}`;

        const contentsPayload: any[] = [];
        if (mode === 'scan_doc' && typeof docDataUrl === 'string' && docDataUrl.startsWith('data:')) {
          const commaIdx = docDataUrl.indexOf(',');
          const headerPart = docDataUrl.slice(0, commaIdx);
          const base64Data = docDataUrl.slice(commaIdx + 1);
          const mimeMatch = headerPart.match(/^data:([^;]+);base64$/i);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          contentsPayload.push({
            inlineData: {
              mimeType,
              data: base64Data
            }
          });
        }
        contentsPayload.push({ text: `${systemPrompt}\n\n${promptContext}` });

        const response = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: contentsPayload,
            config: {
              responseMimeType: 'application/json',
            }
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini request timed out')), 16000)
          )
        ]);

        const text = response.text?.trim() || '';
        if (text) {
          const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleanedJson);
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            const normalizedQuestions = parsed.questions.slice(0, count).map((q: any, idx: number) => {
              const qType = q.type || (requestedTypes[idx % Math.max(1, requestedTypes.length)] || 'quiz');
              return {
                ...q,
                id: q.id || `q_${Date.now()}_${idx + 1}`,
                type: qType,
                title: sanitizeDecodedText(q.title || '') || (resolvedLang === 'en' ? `Question ${idx + 1}` : `السؤال ${idx + 1}`),
                timeLimitSeconds: Number(q.timeLimitSeconds) || 20,
                pointsMultiplier: Number(q.pointsMultiplier) ?? 1,
                ...(qType === 'pin_answer' || qType === 'drop_pin'
                  ? {
                      mediaUrl: q.mediaUrl || 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1000&q=80',
                      pinCoordinates: {
                        xPercent: Number(q.pinCoordinates?.xPercent) || 50,
                        yPercent: Number(q.pinCoordinates?.yPercent) || 50,
                        tolerancePercent: Number(q.pinCoordinates?.tolerancePercent) || 18
                      }
                    }
                  : {})
              };
            });

            return res.json({
              success: true,
              title: sanitizeDecodedText(parsed.title || '') || (resolvedLang === 'en' ? `${extractedUrlTitle || topic} Quiz 🏆` : `مسابقة ${extractedUrlTitle || topic} 🏆`),
              description: sanitizeDecodedText(parsed.description || '') || (resolvedLang === 'en' ? `Interactive quiz about ${extractedUrlTitle || topic}` : `مسابقة تفاعلية شيقة حول ${extractedUrlTitle || topic}`),
              questions: normalizedQuestions
            });
          }
        }
      } catch {
        // Quietly fall back to smart question generator if API times out or is unreachable
      }
    }

    // High quality smart generator if API key is absent or network times out
    const readableUrlName = mode === 'url' && url
      ? (() => {
          try {
            const parsedUrl = new URL(url.trim());
            const pathSeg = sanitizeDecodedText(decodeURIComponent(parsedUrl.pathname).replace(/\.(html?|php|aspx?|jsp)$/i, '').replace(/[\/\-_]+/g, ' '));
            return pathSeg.length > 3 ? `${parsedUrl.hostname.replace(/^www\./, '')} - ${pathSeg.slice(0, 45)}` : parsedUrl.hostname.replace(/^www\./, '');
          } catch {
            return sanitizeDecodedText(url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50));
          }
        })()
      : '';

    const rawCleanTopic = sanitizeDecodedText(extractedUrlTitle) || readableUrlName || sanitizeDecodedText(topic) || sanitizeDecodedText(cleanCustomPrompt.slice(0, 50)) || (resolvedLang === 'en' ? 'Bible & Youth Fellowship' : 'الثلاثة فتية وسفر دانيال');
    const cleanTopic = rawCleanTopic.replace(/\uFFFD+/g, '').trim() || (resolvedLang === 'en' ? 'Youth Quiz' : 'مسابقة الشباب');

    const sourceSentences = sanitizeDecodedText(extractedUrlText || docText || cleanCustomPrompt || '')
      .split(/[\.\n!؟\?؛]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 20 && s.length <= 180 && !s.includes('\uFFFD'));

    const activeTypesPool: string[] = requestedTypes.length > 0
      ? requestedTypes
      : ['quiz', 'true_false', 'puzzle', 'type_answer', 'matching', 'slider'];

    const buildFallbackQuestionByType = (qType: string, idx: number): any => {
      const sentence = sourceSentences[idx % Math.max(1, sourceSentences.length)] || '';
      const isEn = resolvedLang === 'en';
      const qId = `q_${Date.now()}_${idx + 1}`;

      if (qType === 'true_false') {
        return {
          id: qId,
          type: 'true_false',
          title: isEn
            ? (sentence ? `True or False based on (${cleanTopic.slice(0, 45)}): "${sentence.slice(0, 110)}"?` : `Statement #${idx + 1}: The core message of (${cleanTopic.slice(0, 45)}) emphasizes faithfulness and spiritual steadfastness.`)
            : (sentence ? `صح أم خطأ حسب ما ورد في (${cleanTopic.slice(0, 45)}): "${sentence.slice(0, 110)}"؟` : `يركز موضوع (${cleanTopic.slice(0, 50)}) على الثبات في المبادئ الروحية والأمانة العملية (سؤال ${idx + 1}).`),
          timeLimitSeconds: 15,
          pointsMultiplier: 1,
          options: [
            { id: 'tf_1', text: isEn ? 'True ✔️' : 'صح (True) ✔️', isCorrect: true, color: 'blue', shape: 'diamond' },
            { id: 'tf_2', text: isEn ? 'False ❌' : 'خطأ (False) ❌', isCorrect: false, color: 'red', shape: 'triangle' }
          ]
        };
      }

      if (qType === 'puzzle') {
        return {
          id: qId,
          type: 'puzzle',
          title: isEn
            ? `Order the spiritual & practical steps related to (${cleanTopic.slice(0, 45)}) from start to finish:`
            : `رتب الخطوات الروحية والعملية المرتبطة بـ (${cleanTopic.slice(0, 45)}) بالترتيب الصحيح:`,
          timeLimitSeconds: 25,
          pointsMultiplier: 2,
          puzzleItems: isEn
            ? [
                { id: 'p1', text: 'Prayer and seeking God first', correctIndex: 0 },
                { id: 'p2', text: 'Standing firm in faith without fear', correctIndex: 1 },
                { id: 'p3', text: 'Faithful witness before everyone', correctIndex: 2 },
                { id: 'p4', text: 'Thanksgiving and glorifying God', correctIndex: 3 }
              ]
            : [
                { id: 'p1', text: 'الصلاة واللجوء لله أولاً', correctIndex: 0 },
                { id: 'p2', text: 'الثبات على الإيمان وعدم الخوف', correctIndex: 1 },
                { id: 'p3', text: 'الشهادة الحية للحق أمام الجميع', correctIndex: 2 },
                { id: 'p4', text: 'الشكر والتسبيح لنصرة الله', correctIndex: 3 }
              ]
        };
      }

      if (qType === 'type_answer') {
        return {
          id: qId,
          type: 'type_answer',
          title: isEn
            ? `What is the key spiritual virtue we learn from (${cleanTopic.slice(0, 45)})?`
            : `ما هي الفضيلة الروحية الأساسية التي نتعلمها من (${cleanTopic.slice(0, 45)})؟`,
          timeLimitSeconds: 20,
          pointsMultiplier: 1,
          correctTextAnswer: isEn ? 'Faith' : 'الإيمان',
          acceptableTextAnswers: isEn
            ? ['faith', 'trust', 'courage', 'faithfulness', 'prayer', 'love', 'hope']
            : ['الايمان', 'الثبات', 'الشجاعة', 'الثقه', 'الثقة بالله', 'المحبة', 'الأمانة', 'الصلاة']
        };
      }

      if (qType === 'matching') {
        return {
          id: qId,
          type: 'matching',
          title: isEn
            ? `Match each element in (${cleanTopic.slice(0, 40)}) with its corresponding meaning:`
            : `وصّل كل عنصر في (${cleanTopic.slice(0, 40)}) بما يناسبه في العمود المقابل:`,
          timeLimitSeconds: 30,
          pointsMultiplier: 2,
          matchingPairs: isEn
            ? [
                { id: 'm1', leftText: 'Hananiah (Shadrach)', rightText: 'The Lord is gracious' },
                { id: 'm2', leftText: 'Mishael (Meshach)', rightText: 'Who is what God is' },
                { id: 'm3', leftText: 'Azariah (Abednego)', rightText: 'The Lord has helped' },
                { id: 'm4', leftText: 'Daniel the Prophet', rightText: 'God is my Judge' }
              ]
            : [
                { id: 'm1', leftText: 'حنانيا (شدرخ)', rightText: 'يهوه حنّان ومترأف' },
                { id: 'm2', leftText: 'ميشائيل (ميشخ)', rightText: 'مَن مثل الله في قوته' },
                { id: 'm3', leftText: 'عزاريا (عبد نغو)', rightText: 'يهوه يعين وينصر' },
                { id: 'm4', leftText: 'دانيال النبي', rightText: 'الله قاضيي العادل' }
              ]
        };
      }

      if (qType === 'slider') {
        return {
          id: qId,
          type: 'slider',
          title: isEn
            ? `How many holy youths stood faithfully in the fiery furnace in the Book of Daniel?`
            : `كم عدد الفتية القديسين الذين أُلقوا في أتون النار المتقد وشهدوا لإلههم؟`,
          timeLimitSeconds: 20,
          pointsMultiplier: 1,
          sliderMin: 1,
          sliderMax: 10,
          sliderStep: 1,
          sliderCorrectValue: 3,
          sliderMarginOfError: 0
        };
      }

      if (qType === 'pin_answer') {
        return {
          id: qId,
          type: 'pin_answer',
          title: isEn
            ? `Drop the pin on the central target area on the image for (${cleanTopic.slice(0, 40)}):`
            : `حدد بالدبوس على الصورة موضع الإجابة الصحيحة الخاصة بـ (${cleanTopic.slice(0, 40)}):`,
          timeLimitSeconds: 25,
          pointsMultiplier: 1,
          mediaUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1000&q=80',
          pinCoordinates: {
            xPercent: 50,
            yPercent: 50,
            tolerancePercent: 18
          }
        };
      }

      if (qType === 'poll' || qType === 'word_cloud') {
        return {
          id: qId,
          type: qType,
          isOpinion: true,
          title: isEn
            ? `What inspires you the most about (${cleanTopic.slice(0, 45)})?`
            : `ما أكثر درس روحي يلمس قلبك في موضوع (${cleanTopic.slice(0, 45)})؟`,
          timeLimitSeconds: 20,
          pointsMultiplier: 0,
          options: qType === 'poll'
            ? (isEn
                ? [
                    { id: 'opt_1', text: 'Steadfast faith in challenges', isCorrect: true, color: 'red', shape: 'triangle' },
                    { id: 'opt_2', text: 'Power of prayer and fellowship', isCorrect: true, color: 'blue', shape: 'diamond' },
                    { id: 'opt_3', text: 'God’s presence with His children', isCorrect: true, color: 'yellow', shape: 'circle' },
                    { id: 'opt_4', text: 'Daily practical application', isCorrect: true, color: 'green', shape: 'square' }
                  ]
                : [
                    { id: 'opt_1', text: 'الثبات في الإيمان وقت الضيق', isCorrect: true, color: 'red', shape: 'triangle' },
                    { id: 'opt_2', text: 'قوة الصلاة والشركة الروحية', isCorrect: true, color: 'blue', shape: 'diamond' },
                    { id: 'opt_3', text: 'حضور الله وسط التجربة', isCorrect: true, color: 'yellow', shape: 'circle' },
                    { id: 'opt_4', text: 'التطبيق العملي في حياتنا اليومية', isCorrect: true, color: 'green', shape: 'square' }
                  ])
            : undefined
        };
      }

      // Default: 'quiz' (Multiple Choice)
      return {
        id: qId,
        type: 'quiz',
        title: isEn
          ? (sentence
              ? `Based on (${cleanTopic.slice(0, 40)}), which option best reflects the key point in question #${idx + 1}?`
              : `Question #${idx + 1}: What is a core principle highlighted in (${cleanTopic.slice(0, 45)})?`)
          : (sentence
              ? `بناءً على المحتوى حول (${cleanTopic.slice(0, 40)})، أي مما يلي يعبّر بدقة عن الفكرة الواردة في السؤال (${idx + 1})؟`
              : `ما هو المحور الأساسي والدرس الروحي في (${cleanTopic.slice(0, 45)}) — سؤال (${idx + 1})؟`),
        timeLimitSeconds: 20,
        pointsMultiplier: 1,
        options: isEn
          ? [
              { id: 'opt_1', text: sentence ? sentence.slice(0, 95) : `Living faithfully and glorifying God in ${cleanTopic.slice(0, 35)}`, isCorrect: true, color: 'red', shape: 'triangle' },
              { id: 'opt_2', text: 'Compromising spiritual principles under pressure', isCorrect: false, color: 'blue', shape: 'diamond' },
              { id: 'opt_3', text: 'Relying only on human strength without prayer', isCorrect: false, color: 'yellow', shape: 'circle' },
              { id: 'opt_4', text: 'Ignoring biblical teachings in daily life', isCorrect: false, color: 'green', shape: 'square' }
            ]
          : [
              { id: 'opt_1', text: sentence ? sentence.slice(0, 95) : `إعلان مجد الله وقوة الإيمان والأمانة في ${cleanTopic.slice(0, 35)}`, isCorrect: true, color: 'red', shape: 'triangle' },
              { id: 'opt_2', text: 'التراجع عند مواجهة الصعوبات والتحديات', isCorrect: false, color: 'blue', shape: 'diamond' },
              { id: 'opt_3', text: 'الاعتماد على الذات فقط دون صلاة أو شركة', isCorrect: false, color: 'yellow', shape: 'circle' },
              { id: 'opt_4', text: 'الاكتفاء بالمعرفة النظرية دون تطبيق عملي', isCorrect: false, color: 'green', shape: 'square' }
            ]
      };
    };

    const finalQuestions: any[] = [];
    for (let i = 0; i < count; i++) {
      const chosenType = activeTypesPool[i % activeTypesPool.length];
      finalQuestions.push(buildFallbackQuestionByType(chosenType, i));
    }

    res.json({
      success: true,
      title: resolvedLang === 'en' ? `${cleanTopic.slice(0, 60)} Quiz 🕊️🔥` : `مسابقة ${cleanTopic.slice(0, 60)} 🕊️🔥`,
      description: resolvedLang === 'en'
        ? (cleanCustomPrompt
            ? `AI-designed quiz matching your specifications: ${cleanCustomPrompt.slice(0, 110)}`
            : `Interactive Kahoot quiz about ${cleanTopic.slice(0, 60)}`)
        : (cleanCustomPrompt
            ? `مسابقة مصممة بالذكاء الاصطناعي وفق توصيفك: ${cleanCustomPrompt.slice(0, 110)}`
            : `مسابقة تفاعلية ممتعة وشاملة بنظام كاهوت حول ${cleanTopic.slice(0, 60)}`),
      questions: finalQuestions
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'خطأ في توليد المسابقة' });
  }
});

// ==========================================
// COMMUNITY EVENTS MANAGEMENT SYSTEM API ROUTES & SERVER-SIDE RBAC
// ==========================================
function isServerUserSuperAdmin(db: AppData, userId?: string, userRole?: string): boolean {
  const seniorRoles = new Set([
    'community_owner',
    'community_manager',
    'meeting_secretary',
    'service_secretary',
    'priest'
  ]);
  if (userRole && seniorRoles.has(userRole)) return true;
  if (!userId) return false;
  if (userId === 'admin_owner' || userId === 'reg_owner_main') return true;
  const member = (db.registrants || []).find((r: any) => r && r.id === userId);
  if (!member) return false;
  if (seniorRoles.has(member.role)) return true;
  const perms = member.customPermissions || member.permissions;
  if (perms && perms.canManageEvents) return true;
  return false;
}

function hasServerEventRole(
  db: AppData,
  eventId: string,
  userId: string,
  requiredRoles: string[]
): boolean {
  if (isServerUserSuperAdmin(db, userId)) return true;
  const assignments = (db.eventStaffAssignments || []).filter(
    (a: any) => a && a.eventId === eventId && a.userId === userId
  );
  for (const a of assignments) {
    const roles: string[] = Array.isArray(a.roles) ? a.roles : a.role ? [a.role] : [];
    if (roles.includes('EVENT_MANAGER')) return true;
    if (requiredRoles.some((reqRole) => roles.includes(reqRole))) return true;
  }
  return false;
}

/**
 * Enforce Database-Level UNIQUE(eventId, memberId) on EventAttendances
 * so even concurrent scans from multiple devices never create duplicate attendance records.
 */
function deduplicateEventAttendances(attendances: any[]): any[] {
  const seenKey = new Set<string>();
  const result: any[] = [];
  // Sort oldest checkInTime first so the first valid scan is preserved
  const sorted = [...attendances].sort((a, b) => {
    const tA = a?.checkInTime ? new Date(a.checkInTime).getTime() : 0;
    const tB = b?.checkInTime ? new Date(b.checkInTime).getTime() : 0;
    return tA - tB;
  });
  for (const att of sorted) {
    if (!att || !att.eventId || !att.memberId) continue;
    const uniqueKey = `${att.eventId}::${att.memberId}`;
    if (seenKey.has(uniqueKey)) continue;
    seenKey.add(uniqueKey);
    result.push(att);
  }
  return result;
}

let lastServerEventsMutationAt = 0;

function mergeServerArrayById(localArr: any[], remoteArr: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of localArr) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const rItem of remoteArr) {
    if (!rItem || !rItem.id) continue;
    const ex = map.get(rItem.id);
    if (!ex) {
      map.set(rItem.id, rItem);
    } else {
      const localTs = new Date(ex.updatedAt || ex.createdAt || 0).getTime();
      const remoteTs = new Date(rItem.updatedAt || rItem.createdAt || 0).getTime();
      if (remoteTs >= localTs) {
        map.set(rItem.id, { ...ex, ...rItem });
      }
    }
  }
  return Array.from(map.values());
}

app.get('/api/community-events/state', (_req, res) => {
  const db = ensureDatabase();
  const delEvSet = new Set(db.deletedEventIds || []);
  res.json({
    success: true,
    communityEvents: (db.communityEvents || []).filter((e: any) => e && e.id && !delEvSet.has(e.id)),
    deletedEventIds: db.deletedEventIds || [],
    eventGroups: db.eventGroups || [],
    eventRegistrations: db.eventRegistrations || [],
    eventPayments: db.eventPayments || [],
    eventBuses: db.eventBuses || [],
    eventAttendances: deduplicateEventAttendances(db.eventAttendances || []),
    eventAuditLogs: db.eventAuditLogs || [],
    eventStaffAssignments: db.eventStaffAssignments || []
  });
});

app.post('/api/community-events/sync', async (req, res) => {
  try {
    lastServerEventsMutationAt = Date.now();
    const db = ensureDatabase();
    const {
      communityEvents,
      deletedEventIds,
      eventGroups,
      eventRegistrations,
      eventPayments,
      eventBuses,
      eventAttendances,
      eventAuditLogs,
      eventStaffAssignments,
      actorId,
      actorRole,
      eventId,
      requiredRoles
    } = req.body || {};

    // Server-side Authorization check if action metadata is supplied
    if (actorId && eventId && Array.isArray(requiredRoles) && requiredRoles.length > 0) {
      const authorized =
        isServerUserSuperAdmin(db, actorId, actorRole) ||
        hasServerEventRole(db, eventId, actorId, requiredRoles);
      if (!authorized) {
        return res.status(403).json({
          success: false,
          error: '⛔ غير مصرح لك بتنفيذ هذا الإجراء على هذه الفعالية (Server-side RBAC Denied).'
        });
      }
    }

    if (Array.isArray(deletedEventIds)) {
      const delSet = new Set([...(db.deletedEventIds || []), ...deletedEventIds]);
      db.deletedEventIds = Array.from(delSet);
    }
    const delEvSet = new Set(db.deletedEventIds || []);

    if (Array.isArray(communityEvents)) {
      db.communityEvents = communityEvents.filter((e: any) => e && e.id && !delEvSet.has(e.id));
    } else if (delEvSet.size > 0) {
      db.communityEvents = (db.communityEvents || []).filter((e: any) => e && e.id && !delEvSet.has(e.id));
    }

    if (Array.isArray(eventGroups)) {
      db.eventGroups = eventGroups.filter((g: any) => g && !delEvSet.has(g.eventId));
    } else if (delEvSet.size > 0) {
      db.eventGroups = (db.eventGroups || []).filter((g: any) => g && !delEvSet.has(g.eventId));
    }
    if (Array.isArray(eventRegistrations)) {
      db.eventRegistrations = eventRegistrations.filter((r: any) => r && !delEvSet.has(r.eventId));
    } else if (delEvSet.size > 0) {
      db.eventRegistrations = (db.eventRegistrations || []).filter((r: any) => r && !delEvSet.has(r.eventId));
    }
    if (Array.isArray(eventPayments)) {
      db.eventPayments = eventPayments.filter((p: any) => p && !delEvSet.has(p.eventId));
    } else if (delEvSet.size > 0) {
      db.eventPayments = (db.eventPayments || []).filter((p: any) => p && !delEvSet.has(p.eventId));
    }
    if (Array.isArray(eventBuses)) {
      db.eventBuses = eventBuses.filter((b: any) => b && !delEvSet.has(b.eventId));
    } else if (delEvSet.size > 0) {
      db.eventBuses = (db.eventBuses || []).filter((b: any) => b && !delEvSet.has(b.eventId));
    }
    if (Array.isArray(eventAttendances)) {
      db.eventAttendances = deduplicateEventAttendances(eventAttendances.filter((a: any) => a && !delEvSet.has(a.eventId)));
    } else if (delEvSet.size > 0) {
      db.eventAttendances = (db.eventAttendances || []).filter((a: any) => a && !delEvSet.has(a.eventId));
    }
    if (Array.isArray(eventAuditLogs)) db.eventAuditLogs = eventAuditLogs;
    if (Array.isArray(eventStaffAssignments)) {
      db.eventStaffAssignments = eventStaffAssignments.filter((s: any) => s && !delEvSet.has(s.eventId));
    } else if (delEvSet.size > 0) {
      db.eventStaffAssignments = (db.eventStaffAssignments || []).filter((s: any) => s && !delEvSet.has(s.eventId));
    }

    saveDatabase(db);
    persistSystemStateToSupabase(db).catch(() => {});

    const payload = {
      communityEvents: db.communityEvents,
      deletedEventIds: db.deletedEventIds,
      eventGroups: db.eventGroups,
      eventRegistrations: db.eventRegistrations,
      eventPayments: db.eventPayments,
      eventBuses: db.eventBuses,
      eventAttendances: db.eventAttendances,
      eventAuditLogs: db.eventAuditLogs,
      eventStaffAssignments: db.eventStaffAssignments
    };
    broadcastServerEvent('COMMUNITY_EVENTS_UPDATED', payload);

    res.json({ success: true, ...payload });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Server-side RBAC Export Data Endpoint for Excel (.xlsx) & PDF (.pdf)
app.get('/api/community-events/:eventId/export-data', (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = String(req.query.userId || '');
    const userRole = String(req.query.userRole || '');
    const db = ensureDatabase();

    const event = (db.communityEvents || []).find((e: any) => e && e.id === eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'الفعالية غير موجودة.' });
    }

    const isSuper = isServerUserSuperAdmin(db, userId, userRole);
    const assignment = (db.eventStaffAssignments || []).find(
      (a: any) => a && a.eventId === eventId && a.userId === userId
    );
    const roles: string[] = Array.isArray(assignment?.roles) ? assignment.roles : [];
    const perms: string[] = Array.isArray(assignment?.permissions) ? assignment.permissions : [];
    const isEventManager = isSuper || roles.includes('EVENT_MANAGER');

    const myBuses = (db.eventBuses || []).filter(
      (b: any) => b && b.eventId === eventId && b.responsibleServantId === userId
    );
    const assignedBusIds = Array.from(
      new Set([
        ...(assignment?.assignedBusId ? [assignment.assignedBusId] : []),
        ...myBuses.map((b: any) => b.id)
      ])
    );

    const isPaymentContactServant = Boolean(
      event.whatsappContacts?.some((c: any) => c && c.servantId === userId)
    );

    if (!isEventManager && roles.length === 0 && perms.length === 0 && assignedBusIds.length === 0 && !isPaymentContactServant) {
      return res.status(403).json({
        success: false,
        error: '⛔ غير مصرح لك بتصدير بيانات هذه الفعالية.'
      });
    }

    const isBusAttendanceOnly =
      !isEventManager &&
      (roles.includes('BUS_ATTENDANCE_ONLY') || assignedBusIds.length > 0) &&
      !roles.includes('REGISTRATION_ORGANIZER') &&
      !roles.includes('PAYMENT_MANAGER') &&
      !roles.includes('BUS_ORGANIZER') &&
      !roles.includes('QR_ATTENDANCE');

    const canExportFinancials =
      isEventManager ||
      roles.includes('PAYMENT_MANAGER') ||
      perms.includes('VIEW_PAYMENT_DETAILS') ||
      perms.includes('CONFIRM_PAYMENT') ||
      perms.includes('ADD_PARTIAL_PAYMENT');

    const allRegs = (db.eventRegistrations || []).filter((r: any) => r && r.eventId === eventId);
    const allBuses = (db.eventBuses || []).filter((b: any) => b && b.eventId === eventId);
    const allPayments = (db.eventPayments || []).filter((p: any) => p && p.eventId === eventId);

    let filteredBuses = allBuses;
    let filteredRegs = allRegs;
    let filteredPayments = allPayments;

    if (isBusAttendanceOnly) {
      filteredBuses = allBuses.filter((b: any) => assignedBusIds.includes(b.id));
      filteredRegs = allRegs
        .filter((r: any) => r.busId && assignedBusIds.includes(r.busId))
        .map((r: any) => ({
          ...r,
          originalPrice: 0,
          discountAmount: 0,
          finalRequiredAmount: 0,
          totalPaidAmount: 0,
          remainingAmount: 0
        }));
      filteredPayments = [];
    } else if (!isEventManager) {
      const servantMember = (db.registrants || []).find((m: any) => m && m.id === userId);
      const servantName = servantMember?.fullName || '';
      filteredRegs = allRegs.filter(
        (r: any) =>
          r.assignedServantId === userId ||
          r.selectedContactId === userId ||
          r.selectedContactId === `staff_contact_${userId}` ||
          (servantName && (r.assignedServantName === servantName || r.selectedContactName === servantName))
      );
      if (!canExportFinancials) {
        filteredRegs = filteredRegs.map((r: any) => ({
          ...r,
          originalPrice: 0,
          discountAmount: 0,
          finalRequiredAmount: 0,
          totalPaidAmount: 0,
          remainingAmount: 0
        }));
        filteredPayments = [];
      } else {
        const regIds = new Set(filteredRegs.map((r: any) => r.id));
        filteredPayments = allPayments.filter((p: any) => regIds.has(p.eventRegistrationId));
      }
    }

    res.json({
      success: true,
      roleScope: isEventManager ? 'super_admin' : isBusAttendanceOnly ? 'bus_servant' : 'registration_servant',
      canExportFinancials: !isBusAttendanceOnly && canExportFinancials,
      registrations: filteredRegs,
      buses: filteredBuses,
      payments: filteredPayments
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// OPEN GRAPH IMAGE FOR QUIZ PROGRAMME & SHARED QUIZZES
// ==========================================
app.get('/api/images/quiz-cover/:quizId', (req, res) => {
  try {
    const quizId = String(req.params.quizId || '').trim();
    const db = ensureDatabase();
    const matchedQuiz = quizId
      ? (db.kahootQuizzes || []).find((q: any) => q && q.id === quizId)
      : null;

    const cover = matchedQuiz?.coverImage;
    if (cover && typeof cover === 'string') {
      if (cover.startsWith('data:image/')) {
        const match = cover.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Cache-Control', 'public, max-age=300');
          return res.send(imgBuffer);
        }
      } else if (cover.startsWith('http://') || cover.startsWith('https://')) {
        return res.redirect(cover);
      }
    }
    return res.redirect(`/api/images/quiz-og.svg?quizId=${encodeURIComponent(quizId)}`);
  } catch {
    return res.redirect('/api/images/quiz-og.svg');
  }
});

app.get(['/api/images/quiz-og.svg', '/api/images/quiz-og.png'], (req, res) => {
  const quizId = typeof req.query.quizId === 'string' ? req.query.quizId : '';
  const db = ensureDatabase();
  const matchedQuiz = quizId
    ? (db.kahootQuizzes || []).find((q: any) => q && q.id === quizId)
    : null;

  // If the quiz has an actual coverImage and the requester asked for .png or cover, serve the binary image directly!
  if (matchedQuiz?.coverImage && typeof matchedQuiz.coverImage === 'string' && matchedQuiz.coverImage.startsWith('data:image/') && req.path.endsWith('.png')) {
    const match = matchedQuiz.coverImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      res.setHeader('Content-Type', match[1]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(Buffer.from(match[2], 'base64'));
    }
  }

  const titleText = matchedQuiz?.title
    ? String(matchedQuiz.title).replace(/[<>&"']/g, '')
    : 'برنامج مسابقات الثلاثة فتية القديسين 🏆';
  const subText = matchedQuiz?.description
    ? String(matchedQuiz.description).replace(/[<>&"']/g, '').slice(0, 90)
    : 'تحديات تفاعلية حية • كاهوت الشباب السوداني • سجل دخولك وشارك الآن!';
  const questionsBadge = matchedQuiz && Array.isArray(matchedQuiz.questions)
    ? `${matchedQuiz.questions.length} أسئلة تفاعلية`
    : 'مسابقات حية وفردية 🎮';
  const coverHref = matchedQuiz?.coverImage && typeof matchedQuiz.coverImage === 'string'
    ? matchedQuiz.coverImage.replace(/"/g, '&quot;')
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a0533" />
        <stop offset="50%" stop-color="#2e0854" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="50%" stop-color="#fde047" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)" />
    ${coverHref ? `<image href="${coverHref}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity="0.35" />` : ''}
    <!-- Kahoot 4 geometric accents -->
    <rect x="60" y="60" width="120" height="120" rx="28" fill="#e21b3c" opacity="0.22" />
    <rect x="1020" y="60" width="120" height="120" rx="28" fill="#1368ce" opacity="0.22" />
    <rect x="60" y="450" width="120" height="120" rx="28" fill="#d89e00" opacity="0.22" />
    <rect x="1020" y="450" width="120" height="120" rx="28" fill="#26890c" opacity="0.22" />
    <!-- Border frame -->
    <rect x="40" y="40" width="1120" height="550" rx="36" fill="none" stroke="url(#gold)" stroke-width="4" opacity="0.6" />
    <!-- Top Badge -->
    <rect x="400" y="85" width="400" height="54" rx="27" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" stroke-width="2" />
    <text x="600" y="120" font-family="Cairo, Tajawal, sans-serif" font-size="24" font-weight="800" fill="#fde047" text-anchor="middle">اجتماع شباب الثلاثة فتية القديسين</text>
    <!-- Main Title -->
    <text x="600" y="275" font-family="Cairo, Tajawal, sans-serif" font-size="56" font-weight="900" fill="#ffffff" text-anchor="middle">${titleText}</text>
    <!-- Subtitle -->
    <text x="600" y="355" font-family="Cairo, Tajawal, sans-serif" font-size="30" font-weight="700" fill="#cbd5e1" text-anchor="middle">${subText}</text>
    <!-- CTA Pill -->
    <rect x="370" y="435" width="460" height="76" rx="38" fill="url(#gold)" />
    <text x="600" y="484" font-family="Cairo, Tajawal, sans-serif" font-size="30" font-weight="900" fill="#0f172a" text-anchor="middle">${questionsBadge} • اضغط للمشاركة</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(svg);
});

// ==========================================
// VITE MIDDLEWARE & STATIC ASSET SERVING
// ==========================================

// Explicitly serve sw.js and OneSignalSDKWorker.js at root with application/javascript Content-Type
app.get(['/sw.js', '/OneSignalSDKWorker.js', '/OneSignalSDKUpdaterWorker.js'], (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  const workerPath = path.resolve(__dirname, 'public', 'OneSignalSDKWorker.js');
  if (fs.existsSync(workerPath)) {
    return res.sendFile(workerPath);
  }
  return res.send('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(self.clients.claim()));self.addEventListener("message",()=>{});\n');
});

function injectQuizOpenGraphMeta(html: string, req: express.Request): string {
  const quizId = typeof req.query.quizId === 'string' ? req.query.quizId.trim() : '';
  if (!quizId) return html;
  try {
    const db = ensureDatabase();
    const quiz = (db.kahootQuizzes || []).find((q: any) => q && q.id === quizId);
    const title = quiz?.title
      ? `${quiz.title} | مسابقات الثلاثة فتية القديسين`
      : 'مسابقة تفاعلية | اجتماع شباب الثلاثة فتية القديسين';
    const desc = quiz?.description
      ? `${quiz.description} — سجل دخولك الآن للانتقال مباشرة إلى المسابقة والمنافسة على الصدارة!`
      : 'تم دعوتك للمشاركة في مسابقة تفاعلية باجتماع شباب الثلاثة فتية القديسين. سجل دخولك الآن للبدء!';
    const protocol = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || '';
    const baseUrl = host ? `${protocol}://${host}` : '';
    const ogImg = quiz?.coverImage
      ? `${baseUrl}/api/images/quiz-cover/${encodeURIComponent(quizId)}`
      : `${baseUrl}/api/images/quiz-og.png?quizId=${encodeURIComponent(quizId)}`;
    return html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
      .replace(/<meta\s+property=["']og:title["']\s+content=["'][^"']*["']\s*\/?>/i, `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />`)
      .replace(/<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/i, `<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />`)
      .replace(/<meta\s+property=["']og:image["']\s+content=["'][^"']*["']\s*\/?>/i, `<meta property="og:image" content="${ogImg}" />\n    <meta name="twitter:image" content="${ogImg}" />`);
  } catch {
    return html;
  }
}

const VITE_CLIENT_NO_WS_MODULE = `// WebSocket-free Vite client shim for Cloud Run / AI Studio iframe environment
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    get data() { return {}; },
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {
  constructor() { super(); }
  close() {}
}
if (typeof customElements !== 'undefined' && !customElements.get('vite-error-overlay')) {
  customElements.define('vite-error-overlay', ErrorOverlay);
}
`;

app.get('/@vite/client', (_req, res) => {
  res
    .status(200)
    .set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    .end(VITE_CLIENT_NO_WS_MODULE);
});

async function start() {
  const isProd = process.env.NODE_ENV === 'production';

  // Bind port 3000 immediately so health checks never time out while Vite initializes
  const server = app.listen(PORT, HOST, () => {
    console.log(`Server started on http://${HOST}:${PORT}`);
    // Pull new registrations from Cloudflare KV on startup & poll lightweight /api/version every 5s
    setTimeout(() => {
      pullStateFromCloudflareD1(true).catch(() => {});
    }, 1000);
    setInterval(() => {
      pullStateFromCloudflareD1(false).catch(() => {});
    }, 5000);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });

  if (!isProd) {
    let viteInstance: any = null;
    const viteReadyPromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      viteInstance = await createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        appType: 'spa',
      });
      return viteInstance;
    })();

    app.get('/', async (req, res, next) => {
      if (typeof req.query.quizId === 'string' && req.query.quizId.trim()) {
        try {
          const vite = viteInstance || (await viteReadyPromise);
          const indexPath = path.resolve(__dirname, 'index.html');
          if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, 'utf-8');
            html = await vite.transformIndexHtml(req.originalUrl, html);
            return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectQuizOpenGraphMeta(html, req));
          }
        } catch {}
      }
      next();
    });

    app.use(async (req, res, next) => {
      try {
        const vite = viteInstance || (await viteReadyPromise);
        return vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    // Serve production static build
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, { index: false }));
      app.get('*', (req, res) => {
        if (req.path.startsWith('/assets/') || /\.(js|mjs|css|map|wasm)$/i.test(req.path)) {
          res.setHeader('Cache-Control', 'no-store');
          return res.status(404).type(req.path.endsWith('.css') ? 'text/css' : 'application/javascript').send('// Asset not found');
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        const indexPath = path.resolve(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          const rawHtml = fs.readFileSync(indexPath, 'utf-8');
          return res.send(injectQuizOpenGraphMeta(rawHtml, req));
        }
        res.sendFile(indexPath);
      });
    } else {
      // Fallback to Vite middlewares if dist not built yet
      let viteInstance: any = null;
      const viteReadyPromise = (async () => {
        const { createServer: createViteServer } = await import('vite');
        viteInstance = await createViteServer({
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
          appType: 'spa',
        });
        return viteInstance;
      })();
      app.use(async (req, res, next) => {
        try {
          const vite = viteInstance || (await viteReadyPromise);
          return vite.middlewares(req, res, next);
        } catch (err) {
          next(err);
        }
      });
    }
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
});

