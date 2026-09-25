/* ==========================================================================
   Админка Charteri: состояние, роли, журнал действий, агентства.

   Данные трёх демо лежат в одном браузере:
     S     — кабинет живого агентства (CAB_KEY), его же видит кабинет;
     SITE  — сайт для пассажиров (SITE_KEY), если его открывали;
     O     — сама админка (OPS_KEY): сотрудники, журнал, другие агентства;
     APPS_KEY — заявки на подключение, их пишет форма регистрации кабинета.
   Каждое изменение: перечитать свежие данные → изменить → сохранить →
   записать в журнал. Так вкладка кабинета и админка не затирают друг друга.
   ========================================================================== */
"use strict";

const OPS_KEY = "charteri.ops.demo.v1";
const HB_EVERY_MS = 5000;
let O = null, SITE = null;

/* ---- роли ----
   Главный администратор может всё. Остальные — по списку прав. */
const ROLES = ["admin", "operator", "cashier", "accountant"];
const PERMS = {
  operator:   ["tasks", "orders", "orders.price", "orders.confirm", "orders.cancel", "agencies", "agencies.moderate", "agencies.message", "customers", "requests.resolve", "catalog", "integrations", "audit"],
  cashier:    ["tasks", "orders", "agencies", "finance", "topups.confirm", "refunds.credit"],
  accountant: ["orders", "agencies", "finance", "finance.export", "audit"]
};
/* Права, которые есть в админке, — для таблицы на странице «Сотрудники». */
const PERM_LIST = ["tasks", "orders", "orders.price", "orders.confirm", "orders.cancel", "refunds.credit", "agencies", "agencies.moderate",
  "agencies.create", "agencies.edit", "agencies.message", "agencies.block", "balance.adjust", "customers", "requests.resolve", "finance", "topups.confirm",
  "finance.export", "pricing.edit", "catalog", "catalog.edit", "integrations", "staff", "staff.edit", "audit", "demo.reset"];
/* Вошедший сотрудник — только активный: отключённый теряет доступ сразу. */
const me = () => O?.staff.find(s => s.id === O.session?.staffId && s.active !== false) || null;
const activeStaff = () => O.staff.filter(s => s.active !== false);
const can = p => { const r = me()?.role; return r === "admin" || !!PERMS[r]?.includes(p); };
/* Кнопка без права не прячется: она выключена и подписана «нет прав». */
const guard = p => can(p) ? "" : `disabled aria-disabled="true" title="${esc(t("no_rights"))}" data-nr="${esc(t("no_rights_short"))}"`;
const denied = p => { if (can(p)) return false; toast(t("no_rights")); return true; };

/* ---- хранилища ---- */
function loadOps(){ const r = readJSON(OPS_KEY, null); return r && r.v === 1 && Array.isArray(r.agencies) && Array.isArray(r.staff) ? migrateStaff(r) : null; }
function saveOps(){ O.rev = (O.rev || 0) + 1; writeJSON(OPS_KEY, O); }
function loadSite(){ const r = readJSON(SITE_KEY, null); return r && r.v === 1 && Array.isArray(r.orders) ? r : null; }
const loadApps = () => { const a = readJSON(APPS_KEY, []); return Array.isArray(a) ? a : []; };

/* ---- журнал ---- */
function audit(action, vars = {}){
  O.audit.unshift({ id:uid("a"), at:Date.now(), staffId:O.session?.staffId || null, action, vars });
  O.audit = O.audit.slice(0, 400);
}
/* Значения журнала: название на трёх языках — по языку экрана, роль — ключом
   ("role:operator"). Старые записи со строками показываются как есть. */
const auditVal = v => v && typeof v === "object" ? v[S.lang] || v.ru || "" : typeof v === "string" && v.startsWith("role:") ? roleName(v.slice(5)) : v;
const auditText = e => tf("a_" + e.action, Object.fromEntries(Object.entries(e.vars || {}).map(([k, v]) => [k, auditVal(v)])));
const staffName = id => O.staff.find(s => s.id === id)?.name || "—";

/* ---- изменения ----
   Кабинет живого агентства: перечитать S, изменить, сохранить (кабинет в
   другой вкладке получит событие storage). Остальные агентства — внутри O. */
