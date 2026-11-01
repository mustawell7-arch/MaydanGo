const recordingPathPattern =
  /^\/objects\/course-recordings\/[A-Za-z0-9_-]{1,180}\.(mp4|webm|m4v|mov|m4a|mp3|aac|ogg)$/;

const contentTypes: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  m4v: "video/mp4",
  mov: "video/quicktime",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  ogg: "audio/ogg",
};

export function isPrivateCourseRecordingPath(value: unknown): value is string {
  return typeof value === "string" && recordingPathPattern.test(value);
}

export function courseRecordingContentType(path: string): string | null {
  if (!isPrivateCourseRecordingPath(path)) return null;
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return contentTypes[extension] ?? null;
}
