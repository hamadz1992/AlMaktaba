import { IpcMain, app, dialog } from "electron";
import type { Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";

function nextProductCode(query: (sql: string, params?: any[]) => any[]) {
  const row = query("SELECT COALESCE(MAX(id),0) + 1 AS next_id FROM products")[0];
  return `PRD-${String(Number(row?.next_id ?? 1)).padStart(6, "0")}`;
}

function backupDirectory() { return path.join(app.getPath("userData"), "backups"); }
function databasePath() { return path.join(app.getPath("userData"), "almaktaba.sqlite"); }
function listBackupFiles() {
  const dir = backupDirectory();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".sqlite"))
    .map(entry => {
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      return { name: entry.name, path: filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function registerProductCreateHandler(
  ipcMain: IpcMain,
  getDb: () => Database,
  getSession: () => { id: number; role?: string } | null,
  saveDb: () => void,
  query: (sql: string, params?: any[]) => any[]
) {
  ipcMain.handle("products:create-safe", (_event, input) => {
    const session = getSession();
    if (!session) return { ok: false, error: "غير مسجل الدخول" };

    const db = getDb();
    try {
      const columns = query("PRAGMA table_info(products)");
      const names = new Set(columns.map((c: any) => String(c.name)));
      const migrations: Array<[string, string]> = [
        ["sku", "TEXT"], ["unit", "TEXT NOT NULL DEFAULT 'قطعة'"],
        ["purchase_price", "REAL NOT NULL DEFAULT 0"], ["sale_price", "REAL NOT NULL DEFAULT 0"],
        ["quantity", "REAL NOT NULL DEFAULT 0"], ["min_quantity", "REAL NOT NULL DEFAULT 0"],
        ["active", "INTEGER NOT NULL DEFAULT 1"], ["created_at", "TEXT"], ["updated_at", "TEXT"]
      ];
      for (const [name, definition] of migrations) if (!names.has(name)) db.run(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);

      const name = String(input?.name ?? "").trim();
      let sku = String(input?.sku ?? "").trim();
      const unit = String(input?.unit ?? "قطعة").trim() || "قطعة";
      const purchase = Number(input?.purchasePrice ?? 0), sale = Number(input?.salePrice ?? 0), quantity = Number(input?.quantity ?? 0), min = Number(input?.minQuantity ?? 0);
      if (!name) return { ok: false, error: "اسم المنتج إجباري" };
      if (![purchase, sale, quantity, min].every(Number.isFinite) || [purchase, sale, quantity, min].some(v => v < 0)) return { ok: false, error: "تحقق من الأسعار والكميات" };

      if (sku) {
        const duplicate = query("SELECT id FROM products WHERE sku=? AND active=1", [sku])[0];
        if (duplicate) return { ok: false, error: "رمز المنتج مستخدم بالفعل" };
      } else {
        sku = nextProductCode(query);
        while (query("SELECT id FROM products WHERE sku=?", [sku]).length) sku = `PRD-${String(Date.now()).slice(-8)}`;
      }

      const now = new Date().toISOString();
      db.run("INSERT INTO products(name,sku,unit,purchase_price,sale_price,quantity,min_quantity,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", [name, sku, unit, purchase, sale, quantity, min, 1, now, now]);
      const id = Number(query("SELECT last_insert_rowid() AS id")[0]?.id ?? 0);
      saveDb();
      return { ok: true, id, sku };
    } catch (error) {
      console.error("products:create-safe failed", error);
      return { ok: false, error: `تعذر إضافة المنتج: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  ipcMain.handle("audit:transactions", () => {
    const session = getSession();
    if (!session) return { ok: false, error: "جلسة الدخول غير موجودة" };
    const currentUser = query("SELECT id, role FROM users WHERE id=? AND active=1", [session.id])[0];
    if (!currentUser || String(currentUser.role) !== "admin") return { ok: false, error: "هذه الصفحة متاحة للحساب الإداري فقط" };
    try {
      const rows = query(`
        SELECT a.id,a.action,a.entity_id,a.details,a.created_at,
          u.display_name AS actor_name,u.username AS actor_username,
          t.type,t.amount,t.reason,t.void_reason,t.status
        FROM audit_logs a
        JOIN users u ON u.id=a.actor_id
        LEFT JOIN transactions t ON t.id=a.entity_id
        WHERE a.entity_type='transaction' AND a.action IN ('create','update','void')
        ORDER BY a.id DESC
      `);
      return { ok: true, rows };
    } catch (error) {
      console.error("audit:transactions failed", error);
      return { ok: false, error: `تعذر قراءة سجل التعديلات: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  ipcMain.handle("backup:list", () => {
    const session = getSession();
    if (!session || session.role !== "admin") return { ok: false, error: "هذه العملية متاحة للحساب الإداري فقط" };
    return { ok: true, backups: listBackupFiles().map(({ name, size, modifiedAt }) => ({ name, size, modifiedAt })) };
  });

  ipcMain.handle("backup:restore", async (_event, requestedName?: unknown) => {
    const session = getSession();
    if (!session || session.role !== "admin") return { ok: false, error: "استعادة قاعدة البيانات متاحة للحساب الإداري فقط" };
    try {
      let sourcePath = "";
      if (typeof requestedName === "string" && requestedName.trim()) {
        const safeName = path.basename(requestedName.trim());
        const candidate = path.join(backupDirectory(), safeName);
        if (!fs.existsSync(candidate) || !candidate.toLowerCase().endsWith(".sqlite")) return { ok: false, error: "النسخة الاحتياطية غير موجودة" };
        sourcePath = candidate;
      } else {
        const result = await dialog.showOpenDialog({
          title: "اختيار نسخة احتياطية للاستعادة",
          defaultPath: backupDirectory(),
          properties: ["openFile"],
          filters: [{ name: "قاعدة بيانات المكتبة", extensions: ["sqlite"] }]
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
        sourcePath = result.filePaths[0];
      }
      const source = fs.readFileSync(sourcePath);
      if (source.length < 16 || source.subarray(0, 15).toString("utf8") !== "SQLite format 3") return { ok: false, error: "الملف المحدد ليس قاعدة بيانات SQLite صالحة" };
      saveDb();
      const currentPath = databasePath();
      fs.mkdirSync(path.dirname(currentPath), { recursive: true });
      const safetyDir = backupDirectory();
      fs.mkdirSync(safetyDir, { recursive: true });
      const safetyName = `قبل-الاستعادة-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
      fs.copyFileSync(currentPath, path.join(safetyDir, safetyName));
      fs.copyFileSync(sourcePath, currentPath);
      app.relaunch();
      app.exit(0);
      return { ok: true };
    } catch (error) {
      console.error("backup:restore failed", error);
      return { ok: false, error: `تعذر استعادة قاعدة البيانات: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
}
