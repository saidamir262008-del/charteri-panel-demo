/* ==========================================================================
   «Система»: резервная копия, закрытие сеанса без действий, блокировка входа
   после неверных кодов. Страница и настройки — в 78-system.js.

   Копия — JSON с сырыми строками хранилища из белого списка (BACKUP_KEYS).
   Восстановление возвращает данные бизнеса: кабинет, сайт, цены, заявки,
   направления, блокировки, содержимое сайта, системные настройки, другие
   агентства и CRM. Сотрудники, роли, правила, журнал, подтверждения и сеанс
   остаются текущими: старый файл не вернёт уволенных и старые права, а журнал
   только дописывается. Файл, ждущий подтверждения, лежит в RESTORE_KEY —
   в запросе только его контрольная сумма (копия внутри O переполнила бы хранилище).
   ========================================================================== */
"use strict";

const BACKUP_KEYS = [CAB_KEY, SITE_KEY, OPS_KEY, PRICES_KEY, APPS_KEY, DIRS_KEY, BLOCK_KEY, CMS_KEY, SYS_KEY];
const BACKUP_MAX = 4_500_000, RESTORE_KEY = "charteri.ops.restore";
const bkObj = x => !!x && typeof x === "object" && !Array.isArray(x);
/* Копия — чужой файл, а её строки попадают в разметку и ссылки (#/orders/…):
   id, номера брони и статусы — только такого вида, какой создаёт само
   приложение; деньги — целые сумы, время — в пределах Date. Баланс агентства
   равен сумме его проводок (post() в b2b/10-state.js) — иначе файл правлен руками. */
