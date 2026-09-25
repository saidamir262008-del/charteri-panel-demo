/* ==========================================================================
   Задачи: одна очередь на всех — цены по заявкам на чартер, пополнения,
   новые агентства, просьбы пассажиров, возвраты к зачислению. Каждая роль
   видит свои разделы; решение принимается прямо в строке.
   ========================================================================== */
"use strict";

const TASK_KINDS = [
  ["price", "orders.price", "tk_price", "tk_price_d", priceRow],
  ["topups", "topups.confirm", "tk_topups", "tk_topups_d", x => topupRow(x.p, x.a)],
  ["apps", "agencies.moderate", "tk_apps", "tk_apps_d", appRow],
  ["reqs", "requests.resolve", "tk_reqs", "tk_reqs_d", reqRow],
  ["refunds", "refunds.credit", "tk_refunds", "tk_refunds_d", refundRow]
];
PAGES.tasks = {
  render(){
    const k = tasks(), mine = TASK_KINDS.filter(([, p]) => can(p));
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_tasks"))}</h1><p class="muted">${esc(t("tasks_sub"))}</p></div>
      ${opsLive() ? "" : `<p class="note-live">${IC.clock}<span>${esc(t("live_wait"))}</span></p>`}
      <div class="stack">${mine.map(([key, , title, sub, row]) => `<section class="card stack" id="tk-${key}">
        <div class="card-h"><div class="stack" style="gap:2px"><h2>${esc(t(title))}</h2><span class="muted small">${esc(t(sub))}</span></div>
          ${k[key].length ? `<span class="count">${k[key].length}</span>` : ""}</div>
        ${k[key].length ? `<div class="tasks">${k[key].map(row).join("")}</div>` : `<p class="calm">${IC.ok}<span>${esc(t("tk_clear"))}</span></p>`}
      </section>`).join("")}</div></div>`;
  }
};
