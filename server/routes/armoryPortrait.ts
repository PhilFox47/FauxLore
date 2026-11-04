import type { Express } from "express";
import type { ServerContext } from "../context";
import type { createArmoryPortraitService } from "../services/armoryPortrait";

export function registerArmoryPortraitRoutes(
  app: Express, ctx: ServerContext, portraits: ReturnType<typeof createArmoryPortraitService>,
) {
  const {getAuthUser,activity} = ctx;
  app.get("/api/armory/portrait", (req,res) => {
    try {
      const userId = getAuthUser(req,res);
      if (!userId) return;
      res.setHeader("Cache-Control","private, no-store");
      res.json(portraits.status(userId));
    } catch (e: any) {res.status(500).json({error:String(e?.message||e)});}
  });
  app.get("/api/armory/portrait/image", (req,res) => {
    try {
      const userId = getAuthUser(req,res);
      if (!userId) return;
      const picture = portraits.image(userId);
      if (!picture) return res.status(404).json({error:"No character portrait has been generated."});
      res.setHeader("Cache-Control","private, no-store");
      res.setHeader("X-Content-Type-Options","nosniff");
      res.type(picture.mime).send(picture.bytes);
    } catch (e: any) {res.status(500).json({error:String(e?.message||e)});}
  });
  app.post("/api/armory/portrait/generate", (req,res) => {
    try {
      const userId = getAuthUser(req,res);
      if (!userId) return;
      if (!activity.requireActive(userId,res)) return;
      const outcome = portraits.generate(userId);
      res.setHeader("Cache-Control","private, no-store");
      res.status(outcome.accepted ? 202 : 409).json(outcome);
    } catch (e: any) {res.status(500).json({error:String(e?.message||e)});}
  });
}
