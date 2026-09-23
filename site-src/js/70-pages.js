/* ==========================================================================
   Страницы: главная, заказы, карточка заказа, успех, вход, профиль. Навигация.
   ========================================================================== */
"use strict";

/* ------------------------------------------------------------------ главная */
function destPrices(c){
  const d = addDays(TODAY, 14);
  const fl = generateOffers({ from:"TAS", to:c, date:d, cabin:"economy" })[0];
  const q = { to:c, depart:d, nights:7, adults:2, children:0 };
  const tour = HOTELS.filter(h => h.city === c).map(h => tourPackage(h, q).perPerson).sort((a, b) => a.usd - b.usd)[0];
  return { flight:{ usd:fl.priceUSD, uzs:fl.priceUZS }, tour };
}
function destCard(c, i){
  const p = destPrices(c);
  return `<article class="dest lift">${postcard(c, countryName(c))}
    <div class="dest-b">
      <button type="button" class="dest-row" data-act="dflights" data-v="${c}"><span>${IC.flights}${esc(t("mod_flights"))}</span><b>${priceFrom(fmt(p.flight))}</b></button>
      <button type="button" class="dest-row" data-act="tgo" data-v="${c}"><span>${IC.tours}${esc(t("mod_tours"))} · ${esc(pl(7, "night"))}</span><b>${priceFrom(fmt(p.tour))}</b></button>
    </div></article>`;
}
PAGES[""] = {
  render(){
    const mod = MODULES[M.module], swapped = M.ui.lastModule && M.ui.lastModule !== M.module;
    M.ui.lastModule = M.module;
    return `<section class="hero"><div class="hero-map" id="mapdock" aria-hidden="true"></div><div class="hero-scrim" aria-hidden="true"></div><div class="container">
        <div class="hero-grid">
          <div class="hero-copy ${swapped && !REDUCED ? "swap-in" : ""}">
            <h1 class="hero-h">${esc(t("hero_" + M.module))}</h1>
            <p class="hero-sub">${esc(t("hero_" + M.module + "_sub"))}</p></div>
          <div class="hero-frame" id="mapframe" role="img" aria-label="${esc(mapAria())}">${GL.state === "failed" ? routeSvg() : ""}</div>
          <p class="map-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></p>
        </div>
        <div class="searchbox"><div class="searchbox-core">
          <div class="modtabs" role="tablist" data-ind="modtabs" data-ind-line><span class="ind" aria-hidden="true"></span>${MODULE_ORDER.map(k => `<button type="button" role="tab" class="modtab" data-act="mod" data-v="${k}" aria-selected="${M.module === k}">${MODULES[k].icon}<span>${esc(t(MODULES[k].label))}</span></button>`).join("")}</div>
          <div class="${swapped && !REDUCED ? "swap-in" : ""}">${mod.form()}</div>
        </div></div></div></section>
      ${departureBoard()}
      <section class="container section">
        <div class="sec-h"><h2>${esc(t("popular_dest"))}</h2><p class="muted">${esc(t("popular_dest_sub"))}</p></div>
        <div class="destgrid">${RESORTS.map(destCard).join("")}</div></section>
      <section class="band"><div class="container section">
        <div class="sec-h"><h2>${esc(t("all_services"))}</h2><p class="muted">${esc(t("all_services_sub"))}</p></div>
        <div class="svcgrid">${MODULE_ORDER.map(k => `<button type="button" class="svc lift" data-act="mod" data-v="${k}">
          <span class="svc-ic">${MODULES[k].icon}</span><b>${esc(t(MODULES[k].label))}</b><span class="muted small">${esc(t("svc_" + k))}</span></button>`).join("")}</div></div></section>
      <section class="container section">
        <div class="sec-h"><h2>${esc(t("how_title"))}</h2></div>
        <ol class="how">${[1,2,3].map(i => `<li><span class="how-n mono">0${i}</span><h3>${esc(t("how_" + i))}</h3><p class="muted">${esc(t("how_" + i + "_d"))}</p></li>`).join("")}</ol></section>
      <section class="container section"><div class="trust">${[["shield","trust_1"],["globe","trust_2"],["clock","trust_3"]].map(([ic, k]) =>
        `<div>${IC[ic]}<div><b>${esc(t(k))}</b><p class="muted small">${esc(t(k + "_d"))}</p></div></div>`).join("")}</div></section>`;
  },
  after(){ centerActive($(".modtab[aria-selected=\"true\"]")); armBoard(); dockMap(); }
};
Object.assign(ACT, {
  mod: el => {
    M.module = el.dataset.v;
    if (currentParts().length) go(""); else { rerender(); window.scrollTo({ top:0, behavior:"smooth" }); }
  },
  dflights: el => { Object.assign(M.flights, { from:"TAS", to:el.dataset.v }); M.module = "flights"; ACT.fsearch(); }
});

