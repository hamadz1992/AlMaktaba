import { contextBridge, ipcRenderer } from "electron";

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
  backup: () => ipcRenderer.invoke("system:backup")
});

function installAdminAuditView() {
  let installed = false;
  const timer = window.setInterval(async () => {
    if (installed) return;
    const nav = document.querySelector<HTMLElement>(".main-nav");
    if (!nav) return;
    const session = await ipcRenderer.invoke("auth:session");
    if (!session || session.role !== "admin") return;

    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.auditNav = "true";
    button.innerHTML = '<span class="nav-icon">◷</span><span>سجل التعديلات</span>';
    nav.appendChild(button);
    installed = true;

    button.addEventListener("click", async () => {
      document.querySelector("[data-almaktaba-audit-modal]")?.remove();
      const result = await ipcRenderer.invoke("audit:transactions");
      if (!result?.ok) return;
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const modal = document.createElement("div");
      modal.dataset.almaktabaAuditModal = "true";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(20,18,28,.45);z-index:99999;display:grid;place-items:center;padding:24px;backdrop-filter:blur(3px)";
      const card = document.createElement("section");
      card.dir = "rtl";
      card.style.cssText = "width:min(1100px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.22);font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#17202a";
      const title = document.createElement("div");
      title.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px";
      title.innerHTML = '<div><h2 style="margin:0 0 3px">سجل التعديلات</h2><span style="color:#77808d;font-size:12px">تغييرات المعاملات فقط</span></div>';
      const close = document.createElement("button");
      close.textContent = "إغلاق";
      close.style.cssText = "background:#f2f4f7;padding:8px 14px;border-radius:9px;border:0;cursor:pointer";
      close.onclick = () => modal.remove();
      title.appendChild(close);
      card.appendChild(title);

      const tableWrap = document.createElement("div");
      tableWrap.style.cssText = "overflow:auto;border:1px solid #edf0f4;border-radius:10px";
      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;min-width:760px";
      table.innerHTML = '<thead><tr style="background:#fafbfc"><th style="padding:9px;text-align:right">التاريخ</th><th style="padding:9px;text-align:right">المستخدم</th><th style="padding:9px;text-align:right">نوع العملية</th><th style="padding:9px;text-align:right">المبلغ</th><th style="padding:9px;text-align:right">التبرير</th></tr></thead>';
      const tbody = document.createElement("tbody");
      const labels: Record<string,string> = { create: "إضافة معاملة", update: "تعديل معاملة", void: "إلغاء معاملة" };
      rows.forEach((row: any) => {
        const tr = document.createElement("tr");
        const values = [new Date(row.created_at).toLocaleString("ar-DZ"), row.actor_name || row.actor_username || "—", labels[row.action] || row.action, row.amount == null ? "—" : `${Number(row.amount).toLocaleString("ar-DZ")} دج`, row.reason || (row.details || "—")];
        values.forEach(value => { const td=document.createElement("td"); td.textContent=String(value); td.style.cssText="padding:9px;border-top:1px solid #edf0f4;white-space:nowrap;font-size:13px"; tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      if (!rows.length) { const tr=document.createElement("tr"); const td=document.createElement("td"); td.colSpan=5; td.textContent="لا توجد تعديلات على المعاملات حتى الآن."; td.style.cssText="padding:30px;text-align:center;color:#77808d"; tr.appendChild(td); tbody.appendChild(tr); }
      table.appendChild(tbody); tableWrap.appendChild(table); card.appendChild(tableWrap); modal.appendChild(card); document.body.appendChild(modal);
    });
  }, 300);
  window.setTimeout(() => window.clearInterval(timer), 15000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAdminAuditView, { once: true });
else installAdminAuditView();
