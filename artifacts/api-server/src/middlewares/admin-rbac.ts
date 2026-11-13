import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, adminRolePermissions, operationAudit, operators } from "@workspace/db";
import {
  ADMIN_ACTIONS,
  DEFAULT_ADMIN_ACTIONS,
  type AdminAction,
  type AdminRole,
} from "../lib/admin-roles";

type AccessDependencies = {
  getRole(userId: string): Promise<string | null>;
  getConfiguredActions(role: AdminRole): Promise<AdminAction[] | null>;
  recordMutation?(event: MutationAuditEvent): Promise<void>;
};

type MutationAuditEvent = {
  actorId: string;
  method: string;
  path: string;
  status: number;
  ipAddress: string;
  userAgent: string;
};

const isAdminRole = (role: string): role is AdminRole =>
  Object.hasOwn(DEFAULT_ADMIN_ACTIONS, role);

const databaseAccess: AccessDependencies = {
  async getRole(userId) {
    const [operator] = await db.select({ role: operators.role }).from(operators)
      .where(eq(operators.userId, userId)).limit(1);
    return operator?.role ?? null;
  },
  async getConfiguredActions(role) {
    const [policy] = await db.select({ actions: adminRolePermissions.actions })
      .from(adminRolePermissions).where(eq(adminRolePermissions.role, role)).limit(1);
    if (!policy) return null;
    return policy.actions.filter((action): action is AdminAction =>
      (ADMIN_ACTIONS as readonly string[]).includes(action));
  },
  async recordMutation(event) {
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: event.actorId,
      action: "admin.api_mutation",
      targetId: event.path,
      detail: [
        `method=${event.method}`,
        `status=${event.status}`,
        `ip=${event.ipAddress}`,
        `user_agent=${event.userAgent}`,
      ].join("; "),
    });
  },
};

const bodyRecord = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

export function requiredAdminActions(method: string, pathname: string, body?: unknown): AdminAction[] {
  const path = pathname.toLowerCase();
  const input = bodyRecord(body);
  const verb = method.toUpperCase();
  let action: AdminAction;

  if (verb === "GET" || verb === "HEAD") {
    action = /\/(document|export)(\/|$)/.test(path) ? "export" : "view";
  } else if (verb === "DELETE") {
    action = "delete";
  } else if (path.includes("/refund")) {
    action = "refund";
  } else if (path.includes("/payout")) {
    action = "manage_payments";
  } else if (path.endsWith("/revoke")) {
    action = "manage_payments";
  } else if (path.includes("/admin-accounts") || path.includes("/admin-invitations")
    || path.includes("/agents") || path.includes("/alert-recipients")) {
    action = "manage_users";
  } else if (path.includes("/decision") || path.endsWith("/moderation")
    || path.endsWith("/review") || /\/(approve|reject|resolve)(\/|$)/.test(path)) {
    action = input.decision === "reject" || input.status === "rejected"
      || input.status === "changes_requested" || /\/reject(\/|$)/.test(path)
      ? "reject"
      : "approve";
  } else if (path.endsWith("/review")) {
    action = input.status === "rejected" || input.status === "changes_requested" ? "reject"
      : input.status === "published" ? "publish"
        : input.status === "archived" ? "suspend" : "approve";
  } else if (path.includes("/review-privileges/") && input.suspended === true) {
    action = "suspend";
  } else if (path.includes("/memberships/lifecycle")
    && (input.action === "suspend" || input.action === "terminate")) {
    action = "suspend";
  } else if (path.includes("/partners/") && typeof input.approved === "boolean") {
    action = input.approved ? "approve" : "reject";
  } else if (path.includes("/courses/") && input.published === true) {
    action = "publish";
  } else if (path.includes("/suspend")) {
    action = "suspend";
  } else if (path.includes("/publish")) {
    action = "publish";
  } else if (/\/(assign|cancel|respond|submit|lifecycle)(\/|$)/.test(path)) {
    action = "edit";
  } else if (verb === "PATCH" || verb === "PUT") {
    action = "edit";
  } else {
    action = "create";
  }

  const required = new Set<AdminAction>([action]);
  const sensitivePath = path === "/api/operations"
    || path.startsWith("/api/operations/finance")
    || path.startsWith("/api/operations/quality")
    || path.startsWith("/api/operations/reviews")
    || path.startsWith("/api/support/staff")
    || path.startsWith("/api/attendance");
  if (sensitivePath) required.add("view_sensitive_data");
  if (path.startsWith("/api/operations/finance/reviews/")) required.add("manage_payments");
  if (path.includes("/instructor-access-requests/")) required.add("manage_users");
  if (path.includes("/admin-invitations")) required.add("manage_users");
  if (path.endsWith("/grants") || path.endsWith("/revoke")) required.add("manage_users");
  return [...required];
}

function isPermissionManagedRoute(path: string): boolean {
  return path === "/api/operations"
    || path.startsWith("/api/operations/")
    || path.startsWith("/api/support/staff/")
    || path === "/api/support/staff"
    || path.startsWith("/api/super-admin/")
    || path === "/api/super-admin"
    || path.startsWith("/api/attendance/")
    || path === "/api/attendance";
}

export function createAdminRbacMiddleware(
  access: AccessDependencies = databaseAccess,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (!isPermissionManagedRoute(req.path)) {
      next();
      return;
    }

    const userId = getAuth(req).userId;
    if (!userId) {
      next();
      return;
    }

    const role = await access.getRole(userId);
    if (!role || !isAdminRole(role)) {
      next();
      return;
    }

    if (role !== "super_admin") {
      const configured = await access.getConfiguredActions(role);
      const grants = new Set(configured ?? DEFAULT_ADMIN_ACTIONS[role]);
      const missing = requiredAdminActions(req.method, req.path, req.body)
        .filter(action => !grants.has(action));

      if (missing.length) {
        res.status(403).json({
          message: "Your administrator role does not include the permission required for this action.",
          missingPermissions: missing,
        });
        return;
      }
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) && access.recordMutation) {
      const event = {
        actorId: userId,
        method: req.method.toUpperCase(),
        path: req.path.slice(0, 500),
        ipAddress: (req.ip || "unknown").slice(0, 100),
        userAgent: (req.get("user-agent") || "unknown").slice(0, 300),
      };
      res.once("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        void access.recordMutation!({ ...event, status: res.statusCode }).catch(error => {
          console.error("Unable to record admin mutation audit event", error);
        });
      });
    }
    next();
  };
}

export default createAdminRbacMiddleware();
