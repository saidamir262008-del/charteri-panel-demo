/* ==========================================================================
   CRM: лиды, клиенты, комментарии и контакты, задачи и напоминания.
   Хранится в O.crm: leads, clients (данные CRM поверх клиента), notes, tasks.

   Цепочка из ТЗ: заявка → лид → менеджер связался → в карточке появился
   заказ → после оплаты статусы лида и клиента меняются сами. Поэтому часть
   CRM собирается из других демо: заявка на чартер с сайта становится лидом,
   заявка агентства на подключение — лидом B2B, заказы сайта с телефоном лида
   прикрепляются к нему, оплата двигает лид в «Подтверждён», поездка — в
   «Завершён». Это делает syncCrm().
   ========================================================================== */
"use strict";

const LEAD_STAGES = ["new", "contacted", "progress", "interested", "confirmed", "completed", "lost"];
const LEAD_OPEN = ["new", "contacted", "progress", "interested"];
/* Источники. Два последних лиды получают сами, вручную их не выбирают. */
const LEAD_SOURCES = ["phone", "telegram", "instagram", "whatsapp", "email", "referral", "walk_in", "site", "other", "site_charter", "b2b_app"];
const AUTO_SOURCES = ["site_charter", "b2b_app"];
const LEAD_SERVICES = ["FLIGHT", "TOUR", "HOTEL", "JET", "HELI"];
const NOTE_KINDS = ["note", "call", "message", "meeting", "email"];
/* Сегменты клиента: VIP — от этой суммы оплат; активный — платил за полгода. */
const VIP_MIN = 30_000_000, ACTIVE_DAYS = 180;
const NOTE_MAX = 500, TASK_MAX = 160;

/* ---- хранилище ---- */
function migrateCrm(o){
  const c = o.crm && typeof o.crm === "object" ? o.crm : null;
  o.crm = {
    seq:Number.isInteger(c?.seq) ? c.seq : 0,
    leads:Array.isArray(c?.leads) ? c.leads.filter(l => l && typeof l.id === "string" && LEAD_STAGES.includes(l.status)) : [],
    clients:c?.clients && typeof c.clients === "object" && !Array.isArray(c.clients) ? c.clients : {},
    notes:Array.isArray(c?.notes) ? c.notes.filter(n => n && n.text && NOTE_KINDS.includes(n.kind)) : [],
    tasks:Array.isArray(c?.tasks) ? c.tasks.filter(x => x && x.text && Number.isFinite(x.due)) : [],
    // Заявки с сайта и агентств, которые CRM уже разобрала: удалённый лид не возвращается.
    seen:Array.isArray(c?.seen) ? c.seen.filter(k => typeof k === "string") : []
  };
  const seen = new Set(o.crm.seen);
  for (const l of o.crm.leads) {
    if (l.origin?.src === "site") seen.add("site:" + l.origin.id);
    if (l.origin?.app) seen.add("app:" + l.origin.app);
    for (const x of l.links || []) seen.add(x.src + ":" + x.id);
  }
  o.crm.seen = [...seen];
  if (!c) seedCrm(o);
  return o;
}
const leadNo = o => "L-" + String(++o.crm.seq).padStart(4, "0");
const leadById = id => O.crm.leads.find(l => l.id === id) || null;
const clientData = key => O.crm.clients[key] || null;
/* Данные CRM поверх клиента: создаются при первой правке. */
const clientRec = key => (O.crm.clients[key] ||= { events:[] });

/* ---- кто что видит ----
   С правом «CRM: управление» — все лиды; без него — свои и ничьи (их можно
   взять себе). Основатель и владелец видят всё. Проверки «как сотрудник s» —
   для исполнителей задач: задачу нельзя поручить тому, кто её цель не видит. */
const crmAll = () => can("crm.manage");
const canSeeLeadAs = (l, s) => !!s && canAs(s, "crm.view") && (canAs(s, "crm.manage") || !l.manager || l.manager === s.id);
const canSeeLead = l => canSeeLeadAs(l, me());
function canSeeTarget(target, s = me()){
  const id = target.slice(2);
  if (target.startsWith("l:")) { const l = leadById(id); return !!l && canSeeLeadAs(l, s); }
  if (target.startsWith("a:")) return canAs(s, "b2b.view");
  return canAs(s, "b2c.view") || canAs(s, "crm.view");
}
const canEditLead = l => can("crm.edit") && canSeeLead(l);
const visibleLeads = () => O.crm.leads.filter(canSeeLead);
/* Кому можно назначить лид или задачу: действующие сотрудники, которые ведут лиды. */
const crmStaff = () => activeStaff().filter(s => s.role === "founder" || hasPerm(permsOf(s.role), "crm.edit"));

