import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  getGetPartnerMarketingProfileQueryKey, useGetOperationFacilities,
  useGetPartnerMarketingProfile, useUpdatePartnerMarketingProfile,
} from '@workspace/api-client-react';
import type { LiveOffering } from '@workspace/api-client-react';
import { BookOpenText, Check, Clipboard, Download, ExternalLink, Image, Megaphone, Palette, QrCode, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import type { PortalLanguage } from '@/pages/partner-operations';

const copy = {
  en: {
    title: 'Partner marketing centre',
    intro: 'Create ready-to-share MaydanGo materials for your approved facilities and classes.',
    draft: 'Arabic and Sorani text is a draft and needs local-speaker review before public campaign use.',
    logo: 'Official partner logo',
    logoHint: 'Paste a public HTTPS image link for your approved logo.',
    logoPlaceholder: 'https://example.com/your-logo.png',
    saveLogo: 'Save logo link',
    logoSaved: 'Logo link saved.',
    logoError: 'The logo link could not be saved.',
    secureLogo: 'Use an HTTPS image link. Logo uploads are not enabled here.',
    facility: 'Facility',
    chooseFacility: 'Choose a facility',
    class: 'Class or session',
    chooseClass: 'Choose a published session',
    language: 'Material language',
    newClass: 'New-class post',
    cancellation: 'Cancellation message',
    campaign: 'Campaign template',
    cancellationReason: 'Optional message',
    cancellationHint: 'Add a brief explanation without sharing member information.',
    copyText: 'Copy text',
    copied: 'Copied',
    copyError: 'Copy was blocked. Select and copy the text manually.',
    noSession: 'No published sessions are available. You can still prepare a general campaign.',
    qrPoster: 'QR poster',
    qrIntro: 'Print a simple poster that links people to MaydanGo facilities.',
    printPoster: 'Print poster',
    explore: 'Explore facilities on MaydanGo',
    brandGuidelines: 'Brand guidelines',
    guidelineOne: 'Use the official partner logo without changing its proportions or colors.',
    guidelineTwo: 'Use welcoming language for women, men, families, and people with different abilities.',
    guidelineThree: 'Do not promise entry, membership access, or medical outcomes; direct people to current MaydanGo details.',
    guidelineFour: 'Use only photos and artwork your organization has permission to share.',
    colors: 'MaydanGo colors',
    green: 'Iraqi green',
    sand: 'Warm sand',
    coral: 'Movement coral',
    materials: 'Shareable materials',
    loading: 'Loading your marketing profile…',
    retry: 'Retry',
    noFacilities: 'No approved facility profiles are available yet.',
    published: 'Published',
    qrAlt: 'QR code linking to the MaydanGo facilities page',
  },
  ar: {
    title: 'مركز التسويق للشركاء',
    intro: 'أنشئ مواد جاهزة للمشاركة على MaydanGo لمرافقك وحصصك المعتمدة.',
    draft: 'النص العربي والسوراني مسودة وتحتاج إلى مراجعة متحدثين محليين قبل استخدامها في الحملات العامة.',
    logo: 'شعار الشريك الرسمي',
    logoHint: 'أضف رابط HTTPS عاماً لصورة الشعار المعتمد.',
    logoPlaceholder: 'https://example.com/your-logo.png',
    saveLogo: 'حفظ رابط الشعار',
    logoSaved: 'تم حفظ رابط الشعار.',
    logoError: 'تعذر حفظ رابط الشعار.',
    secureLogo: 'استخدم رابط صورة HTTPS. رفع الشعار غير متاح هنا.',
    facility: 'المرفق',
    chooseFacility: 'اختر مرفقاً',
    class: 'الحصة أو الجلسة',
    chooseClass: 'اختر جلسة منشورة',
    language: 'لغة المادة',
    newClass: 'منشور حصة جديدة',
    cancellation: 'رسالة إلغاء',
    campaign: 'نموذج حملة',
    cancellationReason: 'رسالة اختيارية',
    cancellationHint: 'أضف توضيحاً مختصراً دون مشاركة معلومات الأعضاء.',
    copyText: 'نسخ النص',
    copied: 'تم النسخ',
    copyError: 'تعذر النسخ. حدّد النص وانسخه يدوياً.',
    noSession: 'لا توجد جلسات منشورة. يمكنك إعداد حملة عامة.',
    qrPoster: 'ملصق رمز QR',
    qrIntro: 'اطبع ملصقاً بسيطاً يفتح صفحة المرافق على MaydanGo.',
    printPoster: 'طباعة الملصق',
    explore: 'استكشف المرافق على MaydanGo',
    brandGuidelines: 'إرشادات الهوية',
    guidelineOne: 'استخدم شعار الشريك الرسمي دون تغيير أبعاده أو ألوانه.',
    guidelineTwo: 'استخدم لغة ترحب بالنساء والرجال والعائلات والأشخاص ذوي القدرات المختلفة.',
    guidelineThree: 'لا تعد بالدخول أو مزايا العضوية أو نتائج طبية؛ وجّه الناس إلى تفاصيل MaydanGo الحالية.',
    guidelineFour: 'استخدم الصور والرسومات التي تملك مؤسستك إذناً بمشاركتها فقط.',
    colors: 'ألوان MaydanGo',
    green: 'الأخضر العراقي',
    sand: 'الرملي الدافئ',
    coral: 'المرجاني للحركة',
    materials: 'مواد قابلة للمشاركة',
    loading: 'جارٍ تحميل ملف التسويق…',
    retry: 'إعادة المحاولة',
    noFacilities: 'لا توجد ملفات مرافق معتمدة بعد.',
    published: 'منشور',
    qrAlt: 'رمز QR يفتح صفحة مرافق MaydanGo',
  },
  ku: {
    title: 'ناوەندی بازاڕکردنی هاوبەش',
    intro: 'بابەتی ئامادە بۆ هاوبەشکردن لە MaydanGo بۆ شوێن و وانە پەسەندکراوەکانت دروست بکە.',
    draft: 'دەقی عەرەبی و سۆرانی ڕەشنووسە و پێویستی بە پێداچوونەوەی قسەکەرانی ناوخۆیی هەیە پێش بەکارهێنان لە بانگەشەی گشتی.',
    logo: 'لۆگۆی فەرمیی هاوبەش',
    logoHint: 'بەستەری گشتی HTTPS بۆ وێنەی لۆگۆی پەسەندکراو دابنێ.',
    logoPlaceholder: 'https://example.com/your-logo.png',
    saveLogo: 'پاشەکەوتکردنی بەستەری لۆگۆ',
    logoSaved: 'بەستەری لۆگۆ پاشەکەوت کرا.',
    logoError: 'پاشەکەوتکردنی بەستەری لۆگۆ سەرکەوتوو نەبوو.',
    secureLogo: 'بەستەری وێنەی HTTPS بەکاربهێنە. بارکردنی لۆگۆ لێرە چالاک نییە.',
    facility: 'شوێن',
    chooseFacility: 'شوێنێک هەڵبژێرە',
    class: 'وانە یان دانیشتن',
    chooseClass: 'دانیشتنێکی بڵاوکراوە هەڵبژێرە',
    language: 'زمانی بابەت',
    newClass: 'پۆستی وانەی نوێ',
    cancellation: 'نامەی هەڵوەشاندنەوە',
    campaign: 'نموونەی بانگەشە',
    cancellationReason: 'نامەی ئارەزوومەندانە',
    cancellationHint: 'ڕوونکردنەوەیەکی کورت بنووسە بەبێ زانیاری ئەندامان.',
    copyText: 'کۆپیکردنی دەق',
    copied: 'کۆپی کرا',
    copyError: 'کۆپیکردن ڕێگەپێدراو نەبوو. دەقەکە دەستنیشان بکە و بە دەستی کۆپی بکە.',
    noSession: 'هیچ دانیشتنێکی بڵاوکراوە نییە. دەتوانیت بانگەشەیەکی گشتی ئامادە بکەیت.',
    qrPoster: 'پۆستەری کۆدی QR',
    qrIntro: 'پۆستەرێکی سادە چاپ بکە کە پەڕەی شوێنەکانی MaydanGo دەکاتەوە.',
    printPoster: 'چاپکردنی پۆستەر',
    explore: 'شوێنەکان لە MaydanGo ببینە',
    brandGuidelines: 'ڕێنمایی نیشانەی بازرگانی',
    guidelineOne: 'لۆگۆی فەرمیی هاوبەش بەکاربهێنە و قەبارە و ڕەنگەکانی مەگۆڕە.',
    guidelineTwo: 'زمانێکی بەخێرهێنەر بۆ ژنان، پیاوان، خێزانەکان و خاوەن پێداویستی جیاوازەکان بەکاربهێنە.',
    guidelineThree: 'بەڵێنی چوونەژوورەوە، دەستگەیشتنی ئەندامێتی یان ئەنجامی پزیشکی مەدە؛ خەڵک بۆ زانیاری نوێی MaydanGo ئاراستە بکە.',
    guidelineFour: 'تەنها ئەو وێنە و هونەرە بەکاربهێنە کە مۆڵەتی هاوبەشکردنی هەیە.',
    colors: 'ڕەنگەکانی MaydanGo',
    green: 'سەوزی عێراقی',
    sand: 'خاکیی گەرم',
    coral: 'پرتەقاڵیی جووڵە',
    materials: 'بابەتی ئامادە بۆ هاوبەشکردن',
    loading: 'پرۆفایلی بازاڕکردنت بار دەکرێت…',
    retry: 'دووبارە هەوڵ بدە',
    noFacilities: 'هێشتا هیچ پڕۆفایلی شوێنی پەسەندکراو نییە.',
    published: 'بڵاوکراوەتەوە',
    qrAlt: 'کۆدی QR بۆ کردنەوەی پەڕەی شوێنەکانی MaydanGo',
  },
} as const;
type CopyKey = keyof typeof copy.en;
type TemplateKind = 'newClass' | 'cancellation' | 'campaign';
const t = (language: PortalLanguage, key: CopyKey) => copy[language][key];
const languageOptions: PortalLanguage[] = ['en', 'ar', 'ku'];
const cardClass = 'rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2 text-xs font-semibold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-50';

function localizedTitle(offering: LiveOffering, language: PortalLanguage) {
  return offering.localizedTitle?.[language]?.trim() || offering.title;
}

export function PartnerMarketingCenter({ language, offerings }: { language: PortalLanguage; offerings: LiveOffering[] }) {
  const queryClient = useQueryClient();
  const profileQuery = useGetPartnerMarketingProfile({ query: { retry: false, refetchOnMount: 'always' } });
  const facilitiesQuery = useGetOperationFacilities({ query: { retry: false } });
  const saveProfile = useUpdatePartnerMarketingProfile();
  const [logoDraft, setLogoDraft] = useState('');
  const [logoNotice, setLogoNotice] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);
  const [materialLanguage, setMaterialLanguage] = useState<PortalLanguage>(language);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedOfferingId, setSelectedOfferingId] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [copied, setCopied] = useState<TemplateKind | null>(null);
  const [copyError, setCopyError] = useState('');

  useEffect(() => setMaterialLanguage(language), [language]);
  useEffect(() => setLogoDraft(profileQuery.data?.logoUrl ?? ''), [profileQuery.data?.logoUrl]);
  useEffect(() => {
    if (!selectedFacilityId && facilitiesQuery.data?.length) setSelectedFacilityId(facilitiesQuery.data[0].id);
  }, [selectedFacilityId, facilitiesQuery.data]);
  useEffect(() => {
    if (!selectedOfferingId && offerings.length) setSelectedOfferingId(offerings[0].id);
  }, [selectedOfferingId, offerings]);

  const facility = facilitiesQuery.data?.find(item => item.id === selectedFacilityId);
  const offering = offerings.find(item => item.id === selectedOfferingId);
  const partnerName = profileQuery.data?.partnerName ?? 'MaydanGo partner';
  const shareUrl = typeof window === 'undefined'
    ? `${import.meta.env.BASE_URL}facilities`
    : new URL(`${import.meta.env.BASE_URL}facilities`, window.location.origin).toString();
  const dateText = useMemo(() => {
    if (!offering) return '';
    return new Intl.DateTimeFormat(
      materialLanguage === 'ar' ? 'ar-IQ' : materialLanguage === 'ku' ? 'ckb-IQ' : 'en-IQ',
      { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Baghdad' },
    ).format(new Date(offering.startsAt));
  }, [materialLanguage, offering]);
  const venueName = facility?.localizedName?.[materialLanguage]?.trim() || facility?.facility || offering?.facility || partnerName;
  const cityName = facility?.city || offering?.city || '';
  const className = offering ? localizedTitle(offering, materialLanguage) : t(materialLanguage, 'class');
  const templates = useMemo<Record<TemplateKind, string>>(() => {
    const en = {
      newClass: `New movement class: ${className} at ${venueName}${cityName ? `, ${cityName}` : ''}${dateText ? ` on ${dateText}` : ''}. Find details and membership options on MaydanGo: ${shareUrl}`,
      cancellation: `We’re sorry: ${className}${dateText ? ` on ${dateText}` : ''} at ${venueName} has been cancelled.${cancellationReason.trim() ? ` ${cancellationReason.trim()}` : ''} Please check MaydanGo for the latest information.`,
      campaign: `Movement belongs to everyone. Discover ${partnerName} and local classes across Iraq on MaydanGo: ${shareUrl}`,
    };
    const ar = {
      newClass: `حصة حركة جديدة: ${className} في ${venueName}${cityName ? `، ${cityName}` : ''}${dateText ? `، ${dateText}` : ''}. اطّلع على التفاصيل وخيارات العضوية على MaydanGo: ${shareUrl}`,
      cancellation: `نعتذر، تم إلغاء ${className}${dateText ? ` بتاريخ ${dateText}` : ''} في ${venueName}.${cancellationReason.trim() ? ` ${cancellationReason.trim()}` : ''} يرجى مراجعة MaydanGo للاطلاع على أحدث المعلومات.`,
      campaign: `الحركة للجميع. اكتشف ${partnerName} والحصص المحلية في العراق على MaydanGo: ${shareUrl}`,
    };
    const ku = {
      newClass: `وانەیەکی نوێی جووڵە: ${className} لە ${venueName}${cityName ? `، ${cityName}` : ''}${dateText ? `، ${dateText}` : ''}. وردەکاری و هەڵبژاردەکانی ئەندامێتی لە MaydanGo ببینە: ${shareUrl}`,
      cancellation: `داوای لێبوردن دەکەین، ${className}${dateText ? ` لە ${dateText}` : ''} لە ${venueName} هەڵوەشێندرایەوە.${cancellationReason.trim() ? ` ${cancellationReason.trim()}` : ''} تکایە MaydanGo بپشکنە بۆ زانیاریی نوێ.`,
      campaign: `جووڵە بۆ هەمووانە. ${partnerName} و وانە ناوخۆییەکان لە سەرانسەری عێراق لە MaydanGo ببینە: ${shareUrl}`,
    };
    return materialLanguage === 'ar' ? ar : materialLanguage === 'ku' ? ku : en;
  }, [cancellationReason, className, cityName, dateText, materialLanguage, partnerName, shareUrl, venueName]);

  const saveLogo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = logoDraft.trim();
    if (value && !/^https:\/\/\S+$/i.test(value)) {
      setLogoError(t(language, 'secureLogo'));
      setLogoNotice('');
      return;
    }
    try {
      await saveProfile.mutateAsync({ data: { logoUrl: value || null } });
      await queryClient.invalidateQueries({ queryKey: getGetPartnerMarketingProfileQueryKey() });
      setLogoNotice(t(language, 'logoSaved'));
      setLogoError('');
      setLogoFailed(false);
    } catch {
      setLogoError(t(language, 'logoError'));
      setLogoNotice('');
    }
  };

  const copyTemplate = async (kind: TemplateKind) => {
    try {
      await navigator.clipboard.writeText(templates[kind]);
      setCopied(kind);
      setCopyError('');
    } catch {
      setCopied(null);
      setCopyError(t(language, 'copyError'));
    }
  };
  const selectedLogo = profileQuery.data?.logoUrl;
  if (profileQuery.isLoading) return <p data-testid="status-marketing-loading" role="status" className="rounded-2xl bg-[#fffdf7] p-6 text-sm text-[#687a71]">{t(language, 'loading')}</p>;
  if (profileQuery.isError || !profileQuery.data) return <div data-testid="status-marketing-error" role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff7f3] p-5 text-sm text-[#9a4435]"><span>{t(language, 'logoError')}</span><button data-testid="button-marketing-retry" type="button" onClick={() => void profileQuery.refetch()} className="inline-flex items-center gap-2 font-semibold"><RefreshCw size={14} />{t(language, 'retry')}</button></div>;

  return <section dir={language === 'en' ? 'ltr' : 'rtl'} className="space-y-5">
    <header className="rounded-3xl bg-[#174d43] p-6 text-[#fff9e9] sm:p-8">
      <div className="flex items-center gap-3"><Megaphone size={22} /><div><h2 className="font-display text-2xl font-bold">{t(language, 'title')}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#d1dfd6]">{t(language, 'intro')}</p></div></div>
    </header>
    <p data-testid="notice-marketing-translation-draft" className="rounded-xl border border-[#e7d1a9] bg-[#fff7e8] px-4 py-3 text-xs leading-5 text-[#76532d]">{t(language, 'draft')}</p>

    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <article className={cardClass}>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Image size={17} />{t(language, 'logo')}</h3>
        <p className="mt-2 text-xs leading-5 text-[#687a71]">{t(language, 'logoHint')}</p>
        <form onSubmit={event => void saveLogo(event)} className="mt-4 space-y-3">
          <input data-testid="input-partner-logo-url" type="url" inputMode="url" maxLength={2048} value={logoDraft} onChange={event => setLogoDraft(event.target.value)} placeholder={t(language, 'logoPlaceholder')} className="w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15" />
          <button data-testid="button-save-partner-logo" className={buttonClass} disabled={saveProfile.isPending}><Save size={14} />{t(language, 'saveLogo')}</button>
        </form>
        {logoNotice && <p role="status" className="mt-3 text-xs font-semibold text-[#2d6d4a]">{logoNotice}</p>}
        {logoError && <p role="alert" className="mt-3 text-xs text-[#9a4435]">{logoError}</p>}
        <div className="mt-5 flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-[#d8d2c4] bg-[#f7f4e9] p-4">
          {selectedLogo && !logoFailed
            ? <img data-testid="img-partner-official-logo" src={selectedLogo} alt={`${partnerName} official logo`} onError={() => setLogoFailed(true)} className="max-h-16 max-w-full object-contain" />
            : <span className="font-display text-xl font-bold text-[#174d43]">{partnerName}</span>}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[#687a71]">{t(language, 'secureLogo')}</p>
      </article>

      <article className={cardClass}>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><QrCode size={17} />{t(language, 'qrPoster')}</h3>
        <p className="mt-2 text-xs leading-5 text-[#687a71]">{t(language, 'qrIntro')}</p>
        <div data-print-target="partner-marketing-poster" className="mt-4 grid min-h-60 gap-4 rounded-2xl border border-[#d8d2c4] bg-[#f7f4e9] p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-3">
            {selectedLogo && !logoFailed ? <img src={selectedLogo} alt={`${partnerName} logo`} onError={() => setLogoFailed(true)} className="max-h-12 max-w-48 object-contain" /> : null}
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#a76445]">{partnerName}</p>
            <h4 className="font-display text-2xl font-bold leading-tight text-[#174d43]">{facility?.localizedName?.[materialLanguage]?.trim() || facility?.facility || t(materialLanguage, 'explore')}</h4>
            <p className="text-xs leading-5 text-[#51665e]">{cityName}</p>
            <p className="text-sm font-semibold text-[#174d43]">{t(materialLanguage, 'explore')}</p>
          </div>
          <div className="mx-auto rounded-xl bg-white p-3 sm:mx-0">
            <QRCodeSVG value={shareUrl} title={t(materialLanguage, 'qrAlt')} size={148} level="M" includeMargin />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button data-testid="button-print-marketing-poster" type="button" className={buttonClass} onClick={() => window.print()}><Download size={14} />{t(language, 'printPoster')}</button>
          <a data-testid="link-marketing-facilities" href={`${import.meta.env.BASE_URL}facilities`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-[#174d43]"><ExternalLink size={14} />{t(language, 'explore')}</a>
        </div>
      </article>
    </div>

    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="flex items-center gap-2 font-display text-lg font-bold"><Clipboard size={17} />{t(language, 'materials')}</h3><p className="mt-2 text-xs leading-5 text-[#687a71]">{t(language, 'draft')}</p></div>
        <label className="min-w-40 text-xs font-semibold">{t(language, 'language')}
          <select data-testid="select-marketing-language" value={materialLanguage} onChange={event => { setMaterialLanguage(event.target.value as PortalLanguage); setCopied(null); }} className="mt-1 block w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm">
            {languageOptions.map(option => <option key={option} value={option}>{option === 'en' ? 'English' : option === 'ar' ? 'العربية' : 'کوردی'}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">{t(language, 'facility')}
          <select data-testid="select-marketing-facility" value={selectedFacilityId} onChange={event => setSelectedFacilityId(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm">
            <option value="">{t(language, 'chooseFacility')}</option>
            {(facilitiesQuery.data ?? []).map(item => <option key={item.id} value={item.id}>{item.facility} · {item.city}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{t(language, 'class')}
          <select data-testid="select-marketing-class" value={selectedOfferingId} onChange={event => setSelectedOfferingId(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm">
            <option value="">{t(language, 'chooseClass')}</option>
            {offerings.filter(item => item.active && !item.cancelledAt).map(item => <option key={item.id} value={item.id}>{localizedTitle(item, language)} · {item.facility}</option>)}
          </select>
        </label>
      </div>
      {facilitiesQuery.isError ? <button type="button" data-testid="button-marketing-facilities-retry" onClick={() => void facilitiesQuery.refetch()} className="mt-3 text-xs font-bold text-[#174d43]">{t(language, 'retry')}</button>
        : !facilitiesQuery.isLoading && !facilitiesQuery.data?.length ? <p data-testid="empty-marketing-facilities" className="mt-3 text-xs text-[#687a71]">{t(language, 'noFacilities')}</p> : null}
      {!offerings.some(item => item.active && !item.cancelledAt) && <p className="mt-3 text-xs text-[#687a71]">{t(language, 'noSession')}</p>}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {([
          ['newClass', BookOpenText],
          ['cancellation', ShieldCheck],
          ['campaign', Megaphone],
        ] as const).map(([kind, Icon]) => <section key={kind} className="rounded-2xl bg-[#f7f4e9] p-4">
          <h4 className="flex items-center gap-2 text-sm font-bold text-[#174d43]"><Icon size={15} />{t(language, kind)}</h4>
          {kind === 'cancellation' ? <label className="mt-3 block text-[10px] font-semibold">{t(language, 'cancellationReason')}<input data-testid="input-marketing-cancellation-reason" value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} maxLength={220} placeholder={t(language, 'cancellationHint')} className="mt-1 w-full rounded-lg border border-[#d8d2c4] bg-white px-3 py-2 text-xs" /></label> : null}
          <textarea data-testid={`text-marketing-template-${kind}`} readOnly value={templates[kind]} rows={6} className="mt-3 w-full resize-y rounded-xl border border-[#e2ddcf] bg-white p-3 text-xs leading-5 text-[#455c53]" />
          <button data-testid={`button-copy-marketing-${kind}`} type="button" onClick={() => void copyTemplate(kind)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#174d43]/20 px-3 text-[10px] font-bold text-[#174d43]">
            {copied === kind ? <Check size={13} /> : <Clipboard size={13} />}{copied === kind ? t(language, 'copied') : t(language, 'copyText')}
          </button>
        </section>)}
      </div>
      {copyError && <p role="alert" className="mt-3 text-xs text-[#9a4435]">{copyError}</p>}
    </article>

    <article className={cardClass}>
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Palette size={17} />{t(language, 'brandGuidelines')}</h3>
      <ul className="mt-4 grid gap-3 text-xs leading-5 text-[#51665e] sm:grid-cols-2">
        {(['guidelineOne', 'guidelineTwo', 'guidelineThree', 'guidelineFour'] as const).map((key, index) => <li key={key} data-testid={`text-marketing-guideline-${index + 1}`} className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#174d43]" />{t(language, key)}</li>)}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e5efe8] px-3 py-2 text-[#174d43]"><span className="h-3 w-3 rounded-full bg-[#174d43]" />{t(language, 'green')}</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#f4ecdc] px-3 py-2 text-[#76532d]"><span className="h-3 w-3 rounded-full bg-[#eadfcd]" />{t(language, 'sand')}</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#f8e5dc] px-3 py-2 text-[#9a4435]"><span className="h-3 w-3 rounded-full bg-[#ef9b78]" />{t(language, 'coral')}</span>
      </div>
    </article>
    <style>{`@media print { body * { visibility: hidden !important; } [data-print-target="partner-marketing-poster"], [data-print-target="partner-marketing-poster"] * { visibility: visible !important; } [data-print-target="partner-marketing-poster"] { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; min-height: 100vh !important; border: 0 !important; border-radius: 0 !important; } }`}</style>
  </section>;
}
