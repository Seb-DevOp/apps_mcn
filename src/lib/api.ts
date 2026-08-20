import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import type { User } from "@prisma/client";

/** Consistent envelopes so the client never has to guess the shape of a response. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** Wraps a route so it only runs with a real session behind it. */
export async function withUser<T>(
  handler: (user: User) => Promise<T>,
): Promise<T | NextResponse> {
  const user = await getSessionUser();
  if (!user) return fail("NO_SESSION", 401);
  return handler(user);
}

/**
 * Small in-process rate limiter.
 *
 * Enough to blunt a naive script against a single instance. A multi-instance
 * deployment should move this to Redis — the call sites do not change.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Keep the map from growing without bound in a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
}, 60_000).unref?.();
