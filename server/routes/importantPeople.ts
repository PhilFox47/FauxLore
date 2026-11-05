import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import type { ServerContext } from "../context";
import { validateFacePhoto, MAX_VISUAL_SELF_REFERENCE_BYTES } from "../lib/visualSelfReference";

/** Sensitive third-party profiles and photos are never included in /api/settings. */
export function registerImportantPeopleRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;
  const select = db.prepare(
    "SELECT id,name,aliases,relationship,notes,appearance,allowImages, " +
    "(image IS NOT NULL) AS hasImage FROM important_people WHERE userId=? ORDER BY name COLLATE NOCASE",
  );
  const one = db.prepare("SELECT * FROM important_people WHERE userId=? AND id=?");
  const publicRow = (row: any) => ({
    id: row.id, name: row.name,
    aliases: (() => { try { const value = JSON.parse(row.aliases || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } })(),
    relationship: row.relationship || "", notes: row.notes || "",
    appearance: row.appearance || "", allowImages: !!row.allowImages,
    hasImage: !!row.hasImage,
  });
  const parseProfile = (input: any) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid person.");
    const field = (key: string, max: number) => {
      if (typeof input[key] !== "string" || input[key].length > max * 2)
        throw new Error("Invalid " + key + ".");
      return input[key].trim().slice(0, max);
    };
    const name = field("name", 100);
    if (name.length < 2) throw new Error("Name must have at least two characters.");
    const relationship = field("relationship", 220);
    const notes = field("notes", 2000);
    const appearance = field("appearance", 800);
    if (!Array.isArray(input.aliases) || input.aliases.length > 12 ||
      input.aliases.some((s: unknown) => typeof s !== "string" || s.length > 80))
      throw new Error("Provide up to twelve short aliases.");
    if (typeof input.allowImages !== "boolean") throw new Error("Invalid image consent setting.");
    const aliases = [...new Set(input.aliases.map((s: string) => s.trim()).filter(Boolean))]
      .filter((s: string) => s.toLocaleLowerCase() !== name.toLocaleLowerCase());
    return { name, aliases: JSON.stringify(aliases), relationship, notes, appearance, allowImages: input.allowImages ? 1 : 0 };
  };

  app.get("/api/important-people", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    try { res.setHeader("Cache-Control", "private, no-store"); res.json((select.all(userId) as any[]).map(publicRow)); }
    catch { res.status(500).json({error:"Could not load people."}); }
  });

  app.post("/api/important-people", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    try {
      const profile = parseProfile(req.body);
      const count = db.prepare("SELECT COUNT(*) AS n FROM important_people WHERE userId=?").get(userId) as {n:number};
      if (count.n >= 50) return res.status(400).json({error:"Maximum of 50 people per account."});
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare("INSERT INTO important_people(id,userId,name,aliases,relationship,notes,appearance,allowImages,createdAt,updatedAt) " +
        "VALUES(@id,@userId,@name,@aliases,@relationship,@notes,@appearance,@allowImages,@now,@now)")
        .run({id,userId,...profile,now});
      res.status(201).json({id,...req.body,name:profile.name,aliases:JSON.parse(profile.aliases),hasImage:false});
    } catch(e:any) { res.status(400).json({error:e.message || "Invalid person."}); }
  });

  app.put("/api/important-people/:id", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    if (!one.get(userId,req.params.id)) return res.status(404).json({error:"Person not found."});
    try {
      const profile = parseProfile(req.body);
      const now = new Date().toISOString();
      db.prepare("UPDATE important_people SET name=@name, aliases=@aliases, relationship=@relationship, " +
        "notes=@notes, appearance=@appearance, allowImages=@allowImages, updatedAt=@now WHERE userId=@userId AND id=@id")
        .run({...profile,now,userId,id:req.params.id});
      res.json({ok:true});
    } catch(e:any) { res.status(400).json({error:e.message || "Invalid person."}); }
  });

  app.delete("/api/important-people/:id", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    const removed = db.prepare("DELETE FROM important_people WHERE userId=? AND id=?").run(userId,req.params.id);
    res.status(removed.changes ? 200 : 404).json(removed.changes ? {ok:true} : {error:"Person not found."});
  });

  app.get("/api/important-people/:id/photo", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    const row = one.get(userId,req.params.id) as {image:Buffer|null;mime:string|null}|undefined;
    if (!row?.image || !row.mime) return res.status(404).json({error:"Photo not found."});
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(row.mime).send(row.image);
  });

  app.put("/api/important-people/:id/photo",
    express.raw({type:["image/png","image/jpeg","image/webp"],limit:MAX_VISUAL_SELF_REFERENCE_BYTES}),
    (req, res) => {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!one.get(userId,req.params.id)) return res.status(404).json({error:"Person not found."});
      try {
        if (!Buffer.isBuffer(req.body)) return res.status(415).json({error:"Use a PNG, JPEG or WebP photo."});
        const {mime,width,height} = validateFacePhoto(req.body,req.get("Content-Type")||"");
        db.prepare("UPDATE important_people SET image=?,mime=?,updatedAt=? WHERE userId=? AND id=?")
          .run(req.body,mime,new Date().toISOString(),userId,req.params.id);
        res.setHeader("Cache-Control","private, no-store");
        res.json({ok:true,width,height});
      } catch(e:any) { res.status(400).json({error:e.message || "Invalid photo."}); }
    });

  app.delete("/api/important-people/:id/photo", (req, res) => {
    const userId = getAuthUser(req, res);
    if (!userId) return;
    const changed = db.prepare("UPDATE important_people SET image=NULL,mime=NULL,updatedAt=? WHERE userId=? AND id=?")
      .run(new Date().toISOString(),userId,req.params.id);
    res.status(changed.changes ? 200 : 404).json(changed.changes ? {ok:true} : {error:"Person not found."});
  });
}
