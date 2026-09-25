/* ==========================================================================
   Обзор: что ждёт сотрудника сейчас, доход от сбора по дням, последние
   действия. Цифры — по всем агентствам и сайту.
   ========================================================================== */
"use strict";

const DAY_MS = 864e5, CHART_DAYS = 30;
const dayKey = ms => ymd(new Date(ms));

/* Доход Charteri — сервисный сбор оплаченных заказов агентств. Сбор не
   возвращается, поэтому отмена его не вычитает. */
function feeByDay(days = CHART_DAYS){
  const from = addDays(TODAY, -(days - 1)), sums = new Map();
  for (let i = 0; i < days; i++) sums.set(addDays(from, i), 0);
  for (const a of agencies()) for (const o of a.st.orders) {
    if (!o.paidAt || !o.fee) continue;
    const k = dayKey(o.paidAt); if (sums.has(k)) sums.set(k, sums.get(k) + o.fee.uzs);
  }
  return [...sums].map(([d, v]) => ({ d, v }));
}
function salesSince(ms){
  let sales = 0, fee = 0, n = 0;
  for (const a of agencies()) for (const o of a.st.orders) if (o.paidAt && o.paidAt >= ms && o.total) { sales += o.total.uzs; fee += o.fee?.uzs || 0; n++; }
  // Заказ сайта считается, только если его оплатили (в истории есть PAID).
  for (const o of SITE?.orders || []) { const paid = o.history?.find(h => h.s === "PAID"); if (paid && paid.at >= ms && o.total) { sales += o.total.uzs; n++; } }
  return { sales, fee, n };
}
/* Короткая запись больших сумм: 12,4 млн. Полная — в подсказке и таблице. */
const compactUZS = n => n >= 1e9 ? tf("bn", { v:(n / 1e9).toFixed(1).replace(".", S.lang === "en" ? "." : ",") })
  : n >= 1e6 ? tf("mln", { v:(n / 1e6).toFixed(1).replace(".", S.lang === "en" ? "." : ",") }) : grp(n);

/* Столбцы по дням: один ряд — без легенды, его называет заголовок. Ось одна,
   сетка — волосяные линии, у столбца скруглён только верх. Подсказка на
   наведение и фокус; те же цифры — в таблице под графиком для экранного диктора. */
/* Ширина графика — по ширине карточки (FC_W мерится после отрисовки), чтобы
   подписи осей оставались 11 px и на телефоне. */
