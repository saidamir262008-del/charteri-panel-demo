/* ==========================================================================
   Деньги: пополнения всех агентств, общая выписка, доход Charteri от сбора,
   возвраты. Выгрузка CSV — для бухгалтерии.
   ========================================================================== */
"use strict";

const FIN_TABS = ["topups", "ledger", "revenue", "refunds"];
const LEDGER_LIMIT = 200;

function finTopups(){
  const f = M.ui.ftop || "pending";
  const rows = agencies().flatMap(a => a.st.topups.map(p => ({ p, a }))).filter(x => f === "all" || x.p.status === f).sort((x, y) => y.p.at - x.p.at);
  const chips = `<div class="chipbar">${["pending", "done", "rejected", "all"].map(k => `<button type="button" class="chip" data-act="ftop" data-v="${k}" aria-pressed="${f === k}">${esc(t("tu_" + k))}</button>`).join("")}</div>`;
  if (!rows.length) return chips + (f === "pending" ? `<p class="calm">${IC.ok}<span>${esc(t("tk_clear"))}</span></p>` : `<p class="muted">${esc(t("tu_none"))}</p>`);
  return chips + `<div class="tasks">${rows.map(({ p, a }) => p.status === "pending" ? topupRow(p, a) : `<div class="task"><span class="task-ic">${IC.wallet}</span>
    <span class="task-main"><b>${esc(a.name)}</b><span class="muted small">${esc(methodLabel(p.method))} · ${esc(fdt(p.at))}${p.by ? ` · ${esc(p.by)}` : ""}${p.reason ? ` · «${esc(p.reason)}»` : ""}</span></span>
    <b class="task-amt mono">+${esc(fmtUZS(p.amount))}</b><span class="task-act">${p.status === "done" ? `<span class="pill st-CONFIRMED">${esc(t("tu_done"))}</span>` : `<span class="pill st-CANCELLED">${esc(t("tu_rejected"))}</span>`}</span></div>`).join("")}</div>`;
}
function ledgerAll(){
  const k = M.ui.fled || "all";
  return agencies().flatMap(a => a.st.ledger.map(l => ({ l, a }))).filter(x => k === "all" || x.l.kind === k).sort((x, y) => y.l.at - x.l.at);
}
function finLedger(){
  const k = M.ui.fled || "all", rows = ledgerAll(), shown = rows.slice(0, LEDGER_LIMIT);
  return `<div class="chipbar">${["all", "topup", "order", "refund", "adjust"].map(x => `<button type="button" class="chip" data-act="fled" data-v="${x}" aria-pressed="${k === x}">${esc(t("fl_" + x))}</button>`).join("")}</div>
    <div class="atable" style="--cols:150px minmax(0,1.2fr) minmax(0,1.6fr) 150px 150px" role="table" aria-label="${esc(t("statement"))}">
      <div class="arow ahead" role="row">${["col_date", "col_agency", "col_operation"].map(c => `<span role="columnheader">${esc(t(c))}</span>`).join("")}
        <span class="a-num" role="columnheader">${esc(t("col_amount"))}</span><span class="a-num" role="columnheader">${esc(t("col_after"))}</span></div>
      ${shown.map(({ l, a }) => `<div class="arow" role="row"><span class="a-cell a-sub muted small" role="cell">${esc(fdt(l.at))}</span><span class="a-cell a-sub" role="cell">${esc(a.name)}</span>
        <span class="a-cell a-key" role="cell">${esc(ledgerLabel(l, a.st))}</span><span class="a-num a-keep mono ${l.amount > 0 ? "plus" : ""}" role="cell">${l.amount > 0 ? "+" : "−"}${grp(Math.abs(l.amount))}</span>
        <span class="a-num mono muted" role="cell">${grp(l.after)}</span></div>`).join("")}</div>
    ${rows.length > shown.length ? `<p class="muted small">${esc(tf("shown_of", { n:shown.length, total:rows.length }))}</p>` : ""}`;
}
/* Доход — сбор оплаченных заказов агентств: по услугам и по агентствам,
   за текущий месяц и за всё время. Продажи — стоимость услуг без сбора. */
