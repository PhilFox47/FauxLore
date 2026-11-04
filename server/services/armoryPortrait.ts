import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../context";
import { imageSize } from "../lib/imageSize";
import { readUserFaceReference } from "../lib/visualSelfReference";
import { normalizeVisualSelfDescription, normalizeVisualSelfMode } from "../../src/lib/visualSelf";
import {
  buildArmoryPortraitPrompt, equippedPortraitItems, portraitLoadoutKey,
  type ArmoryPortraitItem, type ArmorySlot,
} from "../../src/lib/armoryPortrait";

type PortraitRow = {
  userId: string; image: Buffer | null; mime: string | null;
  snapshotHash: string | null; status: string; requestId: string | null;
  error: string | null; updatedAt: string | null;
};
export type ArmoryPortraitStatus = {
  status: "idle" | "generating" | "done" | "failed";
  hasImage: boolean; stale: boolean; updatedAt: string | null; error: string | null;
  equippedCount: number; hasFaceReference: boolean; referenceCount: number;
};
type PortraitDeps = {
  db: Db;
  aiImagesDir: string;
  generateImage: (userId: string, prompt: string, referenceDataUrls: string[]) => Promise<string>;
};

function localEquipmentReference(aiImagesDir: string, imageUrl?: string | null): string | null {
  // Do not fetch arbitrary remote URLs (SSRF), user paths, traversal, or content
  // from other upload folders. Artifact illustrations are saved in ai-images.
  const filename = String(imageUrl || "").match(/^\/uploads\/ai-images\/([A-Za-z0-9_-]{8,120}\.(?:png|jpe?g|webp))$/i)?.[1];
  if (!filename) return null;
  try {
    const bytes = fs.readFileSync(path.join(aiImagesDir, filename));
    if (bytes.length > 3 * 1024 * 1024 || bytes.length < 32) return null;
    const info = imageSize(bytes);
    if (!info || info.width < 64 || info.height < 64 || info.width > 4096 || info.height > 4096) return null;
    const mime = info.type === "jpg" || info.type === "jpeg" ? "image/jpeg"
      : info.type === "png" ? "image/png" : info.type === "webp" ? "image/webp" : null;
    return mime ? "data:" + mime + ";base64," + bytes.toString("base64") : null;
  } catch { return null; }
}

