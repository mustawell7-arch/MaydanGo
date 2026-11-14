import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Dumbbell, Globe2, HeartHandshake, House, MapPin, Menu, MoveUpRight, Play, RotateCw, Sparkles, Users, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { CookieConsent } from '@/components/cookie-consent';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGetPublicCatalog, getGetPublicCatalogQueryKey, useGetPublicPlans, getGetPublicPlansQueryKey } from '@workspace/api-client-react';
import type { PublicOffering, PublicPlan } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import NotFound from '@/pages/not-found';
import approvedCopy from '@/approved-copy.json';
import { Route, Switch, useLocation, Router as WouterRouter, Link, Redirect } from 'wouter';
import PartnerPortal from '@/pages/partner-portal';
import SponsoredPlacementsManagerPage from '@/pages/sponsored-placements-manager';
import FinanceConsole from '@/pages/finance-console';
import { PublicCourseBrowser, PublicFacilityBrowser, PublicHomeShowcase } from '@/pages/public-catalog-sections';
import MemberAccountPage from '@/pages/member-account';
import { PrivacyPolicyPage } from '@/pages/privacy-policy';
import { AdminInstructorAccessPage, InstructorPortalPage } from '@/pages/instructor-access';
import SupportDeskPage from '@/pages/support-desk';
import SuperAdminPage from '@/pages/super-admin';
import { createContactEmailDraft, initialContactTopic, verifiedContactEmail } from '@/lib/contact-enquiry';
import { CorporateAdminPage, CorporateInvitePage, CorporatePortalPage } from '@/pages/corporate-workspace';
import './index.css';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#174d43',
    colorForeground: '#173d35',
    colorMutedForeground: '#60756b',
    colorDanger: '#a33d2e',
    colorBackground: '#fffdf7',
    colorInput: '#fffdf7',
    colorInputForeground: '#173d35',
    colorNeutral: '#d8d2c4',
    fontFamily: "'DM Sans', 'Noto Sans Arabic', sans-serif",
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf7] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#173d35] font-bold',
    headerSubtitle: 'text-[#60756b]',
    socialButtonsBlockButtonText: 'text-[#173d35] font-semibold',
    formFieldLabel: 'text-[#36564b] font-semibold',
    footerActionLink: 'text-[#174d43] font-bold',
    footerActionText: 'text-[#60756b]',
    dividerText: 'text-[#60756b]',
    identityPreviewEditButton: 'text-[#174d43]',
    formFieldSuccessText: 'text-[#2d6d4a]',
    formFieldErrorText: 'text-[#9a4435]',
    formFieldHintText: 'text-[#60756b]',
    formFieldAction: 'text-[#174d43] font-semibold',
    formResendCodeLink: 'text-[#174d43] font-semibold',
    alertText: 'text-[#8f352a]',
    identityPreviewText: 'text-[#173d35]',
    logoBox: 'h-12',
    logoImage: 'max-h-12 object-contain',
    socialButtonsBlockButton: 'border-[#d8d2c4] bg-[#fffdf7] hover:bg-[#f3f0e5]',
    alternativeMethodsBlockButton: 'text-[#174d43]',
    formButtonPrimary: 'bg-[#174d43] text-[#fff9e9] hover:bg-[#226556]',
    formFieldInput: 'border-[#d8d2c4] bg-[#fffdf7] text-[#173d35]',
    formFieldInputShowPasswordButton: 'text-[#536b61]',
    formFieldInputShowPasswordIcon: 'text-[#536b61]',
    footerAction: 'text-[#60756b]',
    dividerLine: 'bg-[#d8d2c4]',
    alert: 'border-[#e4c3b7] bg-[#fff5f1]',
    otpCodeFieldInput: 'border-[#d8d2c4] bg-[#fffdf7] text-[#173d35]',
    otpCodeField: 'text-[#173d35]',
    badge: 'bg-[#e9e5d7] text-[#36564b]',
    formFieldRow: 'text-[#173d35]',
    formFieldLabelRow: 'text-[#36564b]',
    formFieldInputGroup: 'text-[#173d35]',
    formFieldInputGroupIcon: 'text-[#60756b]',
    formFieldInputGroupInput: 'text-[#173d35]',
    main: 'text-[#173d35]',
  },
};
type Language = 'en' | 'ar' | 'ku';
type Copy = Record<string, string>;

