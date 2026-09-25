/* ==========================================================================
   Роли и права: список ролей и таблица прав выбранной — разделы × действия.
   Основатель меняет права любой роли, кроме своей, и заводит новые роли.
   Изменение прав — это права, поэтому по правилу «Роли, права и новые
   сотрудники» его подтверждает второй сотрудник (кроме действий основателя).
   ========================================================================== */
"use strict";

const ROLE_NAME_MAX = 40;
const holders = id => O.staff.filter(s => s.role === id);
const selRole = () => { const r = roleById(M.ui.roleSel); return r && !r.deleted ? r : roleById("owner"); };
/* Черновик прав выбранной роли: base — права на момент первой галочки,
   perms — отмеченные. Пока черновика нет — показываем сохранённые. */
const draftPerms = r => M.ui.roleDraft?.id === r.id ? M.ui.roleDraft.perms : permsOf(r.id);
const permDiff = (from, to) => Object.keys(PERM_MODS).filter(m => (from[m] || []).join() !== (to[m] || []).join())
  .map(m => ({ k:"m_" + m, from:{ acts:[...(from[m] || [])] }, to:{ acts:[...(to[m] || [])] } }));

function roleList(sel){
  return `<nav class="role-list" aria-label="${esc(t("role_pick"))}">${liveRoles().map(r => {
    const n = holders(r.id).filter(s => s.active !== false).length;
    return `<button type="button" class="role-item" data-act="rolesel" data-v="${esc(r.id)}" aria-current="${r.id === sel.id}">
      <span class="stack" style="gap:1px;min-width:0"><b>${esc(roleName(r.id))}</b><span class="small muted">${esc(r.sys ? t("role_sys") : t("role_custom"))} · ${esc(tf("role_n", { n }))}</span></span>
      ${pendingAp("role_edit:" + r.id) ? `<span class="pill st-PENDING">${esc(t("ap_wait"))}</span>` : ""}</button>`; }).join("")}</nav>`;
}
/* Почему права этой роли нельзя менять — или "" если можно. */
function roleLock(r){
  if (r.id === "founder") return t("role_founder_note");
  if (r.id === me().role && !isFounder()) return t("role_own_note");
  return canEditRole(r) ? "" : t("role_ro_note");
}
function roleMatrix(r){
  const p = draftPerms(r), lock = roleLock(r), name = roleName(r.id);
  return `<div class="matrix-wrap"><table class="matrix pm"><caption class="sr-only">${esc(tf("role_perms_h", { role:name }))}</caption>
    <thead><tr><th scope="col">${esc(t("col_section"))}</th>${PERM_ACTS.map(a => `<th scope="col">${esc(t("act_" + a))}</th>`).join("")}</tr></thead>
    <tbody>${Object.entries(PERM_MODS).map(([m, acts]) => `<tr><th scope="row">${esc(t("m_" + m))}</th>${PERM_ACTS.map(a => {
      if (!acts.includes(a)) return `<td><span class="no" aria-hidden="true">·</span></td>`;
      const on = !!p[m]?.includes(a), what = t(`pm_${m}_${a}`);
      return `<td><label class="pm-cell" title="${esc(what)}"><input type="checkbox" data-pm="${m}.${a}" ${on ? "checked" : ""} ${lock ? "disabled" : ""}>
        <span class="sr-only">${esc(t("m_" + m))}: ${esc(what)}</span></label></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function roleEditor(r){
  const lock = roleLock(r), n = M.ui.roleDraft?.id === r.id ? permDiff(M.ui.roleDraft.base, M.ui.roleDraft.perms).length : 0;
  const people = holders(r.id), pend = pendingAp("role_edit:" + r.id);
  return `<section class="card stack role-ed" aria-labelledby="role-h">
    <div class="card-h"><div class="stack" style="gap:4px"><h2 id="role-h" tabindex="-1">${esc(tf("role_perms_h", { role:roleName(r.id) }))}</h2>
      <span class="muted small">${esc(r.sys ? t("rd_" + r.id) : tf("role_by", { name:staffName(r.by) }))}</span></div>
      ${!r.sys && can("roles.delete") && !people.length ? `<button type="button" class="link danger" data-act="roledel" data-v="${esc(r.id)}" ${pendingAp("role_del:" + r.id) ? "disabled" : ""}>${esc(t("role_delete"))}</button>` : ""}</div>
    ${lock ? `<p class="note-live">${IC.lock}<span>${esc(lock)}</span></p>` : `<p class="muted small">${esc(t("role_view_hint"))}</p>`}
    ${pend ? `<p class="note-live">${IC.clock}<span>${esc(t("role_pending"))}</span></p>${apDiff(pend)}` : ""}
    ${roleMatrix(r)}
    ${lock ? "" : `<div class="row"><button type="button" class="solid" data-act="rolesave" ${n ? "" : "disabled"}>${esc(t("role_save"))}</button>
      ${n ? `<button type="button" class="link" data-act="rolereset">${esc(t("cancel"))}</button><span class="muted small">${esc(tf("role_changed", { n }))}</span>` : ""}
      ${needsApproval("role_edit") ? `<span class="muted small">${esc(t("staff_role_ap"))}</span>` : ""}</div>`}
    ${people.length ? `<p class="small muted">${esc(t("role_people"))}: ${esc(people.map(s => s.name).join(", "))}</p>` : ""}
    <details class="pm-legend"><summary>${esc(t("role_legend"))}</summary><dl>${Object.entries(PERM_MODS).map(([m, acts]) =>
      `<dt>${esc(t("m_" + m))}</dt><dd>${acts.map(a => `<b>${esc(t("act_" + a))}</b> — ${esc(t(`pm_${m}_${a}`))}`).join("; ")}</dd>`).join("")}</dl></details>
  </section>`;
}
function roleNewForm(){
  const d = M.ui.roleNew; if (!d) return "";
  return `<section class="card stack cl-edit" id="rolenew" aria-labelledby="rolenew-h"><div class="card-h"><h2 id="rolenew-h">${esc(t("role_new"))}</h2>
      <button type="button" class="iconbtn" data-act="rolenewclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      <label class="field"><span>${esc(t("role_name"))}</span><input data-rn="name" value="${esc(d.name)}" maxlength="${ROLE_NAME_MAX}" autocomplete="off"></label>
      <label class="field"><span>${esc(t("role_copy"))}</span><select data-rn="copy">${liveRoles().filter(r => r.id !== "founder").map(r => `<option value="${esc(r.id)}" ${d.copy === r.id ? "selected" : ""}>${esc(roleName(r.id))}</option>`).join("")}</select></label>
    </div><div class="err" id="rnerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="rolecreate">${esc(t("role_create"))}</button><button type="button" class="link" data-act="rolenewclose">${esc(t("cancel"))}</button></div></section>`;
}
PAGES.roles = {
  render(){
    const r = selRole();
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_roles"))}</h1><p class="muted">${esc(t("roles_sub"))}</p></div>
        <button type="button" class="solid" data-act="rolenew" ${guard("roles.create")}>${IC.plus}<span>${esc(t("role_new"))}</span></button></div>
      ${roleNewForm()}
      <div class="roles-grid">${roleList(r)}${roleEditor(r)}</div>
      <p class="muted small" style="margin-top:12px">${esc(t("staff_matrix_d"))}</p></div>`;
  },
  after(){ if (M.ui.roleNew && M.ui.rnFocus) { $("#rolenew [data-rn=name]")?.focus(); M.ui.rnFocus = false; } }
};

/* ---- галочки ----
   Действие без просмотра раздела бессмысленно: включили действие — включился
   просмотр; сняли просмотр — снялись все действия раздела. */
document.addEventListener("change", e => {
  const k = e.target.dataset?.pm; if (!k) return;
  const r = selRole(); if (!canEditRole(r)) return;
  const [m, a] = k.split("."), perms = clonePermsOf(draftPerms(r));
  const base = M.ui.roleDraft?.id === r.id ? M.ui.roleDraft.base : clonePermsOf(permsOf(r.id));
  const set = new Set(perms[m] || []);
  if (e.target.checked) { set.add(a); set.add("view"); } else if (a === "view") set.clear(); else set.delete(a);
  perms[m] = PERM_MODS[m].filter(x => set.has(x)); if (!perms[m].length) delete perms[m];
  M.ui.roleDraft = samePerms(perms, base) ? null : { id:r.id, base, perms };
  rerender(); $(`[data-pm="${k}"]`)?.focus();
  announce(tf("role_changed", { n:M.ui.roleDraft ? permDiff(base, perms).length : 0 }));
});
const clonePermsOf = p => Object.fromEntries(Object.entries(p).map(([m, a]) => [m, [...a]]));
document.addEventListener("input", e => { const k = e.target.dataset?.rn; if (k && M.ui.roleNew) M.ui.roleNew[k] = e.target.value; });
document.addEventListener("change", e => { const k = e.target.dataset?.rn; if (k && M.ui.roleNew) M.ui.roleNew[k] = e.target.value; });

/* ---- сохранение ---- */
function saveRolePerms(){
  const r = selRole(), d = M.ui.roleDraft; if (!d || d.id !== r.id) return;
  if (!canEditRole(r)) return toast(t("no_rights"));
  // Пока отмечали галочки, права роли могли поменять в другой вкладке.
  if (!samePerms(permsOf(r.id), d.base)) { M.ui.roleDraft = null; rerender(); $("#role-h")?.focus(); return toast(t("ap_err_changed")); }
  const from = clonePermsOf(d.base), to = cleanPerms(d.perms);
  if (samePerms(from, to)) { M.ui.roleDraft = null; rerender(); return toast(t("role_same")); }
  if (grantsBeyondMine(from, to).length) return toast(t("err_grant_beyond"));
  const payload = { roleId:r.id, from, to }, vars = { role:roleRef(r.id) }, diff = permDiff(from, to);
  if (needsApproval("role_edit")) { if (requestApproval("role_edit", { key:"role_edit:" + r.id, payload, vars, diff })) { M.ui.roleDraft = null; rerender(); $("#role-h")?.focus(); } return; }
  let e = null; change(() => { e = execRoleEdit(payload); });
  M.ui.roleDraft = null; rerender(); $("#role-h")?.focus(); toast(e ? t(e) : tf("t_role_saved", { role:roleName(r.id) }));
}
/* Название уникально среди действующих ролей — на всех трёх языках системных. */
function roleNameTaken(name){
  const n = name.toLowerCase();
  return liveRoles().some(r => (r.sys ? ["ru", "uz", "en"].map(l => roleName(r.id, l)) : [r.name]).some(x => x.toLowerCase() === n));
}
function createRole(){
  if (denied("roles.create")) return;
  const d = M.ui.roleNew, name = d.name.trim().replace(/\s+/g, " "), base = roleById(d.copy);
  if (name.length < 2 || name.length > ROLE_NAME_MAX) return showErr("#rnerr", t("err_role_name"));
  if (roleNameTaken(name)) return showErr("#rnerr", t("err_role_dup"));
  if (!base || base.deleted || base.id === "founder") return;
  const perms = clonePermsOf(permsOf(base.id));
  if (grantsBeyondMine({}, perms).length) return showErr("#rnerr", t("err_grant_beyond"));
  const role = { id:uid("r"), name, perms }, payload = { role }, vars = { role:name };
  const diff = permDiff({}, perms);
  if (needsApproval("role_new")) { if (requestApproval("role_new", { key:"role_new:" + name.toLowerCase(), payload, vars, diff })) { M.ui.roleNew = null; rerender(); } return; }
  let e = null; change(() => { e = execRoleNew(payload); });
  if (e) return showErr("#rnerr", t(e));
  M.ui.roleNew = null; M.ui.roleSel = role.id; M.ui.roleDraft = null; rerender(); toast(tf("t_role_new", { role:name }));
  $(`[data-act="rolesel"][data-v="${CSS.escape(role.id)}"]`)?.scrollIntoView({ block:"nearest", inline:"nearest" }); $("#role-h")?.focus();
}
function deleteRole(id){
  const r = roleById(id); if (!r || r.sys || r.deleted || denied("roles.delete")) return;
  if (holders(id).length) return toast(t("err_role_used"));
  if (!confirm(tf("role_delete_q", { role:r.name }))) return;
  const payload = { roleId:id }, vars = { role:r.name };
  if (needsApproval("role_del")) { requestApproval("role_del", { key:"role_del:" + id, payload, vars }); return; }
  let e = null; change(() => { e = execRoleDel(payload); });
  if (e) return toast(t(e));
  M.ui.roleSel = null; M.ui.roleDraft = null; rerender(); toast(tf("t_role_del", { role:r.name })); $("h1")?.focus();
}
/* Исполнители (см. 17-approvals.js): работают внутри change(). */
function execRoleEdit({ roleId, from, to }){
  const r = roleById(roleId); if (!r || r.deleted || r.id === "founder") return "ap_err_gone";
  if (!samePerms(r.perms, from)) return "ap_err_changed";
  r.perms = cleanPerms(to);
  audit("role_edit", { role:roleRef(r.id) }, { diff:permDiff(from, r.perms) });
  return null;
}
/* ap — запрос, если роль создаётся по нему: автор роли — тот, кто просил. */
function execRoleNew({ role }, ap){
  if (roleNameTaken(role.name)) return "err_role_dup";
  const perms = cleanPerms(role.perms);
  O.roles.push({ id:role.id, sys:false, name:role.name, perms, by:ap ? ap.by : me().id, ...(ap ? { approvedBy:me().id } : {}), at:Date.now() });
  audit("role_new", { role:role.name }, { diff:permDiff({}, perms) });
  return null;
}
/* Роль не удаляется из данных: журнал помнит её название. */
function execRoleDel({ roleId }){
  const r = roleById(roleId); if (!r || r.sys || r.deleted) return "ap_err_gone";
  if (holders(roleId).length) return "err_role_used";
  r.deleted = true; r.deletedAt = Date.now();
  audit("role_delete", { role:r.name });
  return null;
}
Object.assign(ACT, {
  rolesel:      el => { if (M.ui.roleSel !== el.dataset.v) M.ui.roleDraft = null; M.ui.roleSel = el.dataset.v; rerender(); $(`[data-act="rolesel"][data-v="${CSS.escape(el.dataset.v)}"]`)?.focus(); },
  rolesave:     () => saveRolePerms(),
  rolereset:    () => { M.ui.roleDraft = null; rerender(); $('[data-pm]:not(:disabled)')?.focus(); },
  rolenew:      () => { if (denied("roles.create")) return; M.ui.roleNew = { name:"", copy:"viewer" }; M.ui.rnFocus = true; rerender(); },
  rolenewclose: () => { M.ui.roleNew = null; rerender(); $('[data-act="rolenew"]')?.focus(); },
  rolecreate:   () => createRole(),
  roledel:      el => deleteRole(el.dataset.v)
});
