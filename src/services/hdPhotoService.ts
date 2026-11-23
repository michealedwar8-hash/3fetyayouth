import { getCloudflareFetchBase, isSameOriginCloudflareWorkerHost } from '../cloudflareDb';

const HD_PHOTO_CACHE_LIMIT = 20;
const MAX_HD_LONGEST_SIDE = 1600;
const HD_QUALITY = 0.92;
const THUMB_MAX_SIDE = 240;
const THUMB_QUALITY = 0.78;

export interface DualPhotoVersions {
  thumbnail: string;
  hdPhoto: string;
}

class FifoHdPhotoCache {
  private map = new Map<string, string>();
  private readonly maxEntries: number;

  constructor(maxEntries = HD_PHOTO_CACHE_LIMIT) {
    this.maxEntries = maxEntries;
  }

  get(memberId: string): string | undefined {
    const key = normalizePhotoMemberId(memberId);
    if (!key) return undefined;
    return this.map.get(key);
  }

  has(memberId: string): boolean {
    const key = normalizePhotoMemberId(memberId);
    return Boolean(key && this.map.has(key));
  }

  set(memberId: string, photoHd: string): void {
    const key = normalizePhotoMemberId(memberId);
    if (!key || !isSafeRasterImageDataUrl(photoHd)) return;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, photoHd);
  }

  delete(memberId: string): void {
    const key = normalizePhotoMemberId(memberId);
    if (key) this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const hdPhotoMemoryCache = new FifoHdPhotoCache(HD_PHOTO_CACHE_LIMIT);
const inFlightHdFetches = new Map<string, Promise<string | null>>();

export function normalizePhotoMemberId(memberId: string | undefined | null): string {
  return String(memberId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120);
}

export function isSafeRasterImageDataUrl(value: string | undefined | null): boolean {
  if (typeof value !== 'string') return false;
  return /^data:image\/(webp|jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/i.test(value.trim());
}

let webpSupportCached: boolean | null = null;
function supportsCanvasWebp(): boolean {
  if (webpSupportCached !== null) return webpSupportCached;
  if (typeof document === 'undefined') {
    webpSupportCached = false;
    return false;
  }
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    const encoded = testCanvas.toDataURL('image/webp', 0.8);
    webpSupportCached = encoded.startsWith('data:image/webp');
  } catch {
    webpSupportCached = false;
  }
  return webpSupportCached;
}

function encodeCanvasSafe(canvas: HTMLCanvasElement, quality: number): string {
  if (supportsCanvasWebp()) {
    try {
      const webp = canvas.toDataURL('image/webp', quality);
      if (webp.startsWith('data:image/webp')) return webp;
    } catch {}
  }
  return canvas.toDataURL('image/jpeg', quality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) resolve(result);
      else reject(new Error('Empty file data'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed reading image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });
}

/**
 * Generates Dual-Tier Photo versions in one decode pass:
 * 1. thumbnail: <= 240x240, quality 0.78 (~15-25KB) -> saved immediately in CLEAN_MASTER_DB_V1.
 * 2. hdPhoto: original aspect ratio, longest side <= 1600px, quality 0.92 (~120-350KB) -> saved silently in KV PHOTO_HD_{memberId}.
 */
export async function createDualPhotoVersions(source: File | string): Promise<DualPhotoVersions> {
  const dataUrl = typeof source === 'string' ? source : await readFileAsDataUrl(source);
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { thumbnail: dataUrl, hdPhoto: dataUrl };
  }

  const img = await loadImageElement(dataUrl);
  const srcW = img.naturalWidth || img.width || THUMB_MAX_SIDE;
  const srcH = img.naturalHeight || img.height || THUMB_MAX_SIDE;

  // 1. Lightweight fast thumbnail (<= 240x240)
  let thumbW = srcW;
  let thumbH = srcH;
  if (thumbW > THUMB_MAX_SIDE || thumbH > THUMB_MAX_SIDE) {
    if (thumbW >= thumbH) {
      thumbH = Math.max(1, Math.round((thumbH * THUMB_MAX_SIDE) / thumbW));
      thumbW = THUMB_MAX_SIDE;
    } else {
      thumbW = Math.max(1, Math.round((thumbW * THUMB_MAX_SIDE) / thumbH));
      thumbH = THUMB_MAX_SIDE;
    }
  }
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.fillStyle = '#ffffff';
    thumbCtx.fillRect(0, 0, thumbW, thumbH);
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);
  }
  const thumbnail = encodeCanvasSafe(thumbCanvas, THUMB_QUALITY);

  // 2. High-Definition photo (preserves original aspect ratio, longest side <= 1600px, quality 0.92)
  let hdW = srcW;
  let hdH = srcH;
  if (hdW > MAX_HD_LONGEST_SIDE || hdH > MAX_HD_LONGEST_SIDE) {
    if (hdW >= hdH) {
      hdH = Math.max(1, Math.round((hdH * MAX_HD_LONGEST_SIDE) / hdW));
      hdW = MAX_HD_LONGEST_SIDE;
    } else {
      hdW = Math.max(1, Math.round((hdW * MAX_HD_LONGEST_SIDE) / hdH));
      hdH = MAX_HD_LONGEST_SIDE;
    }
  }
  const hdCanvas = document.createElement('canvas');
  hdCanvas.width = hdW;
  hdCanvas.height = hdH;
  const hdCtx = hdCanvas.getContext('2d');
  if (hdCtx) {
    hdCtx.fillStyle = '#ffffff';
    hdCtx.fillRect(0, 0, hdW, hdH);
    hdCtx.imageSmoothingEnabled = true;
    hdCtx.imageSmoothingQuality = 'high';
    hdCtx.drawImage(img, 0, 0, hdW, hdH);
  }
  const hdPhoto = encodeCanvasSafe(hdCanvas, HD_QUALITY);

  // Release temporary canvas backing stores promptly for 2GB RAM devices
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;
  hdCanvas.width = 0;
  hdCanvas.height = 0;

  return { thumbnail, hdPhoto };
}

