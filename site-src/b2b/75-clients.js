/* ==========================================================================
   Клиенты агентства: паспортные данные для оформления в один клик,
   история заказов клиента и бронь «для клиента».
   ========================================================================== */
"use strict";

const CLIENT_FIELDS = ["surname", "given", "passport", "cit", "gender", "dob", "expiry", "phone", "email"];
const blankClient = () => ({ id:null, surname:"", given:"", passport:"", cit:"UZB", gender:"", dob:"", expiry:"", phone:"", email:"" });
const clientName = c => `${c.given} ${c.surname}`.trim();
const clientOrders = c => S.orders.filter(o => o.clientId === c.id);
const maskPassport = p => p ? `${p.slice(0, 2)}•••${p.slice(-3)}` : "";

function clientEditor(){
  const d = M.ui.clDraft; if (!d) return "";
  const f = (k, label, extra = "") => `<label class="field"><span>${esc(label)}</span><input data-cl="${k}" value="${esc(d[k])}" ${extra}></label>`;
  return `<section class="card stack cl-edit" id="cledit"><div class="card-h"><h2>${esc(t(d.id ? "client_edit" : "client_new"))}</h2>
      <button type="button" class="iconbtn" data-act="clclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      ${f("surname", t("surname"), 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      ${f("given", t("given_name"), 'class="upper" autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      ${f("passport", t("passport_no"), 'class="upper mono" autocomplete="off" autocapitalize="characters" spellcheck="false"')}
      <label class="field"><span>${esc(t("citizenship"))}</span><select data-cl="cit">${CITS.map(c => `<option ${d.cit === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <div class="field"><span>${esc(t("gender"))}</span>${seg("clgender", [["M", t("gender_m")], ["F", t("gender_f")]], d.gender)}</div>
      ${f("dob", t("dob"), `type="date" max="${TODAY}"`)}
      ${f("expiry", t("expiry"), `type="date" min="${TODAY}"`)}
      ${f("phone", t("phone_label"), 'type="tel" autocomplete="off" placeholder="+998"')}
      ${f("email", t("email_opt"), 'type="email" autocomplete="off"')}
    </div>
    <div class="err" id="clerr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="clsave">${esc(t("client_save"))}</button>
      <button type="button" class="link" data-act="clclose">${esc(t("cancel"))}</button>
      ${d.id ? `<button type="button" class="link danger push" data-act="cldel" data-v="${d.id}">${esc(t("client_delete"))}</button>` : ""}</div></section>`;
}
function clientRow(c, i){
  const os = clientOrders(c), spent = os.filter(o => o.paidAt).reduce((s, o) => s + dueOf(o).uzs, 0);
  return `<div class="crow" style="--i:${i}">
    <a class="crow-main" href="#/clients/${c.id}"><span class="avatar sm">${esc(monogram(clientName(c)))}</span>
      <span class="stack" style="gap:1px;min-width:0"><b>${esc(clientName(c))}</b><span class="muted small"><span class="mono">${esc(maskPassport(c.passport))}</span> · ${esc(c.cit)}</span></span></a>
    <span class="c-phone mono small">${esc(c.phone || "—")}</span>
    <span class="c-stat small"><b>${esc(pl(os.length, "order"))}</b><span class="muted mono">${spent ? fmtUZS(spent) : ""}</span></span>
    <span class="c-act"><button type="button" class="ghost sm" data-act="clbook" data-v="${c.id}">${esc(t("book_for"))}</button>
      <button type="button" class="link" data-act="cledit" data-v="${c.id}">${esc(t("edit"))}</button></span></div>`;
}
PAGES.clients = {
  render(){
    const q = (M.ui.clq || "").trim().toLowerCase();
    const list = S.travellers.filter(c => !q || [clientName(c), c.passport, c.phone].join(" ").toLowerCase().includes(q));
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("nav_clients"))}</h1><p class="muted">${esc(t("clients_sub"))}</p></div>
        <button type="button" class="solid" data-act="clnew">${IC.plus}<span>${esc(t("client_new"))}</span></button></div>
      ${M.ui.clDraft && !M.ui.clDraft.id ? clientEditor() : ""}
      <div class="card stack">
        <label class="search wide">${IC.search}<input id="clq" type="search" value="${esc(M.ui.clq || "")}" placeholder="${esc(t("clients_search"))}" aria-label="${esc(t("clients_search"))}"></label>
        <div id="cllist" class="clist">${clientsList(list)}</div></div></div>`;
  },
  after(){ if (M.ui.clDraft) $("#cledit")?.scrollIntoView({ block:"nearest" }); }
};
function clientsList(list){
  if (!list.length) return `<div class="empty"><h3>${esc(t(S.travellers.length ? "clients_none_match" : "clients_empty"))}</h3></div>`;
  return list.map((c, i) => M.ui.clDraft?.id === c.id ? clientEditor() : clientRow(c, i)).join("");
}

