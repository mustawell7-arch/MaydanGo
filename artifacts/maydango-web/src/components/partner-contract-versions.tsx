import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  downloadPartnerContractVersion,
  getGetPartnerContractVersionsQueryKey,
  useCompletePartnerContractUpload,
  useGetPartnerContractVersions,
  useRequestPartnerContractUploadUrl,
  useReviewPartnerContractVersion,
} from "@workspace/api-client-react";
import type {
  PartnerContractReviewInput,
  PartnerContractUploadInput,
  PartnerContractVersion,
} from "@workspace/api-client-react";
import { ArrowDownToLine, Check, FileCheck2, Upload, X } from "lucide-react";
import type { PortalLanguage } from "@/pages/partner-operations";

const maxBytes = 10 * 1024 * 1024;
const inputClass = "mt-1 block w-full rounded-xl border border-[#d8d4c7] bg-white px-3 py-2.5 text-sm";

const copy: Record<PortalLanguage, {
  title: string; intro: string; upload: string; change: string; changePlaceholder: string;
  file: string; submit: string; uploadSuccess: string; uploadError: string; fileError: string;
  summaryError: string; downloadError: string; reviewSuccess: string; reviewError: string;
  empty: string; version: string; replaces: string; initial: string; current: string;
  uploadPending: string; submitted: string; approved: string; rejected: string; superseded: string;
  reviewNote: string; reviewNotePlaceholder: string; approve: string; reject: string;
  download: string; reviewRequired: string; partner: string; size: string;
}> = {
  en: {
    title: "Partner contract history",
    intro: "Upload a signed contract or a replacement. Previous versions remain in the record; only an approved version becomes current.",
    upload: "Upload a contract",
    change: "What changed?",
    changePlaceholder: "Briefly describe this contract or the changes from the previous version.",
    file: "Contract file (PDF, JPEG, or PNG; up to 10 MB)",
    submit: "Upload for review",
    uploadSuccess: "The contract was submitted for safety review.",
    uploadError: "The contract could not be uploaded. Check the file and try again.",
    fileError: "Choose a PDF, JPEG, or PNG file no larger than 10 MB.",
    summaryError: "Add a short description of at least 10 characters.",
    downloadError: "The contract file could not be downloaded.",
    reviewSuccess: "The review decision was saved.",
    reviewError: "The review decision could not be saved.",
    empty: "No contract versions have been uploaded.",
    version: "Version",
    replaces: "Replaces version",
    initial: "Initial version",
    current: "Current approved version",
    uploadPending: "Upload pending",
    submitted: "Awaiting review",
    approved: "Approved",
    rejected: "Rejected",
    superseded: "Superseded",
    reviewNote: "Review note",
    reviewNotePlaceholder: "Required when rejecting",
    approve: "Approve",
    reject: "Reject",
    download: "Download",
    reviewRequired: "A rejection reason of at least five characters is required.",
    partner: "Partner",
    size: "File size",
  },
  ar: {
    title: "سجل نسخ عقود الشريك",
    intro: "ارفع عقداً موقعاً أو نسخة بديلة. تبقى النسخ السابقة محفوظة، ولا تصبح النسخة الحالية إلا بعد اعتمادها.",
    upload: "رفع عقد",
    change: "ما التغيير؟",
    changePlaceholder: "اكتب وصفاً موجزاً للعقد أو للتغييرات عن النسخة السابقة.",
    file: "ملف العقد (PDF أو JPEG أو PNG، حتى 10 ميغابايت)",
    submit: "إرسال للمراجعة",
    uploadSuccess: "أُرسل العقد لمراجعة السلامة.",
    uploadError: "تعذر رفع العقد. تحقق من الملف ثم حاول مرة أخرى.",
    fileError: "اختر ملف PDF أو JPEG أو PNG لا يتجاوز 10 ميغابايت.",
    summaryError: "أضف وصفاً موجزاً لا يقل عن 10 أحرف.",
    downloadError: "تعذر تنزيل ملف العقد.",
    reviewSuccess: "تم حفظ قرار المراجعة.",
    reviewError: "تعذر حفظ قرار المراجعة.",
    empty: "لم تُرفع أي نسخ من العقد بعد.",
    version: "النسخة",
    replaces: "تحل محل النسخة",
    initial: "النسخة الأولى",
    current: "النسخة الحالية المعتمدة",
    uploadPending: "الرفع قيد الانتظار",
    submitted: "بانتظار المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    superseded: "مستبدل",
    reviewNote: "ملاحظة المراجعة",
    reviewNotePlaceholder: "مطلوبة عند الرفض",
    approve: "اعتماد",
    reject: "رفض",
    download: "تنزيل",
    reviewRequired: "اكتب سبباً للرفض لا يقل عن خمسة أحرف.",
    partner: "الشريك",
    size: "حجم الملف",
  },
  ku: {
    title: "مێژووی وەشانەکانی گرێبەستی هاوبەش",
    intro: "گرێبەستێکی واژۆکراو یان وەشانێکی نوێ باربکە. وەشانە پێشووەکان دەمێننەوە؛ تەنها وەشانی پەسەندکراو دەبێتە وەشانی چالاک.",
    upload: "بارکردنی گرێبەست",
    change: "چی گۆڕاوە؟",
    changePlaceholder: "بە کورتی گرێبەستەکە یان گۆڕانکارییەکانی وەشانی نوێ بنووسە.",
    file: "پەڕگەی گرێبەست (PDF، JPEG یان PNG؛ تا 10 MB)",
    submit: "ناردن بۆ پێداچوونەوە",
    uploadSuccess: "گرێبەستەکە بۆ پێداچوونەوەی سەلامەتی نێردرا.",
    uploadError: "بارکردنی گرێبەستەکە سەرکەوتوو نەبوو. پەڕگەکە بپشکنە و دووبارە هەوڵ بدە.",
    fileError: "پەڕگەی PDF، JPEG یان PNG هەڵبژێرە کە لە 10 MB زیاتر نەبێت.",
    summaryError: "پوختەیەکی کورت بە لانیکەم 10 پیت بنووسە.",
    downloadError: "داگرتنی پەڕگەی گرێبەست سەرکەوتوو نەبوو.",
    reviewSuccess: "بڕیاری پێداچوونەوە پاشەکەوت کرا.",
    reviewError: "پاشەکەوتکردنی بڕیارەکە سەرکەوتوو نەبوو.",
    empty: "هێشتا هیچ وەشانێکی گرێبەست بارنەکراوە.",
    version: "وەشان",
    replaces: "جێی وەشانی",
    initial: "وەشانی سەرەتایی",
    current: "وەشانی ئێستای پەسەندکراو",
    uploadPending: "بارکردن چاوەڕوانە",
    submitted: "چاوەڕوانی پێداچوونەوە",
    approved: "پەسەندکراو",
    rejected: "ڕەتکراوەتەوە",
    superseded: "جێگۆڕدراو",
    reviewNote: "تێبینی پێداچوونەوە",
    reviewNotePlaceholder: "لە کاتی ڕەتکردنەوەدا پێویستە",
    approve: "پەسەندکردن",
    reject: "ڕەتکردنەوە",
    download: "داگرتن",
    reviewRequired: "هۆکاری ڕەتکردنەوە بە لانیکەم پێنج پیت بنووسە.",
    partner: "هاوبەش",
    size: "قەبارەی پەڕگە",
  },
};

