import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completePartnerComplianceUpload,
  downloadPartnerComplianceDocument,
  getGetFacilityQualityControlQueryKey,
  useRequestPartnerComplianceUploadUrl,
  useReviewPartnerComplianceDocument,
} from "@workspace/api-client-react";
import type {
  PartnerComplianceDocument,
  PartnerComplianceDocumentUploadInput,
  PartnerComplianceDocumentReviewInput,
} from "@workspace/api-client-react";
import { ArrowDownToLine, FileCheck2, Upload } from "lucide-react";
import type { PortalLanguage } from "@/pages/partner-operations";

type DocumentType = PartnerComplianceDocumentUploadInput["documentType"];
type ReviewStatus = PartnerComplianceDocumentReviewInput["status"];

const copy = {
  en: {
    title: "Partner licences and insurance",
    intro: "Upload current facility licences, insurance certificates, and supporting files. Documents remain private and are reviewed by MaydanGo safety staff.",
    facility: "Facility",
    chooseFacility: "Choose a facility",
    type: "Document type",
    licence: "Operating licence",
    insurance: "Insurance certificate",
    supporting_document: "Supporting document",
    expires: "Expiry date",
    file: "File (PDF, JPEG, or PNG; up to 10 MB)",
    upload: "Upload for review",
    uploading: "Uploading securely…",
    requiredExpiry: "Add the expiry date for a licence or insurance document.",
    fileError: "Choose a PDF, JPEG, or PNG file under 10 MB.",
    uploadError: "The document could not be uploaded. Please check the file and try again.",
    uploadSuccess: "Document uploaded and submitted for review.",
    history: "Document history",
    noDocuments: "No partner documents have been uploaded.",
    download: "Download",
    expiresLabel: "Expires",
    status: "Status",
    submitted: "Awaiting review",
    approved: "Approved",
    rejected: "Rejected",
    reviewNote: "Review note",
    reviewStatus: "Decision",
    approve: "Approve",
    reject: "Reject",
    saveReview: "Save decision",
    reviewError: "Could not save the review. A rejection requires a reason of at least five characters.",
    reviewSuccess: "Review decision saved.",
    downloadError: "The private document could not be downloaded.",
  },
  ar: {
    title: "تراخيص الشريك وتأمينه",
    intro: "ارفع تراخيص المرفق ووثائق التأمين والملفات الداعمة السارية. تبقى المستندات خاصة ويراجعها فريق السلامة في MaydanGo.",
    facility: "المرفق",
    chooseFacility: "اختر مرفقاً",
    type: "نوع المستند",
    licence: "ترخيص التشغيل",
    insurance: "وثيقة التأمين",
    supporting_document: "مستند داعم",
    expires: "تاريخ الانتهاء",
    file: "الملف (PDF أو JPEG أو PNG؛ حتى 10 ميغابايت)",
    upload: "إرسال للمراجعة",
    uploading: "جارٍ الرفع بأمان…",
    requiredExpiry: "أضف تاريخ انتهاء الترخيص أو وثيقة التأمين.",
    fileError: "اختر ملف PDF أو JPEG أو PNG لا يتجاوز 10 ميغابايت.",
    uploadError: "تعذر رفع المستند. تحقق من الملف وحاول مجدداً.",
    uploadSuccess: "تم رفع المستند وإرساله للمراجعة.",
    history: "سجل المستندات",
    noDocuments: "لم تُرفع مستندات للشريك بعد.",
    download: "تنزيل",
    expiresLabel: "ينتهي في",
    status: "الحالة",
    submitted: "بانتظار المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    reviewNote: "ملاحظة المراجعة",
    reviewStatus: "القرار",
    approve: "اعتماد",
    reject: "رفض",
    saveReview: "حفظ القرار",
    reviewError: "تعذر حفظ المراجعة. يتطلب الرفض سبباً من خمسة أحرف على الأقل.",
    reviewSuccess: "تم حفظ قرار المراجعة.",
    downloadError: "تعذر تنزيل المستند الخاص.",
  },
  ku: {
    title: "مۆڵەت و بیمەی هاوبەش",
    intro: "مۆڵەتی کارکردنی شوێن، بەڵگەی بیمە و بەڵگەنامەی پشتیوانی بار بکە. بەڵگەنامەکان تایبەت دەمێننەوە و تیمی سەلامەتی MaydanGo پێداچوونەوەیان دەکات.",
    facility: "شوێن",
    chooseFacility: "شوێنێک هەڵبژێرە",
    type: "جۆری بەڵگەنامە",
    licence: "مۆڵەتی کارکردن",
    insurance: "بەڵگەی بیمە",
    supporting_document: "بەڵگەنامەی پشتیوانی",
    expires: "بەرواری بەسەرچوون",
    file: "فایل (PDF، JPEG یان PNG؛ تا 10 مێگابایت)",
    upload: "ناردن بۆ پێداچوونەوە",
    uploading: "بە پارێزراوی بار دەکرێت…",
    requiredExpiry: "بەرواری بەسەرچوونی مۆڵەت یان بیمە زیاد بکە.",
    fileError: "فایلی PDF، JPEG یان PNG تا 10 مێگابایت هەڵبژێرە.",
    uploadError: "بارکردنی بەڵگەنامە سەرکەوتوو نەبوو. فایلەکە بپشکنە و دووبارە هەوڵ بدە.",
    uploadSuccess: "بەڵگەنامەکە بارکرا و نێردرا بۆ پێداچوونەوە.",
    history: "مێژووی بەڵگەنامەکان",
    noDocuments: "هێشتا هیچ بەڵگەنامەیەکی هاوبەش بارنەکراوە.",
    download: "داگرتن",
    expiresLabel: "بەسەردەچێت",
    status: "دۆخ",
    submitted: "لە چاوەڕوانی پێداچوونەوەدایە",
    approved: "پەسەندکراوە",
    rejected: "ڕەتکراوەتەوە",
    reviewNote: "تێبینی پێداچوونەوە",
    reviewStatus: "بڕیار",
    approve: "پەسەندکردن",
    reject: "ڕەتکردنەوە",
    saveReview: "پاشەکەوتکردنی بڕیار",
    reviewError: "پاشەکەوتکردنی پێداچوونەوە سەرکەوتوو نەبوو. ڕەتکردنەوە هۆکارێکی لانیکەم پێنج پیت دەوێت.",
    reviewSuccess: "بڕیاری پێداچوونەوە پاشەکەوت کرا.",
    downloadError: "داگرتنی بەڵگەنامە تایبەتەکە سەرکەوتوو نەبوو.",
  },
} as const;

