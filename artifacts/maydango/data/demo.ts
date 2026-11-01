import type { ImageSourcePropType } from 'react-native';

export type CityOption = {
  id: string;
  english: string;
  arabic: string;
  kurdish: string;
  region: string;
};

export const cities: CityOption[] = [
  { id: 'all', english: 'All Iraq', arabic: 'كل العراق', kurdish: 'هەموو عێراق', region: 'Nationwide' },
  { id: 'baghdad', english: 'Baghdad', arabic: 'بغداد', kurdish: 'بەغدا', region: 'Central Iraq' },
  { id: 'basra', english: 'Basra', arabic: 'البصرة', kurdish: 'بەسرە', region: 'Southern Iraq' },
  { id: 'najaf', english: 'Najaf', arabic: 'النجف', kurdish: 'نەجەف', region: 'Central & South' },
  { id: 'mosul', english: 'Mosul', arabic: 'الموصل', kurdish: 'مووسڵ', region: 'Northern Iraq' },
  { id: 'erbil', english: 'Erbil', arabic: 'أربيل', kurdish: 'هەولێر', region: 'Kurdistan Region' },
  { id: 'sulaymaniyah', english: 'Sulaymaniyah', arabic: 'السليمانية', kurdish: 'سلێمانی', region: 'Kurdistan Region' },
  { id: 'duhok', english: 'Duhok', arabic: 'دهوك', kurdish: 'دهۆک', region: 'Kurdistan Region' },
  { id: 'ramadi', english: 'Ramadi', arabic: 'الرمادي', kurdish: 'ڕەمادی', region: 'Western Iraq' },
];

export function getCityLabel(cityId: string, language: 'en' | 'ar' | 'ku') {
  const city = cities.find((item) => item.id === cityId);
  if (!city) return cities[1].english;
  return language === 'ar' ? city.arabic : language === 'ku' ? city.kurdish : city.english;
}

export type Facility = {
  id: string;
  name: string;
  category: string;
  cityId: string;
  district: string;
  city: string;
  rating: string;
  reviews: number;
  distance: string;
  gender: string;
  openUntil: string;
  description: string;
  image: ImageSourcePropType;
  latitude: number;
  longitude: number;
  activities: string[];
  mapPosition: { x: number; y: number };
};

export type TrainingSession = {
  id: string;
  facilityId?: string;
  mode?: 'in-person' | 'online';
  title: string;
  instructor: string;
  time: string;
  duration: string;
  remaining: number;
  level: string;
  gender: string;
  image: ImageSourcePropType;
};

export type L10n = { en: string; ar: string; ku: string };
export const pick = (text: L10n, language: 'en' | 'ar' | 'ku') => text[language] ?? text.en;

export type SampleLesson = { id: string; minutes: number; title: L10n; body: L10n };

export type Course = {
  id: string;
  title: string;
  localTitle: L10n;
  summary: L10n;
  instructor: string;
  duration: string;
  level: string;
  image: ImageSourcePropType;
  /** Written sample lessons for the preview. Progress is derived from these only. */
  sampleLessons: SampleLesson[];
};

export type Coach = {
  id: string;
  name: string;
  specialty: string;
  languages: string;
  availability: string;
  image: ImageSourcePropType;
  /** Sample offered slots. Choosing one saves a local request only. */
  slots: { id: string; label: L10n }[];
};

