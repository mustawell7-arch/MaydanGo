# MaydanGo Administrator Manual

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 21 November 2026 |
| Status | Draft for operational review |
| Audience | MaydanGo administrators with assigned workspace permissions |

## 1. Purpose and scope

This manual explains the current web-based administration workspace and the safe handling of common operational tasks. It describes current MaydanGo screens and approved product rules; it does not grant permissions or replace server-side access checks.

This guide covers the shared partner-operations and administration workspace. Separate manuals for Super Admin, Finance, partner staff, instructors, corporate administrators, and customer support are later PDF deliverables.

## 2. Sign-in and access

1. Sign in using your own MaydanGo account.
2. Open the Partner Operations workspace at `/partner-portal`.
3. Select English, Arabic, or Sorani Kurdish from the language control. Dates and times are shown in Iraq local time.
4. Use only the sections available to your assigned role. Menus and records are scoped by the server; a missing section or access-denied message means the account has not been granted that permission.
5. If access is wrong, stop and ask an authorized Super Admin to review the assignment. Do not use another person’s account or attempt to work around a denied action.

The legacy `admin` role does not receive full-platform access by default. Administrator permissions are assigned by operational responsibility, such as partner operations, customer support, finance, content, marketing, corporate operations, fraud and compliance, or technical operations.

## 3. Workspace guide

The exact tabs vary with the signed-in role. The shared workspace may include:

| Area | Use |
|---|---|
| Overview | Review scoped activity, upcoming attendance, and available summaries. |
| Offerings and bookings | Review activities, sessions, schedules, cancellations, capacity, and booking status. |
| Attendance | Review the authorized roster and record permitted attendance decisions. |
| Waiting list | Review active queues for eligible upcoming sessions. |
| Partners and facilities | Review partner or facility records when the account has those permissions. |
| Help and safety | Work with authorized support or safety reports. |
| Facility quality and reviews | Review quality signals, reports, and facility ratings. |
| Analytics | View reports available to the assigned role and scope. |
| Staff and roles | Manage partner staff only when the account is an authorized partner owner. |
| Finance desk | Open the separate finance workspace at `/finance` when finance access is assigned. |

Additional administrator links may open partner applications (`/admin/partner-onboarding`), instructor access requests (`/admin/instructor-access`), corporate enrollment (`/admin/corporate`), or specialized content and marketing tools. Access to one area does not imply access to another.

## 4. Common procedures

### 4.1 Review a partner application

1. Open Partner applications from the authorized workspace.
2. Check that the submitted organization and facility information is complete and belongs to the applicant.
3. Follow the approved onboarding sequence for documents, contract, facility setup, staff preparation, and inspection.
4. Do not approve a partner until the required inspection is complete.
5. Record the review outcome and a clear reason when requesting changes or declining an application.
6. Confirm that approval remains separate from activity-review settings. A publishing mode must never bypass partner onboarding approval.

When a facility is suspended for an administrative issue, existing bookings may remain in place while new bookings are blocked. For a safety concern, suspected fraud, or closure, follow the approved cancellation and customer-notification process. Credits or refunds depend on the payment system being available and must not be promised before then.

### 4.2 Review or update an activity

1. Open Offerings and locate the correct partner, facility, and activity.
2. Confirm the title, location, schedule, capacity, participant eligibility, age limits, required equipment, safety instructions, and accessibility information.
3. Check that English, Arabic, and Sorani Kurdish content is complete where the activity is shown in those languages.
4. Review the status before making a change. Draft, submitted, under review, changes requested, approved, published, suspended, rejected, and archived have different meanings.
5. Add a reason for a rejection, requested change, suspension, or archival action when prompted.
6. Before cancelling a session or recurring series, review the confirmation. Booked or attended sessions may be preserved, and the result lists which dates changed.

Do not state that an activity is live, paid, or available to a member unless the system shows the corresponding approved status and eligibility.

### 4.3 Review attendance

