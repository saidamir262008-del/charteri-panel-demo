/* ==========================================================================
   Заказ из админки: клиент пришёл в офис или позвонил. Сотрудник оформляет
   авиабилет или отель на пассажира сайта (B2C), клиент платит в офисе
   (наличными или терминалом) — заказ сразу оплачен и подтверждён, документ
   (посадочный талон или ваучер) печатается из карточки заказа и виден
   клиенту на сайте под его номером телефона.

   Цена — по каталогу (подставляется), сотрудник может её изменить: в офисе
   её называют клиенту. Каталог — по цене сайта (канал B2C), а не агентств,
   хотя админка считает за агентства. У авиабилета цена — за пассажира, чек
   собирается из неё, как на сайте. Отель — как на сайте: в номере не больше
   трёх гостей, номеров столько, сколько нужно. Заказ помечен channel:"office" —
   CRM считает такого клиента пришедшим в офис. Право — «Заказы: правка» и
   «B2C: правка».
   ========================================================================== */
"use strict";

const ON_TYPES = ["FLIGHT", "HOTEL"], ON_PAX_MAX = 6, ON_NIGHTS_MAX = 30, ON_USD_MAX = 100_000, ON_GUESTS_MAX = 6, ON_ROOM_GUESTS = 3, ON_DATE = /^\d{4}-\d{2}-\d{2}$/;
const blankOrderNew = () => ({ type:"FLIGHT", from:"TAS", to:"IST", date:addDays(TODAY, 7), pax:1, hotelId:HOTELS[0]?.id || "", checkin:addDays(TODAY, 7),
  nights:"7", room:"standard", guests:2, list:[{ surname:"", given:"", passport:"", save:true }], phone:"", email:"", usd:"" });
const canOrderNew = () => can("orders.edit") && can("b2c.edit");
const onRooms = d => Math.ceil(clamp(Number(d.guests) || 1, 1, ON_GUESTS_MAX) / ON_ROOM_GUESTS);
/* Цена по каталогу сайта в долларах: за пассажира (билет) или за всё проживание (отель); null — посчитать нельзя. */
function onCatalogUsd(d){
  if (d.type === "FLIGHT") return d.from !== d.to && AIRPORTS.some(a => a.iata === d.to) && ON_DATE.test(d.date) ? baseOffer(d.from, d.to, d.date, "economy", "b2c")?.priceUSD ?? null : null;
  const h = hotelById(d.hotelId), r = ROOM_TYPES.find(x => x.id === d.room), n = Number(d.nights);
  return h && r && ON_DATE.test(d.checkin) && Number.isInteger(n) && n >= 1 && n <= ON_NIGHTS_MAX ? hotelStay(h, d.checkin, n, onRooms(d), r.mult, adjBps("HOTEL", h.city, "b2c")).usd : null;
}
/* Подсказка под ценой: каталог и, у отеля, сколько номеров. */
function onCatNote(d, cat){
  const base = cat == null ? t("on_usd_none") : tf("on_usd_d", { usd:"$" + grp(cat) });
  return d.type === "HOTEL" ? `${base} ${tf("on_rooms_n", { rooms:pl(onRooms(d), "room") })}` : base;
}
/* Цена и подсказка обновляются на месте: перерисовка формы, пока сотрудник вводит
   дату или число ночей, сбивала бы ввод с клавиатуры и съедала следующий щелчок. */
function onRefreshCat(){
  const d = M.ui.onew; if (!d) return;
  const cat = onCatalogUsd(d), usd = $('#onform [data-on="usd"]'), note = $("#oncat");
  if (usd) usd.placeholder = cat == null ? "" : String(cat);
  if (note) note.textContent = onCatNote(d, cat);
}
const onPaxCount = d => d.type === "FLIGHT" ? clamp(Number(d.pax) || 1, 1, ON_PAX_MAX) : 1;
const onTripEnd = d => d.type === "FLIGHT" ? d.date : addDays(d.checkin, Number(d.nights) || 0);

/* Клиент пришёл снова: «Найти клиента по телефону» — его сохранённые пассажиры,
   как на сервере: книга аккаунта сайта с этим номером (сохранённые пассажиры
   сайта, только с галочкой «Сохранить») и книга офиса (пассажиры прошлых
   заказов в офисе на этот номер), одной кнопкой в строку пассажира или
   «Заполнить всех». Заказы сайта сами по себе книгой не считаются; после
   «Удалить мои данные» на сайте офисные заказы до этого момента не находятся.
   Только по кнопке: поиск при уходе из поля сдвигал бы форму под курсором.
   Демо ищет в данных сайта этого браузера; с сервером — POST
   /admin/travellers/lookup и /reveal (admin/95-api.js). Пассажир с выключенной
   галочкой «Сохранить» (nosave) не предлагается. */
