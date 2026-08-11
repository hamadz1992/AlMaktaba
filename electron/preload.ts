import { contextBridge, ipcRenderer } from "electron";

async function isAdmin(): Promise<boolean> {
  try {
    const session = await ipcRenderer.invoke("auth:session");
    return session?.role === "admin";
  } catch {
    return false;
  }
}

contextBridge.exposeInMainWorld("almaktaba", {
  login: (username: string, password: string) => ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getSession: () => ipcRenderer.invoke("auth:session"),
  updateProfile: (username: string, displayName: string) => ipcRenderer.invoke("auth:update-profile", { username, displayName }),
  changeOwnPassword: (oldPassword: string, newPassword: string) => ipcRenderer.invoke("auth:change-own-password", { oldPassword, newPassword }),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  listTransactions: () => ipcRenderer.invoke("transactions:list"),
  listTransactionAudit: () => ipcRenderer.invoke("audit:transactions"),
  createTransaction: (input: unknown) => ipcRenderer.invoke("transactions:create", input),
  updateTransaction: (id: number, input: unknown) => ipcRenderer.invoke("transactions:update", { id, input }),
  voidTransaction: (id: number, reason: string) => ipcRenderer.invoke("transactions:void", { id, reason }),
  listProducts: () => ipcRenderer.invoke("products:list"),
  createProduct: (input: unknown) => ipcRenderer.invoke("products:create-safe", input),
  updateProduct: (id: number, input: unknown) => ipcRenderer.invoke("products:update", { id, input }),
  deleteProduct: (id: number) => ipcRenderer.invoke("products:delete", id),
  backup: async () => (await isAdmin()) ? ipcRenderer.invoke("system:backup") : { ok: false, error: "هذه العملية متاحة للحساب الإداري فقط" },
  backupNow: async () => (await isAdmin()) ? ipcRenderer.invoke("system:backup-now") : { ok: false, error: "هذه العملية متاحة للحساب الإداري فقط" },
  getBackupSettings: () => ipcRenderer.invoke("system:backup-settings"),
  setBackupInterval: async (intervalMinutes: number) => (await isAdmin()) ? ipcRenderer.invoke("system:set-backup-settings", { intervalMinutes }) : { ok: false, error: "هذه العملية متاحة للحساب الإداري فقط" },
  listBackups: () => ipcRenderer.invoke("backup:list"),
  restoreBackup: async (name?: string) => (await isAdmin()) ? ipcRenderer.invoke("backup:restore", name) : { ok: false, error: "استعادة قاعدة البيانات متاحة للحساب الإداري فقط" }
});

function parseDetails(raw: unknown): any { if (!raw) return null; try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } }
function fmtMoney(value: unknown): string { return value == null || value === "" ? "—" : `${Number(value).toLocaleString("ar-DZ")} دج`; }
function changeLine(label: string, before: unknown, after: unknown): string { const a = before == null || before === "" ? "—" : String(before); const b = after == null || after === "" ? "—" : String(after); return `${label}: ${a} ← ${b}`; }

