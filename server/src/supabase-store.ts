/**
 * DELIS — Supabase Storage bridge.
 *
 * Keeps the SQLite database file safe across deploys (Render Free resets the
 * filesystem on every deploy). The DB file is downloaded from Supabase Storage
 * at startup and uploaded back every few seconds.
 *
 * Requires only two env vars (no npm packages — uses built-in fetch):
 *   SUPABASE_URL          e.g. https://abcd.supabase.co
 *   SUPABASE_SERVICE_KEY  Project Settings → API → service_role (secret)
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = "delis-data";
const OBJECT = "delis.db";

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

const IMG_BUCKET = "delis-images";

/** Create the PUBLIC bucket for product images (served to the mini app). */
export async function ensureImageBucket(): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const res = await req("/storage/v1/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: IMG_BUCKET, public: true }),
    });
    if (!res.ok && res.status !== 400 && res.status !== 409) {
      console.warn(`[supabase] ensure image bucket: HTTP ${res.status}`);
    } else {
      console.log("[supabase] public image bucket ready:", IMG_BUCKET);
    }
  } catch (e) {
    console.warn("[supabase] ensure image bucket failed:", e);
  }
}

let _imgBucketReady = false;

/**
 * Upload a product image into the public bucket.
 * Returns the public URL to store in products.img, or null on failure.
 */
export async function uploadProductImage(objectPath: string, buf: Buffer, contentType: string): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    if (!_imgBucketReady) {
      await ensureImageBucket(); // lazy: covers endpoints hit before startup init
      _imgBucketReady = true;
    }
    const res = await req(`/storage/v1/object/${IMG_BUCKET}/${objectPath}?upsert=true`, {
      method: "POST",
      headers: { "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      console.warn(`[supabase] image upload: HTTP ${res.status}`);
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${objectPath}`;
  } catch (e) {
    console.warn("[supabase] image upload failed:", e);
    return null;
  }
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init?.headers || {}),
    },
  });
}

/** Create the private bucket if it does not exist yet. */
export async function ensureBucket(): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const res = await req("/storage/v1/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: BUCKET, public: false }),
    });
    if (!res.ok && res.status !== 400 && res.status !== 409) {
      console.warn(`[supabase] ensure bucket: HTTP ${res.status}`);
    } else {
      console.log("[supabase] bucket ready:", BUCKET);
    }
  } catch (e) {
    console.warn("[supabase] ensure bucket failed:", e);
  }
}

/** Download the DB file into place. Returns true when a backup was restored. */
export async function downloadDb(dbPath: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const res = await req(`/storage/v1/object/${BUCKET}/${OBJECT}`);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return false; // empty / not found
    const { writeFileSync } = await import("fs");
    writeFileSync(dbPath, buf);
    console.log(`[supabase] DB restored from storage (${(buf.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (e) {
    console.warn("[supabase] download failed:", e);
    return false;
  }
}

/** Upload the DB file back to storage (upsert). */
export async function uploadDb(dbPath: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const { readFileSync } = await import("fs");
    const buf = readFileSync(dbPath);
    const res = await req(`/storage/v1/object/${BUCKET}/${OBJECT}?upsert=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      console.warn(`[supabase] upload: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[supabase] upload failed:", e);
    return false;
  }
}