const legacyTranslations: Record<Language, Copy> = {
  en: {
    home: 'Home', how: 'How it works', plans: 'Membership', facilities: 'Facilities', online: 'Train online', legal: 'Legal information', account: 'My account',
    privacyLink: 'Privacy information',
    partner: 'Partner with us', instructor: 'For instructors', corporate: 'For organisations', help: 'Help', contact: 'Contact',
    mainNavigation: 'Main navigation', selectLanguage: 'Select language', openMenu: 'Open menu', closeMenu: 'Close menu',
    accountSignInSubtitle: 'Sign in to view your MaydanGo account.',
    accountSignUpSubtitle: 'Create your MaydanGo member account.',
    eyebrow: 'A little more movement, wherever you are',
    hero: 'Make room for\nfeeling good.',
    intro: 'One membership for movement in your city and guidance from home. Built with local places, coaches and communities across Iraq.',
    explore: 'Explore membership', discover: 'Find your kind of movement', steps: 'A simple way to get moving',
    step1: 'Choose your way', step1d: 'Explore local facilities, classes and coaching—or find sessions to follow from home.',
    step2: 'Ask what fits', step2d: 'See the public options, then ask our team about current availability and what each includes.',
    step3: 'Move at your pace', step3d: 'Make movement part of your week, in a place and rhythm that works for you.',
    step4: 'Book when needed', step4d: 'Some visits need a booking. Check the offering details before you go.',
    step5: 'Check in and get moving', step5d: 'Follow the check-in instructions in the app or at the venue. Join online sessions from home.',
    community: 'Movement belongs to everyone.',
    communityd: 'From a studio in Erbil to an evening walk in Basra, wellbeing takes many forms. MaydanGo brings more of them within reach.',
    local: 'Made for many ways of living', locald: 'Find welcoming spaces and at-home guidance across cities, regions and routines.',
    live: 'Live local opportunities', empty: 'No live opportunities to show just now.',
    emptySub: 'When approved partners publish future availability, it will appear here.',
    loading: 'Checking current availability…', error: 'We could not load current availability.',
    retry: 'Try again', noInventory: 'Nothing listed at the moment',
    noInventoryText: 'This is an honest snapshot of live inventory. Please check back later or ask us for updates.',
    notCheckout: 'Membership checkout is not enabled. These options are a starting point for an availability enquiry.',
    ask: 'Ask about availability', getUpdates: 'Get updates', exploreFacilities: 'Explore facilities',
    exploreOnline: 'Explore online training', currentOfferings: 'Available sessions and events',
    kind: 'Format', location: 'Location', partnerName: 'Hosted by', starts: 'Starts',
    sessionType: 'Class', eventType: 'Event', coachType: 'Coaching',
    physicalType: 'In person', premiumType: 'Premium', liveType: 'Online',
    paidPlan: 'Paid plan', trialPlan: 'Trial plan', corporatePlan: 'Organisation plan',
    planCompareTitle: 'Compare membership access',
    planCompareIntro: 'See the visit limits and activities each active plan includes. Prices and online purchase remain unavailable until payment setup and terms are confirmed.',
    planPriceDeferred: 'Prices are intentionally not shown yet. Payment and online activation stay closed until the final payment milestone.',
    planSharedVisits: 'Shared visit allowance', planVisitsByType: 'Visit allowances by type',
    planAccess: 'Included access',
    planPhysicalAccess: 'In-person access', planPremiumAccess: 'Premium access',
    planLiveAccess: 'Live online classes', planDigitalAccess: 'Recorded digital courses',
    planEventAccess: 'Free event access', planDailyLimit: 'Daily visit limit',
    planVisits: 'visits', planCancellation: 'Cancellation notice', planDays: 'days',
    planIncluded: 'Included', planNotIncluded: 'Not included', planConfirm: 'Confirm with MaydanGo',
    planFaqs: 'Membership questions', planEmptyTitle: 'No active membership plans yet',
    planEmptyBody: 'The team has not published a plan for public comparison. Ask MaydanGo about availability; this will not activate a membership.',
    planFaqPriceTitle: 'Why are prices not shown?',
    planFaqPriceBody: 'Online checkout is not available yet. MaydanGo will publish confirmed prices before membership purchase is enabled.',
    planFaqAccessTitle: 'Does every plan include every activity?',
    planFaqAccessBody: 'No. Included activity types and visit limits are listed on each plan; availability also depends on your city and provider.',
    planFaqCancelTitle: 'What if cancellation terms are missing?',
    planFaqCancelBody: 'Ask the MaydanGo team to confirm the applicable terms before booking or making a commitment.',
    planFaqPurchaseTitle: 'Can I buy or activate a plan here?',
    planFaqPurchaseBody: 'No. This page is for information and enquiries; it does not take payment or activate membership.',
    directions: 'Local partners, shared purpose', directionsD: 'We welcome spaces and instructors who help people feel at home in movement.',
    onlineTitle: 'A way to move from home, too', onlineD: 'Follow live online sessions when available, or find a pace that fits your own space and day.',
    homeFirst: 'A studio nearby or a corner at home.', homeFirstD: 'Wellbeing is not one-size-fits-all. Choose the setting that feels right today.',
    footerNote: 'A wellbeing membership made in Iraq, for everyday life.',
    noDestination: 'This destination is not configured yet. Please check back for verified contact details.',
    send: 'Send an enquiry', formNote: 'We’ll prepare an email draft for you. This site does not send or store it.',
    learnMore: 'Learn more', availabilityTitle: 'Ask us what is available', availabilityD: 'Tell us what you are looking for and we will help you understand the current options.',
    faq1: 'Is MaydanGo available in my city?', faq1d: 'Our public catalogue shows future offerings from active, approved partners. If your area is not listed today, availability may change.',
    faq2: 'Can I train from home?', faq2d: 'Yes. Online and live options may be listed alongside in-person sessions when partners publish them.',
    faq3: 'Can I buy or activate a membership here?', faq3d: 'No. Checkout and activation are not enabled on this website. You can ask about availability or request updates.',
    faq4: 'Who can take part?', faq4d: 'MaydanGo aims to make movement welcoming to people with different routines, abilities and goals. Check each provider’s details before attending.',
    faq5: 'How do I book a visit?', faq5d: 'Use the MaydanGo app for any session that requires booking. Check the session details and cancellation deadline first.',
    faq6: 'How do I check in?', faq6d: 'Follow the check-in instructions shown for your booking or ask the partner team at the venue. The method can vary by location.',
    faq7: 'Are payments and refunds available?', faq7d: 'Checkout is not enabled yet. Payment and refund terms are not published as active policy; contact us before making commitments.',
    faq8: 'Can I access online classes and recorded courses?', faq8d: 'Public class and course details are for discovery. Course lessons are not published on this website; access is checked through the app.',
    faq9: 'Can my organisation arrange membership?', faq9d: 'Organisations can contact us with an enquiry. Availability and any contribution must be confirmed before a commitment.',
    readDraft: 'Informational draft — not legal advice and not lawyer-approved.',
    contactUnavailable: 'A verified contact destination has not been configured.',
    featurePlace: 'Find a place', featurePlaceD: 'Discover local studios, facilities and sessions.',
    featureHome: 'Move at home', featureHomeD: 'Make room for a routine that works where you are.',
    featureWelcome: 'Feel welcome', featureWelcomeD: 'Explore options shaped by local partners.',
    geography: 'Baghdad · Erbil · Basra · and beyond', heroStamp: 'your pace, your place',
    legalTitle: 'The important details.', helpTitle: 'Good to know.',
    supportStaffSignIn: 'Support staff sign-in',
    'page_title:/instructor': 'Teach with MaydanGo',
    'page_description:/instructor': 'Explore instructor enquiries for courses and live sessions. Rates and payout terms must be confirmed before any agreement.',
    'page_title:/account': 'Your MaydanGo account',
    'page_description:/account': 'Privately review your membership and bookings and update your basic account details.',
    'page_title:/privacy': 'Privacy information | MaydanGo',
    'page_description:/privacy': 'Plain-language draft explaining how MaydanGo handles account, booking, attendance, support and browser information.',
    contactTitle: 'Let’s find the right next step.', partnerTitle: 'Make your space part of the movement.',
    corporateTitle: 'More room for wellbeing at work.', instructorTitle: 'Share what you teach.',
    partnerIntro: 'MaydanGo connects people with places and coaches that make wellbeing feel closer to everyday life. Tell us about your work and we can explore a fit together.',
    corporateIntro: 'Explore ways to make local movement and at-home options easier to discover for your people. We can discuss what may fit your organisation and location.',
    instructorIntro: 'Tell us about your coaching or teaching work. Ask about courses or live sessions; rates and payout terms must be confirmed before any agreement.',
    partnerBullet1: 'Share upcoming sessions with a wider local community.',
    partnerBullet2: 'Help more people discover the work you already do.',
    partnerBullet3: 'Start with a conversation—no commitment is implied.',
    corporateBullet1: 'A conversation shaped around your team and context.',
    corporateBullet2: 'Options may include local facilities or online sessions.',
    corporateBullet3: 'No plan, price or activation is promised on this page.',
    instructorBullet1: 'Introduce your training approach and the people you serve.',
    instructorBullet2: 'Ask about creating a course or hosting a live session.',
    instructorBullet3: 'Rates, eligibility and payout details are not published here; confirm the terms before agreeing.',
    partnerDetail1: 'Publish approved facility and session information for members to discover.',
    partnerDetail2: 'Use partner tools to manage sessions and confirm attendance after an in-person visit.',
    partnerDetail3: 'Ask about participation and payout terms; this page does not publish rates or guarantee revenue.',
    corporateDetail1: 'Discuss options for employees, including local facilities and online sessions where available.',
    corporateDetail2: 'Ask about company contributions, HR administration, and reporting needs.',
    corporateDetail3: 'Availability, contributions, and reporting arrangements need confirmation; this enquiry does not activate a plan.',
    corporatePortalPrompt: 'Already invited as a company HR administrator?',
    corporatePortalSignIn: 'Open the company portal',
    verifiedContinue: 'Continue to the verified enquiry destination.',
    contactTopic: 'What is your enquiry about?', topicMembership: 'Membership availability',
    topicPartner: 'Partner enquiry', topicInstructor: 'Instructor enquiry', topicCorporate: 'Organisation enquiry', topicOther: 'Something else',
    previewEnquiry: 'Prepare an email draft', localFormNotice: 'Nothing was sent or stored. Use the verified contact route on this page if available.',
    emailMaydanGo: 'Email MaydanGo',
    nameLabel: 'Your name', emailLabel: 'Your email', messageLabel: 'Your message',
    openEmailDraft: 'Open email draft', draftReady: 'Your email draft is ready to review.',
    legalWebsite: 'Website use', legalWebsiteD: 'MaydanGo provides information about wellbeing and movement opportunities. Public availability may change, and details should be confirmed with the relevant provider before making plans.',
    legalMembership: 'Membership and availability', legalMembershipD: 'This website does not process payments, sell memberships, activate access or guarantee a place. Public plans are summaries only. An availability enquiry is not a purchase or membership confirmation.',
    legalPartner: 'Partners and providers', legalPartnerD: 'Offerings are published by approved active partners. Please confirm suitability, timing, location, access details and any participation requirements directly before attending.',
    legalPrivacy: 'Privacy note', legalPrivacyD: 'This website may display information necessary to describe public offerings. The contact enquiry interface does not submit or store a message. For privacy questions, use the configured contact route if available.',
    legalStatus: 'Informational status', legalStatusD: 'This content is an informational draft only. It is not legal advice and does not state that it has been reviewed or approved by a lawyer. It should be reviewed for the relevant jurisdictions before formal use.',
    legalDisclaimer: 'This content is an informational draft only. It is not legal advice and does not state that it has been reviewed or approved by a lawyer.',
    legalPolicyChecklist: 'Policies awaiting review', legalPolicyPending: 'This is a publication checklist, not a set of active terms. Each item needs review before it can be published as policy.',
    legalPendingLabel: 'Not published as active policy',
    legalTermsTitle: 'Terms of use', legalPrivacyTitle: 'Privacy policy', legalCookiesTitle: 'Cookie policy',
    legalBookingTitle: 'Booking policy', legalCancellationTitle: 'Cancellation policy', legalNoShowTitle: 'No-show policy',
    legalRefundTitle: 'Refund policy', legalPartnerTermsTitle: 'Partner terms', legalCorporateTitle: 'Corporate terms',
    legalCourseTitle: 'Course-content policy',
    durationDays: 'days', place: 'places', placeOne: 'place',
    appDownload: 'Continue on your device', appDestinationsUnavailable: 'Verified app-store destinations have not been configured yet.',
    iosApp: 'Open MaydanGo for iOS', androidApp: 'Open MaydanGo for Android',
    regionNote: 'IRAQ · KURDISTAN · WEST · SOUTH', movementNote: 'MOVEMENT, YOUR WAY',
  },
  ar: {
    home: 'الرئيسية', how: 'كيف تعمل', plans: 'العضوية', facilities: 'المرافق', online: 'تدريب عبر الإنترنت', legal: 'معلومات قانونية', account: 'حسابي',
    privacyLink: 'معلومات الخصوصية',
    partner: 'كن شريكاً', instructor: 'للمدربين', corporate: 'للمؤسسات', help: 'المساعدة', contact: 'تواصل معنا',
    mainNavigation: 'التنقل الرئيسي', selectLanguage: 'اختر اللغة', openMenu: 'افتح القائمة', closeMenu: 'أغلق القائمة',
    accountSignInSubtitle: 'سجّل الدخول لعرض حسابك في MaydanGo.',
    accountSignUpSubtitle: 'أنشئ حساب عضوية MaydanGo.',
    eyebrow: 'حركة أكثر قليلاً، أينما كنت',
    hero: 'اترك مساحة\nللشعور الأفضل.',
    intro: 'عضوية واحدة للحركة في مدينتك وللتوجيه من المنزل. نبنيها مع الأماكن والمدربين والمجتمعات المحلية في أنحاء العراق.',
    explore: 'استكشف العضوية', discover: 'اكتشف ما يناسبك من الحركة', steps: 'طريقة بسيطة لبدء الحركة',
    step1: 'اختر طريقتك', step1d: 'استكشف المرافق والدروس والتدريب القريب، أو ابحث عن جلسات من المنزل.',
    step2: 'اسأل عمّا يناسبك', step2d: 'اطّلع على الخيارات العامة، ثم اسأل فريقنا عن التوفر الحالي وما يتضمنه كل خيار.',
    step3: 'تحرك بإيقاعك', step3d: 'اجعل الحركة جزءاً من أسبوعك، في مكان وإيقاع يناسبانك.',
    step4: 'احجز عند الحاجة', step4d: 'تتطلب بعض الزيارات حجزاً. راجع تفاصيل النشاط قبل الذهاب.',
    step5: 'سجّل الحضور وابدأ الحركة', step5d: 'اتبع تعليمات تسجيل الحضور في التطبيق أو المكان. ويمكنك الانضمام إلى الجلسات عبر الإنترنت من المنزل.',
    faq5: 'كيف أحجز زيارة؟', faq5d: 'استخدم تطبيق MaydanGo للجلسات التي تتطلب حجزاً. راجع تفاصيل الجلسة وموعد إلغاء الحجز أولاً.',
    faq6: 'كيف أسجّل الحضور؟', faq6d: 'اتبع تعليمات تسجيل الحضور الظاهرة في حجزك أو اسأل فريق الشريك في المكان. قد تختلف الطريقة حسب الموقع.',
    faq7: 'هل تتوفر المدفوعات واسترداد الأموال؟', faq7d: 'الدفع غير مفعّل حالياً. لم تُنشر شروط دفع أو استرداد كسياسة سارية؛ تواصل معنا قبل الالتزام.',
    faq8: 'هل يمكنني استخدام الحصص والدورات المسجلة عبر الإنترنت؟', faq8d: 'معلومات الحصص والدورات العامة مخصصة للاستكشاف. دروس الدورات غير منشورة على هذا الموقع، ويتم التحقق من الوصول عبر التطبيق.',
    faq9: 'هل يمكن لمؤسستي ترتيب عضوية؟', faq9d: 'يمكن للمؤسسات إرسال استفسار. يجب تأكيد التوفر وأي مساهمة قبل الالتزام.',
    community: 'الحركة للجميع.',
    communityd: 'من استوديو في أربيل إلى نزهة مسائية في البصرة، للعافية أشكال كثيرة. تجمع MaydanGo المزيد منها في متناولك.',
    local: 'مصممة لأساليب حياة متنوعة', locald: 'اعثر على أماكن مرحبة وإرشاد منزلي في مدن ومناطق وروتينات مختلفة.',
    live: 'فرص متاحة الآن', empty: 'لا توجد فرص مباشرة للعرض حالياً.',
    emptySub: 'ستظهر هنا المواعيد المستقبلية عندما ينشرها الشركاء المعتمدون.',
    loading: 'نتحقق من التوفر الحالي…', error: 'تعذر تحميل التوفر الحالي.',
    retry: 'أعد المحاولة', noInventory: 'لا توجد خيارات مدرجة الآن',
    noInventoryText: 'هذه صورة صادقة للتوفر الحالي. تحقق لاحقاً أو اسألنا عن التحديثات.',
    notCheckout: 'الدفع للعضوية غير متاح. هذه الخيارات نقطة بداية للاستفسار عن التوفر.',
    ask: 'استفسر عن التوفر', getUpdates: 'اطلب التحديثات', exploreFacilities: 'استكشف المرافق',
    exploreOnline: 'استكشف التدريب عبر الإنترنت', currentOfferings: 'الجلسات والفعاليات المتاحة',
    kind: 'النوع', location: 'الموقع', partnerName: 'الجهة المضيفة', starts: 'يبدأ',
    sessionType: 'حصة', eventType: 'فعالية', coachType: 'تدريب',
    physicalType: 'حضوري', premiumType: 'مميز', liveType: 'عبر الإنترنت',
    paidPlan: 'خطة مدفوعة', trialPlan: 'خطة تجريبية', corporatePlan: 'خطة للمؤسسات',
    planCompareTitle: 'قارن ما تتضمنه خطط العضوية',
    planCompareIntro: 'اطلع على حدود الزيارات والأنشطة التي تشملها كل خطة فعالة. لن تُتاح الأسعار أو المشتريات عبر الإنترنت قبل تأكيد إعداد الدفع والشروط.',
    planPriceDeferred: 'الأسعار غير معروضة حالياً. سيظل الدفع والتفعيل عبر الإنترنت مغلقين حتى مرحلة الدفع الأخيرة.',
    planSharedVisits: 'حد الزيارات المشترك', planVisitsByType: 'حدود الزيارات حسب النوع',
    planAccess: 'الوصول المشمول',
    planPhysicalAccess: 'الأنشطة الحضورية', planPremiumAccess: 'الأنشطة المميزة',
    planLiveAccess: 'الحصص المباشرة عبر الإنترنت', planDigitalAccess: 'الدورات الرقمية المسجلة',
    planEventAccess: 'دخول الفعاليات المجانية', planDailyLimit: 'الحد اليومي للزيارات',
    planVisits: 'زيارة', planCancellation: 'مهلة الإلغاء', planDays: 'أيام',
    planIncluded: 'مشمول', planNotIncluded: 'غير مشمول', planConfirm: 'يرجى التأكيد مع MaydanGo',
    planFaqs: 'أسئلة العضوية', planEmptyTitle: 'لا توجد خطط عضوية فعالة حالياً',
    planEmptyBody: 'لم ينشر الفريق خطة للمقارنة العامة بعد. اسأل MaydanGo عن التوفر؛ ولن يؤدي ذلك إلى تفعيل عضوية.',
    planFaqPriceTitle: 'لماذا لا تظهر الأسعار؟',
    planFaqPriceBody: 'الشراء عبر الإنترنت غير متاح حالياً. ستنشر MaydanGo الأسعار المؤكدة قبل تفعيل شراء العضوية.',
    planFaqAccessTitle: 'هل تشمل كل خطة جميع الأنشطة؟',
    planFaqAccessBody: 'لا. تظهر الأنشطة وحدود الزيارات المشمولة في كل خطة؛ كما يعتمد التوفر على المدينة والجهة المقدمة للخدمة.',
    planFaqCancelTitle: 'ماذا أفعل إذا لم تُذكر شروط الإلغاء؟',
    planFaqCancelBody: 'اطلب من فريق MaydanGo تأكيد الشروط المطبقة قبل الحجز أو الالتزام.',
    planFaqPurchaseTitle: 'هل يمكنني شراء الخطة أو تفعيلها هنا؟',
    planFaqPurchaseBody: 'لا. هذه الصفحة للمعلومات والاستفسار فقط؛ ولا تستقبل المدفوعات أو تفعّل العضوية.',
    directions: 'شركاء محليون وهدف مشترك', directionsD: 'نرحب بالأماكن والمدربين الذين يجعلون الحركة مساحة مريحة للجميع.',
    onlineTitle: 'مساحة للحركة من المنزل أيضاً', onlineD: 'تابع الجلسات المباشرة المتاحة عبر الإنترنت، أو اختر إيقاعاً يناسب يومك ومساحتك.',
    homeFirst: 'استوديو قريب أو مساحة في المنزل.', homeFirstD: 'العافية ليست قالباً واحداً. اختر المكان الذي يلائمك اليوم.',
    footerNote: 'عضوية للعافية من العراق، للحياة اليومية.',
    noDestination: 'لم يتم إعداد وجهة التواصل بعد. تحقق لاحقاً من بيانات التواصل المعتمدة.',
    send: 'أرسل استفساراً', formNote: 'سنجهز مسودة بريد إلكتروني لتراجعها. هذا الموقع لا يرسلها ولا يخزنها.',
    learnMore: 'اعرف المزيد', availabilityTitle: 'اسألنا عمّا هو متاح', availabilityD: 'أخبرنا بما تبحث عنه وسنساعدك على فهم الخيارات الحالية.',
    faq1: 'هل MaydanGo متاحة في مدينتي؟', faq1d: 'يعرض دليلنا العام الفرص المستقبلية من الشركاء النشطين والمعتمدين. قد يتغير التوفر إذا لم تظهر منطقتك الآن.',
    faq2: 'هل يمكنني التدريب من المنزل؟', faq2d: 'نعم. قد تظهر الخيارات المباشرة وعبر الإنترنت إلى جانب الجلسات الحضورية عندما ينشرها الشركاء.',
    faq3: 'هل يمكنني شراء عضوية أو تفعيلها هنا؟', faq3d: 'لا. الدفع والتفعيل غير متاحين على هذا الموقع. يمكنك الاستفسار عن التوفر أو طلب التحديثات.',
    faq4: 'من يمكنه المشاركة؟', faq4d: 'تسعى MaydanGo لجعل الحركة مرحبة بأشخاص ذوي روتينات وقدرات وأهداف مختلفة. تحقق من تفاصيل كل جهة قبل الحضور.',
    readDraft: 'مسودة معلوماتية — ليست نصيحة قانونية ولم يراجعها محامٍ.',
    contactUnavailable: 'لم يتم إعداد وجهة تواصل معتمدة.',
    featurePlace: 'اعثر على مكان', featurePlaceD: 'اكتشف الاستوديوهات والمرافق والجلسات المحلية.',
    featureHome: 'تحرك من المنزل', featureHomeD: 'خصص مساحة لروتين يناسب مكانك.',
    featureWelcome: 'مكان مرحب', featureWelcomeD: 'اكتشف خيارات يشكلها الشركاء المحليون.',
    geography: 'بغداد · أربيل · البصرة · ومناطق أخرى', heroStamp: 'إيقاعك ومكانك',
    legalTitle: 'تفاصيل مهمة.', helpTitle: 'معلومات مفيدة.',
    supportStaffSignIn: 'دخول فريق الدعم',
    'page_title:/instructor': 'قدّم التدريب مع MaydanGo',
    'page_description:/instructor': 'استكشف الاستفسار عن تقديم الدورات والجلسات المباشرة. يجب تأكيد الأجور وشروط الدفع قبل أي اتفاق.',
    'page_title:/account': 'حسابك في MaydanGo',
    'page_description:/account': 'راجع عضويتك وحجوزاتك وحدّث تفاصيل حسابك الأساسية بشكل خاص.',
    'page_title:/privacy': 'معلومات الخصوصية | MaydanGo',
    'page_description:/privacy': 'مسودة مبسطة تشرح تعامل MaydanGo مع معلومات الحساب والحجوزات والحضور والدعم والمتصفح.',
    contactTitle: 'لنجد الخطوة التالية المناسبة.', partnerTitle: 'اجعل مكانك جزءاً من الحركة.',
    corporateTitle: 'مساحة أكبر للعافية في العمل.', instructorTitle: 'شاركنا ما تقدمه.',
    partnerIntro: 'تربط MaydanGo الناس بأماكن ومدربين يجعلون العافية أقرب للحياة اليومية. أخبرنا عن عملك لنستكشف فرص التعاون.',
    corporateIntro: 'استكشف طرقاً تساعد فريقك على اكتشاف الحركة المحلية وخيارات المنزل. يمكننا مناقشة ما يناسب مؤسستكم وموقعكم.',
    instructorIntro: 'أخبرنا عن عملك في التدريب أو التعليم. يمكنك الاستفسار عن الدورات أو الجلسات المباشرة؛ ويجب تأكيد الأجور وشروط الدفع قبل أي اتفاق.',
    partnerBullet1: 'شارك جلساتك القادمة مع مجتمع محلي أوسع.',
    partnerBullet2: 'ساعد المزيد من الناس على اكتشاف العمل الذي تقدمه.',
    partnerBullet3: 'ابدأ بحوار دون أن يعني ذلك أي التزام.',
    corporateBullet1: 'حوار يراعي فريقك وسياق مؤسستك.',
    corporateBullet2: 'قد تشمل الخيارات مرافق محلية أو جلسات عبر الإنترنت.',
    corporateBullet3: 'لا يوجد وعد بخطة أو سعر أو تفعيل في هذه الصفحة.',
    instructorBullet1: 'عرّفنا بأسلوبك التدريبي والأشخاص الذين تخدمهم.',
    instructorBullet2: 'استفسر عن إعداد دورة أو تقديم جلسة مباشرة.',
    instructorBullet3: 'الأجور والأهلية وتفاصيل الدفع غير منشورة هنا؛ أكّد الشروط قبل الاتفاق.',
    partnerDetail1: 'انشر معلومات المرافق والجلسات المعتمدة ليكتشفها الأعضاء.',
    partnerDetail2: 'استخدم أدوات الشريك لإدارة الجلسات وتأكيد الحضور بعد الزيارة.',
    partnerDetail3: 'استفسر عن شروط المشاركة والمدفوعات؛ لا تُنشر هنا أسعار أو ضمانات إيراد.',
    corporateDetail1: 'ناقش خيارات للموظفين، بما فيها المرافق المحلية والجلسات عبر الإنترنت عند توفرها.',
    corporateDetail2: 'استفسر عن مساهمة الشركة وإدارة الموارد البشرية واحتياجات التقارير.',
    corporateDetail3: 'يجب تأكيد التوفر والمساهمات وترتيبات التقارير؛ لا يؤدي الاستفسار إلى تفعيل خطة.',
    corporatePortalPrompt: 'هل تلقيت دعوة بصفتك مسؤول موارد بشرية في شركة؟',
    corporatePortalSignIn: 'افتح بوابة الشركات',
    verifiedContinue: 'تابع إلى وجهة الاستفسار المعتمدة.',
    contactTopic: 'ما موضوع استفسارك؟', topicMembership: 'التوفر للعضوية',
    topicPartner: 'استفسار شراكة', topicInstructor: 'استفسار مدرب', topicCorporate: 'استفسار مؤسسة', topicOther: 'موضوع آخر',
    previewEnquiry: 'جهّز مسودة بريد إلكتروني', localFormNotice: 'لم يتم إرسال المعلومات أو تخزينها. استخدم وسيلة التواصل المعتمدة في الصفحة إن توفرت.',
    emailMaydanGo: 'راسل MaydanGo',
    nameLabel: 'اسمك', emailLabel: 'بريدك الإلكتروني', messageLabel: 'رسالتك',
    openEmailDraft: 'افتح مسودة البريد', draftReady: 'مسودة البريد جاهزة للمراجعة.',
    legalWebsite: 'استخدام الموقع', legalWebsiteD: 'تقدم MaydanGo معلومات عن العافية وفرص الحركة. قد يتغير التوفر العام، وينبغي تأكيد التفاصيل مع الجهة المعنية قبل التخطيط.',
    legalMembership: 'العضوية والتوفر', legalMembershipD: 'لا يعالج هذا الموقع المدفوعات ولا يبيع العضويات ولا يفعّل الوصول ولا يضمن مكاناً. الخطط العامة ملخصات فقط. الاستفسار عن التوفر ليس شراءً أو تأكيداً للعضوية.',
    legalPartner: 'الشركاء والجهات المقدمة', legalPartnerD: 'ينشر الشركاء النشطون والمعتمدون الخيارات. يرجى تأكيد الملاءمة والوقت والموقع وتفاصيل الوصول ومتطلبات المشاركة مباشرة قبل الحضور.',
    legalPrivacy: 'ملاحظة الخصوصية', legalPrivacyD: 'قد يعرض الموقع معلومات لازمة لوصف الخيارات العامة. واجهة الاستفسار لا ترسل الرسائل ولا تخزنها. لأسئلة الخصوصية استخدم جهة التواصل المعدة إن توفرت.',
    legalStatus: 'الطبيعة المعلوماتية', legalStatusD: 'هذا المحتوى مسودة معلوماتية فقط، وليس نصيحة قانونية ولا يدعي مراجعة محامٍ له أو اعتماده. ينبغي مراجعته وفق الاختصاصات ذات الصلة قبل استخدامه رسمياً.',
    legalDisclaimer: 'هذا المحتوى مسودة معلوماتية فقط، وليس نصيحة قانونية ولا يدعي مراجعته أو اعتماده من محامٍ.',
    legalPolicyChecklist: 'سياسات بانتظار المراجعة', legalPolicyPending: 'هذه قائمة تجهيز للنشر وليست مجموعة شروط سارية. يحتاج كل بند إلى مراجعة قبل نشره كسياسة.',
    legalPendingLabel: 'غير منشورة كسياسة سارية',
    legalTermsTitle: 'شروط الاستخدام', legalPrivacyTitle: 'سياسة الخصوصية', legalCookiesTitle: 'سياسة ملفات تعريف الارتباط',
    legalBookingTitle: 'سياسة الحجز', legalCancellationTitle: 'سياسة الإلغاء', legalNoShowTitle: 'سياسة عدم الحضور',
    legalRefundTitle: 'سياسة استرداد الأموال', legalPartnerTermsTitle: 'شروط الشركاء', legalCorporateTitle: 'شروط المؤسسات',
    legalCourseTitle: 'سياسة محتوى الدورات',
    durationDays: 'يوماً', place: 'أماكن', placeOne: 'مكان',
    appDownload: 'تابع على جهازك', appDestinationsUnavailable: 'لم يتم إعداد وجهات التطبيق المعتمدة بعد.',
    iosApp: 'افتح MaydanGo لنظام iOS', androidApp: 'افتح MaydanGo لنظام Android',
    regionNote: 'العراق · كردستان · غرب العراق · جنوبه', movementNote: 'الحركة على طريقتك',
  },
  ku: {
    home: 'سەرەتا', how: 'چۆن کار دەکات', plans: 'ئەندامێتی', facilities: 'شوێنەکان', online: 'ڕاهێنانی ئۆنلاین', legal: 'زانیاریی یاسایی', account: 'هەژمارەکەم',
    privacyLink: 'زانیاریی تایبەتمەندی',
    partner: 'بەشداربە', instructor: 'بۆ ڕاهێنەران', corporate: 'بۆ دامەزراوەکان', help: 'یارمەتی', contact: 'پەیوەندی',
    mainNavigation: 'ڕێنمایی سەرەکی', selectLanguage: 'زمان هەڵبژێرە', openMenu: 'کردنەوەی لیست', closeMenu: 'داخستنی لیست',
    accountSignInSubtitle: 'بچۆ ژوورەوە بۆ بینینی هەژماری MaydanGo ـی خۆت.',
    accountSignUpSubtitle: 'هەژماری ئەندامی MaydanGo دروست بکە.',
    eyebrow: 'جووڵەیەکی زیاتر، لە هەر شوێنێک بیت',
    hero: 'شوێنێک دابنێ\nبۆ هەستکردنی باشتر.',
    intro: 'یەک ئەندامێتی بۆ جووڵە لە شارەکەت و ڕێنمایی لە ماڵەوە. لەگەڵ شوێن و ڕاهێنەر و کۆمەڵگە خۆجێییەکان لە سەرانسەری عێراق دروستکراوە.',
    explore: 'ئەندامێتی ببینە', discover: 'جۆری جووڵەی خۆت بدۆزەوە', steps: 'ڕێگایەکی سادە بۆ جووڵە',
    step1: 'ڕێگاکەت هەڵبژێرە', step1d: 'شوێن و وانە و ڕاهێنەری نزیک ببینە، یان وانەیەک بدۆزەوە بۆ ماڵەوە.',
    step2: 'بپرسە چی گونجاوە', step2d: 'هەڵبژاردە گشتییەکان ببینە، پاشان لە تیمەکەمان بپرسە لە بەردەستبوونی ئێستا و ناوەڕۆکی هەر هەڵبژاردەیەک.',
    step3: 'بە خێرایی خۆت بجوڵێ', step3d: 'جووڵە بکە بە بەشێک لە هەفتەکەت، لە شوێن و ڕێتمێک کە گونجاوە.',
    step4: 'ئەگەر پێویست بوو حجز بکە', step4d: 'هەندێک سەردان پێویستیان بە حجز هەیە. پێش چوون وردەکاریی چالاکییەکە ببینە.',
    step5: 'حزوور تۆمار بکە و بجوڵێ', step5d: 'ڕێنمایی تۆمارکردنی حزوور لە ئەپ یان شوێنەکە جێبەجێ بکە. دەتوانیت لە ماڵەوەش بەشداری وانەی ئۆنلاین بکەیت.',
    faq5: 'چۆن سەردانێک حجز بکەم؟', faq5d: 'بۆ وانەیەک کە پێویستی بە حجز هەیە ئەپی MaydanGo بەکاربهێنە. سەرەتا وردەکاریی وانە و دوا کاتی هەڵوەشاندنەوە ببینە.',
    faq6: 'چۆن حزوور تۆمار بکەم؟', faq6d: 'ڕێنمایی تۆمارکردنی حزوور لە حجزەکەت جێبەجێ بکە یان لە تیمی هاوبەش لە شوێنەکە بپرسە. ڕێگا لە شوێنێکەوە بۆ شوێنێکی تر دەگۆڕێت.',
    faq7: 'ئایا پارەدان و گەڕاندنەوەی پارە بەردەستن؟', faq7d: 'پارەدان هێشتا چالاک نییە. مەرجی پارەدان و گەڕاندنەوە وەک سیاسەتی کارپێکراو بڵاونەکراوەتەوە؛ پێش پابەندبوون پەیوەندیمان پێوە بکە.',
    faq8: 'ئایا دەتوانم بەشداری وانەی ئۆنلاین و کۆرسی تۆمارکراو بکەم؟', faq8d: 'زانیاریی گشتیی وانە و کۆرس بۆ دۆزینەوەیە. وانەکانی کۆرس لەم ماڵپەڕە بڵاونەکراونەتەوە؛ دەستڕاگەیشتن لە ئەپدا پشکنین دەکرێت.',
    faq9: 'ئایا دامەزراوەکەم دەتوانێت داوای ئەندامێتی بکات؟', faq9d: 'دامەزراوەکان دەتوانن پرسیارێک بنێرن. پێش پابەندبوون دەبێت بەردەستبوون و هەر بەشدارییەکی دارایی پشتڕاست بکرێتەوە.',
    community: 'جووڵە بۆ هەمووانە.',
    communityd: 'لە ستۆدیۆیەک لە هەولێرەوە تا پیاسەی ئێوارە لە بەسرە، تەندروستی شێوەی زۆری هەیە. MaydanGo زیاتر لەمانە دەخاتە بەردەست.',
    local: 'بۆ شێوازی ژیانی جیاواز', locald: 'شوێنی دڵخواز و ڕێنمایی لە ماڵەوە لە شار و ناوچە و ڕۆتینی جیاوازدا بدۆزەوە.',
    live: 'هەڵبژاردە بەردەستەکان', empty: 'ئێستا هیچ هەڵبژاردەیەکی بەردەست نییە.',
    emptySub: 'کاتێک هاوبەشە پەسەندکراوەکان کاتی داهاتوو بڵاو دەکەنەوە، لێرە دەردەکەوێت.',
    loading: 'بەردەستبوونی ئێستا دەبینین…', error: 'نەتوانرا بەردەستبوونی ئێستا باربکرێت.',
    retry: 'دووبارە هەوڵبدە', noInventory: 'ئێستا هیچ هەڵبژاردەیەک نییە',
    noInventoryText: 'ئەمە وێنەی ڕاستیی بەردەستبوونی ئێستایە. دواتر سەردان بکە یان داوای نوێکاری بکە.',
    notCheckout: 'پارەدان بۆ ئەندامێتی چالاک نییە. ئەم هەڵبژاردانە بۆ پرسیارکردن دەستپێکێکن.',
    ask: 'لە بەردەستبوون بپرسە', getUpdates: 'نوێکاری وەربگرە', exploreFacilities: 'شوێنەکان ببینە',
    exploreOnline: 'ڕاهێنانی ئۆنلاین ببینە', currentOfferings: 'وانە و چالاکییە بەردەستەکان',
    kind: 'جۆر', location: 'شوێن', partnerName: 'لە لایەن', starts: 'دەستپێدەکات',
    sessionType: 'وانە', eventType: 'بۆنە', coachType: 'ڕاهێنان',
    physicalType: 'ڕووبەڕوو', premiumType: 'تایبەت', liveType: 'ئۆنلاین',
    paidPlan: 'پلانی پارەدان', trialPlan: 'پلانی تاقیکردنەوە', corporatePlan: 'پلانی دامەزراوە',
    planCompareTitle: 'بەراوردی دەستگەیشتنی پلانەکانی ئەندامێتی',
    planCompareIntro: 'سنووری سەردان و چالاکییەکانی هەر پلانێکی چالاک ببینە. نرخ و کڕینی ئۆنلاین تا پشتڕاستکردنەوەی پارەدان و مەرجەکان بەردەست نابن.',
    planPriceDeferred: 'نرخەکان ئێستا بڵاوناکرێنەوە. پارەدان و چالاککردنی ئۆنلاین تا قۆناغی کۆتایی پارەدان داخراو دەمێنن.',
    planSharedVisits: 'سنووری سەردانی هاوبەش', planVisitsByType: 'سنووری سەردان بەپێی جۆر',
    planAccess: 'دەستگەیشتنی لەخۆگیراو',
    planPhysicalAccess: 'دەستگەیشتنی ڕووبەڕوو', planPremiumAccess: 'دەستگەیشتنی تایبەت',
    planLiveAccess: 'وانەی ئۆنلاین بەراستەوخۆ', planDigitalAccess: 'کۆرسی دیجیتاڵی تۆمارکراو',
    planEventAccess: 'دەستگەیشتن بە بۆنەی بەخۆڕایی', planDailyLimit: 'سنووری ڕۆژانەی سەردان',
    planVisits: 'سەردان', planCancellation: 'ماوەی ئاگادارکردنەوەی هەڵوەشاندنەوە', planDays: 'ڕۆژ',
    planIncluded: 'لەخۆگیراوە', planNotIncluded: 'لەخۆنەگیراوە', planConfirm: 'لەگەڵ MaydanGo پشتڕاستی بکەرەوە',
    planFaqs: 'پرسیارەکانی ئەندامێتی', planEmptyTitle: 'هێشتا هیچ پلانی ئەندامێتییەکی چالاک نییە',
    planEmptyBody: 'تیمەکە هێشتا پلانێکی بۆ بەراوردی گشتی بڵاونەکردووەتەوە. لە MaydanGo لە بەردەستبوون بپرسە؛ ئەمە ئەندامێتی چالاک ناکات.',
    planFaqPriceTitle: 'بۆچی نرخەکان نیشان نادرێن؟',
    planFaqPriceBody: 'کڕینی ئۆنلاین هێشتا بەردەست نییە. MaydanGo نرخە پشتڕاستکراوەکان بڵاودەکاتەوە پێش چالاککردنی کڕینی ئەندامێتی.',
    planFaqAccessTitle: 'ئایا هەموو پلانێک هەموو چالاکییەکان لەخۆدەگرێت؟',
    planFaqAccessBody: 'نەخێر. چالاکی و سنووری سەردانی هەر پلانێک لەسەر کارتەکەی نووسراوە؛ بەردەستبوونیش بە شار و دابینکەرەوە پەیوەستە.',
    planFaqCancelTitle: 'ئەگەر مەرجی هەڵوەشاندنەوە نەنووسرابوو چی بکەم؟',
    planFaqCancelBody: 'پێش حجزکردن یان پابەندبوون، لە تیمی MaydanGo داوای پشتڕاستکردنەوەی مەرجەکان بکە.',
    planFaqPurchaseTitle: 'دەتوانم لێرە پلانێک بکڕم یان چالاکی بکەم؟',
    planFaqPurchaseBody: 'نەخێر. ئەم پەڕەیە بۆ زانیاری و پرسیارە؛ پارە وەرناگرێت و ئەندامێتی چالاک ناکات.',
    directions: 'هاوبەشانی خۆجێیی، ئامانجی هاوبەش', directionsD: 'پێشوازی لە شوێن و ڕاهێنەر دەکەین کە جووڵە بۆ خەڵک دڵخواز دەکەن.',
    onlineTitle: 'ڕێگایەک بۆ جووڵە لە ماڵەوەش', onlineD: 'بەشداری وانەی ئۆنلاین بکە کاتێک بەردەستە، یان ڕێتمێکی گونجاو بۆ شوێن و ڕۆژەکەت هەڵبژێرە.',
    homeFirst: 'ستۆدیۆیەکی نزیک یان گوشەیەک لە ماڵەوە.', homeFirstD: 'تەندروستی یەک شێوە نییە. ئەو شوێنە هەڵبژێرە کە ئەمڕۆ گونجاوە.',
    footerNote: 'ئەندامێتی تەندروستی لە عێراق بۆ ژیانی ڕۆژانە.',
    noDestination: 'ئەم شوێنەی پەیوەندی هێشتا ڕێکنەخراوە. دواتر زانیاری پەیوەندی پەسەندکراو ببینە.',
    send: 'پرسیارێک بنێرە', formNote: 'ئێمە ڕەشنووسی ئیمەیڵێک بۆت ئامادە دەکەین تا پێداچوونەوەی بۆ بکەیت. ئەم ماڵپەڕە نایەنێرێت و هەڵیناگرێت.',
    learnMore: 'زیاتر بزانە', availabilityTitle: 'لە بەردەستبوون بپرسە', availabilityD: 'بڵێ چی دەگەڕێیت و یارمەتیت دەدەین هەڵبژاردەکانی ئێستا تێبگەیت.',
    faq1: 'MaydanGo لە شارەکەم بەردەستە؟', faq1d: 'کاتالۆگی گشتیی ئێمە هەڵبژاردە داهاتووەکانی هاوبەشانی چالاک و پەسەندکراو پیشان دەدات. بەردەستبوون دەگۆڕێت.',
    faq2: 'دەتوانم لە ماڵەوە ڕاهێنان بکەم؟', faq2d: 'بەڵێ. هەڵبژاردە ئۆنلاین و ڕاستەوخۆکان لەگەڵ وانەی ڕووبەڕوو دەردەکەون کاتێک هاوبەشەکان بڵاویان دەکەنەوە.',
    faq3: 'دەتوانم لێرە ئەندامێتی بکڕم یان چالاکی بکەم؟', faq3d: 'نەخێر. پارەدان و چالاککردن لەم ماڵپەڕەدا چالاک نییە. دەتوانیت لە بەردەستبوون بپرسیت یان نوێکاری داوا بکەیت.',
    faq4: 'کێ دەتوانێت بەشداربێت؟', faq4d: 'MaydanGo هەوڵ دەدات جووڵە بۆ خەڵک بە ڕۆتین و توانایی و ئامانجی جیاواز دڵخواز بکات. پێش چوون وردەکاریی دابینکەر ببینە.',
    readDraft: 'ڕەشنووسی زانیاری — ڕاوێژی یاسایی نییە و لەلایەن پارێزەرەوە پەسەند نەکراوە.',
    contactUnavailable: 'شوێنی پەیوەندی پەسەندکراو ڕێکنەخراوە.',
    featurePlace: 'شوێنێک بدۆزەوە', featurePlaceD: 'ستۆدیۆ و شوێن و وانە خۆجێییەکان ببینە.',
    featureHome: 'لە ماڵەوە بجوڵێ', featureHomeD: 'شوێنێک بۆ ڕۆتینێک دابنێ کە گونجاوە.',
    featureWelcome: 'بەخێربێیت', featureWelcomeD: 'هەڵبژاردەی دروستکراو لەلایەن هاوبەشانی خۆجێیی ببینە.',
    geography: 'بەغدا · هەولێر · بەسرە · و زیاتر', heroStamp: 'ڕێتم و شوێنی تۆ',
    legalTitle: 'وردەکاریی گرنگ.', helpTitle: 'زانیاریی باش.',
    supportStaffSignIn: 'چوونەژوورەوەی تیمی پشتگیری',
    'page_title:/instructor': 'لەگەڵ MaydanGo ڕاهێنان پێشکەش بکە',
    'page_description:/instructor': 'لەبارەی پێشکەشکردنی کۆرس و وانەی ڕاستەوخۆ بپرسە. پێش هەر ڕێککەوتنێک دەبێت کرێ و مەرجی پارەدان پشتڕاست بکرێنەوە.',
    'page_title:/account': 'هەژماری MaydanGo ـی تۆ',
    'page_description:/account': 'ئەندامێتی و حجزەکانت ببینە و وردەکاریی سەرەکیی هەژمارەکەت بە شێوەی تایبەت نوێ بکەرەوە.',
    'page_title:/privacy': 'زانیاریی تایبەتمەندی | MaydanGo',
    'page_description:/privacy': 'ڕەشنووسێکی ئاسان لەبارەی مامەڵەکردنی MaydanGo لەگەڵ زانیاریی هەژمار، حجز، حزوور، پشتگیری و وێبگەڕ.',
    contactTitle: 'با هەنگاوی داهاتوو بدۆزینەوە.', partnerTitle: 'شوێنەکەت ببە بەشێک لە جووڵە.',
    corporateTitle: 'شوێنێکی زیاتر بۆ تەندروستی لە کاردا.', instructorTitle: 'باسی ئەوە بکە فێری چی دەکەیت.',
    partnerIntro: 'MaydanGo خەڵک دەبەستێتەوە بە شوێن و ڕاهێنەر کە تەندروستی دەهێنێتە نزیک ژیانی ڕۆژانە. باسی کارەکەت بکە تا گونجاوی هاوکاری ببینین.',
    corporateIntro: 'ڕێگا بدۆزەرەوە بۆ ئەوەی جووڵەی خۆجێیی و هەڵبژاردەی ماڵەوە بۆ تیمەکەت ئاسانتر بێت. دەتوانین لەسەر گونجاوی دامەزراوە و شوێنەکەت گفتوگۆ بکەین.',
    instructorIntro: 'باسی کاری ڕاهێنان یان وانەوتنەوەکەت بکە. دەتوانیت لەبارەی کۆرس یان وانەی ڕاستەوخۆ بپرسی؛ پێش هەر ڕێککەوتنێک دەبێت کرێ و مەرجی پارەدان پشتڕاست بکرێنەوە.',
    partnerBullet1: 'وانە داهاتووەکانت لەگەڵ کۆمەڵگەیەکی خۆجێی فراوانتر هاوبەش بکە.',
    partnerBullet2: 'یارمەتی خەڵکی زیاتر بدە کاری ئێستات بدۆزنەوە.',
    partnerBullet3: 'بە گفتوگۆ دەستپێبکە، بەبێ ئەوەی پابەندی دروست بێت.',
    corporateBullet1: 'گفتوگۆیەک بەپێی تیم و بارودۆخی دامەزراوەکەت.',
    corporateBullet2: 'هەڵبژاردەکان لەوانەیە شوێنی خۆجێیی یان وانەی ئۆنلاین بگرنەوە.',
    corporateBullet3: 'لەم پەڕەیەدا هیچ پلان و نرخ و چالاککردنێک بەڵێن نادرێت.',
    instructorBullet1: 'ڕێگای ڕاهێنان و ئەو کەسانە بناسێنە کە خزمەتیان دەکەیت.',
    instructorBullet2: 'لەبارەی دروستکردنی کۆرس یان پێشکەشکردنی وانەیەکی ڕاستەوخۆ بپرسە.',
    instructorBullet3: 'کرێ، شایستەیی و وردەکاریی پارەدان لێرە بڵاونەکراونەتەوە؛ پێش ڕێککەوتن مەرجەکان پشتڕاست بکەوە.',
    partnerDetail1: 'زانیاریی شوێن و وانەی پەسەندکراو بڵاو بکەرەوە تا ئەندامان بیبینن.',
    partnerDetail2: 'ئامرازەکانی هاوبەش بەکاربهێنە بۆ بەڕێوەبردنی وانە و پشتڕاستکردنەوەی حزوور دوای سەردان.',
    partnerDetail3: 'لەبارەی مەرجی بەشداری و پارەدان بپرسە؛ نرخ یان داهاتی دڵنیایی لەم پەڕەیەدا بڵاونەکراوەتەوە.',
    corporateDetail1: 'لەبارەی هەڵبژاردە بۆ کارمەندان گفتوگۆ بکە، لەوانە شوێنی خۆجێیی و وانەی ئۆنلاین کاتێک بەردەستە.',
    corporateDetail2: 'لەبارەی بەشداریی کۆمپانیا، بەڕێوەبردنی HR و پێویستییەکانی ڕاپۆرت بپرسە.',
    corporateDetail3: 'بەردەستبوون، بەشداری و ڕێککەوتنی ڕاپۆرت پێویستی بە پشتڕاستکردنەوە هەیە؛ پرسیارکردن پلان چالاک ناکات.',
    corporatePortalPrompt: 'ئایا وەک بەڕێوەبەری HR ـی کۆمپانیا بانگهێشت کراویت؟',
    corporatePortalSignIn: 'کردنەوەی پۆرتاڵی کۆمپانیا',
    verifiedContinue: 'بەردەوامبە بۆ شوێنی پرسیاری پەسەندکراو.',
    contactTopic: 'پرسیارەکەت لەسەر چییە؟', topicMembership: 'بەردەستبوونی ئەندامێتی',
    topicPartner: 'پرسیاری هاوبەشی', topicInstructor: 'پرسیاری ڕاهێنەر', topicCorporate: 'پرسیاری دامەزراوە', topicOther: 'شتێکی تر',
    previewEnquiry: 'ڕەشنووسی ئیمەیڵێک ئامادە بکە', localFormNotice: 'هیچ زانیارییەک نەنێردرا و هەڵنەگیرا. ئەگەر هەیە، ڕێگای پەیوەندی پەسەندکراوی ئەم پەڕەیە بەکاربهێنە.',
    emailMaydanGo: 'ئیمەیڵ بۆ MaydanGo',
    nameLabel: 'ناوت', emailLabel: 'ئیمەیڵەکەت', messageLabel: 'پەیامەکەت',
    openEmailDraft: 'کردنەوەی ڕەشنووسی ئیمەیڵ', draftReady: 'ڕەشنووسی ئیمەیڵ بۆ پێداچوونەوە ئامادەیە.',
    legalWebsite: 'بەکارهێنانی ماڵپەڕ', legalWebsiteD: 'MaydanGo زانیاری لەسەر تەندروستی و هەڵبژاردەی جووڵە پێشکەش دەکات. بەردەستبوونی گشتی لەوانەیە بگۆڕێت؛ پێش پلان دانان وردەکاری لەگەڵ دابینکەری پەیوەندیدار پشتڕاست بکەرەوە.',
    legalMembership: 'ئەندامێتی و بەردەستبوون', legalMembershipD: 'ئەم ماڵپەڕە پارەدان ناکات، ئەندامێتی نافرۆشێت، دەستگەیشتن چالاک ناکات و شوێنێک مسۆگەر ناکات. پلانە گشتییەکان تەنها پوختەیە. پرسیارکردن لە بەردەستبوون بە مانای کڕین یان پشتڕاستکردنەوەی ئەندامێتی نییە.',
    legalPartner: 'هاوبەش و دابینکەران', legalPartnerD: 'هەڵبژاردەکان لەلایەن هاوبەشانی چالاک و پەسەندکراوەوە بڵاو دەکرێنەوە. تکایە پێش بەشداری گونجاوی، کات، شوێن، وردەکاریی دەستگەیشتن و داواکارییەکان لەگەڵ دابینکەر پشتڕاست بکەرەوە.',
    legalPrivacy: 'تێبینی تایبەتمەندی', legalPrivacyD: 'ئەم ماڵپەڕە لەوانەیە زانیاریی پێویست بۆ وەسفکردنی هەڵبژاردە گشتییەکان پیشان بدات. ڕووکاری پرسیار پەیام نانێرێت و هەڵیناگرێت. بۆ پرسیاری تایبەتمەندی ئەگەر هەبوو ڕێگای پەیوەندی ڕێکخراو بەکاربهێنە.',
    legalStatus: 'بارودۆخی زانیاری', legalStatusD: 'ئەم ناوەڕۆکە تەنها ڕەشنووسی زانیارییە. ڕاوێژی یاسایی نییە و بانگەشەی پەسەندکردن یان پێداچوونەوەی پارێزەر ناکات. پێش بەکارهێنانی فەرمی، بەپێی دادوەریی پەیوەندیدار پێداچوونەوەی بۆ بکرێت.',
    legalDisclaimer: 'ئەم ناوەڕۆکە تەنها ڕەشنووسی زانیارییە، ڕاوێژی یاسایی نییە و بانگەشەی پێداچوونەوە یان پەسەندکردنی پارێزەر ناکات.',
    legalPolicyChecklist: 'سیاسەتەکان چاوەڕێی پێداچوونەوەن', legalPolicyPending: 'ئەمە تەنها لیستی ئامادەکاریی بڵاوکردنەوەیە، نەک کۆمەڵێک مەرجی کارپێکراو. هەر بابەتێک پێویستی بە پێداچوونەوە هەیە پێش ئەوەی وەک سیاسەت بڵاو بکرێتەوە.',
    legalPendingLabel: 'وەک سیاسەتی کارپێکراو بڵاونەکراوەتەوە',
    legalTermsTitle: 'مەرجەکانی بەکارهێنان', legalPrivacyTitle: 'سیاسەتی تایبەتمەندی', legalCookiesTitle: 'سیاسەتی کوکی',
    legalBookingTitle: 'سیاسەتی حجزکردن', legalCancellationTitle: 'سیاسەتی هەڵوەشاندنەوە', legalNoShowTitle: 'سیاسەتی نەهاتن',
    legalRefundTitle: 'سیاسەتی گەڕاندنەوەی پارە', legalPartnerTermsTitle: 'مەرجەکانی هاوبەش', legalCorporateTitle: 'مەرجەکانی دامەزراوە',
    legalCourseTitle: 'سیاسەتی ناوەڕۆکی کۆرس',
    durationDays: 'ڕۆژ', place: 'شوێن', placeOne: 'شوێن',
    appDownload: 'لەسەر ئامێرەکەت بەردەوامبە', appDestinationsUnavailable: 'شوێنی پەسەندکراوی ئەپ هێشتا ڕێکنەخراوە.',
    iosApp: 'MaydanGo بۆ iOS بکەرەوە', androidApp: 'MaydanGo بۆ Android بکەرەوە',
    regionNote: 'عێراق · کوردستان · ڕۆژئاوا · باشوور', movementNote: 'جووڵە بە شێوازی خۆت',
  }
};

