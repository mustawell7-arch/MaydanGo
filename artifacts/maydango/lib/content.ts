import type { Language } from './i18n';
import { interfaceCopy } from './interface-copy';
import { liveCopy } from './live-copy';
import { checkinCopy } from './checkin-copy';

// English source phrases are stable keys for the sample catalog. IDs and API values
// are never translated. Sorani (ckb), not Latin-script Kurmanji, is used for ku.
export const content: Record<string, readonly [string, string]> = {
  ...interfaceCopy,
  ...liveCopy,
  ...checkinCopy,
  'A bright, coach-led studio for strength, reformer Pilates and mindful movement. New members are welcome at every level.': ['استوديو مشرق بإشراف مدربين لتمارين القوة والبيلاتس بالأجهزة والحركة الواعية. نرحّب بالأعضاء الجدد من جميع المستويات.', 'ستۆدیۆیەکی ڕووناک بە سەرپەرشتی ڕاهێنەر بۆ هێز، پیلاتس بە ئامێر و جووڵەی ئاگادارانە. ئەندامانی نوێ لە هەموو ئاستێک بەخێرهاتنن.'],
  'Two panoramic courts, racket hire and welcoming group games for first-timers and experienced players.': ['ملعبان بإطلالة مفتوحة، وتأجير مضارب وألعاب جماعية ترحّب بالمبتدئين واللاعبين ذوي الخبرة.', 'دوو یاریگای کراوە، بەکرێگرتنی ڕاکێت و یاریی کۆمەڵایەتی بۆ تازەکاران و یاریزانە شارەزاکان.'],
  'Slow yoga, mobility and thoughtful recovery sessions in a calm neighborhood space.': ['يوغا هادئة وتمارين مرونة وحصص استشفاء مدروسة في مكان هادئ ضمن الحي.', 'یۆگای هێواش، نەرمونیانی و وانەی چاکبوونەوە لە شوێنێکی ئارامی گەڕەک.'],
  'A well-kept pool for lap swimming, beginner lessons and family-friendly open hours.': ['مسبح معتنى به للسباحة ودروس المبتدئين، مع أوقات مفتوحة مناسبة للعائلات.', 'مەڵەوانگەیەکی پاک بۆ مەلەکردن و وانەی تازەکاران، لەگەڵ کاتی گونجاو بۆ خێزانەکان.'],
  'Small-group strength and boxing classes with clear coaching, flexible session times and a friendly first-visit welcome.': ['حصص قوة وملاكمة لمجموعات صغيرة، مع إرشادات واضحة وأوقات مرنة وترحيب بالزيارة الأولى.', 'وانەی هێز و بۆکس بۆ گرووپی بچووک بە ڕێنمایی ڕوون، کاتی گونجاو و پێشوازییەکی گەرم بۆ یەکەم سەردان.'],
  'A calm studio for yoga, Pilates and mindful movement, with classes for new and experienced members.': ['استوديو هادئ لليوغا والبيلاتس والحركة الواعية، بحصص للأعضاء الجدد وذوي الخبرة.', 'ستۆدیۆیەکی ئارام بۆ یۆگا، پیلاتس و جووڵەی ئاگادارانە، بە وانە بۆ ئەندامانی نوێ و شارەزا.'],
  'Coach-led training, open gym access and approachable sessions for every starting point.': ['تدريب بإشراف مدربين واستخدام مفتوح للصالة وحصص مناسبة لكل نقطة بداية.', 'ڕاهێنان بە سەرپەرشتی ڕاهێنەر، بەکارهێنانی هۆڵ و وانەی گونجاو بۆ هەموو ئاستێکی دەستپێک.'],
  'Pool sessions, mobility classes and guided recovery in a welcoming local club.': ['حصص سباحة ومرونة واستشفاء بإشراف متخصصين في نادٍ محلي يرحّب بالجميع.', 'وانەی مەلەوانی، نەرمونیانی و چاکبوونەوە بە ڕێنمایی لە یانەیەکی ناوخۆیی پێشوازیکەر.'],
  'Friendly padel sessions and coached court time, with equipment available to borrow.': ['حصص بادل ودّية وتدريب في الملعب، مع إمكانية استعارة المعدات.', 'وانەی دۆستانەی پادڵ و ڕاهێنان لە یاریگا، لەگەڵ کەرەستەی بەردەست بۆ خواستن.'],
  'Team sports, conditioning and practical strength training in a relaxed neighborhood setting.': ['رياضات جماعية وتمارين لياقة وقوة عملية في أجواء مريحة ضمن الحي.', 'وەرزشی تیمی، ئامادەکاریی جەستەیی و ڕاهێنانی هێز لە کەشێکی ئاسوودەی گەڕەک.'],
  'A supportive place to build strength at your own pace, with women-only hours and guided sessions.': ['مكان داعم لبناء القوة بوتيرتك، مع ساعات مخصصة للنساء وحصص بإشراف مدربين.', 'شوێنێکی پشتگیر بۆ بەهێزبوون بە خێرایی خۆت، بە کاتی تایبەت بە ژنان و وانە بە ڕێنمایی.'],
  'A relaxed day of beginner-friendly movement, games and time together.': ['يوم مريح من الحركة المناسبة للمبتدئين والألعاب وقضاء الوقت معاً.', 'ڕۆژێکی ئاسوودە لە جووڵەی گونجاو بۆ تازەکاران، یاری و بەیەکەوەبوون.'],
  'Easy outdoor movement, community activities and a welcoming space to take part at your own pace.': ['حركة خفيفة في الهواء الطلق وأنشطة مجتمعية ومساحة ترحّب بمشاركتك بوتيرتك.', 'جووڵەی ئاسان لە دەرەوە، چالاکیی کۆمەڵایەتی و شوێنێکی پێشوازیکەر بۆ بەشداری بە خێرایی خۆت.'],
  'Try short, friendly games and meet local clubs in a no-pressure community setting.': ['جرّب ألعاباً قصيرة وودّية وتعرّف على الأندية المحلية في أجواء مجتمعية بلا ضغط.', 'یاریی کورت و دۆستانە تاقی بکەرەوە و یانە ناوخۆییەکان بناسە لە کەشێکی کۆمەڵایەتی بەبێ فشار.'],
  'Move with expert guidance in a welcoming group. Arrive a few minutes early and tell the instructor if you are new.': ['تحرّك بإرشاد متخصص ضمن مجموعة ترحّب بك. احضر قبل الموعد بدقائق وأخبر المدرب إن كانت هذه تجربتك الأولى.', 'بە ڕێنمایی شارەزا لە گرووپێکی پێشوازیکەر بجوڵێ. چەند خولەکێک زووتر بگە و ئەگەر تازەکاری بە ڕاهێنەر بڵێ.'],
  'Rise Movement Studio': ['استوديو رايز للحركة', 'ستۆدیۆی جووڵەی ڕایز'],
  'Padel House Baghdad': ['بيت البادل بغداد', 'ماڵی پادڵی بەغدا'],
  'The Olive Room': ['غرفة الزيتون', 'ژووری زەیتوون'],
  'Babylon Aquatics': ['بابل للسباحة', 'مەڵەوانی بابل'],
  'Citadel Movement Club': ['نادي القلعة للحركة', 'یانەی جووڵەی قەڵا'],
  'Slemani Yoga House': ['بيت اليوغا السليمانية', 'ماڵی یۆگای سلێمانی'],
  'Duhok Active Studio': ['استوديو دهوك أكتيف', 'ستۆدیۆی چالاکی دهۆک'],
  'Tigris Wellness Club': ['نادي دجلة للعافية', 'یانەی تەندروستی دیجلە'],
  'Palm Courts Basra': ['ملاعب النخيل البصرة', 'یاریگاکانی خورمای بەسرە'],
  'Anbar Training Yard': ['ساحة الأنبار للتدريب', 'گۆڕەپانی ڕاهێنانی ئەنبار'],
  'Najaf Strength Club': ['نادي النجف للقوة', 'یانەی هێزی نەجەف'],
  'Al-Mansour': ['المنصور', 'مەنسوور'], Karrada: ['الكرادة', 'کەڕادە'], Zayouna: ['زيونة', 'زەیوونە'],
  'Al-Jadriya': ['الجادرية', 'جادریە'], Ankawa: ['عنكاوا', 'عەنکاوە'], Bakhtiary: ['بختياري', 'بەختیاری'],
  'Duhok Centre': ['مركز دهوك', 'ناوەندی دهۆک'], 'Al-Majmoua': ['المجموعة', 'مەجمووعە'],
  'Al-Ashar': ['العشار', 'عەشار'], 'Ramadi Centre': ['مركز الرمادي', 'ناوەندی ڕەمادی'], 'Al-Amir': ['الأمير', 'ئەمیر'],
  Baghdad: ['بغداد', 'بەغدا'], Basra: ['البصرة', 'بەسرە'], Najaf: ['النجف', 'نەجەف'], Mosul: ['الموصل', 'مووسڵ'],
  Erbil: ['أربيل', 'هەولێر'], Sulaymaniyah: ['السليمانية', 'سلێمانی'], Duhok: ['دهوك', 'دهۆک'], Ramadi: ['الرمادي', 'ڕەمادی'],
  Nationwide: ['كل العراق', 'هەموو عێراق'], 'Central Iraq': ['وسط العراق', 'ناوەندی عێراق'],
  'Southern Iraq': ['جنوب العراق', 'باشووری عێراق'], 'Central & South': ['الوسط والجنوب', 'ناوەڕاست و باشوور'],
  'Northern Iraq': ['شمال العراق', 'باکووری عێراق'], 'Kurdistan Region': ['إقليم كردستان', 'هەرێمی کوردستان'], 'Western Iraq': ['غرب العراق', 'ڕۆژئاوای عێراق'],
  Strength: ['القوة', 'هێز'], Pilates: ['بيلاتس', 'پیلاتس'], Mobility: ['المرونة الحركية', 'نەرمونیانی'],
  Padel: ['بادل', 'پادڵ'], 'Racket sports': ['رياضات المضرب', 'وەرزشی ڕاکێت'], 'Social sport': ['رياضة جماعية', 'وەرزشی کۆمەڵایەتی'],
  Coaching: ['تدريب', 'ڕاهێنان'], Yoga: ['يوغا', 'یۆگا'], Recovery: ['استشفاء', 'چاکبوونەوە'], Swimming: ['سباحة', 'مەلەوانی'],
  Family: ['عائلات', 'خێزان'], Lessons: ['دروس', 'وانەکان'], Boxing: ['ملاكمة', 'بۆکس'], Fitness: ['لياقة', 'لەشجوانی'], Football: ['كرة القدم', 'تۆپی پێ'],
  Wellness: ['عافية', 'تەندروستی'], All: ['الكل', 'هەموو'],
  'Women-only hours': ['ساعات للنساء فقط', 'کاتی تایبەت بە ژنان'], 'Women-only sessions': ['حصص للنساء فقط', 'وانەی تایبەت بە ژنان'],
  'Men-only sessions': ['حصص للرجال فقط', 'وانەی تایبەت بە پیاوان'], 'Mixed sessions': ['حصص مختلطة', 'وانەی تێکەڵ'],
  'Family hours': ['ساعات للعائلات', 'کاتی خێزانەکان'], 'Women-only': ['للنساء فقط', 'تایبەت بە ژنان'],
  Mixed: ['مختلط', 'تێکەڵ'], 'Open to all': ['متاح للجميع', 'کراوە بۆ هەمووان'],
  'All levels': ['جميع المستويات', 'هەموو ئاستەکان'], 'Beginner friendly': ['مناسب للمبتدئين', 'گونجاو بۆ تازەکاران'],
  Beginner: ['مبتدئ', 'تازەکار'], Intermediate: ['متوسط', 'ناوەند'],
  'All ages · all levels': ['كل الأعمار · كل المستويات', 'هەموو تەمەنەکان · هەموو ئاستەکان'], 'Families welcome': ['نرحّب بالعائلات', 'خێزانەکان بەخێرهاتنن'],
  'Full-body strength': ['قوة الجسم بالكامل', 'هێزی هەموو لەش'], 'Evening unwind yoga': ['يوغا للاسترخاء مساءً', 'یۆگای ئارامبوونەوەی ئێوارە'],
  'Padel social: open play': ['بادل جماعي: لعب مفتوح', 'پادڵی کۆمەڵایەتی: یاریی کراوە'], 'Strength, your way': ['القوة على طريقتك', 'هێز بە شێوازی خۆت'],
  'Grounded flow': ['حركة متوازنة', 'جووڵەی هاوسەنگ'], 'Padel open play': ['لعب بادل مفتوح', 'یاریی کراوەی پادڵ'],
  'Everyday mobility': ['مرونة للحياة اليومية', 'نەرمونیانی ڕۆژانە'], 'Mobility from home': ['المرونة من المنزل', 'نەرمونیانی لە ماڵەوە'],
  'Strong at home': ['قوة في المنزل', 'بەهێز لە ماڵەوە'],
  'Move Together Weekend': ['عطلة نتحرّك فيها معاً', 'کۆتایی هەفتەی جووڵەی پێکەوە'], 'Basra Wellness by the River': ['عافية البصرة على النهر', 'تەندروستی بەسرە لە کەناری ڕووبار'],
  'Baghdad Community Games': ['ألعاب بغداد المجتمعية', 'یارییە کۆمەڵایەتییەکانی بەغدا'],
  'Erbil community sports park': ['متنزه أربيل الرياضي المجتمعي', 'پارکی وەرزشی کۆمەڵایەتی هەولێر'],
  'Ashar riverside event area': ['منطقة الفعاليات على ضفاف نهر العشار', 'ناوچەی بۆنەکانی کەناری ڕووباری عەشار'],
  'Al-Mansour sports grounds': ['ملاعب المنصور الرياضية', 'یاریگا وەرزشییەکانی مەنسوور'],
  'Mobility · yoga · getting started': ['المرونة · اليوغا · البداية', 'نەرمونیانی · یۆگا · دەستپێکردن'],
  'Strength · movement confidence': ['القوة · الثقة بالحركة', 'هێز · متمانە بە جووڵە'],
  'Fitness · padel conditioning': ['اللياقة · الإعداد البدني للبادل', 'لەشجوانی · ئامادەکاریی جەستەیی پادڵ'],
  'Dina Kareem': ['دينا كريم', 'دینا کەریم'], 'Noor Ahmed': ['نور أحمد', 'نوور ئەحمەد'], 'Omar Saeed': ['عمر سعيد', 'عومەر سەعید'],
  'Rojin Hassan': ['روجين حسن', 'ڕۆژین حەسەن'], 'Hana Mahmood': ['هناء محمود', 'هەنا مەحموود'],
  'Mustafa Nouri': ['مصطفى نوري', 'مستەفا نووری'], 'Layla Abdulrahman': ['ليلى عبد الرحمن', 'لەیلا عەبدولڕەحمان'],
  Arabic: ['العربية', 'عەرەبی'], Kurdish: ['الكردية', 'کوردی'], English: ['الإنجليزية', 'ئینگلیزی'],
  Today: ['اليوم', 'ئەمڕۆ'], Tomorrow: ['غداً', 'سبەی'], Saturday: ['السبت', 'شەممە'], Friday: ['الجمعة', 'هەینی'], Thursday: ['الخميس', 'پێنجشەممە'],
  'Open until': ['مفتوح حتى', 'کراوەیە تا'], pm: ['مساءً', 'ئێوارە'], PM: ['مساءً', 'ئێوارە'], AM: ['صباحاً', 'بەیانی'],
  min: ['دقيقة', 'خولەک'], km: ['كم', 'کم'], reviews: ['تقييمات', 'هەڵسەنگاندن'], sessions: ['حصص', 'وانە'],
};

