import React from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { CoursePlayerProps } from "./CoursePlayer.types";

function buildPlayerHtml(sourceUrl: string, initialPositionSeconds: number, kind: CoursePlayerProps["kind"]) {
  const origin = new URL(sourceUrl).origin;
  const safeUrl = JSON.stringify(sourceUrl).replace(/</g, "\\u003c");
  const initialPosition = Math.max(0, Math.floor(initialPositionSeconds));
  const mediaElement = kind === "audio" ? "audio" : "video";
  const elementStyle = kind === "audio"
    ? "width:100%;margin-top:8px"
    : "width:100%;height:100%;object-fit:contain;background:#000";
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src ${origin}">
<style>html,body{margin:0;width:100%;height:100%;background:#000}body{display:flex;align-items:center;justify-content:center}#player{${elementStyle}}</style>
</head>
<body>
<${mediaElement} id="player" controls playsinline preload="metadata"></${mediaElement}>
<script>
const player=document.getElementById("player");
player.src=${safeUrl};
const initialPosition=${initialPosition};
let lastSentAt=0;
function sendProgress(force){
  if(!Number.isFinite(player.duration)||player.duration<=0)return;
  const now=Date.now();
  if(!force&&now-lastSentAt<5000)return;
  lastSentAt=now;
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type:"progress",
    positionSeconds:Math.floor(player.currentTime||0),
    durationSeconds:Math.floor(player.duration),
    force:!!force
  }));
}
player.addEventListener("loadedmetadata",()=>{
  if(initialPosition>0&&initialPosition<player.duration-2)player.currentTime=initialPosition;
});
player.addEventListener("timeupdate",()=>sendProgress(false));
player.addEventListener("pause",()=>sendProgress(true));
player.addEventListener("seeked",()=>sendProgress(true));
player.addEventListener("ended",()=>sendProgress(true));
window.setInterval(()=>{if(!player.paused&&!player.ended)sendProgress(false)},5000);
</script>
</body>
</html>`;
}

export default function CoursePlayer({ sourceUrl, initialPositionSeconds, kind, onProgress }: CoursePlayerProps) {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const value = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        positionSeconds?: number;
        durationSeconds?: number;
        force?: boolean;
      };
      if (
        value.type === "progress"
        && Number.isSafeInteger(value.positionSeconds)
        && Number.isSafeInteger(value.durationSeconds)
        && (value.durationSeconds ?? 0) > 0
      ) {
        onProgress(value.positionSeconds!, value.durationSeconds!, value.force === true);
      }
    } catch {
      // Ignore non-progress messages from the media view.
    }
  };

  return (
    <WebView
      testID="course-recording-player"
      originWhitelist={["https://*", "about:blank"]}
      source={{ html: buildPlayerHtml(sourceUrl, initialPositionSeconds, kind), baseUrl: new URL(sourceUrl).origin }}
      onMessage={handleMessage}
      javaScriptEnabled
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction
      scrollEnabled={false}
      style={styles.player}
    />
  );
}

const styles = StyleSheet.create({
  player: { height: 230, width: "100%", backgroundColor: "#000", borderRadius: 12 },
});
