/* ==========================================================================
   Оформление в кабинете: путешественники — из базы клиентов агентства,
   оплата — с баланса. Сбор 3% стоит отдельной строкой до оплаты; если
   баланса не хватает, кнопка оплаты выключена и рядом — пополнение.
   ========================================================================== */
"use strict";

const clientFill = c => ({ surname:c.surname, given:c.given, passport:c.passport, gender:c.gender, dob:c.dob, expiry:c.expiry, cit:c.cit, fromId:c.id, save:false });
const clientByPhone = phone => S.travellers.find(c => c.phone && digits(c.phone) === digits(phone));

/* Бронь «для клиента» (из карточки клиента): первый путешественник и
   контакты уже заполнены. */
function startCheckout(spec){
  const cl = S.travellers.find(c => c.id === M.ui.forClient), travellers = spec.travellers.types.map(blankTraveller);
  if (cl) Object.assign(travellers[0], clientFill(cl));
  M.checkout = { ...spec, method:"balance", pstate: spec.recheck ? "checking" : "ok", pending:null, travellers, mode:spec.travellers.mode,
    contact:{ phone:cl?.phone || "", email:cl?.email || "" }, clientId:cl?.id || null };
  go("checkout");
}

const B2C_CHECKOUT_AFTER = PAGES.checkout.after;      // проверка цены у поставщика — как на сайте
function priceCheck(c){
  if (c.recheck && c.pstate === "checking") return `<div class="pcheck wait"><span class="spin"></span>${esc(t("verifying_price"))}</div>`;
  if (c.pstate === "changed") return `<div class="changed settle"><h3>${esc(t("price_changed_title"))}</h3><p class="small">${esc(t("price_changed_body"))}</p>
      <div class="rows"><div><span class="k">${esc(t("old_price"))}</span><span class="v mono strike">${fmt(withFee(c.total))}</span></div>
        <div><span class="k">${esc(t("new_price"))}</span><span class="v mono">${fmt(withFee(c.pending.total))}</span></div></div>
      <button type="button" class="solid" data-act="caccept">${esc(t("accept_new_price"))}</button></div>`;
  return c.recheck ? `<div class="pcheck good">${IC.ok}${esc(t("price_confirmed"))}</div>` : "";
}
/* Сколько спишется и что останется — в сумах: баланс агентства в сумах. */
function balanceBlock(due){
  if (!agencyActive()) return `<div class="card stack"><h3>${esc(t("pay_from_balance"))}</h3><div class="err">${esc(t("agency_blocked_d"))}</div></div>`;
  const after = S.balance - due.uzs, short = after < 0;
  return `<div class="card stack"><h3>${esc(t("pay_from_balance"))}</h3>
    <div class="rows">
      <div><span class="k">${esc(t("balance_now"))}</span><span class="v mono">${fmtUZS(S.balance)}</span></div>
      <div><span class="k">${esc(t("will_debit"))}</span><span class="v mono">−${fmtUZS(due.uzs)}</span></div>
      <div class="tot"><span class="k">${esc(t("balance_after"))}</span><span class="v ${short ? "bad" : ""}">${fmtUZS(after)}</span></div></div>
    ${short ? `<div class="err shortfall"><span>${esc(tf("err_short", { amount:fmtUZS(-after) }))}</span><a class="solid sm" href="#/balance?topup">${esc(t("topup"))}</a></div>` : ""}</div>`;
}

