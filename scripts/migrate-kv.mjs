#!/usr/bin/env node
/**
 * Migrate CLEAN_MASTER_DB_V1 + Member Photos from local data/db.json
 * into Cloudflare Workers KV (CLEAN_MASTER_DB_KV_V1 + D1_PHOTO:<id>), R2, and D1.
 *
 * Usage:
 *   node scripts/migrate-kv.mjs
 *   CLOUDFLARE_WORKER_URL=https://3fetyayouth.online node scripts/migrate-kv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = (process.env.CLOUDFLARE_WORKER_URL || 'https://threefetyayouth-api.michealedwar8.workers.dev').replace(/\/+$/, '');
const DB_PATH = path.resolve(process.cwd(), 'data', 'db.json');

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Database file not found at ${DB_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);
  const registrants = Array.isArray(db.registrants) ? db.registrants : [];
  const revokedMembersLog = Array.isArray(db.deletedRegistrantIds) ? db.deletedRegistrantIds : [];

  if (registrants.length === 0) {
    console.error('❌ No registrants found in data/db.json');
    process.exit(1);
  }

  console.log(`📦 Loaded ${registrants.length} rich members (${registrants.filter((r) => r.phone).length} with phone, ${registrants.filter((r) => String(r.photoUrl || '').startsWith('data:')).length} Base64 photos)`);
  console.log(`🚀 Migrating to ${WORKER_URL}/api/admin/migrate-clean-master-kv ...`);

  const res = await fetch(`${WORKER_URL}/api/admin/migrate-clean-master-kv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrants,
      revokedMembersLog
    })
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ Worker returned HTTP ${res.status}: ${text}`);
    console.error('💡 Make sure you deployed the updated worker.js first: npx wrangler deploy');
    process.exit(1);
  }

  let result = {};
  try {
    result = JSON.parse(text);
  } catch {
    result = { raw: text };
  }
  console.log('✅ Migration response:', result);

  // Verify /api/kv/youth-members and /api/state readback from Cloudflare KV
  const kvRes = await fetch(`${WORKER_URL}/api/kv/youth-members?t=${Date.now()}`);
  if (kvRes.ok) {
    const kvData = await kvRes.json();
    console.log(`🔑 Verified GET /api/kv/youth-members -> kvKey: ${kvData.kvKey}, count: ${kvData.count}, withPhone: ${kvData.withPhone}, version: ${kvData.version}`);
  } else {
    console.warn(`⚠️ Verification GET /api/kv/youth-members failed with HTTP ${kvRes.status}`);
  }

  const verifyRes = await fetch(`${WORKER_URL}/api/state?t=${Date.now()}`);
  if (verifyRes.ok) {
    const state = await verifyRes.json();
    const list = Array.isArray(state.registrants) ? state.registrants : [];
    const withPhone = list.filter((m) => m && String(m.phone || m.whatsapp || '').trim()).length;
    console.log(`🔍 Verified GET /api/state -> total: ${list.length}, withPhone: ${withPhone}, version: ${state.version}`);
  } else {
    console.warn(`⚠️ Verification GET /api/state failed with HTTP ${verifyRes.status}`);
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
