export const PARTNER_PERMISSIONS = [
  "operations",
  "sessions",
  "attendance",
  "facilities",
  "analytics",
  "quality",
  "reviews",
  "marketing",
  "contracts",
  "finance",
  "staff",
  "courses",
] as const;

export type PartnerPermission = typeof PARTNER_PERMISSIONS[number];
export type PartnerOperatorRole =
  | "partner"
  | "partner_manager"
  | "partner_reception"
  | "partner_finance";
export type AssignablePartnerRole = Exclude<PartnerOperatorRole, "partner">;

export const PARTNER_ROLE_PERMISSIONS: Record<PartnerOperatorRole, readonly PartnerPermission[]> = {
  // Existing partner accounts remain the partner owner.
  partner: PARTNER_PERMISSIONS,
  partner_manager: [
    "operations",
    "sessions",
    "attendance",
    "facilities",
    "analytics",
    "quality",
    "reviews",
  ],
  partner_reception: ["operations", "attendance"],
  partner_finance: ["operations", "finance"],
};

export const ASSIGNABLE_PARTNER_ROLES: readonly AssignablePartnerRole[] = [
  "partner_manager",
  "partner_reception",
  "partner_finance",
];

export function isPartnerOperatorRole(role: string): role is PartnerOperatorRole {
  return Object.hasOwn(PARTNER_ROLE_PERMISSIONS, role);
}

export function isPartnerOwnerRole(role: string): boolean {
  return role === "partner";
}

export function canManagePartnerStaff(
  actor: { userId: string; role: string; partnerId: string | null },
  partner: { id: string; ownerUserId: string; approved: boolean },
): boolean {
  return isPartnerOwnerRole(actor.role)
    && actor.partnerId === partner.id
    && actor.userId === partner.ownerUserId
    && partner.approved;
}

export function hasPartnerPermission(role: string, permission: PartnerPermission): boolean {
  return isPartnerOperatorRole(role)
    && PARTNER_ROLE_PERMISSIONS[role].includes(permission);
}

const OPERATIONS_ROUTE_PERMISSIONS: Array<{
  method: string;
  path: RegExp;
  permission: PartnerPermission;
}> = [
  { method: "GET", path: /^\/$/, permission: "operations" },
  { method: "GET", path: /^\/facilities$/, permission: "facilities" },
  { method: "POST", path: /^\/facilities$/, permission: "facilities" },
  { method: "PUT", path: /^\/facilities\/[^/]+$/, permission: "facilities" },
  { method: "DELETE", path: /^\/facilities\/[^/]+$/, permission: "facilities" },
  { method: "POST", path: /^\/facilities\/[^/]+\/hours-overrides$/, permission: "facilities" },
  { method: "DELETE", path: /^\/facilities\/[^/]+\/hours-overrides\/[^/]+$/, permission: "facilities" },
  { method: "POST", path: /^\/offerings$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/recurring$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/image-upload-url$/, permission: "sessions" },
  { method: "GET", path: /^\/offerings\/[^/]+\/image$/, permission: "sessions" },
  { method: "PUT", path: /^\/offerings\/[^/]+\/checkin-policy$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/[^/]+\/submit$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/[^/]+\/respond$/, permission: "sessions" },
  { method: "PATCH", path: /^\/offerings\/[^/]+$/, permission: "sessions" },
  { method: "PATCH", path: /^\/offerings\/[^/]+\/series$/, permission: "sessions" },
  { method: "GET", path: /^\/offerings\/[^/]+\/waitlist$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/[^/]+\/cancel$/, permission: "sessions" },
  { method: "POST", path: /^\/offerings\/[^/]+\/series\/cancel$/, permission: "sessions" },
  { method: "POST", path: /^\/bookings\/[^/]+\/cancel$/, permission: "sessions" },
  { method: "GET", path: /^\/settlements$/, permission: "finance" },
  { method: "GET", path: /^\/invoices$/, permission: "finance" },
  { method: "POST", path: /^\/invoices\/upload-url$/, permission: "finance" },
  { method: "POST", path: /^\/invoices$/, permission: "finance" },
  { method: "GET", path: /^\/invoices\/[^/]+\/document$/, permission: "finance" },
  { method: "POST", path: /^\/attendance\/[^/]+\/guardian-consent\/upload-url$/, permission: "attendance" },
  { method: "POST", path: /^\/attendance\/[^/]+\/guardian-consent\/[^/]+\/complete$/, permission: "attendance" },
  { method: "GET", path: /^\/courses$/, permission: "courses" },
  { method: "POST", path: /^\/courses$/, permission: "courses" },
  { method: "PUT", path: /^\/courses\/[^/]+$/, permission: "courses" },
  { method: "POST", path: /^\/courses\/[^/]+\/lessons$/, permission: "courses" },
  { method: "GET", path: /^\/courses\/[^/]+\/materials$/, permission: "courses" },
  { method: "POST", path: /^\/courses\/[^/]+\/materials\/upload-url$/, permission: "courses" },
  { method: "POST", path: /^\/courses\/[^/]+\/materials\/[^/]+\/complete$/, permission: "courses" },
];

export function canPartnerUseOperationsRoute(role: string, method: string, path: string): boolean {
  if (isPartnerOwnerRole(role)) return true;
  const route = OPERATIONS_ROUTE_PERMISSIONS.find(
    item => item.method === method.toUpperCase() && item.path.test(path),
  );
  return Boolean(route && hasPartnerPermission(role, route.permission));
}
