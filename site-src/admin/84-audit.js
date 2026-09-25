/* ==========================================================================
   Журнал действий: кто (и в какой роли), что, когда, откуда (IP, устройство),
   было → стало. Фильтры по сотруднику, разделу, периоду и тексту; выгрузка
   CSV — по праву audit.export. Записи не удаляются и не правятся.
   ========================================================================== */
"use strict";

/* Раздел старых записей (без поля module) — по действию. */
const AUDIT_MODULE = {
  price:"orders", confirm:"orders", cancel:"orders", refund:"finance", req_done:"b2c", req_declined:"b2c", topup_ok:"finance", topup_rejected:"finance",
  app_ok:"b2b", app_rejected:"b2b", block:"b2b", unblock:"b2b", adjust:"finance", credit:"finance", ag_create:"b2b", ag_edit:"b2b", ag_message:"b2b",
  fee:"pricing", markup:"pricing", pricing:"pricing", dir_add:"services", dir_hide:"services", dir_show:"services", dir_delete:"services",
  staff_add:"staff", staff_off:"staff", staff_on:"staff", staff_role:"staff", staff_edit:"staff", role_new:"roles", role_edit:"roles", role_delete:"roles",
  rules:"settings", reset:"settings", export:"finance", switch:"session", signin:"session", signout:"session"
};
const AU_MODS = [...Object.keys(PERM_MODS), "session"];
const AU_PERIODS = ["all", "today", "7", "30"];
const auditModule = e => e.module || AUDIT_MODULE[e.action] || "session";
/* Роль на момент действия; у старых записей её нет — текущая. */
const auditRole = e => roleName(e.role || O.staff.find(s => s.id === e.staffId)?.role);

