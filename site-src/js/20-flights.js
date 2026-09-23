/* ==========================================================================
   Модуль «Авиабилеты». Движок перенесён 1:1 из src/data/flights.ts:
   тот же маршрут и дата дают те же рейсы, что в мобильном приложении.
   ========================================================================== */
"use strict";

const PROVIDERS = ["aqua","kompas","easy","prestige"];
function addMinutes(hhmm, mins){ const [h,m] = hhmm.split(":").map(Number); const x = (h*60+m+mins+1440*3) % 1440; return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0"); }
function baseSeed(from, to){
  const key = `${from}-${to}`; if (ROUTES[key]) return ROUTES[key];
  const rnd = mulberry32(seedFrom(key));
  const eco = 180+Math.floor(rnd()*420), durationMin = 150+Math.floor(rnd()*420), depH = 5+Math.floor(rnd()*16);
  const c = CARRIERS[Math.floor(rnd()*CARRIERS.length)];
  const depTime = `${String(depH).padStart(2,"0")}:${["00","15","30","45"][Math.floor(rnd()*4)]}`;
  return { carrier:c.name, flightNo:`${c.code}-${100+Math.floor(rnd()*899)}`, plane:PLANES[Math.floor(rnd()*PLANES.length)],
    depTime, arrTime:addMinutes(depTime, durationMin), ecoPrice:eco, busPrice:eco+220+Math.floor(rnd()*260), durationMin };
}
function generateOffers({ from, to, date, cabin }){
  const seed = baseSeed(from, to), rnd = mulberry32(seedFrom(`${from}-${to}-${date}-${cabin}`));
  const count = 4+Math.floor(rnd()*4), offers = [];
  for (let i = 0; i < count; i++) {
    const isBase = i === 0;
    const carrier = isBase ? { name:seed.carrier, code:seed.flightNo.split("-")[0] } : CARRIERS[Math.floor(rnd()*CARRIERS.length)];
    const stops = isBase ? 0 : (rnd() < 0.55 ? 0 : 1);
    const extra = stops === 1 ? 120+Math.floor(rnd()*150) : 0;
    const durationMin = seed.durationMin+extra+Math.floor((rnd()-0.5)*40);
    const depTime = isBase ? seed.depTime : addMinutes(seed.depTime, Math.floor((rnd()-0.5)*600));
    const arrTime = addMinutes(depTime, durationMin);
    const rawBase = cabin === "business" ? seed.busPrice : seed.ecoPrice;
    const jitter = isBase ? 0 : Math.floor((rnd()-0.35)*(cabin === "business" ? 160 : 90));
    const stopDiscount = stops === 1 ? -Math.floor(rawBase*0.08) : 0;
    const priceUSD = Math.round(Math.max(90, rawBase+jitter+stopDiscount) * 1.1);   // +10% наценка, как на сервере
    const stopCities = ["DXB","IST","DME","SHJ","ALA"];
    offers.push({ id:`${from}${to}-${date}-${i}`, provider:PROVIDERS[Math.floor(rnd()*PROVIDERS.length)],
      carrier:carrier.name, carrierCode:carrier.code,
      flightNo:isBase ? seed.flightNo : `${carrier.code}-${100+Math.floor(rnd()*899)}`,
      aircraft:isBase ? seed.plane : PLANES[Math.floor(rnd()*PLANES.length)],
      from, to, date, depTime, arrTime, durationMin, stops,
      stopCity:stops === 1 ? stopCities[Math.floor(rnd()*stopCities.length)] : undefined,
      cabin, priceUSD, priceUZS:toUzs(priceUSD), baggageKg:cabin === "business" ? 30 : 20, seatsLeft:1+Math.floor(rnd()*9) });
  }
  return offers.sort((a, b) => a.priceUSD - b.priceUSD);
}
/* Код брони — src/app/review.tsx makeRef. */
function makeRef(seed){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h*31 + seed.charCodeAt(i)) >>> 0;
  let out = ""; for (let i = 0; i < 6; i++) { out += chars[h % chars.length]; h = Math.floor(h/chars.length) + seed.charCodeAt(i % seed.length)*7; }
  return `CHR-${out}`;
}
/* Регулярный рейс маршрута из таблицы приложения, если он есть, иначе самый дешёвый. */
function baseOffer(from, to, date, cabin = "economy"){
  const list = generateOffers({ from, to, date, cabin }), r = ROUTES[`${from}-${to}`];
  return (r && list.find(o => o.flightNo === r.flightNo)) || list[0];
}
const seatFor = o => `${10 + (o.durationMin % 20)}${"ABCDEF"[o.priceUSD % 6]}`;
const gateFor = o => `${"AB"[o.priceUSD % 2]}${5 + (o.durationMin % 15)}`;

