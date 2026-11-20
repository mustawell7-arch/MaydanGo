# MaydanGo — Security Testing Report

| Report field | Value |
|---|---|
| Version | 1.0 |
| Report date | 21 November 2026 |
| Code revision reviewed | `1db3d01e7b9d6f1e34ea365812d6707ffb0c6cb7` |
| Status | Automated scans complete; release security review remains open |
| Related documents | `docs/security-controls.md`, `docs/testing-plan.md` |

## 1. Executive summary

Three automated security scanners were run against the MaydanGo workspace. The dependency audit reported no critical or high-severity advisories and one moderate advisory. The source scanner reported two high-severity file-path warnings in the Expo static server. Code review and the focused path-safety tests confirmed that both reads use a resolver that confines paths to the static asset directory; the scanner warnings remain documented for re-review if that resolver changes. The privacy and dataflow scan reported no findings.

This report is not a penetration test, production security certification, or confirmation that external provider settings are safe.

## 2. Scope and method

The review covered:

- Package dependency advisories.
- Static source-code findings.
- Privacy and sensitive-data flow findings.
- Focused unit tests for static-file path confinement.

The scanners were run on 21 November 2026. The dependency scanner reported its scan timestamp as `2026-11-20T23:21:54.955Z` (21 November in the project’s Europe/Berlin timezone).

## 3. Results

| Scan | Result | Disposition |
|---|---|---|
| Dependency audit | 0 critical, 0 high, 1 moderate | One moderate advisory affects `minimatch` 10.2.6 in Expo fingerprint tooling. |
| Source scan | 2 high findings | Both flag static-server file reads. Manual review and focused tests confirmed path confinement for the current implementation. |
| Privacy/dataflow scan | 0 findings | No scanner findings in this run. |
| Static-path safety tests | 3 passed, 0 failed | Normal in-root paths work; plain, encoded, and malformed traversal paths are rejected. |

### 3.1 Moderate dependency advisory

The dependency audit identified `GHSA-g3hv-75wg-m249` (`CVE-2026-118764`) in `minimatch` 10.2.6. The advisory describes excessive CPU and memory use for certain attacker-controlled glob patterns.

The workspace dependency tree shows this version under Expo’s `@expo/fingerprint` tooling, rather than as a direct MaydanGo API request dependency. Its declared version range is `^10.2.6`; the scanner’s available fixed version is 11.0.1, which is outside that major-version range.

**Action:** Do not force a major override without compatibility verification. Recheck for an Expo-compatible parent-package update, then update and rescan before release.

### 3.2 Static-server path warnings

The source scanner flagged reads in `artifacts/maydango/server/serve.js` at the manifest read and static-asset read. Both paths are first passed through `resolveStaticFilePath` in `artifacts/maydango/server/safe-static-path.js`. That helper decodes the path, resolves it against the fixed static-build root, and rejects paths that escape the root.

The focused check was run with:

```sh
node --test artifacts/maydango/server/safe-static-path.test.js
```

Result: all three tests passed. This confirms the tested path cases; it is not a substitute for a full penetration test.

**Disposition:** No path escape was identified in the reviewed implementation. Keep the scanner findings visible and repeat the review if the resolver, static root, or serving routes change.

## 4. Limitations

This scan did not:

- Test a deployed production environment or hosting configuration.
- Verify Clerk MFA, account recovery, session lifetime, or production secret rotation.
- Test all authenticated roles and cross-account API boundaries end to end.
- Check database backup restoration or operational alert delivery.
- Perform penetration testing, load testing, or adversarial testing of third-party services.

## 5. Release actions

Before public production release:

1. Recheck the `minimatch` advisory and update through a compatible Expo release when available.
2. Rerun dependency, source, and privacy/dataflow scans after dependency changes.
3. Verify production HTTPS, administrator MFA, session and recovery policies, backup restoration, and secret rotation.
4. Review shared rate limiting and monitoring if the API runs on multiple instances.
5. Arrange a separately authorized, scoped penetration test and record remediation or formal risk acceptance.
6. Keep payment and financial services disabled until the final payment phase and security design approval.

## 6. Conclusion

The automated scan results are recorded for the current code revision. The moderate development-tool dependency advisory remains open; the two static-server warnings were reviewed against the current path guard and passing focused tests. Production configuration checks and penetration testing are still required before release.