function auditRows(){
  const who = M.ui.auWho || "all", mod = M.ui.auMod || "all", per = M.ui.auPer || "all", q = (M.ui.auq || "").trim().toLowerCase();
  // Начало сегодняшнего дня — по часам сейчас: админка может быть открыта с вечера.
  const since = per === "today" ? new Date().setHours(0, 0, 0, 0) : per === "all" ? 0 : Date.now() - Number(per) * DAY_MS;
  return O.audit.filter(e => (who === "all" || e.staffId === who) && (mod === "all" || auditModule(e) === mod) && e.at >= since
    && (!q || [auditText(e), staffName(e.staffId), e.ip || "", ...(e.diff || []).map(diffText)].join(" ").toLowerCase().includes(q)));
}
function auditList(){
  const rows = auditRows();
  if (!rows.length) return `<p class="muted">${esc(t(O.audit.length ? "audit_none_match" : "audit_empty"))}</p>`;
  return `<div class="atable au-table" style="--cols:140px minmax(0,1.2fr) minmax(0,3fr) minmax(0,1.1fr)" role="table" aria-label="${esc(t("an_audit"))}">
    <div class="arow ahead" role="row"><span role="columnheader">${esc(t("col_date"))}</span><span role="columnheader">${esc(t("col_staff"))}</span>
      <span role="columnheader">${esc(t("col_action"))}</span><span role="columnheader">${esc(t("col_where"))}</span></div>
    ${rows.slice(0, AU_SHOW).map(e => `<div class="arow" role="row"><span class="a-cell a-sub muted small" role="cell">${esc(fdt(e.at))}</span>
      <span class="a-cell a-sub wrap" role="cell">${esc(staffName(e.staffId))}<br><span class="muted small">${esc(auditRole(e))}</span></span>
      <span class="a-key" role="cell"><span>${esc(auditText(e))}</span>${e.diff?.length ? `<ul class="ap-diff">${e.diff.map(d => `<li><span class="muted">${esc(diffLabel(d))}:</span> <s>${esc(auditVal(d.from) || "—")}</s>
        <span aria-hidden="true">→</span><span class="sr-only">${esc(t("ap_becomes"))}</span> <b>${esc(auditVal(d.to) || "—")}</b></li>`).join("")}</ul>` : ""}
        <span class="muted small">${esc(t("m_" + auditModule(e)))}</span></span>
      <span class="a-cell small muted" role="cell"><span class="mono">${esc(e.ip || "—")}</span><br>${esc(e.dev || "")}</span></div>`).join("")}</div>
    ${rows.length > AU_SHOW ? `<p class="muted small">${esc(tf("au_more", { n:rows.length - AU_SHOW }))}</p>` : ""}`;
}
/* На экране — последние записи; выгрузка — все подходящие. */
const AU_SHOW = 200;
PAGES.audit = {
  render(){
    const who = M.ui.auWho || "all", mod = M.ui.auMod || "all", per = M.ui.auPer || "all";
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_audit"))}</h1><p class="muted">${esc(t("audit_sub"))}</p></div>
        <button type="button" class="ghost sm" data-act="aucsv" ${guard("audit.export")}>${IC.doc}<span>${esc(t("download_csv"))}</span></button></div>
      <div class="card stack"><div class="ofind au-find">
          <select id="auWho" class="minisel" aria-label="${esc(t("col_staff"))}"><option value="all">${esc(t("staff_all"))}</option>${[...O.staff].sort(byRank).map(s => `<option value="${s.id}" ${who === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          <select id="auMod" class="minisel" aria-label="${esc(t("col_section"))}"><option value="all">${esc(t("au_mod_all"))}</option>${AU_MODS.map(m => `<option value="${m}" ${mod === m ? "selected" : ""}>${esc(t("m_" + m))}</option>`).join("")}</select>
          <select id="auPer" class="minisel" aria-label="${esc(t("au_period"))}">${AU_PERIODS.map(x => `<option value="${x}" ${per === x ? "selected" : ""}>${esc(t("au_per_" + x))}</option>`).join("")}</select>
          <label class="search">${IC.search}<input id="auq" type="search" value="${esc(M.ui.auq || "")}" placeholder="${esc(t("audit_search"))}" aria-label="${esc(t("audit_search"))}"></label></div>
        <p class="muted small" id="aucount" aria-live="polite">${esc(auCount())}</p>
        <div id="aulist">${auditList()}</div></div>
      <p class="muted small" style="margin-top:12px">${esc(t("au_ip_note"))}</p></div>`;
  }
};
const auCount = () => { const n = auditRows().length; return n ? tf("au_count", { n }) : t("audit_none_match"); };
const auRefresh = () => { const l = $("#aulist"); if (l) l.innerHTML = auditList(); const c = $("#aucount"); if (c) c.textContent = auCount(); };
document.addEventListener("input", e => { if (e.target.id === "auq") { M.ui.auq = e.target.value; auRefresh(); } });
document.addEventListener("change", e => {
  const k = { auWho:"auWho", auMod:"auMod", auPer:"auPer" }[e.target.id]; if (!k) return;
  M.ui[k] = e.target.value; auRefresh();
});
ACT.aucsv = () => {
  if (denied("audit.export")) return;
  const when = ms => new Date(ms).toLocaleString(LOC[S.lang]), rows = auditRows();
  const out = [[t("col_date"), t("col_staff"), t("staff_role"), t("col_section"), t("col_action"), t("col_was"), t("col_now"), "IP", t("au_device")],
    ...rows.map(e => [when(e.at), staffName(e.staffId), auditRole(e), t("m_" + auditModule(e)), auditText(e),
      (e.diff || []).map(d => `${diffLabel(d)}: ${auditVal(d.from) || "—"}`).join("; "), (e.diff || []).map(d => `${diffLabel(d)}: ${auditVal(d.to) || "—"}`).join("; "), e.ip || "", e.dev || ""])];
  const blob = new Blob([csvText(out)], { type:"text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:`charteri-audit-${TODAY}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  change(() => audit("export", { what:strRef("an_audit") }, { module:"audit" }));
};
