import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CreateCorporateOrganizationBody,
  CreateCorporateOrganizationResponse,
  GetCorporateOrganizationsResponse,
  InviteCorporateAdministratorBody,
  InviteCorporateAdministratorResponse,
  InviteCorporateAdministratorParams,
} from "@workspace/api-zod";
import {
  corporateAdministrators,
  corporateEmployees,
  corporateInvitations,
  corporateOrganizations,
  db,
  operationAudit,
  operators,
} from "@workspace/db";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

class CorporateAdminError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function audit(tx: Transaction, actorId: string, action: string, targetId: string, detail = "") {
  await tx.insert(operationAudit).values({ id: randomUUID(), actorId, action, targetId, detail });
}

async function issueAdministratorInvitation(
  tx: Transaction,
  organizationId: string,
  email: string,
  actorId: string,
) {
  const lockKey = `corporate-invite:${organizationId}:${email}:hr_admin`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
  const [pending] = await tx.select().from(corporateInvitations).where(and(
    eq(corporateInvitations.organizationId, organizationId),
    eq(corporateInvitations.email, email),
    eq(corporateInvitations.role, "hr_admin"),
    isNull(corporateInvitations.acceptedAt),
    isNull(corporateInvitations.revokedAt),
  )).limit(1).for("update");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const id = pending?.id ?? randomUUID();
  if (pending) {
    await tx.update(corporateInvitations).set({
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: actorId,
      createdAt: new Date(),
    }).where(eq(corporateInvitations.id, pending.id));
  } else {
    await tx.insert(corporateInvitations).values({
      id,
      organizationId,
      employeeId: null,
      email,
      role: "hr_admin",
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: actorId,
    });
  }
  return { id, email, role: "hr_admin" as const, token, expiresAt };
}

const router = Router();
router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in first." });
    return;
  }
  const [operator] = await db.select({ userId: operators.userId, role: operators.role })
    .from(operators).where(eq(operators.userId, userId)).limit(1);
  if (operator?.role !== "admin") {
    res.status(403).json({ message: "Administrator access is required." });
    return;
  }
  res.locals.corporateAdminUserId = userId;
  next();
});

router.get("/", async (_req, res): Promise<void> => {
  const [organizations, administratorCounts, employeeCounts] = await Promise.all([
    db.select().from(corporateOrganizations).orderBy(desc(corporateOrganizations.createdAt)),
    db.select({
      organizationId: corporateAdministrators.organizationId,
      count: sql<number>`count(*)::int`,
    }).from(corporateAdministrators).groupBy(corporateAdministrators.organizationId),
    db.select({
      organizationId: corporateEmployees.organizationId,
      count: sql<number>`count(*)::int`,
    }).from(corporateEmployees)
      .where(sql`${corporateEmployees.status} in ('invited', 'active')`)
      .groupBy(corporateEmployees.organizationId),
  ]);
  const adminCountByOrganization = new Map(administratorCounts.map(row => [row.organizationId, Number(row.count)]));
  const employeeCountByOrganization = new Map(employeeCounts.map(row => [row.organizationId, Number(row.count)]));
  const response = organizations.map(organization => ({
    id: organization.id,
    name: organization.name,
    status: organization.status,
    createdAt: organization.createdAt,
    administratorCount: adminCountByOrganization.get(organization.id) ?? 0,
    employeeCount: employeeCountByOrganization.get(organization.id) ?? 0,
  }));
  res.json(GetCorporateOrganizationsResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateCorporateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter an organization name and a valid HR administrator email." });
    return;
  }
  const actorId = res.locals.corporateAdminUserId as string;
  const organizationId = randomUUID();
  const email = normalizeEmail(parsed.data.administratorEmail);
  const created = await db.transaction(async tx => {
    const [organization] = await tx.insert(corporateOrganizations).values({
      id: organizationId,
      name: parsed.data.name.trim(),
      createdBy: actorId,
    }).returning();
    const invitation = await issueAdministratorInvitation(tx, organization.id, email, actorId);
    await audit(tx, actorId, "corporate.organization.create", organization.id);
    await audit(tx, actorId, "corporate.hr.invite", invitation.id);
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        status: organization.status,
        createdAt: organization.createdAt,
        administratorCount: 0,
        employeeCount: 0,
      },
      administratorInvitation: invitation,
    };
  });
  res.status(201).json(CreateCorporateOrganizationResponse.parse(created));
});

router.post("/:id/admin-invitations", async (req, res): Promise<void> => {
  const params = InviteCorporateAdministratorParams.safeParse(req.params);
  const parsed = InviteCorporateAdministratorBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose an organization and a valid HR administrator email." });
    return;
  }
  const actorId = res.locals.corporateAdminUserId as string;
  const email = normalizeEmail(parsed.data.email);
  const result = await db.transaction(async tx => {
    const [organization] = await tx.select().from(corporateOrganizations)
      .where(and(
        eq(corporateOrganizations.id, params.data.id),
        eq(corporateOrganizations.status, "active"),
      )).limit(1).for("update");
    if (!organization) throw new CorporateAdminError(404, "Organization not found.");
    const invitation = await issueAdministratorInvitation(tx, organization.id, email, actorId);
    await audit(tx, actorId, "corporate.hr.invite", invitation.id);
    return invitation;
  });
  res.status(201).json(InviteCorporateAdministratorResponse.parse(result));
});

router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof CorporateAdminError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  req.log.error({ err: error }, "Corporate administration request failed");
  res.status(500).json({ message: "The corporate administration request could not be completed. Please try again." });
});

export default router;
