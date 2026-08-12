import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";
import "./merge.css";

type User={id:number;username:string;displayName:string;role:"partner1"|"partner2"|"admin"};
type Tx={id:number;type:string;amount:number;reason:string;beneficiary:string;notes:string;visibility:string;created_by:number;created_by_name:string;created_at:string;updated_at:string|null;status:string};
type Product={id:number;name:string;sku:string;unit:string;purchase_price:number;sale_price:number;quantity:number;min_quantity:number;active:number;created_at:string;updated_at:string|null};
type Section="summary"|"transactions"|"products"|"trade"|"debts"|"reports"|"invoices"|"capital"|"settings";
const SAVED_USERNAME_KEY="almaktaba_saved_username";
const types=["شراء","بيع","مصروف","سحب","إيداع","دين","تسديد دين","أخرى"];
const navItems:{id:Section;label:string;icon:string}[]=[{id:"summary",label:"الملخص",icon:"⌂"},{id:"transactions",label:"المعاملات",icon:"↔"},{id:"products",label:"المنتجات",icon:"▦"},{id:"trade",label:"المبيعات والمشتريات",icon:"▣"},{id:"debts",label:"الديون والمستحقات",icon:"◫"},{id:"reports",label:"التقارير",icon:"▥"},{id:"invoices",label:"الفواتير والتصدير",icon:"▧"},{id:"capital",label:"\u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644 \u0648\u0627\u0644\u062a\u0633\u0648\u064a\u0629",icon:"?"},{id:"settings",label:"الإعدادات",icon:"⚙"}];
function money(v:number){return `${Number(v||0).toLocaleString("ar-DZ")} دج`}
function excel(filename:string,headers:string[],rows:string[][]){const esc=(v:string)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");const html=`<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;const blob=new Blob(["\ufeff",html],{type:"application/vnd.ms-excel;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}

