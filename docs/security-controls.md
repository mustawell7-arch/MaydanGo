# MaydanGo security controls

## Scope

This is a code-level review of Section 79 in the product PDF. It is not a penetration-test report, a production configuration attestation, or legal/compliance certification.

## Current controls

| Requirement | Current status |
| --- | --- |
| HTTPS and encrypted communication | **Platform-dependent:** production HTTPS is supplied by the hosting edge. The app is not published, so production TLS has not been verified. |
| Password hashing | **Delegated:** passwords and identity sessions are managed by Clerk; MaydanGo does not store password hashes. |
| Role-based access control | **Implemented:** API routes enforce role and resource scope; browser/mobile guards are supplementary only. |
| Admin and Super Admin MFA | **Unverified:** this is a managed Clerk setting, not an application-code setting. Verify it before granting real administrator access. |
| Session management | **Delegated:** Clerk manages sessions. Session lifetime and revocation policy need a production settings review. |
| Rate limiting | **Partial:** sensitive and general API limits exist, but counters are process-local and keyed to authenticated accounts. They are not a shared multi-instance limit and do not provide a reliable anonymous-IP limit. |
| API protection | **Implemented, partial:** origin checks, Clerk sessions, route-level permissions, input validation, payload limits, and request throttles are present. |
| Secure file uploads | **Implemented, partial:** private storage, short-lived upload URLs, scoped object paths, type/size checks, and authorized download routes exist. Malware scanning and a complete content-quarantine service are not present. |
| Payment tokenization | **Deferred:** payment-provider work remains gated until the final payment milestone. Do not collect or store raw card details. |
| Backups and disaster recovery | **Unverified:** application code does not establish database backup, restore, or disaster-recovery readiness. |
| Audit logs | **Partial:** important operator actions use append-only audit records; coverage is not universal across every domain. |
| Fraud monitoring | **Partial:** device and check-in rules detect selected risk signals; this is not a complete fraud operations service. |
| Server and error monitoring | **Partial:** structured server logging and health checks exist. External error monitoring and alerting have not been verified. |
| Vulnerability testing | **Automated scans completed:** the latest findings and limitations are recorded in `docs/security-testing-report.md`. This is not a penetration test. |
| Penetration testing | **Not performed:** arrange a separately authorized, scoped test before launch. |
| Access-log monitoring | **Partial:** request logging exists, but continuous review, retention, and alerting are not verified. |
| Secret management | **Implemented in application configuration:** credentials are read from environment secrets rather than source constants. Review production secret scope and rotation before launch. |
| Banking-data encryption | **Not applicable to the current model:** no bank-account data is stored. Add a separate design and encryption/key-management review before introducing it. |
| Restricted financial access | **Implemented, gated:** finance actions are role-checked and audited; money movement remains disabled/deferred. |

The API now adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` to its responses. CSP and HSTS are not set in application code: the public web app needs an origin-specific policy, and production TLS terminates at the hosting edge.

## Latest automated scan

The latest dependency, source, and privacy/dataflow scan was run on 21 November 2026. It found one moderate `minimatch` advisory, two static-server path warnings reviewed against the path-confinement helper, and no privacy/dataflow findings. The full results, test evidence, and remediation steps are in `docs/security-testing-report.md`.

## Release checks still required

1. Confirm MFA for Admin and Super Admin in the managed Clerk production environment.
2. Confirm production session lifetime and account recovery settings.
3. Verify HTTPS and hosting/database backup and restore procedures after deployment.
4. Decide whether rate limits need a shared store before running multiple API instances.
5. Configure external error and access-log alerting and document retention.
6. Complete an authorized penetration test and resolve or formally accept its findings.
7. Re-run dependency, source, and privacy scans after dependency updates and before launch.
8. Keep financial data, tokenization, and bank details outside the live product until the final payment milestone and an approved security design.
