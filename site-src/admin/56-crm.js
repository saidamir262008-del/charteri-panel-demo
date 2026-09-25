/* ==========================================================================
   CRM: воронка лидов, список лидов, клиенты (пассажиры и агентства), задачи;
   карточка лида. Этапы: новый → связались → в работе → заинтересован →
   подтверждён → завершён | потерян (с причиной).
   ========================================================================== */
"use strict";

const CRM_TABS = ["board", "leads", "clients", "tasks"];

/* ---- форма лида: новый и правка ---- */
const LEAD_FIELDS = [["name", "crm_name"], ["phone", "phone_label"], ["email", "agency_email"], ["country", "crm_country"], ["source", "crm_source"],
  ["service", "crm_service"], ["dest", "crm_dest"], ["budget", "crm_budget"]];
const blankLead = (x = {}) => ({ id:null, name:"", phone:"", email:"", country:"", source:"phone", service:"TOUR", dest:"", budget:"", manager:can("crm.manage") ? "" : me().id, note:"", ...x });
/* forId — чья страница: на карточке лида — его id, в списке CRM — null
   (там только новый лид). Черновик с другой карточки не показываем. */
function leadForm(forId = null){
  const d = M.ui.leadDraft; if (!d || (d.id || null) !== forId) return "";
  const f = (k, label, attrs = "") => `<label class="field"><span>${esc(t(label))}</span><input data-lf="${k}" value="${esc(d[k])}" ${attrs}></label>`;
  const srcs = LEAD_SOURCES.filter(x => !AUTO_SOURCES.includes(x) || x === d.source);
  return `<section class="card stack cl-edit" id="ledit" aria-labelledby="ledit-h"><div class="card-h"><h2 id="ledit-h">${esc(t(d.id ? "crm_lead_edit" : "crm_lead_new"))}</h2>
      <button type="button" class="iconbtn" data-act="ledclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      ${f("name", "crm_name", 'maxlength="60" autocomplete="off"')}${f("phone", "phone_label", 'type="tel" placeholder="+998" autocomplete="off"')}${f("email", "agency_email", 'type="email" maxlength="80" autocomplete="off"')}
      ${f("country", "crm_country", 'maxlength="40" autocomplete="off"')}
      <label class="field"><span>${esc(t("crm_source"))}</span><select data-lf="source">${srcs.map(x => `<option value="${x}" ${d.source === x ? "selected" : ""}>${esc(t("src_" + x))}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(t("crm_service"))}</span><select data-lf="service"><option value="">—</option>${LEAD_SERVICES.map(x => `<option value="${x}" ${d.service === x ? "selected" : ""}>${esc(t("type_" + x))}</option>`).join("")}</select></label>
      ${f("dest", "crm_dest", 'maxlength="60" autocomplete="off"')}${f("budget", "crm_budget", 'inputmode="numeric" maxlength="9" placeholder="$"')}
      ${!d.id && crmAll() ? `<label class="field"><span>${esc(t("crm_manager"))}</span><select data-lf="manager"><option value="">${esc(t("crm_nobody"))}</option>${crmStaff().map(s => `<option value="${s.id}" ${d.manager === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>` : ""}
    </div>
    ${d.id ? "" : `<label class="field"><span>${esc(t("crm_first_note"))}</span><textarea data-lf="note" rows="2" maxlength="${NOTE_MAX}">${esc(d.note)}</textarea></label>`}
    <div class="err" id="lerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="ledsave">${esc(t(d.id ? "st_save" : "crm_lead_create"))}</button><button type="button" class="link" data-act="ledclose">${esc(t("cancel"))}</button></div></section>`;
}
/* Ошибка и поле, к которому она относится. */
function leadError(d){
  if (d.name.trim().length < 2) return ["err_name_short", "name"];
  if (d.phone.trim() && !validPhone(d.phone)) return ["err_phone", "phone"];
  if (!validPhone(d.phone) && !(d.email.trim() && validEmail(d.email.trim()))) return ["err_lead_contact", "phone"];
  if (d.email.trim() && !validEmail(d.email.trim())) return ["err_email", "email"];
  if (d.budget !== "" && !/^\d{1,8}$/.test(String(d.budget).replace(/\s/g, ""))) return ["err_budget", "budget"];
  const dup = validPhone(d.phone) && O.crm.leads.find(l => l.id !== d.id && LEAD_OPEN.includes(l.status) && digits(l.phone) === digits(d.phone));
  if (dup) return [{ key:"err_lead_dup", no:dup.no }, "phone"];
  return null;
}
function saveLead(){
  const d = M.ui.leadDraft; if (!d) return;
  const l0 = d.id ? leadById(d.id) : null;
  if (l0 ? !canEditLead(l0) : denied("crm.create")) return l0 && toast(t("no_rights"));
  const err = leadError(d);
  if (err) {
    $$("#ledit [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
    const fld = $(`#ledit [data-lf="${err[1]}"]`); if (fld) { fld.setAttribute("aria-invalid", "true"); fld.setAttribute("aria-describedby", "lerr"); }
    showErr("#lerr", typeof err[0] === "object" ? tf(err[0].key, { no:err[0].no }) : t(err[0])); fld?.focus({ preventScroll:true }); return;
  }
  const rec = { name:d.name.trim().replace(/\s+/g, " "), phone:validPhone(d.phone) ? prettyPhone(d.phone) : "", email:d.email.trim(), country:d.country.trim(),
    source:LEAD_SOURCES.includes(d.source) ? d.source : "other", service:LEAD_SERVICES.includes(d.service) ? d.service : null,
    budget:d.budget === "" ? null : Number(String(d.budget).replace(/\s/g, "")) };
  let id = d.id;
  change(() => {
    if (l0) {
      const l = leadById(l0.id), destTxt = d.dest.trim(), next = { ...rec, dest:destTexts(l).includes(destTxt) ? l.dest : destTxt };
      const val = (k, x) => k === "dest" ? destVal(x) : k === "source" ? strRef("src_" + x[k]) : k === "service" ? (x[k] ? strRef("type_" + x[k]) : "") : String(x[k] ?? "");
      const diff = LEAD_FIELDS.filter(([k]) => JSON.stringify(l[k] ?? "") !== JSON.stringify(next[k] ?? "")).map(([k, label]) => ({ k:label, from:val(k, l), to:val(k, next) }));
      if (!diff.length) return;
      Object.assign(l, next); leadEvent(l, { type:"edit", fields:diff.map(x => x.k) });
      audit("lead_edit", { no:l.no, name:l.name }, { module:"crm", diff });
    } else {
      const mgr = crmAll() ? (crmStaff().some(s => s.id === d.manager) ? d.manager : null) : me().id;
      const l = newLead(O, { ...rec, dest:d.dest.trim(), manager:mgr, by:me().id }); id = l.id;
      if (d.note.trim()) O.crm.notes.unshift({ id:uid("n"), target:"l:" + l.id, kind:"note", text:d.note.trim(), by:me().id, at:Date.now() });
      audit("lead_new", { no:l.no, name:l.name }, { module:"crm" });
    }
  });
  M.ui.leadDraft = null;
  if (!l0) { toast(tf("t_lead_new", { no:leadById(id)?.no || "" })); go("crm/" + id); } else { rerender(); toast(t("t_lead_saved")); $("h1")?.focus(); }
}
/* Смена этапа. «Потерян» — только с причиной. */
function setStage(id, to, reason = ""){
  const l = leadById(id); if (!l || !LEAD_STAGES.includes(to)) return false;
  if (!canEditLead(l)) { toast(t("no_rights")); return false; }
  if (l.status === to) return false;
  if (to === "lost" && !reason) { toast(t("err_reason")); return false; }
  change(() => { const x = leadById(id); const from = x.status; leadEvent(x, { type:"status", from, to, ...(to === "lost" ? { reason } : {}) }); x.status = to; x.lostReason = to === "lost" ? reason : "";
    audit("lead_status", { no:x.no, name:x.name }, { module:"crm", diff:[{ k:"crm_stage", from:strRef("ls_" + from), to:strRef("ls_" + to) },
      ...(to === "lost" ? [{ k:"crm_lost_reason", from:"", to:reason }] : [])] }); });
  toast(tf("t_lead_stage", { stage:t("ls_" + to) }));
  return true;
}
/* Направление лида на всех языках (для сравнения) и без языка (для журнала). */
const destTexts = l => !l.dest ? [""] : typeof l.dest === "string" ? [l.dest] : ["ru", "uz", "en"].map(lang => { const k = S.lang; S.lang = lang; const v = leadDest(l); S.lang = k; return v; });
const destVal = l => !l.dest ? "" : typeof l.dest === "string" ? l.dest : l.dest.code ? { dest:l.dest } : l.dest;
const nextStage = st => ({ new:"contacted", contacted:"progress", progress:"interested", interested:"confirmed", confirmed:"completed" })[st] || null;

/* ---- воронка ---- */
function leadCard(l){
  const over = tasksFor(["l:" + l.id]).some(taskOverdue), nx = nextStage(l.status);
  return `<article class="lcard" aria-label="${esc(l.name)}"><a class="lcard-main" href="#/crm/${l.id}"><span class="mono small muted">${esc(l.no)}</span><b>${esc(l.name)}</b>
      <span class="small muted">${esc(leadWhat(l) || t("crm_no_interest"))}</span></a>
    <div class="lcard-foot"><span class="mono small">${esc(usd(l.budget))}</span>${over ? `<span class="warn-t small" title="${esc(t("crm_overdue"))}">${IC.clock}<span class="sr-only">${esc(t("crm_overdue"))}</span></span>` : ""}
      <span class="small muted">${esc(ago(l.createdAt))}</span>${l.manager ? `<span class="avatar xs" title="${esc(staffName(l.manager))}" aria-label="${esc(staffName(l.manager))}">${esc(monogram(staffName(l.manager)))}</span>` : ""}</div>
    ${nx && canEditLead(l) ? `<button type="button" class="link small" data-act="lednext" data-v="${l.id}" aria-label="${esc(tf("crm_move_to", { stage:t("ls_" + nx) }))}: ${esc(l.name)}">${esc(tf("crm_move_to", { stage:t("ls_" + nx) }))}</button>` : ""}</article>`;
}
function crmBoard(){
  const leads = visibleLeads();
  return `<div class="lboard" role="region" aria-label="${esc(t("crm_board"))}" tabindex="0">${LEAD_STAGES.map(st => {
    const list = leads.filter(l => l.status === st), sum = list.reduce((s, l) => s + (l.budget || 0), 0);
    return `<section class="bcol bcol-${st}" aria-labelledby="bc-${st}"><header class="bcol-h"><h3 id="bc-${st}">${esc(t("ls_" + st))}</h3><span class="count">${list.length}</span>
        ${sum ? `<span class="small muted mono">${esc(usd(sum))}</span>` : ""}</header>
      <div class="bcards">${list.map(leadCard).join("") || `<p class="small muted">${esc(t("crm_col_empty"))}</p>`}</div></section>`; }).join("")}</div>`;
}

/* ---- список лидов ---- */
function leadRows(){
  const st = M.ui.lst || "all", src = M.ui.lsrc || "all", mg = M.ui.lmg || "all", q = (M.ui.lq || "").trim().toLowerCase();
  return visibleLeads().filter(l => (st === "all" || (st === "open" ? LEAD_OPEN.includes(l.status) : l.status === st)) && (src === "all" || l.source === src)
    && (mg === "all" || (mg === "none" ? !l.manager : l.manager === mg))
    && (!q || [l.no, l.name, l.phone, l.email, leadWhat(l)].join(" ").toLowerCase().includes(q)));
}
function leadsList(){
  const rows = leadRows();
  if (!rows.length) return `<p class="muted">${esc(t("crm_none_match"))}</p>`;
  return `<div class="atable" style="--cols:88px minmax(0,1.6fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.1fr) 130px">
    <div class="arow ahead" aria-hidden="true"><span>№</span><span>${esc(t("crm_name"))}</span><span>${esc(t("crm_interest"))}</span>
      <span>${esc(t("crm_source"))}</span><span>${esc(t("crm_manager"))}</span><span class="a-end">${esc(t("crm_stage"))}</span></div>
    ${rows.map(l => `<a class="arow" href="#/crm/${l.id}"><span class="a-cell mono small">${esc(l.no)}</span>
      <span class="a-main"><b>${esc(l.name)}</b><span class="mono">${esc(l.phone || l.email)}</span></span>
      <span class="a-cell a-sub wrap">${esc(leadWhat(l) || "—")}${l.budget ? ` · <span class="mono">${esc(usd(l.budget))}</span>` : ""}</span>
      <span class="a-cell small">${esc(t("src_" + l.source))}</span><span class="a-cell small">${l.manager ? esc(staffName(l.manager)) : `<span class="muted">${esc(t("crm_nobody"))}</span>`}</span>
      <span class="a-end">${stagePill(l.status)}</span></a>`).join("")}</div>`;
}
function leadsTab(){
  const st = M.ui.lst || "all", src = M.ui.lsrc || "all", mg = M.ui.lmg || "all";
  return `<div class="card stack"><div class="ofind au-find">
      <select id="lst" class="minisel" aria-label="${esc(t("crm_stage"))}"><option value="all">${esc(t("crm_all_stages"))}</option><option value="open" ${st === "open" ? "selected" : ""}>${esc(t("crm_open"))}</option>
        ${LEAD_STAGES.map(x => `<option value="${x}" ${st === x ? "selected" : ""}>${esc(t("ls_" + x))}</option>`).join("")}</select>
      <select id="lsrc" class="minisel" aria-label="${esc(t("crm_source"))}"><option value="all">${esc(t("crm_all_sources"))}</option>${LEAD_SOURCES.map(x => `<option value="${x}" ${src === x ? "selected" : ""}>${esc(t("src_" + x))}</option>`).join("")}</select>
      ${crmAll() ? `<select id="lmg" class="minisel" aria-label="${esc(t("crm_manager"))}"><option value="all">${esc(t("crm_all_managers"))}</option><option value="none" ${mg === "none" ? "selected" : ""}>${esc(t("crm_nobody"))}</option>
        ${crmStaff().map(s => `<option value="${s.id}" ${mg === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
      <label class="search">${IC.search}<input id="lq" type="search" value="${esc(M.ui.lq || "")}" placeholder="${esc(t("crm_search"))}" aria-label="${esc(t("crm_search"))}"></label>
      <button type="button" class="ghost sm" data-act="lcsv" ${guard("crm.export")}>${IC.doc}<span>${esc(t("download_csv"))}</span></button></div>
    <p class="muted small" id="lcount" aria-live="polite">${esc(tf("crm_count", { n:leadRows().length }))}</p>
    <div id="llist">${leadsList()}</div></div>`;
}

/* ---- клиенты: пассажиры и агентства ---- */
function agencyClients(){
  return agencies().map(a => {
    const paid = a.st.orders.filter(o => o.paidAt && !["CANCELLED", "REFUNDED"].includes(o.status)), d = clientData("a:" + a.id) || {};
    const c = { key:a.id, b2b:true, name:a.name, phone:a.phone || "", orders:a.st.orders, spent:paid.reduce((s, o) => s + (o.total?.uzs || 0), 0), paid:paid.length,
      lastPaid:Math.max(0, ...paid.map(o => o.paidAt)), last:Math.max(0, ...a.st.orders.map(o => o.createdAt)), manager:d.manager || null, source:"b2b_app", blocked:!agencyActiveOf(a) };
    return { ...c, segment:segmentOf(c) };
  });
}
const SEGMENTS = ["new", "active", "vip", "inactive", "blocked"];
const segPill = s => `<span class="pill seg-${s}">${esc(t("seg_" + s))}</span>`;
function clientRows(){
  const ty = M.ui.cty || "all", sg = M.ui.csg || "all", q = (M.ui.cq || "").trim().toLowerCase();
  const list = [...(ty !== "b2b" && (can("b2c.view") || can("crm.view")) ? b2cClients() : []), ...(ty !== "b2c" && can("b2b.view") ? agencyClients() : [])];
  return list.filter(c => (sg === "all" || c.segment === sg) && (!q || [c.name, c.phone, c.email || ""].join(" ").toLowerCase().includes(q))).sort((a, b) => b.last - a.last);
}
function clientTable(rows, label, showType = true){
  if (!rows.length) return `<p class="muted">${esc(t("crm_none_match"))}</p>`;
  return `<div class="atable" style="--cols:minmax(0,2fr) ${showType ? "70px " : ""}minmax(0,1fr) minmax(0,1.2fr) 80px minmax(0,1.2fr) 120px">
    <div class="arow ahead" aria-hidden="true"><span>${esc(t("customer"))}</span>${showType ? `<span>${esc(t("crm_type"))}</span>` : ""}<span>${esc(t("crm_segment"))}</span>
      <span>${esc(t("crm_manager"))}</span><span class="a-num">${esc(t("an_orders"))}</span><span class="a-num">${esc(t("col_spent"))}</span><span class="a-end">${esc(t("crm_last_activity"))}</span></div>
    ${rows.map(c => `<a class="arow" href="${c.b2b ? `#/agencies/${c.key}` : `#/customers/${c.key}`}"><span class="a-main a-with-mark"><span class="avatar sm" aria-hidden="true">${esc(monogram(c.name || "?"))}</span>
        <span class="stack" style="gap:1px;min-width:0"><b>${esc(c.name || t("guest"))}</b><span class="mono small muted">${esc(c.phone)}</span></span></span>
      ${showType ? `<span class="a-cell small">${c.b2b ? "B2B" : "B2C"}</span>` : ""}<span class="a-sub">${segPill(c.segment)}</span>
      <span class="a-cell small">${c.manager ? esc(staffName(c.manager)) : `<span class="muted">${esc(t("crm_nobody"))}</span>`}</span>
      <span class="a-num mono"><span class="sr-only">${esc(t("an_orders"))}: </span>${c.orders.length}</span><span class="a-num a-keep mono"><span class="sr-only">${esc(t("col_spent"))}: </span>${fmtUZS(c.spent)}</span>
      <span class="a-end muted small">${c.last ? esc(fdate(ymd(new Date(c.last)))) : "—"}</span></a>`).join("")}</div>`;
}
function clientsTab(){
  const ty = M.ui.cty || "all", sg = M.ui.csg || "all";
  return `<div class="card stack"><div class="ofind au-find">
      ${seg("cty", [["all", t("crm_all")], ["b2c", "B2C"], ["b2b", "B2B"]], ty)}
      <select id="csg" class="minisel" aria-label="${esc(t("crm_segment"))}"><option value="all">${esc(t("crm_all_segments"))}</option>${SEGMENTS.map(x => `<option value="${x}" ${sg === x ? "selected" : ""}>${esc(t("seg_" + x))}</option>`).join("")}</select>
      <label class="search">${IC.search}<input id="cq" type="search" value="${esc(M.ui.cq || "")}" placeholder="${esc(t("crm_search_c"))}" aria-label="${esc(t("crm_search_c"))}"></label>
      <button type="button" class="ghost sm" data-act="ccsv" ${can("crm.export") || can("b2c.export") ? "" : guard("crm.export")}>${IC.doc}<span>${esc(t("download_csv"))}</span></button></div>
    <p class="muted small" id="ccount" aria-live="polite">${esc(tf("crm_count", { n:clientRows().length }))}</p>
    <div id="clist">${clientTable(clientRows(), t("crm_clients"))}</div>
    <p class="muted small">${esc(tf("seg_note", { vip:fmtUZS(VIP_MIN), days:ACTIVE_DAYS }))}</p></div>`;
}

/* ---- задачи ---- */
function tasksTab(){
  const who = crmAll() ? M.ui.tkw || "me" : "me", done = M.ui.tkd === "done";
  const list = O.crm.tasks.filter(x => (who === "all" || x.assignee === (who === "me" ? me().id : who)) && x.done === done
    && (!x.target.startsWith("l:") || (leadById(x.target.slice(2)) && canSeeLead(leadById(x.target.slice(2)))))).sort((a, b) => done ? b.doneAt - a.doneAt : a.due - b.due);
  const groups = done ? [["crm_done", list.slice(0, 50)]] : [["crm_overdue", list.filter(taskOverdue)], ["crm_today", list.filter(x => !taskOverdue(x) && x.due <= dayEnd())], ["crm_later", list.filter(x => x.due > dayEnd())]];
  return `<div class="card stack"><div class="ofind au-find">
      ${seg("tkd", [["open", t("crm_open_tasks")], ["done", t("crm_done")]], done ? "done" : "open")}
      ${crmAll() ? `<select id="tkw" class="minisel" aria-label="${esc(t("crm_assignee"))}"><option value="me" ${who === "me" ? "selected" : ""}>${esc(t("crm_mine"))}</option><option value="all" ${who === "all" ? "selected" : ""}>${esc(t("crm_all_managers"))}</option>
        ${crmStaff().map(s => `<option value="${s.id}" ${who === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}</div>
    ${list.length ? groups.filter(([, g]) => g.length).map(([k, g]) => `<div class="stack" style="gap:6px"><h3 class="lbl">${esc(t(k))} · ${g.length}</h3><ul class="crm-tasks">${g.map(x => taskRow(x, true)).join("")}</ul></div>`).join("")
      : `<p class="calm">${IC.ok}<span>${esc(t(done ? "crm_tasks_none" : "crm_tasks_clear"))}</span></p>`}</div>`;
}

PAGES.crm = {
  render(){
    const tab = CRM_TABS.includes(M.ui.crmTab) ? M.ui.crmTab : "board";
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_crm"))}</h1><p class="muted">${esc(t(crmAll() ? "crm_sub_all" : "crm_sub_mine"))}</p></div>
        <button type="button" class="solid" data-act="lednew" ${guard("crm.create")}>${IC.plus}<span>${esc(t("crm_lead_new"))}</span></button></div>
      ${leadForm(null)}
      <div class="stack">${seg("crmtab", CRM_TABS.map(k => [k, t("crm_tab_" + k)]), tab)}
        ${{ board:crmBoard, leads:leadsTab, clients:clientsTab, tasks:tasksTab }[tab]()}</div></div>`;
  },
  after(){ if (M.ui.leadDraft && M.ui.ldFocus) { $("#ledit [data-lf=name]")?.focus(); M.ui.ldFocus = false; } crmSync(); }
};

/* ---- карточка лида ---- */
function leadHistory(l){
  const txt = e => e.type === "created" ? tf("le_created", { src:t("src_" + l.source) })
    : e.type === "status" ? tf("le_status", { from:t("ls_" + e.from), to:t("ls_" + e.to) }) + (e.sys ? " · " + t("le_auto") : "") + (e.reason ? ` · «${auditVal(e.reason)}»` : "")
    : e.type === "assign" ? tf("le_assign", { name:e.to ? staffName(e.to) : t("crm_nobody") })
    : e.type === "link" ? tf("le_link", { no:e.no || "" }) : e.type === "edit" ? tf("le_edit", { fields:(e.fields || []).map(k => t(k)).join(", ") }) : "";
  return `<ol class="feed">${l.events.map(e => `<li><span class="feed-dot" aria-hidden="true"></span><span class="stack" style="gap:2px"><span>${esc(txt(e))}</span>
    <span class="muted small">${esc(e.by ? staffName(e.by) : t("le_system"))} · ${esc(fdt(e.at))}</span></span></li>`).join("")}</ol>`;
}
function stageStepper(l){
  const edit = canEditLead(l), i = LEAD_STAGES.indexOf(l.status);
  return `<div class="lstepper" role="group" aria-label="${esc(t("crm_stage"))}">${LEAD_STAGES.map((st, k) => `<button type="button" class="lstep ${k < i && l.status !== "lost" ? "past" : ""} ls-${st}"
      data-act="${st === "lost" ? "aask" : "ledstage"}" ${st === "lost" ? `data-k="lost${l.id}"` : `data-s="${st}" data-v="${l.id}"`} aria-pressed="${l.status === st}" ${edit && !(st === "lost" && l.status === "lost") ? "" : "disabled"}>${esc(t("ls_" + st))}</button>`).join("")}</div>
    ${M.ui.ask?.["lost" + l.id] && edit ? `<span class="why">${inpField("why:lost" + l.id, { label:t("reason"), ph:t("crm_lost_ph"), extra:'maxlength="120"' })}
      <button type="button" class="solid sm danger-solid" data-act="ledlost" data-v="${l.id}">${esc(t("crm_mark_lost"))}</button>
      <button type="button" class="link" data-act="aask" data-k="lost${l.id}">${esc(t("cancel"))}</button></span>` : ""}
    ${l.status === "lost" && l.lostReason ? `<p class="small"><b>${esc(t("crm_lost_reason"))}:</b> ${esc(auditVal(l.lostReason))}</p>` : ""}`;
}
PAGES["crm/:id"] = {
  render({ id }){
    const l = leadById(id);
    if (!l || !canSeeLead(l)) return `<div class="page">${backLink("crm", t("an_crm"))}<div class="card empty"><h1 class="h-empty">${esc(t("crm_lead_missing"))}</h1></div></div>`;
    const orders = linkedOrders(l), key = digits(l.phone), row = (k, v, mono) => v ? `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${esc(v)}</span></div>` : "";
    return `<div class="page">${backLink("crm", t("an_crm"))}
      ${leadForm(l.id)}
      <div class="ohead"><span class="avatar">${esc(monogram(l.name || "?"))}</span><div><span class="lbl">${esc(l.no)} · ${esc(t(l.kind === "b2b" ? "crm_lead_b2b" : "crm_lead"))}</span><h1>${esc(l.name)}</h1>
        <p class="muted">${esc(leadWhat(l) || t("crm_no_interest"))}${l.budget ? ` · <span class="mono">${esc(usd(l.budget))}</span>` : ""}</p></div>${stagePill(l.status)}</div>
      <section class="card stack"><h2>${esc(t("crm_stage"))}</h2>${stageStepper(l)}</section>
      <div class="twocol" style="margin-top:20px"><div class="stack">
          ${notesBlock("l:" + l.id)}
          <section class="card stack"><h2>${esc(t("an_orders"))}</h2>${orders.length ? `<div class="atable" style="--cols:${ORDER_COLS_COMPACT}">${orders.map((o, i) => admOrderRow({ o, a:null, src:"site" }, i, "", true)).join("")}</div>`
            : `<p class="muted">${esc(t("crm_orders_none"))}</p>`}</section>
          <section class="card stack"><h2>${esc(t("crm_history"))}</h2>${leadHistory(l)}</section></div>
        <aside class="stack sticky">
          <div class="card stack"><div class="card-h"><span class="lbl">${esc(t("crm_contact"))}</span>${canEditLead(l) ? `<button type="button" class="link" data-act="ledit" data-v="${l.id}">${esc(t("edit"))}</button>` : ""}</div>
            <div class="rows">${row("phone_label", l.phone, true)}${row("agency_email", l.email)}${row("crm_person", l.contact)}${row("crm_country", l.country)}${row("crm_source", t("src_" + l.source))}
              ${row("crm_created", fdt(l.createdAt))}</div>
            ${key && l.kind !== "b2b" ? `<a class="link" href="#/customers/${key}">${esc(t("crm_client_card"))}</a>` : ""}
            ${l.origin?.app && can("b2b.view") ? `<a class="link" href="#/agencies">${esc(t("an_agencies"))}</a>` : ""}</div>
          <div class="card stack"><span class="lbl">${esc(t("crm_manager"))}</span><div>${managerField("l:" + l.id, l.manager)}</div></div>
          ${tasksBlock("l:" + l.id)}
          ${can("crm.delete") ? `<button type="button" class="link danger" data-act="leddel" data-v="${l.id}">${esc(t("crm_lead_delete"))}</button>` : ""}
        </aside></div></div>`;
  },
  after(){ if (M.ui.leadDraft && M.ui.ldFocus) { $("#ledit [data-lf=name]")?.focus(); M.ui.ldFocus = false; } }
};

/* ---- действия и поля ---- */
const leadDraftOf = l => blankLead({ id:l.id, name:l.name, phone:l.phone, email:l.email, country:l.country, source:l.source, service:l.service || "", dest:leadDest(l), budget:l.budget == null ? "" : String(l.budget) });
function csvDownload(rows, name){
  const blob = new Blob([csvText(rows)], { type:"text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:`charteri-${name}-${TODAY}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
Object.assign(ACT, {
  crmtab:  el => { M.ui.crmTab = el.dataset.v; rerender(); },
  lednew:  () => { if (denied("crm.create")) return; M.ui.leadDraft = blankLead(); M.ui.ldFocus = true; rerender(); },
  ledit:   el => { const l = leadById(el.dataset.v); if (!l || !canEditLead(l)) return toast(t("no_rights")); M.ui.leadDraft = leadDraftOf(l); M.ui.ldFocus = true; rerender(); },
  ledclose:() => { M.ui.leadDraft = null; rerender(); },
  ledsave: () => saveLead(),
  ledstage:el => { setStage(el.dataset.v, el.dataset.s); },
  ledlost: el => { if (setStage(el.dataset.v, "lost", takeInp("why:lost" + el.dataset.v))) { M.ui.ask["lost" + el.dataset.v] = false; rerender(); } },
  lednext: el => { const l = leadById(el.dataset.v), nx = l && nextStage(l.status); if (nx) setStage(l.id, nx); },
  leddel:  el => {
    const l = leadById(el.dataset.v); if (!l || denied("crm.delete") || !canSeeLead(l)) return;
    if (!confirm(tf("crm_lead_delete_q", { no:l.no }))) return;
    // Разговоры с клиентом остаются в его карточке; задачи по лиду удаляются.
    change(() => {
      const target = "l:" + l.id, key = digits(l.phone), tasks = O.crm.tasks.filter(x => x.target === target).length;
      if (key && l.kind !== "b2b") { const r = clientRec("c:" + key); if (!r.phone) r.phone = l.phone; if (!r.name) r.name = l.name;
        for (const n of O.crm.notes) if (n.target === target) n.target = "c:" + key; }
      else O.crm.notes = O.crm.notes.filter(n => n.target !== target);
      O.crm.leads = O.crm.leads.filter(x => x.id !== l.id); O.crm.tasks = O.crm.tasks.filter(x => x.target !== target);
      audit("lead_delete", { no:l.no, name:l.name, tasks:String(tasks) }, { module:"crm" }); });
    toast(t("t_lead_deleted")); go("crm");
  },
  lcsv: () => {
    if (denied("crm.export")) return;
    csvDownload([[ "№", t("crm_name"), t("phone_label"), t("agency_email"), t("crm_country"), t("crm_source"), t("crm_service"), t("crm_dest"), t("crm_budget"), t("crm_stage"), t("crm_manager"), t("crm_created")],
      ...leadRows().map(l => [l.no, l.name, l.phone, l.email, l.country, t("src_" + l.source), l.service ? t("type_" + l.service) : "", leadDest(l), l.budget ?? "", t("ls_" + l.status),
        l.manager ? staffName(l.manager) : "", new Date(l.createdAt).toLocaleString(LOC[S.lang])])], "leads");
    change(() => audit("export", { what:strRef("crm_leads") }, { module:"crm" }));
  },
  ccsv: () => {
    if (!can("crm.export") && !can("b2c.export")) return toast(t("no_rights"));
    csvDownload([[t("customer"), t("crm_type"), t("phone_label"), t("agency_email"), t("crm_segment"), t("crm_source"), t("crm_manager"), t("an_orders"), t("col_spent")],
      ...clientRows().map(c => [c.name, c.b2b ? "B2B" : "B2C", c.phone, c.email || "", t("seg_" + c.segment), t("src_" + c.source), c.manager ? staffName(c.manager) : "", c.orders.length, c.spent])], "clients");
    change(() => audit("export", { what:strRef("crm_clients") }, { module:"crm" }));
  },
  cty: el => { M.ui.cty = el.dataset.v; rerender(); },
  tkd: el => { M.ui.tkd = el.dataset.v; rerender(); }
});
document.addEventListener("input", e => {
  const k = e.target.dataset?.lf; if (k && M.ui.leadDraft) M.ui.leadDraft[k] = e.target.value;
  if (e.target.id === "lq") { M.ui.lq = e.target.value; lRefresh(); }
  if (e.target.id === "cq") { M.ui.cq = e.target.value; cRefresh(); }
});
document.addEventListener("change", e => {
  const k = e.target.dataset?.lf; if (k && M.ui.leadDraft) M.ui.leadDraft[k] = e.target.value;
  const f = { lst:"lst", lsrc:"lsrc", lmg:"lmg" }[e.target.id]; if (f) { M.ui[f] = e.target.value; lRefresh(); }
  if (e.target.id === "csg") { M.ui.csg = e.target.value; cRefresh(); }
  if (e.target.id === "tkw") { M.ui.tkw = e.target.value; rerender(); $("#tkw")?.focus(); }
});
const lRefresh = () => { const l = $("#llist"); if (l) l.innerHTML = leadsList(); const c = $("#lcount"); if (c) c.textContent = tf("crm_count", { n:leadRows().length }); };
const cRefresh = () => { const l = $("#clist"); if (l) l.innerHTML = clientTable(clientRows(), t("crm_clients")); const c = $("#ccount"); if (c) c.textContent = tf("crm_count", { n:clientRows().length }); };