PAGES.checkout = {
  render(){
    const c = M.checkout; if (!c) { go(SEARCH_PATH); return null; }
    const lines = c.pstate === "changed" ? c.pending.lines : c.lines, total = c.pstate === "changed" ? c.pending.total : c.total;
    const due = withFee(total), short = due.uzs > S.balance || !agencyActive();
    return `<div class="page"><button type="button" class="backlink" data-act="hback">${IC.back}<span>${esc(t("back"))}</span></button>
      ${pageHead(t("checkout_title"), c.title)}
      <div class="twocol"><div class="stack">
        <div class="card stack"><h3>${esc(t(c.mode === "lead" ? "guest_details" : "passenger_details"))}</h3>
          ${c.travellers.map((x, i) => travellerForm(x, i, c.mode)).join('<hr class="sep">')}
          ${c.mode === "full" ? `<p class="secure">${IC.lock}<span>${esc(t("secure_note"))}</span></p>` : ""}</div>
        <div class="card stack"><h3>${esc(t("client_contact"))}</h3><p class="muted small">${esc(t("client_contact_d"))}</p><div class="sgrid sgrid-2">
          <label class="field"><span>${esc(t("contact_phone"))}</span><input data-ct="phone" type="tel" value="${esc(c.contact.phone)}" autocomplete="off" placeholder="+998"></label>
          <label class="field"><span>${esc(t("email_opt"))}</span><input data-ct="email" type="email" value="${esc(c.contact.email)}" autocomplete="off"></label></div>
          <div class="err" id="cerr" hidden></div></div>
        ${balanceBlock(due)}
      </div>
      <aside class="card sticky stack">
        <span class="lbl">${esc(t("doc_" + c.type))}</span><b>${esc(c.title)}</b><span class="muted small">${esc(c.sub)}</span>
        ${checkLines(feeLines(lines, total, feeOf(total), prices().feeBps), due, "checkout")}
        <p class="fee-note">${esc(t("fee_note"))}</p>
        ${priceCheck(c)}
        <button type="button" class="cta" data-act="cpay" ${c.pstate === "ok" && !short ? "" : "disabled"}>${esc(t("pay_balance_cta"))} · ${fmt(due)}</button>
        <p class="demo-note">${esc(t("pay_balance_demo"))}</p></aside></div></div>`;
  },
  after: B2C_CHECKOUT_AFTER
};

Object.assign(ACT, {
  /* Клиент из базы: паспорт в путешественника, телефон — в контакты заказа. */
  cfill: el => {
    const i = Number(el.dataset.i), c = M.checkout, cl = S.travellers.find(v => v.id === el.dataset.v); if (!cl) return;
    Object.assign(c.travellers[i], clientFill(cl));
    if (i === 0) { c.clientId = cl.id; if (cl.phone) c.contact.phone = cl.phone; if (cl.email) c.contact.email = cl.email; }
    rerender();
  },
  cpay: () => {
    const c = M.checkout; if (c.pstate !== "ok" || !validateCheckout()) return;
    const due = withFee(c.total);
    if (!agencyActive()) return showErr("#cerr", t("agency_blocked_d"));
    if (due.uzs > S.balance) return showErr("#cerr", tf("err_short", { amount:fmtUZS(due.uzs - S.balance) }));
    const phone = prettyPhone(c.contact.phone);
    c.travellers.forEach((x, i) => {
      if (!x.save || S.travellers.some(v => v.passport === x.passport)) return;
      const id = uid("cl");
      S.travellers.push({ id, surname:x.surname, given:x.given, passport:x.passport, gender:x.gender, dob:x.dob, expiry:x.expiry, cit:x.cit, phone:i === 0 ? phone : "", email:i === 0 ? c.contact.email : "" });
      x.fromId = id;
    });
    const clientId = c.travellers[0].fromId || c.clientId || clientByPhone(phone)?.id || null;
    const newClients = S.travellers.filter(v => c.travellers.some(x => x.fromId === v.id));
    // Ставка сбора — та, что была на экране при нажатии «Оплатить».
    const feeBps = prices().feeBps;
    overlay(t("processing_balance"));
    setTimeout(() => {
      overlay(""); refresh();
      // Новые клиенты из оформления — в свежие данные, если их там ещё нет.
      for (const v of newClients) if (!S.travellers.some(x => x.id === v.id)) S.travellers.push(v);
      const due = addA(c.total, feeOf(c.total, feeBps));
      if (!agencyActive()) { rerender(); return showErr("#cerr", t("agency_blocked_d")); }
      if (due.uzs > S.balance) { rerender(); return showErr("#cerr", tf("err_short", { amount:fmtUZS(due.uzs - S.balance) })); }
      createOrder({ type:c.type, status:"PAID", title:c.title, sub:c.sub, start:c.start, end:c.end, ref:c.ref, total:c.total, clientId, feeBps,
        travellers:c.travellers.map(({ type, save, fromId, ...x }) => x), contact:{ ...c.contact, phone }, details:c.details },
        id => { M.checkout = null; M.ui.forClient = null; go(`done/${id}`); });
    }, 1100);
  }
});

