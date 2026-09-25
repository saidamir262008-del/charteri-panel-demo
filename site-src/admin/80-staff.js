/* ==========================================================================
   Сотрудники: карточка (контакты, должность, отдел, роль), доступ и журнал
   каждого. Роль и новый сотрудник — это права, поэтому по правилу «Роли,
   права и новые сотрудники» их подтверждает второй сотрудник. Удалять нельзя:
   журнал должен помнить, кто что делал; отключённый просто не входит.
   Ниже — настройки админки и вход.
   ========================================================================== */
"use strict";

const DEPTS = ["lead", "finance", "b2b", "b2c", "sales", "ops", "content", "support", "it"];
const DEPT_FALLBACK = "ops";
const deptName = d => t("dept_" + (DEPTS.includes(d) ? d : DEPT_FALLBACK));
const staffById = id => O.staff.find(s => s.id === id) || null;
const blankStaff = () => ({ id:null, name:"", phone:"", email:"", pos:"", dept:"ops", role:"support" });

function staffForm(){
  const d = M.ui.stDraft; if (!d) return "";
  const s0 = d.id ? staffById(d.id) : null, roles = assignableRoles();
  const f = (k, label, attrs = "") => `<label class="field"><span>${esc(t(label))}</span><input data-st="${k}" value="${esc(d[k])}" ${attrs}></label>`;
  return `<section class="card stack cl-edit" id="stedit" aria-labelledby="stedit-h"><div class="card-h"><h2 id="stedit-h">${esc(s0 ? tf("staff_edit_of", { name:s0.name }) : t("staff_new"))}</h2>
      <button type="button" class="iconbtn" data-act="stclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      ${f("name", "staff_name", 'maxlength="60" autocomplete="off"')}
      ${f("phone", "phone_label", 'type="tel" placeholder="+998" autocomplete="off"')}
      ${f("email", "agency_email", 'type="email" maxlength="80" autocomplete="off"')}
      ${f("pos", "staff_pos", 'maxlength="60" autocomplete="off"')}
      <label class="field"><span>${esc(t("staff_dept"))}</span><select data-st="dept">${DEPTS.map(x => `<option value="${x}" ${d.dept === x ? "selected" : ""}>${esc(t("dept_" + x))}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(t("staff_role"))}</span><select data-st="role">${roles.map(r => `<option value="${esc(r.id)}" ${d.role === r.id ? "selected" : ""}>${esc(roleName(r.id))}</option>`).join("")}</select></label>
    </div>
    ${needsApproval("staff_role") ? `<p class="muted small">${esc(t("staff_role_ap"))}</p>` : ""}
    <div class="err" id="sterr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="stsave">${esc(t(s0 ? "st_save" : "staff_add"))}</button><button type="button" class="link" data-act="stclose">${esc(t("cancel"))}</button></div></section>`;
}
/* Строка сотрудника. Кнопки — только тем, кому можно менять этого человека. */
function staffRow(s, cur){
  const off = s.active === false, self = s.id === cur.id, mng = canManageStaff(s), rq = pendingAp("staff_role:" + s.id);
  const acts = [
    mng ? `<button type="button" class="link" data-act="stedit" data-v="${s.id}" aria-label="${esc(t("edit"))}: ${esc(s.name)}" ${guard("staff.edit")}>${esc(t("edit"))}</button>` : "",
    can("audit.view") ? `<button type="button" class="link" data-act="stlog" data-v="${s.id}" aria-label="${esc(tf("staff_log_of", { name:s.name }))}">${esc(t("staff_log"))}</button>` : "",
    !self && !off ? `<button type="button" class="link" data-act="aswitch" data-v="${s.id}">${esc(t("staff_as"))}</button>` : "",
    mng ? `<button type="button" class="link ${off ? "" : "danger"}" data-act="${off ? "ston" : "stoff"}" data-v="${s.id}" ${guard("staff.edit")}>${esc(t(off ? "staff_enable" : "staff_disable"))}</button>` : ""
  ].filter(Boolean).join("");
  return `<div class="arow ${off ? "past" : ""}" role="row"><span class="a-main a-with-mark" role="cell"><span class="avatar sm" aria-hidden="true">${esc(monogram(s.name))}</span>
      <span class="stack" style="gap:1px;min-width:0"><b>${esc(s.name)}</b><span class="small muted">${esc(loc(s.pos) || "—")}</span>${off ? `<span class="small muted">${esc(t("staff_off"))}</span>` : ""}</span></span>
    <span class="a-cell a-sub wrap" role="cell">${esc(roleName(s.role))}${rq ? `<br><span class="pill st-PENDING">${esc(tf("staff_role_pending", { role:roleName(rq.payload.to) }))}</span>` : ""}</span>
    <span class="a-cell small wrap" role="cell">${esc(deptName(s.dept))}</span>
    <span class="a-cell small" role="cell"><span class="mono">${esc(s.phone)}</span><br><span class="muted">${esc(s.email || "—")}</span></span>
    <span class="a-end row st-acts" role="cell">${self ? `<span class="pill st-CONFIRMED">${esc(t("staff_you"))}</span>` : ""}${acts}</span></div>`;
}
PAGES.staff = {
  render(){
    const cur = me(), waiting = O.approvals.filter(a => a.status === "pending" && a.kind === "staff_add");
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_staff"))}</h1><p class="muted">${esc(t("staff_sub"))}</p></div>
        <button type="button" class="solid" data-act="stnew" ${guard("staff.create")}>${IC.plus}<span>${esc(t("staff_new"))}</span></button></div>
      ${staffForm()}
      <section class="card stack"><div class="card-h"><h2>${esc(t("staff_people"))}</h2>${can("roles.view") ? `<a class="link" href="#/roles">${esc(t("an_roles"))}</a>` : ""}</div>
        <div class="atable st-table" style="--cols:minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.4fr) 240px" role="table" aria-label="${esc(t("staff_people"))}">
          <div class="arow ahead" role="row"><span role="columnheader">${esc(t("col_staff"))}</span><span role="columnheader">${esc(t("staff_role"))}</span>
            <span role="columnheader">${esc(t("staff_dept"))}</span><span role="columnheader">${esc(t("col_contacts"))}</span><span role="columnheader"><span class="sr-only">${esc(t("actions"))}</span></span></div>
          ${[...O.staff].sort(byRank).map(s => staffRow(s, cur)).join("")}
          ${waiting.map(a => `<div class="arow past" role="row"><span class="a-main a-with-mark" role="cell"><span class="avatar sm" aria-hidden="true">${esc(monogram(a.payload.rec.name))}</span>
              <span class="stack" style="gap:1px;min-width:0"><b>${esc(a.payload.rec.name)}</b><span class="small muted">${esc(loc(a.payload.rec.pos))}</span></span></span>
            <span class="a-cell a-sub" role="cell">${esc(roleName(a.payload.rec.role))}</span><span class="a-cell small" role="cell">${esc(deptName(a.payload.rec.dept))}</span>
            <span class="a-cell small mono" role="cell">${esc(a.payload.rec.phone)}</span><span class="a-end" role="cell"><span class="pill st-PENDING">${esc(t("ap_wait"))}</span></span></div>`).join("")}
        </div></section></div>`;
  },
  after(){ if (M.ui.stDraft && M.ui.stFocus) { $("#stedit [data-st=name]")?.focus(); M.ui.stFocus = false; } }
};

/* ---- сохранение ---- */
/* Ошибка и поле, к которому она относится. */
function staffError(d, s0){
  const name = d.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) return ["err_staff_name", "name"];
  if (!validPhone(d.phone)) return ["err_phone", "phone"];
  if (O.staff.some(s => s.id !== d.id && digits(s.phone) === digits(d.phone))) return ["err_staff_phone", "phone"];
  if (!validEmail(d.email.trim())) return ["err_email", "email"];
  if (d.pos.trim().length < 2) return ["err_staff_pos", "pos"];
  if (!DEPTS.includes(d.dept)) return ["err_staff_pos", "dept"];
  if (d.role !== s0?.role && !assignableRoles().some(r => r.id === d.role)) return ["no_rights", "role"];
  return null;
}
function staffInvalid(err){
  $$("#stedit [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  const f = $(`#stedit [data-st="${err[1]}"]`);
  if (f) { f.setAttribute("aria-invalid", "true"); f.setAttribute("aria-describedby", "sterr"); }
  showErr("#sterr", t(err[0])); f?.focus({ preventScroll:true });
}
const STAFF_FIELDS = [["name", "staff_name"], ["phone", "phone_label"], ["email", "agency_email"], ["pos", "staff_pos"], ["dept", "staff_dept"]];
const deptOf = s => DEPTS.includes(s?.dept) ? s.dept : DEPT_FALLBACK, deptVal = v => strRef("dept_" + (DEPTS.includes(v) ? v : DEPT_FALLBACK));
function saveStaff(){
  const d = M.ui.stDraft; if (!d) return;
  const s0 = d.id ? staffById(d.id) : null;
  if (denied(s0 ? "staff.edit" : "staff.create")) return;
  if (s0 && !canManageStaff(s0)) return toast(t("no_rights"));
  const err = staffError(d, s0); if (err) return staffInvalid(err);
  const pos = d.pos.trim().replace(/\s+/g, " ");
  const rec = { name:d.name.trim().replace(/\s+/g, " "), phone:prettyPhone(d.phone), email:d.email.trim(), pos:s0 && pos === loc(s0.pos) ? s0.pos : pos, dept:d.dept };
  if (!s0) {
    const full = { id:uid("st"), ...rec, role:d.role, active:true, addedBy:me().id, addedAt:Date.now() };
    const payload = { rec:full }, vars = { name:full.name, role:roleRef(full.role) };
    if (needsApproval("staff_add")) { if (requestApproval("staff_add", { key:"staff_add:" + digits(full.phone), payload, vars })) { M.ui.stDraft = null; rerender(); } return; }
    let e = null; change(() => { e = execStaffAdd(payload); });
    M.ui.stDraft = null; rerender(); toast(e ? t(e) : tf("t_staff_add", { name:full.name }));
    return;
  }
  // Контакты, должность, отдел — сразу; роль — отдельно, через подтверждение.
  const old = { ...s0, dept:deptOf(s0) };
  const diff = STAFF_FIELDS.filter(([k]) => loc(rec[k]) !== loc(old[k]))
    .map(([k, label]) => ({ k:label, from:k === "dept" ? deptVal(old.dept) : old[k] ?? "", to:k === "dept" ? deptVal(rec.dept) : rec[k] }));
  if (diff.length) change(() => { const s = staffById(s0.id); if (!s) return; Object.assign(s, rec); audit("staff_edit", { name:rec.name }, { diff }); });
  M.ui.stDraft = null; rerender();
  if (d.role !== s0.role) changeStaffRole(staffById(s0.id), d.role);
  else toast(diff.length ? tf("t_staff_edit", { name:rec.name }) : t("role_same"));
}
function changeStaffRole(s, role){
  if (!s || !canManageStaff(s) || !assignableRoles().some(r => r.id === role)) return toast(t("no_rights"));
  const payload = { staffId:s.id, from:s.role, to:role }, vars = { name:s.name, from:roleRef(s.role), to:roleRef(role) };
  if (needsApproval("staff_role")) return requestApproval("staff_role", { key:"staff_role:" + s.id, payload, vars, diff:[{ k:"staff_role", from:vars.from, to:vars.to }] });
  let e = null; change(() => { e = execStaffRole(payload); });
  toast(e ? t(e) : tf("t_staff_role", { name:s.name, from:roleName(payload.from), to:roleName(role) }));
}
/* Исполнители (см. 17-approvals.js): работают внутри change(). */
function execStaffAdd({ rec }){
  if (O.staff.some(s => digits(s.phone) === digits(rec.phone))) return "err_staff_phone";
  if (!roleById(rec.role) || roleById(rec.role).deleted) return "ap_err_gone";
  O.staff.push({ ...rec });
  audit("staff_add", { name:rec.name, role:roleRef(rec.role) });
  return null;
}
function execStaffRole({ staffId, from, to }){
  const s = staffById(staffId); if (!s) return "ap_err_gone";
  if (s.role !== from) return "ap_err_changed";
  if (!roleById(to) || roleById(to).deleted) return "ap_err_gone";
  if (from === "founder" && to !== "founder" && !foundersLeft(s.id)) return "err_last_founder";
  s.role = to; withdrawAllBy(s.id);
  audit("staff_role", { name:s.name, from:roleRef(from), to:roleRef(to) }, { diff:[{ k:"staff_role", from:roleRef(from), to:roleRef(to) }] });
  return null;
}
function setStaffActive(id, on){
  if (denied("staff.edit")) return;
  const s = staffById(id); if (!s || !canManageStaff(s)) return toast(t(s?.id === me().id ? "err_staff_self" : "no_rights"));
  if (!on && s.role === "founder" && !foundersLeft(s.id)) return toast(t("err_last_founder"));
  change(() => { const x = staffById(id); if (!x) return; x.active = on; if (!on) withdrawAllBy(x.id);
    audit(on ? "staff_on" : "staff_off", { name:x.name }, { diff:[{ k:"col_status", from:strRef(on ? "staff_status_off" : "staff_status_on"), to:strRef(on ? "staff_status_on" : "staff_status_off") }] }); });
  toast(tf(on ? "t_staff_on" : "t_staff_off", { name:s.name }));
  $(`[data-act="${on ? "stoff" : "ston"}"][data-v="${id}"]`)?.focus();
}
Object.assign(ACT, {
  aswitch: el => {
    const s = O.staff.find(x => x.id === el.dataset.v && x.active !== false); if (!s) return;
    M.ui = {};
    change(() => { O.session = { staffId:s.id, at:Date.now() }; audit("switch", { name:s.name, role:roleRef(s.role) }); });
    toast(tf("switched", { name:s.name, role:roleName(s.role) }));
  },
  stnew:   () => { if (denied("staff.create")) return; M.ui.stDraft = blankStaff(); M.ui.stFocus = true; rerender(); },
  stedit:  el => { const s = staffById(el.dataset.v); if (denied("staff.edit") || !s) return; if (!canManageStaff(s)) return toast(t("no_rights"));
    M.ui.stDraft = { id:s.id, name:s.name, phone:s.phone, email:s.email || "", pos:loc(s.pos), dept:DEPTS.includes(s.dept) ? s.dept : DEPT_FALLBACK, role:s.role }; M.ui.stFocus = true; rerender(); },
  stclose: () => { M.ui.stDraft = null; rerender(); $('[data-act="stnew"]')?.focus(); },
  stsave:  () => saveStaff(),
  stoff:   el => setStaffActive(el.dataset.v, false),
  ston:    el => setStaffActive(el.dataset.v, true),
  /* Журнал одного сотрудника. */
  stlog:   el => { M.ui.auWho = el.dataset.v; M.ui.auMod = "all"; M.ui.auPer = "all"; M.ui.auq = ""; go("audit"); }
});
document.addEventListener("input", e => { const k = e.target.dataset?.st; if (k && M.ui.stDraft) M.ui.stDraft[k] = e.target.value; });
document.addEventListener("change", e => { const k = e.target.dataset?.st; if (k && M.ui.stDraft) M.ui.stDraft[k] = e.target.value; });

/* ---- настройки ---- */
PAGES.settings = {
  render(){
    return `<div class="page narrow-page">
      <div class="pagehead"><h1>${esc(t("an_settings"))}</h1></div>
      <div class="stack">
        <section class="card stack"><h2>${esc(t("settings"))}</h2>
          <div class="setrow"><span>${esc(t("language"))}</span>${seg("asetlang", [["uz","O‘zbekcha"],["ru","Русский"],["en","English"]], O.lang)}</div>
          <div class="setrow"><span>${esc(t("appearance"))}</span>${seg("asettheme", [["system", t("theme_system")],["light", t("theme_light")],["dark", t("theme_dark")]], O.theme)}</div></section>
        <section class="card stack"><h2>${esc(t("demo_link"))}</h2><p class="muted">${esc(t("demo_link_d"))}</p>
          <div class="row"><a class="ghost sm" href="../" target="_blank" rel="noopener">${esc(t("open_cabinet"))}</a><a class="ghost sm" href="../b2c/" target="_blank" rel="noopener">${esc(t("open_site"))}</a></div>
          <p class="muted small">${esc(t("demo_live_d"))}</p></section>
        <section class="card stack"><h2>${esc(t("session"))}</h2>
          <div class="rows"><div><span class="k">${esc(t("signed_staff"))}</span><span class="v">${esc(me().name)} · ${esc(roleName(me().role))}</span></div></div>
          <div class="row"><button type="button" class="ghost sm" data-act="asignout">${IC.out}<span>${esc(t("sign_out"))}</span></button>
            <button type="button" class="link danger" data-act="areset" ${guard("settings.manage")}>${esc(t("reset_all"))}</button></div></section>
      </div></div>`;
  }
};
Object.assign(ACT, {
  asetlang:   el => { O.lang = el.dataset.v; adminPrefs(); saveOps(); rerender(); },
  asettheme:  el => { O.theme = el.dataset.v; adminPrefs(); saveOps(); withTransition(rerender, "theme"); },
  asignout:   () => { change(() => { audit("signout", {}); O.session = null; }); stopHeartbeat(); toast(t("signed_out")); go(""); },
  /* Сброс всех трёх демо: кабинет, сайт, админка, цены, заявки. Сотрудник остаётся в админке. */
  areset:     () => {
    if (denied("settings.manage") || !confirm(t("reset_all_q"))) return;
    const session = O.session;
    for (const k of [CAB_KEY, SITE_KEY, OPS_KEY, PRICES_KEY, APPS_KEY, DIRS_KEY]) try { localStorage.removeItem(k); } catch(e) {}
    PRICES = null; M.ui = {}; applyDirections();
    S = freshState(); S.session = null; S.rev = 1; writeJSON(CAB_KEY, S);
    // Сотрудника, добавленного вручную, в исходных данных нет — входим основателем.
    O = freshOps({ lang:O.lang, theme:O.theme, session:STAFF.some(s => s.id === session?.staffId) ? session : { staffId:FOUNDER_ID, at:Date.now() } }); saveOps(); SITE = null; seedApps();
    change(() => audit("reset", {})); go("");
  }
});

/* ---- вход сотрудника ---- */
const ADM_CODE = "0000";
PAGES.auth = {
  render(){
    const step = M.ui.aStep || "phone";
    return `<div class="auth adm-auth">
      <section class="auth-side"><span class="wordmark" aria-hidden="true">CHARTERI<b>.UZ</b></span>
        <div class="auth-copy"><h1>${esc(t("aauth_h"))}</h1><p>${esc(t("aauth_p"))}</p></div>
        <ul class="auth-mods" aria-hidden="true">${["an_tasks", "an_orders", "an_agencies", "an_finance"].map(k => `<li><span>${esc(t(k))}</span></li>`).join("")}</ul></section>
      <section class="auth-main"><div class="card stack authcard">
        ${step === "phone" ? `<h2>${esc(t("aauth_title"))}</h2><p class="muted">${esc(t("aauth_sub"))}</p>
          <label class="field"><span>${esc(t("phone_label"))}</span><input id="aph" type="tel" inputmode="tel" autocomplete="tel" value="${esc(M.ui.aPhone || activeStaff()[0]?.phone || "")}"></label>
          <div class="stack" style="gap:6px"><span class="lbl">${esc(t("aauth_demo"))}</span><div class="tchips">${activeStaff().map(s => `<button type="button" class="tchip" data-act="apick" data-v="${esc(s.phone)}">${esc(s.name.split(" ")[0])} · ${esc(roleName(s.role))}</button>`).join("")}</div></div>
          <div class="err" id="aerr" hidden></div><button type="button" class="cta" data-act="asend">${esc(t("login_cta"))}</button>`
        : `<h2>${esc(t("otp_title"))}</h2><p class="muted">${esc(t("otp_sub"))} <b class="mono">${esc(M.ui.aPhone)}</b></p>
          <input id="aotp" class="otp" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••" aria-label="${esc(t("otp_title"))}">
          <p class="small muted center">${esc(tf("otp_demo", { code:ADM_CODE }))}</p><div class="err" id="aerr" hidden></div>
          <button type="button" class="cta" data-act="averify">${esc(t("otp_cta"))}</button><button type="button" class="link" data-act="aback">${esc(t("change_number"))}</button>`}
        <p class="demo-note">${esc(t("demo_banner"))}</p></div></section></div>`;
  },
  after(){ $("#aotp")?.focus(); }
};
function aVerify(){
  const v = ($("#aotp")?.value || "").trim();
  if (!/^\d{4}$/.test(v)) return showErr("#aerr", t("err_code"));
  if (v !== ADM_CODE) return showErr("#aerr", t("err_code_wrong"));
  const s = activeStaff().find(x => digits(x.phone) === digits(M.ui.aPhone)); if (!s) return showErr("#aerr", t("err_staff"));
  change(() => { O.session = { staffId:s.id, at:Date.now() }; audit("signin", { role:roleRef(s.role) }); });
  M.ui = { aStep:"phone" }; heartbeat(); toast(tf("hello_toast", { name:s.name.split(" ")[0] }));
  if (currentParts()[0] === "auth") go(""); else render(true);
}
Object.assign(ACT, {
  apick:   el => { M.ui.aPhone = el.dataset.v; rerender(); },
  asend:   () => {
    const v = $("#aph").value; if (!validPhone(v)) return showErr("#aerr", t("err_phone"));
    if (!activeStaff().some(x => digits(x.phone) === digits(v))) return showErr("#aerr", t(O.staff.some(x => digits(x.phone) === digits(v)) ? "err_staff_off" : "err_staff"));
    M.ui.aPhone = prettyPhone(v); M.ui.aStep = "code"; rerender();
  },
  averify: () => aVerify(),
  aback:   () => { M.ui.aStep = "phone"; rerender(); }
});
document.addEventListener("input", e => { if (e.target.id === "aotp") { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); if (e.target.value.length === 4) aVerify(); } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "aph") ACT.asend(); });
