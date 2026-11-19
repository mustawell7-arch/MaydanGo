---
name: Attendance trust boundary
description: Conservative evidence and review rules for verified attendance.
---
Use single-use, reservation-bound partner QR challenges rather than publicly reusable facility codes for the initial attendance rollout. GPS is a supporting signal, not proof of presence: partner confirmation remains mandatory.

**Why:** Client coordinates can be spoofed and screenshots or copied facility codes can be shared. A scanned arrival must never directly become a settlement-eligible visit.

**How to apply:** Preserve separate booking, arrival, and confirmed-attendance states. Do not add static QR or manual overrides without equivalent replay protection, identity verification and an audited authorization path.

Closed attendance cannot be silently edited by ordinary administrators.

**Why:** The specification requires super-admin approval after settlement close, while the initial app has only administrator and partner roles.

**How to apply:** Fail closed after the correction window; introducing a post-close override requires a distinct approval workflow rather than weakening the existing administrator permission.

Fraud, device, and QR risk signals are prompts for authorized human review, not proof of wrongdoing. They must not automatically suspend a member or partner.

**Why:** MaydanGo must treat people fairly across Iraq; shared devices and location anomalies can have innocent explanations.

**How to apply:** Keep detection separate from enforcement. Require a documented review outcome, and use the existing restricted, auditable access workflow for any suspension.

Reconciliation uses eligibility established at arrival, not membership validity on the day staff review it. No-shows retain allowance until explicitly waived; void corrections release both the visit and its reservation hold.

**Why:** Membership expiry must not prevent confirmation of a valid earlier visit, and leaving the reservation hold after voiding attendance would silently keep consuming quota.

**How to apply:** Test delayed confirmation after expiry and new bookings after both voided attendance and waived no-shows whenever reconciliation rules change.
