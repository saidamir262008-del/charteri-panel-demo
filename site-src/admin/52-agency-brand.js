/* ==========================================================================
   Бренд агентства из админки: логотип, название, контакты, соцсети и цвет.
   Билеты и ваучеры агентства собираются с этим брендом (orderDocument),
   поэтому правка сразу видна в документах — и в кабинете, и здесь.
   ========================================================================== */
"use strict";

const AB_FIELDS = [["name", "brand_name"], ["phone", "phone_label"], ["email", "agency_email"], ["address", "brand_address"],
  ["telegram", "ab_telegram"], ["instagram", "ab_instagram"], ["website", "ab_website"]];
const AB_LOGO_MAX = 2 * 1024 * 1024, AB_LOGO_SIDE = 256, AB_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const abPreview = d => `<div class="bdoc ab-prev">${brandTop(t("doc_TOUR"), d)}${brandFoot(d)}</div>`;
function brandCard(a){
  const d = M.ui.abr?.id === a.id ? M.ui.abr : null, b = a.brand || {};
  if (!d) return `<div class="card stack"><div class="card-h"><span class="lbl">${esc(t("ab_h"))}</span>
      <button type="button" class="link" data-act="abedit" data-v="${a.id}" ${guard("b2b.edit")}>${esc(t("edit"))}</button></div>
    ${abPreview({ ...b, name:b.name || a.name })}<p class="muted small">${esc(t("ab_d"))}</p></div>`;
  const f = ([k, label]) => `<label class="field"><span>${esc(t(label))}</span><input data-abr="${k}" value="${esc(d[k] || "")}" maxlength="${k === "address" ? 120 : 60}" autocomplete="off"></label>`;
  return `<div class="card stack ab-form" id="abform"><div class="card-h"><h3>${esc(t("ab_h"))}</h3>
      <button type="button" class="iconbtn" data-act="abclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div id="abprev">${abPreview(d)}</div>
    <div class="row" style="${brandStyle(d)}">${brandMark("logo-prev", d)}
      <label class="ghost sm filebtn">${IC.plus}<span>${esc(t(d.logo ? "logo_replace" : "logo_upload"))}</span><input id="ablogo" type="file" accept="${AB_LOGO_TYPES.join(",")}"></label>
      ${d.logo ? `<button type="button" class="link danger" data-act="ablogox">${esc(t("logo_remove"))}</button>` : ""}</div>
    ${AB_FIELDS.map(f).join("")}
    <label class="field"><span>${esc(t("ab_color"))}</span><input type="color" data-abr="color" value="${esc(brandColor(d))}"></label>
    <div class="err" id="aberr" hidden></div>
    <div class="row"><button type="button" class="solid sm" data-act="absave" data-v="${a.id}">${esc(t("st_save"))}</button><button type="button" class="link" data-act="abclose">${esc(t("cancel"))}</button></div></div>`;
}
/* Ошибка и поле. Контакты необязательны, но если есть — в правильном виде. */
function abError(d){
  if ((d.name || "").trim().length < 2) return ["err_ab_name", "name"];
  if (d.phone && !validPhone(d.phone)) return ["err_phone", "phone"];
  if (d.email && !validEmail(d.email.trim())) return ["err_email", "email"];
  for (const k of ["telegram", "instagram"]) if (d[k] && !/^@?[A-Za-z0-9_.]{3,32}$/.test(d[k].trim())) return ["err_ab_social", k];
  if (d.website && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(d.website.trim())) return ["err_ab_site", "website"];
  if (!/^#[0-9a-f]{6}$/i.test(d.color || "#16275C")) return ["err_ab_name", "color"];
  return null;
}
function saveAgencyBrand(id){
  if (denied("b2b.edit")) return;
  const d = M.ui.abr; if (!d || d.id !== id) return;
  const err = abError(d);
  $$("#abform [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (err) { const fld = $(`#abform [data-abr="${err[1]}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "aberr"); showErr("#aberr", t(err[0])); fld?.focus(); return; }
  const rec = Object.fromEntries(AB_FIELDS.map(([k]) => [k, (d[k] || "").trim()])); rec.color = d.color || "#16275C"; rec.logo = d.logo || null;
  if (rec.phone) rec.phone = prettyPhone(rec.phone);
  change(() => withAgency(id, st => {
    const b = st.brand || {}, diff = [...AB_FIELDS.filter(([k]) => (b[k] || "") !== rec[k]).map(([k, label]) => ({ k:label, from:b[k] || "", to:rec[k] })),
      ...(b.color !== rec.color ? [{ k:"ab_color", from:b.color || "", to:rec.color }] : []), ...((b.logo || null) !== rec.logo ? [{ k:"ab_logo_h", from:strRef(b.logo ? "ab_logo_yes" : "ab_logo_no"), to:strRef(rec.logo ? "ab_logo_new" : "ab_logo_no") }] : [])];
    if (!diff.length) return;
    st.brand = { ...b, ...rec }; audit("ag_brand", { agency:st.agency.name }, { module:"b2b", diff });
  }));
  M.ui.abr = null; rerender(); toast(t("t_ab_saved"));
}
/* Логотип — уменьшаем до 256 px и храним как PNG в данных агентства. */
async function readLogo(file){
  if (!AB_LOGO_TYPES.includes(file.type)) return showErr("#aberr", t("err_logo_type"));
  if (file.size > AB_LOGO_MAX) return showErr("#aberr", t("err_logo_size"));
  try {
    const img = await createImageBitmap(file), k = Math.min(1, AB_LOGO_SIDE / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width:Math.round(img.width * k), height:Math.round(img.height * k) });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    if (!M.ui.abr) return;
    M.ui.abr.logo = c.toDataURL("image/png"); rerender(); $("#ablogo")?.focus();
  } catch(e) { showErr("#aberr", t("err_logo_type")); }
}
Object.assign(ACT, {
  abedit:  el => { const a = agencyById(el.dataset.v); if (!a || denied("b2b.edit")) return; M.ui.abr = { id:a.id, ...(a.brand || {}), name:a.brand?.name || a.name }; rerender(); $('#abform [data-abr="name"]')?.focus(); },
  abclose: () => { M.ui.abr = null; rerender(); },
  absave:  el => saveAgencyBrand(el.dataset.v),
  ablogox: () => { if (M.ui.abr) { M.ui.abr.logo = null; rerender(); $("#ablogo")?.focus(); } }
});
document.addEventListener("input", e => {
  const k = e.target.dataset?.abr; if (!k || !M.ui.abr) return;
  M.ui.abr[k] = e.target.value;
  const p = $("#abprev"); if (p) p.innerHTML = abPreview(M.ui.abr);
});
document.addEventListener("change", e => { if (e.target.id === "ablogo" && e.target.files?.[0]) readLogo(e.target.files[0]); });
