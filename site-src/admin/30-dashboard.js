/* ==========================================================================
   Обзор: «Сейчас» (задачи, балансы, агентства, клиенты), продажи за период
   7/30/90 дней с графиками, задачи и последние действия. Цифры считает
   31-dash-data.js, графики рисует 32-dash-charts.js. Что роли не положено,
   не показываем: продажи — с orders.view, сбор и деньги — с finance.view.
   ========================================================================== */
"use strict";

const DAY_MS = 864e5;
/* Короткая запись больших сумм: 12,4 млн, 80 млн (без «,0»). Полная — в
   подсказке и таблице. at — сумма, по которой выбирается единица: у оси все
   подписи — в единице верхней отметки («0,5 млн», а не «500 000» рядом с «1 млн»). */
const UZS_UNITS = [[1e9, "bn"], [1e6, "mln"]];
function compactUZS(n, at = n){
  const u = UZS_UNITS.find(([d]) => at >= d); if (!u || !n) return grp(n);
  const v = String(+(n / u[0]).toFixed(1));
  return tf(u[1], { v:S.lang === "en" ? v : v.replace(".", ",") });
}
function niceStep(raw){ const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

/* Подсказка у столбца: значение крупно, дата мельче; у стопки — строка на
   ряд (значение впереди, ключ — чертой цвета ряда). Только textContent. */
const elOf = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className:cls } : {}, text != null ? { textContent:text } : {});
function tipAt(g){
  const box = g.closest(".fchart"), tip = box?.querySelector(".fc-tip"); if (!tip) return;
  let parts = [];
  try { parts = g.dataset.parts ? JSON.parse(g.dataset.parts) : []; } catch (e) { parts = []; }
  tip.replaceChildren(elOf("b", "", g.dataset.v), elOf("span", "", g.dataset.d),
    ...parts.map(([name, v, key]) => { const r = elOf("span", "fc-row"); r.append(elOf("i", "fc-key " + (key === "s2" ? "s2" : "s1")), elOf("b", "", v), elOf("span", "", name)); return r; }));
  // Над верхом столбца (у пустого — над основанием), у полосы — над строкой;
  // иначе закрыла бы легенду и заголовок — тогда под ним. По ширине — целиком внутри карточки.
  const segs = [...g.querySelectorAll(".fc-seg")].map(x => x.getBoundingClientRect()), r = g.getBoundingClientRect(), b = box.getBoundingClientRect();
  const hit = g.querySelector(".fc-hit")?.getBoundingClientRect(), top = segs.length ? Math.min(...segs.map(x => x.top)) : hit ? hit.bottom : r.top;
  const plotTop = (g.closest(".fc-plot") || box).getBoundingClientRect().top;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, below = top - 8 - h < plotTop;
  tip.classList.toggle("below", below);
  tip.style.left = (w >= b.width ? b.width / 2 : clamp(r.left - b.left + r.width / 2, w / 2, b.width - w / 2)) + "px";
  tip.style.top = (below ? (segs.length ? top : r.bottom) - b.top + 8 : top - b.top - 8) + "px";
}
const tipOff = g => { const tip = g.closest(".fchart")?.querySelector(".fc-tip"); if (tip) tip.hidden = true; };
document.addEventListener("pointerover", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipAt(g); });
document.addEventListener("pointerout", e => { const g = e.target.closest?.(".fc-bar"); if (g && !g.contains(e.relatedTarget)) tipOff(g); });
document.addEventListener("focusin", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipAt(g); });
document.addEventListener("focusout", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipOff(g); });
/* Стрелки ведут по столбцам и полосам; в Tab график — одна остановка. */
const FC_KEYS = { ArrowLeft:-1, ArrowUp:-1, ArrowRight:1, ArrowDown:1 };
document.addEventListener("keydown", e => {
  const g = e.target.closest?.(".fc-bar"); if (!g || !(e.key in FC_KEYS || e.key === "Home" || e.key === "End")) return;
  const bars = $$(".fc-bar", g.closest(".fc-plot")), i = bars.indexOf(g);
  const j = e.key === "Home" ? 0 : e.key === "End" ? bars.length - 1 : clamp(i + FC_KEYS[e.key], 0, bars.length - 1);
  e.preventDefault(); bars.forEach((b, k) => b.setAttribute("tabindex", k === j ? "0" : "-1")); bars[j].focus();
});
/* Карточка стала шире или уже — графики перерисовываются под неё. */
let DASH_RS = 0;
window.addEventListener("resize", () => { clearTimeout(DASH_RS); DASH_RS = setTimeout(() => {
  const box = $(".fchart[data-w]"); if (!box || document.activeElement?.closest?.(".fc-plot")) return;
  if (Math.abs(Math.round(box.clientWidth) - FC_W) > 24) rerender();
}, 200); });

