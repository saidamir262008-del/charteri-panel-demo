/* ==========================================================================
   Действия сотрудников. Каждое: проверить право → перечитать свежие данные →
   изменить → сохранить → записать в журнал. Деньги агентств двигаются теми
   же проводками, что в кабинете (post), события агентства — теми же note.
   ========================================================================== */
"use strict";

/* Заказ из строки allOrders(): свежая копия внутри своего хранилища. */
function mutOrder(r, fn){
  if (r.src === "site") return withSite(site => { const o = site.orders.find(x => x.id === r.o.id); return o ? fn(o, null) : undefined; });
  return withAgency(r.src, st => { const o = st.orders.find(x => x.id === r.o.id); return o ? fn(o, st) : undefined; });
}
/* Поле ввода в строке очереди: значение живёт в M.ui.inp, чтобы пережить перерисовку. */
const inp = (key, fallback = "") => M.ui.inp?.[key] ?? fallback;
const inpField = (key, attrs) => `<input data-inp="${esc(key)}" value="${esc(inp(key, attrs.value ?? ""))}" ${attrs.extra || ""} aria-label="${esc(attrs.label)}" placeholder="${esc(attrs.ph || "")}">`;
document.addEventListener("input", e => { const k = e.target.dataset?.inp; if (k != null) (M.ui.inp ||= {})[k] = e.target.value; });
const takeInp = key => { const v = (M.ui.inp?.[key] ?? $(`[data-inp="${CSS.escape(key)}"]`)?.value ?? "").trim(); if (M.ui.inp) delete M.ui.inp[key]; return v; };

/* ---- заказы ---- */
function priceOrder(r, usd){
  if (denied("orders.price")) return false;
  if (!(usd > 0 && usd < 5_000_000)) { toast(t("err_price")); return false; }
  let done = false;
  change(() => mutOrder(r, (o, st) => {
    if (o.status !== "NEW") return;
    o.total = amt(usd); o.status = "PENDING"; hist(o, "PENDING"); done = true;
    if (st) { o.feeBps = prices().feeBps; o.fee = feeOf(o.total, o.feeBps); note("price_ready", { orderId:o.id }, st); }
    audit("price", { no:o.no, amount:fmtUZS(o.total.uzs), src:srcName(r) });
  }));
  if (done) toast(tf("t_priced", { no:r.o.no }));
  return done;
}
function confirmOrder(r){
  if (denied("orders.confirm")) return;
  change(() => mutOrder(r, (o, st) => {
    if (o.status !== "PAID") return;
    o.status = "CONFIRMED"; hist(o, "CONFIRMED");
    if (st) note("confirmed", { orderId:o.id }, st);
    audit("confirm", { no:o.no, src:srcName(r) });
  }));
}
/* Оплаченный заказ: штраф поставщика по правилам услуги, сбор не возвращается,
   остаток ждёт зачисления (кассир). Неоплаченная заявка закрывается без денег. */
function cancelOrder(r){
  if (denied("orders.cancel")) return;
  change(() => mutOrder(r, (o, st) => {
    if (!["NEW", "PENDING", "PAID", "CONFIRMED"].includes(o.status)) return;
    if (["PAID", "CONFIRMED"].includes(o.status) && o.total) {
      const p = penaltyOf(o); o.refund = { rate:p.rate, penalty:p.penalty, uzs:p.refund, at:Date.now(), done:false };
    }
    o.status = "CANCELLED"; hist(o, "CANCELLED");
    if (st) note("cancelled", { orderId:o.id }, st);
    audit("cancel", { no:o.no, src:srcName(r), amount:o.refund ? fmtUZS(o.refund.uzs) : "—" });
  }));
  M.ui.cancelFor = null;
}
function creditRefund(r){
  if (denied("refunds.credit")) return;
  change(() => mutOrder(r, (o, st) => {
    if (o.status !== "CANCELLED" || !o.refund || o.refund.done) return;
    o.refund.done = true; o.status = "REFUNDED"; hist(o, "REFUNDED");
    if (st) { if (o.refund.uzs > 0) post("refund", o.refund.uzs, { orderId:o.id }, st); note("refunded", { orderId:o.id, amount:o.refund.uzs }, st); }
    audit("refund", { no:o.no, amount:fmtUZS(o.refund.uzs), src:srcName(r) });
  }));
}
function resolveReq(r, status, reply){
  if (denied("requests.resolve")) return false;
  if (status === "declined" && !reply) { toast(t("err_reply")); return false; }
  const done = withSite(site => { const o = site.orders.find(x => x.id === r.o.id); if (!o?.req || o.req.status) return false;
    Object.assign(o.req, { status, reply, doneAt:Date.now(), by:me().name }); return true; });
  if (!done) { rerender(); return false; }
  change(() => audit(status === "done" ? "req_done" : "req_declined", { no:r.o.no }));
  return true;
}

