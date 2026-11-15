import { useState, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSuperAdminLegalPolicyVersionsQueryKey,
  useCreateSuperAdminLegalPolicyDraft,
  useGetSuperAdminLegalPolicyVersions,
  usePublishSuperAdminLegalPolicyVersion,
  useUpdateSuperAdminLegalPolicyDraft,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import type { LegalPolicyKey, LegalPolicyTranslations } from "@workspace/api-client-react";

const policyOptions: { value: LegalPolicyKey; label: string }[] = [
  { value: "terms_of_use", label: "Terms of Use" },
  { value: "privacy_policy", label: "Privacy Policy" },
  { value: "booking_policy", label: "Booking Policy" },
  { value: "cancellation_policy", label: "Cancellation Policy" },
  { value: "refund_policy", label: "Refund Policy" },
];
const locales = [
  { key: "en", label: "English" },
  { key: "ar", label: "Arabic" },
  { key: "ku", label: "Sorani Kurdish" },
] as const;
type Locale = typeof locales[number]["key"];
type Translation = LegalPolicyTranslations[Locale];

const emptyTranslation = (): Translation => ({ title: "", introduction: "", body: "" });
const emptyTranslations = (): LegalPolicyTranslations => ({
  en: emptyTranslation(),
  ar: emptyTranslation(),
  ku: emptyTranslation(),
});
const localDateTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  .toISOString().slice(0, 16);
const policyLabel = (key: LegalPolicyKey) => policyOptions.find(item => item.value === key)?.label ?? key;
const panel = "rounded-2xl border border-[#e1dccf] bg-[#fffdf7] p-5 sm:p-6";
const input = "w-full rounded-lg border border-[#d8d2c4] bg-white px-3 py-2 text-sm text-[#173d35]";

export default function SuperAdminPoliciesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const versionsQuery = useGetSuperAdminLegalPolicyVersions({
    query: { enabled: isLoaded && !!isSignedIn },
  });
  const createDraft = useCreateSuperAdminLegalPolicyDraft();
  const updateDraft = useUpdateSuperAdminLegalPolicyDraft();
  const publishVersion = usePublishSuperAdminLegalPolicyVersion();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [policyKey, setPolicyKey] = useState<LegalPolicyKey>("terms_of_use");
  const [version, setVersion] = useState("v2");
  const [effectiveAt, setEffectiveAt] = useState(localDateTime);
  const [translations, setTranslations] = useState<LegalPolicyTranslations>(emptyTranslations);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);

  const resetDraft = () => {
    setEditingId(null);
    setPolicyKey("terms_of_use");
    setVersion("v2");
    setEffectiveAt(localDateTime());
    setTranslations(emptyTranslations());
    setFeedback("");
    setFeedbackError(false);
  };

  const editDraft = (row: NonNullable<typeof versionsQuery.data>[number]) => {
    setEditingId(row.id);
    setPolicyKey(row.policyKey);
    setVersion(row.version);
    setEffectiveAt(new Date(row.effectiveAt).toISOString().slice(0, 16));
    setTranslations(row.translations);
    setFeedback("");
    setFeedbackError(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    setFeedbackError(false);
    const effectiveDate = new Date(effectiveAt);
    if (!Number.isFinite(effectiveDate.getTime())) {
      setFeedback("Choose a valid effective date.");
      setFeedbackError(true);
      return;
    }
    try {
      if (editingId) {
        await updateDraft.mutateAsync({
          id: editingId,
          data: { translations, effectiveAt: effectiveDate.toISOString() },
        });
        setFeedback("Draft saved. Published versions cannot be changed.");
      } else {
        const created = await createDraft.mutateAsync({
          data: {
            policyKey,
            version: version.trim(),
            translations,
            effectiveAt: effectiveDate.toISOString(),
          },
        });
        setEditingId(created.id);
        setFeedback("Draft saved. Complete every language before publishing.");
      }
      await queryClient.invalidateQueries({ queryKey: getGetSuperAdminLegalPolicyVersionsQueryKey() });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The policy draft could not be saved.");
      setFeedbackError(true);
    }
  };

  const publish = async (id: string) => {
    if (!window.confirm("Publish this version? It will become immutable and may require members to accept it again.")) return;
    setFeedback("");
    setFeedbackError(false);
    try {
      await publishVersion.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getGetSuperAdminLegalPolicyVersionsQueryKey() });
      setFeedback("Policy version published. Members will be asked to accept it when it becomes effective.");
      if (editingId === id) resetDraft();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The policy version could not be published.");
      setFeedbackError(true);
    }
  };

  if (!isLoaded) return <main className="min-h-screen bg-[#f5f2e9] px-5 py-16"><p role="status" className="mx-auto max-w-5xl text-sm text-[#536b61]">Loading policy controls…</p></main>;
  if (!isSignedIn) return <main className="min-h-screen bg-[#f5f2e9] px-5 py-16"><section className="mx-auto max-w-xl rounded-3xl border border-[#ded8c9] bg-[#fffdf7] p-8 text-center"><h1 className="font-display text-2xl font-bold text-[#173d35]">Sign in required</h1><p className="mt-3 text-sm text-[#60756b]">Sign in with an authorized MaydanGo Super Admin account to manage policy versions.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9]">Sign in</Link></section></main>;

  const versions = versionsQuery.data ?? [];
  return (
    <main className="min-h-screen bg-[#f5f2e9] px-4 py-8 text-[#173d35] sm:px-7 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#ad6a4b]">Super Admin</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold">Policy version history</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60756b]">Create drafts, review all three language versions, then publish. Published versions remain read-only and are retained for consent history. App publication does not replace review by qualified Iraqi legal advisers.</p>
          </div>
          <Link href="/super-admin" className="rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-4 py-2.5 text-sm font-bold text-[#36564b]">Back to Super Admin</Link>
        </header>

        <section className={panel} aria-labelledby="policy-draft-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="policy-draft-title" className="font-display text-xl font-bold">{editingId ? "Edit policy draft" : "Create a policy draft"}</h2>
              <p className="mt-1 text-sm text-[#60756b]">Publishing requires a title, introduction, and policy text in English, Arabic, and Sorani Kurdish.</p>
            </div>
            {editingId && <button type="button" onClick={resetDraft} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold">New draft</button>}
          </div>
          <form onSubmit={event => void saveDraft(event)} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1 text-sm font-semibold">Policy
                <select value={policyKey} disabled={!!editingId} onChange={event => setPolicyKey(event.target.value as LegalPolicyKey)} className={input}>
                  {policyOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold">Version
                <input required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,39}" disabled={!!editingId} value={version} onChange={event => setVersion(event.target.value)} className={input} />
              </label>
              <label className="space-y-1 text-sm font-semibold">Effective date and time
                <input required type="datetime-local" value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} className={input} />
              </label>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {locales.map(locale => (
                <fieldset key={locale.key} className="space-y-3 rounded-xl border border-[#e1dccf] p-4">
                  <legend className="px-1 text-sm font-bold">{locale.label}</legend>
                  <label className="block space-y-1 text-xs font-semibold">Title
                    <input required maxLength={160} value={translations[locale.key].title} onChange={event => setTranslations(value => ({ ...value, [locale.key]: { ...value[locale.key], title: event.target.value } }))} className={input} />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">Introduction
                    <textarea required maxLength={5000} rows={3} value={translations[locale.key].introduction} onChange={event => setTranslations(value => ({ ...value, [locale.key]: { ...value[locale.key], introduction: event.target.value } }))} className={input} />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">Policy text
                    <textarea required maxLength={40000} rows={12} value={translations[locale.key].body} onChange={event => setTranslations(value => ({ ...value, [locale.key]: { ...value[locale.key], body: event.target.value } }))} className={input} />
                  </label>
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={createDraft.isPending || updateDraft.isPending} className="rounded-full bg-[#174d43] px-5 py-2.5 text-sm font-bold text-[#fff9e9] disabled:opacity-50">
                {createDraft.isPending || updateDraft.isPending ? "Saving…" : "Save draft"}
              </button>
              {feedback && <p role={feedbackError ? "alert" : "status"} className={`text-sm ${feedbackError ? "text-[#9a4435]" : "text-[#36564b]"}`}>{feedback}</p>}
            </div>
          </form>
        </section>

        <section className={panel} aria-labelledby="policy-history-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 id="policy-history-title" className="font-display text-xl font-bold">All policy versions</h2><p className="mt-1 text-sm text-[#60756b]">Published content cannot be edited or deleted.</p></div>
            <button type="button" onClick={() => void versionsQuery.refetch()} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold">Refresh</button>
          </div>
          {versionsQuery.isLoading ? <p className="py-8 text-center text-sm text-[#748279]" role="status">Loading policy history…</p>
            : versionsQuery.isError ? <p className="mt-4 rounded-xl border border-[#e8c5ba] bg-[#fff5f1] p-4 text-sm text-[#9a4435]" role="alert">Policy history could not be loaded. Confirm Super Admin access and retry.</p>
              : <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead><tr className="border-b border-[#e1dccf] text-xs uppercase tracking-wide text-[#748279]"><th className="px-2 py-3">Policy</th><th className="px-2 py-3">Version</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Effective</th><th className="px-2 py-3">Action</th></tr></thead>
                  <tbody>
                    {versions.map(row => <tr key={row.id} className="border-b border-[#eee9dd]">
                      <td className="px-2 py-3 font-semibold">{policyLabel(row.policyKey)}</td>
                      <td className="px-2 py-3">{row.version}</td>
                      <td className="px-2 py-3 capitalize">{row.status}</td>
                      <td className="px-2 py-3">{new Date(row.effectiveAt).toLocaleString()}</td>
                      <td className="px-2 py-3">
                        {row.status === "draft" ? <div className="flex gap-2">
                          <button type="button" onClick={() => editDraft(row)} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-bold">Edit draft</button>
                          <button type="button" disabled={publishVersion.isPending} onClick={() => void publish(row.id)} className="rounded-lg bg-[#174d43] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Publish</button>
                        </div> : <Link href={`/policies/${row.policyKey}?version=${encodeURIComponent(row.version)}`} className="text-xs font-semibold text-[#174d43] underline underline-offset-2">View published version</Link>}
                      </td>
                    </tr>)}
                    {!versions.length && <tr><td colSpan={5} className="px-2 py-8 text-center text-sm text-[#748279]">No policy versions have been created.</td></tr>}
                  </tbody>
                </table>
              </div>}
        </section>
      </div>
    </main>
  );
}
