/* ==========================================================================
   Заказ: документы (печать билета или ваучера с брендом агентства,
   «отправить клиенту» — почтой, SMS или в Telegram) и правка контактов.
   В демо письмо никуда не уходит: отправка записывается в историю заказа
   и в журнал — так же её запишет сервер, когда подключат рассылку.
   ========================================================================== */
"use strict";

const DOC_CH = ["email", "sms", "telegram"];
const docTo = (r, ch) => ch === "email" ? r.o.contact?.email || (r.a ? r.a.email : "") || "" : r.o.contact?.phone || "";
function docActions(r){
  const o = r.o, ch = DOC_CH.includes(inp("dch:" + o.id)) ? inp("dch:" + o.id) : o.contact?.email ? "email" : "sms";
  return `<section class="card stack doc-send doc-actions" aria-labelledby="doc-h-${o.id}"><div class="card-h"><h2 id="doc-h-${o.id}">${esc(t("doc_h"))}</h2>
      <button type="button" class="ghost sm" data-act="adprint">${IC.print}<span>${esc(t("doc_print"))}</span></button></div>
    ${can("orders.edit") ? `<div class="send-row">
      <select class="minisel" data-inp="dch:${o.id}" aria-label="${esc(t("doc_channel"))}">${DOC_CH.map(c => `<option value="${c}" ${ch === c ? "selected" : ""}>${esc(t("doc_ch_" + c))}</option>`).join("")}</select>
      ${inpField("dto:" + o.id, { value:docTo(r, ch), label:t("doc_to"), extra:'maxlength="80" autocomplete="off"' })}
      <button type="button" class="solid sm" data-act="adsend" data-src="${r.src}" data-v="${o.id}">${esc(t("doc_send"))}</button></div>
      <div class="err" id="dserr-${o.id}" hidden></div>
      <p class="muted small">${esc(t("doc_send_demo"))}</p>` : ""}
    ${o.sent?.length ? `<ul class="sent-list">${o.sent.map(x => `<li>${IC.ok}<span>${esc(t("doc_ch_" + x.ch))} · ${esc(x.to)} · ${esc(x.by)} · ${esc(fdt(x.at))}</span></li>`).join("")}</ul>` : ""}</section>`;
}
function sendDoc(r){
  if (denied("orders.edit")) return;
  const o = r.o, ch = DOC_CH.includes(inp("dch:" + o.id)) ? inp("dch:" + o.id) : o.contact?.email ? "email" : "sms", to = String(inp("dto:" + o.id, docTo(r, ch))).trim();
  const ok = !!to && (ch === "email" ? validEmail(to) : ch === "sms" ? validPhone(to) : validPhone(to) || /^@[A-Za-z0-9_]{4,32}$/.test(to));
  const fld = $(`[data-inp="${CSS.escape("dto:" + o.id)}"]`);
  if (!ok) { fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "dserr-" + o.id); showErr("#dserr-" + o.id, t("err_doc_to_" + ch)); fld?.focus(); return; }
  change(() => mutOrder(r, x => { (x.sent ||= []).push({ at:Date.now(), ch, to, by:me().name });
    audit("doc_sent", { no:x.no, ch:strRef("doc_ch_" + ch), to }, { module:"orders" }); }));
  if (M.ui.inp) delete M.ui.inp["dto:" + o.id];
  toast(tf("t_doc_sent", { to }));
}

/* ---- контакты заказа ---- */
function contactEdit(r){
  const o = r.o, d = M.ui.ocEdit;
  if (d?.id !== o.id) return can("orders.edit") ? `<button type="button" class="link" data-act="aocedit" data-src="${r.src}" data-v="${o.id}">${esc(t("oc_edit"))}</button>` : "";
  return `<div class="stack oc-form"><label class="field"><span>${esc(t("phone_label"))}</span><input data-oc="phone" type="tel" value="${esc(d.phone)}"></label>
    <label class="field"><span>${esc(t("agency_email"))}</span><input data-oc="email" type="email" value="${esc(d.email)}"></label><div class="err" id="ocerr" hidden></div>
    <div class="row"><button type="button" class="solid sm" data-act="aocsave" data-src="${r.src}" data-v="${o.id}">${esc(t("st_save"))}</button><button type="button" class="link" data-act="aocclose">${esc(t("cancel"))}</button></div></div>`;
}
function saveContact(r){
  if (denied("orders.edit")) return;
  const d = M.ui.ocEdit, phone = d.phone.trim(), email = d.email.trim();
  const bad = !validPhone(phone) ? "phone" : email && !validEmail(email) ? "email" : null;
  if (bad) { const f = $(`[data-oc="${bad}"]`); f?.setAttribute("aria-invalid", "true"); f?.setAttribute("aria-describedby", "ocerr"); showErr("#ocerr", t(bad === "phone" ? "err_phone" : "err_email")); f?.focus(); return; }
  change(() => mutOrder(r, o => {
    const next = { phone:prettyPhone(phone), email }, diff = [["phone", "phone_label"], ["email", "agency_email"]].filter(([k]) => (o.contact?.[k] || "") !== next[k]).map(([k, label]) => ({ k:label, from:o.contact?.[k] || "", to:next[k] }));
    if (!diff.length) return;
    o.contact = { ...o.contact, ...next }; audit("order_edit", { no:o.no }, { module:"orders", diff });
  }));
  M.ui.ocEdit = null; rerender(); toast(t("t_order_saved"));
}
Object.assign(ACT, {
  adprint: () => window.print(),
  adsend:  el => { const r = rowOf(el); if (r) sendDoc(r); },
  aocedit: el => { const r = rowOf(el); if (!r || denied("orders.edit")) return; M.ui.ocEdit = { id:r.o.id, phone:r.o.contact?.phone || "", email:r.o.contact?.email || "" }; rerender(); $('[data-oc="phone"]')?.focus(); },
  aocclose:() => { M.ui.ocEdit = null; rerender(); },
  aocsave: el => { const r = rowOf(el); if (r) saveContact(r); }
});
document.addEventListener("input", e => { const k = e.target.dataset?.oc; if (k && M.ui.ocEdit) M.ui.ocEdit[k] = e.target.value; });
/* Канал выбран — адрес по умолчанию меняется на почту или телефон. */
document.addEventListener("change", e => { const k = e.target.dataset?.inp; if (k?.startsWith("dch:") && M.ui.inp) { delete M.ui.inp["dto:" + k.slice(4)]; rerender(); $(`[data-inp="${CSS.escape(k)}"]`)?.focus(); } });
