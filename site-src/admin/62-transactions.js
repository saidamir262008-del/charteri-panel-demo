/* ==========================================================================
   Реестр операций: все движения денег в одном списке — пополнения и
   списания агентств, оплаты и возвраты сайта, ручные корректировки. У каждой
   операции: номер (TX-…), дата, клиент или агентство, сумма, вид, статус,
   способ оплаты, сотрудник и полная история. Выгрузка — CSV и Excel.
   Операции собираются из выписок агентств и заказов сайта при показе.
   Знак суммы — для клиента: плюс — деньги ему или на его баланс
   (пополнение, возврат), минус — списание или оплата.
   ========================================================================== */
"use strict";

const TX_KINDS = ["topup", "payment", "order", "refund", "adjust"];
const TX_ST = ["done", "pending", "rejected"];
const txNo = id => "TX-" + (seedFrom(String(id)) >>> 0).toString(36).toUpperCase().padStart(7, "0");
const siteClient = o => o.travellers?.[0] ? `${o.travellers[0].given} ${o.travellers[0].surname}`.trim() : o.contact?.phone || "—";

/* Все операции, новые сверху. ev — история операции для карточки. */
function transactions(){
  const out = [];
  for (const a of agencies()) {
    const st = a.st;
    for (const l of st.ledger) {
      const o = l.orderId ? st.orders.find(x => x.id === l.orderId) : null, tp = l.kind === "topup" ? st.topups.find(p => p.id === l.topupId) : null;
      const ap = O.approvals.find(x => x.status === "executed" && ((l.kind === "refund" && o && x.key === `refund:${a.id}:${o.id}`) || (l.kind === "adjust" && x.kind === "adjust" && x.payload?.aid === a.id && x.payload.amount === l.amount && Math.abs(x.decidedAt - l.at) < 5000)));
      const ev = [
        ...(tp ? [{ at:tp.at, text:tf("tx_ev_request", { m:methodLabel(tp.method) }) }] : []),
        ...(ap ? [{ at:ap.at, text:tf("tx_ev_asked", { name:staffName(ap.by) }) }, { at:ap.decidedAt, text:tf("tx_ev_approved", { name:staffName(ap.decidedBy) }) }] : []),
        { at:l.at, text:tf("tx_ev_posted", { after:fmtUZS(l.after) }) + (tp?.by || l.by ? ` · ${tp?.by || l.by}` : "") }];
      out.push({ id:l.id, at:l.at, kind:l.kind, amount:l.amount, status:"done", method:l.kind === "topup" ? l.method || tp?.method || "" : l.kind === "order" ? "balance" : "",
        who:a.name, whoHref:`#/agencies/${a.id}`, by:tp?.by || l.by || (ap ? staffName(ap.decidedBy) : ""), note:l.reason || "", order:o, src:a.id, ev });
    }
    // Возврат ещё не зачислен — операция ждёт (как у сайта).
    for (const o of st.orders) if (o.refund?.uzs > 0 && !o.refund.done) out.push({ id:"ref-" + o.id, at:o.refund.at, kind:"refund", amount:o.refund.uzs, status:"pending", method:"balance",
      who:a.name, whoHref:`#/agencies/${a.id}`, by:"", note:"", order:o, src:a.id, ev:[{ at:o.refund.at, text:t("tx_ev_cancel") }] });
    for (const p of st.topups) if (p.status !== "done") out.push({ id:p.id, at:p.at, kind:"topup", amount:p.amount, status:p.status, method:p.method, who:a.name, whoHref:`#/agencies/${a.id}`,
      by:p.by || "", note:p.reason || "", src:a.id, ev:[{ at:p.at, text:tf("tx_ev_request", { m:methodLabel(p.method) }) }, ...(p.doneAt ? [{ at:p.doneAt, text:tf("tx_ev_rejected", { name:p.by || "—", reason:p.reason || "" }) }] : [])] });
  }
  for (const o of SITE?.orders || []) {
    const paid = o.history?.find(h => h.s === "PAID");
    if (paid && o.total) out.push({ id:"pay-" + o.id, at:paid.at, kind:"payment", amount:-o.total.uzs, status:"done", method:o.method || "card", who:siteClient(o),
      whoHref:`#/customers/${digits(o.contact?.phone)}`, by:"", note:o.promo ? (o.promo.auto ? tf("promo_auto_line", { name:o.promo.name }) : tf("promo_line", { code:o.promo.code })) : "", order:o, src:"site",
      ev:[{ at:o.createdAt, text:t("tx_ev_order") }, { at:paid.at, text:tf("tx_ev_paid", { m:methodName(o.method || "card") }) }] });
    if (o.refund?.uzs) { const ap = O.approvals.find(x => x.status === "executed" && x.key === `refund:site:${o.id}`);
      out.push({ id:"ref-" + o.id, at:o.refund.at, kind:"refund", amount:o.refund.uzs, status:o.refund.done ? "done" : "pending", method:o.method || "card", who:siteClient(o),
        whoHref:`#/customers/${digits(o.contact?.phone)}`, by:o.refund.by || (ap ? staffName(ap.decidedBy) : ""), note:"", order:o, src:"site",
        ev:[{ at:o.refund.at, text:t("tx_ev_cancel") }, ...(ap ? [{ at:ap.decidedAt, text:tf("tx_ev_approved", { name:staffName(ap.decidedBy) }) }] : []),
          ...(o.refund.done ? [{ at:o.history?.find(h => h.s === "REFUNDED")?.at || o.refund.at, text:t("tx_ev_refunded") }] : [])] }); }
  }
  return out.sort((a, b) => b.at - a.at);
}
const txMethod = x => !x.method ? "—" : x.method === "balance" ? t("tx_m_balance") : ["cash", "bank", "card"].includes(x.method) && x.src !== "site" ? methodLabel(x.method) : methodName(x.method);
function txRows(){
  const k = M.ui.txk || "all", s = M.ui.txs || "all", q = (M.ui.txq || "").trim().toLowerCase(), per = M.ui.txp || "all";
  const since = per === "today" ? new Date().setHours(0, 0, 0, 0) : per === "all" ? 0 : Date.now() - Number(per) * DAY_MS;
  return transactions().filter(x => (k === "all" || x.kind === k) && (s === "all" || x.status === s) && x.at >= since
    && (!q || [txNo(x.id), x.who, x.order?.no || "", x.by, x.note].join(" ").toLowerCase().includes(q)));
}
const txPill = x => `<span class="pill ${x.status === "done" ? "st-CONFIRMED" : x.status === "pending" ? "st-PENDING" : "st-CANCELLED"}">${esc(t("tx_st_" + x.status))}</span>`;
function finTx(){
  const k = M.ui.txk || "all", s = M.ui.txs || "all", per = M.ui.txp || "all", rows = txRows(), shown = rows.slice(0, LEDGER_LIMIT);
  const sums = txSums(rows);
  return `<div class="ofind au-find">
      <select id="txk" class="minisel" aria-label="${esc(t("tx_kind"))}"><option value="all">${esc(t("tx_all_kinds"))}</option>${TX_KINDS.map(x => `<option value="${x}" ${k === x ? "selected" : ""}>${esc(t("tx_k_" + x))}</option>`).join("")}</select>
      <select id="txs" class="minisel" aria-label="${esc(t("col_status"))}"><option value="all">${esc(t("tx_all_st"))}</option>${TX_ST.map(x => `<option value="${x}" ${s === x ? "selected" : ""}>${esc(t("tx_st_" + x))}</option>`).join("")}</select>
      <select id="txp" class="minisel" aria-label="${esc(t("au_period"))}">${AU_PERIODS.map(x => `<option value="${x}" ${per === x ? "selected" : ""}>${esc(t("au_per_" + x))}</option>`).join("")}</select>
      <label class="search">${IC.search}<input id="txq" type="search" value="${esc(M.ui.txq || "")}" placeholder="${esc(t("tx_search"))}" aria-label="${esc(t("tx_search"))}"></label></div>
    <p class="muted small" id="txcount" aria-live="polite">${esc(tf("tx_count", { n:rows.length, ...sums }))}</p><p class="muted small">${esc(t("tx_sign"))}</p>
    <div id="txlist">${txTable(shown)}</div>
    ${rows.length > shown.length ? `<p class="muted small">${esc(tf("shown_of", { n:shown.length, total:rows.length }))}</p>` : ""}`;
}
function txTable(rows){
  if (!rows.length) return `<p class="muted">${esc(t("crm_none_match"))}</p>`;
  return `<div class="atable" style="--cols:118px 128px minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) 150px 120px">
    <div class="arow ahead" aria-hidden="true"><span>${esc(t("tx_no"))}</span><span>${esc(t("col_date"))}</span><span>${esc(t("tx_who"))}</span><span>${esc(t("tx_kind"))}</span>
      <span>${esc(t("tx_method"))}</span><span class="a-num">${esc(t("col_amount"))}</span><span class="a-end">${esc(t("col_status"))}</span></div>
    ${rows.map(x => `<a class="arow" href="#/finance/tx/${encodeURIComponent(x.id)}"><span class="a-cell mono small">${esc(txNo(x.id))}</span><span class="a-cell a-sub muted small">${esc(fdt(x.at))}</span>
      <span class="a-main"><b>${esc(x.who)}</b><span class="small muted">${esc(x.order?.no || x.note || "")}</span></span><span class="a-cell small">${esc(t("tx_k_" + x.kind))}</span>
      <span class="a-cell small">${esc(txMethod(x))}</span><span class="a-num a-keep mono ${x.amount > 0 ? "plus" : ""}">${x.amount > 0 ? "+" : "−"}${grp(Math.abs(x.amount))}</span>
      <span class="a-end">${txPill(x)}</span></a>`).join("")}</div>`;
}
const txRefresh = () => { const l = $("#txlist"); if (!l) return; const rows = txRows(); l.innerHTML = txTable(rows.slice(0, LEDGER_LIMIT));
  const c = $("#txcount"); if (c) c.textContent = tf("tx_count", { n:rows.length, ...txSums(rows) }); };
