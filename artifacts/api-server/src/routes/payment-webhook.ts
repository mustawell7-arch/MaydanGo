import { Router, type Request, type Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PaymentError, paymentsEnabled, requirePayTabsCredentials } from "../lib/payment-config";
import { handlePayTabsWebhook } from "../lib/payments-paytabs";

const router = Router();
const callbackSchema = z.object({
  tran_ref: z.string().trim().min(1).max(160),
  cart_id: z.string().trim().max(160).optional(),
}).passthrough();

function validPayTabsSignature(rawBody: Buffer, supplied: string, serverKey: string): boolean {
  const signature = supplied.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", serverKey).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

router.post("/webhook", async (req: Request, res: Response) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ message: "A raw PayTabs callback body is required." });
    return;
  }

  const signature = req.header("signature");
  let credentials: ReturnType<typeof requirePayTabsCredentials>;
  try {
    credentials = requirePayTabsCredentials();
  } catch (error) {
    const status = error instanceof PaymentError ? error.status : 503;
    res.status(status).json({ message: "PayTabs callback verification is not configured." });
    return;
  }
  if (!signature || !validPayTabsSignature(rawBody, signature, credentials.serverKey)) {
    res.status(400).json({ message: "PayTabs callback signature verification failed." });
    return;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ message: "The signed PayTabs callback is not valid JSON." });
    return;
  }
  const parsed = callbackSchema.safeParse(decoded);
  if (!parsed.success) {
    res.status(400).json({ message: "The signed PayTabs callback is invalid." });
    return;
  }
  if (!paymentsEnabled()) {
    res.status(503).json({ message: "Paid access is not enabled yet." });
    return;
  }

  try {
    const deliveryId = createHash("sha256").update(rawBody).digest("hex");
    const outcome = await handlePayTabsWebhook(parsed.data, deliveryId);
    res.status(200).json({ received: true, outcome });
  } catch (error) {
    req.log.error({ err: error }, "PayTabs callback processing failed");
    res.status(500).json({ message: "The signed payment event could not be processed yet." });
  }
});

router.all("/return", (_req: Request, res: Response) => {
  res.status(200).type("html").send(
    "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>MaydanGo payment</title></head><body><main><h1>Payment received</h1><p>MaydanGo is confirming the payment. Return to the app to check your membership status.</p></main></body></html>",
  );
});

export default router;
