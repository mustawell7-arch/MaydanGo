import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Clock3, ExternalLink, MapPin, RefreshCw, Search, Sparkles, Star } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetPublicCatalogQueryKey,
  getGetPublicCoursesQueryKey,
  getGetPublicFacilitiesQueryKey,
  getGetPublicFacilityQueryKey,
  getGetPublicFacilityReviewsQueryKey,
  getGetPublicSponsoredFacilitiesQueryKey,
  getGetPublicSponsoredContentQueryKey,
  getGetPublicInstructorProfilesQueryKey,
  useGetPublicCatalog,
  useGetPublicCourses,
  useGetPublicFacilities,
  useGetPublicFacility,
  useGetPublicFacilityReviews,
  useGetPublicSponsoredFacilities,
  useGetPublicSponsoredContent,
  useGetPublicInstructorProfiles,
  useRecordPublicSponsoredFacilityEvent,
  useRecordPublicSponsoredContentEvent,
} from '@workspace/api-client-react';
import type {
  PublicFacility, PublicCourse, PublicInstructorProfile,
  PublicSponsoredContentPlacement, SponsoredContentPlacementType, SponsoredContentType,
} from '@workspace/api-client-react';

export type PublicCatalogLanguage = 'en' | 'ar' | 'ku';
type CourseLanguageCode = 'en' | 'ar' | 'ku';

type Copy = {
  [key: string]: string;
};