const translations: Record<Language, Copy> = {
  en: { ...legacyTranslations.en, ...(approvedCopy.en as Copy) },
  ar: { ...legacyTranslations.ar, ...(approvedCopy.ar as Copy) },
  ku: { ...legacyTranslations.ku, ...(approvedCopy.ku as Copy) },
};

function savedLanguage(): Language {
  const value = localStorage.getItem('maydango-language');
  return value === 'ar' || value === 'ku' ? value : 'en';
}

function countUnit(count: number, kind: 'days' | 'places', language: Language, t: Copy) {
  if (language === 'ar') {
    const plural = new Intl.PluralRules('ar').select(count);
    if (kind === 'days') return plural === 'few' ? 'أيام' : t.durationDays;
    return plural === 'few' || plural === 'zero' ? t.place : t.placeOne;
  }
  if (kind === 'places') {
    if (language === 'ku') return t.placeOne;
    return count === 1 ? t.placeOne : t.place;
  }
  return t.durationDays;
}

const routes = [
  ['/', 'home'], ['/how-it-works', 'how'], ['/membership-plans', 'plans'], ['/facilities', 'facilities'], ['/events', 'events'],
  ['/online-training', 'online'], ['/partner', 'partner'], ['/instructor', 'instructor'], ['/corporate', 'corporate'], ['/help', 'help'],
  ['/contact', 'contact'], ['/legal', 'legal'], ['/account', 'account'],
] as const;

