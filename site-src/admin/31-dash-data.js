/* ==========================================================================
   Цифры обзора за период. Продажа — оплаченный заказ, день — день оплаты по
   часовому поясу компании (tzYmd). Отмена продажу не убирает, как в revenue()
   финансов: вернувшиеся деньги — во «Возвратах».
   ========================================================================== */
"use strict";

const DASH_PERIODS = [7, 30, 90];
const dashPeriod = () => DASH_PERIODS.includes(Number(M.ui.dper)) ? Number(M.ui.dper) : 30;
/* n календарных дней, последний — сегодня. */
function dashDays(n){ const to = tzToday(); return Array.from({ length:n }, (_, i) => addDays(to, i - n + 1)); }

/* Заказ агентства хранит paidAt; заказ сайта — только PAID в истории. */
const paidAtOf = o => o.paidAt || o.history?.find(h => h.s === "PAID")?.at || 0;
const refundedAtOf = o => o.history?.find(h => h.s === "REFUNDED")?.at || o.refund?.at || 0;

/* Куда едет клиент: у рейса — не Ташкент, у вертолёта — площадка. */
function destOf(o){
  const d = o.details || {};
  if (o.type === "FLIGHT") { const c = d.out ? (d.out.to === "TAS" && d.out.from ? d.out.from : d.out.to) : ""; return c ? { code:c } : null; }
  if (o.type === "TOUR" || o.type === "JET") return d.to ? { code:d.to } : null;
  if (o.type === "HOTEL") { const c = orderHotel(o)?.city; return c ? { code:c } : null; }
  if (o.type === "HELI") return d.to ? { code:d.to, heli:true } : null;
  return null;
}
const destName = x => x.heli ? heliName(x.code) : cityName(x.code);

/* Строки продаж: одна на оплаченный заказ с ценой. Сбор есть только у агентств. */
function dashSales(){
  const rows = [], add = (o, ch, fee) => { const at = paidAtOf(o); if (at && o.total) rows.push({ o, ch, day:tzYmd(at), sales:o.total.uzs, fee }); };
  for (const a of agencies()) for (const o of a.st.orders) add(o, "b2b", o.fee?.uzs || 0);
  for (const o of SITE?.orders || []) add(o, "b2c", 0);
  return rows;
}
const sumOf = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

function dashMetrics(n = dashPeriod()){
  const days = dashDays(n), from = days[0], to = days[n - 1], inP = d => d >= from && d <= to;
  const rows = dashSales().filter(r => inP(r.day)), b2b = rows.filter(r => r.ch === "b2b"), b2c = rows.filter(r => r.ch === "b2c");
  const ags = agencies(), orders = allOrders(), ledger = ags.flatMap(a => a.st.ledger);
  // Средняя ставка сбора — только по заказам, где сбор был.
  const feeRows = b2b.filter(r => r.fee > 0), fee = sumOf(feeRows, r => r.fee), feeBase = sumOf(feeRows, r => r.sales);
  const unpaid = orders.filter(({ o }) => inP(tzYmd(o.createdAt)) && !paidAtOf(o) && !["CANCELLED", "REFUNDED"].includes(o.status)).length;
  // Пополнения — зачисленные в период, ручные корректировки (adjust) не в счёт.
  const topups = sumOf(ledger.filter(l => l.kind === "topup" && inP(tzYmd(l.at))), l => l.amount);
  const topWait = ags.flatMap(a => a.st.topups.filter(p => p.status === "pending"));
  const siteRef = (SITE?.orders || []).filter(o => o.refund?.done && inP(tzYmd(refundedAtOf(o))));
  const refunds = sumOf(ledger.filter(l => l.kind === "refund" && inP(tzYmd(l.at))), l => l.amount) + sumOf(siteRef, o => o.refund.uzs);
  const refWait = orders.filter(({ o }) => o.status === "CANCELLED" && o.refund && !o.refund.done);
  const b2bSum = sumOf(b2b, r => r.sales), b2cSum = sumOf(b2c, r => r.sales);
  return { n, days, from, to, rows,
    b2b:{ sum:b2bSum, n:b2b.length }, b2c:{ sum:b2cSum, n:b2c.length }, turnover:b2bSum + b2cSum, orders:rows.length, unpaid,
    fee, feeBps:feeBase ? Math.round(fee / feeBase * 1e4) : 0,
    topups, topWait:{ n:topWait.length, sum:sumOf(topWait, p => p.amount) },
    refunds, refWait:{ n:refWait.length, sum:sumOf(refWait, ({ o }) => o.refund.uzs || 0) } };
}

/* «Сейчас» — без периода. Клиенты — тот же список, что «Пассажиры сайта»
   (лиды — по видимости роли), поэтому считаем только, если роль его видит. */
function dashSnapshot(){
  const ags = agencies(), cl = can("clients") ? b2cClients() : [], since = addDays(tzToday(), -29);
  return { balance:sumOf(ags, a => a.st.balance), neg:ags.filter(a => a.st.balance < 0).length,
    agencies:ags.length, active:ags.filter(agencyActiveOf).length, blocked:ags.filter(a => !agencyActiveOf(a)).length,
    apps:loadApps().filter(x => x.status === "pending").length,
    clients:cl.length, newClients:cl.filter(c => c.first && tzYmd(c.first) >= since).length };
}

/* Корзины графика: по дню до 31 дня, иначе по 7 дней назад от сегодня
   (90 дней → 13 корзин, первая — 6 дней). Сумма корзин = оборот. */
function dashBuckets(m){
  const size = m.n <= 31 ? 1 : 7, out = [];
  for (let end = m.n - 1; end >= 0; end -= size) out.unshift({ from:m.days[Math.max(0, end - size + 1)], to:m.days[end], b2b:0, b2c:0, fee:0 });
  for (const r of m.rows) { const b = out.find(x => r.day >= x.from && r.day <= x.to); if (b) { b[r.ch] += r.sales; b.fee += r.fee; } }
  return out;
}
/* Направления: по числу заказов, при равенстве — по сумме. */
function dashDest(m){
  const map = new Map();
  for (const r of m.rows) {
    const x = destOf(r.o); if (!x) continue;
    const key = (x.heli ? "h:" : "") + x.code;
    if (!map.has(key)) map.set(key, { key, ...x, name:destName(x), n:0, sales:0 });
    const v = map.get(key); v.n++; v.sales += r.sales;
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.sales - a.sales);
}
function dashSvc(m){
  return SVC_TYPES.map(k => {
    const xs = m.rows.filter(r => r.o.type === k);
    return { k, n:xs.length, b2b:sumOf(xs.filter(r => r.ch === "b2b"), r => r.sales), b2c:sumOf(xs.filter(r => r.ch === "b2c"), r => r.sales), fee:sumOf(xs, r => r.fee) };
  }).filter(x => x.b2b + x.b2c > 0).sort((a, b) => (b.b2b + b.b2c) - (a.b2b + a.b2c));
}
