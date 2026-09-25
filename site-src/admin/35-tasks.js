/* ==========================================================================
   Задачи: одна очередь на всех — цены по заявкам на чартер, пополнения,
   новые агентства, просьбы пассажиров, возвраты к зачислению. Каждая роль
   видит свои разделы; решение принимается прямо в строке.
   ========================================================================== */
"use strict";

const TASK_KINDS = [
  ["price", "orders.edit", "tk_price", "tk_price_d", priceRow],
  ["topups", "finance.approve", "tk_topups", "tk_topups_d", x => topupRow(x.p, x.a)],
  ["apps", "b2b.approve", "tk_apps", "tk_apps_d", appRow],
  ["reqs", "b2c.edit", "tk_reqs", "tk_reqs_d", reqRow],
  ["refunds", "finance.refund", "tk_refunds", "tk_refunds_d", refundRow]
];
/* Сверху — запросы коллег, которые ждут вашего подтверждения. */
function apTaskSection(){
  if (!canDecideAny()) return "";
  const list = myDecisions();
  return `<section class="card stack" id="tk-ap"><div class="card-h"><div class="stack" style="gap:2px"><h2>${esc(t("tk_ap"))}</h2><span class="muted small">${esc(t("tk_ap_d"))}</span></div>
    ${list.length ? `<span class="count">${list.length}</span>` : ""}</div>
    ${list.length ? `<div class="tasks">${list.map(a => apRow(a, "decide")).join("")}</div>` : `<p class="calm">${IC.ok}<span>${esc(t("tk_clear"))}</span></p>`}</section>`;
}
PAGES.tasks = {
  render(){
    const k = tasks(), mine = TASK_KINDS.filter(([, p]) => can(p));
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_tasks"))}</h1><p class="muted">${esc(t("tasks_sub"))}</p></div>
      ${opsLive() ? "" : `<p class="note-live">${IC.clock}<span>${esc(t("live_wait"))}</span></p>`}
      <div class="stack">${apTaskSection()}${mine.map(([key, , title, sub, row]) => `<section class="card stack" id="tk-${key}">
        <div class="card-h"><div class="stack" style="gap:2px"><h2>${esc(t(title))}</h2><span class="muted small">${esc(t(sub))}</span></div>
          ${k[key].length ? `<span class="count">${k[key].length}</span>` : ""}</div>
        ${k[key].length ? `<div class="tasks">${k[key].map(row).join("")}</div>` : `<p class="calm">${IC.ok}<span>${esc(t("tk_clear"))}</span></p>`}
      </section>`).join("")}</div></div>`;
  }
};