1. Open Attendance and confirm that the roster belongs to the correct authorized partner or facility.
2. Check both booking status and attendance status before taking action.
3. Choose only the action supported by the current record and your role.
4. Enter a meaningful reason when the system requests one. The decision is recorded in the audit history.
5. Use manual check-in only as an authorized exception. The staff identity and reason must be recorded.
6. Escalate a disputed or locked record instead of changing it outside the review flow.

Final GPS-radius validation is reserved for the end-of-project, on-site device acceptance phase.

### 4.4 Respond to help and safety reports

1. Open Help and safety or the Support desk, depending on the permission and link shown for your role.
2. Review the report details and linked reservation or facility, if present.
3. Assign and respond through the case workflow. Keep replies factual, respectful, and limited to information needed to resolve the case.
4. Treat urgent safety reports as time-sensitive. Unassigned urgent reports escalate after 30 minutes.
5. Record the response and outcome in the case history.
6. If someone may be in immediate danger, tell them to contact local emergency services. MaydanGo is not an emergency-response service.

Push delivery can fail and email backup is not connected. Do not tell a reporter that an external email or SMS was sent unless the system confirms a connected and tested delivery.

### 4.5 Review facility quality

Start a quality review when either approved trigger is met:

- Three linked facility or safety tickets within 30 days; or
- An average rating below 3.5 after at least 10 reviews.

Review the linked evidence and facility context before taking action. A review trigger requests investigation; it does not by itself prove misconduct or require suspension.

### 4.6 Handle guardian-consent evidence

The partner verifies guardian consent at the venue. MaydanGo administrators must not ask the member or guardian to submit identity information through support.

If a permitted partner workflow collects a consent copy, it is private, available only to authorized Super Admin staff, and scheduled for removal 90 days after the visit. Do not download, forward, or reuse the copy for another purpose.

### 4.7 Review instructor and corporate access

- Instructor access requires an administrator decision and explicit assignment to specific courses or sessions. Instructors should see only their assigned work and team-support conversations.
- Certificate approval is limited to the learner’s name and completion information.
- The corporate portal currently supports employee enrollment only. Corporate administrators must not receive member activity, booking, attendance, or finance access.
- For unavailable controls or access requests, use the dedicated request workflow rather than granting broader access.

## 5. Records, privacy, and money

- Use only the personal information required for the current operational task.
- Do not export member or partner records unless your role and the approved purpose allow it.
- Do not edit or delete finance audit history. It is protected for traceability.
- Payment processing, subscription changes, refunds, and settlements remain deferred to the final payment phase. Do not collect card details, promise a refund, or mark an unpaid item as settled.
- Sample or preview records are not proof of a live booking, attendance, payment, or partner entitlement.

## 6. If a screen or action fails

1. Read the message and confirm that you are signed into the correct account and workspace.
2. If the page says access is required, stop and request the specific permission from an authorized Super Admin.
3. If data cannot be loaded, use the page’s retry control once. Before resubmitting a change, confirm whether the first attempt succeeded to avoid duplicates.
4. Record the affected screen, time, record reference, and non-sensitive error text in an internal support case.
5. Never paste passwords, tokens, private documents, or full member details into a support message.

## 7. End-of-shift checklist

- Urgent reports have an owner or a recorded escalation.
- Attendance exceptions include the required staff identity and reason.
- Partner, activity, or facility changes include the required decision history.
- No unapproved export or sensitive document copy remains on a local device.
- Open work is assigned to an authorized role with a clear next action.

## 8. Important release limitations

This is a draft based on the current application screens and documented product rules. It does not certify that every role has completed production setup. Before live operations, confirm administrator MFA, support coverage, backup and recovery procedures, notification delivery, and legal or accounting rules with the appropriate owner or adviser.

The APK/device acceptance, final check-in-radius test, complete native-language review, and payment operations remain scheduled for their previously agreed final phases.

## Source and document history

Prepared from MaydanGo’s product requirements, acceptance criteria, and current partner-operations role controls. This manual should be revised when the administrative workflows or permissions change.

| Version | Date | Change |
|---|---|---|
| 1.0 | 21 November 2026 | Initial administrator guide for current web workspace |
