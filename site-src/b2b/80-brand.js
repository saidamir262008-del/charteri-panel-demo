/* ==========================================================================
   Брендирование: название, контакты, цвет и логотип агентства на билетах
   и ваучерах. Образец справа — настоящий документ из заказов агентства,
   он меняется на каждое нажатие клавиши.
   ========================================================================== */
"use strict";

const BRAND_COLORS = ["#16275C", "#0F5E54", "#7A1F3D", "#8A4B0F", "#2F3A4A", "#2F6FE0"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024, LOGO_SIDE = 256;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/* Образец — последний заказ с ваучером; нет такого — талон на рейс. */
function brandSample(){
  const ok = o => ["CONFIRMED", "PAID"].includes(o.status);
  return S.orders.find(o => ok(o) && o.type !== "FLIGHT") || S.orders.find(ok) || null;
}
const brandPreview = () => { const o = brandSample(); return o ? orderDocument(o) : `<p class="muted">${esc(t("brand_no_sample"))}</p>`; };

PAGES.brand = {
  render(){
    const b = S.brand, f = (k, label, extra = "") => `<label class="field"><span>${esc(label)}</span><input data-br="${k}" value="${esc(b[k] || "")}" ${extra}></label>`;
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("nav_brand"))}</h1><p class="muted">${esc(t("brand_sub"))}</p></div>
      <div class="brandgrid"><div class="stack">
        <section class="card stack"><h2>${esc(t("brand_logo"))}</h2>
          <div class="logo-row" style="${brandStyle()}">${brandMark("logo-prev")}
            <div class="stack" style="gap:8px"><label class="ghost sm filebtn">${IC.upload}<span>${esc(t(b.logo ? "logo_replace" : "logo_upload"))}</span>
              <input id="blogo" type="file" accept="${LOGO_TYPES.join(",")}"></label>
              ${b.logo ? `<button type="button" class="link danger" data-act="blogox">${esc(t("logo_remove"))}</button>` : ""}
              <span class="muted small">${esc(t("logo_hint"))}</span></div></div>
          <div class="err" id="berr" hidden></div></section>
        <section class="card stack"><h2>${esc(t("brand_details"))}</h2>
          ${f("name", t("brand_name"), 'maxlength="40" autocomplete="organization"')}
          <div class="sgrid sgrid-2">${f("phone", t("phone_label"), 'type="tel"')}${f("email", "Email", 'type="email"')}</div>
          <div class="sgrid sgrid-2">${f("telegram", "Telegram", 'placeholder="@agency"')}${f("instagram", "Instagram", 'placeholder="@agency"')}</div>
          <div class="sgrid sgrid-2">${f("website", t("brand_website"), 'placeholder="agency.uz"')}${f("address", t("brand_address"))}</div></section>
        <section class="card stack"><h2>${esc(t("brand_color"))}</h2>
          <div class="swatches" role="group" aria-label="${esc(t("brand_color"))}">${BRAND_COLORS.map(c =>
            `<button type="button" class="swatch" style="--c:${c}" data-act="bcolor" data-v="${c}" aria-pressed="${(b.color || "").toLowerCase() === c.toLowerCase()}" aria-label="${c}"></button>`).join("")}
            <label class="swatch custom" style="--c:${esc(b.color || "#16275C")}" aria-label="${esc(t("brand_color_own"))}"><input type="color" data-br="color" value="${esc(b.color || "#16275C")}"></label></div>
          <p class="muted small">${esc(t("brand_color_d"))}</p></section>
      </div>
      <aside class="brand-prev sticky"><span class="lbl">${esc(t("brand_preview"))}</span><div id="bpreview">${brandPreview()}</div></aside></div></div>`;
  },
  after(){ renderQRs(); }
};

/* Меняется образец и знак агентства в меню — страница целиком не перерисовывается,
   поэтому поле не теряет фокус. */
function brandRefresh(){
  const p = $("#bpreview"); if (p) { p.innerHTML = brandPreview(); renderQRs(); }
  renderNav(matchRoute(currentParts()).key); slideIndicators(false);
}
document.addEventListener("input", e => {
  const k = e.target.dataset?.br; if (!k) return;
  S.brand[k] = k === "name" ? e.target.value.slice(0, 40) : e.target.value;
  if (k === "color") e.target.parentElement.style.setProperty("--c", e.target.value);
  save(); brandRefresh();
});
document.addEventListener("change", e => {
  if (e.target.dataset?.br === "color") rerender();
  if (e.target.id === "blogo") readLogo(e.target.files?.[0]);
});
/* Логотип уменьшается до 256 px и хранится как PNG: SVG не принимаем — в нём может быть скрипт. */
function readLogo(file){
  hideErr("#berr");
  if (!file) return;
  if (!LOGO_TYPES.includes(file.type)) return showErr("#berr", t("err_logo_type"));
  if (file.size > LOGO_MAX_BYTES) return showErr("#berr", t("err_logo_size"));
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const k = Math.min(1, LOGO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = Object.assign(document.createElement("canvas"), { width:Math.max(1, Math.round(img.naturalWidth * k)), height:Math.max(1, Math.round(img.naturalHeight * k)) });
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    S.brand.logo = cv.toDataURL("image/png"); save(); rerender(); toast(t("logo_saved"));
  };
  img.onerror = () => { URL.revokeObjectURL(url); showErr("#berr", t("err_logo_read")); };
  img.src = url;
}
Object.assign(ACT, {
  bcolor: el => { S.brand.color = el.dataset.v; save(); rerender(); },
  blogox: () => { S.brand.logo = null; save(); rerender(); }
});
