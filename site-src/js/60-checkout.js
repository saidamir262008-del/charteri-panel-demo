/* ==========================================================================
   Общее для всех модулей: оформление, оплата, заказы, документы.
   Заказ повторяет таблицу orders из спецификации: тип, статус, сумма, детали,
   история статусов (order_events). Строки чека не хранятся — они
   пересчитываются из деталей, поэтому переключение языка меняет и их.
   ========================================================================== */
"use strict";

const PAY_METHODS = [["payme","Payme","#33CCCC"],["click","Click","#0088FF"],["uzum","Uzum","#7C3AED"],["humo","Uzcard / Humo","#12996A"],["card","Visa / Mastercard","#2F6FE0"]];
const methodName = k => PAY_METHODS.find(m => m[0] === k)?.[1] ?? k;
const CITS = ["UZB","KAZ","KGZ","TJK","TKM","RUS","TUR"];
const blankTraveller = type => ({ type, surname:"", given:"", passport:"", gender:"", dob:"", expiry:"", cit:"UZB", save:false, fromId:null });

function checkLines(lines, total, countKey){
  return `<div class="rows">${lines.map(([l, a]) => `<div><span class="k">${esc(l)}</span><span class="v mono ${a && a.usd < 0 ? "neg" : ""}">${
      a == null ? esc(t("included")) : a.usd < 0 ? "−" + fmt({ usd:-a.usd, uzs:-a.uzs }) : fmt(a)}</span></div>`).join("")}
    <div class="tot"><span class="k">${esc(t("total"))}</span><span class="v" ${countKey ? countAttr(countKey, total) : ""}>${fmt(total)}</span></div></div>`;
}