function destination(key: string) {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key]?.trim() || '';
}

function verifiedHttpsDestination(key: string) {
  const value = destination(key);
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function Layout({ children, language, setLanguage }: { children: ReactNode; language: Language; setLanguage: (language: Language) => void }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = translations[language];
  const rtl = language !== 'en';
  useEffect(() => {
    const hasRouteCopy = Object.prototype.hasOwnProperty.call(t, `page_title:${location}`);
    const title = hasRouteCopy ? t[`page_title:${location}`] : t.not_found_title;
    const pageDescription = hasRouteCopy ? t[`page_description:${location}`] : t.not_found_description;
    document.title = title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', pageDescription);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', pageDescription);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', pageDescription);
    const hostname = window.location.hostname;
    const isPreviewHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.replit.dev');
    if (!isPreviewHost) {
      const canonicalUrl = new URL(window.location.pathname, window.location.origin).href;
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
      let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
      if (!ogUrl) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
      }
      ogUrl.content = canonicalUrl;
    }
    document.documentElement.lang = language === 'ku' ? 'ckb' : language;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('rtl-copy', rtl);
    localStorage.setItem('maydango-language', language);
    window.dispatchEvent(new Event('maydango-language-change'));
  }, [location, language, rtl]);

  const changeLanguage = (value: Language) => setLanguage(value);
  return (
    <div className={`site-shell ${rtl ? 'rtl-copy' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="bg-[#174e43] px-5 py-2 text-center text-[11px] font-semibold tracking-[.12em] text-[#f4ead6]">
        <span>{t.regionNote}</span>
        <span className="mx-3 opacity-40">/</span>
        <span>{t.movementNote}</span>
      </div>
      <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10 lg:px-14">
        <Link href="/" className="group flex items-center gap-2.5 text-foreground" aria-label={t.brand_home_accessible_label} data-testid="link-brand-home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-background transition-transform group-hover:rotate-[-8deg]">
            <span className="block h-[17px] w-[17px] rounded-full border-[2px] border-current border-t-transparent rotate-[-35deg]" />
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-[-.07em]">maydan<span className="text-primary">go</span></span>
        </Link>
        <nav className="hidden items-center gap-6 xl:flex" aria-label={t.mainNavigation}>
          {routes.slice(1, 6).map(([href, key]) => <NavLink key={href} href={href} active={location === href}>{key === 'legal' ? key : t[key]}</NavLink>)}
          <details className="group relative">
            <summary className="nav-link flex cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-foreground/75 hover:text-foreground" data-testid="button-more-navigation">
              {t.more_navigation} <ChevronDown size={14} />
            </summary>
            <div className="invisible absolute end-0 top-full mt-3 min-w-44 rounded-xl border border-border bg-card p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 group-open:visible group-open:opacity-100">
              {routes.slice(6).map(([href, key]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-muted" data-testid={`link-nav-${key}`}>{t[key] || key}</Link>)}
            </div>
          </details>
        </nav>
        <div className="hidden items-center gap-4 xl:flex">
          <LanguageSelect language={language} onChange={changeLanguage} t={t} />
          <Link href="/membership-plans" className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground transition hover:-translate-y-0.5" data-testid="link-membership-header">{t.explore}</Link>
        </div>
        <div className="flex items-center gap-3 xl:hidden">
          <LanguageSelect language={language} onChange={changeLanguage} compact t={t} />
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card" aria-label={menuOpen ? t.closeMenu : t.openMenu} aria-expanded={menuOpen} data-testid="button-mobile-menu">
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>
      {menuOpen && <nav className="relative z-20 mx-5 mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-3 shadow-lg xl:hidden" aria-label={t.mainNavigation}>
        {routes.map(([href, key]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`rounded-xl px-3 py-3 text-sm font-semibold ${location === href ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} data-testid={`link-mobile-${key}`}>{t[key] || key}</Link>)}
      </nav>}
      <main>{children}</main>
      <Footer t={t} />
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className="nav-link text-[13px] font-semibold text-foreground/75 transition hover:text-foreground" aria-current={active ? 'page' : undefined} data-testid={`link-nav-${href.replaceAll('/', '') || 'home'}`}>{children}</Link>;
}

