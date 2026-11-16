import React from "react";
import { View } from "react-native";
import type { CoursePlayerProps } from "./CoursePlayer.types";

function savePosition(
  event: React.SyntheticEvent<HTMLMediaElement>,
  onProgress: CoursePlayerProps["onProgress"],
  force: boolean,
) {
  const player = event.currentTarget;
  if (!Number.isFinite(player.duration) || player.duration <= 0) return;
  onProgress(Math.floor(player.currentTime || 0), Math.floor(player.duration), force);
}

export default function CoursePlayer({
  sourceUrl,
  initialPositionSeconds,
  kind,
  onProgress,
}: CoursePlayerProps) {
  const mediaProps = {
    controls: true,
    preload: "metadata" as const,
    src: sourceUrl,
    crossOrigin: "anonymous" as const,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const player = event.currentTarget;
      if (initialPositionSeconds > 0 && initialPositionSeconds < player.duration - 2) {
        player.currentTime = initialPositionSeconds;
      }
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => savePosition(event, onProgress, false),
    onPause: (event: React.SyntheticEvent<HTMLMediaElement>) => savePosition(event, onProgress, true),
    onSeeked: (event: React.SyntheticEvent<HTMLMediaElement>) => savePosition(event, onProgress, true),
    onEnded: (event: React.SyntheticEvent<HTMLMediaElement>) => savePosition(event, onProgress, true),
  };
  const playerStyle = {
    width: "100%",
    height: kind === "audio" ? 64 : 230,
    backgroundColor: "#000",
    borderRadius: 12,
  };

  return (
    <View testID="course-recording-player" style={{ width: "100%", marginTop: 10 }}>
      {kind === "audio"
        ? <audio {...mediaProps} style={playerStyle} />
        : <video {...mediaProps} style={playerStyle} playsInline />}
    </View>
  );
}