export const locale = (language: Language) => language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ';
export const number = (value: number, language: Language) => new Intl.NumberFormat(locale(language)).format(value);
export const currency = (value: number, language: Language) => new Intl.NumberFormat(locale(language), { style: 'currency', currency: 'IQD', maximumFractionDigits: 0 }).format(value);
export const dateTime = (value: string, language: Language, dateOnly = false) => new Intl.DateTimeFormat(locale(language), {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: 'short', day: 'numeric',
  ...(dateOnly ? {} : { hour: 'numeric' as const, minute: '2-digit' as const }),
}).format(new Date(value));

/** Only display registered errors, never arbitrary provider diagnostics or URLs. */
export function errorCopy(error: unknown): string {
  const e = error as { code?: string; message?: string; data?: { message?: string }; errors?: { code?: string }[] } | null;
  const code = e?.errors?.[0]?.code ?? e?.code;
  const codes: Record<string, string> = {
    form_password_incorrect: 'Check your email address and password.',
    form_identifier_not_found: 'Check your email address and password.',
    form_identifier_exists: 'This email address is already registered. Sign in instead.',
    form_code_incorrect: 'The verification code is incorrect or expired. Request a new code.',
    verification_expired: 'The verification code is incorrect or expired. Request a new code.',
    form_password_pwned: 'Choose a stronger password that has not been exposed in a data breach.',
    form_password_length_too_short: 'Choose a stronger password that has not been exposed in a data breach.',
    too_many_requests: 'Too many attempts. Please try again later.',
  };
  if (code && codes[code]) return codes[code];
  const message = e?.data?.message ?? e?.message;
  if (message && content[message]) return message;
  if (error instanceof TypeError) return 'Check your connection and try again.';
  return 'Account request failed. Please check your details and try again.';
}

