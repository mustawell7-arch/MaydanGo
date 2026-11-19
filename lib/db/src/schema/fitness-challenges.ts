import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { LocalizedText } from "./learning";

export type LocalizedFitnessChallengeDescription = {
  en: string;
  ar: string;
  ku: string;
};

export type FitnessChallengeStatus = "draft" | "published" | "archived";

export const fitnessChallenges = pgTable("fitness_challenges", {
  id: text("id").primaryKey(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedDescription: jsonb("localized_description").$type<LocalizedFitnessChallengeDescription>().notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  goalActiveDays: integer("goal_active_days").notNull(),
  status: text("status").$type<FitnessChallengeStatus>().notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("fitness_challenges_status_dates").on(table.status, table.startDate, table.endDate),
]);

export const fitnessChallengeParticipants = pgTable("fitness_challenge_participants", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id").notNull().references(() => fitnessChallenges.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("fitness_challenge_participant_unique").on(table.challengeId, table.userId),
  index("fitness_challenge_participant_user").on(table.userId, table.challengeId),
]);

export const fitnessChallengeSelfReports = pgTable("fitness_challenge_self_reports", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id").notNull().references(() => fitnessChallenges.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("fitness_challenge_self_report_day").on(table.challengeId, table.userId, table.activityDate),
  index("fitness_challenge_self_report_user").on(table.userId, table.challengeId, table.activityDate),
]);

export type FitnessChallenge = typeof fitnessChallenges.$inferSelect;
export type FitnessChallengeParticipant = typeof fitnessChallengeParticipants.$inferSelect;
export type FitnessChallengeSelfReport = typeof fitnessChallengeSelfReports.$inferSelect;
