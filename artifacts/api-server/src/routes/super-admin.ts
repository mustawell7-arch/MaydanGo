import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db, accountAccessRestrictions, adminRolePermissions, attendance, facilityProfiles, guardianConsentDocuments, legalPolicyVersions, memberConsentEvents, operationAudit, operators, offerings, partners, platformSafetyRules } from "@workspace/db";
import { z } from "zod";
import {
  GetSuperAdminPlatformRulesResponse,
  GetSuperAdminRolePermissionsResponse,
  GetSuperAdminAccountsResponse,
  GetSuperAdminAccountRestrictionsResponse,
  GetSuperAdminAuditLogsQueryParams,
  GetSuperAdminAuditLogsResponse,
  GetSuperAdminMemberConsentHistoryQueryParams,
  GetSuperAdminMemberConsentHistoryResponse,
  GetSuperAdminLegalPolicyVersionsResponse,
  CreateSuperAdminLegalPolicyDraftBody,
  CreateSuperAdminLegalPolicyDraftResponse,
  UpdateSuperAdminLegalPolicyDraftBody,
  UpdateSuperAdminLegalPolicyDraftResponse,
  PublishSuperAdminLegalPolicyVersionResponse,
  UpdateSuperAdminPlatformRulesBody,
  UpdateSuperAdminPlatformRulesResponse,
  UpdateSuperAdminRolePermissionsBody,
  UpdateSuperAdminRolePermissionsParams,
  UpdateSuperAdminRolePermissionsResponse,
  UpsertSuperAdminAccountBody,
  UpsertSuperAdminAccountResponse,
  UpdateSuperAdminAccountRestrictionBody,
  UpdateSuperAdminAccountRestrictionResponse,
} from "@workspace/api-zod";
import {
  ADMIN_ACTIONS,
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_ADMIN_ACTIONS,
  type AdminAction,
  type AdminRole,
} from "../lib/admin-roles";
import { DEFAULT_PLATFORM_SAFETY_RULES, platformSafetyRulesSchema } from "../lib/platform-rules";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { sendMemberNotification } from "../lib/notifications";
import { lockVenueAccess } from "../lib/account-access-restrictions";
import { cancelUpcomingVenueSessions, type UpcomingVenueTarget } from "../lib/venue-suspensions";
import { isCompletePolicyTranslation, policyDocumentPath } from "../lib/legal-policies";

type ClerkAccount = { userId: string; email: string };
type ClerkDirectory = {
  findVerifiedByEmail(email: string): Promise<ClerkAccount | null>;
  getEmail(userId: string): Promise<string | null>;
};

const adminRoles = Object.keys(ADMIN_ROLE_PERMISSIONS) as AdminRole[];
const objectStorage = new ObjectStorageService();
const isAdminRole = (role: string | null | undefined): role is AdminRole =>
  !!role && Object.hasOwn(ADMIN_ROLE_PERMISSIONS, role);

const clerkDirectory: ClerkDirectory = {
  async findVerifiedByEmail(email) {
    const result = await clerkClient.users.getUserList({ emailAddress: [email], limit: 100 });
    const matches = result.data.flatMap(user =>
      user.emailAddresses
        .filter(address =>
          address.emailAddress.toLowerCase() === email
          && address.verification?.status === "verified",
        )
        .map(address => ({ userId: user.id, email: address.emailAddress })),
    );
    if (matches.length > 1) throw new Error("The email matched more than one Clerk account.");
    return matches[0] ?? null;
  },
  async getEmail(userId) {
    try {
      const user = await clerkClient.users.getUser(userId);
      return user.primaryEmailAddress?.emailAddress ?? null;
    } catch (error) {
      if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
        return null;
      }
      throw error;
    }
  },
};

function isManagedAdminRow(row: typeof operators.$inferSelect): boolean {
  return isAdminRole(row.role)
    || (row.role === "admin_suspended" && isAdminRole(row.suspendedRole));
}

function roleFromRow(row: typeof operators.$inferSelect): AdminRole | null {
  if (row.role === "admin_suspended") return isAdminRole(row.suspendedRole) ? row.suspendedRole : null;
  return isAdminRole(row.role) ? row.role : null;
}

