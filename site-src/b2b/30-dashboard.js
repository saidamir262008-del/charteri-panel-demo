/* ==========================================================================
   Обзор: поездки клиентов на живой карте, баланс, что ждёт решения агента.
   Карта — та же, что в герое сайта: здесь она показывает маршрут выбранной
   поездки клиента, а не форму поиска.
   ========================================================================== */
"use strict";

/* Откуда и куда летит клиент — для карты и выбора поездки кликом по городу. */
function tripRoute(o){
  const d = o.details;
  if (o.type === "HELI")   return { local:true, from:"TAS", to:d.to };
  if (o.type === "FLIGHT") return { local:false, from:d.out.from, to:d.out.to };
  if (o.type === "JET")    return { local:false, from:d.from, to:d.to };
  if (o.type === "TOUR")   return { local:false, from:"TAS", to:d.to };
  return { local:false, from:"TAS", to:hotelById(d.hotelId).city };
}
const selectedTrip = () => { const trips = upcomingTrips(); return trips.find(o => o.id === M.ui.trip) || trips[0] || null; };

/* Карта сайта берёт маршрут из формы поиска — в кабинете из выбранной поездки. */
function mapState(){
  const o = selectedTrip();
  return o ? tripRoute(o) : { local:false, from:"TAS", to:"IST" };
}
function glPick(id){
  const o = upcomingTrips().find(x => tripRoute(x).to === id);
  if (o) { M.ui.trip = o.id; rerender(); }
}

const greeting = () => { const h = new Date().getHours(); return t(h < 5 ? "greet_evening" : h < 12 ? "greet_morning" : h < 18 ? "greet_day" : "greet_evening"); };
const sumUZS = (list, f) => list.reduce((s, o) => s + (f(o) || 0), 0);

function tripMap(trips, sel){
  const list = trips.slice(0, 5);
  return `<section class="tripmap" aria-labelledby="tm-h">
    <div class="tm-dock" id="mapdock" aria-hidden="true"></div><div class="tm-scrim" aria-hidden="true"></div>
    <div class="tm-list">
      <div class="tm-h"><h2 id="tm-h">${esc(t("trips_title"))}</h2><span>${esc(tf("trips_count", { n:trips.length }))}</span></div>
      ${list.length ? `<ul>${list.map((o, i) => `<li><button type="button" class="tm-row" data-act="trip" data-v="${o.id}" aria-pressed="${o.id === sel.id}" style="--i:${i}">
          <span class="tm-ic">${TYPE_ICON[o.type]}</span>
          <span class="tm-main"><b>${esc(orderTitle(o))}</b><span>${esc(clientOf(o))}</span></span>
          <span class="tm-date mono">${esc(fdate(o.start))}</span></button></li>`).join("")}</ul>
          ${trips.length > list.length ? `<a class="tm-more" href="#/orders">${esc(tf("trips_more", { n:trips.length - list.length }))}</a>` : ""}`
        : `<div class="tm-empty"><p>${esc(t("trips_empty"))}</p><a class="solid sm" href="#/book">${esc(t("new_booking"))}</a></div>`}
    </div>
    <div class="tm-frame" id="mapframe" role="img" aria-label="${esc(mapAria())}">${GL.state === "failed" ? routeSvg() : ""}</div>
    <p class="tm-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></p>
  </section>`;
}

function balanceCard(){
  const month = TODAY.slice(0, 7), paidThisMonth = S.orders.filter(o => o.paidAt && ymd(new Date(o.paidAt)).startsWith(month) && o.total);
  const waiting = S.topups.filter(p => p.status === "pending"), waitSum = waiting.reduce((s, p) => s + p.amount, 0);
  const low = S.balance < 5_000_000;
  return `<aside class="balcard ${low ? "is-low" : ""}">
    <span class="lbl">${esc(t("balance_now"))}</span>
    <b class="bal-big mono">${grp(S.balance)}<small>${esc(t("cur_uzs"))}</small></b>
    ${waitSum ? `<p class="bal-wait">${IC.clock}<span>${esc(tf("topup_waiting", { amount:fmtUZS(waitSum) }))}</span></p>` : ""}
    ${low ? `<p class="bal-wait warn">${esc(t("balance_low"))}</p>` : ""}
    <div class="row"><a class="solid" href="#/balance?topup">${IC.plus}<span>${esc(t("topup"))}</span></a><a class="ghost sm" href="#/balance">${esc(t("statement"))}</a></div>
    <dl class="bal-stats">
      <div><dt>${esc(t("sales_month"))}</dt><dd class="mono">${fmtUZS(sumUZS(paidThisMonth, o => dueOf(o).uzs))}</dd></div>
      <div><dt>${esc(t("fee_month"))}</dt><dd class="mono">${fmtUZS(sumUZS(paidThisMonth, o => o.fee?.uzs))}</dd></div>
      <div><dt>${esc(t("active_orders"))}</dt><dd class="mono">${upcomingTrips().length}</dd></div>
    </dl></aside>`;
}

