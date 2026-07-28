import type { Express } from "express";
import type { ServerContext } from "../context";
import { randomUUID } from "crypto";

/**
 * Location groups: a layer over the free-text location on each log.
 *
 * Merging rewrites history — three cinema names become one and the detail is
 * gone. Grouping leaves every log exactly as written and adds a second reading
 * on top: these places are all cinemas, those are all home, that one is both a
 * cinema and in Wolfenbüttel. Statistics and recaps can then talk about kinds of
 * place, which no amount of renaming would let them do.
 *
 * Membership is stored against the location string rather than an id, because
 * that is all a log has. Renaming a location has to carry its memberships along,
 * which the merge route handles.
 */
export function registerLocationRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  /** Groups with their members, ready to use. */
  const readGroups = (userId: string) => {
    const groups = db
      .prepare("SELECT * FROM location_groups WHERE userId = ? ORDER BY name COLLATE NOCASE")
      .all(userId) as any[];
    const members = db
      .prepare("SELECT groupId, location FROM location_group_members WHERE userId = ?")
      .all(userId) as { groupId: string; location: string }[];
    const byGroup = new Map<string, string[]>();
    members.forEach((m) => {
      const list = byGroup.get(m.groupId) || [];
      list.push(m.location);
      byGroup.set(m.groupId, list);
    });
    return groups.map((g) => ({
      ...g,
      locations: (byGroup.get(g.id) || []).sort((a, b) => a.localeCompare(b)),
    }));
  };

  app.get("/api/location-groups", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json(readGroups(userId as string));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  /** Creates or renames a group. Members are set separately. */
  app.post("/api/location-groups", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const body = req.body || {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "A group needs a name." });

      const id = body.id || randomUUID();
      const existing: any = db.prepare("SELECT id FROM location_groups WHERE id = ? AND userId = ?").get(id, userId);

      // The unique index would throw a bare constraint error; say what happened.
      const clash: any = db
        .prepare("SELECT id FROM location_groups WHERE userId = ? AND name = ? COLLATE NOCASE AND id != ?")
        .get(userId, name, id);
      if (clash) return res.status(409).json({ error: `You already have a group called "${name}".` });

      if (existing) {
        db.prepare("UPDATE location_groups SET name = ?, color = ?, icon = ? WHERE id = ? AND userId = ?")
          .run(name, body.color || null, body.icon || null, id, userId);
      } else {
        db.prepare("INSERT INTO location_groups (id, userId, name, color, icon, createdAt) VALUES (?,?,?,?,?,?)")
          .run(id, userId, name, body.color || null, body.icon || null, new Date().toISOString());
      }

      if (Array.isArray(body.locations)) setMembers(userId as string, id, body.locations);
      res.json(readGroups(userId as string).find((g) => g.id === id));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  /** Replaces a group's membership wholesale — idempotent, and easy to reason about. */
  const setMembers = (userId: string, groupId: string, locations: any[]) => {
    const clean = Array.from(
      new Set(
        locations
          .map((l) => (typeof l === "string" ? l.trim() : ""))
          .filter(Boolean),
      ),
    );
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM location_group_members WHERE groupId = ? AND userId = ?").run(groupId, userId);
      const ins = db.prepare("INSERT OR IGNORE INTO location_group_members (groupId, userId, location) VALUES (?,?,?)");
      clean.forEach((loc) => ins.run(groupId, userId, loc));
    });
    tx();
  };

  app.post("/api/location-groups/:id/members", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const group: any = db.prepare("SELECT id FROM location_groups WHERE id = ? AND userId = ?").get(req.params.id, userId);
      if (!group) return res.status(404).json({ error: "No such group." });
      setMembers(userId as string, req.params.id, Array.isArray(req.body?.locations) ? req.body.locations : []);
      res.json(readGroups(userId as string).find((g) => g.id === req.params.id));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.delete("/api/location-groups/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Deleting a group never touches a log: grouping was only ever a label.
      db.prepare("DELETE FROM location_group_members WHERE groupId = ? AND userId = ?").run(req.params.id, userId);
      db.prepare("DELETE FROM location_groups WHERE id = ? AND userId = ?").run(req.params.id, userId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
}
