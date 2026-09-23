/* ==========================================================================
   Модуль «Отели». Тестовый каталог на курортных направлениях чартеров.
   Цена за ночь детерминирована по отелю и дате, в высокий сезон выше.
   ========================================================================== */
"use strict";

function hotelNightly(h, date){
  const month = parseYMD(date).getMonth() + 1;
  const season = HIGH_SEASON[h.city].includes(month) ? 1.18 : 1;
  return h.base * season * (0.94 + mulberry32(seedFrom(h.id + date))() * 0.12);
}
function hotelStay(h, checkin, nights, rooms, mult = 1){
  let sum = 0; for (let i = 0; i < nights; i++) sum += hotelNightly(h, addDays(checkin, i));
  return amt(sum * mult * rooms);
}
const hotelById = id => HOTELS.find(h => h.id === id);
const nightsOf = q => daysBetween(q.checkin, q.checkout);
const beachText = h => h.beach == null ? t("beach_none") : h.beach <= 50 ? t("beach_first") : tf("beach_m", { m:h.beach });

M.hotels = { city:"AYT", checkin:addDays(TODAY,14), checkout:addDays(TODAY,21), adults:2, children:0, rooms:1,
  stars:[], boards:[], maxNight:0, sort:"price", searched:false };

MODULES.hotels = {
  type: "HOTEL", icon: IC.hotels, label: "mod_hotels",
  normalize(){ const q = M.hotels; q.rooms = Math.min(q.rooms, q.adults); },
  form(){
    const q = M.hotels, n = nightsOf(q);
    return `<div class="sform"><div class="sgrid sgrid-hotels">
      <label class="field"><span>${esc(t("city"))}</span><select data-bind="hotels.city">${RESORTS.map(c =>
        `<option value="${c}" ${c === q.city ? "selected" : ""}>${esc(cityName(c))} · ${esc(countryName(c))}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(t("checkin"))}</span><input type="date" data-bind="hotels.checkin" data-rr value="${q.checkin}" min="${TODAY}"></label>
      <label class="field"><span>${esc(t("checkout"))}${n > 0 ? ` · ${esc(pl(n, "night"))}` : ""}</span><input type="date" data-bind="hotels.checkout" data-rr value="${q.checkout}" min="${addDays(q.checkin,1)}"></label>
      <div class="field"><span>${esc(t("guests"))}</span>
        <details class="drop" data-keep="hpax" ${M.ui.hpax ? "open data-restored" : ""}><summary class="dropsum">${esc(pl(q.adults + q.children, "guest"))}, ${esc(pl(q.rooms, "room"))}</summary>
          <div class="droppanel steps">
            ${stepper("hotels.adults", q.adults, 1, 12, t("adults"), t("age_adult"))}
            ${stepper("hotels.children", q.children, 0, 8, t("children"), t("children_free"))}
            ${stepper("hotels.rooms", q.rooms, 1, Math.min(4, q.adults), t("rooms"), "")}
          </div></details></div>
      <button type="button" class="cta sgo" data-act="hsearch"><span>${esc(t("find_hotels"))}</span><span class="cta-ic">${IC.hotels}</span></button>
    </div><div class="err" id="serr" hidden></div></div>`;
  },
  search(){ ACT.hsearch(); }
};

Object.assign(ACT, {
  hsearch: () => {
    const q = M.hotels, n = nightsOf(q); hideErr("#serr");
    if (q.checkin < TODAY) return showErr("#serr", t("err_date_past"));
    if (n < 1) return showErr("#serr", t("err_checkout"));
    if (n > 30) return showErr("#serr", t("err_nights_max"));
    if (q.adults > q.rooms * 3) return showErr("#serr", t("err_rooms"));
    Object.assign(q, { searched:true, stars:[], boards:[], maxNight:0, sort:"price" });
    M.ui.hpax = false; go("hotels/results");
  },
  hstar:  el => { const v = Number(el.dataset.v), a = M.hotels.stars; M.hotels.stars = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; flip(rerender); },
  hboard: el => { const v = el.dataset.v, a = M.hotels.boards; M.hotels.boards = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; flip(rerender); },
  hsort:  el => { M.hotels.sort = el.dataset.v; flip(rerender); },
  hclear: () => flip(() => { Object.assign(M.hotels, { stars:[], boards:[], maxNight:0 }); rerender(); }),
  hbook:  el => startHotelCheckout(el.dataset.h, el.dataset.r)
});
/* Ползунок цены меняет состояние на лету, а перерисовывает по отпусканию. */
document.addEventListener("change", e => { if (e.target.id === "hmax") { M.hotels.maxNight = Number(e.target.value); flip(rerender); } });
document.addEventListener("input",  e => { if (e.target.id === "hmax") { const o = $("#hmaxv"); if (o) o.textContent = maxLabel(Number(e.target.value)); } });
const maxLabel = v => v ? `≤ ${fmt(amt(v))}` : t("any_price");

function hotelResults(q){
  const n = nightsOf(q);
  return HOTELS.filter(h => h.city === q.city).map(h => {
    const stay = hotelStay(h, q.checkin, n, q.rooms);
    return { h, stay, night: Math.round(stay.usd / n / q.rooms) };
  });
}
PAGES["hotels/results"] = {
  render(){
    const q = M.hotels; if (!q.searched) { go(""); return null; }
    const n = nightsOf(q), all = hotelResults(q), rc = listEnter(`ho:${q.city}:${q.checkin}:${q.checkout}:${q.rooms}`);
    const top = Math.ceil(Math.max(...all.map(x => x.night)) / 10) * 10;
    let list = all.filter(x => (!q.stars.length || q.stars.includes(x.h.stars)) && (!q.boards.length || q.boards.includes(x.h.board)) && (!q.maxNight || x.night <= q.maxNight));
    list.sort(q.sort === "rating" ? (a, b) => b.h.rating - a.h.rating : q.sort === "stars" ? (a, b) => b.h.stars - a.h.stars || a.stay.usd - b.stay.usd : (a, b) => a.stay.usd - b.stay.usd);
    const chk = (act, v, on, label) => `<label class="chk"><input type="checkbox" data-act="${act}" data-v="${v}" ${on ? "checked" : ""}><span>${label}</span></label>`;
    return `<div class="resbar"><div class="container resbar-in">
        <div><span class="rb-route">${esc(cityName(q.city))}</span>
        <span class="muted">${esc(fdate(q.checkin))} — ${esc(fdate(q.checkout))} · ${esc(pl(n, "night"))} · ${esc(pl(q.adults + q.children, "guest"))}</span></div>
        <a class="ghost sm" href="#/">${esc(t("edit_search"))}</a></div></div>
      <div class="container section"><div class="reslayout">
        <aside class="filters"><details class="fbox" data-keep="filters" ${fboxOpen()}><summary>${esc(t("filters"))}</summary><div class="fbody">
          <div class="fgroup"><span class="lbl">${esc(t("sort"))}</span>${seg("hsort", [["price", t("sort_cheapest")], ["rating", t("sort_rating")], ["stars", t("sort_stars")]], q.sort)}</div>
          <div class="fgroup"><span class="lbl">${esc(t("price_night"))}</span>
            <input id="hmax" type="range" min="0" max="${top}" step="10" value="${q.maxNight}" aria-label="${esc(t("price_night"))}">
            <output id="hmaxv" class="small muted">${esc(maxLabel(q.maxNight))}</output></div>
          <div class="fgroup"><span class="lbl">${esc(t("stars_label"))}</span>${[5,4,3].map(s => chk("hstar", s, q.stars.includes(s), stars(s))).join("")}</div>
          <div class="fgroup"><span class="lbl">${esc(t("board"))}</span>${BOARDS.map(b => chk("hboard", b, q.boards.includes(b), `<b class="mono">${b}</b> ${esc(t("board_" + b))}`)).join("")}</div>
          <button type="button" class="link" data-act="hclear">${esc(t("clear_filters"))}</button>
        </div></details></aside>
        <section class="stack"><p class="muted small">${esc(tf("found_hotels", { n:list.length }))}</p>
          ${list.length ? list.map((x, i) => hotelRow(x, i, n, rc)).join("")
            : `<div class="card empty"><h3>${esc(t("no_results"))}</h3><button type="button" class="ghost" data-act="hclear">${esc(t("clear_filters"))}</button></div>`}
        </section></div></div>`;
  }
};
function amenityChips(h){ return `<div class="chips-row">${h.am.map(a => `<span class="chip-s">${esc(t("am_" + a))}</span>`).join("")}</div>`; }
function hotelRow(x, i, n, rc){
  const h = x.h;
  return `<article class="hotel lift ${rc}" style="--i:${i}" data-flip="${h.id}">${hotelArt(h)}
    <div class="ho-main">
      <div class="ho-h"><h3>${esc(h.name)}</h3>${stars(h.stars)}</div>
      <span class="muted small">${esc(h.area)} · ${esc(cityName(h.city))} · ${esc(beachText(h))}</span>
      <div class="ho-tags"><span class="rating">${h.rating.toFixed(1)}</span><span class="tag-b"><b class="mono">${h.board}</b> ${esc(t("board_" + h.board))}</span></div>
      ${amenityChips(h)}
    </div>
    <div class="ho-buy"><span class="of-price">${fmt(x.stay)}</span>
      <small class="muted">${esc(tf("for_nights", { n: pl(n, "night") }))}</small>
      <small class="muted">${esc(tf("per_night", { p: fmt(amt(x.night)) }))}</small>
      <a class="solid" href="#/hotels/item/${h.id}">${esc(t("choose_room"))}</a></div></article>`;
}
PAGES["hotels/item/:id"] = {
  render({ id }){
    const q = M.hotels, h = hotelById(id); if (!h || !q.searched) { go(""); return null; }
    const n = nightsOf(q);
    const rooms = ROOM_TYPES.map(r => ({ r, stay: hotelStay(h, q.checkin, n, q.rooms, r.mult) }));
    return `<div class="container section">${backLink("hotels/results", t("back_results"))}
      <div class="hhero">${hotelArt(h)}<div class="stack" style="gap:8px">
        <div class="ho-h"><h1>${esc(h.name)}</h1>${stars(h.stars)}</div>
        <span class="muted">${esc(h.area)} · ${esc(cityName(h.city))}, ${esc(countryName(h.city))} · ${esc(beachText(h))}</span>
        <div class="ho-tags"><span class="rating">${h.rating.toFixed(1)}</span><span class="tag-b"><b class="mono">${h.board}</b> ${esc(t("board_" + h.board))}</span></div>
        ${amenityChips(h)}</div></div>
      <div class="card stack" style="margin-top:20px">
        <div class="leg-h"><h2>${esc(t("rooms_title"))}</h2><span class="muted small">${esc(fdate(q.checkin))} — ${esc(fdate(q.checkout))} · ${esc(pl(n, "night"))} · ${esc(pl(q.rooms, "room"))}</span></div>
        <div class="roomlist">${rooms.map(({ r, stay }) => `<div class="room">
          <div><b>${esc(t("room_" + r.id))}</b><span class="muted small">${r.size} ${esc(t("sqm"))} · ${esc(t("room_" + r.id + "_d"))}</span></div>
          <div class="room-buy"><span class="of-price">${fmt(stay)}</span><small class="muted">${esc(tf("for_nights", { n: pl(n, "night") }))}</small>
            <button type="button" class="solid" data-act="hbook" data-h="${h.id}" data-r="${r.id}">${esc(t("book"))}</button></div></div>`).join("")}</div>
        <p class="small muted">${esc(t("hotel_note"))}</p></div></div>`;
  }
};

function startHotelCheckout(hid, rid){
  const q = M.hotels, h = hotelById(hid), r = ROOM_TYPES.find(x => x.id === rid), n = nightsOf(q);
  const total = hotelStay(h, q.checkin, n, q.rooms, r.mult);
  startCheckout({
    type: "HOTEL", title: h.name,
    sub: `${cityName(h.city)} · ${fdateY(q.checkin)} — ${fdateY(q.checkout)} · ${pl(n, "night")}`,
    start: q.checkin, end: q.checkout,
    travellers: { mode:"lead", types:["adult"] },
    lines: [[`${t("room_" + r.id)} × ${pl(q.rooms, "room")} · ${pl(n, "night")}`, total]],
    total, recheck: false,
    details: { hotelId:h.id, room:r.id, checkin:q.checkin, checkout:q.checkout, nights:n, adults:q.adults, children:q.children, rooms:q.rooms },
    ref: makeRef(h.id + q.checkin + r.id)
  });
}
function hotelVoucherBody(o){
  const d = o.details, h = hotelById(d.hotelId), lead = o.travellers[0];
  return `<div class="vgrid">
    <div class="wide"><span class="lbl">${esc(t("hotel"))}</span><b>${esc(h.name)} ${stars(h.stars)}</b><span class="muted small">${esc(h.area)}, ${esc(cityName(h.city))}</span></div>
    <div><span class="lbl">${esc(t("checkin"))}</span><b>${esc(fdateY(d.checkin))}</b><span class="muted small">${esc(t("checkin_from"))}</span></div>
    <div><span class="lbl">${esc(t("checkout"))}</span><b>${esc(fdateY(d.checkout))}</b><span class="muted small">${esc(t("checkout_until"))}</span></div>
    <div><span class="lbl">${esc(t("room"))}</span><b>${esc(t("room_" + d.room))} × ${d.rooms}</b></div>
    <div><span class="lbl">${esc(t("board"))}</span><b><span class="mono">${h.board}</span> ${esc(t("board_" + h.board))}</b></div>
    <div><span class="lbl">${esc(t("guests"))}</span><b>${esc(pl(d.adults, "adult"))}${d.children ? ", " + esc(pl(d.children, "child")) : ""}</b></div>
    <div><span class="lbl">${esc(t("lead_guest"))}</span><b>${esc(lead.given)} ${esc(lead.surname)}</b></div>
  </div>`;
}
