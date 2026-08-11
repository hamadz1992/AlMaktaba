import { IpcMain } from "electron";
import type { Database } from "sql.js";

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
      const sku = String(input?.sku ?? "").trim();
      const unit = String(input?.unit ?? "قطعة").trim() || "قطعة";
      const purchase = Number(input?.purchasePrice ?? 0), sale = Number(input?.salePrice ?? 0), quantity = Number(input?.quantity ?? 0), min = Number(input?.minQuantity ?? 0);
      if (!name) return { ok: false, error: "اسم المنتج إجباري" };
      if (![purchase, sale, quantity, min].every(Number.isFinite) || [purchase, sale, quantity, min].some(v => v < 0)) return { ok: false, error: "تحقق من الأسعار والكميات" };
      const now = new Date().toISOString();
      db.run("INSERT INTO products(name,sku,unit,purchase_price,sale_price,quantity,min_quantity,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", [name, sku, unit, purchase, sale, quantity, min, 1, now, now]);
      const id = Number(query("SELECT last_insert_rowid() AS id")[0]?.id ?? 0);
      saveDb();
      return { ok: true, id };
    } catch (error) {
      console.error("products:create-safe failed", error);
      return { ok: false, error: `تعذر إضافة المنتج: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  ipcMain.handle("audit:transactions", () => {
    const session = getSession();
    if (!session || session.role !== "admin") return { ok: false, error: "غير متاح" };
    const rows = query(`SELECT a.id,a.action,a.entity_id,a.details,a.created_at,u.display_name AS actor_name,u.username AS actor_username,t.type,t.amount,t.reason,t.status
      FROM audit_logs a
      JOIN users u ON u.id=a.actor_id
      LEFT JOIN transactions t ON t.id=a.entity_id
      WHERE a.entity_type='transaction' AND a.action IN ('create','update','void')
      ORDER BY a.id DESC`);
    return { ok: true, rows };
  });
}