function change(fn){
  O = loadOps() || O;
  fn();
  saveOps(); rerender();
}
function withAgency(id, fn){
  if (id === LIVE_ID) {
    // Свежие данные кабинета: язык и тема в них — кабинета, их не трогаем.
    const fresh = loadState() || S, r = fn(fresh);
    fresh.rev = (fresh.rev || 0) + 1; writeJSON(CAB_KEY, fresh);
    S = fresh; adminPrefs();
    return r;
  }
  const a = O.agencies.find(x => x.id === id); return a ? fn(a) : undefined;
}
/* S — данные кабинета, но язык, тема и валюта на экране — админки.
   Поэтому core save() в админке не вызывается: он записал бы их в кабинет. */
function adminPrefs(){ if (!S || !O) return; S.lang = O.lang; S.theme = O.theme; S.cur = "UZS"; }
function onExternalChange(){
  adminPrefs();
  const f = document.activeElement;
  if (f && f.matches?.("input, textarea, select") && $("#app")?.contains(f)) { renderNav(matchRoute(currentParts()).key); return; }
  rerender();
}
function withSite(fn){ SITE = loadSite(); if (!SITE) return; const r = fn(SITE); SITE.rev = (SITE.rev || 0) + 1; writeJSON(SITE_KEY, SITE); return r; }

/* ---- агентства в одном виде ----
   Живое агентство — это кабинет демо (S). У остальных те же поля: баланс,
   проводки, заказы, пополнения, события, клиенты, бренд. */
const LIVE_ID = "ag-live";
function agencies(){
  const live = { id:LIVE_ID, live:true, ...S.agency, brand:S.brand, st:S };
  return [live, ...O.agencies.map(a => ({ ...a.agency, id:a.id, live:false, brand:a.brand, st:a }))];
}
const agencyById = id => agencies().find(a => a.id === id) || null;
const agencyActiveOf = a => a.status !== "blocked";
/* Причина блокировки: введённая сотрудником — как есть; демо — на языке интерфейса. */
const blockReasonOf = a => a.blockReason || (a.blockReasonKey ? t(a.blockReasonKey) : "");

/* Все заказы: агентств и сайта. src — откуда: id агентства или "site". */
function allOrders(){
  const rows = agencies().flatMap(a => a.st.orders.map(o => ({ o, a, src:a.id })));
  for (const o of SITE?.orders || []) rows.push({ o, a:null, src:"site" });
  return rows.sort((x, y) => y.o.createdAt - x.o.createdAt);
}
const findOrder = (src, id) => allOrders().find(r => r.src === src && r.o.id === id) || null;
const orderClient = r => r.a ? clientOf(r.o) : (r.o.travellers[0] ? `${r.o.travellers[0].given} ${r.o.travellers[0].surname}`.trim() : r.o.contact.phone);
const srcName = r => r.a ? r.a.name : t("src_site");
/* Сколько стоит заказ с учётом сбора: у пассажира сайта сбора нет. */
const orderDue = r => r.a ? dueOf(r.o) : r.o.total;

/* ---- задачи оператора, кассира ---- */
function tasks(){
  const rows = allOrders();
  return {
    price:   rows.filter(r => isCharter(r.o) && r.o.status === "NEW"),
    topups:  agencies().flatMap(a => a.st.topups.filter(p => p.status === "pending").map(p => ({ p, a }))),
    apps:    loadApps().filter(x => x.status === "pending"),
    reqs:    rows.filter(r => r.src === "site" && r.o.req && !r.o.req.status),
    refunds: rows.filter(r => r.o.status === "CANCELLED" && r.o.refund && !r.o.refund.done)
  };
}
/* Сколько задач видит текущая роль. */
function taskCount(){
  const k = tasks();
  return (can("orders.price") ? k.price.length : 0) + (can("topups.confirm") ? k.topups.length : 0) + (can("agencies.moderate") ? k.apps.length : 0)
    + (can("requests.resolve") ? k.reqs.length : 0) + (can("refunds.credit") ? k.refunds.length : 0);
}

