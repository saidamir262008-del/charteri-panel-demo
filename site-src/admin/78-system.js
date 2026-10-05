/* ==========================================================================
   «Система»: настройки сайта, кабинета и админки из ТЗ — валюта и курс,
   языки, часовой пояс, сервисный сбор (только показ, правится в «Услугах и
   ценах»), платёжные системы, почта/SMS/Telegram, уведомления, API (ссылка на
   «Интеграции»), безопасность, резервная копия, режим обслуживания.
   Хранилище и чтение — js/14-system.js, копия и безопасность — 79-system-ops.js.

   Каждая карточка — своя часть настроек со своим черновиком (M.ui.sysd) и
   своей кнопкой «Сохранить». Опасное (курс, оплата, безопасность, включение
   обслуживания) — через подтверждение, правило «Система»; остальное пишется
   сразу и попадает в журнал. Секретов здесь нет: ключи — только на сервере.
   ========================================================================== */
"use strict";

/* Часть → право на правку и когда нужно подтверждение (ap(было, станет)). */
const SYS_PARTS = {
  cur:{ perm:"settings.manage", ap:(a, b) => a.rate !== b.rate }, langs:{ perm:"settings.edit" }, tz:{ perm:"settings.edit" },
  pay:{ perm:"settings.manage", ap:() => true }, ch:{ perm:"settings.edit" }, notify:{ perm:"settings.edit" },
  sec:{ perm:"settings.manage", ap:() => true }, maint:{ perm:"settings.manage", ap:(a, b) => a.on !== b.on }
};
const SYS_CARDS = ["cur", "langs", "tz", "fee", "pay", "ch", "notify", "api", "sec", "backup", "maint"];
const langName = l => LANG_FULL.find(([k]) => k === l)?.[1] || l;