/* ---- лид: события ---- */
const leadEvent = (l, e) => { l.events.unshift({ at:Date.now(), by:e.sys ? null : me()?.id || null, ...e }); l.updatedAt = Date.now(); };
function newLead(o, spec){
  const l = { id:uid("ld"), no:leadNo(o), name:"", phone:"", email:"", country:"", source:"other", service:null, dest:"", budget:null,
    status:"new", manager:null, lostReason:"", links:[], origin:null, createdAt:Date.now(), updatedAt:Date.now(), by:null, events:[], ...spec };
  l.events = [{ at:l.createdAt, by:l.by, type:"created" }, ...(l.events || [])];
  o.crm.leads.unshift(l);
  return l;
}
/* Направление лида: код аэропорта или площадки — по языку экрана; текст — как ввели. */
const leadDest = l => !l.dest ? "" : typeof l.dest === "object" && l.dest.code ? (l.dest.heli ? heliName(l.dest.code) : cityName(l.dest.code)) : loc(l.dest);
const leadWhat = l => l.kind === "b2b" ? t("crm_b2b_interest") : [l.service ? t("type_" + l.service) : "", leadDest(l)].filter(Boolean).join(" · ");

/* ---- заказы: оплачен ли, в силе ли, закончилась ли поездка ---- */
const orderPaid = o => !!o.paidAt || !!o.history?.some(h => h.s === "PAID") || ["PAID", "CONFIRMED", "COMPLETED"].includes(o.status);
const orderGone = o => ["CANCELLED", "REFUNDED"].includes(o.status);
const orderWon = o => orderPaid(o) && !orderGone(o);
const orderEnded = o => ["CONFIRMED", "COMPLETED"].includes(o.status) && o.end && o.end < TODAY;
const siteOrder = id => SITE?.orders.find(o => o.id === id) || null;
const linkedOrders = l => l.links.map(x => x.src === "site" ? siteOrder(x.id) : null).filter(Boolean);

/* ---- синхронизация с сайтом и заявками агентств ----
   dry — только посчитать, есть ли что менять (без записи). Вызывается при
   запуске и при изменениях сайта или заявок; запись — внутри change(). */