/* ---- пополнения ---- */
function confirmTopup(aid, pid){
  if (denied("topups.confirm")) return;
  let amount = 0;
  change(() => withAgency(aid, st => {
    const p = st.topups.find(x => x.id === pid); if (!p || p.status !== "pending") return;
    Object.assign(p, { status:"done", doneAt:Date.now(), by:me().name }); amount = p.amount;
    post("topup", p.amount, { method:p.method }, st); note("topup_ok", { amount:p.amount }, st);
    audit("topup_ok", { amount:fmtUZS(p.amount), agency:agencyById(aid)?.name || "" });
  }));
  if (amount) toast(tf("t_topup_ok", { amount:fmtUZS(amount) }));
}
function rejectTopup(aid, pid, reason){
  if (denied("topups.confirm")) return false;
  if (!reason) { toast(t("err_reason")); return false; }
  change(() => withAgency(aid, st => {
    const p = st.topups.find(x => x.id === pid); if (!p || p.status !== "pending") return;
    Object.assign(p, { status:"rejected", doneAt:Date.now(), by:me().name, reason });
    note("topup_rejected", { amount:p.amount, reason }, st);
    audit("topup_rejected", { amount:fmtUZS(p.amount), agency:agencyById(aid)?.name || "", reason });
  }));
  return true;
}

/* ---- агентства ---- */
function decideApp(id, ok, reason = ""){
  if (denied("agencies.moderate")) return false;
  if (!ok && !reason) { toast(t("err_reason")); return false; }
  const apps = loadApps(), a = apps.find(x => x.id === id); if (!a || a.status !== "pending") return false;
  Object.assign(a, { status:ok ? "approved" : "rejected", reason, decidedAt:Date.now(), by:me().name });
  writeJSON(APPS_KEY, apps);
  change(() => {
    if (ok) O.agencies.push({ id:"ag-" + a.id, agency:{ name:a.company, legal:a.company, inn:a.inn, phone:a.phone, email:a.email, status:"verified", blockReason:"", since:TODAY },
      brand:{ name:a.company, phone:a.phone, email:a.email, address:"", telegram:"", color:"#16275C", logo:null }, balance:0, ledger:[], topups:[], orders:[], notes:[], travellers:[] });
    audit(ok ? "app_ok" : "app_rejected", { company:a.company, reason });
  });
  toast(tf(ok ? "t_app_ok" : "t_app_rejected", { company:a.company }));
  return true;
}
function setBlocked(aid, blocked, reason = ""){
  if (denied("agencies.block")) return false;
  if (blocked && !reason) { toast(t("err_reason")); return false; }
  change(() => withAgency(aid, st => {
    st.agency.status = blocked ? "blocked" : "verified"; st.agency.blockReason = blocked ? reason : "";
    note(blocked ? "blocked" : "unblocked", { reason }, st);
    audit(blocked ? "block" : "unblock", { agency:st.agency.name, reason });
  }));
  return true;
}
/* Ручная корректировка: только с причиной и не ниже нуля — как любое движение денег. */
const ADJUST_MAX = 10_000_000_000;
function adjustBalance(aid, amount, reason){
  if (denied("balance.adjust")) return false;
  if (!amount || !Number.isFinite(amount) || Math.abs(amount) > ADJUST_MAX) { toast(t("err_amount")); return false; }
  if (!reason) { toast(t("err_reason")); return false; }
  let ok = false;
  change(() => withAgency(aid, st => {
    if (st.balance + amount < 0) return;
    post("adjust", amount, { reason, by:me().name }, st); note("adjust", { amount, reason }, st); ok = true;
    audit("adjust", { agency:st.agency.name, amount:(amount > 0 ? "+" : "") + fmtUZS(amount), reason });
  }));
  toast(ok ? t("t_adjusted") : t("err_negative"));
  return ok;
}