function fileMime(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const expected = extension === "pdf" ? "application/pdf"
    : extension === "jpg" || extension === "jpeg" ? "image/jpeg"
      : extension === "png" ? "image/png" : null;
  return expected && (!file.type || file.type === expected) ? expected : null;
}

function saveDocument(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "partner-contract";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function dateLabel(value: string, lang: PortalLanguage) {
  const locale = lang === "ar" ? "ar-IQ" : lang === "ku" ? "ckb-IQ" : "en-IQ";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC", numberingSystem: "latn" })
    .format(new Date(value));
}

export function PartnerContractVersions({ lang, role }: { lang: PortalLanguage; role: string }) {
  const t = copy[lang];
  const queryClient = useQueryClient();
  const versions = useGetPartnerContractVersions({ query: { refetchOnMount: "always", retry: false } });
  const requestUpload = useRequestPartnerContractUploadUrl();
  const completeUpload = useCompletePartnerContractUpload();
  const reviewVersion = useReviewPartnerContractVersion();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const isPartner = role === "partner";
  const isSafetyAdmin = role === "fraud_compliance_admin" || role === "super_admin";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetPartnerContractVersionsQueryKey() });
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("contractFile");
    const changeSummary = String(values.get("changeSummary") ?? "").trim();
    const contentType = file instanceof File ? fileMime(file) : null;
    if (!(file instanceof File) || !contentType || file.name.length > 180 || file.size < 1 || file.size > maxBytes) {
      setFeedback(t.fileError);
      return;
    }
    if (changeSummary.length < 10 || changeSummary.length > 2000) {
      setFeedback(t.summaryError);
      return;
    }
    setBusy(true);
    try {
      const input: PartnerContractUploadInput = {
        documentName: file.name,
        size: file.size,
        contentType,
        changeSummary,
      };
      const signed = await requestUpload.mutateAsync({ data: input });
      const result = await fetch(signed.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!result.ok) throw new Error("Private contract upload failed.");
      await completeUpload.mutateAsync({ id: signed.id });
      await refresh();
      form.reset();
      setFeedback(t.uploadSuccess);
    } catch {
      setFeedback(t.uploadError);
    } finally {
      setBusy(false);
    }
  };

  const download = async (version: PartnerContractVersion) => {
    setFeedback("");
    try {
      const blob = await downloadPartnerContractVersion(version.id);
      saveDocument(blob, version.documentName);
    } catch {
      setFeedback(t.downloadError);
    }
  };

  const submitReview = async (version: PartnerContractVersion, status: "approved" | "rejected") => {
    const reviewNote = reviewNotes[version.id]?.trim() || null;
    if (status === "rejected" && (!reviewNote || reviewNote.length < 5)) {
      setFeedback(t.reviewRequired);
      return;
    }
    const data: PartnerContractReviewInput = { status, reviewNote };
    setBusy(true);
    setFeedback("");
    try {
      await reviewVersion.mutateAsync({ id: version.id, data });
      await refresh();
      setFeedback(t.reviewSuccess);
    } catch {
      setFeedback(t.reviewError);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (status: PartnerContractVersion["status"]) => {
    const labels: Record<PartnerContractVersion["status"], string> = {
      upload_pending: t.uploadPending,
      submitted: t.submitted,
      approved: t.approved,
      rejected: t.rejected,
      superseded: t.superseded,
    };
    return labels[status];
  };

  return <section dir={lang === "en" ? "ltr" : "rtl"} className="mt-5 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
    <header className="flex items-start gap-3">
      <FileCheck2 size={20} className="mt-1 shrink-0 text-[#28695a]" />
      <div>
        <h3 className="font-display text-xl font-bold">{t.title}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687a71]">{t.intro}</p>
      </div>
    </header>
    {feedback && <p role="status" className="mt-4 rounded-xl bg-[#e1efdf] px-4 py-3 text-sm text-[#315e42]">{feedback}</p>}
    {isPartner && <form onSubmit={event => void upload(event)} className="mt-5 grid gap-3 rounded-2xl bg-[#f7f4e9] p-4">
      <h4 className="font-semibold">{t.upload}</h4>
      <label className="text-xs font-semibold">{t.file}
        <input name="contractFile" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className={inputClass} />
      </label>
      <label className="text-xs font-semibold">{t.change}
        <textarea name="changeSummary" required minLength={10} maxLength={2000} rows={3} placeholder={t.changePlaceholder} className={inputClass} />
      </label>
      <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#205f50] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
        <Upload size={15} />{t.submit}
      </button>
    </form>}
    {versions.isLoading && <p className="mt-5 text-sm text-[#687a71]">{t.submitted}…</p>}
    {versions.isError && <p role="alert" className="mt-5 text-sm text-[#a33d32]">{t.reviewError}</p>}
    {versions.data?.length === 0 && !versions.isLoading && <p className="mt-5 rounded-xl bg-[#f7f4e9] px-4 py-3 text-sm text-[#687a71]">{t.empty}</p>}
    <div className="mt-5 grid gap-3">
      {versions.data?.map(version => <article key={version.id} className="rounded-2xl border border-[#e3dfd4] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{t.version} {version.versionNumber}</h4>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                version.status === "approved" ? "bg-[#e1efdf] text-[#2d6d4a]"
                  : version.status === "rejected" ? "bg-[#f2dfd5] text-[#9a4435]"
                    : version.status === "superseded" ? "bg-[#edeae3] text-[#6c6a60]"
                      : "bg-[#e3ebf4] text-[#355b7a]"
              }`}>{statusLabel(version.status)}</span>
              {version.status === "approved" && <span className="text-xs font-semibold text-[#28695a]">{t.current}</span>}
            </div>
            <p className="mt-1 text-sm text-[#687a71]">{version.documentName}</p>
            {isSafetyAdmin && <p className="mt-1 text-xs text-[#687a71]">{t.partner}: {version.partnerName}</p>}
            <p className="mt-2 text-sm leading-5">{version.changeSummary}</p>
            <p className="mt-2 text-xs text-[#687a71]">
              {version.replacesVersionNumber === null ? t.initial : `${t.replaces} ${version.replacesVersionNumber}`}
              {" · "}{dateLabel(version.createdAt, lang)}
              {version.fileSize ? ` · ${(version.fileSize / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
            {version.reviewNote && <p className="mt-2 rounded-lg bg-[#f7f4e9] px-3 py-2 text-xs leading-5">{t.reviewNote}: {version.reviewNote}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {version.status !== "upload_pending" && <button type="button" onClick={() => void download(version)} className="inline-flex items-center gap-2 rounded-full border border-[#d8d4c7] px-3 py-2 text-xs font-semibold">
              <ArrowDownToLine size={14} />{t.download}
            </button>}
          </div>
        </div>
        {isSafetyAdmin && version.status === "submitted" && <div className="mt-4 border-t border-[#e3dfd4] pt-4">
          <label className="text-xs font-semibold">{t.reviewNote}
            <input value={reviewNotes[version.id] ?? ""} onChange={event => setReviewNotes(current => ({ ...current, [version.id]: event.target.value }))} maxLength={1000} placeholder={t.reviewNotePlaceholder} className={inputClass} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void submitReview(version, "approved")} className="inline-flex items-center gap-2 rounded-full bg-[#205f50] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              <Check size={14} />{t.approve}
            </button>
            <button type="button" disabled={busy} onClick={() => void submitReview(version, "rejected")} className="inline-flex items-center gap-2 rounded-full border border-[#c78e7c] px-4 py-2 text-xs font-bold text-[#9a4435] disabled:opacity-50">
              <X size={14} />{t.reject}
            </button>
          </div>
        </div>}
      </article>)}
    </div>
  </section>;
}
