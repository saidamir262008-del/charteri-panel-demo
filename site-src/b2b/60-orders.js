/* ==========================================================================
   Заказы агентства: таблица с фильтрами и поиском, карточка заказа с
   документом, оплатой чартера с баланса и отменой по правилам поставщика.
   ========================================================================== */
"use strict";

const ORDER_GROUPS = {
  all:       () => true,
  action:    o => ["NEW", "PENDING"].includes(o.status),
  active:    o => ["PAID", "CONFIRMED"].includes(effStatus(o)),
  done:      o => effStatus(o) === "COMPLETED",
  cancelled: o => ["CANCELLED", "REFUNDED"].includes(o.status)
};
const orderMatches = (o, q) => !q || [o.no, orderTitle(o), clientOf(o), o.contact?.phone].join(" ").toLowerCase().includes(q.toLowerCase());
const orderSum = o => { const d = dueOf(o); return d ? fmt(d) : `≈ ${fmt(o.details.low)} – ${fmt(o.details.high)}`; };

function orderRow(o, i, rc = ""){
  const st = effStatus(o);
  return `<a class="orow ${rc} ${st === "COMPLETED" || o.status === "REFUNDED" ? "past" : ""}" style="--i:${i}" href="#/orders/${o.id}" data-flip="${o.id}">
    <span class="or-ic">${TYPE_ICON[o.type]}</span>
    <span class="or-main"><b>${esc(orderTitle(o))}</b><span class="mono">${o.no}</span></span>
    <span class="or-client">${esc(clientOf(o))}</span>
    <span class="or-date">${esc(fdate(o.start))}${o.end !== o.start ? ` — ${esc(fdate(o.end))}` : ""}</span>
    <span class="or-sum mono">${orderSum(o)}</span>
    <span class="or-st">${pill(st)}</span></a>`;
}
function ordersList(){
  const g = M.ui.ogroup || "all", ty = M.ui.otype || "ALL", q = (M.ui.oq || "").trim();
  const list = S.orders.filter(o => ORDER_GROUPS[g](o) && (ty === "ALL" || o.type === ty) && orderMatches(o, q));
  if (!list.length) return `<div class="empty"><h3>${esc(t(S.orders.length ? "orders_none_match" : "orders_empty"))}</h3>
    <p class="muted">${esc(t(S.orders.length ? "orders_none_match_d" : "orders_empty_b2b"))}</p></div>`;
  const rc = listEnter(`orders:${g}:${ty}`);
  return `<div class="otable has-head"><div class="orow ohead-row" aria-hidden="true"><span></span><span>${esc(t("col_service"))}</span><span>${esc(t("col_client"))}</span>
    <span>${esc(t("col_dates"))}</span><span>${esc(t("col_sum"))}</span><span>${esc(t("col_status"))}</span></div>
    ${list.map((o, i) => orderRow(o, i, rc)).join("")}</div>`;
}
PAGES.orders = {
  render(){
    const g = M.ui.ogroup || "all", ty = M.ui.otype || "ALL";
    const counts = Object.fromEntries(Object.keys(ORDER_GROUPS).map(k => [k, S.orders.filter(ORDER_GROUPS[k]).length]));
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("nav_orders"))}</h1><p class="muted">${esc(t("orders_sub_b2b"))}</p></div>
        <a class="solid" href="#/book">${IC.plus}<span>${esc(t("new_booking"))}</span></a></div>
      <div class="card stack">
        <div class="otools">
          <div class="chipbar">${Object.keys(ORDER_GROUPS).map(k => `<button type="button" class="chip" data-act="ogroup" data-v="${k}" aria-pressed="${g === k}">${esc(t("og_" + k))}${
            counts[k] && k !== "all" ? ` <span class="chip-n">${counts[k]}</span>` : ""}</button>`).join("")}</div>
          <div class="ofind">
            <select id="otype" class="minisel" aria-label="${esc(t("col_service"))}">${["ALL", "FLIGHT", "TOUR", "HOTEL", "JET", "HELI"].map(k =>
              `<option value="${k}" ${ty === k ? "selected" : ""}>${esc(t(k === "ALL" ? "all_services_short" : "type_" + k))}</option>`).join("")}</select>
            <label class="search">${IC.search}<input id="oq" type="search" value="${esc(M.ui.oq || "")}" placeholder="${esc(t("orders_search"))}" aria-label="${esc(t("orders_search"))}"></label>
          </div>
        </div>
        <div id="olist">${ordersList()}</div>
      </div></div>`;
  }
};

/* ---------------------------------------------------------- карточка заказа */
const RULE_KEY = o => "rule_" + (isCharter(o) ? "CHARTER" : o.type);
function refundCard(o){
  const r = o.refund; if (!r) return "";
  return `<div class="card stack"><h3>${esc(t(r.done ? "refund_done" : "refund_wait"))}</h3>
    <div class="rows">
      <div><span class="k">${esc(t("service_cost"))}</span><span class="v mono">${fmtUZS(o.total.uzs)}</span></div>
      <div><span class="k">${esc(tf("penalty_rate", { p:Math.round(r.rate * 100) }))}</span><span class="v mono">−${fmtUZS(r.penalty)}</span></div>
      <div><span class="k">${esc(tf("service_fee", { p:pctText(orderFeeBps(o)) }))}</span><span class="v">${esc(t("fee_kept"))}</span></div>
      <div class="tot"><span class="k">${esc(t("refund_to_balance"))}</span><span class="v">${fmtUZS(r.uzs)}</span></div></div>
    ${r.done ? "" : `<p class="pcheck wait"><span class="spin"></span>${esc(t("refund_wait_d"))}</p>`}</div>`;
}
function cancelBox(o){
  if (!["PAID", "CONFIRMED"].includes(o.status)) return `<div class="card stack cancelbox"><h3>${esc(t("cancel_request"))}</h3><p class="muted">${esc(t("cancel_request_d"))}</p>
    <div class="row"><button type="button" class="solid danger-solid" data-act="ocancelgo" data-v="${o.id}">${esc(t("cancel_request_cta"))}</button>
    <button type="button" class="link" data-act="ocancel" data-v="">${esc(t("keep_order"))}</button></div></div>`;
  const p = penaltyOf(o);
  return `<div class="card stack cancelbox"><h3>${esc(t("cancel_title"))}</h3>
    <div class="rows">
      <div><span class="k">${esc(t("days_left"))}</span><span class="v">${esc(pl(Math.max(0, p.days), "day"))}</span></div>
      <div><span class="k">${esc(t("service_cost"))}</span><span class="v mono">${fmtUZS(o.total.uzs)}</span></div>
      <div><span class="k">${esc(tf("penalty_rate", { p:Math.round(p.rate * 100) }))}</span><span class="v mono">−${fmtUZS(p.penalty)}</span></div>
      <div><span class="k">${esc(tf("service_fee", { p:pctText(orderFeeBps(o)) }))}</span><span class="v">${esc(t("fee_kept"))}</span></div>
      <div class="tot"><span class="k">${esc(t("refund_to_balance"))}</span><span class="v">${fmtUZS(p.refund)}</span></div></div>
    <p class="small muted">${esc(t(RULE_KEY(o)))}</p>
    <div class="row"><button type="button" class="solid danger-solid" data-act="ocancelgo" data-v="${o.id}">${esc(tf("cancel_cta", { amount:fmtUZS(p.refund) }))}</button>
      <button type="button" class="link" data-act="ocancel" data-v="">${esc(t("keep_order"))}</button></div></div>`;
}
function orderMain(o, st){
  const charter = isCharter(o);
  if (charter && st === "NEW") return `<div class="card stack waitcard"><span class="radar" aria-hidden="true"><i></i><i></i>${TYPE_ICON[o.type]}</span><h3>${esc(t("mgr_title"))}</h3>
      <p class="muted">${esc(t("mgr_body_b2b"))}</p><p class="small">${esc(t("estimate"))}: <b class="mono">${fmt(o.details.low)} – ${fmt(o.details.high)}</b></p></div>`;
  if (st === "PENDING") {
    const due = dueOf(o), short = due.uzs > available();
    return `<div class="card stack"><h3>${esc(t("price_ready"))}</h3><p class="muted">${esc(tf("price_ready_b2b", { p:pctText(orderFeeBps(o)) }))}</p>
      ${checkLines(feeLines(orderLines(o), o.total, o.fee || feeOf(o.total), orderFeeBps(o)), due)}<p class="fee-note">${esc(t("fee_note"))}</p></div>
      ${balanceBlock(due)}
      <button type="button" class="cta" data-act="opay" data-v="${o.id}" ${short || !agencyActive() ? "disabled" : ""}>${esc(t("pay_balance_cta"))} · ${fmt(due)}</button>`;
  }
  if (st === "PAID") return `<div class="card stack waitcard"><span class="radar" aria-hidden="true"><i></i><i></i>${IC.shield}</span><h3>${esc(t("confirming_title"))}</h3><p class="muted">${esc(t("confirming_body_b2b"))}</p></div>`;
  if (st === "CANCELLED" || st === "REFUNDED") return refundCard(o) || `<div class="card stack"><h3>${esc(t("st_CANCELLED"))}</h3><p class="muted">${esc(t("cancelled_unpaid"))}</p></div>`;
  return `${orderDocument(o)}<div class="row doc-actions"><button type="button" class="ghost sm" data-act="oprint">${IC.print}<span>${esc(t("print_doc"))}</span></button>
    <span class="muted small">${esc(t("print_hint"))}</span></div>`;
}
PAGES["orders/:id"] = {
  render({ id }){
    const o = S.orders.find(x => x.id === id);
    if (!o) return `<div class="page">${backLink("orders", t("nav_orders"))}<div class="card empty"><h3>${esc(t("order_missing"))}</h3></div></div>`;
    const st = effStatus(o), cl = S.travellers.find(c => c.id === o.clientId), due = dueOf(o);
    const canCancel = ["NEW", "PENDING", "PAID", "CONFIRMED"].includes(st) && o.start >= TODAY;
    return `<div class="page">${backLink("orders", t("nav_orders"))}
      <div class="ohead"><span class="oc-ic">${TYPE_ICON[o.type]}</span><div><span class="lbl">${esc(t("doc_" + o.type))} · <span class="mono">${o.no}</span></span>
        <h1>${esc(orderTitle(o))}</h1><p class="muted">${esc(orderSub(o))}</p></div>${pill(st)}</div>
      <div class="twocol"><div class="stack">${orderMain(o, st)}${M.ui.cancelFor === o.id ? cancelBox(o) : ""}</div>
        <aside class="stack sticky">
          <div class="card stack">
            ${due ? `<span class="lbl">${esc(t("payment"))}</span>${checkLines(feeLines(orderLines(o), o.total, o.fee || feeOf(o.total), orderFeeBps(o)), due)}`
              : `<span class="lbl">${esc(t("estimate"))}</span><b class="mono">${fmt(o.details.low)} – ${fmt(o.details.high)}</b>`}
            ${o.paidAt ? `<div class="rows"><div><span class="k">${esc(t("pay_method"))}</span><span class="v">${esc(t("method_balance"))}</span></div>
              <div><span class="k">${esc(t("paid_at"))}</span><span class="v">${esc(fdt(o.paidAt))}</span></div></div>` : ""}
          </div>
          <div class="card stack"><span class="lbl">${esc(t("col_client"))}</span>
            <div class="client-mini"><span class="avatar sm">${esc(monogram(clientOf(o)))}</span><div class="stack" style="gap:1px;min-width:0">
              <b>${esc(clientOf(o))}</b><span class="mono small muted">${esc(o.contact.phone)}</span></div>
              ${cl ? `<a class="link" href="#/clients/${cl.id}">${esc(t("open_client"))}</a>` : ""}</div>
            ${o.travellers.length > 1 ? `<p class="small muted">${esc(o.travellers.map(x => `${x.given} ${x.surname}`.trim()).join(", "))}</p>` : ""}
          </div>
          <div class="card stack"><span class="lbl">${esc(t("history"))}</span>
            <ol class="timeline">${o.history.map(h => `<li><span class="tl-dot st-${h.s}"></span><b>${esc(t("st_" + h.s))}</b><span class="muted small">${esc(fdt(h.at))}</span></li>`).join("")}</ol></div>
          ${canCancel && M.ui.cancelFor !== o.id ? `<button type="button" class="ghost danger-ghost" data-act="ocancel" data-v="${o.id}">${esc(t(["NEW", "PENDING"].includes(st) ? "cancel_request" : "cancel_order"))}</button>` : ""}
        </aside></div></div>`;
  },
  after(){ renderQRs(); if (M.ui.cancelFor) $(".cancelbox")?.scrollIntoView({ block:"nearest", behavior:REDUCED ? "auto" : "smooth" }); }
};

Object.assign(ACT, {
  ogroup: el => { M.ui.ogroup = el.dataset.v; flip(rerender); },
  /* Списание — на свежих данных и с повторной проверкой: за секунду ожидания
     админка или другая вкладка могли изменить баланс, статус или блокировку. */
  opay: el => {
    const id = el.dataset.v, o0 = S.orders.find(x => x.id === id); if (!o0 || o0.status !== "PENDING" || !agencyActive() || dueOf(o0).uzs > available()) return;
    overlay(t("processing_balance"));
    setTimeout(() => {
      overlay(""); refresh();
      const o = S.orders.find(x => x.id === id), due = o && dueOf(o);
      if (!o || o.status !== "PENDING" || !due) { rerender(); return toast(t("order_changed")); }
      if (!agencyActive()) { rerender(); return toast(t("agency_blocked_d")); }
      if (due.uzs > available()) { rerender(); return toast(tf("err_short", { amount:fmtUZS(due.uzs - available()) })); }
      post("order", -due.uzs, { orderId:o.id });
      Object.assign(o, { status:"PAID", paidAt:Date.now(), method:"balance", fee:o.fee || feeOf(o.total) }); hist(o, "PAID");
      note("paid", { orderId:o.id }); save(); rerender(); toast(tf("n_paid", { no:o.no }));
    }, 1100);
  },
  ocancel: el => { M.ui.cancelFor = el.dataset.v || null; rerender(); },
  /* Оплаченный заказ: штраф поставщика удерживается, остаток вернётся на баланс,
     когда поставщик подтвердит возврат. Заявка без оплаты просто закрывается. */
  ocancelgo: el => {
    refresh(); const o = S.orders.find(x => x.id === el.dataset.v); if (!o || !["NEW", "PENDING", "PAID", "CONFIRMED"].includes(o.status)) { rerender(); return; }
    M.ui.cancelFor = null;
    if (["PAID", "CONFIRMED"].includes(o.status)) {
      const p = penaltyOf(o);
      o.refund = { rate:p.rate, penalty:p.penalty, uzs:p.refund, at:Date.now(), done:false };
    }
    o.status = "CANCELLED"; hist(o, "CANCELLED");
    note("cancelled", { orderId:o.id }); save(); rerender(); toast(tf("n_cancelled", { no:o.no }));
  },
  oprint: () => window.print()
});
/* Поиск и тип перерисовывают только таблицу — поле поиска не теряет фокус. */
document.addEventListener("input", e => { if (e.target.id === "oq") { M.ui.oq = e.target.value; const l = $("#olist"); if (l) l.innerHTML = ordersList(); } });
document.addEventListener("change", e => { if (e.target.id === "otype") { M.ui.otype = e.target.value; flip(() => { $("#olist").innerHTML = ordersList(); }); } });