// Replace registered phrases only, with word boundaries and longest-match first.
// Never pass user input, email addresses, IDs, or provider diagnostics here.
export function localize(value: string, language: Language): string {
  if (language === 'en') return englishStyle(value);
  const index = language === 'ar' ? 0 : 1;
  return value.replace(pattern, key => content[key][index]);
}
function englishStyle(value: string): string {
  return value
    .replace(/\bMaydanGo\b/g, 'MaydanGO')
    .replace(/\bCancelled\b/g, 'Canceled')
    .replace(/\bcancelled\b/g, 'canceled')
    .replace(/\bEnrol\b/g, 'Enroll')
    .replace(/\benrol\b/g, 'enroll')
    .replace(/\borganiser\b/gi, match => match[0] === match[0].toUpperCase() ? 'Organizer' : 'organizer')
    .replace(/\bcentre\b/gi, match => match[0] === match[0].toUpperCase() ? 'Center' : 'center')
    .replace(/\bracket hire\b/gi, 'racket rental')
    .replace(/Go to home screen!/g, 'Back to home');
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let pattern: RegExp;
export function rebuildContentPattern() {
  pattern = new RegExp(`(?<![A-Za-z])(?:${Object.keys(content).sort((a, b) => b.length - a.length).map(escape).join('|')})(?![A-Za-z])`, 'g');
}
rebuildContentPattern();
