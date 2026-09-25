/* ==========================================================================
   Модуль «Туры». Пакет = регулярный рейс туда и обратно из движка приложения
   + отель из каталога + трансфер + страховка, с пакетной скидкой 7%.
   Скидка — это то, ради чего покупают тур, а не всё по отдельности, поэтому
   экономия показывается в явном виде.
   ========================================================================== */
"use strict";

const TOUR_DISCOUNT = 0.93;
const TRANSFER_USD = 20;          // за человека, туда и обратно

/* legs — рейсы из сохранённого заказа: чек старого заказа не должен зависеть
   от сегодняшней наценки. Без них — рейсы по текущим ценам. */
function tourPackage(h, q, legs = null){
  const out = legs?.out || baseOffer("TAS", q.to, q.depart), back = legs?.back || baseOffer(q.to, "TAS", addDays(q.depart, q.nights));
  const people = q.adults + q.children, rooms = Math.ceil(q.adults / 2);
  const flights = mulA({ usd: out.priceUSD + back.priceUSD, uzs: out.priceUZS + back.priceUZS }, people);
  const hotel = hotelStay(h, q.depart, q.nights, rooms);
  const transfer = mulA(amt(TRANSFER_USD), people);
  const separate = addA(flights, hotel, transfer);
  const total = pctA(separate, TOUR_DISCOUNT);
  const saving = { usd: separate.usd - total.usd, uzs: separate.uzs - total.uzs };
  const perPerson = { usd: Math.round(total.usd / people), uzs: Math.round(total.uzs / people / 1000) * 1000 };
  return { h, out, back, people, rooms, flights, hotel, transfer, separate, total, saving, perPerson };
}
/* Строки чека: их сумма ровно равна итогу — скидка идёт отрицательной строкой. */
function tourLines(p, q){
  return [
    [`${t("flight_rt")} × ${pl(p.people, "pax")}`, p.flights],
    [`${p.h.name} · ${pl(q.nights, "night")} × ${pl(p.rooms, "room")}`, p.hotel],
    [t("transfer"), p.transfer],
    [t("insurance"), null],
    [t("package_discount"), { usd: -p.saving.usd, uzs: -p.saving.uzs }]
  ];
}

M.tours = { to:"AYT", depart:addDays(TODAY,14), nights:7, adults:2, children:0, stars:[], boards:[], sort:"price", searched:false };

