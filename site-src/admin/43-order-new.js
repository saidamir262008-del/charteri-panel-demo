/* ==========================================================================
   Заказ из админки: клиент пришёл в офис или позвонил. Сотрудник оформляет
   авиабилет или отель на пассажира сайта (B2C), клиент платит в офисе
   (наличными или терминалом) — заказ сразу оплачен и подтверждён, документ
   (посадочный талон или ваучер) печатается из карточки заказа и виден
   клиенту на сайте под его номером телефона.

   Цена — по каталогу (подставляется), сотрудник может её изменить: в офисе
   её называют клиенту. У авиабилета цена — за пассажира, чек собирается из
   неё, как на сайте. Право — «Заказы: правка» и «B2C: правка».
   ========================================================================== */
"use strict";

const ON_TYPES = ["FLIGHT", "HOTEL"], ON_PAX_MAX = 6, ON_NIGHTS_MAX = 30, ON_USD_MAX = 100_000;
const blankOrderNew = () => ({ type:"FLIGHT", from:"TAS", to:"IST", date:addDays(TODAY, 7), pax:1, hotelId:HOTELS[0]?.id || "", checkin:addDays(TODAY, 7),
  nights:"7", room:"standard", guests:2, list:[{ surname:"", given:"", passport:"" }], phone:"", email:"", usd:"" });
const canOrderNew = () => can("orders.edit") && can("b2c.edit");
/* Цена по каталогу в долларах: за пассажира (билет) или за всё проживание (отель); null — посчитать нельзя. */
function onCatalogUsd(d){
  if (d.type === "FLIGHT") return d.from !== d.to && AIRPORTS.some(a => a.iata === d.to) ? baseOffer(d.from, d.to, d.date)?.priceUSD ?? null : null;
  const h = hotelById(d.hotelId), r = ROOM_TYPES.find(x => x.id === d.room), n = Number(d.nights);
  return h && r && Number.isInteger(n) && n >= 1 && n <= ON_NIGHTS_MAX ? hotelStay(h, d.checkin, n, 1, r.mult).usd : null;
}
const onPaxCount = d => d.type === "FLIGHT" ? clamp(Number(d.pax) || 1, 1, ON_PAX_MAX) : 1;