/* Цена — src/app/offer.tsx: (туда + обратно) × (взрослые + дети) + 10% × младенцы. */
function flightFare(out, back, q){
  const unit = { usd: out.priceUSD + (back ? back.priceUSD : 0), uzs: out.priceUZS + (back ? back.priceUZS : 0) };
  const inf  = { usd: Math.round(unit.usd * 0.1), uzs: Math.round(unit.uzs * 0.1) };
  const paying = q.adults + q.children;
  return { unit, inf, total: addA(mulA(unit, paying), mulA(inf, q.infants)) };
}

/* ---------------------------------------------------------------- состояние */
M.flights = { from:"TAS", to:"IST", type:"roundtrip", depart:addDays(TODAY,14), ret:addDays(TODAY,21),
  adults:1, children:0, infants:0, cabin:"economy", leg:"out", sel:{ out:null, back:null },
  sort:"cheapest", direct:false, carriers:[], times:[], searched:false };
const LOADED = new Set();
const legQuery = leg => { const f = M.flights; return leg === "back" ? { from:f.to, to:f.from, date:f.ret } : { from:f.from, to:f.to, date:f.depart }; };
const legKey = leg => { const q = legQuery(leg); return `${q.from}-${q.to}-${q.date}-${M.flights.cabin}`; };
const TIME_BUCKETS = [["night",0,6],["morning",6,12],["day",12,18],["evening",18,24]];

MODULES.flights = {
  type: "FLIGHT", icon: IC.flights, label: "mod_flights",
  normalize(){ const f = M.flights; f.infants = Math.min(f.infants, f.adults); },
  paxSummary(){
    const f = M.flights, n = f.adults + f.children + f.infants;
    return `${pl(n, "pax")}, ${t(f.cabin).toLowerCase()}`;
  },
  form(){
    const f = M.flights, n = f.adults + f.children + f.infants;
    return `<div class="sform">
      <div class="sform-top">${seg("ftype", [["roundtrip", t("roundtrip")], ["oneway", t("oneway")]], f.type)}</div>
      <div class="sgrid sgrid-flights">
        <label class="field"><span>${esc(t("from"))}</span>${airportSelect("flights.from", f.from, f.to)}</label>
        <button type="button" class="swapbtn" data-act="fswap" aria-label="${esc(t("swap"))}">${IC.swap}</button>
        <label class="field"><span>${esc(t("to"))}</span>${airportSelect("flights.to", f.to, f.from)}</label>
        <label class="field"><span>${esc(t("depart"))}</span><input type="date" data-bind="flights.depart" data-rr value="${f.depart}" min="${TODAY}"></label>
        <label class="field ${f.type === "oneway" ? "is-off" : ""}"><span>${esc(t("return_"))}</span>
          <input type="date" data-bind="flights.ret" value="${f.ret}" min="${f.depart}" ${f.type === "oneway" ? "disabled" : ""}></label>
        <div class="field"><span>${esc(t("passengers"))}</span>
          <details class="drop" data-keep="fpax" ${M.ui.fpax ? "open" : ""}><summary class="dropsum">${esc(this.paxSummary())}</summary>
            <div class="droppanel steps">
              ${stepper("flights.adults", f.adults, 1, 9 - f.children - f.infants, t("adults"), t("age_adult"))}
              ${stepper("flights.children", f.children, 0, 9 - f.adults - f.infants, t("children"), t("age_child"))}
              ${stepper("flights.infants", f.infants, 0, Math.min(f.adults, 9 - f.adults - f.children), t("infants"), t("age_infant"))}
              <div class="steprow"><b>${esc(t("cabin_class"))}</b>${seg("fcabin", [["economy", t("economy")], ["business", t("business")]], f.cabin)}</div>
            </div></details></div>
        <button type="button" class="cta sgo" data-act="fsearch">${esc(t("search_cta"))}</button>
      </div>
      <div class="err" id="serr" hidden></div></div>`;
  },
  search(){ ACT.fsearch(); }
};