/* ------------------------------------------------------------------- заказы */
const ORDER_TYPES = ["ALL","FLIGHT","TOUR","HOTEL","JET","HELI"];
const TYPE_ICON = { FLIGHT:IC.flights, TOUR:IC.tours, HOTEL:IC.hotels, JET:IC.jet, HELI:IC.heli };
function orderCard(o, i, rc = ""){
  const st = effStatus(o);
  const price = o.total ? fmt(o.total) : `≈ ${fmt(o.details.low)} – ${fmt(o.details.high)}`;
  return `<a class="ocard lift ${rc} ${st === "COMPLETED" ? "past" : ""}" style="--i:${i}" href="#/orders/${o.id}" data-flip="${o.id}">
    ${hasPhoto(orderPhotoKey(o)) ? `<span class="oc-ic has-ph">${photo(orderPhotoKey(o), { w:140, sizes:"64px", deco:true })}<i>${TYPE_ICON[o.type]}</i></span>` : `<span class="oc-ic">${TYPE_ICON[o.type]}</span>`}
    <span class="oc-main"><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(orderSub(o))}</span><span class="mono small muted">${o.no}</span></span>
    <span class="oc-side">${pill(st)}<b class="mono">${price}</b></span></a>`;
}
PAGES.orders = {
  render(){
    const f = M.ui.ofilter || "ALL";
    const list = S.orders.filter(o => f === "ALL" || o.type === f);
    const live = o => o.start >= TODAY && !["CANCELLED","REFUNDED"].includes(o.status);
    const up = list.filter(live).sort((a, b) => a.start.localeCompare(b.start));
    const past = list.filter(o => !live(o)).sort((a, b) => b.start.localeCompare(a.start)), rc = listEnter("orders");
    const chips = `<div class="chipbar">${ORDER_TYPES.map(k => `<button type="button" class="chip" data-act="ofilter" data-v="${k}" aria-pressed="${f === k}">${esc(t(k === "ALL" ? "all" : "type_" + k))}</button>`).join("")}</div>`;
    return `<div class="container section">${pageHead(t("my_orders"), t("orders_sub"))}${chips}
      ${!list.length ? `<div class="card empty"><svg class="empty-art" viewBox="0 0 170 100" aria-hidden="true"><path d="M10 88 Q85 -8 160 88" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="2" stroke-dasharray="5 6"/><g class="empty-plane" transform="translate(73 12)"><g transform="rotate(45 12 12)"><path d="${PLANE_PATH}" fill="var(--blue)"/></g></g></svg><h3>${esc(t("orders_empty"))}</h3><p class="muted">${esc(t("orders_empty_d"))}</p><a class="solid" href="#/">${esc(t("trips_start"))}</a></div>` : ""}
      ${up.length ? `<h2 class="subh">${esc(t("upcoming"))}</h2><div class="stack">${up.map((o, i) => orderCard(o, i, rc)).join("")}</div>` : ""}
      ${past.length ? `<h2 class="subh">${esc(t("past_trips"))}</h2><div class="stack">${past.map((o, i) => orderCard(o, i + up.length, rc)).join("")}</div>` : ""}</div>`;
  }
};
const REQ_KINDS = ["change_date","change_passenger","cancel","other"];
PAGES["orders/:id"] = {
  render({ id }){
    const o = S.orders.find(x => x.id === id);
    if (!o) return `<div class="container section">${backLink("orders", t("my_orders"))}<div class="card empty"><h3>${esc(t("order_missing"))}</h3></div></div>`;
    const st = effStatus(o), charter = o.type === "JET" || o.type === "HELI";
    let main;
    if (charter && st === "NEW") main = `<div class="card stack waitcard"><span class="radar" aria-hidden="true"><i></i><i></i>${TYPE_ICON[o.type]}</span><h3>${esc(t("mgr_title"))}</h3>
        <p class="muted">${esc(t("mgr_body"))}</p><p class="small">${esc(t("estimate"))}: <b class="mono">${fmt(o.details.low)} – ${fmt(o.details.high)}</b></p></div>`;
    else if (charter && st === "PENDING") main = `<div class="card stack"><h3>${esc(t("price_ready"))}</h3><p class="muted">${esc(t("price_ready_d"))}</p>
        ${checkLines(orderLines(o), o.total)}<h3 style="margin-top:6px">${esc(t("pay_method"))}</h3>${payMethods("opm", M.ui.opm || "payme")}
        <button type="button" class="cta" data-act="opay" data-v="${o.id}">${esc(t("pay_now"))} · ${fmt(o.total)}</button>
        <p class="demo-note">${esc(t("pay_demo_note"))}</p></div>`;
    else if (charter && st === "PAID") main = `<div class="card stack waitcard"><span class="radar" aria-hidden="true"><i></i><i></i>${IC.shield}</span><h3>${esc(t("confirming_title"))}</h3><p class="muted">${esc(t("confirming_body"))}</p></div>`;
    else main = orderDocument(o);

    let req = "";
    if (o.req) req = `<div class="reqbanner"><div class="rb-h"><b>${esc(t("req_title"))}: ${esc(t("req_kind_" + o.req.kind))}</b>${`<span class="pill st-PENDING">${esc(t("req_status_new"))}</span>`}</div>
        ${o.req.note ? `<span class="muted">«${esc(o.req.note)}»</span>` : ""}<span class="small muted">${esc(t("req_local_note"))}</span></div>`;
    else if (st === "CONFIRMED" && o.start >= TODAY) req = M.ui.reqFor === o.id
      ? `<div class="card stack"><h3>${esc(t("request_change"))}</h3><span class="lbl">${esc(t("req_kind_label"))}</span>
          ${seg("oreqkind", REQ_KINDS.map(k => [k, t("req_kind_" + k)]), M.ui.reqKind || "change_date")}
          <label class="field"><span>${esc(t("req_note"))}</span><textarea data-bind="ui.reqNote" placeholder="${esc(t("req_note_ph"))}">${esc(M.ui.reqNote || "")}</textarea></label>
          <div class="row"><button type="button" class="solid" data-act="oreqsend" data-v="${o.id}">${esc(t("req_submit"))}</button>
          <button type="button" class="link" data-act="oreq" data-v="">${esc(t("cancel"))}</button></div></div>`
      : `<button type="button" class="ghost" data-act="oreq" data-v="${o.id}">${esc(t("request_change"))}</button>`;

    return `<div class="container section">${backLink("orders", t("my_orders"))}
      <div class="ohead"><span class="oc-ic">${TYPE_ICON[o.type]}</span><div><span class="lbl">${esc(t("doc_" + o.type))} · <span class="mono">${o.no}</span></span>
        <h1>${esc(orderTitle(o))}</h1><p class="muted">${esc(orderSub(o))}</p></div>${pill(st)}</div>
      <div class="twocol"><div class="stack">${main}${req}</div>
        <aside class="card sticky stack">
          ${o.total ? `<span class="lbl">${esc(t("payment"))}</span>${checkLines(orderLines(o), o.total)}` : `<span class="lbl">${esc(t("estimate"))}</span><b class="mono">${fmt(o.details.low)} – ${fmt(o.details.high)}</b>`}
          ${o.method ? `<div class="rows"><div><span class="k">${esc(t("pay_method"))}</span><span class="v">${esc(methodName(o.method))}</span></div></div>` : ""}
          <div class="rows"><div><span class="k">${esc(t("contact_phone"))}</span><span class="v mono">${esc(o.contact.phone)}</span></div>
            ${o.contact.email ? `<div><span class="k">Email</span><span class="v">${esc(o.contact.email)}</span></div>` : ""}</div>
          <span class="lbl">${esc(t("history"))}</span>
          <ol class="timeline">${o.history.map(h => `<li><span class="tl-dot st-${h.s}"></span><b>${esc(t("st_" + h.s))}</b><span class="muted small">${esc(fdt(h.at))}</span></li>`).join("")}</ol>
        </aside></div></div>`;
  },
  after(){ renderQRs(); }
};
Object.assign(ACT, {
  ofilter:  el => { M.ui.ofilter = el.dataset.v; flip(rerender); },
  opm:      el => { M.ui.opm = el.dataset.v; rerender(); },
  opay:     el => {
    const o = S.orders.find(x => x.id === el.dataset.v); if (!o || o.status !== "PENDING") return;
    overlay(t("processing"));
    setTimeout(() => { overlay(""); Object.assign(o, { status:"PAID", paidAt:Date.now(), method:M.ui.opm || "payme" }); hist(o, "PAID"); save(); rerender(); }, 1400);
  },
  oreq:     el => { M.ui.reqFor = el.dataset.v || null; M.ui.reqKind = "change_date"; M.ui.reqNote = ""; rerender(); },
  oreqkind: el => { M.ui.reqKind = el.dataset.v; rerender(); },
  oreqsend: el => {
    const o = S.orders.find(x => x.id === el.dataset.v); if (!o) return;
    o.req = { kind:M.ui.reqKind || "change_date", note:(M.ui.reqNote || "").trim(), at:Date.now() };
    M.ui.reqFor = null; save(); rerender(); toast(t("req_status_new"));
  }
});

