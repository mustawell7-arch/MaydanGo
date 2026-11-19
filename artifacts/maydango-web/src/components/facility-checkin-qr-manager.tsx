import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  getGetFacilityCheckinPointsQueryKey,
  useCreateFacilityCheckinPoint,
  useDeactivateFacilityCheckinPoint,
  useGetFacilityCheckinPoints,
  useIssueFacilityCheckinQr,
  useUpdateFacilityCheckinPoint,
} from "@workspace/api-client-react";
import type {
  FacilityCheckinPoint,
  FacilityCheckinPointInput,
  FacilityCheckinPointUpdate,
  FacilityCheckinQrActivityAction,
  FacilityCheckinQrMode,
  FacilityProfile,
} from "@workspace/api-client-react";
import { AlertTriangle, Clock3, MapPin, Pencil, Plus, Printer, QrCode, RefreshCw, Save, ShieldAlert, X } from "lucide-react";

type Language = "en" | "ar" | "ku";
type LocalizedLabel = { en: string; ar: string; ku: string };
type PointForm = {
  label: LocalizedLabel;
  latitude: string;
  longitude: string;
  radius: string;
  mode: FacilityCheckinQrMode;
};

const words = {
  en: {
    manage: "Check-in QR points", intro: "Each QR identifies a location only. Members still need an eligible booking, a valid location, and partner confirmation.",
    add: "Add check-in point", label: "Point name", latitude: "Latitude", longitude: "Longitude", radius: "Radius in metres",
    mode: "QR type", static: "Static · printed code", dynamic: "Dynamic · expires in 5 minutes", rotating: "Rotating · refreshes every minute",
    save: "Save point", cancel: "Cancel", create: "Create point", edit: "Edit point", update: "Save location",
    active: "Active", inactive: "Inactive", qrActive: "QR active", qrMissing: "No current QR", issue: "Show or issue QR",
    replace: "Replace printed QR", rotate: "Refresh QR", deactivate: "Deactivate", deactivateConfirm: "Deactivate this point? Its QR code will stop working, and the activity history will remain.",
    replaceConfirm: "Replace the printed QR? The existing printed code will stop working immediately.",
    expiryStatic: "This printed QR stays active until it is replaced or deactivated.",
    expiry: "Expires", saveQr: "Print or save this QR now. For security, MaydanGo does not store the original QR secret.",
    print: "Print QR", history: "Recent QR activity", noHistory: "No QR activity has been recorded.", noPoints: "No check-in points have been added.",
    loading: "Loading QR points…", failed: "QR point data could not be loaded.", error: "The change could not be saved. Refresh and try again.",
    risk: "Flagged for review", created: "Check-in point created.", savedMsg: "Check-in point saved.", deactivatedMsg: "Check-in point deactivated.",
    invalidCoordinates: "Enter a valid latitude, longitude, and radius.", englishRequired: "Enter the point name in all three languages.",
    point_created: "Check-in point created", point_updated: "Location details updated", point_deactivated: "Point deactivated",
    qr_issued: "Short-lived QR issued", qr_replaced: "Printed QR replaced", qr_rotated: "QR code rotated",
    scan_recorded: "Arrival recorded", scan_rejected: "Scan rejected",
  },
  ar: {
    manage: "نقاط تسجيل الحضور برمز QR", intro: "يحدد الرمز الموقع فقط. يحتاج العضو أيضاً إلى حجز مؤهل وموقع صحيح وتأكيد الشريك.",
    add: "إضافة نقطة حضور", label: "اسم النقطة", latitude: "خط العرض", longitude: "خط الطول", radius: "النطاق بالمتر",
    mode: "نوع الرمز", static: "ثابت · رمز للطباعة", dynamic: "متغير · تنتهي صلاحيته بعد 5 دقائق", rotating: "متجدد · يتغير كل دقيقة",
    save: "حفظ النقطة", cancel: "إلغاء", create: "إنشاء نقطة", edit: "تعديل النقطة", update: "حفظ الموقع",
    active: "نشط", inactive: "غير نشط", qrActive: "الرمز نشط", qrMissing: "لا يوجد رمز حالي", issue: "عرض الرمز أو إصداره",
    replace: "استبدال الرمز المطبوع", rotate: "تحديث الرمز", deactivate: "إيقاف", deactivateConfirm: "هل تريد إيقاف هذه النقطة؟ سيتوقف الرمز عن العمل مع الاحتفاظ بسجل النشاط.",
    replaceConfirm: "هل تريد استبدال الرمز المطبوع؟ سيتوقف الرمز الحالي عن العمل فوراً.",
    expiryStatic: "يبقى الرمز المطبوع نشطاً حتى استبداله أو إيقافه.",
    expiry: "ينتهي", saveQr: "احفظ هذا الرمز أو اطبعه الآن. لا يحتفظ MaydanGo بالسر الأصلي للرمز.",
    print: "طباعة الرمز", history: "نشاط الرموز الأخير", noHistory: "لم يُسجل أي نشاط للرموز بعد.", noPoints: "لم تتم إضافة نقاط حضور.",
    loading: "جارٍ تحميل نقاط QR…", failed: "تعذر تحميل بيانات نقاط QR.", error: "تعذر حفظ التغيير. حدّث الصفحة وحاول مرة أخرى.",
    risk: "محدد للمراجعة", created: "تم إنشاء نقطة الحضور.", savedMsg: "تم حفظ نقطة الحضور.", deactivatedMsg: "تم إيقاف نقطة الحضور.",
    invalidCoordinates: "أدخل خط العرض والطول والنطاق بشكل صحيح.", englishRequired: "أدخل اسم النقطة باللغات الثلاث.",
    point_created: "تم إنشاء نقطة حضور", point_updated: "تم تحديث تفاصيل الموقع", point_deactivated: "تم إيقاف النقطة",
    qr_issued: "تم إصدار رمز قصير الصلاحية", qr_replaced: "تم استبدال الرمز المطبوع", qr_rotated: "تم تجديد الرمز",
    scan_recorded: "تم تسجيل الوصول", scan_rejected: "تم رفض المسح",
  },
  ku: {
    manage: "خاڵەکانی QR بۆ تۆمارکردنی ئامادەبوون", intro: "QR تەنها شوێنەکە دیاری دەکات. ئەندام پێویستی بە حجزی گونجاو، شوێنی دروست و پشتڕاستکردنەوەی هاوبەش هەیە.",
    add: "زیادکردنی خاڵی ئامادەبوون", label: "ناوی خاڵ", latitude: "پانی", longitude: "درێژی", radius: "مەودا بە مەتر",
    mode: "جۆری QR", static: "جێگیر · کۆدی چاپکراو", dynamic: "گۆڕاو · دوای ٥ خولەک بەسەردەچێت", rotating: "نوێبووەوە · هەر خولەکێک دەگۆڕێت",
    save: "پاشەکەوتکردنی خاڵ", cancel: "پاشگەزبوونەوە", create: "دروستکردنی خاڵ", edit: "دەستکاریکردنی خاڵ", update: "پاشەکەوتکردنی شوێن",
    active: "چالاک", inactive: "ناچالاک", qrActive: "QR چالاکە", qrMissing: "QR ـی ئێستا نییە", issue: "پیشاندان یان دەرکردنی QR",
    replace: "گۆڕینی QR ـی چاپکراو", rotate: "نوێکردنەوەی QR", deactivate: "ناچالاککردن", deactivateConfirm: "ئەم خاڵە ناچالاک بکرێت؟ QR ـەکە کار ناکات و مێژووی چالاکی دەمێنێتەوە.",
    replaceConfirm: "QR ـی چاپکراو بگۆڕدرێت؟ QR ـی ئێستا دەستبەجێ کار ناکات.",
    expiryStatic: "ئەم QR ـەی چاپکراو چالاک دەمێنێتەوە تا بگۆڕدرێت یان ناچالاک بکرێت.",
    expiry: "بەسەردەچێت", saveQr: "ئێستا QR ـەکە چاپ بکە یان پاشەکەوتی بکە. MaydanGo نهێنیی بنەڕەتی QR پاشەکەوت ناکات.",
    print: "چاپکردنی QR", history: "چالاکییەکانی نوێی QR", noHistory: "هێشتا هیچ چالاکییەکی QR تۆمار نەکراوە.", noPoints: "هیچ خاڵێکی ئامادەبوون زیاد نەکراوە.",
    loading: "خاڵەکانی QR بار دەکرێن…", failed: "بارکردنی زانیاری خاڵەکانی QR سەرکەوتوو نەبوو.", error: "پاشەکەوتکردنی گۆڕانکارییەکە سەرکەوتوو نەبوو. نوێی بکەرەوە و دووبارە هەوڵ بدە.",
    risk: "بۆ پێداچوونەوە دیاریکراوە", created: "خاڵی ئامادەبوون دروست کرا.", savedMsg: "خاڵی ئامادەبوون پاشەکەوت کرا.", deactivatedMsg: "خاڵی ئامادەبوون ناچالاک کرا.",
    invalidCoordinates: "پانی و درێژی و مەودایەکی دروست بنووسە.", englishRequired: "ناوی خاڵەکە بە هەرسێ زمان بنووسە.",
    point_created: "خاڵی ئامادەبوون دروست کرا", point_updated: "وردەکاریی شوێن نوێ کرایەوە", point_deactivated: "خاڵ ناچالاک کرا",
    qr_issued: "QR ـی کورت‌ماوە دەرچوو", qr_replaced: "QR ـی چاپکراو گۆڕدرا", qr_rotated: "QR نوێ کرایەوە",
    scan_recorded: "گەیشتن تۆمار کرا", scan_rejected: "سکان ڕەتکرایەوە",
  },
} as const;

