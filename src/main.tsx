import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type User = { id: number; username: string; displayName: string; role: "partner1" | "partner2" | "admin" };
type Tx = { id:number; type:string; amount:number; reason:string; beneficiary:string; notes:string; visibility:string; created_by:number; created_by_name:string; created_at:string; updated_at:string|null; status:string };
type Section = "summary" | "transactions" | "products" | "sales" | "purchases" | "debts" | "reports" | "invoices" | "backup" | "settings";

const SAVED_USERNAME_KEY = "almaktaba_saved_username";
const types = ["شراء", "بيع", "مصروف", "سحب", "إيداع", "دين", "تسديد دين", "أخرى"];
const navItems: { id: Section; label: string; icon: string }[] = [
  { id:"summary", label:"الملخص", icon:"⌂" },
  { id:"transactions", label:"المعاملات", icon:"↔" },
  { id:"products", label:"المنتجات", icon:"▦" },
  { id:"sales", label:"المبيعات", icon:"▣" },
  { id:"purchases", label:"المشتريات", icon:"▤" },
  { id:"debts", label:"الديون والمستحقات", icon:"◫" },
  { id:"reports", label:"التقارير", icon:"▥" },
  { id:"invoices", label:"الفواتير والتصدير", icon:"▧" },
  { id:"backup", label:"النسخ الاحتياطي", icon:"◈" },
  { id:"settings", label:"الإعدادات", icon:"⚙" }
];

