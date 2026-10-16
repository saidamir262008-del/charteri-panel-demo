/* ==========================================================================
   Адаптер к серверу Charteri (пакет charteri-api, /api/v1).

   Включается, только когда задан CONFIG.api.base (js/00-config.js). Пустой
   base — по умолчанию и в сборке для GitHub Pages — демо работает как раньше:
   всё в localStorage, ни одного запроса к серверу.

   Здесь — общее для сайта, кабинета и админки:
     API.call(method, path, body, {idem, passive, file})
       Bearer-токен; при 401 один раз обновляет сессию и повторяет;
       Idempotency-Key (UUID) — один на действие, тот же при повторе;
       ошибка — ApiError {code, status, details}, текст — API.errText(e).
     Сессия: access token — только в памяти, refresh token — под ключом
       приложения: сайт и кабинет — в localStorage (charteri.site.auth,
       charteri.b2b.auth; другая вкладка обновила токен — берём её), админка —
       только в sessionStorage этой вкладки (charteri.admin.auth): токен
       сотрудника не живёт дольше вкладки и не лежит рядом с токенами сайта.
       Админку держать на отдельном адресе (admin.<домен>), см. README.
     API.remote(домен) — домен работает с сервером. CONFIG.api.domains:
       { cms:"local" } оставляет содержимое сайта на демо-данных браузера
       (остальные домены связаны деньгами и входом и включаются вместе).
   Приложения подключают свои домены в js/97-api-site.js, b2b/95-api.js,
   admin/95-api.js. Сервер перепроверяет всё; права в панели — только для вида.
   ========================================================================== */
"use strict";

class ApiError extends Error {
  constructor(code, status = 0, details = null){ super(code); this.name = "ApiError"; this.code = code; this.status = status; this.details = details; }
}