function App(){
 const[user,setUser]=useState<User|null>(null),[section,setSection]=useState<Section>("summary"),[navOpen,setNavOpen]=useState(true);
 const[login,setLogin]=useState({username:localStorage.getItem(SAVED_USERNAME_KEY)||"",password:""});
 const[error,setError]=useState(""),[txs,setTxs]=useState<Tx[]>([]),[products,setProducts]=useState<Product[]>([]);
 const[form,setForm]=useState({type:"شراء",amount:"",reason:"",visibility:"shop"}),[editing,setEditing]=useState<number|null>(null),[filter,setFilter]=useState({search:"",type:"الكل",creator:"الكل"});
 const[showPassword,setShowPassword]=useState(false),[passwords,setPasswords]=useState({old:"",next:""});
 async function refresh(){setTxs(await window.almaktaba.listTransactions())} async function refreshProducts(){setProducts(await window.almaktaba.listProducts())}
 useEffect(()=>{window.almaktaba.getSession().then(s=>s&&setUser(s))},[]);useEffect(()=>{if(user){refresh();refreshProducts()}},[user]);
 async function doLogin(e:React.FormEvent){e.preventDefault();setError("");const r=await window.almaktaba.login(login.username,login.password);if(!r.ok)return setError(r.error);if(r.user.role!=="admin")localStorage.setItem(SAVED_USERNAME_KEY,r.user.username);else localStorage.removeItem(SAVED_USERNAME_KEY);setUser(r.user)}
 async function doLogout(){await window.almaktaba.logout();setUser(null);setSection("summary");setError("");setLogin({username:localStorage.getItem(SAVED_USERNAME_KEY)||"",password:""})}
 async function submit(e:React.FormEvent){e.preventDefault();setError("");const r=editing?await window.almaktaba.updateTransaction(editing,form):await window.almaktaba.createTransaction(form);if(!r.ok)return setError(r.error);setEditing(null);setForm({type:"شراء",amount:"",reason:"",visibility:"shop"});await refresh()}
 function edit(t:Tx){setEditing(t.id);setForm({type:t.type,amount:String(t.amount),reason:t.reason,visibility:t.visibility});setSection("transactions")}
 async function cancelTx(t:Tx){const reason=window.prompt("سبب الإلغاء:");if(reason===null)return;const r=await window.almaktaba.voidTransaction(t.id,reason);if(!r.ok)return window.alert(r.error);refresh()}
 async function changePassword(e:React.FormEvent){e.preventDefault();const r=await window.almaktaba.changeOwnPassword(passwords.old,passwords.next);if(!r.ok)return window.alert(r.error);window.alert("تم تغيير كلمة المرور");setPasswords({old:"",next:""});setShowPassword(false)}
 const filtered=useMemo(()=>txs.filter(t=>{const q=filter.search.trim().toLowerCase();return(filter.type==="الكل"||t.type===filter.type)&&(filter.creator==="الكل"||t.created_by_name===filter.creator)&&(!q||`${t.reason} ${t.amount}`.toLowerCase().includes(q))}),[txs,filter]);
 const totals=useMemo(()=>({purchases:txs.filter(t=>t.type==="شراء"&&t.status==="active").reduce((s,t)=>s+t.amount,0),sales:txs.filter(t=>t.type==="بيع"&&t.status==="active").reduce((s,t)=>s+t.amount,0),expenses:txs.filter(t=>t.type==="مصروف"&&t.status==="active").reduce((s,t)=>s+t.amount,0),withdrawals:txs.filter(t=>t.type==="سحب"&&t.status==="active").reduce((s,t)=>s+t.amount,0)}),[txs]);
 if(!user)return <div className="login-page"><button type="button" className="login-close" title="إغلاق البرنامج" aria-label="إغلاق البرنامج" onClick={()=>window.almaktaba.closeWindow()}>×</button><form className="login-card" onSubmit={doLogin}><div className="logo">المكتبة</div><label>اسم المستخدم</label><input value={login.username} onChange={e=>setLogin({...login,username:e.target.value})} autoFocus/><label>كلمة المرور</label><input type="password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/>{error&&<div className="error">{error}</div>}<button className="primary login-button">دخول</button></form></div>;
 return <div className="app"><header className="topbar"><div className="window-controls"><button className="window-btn minimize" onClick={()=>window.almaktaba.minimizeWindow()}>−</button><button className="window-btn close" onClick={()=>window.almaktaba.closeWindow()}>×</button></div><button className="app-badge" onClick={()=>setSection("summary")}><span>المكتبة</span><span className="store-icon">▦</span></button><div className="top-user"><div className="top-user-text"><b>{user.role==="admin"?"الحساب 3":user.displayName}</b></div><button className="info-btn" onClick={()=>setSection("settings")}>i</button><button className="logout-btn" onClick={doLogout}>تسجيل الخروج</button><button className="menu-btn" onClick={()=>setNavOpen(v=>!v)}>☰</button></div></header>
 {navOpen&&<nav className="main-nav">{navItems.map(i=><button key={i.id} className={section===i.id?"nav-item active":"nav-item"} onClick={()=>setSection(i.id)}><span className="nav-icon">{i.icon}</span><span>{i.label}</span></button>)}</nav>}
 <main className="content">{section==="summary"?<Summary totals={totals} txs={txs} setSection={setSection}/>:section==="transactions"?<Transactions user={user} txs={txs} filtered={filtered} form={form} setForm={setForm} editing={editing} filter={filter} setFilter={setFilter} error={error} submit={submit} reset={()=>{setEditing(null);setError("");setForm({type:"شراء",amount:"",reason:"",visibility:"shop"})}} edit={edit} cancelTx={cancelTx}/>:section==="products"?<Products products={products} refresh={refreshProducts}/>:section==="trade"?<TradeView txs={txs} products={products} onSaved={refresh}/>:section==="debts"?<Debts txs={txs} setSection={setSection}/>:section==="reports"?<Reports txs={txs} products={products}/>:section==="invoices"?<Invoices txs={txs} products={products}/>:section==="capital"?<CapitalSettlement user={user}/>:<Settings user={user} onPassword={()=>setShowPassword(true)} onUserUpdated={setUser}/>}</main>
 {showPassword&&<div className="modal"><form className="modal-card" onSubmit={changePassword}><h3>تغيير كلمة المرور</h3><input type="password" placeholder="كلمة المرور الحالية" value={passwords.old} onChange={e=>setPasswords({...passwords,old:e.target.value})}/><input type="password" placeholder="كلمة المرور الجديدة" value={passwords.next} onChange={e=>setPasswords({...passwords,next:e.target.value})}/><button className="primary">حفظ</button><button type="button" onClick={()=>setShowPassword(false)}>إلغاء</button></form></div>}</div>
}

