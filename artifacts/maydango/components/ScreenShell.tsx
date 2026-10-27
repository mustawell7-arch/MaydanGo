import React from 'react';
import { Platform, View } from 'react-native';
import { Text } from '@/components/Localized';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import { StorageBanner } from '@/components/LocalNotice';

export function ScreenShell({ children, sample = true }: { children: React.ReactNode; sample?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { language, hydrated } = useApp();
  if (!hydrated) return null;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'web' ? 67 : insets.top,
        paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
        direction: language === 'en' ? 'ltr' : 'rtl',
      }}
    >
      <StorageBanner />
      {sample ? <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, paddingHorizontal: 22, paddingVertical: 6 }}>
        Sample catalog · example places, schedules and prices. Not real partner availability.
      </Text> : null}
      {children}
    </View>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  const colors = useColors();
  const { language } = useApp();
  return (
    <View
      style={{
        paddingHorizontal: 22,
        paddingBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <TextSmall color={colors.mutedForeground} align={language === 'en' ? 'left' : 'right'}>{eyebrow}</TextSmall>
        ) : null}
        <TextLarge color={colors.foreground} align={language === 'en' ? 'left' : 'right'}>{title}</TextLarge>
      </View>
      {trailing}
    </View>
  );
}

function TextSmall({ children, color, align }: { children: string; color: string; align: 'left' | 'right' }) {
  return (
    <Text style={{ color, fontSize: 12, fontWeight: '600', marginBottom: 4, textAlign: align }}>
      {children}
    </Text>
  );
}

function TextLarge({ children, color, align }: { children: string; color: string; align: 'left' | 'right' }) {
  return (
    <Text style={{ color, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, textAlign: align }}>
      {children}
    </Text>
  );
}
