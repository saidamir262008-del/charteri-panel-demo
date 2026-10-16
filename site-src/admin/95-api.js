/* ==========================================================================
   Админка с сервером (CONFIG.api.base задан; пусто — файл ничего не делает).

   Страницы админки остаются прежними: данные сервера раскладываются в те же
   O, S и SITE (только в памяти), а изменения уходят на сервер:
     - деньги и статусы (цена, подтверждение, отмена и возврат, пополнения,
       корректировка, кредит, блокировка, заявки агентств, согласования) —
       сразу вызовом API, без «оптимистичных» сумм;
     - всё, что демо меняет через change() (CRM, клиенты, правила
       согласований, сотрудники, реквизиты и бренд агентств, контакты и
       пассажиры заказа, заказ в офисе) — сравнением до и после;
     - цены, системные настройки, роли, новые сотрудники и смена роли,
       удаление направления — через исполнителей согласований: сервер сам
       решает, выполнить сразу или создать запрос (PENDING_APPROVAL);
     - содержимое сайта — сравнением документа CMS до и после.
   Права (can) — из /me; сервер проверяет каждый вызов сам. Журнал действий
   ведёт сервер (чтения журнала в API нет — раздел показывает пояснение).
   В localStorage — только язык и тема (charteri.admin.prefs) и refresh token.
   ========================================================================== */
"use strict";