function orderNewForm(){
  const d = M.ui.onew; if (!d) return "";
  const f = (k, label, extra = "") => `<label class="field"><span>${esc(t(label))}</span><input data-on="${k}" value="${esc(d[k])}" ${extra}></label>`;
  const sel = (k, label, opts) => `<label class="field"><span>${esc(t(label))}</span><select data-on="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(d[k]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const ports = AIRPORTS.filter(a => !a.hidden).map(a => [a.iata, `${cityName(a.iata)} · ${a.iata}`]);
  const up = 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"', cat = onCatalogUsd(d);
  return `<section class="card stack cl-edit" id="onform" aria-labelledby="onform-h"><div class="card-h"><h2 id="onform-h">${esc(t("on_h"))}</h2>
      <button type="button" class="iconbtn" data-act="onclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <p class="muted small">${esc(t("on_d"))}</p>
    <div class="field"><span>${esc(t("col_service"))}</span>${seg("ontype", ON_TYPES.map(k => [k, t("type_" + k)]), d.type)}</div>
    ${d.type === "FLIGHT" ? `<div class="sgrid sgrid-3">${sel("from", "from", ports)}${sel("to", "to", ports)}${f("date", "depart", `type="date" min="${TODAY}"`)}
        ${sel("pax", "passengers", Array.from({ length:ON_PAX_MAX }, (_, i) => [i + 1, String(i + 1)]))}</div>`
      : `<div class="sgrid sgrid-3">${sel("hotelId", "hotel", HOTELS.map(h => [h.id, `${h.name} · ${cityName(h.city)}`]))}${f("checkin", "checkin", `type="date" min="${TODAY}"`)}
        ${f("nights", "on_nights", `inputmode="numeric" maxlength="2"`)}${sel("room", "room", ROOM_TYPES.map(r => [r.id, t("room_" + r.id)]))}
        ${sel("guests", "on_guests", [1, 2, 3, 4].map(n => [n, String(n)]))}</div>`}
    ${d.list.slice(0, onPaxCount(d)).map((x, i) => `<fieldset class="ot-pax"><legend class="small muted">${esc(d.type === "FLIGHT" ? `${t("passenger")} ${i + 1}` : t("lead_guest"))}</legend><div class="sgrid sgrid-3">
      <label class="field"><span>${esc(t("surname"))}</span><input data-onp="${i}.surname" value="${esc(x.surname)}" ${up}></label>
      <label class="field"><span>${esc(t("given_name"))}</span><input data-onp="${i}.given" value="${esc(x.given)}" ${up}></label>
      ${d.type === "FLIGHT" ? `<label class="field"><span>${esc(t("passport_no"))}</span><input data-onp="${i}.passport" value="${esc(x.passport)}" ${up.replace('class="upper"', 'class="upper mono"')} maxlength="9"></label>` : ""}</div></fieldset>`).join("")}
    <div class="sgrid sgrid-3">${f("phone", "contact_phone", 'type="tel" placeholder="+998" autocomplete="off"')}${f("email", "agency_email", 'type="email" maxlength="80" autocomplete="off"')}
      ${f("usd", d.type === "FLIGHT" ? "on_usd_pax" : "on_usd_stay", `inputmode="numeric" maxlength="6" placeholder="${cat == null ? "" : cat}"`)}</div>
    <p class="muted small">${esc(cat == null ? t("on_usd_none") : tf("on_usd_d", { usd:"$" + grp(cat) }))}</p>
    <div class="err" id="onerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="onsave">${esc(t("on_save"))}</button><button type="button" class="link" data-act="onclose">${esc(t("cancel"))}</button></div></section>`;
}
/* Черновик → заказ. Ошибка — [ключ строки, поле]. */
function orderNewRead(d){
  const n = onPaxCount(d), list = d.list.slice(0, n).map(x => ({ surname:x.surname.trim().toUpperCase(), given:x.given.trim().toUpperCase(), passport:x.passport.trim().toUpperCase() }));
  if (d.type === "FLIGHT") {
    if (d.from === d.to || !AIRPORTS.some(a => a.iata === d.from) || !AIRPORTS.some(a => a.iata === d.to)) return { err:["on_err_route", "to"] };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date < TODAY) return { err:["on_err_date", "date"] };
  } else {
    if (!hotelById(d.hotelId)) return { err:["on_err_route", "hotelId"] };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.checkin) || d.checkin < TODAY) return { err:["on_err_date", "checkin"] };
    if (!/^\d{1,2}$/.test(String(d.nights).trim()) || Number(d.nights) < 1 || Number(d.nights) > ON_NIGHTS_MAX) return { err:["on_err_nights", "nights"] };
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
  const now = Date.now(), base = { id:uid("o"), status:"CONFIRMED", createdAt:now, method:"cash", req:null, paidAt:now, by:me().id,
    contact:{ phone:prettyPhone(d.phone), email:d.email.trim() }, history:[{ s:"PAID", at:now }, { s:"CONFIRMED", at:now }] };
  if (d.type === "FLIGHT") {
    const out = { ...baseOffer(d.from, d.to, d.date), priceUSD:usd, priceUZS:toUzs(usd) }, q = { adults:list.length, children:0, infants:0, cabin:"economy" };
    return { ...base, no:makeRef(`${out.id}:${now}:${Math.random()}`), type:"FLIGHT", title:`${cityName(d.from)} → ${cityName(d.to)}`, sub:`${fdateY(d.date)} · ${pl(list.length, "pax")}`,
      start:d.date, end:d.date, total:flightFare(out, null, q).total, travellers:list, details:flightDetailsOf(out, null, q) };
  }
  const h = hotelById(d.hotelId), nights = Number(d.nights), checkout = addDays(d.checkin, nights);
  return { ...base, no:makeRef(`${h.id}:${now}:${Math.random()}`), type:"HOTEL", title:h.name, sub:`${cityName(h.city)} · ${fdateY(d.checkin)} — ${fdateY(checkout)} · ${pl(nights, "night")}`,
    start:d.checkin, end:checkout, total:amt(usd), travellers:list.map(({ passport, ...x }) => x),
    details:{ hotelId:h.id, room:d.room, checkin:d.checkin, checkout, nights, adults:Number(d.guests), children:0, rooms:1 } };
}
function saveOrderNew(){
  if (!canOrderNew()) return toast(t("no_rights"));
  const d = M.ui.onew; if (!d) return;
  const { list, usd, err } = orderNewRead(d);
  $$("#onform [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (err) { const [k, i] = err[1].startsWith("p") && err[1].includes(".") ? [err[1].slice(1), true] : [err[1], false];
    const fld = $(i ? `#onform [data-onp="${k}"]` : `#onform [data-on="${k}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "onerr");
    showErr("#onerr", t(err[0])); fld?.focus({ preventScroll:true }); return; }
  if (cantBuy(d.type, { usd:1 }) === "svc_off_h") return showErr("#onerr", t("svc_off_h"));
  const o = orderNewBuild(d, list, usd);
  let ok = false;
  change(() => { withSite(site => { site.orders.unshift(o); ok = true; });
    if (ok) audit("order_new", { no:o.no, svc:strRef("type_" + o.type), amount:uzsRef(o.total.uzs) }, { module:"orders" }); });
  if (!ok) return showErr("#onerr", t("on_err_site"));
  M.ui.onew = null; toast(tf("t_on_saved", { no:o.no })); go(`orders/site/${o.id}`);
}
Object.assign(ACT, {
  onnew:   () => { if (!canOrderNew()) return toast(t("no_rights")); M.ui.onew = blankOrderNew(); rerender(); $('#onform [data-act="ontype"]')?.focus(); },
  onclose: () => { M.ui.onew = null; rerender(); $('[data-act="onnew"]')?.focus(); },
  ontype:  el => { const d = M.ui.onew; if (!d || !ON_TYPES.includes(el.dataset.v)) return; d.type = el.dataset.v; d.usd = ""; rerender(); $(`#onform [data-act="ontype"][data-v="${d.type}"]`)?.focus(); },
  onsave:  () => saveOrderNew()
});
/* Поля → черновик. Выбор маршрута, отеля, числа пассажиров перерисовывает форму (цена по каталогу и строки пассажиров). */
document.addEventListener("input", e => {
  const d = M.ui.onew; if (!d) return;
  const k = e.target.dataset?.on, p = e.target.dataset?.onp;
  if (k && e.target.tagName !== "SELECT") d[k] = e.target.value;
  if (p) { const [i, f] = p.split("."); if (d.list[i]) d.list[i][f] = e.target.value; }
});
document.addEventListener("change", e => {
  const d = M.ui.onew, k = e.target.dataset?.on; if (!d || !k) return;
  d[k] = e.target.value;
  if (k === "pax") while (d.list.length < onPaxCount(d)) d.list.push({ surname:"", given:"", passport:"" });
  if (["from", "to", "date", "pax", "hotelId", "checkin", "nights", "room"].includes(k)) { rerender(); $(`#onform [data-on="${k}"]`)?.focus(); }
});