export function createSuperAdminRouter(
  directory: ClerkDirectory = clerkDirectory,
  notifyMember: typeof sendMemberNotification = sendMemberNotification,
): IRouter {
  const router: IRouter = Router();

  router.use(async (req, res, next) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }

    const [operator] = await db.select({ role: operators.role }).from(operators)
      .where(eq(operators.userId, userId)).limit(1);
    if (operator?.role !== "super_admin") {
      res.status(403).json({ message: "Super Admin access is required." });
      return;
    }

    res.locals.superAdminUserId = userId;
    next();
  });

  router.get("/admin-accounts", async (_req, res): Promise<void> => {
    const rows = await db.select().from(operators)
      .where(or(inArray(operators.role, adminRoles), eq(operators.role, "admin_suspended")))
      .orderBy(operators.userId);

    const accounts = await Promise.all(rows.filter(isManagedAdminRow).map(async row => ({
      userId: row.userId,
      email: await directory.getEmail(row.userId),
      role: roleFromRow(row)!,
      status: row.role === "admin_suspended" ? "suspended" as const : "active" as const,
    })));

    res.json(GetSuperAdminAccountsResponse.parse(accounts));
  });

  router.get("/account-restrictions", async (_req, res): Promise<void> => {
    const [restrictions, partnerRows, facilityRows] = await Promise.all([
      db.select().from(accountAccessRestrictions).orderBy(desc(accountAccessRestrictions.updatedAt)),
      db.select({ id: partners.id, label: partners.name }).from(partners).orderBy(partners.name),
      db.select({
        id: facilityProfiles.id,
        partnerId: facilityProfiles.partnerId,
        facility: facilityProfiles.facility,
        city: facilityProfiles.city,
      }).from(facilityProfiles).orderBy(facilityProfiles.city, facilityProfiles.facility),
    ]);
    const partnerById = new Map(partnerRows.map(row => [row.id, row.label]));
    const facilityById = new Map(facilityRows.map(row => [
      row.id,
      `${row.facility} · ${row.city} · ${partnerById.get(row.partnerId) ?? "Partner"}`,
    ]));
    const items = await Promise.all(restrictions.map(async row => ({
      entityType: row.entityType as "member" | "partner" | "facility",
      entityId: row.entityId,
      targetLabel: row.entityType === "member"
        ? await directory.getEmail(row.entityId) ?? row.entityId
        : row.entityType === "partner"
          ? partnerById.get(row.entityId) ?? row.entityId
          : facilityById.get(row.entityId) ?? row.entityId,
      status: row.status as "active" | "suspended",
      reasonCategory: row.reasonCategory as "administrative" | "safety" | "fraud" | "closure",
      reason: row.reason,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    })));
    const targets = [
      ...partnerRows.map(row => ({ entityType: "partner" as const, entityId: row.id, label: row.label })),
      ...facilityRows.map(row => ({
        entityType: "facility" as const,
        entityId: row.id,
        label: facilityById.get(row.id)!,
      })),
    ];
    res.json(GetSuperAdminAccountRestrictionsResponse.parse({ items, targets }));
  });

  router.put("/account-restrictions", async (req, res): Promise<void> => {
    const parsed = UpdateSuperAdminAccountRestrictionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Choose a target, status, and a clear reason." });
      return;
    }
    const input = parsed.data;
    let entityId = input.target.trim();
    let targetLabel = entityId;
    let venueTarget: UpcomingVenueTarget | null = null;
    if (input.entityType === "member") {
      if (input.status === "suspended" || entityId.includes("@")) {
        const account = await directory.findVerifiedByEmail(entityId.toLowerCase());
        if (!account) {
          res.status(404).json({ message: "No existing account with this verified email was found." });
          return;
        }
        entityId = account.userId;
        targetLabel = account.email;
      } else {
        const email = await directory.getEmail(entityId);
        if (!email) {
          res.status(404).json({ message: "The member account could not be found." });
          return;
        }
        targetLabel = email;
      }
    } else if (input.entityType === "partner") {
      const [partner] = await db.select({ id: partners.id, name: partners.name })
        .from(partners).where(eq(partners.id, entityId)).limit(1);
      if (!partner) {
        res.status(404).json({ message: "Partner account not found." });
        return;
      }
      targetLabel = partner.name;
      venueTarget = { partnerId: partner.id };
    } else {
      const [facility] = await db.select({
        id: facilityProfiles.id,
        facility: facilityProfiles.facility,
        city: facilityProfiles.city,
        partnerId: facilityProfiles.partnerId,
      }).from(facilityProfiles).where(eq(facilityProfiles.id, entityId)).limit(1);
      if (!facility) {
        res.status(404).json({ message: "Facility not found." });
        return;
      }
      const [partner] = await db.select({ name: partners.name }).from(partners)
        .where(eq(partners.id, facility.partnerId)).limit(1);
      targetLabel = `${facility.facility} · ${facility.city} · ${partner?.name ?? "Partner"}`;
      venueTarget = {
        partnerId: facility.partnerId,
        city: facility.city,
        facility: facility.facility,
      };
    }

    const actorId = res.locals.superAdminUserId as string;
    const result = await db.transaction(async tx => {
      const [previous] = await tx.select().from(accountAccessRestrictions).where(and(
        eq(accountAccessRestrictions.entityType, input.entityType),
        eq(accountAccessRestrictions.entityId, entityId),
      )).for("update");
      const reasonCategory = input.entityType === "member"
        ? "administrative"
        : input.status === "suspended"
          ? input.reasonCategory ?? previous?.reasonCategory ?? "administrative"
          : previous?.reasonCategory ?? input.reasonCategory ?? "administrative";
      const cancellation = input.status === "suspended"
        && input.entityType !== "member"
        && reasonCategory !== "administrative"
        && venueTarget
        ? await cancelUpcomingVenueSessions(tx, venueTarget, actorId)
        : null;
      if (venueTarget) {
        await lockVenueAccess(tx, venueTarget.partnerId, venueTarget.city, venueTarget.facility);
      }
      const [row] = await tx.insert(accountAccessRestrictions).values({
        entityType: input.entityType,
        entityId,
        status: input.status,
        reasonCategory,
        reason: input.reason.trim(),
        updatedBy: actorId,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [accountAccessRestrictions.entityType, accountAccessRestrictions.entityId],
        set: {
          status: input.status,
          reasonCategory,
          reason: input.reason.trim(),
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      }).returning();
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId,
        action: `super_admin.account_access.${input.status === "suspended" ? "suspend" : "restore"}`,
        targetId: `${input.entityType}:${entityId}`,
        detail: `category=${reasonCategory};reason=${input.reason.trim()}${cancellation
          ? `;cancelledOfferings=${cancellation.cancelledOfferingCount};cancelledBookings=${cancellation.cancelledBookingCount};closedWaitlists=${cancellation.closedWaitlistCount}`
          : ""}`,
      });
      return { row, cancellation };
    });
    if (result.cancellation) {
      const dedupePrefix = `venue-suspension:${input.entityType}:${entityId}:${result.row.updatedAt.getTime()}`;
      await Promise.allSettled([
        ...result.cancellation.affectedMemberIds.map(userId => notifyMember(
          userId,
          "venue_suspension_cancelled",
          { dedupeKey: `${dedupePrefix}:booking:${userId}` },
        )),
        ...result.cancellation.affectedWaitlistMemberIds.map(userId => notifyMember(
          userId,
          "waitlist_closed",
          { dedupeKey: `${dedupePrefix}:waitlist:${userId}` },
        )),
      ]);
    }
    res.json(UpdateSuperAdminAccountRestrictionResponse.parse({
      entityType: input.entityType,
      entityId,
      targetLabel,
      status: result.row.status,
      reasonCategory: result.row.reasonCategory,
      reason: result.row.reason,
      updatedBy: result.row.updatedBy,
      updatedAt: result.row.updatedAt,
      ...(result.cancellation ? {
        cancelledOfferingCount: result.cancellation.cancelledOfferingCount,
        cancelledBookingCount: result.cancellation.cancelledBookingCount,
        closedWaitlistCount: result.cancellation.closedWaitlistCount,
      } : {}),
    }));
  });

  router.get("/role-permissions", async (_req, res): Promise<void> => {
    const rows = await db.select().from(adminRolePermissions);
    const policies = new Map(rows.map(row => [row.role, row]));
    const result = adminRoles.map(role => {
      const policy = policies.get(role);
      return {
        role,
        actions: policy
          ? policy.actions.filter((action): action is AdminAction =>
              (ADMIN_ACTIONS as readonly string[]).includes(action))
          : DEFAULT_ADMIN_ACTIONS[role],
        isCustom: !!policy,
        locked: role === "super_admin",
        updatedAt: policy?.updatedAt ?? null,
      };
    });
    res.json(GetSuperAdminRolePermissionsResponse.parse(result));
  });

  router.put("/role-permissions/:role", async (req, res): Promise<void> => {
    const params = UpdateSuperAdminRolePermissionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Choose a valid administrator role." });
      return;
    }
    const parsed = UpdateSuperAdminRolePermissionsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const { role } = params.data;
    if (role === "super_admin") {
      res.status(409).json({ message: "Super Admin permissions remain locked to protect platform access." });
      return;
    }
    const requestedActions = parsed.data.actions;
    if (requestedActions && new Set(requestedActions).size !== requestedActions.length) {
      res.status(400).json({ message: "Each permission can only be selected once." });
      return;
    }

    const actorId = res.locals.superAdminUserId as string;
    const saved = await db.transaction(async tx => {
      const [previous] = await tx.select().from(adminRolePermissions)
        .where(eq(adminRolePermissions.role, role)).for("update");
      const before: readonly string[] = previous?.actions ?? DEFAULT_ADMIN_ACTIONS[role];
      const nextActions: AdminAction[] = requestedActions === null
        ? [...DEFAULT_ADMIN_ACTIONS[role]]
        : ADMIN_ACTIONS.filter(action => requestedActions.includes(action));
      const changed = previous
        ? requestedActions === null || before.length !== nextActions.length
          || !nextActions.every(action => before.includes(action))
        : requestedActions !== null;

      let updatedAt: Date | null = previous?.updatedAt ?? null;
      if (requestedActions === null) {
        if (previous) await tx.delete(adminRolePermissions).where(eq(adminRolePermissions.role, role));
      } else {
        const [policy] = await tx.insert(adminRolePermissions).values({
          role,
          actions: [...nextActions],
          updatedBy: actorId,
        }).onConflictDoUpdate({
          target: adminRolePermissions.role,
          set: { actions: [...nextActions], updatedBy: actorId, updatedAt: new Date() },
        }).returning();
        updatedAt = policy.updatedAt;
      }

      if (changed) {
        await tx.insert(operationAudit).values({
          id: randomUUID(),
          actorId,
          action: "super_admin.role_permissions.updated",
          targetId: `role:${role}`,
          detail: requestedActions === null
            ? `reset_to_defaults; previous=${before.join(",")}`
            : `actions=${nextActions.join(",")}`,
        });
      }

      return {
        role,
        actions: nextActions,
        isCustom: requestedActions !== null,
        locked: false,
        updatedAt,
      };
    });

    res.json(UpdateSuperAdminRolePermissionsResponse.parse(saved));
  });

  router.get("/platform-rules", async (_req, res): Promise<void> => {
    const [row] = await db.select().from(platformSafetyRules)
      .where(eq(platformSafetyRules.id, "global")).limit(1);
    res.json(GetSuperAdminPlatformRulesResponse.parse({
      settings: row ? platformSafetyRulesSchema.parse(row.settings) : DEFAULT_PLATFORM_SAFETY_RULES,
      isCustom: !!row,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }));
  });

  router.put("/platform-rules", async (req, res): Promise<void> => {
    const parsed = UpdateSuperAdminPlatformRulesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const validated = platformSafetyRulesSchema.safeParse(parsed.data.settings);
    if (!validated.success) {
      res.status(400).json({ message: validated.error.message });
      return;
    }

    const actorId = res.locals.superAdminUserId as string;
    const saved = await db.transaction(async tx => {
      const [previous] = await tx.select().from(platformSafetyRules)
        .where(eq(platformSafetyRules.id, "global")).for("update").limit(1);
      const before = previous
        ? platformSafetyRulesSchema.parse(previous.settings)
        : DEFAULT_PLATFORM_SAFETY_RULES;
      const next = validated.data;
      const changedFields = (Object.keys(next) as (keyof typeof next)[])
        .filter(key => next[key] !== before[key]);

      if (!changedFields.length) {
        return {
          settings: before,
          isCustom: !!previous,
          updatedAt: previous?.updatedAt.toISOString() ?? null,
        };
      }

      const now = new Date();
      const [updated] = await tx.insert(platformSafetyRules).values({
        id: "global",
        settings: next,
        updatedBy: actorId,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: platformSafetyRules.id,
        set: { settings: next, updatedBy: actorId, updatedAt: now },
      }).returning();

      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId,
        action: "super_admin.platform_safety_rules.updated",
        targetId: "platform:global",
        detail: JSON.stringify({
          changedFields,
          before: Object.fromEntries(changedFields.map(key => [key, before[key]])),
          after: Object.fromEntries(changedFields.map(key => [key, next[key]])),
        }),
      });

      return {
        settings: updated.settings,
        isCustom: true,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });

    res.json(UpdateSuperAdminPlatformRulesResponse.parse(saved));
  });

  router.put("/admin-accounts", async (req, res): Promise<void> => {
    const parsed = UpsertSuperAdminAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const account = await directory.findVerifiedByEmail(email);
    if (!account) {
      res.status(404).json({ message: "No existing account with this verified email was found." });
      return;
    }

    const actorId = res.locals.superAdminUserId as string;
    const updated = await db.transaction(async tx => {
      const managedRows = await tx.select().from(operators)
        .where(or(inArray(operators.role, adminRoles), eq(operators.role, "admin_suspended")))
        .for("update");
      const [existing] = await tx.select().from(operators)
        .where(eq(operators.userId, account.userId)).for("update");

      if (existing && !isManagedAdminRow(existing)) {
        res.status(409).json({ message: "This account already has a different staff role." });
        return null;
      }
      if (parsed.data.status === "suspended" && !existing) {
        res.status(404).json({ message: "Assign an administrator role before suspending this account." });
        return null;
      }

      const previousRole = existing ? roleFromRow(existing) : null;
      const previousStatus = existing?.role === "admin_suspended" ? "suspended" : existing ? "active" : "not_assigned";
      if ((parsed.data.status === "suspended" || previousStatus === "suspended")
        && (parsed.data.reason?.trim().length ?? 0) < 5) {
        res.status(400).json({ message: "Enter a clear reason of at least five characters for suspension or restoration." });
        return null;
      }
      const removesSuperAdmin = previousRole === "super_admin"
        && (parsed.data.status === "suspended" || parsed.data.role !== "super_admin");

      if (removesSuperAdmin && actorId === account.userId) {
        res.status(409).json({ message: "Another Super Admin must change your own access." });
        return null;
      }
      if (removesSuperAdmin && managedRows.filter(row => row.role === "super_admin").length <= 1) {
        res.status(409).json({ message: "At least one active Super Admin must remain." });
        return null;
      }

      const role = parsed.data.status === "suspended" ? "admin_suspended" : parsed.data.role;
      const suspendedRole = parsed.data.status === "suspended" ? parsed.data.role : null;
      const [saved] = existing
        ? await tx.update(operators)
          .set({ role, suspendedRole, partnerId: null })
          .where(eq(operators.userId, account.userId))
          .returning()
        : await tx.insert(operators)
          .values({ userId: account.userId, role, suspendedRole, partnerId: null })
          .returning();

      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId,
        action: "super_admin.admin_account.updated",
        targetId: account.userId,
        detail: `role:${previousRole ?? "none"}->${parsed.data.role};status:${previousStatus}->${parsed.data.status}${parsed.data.reason ? `;reason=${parsed.data.reason.trim()}` : ""}`,
      });

      return saved;
    });

    if (!updated) return;
    res.json(UpsertSuperAdminAccountResponse.parse({
      userId: updated.userId,
      email: account.email,
      role: parsed.data.role,
      status: parsed.data.status,
    }));
  });

  router.get("/audit-logs", async (req, res): Promise<void> => {
    const parsed = GetSuperAdminAuditLogsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const rows = await db.select({
      id: operationAudit.id,
      actorId: operationAudit.actorId,
      action: operationAudit.action,
      targetId: operationAudit.targetId,
      detail: operationAudit.detail,
      createdAt: operationAudit.createdAt,
    }).from(operationAudit)
      .orderBy(desc(operationAudit.createdAt))
      .offset(parsed.data.offset ?? 0)
      .limit(parsed.data.limit ?? 100);
    res.json(GetSuperAdminAuditLogsResponse.parse(rows));
  });

  router.get("/member-consents", async (req, res): Promise<void> => {
    const parsed = GetSuperAdminMemberConsentHistoryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const rows = await db.select({
      id: memberConsentEvents.id,
      userId: memberConsentEvents.userId,
      purpose: memberConsentEvents.purpose,
      policyVersion: memberConsentEvents.policyVersion,
      choice: memberConsentEvents.choice,
      recordedAt: memberConsentEvents.recordedAt,
    }).from(memberConsentEvents)
      .where(parsed.data.userId ? eq(memberConsentEvents.userId, parsed.data.userId) : undefined)
      .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id))
      .offset(parsed.data.offset ?? 0)
      .limit(parsed.data.limit ?? 100);
    const actorId = res.locals.superAdminUserId as string;
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "super_admin.member_consent_history.viewed",
      targetId: "member-consent-history",
      detail: `limit=${parsed.data.limit ?? 100};offset=${parsed.data.offset ?? 0};filtered=${Boolean(parsed.data.userId)}`,
    });
    res.json(GetSuperAdminMemberConsentHistoryResponse.parse(rows.map(row => ({
      ...row,
      documentPath: row.purpose === "terms_of_use" || row.purpose === "privacy_policy"
        ? policyDocumentPath(row.purpose, row.policyVersion)
        : null,
      recordedAt: row.recordedAt.toISOString(),
    }))));
  });

  router.get("/policies", async (_req, res): Promise<void> => {
    const rows = await db.select().from(legalPolicyVersions)
      .orderBy(desc(legalPolicyVersions.createdAt), desc(legalPolicyVersions.id))
      .limit(500);
    res.json(GetSuperAdminLegalPolicyVersionsResponse.parse(rows.map(row => ({
      ...row,
      effectiveAt: row.effectiveAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))));
  });

  router.post("/policies", async (req, res): Promise<void> => {
    const parsed = CreateSuperAdminLegalPolicyDraftBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a valid policy version, effective date, and translations." });
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(parsed.data.version)) {
      res.status(400).json({ message: "Enter a valid policy version." });
      return;
    }
    const effectiveAt = new Date(parsed.data.effectiveAt);
    if (!Number.isFinite(effectiveAt.getTime())) {
      res.status(400).json({ message: "Choose a valid effective date." });
      return;
    }
    const id = randomUUID();
    const [created] = await db.insert(legalPolicyVersions).values({
      id,
      policyKey: parsed.data.policyKey,
      version: parsed.data.version,
      status: "draft",
      translations: parsed.data.translations,
      effectiveAt,
      createdBy: res.locals.superAdminUserId as string,
    }).onConflictDoNothing()
      .returning();
    if (!created) {
      res.status(409).json({ message: "That version already exists for this policy." });
      return;
    }
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: res.locals.superAdminUserId as string,
      action: "super_admin.legal_policy.draft_created",
      targetId: `${created.policyKey}:${created.version}`,
      detail: "Created a draft policy version.",
    });
    res.status(201).json(CreateSuperAdminLegalPolicyDraftResponse.parse({
      ...created,
      effectiveAt: created.effectiveAt.toISOString(),
      publishedAt: null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    }));
  });

  router.patch("/policies/:id", async (req, res): Promise<void> => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const parsed = UpdateSuperAdminLegalPolicyDraftBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ message: "Choose a valid draft and provide complete version details." });
      return;
    }
    const [existing] = await db.select().from(legalPolicyVersions)
      .where(eq(legalPolicyVersions.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ message: "Policy draft not found." });
      return;
    }
    if (existing.status !== "draft") {
      res.status(409).json({ message: "Published policy versions cannot be changed." });
      return;
    }
    const effectiveAt = new Date(parsed.data.effectiveAt);
    if (!Number.isFinite(effectiveAt.getTime())) {
      res.status(400).json({ message: "Choose a valid effective date." });
      return;
    }
    const [updated] = await db.update(legalPolicyVersions).set({
      translations: parsed.data.translations,
      effectiveAt,
      updatedAt: new Date(),
    }).where(and(
      eq(legalPolicyVersions.id, params.data.id),
      eq(legalPolicyVersions.status, "draft"),
    )).returning();
    if (!updated) {
      res.status(409).json({ message: "Published policy versions cannot be changed." });
      return;
    }
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: res.locals.superAdminUserId as string,
      action: "super_admin.legal_policy.draft_updated",
      targetId: `${updated.policyKey}:${updated.version}`,
      detail: "Updated an unpublished policy draft.",
    });
    res.json(UpdateSuperAdminLegalPolicyDraftResponse.parse({
      ...updated,
      effectiveAt: updated.effectiveAt.toISOString(),
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }));
  });

  router.post("/policies/:id/publish", async (req, res): Promise<void> => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Choose a valid policy draft." });
      return;
    }
    const [draft] = await db.select().from(legalPolicyVersions)
      .where(eq(legalPolicyVersions.id, params.data.id)).limit(1);
    if (!draft) {
      res.status(404).json({ message: "Policy draft not found." });
      return;
    }
    if (draft.status !== "draft") {
      res.status(409).json({ message: "This policy version has already been published and is immutable." });
      return;
    }
    const locales = ["en", "ar", "ku"] as const;
    if (!draft.translations || !locales.every(locale => {
      const translation = draft.translations[locale];
      return translation && isCompletePolicyTranslation(translation);
    })) {
      res.status(400).json({ message: "Complete the title, introduction, and policy text in English, Arabic, and Kurdish before publishing." });
      return;
    }
    const publishedAt = new Date();
    const actorId = res.locals.superAdminUserId as string;
    const [published] = await db.update(legalPolicyVersions).set({
      status: "published",
      publishedAt,
      publishedBy: actorId,
      updatedAt: publishedAt,
    }).where(and(
      eq(legalPolicyVersions.id, params.data.id),
      eq(legalPolicyVersions.status, "draft"),
    )).returning();
    if (!published) {
      res.status(409).json({ message: "This policy version has already been published and is immutable." });
      return;
    }
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "super_admin.legal_policy.published",
      targetId: `${published.policyKey}:${published.version}`,
      detail: `Effective ${published.effectiveAt.toISOString()}.`,
    });
    res.json(PublishSuperAdminLegalPolicyVersionResponse.parse({
      ...published,
      effectiveAt: published.effectiveAt.toISOString(),
      publishedAt: published.publishedAt?.toISOString() ?? null,
      createdAt: published.createdAt.toISOString(),
      updatedAt: published.updatedAt.toISOString(),
    }));
  });

  router.get("/guardian-consents", async (req, res): Promise<void> => {
    const paging = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(100),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    }).safeParse(req.query);
    if (!paging.success) {
      res.status(400).json({ message: paging.error.message });
      return;
    }
    const now = new Date();
    const items = await db.select({
      id: guardianConsentDocuments.id,
      memberUserId: guardianConsentDocuments.memberUserId,
      partnerName: partners.name,
      facility: offerings.facility,
      sessionTitle: offerings.title,
      visitAt: attendance.checkedInAt,
      verifiedAt: guardianConsentDocuments.verifiedAt,
      expiresAt: guardianConsentDocuments.expiresAt,
    }).from(guardianConsentDocuments)
      .innerJoin(attendance, eq(guardianConsentDocuments.attendanceId, attendance.id))
      .innerJoin(offerings, eq(attendance.offeringId, offerings.id))
      .leftJoin(partners, eq(offerings.partnerId, partners.id))
      .where(and(
        eq(guardianConsentDocuments.status, "ready"),
        gt(guardianConsentDocuments.expiresAt, now),
      ))
      .orderBy(desc(guardianConsentDocuments.verifiedAt))
      .offset(paging.data.offset)
      .limit(paging.data.limit);
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: res.locals.superAdminUserId as string,
      action: "guardian_consent.list",
      targetId: "guardian-consent-documents",
      detail: `limit=${paging.data.limit};offset=${paging.data.offset}`,
    });
    res.json({ items });
  });

  router.get("/guardian-consents/:id/document", async (req, res): Promise<void> => {
    const [document] = await db.select().from(guardianConsentDocuments)
      .where(eq(guardianConsentDocuments.id, req.params.id)).limit(1);
    if (!document || document.status !== "ready" || !document.objectPath || document.expiresAt <= new Date()) {
      res.status(404).json({ message: "Guardian-consent document is not available." });
      return;
    }
    let file;
    try {
      file = await objectStorage.getPrivateFile(document.objectPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(410).json({ message: "Guardian-consent document is no longer available." });
        return;
      }
      throw error;
    }
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024) {
      res.status(410).json({ message: "Guardian-consent document is no longer available." });
      return;
    }
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: res.locals.superAdminUserId as string,
      action: "guardian_consent.view",
      targetId: document.id,
      detail: "Super Admin viewed a guardian-consent copy.",
    });
    const extension = document.contentType === "image/jpeg" ? "jpg" : document.contentType.split("/")[1];
    res.setHeader("Content-Type", document.contentType);
    res.setHeader("Content-Length", size);
    res.setHeader("Content-Disposition", `attachment; filename="guardian-consent-${document.id}.${extension}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const stream = file.createReadStream();
    stream.on("error", error => {
      if (!res.headersSent) res.status(500).json({ message: "The guardian-consent document could not be read." });
      else res.destroy(error);
    });
    stream.pipe(res);
  });

  return router;
}

export default createSuperAdminRouter();
