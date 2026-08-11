import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type User = { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" };
type Tx = { id:number; type:string; amount:number; reason:string; beneficiary:string; notes:string; visibility:string; created_by:number; created_by_name:string; created_at:string; updated_at:string|null; status:string };

const types = ["شراء", "بيع", "مصروف", "سحب", "إيداع", "دين", "تسديد دين", "أخرى"];
const SAVED_USERNAME_KEY = "almaktaba_saved_username";

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [login, setLogin] = useState(() => ({ username: localStorage.getItem(SAVED_USERNAME_KEY) || "", password: "" }));
  const [error, setError] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [form, setForm] = useState({ type: "شراء", amount: "", reason: "", visibility: "shop" });
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
    setUser(r.user);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const r = editing ? await window.almaktaba.updateTransaction(editing, form) : await window.almaktaba.createTransaction(form);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    setForm({ type:"شراء", amount:"", reason:"", visibility:"shop" });
    await refresh();
  }

  function startEdit(t: Tx) {
    setEditing(t.id);
    setForm({ type:t.type, amount:String(t.amount), reason:t.reason, visibility:t.visibility });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null); setError("");
    setForm({ type:"شراء", amount:"", reason:"", visibility:"shop" });
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
      (!q || `${t.reason} ${t.amount}`.toLowerCase().includes(q));
  }), [txs, filter]);

  if (!user) {
    return <div className="login-page"><form className="login-card" onSubmit={doLogin}>
      <div className="logo">المكتبة</div><div className="subtitle">إدارة معاملات المحل — بدون إنترنت</div>
      <label>اسم المستخدم</label><input value={login.username} onChange={e => setLogin({...login, username:e.target.value})} autoFocus />
      <label>كلمة المرور</label><input type="password" value={login.password} onChange={e => setLogin({...login, password:e.target.value})} />
      {error && <div className="error">{error}</div>}<button className="primary">دخول</button>
    </form></div>;
  }

  return <div className="app">
    <header className="topbar">
      <div><b className="title">المكتبة</b><span className="user"> — {user.role === "admin" ? "المستخدم" : user.displayName}</span></div>
      <div className="actions">
        {user.role === "admin" && <button onClick={async () => { const r = await window.almaktaba.backup(); if (r?.ok) window.alert("تم إنشاء النسخة الاحتياطية"); }}>نسخة احتياطية</button>}
        <button onClick={() => setShowPassword(true)}>تغيير كلمة المرور</button>
        <button onClick={async () => { await window.almaktaba.logout(); setUser(null); }}>خروج</button>
      </div>
    </header>

    <main className="content single-page-content">
      <div className="page-heading"><h1>المعاملات</h1><p>تسجيل الحركة ومراجعة سجل العمليات في نفس الصفحة.</p></div>

      <section className="card transaction-form-card">
        <div className="card-head">
          <div><h2>{editing ? "تعديل حركة" : "تسجيل حركة"}</h2><p className="muted">المبلغ والتبرير حقول إجبارية.</p></div>
          {editing && <button type="button" onClick={resetForm}>إلغاء التعديل</button>}
        </div>
        <form onSubmit={submit} className="transaction-form">
          <div><label>نوع العملية</label><select value={form.type} onChange={e => setForm({...form,type:e.target.value})}>{types.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>المبلغ (دج)</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})}/></div>
          <div><label>التبرير / السبب</label><input value={form.reason} onChange={e => setForm({...form,reason:e.target.value})} placeholder="مثال: شراء منتجات للمحل"/></div>
          <div className="form-actions"><button className="primary">{editing ? "حفظ التعديل" : "تسجيل الحركة"}</button></div>
        </form>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="card full-card transactions-list-card">
        <div className="card-head"><div><h2>سجل المعاملات</h2><p className="muted">العمليات المتاحة لهذا الحساب.</p></div><strong>{filtered.length} عملية</strong></div>
        <div className="filters">
          <input placeholder="بحث في التبرير أو المبلغ..." value={filter.search} onChange={e => setFilter({...filter,search:e.target.value})}/>
          <select value={filter.type} onChange={e => setFilter({...filter,type:e.target.value})}><option>الكل</option>{types.map(t => <option key={t}>{t}</option>)}</select>
          <select value={filter.creator} onChange={e => setFilter({...filter,creator:e.target.value})}><option>الكل</option>{Array.from(new Set(txs.map(t => t.created_by_name))).map(n => <option key={n}>{n}</option>)}</select>
        </div>
        <TransactionTable rows={filtered} user={user} onEdit={startEdit} onCancel={cancelTx} />
      </section>
    </main>

    {showPassword && <div className="modal"><form className="modal-card" onSubmit={changePassword}><h3>تغيير كلمة المرور</h3><input type="password" placeholder="كلمة المرور الحالية" value={passwords.old} onChange={e => setPasswords({...passwords, old:e.target.value})}/><input type="password" placeholder="كلمة المرور الجديدة" value={passwords.next} onChange={e => setPasswords({...passwords, next:e.target.value})}/><button className="primary">حفظ</button><button type="button" onClick={() => setShowPassword(false)}>إلغاء</button></form></div>}
  </div>;
}

function TransactionTable({ rows, user, onEdit, onCancel }: { rows: Tx[]; user: User; onEdit: (t: Tx) => void; onCancel: (t: Tx) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>المسجل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
    {rows.map(t => <tr key={t.id}><td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{formatMoney(t.amount)}</td><td>{t.reason}</td><td>{t.created_by_name}</td><td>{t.status === "active" ? "نشطة" : "ملغاة"}</td><td>{t.status === "active" && (user.role === "admin" || t.created_by === user.id) ? <><button onClick={() => onEdit(t)}>تعديل</button> <button onClick={() => onCancel(t)}>إلغاء</button></> : "—"}</td></tr>)}
  </tbody></table>{rows.length === 0 && <div className="empty">لا توجد عمليات.</div>}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
