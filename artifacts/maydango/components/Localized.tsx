import React from 'react';
import { Text as NativeText, TextInput as NativeInput, Pressable as NativePressable, type TextProps, type TextInputProps, type PressableProps } from 'react-native';
import { Ionicons as NativeIcon } from '@expo/vector-icons';
import { useApp } from '@/contexts/AppContext';
import { localize, number } from '@/lib/content';
import { inputTextDirection, type TextDirection } from '@/lib/text-direction';

// Presentation boundary for authored catalog/interface copy. Not for user input.
// Keep raw values (emails, references, identifiers) out of translation.
export function Text({ children, style, raw = false, ...props }: TextProps & { raw?: boolean }) {
  const { language } = useApp();
  const render = (child: React.ReactNode): React.ReactNode => {
    if (raw) return child;
    if (typeof child === 'number') return number(child, language);
    if (typeof child === 'string') return localize(child, language).replace(/\d/g, n => number(Number(n), language));
    return child;
  };
  return <NativeText {...props} accessibilityLabel={props.accessibilityLabel && localize(props.accessibilityLabel, language)}
    style={[{ textAlign: language === 'en' ? 'left' : 'right', writingDirection: language === 'en' ? 'ltr' : 'rtl', flexShrink: 1 }, style]}>
    {React.Children.map(children, render)}
  </NativeText>;
}
export function Pressable(props: PressableProps) {
  const { language } = useApp();
  return <NativePressable {...props} accessibilityLabel={props.accessibilityLabel && localize(props.accessibilityLabel, language)} />;
}
export function TextInput({ inputDirection, ...props }: TextInputProps & { inputDirection?: TextDirection }) {
  const { language } = useApp();
  const direction = inputTextDirection(language, inputDirection);
  return <NativeInput {...props} placeholder={props.placeholder && localize(props.placeholder, language)}
    accessibilityLabel={props.accessibilityLabel && localize(props.accessibilityLabel, language)}
    style={[{ textAlign: direction === 'ltr' ? 'left' : 'right', writingDirection: direction }, props.style]} />;
}
export function Ionicons(props: React.ComponentProps<typeof NativeIcon>) {
  const { language } = useApp();
  const directional = ['arrow-back', 'arrow-forward', 'chevron-forward', 'chevron-back'].includes(props.name);
  return <NativeIcon {...props} style={[props.style, language !== 'en' && directional ? { transform: [{ scaleX: -1 }] } : undefined]} />;
}
Ionicons.glyphMap = NativeIcon.glyphMap;
