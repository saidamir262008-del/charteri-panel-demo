/* ==========================================================================
   Модули «Частные самолёты» и «Вертолёты». Поиска с ценами нет — у чартерных
   бортов нет API, цену ставит менеджер. Это та же заявочная модель, что в
   B2B-панели и в спецификации: NEW → PENDING (цена) → PAID → CONFIRMED.
   Сайт показывает честную оценку диапазоном до отправки заявки.
   ========================================================================== */
"use strict";

const round = (x, step) => Math.round(x / step) * step;
const fitClass = (list, pax, id) => id === "auto" ? list.find(c => c.seats >= pax) : list.find(c => c.id === id && c.seats >= pax);

function jetEstimate(q){
  const cls = fitClass(JETS, q.pax, q.cls); if (!cls) return null;
  const km = distanceKm(COORDS[q.from], COORDS[q.to]);
  const hours = km / cls.speed + 0.4;                         // + руление, набор, снижение
  const base = hours * cls.rate * (q.trip === "roundtrip" ? 2 : 1);
  return { cls, km, hours, low: amt(round(base, 100)), high: amt(round(base * 1.3, 100)), final: amt(round(base * 1.12, 100)) };
}
function heliEstimate(q){
  const cls = fitClass(HELIS, q.pax, q.cls); if (!cls) return null;
  const d = HELI_DEST.find(x => x.id === q.to);
  const km = d.tour ? 0 : distanceKm(HELI_BASE, d.coord);
  const hours = d.tour ? 0.5 : km / cls.speed + 0.25;
  // В одну сторону вертолёт всё равно возвращается на базу — оплачивается частично.
  const legs = d.tour ? 1 : q.trip === "roundtrip" ? 2 : 1.6;
  const base = Math.max(hours * cls.rate * legs, cls.rate * 0.5);
  return { cls, km, hours, dest:d, low: amt(round(base, 50)), high: amt(round(base * 1.25, 50)), final: amt(round(base * 1.1, 50)) };
}
const heliName = id => HELI_DEST.find(x => x.id === id)?.name[S.lang] ?? id;
const hoursText = h => { const m = Math.round(h * 60); return m < 60 ? `${m} ${t("min")}` : dur(m); };

M.jet  = { from:"TAS", to:"DXB", date:addDays(TODAY,10), time:"10:00", pax:4, cls:"auto", trip:"oneway", name:"", phone:"", note:"" };
M.heli = { to:"chimgan", date:addDays(TODAY,5), time:"11:00", pax:3, cls:"auto", trip:"roundtrip", name:"", phone:"", note:"" };