let officeLookup = async phone => {
  const site = loadSite(), d = digits(phone), out = [], seen = new Set();
  const add = (x, book) => {
    const k = x.passport || `${x.surname}|${x.given}`; if (!x.surname || x.nosave || seen.has(k)) return;
    seen.add(k); out.push({ id:`f${out.length}`, book, surname:x.surname, given:x.given, passport:x.passport || "", gender:x.gender || "", dob:x.dob || "", expiry:x.expiry || "", cit:x.cit || "", self:!!x.self });
  };
  if (site?.user && digits(site.user.phone || "") === d) [...(site.travellers || [])].sort((a, b) => Number(!!b.self) - Number(!!a.self)).forEach(x => add(x, "customer"));
  const since = site?.user && digits(site.user.phone || "") === d ? site.erasedAt || 0 : 0;
  for (const o of site?.orders || []) if (o.channel === "office" && digits(o.contact?.phone || "") === d && (o.createdAt || 0) > since)
    (o.travellers || []).forEach(x => add(x, "office"));
  return out;
};
let officeReveal = async ids => ids.map(id => M.ui.onFound?.items?.find(x => x.id === id)).filter(Boolean);
function onFoundHtml(){
  const f = M.ui.onFound; if (!f) return "";
  if (f.busy) return `<span class="spin"></span>`;
  if (!f.items.length) return `<span class="muted small">${esc(t("on_found_none"))}</span>`;
  return `<span class="muted small">${esc(t("on_found_h"))}</span>${f.items.map(x => `<button type="button" class="tchip" data-act="onpick" data-v="${esc(x.id)}">
      <span>${esc(x.given)} ${esc(x.surname)}</span><span class="mono small">${esc(savedMask(x))} · ${esc(t(x.book === "office" ? "on_book_office" : "on_book_customer"))}</span></button>`).join("")}
    ${f.items.length > 1 ? `<button type="button" class="ghost sm" data-act="onfillall">${esc(t("on_fill_all"))}</button>` : ""}
    ${f.note ? `<p class="small ai-check" role="status">${esc(f.note)}</p>` : ""}`;
}
const onPaintFound = () => { const el = $("#onfound"); if (el) el.innerHTML = onFoundHtml(); };
async function onLookup(){
  const d = M.ui.onew; if (!d || !validPhone(d.phone)) return;
  const f = M.ui.onFound = { phone:d.phone, items:[], busy:true }; onPaintFound();
  try { f.items = await officeLookup(d.phone, onTripEnd(d)); }
  catch(e) { toast(API.errText(e)); f.items = []; }
  finally { f.busy = false; if (M.ui.onFound === f) onPaintFound(); }
}
/* Найденные → строки пассажиров (первые пустые). Паспорт, истекающий до конца
   поездки, не подставляется — имя да, рядом просьба взять новый паспорт. */
/* Строка пассажира поправлена руками (заказ в офисе и правка пассажиров заказа).
   Скан или поиск по телефону дали пол, даты и гражданство (row.scan): если
   фамилия или имя и номер уже не те, что при заполнении (scanSnap), — это
   другой человек, они сбрасываются вместе с отметками «проверьте»; иначе
   снимается отметка только с этого поля. */
