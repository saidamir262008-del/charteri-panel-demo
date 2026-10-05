/* ==========================================================================
   Резервная копия: проверка файла и что он изменит. Скачивание, запрос,
   восстановление — в 79-system-ops.js.

   Копия — чужой файл, а её строки попадают в разметку и ссылки (#/orders/…).
   Поэтому каждое поле, которое где-то выводится, — только такого вида, какой
   создаёт само приложение: id, номера брони и статусы; коды аэропортов, даты и
   время в деталях заказа; деньги — целые сумы, время — в пределах Date.
   Баланс агентства равен сумме его проводок (post() в b2b/10-state.js) —
   иначе файл правлен руками. И последнее: каждый заказ копии должен
   нарисоваться (заголовок, строки чека, документ) — запись, на которой
   страница упала бы, не пройдёт в хранилище.
   ========================================================================== */
"use strict";

const BACKUP_KEYS = [CAB_KEY, SITE_KEY, OPS_KEY, PRICES_KEY, APPS_KEY, DIRS_KEY, BLOCK_KEY, CMS_KEY, SYS_KEY];
const BACKUP_MAX = 4_500_000;
const bkObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const BK_ID = /^[\w-]{1,60}$/, BK_NO = /^[A-Z0-9-]{3,24}$/, BK_WORD = /^[a-z_]{1,24}$/;
const BK_IATA = /^[A-Z]{3}$/, BK_DATE = /^\d{4}-\d{2}-\d{2}$/, BK_HM = /^\d{2}:\d{2}$/, BK_FNO = /^[A-Z0-9]{2,3}-\d{1,4}$/;
const BK_TARGET = /^[a-z]:[\w-]{1,60}$/;
const BK_STATUS = ["NEW", "PENDING", "PAID", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"];
const bkStr = (v, re) => typeof v === "string" && re.test(v);
const bkInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const bkSum = x => x == null || (bkObj(x) && Number.isFinite(x.usd) && Number.isSafeInteger(x.uzs));
const bkText = (v, max) => v == null || (typeof v === "string" && v.length <= max);
/* Строки деталей заказа берутся из каталога и поиска — в них не бывает
   разметки и кавычек. Дерево из чисел, булевых и таких строк: даже там, где
   вывод забыли экранировать, файл не вставит свой тег или атрибут. */
const BK_TXT = /^[^<>"`]{0,200}$/;
function bkPlain(x, depth = 0){
  if (x == null || typeof x === "boolean") return true;
  if (typeof x === "number") return Number.isFinite(x);
  if (typeof x === "string") return BK_TXT.test(x);
  if (depth > 3 || typeof x !== "object") return false;
  const vals = Array.isArray(x) ? x : Object.values(x);
  return vals.length <= 40 && (Array.isArray(x) || Object.keys(x).every(k => /^\w{1,30}$/.test(k))) && vals.every(v => bkPlain(v, depth + 1));
}

/* ---- детали заказа по типу: всё, что читают заголовок, чек и документ ---- */
const bkLeg = l => bkObj(l) && bkStr(l.from, BK_IATA) && bkStr(l.to, BK_IATA) && bkStr(l.date, BK_DATE) && bkStr(l.depTime, BK_HM) && bkStr(l.arrTime, BK_HM)
  && bkStr(l.flightNo, BK_FNO) && Number.isFinite(l.priceUSD) && Number.isSafeInteger(l.priceUZS) && bkInt(l.durationMin, 0, 6000) && bkPlain(l);
const bkPax = d => bkInt(d.adults, 0, 9) && bkInt(d.children, 0, 9) && d.adults + d.children > 0;
const bkCharter = d => ["jet", "heli"].includes(d.kind) && bkStr(d.from, BK_IATA) && bkStr(d.to, d.kind === "jet" ? BK_IATA : /^[a-z0-9_-]{2,30}$/)
  && bkStr(d.date, BK_DATE) && bkStr(d.time, BK_HM) && bkInt(d.pax, 1, 30) && ["oneway", "roundtrip"].includes(d.trip) && Number.isFinite(d.hours)
  && [d.low, d.high, d.quote].every(x => x && bkSum(x)) && bkText(d.note, 1000) && bkPlain({ ...d, note:null });
const BK_DETAILS = {
  FLIGHT: d => bkLeg(d.out) && (d.back == null || bkLeg(d.back)) && bkObj(d.q) && bkPax(d.q) && bkInt(d.q.infants, 0, 9) && bkPlain(d.q),
  TOUR:   d => bkStr(d.hotelId, BK_ID) && bkStr(d.to, BK_IATA) && bkStr(d.depart, BK_DATE) && bkInt(d.nights, 1, 60) && bkPax(d) && bkInt(d.rooms, 1, 9)
                && bkLeg(d.out) && bkLeg(d.back) && (d.px == null || bkPlain(d.px)),
  HOTEL:  d => bkStr(d.hotelId, BK_ID) && ROOM_TYPES.some(r => r.id === d.room) && bkStr(d.checkin, BK_DATE) && bkStr(d.checkout, BK_DATE)
                && bkInt(d.nights, 1, 60) && bkPax(d) && bkInt(d.rooms, 1, 9),
  JET:    d => d.kind === "jet" && bkCharter(d),
  HELI:   d => d.kind === "heli" && bkCharter(d)
};
/* Путешественник заказа и клиент агентства: строки ограниченной длины (их
   выводят через esc), id клиента — как у приложения. */
const bkPerson = x => bkObj(x) && Object.values(x).every(v => v == null || typeof v === "boolean" || (typeof v === "string" && v.length <= 120));
const bkClient = c => bkPerson(c) && bkStr(c.id, BK_ID);
const bkRefund = r => r == null || (bkObj(r) && Number.isSafeInteger(r.uzs) && validTs(r.at) && (r.penalty == null || Number.isSafeInteger(r.penalty)) && (r.rate == null || Number.isFinite(r.rate)));
/* Заказ рисуется: заголовок, подзаголовок, чек, документ. Упал — запись битая. */
function bkRenders(o){
  try { orderTitle(o); orderSub(o); orderLines(o); orderDocument(o, null); if (isCharter(o)) charterVoucherBody(o); return true; }
  catch(e) { return false; }
}
const bkOrder = o => bkObj(o) && BK_ID.test(o.id) && typeof o.no === "string" && BK_NO.test(o.no) && SVC_TYPES.includes(o.type) && BK_STATUS.includes(o.status)
  && validTs(o.createdAt) && (!o.paidAt || validTs(o.paidAt)) && bkSum(o.total) && bkSum(o.fee) && bkSum(o.gross) && bkObj(o.details) && BK_DETAILS[o.type](o.details)
  && bkStr(o.start, BK_DATE) && bkStr(o.end, BK_DATE) && bkText(o.title, 300) && bkText(o.sub, 300)
  && (o.clientId == null || bkStr(o.clientId, BK_ID)) && (o.method == null || bkStr(o.method, BK_WORD)) && bkRefund(o.refund)
  && bkObj(o.contact) && bkText(o.contact.phone, 40) && bkText(o.contact.email, 120)
  && Array.isArray(o.travellers) && o.travellers.length > 0 && o.travellers.length <= 20 && o.travellers.every(bkPerson)
  && (o.history == null || (Array.isArray(o.history) && o.history.every(h => bkObj(h) && BK_STATUS.includes(h.s) && validTs(h.at))));
const bkLedger = l => bkObj(l) && BK_ID.test(l.id) && BK_WORD.test(l.kind) && Number.isSafeInteger(l.amount) && validTs(l.at) && (l.orderId == null || BK_ID.test(l.orderId));
const bkTopup = p => bkObj(p) && BK_ID.test(p.id) && Number.isSafeInteger(p.amount) && validTs(p.at) && BK_WORD.test(p.status);
const bkNote = n => bkObj(n) && BK_WORD.test(n.kind) && (n.orderId == null || BK_ID.test(n.orderId)) && (n.amount == null || Number.isSafeInteger(n.amount)) && bkText(n.reason, 300);
const bkCredit = a => a.credit == null || (Number.isSafeInteger(a.credit) && a.credit >= 0);
const bkList = (v, f) => v == null || (Array.isArray(v) && v.every(f));
const bkAgency = x => bkObj(x.agency) && BK_WORD.test(x.agency.status) && bkCredit(x.agency) && Number.isSafeInteger(x.balance)
  && Array.isArray(x.ledger) && x.ledger.every(bkLedger) && x.ledger.reduce((s, l) => s + l.amount, 0) === x.balance
  && Array.isArray(x.orders) && x.orders.every(bkOrder) && Array.isArray(x.topups) && x.topups.every(bkTopup)
  && bkList(x.notes, bkNote) && bkList(x.travellers, bkClient);
/* CRM: id лидов, задач и комментариев попадают в ссылки и data-атрибуты. */
const bkCrm = c => c == null || (bkObj(c)
  && bkList(c.leads, l => bkObj(l) && BK_ID.test(l.id) && (l.no == null || bkStr(l.no, BK_NO)) && (l.manager == null || bkStr(l.manager, BK_ID))
    && bkList(l.links, x => bkObj(x) && bkStr(x.src, /^[a-z]{1,12}$/) && bkStr(x.id, BK_ID)))
  && bkList(c.tasks, x => bkObj(x) && BK_ID.test(x.id) && (x.target == null || bkStr(x.target, BK_TARGET)))
  && bkList(c.notes, x => bkObj(x) && BK_ID.test(x.id) && (x.target == null || bkStr(x.target, BK_TARGET)))
  && (c.clients == null || (bkObj(c.clients) && Object.keys(c.clients).every(k => BK_TARGET.test(k)))));
/* Проверка каждого ключа копии. */
const BK_CHECK = {
  [CAB_KEY]:    x => x?.v === 1 && bkAgency(x),
  [SITE_KEY]:   x => x?.v === 1 && Array.isArray(x.orders) && x.orders.every(bkOrder) && bkList(x.travellers, bkClient)
                  && (x.user == null || (bkObj(x.user) && typeof x.user.phone === "string")),
  [OPS_KEY]:    x => x?.v === 1 && Array.isArray(x.agencies) && Array.isArray(x.staff) && bkCrm(x.crm)
                  && x.agencies.every(a => bkObj(a) && BK_ID.test(a.id) && a.id !== LIVE_ID && bkAgency(a)),
  [PRICES_KEY]: bkObj,
  [APPS_KEY]:   x => Array.isArray(x) && x.every(a => bkObj(a) && BK_ID.test(a.id)),
  [DIRS_KEY]:   x => Array.isArray(x),
  [BLOCK_KEY]:  x => Array.isArray(x) && x.every(v => typeof v === "string" && /^\d{9,15}$/.test(v)),
  // Очищенное содержимое — в пределе CMS_MAX, как при записи из админки.
  [CMS_KEY]:    x => { const c = cmsClean(x); return !!c && JSON.stringify(c).length <= CMS_MAX; },
  [SYS_KEY]:    x => x?.v === 1
};
/* Файл без пробелов и переносов: его контрольная сумма — та, что в запросе. */
const bkCanon = (env, keys) => JSON.stringify({ kind:"charteri-backup", v:1, at:env.at, by:env.by, keys });

/* ---- проверить файл ----
   Порядок: размер → JSON → форма → чужие ключи → обязательные ключи → каждый
   ключ → каждый заказ рисуется. Ответ — сводка для предпросмотра (data —
   разобранные ключи, raw — их строки, canon — файл в каноническом виде)
   или { err, vars }. */
function backupCheck(text){
  const fail = (err, vars = {}) => ({ err, vars });
  if (typeof text !== "string" || text.length > BACKUP_MAX) return fail("err_bk_big");
  let f; try { f = JSON.parse(text); } catch(e) { return fail("err_bk_json"); }
  if (!bkObj(f) || f.kind !== "charteri-backup" || f.v !== 1 || !bkObj(f.keys)) return fail("err_bk_shape");
  const foreign = Object.keys(f.keys).find(k => !BACKUP_KEYS.includes(k));
  if (foreign) return fail("err_bk_foreign", { key:foreign.slice(0, 60) });
  if (!(OPS_KEY in f.keys) || !(CAB_KEY in f.keys)) return fail("err_bk_shape");
  const data = {};
  for (const [k, raw] of Object.entries(f.keys)) {
    let x; try { x = typeof raw === "string" ? JSON.parse(raw) : undefined; } catch(e) { x = undefined; }
    if (x === undefined || !BK_CHECK[k](x)) return fail("err_bk_key", { key:k });
    data[k] = x;
  }
  const ops = data[OPS_KEY];
  for (const [k, list] of [[CAB_KEY, data[CAB_KEY].orders], [OPS_KEY, ops.agencies.flatMap(a => a.orders)], [SITE_KEY, data[SITE_KEY]?.orders || []]])
    if (!list.every(bkRenders)) return fail("err_bk_key", { key:k });
  const at = validTs(f.at) ? f.at : 0, p = at ? tzParts(at) : null, canon = bkCanon({ at:f.at, by:f.by }, f.keys);
  const orders = data[CAB_KEY].orders.length + ops.agencies.reduce((n, a) => n + a.orders.length, 0) + (data[SITE_KEY]?.orders.length || 0);
  return { ok:true, sum:seedFrom(canon), canon, raw:f.keys, env:{ at:f.at, by:f.by }, at, date:p ? `${tzYmd(at)} ${p.h}:${p.mi}` : "—", by:typeof f.by === "string" ? f.by.slice(0, 80) : "",
    counts:{ ag:ops.agencies.length + 1, orders, staff:ops.staff.length }, kb:Math.ceil(text.length / 1024), data };
}

/* ---- что копия изменит ----
   Разделы, которые копия трогает, и права на них: восстановление не обходит
   ни одно правило, которое действует при правке вручную. need — право автора
   запроса, ap — право того, кто подтверждает (кроме «Система»). */
const BK_AREAS = {
  money:   { need:"finance.manage",  ap:"finance.approve",  err:"err_bk_money" },
  prices:  { need:"pricing.edit",    ap:"pricing.approve",  err:"err_bk_prices" },
  dirs:    { need:"services.edit",   ap:null,               err:"err_bk_dirs" },
  dirsDel: { need:"services.delete", ap:"services.approve", err:"err_bk_dirs" },
  cms:     { need:"content.manage",  ap:null,               err:"err_bk_cms" },
  crm:     { need:"crm.edit",        ap:null,               err:"err_bk_crm" },
  crmDel:  { need:"crm.delete",      ap:null,               err:"err_bk_crm" },
  blocks:  { need:"b2c.manage",      ap:null,               err:"err_bk_blocks" },
  ag:      { need:"b2b.manage",      ap:null,               err:"err_bk_ag" }
};
/* Разделы запроса; у запросов прошлой версии — только деньги и цены. */
const bkAreasOf = p => p?.areas || { money:!!p?.money, prices:!!p?.prices };
const bkLack = (areas, has) => Object.keys(BK_AREAS).find(k => areas[k] && !has(BK_AREAS[k].need)) || null;
const bkApPerms = areas => Object.keys(BK_AREAS).filter(k => areas[k] && BK_AREAS[k].ap).map(k => BK_AREAS[k].ap);

/* Деньги заказа: оплачен ли, сумма, отменён ли, возврат. Смена любого из них —
   деньги: копия, где возврат по карте ещё не сделан, вернула бы заказ под второй возврат. */
const BK_PAID = ["PAID", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"];
const bkMoneySig = o => JSON.stringify([!!o.paidAt || BK_PAID.includes(o.status), o.total?.uzs ?? null, ["CANCELLED", "REFUNDED"].includes(o.status), o.refund ? [!!o.refund.done, o.refund.uzs] : null]);
const bkOrderMoney = o => Math.max(o.total?.uzs || 0, o.refund?.uzs || 0);
function bkOrdersDiff(d, row){
  const key = (src, o) => src + ":" + o.id;
  const cur = new Map(allOrders().map(r => [key(r.src, r.o), r.o]));
  const next = new Map([...d[CAB_KEY].orders.map(o => [key(LIVE_ID, o), o]), ...d[OPS_KEY].agencies.flatMap(a => a.orders.map(o => [key(a.id, o), o])),
    ...(d[SITE_KEY]?.orders || []).map(o => [key("site", o), o])]);
  let money = false, max = 0, shown = 0;
  const paid = o => !!o && JSON.parse(bkMoneySig(o))[0];
  for (const k of new Set([...cur.keys(), ...next.keys()])) {
    const x = cur.get(k), y = next.get(k);
    if (x && y ? bkMoneySig(x) === bkMoneySig(y) : !paid(x || y)) continue;
    money = true; max = Math.max(max, Math.abs(bkOrderMoney(y || {}) - bkOrderMoney(x || {})), x?.refund?.uzs || 0, y?.refund?.uzs || 0);
    // Строк — не больше десяти: остальное видно по числу заказов.
    if (shown++ < 10) row("bk_d_order", x ? strRef("st_" + x.status) : "", y ? strRef("st_" + y.status) : "", (x || y).no);
  }
  return { money, max };
}
/* CRM: лиды, задачи и комментарии — по id и стадии; блокировки клиентов — по номерам. */
const bkCrmIds = c => ({ leads:c.leads.map(l => l.id + ":" + l.status + ":" + (l.manager || "")), tasks:c.tasks.map(x => x.id + ":" + !!x.done), notes:c.notes.map(x => x.id),
  blocked:Object.entries(c.clients).filter(([k, v]) => k.startsWith("c:") && v?.blocked).map(([k]) => k).sort() });
/* CRM из копии — как её запишет восстановление. Копия без CRM — пустая CRM, а
   не демо-лиды: у демо каждый раз новые id, и сравнение «было → стало» плыло бы. */
const bkCrmOf = bo => migrateCrm({ crm:bkObj(bo.crm) ? bo.crm : {} }).crm;
const bkGone = (a, b) => a.some(x => !b.includes(x.split(":")[0]));
function backupDiff(bk){
  const d = bk.data, out = [], row = (k, from, to, sub) => out.push({ k, from, to, ...(sub ? { sub } : {}) });
  const areas = {};
  const agOf = (id, st) => ({ id, name:st.agency?.name || id, bal:st.balance, credit:creditOf(st), active:st.agency?.status !== "blocked" });
  const cur = agencies().map(a => agOf(a.id, a.st)), next = [agOf(LIVE_ID, d[CAB_KEY]), ...d[OPS_KEY].agencies.map(a => agOf(a.id, a))];
  let moneyMax = 0;
  if (cur.length !== next.length) { row("bk_d_agencies", String(cur.length), String(next.length)); areas.ag = true; }
  for (const id of new Set([...cur, ...next].map(a => a.id))) {
    const x = cur.find(a => a.id === id), y = next.find(a => a.id === id), name = (y || x).name;
    for (const [k, f] of [["bk_d_balance", "bal"], ["bk_d_credit", "credit"]]) {
      const a = x?.[f] || 0, b = y?.[f] || 0; if (a === b) continue;
      row(k, x ? uzsRef(a) : "", y ? uzsRef(b) : "", name); areas.money = true; moneyMax = Math.max(moneyMax, Math.abs(b - a));
    }
    if (x && y && x.active !== y.active) { row("col_status", strRef(x.active ? "ag_active" : "agency_blocked"), strRef(y.active ? "ag_active" : "agency_blocked"), name); areas.ag = true; }
  }
  const nOrders = allOrders().length; if (nOrders !== bk.counts.orders) row("bk_d_orders", String(nOrders), String(bk.counts.orders));
  const om = bkOrdersDiff(d, row); if (om.money) { areas.money = true; moneyMax = Math.max(moneyMax, om.max); }
  const pr = configDiff(prices(), pricesClean(d[PRICES_KEY] || {})); out.push(...pr); areas.prices = pr.length > 0;
  const sc = sysCfg(), sn = sysClean(d[SYS_KEY] ?? null);
  for (const part of Object.keys(SYS_PARTS)) out.push(...sysDiff(part, sc[part], sn[part]));
  // Направления: удалённое копией — как удаление вручную (право и правило «Удаление»).
  const dc = loadDirections(), dn = (d[DIRS_KEY] || []).filter(validDirection), js = v => JSON.stringify(v ?? null);
  if (js(dc) !== js(dn)) { row("bk_d_dirs", String(dc.length), String(dn.length)); areas.dirs = true; areas.dirsDel = dc.some(x => !dn.some(y => y.iata === x.iata)); }
  if (js(cmsClean(readJSON(CMS_KEY, null))) !== js(d[CMS_KEY] ? cmsClean(d[CMS_KEY]) : null)) { row("bk_d_cms", "", strRef("bk_d_replaced")); areas.cms = true; }
  const ca = bkCrmIds(O.crm), cb = bkCrmIds(bkCrmOf(d[OPS_KEY]));
  if (js([ca.leads, ca.tasks, ca.notes]) !== js([cb.leads, cb.tasks, cb.notes])) {
    row("bk_d_leads", String(ca.leads.length), String(cb.leads.length)); areas.crm = true;
    const ids = l => l.map(x => x.split(":")[0]);
    areas.crmDel = bkGone(ca.leads, ids(cb.leads)) || bkGone(ca.tasks, ids(cb.tasks)) || bkGone(ca.notes, cb.notes);
  }
  if (js(ca.blocked) !== js(cb.blocked)) { row("bk_d_blocks", String(ca.blocked.length), String(cb.blocked.length)); areas.blocks = true; }
  for (const k of Object.keys(areas)) if (!areas[k]) delete areas[k];
  return { diff:out, areas, moneyMax, money:!!areas.money, prices:!!areas.prices, dh:seedFrom(JSON.stringify(out)) };
}