function LanguageSelect({ language, onChange, compact = false, t }: { language: Language; onChange: (language: Language) => void; compact?: boolean; t: Copy }) {
  return <label className="flex items-center gap-1.5 text-xs font-bold text-foreground/70" aria-label={t.selectLanguage}>
    {!compact && <Globe2 size={15} />}
    <select value={language} onChange={e => onChange(e.target.value as Language)} className="max-w-[112px] cursor-pointer border-0 bg-transparent py-2 text-xs font-bold text-foreground outline-none" data-testid="select-language">
      <option value="en">EN</option><option value="ar">العربية</option><option value="ku">کوردی</option>
    </select>
  </label>;
}

function Footer({ t }: { t: Copy }) {
  return <footer className="bg-[#123d36] text-[#f4ead6]">
    <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-10 lg:px-14">
      <div>
        <Link href="/" className="font-display text-[26px] font-extrabold tracking-[-.07em]" data-testid="link-footer-brand">maydan<span className="text-[#ef9d72]">go</span></Link>
        <p className="mt-4 max-w-xs text-sm leading-6 text-[#f4ead6]/70">{t.footerNote}</p>
        <p className="mt-7 text-[10px] font-semibold tracking-[.16em] text-[#f4ead6]/45">{t.footer_tagline}</p>
      </div>
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[.16em] text-[#ef9d72]">{t.learnMore}</h2>
        <div className="mt-4 grid gap-3 text-sm text-[#f4ead6]/80">
          {routes.slice(1, 6).map(([href, key]) => <Link key={href} href={href} className="w-fit hover:text-white" data-testid={`link-footer-${key}`}>{t[key]}</Link>)}
        </div>
      </div>
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[.16em] text-[#ef9d72]">{t.contact}</h2>
        <div className="mt-4 grid gap-3 text-sm text-[#f4ead6]/80">
          {routes.slice(6).map(([href, key]) => <Link key={href} href={href} className="w-fit hover:text-white" data-testid={`link-footer-${key}`}>{t[key] || key}</Link>)}
          <Link href="/privacy" className="w-fit hover:text-white" data-testid="link-footer-privacy">{t.privacyLink}</Link>
        </div>
      </div>
    </div>
    <div className="border-t border-white/10 px-5 py-4 text-center text-[11px] text-[#f4ead6]/55">© {new Date().getFullYear()} MaydanGo · {t.readDraft}</div>
  </footer>;
}

function PageWrap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1440px] px-5 md:px-10 lg:px-14 ${className}`}>{children}</div>;
}

function SectionKicker({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] ${light ? 'text-[#f0a17c]' : 'text-primary'}`}><span className="h-px w-7 bg-current" />{children}</p>;
}

function ActionLink({ href, children, light = false, testId }: { href: string; children: ReactNode; light?: boolean; testId?: string }) {
  return <Link href={href} className={`group inline-flex items-center gap-3 rounded-full px-6 py-3.5 text-sm font-bold transition hover:-translate-y-0.5 ${light ? 'bg-[#f2a17c] text-[#173e37] hover:bg-[#f7b497]' : 'bg-primary text-primary-foreground hover:brightness-110'}`} data-testid={testId}>
    {children}<ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
  </Link>;
}

