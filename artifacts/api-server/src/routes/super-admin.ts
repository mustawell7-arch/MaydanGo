import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, adminRolePermissions, memberConsentEvents, operationAudit, operators, platformSafetyRules } from "@workspace/db";
import {
  GetSuperAdminPlatformRulesResponse,
  GetSuperAdminRolePermissionsResponse,
  GetSuperAdminAccountsResponse,
  GetSuperAdminAuditLogsQueryParams,
  GetSuperAdminAuditLogsResponse,
  GetSuperAdminMemberConsentHistoryQueryParams,
  GetSuperAdminMemberConsentHistoryResponse,
  UpdateSuperAdminPlatformRulesBody,
  UpdateSuperAdminPlatformRulesResponse,
  UpdateSuperAdminRolePermissionsBody,
  UpdateSuperAdminRolePermissionsParams,
  UpdateSuperAdminRolePermissionsResponse,
  UpsertSuperAdminAccountBody,
  UpsertSuperAdminAccountResponse,
} from "@workspace/api-zod";
import {
  ADMIN_ACTIONS,
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_ADMIN_ACTIONS,
  type AdminAction,
  type AdminRole,
} from "../lib/admin-roles";
import { DEFAULT_PLATFORM_SAFETY_RULES, platformSafetyRulesSchema } from "../lib/platform-rules";

type ClerkAccount = { userId: string; email: string };
type ClerkDirectory = {
  findVerifiedByEmail(email: string): Promise<ClerkAccount | null>;
  getEmail(userId: string): Promise<string | null>;
};

const adminRoles = Object.keys(ADMIN_ROLE_PERMISSIONS) as AdminRole[];
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

export function createSuperAdminRouter(directory: ClerkDirectory = clerkDirectory): IRouter {
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
        detail: `role:${previousRole ?? "none"}->${parsed.data.role};status:${previousStatus}->${parsed.data.status}`,
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
      recordedAt: row.recordedAt.toISOString(),
    }))));
  });

  return router;
}

export default createSuperAdminRouter();
