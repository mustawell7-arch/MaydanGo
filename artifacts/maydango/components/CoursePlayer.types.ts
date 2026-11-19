export type CourseMediaKind = "audio" | "video";

export type CoursePlayerProps = {
  sourceUrl: string;
  initialPositionSeconds: number;
  kind: CourseMediaKind;
  watermarkLabel: string;
  onProgress: (positionSeconds: number, durationSeconds: number, force: boolean) => void;
};
