# MaydanGo low-fidelity wireframes

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Structural draft — no visual identity or photography added |
| Scope | Core mobile, public website, and role-portal screens |

## 1. Design boundary

These wireframes define information order and primary actions, not final colors, brand styling, imagery, or production-ready Figma layouts. Photo, artwork, and partner-media areas are intentionally shown as empty placeholders for assets the owner will provide.

Live checkout, payment methods, invoices, refunds, and wallet screens are excluded until the final payment phase. The community and third-party wellbeing integrations remain skipped.

## 2. Shared interaction rules

- Support English, Arabic, and Sorani Kurdish; use left-to-right layout for English and right-to-left layout for Arabic and Sorani.
- Keep the selected Iraqi city visible where location affects discovery. Display dates and times in Iraq-local time.
- Use clear, localized text labels with icons; never rely on color alone for booking, attendance, or approval status.
- Preserve distinct states for loading, empty results, unavailable service, permission denial, and recoverable errors.
- Do not display a preview reservation as a live membership entitlement.
- Keep member, instructor, partner, corporate, and platform-operations data separated by server authorization.
- Use partner-supplied images only. Until supplied, use a neutral empty media frame or a content icon.

## 3. Mobile app

The existing five-tab navigation remains the structural base: **Home, Explore, Bookings, Online, Profile**. The check-in action stays visible from Home and within the check-in flow.

### 3.1 Home

```text
[MaydanGo] [Selected Iraqi city ▾]                 [Scan to check in]
[Greeting]
[Membership status card]
[Remaining access, when available]
[Upcoming booking / helpful empty state]
[Next live class]
[Continue learning]
[Nearby facilities]                 [See all]
[Upcoming events]
[Featured course or instructor]
[Bottom navigation: Home | Explore | Bookings | Online | Profile]
```

### 3.2 Explore — facilities and events

```text
[Page title: Explore] [Selected city ▾]
[Search facilities, activities, instructors, or events]
[Places | Events]
[Filters: date · time · category · eligibility · access · level]
[List | Map]
[Result card: partner-supplied media slot, name, district, access notes]
[Localized activity tags · opening status · rating when available]
[View details]
[Bottom navigation]
```

Filter controls should not hide the result count or the active filters. Map access is optional; list discovery must remain usable when location permission is denied or facility coordinates are unavailable.

### 3.3 Facility or activity details

```text
[Back] [Facility name]                         [Save]
[Partner-supplied cover image placeholder]
[District · city · opening status]
[Facility description and accessibility]
[Activities and amenities]
[Gender / family / age requirements]
[Opening hours and directions]
[Upcoming sessions]
[Session card: date, time, instructor, places, booking model]
[Book / Request booking / Open access details]
[Safety and check-in instructions]
[Reviews and contact support]
```

Show only the action supported by that activity’s booking model. Explain requirements before the member commits to a booking. Do not imply that a booking is an attendance record.

### 3.4 Booking and booking status

```text
[Selected activity and facility]
[Date and time]
[Eligibility and booking requirements]
[Cancellation deadline]
[Confirm booking or send request]

Confirmation:
[Success or request-pending state]
[Booking reference · status · Iraq-local date/time]
[Open My Bookings] [View facility]
```

The Bookings tab groups upcoming reservations, events, coaching requests, waitlist entries, and updates. Each row shows its current status, relevant response deadline, and available action. Cancel actions must state when cancellation is no longer available.

### 3.5 Check-in

```text
[Check-in]
[Facility / booking context]
[Camera permission and QR scanner]
[Location permission and distance status]
[Scan result: verifying / success / clear reason for rejection]
[Member photo and name only where staff verification is authorized]
[Attendance status and confirmation reference]
[Help and safety]
```

Keep camera and location explanations in context. A QR scan or GPS result alone does not silently turn a reservation into confirmed attendance; the API and configured partner confirmation flow determine the final state.

### 3.6 Online training