let FC_W = 720;
function feeChart(data, W = FC_W){
  const H = W < 480 ? 200 : 220, L = 56, R = 8, T = 12, B = 26, max = Math.max(1, ...data.map(x => x.v));
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((W - L) / 72))));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step, band = (W - L - R) / data.length, bw = Math.min(24, band - 2);
  const y = v => T + (H - T - B) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top + 1; v += step) ticks.push(v);
  const bar = (x, i) => {
    const h = Math.max(x.v ? 2 : 0, H - B - y(x.v)), bx = L + band * i + (band - bw) / 2, by = H - B - h, r = Math.min(4, h);
    const d = h ? `M${bx},${H - B}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${H - B}Z` : "";
    return `<g class="fc-bar" tabindex="${i === data.length - 1 ? 0 : -1}" role="img" aria-label="${esc(fdate(x.d))}: ${esc(fmtUZS(x.v))}" data-d="${esc(fdate(x.d, { weekday:"short", day:"numeric", month:"short" }))}" data-v="${esc(fmtUZS(x.v))}">
      <rect class="fc-hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"/>${d ? `<path d="${d}"/>` : ""}</g>`;
  };
  const labels = data.map((x, i) => (data.length - 1 - i) % every === 0 ? `<text class="fc-x" x="${L + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(fdate(x.d))}</text>` : "").join("");
  return `<div class="fchart" data-w="${W}"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(t("chart_fee"))}" aria-describedby="fc-keys">
      ${ticks.map(v => `<line class="fc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="fc-y" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compactUZS(v))}</text>`).join("")}
      ${data.map(bar).join("")}${labels}</svg>
    <div class="fc-tip" aria-hidden="true" hidden></div><p class="sr-only" id="fc-keys">${esc(t("chart_keys"))}</p></div>`;
}
function niceStep(raw){ const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
/* Подсказка у столбца: значение крупно, дата мельче. */
function tipAt(g){
  const box = g.closest(".fchart"), tip = box?.querySelector(".fc-tip"); if (!tip) return;
  tip.replaceChildren(Object.assign(document.createElement("b"), { textContent:g.dataset.v }), Object.assign(document.createElement("span"), { textContent:g.dataset.d }));
  const r = g.getBoundingClientRect(), b = box.getBoundingClientRect();
  tip.hidden = false; tip.style.left = clamp(r.left - b.left + r.width / 2, 60, b.width - 60) + "px"; tip.style.top = Math.max(0, r.top - b.top - 8) + "px";
}
const tipOff = g => { const tip = g.closest(".fchart")?.querySelector(".fc-tip"); if (tip) tip.hidden = true; };
document.addEventListener("pointerover", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipAt(g); });
document.addEventListener("pointerout", e => { const g = e.target.closest?.(".fc-bar"); if (g && !g.contains(e.relatedTarget)) tipOff(g); });
document.addEventListener("focusin", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipAt(g); });
document.addEventListener("focusout", e => { const g = e.target.closest?.(".fc-bar"); if (g) tipOff(g); });
/* Стрелки ведут по дням; в Tab график — одна остановка (последний день). */
document.addEventListener("keydown", e => {
  const g = e.target.closest?.(".fc-bar"); if (!g || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const bars = $$(".fc-bar", g.closest("svg")), i = bars.indexOf(g);
  const j = e.key === "Home" ? 0 : e.key === "End" ? bars.length - 1 : clamp(i + (e.key === "ArrowRight" ? 1 : -1), 0, bars.length - 1);
  e.preventDefault(); bars.forEach((b, k) => b.setAttribute("tabindex", k === j ? "0" : "-1")); bars[j].focus();
});

/* Сумма в плитке: от 100 млн — коротко («320,2 млн сум»), полная — в подсказке
   и для экранного диктора, чтобы плитка не обрезала цифры. */
const kpiMoney = n => n >= 1e8 ? { short:compactUZS(n) + NB + t("cur_uzs"), full:fmtUZS(n) } : fmtUZS(n);
function kpi(label, value, sub, href){
  const v = typeof value === "object" ? `<b class="kpi-v" title="${esc(value.full)}"><span aria-hidden="true">${esc(value.short)}</span><span class="sr-only">${esc(value.full)}</span></b>` : `<b class="kpi-v">${esc(value)}</b>`;
  const inner = `<span class="kpi-l">${esc(label)}</span>${v}${sub ? `<span class="kpi-s">${esc(sub)}</span>` : ""}`;
  return href ? `<a class="kpi" href="${href}">${inner}</a>` : `<div class="kpi">${inner}</div>`;
}

PAGES[""] = {
  render(){
    const u = me(), since30 = Date.now() - CHART_DAYS * DAY_MS, m30 = salesSince(since30), today = salesSince(parseYMD(TODAY).getTime());
    const onBalances = agencies().reduce((s, a) => s + a.st.balance, 0), n = taskCount(), data = feeByDay();
    const recent = O.audit.slice(0, 6);
    return `<div class="page">
      <div class="dash-head"><div class="stack" style="gap:4px"><h1>${esc(tf("adm_hello", { name:u.name.split(" ")[0] }))}</h1>
        <p class="muted">${esc(fdateLong(TODAY))} · ${esc(roleName(u.role))}</p></div></div>
      <div class="kpis">
        ${can("tasks") ? kpi(t("k_tasks"), String(n), n ? t("k_tasks_d") : t("k_tasks_none"), "#/tasks") : ""}
        ${canDecideAny() ? kpi(t("k_ap"), String(myDecisions().length), t(myDecisions().length ? "k_ap_d" : "k_ap_none"), "#/approvals") : ""}
        ${can("finance.view") ? kpi(t("k_fee30"), kpiMoney(m30.fee), pl(m30.n, "order"), "#/finance") : ""}
        ${can("orders.view") ? kpi(t("k_today"), kpiMoney(today.sales), pl(today.n, "order"), "#/orders") : ""}
        ${can("b2b.view") ? kpi(t("k_balances"), kpiMoney(onBalances), tf("k_agencies", { n:agencies().length }), "#/agencies") : ""}
      </div>
      ${can("finance.view") ? `<section class="card stack"><div class="card-h"><h2>${esc(t("chart_fee"))}</h2><span class="muted small">${esc(tf("chart_total", { amount:fmtUZS(data.reduce((s, x) => s + x.v, 0)) }))}</span></div>
        ${feeChart(data)}</section>` : ""}
      <div class="dash-grid">
        <section class="card stack"><div class="card-h"><h2>${esc(t("an_tasks"))}</h2>${can("tasks") ? `<a class="link" href="#/tasks">${esc(t("open_all"))}</a>` : ""}</div>
          ${taskSummary()}</section>
        ${can("audit.view") ? `<section class="card stack"><div class="card-h"><h2>${esc(t("recent_actions"))}</h2><a class="link" href="#/audit">${esc(t("an_audit"))}</a></div>
          ${recent.length ? `<ol class="feed">${recent.map(e => `<li><span class="feed-dot"></span><span class="stack" style="gap:2px"><span>${esc(auditText(e))}</span>
            <span class="muted small">${esc(staffName(e.staffId))} · ${esc(ago(e.at))}</span></span></li>`).join("")}</ol>` : `<p class="muted">${esc(t("audit_empty"))}</p>`}</section>` : ""}
      </div></div>`;
  },
  after(){
    const box = $(".fchart"); if (!box) return;
    const w = Math.round(box.clientWidth);
    if (w && Math.abs(w - FC_W) > 24) { FC_W = w; box.outerHTML = feeChart(feeByDay(), w); }
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
