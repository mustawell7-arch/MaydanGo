import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const courseMaterialTokenTtlMs = 5 * 60 * 1000;

export type CourseMaterialTokenClaims = {
  userId: string;
  courseId: string;
  materialId: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return value;
}

export function createCourseMaterialToken(
  claims: Omit<CourseMaterialTokenClaims, "expiresAt">,
  now = Date.now(),
) {
  const expiresAt = now + courseMaterialTokenTtlMs;
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt };
}

export function verifyCourseMaterialToken(
  token: string,
  now = Date.now(),
): CourseMaterialTokenClaims | null {
  if (token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CourseMaterialTokenClaims>;
    if (typeof value.userId !== "string" || !value.userId
        || typeof value.courseId !== "string" || !value.courseId
        || typeof value.materialId !== "string" || !value.materialId
        || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt <= now || value.expiresAt > now + courseMaterialTokenTtlMs + 10_000) return null;
    return {
      userId: value.userId,
      courseId: value.courseId,
      materialId: value.materialId,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
