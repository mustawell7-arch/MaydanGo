import { useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSupportStaffResponseTemplatesQueryKey,
  useArchiveSupportStaffResponseTemplate,
  useCreateSupportStaffResponseTemplate,
  useGetSupportStaffResponseTemplates,
  useUpdateSupportStaffResponseTemplate,
  type SupportResponseTemplate,
} from '@workspace/api-client-react';
import { Form } from '@/components/ui/form';

type Language = 'en' | 'ar' | 'ku';
const languages: { key: Language; label: string }[] = [
  { key: 'en', label: 'English' }, { key: 'ar', label: 'العربية' }, { key: 'ku', label: 'کوردی' },
];
const templateSchema = z.object({
  translations: z.object({
    en: z.object({ title: z.string().trim().min(2).max(100), body: z.string().trim().min(1).max(5000) }),
    ar: z.object({ title: z.string().trim().min(2).max(100), body: z.string().trim().min(1).max(5000) }),
    ku: z.object({ title: z.string().trim().min(2).max(100), body: z.string().trim().min(1).max(5000) }),
  }),
});
type TemplateForm = z.infer<typeof templateSchema>;
const blank: TemplateForm = { translations: {
  en: { title: '', body: '' }, ar: { title: '', body: '' }, ku: { title: '', body: '' },
} };
const field = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-white px-3 py-2 text-xs text-[#173d35] outline-none focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15';

const copy = {
  en: {
    manage: 'Approved reply templates', explanation: 'Admins manage the shared replies. Staff can insert one into a draft, review it, and edit before sending.',
    new: 'New template', edit: 'Edit', archive: 'Archive', restore: 'Re-enable by editing', active: 'Active', archived: 'Archived',
    title: 'Short label', body: 'Reply text', save: 'Save template', create: 'Create template', cancel: 'Cancel',
    loading: 'Loading templates…', empty: 'No templates saved yet.', error: 'Templates could not be loaded or saved. Refresh and try again.',
    saved: 'Template saved.', archivedSuccess: 'Template archived.', translated: 'Enter a label and reply in all three languages.',
    insert: 'Insert a saved reply', choose: 'Choose a template…', add: 'Add to draft', added: 'Added to the draft. Review and edit it before sending.',
    noAvailable: 'No active templates are available in this ticket’s language.', tooLong: 'There is not enough room in the reply draft for this template.',
  },
  ar: {
    manage: 'قوالب الردود المعتمدة', explanation: 'يدير المسؤولون الردود المشتركة. يمكن للموظفين إدراجها في مسودة ومراجعتها وتعديلها قبل الإرسال.',
    new: 'قالب جديد', edit: 'تعديل', archive: 'أرشفة', restore: 'إعادة التفعيل عبر التعديل', active: 'نشط', archived: 'مؤرشف',
    title: 'عنوان مختصر', body: 'نص الرد', save: 'حفظ القالب', create: 'إنشاء قالب', cancel: 'إلغاء',
    loading: 'جارٍ تحميل القوالب…', empty: 'لم يتم حفظ قوالب بعد.', error: 'تعذر تحميل القوالب أو حفظها. حدّث الصفحة وحاول مجدداً.',
    saved: 'تم حفظ القالب.', archivedSuccess: 'تمت أرشفة القالب.', translated: 'أدخل العنوان والرد باللغات الثلاث.',
    insert: 'إدراج رد محفوظ', choose: 'اختر قالباً…', add: 'إضافة إلى المسودة', added: 'أُضيف إلى المسودة. راجعه وعدّله قبل الإرسال.',
    noAvailable: 'لا توجد قوالب نشطة بلغة هذه المحادثة.', tooLong: 'لا توجد مساحة كافية في مسودة الرد لهذا القالب.',
  },
  ku: {
    manage: 'قاڵبە پەسەندکراوەکانی وەڵام', explanation: 'بەڕێوەبەران وەڵامە هاوبەشەکان بەڕێوە دەبەن. کارمەندان دەتوانن قاڵبێک بخەنە ناو ڕەشنووس و پێش ناردن بیپشکنن و دەستکاری بکەن.',
    new: 'قاڵبی نوێ', edit: 'دەستکاری', archive: 'ئەرشیفکردن', restore: 'بە دەستکاری دووبارە چالاکی بکەرەوە', active: 'چالاک', archived: 'ئەرشیفکراو',
    title: 'ناونیشانی کورت', body: 'دەقی وەڵام', save: 'پاشەکەوتکردنی قاڵب', create: 'دروستکردنی قاڵب', cancel: 'پاشگەزبوونەوە',
    loading: 'قاڵبەکان بار دەکرێن…', empty: 'هێشتا هیچ قاڵبێک پاشەکەوت نەکراوە.', error: 'بارکردن یان پاشەکەوتکردنی قاڵبەکان سەرکەوتوو نەبوو. نوێی بکەرەوە و هەوڵ بدەوە.',
    saved: 'قاڵبەکە پاشەکەوت کرا.', archivedSuccess: 'قاڵبەکە خرایە ئەرشیف.', translated: 'ناونیشان و وەڵامەکە بە هەموو سێ زمانەکە بنووسە.',
    insert: 'خستنەناو وەڵامی پاشەکەوتکراو', choose: 'قاڵبێک هەڵبژێرە…', add: 'زیادکردن بۆ ڕەشنووس', added: 'خرایە ناو ڕەشنووس. پێش ناردن بیپشکنە و دەستکاری بکە.',
    noAvailable: 'لە زمانی ئەم گفتوگۆیەدا هیچ قاڵبێکی چالاک نییە.', tooLong: 'شوێنی پێویست بۆ ئەم قاڵبە لە ڕەشنووسی وەڵامدا نییە.',
  },
};

function useTemplateData(enabled = true) {
  const queryKey = getGetSupportStaffResponseTemplatesQueryKey();
  const query = useGetSupportStaffResponseTemplates({ query: { queryKey, enabled, retry: false } });
  return { query, queryKey };
}

export function SupportResponseTemplatePicker({ language, onInsert, disabled }: {
  language: Language; onInsert: (body: string) => boolean; disabled: boolean;
}) {
  const t = copy[language];
  const { query } = useTemplateData();
  const [selectedId, setSelectedId] = useState('');
  const [added, setAdded] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const templates = (query.data ?? []).filter(template => template.active);
  const selected = templates.find(template => template.id === selectedId);
  return <div className="mb-3 rounded-xl border border-[#d8e2d5] bg-[#f4f7f0] p-3" data-testid="support-response-template-picker">
    <label className="block text-xs font-semibold text-[#36564b]">{t.insert}
      <select data-testid="select-support-response-template" value={selectedId} disabled={disabled || query.isLoading || query.isError || !templates.length}
      onChange={event => { setSelectedId(event.target.value); setAdded(false); setTooLong(false); }} className={field}>
        <option value="">{query.isLoading ? t.loading : t.choose}</option>
        {templates.map(template => <option key={template.id} value={template.id}>{template.translations[language].title}</option>)}
      </select>
    </label>
    {query.isError && <p role="alert" className="mt-2 text-xs text-red-800">{t.error}</p>}
    {!query.isLoading && !query.isError && !templates.length && <p className="mt-2 text-xs text-[#687a71]">{t.noAvailable}</p>}
    {selected && <button type="button" data-testid="button-insert-support-response-template" disabled={disabled} onClick={() => {
      const inserted = onInsert(selected.translations[language].body);
      setAdded(inserted); setTooLong(!inserted);
    }} className="mt-2 rounded-full border border-[#28695a] px-3 py-2 text-xs font-bold text-[#28695a] disabled:opacity-50">{t.add}</button>}
    {tooLong && <p role="alert" className="mt-2 text-xs text-red-800">{t.tooLong}</p>}
    {added && <p role="status" data-testid="status-response-template-added" className="mt-2 text-xs text-[#28695a]">{t.added}</p>}
  </div>;
}

export function SupportResponseTemplateManager({ language }: { language: Language }) {
  const t = copy[language];
  const { query, queryKey } = useTemplateData();
  const client = useQueryClient();
  const [editing, setEditing] = useState<SupportResponseTemplate | null>(null);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const form = useForm<TemplateForm>({ resolver: zodResolver(templateSchema), defaultValues: blank });
  const create = useCreateSupportStaffResponseTemplate();
  const update = useUpdateSupportStaffResponseTemplate();
  const archive = useArchiveSupportStaffResponseTemplate();
  const busy = create.isPending || update.isPending || archive.isPending;

  const reset = () => { setEditing(null); form.reset(blank); };
  const save = async (values: TemplateForm) => {
    setFeedback(''); setFailed(false);
    try {
      const result = editing
        ? await update.mutateAsync({ id: editing.id, data: { translations: values.translations, active: true } })
        : await create.mutateAsync({ data: { translations: values.translations } });
      const current = client.getQueryData<SupportResponseTemplate[]>(queryKey) ?? [];
      client.setQueryData(queryKey, editing ? current.map(item => item.id === result.id ? result : item) : [result, ...current]);
      await client.invalidateQueries({ queryKey });
      reset(); setFeedback(t.saved);
    } catch { setFailed(true); setFeedback(t.error); }
  };
  const edit = (template: SupportResponseTemplate) => {
    setEditing(template);
    form.reset({ translations: template.translations });
    setFeedback(''); setFailed(false);
  };
  const archiveTemplate = async (template: SupportResponseTemplate) => {
    setFeedback(''); setFailed(false);
    try {
      const result = await archive.mutateAsync({ id: template.id });
      const current = client.getQueryData<SupportResponseTemplate[]>(queryKey) ?? [];
      client.setQueryData(queryKey, current.map(item => item.id === result.id ? result : item));
      await client.invalidateQueries({ queryKey });
      setFeedback(t.archivedSuccess);
    } catch { setFailed(true); setFeedback(t.error); }
  };

  return <details className="mx-auto max-w-[1600px] px-4 py-3 sm:px-7 lg:px-10" data-testid="support-response-template-manager">
    <summary data-testid="button-toggle-response-template-manager" className="cursor-pointer rounded-xl border border-[#d8e2d5] bg-[#f4f7f0] px-4 py-3 text-sm font-bold text-[#36564b]">{t.manage}</summary>
    <section className="mt-3 rounded-2xl border border-[#ded8c9] bg-[#fffdf7] p-4 sm:p-5">
      <p className="mb-4 text-xs leading-5 text-[#687a71]">{t.explanation}</p>
      {query.isLoading && <p className="text-xs">{t.loading}</p>}
      {query.isError && <p role="alert" className="text-xs text-red-800">{t.error}</p>}
      {!query.isLoading && !query.isError && query.data?.length === 0 && <p className="mb-3 text-xs text-[#687a71]">{t.empty}</p>}
      {!query.isLoading && !query.isError && <ul className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.map(template => <li key={template.id} data-testid={`response-template-${template.id}`} className="rounded-xl border border-[#e4dfd2] p-3 text-xs">
          <p className="font-bold">{template.translations[language].title}</p>
          <p className={`mt-1 text-[10px] ${template.active ? 'text-[#28695a]' : 'text-[#8a6259]'}`}>{template.active ? t.active : t.archived}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" data-testid={`button-edit-response-template-${template.id}`} disabled={busy}
              onClick={() => edit(template)} className="rounded-full border border-[#28695a] px-3 py-1.5 font-bold text-[#28695a] disabled:opacity-50">{t.edit}</button>
            {template.active && <button type="button" data-testid={`button-archive-response-template-${template.id}`} disabled={busy}
              onClick={() => void archiveTemplate(template)} className="rounded-full border border-[#b36a55] px-3 py-1.5 font-bold text-[#8b4938] disabled:opacity-50">{t.archive}</button>}
          </div>
        </li>)}
      </ul>}
      <Form {...form}><form onSubmit={form.handleSubmit(save)} className="rounded-xl bg-[#f8f6ef] p-3 sm:p-4">
        <h3 className="mb-3 text-sm font-bold">{editing ? t.edit : t.new}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {languages.map(({ key, label }) => <fieldset key={key} dir={key === 'en' ? 'ltr' : 'rtl'} className="rounded-xl border border-[#ded8c9] bg-white p-3">
            <legend className="px-1 text-xs font-bold">{label}</legend>
            <label className="block text-xs">{t.title}
              <input data-testid={`input-template-title-${key}`} maxLength={100} disabled={busy} {...form.register(`translations.${key}.title`)} className={field}/>
              {form.formState.errors.translations?.[key]?.title?.message && <span className="text-red-800">{t.translated}</span>}
            </label>
            <label className="mt-2 block text-xs">{t.body}
              <textarea data-testid={`textarea-template-body-${key}`} maxLength={5000} rows={5} disabled={busy} {...form.register(`translations.${key}.body`)} className={field}/>
              {form.formState.errors.translations?.[key]?.body?.message && <span className="text-red-800">{t.translated}</span>}
            </label>
          </fieldset>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" data-testid="button-save-response-template" disabled={busy} className="rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:opacity-50">{busy ? t.loading : editing ? t.save : t.create}</button>
          {editing && <button type="button" data-testid="button-cancel-edit-response-template" disabled={busy} onClick={reset} className="rounded-full border border-[#d8d2c4] px-4 py-2.5 text-xs font-bold">{t.cancel}</button>}
        </div>
      </form></Form>
      {feedback && <p role={failed ? 'alert' : 'status'} data-testid="status-response-template-save" className={`mt-3 text-xs ${failed ? 'text-red-800' : 'text-[#28695a]'}`}>{feedback}</p>}
    </section>
  </details>;
}