/* ---- демо: сотрудники, ещё три агентства, заявки на подключение ---- */
const STAFF = [
  { id:"st1", name:"Dilnoza Rahimova", role:"admin",      phone:"+998 90 000 00 01" },
  { id:"st2", name:"Jasur Aliyev",     role:"operator",   phone:"+998 90 000 00 02" },
  { id:"st3", name:"Kamola Nazarova",  role:"cashier",    phone:"+998 90 000 00 03" },
  { id:"st4", name:"Rustam Ergashev",  role:"accountant", phone:"+998 90 000 00 04" },
  { id:"st5", name:"Ammar Temurov",    role:"admin",      phone:"+998 90 000 00 05" }
];
/* Сотрудники из демо, которых ещё нет в сохранённой админке (добавлены после
   её первого запуска), — дописываются; удалённые вручную остаются удалёнными. */
function migrateStaff(o){
  for (const s of STAFF) if (!o.staff.some(x => x.id === s.id) && !(o.removedStaff || []).includes(s.id)) o.staff.push({ ...s });
  return o;
}
const PAX_NAMES = [["SAIDOV","OTABEK"],["RAHIMOVA","SHAHNOZA"],["KIM","VIKTORIYA"],["QODIROV","SARDOR"],["ORTIQOVA","LOBAR"],["NURMATOV","ILHOM"],["HAMIDOVA","FERUZA"],["ABDULLAEV","TIMUR"],["ZOKIROVA","DILFUZA"],["ISMOILOV","AKMAL"]];

/* Агентство с заказами за последние 40 дней. Цены — те же функции, что на
   сайте и в кабинете; проводки идут по времени, остаток не уходит в минус. */