const copy: Record<PublicCatalogLanguage, Copy> = {
  en: {
    region: 'IRAQ · KURDISTAN · WEST · SOUTH',
    heroTitle: 'Discover movement and wellbeing across Iraq.',
    heroBody: 'Browse published facilities, classes, events, and courses across Iraq. This catalogue is for discovery; reservations and course access are handled in the MaydanGo app when available.',
    facilities: 'Explore facilities',
    courses: 'Browse courses',
    publicInfo: 'Public information',
    facilityDirectory: 'Facility directory',
    refreshed: 'Current public listings',
    discover: 'Explore movement and wellbeing',
    discoverBody: 'Browse published facilities and activities across Iraq. Availability depends on your location and participating providers.',
    classesEvents: 'Classes & events',
    facilitiesCount: 'Facilities',
    coursesCount: 'Courses',
    browseTitle: 'Browse facilities',
    browseIntro: 'Choose a city or activity to find facilities that suit you.',
    filterCity: 'All cities',
    filterActivity: 'All activities',
    city: 'City',
    activity: 'Activity',
    clear: 'Clear filters',
    matches: 'matches',
    noFacilities: 'No matching facilities',
    noFacilitiesBody: 'No facilities match these filters. Try another city or activity.',
    noFacilitiesAllBody: 'No facilities are listed yet. Published profiles will appear here when available.',
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
    noSessions: 'No upcoming sessions are listed for this facility.',
    sessionDescription: 'Description', sessionInstructor: 'Instructor', skillLevel: 'Skill level',
    sessionAudience: 'Participant access', allParticipants: 'All participants', womenOnly: 'Women only', menOnly: 'Men only',
    mixedAudience: 'Mixed session', familyAudience: 'Family session', childrenAudience: 'Children’s session', privateAudience: 'Private session',
    instructorGender: 'Instructor gender', femaleInstructor: 'Female', maleInstructor: 'Male', familyRequirements: 'Family and guardian requirements',
    ageRequirements: 'Age requirements', ages: 'Ages', upToAge: 'Up to age',
    equipment: 'Required equipment', healthSafety: 'Health and safety', sessionAccessibility: 'Accessibility information',
    sessionInstructions: 'Participant instructions', sessionCheckin: 'Check-in window', sessionCapacity: 'Places remaining',
    profileLoading: 'Loading facility details',
    profileError: 'Facility details could not be loaded.',
    reviews: 'Public reviews',
    noReviews: 'No public reviews are listed.',
    reviewUnavailable: 'Reviews could not be loaded.',
    reviewCount: 'reviews',
    coursesTitle: 'Online courses',
    coursesIntro: 'Browse the courses listed on MaydanGo and find one that suits your interests and experience.',
    courseLibrary: 'Published courses',
    courseLevel: 'Level',
    duration: 'minutes',
    instructor: 'Instructor',
    noCourses: 'No courses are currently listed',
    noCoursesBody: 'Published course details will appear here when available.',
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
    appNote: 'Bookings and course access are handled through the MaydanGo app when available.',
    sponsored: 'Sponsored',
    viewFacility: 'View facility',
    updated: 'Public information only',
    search: 'Search courses',
    noSearchResults: 'No courses match your search. Try another term.',
    allCategories: 'All categories',
    categoryFilter: 'Filter courses by category',
    noFilteredCourses: 'No courses match the selected filters. Try another category.',
    instructorProfiles: 'Instructor profiles',
    instructorProfilesIntro: 'Browse instructor names and course titles shown in published listings. Only information approved for public display appears here.',
    noInstructorProfiles: 'Instructor information will appear alongside courses published for public discovery.',
    onePublishedCourse: 'published course',
    courseCountLabel: 'published courses',
    moreCourses: 'more courses',
    membershipRequirementTitle: 'Accessing course lessons',
    membershipRequirement: 'To watch lessons in the MaydanGo app, you need an active membership that includes digital-course access.',
    viewMembershipPlans: 'View membership information',
    courseDetails: 'Course details',
    lessonCount: 'Lessons',
    instructionLanguages: 'Instruction languages',
    subtitleLanguages: 'Subtitles',
    requiredEquipment: 'Required equipment',
    disclaimers: 'Disclaimers',
    supportingMaterials: 'Supporting materials',
    informationNotProvided: 'Information not provided',
    noSubtitles: 'No subtitles',
    languageEnglish: 'English',
    languageArabic: 'Arabic',
    languageSoraniKurdish: 'Sorani Kurdish',
  },
  ar: {
    region: 'العراق · كردستان · الغرب · الجنوب',
    heroTitle: 'اكتشف خيارات الحركة والعافية في العراق',
    heroBody: 'تصفح المرافق والحصص والفعاليات والدورات المنشورة في أنحاء العراق. هذا الدليل للاستكشاف؛ وتتم الحجوزات والوصول إلى الدروس عبر تطبيق MaydanGo عند توفرها.',
    facilities: 'استكشف المرافق',
    courses: 'تصفح الدورات',
    publicInfo: 'معلومات عامة',
    facilityDirectory: 'دليل المرافق',
    refreshed: 'القوائم العامة الحالية',
    discover: 'استكشف خيارات الحركة والعافية',
    discoverBody: 'تصفح المرافق والأنشطة المنشورة في أنحاء العراق. يختلف التوفر حسب موقعك والجهات المشاركة.',
    classesEvents: 'الحصص والفعاليات',
    facilitiesCount: 'المرافق',
    coursesCount: 'الدورات',
    browseTitle: 'ابحث عن المرافق',
    browseIntro: 'اختر مدينة أو نشاطاً لتضييق النتائج. تحقق من التفاصيل مع كل جهة قبل الزيارة.',
    filterCity: 'كل المدن',
    filterActivity: 'كل الأنشطة',
    city: 'المدينة',
    activity: 'النشاط',
    clear: 'مسح عوامل التصفية',
    matches: 'نتائج',
    noFacilities: 'لا توجد مرافق مطابقة',
    noFacilitiesBody: 'لا توجد مرافق تطابق عوامل التصفية التي اخترتها. جرّب مدينة أو نشاطاً آخر.',
    noFacilitiesAllBody: 'لا توجد مرافق مدرجة حالياً. ستظهر الملفات المنشورة هنا عند توفرها.',
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
    noSessions: 'لا توجد جلسات قادمة مدرجة لهذا المرفق.',
    sessionDescription: 'الوصف', sessionInstructor: 'المدرب', skillLevel: 'مستوى المهارة',
    sessionAudience: 'فئة المشاركين', allParticipants: 'جميع المشاركين', womenOnly: 'للنساء فقط', menOnly: 'للرجال فقط',
    mixedAudience: 'جلسة مختلطة', familyAudience: 'جلسة عائلية', childrenAudience: 'جلسة للأطفال', privateAudience: 'جلسة خاصة',
    instructorGender: 'جنس المدرب', femaleInstructor: 'امرأة', maleInstructor: 'رجل', familyRequirements: 'متطلبات الأسرة وولي الأمر',
    ageRequirements: 'الفئة العمرية', ages: 'الأعمار', upToAge: 'حتى عمر',
    equipment: 'المعدات المطلوبة', healthSafety: 'الصحة والسلامة', sessionAccessibility: 'معلومات إمكانية الوصول',
    sessionInstructions: 'تعليمات المشاركين', sessionCheckin: 'فترة تسجيل الحضور', sessionCapacity: 'الأماكن المتبقية',
    profileLoading: 'جارٍ تحميل تفاصيل المرفق',
    profileError: 'تعذر تحميل تفاصيل المرفق.',
    reviews: 'التقييمات العامة',
    noReviews: 'لا توجد تقييمات عامة مدرجة.',
    reviewUnavailable: 'تعذر تحميل التقييمات.',
    reviewCount: 'تقييمات',
    coursesTitle: 'الدورات عبر الإنترنت',
    coursesIntro: 'تصفح تفاصيل الدورات المنشورة، بما فيها أسماء المدربين والمستويات والمدد. يمكن للأعضاء الذين تشمل خططهم الدورات الرقمية مشاهدة الدروس عبر تطبيق MaydanGo.',
    courseLibrary: 'الدورات المنشورة',
    courseLevel: 'المستوى',
    duration: 'دقيقة',
    instructor: 'المدرّب',
    noCourses: 'لا توجد دورات مدرجة حالياً',
    noCoursesBody: 'ستظهر تفاصيل الدورات المنشورة هنا عند توفرها.',
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
    appNote: 'تتم الحجوزات والوصول إلى الدورات عبر تطبيق MaydanGo عند توفرها.',
    sponsored: 'إعلان مدفوع',
    viewFacility: 'عرض المنشأة',
    updated: 'معلومات عامة فقط',
    search: 'ابحث في الدورات',
    noSearchResults: 'لا توجد دورات تطابق بحثك. جرّب كلمة أخرى.',
    allCategories: 'كل الفئات',
    categoryFilter: 'تصفية الدورات حسب الفئة',
    noFilteredCourses: 'لا توجد دورات تطابق عوامل التصفية. جرّب فئة أخرى.',
    instructorProfiles: 'ملفات المدرّبين',
    instructorProfilesIntro: 'تعرّف على المدربين وعناوين الدورات من القوائم المنشورة. لا تظهر هنا إلا المعلومات المعتمدة للنشر العام.',
    noInstructorProfiles: 'ستظهر معلومات المدربين مع الدورات المنشورة للاستكشاف العام.',
    onePublishedCourse: 'دورة منشورة',
    courseCountLabel: 'دورات منشورة',
    moreCourses: 'دورات أخرى',
    membershipRequirementTitle: 'متطلبات الوصول إلى الدورات',
    membershipRequirement: 'تتطلب مشاهدة الدروس عضوية فعالة تشمل الوصول إلى الدورات الرقمية. يعرض هذا الموقع معلومات الدورات، لكنه لا يفعّل العضويات ولا يفتح الدروس.',
    viewMembershipPlans: 'عرض معلومات العضوية',
    courseDetails: 'تفاصيل الدورة',
    lessonCount: 'عدد الدروس',
    instructionLanguages: 'لغة التدريب',
    subtitleLanguages: 'الترجمة النصية',
    requiredEquipment: 'المعدات المطلوبة',
    disclaimers: 'تنبيهات',
    supportingMaterials: 'مواد مساندة',
    informationNotProvided: 'لم تُقدَّم معلومات',
    noSubtitles: 'لا تتوفر ترجمة نصية',
    languageEnglish: 'الإنجليزية',
    languageArabic: 'العربية',
    languageSoraniKurdish: 'الكردية السورانية',
  },
  ku: {
    region: 'عێراق · کوردستان · ڕۆژئاوا · باشوور',
    heroTitle: 'هەڵبژاردەکانی جووڵە و تەندروستی لە عێراق بدۆزەوە',
    heroBody: 'شوێن، وانە، بۆنە و کۆرسە بڵاوکراوەکان لە سەرانسەری عێراق ببینە. ئەم کاتالۆگە بۆ دۆزینەوەیە؛ حجز و دەستگەیشتن بە وانەکان، کاتێک بەردەست بن، لە ئەپی MaydanGo تەواو دەکرێن.',
    facilities: 'شوێنەکان ببینە',
    courses: 'کۆرسەکان ببینە',
    publicInfo: 'زانیاریی گشتی',
    facilityDirectory: 'ڕێبەری شوێنەکان',
    refreshed: 'لیستە گشتییە نوێکان',
    discover: 'هەڵبژاردەکانی جووڵە و تەندروستی ببینە',
    discoverBody: 'شوێن و چالاکییە بڵاوکراوەکان لە عێراق بپشکنە. بەردەستبوون بە شوێن و دابینکەرە بەشدارەکانەوە پەیوەستە.',
    classesEvents: 'وانە و بۆنەکان',
    facilitiesCount: 'شوێنەکان',
    coursesCount: 'کۆرسەکان',
    browseTitle: 'گەڕان بەدوای شوێنەکاندا',
    browseIntro: 'شار یان چالاکییەک هەڵبژێرە بۆ کەمکردنەوەی ئەنجامەکان. پێش سەردان وردەکارییەکان لەگەڵ دابینکەر پشتڕاست بکەرەوە.',
    filterCity: 'هەموو شارەکان',
    filterActivity: 'هەموو چالاکییەکان',
    city: 'شار',
    activity: 'چالاکی',
    clear: 'پاککردنەوەی فلتەرەکان',
    matches: 'ئەنجام',
    noFacilities: 'هیچ شوێنێک نەدۆزرایەوە',
    noFacilitiesBody: 'هیچ شوێنێک لەگەڵ فلتەرە هەڵبژێردراوەکان ناگونجێت. شار یان چالاکییەکی تر هەڵبژێرە.',
    noFacilitiesAllBody: 'هێشتا هیچ شوێنێک لیست نەکراوە. پرۆفایلی بڵاوکراوە کاتێک بەردەست بێت لێرە دەردەکەوێت.',
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
    noSessions: 'هیچ وانەیەکی داهاتوو بۆ ئەم شوێنە لیست نەکراوە.',
    sessionDescription: 'وەسف', sessionInstructor: 'ڕاهێنەر', skillLevel: 'ئاستی شارەزایی',
    sessionAudience: 'جۆری بەشداربووان', allParticipants: 'هەموو بەشداربووان', womenOnly: 'تەنها بۆ ژنان', menOnly: 'تەنها بۆ پیاوان',
    mixedAudience: 'وانەی تێکەڵ', familyAudience: 'وانەی خێزانی', childrenAudience: 'وانەی منداڵان', privateAudience: 'وانەی تایبەت',
    instructorGender: 'ڕەگەزی ڕاهێنەر', femaleInstructor: 'ژن', maleInstructor: 'پیاو', familyRequirements: 'پێداویستیی خێزان و سەرپەرشتیار',
    ageRequirements: 'مەرجی تەمەن', ages: 'تەمەن', upToAge: 'تا تەمەنی',
    equipment: 'کەرەستەی پێویست', healthSafety: 'تەندروستی و سەلامەتی', sessionAccessibility: 'زانیاریی دەستڕاگەیشتن',
    sessionInstructions: 'ڕێنمایی بەشداربووان', sessionCheckin: 'ماوەی تۆمارکردنی گەیشتن', sessionCapacity: 'شوێنی ماوە',
    profileLoading: 'وردەکاریی شوێن بار دەکرێت',
    profileError: 'نەتوانرا وردەکاریی شوێن باربکرێت.',
    reviews: 'هەڵسەنگاندنی گشتی',
    noReviews: 'هیچ هەڵسەنگاندنێکی گشتی بڵاونەکراوەتەوە.',
    reviewUnavailable: 'نەتوانرا هەڵسەنگاندنەکان باربکرێن.',
    reviewCount: 'هەڵسەنگاندن',
    coursesTitle: 'کۆرسەکانی ئۆنلاین',
    coursesIntro: 'وردەکاریی کۆرسە بڵاوکراوەکان، ناوی مامۆستا، ئاست و ماوە ببینە. ئەندامانی پلانی دەستگەیشتنی کۆرسی دیجیتاڵی لەخۆگرتوو، دەتوانن وانەکان لە ئەپی MaydanGo ببینن.',
    courseLibrary: 'کۆرسە بڵاوکراوەکان',
    courseLevel: 'ئاست',
    duration: 'خولەک',
    instructor: 'مامۆستا',
    noCourses: 'ئێستا هیچ کۆرسێک لیست نەکراوە',
    noCoursesBody: 'وردەکاریی کۆرسە بڵاوکراوەکان کاتێک بەردەست بن لێرە دەردەکەون.',
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
    appNote: 'حجز و دەستگەیشتن بە کۆرس لە ئەپی MaydanGo بەڕێوەدەبرێن، کاتێک بەردەست بن.',
    sponsored: 'سپۆنسەرکراو',
    viewFacility: 'بینینی شوێن',
    updated: 'تەنها زانیاریی گشتی',
    search: 'گەڕان لە کۆرسەکان',
    noSearchResults: 'هیچ کۆرسێک لەگەڵ وشەی گەڕانەکەت ناگونجێت. وشەیەکی تر تاقی بکەرەوە.',
    allCategories: 'هەموو پۆلەکان',
    categoryFilter: 'فلتەرکردنی کۆرسەکان بەپێی پۆل',
    noFilteredCourses: 'هیچ کۆرسێک لەگەڵ ئەم فلتەرانە ناگونجێت. پۆلێکی تر هەڵبژێرە.',
    instructorProfiles: 'پرۆفایلی مامۆستاکان',
    instructorProfilesIntro: 'ناوی مامۆستاکان و ناونیشانی کۆرسە بڵاوکراوەکان ببینە. تەنها ئەو زانیارییانە پیشان دەدرێن کە بۆ بڵاوکردنەوەی گشتی پەسەندکراون.',
    noInstructorProfiles: 'زانیاریی مامۆستاکان لەگەڵ کۆرسە بڵاوکراوەکانی گشتی دەردەکەوێت.',
    onePublishedCourse: 'کۆرسی بڵاوکراوە',
    courseCountLabel: 'کۆرسی بڵاوکراوەکان',
    moreCourses: 'کۆرسی زیاتر',
    membershipRequirementTitle: 'مەرجەکانی دەستگەیشتن بە کۆرس',
    membershipRequirement: 'بینینی وانە پێویستی بە ئەندامێتی چالاک هەیە کە دەستگەیشتن بە کۆرسی دیجیتاڵی لەخۆبگرێت. ئەم ماڵپەڕە زانیاریی کۆرس پیشان دەدات، بەڵام ئەندامێتی چالاک ناکات و وانەکان ناکاتەوە.',
    viewMembershipPlans: 'زانیاریی ئەندامێتی ببینە',
    courseDetails: 'وردەکارییەکانی کۆرس',
    lessonCount: 'ژمارەی وانەکان',
    instructionLanguages: 'زمانەکانی وانە',
    subtitleLanguages: 'ژێرنووس',
    requiredEquipment: 'کەلوپەلی پێویست',
    disclaimers: 'ئاگادارییەکان',
    supportingMaterials: 'کەرەستەی یارمەتیدەر',
    informationNotProvided: 'زانیارییەک نەدراوە',
    noSubtitles: 'ژێرنووس بەردەست نییە',
    languageEnglish: 'ئینگلیزی',
    languageArabic: 'عەرەبی',
    languageSoraniKurdish: 'کوردیی سۆرانی',
  },
};

