/* ==========================================================================
   Настройки: язык, валюта цен, тема; реквизиты агентства; выход и сброс демо.
   ========================================================================== */
"use strict";

PAGES.settings = {
  render(){
    const a = S.agency, row = (k, v, mono = false) => `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${esc(v)}</span></div>`;
    return `<div class="page narrow-page">
      <div class="pagehead"><h1>${esc(t("nav_settings"))}</h1></div>
      <div class="stack">
        <section class="card stack"><div class="card-h"><h2>${esc(t("agency"))}</h2><span class="pill st-CONFIRMED">${esc(t("agency_verified"))}</span></div>
          <div class="rows">${row("agency_legal", a.legal)}${row("agency_inn", a.inn, true)}${row("phone_label", a.phone, true)}${row("agency_email", a.email)}
            ${row("agency_since", fdateY(a.since))}${row("agency_fee", t("agency_fee_v"))}</div>
          <p class="muted small">${esc(t("agency_note"))}</p></section>
        <section class="card stack"><h2>${esc(t("settings"))}</h2>
          <div class="setrow"><span>${esc(t("language"))}</span>${seg("setlang", [["uz","O‘zbekcha"],["ru","Русский"],["en","English"]], S.lang)}</div>
          <div class="setrow"><span>${esc(t("price_currency"))}</span>${seg("setcur", [["UZS","UZS"],["USD","USD"]], S.cur)}<span class="muted small">${esc(t("price_currency_d"))}</span></div>
          <div class="setrow"><span>${esc(t("appearance"))}</span>${seg("settheme", [["system", t("theme_system")],["light", t("theme_light")],["dark", t("theme_dark")]], S.theme)}</div></section>
        <section class="card stack"><h2>${esc(t("session"))}</h2>
          <div class="rows">${row("signed_as", S.session?.phone || "")}</div>
          <div class="row"><button type="button" class="ghost sm" data-act="signout">${IC.out}<span>${esc(t("sign_out"))}</span></button>
            <button type="button" class="link danger" data-act="reset">${esc(t("reset_demo"))}</button></div></section>
      </div></div>`;
  }
};
Object.assign(ACT, {
  setlang:  el => { S.lang = el.dataset.v; save(); rerender(); },
  setcur:   el => { S.cur = el.dataset.v; save(); rerender(); },
  settheme: el => { S.theme = el.dataset.v; save(); withTransition(rerender, "theme"); },
  signout:  () => { S.session = null; save(); toast(t("signed_out")); go(""); },
  reset:    () => { if (!confirm(t("reset_confirm"))) return; M.ui = {}; S = freshState(); save(); go(""); }
});
