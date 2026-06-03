import fs from "fs";
import path from "path";

/** SQLite file-copy backup manager (keeps the most recent 28 backups). */
export function createBackupManager({ dbPath, backupsDir }: { dbPath: string; backupsDir: string }) {
  function createDatabaseBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const backupFile = path.join(backupsDir, `fauxlore-backup-${timestamp}.db`);
      fs.copyFileSync(dbPath, backupFile);
      
      // Keep only last 28 backups
      const backups = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('fauxlore-backup-') && f.endsWith('.db'))
        .sort();
      
      if (backups.length > 28) {
        const toDelete = backups.slice(0, backups.length - 28);
        for (const f of toDelete) {
          fs.unlinkSync(path.join(backupsDir, f));
        }
      }
      return { success: true, file: backupFile };
    } catch (e: any) {
      console.error("Backup failed", e);
      return { success: false, error: e.message };
    }
  }
  return { createDatabaseBackup };
}