/* ---------------------------------------------------------------- успех */
PAGES["done/:id"] = {
  render({ id }){
    const o = S.orders.find(x => x.id === id); if (!o) { go("orders"); return null; }
    const to = o.contact.email || o.contact.phone;
    return `<div class="container section"><div class="card success">
      <svg class="checkmark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45"/><path d="M30 52l13 13 27-29"/></svg>
      <h1>${esc(t("booking_confirmed"))}</h1><p class="muted">${esc(tf("doc_sent", { to }))}</p>
      <div class="slot" aria-hidden="true"></div>
      <div class="stub print">
        <div class="stub-l"><span class="lbl">${esc(t("doc_" + o.type))}</span><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(orderSub(o))}</span>
          <span class="lbl" style="margin-top:8px">${esc(t("booking_ref"))}</span><span class="ref">${o.no}</span></div>
        <div class="qr" data-qr="https://charteri.uz/v/${o.no}"></div></div>
      <div class="row center"><a class="cta" style="max-width:280px" href="#/orders/${o.id}">${esc(t(o.type === "FLIGHT" ? "view_ticket" : "view_voucher"))}</a>
        <a class="ghost" style="max-width:220px" href="#/">${esc(t("home"))}</a></div></div></div>`;
  },
  after(){ renderQRs(); }
};