function paxRowEdited(row, f){
  if (row.aiv?.length) row.aiv = row.aiv.filter(k => k !== f);
  const src = row.scanSnap; if (!row.scan || !src || !["surname", "given", "passport"].includes(f)) return;
  const norm = v => String(v || "").trim().toUpperCase();
  const sameName = norm(row.surname) === norm(src.surname) && norm(row.given) === norm(src.given);
  const samePass = !!src.passport && norm(row.passport) === norm(src.passport);
  if (!sameName && !samePass) { delete row.scan; delete row.scanSnap; row.aiv = []; row.aiw = []; }
}
async function onFill(ids){
  const d = M.ui.onew, f = M.ui.onFound; if (!d || !f || !ids.length) return;
  const full = await officeReveal(ids, f.phone, onTripEnd(d)).catch(e => { toast(API.errText(e)); return []; });
  if (M.ui.onew !== d) return;
  if (d.type === "FLIGHT" && full.length > 1) {
    d.pax = String(clamp(Math.max(onPaxCount(d), d.list.filter(x => x.surname).length + full.length), 1, ON_PAX_MAX));
    while (d.list.length < onPaxCount(d)) d.list.push({ surname:"", given:"", passport:"", save:true });
  }
  const end = onTripEnd(d), stale = [];
  for (const x of full) {
    const row = d.list.slice(0, onPaxCount(d)).find(r => !r.surname); if (!row) { toast(t("on_all_filled")); break; }
    const old = !!x.expiry && x.expiry <= end;
    Object.assign(row, { surname:x.surname, given:x.given, passport:d.type === "FLIGHT" && !old ? x.passport || "" : "", save:true,
      scan:Object.fromEntries(["gender", "dob", "expiry", "cit"].filter(k => x[k] && !(old && k === "expiry")).map(k => [k, x[k]])), aiv:[], aiw:[] });
    row.scanSnap = { surname:row.surname, given:row.given, passport:row.passport };
    if (old) stale.push(`${x.given} ${x.surname}`);
  }
  f.note = stale.length ? tf("tr_renew", { name:stale.join(", ") }) : "";
  rerender();
}

