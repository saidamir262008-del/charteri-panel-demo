/* ==========================================================================
   Пассажиры сайта (B2C): список с сегментами и единая карточка клиента —
   контакты, источник, ответственный, заявки и лиды, заказы и платежи,
   комментарии, задачи, история. Блокировка закрывает бронирование на сайте
   для этого номера (список BLOCK_KEY читает сайт).
   ========================================================================== */
"use strict";

const noSite = () => `<div class="card empty"><h3>${esc(t("site_none"))}</h3><p class="muted">${esc(t("site_none_d"))}</p>
  <a class="solid" href="../b2c/" target="_blank" rel="noopener">${esc(t("open_site"))}</a></div>`;

function custRows(){
  const sg = M.ui.bsg || "all", q = (M.ui.bq || "").trim().toLowerCase();
  return b2cClients().filter(c => (sg === "all" || c.segment === sg) && (!q || [c.name, c.phone, c.email].join(" ").toLowerCase().includes(q)));
}
PAGES.customers = {
  render(){
    const sg = M.ui.bsg || "all";
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_customers"))}</h1><p class="muted">${esc(t("customers_sub"))}</p></div>
        <button type="button" class="solid" data-act="cnew" ${can("crm.create") || can("b2c.edit") ? "" : guard("b2c.edit")}>${IC.plus}<span>${esc(t("cust_new"))}</span></button></div>
      ${M.ui.cDraft && !M.ui.cDraft.key ? custForm() : ""}
      ${!SITE && !b2cClients().length ? noSite() : `<div class="card stack"><div class="ofind au-find">
          <select id="bsg" class="minisel" aria-label="${esc(t("crm_segment"))}"><option value="all">${esc(t("crm_all_segments"))}</option>${SEGMENTS.map(x => `<option value="${x}" ${sg === x ? "selected" : ""}>${esc(t("seg_" + x))}</option>`).join("")}</select>
          <label class="search">${IC.search}<input id="bq" type="search" value="${esc(M.ui.bq || "")}" placeholder="${esc(t("crm_search_c"))}" aria-label="${esc(t("crm_search_c"))}"></label>
          <button type="button" class="ghost sm" data-act="bcsv" ${guard("b2c.export")}>${IC.doc}<span>${esc(t("download_csv"))}</span></button></div>
        <p class="muted small" id="bcount" aria-live="polite">${esc(tf("crm_count", { n:custRows().length }))}</p>
        <div id="blist">${clientTable(custRows(), t("an_customers"), false)}</div></div>`}</div>`;
  },
  after(){ if (M.ui.cDraft && M.ui.cFocus) { $("#cedit [data-cf=name]")?.focus(); M.ui.cFocus = false; } crmSync(); }
};

/* ---- новый клиент и правка контактов ---- */
const CUST_FIELDS = [["name", "crm_name"], ["phone", "phone_label"], ["email", "agency_email"], ["country", "crm_country"], ["source", "crm_source"]];
const canEditClient = () => can("b2c.edit") || can("crm.edit");
function custForm(){
  const d = M.ui.cDraft; if (!d) return "";
  const f = (k, label, attrs = "") => `<label class="field"><span>${esc(t(label))}</span><input data-cf="${k}" value="${esc(d[k])}" ${attrs}></label>`;
  return `<section class="card stack cl-edit" id="cedit" aria-labelledby="cedit-h"><div class="card-h"><h2 id="cedit-h">${esc(t(d.key ? "cust_edit" : "cust_new"))}</h2>
      <button type="button" class="iconbtn" data-act="cclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">${f("name", "crm_name", 'maxlength="60" autocomplete="off"')}${f("phone", "phone_label", `type="tel" placeholder="+998" autocomplete="off" ${d.key ? "readonly" : ""}`)}
      ${f("email", "agency_email", 'type="email" maxlength="80" autocomplete="off"')}${f("country", "crm_country", 'maxlength="40" autocomplete="off"')}
      <label class="field"><span>${esc(t("crm_source"))}</span><select data-cf="source">${LEAD_SOURCES.filter(x => !AUTO_SOURCES.includes(x) || x === d.source).map(x => `<option value="${x}" ${d.source === x ? "selected" : ""}>${esc(t("src_" + x))}</option>`).join("")}</select></label></div>
    <div class="err" id="cerr2" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="csave">${esc(t(d.key ? "st_save" : "cust_create"))}</button><button type="button" class="link" data-act="cclose">${esc(t("cancel"))}</button></div></section>`;
}
function saveClient(){
  const d = M.ui.cDraft; if (!d) return;
  if (!canEditClient()) return toast(t("no_rights"));
  const bad = d.name.trim().length < 2 ? ["err_name_short", "name"] : !validPhone(d.phone) ? ["err_phone", "phone"] : d.email.trim() && !validEmail(d.email.trim()) ? ["err_email", "email"]
    : !d.key && b2cClients().some(c => c.key === digits(d.phone)) ? ["err_cust_dup", "phone"] : null;
  $$("#cedit [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (bad) { const f = $(`#cedit [data-cf="${bad[1]}"]`); f?.setAttribute("aria-invalid", "true"); f?.setAttribute("aria-describedby", "cerr2"); showErr("#cerr2", t(bad[0])); f?.focus({ preventScroll:true }); return; }
  const key = d.key || digits(d.phone), c0 = clientByKey(key), target = "c:" + key;
  const rec = { name:d.name.trim().replace(/\s+/g, " "), email:d.email.trim(), country:d.country.trim(), source:LEAD_SOURCES.includes(d.source) ? d.source : "other" };
  change(() => {
    const r = clientRec(target), diff = CUST_FIELDS.filter(([k]) => k !== "phone" && (c0 ? c0[k] : "") !== rec[k])
      .map(([k, label]) => ({ k:label, from:k === "source" ? (c0 ? strRef("src_" + c0.source) : "") : c0?.[k] || "", to:k === "source" ? strRef("src_" + rec.source) : rec[k] }));
    Object.assign(r, rec, { phone:prettyPhone(d.phone) }); if (!r.at) r.at = Date.now();
    r.events.unshift({ at:Date.now(), by:me().id, type:c0 ? "edit" : "created" });
    audit(c0 ? "client_edit" : "client_new", { name:rec.name }, { module:"b2c", diff });
  });
  M.ui.cDraft = null;
  if (d.key) { rerender(); toast(t("t_client_saved")); } else { toast(tf("t_client_new", { name:rec.name })); go("customers/" + key); }
}

/* ---- карточка клиента ---- */
function clientPayments(c){
  const rows = [];
  for (const o of c.orders) {
    if (orderPaid(o) && o.total) rows.push({ at:o.history?.find(h => h.s === "PAID")?.at || o.createdAt, o, kind:"pay", uzs:o.total.uzs });
    if (o.refund?.done) rows.push({ at:o.refund.at, o, kind:"refund", uzs:o.refund.uzs });
  }
  return rows.sort((a, b) => b.at - a.at);
}
/* История клиента: события CRM, этапы его лидов, статусы заказов. */
function clientHistory(c){
  const items = [
    ...(clientData("c:" + c.key)?.events || []).map(e => ({ at:e.at, by:e.by, text:e.type === "block" ? tf("ce_block", { reason:e.reason || "" }) : e.type === "unblock" ? t("ce_unblock")
      : e.type === "assign" ? tf("le_assign", { name:e.to ? staffName(e.to) : t("crm_nobody") }) : e.type === "created" ? t("ce_created") : t("ce_edit") })),
    ...c.leads.flatMap(l => l.events.filter(e => e.type === "status" || e.type === "created").map(e => ({ at:e.at, by:e.by, sys:e.sys,
      text:`${l.no}: ${e.type === "created" ? tf("le_created", { src:t("src_" + l.source) }) : tf("le_status", { from:t("ls_" + e.from), to:t("ls_" + e.to) })}` }))),
    ...c.orders.flatMap(o => (o.history || []).map(h => ({ at:h.at, by:null, sys:true, text:`${o.no}: ${t("st_" + h.s)}` })))
  ].sort((a, b) => b.at - a.at).slice(0, 60);
  return items.length ? `<ol class="feed">${items.map(x => `<li><span class="feed-dot" aria-hidden="true"></span><span class="stack" style="gap:2px"><span>${esc(x.text)}</span>
    <span class="muted small">${esc(x.by ? staffName(x.by) : t("le_system"))} · ${esc(fdt(x.at))}</span></span></li>`).join("")}</ol>` : `<p class="muted">${esc(t("audit_empty"))}</p>`;
}
const ORDER_TYPES = ["all", "FLIGHT", "TOUR", "HOTEL", "JET", "HELI"];
PAGES["customers/:phone"] = {
  render({ phone }){
    const c = clientByKey(phone);
    if (!c) return `<div class="page">${backLink("customers", t("an_customers"))}<div class="card empty"><h1 class="h-empty">${esc(t("customer_missing"))}</h1></div></div>`;
    // Лиды в карточке — только видимые сотруднику (b2cClients уже отфильтровал).
    const target = "c:" + c.key, leadTargets = c.leads.map(l => "l:" + l.id), signedIn = SITE?.user?.phone && digits(SITE.user.phone) === c.key, ot = M.ui.cot || "all";
    const orders = c.orders.filter(o => ot === "all" || o.type === ot), pays = clientPayments(c), reqs = c.orders.filter(o => o.req);
    const row = (k, v, mono) => `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${v ? esc(v) : "—"}</span></div>`;
    const blockKey = "cb" + c.key;
    return `<div class="page">${backLink("customers", t("an_customers"))}
      ${M.ui.cDraft?.key === c.key ? custForm() : ""}
      ${c.blocked ? `<p class="blockbar inline">${IC.lock}<span><b>${esc(t("cust_blocked_h"))}</b> ${esc(c.blockReason)}</span></p>` : ""}
      <div class="ohead"><span class="avatar">${esc(monogram(c.name || "?"))}</span><div><span class="lbl">${esc(t("customer"))} · B2C</span><h1>${esc(c.name || t("guest"))}</h1>
        <p class="muted mono">${esc(c.phone)}</p></div><span class="row" style="gap:8px">${segPill(c.segment)}${signedIn ? `<span class="pill st-CONFIRMED">${esc(t("signed_site"))}</span>` : ""}</span></div>
      <div class="twocol"><div class="stack">
          <section class="card stack"><div class="card-h"><h2>${esc(t("crm_requests"))}</h2>${can("crm.create") ? `<button type="button" class="link" data-act="cleadnew" data-v="${c.key}">${esc(t("crm_lead_new"))}</button>` : ""}</div>
            ${c.leads.length || reqs.length ? `<div class="atable" style="--cols:88px minmax(0,2fr) minmax(0,1fr) 130px">${c.leads.map(l => `<a class="arow" href="#/crm/${l.id}"><span class="a-cell mono small">${esc(l.no)}</span>
                <span class="a-main"><b>${esc(leadWhat(l) || t("crm_no_interest"))}</b><span class="small muted">${esc(t("src_" + l.source))} · ${esc(fdt(l.createdAt))}</span></span>
                <span class="a-cell small">${l.manager ? esc(staffName(l.manager)) : ""}</span><span class="a-end">${stagePill(l.status)}</span></a>`).join("")}
              ${reqs.map(o => `<a class="arow" href="#/orders/site/${o.id}"><span class="a-cell mono small">${esc(o.no)}</span><span class="a-main"><b>${esc(t("req_kind_" + o.req.kind))}</b><span class="small muted">${esc(o.req.note || "")}</span></span>
                <span class="a-cell small">${esc(fdt(o.req.at))}</span><span class="a-end"><span class="pill ${o.req.status ? "st-CONFIRMED" : "st-PENDING"}">${esc(t(o.req.status ? "req_status_" + o.req.status : "ap_wait"))}</span></span></a>`).join("")}</div>`
              : `<p class="muted">${esc(t("crm_requests_none"))}</p>`}</section>
          <section class="card stack"><div class="card-h"><h2>${esc(t("an_orders"))}</h2><span class="muted small">${esc(tf("crm_count", { n:c.orders.length }))}</span></div>
            ${c.orders.length ? `<div class="chipbar">${ORDER_TYPES.filter(x => x === "all" || c.orders.some(o => o.type === x)).map(x => `<button type="button" class="chip" data-act="cot" data-v="${x}" aria-pressed="${ot === x}">${esc(x === "all" ? t("crm_all") : t("type_" + x))}</button>`).join("")}</div>
              <div class="atable" style="--cols:${ORDER_COLS_COMPACT}">${orders.map((o, i) => admOrderRow({ o, a:null, src:"site" }, i, "", true)).join("")}</div>` : `<p class="muted">${esc(t("orders_empty"))}</p>`}</section>
          <section class="card stack"><h2>${esc(t("crm_payments"))}</h2>${pays.length ? `<div class="atable" style="--cols:150px minmax(0,2fr) minmax(0,1fr)">${pays.map(p => `<a class="arow" href="#/orders/site/${p.o.id}">
              <span class="a-cell a-sub muted small">${esc(fdt(p.at))}</span><span class="a-main"><b>${esc(t(p.kind === "pay" ? "crm_pay" : "crm_refund"))}</b><span class="small muted">${esc(p.o.no)} · ${esc(t("type_" + p.o.type))}</span></span>
              <span class="a-num a-keep mono">${p.kind === "refund" ? "−" : ""}${fmtUZS(p.uzs)}</span></a>`).join("")}</div>` : `<p class="muted">${esc(t("crm_payments_none"))}</p>`}</section>
          ${can("crm.view") || can("b2c.edit") ? notesBlock(target, [target, ...(can("crm.view") ? leadTargets : [])]) : ""}
          <section class="card stack"><h2>${esc(t("crm_history"))}</h2>${clientHistory(c)}</section></div>
        <aside class="stack sticky">
          <div class="card stack"><div class="card-h"><span class="lbl">${esc(t("crm_contact"))}</span>${canEditClient() ? `<button type="button" class="link" data-act="cedit" data-v="${c.key}">${esc(t("edit"))}</button>` : ""}</div>
            <div class="rows">${row("phone_label", c.phone, true)}${row("agency_email", c.email)}${row("crm_country", c.country)}${row("crm_source", t("src_" + c.source))}
              ${row("crm_since", c.first ? fdate(ymd(new Date(c.first))) : "")}${row("col_spent", fmtUZS(c.spent), true)}</div></div>
          <div class="card stack"><span class="lbl">${esc(t("crm_manager"))}</span><div>${managerField(target, c.manager)}</div></div>
          ${can("crm.view") ? tasksBlock(target, [target, ...leadTargets]) : ""}
          ${signedIn && SITE.travellers?.length ? `<div class="card stack"><span class="lbl">${esc(t("saved_travellers"))}</span>${SITE.travellers.map(x => `<div class="trow"><b>${esc(x.given)} ${esc(x.surname)}</b><span class="mono small muted">${esc(x.passport.slice(0, 2))}•••${esc(x.passport.slice(-2))}</span></div>`).join("")}
            <p class="muted small">${esc(t("pii_note"))}</p></div>` : ""}
          <div class="card stack"><span class="lbl">${esc(t("cust_access"))}</span><p class="muted small">${esc(t(c.blocked ? "cust_blocked_d" : "cust_active_d"))}</p>
            ${c.blocked ? `<button type="button" class="solid sm" data-act="cunblock" data-v="${c.key}" ${guard("b2c.manage")}>${esc(t("unblock_cta"))}</button>`
              : !M.ui.ask?.[blockKey] ? `<button type="button" class="ghost sm danger-ghost" data-act="aask" data-k="${blockKey}" ${guard("b2c.manage")}>${esc(t("block_cta"))}</button>`
              : `<span class="why">${inpField("why:" + blockKey, { label:t("reason"), ph:t("cust_block_ph"), extra:'maxlength="120"' })}
                <button type="button" class="solid sm danger-solid" data-act="cblock" data-v="${c.key}" ${guard("b2c.manage")}>${esc(t("block_cta"))}</button>
                <button type="button" class="link" data-act="aask" data-k="${blockKey}">${esc(t("cancel"))}</button></span>`}</div>
        </aside></div></div>`;
  },
  after(){ if (M.ui.cDraft && M.ui.cFocus) { $("#cedit [data-cf=name]")?.focus(); M.ui.cFocus = false; } }
};
/* Блокировка: номер попадает в список, который читает сайт, — бронировать с него нельзя. */
function setClientBlocked(key, on, reason = ""){
  if (denied("b2c.manage")) return false;
  if (on && !reason) { toast(t("err_reason")); return false; }
  const c = clientByKey(key); if (!c) return false;
  if (on && !reason.trim()) { toast(t("err_reason")); return false; }
  change(() => { const r = clientRec("c:" + key); if (!r.phone) r.phone = c.phone; if (!r.name && c.name) r.name = c.name;
    r.blocked = on; r.blockReason = on ? reason : ""; r.events.unshift({ at:Date.now(), by:me().id, type:on ? "block" : "unblock", reason });
    syncBlocked();
    audit(on ? "client_block" : "client_unblock", { name:c.name || c.phone, reason }, { module:"b2c", diff:[{ k:"col_status", from:strRef(on ? "cust_st_on" : "cust_st_off"), to:strRef(on ? "cust_st_off" : "cust_st_on") }] }); });
  toast(t(on ? "t_client_blocked" : "t_client_unblocked"));
  return true;
}
Object.assign(ACT, {
  cnew:     () => { if (!canEditClient()) return toast(t("no_rights")); M.ui.cDraft = { key:null, name:"", phone:"", email:"", country:"", source:"phone" }; M.ui.cFocus = true; rerender(); },
  cedit:    el => { const c = clientByKey(el.dataset.v); if (!c || !canEditClient()) return; M.ui.cDraft = { key:c.key, name:c.name, phone:c.phone, email:c.email, country:c.country, source:c.source }; M.ui.cFocus = true; rerender(); },
  cclose:   () => { M.ui.cDraft = null; rerender(); },
  csave:    () => saveClient(),
  cot:      el => { M.ui.cot = el.dataset.v; rerender(); },
  cblock:   el => { if (setClientBlocked(el.dataset.v, true, takeInp("why:cb" + el.dataset.v))) { M.ui.ask["cb" + el.dataset.v] = false; rerender(); $('[data-act="cunblock"]')?.focus(); } },
  cunblock: el => { if (setClientBlocked(el.dataset.v, false)) $('[data-act="aask"][data-k^="cb"]')?.focus(); },
  cleadnew: el => { const c = clientByKey(el.dataset.v); if (!c || denied("crm.create")) return; M.ui.leadDraft = blankLead({ name:c.name, phone:c.phone, email:c.email, country:c.country }); M.ui.ldFocus = true; go("crm"); },
  bcsv:     () => {
    if (denied("b2c.export")) return;
    csvDownload([[t("customer"), t("phone_label"), t("agency_email"), t("crm_country"), t("crm_segment"), t("crm_source"), t("crm_manager"), t("an_orders"), t("col_spent")],
      ...custRows().map(c => [c.name, c.phone, c.email, c.country, t("seg_" + c.segment), t("src_" + c.source), c.manager ? staffName(c.manager) : "", c.orders.length, c.spent])], "customers");
    change(() => audit("export", { what:strRef("an_customers") }, { module:"b2c" }));
  }
});
document.addEventListener("input", e => {
  const k = e.target.dataset?.cf; if (k && M.ui.cDraft) M.ui.cDraft[k] = e.target.value;
  if (e.target.id === "bq") { M.ui.bq = e.target.value; bRefresh(); }
});
document.addEventListener("change", e => {
  const k = e.target.dataset?.cf; if (k && M.ui.cDraft) M.ui.cDraft[k] = e.target.value;
  if (e.target.id === "bsg") { M.ui.bsg = e.target.value; bRefresh(); }
});
const bRefresh = () => { const l = $("#blist"); if (l) l.innerHTML = clientTable(custRows(), t("an_customers"), false); const c = $("#bcount"); if (c) c.textContent = tf("crm_count", { n:custRows().length }); };
