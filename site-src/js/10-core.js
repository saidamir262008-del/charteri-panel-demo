/* ==========================================================================
   Ядро сайта: состояние, язык, деньги, даты, маршрутизация, общие элементы.
   ========================================================================== */
"use strict";

/* ---- DOM и мелочи ---- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = p => p + Date.now().toString(36) + Math.floor(Math.random()*1e6).toString(36);

/* ---- детерминированный генератор (как в src/data/flights.ts) ---- */
function seedFrom(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function mulberry32(seed){ let a=seed; return () => { a|=0; a=(a+0x6d2b79f5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

/* ---- даты: только локальный календарь. toISOString() в Ташкенте (UTC+5)
        сдвинул бы полночь на предыдущий день. ---- */
const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const parseYMD = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate()+n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 864e5);
const TODAY = ymd(new Date());

/* ---- сохраняемое состояние ---- */
/* APP подставляет build.py: "b2c" — сайт для пассажиров, "b2b" — кабинет агентства,
   "admin" — админка Charteri. Демо живут на одном домене и видят данные друг
   друга: админка работает с данными кабинета (S) и читает данные сайта. */
const CAB_KEY = "charteri.panel.demo.v2", SITE_KEY = "charteri.site.demo.v1";
const LS_KEY = APP === "b2c" ? SITE_KEY : CAB_KEY;
/* Где форма поиска: на сайте — главная, в кабинете — страница «Бронирование». */
const SEARCH_PATH = APP === "b2c" ? "" : "book";
let S;
/* rev растёт с каждой записью: другая вкладка видит, что данные новые. */
function save(){ try { S.rev = (S.rev || 0) + 1; localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch(e) {} }
function loadState(){
  try { const r = JSON.parse(localStorage.getItem(LS_KEY)); if (r && r.v === 1) return r; } catch(e) {}
  return null;
}
/* Перед любым изменением денег — свежие данные из хранилища: другая вкладка
   (кабинет ↔ админка) могла записать их только что, а событие storage ещё в пути. */
function refresh(){ const f = loadState(); if (f) S = f; return S; }
/* Другая вкладка записала данные — берём их и перерисовываем. Сброс демо
   (ключ удалён) — перезагружаемся, чтобы не записать старые данные обратно. */
window.addEventListener("storage", e => {
  if (e.key !== LS_KEY) return;
  if (e.newValue === null) { location.reload(); return; }
  let next; try { next = JSON.parse(e.newValue); } catch(err) { return; }
  if (!next || next.v !== 1) return;
  S = next; onExternalChange();
});
/* Если человек печатает — перерисовываем только меню, чтобы не сбить ввод;
   иначе перерисовываем страницу и возвращаем фокус на тот же элемент. */
function onExternalChange(){
  const f = document.activeElement;
  if (f && f.matches?.("input, textarea, select") && $("#app")?.contains(f)) { renderNav(matchRoute(currentParts()).key); return; }
  const key = focusKey(f); rerender(); refocus(key);
}
/* Как найти «тот же» элемент после перерисовки: по id, действию или ссылке. */
function focusKey(el){
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return "#" + CSS.escape(el.id);
  if (el.dataset?.act) return ["act", "v", "k", "src", "ag", "s"].filter(k => el.dataset[k] != null)
    .map(k => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join("");
  if (el.matches?.("a[href]")) return `a[href="${CSS.escape(el.getAttribute("href"))}"]`;
  return null;
}
function refocus(key){ if (key) $(key)?.focus({ preventScroll:true }); }

/* ---- общие настройки Charteri из админки ----
   Сбор и наценку меняет админка; сайт и кабинет берут их отсюда.
   Пока админка открыта, она раз в несколько секунд отмечается в OPS_HB —
   тогда демо не отвечает за оператора само (цена чартера, пополнения, возвраты). */
const PRICES_KEY = "charteri.ops.prices", OPS_HB = "charteri.ops.hb", APPS_KEY = "charteri.ops.apps";
/* Номера, для которых Charteri закрыл бронирование: список ведёт админка. */
const BLOCK_KEY = "charteri.ops.blocked";
const phoneBlocked = p => { const d = String(p ?? "").replace(/\D/g, ""), l = readJSON(BLOCK_KEY, []); return !!d && Array.isArray(l) && l.includes(d); };
const readJSON = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch(e) { return fallback; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
const PRICE_DEFAULTS = { feeBps:300, flightMarkupBps:1000 };
const OPS_LIVE_MS = 90000;               // фоновую вкладку браузер будит редко — окно с запасом
let PRICES = null;
function prices(){
  if (PRICES) return PRICES;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(PRICES_KEY) || "{}") || {}; } catch(e) {}
  const ok = v => Number.isInteger(v) && v >= 0 && v <= 5000;
  PRICES = { feeBps: ok(saved.feeBps) ? saved.feeBps : PRICE_DEFAULTS.feeBps, flightMarkupBps: ok(saved.flightMarkupBps) ? saved.flightMarkupBps : PRICE_DEFAULTS.flightMarkupBps };
  return PRICES;
}
/* Каждая вкладка админки отмечается своей строкой: закрыли одну — другие на месте. */
function opsLive(){
  const hb = readJSON(OPS_HB, {}), now = Date.now();
  return typeof hb === "object" && hb !== null && Object.values(hb).some(ts => now - Number(ts) < OPS_LIVE_MS);
}
window.addEventListener("storage", e => { if (e.key === PRICES_KEY) { PRICES = null; if (S) onExternalChange(); } });

/* ---- язык ---- */
const LIDX = { ru:0, uz:1, en:2 };
function t(k){
  const a = I18N[k]; if (a) return a[S.lang] ?? a.ru;
  const b = STR[k];  if (b) return b[LIDX[S.lang]] ?? b[0];
  return k;
}
function tf(k, v){ let s = t(k); for (const x in v) s = s.split("{"+x+"}").join(v[x]); return s; }
/* Склонение: русский — три формы, английский — две, узбекский — одна. */
function pl(n, key){
  const f = PL[key][S.lang]; let w;
  if (S.lang === "ru") { const a=n%10, b=n%100; w = (a===1 && b!==11) ? f[0] : (a>=2 && a<=4 && (b<12 || b>14)) ? f[1] : f[2]; }
  else if (S.lang === "en") w = n === 1 ? f[0] : f[1];
  else w = f[0];
  return `${n} ${w}`;
}
const LOC = { ru:"ru-RU", uz:"uz-Latn-UZ", en:"en-GB" };
/* Узбекскую локаль браузеры знают плохо: Chrome выводит «M10 7, Wed».
   Поэтому для узбекского — свои названия и принятый порядок «7-oktabr». */
const UZ_M  = ["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"];
const UZ_MS = ["yan","fev","mar","apr","may","iyn","iyl","avg","sen","okt","noy","dek"];
const UZ_WD = ["Yak","Du","Se","Ch","Pa","Ju","Sh"];
function uzDate(d, o){
  const core = `${d.getDate()}-${(o.month === "long" ? UZ_M : UZ_MS)[d.getMonth()]}`;
  return `${o.weekday ? UZ_WD[d.getDay()] + ", " : ""}${o.year ? d.getFullYear() + "-yil " : ""}${core}`;
}
function fdate(s, o={ day:"numeric", month:"short" }){
  try { const d = parseYMD(s); return S.lang === "uz" ? uzDate(d, o) : d.toLocaleDateString(LOC[S.lang], o); } catch(e) { return s; }
}
const fdateLong = s => fdate(s, { weekday:"short", day:"numeric", month:"long" });
const fdateY    = s => fdate(s, { day:"numeric", month:"long", year:"numeric" });
const fdt = ms => { const d = new Date(ms), hm = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  return S.lang === "uz" ? `${uzDate(d, {})}, ${hm}` : d.toLocaleString(LOC[S.lang], { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); };
const dur = m => Math.floor(m/60) + t("h") + " " + String(Math.round(m%60)).padStart(2,"0") + t("m");
const AP = iata => AIRPORTS.find(a => a.iata === iata);
const cityName = iata => AP(iata)?.city[S.lang] ?? iata;
const countryName = iata => AP(iata)?.country[S.lang] ?? "";

/* ---- деньги ----
   Сумма — пара {usd, uzs}. Сумы считаются из тех же единичных цен, что в
   приложении (цена в USD × 12 650, с округлением до тысячи), и складываются
   попарно, а не пересчитываются из итога — иначе итог разошёлся бы с суммой
   строк на тысячу-другую сумов. */
const NB = " ";                                    // брендбук: узкий неразрывный пробел
const grp = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
const toUzs = usd => Math.round(usd * USD_TO_UZS / 1000) * 1000;
const amt  = usd => ({ usd: Math.round(usd), uzs: toUzs(Math.round(usd)) });
const addA = (...xs) => xs.reduce((s, x) => ({ usd: s.usd + x.usd, uzs: s.uzs + x.uzs }), { usd:0, uzs:0 });
const mulA = (a, n) => ({ usd: a.usd * n, uzs: a.uzs * n });
const pctA = (a, k) => ({ usd: Math.round(a.usd * k), uzs: Math.round(a.uzs * k / 1000) * 1000 });
const fmt  = a => S.cur === "USD" ? "$" + grp(a.usd) : grp(a.uzs) + NB + t("cur_uzs");
const priceFrom = x => S.lang === "uz" ? `${x} ${t("price_from")}` : `${t("price_from")} ${x}`;

/* ---- телефон ---- */
const digits = v => String(v).replace(/\D/g, "");
const validPhone = v => /^998\d{9}$/.test(digits(v));
const prettyPhone = v => { const d = digits(v).replace(/^998/, ""); return d.length === 9 ? `+998 ${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,7)} ${d.slice(7)}` : v; };
const validEmail = v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/* ---- рабочее состояние: поиск и выбор по каждому модулю ---- */
const M = { module: "flights", ui: {}, checkout: null, returnTo: null };
const MODULES = {};          // модули регистрируют себя: id → { type, icon, label, form(), search() }
const MODULE_ORDER = ["flights","tours","hotels","jet","heli"];
const PAGES = {};            // маршрут → { render(params), after(params) }
const ACT = {};              // data-act → обработчик

/* ---- маршрутизация: #/путь ---- */
function currentParts(){ return location.hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean); }
function matchRoute(parts){
  for (const key of Object.keys(PAGES)) {
    const kp = key.split("/").filter(Boolean);
    if (kp.length !== parts.length) continue;
    const params = {}; let ok = true;
    kp.forEach((seg, i) => { if (seg.startsWith(":")) params[seg.slice(1)] = safeDecode(parts[i]); else if (seg !== parts[i]) ok = false; });
    if (ok) return { key, params };
  }
  return { key: "", params: {} };
}
/* Битая %-последовательность в ссылке не должна ронять страницу. */
function safeDecode(s){ try { return decodeURIComponent(s); } catch(e) { return s; } }
function go(path){ const h = "#/" + path; if (location.hash === h) render(true); else location.hash = h; }
/* routeGuard — необязательный хук приложения: вернуть ключ страницы, на которую
   нужно попасть вместо запрошенной (кабинет агентства без входа — на вход). */
function render(scrollTop = true){
  applyTheme();
  const m = matchRoute(currentParts()), guard = typeof routeGuard === "function" ? routeGuard(m.key) : null;
  // "" — тоже перенаправление (на главную); «не перенаправлять» — только null.
  const { key, params } = guard != null ? { key:guard, params:{} } : m;
  const page = PAGES[key] || PAGES[""];
  let html;
  try { html = page.render(params); }
  catch (e) { console.error(e); html = `<div class="container section"><div class="err">${esc(t("err_generic"))}</div></div>`; }
  if (html === null) return;                        // страница перенаправила
  $("#app").innerHTML = html;
  renderNav(key);
  // Новая страница открывается сверху сразу: плавная прокрутка html{scroll-behavior}
  // иначе протащила бы её через всю высоту предыдущей.
  if (scrollTop) window.scrollTo({ top: 0, behavior: "instant" });
  slideIndicators(); countUps(); rollStepper(); launchFlights();
  announcePage(scrollTop);
  page.after?.(params);
}
/* Новая страница: заголовок вкладки — по её h1, фокус — на h1, чтобы клавиатура
   и экранный диктор начинали с неё, а не с начала документа. Перерисовка той
   же страницы (фильтр, степпер) фокус не трогает. */
const BASE_TITLE = document.title;
function announcePage(isNav){
  const h = $("#app h1");
  document.title = h && currentParts().length ? `${h.textContent.trim()} — ${BASE_TITLE.split(" — ")[0]}` : BASE_TITLE;
  if (!isNav || !h || !announcePage.ready) { announcePage.ready = true; return; }
  if ($("#app").contains(document.activeElement)) return;
  h.tabIndex = -1; h.focus({ preventScroll:true });
}
const rerender = () => render(false);
/* Переход на другую страницу: каскад и табло снова разрешены, смена — через
   View Transitions. Перерисовка той же страницы (фильтр, степпер) — без них. */
window.addEventListener("hashchange", () => {
  M.ui.listKey = null; M.ui.boardDone = false; M.ui.arcSeen = false;
  withTransition(() => render(true));
});
window.addEventListener("resize", () => slideIndicators(false));
document.fonts?.ready.then(() => slideIndicators(false));

function applyTheme(){
  const r = document.documentElement;
  if (S.theme === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", S.theme);
  r.lang = S.lang;
}

/* ---- уведомления и оверлей ---- */
function toast(msg){
  const h = $("#toast"); h.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toast.t); clearTimeout(toast.u);
  toast.t = setTimeout(() => { h.firstChild?.classList.add("out"); toast.u = setTimeout(() => h.innerHTML = "", 180); }, 2800);
}
function overlay(msg){ $("#overlay").innerHTML = msg ? `<div class="overlay"><div class="box"><span class="spin"></span>${esc(msg)}</div></div>` : ""; }
function showErr(sel, msg){ const e = $(sel); if (!e) return; e.setAttribute("role", "alert"); e.hidden = false; e.textContent = msg; e.scrollIntoView({ block:"center", behavior:"smooth" }); shake(e); }
function hideErr(sel){ const e = $(sel); if (e) { e.hidden = true; e.textContent = ""; } }

/* ---- привязка полей к состоянию: data-bind="flights.from" ---- */
function setPath(obj, path, val){ const ks = path.split("."); let o = obj; for (let i = 0; i < ks.length-1; i++) o = o[ks[i]]; o[ks.at(-1)] = val; }
function onField(e){
  const el = e.target;
  if (el.dataset.bind) {
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.num !== undefined) v = Number(v);
    setPath(M, el.dataset.bind, v);
    if (e.type === "change" && el.dataset.rr !== undefined) rerender();
  }
  if (el.dataset.tv !== undefined && M.checkout) {             // поля путешественника в оформлении
    const f = el.dataset.f; let v = el.value;
    if (["surname","given","passport"].includes(f)) { v = v.toUpperCase(); if (f === "passport") v = v.replace(/\s/g, ""); }
    M.checkout.travellers[Number(el.dataset.tv)][f] = v;
  }
  if (el.dataset.ct && M.checkout) M.checkout.contact[el.dataset.ct] = el.value;
}
document.addEventListener("input", onField);
document.addEventListener("change", onField);
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  const had = document.activeElement === el, twin = focusKey(el);
  fn(el, e);
  // Перерисовка заменила нажатую кнопку — фокус переходит на её копию, а если
  // её больше нет (задача решена) — на заголовок страницы. Если обработчик сам
  // поставил фокус (поле причины), его не трогаем.
  if (!had || el.isConnected) return;
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const same = twin && $(twin);
  if (same && !same.disabled) same.focus({ preventScroll:true });
  else { const h = $("#app h1"); if (h) { h.tabIndex = -1; h.focus({ preventScroll:true }); } }
});
/* <details> не всплывает событием toggle — ловим на погружении, чтобы
   выпадающие панели оставались открытыми после перерисовки. */
document.addEventListener("toggle", e => {
  const d = e.target; if (d.dataset?.keep) M.ui[d.dataset.keep] = d.open;
  if (d.open && d.querySelector?.("[data-ind]")) slideIndicators(false);
}, true);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $$("details[open].drop").forEach(d => { d.open = false; if (d.dataset.keep) M.ui[d.dataset.keep] = false; });
});
document.addEventListener("click", e => {                   // клик вне выпадающей панели закрывает её
  // Если клик перерисовал страницу (степпер внутри панели), цель уже отсоединена
  // от документа — это был клик внутри, закрывать нельзя.
  if (!e.target.isConnected) return;
  $$("details[open].drop").forEach(d => { if (!d.contains(e.target)) { d.open = false; if (d.dataset.keep) M.ui[d.dataset.keep] = false; } });
});