function HomePage({ t, language }: { t: Copy; language: Language }) {
  return <>
    <section className="relative mx-3 overflow-hidden rounded-[2rem] bg-[#174e43] text-[#f4ead6] md:mx-6">
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid min-h-[600px] max-w-[1440px] items-center gap-10 px-7 py-16 md:min-h-[670px] md:grid-cols-[1.05fr_.95fr] md:px-12 lg:px-20">
        <div className="relative z-10 rise-in">
          <SectionKicker light>{t.eyebrow}</SectionKicker>
          <h1 className="font-display max-w-[680px] whitespace-pre-line text-[clamp(3.6rem,8vw,7.5rem)] font-extrabold leading-[.91] tracking-[-.075em]">{t.hero}</h1>
          <p className="mt-7 max-w-[490px] text-[16px] leading-7 text-[#f4ead6]/75">{t.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ActionLink href="/membership-plans" light testId="link-hero-membership">{t.explore}</ActionLink>
            <Link href="/how-it-works" className="inline-flex items-center gap-2 px-2 py-3 text-sm font-semibold text-[#f4ead6]/85 hover:text-white" data-testid="link-hero-how">{t.how}<ArrowDown size={15} /></Link>
          </div>
          <div className="mt-12 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[.13em] text-[#f4ead6]/55">
            <span className="h-px w-10 bg-[#ef9d72]" /> {t.geography}
          </div>
        </div>
      <HeroArtwork label={t.heroStamp} />
      </div>
      <div className="absolute bottom-6 end-7 hidden text-[10px] font-semibold tracking-[.17em] text-[#f4ead6]/40 md:block">36°11' N / 44°00' E</div>
    </section>
    <PageWrap className="py-24 md:py-32">
      <div className="grid gap-12 md:grid-cols-[.75fr_1fr] md:items-end">
        <div><SectionKicker>{t.local}</SectionKicker><h2 className="font-display max-w-xl text-4xl font-bold leading-[1.08] tracking-[-.055em] md:text-6xl">{t.homeFirst}</h2></div>
        <div className="max-w-xl md:justify-self-end"><p className="text-lg leading-8 text-foreground/65">{t.homeFirstD}</p><div className="mt-6 flex flex-wrap gap-3"><ActionLink href="/facilities" testId="link-home-facilities">{t.exploreFacilities}</ActionLink><Link href="/online-training" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3.5 text-sm font-bold hover:bg-muted" data-testid="link-home-online">{t.exploreOnline}<ArrowUpRight size={15} /></Link></div></div>
      </div>
      <div className="mt-16 grid border-y border-border md:grid-cols-3">
        {[{icon: <MapPin />, title: t.featurePlace, body: t.featurePlaceD}, {icon: <House />, title: t.featureHome, body: t.featureHomeD}, {icon: <HeartHandshake />, title: t.featureWelcome, body: t.featureWelcomeD}].map((item, i) => <div className={`py-8 md:px-7 ${i ? 'border-t border-border md:border-s-0 md:border-t-0 md:border-s' : ''}`} key={item.title}><div className="mb-6 text-primary">{item.icon}</div><h3 className="font-display text-2xl font-bold tracking-[-.04em]">{item.title}</h3><p className="mt-2 max-w-[250px] text-sm leading-6 text-foreground/60">{item.body}</p></div>)}
      </div>
    </PageWrap>
    <section className="bg-[#eadfcd] py-20 md:py-28">
      <PageWrap>
        <div className="grid gap-12 md:grid-cols-[.8fr_1fr]">
          <div><SectionKicker>{t.steps}</SectionKicker><h2 className="font-display max-w-md text-4xl font-bold leading-[1.07] tracking-[-.06em] md:text-6xl">{t.community}</h2><p className="mt-5 max-w-md leading-7 text-foreground/65">{t.communityd}</p></div>
          <div className="grid gap-0">
            {[[t.step1, t.step1d], [t.step2, t.step2d], [t.step3, t.step3d], [t.step4, t.step4d], [t.step5, t.step5d]].map(([title, description], i) => <article key={title} className="flex gap-5 border-b border-foreground/15 py-5 first:border-t">
              <span className="font-mono text-xs text-primary">0{i + 1}</span><div><h3 className="font-display text-xl font-bold tracking-[-.03em]">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-foreground/60">{description}</p></div><ArrowRight className="ms-auto mt-1 shrink-0 text-primary" size={16} />
            </article>)}
          </div>
        </div>
      </PageWrap>
    </section>
    <PublicHomeShowcase language={language} />
    <AppDownloadLinks t={t} />
    <section className="mx-3 mb-3 rounded-[2rem] bg-[#e98960] px-6 py-14 text-[#173e37] md:mx-6 md:px-14 md:py-20">
      <PageWrap className="!px-0">
        <div className="grid gap-9 md:grid-cols-[1fr_auto] md:items-center">
          <div><SectionKicker>{t.directions}</SectionKicker><h2 className="font-display max-w-2xl text-4xl font-extrabold leading-[1.02] tracking-[-.065em] md:text-6xl">{t.directionsD}</h2></div>
          <ActionLink href="/partner" testId="link-home-partner">{t.partner}</ActionLink>
        </div>
      </PageWrap>
    </section>
  </>;
}

function HeroArtwork({ label }: { label: string }) {
  return <div className="relative mx-auto aspect-square w-full max-w-[570px]">
    <div className="absolute inset-[7%] rounded-full bg-[#ef9d72]" />
    <div className="hero-orbit inset-[0%] rotate-[-24deg]" />
    <div className="hero-orbit inset-[12%] rotate-[35deg]" />
    <div className="absolute inset-[16%] overflow-hidden rounded-[48%_52%_40%_60%] bg-[#dcaa70]">
      <div className="absolute bottom-[-9%] start-[-10%] h-[61%] w-[130%] rotate-[-14deg] rounded-[50%] bg-[#d8805e]" />
      <div className="absolute bottom-[5%] end-[-15%] h-[36%] w-[120%] rotate-[12deg] rounded-[50%] bg-[#a85f4f]" />
      <div className="absolute bottom-0 start-[28%] h-[68%] w-[44%] rounded-t-[48%] bg-[#f0ce9b]" />
      <div className="absolute bottom-[31%] start-[41%] h-[33%] w-[18%] rounded-[45%] bg-[#234f44]" />
      <div className="absolute bottom-[48%] start-[38%] h-[15%] w-[24%] rounded-full bg-[#173e37]" />
      <div className="absolute bottom-[22%] start-[20%] h-[34%] w-[30%] rotate-[-24deg] rounded-[50%] bg-[#f4ead6]" />
      <div className="absolute bottom-[22%] end-[17%] h-[36%] w-[30%] rotate-[22deg] rounded-[50%] bg-[#ef9d72]" />
    </div>
    <div className="absolute end-[3%] top-[17%] rounded-full border border-[#f4ead6]/45 bg-[#174e43] px-4 py-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#f4ead6] rotate-[9deg]">{label}</div>
    <div className="absolute bottom-[8%] start-[2%] flex h-16 w-16 items-center justify-center rounded-full bg-[#f2d07d] text-[#174e43] shadow-lg"><Play size={21} fill="currentColor" /></div>
    <span className="absolute start-[16%] top-[11%] h-3 w-3 rounded-full bg-[#f2d07d]" />
    <span className="absolute end-[15%] bottom-[14%] h-2 w-2 rounded-full bg-[#f4ead6]" />
  </div>;
}

function OfferingCards({ offerings, language, loading, error, retry, t, compact = false }: { offerings: PublicOffering[]; language: Language; loading: boolean; error: boolean; retry: () => void; t: Copy; compact?: boolean }) {
  if (loading) return <div className={`mt-8 grid gap-4 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`} aria-label={t.loading} aria-live="polite">{[1, 2, 3].slice(0, compact ? 2 : 3).map(n => <div key={n} className="h-52 animate-pulse rounded-2xl border border-border bg-muted/70" />)}</div>;
  if (error) return <div className="mt-8 rounded-2xl border border-[#bd8065]/30 bg-[#f2e4d6] p-6" role="alert"><p className="font-semibold">{t.error}</p><button onClick={retry} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="button-retry-catalog"><RotateCw size={14} />{t.retry}</button></div>;
  if (!offerings.length) return <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/65 px-6 py-10 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"><CalendarDays size={21} /></div><p className="font-display text-xl font-bold">{compact ? t.empty : t.noInventory}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{compact ? t.emptySub : t.noInventoryText}</p>
  </div>;
  return <div className={`mt-8 grid gap-4 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
    {offerings.map(item => <article key={item.id} className="offering-card rounded-2xl border border-border bg-card p-5" data-testid={`card-offering-${item.id}`}>
      <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-[#e7efe8] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-primary">{item.category}</span><span className="text-xs font-semibold text-foreground/45">{item.remaining} {countUnit(item.remaining, 'places', language, t)}</span></div>
      <h3 className="mt-5 font-display text-2xl font-bold leading-tight tracking-[-.04em]">{item.title}</h3>
       <p className="mt-2 text-sm text-foreground/55">{item.kind === 'session' ? t.sessionType : item.kind === 'event' ? t.eventType : t.coachType} · {item.accessType === 'physical' ? t.physicalType : item.accessType === 'premium' ? t.premiumType : t.liveType}</p>
      <div className="mt-5 grid gap-2 border-t border-border pt-4 text-xs text-foreground/65">
        <p className="flex items-center gap-2"><MapPin size={14} className="text-primary" />{item.facility}, {item.city}</p>
         <p className="flex items-center gap-2"><Clock3 size={14} className="text-primary" />{new Date(item.startsAt).toLocaleString(language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ckb-IQ' : 'en-IQ', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' })}</p>
        <p className="flex items-center gap-2"><Users size={14} className="text-primary" />{item.partnerName}</p>
      </div>
    </article>)}
  </div>;
}

function PageHero({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <section className="relative overflow-hidden bg-[#174e43] py-16 text-[#f4ead6] md:py-24">
    <div className="absolute -end-10 -top-28 h-80 w-80 rounded-full border border-white/10" /><div className="absolute -end-2 -top-20 h-64 w-64 rounded-full border border-white/10" />
    <PageWrap className="relative"><SectionKicker light>{kicker}</SectionKicker><h1 className="font-display max-w-4xl text-5xl font-extrabold leading-[.98] tracking-[-.07em] md:text-7xl">{title}</h1><p className="mt-6 max-w-2xl text-base leading-7 text-[#f4ead6]/70 md:text-lg">{description}</p></PageWrap>
  </section>;
}

function HowPage({ t }: { t: Copy }) {
  return <>
    <PageHero kicker={t.how} title={t.steps} description={t.intro} />
    <PageWrap className="py-16 md:py-24">
      <div className="grid gap-12 md:grid-cols-[.75fr_1fr]">
        <div><SectionKicker>{t.local}</SectionKicker><h2 className="font-display text-4xl font-bold leading-tight tracking-[-.05em] md:text-5xl">{t.community}</h2><p className="mt-5 leading-7 text-foreground/65">{t.communityd}</p></div>
        <div className="grid gap-4">
          {[{num:'01', title:t.step1, text:t.step1d, icon:<MapPin />}, {num:'02', title:t.step2, text:t.step2d, icon:<Sparkles />}, {num:'03', title:t.step3, text:t.step3d, icon:<Dumbbell />}, {num:'04', title:t.step4, text:t.step4d, icon:<CalendarDays />}, {num:'05', title:t.step5, text:t.step5d, icon:<Check />}].map(s => <article key={s.num} className="flex gap-5 rounded-2xl border border-border bg-card p-6 md:p-7"><span className="font-mono text-xs text-primary">{s.num}</span><div className="flex-1"><span className="text-primary">{s.icon}</span><h3 className="mt-4 font-display text-2xl font-bold">{s.title}</h3><p className="mt-2 text-sm leading-6 text-foreground/60">{s.text}</p></div></article>)}
        </div>
      </div>
      <div className="mt-16 rounded-[2rem] bg-[#eadfcd] p-8 md:flex md:items-center md:justify-between md:p-12"><div><SectionKicker>{t.notCheckout}</SectionKicker><h2 className="font-display text-3xl font-bold tracking-tight">{t.availabilityTitle}</h2></div><ActionLink href="/membership-plans" testId="link-how-plans">{t.ask}</ActionLink></div>
    </PageWrap>
  </>;
}

function PlansPage({ t, language }: { t: Copy; language: Language }) {
  const plansQuery = useGetPublicPlans({ query: { queryKey: getGetPublicPlansQueryKey() } });
  const plans = useMemo(() => [...(plansQuery.data || [])].sort((a, b) => {
    const order: Record<string, number> = { M: 0, L: 1, XL: 2 };
    return (order[a.tier] ?? 3) - (order[b.tier] ?? 3) || a.name.localeCompare(b.name);
  }), [plansQuery.data]);
  const number = (value: number) => new Intl.NumberFormat(language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ').format(value);
  return <>
    <PageHero kicker={t.plans} title={t.planCompareTitle} description={t.planCompareIntro} />
    <PageWrap className="py-14 md:py-20">
      <div className="mb-8 flex items-start gap-3 rounded-2xl border border-[#dcaf82]/50 bg-[#f1e6d6] p-5 text-sm leading-6 text-foreground/75">
        <CircleHelp className="mt-0.5 shrink-0 text-primary" size={19} />
        <div><p>{t.notCheckout}</p><p className="mt-1 font-semibold">{t.planPriceDeferred}</p></div>
      </div>
      {plansQuery.isLoading ? <div className="grid gap-4 md:grid-cols-3" aria-label={t.loading}>{[1,2,3].map(i => <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />)}</div>
        : plansQuery.isError ? <ErrorState text={t.error} retry={() => plansQuery.refetch()} t={t} />
           : plans.length ? <section aria-label={t.planCompareTitle} data-testid="section-membership-plan-comparison" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
               {plans.map((plan: PublicPlan) => {
                 const access = plan.access;
                 const allowances = access.quotaMode === 'shared'
                   ? [{ key: 'shared', label: t.planSharedVisits, count: access.sharedVisits }]
                   : [
                       { key: 'physical', label: t.planPhysicalAccess, count: access.physicalVisits },
                       { key: 'premium', label: t.planPremiumAccess, count: access.premiumVisits },
                       { key: 'live', label: t.planLiveAccess, count: access.liveClassVisits },
                     ];
                 const features = [
                   { key: 'physical', label: t.planPhysicalAccess, included: access.physicalAccess },
                   { key: 'premium', label: t.planPremiumAccess, included: access.premiumAccess },
                   { key: 'live', label: t.planLiveAccess, included: access.liveClassAccess },
                   { key: 'courses', label: t.planDigitalAccess, included: access.digitalCourseAccess },
                   { key: 'events', label: t.planEventAccess, included: access.eventAccess },
                 ];
                 const description = access.localizedDescription?.[language]?.trim();
                 return <article key={plan.id} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm" data-testid={`card-plan-${plan.id}`}>
                   <span className="w-fit rounded-full bg-[#e7efe8] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-primary">{plan.kind === 'paid' ? t.paidPlan : plan.kind === 'trial' ? t.trialPlan : t.corporatePlan} · {plan.tier}</span>
                   <h2 className="mt-5 font-display text-3xl font-bold tracking-[-.05em]" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h2>
                   <p className="mt-2 text-sm text-foreground/60">{plan.durationDays} {countUnit(plan.durationDays, 'days', language, t)}</p>
                   {description ? <p className="mt-4 text-sm leading-6 text-foreground/70">{description}</p> : null}

                   <div className="mt-6 rounded-xl bg-[#f7f4eb] p-4">
                     <p className="text-xs font-bold uppercase tracking-[.12em] text-primary">{t.planVisitsByType}</p>
                     <dl className="mt-3 space-y-2">
                       {allowances.map(({ key, label, count }) => count === null ? null : <div key={key} className="flex items-baseline justify-between gap-3 text-sm" data-testid={`row-plan-allowance-${plan.id}-${key}`}>
                         <dt className="text-foreground/70">{label}</dt>
                         <dd className="font-bold text-foreground">{number(count)} {t.planVisits}</dd>
                       </div>)}
                       <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-2 text-sm" data-testid={`row-plan-daily-limit-${plan.id}`}>
                         <dt className="text-foreground/70">{t.planDailyLimit}</dt>
                         <dd className="font-bold text-foreground">{number(access.dailyLimit)} {t.planVisits}</dd>
                       </div>
                     </dl>
                   </div>

                   <ul className="mt-5 space-y-3" aria-label={t.planAccess}>
                     {features.map(feature => <li key={feature.key} className="flex items-start justify-between gap-3 text-sm" data-testid={`row-plan-feature-${plan.id}-${feature.key}`}>
                       <span className="text-foreground/75">{feature.label}</span>
                       <span className={`shrink-0 text-xs font-bold ${feature.included ? 'text-primary' : 'text-foreground/45'}`}>{feature.included ? t.planIncluded : t.planNotIncluded}</span>
                     </li>)}
                   </ul>

                   <div className="mt-5 border-t border-border pt-4 text-sm">
                     <p className="font-semibold">{t.planCancellation}</p>
                     <p className="mt-1 text-foreground/65" data-testid={`text-plan-cancellation-${plan.id}`}>
                       {access.cancellationPeriodDays === null
                         ? t.planConfirm
                         : `${number(access.cancellationPeriodDays)} ${t.planDays}`}
                     </p>
                   </div>
                   <Link href="/contact" className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-primary" data-testid={`link-plan-enquiry-${plan.id}`}>{t.ask}<ArrowUpRight size={15} /></Link>
                 </article>;
               })}
             </section>
           : <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="empty-membership-plans"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"><Dumbbell size={20} /></div><h2 className="mt-4 font-display text-2xl font-bold">{t.planEmptyTitle}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t.planEmptyBody}</p><Link href="/contact" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-empty-plans-contact">{t.ask}<ArrowUpRight size={15} /></Link></div>}
      <section className="mt-14" aria-labelledby="membership-plan-faqs">
        <div className="mb-5"><SectionKicker>{t.plans}</SectionKicker><h2 id="membership-plan-faqs" className="font-display text-3xl font-bold tracking-[-.04em]">{t.planFaqs}</h2></div>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card px-5">
          {[
            [t.planFaqPriceTitle, t.planFaqPriceBody],
            [t.planFaqAccessTitle, t.planFaqAccessBody],
            [t.planFaqCancelTitle, t.planFaqCancelBody],
            [t.planFaqPurchaseTitle, t.planFaqPurchaseBody],
          ].map(([question, answer], index) => <details key={question} className="group py-4" data-testid={`details-plan-faq-${index + 1}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
              {question}<ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/65">{answer}</p>
          </details>)}
        </div>
      </section>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-7"><p className="max-w-xl text-sm text-foreground/60">{t.notCheckout}</p><ActionLink href="/contact" testId="link-plans-contact">{t.getUpdates}</ActionLink></div>
    </PageWrap>
  </>;
}

