import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSponsoredFacilityCampaignsQueryKey,
  getGetPublicFacilitiesQueryKey,
  getGetPublicSponsoredFacilitiesQueryKey,
  useCreateSponsoredFacilityCampaign,
  useGetSponsoredFacilityCampaigns,
  useGetPublicFacilities,
  useUpdateSponsoredFacilityCampaign,
} from "@workspace/api-client-react";
import { SponsoredContentCampaigns } from "./sponsored-content-campaigns";

type Language = "en" | "ar" | "ku";
type PlacementType = "home_featured" | "search_sponsored" | "category_featured";
type CampaignStatus = "draft" | "active" | "paused";
type MembershipTier = "M" | "L" | "XL";

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: "Sponsored facility placements",
    intro: "Create clearly labeled facility promotions for the website. These campaigns do not create memberships or change access rights.",
    name: "Campaign name",
    facility: "Approved facility",
    chooseFacility: "Choose a facility",
    placement: "Where should it appear?",
    home: "Featured on homepage",
    search: "Sponsored in facility search",
    category: "Featured in matching activity",
    city: "Target city (optional)",
    activity: "Target activity (optional)",
    tiers: "Member tiers (optional)",
    allTiers: "Leave all unchecked to show to everyone.",
    start: "Starts (Baghdad time)",
    end: "Ends (Baghdad time)",
    status: "Initial status",
    draft: "Draft",
    active: "Active",
    paused: "Paused",
    save: "Create campaign",
    saving: "Saving…",
    campaigns: "Campaigns",
    noCampaigns: "No sponsored campaigns yet.",
    impressions: "Impressions",
    clicks: "Clicks",
    pause: "Pause",
    activate: "Activate",
    refresh: "Refresh",
    signIn: "Sign in with a marketing administrator account to manage campaigns.",
    loadError: "Campaigns could not be loaded. Check your administrator access and try again.",
    saveError: "Campaign could not be saved. Check the facility, dates, and administrator permissions.",
    saved: "Campaign saved.",
    dateError: "Choose a valid end time after the start time.",
    placementError: "Choose at least one placement.",
    noFacility: "No approved facilities are available for promotion.",
    cityHint: "For example, Erbil or Basra",
    allActivities: "All activities",
  },
  ar: {
    title: "مواضع الترويج للمنشآت",
    intro: "أنشئ ترويجاً واضح التمييز للمنشآت على الموقع. لا تنشئ هذه الحملات عضويات ولا تغيّر صلاحيات الدخول.",
    name: "اسم الحملة",
    facility: "المنشأة المعتمدة",
    chooseFacility: "اختر منشأة",
    placement: "أين يظهر الإعلان؟",
    home: "إبراز في الصفحة الرئيسية",
    search: "إعلان ضمن بحث المنشآت",
    category: "إبراز ضمن النشاط المطابق",
    city: "المدينة المستهدفة (اختياري)",
    activity: "النشاط المستهدف (اختياري)",
    tiers: "فئات العضوية (اختياري)",
    allTiers: "اترك الجميع دون تحديد ليظهر الإعلان لكل الزوار.",
    start: "تاريخ البدء (توقيت بغداد)",
    end: "تاريخ الانتهاء (توقيت بغداد)",
    status: "الحالة الأولية",
    draft: "مسودة",
    active: "نشطة",
    paused: "متوقفة",
    save: "إنشاء الحملة",
    saving: "جارٍ الحفظ…",
    campaigns: "الحملات",
    noCampaigns: "لا توجد حملات ترويجية بعد.",
    impressions: "مرات الظهور",
    clicks: "النقرات",
    pause: "إيقاف",
    activate: "تفعيل",
    refresh: "تحديث",
    signIn: "سجّل الدخول بحساب مسؤول التسويق لإدارة الحملات.",
    loadError: "تعذر تحميل الحملات. تحقق من صلاحية حسابك وحاول مجدداً.",
    saveError: "تعذر حفظ الحملة. تحقق من المنشأة والتواريخ وصلاحيات الحساب.",
    saved: "تم حفظ الحملة.",
    dateError: "اختر وقت انتهاء صحيحاً بعد وقت البدء.",
    placementError: "اختر موضعاً واحداً على الأقل.",
    noFacility: "لا توجد منشآت معتمدة متاحة للترويج.",
    cityHint: "مثال: أربيل أو البصرة",
    allActivities: "جميع الأنشطة",
  },
  ku: {
    title: "شوێنەکانی ڕیکلامی شوێنەکان",
    intro: "ڕیکلامی ڕوون و نیشان‌کراو بۆ شوێنەکان لە ماڵپەڕ دروست بکە. ئەم کەمپەینانە ئەندامێتی دروست ناکەن و مافی چوونەژوور ناگۆڕن.",
    name: "ناوی کەمپەین",
    facility: "شوێنی پەسەندکراو",
    chooseFacility: "شوێنێک هەڵبژێرە",
    placement: "لە کوێ پیشان بدرێت؟",
    home: "پیشاندانی تایبەت لە پەڕەی سەرەکی",
    search: "ڕیکلام لە گەڕانی شوێنەکان",
    category: "پیشاندانی تایبەت بۆ چالاکیی هاوتا",
    city: "شاری ئامانج (ئارەزوومەندانە)",
    activity: "چالاکیی ئامانج (ئارەزوومەندانە)",
    tiers: "پلەکانی ئەندامێتی (ئارەزوومەندانە)",
    allTiers: "هەموو خانەکان بەبێ نیشانە بهێڵەوە بۆ پیشاندان بۆ هەمووان.",
    start: "دەستپێک (کاتی بەغدا)",
    end: "کۆتایی (کاتی بەغدا)",
    status: "دۆخی سەرەتایی",
    draft: "ڕەشنووس",
    active: "چالاک",
    paused: "وەستاو",
    save: "دروستکردنی کەمپەین",
    saving: "پاشەکەوت دەکرێت…",
    campaigns: "کەمپەینەکان",
    noCampaigns: "هێشتا هیچ کەمپەینێک نییە.",
    impressions: "جارانی پیشاندان",
    clicks: "کرتەکان",
    pause: "وەستاندن",
    activate: "چالاککردن",
    refresh: "نوێکردنەوە",
    signIn: "بە هەژماری بەڕێوەبەری بازاڕکردن بچۆ ژوورەوە بۆ بەڕێوەبردنی کەمپەینەکان.",
    loadError: "بارکردنی کەمپەینەکان سەرکەوتوو نەبوو. دەسەڵاتی هەژمارەکەت بپشکنە و دووبارە هەوڵ بدە.",
    saveError: "پاشەکەوتکردنی کەمپەین سەرکەوتوو نەبوو. شوێن، بەروار و دەسەڵاتەکان بپشکنە.",
    saved: "کەمپەین پاشەکەوت کرا.",
    dateError: "کاتێکی دروستی کۆتایی دوای کاتی دەستپێک هەڵبژێرە.",
    placementError: "لانیکەم یەک شوێن هەڵبژێرە.",
    noFacility: "هیچ شوێنێکی پەسەندکراو بۆ ڕیکلام بەردەست نییە.",
    cityHint: "بۆ نموونە: هەولێر یان بەسرە",
    allActivities: "هەموو چالاکییەکان",
  },
};

