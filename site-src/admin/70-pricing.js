/* ==========================================================================
   Цены и интеграции. Сбор и наценку на авиабилеты меняет главный
   администратор — сайт и кабинет берут их сразу (prices()). Интеграции —
   честная сводка: что подключено, что на тестовых данных и какие ключи нужны.
   ========================================================================== */
"use strict";

const pctInput = (key, bps) => inpField(key, { value:String(bps / 100), label:t(key), extra:`inputmode="decimal" maxlength="5" ${can("pricing.edit") ? "" : "disabled"}` });
PAGES.pricing = {
  render(){
    const p = prices(), sample = 5_000_000;
    return `<div class="page narrow-page">
      <div class="pagehead"><h1>${esc(t("an_pricing"))}</h1><p class="muted">${esc(t("pricing_sub"))}</p></div>
      <div class="stack">
        <section class="card stack"><h2>${esc(t("pr_fee"))}</h2><p class="muted small">${esc(t("pr_fee_d"))}</p>
          <div class="pr-row"><span class="pct-in">${pctInput("pr_fee_in", p.feeBps)}<i>%</i></span>
            <span class="muted small">${esc(tf("pr_fee_example", { sum:fmtUZS(sample), fee:fmtUZS(Math.ceil(sample * p.feeBps / 10000)) }))}</span></div></section>
        <section class="card stack"><h2>${esc(t("pr_markup"))}</h2><p class="muted small">${esc(t("pr_markup_d"))}</p>
          <div class="pr-row"><span class="pct-in">${pctInput("pr_markup_in", p.flightMarkupBps)}<i>%</i></span></div></section>
        <div class="row"><button type="button" class="solid" data-act="prsave" ${guard("pricing.edit")}>${esc(t("pr_save"))}</button>
          ${can("pricing.edit") ? "" : `<span class="muted small">${esc(t("pr_admin_only"))}</span>`}</div>
        <section class="card stack"><h2>${esc(t("pr_fixed"))}</h2><div class="rows">
          ${[["pr_tour", "−7%"], ["pr_transfer", "$20"], ["pr_infant", "10%"], ["pr_charter", "+10%"]].map(([k, v]) => `<div><span class="k">${esc(t(k))}</span><span class="v mono">${v}</span></div>`).join("")}</div>
          <p class="muted small">${esc(t("pr_fixed_d"))}</p></section>
      </div></div>`;
  }
};
/* Проценты с запятой или точкой, до сотых; разумные пределы — чтобы опечатка
   не сделала сбор 300%. */
function readPct(key, max){
  const raw = String(inp(key, "")).replace(",", ".").trim(); if (raw === "") return null;
  const v = Number(raw); if (!Number.isFinite(v) || v < 0 || v > max) return NaN;
  return Math.round(v * 100);
}
ACT.prsave = () => {
  if (denied("pricing.edit")) return;
  const p = prices(), fee = readPct("pr_fee_in", 10), mk = readPct("pr_markup_in", 30);
  if (Number.isNaN(fee) || Number.isNaN(mk)) return toast(t("err_pct"));
  const next = { feeBps:fee ?? p.feeBps, flightMarkupBps:mk ?? p.flightMarkupBps };
  if (next.feeBps === p.feeBps && next.flightMarkupBps === p.flightMarkupBps) return toast(t("pr_same"));
  writeJSON(PRICES_KEY, next); PRICES = null;
  change(() => {
    if (next.feeBps !== p.feeBps) audit("fee", { from:pctText(p.feeBps) + "%", to:pctText(next.feeBps) + "%" });
    if (next.flightMarkupBps !== p.flightMarkupBps) audit("markup", { from:pctText(p.flightMarkupBps) + "%", to:pctText(next.flightMarkupBps) + "%" });
  });
  delete M.ui.inp?.pr_fee_in; delete M.ui.inp?.pr_markup_in;
  toast(t("pr_saved"));
};

/* ---- интеграции ----
   Карта работает без ключа; остальное в демо — на тестовых данных. Ключи —
   названия переменных из .env.example: сами значения живут только на сервере. */
const INTEGRATIONS = [
  ["samo", "ok_test", "SAMO_API_URL, SAMO_API_TOKEN", "INTEGRATION.md · 4"],
  ["hotels", "none", "HOTEL_SUPPLIER_URL, HOTEL_SUPPLIER_KEY_ID, HOTEL_SUPPLIER_API_KEY", "INTEGRATION.md · 5"],
  ["payme", "ok_test", "PAYME_MERCHANT_ID, PAYME_KEY", "INTEGRATION.md · 4"],
  ["click", "ok_test", "CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY", "INTEGRATION.md · 4"],
  ["uzum", "sandbox", "UZUM_TERMINAL_ID, UZUM_API_KEY, UZUM_SPIC, UZUM_TIN", "pay-server"],
  ["cards", "ok_test", "CARD_PROCESSOR_*, ACQUIRER_*", "INTEGRATION.md · 4"],
  ["sms", "ok_test", "SMS_PROVIDER, SMS_LOGIN, SMS_SECRET, SEND_SMS_HOOK_SECRET", "INTEGRATION.md · 1"],
  ["telegram", "ok_test", "TELEGRAM_BOT_TOKEN, TELEGRAM_OPS_CHAT_ID", "INTEGRATION.md · 6"],
  ["email", "ok_test", "EMAIL_PROVIDER_API_KEY, EMAIL_FROM", "INTEGRATION.md · 7"],
  ["supabase", "ok_test", "SUPABASE_URL, SUPABASE_ANON_KEY (public), SUPABASE_SERVICE_ROLE_KEY", "INTEGRATION.md · 0–2"],
  ["map", "live", "—", "js/00-config.js · CONFIG.map"]
];
PAGES.integrations = {
  render(){
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_integrations"))}</h1><p class="muted">${esc(t("integrations_sub"))}</p></div>
      <div class="card"><div class="atable" style="--cols:minmax(0,1.6fr) 170px minmax(0,2fr) minmax(0,1fr)" role="table" aria-label="${esc(t("an_integrations"))}">
        <div class="arow ahead" role="row"><span role="columnheader">${esc(t("int_service"))}</span><span role="columnheader">${esc(t("col_status"))}</span>
          <span role="columnheader">${esc(t("int_keys"))}</span><span role="columnheader">${esc(t("int_where"))}</span></div>
        ${INTEGRATIONS.map(([k, st, keys, where]) => `<div class="arow" role="row"><span class="a-main" role="cell"><b>${esc(t("int_" + k))}</b><span class="muted small">${esc(t("int_" + k + "_d"))}</span></span>
          <span role="cell"><span class="pill ${st === "live" ? "st-CONFIRMED" : st === "none" ? "st-CANCELLED" : "st-PENDING"}">${esc(t("ist_" + st))}</span></span>
          <span class="a-cell mono small" role="cell">${esc(keys)}</span><span class="a-cell muted small" role="cell">${esc(where)}</span></div>`).join("")}</div></div>
      <p class="muted small" style="margin-top:12px">${esc(t("integrations_note"))}</p></div>`;
  }
};