/* ----------------------------------------------------------------- вход */
PAGES.login = {
  render(){
    const step = M.ui.loginStep || "phone";
    return `<div class="container section narrow"><div class="card stack authcard">
      <span class="wordmark dark">CHARTERI<b>.UZ</b></span>
      ${step === "phone" ? `<h1>${esc(t("login_title"))}</h1><p class="muted">${esc(t("login_sub"))}</p>
        <label class="field"><span>${esc(t("phone_label"))}</span><input id="lph" type="tel" inputmode="tel" autocomplete="tel" value="${esc(M.ui.loginPhone || "+998 90 123 45 67")}"></label>
        <div class="err" id="lerr" hidden></div>
        <button type="button" class="cta" data-act="lsend">${esc(t("login_cta"))}</button>`
      : `<h1>${esc(t("otp_title"))}</h1><p class="muted">${esc(t("otp_sub"))} <b class="mono">${esc(M.ui.loginPhone)}</b></p>
        <input id="lotp" class="otp" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••" aria-label="${esc(t("otp_title"))}">
        <p class="small muted center">${esc(t("otp_hint"))}</p><div class="err" id="lerr" hidden></div>
        <button type="button" class="cta" data-act="lverify">${esc(t("otp_cta"))}</button>
        <button type="button" class="link" data-act="lback">${esc(t("change_number"))}</button>`}
      <p class="demo-note">${esc(t("demo_banner"))}</p></div></div>`;
  },
  after(){ $("#lotp")?.focus(); }
};
function doVerify(){
  const v = ($("#lotp")?.value || "").trim();
  if (!/^\d{4}$/.test(v)) return showErr("#lerr", t("err_code"));
  S.user = { phone:M.ui.loginPhone }; save(); M.ui.loginStep = "phone";
  toast(t("signed_in")); go(M.returnTo || "orders"); M.returnTo = null;
}
Object.assign(ACT, {
  lsend:   () => { const v = $("#lph").value; if (!validPhone(v)) return showErr("#lerr", t("err_phone")); M.ui.loginPhone = prettyPhone(v); M.ui.loginStep = "code"; rerender(); },
  lverify: () => doVerify(),
  lback:   () => { M.ui.loginStep = "phone"; rerender(); }
});
document.addEventListener("input", e => { if (e.target.id === "lotp") { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); if (e.target.value.length === 4) doVerify(); } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lph") ACT.lsend(); });

/* --------------------------------------------------------------- профиль */
PAGES.account = {
  render(){
    const who = S.user ? `<div class="card who"><span class="avatar">${IC.user}</span><div><b class="mono">${esc(S.user.phone)}</b>
        <span class="muted small">${esc(tf("orders_count", { n:S.orders.length }))}</span></div>
        <button type="button" class="link danger" data-act="signout">${esc(t("sign_out"))}</button></div>`
      : `<div class="card who"><span class="avatar">${IC.user}</span><div><b>${esc(t("profile_guest"))}</b><span class="muted small">${esc(t("guest_note"))}</span></div>
        <a class="solid" style="max-width:160px" href="#/login">${esc(t("sign_in"))}</a></div>`;
    return `<div class="container section narrow">${pageHead(t("tab_profile"))}<div class="stack">${who}
      <div class="card stack"><h3>${esc(t("settings"))}</h3>
        <div class="setrow"><span>${esc(t("language"))}</span>${seg("setlang", [["uz","O‘zbekcha"],["ru","Русский"],["en","English"]], S.lang)}</div>
        <div class="setrow"><span>${esc(t("currency"))}</span>${seg("setcur", [["UZS","UZS"],["USD","USD"]], S.cur)}</div>
        <div class="setrow"><span>${esc(t("appearance"))}</span>${seg("settheme", [["system", t("theme_system")],["light", t("theme_light")],["dark", t("theme_dark")]], S.theme)}</div></div>
      <div class="card stack"><h3>${esc(t("saved_travellers"))}</h3>
        ${S.travellers.length ? S.travellers.map(x => `<div class="trow"><b>${esc(x.given)} ${esc(x.surname)}</b>
          <span class="mono small muted">${esc(x.passport.slice(0,2))}•••${esc(x.passport.slice(-3))}</span>
          <button type="button" class="link danger" data-act="deltr" data-v="${x.id}">${esc(t("remove"))}</button></div>`).join("")
          : `<p class="muted">${esc(t("travellers_empty_body"))}</p>`}</div>
      <button type="button" class="ghost" data-act="reset">${esc(t("reset_demo"))}</button></div></div>`;
  }
};
Object.assign(ACT, {
  setlang:  el => { S.lang = el.dataset.v; save(); rerender(); },
  setcur:   el => { S.cur = el.dataset.v; save(); rerender(); },
  settheme: el => { S.theme = el.dataset.v; save(); withTransition(rerender, "theme"); },
  signout:  () => { S.user = null; save(); toast(t("signed_out")); go(""); },
  deltr:    el => { if (!confirm(t("delete_traveller_title"))) return; S.travellers = S.travellers.filter(x => x.id !== el.dataset.v); save(); rerender(); },
  reset:    () => { if (!confirm(t("reset_confirm"))) return; S = freshState(); save(); go(""); }
});
document.addEventListener("change", e => { if (e.target.id === "langSel") { S.lang = e.target.value; save(); rerender(); } });

/* ---------------------------------------------------------------- навигация */
/* Полоса вкладок прокручивается вбок на узком экране, а перерисовка сбрасывает
   прокрутку — возвращаем выбранную вкладку в середину полосы. Только по
   горизонтали: scrollIntoView прокрутил бы и саму страницу. */
function centerActive(el){
  const strip = el?.parentElement; if (!strip || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollLeft = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
}
function renderNav(key){
  const active = key === "" ? M.module : key.startsWith("charter/") ? key.split("/")[1] : key.split("/")[0];
  const live = S.orders.filter(o => o.start >= TODAY && !["CANCELLED","REFUNDED"].includes(o.status)).length;
  $("#nav").innerHTML = `<div class="container nav-in">
    <a class="logo" href="#/" aria-label="Charteri"><span class="wordmark dark">CHARTERI<b>.UZ</b></span></a>
    <nav class="navmods" aria-label="${esc(t("all_services"))}">${MODULE_ORDER.map(k => `<button type="button" data-act="mod" data-v="${k}" aria-current="${active === k}">${esc(t(MODULES[k].label))}</button>`).join("")}</nav>
    <div class="navright">
      <select id="langSel" class="minisel" aria-label="${esc(t("language"))}">${[["uz","O‘z"],["ru","Рус"],["en","Eng"]].map(([k, l]) => `<option value="${k}" ${S.lang === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="cursw">${seg("setcur", [["UZS","UZS"],["USD","USD"]], S.cur)}</div>
      <a class="navlink" href="#/orders" aria-current="${key.startsWith("orders")}">${IC.bag}<span>${esc(t("my_orders"))}</span>${live ? `<i class="badge">${live}</i>` : ""}</a>
      <a class="navlink" href="#/${S.user ? "account" : "login"}" aria-current="${key === "account" || key === "login"}">${IC.user}<span>${esc(S.user ? t("tab_profile") : t("sign_in"))}</span></a>
    </div></div>`;
  centerActive($('.navmods [aria-current="true"]'));
  $("#footer").innerHTML = `<div class="container foot-in">
    <div class="stack" style="gap:8px"><span class="wordmark">CHARTERI<b>.UZ</b></span><p class="small">${esc(t("tagline"))}</p></div>
    <div class="stack" style="gap:6px"><b>${esc(t("all_services"))}</b>${MODULE_ORDER.map(k => `<button type="button" class="footlink" data-act="mod" data-v="${k}">${esc(t(MODULES[k].label))}</button>`).join("")}</div>
    <div class="stack" style="gap:6px"><b>${esc(t("we_accept"))}</b><div class="paychips">${PAY_METHODS.map(m => `<span>${m[1]}</span>`).join("")}</div></div>
    <p class="foot-note small">${esc(t("demo_footer"))}<br>${esc(t("credits"))}</p></div>`;
}
