import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type User = { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" };
type Tx = { id:number; type:string; amount:number; reason:string; beneficiary:string; notes:string; visibility:string; created_by:number; created_by_name:string; created_at:string; updated_at:string|null; status:string };
type Section = "transactions" | "home" | "reports" | "account";

const types = ["شراء", "بيع", "مصروف", "سحب", "إيداع", "دين", "تسديد دين", "أخرى"];
const SAVED_USERNAME_KEY = "almaktaba_saved_username";

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("transactions");
  const [login, setLogin] = useState(() => ({ username: localStorage.getItem(SAVED_USERNAME_KEY) || "", password: "" }));
  const [error, setError] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [form, setForm] = useState({ type: "شراء", amount: "", reason: "", beneficiary: "", notes: "", visibility: "shop" });
  const [editing, setEditing] = useState<number | null>(null);
  const [filter, setFilter] = useState({ search: "", type: "الكل", creator: "الكل" });
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ old: "", next: "" });

  async function refresh() { setTxs(await window.almaktaba.listTransactions()); }
  useEffect(() => { window.almaktaba.getSession().then((s) => s && setUser(s)); }, []);
  useEffect(() => { if (user) refresh(); }, [user]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const r = await window.almaktaba.login(login.username, login.password);
    if (!r.ok) return setError(r.error);
    if (r.user.role === "admin") localStorage.removeItem(SAVED_USERNAME_KEY);
    else localStorage.setItem(SAVED_USERNAME_KEY, r.user.username);
    setLogin({ username: r.user.role === "admin" ? "" : r.user.username, password: "" });
    setUser(r.user); setSection("transactions");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const r = editing ? await window.almaktaba.updateTransaction(editing, form) : await window.almaktaba.createTransaction(form);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    setForm({ type:"شراء", amount:"", reason:"", beneficiary:"", notes:"", visibility:"shop" });
    await refresh();
  }

  function startEdit(t: Tx) {
    setEditing(t.id);
    setForm({ type:t.type, amount:String(t.amount), reason:t.reason, beneficiary:t.beneficiary || "", notes:t.notes || "", visibility:t.visibility });
    setSection("transactions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setError("");
    setForm({ type:"شراء", amount:"", reason:"", beneficiary:"", notes:"", visibility:"shop" });
  }

  async function cancelTx(t: Tx) {
    const reason = window.prompt("سبب الإلغاء:");
    if (reason === null) return;
    const r = await window.almaktaba.voidTransaction(t.id, reason);
    if (!r.ok) return window.alert(r.error);
    refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const r = await window.almaktaba.changeOwnPassword(passwords.old, passwords.next);
    if (!r.ok) return window.alert(r.error);
    window.alert("تم تغيير كلمة المرور");
    setPasswords({ old:"", next:"" }); setShowPassword(false);
  }

  const filtered = useMemo(() => txs.filter((t) => {
    const q = filter.search.trim().toLowerCase();
    return (filter.type === "الكل" || t.type === filter.type) &&
      (filter.creator === "الكل" || t.created_by_name === filter.creator) &&
      (!q || `${t.reason} ${t.beneficiary} ${t.notes} ${t.amount}`.toLowerCase().includes(q));
  }), [txs, filter]);

  const active = txs.filter(t => t.status === "active");
  const purchases = active.filter(t => t.type === "شراء").reduce((s,t) => s + Number(t.amount), 0);
  const withdrawals = active.filter(t => t.type === "سحب").reduce((s,t) => s + Number(t.amount), 0);
  const expenses = active.filter(t => ["مصروف", "شراء"].includes(t.type)).reduce((s,t) => s + Number(t.amount), 0);
  const deposits = active.filter(t => t.type === "إيداع").reduce((s,t) => s + Number(t.amount), 0);
  const net = deposits - expenses + active.filter(t => t.type === "بيع").reduce((s,t) => s + Number(t.amount), 0) - withdrawals;

  if (!user) {
    return <div className="login-page"><form className="login-card" onSubmit={doLogin}>
      <div className="logo">المكتبة</div>
      <div className="subtitle">إدارة معاملات المحل — بدون إنترنت</div>
      <label>اسم المستخدم</label><input value={login.username} onChange={e => setLogin({...login, username:e.target.value})} autoFocus />
      <label>كلمة المرور</label><input type="password" value={login.password} onChange={e => setLogin({...login, password:e.target.value})} />
      {error && <div className="error">{error}</div>}<button className="primary">دخول</button>
    </form></div>;
  }

  const nav: Array<[Section, string]> = [
    ["transactions", "المعاملات"],
    ["home", "الرئيسية"],
    ["reports", "التقارير"],
    ["account", "حسابي"]
  ];

  return <div className="app">
    <header className="topbar">
      <div><b className="title">المكتبة</b><span className="user"> — {user.role === "admin" ? "المستخدم" : user.displayName}</span></div>
      <div className="actions">
        {user.role === "admin" && <button onClick={async () => { const r = await window.almaktaba.backup(); if (r?.ok) window.alert("تم إنشاء النسخة الاحتياطية"); }}>نسخة احتياطية</button>}
        <button onClick={() => setShowPassword(true)}>تغيير كلمة المرور</button>
        <button onClick={async () => { await window.almaktaba.logout(); setUser(null); }}>خروج</button>
      </div>
    </header>

    <div className="layout">
      <aside className="sidebar">
        <div className="side-title">أقسام البرنامج</div>
        <nav>{nav.map(([id, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setEditing(null); }}>{label}</button>)}</nav>
      </aside>

      <main className="content">
        {section === "transactions" && <>
          <div className="page-heading"><h1>المعاملات</h1><p>تسجيل الحركات ومراجعة سجل العمليات في نفس القسم.</p></div>

          <section className="card transaction-form-card">
            <div className="card-head">
              <div><h2>{editing ? "تعديل حركة" : "تسجيل حركة جديدة"}</h2><p className="muted">المبلغ والتبرير حقول إجبارية.</p></div>
              {editing && <button type="button" onClick={resetForm}>إلغاء التعديل</button>}
            </div>
            <form onSubmit={submit} className="transaction-form">
              <div><label>نوع العملية</label><select value={form.type} onChange={e => setForm({...form,type:e.target.value})}>{types.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label>المبلغ (دج)</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})}/></div>
              <div className="wide"><label>التبرير / السبب</label><input value={form.reason} onChange={e => setForm({...form,reason:e.target.value})} placeholder="مثال: شراء منتجات للمحل"/></div>
              <div><label>المستفيد / الجهة</label><input value={form.beneficiary} onChange={e => setForm({...form,beneficiary:e.target.value})} placeholder="مثال: المورد أو الشريك"/></div>
              <div><label>ملاحظات</label><input value={form.notes} onChange={e => setForm({...form,notes:e.target.value})}/></div>
              {user.role === "admin" && <div><label>ظهور العملية</label><select value={form.visibility} onChange={e => setForm({...form,visibility:e.target.value})}><option value="admin_private">عملية خاصة</option><option value="shop">عملية المحل — تظهر للشريكين</option></select></div>}
              {error && <div className="error wide">{error}</div>}
              <div className="form-actions wide"><button className="primary">{editing ? "حفظ التعديل" : "تسجيل العملية"}</button>{editing && <button type="button" onClick={resetForm}>إلغاء</button>}</div>
            </form>
          </section>

          <section className="card full-card transactions-list-card">
            <div className="card-head"><div><h2>سجل المعاملات</h2><p className="muted">العمليات المتاحة لهذا الحساب.</p></div><strong>{filtered.length} عملية</strong></div>
            <div className="filters"><input placeholder="بحث في التبرير أو الجهة أو المبلغ..." value={filter.search} onChange={e => setFilter({...filter,search:e.target.value})}/><select value={filter.type} onChange={e => setFilter({...filter,type:e.target.value})}><option>الكل</option>{types.map(t => <option key={t}>{t}</option>)}</select><select value={filter.creator} onChange={e => setFilter({...filter,creator:e.target.value})}><option>الكل</option>{Array.from(new Set(txs.map(t => t.created_by_name))).map(n => <option key={n}>{n}</option>)}</select></div>
            <TransactionTable rows={filtered} user={user} onEdit={startEdit} onCancel={cancelTx} />
          </section>
        </>}

        {section === "home" && <>
          <div className="page-heading"><h1>الرئيسية</h1><p>ملخص سريع لحركة المحل.</p></div>
          <section className="stats"><div><span>عدد العمليات</span><strong>{active.length}</strong></div><div><span>المشتريات</span><strong>{formatMoney(purchases)}</strong></div><div><span>السحوبات</span><strong>{formatMoney(withdrawals)}</strong></div><div><span>الرصيد الصافي</span><strong>{formatMoney(net)}</strong></div></section>
          <section className="card home-card"><div className="card-head"><div><h2>آخر العمليات</h2><p className="muted">آخر الحركات المتاحة لهذا الحساب.</p></div><button onClick={() => setSection("transactions")}>إدارة المعاملات</button></div><TransactionTable rows={txs.slice(0,5)} user={user} onEdit={startEdit} onCancel={cancelTx} /></section>
        </>}

        {section === "reports" && <>
          <div className="page-heading"><h1>التقارير</h1><p>ملخص مالي للعمليات المسجلة والمتاحة لهذا الحساب.</p></div>
          <section className="stats reports-stats"><div><span>المشتريات</span><strong>{formatMoney(purchases)}</strong></div><div><span>المصاريف</span><strong>{formatMoney(expenses)}</strong></div><div><span>السحوبات</span><strong>{formatMoney(withdrawals)}</strong></div><div><span>الإيداعات</span><strong>{formatMoney(deposits)}</strong></div><div><span>عدد العمليات</span><strong>{active.length}</strong></div><div><span>الرصيد الصافي</span><strong>{formatMoney(net)}</strong></div></section>
          <section className="card"><h2>توزيع العمليات</h2><div className="report-list">{types.map(type => { const count = active.filter(t => t.type === type).length; const total = active.filter(t => t.type === type).reduce((s,t) => s + Number(t.amount),0); return <div className="report-row" key={type}><span>{type}</span><b>{count} عملية</b><strong>{formatMoney(total)}</strong></div>; })}</div></section>
        </>}

        {section === "account" && <section className="card account-card">
          <div className="page-heading"><h1>حسابي</h1><p>إعدادات الحساب الشخصي.</p></div>
          <div className="account-info"><div><span>اسم المستخدم</span><strong>{user.role === "admin" ? "—" : user.username}</strong></div><div><span>الاسم الظاهر</span><strong>{user.role === "admin" ? "المستخدم" : user.displayName}</strong></div><div><span>الصلاحيات</span><strong>{user.role === "admin" ? "كاملة" : "حساب شخصي"}</strong></div></div>
          <button className="primary compact" onClick={() => setShowPassword(true)}>تغيير كلمة المرور</button>
          {user.role === "admin" && <button className="compact" onClick={async () => { const r = await window.almaktaba.backup(); if (r?.ok) window.alert("تم إنشاء النسخة الاحتياطية"); }}>إنشاء نسخة احتياطية</button>}
        </section>}
      </main>
    </div>

    {showPassword && <div className="modal"><form className="modal-card" onSubmit={changePassword}><h3>تغيير كلمة المرور</h3><input type="password" placeholder="كلمة المرور الحالية" value={passwords.old} onChange={e => setPasswords({...passwords, old:e.target.value})}/><input type="password" placeholder="كلمة المرور الجديدة" value={passwords.next} onChange={e => setPasswords({...passwords, next:e.target.value})}/><button className="primary">حفظ</button><button type="button" onClick={() => setShowPassword(false)}>إلغاء</button></form></div>}
  </div>;
}

function TransactionTable({ rows, user, onEdit, onCancel }: { rows: Tx[]; user: User; onEdit: (t: Tx) => void; onCancel: (t: Tx) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>المستفيد</th><th>المسجل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
    {rows.map(t => <tr key={t.id}><td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{formatMoney(t.amount)}</td><td>{t.reason}</td><td>{t.beneficiary || "—"}</td><td>{t.created_by_name}</td><td>{t.status === "active" ? "نشطة" : "ملغاة"}</td><td>{t.status === "active" && (user.role === "admin" || t.created_by === user.id) ? <><button onClick={() => onEdit(t)}>تعديل</button> <button onClick={() => onCancel(t)}>إلغاء</button></> : "—"}</td></tr>)}
  </tbody></table>{rows.length === 0 && <div className="empty">لا توجد نتائج.</div>}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