const API = (() => {
  const cfg = CONFIG.api || {};
  const TIMEOUT_MS = 20000, SKEW_S = 30;
  /* Адрес сервера: https, или http только на этом компьютере (локальная проверка). */
  const base = (() => {
    const raw = String(cfg.base || "").trim().replace(/\/+$/, ""); if (!raw) return "";
    try { const u = new URL(raw); const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
      if (u.protocol === "https:" || (u.protocol === "http:" && local)) return raw; } catch(e) {}
    console.error("CONFIG.api.base: нужен https-адрес — демо остаётся на localStorage"); return "";
  })();
  const on = !!base;
  const app = APP === "b2c" ? "site" : APP;
  const RT_KEY = `charteri.${app}.auth`;
  const domains = cfg.domains && typeof cfg.domains === "object" ? cfg.domains : {};
  let access = null, accessExp = 0, refreshing = null, actor = null;
  const lostFns = [];

  const store = () => app === "admin" ? sessionStorage : localStorage;
  const rtGet = () => { try { return store().getItem(RT_KEY) || null; } catch(e) { return null; } };
  const rtSet = v => { try { if (v) store().setItem(RT_KEY, v); else store().removeItem(RT_KEY); } catch(e) {} };
  // Старый токен админки из localStorage (до этой версии) — убрать.
  if (app === "admin") { try { localStorage.removeItem(RT_KEY); } catch(e) {} }
  function uuid(){
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const rid = () => "p-" + uuid().slice(0, 23);

  function setSession(s, a){
    access = s.accessToken; accessExp = Number(s.expiresAt) || 0; rtSet(s.refreshToken);
    if (a) actor = a;
  }
  function clear(){ access = null; accessExp = 0; actor = null; rtSet(null); }
  function lose(code){ const had = !!actor || !!access; clear(); if (had) lostFns.forEach(f => { try { f(code); } catch(e) { console.error(e); } }); }

  async function fetchT(url, init){
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try { return await fetch(url, { ...init, signal:ctl.signal, credentials:"omit", cache:"no-store" }); }
    finally { clearTimeout(timer); }
  }
  /* Обновление сессии — одно на вкладку. Refresh token берём из localStorage:
     другая вкладка могла обновить его раньше — тогда годен уже её токен. */
  function refresh(){
    if (refreshing) return refreshing;
    refreshing = (async () => {
      for (let i = 0; i < 2; i++) {
        const rt = rtGet(); if (!rt) return false;
        let res, j = null;
        try { res = await fetchT(base + "/auth/refresh", { method:"POST", headers:{ "content-type":"application/json", "x-request-id":rid() }, body:JSON.stringify({ refreshToken:rt, app }) }); }
        catch(e) { throw new ApiError("NETWORK"); }
        try { j = await res.json(); } catch(e) {}
        if (res.ok && j?.ok) { setSession(j.data.session, j.data.actor); return true; }
        if (res.status >= 500) throw new ApiError(j?.error?.code || "INTERNAL", res.status);
        if (rtGet() && rtGet() !== rt) continue;        // токен обновила другая вкладка, пока шёл запрос
        lose(j?.error?.code === "SESSION_IDLE" ? "SESSION_IDLE" : "SESSION"); return false;
      }
      return false;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function token(){
    if (access && accessExp - SKEW_S > Date.now() / 1000) return access;
    if (!rtGet()) return null;
    return (await refresh()) ? access : null;
  }

  /* Запрос к серверу. idem: true — новый ключ; строка — ключ действия (повтор
     той же кнопки после сбоя сети); file — вернуть Response файла. */
  async function call(method, path, body, o = {}){
    if (!on) throw new ApiError("OFFLINE");
    const idem = o.idem === true ? uuid() : o.idem || null;
    for (let attempt = 0; ; attempt++) {
      const h = { accept:"application/json", "x-request-id":rid() };
      if (body !== undefined) h["content-type"] = "application/json";
      if (idem) h["idempotency-key"] = idem;
      if (o.passive) h["x-activity"] = "passive";
      const tok = o.auth === false ? null : await token();
      if (tok) h.authorization = "Bearer " + tok;
      let res;
      try { res = await fetchT(base + path, { method, headers:h, body:body === undefined ? undefined : JSON.stringify(body) }); }
      catch(e) { if (attempt === 0 && (method === "GET" || idem)) continue; throw new ApiError("NETWORK"); }
      if (o.file && res.ok) return res;
      let j = null; try { j = await res.json(); } catch(e) {}
      const code = j?.error?.code || (res.ok ? "BAD_RESPONSE" : res.status >= 500 ? "INTERNAL" : "HTTP_" + res.status);
      if (res.status === 401 && tok && code === "UNAUTHENTICATED" && attempt === 0) { access = null; if (await refresh()) continue; }
      if (res.ok && j?.ok) return j.data;
      if (res.status === 401 && tok) lose(code === "SESSION_IDLE" ? "SESSION_IDLE" : "SESSION");
      throw new ApiError(code, res.status, j?.error?.details || null);
    }
  }

  async function otpSend(to){ return call("POST", "/auth/otp/send", { to, app }, { auth:false }); }
  async function otpVerify(to, code){ const d = await call("POST", "/auth/otp/verify", { to, code, app }, { auth:false }); setSession(d.session, d.actor); return d.actor; }
  /* Вход из прошлого раза: refresh token в localStorage → сессия и actor. */
  async function restore(){
    if (!on || !rtGet()) return null;
    try { if (!(await refresh())) return null; } catch(e) { if (e.code === "NETWORK") throw e; return null; }
    return actor;
  }
  async function signOut(){
    try { if (access) await call("POST", "/auth/logout", undefined, { passive:true }); } catch(e) {}
    clear();
  }

  /* Текст ошибки на языке экрана: api_e_<код>, иначе — общий по виду ошибки. */
  function errText(e){
    const code = e instanceof ApiError ? e.code : "NETWORK";
    const k = "api_e_" + code;
    if (t(k) !== k) return code === "PROMO_INVALID" && e.details?.reason && t(e.details.reason) !== e.details.reason ? t(e.details.reason) : t(k);
    if (!(e instanceof ApiError)) console.error(e);
    return t(e.status >= 500 ? "api_e_INTERNAL" : "api_e_GENERIC");
  }
  /* Выгрузка-файл: имя — из content-disposition. */
  async function download(path, body, fallback){
    const res = await call("POST", path, body, { file:true });
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("content-disposition") || "");
    const name = m ? decodeURIComponent(m[1]) : fallback;
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href:url, download:name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    return name;
  }
  /* Фоновый опрос: только пока вкладка видна; anon — и без входа (настройки сайта). */
  function poll(ms, fn, anon = false){
    let busy = false;
    const tick = async () => { if (busy || document.visibilityState !== "visible" || (!actor && !anon)) return; busy = true; try { await fn(); } catch(e) { if (e.code !== "NETWORK") console.warn("poll", e.code || e); } finally { busy = false; } };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
    return setInterval(tick, ms);
  }

  // Другая вкладка вышла — выходим и здесь.
  window.addEventListener("storage", e => { if (on && e.key === RT_KEY && !e.newValue && actor) lose("SESSION"); });

  return { on, app, base, remote:d => on && domains[d] !== "local", call, uuid, otpSend, otpVerify, restore, signOut, refresh,
    errText, download, poll, actor:() => actor, setActor:a => { actor = a; }, onLost:fn => lostFns.push(fn), booting:on };
})();
/* Логин: телефон Узбекистана или e-mail (кабинет и админка входят кодом на почту). */
const apiLoginId = v => { const s = String(v ?? "").trim(); if (s.includes("@")) return validEmail(s) && s ? s.toLowerCase() : null; return validPhone(s) ? "+" + digits(s) : null; };
/* Длина кода из письма или SMS: у Supabase по умолчанию 6 цифр. */
const API_OTP_LEN = Number.isInteger(CONFIG.api?.otpLength) ? CONFIG.api.otpLength : 6;
/* Деньги сервера: суммы в сумах; доллары для показа — по курсу заказа или текущему. */
const apiAmt = (uzs, rate) => ({ uzs:Math.round(Number(uzs) || 0), usd:Math.round((Number(uzs) || 0) / (rate || sysRate())) });
const apiTs = s => s ? Date.parse(s) || 0 : 0;
/* Поле ввода кода: в демо — 4 цифры и вход сам по 4-й; с сервером — API_OTP_LEN. */
function apiOtpInput(id, verify){
  window.addEventListener("input", e => {
    if (!API.on || e.target.id !== id) return;
    e.stopImmediatePropagation();
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, API_OTP_LEN);
    if (e.target.value.length === API_OTP_LEN) verify();
  }, true);
}
function apiOtpPatch(id){
  const el = document.getElementById(id); if (!API.on || !el) return;
  el.maxLength = API_OTP_LEN; el.placeholder = "•".repeat(API_OTP_LEN);
  const hint = el.nextElementSibling; if (hint && hint.matches("p.small")) hint.textContent = t("api_otp_hint");
}

/* ---- заказ сервера → заказ демо ----
   Демо считает строки чека и документы из details — сервер хранит те же
   details (расчёт цены — тот же код). Суммы: total — стоимость услуги после
   скидки, fee — сбор агентства; в сумах из базы, доллары — по курсу заказа. */
const API_ST_FROM_TS = [["pricedAt", "PENDING"], ["paidAt", "PAID"], ["confirmedAt", "CONFIRMED"], ["completedAt", "COMPLETED"], ["cancelledAt", "CANCELLED"], ["refundedAt", "REFUNDED"]];
function apiOrderRate(x){
  const m = x.money, q = x.details?.quote;
  if (m?.currency === "USD" && m.fxRateMicro) return m.fxRateMicro / 1e4;          // сумов за доллар
  return q?.rate || sysRate();
}
function apiOrderMoney(x){
  const m = x.money, q = x.details?.quote, rate = apiOrderRate(x); if (!m) return { total:null, fee:null, feeBps:null };
  const usdMinor = v => Math.round((Number(v) || 0) / 100), net = (Number(m.amountMinor) || 0) - (Number(m.discountMinor) || 0);
  const total = q?.total || (m.currency === "USD" ? { usd:usdMinor(net), uzs:toUzsAt(usdMinor(net), rate) } : apiAmt(net, rate));
  const feeUzs = m.currency === "USD" ? Math.max(0, (Number(m.debitUzs) || 0) - total.uzs) : Number(m.feeMinor) || 0;
  const fee = m.feeMinor ? { uzs:feeUzs, usd:m.currency === "USD" ? usdMinor(m.feeMinor) : Math.ceil(total.usd * (m.feeRateBps || 0) / 10000) } : null;
  return { total, fee, feeBps:m.feeRateBps ?? null };
}
function apiOrder(x, prev = null){
  const details = x.details || prev?.details || { kind:String(x.serviceType || "").toLowerCase() };
  const { total, fee, feeBps } = apiOrderMoney({ ...x, details });
  const q = details.quote, m = x.money, at = apiTs(x.createdAt);
  const history = [{ s:x.pricedAt && !x.paidAt && apiTs(x.pricedAt) === at ? "PENDING" : "NEW", at }];
  for (const [k, s] of API_ST_FROM_TS) if (x[k] && !(s === "PENDING" && history[0].s === "PENDING")) history.push({ s, at:apiTs(x[k]) });
  history.sort((a, b) => a.at - b.at);
  const paid = !!x.paidAt, refunded = m?.refundedUzs != null;
  const refund = (x.status === "REFUNDED" || x.status === "CANCELLED") && paid
    ? { rate:total?.uzs ? (Number(m?.penaltyMinor) || 0) / total.uzs : 0, penalty:Number(m?.penaltyMinor) || 0, uzs:Number(m?.refundedUzs) || 0, at:apiTs(x.refundedAt || x.cancelledAt), done:x.status === "REFUNDED" || refunded } : null;
  const client = x.client || {};
  return { id:x.id, no:x.orderNo, type:x.serviceType, status:x.status, createdAt:at, title:x.title || "", sub:"", start:x.serviceStart || "", end:x.serviceEnd || x.serviceStart || "",
    total, fee, feeBps, method:prev?.method || (x.channel === "B2B" && paid ? "balance" : x.channel === "OFFICE" ? "cash" : null),
    travellers:prev?.travellers || (client.name ? [{ given:client.name, surname:"" }] : []),
    contact:{ phone:client.phone ? prettyPhone(client.phone) : "", email:client.email || "" }, client:client.name || "",
    details, req:prev?.req || null, amend:prev?.amend || null, paidAt:paid ? apiTs(x.paidAt) : null, history, refund,
    ...(q?.promo && m?.discountMinor ? { promo:q.promo, gross:q.gross } : {}),
    clientId:prev?.clientId || null, channel:x.channel, companyId:x.companyId, version:x.version, payableUntil:apiTs(x.payableUntil), srv:x };
}
/* Карточка заказа: путешественники (паспорт — в маске, если нет права) и заявки. */
function apiOrderFull(d, prev){
  const o = apiOrder(d.order, prev);
  if (Array.isArray(d.travellers) && d.travellers.length) o.travellers = d.travellers.map(x => ({ surname:x.surname, given:x.given, passport:x.passport || "", gender:x.gender || "", dob:x.dob || "", expiry:x.expiry || "", cit:x.cit || "" }));
  const r = (d.requests || []).filter(x => x.kind !== "AMENDMENT").at(-1);
  // Изменение пассажиров у поставщика (после оплаты): открытые — на карточке заказа админки.
  o.amend = (d.requests || []).filter(x => x.kind === "AMENDMENT" && x.status === "OPEN")
    .map(x => ({ id:x.id, at:apiTs(x.createdAt), diff:(prev?.amend || []).find(y => y.id === x.id)?.diff || null }));
  o.req = r ? { kind:r.kind === "CANCEL" ? "cancel" : r.kind === "CHANGE_DATE" ? "date" : "other", note:r.note || "", at:apiTs(r.createdAt), status:r.status === "OPEN" ? null : r.status === "DONE" ? "done" : "declined", reply:r.reply || "", id:r.id } : null;
  if (Array.isArray(d.events) && d.events.length) o.history = d.events.map(e => ({ s:e.to, at:apiTs(e.at) }));
  return o;
}
/* Проводка журнала баланса → строка выписки демо. */
const API_LEDGER_KIND = { TOPUP:"topup", PAYMENT:"order", REFUND:"refund", ADJUST:"adjust" };
function apiLedger(l, topups = []){
  const p = l.topupId && topups.find(x => x.id === l.topupId);
  return { id:l.id, at:apiTs(l.createdAt), kind:API_LEDGER_KIND[l.type] || "adjust", amount:Number(l.delta) || 0, after:Number(l.balanceAfter) || 0,
    orderId:l.orderId || undefined, method:p?.method || (/\((CARD|BANK|CASH)\)/.exec(l.description || "")?.[1] || "bank").toLowerCase(), reason:l.reason || l.description || "" };
}
const API_TOPUP_ST = { PENDING:"pending", CONFIRMED:"done", REJECTED:"rejected", CANCELLED:"rejected" };
const apiTopup = p => ({ id:p.id, at:apiTs(p.createdAt), amount:Number(p.amount) || 0, method:String(p.method || "bank").toLowerCase(), status:API_TOPUP_ST[p.status] || "pending",
  reason:p.rejectReason || "", doneAt:apiTs(p.confirmedAt || p.rejectedAt), companyId:p.companyId, version:p.version });
/* Бренд агентства: сервер — logoUrl, демо — logo. */
const apiBrand = (b, fallbackName) => ({ name:b?.name || fallbackName || "", phone:b?.phone || "", email:b?.email || "", address:b?.address || "", telegram:b?.telegram || "",
  instagram:b?.instagram || "", website:b?.website || "", color:/^#[0-9a-f]{6}$/i.test(b?.color || "") ? b.color : "#16275C", logo:b?.logoUrl || null,
  bank:b?.bank || "", acc:b?.acc || "", mfo:b?.mfo || "" });
/* Бренд для сервера: те же поля, что в демо, в виде, который принимает сервер
   (сайт без протокола или http:// → https://, t.me/имя → @имя, счёт и МФО — цифры). */
const API_BRAND_KEYS = ["name", "phone", "email", "address", "telegram", "instagram", "website", "bank", "acc", "mfo", "color"];
function apiBrandOut(b){
  const o = Object.fromEntries(API_BRAND_KEYS.map(k => [k, String(b?.[k] ?? "").trim()]));
  if (o.website) o.website = /^https?:\/\//i.test(o.website) ? o.website.replace(/^http:\/\//i, "https://") : "https://" + o.website;
  const tg = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,32})\/?$/i.exec(o.telegram); if (tg) o.telegram = "@" + tg[1];
  const ig = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/i.exec(o.instagram); if (ig) o.instagram = "@" + ig[1];
  o.acc = digits(o.acc); o.mfo = digits(o.mfo);
  return o;
}
/* Параметры расчёта для POST /quotes из оформления демо (тип и details). */
function apiQuoteParams(type, d){
  if (type === "FLIGHT") return { service:"FLIGHT", from:d.out.from, to:d.out.to, depart:d.out.date, return:d.back?.date ?? null, cabin:d.q.cabin,
    adults:d.q.adults, children:d.q.children, infants:d.q.infants, outId:d.out.id, backId:d.back?.id ?? null };
  if (type === "HOTEL") return { service:"HOTEL", hotelId:d.hotelId, room:d.room, checkin:d.checkin, checkout:d.checkout, adults:d.adults, children:d.children, rooms:d.rooms };
  if (type === "TOUR") return { service:"TOUR", hotelId:d.hotelId, depart:d.depart, nights:d.nights, adults:d.adults, children:d.children };
  return null;
}
/* Путешественник для сервера: только заполненные поля (у «главного гостя» паспорта нет). */
const apiTraveller = x => Object.fromEntries(Object.entries({ surname:x.surname, given:x.given, passport:x.passport, gender:x.gender, dob:x.dob, expiry:x.expiry, cit:x.cit })
  .filter(([, v]) => typeof v === "string" && v.trim()));
