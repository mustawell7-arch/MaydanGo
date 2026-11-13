import { useState, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import {
  getGetSuperAdminAccountsQueryKey,
  getGetSuperAdminAuditLogsQueryKey,
  useGetSuperAdminAccounts,
  useGetSuperAdminAuditLogs,
  useUpsertSuperAdminAccount,
  type AdminAccount,
  type AdminRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

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
  const [auditPage, setAuditPage] = useState(0);
  const auditParams = { limit: 100, offset: auditPage * 100 };
  const auditQuery = useGetSuperAdminAuditLogs(auditParams, {
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetSuperAdminAuditLogsQueryKey(auditParams),
    },
  });
  const saveAccount = useUpsertSuperAdminAccount();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("customer_support_admin");
  const [roleChoices, setRoleChoices] = useState<Record<string, AdminRole>>({});
  const [feedback, setFeedback] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminAccountsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSuperAdminAuditLogsQueryKey(auditParams) }),
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
