/* ==========================================================================
   Пассажиры сайта: покупатели B2C по номеру телефона, их заказы и
   сохранённые пассажиры. Данные — из демо сайта в этом же браузере.
   ========================================================================== */
"use strict";

/* Покупатель — номер телефона из контактов заказа; вошедший на сайте — тоже. */
function customers(){
  if (!SITE) return [];
  const map = new Map();
  const add = (phone, name) => { const k = digits(phone); if (!k) return null; if (!map.has(k)) map.set(k, { key:k, phone:prettyPhone(phone), name:name || "", orders:[], spent:0, last:0 }); return map.get(k); };
  if (SITE.user?.phone) add(SITE.user.phone, "");
  for (const o of SITE.orders) {
    const c = add(o.contact?.phone, o.travellers[0] ? `${o.travellers[0].given} ${o.travellers[0].surname}`.trim() : ""); if (!c) continue;
    c.orders.push(o); c.last = Math.max(c.last, o.createdAt); if (!c.name && o.travellers[0]) c.name = `${o.travellers[0].given} ${o.travellers[0].surname}`.trim();
    if (o.total && !["NEW", "PENDING", "CANCELLED", "REFUNDED"].includes(o.status)) c.spent += o.total.uzs;
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}
const noSite = () => `<div class="card empty"><h3>${esc(t("site_none"))}</h3><p class="muted">${esc(t("site_none_d"))}</p>
  <a class="solid" href="../b2c/" target="_blank" rel="noopener">${esc(t("open_site"))}</a></div>`;

PAGES.customers = {
  render(){
    const list = customers();
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_customers"))}</h1><p class="muted">${esc(t("customers_sub"))}</p></div>
      ${!SITE ? noSite() : !list.length ? `<div class="card empty"><h3>${esc(t("customers_empty"))}</h3></div>`
      : `<div class="card"><div class="atable" style="--cols:minmax(0,2fr) minmax(0,1.3fr) 110px minmax(0,1.2fr) 140px">
        <div class="arow ahead" aria-hidden="true"><span>${esc(t("customer"))}</span><span>${esc(t("phone_label"))}</span><span class="a-num">${esc(t("an_orders"))}</span>
          <span class="a-num">${esc(t("col_spent"))}</span><span class="a-end">${esc(t("col_last"))}</span></div>
        ${list.map((c, i) => `<a class="arow" style="--i:${i}" href="#/customers/${c.key}"><span class="a-main a-with-mark"><span class="avatar sm">${esc(monogram(c.name || "?"))}</span>
          <b>${esc(c.name || t("guest"))}</b></span><span class="a-cell a-sub mono">${esc(c.phone)}</span><span class="a-num mono">${c.orders.length}</span>
          <span class="a-num a-keep mono">${fmtUZS(c.spent)}</span><span class="a-end muted small">${c.last ? esc(fdt(c.last)) : "—"}</span></a>`).join("")}</div></div>`}</div>`;
  }
};
PAGES["customers/:phone"] = {
  render({ phone }){
    const c = customers().find(x => x.key === phone);
    if (!c) return `<div class="page">${backLink("customers", t("an_customers"))}<div class="card empty"><h1 class="h-empty">${esc(t("customer_missing"))}</h1></div></div>`;
    const signedIn = SITE.user?.phone && digits(SITE.user.phone) === c.key;
    return `<div class="page">${backLink("customers", t("an_customers"))}
      <div class="ohead"><span class="avatar">${esc(monogram(c.name || "?"))}</span><div><span class="lbl">${esc(t("customer"))}</span><h1>${esc(c.name || t("guest"))}</h1>
        <p class="muted mono">${esc(c.phone)}</p></div>${signedIn ? `<span class="pill st-CONFIRMED">${esc(t("signed_site"))}</span>` : ""}</div>
      <div class="twocol"><section class="card stack"><h2>${esc(t("an_orders"))}</h2>
          ${c.orders.length ? `<div class="atable" style="--cols:${ORDER_COLS_COMPACT}">${c.orders.map((o, i) => admOrderRow({ o, a:null, src:"site" }, i, "", true)).join("")}</div>` : `<p class="muted">${esc(t("orders_empty"))}</p>`}</section>
        <aside class="stack sticky"><div class="card stack"><span class="lbl">${esc(t("saved_travellers"))}</span>
          ${signedIn && SITE.travellers.length ? SITE.travellers.map(x => `<div class="trow"><b>${esc(x.given)} ${esc(x.surname)}</b><span class="mono small muted">${esc(x.passport.slice(0, 2))}•••${esc(x.passport.slice(-3))}</span></div>`).join("")
            : `<p class="muted small">${esc(t("travellers_none"))}</p>`}
          <p class="muted small">${esc(t("pii_note"))}</p></div>
          <div class="card stack"><div class="rows"><div><span class="k">${esc(t("col_spent"))}</span><span class="v mono">${fmtUZS(c.spent)}</span></div></div></div></aside></div></div>`;
  }
};
