import type { Language } from './i18n';
import { locale, localize } from './content';
import reviewRows from './partner-operations-copy-review-draft.json';

type ReviewRow = {
  source_en: string;
  en: string;
  ar: string;
  ckb: string;
};

const reviewCopy: Record<string, Omit<ReviewRow, 'source_en'>> = {};
for (const row of reviewRows as ReviewRow[]) {
  const existing = reviewCopy[row.source_en];
  if (existing && (existing.en !== row.en || existing.ar !== row.ar || existing.ckb !== row.ckb)) {
    throw new Error(`Conflicting partner operations review copy for "${row.source_en}".`);
  }
  reviewCopy[row.source_en] = { en: row.en, ar: row.ar, ckb: row.ckb };
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const copyPattern = new RegExp(
  `(?<![A-Za-z])(?:${Object.keys(reviewCopy).sort((a, b) => b.length - a.length).map(escapePattern).join('|')})(?![A-Za-z])`,
  'g',
);

/** Proposed wording from the user's review file; use only in the mobile operations area. */
export function localizePartnerOperationsReview(value: string, language: Language): string {
  const localeKey = language === 'ku' ? 'ckb' : language;
  const withReviewCopy = value.replace(copyPattern, source => reviewCopy[source]?.[localeKey] ?? source);
  return localize(withReviewCopy, language);
}

export function toWesternDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function formatPartnerOperationsNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), { numberingSystem: 'latn' }).format(value);
}

export function splitPartnerOperationsList(value: string): string[] {
  return value.split(/[،,]/).map(item => item.trim()).filter(Boolean);
}