async function showAuditModal() {
  document.querySelector("[data-almaktaba-audit-modal]")?.remove();
  try {
    const result = await ipcRenderer.invoke("audit:transactions");
    if (!result?.ok) { window.alert(result?.error || "تعذر فتح سجل التعديلات"); return; }
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const modal = document.createElement("div"); modal.dataset.almaktabaAuditModal = "true"; modal.dir = "rtl"; modal.style.cssText = "position:fixed;inset:0;background:rgba(20,18,28,.48);z-index:999999;display:grid;place-items:center;padding:24px;backdrop-filter:blur(4px)";
    const card = document.createElement("section"); card.style.cssText = "width:min(1180px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.24);font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#17202a";
    const title = document.createElement("div"); title.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px";
    const heading = document.createElement("div"); heading.innerHTML = '<h2 style="margin:0 0 3px">سجل التعديلات</h2><span style="color:#77808d;font-size:12px">تغييرات المعاملات فقط — القيم القديمة والجديدة</span>'; title.appendChild(heading);
    const close = document.createElement("button"); close.type = "button"; close.textContent = "إغلاق"; close.style.cssText = "background:#f2f4f7;padding:8px 14px;border-radius:9px;border:0;cursor:pointer"; close.onclick = () => modal.remove(); title.appendChild(close); card.appendChild(title);
    const tableWrap = document.createElement("div"); tableWrap.style.cssText = "overflow:auto;border:1px solid #edf0f4;border-radius:10px";
    const table = document.createElement("table"); table.style.cssText = "width:100%;border-collapse:collapse;min-width:980px"; table.innerHTML = '<thead><tr style="background:#fafbfc"><th style="padding:9px;text-align:right">التاريخ</th><th style="padding:9px;text-align:right">المستخدم</th><th style="padding:9px;text-align:right">نوع العملية</th><th style="padding:9px;text-align:right">تفاصيل التعديل</th><th style="padding:9px;text-align:right">السبب</th></tr></thead>';
    const tbody = document.createElement("tbody"); const labels: Record<string,string> = { create: "إضافة معاملة", update: "تعديل معاملة", void: "إلغاء معاملة" };
    rows.forEach((row: any) => {
      const tr = document.createElement("tr"); const details = parseDetails(row.details); const action = labels[row.action] || row.action; let changes = "—"; let reason = "—";
      if (row.action === "update" && details?.previous && details?.newValues) { const before = details.previous, after = details.newValues; changes = [changeLine("نوع العملية", before.type, after.type), `المبلغ: ${fmtMoney(before.amount)} ← ${fmtMoney(after.amount)}`, changeLine("التبرير", before.reason, after.reason)].join(" | "); }
      else if (row.action === "create") { changes = [`نوع العملية: ${details?.type ?? row.type ?? "—"}`, `المبلغ: ${fmtMoney(details?.amount ?? row.amount)}`, `التبرير: ${details?.reason ?? row.reason ?? "—"}`].join(" | "); }
      else if (row.action === "void") { changes = `المبلغ: ${fmtMoney(row.amount)} | التبرير: ${row.reason || "—"}`; reason = row.details || row.void_reason || "—"; }
      [new Date(row.created_at).toLocaleString("ar-DZ"), row.actor_name || row.actor_username || "—", action, changes, reason].forEach(value => { const td = document.createElement("td"); td.textContent = String(value); td.style.cssText = "padding:10px;border-top:1px solid #edf0f4;vertical-align:top;font-size:13px;line-height:1.7;white-space:normal"; tr.appendChild(td); }); tbody.appendChild(tr);
    });
    if (!rows.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.textContent = "لا توجد تعديلات على المعاملات حتى الآن."; td.style.cssText = "padding:30px;text-align:center;color:#77808d"; tr.appendChild(td); tbody.appendChild(tr); }
    table.appendChild(tbody); tableWrap.appendChild(table); card.appendChild(tableWrap); modal.appendChild(card); document.body.appendChild(modal);
  } catch (error) { window.alert(`تعذر فتح سجل التعديلات: ${error instanceof Error ? error.message : String(error)}`); }
}

