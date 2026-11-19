import app from "./app";
import { logger } from "./lib/logger";
import { processWaitlistQueue } from "./lib/reservations";
import { escalateUnassignedUrgentTickets, recoverPushDeliveries } from "./lib/notifications";
import { expireGuardianConsentDocuments } from "./lib/guardian-consents";
import { runPartnerDocumentExpiryReminders } from "./lib/partner-document-expiry";
import { processLiveClassReminders } from "./lib/live-class-reminders";

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

const runUrgentEscalations = async () => {
  try {
    const escalatedCount = await escalateUnassignedUrgentTickets();
    if (escalatedCount) logger.info({ escalatedCount }, "Urgent support reports escalated");
  } catch (err) {
    logger.error({ err }, "Urgent support escalation failed");
  }
};

const runGuardianConsentRetention = async () => {
  try {
    const result = await expireGuardianConsentDocuments();
    if (result.deleted || result.failed) logger.info(result, "Guardian-consent retention processed");
  } catch (err) {
    logger.error({ err }, "Guardian-consent retention failed");
  }
};

const runPartnerExpiryReminders = async () => {
  try {
    const result = await runPartnerDocumentExpiryReminders();
    if (result.attempts) logger.info(result, "Partner document expiry reminders processed");
  } catch (err) {
    logger.error({ err }, "Partner document expiry reminders failed");
  }
};

let liveClassRemindersRunning = false;
const runLiveClassReminders = async () => {
  if (liveClassRemindersRunning) return;
  liveClassRemindersRunning = true;
  try {
    const result = await processLiveClassReminders();
    if (result.sent || result.failed) logger.info(result, "Live class reminders processed");
  } catch (err) {
    logger.error({ err }, "Live class reminders failed");
  } finally {
    liveClassRemindersRunning = false;
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
  void runUrgentEscalations();
  void runGuardianConsentRetention();
  void runPartnerExpiryReminders();
  void runLiveClassReminders();
});

const waitlistExpiryTimer = setInterval(() => {
  void processWaitlistQueue().catch(err => logger.error({ err }, "Waitlist processing failed"));
}, 15_000);
waitlistExpiryTimer.unref();

const pushDeliveryRecoveryTimer = setInterval(() => {
  void runPushDeliveryRecovery();
}, 15_000);
pushDeliveryRecoveryTimer.unref();

const urgentEscalationTimer = setInterval(() => {
  void runUrgentEscalations();
}, 60_000);
urgentEscalationTimer.unref();

const guardianConsentRetentionTimer = setInterval(() => {
  void runGuardianConsentRetention();
}, 60 * 60 * 1000);
guardianConsentRetentionTimer.unref();

const partnerDocumentExpiryTimer = setInterval(() => {
  void runPartnerExpiryReminders();
}, 60 * 60 * 1000);
partnerDocumentExpiryTimer.unref();

const liveClassReminderTimer = setInterval(() => {
  void runLiveClassReminders();
}, 60_000);
liveClassReminderTimer.unref();
