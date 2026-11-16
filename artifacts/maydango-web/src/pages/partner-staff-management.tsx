import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPartnerStaffQueryKey,
  useAssignPartnerStaff,
  useGetPartnerStaff,
  useRemovePartnerStaff,
} from "@workspace/api-client-react";
import type { PortalLanguage } from "@/pages/partner-operations";
import { Check, LoaderCircle, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";

type PartnerStaffRole = "partner" | "partner_manager" | "partner_reception" | "partner_finance";
type AssignableRole = Exclude<PartnerStaffRole, "partner">;

const copy: Record<PortalLanguage, Record<string, string>> = {
  en: {
    title: "Partner staff",
    description: "Assign a role to an existing, verified MaydanGo account. Staff must create an account before you add them.",
    email: "MaydanGo account email",
    role: "Access role",
    manager: "Manager",
    reception: "Reception",
    finance: "Finance",
    add: "Add staff member",
    changeRole: "Change role",
    adding: "Adding…",
    owner: "Partner owner",
    accountUnavailable: "Account unavailable",
    remove: "Remove access",
    loading: "Loading staff…",
    loadFailed: "Staff list could not be loaded.",
    retry: "Try again",
    empty: "No additional staff members have access.",
    addSuccess: "Partner access was assigned.",
    removeSuccess: "Partner access was removed. The MaydanGo account remains active.",
    saveFailed: "The role could not be saved. Check the account email and try again.",
    removeFailed: "Access could not be removed. Try again.",
    confirmRemove: "Remove this person's access to the partner workspace?",
    permissionSummary: "Managers run sessions and operations. Reception staff handle today's check-ins. Finance staff can view partner invoices and settlement reports.",
  },
  ar: {
    title: "موظفو الشريك",
    description: "أضف دوراً إلى حساب MaydanGo موجود وموثّق. يجب أن ينشئ الموظف حساباً قبل إضافته.",
    email: "البريد المرتبط بحساب MaydanGo",
    role: "صلاحية الوصول",
    manager: "مدير",
    reception: "الاستقبال",
    finance: "المالية",
    add: "إضافة موظف",
    changeRole: "تغيير الدور",
    adding: "جارٍ الإضافة…",
    owner: "مالك الشريك",
    accountUnavailable: "الحساب غير متاح",
    remove: "إلغاء الوصول",
    loading: "جارٍ تحميل الموظفين…",
    loadFailed: "تعذر تحميل قائمة الموظفين.",
    retry: "إعادة المحاولة",
    empty: "لا يوجد موظفون آخرون لديهم صلاحية الوصول.",
    addSuccess: "تم منح صلاحية الشريك.",
    removeSuccess: "تم إلغاء صلاحية الشريك. بقي حساب MaydanGo فعالاً.",
    saveFailed: "تعذر حفظ الدور. تحقق من البريد وحاول مجدداً.",
    removeFailed: "تعذر إلغاء الصلاحية. حاول مجدداً.",
    confirmRemove: "هل تريد إلغاء وصول هذا الشخص إلى مساحة الشريك؟",
    permissionSummary: "يدير المدير الجلسات والعمليات. ويتولى موظف الاستقبال تسجيل حضور اليوم. ويمكن للمالية الاطلاع على فواتير الشريك وتقارير التسوية.",
  },
  ku: {
    title: "کارمەندانی هاوبەش",
    description: "ڕۆڵێک بە هەژمارێکی بوونی و پشتڕاستکراوەی MaydanGo بدە. کارمەند پێویستە پێش زیادکردن هەژمار دروست بکات.",
    email: "ئیمەیڵی هەژماری MaydanGo",
    role: "ڕۆڵی دەستگەیشتن",
    manager: "بەڕێوەبەر",
    reception: "پێشوازی",
    finance: "دارایی",
    add: "زیادکردنی کارمەند",
    changeRole: "گۆڕینی ڕۆڵ",
    adding: "زیاد دەکرێت…",
    owner: "خاوەنی هاوبەش",
    accountUnavailable: "هەژمار بەردەست نییە",
    remove: "لابردنی دەستگەیشتن",
    loading: "کارمەندان بار دەکرێن…",
    loadFailed: "بارکردنی لیستی کارمەندان سەرکەوتوو نەبوو.",
    retry: "دووبارە هەوڵ بدە",
    empty: "هیچ کارمەندێکی تری دەستگەیشتنی نییە.",
    addSuccess: "دەستگەیشتنی هاوبەش پێدرا.",
    removeSuccess: "دەستگەیشتنی هاوبەش لابرا. هەژماری MaydanGo چالاک دەمێنێتەوە.",
    saveFailed: "پاشەکەوتکردنی ڕۆڵ سەرکەوتوو نەبوو. ئیمەیڵەکە بپشکنە و دووبارە هەوڵ بدە.",
    removeFailed: "لابردنی دەستگەیشتن سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.",
    confirmRemove: "دەستگەیشتنی ئەم کەسە لە پۆرتاڵی هاوبەش لاببەین؟",
    permissionSummary: "بەڕێوەبەر وانە و کارگێڕییەکان بەڕێوەدەبات. پێشوازی ئامادەبوونی ئەمڕۆ تۆمار دەکات. دارایی دەتوانێت پسووڵە و ڕاپۆرتی یەکلاکردنەوە ببینێت.",
  },
};

const roleOptions: Array<{ value: AssignableRole; key: string }> = [
  { value: "partner_manager", key: "manager" },
  { value: "partner_reception", key: "reception" },
  { value: "partner_finance", key: "finance" },
];
const roleLabels: Record<PortalLanguage, Record<PartnerStaffRole, string>> = {
  en: { partner: "Owner", partner_manager: "Manager", partner_reception: "Reception", partner_finance: "Finance" },
  ar: { partner: "المالك", partner_manager: "مدير", partner_reception: "الاستقبال", partner_finance: "المالية" },
  ku: { partner: "خاوەن", partner_manager: "بەڕێوەبەر", partner_reception: "پێشوازی", partner_finance: "دارایی" },
};

export function PartnerStaffManagement({ language }: { language: PortalLanguage }) {
  const client = useQueryClient();
  const staff = useGetPartnerStaff({ query: { retry: false } });
  const assignStaff = useAssignPartnerStaff();
  const removeStaff = useRemovePartnerStaff();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("partner_manager");
  const [notice, setNotice] = useState("");
  const t = copy[language];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    assignStaff.mutate({ data: { email: email.trim(), role } }, {
      onSuccess: async () => {
        setEmail("");
        setNotice(t.addSuccess);
        await client.invalidateQueries({ queryKey: getGetPartnerStaffQueryKey() });
      },
      onError: () => setNotice(t.saveFailed),
    });
  };

  const updateRole = (event: FormEvent<HTMLFormElement>, staffEmail: string) => {
    event.preventDefault();
    const nextRole = new FormData(event.currentTarget).get("role");
    if (typeof nextRole !== "string" || !roleOptions.some(option => option.value === nextRole)) return;
    setNotice("");
    assignStaff.mutate({ data: { email: staffEmail, role: nextRole as AssignableRole } }, {
      onSuccess: async () => {
        setNotice(t.addSuccess);
        await client.invalidateQueries({ queryKey: getGetPartnerStaffQueryKey() });
      },
      onError: () => setNotice(t.saveFailed),
    });
  };

  const remove = (userId: string) => {
    if (!window.confirm(t.confirmRemove)) return;
    setNotice("");
    removeStaff.mutate({ userId }, {
      onSuccess: async () => {
        setNotice(t.removeSuccess);
        await client.invalidateQueries({ queryKey: getGetPartnerStaffQueryKey() });
      },
      onError: () => setNotice(t.removeFailed),
    });
  };

  return <section className="grid gap-5" aria-labelledby="partner-staff-title">
    <article className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e7efe4] text-[#28695a]"><Users size={19} /></span>
        <div>
          <h2 id="partner-staff-title" className="font-display text-xl font-bold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687a71]">{t.description}</p>
        </div>
      </div>
      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl bg-[#f5f1e6] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(170px,.65fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-xs font-semibold text-[#536b61]">
          <span>{t.email}</span>
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="min-h-11 rounded-xl border border-[#d8d2c4] bg-white px-3 text-sm text-[#173d35] outline-none focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#536b61]">
          <span>{t.role}</span>
          <select
            value={role}
            onChange={event => setRole(event.target.value as AssignableRole)}
            className="min-h-11 rounded-xl border border-[#d8d2c4] bg-white px-3 text-sm text-[#173d35] outline-none focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15"
          >
            {roleOptions.map(option => <option key={option.value} value={option.value}>{t[option.key]}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={assignStaff.isPending || !email.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-bold text-[#fff9e9] transition hover:bg-[#28695a] disabled:cursor-wait disabled:opacity-50"
        >
          {assignStaff.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {assignStaff.isPending ? t.adding : t.add}
        </button>
      </form>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#687a71]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#28695a]" />{t.permissionSummary}</p>
      {notice && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-[#d5e2d5] bg-[#edf4ee] px-4 py-3 text-sm text-[#315e42]">{notice}</p>}
    </article>

    <article className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold">{t.title}</h3>
        <span className="rounded-full bg-[#e9e5d7] px-3 py-1 text-xs font-semibold text-[#536b61]">{staff.data?.members.length ?? 0}</span>
      </div>
      {staff.isLoading && <p className="mt-4 text-sm text-[#687a71]">{t.loading}</p>}
      {staff.isError && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff1ed] p-4 text-sm text-[#9a4435]"><span>{t.loadFailed}</span><button type="button" onClick={() => void staff.refetch()} className="font-bold underline">{t.retry}</button></div>}
      {staff.data && !staff.data.members.length && <p className="mt-4 rounded-xl bg-[#f5f1e6] p-4 text-sm text-[#687a71]">{t.empty}</p>}
      {!!staff.data?.members.length && <ul className="mt-4 divide-y divide-[#ece7d9]">
        {staff.data.members.map(member => {
          const memberRole = member.role as PartnerStaffRole;
          return <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-2 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${member.owner ? "bg-[#e7efe4] text-[#28695a]" : "bg-[#f0ead9] text-[#9a6344]"}`}>
                {member.owner ? <ShieldCheck size={17} /> : <Users size={17} />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#173d35]">{member.email ?? t.accountUnavailable}</p>
                <p className="mt-1 text-xs text-[#687a71]">{member.owner ? t.owner : roleLabels[language][memberRole]}</p>
              </div>
            </div>
            {!member.owner && member.email && <form onSubmit={event => updateRole(event, member.email!)} className="flex items-center gap-2">
              <select
                name="role"
                defaultValue={member.role}
                aria-label={`${t.role}: ${member.email}`}
                className="min-h-10 rounded-lg border border-[#d8d2c4] bg-white px-2 text-xs text-[#173d35]"
              >
                {roleOptions.map(option => <option key={option.value} value={option.value}>{t[option.key]}</option>)}
              </select>
              <button type="submit" disabled={assignStaff.isPending} className="rounded-lg px-2.5 py-2 text-xs font-bold text-[#28695a] hover:bg-[#edf4ee] disabled:opacity-50">{t.changeRole}</button>
            </form>}
            {!member.owner && <button
              type="button"
              onClick={() => remove(member.userId)}
              disabled={removeStaff.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[#9a4435] transition hover:bg-[#fff1ed] disabled:opacity-50"
            >
              <Trash2 size={14} />{t.remove}
            </button>}
            {member.owner && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf4ee] px-3 py-1.5 text-xs font-semibold text-[#315e42]"><Check size={13} />{t.owner}</span>}
          </li>;
        })}
      </ul>}
    </article>
  </section>;
}