function ErrorState({ text, retry, t }: { text: string; retry: () => void; t: Copy }) {
  return <div role="alert" className="rounded-2xl border border-[#bd8065]/30 bg-[#f2e4d6] p-6"><p className="font-semibold">{text}</p><button onClick={retry} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="button-retry-data"><RotateCw size={14} />{t.retry}</button></div>;
}

function FacilitiesPage({ t, language }: { t: Copy; language: Language }) {
  const catalog = useGetPublicCatalog({ query: { queryKey: getGetPublicCatalogQueryKey() } });
  return <>
    <PageHero kicker={t.facilities} title={t.discover} description={t.directionsD} />
    <PublicFacilityBrowser language={language} />
    <PageWrap className="py-14 md:py-20">
      <div className="mb-10 grid gap-5 md:grid-cols-[1fr_auto] md:items-end"><div><SectionKicker>{t.live}</SectionKicker><h2 className="font-display text-4xl font-bold tracking-[-.05em]">{t.currentOfferings}</h2></div><p className="max-w-md text-sm leading-6 text-foreground/60">{t.emptySub}</p></div>
      <OfferingCards offerings={(catalog.data || []).filter(offering => !offering.additionalPayment)} language={language} loading={catalog.isLoading} error={catalog.isError} retry={() => catalog.refetch()} t={t} />
      <div className="mt-14 grid gap-8 rounded-[2rem] bg-[#eadfcd] p-8 md:grid-cols-2 md:items-center md:p-12"><div><SectionKicker>{t.directions}</SectionKicker><h2 className="font-display text-3xl font-bold tracking-[-.05em]">{t.local}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-foreground/65">{t.locald}</p></div><div className="flex flex-wrap gap-3"><ActionLink href="/partner">{t.partner}</ActionLink><Link href="/help" className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-5 py-3.5 text-sm font-bold" data-testid="link-facilities-help">{t.help}<ArrowUpRight size={15} /></Link></div></div>
    </PageWrap>
  </>;
}

