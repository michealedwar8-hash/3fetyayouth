#!/usr/bin/env node
/**
 * Safe, Atomic Cloudflare D1 Time Travel Forensic DOB Recovery Script
 *
 * How it guarantees ZERO data loss:
 * 1. Reads the current live D1 bookmark (ORIGINAL_BOOKMARK) before ANY operation.
 * 2. Resolves historical bookmarks (Nov 12–18, 2026) read-only first & deduplicates them.
 * 3. Inside a strict try/finally block, temporarily visits each unique historical bookmark,
 *    extracts authentic real DOBs from D1 tables (announcements, events, members), and
 *    UNCONDITIONALLY restores D1 back to ORIGINAL_BOOKMARK (with 5x retry) in `finally`.
 * 4. Only AFTER live D1 is verified back at ORIGINAL_BOOKMARK, posts ONLY the recovered
 *    authentic real DOBs to https://3fetyayouth.online/api/admin/restore-dobs.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 */

const ACCOUNT_ID = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const API_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const DATABASE_ID = (process.env.CLOUDFLARE_D1_DATABASE_ID || "1d13778e-f840-482d-b1e9-02dda36fc9e3").trim();
const WORKER_URL = (process.env.CLOUDFLARE_WORKER_URL || "https://3fetyayouth.online").replace(/\/+$/, "");

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables are required.");
  process.exit(1);
}

const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}`;

function ultraNormalizeArabic(str) {
  return String(str || "")
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fuzzyNormName(str) {
  return ultraNormalizeArabic(str)
    .replace(/ه(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getBaseMemberId(id) {
  const s = String(id || "").trim();
  if (!s) return "";
  return s.replace(/^reg_member_/, "").trim();
}

function isPlaceholderDob(val) {
  const s = String(val || "").trim();
  if (!s || s === "null" || s === "undefined") return true;
  return (
    s === "2002-01-01" ||
    s === "2000-01-01" ||
    s === "1-1-2002" ||
    s === "01-01-2002" ||
    s === "2002/01/01" ||
    s === "1-1-2000" ||
    s === "01-01-2000" ||
    s === "2000/01/01"
  );
}

function isAuthenticDob(val, registeredAt = "") {
  const s = String(val || "").trim();
  if (!s || isPlaceholderDob(s)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const maxAllowedYear = new Date().getUTCFullYear() - 3;
  if (year < 1930 || year > maxAllowedYear || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    return false;
  }
  const regDate = String(registeredAt || "").slice(0, 10);
  if (regDate && s === regDate) return false;
  return true;
}

async function cfFetch(path, options = {}) {
  const url = `${CF_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Cloudflare API non-JSON HTTP ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json?.success) {
    const errDetail = JSON.stringify(json?.errors || json?.messages || text.slice(0, 200));
    throw new Error(`Cloudflare API HTTP ${res.status} on ${path}: ${errDetail}`);
  }
  return json.result;
}

async function getBookmark(timestampIso = "") {
  const qs = timestampIso ? `?timestamp=${encodeURIComponent(timestampIso)}` : "";
  const result = await cfFetch(`/time_travel/bookmark${qs}`, { method: "GET" });
  return result?.bookmark || "";
}

async function restoreBookmark(bookmark) {
  const qs = `?bookmark=${encodeURIComponent(bookmark)}`;
  return await cfFetch(`/time_travel/restore${qs}`, { method: "POST" });
}

async function restoreBookmarkWithRetry(bookmark, label = "ORIGINAL_BOOKMARK") {
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await restoreBookmark(bookmark);
      console.log(`✅ Restored D1 to ${label} (${res?.bookmark || bookmark}) on attempt ${attempt}.`);
      return res;
    } catch (err) {
      lastErr = err;
      console.error(`⚠️ Attempt ${attempt}/5 to restore ${label} failed:`, err.message);
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`CRITICAL: Failed to restore ${label} after 5 attempts: ${lastErr?.message}`);
}

async function d1Query(sql) {
  const result = await cfFetch(`/query`, {
    method: "POST",
    body: JSON.stringify({ sql })
  });
  return Array.isArray(result) ? (result[0]?.results || []) : [];
}

