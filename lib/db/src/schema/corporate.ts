import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const corporateOrganizations = pgTable("corporate_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("corporate_organizations_status").on(table.status, table.createdAt),
]);

export const corporateAdministrators = pgTable("corporate_administrators", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => corporateOrganizations.id),
  userId: text("user_id").notNull(),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("corporate_administrators_org_user").on(table.organizationId, table.userId),
  index("corporate_administrators_user").on(table.userId),
]);

export const corporateEmployees = pgTable("corporate_employees", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => corporateOrganizations.id),
  email: text("email").notNull(),
  userId: text("user_id"),
  status: text("status").notNull().default("invited"),
  invitedBy: text("invited_by").notNull(),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("corporate_employees_org_email").on(table.organizationId, table.email),
  uniqueIndex("corporate_employees_org_user")
    .on(table.organizationId, table.userId)
    .where(sql`${table.userId} is not null`),
  index("corporate_employees_org_status").on(table.organizationId, table.status, table.createdAt),
  index("corporate_employees_user").on(table.userId),
]);

export const corporateInvitations = pgTable("corporate_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => corporateOrganizations.id),
  employeeId: text("employee_id").references(() => corporateEmployees.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedBy: text("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [
  uniqueIndex("corporate_invitations_token_hash").on(table.tokenHash),
  uniqueIndex("corporate_invitations_pending_email_role")
    .on(table.organizationId, table.email, table.role)
    .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
  index("corporate_invitations_org_role").on(table.organizationId, table.role, table.createdAt),
]);