function formatMoney(value: number) { return `${Number(value || 0).toLocaleString("ar-DZ")} دج`; }

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("summary");
  const [login, setLogin] = useState(() => ({ username: localStorage.getItem(SAVED_USERNAME_KEY) || "", password: "" }));
  const [error, setError] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [form, setForm] = useState({ type:"شراء", amount:"", reason:"", visibility:"shop" });
  const [editing, setEditing] = useState<number | null>(null);
  const [filter, setFilter] = useState({ search:"", type:"الكل", creator:"الكل" });
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ old:"", next:"" });

  async function refresh() { setTxs(await window.almaktaba.listTransactions()); }
  useEffect(() => { window.almaktaba.getSession().then((s) => s && setUser(s)); }, []);
  useEffect(() => { if (user) refresh(); }, [user]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const r = await window.almaktaba.login(login.username, login.password);
    if (!r.ok) return setError(r.error);
    if (r.user.role === "admin") localStorage.removeItem(SAVED_USERNAME_KEY); else localStorage.setItem(SAVED_USERNAME_KEY, r.user.username);
    setLogin({ username:r.user.role === "admin" ? "" : r.user.username, password:"" }); setUser(r.user);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const r = editing ? await window.almaktaba.updateTransaction(editing, form) : await window.almaktaba.createTransaction(form);
    if (!r.ok) return setError(r.error);
    setEditing(null); setForm({ type:"شراء", amount:"", reason:"", visibility:"shop" }); await refresh();
  }
  function startEdit(t: Tx) { setEditing(t.id); setForm({ type:t.type, amount:String(t.amount), reason:t.reason, visibility:t.visibility }); window.scrollTo({top:0,behavior:"smooth"}); }
  function resetForm() { setEditing(null); setError(""); setForm({type:"شراء",amount:"",reason:"",visibility:"shop"}); }
  async function cancelTx(t: Tx) { const reason=window.prompt("سبب الإلغاء:"); if(reason===null)return; const r=await window.almaktaba.voidTransaction(t.id,reason); if(!r.ok)return window.alert(r.error); refresh(); }
  async function changePassword(e: React.FormEvent) { e.preventDefault(); const r=await window.almaktaba.changeOwnPassword(passwords.old,passwords.next); if(!r.ok)return window.alert(r.error); window.alert("تم تغيير كلمة المرور"); setPasswords({old:"",next:""}); setShowPassword(false); }

  const filtered = useMemo(() => txs.filter(t => {
    const q=filter.search.trim().toLowerCase();
    return (filter.type==="الكل"||t.type===filter.type) && (filter.creator==="الكل"||t.created_by_name===filter.creator) && (!q||`${t.reason} ${t.amount}`.toLowerCase().includes(q));
  }),[txs,filter]);
  const totals = useMemo(() => ({ purchases:txs.filter(t=>t.type==="شراء"&&t.status==="active").reduce((s,t)=>s+t.amount,0), sales:txs.filter(t=>t.type==="بيع"&&t.status==="active").reduce((s,t)=>s+t.amount,0), expenses:txs.filter(t=>t.type==="مصروف"&&t.status==="active").reduce((s,t)=>s+t.amount,0), withdrawals:txs.filter(t=>t.type==="سحب"&&t.status==="active").reduce((s,t)=>s+t.amount,0) }),[txs]);

  if (!user) return <div className="login-page"><form className="login-card" onSubmit={doLogin}><div className="logo">المكتبة</div><div className="subtitle">إدارة المحل — بدون إنترنت</div><label>اسم المستخدم</label><input value={login.username} onChange={e=>setLogin({...login,username:e.target.value})} autoFocus/><label>كلمة المرور</label><input type="password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/>{error&&<div className="error">{error}</div>}<button className="primary login-button">دخول</button></form></div>;

  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-mark">م</span><div><b className="title">المكتبة</b><span className="user"> — {user.role==="admin"?"المستخدم":user.displayName}</span></div></div><div className="actions">{user.role==="admin"&&<button onClick={async()=>{const r=await window.almaktaba.backup();if(r?.ok)window.alert("تم إنشاء النسخة الاحتياطية");}}>نسخة احتياطية</button>}<button onClick={()=>setShowPassword(true)}>تغيير كلمة المرور</button><button onClick={async()=>{await window.almaktaba.logout();setUser(null);}}>خروج</button></div></header>
    <nav className="main-nav" aria-label="أقسام البرنامج">{navItems.map(item=><button key={item.id} className={section===item.id?"nav-item active":"nav-item"} onClick={()=>setSection(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}</nav>
    <main className="content">{section==="transactions"?<Transactions user={user} txs={txs} filtered={filtered} form={form} setForm={setForm} editing={editing} setEditing={setEditing} filter={filter} setFilter={setFilter} error={error} submit={submit} startEdit={startEdit} resetForm={resetForm} cancelTx={cancelTx}/>:section==="summary"?<Summary user={user} totals={totals} txs={txs} setSection={setSection}/>:<Placeholder section={section} user={user}/>}</main>
    {showPassword&&<div className="modal"><form className="modal-card" onSubmit={changePassword}><h3>تغيير كلمة المرور</h3><input type="password" placeholder="كلمة المرور الحالية" value={passwords.old} onChange={e=>setPasswords({...passwords,old:e.target.value})}/><input type="password" placeholder="كلمة المرور الجديدة" value={passwords.next} onChange={e=>setPasswords({...passwords,next:e.target.value})}/><button className="primary">حفظ</button><button type="button" onClick={()=>setShowPassword(false)}>إلغاء</button></form></div>}
  </div>;
}

function Summary({user,totals,txs,setSection}:{user:User;totals:{purchases:number;sales:number;expenses:number;withdrawals:number};txs:Tx[];setSection:(s:Section)=>void}) {
  const today=txs.filter(t=>new Date(t.created_at).toDateString()===new Date().toDateString()&&t.status==="active");
  return <><div className="page-heading"><h1>ملخص اليوم</h1><p>نظرة سريعة على حركة المحل. المستخدم: {user.role==="admin"?"المستخدم":user.displayName}</p></div><div className="stat-grid"><Stat title="المبيعات" value={formatMoney(totals.sales)} icon="▣"/><Stat title="المشتريات" value={formatMoney(totals.purchases)} icon="▤"/><Stat title="المصاريف" value={formatMoney(totals.expenses)} icon="−"/><Stat title="السحوبات" value={formatMoney(totals.withdrawals)} icon="↓"/></div><section className="dashboard-grid"><div className="card"><div className="card-head"><div><h2>آخر العمليات</h2><p className="muted">آخر 5 حركات متاحة.</p></div><button onClick={()=>setSection("transactions")}>عرض الكل</button></div><TransactionTable rows={txs.slice(0,5)} user={user} onEdit={()=>setSection("transactions")} onCancel={()=>setSection("transactions")}/></div><div className="card quick-card"><h2>اختصارات</h2><button className="quick-action" onClick={()=>setSection("transactions")}>＋ تسجيل حركة</button><button className="quick-action" onClick={()=>setSection("products")}>▦ إضافة منتج</button><button className="quick-action" onClick={()=>setSection("sales")}>▣ تسجيل بيع</button><button className="quick-action" onClick={()=>setSection("purchases")}>▤ تسجيل شراء</button><div className="today-note">اليوم: <b>{today.length}</b> عملية</div></div></section></>;
}
function Stat({title,value,icon}:{title:string;value:string;icon:string}){return <div className="stat-card"><span className="stat-icon">{icon}</span><div><div className="muted">{title}</div><strong>{value}</strong></div></div>}

function Transactions({user,txs,filtered,form,setForm,editing,filter,setFilter,error,submit,startEdit,resetForm,cancelTx}:{user:User;txs:Tx[];filtered:Tx[];form:any;setForm:any;editing:number|null;setEditing:any;filter:any;setFilter:any;error:string;submit:(e:React.FormEvent)=>void;startEdit:(t:Tx)=>void;resetForm:()=>void;cancelTx:(t:Tx)=>void}){
 return <><div className="page-heading"><h1>المعاملات</h1><p>تسجيل الحركة ومراجعة سجل العمليات في نفس الصفحة.</p></div><section className="card transaction-form-card"><div className="card-head"><div><h2>{editing?"تعديل حركة":"تسجيل حركة"}</h2><p className="muted">المبلغ والتبرير حقول إجبارية.</p></div>{editing&&<button type="button" onClick={resetForm}>إلغاء التعديل</button>}</div><form onSubmit={submit} className="transaction-form"><div><label>نوع العملية</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></div><div><label>المبلغ (دج)</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div><label>التبرير / السبب</label><input value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="مثال: شراء منتجات للمحل"/></div><div className="form-actions"><button className="primary">{editing?"حفظ التعديل":"تسجيل الحركة"}</button></div></form>{error&&<div className="error">{error}</div>}</section><section className="card full-card transactions-list-card"><div className="card-head"><div><h2>سجل المعاملات</h2><p className="muted">العمليات المتاحة لهذا الحساب.</p></div><strong>{filtered.length} عملية</strong></div><div className="filters"><input placeholder="بحث في التبرير أو المبلغ..." value={filter.search} onChange={e=>setFilter({...filter,search:e.target.value})}/><select value={filter.type} onChange={e=>setFilter({...filter,type:e.target.value})}><option>الكل</option>{types.map(t=><option key={t}>{t}</option>)}</select><select value={filter.creator} onChange={e=>setFilter({...filter,creator:e.target.value})}><option>الكل</option>{Array.from(new Set(txs.map(t=>t.created_by_name))).map(n=><option key={n}>{n}</option>)}</select></div><TransactionTable rows={filtered} user={user} onEdit={startEdit} onCancel={cancelTx}/></section></>;
}
function TransactionTable({rows,user,onEdit,onCancel}:{rows:Tx[];user:User;onEdit:(t:Tx)=>void;onCancel:(t:Tx)=>void}){return <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>المسجل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{formatMoney(t.amount)}</td><td>{t.reason}</td><td>{t.created_by_name}</td><td>{t.status==="active"?"نشطة":"ملغاة"}</td><td>{t.status==="active"&&(user.role==="admin"||t.created_by===user.id)?<><button onClick={()=>onEdit(t)}>تعديل</button> <button onClick={()=>onCancel(t)}>إلغاء</button></>:"—"}</td></tr>)}</tbody></table>{rows.length===0&&<div className="empty">لا توجد عمليات.</div>}</div>}

function Placeholder({section,user}:{section:Section;user:User}){const item=navItems.find(x=>x.id===section)!;return <section className="card coming"><div className="coming-icon">{item.icon}</div><h1>{item.label}</h1><p>هذا القسم جاهز في الهيكل العام للبرنامج، وسنبدأ بناء وظائفه بالتفصيل في المرحلة التالية.</p>{section==="reports"&&<div className="report-list"><span>تقارير المبيعات</span><span>تقارير المشتريات</span><span>تقارير المصاريف والسحوبات</span><span>تقارير الديون والمستحقات</span><span>تقارير الأرباح</span><span>حساب أحمد ومحمد</span></div>}{section==="invoices"&&<div className="report-list"><span>طباعة الفواتير</span><span>تصدير Word</span><span>تصدير Excel</span><span>تصدير PDF</span></div>}{section==="debts"&&<div className="report-list"><span>دين — مبلغ على المحل</span><span>مديون — مبلغ للمحل</span><span>تسديد جزئي أو كامل</span></div>}</section>}

createRoot(document.getElementById("root")!).render(<App />);