/* Заказ кабинета: сбор хранится рядом с суммой, оплата — сразу проводкой по балансу.
   Заявка на чартер (status NEW) приходит без цены — сбор появится вместе с ценой. */
function createOrder(spec, then){
  const now = Date.now(), paid = spec.status === "PAID";
  // Заявка на чартер идёт мимо оформления — клиента берём из «брони для клиента».
  const forClient = isCharter(spec) ? S.travellers.find(c => c.id === M.ui.forClient)?.id : null;
  const o = { id:uid("o"), no:makeRef(`${spec.ref}:${now}:${Math.random()}`), type:spec.type, status:spec.status, createdAt:now,
    title:spec.title, sub:spec.sub, start:spec.start, end:spec.end, total:spec.total,
    fee:spec.total ? feeOf(spec.total, spec.feeBps ?? prices().feeBps) : null, feeBps:spec.total ? spec.feeBps ?? prices().feeBps : null,
    method:paid ? "balance" : null, travellers:spec.travellers, contact:spec.contact, details:spec.details, req:null,
    paidAt:paid ? now : null, clientId:spec.clientId || forClient || clientByPhone(spec.contact.phone)?.id || null,
    history:[{ s:paid ? "PAID" : "NEW", at:now }] };
  S.orders.unshift(o);
  if (paid) post("order", -dueOf(o).uzs, { orderId:o.id });
  note(paid ? "paid" : "request", { orderId:o.id });
  if (forClient) M.ui.forClient = null;
  save(); then?.(o.id);
  return o;
}

/* ------------------------------------------------------------------ успех */
PAGES["done/:id"] = {
  render({ id }){
    const o = S.orders.find(x => x.id === id); if (!o) { go("orders"); return null; }
    const due = dueOf(o);
    return `<div class="page"><div class="card success">
      <svg class="checkmark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45"/><path d="M30 52l13 13 27-29"/></svg>
      <h1>${esc(t("paid_title"))}</h1><p class="muted">${esc(tf("paid_body", { client:clientOf(o) }))}</p>
      <div class="rows done-rows">
        <div><span class="k">${esc(t("debited"))}</span><span class="v mono">−${fmtUZS(due.uzs)}</span></div>
        <div><span class="k">${esc(t("balance_after"))}</span><span class="v mono">${fmtUZS(S.balance)}</span></div></div>
      <div class="slot" aria-hidden="true"></div>
      <div class="stub print">
        <div class="stub-l"><span class="lbl">${esc(t("doc_" + o.type))}</span><b>${esc(orderTitle(o))}</b><span class="muted small">${esc(orderSub(o))}</span>
          <span class="lbl" style="margin-top:8px">${esc(t("booking_ref"))}</span><span class="ref">${o.no}</span></div>
        <div class="qr" data-qr="${CONFIG.site.verifyUrl}${o.no}"></div></div>
      <div class="row center"><a class="cta" style="max-width:280px" href="#/orders/${o.id}">${esc(t("open_order"))}</a>
        <a class="ghost" style="max-width:220px" href="#/book">${esc(t("new_booking"))}</a></div></div></div>`;
  },
  after(){ renderQRs(); }
};