const CHARTER_STAGE = { NEW:"new", PENDING:"progress", PAID:"confirmed", CONFIRMED:"confirmed", COMPLETED:"completed", CANCELLED:"lost", REFUNDED:"lost" };
const APP_STAGE = { pending:"new", approved:"completed", rejected:"lost" };
function syncCrm(dry){
  let n = 0;
  const hit = () => { n++; return !dry; };
  const leads = O.crm.leads, seen = new Set(O.crm.seen), see = k => { seen.add(k); O.crm.seen.push(k); };
  const linked = new Set(leads.flatMap(l => l.links.map(x => x.src + ":" + x.id)));
  const samePhone = ph => digits(ph) && leads.find(l => l.kind !== "b2b" && LEAD_OPEN.includes(l.status) && digits(l.phone) === digits(ph));
  // 1. Заявка на чартер с сайта → лид. Если у номера уже есть открытый лид —
  //    заявка ложится в него, второй лид не заводится.
  for (const o of SITE?.orders || []) {
    const k = "site:" + o.id;
    if (!["JET", "HELI"].includes(o.type) || seen.has(k) || !hit()) continue;
    see(k); if (linked.has(k)) continue;
    const same = samePhone(o.contact?.phone); linked.add(k);
    if (same) { same.links.push({ src:"site", id:o.id }); leadEvent(same, { type:"link", no:o.no || "", sys:true }); continue; }
    const st = CHARTER_STAGE[o.status] || "new", d = o.details || {};
    newLead(O, { name:o.travellers?.[0]?.given || "", phone:o.contact?.phone || "", source:"site_charter", service:o.type,
      dest:d.to ? { code:d.to, heli:o.type === "HELI" } : "", budget:d.quote?.usd || null, status:st, createdAt:o.createdAt,
      lostReason:st === "lost" ? strRef("lost_order_cancelled") : "", links:[{ src:"site", id:o.id }], origin:{ src:"site", id:o.id } });
  }
  // 2. Заявка агентства на подключение → лид B2B; решение по заявке двигает лид один раз.
  for (const a of loadApps()) {
    const k = "app:" + a.id, l = leads.find(x => x.origin?.app === a.id), st = APP_STAGE[a.status] || "new";
    if (!seen.has(k)) { if (!hit()) continue; see(k);
      if (!l) newLead(O, { name:a.company, contact:a.person, phone:a.phone, email:a.email, source:"b2b_app", kind:"b2b", status:st,
        createdAt:a.at, lostReason:st === "lost" ? a.reason || "" : "", origin:{ app:a.id }, autoDone:a.status === "pending" ? [] : [k + ":" + a.status] });
      continue; }
    const key = k + ":" + a.status;
    if (!l || a.status === "pending" || (l.autoDone || []).includes(key) || !hit()) continue;
    (l.autoDone ||= []).push(key);
    if (LEAD_OPEN.includes(l.status)) { leadEvent(l, { type:"status", from:l.status, to:st, sys:true }); l.status = st; l.lostReason = st === "lost" ? a.reason || "" : ""; }
  }
  // 3. Заказ сайта с номера лида, сделанный после лида, — в его карточку.
  //    Заказ принадлежит одному лиду; заявки на чартер разбирает шаг 1.
  for (const l of leads) {
    if (l.kind === "b2b" || !digits(l.phone) || !["confirmed", ...LEAD_OPEN].includes(l.status)) continue;
    for (const o of SITE?.orders || []) {
      const k = "site:" + o.id;
      if (digits(o.contact?.phone) !== digits(l.phone) || o.createdAt < l.createdAt || linked.has(k) || ["JET", "HELI"].includes(o.type) || !hit()) continue;
      l.links.push({ src:"site", id:o.id }); linked.add(k); leadEvent(l, { type:"link", no:o.no || "", sys:true });
    }
  }
  // 4. События заказов двигают лид — каждое один раз (autoDone), поэтому
  //    этап, который потом поменял менеджер, не перетирается:
  //    оплачен → «Подтверждён», поездка прошла → «Завершён»,
  //    отменён и других оплаченных нет → «Потерян».
  for (const l of leads) {
    const os = linkedOrders(l); if (!os.length) continue;
    for (const o of os) for (const tr of orderWon(o) ? (orderEnded(o) ? ["won", "ended"] : ["won"]) : orderGone(o) ? ["gone"] : []) {
      const key = o.id + ":" + tr;
      if ((l.autoDone || []).includes(key) || !hit()) continue;
      (l.autoDone ||= []).push(key);
      const to = tr === "won" && [...LEAD_OPEN, "lost"].includes(l.status) ? "confirmed" : tr === "ended" && l.status === "confirmed" ? "completed"
        : tr === "gone" && [...LEAD_OPEN, "confirmed"].includes(l.status) && !os.some(orderWon) ? "lost" : null;
      if (to) { leadEvent(l, { type:"status", from:l.status, to, sys:true }); l.status = to; l.lostReason = to === "lost" ? strRef("lost_order_cancelled") : ""; }
    }
  }
  return n;
}
/* Запустить синхронизацию, если есть что менять. */
/* Сотрудник печатает — данные сохраняем без перерисовки страницы (как при
   изменениях из другой вкладки), иначе фокус и набранный текст пропали бы. */
function crmSync(){
  if (!O || !syncCrm(true)) return;
  const f = document.activeElement;
  if (f?.matches?.("input, textarea, select") && $("#app")?.contains(f)) { O = loadOps() || O; syncCrm(false); saveOps(); renderNav(matchRoute(currentParts()).key); return; }
  const key = focusKey(f); change(() => syncCrm(false)); refocus(key);
}

/* ---- клиенты B2C ----
   Клиент — номер телефона. Собирается из заказов сайта, вошедшего на сайте,
   лидов и клиентов, заведённых вручную; поверх — данные CRM. */
