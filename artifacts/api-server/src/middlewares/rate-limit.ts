import type { RequestHandler } from "express";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  keyForRequest: (request: Parameters<RequestHandler>[0]) => string | null;
  now?: () => number;
  maxTrackedKeys?: number;
};

type WindowCounter = {
  startedAt: number;
  count: number;
};

export function createRateLimitMiddleware({
  windowMs,
  maxRequests,
  keyForRequest,
  now = Date.now,
  maxTrackedKeys = 20_000,
}: RateLimitOptions): RequestHandler {
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error("Rate-limit window must be a positive integer.");
  }
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error("Rate-limit request count must be a positive integer.");
  }

  const windows = new Map<string, WindowCounter>();

  return (request, response, next) => {
    const key = keyForRequest(request);
    if (!key) {
      next();
      return;
    }

    const currentTime = now();
    let counter = windows.get(key);
    if (!counter || currentTime - counter.startedAt >= windowMs) {
      counter = { startedAt: currentTime, count: 0 };
    }

    counter.count += 1;
    windows.delete(key);
    windows.set(key, counter);

    if (windows.size > maxTrackedKeys) {
      for (const [trackedKey, trackedWindow] of windows) {
        if (currentTime - trackedWindow.startedAt >= windowMs) windows.delete(trackedKey);
      }
      while (windows.size > maxTrackedKeys) {
        const oldestKey = windows.keys().next().value;
        if (oldestKey === undefined) break;
        windows.delete(oldestKey);
      }
    }

    const resetAt = counter.startedAt + windowMs;
    const remaining = Math.max(0, maxRequests - counter.count);
    response.setHeader("RateLimit-Policy", `${maxRequests};w=${Math.ceil(windowMs / 1000)}`);
    response.setHeader("RateLimit-Limit", String(maxRequests));
    response.setHeader("RateLimit-Remaining", String(remaining));
    response.setHeader("RateLimit-Reset", String(Math.max(0, Math.ceil((resetAt - currentTime) / 1000))));

    if (counter.count > maxRequests) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - currentTime) / 1000))));
      response.status(429).json({ message: "Too many requests. Please wait and try again." });
      return;
    }

    next();
  };
}
