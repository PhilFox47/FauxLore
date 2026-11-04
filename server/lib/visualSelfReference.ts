import type { Db } from "../context";
import { imageSize } from "./imageSize";
import { normalizeVisualSelfMode, type VisualSelfInsertMode } from "../../src/lib/visualSelf";
import type { WrappedVisualPlan } from "../../src/lib/dynamicScenes";

export const MAX_VISUAL_SELF_REFERENCE_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_FACE_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type AcceptedMime = typeof ACCEPTED_FACE_PHOTO_TYPES[number];

export function validateFacePhoto(buffer: Buffer, contentType: string): { mime: AcceptedMime; width: number; height: number } {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_FACE_PHOTO_TYPES.includes(mime as AcceptedMime)) throw new Error("Reference image must be PNG, JPEG, or WebP.");
  if (buffer.length < 32 || buffer.length > MAX_VISUAL_SELF_REFERENCE_BYTES) throw new Error("Reference image must be smaller than 4 MB.");
  const actual = imageSize(buffer);
  if (!actual) throw new Error("Invalid reference image bytes.");
  const detected = actual.type === "png" ? "image/png" : actual.type === "jpeg" ? "image/jpeg" : actual.type === "webp" ? "image/webp" : "";
  if (mime !== detected) throw new Error("Image content does not match its declared type.");
  if (actual.width < 160 || actual.height < 160 || actual.width > 4096 || actual.height > 4096) {
    throw new Error("Reference image dimensions must be between 160 and 4096 pixels per side.");
  }
  return { mime: mime as AcceptedMime, width: actual.width, height: actual.height };
}

/** Never accept likeness guidance from the image-prompt writer or the client. */
export function shouldAttachFaceReference(
  mode: VisualSelfInsertMode | string | null | undefined,
  visualPlan?: WrappedVisualPlan | null,
): boolean {
  if (normalizeVisualSelfMode(mode) === "never") return false;
  return visualPlan?.castMode === "self" || visualPlan?.castMode === "in-world-self";
}

export function readUserFaceReference(db: Db, userId: string): string | null {
  try {
    const row = db.prepare(
      "SELECT image, mime FROM visual_self_references WHERE userId = ?"
    ).get(userId) as { image: Buffer; mime: string } | undefined;
    if (!row || !Buffer.isBuffer(row.image)) return null;
    validateFacePhoto(row.image, row.mime);
    return "data:" + row.mime + ";base64," + row.image.toString("base64");
  } catch {
    // Old test databases without the migration, or unavailable private photo,
    // retain the established text-only likeness path.
    return null;
  }
}