export const facilities: Facility[] = [
  {
    id: 'rise-studio',
    name: 'Rise Movement Studio',
    category: 'Strength · Pilates',
    cityId: 'baghdad',
    district: 'Al-Mansour',
    city: 'Baghdad',
    rating: '4.9',
    reviews: 128,
    distance: '1.2 km',
    gender: 'Women-only hours',
    openUntil: 'Open until 10 pm',
    description:
      'A bright, coach-led studio for strength, reformer Pilates and mindful movement. New members are welcome at every level.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 33.3152,
    longitude: 44.3661,
    activities: ['Strength', 'Pilates', 'Mobility'],
    mapPosition: { x: 28, y: 36 },
  },
  {
    id: 'padel-house',
    name: 'Padel House Baghdad',
    category: 'Padel · Racket sports',
    cityId: 'baghdad',
    district: 'Karrada',
    city: 'Baghdad',
    rating: '4.8',
    reviews: 96,
    distance: '2.4 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 11 pm',
    description:
      'Two panoramic courts, racket hire and welcoming group games for first-timers and experienced players.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 33.3129,
    longitude: 44.4217,
    activities: ['Padel', 'Social sport', 'Coaching'],
    mapPosition: { x: 70, y: 44 },
  },
  {
    id: 'olive-room',
    name: 'The Olive Room',
    category: 'Yoga · Recovery',
    cityId: 'baghdad',
    district: 'Zayouna',
    city: 'Baghdad',
    rating: '4.9',
    reviews: 74,
    distance: '3.1 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 9 pm',
    description:
      'Slow yoga, mobility and thoughtful recovery sessions in a calm neighborhood space.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 33.3262,
    longitude: 44.4338,
    activities: ['Yoga', 'Recovery', 'Mobility'],
    mapPosition: { x: 78, y: 24 },
  },
  {
    id: 'babylon-aquatics',
    name: 'Babylon Aquatics',
    category: 'Swimming · Family',
    cityId: 'baghdad',
    district: 'Al-Jadriya',
    city: 'Baghdad',
    rating: '4.7',
    reviews: 61,
    distance: '4.6 km',
    gender: 'Family hours',
    openUntil: 'Open until 8 pm',
    description:
      'A well-kept pool for lap swimming, beginner lessons and family-friendly open hours.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 33.2764,
    longitude: 44.3799,
    activities: ['Swimming', 'Family', 'Lessons'],
    mapPosition: { x: 45, y: 76 },
  },
  {
    id: 'citadel-movement',
    name: 'Citadel Movement Club',
    category: 'Strength · Boxing',
    cityId: 'erbil',
    district: 'Ankawa',
    city: 'Erbil',
    rating: '4.9',
    reviews: 83,
    distance: '1.5 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 10 pm',
    description:
      'Small-group strength and boxing classes with clear coaching, flexible session times and a friendly first-visit welcome.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 36.1912,
    longitude: 44.0092,
    activities: ['Strength', 'Boxing', 'Mobility'],
    mapPosition: { x: 32, y: 35 },
  },
  {
    id: 'slemani-yoga-house',
    name: 'Slemani Yoga House',
    category: 'Yoga · Pilates',
    cityId: 'sulaymaniyah',
    district: 'Bakhtiary',
    city: 'Sulaymaniyah',
    rating: '4.8',
    reviews: 67,
    distance: '1.1 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 9 pm',
    description:
      'A calm studio for yoga, Pilates and mindful movement, with classes for new and experienced members.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 35.5578,
    longitude: 45.4351,
    activities: ['Yoga', 'Pilates', 'Mobility'],
    mapPosition: { x: 70, y: 45 },
  },
  {
    id: 'duhok-active',
    name: 'Duhok Active Studio',
    category: 'Strength · Fitness',
    cityId: 'duhok',
    district: 'Duhok Centre',
    city: 'Duhok',
    rating: '4.7',
    reviews: 42,
    distance: '1.8 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 9 pm',
    description:
      'Coach-led training, open gym access and approachable sessions for every starting point.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 36.8615,
    longitude: 42.9875,
    activities: ['Strength', 'Fitness', 'Coaching'],
    mapPosition: { x: 46, y: 27 },
  },
  {
    id: 'tigris-wellness',
    name: 'Tigris Wellness Club',
    category: 'Swimming · Recovery',
    cityId: 'mosul',
    district: 'Al-Majmoua',
    city: 'Mosul',
    rating: '4.8',
    reviews: 52,
    distance: '2.0 km',
    gender: 'Family hours',
    openUntil: 'Open until 8 pm',
    description:
      'Pool sessions, mobility classes and guided recovery in a welcoming local club.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 36.357,
    longitude: 43.142,
    activities: ['Swimming', 'Recovery', 'Family'],
    mapPosition: { x: 59, y: 48 },
  },
  {
    id: 'basra-palm-courts',
    name: 'Palm Courts Basra',
    category: 'Padel · Social sport',
    cityId: 'basra',
    district: 'Al-Ashar',
    city: 'Basra',
    rating: '4.9',
    reviews: 58,
    distance: '1.4 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 11 pm',
    description:
      'Friendly padel sessions and coached court time, with equipment available to borrow.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 30.5085,
    longitude: 47.7804,
    activities: ['Padel', 'Social sport', 'Coaching'],
    mapPosition: { x: 68, y: 62 },
  },
  {
    id: 'anbar-training-yard',
    name: 'Anbar Training Yard',
    category: 'Football · Strength',
    cityId: 'ramadi',
    district: 'Ramadi Centre',
    city: 'Ramadi',
    rating: '4.7',
    reviews: 39,
    distance: '2.3 km',
    gender: 'Men-only sessions',
    openUntil: 'Open until 10 pm',
    description:
      'Team sports, conditioning and practical strength training in a relaxed neighborhood setting.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 33.423,
    longitude: 43.305,
    activities: ['Football', 'Strength', 'Social sport'],
    mapPosition: { x: 38, y: 66 },
  },
  {
    id: 'najaf-strength-club',
    name: 'Najaf Strength Club',
    category: 'Strength · Fitness',
    cityId: 'najaf',
    district: 'Al-Amir',
    city: 'Najaf',
    rating: '4.8',
    reviews: 47,
    distance: '1.7 km',
    gender: 'Women-only hours',
    openUntil: 'Open until 9 pm',
    description:
      'A supportive place to build strength at your own pace, with women-only hours and guided sessions.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 32.0004,
    longitude: 44.3358,
    activities: ['Strength', 'Fitness', 'Coaching'],
    mapPosition: { x: 52, y: 71 },
  },
];

