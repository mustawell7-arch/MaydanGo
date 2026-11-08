import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSupportCaseEscalationsQueryKey, getGetSupportStaffTicketQueryKey, getGetSupportStaffTicketsQueryKey,
  useGetSupportCaseEscalations, useCreateSupportCaseEscalation, useResolveSupportCaseEscalation,
  type SupportAgent,
} from '@workspace/api-client-react';

const copy = {
  en: {
    title: 'Case escalation', hint: 'Internal handoff to another authorized staff member. This is not an emergency alert.',
    target: 'Receiving staff member', choose: 'Choose a staff member', reason: 'Reason for escalation',
    raise: 'Escalate case', pending: 'Saving…', active: 'Needs follow-up', resolved: 'Resolved escalation',
    resolution: 'What was done to resolve this escalation?', resolve: 'Resolve escalation',
    history: 'Escalation history', empty: 'No manual escalations.', error: 'Could not save the escalation. Refresh and try again.',
    loadError: 'Could not load escalations.', retry: 'Retry', closed: 'Reopen the ticket before escalating it.',
    min: 'Give at least 10 characters of detail.', saved: 'Escalation saved.', noTargets: 'Another authorized staff member is needed.',
  },
  ar: {
    title: 'تصعيد الطلب', hint: 'إحالة داخلية إلى موظف معتمد آخر. هذا ليس تنبيهاً للطوارئ.',
    target: 'الموظف المستلم', choose: 'اختر موظفاً', reason: 'سبب التصعيد',
    raise: 'تصعيد الطلب', pending: 'جارٍ الحفظ…', active: 'بحاجة إلى متابعة', resolved: 'تمت معالجة التصعيد',
    resolution: 'ما الإجراء الذي اتُخذ لمعالجة التصعيد؟', resolve: 'إنهاء التصعيد',
    history: 'سجل التصعيد', empty: 'لا توجد تصعيدات يدوية.', error: 'تعذر حفظ التصعيد. حدّث الصفحة وحاول مجدداً.',
    loadError: 'تعذر تحميل التصعيدات.', retry: 'إعادة المحاولة', closed: 'أعد فتح الطلب قبل تصعيده.',
    min: 'اكتب تفاصيل لا تقل عن 10 أحرف.', saved: 'تم حفظ التصعيد.', noTargets: 'يلزم وجود موظف معتمد آخر.',
  },
  ku: {
    title: 'ئاستبەرزکردنەوەی داواکاری', hint: 'سپاردنی ناوخۆیی بۆ کارمەندێکی ڕێگەپێدراوی تر. ئەمە ئاگادارکردنەوەی فریاکەوتن نییە.',
    target: 'کارمەندی وەرگر', choose: 'کارمەندێک هەڵبژێرە', reason: 'هۆکاری ئاستبەرزکردنەوە',
    raise: 'ئاستبەرزکردنەوەی داواکاری', pending: 'پاشەکەوتکردن…', active: 'پێویستی بە بەدواداچوون هەیە', resolved: 'چارەسەرکرا',
    resolution: 'چ کارێک بۆ چارەسەرکردن کرا؟', resolve: 'تەواوکردنی ئاستبەرزکردنەوە',
    history: 'مێژووی ئاستبەرزکردنەوە', empty: 'هیچ ئاستبەرزکردنەوەیەکی دەستی نییە.', error: 'پاشەکەوتکردن سەرکەوتوو نەبوو. نوێی بکەرەوە و هەوڵ بدەوە.',
    loadError: 'بارکردنی تۆمارەکان سەرکەوتوو نەبوو.', retry: 'هەوڵدانەوە', closed: 'پێش ئاستبەرزکردنەوە داواکارییەکە بکەرەوە.',
    min: 'لانیکەم ١٠ پیت وردەکاری بنووسە.', saved: 'تۆمارەکە پاشەکەوت کرا.', noTargets: 'پێویستە کارمەندێکی ڕێگەپێدراوی تر هەبێت.',
  },
};
const input = 'mt-1 w-full rounded-lg border border-[#d8d2c4] bg-[#fffdf7] p-2 text-xs text-[#173d35] disabled:opacity-50';