export function createArmoryPortraitService({ db, aiImagesDir, generateImage }: PortraitDeps) {
  const current = db.prepare("SELECT * FROM armory_portraits WHERE userId=?");
  const currentGear = db.prepare(
    "SELECT id, slot, name, description, rarity, type, imageUrl, imagePrompt " +
    "FROM artifacts WHERE userId=? AND isEquipped=1 AND COALESCE(durability, 1)>0"
  );

  function selection(userId: string) {
    const gear = equippedPortraitItems(currentGear.all(userId) as ArmoryPortraitItem[]);
    const settings = (db.prepare(
      "SELECT visualSelfInsertMode, visualSelfDescription FROM settings WHERE userId=?"
    ).get(userId) as {visualSelfInsertMode?: string; visualSelfDescription?: string} | undefined) || {};
    const face = db.prepare("SELECT updatedAt FROM visual_self_references WHERE userId=?")
      .get(userId) as {updatedAt: string} | undefined;
    const allowOwner = normalizeVisualSelfMode(settings.visualSelfInsertMode) !== "never";
    const appearance = allowOwner ? normalizeVisualSelfDescription(settings.visualSelfDescription) : "";
    const faceRevision = allowOwner ? (face?.updatedAt || "") : "";
    const fingerprint = createHash("sha256").update(
      portraitLoadoutKey(gear, faceRevision) + JSON.stringify([allowOwner, appearance])
    ).digest("hex");
    return {gear, appearance, allowOwner, faceRevision, fingerprint};
  }

  function status(userId: string): ArmoryPortraitStatus {
    const row = current.get(userId) as PortraitRow | undefined;
    const chosen = selection(userId);
    const validStatus = row?.status === "generating" || row?.status === "done" || row?.status === "failed"
      ? row.status : "idle";
    return {
      status: validStatus, hasImage: !!row?.image,
      stale: !!row?.image && row?.snapshotHash !== chosen.fingerprint,
      updatedAt: row?.updatedAt || null, error: row?.error || null,
      equippedCount: chosen.gear.length,
      hasFaceReference: chosen.allowOwner && !!chosen.faceRevision,
      referenceCount: chosen.gear.filter(a=>!!a.imageUrl).length,
    };
  }

  function image(userId: string): {bytes: Buffer; mime: string} | null {
    const row = current.get(userId) as PortraitRow | undefined;
    return row?.image && row.mime ? {bytes: row.image, mime:row.mime} : null;
  }

  function generate(userId: string): {accepted: boolean; message: string} {
    const chosen = selection(userId);
    if (!chosen.gear.length) return {accepted:false, message:"Equip at least one working item first."};
    const existing = current.get(userId) as PortraitRow | undefined;
    if (existing?.status === "generating") {
      return {accepted:false,message:"A character portrait is already generating."};
    }
    const requestId = randomUUID();
    db.prepare(
      "INSERT INTO armory_portraits(userId,status,requestId,error,updatedAt) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(userId) DO UPDATE SET status=excluded.status,requestId=excluded.requestId,error=NULL,updatedAt=excluded.updatedAt"
    ).run(userId,"generating",requestId,null,new Date().toISOString());
    void render(userId,chosen,requestId);
    return {accepted:true,message:"Character portrait generation started."};
  }

  async function render(
    userId: string, chosen: ReturnType<typeof selection>, requestId: string,
  ): Promise<void> {
    try {
      // Reference order is explicit and matches the prompt's numbered list.
      const sys = (db.prepare("SELECT aiProvider,cliProxyImageModel FROM system_settings WHERE id='system'")
        .get() as {aiProvider?: string;cliProxyImageModel?: string} | undefined) || {};
      const imageEdits = sys.aiProvider === "cliProxy" && /^gpt-image-/i.test(sys.cliProxyImageModel || "");
      const references: string[] = [];
      const face = imageEdits && chosen.allowOwner ? readUserFaceReference(db,userId) : null;
      if (face) references.push(face);
      const referencedSlots: ArmorySlot[] = [];
      if (imageEdits) for (const item of chosen.gear) {
        const ref = localEquipmentReference(aiImagesDir,item.imageUrl);
        if (ref) {references.push(ref);referencedSlots.push(item.slot as ArmorySlot);}
      }
      const prompt = buildArmoryPortraitPrompt(chosen.gear,chosen.appearance,!!face,referencedSlots,chosen.allowOwner);
      const dataUrl = await generateImage(userId,prompt,references);
      const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("Image provider did not return a private image.");
      const bytes = Buffer.from(match[2],"base64");
      if (bytes.length > 16 * 1024 * 1024 || bytes.length < 64) throw new Error("Unexpected portrait image size.");
      const info = imageSize(bytes);
      if (!info || Math.abs(info.width/info.height - 2/3) > 0.035) {
        throw new Error("Portrait image must have vertical 2:3 framing.");
      }
      // Token prevents an older request from overwriting a newer manual render.
      db.prepare(
        "UPDATE armory_portraits SET image=?,mime=?,snapshotHash=?,status='done'," +
        "requestId=NULL,error=NULL,updatedAt=? WHERE userId=? AND requestId=?"
      ).run(bytes,"image/"+match[1],chosen.fingerprint,new Date().toISOString(),userId,requestId);
    } catch (error: any) {
      console.error("[armory-portrait] Generation failed:",String(error?.message || error));
      db.prepare(
        "UPDATE armory_portraits SET status='failed',requestId=NULL,error=?,updatedAt=? WHERE userId=? AND requestId=?"
      ).run(String(error?.message || error).slice(0,400),new Date().toISOString(),userId,requestId);
    }
  }

  return { status, image, generate };
}