const BK_ID = /^[\w-]{1,60}$/, BK_NO = /^[A-Z0-9-]{3,24}$/, BK_WORD = /^[a-z_]{1,24}$/;
const BK_STATUS = ["NEW", "PENDING", "PAID", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"];
const bkSum = x => x == null || (bkObj(x) && Number.isFinite(x.usd) && Number.isSafeInteger(x.uzs));
const bkOrder = o => bkObj(o) && BK_ID.test(o.id) && typeof o.no === "string" && BK_NO.test(o.no) && SVC_TYPES.includes(o.type) && BK_STATUS.includes(o.status)
  && validTs(o.createdAt) && (!o.paidAt || validTs(o.paidAt)) && bkSum(o.total) && bkSum(o.fee) && bkSum(o.gross) && bkObj(o.details)
  && Array.isArray(o.travellers) && o.travellers.every(bkObj) && (o.history == null || (Array.isArray(o.history) && o.history.every(h => bkObj(h) && BK_STATUS.includes(h.s) && validTs(h.at))));
const bkLedger = l => bkObj(l) && BK_ID.test(l.id) && BK_WORD.test(l.kind) && Number.isSafeInteger(l.amount) && validTs(l.at) && (l.orderId == null || BK_ID.test(l.orderId));
const bkTopup = p => bkObj(p) && BK_ID.test(p.id) && Number.isSafeInteger(p.amount) && validTs(p.at) && BK_WORD.test(p.status);
const bkCredit = a => a.credit == null || (Number.isSafeInteger(a.credit) && a.credit >= 0);
const bkAgency = x => bkObj(x.agency) && BK_WORD.test(x.agency.status) && bkCredit(x.agency) && Number.isSafeInteger(x.balance)
  && Array.isArray(x.ledger) && x.ledger.every(bkLedger) && x.ledger.reduce((s, l) => s + l.amount, 0) === x.balance
  && Array.isArray(x.orders) && x.orders.every(bkOrder) && Array.isArray(x.topups) && x.topups.every(bkTopup);
/* Проверка каждого ключа копии. */
const BK_CHECK = {
  [CAB_KEY]:    x => x?.v === 1 && bkAgency(x),
  [SITE_KEY]:   x => x?.v === 1 && Array.isArray(x.orders) && x.orders.every(bkOrder) && (x.user == null || (bkObj(x.user) && typeof x.user.phone === "string")),
  [OPS_KEY]:    x => x?.v === 1 && Array.isArray(x.agencies) && Array.isArray(x.staff) && (x.crm == null || bkObj(x.crm))
                  && x.agencies.every(a => bkObj(a) && BK_ID.test(a.id) && a.id !== LIVE_ID && bkAgency(a)),
  [PRICES_KEY]: bkObj,
  [APPS_KEY]:   x => Array.isArray(x) && x.every(a => bkObj(a) && BK_ID.test(a.id)),
  [DIRS_KEY]:   x => Array.isArray(x),
  [BLOCK_KEY]:  x => Array.isArray(x) && x.every(v => typeof v === "string" && /^\d{9,15}$/.test(v)),
  [CMS_KEY]:    x => !!cmsClean(x),
  [SYS_KEY]:    x => x?.v === 1
};

/* ---- скачать ---- */
function downloadBackup(){
  if (denied("settings.export")) return;
  const keys = {};
  for (const k of BACKUP_KEYS) { let v = null; try { v = localStorage.getItem(k); } catch(e) {} if (v != null) keys[k] = v; }
  const text = JSON.stringify({ kind:"charteri-backup", v:1, at:Date.now(), by:me().name, keys });
  const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(new Blob([text], { type:"application/json" })), download:`charteri-backup-${tzToday()}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  change(() => audit("sys_backup", { kb:Math.ceil(text.length / 1024) }, { module:"settings" }));
}

/* ---- проверить файл ----
   Порядок: размер → JSON → форма → чужие ключи → обязательные ключи → каждый
   ключ. Ответ — сводка для предпросмотра (data — разобранные ключи) или { err, vars }. */
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
  const ops = data[OPS_KEY], at = validTs(f.at) ? f.at : 0, p = at ? tzParts(at) : null;
  const orders = data[CAB_KEY].orders.length + ops.agencies.reduce((n, a) => n + a.orders.length, 0) + (data[SITE_KEY]?.orders.length || 0);
  return { ok:true, sum:seedFrom(text), at, date:p ? `${tzYmd(at)} ${p.h}:${p.mi}` : "—", by:typeof f.by === "string" ? f.by.slice(0, 80) : "",
    counts:{ ag:ops.agencies.length + 1, orders, staff:ops.staff.length }, kb:Math.ceil(text.length / 1024), data };
}
/* Что копия изменит против текущих данных: строки «было → стало» для запроса и
   журнала; money — меняются балансы или кредитные лимиты (moneyMax — наибольшее
   изменение, для порога правила), prices — меняются цены. От них зависят права
   и правила подтверждения: восстановление не обходит «Финансы» и «Цены». */
function backupDiff(bk){
  const d = bk.data, out = [], row = (k, from, to, sub) => out.push({ k, from, to, ...(sub ? { sub } : {}) });
  const agOf = (id, st) => ({ id, name:st.agency?.name || id, bal:st.balance, credit:creditOf(st), active:st.agency?.status !== "blocked" });
  const cur = agencies().map(a => agOf(a.id, a.st)), next = [agOf(LIVE_ID, d[CAB_KEY]), ...d[OPS_KEY].agencies.map(a => agOf(a.id, a))];
  let money = false, moneyMax = 0;
  if (cur.length !== next.length) row("bk_d_agencies", String(cur.length), String(next.length));
  for (const id of new Set([...cur, ...next].map(a => a.id))) {
    const x = cur.find(a => a.id === id), y = next.find(a => a.id === id), name = (y || x).name;
    for (const [k, f] of [["bk_d_balance", "bal"], ["bk_d_credit", "credit"]]) {
      const a = x?.[f] || 0, b = y?.[f] || 0; if (a === b) continue;
      row(k, x ? uzsRef(a) : "", y ? uzsRef(b) : "", name); money = true; moneyMax = Math.max(moneyMax, Math.abs(b - a));
    }
    if (x && y && x.active !== y.active) row("col_status", strRef(x.active ? "ag_active" : "agency_blocked"), strRef(y.active ? "ag_active" : "agency_blocked"), name);
  }
  const nOrders = allOrders().length; if (nOrders !== bk.counts.orders) row("bk_d_orders", String(nOrders), String(bk.counts.orders));
  const pr = configDiff(prices(), pricesClean(d[PRICES_KEY] || {})); out.push(...pr);
  const sc = sysCfg(), sn = sysClean(d[SYS_KEY] ?? null);
  for (const part of Object.keys(SYS_PARTS)) out.push(...sysDiff(part, sc[part], sn[part]));
  const same = (k, v) => JSON.stringify(readJSON(k, null)) === JSON.stringify(v ?? null);
  if (!same(DIRS_KEY, d[DIRS_KEY])) row("bk_d_dirs", String(loadDirections().length), String((d[DIRS_KEY] || []).filter(validDirection).length));
  if (!same(CMS_KEY, d[CMS_KEY])) row("bk_d_cms", "", strRef("bk_d_replaced"));
  return { diff:out, money, moneyMax, prices:pr.length > 0 };
}
/* Файл выбран: читаем и проверяем; сам текст держим до «Восстановить». */
document.addEventListener("change", async e => {
  if (e.target.id !== "bkfile") return;
  const f = e.target.files?.[0]; if (!f) return;
  const file = f.name.slice(0, 80);
  if (f.size > BACKUP_MAX * 3) { e.target.value = ""; M.ui.bk = { err:"err_bk_big", vars:{}, file }; rerender(); return $("#bkerr")?.focus(); }
  let text = null; try { text = await f.text(); } catch(err) { text = null; }
  e.target.value = "";
  const bk = text == null ? { err:"err_bk_json", vars:{} } : backupCheck(text);
  M.ui.bk = bk.ok ? { ...bk, text, file } : { ...bk, file };
  // Поле выбора файла перерисовано — фокус на кнопку «Восстановить» (если она выключена — снова на выбор файла) или на ошибку.
  rerender(); (bk.ok ? $('[data-act="sysrestore"]:not([disabled])') || $("#bkfile") : $("#bkerr"))?.focus();
});

/* ---- восстановить ----
   Основатель (или когда правила выключены) — сразу; иначе файл ложится в
   RESTORE_KEY, а решает другой сотрудник. Подтверждение нужно по правилу
   «Система», а если копия меняет деньги или цены — ещё и по их правилам. */
const restoreNeedsAp = s => needsApproval("restore") || (s.money && needsApproval("adjust", s.moneyMax)) || (s.prices && needsApproval("pricing"));
function requestRestore(){
  if (denied("settings.manage")) return;
  const bk = M.ui.bk; if (!bk?.ok) return;
  if (pendingAp("restore")) return toast(t("ap_dup"));
  const s = backupDiff(bk);
  const lack = s.money && !can("finance.manage") ? "err_bk_money" : s.prices && !can("pricing.edit") ? "err_bk_prices" : null;
  if (lack) { showErr("#bkerr", t(lack)); return $("#bkerr")?.focus(); }
  if (!confirm(tf("sys_bk_restore_q", { date:bk.at ? fdt(bk.at) : bk.date }))) return;
  const payload = { sum:bk.sum, file:bk.file, date:bk.date, money:s.money, prices:s.prices };
  if (restoreNeedsAp(s)) {
    try { localStorage.setItem(RESTORE_KEY, JSON.stringify({ sum:bk.sum, text:bk.text, by:me().id, at:Date.now() })); }
    catch(e) { return showErr("#bkerr", t("err_bk_space")); }
    // Решающему — файл, сколько в нём агентств и заказов и что именно изменится; дата — та, что записана в самом файле.
    const vars = { file:bk.file, date:bk.date, ag:bk.counts.ag, orders:bk.counts.orders };
    if (requestApproval("restore", { key:"restore", payload, vars, diff:s.diff })) { M.ui.bk = null; rerender(); }
    return;
  }
  let err = null; change(() => { err = execRestore(payload, null, bk.text); });
  M.ui = {}; rerender(); toast(err ? t(err) : t("t_restored"));
}
/* Откат записанных ключей (snap — их прежние значения): сначала убрать все
   (освобождает место), потом вернуть прежнее. false — вернуть удалось не всё. */
function bkRollback(snap){
  let ok = true;
  for (const k of Object.keys(snap)) try { localStorage.removeItem(k); } catch(e) { ok = false; }
  for (const [k, v] of Object.entries(snap)) if (v != null) try { localStorage.setItem(k, v); } catch(e) { ok = false; }
  return ok;
}
/* Что писать по каждому ключу (null — удалить). Пишется разобранное и
   проверенное, а не строка из файла. Обслуживание включилось или выключилось —
   с временем и именем того, кто восстановил, а не автора копии. */
function bkWrites(bk){
  const d = bk.data, out = {}, js = v => v == null ? null : JSON.stringify(v);
  for (const k of BACKUP_KEYS) out[k] = js(d[k]);
  if (d[DIRS_KEY]) out[DIRS_KEY] = js(d[DIRS_KEY].filter(validDirection));
  const sc = sysCfg(), sn = sysClean(d[SYS_KEY] ?? null);
  sn.maint = sn.maint.on !== sc.maint.on ? { ...sn.maint, at:Date.now(), by:me().name } : { ...sn.maint, at:sc.maint.at, by:sc.maint.by };
  out[SYS_KEY] = SYS_KEY in d || sc.maint.on ? js(sn) : null;
  return out;
}
/* Исполнитель (см. 17-approvals.js): работает внутри change(), сам его не
   вызывает. crmSync() тоже нельзя — он перечитал бы O и потерял восстановленное.
   Все ключи, включая саму админку, пишутся в одном блоке: любая ошибка (нет
   места, сбой в данных) откатывает всё, и половины восстановления не остаётся. */
function execRestore(p, ap, text = null){
  if (text == null) {
    const st = readJSON(RESTORE_KEY, null);
    if (!st || st.sum !== p.sum || typeof st.text !== "string") return "ap_err_changed";
    text = st.text;
  }
  if (seedFrom(text) !== p.sum) return "ap_err_changed";
  const bk = backupCheck(text); if (!bk.ok) return "err_bk_shape";
  // Пока запрос ждал, данные изменились так, что копия теперь трогает деньги или цены, — решать заново.
  const s = backupDiff(bk); if ((s.money && !p.money) || (s.prices && !p.prices)) return "ap_err_changed";
  // Отложенная копия больше не нужна — и освобождает место под запись.
  try { localStorage.removeItem(RESTORE_KEY); } catch(e) {}
  const snap = Object.fromEntries(BACKUP_KEYS.map(k => { try { return [k, localStorage.getItem(k)]; } catch(e) { return [k, null]; } }));
  const was = { agencies:O.agencies, crm:O.crm, audit:O.audit.slice(), rev:O.rev };
  const reload = () => { PRICES = CMS_CACHE = SYS_CACHE = TZF = null; applyDirections(); S = loadState() || S; adminPrefs(); SITE = loadSite(); };
  const done = [];                                       // ключи, которые уже переписаны: откатываются только они
  try {
    const w = bkWrites(bk);
    for (const k of BACKUP_KEYS) if (k !== OPS_KEY) { if (w[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, w[k]); done.push(k); }
    const bo = bk.data[OPS_KEY];
    O.agencies = bo.agencies; O.crm = migrateCrm({ crm:bo.crm }).crm;
    reload(); syncCrm(false); syncBlocked();
    audit("sys_restore", { date:bk.date, file:p.file || "" }, { module:"settings", diff:s.diff });
    // Запрос в записанной копии — уже исполненный: change() допишет его ещё раз, но и без того хранилище цело.
    O.rev = (O.rev || 0) + 1;
    const now = Date.now(), approvals = ap ? O.approvals.map(x => x.id === ap.id ? { ...x, status:"executed", decidedBy:me().id, decidedAt:now, error:"" } : x) : O.approvals;
    localStorage.setItem(OPS_KEY, JSON.stringify({ ...O, approvals }));
  } catch(e) {
    Object.assign(O, was);
    const ok = bkRollback(Object.fromEntries(done.map(k => [k, snap[k]]))); reload();
    return ok ? "err_bk_write" : "err_bk_rollback";
  }
  return null;
}
/* Запроса на восстановление больше нет (решён, отозван) — отложенный файл не храним. */
function restoreCleanup(){ if (!pendingAp("restore")) try { localStorage.removeItem(RESTORE_KEY); } catch(e) {} }
Object.assign(ACT, {
  sysbk:      () => downloadBackup(),
  sysrestore: () => requestRestore(),
  sysbkx:     () => { M.ui.bk = null; rerender(); $("#bkfile")?.focus(); }
});

/* ---- сеанс без действий ----
   Отметка активности общая для всех вкладок админки и пишется не чаще раза
   в 15 секунд. Дольше, чем разрешено в «Системе», без действий — выход. */
const IDLE_KEY = "charteri.ops.active", IDLE_EVERY_MS = 15000;
let idleLast = 0;
function idleTouch(force = false){
  const now = Date.now(); if (!force && now - idleLast < IDLE_EVERY_MS) return;
  idleLast = now; try { localStorage.setItem(IDLE_KEY, String(now)); } catch(e) {}
}
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(ev, () => idleTouch(), { capture:true, passive:true });
/* true — сеанс закрыт. Отметки нет (старая админка, сброс) — считаем, что активен сейчас. */
function idleCheck(){
  const u = me(), min = sysCfg().sec.idle; if (!u || !min) return false;
  let last = 0; try { last = Number(localStorage.getItem(IDLE_KEY)) || 0; } catch(e) {}
  if (!last) { idleTouch(true); return false; }
  if (Date.now() - last < min * 60000) return false;
  change(() => { if (O.session?.staffId !== u.id) return; audit("timeout", { name:u.name, min }, { module:"session" }); O.session = null; });
  stopHeartbeat(); M.ui = { aStep:"phone" }; toast(t("t_timeout")); go("");
  return true;
}
setInterval(idleCheck, IDLE_EVERY_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") idleCheck(); });

/* ---- блокировка входа: { [цифры номера]: { n — неверных подряд, until — до когда закрыт } } ---- */
const OTP_KEY = "charteri.ops.otp";
function otpAll(){ const m = readJSON(OTP_KEY, {}); return bkObj(m) ? m : {}; }
function otpState(phone){ const x = otpAll()[digits(phone)]; return bkObj(x) && Number.isInteger(x.n) && Number.isFinite(x.until) ? x : null; }
function otpSet(phone, x){ const k = digits(phone); if (!k) return; const m = otpAll(); if (x) m[k] = x; else delete m[k]; writeJSON(OTP_KEY, m); }
/* Сколько минут ещё закрыт вход (0 — открыт). */
function otpLockedMin(phone){ const x = otpState(phone), left = x ? x.until - Date.now() : 0; return left > 0 ? Math.ceil(left / 60000) : 0; }
