export * from "./bookings";
export * from "./operations";
export * from "./facilities";
export * from "./checkin";
export * from "./learning";
export * from "./support";
export * from "./payments";
export * from "./partner-invoices";
export * from "./partner-compliance-documents";
export * from "./partner-contract-versions";
export * from "./partner-onboarding";
export * from "./finance";
export * from "./member-devices";
export * from "./quality-control";
export * from "./sponsored-placements";
export * from "./sponsored-content";
export * from "./reviews";
export * from "./instructor";
export * from "./corporate";
export * from "./corporate-agreement-versions";
export * from "./member-consents";
export * from "./legal-policy-versions";
export * from "./guardian-consents";
export * from "./referrals";
export * from "./member-profile-photos";
export * from "./fraud-investigations";
// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export {}