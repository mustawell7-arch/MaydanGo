export const maxCourseMaterialBytes = 15 * 1024 * 1024;

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const materialPathPattern = new RegExp(`^/objects/course-materials/${uuidPattern}/${uuidPattern}\\.pdf$`, "i");
const materialUploadPathPattern = new RegExp(`^/objects/course-material-uploads/${uuidPattern}/${uuidPattern}\\.pdf$`, "i");

export function courseMaterialObjectPath(courseId: string, materialId: string) {
  if (!new RegExp(`^${uuidPattern}$`, "i").test(courseId)
      || !new RegExp(`^${uuidPattern}$`, "i").test(materialId)) {
    throw new Error("Invalid course material identifier.");
  }
  return `/objects/course-materials/${courseId}/${materialId}.pdf`;
}

export function courseMaterialUploadObjectPath(courseId: string, materialId: string) {
  if (!new RegExp(`^${uuidPattern}$`, "i").test(courseId)
      || !new RegExp(`^${uuidPattern}$`, "i").test(materialId)) {
    throw new Error("Invalid course material identifier.");
  }
  return `/objects/course-material-uploads/${courseId}/${materialId}.pdf`;
}

export function isPrivateCourseMaterialPath(value: unknown): value is string {
  return typeof value === "string" && materialPathPattern.test(value);
}

export function isPrivateCourseMaterialUploadPath(value: unknown): value is string {
  return typeof value === "string" && materialUploadPathPattern.test(value);
}

export function isSafeCourseMaterialFileName(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 180
    && /\.pdf$/i.test(value)
    && !/[\\/:\r\n]/.test(value);
}
