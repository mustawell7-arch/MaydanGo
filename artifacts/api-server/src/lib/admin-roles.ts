export const ADMIN_ROLE_PERMISSIONS = {
  customer_support_admin: ["support", "membership_support"],
  partner_operations_admin: ["partner_operations"],
  finance_admin: ["finance"],
  content_admin: ["content"],
  marketing_admin: ["marketing"],
  corporate_admin: ["corporate"],
  fraud_compliance_admin: ["fraud_compliance"],
  technical_admin: ["technical"],
} as const;

export type AdminRole = keyof typeof ADMIN_ROLE_PERMISSIONS;
export type AdminPermission =
  | "support"
  | "membership_support"
  | "partner_operations"
  | "finance"
  | "content"
  | "marketing"
  | "corporate"
  | "fraud_compliance"
  | "technical";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  customer_support_admin: "Customer Support Admin",
  partner_operations_admin: "Partner Operations Admin",
  finance_admin: "Finance Admin",
  content_admin: "Content Admin",
  marketing_admin: "Marketing Admin",
  corporate_admin: "Corporate Admin",
  fraud_compliance_admin: "Fraud and Compliance Admin",
  technical_admin: "Technical Admin",
};

export function hasAdminPermission(role: string, permission: AdminPermission): boolean {
  return Object.hasOwn(ADMIN_ROLE_PERMISSIONS, role)
    && (ADMIN_ROLE_PERMISSIONS[role as AdminRole] as readonly AdminPermission[]).includes(permission);
}

export function isSupportStaff(role: string): boolean {
  return role === "support" || hasAdminPermission(role, "support");
}

export function isSupportAdministrator(role: string): boolean {
  return hasAdminPermission(role, "support");
}

export function isFinanceStaff(role: string): boolean {
  return role === "finance" || hasAdminPermission(role, "finance");
}

export function isScopedAdministrator(role: string): boolean {
  return Object.hasOwn(ADMIN_ROLE_PERMISSIONS, role);
}

// The legacy "admin" role intentionally receives no permission implicitly.
export function isOperationsPortalRole(role: string): boolean {
  return role === "partner" || role === "finance" || isScopedAdministrator(role);
}
