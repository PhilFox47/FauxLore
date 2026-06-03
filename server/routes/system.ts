import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerSystemRoutes(app: Express, ctx: ServerContext) {
  const { createDatabaseBackup } = ctx;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/backup", (req, res) => {
    const result = createDatabaseBackup();
    if (result.success) {
      res.json({ message: "Backup created successfully", file: result.file });
    } else {
      res.status(500).json({ error: result.error });
    }
  });

}