PAGES["clients/:id"] = {
  render({ id }){
    const c = S.travellers.find(x => x.id === id);
    if (!c) return `<div class="page">${backLink("clients", t("nav_clients"))}<div class="card empty"><h3>${esc(t("client_missing"))}</h3></div></div>`;
    const os = clientOrders(c), rc = listEnter("client:" + id);
    const row = (k, v, mono = false) => v ? `<div><span class="k">${esc(t(k))}</span><span class="v ${mono ? "mono" : ""}">${esc(v)}</span></div>` : "";
    return `<div class="page">${backLink("clients", t("nav_clients"))}
      <div class="ohead"><span class="avatar">${esc(monogram(clientName(c)))}</span><div><span class="lbl">${esc(t("client_card"))}</span><h1>${esc(clientName(c))}</h1>
        <p class="muted">${esc(pl(os.length, "order"))}</p></div>
        <button type="button" class="solid" data-act="clbook" data-v="${c.id}">${IC.plus}<span>${esc(t("book_for"))}</span></button></div>
      <div class="twocol"><section class="card stack"><div class="card-h"><h2>${esc(t("client_orders"))}</h2></div>
          ${os.length ? `<div class="otable">${os.map((o, i) => orderRow(o, i, rc)).join("")}</div>` : `<p class="muted">${esc(t("client_no_orders"))}</p>`}</section>
        <aside class="stack sticky">${M.ui.clDraft?.id === c.id ? clientEditor() : `<div class="card stack"><span class="lbl">${esc(t("passport_data"))}</span>
          <div class="rows">${row("passport_no", c.passport, true)}${row("citizenship", c.cit)}${row("gender", c.gender ? t(c.gender === "M" ? "gender_m" : "gender_f") : "")}
            ${row("dob", c.dob ? fdateY(c.dob) : "")}${row("expiry", c.expiry ? fdateY(c.expiry) : "")}${row("phone_label", c.phone, true)}${row("email_opt", c.email)}</div>
          <button type="button" class="ghost sm" data-act="cledit" data-v="${c.id}">${esc(t("edit"))}</button></div>`}</aside></div></div>`;
  }
};

function validClient(d){
  const latin = s => /^[A-Z][A-Z' -]{0,40}$/.test(s);
  if (!latin(d.surname) || !latin(d.given)) return "err_name";
  if (!/^[A-Z0-9]{5,9}$/.test(d.passport)) return "err_passport";
  if (S.travellers.some(c => c.passport === d.passport && c.id !== d.id)) return "err_client_dup";
  if (d.dob && d.dob >= TODAY) return "err_dob";
  if (d.phone && !validPhone(d.phone)) return "err_phone";
  if (!validEmail(d.email)) return "err_email";
  return null;
}
Object.assign(ACT, {
  clnew:  () => { M.ui.clDraft = blankClient(); rerender(); },
  cledit: el => { const c = S.travellers.find(x => x.id === el.dataset.v); if (c) { M.ui.clDraft = { ...blankClient(), ...c }; rerender(); } },
  clclose: () => { M.ui.clDraft = null; rerender(); },
  clgender: el => { M.ui.clDraft.gender = el.dataset.v; rerender(); },
  clsave: () => {
    const d = M.ui.clDraft, e = validClient(d);
    if (e) return showErr("#clerr", t(e));
    const rec = Object.fromEntries(CLIENT_FIELDS.map(k => [k, d[k]]));
    rec.phone = d.phone ? prettyPhone(d.phone) : "";
    if (d.id) S.travellers = S.travellers.map(c => c.id === d.id ? { ...c, ...rec } : c);
    else S.travellers = [{ id:uid("cl"), ...rec }, ...S.travellers];
    M.ui.clDraft = null; save(); rerender(); toast(t("client_saved"));
  },
  cldel: el => {
    if (!confirm(t("client_delete_q"))) return;
    S.travellers = S.travellers.filter(c => c.id !== el.dataset.v);
    M.ui.clDraft = null; save(); toast(t("client_deleted"));
    if (currentParts()[0] === "clients" && currentParts()[1]) go("clients"); else rerender();
  },
  /* Бронь для клиента: форма поиска, а в оформлении он уже вписан первым. */
  clbook: el => {
    const c = S.travellers.find(x => x.id === el.dataset.v); if (!c) return;
    M.ui.forClient = c.id;
    for (const q of [M.jet, M.heli]) Object.assign(q, { name:clientName(c), phone:c.phone || "" });
    go("book");
  }
});
/* Поле → черновик клиента. И на input, и на change: change приходит при уходе
   из поля и не должен вернуть паспорт с пробелами и строчными буквами. */
function setDraft(el){
  const k = el.dataset?.cl; if (!k || !M.ui.clDraft) return;
  let v = el.value;
  if (["surname", "given", "passport"].includes(k)) { v = v.toUpperCase(); if (k === "passport") v = v.replace(/\s/g, ""); }
  M.ui.clDraft[k] = v;
}
document.addEventListener("change", e => setDraft(e.target));
document.addEventListener("input", e => {
  setDraft(e.target);
  if (e.target.id === "clq") {
    M.ui.clq = e.target.value; const q = M.ui.clq.trim().toLowerCase();
    $("#cllist").innerHTML = clientsList(S.travellers.filter(c => !q || [clientName(c), c.passport, c.phone].join(" ").toLowerCase().includes(q)));
  }
});