function EventsPage({ t, language }: { t: Copy; language: Language }) {
  const catalog = useGetPublicCatalog({ query: { queryKey: getGetPublicCatalogQueryKey() } });
  const events = useMemo(
    () => (catalog.data || [])
      .filter(event => event.kind === 'event' && !event.additionalPayment && Date.parse(event.startsAt) > Date.now())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [catalog.data],
  );
  const locale = language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ';
  const eventAppHref = 'maydango://explore?kind=events';
  const field = (value: { en: string; ar: string; ku: string } | null, fallback: string) =>
    value?.[language]?.trim() || fallback;
  const numberLabel = (value: number) => new Intl.NumberFormat(locale).format(value);
  const dateLabel = (value: string, options: Intl.DateTimeFormatOptions) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, options).format(date);
  };
  return <>
    <PageHero kicker={t.events} title={t.eventsTitle} description={t.eventsIntro} />
    <PageWrap className="py-12 md:py-20">
      <section aria-labelledby="upcoming-events-heading">
        <div className="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div><SectionKicker>{t.eventsUpcoming}</SectionKicker><h2 id="upcoming-events-heading" className="font-display text-4xl font-bold tracking-[-.05em] md:text-5xl">{t.eventsHeading}</h2></div>
          <p className="max-w-md text-sm leading-6 text-foreground/60">{t.eventsMemberRsvp}</p>
        </div>
        {catalog.isLoading ? <div className="grid gap-4 md:grid-cols-2" aria-label={t.loading} data-testid="status-events-loading">{[1, 2, 3, 4].map(index => <div key={index} className="h-60 animate-pulse rounded-[1.5rem] bg-muted" />)}</div>
          : catalog.isError ? <ErrorState text={t.eventsError} retry={() => { void catalog.refetch(); }} t={t} />
            : events.length ? <div className="grid gap-4 lg:grid-cols-2">
              {events.map(event => {
                const title = field(event.localizedTitle, event.title);
                const description = field(event.localizedDescription, '');
                const full = event.remaining <= 0;
                return <article key={event.id} className="offering-card overflow-hidden rounded-[1.5rem] border border-border bg-card" data-testid={`card-event-${event.id}`}>
                  <div className="flex min-h-40 items-start justify-between gap-4 bg-[#174e43] p-6 text-[#f4ead6] md:p-7">
                    <div className="max-w-[78%]">
                      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#f0a17c]"><CalendarDays size={14} />{t.eventType}</p>
                      <h3 className="mt-4 font-display text-2xl font-bold leading-tight tracking-[-.04em] md:text-3xl" data-testid={`text-event-title-${event.id}`}>{title}</h3>
                    </div>
                    <div className="min-w-[76px] rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center">
                      <span className="block font-mono text-2xl font-bold leading-none">{dateLabel(event.startsAt, { day: '2-digit' })}</span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.12em] text-[#f4ead6]/70">{dateLabel(event.startsAt, { month: 'short' })}</span>
                    </div>
                  </div>
                  <div className="p-6 md:p-7">
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <p className="flex items-start gap-2 text-foreground/75"><Clock3 size={15} className="mt-0.5 shrink-0 text-primary" /><span>{dateLabel(event.startsAt, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<span className="block text-xs text-muted-foreground">{t.eventsUntil} {dateLabel(event.endsAt, { hour: 'numeric', minute: '2-digit' })}</span></span></p>
                      <p className="flex items-start gap-2 text-foreground/75"><MapPin size={15} className="mt-0.5 shrink-0 text-primary" /><span>{event.facility}<span className="block text-xs text-muted-foreground">{event.city}</span></span></p>
                      <p className="flex items-start gap-2 text-foreground/75"><Users size={15} className="mt-0.5 shrink-0 text-primary" /><span>{t.eventsHostedBy}<span className="block text-xs text-muted-foreground">{event.partnerName}</span></span></p>
                      <p className="flex items-start gap-2 text-foreground/75"><Dumbbell size={15} className="mt-0.5 shrink-0 text-primary" /><span>{t.eventsCategory}<span className="block text-xs text-muted-foreground">{event.category}</span></span></p>
                    </div>
                    {description ? <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-foreground/70">{description}</p> : null}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${full ? 'bg-[#f3e4dc] text-[#9a4435]' : 'bg-[#e7efe8] text-primary'}`} data-testid={`status-event-availability-${event.id}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${full ? 'bg-[#9a4435]' : 'bg-primary'}`} />
                        {full ? t.eventsFull : t.eventsSpaces.replace('{count}', numberLabel(event.remaining))}
                      </span>
                      {!full ? <a href={eventAppHref} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5" data-testid={`link-event-rsvp-${event.id}`}>
                        {t.eventsRsvp}<ArrowUpRight size={15} />
                      </a> : <span className="text-xs font-semibold text-foreground/50">{t.eventsUnavailable}</span>}
                    </div>
                  </div>
                </article>;
              })}
            </div>
            : <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="status-events-empty">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"><CalendarDays size={20} /></div>
              <h3 className="mt-4 font-display text-2xl font-bold">{t.eventsEmpty}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t.eventsEmptyText}</p>
            </div>}
      </section>
      <section className="mt-12 grid gap-5 md:grid-cols-[1.1fr_.9fr]">
        <article className="rounded-[1.75rem] bg-[#eadfcd] p-7 md:p-9">
          <SectionKicker>{t.eventsMemberBenefits}</SectionKicker>
          <h2 className="font-display text-3xl font-bold tracking-[-.05em]">{t.eventsBenefitTitle}</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-foreground/70">{t.eventsBenefitText}</p>
          <Link href="/membership-plans" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-events-membership">{t.eventsLearnMembership}<ArrowRight size={15} /></Link>
        </article>
        <aside className="rounded-[1.75rem] border border-border bg-card p-7 md:p-9">
          <SectionKicker>{t.eventsHowRsvp}</SectionKicker>
          <h2 className="font-display text-2xl font-bold tracking-[-.04em]">{t.eventsAccessTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-foreground/65">{t.eventsAccessText}</p>
          <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-xs leading-5 text-foreground/65">{t.eventsRules}</p>
        </aside>
      </section>
      <p className="mt-7 text-xs leading-5 text-muted-foreground">{t.eventsNoReservation}</p>
    </PageWrap>
  </>;
}

function AppDownloadLinks({ t }: { t: Copy }) {
  const iosUrl = verifiedHttpsDestination('VITE_IOS_APP_URL');
  const androidUrl = verifiedHttpsDestination('VITE_ANDROID_APP_URL');
  return <section className="mx-auto mt-10 max-w-7xl rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 md:flex md:items-center md:justify-between">
    <div><SectionKicker>{t.appDownload}</SectionKicker><p className="max-w-xl text-sm leading-6 text-foreground/60">{!iosUrl && !androidUrl ? t.appDestinationsUnavailable : t.onlineD}</p></div>
    <div className="mt-4 flex flex-wrap gap-3 md:mt-0">
      {iosUrl && <a href={iosUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-3 text-sm font-bold hover:bg-muted" data-testid="link-ios-app">{t.iosApp}<ArrowUpRight size={14} className="ms-2 inline" /></a>}
      {androidUrl && <a href={androidUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-3 text-sm font-bold hover:bg-muted" data-testid="link-android-app">{t.androidApp}<ArrowUpRight size={14} className="ms-2 inline" /></a>}
    </div>
  </section>;
}

function OnlinePage({ t, language }: { t: Copy; language: Language }) {
  const catalog = useGetPublicCatalog({ query: { queryKey: getGetPublicCatalogQueryKey() } });
  const live = useMemo(() => (catalog.data || []).filter(o => o.accessType === 'live' && !o.additionalPayment), [catalog.data]);
  return <>
    <PageHero kicker={t.online} title={t.onlineTitle} description={t.onlineD} />
    <PageWrap className="py-14 md:py-20">
      <div className="grid gap-8 md:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-[2rem] bg-[#e98960] p-7 md:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#173e37]/25"><House size={22} /></div><h2 className="mt-7 font-display text-3xl font-bold leading-tight tracking-[-.05em]">{t.homeFirst}</h2><p className="mt-3 text-sm leading-6 text-[#173e37]/75">{t.homeFirstD}</p><Link href="/how-it-works" className="mt-6 inline-flex items-center gap-2 text-sm font-bold" data-testid="link-online-how">{t.learnMore}<ArrowUpRight size={15} /></Link></div>
         <div><SectionKicker>{t.live}</SectionKicker><h2 className="font-display text-3xl font-bold tracking-[-.05em]">{t.currentOfferings}</h2><OfferingCards offerings={live} language={language} loading={catalog.isLoading} error={catalog.isError} retry={() => catalog.refetch()} t={t} compact /></div>
      </div>
      <PublicCourseBrowser language={language} />
      <AppDownloadLinks t={t} />
      <div className="mt-14 rounded-2xl border border-border bg-card px-6 py-7 md:flex md:items-center md:justify-between"><div><h2 className="font-display text-2xl font-bold">{t.availabilityTitle}</h2><p className="mt-2 text-sm text-foreground/60">{t.notCheckout}</p></div><ActionLink href="/contact" testId="link-online-updates">{t.getUpdates}</ActionLink></div>
    </PageWrap>
  </>;
}

const landingCopy: Record<string, { kicker: string; title: string; intro: string; bullets: string[]; topic: 'partner' | 'instructor' | 'corporate'; cta: string }> = {
  partner: { kicker: 'partner', title: 'partnerTitle', intro: 'partnerIntro', bullets: ['partnerDetail1', 'partnerDetail2', 'partnerDetail3'], topic: 'partner', cta: 'topicPartner' },
  instructor: { kicker: 'instructor', title: 'instructorTitle', intro: 'instructorIntro', bullets: ['instructorBullet1', 'instructorBullet2', 'instructorBullet3'], topic: 'instructor', cta: 'topicInstructor' },
  corporate: { kicker: 'corporate', title: 'corporateTitle', intro: 'corporateIntro', bullets: ['corporateDetail1', 'corporateDetail2', 'corporateDetail3'], topic: 'corporate', cta: 'topicCorporate' },
};

function EnquiryPage({ type, t }: { type: 'partner' | 'instructor' | 'corporate'; t: Copy }) {
  const content = landingCopy[type];
  return <>
    <PageHero kicker={t[content.kicker]} title={t[content.title]} description={t[content.intro]} />
    <PageWrap className="py-14 md:py-20">
      <div className="grid gap-12 md:grid-cols-[1fr_.75fr]">
        <div className="grid gap-0">{content.bullets.map((key, index) => <div className="flex gap-4 border-b border-border py-6 first:border-t" key={key}><span className="font-mono text-xs text-primary">0{index + 1}</span><p className="max-w-lg text-lg leading-7">{t[key]}</p><Check className="ms-auto mt-1 shrink-0 text-primary" size={18} /></div>)}</div>
        <aside className="rounded-[2rem] bg-[#eadfcd] p-7 md:p-9"><SectionKicker>{t.contact}</SectionKicker><h2 className="font-display text-3xl font-bold tracking-[-.05em]">{t[content.cta]}</h2><p className="mt-4 text-sm leading-6 text-foreground/65">{t.availabilityD}</p><Link href={`/contact?topic=${content.topic}`} className="mt-7 inline-flex items-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground" data-testid={`link-${type}-enquiry`}>{t[content.cta]}<MoveUpRight size={16} /></Link>{type === 'partner' && <div className="mt-8 border-t border-[#cdbba5] pt-5"><p className="text-xs leading-5 text-foreground/65">{t.approved_partner_prompt}</p><Link href="/sign-in" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-partner-portal-sign-in">{t.partner_operations_sign_in}<ArrowRight size={15} /></Link></div>}{type === 'corporate' && <div className="mt-8 border-t border-[#cdbba5] pt-5"><p className="text-xs leading-5 text-foreground/65">{t.corporatePortalPrompt}</p><Link href="/corporate-portal" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-corporate-portal-sign-in">{t.corporatePortalSignIn}<ArrowRight size={15} /></Link></div>}</aside>
      </div>
    </PageWrap>
  </>;
}

function HelpPage({ t }: { t: Copy }) {
  const questions = [
    [t.faq1, t.faq1d], [t.faq2, t.faq2d], [t.faq3, t.faq3d], [t.faq4, t.faq4d],
    [t.faq5, t.faq5d], [t.faq6, t.faq6d], [t.faq7, t.faq7d], [t.faq8, t.faq8d], [t.faq9, t.faq9d],
  ];
  return <>
    <PageHero kicker={t.help} title={t.helpTitle} description={t.availabilityD} />
    <PageWrap className="py-14 md:py-20">
      <div className="grid gap-14 md:grid-cols-[.65fr_1fr]">
        <div><SectionKicker>{t.help}</SectionKicker><h2 className="font-display text-4xl font-bold leading-tight tracking-[-.05em]">{t.availabilityTitle}</h2><p className="mt-4 max-w-sm text-sm leading-6 text-foreground/60">{t.availabilityD}</p><Link href="/contact" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-help-contact-cta">{t.contact}<ArrowUpRight size={15} /></Link></div>
        <div>{questions.map(([question, answer], i) => <details key={question} className="group border-b border-border py-5 first:border-t" open={i === 0}><summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-display text-xl font-bold tracking-[-.03em]"><span>{question}</span><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition group-open:rotate-45"><span className="text-xl font-normal">+</span></span></summary><p className="max-w-xl pt-4 text-sm leading-6 text-foreground/65">{answer}</p></details>)}</div>
      </div>
      <div className="mt-14 rounded-2xl bg-[#eadfcd] p-7 md:flex md:items-center md:justify-between"><p className="font-display text-2xl font-bold">{t.notCheckout}</p><div className="mt-5 flex flex-wrap items-center gap-5 md:mt-0"><Link href="/membership-plans" className="inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-help-plans">{t.plans}<ArrowUpRight size={15} /></Link><Link href="/support-desk" className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/60 hover:text-primary" data-testid="link-support-desk">{t.supportStaffSignIn}<ArrowRight size={14} /></Link></div></div>
    </PageWrap>
  </>;
}

function ContactPage({ t }: { t: Copy }) {
  const email = verifiedContactEmail(destination('VITE_CONTACT_EMAIL'));
  const [draftHref, setDraftHref] = useState('');
  const initialTopic = initialContactTopic(window.location.search);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { topic: initialTopic, name: '', replyEmail: '', message: '' },
  });
  const handleSubmit = (values: ContactFormValues) => {
    const href = createContactEmailDraft(email, values, {
      contactTopic: t.contactTopic,
      nameLabel: t.nameLabel,
      emailLabel: t.emailLabel,
      topicLabels: {
        membership: t.topicMembership,
        partner: t.topicPartner,
        instructor: t.topicInstructor,
        corporate: t.topicCorporate,
        other: t.topicOther,
      },
    });
    if (!href) return;
    setDraftHref(href);
  };
  return <>
    <PageHero kicker={t.contact} title={t.contactTitle} description={t.availabilityD} />
    <PageWrap className="py-14 md:py-20">
      <div className="grid gap-12 md:grid-cols-[.8fr_1fr]">
        <div><SectionKicker>{t.contact}</SectionKicker><h2 className="font-display text-4xl font-bold tracking-[-.05em]">{t.availabilityTitle}</h2><p className="mt-4 max-w-md leading-7 text-foreground/60">{t.availabilityD}</p>
          {email ? <a href={`mailto:${email}`} className="mt-7 inline-flex items-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground" data-testid="link-contact-email">{t.emailMaydanGo}<ArrowUpRight size={16} /></a> : <p role="status" className="mt-7 rounded-2xl border border-dashed border-border bg-card p-5 text-sm leading-6 text-foreground/60">{t.noDestination}</p>}
        </div>
        <div className="rounded-[2rem] border border-border bg-card p-7 md:p-9"><SectionKicker>{t.send}</SectionKicker><h2 className="font-display text-2xl font-bold">{t.availabilityTitle}</h2><p className="mt-3 text-sm leading-6 text-foreground/60">{t.formNote}</p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-6 grid gap-4">
              <FormField control={form.control} name="topic" render={({ field }) => <FormItem>
                <FormLabel>{t.contactTopic}</FormLabel>
                <FormControl><select {...field} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal" data-testid="select-contact-topic">
                  <option value="membership">{t.topicMembership}</option><option value="partner">{t.topicPartner}</option><option value="instructor">{t.topicInstructor}</option><option value="corporate">{t.topicCorporate}</option><option value="other">{t.topicOther}</option>
                </select></FormControl><FormMessage />
              </FormItem>} />
              <FormField control={form.control} name="name" render={({ field }) => <FormItem>
                <FormLabel>{t.nameLabel}</FormLabel><FormControl><Input autoComplete="name" maxLength={100} {...field} data-testid="input-contact-name" /></FormControl><FormMessage />
              </FormItem>} />
              <FormField control={form.control} name="replyEmail" render={({ field }) => <FormItem>
                <FormLabel>{t.emailLabel}</FormLabel><FormControl><Input type="email" autoComplete="email" maxLength={254} {...field} data-testid="input-contact-email" /></FormControl><FormMessage />
              </FormItem>} />
              <FormField control={form.control} name="message" render={({ field }) => <FormItem>
                <FormLabel>{t.messageLabel}</FormLabel><FormControl><Textarea required minLength={5} maxLength={1500} rows={5} {...field} data-testid="input-contact-message" /></FormControl><FormMessage />
              </FormItem>} />
              <button disabled={!email} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" type="submit" data-testid="button-contact-enquiry">{t.previewEnquiry}<ArrowUpRight size={15} /></button>
              {!email && <p className="text-xs leading-5 text-muted-foreground" role="status">{t.contactUnavailable}</p>}
              {draftHref && <div className="rounded-xl bg-muted p-4" role="status"><p className="text-sm font-medium">{t.draftReady}</p><a href={draftHref} className="mt-2 inline-flex items-center gap-2 font-bold text-primary" data-testid="link-open-email-draft">{t.openEmailDraft}<ArrowUpRight size={14} /></a></div>}
            </form>
          </Form>
        </div>
      </div>
    </PageWrap>
  </>;
}

const contactSchema = z.object({
  topic: z.enum(['membership', 'partner', 'instructor', 'corporate', 'other']),
  name: z.string().trim().max(100),
  replyEmail: z.string().trim().max(254).refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
  message: z.string().trim().min(5).max(1500),
});
type ContactFormValues = z.infer<typeof contactSchema>;

function LegalPage({ t }: { t: Copy }) {
  const pendingPolicies = [
    t.legalTermsTitle, t.legalPrivacyTitle, t.legalCookiesTitle, t.legalBookingTitle, t.legalCancellationTitle,
    t.legalNoShowTitle, t.legalRefundTitle, t.legalPartnerTermsTitle, t.legalCorporateTitle, t.legalCourseTitle,
  ];
  return <>
    <PageHero kicker={t.legal} title={t.legalTitle} description={t.readDraft} />
    <PageWrap className="py-14 md:py-20">
      <div className="mx-auto max-w-3xl">
        <div role="note" className="mb-10 rounded-2xl border border-[#dcaf82]/50 bg-[#f1e6d6] p-5 text-sm font-semibold leading-6">{t.legalDisclaimer}</div>
        <Link href="/privacy" className="mb-8 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-legal-privacy-page">{t.privacyLink}</Link>
        <article className="prose prose-stone max-w-none">
          <h2>{t.legalWebsite}</h2><p>{t.legalWebsiteD}</p>
          <h2>{t.legalMembership}</h2><p>{t.legalMembershipD}</p>
          <h2>{t.legalPartner}</h2><p>{t.legalPartnerD}</p>
          <h2>{t.legalPrivacy}</h2><p>{t.legalPrivacyD}</p>
          <h2>{t.legalStatus}</h2><p>{t.legalStatusD}</p>
        </article>
        <section className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-8" aria-labelledby="pending-policy-title">
          <h2 id="pending-policy-title" className="font-display text-2xl font-bold">{t.legalPolicyChecklist}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.legalPolicyPending}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {pendingPolicies.map((policy) => <li key={policy} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <span className="text-sm font-semibold">{policy}</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{t.legalPendingLabel}</span>
            </li>)}
          </ul>
        </section>
      </div>
    </PageWrap>
  </>;
}

function ContentRouter() {
  const [location] = useLocation();
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const t = translations[language];
  return <Layout key={location} language={language} setLanguage={setLanguage}>
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={() => <HomePage t={t} language={language} />} />
        <Route path="/how-it-works" component={() => <HowPage t={t} />} />
        <Route path="/membership-plans" component={() => <PlansPage t={t} language={language} />} />
        <Route path="/facilities" component={() => <FacilitiesPage t={t} language={language} />} />
        <Route path="/events" component={() => <EventsPage t={t} language={language} />} />
        <Route path="/online-training" component={() => <OnlinePage t={t} language={language} />} />
        <Route path="/partner" component={() => <EnquiryPage type="partner" t={t} />} />
        <Route path="/instructor" component={() => <EnquiryPage type="instructor" t={t} />} />
        <Route path="/corporate" component={() => <EnquiryPage type="corporate" t={t} />} />
        <Route path="/help" component={() => <HelpPage t={t} />} />
        <Route path="/contact" component={() => <ContactPage t={t} />} />
        <Route path="/legal" component={() => <LegalPage t={t} />} />
        <Route path="/privacy" component={() => <PrivacyPolicyPage language={language} />} />
        <Route path="/account" component={() => <MemberAccountPage language={language} />} />
        <Route component={() => <NotFound title={t.not_found_title} description={t.not_found_description} />} />
      </Switch>
    </ErrorBoundary>
  </Layout>;
}

function Router() {
  return <Switch>
    <Route path="/super-admin" component={SuperAdminPage} />
    <Route path="/admin/corporate" component={CorporateAdminPage} />
    <Route path="/corporate-portal" component={CorporatePortalPage} />
    <Route path="/corporate-invite" component={CorporateInvitePage} />
    <Route path="/support-desk" component={SupportDeskPage} />
    <Route path="/partner-portal" component={PartnerPortal} />
    <Route path="/finance" component={FinanceConsole} />
    <Route path="/instructor-portal" component={InstructorPortalPage} />
    <Route path="/admin/instructor-access" component={AdminInstructorAccessPage} />
    <Route path="/admin/sponsored-placements" component={SponsoredPlacementsManagerPage} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/" component={HomeRedirect} />
    <Route component={ContentRouter} />
  </Switch>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="min-h-[100dvh] bg-background" aria-label={translations[savedLanguage()].loading} />;
  return isSignedIn ? <Redirect to="/partner-portal" /> : <ContentRouter />;
}

function SignInPage() {
  const requestedPath = new URLSearchParams(window.location.search).get('redirect_url');
  const normalizedPath = requestedPath?.startsWith(basePath) ? requestedPath.slice(basePath.length) : requestedPath;
  const safePath = ['/account', '/instructor-portal', '/admin/instructor-access', '/admin/sponsored-placements', '/admin/corporate', '/corporate-portal', '/support-desk'].includes(normalizedPath ?? '')
    ? normalizedPath!
    : normalizedPath?.startsWith('/corporate-invite?token=') ? normalizedPath : undefined;
  const redirectTo = safePath ? `${basePath}${safePath}` : undefined;
  const redirectQuery = safePath ? `?redirect_url=${encodeURIComponent(safePath)}` : '';
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f3f0e5] px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up${redirectQuery}`} forceRedirectUrl={redirectTo} /></div>;
}

function SignUpPage() {
  const requestedPath = new URLSearchParams(window.location.search).get('redirect_url');
  const normalizedPath = requestedPath?.startsWith(basePath) ? requestedPath.slice(basePath.length) : requestedPath;
  const safePath = ['/account', '/instructor-portal', '/admin/instructor-access', '/admin/sponsored-placements', '/admin/corporate', '/corporate-portal', '/support-desk'].includes(normalizedPath ?? '')
    ? normalizedPath!
    : normalizedPath?.startsWith('/corporate-invite?token=') ? normalizedPath : undefined;
  const redirectTo = safePath ? `${basePath}${safePath}` : undefined;
  const redirectQuery = safePath ? `?redirect_url=${encodeURIComponent(safePath)}` : '';
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f3f0e5] px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in${redirectQuery}`} forceRedirectUrl={redirectTo} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) client.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [location, setLocation] = useLocation();
  const t = translations[savedLanguage()];
  const accountAuthFlow = (location.startsWith('/sign-in') || location.startsWith('/sign-up')) &&
    new URLSearchParams(window.location.search).get('redirect_url') === '/account';
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: t.sign_in_title, subtitle: accountAuthFlow ? t.accountSignInSubtitle : t.sign_in_subtitle } },
      signUp: { start: { title: t.sign_up_title, subtitle: accountAuthFlow ? t.accountSignUpSubtitle : t.sign_up_subtitle } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Router />
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <TooltipProvider>
      <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>
      <CookieConsent />
      <Toaster />
    </TooltipProvider>;
}

export default App;