function Summary({totals,txs,setSection}:{totals:any;txs:Tx[];setSection:(s:Section)=>void}){return <><div className="page-heading"><h1>ملخص اليوم</h1></div><div className="stat-grid"><Stat title="المبيعات" value={money(totals.sales)} icon="▣"/><Stat title="المشتريات" value={money(totals.purchases)} icon="▤"/><Stat title="المصاريف" value={money(totals.expenses)} icon="−"/><Stat title="السحوبات" value={money(totals.withdrawals)} icon="↓"/></div><section className="dashboard-grid"><div className="card"><div className="card-head"><h2>آخر العمليات</h2><button onClick={()=>setSection("transactions")}>عرض الكل</button></div><TransactionTable rows={txs.slice(0,5)} user={{id:-1,username:"",displayName:"",role:"admin"}} onEdit={()=>setSection("transactions")} onCancel={()=>setSection("transactions")}/></div><div className="card quick-card"><h2>المعاملات السريعة</h2><button className="quick-action" onClick={()=>setSection("transactions")}>＋ تسجيل حركة</button><button className="quick-action" onClick={()=>setSection("products")}>▦ إضافة منتج</button><button className="quick-action" onClick={()=>setSection("trade")}>▣ المبيعات والمشتريات</button></div></section></>}
function Stat({title,value,icon}:{title:string;value:string;icon:string}){return <div className="stat-card"><span className="stat-icon">{icon}</span><div><div className="muted">{title}</div><strong>{value}</strong></div></div>}

function Transactions({user,txs,filtered,form,setForm,editing,filter,setFilter,error,submit,reset,edit,cancelTx}:{user:User;txs:Tx[];filtered:Tx[];form:any;setForm:any;editing:number|null;filter:any;setFilter:any;error:string;submit:(e:React.FormEvent)=>void;reset:()=>void;edit:(t:Tx)=>void;cancelTx:(t:Tx)=>void}){return <><div className="page-heading"><h1>المعاملات</h1></div><section className="card transaction-form-card"><div className="card-head"><h2>{editing?"تعديل حركة":"تسجيل حركة"}</h2>{editing&&<button type="button" onClick={reset}>إلغاء</button>}</div><form onSubmit={submit} className="transaction-form"><div><label>نوع العملية</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></div><div><label>المبلغ (دج)</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div><label>التبرير / السبب</label><input value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div><div className="form-actions"><button className="primary">{editing?"حفظ التعديل":"تسجيل الحركة"}</button></div></form>{error&&<div className="error">{error}</div>}</section><section className="card full-card transactions-list-card"><div className="card-head"><h2>سجل المعاملات</h2><strong>{filtered.length}</strong></div><div className="filters"><input placeholder="بحث..." value={filter.search} onChange={e=>setFilter({...filter,search:e.target.value})}/><select value={filter.type} onChange={e=>setFilter({...filter,type:e.target.value})}><option>الكل</option>{types.map(t=><option key={t}>{t}</option>)}</select><select value={filter.creator} onChange={e=>setFilter({...filter,creator:e.target.value})}><option>الكل</option>{Array.from(new Set(txs.map(t=>t.created_by_name))).map(n=><option key={n}>{n}</option>)}</select></div><TransactionTable rows={filtered} user={user} onEdit={edit} onCancel={cancelTx}/></section></>}
function TransactionTable({rows,user,onEdit,onCancel}:{rows:Tx[];user:User;onEdit:(t:Tx)=>void;onCancel:(t:Tx)=>void}){return <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>المسجل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.reason}</td><td>{t.created_by_name}</td><td>{t.status==="active"?"نشطة":"ملغاة"}</td><td>{t.status==="active"&&(user.role==="admin"||t.created_by===user.id)?<><button onClick={()=>onEdit(t)}>تعديل</button> <button onClick={()=>onCancel(t)}>إلغاء</button></>:"—"}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty">لا توجد عمليات.</div>}</div>}

