import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import initSqlJs, { Database } from "sql.js";

let db: Database;
let dbPath = "";
let session: { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" } | null = null;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
function saveDb() { fs.writeFileSync(dbPath, Buffer.from(db.export())); }
function query(sql: string, params: any[] = []) {
  const stmt = db.prepare(sql); stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}
function audit(action: string, entityType: string, entityId: number | null, details: string) {
  if (!session) return;
  db.run("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)", [session.id, action, entityType, entityId, details, new Date().toISOString()]);
  saveDb();
}

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      if (app.isPackaged) return path.join(process.resourcesPath, "node_modules", "sql.js", "dist", file);
      return path.join(process.cwd(), "node_modules", "sql.js", "dist", file);
    }
  });
  dbPath = path.join(app.getPath("userData"), "almaktaba.sqlite");
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('partner1','partner2','admin')),
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      reason TEXT NOT NULL,
      beneficiary TEXT,
      notes TEXT,
      visibility TEXT NOT NULL DEFAULT 'shop' CHECK(visibility IN ('shop','admin_private')),
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      void_reason TEXT,
      voided_by INTEGER,
      voided_at TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(voided_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );
  `);

  const count = Number(query("SELECT COUNT(*) AS c FROM users")[0]?.c ?? 0);
  if (!count) {
    const now = new Date().toISOString();
    const users = [
      ["partner1", "الشريك 1", "partner1", "1234"],
      ["partner2", "الشريك 2", "partner2", "1234"],
      ["admin", "الحساب 3", "admin", "1234"]
    ];
    for (const [username, displayName, role, password] of users) {
      db.run("INSERT INTO users(username,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?)", [username, displayName, role, hashPassword(String(password)), now]);
    }
    saveDb();
  }
}

function visibleTransactions() {
  if (!session) return [];
  if (session.role === "admin") {
    return query(`SELECT t.*, u.display_name AS created_by_name FROM transactions t JOIN users u ON u.id=t.created_by WHERE t.visibility='shop' OR (t.visibility='admin_private' AND t.created_by=?) ORDER BY t.id DESC`, [session.id]);
  }
  // كل عملية أنشأها الحساب السري تبقى سرية، حتى لو كانت قيمة visibility القديمة هي shop.
  // هذا يحمي أيضًا العمليات القديمة التي أُنشئت قبل تطبيق قاعدة السرية.
  return query(`SELECT t.*, u.display_name AS created_by_name FROM transactions t JOIN users u ON u.id=t.created_by WHERE t.visibility='shop' AND u.role != 'admin' ORDER BY t.id DESC`);
}

ipcMain.handle("auth:login", (_event, { username, password }) => {
  const user = query("SELECT * FROM users WHERE username=? AND active=1", [username])[0];
  if (!user || !verifyPassword(password, user.password_hash)) return { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  session = { id: Number(user.id), username: user.username, displayName: user.display_name, role: user.role };
  audit("login", "auth", null, "تسجيل دخول");
  return { ok: true, user: session };
});

ipcMain.handle("auth:logout", () => { session = null; return { ok: true }; });
ipcMain.handle("auth:session", () => session);

ipcMain.handle("auth:change-own-password", (_event, { oldPassword, newPassword }) => {
  if (!session) return { ok: false, error: "غير مسجل الدخول" };
  if (String(newPassword || "").length < 6) return { ok: false, error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف/أرقام على الأقل" };
  const u = query("SELECT password_hash FROM users WHERE id=?", [session.id])[0];
  if (!u || !verifyPassword(oldPassword, u.password_hash)) return { ok: false, error: "كلمة المرور الحالية غير صحيحة" };
  db.run("UPDATE users SET password_hash=? WHERE id=?", [hashPassword(newPassword), session.id]);
  audit("password_change", "user", session.id, "تغيير كلمة المرور الذاتية");
  saveDb();
  return { ok: true };
});

ipcMain.handle("transactions:list", () => visibleTransactions());

ipcMain.handle("transactions:create", (_event, input) => {
  if (!session) return { ok: false, error: "غير مسجل الدخول" };
  const type = String(input?.type || "").trim();
  const reason = String(input?.reason || "").trim();
  const amount = Number(input?.amount);
  if (!type || !reason || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: "نوع العملية والمبلغ والتبرير حقول إجبارية" };
  const beneficiary = String(input?.beneficiary || "").trim();
  const notes = String(input?.notes || "").trim();
  // أي عملية يسجلها الحساب السري خاصة به تلقائيًا ولا يمكن جعلها ظاهرة للشريكين.
  const visibility = session.role === "admin" ? "admin_private" : "shop";
  const now = new Date().toISOString();
  db.run("INSERT INTO transactions(type,amount,reason,beneficiary,notes,visibility,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)", [type, amount, reason, beneficiary, notes, visibility, session.id, now]);
  const id = Number(query("SELECT last_insert_rowid() AS id")[0].id);
  audit("create", "transaction", id, JSON.stringify({ type, amount, reason, beneficiary, notes, visibility }));
  saveDb();
  return { ok: true, id };
});

ipcMain.handle("transactions:update", (_event, { id, input }) => {
  if (!session) return { ok: false, error: "غير مسجل الدخول" };
  const t = query("SELECT * FROM transactions WHERE id=? AND status='active'", [id])[0];
  if (!t) return { ok: false, error: "العملية غير موجودة" };
  if (session.role !== "admin" && Number(t.created_by) !== session.id) return { ok: false, error: "لا يمكنك تعديل عملية سجلها الشريك الآخر" };
  if (t.visibility === "admin_private" && session.role !== "admin") return { ok: false, error: "هذه العملية خاصة" };
  const type = String(input?.type || "").trim();
  const reason = String(input?.reason || "").trim();
  const amount = Number(input?.amount);
  if (!type || !reason || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: "نوع العملية والمبلغ والتبرير حقول إجبارية" };
  const beneficiary = String(input?.beneficiary || "").trim();
  const notes = String(input?.notes || "").trim();
  const visibility = session.role === "admin" ? "admin_private" : t.visibility;
  const now = new Date().toISOString();
  db.run("UPDATE transactions SET type=?,amount=?,reason=?,beneficiary=?,notes=?,visibility=?,updated_at=? WHERE id=?", [type, amount, reason, beneficiary, notes, visibility, now, id]);
  audit("update", "transaction", id, JSON.stringify({ previous: t, newValues: input }));
  saveDb();
  return { ok: true };
});

ipcMain.handle("transactions:void", (_event, { id, reason }) => {
  if (!session) return { ok: false, error: "غير مسجل الدخول" };
  const t = query("SELECT * FROM transactions WHERE id=? AND status='active'", [id])[0];
  if (!t) return { ok: false, error: "العملية غير موجودة" };
  if (session.role !== "admin" && Number(t.created_by) !== session.id) return { ok: false, error: "لا يمكنك إلغاء عملية الشريك الآخر" };
  const now = new Date().toISOString();
  db.run("UPDATE transactions SET status='void',void_reason=?,voided_by=?,voided_at=? WHERE id=?", [String(reason || "بدون سبب").trim(), session.id, now, id]);
  audit("void", "transaction", id, String(reason || "بدون سبب").trim());
  saveDb();
  return { ok: true };
});

ipcMain.handle("system:backup", async () => {
  if (!session || session.role !== "admin") return { ok: false, error: "النسخ الاحتياطي متاح للحساب 3 فقط" };
  const result = await dialog.showSaveDialog({ title: "حفظ نسخة احتياطية", defaultPath: `almaktaba-${new Date().toISOString().slice(0, 10)}.sqlite`, filters: [{ name: "SQLite", extensions: ["sqlite"] }] });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.copyFileSync(dbPath, result.filePath);
  return { ok: true, path: result.filePath };
});

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    title: "المكتبة",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  if (!app.isPackaged) win.loadURL("http://localhost:5173");
  else win.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => { await initDb(); createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