const apiPhone = v => "+" + digits(v);
/* Сохранённый пассажир сервера (/travellers, /agency/clients, /admin/travellers):
   в списках номер паспорта только в маске (passportMask); полный — после reveal. */
const API_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apiSaved = x => ({ id:x.id, book:x.book, surname:x.surname, given:x.given, passportMask:x.passportMask || "", gender:x.gender || "", dob:x.dob || "",
  expiry:x.expiry || "", cit:x.cit || "UZB", self:!!x.self, phone:x.phone ? prettyPhone(x.phone) : "", email:x.email || "" });
const apiSavedFull = x => ({ ...apiSaved(x), passport:x.passport || "" });
/* Путешественник оформления: поля, согласие на сохранение после оплаты (save —
   галочка формы, только с паспортом), из кого заполнен (savedId), «это я»
   (сайт: первый пассажир, пока «это я» нет). */
function apiCheckoutTraveller(x, i, c){
  const save = c.mode === "full" && x.save !== false;
  // Гость отеля (lead): только имя — паспорт и даты форма не спрашивала.
  const base = c.mode === "full" ? apiTraveller(x) : apiTraveller({ surname:x.surname, given:x.given });
  return { ...base, save, ...(save && API_UUID.test(x.fromId || "") ? { savedId:x.fromId } : {}),
    ...(save && APP === "b2c" && i === 0 && !S.travellers.some(v => v.self) ? { self:true } : {}) };
}

