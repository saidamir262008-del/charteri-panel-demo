/* ==========================================================================
   Заказ: документы (печать билета или ваучера с брендом агентства,
   «отправить клиенту» — почтой, SMS или в Telegram), правка контактов и
   данных путешественников — у заказов сайта и агентств одинаково. Отменённый
   и прошедший заказ не правится: документ по нему уже не выдаётся.
   В демо письмо никуда не уходит: отправка записывается в историю заказа
   и в журнал — так же её запишет сервер, когда подключат рассылку.
   ========================================================================== */
"use strict";

const DOC_CH = ["email", "sms", "telegram"];
/* Каналы, включённые в «Системе» (14-system.js): выключенный не предлагается. */
const docChs = () => DOC_CH.filter(c => sysCfg().ch[c].on);
const docCh = o => { const l = docChs(), x = inp("dch:" + o.id); return l.includes(x) ? x : o.contact?.email && l.includes("email") ? "email" : l.includes("sms") ? "sms" : l[0] || ""; };
const docTo = (r, ch) => ch === "email" ? r.o.contact?.email || (r.a ? r.a.email : "") || "" : r.o.contact?.phone || "";
function docActions(r){
  // Выбранный канал выключили в «Системе»: на экране — другой канал, и адрес к нему свой. Старые выбор и
  // адрес сбрасываем здесь, чтобы «Отправить» ушло тем, что видно (сравни sendDoc).
  const picked = inp("dch:" + r.o.id);
  if (picked && !docChs().includes(picked) && M.ui.inp) { delete M.ui.inp["dch:" + r.o.id]; delete M.ui.inp["dto:" + r.o.id]; }
  const o = r.o, ch = docCh(o), chs = docChs();
  return `<section class="card stack doc-send doc-actions" aria-labelledby="doc-h-${o.id}"><div class="card-h"><h2 id="doc-h-${o.id}">${esc(t("doc_h"))}</h2>
      <button type="button" class="ghost sm" data-act="adprint">${IC.print}<span>${esc(t("doc_print"))}</span></button></div>
    ${can("orders.edit") && !chs.length ? `<p class="muted small">${esc(t("sys_ch_all_off"))}</p>` : ""}
    ${can("orders.edit") && chs.length ? `<div class="send-row">
      <select class="minisel" data-inp="dch:${o.id}" aria-label="${esc(t("doc_channel"))}">${chs.map(c => `<option value="${c}" ${ch === c ? "selected" : ""}>${esc(t("doc_ch_" + c))}</option>`).join("")}</select>
      ${inpField("dto:" + o.id, { value:docTo(r, ch), label:t("doc_to"), extra:'maxlength="80" autocomplete="off"' })}
      <button type="button" class="solid sm" data-act="adsend" data-src="${r.src}" data-v="${o.id}">${esc(t("doc_send"))}</button></div>
      <div class="err" id="dserr-${o.id}" hidden></div>
      <p class="muted small">${esc(t("doc_send_demo"))}</p>` : ""}
    ${o.sent?.length ? `<ul class="sent-list">${o.sent.map(x => `<li>${IC.ok}<span>${esc(t("doc_ch_" + x.ch))} · ${esc(x.to)} · ${esc(x.by)} · ${esc(fdt(x.at))}</span></li>`).join("")}</ul>` : ""}</section>`;
}
function sendDoc(r){
  if (denied("orders.edit")) return;
  const o = r.o, ch = docCh(o), to = String(inp("dto:" + o.id, docTo(r, ch))).trim();
  // Выбранный канал выключили в «Системе», пока заказ был открыт: адрес был для него — сбрасываем оба.
  const picked = inp("dch:" + o.id);
  if (!ch || (picked && !docChs().includes(picked))) { if (M.ui.inp) { delete M.ui.inp["dch:" + o.id]; delete M.ui.inp["dto:" + o.id]; } rerender(); return toast(t("sys_ch_off")); }
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
  if (d?.id !== o.id) return can("orders.edit") && editableOrder(o) ? `<button type="button" class="link" data-act="aocedit" data-src="${r.src}" data-v="${o.id}">${esc(t("oc_edit"))}</button>` : "";
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
/* ---- путешественники: имя и паспорт в билете или ваучере ----
   Имена — латиницей, как в паспорте (как при оформлении на сайте); у заявки на
   чартер — имя заказчика как ввели. Номер паспорта в журнал — только хвост. */
const editableOrder = o => !["CANCELLED", "REFUNDED"].includes(o.status) && effStatus(o) !== "COMPLETED";
const PAX_LATIN = /^[A-Z][A-Z' -]{0,40}$/, PAX_PP = /^[A-Z0-9]{5,9}$/;
const ppTail = v => v ? "•••" + String(v).slice(-3) : "";
function paxEdit(r){
  const o = r.o, d = M.ui.otEdit?.id === o.id ? M.ui.otEdit : null, on = can("orders.edit") && editableOrder(o);
  const name = x => `${x.given || ""} ${x.surname || ""}`.trim();
  if (!d) return `<div class="card-h"><span class="lbl">${esc(t("passengers"))}</span>${on ? `<button type="button" class="link" data-act="aotedit" data-src="${esc(r.src)}" data-v="${esc(o.id)}">${esc(t("edit"))}</button>` : ""}</div>
    <ul class="pax-list">${o.travellers.map(x => `<li><b>${esc(name(x))}</b>${x.passport ? `<span class="mono small muted">${esc(x.passport)}</span>` : ""}</li>`).join("")}</ul>`;
  const f = (i, k, label, extra = "") => `<label class="field"><span>${esc(t(label))}</span><input data-ot="${i}.${k}" value="${esc(d.list[i][k])}" ${extra}></label>`;
  const up = 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"';
  return `<div class="stack ot-form" id="otform"><span class="lbl">${esc(t("passengers"))}</span>
    ${d.list.map((x, i) => `<fieldset class="ot-pax"><legend class="small muted">${esc(t("passenger"))} ${i + 1}</legend>
      ${d.free ? f(i, "given", "staff_name", 'maxlength="60" autocomplete="off"') : `${f(i, "surname", "surname", up)}${f(i, "given", "given_name", up)}${x.pp ? f(i, "passport", "passport_no", up.replace('class="upper"', 'class="upper mono"') + ' maxlength="9"') : ""}`}</fieldset>`).join("")}
    <div class="err" id="oterr" hidden></div>
    <div class="row"><button type="button" class="solid sm" data-act="aotsave" data-src="${esc(r.src)}" data-v="${esc(o.id)}">${esc(t("st_save"))}</button><button type="button" class="link" data-act="aotclose">${esc(t("cancel"))}</button></div></div>`;
}
function savePax(r){
  if (denied("orders.edit")) return;
  const d = M.ui.otEdit; if (!d || d.id !== r.o.id) return;
  if (!editableOrder(r.o)) { M.ui.otEdit = null; rerender(); return toast(t("err_order_locked")); }
  const list = d.list.map(x => ({ surname:x.surname.trim().toUpperCase(), given:d.free ? x.given.trim().replace(/\s+/g, " ") : x.given.trim().toUpperCase(), passport:x.passport.trim().toUpperCase(), pp:x.pp }));
  let bad = null;
  list.forEach((x, i) => { if (bad) return;
    if (d.free) { if (x.given.length < 2 || x.given.length > 60) bad = [`${i}.given`, "err_your_name"]; return; }
    if (!PAX_LATIN.test(x.surname)) bad = [`${i}.surname`, "err_name"]; else if (!PAX_LATIN.test(x.given)) bad = [`${i}.given`, "err_name"];
    else if (x.pp && !PAX_PP.test(x.passport)) bad = [`${i}.passport`, "err_passport"]; });
  $$("#otform [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (bad) { const fld = $(`[data-ot="${bad[0]}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "oterr"); showErr("#oterr", t(bad[1])); fld?.focus(); return; }
  let saved = false;
  change(() => mutOrder(r, o => {
    if (!editableOrder(o) || o.travellers.length !== list.length) return;
    const diff = [];
    list.forEach((x, i) => { const y = o.travellers[i], was = `${y.given || ""} ${y.surname || ""}`.trim(), now = `${x.given} ${d.free ? y.surname || "" : x.surname}`.trim();
      if (was !== now) diff.push({ k:"passenger", sub:String(i + 1), from:was, to:now });
      if (x.pp && (y.passport || "") !== x.passport) diff.push({ k:"passport_no", sub:String(i + 1), from:ppTail(y.passport), to:ppTail(x.passport) }); });
    if (!diff.length) return;
    o.travellers = o.travellers.map((y, i) => ({ ...y, given:list[i].given, ...(d.free ? {} : { surname:list[i].surname }), ...(list[i].pp ? { passport:list[i].passport } : {}) }));
    audit("order_pax", { no:o.no }, { module:"orders", diff }); saved = true;
  }));
  M.ui.otEdit = null; rerender(); toast(t(saved ? "t_pax_saved" : "role_same"));
  $(`[data-act="aotedit"][data-v="${CSS.escape(r.o.id)}"]`)?.focus();
}
Object.assign(ACT, {
  adprint: () => window.print(),
  aotedit: el => { const r = rowOf(el); if (!r || denied("orders.edit")) return; if (!editableOrder(r.o)) return toast(t("err_order_locked"));
    M.ui.otEdit = { id:r.o.id, free:isCharter(r.o), list:r.o.travellers.map(x => ({ surname:x.surname || "", given:x.given || "", passport:x.passport || "", pp:!!x.passport })) };
    rerender(); $("#otform input")?.focus(); },
  aotclose:() => { M.ui.otEdit = null; rerender(); },
  aotsave: el => { const r = rowOf(el); if (r) savePax(r); },
  adsend:  el => { const r = rowOf(el); if (r) sendDoc(r); },
  aocedit: el => { const r = rowOf(el); if (!r || denied("orders.edit")) return; M.ui.ocEdit = { id:r.o.id, phone:r.o.contact?.phone || "", email:r.o.contact?.email || "" }; rerender(); $('[data-oc="phone"]')?.focus(); },
  aocclose:() => { M.ui.ocEdit = null; rerender(); },
  aocsave: el => { const r = rowOf(el); if (r) saveContact(r); }
});
document.addEventListener("input", e => { const k = e.target.dataset?.oc; if (k && M.ui.ocEdit) M.ui.ocEdit[k] = e.target.value;
  const p = e.target.dataset?.ot; if (p && M.ui.otEdit) { const [i, f] = p.split("."); if (M.ui.otEdit.list[i]) M.ui.otEdit.list[i][f] = e.target.value; } });
/* Канал выбран — адрес по умолчанию меняется на почту или телефон. */
document.addEventListener("change", e => { const k = e.target.dataset?.inp; if (k?.startsWith("dch:") && M.ui.inp) { delete M.ui.inp["dto:" + k.slice(4)]; rerender(); $(`[data-inp="${CSS.escape(k)}"]`)?.focus(); } });