/* ---- иконки ---- */
const PLANE_PATH = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";
const PLANE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PLANE_PATH}"/></svg>`;
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  flights: svg('<path d="M3 15l7.5-2.2L14 20h2l-1.7-8.4L19.5 10c1.3-.4 1.9-1.6 1.5-2.5-.4-.9-1.7-1.2-3-.8l-5.3 1.6L7 3H5l2.7 6.3L4 10.4 2.5 9H1l2 6z"/>'),
  tours:   svg('<circle cx="17" cy="6" r="3"/><path d="M2 20c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5-.5"/><path d="M5 17l5-9 5 9"/><path d="M10 8V4"/>'),
  hotels:  svg('<path d="M3 20V9l9-5 9 5v11"/><path d="M8 20v-5h8v5"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>'),
  jet:     svg('<path d="M2 13h7l4-6h2l-2 6h5l2-2h2l-1 4 1 4h-2l-2-2h-5l2 6h-2l-4-6H2z"/>'),
  heli:    svg('<path d="M3 5h18M12 5v3"/><path d="M5 12a6 4 0 0 1 12 0v2a2 2 0 0 1-2 2H9l-4-4z"/><path d="M17 13h5M9 16l-1 3M15 16l1 3M7 19h10"/>'),
  back:    svg('<path d="M15 5l-7 7 7 7"/>'),
  chev:    svg('<path d="M9 5l7 7-7 7"/>'),
  swap:    svg('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  user:    svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/>'),
  bag:     svg('<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2"/>'),
  ok:      svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lock:    svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  clock:   svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  shield:  svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  globe:   svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>'),
  star:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>'
};
const stars = n => `<span class="stars" aria-label="${n}★">${IC.star.repeat(n)}</span>`;