function getPhotoEndpoints(): string[] {
  const sameOrigin = '/api/photo';
  if (isSameOriginCloudflareWorkerHost()) {
    return [sameOrigin];
  }
  const cfBase = getCloudflareFetchBase();
  const cfEndpoint = cfBase ? `${cfBase}/api/photo` : sameOrigin;
  // On preview/local dev: try Cloudflare Worker AND local Express server so HD photos work in both environments
  return cfEndpoint === sameOrigin ? [sameOrigin] : [cfEndpoint, sameOrigin];
}

/**
 * Fire-and-Forget background upload of HD photo to dedicated KV key PHOTO_HD_{memberId}.
 * Never blocks registration or profile save UI.
 */
export function uploadHdPhotoBackground(memberId: string, photoHd: string | null | undefined): void {
  const cleanId = normalizePhotoMemberId(memberId);
  if (!cleanId || !photoHd || !isSafeRasterImageDataUrl(photoHd)) return;

  // Cache immediately so opening the photo on this device is instant (0ms)
  hdPhotoMemoryCache.set(cleanId, photoHd);

  const payload = JSON.stringify({ memberId: cleanId, photoHd });
  const endpoints = getPhotoEndpoints();

  for (const endpoint of endpoints) {
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: payload.length < 60000
      }).catch(() => {});
    } catch {}
  }
}

/**
 * On-demand HD photo fetch strictly triggered when a user clicks a photo to zoom in Lightbox.
 * Checks bounded FIFO memory cache (max 20 entries) first, deduplicates concurrent fetches,
 * and gracefully returns null if an older member does not have an HD photo yet.
 */
export async function fetchHdPhotoOnDemand(memberId: string): Promise<string | null> {
  const cleanId = normalizePhotoMemberId(memberId);
  if (!cleanId) return null;

  const cached = hdPhotoMemoryCache.get(cleanId);
  if (cached) return cached;

  const existingPromise = inFlightHdFetches.get(cleanId);
  if (existingPromise) return existingPromise;

  const fetchPromise = (async (): Promise<string | null> => {
    const endpoints = getPhotoEndpoints();
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(`${endpoint}?id=${encodeURIComponent(cleanId)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const photoHd = typeof data?.photoHd === 'string' ? data.photoHd.trim() : '';
        if (data?.success && isSafeRasterImageDataUrl(photoHd)) {
          hdPhotoMemoryCache.set(cleanId, photoHd);
          return photoHd;
        }
      } catch {
        // Silently try next endpoint or fall back to thumbnail
      }
    }
    return null;
  })().finally(() => {
    inFlightHdFetches.delete(cleanId);
  });

  inFlightHdFetches.set(cleanId, fetchPromise);
  return fetchPromise;
}