function orderNewForm(){
  const d = M.ui.onew; if (!d) return "";
  const f = (k, label, extra = "") => `<label class="field"><span>${esc(t(label))}</span><input data-on="${k}" value="${esc(d[k])}" ${extra}></label>`;
  const sel = (k, label, opts) => `<label class="field"><span>${esc(t(label))}</span><select data-on="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(d[k]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const ports = AIRPORTS.filter(a => !a.hidden).map(a => [a.iata, `${cityName(a.iata)} · ${a.iata}`]);
  const up = 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"', cat = onCatalogUsd(d);
  return `<section class="card stack cl-edit" id="onform" aria-labelledby="onform-h"><div class="card-h"><h2 id="onform-h">${esc(t("on_h"))}</h2>
      <button type="button" class="iconbtn" data-act="onclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <p class="muted small">${esc(t("on_d"))}</p>
    <div class="field"><span id="on-svc">${esc(t("col_service"))}</span>${seg("ontype", ON_TYPES.map(k => [k, t("type_" + k)]), d.type, "", 'aria-labelledby="on-svc"')}</div>
    ${d.type === "FLIGHT" ? `<div class="sgrid sgrid-3">${sel("from", "from", ports)}${sel("to", "to", ports)}${f("date", "depart", `type="date" min="${TODAY}"`)}
        ${sel("pax", "passengers", Array.from({ length:ON_PAX_MAX }, (_, i) => [i + 1, String(i + 1)]))}</div>`
      : `<div class="sgrid sgrid-3">${sel("hotelId", "hotel", HOTELS.map(h => [h.id, `${h.name} · ${cityName(h.city)}`]))}${f("checkin", "checkin", `type="date" min="${TODAY}"`)}
        ${f("nights", "on_nights", `inputmode="numeric" maxlength="2"`)}${sel("room", "room", ROOM_TYPES.map(r => [r.id, t("room_" + r.id)]))}
        ${sel("guests", "on_guests", Array.from({ length:ON_GUESTS_MAX }, (_, i) => [i + 1, String(i + 1)]))}</div>`}
    ${d.list.slice(0, onPaxCount(d)).map((x, i) => `<fieldset class="ot-pax"><legend class="small muted">${esc(d.type === "FLIGHT" ? `${t("passenger")} ${i + 1}` : t("lead_guest"))}</legend><div class="sgrid sgrid-3">
      <label class="field"><span>${esc(t("surname"))}</span><input data-onp="${i}.surname" value="${esc(x.surname)}" ${up}></label>
      <label class="field"><span>${esc(t("given_name"))}</span><input data-onp="${i}.given" value="${esc(x.given)}" ${up}></label>
      ${d.type === "FLIGHT" ? `<label class="field"><span>${esc(t("passport_no"))}</span><input data-onp="${i}.passport" value="${esc(x.passport)}" ${up.replace('class="upper"', 'class="upper mono"')} maxlength="9"></label>` : ""}</div>
      <label class="chk small"><input type="checkbox" data-onsave="${i}" ${x.save !== false ? "checked" : ""}><span>${esc(t("on_save_pax"))}</span></label></fieldset>`).join("")}
    <div class="sgrid sgrid-3">${f("phone", "contact_phone", 'type="tel" placeholder="+998" autocomplete="off"')}${f("email", "agency_email", 'type="email" maxlength="80" autocomplete="off"')}
      ${f("usd", d.type === "FLIGHT" ? "on_usd_pax" : "on_usd_stay", `inputmode="numeric" maxlength="6" placeholder="${cat == null ? "" : cat}"`)}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="onfind">${esc(t("on_find"))}</button></div>
    <div class="tfound" id="onfound" aria-live="polite">${M.ui.onFound?.phone === d.phone ? onFoundHtml() : ""}</div>
    <p class="muted small" id="oncat" aria-live="polite">${esc(onCatNote(d, cat))}</p>
    <div class="err" id="onerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="onsave">${esc(t("on_save"))}</button><button type="button" class="link" data-act="onclose">${esc(t("cancel"))}</button></div></section>`;
}
/* Черновик → заказ. Ошибка — [ключ строки, поле]. */
function orderNewRead(d){
  const n = onPaxCount(d), list = d.list.slice(0, n).map(x => ({ surname:x.surname.trim().toUpperCase(), given:x.given.trim().toUpperCase(), passport:x.passport.trim().toUpperCase(),
    ...(x.save === false ? { nosave:true } : {}) }));
  if (d.type === "FLIGHT") {
    if (d.from === d.to || !AIRPORTS.some(a => a.iata === d.from) || !AIRPORTS.some(a => a.iata === d.to)) return { err:["on_err_route", "to"] };
    if (!ON_DATE.test(d.date) || d.date < TODAY) return { err:["on_err_date", "date"] };
  } else {
    if (!hotelById(d.hotelId)) return { err:["on_err_route", "hotelId"] };
    if (!ON_DATE.test(d.checkin) || d.checkin < TODAY) return { err:["on_err_date", "checkin"] };
    if (!/^\d{1,2}$/.test(String(d.nights).trim()) || Number(d.nights) < 1 || Number(d.nights) > ON_NIGHTS_MAX) return { err:["on_err_nights", "nights"] };
    if (!Number.isInteger(Number(d.guests)) || Number(d.guests) < 1 || Number(d.guests) > ON_GUESTS_MAX) return { err:["on_err_route", "guests"] };
  }
  for (let i = 0; i < list.length; i++) {
    if (!PAX_LATIN.test(list[i].surname)) return { err:["err_name", `p${i}.surname`] };
    if (!PAX_LATIN.test(list[i].given)) return { err:["err_name", `p${i}.given`] };
    if (d.type === "FLIGHT" && !PAX_PP.test(list[i].passport)) return { err:["err_passport", `p${i}.passport`] };
  }
  if (!validPhone(d.phone)) return { err:["err_phone", "phone"] };
  if (phoneBlocked(d.phone)) return { err:["err_blocked", "phone"] };
  if (!validEmail(d.email.trim())) return { err:["err_email", "email"] };
  const raw = String(d.usd).trim(), usd = raw === "" ? onCatalogUsd(d) : /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(usd) || usd < 1 || usd > ON_USD_MAX) return { err:["on_err_usd", "usd"] };
  return { list, usd };
}
function orderNewBuild(d, list, usd){
  const now = Date.now(), base = { id:uid("o"), status:"CONFIRMED", createdAt:now, method:"cash", channel:"office", req:null, paidAt:now, by:me().id,
    contact:{ phone:prettyPhone(d.phone), email:d.email.trim() }, history:[{ s:"PAID", at:now }, { s:"CONFIRMED", at:now }] };
  if (d.type === "FLIGHT") {
    const out = { ...baseOffer(d.from, d.to, d.date, "economy", "b2c"), priceUSD:usd, priceUZS:toUzs(usd) }, q = { adults:list.length, children:0, infants:0, cabin:"economy" };
    return { ...base, no:makeRef(`${out.id}:${now}:${Math.random()}`), type:"FLIGHT", title:`${cityName(d.from)} → ${cityName(d.to)}`, sub:`${fdateY(d.date)} · ${pl(list.length, "pax")}`,
      start:d.date, end:d.date, total:flightFare(out, null, q).total, travellers:list, details:flightDetailsOf(out, null, q) };
  }
  const h = hotelById(d.hotelId), nights = Number(d.nights), checkout = addDays(d.checkin, nights);
  return { ...base, no:makeRef(`${h.id}:${now}:${Math.random()}`), type:"HOTEL", title:h.name, sub:`${cityName(h.city)} · ${fdateY(d.checkin)} — ${fdateY(checkout)} · ${pl(nights, "night")}`,
    start:d.checkin, end:checkout, total:amt(usd), travellers:list.map(({ passport, ...x }) => x),
    details:{ hotelId:h.id, room:d.room, checkin:d.checkin, checkout, nights, adults:Number(d.guests), children:0, rooms:onRooms(d), hotel:hotelSnap(h) } };
}
function saveOrderNew(){
  if (!canOrderNew()) return toast(t("no_rights"));
  const d = M.ui.onew; if (!d) return;
  const { list, usd, err } = orderNewRead(d);
  $$("#onform [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (err) { const [k, i] = err[1].startsWith("p") && err[1].includes(".") ? [err[1].slice(1), true] : [err[1], false];
    const fld = $(i ? `#onform [data-onp="${k}"]` : `#onform [data-on="${k}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "onerr");
    // Ошибка в строке пассажира — с его номером: строк до шести, а сообщение у кнопки.
    const who = i ? (d.type === "FLIGHT" ? `${t("passenger")} ${Number(k.split(".")[0]) + 1}` : t("lead_guest")) : "";
    showErr("#onerr", who ? `${who}: ${t(err[0])}` : t(err[0]));
    fld?.focus({ preventScroll:true }); fld?.scrollIntoView({ block:"center", behavior:REDUCED ? "auto" : "smooth" }); return; }
  if (cantBuy(d.type, { usd:1 }) === "svc_off_h") return showErr("#onerr", t("svc_off_h"));
  const o = orderNewBuild(d, list, usd);
  let ok = false;
  change(() => { withSite(site => { site.orders.unshift(o); ok = true; });
    if (ok) audit("order_new", { no:o.no, svc:strRef("type_" + o.type), amount:uzsRef(o.total.uzs) }, { module:"orders" }); });
  if (!ok) return showErr("#onerr", t("on_err_site"));
  M.ui.onew = null; toast(tf("t_on_saved", { no:o.no })); go(`orders/site/${o.id}`);
}
Object.assign(ACT, {
  onnew:   () => { if (!canOrderNew()) return toast(t("no_rights")); M.ui.onew = blankOrderNew(); M.ui.onFound = null; rerender(); $('#onform [data-act="ontype"]')?.focus(); },
  onfind:  () => onLookup(),
  onpick:  el => onFill([el.dataset.v]),
  onfillall: () => onFill((M.ui.onFound?.items || []).map(x => x.id)),
  onclose: () => { M.ui.onew = null; rerender(); $('[data-act="onnew"]')?.focus(); },
  ontype:  el => { const d = M.ui.onew; if (!d || !ON_TYPES.includes(el.dataset.v)) return; d.type = el.dataset.v; d.usd = ""; rerender(); $(`#onform [data-act="ontype"][data-v="${d.type}"]`)?.focus(); },
  onsave:  () => saveOrderNew()
});
/* Поля → черновик. Форму перерисовывает только число пассажиров (строки пассажиров);
   маршрут, дата, отель, ночи, номер и гости меняют цену по каталогу на месте (onRefreshCat). */
const ON_PRICED = ["from", "to", "date", "hotelId", "checkin", "nights", "room", "guests"];
document.addEventListener("input", e => {
  const d = M.ui.onew; if (!d) return;
  const k = e.target.dataset?.on, p = e.target.dataset?.onp;
  if (k && e.target.tagName !== "SELECT") { d[k] = e.target.value; if (ON_PRICED.includes(k)) onRefreshCat(); }
  if (p) { const [i, f] = p.split("."); if (d.list[i]) { d.list[i][f] = e.target.value; paxRowEdited(d.list[i], f); } }
});
document.addEventListener("change", e => {
  const s = e.target.dataset?.onsave; if (s !== undefined && M.ui.onew?.list[s]) M.ui.onew.list[s].save = e.target.checked;
  const d = M.ui.onew, k = e.target.dataset?.on; if (!d || !k) return;
  d[k] = e.target.value;
  if (k === "pax") { while (d.list.length < onPaxCount(d)) d.list.push({ surname:"", given:"", passport:"", save:true }); rerender(); $('#onform [data-on="pax"]')?.focus(); return; }
  if (ON_PRICED.includes(k)) onRefreshCat();
});
