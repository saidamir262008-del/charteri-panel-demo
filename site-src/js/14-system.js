/* ==========================================================================
   Системные настройки Charteri из админки (раздел «Система»): курс доллара,
   языки сайта и кабинета, часовой пояс, платёжные системы, каналы отправки,
   уведомления, безопасность админки, режим обслуживания. Админка пишет их в
   SYS_KEY; сайт, кабинет и админка читают одинаково — через sysCfg().

   { v:1, cur:{rate,usd,def}, langs:{on,def}, tz:{zone}, pay:{site,topup},
     ch:{email,sms,telegram}, notify:{событие:[каналы]}, sec:{idle,otp,lock},
     maint:{on,msg,at,by} }
   Каждая часть пересобирается в одном порядке ключей — JSON.stringify частей
   можно сравнивать. Секретов (ключей API, токенов) здесь нет и быть не может:
   файл уходит в браузер каждому посетителю.
   ========================================================================== */
"use strict";

const SYS_KEY = "charteri.ops.sys";
const SYS_LANGS = ["ru", "uz", "en"];
const SYS_CURS = ["UZS", "USD"];
const SYS_TOPUP = ["card", "bank", "cash"];
const SYS_CHANNELS = ["email", "sms", "telegram"];
const SYS_TZS = ["Asia/Tashkent", "Asia/Almaty", "Asia/Dubai", "Europe/Istanbul", "Europe/Moscow", "Europe/London", "UTC"];
/* Событие → каналы, которыми его можно отправить (клиенту — почта и SMS,
   сотрудникам — почта и Telegram), и включённые по умолчанию. */
const SYS_EVENTS = { order_paid:["email", "sms"], charter_req:["email", "telegram"], charter_price:["email", "sms"], refund:["email", "sms"],
  topup_wait:["email", "telegram"], topup_done:["email", "sms"], agency_app:["email", "telegram"], approval:["email", "telegram"] };
const SYS_NOTIFY0 = { order_paid:["email", "sms"], charter_req:["telegram", "email"], charter_price:["sms", "email"], refund:["sms", "email"],
  topup_wait:["telegram"], topup_done:["email", "sms"], agency_app:["telegram", "email"], approval:["telegram"] };
const SYS_IDLE = [0, 15, 30, 60, 120, 480], SYS_LOCK = [5, 15, 30, 60];
const SYS_RATE = [1000, 100000], SYS_MSG_MAX = 300;
/* Предел Date: метка дальше — не время, а мусор из файла или хранилища. */
const TS_MAX = 8.64e15, validTs = v => Number.isFinite(v) && v > 0 && v <= TS_MAX;
const SYS_SMS_RE = /^[A-Za-z0-9][A-Za-z0-9 .-]{2,10}$/, SYS_BOT_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
let SYS_CACHE = null, TZF = null;

function sysDefaults(){
  return { v:1, cur:{ rate:USD_TO_UZS, usd:true, def:"UZS" }, langs:{ on:[...SYS_LANGS], def:"ru" }, tz:{ zone:"Asia/Tashkent" },
    pay:{ site:Object.fromEntries(PAY_METHODS.map(m => [m[0], true])), topup:Object.fromEntries(SYS_TOPUP.map(k => [k, true])) },
    ch:{ email:{ on:true, name:"Charteri", from:"noreply@charteri.uz", reply:"" }, sms:{ on:true, sender:"CHARTERI" }, telegram:{ on:true, bot:"@charteri_ops_bot", chat:"" } },
    notify:Object.fromEntries(Object.entries(SYS_EVENTS).map(([ev, chs]) => [ev, chs.filter(c => SYS_NOTIFY0[ev].includes(c))])),
    sec:{ idle:60, otp:5, lock:15 }, maint:{ on:false, msg:{ ru:"", uz:"", en:"" }, at:0, by:"" } };
}
/* Данные из хранилища — чужие: каждое поле проверяется отдельно и при ошибке
   берётся по умолчанию. Строку, которую стёрли (пусто), не подменяем. */
