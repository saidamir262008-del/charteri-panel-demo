/* ==========================================================================
   Оформление в кабинете: путешественники — из базы клиентов агентства,
   оплата — с баланса. Сбор 3% стоит отдельной строкой до оплаты; если
   баланса не хватает, кнопка оплаты выключена и рядом — пополнение.
   ========================================================================== */
"use strict";

const clientByPhone = phone => S.travellers.find(c => c.phone && digits(c.phone) === digits(phone));

/* Бронь «для клиента» (из карточки клиента): первый путешественник и
   контакты уже заполнены (паспорт — из базы, с сервером — по revealSaved). */
function startCheckout(spec){
  const no = cantBuy(spec.type, spec.total); if (no) return toast(t(no));
  const cl = S.travellers.find(c => c.id === M.ui.forClient), travellers = spec.travellers.types.map(blankTraveller);
  const c = M.checkout = { ...spec, rate:sysRate(), method:"balance", pstate: spec.recheck ? "checking" : "ok", pending:null, travellers, mode:spec.travellers.mode,
    contact:{ phone:cl?.phone || "", email:cl?.email || "" }, clientId:cl?.id || null };
  M.ui.cq = {}; M.ui.cfound = {};
  go("checkout");
  if (cl) revealSaved([cl.id], c.end).then(([full]) => {
    if (!full || M.checkout !== c || c.travellers[0].surname) return;
    fillSaved(c.travellers[0], full, c.end, c.mode); if (currentParts()[0] === "checkout") rerender();
  }).catch(e => toast(API.errText(e)));
}

/* Поиск по базе клиентов в оформлении: имя (в любом порядке), телефон или
   номер паспорта; найденный — одной кнопкой во все поля. С сервером поиск
   идёт на сервер (адаптер заменяет searchClients). Результаты рисуются на
   месте, без перерисовки формы, чтобы не сбивать ввод. */
const CSEARCH_MS = 250, CSEARCH_MAX = 8;
let searchClients = async q => {
  const s = q.trim().toLowerCase(), d = digits(q), pp = q.replace(/\s/g, "").toUpperCase();
  return S.travellers.filter(c => `${c.given} ${c.surname}|${c.surname} ${c.given}`.toLowerCase().includes(s)
    || (pp.length >= 5 && c.passport === pp) || (d.length >= 4 && digits(c.phone || "").includes(d))).slice(0, CSEARCH_MAX);
};
function foundChips(i){
  const r = M.ui.cfound?.[i]; if (!r) return "";
  if (!r.items.length) return `<span class="muted small">${esc(t("tr_none"))}</span>`;
  return r.items.map(cl => `<button type="button" class="tchip" data-act="cfill" data-i="${i}" data-v="${esc(cl.id)}"><span>${esc(cl.given)} ${esc(cl.surname)}</span>
    <span class="mono small">${esc(savedMask(cl))}${cl.phone ? ` · <span class="nowrap">${esc(cl.phone)}</span>` : ""}</span></button>`).join("");
}
const clientSearchBox = i => `<div class="tsearch"><label class="field"><span>${esc(t("tr_search"))}</span>
    <input type="search" data-cq="${i}" value="${esc(M.ui.cq?.[i] || "")}" placeholder="${esc(t("tr_search_ph"))}" autocomplete="off" spellcheck="false"></label>
    <div class="tfound" id="tfound${i}" aria-live="polite">${foundChips(i)}</div></div>`;
const B2C_TFORM = travellerForm;
travellerForm = (x, i, mode) => B2C_TFORM(x, i, mode).replace('<div class="sgrid sgrid-2">', `${clientSearchBox(i)}<div class="sgrid sgrid-2">`);
document.addEventListener("input", e => {
  const i = e.target.dataset?.cq; if (i === undefined || !M.checkout) return;
  const q = e.target.value; (M.ui.cq ||= {})[i] = q; M.ui.cfound ||= {};
  clearTimeout(M.ui.cqTimer);
  if (q.trim().length < 2) { M.ui.cfound[i] = null; const box = $("#tfound" + i); if (box) box.innerHTML = ""; return; }
  M.ui.cqTimer = setTimeout(async () => {
    const items = await searchClients(q).catch(err => { toast(API.errText(err)); return null; });
    if (!items || M.ui.cq?.[i] !== q) return;
    M.ui.cfound[i] = { q, items }; const box = $("#tfound" + i); if (box) box.innerHTML = foundChips(i);
  }, CSEARCH_MS);
});

const B2C_CHECKOUT_AFTER = PAGES.checkout.after;      // проверка цены у поставщика — как на сайте
function priceCheck(c){
  if (c.recheck && c.pstate === "checking") return `<div class="pcheck wait"><span class="spin"></span>${esc(t("verifying_price"))}</div>`;
  if (c.pstate === "changed") return priceChangedBox(c, withFee(c.total), withFee(c.pending.total));
  return c.recheck ? `<div class="pcheck good">${IC.ok}${esc(t("price_confirmed"))}</div>` : "";
}
/* Сколько спишется и что останется — в сумах: баланс агентства в сумах. */
function balanceBlock(due){
  if (!agencyActive()) return `<div class="card stack"><h3>${esc(t("pay_from_balance"))}</h3><div class="err">${esc(t("agency_blocked_d"))}</div></div>`;
  const after = S.balance - due.uzs, short = after < -creditOf(), cr = creditOf();
  return `<div class="card stack"><h3>${esc(t("pay_from_balance"))}</h3>
    <div class="rows">
      <div><span class="k">${esc(t("balance_now"))}</span><span class="v mono">${fmtUZS(S.balance)}</span></div>
      ${cr ? `<div><span class="k">${esc(t("credit_limit"))}</span><span class="v mono">${fmtUZS(cr)}</span></div>` : ""}
      <div><span class="k">${esc(t("will_debit"))}</span><span class="v mono">−${fmtUZS(due.uzs)}</span></div>
      <div class="tot"><span class="k">${esc(t("balance_after"))}</span><span class="v ${short ? "bad" : ""}">${fmtUZS(after)}</span></div></div>
    ${short ? `<div class="err shortfall"><span>${esc(tf("err_short", { amount:fmtUZS(-after - cr) }))}</span><a class="solid sm" href="#/balance?topup">${esc(t("topup"))}</a></div>` : ""}</div>`;
}