/* ---- общие настройки, направления, содержимое сайта с сервера ----
   С сервером эти данные не читаются из localStorage: снимок сервера (APIX)
   подменяет sysCfg(), prices(), loadDirections() и cmsLoad(). */
const APIX = { sys:null, prices:null, dirs:null, cms:null, pricingVersion:0, today:"" };
function apiUseServerData(){
  if (!API.on) return;
  sysCfg = () => SYS_CACHE || (SYS_CACHE = APIX.sys || sysDefaults());
  prices = () => PRICES || (PRICES = APIX.prices || pricesClean({}));
  loadDirections = () => APIX.dirs || [];
  if (API.remote("cms")) cmsLoad = () => CMS_CACHE || (CMS_CACHE = APIX.cms || apiCmsEmpty());
  SYS_CACHE = null; PRICES = null; CMS_CACHE = null; TZF = null;          // кэш мог прочитать демо-данные при загрузке
  applyDirections();
}
/* Настройки из /public/config или /admin/settings — в форму sysClean (части,
   которых сервер сайту не отдаёт, остаются по умолчанию). */
function apiSys(parts, rate){
  const d = sysDefaults(), maint = parts.maint || {};
  return sysClean({ v:1, cur:{ rate:Number.isInteger(rate) ? rate : parts.cur?.rate ?? d.cur.rate, usd:parts.cur?.usd ?? true, def:parts.cur?.def },
    langs:parts.langs, tz:parts.tz, pay:parts.pay, ch:parts.channels ? { email:parts.channels.email, sms:parts.channels.sms, telegram:parts.channels.telegram } : d.ch,
    notify:parts.notify || d.notify, sec:parts.sec || d.sec, maint:{ on:!!maint.on, msg:maint.msg, at:apiTs(maint.since), by:maint.by || "" } });
}
function apiApplyPublicConfig(c){
  const s = c.settings || {};
  APIX.sys = apiSys({ cur:{ usd:s.currency?.usd, def:s.currency?.def }, langs:s.langs, tz:{ zone:s.tz }, pay:s.pay,
    maint:{ on:!!s.maintenance?.on || c.maintenance === true, msg:s.maintenance?.msg, since:s.maintenance?.since } }, c.rate);
  // Сайту сервер отдаёт сбор и переключатели услуг; поправки цен — только в расчёте (/quotes).
  const svc = Object.fromEntries(SVC_TYPES.map(k => [k, { on:c.services?.[k]?.on !== false }]));
  APIX.prices = pricesClean({ feeBps:c.feeBps, svc });
  APIX.pricingVersion = c.pricingVersion || 0; APIX.today = c.today || "";
  SYS_CACHE = null; PRICES = null; TZF = null;
}
function apiApplyDirections(items){
  APIX.dirs = (items || []).filter(validDirection);
  applyDirections();
  if (typeof GL !== "undefined") GL.key = null;
}
const apiCmsEmpty = () => ({ v:1, texts:{}, site:{ title:{ ru:"", uz:"", en:"" }, desc:{ ru:"", uz:"", en:"" }, logo:null, favicon:null, phone:"", email:"", address:{ ru:"", uz:"", en:"" },
  socials:{ telegram:"", instagram:"", facebook:"", youtube:"" }, foot:{ contacts:true, socials:true } }, items:[], home:cmsHomeClean([]), hist:{ texts:{}, site:{} } });