function sysClean(r){
  const d = sysDefaults(); if (!r || typeof r !== "object" || r.v !== 1) return d;
  const bool = (v, def) => typeof v === "boolean" ? v : def;
  const int = (v, lo, hi, def) => Number.isInteger(v) && v >= lo && v <= hi ? v : def;
  const str = (v, ok, def) => typeof v !== "string" ? def : !v.trim() ? "" : ok(v.trim()) ? v.trim() : def;
  const flags = (x, keys, def) => { const g = Object.fromEntries(keys.map(k => [k, bool(x?.[k], true)])); return keys.some(k => g[k]) ? g : def; };
  const usd = bool(r.cur?.usd, true);
  const on = Array.isArray(r.langs?.on) ? SYS_LANGS.filter(l => r.langs.on.includes(l)) : [];
  const e = r.ch?.email || {}, s = r.ch?.sms || {}, tg = r.ch?.telegram || {}, sec = r.sec || {}, mt = r.maint || {};
  const name = typeof e.name === "string" ? e.name.trim().slice(0, 40) : "";
  return { v:1,
    cur:{ rate:int(r.cur?.rate, SYS_RATE[0], SYS_RATE[1], d.cur.rate), usd, def:usd && r.cur?.def === "USD" ? "USD" : "UZS" },
    langs:on.length ? { on, def:on.includes(r.langs.def) ? r.langs.def : on.includes("ru") ? "ru" : on[0] } : d.langs,
    tz:{ zone:SYS_TZS.includes(r.tz?.zone) ? r.tz.zone : d.tz.zone },
    pay:{ site:flags(r.pay?.site, PAY_METHODS.map(m => m[0]), d.pay.site), topup:flags(r.pay?.topup, SYS_TOPUP, d.pay.topup) },
    ch:{ email:{ on:bool(e.on, true), name:name.length >= 2 ? name : d.ch.email.name, from:str(e.from, cmsEmail, d.ch.email.from), reply:str(e.reply, cmsEmail, "") },
      sms:{ on:bool(s.on, true), sender:str(s.sender, v => SYS_SMS_RE.test(v), d.ch.sms.sender) },
      telegram:{ on:bool(tg.on, true), bot:str(tg.bot, v => SYS_BOT_RE.test(v), d.ch.telegram.bot), chat:typeof tg.chat === "string" ? tg.chat.trim().slice(0, 60) : "" } },
    notify:Object.fromEntries(Object.entries(SYS_EVENTS).map(([ev, chs]) => { const x = r.notify?.[ev]; return [ev, Array.isArray(x) ? chs.filter(c => x.includes(c)) : d.notify[ev]]; })),
    sec:{ idle:SYS_IDLE.includes(sec.idle) ? sec.idle : d.sec.idle, otp:int(sec.otp, 3, 10, d.sec.otp), lock:SYS_LOCK.includes(sec.lock) ? sec.lock : d.sec.lock },
    maint:{ on:bool(mt.on, false), msg:cmsL(mt.msg, SYS_MSG_MAX), at:validTs(mt.at) ? Math.round(mt.at) : 0, by:typeof mt.by === "string" ? mt.by.slice(0, 80) : "" } };
}
function sysCfg(){ return SYS_CACHE || (SYS_CACHE = sysClean(readJSON(SYS_KEY, null))); }
/* Запись не удалась (в браузере нет места) — null: кэш не меняем, иначе
   админка показала бы и записала в журнал то, чего нет у сайта и кабинета. */
function sysWrite(next){
  const c = sysClean(next);
  try { localStorage.setItem(SYS_KEY, JSON.stringify(c)); } catch(e) { return null; }
  SYS_CACHE = c; TZF = null; return c;
}
function sysRate(){ return sysCfg().cur.rate; }
function sysTz(){ return sysCfg().tz.zone; }

/* ---- способы оплаты: выключенные в админке не предлагаются ---- */
function payOn(k){ return sysCfg().pay.site[k] === true; }
function payList(){ return PAY_METHODS.filter(m => payOn(m[0])); }
function firstPay(){ return payList()[0]?.[0] || "payme"; }
function topupOn(k){ return sysCfg().pay.topup[k] === true; }
function firstTopup(){ return SYS_TOPUP.find(topupOn) || "card"; }

/* ---- языки: на сайте и в кабинете — включённые в админке, в админке — все ---- */
const LANG_SHORT = [["uz", "O‘z"], ["ru", "Рус"], ["en", "Eng"]], LANG_FULL = [["uz", "O‘zbekcha"], ["ru", "Русский"], ["en", "English"]];
function langsOn(list){ return APP === "admin" ? list : list.filter(([k]) => sysCfg().langs.on.includes(k)); }
function langSelect(){ const l = langsOn(LANG_SHORT);
  return l.length > 1 ? `<select id="langSel" class="minisel" aria-label="${esc(t("language"))}">${l.map(([k, n]) => `<option value="${k}" ${S.lang === k ? "selected" : ""}>${n}</option>`).join("")}</select>` : ""; }