/* Сумма в плитке: от 100 млн — коротко («320,2 млн сум»), полная — в подсказке
   и для экранного диктора, чтобы плитка не обрезала цифры. */
const KPI_SHORT = 1e8;
const kpiMoney = (n, short = n >= KPI_SHORT) => short ? { short:compactUZS(n) + NB + t("cur_uzs"), full:fmtUZS(n) } : fmtUZS(n);
function kpi(label, value, sub, href, opt = {}){
  const v = typeof value === "object" ? `<b class="kpi-v" title="${esc(value.full)}"><span aria-hidden="true">${esc(value.short)}</span><span class="sr-only">${esc(value.full)}</span></b>` : `<b class="kpi-v">${esc(value)}</b>`;
  const inner = `<span class="kpi-l">${esc(label)}</span>${v}${sub ? `<span class="kpi-s">${esc(sub)}</span>` : ""}`;
  const attrs = `class="kpi${opt.hero ? " kpi-hero" : ""}"${opt.id ? ` data-kpi="${opt.id}"` : ""}${opt.raw != null ? ` data-v="${opt.raw}"` : ""}`;
  return href ? `<a ${attrs} href="${href}">${inner}</a>` : `<div ${attrs}>${inner}</div>`;
}
const sharePct = (part, all) => all ? Math.round(part / all * 100) : 0;

/* «Сейчас» — не зависит от периода. */
function dashNow(){
  const n = taskCount(), ap = myDecisions().length, x = (can("b2b.view") || can("clients")) ? dashSnapshot() : null;
  return [
    can("tasks") ? kpi(t("k_tasks"), String(n), n ? t("k_tasks_d") : t("k_tasks_none"), "#/tasks", { id:"tasks", raw:n }) : "",
    canDecideAny() ? kpi(t("k_ap"), String(ap), t(ap ? "k_ap_d" : "k_ap_none"), "#/approvals", { id:"approvals", raw:ap }) : "",
    can("b2b.view") ? kpi(t("k_balances"), kpiMoney(x.balance), tf("k_neg", { n:x.agencies, neg:x.neg }), "#/agencies", { id:"balances", raw:x.balance }) : "",
    can("b2b.view") ? kpi(t("k_agencies_h"), String(x.agencies), tf("k_agencies_d", { on:x.active, off:x.blocked, apps:x.apps }), "#/agencies", { id:"agencies", raw:x.agencies }) : "",
    can("clients") ? kpi(t("k_clients"), String(x.clients), tf("k_clients_d", { n:x.newClients }), "#/customers", { id:"clients", raw:x.clients }) : ""
  ].join("");
}
function dashPeriodKpis(m){
  const ov = can("orders.view"), fv = can("finance.view"), fo = ov ? "#/orders" : "", ff = "#/finance";
  const share = x => tf("k_share", { p:sharePct(x.sum, m.turnover), orders:pl(x.n, "order") });
  // Одна запись на все плитки периода: если хоть одна сумма коротко, то и все (и в подписях).
  const short = [m.turnover, m.fee, m.topups, m.refunds].some(v => v >= KPI_SHORT), money = n => kpiMoney(n, short);
  const sub = n => short ? compactUZS(n) + NB + t("cur_uzs") : fmtUZS(n);
  return [
    ov ? kpi(t("k_turnover"), money(m.turnover), t("k_turnover_d"), fo, { id:"turnover", raw:m.turnover, hero:true }) : "",
    ov ? kpi(t("k_b2b"), money(m.b2b.sum), share(m.b2b), fo, { id:"b2b", raw:m.b2b.sum }) : "",
    ov ? kpi(t("k_b2c"), money(m.b2c.sum), share(m.b2c), fo, { id:"b2c", raw:m.b2c.sum }) : "",
    ov ? kpi(t("k_orders_h"), String(m.orders), tf("k_orders_d", { b2b:m.b2b.n, b2c:m.b2c.n, wait:m.unpaid }), fo, { id:"orders", raw:m.orders }) : "",
    fv ? kpi(t("k_profit"), money(m.fee), tf("k_profit_d", { p:pctText(m.feeBps) }), ff, { id:"profit", raw:m.fee }) : "",
    fv ? kpi(t("k_topups"), money(m.topups), tf("k_topups_d", { n:m.topWait.n, amount:sub(m.topWait.sum) }), ff, { id:"topups", raw:m.topups }) : "",
    fv ? kpi(t("k_refunds"), money(m.refunds), tf("k_refunds_d", { n:m.refWait.n, amount:sub(m.refWait.sum) }), ff, { id:"refunds", raw:m.refunds }) : ""
  ].join("");
}

