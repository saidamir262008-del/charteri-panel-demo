/* ==========================================================================
   Заказы всех агентств и сайта: фильтры, поиск, карточка с документом,
   деньгами, историей и действиями по статусу — в пределах прав роли.
   ========================================================================== */
"use strict";

const ADM_GROUPS = {
  all:       () => true,
  action:    o => ["NEW", "PENDING"].includes(o.status),
  active:    o => ["PAID", "CONFIRMED"].includes(effStatus(o)),
  done:      o => effStatus(o) === "COMPLETED",
  cancelled: o => ["CANCELLED", "REFUNDED"].includes(o.status)
};
const admSum = r => { const d = orderDue(r); return d ? fmt(d) : `≈ $${grp(r.o.details.low.usd)} – $${grp(r.o.details.high.usd)}`; };
function admOrderRows(){
  const g = M.ui.aog || "all", src = M.ui.aosrc || "all", ty = M.ui.aoty || "ALL", q = (M.ui.aoq || "").trim().toLowerCase();
  return allOrders().filter(r => ADM_GROUPS[g](r.o) && (ty === "ALL" || r.o.type === ty)
    && (src === "all" || (src === "site" ? r.src === "site" : src === "agencies" ? r.src !== "site" : r.src === src))
    && (!q || [r.o.no, orderTitle(r.o), orderClient(r), srcName(r), r.o.contact?.phone].join(" ").toLowerCase().includes(q)));
}
const ORDER_COLS = "40px minmax(0,2.2fr) minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,1fr) minmax(130px,1.2fr) minmax(128px,auto)";
/* compact — в карточке агентства или покупателя: источник там и так известен. */
const ORDER_COLS_COMPACT = "40px minmax(0,2fr) minmax(0,1.2fr) minmax(130px,1.2fr) minmax(128px,auto)";
function admOrderRow(r, i, rc = "", compact = false){
  const o = r.o, st = effStatus(o);
  return `<a class="arow ${rc} ${st === "COMPLETED" || o.status === "REFUNDED" ? "past" : ""}" style="--i:${i}" href="#/orders/${r.src}/${o.id}" data-flip="${r.src}:${o.id}">
    <span class="or-ic">${TYPE_ICON[o.type]}</span>
    <span class="a-main"><b>${esc(orderTitle(o))}</b><span class="mono">${o.no}${compact ? ` · ${esc(fdate(o.start))}` : ""}</span></span>
    ${compact ? "" : `<span class="a-cell">${r.a ? esc(r.a.name) : `<span class="src-site">${esc(t("src_site"))}</span>`}</span>`}
    <span class="a-cell">${esc(orderClient(r))}</span>
    ${compact ? "" : `<span class="a-cell muted">${esc(fdate(o.start))}</span>`}
    <span class="a-num a-keep mono">${admSum(r)}</span>
    <span class="a-end">${pill(st)}</span></a>`;
}
function admOrderList(){
  const list = admOrderRows(), shown = list.slice(0, 120), rc = listEnter("aorders:" + [M.ui.aog, M.ui.aosrc, M.ui.aoty].join());
  if (!list.length) return `<div class="empty"><h3>${esc(t("orders_none_match"))}</h3><p class="muted">${esc(t("orders_none_match_d"))}</p></div>`;
  return `<div class="atable" style="--cols:${ORDER_COLS}"><div class="arow ahead" aria-hidden="true"><span></span><span>${esc(t("col_service"))}</span><span>${esc(t("col_source"))}</span>
    <span>${esc(t("col_client"))}</span><span>${esc(t("col_dates"))}</span><span class="a-num">${esc(t("col_sum"))}</span><span class="a-end">${esc(t("col_status"))}</span></div>
    ${shown.map((r, i) => admOrderRow(r, i, rc)).join("")}</div>
    ${list.length > shown.length ? `<p class="muted small">${esc(tf("shown_of", { n:shown.length, total:list.length }))}</p>` : ""}`;
}
PAGES.orders = {
  render(){
    const g = M.ui.aog || "all", src = M.ui.aosrc || "all", ty = M.ui.aoty || "ALL";
    const counts = Object.fromEntries(Object.keys(ADM_GROUPS).map(k => [k, allOrders().filter(r => ADM_GROUPS[k](r.o)).length]));
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_orders"))}</h1><p class="muted">${esc(t("aorders_sub"))}</p></div>
      <div class="card stack">
        <div class="otools">
          <div class="chipbar">${Object.keys(ADM_GROUPS).map(k => `<button type="button" class="chip" data-act="aog" data-v="${k}" aria-pressed="${g === k}">${esc(t("og_" + k))}${
            counts[k] && k !== "all" ? ` <span class="chip-n">${counts[k]}</span>` : ""}</button>`).join("")}</div>
          <div class="ofind">
            <select id="aosrc" class="minisel" aria-label="${esc(t("col_source"))}"><option value="all">${esc(t("src_all"))}</option><option value="agencies" ${src === "agencies" ? "selected" : ""}>${esc(t("src_agencies"))}</option>
              <option value="site" ${src === "site" ? "selected" : ""}>${esc(t("src_site"))}</option>${agencies().map(a => `<option value="${a.id}" ${src === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
            <select id="aoty" class="minisel" aria-label="${esc(t("col_service"))}">${["ALL", "FLIGHT", "TOUR", "HOTEL", "JET", "HELI"].map(k =>
              `<option value="${k}" ${ty === k ? "selected" : ""}>${esc(t(k === "ALL" ? "all_services_short" : "type_" + k))}</option>`).join("")}</select>
            <label class="search">${IC.search}<input id="aoq" type="search" value="${esc(M.ui.aoq || "")}" placeholder="${esc(t("aorders_search"))}" aria-label="${esc(t("aorders_search"))}"></label>
          </div></div>
        <div id="aolist">${admOrderList()}</div></div></div>`;
  }
};
ACT.aog = el => { M.ui.aog = el.dataset.v; flip(rerender); };
document.addEventListener("input", e => { if (e.target.id === "aoq") { M.ui.aoq = e.target.value; const l = $("#aolist"); if (l) l.innerHTML = admOrderList(); } });
document.addEventListener("change", e => {
  if (e.target.id === "aosrc" || e.target.id === "aoty") { M.ui[e.target.id] = e.target.value; flip(() => { const l = $("#aolist"); if (l) l.innerHTML = admOrderList(); }); }
});

/* ---------------------------------------------------------- карточка заказа */
function admActions(r){
  const o = r.o, st = effStatus(o), live = o.start >= TODAY, rows = [];
  if (isCharter(o) && st === "NEW") rows.push(`<div class="stack" style="gap:8px"><h3>${esc(t("set_price"))}</h3><p class="muted small">${esc(t("set_price_d"))}</p>${priceRow(r)}</div>`);
  if (st === "PAID") rows.push(`<div class="row"><button type="button" class="solid" data-act="aconfirm" data-src="${r.src}" data-v="${o.id}" ${guard("orders.approve")}>${esc(t("confirm_supplier"))}</button>
    <span class="muted small">${esc(t("confirm_supplier_d"))}</span></div>`);
  if (o.status === "CANCELLED" && o.refund && !o.refund.done) rows.push(refundRow(r));
  if (["NEW", "PENDING", "PAID", "CONFIRMED"].includes(st) && live) {
    if (M.ui.cancelFor !== o.id) rows.push(`<button type="button" class="ghost danger-ghost" data-act="acancel" data-v="${o.id}" ${guard("orders.cancel")}>${esc(t(["NEW", "PENDING"].includes(st) ? "cancel_request" : "cancel_order"))}</button>`);
    else {
      const paid = ["PAID", "CONFIRMED"].includes(st), p = paid ? penaltyOf(o) : null;
      rows.push(`<div class="stack cancelbox card"><h3>${esc(t(paid ? "cancel_title" : "cancel_request"))}</h3>
        ${paid ? `<div class="rows">
          <div><span class="k">${esc(t("days_left"))}</span><span class="v">${esc(pl(Math.max(0, p.days), "day"))}</span></div>
          <div><span class="k">${esc(t("service_cost"))}</span><span class="v mono">${fmtUZS(o.total.uzs)}</span></div>
          <div><span class="k">${esc(tf("penalty_rate", { p:Math.round(p.rate * 100) }))}</span><span class="v mono">−${fmtUZS(p.penalty)}</span></div>
          ${r.a ? `<div><span class="k">${esc(tf("service_fee", { p:pctText(orderFeeBps(o)) }))}</span><span class="v">${esc(t("fee_kept"))}</span></div>` : ""}
          <div class="tot"><span class="k">${esc(t(r.a ? "refund_to_balance" : "refund_to_card"))}</span><span class="v">${fmtUZS(p.refund)}</span></div></div>
          <p class="small muted">${esc(t(isCharter(o) ? "rule_CHARTER" : "rule_" + o.type))}</p>` : `<p class="muted">${esc(t("cancel_request_d"))}</p>`}
        <div class="row"><button type="button" class="solid danger-solid" data-act="acancelgo" data-src="${r.src}" data-v="${o.id}" ${guard("orders.cancel")}>${esc(paid ? tf("cancel_cta", { amount:fmtUZS(p.refund) }) : t("cancel_request_cta"))}</button>
          <button type="button" class="link" data-act="acancel" data-v="">${esc(t("keep_order"))}</button></div></div>`);
    }
  }
  return rows.length ? `<section class="card stack no-print"><h2>${esc(t("actions"))}</h2>${rows.join("")}</section>` : "";
}
function admPayment(r){
  const o = r.o;
  if (!o.total) return `<span class="lbl">${esc(t("estimate"))}</span><b class="mono">$${grp(o.details.low.usd)} – $${grp(o.details.high.usd)}</b>`;
  if (!r.a) return `<span class="lbl">${esc(t("payment"))}</span>${checkLines(orderLines(o), o.total)}${o.method ? `<div class="rows"><div><span class="k">${esc(t("pay_method"))}</span><span class="v">${esc(methodName(o.method))}</span></div></div>` : ""}`;
  return `<span class="lbl">${esc(t("payment"))}</span>${checkLines(feeLines(orderLines(o), o.total, o.fee || feeOf(o.total), orderFeeBps(o)), dueOf(o))}
    ${o.paidAt ? `<div class="rows"><div><span class="k">${esc(t("pay_method"))}</span><span class="v">${esc(t("method_balance"))}</span></div><div><span class="k">${esc(t("paid_at"))}</span><span class="v">${esc(fdt(o.paidAt))}</span></div></div>` : ""}`;
}
/* История заказа: статусы, отправленные документы и правки из журнала. */
function orderTimeline(o){
  const items = [...o.history.map(h => ({ at:h.at, s:h.s, text:t("st_" + h.s) })), ...(o.sent || []).map(x => ({ at:x.at, s:"CONFIRMED", text:tf("tl_doc_sent", { ch:t("doc_ch_" + x.ch), to:x.to }), by:x.by })),
    ...O.audit.filter(e => e.vars?.no === o.no && ["order_edit"].includes(e.action)).map(e => ({ at:e.at, s:"NEW", text:auditText(e), by:staffName(e.staffId) }))];
  return items.sort((a, b) => a.at - b.at);
}
function admRefund(r){
  const x = r.o.refund; if (!x) return "";
  return `<div class="card stack"><span class="lbl">${esc(t(r.a ? (x.done ? "refund_done" : "refund_wait") : (x.done ? "site_refund_done" : "site_refund_wait")))}</span><div class="rows">
    <div><span class="k">${esc(tf("penalty_rate", { p:Math.round(x.rate * 100) }))}</span><span class="v mono">−${fmtUZS(x.penalty)}</span></div>
    <div class="tot"><span class="k">${esc(t(r.a ? "refund_to_balance" : "refund_to_card"))}</span><span class="v">${fmtUZS(x.uzs)}</span></div></div></div>`;
}
PAGES["orders/:src/:id"] = {
  render({ src, id }){
    const r = findOrder(src, id);
    if (!r) return `<div class="page">${backLink("orders", t("an_orders"))}<div class="card empty"><h1 class="h-empty">${esc(t("order_missing"))}</h1></div></div>`;
    const o = r.o, st = effStatus(o), showDoc = ["CONFIRMED", "COMPLETED"].includes(st) || (st === "PAID" && !isCharter(o));
    const req = o.req ? `<div class="reqbanner no-print"><b>${esc(t("req_title"))}: ${esc(t("req_kind_" + o.req.kind))}</b>${o.req.note ? `<span>«${esc(o.req.note)}»</span>` : ""}
      ${o.req.status ? `<span class="small">${esc(t(o.req.status === "done" ? "req_status_done" : "req_status_declined"))}${o.req.reply ? ` — ${esc(o.req.reply)}` : ""} · ${esc(o.req.by || "")}</span>` : ""}</div>` : "";
    return `<div class="page">${backLink("orders", t("an_orders"))}
      <div class="ohead"><span class="oc-ic">${TYPE_ICON[o.type]}</span><div><span class="lbl">${esc(t("doc_" + o.type))} · <span class="mono">${o.no}</span> · ${esc(srcName(r))}</span>
        <h1>${esc(orderTitle(o))}</h1><p class="muted">${esc(orderSub(o))}</p></div>${pill(st)}</div>
      <div class="twocol"><div class="stack">${admActions(r)}${req}
          ${showDoc ? orderDocument(o, r.a ? r.a.brand : null) + docActions(r) : isCharter(o) ? `<div class="card stack"><h3>${esc(t("request_details"))}</h3>${charterVoucherBody(o)}</div>` : ""}</div>
        <aside class="stack sticky">
          <div class="card stack">${admPayment(r)}</div>${admRefund(r)}
          <div class="card stack"><span class="lbl">${esc(r.a ? t("col_source") : t("customer"))}</span>
            ${r.a ? `<div class="client-mini"><span class="bmark-wrap" style="${brandStyle(r.a.brand)}">${brandMark("", r.a.brand)}</span><div class="stack" style="gap:1px;min-width:0"><b>${esc(r.a.name)}</b>
              <span class="small muted">${esc(t("col_client"))}: ${esc(orderClient(r))}</span></div>${can("b2b.view") ? `<a class="link" href="#/agencies/${r.a.id}">${esc(t("open_client"))}</a>` : ""}</div>`
              : `<div class="client-mini"><span class="avatar sm">${esc(monogram(orderClient(r)))}</span><div class="stack" style="gap:1px;min-width:0"><b>${esc(orderClient(r))}</b>
              <span class="mono small muted">${esc(o.contact.phone)}</span>${o.contact.email ? `<span class="small muted">${esc(o.contact.email)}</span>` : ""}</div>${can("clients") ? `<a class="link" href="#/customers/${encodeURIComponent(digits(o.contact.phone))}">${esc(t("open_client"))}</a>` : ""}</div>`}</div>
          ${r.a ? "" : `<div class="card stack">${contactEdit(r)}</div>`}
          <div class="card stack"><span class="lbl">${esc(t("history"))}</span>
            <ol class="timeline">${orderTimeline(o).map(h => `<li><span class="tl-dot st-${h.s}"></span><b>${esc(h.text)}</b><span class="muted small">${esc(fdt(h.at))}${h.by ? " · " + esc(h.by) : ""}</span></li>`).join("")}</ol></div>
        </aside></div></div>`;
  },
  after(){ renderQRs(); if (M.ui.cancelFor) $(".cancelbox")?.scrollIntoView({ block:"nearest", behavior:REDUCED ? "auto" : "smooth" }); }
};