```text
[Online training]
[Courses | Live classes | Coaching]
[Course search] [Saved courses]
[Course collections: localized title and ordered course list]
[Continue learning]
[Recommended courses with a short reason]
[Course cards: title · instructor · language · lessons · access note]
[Bottom navigation]
```

Course collections help members browse. Selecting a course still follows the course’s own membership, enrollment, and content-access checks.

### 3.7 Profile, privacy, and help

```text
[Profile and account]
[Account details] [Language]
[Membership and access]
[Saved courses] [Fitness challenge] [Loyalty points]
[Consent and notification settings]
[Privacy requests and data export]
[Device security]
[Help and safety] [Support conversations]
[Sign out]
```

Do not collect guardian identity details. For members under 18, the venue verifies the required guardian consent onsite. The privacy request screen must distinguish request submission from completed export or deletion.

## 4. Public website

```text
[MaydanGo] [How it works] [Membership] [Explore] [Online] [Partners] [Help] [Language]
[Hero text and primary action] [Owner-supplied image placeholder]
[How membership works: discover · book · check in · train online]
[Membership comparison summary — no live checkout until final payment phase]
[Featured facilities and approved activities]
[Online courses, live classes, and instructor previews]
[Partner and corporate information]
[Help, privacy, terms, enquiry email]
[Footer: language, policies, contact, app links when configured]
```

Public pages show published information only. Do not expose a private member roster, staff portal, unpublished course, or private document from the public website.

## 5. Secure portal layouts

### Partner operations portal

```text
[MaydanGo Partner] [Facility selector] [Language] [Account]
[Sidebar: Overview · Facilities · Activities and schedules · Bookings]
[          Attendance · Quality documents · Support]
[Main panel: current facility and role-scoped records]
[Table or cards: date · activity · status · authorized action]
```

Show only the partner’s assigned facilities and operational records. Finance amounts, bank details, member history, and administrative controls stay hidden unless a separately approved role grants access.

### Instructor portal

```text
[Instructor workspace] [Language] [Account]
[Assigned courses and upcoming sessions]
[Course roster: minimum details needed for the assigned task]
[Assignments: practice progress only]
[Certificate candidates: member name and completion details]
[Support conversation with MaydanGo]
```

Instructors see only explicitly assigned courses or sessions. Do not add member contact, finance, or unrelated activity data to the roster.

### Corporate portal

```text
[Company workspace] [Organization] [Language] [Account]
[Employee invitations]
[Employee list: work email · enrollment status · available action]
[Add or remove employee]
[Agreement information]
```

The initial scope is employee administration. Do not add individual member attendance, class history, health information, or finance reporting for HR.

### Platform operations portal

```text
[Operations] [Role and language] [Account]
[Role-scoped navigation]
[Review queue or operational summary]
[Record detail with history and audit context]
[Approve / request changes / reject / suspend, only when authorized]
```

Use separate, permission-checked areas for partner onboarding, quality and safety, support, learning content, corporate administration, and finance review. Do not show full Super Admin controls to ordinary administrator roles.

## 6. Responsive and accessible behavior

- On narrow screens, stack content in one column and keep primary actions reachable without covering system navigation.
- On wide web screens, use a consistent page header and role-scoped navigation; keep long data tables readable with clear headings.
- Mirror layout direction for Arabic and Sorani without reversing dates, phone numbers, or Latin identifiers incorrectly.
- Provide visible keyboard focus, descriptive labels, screen-reader status announcements, and text equivalents for icons.
- Ensure empty and failure states explain what happened and offer a safe next step.

## 7. Deferred visual and payment decisions

- Final colors, typography refinements, cultural motifs, and photography await owner review and owner-supplied assets.
- No photos or new visual assets were generated, searched for, downloaded, or added for these wireframes.
- Payment-flow diagrams and payment screens remain deferred until the final payment phase.
- These structural wireframes do not certify the current UI, final Arabic/Sorani copy, or native-device behavior.