/* Карточка графика: заголовок, итог, график, таблица-двойник. */
const dashCard = (id, title, sub, chart, table, cls = "") => `<section class="card stack dash-chart ${cls}" id="${id}" aria-labelledby="${id}-h">
  <div class="card-h"><h2 id="${id}-h">${esc(title)}</h2>${sub ? `<span class="muted small">${esc(sub)}</span>` : ""}</div>${chart}${table}</section>`;
const DASH_SERIES = () => [{ key:"s1", name:t("dash_b2b") }, { key:"s2", name:t("dash_b2c") }];
function dashCharts(m){
  if (!m.orders) return `<div class="card"><p class="muted">${esc(t("dash_empty"))}</p></div>`;
  const bk = dashBuckets(m), week = m.n > 31, col = t(week ? "col_week" : "col_day");
  const bx = b => week ? { x:fdate(b.from), d:tf("dash_range", { from:fdate(b.from), to:fdate(b.to) }) } : { x:fdate(b.from), d:fdate(b.from, { weekday:"short", day:"numeric", month:"short" }) };
  const out = [];
  if (can("orders.view")) {
    const title = t(week ? "dash_turn_w" : "dash_turn_d"), ser = DASH_SERIES();
    out.push(dashCard("dash-turn", title, tf("dash_total", { amount:fmtUZS(m.turnover) }),
      colChart({ id:"dash-turn", label:title, series:ser, data:bk.map(b => ({ ...bx(b), vals:[b.b2b, b.b2c] })) }),
      chartTable("dt-turn", title, [col, ser[0].name, ser[1].name, t("col_turnover")], bk.map(b => [bx(b).d, fmtUZS(b.b2b), fmtUZS(b.b2c), fmtUZS(b.b2b + b.b2c)]),
        [t("total"), fmtUZS(m.b2b.sum), fmtUZS(m.b2c.sum), fmtUZS(m.turnover)])));
    out.push(`<div class="dash-grid2">${dashDestCard(m)}${dashSvcCard(m)}</div>`);
  }
  if (can("finance.view")) {
    const title = t(week ? "dash_fee_w" : "dash_fee_d");
    out.push(dashCard("dash-fee", title, tf("dash_total", { amount:fmtUZS(m.fee) }),
      colChart({ id:"dash-fee", label:title, series:[{ key:"s1", name:t("col_fee") }], data:bk.map(b => ({ ...bx(b), vals:[b.fee] })) }),
      chartTable("dt-fee", title, [col, t("col_fee")], bk.map(b => [bx(b).d, fmtUZS(b.fee)]), [t("total"), fmtUZS(m.fee)])));
  }
  return out.join("");
}
/* Направления: 7 первых и «Другие», если их больше 8; в таблице — все. */
function dashDestCard(m){
  const all = dashDest(m), rest = all.slice(7), title = t("dash_dest_h");
  const shown = all.length > 8 ? [...all.slice(0, 7), { name:tf("dash_other", { n:rest.length }), n:sumOf(rest, x => x.n), sales:sumOf(rest, x => x.sales) }] : all;
  const rows = shown.map(x => ({ name:x.name, vals:[x.n], end:String(x.n), d:`${x.name} · ${fmtUZS(x.sales)}`, v:pl(x.n, "order"), aria:`${x.name}: ${pl(x.n, "order")}, ${fmtUZS(x.sales)}` }));
  return dashCard("dash-dest", title, t("dash_dest_d"), hbarChart({ id:"dash-dest", label:title, rows, series:[{ key:"s1", name:t("k_orders_h") }] }),
    chartTable("dt-dest", title, [t("col_dest"), t("k_orders_h"), t("col_turnover")], all.map(x => [x.name, String(x.n), fmtUZS(x.sales)])));
}
function dashSvcCard(m){
  const xs = dashSvc(m), title = t("dash_svc_h"), ser = DASH_SERIES();
  const rows = xs.map(x => { const name = t("type_" + x.k); return { name, vals:[x.b2b, x.b2c], end:compactUZS(x.b2b + x.b2c), d:`${name} · ${pl(x.n, "order")}`, v:fmtUZS(x.b2b + x.b2c) }; });
  return dashCard("dash-svc", title, t("dash_svc_d"), hbarChart({ id:"dash-svc", label:title, rows, series:ser }),
    chartTable("dt-svc", title, [t("col_service"), t("k_orders_h"), ser[0].name, ser[1].name, t("col_fee")], xs.map(x => [t("type_" + x.k), String(x.n), fmtUZS(x.b2b), fmtUZS(x.b2c), fmtUZS(x.fee)])));
}
function dashHow(){
  const tz = `${sysTz()} (${tzOffset()})`;
  return `<details class="card dash-how" data-keep="dhow" ${M.ui.dhow ? "open" : ""}><summary>${esc(t("dash_how"))}</summary>
    <ul>${["dash_how_1", "dash_how_2", "dash_how_3"].map(k => `<li>${esc(t(k))}</li>`).join("")}<li>${esc(tf("dash_how_4", { tz }))}</li></ul></details>`;
}