const courseLanguageNames: Record<PublicCatalogLanguage, Record<CourseLanguageCode, string>> = {
  en: { en: 'English', ar: 'Arabic', ku: 'Sorani Kurdish' },
  ar: { en: 'الإنجليزية', ar: 'العربية', ku: 'الكردية السورانية' },
  ku: { en: 'ئینگلیزی', ar: 'عەرەبی', ku: 'کوردیی سۆرانی' },
};

function localized(value: { en: string; ar: string; ku: string } | null | undefined, language: PublicCatalogLanguage) {
  return value?.[language] || value?.en || '';
}

function sessionAudienceLabel(sessionType: string | undefined, gender: string | undefined, labels: Copy) {
  const effectiveType = sessionType && sessionType !== 'unspecified'
    ? sessionType
    : gender === 'female' ? 'women_only' : gender === 'male' ? 'men_only' : 'mixed';
  const audienceLabels: Record<string, string> = {
    women_only: labels.womenOnly,
    men_only: labels.menOnly,
    mixed: labels.mixedAudience,
    family: labels.familyAudience,
    children: labels.childrenAudience,
    private: labels.privateAudience,
  };
  return audienceLabels[effectiveType] ?? labels.allParticipants;
}

function instructorGenderLabel(value: string | null | undefined, labels: Copy) {
  if (value === 'female') return labels.femaleInstructor;
  if (value === 'male') return labels.maleInstructor;
  return '';
}

