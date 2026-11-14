import crypto from "node:crypto";
import { get, put } from "@vercel/blob";

const BLOB_PATH = "goethe-b2-progress.json";
const MAX_BODY_BYTES = 32768;
const MAX_ITEMS = 5000;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

function isAuthorized(request) {
  const expected = process.env.SYNC_PASSCODE;
  if (!expected || expected.length < 6) {
    return { ok: false, status: 503, error: "Sync not configured" };
  }

  const provided =
    request.headers.get("x-sync-key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  if (!provided) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const a = sha256Buffer(provided.trim());
  const b = sha256Buffer(expected.trim());
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

function sanitizeIdList(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  for (const item of arr) {
    if (typeof item === "string" && ID_PATTERN.test(item)) {
      seen.add(item);
      if (seen.size >= MAX_ITEMS) break;
    }
  }
  return Array.from(seen);
}

export async function GET(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return jsonResponse({ learned: [], starred: [], updatedAt: 0 });
    }

    const data = await new Response(result.stream).json();
    return jsonResponse({
      learned: sanitizeIdList(data.learned),
      starred: sanitizeIdList(data.starred),
      updatedAt: typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt) ? data.updatedAt : 0
    });
  } catch (err) {
    if (err && err.name === "BlobNotFoundError") {
      return jsonResponse({ learned: [], starred: [], updatedAt: 0 });
    }
    return jsonResponse({ error: "Failed to read progress" }, 500);
  }
}

export async function PUT(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  let rawText = "";
  try {
    rawText = await request.text();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  const cleanPayload = {
    learned: sanitizeIdList(parsed.learned),
    starred: sanitizeIdList(parsed.starred),
    updatedAt:
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now()
  };

  try {
    await put(BLOB_PATH, JSON.stringify(cleanPayload), {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json"
    });
    return jsonResponse({ ok: true, updatedAt: cleanPayload.updatedAt });
  } catch {
    return jsonResponse({ error: "Failed to save progress" }, 500);
  }
}