function Products({products,refresh}:{products:Product[];refresh:()=>Promise<void>}){
 const empty={name:"",sku:"",unit:"قطعة",purchasePrice:"",salePrice:"",quantity:"0",minQuantity:"0"};
 const[form,setForm]=useState(empty);const[editing,setEditing]=useState<number|null>(null);const[search,setSearch]=useState("");const[error,setError]=useState("");const[notice,setNotice]=useState("");const barcodeRef=useRef<HTMLInputElement>(null);
 const list=products.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()));
 async function save(e:React.FormEvent){e.preventDefault();setError("");setNotice("");const r=editing?await window.almaktaba.updateProduct(editing,form):await window.almaktaba.createProduct(form);if(!r.ok)return setError(r.error);setForm(empty);setEditing(null);await refresh();if(r.sku)setNotice(`تمت إضافة المنتج — الرمز التلقائي: ${r.sku}`)}
 async function del(p:Product){if(!confirm(`حذف ${p.name}؟`))return;const r=await window.almaktaba.deleteProduct(p.id);if(!r.ok)return alert(r.error);refresh()}
 function start(p:Product){setEditing(p.id);setNotice("");setForm({name:p.name,sku:p.sku,unit:p.unit,purchasePrice:String(p.purchase_price),salePrice:String(p.sale_price),quantity:String(p.quantity),minQuantity:String(p.min_quantity)});setTimeout(()=>barcodeRef.current?.focus(),0)}
 return <><div className="page-heading"><h1>المنتجات</h1></div><div className="stat-grid"><Stat title="عدد المنتجات" value={String(products.length)} icon="▦"/><Stat title="منخفضة المخزون" value={String(products.filter(p=>p.quantity<=p.min_quantity).length)} icon="!"/><Stat title="قيمة المخزون" value={money(products.reduce((s,p)=>s+p.quantity*p.purchase_price,0))} icon="دج"/><Stat title="قيمة البيع" value={money(products.reduce((s,p)=>s+p.quantity*p.sale_price,0))} icon="↗"/></div><section className="card product-form-card"><div className="card-head"><h2>{editing?"تعديل منتج":"إضافة منتج"}</h2>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(empty);setNotice("")}}>إلغاء</button>}</div><form className="product-form" onSubmit={save}><div><label>اسم المنتج</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label>الرمز / الباركود</label><div className="barcode-input-wrap"><input ref={barcodeRef} value={form.sku} placeholder="اتركه فارغاً للرمز التلقائي" onKeyDown={e=>{if(e.key==="Enter")e.preventDefault()}} onChange={e=>setForm({...form,sku:e.target.value})}/><button type="button" title="تركيز قارئ الباركود" onClick={()=>barcodeRef.current?.focus()}>⌕</button></div></div><div><label>الوحدة</label><input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></div><div><label>سعر الشراء</label><input type="number" min="0" value={form.purchasePrice} onChange={e=>setForm({...form,purchasePrice:e.target.value})}/></div><div><label>سعر البيع</label><input type="number" min="0" value={form.salePrice} onChange={e=>setForm({...form,salePrice:e.target.value})}/></div><div><label>الكمية</label><input type="number" min="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></div><div><label>حد التنبيه</label><input type="number" min="0" value={form.minQuantity} onChange={e=>setForm({...form,minQuantity:e.target.value})}/></div><div className="form-actions"><button className="primary">{editing?"حفظ":"إضافة"}</button></div></form><div className="barcode-hint">قارئ الباركود USB يعمل مباشرة داخل خانة «الرمز / الباركود». امسح الكود وسيُكتب تلقائياً، ويمكنك مسحه يدوياً وترك الحقل فارغاً.</div>{error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}</section><section className="card full-card"><div className="card-head"><h2>قائمة المنتجات</h2><strong>{list.length}</strong></div><div className="filters"><input placeholder="بحث بالاسم أو الرمز..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>المنتج</th><th>الرمز</th><th>الوحدة</th><th>الشراء</th><th>البيع</th><th>الكمية</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{list.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.sku||"—"}</td><td>{p.unit}</td><td>{money(p.purchase_price)}</td><td>{money(p.sale_price)}</td><td>{p.quantity}</td><td>{p.quantity<=p.min_quantity?<span className="stock-low">منخفض</span>:"جيد"}</td><td><button onClick={()=>start(p)}>تعديل</button> <button onClick={()=>del(p)}>حذف</button></td></tr>)}</tbody></table></div></section></>}