/* ---- кнопки ---- */
const rowOf = el => findOrder(el.dataset.src, el.dataset.v);
Object.assign(ACT, {
  aprice:   el => {
    const r = rowOf(el); if (!r) return;
    const raw = String(inp("p:" + r.o.id, $(`[data-inp="${CSS.escape("p:" + r.o.id)}"]`)?.value ?? "")).replace(/\s/g, "").replace(",", ".");
    const usd = raw === "" ? NaN : Math.round(Number(raw));
    if (priceOrder(r, usd) && M.ui.inp) delete M.ui.inp["p:" + r.o.id];
  },
  aconfirm: el => { const r = rowOf(el); if (r) confirmOrder(r); },
  acancel:  el => { M.ui.cancelFor = el.dataset.v || null; rerender(); },
  acancelgo:el => { const r = rowOf(el); if (r) cancelOrder(r); },
  arefund:  el => { const r = rowOf(el); if (r) creditRefund(r); },
  areq:     el => { const r = rowOf(el); if (r && resolveReq(r, el.dataset.s, takeInp("r:" + r.o.id))) toast(t(el.dataset.s === "done" ? "t_req_done" : "t_req_declined")); },
  atopup:   el => confirmTopup(el.dataset.ag, el.dataset.v),
  /* Отказ открывает поле причины; второй шаг — «Отклонить» с причиной. */
  aask:     el => { (M.ui.ask ||= {})[el.dataset.k] = !M.ui.ask[el.dataset.k]; rerender(); $(`[data-inp="${CSS.escape("why:" + el.dataset.k)}"]`)?.focus(); },
  atopupno: el => { if (rejectTopup(el.dataset.ag, el.dataset.v, takeInp("why:t" + el.dataset.v))) M.ui.ask["t" + el.dataset.v] = false; rerender(); },
  aappok:   el => decideApp(el.dataset.v, true),
  aappno:   el => { if (decideApp(el.dataset.v, false, takeInp("why:a" + el.dataset.v))) M.ui.ask["a" + el.dataset.v] = false; rerender(); },
  ablock:   el => { if (setBlocked(el.dataset.v, true, takeInp("why:b" + el.dataset.v))) M.ui.ask["b" + el.dataset.v] = false; rerender(); },
  aunblock: el => setBlocked(el.dataset.v, false),
  aadjust:  el => {
    const sign = el.dataset.s === "-" ? -1 : 1, n = Number(digits(inp("adj:" + el.dataset.v))), why = inp("adjwhy:" + el.dataset.v).trim();
    if (adjustBalance(el.dataset.v, sign * n, why) && M.ui.inp) { delete M.ui.inp["adj:" + el.dataset.v]; delete M.ui.inp["adjwhy:" + el.dataset.v]; rerender(); }
  }
});