export const sessions: TrainingSession[] = [
  {
    id: 'rise-strength-1',
    facilityId: 'rise-studio',
    title: 'Full-body strength',
    instructor: 'Dina Kareem',
    time: 'Today · 6:30 PM',
    duration: '50 min',
    remaining: 4,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'olive-flow-1',
    facilityId: 'olive-room',
    title: 'Evening unwind yoga',
    instructor: 'Noor Ahmed',
    time: 'Today · 7:15 PM',
    duration: '45 min',
    remaining: 7,
    level: 'Beginner friendly',
    gender: 'Women-only',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'padel-open-1',
    facilityId: 'padel-house',
    title: 'Padel social: open play',
    instructor: 'Omar Saeed',
    time: 'Tomorrow · 5:00 PM',
    duration: '60 min',
    remaining: 2,
    level: 'Intermediate',
    gender: 'Mixed',
    image: require('../assets/images/maydango-padel.jpg'),
  },
  {
    id: 'erbil-strength-1',
    facilityId: 'citadel-movement',
    title: 'Strength, your way',
    instructor: 'Rojin Hassan',
    time: 'Today · 6:00 PM',
    duration: '45 min',
    remaining: 5,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'slemani-flow-1',
    facilityId: 'slemani-yoga-house',
    title: 'Grounded flow',
    instructor: 'Hana Mahmood',
    time: 'Today · 6:45 PM',
    duration: '50 min',
    remaining: 6,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'basra-padel-1',
    facilityId: 'basra-palm-courts',
    title: 'Padel open play',
    instructor: 'Mustafa Nouri',
    time: 'Tomorrow · 5:30 PM',
    duration: '60 min',
    remaining: 3,
    level: 'Beginner friendly',
    gender: 'Mixed',
    image: require('../assets/images/maydango-padel.jpg'),
  },
  {
    id: 'mosul-mobility-1',
    facilityId: 'tigris-wellness',
    title: 'Everyday mobility',
    instructor: 'Layla Abdulrahman',
    time: 'Tomorrow · 7:00 PM',
    duration: '40 min',
    remaining: 8,
    level: 'Beginner friendly',
    gender: 'Family',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'online-mobility-1',
    mode: 'online',
    title: 'Mobility from home',
    instructor: 'Noor Ahmed',
    time: 'Today · 8:00 PM',
    duration: '30 min',
    remaining: 18,
    level: 'All levels',
    gender: 'Open to all',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'online-strength-1',
    mode: 'online',
    title: 'Strong at home',
    instructor: 'Rojin Hassan',
    time: 'Tomorrow · 6:30 PM',
    duration: '35 min',
    remaining: 12,
    level: 'Beginner friendly',
    gender: 'Open to all',
    image: require('../assets/images/maydango-strength.jpg'),
  },
];

