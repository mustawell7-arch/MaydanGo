import { Link } from 'wouter';
import { Mail, ShieldCheck } from 'lucide-react';
import { useGetPublicLegalPolicies } from '@workspace/api-client-react';

type Language = 'en' | 'ar' | 'ku';
type Section = { id: string; title: string; paragraphs: string[] };

const privacyCopy: Record<Language, {
  title: string;
  intro: string;
  draft: string;
  sections: Section[];
  contactTitle: string;
  contactBody: string;
  contactEmailLabel: string;
  accountRequestsLabel: string;
  back: string;
}> = {
  en: {
    title: 'Privacy information',
    intro: 'A plain-language overview of how MaydanGo handles information across its public website and member services.',
    draft: 'Working draft for review — not legal advice or a final approved policy. MaydanGo is used here as the service name. No street address is included. Arabic and Sorani translations also need local-speaker review.',
    sections: [
      {
        id: 'information',
        title: 'Information MaydanGo handles',
        paragraphs: [
          'Depending on the features you use, this may include account name and email, basic profile and eligibility details, membership status, reservations, waitlist activity, check-ins, attendance, course enrolment and progress, and support or safety reports you choose to submit. For enrolled courses, progress includes lessons you open and the last saved playback position, so you can resume later.',
          'The mobile app may use your device location when you start a location-based check-in. It is used to support that check-in, not to continuously follow your movements.',
          'When you use a feature that needs a device notification, the app may store a device token and notification settings so it can deliver relevant service messages.',
        ],
      },
      {
        id: 'use',
        title: 'How information is used',
        paragraphs: [
          'MaydanGo uses this information to sign you in, show the services available to your account, manage bookings and waitlists, confirm attendance, provide courses and online sessions, respond to support or safety reports, and protect the service from misuse.',
          'Information is not used to promise a place, membership access, health outcome, or service availability that has not been confirmed in the app or by the relevant provider.',
        ],
      },
      {
        id: 'sharing',
        title: 'Who may receive information',
        paragraphs: [
          'MaydanGo staff with authorized access may use information to operate the service and respond to requests. A facility partner may see the booking and attendance details needed to host a session and confirm a visit. Instructors are limited to the courses or sessions assigned to them.',
          'Company administrators can manage employee enrollment. They are not given members’ individual activity or personal finance records through the company workspace.',
          'Clerk provides sign-in and account authentication. Replit provides the application hosting and infrastructure used to run MaydanGo, including the configured database and file storage. No additional external data provider has been identified for this draft. Any payment provider and its data use will be described before payment features are enabled.',
        ],
      },
      {
        id: 'contact-forms',
        title: 'Website enquiries and payments',
        paragraphs: [
          'The public website enquiry form prepares an email draft in your email application. The website does not send or store that draft. If you choose to send the email, your email provider handles its delivery.',
          'The public website does not currently accept membership payments or card details. Do not send payment-card details by email. Payment-related information will be explained before any payment feature is made available.',
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies, browser storage, and analytics',
        paragraphs: [
          'Sign-in and security features may use essential browser storage. The privacy-choice control stores your analytics preference in this browser so it can be remembered on later visits.',
          'Optional analytics are off unless you choose to allow them. The public website does not currently load a third-party analytics tracker. If analytics are enabled later, the choice control and this notice must be updated before that change.',
        ],
      },
      {
        id: 'children',
        title: 'Age and guardian consent',
        paragraphs: [
          'The minimum age rule is 18. A person under 18 may participate only with guardian consent. The partner checks the consent at the venue and uploads a photographed copy through a private MaydanGo partner portal. Only Super Admin staff can open the copy; partners cannot download it.',
          'The copy is scheduled for automatic deletion 90 days after the visit. Do not send guardian-consent copies, identity documents, or sensitive guardian details through the general website enquiry form.',
        ],
      },
      {
        id: 'financial-retention',
        title: 'Financial and tax records',
        paragraphs: [
          'MaydanGo currently plans to retain invoices, tax details, and invoice-correction records for at least 10 years. This is a product decision, not a confirmed Iraqi legal requirement, and must be checked with qualified local legal and accounting advisers.',
          'Financial records are not automatically deleted when the 10-year period ends. Access remains limited to authorized finance staff, and any later deletion must follow the approved local retention rules.',
        ],
      },
      {
        id: 'rights',
        title: 'Your privacy requests',
        paragraphs: [
          'If you have an account, use Account → Privacy requests to request a copy of your information or an account-deletion review. Authorized support staff verify your identity before approving a data copy. After approval, only the signed-in account holder can download it, for 24 hours. The export excludes payment instrument details, login credentials, device tokens, private class links, support messages, and staff-only notes.',
          'Account-deletion requests are reviewed by authorized support staff and are not immediate. MaydanGo may need to verify that a request relates to your account before acting. Some records may need to be retained for service safety, security, or other applicable requirements.',
        ],
      },
      {
        id: 'security',
        title: 'Keeping information safe',
        paragraphs: [
          'MaydanGo uses account permissions and role-based access to limit who can view or manage operational information. Do not share your password or send sensitive identity details through a general enquiry.',
          'No online service can promise that every transmission or system will be risk-free. Contact MaydanGo promptly if you believe your account or information has been accessed improperly.',
        ],
      },
      {
        id: 'changes',
        title: 'Changes to this information',
        paragraphs: [
          'This notice will be updated when MaydanGo changes how information is handled. This is still a working draft and must be reviewed before it is published as a formal privacy policy.',
        ],
      },
    ],
    contactTitle: 'Privacy questions or requests',
    contactBody: 'Use this email for privacy questions or requests. Please do not include passwords, payment-card details, or identity documents.',
    contactEmailLabel: 'Email MaydanGo about privacy',
    accountRequestsLabel: 'Open account privacy requests',
    back: 'Back to legal information',
  },
  ar: {
    title: 'معلومات الخصوصية',
    intro: 'شرح مبسط لكيفية تعامل MaydanGo مع المعلومات عبر الموقع العام وخدمات الأعضاء.',
    draft: 'مسودة عمل للمراجعة — ليست استشارة قانونية أو سياسة نهائية معتمدة. يُستخدم MaydanGo هنا اسماً للخدمة. لا تتضمن الصفحة عنواناً. وتحتاج الترجمتان العربية والسورانية إلى مراجعة متحدثين محليين.',
    sections: [
      {
        id: 'information',
        title: 'المعلومات التي تتعامل معها MaydanGo',
        paragraphs: [
          'بحسب الميزات التي تستخدمها، قد تشمل المعلومات اسم الحساب والبريد الإلكتروني وتفاصيل الملف الشخصي والأهلية وحالة العضوية والحجوزات وقائمة الانتظار وتسجيلات الحضور والتقدم في الدورات وبلاغات الدعم أو السلامة التي تختار إرسالها. ويشمل التقدم في الدورات المسجّل فيها الدروس التي تفتحها وآخر موضع محفوظ للتشغيل كي تتمكن من المتابعة لاحقاً.',
          'قد يستخدم تطبيق الهاتف موقع جهازك عند بدء تسجيل حضور يعتمد على الموقع. يُستخدم ذلك لدعم تسجيل الحضور، وليس لتتبع تحركاتك باستمرار.',
          'عند استخدام ميزة تحتاج إلى إشعارات، قد يخزّن التطبيق رمز الجهاز وإعدادات الإشعارات لإرسال رسائل الخدمة المناسبة.',
        ],
      },
      {
        id: 'use',
        title: 'كيفية استخدام المعلومات',
        paragraphs: [
          'تستخدم MaydanGo هذه المعلومات لتسجيل الدخول، وإظهار الخدمات المتاحة لحسابك، وإدارة الحجوزات وقوائم الانتظار، وتأكيد الحضور، وتقديم الدورات والجلسات عبر الإنترنت، والرد على بلاغات الدعم والسلامة، وحماية الخدمة من إساءة الاستخدام.',
          'لا تُستخدم المعلومات لتأكيد مكان أو دخول عضوية أو نتيجة صحية أو توفر خدمة لم يتم تأكيدها في التطبيق أو من الجهة المقدمة.',
        ],
      },
      {
        id: 'sharing',
        title: 'من قد يطّلع على المعلومات',
        paragraphs: [
          'قد يستخدم موظفو MaydanGo المخوّلون المعلومات لتشغيل الخدمة والرد على الطلبات. وقد يرى شريك المرفق تفاصيل الحجز والحضور اللازمة لاستضافة الجلسة وتأكيد الزيارة. ويقتصر وصول المدربين على الدورات أو الجلسات المسندة إليهم.',
          'يستطيع مسؤول الشركة إدارة تسجيل الموظفين، ولا يحصل عبر مساحة الشركة على سجل النشاط الفردي للأعضاء أو سجلاتهم المالية الشخصية.',
          'تتولى Clerk تسجيل الدخول والتحقق من الحساب. وتوفر Replit استضافة التطبيق والبنية التحتية التي تشغّل MaydanGo، بما فيها قاعدة البيانات وتخزين الملفات المهيآن. لم تُحدد في هذه المسودة جهة خارجية أخرى تتعامل مع البيانات. وسيُشرح استخدام أي مزود للدفع قبل تفعيل ميزات الدفع.',
        ],
      },
      {
        id: 'contact-forms',
        title: 'استفسارات الموقع والمدفوعات',
        paragraphs: [
          'ينشئ نموذج الاستفسار في الموقع مسودة بريد إلكتروني في تطبيق البريد لديك. لا يرسل الموقع هذه المسودة ولا يخزنها. إذا اخترت إرسال الرسالة، يتولى مزود بريدك إيصالها.',
          'لا يقبل الموقع العام حالياً مدفوعات العضوية أو بيانات البطاقات. لا ترسل بيانات بطاقتك عبر البريد الإلكتروني. ستُشرح معلومات الدفع قبل إتاحة أي ميزة للدفع.',
        ],
      },
      {
        id: 'cookies',
        title: 'ملفات الارتباط وتخزين المتصفح والتحليلات',
        paragraphs: [
          'قد تستخدم ميزات تسجيل الدخول والأمان تخزيناً ضرورياً في المتصفح. ويحفظ خيار الخصوصية تفضيلك للتحليلات في هذا المتصفح لتذكره في الزيارات القادمة.',
          'التحليلات الاختيارية متوقفة ما لم تسمح بها. لا يحمّل الموقع العام حالياً أداة تحليلات خارجية. إذا فُعّلت التحليلات لاحقاً، يجب تحديث خيار الموافقة وهذا الإشعار قبل ذلك.',
        ],
      },
      {
        id: 'children',
        title: 'العمر وموافقة ولي الأمر',
        paragraphs: [
          'الحد الأدنى للعمر هو 18 عاماً. ويجوز لمن هم دون 18 المشاركة بموافقة ولي الأمر فقط. يتحقق الشريك من الموافقة في الموقع ويرفع نسخة مصورة عبر بوابة الشريك الخاصة في MaydanGo. لا يستطيع الاطلاع على النسخة إلا موظفو المدير الأعلى، ولا يستطيع الشريك تنزيلها.',
          'تُحدد النسخة للحذف التلقائي بعد 90 يوماً من الزيارة. لا ترسل نسخ موافقة ولي الأمر أو وثائق الهوية أو تفاصيل ولي الأمر الحساسة عبر نموذج الاستفسار العام.',
        ],
      },
      {
        id: 'financial-retention',
        title: 'السجلات المالية والضريبية',
        paragraphs: [
          'تخطط MaydanGo حالياً للاحتفاظ بالفواتير وتفاصيل الضرائب وسجلات تصحيح الفواتير لمدة لا تقل عن 10 سنوات. هذا قرار للمنتج وليس متطلباً قانونياً عراقياً مؤكداً، ويجب التحقق منه مع مستشارين قانونيين ومحاسبين محليين مؤهلين.',
          'لا تُحذف السجلات المالية تلقائياً عند انتهاء مدة السنوات العشر. ويظل الوصول مقتصراً على موظفي المالية المخولين، ويجب أن يتبع أي حذف لاحق قواعد الاحتفاظ المحلية المعتمدة.',
        ],
      },
      {
        id: 'rights',
        title: 'طلبات الخصوصية',
        paragraphs: [
          'إذا كان لديك حساب، استخدم الحساب ← طلبات الخصوصية لطلب نسخة من معلوماتك أو مراجعة حذف الحساب. يتحقق فريق الدعم المخوّل من هويتك قبل الموافقة على نسخة البيانات. بعد الموافقة، يستطيع صاحب الحساب المسجّل فقط تنزيلها خلال 24 ساعة. لا تتضمن النسخة تفاصيل أدوات الدفع أو بيانات الدخول أو رموز الأجهزة أو روابط الصفوف الخاصة أو رسائل الدعم أو ملاحظات الموظفين الداخلية.',
          'يراجع فريق الدعم المخوّل طلبات حذف الحساب، ولا يتم الحذف فوراً. قد تحتاج MaydanGo إلى التحقق من أن الطلب يخص حسابك قبل اتخاذ إجراء. وقد يلزم الاحتفاظ ببعض السجلات لأغراض سلامة الخدمة أو أمنها أو لمتطلبات أخرى واجبة التطبيق.',
        ],
      },
      {
        id: 'security',
        title: 'حماية المعلومات',
        paragraphs: [
          'تستخدم MaydanGo صلاحيات الحسابات والأدوار للحد من الأشخاص الذين يمكنهم الاطلاع على المعلومات التشغيلية أو إدارتها. لا تشارك كلمة المرور ولا ترسل بيانات هوية حساسة عبر استفسار عام.',
          'لا يمكن لأي خدمة عبر الإنترنت ضمان انعدام المخاطر في كل عملية نقل أو نظام. تواصل مع MaydanGo سريعاً إذا اعتقدت أن حسابك أو معلوماتك استُخدمت دون إذن.',
        ],
      },
      {
        id: 'changes',
        title: 'تحديث هذه المعلومات',
        paragraphs: [
          'سيُحدّث هذا الإشعار عند تغيير طريقة التعامل مع المعلومات. وما زالت هذه مسودة عمل تحتاج إلى مراجعة قبل نشرها كسياسة خصوصية رسمية.',
        ],
      },
    ],
    contactTitle: 'أسئلة أو طلبات الخصوصية',
    contactBody: 'استخدم هذا البريد لأسئلة الخصوصية أو طلباتها. لا ترفق كلمات مرور أو بيانات بطاقات دفع أو وثائق هوية.',
    contactEmailLabel: 'راسل MaydanGo بشأن الخصوصية',
    accountRequestsLabel: 'فتح طلبات الخصوصية في الحساب',
    back: 'العودة إلى المعلومات القانونية',
  },
  ku: {
    title: 'زانیاریی تایبەتمەندی',
    intro: 'ڕوونکردنەوەیەکی ئاسان بۆ چۆنیەتی مامەڵەکردنی MaydanGo لەگەڵ زانیاری لە ماڵپەڕی گشتی و خزمەتگوزاریی ئەنداماندا.',
    draft: 'ڕەشنووسی کار بۆ پێداچوونەوە — ڕاوێژی یاسایی یان سیاسەتی کۆتایی و پەسەندکراو نییە. MaydanGo لێرەدا ناوی خزمەتگوزارییەکەیە. ناونیشان لەم پەڕەیەدا نییە. وەرگێڕانی عەرەبی و سۆرانی پێویستی بە پێداچوونەوەی قسەکەرانی ناوخۆیی هەیە.',
    sections: [
      {
        id: 'information',
        title: 'زانیارییەکانی MaydanGo',
        paragraphs: [
          'بەپێی ئەو تایبەتمەندییانەی بەکاریان دەهێنیت، زانیارییەکان لەوانەیە ناوی هەژمار و ئیمەیڵ، وردەکاریی پڕۆفایل و شایستەیی، دۆخی ئەندامێتی، حجز، لیستی چاوەڕوانی، تۆماری حزوور، پێشکەوتنی کۆرس، و ڕاپۆرتی پشتگیری یان سەلامەتی بگرێتەوە کە خۆت دەنێریت. لە کۆرسەکانی تۆمارکراویتدا، پێشکەوتن ئەو وانانە دەگرێتەوە کە دەیکەیتەوە و دوا شوێنی پەخشکردنی پاشەکەوتکراو، بۆ ئەوەی دواتر لەوێوە بەردەوام بیت.',
          'ئەپی مۆبایل لەوانەیە کاتی دەستپێکردنی حزووری پشتبەستوو بە شوێن، شوێنی ئامێرەکەت بەکاربهێنێت. ئەمە بۆ پشتگیریی تۆمارکردنی حزوورە، نەک بۆ بەدواداچوونی بەردەوامی جووڵەکانت.',
          'کاتێک تایبەتمەندییەک پێویستی بە ئاگادارکردنەوە هەیە، ئەپەکە لەوانەیە تۆکنی ئامێر و ڕێکخستنەکانی ئاگادارکردنەوە هەڵبگرێت بۆ ناردنی پەیامی پەیوەندیدار بە خزمەتگوزاری.',
        ],
      },
      {
        id: 'use',
        title: 'بۆچی زانیاری بەکاردەهێنرێت',
        paragraphs: [
          'MaydanGo ئەم زانیارییانە بەکاردەهێنێت بۆ چوونەژوورەوە، پیشاندانی خزمەتگوزارییە بەردەستەکانی هەژمارەکەت، بەڕێوەبردنی حجز و لیستی چاوەڕوانی، پشتڕاستکردنەوەی حزوور، پێشکەشکردنی کۆرس و وانەی ئۆنلاین، وەڵامدانەوەی ڕاپۆرتی پشتگیری یان سەلامەتی، و پاراستنی خزمەتگوزاری لە بەکارهێنانی خراپ.',
          'زانیاری بەکارناهێنرێت بۆ بەڵێندانی شوێن، دەستگەیشتنی ئەندامێتی، ئەنجامی تەندروستی یان بەردەستبوونی خزمەتگوزارییەک کە لە ئەپ یان لەلایەن دابینکەرەوە پشتڕاست نەکراوەتەوە.',
        ],
      },
      {
        id: 'sharing',
        title: 'کێ لەوانەیە زانیاری ببینێت',
        paragraphs: [
          'کارمەندانی ڕێگەپێدراوی MaydanGo لەوانەیە زانیاری بەکاربهێنن بۆ بەڕێوەبردنی خزمەتگوزاری و وەڵامدانەوەی داواکاری. هاوبەشی شوێن لەوانەیە وردەکاریی حجز و حزووری پێویستی بۆ پێشکەشکردنی وانە و پشتڕاستکردنەوەی سەردان ببینێت. دەستگەیشتنی ڕاهێنەر سنووردارە بەو کۆرس و وانانەی پێی سپێردراون.',
          'بەڕێوەبەری کۆمپانیا دەتوانێت تۆمارکردنی کارمەندان بەڕێوەببات. لە ڕێگەی شوێنی کۆمپانیاوە تۆماری چالاکیی تاکەکەسی یان دارایی کەسی ئەندامان نابینێت.',
          'Clerk چوونەژوورەوە و پشتڕاستکردنەوەی هەژمار بەڕێوەدەبات. Replit میوانداری ئەپ و بنەمای ژێرخانەیی MaydanGo دابین دەکات، لەوانە بنکەدراوە و هەڵگرتنی فایل کە ڕێکخراون. لەم ڕەشنووسەدا دابینکەری دەرەکیی تری مامەڵەکار بە داتا دیاری نەکراوە. بەکارهێنانی هەر دابینکەرێکی پارەدان پێش چالاککردنی پارەدان ڕوون دەکرێتەوە.',
        ],
      },
      {
        id: 'contact-forms',
        title: 'پرسیاری ماڵپەڕ و پارەدان',
        paragraphs: [
          'فۆرمی پرسیاری ماڵپەڕی گشتی ڕەشنووسی ئیمەیڵێک لە ئەپی ئیمەیڵی تۆ ئامادە دەکات. ماڵپەڕەکە ئەو ڕەشنووسە نانێرێت و هەڵیناگرێت. ئەگەر خۆت ئیمەیڵەکە بنێریت، دابینکەری ئیمەیڵەکەت گەیاندنی بەڕێوەدەبات.',
          'ماڵپەڕی گشتی ئێستا پارەی ئەندامێتی یان زانیاری کارتی بانکی وەرناگرێت. زانیاریی کارتی پارەدان بە ئیمەیڵ مەبنێرە. زانیاریی پارەدان پێش بەردەستبوونی هەر تایبەتمەندییەکی پارەدان ڕوون دەکرێتەوە.',
        ],
      },
      {
        id: 'cookies',
        title: 'کوکی، هەڵگرتنی وێبگەڕ و شیکاری',
        paragraphs: [
          'تایبەتمەندیی چوونەژوورەوە و پاراستن لەوانەیە هەڵگرتنی پێویستی وێبگەڕ بەکاربهێنن. هەڵبژاردەی تایبەتمەندیی تۆ پاشەکەوت دەکات بۆ ئەوەی لە سەردانی داهاتوودا لەبیر بێت.',
          'شیکاریی ئارەزوومەندانە ناچالاکە مەگەر ڕێگەی پێ بدەیت. ماڵپەڕی گشتی ئێستا ئامرازی شیکاریی دەرەکی بارناکات. ئەگەر لە داهاتوودا شیکاری چالاک بکرێت، پێش گۆڕانکاری دەبێت هەڵبژاردە و ئەم ئاگادارییە نوێ بکرێنەوە.',
        ],
      },
      {
        id: 'children',
        title: 'تەمەن و ڕەزامەندیی سەرپەرشتیار',
        paragraphs: [
          'کەمترین تەمەن 18 ساڵە. کەسێکی خوار 18 ساڵ تەنها بە ڕەزامەندیی سەرپەرشتیار دەتوانێت بەشداربێت. هاوبەش ڕەزامەندییەکە لە شوێنەکەدا دەپشکنێت و وێنەیەک لە ڕێگەی پۆرتاڵی تایبەتی هاوبەشی MaydanGo بار دەکات. تەنها کارمەندانی Super Admin دەتوانن وێنەکە ببینن؛ هاوبەش ناتوانێت دایبگرێت.',
          'وێنەکە بۆ سڕینەوەی خۆکار 90 ڕۆژ دوای سەردان ڕێکخراوە. وێنەی ڕەزامەندی، بەڵگەنامەی ناسنامە یان وردەکاریی هەستیاری سەرپەرشتیار لە فۆرمی گشتیی پرسیارەوە مەبنێرە.',
        ],
      },
      {
        id: 'financial-retention',
        title: 'تۆمارە دارایی و باجییەکان',
        paragraphs: [
          'MaydanGo لە ئێستادا پلانی ئەوەی هەیە پسووڵە، وردەکاریی باج و تۆماری چاکسازیی پسووڵەکان بۆ لانیکەم 10 ساڵ بهێڵێتەوە. ئەمە بڕیارێکی بەرهەمە، نەک پێداویستییەکی یاسایی پشتڕاستکراوی عێراق؛ پێویستە لەلایەن ڕاوێژکاری یاسایی و ژمێریاریی ناوخۆیی شیاوەوە بپشکنرێت.',
          'تۆمارە داراییەکان لە کۆتایی 10 ساڵدا بە شێوەی خۆکار ناسڕدرێنەوە. دەستگەیشتن سنووردارە بە کارمەندانی دارایی ڕێگەپێدراو، و هەر سڕینەوەیەکی دواتر دەبێت یاساکانی پەسەندکراوی ناوخۆیی بۆ پاراستنی تۆمارەکان پەیڕەو بکات.',
        ],
      },
      {
        id: 'rights',
        title: 'داواکارییەکانی تایبەتمەندی',
        paragraphs: [
          'ئەگەر هەژمارت هەیە، لە هەژمار ← داواکارییەکانی تایبەتمەندی داوای کۆپیی زانیارییەکانت یان پێداچوونەوە بۆ سڕینەوەی هەژمار بکە. تیمی پشتگیریی ڕێگەپێدراو پێش پەسەندکردنی کۆپیی داتا ناسنامەکەت پشتڕاست دەکاتەوە. دوای پەسەندکردن، تەنها خاوەنی هەژماری چوونەژوورەوە دەتوانێت لە ماوەی ٢٤ کاتژمێردا دایبگرێت. کۆپییەکە وردەکاریی پارەدان، زانیاریی چوونەژوورەوە، تۆکنی ئامێر، بەستەری وانەی تایبەت، پەیامەکانی پشتگیری و تێبینیی ناوخۆی کارمەندان ناگرێتەوە.',
          'تیمی پشتگیریی ڕێگەپێدراو داواکاریی سڕینەوەی هەژمار پێداچوونەوەی بۆ دەکات و سڕینەوە دەستبەجێ نییە. لەوانەیە MaydanGo پێش هەر کارێک پشتڕاستی بکاتەوە کە داواکارییەکە پەیوەندی بە هەژمارەکەتەوە هەیە. هەندێک تۆمار لەوانەیە بۆ پاراستنی سەلامەتی و ئاسایشی خزمەتگوزاری یان داواکارییەکانی تر پێویست بێت بهێڵدرێنەوە.',
        ],
      },
      {
        id: 'security',
        title: 'پاراستنی زانیاری',
        paragraphs: [
          'MaydanGo ڕێگەپێدان و ڕۆڵی هەژمار بەکاردەهێنێت بۆ سنووردارکردنی ئەو کەسانەی دەتوانن زانیاریی کارگێڕی ببینن یان بەڕێوەی ببەن. وشەی نهێنی هاوبەش مەکە و زانیاریی هەستیاری ناسنامە لە پرسیاری گشتی مەبنێرە.',
          'هیچ خزمەتگوزاریی ئۆنلاینێک ناتوانێت بێ مەترسیبوونی هەموو گواستنەوە یان سیستەمێک مسۆگەر بکات. ئەگەر پێت وایە هەژمار یان زانیارییەکانت بەبێ ڕێگەپێدان بەکارهاتوون، زوو پەیوەندی بە MaydanGo بکە.',
        ],
      },
      {
        id: 'changes',
        title: 'گۆڕانکاریی ئەم زانیارییە',
        paragraphs: [
          'کاتێک شێوازی مامەڵەکردن لەگەڵ زانیاری دەگۆڕێت، ئەم ئاگادارییە نوێ دەکرێتەوە. ئەمە هێشتا ڕەشنووسی کارە و پێویستی بە پێداچوونەوە هەیە پێش بڵاوکردنەوەی وەک سیاسەتی فەرمیی تایبەتمەندی.',
        ],
      },
    ],
    contactTitle: 'پرسیار یان داواکاریی تایبەتمەندی',
    contactBody: 'بۆ پرسیار یان داواکاریی تایبەتمەندی ئیمەیڵ بنێرە. وشەی نهێنی، وردەکاری کارتی پارەدان یان بەڵگەنامەی ناسنامە مەبنێرە.',
    contactEmailLabel: 'ئیمەیڵ بۆ MaydanGo لەبارەی تایبەتمەندی',
    accountRequestsLabel: 'کردنەوەی داواکارییەکانی تایبەتمەندی لە هەژمار',
    back: 'گەڕانەوە بۆ زانیاریی یاسایی',
  },
};

const privacyEmail = 'maydangoing@gmail.com';

export function PrivacyPolicyPage({ language }: { language: Language }) {
  const publishedPolicies = useGetPublicLegalPolicies();
  const publishedPolicy = publishedPolicies.data?.find(policy => policy.policyKey === 'privacy_policy');
  const text = privacyCopy[language];
  const rtl = language !== 'en';
  const publishedCopy = publishedPolicy?.translations[language];

  if (publishedCopy && publishedPolicy) {
    const versionLabel = language === 'en' ? 'Version' : language === 'ar' ? 'الإصدار' : 'وەشان';
    const effectiveLabel = language === 'en' ? 'Effective date' : language === 'ar' ? 'تاريخ السريان' : 'بەرواری جێبەجێبوون';
    return (
      <main dir={rtl ? 'rtl' : 'ltr'} className="mx-auto max-w-5xl px-5 py-10 text-[#173d35] sm:py-16">
        <article className="overflow-hidden rounded-3xl border border-[#dfdacb] bg-[#fffdf7]">
          <header className="bg-[#174d43] p-6 text-[#fff9e9] sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efaa83]">MaydanGo</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{publishedCopy.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#e3eee7] sm:text-base">{publishedCopy.introduction}</p>
            <p className="mt-5 text-xs text-[#e3eee7]">
              {versionLabel}: {publishedPolicy.version} · {effectiveLabel}: {new Intl.DateTimeFormat(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ', { dateStyle: 'long' }).format(new Date(publishedPolicy.effectiveAt))}
            </p>
          </header>
          <div className="space-y-4 p-6 sm:p-10">
            {publishedCopy.body.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap text-sm leading-7 text-[#536b61] sm:text-base">{paragraph}</p>
            ))}
          </div>
        </article>
        <section className="mt-6 rounded-2xl bg-[#eadfcd] p-5 sm:p-7">
          <h2 className="font-display text-xl font-bold">{text.contactTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-[#536b61]">{text.contactBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/account" className="inline-flex min-h-10 items-center rounded-full bg-[#174d43] px-4 py-2 text-sm font-bold text-[#fff9e9]">{text.accountRequestsLabel}</Link>
            <a href={`mailto:${privacyEmail}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#174d43] px-4 py-2 text-sm font-bold text-[#174d43]"><Mail size={15} />{text.contactEmailLabel}</a>
          </div>
        </section>
        <Link href="/legal" className="mt-7 inline-flex text-sm font-bold text-[#174d43] underline underline-offset-4" data-testid="link-privacy-legal">{text.back}</Link>
      </main>
    );
  }

  return (
    <main dir={rtl ? 'rtl' : 'ltr'} className="mx-auto max-w-5xl px-5 py-10 text-[#173d35] sm:py-16">
      <header className="rounded-3xl bg-[#174d43] p-6 text-[#fff9e9] sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efaa83]">MaydanGo</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{text.title}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#e3eee7] sm:text-base">{text.intro}</p>
      </header>

      <div role="note" className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e1c38f] bg-[#fff5dc] p-4 text-sm leading-6 text-[#694e2e]">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <p>{text.draft}</p>
      </div>

      <div className="mt-8 space-y-4">
        {text.sections.map(section => (
          <section key={section.id} id={section.id} className="scroll-mt-6 rounded-2xl border border-[#dfdacb] bg-[#fffdf7] p-5 sm:p-7">
            <h2 className="font-display text-xl font-bold sm:text-2xl">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[#536b61] sm:text-base">
              {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-2xl bg-[#eadfcd] p-5 sm:p-7">
        <h2 className="font-display text-xl font-bold">{text.contactTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-[#536b61]">{text.contactBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/account" className="inline-flex min-h-10 items-center rounded-full bg-[#174d43] px-4 py-2 text-sm font-bold text-[#fff9e9]" data-testid="link-account-privacy-requests">
            {text.accountRequestsLabel}
          </Link>
          <a href={`mailto:${privacyEmail}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#174d43] px-4 py-2 text-sm font-bold text-[#174d43]" data-testid="link-privacy-email">
          <Mail size={15} />
          {text.contactEmailLabel}
          </a>
        </div>
      </section>

      <Link href="/legal" className="mt-7 inline-flex text-sm font-bold text-[#174d43] underline underline-offset-4" data-testid="link-privacy-legal">
        {text.back}
      </Link>
    </main>
  );
}
