import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Clock3, ExternalLink, MapPin, RefreshCw, Search, Sparkles, Star } from 'lucide-react';
import {
  getGetPublicCatalogQueryKey,
  getGetPublicCoursesQueryKey,
  getGetPublicFacilitiesQueryKey,
  getGetPublicFacilityQueryKey,
  getGetPublicFacilityReviewsQueryKey,
  getGetPublicSponsoredFacilitiesQueryKey,
  useGetPublicCatalog,
  useGetPublicCourses,
  useGetPublicFacilities,
  useGetPublicFacility,
  useGetPublicFacilityReviews,
  useGetPublicSponsoredFacilities,
  useRecordPublicSponsoredFacilityEvent,
} from '@workspace/api-client-react';
import type { PublicFacility, PublicCourse } from '@workspace/api-client-react';

export type PublicCatalogLanguage = 'en' | 'ar' | 'ku';

type Copy = {
  [key: string]: string;
};

const copy: Record<PublicCatalogLanguage, Copy> = {
  en: {
    region: 'IRAQ · KURDISTAN · WEST · SOUTH',
    heroTitle: 'Find a way to feel more like yourself.',
    heroBody: 'Explore public facility, class, event and course information from across Iraq. Details here are for discovery; booking and access are completed in the MaydanGo app.',
    facilities: 'Explore facilities',
    courses: 'Browse courses',
    publicInfo: 'Public information',
    refreshed: 'Current details from the public catalogue',
    discover: 'Move, learn, and find your place.',
    discoverBody: 'A clearer view of local movement and wellbeing options, wherever you are in Iraq.',
    classesEvents: 'Classes & events',
    facilitiesCount: 'Facilities',
    coursesCount: 'Courses',
    browseTitle: 'Places to move',
    browseIntro: 'Browse facility profiles published for the public catalogue.',
    filterCity: 'All cities',
    filterActivity: 'All activities',
    city: 'City',
    activity: 'Activity',
    clear: 'Clear filters',
    matches: 'matches',
    noFacilities: 'No facilities to show',
    noFacilitiesBody: 'There are no public facility profiles matching these filters right now.',
    noFacilitiesAllBody: 'When facility profiles are published to the public catalogue, they will appear here.',
    loadingFacilities: 'Loading public facilities',
    failedFacilities: 'Public facilities could not be loaded.',
    retry: 'Try again',
    viewProfile: 'View profile',
    hideProfile: 'Hide profile',
    district: 'District',
    partner: 'Partner',
    closesAt: 'Closes at',
    address: 'Address',
    coordinates: 'Coordinates',
    about: 'About this place',
    amenities: 'Amenities',
    accessibility: 'Accessibility',
    openingHours: 'Opening hours',
    specialHours: 'Special hours',
    contact: 'Contact',
    website: 'Visit website',
    phone: 'Call',
    hoursNotListed: 'Hours not listed',
    closed: 'Closed',
    open: 'Open now',
    unavailable: 'Status unavailable',
    sessions: 'Upcoming sessions',
    noSessions: 'No upcoming sessions are listed.',
    profileLoading: 'Loading facility details',
    profileError: 'Facility details could not be loaded.',
    reviews: 'Public reviews',
    noReviews: 'No public reviews are listed.',
    reviewUnavailable: 'Reviews could not be loaded.',
    reviewCount: 'reviews',
    coursesTitle: 'Learn at your own pace.',
    coursesIntro: 'Explore public course descriptions and instructor names. Course lessons and access are available through the MaydanGo app.',
    courseLibrary: 'The course library',
    courseLevel: 'Level',
    duration: 'minutes',
    instructor: 'Instructor',
    noCourses: 'No public courses to show',
    noCoursesBody: 'When courses are published for public discovery, they will appear here.',
    loadingCourses: 'Loading public courses',
    failedCourses: 'Public courses could not be loaded.',
    catalogLoading: 'Loading the public catalogue',
    catalogError: 'The public catalogue could not be loaded.',
    emptyCatalog: 'No public classes or events are listed right now.',
    hostedBy: 'Hosted by',
    starts: 'Starts',
    class: 'Class',
    event: 'Event',
    coaching: 'Coaching',
    appNote: 'Booking and access are completed through the mobile app.',
    sponsored: 'Sponsored',
    viewFacility: 'View facility',
    updated: 'Public information only',
    search: 'Search courses',
    noSearchResults: 'No courses match that search.',
  },
  ar: {
    region: 'العراق · كردستان · الغرب · الجنوب',
    heroTitle: 'اكتشف ما يساعدك على الشعور بحال أفضل.',
    heroBody: 'استكشف معلومات عامة عن المرافق والحصص والفعاليات والدورات في أنحاء العراق. الموقع للاستكشاف؛ ويكتمل الحجز والدخول عبر تطبيق MaydanGo.',
    facilities: 'استكشف المرافق',
    courses: 'تصفح الدورات',
    publicInfo: 'معلومات عامة',
    refreshed: 'تفاصيل حالية من الدليل العام',
    discover: 'تحرّك وتعلّم واعثر على مكانك.',
    discoverBody: 'صورة أوضح لخيارات الحركة والعافية المحلية أينما كنت في العراق.',
    classesEvents: 'الحصص والفعاليات',
    facilitiesCount: 'المرافق',
    coursesCount: 'الدورات',
    browseTitle: 'أماكن للحركة',
    browseIntro: 'تصفح ملفات المرافق المنشورة في الدليل العام.',
    filterCity: 'كل المدن',
    filterActivity: 'كل الأنشطة',
    city: 'المدينة',
    activity: 'النشاط',
    clear: 'مسح عوامل التصفية',
    matches: 'نتائج',
    noFacilities: 'لا توجد مرافق للعرض',
    noFacilitiesBody: 'لا توجد ملفات مرافق عامة تطابق عوامل التصفية حالياً.',
    noFacilitiesAllBody: 'ستظهر هنا ملفات المرافق عند نشرها في الدليل العام.',
    loadingFacilities: 'جارٍ تحميل المرافق العامة',
    failedFacilities: 'تعذر تحميل المرافق العامة.',
    retry: 'حاول مجدداً',
    viewProfile: 'عرض الملف',
    hideProfile: 'إخفاء الملف',
    district: 'المنطقة',
    partner: 'الشريك',
    closesAt: 'يغلق عند',
    address: 'العنوان',
    coordinates: 'الإحداثيات',
    about: 'عن هذا المكان',
    amenities: 'المرافق والخدمات',
    accessibility: 'إمكانية الوصول',
    openingHours: 'ساعات العمل',
    specialHours: 'ساعات خاصة',
    contact: 'التواصل',
    website: 'زيارة الموقع',
    phone: 'اتصال',
    hoursNotListed: 'الساعات غير مدرجة',
    closed: 'مغلق',
    open: 'مفتوح الآن',
    unavailable: 'الحالة غير متاحة',
    sessions: 'الجلسات القادمة',
    noSessions: 'لا توجد جلسات قادمة مدرجة.',
    profileLoading: 'جارٍ تحميل تفاصيل المرفق',
    profileError: 'تعذر تحميل تفاصيل المرفق.',
    reviews: 'التقييمات العامة',
    noReviews: 'لا توجد تقييمات عامة مدرجة.',
    reviewUnavailable: 'تعذر تحميل التقييمات.',
    reviewCount: 'تقييمات',
    coursesTitle: 'تعلّم بالوتيرة التي تناسبك.',
    coursesIntro: 'استكشف أوصاف الدورات العامة وأسماء المدرّبين. دروس الدورات والوصول إليها متاحان عبر تطبيق MaydanGo.',
    courseLibrary: 'دليل الدورات',
    courseLevel: 'المستوى',
    duration: 'دقيقة',
    instructor: 'المدرّب',
    noCourses: 'لا توجد دورات عامة للعرض',
    noCoursesBody: 'ستظهر هنا الدورات المنشورة للاستكشاف العام.',
    loadingCourses: 'جارٍ تحميل الدورات العامة',
    failedCourses: 'تعذر تحميل الدورات العامة.',
    catalogLoading: 'جارٍ تحميل الدليل العام',
    catalogError: 'تعذر تحميل الدليل العام.',
    emptyCatalog: 'لا توجد حصص أو فعاليات عامة مدرجة حالياً.',
    hostedBy: 'الجهة المضيفة',
    starts: 'تبدأ',
    class: 'حصة',
    event: 'فعالية',
    coaching: 'تدريب',
    appNote: 'يكتمل الحجز والدخول عبر تطبيق الهاتف.',
    sponsored: 'إعلان مدفوع',
    viewFacility: 'عرض المنشأة',
    updated: 'معلومات عامة فقط',
    search: 'ابحث في الدورات',
    noSearchResults: 'لا توجد دورات تطابق البحث.',
  },
  ku: {
    region: 'عێراق · کوردستان · ڕۆژئاوا · باشوور',
    heroTitle: 'ڕێگایەک بدۆزەوە بۆ هەستکردنی باشتر.',
    heroBody: 'زانیاریی گشتیی شوێن، وانە، بۆنە و کۆرسەکان لە سەرانسەری عێراق ببینە. ئەم ماڵپەڕە بۆ دۆزینەوەیە؛ حجز و چوونەژوورەوە لە ئەپی MaydanGo تەواو دەکرێت.',
    facilities: 'شوێنەکان ببینە',
    courses: 'کۆرسەکان ببینە',
    publicInfo: 'زانیاریی گشتی',
    refreshed: 'وردەکاریی نوێ لە کاتالۆگی گشتی',
    discover: 'بجووڵە، فێربە و شوێنی خۆت بدۆزەوە.',
    discoverBody: 'وێنەیەکی ڕوونتر لە هەڵبژاردەکانی جووڵە و تەندروستی لە هەر شوێنێکی عێراق.',
    classesEvents: 'وانە و بۆنەکان',
    facilitiesCount: 'شوێنەکان',
    coursesCount: 'کۆرسەکان',
    browseTitle: 'شوێن بۆ جووڵە',
    browseIntro: 'پرۆفایلی شوێنە بڵاوکراوەکان لە کاتالۆگی گشتی ببینە.',
    filterCity: 'هەموو شارەکان',
    filterActivity: 'هەموو چالاکییەکان',
    city: 'شار',
    activity: 'چالاکی',
    clear: 'پاککردنەوەی فلتەرەکان',
    matches: 'ئەنجام',
    noFacilities: 'هیچ شوێنێک نییە بۆ پیشاندان',
    noFacilitiesBody: 'ئێستا هیچ پرۆفایلی شوێنی گشتی لەگەڵ ئەم فلتەرانە ناگونجێت.',
    noFacilitiesAllBody: 'کاتێک پرۆفایلی شوێنەکان لە کاتالۆگی گشتی بڵاو بکرێنەوە، لێرە دەردەکەون.',
    loadingFacilities: 'شوێنە گشتییەکان بار دەکرێن',
    failedFacilities: 'نەتوانرا شوێنە گشتییەکان باربکرێن.',
    retry: 'دووبارە هەوڵبدە',
    viewProfile: 'پرۆفایل ببینە',
    hideProfile: 'پرۆفایل بشارەوە',
    district: 'گەڕەک',
    partner: 'هاوبەش',
    closesAt: 'دادەخرێت لە',
    address: 'ناونیشان',
    coordinates: 'هاوئاهەنگی شوێن',
    about: 'دەربارەی ئەم شوێنە',
    amenities: 'خزمەتگوزارییەکان',
    accessibility: 'دەستڕاگەیشتن',
    openingHours: 'کاتەکانی کردنەوە',
    specialHours: 'کاتی تایبەت',
    contact: 'پەیوەندی',
    website: 'ماڵپەڕ ببینە',
    phone: 'پەیوەندی تەلەفۆنی',
    hoursNotListed: 'کاتەکان بڵاونەکراونەتەوە',
    closed: 'داخراوە',
    open: 'ئێستا کراوەیە',
    unavailable: 'دۆخ بەردەست نییە',
    sessions: 'وانەکانی داهاتوو',
    noSessions: 'هیچ وانەیەکی داهاتوو بڵاونەکراوەتەوە.',
    profileLoading: 'وردەکاریی شوێن بار دەکرێت',
    profileError: 'نەتوانرا وردەکاریی شوێن باربکرێت.',
    reviews: 'هەڵسەنگاندنی گشتی',
    noReviews: 'هیچ هەڵسەنگاندنێکی گشتی بڵاونەکراوەتەوە.',
    reviewUnavailable: 'نەتوانرا هەڵسەنگاندنەکان باربکرێن.',
    reviewCount: 'هەڵسەنگاندن',
    coursesTitle: 'بە خێرایی خۆت فێربە.',
    coursesIntro: 'پوختەی گشتیی کۆرس و ناوی مامۆستاکان ببینە. وانە و چوونەژوورەوەی کۆرس لە ئەپی MaydanGo بەردەستن.',
    courseLibrary: 'کۆرسەکان',
    courseLevel: 'ئاست',
    duration: 'خولەک',
    instructor: 'مامۆستا',
    noCourses: 'هیچ کۆرسێکی گشتی نییە',
    noCoursesBody: 'کاتێک کۆرس بۆ دۆزینەوەی گشتی بڵاو دەکرێتەوە، لێرە دەردەکەوێت.',
    loadingCourses: 'کۆرسە گشتییەکان بار دەکرێن',
    failedCourses: 'نەتوانرا کۆرسە گشتییەکان باربکرێن.',
    catalogLoading: 'کاتالۆگی گشتی بار دەکرێت',
    catalogError: 'نەتوانرا کاتالۆگی گشتی باربکرێت.',
    emptyCatalog: 'ئێستا هیچ وانە یان بۆنەیەکی گشتی بڵاونەکراوەتەوە.',
    hostedBy: 'لە لایەن',
    starts: 'دەستپێدەکات',
    class: 'وانە',
    event: 'بۆنە',
    coaching: 'ڕاهێنان',
    appNote: 'حجز و چوونەژوورەوە لە ئەپی مۆبایل تەواو دەکرێت.',
    sponsored: 'سپۆنسەرکراو',
    viewFacility: 'بینینی شوێن',
    updated: 'تەنها زانیاریی گشتی',
    search: 'گەڕان لە کۆرسەکان',
    noSearchResults: 'هیچ کۆرسێک لەگەڵ ئەم گەڕانە ناگونجێت.',
  },
};

