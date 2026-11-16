import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOperationCourseMaterialsQueryKey,
  useCompleteCourseMaterialUpload,
  useCreateCourseMaterialUploadUrl,
  useGetOperationCourseMaterials,
  useGetOperationCourses,
} from '@workspace/api-client-react';

const maxFileBytes = 15 * 1024 * 1024;

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
}

export default function CourseMaterialsManagerPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const coursesQuery = useGetOperationCourses({ query: { enabled: isLoaded && !!isSignedIn } });
  const courses = coursesQuery.data?.courses ?? [];
  const [courseId, setCourseId] = useState('');
  const materialsQuery = useGetOperationCourseMaterials(courseId, {
    query: { enabled: isLoaded && !!isSignedIn && !!courseId },
  });
  const createUploadUrl = useCreateCourseMaterialUploadUrl();
  const completeUpload = useCompleteCourseMaterialUpload();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!courseId && courses.length) setCourseId(courses[0].id);
  }, [courseId, courses]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback('');
    if (!courseId || !title.trim() || !file) {
      setFeedback('Choose a course, enter a material title, and select a PDF.');
      return;
    }
    if ((file.type && file.type !== 'application/pdf') || file.size < 1 || file.size > maxFileBytes || !file.name.toLowerCase().endsWith('.pdf')) {
      setFeedback('Select a valid PDF file no larger than 15 MB.');
      return;
    }

    try {
      const upload = await createUploadUrl.mutateAsync({
        id: courseId,
        data: { fileName: file.name },
      });
      const uploaded = await fetch(upload.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!uploaded.ok) throw new Error('The PDF could not be uploaded. Please try again.');
      await completeUpload.mutateAsync({
        id: courseId,
        materialId: upload.id,
        data: { title: title.trim(), fileName: file.name },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetOperationCourseMaterialsQueryKey(courseId),
      });
      setTitle('');
      setFile(null);
      const input = form.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.value = '';
      setFeedback('The PDF is approved and available to eligible enrolled members.');
    } catch (error) {
      setFeedback(readableError(error));
    }
  };

  if (!isLoaded || coursesQuery.isLoading) {
    return <main className="mx-auto max-w-4xl px-5 py-14 text-sm text-muted-foreground" role="status">Loading course materials…</main>;
  }
  if (!isSignedIn) {
    return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="font-display text-2xl font-bold">Sign in required</h1><p className="mt-3 text-sm text-muted-foreground">Sign in with an authorized MaydanGo content account to manage course materials.</p></main>;
  }
  if (coursesQuery.isError) {
    return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="font-display text-2xl font-bold">Content access required</h1><p className="mt-3 text-sm text-muted-foreground">This workspace is limited to authorized MaydanGo content administrators.</p></main>;
  }

  const pending = createUploadUrl.isPending || completeUpload.isPending;
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 text-foreground sm:px-8" data-testid="page-course-materials">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">MAYDANGO · CONTENT</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Course materials</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Upload approved PDF guides and plans. Only members with eligible digital-course access who are enrolled in the selected course can download them.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <label htmlFor="course-material-course" className="mb-2 block text-sm font-semibold">Course</label>
        <select
          id="course-material-course"
          data-testid="select-course-material-course"
          value={courseId}
          onChange={event => setCourseId(event.target.value)}
          className="mb-6 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {courses.map(course => <option key={course.id} value={course.id}>{course.localizedTitle.en}</option>)}
        </select>

        {courses.length ? (
          <form onSubmit={event => void upload(event)} className="grid gap-4">
            <div>
              <label htmlFor="course-material-title" className="mb-2 block text-sm font-semibold">Member-facing title</label>
              <input
                id="course-material-title"
                data-testid="input-course-material-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={160}
                required
                className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
                placeholder="For example, beginner training plan"
              />
            </div>
            <div>
              <label htmlFor="course-material-file" className="mb-2 block text-sm font-semibold">PDF file</label>
              <input
                id="course-material-file"
                data-testid="input-course-material-file"
                type="file"
                accept="application/pdf,.pdf"
                onChange={event => setFile(event.target.files?.[0] ?? null)}
                className="block min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              />
              <p className="mt-2 text-xs text-muted-foreground">PDF only · maximum 15 MB. Uploading approves it for eligible enrolled members.</p>
            </div>
            <button
              type="submit"
              data-testid="button-upload-course-material"
              disabled={pending || !courseId}
              className="min-h-11 justify-self-start rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Uploading…' : 'Upload and approve PDF'}
            </button>
            {feedback ? <p className="text-sm" role="status" aria-live="polite">{feedback}</p> : null}
          </form>
        ) : <p className="text-sm text-muted-foreground">No courses are available yet.</p>}
      </section>

      {courseId ? (
        <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="course-material-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="course-material-list-title" className="font-display text-xl font-bold">Approved PDFs</h2>
              <p className="mt-1 text-sm text-muted-foreground">These files are private and available only through course access checks.</p>
            </div>
            <button type="button" onClick={() => void materialsQuery.refetch()} className="min-h-10 rounded-lg border px-3 text-sm font-semibold">Refresh</button>
          </div>
          {materialsQuery.isLoading ? <p className="mt-5 text-sm text-muted-foreground" role="status">Loading materials…</p>
            : materialsQuery.isError ? <p className="mt-5 text-sm text-destructive" role="alert">Materials could not be loaded. Please try again.</p>
              : materialsQuery.data?.materials.length ? (
                <ul className="mt-5 divide-y">
                  {materialsQuery.data.materials.map(material => (
                    <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-semibold">{material.title}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{material.fileName} · {(material.sizeBytes / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Approved</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-5 text-sm text-muted-foreground">No PDFs have been approved for this course.</p>}
        </section>
      ) : null}
    </main>
  );
}