function b2cClients(){
  const map = new Map();
  const add = (phone, name, at) => {
    const key = digits(phone); if (!key || key.length < 9) return null;
    if (!map.has(key)) map.set(key, { key, phone:prettyPhone(phone), name:"", orders:[], leads:[], spent:0, paid:0, last:0, first:at || Date.now() });
    const c = map.get(key); if (!c.name && name) c.name = name; if (at) { c.last = Math.max(c.last, at); c.first = Math.min(c.first, at); }
    return c;
  };
  // Имя — из лида (его вводит менеджер), затем из заказа (латиницей, как в паспорте).
  // Лиды — только те, что сотруднику видны: чужие лиды не раскрываются через карточку клиента.
  for (const l of O.crm.leads) if (l.kind !== "b2b" && canSeeLead(l)) { const c = add(l.phone, l.name, l.createdAt); if (c) c.leads.push(l); }
  if (SITE?.user?.phone) add(SITE.user.phone, "", 0);
  for (const o of SITE?.orders || []) {
    const c = add(o.contact?.phone, o.travellers?.[0] ? `${o.travellers[0].given} ${o.travellers[0].surname}`.trim() : "", o.createdAt); if (!c) continue;
    c.orders.push(o);
    if (o.total && orderPaid(o) && !["CANCELLED", "REFUNDED"].includes(o.status)) { c.spent += o.total.uzs; c.paid++; c.lastPaid = Math.max(c.lastPaid || 0, o.createdAt); }
  }
  for (const [k, v] of Object.entries(O.crm.clients)) if (k.startsWith("c:") && v.phone) add(v.phone, v.name, v.at);
  return [...map.values()].map(c => {
    const d = clientData("c:" + c.key) || {};
    const src = d.source || [...c.leads].sort((a, b) => a.createdAt - b.createdAt)[0]?.source || (c.orders.length ? "site" : "other");
    // Данные CRM главнее: пустое значение, которое сотрудник поставил сам, не подменяется данными из лида.
    return { ...c, name:d.name || c.name, email:d.email !== undefined ? d.email : c.orders.find(o => o.contact?.email)?.contact.email || c.leads.find(l => l.email)?.email || "",
      country:d.country !== undefined ? d.country : c.leads.find(l => l.country)?.country || "", source:src, manager:"manager" in d ? d.manager : c.leads.find(l => l.manager)?.manager || null,
      blocked:!!d.blocked, blockReason:d.blockReason || "", segment:segmentOf({ ...c, blocked:!!d.blocked }) };
  }).sort((a, b) => b.last - a.last);
}
function segmentOf(c){
  if (c.blocked) return "blocked";
  if (c.spent >= VIP_MIN) return "vip";
  if (c.lastPaid && Date.now() - c.lastPaid < ACTIVE_DAYS * DAY_MS) return "active";
  if (c.lastPaid) return "inactive";
  return "new";
}
const clientByKey = key => b2cClients().find(c => c.key === key) || null;
/* Номера, закрытые для бронирования, — сайт читает их из BLOCK_KEY. */
const syncBlocked = () => writeJSON(BLOCK_KEY, Object.entries(O.crm.clients).filter(([k, v]) => k.startsWith("c:") && v.blocked).map(([k]) => k.slice(2)));

/* ---- комментарии и задачи ----
   target: "l:<лид>", "c:<телефон>", "a:<агентство>". */
const notesFor = targets => O.crm.notes.filter(n => targets.includes(n.target)).sort((a, b) => b.at - a.at);
const tasksFor = targets => O.crm.tasks.filter(x => targets.includes(x.target));
const dayEnd = () => new Date().setHours(23, 59, 59, 999);
/* Напоминания: открытые задачи сотрудника со сроком до конца сегодняшнего дня. */
const myReminders = () => can("crm.edit") ? O.crm.tasks.filter(x => !x.done && x.assignee === me()?.id && x.due <= dayEnd() && canSeeTarget(x.target)) : [];
const taskOverdue = x => !x.done && x.due < Date.now();
const targetLabel = target => {
  const [k, id] = [target.slice(0, 1), target.slice(2)];
  if (k === "l") { const l = leadById(id); return l ? `${l.no} · ${l.name}` : "—"; }
  if (k === "a") return agencyById(id)?.name || "—";
  return clientData(target)?.name || prettyPhone(id);
};
const targetHref = target => { const [k, id] = [target.slice(0, 1), target.slice(2)]; return k === "l" ? `#/crm/${id}` : k === "a" ? `#/agencies/${id}` : `#/customers/${id}`; };
/* Писать комментарии и ставить задачи по клиенту может CRM или менеджер пассажиров. */
const canNote = target => target.startsWith("l:") ? !!leadById(target.slice(2)) && canEditLead(leadById(target.slice(2))) : can("crm.edit") || (target.startsWith("c:") && can("b2c.edit"));

