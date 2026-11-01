import React from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeInput, Pressable as NativePressable, type StyleProp, type TextProps, type TextInputProps, type TextStyle, type PressableProps } from 'react-native';
import { Ionicons as NativeIcon } from '@expo/vector-icons';
import { useApp } from '@/contexts/AppContext';
import { localize, number } from '@/lib/content';
import { formatPartnerOperationsNumber, localizePartnerOperationsReview, toWesternDigits } from '@/lib/partner-operations-copy';
import { inputTextDirection, type TextDirection } from '@/lib/text-direction';

type CopyMode = 'partner-operations-review';

function localizeCopy(value: string, language: 'en' | 'ar' | 'ku', copyMode?: CopyMode) {
  return copyMode === 'partner-operations-review'
    ? localizePartnerOperationsReview(value, language)
    : localize(value, language);
}

function displayNumber(value: number, language: 'en' | 'ar' | 'ku', copyMode?: CopyMode) {
  return copyMode === 'partner-operations-review'
    ? formatPartnerOperationsNumber(value, language)
    : number(value, language);
}

function fontForStyle(style?: StyleProp<TextStyle>) {
  const resolved = StyleSheet.flatten(style);
  if (resolved?.fontFamily) return resolved.fontFamily;
  const weight = Number.parseInt(String(resolved?.fontWeight ?? '400'), 10);
  if (Number.isFinite(weight) && weight >= 700) return 'DMSans_700Bold';
  if (Number.isFinite(weight) && weight >= 600) return 'DMSans_600SemiBold';
  if (Number.isFinite(weight) && weight >= 500) return 'DMSans_500Medium';
  return 'DMSans_400Regular';
}

// Presentation boundary for authored catalog/interface copy. Not for user input.
// Keep raw values (emails, references, identifiers) out of translation.
export function Text({ children, style, raw = false, copyMode, ...props }: TextProps & { raw?: boolean; copyMode?: CopyMode }) {
  const { language } = useApp();
  const render = (child: React.ReactNode): React.ReactNode => {
    if (raw) return child;
    if (typeof child === 'number') return displayNumber(child, language, copyMode);
    if (typeof child === 'string') {
      const localized = localizeCopy(child, language, copyMode);
      return copyMode === 'partner-operations-review'
        ? toWesternDigits(localized)
        : localized.replace(/\d/g, n => number(Number(n), language));
    }
    return child;
  };
  return <NativeText {...props} accessibilityLabel={props.accessibilityLabel && localizeCopy(props.accessibilityLabel, language, copyMode)}
    style={[{ fontFamily: fontForStyle(style), textAlign: language === 'en' ? 'left' : 'right', writingDirection: language === 'en' ? 'ltr' : 'rtl', flexShrink: 1 }, style]}>
    {React.Children.map(children, render)}
  </NativeText>;
}
export function Pressable({ copyMode, ...props }: PressableProps & { copyMode?: CopyMode }) {
  const { language } = useApp();
  return <NativePressable {...props} accessibilityLabel={props.accessibilityLabel && localizeCopy(props.accessibilityLabel, language, copyMode)} />;
}
export function TextInput({ inputDirection, copyMode, ...props }: TextInputProps & { inputDirection?: TextDirection; copyMode?: CopyMode }) {
  const { language } = useApp();
  const direction = inputTextDirection(language, inputDirection);
  const localizedPlaceholder = props.placeholder && localizeCopy(props.placeholder, language, copyMode);
  return <NativeInput {...props} placeholder={localizedPlaceholder && (copyMode === 'partner-operations-review' ? toWesternDigits(localizedPlaceholder) : localizedPlaceholder)}
    accessibilityLabel={props.accessibilityLabel && localizeCopy(props.accessibilityLabel, language, copyMode)}
    style={[{ fontFamily: 'DMSans_400Regular', textAlign: direction === 'ltr' ? 'left' : 'right', writingDirection: direction }, props.style]} />;
}
export function Ionicons(props: React.ComponentProps<typeof NativeIcon>) {
  const { language } = useApp();
  const directional = ['arrow-back', 'arrow-forward', 'chevron-forward', 'chevron-back'].includes(props.name);
  return <NativeIcon {...props} style={[props.style, language !== 'en' && directional ? { transform: [{ scaleX: -1 }] } : undefined]} />;
}
Ionicons.glyphMap = NativeIcon.glyphMap;