export function SupportCaseEscalations({ ticketId, ticketStatus, agents, userId, language }: {
  ticketId: string; ticketStatus: string; agents: SupportAgent[]; userId: string; language: 'en' | 'ar' | 'ku';
}) {
  const t = copy[language];
  const client = useQueryClient();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const queryKey = getGetSupportCaseEscalationsQueryKey(ticketId);
  const query = useGetSupportCaseEscalations(ticketId, { query: { queryKey, retry: false, refetchInterval: 15_000 } });
  const raise = useCreateSupportCaseEscalation();
  const resolve = useResolveSupportCaseEscalation();
  const active = query.data?.find(item => !item.resolvedAt);
  const isAdmin = agents.some(agent => agent.userId === userId && agent.role === 'admin');
  const targets = agents.filter(agent => agent.userId !== userId);
  const busy = raise.isPending || resolve.isPending;
  const date = (value: string) => new Intl.DateTimeFormat(
    language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ',
    { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' },
  ).format(new Date(value));
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
      client.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(ticketId) }),
    ]);
  };
  const submit = async (resolving: boolean) => {
    setFeedback('');
    setFailed(false);
    try {
      const updated = resolving && active
        ? await resolve.mutateAsync({ id: ticketId, escalationId: active.id, data: { resolution: resolution.trim() } })
        : await raise.mutateAsync({ id: ticketId, data: { targetUserId: target, reason: reason.trim() } });
      client.setQueryData(queryKey, updated);
      setReason(''); setTarget(''); setResolution('');
      await refresh();
      setFeedback(t.saved);
    } catch {
      setFailed(true); setFeedback(t.error);
      await refresh();
    }
  };
  return <section className="mb-6 rounded-2xl border border-[#e4c3b7] bg-[#fff5ee] p-3.5" data-testid="support-case-escalations">
    <h3 className="text-xs font-extrabold text-[#80533e]">{t.title}</h3>
    <p className="mt-1 text-[10px] leading-4 text-[#816b5d]">{t.hint}</p>
    {query.isLoading ? <p className="mt-3 text-xs">{t.pending}</p> : query.isError ? <div role="alert" className="mt-3 text-xs">
      <p>{t.loadError}</p><button type="button" onClick={() => void query.refetch()} className="mt-2 underline">{t.retry}</button>
    </div> : <>
      {active ? <div className="mt-3 text-xs">
        <p className="font-bold text-[#994c32]">{t.active} · {active.targetUserId}</p>
        <p className="mt-2 whitespace-pre-wrap break-words">{active.reason}</p>
        <p className="mt-1 text-[10px]">{date(active.raisedAt)} · {active.raisedBy}</p>
        {(isAdmin || active.targetUserId === userId) && <form className="mt-3" onSubmit={event => { event.preventDefault(); void submit(true); }}>
          <label className="block">{t.resolution}<textarea aria-label={t.resolution} data-testid="textarea-case-resolution" value={resolution}
            onChange={event => setResolution(event.target.value)} minLength={10} maxLength={2000} rows={3} required disabled={busy} className={input}/></label>
          <p className="mt-1 text-[10px]">{t.min}</p>
          <button type="submit" data-testid="button-resolve-case" disabled={busy || resolution.trim().length < 10} className="mt-2 rounded-full bg-[#80533e] px-3 py-2 font-bold text-white disabled:opacity-50">{busy ? t.pending : t.resolve}</button>
        </form>}
      </div> : ['closed', 'resolved'].includes(ticketStatus) ? <p className="mt-3 text-xs">{t.closed}</p> : !targets.length ? <p className="mt-3 text-xs">{t.noTargets}</p> :
        <form className="mt-3 text-xs" onSubmit={event => { event.preventDefault(); void submit(false); }}>
          <label>{t.target}<select aria-label={t.target} data-testid="select-case-target" value={target} onChange={event => setTarget(event.target.value)} required disabled={busy} className={input}>
            <option value="">{t.choose}</option>{targets.map(agent => <option key={agent.userId} value={agent.userId}>{agent.userId} · {agent.role}</option>)}
          </select></label>
          <label className="mt-2 block">{t.reason}<textarea aria-label={t.reason} data-testid="textarea-case-reason" value={reason} onChange={event => setReason(event.target.value)}
            minLength={10} maxLength={2000} rows={3} required disabled={busy} className={input}/></label>
          <p className="mt-1 text-[10px]">{t.min}</p>
          <button type="submit" data-testid="button-escalate-case" disabled={busy || !target || reason.trim().length < 10} className="mt-2 rounded-full bg-[#80533e] px-3 py-2 font-bold text-white disabled:opacity-50">{busy ? t.pending : t.raise}</button>
        </form>}
      <h4 className="mt-4 text-[10px] font-bold">{t.history}</h4>
      {!query.data?.length && <p className="mt-1 text-[10px]">{t.empty}</p>}
      {query.data?.filter(item => item.resolvedAt).map(item => <div key={item.id} className="mt-2 rounded-xl bg-white/70 p-2 text-[10px]">
        <p className="font-bold">{t.resolved} · {item.targetUserId}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{item.reason}</p>
        <p className="mt-1">{date(item.raisedAt)} · {item.raisedBy}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{item.resolution}</p>
        <p className="mt-1">{date(item.resolvedAt!)} · {item.resolvedBy}</p>
      </div>)}
    </>}
    {feedback && <p role={failed ? 'alert' : 'status'} className={`mt-3 text-xs ${failed ? 'text-red-800' : 'text-green-800'}`}>{feedback}</p>}
  </section>;
}