function TradeView({txs,products,onSaved}:{txs:Tx[];products:Product[];onSaved:()=>Promise<void>}){const[kind,setKind]=useState<"بيع"|"شراء">("بيع");const[productId,setProductId]=useState("");const[qty,setQty]=useState("1");const[person,setPerson]=useState("");const[error,setError]=useState("");const p=products.find(x=>String(x.id)===productId);const q=Number(qty)||0;const price=p?(kind==="بيع"?p.sale_price:p.purchase_price):0;const total=q*price;const rows=txs.filter(t=>t.type===kind&&t.status==="active");async function save(e:React.FormEvent){e.preventDefault();setError("");if(!p)return setError("اختر المنتج");if(q<=0)return setError("أدخل كمية صحيحة");if(kind==="بيع"&&q>p.quantity)return setError("الكمية أكبر من المخزون");const r=await window.almaktaba.createTransaction({type:kind,amount:total,reason:`${kind} ${p.name} × ${q} ${p.unit}`,beneficiary:person,notes:`المنتج: ${p.name} | الكمية: ${q} | سعر الوحدة: ${price}`});if(!r.ok)return setError(r.error);setProductId("");setQty("1");setPerson("");await onSaved()}return <><div className="page-heading"><h1>المبيعات والمشتريات</h1></div><div className="trade-tabs"><button className={kind==="بيع"?"active":""} onClick={()=>setKind("بيع")}>المبيعات</button><button className={kind==="شراء"?"active":""} onClick={()=>setKind("شراء")}>المشتريات</button></div><section className="card trade-form"><div className="card-head"><h2>تسجيل {kind}</h2></div><form className="trade-grid" onSubmit={save}><div><label>المنتج</label><select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">اختر المنتج</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {x.quantity}</option>)}</select></div><div><label>الكمية</label><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}/></div><div><label>{kind==="بيع"?"الزبون":"المورد"}</label><input value={person} onChange={e=>setPerson(e.target.value)}/></div><div><label>سعر الوحدة</label><input readOnly value={money(price)}/></div><div><label>الإجمالي</label><input readOnly value={money(total)}/></div><div className="form-actions"><button className="primary">تسجيل {kind}</button></div></form>{error&&<div className="error">{error}</div>}</section><section className="card full-card"><div className="card-head"><h2>سجل {kind}</h2><strong>{rows.length}</strong></div><TransactionTable rows={rows} user={{id:-1,username:"",displayName:"",role:"admin"}} onEdit={()=>{}} onCancel={()=>{}}/></section></>}

function Debts({txs,setSection}:{txs:Tx[];setSection:(s:Section)=>void}){const debts=txs.filter(t=>t.type==="دين"&&t.status==="active"),paid=txs.filter(t=>t.type==="تسديد دين"&&t.status==="active");const d=debts.reduce((s,t)=>s+t.amount,0),p=paid.reduce((s,t)=>s+t.amount,0);return <><div className="page-heading"><h1>الديون والمستحقات</h1></div><div className="stat-grid"><Stat title="إجمالي الديون" value={money(d)} icon="◫"/><Stat title="التسديد" value={money(p)} icon="✓"/><Stat title="الرصيد" value={money(d-p)} icon="دج"/><Stat title="عدد الديون" value={String(debts.length)} icon="#"/></div><section className="card full-card"><div className="card-head"><h2>سجل الديون والتسديدات</h2><button onClick={()=>setSection("transactions")}>تسجيل حركة</button></div><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>التبرير</th><th>الطرف</th><th>المسجل</th></tr></thead><tbody>{txs.filter(t=>(t.type==="دين"||t.type==="تسديد دين")&&t.status==="active").map(t=><tr key={t.id}><td>{new Date(t.created_at).toLocaleString("ar-DZ")}</td><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.reason}</td><td>{t.beneficiary||"—"}</td><td>{t.created_by_name}</td></tr>)}</tbody></table></div></section></>}
function Reports({txs,products}:{txs:Tx[];products:Product[]}){const a=txs.filter(t=>t.status==="active"),sales=a.filter(t=>t.type==="بيع").reduce((s,t)=>s+t.amount,0),purchases=a.filter(t=>t.type==="شراء").reduce((s,t)=>s+t.amount,0),expenses=a.filter(t=>t.type==="مصروف").reduce((s,t)=>s+t.amount,0);return <><div className="page-heading"><h1>التقارير</h1></div><div className="stat-grid"><Stat title="المبيعات" value={money(sales)} icon="▣"/><Stat title="المشتريات" value={money(purchases)} icon="▤"/><Stat title="المصاريف" value={money(expenses)} icon="−"/><Stat title="الصافي" value={money(sales-purchases-expenses)} icon="↗"/></div><section className="report-grid"><div className="card"><h2>حسب نوع العملية</h2>{types.map(t=>{const rows=a.filter(x=>x.type===t);return rows.length?<div className="report-row" key={t}><b>{t}</b><span>{rows.length}</span><strong>{money(rows.reduce((s,x)=>s+x.amount,0))}</strong></div>:null})}</div><div className="card"><h2>المخزون</h2><div className="report-row"><b>عدد المنتجات</b><strong>{products.length}</strong></div><div className="report-row"><b>منخفضة المخزون</b><strong>{products.filter(p=>p.quantity<=p.min_quantity).length}</strong></div><div className="report-row"><b>قيمة الشراء</b><strong>{money(products.reduce((s,p)=>s+p.quantity*p.purchase_price,0))}</strong></div></div></section></>}
function Invoices({txs,products}:{txs:Tx[];products:Product[]}){const exportTx=()=>excel(`almaktaba-transactions-${Date.now()}.xls`,["التاريخ","النوع","المبلغ","التبرير","الطرف","المسجل","الحالة"],txs.map(t=>[new Date(t.created_at).toLocaleString("ar-DZ"),t.type,String(t.amount),t.reason,t.beneficiary||"",t.created_by_name,t.status]));const exportProducts=()=>excel(`almaktaba-products-${Date.now()}.xls`,["المنتج","الرمز","الوحدة","سعر الشراء","سعر البيع","الكمية","حد التنبيه"],products.map(p=>[p.name,p.sku||"",p.unit,String(p.purchase_price),String(p.sale_price),String(p.quantity),String(p.min_quantity)]));return <><div className="page-heading"><h1>الفواتير والتصدير</h1></div><section className="export-grid"><div className="card export-card"><div className="export-icon">↔</div><h2>المعاملات</h2><button className="primary" onClick={exportTx}>تصدير Excel</button></div><div className="card export-card"><div className="export-icon">▦</div><h2>المنتجات</h2><button className="primary" onClick={exportProducts}>تصدير Excel</button></div></section><section className="card"><div className="card-head"><h2>الفواتير</h2></div>{txs.filter(t=>t.type==="بيع"&&t.status==="active").slice(0,20).map(t=><div className="invoice-row" key={t.id}><div><b>فاتورة #{t.id}</b><span>{new Date(t.created_at).toLocaleString("ar-DZ")} — {t.reason}</span></div><strong>{money(t.amount)}</strong><button onClick={()=>printInvoice(t)}>طباعة</button></div>)}</section></>}
function printInvoice(t:Tx){const w=window.open("","_blank","width=760,height=800");if(!w)return;w.document.write(`<html dir="rtl"><head><title>فاتورة #${t.id}</title><style>body{font-family:Arial;padding:40px}.box{border:1px solid #ddd;padding:20px;border-radius:12px}.row{display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #eee}.total{font-size:22px;font-weight:bold;margin-top:15px}</style></head><body><h1>المكتبة</h1><p>فاتورة بيع رقم ${t.id}</p><div class="box"><div class="row"><span>التاريخ</span><span>${new Date(t.created_at).toLocaleString("ar-DZ")}</span></div><div class="row"><span>البيان</span><span>${t.reason}</span></div><div class="row"><span>الزبون</span><span>${t.beneficiary||"—"}</span></div><div class="total">الإجمالي: ${money(t.amount)}</div></div><script>window.onload=()=>window.print()</script></body></html>`);w.document.close()}




function CapitalSettlement({user}:{user:User}){
const[year,setYear]=useState(String(new Date().getFullYear()));
const[capital,setCapital]=useState({partner1:"0",partner2:"0"});
const[settlement,setSettlement]=useState<any>(null);
const[error,setError]=useState("");
const[notice,setNotice]=useState("");

async function loadCapital(){
const r=await window.almaktaba.getPartnerCapital();
if(!r.ok){
setError(r.error||"\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644");
return;
}
const rows=Array.isArray(r.capital)?r.capital:[];
const ahmed=rows.find((x:any)=>x.partner_role==="partner1");
const mohamed=rows.find((x:any)=>x.partner_role==="partner2");
setCapital({
partner1:String(ahmed?.amount??0),
partner2:String(mohamed?.amount??0)
});
}

async function calculate(){
setError("");
const r=await window.almaktaba.getAnnualSettlement(Number(year));
if(!r.ok){
setError(r.error||"\u062a\u0639\u0630\u0631 \u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u0633\u0648\u064a\u0629");
return;
}
setSettlement(r);
}

useEffect(()=>{
void loadCapital();
void calculate();
},[]);

async function save(role:"partner1"|"partner2"){
if(user.role!=="admin")return;

setError("");
setNotice("");

const amount=Number(capital[role]);

if(!Number.isFinite(amount)||amount<0){
setError("\u0623\u062f\u062e\u0644 \u0645\u0628\u0644\u063a\u064b\u0627 \u0635\u062d\u064a\u062d\u064b\u0627");
return;
}

const r=await window.almaktaba.setPartnerCapital(role,amount);

if(!r.ok){
setError(r.error||"\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644");
return;
}

setNotice("\u062a\u0645 \u062d\u0641\u0638 \u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644 \u0628\u0646\u062c\u0627\u062d");
await calculate();
}

const totalCapital=
Number(capital.partner1||0)+
Number(capital.partner2||0);

const ratioAhmed=
totalCapital>0?Number(capital.partner1)/totalCapital:0;

const ratioMohamed=
totalCapital>0?Number(capital.partner2)/totalCapital:0;

return <>
<div className="page-heading">
<h1>{"\u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644 \u0648\u0627\u0644\u062a\u0633\u0648\u064a\u0629"}</h1>
</div>

<section className="settings-grid">

<div className="card">
<div className="card-head">
<h2>{"\u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644"}</h2>
</div>

<div className="setting-row">
<span>{"\u0623\u062d\u0645\u062f \u2014 \u0645\u0628\u0644\u063a \u0627\u0644\u062f\u062e\u0648\u0644"}</span>
<input
type="number"
min="0"
step="0.01"
disabled={user.role!=="admin"}
value={capital.partner1}
onChange={e=>setCapital({...capital,partner1:e.target.value})}
/>
</div>

<div className="setting-row">
<span>{"\u0646\u0633\u0628\u0629 \u0623\u062d\u0645\u062f"}</span>
<strong>{(ratioAhmed*100).toFixed(2)}%</strong>
</div>

<div className="setting-row">
<span>{"\u0645\u062d\u0645\u062f \u2014 \u0645\u0628\u0644\u063a \u0627\u0644\u062f\u062e\u0648\u0644"}</span>
<input
type="number"
min="0"
step="0.01"
disabled={user.role!=="admin"}
value={capital.partner2}
onChange={e=>setCapital({...capital,partner2:e.target.value})}
/>
</div>

<div className="setting-row">
<span>{"\u0646\u0633\u0628\u0629 \u0645\u062d\u0645\u062f"}</span>
<strong>{(ratioMohamed*100).toFixed(2)}%</strong>
</div>

<div className="setting-row">
<span>{"\u0625\u062c\u0645\u0627\u0644\u064a \u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644"}</span>
<strong>{money(totalCapital)}</strong>
</div>

{user.role==="admin"&&
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
<button className="primary" onClick={()=>save("partner1")}>
{"\u062d\u0641\u0638 \u0645\u0628\u0644\u063a \u0623\u062d\u0645\u062f"}
</button>

<button className="primary" onClick={()=>save("partner2")}>
{"\u062d\u0641\u0638 \u0645\u0628\u0644\u063a \u0645\u062d\u0645\u062f"}
</button>
</div>
}

{notice&&<div className="success">{notice}</div>}
{error&&<div className="error">{error}</div>}
</div>

<div className="card">
<div className="card-head">
<h2>{"\u0627\u0644\u062a\u0633\u0648\u064a\u0629 \u0627\u0644\u0633\u0646\u0648\u064a\u0629"}</h2>
</div>

<div className="setting-row">
<span>{"\u0627\u0644\u0633\u0646\u0629"}</span>
<input
type="number"
min="2000"
max="2100"
value={year}
onChange={e=>setYear(e.target.value)}
/>
</div>

<button className="primary" onClick={calculate}>
{"\u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u0633\u0648\u064a\u0629"}
</button>
</div>

</section>

{settlement&&
<section className="card">

<div className="card-head">
<h2>{"\u062a\u0633\u0648\u064a\u0629 \u0633\u0646\u0629"} {settlement.year}</h2>
</div>

<div className="setting-row">
<span>{"\u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a"}</span>
<strong>{money(settlement.totals.sales)}</strong>
</div>

<div className="setting-row">
<span>{"\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a"}</span>
<strong>{money(settlement.totals.purchases)}</strong>
</div>

<div className="setting-row">
<span>{"\u0627\u0644\u0645\u0635\u0627\u0631\u064a\u0641"}</span>
<strong>{money(settlement.totals.expenses)}</strong>
</div>

<div className="setting-row">
<span>{"\u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0635\u0627\u0641\u064a"}</span>
<strong>{money(settlement.totals.netProfit)}</strong>
</div>

<div className="table-wrap">
<table>
<thead>
<tr>
<th>{"\u0627\u0644\u0627\u0633\u0645"}</th>
<th>{"\u0645\u0628\u0644\u063a \u0627\u0644\u062f\u062e\u0648\u0644"}</th>
<th>{"\u0627\u0644\u0646\u0633\u0628\u0629"}</th>
<th>{"\u062d\u0635\u0629 \u0627\u0644\u0631\u0628\u062d"}</th>
<th>{"\u0627\u0644\u0633\u062d\u0648\u0628\u0627\u062a"}</th>
<th>{"\u0627\u0644\u0645\u0633\u062a\u062d\u0642 \u0627\u0644\u0646\u0647\u0627\u0626\u064a"}</th>
</tr>
</thead>

<tbody>
{settlement.partners.map((p:any)=>
<tr key={p.role}>
<td>{p.display_name}</td>
<td>{money(p.capital)}</td>
<td>{(Number(p.ratio)*100).toFixed(2)}%</td>
<td>{money(p.profitShare)}</td>
<td>{money(p.withdrawals)}</td>
<td><strong>{money(p.settlement)}</strong></td>
</tr>
)}
</tbody>
</table>
</div>

<div className="muted" style={{marginTop:12}}>
{"\u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0635\u0627\u0641\u064a = \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u2212 \u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a \u2212 \u0627\u0644\u0645\u0635\u0627\u0631\u064a\u0641\u060c \u062b\u0645 \u064a\u0648\u0632\u0639 \u062d\u0633\u0628 \u0646\u0633\u0628\u0629 \u0645\u0628\u0644\u063a \u0627\u0644\u062f\u062e\u0648\u0644\u060c \u0648\u0628\u0639\u062f\u0647\u0627 \u062a\u062e\u0635\u0645 \u0627\u0644\u0633\u062d\u0648\u0628\u0627\u062a."}
</div>

</section>
}

</>
}
function Settings({user,onPassword,onUserUpdated}:{user:User;onPassword:()=>void;onUserUpdated:(u:User)=>void}){const[form,setForm]=useState({username:user.username,displayName:user.displayName});const[saving,setSaving]=useState(false);const[error,setError]=useState("");useEffect(()=>setForm({username:user.username,displayName:user.displayName}),[user]);async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");const r=await window.almaktaba.updateProfile(form.username,form.displayName);setSaving(false);if(!r.ok)return setError(r.error);onUserUpdated(r.user);if(r.user.role!=="admin")localStorage.setItem(SAVED_USERNAME_KEY,r.user.username);alert("تم حفظ التعديلات")}return <><div className="page-heading"><h1>الإعدادات</h1></div><section className="settings-grid"><div className="card settings-account"><div className="card-head"><h2>بيانات الحساب</h2></div><form onSubmit={save} className="settings-form"><div><label>اسم المستخدم</label><input value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></div><div><label>الاسم الظاهر</label><input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></div><button className="primary" disabled={saving}>{saving?"جاري الحفظ...":"حفظ التعديلات"}</button></form>{error&&<div className="error">{error}</div>}<div className="password-setting"><b>كلمة المرور</b><button onClick={onPassword}>تغيير كلمة المرور</button></div></div><div className="card"><h2>النظام</h2><div className="setting-row"><span>التطبيق</span><strong>المكتبة</strong></div><div className="setting-row"><span>الوضع</span><strong>بدون إنترنت</strong></div><div className="setting-row"><span>البيانات</span><strong>SQLite</strong></div></div></section></>}

createRoot(document.getElementById("root")!).render(<App/>);