function revenue(){
  const month = TODAY.slice(0, 7), rows = { month:{}, all:{} }, byAg = [];
  for (const a of agencies()) {
    let agFee = 0, agSales = 0;
    for (const o of a.st.orders) {
      if (!o.paidAt || !o.total) continue;
      const fee = o.fee?.uzs || 0, sales = o.total.uzs;
      for (const [p, ok] of [["all", true], ["month", ymd(new Date(o.paidAt)).startsWith(month)]]) {
        if (!ok) continue; const r = rows[p][o.type] ||= { n:0, sales:0, fee:0 }; r.n++; r.sales += sales; r.fee += fee;
      }
      agFee += fee; agSales += sales;
    }
    byAg.push({ a, fee:agFee, sales:agSales });
  }
  return { rows, byAg:byAg.sort((x, y) => y.fee - x.fee) };
}
function finRevenue(){
  const { rows, byAg } = revenue(), types = ["FLIGHT", "TOUR", "HOTEL", "JET", "HELI"];
  const table = p => { const tot = types.reduce((s, k) => { const r = rows[p][k]; if (r) { s.n += r.n; s.sales += r.sales; s.fee += r.fee; } return s; }, { n:0, sales:0, fee:0 });
    return `<div class="atable" style="--cols:minmax(0,1.6fr) 90px minmax(0,1.3fr) minmax(0,1.2fr)" role="table" aria-label="${esc(t(p === "month" ? "rev_month" : "rev_all"))}">
      <div class="arow ahead" role="row"><span role="columnheader">${esc(t("col_service"))}</span><span class="a-num" role="columnheader">${esc(t("an_orders"))}</span>
        <span class="a-num" role="columnheader">${esc(t("col_sales"))}</span><span class="a-num" role="columnheader">${esc(t("col_fee"))}</span></div>
      ${types.map(k => { const r = rows[p][k] || { n:0, sales:0, fee:0 }; return `<div class="arow" role="row"><span class="a-cell a-key" role="cell">${esc(t("type_" + k))}</span>
        <span class="a-num mono" role="cell">${r.n}</span><span class="a-num mono" role="cell">${fmtUZS(r.sales)}</span><span class="a-num a-keep mono" role="cell">${fmtUZS(r.fee)}</span></div>`; }).join("")}
      <div class="arow total" role="row"><b class="a-key" role="cell">${esc(t("total"))}</b><span class="a-num mono" role="cell">${tot.n}</span><b class="a-num mono" role="cell">${fmtUZS(tot.sales)}</b><b class="a-num a-keep mono" role="cell">${fmtUZS(tot.fee)}</b></div></div>`; };
  return `<div class="rev-grid"><div class="stack"><h3>${esc(t("rev_month"))}</h3>${table("month")}</div><div class="stack"><h3>${esc(t("rev_all"))}</h3>${table("all")}</div></div>
    <h3 class="subh">${esc(t("rev_by_agency"))}</h3>
    <div class="atable" style="--cols:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1.2fr)">${byAg.map(x => `<div class="arow"><span class="a-cell a-key">${esc(x.a.name)}</span>
      <span class="a-num mono">${fmtUZS(x.sales)}</span><span class="a-num a-keep mono">${fmtUZS(x.fee)}</span></div>`).join("")}</div>
    <p class="muted small">${esc(t("rev_note"))}</p>`;
}
function refundRows(){ return allOrders().filter(r => r.o.refund).sort((x, y) => y.o.refund.at - x.o.refund.at); }
function finRefunds(){
  const rows = refundRows();
  if (!rows.length) return `<p class="muted">${esc(t("refunds_none"))}</p>`;
  return `<div class="atable" style="--cols:150px minmax(0,1.8fr) minmax(0,1.2fr) 130px 130px 150px">
    <div class="arow ahead" aria-hidden="true">${["col_date", "col_service", "col_source"].map(c => `<span>${esc(t(c))}</span>`).join("")}
      <span class="a-num">${esc(t("col_penalty"))}</span><span class="a-num">${esc(t("col_refund"))}</span><span class="a-end">${esc(t("col_status"))}</span></div>
    ${rows.map(r => `<a class="arow" href="#/orders/${r.src}/${r.o.id}"><span class="a-cell a-sub muted small">${esc(fdt(r.o.refund.at))}</span>
      <span class="a-main"><b>${esc(orderTitle(r.o))}</b><span class="mono">${r.o.no}</span></span><span class="a-cell">${esc(srcName(r))}</span>
      <span class="a-num mono"><span class="sr-only">${esc(t("col_penalty"))}: </span>−${grp(r.o.refund.penalty)}</span><span class="a-num a-keep mono"><span class="sr-only">${esc(t("col_refund"))}: </span>${grp(r.o.refund.uzs)}</span>
      <span class="a-end">${r.o.refund.done ? `<span class="pill st-CONFIRMED">${esc(t("refund_credited"))}</span>` : `<span class="pill st-PENDING">${esc(t("refund_pending"))}</span>`}</span></a>`).join("")}</div>`;
}
PAGES.finance = {
  render(){
    const tab = FIN_TABS.includes(M.ui.ftab) ? M.ui.ftab : "topups";
    const body = { topups:finTopups, ledger:finLedger, revenue:finRevenue, refunds:finRefunds }[tab]();
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_finance"))}</h1><p class="muted">${esc(t("finance_sub"))}</p></div>
        ${tab !== "topups" ? `<button type="button" class="ghost sm" data-act="fcsv" ${guard("finance.export")}>${IC.doc}<span>${esc(t("download_csv"))}</span></button>` : ""}</div>
      ${seg("ftab", FIN_TABS.map(k => [k, t("fin_" + k)]), tab)}
      <section class="card stack" style="margin-top:16px">${body}</section></div>`;
  }
};
Object.assign(ACT, {
  ftab: el => { M.ui.ftab = el.dataset.v; rerender(); },
  ftop: el => { M.ui.ftop = el.dataset.v; rerender(); },
  fled: el => { M.ui.fled = el.dataset.v; rerender(); },
  /* CSV с BOM и «;» — так Excel в русской локали открывает его без мастера импорта. */
  fcsv: () => {
    if (denied("finance.export")) return;
    const tab = M.ui.ftab || "topups", when = ms => new Date(ms).toLocaleString(LOC[S.lang]);
    let rows;
    if (tab === "ledger") rows = [[t("col_date"), t("col_agency"), t("col_operation"), t("col_amount"), t("col_after")], ...ledgerAll().map(({ l, a }) => [when(l.at), a.name, ledgerLabel(l, a.st), l.amount, l.after])];
    else if (tab === "refunds") rows = [[t("col_date"), t("booking_ref"), t("col_service"), t("col_source"), t("col_penalty"), t("col_refund"), t("col_status")],
      ...refundRows().map(r => [when(r.o.refund.at), r.o.no, orderTitle(r.o), srcName(r), r.o.refund.penalty, r.o.refund.uzs, t(r.o.refund.done ? "refund_credited" : "refund_pending")])];
    else { const { rows:rv } = revenue(); rows = [[t("col_service"), t("rev_month") + ": " + t("col_sales"), t("rev_month") + ": " + t("col_fee"), t("rev_all") + ": " + t("col_sales"), t("rev_all") + ": " + t("col_fee")],
      ...["FLIGHT", "TOUR", "HOTEL", "JET", "HELI"].map(k => [t("type_" + k), rv.month[k]?.sales || 0, rv.month[k]?.fee || 0, rv.all[k]?.sales || 0, rv.all[k]?.fee || 0])]; }
    const blob = new Blob([csvText(rows)], { type:"text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:`charteri-${tab}-${TODAY}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    change(() => audit("export", { what:strRef("fin_" + tab) }));
  }
});
