import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import initSqlJs, { Database } from "sql.js";
import { registerProductCreateHandler } from "./products-ipc";

let db: Database;
let dbPath = "";
let mainWindow: BrowserWindow | null = null;
let backupTimer: ReturnType<typeof setInterval> | null = null;
let closeBackupDone = false;
let backupSettings: { intervalMinutes: number } = { intervalMinutes: 30 };
let session: { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" } | null = null;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`; }
function verifyPassword(password: string, stored: string) { const [salt, expected] = stored.split(":"); if (!salt || !expected) return false; const actual = crypto.scryptSync(password, salt, 64).toString("hex"); return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex")); }
function saveDb() { if (!db || !dbPath) return; fs.mkdirSync(path.dirname(dbPath), { recursive: true }); fs.writeFileSync(dbPath, Buffer.from(db.export())); }
function query(sql: string, params: any[] = []) { const stmt = db.prepare(sql); stmt.bind(params); const rows: any[] = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows; }
function audit(action: string, entityType: string, entityId: number | null, details: string) { if (!session) return; db.run("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)", [session.id, action, entityType, entityId, details, new Date().toISOString()]); saveDb(); }

function settingsPath() { return path.join(app.getPath("userData"), "settings.json"); }
function loadBackupSettings() {
  try {
    if (!fs.existsSync(settingsPath())) return;
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    const value = Number(raw?.backupIntervalMinutes);
    if (Number.isFinite(value) && value >= 0) backupSettings.intervalMinutes = Math.min(1440, Math.floor(value));
  } catch { /* use defaults */ }
}
function saveBackupSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ backupIntervalMinutes: backupSettings.intervalMinutes }, null, 2), "utf8");
}
function backupDirectory() { return path.join(app.getPath("userData"), "backups"); }
function automaticBackup(reason: string) {
  try {
    saveDb();
    if (!dbPath || !fs.existsSync(dbPath)) return { ok: false, error: "قاعدة البيانات غير جاهزة" };
    const dir = backupDirectory();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `almaktaba-${reason}-${stamp}.sqlite`);
    fs.copyFileSync(dbPath, filePath);
    return { ok: true, path: filePath };
  } catch (error) {
    console.error("automatic backup failed", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function restartBackupTimer() {
  if (backupTimer) { clearInterval(backupTimer); backupTimer = null; }
  const minutes = backupSettings.intervalMinutes;
  if (minutes <= 0) return;
  backupTimer = setInterval(() => { void automaticBackup("auto"); }, minutes * 60 * 1000);
}

async function initDb() {
  loadBackupSettings();
  const SQL = await initSqlJs({ locateFile: (file: string) => path.join(app.getAppPath(), "node_modules", "sql.js", "dist", file) });
  dbPath = path.join(app.getPath("userData"), "almaktaba.sqlite");
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('partner1','partner2','admin')),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,amount REAL NOT NULL CHECK(amount > 0),reason TEXT NOT NULL,beneficiary TEXT,notes TEXT,visibility TEXT NOT NULL DEFAULT 'shop' CHECK(visibility IN ('shop','admin_private')),created_by INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT,status TEXT NOT NULL DEFAULT 'active',void_reason TEXT,voided_by INTEGER,voided_at TEXT,FOREIGN KEY(created_by) REFERENCES users(id),FOREIGN KEY(voided_by) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT NOT NULL,FOREIGN KEY(actor_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,sku TEXT,unit TEXT NOT NULL DEFAULT 'قطعة',purchase_price REAL NOT NULL DEFAULT 0 CHECK(purchase_price >= 0),sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),min_quantity REAL NOT NULL DEFAULT 0 CHECK(min_quantity >= 0),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT);
  `);
  const count = Number(query("SELECT COUNT(*) AS c FROM users")[0]?.c ?? 0);
  if (!count) { const now = new Date().toISOString(); for (const [username, displayName, role, password] of [["partner1","أحمد","partner1","1234"],["partner2","محمد","partner2","1234"],["admin","الحساب 3","admin","1234"]]) db.run("INSERT INTO users(username,display_name,role,password_hash,created_at) VALUES(?,?,?,?,?)", [username,displayName,role,hashPassword(String(password)),now]); saveDb(); }
  saveDb();
  restartBackupTimer();
}

function visibleTransactions() { if (!session) return []; if (session.role === "admin") return query(`SELECT t.*,u.display_name AS created_by_name FROM transactions t JOIN users u ON u.id=t.created_by WHERE t.visibility='shop' OR (t.visibility='admin_private' AND t.created_by=?) ORDER BY t.id DESC`, [session.id]); return query(`SELECT t.*,u.display_name AS created_by_name FROM transactions t JOIN users u ON u.id=t.created_by WHERE t.visibility='shop' AND u.role!='admin' ORDER BY t.id DESC`); }
function visibleProducts() { if (!session) return []; return query("SELECT * FROM products WHERE active=1 ORDER BY id DESC"); }

ipcMain.handle("auth:login", (_event,{username,password})=>{ const user=query("SELECT * FROM users WHERE username=? AND active=1",[username])[0]; if(!user||!verifyPassword(password,user.password_hash))return{ok:false,error:"اسم المستخدم أو كلمة المرور غير صحيحة"}; session={id:Number(user.id),username:user.username,displayName:user.display_name,role:user.role}; audit("login","auth",null,"تسجيل دخول"); return{ok:true,user:session}; });
ipcMain.handle("auth:logout",()=>{session=null;return{ok:true};});
ipcMain.handle("auth:session",()=>session);
ipcMain.handle("auth:update-profile",(_event,{username,displayName})=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const nextUsername=String(username||"").trim();const nextDisplayName=String(displayName||"").trim();if(!nextUsername||!nextDisplayName)return{ok:false,error:"اسم المستخدم والاسم الظاهر حقول إجبارية"};if(!/^[A-Za-z0-9_]+$/.test(nextUsername))return{ok:false,error:"اسم المستخدم يجب أن يحتوي على أحرف إنجليزية أو أرقام أو _ فقط"};const duplicate=query("SELECT id FROM users WHERE username=? AND id!=?",[nextUsername,session.id])[0];if(duplicate)return{ok:false,error:"اسم المستخدم مستخدم بالفعل"};const previous={username:session.username,displayName:session.displayName};db.run("UPDATE users SET username=?,display_name=? WHERE id=?",[nextUsername,nextDisplayName,session.id]);session={...session,username:nextUsername,displayName:nextDisplayName};audit("update","user",session.id,JSON.stringify({previous,newValues:{username:nextUsername,displayName:nextDisplayName}}));saveDb();return{ok:true,user:session};});
ipcMain.handle("auth:change-own-password",(_event,{oldPassword,newPassword})=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};if(String(newPassword||"").length<4)return{ok:false,error:"كلمة المرور الجديدة يجب أن تكون 4 أحرف/أرقام على الأقل"};const u=query("SELECT password_hash FROM users WHERE id=?",[session.id])[0];if(!u||!verifyPassword(oldPassword,u.password_hash))return{ok:false,error:"كلمة المرور الحالية غير صحيحة"};db.run("UPDATE users SET password_hash=? WHERE id=?",[hashPassword(newPassword),session.id]);audit("password_change","user",session.id,"تغيير كلمة المرور الذاتية");saveDb();return{ok:true};});

ipcMain.handle("window:minimize",()=>{mainWindow?.minimize();return{ok:true};});
ipcMain.handle("window:close",()=>{mainWindow?.close();return{ok:true};});

ipcMain.handle("transactions:list",()=>visibleTransactions());
ipcMain.handle("transactions:create",(_event,input)=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const type=String(input?.type||"").trim(),reason=String(input?.reason||"").trim(),amount=Number(input?.amount);if(!type||!reason||!Number.isFinite(amount)||amount<=0)return{ok:false,error:"نوع العملية والمبلغ والتبرير حقول إجبارية"};const beneficiary=String(input?.beneficiary||"").trim(),notes=String(input?.notes||"").trim(),visibility=session.role==="admin"?"admin_private":"shop",now=new Date().toISOString();db.run("INSERT INTO transactions(type,amount,reason,beneficiary,notes,visibility,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",[type,amount,reason,beneficiary,notes,visibility,session.id,now]);const id=Number(query("SELECT last_insert_rowid() AS id")[0].id);audit("create","transaction",id,JSON.stringify({type,amount,reason,visibility}));saveDb();return{ok:true,id};});
ipcMain.handle("transactions:update",(_event,{id,input})=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const t=query("SELECT * FROM transactions WHERE id=? AND status='active'",[id])[0];if(!t)return{ok:false,error:"العملية غير موجودة"};if(session.role!=="admin"&&Number(t.created_by)!==session.id)return{ok:false,error:"لا يمكنك تعديل عملية سجلها المستخدم الآخر"};if(t.visibility==='admin_private'&&session.role!=="admin")return{ok:false,error:"هذه العملية خاصة"};const type=String(input?.type||"").trim(),reason=String(input?.reason||"").trim(),amount=Number(input?.amount);if(!type||!reason||!Number.isFinite(amount)||amount<=0)return{ok:false,error:"نوع العملية والمبلغ والتبرير حقول إجبارية"};const beneficiary=String(input?.beneficiary||"").trim(),notes=String(input?.notes||"").trim(),visibility=String(t.visibility)==='admin_private'?'admin_private':'shop';db.run("UPDATE transactions SET type=?,amount=?,reason=?,beneficiary=?,notes=?,visibility=?,updated_at=? WHERE id=?",[type,amount,reason,beneficiary,notes,new Date().toISOString(),id]);audit("update","transaction",id,JSON.stringify({previous:t,newValues:{type,amount,reason}}));saveDb();return{ok:true};});
ipcMain.handle("transactions:void",(_event,{id,reason})=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const t=query("SELECT * FROM transactions WHERE id=? AND status='active'",[id])[0];if(!t)return{ok:false,error:"العملية غير موجودة"};if(session.role!=="admin"&&Number(t.created_by)!==session.id)return{ok:false,error:"لا يمكنك إلغاء عملية المستخدم الآخر"};db.run("UPDATE transactions SET status='void',void_reason=?,voided_by=?,voided_at=? WHERE id=?",[String(reason||"بدون سبب").trim(),session.id,new Date().toISOString(),id]);audit("void","transaction",id,String(reason||"بدون سبب").trim());saveDb();return{ok:true};});

function nextProductCode() { const row = query("SELECT COALESCE(MAX(id),0) + 1 AS next_id FROM products")[0]; let code = `PRD-${String(Number(row?.next_id ?? 1)).padStart(6, "0")}`; while (query("SELECT id FROM products WHERE sku=?", [code]).length) code = `PRD-${Date.now().toString().slice(-8)}`; return code; }

ipcMain.handle("products:list",()=>visibleProducts());
ipcMain.handle("products:create",(_event,input)=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const name=String(input?.name||"").trim();let sku=String(input?.sku||"").trim();const unit=String(input?.unit||"قطعة").trim()||"قطعة",purchase=Number(input?.purchasePrice),sale=Number(input?.salePrice),quantity=Number(input?.quantity),min=Number(input?.minQuantity);if(!name)return{ok:false,error:"اسم المنتج إجباري"};if([purchase,sale,quantity,min].some(v=>!Number.isFinite(v)||v<0))return{ok:false,error:"تحقق من الأسعار والكميات"};if(sku){const duplicate=query("SELECT id FROM products WHERE sku=? AND active=1",[sku])[0];if(duplicate)return{ok:false,error:"رمز المنتج مستخدم بالفعل"};}else sku=nextProductCode();const now=new Date().toISOString();db.run("INSERT INTO products(name,sku,unit,purchase_price,sale_price,quantity,min_quantity,created_at) VALUES(?,?,?,?,?,?,?,?)",[name,sku,unit,purchase,sale,quantity,min,now]);const id=Number(query("SELECT last_insert_rowid() AS id")[0].id);audit("create","product",id,JSON.stringify({name,sku,unit,purchase,sale,quantity,min}));saveDb();return{ok:true,id,sku};});
ipcMain.handle("products:update",(_event,{id,input})=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const p=query("SELECT * FROM products WHERE id=? AND active=1",[id])[0];if(!p)return{ok:false,error:"المنتج غير موجود"};const name=String(input?.name||"").trim(),sku=String(input?.sku||"").trim(),unit=String(input?.unit||"قطعة").trim()||"قطعة",purchase=Number(input?.purchasePrice),sale=Number(input?.salePrice),quantity=Number(input?.quantity),min=Number(input?.minQuantity);if(!name)return{ok:false,error:"اسم المنتج إجباري"};if([purchase,sale,quantity,min].some(v=>!Number.isFinite(v)||v<0))return{ok:false,error:"تحقق من الأسعار والكميات"};const duplicate=sku?query("SELECT id FROM products WHERE sku=? AND id!=? AND active=1",[sku,id])[0]:null;if(duplicate)return{ok:false,error:"رمز المنتج مستخدم بالفعل"};const previous={name:p.name,sku:p.sku,unit:p.unit,purchasePrice:p.purchase_price,salePrice:p.sale_price,quantity:p.quantity,minQuantity:p.min_quantity};db.run("UPDATE products SET name=?,sku=?,unit=?,purchase_price=?,sale_price=?,quantity=?,min_quantity=?,updated_at=? WHERE id=?",[name,sku,unit,purchase,sale,quantity,min,new Date().toISOString(),id]);audit("update","product",id,JSON.stringify({previous,newValues:{name,sku,unit,purchasePrice:purchase,salePrice:sale,quantity,minQuantity:min}}));saveDb();return{ok:true};});
ipcMain.handle("products:delete",(_event,id)=>{if(!session)return{ok:false,error:"غير مسجل الدخول"};const p=query("SELECT * FROM products WHERE id=? AND active=1",[id])[0];if(!p)return{ok:false,error:"المنتج غير موجود"};db.run("UPDATE products SET active=0,updated_at=? WHERE id=?",[new Date().toISOString(),id]);audit("delete","product",Number(id),JSON.stringify({name:p.name,sku:p.sku}));saveDb();return{ok:true};});

ipcMain.handle("audit:transactions",()=>{if(!session||session.role!=="admin")return{ok:false,error:"غير متاح"};return{ok:true,rows:query(`SELECT a.*,u.username AS actor_username,u.display_name AS actor_name,t.type,t.amount,t.reason,t.void_reason FROM audit_logs a JOIN users u ON u.id=a.actor_id LEFT JOIN transactions t ON t.id=a.entity_id WHERE a.entity_type='transaction' AND a.action IN ('create','update','void') ORDER BY a.id DESC`)};});

ipcMain.handle("system:backup",()=>{if(!session||session.role!=="admin")return{ok:false,error:"هذه العملية متاحة للحساب الإداري فقط"};saveBackupSettings();return{ok:true,intervalMinutes:backupSettings.intervalMinutes};});
ipcMain.handle("system:backup-now",()=>{if(!session||session.role!=="admin")return{ok:false,error:"هذه العملية متاحة للحساب الإداري فقط"};return automaticBackup("manual");});
ipcMain.handle("system:backup-settings",()=>({ok:true,intervalMinutes:backupSettings.intervalMinutes}));
ipcMain.handle("system:set-backup-settings",(_event,{intervalMinutes})=>{if(!session||session.role!=="admin")return{ok:false,error:"هذه العملية متاحة للحساب الإداري فقط"};const value=Math.max(0,Math.min(1440,Math.floor(Number(intervalMinutes)||0)));backupSettings.intervalMinutes=value;saveBackupSettings();restartBackupTimer();return{ok:true,intervalMinutes:value};});
ipcMain.handle("backup:list",()=>{if(!session||session.role!=="admin")return{ok:false,error:"هذه العملية متاحة للحساب الإداري فقط"};const dir=backupDirectory();if(!fs.existsSync(dir))return{ok:true,backups:[]};const backups=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.toLowerCase().endsWith(".sqlite")).map(e=>{const filePath=path.join(dir,e.name);const stat=fs.statSync(filePath);return{name:e.name,size:stat.size,modifiedAt:stat.mtime.toISOString()};}).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));return{ok:true,backups};});
ipcMain.handle("backup:restore",async(_event,name?:string)=>{if(!session||session.role!=="admin")return{ok:false,error:"استعادة قاعدة البيانات متاحة للحساب الإداري فقط"};const dir=backupDirectory();let filePath="";if(name){const safeName=path.basename(String(name));filePath=path.join(dir,safeName);}else{const owner=mainWindow ?? undefined;if(!owner)return{ok:false,error:"نافذة البرنامج غير جاهزة"};const picked=await dialog.showOpenDialog(owner,{title:"اختيار نسخة احتياطية",properties:["openFile"],filters:[{name:"قاعدة بيانات SQLite",extensions:["sqlite"]}]});if(picked.canceled||!picked.filePaths[0])return{ok:false,canceled:true};filePath=picked.filePaths[0];}if(!fs.existsSync(filePath))return{ok:false,error:"ملف النسخة الاحتياطية غير موجود"};try{const current=automaticBackup("before-restore");if(!current.ok)return current;fs.copyFileSync(filePath,dbPath);saveDb();app.relaunch();app.exit(0);return{ok:true};}catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}});

app.whenReady().then(async()=>{await initDb();registerProductCreateHandler(ipcMain,()=>db,()=>session?{id:session.id,role:session.role}:null,saveDb,query);mainWindow=new BrowserWindow({width:1400,height:900,minWidth:1100,minHeight:700,show:false,backgroundColor:"#f8f7fc",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});mainWindow.once("ready-to-show",()=>mainWindow?.show());mainWindow.on("closed",()=>{mainWindow=null;});if(process.env.VITE_DEV_SERVER_URL){await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);}else{await mainWindow.loadFile(path.join(__dirname,"../../dist/index.html"));}});

app.on("before-quit",()=>{if(closeBackupDone)return;closeBackupDone=true;try{automaticBackup("close");}catch{}saveDb();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
Menu.setApplicationMenu(null);