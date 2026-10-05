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
   Проверка файла и «что изменится» — в 78b-backup-check.js.
   ========================================================================== */
"use strict";

const RESTORE_KEY = "charteri.ops.restore";
const lsRaw = k => { try { return localStorage.getItem(k); } catch(e) { return null; } };

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

/* Файл выбран: читаем и проверяем; разобранную копию держим до «Восстановить». */
document.addEventListener("change", async e => {
  if (e.target.id !== "bkfile") return;
  const f = e.target.files?.[0]; if (!f) return;
  const file = f.name.slice(0, 80);
  if (f.size > BACKUP_MAX * 3) { e.target.value = ""; M.ui.bk = { err:"err_bk_big", vars:{}, file }; rerender(); return $("#bkerr")?.focus(); }
  let text = null; try { text = await f.text(); } catch(err) { text = null; }
  e.target.value = "";
  const bk = text == null ? { err:"err_bk_json", vars:{} } : backupCheck(text);
  M.ui.bk = { ...bk, file };                             // при ok — с canon: его и восстанавливаем
  // Поле выбора файла перерисовано — фокус на кнопку «Восстановить» (если она выключена — снова на выбор файла) или на ошибку.
  rerender(); (bk.ok ? $('[data-act="sysrestore"]:not([disabled])') || $("#bkfile") : $("#bkerr"))?.focus();
});

/* ---- восстановить ----
   Основатель (или когда правила выключены) — сразу; иначе файл ложится в
   RESTORE_KEY, а решает другой сотрудник. Подтверждение нужно по правилу
   «Система», а если копия меняет деньги, цены или удаляет направления — ещё и
   по их правилам. Права автора — на каждый раздел, который копия меняет
   (BK_AREAS): как при правке вручную. */
const restoreNeedsAp = s => needsApproval("restore") || (s.areas.money && needsApproval("adjust", s.moneyMax)) || (s.areas.prices && needsApproval("pricing"))
  || (s.areas.dirsDel && needsApproval("dir_del"));
/* Отложенная копия: содержимое сайта (картинки — самая большая часть файла),
   совпадающее с текущим, не дублируется — вместо него null, при исполнении
   подставляется текущее. Изменилось за время ожидания — сумма не сойдётся. */
function bkStage(bk){
  const same = bk.raw[CMS_KEY] != null && bk.raw[CMS_KEY] === lsRaw(CMS_KEY);
  return JSON.stringify({ sum:bk.sum, env:bk.env, keys:same ? { ...bk.raw, [CMS_KEY]:null } : bk.raw, cmsSame:same, by:me().id, at:Date.now() });
}
function bkUnstage(st){
  if (typeof st?.text === "string") return st.text;              // запрос прошлой версии: файл целиком
  if (!bkObj(st) || !bkObj(st.keys)) return null;
  const keys = { ...st.keys }; if (st.cmsSame) keys[CMS_KEY] = lsRaw(CMS_KEY);
  return bkCanon(bkObj(st.env) ? st.env : {}, keys);
}
function requestRestore(){
  if (denied("settings.manage")) return;
  const bk = M.ui.bk; if (!bk?.ok) return;
  if (pendingAp("restore")) return toast(t("ap_dup"));
  const s = backupDiff(bk), lack = bkLack(s.areas, can);
  if (lack) { showErr("#bkerr", t(BK_AREAS[lack].err)); return $("#bkerr")?.focus(); }
  if (!confirm(tf("sys_bk_restore_q", { date:bk.at ? fdt(bk.at) : bk.date }))) return;
  // dh — сумма «что изменится»: подтверждают ровно то, что видели.
  const payload = { sum:bk.sum, file:bk.file, date:bk.date, money:s.money, prices:s.prices, areas:s.areas, dh:s.dh };
  if (restoreNeedsAp(s)) {
    try { localStorage.setItem(RESTORE_KEY, bkStage(bk)); }
    catch(e) { return showErr("#bkerr", t("err_bk_space")); }
    // Решающему — файл, сколько в нём агентств и заказов и что именно изменится; дата — та, что записана в самом файле.
    const vars = { file:bk.file, date:bk.date, ag:bk.counts.ag, orders:bk.counts.orders };
    if (requestApproval("restore", { key:"restore", payload, vars, diff:s.diff })) { M.ui.bk = null; rerender(); }
    return;
  }
  let err = null; change(() => { err = execRestore(payload, null, bk.canon); });
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
  // Содержимое сайта и цены — очищенные, как их пишет админка: лишние поля файла не занимают общее место.
  if (d[CMS_KEY]) out[CMS_KEY] = js(cmsClean(d[CMS_KEY]));
  if (d[PRICES_KEY]) out[PRICES_KEY] = js(pricesClean(d[PRICES_KEY]));
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
    if (!st || st.sum !== p.sum || (text = bkUnstage(st)) == null) return "ap_err_changed";
  }
  // Запрос прошлой версии хранил сумму исходного файла, новый — канонического.
  const bk = backupCheck(text); if (!bk.ok) return "err_bk_shape";
  if (bk.sum !== p.sum && seedFrom(text) !== p.sum) return "ap_err_changed";
  // Пока запрос ждал, данные изменились: копия теперь меняет другое, чем видел подтверждающий, — решать заново.
  const s = backupDiff(bk), was0 = bkAreasOf(p);
  if (Object.keys(s.areas).some(k => !was0[k]) || (p.dh != null && s.dh !== p.dh)) return "ap_err_changed";
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
    O.agencies = bo.agencies; O.crm = bkCrmOf(bo);
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