const inputClass = "mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15";
const initialForm = (facility: FacilityProfile): PointForm => ({
  label: { en: "", ar: "", ku: "" },
  latitude: facility.latitude === null ? "" : String(facility.latitude),
  longitude: facility.longitude === null ? "" : String(facility.longitude),
  radius: "100",
  mode: "static",
});
const formatDate = (value: string, lang: Language) => new Intl.DateTimeFormat(lang === "en" ? "en-IQ" : lang === "ar" ? "ar-IQ" : "ku-IQ", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baghdad",
}).format(new Date(value));

export function FacilityCheckinQrManager({ facility, lang }: { facility: FacilityProfile; lang: Language }) {
  const copy = words[lang];
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<PointForm>(() => initialForm(facility));
  const [formOpen, setFormOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<FacilityCheckinPoint | null>(null);
  const [activeQr, setActiveQr] = useState<{ pointId: string; token: string; expiresAt: string | null } | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const query = useGetFacilityCheckinPoints(facility.id, { query: { enabled: expanded, refetchInterval: expanded ? 15000 : false } });
  const create = useCreateFacilityCheckinPoint();
  const update = useUpdateFacilityCheckinPoint();
  const issue = useIssueFacilityCheckinQr();
  const deactivate = useDeactivateFacilityCheckinPoint();
  const issueRef = useRef(issue.mutateAsync);
  issueRef.current = issue.mutateAsync;

  useEffect(() => {
    if (!expanded || !activePointId || activeQr?.pointId !== activePointId) return;
    const point = query.data?.points.find(item => item.id === activePointId);
    if (point?.mode !== "rotating" || !point.active) return;
    const timer = window.setInterval(() => {
      void issueRef.current({ id: facility.id, pointId: point.id }).then(result => {
        setActiveQr({ pointId: point.id, token: result.token, expiresAt: result.expiresAt });
        void client.invalidateQueries({ queryKey: getGetFacilityCheckinPointsQueryKey(facility.id) });
      }).catch(() => setError(copy.error));
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [activePointId, activeQr?.pointId, client, copy.error, expanded, facility.id, query.data?.points]);

  const resetForm = () => {
    setForm(initialForm(facility));
    setEditingPoint(null);
    setFormOpen(false);
    setError("");
  };
  const invalidate = () => client.invalidateQueries({ queryKey: getGetFacilityCheckinPointsQueryKey(facility.id) });
  const openCreate = () => { setForm(initialForm(facility)); setEditingPoint(null); setFormOpen(true); setError(""); };
  const openEdit = (point: FacilityCheckinPoint) => {
    setForm({
      label: { ...point.label },
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      radius: String(point.radius),
      mode: point.mode,
    });
    setEditingPoint(point);
    setFormOpen(true);
    setError("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const latitude = Number(form.latitude), longitude = Number(form.longitude), radius = Number(form.radius);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude)
      || longitude < -180 || longitude > 180 || !Number.isInteger(radius) || radius < 25 || radius > 800) {
      setError(copy.invalidCoordinates);
      return;
    }
    const label = { en: form.label.en.trim(), ar: form.label.ar.trim(), ku: form.label.ku.trim() };
    if (Object.values(label).some(value => !value)) { setError(copy.englishRequired); return; }
    setError("");
    if (editingPoint) {
      const data: FacilityCheckinPointUpdate = { label, latitude, longitude, radius };
      update.mutate({ id: facility.id, pointId: editingPoint.id, data }, {
        onSuccess: () => { void invalidate(); setSuccess(copy.savedMsg); resetForm(); },
        onError: () => setError(copy.error),
      });
      return;
    }
    const data: FacilityCheckinPointInput = { label, latitude, longitude, radius, mode: form.mode };
    create.mutate({ id: facility.id, data }, {
      onSuccess: result => {
        void invalidate();
        setActivePointId(result.point.id);
        setActiveQr({ pointId: result.point.id, token: result.token, expiresAt: result.expiresAt });
        setSuccess(copy.created);
        resetForm();
      },
      onError: () => setError(copy.error),
    });
  };
  const showQr = (point: FacilityCheckinPoint) => {
    if (point.mode === "static" && point.hasActiveQr && !window.confirm(copy.replaceConfirm)) return;
    setError("");
    issue.mutate({ id: facility.id, pointId: point.id }, {
      onSuccess: result => {
        setActivePointId(point.id);
        setActiveQr({ pointId: point.id, token: result.token, expiresAt: result.expiresAt });
        setSuccess("");
        void invalidate();
      },
      onError: () => setError(copy.error),
    });
  };
  const deactivatePoint = (point: FacilityCheckinPoint) => {
    if (!window.confirm(copy.deactivateConfirm)) return;
    deactivate.mutate({ id: facility.id, pointId: point.id }, {
      onSuccess: () => {
        if (activePointId === point.id) { setActivePointId(null); setActiveQr(null); }
        setSuccess(copy.deactivatedMsg);
        void invalidate();
      },
      onError: () => setError(copy.error),
    });
  };
  const pointLabel = (point: FacilityCheckinPoint) => point.label[lang] || point.label.en;
  const activityLabel = (action: FacilityCheckinQrActivityAction) => copy[action] ?? action.replaceAll("_", " ");
  const busy = create.isPending || update.isPending || issue.isPending || deactivate.isPending;

  return <section dir={lang === "en" ? "ltr" : "rtl"} className="mt-4 border-t border-[#ece7d9] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><QrCode size={16} className="text-[#a76445]" /><h3 className="text-sm font-bold">{copy.manage}</h3></div>
      <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#d8d2c4] px-3 py-2 text-xs font-semibold text-[#36564b] hover:bg-[#f1eddf]" onClick={() => setExpanded(value => !value)}>
        {expanded ? <X size={14} /> : <QrCode size={14} />}{expanded ? copy.cancel : copy.manage}
      </button>
    </div>
    {expanded && <>
      <p className="mt-2 text-xs leading-5 text-[#687a71]">{copy.intro}</p>
      {success && <p role="status" className="mt-3 rounded-xl bg-[#edf4e8] px-3 py-2 text-xs text-[#365f43]">{success}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-[#fff5f1] px-3 py-2 text-xs text-[#9a4435]">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#174d43] px-3 py-2 text-xs font-semibold text-[#fff9e9] disabled:opacity-50" disabled={busy} onClick={openCreate}>
          <Plus size={14} />{copy.add}
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#d8d2c4] px-3 py-2 text-xs font-semibold text-[#36564b]" onClick={() => void query.refetch()}>
          <RefreshCw size={14} />{copy.loading}
        </button>
      </div>
      {formOpen && <form onSubmit={submit} className="mt-4 rounded-2xl border border-[#e3ddce] bg-[#f5f1e6] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-[#51665e]">{copy.label} · EN / AR / KU</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">{(["en", "ar", "ku"] as const).map(language => <input key={language} dir={language === "en" ? "ltr" : "rtl"} aria-label={`${copy.label} ${language.toUpperCase()}`} placeholder={language.toUpperCase()} maxLength={500} className={inputClass} value={form.label[language]} onChange={event => setForm(value => ({ ...value, label: { ...value.label, [language]: event.target.value } }))} />)}</div>
          </fieldset>
          <label className="text-xs font-semibold text-[#51665e]">{copy.latitude}<input required type="number" step="any" min="-90" max="90" className={inputClass} value={form.latitude} onChange={event => setForm(value => ({ ...value, latitude: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-[#51665e]">{copy.longitude}<input required type="number" step="any" min="-180" max="180" className={inputClass} value={form.longitude} onChange={event => setForm(value => ({ ...value, longitude: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-[#51665e]">{copy.radius}<input required type="number" min="25" max="800" step="1" className={inputClass} value={form.radius} onChange={event => setForm(value => ({ ...value, radius: event.target.value }))} /></label>
          {!editingPoint && <label className="text-xs font-semibold text-[#51665e]">{copy.mode}<select className={inputClass} value={form.mode} onChange={event => setForm(value => ({ ...value, mode: event.target.value as FacilityCheckinQrMode }))}>
            <option value="static">{copy.static}</option><option value="dynamic">{copy.dynamic}</option><option value="rotating">{copy.rotating}</option>
          </select></label>}
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-[#9a4435]">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d8d2c4] px-3 py-2 text-xs font-semibold text-[#36564b]" onClick={resetForm}>{copy.cancel}</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#174d43] px-3 py-2 text-xs font-semibold text-[#fff9e9] disabled:opacity-50">
            <Save size={14} />{editingPoint ? copy.update : copy.create}
          </button>
        </div>
      </form>}
      {query.isLoading ? <p className="mt-4 text-xs text-[#687a71]">{copy.loading}</p>
        : query.isError ? <p role="alert" className="mt-4 text-xs text-[#9a4435]">{copy.failed}</p>
          : query.data?.points.length ? <div className="mt-4 space-y-3">{query.data.points.map(point => <article key={point.id} className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-[#173d35]">{pointLabel(point)}</h4><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${point.active ? "bg-[#e1efdf] text-[#2d6d4a]" : "bg-[#eee8dc] text-[#687a71]"}`}>{point.active ? copy.active : copy.inactive}</span></div>
                <p className="mt-1 flex items-center gap-1 text-xs text-[#687a71]"><MapPin size={12} />{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)} · {point.radius} m · {copy[point.mode]}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[#687a71]"><Clock3 size={12} />{point.hasActiveQr ? copy.qrActive : copy.qrMissing}{point.activeQrExpiresAt ? ` · ${copy.expiry} ${formatDate(point.activeQrExpiresAt, lang)}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!point.active || busy} className="inline-flex items-center gap-1 rounded-lg border border-[#d8d2c4] px-2.5 py-2 text-[11px] font-semibold text-[#36564b] disabled:opacity-50" onClick={() => showQr(point)}><QrCode size={13} />{point.mode === "static" && point.hasActiveQr ? copy.replace : point.mode === "rotating" ? copy.rotate : copy.issue}</button>
                {point.active && <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#d8d2c4] px-2.5 py-2 text-[11px] font-semibold text-[#36564b] disabled:opacity-50" onClick={() => openEdit(point)}><Pencil size={13} />{copy.edit}</button>}
                {point.active && <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#dfb6aa] px-2.5 py-2 text-[11px] font-semibold text-[#9a4435] disabled:opacity-50" onClick={() => deactivatePoint(point)}><X size={13} />{copy.deactivate}</button>}
              </div>
            </div>
            {activeQr?.pointId === point.id && <div className="mt-4 grid gap-3 rounded-xl bg-[#f5f1e6] p-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="w-fit rounded-xl bg-white p-2"><QRCodeSVG value={activeQr.token} size={156} level="Q" includeMargin /></div>
              <div className="min-w-0"><p className="text-xs font-semibold text-[#173d35]">{activeQr.expiresAt ? `${copy.expiry} ${formatDate(activeQr.expiresAt, lang)}` : copy.expiryStatic}</p>
                <p className="mt-2 text-xs leading-5 text-[#687a71]">{copy.saveQr}</p>
                <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#d8d2c4] px-3 py-2 text-xs font-semibold text-[#36564b]" onClick={() => window.print()}><Printer size={13} />{copy.print}</button>
                {point.mode === "rotating" && <p className="mt-2 text-[10px] text-[#687a71]">{copy.rotate} · 45 s</p>}
              </div>
            </div>}
          </article>)}</div> : <p className="mt-4 rounded-xl bg-[#f5f1e6] p-3 text-xs text-[#687a71]">{copy.noPoints}</p>}
      {query.data?.activity.length ? <section className="mt-5">
        <h4 className="flex items-center gap-2 text-xs font-bold text-[#36564b]"><Clock3 size={14} />{copy.history}</h4>
        <ol className="mt-2 space-y-2">{query.data.activity.slice(0, 20).map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-[#f5f1e6] px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-[#36564b]">{item.riskFlag && <ShieldAlert size={13} className="text-[#9a4435]" />}{activityLabel(item.action)}{item.riskFlag && <span className="font-bold text-[#9a4435]">{copy.risk}</span>}</span>
          <time className="text-[#879187]">{formatDate(item.createdAt, lang)}</time>
          {item.reason && <span className="w-full text-[#687a71]">{item.reason}</span>}
        </li>)}</ol>
      </section> : query.data && <p className="mt-4 text-[11px] text-[#879187]">{copy.noHistory}</p>}
    </>}
  </section>;
}