PAGES.checkout = {
  render(){
    const c = M.checkout; if (!c) { go(SEARCH_PATH); return null; }
    const lines = c.pstate === "changed" ? c.pending.lines : c.lines, total = c.pstate === "changed" ? c.pending.total : c.total;
    const due = withFee(total), short = due.uzs > available() || !agencyActive();
    return `<div class="page"><button type="button" class="backlink" data-act="hback">${IC.back}<span>${esc(t("back"))}</span></button>
      ${pageHead(t("checkout_title"), c.title)}
      <div class="twocol"><div class="stack">
        <div class="card stack"><h3>${esc(t(c.mode === "lead" ? "guest_details" : "passenger_details"))}</h3>
          ${c.travellers.map((x, i) => travellerForm(x, i, c.mode)).join('<hr class="sep">')}
          ${c.mode === "full" ? `<p class="secure">${IC.lock}<span>${esc(t("secure_note"))}</span></p>` : ""}</div>
        <div class="card stack"><h3>${esc(t("client_contact"))}</h3><p class="muted small">${esc(t("client_contact_d"))}</p><div class="sgrid sgrid-2">
          <label class="field"><span>${esc(t("contact_phone"))}</span><input data-ct="phone" type="tel" value="${esc(c.contact.phone)}" autocomplete="off" placeholder="+998"></label>
          <label class="field"><span>${esc(t("email_opt"))}</span><input data-ct="email" type="email" maxlength="${EMAIL_MAX}" value="${esc(c.contact.email)}" autocomplete="off"></label></div>
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
  cfill: async el => {
    const i = Number(el.dataset.i), c = M.checkout; if (!c?.travellers[i]) return;
    const [cl] = await revealSaved([el.dataset.v], c.end).catch(e => { toast(API.errText(e)); return []; });
    if (!cl || M.checkout !== c) return;
    fillSaved(c.travellers[i], cl, c.end, c.mode);
    if (i === 0) { c.clientId = cl.id; if (cl.phone) c.contact.phone = cl.phone; if (cl.email) c.contact.email = cl.email; }
    if (M.ui.cq) M.ui.cq[i] = ""; if (M.ui.cfound) M.ui.cfound[i] = null;
    rerender();
  },
  cpay: () => {
    const c = M.checkout; if (c.pstate !== "ok" || !validateCheckout()) return;
    if (rateMoved(c)) return;
    if (!detailsShown(c.details)) { M.checkout = null; toast(t("dir_gone")); return go(SEARCH_PATH); }
    const no = cantBuy(c.type, c.total); if (no) { M.checkout = null; toast(t(no)); return go(SEARCH_PATH); }
    const due = withFee(c.total);
    if (!agencyActive()) return showErr("#cerr", t("agency_blocked_d"));
    // Кредитный лимит: платить можно до баланса плюс лимит.
    if (due.uzs > available()) return showErr("#cerr", tf("err_short", { amount:fmtUZS(due.uzs - available()) }));
    const phone = prettyPhone(c.contact.phone);
    // Отмеченные пассажиры — в базу клиентов (тот же паспорт или человек — обновляется); первый — с контактами заказа.
    keepTravellers(c, (x, i) => i === 0 ? { phone, ...(c.contact.email ? { email:c.contact.email } : {}) } : {});
    for (const v of S.travellers) { v.phone ??= ""; v.email ??= ""; }
    const clientId = c.travellers[0].fromId || c.clientId || clientByPhone(phone)?.id || null;
    const newClients = S.travellers.filter(v => c.travellers.some(x => x.fromId === v.id)).map(v => ({ ...v }));
    // Ставка сбора — та, что была на экране при нажатии «Оплатить».
    const feeBps = prices().feeBps;
    overlay(t("processing_balance"));
    setTimeout(() => {
      overlay(""); refresh();
      // Клиенты из оформления — в свежие данные: новые добавить, изменённые обновить.
      for (const v of newClients) { const e = S.travellers.find(x => x.id === v.id); if (e) Object.assign(e, v); else S.travellers.push(v); }
      const due = addA(c.total, feeOf(c.total, feeBps));
      if (!agencyActive()) { rerender(); return showErr("#cerr", t("agency_blocked_d")); }
      if (cantBuy(c.type, c.total)) { M.checkout = null; toast(t(cantBuy(c.type, c.total))); return go(SEARCH_PATH); }
      if (due.uzs > available()) { rerender(); return showErr("#cerr", tf("err_short", { amount:fmtUZS(due.uzs - available()) })); }
      if (rateMoved(c)) return;
      createOrder({ type:c.type, status:"PAID", title:c.title, sub:c.sub, start:c.start, end:c.end, ref:c.ref, total:c.total, clientId, feeBps,
        travellers:c.travellers.map(x => orderTraveller(x, c.mode)), contact:{ ...c.contact, phone }, details:c.details },
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