/* ---- общие фрагменты интерфейса ---- */
function stepper(bind, val, min, max, label, sub){
  return `<div class="steprow"><div><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
    <div class="stepper">
      <button type="button" data-act="step" data-bind="${bind}" data-d="-1" data-min="${min}" data-max="${max}" ${val <= min ? "disabled" : ""} aria-label="−">−</button>
      <span>${val}</span>
      <button type="button" data-act="step" data-bind="${bind}" data-d="1" data-min="${min}" data-max="${max}" ${val >= max ? "disabled" : ""} aria-label="+">+</button>
    </div></div>`;
}
ACT.step = el => {
  const path = el.dataset.bind, ks = path.split("."), obj = ks.slice(0,-1).reduce((o,k) => o[k], M), k = ks.at(-1);
  const before = obj[k];
  obj[k] = clamp(obj[k] + Number(el.dataset.d), Number(el.dataset.min), Number(el.dataset.max));
  if (obj[k] !== before) M.ui.stepAnim = { bind:path, d:Number(el.dataset.d) };
  MODULES[ks[0]]?.normalize?.();
  rerender();
};
function seg(act, options, value, extra = ""){
  return `<div class="seg" role="group" data-ind="${act}"><span class="ind" aria-hidden="true"></span>${options.map(([v, l]) =>
    `<button type="button" data-act="${act}" data-v="${v}" ${extra} aria-pressed="${value === v}">${esc(l)}</button>`).join("")}</div>`;
}
function airportSelect(bind, value, exclude){
  // Скрытые в админке направления в списках не показываем.
  const uz = AIRPORTS.filter(a => !a.hidden && a.country.ru === "Узбекистан" && a.iata !== exclude);
  const intl = AIRPORTS.filter(a => !a.hidden && a.country.ru !== "Узбекистан" && a.iata !== exclude).sort((a, b) => b.popular - a.popular);
  const opt = a => `<option value="${a.iata}" ${a.iata === value ? "selected" : ""}>${esc(a.city[S.lang])} · ${a.iata}</option>`;
  return `<select data-bind="${bind}" data-rr>
    <optgroup label="${esc(t("grp_uzbekistan"))}">${uz.map(opt).join("")}</optgroup>
    <optgroup label="${esc(t("grp_international"))}">${intl.map(opt).join("")}</optgroup></select>`;
}
function routeBlock(o, extra = ""){
  const nd = nextDay(o);
  return `<div class="route">
    <div class="end"><span class="code">${o.from}</span><span class="city">${esc(cityName(o.from))}</span><span class="time">${o.depTime}</span></div>
    <div class="track"><span class="d">${dur(o.durationMin)}</span><span class="ln">${PLANE}</span>
      <span class="s ${o.stops ? "s-stop" : "s-direct"}">${o.stops ? esc(tf("via", { c: o.stopCity })) : esc(t("direct"))}</span>${extra}</div>
    <div class="end r"><span class="code">${o.to}</span><span class="city">${esc(cityName(o.to))}</span><span class="time">${o.arrTime}${nd ? ` <sup class="nd">+${nd}</sup>` : ""}</span></div>
  </div>`;
}
const nextDay = o => { const [h, m] = o.depTime.split(":").map(Number); return Math.floor((h*60 + m + o.durationMin) / 1440); };
/* Логотип авиакомпании на белой плитке. Квадратные цветные знаки (Air Arabia,
   flydubai) заполняют плитку целиком, круглые и «птицы» — с полями.
   Нет логотипа — плитка с кодом в цвете перевозчика. Подпись с названием
   всегда стоит рядом, поэтому alt пустой. */
