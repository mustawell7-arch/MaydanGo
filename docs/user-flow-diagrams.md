# MaydanGo — User-Flow Diagrams

| Document field | Value |
|---|---|
| Version | 1.0 |
| Last updated | 20 November 2026 |
| Status | Draft for product-owner review |
| Related documents | `docs/product-requirements.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md` |

The diagrams below describe the intended product flows. They are editable Mermaid diagrams and can be rendered by compatible Markdown viewers. Payment and SMS branches are shown as gated future work, not as active integrations.

## 1. Member discovery, booking, and attendance

```mermaid
flowchart TD
    A[Open MaydanGo] --> B{Signed in?}
    B -- No --> C[Sign in or create account]
    B -- Yes --> D[Choose language and browse]
    C --> D
    D --> E[Select facility or activity]
    E --> F[Review schedule, eligibility, safety, and accessibility]
    F --> G{Request a booking?}
    G -- No --> D
    G -- Yes --> H[Server checks account, membership, limits, capacity, and timing]
    H --> I{Eligible and available?}
    I -- No --> J[Show reason and available alternatives]
    J --> D
    I -- Yes --> K[Create booking or reservation]
    K --> L[At venue, open check-in]
    L --> M[Verify QR, location, membership, limits, and booking]
    M --> N{All checks pass?}
    N -- No --> O[Reject or route to authorized review]
    N -- Yes --> P[Record check-in and show confirmation]
    P --> Q[Partner confirms attendance when required]
```

## 2. Course discovery and protected access

```mermaid
flowchart TD
    A[Browse courses or a learning collection] --> B[Review localized course details]
    B --> C[Select a course]
    C --> D{Signed in?}
    D -- No --> E[Sign in]
    D -- Yes --> F[Server checks membership and course enrollment]
    E --> F
    F --> G{Access allowed?}
    G -- No --> H[Explain the unmet requirement]
    H --> B
    G -- Yes --> I[Open course lessons]
    I --> J[Record permitted progress for this member]
    J --> K{Course complete?}
    K -- No --> I
    K -- Yes --> L[Assigned instructor reviews completion]
    L --> M{Approved?}
    M -- No --> N[Keep completion pending]
    M -- Yes --> O[Issue non-accredited completion certificate]
```

**Collection rule:** A collection groups at least two published courses in an administrator-defined order. It never grants membership, enrollment, lesson access, or payment rights.

## 3. Partner application and facility approval

```mermaid
flowchart TD
    A[Partner submits organization and facility application] --> B[MaydanGo reviews details and documents]
    B --> C{Information complete?}
    C -- No --> D[Request corrections or missing documents]
    D --> B
    C -- Yes --> E[Commercial and contract steps]
    E --> F[Facility setup and readiness checks]
    F --> G[Inspection]
    G --> H{Inspection passed?}
    H -- No --> I[Record issues and required actions]
    I --> F
    H -- Yes --> J[Issue QR and complete staff training]
    J --> K[Test check-in]
    K --> L{Operations approval?}
    L -- No --> D
    L -- Yes --> M[Approve and make partner live]
```

## 4. Instructor access and assignment

```mermaid
flowchart TD
    A[Instructor requests portal access] --> B[Administrator reviews request]
    B --> C{Approved?}
    C -- No --> D[Decline or request more information]
    C -- Yes --> E[Assign specific courses or sessions]
    E --> F[Instructor sees only assigned work]
    F --> G[View course details and upcoming sessions]
    F --> H[Track private practice tasks]
    F --> I[Review learner name and completion only]
    I --> J{Completion approved?}
    J -- No --> K[Leave completion pending]
    J -- Yes --> L[Issue completion certificate]
```

## 5. Urgent safety report and escalation

```mermaid
flowchart TD
    A[Member or staff submits safety report] --> B[Create report and audit event]
    B --> C{Urgent?}
    C -- No --> D[Assign to the appropriate support queue]
    C -- Yes --> E[Notify or surface to authorized safety staff]
    E --> F{Assigned within 30 minutes?}
    F -- Yes --> G[Track owner, actions, and outcome]
    F -- No --> H[Escalate and record the escalation outcome]
    H --> I[Use verified delivery routes only]
    I --> G
    G --> J[Resolve or refer for facility quality review]
```

Email and SMS delivery are not considered active unless the relevant service is connected and verified. The current fallback is in-app.

## 6. Corporate employee enrollment

```mermaid
flowchart TD
    A[Corporate administrator signs in] --> B{Authorized for company workspace?}
    B -- No --> C[Reject request]
    B -- Yes --> D[Open employee enrollment tools]
    D --> E[Add or update employee enrollment]
    E --> F[Server verifies company scope and required fields]
    F --> G{Valid?}
    G -- No --> H[Show validation issue]
    G -- Yes --> I[Save enrollment and audit the change]
    I --> J[Employee uses their own member account]
    J --> K[Corporate administrator cannot view activity or finance]
```

## 7. Venue suspension behavior

```mermaid
flowchart TD
    A[Authorized administrator reviews venue issue] --> B[Record reason and suspension decision]
    B --> C{Suspension reason}
    C -- Administrative --> D[Allow sign-in and existing bookings]
    D --> E[Block new bookings and restricted venue actions]
    C -- Safety, suspected fraud, or closure --> F[Cancel affected upcoming bookings]
    F --> G[Notify affected customers]
    G --> H{Payment system available?}
    H -- No --> I[Record credit or refund obligation for final payment phase]
    H -- Yes --> J[Return applicable credit or issue approved refund]
    I --> K[Keep full audit history]
    J --> K
    E --> K
```

## 8. Final payment launch gate

```mermaid
flowchart TD
    A[Payment phase proposed] --> B[Select and validate Iraqi payment providers]
    B --> C[Approve tax, invoicing, refunds, settlements, and reconciliation]
    C --> D[Complete security, privacy, and operational review]
    D --> E{All approvals and tests complete?}
    E -- No --> F[Keep live payments and paid entitlements disabled]
    F --> B
    E -- Yes --> G[Authorize limited production launch]
    G --> H[Monitor payment, refund, and reconciliation outcomes]
```

## Source and document history

These flows derive from the MaydanGo requirements PDF, the product requirements draft, and user-confirmed project decisions. They describe intended behavior and do not claim that any payment, email, SMS, or external streaming integration is connected.

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 20 November 2026 | Replit Agent | Initial user-flow diagrams for the MaydanGo product scope |
