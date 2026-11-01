import partnerPortalCopyDraft from '@/partner-portal-copy-review-draft.json';

export type PortalCopyLanguage = 'en' | 'ar' | 'ku';
type PortalCopyEntry = (typeof partnerPortalCopyDraft)[number];

const copyBySource = new Map<string, PortalCopyEntry>(
  partnerPortalCopyDraft.map((entry) => [entry.source_en, entry] as const),
);

const fullSentenceDrafts = {
  activeListings: {
    en: 'You have {active} active listings out of {total} total.',
    ar: 'عندك {active} نشاط معروض من أصل {total}.',
    ku: 'ئێستا {active} چاالکی لە کۆی {total} چاالکی پیشان دەدرێت.',
  },
  recurringPreview: {
    en: 'Sessions start at {time} Iraq time and repeat through {date}, including that day.',
    ar: 'تبدأ الجلسات الساعة {time} بتوقيت العراق، ويشمل التكرار يوم {date}.',
    ku: 'وانەکان کاتژمێر {time} بە کاتی عێراق دەست پێدەکەن و دووبارەبوونەوەکە ڕۆژی {date}یش لەخۆدەگرێت.',
  },
  mutationFailed: {
    en: "{action} couldn't be completed. The change wasn't saved.",
    ar: 'ما كدرنا نكمل {action}. التغيير ما انحفظ.',
    ku: '{action} تەواو نەبوو. گۆڕانکارییەکە پاشەکەوت نەکرا.',
  },
} as const;

export type PortalSentenceKey = keyof typeof fullSentenceDrafts;

export const partnerPortalCopyDraftCount = partnerPortalCopyDraft.length;

export function getPartnerPortalCopy(
  lang: PortalCopyLanguage,
  source: string,
): string | undefined {
  const entry = copyBySource.get(source);
  if (!entry) return undefined;
  return entry[lang === 'ku' ? 'ckb' : lang];
}

export function formatPartnerPortalSentence(
  lang: PortalCopyLanguage,
  key: PortalSentenceKey,
  values: Record<string, string>,
): string {
  return fullSentenceDrafts[key][lang].replace(/\{([^}]+)\}/g, (_match, name: string) => {
    if (!(name in values)) throw new Error(`Missing value for portal copy placeholder: ${name}`);
    return values[name];
  });
}

export function formatPartnerPortalNumber(lang: PortalCopyLanguage, value: number): string {
  const locale = lang === 'ku' ? 'ckb-IQ' : lang === 'ar' ? 'ar-IQ' : 'en-IQ';
  return new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(value);
}

export function splitLocalizedCommaList(value: string): string[] {
  return value.split(/[,،]/).map((item) => item.trim()).filter(Boolean);
}
