import type { FacilityProfileInput } from '@workspace/api-client-react';

type MediaKey = 'logoUrl' | 'coverImageUrl' | 'galleryImageUrls' | 'promotionalVideoUrl';
type MediaValue = Pick<FacilityProfileInput, MediaKey>;
type MediaCopy = {
  title: string;
  hint: string;
  logo: string;
  cover: string;
  gallery: string;
  galleryHint: string;
  video: string;
};

const copy: Record<'en' | 'ar' | 'ku', MediaCopy> = {
  en: {
    title: 'Profile media',
    hint: 'Use links to images and videos supplied by your facility. MaydanGo does not source or generate media.',
    logo: 'Logo image URL',
    cover: 'Cover image URL',
    gallery: 'Gallery image URLs',
    galleryHint: 'Add one HTTPS link per line, up to 12 images.',
    video: 'Promotional video URL',
  },
  ar: {
    title: 'صور ووسائط الملف',
    hint: 'أضف روابط الصور والفيديو التي يوفرها المرفق. لا يبحث MaydanGo عن الوسائط ولا ينشئها.',
    logo: 'رابط صورة الشعار',
    cover: 'رابط صورة الغلاف',
    gallery: 'روابط صور المعرض',
    galleryHint: 'أضف رابط HTTPS واحداً في كل سطر، بحد أقصى 12 صورة.',
    video: 'رابط الفيديو التعريفي',
  },
  ku: {
    title: 'وێنە و میدیای پڕۆفایل',
    hint: 'بەستەری وێنە و ڤیدیۆی دابینکراوی شوێنەکە زیاد بکە. MaydanGo میدیا نادۆزێتەوە و دروستی ناکات.',
    logo: 'بەستەری وێنەی نیشانە',
    cover: 'بەستەری وێنەی بەرگ',
    gallery: 'بەستەرەکانی وێنەی گەلەری',
    galleryHint: 'لە هەر دێڕێکدا بەستەرێکی HTTPS بنووسە، تا ١٢ وێنە.',
    video: 'بەستەری ڤیدیۆی ناساندن',
  },
};

export function FacilityMediaFields({
  value,
  onChange,
  lang,
  inputClass,
}: {
  value: MediaValue;
  onChange: (key: MediaKey, next: string | string[] | null) => void;
  lang: 'en' | 'ar' | 'ku';
  inputClass: string;
}) {
  const labels = copy[lang];
  const direction = lang === 'en' ? 'ltr' : 'rtl';
  const urlField = (key: 'logoUrl' | 'coverImageUrl' | 'promotionalVideoUrl', label: string) => (
    <label className="block text-xs font-semibold text-[#51665e]">
      {label}
      <input
        type="url"
        inputMode="url"
        maxLength={2048}
        pattern="https://.+"
        placeholder="https://"
        dir="ltr"
        className={inputClass}
        value={value[key] ?? ''}
        onChange={event => onChange(key, event.target.value || null)}
      />
    </label>
  );

  return (
    <fieldset dir={direction} className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7]/70 p-4">
      <legend className="px-1 text-sm font-bold text-[#36564b]">{labels.title}</legend>
      <p className="mb-3 text-[11px] leading-5 text-[#75847c]">{labels.hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {urlField('logoUrl', labels.logo)}
        {urlField('coverImageUrl', labels.cover)}
        <label className="block text-xs font-semibold text-[#51665e] sm:col-span-2">
          {labels.gallery}
          <textarea
            dir="ltr"
            maxLength={24_576}
            rows={3}
            className={inputClass}
            value={(value.galleryImageUrls ?? []).join('\n')}
            onChange={event => onChange('galleryImageUrls', event.target.value.split(/\r?\n/).map(url => url.trim()).filter(Boolean))}
          />
          <span className="mt-1 block font-normal text-[#75847c]">{labels.galleryHint}</span>
        </label>
        {urlField('promotionalVideoUrl', labels.video)}
      </div>
    </fieldset>
  );
}
