/* ==========================================================================
   Агентства: список с балансом и оборотом, заявки на подключение, карточка
   агентства — реквизиты, блокировка с причиной, ручная корректировка баланса,
   ожидающие пополнения, последние проводки и заказы.
   ========================================================================== */
"use strict";

const AG_COLS = "minmax(0,2.2fr) 150px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) 130px";
const turnover30 = a => { const since = Date.now() - 30 * DAY_MS; let n = 0, sum = 0;
  for (const o of a.st.orders) if (o.paidAt && o.paidAt >= since && o.total) { n++; sum += o.total.uzs; } return { n, sum }; };
const agPill = a => agencyActiveOf(a) ? `<span class="pill st-CONFIRMED">${esc(t("ag_active"))}</span>` : `<span class="pill st-REFUNDED">${esc(t("agency_blocked"))}</span>`;

PAGES.agencies = {
  render(){
    const tab = M.ui.agTab || "list", apps = loadApps(), pending = apps.filter(x => x.status === "pending");
    const list = agencies();
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_agencies"))}</h1><p class="muted">${esc(t("agencies_sub"))}</p></div>
      ${seg("agtab", [["list", t("ag_tab_list")], ["apps", t("ag_tab_apps") + (pending.length ? ` · ${pending.length}` : "")]], tab)}
      <div class="card stack" style="margin-top:16px">${tab === "list" ? `<div class="atable" style="--cols:${AG_COLS}">
        <div class="arow ahead" aria-hidden="true"><span>${esc(t("col_agency"))}</span><span>${esc(t("col_status"))}</span><span class="a-num">${esc(t("balance_now"))}</span>
          <span class="a-num">${esc(t("col_orders30"))}</span><span class="a-num">${esc(t("col_sales30"))}</span><span class="a-end">${esc(t("col_since"))}</span></div>
        ${list.map((a, i) => { const tv = turnover30(a); return `<a class="arow" style="--i:${i}" href="#/agencies/${a.id}">
          <span class="a-main a-with-mark"><span class="bmark-wrap" style="${brandStyle(a.brand)}">${brandMark("", a.brand)}</span><span class="stack" style="gap:1px;min-width:0"><b>${esc(a.name)}</b>
            <span class="muted small">${a.live ? esc(t("ag_live")) : `${esc(t("req_inn"))} <span class="mono">${esc(a.inn)}</span>`}</span></span></span>
          <span>${agPill(a)}</span><span class="a-num a-keep mono ${a.st.balance < 5_000_000 ? "warn-t" : ""}">${fmtUZS(a.st.balance)}</span>
          <span class="a-num mono">${tv.n}</span><span class="a-num mono">${fmtUZS(tv.sum)}</span><span class="a-end muted">${esc(fdate(a.since))}</span></a>`; }).join("")}</div>`
        : `${pending.length ? `<div class="tasks">${pending.map(appRow).join("")}</div>` : `<p class="calm">${IC.ok}<span>${esc(t("tk_clear"))}</span></p>`}
          ${apps.some(x => x.status !== "pending") ? `<h3 class="subh">${esc(t("apps_decided"))}</h3><div class="atable" style="--cols:minmax(0,2fr) minmax(0,1fr) minmax(0,2fr) 130px">
            ${apps.filter(x => x.status !== "pending").map(x => `<div class="arow"><span class="a-main"><b>${esc(x.company)}</b><span class="muted small mono">${esc(x.inn)}</span></span>
              <span>${x.status === "approved" ? `<span class="pill st-CONFIRMED">${esc(t("app_approved"))}</span>` : `<span class="pill st-CANCELLED">${esc(t("app_rejected"))}</span>`}</span>
              <span class="a-cell muted small">${esc(x.reason || "")}${x.by ? ` · ${esc(x.by)}` : ""}</span><span class="a-end muted small">${esc(fdt(x.decidedAt || x.at))}</span></div>`).join("")}</div>` : ""}`}
      </div></div>`;
  }
};
ACT.agtab = el => { M.ui.agTab = el.dataset.v; rerender(); };

PAGES["agencies/:id"] = {
  render({ id }){
    const a = agencyById(id);
    if (!a) return `<div class="page">${backLink("agencies", t("an_agencies"))}<div class="card empty"><h1 class="h-empty">${esc(t("ag_missing"))}</h1></div></div>`;
    const st = a.st, pend = st.topups.filter(p => p.status === "pending"), tv = turnover30(a), orders = st.orders.slice(0, 8);
    const row = (k, v, mono = false) => v ? `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${esc(v)}</span></div>` : "";
    const blockKey = "b" + a.id;
    return `<div class="page">${backLink("agencies", t("an_agencies"))}
      <div class="ohead"><span class="bmark-wrap big" style="${brandStyle(a.brand)}">${brandMark("", a.brand)}</span><div><span class="lbl">${esc(a.live ? t("ag_live") : t("col_agency"))}</span>
        <h1>${esc(a.name)}</h1><p class="muted">${esc(a.legal || "")}</p></div>${agPill(a)}</div>
      ${agencyActiveOf(a) ? "" : `<div class="blockbar inline">${IC.lock}<span>${esc(tf("ag_blocked_why", { reason:blockReasonOf(a) || "—" }))}</span></div>`}
      <div class="twocol"><div class="stack">
        <section class="card stack"><h2>${esc(t("ag_details"))}</h2><div class="rows">
          ${row("agency_inn", a.inn, true)}${row("phone_label", a.phone, true)}${row("agency_email", a.email)}${row("agency_since", a.since ? fdateY(a.since) : "")}
          ${row("col_orders30", String(tv.n))}${row("col_sales30", fmtUZS(tv.sum))}</div>
          ${a.live ? `<a class="ghost sm" href="../" target="_blank" rel="noopener">${esc(t("open_cabinet"))}</a>` : ""}</section>
        <section class="card stack"><h2>${esc(t("ag_orders"))}</h2>
          ${orders.length ? `<div class="atable" style="--cols:${ORDER_COLS_COMPACT}">${orders.map((o, i) => admOrderRow({ o, a, src:a.id }, i, "", true)).join("")}</div>
            ${can("orders") ? `<a class="link" href="#/orders" data-act="agorders" data-v="${a.id}">${esc(t("all_orders"))}</a>` : ""}` : `<p class="muted">${esc(t("orders_empty"))}</p>`}</section>
        <section class="card stack"><h2>${esc(t("statement"))}</h2>
          ${st.ledger.length ? `<div class="atable" style="--cols:118px minmax(0,1fr) 120px 110px">${st.ledger.slice(0, 10).map(l => `<div class="arow">
            <span class="a-cell a-sub muted small">${esc(fdt(l.at))}</span><span class="a-cell a-key">${esc(ledgerLabel(l, st))}</span>
            <span class="a-num a-keep mono ${l.amount > 0 ? "plus" : ""}">${l.amount > 0 ? "+" : "−"}${grp(Math.abs(l.amount))}</span><span class="a-num mono muted">${grp(l.after)}</span></div>`).join("")}</div>` : `<p class="muted">${esc(t("ledger_empty"))}</p>`}</section>
      </div>
      <aside class="stack sticky">
        <div class="card stack"><span class="lbl">${esc(t("balance_now"))}</span><b class="bal-big mono">${grp(st.balance)}<small>${esc(t("cur_uzs"))}</small></b>
          ${pend.length ? `<div class="tasks compact">${pend.map(p => topupRow(p, a)).join("")}</div>` : ""}</div>
        <div class="card stack"><h3>${esc(t("adjust_h"))}</h3><p class="muted small">${esc(t("adjust_d"))}</p>
          <label class="field"><span>${esc(t("topup_amount"))}</span><span class="amt-in">${inpField("adj:" + a.id, { label:t("topup_amount"), ph:t("adjust_amount_ph"), extra:`inputmode="numeric" ${can("balance.adjust") ? "" : "disabled"}` })}<i>${esc(t("cur_uzs"))}</i></span></label>
          <label class="field"><span>${esc(t("reason"))}</span>${inpField("adjwhy:" + a.id, { label:t("reason"), ph:t("adjust_ph"), extra:`maxlength="120" ${can("balance.adjust") ? "" : "disabled"}` })}</label>
          <div class="row"><button type="button" class="solid sm" data-act="aadjust" data-s="+" data-v="${a.id}" ${guard("balance.adjust")}>${IC.plus}<span>${esc(t("adjust_plus"))}</span></button>
            <button type="button" class="ghost sm" data-act="aadjust" data-s="-" data-v="${a.id}" ${guard("balance.adjust")}>${esc(t("adjust_minus"))}</button></div></div>
        <div class="card stack"><h3>${esc(t(agencyActiveOf(a) ? "block_h" : "unblock_h"))}</h3><p class="muted small">${esc(t(agencyActiveOf(a) ? "block_d" : "unblock_d"))}</p>
          ${agencyActiveOf(a) ? rejectBoxBlock(blockKey, a.id) : `<button type="button" class="solid sm" data-act="aunblock" data-v="${a.id}" ${guard("agencies.block")}>${esc(t("unblock_cta"))}</button>`}</div>
      </aside></div></div>`;
  }
};
/* Блокировка — тот же двухшаговый выбор, что и отказ: сначала причина. */
function rejectBoxBlock(key, id){
  if (!M.ui.ask?.[key]) return `<button type="button" class="ghost sm danger-ghost" data-act="aask" data-k="${esc(key)}" ${guard("agencies.block")}>${esc(t("block_cta"))}</button>`;
  return `<span class="why">${inpField("why:" + key, { label:t("reason"), ph:t("block_ph"), extra:'maxlength="120"' })}
    <button type="button" class="solid sm danger-solid" data-act="ablock" data-v="${id}" ${guard("agencies.block")}>${esc(t("block_cta"))}</button>
    <button type="button" class="link" data-act="aask" data-k="${esc(key)}">${esc(t("cancel"))}</button></span>`;
}
/* Проводка словами: как в выписке кабинета, но для любого агентства. */
function ledgerLabel(l, st){
  const o = l.orderId && st.orders.find(x => x.id === l.orderId);
  const m = l.method || "bank";
  if (l.kind === "topup") return `${t("led_topup")} · ${t("topup_m_" + m)}`;
  if (l.kind === "adjust") return tf("led_adjust", { reason:l.reason || "" });
  return tf(l.kind === "refund" ? "led_refund" : "led_order", { no:o ? o.no : "—" });
}
ACT.agorders = el => { M.ui.aosrc = el.dataset.v; M.ui.aog = "all"; go("orders"); };