Object.assign(ACT, {
  ftype:   el => { M.flights.type = el.dataset.v; rerender(); },
  fcabin:  el => { M.flights.cabin = el.dataset.v; rerender(); },
  fswap:   () => { const f = M.flights; [f.from, f.to] = [f.to, f.from]; rerender(); },
  fsearch: () => {
    const f = M.flights; hideErr("#serr");
    if (f.from === f.to) return showErr("#serr", t("err_same_city"));
    if (f.depart < TODAY) return showErr("#serr", t("err_date_past"));
    if (f.type === "roundtrip" && f.ret < f.depart) return showErr("#serr", t("err_return"));
    Object.assign(f, { searched:true, leg:"out", sel:{ out:null, back:null }, sort:"cheapest", direct:false, carriers:[], times:[] });
    M.ui.fpax = false; go("flights/results");
  },
  fsort:   el => { M.flights.sort = el.dataset.v; rerender(); },
  fdirect: () => { M.flights.direct = !M.flights.direct; rerender(); },
  fcarrier: el => { const a = M.flights.carriers, c = el.dataset.v; M.flights.carriers = a.includes(c) ? a.filter(x => x !== c) : [...a, c]; rerender(); },
  ftime:   el => { const a = M.flights.times, c = el.dataset.v; M.flights.times = a.includes(c) ? a.filter(x => x !== c) : [...a, c]; rerender(); },
  fclear:  () => Object.assign(M.flights, { direct:false, carriers:[], times:[] }) && rerender(),
  fday:    el => {
    const f = M.flights, d = el.dataset.v;
    if (f.leg === "back") f.ret = d;
    else { f.depart = d; if (f.type === "roundtrip" && f.ret < d) f.ret = addDays(d, 7); }
    rerender();
  },
  fpick:   el => {
    const f = M.flights, o = generateOffers({ ...legQuery(f.leg), cabin:f.cabin }).find(x => x.id === el.dataset.v);
    if (!o) return;
    if (f.leg === "out") {
      f.sel = { out:o, back:null };
      if (f.type === "roundtrip") { Object.assign(f, { leg:"back", carriers:[], times:[], direct:false }); return render(true); }
    } else f.sel.back = o;
    go("flights/offer");
  },
  fback:   () => { M.flights.leg = "out"; render(true); },
  fbook:   () => startFlightCheckout()
});