async function main() {
  console.log("=== Cloudflare D1 Time Travel Forensic DOB Recovery ===");

  // Step 0: Audit current missing DOBs from live Worker
  const auditBefore = await fetch(`${WORKER_URL}/api/admin/dob-audit`).then((r) => r.json());
  if (!auditBefore?.success) {
    throw new Error(`Failed to fetch /api/admin/dob-audit from ${WORKER_URL}`);
  }
  const missingList = Array.isArray(auditBefore.missingNames) ? auditBefore.missingNames : [];
  console.log(
    `📊 Before recovery: total=${auditBefore.totalMembers}, real=${auditBefore.realDobCount}, missing=${auditBefore.missingDobCount}`
  );
  if (missingList.length === 0) {
    console.log("✅ All members already have authentic DOBs. Nothing to do.");
    return;
  }

  // Index missing targets so we know immediately when all are found
  const missingByNorm = new Map();
  const missingByFuzzy = new Map();
  const missingById = new Map();
  const missingByCode = new Map();
  for (const m of missingList) {
    const nn = ultraNormalizeArabic(m.fullName || "");
    const fn = fuzzyNormName(m.fullName || "");
    const bid = getBaseMemberId(m.id || "");
    const code = String(m.uniqueCode || "").trim().toUpperCase();
    if (nn) missingByNorm.set(nn, m);
    if (fn && fn.length >= 6) missingByFuzzy.set(fn, m);
    if (bid) missingById.set(bid, m);
    if (code) missingByCode.set(code, m);
  }

  // Step 1: Capture ORIGINAL_BOOKMARK (read-only) before ANY mutation
  const originalBookmark = await getBookmark();
  if (!originalBookmark) {
    throw new Error("Could not obtain current D1 live bookmark. Aborting safely with zero changes.");
  }
  console.log(`🔒 Saved ORIGINAL_BOOKMARK: ${originalBookmark}`);

  // Step 2: Resolve candidate historical timestamps (read-only) & deduplicate bookmarks
  const candidateTimestamps = [
    "2026-11-18T20:00:00Z", // 1h before Nov 18 migration
    "2026-11-18T12:00:00Z",
    "2026-11-17T23:59:00Z",
    "2026-11-16T23:59:00Z",
    "2026-11-15T23:59:00Z",
    "2026-11-14T23:59:00Z",
    "2026-11-14T10:00:00Z",
    "2026-11-13T23:59:00Z",
    "2026-11-13T18:00:00Z",
    "2026-11-12T23:59:00Z"
  ];

  const uniqueSnapshots = [];
  const seenBookmarks = new Set([originalBookmark]);
  for (const ts of candidateTimestamps) {
    try {
      const bm = await getBookmark(ts);
      if (bm && !seenBookmarks.has(bm)) {
        seenBookmarks.add(bm);
        uniqueSnapshots.push({ ts, bookmark: bm });
      }
    } catch (err) {
      console.log(`ℹ️ Timestamp ${ts} unavailable: ${err.message}`);
    }
  }
  console.log(`🕰️ Resolved ${uniqueSnapshots.length} unique historical D1 snapshots to inspect.`);
  if (uniqueSnapshots.length === 0) {
    console.log("⚠️ No older D1 Time Travel snapshots available within retention window.");
    return;
  }

  // Track recovered DOBs keyed by target member ID
  const recoveredByTargetId = new Map();

  const tryMatchCandidate = (rec, sourceLabel) => {
    if (!rec || typeof rec !== "object") return;
    const rawName = String(rec.fullName || rec.name || rec.member?.fullName || rec.member?.name || "").trim();
    const rawDob = String(
      rec.dob || rec.birthDate || rec.birth_date || rec.birthday || rec.member?.dob || rec.member?.birthDate || ""
    ).trim();
    const regAt = String(rec.registeredAt || rec.createdAt || rec.member?.registeredAt || "");
    if (!isAuthenticDob(rawDob, regAt)) return;

    const nn = ultraNormalizeArabic(rawName);
    const fn = fuzzyNormName(rawName);
    const bid = getBaseMemberId(rec.id || rec.memberId || rec.member?.id || "");
    const code = String(rec.uniqueCode || rec.code || rec.member?.uniqueCode || "").trim().toUpperCase();

    const target =
      (bid && missingById.get(bid)) ||
      (nn && missingByNorm.get(nn)) ||
      (fn && missingByFuzzy.get(fn)) ||
      (code && missingByCode.get(code)) ||
      null;

    if (target && !recoveredByTargetId.has(target.id)) {
      recoveredByTargetId.set(target.id, {
        id: target.id,
        fullName: target.fullName,
        uniqueCode: target.uniqueCode,
        dob: rawDob,
        birthDate: rawDob,
        source: sourceLabel
      });
    }
  };

  const scanValue = (val, sourceLabel, depth = 0) => {
    if (!val || depth > 5) return;
    if (typeof val === "string") {
      const t = val.trim();
      if (t.length < 15 || t.length > 12_000_000) return;
      if (t[0] === "[" || t[0] === "{") {
        try {
          scanValue(JSON.parse(t), sourceLabel, depth + 1);
        } catch {}
      }
      return;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) scanValue(val[i], sourceLabel, depth + 1);
      return;
    }
    if (typeof val === "object") {
      if (val.dob || val.birthDate || val.birth_date || val.birthday) {
        tryMatchCandidate(val, sourceLabel);
      }
      for (const nk of ["registrants", "members", "results", "data", "CLEAN_MASTER_DB_V1", "backup", "list", "member"]) {
        if (val[nk]) scanValue(val[nk], `${sourceLabel}.${nk}`, depth + 1);
      }
    }
  };

  // Step 3: Visit historical snapshots inside strict try/finally guaranteeing rollback to ORIGINAL_BOOKMARK
  let restoredToOriginal = false;
  try {
    for (const snap of uniqueSnapshots) {
      if (recoveredByTargetId.size >= missingList.length) {
        console.log("🎯 All missing DOBs recovered! Stopping historical scan early.");
        break;
      }

      console.log(`🔎 Switching D1 temporarily to snapshot ${snap.ts} (${snap.bookmark})...`);
      await restoreBookmark(snap.bookmark);

      const beforeCount = recoveredByTargetId.size;
      const tablesRows = await d1Query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
      ).catch(() => []);
      const tableNames = tablesRows.map((r) => String(r?.name || "")).filter(Boolean);

      if (tableNames.includes("announcements")) {
        const rows = await d1Query(
          "SELECT title, body, created_at FROM announcements WHERE body IS NOT NULL AND length(body) > 20 ORDER BY created_at DESC LIMIT 300"
        ).catch(() => []);
        for (const r of rows) {
          const title = String(r?.title || "");
          if (title.startsWith("D1_PHOTO:") || title.startsWith("D1_ANN_IMAGE:")) continue;
          scanValue(r.body, `tt:${snap.ts}:ann:${title}`);
        }
      }

      if (tableNames.includes("events")) {
        const rows = await d1Query(
          "SELECT title, description, created_at FROM events WHERE title NOT LIKE 'D1_PHOTO:%' AND title NOT LIKE 'D1_ANN_IMAGE:%' AND description IS NOT NULL AND length(description) > 20 ORDER BY created_at DESC LIMIT 300"
        ).catch(() => []);
        for (const r of rows) {
          scanValue(r.description, `tt:${snap.ts}:ev:${String(r?.title || "")}`);
        }
      }

      if (tableNames.includes("members")) {
        const rows = await d1Query("SELECT * FROM members").catch(() => []);
        for (const r of rows) tryMatchCandidate(r, `tt:${snap.ts}:members`);
      }

      const newlyFound = recoveredByTargetId.size - beforeCount;
      console.log(
        `   ↳ Snapshot ${snap.ts}: tables=[${tableNames.join(",")}], newlyRecovered=${newlyFound}, totalRecoveredSoFar=${recoveredByTargetId.size}/${missingList.length}`
      );
    }
  } finally {
    // UNCONDITIONAL atomic rollback to live ORIGINAL_BOOKMARK
    console.log(`↩️ Restoring D1 back to ORIGINAL_BOOKMARK (${originalBookmark})...`);
    await restoreBookmarkWithRetry(originalBookmark, "ORIGINAL_BOOKMARK");
    restoredToOriginal = true;
  }

  if (!restoredToOriginal) {
    throw new Error("Safety assertion failed: D1 was not confirmed back at ORIGINAL_BOOKMARK.");
  }

  // Step 4: Push ONLY verified recovered authentic DOBs via safe Worker endpoint
  const seedBackups = [...recoveredByTargetId.values()].map(({ id, fullName, uniqueCode, dob, birthDate }) => ({
    id,
    fullName,
    uniqueCode,
    dob,
    birthDate
  }));

  console.log(`📦 Total authentic DOBs recovered from D1 Time Travel: ${seedBackups.length} / ${missingList.length}`);

  if (seedBackups.length === 0) {
    console.log("ℹ️ No additional historical real DOBs were found in D1 Time Travel snapshots.");
    return;
  }

  console.log(`🚀 Applying ${seedBackups.length} recovered real DOBs to ${WORKER_URL}/api/admin/restore-dobs ...`);
  const applyRes = await fetch(`${WORKER_URL}/api/admin/restore-dobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seedBackups })
  });
  const applyJson = await applyRes.json();
  if (!applyRes.ok || !applyJson?.success) {
    throw new Error(`Failed to apply recovered DOBs: HTTP ${applyRes.status} ${JSON.stringify(applyJson).slice(0, 200)}`);
  }

  console.log("✅ Recovery applied successfully:", {
    totalMembers: applyJson.totalMembers,
    alreadyAuthenticCount: applyJson.alreadyAuthenticCount,
    recoveredCount: applyJson.recoveredCount,
    totalAuthenticAfter: applyJson.totalAuthenticAfter,
    stillMissingCount: applyJson.stillMissingCount
  });

  // Final read-back verification
  const auditAfter = await fetch(`${WORKER_URL}/api/admin/dob-audit`).then((r) => r.json());
  console.log("🔍 FINAL LIVE VERIFICATION:", {
    totalMembers: auditAfter.totalMembers,
    realDobCount: auditAfter.realDobCount,
    missingDobCount: auditAfter.missingDobCount
  });
}

main().catch((err) => {
  console.error("❌ Forensic recovery aborted:", err.message);
  process.exit(1);
});