/* ---- общие куски разметки для очереди, заказов и агентств ---- */
/* Кнопка «Отклонить» с полем причины: key — уникальный ключ строки. */
function rejectBox(key, act, data, perm){
  if (!M.ui.ask?.[key]) return `<button type="button" class="link danger" data-act="aask" data-k="${esc(key)}" ${guard(perm)}>${esc(t("reject"))}</button>`;
  return `<span class="why">${inpField("why:" + key, { label:t("reason"), ph:t("reason_ph"), extra:'maxlength="120"' })}
    <button type="button" class="solid sm danger-solid" data-act="${act}" ${data} ${guard(perm)}>${esc(t("reject"))}</button>
    <button type="button" class="link" data-act="aask" data-k="${esc(key)}">${esc(t("cancel"))}</button></span>`;
}
const methodLabel = m => t("topup_m_" + m);
function topupRow(p, a){
  return `<div class="task"><span class="task-ic">${IC.wallet}</span>
    <span class="task-main"><b>${esc(a.name)}</b><span class="muted small">${esc(methodLabel(p.method))} · ${esc(ago(p.at))}</span></span>
    <b class="task-amt mono">+${esc(fmtUZS(p.amount))}</b>
    <span class="task-act"><button type="button" class="solid sm" data-act="atopup" data-ag="${a.id}" data-v="${p.id}" ${guard("topups.confirm")}>${esc(t("confirm"))}</button>
      ${rejectBox("t" + p.id, "atopupno", `data-ag="${a.id}" data-v="${p.id}"`, "topups.confirm")}</span></div>`;
}
function appRow(x){
  return `<div class="task"><span class="task-ic">${IC.users}</span>
    <span class="task-main"><b>${esc(x.company)}</b><span class="muted small">${esc(t("req_inn"))} <span class="mono">${esc(x.inn)}</span> · ${esc(x.person)} · <span class="mono">${esc(x.phone)}</span> · ${esc(ago(x.at))}</span></span>
    <span class="task-act"><button type="button" class="solid sm" data-act="aappok" data-v="${x.id}" ${guard("agencies.moderate")}>${esc(t("approve"))}</button>
      ${rejectBox("a" + x.id, "aappno", `data-v="${x.id}"`, "agencies.moderate")}</span></div>`;
}
function priceRow(r){
  const o = r.o, d = o.details, key = "p:" + o.id;
  return `<div class="task"><span class="task-ic warn">${TYPE_ICON[o.type]}</span>
    <span class="task-main"><a href="#/orders/${r.src}/${o.id}"><b>${esc(orderTitle(o))}</b></a>
      <span class="muted small">${esc(srcName(r))} · ${esc(fdateY(d.date))}, ${esc(d.time)} · ${esc(pl(d.pax, "pax"))} · ${esc(d.model)} · ${esc(ago(o.createdAt))}</span>
      <span class="muted small">${esc(t("estimate"))}: <span class="mono">$${grp(d.low.usd)} – $${grp(d.high.usd)}</span></span></span>
    <span class="task-act price-in"><span class="usd-in"><i>$</i>${inpField(key, { value:String(d.quote.usd), label:t("price_usd"), extra:'inputmode="numeric" maxlength="7"' })}</span>
      <button type="button" class="solid sm" data-act="aprice" data-src="${r.src}" data-v="${o.id}" ${guard("orders.price")}>${esc(t("set_price"))}</button></span></div>`;
}
function reqRow(r){
  const o = r.o, key = "r:" + o.id;
  return `<div class="task task-wide"><span class="task-ic">${IC.person}</span>
    <span class="task-main"><a href="#/orders/site/${o.id}"><b>${esc(orderTitle(o))}</b></a>
      <span class="muted small"><span class="mono">${o.no}</span> · ${esc(t("req_kind_" + o.req.kind))} · ${esc(o.contact.phone)} · ${esc(ago(o.req.at))}</span>
      ${o.req.note ? `<span class="small">«${esc(o.req.note)}»</span>` : ""}</span>
    <span class="task-act reply">${inpField(key, { label:t("reply"), ph:t("reply_ph"), extra:'maxlength="200"' })}
      <button type="button" class="solid sm" data-act="areq" data-s="done" data-src="site" data-v="${o.id}" ${guard("requests.resolve")}>${esc(t("req_done_cta"))}</button>
      <button type="button" class="link danger" data-act="areq" data-s="declined" data-src="site" data-v="${o.id}" ${guard("requests.resolve")}>${esc(t("req_decline_cta"))}</button></span></div>`;
}
function refundRow(r){
  const o = r.o;
  return `<div class="task"><span class="task-ic">${IC.back}</span>
    <span class="task-main"><a href="#/orders/${r.src}/${o.id}"><b>${esc(orderTitle(o))}</b></a>
      <span class="muted small"><span class="mono">${o.no}</span> · ${esc(srcName(r))} · ${esc(tf("penalty_short", { p:Math.round(o.refund.rate * 100) }))} · ${esc(ago(o.refund.at))}</span></span>
    <b class="task-amt mono">${esc(fmtUZS(o.refund.uzs))}</b>
    <span class="task-act"><button type="button" class="solid sm" data-act="arefund" data-src="${r.src}" data-v="${o.id}" ${guard("refunds.credit")}>${esc(t(r.a ? "credit_refund" : "card_refund"))}</button></span></div>`;
}