const placementOptions: Array<{ value: PlacementType; key: string }> = [
  { value: "home_featured", key: "home" },
  { value: "search_sponsored", key: "search" },
  { value: "category_featured", key: "category" },
];
const tiers: MembershipTier[] = ["M", "L", "XL"];
const fieldClass = "mt-1 h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15";
const dateClass = `${fieldClass} min-w-0`;
const toBaghdadInput = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const fromBaghdadInput = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const localizeFacility = (facility: { localizedName?: { en?: string; ar?: string; ku?: string } | null; facility: string }, language: Language) =>
  facility.localizedName?.[language] || facility.localizedName?.en || facility.facility;

export default function SponsoredPlacementsManagerPage() {
  const [language, setLanguage] = useState<Language>("en");
  const text = copy[language];
  const queryClient = useQueryClient();
  const facilitiesQuery = useGetPublicFacilities({ query: { queryKey: getGetPublicFacilitiesQueryKey() } });
  const campaignsQuery = useGetSponsoredFacilityCampaigns({ query: { queryKey: getGetSponsoredFacilityCampaignsQueryKey(), retry: false } });
  const createCampaign = useCreateSponsoredFacilityCampaign();
  const updateCampaign = useUpdateSponsoredFacilityCampaign();
  const facilities = facilitiesQuery.data ?? [];
  const cities = useMemo(() => [...new Set(facilities.map(item => item.city))].sort(), [facilities]);
  const [campaignName, setCampaignName] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [placements, setPlacements] = useState<PlacementType[]>([]);
  const [targetCity, setTargetCity] = useState("");
  const [targetActivity, setTargetActivity] = useState("");
  const [targetTiers, setTargetTiers] = useState<MembershipTier[]>([]);
  const [startsAt, setStartsAt] = useState(() => toBaghdadInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toBaghdadInput(new Date(Date.now() + 7 * 86_400_000)));
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetSponsoredFacilityCampaignsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetPublicSponsoredFacilitiesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetPublicFacilitiesQueryKey() }),
  ]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
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
    createCampaign.mutate({
      data: {
        campaignName: campaignName.trim(),
        facilityId,
        placementTypes: placements,
        targetCity: targetCity.trim() || null,
        targetActivity: targetActivity.trim() || null,
        targetMembershipTiers: targetTiers,
        startsAt: fromBaghdadInput(startsAt),
        endsAt: fromBaghdadInput(endsAt),
        status,
      },
    }, {
      onSuccess: () => {
        setCampaignName("");
        setMessage(text.saved);
        setIsError(false);
        setPlacements([]);
        setTargetCity("");
        setTargetActivity("");
        setTargetTiers([]);
        void refresh();
      },
      onError: () => {
        setMessage(text.saveError);
        setIsError(true);
      },
    });
  };
  const changeStatus = (campaign: NonNullable<typeof campaignsQuery.data>[number], nextStatus: CampaignStatus) => {
    setMessage("");
    updateCampaign.mutate({
      id: campaign.id,
      data: {
        campaignName: campaign.campaignName,
        facilityId: campaign.facilityId,
        placementTypes: campaign.placementTypes as PlacementType[],
        targetCity: campaign.targetCity,
        targetActivity: campaign.targetActivity,
        targetMembershipTiers: campaign.targetMembershipTiers,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        status: nextStatus,
      },
    }, {
      onSuccess: () => {
        setMessage(text.saved);
        setIsError(false);
        void refresh();
      },
      onError: () => {
        setMessage(text.saveError);
        setIsError(true);
      },
    });
  };
  const selectedFacility = facilities.find(item => item.id === facilityId);
  const activityOptions = selectedFacility?.activities.flatMap(item => [item.en, item.ar, item.ku]).filter((value): value is string => Boolean(value)) ?? [];

  return <main className="min-h-[100dvh] bg-[#f3f0e5] px-4 py-7 text-[#173d35] sm:px-7 lg:px-10 lg:py-10" dir={language === "en" ? "ltr" : "rtl"}>
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.21em] text-[#a76445]">MAYDANGO · IRAQ</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{text.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#687a71]">{text.intro}</p>
        </div>
        <label className="text-[10px] font-bold text-[#687a71]">
          <span className="sr-only">Language</span>
          <select aria-label="Language" value={language} onChange={event => setLanguage(event.target.value as Language)} className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs">
            <option value="en">English</option><option value="ar">العربية العراقية</option><option value="ku">کوردیی سۆرانی</option>
          </select>
        </label>
      </header>

      {message && <p role={isError ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm ${isError ? "border-[#e0c4b9] bg-[#fff7f3] text-[#9a4435]" : "border-[#cfddcf] bg-[#f8fbf4] text-[#36564b]"}`}>{message}</p>}
      {facilitiesQuery.isError && <p role="alert" className="mt-4 rounded-xl bg-[#fff7f3] p-4 text-sm text-[#9a4435]">{text.noFacility}</p>}

      {campaignsQuery.isSuccess && <section className="mt-7 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 shadow-sm sm:p-7">
        <h2 className="font-display text-xl font-bold">{text.save}</h2>
        {!facilitiesQuery.isLoading && facilities.length === 0 ? <p className="mt-4 text-sm text-[#687a71]">{text.noFacility}</p> : (
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#51665e] sm:col-span-2">{text.name}
              <input required minLength={2} maxLength={120} value={campaignName} onChange={event => setCampaignName(event.target.value)} className={fieldClass} />
            </label>
            <label className="text-xs font-semibold text-[#51665e] sm:col-span-2">{text.facility}
              <select required value={facilityId} onChange={event => setFacilityId(event.target.value)} className={fieldClass}>
                <option value="">{text.chooseFacility}</option>
                {facilities.map(item => <option key={item.id} value={item.id}>{localizeFacility(item, language)} · {item.city}</option>)}
              </select>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-xs font-semibold text-[#51665e]">{text.placement}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {placementOptions.map(option => <label key={option.value} className="flex items-start gap-2 rounded-xl border border-[#e5dfd0] bg-[#faf8f0] p-3 text-xs leading-5 text-[#36564b]">
                  <input type="checkbox" checked={placements.includes(option.value)} onChange={event => setPlacements(current => event.target.checked ? [...current, option.value] : current.filter(value => value !== option.value))} className="mt-0.5 accent-[#174d43]" />
                  <span>{text[option.key]}</span>
                </label>)}
              </div>
            </fieldset>
            <label className="text-xs font-semibold text-[#51665e]">{text.city}
              <input list="sponsored-cities" value={targetCity} onChange={event => setTargetCity(event.target.value)} placeholder={text.cityHint} className={fieldClass} />
              <datalist id="sponsored-cities">{cities.map(city => <option key={city} value={city} />)}</datalist>
            </label>
            <label className="text-xs font-semibold text-[#51665e]">{text.activity}
              <input list="sponsored-activities" value={targetActivity} onChange={event => setTargetActivity(event.target.value)} placeholder={text.allActivities} className={fieldClass} />
              <datalist id="sponsored-activities">{activityOptions.map((value, index) => <option key={`${value}-${index}`} value={value} />)}</datalist>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-xs font-semibold text-[#51665e]">{text.tiers}</legend>
              <p className="mt-1 text-xs text-[#75847c]">{text.allTiers}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tiers.map(tier => <label key={tier} className="flex items-center gap-2 rounded-xl border border-[#e5dfd0] bg-[#faf8f0] px-4 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={targetTiers.includes(tier)} onChange={event => setTargetTiers(current => event.target.checked ? [...current, tier] : current.filter(value => value !== tier))} className="accent-[#174d43]" />
                  {tier}
                </label>)}
              </div>
            </fieldset>
            <label className="text-xs font-semibold text-[#51665e]">{text.start}
              <input required type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className={dateClass} />
            </label>
            <label className="text-xs font-semibold text-[#51665e]">{text.end}
              <input required type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className={dateClass} />
            </label>
            <label className="text-xs font-semibold text-[#51665e]">{text.status}
              <select value={status} onChange={event => setStatus(event.target.value as CampaignStatus)} className={fieldClass}>
                {(["draft", "active", "paused"] as CampaignStatus[]).map(value => <option key={value} value={value}>{text[value]}</option>)}
              </select>
            </label>
            <div className="flex items-end"><button disabled={createCampaign.isPending || facilitiesQuery.isLoading || !facilities.length} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#174d43] px-5 text-sm font-semibold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-50">{createCampaign.isPending ? text.saving : text.save}</button></div>
          </form>
        )}
      </section>}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">{text.campaigns}</h2>
          <button type="button" onClick={() => void campaignsQuery.refetch()} className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-4 py-2 text-xs font-semibold text-[#36564b]">{text.refresh}</button>
        </div>
        {campaignsQuery.isLoading ? <div className="mt-4 h-28 animate-pulse rounded-2xl bg-[#e2dece]" /> : campaignsQuery.isError ? (
          <p role="alert" className="mt-4 rounded-2xl border border-[#e0c4b9] bg-[#fff7f3] p-5 text-sm text-[#9a4435]">{text.loadError} <span className="block text-xs">{text.signIn}</span></p>
        ) : !campaignsQuery.data?.length ? <p className="mt-4 rounded-2xl border border-dashed border-[#d8d2c4] bg-[#fffdf7] p-7 text-sm text-[#687a71]">{text.noCampaigns}</p> : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {campaignsQuery.data.map(campaign => <article key={campaign.id} className="rounded-2xl border border-[#ddd7c6] bg-[#fffdf7] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#a76445]">{campaign.city}</p><h3 className="mt-1 text-lg font-bold">{campaign.campaignName}</h3><p className="mt-1 text-xs text-[#687a71]">{campaign.facility} · {campaign.partnerName}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${campaign.status === "active" ? "bg-[#e2eee4] text-[#28695a]" : "bg-[#eeeade] text-[#687a71]"}`}>{text[campaign.status]}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {campaign.placementTypes.map(placement => <span key={placement} className="rounded-full bg-[#f0ebdd] px-3 py-1 text-[11px] font-semibold text-[#536b61]">{text[placementOptions.find(item => item.value === placement)?.key ?? "home"]}</span>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#687a71]">
                {[campaign.targetCity, campaign.targetActivity, campaign.targetMembershipTiers.length ? campaign.targetMembershipTiers.join(", ") : null].filter(Boolean).join(" · ") || text.allTiers}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#f5f2e8] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#75847c]">{text.impressions}</p><p className="mt-1 text-lg font-bold">{campaign.impressions}</p></div>
                <div className="rounded-xl bg-[#f5f2e8] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#75847c]">{text.clicks}</p><p className="mt-1 text-lg font-bold">{campaign.clicks}</p></div>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" disabled={updateCampaign.isPending} onClick={() => changeStatus(campaign, campaign.status === "active" ? "paused" : "active")} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-semibold text-[#36564b] hover:bg-[#f1eddf] disabled:opacity-50">
                  {campaign.status === "active" ? text.pause : text.activate}
                </button>
              </div>
            </article>)}
          </div>
        )}
      </section>
      <SponsoredContentCampaigns language={language} />
    </div>
  </main>;
}
