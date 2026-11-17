import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPublicCatalogQueryKey,
  getGetPublicCoursesQueryKey,
  getGetPublicSponsoredContentQueryKey,
  getGetSponsoredContentCampaignsQueryKey,
  useCreateSponsoredContentCampaign,
  useGetPublicCatalog,
  useGetPublicCourses,
  useGetSponsoredContentCampaigns,
  useUpdateSponsoredContentCampaign,
  type SponsoredContentPlacementType,
  type SponsoredContentType,
  type SponsoredContentCampaignStatus,
} from "@workspace/api-client-react";

type Language = "en" | "ar" | "ku";
type MembershipTier = "M" | "L" | "XL";
type TargetOption = { id: string; label: string; category: string };

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: "Sponsored events and courses",
    intro: "Promote published events or courses with clear labels. Campaigns never create memberships or change booking and course access.",
    name: "Campaign name",
    type: "Content type",
    event: "Event",
    course: "Course",
    target: "Published content",
    chooseTarget: "Choose published content",
    placements: "Where should it appear?",
    featuredEvent: "Featured event",
    featuredCourse: "Featured course",
    homePromotion: "Home-page promotion",
    categoryFeatured: "Featured in its category",
    city: "Target audience city (optional)",
    cityHint: "For example, Baghdad or Erbil",
    tiers: "Member tiers (optional)",
    allTiers: "Leave all unchecked to show to everyone.",
    start: "Starts (Baghdad time)",
    end: "Ends (Baghdad time)",
    status: "Initial status",
    draft: "Draft",
    active: "Active",
    paused: "Paused",
    create: "Create campaign",
    saving: "Saving…",
    campaigns: "Event and course campaigns",
    noCampaigns: "No event or course campaigns yet.",
    noTargets: "No published events or courses are available for promotion.",
    impressions: "Impressions",
    clicks: "Clicks",
    conversions: "Conversions",
    pause: "Pause",
    activate: "Activate",
    refresh: "Refresh",
    dateError: "Choose an end time after the start time.",
    placementError: "Choose at least one compatible placement.",
    targetError: "Choose a published event or course.",
    saveError: "The campaign could not be saved. Check the selected content and administrator access.",
    saved: "Campaign saved.",
    loadError: "Campaigns could not be loaded. Check your administrator access and try again.",
    categoryHint: "Uses the published content category.",
    selectContentType: "Select a content type first.",
  },
  ar: {
    title: "الترويج للفعاليات والدورات",
    intro: "روّج الفعاليات أو الدورات المنشورة مع توضيح أنها إعلانات. لا تغيّر الحملات العضوية أو صلاحيات الحجز والوصول إلى الدورات.",
    name: "اسم الحملة",
    type: "نوع المحتوى",
    event: "فعالية",
    course: "دورة",
    target: "المحتوى المنشور",
    chooseTarget: "اختر محتوى منشوراً",
    placements: "أين يظهر الترويج؟",
    featuredEvent: "فعالية مميزة",
    featuredCourse: "دورة مميزة",
    homePromotion: "ترويج في الصفحة الرئيسية",
    categoryFeatured: "إبراز ضمن الفئة المطابقة",
    city: "مدينة الجمهور المستهدف (اختياري)",
    cityHint: "مثال: بغداد أو أربيل",
    tiers: "فئات العضوية (اختياري)",
    allTiers: "اترك الفئات دون تحديد ليظهر الترويج للجميع.",
    start: "تاريخ البدء (توقيت بغداد)",
    end: "تاريخ الانتهاء (توقيت بغداد)",
    status: "الحالة الأولية",
    draft: "مسودة",
    active: "نشطة",
    paused: "متوقفة",
    create: "إنشاء حملة",
    saving: "جارٍ الحفظ…",
    campaigns: "حملات الفعاليات والدورات",
    noCampaigns: "لا توجد حملات للفعاليات أو الدورات بعد.",
    noTargets: "لا توجد فعاليات أو دورات منشورة متاحة للترويج.",
    impressions: "مرات الظهور",
    clicks: "النقرات",
    conversions: "التحويلات",
    pause: "إيقاف",
    activate: "تفعيل",
    refresh: "تحديث",
    dateError: "اختر وقت انتهاء بعد وقت البدء.",
    placementError: "اختر موضعاً واحداً مناسباً على الأقل.",
    targetError: "اختر فعالية أو دورة منشورة.",
    saveError: "تعذر حفظ الحملة. تحقق من المحتوى المحدد وصلاحية المسؤول.",
    saved: "تم حفظ الحملة.",
    loadError: "تعذر تحميل الحملات. تحقق من صلاحية حسابك وحاول مجدداً.",
    categoryHint: "تُستخدم فئة المحتوى المنشور.",
    selectContentType: "اختر نوع المحتوى أولاً.",
  },
  ku: {
    title: "ڕیکلامی چالاکی و کۆرس",
    intro: "چالاکی و کۆرسی بڵاوکراوە بە نیشانەی ڕوونی ڕیکلام پێشکەش بکە. کەمپەینەکان مافی ئەندامێتی، حجز یان دەستگەیشتن بە کۆرس ناگۆڕن.",
    name: "ناوی کەمپەین",
    type: "جۆری ناوەڕۆک",
    event: "چالاکی",
    course: "کۆرس",
    target: "ناوەڕۆکی بڵاوکراوە",
    chooseTarget: "ناوەڕۆکێکی بڵاوکراوە هەڵبژێرە",
    placements: "لە کوێ پیشان بدرێت؟",
    featuredEvent: "چالاکیی تایبەت",
    featuredCourse: "کۆرسی تایبەت",
    homePromotion: "ڕیکلامی پەڕەی سەرەکی",
    categoryFeatured: "پیشاندان لە پۆلی هاوتا",
    city: "شاری جەماوەری ئامانج (ئارەزوومەندانە)",
    cityHint: "بۆ نموونە: بەغدا یان هەولێر",
    tiers: "پلەکانی ئەندامێتی (ئارەزوومەندانە)",
    allTiers: "هەموو پلەکان بەبێ نیشانە بهێڵەوە بۆ پیشاندان بۆ هەمووان.",
    start: "دەستپێک (کاتی بەغدا)",
    end: "کۆتایی (کاتی بەغدا)",
    status: "دۆخی سەرەتایی",
    draft: "ڕەشنووس",
    active: "چالاک",
    paused: "وەستاو",
    create: "دروستکردنی کەمپەین",
    saving: "پاشەکەوت دەکرێت…",
    campaigns: "کەمپەینی چالاکی و کۆرس",
    noCampaigns: "هێشتا هیچ کەمپەینێکی چالاکی یان کۆرس نییە.",
    noTargets: "هیچ چالاکی یان کۆرسێکی بڵاوکراوە بۆ ڕیکلام بەردەست نییە.",
    impressions: "جارانی پیشاندان",
    clicks: "کرتەکان",
    conversions: "ئەنجامەکان",
    pause: "وەستاندن",
    activate: "چالاککردن",
    refresh: "نوێکردنەوە",
    dateError: "کاتێکی کۆتایی دوای کاتی دەستپێک هەڵبژێرە.",
    placementError: "لانیکەم یەک شوێنی گونجاو هەڵبژێرە.",
    targetError: "چالاکی یان کۆرسێکی بڵاوکراوە هەڵبژێرە.",
    saveError: "پاشەکەوتکردنی کەمپەین سەرکەوتوو نەبوو. ناوەڕۆک و دەسەڵاتەکان بپشکنە.",
    saved: "کەمپەین پاشەکەوت کرا.",
    loadError: "بارکردنی کەمپەینەکان سەرکەوتوو نەبوو. دەسەڵاتی هەژمارەکەت بپشکنە.",
    categoryHint: "پۆلی ناوەڕۆکی بڵاوکراوە بەکاردێت.",
    selectContentType: "سەرەتا جۆری ناوەڕۆک هەڵبژێرە.",
  },
};