ACT.dper = el => { M.ui.dper = el.dataset.v; rerender(); };

PAGES[""] = {
  render(){
    const u = me(), now = dashNow(), sales = can("orders.view") || can("finance.view"), recent = O.audit.slice(0, 6);
    const m = sales ? dashMetrics() : null;
    const period = m ? `<section class="dash-period" aria-labelledby="dash-sales-h">
        <div class="dash-filter"><h2 id="dash-sales-h">${esc(t("dash_sales_h"))}</h2>
          ${seg("dper", DASH_PERIODS.map(n => [String(n), pl(n, "day")]), String(m.n), `aria-describedby="dash-range"`)}
          <span class="muted small" id="dash-range">${esc(tf("dash_range", { from:fdate(m.from), to:fdate(m.to) }))}</span></div>
        <div class="kpis kpis-period">${dashPeriodKpis(m)}</div>${dashCharts(m)}</section>`
      : `<p class="muted dash-note">${esc(t("dash_no_sales"))}</p>`;
    return `<div class="page">
      <div class="dash-head"><div class="stack" style="gap:4px"><h1>${esc(tf("adm_hello", { name:u.name.split(" ")[0] }))}</h1>
        <p class="muted">${esc(fdateLong(tzToday()))} · ${esc(roleName(u.role))}</p></div></div>
      ${now ? `<h2 class="dash-h">${esc(t("k_now"))}</h2><div class="kpis">${now}</div>` : ""}
      ${period}
      <div class="dash-grid">
        <section class="card stack"><div class="card-h"><h2>${esc(t("an_tasks"))}</h2>${can("tasks") ? `<a class="link" href="#/tasks">${esc(t("open_all"))}</a>` : ""}</div>
          ${taskSummary()}</section>
        ${can("audit.view") ? `<section class="card stack"><div class="card-h"><h2>${esc(t("recent_actions"))}</h2><a class="link" href="#/audit">${esc(t("an_audit"))}</a></div>
          ${recent.length ? `<ol class="feed">${recent.map(e => `<li><span class="feed-dot"></span><span class="stack" style="gap:2px"><span>${esc(auditText(e))}</span>
            <span class="muted small">${esc(staffName(e.staffId))} · ${esc(ago(e.at))}</span></span></li>`).join("")}</ol>` : `<p class="muted">${esc(t("audit_empty"))}</p>`}</section>` : ""}
      </div>
      ${sales || now ? dashHow() : ""}</div>`;
  },
  after(){
    // Ширина графиков — по карточке: один раз перерисовать, если заметно отличается.
    const box = $(".fchart[data-w]"); if (!box) return;
    const w = Math.round(box.clientWidth);
    if (w && Math.abs(w - FC_W) > 24) { FC_W = w; rerender(); }
  }
};
/* Сводка задач по видам — ссылкой в очередь. Что роли не положено, не показываем. */
function taskSummary(){
  const k = tasks(), rows = [
    ["approvals", "tk_ap", myDecisions().length, IC.stamp, "#/approvals"],
    ["orders.edit", "tk_price", k.price.length, IC.jet], ["finance.approve", "tk_topups", k.topups.length, IC.wallet],
    ["b2b.approve", "tk_apps", k.apps.length, IC.users], ["b2c.edit", "tk_reqs", k.reqs.length, IC.person], ["finance.refund", "tk_refunds", k.refunds.length, IC.back]
  ].filter(([p]) => p === "approvals" ? canDecideAny() : can(p));
  if (!rows.length) return `<p class="muted">${esc(t("tasks_not_role"))}</p>`;
  return `<div class="att">${rows.map(([, key, n, ic, href = "#/tasks"]) => `<a class="att-row" href="${href}"><span class="att-ic ${n ? "warn" : ""}">${ic}</span>
    <span class="att-main"><b>${esc(t(key))}</b><span class="muted small">${esc(n ? tf("tk_waiting", { n }) : t("tk_clear"))}</span></span>
    <span class="att-go"><b class="mono">${n}</b></span></a>`).join("")}</div>`;
}
