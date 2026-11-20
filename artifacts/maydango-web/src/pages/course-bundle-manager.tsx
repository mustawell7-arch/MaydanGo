import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOperationCourseBundlesQueryKey,
  useCreateOperationCourseBundle,
  useGetOperationCourseBundles,
  useGetOperationCourses,
  useUpdateOperationCourseBundle,
} from '@workspace/api-client-react';
import type { CourseBundleInput } from '@workspace/api-client-react';

type Language = keyof CourseBundleInput['localizedTitle'];
type Localized = CourseBundleInput['localizedTitle'];
type FormState = {
  localizedTitle: Localized;
  localizedSummary: CourseBundleInput['localizedSummary'];
  courseIds: string[];
  published: boolean;
};

const languages: { id: Language; label: string; direction: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', direction: 'ltr' },
  { id: 'ar', label: 'Iraqi Arabic', direction: 'rtl' },
  { id: 'ku', label: 'Sorani Kurdish', direction: 'rtl' },
];

const emptyForm = (): FormState => ({
  localizedTitle: { en: '', ar: '', ku: '' },
  localizedSummary: { en: '', ar: '', ku: '' },
  courseIds: [],
  published: false,
});

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
}

export default function CourseBundleManagerPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const coursesQuery = useGetOperationCourses({ query: { enabled: isLoaded && !!isSignedIn } });
  const bundlesQuery = useGetOperationCourseBundles({ query: { enabled: isLoaded && !!isSignedIn } });
  const createBundle = useCreateOperationCourseBundle();
  const updateBundle = useUpdateOperationCourseBundle();
  const courses = coursesQuery.data?.courses ?? [];
  const bundles = bundlesQuery.data?.bundles ?? [];
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [feedback, setFeedback] = useState('');

  const selectedBundle = bundles.find(bundle => bundle.id === selectedBundleId);
  useEffect(() => {
    if (!selectedBundle) return;
    setForm({
      localizedTitle: selectedBundle.localizedTitle,
      localizedSummary: selectedBundle.localizedSummary,
      courseIds: selectedBundle.courseIds,
      published: selectedBundle.published,
    });
  }, [selectedBundle]);

  const startNew = () => {
    setSelectedBundleId(null);
    setForm(emptyForm());
    setFeedback('');
  };

  const setLocalized = (field: 'localizedTitle' | 'localizedSummary', language: Language, value: string) => {
    setForm(current => ({
      ...current,
      [field]: { ...current[field], [language]: value },
    }));
  };

  const toggleCourse = (courseId: string) => {
    setForm(current => ({
      ...current,
      courseIds: current.courseIds.includes(courseId)
        ? current.courseIds.filter(id => id !== courseId)
        : [...current.courseIds, courseId],
    }));
  };

  const moveCourse = (courseId: string, direction: -1 | 1) => {
    setForm(current => {
      const index = current.courseIds.indexOf(courseId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.courseIds.length) return current;
      const courseIds = [...current.courseIds];
      [courseIds[index], courseIds[target]] = [courseIds[target], courseIds[index]];
      return { ...current, courseIds };
    });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    if (form.courseIds.length < 2) {
      setFeedback('Choose at least two courses for a collection.');
      return;
    }
    try {
      const data: CourseBundleInput = form;
      if (selectedBundleId) {
        await updateBundle.mutateAsync({ id: selectedBundleId, data });
      } else {
        await createBundle.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getGetOperationCourseBundlesQueryKey() });
      setFeedback('Course collection saved.');
    } catch (error) {
      setFeedback(readableError(error));
    }
  };

  if (!isLoaded || coursesQuery.isLoading || bundlesQuery.isLoading) {
    return <main className="mx-auto max-w-4xl px-5 py-14 text-sm text-muted-foreground" role="status">Loading course collections…</main>;
  }
  if (!isSignedIn) {
    return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="font-display text-2xl font-bold">Sign in required</h1><p className="mt-3 text-sm text-muted-foreground">Sign in with an authorized MaydanGo content account to manage course collections.</p></main>;
  }
  if (coursesQuery.isError || bundlesQuery.isError) {
    return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="font-display text-2xl font-bold">Content access required</h1><p className="mt-3 text-sm text-muted-foreground">This workspace is limited to authorized MaydanGo content administrators.</p></main>;
  }

  const pending = createBundle.isPending || updateBundle.isPending;
  const orderedCourses = form.courseIds
    .map(id => courses.find(course => course.id === id))
    .filter((course): course is NonNullable<typeof course> => !!course);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 text-foreground sm:px-8" data-testid="page-course-bundles">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">MAYDANGO · CONTENT</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Course collections</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Group related courses into a guided learning path. Collections organize discovery only; each course keeps its existing membership and enrollment checks. No payment or course access is granted here.
          </p>
        </div>
        <button type="button" data-testid="button-new-course-bundle" onClick={startNew} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">
          Create collection
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,.8fr)]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="bundle-editor-title">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="bundle-editor-title" className="font-display text-xl font-bold">{selectedBundleId ? 'Edit collection' : 'New collection'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Complete all three languages before saving.</p>
            </div>
            {selectedBundle && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedBundle.published ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                {selectedBundle.published ? 'Published' : 'Draft'}
              </span>
            )}
          </div>

          <form onSubmit={event => void save(event)} className="grid gap-5">
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-bold">Collection title</legend>
              {languages.map(language => (
                <label key={`title-${language.id}`} className="grid gap-2 text-sm font-semibold">
                  {language.label}
                  <input
                    data-testid={`input-bundle-title-${language.id}`}
                    value={form.localizedTitle[language.id]}
                    onChange={event => setLocalized('localizedTitle', language.id, event.target.value)}
                    dir={language.direction}
                    maxLength={240}
                    required
                    className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                  />
                </label>
              ))}
            </fieldset>

            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-bold">Collection description</legend>
              {languages.map(language => (
                <label key={`summary-${language.id}`} className="grid gap-2 text-sm font-semibold">
                  {language.label}
                  <textarea
                    data-testid={`input-bundle-summary-${language.id}`}
                    value={form.localizedSummary[language.id]}
                    onChange={event => setLocalized('localizedSummary', language.id, event.target.value)}
                    dir={language.direction}
                    maxLength={2000}
                    rows={3}
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal leading-6"
                  />
                </label>
              ))}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">Choose courses</legend>
              <p className="mb-2 text-xs leading-5 text-muted-foreground">Select at least two. Use the arrows below to set the learning order. Publishing a collection requires every selected course to be published.</p>
              {courses.length ? courses.map(course => (
                <label key={course.id} className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input
                    data-testid={`checkbox-bundle-course-${course.id}`}
                    type="checkbox"
                    checked={form.courseIds.includes(course.id)}
                    onChange={() => toggleCourse(course.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{course.localizedTitle.en}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{course.published ? 'Published' : 'Draft'} · {course.lessonCount} lessons</span>
                  </span>
                </label>
              )) : <p className="text-sm text-muted-foreground">Create course drafts before making a collection.</p>}
            </fieldset>

            {orderedCourses.length ? (
              <section className="rounded-xl bg-muted/50 p-4" aria-labelledby="bundle-order-title">
                <h3 id="bundle-order-title" className="text-sm font-bold">Learning order · {orderedCourses.length}</h3>
                <ol className="mt-3 grid gap-2">
                  {orderedCourses.map((course, index) => (
                    <li key={course.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-card px-3 py-2">
                      <span className="w-6 text-xs font-bold text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{course.localizedTitle.en}</span>
                      <button
                        type="button"
                        aria-label={`Move ${course.localizedTitle.en} up`}
                        disabled={index === 0}
                        onClick={() => moveCourse(course.id, -1)}
                        className="min-h-8 rounded-md border px-2 text-xs disabled:opacity-40"
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${course.localizedTitle.en} down`}
                        disabled={index === orderedCourses.length - 1}
                        onClick={() => moveCourse(course.id, 1)}
                        className="min-h-8 rounded-md border px-2 text-xs disabled:opacity-40"
                      >↓</button>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
              <input
                data-testid="checkbox-publish-course-bundle"
                type="checkbox"
                checked={form.published}
                onChange={event => setForm(current => ({ ...current, published: event.target.checked }))}
                className="mt-0.5 size-4 accent-primary"
              />
              <span><span className="block font-semibold">Publish for members</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Only published courses can appear in a published collection. This does not grant course access.</span></span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" data-testid="button-save-course-bundle" disabled={pending || courses.length < 2} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? 'Saving…' : selectedBundleId ? 'Save changes' : 'Save collection'}
              </button>
              {feedback ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{feedback}</p> : null}
            </div>
          </form>
        </section>

        <aside className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="bundle-list-title">
          <h2 id="bundle-list-title" className="font-display text-xl font-bold">Saved collections</h2>
          <p className="mt-1 text-sm text-muted-foreground">Published collections appear in the member app.</p>
          {bundles.length ? (
            <ul className="mt-5 divide-y">
              {bundles.map(bundle => (
                <li key={bundle.id} className="py-4 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    data-testid={`button-edit-course-bundle-${bundle.id}`}
                    onClick={() => { setSelectedBundleId(bundle.id); setFeedback(''); }}
                    className="w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{bundle.localizedTitle.en}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${bundle.published ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                        {bundle.published ? 'Published' : 'Draft'}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{bundle.courseCount} courses</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-5 text-sm text-muted-foreground">No collections yet. Add courses to create the first learning path.</p>}
        </aside>
      </div>
    </main>
  );
}