function localized(value: { en: string; ar: string; ku: string } | null | undefined, language: PublicCatalogLanguage) {
  return value?.[language] || value?.en || '';
}

function QueryError({ message, retry, retryLabel, id }: { message: string; retry: () => void; retryLabel: string; id: string }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-secondary/40 bg-secondary/10 p-6 sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid={`status-error-${id}`}>
      <p className="text-sm font-medium">{message}</p>
      <button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-semibold transition-colors hover:bg-primary hover:text-primary-foreground" data-testid={`button-retry-${id}`}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {retryLabel}
      </button>
    </div>
  );
}

function LoadingBlocks({ label, id, count = 3 }: { label: string; id: string; count?: number }) {
  return (
    <div aria-label={label} aria-live="polite" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid={`loading-${id}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-border bg-card p-6">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-5 h-6 w-3/4 rounded bg-muted" />
          <div className="mt-3 h-3 w-1/2 rounded bg-muted" />
          <div className="mt-8 h-16 rounded-xl bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function translatedOpeningHours(facility: PublicFacility, language: PublicCatalogLanguage, labels: Copy) {
  if (!facility.openingHours?.length) return [labels.hoursNotListed];
  const dayNames: Record<PublicCatalogLanguage, string[]> = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    ku: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'],
  };
  return facility.openingHours.map((day) => {
    const dayName = dayNames[language][day.day] || '';
    const hours = day.closed ? labels.closed : [day.opensAt, day.closesAt].filter(Boolean).join(' – ') || labels.hoursNotListed;
    return `${dayName} · ${hours}`;
  });
}

function FacilityProfileDetails({ facility, language }: { facility: PublicFacility; language: PublicCatalogLanguage }) {
  const text = copy[language];
  const detailQuery = useGetPublicFacility(facility.id, {
    query: { enabled: true, queryKey: getGetPublicFacilityQueryKey(facility.id) },
  });
  const reviewQuery = useGetPublicFacilityReviews(facility.id, {
    query: { enabled: true, queryKey: getGetPublicFacilityReviewsQueryKey(facility.id) },
  });
  const profile = detailQuery.data ?? facility;
  const reviews = reviewQuery.data;
  const openingHours = translatedOpeningHours(profile, language, text);

  return (
    <div className="mt-5 border-t border-border pt-5" dir={language === 'en' ? 'ltr' : 'rtl'}>
      {detailQuery.isLoading ? (
        <div className="space-y-3 py-2" aria-live="polite" data-testid={`loading-facility-profile-${facility.id}`}>
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : detailQuery.isError ? (
        <p className="rounded-xl bg-secondary/10 p-3 text-sm" role="alert" data-testid={`status-profile-error-${facility.id}`}>{text.profileError}</p>
      ) : (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <div className="space-y-4">
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.partner}</h4><p className="mt-2 text-sm leading-6">{profile.partnerName}</p></div>
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.about}</h4><p className="mt-2 text-sm leading-6">{localized(profile.localizedDescription, language) || '—'}</p></div>
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.address}</h4><p className="mt-2 text-sm leading-6">{localized(profile.localizedAddress, language) || '—'}</p></div>
            {profile.latitude !== null && profile.longitude !== null && <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.coordinates}</h4><p className="mt-2 text-sm leading-6">{profile.latitude}, {profile.longitude}</p></div>}
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.openingHours}</h4><ul className="mt-2 space-y-1 text-sm leading-6">{openingHours.map((line, index) => <li key={`${facility.id}-hours-${index}`}>{line}</li>)}</ul></div>
            {profile.specialHours.length > 0 && <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.specialHours}</h4><ul className="mt-2 space-y-2 text-sm leading-6">{profile.specialHours.map((hours) => <li key={hours.id}>{hours.startDate}{hours.endDate !== hours.startDate ? ` – ${hours.endDate}` : ''} · {hours.closed ? text.closed : [hours.opensAt, hours.closesAt].filter(Boolean).join(' – ')}{localized(hours.localizedReason, language) ? ` · ${localized(hours.localizedReason, language)}` : ''}</li>)}</ul></div>}
          </div>
          <div className="space-y-4">
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.amenities}</h4><p className="mt-2 text-sm leading-6">{profile.amenities.map((item) => localized(item, language)).filter(Boolean).join(' · ') || '—'}</p></div>
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.accessibility}</h4><p className="mt-2 text-sm leading-6">{profile.accessibility.map((item) => localized(item, language)).filter(Boolean).join(' · ') || '—'}</p></div>
            <div><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.sessions}</h4>
              {profile.upcomingSessions.length ? <ul className="mt-2 space-y-3">{profile.upcomingSessions.map((session) => <li key={session.id} className="border-s-2 border-secondary ps-3 text-sm">
                <p className="font-semibold">{localized(session.localizedTitle, language) || session.title}</p>
                <p className="mt-1 text-muted-foreground">{session.category} · {new Date(session.startsAt).toLocaleString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{text.noSessions}</p>}
            </div>
          </div>
        </div>
      )}
      {(profile.contactPhone || profile.websiteUrl) && (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-4">
          {profile.contactPhone && <a href={`tel:${profile.contactPhone}`} className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold hover:bg-accent" data-testid={`link-facility-phone-${facility.id}`}>{text.phone}: {profile.contactPhone}</a>}
          {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold hover:bg-accent" data-testid={`link-facility-website-${facility.id}`}>{text.website}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
        </div>
      )}
      <section className="mt-6 rounded-2xl bg-muted/60 p-4 sm:p-5" aria-label={text.reviews}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-bold">{text.reviews}</h4>
          {reviews && <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Star className="h-4 w-4 fill-secondary text-secondary" aria-hidden="true" />{reviews.averageRating == null ? '—' : reviews.averageRating.toFixed(1)} · {reviews.reviewCount} {text.reviewCount}</span>}
        </div>
        {reviewQuery.isLoading ? <div className="mt-3 h-4 w-48 animate-pulse rounded bg-muted" /> : reviewQuery.isError ? <p className="mt-3 text-sm text-muted-foreground">{text.reviewUnavailable}</p> : reviews?.reviews.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">{reviews.reviews.map((review) => <li key={review.id} className="rounded-xl bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 fill-secondary text-secondary" aria-hidden="true" />{review.overallRating}/5 <span className="text-xs font-normal text-muted-foreground">{new Date(review.createdAt).toLocaleDateString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ')}</span></div>
            {review.content && <p className="mt-2 text-sm leading-6">{review.content}</p>}
            {review.partnerResponse && <p className="mt-3 border-s-2 border-secondary ps-3 text-sm leading-6 text-muted-foreground">{review.partnerResponse}</p>}
          </li>)}</ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">{text.noReviews}</p>}
      </section>
    </div>
  );
}

type SponsoredPlacementType = 'home_featured' | 'search_sponsored' | 'category_featured';
type PublicSponsoredPlacement = {
  campaignId: string;
  facilityId: string;
  placementTypes: SponsoredPlacementType[];
  targetCity: string | null;
  targetActivity: string | null;
};

function SponsoredPlacementTracker({ campaignId, placementType, children }: { campaignId: string; placementType: SponsoredPlacementType; children: ReactNode }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const recordEvent = useRecordPublicSponsoredFacilityEvent();
  const record = (eventType: 'impression' | 'click') => recordEvent.mutate({
    id: campaignId,
    data: { eventType, placementType },
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof window === 'undefined') return;
    if (!('IntersectionObserver' in window)) {
      record('impression');
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        record('impression');
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [campaignId, placementType]);

  return <div ref={elementRef} onClick={() => record('click')} data-sponsored-campaign={campaignId}>{children}</div>;
}

const normalizedText = (value: string) => value.trim().toLocaleLowerCase('en');
function placementForFacility(
  placements: PublicSponsoredPlacement[],
  facility: PublicFacility,
  placementType: SponsoredPlacementType,
  selectedActivity?: string,
): PublicSponsoredPlacement | undefined {
  return placements.find(placement => {
    if (placement.facilityId !== facility.id || !placement.placementTypes.includes(placementType)) return false;
    if (placement.targetCity && normalizedText(placement.targetCity) !== normalizedText(facility.city)) return false;
    if (placement.targetActivity) {
      const matchingActivity = facility.activities.find(item =>
        Object.values(item).some(value => normalizedText(value) === normalizedText(placement.targetActivity!)),
      );
      const facilityHasActivity = Boolean(matchingActivity);
      if (!facilityHasActivity) return false;
      if (placementType === 'category_featured' && selectedActivity) {
        const localizedActivityValues = Object.values(matchingActivity!).map(normalizedText);
        if (!localizedActivityValues.includes(normalizedText(selectedActivity))) return false;
      }
    }
    return true;
  });
}

export function PublicHomeShowcase({ language = 'en' }: { language?: PublicCatalogLanguage }) {
  const text = copy[language];
  const catalog = useGetPublicCatalog({ query: { queryKey: getGetPublicCatalogQueryKey() } });
  const facilities = useGetPublicFacilities({ query: { queryKey: getGetPublicFacilitiesQueryKey() } });
  const sponsored = useGetPublicSponsoredFacilities({ query: { queryKey: getGetPublicSponsoredFacilitiesQueryKey() } });
  const courses = useGetPublicCourses({ query: { queryKey: getGetPublicCoursesQueryKey() } });
  const offerings = (catalog.data ?? [])
    .filter((offering) => !offering.additionalPayment && Date.parse(offering.startsAt) > Date.now())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcoming = offerings.slice(0, 3);
  const sponsoredPlacements = (sponsored.data ?? []) as PublicSponsoredPlacement[];
  const facilityPreview = [...(facilities.data ?? [])]
    .sort((left, right) => Number(Boolean(placementForFacility(sponsoredPlacements, right, 'home_featured')))
      - Number(Boolean(placementForFacility(sponsoredPlacements, left, 'home_featured'))))
    .slice(0, 2);
  const coursePreview = courses.data?.slice(0, 2) ?? [];
  const isLoading = catalog.isLoading || facilities.isLoading || courses.isLoading;
  const hasError = catalog.isError || facilities.isError || courses.isError;
  const retryAll = () => {
    void catalog.refetch();
    void facilities.refetch();
    void courses.refetch();
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10" aria-labelledby="showcase-discovery-title" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary"><Sparkles className="h-4 w-4" aria-hidden="true" />{text.publicInfo}</p>
          <h2 id="showcase-discovery-title" className="font-display mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{text.discover}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{text.discoverBody}</p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">{text.refreshed}</p>
          {isLoading ? (
            <div className="mt-5 grid grid-cols-3 gap-2" aria-label={text.catalogLoading} aria-live="polite" data-testid="loading-home-metrics">
              {[0, 1, 2].map((item) => <div key={item} className="rounded-xl border border-border bg-card p-3"><div className="h-6 w-8 animate-pulse rounded bg-muted" /><div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" /></div>)}
            </div>
          ) : hasError ? (
            <div className="mt-5"><QueryError message={text.catalogError} retry={retryAll} retryLabel={text.retry} id="home-discovery" /></div>
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-2" aria-label={text.publicInfo}>
              {[
                { label: text.facilitiesCount, value: facilities.data?.length ?? 0 },
                { label: text.classesEvents, value: offerings.length },
                { label: text.coursesCount, value: courses.data?.length ?? 0 },
              ].map((item) => <div key={item.label} className="rounded-xl border border-border bg-card px-3 py-3" data-testid={`stat-public-${item.label}`}>
                <p className="font-display text-2xl font-bold">{item.value}</p>
                <p className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">{item.label}</p>
              </div>)}
            </div>
          )}
        </div>
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">{text.publicInfo}</p><h3 className="font-display mt-1 text-xl font-bold">{text.classesEvents}</h3></div>
          </div>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-label={text.catalogLoading} aria-live="polite" data-testid="loading-home-offerings">
              {[0, 1].map((item) => <div key={item} className="animate-pulse rounded-xl border border-border bg-card p-4"><div className="h-4 w-20 rounded bg-muted" /><div className="mt-4 h-5 w-3/4 rounded bg-muted" /><div className="mt-4 h-3 w-1/2 rounded bg-muted" /></div>)}
            </div>
          ) : hasError ? (
            <p className="rounded-xl border border-secondary/40 bg-secondary/10 p-4 text-sm" role="alert" data-testid="status-home-offerings-error">{text.catalogError}</p>
          ) : upcoming.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((offering) => <article key={offering.id} className="offering-card rounded-xl border border-border bg-card p-4" data-testid={`card-home-offering-${offering.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-accent/70 px-2.5 py-1 text-[11px] font-bold">{offering.kind === 'session' ? text.class : offering.kind === 'event' ? text.event : text.coaching}</span>
                  <span className="text-xs text-muted-foreground">{new Date(offering.startsAt).toLocaleDateString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { month: 'short', day: 'numeric' })}</span>
                </div>
                <h4 className="font-display mt-3 text-lg font-bold leading-snug">{localized(offering.localizedTitle, language) || offering.title}</h4>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{offering.city} · {offering.facility}</p>
              </article>)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground" data-testid="empty-home-catalog">{text.emptyCatalog}</div>
          )}
        </div>
      </div>
      <div className="mt-7 grid gap-6 border-t border-border pt-6 md:grid-cols-2">
        <section aria-labelledby="home-facility-preview-title">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 id="home-facility-preview-title" className="font-display text-lg font-bold">{text.facilities}</h3>
            {!isLoading && !hasError && <span className="text-xs text-muted-foreground">{facilities.data?.length ?? 0}</span>}
          </div>
          {isLoading ? (
            <div className="space-y-2" aria-label={text.loadingFacilities} aria-live="polite" data-testid="loading-home-facilities">
              {[0, 1].map((item) => <div key={item} className="animate-pulse rounded-xl border border-border bg-card p-4"><div className="h-4 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-1/3 rounded bg-muted" /></div>)}
            </div>
          ) : hasError ? (
            <p className="rounded-xl border border-secondary/40 bg-secondary/10 p-4 text-sm" role="alert" data-testid="status-home-facilities-error">{text.catalogError}</p>
          ) : facilityPreview.length ? (
            <ul className="space-y-2">
              {facilityPreview.map((facility) => {
                const placement = placementForFacility(sponsoredPlacements, facility, 'home_featured');
                const card = <div className="rounded-xl border border-border bg-card p-4" data-testid={`card-home-facility-${facility.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{localized(facility.localizedName, language) || facility.facility}</p>
                    {placement && <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900" data-testid={`badge-sponsored-home-${facility.id}`}>{text.sponsored}</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{facility.city}{localized(facility.localizedDistrict, language) ? ` · ${localized(facility.localizedDistrict, language)}` : ''}</p>
                  {facility.activities.length > 0 && <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{facility.activities.map((item) => localized(item, language)).filter(Boolean).join(' · ')}</p>}
                  <a href={`${import.meta.env.BASE_URL}facilities?facility=${encodeURIComponent(facility.id)}#public-facilities`} className="mt-3 inline-flex rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{text.viewFacility}<ArrowRight className="ms-1 h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" /></a>
                </div>;
                return <li key={facility.id}>
                  {placement
                    ? <SponsoredPlacementTracker campaignId={placement.campaignId} placementType="home_featured">{card}</SponsoredPlacementTracker>
                    : card}
                </li>;
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground" data-testid="empty-home-facilities">{text.noFacilities}</p>
          )}
        </section>
        <section aria-labelledby="home-course-preview-title">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 id="home-course-preview-title" className="font-display text-lg font-bold">{text.courses}</h3>
            {!isLoading && !hasError && <span className="text-xs text-muted-foreground">{courses.data?.length ?? 0}</span>}
          </div>
          {isLoading ? (
            <div className="space-y-2" aria-label={text.loadingCourses} aria-live="polite" data-testid="loading-home-courses">
              {[0, 1].map((item) => <div key={item} className="animate-pulse rounded-xl border border-border bg-card p-4"><div className="h-4 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-1/3 rounded bg-muted" /></div>)}
            </div>
          ) : hasError ? (
            <p className="rounded-xl border border-secondary/40 bg-secondary/10 p-4 text-sm" role="alert" data-testid="status-home-courses-error">{text.catalogError}</p>
          ) : coursePreview.length ? (
            <ul className="space-y-2">
              {coursePreview.map((course) => <li key={course.id} className="rounded-xl border border-border bg-card p-4" data-testid={`card-home-course-${course.id}`}>
                <p className="font-semibold">{localized(course.localizedTitle, language)}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{localized(course.localizedSummary, language)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{localized(course.localizedInstructor, language)} · {course.level} · {course.durationMinutes} {text.duration}</p>
              </li>)}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground" data-testid="empty-home-courses">{text.noCourses}</p>
          )}
        </section>
      </div>
      {!isLoading && !hasError && <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{text.appNote}</p>}
    </section>
  );
}

export function PublicFacilityBrowser({ language = 'en' }: { language?: PublicCatalogLanguage }) {
  const text = copy[language];
  const facilitiesQuery = useGetPublicFacilities({ query: { queryKey: getGetPublicFacilitiesQueryKey() } });
  const sponsoredQuery = useGetPublicSponsoredFacilities({ query: { queryKey: getGetPublicSponsoredFacilitiesQueryKey() } });
  const [city, setCity] = useState('');
  const [activity, setActivity] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('facility'));
  const facilities = facilitiesQuery.data ?? [];
  const sponsoredPlacements = (sponsoredQuery.data ?? []) as PublicSponsoredPlacement[];
  const cities = useMemo(() => Array.from(new Set(facilities.map((facility) => facility.city).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [facilities]);
  const activities = useMemo(() => {
    const byDisplay = new Map<string, string>();
    facilities.forEach((facility) => facility.activities.forEach((item) => {
      const display = localized(item, language);
      if (display) byDisplay.set(display, display);
    }));
    return Array.from(byDisplay.values()).sort((a, b) => a.localeCompare(b));
  }, [facilities, language]);
  const filteredFacilities = facilities.filter((facility) => {
    const cityMatches = !city || facility.city === city;
    const activityMatches = !activity || facility.activities.some((item) => localized(item, language) === activity);
    return cityMatches && activityMatches;
  }).sort((left, right) => {
    const leftSponsored = placementForFacility(sponsoredPlacements, left, 'search_sponsored', activity)
      ?? placementForFacility(sponsoredPlacements, left, 'category_featured', activity);
    const rightSponsored = placementForFacility(sponsoredPlacements, right, 'search_sponsored', activity)
      ?? placementForFacility(sponsoredPlacements, right, 'category_featured', activity);
    return Number(Boolean(rightSponsored)) - Number(Boolean(leftSponsored));
  });

  useEffect(() => {
    if (!selectedId || facilities.length === 0) return;
    document.getElementById(`public-facility-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId, facilities.length]);

  return (
    <section id="public-facilities" className="site-shell mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10" dir={language === 'en' ? 'ltr' : 'rtl'} aria-labelledby="public-facilities-title">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.publicInfo}</p>
        <h2 id="public-facilities-title" className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.browseTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text.browseIntro}</p>
      </header>
      <section className="mt-8" aria-label={text.facilities}>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.publicInfo}</p><h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.facilities}</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[440px]">
            <label className="text-xs font-bold text-muted-foreground">{text.city}
              <select className="mt-2 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground" value={city} onChange={(event) => setCity(event.target.value)} data-testid="select-facility-city">
                <option value="">{text.filterCity}</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-muted-foreground">{text.activity}
              <select className="mt-2 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground" value={activity} onChange={(event) => setActivity(event.target.value)} data-testid="select-facility-activity">
                <option value="">{text.filterActivity}</option>{activities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </div>
        {facilitiesQuery.isLoading ? <LoadingBlocks label={text.loadingFacilities} id="facilities" /> : facilitiesQuery.isError ? <QueryError message={text.failedFacilities} retry={() => void facilitiesQuery.refetch()} retryLabel={text.retry} id="facilities" /> : !filteredFacilities.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-facilities">
            <MapPin className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
            <h3 className="font-display mt-4 text-xl font-bold">{text.noFacilities}</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{facilities.length ? text.noFacilitiesBody : text.noFacilitiesAllBody}</p>
            {(city || activity) && <button type="button" className="mt-5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => { setCity(''); setActivity(''); }} data-testid="button-clear-facility-filters">{text.clear}</button>}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground" data-testid="text-facility-result-count">{filteredFacilities.length} {text.matches}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredFacilities.map((facility) => {
                const expanded = selectedId === facility.id;
                const placement = placementForFacility(sponsoredPlacements, facility, 'search_sponsored', activity)
                  ?? placementForFacility(sponsoredPlacements, facility, 'category_featured', activity);
                const trackedPlacementType = placement?.placementTypes.includes('search_sponsored') ? 'search_sponsored' : 'category_featured';
                const status = facility.openingStatus === 'open' ? text.open : facility.openingStatus === 'closed' ? text.closed : text.unavailable;
                const card = <article id={`public-facility-${facility.id}`} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30 sm:p-6" data-testid={`card-public-facility-${facility.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{facility.city}</p>
                        {placement && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900" data-testid={`badge-sponsored-facility-${facility.id}`}>{text.sponsored}</span>}
                      </div>
                      <h3 className="font-display mt-2 text-2xl font-bold">{localized(facility.localizedName, language) || facility.facility}</h3>
                      {localized(facility.localizedDistrict, language) && <p className="mt-1 text-sm text-muted-foreground">{text.district} · {localized(facility.localizedDistrict, language)}</p>}
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${facility.openingStatus === 'open' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`} data-testid={`status-facility-${facility.id}`}>{status}{facility.openingStatus === 'open' && facility.closesAt ? ` · ${text.closesAt} ${facility.closesAt}` : ''}</span>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{localized(facility.localizedDescription, language)}</p>
                  <div className="mt-4 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{localized(facility.localizedAddress, language) || facility.city}</span></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {facility.activities.map((item, index) => <span key={`${facility.id}-activity-${index}`} className="rounded-full bg-accent/60 px-3 py-1 text-xs font-semibold">{localized(item, language)}</span>)}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                    <span className="text-xs text-muted-foreground">{facility.upcomingSessions.length} {text.sessions.toLowerCase()}</span>
                    <button type="button" onClick={() => setSelectedId(expanded ? null : facility.id)} aria-expanded={expanded} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid={`button-toggle-facility-${facility.id}`}>
                      {expanded ? text.hideProfile : text.viewProfile}<ArrowRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : 'rtl:rotate-180'}`} aria-hidden="true" />
                    </button>
                  </div>
                  {expanded && <FacilityProfileDetails facility={facility} language={language} />}
                </article>;
                return placement
                  ? <SponsoredPlacementTracker key={facility.id} campaignId={placement.campaignId} placementType={trackedPlacementType}>{card}</SponsoredPlacementTracker>
                  : <div key={facility.id}>{card}</div>;
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}

export function PublicCourseBrowser({ language = 'en' }: { language?: PublicCatalogLanguage }) {
  const text = copy[language];
  const coursesQuery = useGetPublicCourses({ query: { queryKey: getGetPublicCoursesQueryKey() } });
  const [search, setSearch] = useState('');
  const courses = coursesQuery.data ?? [];
  const filtered = courses.filter((course) => [localized(course.localizedTitle, language), localized(course.localizedSummary, language), localized(course.localizedInstructor, language), course.category, course.level].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <section id="public-courses" className="site-shell mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10" dir={language === 'en' ? 'ltr' : 'rtl'} aria-labelledby="public-courses-title">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.courseLibrary}</p>
        <h2 id="public-courses-title" className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.coursesTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text.coursesIntro}</p>
      </header>
      <section className="mt-8" aria-label={text.courses}>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.publicInfo}</p><h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.courses}</h2></div>
          <label className="relative block sm:w-80">
            <span className="sr-only">{text.search}</span>
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="h-11 w-full rounded-full border border-input bg-card ps-10 pe-4 text-sm text-foreground placeholder:text-muted-foreground" data-testid="input-search-courses" />
          </label>
        </div>
        {coursesQuery.isLoading ? <LoadingBlocks label={text.loadingCourses} id="courses" /> : coursesQuery.isError ? <QueryError message={text.failedCourses} retry={() => void coursesQuery.refetch()} retryLabel={text.retry} id="courses" /> : !courses.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-courses"><BookOpen className="mx-auto h-7 w-7 text-primary" aria-hidden="true" /><h3 className="font-display mt-4 text-xl font-bold">{text.noCourses}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{text.noCoursesBody}</p></div>
        ) : !filtered.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-course-search"><p className="font-display text-xl font-bold">{text.noSearchResults}</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((course: PublicCourse, index: number) => <article key={course.id} className="offering-card flex min-h-[270px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid={`card-public-course-${course.id}`}>
              <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-accent/70 px-3 py-1 text-xs font-bold">{course.category}</span><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div>
              <h3 className="font-display mt-5 text-2xl font-bold leading-tight">{localized(course.localizedTitle, language)}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{localized(course.localizedSummary, language)}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div><p className="text-xs font-semibold text-muted-foreground">{text.instructor}</p><p className="mt-1 font-medium">{localized(course.localizedInstructor, language)}</p></div>
                <div><p className="text-xs font-semibold text-muted-foreground">{text.courseLevel}</p><p className="mt-1 font-medium">{course.level}</p></div>
              </div>
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />{course.durationMinutes} {text.duration}</p>
            </article>)}
          </div>
        )}
      </section>
      <aside className="mt-8 rounded-2xl bg-muted/70 p-5 sm:px-7 sm:py-6"><p className="text-sm font-medium leading-6">{text.appNote}</p></aside>
    </section>
  );
}