/* Что ждёт решения агента: оплатить готовую цену, дождаться оператора, кассы. */
function attention(){
  const items = [
    ...S.orders.filter(o => o.status === "PENDING").map(o => `<a class="att-row" href="#/orders/${o.id}"><span class="att-ic warn">${TYPE_ICON[o.type]}</span>
      <span class="att-main"><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(tf("att_pay", { client:clientOf(o) }))}</span></span>
      <span class="att-go"><b class="mono">${fmt(dueOf(o))}</b><span class="solid sm">${esc(t("pay_short"))}</span></span></a>`),
    ...S.orders.filter(o => o.status === "NEW").map(o => `<a class="att-row" href="#/orders/${o.id}"><span class="att-ic"><span class="spin"></span></span>
      <span class="att-main"><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(t("att_quote"))}</span></span>
      <span class="att-go muted small">${esc(fdt(o.createdAt))}</span></a>`),
    ...S.orders.filter(o => o.status === "CANCELLED" && o.refund && !o.refund.done).map(o => `<a class="att-row" href="#/orders/${o.id}"><span class="att-ic"><span class="spin"></span></span>
      <span class="att-main"><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(t("att_refund"))}</span></span>
      <span class="att-go mono">${fmtUZS(o.refund.uzs)}</span></a>`),
    ...S.topups.filter(p => p.status === "pending").map(p => `<a class="att-row" href="#/balance"><span class="att-ic">${IC.wallet}</span>
      <span class="att-main"><b>${esc(tf("att_topup", { amount:fmtUZS(p.amount) }))}</b><span class="muted small">${esc(t("topup_m_" + p.method))} · ${esc(t("topup_wait_" + p.method))}</span></span>
      <span class="att-go"><span class="spin"></span></span></a>`)
  ];
  return `<section class="card stack"><div class="card-h"><h2>${esc(t("attention"))}</h2>${items.length ? `<span class="count">${items.length}</span>` : ""}</div>
    ${items.length ? `<div class="att">${items.join("")}</div>` : `<p class="calm">${IC.ok}<span>${esc(t("attention_none"))}</span></p>`}</section>`;
}

function feed(){
  const list = S.notes.slice(0, 6);
  return `<section class="card stack"><div class="card-h"><h2>${esc(t("events"))}</h2></div>
    ${list.length ? `<ol class="feed">${list.map(n => `<li class="${n.read ? "" : "unread"}"><span class="feed-dot"></span>
      <span class="stack" style="gap:2px"><span>${esc(noteText(n))}</span><span class="muted small">${esc(fdt(n.at))}</span></span></li>`).join("")}</ol>`
      : `<p class="muted">${esc(t("notes_empty"))}</p>`}</section>`;
}

PAGES[""] = {
  render(){
    const trips = upcomingTrips(), sel = selectedTrip();
    if (sel) M.ui.trip = sel.id;
    const recent = S.orders.slice(0, 5), rc = listEnter("dash");
    return `<div class="page">
      <div class="dash-head">
        <div class="stack" style="gap:4px"><h1>${esc(greeting())}, ${esc(S.agency.name)}</h1><p class="muted">${esc(fdateLong(TODAY))}</p></div>
        <nav class="quick" aria-label="${esc(t("new_booking"))}">${MODULE_ORDER.map(k => `<a class="qbtn" href="#/book/${k}">${MODULES[k].icon}<span>${esc(t(MODULES[k].label))}</span></a>`).join("")}</nav>
      </div>
      <div class="dash-top">${tripMap(trips, sel)}${balanceCard()}</div>
      <div class="dash-grid">${attention()}${feed()}</div>
      <section class="card stack"><div class="card-h"><h2>${esc(t("recent_orders"))}</h2><a class="link" href="#/orders">${esc(t("all_orders"))}</a></div>
        <div class="otable">${recent.map((o, i) => orderRow(o, i, rc)).join("")}</div></section>
    </div>`;
  },
  after(){ dockMap(); }
};
ACT.trip = el => { M.ui.trip = el.dataset.v; rerender(); };
