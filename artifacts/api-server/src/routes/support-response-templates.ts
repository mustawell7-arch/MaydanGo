import { Router } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  CreateSupportStaffResponseTemplateBody,
  UpdateSupportStaffResponseTemplateBody,
} from "@workspace/api-zod";
import { db, operationAudit, operators, supportResponseTemplates } from "@workspace/db";
import { BookingError } from "../lib/reservations";
import { isSupportAdministrator } from "../lib/admin-roles";

const router = Router();
type Operator = typeof operators.$inferSelect;

function requireAdmin(operator: Operator) {
  if (!isSupportAdministrator(operator.role)) {
    throw new BookingError(403, "Customer Support Admin access is required to manage approved support replies.");
  }
}

function normalizeTranslations(translations: {
  en: { title: string; body: string };
  ar: { title: string; body: string };
  ku: { title: string; body: string };
}) {
  const normalized = Object.fromEntries(
    (["en", "ar", "ku"] as const).map(language => [language, {
      title: translations[language].title.trim(),
      body: translations[language].body.trim(),
    }]),
  ) as typeof translations;
  if ((["en", "ar", "ku"] as const).some(language =>
    normalized[language].title.length < 2 || !normalized[language].body.length,
  )) throw new BookingError(400, "Add a title and reply text in English, Arabic, and Kurdish.");
  return normalized;
}

router.get("/", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const rows = await db.select({
    id: supportResponseTemplates.id,
    translations: supportResponseTemplates.translations,
    active: supportResponseTemplates.active,
    createdAt: supportResponseTemplates.createdAt,
    updatedAt: supportResponseTemplates.updatedAt,
  }).from(supportResponseTemplates);
  res.json(rows);
});

router.post("/", async (req, res): Promise<void> => {
  const operator = res.locals.supportOperator as Operator;
  requireAdmin(operator);
  const parsed = CreateSupportStaffResponseTemplateBody.safeParse(req.body);
  if (!parsed.success) throw new BookingError(400, "Check the template title and all three translated replies.");
  const id = randomUUID();
  const now = new Date();
  const translations = normalizeTranslations(parsed.data.translations);
  const [template] = await db.insert(supportResponseTemplates).values({
    id, translations, active: true, createdBy: operator.userId, updatedBy: operator.userId,
    createdAt: now, updatedAt: now,
  }).returning({
    id: supportResponseTemplates.id, translations: supportResponseTemplates.translations,
    active: supportResponseTemplates.active, createdAt: supportResponseTemplates.createdAt,
    updatedAt: supportResponseTemplates.updatedAt,
  });
  await db.insert(operationAudit).values({
    id: randomUUID(), actorId: operator.userId, action: "support.response_template.create",
    targetId: id, detail: "Multilingual support reply template created.",
  });
  res.status(201).json(template);
});

router.patch("/:id", async (req, res): Promise<void> => {
  const operator = res.locals.supportOperator as Operator;
  requireAdmin(operator);
  const parsed = UpdateSupportStaffResponseTemplateBody.safeParse(req.body);
  if (!parsed.success) throw new BookingError(400, "Check the template title and all three translated replies.");
  const id = String(req.params.id);
  const [template] = await db.update(supportResponseTemplates).set({
    translations: normalizeTranslations(parsed.data.translations), active: parsed.data.active,
    updatedBy: operator.userId, updatedAt: new Date(),
  }).where(eq(supportResponseTemplates.id, id)).returning({
    id: supportResponseTemplates.id, translations: supportResponseTemplates.translations,
    active: supportResponseTemplates.active, createdAt: supportResponseTemplates.createdAt,
    updatedAt: supportResponseTemplates.updatedAt,
  });
  if (!template) throw new BookingError(404, "Support reply template not found.");
  await db.insert(operationAudit).values({
    id: randomUUID(), actorId: operator.userId, action: "support.response_template.update",
    targetId: id, detail: `active=${template.active}`,
  });
  res.json(template);
});

router.delete("/:id", async (req, res): Promise<void> => {
  const operator = res.locals.supportOperator as Operator;
  requireAdmin(operator);
  const id = String(req.params.id);
  const [template] = await db.update(supportResponseTemplates).set({
    active: false, updatedBy: operator.userId, updatedAt: new Date(),
  }).where(eq(supportResponseTemplates.id, id)).returning({
    id: supportResponseTemplates.id, translations: supportResponseTemplates.translations,
    active: supportResponseTemplates.active, createdAt: supportResponseTemplates.createdAt,
    updatedAt: supportResponseTemplates.updatedAt,
  });
  if (!template) throw new BookingError(404, "Support reply template not found.");
  await db.insert(operationAudit).values({
    id: randomUUID(), actorId: operator.userId, action: "support.response_template.archive",
    targetId: id, detail: "Multilingual support reply template archived.",
  });
  res.json(template);
});

export default router;