/* --------------------------------------------------------------- выдача */
function priceCalendar(){
  const f = M.flights, q = legQuery(f.leg), minDate = f.leg === "back" ? f.depart : TODAY;
  const days = [];
  for (let i = -3; i <= 3; i++) { const d = addDays(q.date, i); if (d >= minDate) days.push(d); }
  const prices = days.map(d => generateOffers({ from:q.from, to:q.to, date:d, cabin:f.cabin })[0]);
  const lo = Math.min(...prices.map(p => p.priceUSD)), hi = Math.max(...prices.map(p => p.priceUSD));
  return `<div class="cal" role="group" aria-label="${esc(t("price_calendar"))}">${days.map((d, i) => {
    const p = prices[i], cls = d === q.date ? "on" : p.priceUSD === lo ? "lo" : p.priceUSD === hi && hi !== lo ? "hi" : "";
    return `<button type="button" class="calday ${cls}" data-act="fday" data-v="${d}" aria-pressed="${d === q.date}">
      <span class="cd">${esc(fdate(d, { weekday:"short", day:"numeric", month:"short" }))}</span>
      <span class="cp">${fmt({ usd:p.priceUSD, uzs:p.priceUZS })}</span></button>`; }).join("")}</div>`;
}
function offerRow(o, i, bestId){
  return `<article class="offer rise" style="--i:${i}">
    <div class="of-car">${carrierBadge(o.carrierCode)}<span><b>${esc(o.carrier)}</b><small class="mono">${o.flightNo} · ${esc(o.aircraft)}</small></span>
      ${o.id === bestId ? `<span class="tag-best">${esc(t("best"))}</span>` : ""}</div>
    <div class="of-route">${routeBlock(o)}</div>
    <div class="of-buy">
      <span class="of-price">${fmt({ usd:o.priceUSD, uzs:o.priceUZS })}</span>
      <small class="muted">${esc(t("per_passenger"))}</small>
      <span class="of-meta">${esc(t("baggage"))} ${o.baggageKg} ${esc(t("kg"))}${o.seatsLeft <= 3 ? ` · <b class="left">${esc(tf("seats_left", { n:o.seatsLeft }))}</b>` : ""}</span>
      <button type="button" class="solid" data-act="fpick" data-v="${o.id}">${esc(t("select_flight"))}</button>
    </div></article>`;
}
PAGES["flights/results"] = {
  render(){
    const f = M.flights; if (!f.searched) { go(""); return null; }
    const q = legQuery(f.leg), key = legKey(f.leg), n = f.adults + f.children + f.infants;
    const head = `<div class="resbar"><div class="container resbar-in">
        <div><span class="rb-route mono">${q.from} → ${q.to}</span>
        <span class="muted">${esc(fdateLong(q.date))} · ${esc(pl(n, "pax"))} · ${esc(t(f.cabin))}</span></div>
        <a class="ghost sm" href="#/">${esc(t("edit_search"))}</a></div></div>`;
    const legNote = f.type === "roundtrip" ? `<div class="legsteps">
        <span class="${f.leg === "out" ? "on" : "done"}">1 · ${esc(t("leg_out"))}${f.sel.out ? ` — <b class="mono">${f.sel.out.flightNo}</b>` : ""}</span>
        <span class="${f.leg === "back" ? "on" : ""}">2 · ${esc(t("leg_back"))}</span>
        ${f.leg === "back" ? `<button type="button" class="link" data-act="fback">${esc(t("change_out"))}</button>` : ""}</div>` : "";
    if (!LOADED.has(key)) return head + `<div class="container section">${legNote}
        <div class="searching"><span class="spin"></span>${esc(t("searching_providers"))}</div>
        <div class="stack">${[0,1,2].map(() => `<div class="skel"></div>`).join("")}</div></div>`;

    const all = generateOffers({ ...q, cabin:f.cabin }), bestId = all[0]?.id;
    const bucket = o => TIME_BUCKETS.find(([, a, b]) => { const h = Number(o.depTime.slice(0,2)); return h >= a && h < b; })[0];
    let list = all.filter(o => (!f.direct || !o.stops) && (!f.carriers.length || f.carriers.includes(o.carrierCode)) && (!f.times.length || f.times.includes(bucket(o))));
    if (f.sort === "fastest") list = [...list].sort((a, b) => a.durationMin - b.durationMin);
    if (f.sort === "early") list = [...list].sort((a, b) => a.depTime.localeCompare(b.depTime));
    const carriers = [...new Map(all.map(o => [o.carrierCode, o.carrier])).entries()];
    const chk = (act, v, on, label) => `<label class="chk"><input type="checkbox" data-act="${act}" data-v="${v}" ${on ? "checked" : ""}><span>${esc(label)}</span></label>`;

    return head + `<div class="container section">${legNote}${priceCalendar()}
      <div class="reslayout">
        <aside class="filters">
          <details class="fbox" data-keep="filters" ${fboxOpen()}><summary>${esc(t("filters"))}</summary><div class="fbody">
            <div class="fgroup"><span class="lbl">${esc(t("sort"))}</span>
              ${seg("fsort", [["cheapest", t("sort_cheapest")], ["fastest", t("sort_fastest")], ["early", t("sort_early")]], f.sort)}</div>
            <div class="fgroup">${chk("fdirect", "1", f.direct, t("filter_direct"))}</div>
            <div class="fgroup"><span class="lbl">${esc(t("airlines"))}</span>${carriers.map(([c, name]) => chk("fcarrier", c, f.carriers.includes(c), name)).join("")}</div>
            <div class="fgroup"><span class="lbl">${esc(t("dep_time"))}</span>${TIME_BUCKETS.map(([id, a, b]) =>
              chk("ftime", id, f.times.includes(id), `${t("t_" + id)} · ${String(a).padStart(2,"0")}–${String(b).padStart(2,"0")}`)).join("")}</div>
            <button type="button" class="link" data-act="fclear">${esc(t("clear_filters"))}</button>
          </div></details>
        </aside>
        <section class="stack">
          <p class="muted small">${esc(tf("found_n", { n:list.length }))}</p>
          ${list.length ? list.map((o, i) => offerRow(o, i, bestId)).join("")
            : `<div class="card empty"><h3>${esc(t("no_results"))}</h3><p class="muted">${esc(t("no_results_body"))}</p>
               <button type="button" class="ghost" data-act="fclear">${esc(t("clear_filters"))}</button></div>`}
        </section>
      </div></div>`;
  },
  after(){
    const key = legKey(M.flights.leg);
    if (M.flights.searched && !LOADED.has(key)) setTimeout(() => { LOADED.add(key); if (currentParts().join("/") === "flights/results") rerender(); }, 850);
  }
};