function seedAgency(spec){
  const rnd = mulberry32(seedFrom(spec.id)), pick = a => a[Math.floor(rnd() * a.length)], day = 864e5, now = Date.now();
  const st = { id:spec.id, agency:{ name:spec.name, legal:spec.legal, inn:spec.inn, phone:spec.phone, email:spec.email, status:spec.status, blockReason:"", blockReasonKey:spec.blockReasonKey || "", since:addDays(TODAY, -spec.age) },
    brand:{ name:spec.name, phone:spec.phone, email:spec.email, address:spec.address, telegram:"", color:spec.color, logo:null },
    balance:0, ledger:[], topups:[], orders:[], notes:[], travellers:[] };
  const events = [];
  for (let i = 0; i < spec.orders; i++) {
    const at = now - Math.floor(rnd() * 38 * day) - Math.floor(rnd() * 20) * 3600e3, kind = pick(["FLIGHT", "FLIGHT", "FLIGHT", "TOUR", "HOTEL", "HOTEL"]);
    const [surname, given] = pick(PAX_NAMES), pax = [{ surname, given, passport:"FA" + String(1000000 + Math.floor(rnd() * 8999999)), gender:"M", dob:"1990-01-01", expiry:"2031-01-01", cit:"UZB" }];
    const start = addDays(ymd(new Date(at)), 5 + Math.floor(rnd() * 30));
    let o;
    if (kind === "FLIGHT") {
      const to = pick(["IST", "DXB", "AYT", "DME", "JED", "SHJ"]), out = baseOffer("TAS", to, start), q = { adults:1 + Math.floor(rnd() * 2), children:0, infants:0, cabin:"economy" };
      o = { type:"FLIGHT", start, end:start, total:flightFare(out, null, q).total, details:flightDetailsOf(out, null, q) };
    } else if (kind === "TOUR") {
      const h = pick(HOTELS.filter(x => RESORTS.includes(x.city))), q = { to:h.city, depart:start, nights:7, adults:2, children:0 }, p = tourPackage(h, q);
      o = { type:"TOUR", start, end:addDays(start, 7), total:p.total, details:{ hotelId:h.id, to:h.city, depart:start, nights:7, adults:2, children:0, rooms:p.rooms, out:p.out, back:p.back } };
    } else {
      const h = pick(HOTELS), n = 3 + Math.floor(rnd() * 5);
      o = { type:"HOTEL", start, end:addDays(start, n), total:hotelStay(h, start, n, 1, 1), details:{ hotelId:h.id, room:"standard", checkin:start, checkout:addDays(start, n), nights:n, adults:2, children:0, rooms:1 } };
    }
    const feeBps = prices().feeBps;
    Object.assign(o, { id:uid("o"), no:makeRef(`${spec.id}:${i}`), status:"CONFIRMED", createdAt:at, paidAt:at, method:"balance", title:"", sub:"", req:null,
      travellers:pax, contact:{ phone:"+998 9" + Math.floor(1 + rnd() * 8) + " " + String(100 + Math.floor(rnd() * 899)) + " " + String(10 + Math.floor(rnd() * 89)) + " " + String(10 + Math.floor(rnd() * 89)), email:"" },
      feeBps, fee:feeOf(o.total, feeBps), history:[{ s:"PAID", at }, { s:"CONFIRMED", at:at + 90e3 }] });
    st.orders.push(o); events.push({ at, o });
  }
  // Пополнения: крупное в начале и по одному, когда деньги кончаются.
  events.sort((a, b) => a.at - b.at);
  const firstAt = (events[0]?.at || now) - 2 * day;
  post("topup", spec.opening, { method:"bank" }, st); st.ledger[0].at = firstAt;
  for (const e of events) {
    const due = dueOf(e.o).uzs;
    // Пополнение — строго между предыдущей проводкой и заказом: выписка идёт по времени.
    if (st.balance < due) { post("topup", Math.ceil((due - st.balance) / 10_000_000 + 1) * 10_000_000, { method:"card" }, st);
      st.ledger[0].at = Math.max(st.ledger[1].at + 1, e.at - 3600e3); }
    post("order", -due, { orderId:e.o.id }, st); st.ledger[0].at = Math.max(st.ledger[1].at + 1, e.at);
  }
  for (const p of spec.topups || []) st.topups.push({ id:uid("t"), at:now - p.ago, amount:p.amount, method:p.method, status:"pending" });
  if (spec.request) {
    const q = { cls:"auto", ...spec.request }, e = q.kind === "jet" ? jetEstimate(q) : heliEstimate(q);
    st.orders.push({ id:uid("o"), no:makeRef(spec.id + ":req"), type:q.kind === "jet" ? "JET" : "HELI", status:"NEW", createdAt:now - q.ago, paidAt:null, method:null, title:"", sub:"",
      start:q.date, end:q.date, total:null, fee:null, req:null, travellers:[{ given:q.name, surname:"" }], contact:{ phone:spec.phone, email:"" },
      details:{ kind:q.kind, from:q.from || "TAS", to:q.to, date:q.date, time:q.time, pax:q.pax, trip:q.trip, cls:e.cls.id, model:e.cls.model, hours:e.hours, km:e.km, low:e.low, high:e.high, quote:e.final, note:q.note || "" },
      history:[{ s:"NEW", at:now - q.ago }] });
  }
  st.orders.sort((a, b) => b.createdAt - a.createdAt);
  return st;
}
function freshOps(prev){
  const now = Date.now();
  return {
    v:1, lang:prev?.lang || S?.lang || "ru", theme:prev?.theme || "system", session:prev?.session || null, staff:STAFF.map(s => ({ ...s })), audit:[],
    agencies:[
      seedAgency({ id:"ag-smk", name:"Samarkand Voyage", legal:"OOO «SAMARKAND VOYAGE»", inn:"307 112 845", phone:"+998 66 233 10 20", email:"sales@samvoyage.uz",
        address:"Samarqand, Registon ko‘chasi, 12", color:"#7A1F3D", status:"verified", age:420, orders:14, opening:260_000_000,
        request:{ kind:"jet", from:"SKD", to:"IST", date:addDays(TODAY, 8), time:"09:30", pax:6, trip:"oneway", name:"FARRUX TOSHEV", ago:40 * 60e3, note:"" } }),
      seedAgency({ id:"ag-bhk", name:"Bukhara Travel Club", legal:"MChJ «BUXORO TRAVEL CLUB»", inn:"309 554 210", phone:"+998 65 221 44 55", email:"info@bukharaclub.uz",
        address:"Buxoro, Bahouddin Naqshband ko‘chasi, 3", color:"#8A4B0F", status:"verified", age:150, orders:8, opening:70_000_000,
        topups:[{ ago:25 * 60e3, amount:15_000_000, method:"cash" }, { ago:3 * 3600e3, amount:40_000_000, method:"bank" }] }),
      seedAgency({ id:"ag-fgn", name:"Fergana Tours", legal:"OOO «FARG‘ONA TOURS»", inn:"305 998 004", phone:"+998 73 244 12 12", email:"fergana.tours@mail.uz",
        address:"Farg‘ona, Mustaqillik ko‘chasi, 44", color:"#2F3A4A", status:"blocked", blockReasonKey:"seed_block_reason", age:90, orders:3, opening:30_000_000 })
    ]
  };
}
/* Две заявки на подключение — пока их нет в общем хранилище. */
function seedApps(){
  if (localStorage.getItem(APPS_KEY)) return;
  const now = Date.now();
  writeJSON(APPS_KEY, [
    { id:uid("ap"), at:now - 2 * 3600e3, company:"Navoiy Holiday", inn:"310 222 781", person:"Shohruh Karimov", phone:"+998 79 220 11 22", email:"hello@navoiyholiday.uz", status:"pending" },
    { id:uid("ap"), at:now - 26 * 3600e3, company:"Khiva Silk Tours", inn:"311 405 667", person:"Gulnora Yo‘ldosheva", phone:"+998 62 375 40 40", email:"khivasilk@gmail.com", status:"pending" }
  ]);
}