const LOGO_FULL = new Set(["G9", "FZ"]);
const carrierBadge = (code, cls = "") => {
  if (LOGOS[code]) return `<span class="cb cb-logo ${LOGO_FULL.has(code) ? "cb-full" : ""} ${cls}"><img src="${LOGOS[code]}" alt="" width="34" height="34"></span>`;
  const b = CARRIER_BRANDS[code] || { bg:"var(--navy)", fg:"var(--paper)" };
  return `<span class="cb ${cls}" style="background:${b.bg};color:${b.fg}">${esc(code)}</span>`;
};
const CARRIER_BRANDS = {
  HY:{bg:"#16357F",fg:"#FFFFFF"}, FZ:{bg:"#EE7623",fg:"#0B1730"}, TK:{bg:"#C90822",fg:"#FFFFFF"},
  HH:{bg:"#0E8F6E",fg:"#FFFFFF"}, C4:{bg:"#1C7FC2",fg:"#FFFFFF"}, G9:{bg:"#E4002B",fg:"#FFFFFF"}
};
/* Открытка направления: фото города на фирменном градиенте. */
function postcard(city, sub = "", big = true){
  const [a, b] = PALETTE[city] || ["#2F6FE0", "#16275C"], ph = photo(city, { w:560, sizes:"(max-width:600px) 100vw, (max-width:900px) 50vw, 380px" });
  return `<div class="postcard ${big ? "" : "sm"} ${ph ? "has-ph" : ""}" style="--pa:${a};--pb:${b}">${ph}
    <span class="pc-code">${city}</span><span class="pc-city">${esc(cityName(city))}</span>${sub ? `<span class="pc-sub">${esc(sub)}</span>` : ""}</div>`;
}
function hotelArt(h, big = false){
  const [a, b] = PALETTE[h.city] || ["#2F6FE0", "#16275C"];
  const ph = photo(h.id, big ? { w:960, sizes:"(max-width:900px) 100vw, 760px", eager:true } : { w:440, sizes:"(max-width:600px) 100vw, 230px" });
  const initials = h.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2);
  return `<div class="hart ${ph ? "has-ph" : ""}" style="--pa:${a};--pb:${b};view-transition-name:h-${h.id}">${ph || `<span class="hart-m">${esc(initials)}</span>`}<span class="hart-s">${IC.star.repeat(h.stars)}</span></div>`;
}
/* Галерея на странице отеля: главный снимок и два поменьше — номер
   под звёздность отеля и бассейн или ресторан. */