/* ---------------------------------------------------------------- оформление */
function startCheckout(spec){
  M.checkout = { ...spec, method:"payme", pstate: spec.recheck ? "checking" : "ok", pending:null,
    travellers: spec.travellers.types.map(blankTraveller), mode: spec.travellers.mode,
    contact: { phone: S.user?.phone || "", email: "" } };
  go("checkout");
}
function travellerForm(x, i, mode){
  const full = mode === "full";
  const chips = S.travellers.length ? `<div class="tchips"><span class="lbl">${esc(t("select_traveller"))}</span>${S.travellers.map(tr =>
    `<button type="button" class="tchip" data-act="cfill" data-i="${i}" data-v="${tr.id}" aria-pressed="${x.fromId === tr.id}">${esc(tr.given)} ${esc(tr.surname[0])}.</button>`).join("")}</div>` : "";
  const f = (k, label, extra = "") => `<label class="field"><span>${esc(label)}</span><input data-tv="${i}" data-f="${k}" value="${esc(x[k])}" ${extra}></label>`;
  return `<div class="tform" id="tv${i}">
    <div class="tform-h"><b>${esc(mode === "lead" ? t("lead_guest") : `${t("passenger")} ${i+1}`)}</b><span class="muted small">${esc(t("pax_" + x.type))}</span></div>
    ${chips}
    <div class="sgrid sgrid-2">
      ${f("surname", t("surname"), 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      ${f("given", t("given_name"), 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      ${full ? f("passport", t("passport_no"), 'class="upper mono" autocomplete="off" autocapitalize="characters" spellcheck="false"') : ""}
      ${full ? `<label class="field"><span>${esc(t("citizenship"))}</span><select data-tv="${i}" data-f="cit">${CITS.map(c => `<option ${x.cit === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>` : ""}
      ${full ? `<div class="field"><span>${esc(t("gender"))}</span>${seg("cgender", [["M", t("gender_m")], ["F", t("gender_f")]], x.gender, `data-i="${i}"`)}</div>` : ""}
      ${full ? f("dob", t("dob"), `type="date" max="${TODAY}"`) : ""}
      ${full ? f("expiry", t("expiry"), `type="date" min="${TODAY}"`) : ""}
    </div>
    ${full ? `<label class="chk"><input type="checkbox" data-act="csave" data-i="${i}" ${x.save ? "checked" : ""}><span>${esc(t("save_traveller"))}</span></label>` : ""}
    <div class="err" id="terr${i}" hidden></div></div>`;
}
PAGES.checkout = {
  render(){
    const c = M.checkout; if (!c) { go(SEARCH_PATH); return null; }
    const lines = c.pstate === "changed" ? c.pending.lines : c.lines, total = c.pstate === "changed" ? c.pending.total : c.total;
    let check = "";
    if (c.recheck && c.pstate === "checking") check = `<div class="pcheck wait"><span class="spin"></span>${esc(t("verifying_price"))}</div>`;
    else if (c.pstate === "changed") check = `<div class="changed settle"><h3>${esc(t("price_changed_title"))}</h3><p class="small">${esc(t("price_changed_body"))}</p>
        <div class="rows"><div><span class="k">${esc(t("old_price"))}</span><span class="v mono strike">${fmt(c.total)}</span></div>
          <div><span class="k">${esc(t("new_price"))}</span><span class="v mono">${fmt(c.pending.total)}</span></div></div>
        <button type="button" class="solid" data-act="caccept">${esc(t("accept_new_price"))}</button></div>`;
    else if (c.recheck) check = `<div class="pcheck good">${IC.ok}${esc(t("price_confirmed"))}</div>`;
    return `<div class="container section"><button type="button" class="backlink" data-act="hback">${IC.back}<span>${esc(t("back"))}</span></button>
      ${pageHead(t("checkout_title"), c.title)}
      <div class="twocol"><div class="stack">
        <div class="card stack"><h3>${esc(t(c.mode === "lead" ? "guest_details" : "passenger_details"))}</h3>
          ${c.travellers.map((x, i) => travellerForm(x, i, c.mode)).join('<hr class="sep">')}
          ${c.mode === "full" ? `<p class="secure">${IC.lock}<span>${esc(t("secure_note"))}</span></p>` : ""}</div>
        <div class="card stack"><h3>${esc(t("contact_details"))}</h3><div class="sgrid sgrid-2">
          <label class="field"><span>${esc(t("contact_phone"))}</span><input data-ct="phone" type="tel" value="${esc(c.contact.phone)}" autocomplete="tel" placeholder="+998"></label>
          <label class="field"><span>${esc(t("email_opt"))}</span><input data-ct="email" type="email" value="${esc(c.contact.email)}" autocomplete="email"></label></div>
          <div class="err" id="cerr" hidden></div></div>
        <div class="card stack"><h3>${esc(t("pay_method"))}</h3>${payMethods("cmethod", c.method)}</div>
      </div>
      <aside class="card sticky stack">
        <span class="lbl">${esc(t("doc_" + c.type))}</span><b>${esc(c.title)}</b><span class="muted small">${esc(c.sub)}</span>
        ${checkLines(lines, total, "checkout")}${check}
        <button type="button" class="cta" data-act="cpay" ${c.pstate === "ok" ? "" : "disabled"}>${esc(t("pay_now"))} · ${fmt(total)}</button>
        <p class="demo-note">${esc(t("pay_demo_note"))}</p></aside></div></div>`;
  },
  after(){
    const c = M.checkout; if (!c || c.pstate !== "checking") return;
    setTimeout(() => {
      if (M.checkout !== c || c.pstate !== "checking") return;
      const change = c.priceChange && !c.accepted ? c.priceChange() : null;
      if (change) { c.pending = change; c.pstate = "changed"; } else c.pstate = "ok";
      if (currentParts()[0] === "checkout") rerender();
    }, 1100);
  }
};
const payMethods = (act, val) => `<div class="methods">${PAY_METHODS.map(([k, l, col]) =>
  `<button type="button" class="method" data-act="${act}" data-v="${k}" aria-pressed="${val === k}"><span class="dot" style="background:${col}"></span>${l}<span class="rad"></span></button>`).join("")}</div>`;

function validateCheckout(){
  const c = M.checkout, last = c.end;
  const latin = s => /^[A-Z][A-Z' -]{0,40}$/.test(s);
  for (let i = 0; i < c.travellers.length; i++) {
    const x = c.travellers[i]; hideErr("#terr" + i);
    let e = null;
    if (!latin(x.surname) || !latin(x.given)) e = "err_name";
    else if (c.mode === "full") {
      if (!/^[A-Z0-9]{5,9}$/.test(x.passport)) e = "err_passport";
      else if (!x.gender) e = "err_gender";
      else if (!x.dob || x.dob >= TODAY) e = "err_dob";
      else if (!x.expiry || x.expiry <= last) e = "err_expiry";
    }
    if (e) { showErr("#terr" + i, t(e)); return false; }
  }
  hideErr("#cerr");
  if (!validPhone(c.contact.phone)) { showErr("#cerr", t("err_contact")); return false; }
  if (phoneBlocked(c.contact.phone)) { showErr("#cerr", t("err_blocked")); return false; }
  if (!validEmail(c.contact.email)) { showErr("#cerr", t("err_email")); return false; }
  return true;
}
Object.assign(ACT, {
  hback:   () => history.back(),
  cgender: el => { M.checkout.travellers[Number(el.dataset.i)].gender = el.dataset.v; rerender(); },
  csave:   el => { const x = M.checkout.travellers[Number(el.dataset.i)]; x.save = !x.save; rerender(); },
  cfill:   el => {
    const x = M.checkout.travellers[Number(el.dataset.i)], tr = S.travellers.find(v => v.id === el.dataset.v); if (!tr) return;
    Object.assign(x, { surname:tr.surname, given:tr.given, passport:tr.passport, gender:tr.gender, dob:tr.dob, expiry:tr.expiry, cit:tr.cit, fromId:tr.id, save:false });
    rerender();
  },
  cmethod: el => { M.checkout.method = el.dataset.v; rerender(); },
  caccept: () => { const c = M.checkout; Object.assign(c, { total:c.pending.total, lines:c.pending.lines, details:c.pending.details, accepted:true, pstate:"ok" }); rerender(); },
  cpay:    () => {
    const c = M.checkout; if (c.pstate !== "ok" || !validateCheckout()) return;
    if (!detailsShown(c.details)) { M.checkout = null; toast(t("dir_gone")); return go(SEARCH_PATH); }
    c.travellers.forEach(x => {
      if (!x.save || S.travellers.some(v => v.passport === x.passport)) return;
      S.travellers.push({ id:uid("tr"), surname:x.surname, given:x.given, passport:x.passport, gender:x.gender, dob:x.dob, expiry:x.expiry, cit:x.cit });
    });
    S.travellers = S.travellers.slice(0, 10);
    overlay(t("processing"));
    setTimeout(() => {
      overlay("");
      createOrder({ type:c.type, status:"CONFIRMED", title:c.title, sub:c.sub, start:c.start, end:c.end, ref:c.ref, total:c.total,
        travellers:c.travellers.map(({ type, save, fromId, ...x }) => x), contact:{ ...c.contact, phone:prettyPhone(c.contact.phone) },
        method:c.method, details:c.details }, id => { M.checkout = null; go(`done/${id}`); });
    }, 1400);
  }
});

/* ------------------------------------------------------------------ заказы */
function createOrder(spec, then){
  const now = Date.now();
  const o = { id:uid("o"), no:makeRef(`${spec.ref}:${now}:${Math.random()}`), type:spec.type, status:spec.status, createdAt:now,
    title:spec.title, sub:spec.sub, start:spec.start, end:spec.end, total:spec.total, method:spec.method || null,
    travellers:spec.travellers, contact:spec.contact, details:spec.details, req:null, paidAt:null,
    history: spec.status === "CONFIRMED" ? [{ s:"PAID", at:now }, { s:"CONFIRMED", at:now + 1000 }] : [{ s:"NEW", at:now }] };
  S.orders.unshift(o); save(); then?.(o.id);
  return o;
}
const hist = (o, s) => o.history.push({ s, at:Date.now() });
/* Заголовки заказа собираются из деталей при показе, а не хранятся строкой —
   иначе заказ, оформленный по-русски, остался бы русским в узбекском интерфейсе. */
function orderTitle(o){
  const d = o.details;
  if (o.type === "FLIGHT") return `${cityName(d.out.from)} → ${cityName(d.out.to)}${d.back ? " → " + cityName(d.back.to) : ""}`;
  if (o.type === "TOUR")   return hotelById(d.hotelId) ? `${hotelById(d.hotelId).name} · ${cityName(d.to)}` : o.title || cityName(d.to);
  if (o.type === "HOTEL")  return hotelById(d.hotelId)?.name || o.title || d.hotelId;
  if (o.type === "JET")    return `${cityName(d.from)} → ${cityName(d.to)}`;
  return heliName(d.to);
}
function orderSub(o){
  const d = o.details;
  if (o.type === "FLIGHT") return `${fdateY(d.out.date)}${d.back ? " — " + fdateY(d.back.date) : ""} · ${pl(d.q.adults + d.q.children + d.q.infants, "pax")}`;
  if (o.type === "TOUR")   return `${fdateY(d.depart)} — ${fdateY(addDays(d.depart, d.nights))} · ${pl(d.nights, "night")} · ${pl(d.adults + d.children, "tourist")}`;
  if (o.type === "HOTEL")  return `${cityName(hotelById(d.hotelId)?.city || "")} · ${fdateY(d.checkin)} — ${fdateY(d.checkout)} · ${pl(d.nights, "night")}`;
  return `${fdateY(d.date)}, ${d.time} · ${pl(d.pax, "pax")} · ${d.model}`;
}
function effStatus(o){ return o.status === "CONFIRMED" && o.end < TODAY ? "COMPLETED" : o.status; }
const pill = s => `<span class="pill st-${s}">${esc(t("st_" + s))}</span>`;
function orderLines(o){
  const d = o.details;
  if (o.type === "FLIGHT") return flightLines(d.out, d.back, { ...d.q }).lines;
  // Отеля уже нет в каталоге — одна строка на всю сумму заказа.
  if ((o.type === "TOUR" || o.type === "HOTEL") && !hotelById(d.hotelId)) return [[o.title || t("doc_" + o.type), o.total]];
  if (o.type === "TOUR")  { const q = { to:d.to, depart:d.depart, nights:d.nights, adults:d.adults, children:d.children }; return tourLines(tourPackage(hotelById(d.hotelId), q, { out:d.out, back:d.back }), q); }
  if (o.type === "HOTEL") { const h = hotelById(d.hotelId), r = ROOM_TYPES.find(x => x.id === d.room);
    return [[`${t("room_" + r.id)} × ${pl(d.rooms, "room")} · ${pl(d.nights, "night")}`, o.total]]; }
  return [[`${d.model} · ${hoursText(d.hours)}`, o.total]];
}

/* Менеджер по чартерам — в демо отвечает за 5 секунд, подтверждает борт за 2,5.
   Таймер проверяет все заказы, поэтому переживает и переходы, и перезагрузку. */
function tickCharter(){
  const now = Date.now(); let changed = false;
  for (const o of S.orders) {
    if (o.type !== "JET" && o.type !== "HELI") continue;
    // Пока открыта админка, цену ставит оператор, а не таймер.
    if (o.status === "NEW" && now - o.createdAt >= 5000 && !opsLive()) { o.status = "PENDING"; o.total = o.details.quote; hist(o, "PENDING"); changed = true; toast(tf("toast_priced", { no:o.no })); }
    if (o.status === "PAID" && o.paidAt && now - o.paidAt >= 2500) { o.status = "CONFIRMED"; hist(o, "CONFIRMED"); changed = true; toast(tf("toast_confirmed", { no:o.no })); }
  }
  if (changed) { save(); if (currentParts()[0] === "orders") rerender(); }
}

/* ---------------------------------------------------------------- документы */
function qrStub(o){
  return `<div class="pass-qr"><div class="qr" data-qr="${CONFIG.site.verifyUrl}${o.no}"></div>
    <div class="stack" style="gap:4px"><span class="lbl">${esc(t("booking_ref"))}</span><span class="ref">${o.no}</span>
    <span class="small muted">${esc(t("offline_note"))}</span></div></div>`;
}
function renderQRs(){
  $$("[data-qr]").forEach(el => {
    if (typeof qrcode !== "function") { el.innerHTML = `<span class="mono small">QR</span>`; return; }
    try { const q = qrcode(0, "M"); q.addData(el.dataset.qr); q.make(); el.innerHTML = q.createSvgTag({ cellSize:4, margin:0, scalable:true }); }
    catch (e) { el.innerHTML = ""; }
  });
}
function orderDocument(o){
  if (o.type === "FLIGHT") return flightDocument(o);
  const body = { TOUR:tourVoucherBody, HOTEL:hotelVoucherBody, JET:charterVoucherBody, HELI:charterVoucherBody }[o.type](o);
  return `<article class="voucher rise"><div class="v-top"><span class="wordmark">CHARTERI<b>.UZ</b></span><span class="v-kind">${esc(t("doc_" + o.type))}</span></div>
    <div class="v-body">${body}</div><div class="perf"></div>${qrStub(o)}</article>`;
}