/* Содержимое сайта: публичное ({items, texts:{k:{ru,uz,en}}, site:{f:v}, home:[…]})
   или админки ({texts:{k:{value,version}}, site:{f:{value,version}}, home:{blocks}}). */
function apiCmsDoc(d){
  const val = v => v && typeof v === "object" && "value" in v ? v.value : v;
  const e = apiCmsEmpty(), site = { ...e.site };
  for (const [k, v] of Object.entries(d.site || {})) site[k] = val(v) ?? e.site[k];
  const texts = {};
  for (const [k, v] of Object.entries(d.texts || {})) { const x = val(v); if (x && CMS_LANGS.some(l => x[l])) texts[k] = { ru:x.ru || "", uz:x.uz || "", en:x.en || "" }; }
  const items = (d.items || []).map(x => ({ ...x, status:x.status || "published", deleted:apiTs(x.deletedAt), at:apiTs(x.updatedAt || x.createdAt), by:x.updatedByName || "",
    order:Number.isInteger(x.order) ? x.order : 0, ...(x.type === "page" || x.type === "link" ? { mo:Number.isInteger(x.mo) ? x.mo : x.order || 0 } : {}) }));
  return { v:1, texts, site, items, home:cmsHomeClean(Array.isArray(d.home) ? d.home : d.home?.blocks), hist:{ texts:{}, site:{} } };
}
function apiApplyCms(d){ APIX.cms = apiCmsDoc(d); CMS_CACHE = null; }
/* Сайт и кабинет: настройки, направления (и содержимое сайта — только сайту). */
async function apiLoadPublic(withCms){
  const [c, dirs, cms] = await Promise.all([API.call("GET", "/public/config", undefined, { auth:false }), API.call("GET", "/public/destinations", undefined, { auth:false }),
    withCms ? API.call("GET", "/public/cms", undefined, { auth:false }) : null]);
  const was = JSON.stringify([APIX.sys, APIX.prices, APIX.dirs, APIX.cms]);
  apiApplyPublicConfig(c); apiApplyDirections(dirs.items); if (cms) apiApplyCms(cms);
  return was !== JSON.stringify([APIX.sys, APIX.prices, APIX.dirs, APIX.cms]);
}
/* Строки чека из расчёта сервера: у рейса — по пассажирам, у остального — одной суммой. */
function apiQuoteLines(q){
  if (q.service !== "FLIGHT") return [[q.title || t("total"), q.gross]];
  const name = { adults:t("adults"), children:t("children"), infant_fare:t("infants") };
  return (q.lines || []).map(l => [`${name[l.key] || t("passengers")}${l.n ? " × " + l.n : ""}`, l.amount]);
}
/* Расчёт цены для оформления (сайт — B2C, кабинет — B2B). */
async function apiQuote(c, channel){
  const params = apiQuoteParams(c.type, c.details); if (!params) throw new ApiError("NOT_SUPPORTED");
  const d = await API.call("POST", "/quotes", { channel, params, ...(c.promoCode ? { promoCode:c.promoCode } : {}) });
  if (!d.orderable) throw new ApiError("NOT_SUPPORTED");
  return d.quote;
}
const apiQuoteFresh = q => !!q && apiTs(q.expiresAt) - Date.now() > 60_000;
/* Оформление открыто: цену считает сервер. Совпала с экраном — «ok»; другая —
   блок «Цена изменилась» с суммой сервера; ошибка сети — оплата пересчитает. */
function apiCheckoutRecheck(channel){
  const c = M.checkout; if (!c || c.qBusy) return;
  c.qBusy = true; c.pstate = "checking"; c.recheck = true;
  apiQuote(c, channel).then(q => {
    if (M.checkout !== c) return;
    c.quote = q; const base = c.pstate === "changed" ? c.pending.total : c.total;
    if (q.gross.usd === base.usd && q.gross.uzs === base.uzs) c.pstate = "ok";
    else { c.pending = { total:q.gross, lines:apiQuoteLines(q), details:{ ...c.details, ...q.details } }; c.pstate = "changed"; }
  }).catch(e => {
    if (M.checkout !== c) return;
    if (e.code === "NETWORK" || e.status >= 500) { c.pstate = "ok"; toast(API.errText(e)); return; }
    if (e.code === "PROMO_INVALID" && c.promoCode) { c.promoCode = null; c.pstate = "ok"; toast(API.errText(e)); return; }
    M.checkout = null; toast(API.errText(e)); go(SEARCH_PATH);
  }).finally(() => { c.qBusy = false; if (M.checkout === c && currentParts()[0] === "checkout") rerender(); });
}