function hotelGallery(h){
  const room = { 5:"room-suite", 4:"room-deluxe", 3:"room-standard" }[h.stars], extra = h.am.includes("pool") ? "extra-pool" : "extra-breakfast";
  const side = [room, extra].filter(hasPhoto);
  return `<div class="hgal ${side.length ? "" : "solo"}">${hotelArt(h, true)}${side.map(k => `<div class="hgal-s">${photo(k, { w:480, sizes:"(max-width:900px) 50vw, 380px" })}</div>`).join("")}</div>`;
}
/* Шапка выдачи: фото места назначения под строкой поиска. */
const resbarPhoto = key => hasPhoto(key) ? `<div class="resbar-ph" aria-hidden="true">${photo(key, { w:1400, sizes:"100vw", eager:true, deco:true, ar:2.4 })}</div>` : "";
const resbarCls = key => hasPhoto(key) ? "resbar has-ph" : "resbar";
/* Снимок для карточки заказа. */
function orderPhotoKey(o){
  const d = o.details;
  if (o.type === "FLIGHT") return d.out.to === "TAS" && d.out.from ? d.out.from : d.out.to;
  if (o.type === "TOUR" || o.type === "HOTEL") return d.hotelId;
  if (o.type === "JET") return d.to;
  return "heli-" + d.to;
}
const fboxOpen = () => (M.ui.filters ?? !window.matchMedia("(max-width: 900px)").matches) ? "open" : "";
const pageHead = (title, sub = "") => `<div class="pagehead"><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</div>`;
const backLink = (path, label) => `<a class="backlink" href="#/${path}">${IC.back}<span>${esc(label)}</span></a>`;
