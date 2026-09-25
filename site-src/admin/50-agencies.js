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
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_agencies"))}</h1><p class="muted">${esc(t("agencies_sub"))}</p></div>
        <button type="button" class="solid" data-act="agnew" ${guard("b2b.create")}>${IC.plus}<span>${esc(t("ag_new"))}</span></button></div>
      ${agForm(null)}
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

/* ---- новое агентство и правка реквизитов ----
   Новое — сразу рабочее, с нулевым балансом: так бывает, когда договор
   подписан в офисе, без заявки с сайта. */
const AG_FIELDS = [["name", "reg_company", 'maxlength="40" autocomplete="off"'], ["legal", "agency_legal", 'maxlength="60" autocomplete="off"'],
  ["inn", "agency_inn", 'inputmode="numeric" maxlength="11" autocomplete="off"'], ["phone", "phone_label", 'type="tel" placeholder="+998" autocomplete="off"'], ["email", "agency_email", 'type="email" autocomplete="off"']];
function agForm(a){
  const d = M.ui.agDraft; if (!d || (a ? d.id !== a.id : d.id)) return "";
  return `<section class="card stack cl-edit" id="agedit"><div class="card-h"><h2>${esc(t(a ? "ag_edit" : "ag_new"))}</h2>
      <button type="button" class="iconbtn" data-act="agclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-2">${AG_FIELDS.map(([k, label, extra]) => `<label class="field"><span>${esc(t(label))}</span><input data-ag="${k}" value="${esc(d[k] || "")}" ${extra}></label>`).join("")}</div>
    <div class="err" id="agerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="agsave">${esc(t(a ? "client_save" : "ag_create"))}</button><button type="button" class="link" data-act="agclose">${esc(t("cancel"))}</button></div></section>`;
}
function agError(d){
  if (d.name.trim().length < 2) return "err_company";
  if (!/^\d{9}$/.test(digits(d.inn))) return "err_inn";
  if (!validPhone(d.phone)) return "err_phone";
  if (!d.email.trim() || !validEmail(d.email.trim())) return "err_email";
  if (agencies().some(x => x.id !== d.id && digits(x.inn) === digits(d.inn))) return "err_ag_inn_dup";
  if (!d.id && loadApps().some(x => x.status === "pending" && digits(x.inn) === digits(d.inn))) return "err_ag_inn_app";
  return null;
}
const fmtInn = v => digits(v).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
Object.assign(ACT, {
  agnew:   () => { if (denied("b2b.create")) return; M.ui.agDraft = { id:null, name:"", legal:"", inn:"", phone:"", email:"" }; rerender(); $("#agedit [data-ag=name]")?.focus(); },
  agedit:  el => { if (denied("b2b.edit")) return; const a = agencyById(el.dataset.v); if (!a) return;
    M.ui.agDraft = { id:a.id, name:a.name, legal:a.legal || "", inn:a.inn || "", phone:a.phone || "", email:a.email || "" }; rerender(); $("#agedit [data-ag=name]")?.focus(); },
  agclose: () => { M.ui.agDraft = null; rerender(); },
  agsave:  () => {
    const d = M.ui.agDraft, e = agError(d); if (e) return showErr("#agerr", t(e));
    const rec = { name:d.name.trim(), legal:d.legal.trim() || d.name.trim(), inn:fmtInn(d.inn), phone:prettyPhone(d.phone), email:d.email.trim() };
    if (d.id) {
      if (denied("b2b.edit")) return;
      // Журнал помнит прежние реквизиты: было → стало по каждому полю.
      change(() => withAgency(d.id, st => {
        const diff = AG_FIELDS.filter(([k]) => (st.agency[k] || "") !== rec[k]).map(([k, label]) => ({ k:label, from:st.agency[k] || "", to:rec[k] }));
        Object.assign(st.agency, rec); audit("ag_edit", { agency:rec.name }, { diff }); }));
    } else {
      if (denied("b2b.create")) return;
      change(() => { O.agencies.push({ id:uid("ag"), agency:{ ...rec, status:"verified", blockReason:"", since:TODAY },
        brand:{ name:rec.name, phone:rec.phone, email:rec.email, address:"", telegram:"", color:"#16275C", logo:null }, balance:0, ledger:[], topups:[], orders:[], notes:[], travellers:[] });
        audit("ag_create", { agency:rec.name }); });
    }
    M.ui.agDraft = null; rerender(); toast(tf(d.id ? "t_ag_edit" : "t_ag_create", { agency:rec.name }));
  },
  /* Сообщение агентству — приходит в колокольчик кабинета. */
  agmsg: el => {
    if (denied("b2b.edit")) return;
    const id = el.dataset.v, text = inp("msg:" + id).trim();
    if (text.length < 3) return toast(t("err_msg"));
    change(() => withAgency(id, st => { note("message", { reason:text, by:me().name }, st); audit("ag_message", { agency:st.agency.name }, { diff:[{ k:"msg_text", from:"", to:text }] }); }));
    if (M.ui.inp) delete M.ui.inp["msg:" + id];
    rerender(); toast(t("t_msg_sent"));
  }
});
document.addEventListener("input", e => { const k = e.target.dataset?.ag; if (k && M.ui.agDraft) M.ui.agDraft[k] = e.target.value; });

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
        ${M.ui.agDraft?.id === a.id ? agForm(a) : `<section class="card stack"><div class="card-h"><h2>${esc(t("ag_details"))}</h2>
            <button type="button" class="link" data-act="agedit" data-v="${a.id}" ${guard("b2b.edit")}>${esc(t("edit"))}</button></div><div class="rows">
          ${row("agency_legal", a.legal)}${row("agency_inn", a.inn, true)}${row("phone_label", a.phone, true)}${row("agency_email", a.email)}${row("agency_since", a.since ? fdateY(a.since) : "")}
          ${row("col_orders30", String(tv.n))}${row("col_sales30", fmtUZS(tv.sum))}</div>
          ${a.live ? `<a class="ghost sm" href="../" target="_blank" rel="noopener">${esc(t("open_cabinet"))}</a>` : ""}</section>`}
        <section class="card stack"><h2>${esc(t("msg_h"))}</h2><p class="muted small">${esc(t("msg_d"))}</p>
          <label class="field"><span>${esc(t("msg_text"))}</span><textarea data-inp="${esc("msg:" + a.id)}" maxlength="300" placeholder="${esc(t("msg_ph"))}" ${can("b2b.edit") ? "" : "disabled"}>${esc(inp("msg:" + a.id))}</textarea></label>
          <div class="row"><button type="button" class="solid sm" data-act="agmsg" data-v="${a.id}" ${guard("b2b.edit")}>${esc(t("msg_send"))}</button></div></section>
        <section class="card stack"><h2>${esc(t("ag_orders"))}</h2>
          ${orders.length ? `<div class="atable" style="--cols:${ORDER_COLS_COMPACT}">${orders.map((o, i) => admOrderRow({ o, a, src:a.id }, i, "", true)).join("")}</div>
            ${can("orders.view") ? `<a class="link" href="#/orders" data-act="agorders" data-v="${a.id}">${esc(t("all_orders"))}</a>` : ""}` : `<p class="muted">${esc(t("orders_empty"))}</p>`}</section>
        <section class="card stack"><h2>${esc(t("statement"))}</h2>
          ${st.ledger.length ? `<div class="atable" style="--cols:118px minmax(0,1fr) 120px 110px">${st.ledger.slice(0, 10).map(l => `<div class="arow">
            <span class="a-cell a-sub muted small">${esc(fdt(l.at))}</span><span class="a-cell a-key">${esc(ledgerLabel(l, st))}</span>
            <span class="a-num a-keep mono ${l.amount > 0 ? "plus" : ""}">${l.amount > 0 ? "+" : "−"}${grp(Math.abs(l.amount))}</span><span class="a-num mono muted">${grp(l.after)}</span></div>`).join("")}</div>` : `<p class="muted">${esc(t("ledger_empty"))}</p>`}</section>
      </div>
      <aside class="stack sticky">
        <div class="card stack"><span class="lbl">${esc(t("balance_now"))}</span><b class="bal-big mono">${grp(st.balance)}<small>${esc(t("cur_uzs"))}</small></b>
          ${pend.length ? `<div class="tasks compact">${pend.map(p => topupRow(p, a)).join("")}</div>` : ""}</div>
        <div class="card stack"><h3>${esc(t("adjust_h"))}</h3><p class="muted small">${esc(t("adjust_d"))}</p>
          <label class="field"><span>${esc(t("topup_amount"))}</span><span class="amt-in">${inpField("adj:" + a.id, { label:t("topup_amount"), ph:t("adjust_amount_ph"), extra:`inputmode="numeric" ${can("finance.manage") ? "" : "disabled"}` })}<i>${esc(t("cur_uzs"))}</i></span></label>
          <label class="field"><span>${esc(t("reason"))}</span>${inpField("adjwhy:" + a.id, { label:t("reason"), ph:t("adjust_ph"), extra:`maxlength="120" ${can("finance.manage") ? "" : "disabled"}` })}</label>
          <div class="row"><button type="button" class="solid sm" data-act="aadjust" data-s="+" data-v="${a.id}" ${guard("finance.manage")}>${IC.plus}<span>${esc(t("adjust_plus"))}</span></button>
            <button type="button" class="ghost sm" data-act="aadjust" data-s="-" data-v="${a.id}" ${guard("finance.manage")}>${esc(t("adjust_minus"))}</button></div></div>
        <div class="card stack"><h3>${esc(t(agencyActiveOf(a) ? "block_h" : "unblock_h"))}</h3><p class="muted small">${esc(t(agencyActiveOf(a) ? "block_d" : "unblock_d"))}</p>
          ${agencyActiveOf(a) ? rejectBoxBlock(blockKey, a.id) : `<button type="button" class="solid sm" data-act="aunblock" data-v="${a.id}" ${guard("b2b.manage")}>${esc(t("unblock_cta"))}</button>`}</div>
      </aside></div></div>`;
  }
};
/* Блокировка — тот же двухшаговый выбор, что и отказ: сначала причина. */
function rejectBoxBlock(key, id){
  if (!M.ui.ask?.[key]) return `<button type="button" class="ghost sm danger-ghost" data-act="aask" data-k="${esc(key)}" ${guard("b2b.manage")}>${esc(t("block_cta"))}</button>`;
  return `<span class="why">${inpField("why:" + key, { label:t("reason"), ph:t("block_ph"), extra:'maxlength="120"' })}
    <button type="button" class="solid sm danger-solid" data-act="ablock" data-v="${id}" ${guard("b2b.manage")}>${esc(t("block_cta"))}</button>
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