function langSeg(act){ const l = langsOn(LANG_FULL); return l.length > 1 ? seg(act, l, S.lang) : ""; }

/* ---- часовой пояс компании: время событий (fdt, выгрузки) и дни отчётов.
        Даты поездок и TODAY не пересчитываются — это календарь устройства. ---- */
/* Неверная метка (за пределом Date) — bad: Intl.formatToParts на ней падает. */
function tzParts(ms){
  if (!(Number.isFinite(ms) && Math.abs(ms) <= TS_MAX)) return { y:0, m:1, d:1, h:"00", mi:"00", bad:true };
  const z = sysTz();
  if (TZF?.z !== z) TZF = { z, f:new Intl.DateTimeFormat("en-GB", { timeZone:z, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }) };
  const p = Object.fromEntries(TZF.f.formatToParts(ms).map(x => [x.type, x.value]));
  return { y:+p.year, m:+p.month, d:+p.day, h:p.hour === "24" ? "00" : p.hour, mi:p.minute };
}
function tzYmd(ms){ const p = tzParts(ms); return p.bad ? "" : `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }
function tzToday(){ return tzYmd(Date.now()); }
function tzOffset(z = sysTz()){
  const v = new Intl.DateTimeFormat("en-GB", { timeZone:z, timeZoneName:"shortOffset" }).formatToParts(Date.now()).find(x => x.type === "timeZoneName")?.value || "GMT";
  return v.replace("GMT", "UTC");
}
/* Полночь дня ymd в поясе компании (мс): начало «сегодня» в фильтрах журнала
   и операций. Смещение берётся дважды — на случай перехода на летнее время. */
function tzDayStart(day){
  const g = Date.parse(day + "T00:00:00Z"), off = ms => { const p = tzParts(ms); return Date.UTC(p.y, p.m - 1, p.d, +p.h, +p.mi) - Math.floor(ms / 60000) * 60000; };
  return g - off(g - off(g));
}
function fdtFull(ms){ return tzParts(ms).bad ? "—" : new Date(ms).toLocaleString(LOC[S.lang], { timeZone:sysTz() }); }

/* ---- режим обслуживания: сайт и кабинет закрыты, админка работает ---- */
function sysMaint(){ return APP !== "admin" && sysCfg().maint.on ? sysCfg().maint : null; }
/* Язык или валюта, которые админка выключила, — на включённые по умолчанию. */
function sysCoerce(){
  if (APP === "admin" || !S) return;
  const c = sysCfg();
  if (!c.langs.on.includes(S.lang)) S.lang = c.langs.def;
  if (!c.cur.usd && S.cur === "USD") S.cur = "UZS";
}
function maintRender(mt, isNav){
  // Пустое сообщение на языке экрана — текст по умолчанию на этом же языке (так обещает карточка в админке).
  const msg = mt.msg[S.lang] || t("maint_d");
  $("#app").innerHTML = `<div class="maint"><section class="card stack maint-card" aria-labelledby="maint-h"><span class="maint-ic">${IC.clock}</span>
    <span class="wordmark dark">CHARTERI<b>.UZ</b></span><h1 id="maint-h">${esc(t("maint_h"))}</h1><p class="muted">${esc(msg)}</p>
    ${mt.at ? `<p class="small muted">${esc(tf("maint_since", { time:fdt(mt.at) }))}</p>` : ""}${langSeg("setlang")}</section></div>`;
  document.title = t("maint_h") + " — Charteri";
  if (isNav) window.scrollTo({ top:0, behavior:"instant" });
  slideIndicators();
  if (isNav) { const h = $("#maint-h"); h.tabIndex = -1; h.focus({ preventScroll:true }); }
}

/* Админка в другой вкладке изменила настройки (или сбросила демо). Включили
   или выключили обслуживание, убрали язык экрана — перерисовываем целиком,
   даже если человек печатает: страница всё равно другая. */
window.addEventListener("storage", e => {
  if (e.key !== SYS_KEY && e.key !== null) return;
  const was = SYS_CACHE; SYS_CACHE = null; TZF = null;
  if (!S) return;
  const now = sysCfg();
  if (APP !== "admin" && (!was || was.maint.on !== now.maint.on || !now.langs.on.includes(S.lang))) return render(false);
  onExternalChange();
});
