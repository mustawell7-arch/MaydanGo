import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, operators, partners, pool } from "@workspace/db";
import { GetOperationsAnalyticsResponse } from "@workspace/api-zod";
import { hasAdminPermission } from "../lib/admin-roles";
import { hasPartnerPermission, isPartnerOperatorRole } from "../lib/partner-roles";
import { isAccessSuspended } from "../lib/account-access-restrictions";

const router = Router();
const IRAQ_TIME_ZONE = "Asia/Baghdad";
const ADMIN_UNAVAILABLE = [
  "membership_sales", "renewals", "membership_cancellations", "churn", "revenue",
  "failed_payments", "partner_cost", "gross_margin", "event_revenue",
  "referral_performance", "fraud_alerts", "refund_rate", "chargeback_rate", "accounting_export",
] as const;
const PARTNER_UNAVAILABLE = [
  "estimated_earnings", "instructor_performance", "accounting_export",
] as const;

type Operator = typeof operators.$inferSelect;

function baghdadDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: IRAQ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayStartInBaghdad(value: string): string {
  return `${value}T00:00:00+03:00`;
}

function percent(numerator: unknown, denominator: unknown): number | null {
  const n = Number(numerator ?? 0);
  const d = Number(denominator ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function rating(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function buildBuckets(from: string, to: string, monthly: boolean): string[] {
  const start = monthly ? `${from.slice(0, 7)}-01` : from;
  const end = monthly ? `${to.slice(0, 7)}-01` : to;
  const buckets: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    buckets.push(cursor);
    if (monthly) {
      const date = new Date(`${cursor}T00:00:00.000Z`);
      date.setUTCMonth(date.getUTCMonth() + 1);
      cursor = date.toISOString().slice(0, 7) + "-01";
    } else {
      cursor = addCalendarDays(cursor, 1);
    }
  }
  return buckets;
}

router.use(async (req, res, next) => {
  if (req.path !== "/analytics") {
    next();
    return;
  }
  try {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ message: "Sign in to view operations analytics." });
      return;
    }
    const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
    if (!operator || (!hasAdminPermission(operator.role, "partner_operations")
      && (!isPartnerOperatorRole(operator.role) || !hasPartnerPermission(operator.role, "analytics")))) {
      res.status(403).json({ message: "Administrator or approved partner access is required." });
      return;
    }
    if (isPartnerOperatorRole(operator.role)) {
      if (!operator.partnerId) {
        res.status(403).json({ message: "An approved partner account is required." });
        return;
      }
      const [partner] = await db.select({
        id: partners.id,
        name: partners.name,
        approved: partners.approved,
      }).from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
      if (!partner?.approved) {
        res.status(403).json({ message: "Partner approval is required to view analytics." });
        return;
      }
      if (await isAccessSuspended("partner", operator.partnerId)) {
        res.status(403).json({ message: "Partner operations are temporarily restricted. Contact MaydanGo support." });
        return;
      }
      res.locals.analyticsPartner = partner;
    }
    res.locals.analyticsOperator = operator;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const operator = res.locals.analyticsOperator as Operator;
    const role: "partner_operations_admin" | "partner" =
      hasAdminPermission(operator.role, "partner_operations") ? "partner_operations_admin" : "partner";
    const partner = res.locals.analyticsPartner as { id: string; name: string } | undefined;
    const today = baghdadDate();
    const fromInput = req.query.from;
    const toInput = req.query.to;
    const from = fromInput === undefined ? addCalendarDays(today, -29) : fromInput;
    const to = toInput === undefined ? today : toInput;
    if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
      res.status(400).json({ message: "Use valid Baghdad calendar dates in YYYY-MM-DD format." });
      return;
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (span > 365) {
      res.status(400).json({ message: "Analytics date ranges cannot exceed 366 days." });
      return;
    }

    const fromTimestamp = dayStartInBaghdad(from);
    const toTimestamp = dayStartInBaghdad(addCalendarDays(to, 1));
    const partnerId = partner?.id ?? null;
    const params = [fromTimestamp, toTimestamp, partnerId];
    const monthly = span > 90;
    const bucket = monthly ? "month" : "day";
    const visitBucketExpr = `to_char(date_trunc('${bucket}', a.checked_in_at AT TIME ZONE 'Asia/Baghdad')::date, 'YYYY-MM-DD')`;
    const reservationBucketExpr = `to_char(date_trunc('${bucket}', r.created_at AT TIME ZONE 'Asia/Baghdad')::date, 'YYYY-MM-DD')`;
    const enrollmentBucketExpr = `to_char(date_trunc('${bucket}', ce.enrolled_at AT TIME ZONE 'Asia/Baghdad')::date, 'YYYY-MM-DD')`;

    const [visitTotals, bookingTotals, ratings, visitTrend, bookingTrend, courseTrend, facilities, classes, courses, currentVisits, activeMemberships, partnerPerformance, corporateUsage, instructorPerformance, promotionPerformance, referralTotals] = await Promise.all([
      pool.query(`
        WITH scoped_attendance AS (
          SELECT a.user_id, a.status, a.settlement_eligible, o.access_type
          FROM attendance a
          JOIN booking_offerings o ON o.id = a.offering_id
          WHERE a.checked_in_at >= $1 AND a.checked_in_at < $2
            AND o.scope = 'live' AND o.cancelled_at IS NULL
            AND ($3::text IS NULL OR o.partner_id = $3)
        ),
        customer_frequency AS (
          SELECT user_id, COUNT(*) FILTER (WHERE status = 'confirmed' AND settlement_eligible) AS confirmed_visits
          FROM scoped_attendance
          GROUP BY user_id
        )
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed' AND settlement_eligible) AS visits,
          COUNT(*) FILTER (WHERE status = 'confirmed' AND settlement_eligible AND access_type = 'physical') AS physical_check_ins,
          COUNT(*) FILTER (WHERE status = 'confirmed' AND settlement_eligible AND access_type = 'premium') AS premium_check_ins,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(*) FILTER (WHERE status = 'no_show' OR (status = 'confirmed' AND settlement_eligible)) AS attendance_decisions,
          COUNT(DISTINCT user_id) FILTER (WHERE status = 'confirmed' AND settlement_eligible) AS unique_customers,
          (SELECT COUNT(*) FROM customer_frequency WHERE confirmed_visits > 1) AS repeat_customers
        FROM scoped_attendance
      `, params),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE o.access_type = 'live') AS live_bookings,
          COUNT(*) AS bookings,
          COUNT(*) FILTER (WHERE r.status IN ('cancelled', 'partner_cancelled', 'admin_cancelled')) AS cancellations
        FROM reservations r
        JOIN booking_offerings o ON o.id = r.offering_id
        WHERE r.created_at >= $1 AND r.created_at < $2
          AND o.scope = 'live' AND o.cancelled_at IS NULL
          AND ($3::text IS NULL OR o.partner_id = $3)
      `, params),
      pool.query(`
        SELECT AVG(fr.overall_rating) AS average_rating, COUNT(*) AS rating_count
        FROM facility_reviews fr
        WHERE fr.status = 'published' AND fr.created_at >= $1 AND fr.created_at < $2
          AND ($3::text IS NULL OR fr.partner_id = $3)
      `, params),
      pool.query(`
        SELECT ${visitBucketExpr} AS date,
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible) AS visits
        FROM attendance a
        JOIN booking_offerings o ON o.id = a.offering_id
        WHERE a.checked_in_at >= $1 AND a.checked_in_at < $2
          AND o.scope = 'live' AND o.cancelled_at IS NULL
          AND ($3::text IS NULL OR o.partner_id = $3)
        GROUP BY 1 ORDER BY 1
      `, params),
      pool.query(`
        SELECT ${reservationBucketExpr} AS date,
          COUNT(*) FILTER (WHERE o.access_type = 'live') AS live_bookings
        FROM reservations r
        JOIN booking_offerings o ON o.id = r.offering_id
        WHERE r.created_at >= $1 AND r.created_at < $2
          AND o.scope = 'live' AND o.cancelled_at IS NULL
          AND ($3::text IS NULL OR o.partner_id = $3)
        GROUP BY 1 ORDER BY 1
      `, params),
      role === "partner_operations_admin" ? pool.query(`
        WITH enrollment_progress AS (
          SELECT ce.id, ce.enrolled_at, lc.title,
            COUNT(DISTINCT ll.id) AS lesson_count,
            COUNT(DISTINCT lp.lesson_id) AS completed_count,
            MAX(lp.completed_at) AS completed_at
          FROM course_enrollments ce
          JOIN learning_courses lc ON lc.id = ce.course_id AND lc.published = true
          LEFT JOIN learning_lessons ll ON ll.course_id = lc.id
          LEFT JOIN lesson_progress lp ON lp.enrollment_id = ce.id AND lp.lesson_id = ll.id
          GROUP BY ce.id, ce.enrolled_at, lc.title
        ),
        trend_events AS (
          SELECT ${enrollmentBucketExpr} AS date, COUNT(*) AS enrollments, 0::bigint AS completions
          FROM enrollment_progress ce
          WHERE ce.enrolled_at >= $1 AND ce.enrolled_at < $2
          GROUP BY 1
          UNION ALL
          SELECT to_char(date_trunc('${bucket}', completed_at AT TIME ZONE 'Asia/Baghdad')::date, 'YYYY-MM-DD') AS date,
            0::bigint AS enrollments, COUNT(*) AS completions
          FROM enrollment_progress
          WHERE lesson_count > 0 AND completed_count >= lesson_count
            AND completed_at >= $1 AND completed_at < $2
          GROUP BY 1
        )
        SELECT date, SUM(enrollments)::int AS enrollments, SUM(completions)::int AS completions
        FROM trend_events GROUP BY date ORDER BY date
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      pool.query(`
        WITH slots AS (
          SELECT o.id, o.partner_id, o.facility, o.city, o.capacity
          FROM booking_offerings o
          WHERE o.starts_at >= $1 AND o.starts_at < $2 AND o.scope = 'live'
            AND o.cancelled_at IS NULL
            AND (o.active = true
              OR EXISTS (SELECT 1 FROM attendance a WHERE a.offering_id = o.id)
              OR EXISTS (SELECT 1 FROM reservations r WHERE r.offering_id = o.id))
            AND ($3::text IS NULL OR o.partner_id = $3)
        ),
        capacity_by_facility AS (
          SELECT partner_id, facility, city, SUM(capacity)::int AS capacity_total
          FROM slots GROUP BY partner_id, facility, city
        ),
        attendance_by_facility AS (
          SELECT s.partner_id, s.facility, s.city,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS visits,
            COUNT(DISTINCT a.user_id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS unique_customers,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_shows
          FROM slots s
          LEFT JOIN attendance a ON a.offering_id = s.id AND a.checked_in_at >= $1 AND a.checked_in_at < $2
          GROUP BY s.partner_id, s.facility, s.city
        ),
        booking_counts AS (
          SELECT s.partner_id, s.facility, s.city,
            COUNT(r.id)::int AS bookings,
            COUNT(r.id) FILTER (WHERE r.status IN ('cancelled', 'partner_cancelled', 'admin_cancelled'))::int AS cancellations
          FROM slots s
          LEFT JOIN reservations r ON r.offering_id = s.id AND r.created_at >= $1 AND r.created_at < $2
          GROUP BY s.partner_id, s.facility, s.city
        ),
        facility_ratings AS (
          SELECT fp.partner_id, fp.city, fp.facility,
            AVG(fr.overall_rating) AS average_rating, COUNT(fr.id) AS rating_count
          FROM facility_profiles fp
          JOIN facility_reviews fr ON fr.facility_id = fp.id AND fr.status = 'published'
            AND fr.created_at >= $1 AND fr.created_at < $2
          WHERE ($3::text IS NULL OR fp.partner_id = $3)
          GROUP BY fp.partner_id, fp.city, fp.facility
        )
        SELECT c.facility, c.city, c.capacity_total,
          COALESCE(a.visits, 0)::int AS visits,
          COALESCE(a.unique_customers, 0)::int AS unique_customers,
          COALESCE(b.bookings, 0)::int AS bookings,
          COALESCE(b.cancellations, 0)::int AS cancellations,
          COALESCE(a.no_shows, 0)::int AS no_shows,
          CASE WHEN c.capacity_total > 0 THEN ROUND(100.0 * COALESCE(a.visits, 0) / c.capacity_total, 1) ELSE NULL END AS occupancy_rate,
          MAX(fr.average_rating) AS average_rating,
          COALESCE(MAX(fr.rating_count), 0)::int AS rating_count
        FROM capacity_by_facility c
        LEFT JOIN attendance_by_facility a ON a.partner_id = c.partner_id AND a.city = c.city AND a.facility = c.facility
        LEFT JOIN booking_counts b ON b.partner_id = c.partner_id AND b.city = c.city AND b.facility = c.facility
        LEFT JOIN facility_ratings fr ON fr.partner_id = c.partner_id AND fr.city = c.city AND fr.facility = c.facility
        GROUP BY c.partner_id, c.facility, c.city, c.capacity_total, a.visits, a.unique_customers, a.no_shows, b.bookings, b.cancellations
        ORDER BY COALESCE(a.visits, 0) DESC, c.facility
        LIMIT 25
      `, params),
      pool.query(`
        WITH slots AS (
          SELECT o.id, o.title, o.facility, o.city, o.capacity
          FROM booking_offerings o
          WHERE o.starts_at >= $1 AND o.starts_at < $2 AND o.scope = 'live'
            AND o.cancelled_at IS NULL
            AND (o.active = true
              OR EXISTS (SELECT 1 FROM attendance a WHERE a.offering_id = o.id)
              OR EXISTS (SELECT 1 FROM reservations r WHERE r.offering_id = o.id))
            AND ($3::text IS NULL OR o.partner_id = $3)
        ),
        visits AS (
          SELECT a.offering_id, COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible) AS visits
          FROM attendance a JOIN slots s ON s.id = a.offering_id
          WHERE a.checked_in_at >= $1 AND a.checked_in_at < $2
          GROUP BY a.offering_id
        ),
        bookings AS (
          SELECT r.offering_id, COUNT(*) AS bookings
          FROM reservations r JOIN slots s ON s.id = r.offering_id
          WHERE r.created_at >= $1 AND r.created_at < $2
          GROUP BY r.offering_id
        )
        SELECT s.title, s.facility, s.city,
          COALESCE(SUM(b.bookings), 0)::int AS bookings,
          COALESCE(SUM(v.visits), 0)::int AS visits,
          CASE WHEN SUM(s.capacity) > 0 THEN ROUND(100.0 * COALESCE(SUM(v.visits), 0) / SUM(s.capacity), 1) ELSE NULL END AS occupancy_rate
        FROM slots s
        LEFT JOIN visits v ON v.offering_id = s.id
        LEFT JOIN bookings b ON b.offering_id = s.id
        GROUP BY s.title, s.facility, s.city
        ORDER BY SUM(v.visits) DESC NULLS LAST, SUM(b.bookings) DESC NULLS LAST, s.title
        LIMIT 12
      `, params),
      role === "partner_operations_admin" ? pool.query(`
        WITH enrollment_progress AS (
          SELECT ce.id, ce.course_id, lc.title,
            COUNT(DISTINCT ll.id) AS lesson_count,
            COUNT(DISTINCT lp.lesson_id) AS completed_count,
            MAX(lp.completed_at) AS completed_at,
            ce.enrolled_at
          FROM course_enrollments ce
          JOIN learning_courses lc ON lc.id = ce.course_id AND lc.published = true
          LEFT JOIN learning_lessons ll ON ll.course_id = lc.id
          LEFT JOIN lesson_progress lp ON lp.enrollment_id = ce.id AND lp.lesson_id = ll.id
          GROUP BY ce.id, ce.course_id, lc.title
        )
        SELECT title, COUNT(*)::int AS enrollments,
          COUNT(*) FILTER (WHERE lesson_count > 0 AND completed_count >= lesson_count
            AND completed_at >= $1 AND completed_at < $2)::int AS completions
        FROM enrollment_progress
        WHERE enrolled_at >= $1 AND enrolled_at < $2
        GROUP BY course_id, title
        ORDER BY COUNT(*) DESC, title
        LIMIT 12
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible) AS daily_visits,
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible AND o.access_type = 'physical') AS daily_physical,
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible AND o.access_type = 'premium') AS daily_premium
        FROM attendance a
        JOIN booking_offerings o ON o.id = a.offering_id
        WHERE a.checked_in_at >= $1 AND a.checked_in_at < $2
          AND o.scope = 'live' AND o.cancelled_at IS NULL
          AND ($3::text IS NULL OR o.partner_id = $3)
      `, [dayStartInBaghdad(today), dayStartInBaghdad(addCalendarDays(today, 1)), partnerId]),
      role === "partner_operations_admin" ? pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active' AND ends_at > NOW())::int AS active_subscriptions,
          COUNT(DISTINCT user_id) FILTER (WHERE corporate_id IS NOT NULL AND status = 'active' AND ends_at > NOW())::int AS corporate_active_members
        FROM memberships
        WHERE scope = 'live'
      `) : Promise.resolve({ rows: [] }),
      role === "partner_operations_admin" ? pool.query(`
        WITH slots AS (
          SELECT o.id, o.partner_id, o.capacity
          FROM booking_offerings o
          WHERE o.starts_at >= $1 AND o.starts_at < $2 AND o.scope = 'live'
            AND o.cancelled_at IS NULL
            AND (o.active = true
              OR EXISTS (SELECT 1 FROM attendance a WHERE a.offering_id = o.id)
              OR EXISTS (SELECT 1 FROM reservations r WHERE r.offering_id = o.id))
        ),
        capacity_by_partner AS (
          SELECT partner_id, SUM(capacity)::int AS capacity_total
          FROM slots GROUP BY partner_id
        ),
        attendance_by_partner AS (
          SELECT s.partner_id,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS visits,
            COUNT(DISTINCT a.user_id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS unique_customers,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show' OR (a.status = 'confirmed' AND a.settlement_eligible))::int AS attendance_decisions
          FROM slots s
          LEFT JOIN attendance a ON a.offering_id = s.id AND a.checked_in_at >= $1 AND a.checked_in_at < $2
          GROUP BY s.partner_id
        ),
        booking_counts AS (
          SELECT s.partner_id, COUNT(r.id) AS bookings,
            COUNT(r.id) FILTER (WHERE r.status IN ('cancelled', 'partner_cancelled', 'admin_cancelled')) AS cancellations
          FROM slots s
          LEFT JOIN reservations r ON r.offering_id = s.id AND r.created_at >= $1 AND r.created_at < $2
          GROUP BY s.partner_id
        ),
        partner_ratings AS (
          SELECT partner_id, AVG(overall_rating) AS average_rating, COUNT(*) AS rating_count
          FROM facility_reviews WHERE status = 'published' AND created_at >= $1 AND created_at < $2
          GROUP BY partner_id
        )
        SELECT p.name AS partner_name,
          COALESCE(v.visits, 0)::int AS visits,
          COALESCE(v.unique_customers, 0)::int AS unique_customers,
          COALESCE(v.no_shows, 0)::int AS no_shows,
          COALESCE(b.bookings, 0)::int AS bookings,
          COALESCE(b.cancellations, 0)::int AS cancellations,
          CASE WHEN COALESCE(c.capacity_total, 0) > 0 THEN ROUND(100.0 * COALESCE(v.visits, 0) / c.capacity_total, 1) ELSE NULL END AS occupancy_rate,
          CASE WHEN COALESCE(v.attendance_decisions, 0) > 0 THEN ROUND(100.0 * v.no_shows / v.attendance_decisions, 1) ELSE NULL END AS no_show_rate,
          CASE WHEN COALESCE(b.bookings, 0) > 0 THEN ROUND(100.0 * b.cancellations / b.bookings, 1) ELSE NULL END AS cancellation_rate,
          pr.average_rating, COALESCE(pr.rating_count, 0)::int AS rating_count
        FROM partners p
        LEFT JOIN capacity_by_partner c ON c.partner_id = p.id
        LEFT JOIN attendance_by_partner v ON v.partner_id = p.id
        LEFT JOIN booking_counts b ON b.partner_id = p.id
        LEFT JOIN partner_ratings pr ON pr.partner_id = p.id
        WHERE p.approved = true AND (COALESCE(v.visits, 0) > 0 OR COALESCE(b.bookings, 0) > 0 OR COALESCE(pr.rating_count, 0) > 0)
        ORDER BY COALESCE(v.visits, 0) DESC, p.name
        LIMIT 50
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      role === "partner_operations_admin" ? pool.query(`
        WITH live_corporate_members AS (
          SELECT m.corporate_id, m.user_id
          FROM memberships m
          JOIN corporate_organizations co ON co.id = m.corporate_id AND co.status = 'active'
          WHERE m.scope = 'live' AND m.corporate_id IS NOT NULL
            AND m.status = 'active' AND m.ends_at > NOW()
        ),
        attendance_by_org AS (
          SELECT cm.corporate_id,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS visits,
            COUNT(DISTINCT a.user_id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS unique_visitors
          FROM live_corporate_members cm
          JOIN attendance a ON a.user_id = cm.user_id AND a.checked_in_at >= $1 AND a.checked_in_at < $2
          JOIN booking_offerings o ON o.id = a.offering_id AND o.scope = 'live' AND o.cancelled_at IS NULL
          GROUP BY cm.corporate_id
        ),
        bookings_by_org AS (
          SELECT cm.corporate_id, COUNT(r.id)::int AS bookings
          FROM live_corporate_members cm
          JOIN reservations r ON r.user_id = cm.user_id AND r.created_at >= $1 AND r.created_at < $2
          JOIN booking_offerings o ON o.id = r.offering_id AND o.scope = 'live' AND o.cancelled_at IS NULL
          GROUP BY cm.corporate_id
        ),
        courses_by_org AS (
          SELECT cm.corporate_id, COUNT(ce.id)::int AS course_enrollments
          FROM live_corporate_members cm
          JOIN course_enrollments ce ON ce.user_id = cm.user_id AND ce.enrolled_at >= $1 AND ce.enrolled_at < $2
          JOIN learning_courses lc ON lc.id = ce.course_id AND lc.published = true
          GROUP BY cm.corporate_id
        ),
        members_by_org AS (
          SELECT corporate_id, COUNT(DISTINCT user_id)::int AS active_members
          FROM live_corporate_members GROUP BY corporate_id
        )
        SELECT co.name AS organization_name,
          COALESCE(m.active_members, 0)::int AS active_members,
          COALESCE(a.unique_visitors, 0)::int AS unique_visitors,
          COALESCE(a.visits, 0)::int AS visits,
          COALESCE(b.bookings, 0)::int AS bookings,
          COALESCE(c.course_enrollments, 0)::int AS course_enrollments
        FROM corporate_organizations co
        LEFT JOIN members_by_org m ON m.corporate_id = co.id
        LEFT JOIN attendance_by_org a ON a.corporate_id = co.id
        LEFT JOIN bookings_by_org b ON b.corporate_id = co.id
        LEFT JOIN courses_by_org c ON c.corporate_id = co.id
        WHERE co.status = 'active' AND (
          COALESCE(m.active_members, 0) > 0 OR COALESCE(a.visits, 0) > 0
          OR COALESCE(b.bookings, 0) > 0 OR COALESCE(c.course_enrollments, 0) > 0
        )
        ORDER BY COALESCE(a.visits, 0) DESC, co.name
        LIMIT 50
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      role === "partner_operations_admin" ? pool.query(`
        WITH assigned_offerings AS (
          SELECT DISTINCT ioa.user_id, o.id
          FROM instructor_offering_assignments ioa
          JOIN booking_offerings o ON o.id = ioa.offering_id
          WHERE o.starts_at >= $1 AND o.starts_at < $2 AND o.scope = 'live'
            AND o.cancelled_at IS NULL
            AND (o.active = true
              OR EXISTS (SELECT 1 FROM attendance a WHERE a.offering_id = o.id)
              OR EXISTS (SELECT 1 FROM reservations r WHERE r.offering_id = o.id))
        ),
        session_counts AS (
          SELECT user_id, COUNT(DISTINCT id)::int AS sessions
          FROM assigned_offerings GROUP BY user_id
        ),
        booking_counts AS (
          SELECT ao.user_id, COUNT(r.id)::int AS bookings
          FROM assigned_offerings ao
          JOIN reservations r ON r.offering_id = ao.id AND r.created_at >= $1 AND r.created_at < $2
          GROUP BY ao.user_id
        ),
        attendance_counts AS (
          SELECT ao.user_id,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmed' AND a.settlement_eligible)::int AS visits,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_shows
          FROM assigned_offerings ao
          JOIN attendance a ON a.offering_id = ao.id AND a.checked_in_at >= $1 AND a.checked_in_at < $2
          GROUP BY ao.user_id
        ),
        assigned_courses AS (
          SELECT user_id, course_id FROM instructor_course_assignments
          UNION
          SELECT instructor_user_id AS user_id, id AS course_id
          FROM learning_courses
          WHERE instructor_user_id IS NOT NULL AND published = true
        ),
        enrollment_progress AS (
          SELECT ce.id, ce.course_id, ce.enrolled_at,
            COUNT(DISTINCT ll.id) AS lesson_count,
            COUNT(DISTINCT lp.lesson_id) AS completed_count,
            MAX(lp.completed_at) AS completed_at
          FROM course_enrollments ce
          JOIN learning_courses lc ON lc.id = ce.course_id AND lc.published = true
          LEFT JOIN learning_lessons ll ON ll.course_id = lc.id
          LEFT JOIN lesson_progress lp ON lp.enrollment_id = ce.id AND lp.lesson_id = ll.id
          GROUP BY ce.id, ce.course_id, ce.enrolled_at
        ),
        course_counts AS (
          SELECT ac.user_id,
            COUNT(*) FILTER (WHERE ep.enrolled_at >= $1 AND ep.enrolled_at < $2)::int AS course_enrollments,
            COUNT(*) FILTER (WHERE ep.lesson_count > 0 AND ep.completed_count >= ep.lesson_count
              AND ep.completed_at >= $1 AND ep.completed_at < $2)::int AS course_completions
          FROM assigned_courses ac
          JOIN enrollment_progress ep ON ep.course_id = ac.course_id
          GROUP BY ac.user_id
        )
        SELECT ip.display_name AS instructor_name,
          COALESCE(s.sessions, 0)::int AS sessions,
          COALESCE(b.bookings, 0)::int AS bookings,
          COALESCE(a.visits, 0)::int AS visits,
          COALESCE(a.no_shows, 0)::int AS no_shows,
          COALESCE(c.course_enrollments, 0)::int AS course_enrollments,
          COALESCE(c.course_completions, 0)::int AS course_completions
        FROM instructor_profiles ip
        LEFT JOIN session_counts s ON s.user_id = ip.user_id
        LEFT JOIN booking_counts b ON b.user_id = ip.user_id
        LEFT JOIN attendance_counts a ON a.user_id = ip.user_id
        LEFT JOIN course_counts c ON c.user_id = ip.user_id
        WHERE COALESCE(s.sessions, 0) > 0 OR COALESCE(b.bookings, 0) > 0
          OR COALESCE(a.visits, 0) > 0 OR COALESCE(a.no_shows, 0) > 0
          OR COALESCE(c.course_enrollments, 0) > 0 OR COALESCE(c.course_completions, 0) > 0
        ORDER BY COALESCE(a.visits, 0) DESC, COALESCE(b.bookings, 0) DESC, ip.display_name
        LIMIT 50
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      role === "partner_operations_admin" ? pool.query(`
        WITH facility_campaigns AS (
          SELECT c.campaign_name, 'facility'::text AS target_type, c.status,
            COUNT(e.id) FILTER (WHERE e.event_type = 'impression')::int AS impressions,
            COUNT(e.id) FILTER (WHERE e.event_type = 'click')::int AS clicks,
            NULL::int AS conversions
          FROM sponsored_facility_campaigns c
          LEFT JOIN sponsored_placement_events e ON e.campaign_id = c.id
            AND e.created_at >= $1 AND e.created_at < $2
          GROUP BY c.id
        ),
        content_campaigns AS (
          SELECT c.campaign_name, c.target_type, c.status,
            COUNT(e.id) FILTER (WHERE e.event_type = 'impression')::int AS impressions,
            COUNT(e.id) FILTER (WHERE e.event_type = 'click')::int AS clicks,
            COUNT(e.id) FILTER (WHERE e.event_type = 'conversion')::int AS conversions
          FROM sponsored_content_campaigns c
          LEFT JOIN sponsored_content_placement_events e ON e.campaign_id = c.id
            AND e.created_at >= $1 AND e.created_at < $2
          GROUP BY c.id
        )
        SELECT * FROM facility_campaigns
        UNION ALL
        SELECT * FROM content_campaigns
        ORDER BY impressions DESC, campaign_name
        LIMIT 100
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
      role === "partner_operations_admin" ? pool.query(`
        SELECT COUNT(*)::int AS attributed_signups
        FROM member_referral_attributions
        WHERE attributed_at >= $1 AND attributed_at < $2
      `, [fromTimestamp, toTimestamp]) : Promise.resolve({ rows: [] }),
    ]);

    const visit = visitTotals.rows[0] ?? {};
    const bookings = bookingTotals.rows[0] ?? {};
    const ratingSummary = ratings.rows[0] ?? {};
    const current = currentVisits.rows[0] ?? {};
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthVisitsResult = await pool.query(`
      SELECT COUNT(*) AS monthly_visits
      FROM attendance a
      JOIN booking_offerings o ON o.id = a.offering_id
      WHERE a.checked_in_at >= $1 AND a.checked_in_at < $2
        AND a.status = 'confirmed' AND a.settlement_eligible
        AND o.scope = 'live' AND o.cancelled_at IS NULL
        AND ($3::text IS NULL OR o.partner_id = $3)
    `, [dayStartInBaghdad(monthStart), dayStartInBaghdad(addCalendarDays(today, 1)), partnerId]);

    const trendMap = new Map<string, { visits: number; liveBookings: number; courseEnrollments: number; courseCompletions: number }>();
    for (const date of buildBuckets(from, to, monthly)) trendMap.set(date, { visits: 0, liveBookings: 0, courseEnrollments: 0, courseCompletions: 0 });
    for (const row of visitTrend.rows) trendMap.get(String(row.date)) && (trendMap.get(String(row.date))!.visits = count(row.visits));
    for (const row of bookingTrend.rows) trendMap.get(String(row.date)) && (trendMap.get(String(row.date))!.liveBookings = count(row.live_bookings));
    for (const row of courseTrend.rows) {
      const entry = trendMap.get(String(row.date));
      if (entry) {
        entry.courseEnrollments = count(row.enrollments);
        entry.courseCompletions = count(row.completions);
      }
    }

    const coursePerformance = courses.rows.map(row => ({
      title: String(row.title),
      enrollments: count(row.enrollments),
      completions: count(row.completions),
      completionRate: percent(row.completions, row.enrollments),
    }));
    const uniqueCustomers = count(visit.unique_customers);
    const repeatCustomers = count(visit.repeat_customers);
    const completionTotals = (courseTrend.rows as { enrollments: unknown; completions: unknown }[]).reduce<{ enrollments: number; completions: number }>((totals, row) => ({
      enrollments: totals.enrollments + count(row.enrollments),
      completions: totals.completions + count(row.completions),
    }), { enrollments: 0, completions: 0 });
    const response = GetOperationsAnalyticsResponse.parse({
      role,
      scopeName: role === "partner_operations_admin" ? "MaydanGo operations" : (partner?.name ?? "Partner operations"),
      period: { from, to, timeZone: IRAQ_TIME_ZONE },
      summary: {
        visits: count(visit.visits),
        physicalCheckIns: count(visit.physical_check_ins),
        premiumCheckIns: count(visit.premium_check_ins),
        liveClassBookings: count(bookings.live_bookings),
        courseEnrollments: role === "partner_operations_admin" ? completionTotals.enrollments : null,
        courseCompletions: role === "partner_operations_admin" ? completionTotals.completions : null,
        activeSubscriptions: role === "partner_operations_admin" ? count(activeMemberships.rows[0]?.active_subscriptions) : null,
        corporateActiveMembers: role === "partner_operations_admin" ? count(activeMemberships.rows[0]?.corporate_active_members) : null,
        attributedSignups: role === "partner_operations_admin" ? count(referralTotals.rows[0]?.attributed_signups) : null,
        dailyVisits: count(current.daily_visits),
        monthlyVisits: count(monthVisitsResult.rows[0]?.monthly_visits),
        uniqueCustomers,
        repeatCustomers,
        retentionRate: percent(repeatCustomers, uniqueCustomers),
        noShowRate: percent(visit.no_shows, visit.attendance_decisions),
        cancellationRate: percent(bookings.cancellations, bookings.bookings),
        occupancyRate: percent(
          facilities.rows.reduce((sum, row) => sum + count(row.visits), 0),
          facilities.rows.reduce((sum, row) => sum + count(row.capacity_total), 0),
        ),
        averageRating: rating(ratingSummary.average_rating),
        ratingCount: count(ratingSummary.rating_count),
      },
      trend: [...trendMap.entries()].map(([date, values]) => ({ date, ...values })),
      facilityPerformance: facilities.rows.map(row => ({
        facility: String(row.facility),
        city: String(row.city),
        visits: count(row.visits),
        uniqueCustomers: count(row.unique_customers),
        bookings: count(row.bookings),
        cancellations: count(row.cancellations),
        noShows: count(row.no_shows),
        occupancyRate: row.occupancy_rate == null ? null : rating(row.occupancy_rate),
        averageRating: rating(row.average_rating),
        ratingCount: count(row.rating_count),
      })),
      popularClasses: classes.rows.map(row => ({
        title: String(row.title),
        facility: String(row.facility),
        city: String(row.city),
        bookings: count(row.bookings),
        visits: count(row.visits),
        occupancyRate: row.occupancy_rate == null ? null : rating(row.occupancy_rate),
      })),
      coursePerformance,
      partnerPerformance: partnerPerformance.rows.map(row => ({
        partnerName: String(row.partner_name),
        visits: count(row.visits),
        uniqueCustomers: count(row.unique_customers),
        noShows: count(row.no_shows),
        bookings: count(row.bookings),
        cancellations: count(row.cancellations),
        occupancyRate: row.occupancy_rate == null ? null : rating(row.occupancy_rate),
        noShowRate: row.no_show_rate == null ? null : rating(row.no_show_rate),
        cancellationRate: row.cancellation_rate == null ? null : rating(row.cancellation_rate),
        averageRating: rating(row.average_rating),
        ratingCount: count(row.rating_count),
      })),
      corporateUsage: corporateUsage.rows.map(row => {
        const activeMembers = count(row.active_members);
        const uniqueVisitors = count(row.unique_visitors);
        return {
          organizationName: String(row.organization_name),
          activeMembers,
          uniqueVisitors,
          visits: count(row.visits),
          bookings: count(row.bookings),
          courseEnrollments: count(row.course_enrollments),
          usageRate: percent(uniqueVisitors, activeMembers),
        };
      }),
      instructorPerformance: instructorPerformance.rows.map(row => ({
        instructorName: String(row.instructor_name),
        sessions: count(row.sessions),
        bookings: count(row.bookings),
        visits: count(row.visits),
        noShows: count(row.no_shows),
        courseEnrollments: count(row.course_enrollments),
        courseCompletions: count(row.course_completions),
      })),
      promotionPerformance: promotionPerformance.rows.map(row => {
        const impressions = count(row.impressions);
        const clicks = count(row.clicks);
        const conversions = row.conversions == null ? null : count(row.conversions);
        return {
          campaignName: String(row.campaign_name),
          targetType: String(row.target_type),
          status: String(row.status),
          impressions,
          clicks,
          conversions,
          clickThroughRate: percent(clicks, impressions),
          conversionRate: conversions === null ? null : percent(conversions, clicks),
        };
      }),
      unavailableMetrics: role === "partner_operations_admin" ? [...ADMIN_UNAVAILABLE] : [...PARTNER_UNAVAILABLE],
    });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