/* ---- «оператор на месте» ----
   Пока вошедший сотрудник держит админку открытой, демо не отвечает за
   оператора само: цена чартера, пополнения и возвраты ждут человека. */
/* При уходе со страницы браузер шлёт pagehide, а за ним visibilitychange —
   после pagehide отметку больше не ставим, иначе она пережила бы вкладку. */
let leaving = false;
const TAB_ID = uid("tab");
/* Отметка — у каждой вкладки своя; старые (закрытые без pagehide) отпадают по времени. */
function beat(ts){
  const hb = readJSON(OPS_HB, {}), map = hb && typeof hb === "object" ? hb : {}, now = Date.now();
  for (const k of Object.keys(map)) if (now - Number(map[k]) > OPS_LIVE_MS) delete map[k];
  if (ts) map[TAB_ID] = ts; else delete map[TAB_ID];
  writeJSON(OPS_HB, map);
}
function heartbeat(){ if (leaving || !me()) return; beat(Date.now()); }
function stopHeartbeat(){ beat(0); }
setInterval(heartbeat, HB_EVERY_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") heartbeat(); });
window.addEventListener("pagehide", () => { leaving = true; stopHeartbeat(); });
window.addEventListener("pageshow", e => { if (e.persisted) { leaving = false; heartbeat(); } });

/* Кабинет, сайт, заявки или другая вкладка админки изменили данные. */
window.addEventListener("storage", e => {
  if (e.key === SITE_KEY) { SITE = loadSite(); onExternalChange(); }
  else if (e.key === APPS_KEY) onExternalChange();
  else if (e.key === OPS_KEY && e.newValue) { const next = loadOps(); if (next) { O = next; onExternalChange(); } }
});

/* ---- вход и маршруты ---- */
const ADMIN_ROUTES = { "":null, tasks:"tasks", orders:"orders", "orders/:src/:id":"orders", agencies:"agencies", "agencies/:id":"agencies",
  customers:"customers", "customers/:phone":"customers", finance:"finance", pricing:null, directions:"catalog", integrations:"integrations", staff:"staff", audit:"audit", settings:null, denied:null };
function routeGuard(key){
  if (!me()) return key === "auth" ? null : "auth";
  if (key === "auth") return "";
  if (!(key in ADMIN_ROUTES)) return "";
  const need = ADMIN_ROUTES[key];
  return need && !can(need) ? "denied" : null;
}

/* ---- мелочи ---- */
const ago = ms => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? tf("ago_m", { n:m }) : m < 1440 ? tf("ago_h", { n:Math.round(m / 60) }) : tf("ago_d", { n:Math.round(m / 1440) }); };
const roleName = r => t("role_" + r);