MODULES.jet = {
  type: "JET", icon: IC.jet, label: "mod_jet",
  form(){
    const q = M.jet, e = jetEstimate(q);
    return `<div class="sform"><div class="sgrid sgrid-jet">
      <label class="field"><span>${esc(t("from"))}</span>${airportSelect("jet.from", q.from, q.to)}</label>
      <label class="field"><span>${esc(t("to"))}</span>${airportSelect("jet.to", q.to, q.from)}</label>
      <label class="field"><span>${esc(t("depart"))}</span><input type="date" data-bind="jet.date" value="${q.date}" min="${TODAY}"></label>
      <div class="field"><span>${esc(t("passengers"))}</span>
        <details class="drop" data-keep="jpax" ${M.ui.jpax ? "open data-restored" : ""}><summary class="dropsum">${esc(pl(q.pax, "pax"))}</summary>
          <div class="droppanel steps">${stepper("jet.pax", q.pax, 1, 14, t("passengers"), t("jet_max"))}</div></details></div>
      <button type="button" class="cta sgo" data-act="jgo"><span>${esc(t("jet_calc"))}</span><span class="cta-ic">${IC.jet}</span></button>
    </div>
    <p class="sform-note">${e ? `${IC.clock}<span>${esc(tf("est_line", { h: hoursText(e.hours), m: e.cls.model }))} · <b><span ${countAttr("jf-lo", e.low)}>${fmt(e.low)}</span> – <span ${countAttr("jf-hi", e.high)}>${fmt(e.high)}</span></b></span>` : ""}</p>
    <div class="err" id="serr" hidden></div></div>`;
  },
  search(){ ACT.jgo(); }
};
MODULES.heli = {
  type: "HELI", icon: IC.heli, label: "mod_heli",
  form(){
    const q = M.heli, e = heliEstimate(q);
    return `<div class="sform"><div class="sgrid sgrid-heli">
      <label class="field"><span>${esc(t("from"))}</span><select disabled><option>${esc(t("heli_base_short"))}</option></select></label>
      <label class="field"><span>${esc(t("where_to"))}</span><select data-bind="heli.to" data-rr>${HELI_DEST.map(d =>
        `<option value="${d.id}" ${d.id === q.to ? "selected" : ""}>${esc(d.name[S.lang])}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(t("date"))}</span><input type="date" data-bind="heli.date" value="${q.date}" min="${TODAY}"></label>
      <div class="field"><span>${esc(t("passengers"))}</span>
        <details class="drop" data-keep="hlpax" ${M.ui.hlpax ? "open data-restored" : ""}><summary class="dropsum">${esc(pl(q.pax, "pax"))}</summary>
          <div class="droppanel steps">${stepper("heli.pax", q.pax, 1, 18, t("passengers"), t("heli_max"))}</div></details></div>
      <button type="button" class="cta sgo" data-act="hlgo"><span>${esc(t("heli_calc"))}</span><span class="cta-ic">${IC.heli}</span></button>
    </div>
    <p class="sform-note">${e ? `${IC.clock}<span>${esc(tf("est_line", { h: hoursText(e.hours), m: e.cls.model }))} · <b><span ${countAttr("hf-lo", e.low)}>${fmt(e.low)}</span> – <span ${countAttr("hf-hi", e.high)}>${fmt(e.high)}</span></b></span>` : ""}</p>
    <div class="err" id="serr" hidden></div></div>`;
  },
  search(){ ACT.hlgo(); }
};

Object.assign(ACT, {
  jgo:  () => { hideErr("#serr"); if (M.jet.from === M.jet.to) return showErr("#serr", t("err_same_city")); M.ui.jpax = false; go("charter/jet"); },
  hlgo: () => { M.ui.hlpax = false; go("charter/heli"); },
  jcls: el => { M.jet.cls = el.dataset.v; rerender(); },
  hcls: el => { M.heli.cls = el.dataset.v; rerender(); },
  jtrip: el => { M.jet.trip = el.dataset.v; rerender(); },
  htrip: el => { M.heli.trip = el.dataset.v; rerender(); },
  csend: el => sendCharterRequest(el.dataset.v)
});

const clsPhoto = key => hasPhoto(key) ? `<span class="cls-ph">${photo(key, { w:400, sizes:"(max-width:600px) 50vw, 240px", deco:true })}</span>` : "";
/* Фото места назначения над расчётом: для вертолёта — сама точка, для самолёта — город. */
const charterPhotoKey = (kind, q) => kind === "heli" ? "heli-" + q.to : q.to;
function classCards(kind, list, q){
  const act = kind === "jet" ? "jcls" : "hcls";
  const auto = list.find(c => c.seats >= q.pax);
  return `<div class="clsgrid">
    <button type="button" class="cls" data-act="${act}" data-v="auto" aria-pressed="${q.cls === "auto"}">
      ${clsPhoto(kind + "-cabin")}<b>${esc(t("cls_auto"))}</b><span class="muted small">${auto ? esc(auto.model) : "—"}</span></button>
    ${list.map(c => `<button type="button" class="cls" data-act="${act}" data-v="${c.id}" aria-pressed="${q.cls === c.id}" ${c.seats < q.pax ? "disabled" : ""}>
      ${clsPhoto(kind + "-" + c.id)}<b>${esc(kind === "jet" ? t("jet_" + c.id) : c.model)}</b>
      <span class="muted small">${kind === "jet" ? esc(c.model) + " · " : ""}${esc(tf("up_to_seats", { n:c.seats }))}</span>
      <span class="mono small">${fmt(amt(c.rate))} / ${esc(t("hour"))}</span></button>`).join("")}</div>`;
}
function charterPage(kind){
  const q = M[kind], isJet = kind === "jet", e = isJet ? jetEstimate(q) : heliEstimate(q);
  const tripSeg = isJet ? seg("jtrip", [["oneway", t("oneway")], ["roundtrip", t("roundtrip")]], q.trip)
    : e?.dest?.tour ? `<p class="muted small">${esc(t("heli_tour_note"))}</p>` : seg("htrip", [["roundtrip", t("heli_rt")], ["oneway", t("oneway")]], q.trip);
  const routeFields = isJet
    ? `<label class="field"><span>${esc(t("from"))}</span>${airportSelect("jet.from", q.from, q.to)}</label>
       <label class="field"><span>${esc(t("to"))}</span>${airportSelect("jet.to", q.to, q.from)}</label>`
    : `<label class="field"><span>${esc(t("from"))}</span><select disabled><option>${esc(t("heli_base_short"))}</option></select></label>
       <label class="field"><span>${esc(t("where_to"))}</span><select data-bind="heli.to" data-rr>${HELI_DEST.map(d =>
         `<option value="${d.id}" ${d.id === q.to ? "selected" : ""}>${esc(d.name[S.lang])}</option>`).join("")}</select></label>`;
  return `<div class="container section">${backLink("", t("home"))}
    ${pageHead(t(isJet ? "jet_title" : "heli_title"), t(isJet ? "jet_sub" : "heli_sub"))}
    <div class="twocol"><div class="stack">
      <div class="card stack"><h3>${esc(t("route_when"))}</h3>
        <div class="sgrid sgrid-2">${routeFields}
          <label class="field"><span>${esc(t("date"))}</span><input type="date" data-bind="${kind}.date" value="${q.date}" min="${TODAY}"></label>
          <label class="field"><span>${esc(t("time"))}</span><input type="time" data-bind="${kind}.time" value="${q.time}" step="900"></label></div>
        ${tripSeg}
        <div class="steps">${stepper(kind + ".pax", q.pax, 1, isJet ? 14 : 18, t("passengers"), "")}</div></div>
      <div class="card stack"><h3>${esc(t(isJet ? "aircraft_class" : "heli_type"))}</h3>${classCards(kind, isJet ? JETS : HELIS, q)}</div>
      <div class="card stack"><h3>${esc(t("contact_details"))}</h3>
        <div class="sgrid sgrid-2">
          <label class="field"><span>${esc(t("your_name"))}</span><input data-bind="${kind}.name" value="${esc(q.name)}" autocomplete="name"></label>
          <label class="field"><span>${esc(t("phone_label"))}</span><input type="tel" data-bind="${kind}.phone" value="${esc(q.phone || S.user?.phone || "")}" autocomplete="tel" placeholder="+998"></label></div>
        <label class="field"><span>${esc(t("wishes"))}</span><textarea data-bind="${kind}.note" placeholder="${esc(t(isJet ? "jet_note_ph" : "heli_note_ph"))}">${esc(q.note)}</textarea></label>
        <div class="err" id="cherr" hidden></div></div>
    </div>
    <aside class="card sticky stack">${hasPhoto(charterPhotoKey(kind, q)) ? `<div class="aside-ph">${photo(charterPhotoKey(kind, q), { w:640, sizes:"(max-width:900px) 100vw, 360px", eager:true, deco:true })}</div>` : ""}<span class="lbl">${esc(t("estimate"))}</span>
      ${e ? `<div class="est"><span class="est-range"><span ${countAttr(kind + "-lo", e.low)}>${fmt(e.low)}</span> – <span ${countAttr(kind + "-hi", e.high)}>${fmt(e.high)}</span></span>
          <div class="rows">
            <div><span class="k">${esc(t("route"))}</span><span class="v">${isJet ? `${q.from} → ${q.to}` : esc(heliName(q.to))}</span></div>
            ${e.km ? `<div><span class="k">${esc(t("distance"))}</span><span class="v mono">${grp(e.km)} ${esc(t("km"))}</span></div>` : ""}
            <div><span class="k">${esc(t("flight_time"))}</span><span class="v">${esc(hoursText(e.hours))}</span></div>
            <div><span class="k">${esc(t(isJet ? "aircraft" : "heli_type"))}</span><span class="v">${esc(e.cls.model)}</span></div>
            <div><span class="k">${esc(t("passengers"))}</span><span class="v">${q.pax}</span></div></div></div>
          <p class="small muted">${esc(t("estimate_note"))}</p>
          <button type="button" class="cta" data-act="csend" data-v="${kind}">${esc(t("send_request"))}</button>`
        : `<div class="err">${esc(t("no_aircraft"))}</div>`}
    </aside></div></div>`;
}
PAGES["charter/jet"]  = { render: () => charterPage("jet") };
PAGES["charter/heli"] = { render: () => charterPage("heli") };

function sendCharterRequest(kind){
  const q = M[kind], isJet = kind === "jet", e = isJet ? jetEstimate(q) : heliEstimate(q);
  hideErr("#cherr");
  const phone = q.phone || S.user?.phone || "";
  if (isJet && q.from === q.to) return showErr("#cherr", t("err_same_city"));
  if (q.date < TODAY) return showErr("#cherr", t("err_date_past"));
  if (!e) return showErr("#cherr", t("no_aircraft"));
  if (q.name.trim().length < 2) return showErr("#cherr", t("err_your_name"));
  if (!validPhone(phone)) return showErr("#cherr", t("err_contact"));
  const title = isJet ? `${cityName(q.from)} → ${cityName(q.to)}` : heliName(q.to);
  createOrder({
    type: isJet ? "JET" : "HELI", status: "NEW",
    title, sub: `${fdateY(q.date)}, ${q.time} · ${pl(q.pax, "pax")} · ${e.cls.model}`,
    start: q.date, end: q.date,
    ref: makeRef(kind + q.date + q.time + Date.now()),
    total: null, lines: null,
    travellers: [{ given: q.name.trim(), surname: "" }],
    contact: { phone: prettyPhone(phone), email: "" },
    details: { kind, from: isJet ? q.from : "TAS", to: q.to, date: q.date, time: q.time, pax: q.pax, trip: q.trip,
      cls: e.cls.id, model: e.cls.model, hours: e.hours, km: e.km, low: e.low, high: e.high, quote: e.final, note: q.note.trim() }
  }, id => { q.note = ""; go(`orders/${id}`); });
}
function charterVoucherBody(o){
  const d = o.details, isJet = d.kind === "jet";
  return `<div class="vgrid">
    <div class="wide"><span class="lbl">${esc(t("route"))}</span><b>${isJet ? `${esc(cityName(d.from))} (${d.from}) → ${esc(cityName(d.to))} (${d.to})` : `${esc(t("heli_base"))} → ${esc(heliName(d.to))}`}</b></div>
    <div><span class="lbl">${esc(t("date"))}</span><b>${esc(fdateY(d.date))}</b></div>
    <div><span class="lbl">${esc(t("time"))}</span><b class="mono">${d.time}</b></div>
    <div><span class="lbl">${esc(t(isJet ? "aircraft" : "heli_type"))}</span><b>${esc(d.model)}</b></div>
    <div><span class="lbl">${esc(t("passengers"))}</span><b>${d.pax}</b></div>
    <div><span class="lbl">${esc(t("flight_time"))}</span><b>${esc(hoursText(d.hours))}</b></div>
    <div><span class="lbl">${esc(t("trip_kind"))}</span><b>${esc(t(d.trip === "roundtrip" ? (isJet ? "roundtrip" : "heli_rt") : "oneway"))}</b></div>
    <div class="wide"><span class="lbl">${esc(t("customer"))}</span><b>${esc(o.travellers[0].given)} · ${esc(o.contact.phone)}</b></div>
    ${d.note ? `<div class="wide"><span class="lbl">${esc(t("wishes"))}</span><span>${esc(d.note)}</span></div>` : ""}
  </div>`;
}