/* Итоги проведённых: в пользу клиентов (плюс) и списано или оплачено (минус). */
const txSums = rows => { const d = rows.filter(x => x.status === "done");
  return { plus:fmtUZS(d.filter(x => x.amount > 0).reduce((a, x) => a + x.amount, 0)), minus:fmtUZS(-d.filter(x => x.amount < 0).reduce((a, x) => a + x.amount, 0)) }; };
document.addEventListener("input", e => { if (e.target.id === "txq") { M.ui.txq = e.target.value; txRefresh(); } });
document.addEventListener("change", e => { const k = { txk:"txk", txs:"txs", txp:"txp" }[e.target.id]; if (k) { M.ui[k] = e.target.value; txRefresh(); } });

/* ---- карточка операции ---- */
PAGES["finance/tx/:id"] = {
  render({ id }){
    const x = transactions().find(y => y.id === decodeURIComponent(id));
    if (!x) return `<div class="page">${backLink("finance", t("an_finance"))}<div class="card empty"><h1 class="h-empty">${esc(t("tx_missing"))}</h1></div></div>`;
    const row = (k, v, mono) => `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${v || "—"}</span></div>`;
    return `<div class="page narrow-page">${backLink("finance", t("an_finance"))}
      <div class="ohead"><span class="oc-ic">${IC.wallet}</span><div><span class="lbl mono">${esc(txNo(x.id))}</span><h1>${esc(t("tx_k_" + x.kind))} · ${x.amount > 0 ? "+" : "−"}${esc(fmtUZS(Math.abs(x.amount)))}</h1>
        <p class="muted">${esc(fdt(x.at))}</p></div>${txPill(x)}</div>
      <div class="stack">
        <section class="card stack"><div class="rows">
          ${row("tx_no", esc(txNo(x.id)), true)}${row("col_date", esc(fdt(x.at)))}${row("tx_who", `<a class="link" href="${x.whoHref}">${esc(x.who)}</a>`)}
          ${row("col_amount", esc((x.amount > 0 ? "+" : "−") + fmtUZS(Math.abs(x.amount))), true)}${row("tx_kind", esc(t("tx_k_" + x.kind)))}${row("col_status", esc(t("tx_st_" + x.status)))}
          ${row("tx_method", esc(txMethod(x)))}${row("tx_staff", esc(x.by))}${x.order ? row("booking_ref", `<a class="link mono" href="#/orders/${x.src}/${x.order.id}">${esc(x.order.no)}</a>`) : ""}
          ${x.note ? row("reason", esc(x.note)) : ""}</div></section>
        <section class="card stack"><h2>${esc(t("crm_history"))}</h2>
          <ol class="timeline">${[...x.ev].sort((a, b) => a.at - b.at).map(e => `<li><span class="tl-dot st-CONFIRMED"></span><b>${esc(e.text)}</b><span class="muted small">${esc(fdt(e.at))}</span></li>`).join("")}</ol></section>
      </div></div>`;
  }
};