function sessionAgeLabel(minAge: number, maxAge: number | null, labels: Copy) {
  if (maxAge !== null) return minAge > 0 ? `${labels.ages} ${minAge}–${maxAge}` : `${labels.upToAge} ${maxAge}`;
  return minAge > 0 ? `${minAge}+` : '';
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
                <p className="mt-1 text-muted-foreground">{session.category} · {new Date(session.startsAt).toLocaleString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' })} – {new Date(session.endsAt).toLocaleTimeString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="mt-1 text-muted-foreground">{text.sessionCapacity}: {session.remaining}/{session.capacity}</p>
                 <p className="mt-1"><span className="font-semibold">{text.sessionAudience}:</span> {sessionAudienceLabel(session.sessionType, session.gender, text)}</p>
                 {sessionAgeLabel(session.minAge, session.maxAge, text) && <p className="mt-1"><span className="font-semibold">{text.ageRequirements}:</span> {sessionAgeLabel(session.minAge, session.maxAge, text)}</p>}
                {localized(session.localizedDescription, language) && <p className="mt-2 leading-6"><span className="font-semibold">{text.sessionDescription}:</span> {localized(session.localizedDescription, language)}</p>}
                {localized(session.localizedInstructor, language) && <p className="mt-1"><span className="font-semibold">{text.sessionInstructor}:</span> {localized(session.localizedInstructor, language)}</p>}
                 {instructorGenderLabel(session.instructorGender, text) && <p className="mt-1"><span className="font-semibold">{text.instructorGender}:</span> {instructorGenderLabel(session.instructorGender, text)}</p>}
                 {localized(session.familyRequirements, language) && <p className="mt-1"><span className="font-semibold">{text.familyRequirements}:</span> {localized(session.familyRequirements, language)}</p>}
                {session.difficultyLevel && <p className="mt-1"><span className="font-semibold">{text.skillLevel}:</span> {session.difficultyLevel === 'all-levels' ? (language === 'ar' ? 'جميع المستويات' : language === 'ku' ? 'هەموو ئاستەکان' : 'All levels') : session.difficultyLevel}</p>}
                {localized(session.requiredEquipment, language) && <p className="mt-1"><span className="font-semibold">{text.equipment}:</span> {localized(session.requiredEquipment, language)}</p>}
                {session.instructions && <p className="mt-1"><span className="font-semibold">{text.sessionInstructions}:</span> {session.instructions}</p>}
                {localized(session.healthSafetyInstructions, language) && <p className="mt-1"><span className="font-semibold">{text.healthSafety}:</span> {localized(session.healthSafetyInstructions, language)}</p>}
                {localized(session.accessibilityInformation, language) && <p className="mt-1"><span className="font-semibold">{text.sessionAccessibility}:</span> {localized(session.accessibilityInformation, language)}</p>}
                {session.checkinOpensAt && session.checkinClosesAt && <p className="mt-1 text-muted-foreground">{text.sessionCheckin}: {new Date(session.checkinOpensAt).toLocaleTimeString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' })} – {new Date(session.checkinClosesAt).toLocaleTimeString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' })}</p>}
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

