import app from "./app";
import { logger } from "./lib/logger";
import { processWaitlistQueue } from "./lib/reservations";
import { recoverPushDeliveries } from "./lib/notifications";

const runPushDeliveryRecovery = async () => {
  try {
    const result = await recoverPushDeliveries();
    if (result.receiptsChecked || result.deliveriesRetried) {
      logger.info(result, "Push delivery recovery processed");
    }
  } catch (err) {
    logger.error({ err }, "Push delivery recovery failed");
  }
};

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void processWaitlistQueue().catch(err => logger.error({ err }, "Initial waitlist processing failed"));
  void runPushDeliveryRecovery();
});

const waitlistExpiryTimer = setInterval(() => {
  void processWaitlistQueue().catch(err => logger.error({ err }, "Waitlist processing failed"));
}, 15_000);
waitlistExpiryTimer.unref();

const pushDeliveryRecoveryTimer = setInterval(() => {
  void runPushDeliveryRecovery();
}, 15_000);
pushDeliveryRecoveryTimer.unref();
