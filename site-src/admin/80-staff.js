/* ==========================================================================
   Сотрудники и права ролей, журнал действий, настройки админки, вход.
   ========================================================================== */
"use strict";

/* Сотрудники: добавить, сменить роль, отключить. Удалять нельзя — журнал
   должен помнить, кто что делал; отключённый просто не входит. */
const staffRoleSel = (s, disabled) => `<select class="minisel" data-staff-role="${s.id}" aria-label="${esc(tf("staff_role_of", { name:s.name }))}" ${disabled ? "disabled" : ""}>
  ${ROLES.map(r => `<option value="${r}" ${s.role === r ? "selected" : ""}>${esc(roleName(r))}</option>`).join("")}</select>`;
function staffForm(){
  const d = M.ui.stDraft; if (!d) return "";
  return `<section class="card stack cl-edit" id="stedit"><div class="card-h"><h2>${esc(t("staff_new"))}</h2>
      <button type="button" class="iconbtn" data-act="stclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      <label class="field"><span>${esc(t("staff_name"))}</span><input data-st="name" value="${esc(d.name)}" maxlength="60" autocomplete="off"></label>
      <label class="field"><span>${esc(t("phone_label"))}</span><input data-st="phone" type="tel" value="${esc(d.phone)}" placeholder="+998" autocomplete="off"></label>
      <label class="field"><span>${esc(t("staff_role"))}</span><select data-st="role">${ROLES.map(r => `<option value="${r}" ${d.role === r ? "selected" : ""}>${esc(roleName(r))}</option>`).join("")}</select></label>
    </div><div class="err" id="sterr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="stsave">${esc(t("staff_add"))}</button><button type="button" class="link" data-act="stclose">${esc(t("cancel"))}</button></div></section>`;
}
PAGES.staff = {
  render(){
    const cur = me(), edit = can("staff.edit");
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_staff"))}</h1><p class="muted">${esc(t("staff_sub"))}</p></div>
        <button type="button" class="solid" data-act="stnew" ${guard("staff.edit")}>${IC.plus}<span>${esc(t("staff_new"))}</span></button></div>
      ${staffForm()}
      <section class="card stack"><h2>${esc(t("staff_people"))}</h2>
        <div class="atable" style="--cols:minmax(0,2fr) minmax(0,1.5fr) minmax(0,1.2fr) auto">
          ${O.staff.map(s => { const off = s.active === false, self = s.id === cur.id;
            return `<div class="arow ${off ? "past" : ""}"><span class="a-main a-with-mark"><span class="avatar sm">${esc(monogram(s.name))}</span>
              <span class="stack" style="gap:1px;min-width:0"><b>${esc(s.name)}</b>${off ? `<span class="small muted">${esc(t("staff_off"))}</span>` : ""}</span></span>
              <span class="a-cell a-sub">${edit && !self && !off ? staffRoleSel(s, false) : esc(roleName(s.role))}</span><span class="a-cell mono small">${esc(s.phone)}</span>
              <span class="a-end row" style="gap:10px;flex-wrap:nowrap">${self ? `<span class="pill st-CONFIRMED">${esc(t("staff_you"))}</span>`
                : `${off ? "" : `<button type="button" class="link" data-act="aswitch" data-v="${s.id}">${esc(t("staff_as"))}</button>`}
                   <button type="button" class="link ${off ? "" : "danger"}" data-act="${off ? "ston" : "stoff"}" data-v="${s.id}" ${guard("staff.edit")}>${esc(t(off ? "staff_enable" : "staff_disable"))}</button>`}</span></div>`; }).join("")}
        </div></section>
      <section class="card stack" style="margin-top:20px"><h2>${esc(t("staff_matrix"))}</h2><p class="muted small">${esc(t("staff_matrix_d"))}</p>
        <div class="matrix-wrap"><table class="matrix"><thead><tr><th scope="col">${esc(t("perm"))}</th>${ROLES.map(r => `<th scope="col">${esc(roleName(r))}</th>`).join("")}</tr></thead>
          <tbody>${PERM_LIST.map(p => `<tr><th scope="row">${esc(t("p_" + p.replace(".", "_")))}</th>${ROLES.map(r => {
            const ok = r === "admin" || PERMS[r].includes(p);
            return `<td>${ok ? `<span class="yes">${IC.ok}<span class="sr-only">${esc(t("yes"))}</span></span>` : `<span class="no" aria-hidden="true">—</span><span class="sr-only">${esc(t("no"))}</span>`}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></section></div>`;
  },
  after(){ if (M.ui.stDraft && M.ui.stFocus) { $("#stedit [data-st=name]")?.focus(); M.ui.stFocus = false; } }
};
/* Главный администратор должен остаться хотя бы один — иначе права менять некому. */
const adminsLeft = exceptId => O.staff.filter(s => s.role === "admin" && s.active !== false && s.id !== exceptId).length;
function setStaff(id, fn, action){
  if (denied("staff.edit")) return;
  let res = null;
  change(() => { const s = O.staff.find(x => x.id === id); if (s) res = fn(s); if (res) audit(action, res); });
  if (res) toast(tf("t_" + action, Object.fromEntries(Object.entries(res).map(([k, v]) => [k, auditVal(v)]))));
}
Object.assign(ACT, {
  aswitch: el => {
    const s = O.staff.find(x => x.id === el.dataset.v && x.active !== false); if (!s) return;
    change(() => { O.session = { staffId:s.id, at:Date.now() }; audit("switch", { name:s.name, role:"role:" + s.role }); });
    toast(tf("switched", { name:s.name, role:roleName(s.role) }));
  },
  stnew:   () => { if (denied("staff.edit")) return; M.ui.stDraft = { name:"", phone:"", role:"operator" }; M.ui.stFocus = true; rerender(); },
  stclose: () => { M.ui.stDraft = null; rerender(); },
  stsave:  () => {
    if (denied("staff.edit")) return;
    const d = M.ui.stDraft, name = d.name.trim().replace(/\s+/g, " ");
    if (name.length < 3) return showErr("#sterr", t("err_staff_name"));
    if (!validPhone(d.phone)) return showErr("#sterr", t("err_phone"));
    if (O.staff.some(s => digits(s.phone) === digits(d.phone))) return showErr("#sterr", t("err_staff_phone"));
    if (!ROLES.includes(d.role)) return;
    const rec = { id:uid("st"), name, phone:prettyPhone(d.phone), role:d.role, active:true, addedBy:me().name, addedAt:Date.now() };
    change(() => { O.staff.push(rec); audit("staff_add", { name:rec.name, role:"role:" + rec.role }); });
    M.ui.stDraft = null; rerender(); toast(tf("t_staff_add", { name:rec.name }));
  },
  stoff: el => {
    if (el.dataset.v === me().id) return toast(t("err_staff_self"));
    const s = O.staff.find(x => x.id === el.dataset.v);
    if (s?.role === "admin" && !adminsLeft(s.id)) return toast(t("err_last_admin"));
    setStaff(el.dataset.v, x => { x.active = false; return { name:x.name }; }, "staff_off");
    $(`[data-act="ston"][data-v="${el.dataset.v}"]`)?.focus();
  },
  ston: el => { setStaff(el.dataset.v, x => { x.active = true; return { name:x.name }; }, "staff_on"); $(`[data-act="stoff"][data-v="${el.dataset.v}"]`)?.focus(); }
});
document.addEventListener("input", e => { const k = e.target.dataset?.st; if (k && M.ui.stDraft) M.ui.stDraft[k] = e.target.value; });
document.addEventListener("change", e => {
  const k = e.target.dataset?.st; if (k && M.ui.stDraft) M.ui.stDraft[k] = e.target.value;
  const id = e.target.dataset?.staffRole; if (!id) return;
  const role = e.target.value;
  clearTimeout(roleTimer); roleTimer = setTimeout(() => {
    const s = O.staff.find(x => x.id === id);
    if (!s || !ROLES.includes(role) || s.role === role) return;
    if (s.role === "admin" && role !== "admin" && !adminsLeft(s.id)) { toast(t("err_last_admin")); rerender(); return; }
    setStaff(id, x => { const from = "role:" + x.role; x.role = role; return { name:x.name, from, to:"role:" + role }; }, "staff_role");
    $(`[data-staff-role="${id}"]`)?.focus();
  }, 450);
});
let roleTimer = 0;

/* ---- журнал ---- */
function auditRows(){
  const who = M.ui.auWho || "all", q = (M.ui.auq || "").trim().toLowerCase();
  return O.audit.filter(e => (who === "all" || e.staffId === who) && (!q || auditText(e).toLowerCase().includes(q)));
}
function auditList(){
  const rows = auditRows();
  if (!rows.length) return `<p class="muted">${esc(t(O.audit.length ? "audit_none_match" : "audit_empty"))}</p>`;
  return `<div class="atable" style="--cols:150px minmax(0,1.2fr) minmax(0,3fr)" role="table" aria-label="${esc(t("an_audit"))}">
    <div class="arow ahead" role="row"><span role="columnheader">${esc(t("col_date"))}</span><span role="columnheader">${esc(t("col_staff"))}</span><span role="columnheader">${esc(t("col_action"))}</span></div>
    ${rows.map(e => `<div class="arow" role="row"><span class="a-cell a-sub muted small" role="cell">${esc(fdt(e.at))}</span>
      <span class="a-cell a-sub" role="cell">${esc(staffName(e.staffId))}</span><span class="a-cell a-key" role="cell">${esc(auditText(e))}</span></div>`).join("")}</div>`;
}
PAGES.audit = {
  render(){
    const who = M.ui.auWho || "all";
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_audit"))}</h1><p class="muted">${esc(t("audit_sub"))}</p></div>
      <div class="card stack"><div class="ofind">
          <select id="auWho" class="minisel" aria-label="${esc(t("col_staff"))}"><option value="all">${esc(t("staff_all"))}</option>${O.staff.map(s => `<option value="${s.id}" ${who === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          <label class="search">${IC.search}<input id="auq" type="search" value="${esc(M.ui.auq || "")}" placeholder="${esc(t("audit_search"))}" aria-label="${esc(t("audit_search"))}"></label></div>
        <div id="aulist">${auditList()}</div></div></div>`;
  }
};
document.addEventListener("input", e => { if (e.target.id === "auq") { M.ui.auq = e.target.value; const l = $("#aulist"); if (l) l.innerHTML = auditList(); } });
document.addEventListener("change", e => { if (e.target.id === "auWho") { M.ui.auWho = e.target.value; const l = $("#aulist"); if (l) l.innerHTML = auditList(); } });

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
            <button type="button" class="link danger" data-act="areset" ${guard("demo.reset")}>${esc(t("reset_all"))}</button></div></section>
      </div></div>`;
  }
};
Object.assign(ACT, {
  asetlang:   el => { O.lang = el.dataset.v; adminPrefs(); saveOps(); rerender(); },
  asettheme:  el => { O.theme = el.dataset.v; adminPrefs(); saveOps(); withTransition(rerender, "theme"); },
  asignout:   () => { change(() => { audit("signout", {}); O.session = null; }); stopHeartbeat(); toast(t("signed_out")); go(""); },
  /* Сброс всех трёх демо: кабинет, сайт, админка, цены, заявки. Сотрудник остаётся в админке. */
  areset:     () => {
    if (denied("demo.reset") || !confirm(t("reset_all_q"))) return;
    const session = O.session;
    for (const k of [CAB_KEY, SITE_KEY, OPS_KEY, PRICES_KEY, APPS_KEY, DIRS_KEY]) try { localStorage.removeItem(k); } catch(e) {}
    PRICES = null; M.ui = {}; applyDirections();
    S = freshState(); S.session = null; S.rev = 1; writeJSON(CAB_KEY, S);
    // Сотрудника, добавленного вручную, в исходных данных нет — входим главным администратором.
    O = freshOps({ lang:O.lang, theme:O.theme, session:STAFF.some(s => s.id === session?.staffId) ? session : { staffId:"st1", at:Date.now() } }); saveOps(); SITE = null; seedApps();
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
  change(() => { O.session = { staffId:s.id, at:Date.now() }; audit("signin", { role:"role:" + s.role }); });
  M.ui.aStep = "phone"; heartbeat(); toast(tf("hello_toast", { name:s.name.split(" ")[0] }));
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