/* ---- черновик: значения формы, как их ввели; base — часть на момент открытия ---- */
function sysForm(part, v){
  if (part === "cur") return { rate:grp(v.rate), usd:v.usd, def:v.def };
  if (part === "langs") return { on:Object.fromEntries(SYS_LANGS.map(l => [l, v.on.includes(l)])), def:v.def };
  if (part === "notify") return Object.fromEntries(Object.entries(SYS_EVENTS).map(([ev, chs]) => [ev, Object.fromEntries(chs.map(c => [c, v[ev].includes(c)]))]));
  if (part === "sec") return { idle:String(v.idle), otp:String(v.otp), lock:String(v.lock) };
  return JSON.parse(JSON.stringify(v));
}
/* Нетронутый черновик, чью часть уже изменили (другая вкладка, подтверждение), — собирается заново. */
function sysDraft(part){
  const ds = M.ui.sysd ||= {}, base = JSON.stringify(sysCfg()[part]);
  if (ds[part] && ds[part].base !== base && !ds[part].dirty) delete ds[part];
  return (ds[part] ||= { base, v:sysForm(part, sysCfg()[part]), dirty:false });
}
/* Черновик → часть настроек. Ошибки — все сразу: путь поля внутри части и ключ строки. */
function sysBuild(part, f){
  const errs = [], bad = (path, key) => { errs.push({ path, key }); }, cur = sysCfg()[part], out = val => errs.length ? { val:null, errs } : { val, errs };
  if (part === "cur") {
    const raw = String(f.rate).replace(/\s/g, ""), rate = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    if (!(rate >= SYS_RATE[0] && rate <= SYS_RATE[1])) bad("rate", "err_sys_rate");
    return out({ rate, usd:!!f.usd, def:f.usd && f.def === "USD" ? "USD" : "UZS" });
  }
  if (part === "langs") {
    const on = SYS_LANGS.filter(l => f.on[l]); if (!on.length) bad("on." + SYS_LANGS[0], "err_sys_langs");
    return out({ on, def:on.includes(f.def) ? f.def : on[0] });
  }
  if (part === "tz") return out({ zone:SYS_TZS.includes(f.zone) ? f.zone : cur.zone });
  if (part === "pay") {
    const site = PAY_METHODS.map(m => m[0]);
    if (!site.some(k => f.site[k])) bad("site." + site[0], "err_sys_pay_site");
    if (!SYS_TOPUP.some(k => f.topup[k])) bad("topup." + SYS_TOPUP[0], "err_sys_pay_topup");
    return out({ site:Object.fromEntries(site.map(k => [k, !!f.site[k]])), topup:Object.fromEntries(SYS_TOPUP.map(k => [k, !!f.topup[k]])) });
  }
  if (part === "ch") {
    const e = f.email, name = e.name.trim(), from = e.from.trim(), reply = e.reply.trim(), sender = f.sms.sender.trim();
    let bot = f.telegram.bot.trim(); if (bot && !bot.startsWith("@")) bot = "@" + bot;
    if (name.length < 2 || name.length > 40) bad("email.name", "err_sys_name");
    // Выключенный канал может быть без адреса, но не с неверным.
    if ((e.on || from) && !cmsEmail(from)) bad("email.from", "err_email");
    if (reply && !cmsEmail(reply)) bad("email.reply", "err_email");
    if ((f.sms.on || sender) && !SYS_SMS_RE.test(sender)) bad("sms.sender", "err_sys_sender");
    if ((f.telegram.on || bot) && !SYS_BOT_RE.test(bot)) bad("telegram.bot", "err_sys_bot");
    return out({ email:{ on:!!e.on, name, from, reply }, sms:{ on:!!f.sms.on, sender }, telegram:{ on:!!f.telegram.on, bot, chat:f.telegram.chat.trim().slice(0, 60) } });
  }
  if (part === "notify") return out(Object.fromEntries(Object.entries(SYS_EVENTS).map(([ev, chs]) => [ev, chs.filter(c => f[ev]?.[c])])));
  if (part === "sec") {
    const otp = /^\d{1,2}$/.test(f.otp.trim()) ? Number(f.otp.trim()) : NaN;
    if (!(otp >= 3 && otp <= 10)) bad("otp", "err_sys_otp");
    return out({ idle:Number(f.idle), otp, lock:Number(f.lock) });
  }
  return out({ on:!!f.on, msg:cmsL(f.msg, SYS_MSG_MAX), at:cur.at, by:cur.by });
}
/* Что было → что стало, без языка — для журнала и запроса на подтверждение. */
function sysDiff(part, a, b){
  const out = [], onoff = v => strRef(v ? "sys_on" : "sys_off");
  const row = (k, x, y, conv = v => v, sub) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ k, from:conv(x), to:conv(y), ...(sub ? { sub } : {}) }); };
  if (part === "cur") { row("sys_rate", a.rate, b.rate, v => uzsRef(v)); row("sys_usd", a.usd, b.usd, onoff); row("sys_cur_def", a.def, b.def); }
  else if (part === "langs") { row("sys_langs_on", a.on, b.on, v => v.map(langName).join(", ")); row("sys_lang_def", a.def, b.def, langName); }
  else if (part === "tz") row("sys_tz", a.zone, b.zone);
  else if (part === "pay") { for (const [k, name] of PAY_METHODS) row("sys_pay_site", a.site[k], b.site[k], onoff, name);
    for (const k of SYS_TOPUP) row("sys_pay_topup", a.topup[k], b.topup[k], onoff, strRef("topup_m_" + k)); }
  else if (part === "ch") { for (const c of SYS_CHANNELS) for (const f of Object.keys(a[c])) row(["sys_ch_" + c, "sys_f_" + f], a[c][f], b[c][f], v => typeof v === "boolean" ? onoff(v) : v || "—"); }
  else if (part === "notify") { for (const ev of Object.keys(SYS_EVENTS)) row("sys_notify", a[ev], b[ev], v => ({ chs:v }), strRef("sys_ev_" + ev)); }
  else if (part === "sec") { row("sys_idle", a.idle, b.idle, v => ({ mins:v })); row("sys_otp", a.otp, b.otp, String); row("sys_lock", a.lock, b.lock, v => ({ mins:v })); }
  // Текст заглушки — строкой на каждый изменённый язык: целый {ru,uz,en} журнал показал бы только язык экрана.
  else if (part === "maint") { row("sys_h_maint", a.on, b.on, v => strRef(v ? "sys_maint_on" : "sys_maint_off"));
    for (const l of SYS_LANGS) row("sys_maint_text", a.msg[l], b.msg[l], v => v || strRef("sys_maint_dflt"), l.toUpperCase()); }
  return out;
}

/* ---- сохранение ----
   Ошибки живут в черновике (d.errs) до удачного сохранения или «Отменить»:
   перерисовка из-за другой карточки их не стирает. */
