import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function CoursePlaybackWatermark({ label }: { label: string }) {
  const colors = useColors();
  const [positionIndex, setPositionIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPositionIndex(current => (current + 1) % positions.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, positions[positionIndex]]}
    >
      <Text
        testID="course-playback-watermark"
        numberOfLines={1}
        style={[
          styles.label,
          { backgroundColor: colors.foreground, color: colors.background },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 2,
    maxWidth: "90%",
  },
  label: {
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    opacity: 0.68,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  topLeft: { top: 12, left: 12 },
  topRight: { top: 12, right: 12 },
  bottomLeft: { bottom: 48, left: 12 },
  bottomRight: { bottom: 48, right: 12 },
  center: { top: "48%", left: "25%" },
});

const positions = [
  styles.topLeft,
  styles.topRight,
  styles.bottomLeft,
  styles.bottomRight,
  styles.center,
];