async function createBackupPanel() {
  if (!(await isAdmin())) { document.querySelector("[data-almaktaba-backup-panel]")?.remove(); return; }
  if (document.querySelector("[data-almaktaba-backup-panel]")) return;
  const content = document.querySelector<HTMLElement>(".content"); if (!content) return;
  const panel = document.createElement("section"); panel.dataset.almaktabaBackupPanel = "true"; panel.dir = "rtl";
  panel.style.cssText = "margin:0 0 12px;padding:14px 16px;border:1px solid #e8eaf0;border-radius:14px;background:#fff;box-shadow:0 6px 18px rgba(40,35,70,.05)";
  panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px"><div><h2 style="margin:0 0 3px;font-size:18px">إدارة النسخ الاحتياطية</h2><div style="font-size:12px;color:#77808d">إنشاء نسخة الآن أو استعادة نسخة محفوظة بأمان</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-backup-now style="border:0;border-radius:9px;padding:8px 12px;background:#7c3aed;color:#fff;cursor:pointer">إنشاء نسخة الآن</button><button type="button" data-backup-restore style="border:0;border-radius:9px;padding:8px 12px;background:#eef0f5;color:#20242b;cursor:pointer">استعادة نسخة</button></div></div><div data-backup-status style="font-size:12px;color:#77808d;margin-bottom:8px"></div><div style="border:1px solid #edf0f4;border-radius:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:650px"><thead><tr style="background:#fafbfc"><th style="padding:8px;text-align:right">النسخة</th><th style="padding:8px;text-align:right">التاريخ</th><th style="padding:8px;text-align:right">الحجم</th><th style="padding:8px;text-align:right">إجراء</th></tr></thead><tbody data-backup-list></tbody></table></div>`;
  content.prepend(panel);
  const status = panel.querySelector<HTMLElement>("[data-backup-status]")!;
  const list = panel.querySelector<HTMLElement>("[data-backup-list]")!;
  const render = async () => {
    const result = await ipcRenderer.invoke("backup:list");
    if (!result?.ok) { status.textContent = result?.error || "تعذر قراءة النسخ الاحتياطية"; return; }
    list.innerHTML = "";
    const backups = Array.isArray(result.backups) ? result.backups : [];
    if (!backups.length) { list.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#77808d">لا توجد نسخ احتياطية محفوظة بعد.</td></tr>'; return; }
    backups.forEach((backup: any) => {
      const tr = document.createElement("tr");
      const size = backup.size < 1024 * 1024 ? `${Math.max(1, Math.round(backup.size / 1024))} ك.ب` : `${(backup.size / 1024 / 1024).toFixed(1)} م.ب`;
      const date = new Date(backup.modifiedAt).toLocaleString("ar-DZ");
      tr.innerHTML = `<td style="padding:8px;border-top:1px solid #edf0f4">${backup.name}</td><td style="padding:8px;border-top:1px solid #edf0f4">${date}</td><td style="padding:8px;border-top:1px solid #edf0f4">${size}</td><td style="padding:8px;border-top:1px solid #edf0f4"><button type="button" data-restore-name="${String(backup.name).replace(/"/g,"&quot;")}" style="border:0;border-radius:8px;padding:6px 10px;background:#f1eafe;color:#673ab7;cursor:pointer">استعادة</button></td>`;
      list.appendChild(tr);
    });
  };
  panel.querySelector("[data-backup-now]")?.addEventListener("click", async () => { if (!(await isAdmin())) return; const r = await ipcRenderer.invoke("system:backup-now"); status.textContent = r?.ok ? "تم إنشاء النسخة الاحتياطية بنجاح." : (r?.error || "تعذر إنشاء النسخة الاحتياطية"); await render(); });
  panel.querySelector("[data-backup-restore]")?.addEventListener("click", async () => { if (!(await isAdmin())) return; const ok = window.confirm("سيتم حفظ نسخة أمان من البيانات الحالية ثم استعادة النسخة المختارة وإعادة تشغيل البرنامج. هل تريد المتابعة؟"); if (!ok) return; const r = await ipcRenderer.invoke("backup:restore"); if (!r?.ok && !r?.canceled) window.alert(r?.error || "تعذر الاستعادة"); });
  panel.addEventListener("click", async (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-restore-name]"); if (!button || !(await isAdmin())) return; const name = button.dataset.restoreName || ""; if (!window.confirm(`سيتم استعادة النسخة:\n${name}\n\nسيتم أولًا إنشاء نسخة أمان من البيانات الحالية ثم إعادة تشغيل البرنامج. هل تريد المتابعة؟`)) return; const r = await ipcRenderer.invoke("backup:restore", name); if (!r?.ok && !r?.canceled) window.alert(r?.error || "تعذر الاستعادة"); });
  void render();
}

function installBackupView() {
  const install = async () => {
    if (!(await isAdmin())) { document.querySelector("[data-almaktaba-backup-panel]")?.remove(); return; }
    const nav = document.querySelector<HTMLElement>(".main-nav"); if (!nav) return;
    nav.querySelectorAll("button").forEach(button => {
      if (button.textContent?.includes("النسخ الاحتياطي") && !button.dataset.backupHooked) {
        button.dataset.backupHooked = "true";
        button.addEventListener("click", () => setTimeout(() => { void createBackupPanel(); }, 60));
      }
    });
    if (document.querySelector(".content h1")?.textContent?.includes("النسخ الاحتياطي")) setTimeout(() => { void createBackupPanel(); }, 30);
  };
  const observer = new MutationObserver(() => { void install(); }); observer.observe(document.documentElement, { childList: true, subtree: true }); void install();
}

async function ensureAdminAuditButton() {
  const nav = document.querySelector<HTMLElement>(".main-nav"); if (!nav) return; const session = await ipcRenderer.invoke("auth:session");
  if (!session || session.role !== "admin") { nav.querySelector("[data-audit-nav]")?.remove(); return; }
  if (nav.querySelector("[data-audit-nav]")) return;
  const button = document.createElement("button"); button.className = "nav-item"; button.type = "button"; button.dataset.auditNav = "true"; button.innerHTML = '<span class="nav-icon">◷</span><span>سجل التعديلات</span>'; button.addEventListener("click", () => { void showAuditModal(); });
  const settings = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent?.includes("الإعدادات")); if (settings) nav.insertBefore(button, settings); else nav.appendChild(button);
}

function installAdminAuditView() {
  document.addEventListener("click", (event) => { const target = event.target as HTMLElement | null; const button = target?.closest<HTMLElement>("[data-audit-nav]"); if (button) { event.preventDefault(); event.stopPropagation(); void showAuditModal(); } }, true);
  const observer = new MutationObserver(() => { void ensureAdminAuditButton(); }); observer.observe(document.documentElement, { childList: true, subtree: true }); void ensureAdminAuditButton();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { installAdminAuditView(); installBackupView(); }, { once: true }); else { installAdminAuditView(); installBackupView(); }
