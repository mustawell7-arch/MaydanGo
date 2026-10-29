export type TextDirection = 'ltr' | 'rtl';
export type AppLanguage = 'en' | 'ar' | 'ku';

export function inputTextDirection(language: AppLanguage, override?: TextDirection): TextDirection {
  return override ?? (language === 'en' ? 'ltr' : 'rtl');
}
