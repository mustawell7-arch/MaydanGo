import { pgTable, text, jsonb, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export type LocalizedText = { en: string; ar: string; ku: string };

export const learningCourses = pgTable("learning_courses", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedSummary: jsonb("localized_summary").$type<LocalizedText>().notNull(),
  localizedInstructor: jsonb("localized_instructor").$type<LocalizedText>().notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("learning_courses_published").on(table.published),
]);

export const learningLessons = pgTable("learning_lessons", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedContent: jsonb("localized_content").$type<LocalizedText>().notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  mediaUrl: text("media_url"),
}, table => [
  uniqueIndex("learning_lessons_course_position").on(table.courseId, table.position),
  index("learning_lessons_course").on(table.courseId),
]);

export const courseEnrollments = pgTable("course_enrollments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("course_enrollment_owner").on(table.userId, table.courseId),
  index("course_enrollment_user").on(table.userId),
]);

export const lessonProgress = pgTable("lesson_progress", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => learningLessons.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("lesson_progress_enrollment_lesson").on(table.enrollmentId, table.lessonId),
  index("lesson_progress_enrollment").on(table.enrollmentId),
]);