/* ---- выгрузка ----
   Excel — таблица XML (SpreadsheetML): открывается в Excel без мастера,
   текст остаётся текстом (формулы не выполняются). */
const xmlEsc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);
function xlsDownload(rows, name){
  const cell = v => typeof v === "number" ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`
    + `<Worksheet ss:Name="Charteri"><Table>${rows.map(r => `<Row>${r.map(cell).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
  const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(new Blob([xml], { type:"application/vnd.ms-excel" })), download:`charteri-${name}-${TODAY}.xls` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const txExportRows = () => [[t("tx_no"), t("col_date"), t("tx_who"), t("tx_kind"), t("tx_method"), t("col_amount"), t("col_status"), t("tx_staff"), t("booking_ref"), t("reason")],
  ...txRows().map(x => [txNo(x.id), new Date(x.at).toLocaleString(LOC[S.lang]), x.who, t("tx_k_" + x.kind), txMethod(x), x.amount, t("tx_st_" + x.status), x.by, x.order?.no || "", x.note])];
Object.assign(ACT, {
  txcsv: () => { if (denied("finance.export")) return; csvDownload(txExportRows(), "transactions"); change(() => audit("export", { what:strRef("fin_tx_csv") }, { module:"finance" })); },
  txxls: () => { if (denied("finance.export")) return; xlsDownload(txExportRows(), "transactions"); change(() => audit("export", { what:strRef("fin_tx_xls") }, { module:"finance" })); }
});
