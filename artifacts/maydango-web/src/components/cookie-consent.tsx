import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Cookie, Settings2 } from 'lucide-react';
import {
  readAnalyticsConsent,
  saveAnalyticsConsent,
  type AnalyticsConsent,
} from '@/lib/cookie-consent';

type Language = 'en' | 'ar' | 'ku';

const copy = {
  en: {
    title: 'Privacy choices',
    intro: 'MaydanGo uses essential storage for sign-in and security. Optional analytics stay off unless you allow them.',
    details: 'Your choice is saved in this browser. The cookie policy is still a draft and will be reviewed before publication.',
    allow: 'Allow optional analytics',
    reject: 'Use essential only',
    settings: 'Privacy settings',
    saved: 'Your privacy choice was saved.',
    policy: 'Review the draft cookie policy',
  },
  ar: {
    title: 'خيارات الخصوصية',
    intro: 'تستخدم MaydanGo التخزين الضروري لتسجيل الدخول والأمان. تبقى التحليلات الاختيارية متوقفة ما لم تسمح بها.',
    details: 'يُحفظ اختيارك في هذا المتصفح. سياسة ملفات الارتباط ما زالت مسودة وستُراجع قبل نشرها.',
    allow: 'السماح بالتحليلات الاختيارية',
    reject: 'الضروري فقط',
    settings: 'إعدادات الخصوصية',
    saved: 'تم حفظ اختيار الخصوصية.',
    policy: 'مراجعة مسودة سياسة ملفات الارتباط',
  },
  ku: {
    title: 'هەڵبژاردەکانی تایبەتمەندی',
    intro: 'MaydanGo بۆ چوونەژوورەوە و پاراستن زانیاریی پێویست بەکاردەهێنێت. شیکاریی ئارەزوومەندانە ناچالاک دەمێنێتەوە تا ڕێگەی پێ بدەیت.',
    details: 'هەڵبژاردەکەت لەم وێبگەڕەدا پاشەکەوت دەکرێت. سیاسەتی کوکی هێشتا ڕەشنووسە و پێش بڵاوکردنەوە پێداچوونەوەی بۆ دەکرێت.',
    allow: 'ڕێگەدان بە شیکاریی ئارەزوومەندانە',
    reject: 'تەنها زانیاریی پێویست',
    settings: 'ڕێکخستنەکانی تایبەتمەندی',
    saved: 'هەڵبژاردەی تایبەتمەندی پاشەکەوت کرا.',
    policy: 'پێداچوونەوە بە ڕەشنووسی سیاسەتی کوکی',
  },
} as const;

function savedLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const language = window.localStorage.getItem('maydango-language');
    return language === 'ar' || language === 'ku' ? language : 'en';
  } catch {
    return 'en';
  }
}

export function CookieConsent() {
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [choice, setChoice] = useState<AnalyticsConsent>(readAnalyticsConsent);
  const [open, setOpen] = useState(choice === null);
  const [showSaved, setShowSaved] = useState(false);
  const text = copy[language];
  const rtl = language !== 'en';

  useEffect(() => {
    const updateLanguage = () => setLanguage(savedLanguage());
    window.addEventListener('storage', updateLanguage);
    window.addEventListener('maydango-language-change', updateLanguage);
    return () => {
      window.removeEventListener('storage', updateLanguage);
      window.removeEventListener('maydango-language-change', updateLanguage);
    };
  }, []);

  const choose = (value: Exclude<AnalyticsConsent, null>) => {
    saveAnalyticsConsent(value);
    setChoice(value);
    setOpen(false);
    setShowSaved(true);
    window.setTimeout(() => setShowSaved(false), 4000);
  };

  return (
    <aside
      aria-label={text.title}
      dir={rtl ? 'rtl' : 'ltr'}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl"
    >
      {open ? (
        <section className="rounded-2xl border border-[#d8d2c4] bg-[#fffdf7] p-4 text-[#173d35] shadow-[0_16px_50px_rgba(23,61,53,.22)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-[#e9e5d7] p-2 text-[#174d43]"><Cookie size={18} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold">{text.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#536b61]">{text.intro}</p>
              <p className="mt-2 text-xs leading-5 text-[#718078]">{text.details}</p>
              <Link href="/legal" className="mt-2 inline-block text-xs font-semibold text-[#174d43] underline underline-offset-4">
                {text.policy}
              </Link>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="button-cookie-accept"
                  onClick={() => choose('accepted')}
                  className="min-h-10 rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] hover:bg-[#226556]"
                >
                  {text.allow}
                </button>
                <button
                  type="button"
                  data-testid="button-cookie-reject"
                  onClick={() => choose('essential-only')}
                  className="min-h-10 rounded-xl border border-[#c9c2b1] bg-transparent px-4 py-2 text-xs font-bold text-[#34564b] hover:bg-[#f3f0e5]"
                >
                  {text.reject}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3">
          {showSaved && <p role="status" className="rounded-lg bg-[#174d43] px-3 py-2 text-xs font-semibold text-white shadow">{text.saved}</p>}
          <button
            type="button"
            data-testid="button-cookie-settings"
            onClick={() => setOpen(true)}
            aria-label={text.settings}
            className="ms-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-4 py-2 text-xs font-bold text-[#174d43] shadow-lg hover:bg-[#f3f0e5]"
          >
            <Settings2 size={15} />
            {text.settings}
          </button>
        </div>
      )}
    </aside>
  );
}