/* --------------------------------------------------------- детали и цена */
function legCard(o, label){
  return `<div class="card leg">
    <div class="leg-h"><span class="lbl">${esc(label)} · ${esc(fdateLong(o.date))}</span>${carrierBadge(o.carrierCode)}</div>
    ${routeBlock(o)}
    <div class="rows">
      <div><span class="k">${esc(o.carrier)}</span><span class="v mono">${o.flightNo}</span></div>
      <div><span class="k">${esc(t("aircraft"))}</span><span class="v">${esc(o.aircraft)}</span></div>
      <div><span class="k">${esc(t("baggage"))}</span><span class="v">${o.baggageKg} ${esc(t("kg"))}</span></div>
      <div><span class="k">${esc(t("carryon"))}</span><span class="v">${IC.ok}</span></div>
    </div></div>`;
}
function flightLines(out, back, q){
  const fare = flightFare(out, back, q), lines = [];
  if (q.adults)   lines.push([`${t("adults")} × ${q.adults}`, mulA(fare.unit, q.adults)]);
  if (q.children) lines.push([`${t("children")} × ${q.children}`, mulA(fare.unit, q.children)]);
  if (q.infants)  lines.push([`${t("infant_fare")} × ${q.infants}`, mulA(fare.inf, q.infants)]);
  return { lines, total: fare.total };
}
PAGES["flights/offer"] = {
  render(){
    const f = M.flights; if (!f.sel.out) { go(""); return null; }
    const { lines, total } = flightLines(f.sel.out, f.sel.back, f);
    return `<div class="container section">${backLink("flights/results", t("back_results"))}
      ${pageHead(t("flight_details"))}
      <div class="twocol"><div class="stack">${legCard(f.sel.out, t("leg_out"))}${f.sel.back ? legCard(f.sel.back, t("leg_back")) : ""}</div>
        <aside class="card sticky stack">
          <span class="lbl">${esc(t("your_fare"))}</span>
          <div class="rows">${lines.map(([l, a]) => `<div><span class="k">${esc(l)}</span><span class="v mono">${fmt(a)}</span></div>`).join("")}
            <div class="tot"><span class="k">${esc(t("total"))}</span><span class="v">${fmt(total)}</span></div></div>
          <button type="button" class="cta" data-act="fbook">${esc(t("to_checkout"))}</button>
          <p class="small muted">${esc(t("fare_note"))}</p>
        </aside></div></div>`;
  }
};