export const coaches: Coach[] = [
  {
    id: 'coach-noor',
    name: 'Noor Ahmed',
    specialty: 'Mobility · yoga · getting started',
    languages: 'Arabic · English',
    availability: 'Today · 7:00 PM',
    image: require('../assets/images/maydango-yoga.jpg'),
    slots: [
      { id: 'noor-tue-19', label: { en: 'Tue · 7:00 PM · 30 min', ar: 'الثلاثاء · ٧:٠٠ مساءً · ٣٠ دقيقة', ku: 'سێشەممە · ٧:٠٠ ئێوارە · ٣٠ خولەک' } },
      { id: 'noor-thu-18', label: { en: 'Thu · 6:00 PM · 30 min', ar: 'الخميس · ٦:٠٠ مساءً · ٣٠ دقيقة', ku: 'پێنجشەممە · ٦:٠٠ ئێوارە · ٣٠ خولەک' } },
    ],
  },
  {
    id: 'coach-rojin',
    name: 'Rojin Hassan',
    specialty: 'Strength · movement confidence',
    languages: 'Kurdish · Arabic · English',
    availability: 'Tomorrow · 11:00 AM',
    image: require('../assets/images/maydango-strength.jpg'),
    slots: [
      { id: 'rojin-wed-11', label: { en: 'Wed · 11:00 AM · 45 min', ar: 'الأربعاء · ١١:٠٠ صباحاً · ٤٥ دقيقة', ku: 'چوارشەممە · ١١:٠٠ بەیانی · ٤٥ خولەک' } },
      { id: 'rojin-sat-17', label: { en: 'Sat · 5:00 PM · 45 min', ar: 'السبت · ٥:٠٠ مساءً · ٤٥ دقيقة', ku: 'شەممە · ٥:٠٠ ئێوارە · ٤٥ خولەک' } },
      { id: 'rojin-sun-10', label: { en: 'Sun · 10:00 AM · 45 min', ar: 'الأحد · ١٠:٠٠ صباحاً · ٤٥ دقيقة', ku: 'یەکشەممە · ١٠:٠٠ بەیانی · ٤٥ خولەک' } },
    ],
  },
  {
    id: 'coach-omar',
    name: 'Omar Saeed',
    specialty: 'Fitness · padel conditioning',
    languages: 'Arabic · Kurdish',
    availability: 'Tomorrow · 6:30 PM',
    image: require('../assets/images/maydango-padel.jpg'),
    slots: [
      { id: 'omar-mon-1830', label: { en: 'Mon · 6:30 PM · 40 min', ar: 'الاثنين · ٦:٣٠ مساءً · ٤٠ دقيقة', ku: 'دووشەممە · ٦:٣٠ ئێوارە · ٤٠ خولەک' } },
      { id: 'omar-fri-16', label: { en: 'Fri · 4:00 PM · 40 min', ar: 'الجمعة · ٤:٠٠ مساءً · ٤٠ دقيقة', ku: 'هەینی · ٤:٠٠ ئێوارە · ٤٠ خولەک' } },
    ],
  },
];

