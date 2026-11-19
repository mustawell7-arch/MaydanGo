import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Dumbbell,
  Languages,
  LoaderCircle,
  Plus,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  getGetSuperAdminFitnessChallengesQueryKey,
  useArchiveSuperAdminFitnessChallenge,
  useCreateSuperAdminFitnessChallenge,
  useGetSuperAdminFitnessChallenges,
  usePublishSuperAdminFitnessChallenge,
  useUpdateSuperAdminFitnessChallenge,
  type FitnessChallenge,
  type FitnessChallengeInput,
} from "@workspace/api-client-react";

type LanguageKey = "en" | "ar" | "ku";
type LocalizedDraft = { en: string; ar: string; ku: string };
type ChallengeDraft = {
  localizedTitle: LocalizedDraft;
  localizedDescription: LocalizedDraft;
  startDate: string;
  endDate: string;
  goalActiveDays: string;
};
type FilterKey = "all" | "draft" | "published" | "archived";

const languages: { key: LanguageKey; label: string; native: string; dir: "ltr" | "rtl" }[] = [
  { key: "en", label: "English", native: "English", dir: "ltr" },
  { key: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
  { key: "ku", label: "Sorani Kurdish", native: "کوردی", dir: "rtl" },
];
const emptyDraft: ChallengeDraft = {
  localizedTitle: { en: "", ar: "", ku: "" },
  localizedDescription: { en: "", ar: "", ku: "" },
  startDate: "",
  endDate: "",
  goalActiveDays: "12",
};
const statusLabels: Record<FitnessChallenge["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function toDraft(challenge: FitnessChallenge): ChallengeDraft {
  return {
    localizedTitle: { ...challenge.localizedTitle },
    localizedDescription: { ...challenge.localizedDescription },
    startDate: challenge.startDate,
    endDate: challenge.endDate,
    goalActiveDays: String(challenge.goalActiveDays),
  };
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function initialFormError(draft: ChallengeDraft) {
  const titleMissing = languages.some(language => !draft.localizedTitle[language.key].trim());
  const descriptionMissing = languages.some(language => !draft.localizedDescription[language.key].trim());
  if (titleMissing || descriptionMissing) return "Complete every title and description in English, Arabic and Sorani Kurdish.";
  if (!draft.startDate || !draft.endDate) return "Add both challenge dates before saving.";
  if (draft.endDate < draft.startDate) return "The end date must be on or after the start date.";
  const goal = Number(draft.goalActiveDays);
  if (!Number.isInteger(goal) || goal < 1 || goal > 366) return "The active-day goal must be a whole number from 1 to 366.";
  return "";
}

export default function FitnessChallengesAdminPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = getGetSuperAdminFitnessChallengesQueryKey();
  const challengesQuery = useGetSuperAdminFitnessChallenges({
    query: { enabled: isLoaded && !!isSignedIn, queryKey },
  });
  const createChallenge = useCreateSuperAdminFitnessChallenge();
  const updateChallenge = useUpdateSuperAdminFitnessChallenge();
  const publishChallenge = usePublishSuperAdminFitnessChallenge();
  const archiveChallenge = useArchiveSuperAdminFitnessChallenge();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FitnessChallenge | null>(null);
  const [draft, setDraft] = useState<ChallengeDraft>(emptyDraft);
  const [activeLanguage, setActiveLanguage] = useState<LanguageKey>("en");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pendingAction, setPendingAction] = useState<{ kind: "publish" | "archive"; challenge: FitnessChallenge } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const challenges = challengesQuery.data ?? [];
  const counts = useMemo(() => ({
    all: challenges.length,
    draft: challenges.filter(item => item.status === "draft").length,
    published: challenges.filter(item => item.status === "published").length,
    archived: challenges.filter(item => item.status === "archived").length,
  }), [challenges]);
  const visibleChallenges = useMemo(() => {
    const selected = filter === "all" ? challenges : challenges.filter(item => item.status === filter);
    return [...selected].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [challenges, filter]);
  const isSaving = createChallenge.isPending || updateChallenge.isPending;
  const isActionPending = publishChallenge.isPending || archiveChallenge.isPending;

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...emptyDraft, localizedTitle: { ...emptyDraft.localizedTitle }, localizedDescription: { ...emptyDraft.localizedDescription } });
    setActiveLanguage("en");
    setFormError("");
    setFeedback("");
    setEditorOpen(true);
  };
  const openEdit = (challenge: FitnessChallenge) => {
    if (challenge.status !== "draft") return;
    setEditing(challenge);
    setDraft(toDraft(challenge));
    setActiveLanguage("en");
    setFormError("");
    setFeedback("");
    setEditorOpen(true);
  };
  const closeEditor = () => {
    if (isSaving) return;
    setEditorOpen(false);
    setEditing(null);
    setFormError("");
  };
  const invalidateChallenges = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = initialFormError(draft);
    if (validation) {
      setFormError(validation);
      return;
    }
    const data: FitnessChallengeInput = {
      localizedTitle: {
        en: draft.localizedTitle.en.trim(),
        ar: draft.localizedTitle.ar.trim(),
        ku: draft.localizedTitle.ku.trim(),
      },
      localizedDescription: {
        en: draft.localizedDescription.en.trim(),
        ar: draft.localizedDescription.ar.trim(),
        ku: draft.localizedDescription.ku.trim(),
      },
      startDate: draft.startDate,
      endDate: draft.endDate,
      goalActiveDays: Number(draft.goalActiveDays),
    };
    setFormError("");
    setFeedback("");
    const onSuccess = async () => {
      await invalidateChallenges();
      setEditorOpen(false);
      setEditing(null);
      setFeedback(editing ? "Draft changes saved." : "Challenge draft created.");
    };
    const onError = () => setFormError("The draft could not be saved. Check your access and try again.");
    if (editing) {
      updateChallenge.mutate({ challengeId: editing.id, data }, { onSuccess, onError });
    } else {
      createChallenge.mutate({ data }, { onSuccess, onError });
    }
  };
  const confirmAction = () => {
    if (!pendingAction) return;
    setConfirming(true);
    setFeedback("");
    const finish = async () => {
      await invalidateChallenges();
      setFeedback(pendingAction.kind === "publish"
        ? "Challenge published. Published details can no longer be edited."
        : "Challenge archived. Its record has been preserved.");
      setPendingAction(null);
      setConfirming(false);
    };
    const fail = () => {
      setFeedback(pendingAction.kind === "publish"
        ? "This challenge could not be published. Review the draft and try again."
        : "This challenge could not be archived. Check your access and try again.");
      setConfirming(false);
    };
    if (pendingAction.kind === "publish") {
      publishChallenge.mutate({ challengeId: pendingAction.challenge.id }, { onSuccess: finish, onError: fail });
    } else {
      archiveChallenge.mutate({ challengeId: pendingAction.challenge.id }, { onSuccess: finish, onError: fail });
    }
  };
  const updateLocalized = (field: "localizedTitle" | "localizedDescription", key: LanguageKey, value: string) => {
    setDraft(previous => ({ ...previous, [field]: { ...previous[field], [key]: value } }));
  };

  if (!isLoaded || (isSignedIn && challengesQuery.isLoading)) {
    return <main className="min-h-[100dvh] bg-[#f3f1e8] px-5 py-10 text-[#1e3c36]" data-testid="page-fitness-challenges-loading">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6" role="status">
        <div className="h-4 w-40 rounded bg-[#dce3d8]" /><div className="h-14 max-w-xl rounded-xl bg-[#dce3d8]" />
        <div className="grid gap-4 md:grid-cols-3"><div className="h-28 rounded-2xl bg-[#e2e7dc]" /><div className="h-28 rounded-2xl bg-[#e2e7dc]" /><div className="h-28 rounded-2xl bg-[#e2e7dc]" /></div>
        <div className="h-72 rounded-3xl bg-[#e2e7dc]" />
      </div>
      <span className="sr-only">Loading challenge definitions…</span>
    </main>;
  }

  if (!isSignedIn) {
    return <main className="min-h-[100dvh] bg-[#f3f1e8] px-5 py-16 text-[#1e3c36]">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-[#d9dfd4] bg-[#fcfbf6] p-8 text-center shadow-[0_20px_60px_-45px_rgba(26,55,45,.35)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8eee4] text-[#285a4d]"><ShieldCheck size={25} /></div>
        <h1 className="mt-5 font-display text-2xl font-bold">Sign in required</h1>
        <p className="mt-3 text-sm leading-6 text-[#63746b]">Sign in with an authorized MaydanGo Super Admin account to manage challenge definitions.</p>
        <Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-[#245b4d] px-5 py-3 text-sm font-bold text-[#fbfaf3]">Sign in</Link>
      </section>
    </main>;
  }

  if (challengesQuery.isError) {
    return <main className="min-h-[100dvh] bg-[#f3f1e8] px-5 py-16 text-[#1e3c36]">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-[#e4ccc2] bg-[#fcfbf6] p-8 text-center">
        <CircleAlert className="mx-auto text-[#a14b3b]" size={28} />
        <h1 className="mt-4 font-display text-2xl font-bold">Challenges could not be loaded</h1>
        <p className="mt-3 text-sm leading-6 text-[#63746b]">The definitions are protected by Super Admin access. Retry to confirm your access and load the current records.</p>
        <button type="button" onClick={() => void challengesQuery.refetch()} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#245b4d] px-5 py-3 text-sm font-bold text-[#fbfaf3]" data-testid="button-retry-challenges"><RotateCw size={15} /> Retry</button>
      </section>
    </main>;
  }

  return (
    <main className="min-h-[100dvh] bg-[#f3f1e8] px-4 py-5 text-[#1e3c36] sm:px-7 sm:py-8" data-testid="page-fitness-challenges">
      <div className="mx-auto max-w-[1380px]">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/super-admin" className="group inline-flex items-center gap-2 text-sm font-semibold text-[#61766b] transition hover:text-[#245b4d]" data-testid="link-challenges-back-admin">
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Super Admin workspace
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-[#dbe0d5] bg-[#faf9f3] px-3 py-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#6b7e72]">
            <span className="h-2 w-2 rounded-full bg-[#4e8b69]" /> Internal · Iraq
          </div>
        </div>

        <header className="relative mb-7 overflow-hidden rounded-[2rem] bg-[#214c42] px-6 py-8 text-[#f8f5e9] shadow-[0_22px_60px_-42px_rgba(24,54,46,.55)] sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border border-[#d9e2cd]/15" />
          <div className="pointer-events-none absolute -right-1 -top-10 h-52 w-52 rounded-full border border-[#d9e2cd]/15" />
          <div className="relative flex flex-wrap items-end justify-between gap-7">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#d4bb84]"><Dumbbell size={14} /> MaydanGo · Challenge studio</p>
              <h1 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">Fitness challenges</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d3dfd3] sm:text-base">Shape clear, welcoming challenge definitions for members across Iraq. Keep the public promise precise in all three languages.</p>
            </div>
            <button type="button" onClick={openCreate} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#dfbf7d] px-5 py-3 text-sm font-bold text-[#243d34] shadow-sm transition hover:bg-[#ebce91]" data-testid="button-create-challenge">
              <Plus size={17} strokeWidth={2.5} /> New challenge
            </button>
          </div>
          <div className="relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#f2f4e9]/15 pt-4 text-xs text-[#d3dfd3]">
            <span className="inline-flex items-center gap-2"><Languages size={14} /> English · العربية · کوردی</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#c1cdbd] sm:block" />
            <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> Definition review only</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#c1cdbd] sm:block" />
            <span>Member progress is private and not shown here.</span>
          </div>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <article className="relative overflow-hidden rounded-2xl border border-[#dde2d8] bg-[#fbfaf5] p-4 sm:p-5">
            <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#718176]">In this workspace</p><p className="mt-2 font-display text-3xl font-bold">{counts.all}</p></div><div className="rounded-xl bg-[#e8eee4] p-2.5 text-[#416c5b]"><Activity size={19} /></div></div>
            <p className="mt-2 text-xs text-[#78877e]">Challenge definitions, all states</p>
          </article>
          <article className="rounded-2xl border border-[#dde2d8] bg-[#fbfaf5] p-4 sm:p-5">
            <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#718176]">Needs review</p><p className="mt-2 font-display text-3xl font-bold">{counts.draft}</p></div><div className="rounded-xl bg-[#f2ead9] p-2.5 text-[#947447]"><Clock3 size={19} /></div></div>
            <p className="mt-2 text-xs text-[#78877e]">Unpublished drafts only</p>
          </article>
          <article className="rounded-2xl border border-[#dde2d8] bg-[#fbfaf5] p-4 sm:p-5">
            <div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#718176]">Currently published</p><p className="mt-2 font-display text-3xl font-bold">{counts.published}</p></div><div className="rounded-xl bg-[#e1ede4] p-2.5 text-[#426b51]"><Check size={19} /></div></div>
            <p className="mt-2 text-xs text-[#78877e]">Archive to stop a challenge</p>
          </article>
        </div>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce1d7] bg-[#fbfaf5] shadow-[0_20px_55px_-45px_rgba(24,54,46,.4)]" aria-labelledby="challenge-list-title">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e4e6dc] px-5 py-5 sm:px-7">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#9a8053]">Definition register</p><h2 id="challenge-list-title" className="mt-1 font-display text-2xl font-bold">All challenges</h2><p className="mt-1 text-xs text-[#7a887e]">Review the terms and schedule. Member-level activity is intentionally excluded.</p></div>
            <button type="button" onClick={() => void challengesQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-[#dce1d7] bg-[#f6f6ef] px-3 py-2 text-xs font-bold text-[#526c60] transition hover:border-[#a9bcaa]" data-testid="button-refresh-challenges"><RotateCw size={14} /> Refresh</button>
          </div>

          {feedback && <p className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm sm:mx-7 ${feedback.includes("could not") ? "border-[#e6c7bd] bg-[#fff4ef] text-[#9c4637]" : "border-[#cbdcca] bg-[#edf5ed] text-[#315f43]"}`} role={feedback.includes("could not") ? "alert" : "status"} data-testid="status-challenge-feedback">{feedback}</p>}

          <div className="flex flex-wrap gap-2 px-5 pt-5 sm:px-7" role="tablist" aria-label="Filter challenges">
            {([
              ["all", "All", counts.all],
              ["draft", "Drafts", counts.draft],
              ["published", "Published", counts.published],
              ["archived", "Archived", counts.archived],
            ] as [FilterKey, string, number][]).map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition ${filter === key ? "bg-[#28584b] text-[#fbfaf3]" : "bg-[#f0f1e9] text-[#718176] hover:bg-[#e8ece3]"}`} data-testid={`tab-challenges-${key}`}>
                {label}<span className={filter === key ? "text-[#d9c794]" : "text-[#9ba59a]"}>{count}</span>
              </button>
            ))}
          </div>

          {visibleChallenges.length === 0 ? (
            <div className="mx-5 mb-5 mt-4 flex flex-col items-center rounded-2xl border border-dashed border-[#cfd8cc] bg-[#f7f7f0] px-6 py-12 text-center sm:mx-7">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9eee5] text-[#527363]"><Dumbbell size={21} /></div>
              <h3 className="mt-4 font-display text-xl font-bold">{filter === "all" ? "A clear starting line" : `No ${filter} challenges`}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#748279]">{filter === "all" ? "No challenge definitions yet. Create a draft, complete every translation, then review it before publishing." : "There are no challenge definitions in this state right now."}</p>
              {filter === "all" && <button type="button" onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#28584b] px-4 py-2.5 text-sm font-bold text-[#fbfaf3]" data-testid="button-create-first-challenge"><Plus size={15} /> Create first draft</button>}
            </div>
          ) : (
            <div className="grid gap-3 p-5 sm:p-7 sm:pt-4">
              {visibleChallenges.map(challenge => (
                <article key={challenge.id} className="group rounded-2xl border border-[#e1e4da] bg-[#fffef9] p-4 transition hover:border-[#bfcebf] sm:p-5" data-testid={`card-fitness-challenge-${challenge.id}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${challenge.status === "draft" ? "bg-[#f4ead7] text-[#8c6b38]" : challenge.status === "published" ? "bg-[#e4eee3] text-[#3d6d4c]" : "bg-[#ecece6] text-[#74786e]"}`} data-testid={`status-challenge-${challenge.id}`}>{statusLabels[challenge.status]}</span>
                        <span className="font-mono text-[10px] text-[#a0a99f]">ID {challenge.id}</span>
                      </div>
                      <h3 className="mt-3 font-display text-xl font-bold leading-snug text-[#26483e]" data-testid={`text-challenge-title-${challenge.id}`}>{challenge.localizedTitle.en}</h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#728078]">{challenge.localizedDescription.en}</p>
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#66796d]">
                        <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-[#9b8153]" />{formatDate(challenge.startDate)} <span className="text-[#a8afa4]">to</span> {formatDate(challenge.endDate)}</span>
                        <span className="inline-flex items-center gap-1.5"><Activity size={14} className="text-[#668474]" />{challenge.goalActiveDays} active days</span>
                        <span className="inline-flex items-center gap-1.5"><Languages size={14} className="text-[#8d8067]" />3 languages</span>
                      </div>
                      <div className="mt-4 grid gap-2 border-t border-[#eef0e8] pt-3 md:grid-cols-2">
                        <p className="text-xs leading-5 text-[#7a867e]"><span className="mb-0.5 block font-bold text-[#596d61]">العربية</span><span dir="rtl" className="block text-right">{challenge.localizedTitle.ar} — {challenge.localizedDescription.ar}</span></p>
                        <p className="text-xs leading-5 text-[#7a867e]"><span className="mb-0.5 block font-bold text-[#596d61]">کوردیی سۆرانی</span><span dir="rtl" className="block text-right">{challenge.localizedTitle.ku} — {challenge.localizedDescription.ku}</span></p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#eef0e8] pt-3 lg:border-0 lg:pt-0">
                      {challenge.status === "draft" && <>
                        <button type="button" onClick={() => openEdit(challenge)} className="rounded-xl border border-[#dce2d8] px-3.5 py-2 text-xs font-bold text-[#4c675b] transition hover:bg-[#f3f5ef]" data-testid={`button-edit-challenge-${challenge.id}`}>Edit draft</button>
                        <button type="button" onClick={() => setPendingAction({ kind: "publish", challenge })} className="inline-flex items-center gap-1.5 rounded-xl bg-[#28584b] px-3.5 py-2 text-xs font-bold text-[#fbfaf3] transition hover:bg-[#1e493e]" data-testid={`button-publish-challenge-${challenge.id}`}>Publish <ArrowUpRight size={13} /></button>
                      </>}
                      {challenge.status === "published" && <button type="button" onClick={() => setPendingAction({ kind: "archive", challenge })} className="inline-flex items-center gap-1.5 rounded-xl border border-[#ddc8bb] px-3.5 py-2 text-xs font-bold text-[#8d5143] transition hover:bg-[#fff3ed]" data-testid={`button-archive-challenge-${challenge.id}`}><Archive size={13} /> Archive</button>}
                      {challenge.status === "archived" && <span className="px-2 text-xs font-medium text-[#879087]">Record retained</span>}
                    </div>
                  </div>
                  <p className="mt-4 border-t border-[#f0f1e9] pt-3 text-[10px] text-[#9aa39a]">Updated {new Date(challenge.updatedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          )}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 px-1 py-5 text-[11px] text-[#849087]">
          <p className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-[#61806d]" /> Challenge definitions only. Individual member progress remains private.</p>
          <Link href="/super-admin" className="inline-flex items-center gap-1 font-semibold text-[#587365] hover:text-[#28584b]">Super Admin home <ArrowUpRight size={12} /></Link>
        </footer>
      </div>

      {editorOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#152b25]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="challenge-editor-title" className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-t-[1.75rem] border border-[#dce1d7] bg-[#fbfaf5] shadow-2xl sm:rounded-[1.75rem]" data-testid="dialog-challenge-editor">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e4e6dc] bg-[#fbfaf5]/95 px-5 py-4 backdrop-blur sm:px-7">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#9a8053]">{editing ? "Draft editor" : "New definition"}</p><h2 id="challenge-editor-title" className="mt-1 font-display text-2xl font-bold">{editing ? "Edit challenge draft" : "Create a challenge"}</h2><p className="mt-1 text-xs text-[#7c887f]">All fields are required in English, Arabic and Sorani Kurdish.</p></div>
            <button type="button" onClick={closeEditor} disabled={isSaving} aria-label="Close editor" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#dce1d7] text-[#607267] hover:bg-[#f0f2ea] disabled:opacity-40" data-testid="button-close-challenge-editor"><X size={17} /></button>
          </div>
          <form onSubmit={submitDraft} className="space-y-6 px-5 py-5 sm:px-7 sm:py-6" data-testid="form-challenge-editor">
            <section className="rounded-2xl border border-[#e0e4da] bg-[#f5f6ef] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Title and description</h3><p className="mt-1 text-xs text-[#7c887f]">Review the meaning, not only the spelling, across translations.</p></div>
                <div className="flex rounded-full bg-[#e8ebe2] p-1" role="tablist" aria-label="Challenge language">
                  {languages.map(language => <button key={language.key} type="button" role="tab" aria-selected={activeLanguage === language.key} onClick={() => setActiveLanguage(language.key)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${activeLanguage === language.key ? "bg-[#28584b] text-white shadow-sm" : "text-[#6d7e73]"}`} data-testid={`tab-challenge-language-${language.key}`}>{language.native}</button>)}
                </div>
              </div>
              {languages.filter(language => language.key === activeLanguage).map(language => <div key={language.key} lang={language.key === "ku" ? "ckb" : language.key} dir={language.dir} className="space-y-4">
                <label className="block text-xs font-bold text-[#52695d]" htmlFor={`challenge-title-${language.key}`}>{language.label} title
                  <input id={`challenge-title-${language.key}`} required maxLength={160} value={draft.localizedTitle[language.key]} onChange={event => updateLocalized("localizedTitle", language.key, event.target.value)} placeholder={language.key === "en" ? "A small step, every day" : language.key === "ar" ? "عنوان التحدي" : "ناونیشانی چالاکی"} className="mt-1.5 w-full rounded-xl border border-[#d5ddd3] bg-[#fffef9] px-3.5 py-3 text-sm font-medium text-[#28483e] outline-none transition placeholder:text-[#b0b8ad] focus:border-[#789888]" data-testid={`input-challenge-title-${language.key}`} />
                </label>
                <label className="block text-xs font-bold text-[#52695d]" htmlFor={`challenge-description-${language.key}`}>{language.label} description
                  <textarea id={`challenge-description-${language.key}`} required maxLength={2000} rows={4} value={draft.localizedDescription[language.key]} onChange={event => updateLocalized("localizedDescription", language.key, event.target.value)} placeholder={language.key === "en" ? "Explain the challenge in clear, encouraging language." : language.key === "ar" ? "اكتب وصفاً واضحاً ومشجعاً للتحدي." : "بە ڕوونی و بە شێوەیەکی هاندەر چالاکییەکە ڕوون بکەرەوە."} className="mt-1.5 w-full resize-y rounded-xl border border-[#d5ddd3] bg-[#fffef9] px-3.5 py-3 text-sm leading-6 text-[#28483e] outline-none transition placeholder:text-[#b0b8ad] focus:border-[#789888]" data-testid={`input-challenge-description-${language.key}`} />
                  <span className="mt-1 block text-right text-[10px] font-normal text-[#9ba69c]">{draft.localizedDescription[language.key].length}/2000</span>
                </label>
              </div>)}
            </section>

            <section>
              <div className="mb-3"><h3 className="text-sm font-bold">Schedule and goal</h3><p className="mt-1 text-xs text-[#7c887f]">Dates use Iraq calendar days. Goal is the required number of active days.</p></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-bold text-[#52695d]">Start date
                  <input type="date" required value={draft.startDate} onChange={event => setDraft(previous => ({ ...previous, startDate: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#d5ddd3] bg-[#fffef9] px-3 py-3 text-sm font-medium outline-none focus:border-[#789888]" data-testid="input-challenge-start-date" />
                </label>
                <label className="text-xs font-bold text-[#52695d]">End date
                  <input type="date" required min={draft.startDate || undefined} value={draft.endDate} onChange={event => setDraft(previous => ({ ...previous, endDate: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#d5ddd3] bg-[#fffef9] px-3 py-3 text-sm font-medium outline-none focus:border-[#789888]" data-testid="input-challenge-end-date" />
                </label>
                <label className="text-xs font-bold text-[#52695d]">Active-day goal
                  <div className="relative mt-1.5"><input type="number" required min={1} max={366} step={1} value={draft.goalActiveDays} onChange={event => setDraft(previous => ({ ...previous, goalActiveDays: event.target.value }))} className="w-full rounded-xl border border-[#d5ddd3] bg-[#fffef9] px-3 py-3 pr-16 text-sm font-medium outline-none focus:border-[#789888]" data-testid="input-challenge-active-days" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#89958b]">days</span></div>
                </label>
              </div>
            </section>

            {formError && <p className="rounded-xl border border-[#e7c7bc] bg-[#fff3ed] px-4 py-3 text-sm leading-5 text-[#9c4637]" role="alert" data-testid="error-challenge-form">{formError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e6dc] pt-4">
              <p className="max-w-xs text-[11px] leading-5 text-[#7c887f]">Saving creates or updates a draft only. Publishing is a separate review step.</p>
              <div className="flex gap-2">
                <button type="button" onClick={closeEditor} disabled={isSaving} className="rounded-xl border border-[#d8ded4] px-4 py-2.5 text-sm font-bold text-[#607267] hover:bg-[#f1f2eb] disabled:opacity-50" data-testid="button-cancel-challenge-editor">Cancel</button>
                <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-[#28584b] px-4 py-2.5 text-sm font-bold text-[#fbfaf3] transition hover:bg-[#1e493e] disabled:cursor-wait disabled:opacity-60" data-testid="button-save-challenge">
                  {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{isSaving ? "Saving…" : editing ? "Save draft" : "Create draft"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>}

      {pendingAction && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#152b25]/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !confirming) setPendingAction(null); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="challenge-confirm-title" className="w-full max-w-md rounded-[1.75rem] border border-[#dce1d7] bg-[#fbfaf5] p-6 shadow-2xl" data-testid="dialog-challenge-confirm">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${pendingAction.kind === "publish" ? "bg-[#e4eee3] text-[#426b51]" : "bg-[#f3e8df] text-[#995442]"}`}>{pendingAction.kind === "publish" ? <Check size={20} /> : <Archive size={19} />}</div>
          <h2 id="challenge-confirm-title" className="mt-4 font-display text-2xl font-bold">{pendingAction.kind === "publish" ? "Publish this challenge?" : "Archive this challenge?"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#68796f]"><strong className="text-[#315347]">{pendingAction.challenge.localizedTitle.en}</strong>. {pendingAction.kind === "publish" ? "Publishing makes this definition available to members; it cannot be edited afterward." : "Archiving stops the challenge without deleting its record. It cannot be edited afterward."}</p>
          <p className="mt-3 rounded-xl border border-[#e3e5dc] bg-[#f5f6ef] px-3.5 py-3 text-xs leading-5 text-[#748178]">Member progress is private and is not part of this administrative action.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={confirming} onClick={() => setPendingAction(null)} className="rounded-xl border border-[#d8ded4] px-4 py-2.5 text-sm font-bold text-[#607267] hover:bg-[#f1f2eb] disabled:opacity-50" data-testid="button-cancel-challenge-action">Cancel</button>
            <button type="button" disabled={confirming} onClick={confirmAction} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-[#fbfaf3] disabled:opacity-60 ${pendingAction.kind === "publish" ? "bg-[#28584b] hover:bg-[#1e493e]" : "bg-[#945343] hover:bg-[#7f4537]"}`} data-testid="button-confirm-challenge-action">
              {confirming ? <LoaderCircle size={15} className="animate-spin" /> : pendingAction.kind === "publish" ? <Check size={15} /> : <Archive size={15} />}
              {confirming ? "Working…" : pendingAction.kind === "publish" ? "Publish challenge" : "Archive challenge"}
            </button>
          </div>
        </section>
      </div>}
    </main>
  );
}