const sysErrText = errs => [...new Set(errs.map(e => t(e.key)))].join("\n");
/* Поле с ошибкой: aria-invalid и ссылка на текст ошибки карточки. */
function sysBad(path){
  const [part, ...rest] = path.split("."), p = rest.join(".");
  return M.ui.sysd?.[part]?.errs?.some(e => e.path === p) ? `aria-invalid="true" aria-describedby="syserr-${part}"` : "";
}
function sysInvalid(part, errs){
  sysDraft(part).errs = errs; rerender();
  showErr("#syserr-" + part, sysErrText(errs));
  $(`[data-sys="${CSS.escape(part + "." + errs[0].path)}"]`)?.focus({ preventScroll:true });
}
/* true — сохранено или ушло на подтверждение. */
function sysSave(part){
  const P = SYS_PARTS[part]; if (denied(P.perm)) return false;
  const d = sysDraft(part), cur = sysCfg()[part];
  if (JSON.stringify(cur) !== d.base) { delete M.ui.sysd[part]; rerender(); toast(t("sys_conflict")); return false; }
  const { val, errs } = sysBuild(part, d.v); if (errs.length) { sysInvalid(part, errs); return false; }
  const to = sysClean({ ...sysCfg(), [part]:val })[part], diff = sysDiff(part, cur, to);
  if (!diff.length) { delete M.ui.sysd[part]; rerender(); toast(t("pr_same")); return false; }
  const payload = { part, from:cur, to };
  if (P.ap?.(cur, to) && needsApproval("sys")) {
    const ok = requestApproval("sys", { key:"sys:" + part, payload, vars:{ what:strRef("sys_h_" + part) }, diff });
    if (ok) { delete M.ui.sysd[part]; rerender(); }
    return ok;
  }
  let e = null; change(() => { e = execSys(payload); });
  // Не записалось (нет места) — черновик оставляем: набранное не теряется.
  if (!e) delete M.ui.sysd[part];
  rerender(); toast(e ? t(e) : t("t_sys_saved"));
  return !e;
}
/* Исполнитель (см. 17-approvals.js): работает внутри change(), сам его не вызывает.
   Часть могли изменить, пока запрос ждал, — тогда не выполняется. */
function execSys({ part, from, to }, ap){
  SYS_CACHE = null;
  if (!SYS_PARTS[part] || JSON.stringify(sysCfg()[part]) !== JSON.stringify(from)) return "ap_err_changed";
  const flip = part === "maint" && to.on !== from.on;
  const next = flip ? { ...to, at:Date.now(), by:ap ? staffName(ap.by) : me().name } : to;
  if (!sysWrite({ ...sysCfg(), [part]:next })) return "err_sys_space";
  // Режим — «включён/выключен» только когда его переключили; правка одного текста — своей записью.
  const [act, vars] = part !== "maint" ? ["sys_" + part, {}] : flip ? ["sys_maint", { state:strRef(next.on ? "sys_maint_on" : "sys_maint_off") }] : ["sys_maint_msg", {}];
  audit(act, vars, { module:"settings", diff:sysDiff(part, from, next) });
  return null;
}

/* ---- разметка ---- */
const sysDis = part => can(SYS_PARTS[part].perm) && !pendingAp("sys:" + part) ? "" : "disabled";
const sysChk = (path, on, label, dis) => `<label class="chk"><input type="checkbox" data-sys="${path}" ${on ? "checked" : ""} ${sysBad(path)} ${dis}><span>${esc(label)}</span></label>`;
const sysSel = (path, val, opts, label, dis) => `<label class="field"><span>${esc(label)}</span><select class="minisel" data-sys="${path}" ${sysBad(path)} ${dis}>${opts.map(([v, l]) =>
  `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