function flightDetailsOf(out, back, q){ return { out, back, q:{ adults:q.adults, children:q.children, infants:q.infants, cabin:q.cabin } }; }
function startFlightCheckout(){
  const f = M.flights, out = f.sel.out, back = f.sel.back;
  const { lines, total } = flightLines(out, back, f);
  const types = [...Array(f.adults).fill("adult"), ...Array(f.children).fill("child"), ...Array(f.infants).fill("infant")];
  startCheckout({
    type: "FLIGHT",
    title: `${cityName(out.from)} → ${cityName(out.to)}${back ? " → " + cityName(back.to) : ""}`,
    sub: `${fdateY(out.date)}${back ? " — " + fdateY(back.date) : ""} · ${pl(types.length, "pax")}`,
    start: out.date, end: back ? back.date : out.date,
    travellers: { mode:"full", types },
    lines, total, recheck: true,
    details: flightDetailsOf(out, back, f),
    ref: makeRef(out.id + out.date),
    /* Демонстрация «Цена изменилась»: срабатывает на рейсах в Анталию, чтобы
       экран можно было показать по заказу, а не случайно посреди показа. */
    priceChange: out.to === "AYT" ? () => {
      const usd = Math.round(out.priceUSD * 1.045), newOut = { ...out, priceUSD:usd, priceUZS:toUzs(usd) };
      const r = flightLines(newOut, back, f);
      return { total:r.total, lines:r.lines, details:flightDetailsOf(newOut, back, f) };
    } : null
  });
}

/* ------------------------------------------------ документ: посадочные талоны */
function flightDocument(o){
  const d = o.details, pax = o.travellers, lead = pax[0];
  const pass = (leg, i) => `<article class="pass rise" style="--i:${i}">
    <div class="pass-top">${carrierBadge(leg.carrierCode)}<span class="n">${esc(leg.carrier)}</span><span class="f">${leg.flightNo}</span></div>
    <div class="pass-body">${routeBlock(leg, `<span class="d">${esc(fdate(leg.date))}</span>`)}
      <div class="pgrid">
        <div class="wide"><span class="lbl">${esc(t("passenger"))}</span><b>${esc(lead.given)} ${esc(lead.surname)}${pax.length > 1 ? ` +${pax.length-1}` : ""}</b></div>
        <div><span class="lbl">${esc(t("cabin_class"))}</span><b>${esc(t(leg.cabin))}</b></div>
        <div><span class="lbl">${esc(t("seat"))}</span><b class="mono">${seatFor(leg)}</b></div>
        <div><span class="lbl">${esc(t("gate"))}</span><b class="mono">${gateFor(leg)}</b></div>
        <div><span class="lbl">${esc(t("boarding"))}</span><b class="mono">${addMinutes(leg.depTime, -40)}</b></div>
      </div></div>
    <div class="perf"></div>
    ${qrStub(o)}</article>`;
  return `<div class="docgrid">${pass(d.out, 0)}${d.back ? pass(d.back, 1) : ""}</div>`;
}
