import type { Express } from "express";
import type { ServerContext } from "../context";
import { v4 as uuidv4 } from "uuid";

export function registerTaxonomyRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  // Taxonomy API
  app.get("/api/taxonomy", (req, res) => {
    try {
      const type = req.query.type as string;
      let query = 'SELECT * FROM global_taxonomy ORDER BY usageCount DESC, name ASC';
      const params: any[] = [];
      
      if (type === 'genre' || type === 'tag') {
        query = 'SELECT * FROM global_taxonomy WHERE type = ? ORDER BY usageCount DESC, name ASC';
        params.push(type);
      }
      
      const results = db.prepare(query).all(...params);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/taxonomy", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      const { name, type } = req.body;
      if (!name || (type !== 'genre' && type !== 'tag')) {
        return res.status(400).json({ error: 'Invalid taxonomy data' });
      }

      const id = uuidv4();
      db.prepare('INSERT INTO global_taxonomy (id, type, name) VALUES (?, ?, ?)').run(id, type, name);
      res.json({ id, type, name, usageCount: 0 });
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint')) {
        res.status(400).json({ error: 'Taxonomy item already exists' });
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.delete("/api/taxonomy/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      db.prepare('DELETE FROM global_taxonomy WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/taxonomy/:id/edit", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      const id = req.params.id;
      const { newName } = req.body;
      
      if (!newName || typeof newName !== 'string' || newName.trim() === '') {
         return res.status(400).json({ error: 'Invalid name provided' });
      }

      const taxItem: any = db.prepare('SELECT * FROM global_taxonomy WHERE id = ?').get(id);
      
      if (!taxItem) {
        return res.status(404).json({ error: 'Taxonomy item not found' });
      }
      
      const oldName = taxItem.name;

      const existing = db.prepare('SELECT id FROM global_taxonomy WHERE name = ? AND type = ? AND id != ?').get(newName.trim(), taxItem.type, id);
      if (existing) {
        return res.status(400).json({ error: `A ${taxItem.type} with this name already exists.` });
      }

      db.transaction(() => {
        db.prepare('UPDATE global_taxonomy SET name = ? WHERE id = ?').run(newName.trim(), id);
        
        const allMedia: any[] = db.prepare('SELECT id, genres, tags FROM media').all();
        const updateMedia = db.prepare('UPDATE media SET genres = ?, tags = ? WHERE id = ?');
        
        for (const m of allMedia) {
          let updated = false;
          let mGenres = [];
          let mTags = [];
          try {
            mGenres = JSON.parse(m.genres || '[]');
            mTags = JSON.parse(m.tags || '[]');
          } catch (e) {
            continue;
          }
          
          if (taxItem.type === 'genre') {
            const idx = mGenres.findIndex((g: string) => g.toLowerCase() === oldName.toLowerCase());
            if (idx !== -1) {
              mGenres[idx] = newName.trim();
              mGenres = Array.from(new Set(mGenres)); // deduplicate
              updated = true;
            }
          } else {
            const idx = mTags.findIndex((t: string) => t.toLowerCase() === oldName.toLowerCase());
            if (idx !== -1) {
              mTags[idx] = newName.trim();
              mTags = Array.from(new Set(mTags)); // deduplicate
              updated = true;
            }
          }
          
          if (updated) {
            updateMedia.run(JSON.stringify(mGenres), JSON.stringify(mTags), m.id);
          }
        }
      })();
      res.json({ success: true, newName: newName.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/taxonomy/:id/move", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
      if (user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can modify taxonomy' });
      }

      const id = req.params.id;
      const taxItem: any = db.prepare('SELECT * FROM global_taxonomy WHERE id = ?').get(id);
      
      if (!taxItem) {
        return res.status(404).json({ error: 'Taxonomy item not found' });
      }

      const newType = taxItem.type === 'genre' ? 'tag' : 'genre';
      
      const existing = db.prepare('SELECT id FROM global_taxonomy WHERE name = ? AND type = ?').get(taxItem.name, newType);
      if (existing) {
        return res.status(400).json({ error: `A ${newType} with this name already exists.` });
      }

      db.transaction(() => {
        db.prepare('UPDATE global_taxonomy SET type = ? WHERE id = ?').run(newType, id);
        
        const allMedia: any[] = db.prepare('SELECT id, genres, tags FROM media').all();
        const updateMedia = db.prepare('UPDATE media SET genres = ?, tags = ? WHERE id = ?');
        
        for (const m of allMedia) {
          let updated = false;
          let mGenres = [];
          let mTags = [];
          try {
            mGenres = JSON.parse(m.genres || '[]');
            mTags = JSON.parse(m.tags || '[]');
          } catch (e) {
            continue;
          }
          
          if (taxItem.type === 'genre') {
            const idx = mGenres.findIndex((g: string) => g.toLowerCase() === taxItem.name.toLowerCase());
            if (idx !== -1) {
              mGenres.splice(idx, 1);
              if (!mTags.find((t: string) => t.toLowerCase() === taxItem.name.toLowerCase())) {
                mTags.push(taxItem.name);
              }
              updated = true;
            }
          } else {
            const idx = mTags.findIndex((t: string) => t.toLowerCase() === taxItem.name.toLowerCase());
            if (idx !== -1) {
              mTags.splice(idx, 1);
              if (!mGenres.find((g: string) => g.toLowerCase() === taxItem.name.toLowerCase())) {
                mGenres.push(taxItem.name);
              }
              updated = true;
            }
          }
          
          if (updated) {
            updateMedia.run(JSON.stringify(mGenres), JSON.stringify(mTags), m.id);
          }
        }
      })();
      res.json({ success: true, newType });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

}