const fieldClass = "mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-50";
const quietClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#d8d2c4] px-3 py-2 text-sm font-semibold text-[#36564b] hover:bg-[#f1eddf] disabled:opacity-50";
const maxBytes = 10 * 1024 * 1024;

function fileMime(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}

function localizedDate(value: string, lang: PortalLanguage) {
  const locale = lang === "ar" ? "ar-IQ" : lang === "ku" ? "ckb-IQ" : "en-IQ";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC", numberingSystem: "latn" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function saveDocument(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "partner-document";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function PartnerComplianceDocuments({
  lang, role, facilities, documents,
}: {
  lang: PortalLanguage;
  role: string;
  facilities: Array<{ id: string; facility: string; city: string }>;
  documents: PartnerComplianceDocument[];
}) {
  const t = copy[lang];
  const queryClient = useQueryClient();
  const requestUpload = useRequestPartnerComplianceUploadUrl();
  const reviewDocument = useReviewPartnerComplianceDocument();
  const [facilityId, setFacilityId] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("licence");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const isPartner = role === "partner";
  const isSafetyAdmin = role === "fraud_compliance_admin" || role === "super_admin";

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const mime = file ? fileMime(file) : null;
    const expiresOn = String(values.get("expiresOn") ?? "") || null;
    if (!file || !mime || file.name.length > 180 || file.size < 1 || file.size > maxBytes) {
      setFeedback(t.fileError);
      return;
    }
    if (documentType !== "supporting_document" && !expiresOn) {
      setFeedback(t.requiredExpiry);
      return;
    }
    setBusy(true);
    try {
      const signed = await requestUpload.mutateAsync({
        data: {
          facilityId,
          documentType,
          documentName: file.name,
          size: file.size,
          expiresOn,
        },
      });
      const result = await fetch(signed.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: file,
      });
      if (!result.ok) throw new Error("Private file upload failed.");
      await completePartnerComplianceUpload(signed.id);
      await queryClient.invalidateQueries({ queryKey: getGetFacilityQualityControlQueryKey() });
      form.reset();
      setFile(null);
      setFeedback(t.uploadSuccess);
    } catch {
      setFeedback(t.uploadError);
    } finally {
      setBusy(false);
    }
  };

  const download = async (document: PartnerComplianceDocument) => {
    setFeedback("");
    try {
      const blob = await downloadPartnerComplianceDocument(document.id);
      saveDocument(blob, document.documentName);
    } catch {
      setFeedback(t.downloadError);
    }
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    setFeedback("");
    const values = new FormData(event.currentTarget);
    const data: PartnerComplianceDocumentReviewInput = {
      status: String(values.get("status")) as ReviewStatus,
      reviewNote: String(values.get("reviewNote") ?? "").trim() || null,
    };
    setBusy(true);
    try {
      await reviewDocument.mutateAsync({ id, data });
      await queryClient.invalidateQueries({ queryKey: getGetFacilityQualityControlQueryKey() });
      setFeedback(t.reviewSuccess);
    } catch {
      setFeedback(t.reviewError);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (status: string) => status === "approved" ? t.approved : status === "rejected" ? t.rejected : t.submitted;
  const typeLabel = (type: string) => type === "licence" ? t.licence : type === "insurance" ? t.insurance : t.supporting_document;

  return <section dir={lang === "en" ? "ltr" : "rtl"} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
    <header className="flex items-start gap-3">
      <FileCheck2 size={20} className="mt-1 shrink-0 text-[#28695a]" />
      <div>
        <h3 className="font-display text-xl font-bold">{t.title}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687a71]">{t.intro}</p>
      </div>
    </header>
    {feedback && <p role="status" className="mt-4 rounded-xl bg-[#e1efdf] px-4 py-3 text-sm text-[#315e42]">{feedback}</p>}
    {isPartner && <form onSubmit={event => void upload(event)} className="mt-5 grid gap-3 rounded-2xl bg-[#f7f4e9] p-4 sm:grid-cols-2">
      <label className="text-xs font-semibold sm:col-span-2">{t.facility}
        <select required value={facilityId} onChange={event => setFacilityId(event.target.value)} className={fieldClass}>
          <option value="">{t.chooseFacility}</option>
          {facilities.map(item => <option key={item.id} value={item.id}>{item.facility} · {item.city}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">{t.type}
        <select value={documentType} onChange={event => setDocumentType(event.target.value as DocumentType)} className={fieldClass}>
          <option value="licence">{t.licence}</option>
          <option value="insurance">{t.insurance}</option>
          <option value="supporting_document">{t.supporting_document}</option>
        </select>
      </label>
      <label className="text-xs font-semibold">{t.expires}
        <input name="expiresOn" type="date" required={documentType !== "supporting_document"} className={fieldClass} />
      </label>
      <label className="text-xs font-semibold sm:col-span-2">{t.file}
        <input required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={event => setFile(event.target.files?.[0] ?? null)}
          className={`${fieldClass} file:mr-3 file:rounded-lg file:border-0 file:bg-[#e9e5d7] file:px-3 file:py-2 file:text-xs file:font-semibold`} />
      </label>
      <button type="submit" disabled={busy || !facilityId} className={`${buttonClass} sm:col-span-2`}>
        <Upload size={15} />{busy ? t.uploading : t.upload}
      </button>
    </form>}
    <div className="mt-6">
      <h4 className="font-display text-lg font-bold">{t.history}</h4>
      {documents.length ? <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {documents.map(document => <article key={document.id} className="rounded-2xl border border-[#e7e1d4] bg-[#fbf9f1] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h5 className="break-words font-bold">{typeLabel(document.documentType)}</h5>
              <p className="mt-1 break-words text-sm text-[#51665e]">{document.documentName}</p>
              <p className="mt-1 text-xs text-[#687a71]">{document.facility} · {document.city}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${document.status === "approved" ? "bg-[#e1efdf] text-[#2d6d4a]" : document.status === "rejected" ? "bg-[#f2dfd5] text-[#9a4435]" : "bg-[#fff0d6] text-[#8a5b20]"}`}>
              {statusLabel(document.status)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7d9] pt-3">
            <div className="text-xs text-[#687a71]">
              <p>{t.status}: {statusLabel(document.status)}</p>
              {document.expiresOn && <p className="mt-1">{t.expiresLabel}: {localizedDate(document.expiresOn, lang)}</p>}
              {document.reviewNote && <p className="mt-1 max-w-xl break-words">{t.reviewNote}: {document.reviewNote}</p>}
            </div>
            {document.contentType && <button type="button" className={quietClass} onClick={() => void download(document)}>
              <ArrowDownToLine size={14} />{t.download}
            </button>}
          </div>
          {isSafetyAdmin && document.status === "submitted" && <form onSubmit={event => void submitReview(event, document.id)} className="mt-4 grid gap-2 border-t border-[#ece7d9] pt-3 sm:grid-cols-[1fr_2fr_auto]">
            <label className="text-xs font-semibold">{t.reviewStatus}
              <select name="status" className={fieldClass}><option value="approved">{t.approve}</option><option value="rejected">{t.reject}</option></select>
            </label>
            <label className="text-xs font-semibold">{t.reviewNote}
              <input name="reviewNote" maxLength={1000} className={fieldClass} />
            </label>
            <button type="submit" disabled={busy} className={`${buttonClass} self-end`}><FileCheck2 size={14} />{t.saveReview}</button>
          </form>}
        </article>)}
      </div> : <p className="mt-3 rounded-xl bg-[#f7f4e9] p-4 text-sm text-[#687a71]">{t.noDocuments}</p>}
    </div>
  </section>;
}