const sysTxt = (path, val, label, extra, dis) => `<label class="field"><span>${esc(label)}</span><input data-sys="${path}" value="${esc(val)}" ${extra} ${sysBad(path)} ${dis}></label>`;
function sysRateEx(raw){
  const r = Number(String(raw).replace(/\s/g, ""));
  return tf("sys_rate_ex", { amount:Number.isInteger(r) && r >= SYS_RATE[0] && r <= SYS_RATE[1] ? fmtUZS(Math.round(100 * r / 1000) * 1000) : "—" });
}
function sysCard(id, body, foot = ""){
  return `<section class="card stack sys-card" id="sys-${id}" aria-labelledby="sysh-${id}"><div class="stack" style="gap:4px"><h2 id="sysh-${id}">${esc(t("sys_h_" + id))}</h2>
    <p class="muted small">${esc(t("sys_d_" + id))}</p></div>${body}${foot}</section>`;
}
const sysCancel = part => `<button type="button" class="link" data-act="sysreset" data-v="${part}">${esc(t("cancel"))}</button>`;
/* Низ карточки: ждущий запрос, ошибка, «Сохранить» / «Отменить», подсказка о подтверждении. */
function sysFoot(part, hint = ""){
  const P = SYS_PARTS[part], pend = pendingAp("sys:" + part), d = sysDraft(part);
  return `${pend ? `<div class="stack" style="gap:6px"><p class="note-live" style="margin:0">${IC.clock}<span>${esc(t("sys_pending"))}</span></p>${apDiff(pend)}</div>` : ""}
    <div class="err sys-err" id="syserr-${part}" ${d.errs?.length ? "" : "hidden"}>${d.errs?.length ? esc(sysErrText(d.errs)) : ""}</div>
    <div class="row sys-foot"><button type="button" class="solid sm" data-act="syssave" data-v="${part}" ${guard(P.perm)} ${pend ? "disabled" : ""}>${esc(t("st_save"))}</button>
      ${d.dirty ? sysCancel(part) : ""}
      ${hint && P.ap && needsApproval("sys") && !pend ? `<span class="muted small">${esc(t(hint))}</span>` : ""}</div>`;
}
function sysCur(){
  const f = sysDraft("cur").v, dis = sysDis("cur");
  return sysCard("cur", `<div class="sgrid sgrid-2">
      <label class="field"><span>${esc(t("sys_rate"))}</span><span class="amt-in"><input data-sys="cur.rate" inputmode="numeric" autocomplete="off" maxlength="8" value="${esc(f.rate)}" ${sysBad("cur.rate")} ${dis}><i>${esc(t("cur_uzs"))}</i></span></label>
      <div class="stack sys-ex" style="gap:2px"><b class="mono" id="sys-rate-ex" aria-live="polite">${esc(sysRateEx(f.rate))}</b><span class="muted small">${esc(tf("sys_rate_def", { rate:grp(USD_TO_UZS) }))}</span></div></div>
    ${sysChk("cur.usd", f.usd, t("sys_usd"), dis)}
    ${sysSel("cur.def", f.def, SYS_CURS.map(c => [c, c]), t("sys_cur_def"), dis || (f.usd ? "" : "disabled"))}`, sysFoot("cur", "sys_needs_ap_rate"));
}
function sysLangs(){
  const f = sysDraft("langs").v, dis = sysDis("langs");
  return sysCard("langs", `<fieldset class="sys-checks"><legend>${esc(t("sys_langs_on"))}</legend>${SYS_LANGS.map(l => sysChk("langs.on." + l, f.on[l], langName(l), dis)).join("")}</fieldset>
    ${sysSel("langs.def", f.def, SYS_LANGS.filter(l => f.on[l]).map(l => [l, langName(l)]), t("sys_lang_def"), dis)}`, sysFoot("langs"));
}
function sysTzCard(){
  const f = sysDraft("tz").v, dis = sysDis("tz");
  const now = new Date().toLocaleTimeString(LOC[S.lang], { timeZone:f.zone, hour:"2-digit", minute:"2-digit" });
  return sysCard("tz", `${sysSel("tz.zone", f.zone, SYS_TZS.map(z => [z, `${z} (${tzOffset(z)})`]), t("sys_tz"), dis)}
    <p class="muted small">${esc(tf("sys_tz_now", { time:now }))}</p>`, sysFoot("tz"));
}
function sysFee(){
  const p = prices(), row = (k, v) => `<div><span class="k">${esc(t(k))}</span><span class="v mono">${esc(v)}</span></div>`;
  return sysCard("fee", `<div class="rows">${row("sys_fee_v", pctText(p.feeBps) + "%")}${row("sys_markup_v", pctText(p.flightMarkupBps) + "%")}${row("sys_agents_v", String(Object.keys(p.agents).length))}</div>
    ${can("pricing.view") ? `<a class="ghost sm" href="#/pricing" style="align-self:flex-start">${esc(t("sys_fee_go"))}</a>` : ""}`);
}
function sysPay(){
  const f = sysDraft("pay").v, dis = sysDis("pay");
  return sysCard("pay", `<div class="sgrid sgrid-2">
      <fieldset class="sys-checks"><legend>${esc(t("sys_pay_site"))}</legend>${PAY_METHODS.map(([k, name]) => sysChk("pay.site." + k, f.site[k], name, dis)).join("")}</fieldset>
      <fieldset class="sys-checks"><legend>${esc(t("sys_pay_topup"))}</legend>${SYS_TOPUP.map(k => sysChk("pay.topup." + k, f.topup[k], t("topup_m_" + k), dis)).join("")}</fieldset></div>`, sysFoot("pay", "sys_needs_ap"));
}
function sysCh(){
  const f = sysDraft("ch").v, dis = sysDis("ch"), T = (path, label, extra = "") => sysTxt("ch." + path, path.split(".").reduce((o, k) => o[k], f), t(label), extra, dis);
  const block = (c, fields) => `<div class="sys-ch stack"><div class="row sys-ch-h">${sysChk(`ch.${c}.on`, f[c].on, t("sys_ch_" + c), dis)}
      <button type="button" class="ghost sm" data-act="systest" data-v="${c}" ${guard("settings.edit")}>${esc(t("sys_test"))}</button></div>
    <div class="sgrid sgrid-2">${fields}</div></div>`;
  return sysCard("ch", `${block("email", T("email.name", "sys_f_name", 'maxlength="40"') + T("email.from", "sys_f_from", 'type="email" maxlength="80" autocomplete="off"') + T("email.reply", "sys_f_reply", 'type="email" maxlength="80" autocomplete="off"'))}
    ${block("sms", T("sms.sender", "sys_f_sender", 'maxlength="11" autocomplete="off" spellcheck="false"'))}
    ${block("telegram", T("telegram.bot", "sys_f_bot", 'maxlength="33" autocomplete="off" spellcheck="false"') + T("telegram.chat", "sys_f_chat", 'maxlength="60"'))}
    <p class="muted small">${esc(t("sys_keys_note"))} <a class="link" href="#/integrations">${esc(t("sys_api_go"))}</a></p>`, sysFoot("ch"));
}
function sysNotify(){
  const f = sysDraft("notify").v, dis = sysDis("notify"), ch = sysCfg().ch;
  return sysCard("notify", `<div class="matrix-wrap"><table class="matrix sys-matrix"><caption class="sr-only">${esc(t("sys_h_notify"))}</caption>
    <thead><tr><th scope="col">${esc(t("sys_event"))}</th>${SYS_CHANNELS.map(c => `<th scope="col">${esc(t("sys_ch_" + c))}${ch[c].on ? "" : ` <span class="muted">(${esc(t("sys_off"))})</span>`}</th>`).join("")}</tr></thead>
    <tbody>${Object.entries(SYS_EVENTS).map(([ev, chs]) => `<tr><th scope="row">${esc(t("sys_ev_" + ev))}</th>${SYS_CHANNELS.map(c => `<td>${chs.includes(c)
      ? `<input type="checkbox" data-sys="notify.${ev}.${c}" ${f[ev][c] ? "checked" : ""} aria-label="${esc(t("sys_ev_" + ev))}: ${esc(t("sys_ch_" + c))}" ${dis}>` : `<span class="no" aria-hidden="true">·</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`, sysFoot("notify"));
}
function sysApi(){
  const n = st => INTEGRATIONS.filter(x => x[1] === st).length;
  return sysCard("api", `<p>${esc(tf("sys_api_sum", { live:n("live"), test:n("ok_test"), sb:n("sandbox"), none:n("none") }))}</p>
    <a class="ghost sm" href="#/integrations" style="align-self:flex-start">${esc(t("sys_api_go"))}</a>`);
}
function sysSec(){
  const f = sysDraft("sec").v, dis = sysDis("sec"), mins = n => pl(n, "minute");
  return sysCard("sec", `<div class="sgrid sgrid-3">
      ${sysSel("sec.idle", f.idle, SYS_IDLE.map(n => [n, n ? mins(n) : t("sys_idle_off")]), t("sys_idle"), dis)}
      ${sysTxt("sec.otp", f.otp, t("sys_otp"), 'inputmode="numeric" maxlength="2" autocomplete="off"', dis)}
      ${sysSel("sec.lock", f.lock, SYS_LOCK.map(n => [n, mins(n)]), t("sys_lock"), dis)}</div>
    <a class="link" href="#/approvals" style="align-self:flex-start">${esc(t("sys_rules_go"))}</a>`, sysFoot("sec", "sys_needs_ap"));
}
function sysBackup(){
  const last = O.audit.find(e => e.action === "sys_backup"), bk = M.ui.bk, pend = pendingAp("restore");
  const preview = bk?.ok ? `<div class="sys-bk stack" style="gap:6px"><b>${esc(tf("sys_bk_file", { date:bk.at ? fdt(bk.at) : "—", name:bk.by || "—", kb:grp(bk.kb) }))}</b>
      <span class="muted small">${esc(bk.file)}</span><span class="small">${esc(tf("sys_bk_counts", { ag:bk.counts.ag, orders:bk.counts.orders }))}</span>
      <div class="row"><button type="button" class="solid sm" data-act="sysrestore" ${guard("settings.manage")} ${pend ? "disabled" : ""}>${esc(t("sys_bk_restore"))}</button>
        <button type="button" class="link" data-act="sysbkx">${esc(t("cancel"))}</button></div></div>` : "";
  return sysCard("backup", `<p class="muted small">${esc(last ? tf("sys_bk_last", { when:fdt(last.at), name:staffName(last.staffId) }) : t("sys_bk_never"))}</p>
    ${pend ? `<div class="stack" style="gap:6px"><p class="note-live" style="margin:0">${IC.clock}<span>${esc(t("sys_bk_pending"))}</span></p></div>` : ""}
    <div class="row"><button type="button" class="ghost sm" data-act="sysbk" ${guard("settings.export")}>${IC.doc}<span>${esc(t("sys_bk_dl"))}</span></button>
      <label class="ghost sm filebtn ${can("settings.manage") ? "" : "is-off"}">${IC.upload}<span>${esc(t("sys_bk_pick"))}</span><input id="bkfile" type="file" accept="application/json,.json" aria-label="${esc(t("sys_bk_pick"))}" ${can("settings.manage") ? "" : "disabled"}></label></div>
    <div class="err" id="bkerr" tabindex="-1" ${bk?.err ? 'role="alert"' : "hidden"}>${bk?.err ? esc(tf(bk.err, bk.vars || {})) : ""}</div>${preview}`);
}
function sysMaintCard(){
  const c = sysCfg().maint, f = sysDraft("maint").v, dis = sysDis("maint"), pend = pendingAp("sys:maint");
  return sysCard("maint", `<p class="sys-state"><span class="pill ${c.on ? "is-alert" : "st-CONFIRMED"}">${esc(t(c.on ? "sys_maint_on" : "sys_maint_off"))}</span>
      ${c.on && c.at ? `<span class="muted small">${esc(tf("sys_maint_since", { time:fdt(c.at) }))}${c.by ? " · " + esc(c.by) : ""}</span>` : ""}</p>
    <div class="stack" style="gap:10px"><b>${esc(t("sys_maint_msg"))}</b>${SYS_LANGS.map(l => `<label class="field"><span>${esc(langName(l))}</span>
      <textarea data-sys="maint.msg.${l}" maxlength="${SYS_MSG_MAX}" rows="2" placeholder="${esc(STR.maint_d[LIDX[l]])}" ${dis}>${esc(f.msg[l])}</textarea></label>`).join("")}</div>
    <div class="row"><button type="button" class="${c.on ? "solid" : "ghost danger"} sm" data-act="sysmaint" ${guard("settings.manage")} ${pend ? "disabled" : ""}>${esc(t(c.on ? "sys_maint_turn_off" : "sys_maint_turn_on"))}</button>
      <a class="link" href="../b2c/" target="_blank" rel="noopener">${esc(t("open_site"))}</a></div>`, sysFoot("maint", "sys_needs_ap_maint"));
}
const SYS_RENDER = { cur:sysCur, langs:sysLangs, tz:sysTzCard, fee:sysFee, pay:sysPay, ch:sysCh, notify:sysNotify, api:sysApi, sec:sysSec, backup:sysBackup, maint:sysMaintCard };
PAGES.system = {
  render(){
    const c = sysCfg(), waiting = O.approvals.filter(a => a.status === "pending" && (a.kind === "sys" || a.kind === "restore")).length;
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_system"))}</h1><p class="muted">${esc(t("system_sub"))}</p></div>
      <div class="sys-status card" role="group" aria-label="${esc(t("sys_status"))}">
        <span class="pill ${c.maint.on ? "is-alert" : "st-CONFIRMED"}">${esc(t("sys_h_maint"))}: ${esc(t(c.maint.on ? "sys_maint_on" : "sys_maint_off"))}</span>
        <span>${esc(tf("rate_note", { rate:grp(c.cur.rate) }))}</span><span>${esc(c.tz.zone)} · ${esc(tzOffset())}</span>
        ${waiting ? `<a class="link" href="#/approvals">${esc(tf("sys_ap_n", { n:waiting }))}</a>` : ""}</div>
      <div class="sys-grid">${SYS_CARDS.map(k => SYS_RENDER[k]()).join("")}</div></div>`;
  },
  after(){ restoreCleanup(); }
};

/* ---- поля: data-sys="часть.путь" ---- */
function sysField(el){ const [part, ...rest] = el.dataset.sys.split("."); return { part, path:rest.join("."), d:sysDraft(part) }; }
/* Текст — на месте, без перерисовки: курсор и набранное не сбиваются. */
document.addEventListener("input", e => {
  if (e.target.dataset?.sys == null || e.target.type === "checkbox" || e.target.tagName === "SELECT") return;
  const { part, path, d } = sysField(e.target);
  setPath(d.v, path, e.target.value);
  if (!d.dirty) { d.dirty = true; $(`[data-act="syssave"][data-v="${part}"]`)?.insertAdjacentHTML("afterend", sysCancel(part)); }
  if (part === "cur") { const ex = $("#sys-rate-ex"); if (ex) ex.textContent = sysRateEx(d.v.rate); }
});
document.addEventListener("change", e => {
  if (e.target.dataset?.sys == null || (e.target.type !== "checkbox" && e.target.tagName !== "SELECT")) return;
  const key = e.target.dataset.sys, { part, path, d } = sysField(e.target);
  setPath(d.v, path, e.target.type === "checkbox" ? e.target.checked : e.target.value); d.dirty = true;
  // Сняли язык по умолчанию — по умолчанию первый оставшийся; без долларов — только сумы.
  if (part === "langs" && !d.v.on[d.v.def]) d.v.def = SYS_LANGS.find(l => d.v.on[l]) || d.v.def;
  if (part === "cur" && !d.v.usd) d.v.def = "UZS";
  rerender(); $(`[data-sys="${CSS.escape(key)}"]`)?.focus();
});
Object.assign(ACT, {
  syssave:  el => sysSave(el.dataset.v),
  sysreset: el => { if (M.ui.sysd) delete M.ui.sysd[el.dataset.v]; rerender(); $(`[data-act="syssave"][data-v="${el.dataset.v}"]`)?.focus(); },
  /* Включить или выключить обслуживание. Изменённый текст сначала сохраняется
     сам (подтверждения он не требует — так обещает подсказка карточки), в запрос
     уходит только переключение. Не сохранилось (ошибка, такой запрос уже ждёт) —
     переключатель в черновике возвращаем. */
  sysmaint: () => {
    if (denied("settings.manage")) return;
    const on = sysCfg().maint.on; if (!confirm(t(on ? "sys_maint_q_off" : "sys_maint_q_on"))) return;
    const d0 = sysDraft("maint");
    if (d0.dirty && JSON.stringify(cmsL(d0.v.msg, SYS_MSG_MAX)) !== JSON.stringify(sysCfg().maint.msg)) {
      d0.v.on = on; if (!sysSave("maint")) return;
    }
    const d = sysDraft("maint"); d.v.on = !on; d.dirty = true;
    sysSave("maint");
    const left = M.ui.sysd?.maint; if (left) left.v.on = JSON.parse(left.base).on;
  },
  systest:  el => {
    if (denied("settings.edit")) return;
    const c = el.dataset.v; if (!SYS_CHANNELS.includes(c)) return;
    if (!sysCfg().ch[c].on) return toast(t("sys_ch_off"));
    change(() => audit("sys_test", { ch:strRef("sys_ch_" + c) }, { module:"settings" }));
    toast(t("t_sys_test"));
  }
});
