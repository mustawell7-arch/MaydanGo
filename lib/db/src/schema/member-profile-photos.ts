import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberProfilePhotos = pgTable("member_profile_photos", {
  userId: text("user_id").primaryKey(),
  objectPath: text("object_path"),
  consentVersion: text("consent_version").notNull().default("member-photo-v1"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, t => [
  uniqueIndex("member_profile_photos_object_path_unique").on(t.objectPath),
]);

export const insertMemberProfilePhotoSchema = createInsertSchema(memberProfilePhotos)
  .omit({ createdAt: true, updatedAt: true });
export type InsertMemberProfilePhoto = z.infer<typeof insertMemberProfilePhotoSchema>;
export type MemberProfilePhoto = typeof memberProfilePhotos.$inferSelect;