function SponsoredContentTracker({ campaignId, placementType, children }: {
  campaignId: string;
  placementType: SponsoredContentPlacementType;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const recordEvent = useRecordPublicSponsoredContentEvent();
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
function placementForContent(
  placements: PublicSponsoredContentPlacement[],
  targetType: SponsoredContentType,
  targetId: string,
  placementTypes: SponsoredContentPlacementType[],
): { placement: PublicSponsoredContentPlacement; placementType: SponsoredContentPlacementType } | undefined {
  for (const placement of placements) {
    if (placement.targetType !== targetType || placement.targetId !== targetId) continue;
    const placementType = placementTypes.find(type => placement.placementTypes.includes(type));
    if (placementType) return { placement, placementType };
  }
  return undefined;
}
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
  const sponsoredContentQuery = useGetPublicSponsoredContent(undefined, {
    query: { queryKey: getGetPublicSponsoredContentQueryKey() },
  });
  const courses = useGetPublicCourses({ query: { queryKey: getGetPublicCoursesQueryKey() } });
  const sponsoredContent = sponsoredContentQuery.data ?? [];
  const offerings = (catalog.data ?? [])
    .filter((offering) => !offering.additionalPayment && Date.parse(offering.startsAt) > Date.now())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcoming = [...offerings].sort((a, b) =>
    Number(Boolean(placementForContent(sponsoredContent, 'event', b.id, ['home_promotion', 'featured_event', 'category_featured'])))
    - Number(Boolean(placementForContent(sponsoredContent, 'event', a.id, ['home_promotion', 'featured_event', 'category_featured']))),
  ).slice(0, 3);
  const sponsoredPlacements = (sponsored.data ?? []) as PublicSponsoredPlacement[];
  const facilityPreview = [...(facilities.data ?? [])]
    .sort((left, right) => Number(Boolean(placementForFacility(sponsoredPlacements, right, 'home_featured')))
      - Number(Boolean(placementForFacility(sponsoredPlacements, left, 'home_featured'))))
    .slice(0, 2);
  const coursePreview = [...(courses.data ?? [])].sort((a, b) =>
    Number(Boolean(placementForContent(sponsoredContent, 'course', b.id, ['home_promotion', 'featured_course', 'category_featured'])))
    - Number(Boolean(placementForContent(sponsoredContent, 'course', a.id, ['home_promotion', 'featured_course', 'category_featured']))),
  ).slice(0, 2);
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
              {upcoming.map((offering) => {
                const placement = offering.kind === 'event'
                  ? placementForContent(sponsoredContent, 'event', offering.id, ['home_promotion', 'featured_event', 'category_featured'])
                  : undefined;
                const card = <article className="offering-card rounded-xl border border-border bg-card p-4" data-testid={`card-home-offering-${offering.id}`}>
                  {offering.imageUrl && <img src={offering.imageUrl} alt={localized(offering.localizedTitle, language) || offering.title} loading="lazy" referrerPolicy="no-referrer" className="mb-3 aspect-[16/8] w-full rounded-lg object-cover" />}
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-accent/70 px-2.5 py-1 text-[11px] font-bold">{offering.kind === 'session' ? text.class : offering.kind === 'event' ? text.event : text.coaching}</span>
                    {placement
                      ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900" data-testid={`badge-sponsored-event-${offering.id}`}>{text.sponsored}</span>
                      : <span className="text-xs text-muted-foreground">{new Date(offering.startsAt).toLocaleDateString(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { month: 'short', day: 'numeric' })}</span>}
                  </div>
                  <h4 className="font-display mt-3 text-lg font-bold leading-snug">{localized(offering.localizedTitle, language) || offering.title}</h4>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{offering.city} · {offering.facility}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">{text.sessionAudience}:</span> {sessionAudienceLabel(offering.sessionType, offering.gender, text)}</p>
                  {sessionAgeLabel(offering.minAge, offering.maxAge, text) && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">{text.ageRequirements}:</span> {sessionAgeLabel(offering.minAge, offering.maxAge, text)}</p>}
                  {instructorGenderLabel(offering.instructorGender, text) && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">{text.instructorGender}:</span> {instructorGenderLabel(offering.instructorGender, text)}</p>}
                  {localized(offering.familyRequirements, language) && <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.familyRequirements}: {localized(offering.familyRequirements, language)}</p>}
                  {offering.localizedDescription && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{localized(offering.localizedDescription, language)}</p>}
                  {offering.instructions && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{offering.instructions}</p>}
                </article>;
                return placement
                  ? <SponsoredContentTracker key={offering.id} campaignId={placement.placement.campaignId} placementType={placement.placementType}>{card}</SponsoredContentTracker>
                  : <div key={offering.id}>{card}</div>;
              })}
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
              {coursePreview.map((course) => {
                const placement = placementForContent(sponsoredContent, 'course', course.id, ['home_promotion', 'featured_course', 'category_featured']);
                const card = <div className="rounded-xl border border-border bg-card p-4" data-testid={`card-home-course-${course.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{localized(course.localizedTitle, language)}</p>
                    {placement && <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900" data-testid={`badge-sponsored-course-home-${course.id}`}>{text.sponsored}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{localized(course.localizedSummary, language)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{localized(course.localizedInstructor, language)} · {course.level} · {course.durationMinutes} {text.duration}</p>
                </div>;
                return <li key={course.id}>{placement
                  ? <SponsoredContentTracker campaignId={placement.placement.campaignId} placementType={placement.placementType}>{card}</SponsoredContentTracker>
                  : card}</li>;
              })}
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
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.facilityDirectory}</p>
        <h2 id="public-facilities-title" className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.browseTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text.browseIntro}</p>
      </header>
      <section className="mt-8" aria-label={text.facilities}>
        <div className="mb-5 flex justify-end">
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
  const sponsoredContentQuery = useGetPublicSponsoredContent(undefined, {
    query: { queryKey: getGetPublicSponsoredContentQueryKey() },
  });
  const instructorProfilesQuery = useGetPublicInstructorProfiles({ query: { queryKey: getGetPublicInstructorProfilesQueryKey(), retry: false } });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const courses = coursesQuery.data ?? [];
  const locale = language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ';
  const categories = useMemo(
    () => Array.from(new Set(courses.map((course) => course.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, locale)),
    [courses, locale],
  );
  const sponsoredContent = sponsoredContentQuery.data ?? [];
  const filtered = courses.filter((course) =>
    (!activeCategory || course.category === activeCategory)
    && [localized(course.localizedTitle, language), localized(course.localizedSummary, language), localized(course.localizedInstructor, language), course.category, course.level]
      .join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ).sort((a, b) =>
    Number(Boolean(placementForContent(sponsoredContent, 'course', b.id, ['featured_course', 'category_featured'])))
    - Number(Boolean(placementForContent(sponsoredContent, 'course', a.id, ['featured_course', 'category_featured']))),
  );
  const instructorProfiles = instructorProfilesQuery.data ?? [];

  return (
    <section id="public-courses" className="site-shell mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10" dir={language === 'en' ? 'ltr' : 'rtl'} aria-labelledby="public-courses-title">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.courseLibrary}</p>
        <h2 id="public-courses-title" className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.coursesTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text.coursesIntro}</p>
      </header>
      <aside className="mb-8 flex flex-col gap-4 rounded-2xl border border-border bg-muted/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7" data-testid="notice-course-membership">
        <div><p className="font-semibold">{text.membershipRequirementTitle}</p><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{text.membershipRequirement}</p></div>
        <Link href="/membership-plans" className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-primary" data-testid="link-online-membership-requirements">
          {text.viewMembershipPlans}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </aside>
      <section className="mt-8" aria-label={text.courses}>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.publicInfo}</p><h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.courses}</h2></div>
          <label className="relative block sm:w-80">
            <span className="sr-only">{text.search}</span>
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="h-11 w-full rounded-full border border-input bg-card ps-10 pe-4 text-sm text-foreground placeholder:text-muted-foreground" data-testid="input-search-courses" />
          </label>
        </div>
        {!coursesQuery.isLoading && !coursesQuery.isError && categories.length > 0 ? <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={text.categoryFilter} data-testid="group-course-category-filter">
          {[text.allCategories, ...categories].map((category, index) => {
            const value = index === 0 ? '' : categories[index - 1];
            const selected = activeCategory === value;
            return <button
              key={value || 'all'}
              type="button"
              onClick={() => setActiveCategory(value)}
              aria-pressed={selected}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/70 hover:border-primary/40 hover:text-primary'}`}
              data-testid={`button-filter-course-category-${index}`}
            >{category}</button>;
          })}
        </div> : null}
        {coursesQuery.isLoading ? <LoadingBlocks label={text.loadingCourses} id="courses" /> : coursesQuery.isError ? <QueryError message={text.failedCourses} retry={() => void coursesQuery.refetch()} retryLabel={text.retry} id="courses" /> : !courses.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-courses"><BookOpen className="mx-auto h-7 w-7 text-primary" aria-hidden="true" /><h3 className="font-display mt-4 text-xl font-bold">{text.noCourses}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{text.noCoursesBody}</p></div>
        ) : !filtered.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-course-search"><p className="font-display text-xl font-bold">{text.noFilteredCourses}</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((course: PublicCourse, index: number) => {
              const placement = placementForContent(sponsoredContent, 'course', course.id, ['featured_course', 'category_featured']);
              const card = <article className="offering-card flex min-h-[270px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid={`card-public-course-${course.id}`}>
              <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-accent/70 px-3 py-1 text-xs font-bold">{course.category}</span>{placement ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900" data-testid={`badge-sponsored-course-${course.id}`}>{text.sponsored}</span> : <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>}</div>
              <h3 className="font-display mt-5 text-2xl font-bold leading-tight">{localized(course.localizedTitle, language)}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{localized(course.localizedSummary, language)}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div><p className="text-xs font-semibold text-muted-foreground">{text.instructor}</p><p className="mt-1 font-medium">{localized(course.localizedInstructor, language)}</p></div>
                <div><p className="text-xs font-semibold text-muted-foreground">{text.courseLevel}</p><p className="mt-1 font-medium">{course.level}</p></div>
              </div>
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />{course.durationMinutes} {text.duration}</p>
              <div className="mt-5 rounded-xl bg-muted/50 p-4" data-testid={`course-details-${course.id}`}>
                <h4 className="text-sm font-bold">{text.courseDetails}</h4>
                <dl className="mt-3 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.lessonCount}</dt><dd className="mt-1">{course.lessonCount}</dd></div>
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.instructionLanguages}</dt><dd className="mt-1">{course.courseLanguages?.length
                    ? course.courseLanguages.map((code) => courseLanguageNames[language][code]).join(language === 'en' ? ', ' : '، ')
                    : text.informationNotProvided}</dd></div>
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.subtitleLanguages}</dt><dd className="mt-1">{course.subtitleLanguages == null
                    ? text.informationNotProvided
                    : course.subtitleLanguages.length
                      ? course.subtitleLanguages.map((code) => courseLanguageNames[language][code]).join(language === 'en' ? ', ' : '، ')
                      : text.noSubtitles}</dd></div>
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.requiredEquipment}</dt><dd className="mt-1 whitespace-pre-line">{course.requiredEquipment ? localized(course.requiredEquipment, language) : text.informationNotProvided}</dd></div>
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.disclaimers}</dt><dd className="mt-1 whitespace-pre-line">{course.disclaimers ? localized(course.disclaimers, language) : text.informationNotProvided}</dd></div>
                  <div><dt className="text-xs font-semibold text-muted-foreground">{text.supportingMaterials}</dt><dd className="mt-1 whitespace-pre-line">{course.supportingMaterials ? localized(course.supportingMaterials, language) : text.informationNotProvided}</dd></div>
                </dl>
              </div>
              </article>;
              return placement
                ? <SponsoredContentTracker key={course.id} campaignId={placement.placement.campaignId} placementType={placement.placementType}>{card}</SponsoredContentTracker>
                : <div key={course.id}>{card}</div>;
            })}
          </div>
        )}
      </section>
      <section className="mt-12" aria-labelledby="public-instructor-profiles-title" data-testid="section-public-instructor-profiles">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{text.instructor}</p>
          <h2 id="public-instructor-profiles-title" className="font-display mt-2 text-2xl font-bold sm:text-3xl">{text.instructorProfiles}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text.instructorProfilesIntro}</p>
        </header>
        {instructorProfilesQuery.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={text.loadingCourses}>{[0, 1, 2].map((index) => <div key={index} className="h-56 animate-pulse rounded-2xl border border-border bg-card" />)}</div>
          : instructorProfilesQuery.isError ? <QueryError message={text.failedCourses} retry={() => void instructorProfilesQuery.refetch()} retryLabel={text.retry} id="instructors" />
            : instructorProfiles.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {instructorProfiles.map((profile: PublicInstructorProfile, profileIndex: number) => {
            const visibleCourses = profile.courses.slice(0, 4);
            return <article key={profile.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid={`card-public-instructor-${profileIndex + 1}`}>
              <div className="flex items-start gap-4">
                {profile.photoUrl ? <img src={profile.photoUrl} alt="" loading="lazy" className="h-16 w-16 rounded-2xl object-cover" data-testid={`img-public-instructor-${profile.id}`} /> : <div aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent/70 font-display text-xl font-bold text-primary">{profile.displayName.trim().slice(0, 1)}</div>}
                <div><p className="text-xs font-semibold text-muted-foreground">{text.instructor}</p><h3 className="font-display mt-1 text-xl font-bold">{profile.displayName}</h3></div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{profile.biography}</p>
              <p className="mt-3 text-xs text-muted-foreground" data-testid={`text-instructor-course-count-${profileIndex + 1}`}>
                {profile.courses.length} {profile.courses.length === 1 ? text.onePublishedCourse : text.courseCountLabel}
              </p>
              {profile.specialties.length ? <div className="mt-4 flex flex-wrap gap-2" aria-label={text.categoryFilter}>
                {profile.specialties.map((specialty) => <span key={`${profile.id}-${specialty}`} className="rounded-full bg-accent/60 px-3 py-1 text-xs font-semibold">{specialty}</span>)}
              </div> : null}
              {profile.qualifications.length > 0 && <p className="mt-4 text-xs leading-5 text-muted-foreground">{profile.qualifications.join(' · ')}</p>}
              {profile.languages.length > 0 && <p className="mt-2 text-xs font-semibold text-primary">{profile.languages.join(' · ')}</p>}
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground">{text.courses}</p>
                <ul className="mt-2 space-y-2">
                  {visibleCourses.map((course) => <li key={course.id} className="text-sm leading-5" data-testid={`row-instructor-course-${profileIndex + 1}-${course.id}`}>
                    {localized(course.localizedTitle, language)} <span className="text-xs text-muted-foreground">· {course.category}</span>
                  </li>)}
                </ul>
              </div>
            </article>;
          })}
        </div> : <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center" data-testid="empty-public-instructor-profiles">
          <p className="text-sm leading-6 text-muted-foreground">{text.noInstructorProfiles}</p>
        </div>}
      </section>
      <aside className="mt-8 rounded-2xl bg-muted/70 p-5 sm:px-7 sm:py-6"><p className="text-sm font-medium leading-6">{text.appNote}</p></aside>
    </section>
  );
}