const placementLabels: Record<SponsoredContentPlacementType, string> = {
  featured_event: "featuredEvent",
  featured_course: "featuredCourse",
  home_promotion: "homePromotion",
  category_featured: "categoryFeatured",
};
const tiers: MembershipTier[] = ["M", "L", "XL"];
const fieldClass = "mt-1 h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15";
const toBaghdadInput = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const fromBaghdadInput = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const localized = (value: { en: string; ar: string; ku: string } | null | undefined, language: Language) =>
  value?.[language]?.trim() || value?.en?.trim() || "";

export function SponsoredContentCampaigns({ language }: { language: Language }) {
  const text = copy[language];
  const queryClient = useQueryClient();
  const eventsQuery = useGetPublicCatalog({ query: { queryKey: getGetPublicCatalogQueryKey() } });
  const coursesQuery = useGetPublicCourses({ query: { queryKey: getGetPublicCoursesQueryKey() } });
  const campaignsQuery = useGetSponsoredContentCampaigns({ query: { queryKey: getGetSponsoredContentCampaignsQueryKey(), retry: false } });
  const createCampaign = useCreateSponsoredContentCampaign();
  const updateCampaign = useUpdateSponsoredContentCampaign();
  const [targetType, setTargetType] = useState<SponsoredContentType>("event");
  const [campaignName, setCampaignName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [placements, setPlacements] = useState<SponsoredContentPlacementType[]>([]);
  const [targetCity, setTargetCity] = useState("");
  const [targetTiers, setTargetTiers] = useState<MembershipTier[]>([]);
  const [startsAt, setStartsAt] = useState(() => toBaghdadInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toBaghdadInput(new Date(Date.now() + 7 * 86_400_000)));
  const [status, setStatus] = useState<SponsoredContentCampaignStatus>("draft");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const targetOptions = useMemo<TargetOption[]>(() => targetType === "event"
    ? (eventsQuery.data ?? []).filter(item => item.kind === "event" && !item.additionalPayment).map(item => ({
      id: item.id,
      label: `${localized(item.localizedTitle, language) || item.title} · ${item.city}`,
      category: item.category,
    }))
    : (coursesQuery.data ?? []).map(item => ({
      id: item.id,
      label: `${localized(item.localizedTitle, language)} · ${item.category}`,
      category: item.category,
    })),
  [targetType, eventsQuery.data, coursesQuery.data, language]);
  const selectedTarget = targetOptions.find(item => item.id === targetId);
  const options: SponsoredContentPlacementType[] = [
    targetType === "event" ? "featured_event" : "featured_course",
    "home_promotion",
    "category_featured",
  ];
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSponsoredContentCampaignsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetPublicSponsoredContentQueryKey() }),
    ]);
  };
  const inputFor = (nextStatus: SponsoredContentCampaignStatus) => ({
    campaignName: campaignName.trim(),
    targetType,
    targetId,
    placementTypes: placements,
    targetCity: targetCity.trim() || null,
    targetActivity: placements.includes("category_featured") ? selectedTarget?.category ?? null : null,
    targetMembershipTiers: targetTiers,
    startsAt: fromBaghdadInput(startsAt),
    endsAt: fromBaghdadInput(endsAt),
    status: nextStatus,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    if (!targetId || !selectedTarget) {
      setMessage(text.targetError);
      setIsError(true);
      return;
    }
    if (!placements.length) {
      setMessage(text.placementError);
      setIsError(true);
      return;
    }
    const start = new Date(`${startsAt}:00+03:00`);
    const end = new Date(`${endsAt}:00+03:00`);
    if (!startsAt || !endsAt || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setMessage(text.dateError);
      setIsError(true);
      return;
    }
    createCampaign.mutate({ data: inputFor(status) }, {
      onSuccess: () => {
        setCampaignName("");
        setTargetId("");
        setPlacements([]);
        setTargetCity("");
        setTargetTiers([]);
        setMessage(text.saved);
        void refresh();
      },
      onError: () => { setMessage(text.saveError); setIsError(true); },
    });
  };
  const changeStatus = (campaign: NonNullable<typeof campaignsQuery.data>[number]) => {
    const nextStatus: SponsoredContentCampaignStatus = campaign.status === "active" ? "paused" : "active";
    updateCampaign.mutate({
      id: campaign.id,
      data: {
        campaignName: campaign.campaignName,
        targetType: campaign.targetType,
        targetId: campaign.targetId,
        placementTypes: campaign.placementTypes,
        targetCity: campaign.targetCity,
        targetActivity: campaign.targetActivity,
        targetMembershipTiers: campaign.targetMembershipTiers,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        status: nextStatus,
      },
    }, {
      onSuccess: () => { setMessage(text.saved); setIsError(false); void refresh(); },
      onError: () => { setMessage(text.saveError); setIsError(true); },
    });
  };

  return <section className="mt-10 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 shadow-sm sm:p-7">
    <header>
      <h2 className="font-display text-xl font-bold">{text.title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#687a71]">{text.intro}</p>
    </header>
    {message ? <p role={isError ? "alert" : "status"} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${isError ? "border-[#e0c4b9] bg-[#fff7f3] text-[#9a4435]" : "border-[#cfddcf] bg-[#f8fbf4] text-[#36564b]"}`}>{message}</p> : null}
    {campaignsQuery.isError ? <p role="alert" className="mt-4 text-sm text-[#9a4435]">{text.loadError}</p> : null}
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[#51665e] sm:col-span-2">{text.name}
        <input required minLength={2} maxLength={120} value={campaignName} onChange={event => setCampaignName(event.target.value)} className={fieldClass} />
      </label>
      <label className="text-xs font-semibold text-[#51665e]">{text.type}
        <select value={targetType} onChange={event => { setTargetType(event.target.value as SponsoredContentType); setTargetId(""); setPlacements([]); }} className={fieldClass}>
          <option value="event">{text.event}</option><option value="course">{text.course}</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-[#51665e]">{text.target}
        <select required value={targetId} onChange={event => { setTargetId(event.target.value); setPlacements([]); }} className={fieldClass}>
          <option value="">{text.chooseTarget}</option>
          {targetOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-semibold text-[#51665e]">{text.placements}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {options.map(value => <label key={value} className="flex items-start gap-2 rounded-xl border border-[#e5dfd0] bg-[#faf8f0] p-3 text-xs leading-5 text-[#36564b]">
            <input type="checkbox" checked={placements.includes(value)} disabled={!selectedTarget} onChange={event => setPlacements(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} className="mt-0.5 accent-[#174d43]" />
            <span>{text[placementLabels[value]]}{value === "category_featured" && selectedTarget ? <span className="block text-[10px] text-[#75847c]">{text.categoryHint} · {selectedTarget.category}</span> : null}</span>
          </label>)}
          {!selectedTarget ? <p className="text-xs text-[#75847c] sm:col-span-2">{text.selectContentType}</p> : null}
        </div>
      </fieldset>
      <label className="text-xs font-semibold text-[#51665e]">{text.city}
        <input value={targetCity} onChange={event => setTargetCity(event.target.value)} placeholder={text.cityHint} className={fieldClass} />
      </label>
      <fieldset>
        <legend className="text-xs font-semibold text-[#51665e]">{text.tiers}</legend>
        <p className="mt-1 text-xs text-[#75847c]">{text.allTiers}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tiers.map(tier => <label key={tier} className="flex items-center gap-2 rounded-xl border border-[#e5dfd0] bg-[#faf8f0] px-4 py-2.5 text-sm font-semibold">
            <input type="checkbox" checked={targetTiers.includes(tier)} onChange={event => setTargetTiers(current => event.target.checked ? [...current, tier] : current.filter(value => value !== tier))} className="accent-[#174d43]" />{tier}
          </label>)}
        </div>
      </fieldset>
      <label className="text-xs font-semibold text-[#51665e]">{text.start}
        <input required type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className={`${fieldClass} min-w-0`} />
      </label>
      <label className="text-xs font-semibold text-[#51665e]">{text.end}
        <input required type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className={`${fieldClass} min-w-0`} />
      </label>
      <label className="text-xs font-semibold text-[#51665e]">{text.status}
        <select value={status} onChange={event => setStatus(event.target.value as SponsoredContentCampaignStatus)} className={fieldClass}>
          {(["draft", "active", "paused"] as SponsoredContentCampaignStatus[]).map(value => <option key={value} value={value}>{text[value]}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button disabled={createCampaign.isPending || !selectedTarget} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#174d43] px-5 text-sm font-semibold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-50">{createCampaign.isPending ? text.saving : text.create}</button></div>
    </form>

    <section className="mt-8 border-t border-[#e5dfd0] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold">{text.campaigns}</h3>
        <button type="button" onClick={() => void campaignsQuery.refetch()} className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-4 py-2 text-xs font-semibold text-[#36564b]">{text.refresh}</button>
      </div>
      {campaignsQuery.isLoading ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-[#e2dece]" /> : campaignsQuery.isError ? null : !campaignsQuery.data?.length ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[#d8d2c4] bg-[#faf8f0] p-5 text-sm text-[#687a71]">{text.noCampaigns}</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {campaignsQuery.data.map(campaign => <article key={campaign.id} className="rounded-2xl border border-[#ddd7c6] bg-[#fffdf7] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#a76445]">{text[campaign.targetType]}{campaign.city ? ` · ${campaign.city}` : ""}</p><h4 className="mt-1 text-lg font-bold">{campaign.campaignName}</h4><p className="mt-1 text-xs text-[#687a71]">{campaign.targetName}{campaign.partnerName ? ` · ${campaign.partnerName}` : ""}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${campaign.status === "active" ? "bg-[#e2eee4] text-[#28695a]" : "bg-[#eeeade] text-[#687a71]"}`}>{text[campaign.status]}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{campaign.placementTypes.map(value => <span key={value} className="rounded-full bg-[#f0ebdd] px-3 py-1 text-[11px] font-semibold text-[#536b61]">{text[placementLabels[value]]}</span>)}</div>
            <p className="mt-3 text-xs leading-5 text-[#687a71]">{[campaign.targetCity, campaign.targetActivity, campaign.targetMembershipTiers.length ? campaign.targetMembershipTiers.join(", ") : null].filter(Boolean).join(" · ") || text.allTiers}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                [text.impressions, campaign.impressions],
                [text.clicks, campaign.clicks],
                [text.conversions, campaign.conversions],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f5f2e8] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#75847c]">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={updateCampaign.isPending} onClick={() => changeStatus(campaign)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-semibold text-[#36564b] hover:bg-[#f1eddf] disabled:opacity-50">{campaign.status === "active" ? text.pause : text.activate}</button>
            </div>
          </article>)}
        </div>
      )}
    </section>
    {eventsQuery.isError || coursesQuery.isError ? <p role="alert" className="mt-4 text-xs text-[#9a4435]">{text.noTargets}</p> : null}
  </section>;
}
