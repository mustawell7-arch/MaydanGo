import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import adminRbacMiddleware from "./middlewares/admin-rbac";
import { createRateLimitMiddleware } from "./middlewares/rate-limit";
import paymentWebhookRouter from "./routes/payment-webhook";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    `https://${getClerkProxyHost(req)}`,
    ...(process.env.NODE_ENV !== "production" ? [
      `https://${process.env.REPLIT_DEV_DOMAIN}`, `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`,
    ] : []),
  ];
  if (origin && !allowed.includes(origin)) {
    res.status(403).json({ message: "Untrusted request origin." }); return;
  }
  cors({ origin: origin || false, credentials: true })(req, res, next);
});
// PayTabs signs the complete callback body, so verify the original bytes before JSON parsing.
app.use("/api/payments", express.raw({ type: "application/json", limit: "1mb" }), paymentWebhookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

const accountKey = (req: Parameters<import("express").RequestHandler>[0]) => {
  const userId = getAuth(req).userId;
  return userId ? `account:${userId}` : null;
};

app.use("/api/attendance/scan", createRateLimitMiddleware({
  windowMs: 60_000,
  maxRequests: 12,
  keyForRequest: accountKey,
}));
app.use("/api/member/bookings", createRateLimitMiddleware({
  windowMs: 60_000,
  maxRequests: 20,
  keyForRequest: accountKey,
}));
app.use("/api", createRateLimitMiddleware({
  windowMs: 60_000,
  maxRequests: 300,
  keyForRequest: accountKey,
}));

app.use(adminRbacMiddleware);
app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err }, "Request failed");
  res.status(500).json({ message: "Unable to save changes. Please try again." });
});

export default app;
