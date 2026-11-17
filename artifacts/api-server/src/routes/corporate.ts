import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  AcceptCorporateInvitationBody,
  AcceptCorporateInvitationResponse,
  GetCorporatePortalResponse,
  InviteCorporateEmployeesBody,
  InviteCorporateEmployeesResponse,
  ReissueCorporateEmployeeInvitationParams,
  ReissueCorporateEmployeeInvitationResponse,
  RemoveCorporateEmployeeBody,
  RemoveCorporateEmployeeParams,
  RemoveCorporateEmployeeResponse,
} from "@workspace/api-zod";
import {
  corporateAdministrators,
  corporateEmployees,
  corporateInvitations,
  corporateOrganizations,
  db,
  memberships,
  operationAudit,
} from "@workspace/db";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const issueToken = () => randomBytes(32).toString("base64url");

class CorporateHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type VerifiedEmailResolver = (userId: string) => Promise<string[]>;

async function getVerifiedEmailAddresses(userId: string): Promise<string[]> {
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses
    .filter(address => address.verification?.status === "verified")
    .map(address => normalizeEmail(address.emailAddress));
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function audit(
  tx: Transaction,
  actorId: string,
  action: string,
  targetId: string,
  detail = "",
) {
  await tx.insert(operationAudit).values({
    id: randomUUID(),
    actorId,
    action,
    targetId,
    detail,
  });
}

async function createOrRotateInvitation(
  tx: Transaction,
  values: {
    organizationId: string;
    employeeId: string | null;
    email: string;
    role: "hr_admin" | "employee";
    createdBy: string;
  },
) {
  const lockKey = `corporate-invite:${values.organizationId}:${values.email}:${values.role}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
  const [pending] = await tx.select().from(corporateInvitations).where(and(
    eq(corporateInvitations.organizationId, values.organizationId),
    eq(corporateInvitations.email, values.email),
    eq(corporateInvitations.role, values.role),
    isNull(corporateInvitations.acceptedAt),
    isNull(corporateInvitations.revokedAt),
  )).limit(1).for("update");
  const token = issueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitationId = pending?.id ?? randomUUID();
  if (pending) {
    await tx.update(corporateInvitations).set({
      employeeId: values.employeeId,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: values.createdBy,
      createdAt: new Date(),
    }).where(eq(corporateInvitations.id, pending.id));
  } else {
    await tx.insert(corporateInvitations).values({
      id: invitationId,
      organizationId: values.organizationId,
      employeeId: values.employeeId,
      email: values.email,
      role: values.role,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: values.createdBy,
    });
  }
  return { id: invitationId, email: values.email, role: values.role, token, expiresAt };
}

export function createCorporateRouter(
  resolveVerifiedEmails: VerifiedEmailResolver = getVerifiedEmailAddresses,
) {
  const router = Router();

  router.use((req, res, next) => {
    if (!getAuth(req).userId) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }
    next();
  });

  router.get("/portal", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId!;
    const administratorRows = await db.select({
      organizationId: corporateOrganizations.id,
      organizationName: corporateOrganizations.name,
    }).from(corporateAdministrators)
      .innerJoin(corporateOrganizations, eq(corporateAdministrators.organizationId, corporateOrganizations.id))
      .where(and(
        eq(corporateAdministrators.userId, userId),
        eq(corporateOrganizations.status, "active"),
      ))
      .orderBy(desc(corporateOrganizations.createdAt));

    const adminOrganizations = await Promise.all(administratorRows.map(async organization => {
      const employees = await db.select({
        id: corporateEmployees.id,
        pendingInvitationId: corporateInvitations.id,
        email: corporateEmployees.email,
        status: corporateEmployees.status,
        invitedAt: corporateEmployees.invitedAt,
        inviteExpiresAt: corporateInvitations.expiresAt,
        activatedAt: corporateEmployees.activatedAt,
      }).from(corporateEmployees)
        .leftJoin(corporateInvitations, and(
          eq(corporateInvitations.employeeId, corporateEmployees.id),
          eq(corporateInvitations.role, "employee"),
          isNull(corporateInvitations.acceptedAt),
          isNull(corporateInvitations.revokedAt),
        ))
        .where(eq(corporateEmployees.organizationId, organization.organizationId))
        .orderBy(desc(corporateEmployees.createdAt));
      return {
        id: organization.organizationId,
        name: organization.organizationName,
        employees,
      };
    }));

    const enrollmentRows = await db.select({
      id: corporateEmployees.id,
      organizationId: corporateOrganizations.id,
      organizationName: corporateOrganizations.name,
      status: corporateEmployees.status,
      membershipStatus: memberships.status,
      tier: memberships.tier,
      startsAt: memberships.startsAt,
      endsAt: memberships.endsAt,
    }).from(corporateEmployees)
      .innerJoin(corporateOrganizations, eq(corporateEmployees.organizationId, corporateOrganizations.id))
      .leftJoin(memberships, and(
        eq(memberships.userId, userId),
        eq(memberships.scope, "live"),
        eq(memberships.source, "corporate"),
        eq(memberships.corporateId, corporateOrganizations.id),
      ))
      .where(eq(corporateEmployees.userId, userId))
      .orderBy(desc(corporateOrganizations.createdAt));

    const myEnrollments = enrollmentRows.map(row => ({
      id: row.id,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      status: row.status,
      membership: row.membershipStatus === null || row.tier === null || row.startsAt === null || row.endsAt === null
        ? null
        : {
          status: row.membershipStatus,
          tier: row.tier,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        },
    }));

    res.json(GetCorporatePortalResponse.parse({ adminOrganizations, myEnrollments }));
  });

  router.post("/invitations/accept", async (req, res): Promise<void> => {
    const parsed = AcceptCorporateInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a valid MaydanGo invitation link." });
      return;
    }
    const userId = getAuth(req).userId!;
    let verifiedEmails: string[];
    try {
      verifiedEmails = await resolveVerifiedEmails(userId);
    } catch (error) {
      req.log.error({ err: error }, "Unable to verify a corporate invitation email");
      res.status(503).json({ message: "Email verification is temporarily unavailable. Please try again." });
      return;
    }

    const tokenDigest = hashToken(parsed.data.token);
    const now = new Date();
    const [candidate] = await db.select().from(corporateInvitations).where(and(
      eq(corporateInvitations.tokenHash, tokenDigest),
      isNull(corporateInvitations.acceptedAt),
      isNull(corporateInvitations.revokedAt),
      gt(corporateInvitations.expiresAt, now),
    )).limit(1);
    if (!candidate) {
      res.status(404).json({ message: "This invitation is invalid, expired, or already used." });
      return;
    }
    if (parsed.data.expectedRole && candidate.role !== parsed.data.expectedRole) {
      res.status(403).json({ message: "This is not an employee invitation." });
      return;
    }
    if (!verifiedEmails.includes(normalizeEmail(candidate.email))) {
      res.status(403).json({ message: "Sign in with the verified email address that received this invitation." });
      return;
    }

    const accepted = await db.transaction(async tx => {
      const [invitation] = await tx.select().from(corporateInvitations)
        .where(eq(corporateInvitations.id, candidate.id)).for("update");
      if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) {
        throw new CorporateHttpError(409, "This invitation has already been used or is no longer valid.");
      }
      if (parsed.data.expectedRole && invitation.role !== parsed.data.expectedRole) {
        throw new CorporateHttpError(403, "This is not an employee invitation.");
      }
      const [organization] = await tx.select().from(corporateOrganizations)
        .where(and(
          eq(corporateOrganizations.id, invitation.organizationId),
          eq(corporateOrganizations.status, "active"),
        )).limit(1);
      if (!organization) throw new CorporateHttpError(403, "This organization is not currently active.");

      if (invitation.role === "hr_admin") {
        await tx.insert(corporateAdministrators).values({
          id: randomUUID(),
          organizationId: invitation.organizationId,
          userId,
          assignedBy: invitation.createdBy,
        }).onConflictDoNothing();
      } else {
        if (!invitation.employeeId) throw new CorporateHttpError(409, "The employee invitation is incomplete.");
        const [employee] = await tx.select().from(corporateEmployees)
          .where(and(
            eq(corporateEmployees.id, invitation.employeeId),
            eq(corporateEmployees.organizationId, invitation.organizationId),
            eq(corporateEmployees.email, invitation.email),
          )).for("update");
        if (!employee || employee.status !== "invited") {
          throw new CorporateHttpError(409, "This employee invitation is no longer active.");
        }
        await tx.update(corporateEmployees).set({
          userId,
          status: "active",
          activatedAt: now,
          updatedAt: now,
        }).where(eq(corporateEmployees.id, employee.id));
      }

      await tx.update(corporateInvitations).set({
        acceptedBy: userId,
        acceptedAt: now,
      }).where(eq(corporateInvitations.id, invitation.id));
      await audit(tx, userId, `corporate.invitation.accept.${invitation.role}`, invitation.id);
      return { organizationId: organization.id, organizationName: organization.name, role: invitation.role };
    });

    res.json(AcceptCorporateInvitationResponse.parse(accepted));
  });

  router.post("/employee-invitations", async (req, res): Promise<void> => {
    const parsed = InviteCorporateEmployeesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a company and one or more valid work email addresses." });
      return;
    }
    const actorId = getAuth(req).userId!;
    const emails = parsed.data.emails.map(normalizeEmail);
    if (new Set(emails).size !== emails.length) {
      res.status(400).json({ message: "Remove duplicate email addresses from the list." });
      return;
    }
    const [organization] = await db.select({
      id: corporateOrganizations.id,
      name: corporateOrganizations.name,
    }).from(corporateAdministrators)
      .innerJoin(corporateOrganizations, eq(corporateAdministrators.organizationId, corporateOrganizations.id))
      .where(and(
        eq(corporateAdministrators.userId, actorId),
        eq(corporateOrganizations.id, parsed.data.organizationId),
        eq(corporateOrganizations.status, "active"),
      )).limit(1);
    if (!organization) {
      res.status(403).json({ message: "You do not manage this organization." });
      return;
    }

    const invitations = await db.transaction(async tx => {
      const currentEmployees = emails.length
        ? await tx.select().from(corporateEmployees).where(and(
          eq(corporateEmployees.organizationId, organization.id),
          inArray(corporateEmployees.email, emails),
        )).for("update")
        : [];
      if (currentEmployees.some(employee => employee.status === "active")) {
        throw new CorporateHttpError(409, "One or more addresses already belong to active employees.");
      }

      const result = [];
      for (const email of emails) {
        const existing = currentEmployees.find(employee => employee.email === email);
        const invitedAt = new Date();
        const employeeId = existing?.id ?? randomUUID();
        if (existing) {
          await tx.update(corporateEmployees).set({
            userId: null,
            status: "invited",
            invitedBy: actorId,
            invitedAt,
            activatedAt: null,
            removedAt: null,
            updatedAt: invitedAt,
          }).where(eq(corporateEmployees.id, existing.id));
        } else {
          await tx.insert(corporateEmployees).values({
            id: employeeId,
            organizationId: organization.id,
            email,
            status: "invited",
            invitedBy: actorId,
          });
        }
        const invitation = await createOrRotateInvitation(tx, {
          organizationId: organization.id,
          employeeId,
          email,
          role: "employee",
          createdBy: actorId,
        });
        result.push({
          employeeId,
          id: invitation.id,
          email,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        });
      }
      for (const invitation of result) {
        await audit(tx, actorId, "corporate.employee.invite", invitation.employeeId);
      }
      return result;
    });

    res.status(201).json(InviteCorporateEmployeesResponse.parse({ invitations }));
  });

  router.post("/employee-invitations/:id/reissue", async (req, res): Promise<void> => {
    const params = ReissueCorporateEmployeeInvitationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Choose a valid invitation." });
      return;
    }
    const actorId = getAuth(req).userId!;
    const result = await db.transaction(async tx => {
      const [row] = await tx.select({
        invitation: corporateInvitations,
        organization: corporateOrganizations,
        employee: corporateEmployees,
      }).from(corporateInvitations)
        .innerJoin(corporateOrganizations, eq(corporateInvitations.organizationId, corporateOrganizations.id))
        .innerJoin(corporateEmployees, eq(corporateInvitations.employeeId, corporateEmployees.id))
        .innerJoin(corporateAdministrators, and(
          eq(corporateAdministrators.organizationId, corporateOrganizations.id),
          eq(corporateAdministrators.userId, actorId),
        ))
        .where(and(
          eq(corporateInvitations.id, params.data.id),
          eq(corporateInvitations.role, "employee"),
          eq(corporateOrganizations.status, "active"),
          eq(corporateEmployees.status, "invited"),
          isNull(corporateInvitations.acceptedAt),
          isNull(corporateInvitations.revokedAt),
        )).for("update");
      if (!row) throw new CorporateHttpError(404, "Invitation not found.");
      const token = issueToken();
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
      await tx.update(corporateInvitations).set({
        tokenHash: hashToken(token),
        expiresAt,
        createdBy: actorId,
        createdAt: new Date(),
      }).where(eq(corporateInvitations.id, row.invitation.id));
      await audit(tx, actorId, "corporate.employee.invite.reissue", row.employee.id);
      return {
        id: row.invitation.id,
        email: row.invitation.email,
        role: "employee" as const,
        token,
        expiresAt,
      };
    });
    res.json(ReissueCorporateEmployeeInvitationResponse.parse(result));
  });

  router.post("/employees/:id/remove", async (req, res): Promise<void> => {
    const params = RemoveCorporateEmployeeParams.safeParse(req.params);
    const parsed = RemoveCorporateEmployeeBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ message: "Choose an employee and provide a reason for removal." });
      return;
    }
    const actorId = getAuth(req).userId!;
    const now = new Date();
    const removed = await db.transaction(async tx => {
      const [row] = await tx.select({
        employee: corporateEmployees,
        organization: corporateOrganizations,
      }).from(corporateEmployees)
        .innerJoin(corporateOrganizations, eq(corporateEmployees.organizationId, corporateOrganizations.id))
        .innerJoin(corporateAdministrators, and(
          eq(corporateAdministrators.organizationId, corporateOrganizations.id),
          eq(corporateAdministrators.userId, actorId),
        ))
        .where(and(
          eq(corporateEmployees.id, params.data.id),
          eq(corporateOrganizations.status, "active"),
        )).for("update");
      if (!row) throw new CorporateHttpError(404, "Employee not found.");
      if (row.employee.status === "removed") {
        throw new CorporateHttpError(409, "This employee has already been removed.");
      }
      if (row.employee.userId) {
        const [activeMembership] = await tx.select({ userId: memberships.userId }).from(memberships)
          .where(and(
            eq(memberships.userId, row.employee.userId),
            eq(memberships.scope, "live"),
            eq(memberships.source, "corporate"),
            eq(memberships.corporateId, row.organization.id),
            inArray(memberships.status, ["active", "trial", "grace_period"]),
            gt(memberships.endsAt, now),
          )).limit(1);
        if (activeMembership) {
          throw new CorporateHttpError(409, "Ask a MaydanGo administrator to close this company's active membership before removing the employee.");
        }
      }
      await tx.update(corporateEmployees).set({
        status: "removed",
        removedAt: now,
        updatedAt: now,
      }).where(eq(corporateEmployees.id, row.employee.id));
      await tx.update(corporateInvitations).set({ revokedAt: now }).where(and(
        eq(corporateInvitations.employeeId, row.employee.id),
        isNull(corporateInvitations.acceptedAt),
        isNull(corporateInvitations.revokedAt),
      ));
      await audit(tx, actorId, "corporate.employee.remove", row.employee.id, parsed.data.reason);
      return { id: row.employee.id, status: "removed" as const };
    });
    res.json(RemoveCorporateEmployeeResponse.parse(removed));
  });

  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof CorporateHttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    req.log.error({ err: error }, "Corporate portal request failed");
    res.status(500).json({ message: "The corporate request could not be completed. Please try again." });
  });

  return router;
}

export default createCorporateRouter();
