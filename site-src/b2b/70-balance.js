/* ==========================================================================
   Баланс: пополнение картой (сразу), переводом или наличными (после
   подтверждения банка или кассы Charteri) и выписка по каждой проводке.
   ========================================================================== */
"use strict";

const TOPUP_MIN = 100_000, TOPUP_MAX = 500_000_000;
const TOPUP_QUICK = [5_000_000, 10_000_000, 25_000_000, 50_000_000];
const TOPUP_METHODS = ["card", "bank", "cash"];
/* Реквизиты для счёта — демонстрационные. Настоящие придут из договора с агентством. */
const DEMO_REQUISITES = [["req_payee", "OOO «CHARTERI»"], ["req_account", "2020 8000 0000 0000 0001"], ["req_bank", "Kapitalbank, MFO 01018"], ["req_inn", "309 000 000"]];

const ledgerTitle = l => {
  const o = l.orderId && S.orders.find(x => x.id === l.orderId);
  const m = l.method || "bank";
  if (l.kind === "topup") return `${t("led_topup")} · ${t("topup_m_" + m)}`;
  return tf(l.kind === "refund" ? "led_refund" : "led_order", { no:o ? o.no : "—" });
};
function ledgerRows(){
  const f = M.ui.lfilter || "all", list = S.ledger.filter(l => f === "all" || l.kind === f);
  if (!list.length) return `<p class="muted">${esc(t("ledger_empty"))}</p>`;
  return `<div class="ltable" role="table" aria-label="${esc(t("statement"))}"><div class="lrow lhead" role="row">${["col_date", "col_operation", "col_amount", "col_after"].map(k =>
      `<span role="columnheader">${esc(t(k))}</span>`).join("")}</div>
    ${list.map(l => { const o = l.orderId && S.orders.find(x => x.id === l.orderId);
      return `<div class="lrow" role="row"><span class="l-date" role="cell">${esc(fdt(l.at))}</span>
        <span class="l-op" role="cell">${o ? `<a href="#/orders/${o.id}">${esc(ledgerTitle(l))}</a><span class="muted small">${esc(orderTitle(o))}</span>` : esc(ledgerTitle(l))}</span>
        <span class="l-amt mono ${l.amount > 0 ? "plus" : ""}" role="cell">${l.amount > 0 ? "+" : "−"}${grp(Math.abs(l.amount))}</span>
        <span class="l-after mono" role="cell">${grp(l.after)}</span></div>`; }).join("")}</div>`;
}
function topupForm(){
  const m = M.ui.tuMethod || "card", amount = Number(M.ui.tuAmount || 0);
  const detail = m === "bank"
    ? `<div class="reqs">${DEMO_REQUISITES.map(([k, v]) => `<div><span class="k">${esc(t(k))}</span><span class="v mono">${esc(v)}</span></div>`).join("")}
        <div><span class="k">${esc(t("req_purpose"))}</span><span class="v">${esc(tf("req_purpose_v", { inn:S.agency.inn }))}</span></div></div>`
    : "";
  return `<section class="card stack topup" id="topup" aria-labelledby="tu-h"><h2 id="tu-h">${esc(t("topup_title"))}</h2>
    <label class="field"><span>${esc(t("topup_amount"))}</span>
      <span class="amt-in"><input id="tuAmount" inputmode="numeric" autocomplete="off" value="${amount ? grp(amount) : ""}" placeholder="10 000 000"><i>${esc(t("cur_uzs"))}</i></span></label>
    <div class="quickamt">${TOPUP_QUICK.map(v => `<button type="button" class="chip" data-act="tuq" data-v="${v}" aria-pressed="${amount === v}">${grp(v)}</button>`).join("")}</div>
    <div class="field"><span>${esc(t("topup_method"))}</span>${seg("tum", TOPUP_METHODS.map(k => [k, t("topup_m_" + k)]), m)}</div>
    <p class="tu-note">${IC.clock}<span>${esc(t("topup_d_" + m))}</span></p>${detail}
    <div class="err" id="tuerr" hidden></div>
    <button type="button" class="cta" data-act="tugo">${esc(t("topup_cta_" + m))}${amount ? ` · ${fmtUZS(amount)}` : ""}</button></section>`;
}
PAGES.balance = {
  render(){
    const pending = S.topups.filter(p => p.status === "pending"), f = M.ui.lfilter || "all";
    const month = TODAY.slice(0, 7), inMonth = l => ymd(new Date(l.at)).startsWith(month);
    const credits = S.ledger.filter(l => inMonth(l) && l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const debits = S.ledger.filter(l => inMonth(l) && l.amount < 0).reduce((s, l) => s - l.amount, 0);
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("nav_balance"))}</h1><p class="muted">${esc(t("balance_sub"))}</p></div>
      <div class="bal-top">
        <section class="balhero" aria-label="${esc(t("balance_now"))}">
          <span class="lbl">${esc(t("balance_now"))}</span>
          <b class="bal-big mono">${grp(S.balance)}<small>${esc(t("cur_uzs"))}</small></b>
          <dl class="bal-stats">
            <div><dt>${esc(t("month_in"))}</dt><dd class="mono">+${grp(credits)}</dd></div>
            <div><dt>${esc(t("month_out"))}</dt><dd class="mono">−${grp(debits)}</dd></div></dl>
          ${pending.length ? `<div class="pend"><span class="lbl">${esc(t("topups_pending"))}</span>${pending.map(p => `<div class="pend-row"><span class="spin"></span>
            <span>${esc(t("topup_m_" + p.method))} · ${esc(fdt(p.at))}</span><b class="mono">+${grp(p.amount)}</b></div>`).join("")}</div>` : ""}
        </section>
        ${topupForm()}
      </div>
      <section class="card stack"><div class="card-h"><h2>${esc(t("statement"))}</h2>
          <button type="button" class="ghost sm" data-act="csv">${IC.doc}<span>${esc(t("download_csv"))}</span></button></div>
        <div class="chipbar">${["all", "topup", "order", "refund"].map(k => `<button type="button" class="chip" data-act="lfilter" data-v="${k}" aria-pressed="${f === k}">${esc(t("lf_" + k))}</button>`).join("")}</div>
        ${ledgerRows()}</section></div>`;
  },
  after(){
    if (!location.hash.includes("?topup")) return;
    $("#topup")?.scrollIntoView({ block:"start", behavior:"instant" });
    $("#tuAmount")?.focus({ preventScroll:true });
  }
};

/* Сумма хранится цифрами, группы разрядов — при показе. */
function readAmount(){ const v = Number(digits($("#tuAmount")?.value || M.ui.tuAmount || "")); M.ui.tuAmount = v || ""; return v; }
Object.assign(ACT, {
  tuq: el => { M.ui.tuAmount = Number(el.dataset.v); rerender(); },
  tum: el => { readAmount(); M.ui.tuMethod = el.dataset.v; rerender(); },
  lfilter: el => { M.ui.lfilter = el.dataset.v; rerender(); },
  tugo: () => {
    const amount = readAmount(), m = M.ui.tuMethod || "card";
    hideErr("#tuerr");
    if (amount < TOPUP_MIN || amount > TOPUP_MAX) return showErr("#tuerr", tf("err_topup", { min:fmtUZS(TOPUP_MIN), max:fmtUZS(TOPUP_MAX) }));
    if (m === "card") {
      overlay(t("processing"));
      setTimeout(() => {
        overlay(""); post("topup", amount, { method:"card" }); note("topup_ok", { amount });
        M.ui.tuAmount = ""; save(); rerender(); toast(tf("n_topup_ok", { amount:fmtUZS(amount) }));
      }, 1300);
      return;
    }
    S.topups.push({ id:uid("t"), at:Date.now(), amount, method:m, status:"pending" });
    note("topup_pending", { amount }); M.ui.tuAmount = ""; save(); rerender();
    toast(tf("n_topup_pending", { amount:fmtUZS(amount) }));
  },
  /* Выписка для бухгалтерии: CSV с BOM, чтобы Excel открыл кириллицу. */
  csv: () => {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [[t("col_date"), t("col_operation"), t("col_amount"), t("col_after")],
      ...S.ledger.map(l => [new Date(l.at).toLocaleString(LOC[S.lang]), ledgerTitle(l), l.amount, l.after])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(";")).join("\r\n")], { type:"text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:`charteri-statement-${TODAY}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
/* Разряды расставляются, когда поле отпустили: при вводе курсор бы прыгал. */
document.addEventListener("input", e => { if (e.target.id === "tuAmount") M.ui.tuAmount = Number(digits(e.target.value)) || ""; });
document.addEventListener("focusout", e => { if (e.target.id === "tuAmount") { const v = readAmount(); e.target.value = v ? grp(v) : ""; } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "tuAmount") ACT.tugo(); });