if (API.on) {
  document.body.classList.add("api");
  apiUseServerData();
  const PREFS = "charteri.admin.prefs", POLL_MS = 20000, FULL_MS = 60000;
  const RA = { actor:null, perms:new Set(), pricing:null, settings:null, rulesRaw:[], apps:[], cmsRaw:null, dirsRaw:[], dash:{}, ledgers:{}, clients:[],
    full:{}, muteUntil:0, unread:-1, lastFull:0, loading:null, bg:0, lastInput:Date.now(), adjSeq:API.uuid() };
  /* Простой админки (settings_private.sec.idle) считает сервер. Чтение — активность,
     если сотрудник что-то делал (клик, клавиша, переход) за последнюю минуту;
     опрос по таймеру — всегда фоновый (x-activity: passive). */
  const ACTIVE_MS = 60000;
  const rd = () => ({ passive:RA.bg > 0 || Date.now() - RA.lastInput > ACTIVE_MS });
  const touchInput = () => { RA.lastInput = Date.now(); };
  ["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, touchInput, { capture:true, passive:true }));
  window.addEventListener("hashchange", touchInput, true);
  const inBg = async fn => { RA.bg++; try { return await fn(); } finally { RA.bg--; } };
  const prefs = () => { const p = readJSON(PREFS, {}); return p && typeof p === "object" ? p : {}; };
  const has = p => RA.perms.has(p) || RA.actor?.staff?.role === "founder";
  const lower = s => String(s || "").toLowerCase();

  /* ---------------- состояние: снимок сервера в памяти ---------------- */
  const blankS = () => ({ v:1, lang:prefs().lang || "ru", cur:"UZS", theme:prefs().theme || "system", session:null,
    agency:{ name:"", legal:"", inn:"", phone:"", email:"", status:"verified", blockReason:"", since:TODAY, credit:0 }, brand:apiBrand(null, ""),
    balance:0, ledger:[], topups:[], orders:[], notes:[], travellers:[] });
  const blankO = () => ({ v:1, rev:1, lang:prefs().lang || "ru", theme:prefs().theme || "system", session:null, staff:[], audit:[], approvals:[],
    rules:cleanRules(null), roles:[], agencies:[], crm:{ seq:0, leads:[], clients:{}, notes:[], tasks:[], seen:[] }, permsV:PERMS_V });
  loadState = () => S || blankS();
  freshState = () => blankS();
  loadOps = () => O || blankO();
  freshOps = () => blankO();
  saveOps = () => { if (O) writeJSON(PREFS, { lang:O.lang, theme:O.theme }); };
  loadSite = () => SITE || { v:1, orders:[], user:null };
  seedSite = () => loadSite();
  seedApps = () => {};
  loadApps = () => RA.apps;
  beat = () => {};
  idleCheck = () => false;
  idleTouch = () => {};
  crmSync = () => {};
  syncCrm = () => 0;
  syncBlocked = () => {};
  opsLive = () => true;
  audit = () => {};
  agencies = () => O.agencies.map(a => ({ ...a.agency, id:a.id, live:false, brand:a.brand, st:a }));
  withAgency = (id, fn) => { const a = O.agencies.find(x => x.id === id); return a ? fn(a) : undefined; };
  withSite = fn => fn(SITE);
  mutOrder = (r, fn) => {
    const st = r.src === "site" ? null : O.agencies.find(a => a.id === r.src), list = st ? st.orders : SITE.orders;
    const o = list.find(x => x.id === r.o.id); return o ? fn(o, st) : undefined;
  };
  const CAN = can;
  can = p => ["tasks", "approvals", "clients"].includes(p) ? CAN(p) : !!me() && has(p);
  /* Сообщение «выполнено» вызывающего кода сразу после отправки — глушим:
     итог (выполнено, ушло на подтверждение, ошибка) покажет ответ сервера. */
  const TOAST = toast;
  toast = msg => { if (Date.now() < RA.muteUntil) { RA.muteUntil = 0; return; } TOAST(msg); };
  const muteNext = () => { RA.muteUntil = Date.now() + 400; };

  /* ---------------- загрузка ---------------- */
  const uidToStaff = uid => O.staff.find(s => s.uid && s.uid === uid)?.id || null;
  const staffToUid = id => O.staff.find(s => s.id === id)?.uid || null;
  const permsMap = list => { const m = {}; for (const p of list || []) { const [k, a] = p.split("."); (m[k] ||= []).push(a); } return cleanPerms(m); };
  const permsFlat = m => Object.entries(m).flatMap(([k, a]) => a.map(x => `${k}.${x}`));
  const RULE_OF = { refund:"refund", adjust:"adjust", pricing:"pricing", access:"access", delete:"delete", system:"system" };
  const AP_ST = { PENDING:"pending", EXECUTED:"executed", REJECTED:"rejected", FAILED:"failed", WITHDRAWN:"withdrawn" };
  AP_KINDS.office = { rule:"office", perm:"orders.approve", module:"orders", icon:"bag" };
  AP_KINDS.agency_invite = { rule:"access", perm:"roles.approve", module:"b2b", icon:"key" };
  AP_KINDS.agency_req = { rule:"access", perm:"finance.approve", module:"b2b", icon:"wallet" };

  function mapStaff(s){
    return { id:s.id, uid:s.userId || null, name:s.name, phone:s.phone ? prettyPhone(s.phone) : "", email:s.email || "", pos:s.pos || "", dept:s.dept || "",
      role:s.roleId, active:s.active !== false, linked:!!s.linked, version:s.version };
  }
  async function loadStaff(){
    const a = RA.actor.staff;
    const self = { id:a.staffId, uid:RA.actor.uid, name:a.name, phone:RA.actor.phone ? prettyPhone(RA.actor.phone) : "", email:RA.actor.email || "", pos:"", dept:"", role:a.role, active:true };
    O.staff = has("staff.view") ? (await API.call("GET", "/admin/staff", undefined, rd())).items.map(mapStaff) : [self];
    if (!O.staff.some(s => s.id === self.id)) O.staff.push(self);
    O.session = { staffId:a.staffId, at:Date.now() };
    if (has("roles.view") || has("staff.view")) {
      const d = await API.call("GET", "/admin/roles", undefined, rd());
      O.roles = d.roles.map(r => ({ id:r.id, sys:!!r.isSystem, name:r.name || "", perms:r.id === "founder" ? ALL_PERMS() : permsMap(r.perms), deleted:!!r.deleted, version:r.version, at:apiTs(r.createdAt) }));
    } else O.roles = [{ id:a.role, sys:SYS_ORDER.includes(a.role), name:"", perms:a.role === "founder" ? ALL_PERMS() : permsMap(a.perms) }];
    if (!O.roles.some(r => r.id === a.role)) O.roles.push({ id:a.role, sys:false, name:a.role, perms:permsMap(a.perms) });
  }
  async function loadRules(){
    RA.rulesRaw = (await API.call("GET", "/admin/approval-rules", undefined, rd())).items;
    const r = {}; for (const x of RA.rulesRaw) if (RULE_OF[x.rule]) r[x.rule] = { on:!!x.enabled, ...(x.minAmount != null ? { min:Number(x.minAmount) } : {}) };
    O.rules = cleanRules(r);
  }
  const apKey = a => { const p = a.payload || {}, tid = a.target?.id;
    return a.kind === "refund" ? `refund:${a.companyId || "site"}:${tid}` : a.kind === "credit" ? `credit:${a.companyId || tid}` : a.kind === "pricing" ? "pricing"
      : a.kind === "sys" ? `sys:${p.part === "channels" ? "ch" : p.part || tid}` : ["staff_role", "role_edit", "role_del", "dir_del"].includes(a.kind) ? `${a.kind}:${tid}` : `${a.kind}:${a.id}`; };
  function apVars(a){
    const p = a.payload || {}, ag = O.agencies.find(x => x.id === (a.companyId || p.companyId))?.agency.name || "—", o = a.target?.type === "order" ? findAnyOrder(a.target.id) : null;
    const role = id => ({ role:id || "—" });
    return { no:o?.no || p.orderNo || "—", amount:uzsRef(Number(a.amount ?? p.amountUzs ?? p.limitUzs ?? 0), a.kind === "adjust"), src:o ? (o.companyId ? ag : strRef("src_site")) : ag,
      agency:ag, reason:p.reason || "", role:a.kind === "role_new" ? p.name || "—" : a.kind === "staff_add" ? role(p.roleId) : O.roles.find(r => r.id === a.target?.id && !r.sys)?.name || role(p.roleId || a.target?.id),
      name:p.name || O.staff.find(s => s.id === (p.staffId || a.target?.id))?.name || p.rec?.name || "—", from:role(p.from), to:role(p.to || p.roleId),
      city:{ ru:p.code || a.target?.id || "", uz:p.code || a.target?.id || "", en:p.code || a.target?.id || "" }, iata:p.code || a.target?.id || "", what:strRef("sys_h_" + (p.part === "channels" ? "ch" : p.part || "cur")),
      email:p.email || "—", arole:p.role || "—" };
  }
  /* diff сервера {поле:{from,to}} → строки демо. */
  const DIFF_KEY = { name:"staff_name", phone:"phone_label", email:"agency_email", pos:"staff_pos", dept:"staff_dept", roleId:"staff_role", balance:"col_balance",
    limitUzs:"credit_limit", creditLimit:"credit_limit", feeBps:"pr_fee", flightMarkupBps:"pr_markup", status:"col_status", amount:"col_amount" };
  const diffVal = v => v == null ? "" : typeof v === "number" ? grp(v) : typeof v === "object" ? JSON.stringify(v) : String(v);
  const apDiffRows = d => !d || typeof d !== "object" ? [] : Object.entries(d).filter(([, v]) => v && typeof v === "object" && ("from" in v || "to" in v))
    .map(([k, v]) => ({ k:DIFF_KEY[k] || (t("col_" + k) !== "col_" + k ? "col_" + k : k), from:diffVal(v.from), to:diffVal(v.to) }));
  /* Данные запроса сервера → поля, которые читают страницы демо (сотрудники, роли, агентства). */
  function apPayload(a){
    const p = { ...(a.payload || {}) }, tid = a.target?.id;
    if (a.kind === "staff_add") p.rec = { name:p.name || "", phone:p.phone ? prettyPhone(p.phone) : "", email:p.email || "", pos:p.pos || "", dept:p.dept || DEPT_FALLBACK, role:p.roleId };
    if (a.kind === "staff_role") Object.assign(p, { staffId:tid, from:p.from ?? staffById(tid)?.role, to:p.roleId ?? p.to });
    if (a.kind === "role_edit" || a.kind === "role_del") p.roleId = tid;
    if (a.kind === "role_new") p.role = { name:p.name || "", perms:permsMap(p.perms || []) };
    if (["adjust", "credit"].includes(a.kind)) Object.assign(p, { aid:a.companyId || tid, amount:Number(p.amountUzs ?? p.amount ?? a.amount ?? 0), to:Number(p.limitUzs ?? 0) });
    if (a.kind === "sys") p.part = p.part === "channels" ? "ch" : p.part;
    if (a.kind === "dir_del") p.iata = tid;
    return p;
  }
  async function loadApprovals(){
    const d = await API.call("GET", "/admin/approvals?limit=100", undefined, rd());
    O.approvals = d.items.map(a => ({ id:a.id, kind:AP_KINDS[a.kind] ? a.kind : "office", key:apKey(a), payload:apPayload(a), vars:apVars(a), diff:apDiffRows(a.diff),
      amount:a.amount, status:AP_ST[a.status] || lower(a.status), by:uidToStaff(a.requestedBy) || a.requestedBy, at:apiTs(a.createdAt),
      decidedBy:uidToStaff(a.decidedBy) || a.decidedBy, decidedAt:apiTs(a.decidedAt), reason:a.reason || "", error:a.error ? (t("api_e_" + a.error) !== "api_e_" + a.error ? "api_e_" + a.error : "api_e_GENERIC") : "",
      canDecide:!!a.canDecide, canWithdraw:!!a.canWithdraw, version:a.version, srv:a }));
  }
  function findAnyOrder(id){ for (const a of O.agencies) { const o = a.orders.find(x => x.id === id); if (o) return o; } return SITE.orders.find(x => x.id === id) || null; }
  /* PENDING (агентство сайта ещё не одобрено) — отдельное состояние, не «заблокировано». */
  const AG_ST = { ACTIVE:"verified", BLOCKED:"blocked" };
  const mapAgency = (x, prev) => ({ id:x.companyId, version:x.version, available:x.available,
    agency:{ name:x.name, legal:x.legalName || prev?.agency.legal || x.name, inn:x.inn || "", phone:x.phone ? prettyPhone(x.phone) : "", email:x.email || "",
      address:x.address ?? prev?.agency.address ?? null,
      status:AG_ST[x.status] || "pending", blockReason:x.blockReason || "", since:tzYmd(apiTs(x.createdAt)) || TODAY, credit:Number(x.creditLimit) || 0, srvStatus:x.status },
    brand:apiBrand(x.brand, x.name), balance:Number(x.balance) || 0, ledger:RA.ledgers[x.companyId] || prev?.ledger || [], topups:[], orders:[], notes:[], travellers:[] });
  /* Все страницы списка (не больше PAGE_CAP запросов): заказы — по next (before),
     агентства — по offset. */
  const PAGE_CAP = 50;
  async function allPages(path, more, step, nextOf){
    const items = []; let cur = null;
    for (let i = 0; i < PAGE_CAP; i++) {
      const d = await API.call("GET", path + (cur == null ? "" : more(cur)), undefined, rd());
      items.push(...d.items);
      cur = d.items.length < step ? null : nextOf(d, items); if (cur == null) break;
    }
    return { items };
  }
  async function loadMoney(){
    const canAg = has("b2b.view") || has("finance.view"), canOrd = has("orders.view"), canTu = has("finance.view");
    const [ags, ord, tu] = await Promise.all([
      canAg ? allPages("/admin/agencies?limit=200", n => `&offset=${n}`, 200, (d, all) => all.length) : { items:[] },
      canOrd ? allPages("/admin/orders?limit=100&details=1", c => `&before=${encodeURIComponent(c)}`, 100, d => d.next || null) : { items:[] },
      // Пополнения: последние 200 и все ждущие (их решают на этой странице).
      canTu ? Promise.all([API.call("GET", "/admin/topups?limit=200", undefined, rd()), API.call("GET", "/admin/topups?status=PENDING&limit=200", undefined, rd())])
        .then(([a, b]) => ({ items:[...new Map([...a.items, ...b.items].map(x => [x.id, x])).values()] })) : { items:[] }]);
    const prevA = new Map(O.agencies.map(a => [a.id, a])), prevO = new Map([...O.agencies.flatMap(a => a.orders), ...SITE.orders].map(o => [o.id, o]));
    O.agencies = ags.items.map(x => mapAgency(x, prevA.get(x.companyId)));
    const byId = new Map(O.agencies.map(a => [a.id, a]));
    SITE = { v:1, user:null, orders:[] };
    for (const x of ord.items) {
      const o = apiOrder(x, prevO.get(x.id)); if (x.channel === "OFFICE") o.channel = "office";
      const a = x.companyId && byId.get(x.companyId);
      if (a) a.orders.push(o); else if (x.channel !== "B2B") SITE.orders.push(o);
    }
    for (const p of tu.items) { const a = byId.get(p.companyId); if (a) a.topups.push(apiTopup(p)); }
    RA.lastMoney = Date.now();
  }
  async function loadLedger(id){
    const d = await API.call("GET", `/admin/agencies/${id}/ledger?limit=200`, undefined, rd());
    const a = O.agencies.find(x => x.id === id); RA.ledgers[id] = d.items.map(l => apiLedger(l, a?.topups || []));
    if (a) a.ledger = RA.ledgers[id];
  }
  async function loadApplications(){ if (!has("b2b.view")) { RA.apps = []; return; }
    const d = await API.call("GET", "/admin/applications?limit=100", undefined, rd());
    const ST = { PENDING:"pending", APPROVED:"approved", REJECTED:"rejected" };
    RA.apps = d.items.map(x => ({ id:x.id, at:apiTs(x.createdAt), company:x.company, inn:x.inn, person:x.person, phone:x.phone ? prettyPhone(x.phone) : "", email:x.email,
      status:ST[x.status] || lower(x.status), reason:x.reason || "", decidedAt:apiTs(x.decidedAt), by:x.decidedByName || "", version:x.version }));
  }
  async function loadPricing(){
    if (!has("pricing.view")) return;
    const d = RA.pricing = await API.call("GET", "/admin/pricing", undefined, rd());
    const agents = Object.fromEntries((d.agencies || []).filter(x => x.adjBps).map(x => [x.companyId || x.id, x.adjBps]));
    const promos = (d.promos || []).map(x => ({ ...x, code:x.code || "", minUsd:x.minUsd || 0, limit:x.limit || 0, starts:x.starts || "", ends:x.ends || "", deleted:x.deletedAt ? apiTs(x.deletedAt) : x.deleted ? 1 : 0 }));
    APIX.prices = pricesClean({ ...d.doc, agents, promos }); PRICES = null;
  }
  async function loadSettings(){
    const pub = await API.call("GET", "/public/config", undefined, { auth:false });
    apiApplyPublicConfig(pub);
    if (!has("settings.view")) return;
    const d = RA.settings = await API.call("GET", "/admin/settings", undefined, rd());
    APIX.sys = apiSys({ ...d.parts, maint:{ ...d.parts.maint, since:d.maintenance?.since, by:d.maintenance?.by } }, d.parts.cur?.rate); SYS_CACHE = null; TZF = null;
  }
  async function loadDirs(){
    const d = has("services.view") ? await API.call("GET", "/admin/destinations", undefined, rd()) : await API.call("GET", "/public/destinations", undefined, { auth:false });
    RA.dirsRaw = d.items; apiApplyDirections(d.items);
  }
  async function loadCms(){
    if (!has("content.view") || !API.remote("cms")) return;
    RA.cmsRaw = await API.call("GET", "/admin/cms", undefined, rd());
    APIX.cms = apiCmsDoc(RA.cmsRaw); CMS_CACHE = null;
  }
  const mapLead = l => ({ id:l.id, no:l.no, kind:l.kind || "b2c", name:l.name || "", contact:l.contact || "", phone:l.phone ? prettyPhone(l.phone) : "", email:l.email || "", country:l.country || "",
    source:l.source || "other", service:l.service || null, dest:l.dest && typeof l.dest === "object" ? (l.dest.code ? l.dest : l.dest.text || "") : l.dest || "", budget:l.budget ?? null,
    status:l.status, manager:uidToStaff(l.managerId), lostReason:l.lostCode ? strRef("lost_" + l.lostCode) : l.lostReason || "", links:RA.full[l.id]?.links || [], origin:l.origin || null,
    createdAt:apiTs(l.createdAt), updatedAt:apiTs(l.updatedAt), by:uidToStaff(l.createdBy), events:RA.full[l.id]?.events || [], version:l.version, orders:l.orders || 0 });
  const mapTask = x => ({ id:x.id, target:x.target, text:x.text, due:apiTs(x.dueAt), assignee:uidToStaff(x.assigneeId), by:uidToStaff(x.createdBy), at:apiTs(x.createdAt), done:!!x.done,
    doneAt:apiTs(x.doneAt), version:x.version });
  const mapNote = n => ({ id:n.id, target:n.target, kind:n.kind, text:n.text, by:uidToStaff(n.authorId), at:apiTs(n.createdAt) });
  async function loadCrm(){
    const cv = has("crm.view"), clients = has("b2c.view") || has("crm.view") || has("b2b.view");
    const [leads, tasks, cl] = await Promise.all([cv ? API.call("GET", "/admin/crm/leads?status=all&limit=500", undefined, rd()) : { items:[] },
      cv ? API.call("GET", "/admin/crm/tasks?scope=all&status=all", undefined, rd()) : { items:[] },
      clients ? API.call("GET", "/admin/crm/clients?type=all&limit=500", undefined, rd()) : { items:[] }]);
    const notes = O.crm.notes;
    O.crm = { seq:0, leads:leads.items.map(mapLead), tasks:tasks.items.map(mapTask), notes, clients:{}, seen:[] };
    RA.clients = cl.items;
    for (const c of cl.items) if (c.managerId || c.name) O.crm.clients[c.key] = { manager:uidToStaff(c.managerId), name:c.name || "", email:c.email || "", country:c.country || "",
      source:c.source, blocked:!!c.blocked, phone:c.phone ? prettyPhone(c.phone) : "", events:[] };
  }
  /* Карточка лида или клиента: история, заказы, комментарии. */
  async function loadTarget(target){
    const [k, id] = [target.slice(0, 1), target.slice(2)];
    const d = await API.call("GET", k === "l" ? `/admin/crm/leads/${id}` : `/admin/crm/clients/${encodeURIComponent(k === "a" ? id : id)}`, undefined, rd());
    const notes = (d.notes || []).map(mapNote);
    O.crm.notes = [...O.crm.notes.filter(n => n.target !== target && !notes.some(m => m.id === n.id)), ...notes];
    if (k === "l" && d.lead) {
      RA.full[id] = { events:(d.events || []).map(e => ({ at:apiTs(e.at), by:uidToStaff(e.actorId), type:e.type, ...(e.data || {}), ...(e.data?.fields ? { fields:e.data.fields.map(f => "crm_" + f) } : {}) })),
        links:(d.orders || []).map(o => ({ src:o.companyId || "site", id:o.id })) };
      const i = O.crm.leads.findIndex(l => l.id === id), l = mapLead(d.lead); if (i >= 0) O.crm.leads[i] = l; else O.crm.leads.push(l);
    }
    for (const x of d.tasks || []) { const tk = mapTask(x), i = O.crm.tasks.findIndex(y => y.id === tk.id); if (i >= 0) O.crm.tasks[i] = tk; else O.crm.tasks.push(tk); }
  }
  const LOADERS = { staff:loadStaff, rules:loadRules, money:loadMoney, apps:loadApplications, approvals:loadApprovals, pricing:loadPricing, settings:loadSettings, dirs:loadDirs, cms:loadCms, crm:loadCrm };
  /* Порядок важен: сотрудники (имена по uid) и деньги (агентства) — до согласований. */
  async function loadAll(){
    await loadStaff();
    await Promise.all([loadSettings(), loadDirs(), loadRules(), loadMoney(), loadApplications(), loadPricing(), loadCms()].map(p => p.catch(e => console.warn("load", e.code || e))));
    await Promise.all([loadApprovals(), loadCrm()].map(p => p.catch(e => console.warn("load", e.code || e))));
    RA.lastFull = Date.now();
  }
  async function reload(...names){
    try {
      if (!names.length) await loadAll();
      else { for (const n of names.filter(n => n === "staff" || n === "money")) await LOADERS[n](); await Promise.all(names.filter(n => n !== "staff" && n !== "money").map(n => LOADERS[n]())); }
    } catch(e) { TOAST(API.errText(e)); }
    if (me()) onExternalChange();
  }

  /* ---------------- запросы с итогом ---------------- */
  /* Выполнить на сервере; итог — сообщением, данные — заново с сервера. */
  async function run(label, fn, domains){
    overlayOn();
    try {
      const d = await fn();
      const all = [].concat(d), pend = all.some(x => x?.status === "PENDING_APPROVAL"), own = all.find(x => x?._toast);
      if (pend) TOAST(t("api_ap_sent")); else if (own) TOAST(own._toast); else if (all.some(x => x?.status === "AMENDMENT_REQUESTED")) TOAST(t("api_amend_sent"));
      else if (label !== false) TOAST(label || t("api_saved"));
      return d;
    } catch(e) { TOAST(API.errText(e)); return null; }
    finally { overlayOff(); await reload(...(domains || [])); }
  }
  let ov = 0;
  const overlayOn = () => { if (!ov++) $("#app")?.setAttribute("aria-busy", "true"); };
  const overlayOff = () => { if (!--ov) $("#app")?.removeAttribute("aria-busy"); };
  const idemKeys = {};
  const idem = k => idemKeys[k] ||= API.uuid();
  const idemDone = k => { delete idemKeys[k]; };

  /* ---------------- согласования ---------------- */
  needsApproval = (kind, amount = 0) => { if (isFounder()) return false; const r = O.rules[AP_KINDS[kind]?.rule]; return !!r?.on && (r.min == null || Math.abs(amount) >= r.min); };
  apBlock = a => a.canDecide ? null : a.by === me()?.id ? "ap_err_self" : "no_rights";
  requesterBlock = () => null;
  decideApproval = (id, ok, reason = "") => {
    const a = O.approvals.find(x => x.id === id); if (!a || a.status !== "pending") { rerender(); return false; }
    if (!ok && !reason) { TOAST(t("err_reason")); return false; }
    run(false, async () => {
      const d = await API.call("POST", `/admin/approvals/${id}/decide`, { decision:ok ? "APPROVE" : "REJECT", ...(reason ? { reason } : {}) });
      TOAST(d.status === "FAILED" ? `${t("t_ap_failed")}${d.error ? " · " + API.errText(new ApiError(d.error?.code || d.error)) : ""}` : t("t_ap_" + lower(d.status))); return d;
    });
    return true;
  };
  withdrawApproval = id => { run(t("t_ap_withdrawn"), () => API.call("POST", `/admin/approvals/${id}/withdraw`, {})); };
  /* Исполнители — на сервер; вызывающий код получает «нет ошибки». */
  const sysPart = p => p === "ch" ? "channels" : p;
  function sysValue(part, to){
    const cur = RA.settings?.parts?.[sysPart(part)] || {};
    if (part === "maint") return { on:!!to.on, msg:{ ru:to.msg?.ru || "", uz:to.msg?.uz || "", en:to.msg?.en || "" } };
    if (part === "ch") return { email:{ on:!!to.email.on, name:to.email.name, from:to.email.from || "", reply:to.email.reply || "" }, sms:{ on:!!to.sms.on, sender:to.sms.sender || "" },
      telegram:{ on:!!to.telegram.on, bot:to.telegram.bot || "", chat:to.telegram.chat || "" } };
    if (part === "notify") return { ...cur, ...to };
    return to;
  }
  /* perUserLimit и position демо не хранит (pricesClean): берём из копии сервера. */
  const promoBody = x => { const s = (RA.pricing?.promos || []).find(y => y.id === x.id) || {}, pos = x.position ?? s.position;
    return { promo:{ ...(x.auto ? {} : { code:x.code }), name:x.name, kind:x.kind, value:x.value, auto:!!x.auto, active:!!x.active, svc:x.svc || [],
      minUsd:x.minUsd || 0, limit:x.limit || 0, perUserLimit:x.perUserLimit ?? s.perUserLimit ?? 0, ...(Number.isInteger(pos) ? { position:pos } : {}),
      starts:x.starts || null, ends:x.ends || null } }; };
  async function sendPricing(from, to){
    const d = RA.pricing, out = [], docOf = c => ({ feeBps:c.feeBps, flightMarkupBps:c.flightMarkupBps, svc:c.svc, dest:c.dest });
    if (JSON.stringify(docOf(from)) !== JSON.stringify(docOf(to))) out.push(await API.call("PUT", "/admin/pricing", { doc:docOf(to), expectedVersion:d.version }));
    for (const id of new Set([...Object.keys(from.agents), ...Object.keys(to.agents)]))
      if ((from.agents[id] || 0) !== (to.agents[id] || 0)) out.push(await API.call("PUT", `/admin/pricing/agencies/${id}`, { adjBps:to.agents[id] || 0 }));
    const was = new Map(from.promos.map(x => [x.id, x])), srv = new Map((d.promos || []).map(x => [x.id, x]));
    for (const x of to.promos) {
      const y = was.get(x.id), s = srv.get(x.id);
      if (!s) { if (!x.deleted) out.push(await API.call("POST", "/admin/promos", promoBody(x))); continue; }
      const strip = z => JSON.stringify(promoBody(z));
      if (strip(x) !== strip(y || s)) out.push(await API.call("PATCH", `/admin/promos/${x.id}`, { ...promoBody(x), expectedVersion:s.version }));
      if (!!x.deleted !== !!(y || {}).deleted) out.push(await API.call("POST", `/admin/promos/${x.id}/${x.deleted ? "delete" : "restore"}`, { expectedVersion:s.version }));
    }
    return out;
  }
  const REMOTE = {
    refund:p => refundCall(findOrder(p.src, p.id)),
    adjust:p => { const k = "adj:" + p.aid + ":" + p.amount + ":" + p.reason + ":" + RA.adjSeq, next = () => { idemDone(k); RA.adjSeq = API.uuid(); };
      return API.call("POST", `/admin/agencies/${p.aid}/adjust`, { amountUzs:p.amount, reason:p.reason }, { idem:idem(k) })
        .then(d => { next(); return d; }, e => { if (e.code !== "NETWORK") next(); throw e; }); },
    credit:p => API.call("POST", `/admin/agencies/${p.aid}/credit`, { limitUzs:p.to, expectedVersion:O.agencies.find(a => a.id === p.aid)?.version }),
    pricing:p => sendPricing(p.from, p.to),
    role_new:p => API.call("POST", "/admin/roles", { name:p.role.name, perms:permsFlat(cleanPerms(p.role.perms)) }),
    role_edit:p => API.call("PUT", `/admin/roles/${p.roleId}/permissions`, { perms:permsFlat(cleanPerms(p.to)), expectedVersion:roleById(p.roleId)?.version }),
    role_del:p => API.call("DELETE", `/admin/roles/${p.roleId}`),
    staff_add:p => API.call("POST", "/admin/staff", { name:p.rec.name, ...(p.rec.phone ? { phone:apiPhone(p.rec.phone) } : {}), ...(p.rec.email ? { email:p.rec.email } : {}),
      ...(loc(p.rec.pos) ? { pos:loc(p.rec.pos) } : {}), dept:p.rec.dept || DEPT_FALLBACK, roleId:p.rec.role }),
    staff_role:p => API.call("POST", `/admin/staff/${p.staffId}/role`, { roleId:p.to, expectedVersion:staffById(p.staffId)?.version }),
    dir_del:p => API.call("DELETE", `/admin/destinations/${p.iata}`),
    sys:p => API.call("PUT", `/admin/settings/${sysPart(p.part)}`, { value:sysValue(p.part, p.to) }),
    restore:() => Promise.reject(new ApiError("NOT_SUPPORTED"))
  };
  const REMOTE_DOMAINS = { refund:["money", "approvals"], adjust:["money", "approvals"], credit:["money", "approvals"], pricing:["pricing", "approvals"], role_new:["staff", "approvals"],
    role_edit:["staff", "approvals"], role_del:["staff", "approvals"], staff_add:["staff", "approvals"], staff_role:["staff", "approvals"], dir_del:["dirs", "approvals"], sys:["settings", "approvals"], restore:[] };
  const remote = (kind, payload) => run(null, () => REMOTE[kind](payload), REMOTE_DOMAINS[kind]);
  requestApproval = (kind, { payload }) => { remote(kind, payload); return true; };
  const exec = kind => (payload) => { muteNext(); remote(kind, payload); return null; };
  execRefund = exec("refund"); execAdjust = exec("adjust"); execCredit = exec("credit"); execPricing = exec("pricing");
  execRoleNew = exec("role_new"); execRoleEdit = exec("role_edit"); execRoleDel = exec("role_del"); execStaffAdd = exec("staff_add"); execStaffRole = exec("staff_role");
  execDirDel = exec("dir_del"); execSys = exec("sys");
  requestRestore = () => TOAST(t("api_restore_off"));
  execRestore = () => "api_restore_off";

  /* ---------------- заказы, пополнения, агентства: прямо в API ---------------- */
  const orderMinor = (o, share) => Math.round(((Number(o.srv?.money?.amountMinor) || 0) - (Number(o.srv?.money?.discountMinor) || 0)) * share);
  function refundCall(r){
    if (!r) return Promise.reject(new ApiError("NOT_FOUND"));
    const o = r.o, p = penaltyOf(o), body = { penaltyMinor:orderMinor(o, p.rate), reason:t("api_cancel_reason"), expectedVersion:o.version };
    if (!r.a) {
      const ref = prompt(t("api_receipt_q")); if (!ref || !ref.trim()) return Promise.reject(new ApiError("VALIDATION"));
      Object.assign(body, { method:o.channel === "office" ? "CASH" : "CARD_MANUAL", receiptRef:ref.trim().slice(0, 120) });
    }
    return API.call("POST", `/admin/orders/${o.id}/refund`, body, { idem:idem("refund:" + o.id + ":" + o.version) });
  }
  priceOrder = (r, usd) => {
    if (denied("orders.edit")) return false;
    if (!(usd > 0 && usd < 5_000_000)) { TOAST(t("err_price")); return false; }
    run(tf("t_priced", { no:r.o.no }), () => API.call("POST", `/admin/orders/${r.o.id}/price`, { amountMinor:Math.round(usd * 100), currency:"USD", expectedVersion:r.o.version }), ["money"]);
    return true;
  };
  confirmOrder = r => {
    if (denied("orders.edit")) return;
    const ref = prompt(t("api_supplier_q"), r.o.srv?.supplierRef || r.o.no); if (!ref || !ref.trim()) return;
    run(t("api_saved"), () => API.call("POST", `/admin/orders/${r.o.id}/confirm`, { supplierRef:ref.trim().slice(0, 120), expectedVersion:r.o.version }), ["money"]);
  };
  cancelOrder = r => {
    if (denied("orders.cancel")) return;
    M.ui.cancelFor = null;
    const paid = ["PAID", "CONFIRMED"].includes(r.o.status);
    if (paid && denied("finance.refund")) return;
    run(t("api_saved"), () => paid ? refundCall(r) : API.call("POST", `/admin/orders/${r.o.id}/cancel`, { reason:t("api_cancel_reason"), expectedVersion:r.o.version }), ["money", "approvals"]);
  };
  creditRefund = r => { if (denied("finance.refund")) return; run(t("api_saved"), () => refundCall(r), ["money", "approvals"]); };
  resolveReq = () => { TOAST(t("api_e_NOT_SUPPORTED")); return false; };
  confirmTopup = (aid, pid) => {
    if (denied("finance.approve")) return;
    const p = O.agencies.find(a => a.id === aid)?.topups.find(x => x.id === pid);
    run(p ? tf("t_topup_ok", { amount:fmtUZS(p.amount) }) : null, () => API.call("POST", `/admin/topups/${pid}/confirm`, {}), ["money"]);
  };
  rejectTopup = (aid, pid, reason) => {
    if (denied("finance.approve")) return false;
    if (!reason) { TOAST(t("err_reason")); return false; }
    run(t("api_saved"), () => API.call("POST", `/admin/topups/${pid}/reject`, { reason }), ["money"]);
    return true;
  };
  decideApp = (id, ok, reason = "") => {
    if (denied("b2b.approve")) return false;
    if (!ok && !reason) { TOAST(t("err_reason")); return false; }
    const a = RA.apps.find(x => x.id === id); if (!a || a.status !== "pending") return false;
    run(tf(ok ? "t_app_ok" : "t_app_rejected", { company:a.company }), () => API.call("POST", `/admin/applications/${id}/decide`, { decision:ok ? "APPROVE" : "REJECT", ...(reason ? { reason } : {}), expectedVersion:a.version }),
      ["apps", "money", "crm"]);
    return true;
  };
  setBlocked = (aid, blocked, reason = "") => {
    if (denied("b2b.manage")) return false;
    if (blocked && !reason) { TOAST(t("err_reason")); return false; }
    const v = O.agencies.find(a => a.id === aid)?.version;
    run(t("api_saved"), () => API.call("POST", `/admin/agencies/${aid}/${blocked ? "block" : "unblock"}`, blocked ? { reason, expectedVersion:v } : { expectedVersion:v }), ["money"]);
    return true;
  };
  setStaffActive = (id, on) => {
    if (denied("staff.edit")) return;
    const s = staffById(id); if (!s || !canManageStaff(s)) return TOAST(t(s?.id === me().id ? "err_staff_self" : "no_rights"));
    run(tf(on ? "t_staff_on" : "t_staff_off", { name:s.name }), () => API.call("POST", `/admin/staff/${id}/${on ? "activate" : "deactivate"}`, { expectedVersion:s.version }), ["staff", "approvals"]);
  };
  /* Заказ в офисе: клиент по телефону — пассажиры аккаунтов сайта с этим номером и книги офиса (маска), полные — по выбору. */
  officeLookup = async (phone, end) => (await API.call("POST", "/admin/travellers/lookup", { phone:apiPhone(phone), ...(end ? { tripDate:end } : {}) })).items.map(apiSaved);
  officeReveal = async (ids, phone, end) => (await API.call("POST", "/admin/travellers/reveal", { phone:apiPhone(phone), ids, ...(end ? { tripDate:end } : {}) })).items.map(apiSavedFull);
  /* Заказ в офисе: цена каталога или взятая в кассе (дальше 10% — согласование). */
  saveOrderNew = (() => {
    const ORIG = saveOrderNew;
    return () => {
      const d0 = M.ui.onew, before = SITE.orders.length; muteNext(); ORIG(); if (SITE.orders.length === before) { RA.muteUntil = 0; return; }
      const o = SITE.orders.shift(), params = apiQuoteParams(o.type, o.details);
      // Пол, даты и гражданство из «Сканировать паспорт» (admin/96-api-ai.js) — к авиабилету.
      const scan = i => (d0?.type === "FLIGHT" && d0.list[i]?.scan) || {};
      const ref = prompt(t("api_receipt_q")); if (!ref || !ref.trim()) return rerender();
      // save: галочка «Сохранить для следующих заказов» (nosave — снята); сервер кладёт пассажиров в книгу офиса по телефону.
      run(tf("t_on_saved", { no:"" }), () => API.call("POST", "/admin/orders/office", { params, travellers:o.travellers.map((x, i) => ({ ...apiTraveller({ ...scan(i), ...x }), save:!x.nosave })),
        contact:{ phone:apiPhone(o.contact.phone), ...(o.contact.email ? { email:o.contact.email } : {}) }, priceUzs:o.total.uzs, receiptRef:ref.trim().slice(0, 120) },
        { idem:idem("office:" + o.no) }), ["money", "approvals", "crm"]).then(d => { idemDone("office:" + o.no); if (d?.order) go(`orders/site/${d.order.id}`); else go("orders"); });
    };
  })();

  /* ---------------- change(): сравнение до и после ---------------- */
  const PAX_KEYS = x => [x.surname, x.given, x.passport, x.gender || "", x.dob || "", x.expiry || "", x.cit || ""];
  const ORDER_KEYS = o => JSON.stringify([o.contact, o.travellers.map(PAX_KEYS), (o.sent || []).length]);
  function snap(){
    const orders = {}; for (const a of O.agencies) for (const o of a.orders) orders[o.id] = ORDER_KEYS(o); for (const o of SITE.orders) orders[o.id] = ORDER_KEYS(o);
    return { crm:JSON.parse(JSON.stringify(O.crm)), rules:JSON.stringify(O.rules), staff:new Map(O.staff.map(s => [s.id, JSON.stringify([s.name, s.phone, s.email, loc(s.pos), s.dept])])),
      agencies:new Map(O.agencies.map(a => [a.id, JSON.stringify([a.agency.name, a.agency.legal, a.agency.inn, a.agency.phone, a.agency.email])])),
      brands:new Map(O.agencies.map(a => [a.id, JSON.stringify(a.brand)])), notes:new Map(O.agencies.map(a => [a.id, a.notes.length])), orders };
  }
  change = fn => {
    const before = snap(); fn();
    const ops = diffOps(before);
    rerender();
    if (ops.length) run(null, async () => { const out = []; for (const [, f] of ops) out.push(await f()); return out; }, [...new Set(ops.map(([d]) => d))]);
  };
  function diffOps(b){
    const ops = [], add = (domain, f) => ops.push([domain, f]);
    // правила согласований (только основатель)
    if (JSON.stringify(O.rules) !== b.rules) {
      const rules = {}; for (const x of RA.rulesRaw) { const r = O.rules[x.rule]; if (!r) continue; rules[x.rule] = { enabled:r.on, minAmount:"min" in r ? r.min : x.minAmount, founderBypass:x.founderBypass }; }
      add("rules", () => API.call("PUT", "/admin/approval-rules", { rules, expected:Object.fromEntries(RA.rulesRaw.map(x => [x.rule, x.version])) }));
    }
    // сотрудники: контакты, должность, отдел
    for (const s of O.staff) { const was = b.staff.get(s.id); if (!was || was === JSON.stringify([s.name, s.phone, s.email, loc(s.pos), s.dept])) continue;
      add("staff", () => API.call("PATCH", `/admin/staff/${s.id}`, { name:s.name, ...(s.phone ? { phone:apiPhone(s.phone) } : {}), ...(s.email ? { email:s.email } : {}),
        ...(loc(s.pos) ? { pos:loc(s.pos) } : {}), dept:s.dept || DEPT_FALLBACK, expectedVersion:s.version })); }
    // агентства: новое, реквизиты, бренд и логотип, сообщение
    for (const a of O.agencies) {
      if (!b.agencies.has(a.id)) { add("money", () => API.call("POST", "/admin/agencies", { name:a.agency.name, inn:digits(a.agency.inn), phone:apiPhone(a.agency.phone), email:a.agency.email })); continue; }
      if (b.agencies.get(a.id) !== JSON.stringify([a.agency.name, a.agency.legal, a.agency.inn, a.agency.phone, a.agency.email]))
        add("money", () => API.call("PATCH", `/admin/agencies/${a.id}`, { name:a.agency.name, inn:digits(a.agency.inn), phone:apiPhone(a.agency.phone), email:a.agency.email,
          ...(a.agency.address ? { address:a.agency.address } : {}), expectedVersion:a.version }));
      if (b.brands.get(a.id) !== JSON.stringify(a.brand)) add("money", async () => {
        if (a.brand.logo && a.brand.logo.startsWith("data:")) await API.call("POST", `/admin/agencies/${a.id}/logo`, { image:a.brand.logo });
        const brand = apiBrandOut(a.brand);
        if (brand.phone && validPhone(brand.phone)) brand.phone = apiPhone(brand.phone);
        return API.call("PUT", `/admin/agencies/${a.id}/brand`, { brand });
      });
      for (const n of a.notes.slice(0, a.notes.length - (b.notes.get(a.id) || 0))) if (n.kind === "message") add("money", () => API.call("POST", `/admin/agencies/${a.id}/message`, { text:n.reason }));
    }
    // заказы: контакт, пассажиры, документ клиенту
    const orderOps = (o, prev) => {
      if (!prev || prev === ORDER_KEYS(o)) return;
      const [c0, tv0, sent0] = JSON.parse(prev);
      if (JSON.stringify(c0) !== JSON.stringify(o.contact))
        add("money", () => API.call("PATCH", `/admin/orders/${o.id}/contact`, { phone:apiPhone(o.contact.phone), ...(o.contact.email ? { email:o.contact.email } : {}), expectedVersion:o.version }));
      if (JSON.stringify(tv0) !== JSON.stringify(o.travellers.map(PAX_KEYS)))
        add("money", () => API.call("PUT", `/admin/orders/${o.id}/travellers`, { travellers:o.travellers.map((x, i) => ({ position:i + 1, ...apiTraveller(x) })), expectedVersion:o.version })
          .then(d => { if (d?.status === "AMENDMENT_REQUESTED") once.delete("o:" + o.id); return d; }));    // карточка заново: появится изменение у поставщика
      if ((o.sent || []).length > sent0)
        add("money", async () => { const d = await API.call("POST", `/admin/orders/${o.id}/documents`, { kind:o.type === "FLIGHT" ? "ticket" : "voucher", lang:S.lang, sendEmail:true });
          return { ...d, _toast:d.queued ? tf("t_doc_sent", { to:o.sent.at(-1)?.to || "—" }) : t("api_doc_not_queued") }; });
    };
    for (const a of O.agencies) for (const o of a.orders) orderOps(o, b.orders[o.id]);
    for (const o of SITE.orders) orderOps(o, b.orders[o.id]);
    crmOps(b.crm, add);
    return ops;
  }
  /* CRM: новые и изменённые лиды, этапы, ответственные, комментарии, задачи, клиенты, блокировка. */
  function crmOps(c0, add){
    const c1 = O.crm, was = new Map(c0.leads.map(l => [l.id, l])), now = new Map(c1.leads.map(l => [l.id, l]));
    const leadBody = l => ({ name:l.name, ...(l.phone ? { phone:apiPhone(l.phone) } : {}), ...(l.email ? { email:l.email } : {}), ...(l.country ? { country:l.country } : {}),
      source:l.source, service:l.service || null, dest:l.dest && typeof l.dest === "object" ? (l.dest.code ? { code:l.dest.code, ...(l.dest.heli ? { heli:true } : {}) } : { text:loc(l.dest) }) : l.dest || null,
      budget:l.budget ?? null });
    const target = tg => tg;
    for (const l of c1.leads) {
      const p = was.get(l.id);
      if (!p) { const note = c1.notes.find(n => n.target === "l:" + l.id && !c0.notes.some(m => m.id === n.id));
        add("crm", async () => { const d = await API.call("POST", "/admin/crm/leads", { ...leadBody(l), ...(note ? { note:note.text } : {}), managerId:staffToUid(l.manager) });
          if (currentParts()[0] === "crm" && currentParts()[1] === l.id) location.hash = "#/crm/" + d.lead.id; return d; });
        continue; }
      if (JSON.stringify(leadBody(l)) !== JSON.stringify(leadBody(p))) add("crm", () => API.call("PATCH", `/admin/crm/leads/${l.id}`, { ...leadBody(l), expectedVersion:p.version }));
      if (l.status !== p.status) add("crm", () => API.call("POST", `/admin/crm/leads/${l.id}/stage`, { status:l.status, ...(l.status === "lost" ? { reason:loc(l.lostReason) || "—" } : {}) }));
      if ((l.manager || null) !== (p.manager || null)) add("crm", () => API.call("POST", `/admin/crm/leads/${l.id}/manager`, { managerId:staffToUid(l.manager) }));
    }
    for (const p of c0.leads) if (!now.has(p.id)) add("crm", () => API.call("DELETE", `/admin/crm/leads/${p.id}`));
    const isNewLead = id => !was.has(id);
    for (const n of c1.notes) if (!c0.notes.some(m => m.id === n.id) && !(n.target.startsWith("l:") && isNewLead(n.target.slice(2))))
      add("crm", () => API.call("POST", "/admin/crm/notes", { target:target(n.target), kind:n.kind, text:loc(n.text) }));
    const tw = new Map(c0.tasks.map(x => [x.id, x]));
    for (const x of c1.tasks) { const p = tw.get(x.id);
      if (!p) add("crm", () => API.call("POST", "/admin/crm/tasks", { target:target(x.target), text:loc(x.text), dueAt:new Date(x.due).toISOString(), ...(staffToUid(x.assignee) ? { assigneeId:staffToUid(x.assignee) } : {}) }));
      else if (!!x.done !== !!p.done) add("crm", () => API.call("POST", `/admin/crm/tasks/${x.id}/done`, { done:!!x.done })); }
    for (const [key, r] of Object.entries(c1.clients)) {
      const p = c0.clients[key] || {}, k = key.slice(2);
      const rec = x => JSON.stringify([x.name || "", x.email || "", x.country || "", x.source || ""]);
      if (key.startsWith("c:") && rec(r) !== rec(p)) {
        const exists = RA.clients.some(c => c.key === key);
        add("crm", () => exists ? API.call("PUT", `/admin/crm/clients/${encodeURIComponent(k)}`, { name:r.name, ...(r.email ? { email:r.email } : {}), ...(r.country ? { country:r.country } : {}), ...(r.source ? { source:r.source } : {}) })
          : API.call("POST", "/admin/crm/clients", { name:r.name, phone:apiPhone(r.phone || k), ...(r.email ? { email:r.email } : {}), ...(r.country ? { country:r.country } : {}), ...(r.source ? { source:r.source } : {}) }));
      }
      if ((r.manager || null) !== (p.manager || null)) add("crm", () => API.call("POST", `/admin/crm/clients/${encodeURIComponent(key.startsWith("a:") ? k : k)}/manager`, { managerId:staffToUid(r.manager) }));
      if (key.startsWith("c:") && !!r.blocked !== !!p.blocked) add("crm", () => API.call("POST", "/admin/blocks", { phone:apiPhone(r.phone || k), blocked:!!r.blocked, ...(r.blocked ? { reason:r.blockReason || "—" } : {}) }));
    }
  }
  /* Клиенты сайта — из /admin/crm/clients (собирает сервер). */
  b2cClients = () => RA.clients.filter(c => c.type === "b2c").map(c => {
    const key = String(c.key || "").replace(/^c:/, ""), leads = O.crm.leads.filter(l => digits(l.phone) === key);
    return { key, phone:c.phone ? prettyPhone(c.phone) : prettyPhone(key), name:c.name || "", orders:SITE.orders.filter(o => digits(o.contact?.phone) === key), leads,
      spent:Number(c.spent) || 0, paid:Number(c.paid) || 0, last:apiTs(c.lastAt), first:apiTs(c.firstAt), lastPaid:apiTs(c.lastPaid), email:c.email || "", country:c.country || "",
      source:c.source || "site", manager:uidToStaff(c.managerId), blocked:!!c.blocked, blockReason:O.crm.clients["c:" + key]?.blockReason || "", segment:c.segment || "new" };
  });

  /* ---------------- документ клиенту: только письмо, адрес — тот, что возьмёт сервер ----------------
     Сервер шлёт документ на e-mail заказа (у заказов агентств — на e-mail агентства);
     SMS и Telegram документов сервер не отправляет, другой адрес не принимает. */
  const docEmailTo = r => r.a ? r.a.email || "" : r.o.contact?.email || "";
  docActions = r => {
    const o = r.o, on = !!sysCfg().ch.email?.on, to = docEmailTo(r);
    return `<section class="card stack doc-send doc-actions" aria-labelledby="doc-h-${o.id}"><div class="card-h"><h2 id="doc-h-${o.id}">${esc(t("doc_h"))}</h2>
        <button type="button" class="ghost sm" data-act="adprint">${IC.print}<span>${esc(t("doc_print"))}</span></button></div>
      ${can("orders.edit") ? on ? `<p class="small">${esc(tf(r.a ? "api_doc_email_agency" : "api_doc_email_to", { to:to || "—" }))}</p>
        <div class="row"><button type="button" class="solid sm" data-act="adsend" data-src="${r.src}" data-v="${o.id}">${esc(t("api_doc_send"))}</button></div>`
        : `<p class="muted small">${esc(t("sys_ch_all_off"))}</p>` : ""}
      ${o.sent?.length ? `<ul class="sent-list">${o.sent.map(x => `<li>${IC.ok}<span>${esc(t("doc_ch_" + x.ch))} · ${esc(x.to)} · ${esc(x.by)} · ${esc(fdt(x.at))}</span></li>`).join("")}</ul>` : ""}</section>`;
  };
  sendDoc = r => {
    if (denied("orders.edit")) return;
    if (!sysCfg().ch.email?.on) { rerender(); return TOAST(t("sys_ch_off")); }
    const to = docEmailTo(r) || "—";
    change(() => mutOrder(r, x => { (x.sent ||= []).push({ at:Date.now(), ch:"email", to, by:me().name }); }));
  };
  /* Изменение пассажиров у поставщика (после оплаты): ответ поставщика — «применить» или «отказ». */
  const AM_FIELD = { surname:"surname", given:"given_name", passport:"passport_no", gender:"gender", dob:"dob", expiry:"pp_expiry", cit:"citizenship" };
  const amLabel = k => { const key = AM_FIELD[k]; return key && t(key) !== key ? t(key) : k; };
  const amDiff = d => !d ? "" : `<ul class="small">${Object.entries(d).map(([pos, f]) => `<li>${esc(t("passenger"))} ${esc(pos)}: ${Object.entries(f || {})
    .map(([k, v]) => `${esc(amLabel(k))} ${esc(String(v?.from ?? "—"))} → ${esc(String(v?.to ?? "—"))}`).join(", ")}</li>`).join("")}</ul>`;
  const PAX_EDIT = paxEdit;
  paxEdit = r => PAX_EDIT(r) + (r.o.amend || []).map(a => `<div class="reqbanner no-print" role="status"><b>${esc(t("amend_h"))}</b>
      <span class="small">${esc(t("amend_wait"))} · ${esc(fdt(a.at))}</span>${amDiff(a.diff)}
      ${can("orders.edit") ? `<div class="row"><button type="button" class="solid sm" data-act="amapply" data-src="${esc(r.src)}" data-v="${esc(r.o.id)}" data-am="${esc(a.id)}">${esc(t("amend_apply"))}</button>
        <button type="button" class="link" data-act="amdecline" data-src="${esc(r.src)}" data-v="${esc(r.o.id)}" data-am="${esc(a.id)}">${esc(t("amend_decline"))}</button></div>` : ""}</div>`).join("");
  const amResolve = (el, decision) => {
    if (denied("orders.edit")) return;
    const reply = prompt(t("amend_reply_q")); if (reply == null) return;
    if (decision === "DECLINE" && !reply.trim()) return TOAST(t("err_reason"));
    const id = el.dataset.am, oid = el.dataset.v;
    run(t("amend_done"), () => API.call("POST", `/admin/amendments/${id}/resolve`, { decision, ...(reply.trim() ? { reply:reply.trim().slice(0, 200) } : {}) }), ["money"])
      .then(() => { once.delete("o:" + oid); onExternalChange(); });
  };
  ACT.amapply = el => amResolve(el, "APPLY");
  ACT.amdecline = el => amResolve(el, "DECLINE");
  const amDiffLoad = o => { for (const a of o.amend || []) if (!a.diff && !a.loading) { a.loading = true;
    API.call("GET", `/admin/amendments/${a.id}`, undefined, rd()).then(d => { a.diff = d.diff || {}; onExternalChange(); }).catch(e => TOAST(API.errText(e))).finally(() => { a.loading = false; }); } };

  /* ---------------- направления ---------------- */
  saveDirs = (list, action) => {
    const raw = new Map(RA.dirsRaw.map(d => [d.iata, d])), ops = [];
    /* hidden меняют hide/show; bookable и supplierMap демо не знает — из копии сервера. */
    const keep = d => { const r = raw.get(d.iata); return r ? { hidden:!!r.hidden, bookable:!!r.bookable, supplierMap:r.supplierMap ?? null } : {}; };
    const was = new Map((APIX.dirs || []).map(d => [d.iata, d])), body = d => ({ city:d.city, country:d.country, lat:d.lat, lon:d.lon, eco:d.eco, popular:!!d.popular, resort:!!d.resort,
      color:d.color, hotels:(d.hotels || []).map(h => ({ name:h.name, area:h.area || "", stars:h.stars, board:h.board, base:h.base, beach:h.beach || "city", pool:!!h.pool })) });
    for (const d of list) {
      const p = was.get(d.iata);
      if (!p) { ops.push(() => API.call("POST", "/admin/destinations", { code:d.iata, destination:body(d) })); continue; }
      if (JSON.stringify(body(d)) !== JSON.stringify(body(p))) ops.push(() => API.call("PUT", `/admin/destinations/${d.iata}`, { destination:{ ...body(d), ...keep(d) }, expectedVersion:raw.get(d.iata)?.version }));
      if (!!d.hidden !== !!p.hidden) ops.push(() => API.call("POST", `/admin/destinations/${d.iata}/${d.hidden ? "hide" : "show"}`, { expectedVersion:raw.get(d.iata)?.version }));
    }
    muteNext();
    run(null, async () => { const out = []; for (const f of ops) out.push(await f()); return out; }, ["dirs"]);
  };

  /* ---------------- содержимое сайта ---------------- */
  const CMS_META = ["id", "type", "status", "deleted", "order", "at", "by", "mo", "version", "createdAt", "createdBy", "updatedAt", "updatedBy", "updatedByName", "publishedAt", "deletedAt", "slug"];
  const cmsFields = x => Object.fromEntries(Object.entries(x).filter(([k]) => !CMS_META.includes(k)));
  const upload = async (v, purpose) => typeof v === "string" && v.startsWith("data:") ? (await API.call("POST", "/admin/cms/uploads", { image:v, purpose })).url : v;
  async function cmsItemFields(x){ const f = cmsFields(x); if ("image" in f) f.image = await upload(f.image, "image"); return f; }
  if (API.remote("cms")) acmsCommit = (action, fn) => {
    const cur = cmsLoad(), next = cmsClone(cur), r = fn(next);
    if (!r) { rerender(); return false; }
    const ops = [], was = new Map(cur.items.map(x => [x.id, x]));
    for (const x of next.items) {
      const p = was.get(x.id);
      if (!p) { ops.push(async () => API.call("POST", "/admin/cms/items", { type:x.type, fields:await cmsItemFields(x), ...(x.slug ? { slug:x.slug } : {}), status:x.status })); continue; }
      if (!!x.deleted !== !!p.deleted) { ops.push(() => API.call("POST", `/admin/cms/items/${x.id}/${x.deleted ? "trash" : "restore"}`, {})); continue; }
      const fx = JSON.stringify(cmsFields(x)), fp = JSON.stringify(cmsFields(p));
      if (fx !== fp || x.slug !== p.slug) ops.push(async () => API.call("PATCH", `/admin/cms/items/${x.id}`, { fields:await cmsItemFields(x), ...(x.slug ? { slug:x.slug } : {}),
        ...(x.status !== p.status ? { status:x.status } : {}), expectedVersion:p.version }));
      else if (x.status !== p.status) ops.push(() => API.call("POST", `/admin/cms/items/${x.id}/status`, { status:x.status, expectedVersion:p.version }));
    }
    for (const p of cur.items) if (!next.items.some(x => x.id === p.id)) ops.push(() => API.call("POST", `/admin/cms/items/${p.id}/purge`, {}));
    for (const k of new Set([...Object.keys(cur.texts), ...Object.keys(next.texts)]))
      if (JSON.stringify(cur.texts[k] || null) !== JSON.stringify(next.texts[k] || null))
        ops.push(() => API.call("PUT", `/admin/cms/texts/${encodeURIComponent(k)}`, { value:next.texts[k] || null, expectedVersion:RA.cmsRaw?.texts?.[k]?.version }));
    const sv = {}, se = {};
    for (const f of Object.keys(next.site)) if (JSON.stringify(cur.site[f]) !== JSON.stringify(next.site[f])) { sv[f] = next.site[f]; se[f] = RA.cmsRaw?.site?.[f]?.version ?? 0; }
    if (Object.keys(sv).length) ops.push(async () => { for (const f of ["logo", "favicon"]) if (f in sv) sv[f] = await upload(sv[f], f); return API.call("PUT", "/admin/cms/site", { values:sv, expected:se }); });
    if (JSON.stringify(cur.home) !== JSON.stringify(next.home)) ops.push(() => API.call("PUT", "/admin/cms/home", { blocks:next.home, expectedVersion:RA.cmsRaw?.home?.version }));
    CMS_CACHE = next;                                          // видно сразу; правду вернёт загрузка
    muteNext();
    run(null, async () => { const out = []; for (const f of ops) out.push(await f()); return out; }, ["cms"]);
    return true;
  };
  if (API.remote("cms")) acmsMove = (id, d, menu = false) => {
    if (denied("content.edit")) return false;
    run(t("api_saved"), () => API.call("POST", `/admin/cms/items/${id}/move`, { dir:d < 0 ? -1 : 1, ...(menu ? { menu:true } : {}) }), ["cms"]);
    return true;
  };
  /* История версий — с сервера, когда её открывают. */
  const HIST = ACT.acmshist;
  if (API.remote("cms")) ACT.acmshist = el => {
    HIST(el); const id = M.ui.cmsHist; if (!id) return;
    const c = id.indexOf(":"), kind = id.slice(0, c), key = id.slice(c + 1);
    API.call("GET", `/admin/cms/history?kind=${kind === "texts" ? "text" : "site"}&key=${encodeURIComponent(key)}`, undefined, rd()).then(d => {
      const items = d.items || [], doc = cmsLoad();
      doc.hist[kind][key] = { at:apiTs(items[0]?.replacedAt), by:items[0]?.replacedByName || "", prev:items.map(x => ({ v:x.value, at:apiTs(x.setAt), by:x.setByName || "" })) };
      if (M.ui.cmsHist === id) rerender();
    }).catch(e => TOAST(API.errText(e)));
  };

  /* ---------------- обзор: цифры считает сервер ---------------- */
  async function loadDash(n){
    const d = await API.call("GET", `/admin/dashboard?period=${n}`, undefined, rd());
    RA.dash[n] = { at:Date.now(), d }; if (currentParts().length === 0) rerender();
  }
  dashMetrics = (n = dashPeriod()) => {
    const x = RA.dash[n]; if (!x || Date.now() - x.at > 60000) loadDash(n).catch(e => console.warn("dash", e.code || e));
    const s = x?.d.sales || {}, f = x?.d.finance || {}, days = dashDays(n);
    return { n, days, from:days[0], to:days[n - 1], rows:[], b2b:s.b2b || { sum:0, n:0 }, b2c:s.b2c || { sum:0, n:0 }, turnover:s.turnover || 0, orders:s.orders || 0, unpaid:s.unpaid || 0,
      fee:f.fee || 0, feeBps:f.feeBps || 0, topups:f.topups || 0, topWait:f.topWait || { n:0, sum:0 }, refunds:f.refunds || 0, refWait:f.refWait || { n:0, sum:0 }, srv:x?.d || null };
  };
  dashSnapshot = () => { const x = Object.values(RA.dash).sort((a, b) => b.at - a.at)[0]?.d.snapshot || {};
    return { balance:x.balance || 0, neg:x.negative || 0, agencies:x.agencies || 0, active:x.active || 0, blocked:x.blocked || 0, pending:x.pending || 0, apps:x.applications || 0, clients:x.clients || 0, newClients:x.newClients || 0 }; };
  dashBuckets = m => (m.srv?.buckets || []).map(b => ({ from:b.from, to:b.to, b2b:b.b2b || 0, b2c:b.b2c || 0, fee:b.fee || 0 }));
  dashDest = m => (m.srv?.sales?.destinations || []).map(x => ({ key:(x.heli ? "h:" : "") + x.code, code:x.code, heli:!!x.heli, name:x.city ? loc(x.city) : destName(x), n:x.n || 0, sales:x.sum ?? x.sales ?? 0 }));
  dashSvc = m => (m.srv?.sales?.services || []).map(x => ({ k:x.k || x.service, n:x.n || 0, b2b:x.b2b || 0, b2c:x.b2c || 0, fee:x.fee || 0 }));

  /* ---------------- выгрузки: файлы собирает сервер ---------------- */
  const clean = f => Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== "" && v !== "all"));
  const ui = k => M.ui[k] == null ? "" : String(M.ui[k]).trim();
  const dl = (kind, format, filters = {}) => API.download(`/admin/exports/${kind}`, { format, lang:S.lang, filters:clean(filters) }, `charteri-${kind}.${format}`).catch(e => TOAST(API.errText(e)));
  ACT.txcsv = () => { if (!denied("finance.export")) dl("transactions", "csv"); };
  ACT.txxls = () => { if (!denied("finance.export")) dl("transactions", "xlsx"); };
  // «Финансы»: сервер выгружает проводки (transactions); вкладки возвратов и выручки — только на экране.
  ACT.fcsv = () => { if (!denied("finance.export")) dl("transactions", "csv"); };
  ACT.lcsv = () => { if (!denied("crm.export")) dl("leads", "csv"); };
  // Клиенты: тип, сегмент и поиск вкладки CRM; страница «Клиенты сайта» — только b2c со своими фильтрами.
  ACT.ccsv = () => { if (can("crm.export") || can("b2c.export")) dl("clients", "csv", { type:ui("cty"), segment:ui("csg"), q:ui("cq") }); else TOAST(t("no_rights")); };
  ACT.bcsv = () => { if (!denied("b2c.export")) dl("clients", "csv", { type:"b2c", segment:ui("bsg"), q:ui("bq") }); };
  ACT.aucsv = () => TOAST(t("api_local_only"));
  downloadBackup = async () => {
    if (denied("settings.export")) return;
    try {
      const d = await API.call("POST", "/admin/exports", {});
      const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(new Blob([JSON.stringify(d)], { type:"application/json" })), download:`charteri-export-${tzToday()}.json` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch(e) { TOAST(API.errText(e)); }
  };
  ACT.areset = () => TOAST(t("api_e_NOT_SUPPORTED"));
  ACT.aswitch = () => {};
  switchStaff = () => {};
  ACT.systest = el => { if (denied("settings.edit")) return; run(t("t_sys_test"), () => API.call("POST", "/admin/channels/test", { channel:el.dataset.v })); };

  /* ---------------- страницы: данные карточки — при открытии ---------------- */
  const SRV_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;    // свои id демо (ld…, o…) ещё не на сервере
  const after = (key, fn) => { const p = PAGES[key]; if (!p) return; const orig = p.after; p.after = params => { orig?.(params); fn(params || {}); }; };
  const once = new Map();
  const fetchOnce = (key, ms, fn) => { const at = once.get(key) || 0; if (Date.now() - at < ms) return; once.set(key, Date.now()); fn().then(() => onExternalChange()).catch(e => { once.delete(key); TOAST(API.errText(e)); }); };
  after("agencies/:id", ({ id }) => fetchOnce("ag:" + id, 15000, () => loadLedger(id)));
  after("finance", () => fetchOnce("fin", 30000, () => Promise.all(O.agencies.map(a => loadLedger(a.id)))));
  after("crm/:id", ({ id }) => { if (SRV_ID.test(id)) fetchOnce("l:" + id, 10000, () => loadTarget("l:" + id)); });
  after("customers/:phone", ({ phone }) => fetchOnce("c:" + phone, 10000, () => loadTarget("c:" + digits(phone))));
  /* Заказ ещё не в списке (появился после загрузки) — карточку берём с сервера и кладём в список. */
  after("orders/:src/:id", ({ src, id }) => { if (SRV_ID.test(id)) fetchOnce("o:" + id, 10000, async () => {
    const d = await API.call("GET", `/admin/orders/${id}`, undefined, rd());
    const list = src === "site" ? SITE.orders : O.agencies.find(a => a.id === src)?.orders, i = list ? list.findIndex(o => o.id === id) : -1;
    if (!list) return;
    const o = Object.assign(apiOrderFull(d, i >= 0 ? list[i] : null), { channel:i >= 0 ? list[i].channel : d.order.channel === "OFFICE" ? "office" : d.order.channel });
    if (i >= 0) list[i] = o; else list.unshift(o);
    amDiffLoad(o);
  }); });
  // Переход по разделам — свежие заказы и деньги, если данные старше 15 секунд.
  window.addEventListener("hashchange", () => { if (!RA.actor || Date.now() - (RA.lastMoney || 0) < 15000) return;
    reload("money", "approvals", ...(["crm", "customers"].includes(currentParts()[0]) ? ["crm"] : [])); });
  PAGES.audit.render = () => `<div class="page"><div class="pagehead"><h1>${esc(t("an_audit"))}</h1></div><div class="card"><p class="muted">${esc(t("api_audit_server"))}</p></div></div>`;

  /* ---------------- вход ---------------- */
  const AUTH_AFTER = PAGES.auth.after, AUTH_RENDER = PAGES.auth.render;
  PAGES.auth.render = () => API.booting ? `<div class="auth adm-auth"><section class="auth-main"><div class="card stack authcard"><p class="pcheck wait"><span class="spin"></span>${esc(t("api_loading"))}</p></div></section></div>` : AUTH_RENDER();
  PAGES.auth.after = () => {
    AUTH_AFTER?.();
    const ph = $("#aph"); if (ph) { ph.type = "text"; ph.inputMode = "email"; ph.autocomplete = "username"; ph.closest("label").querySelector("span").textContent = t("api_login_id"); if (!M.ui.aPhone) ph.value = ""; }
    $(".adm-auth .tchips")?.parentElement?.remove();
    apiOtpPatch("aotp");
  };
  ACT.apick = () => {};
  ACT.asend = async () => {
    const id = apiLoginId($("#aph")?.value); hideErr("#aerr");
    if (!id) return showErr("#aerr", t("api_err_login_id"));
    overlay(t("api_sending"));
    try { await API.otpSend(id); M.ui.aPhone = id; M.ui.aStep = "code"; rerender(); }
    catch(e) { showErr("#aerr", API.errText(e)); }
    finally { overlay(""); }
  };
  aVerify = async () => {
    const code = ($("#aotp")?.value || "").trim();
    if (!new RegExp(`^\\d{${API_OTP_LEN}}$`).test(code)) return showErr("#aerr", t("api_err_code"));
    if (aVerify.busy) return; aVerify.busy = true; overlay(t("api_sending"));
    try {
      const a = await API.otpVerify(M.ui.aPhone, code);
      await enter(a);
      M.ui = { aStep:"phone" }; TOAST(tf("hello_toast", { name:me()?.name.split(" ")[0] || "" }));
      if (currentParts()[0] === "auth") go(""); else render(true);
    } catch(e) { showErr("#aerr", API.errText(e)); const el = $("#aotp"); if (el) el.value = ""; }
    finally { aVerify.busy = false; overlay(""); }
  };
  apiOtpInput("aotp", () => aVerify());
  async function enter(actor){
    if (!actor?.staff) { await API.signOut(); throw new ApiError("NOT_STAFF", 403); }
    RA.actor = actor; RA.perms = new Set(actor.staff.perms || []);
    S = blankS(); O = blankO(); SITE = { v:1, orders:[], user:null }; adminPrefs();
    await loadAll();
  }
  ACT.asignout = async () => { await API.signOut(); RA.actor = null; O = blankO(); toast(t("signed_out")); go(""); };
  API.onLost(code => { RA.actor = null; O = blankO(); M.ui = {}; TOAST(t(code === "SESSION_IDLE" ? "api_e_SESSION_IDLE" : "api_e_SESSION")); render(true); });

  /* ---------------- запуск: после 99-boot.js ---------------- */
  setTimeout(async () => {
    try { await loadSettings(); await loadDirs(); } catch(e) { TOAST(API.errText(e)); }
    try { const a = await API.restore(); if (a) await enter(a); } catch(e) { TOAST(API.errText(e)); }
    API.booting = false;
    render(true);
    API.poll(POLL_MS, () => inBg(async () => {
      if (!RA.actor) return;
      if (Date.now() - RA.lastFull > FULL_MS) return reload();
      const n = await API.call("GET", "/admin/notifications?limit=20", undefined, rd());
      if (n.unread !== RA.unread || n.items[0]?.id !== RA.lastNote) { RA.unread = n.unread; RA.lastNote = n.items[0]?.id; await reload("money", "apps", "approvals"); }
    }));
  }, 0);
}
