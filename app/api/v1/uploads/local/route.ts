import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { storageDriver } from "@/lib/storage";
import { validateImage, MAX_IMAGE_BYTES } from "@/lib/image-pipeline";

/**
 * PUT /api/v1/uploads/local — DEV-ONLY upload sink standing in for R2.
 *
 * Exists so the photo flow is exercisable without Cloudflare credentials. It
 * refuses to run in production, and refuses to run at all once R2 IS configured,
 * so it can never become a second, weaker upload path in a real deployment.
 *
 * Even here the bytes are magic-byte validated (Doc9 §9) — a file claiming to be
 * a PNG but carrying a script is rejected, same as the real pipeline.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || storageDriver() !== "local") return fail("NOT_FOUND");

  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const key = new URL(req.url).searchParams.get("key") ?? "";
  // Keys are server-minted; reject anything that could escape the upload dir.
  if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes("..")) return fail("VALIDATION_ERROR", { field: "key" });

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return fail("FILE_TOO_LARGE");

  const check = await validateImage(buf);
  if (!check.ok) return fail(check.reason === "FILE_TOO_LARGE" ? "FILE_TOO_LARGE" : "FILE_TYPE_BLOCKED");

  const dest = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);

  return ok({ key, width: check.width, height: check.height });
}

export async function POST(req: NextRequest) {
  return PUT(req);
}
