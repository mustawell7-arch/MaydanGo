import { useState, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import {
  getGetSuperAdminAccountsQueryKey,
  getGetSuperAdminAuditLogsQueryKey,
  getGetSuperAdminGuardianConsentsQueryKey,
  getGetSuperAdminMemberConsentHistoryQueryKey,
  getGetSuperAdminPlatformRulesQueryKey,
  getGetSuperAdminRolePermissionsQueryKey,
  useGetSuperAdminAccounts,
  useGetSuperAdminAuditLogs,
  useGetSuperAdminGuardianConsents,
  useGetSuperAdminMemberConsentHistory,
  useGetSuperAdminPlatformRules,
  useGetSuperAdminRolePermissions,
  useUpdateSuperAdminPlatformRules,
  useUpsertSuperAdminAccount,
  useUpdateSuperAdminRolePermissions,
  type AdminAction,
  type AdminAccount,
  type AdminRole,
  type AdminRolePermission,
  type PlatformSafetyRulesRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { downloadGuardianConsentCopy } from "@/lib/guardian-consent-documents";

const roleLabels: Record<AdminRole, string> = {
  customer_support_admin: "Customer Support Admin",
  partner_operations_admin: "Partner Operations Admin",
  finance_admin: "Finance Admin",
  content_admin: "Content Admin",
  marketing_admin: "Marketing Admin",
  corporate_admin: "Corporate Admin",
  fraud_compliance_admin: "Fraud and Compliance Admin",
  technical_admin: "Technical Admin",
  super_admin: "Super Admin",
};

const roles = Object.keys(roleLabels) as AdminRole[];

const actionLabels: Record<AdminAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  approve: "Approve",
  reject: "Reject",
  suspend: "Suspend",
  refund: "Refund",
  export: "Export",
  delete: "Delete",
  publish: "Publish",
  manage_payments: "Manage payments",
  manage_users: "Manage users",
  view_sensitive_data: "View sensitive data",
};

const permissionActions = Object.keys(actionLabels) as AdminAction[];
type PlatformRules = PlatformSafetyRulesRecord["settings"];
type NumericRuleKey = {
  [Key in keyof PlatformRules]: PlatformRules[Key] extends number ? Key : never
}[keyof PlatformRules];
const numericRuleFields: { key: NumericRuleKey; title: string; help: string; min: number; max: number }[] = [
  { key: "deviceChangeWaitHours", title: "Device-change waiting period (hours)", help: "Applies to new device-change requests; existing requests keep their scheduled time.", min: 1, max: 168 },
  { key: "deviceChangeRiskWindowDays", title: "Repeated device-change review window (days)", help: "How far back to count changes when flagging repeated requests.", min: 1, max: 90 },
  { key: "repeatedDeviceChangeThreshold", title: "Requests before support review", help: "Flag the next request once this many earlier changes are in the review window.", min: 1, max: 10 },
  { key: "maxCheckinAccuracyMeters", title: "Maximum GPS uncertainty (meters)", help: "Less accurate scans are rejected. Partner confirmation remains required.", min: 1, max: 100 },
  { key: "rapidCheckinBlockSeconds", title: "Rapid repeat check-in block (seconds)", help: "Blocks check-ins made sooner than this after another verified visit.", min: 1, max: 600 },
  { key: "impossibleTravelWindowSeconds", title: "Travel-fraud evaluation window (seconds)", help: "Only recent visits inside this time window are checked for impossible travel.", min: 60, max: 21600 },
  { key: "impossibleTravelBaseMeters", title: "Travel distance allowance (meters)", help: "Base distance allowed before adding the per-second travel allowance.", min: 0, max: 5000 },
  { key: "impossibleTravelMetersPerSecond", title: "Travel allowance per second (meters)", help: "Higher values are more permissive when comparing recent facility visits.", min: 1, max: 200 },
  { key: "maxDailyVisitsPerPlan", title: "Maximum daily visits on new or changed plans", help: "Existing plan rules and membership access are not rewritten by this cap.", min: 1, max: 100000 },
];

const workspaceLinks = [
  { href: "/partner-portal", title: "Partners and facilities", description: "Review partners, facilities, sessions and bookings." },
  { href: "/finance", title: "Finance and memberships", description: "Review memberships, invoices and gated finance actions." },
  { href: "/support-desk", title: "Customer support", description: "Review and assign member support requests." },
  { href: "/admin/corporate", title: "Corporate accounts", description: "Manage company enrollment and invitations." },
  { href: "/admin/instructor-access", title: "Instructor access", description: "Review instructor requests and course assignments." },
];

export default function SuperAdminPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const accountsQuery = useGetSuperAdminAccounts({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminAccountsQueryKey(),
    },
  });
  const rolePermissionsQuery = useGetSuperAdminRolePermissions({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminRolePermissionsQueryKey(),
    },
  });
  const platformRulesQuery = useGetSuperAdminPlatformRules({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminPlatformRulesQueryKey(),
    },
  });
  const [auditPage, setAuditPage] = useState(0);
  const auditParams = { limit: 100, offset: auditPage * 100 };
  const auditQuery = useGetSuperAdminAuditLogs(auditParams, {
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminAuditLogsQueryKey(auditParams),
    },
  });
  const [consentPage, setConsentPage] = useState(0);
  const [consentFilterDraft, setConsentFilterDraft] = useState("");
  const [consentUserId, setConsentUserId] = useState("");
  const consentParams = { limit: 100, offset: consentPage * 100, ...(consentUserId ? { userId: consentUserId } : {}) };
  const consentQuery = useGetSuperAdminMemberConsentHistory(consentParams, {
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminMemberConsentHistoryQueryKey(consentParams),
    },
  });
  const [guardianPage, setGuardianPage] = useState(0);
  const guardianParams = { limit: 100, offset: guardianPage * 100 };
  const guardianQuery = useGetSuperAdminGuardianConsents(guardianParams, {
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminGuardianConsentsQueryKey(guardianParams),
    },
  });
  const saveAccount = useUpsertSuperAdminAccount();
  const saveRolePermissions = useUpdateSuperAdminRolePermissions();
  const savePlatformRules = useUpdateSuperAdminPlatformRules();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("customer_support_admin");
  const [roleChoices, setRoleChoices] = useState<Record<string, AdminRole>>({});
  const [permissionChoices, setPermissionChoices] = useState<Record<string, AdminAction[]>>({});
  const [platformRuleDraft, setPlatformRuleDraft] = useState<PlatformRules | null>(null);
  const [feedback, setFeedback] = useState("");
  const [permissionFeedback, setPermissionFeedback] = useState("");
  const [platformRulesFeedback, setPlatformRulesFeedback] = useState("");
  const [guardianDownloadId, setGuardianDownloadId] = useState<string | null>(null);
  const [guardianFeedback, setGuardianFeedback] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminAccountsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminAuditLogsQueryKey(auditParams) }),
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminRolePermissionsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminPlatformRulesQueryKey() }),
    ]);
  };

  const submitAccount = (account: Pick<AdminAccount, "email" | "role">, status: "active" | "suspended", key: string, afterSave?: () => void) => {
    if (!account.email) return;
    setBusyId(key);
    setFeedback("");
    saveAccount.mutate(
      { data: { email: account.email, role: account.role, status } },
      {
        onSuccess: async () => {
          setFeedback("Administrator access was updated and recorded in the audit log.");
          setAuditPage(0);
          setRoleChoices(previous => {
            const next = { ...previous };
            delete next[key];
            return next;
          });
          await refresh();
          afterSave?.();
          setBusyId("");
        },
        onError: () => {
          setFeedback("The account could not be updated. Check the email and your access, then try again.");
          setBusyId("");
        },
      },
    );
  };

  const addAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAccount({ email: email.trim(), role: newRole }, "active", "new-account", () => setEmail(""));
  };

  const updatePermissions = (policy: AdminRolePermission, actions: AdminAction[] | null) => {
    if (policy.locked) return;
    setBusyId(`permissions-${policy.role}`);
    setPermissionFeedback("");
    saveRolePermissions.mutate(
      { role: policy.role, data: { actions } },
      {
        onSuccess: async () => {
          setPermissionFeedback(`Permissions for ${roleLabels[policy.role]} were updated and recorded in the audit log.`);
          setPermissionChoices(previous => {
            const next = { ...previous };
            delete next[policy.role];
            return next;
          });
          await refresh();
          setBusyId("");
        },
        onError: () => {
          setPermissionFeedback("Role permissions could not be updated. Check your access and try again.");
          setBusyId("");
        },
      },
    );
  };

  const updateNumericRule = (key: NumericRuleKey, value: number) => {
    const current = platformRuleDraft ?? platformRulesQuery.data?.settings;
    if (current) setPlatformRuleDraft({ ...current, [key]: value });
  };

  const submitPlatformRules = () => {
    if (!platformRuleDraft) return;
    setBusyId("platform-rules");
    setPlatformRulesFeedback("");
    savePlatformRules.mutate(
      { data: { settings: platformRuleDraft } },
      {
        onSuccess: async () => {
          setPlatformRulesFeedback("Safety and access rules were saved and recorded in the audit log.");
          setPlatformRuleDraft(null);
          setAuditPage(0);
          await refresh();
          setBusyId("");
        },
        onError: () => {
          setPlatformRulesFeedback("The rules were not saved. Review the values and try again.");
          setBusyId("");
        },
      },
    );
  };

  if (!isLoaded || accountsQuery.isLoading) {
    return <main className="min-h-screen bg-[#f5f2e9] px-5 py-16"><p className="mx-auto max-w-5xl text-sm text-[#536b61]" role="status" data-testid="status-super-admin-loading">Loading Super Admin controls…</p></main>;
  }

  if (!isSignedIn) {
    return <main className="min-h-screen bg-[#f5f2e9] px-5 py-16"><section className="mx-auto max-w-xl rounded-3xl border border-[#ded8c9] bg-[#fffdf7] p-8 text-center"><h1 className="font-display text-2xl font-bold text-[#173d35]">Sign in required</h1><p className="mt-3 text-sm text-[#60756b]">Sign in with an authorized MaydanGo Super Admin account to continue.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9]" data-testid="link-super-admin-sign-in">Sign in</Link></section></main>;
  }

  if (accountsQuery.isError) {
    return <main className="min-h-screen bg-[#f5f2e9] px-5 py-16"><section className="mx-auto max-w-xl rounded-3xl border border-[#ded8c9] bg-[#fffdf7] p-8 text-center" data-testid="super-admin-denied"><h1 className="font-display text-2xl font-bold text-[#173d35]">Super Admin access required</h1><p className="mt-3 text-sm leading-6 text-[#60756b]">This console is protected by the API. Ask an authorized operator to confirm your access; existing limited Admin roles do not receive Super Admin privileges.</p><Link href="/" className="mt-6 inline-flex rounded-full border border-[#d8d2c4] px-5 py-3 text-sm font-bold text-[#36564b]" data-testid="link-super-admin-home">Return to MaydanGo</Link></section></main>;
  }

  const accounts = accountsQuery.data ?? [];
  const auditLogs = auditQuery.data ?? [];
  const consentEvents = consentQuery.data ?? [];
  const guardianDocuments = guardianQuery.data?.items ?? [];
  const rolePolicies = rolePermissionsQuery.data ?? [];
  const platformRules = platformRuleDraft ?? platformRulesQuery.data?.settings ?? null;
  const platformRulesChanged = !!platformRuleDraft
    && JSON.stringify(platformRuleDraft) !== JSON.stringify(platformRulesQuery.data?.settings);

  return (
    <main className="min-h-screen bg-[#f5f2e9] px-4 py-8 text-[#173d35] sm:px-7 sm:py-12" data-testid="page-super-admin">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8c6849]">MaydanGo · Platform control</p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Super Admin console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#60756b]">Manage administrator roles and open the existing operations workspaces. Role changes are recorded in the append-only audit history.</p>
          </div>
          <Link href="/" className="rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-4 py-2.5 text-sm font-bold text-[#36564b]" data-testid="link-super-admin-public-site">Public website</Link>
        </header>

        <section aria-labelledby="workspaces-title" className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 id="workspaces-title" className="font-display text-xl font-bold">Operations workspaces</h2><p className="mt-1 text-xs text-[#748279]">Only modules that already exist in this build are linked here.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workspaceLinks.map(item => <Link key={item.href} href={item.href} className="rounded-2xl border border-[#e1dccf] bg-[#fffdf7] p-5 transition hover:border-[#8da89a] hover:bg-white" data-testid={`link-super-admin-workspace-${item.href.replaceAll("/", "-")}`}>
              <h3 className="font-bold">{item.title}</h3><p className="mt-2 text-sm leading-5 text-[#60756b]">{item.description}</p>
            </Link>)}
          </div>
        </section>

        <section className="mb-8 rounded-3xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="platform-rules-title" data-testid="section-platform-safety-rules">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="platform-rules-title" className="font-display text-xl font-bold">Safety and access rules</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[#60756b]">Adjust supported device, check-in fraud, membership visit-limit, and partner publishing rules. These controls never display or store API credentials.</p>
            </div>
            <button type="button" onClick={() => void platformRulesQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b]" data-testid="button-refresh-platform-rules">Refresh rules</button>
          </div>
          {platformRulesFeedback && <p className={`mb-4 rounded-xl border px-4 py-3 text-sm ${platformRulesFeedback.startsWith("The rules were not") ? "border-[#e8c5ba] bg-[#fff5f1] text-[#9a4435]" : "border-[#c8d9ca] bg-[#edf5ec] text-[#315e42]"}`} role={platformRulesFeedback.startsWith("The rules were not") ? "alert" : "status"} data-testid="status-platform-rules-feedback">{platformRulesFeedback}</p>}
          {platformRulesQuery.isLoading
            ? <p className="py-5 text-center text-sm text-[#748279]" role="status" data-testid="status-platform-rules-loading">Loading safety rules…</p>
            : platformRulesQuery.isError
              ? <p className="rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert" data-testid="error-platform-rules">Safety rules could not be loaded. Retry before changing them.</p>
              : platformRules && <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {numericRuleFields.map(field => <label key={field.key} className="rounded-2xl border border-[#e5dfd1] bg-[#faf8f1] p-4 text-xs font-semibold text-[#36564b]">
                    <span>{field.title}</span>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={1}
                      value={platformRules[field.key]}
                      onChange={event => updateNumericRule(field.key, Number(event.target.value))}
                      disabled={!!busyId}
                      className="mt-2 w-full rounded-xl border border-[#d8d2c4] bg-white px-3 py-2.5 text-sm text-[#173d35] outline-none focus:border-[#6b9382] disabled:opacity-60"
                      data-testid={`input-platform-rule-${field.key}`}
                    />
                    <span className="mt-2 block font-normal leading-5 text-[#748279]">{field.help}</span>
                  </label>)}
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-[#e5dfd1] bg-[#faf8f1] p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={platformRules.offeringApprovalRequired}
                    onChange={event => setPlatformRuleDraft({ ...platformRules, offeringApprovalRequired: event.target.checked })}
                    disabled={!!busyId}
                    className="mt-0.5"
                    data-testid="checkbox-platform-rule-offering-approval"
                  />
                  <span><strong>Require admin approval before partner activities are published</strong><span className="mt-1 block text-xs font-normal leading-5 text-[#748279]">When disabled, approved partners can publish complete drafts themselves. Existing activities are not changed; administrator publishing remains governed by role permissions.</span></span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!platformRulesChanged || !!busyId} onClick={submitPlatformRules} className="rounded-lg bg-[#174d43] px-4 py-2.5 text-sm font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-save-platform-rules">{busyId === "platform-rules" ? "Saving…" : "Save safety rules"}</button>
                  <button type="button" disabled={!platformRuleDraft || !!busyId} onClick={() => setPlatformRuleDraft(null)} className="rounded-lg border border-[#d8d2c4] px-4 py-2.5 text-sm font-bold text-[#36564b] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-discard-platform-rules">Discard changes</button>
                  <span className="text-xs text-[#748279]" data-testid="text-platform-rules-source">{platformRulesQuery.data?.isCustom ? "Custom rules" : "Current safe defaults"}{platformRulesQuery.data?.updatedAt ? ` · Updated ${new Date(platformRulesQuery.data.updatedAt).toLocaleString()}` : ""}</span>
                </div>
              </div>}
        </section>

        <section className="mb-8 rounded-3xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="role-permissions-title" data-testid="section-role-permissions">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="role-permissions-title" className="font-display text-xl font-bold">Role permissions</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[#60756b]">Control which actions each administrator role can perform. A role must also have access to the relevant workspace. Super Admin permissions stay locked to protect platform access.</p>
            </div>
            <button type="button" onClick={() => void rolePermissionsQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b]" data-testid="button-refresh-role-permissions">Refresh permissions</button>
          </div>
          {permissionFeedback && <p className={`mb-4 rounded-xl border px-4 py-3 text-sm ${permissionFeedback.startsWith("Role permissions could not") ? "border-[#e8c5ba] bg-[#fff5f1] text-[#9a4435]" : "border-[#c8d9ca] bg-[#edf5ec] text-[#315e42]"}`} role={permissionFeedback.startsWith("Role permissions could not") ? "alert" : "status"} data-testid="status-role-permission-feedback">{permissionFeedback}</p>}
          {rolePermissionsQuery.isLoading
            ? <p className="py-5 text-center text-sm text-[#748279]" role="status" data-testid="status-role-permissions-loading">Loading role permissions…</p>
            : rolePermissionsQuery.isError
              ? <p className="rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert" data-testid="error-role-permissions">Role permissions could not be loaded. Retry to see the current settings.</p>
              : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rolePolicies.map(policy => {
                  const selected = permissionChoices[policy.role] ?? policy.actions;
                  const isChanged = selected.length !== policy.actions.length
                    || selected.some(action => !policy.actions.includes(action));
                  return <article key={policy.role} className="rounded-2xl border border-[#e5dfd1] bg-[#faf8f1] p-4" data-testid={`card-role-permissions-${policy.role}`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div><h3 className="font-bold">{roleLabels[policy.role]}</h3><p className="mt-1 text-[11px] text-[#748279]">{policy.isCustom ? "Custom permissions" : "Default permissions"}</p></div>
                      {policy.locked && <span className="rounded-full bg-[#e4f0e6] px-2.5 py-1 text-[10px] font-bold text-[#315e42]">Locked</span>}
                    </div>
                    <fieldset disabled={policy.locked || !!busyId} className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <legend className="sr-only">Actions for {roleLabels[policy.role]}</legend>
                      {permissionActions.map(action => <label key={action} className="flex items-center gap-2 text-xs text-[#536b61]">
                        <input
                          type="checkbox"
                          checked={selected.includes(action)}
                          onChange={event => setPermissionChoices(previous => {
                            const current = previous[policy.role] ?? policy.actions;
                            const next = event.target.checked
                              ? [...current, action]
                              : current.filter(item => item !== action);
                            return { ...previous, [policy.role]: next };
                          })}
                          data-testid={`checkbox-permission-${policy.role}-${action}`}
                        />
                        {actionLabels[action]}
                      </label>)}
                    </fieldset>
                    {!policy.locked && <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" disabled={!isChanged || !!busyId} onClick={() => updatePermissions(policy, selected)} className="rounded-lg bg-[#174d43] px-3 py-2 text-xs font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-save-permissions-${policy.role}`}>{busyId === `permissions-${policy.role}` ? "Saving…" : "Save permissions"}</button>
                      <button type="button" disabled={!policy.isCustom || !!busyId} onClick={() => updatePermissions(policy, null)} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-reset-permissions-${policy.role}`}>Restore defaults</button>
                    </div>}
                  </article>;
                })}
              </div>}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
          <section className="rounded-3xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="admin-accounts-title">
            <div className="mb-5"><h2 id="admin-accounts-title" className="font-display text-xl font-bold">Administrator accounts</h2><p className="mt-1 text-sm leading-5 text-[#60756b]">Assign roles only to existing accounts with a verified email. Suspending an account removes its MaydanGo staff permissions without deleting its member account.</p></div>

            <form onSubmit={addAccount} className="mb-6 grid gap-3 rounded-2xl border border-[#e5dfd1] bg-[#faf8f1] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)_auto] sm:items-end" data-testid="form-add-admin-account">
              <label className="text-xs font-semibold">Verified account email
                <input type="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#d8d2c4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6b9382]" placeholder="name@example.com" data-testid="input-admin-email" />
              </label>
              <label className="text-xs font-semibold">Administrator role
                <select value={newRole} onChange={event => setNewRole(event.target.value as AdminRole)} className="mt-1.5 w-full rounded-xl border border-[#d8d2c4] bg-white px-3 py-2.5 text-sm" data-testid="select-new-admin-role">
                  {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </label>
              <button type="submit" disabled={!!busyId} className="rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-bold text-[#fff9e9] disabled:opacity-50" data-testid="button-assign-admin-role">{busyId === "new-account" ? "Saving…" : "Assign role"}</button>
            </form>

            {feedback && <p className="mb-4 rounded-xl border border-[#c8d9ca] bg-[#edf5ec] px-4 py-3 text-sm text-[#315e42]" role="status" data-testid="status-admin-account-feedback">{feedback}</p>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead><tr className="border-b border-[#e7e2d6] text-[10px] uppercase tracking-[.1em] text-[#78857c]"><th className="px-2 py-3">Account</th><th className="px-2 py-3">Role</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Actions</th></tr></thead>
                <tbody>
                  {accounts.map(account => {
                    const selectedRole = roleChoices[account.userId] ?? account.role;
                    const isSelf = account.userId === userId;
                    return <tr key={account.userId} className="border-b border-[#eee9de] align-top" data-testid={`row-admin-account-${account.userId}`}>
                      <td className="px-2 py-4"><p className="font-semibold">{account.email ?? "Account email unavailable"}</p><p className="mt-1 max-w-[240px] break-all font-mono text-[10px] text-[#839087]">{account.userId}</p></td>
                      <td className="px-2 py-4"><select value={selectedRole} disabled={!account.email || !!busyId} onChange={event => setRoleChoices(previous => ({ ...previous, [account.userId]: event.target.value as AdminRole }))} className="max-w-[220px] rounded-lg border border-[#d8d2c4] bg-white px-2 py-2 text-xs" aria-label={`Role for ${account.email ?? account.userId}`} data-testid={`select-admin-role-${account.userId}`}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></td>
                      <td className="px-2 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${account.status === "active" ? "bg-[#e4f0e6] text-[#315e42]" : "bg-[#f6e7e2] text-[#9a4435]"}`} data-testid={`status-admin-${account.userId}`}>{account.status === "active" ? "Active" : "Suspended"}</span></td>
                      <td className="px-2 py-4"><div className="flex flex-wrap gap-2">
                        <button disabled={!account.email || !!busyId || isSelf && selectedRole !== account.role} onClick={() => submitAccount({ email: account.email, role: selectedRole }, account.status, account.userId)} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-[11px] font-bold text-[#36564b] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-save-admin-${account.userId}`}>{busyId === account.userId ? "Saving…" : "Save role"}</button>
                        {account.status === "active"
                          ? <button disabled={!account.email || !!busyId || isSelf} onClick={() => submitAccount({ email: account.email, role: selectedRole }, "suspended", account.userId)} className="rounded-lg border border-[#d9a89a] px-3 py-2 text-[11px] font-bold text-[#9a4435] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-suspend-admin-${account.userId}`}>Suspend</button>
                          : <button disabled={!account.email || !!busyId} onClick={() => submitAccount({ email: account.email, role: selectedRole }, "active", account.userId)} className="rounded-lg bg-[#174d43] px-3 py-2 text-[11px] font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-restore-admin-${account.userId}`}>Restore</button>}
                      </div></td>
                    </tr>;
                  })}
                  {!accounts.length && <tr><td colSpan={4} className="px-2 py-8 text-center text-sm text-[#748279]" data-testid="text-no-admin-accounts">No administrator accounts are assigned yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="member-consent-history-title">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="member-consent-history-title" className="font-display text-xl font-bold">Member consent history</h2>
                <p className="mt-1 text-sm text-[#60756b]">Read-only history. Each lookup is recorded in the platform audit log.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void consentQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b]">Refresh</button>
                <button onClick={() => setConsentPage(page => Math.max(0, page - 1))} disabled={consentPage === 0} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40">Newer</button>
                <span className="self-center text-xs text-[#748279]">Page {consentPage + 1}</span>
                <button onClick={() => setConsentPage(page => page + 1)} disabled={consentEvents.length < 100} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40">Older</button>
              </div>
            </div>
            <form onSubmit={event => {
              event.preventDefault();
              setConsentPage(0);
              setConsentUserId(consentFilterDraft.trim());
            }} className="mb-4 flex flex-wrap gap-2">
              <label htmlFor="member-consent-user-id" className="sr-only">Filter by member user ID</label>
              <input id="member-consent-user-id" value={consentFilterDraft} onChange={event => setConsentFilterDraft(event.target.value)} placeholder="Filter by member user ID" className="min-w-64 flex-1 rounded-lg border border-[#d8d2c4] bg-white px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-[#36564b] px-4 py-2 text-xs font-bold text-white">Search</button>
              {consentUserId && <button type="button" onClick={() => { setConsentFilterDraft(""); setConsentUserId(""); setConsentPage(0); }} className="rounded-lg border border-[#d8d2c4] px-4 py-2 text-xs font-bold text-[#36564b]">Clear</button>}
            </form>
            {consentQuery.isLoading ? <p className="py-8 text-center text-sm text-[#748279]" role="status">Loading consent history…</p>
              : consentQuery.isError ? <p className="rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert">Consent history could not be loaded. Retry to see the latest records.</p>
                : <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-[#eee9de] text-xs uppercase tracking-wide text-[#748279]">
                      <tr><th className="px-2 py-3">Member ID</th><th className="px-2 py-3">Purpose</th><th className="px-2 py-3">Policy version</th><th className="px-2 py-3">Choice</th><th className="px-2 py-3">Recorded</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee9de]">
                      {consentEvents.map(event => <tr key={event.id}>
                        <td className="max-w-48 break-all px-2 py-3 font-mono text-xs">{event.userId}</td>
                        <td className="px-2 py-3">{event.purpose.replaceAll("_", " ")}</td>
                        <td className="px-2 py-3">{event.policyVersion}</td>
                        <td className="px-2 py-3">{event.choice}</td>
                        <td className="px-2 py-3 text-xs text-[#60756b]">{new Date(event.recordedAt).toLocaleString()}</td>
                      </tr>)}
                      {!consentEvents.length && <tr><td colSpan={5} className="px-2 py-8 text-center text-sm text-[#748279]">No consent history is recorded for this search.</td></tr>}
                    </tbody>
                  </table>
                </div>}
          </section>

          <section className="rounded-3xl border border-[#dfc99e] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="guardian-consent-documents-title">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="guardian-consent-documents-title" className="font-display text-xl font-bold">Guardian-consent copies</h2>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-[#60756b]">Restricted to Super Admin. Partner uploads are private, each document view is audited, and files are removed 90 days after the visit.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void guardianQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b]" data-testid="button-refresh-guardian-consents">Refresh</button>
                <button onClick={() => setGuardianPage(page => Math.max(0, page - 1))} disabled={guardianPage === 0} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40">Newer</button>
                <span className="self-center text-xs text-[#748279]">Page {guardianPage + 1}</span>
                <button onClick={() => setGuardianPage(page => page + 1)} disabled={guardianDocuments.length < 100} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40">Older</button>
              </div>
            </div>
            {guardianFeedback && <p className="mb-3 rounded-xl border border-[#c8d9ca] bg-[#edf5ec] px-4 py-3 text-sm text-[#315e42]" role="status">{guardianFeedback}</p>}
            {guardianQuery.isLoading ? <p className="py-8 text-center text-sm text-[#748279]" role="status">Loading guardian-consent copies…</p>
              : guardianQuery.isError ? <p className="rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert">Guardian-consent copies could not be loaded. Retry to see the latest records.</p>
                : <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-[#eee9de] text-xs uppercase tracking-wide text-[#748279]">
                      <tr><th className="px-2 py-3">Member ID</th><th className="px-2 py-3">Partner</th><th className="px-2 py-3">Facility and session</th><th className="px-2 py-3">Visit</th><th className="px-2 py-3">Delete after</th><th className="px-2 py-3">Private file</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee9de]">
                      {guardianDocuments.map(document => <tr key={document.id} data-testid={`row-guardian-consent-${document.id}`}>
                        <td className="max-w-48 break-all px-2 py-3 font-mono text-xs">{document.memberUserId}</td>
                        <td className="px-2 py-3">{document.partnerName ?? "Partner unavailable"}</td>
                        <td className="px-2 py-3"><p className="font-semibold">{document.facility}</p><p className="mt-1 text-xs text-[#60756b]">{document.sessionTitle}</p></td>
                        <td className="px-2 py-3 text-xs text-[#60756b]">{new Date(document.visitAt).toLocaleString()}</td>
                        <td className="px-2 py-3 text-xs text-[#60756b]">{new Date(document.expiresAt).toLocaleString()}</td>
                        <td className="px-2 py-3">
                          <button type="button" disabled={guardianDownloadId === document.id} onClick={async () => {
                            setGuardianDownloadId(document.id);
                            setGuardianFeedback("");
                            try {
                              await downloadGuardianConsentCopy(document.id);
                              setGuardianFeedback("Private copy downloaded. The access was recorded.");
                            } catch {
                              setGuardianFeedback("The copy could not be downloaded. It may have expired.");
                            } finally {
                              setGuardianDownloadId(null);
                            }
                          }} className="rounded-lg bg-[#174d43] px-3 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-50" data-testid={`button-download-guardian-consent-${document.id}`}>
                            {guardianDownloadId === document.id ? "Preparing…" : "Download"}
                          </button>
                        </td>
                      </tr>)}
                      {!guardianDocuments.length && <tr><td colSpan={6} className="px-2 py-8 text-center text-sm text-[#748279]">No unexpired guardian-consent copies are available.</td></tr>}
                    </tbody>
                  </table>
                </div>}
          </section>

          <section className="rounded-3xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6" aria-labelledby="audit-log-title">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="audit-log-title" className="font-display text-xl font-bold">Platform audit history</h2><p className="mt-1 text-sm text-[#60756b]">Browse the append-only history in pages of 100 events.</p></div><div className="flex gap-2"><button onClick={() => void auditQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b]" data-testid="button-refresh-super-admin-audit">Refresh</button><button onClick={() => setAuditPage(page => Math.max(0, page - 1))} disabled={auditPage === 0} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40" data-testid="button-newer-audit-page">Newer</button><span className="self-center text-xs text-[#748279]" data-testid="text-audit-page">Page {auditPage + 1}</span><button onClick={() => setAuditPage(page => page + 1)} disabled={auditLogs.length < 100} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold text-[#36564b] disabled:opacity-40" data-testid="button-older-audit-page">Older</button></div></div>
            {auditQuery.isLoading ? <p className="py-8 text-center text-sm text-[#748279]" role="status" data-testid="status-audit-loading">Loading audit history…</p>
              : auditQuery.isError ? <p className="rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert" data-testid="error-audit-history">Audit history could not be loaded. Retry to see the latest records.</p>
                : <div className="max-h-[620px] divide-y divide-[#eee9de] overflow-y-auto">
                  {auditLogs.map((entry, index) => <article key={entry.id} className="py-3" data-testid={`row-audit-log-${entry.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-[#edf2ed] px-2.5 py-1 text-[10px] font-bold text-[#36564b]">{entry.action}</span><time className="text-[10px] text-[#839087]">{new Date(entry.createdAt).toLocaleString()}</time></div>
                    <p className="mt-2 break-all text-xs text-[#536b61]">{entry.detail || "No additional detail"}</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-[#839087]">Actor: {entry.actorId} · Target: {entry.targetId}</p>
                    {index === 0 && <span className="sr-only">Most recent audit event</span>}
                  </article>)}
                  {!auditLogs.length && <p className="py-8 text-center text-sm text-[#748279]" data-testid="text-no-audit-logs">No audit events are recorded yet.</p>}
                </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
