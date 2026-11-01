import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const coursePlaybackTtlMs = 60 * 60 * 1000;

export type CoursePlaybackClaims = {
  userId: string;
  courseId: string;
  lessonId: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return value;
}

export function createCoursePlaybackToken(
  claims: Omit<CoursePlaybackClaims, "expiresAt">,
  now = Date.now(),
) {
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    expiresAt: now + coursePlaybackTtlMs,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: now + coursePlaybackTtlMs };
}

export function verifyCoursePlaybackToken(token: string, now = Date.now()): CoursePlaybackClaims | null {
  if (token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CoursePlaybackClaims>;
    if (typeof value.userId !== "string" || !value.userId
        || typeof value.courseId !== "string" || !value.courseId
        || typeof value.lessonId !== "string" || !value.lessonId
        || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt <= now || value.expiresAt > now + coursePlaybackTtlMs + 10_000) return null;
    return {
      userId: value.userId,
      courseId: value.courseId,
      lessonId: value.lessonId,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
