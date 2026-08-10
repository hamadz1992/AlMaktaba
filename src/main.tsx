import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type User = { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" };
type Tx = { id:number; type:string; amount:number; reason:string; beneficiary:string; notes:string; visibility:string; created_by:number; created_by_name:string; created_at:string; updated_at:string|null; status:string };

const types = ["شراء", "بيع", "مصروف", "سحب", "إيداع", "دين", "تسديد دين", "أخرى"];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
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
    setUser(r.user);
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
  const activeTotal = filtered.filter(t => t.status === "active").reduce((sum, t) => sum + Number(t.amount), 0);

  if (!user) {
    return <div className="login-page">
      <form className="login-card" onSubmit={doLogin}>
        <div className="logo">المكتبة</div>
        <div className="subtitle">إدارة معاملات المحل — بدون إنترنت</div>
        <label>اسم المستخدم</label>
        <input value={login.username} onChange={e => setLogin({...login, username:e.target.value})} autoFocus />
        <label>كلمة المرور</label>
        <input type="password" value={login.password} onChange={e => setLogin({...login, password:e.target.value})} />
        {error && <div className="error">{error}</div>}
        <button className="primary">دخول</button>
      </form>
    </div>;
  }

  return <div className="app">
    <header className="topbar">
      <div><b className="title">المكتبة</b><span className="user"> — {user.displayName}</span></div>
      <div className="actions">
        <button onClick={() => setShowPassword(true)}>تغيير كلمة المرور</button>
        {user.role === "admin" && <button onClick={async () => { const r = await window.almaktaba.backup(); if (r?.ok) window.alert("تم إنشاء النسخة الاحتياطية"); }}>نسخة احتياطية</button>}
        <button onClick={async () => { await window.almaktaba.logout(); setUser(null); }}>خروج</button>
      </div>
    </header>

    {showPassword && <div className="modal"><form className="modal-card" onSubmit={changePassword}>
      <h3>تغيير كلمة المرور</h3>
      <input type="password" placeholder="كلمة المرور الحالية" value={passwords.old} onChange={e => setPasswords({...passwords, old:e.target.value})}/>
      <input type="password" placeholder="كلمة المرور الجديدة" value={passwords.next} onChange={e => setPasswords({...passwords, next:e.target.value})}/>
      <button className="primary">حفظ</button><button type="button" onClick={() => setShowPassword(false)}>إلغاء</button>
    </form></div>}

    <main className="content">
      <section className="stats">
        <div><span>الحركات المعروضة</span><strong>{filtered.length}</strong></div>
        <div><span>إجمالي القيم النشطة</span><strong>{activeTotal.toLocaleString("ar-DZ")} دج</strong></div>
        <div><span>الدور</span><strong>{user.role === "admin" ? "إدارة كاملة" : user.displayName}</strong></div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>{editing ? "تعديل الحركة" : "تسجيل حركة جديدة"}</h2>
          <p className="muted">المبلغ والتبرير حقول إجبارية.</p>
          <form onSubmit={submit}>
            <label>نوع العملية</label>
            <select value={form.type} onChange={e => setForm({...form,type:e.target.value})}>{types.map(t => <option key={t}>{t}</option>)}</select>
            <label>المبلغ (دج)</label>
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})}/>
            <label>التبرير / السبب</label>
            <input value={form.reason} onChange={e => setForm({...form,reason:e.target.value})} placeholder="مثال: شراء منتجات للمحل"/>
            <label>المستفيد / الجهة</label>
            <input value={form.beneficiary} onChange={e => setForm({...form,beneficiary:e.target.value})} placeholder="مثال: المورد أو الشريك"/>
            <label>ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})}/>
            {user.role === "admin" && <>
              <label>ظهور العملية</label>
              <select value={form.visibility} onChange={e => setForm({...form,visibility:e.target.value})}>
                <option value="shop">عملية محل — تظهر للشريكين</option>
                <option value="admin_private">عملية خاصة بالحساب 3</option>
              </select>
            </>}
            {error && <div className="error">{error}</div>}
            <button className="primary">{editing ? "حفظ التعديل" : "تسجيل العملية"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm({type:"شراء",amount:"",reason:"",beneficiary:"",notes:"",visibility:"shop"}); }}>إلغاء التعديل</button>}
          </form>
        </section>

        <section className="card">
          <div><h2>سجل الحركات</h2><p className="muted">عمليات الحساب 3 الخاصة لا تظهر للشريكين.</p></div>
          <div className="filters">
            <input placeholder="بحث..." value={filter.search} onChange={e => setFilter({...filter,search:e.target.value})}/>
            <select value={filter.type} onChange={e => setFilter({...filter,type:e.target.value})}><option>الكل</option>{types.map(t => <option key={t}>{t}</option>)}</select>
            <select value={filter.creator} onChange={e => setFilter({...filter,creator:e.target.value})}><option>الكل</option>{Array.from(new Set(txs.map(t => t.created_by_name))).map(n => <option key={n}>{n}</option>)}</select>
          </div>
          <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>المستفيد</th><th>المسجل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
            {filtered.map(t => <tr key={t.id}>
              <td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{Number(t.amount).toLocaleString("ar-DZ")} دج</td><td>{t.reason}</td><td>{t.beneficiary || "—"}</td><td>{t.created_by_name}</td><td>{t.status === "active" ? "نشطة" : "ملغاة"}</td>
              <td>{t.status === "active" && (user.role === "admin" || t.created_by === user.id) ? <><button onClick={() => startEdit(t)}>تعديل</button> <button onClick={() => cancelTx(t)}>إلغاء</button></> : "—"}</td>
            </tr>)}
          </tbody></table>{filtered.length === 0 && <div className="empty">لا توجد نتائج.</div>}</div>
        </section>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