MODULES.tours = {
  type: "TOUR", icon: IC.tours, label: "mod_tours",
  form(){
    const q = M.tours;
    return `<div class="sform"><div class="sgrid sgrid-tours">
      <label class="field"><span>${esc(t("from"))}</span><select disabled><option>${esc(cityName("TAS"))} · TAS</option></select></label>
      <label class="field"><span>${esc(t("where_to"))}</span><select data-bind="tours.to" data-rr>${RESORTS.map(c =>
        `<option value="${c}" ${c === q.to ? "selected" : ""}>${esc(cityName(c))} · ${esc(countryName(c))}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(t("depart"))}</span><input type="date" data-bind="tours.depart" value="${q.depart}" min="${TODAY}"></label>
      <label class="field"><span>${esc(t("nights"))}</span><select data-bind="tours.nights" data-num>${[3,4,5,6,7,8,9,10,11,12,13,14].map(n =>
        `<option value="${n}" ${n === q.nights ? "selected" : ""}>${esc(pl(n, "night"))}</option>`).join("")}</select></label>
      <div class="field"><span>${esc(t("tourists"))}</span>
        <details class="drop" data-keep="tpax" ${M.ui.tpax ? "open data-restored" : ""}><summary class="dropsum">${esc(pl(q.adults, "adult"))}${q.children ? ", " + esc(pl(q.children, "child")) : ""}</summary>
          <div class="droppanel steps">
            ${stepper("tours.adults", q.adults, 1, 8, t("adults"), t("age_adult"))}
            ${stepper("tours.children", q.children, 0, 6, t("children"), t("age_child_tour"))}
          </div></details></div>
      <button type="button" class="cta sgo" data-act="tsearch"><span>${esc(t("find_tours"))}</span><span class="cta-ic">${IC.tours}</span></button>
    </div><div class="err" id="serr" hidden></div></div>`;
  },
  search(){ ACT.tsearch(); }
};

Object.assign(ACT, {
  tsearch: () => {
    const q = M.tours; hideErr("#serr");
    if (q.depart < TODAY) return showErr("#serr", t("err_date_past"));
    Object.assign(q, { searched:true, stars:[], boards:[], sort:"price" });
    M.ui.tpax = false; go("tours/results");
  },
  tstar:  el => { const v = Number(el.dataset.v), a = M.tours.stars; M.tours.stars = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; flip(rerender); },
  tboard: el => { const v = el.dataset.v, a = M.tours.boards; M.tours.boards = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; flip(rerender); },
  tsort:  el => { M.tours.sort = el.dataset.v; flip(rerender); },
  tclear: () => flip(() => { Object.assign(M.tours, { stars:[], boards:[] }); rerender(); }),
  tbook:  el => startTourCheckout(el.dataset.h),
  /* с главной: «Туры от …» в карточке направления */
  tgo:    el => { M.tours.to = el.dataset.v; M.module = "tours"; ACT.tsearch(); }
});

PAGES["tours/results"] = {
  render(){
    const q = M.tours; if (!q.searched) { go(SEARCH_PATH); return null; }
    const all = HOTELS.filter(h => h.city === q.to).map(h => tourPackage(h, q));
    // Направление убрали в админке, пока открыта выдача, — назад к поиску.
    if (!all.length) { q.searched = false; go(SEARCH_PATH); return null; }
    let list = all.filter(p => (!q.stars.length || q.stars.includes(p.h.stars)) && (!q.boards.length || q.boards.includes(p.h.board)));
    list.sort(q.sort === "rating" ? (a, b) => (b.h.rating || 0) - (a.h.rating || 0) : (a, b) => a.total.usd - b.total.usd);
    const back = addDays(q.depart, q.nights), f0 = all[0], rc = listEnter(`to:${q.to}:${q.depart}:${q.nights}:${q.adults}:${q.children}`);
    const chk = (act, v, on, label) => `<label class="chk"><input type="checkbox" data-act="${act}" data-v="${v}" ${on ? "checked" : ""}><span>${label}</span></label>`;
    return `<div class="${resbarCls(q.to)}">${resbarPhoto(q.to)}<div class="container resbar-in">
        <div><span class="rb-route">${esc(cityName("TAS"))} → ${esc(cityName(q.to))}</span>
        <span class="muted">${esc(fdate(q.depart))} — ${esc(fdate(back))} · ${esc(pl(q.nights, "night"))} · ${esc(pl(q.adults + q.children, "tourist"))}</span></div>
        <a class="ghost sm" href="#/${SEARCH_PATH}">${esc(t("edit_search"))}</a></div></div>
      <div class="container section">
        <div class="flightstrip card">${IC.flights}<span>${esc(t("tour_flights"))}:</span>
          ${carrierBadge(f0.out.flightNo.split("-")[0], "cb-xs")}<b class="mono">${f0.out.flightNo}</b><span class="muted">${esc(fdate(q.depart))} ${f0.out.depTime}</span>
          <b class="mono">${f0.back.flightNo}</b><span class="muted">${esc(fdate(back))} ${f0.back.depTime}</span></div>
        <div class="reslayout">
        <aside class="filters"><details class="fbox" data-keep="filters" ${fboxOpen()}><summary>${esc(t("filters"))}</summary><div class="fbody">
          <div class="fgroup"><span class="lbl">${esc(t("sort"))}</span>${seg("tsort", [["price", t("sort_cheapest")], ["rating", t("sort_rating")]], q.sort)}</div>
          <div class="fgroup"><span class="lbl">${esc(t("stars_label"))}</span>${[5,4,3].map(s => chk("tstar", s, q.stars.includes(s), stars(s))).join("")}</div>
          <div class="fgroup"><span class="lbl">${esc(t("board"))}</span>${BOARDS.map(b => chk("tboard", b, q.boards.includes(b), `<b class="mono">${b}</b> ${esc(t("board_" + b))}`)).join("")}</div>
          <button type="button" class="link" data-act="tclear">${esc(t("clear_filters"))}</button>
        </div></details></aside>
        <section class="stack"><p class="muted small">${esc(tf("found_tours", { n:list.length }))}</p>
          ${list.length ? list.map((p, i) => tourRow(p, i, rc)).join("")
            : `<div class="card empty"><h3>${esc(t("no_results"))}</h3><button type="button" class="ghost" data-act="tclear">${esc(t("clear_filters"))}</button></div>`}
        </section></div></div>`;
  }
};
function tourRow(p, i, rc){
  const h = p.h;
  return `<article class="hotel lift ${rc}" style="--i:${i}" data-flip="${h.id}">${hotelArt(h)}
    <div class="ho-main">
      <div class="ho-h"><h3>${esc(h.name)}</h3>${stars(h.stars)}</div>
      <span class="muted small">${esc(joinPlace([h.area, beachText(h)]))}</span>
      <div class="ho-tags">${ratingTag(h)}<span class="tag-b"><b class="mono">${h.board}</b> ${esc(t("board_" + h.board))}</span></div>
      <div class="incl">${[t("incl_flight"), t("incl_transfer"), t("incl_insurance")].map(x => `<span>${IC.ok}${esc(x)}</span>`).join("")}</div>
    </div>
    <div class="ho-buy"><span class="of-price">${fmt(p.perPerson)}</span>
      <small class="muted">${esc(t("per_person"))}</small>
      <small class="muted">${esc(t("total"))} ${fmt(p.total)}</small>
      <span class="save">${esc(tf("save_vs", { s: fmt(p.saving) }))}</span>
      <a class="solid" href="#/tours/item/${h.id}">${esc(t("details"))}</a></div></article>`;
}
PAGES["tours/item/:id"] = {
  render({ id }){
    const q = M.tours, h = hotelById(id); if (!h || !q.searched || !RESORTS.includes(h.city)) { go(SEARCH_PATH); return null; }
    const p = tourPackage(h, q), lines = tourLines(p, q), an = arcOnce();
    return `<div class="container section">${backLink("tours/results", t("back_results"))}
      <div class="hhero">${hotelGallery(h)}<div class="stack" style="gap:8px">
        <span class="lbl">${esc(t("tour_to"))} ${esc(cityName(q.to))}, ${esc(countryName(q.to))}</span>
        <div class="ho-h"><h1>${esc(h.name)}</h1>${stars(h.stars)}</div>
        <span class="muted">${esc(joinPlace([h.area, beachText(h)]))}</span>
        <div class="ho-tags">${ratingTag(h)}<span class="tag-b"><b class="mono">${h.board}</b> ${esc(t("board_" + h.board))}</span></div>
        ${amenityChips(h)}</div></div>
      <div class="twocol" style="margin-top:20px">
        <div class="stack">${legCard(p.out, t("leg_out"), an)}${legCard(p.back, t("leg_back"), an, 180)}
          <div class="card stack"><h3>${esc(t("tour_includes"))}</h3><div class="incl big">
            ${[t("incl_flight_full"), tf("incl_hotel_full", { n: pl(q.nights, "night"), b: t("board_" + h.board) }), t("incl_transfer_full"), t("incl_insurance_full")]
              .map(x => `<span>${IC.ok}${esc(x)}</span>`).join("")}</div></div></div>
        <aside class="card sticky stack"><span class="lbl">${esc(t("tour_price"))}</span>
          ${checkLines(lines, p.total, "tour")}
          <button type="button" class="cta" data-act="tbook" data-h="${h.id}">${esc(t("book_tour"))}</button>
          <p class="small muted">${esc(tf("tour_pp", { p: fmt(p.perPerson) }))}</p></aside></div></div>`;
  }
};

function startTourCheckout(hid){
  const q = M.tours, h = hotelById(hid), p = tourPackage(h, q);
  const types = [...Array(q.adults).fill("adult"), ...Array(q.children).fill("child")];
  startCheckout({
    type: "TOUR", title: `${h.name} · ${cityName(q.to)}`,
    sub: `${fdateY(q.depart)} — ${fdateY(addDays(q.depart, q.nights))} · ${pl(q.nights, "night")} · ${pl(p.people, "tourist")}`,
    start: q.depart, end: addDays(q.depart, q.nights),
    travellers: { mode:"full", types },
    lines: tourLines(p, q), total: p.total, recheck: true,
    /* Наценку на рейсы могли сменить в админке после выбора тура — пересчитываем. */
    priceChange: () => { const p2 = tourPackage(h, q); return p2.total.usd === p.total.usd && p2.total.uzs === p.total.uzs ? null
      : { total:p2.total, lines:tourLines(p2, q), details:{ hotelId:h.id, to:q.to, depart:q.depart, nights:q.nights, adults:q.adults, children:q.children, rooms:p2.rooms, out:p2.out, back:p2.back } }; },
    details: { hotelId:h.id, to:q.to, depart:q.depart, nights:q.nights, adults:q.adults, children:q.children, rooms:p.rooms, out:p.out, back:p.back },
    ref: makeRef("TOUR" + h.id + q.depart + q.nights)
  });
}
function tourVoucherBody(o){
  const d = o.details, h = hotelById(d.hotelId) || missingHotel(o);
  return `<div class="vgrid">
    <div class="wide"><span class="lbl">${esc(t("hotel"))}</span><b>${esc(h.name)} ${stars(h.stars)}</b><span class="muted small">${esc(joinPlace([h.area, cityName(h.city)], ", "))}</span></div>
    <div><span class="lbl">${esc(t("dates"))}</span><b>${esc(fdate(d.depart))} — ${esc(fdate(addDays(d.depart, d.nights)))}</b><span class="muted small">${esc(pl(d.nights, "night"))}</span></div>
    <div><span class="lbl">${esc(t("board"))}</span><b><span class="mono">${h.board}</span> ${esc(t("board_" + h.board))}</b></div>
    <div><span class="lbl">${esc(t("leg_out"))}</span><b class="mono">${d.out.flightNo} · ${d.out.depTime}</b><span class="muted small">TAS → ${d.out.to} · ${esc(fdate(d.out.date))}</span></div>
    <div><span class="lbl">${esc(t("leg_back"))}</span><b class="mono">${d.back.flightNo} · ${d.back.depTime}</b><span class="muted small">${d.back.from} → TAS · ${esc(fdate(d.back.date))}</span></div>
    <div><span class="lbl">${esc(t("transfer"))}</span><b>${esc(t("transfer_group"))}</b></div>
    <div><span class="lbl">${esc(t("insurance"))}</span><b>${esc(t("insurance_basic"))}</b></div>
    <div class="wide"><span class="lbl">${esc(t("tourists"))}</span><b>${o.travellers.map(x => esc(x.given + " " + x.surname)).join(", ")}</b></div>
  </div>`;
}