/* ---- демо ---- */
function seedCrm(o){
  const now = Date.now(), h = 3600e3, day = DAY_MS;
  const L = (spec, ago, ev = []) => { const l = newLead(o, { ...spec, createdAt:now - ago }); l.updatedAt = now - Math.min(ago, h); l.events.push(...ev); l.events.sort((a, b) => b.at - a.at); return l; };
  const st = (from, to, ago, by) => ({ at:now - ago, by, type:"status", from, to });
  L({ name:"Sherzod Aliyev", phone:"+998 93 512 44 10", source:"telegram", service:"TOUR", dest:{ code:"AYT" }, budget:2400 }, 2 * h);
  const l2 = L({ name:"Madina Xasanova", phone:"+998 94 330 18 22", email:"madina.x@gmail.com", source:"instagram", service:"TOUR", dest:{ code:"DXB" }, budget:3000, status:"contacted", manager:"st8" }, 26 * h, [st("new", "contacted", 20 * h, "st8")]);
  const l3 = L({ name:"Rustam Karimov", phone:"+998 90 187 55 01", source:"phone", service:"JET", dest:{ code:"IST" }, budget:38000, status:"progress", manager:"st8", country:"Uzbekistan" }, 3 * day,
    [st("new", "contacted", 3 * day - 2 * h, "st8"), st("contacted", "progress", 2 * day, "st8")]);
  const l4 = L({ name:"Dilfuza Yo‘ldosheva", phone:"+998 97 440 90 12", source:"whatsapp", service:"HOTEL", dest:{ code:"SSH" }, budget:1500, status:"interested", manager:"st7" }, 5 * day,
    [st("new", "contacted", 5 * day - h, "st7"), st("contacted", "interested", 3 * day, "st7")]);
  L({ name:"Oybek Rahimov", phone:"+998 99 801 23 45", source:"referral", service:"FLIGHT", dest:{ code:"DME" }, budget:400, status:"confirmed", manager:"st7" }, 8 * day,
    [st("new", "contacted", 8 * day - h, "st7"), st("contacted", "confirmed", 6 * day, "st7")]);
  L({ name:"Nargiza Tursunova", phone:"+998 91 666 72 30", source:"walk_in", service:"TOUR", dest:{ code:"AYT" }, budget:2800, status:"completed", manager:"st8" }, 40 * day,
    [st("new", "confirmed", 38 * day, "st8"), st("confirmed", "completed", 20 * day, "st8")]);
  L({ name:"Jamshid Qodirov", phone:"+998 95 210 33 44", source:"phone", service:"HELI", dest:{ code:"chimgan", heli:true }, budget:1200, status:"lost", manager:"st8",
    lostReason:{ ru:"Дорого, выбрал автомобиль", uz:"Qimmat, avtomobilni tanladi", en:"Too expensive, chose a car" } }, 12 * day, [st("new", "lost", 10 * day, "st8")]);
  L({ name:"Lola Mirzayeva", phone:"+998 90 777 14 14", email:"lola.m@mail.uz", source:"email", service:"TOUR", dest:{ ru:"Мальдивы", uz:"Maldiv orollari", en:"Maldives" }, budget:6500 }, 5 * h);
  const note = (target, kind, text, by, ago) => o.crm.notes.push({ id:uid("n"), target, kind, text, by, at:now - ago });
  note("l:" + l2.id, "call", { ru:"Позвонил: хочет Дубай на 7 ночей в ноябре, двое взрослых.", uz:"Qo‘ng‘iroq qildim: noyabrda Dubayga 7 kecha, ikki kattalar.", en:"Called: wants Dubai for 7 nights in November, two adults." }, "st8", 20 * h);
  note("l:" + l3.id, "meeting", { ru:"Встреча в офисе: рейс Ташкент — Стамбул на 6 человек, бизнес-джет.", uz:"Ofisda uchrashuv: Toshkent — Istanbul, 6 kishi, biznes-jet.", en:"Office meeting: Tashkent to Istanbul for 6 people, business jet." }, "st8", 2 * day);
  note("l:" + l4.id, "message", { ru:"Отправили три отеля в WhatsApp, ждём ответа.", uz:"WhatsApp orqali uchta mehmonxona yubordik, javob kutilmoqda.", en:"Sent three hotels on WhatsApp, waiting for a reply." }, "st7", 3 * day);
  const task = (target, text, assignee, due) => o.crm.tasks.push({ id:uid("tk"), target, text, assignee, by:assignee, at:now - day, due, done:false });
  task("l:" + l3.id, { ru:"Отправить коммерческое предложение", uz:"Tijorat taklifini yuborish", en:"Send the quote" }, "st8", new Date().setHours(17, 0, 0, 0));
  task("l:" + l4.id, { ru:"Перезвонить: решение по отелю", uz:"Qayta qo‘ng‘iroq: mehmonxona bo‘yicha qaror", en:"Call back about the hotel choice" }, "st7", now - day);
  task("l:" + l2.id, { ru:"Подобрать три отеля в Дубае", uz:"Dubayda uchta mehmonxona tanlash", en:"Pick three hotels in Dubai" }, "st8", now + 2 * day);
}