export const courses: Course[] = [
  {
    id: 'move-at-home',
    title: 'Move well at home',
    localTitle: { en: 'Move well at home', ar: 'تحرّك جيداً في المنزل', ku: 'لە ماڵەوە باش بجوڵێ' },
    summary: {
      en: 'Gentle, practical movement for small spaces. No equipment needed, and every lesson can be done in everyday clothes.',
      ar: 'حركة لطيفة وعملية تناسب المساحات الصغيرة. لا تحتاج إلى معدات، ويمكن أداء كل درس بملابسك اليومية.',
      ku: 'جووڵەی نەرم و کرداری بۆ شوێنی بچووک. پێویستت بە ئامێر نییە و هەموو وانەیەک بە جلی ڕۆژانە دەکرێت.',
    },
    instructor: 'Noor Ahmed',
    duration: '48 min',
    level: 'Beginner',
    image: require('../assets/images/maydango-yoga.jpg'),
    sampleLessons: [
      {
        id: 'mah-1', minutes: 10,
        title: { en: 'Wake up the spine', ar: 'إيقاظ العمود الفقري', ku: 'بەئاگاهێنانەوەی بڕبڕەی پشت' },
        body: {
          en: 'Sit tall on a chair or cushion. Slowly round your back as you breathe out, then lengthen as you breathe in. Repeat eight times, then add gentle side bends. Move only within a comfortable range.',
          ar: 'اجلس مستقيماً على كرسي أو وسادة. قوّس ظهرك ببطء مع الزفير، ثم امدده مع الشهيق. كرّر ثماني مرات، ثم أضف انحناءات جانبية لطيفة. تحرّك ضمن المدى المريح لك فقط.',
          ku: 'بە ڕاستی لەسەر کورسی یان سەرین دابنیشە. لە کاتی هەناسەدانەوەدا پشتت هێواش بچەمێنەوە، و لە کاتی هەناسەکێشاندا درێژی بکەرەوە. هەشت جار دووبارەی بکەرەوە، پاشان چەمانەوەی نەرمی لاتەنیشت زیاد بکە. تەنها لە مەودای ئاسوودەدا بجوڵێ.',
        },
      },
      {
        id: 'mah-2', minutes: 12,
        title: { en: 'Hips and knees, kindly', ar: 'الوركان والركبتان برفق', ku: 'سمت و ئەژنۆ، بە نەرمی' },
        body: {
          en: 'Stand holding a wall or chair back. Do ten slow sit-to-stand movements from a chair, then ten small leg circles on each side. Rest whenever you need to.',
          ar: 'قف مستنداً إلى جدار أو ظهر كرسي. أدِّ عشر حركات بطيئة من الجلوس إلى الوقوف، ثم عشر دوائر صغيرة بكل ساق. استرح متى احتجت.',
          ku: 'بوەستە و دەست بە دیوار یان پشتی کورسییەوە بگرە. دە جار بە هێواشی لە کورسی هەستە و دابنیشە، پاشان دە بازنەی بچووک بە هەر قاچێک. هەر کاتێک پێویست بوو پشوو بدە.',
        },
      },
      {
        id: 'mah-3', minutes: 14,
        title: { en: 'Shoulders after screen time', ar: 'الكتفان بعد وقت الشاشات', ku: 'شانەکان دوای کاتی شاشە' },
        body: {
          en: 'Roll your shoulders back ten times. Clasp your hands behind you, or hold a scarf if that is easier, and open the chest for five breaths. Finish with slow neck turns.',
          ar: 'دوّر كتفيك للخلف عشر مرات. اشبك يديك خلفك، أو أمسك وشاحاً إن كان أسهل، وافتح صدرك لخمسة أنفاس. اختم بالتفاتات بطيئة للرقبة.',
          ku: 'دە جار شانەکانت بەرەو دواوە بسووڕێنە. دەستەکانت لە پشتەوە بەیەکەوە ببەستە، یان ئەگەر ئاسانترە لەچکێک بگرە، و بۆ پێنج هەناسە سنگت بکەرەوە. بە سووڕاندنی هێواشی مل کۆتایی پێبهێنە.',
        },
      },
      {
        id: 'mah-4', minutes: 12,
        title: { en: 'A calm ten-minute reset', ar: 'استراحة هادئة لعشر دقائق', ku: 'دە خولەکی ئارامبوونەوە' },
        body: {
          en: 'Lie down or sit comfortably. Breathe in for four counts and out for six. Let each part of the body soften, from the feet to the face. This lesson suits the end of a long day.',
          ar: 'استلقِ أو اجلس بارتياح. تنفّس بعدّ أربعة وازفر بعدّ ستة. دع كل جزء من جسمك يسترخي، من القدمين حتى الوجه. هذا الدرس مناسب لنهاية يوم طويل.',
          ku: 'ڕاکشێ یان بە ئاسوودەیی دابنیشە. بە ژماردنی چوار هەناسە بکێشە و بە شەش بیدەرەوە. لێگەڕێ هەموو بەشێکی لەشت نەرم بێتەوە، لە پێیەکانەوە تا ڕوخسار. ئەم وانەیە بۆ کۆتایی ڕۆژێکی درێژ گونجاوە.',
        },
      },
    ],
  },
  {
    id: 'strong-foundations',
    title: 'Strong foundations',
    localTitle: { en: 'Strong foundations', ar: 'أساسات قوية', ku: 'بناغەی بەهێز' },
    summary: {
      en: 'Bodyweight strength basics with clear form cues. Built for beginners who want confidence before joining a class.',
      ar: 'أساسيات القوة بوزن الجسم مع إرشادات واضحة للأداء. مصممة للمبتدئين الذين يريدون الثقة قبل الانضمام إلى حصة.',
      ku: 'بنەماکانی هێز بە کێشی لەش لەگەڵ ڕێنمایی ڕوون. بۆ تازەکاران کە دەیانەوێت پێش بەشداریکردن لە وانەیەک متمانەیان هەبێت.',
    },
    instructor: 'Dina Kareem',
    duration: '55 min',
    level: 'All levels',
    image: require('../assets/images/maydango-strength.jpg'),
    sampleLessons: [
      {
        id: 'sf-1', minutes: 13,
        title: { en: 'The supported squat', ar: 'القرفصاء المدعومة', ku: 'چەمینەوەی پشتگیریکراو' },
        body: {
          en: 'Stand in front of a chair, feet hip-width apart. Sit back until you lightly touch the seat, then stand. Keep your chest open and knees following your toes. Three rounds of eight.',
          ar: 'قف أمام كرسي وقدماك بعرض الوركين. اجلس للخلف حتى تلمس المقعد بخفة، ثم قف. حافظ على صدر منفتح وركبتين باتجاه أصابع القدمين. ثلاث جولات من ثماني مرات.',
          ku: 'لە بەردەم کورسییەک بوەستە، پێیەکانت بە پانی سمت. بەرەو دواوە دابنیشە تا بە سووکی دەگەیتە کورسییەکە، پاشان هەستە. سنگت کراوە بێت و ئەژنۆکانت بەدوای پەنجەی پێدا بڕۆن. سێ خول، هەر خولێک هەشت جار.',
        },
      },
      {
        id: 'sf-2', minutes: 14,
        title: { en: 'Wall push-ups', ar: 'تمرين الضغط على الجدار', ku: 'پاڵنانی دیوار' },
        body: {
          en: 'Place your hands on a wall at shoulder height. Step back, keep a straight line from head to heels, and bend your elbows slowly. When this feels easy, move to a table edge.',
          ar: 'ضع يديك على الجدار بمستوى الكتفين. تراجع خطوة، وحافظ على خط مستقيم من الرأس إلى الكعبين، واثنِ مرفقيك ببطء. عندما يصبح سهلاً، انتقل إلى حافة طاولة.',
          ku: 'دەستەکانت بە بەرزی شان لەسەر دیوار دابنێ. هەنگاوێک بگەڕێوە، هێڵێکی ڕاست لە سەرەوە تا پاژنە ڕابگرە، و بە هێواشی ئانیشکەکانت بچەمێنەوە. کاتێک ئاسان بوو، بڕۆ بۆ لێواری مێزێک.',
        },
      },
      {
        id: 'sf-3', minutes: 14,
        title: { en: 'Core without crunches', ar: 'تقوية الجذع بلا تمارين البطن التقليدية', ku: 'ناوەڕاستی لەش بەبێ کرەنچ' },
        body: {
          en: 'Lie on your back with knees bent. Breathe out and gently press your lower back into the floor, then slowly extend one leg at a time. Six on each side, twice through.',
          ar: 'استلقِ على ظهرك مع ثني الركبتين. ازفر واضغط أسفل ظهرك برفق نحو الأرض، ثم مدّ ساقاً واحدة في كل مرة ببطء. ست مرات لكل جانب، مرتين.',
          ku: 'لەسەر پشت ڕاکشێ و ئەژنۆکانت بچەمێنەوە. هەناسە بدەرەوە و بە نەرمی خوارەوەی پشتت بە زەویدا بنێ، پاشان هەر جارە قاچێک بە هێواشی درێژ بکەرەوە. شەش جار بۆ هەر لایەک، دوو خول.',
        },
      },
      {
        id: 'sf-4', minutes: 14,
        title: { en: 'Your first full circuit', ar: 'دورتك الكاملة الأولى', ku: 'یەکەم خولی تەواوت' },
        body: {
    en: 'Combine the last three lessons: eight squats, eight wall push-ups, six leg extensions per side. Rest one minute and repeat up to three times. Stop right away if anything feels sharp or painful.',
    ar: 'اجمع الدروس الثلاثة السابقة: ثماني قرفصاءات، ثماني ضغطات على الجدار، ست مدّات للساق لكل جانب. استرح دقيقة وكرّر حتى ثلاث مرات. أوقف التمرين فوراً إذا شعرت بألم حاد.',
    ku: 'سێ وانەی پێشوو تێکەڵ بکە: هەشت چەمینەوە، هەشت پاڵنانی دیوار، شەش درێژکردنەوەی قاچ بۆ هەر لایەک. یەک خولەک پشوو بدە و تا سێ جار دووبارەی بکەرەوە. ئەگەر ئازارێکی تیژت هەست پێکرد، دەستبەجێ ڕابوەستە.',
        },
      },
    ],
  },
];

export const categories = [
  'All',
  'Strength',
  'Yoga',
  'Padel',
  'Swimming',
  'Pilates',
  'Wellness',
];
