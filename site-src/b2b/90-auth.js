/* ==========================================================================
   Вход по SMS-коду и заявка на подключение агентства. Кабинет без входа
   не открывается: routeGuard приводит сюда с любой страницы.
   ========================================================================== */
"use strict";

const DEMO_CODE = "0000";
const REG_FIELDS = [["company", "reg_company", "organization"], ["inn", "reg_inn", "off"], ["person", "reg_person", "name"], ["phone", "phone_label", "tel"], ["email", "agency_email", "email"]];

function authForm(){
  const step = M.ui.loginStep || "phone";
  if (step === "code") return `<h2>${esc(t("otp_title"))}</h2><p class="muted">${esc(t("otp_sub"))} <b class="mono">${esc(M.ui.loginPhone)}</b></p>
    <input id="lotp" class="otp" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••" aria-label="${esc(t("otp_title"))}">
    <p class="small muted center">${esc(tf("otp_demo", { code:DEMO_CODE }))}</p><div class="err" id="lerr" hidden></div>
    <button type="button" class="cta" data-act="lverify">${esc(t("otp_cta"))}</button>
    <button type="button" class="link" data-act="lback">${esc(t("change_number"))}</button>`;
  return `<h2>${esc(t("login_b2b"))}</h2><p class="muted">${esc(t("login_b2b_sub"))}</p>
    <label class="field"><span>${esc(t("phone_label"))}</span><input id="lph" type="tel" inputmode="tel" autocomplete="tel" value="${esc(M.ui.loginPhone || S.agency.phone.replace(/^\+998 71/, "+998 90"))}"></label>
    <div class="err" id="lerr" hidden></div>
    <button type="button" class="cta" data-act="lsend">${esc(t("login_cta"))}</button>`;
}
function regForm(){
  if (M.ui.regDone) return `<div class="stack center-col"><span class="radar" aria-hidden="true"><i></i><i></i>${IC.shield}</span>
    <h2>${esc(t("reg_sent"))}</h2><p class="muted">${esc(tf("reg_sent_d", { phone:M.ui.reg.phone }))}</p>
    <button type="button" class="cta" data-act="regdemo">${esc(t("reg_demo_in"))}</button></div>`;
  const r = M.ui.reg || (M.ui.reg = { company:"", inn:"", person:"", phone:"", email:"" });
  return `<h2>${esc(t("reg_title"))}</h2><p class="muted">${esc(t("reg_sub"))}</p>
    ${REG_FIELDS.map(([k, label, ac]) => `<label class="field"><span>${esc(t(label))}</span><input data-reg="${k}" value="${esc(r[k])}" autocomplete="${ac}" ${
      k === "phone" ? 'type="tel" placeholder="+998"' : k === "email" ? 'type="email"' : k === "inn" ? 'inputmode="numeric" maxlength="11"' : ""}></label>`).join("")}
    <div class="err" id="rerr" hidden></div>
    <button type="button" class="cta" data-act="regsend">${esc(t("reg_cta"))}</button>`;
}
PAGES.auth = {
  render(){
    const tab = M.ui.authTab || "login";
    return `<div class="auth">
      <section class="auth-side">
        <span class="wordmark" aria-hidden="true">CHARTERI<b>.UZ</b></span>
        <div class="auth-copy"><h1>${esc(t("auth_h"))}</h1><p>${esc(t("auth_p"))}</p></div>
        <ul class="auth-mods" aria-hidden="true">${MODULE_ORDER.map(k => `<li>${MODULES[k].icon}<span>${esc(t(MODULES[k].label))}</span></li>`).join("")}</ul>
      </section>
      <section class="auth-main"><div class="card stack authcard">
        ${seg("authtab", [["login", t("auth_login")], ["reg", t("auth_reg")]], tab)}
        ${tab === "login" ? authForm() : regForm()}
        <p class="demo-note">${esc(t("demo_banner"))}</p></div></section></div>`;
  },
  after(){ $("#lotp")?.focus(); }
};
function doVerify(){
  const v = ($("#lotp")?.value || "").trim();
  if (!/^\d{4}$/.test(v)) return showErr("#lerr", t("err_code"));
  if (v !== DEMO_CODE) return showErr("#lerr", t("err_code_wrong"));
  S.session = { phone:M.ui.loginPhone, at:Date.now() }; save();
  M.ui.loginStep = "phone"; toast(t("signed_in"));
  // Вход перехватил запрошенную страницу — после входа открываем её же.
  if (currentParts()[0] === "auth") go(""); else render(true);
}
Object.assign(ACT, {
  authtab: el => { M.ui.authTab = el.dataset.v; rerender(); },
  lsend:   () => { const v = $("#lph").value; if (!validPhone(v)) return showErr("#lerr", t("err_phone")); M.ui.loginPhone = prettyPhone(v); M.ui.loginStep = "code"; rerender(); },
  lverify: () => doVerify(),
  lback:   () => { M.ui.loginStep = "phone"; rerender(); },
  regsend: () => {
    const r = M.ui.reg;
    if (r.company.trim().length < 2) return showErr("#rerr", t("err_company"));
    if (!/^\d{9}$/.test(digits(r.inn))) return showErr("#rerr", t("err_inn"));
    if (r.person.trim().length < 2) return showErr("#rerr", t("err_your_name"));
    if (!validPhone(r.phone)) return showErr("#rerr", t("err_phone"));
    if (!r.email || !validEmail(r.email)) return showErr("#rerr", t("err_email"));
    r.phone = prettyPhone(r.phone); M.ui.regDone = true;
    // Заявка уходит оператору Charteri: в демо — в общее хранилище, её видит админка.
    const apps = readJSON(APPS_KEY, []);
    writeJSON(APPS_KEY, [{ id:uid("ap"), at:Date.now(), company:r.company.trim(), inn:digits(r.inn), person:r.person.trim(), phone:r.phone, email:r.email.trim(), status:"pending" }, ...(Array.isArray(apps) ? apps : [])].slice(0, 50));
    rerender();
  },
  /* Модерация в демо не ждёт: входим в готовое демо-агентство. */
  regdemo: () => { S.session = { phone:M.ui.reg.phone, at:Date.now() }; M.ui.regDone = false; M.ui.authTab = "login"; save();
    if (currentParts()[0] === "auth") go(""); else render(true); }
});
document.addEventListener("input", e => {
  if (e.target.id === "lotp") { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); if (e.target.value.length === 4) doVerify(); }
  const k = e.target.dataset?.reg; if (k && M.ui.reg) M.ui.reg[k] = e.target.value;
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lph") ACT.lsend(); });
