import { pgTable, text, jsonb, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export type LocalizedText = { en: string; ar: string; ku: string };
export type CourseLanguage = "en" | "ar" | "ku";
export type CourseQuizQuestion = {
  prompt: LocalizedText;
  options: LocalizedText[];
  correctOptionIndex: number;
  explanation: LocalizedText | null;
};
export type CourseQuiz = {
  passingScorePercent: number;
  questions: CourseQuizQuestion[];
};

export const learningCourses = pgTable("learning_courses", {
  id: text("id").primaryKey(),
  instructorUserId: text("instructor_user_id"),
  title: text("title").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedSummary: jsonb("localized_summary").$type<LocalizedText>().notNull(),
  localizedInstructor: jsonb("localized_instructor").$type<LocalizedText>().notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  courseLanguages: jsonb("course_languages").$type<CourseLanguage[] | null>(),
  subtitleLanguages: jsonb("subtitle_languages").$type<CourseLanguage[] | null>(),
  requiredEquipment: jsonb("required_equipment").$type<LocalizedText | null>(),
  disclaimers: jsonb("disclaimers").$type<LocalizedText | null>(),
  supportingMaterials: jsonb("supporting_materials").$type<LocalizedText | null>(),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("learning_courses_published").on(table.published),
  index("learning_courses_instructor").on(table.instructorUserId),
]);

export const learningLessons = pgTable("learning_lessons", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedContent: jsonb("localized_content").$type<LocalizedText>().notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  mediaUrl: text("media_url"),
  quiz: jsonb("quiz").$type<CourseQuiz | null>(),
}, table => [
  uniqueIndex("learning_lessons_course_position").on(table.courseId, table.position),
  index("learning_lessons_course").on(table.courseId),
]);

export const courseEnrollments = pgTable("course_enrollments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
}, table => [
  uniqueIndex("course_enrollment_owner").on(table.userId, table.courseId),
  index("course_enrollment_user").on(table.userId),
]);

export const memberSavedCourses = pgTable("member_saved_courses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("member_saved_courses_owner_course").on(table.userId, table.courseId),
  index("member_saved_courses_user").on(table.userId),
]);

export const courseMaterials = pgTable("course_materials", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("course_materials_course").on(table.courseId),
]);

export const lessonAccess = pgTable("lesson_access", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => learningLessons.id, { onDelete: "cascade" }),
  firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  playbackPositionSeconds: integer("playback_position_seconds").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
}, table => [
  uniqueIndex("lesson_access_enrollment_lesson").on(table.enrollmentId, table.lessonId),
  index("lesson_access_enrollment").on(table.enrollmentId),
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

export const courseQuizAttempts = pgTable("course_quiz_attempts", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => learningLessons.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<number[]>().notNull(),
  scorePercent: integer("score_percent").notNull(),
  passed: boolean("passed").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("course_quiz_attempt_enrollment_lesson_submitted").on(table.enrollmentId, table.lessonId, table.submittedAt),
]);

export const courseCertificates = pgTable("course_certificates", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  instructorUserId: text("instructor_user_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("course_certificate_enrollment").on(table.enrollmentId),
  index("course_certificate_instructor").on(table.instructorUserId, table.issuedAt),
]);

export const courseAssignments = pgTable("course_assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>().notNull(),
  localizedInstructions: jsonb("localized_instructions").$type<LocalizedText>().notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("course_assignments_course_position").on(table.courseId, table.position),
]);

export const courseAssignmentProgress = pgTable("course_assignment_progress", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => courseAssignments.id, { onDelete: "cascade" }),
  enrollmentId: text("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("course_assignment_progress_enrollment_assignment").on(table.enrollmentId, table.assignmentId),
  index("course_assignment_progress_enrollment").on(table.enrollmentId),
]);
