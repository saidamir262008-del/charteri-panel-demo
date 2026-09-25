/* ==========================================================================
   Интеграции — честная сводка: что подключено, что на тестовых данных и
   какие ключи нужны. Ключи — названия переменных из .env.example: сами
   значения живут только на сервере.
   ========================================================================== */
"use strict";

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
