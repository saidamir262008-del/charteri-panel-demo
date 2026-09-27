/* ==========================================================================
   Тексты и настройки сайта. Тексты: любая строка сайта (SITE_KEYS — список
   собирает build.py) заменяется на трёх языках; пустая замена — снова текст
   по умолчанию. Во вкладке «Тексты сайта» строка — текст и ключ, редактор
   открывается у одной строки по нажатию; на главной (заголовки героя)
   редакторы открыты сразу. Настройки: название и описание для поисковиков, логотип,
   значок вкладки (SEO и бренд), телефон, почта, адрес и соцсети (подвал).
   ========================================================================== */
"use strict";

/* Без поиска — первые ACMS_TX_SHOW строк, с поиском — до ACMS_TX_FIND. */
const ACMS_TX_SHOW = 12, ACMS_TX_FIND = 40;
/* Подстановки в тексте по умолчанию: {p}, {n} — их заполняет сайт. */
const acmsPh = key => [...new Set((SITE_STR[key] || []).join(" ").match(/\{\w+\}/g) || [])];

/* ---- строка текста ---- */
/* Черновик строки — только начатые языки: M.ui.cmsTx[key] = { v:{ язык:текст },
   base:{ язык:замена в хранилище в момент первой правки } }. Сохраняются только
   они — замену на другом языке из соседней вкладки не затираем. */
const acmsTxVal = (key, l) => { const dr = M.ui.cmsTx?.[key]; return dr && l in dr.v ? dr.v[l] : cmsTexts()[key]?.[l] || ""; };
/* Текст строки на языке админки: замена, иначе текст сайта по умолчанию. */
const acmsTxNow = key => { const def = SITE_STR[key] || [""], i = LIDX[S.lang] ?? 0; return cmsTexts()[key]?.[S.lang] || def[i] || def[0] || ""; };
const acmsTxChanged = key => CMS_LANGS.some(l => cmsTexts()[key]?.[l]);
const acmsTxPill = key => acmsTxChanged(key) ? `<span class="pill st-PAID">${esc(t("cms_tx_changed"))}</span>` : "";
const acmsTxReset = key => acmsTxChanged(key) ? `<button type="button" class="link" data-act="acmstxclear" data-v="${key}" aria-label="${esc(t("cms_tx_reset"))}: ${esc(acmsTxNow(key))}" ${guard("content.edit")}>${esc(t("cms_tx_reset"))}</button>` : "";
/* Свёрнутая строка списка: сам текст крупно, ключ — мелко рядом. */
function acmsTextLine(key){
  if (M.ui.cmsTxOpen === key) return acmsTextRow(key, true);
  return `<div class="cms-tx cms-txl" id="tx-${key}"><button type="button" class="cms-txl-b" data-act="acmstxopen" data-v="${key}" aria-expanded="false">
      <span class="cms-txl-t">${esc(acmsTxNow(key))}</span><code>${esc(key)}</code></button>
    <span class="cms-txl-e">${acmsTxPill(key)}${acmsTxReset(key)}</span></div>`;
}
/* Редактор строки на трёх языках; inList — открыт из списка, можно свернуть.
   Три поля — группа с названием (ключ и текст), текст по умолчанию — под
   полем, вне подписи: диктор читает его один раз, как описание. */
function acmsTextRow(key, inList = false){
  const def = SITE_STR[key] || ["", "", ""];
  const val = l => acmsTxVal(key, l), long = def.some(s => s.length > 70), ph = acmsPh(key);
  const input = (l, i) => long
    ? `<textarea rows="3" data-cmstx="${key}.${l}" maxlength="${CMS_TEXT_MAX}" lang="${l}" aria-describedby="txd-${key}-${l}">${esc(val(l))}</textarea>`
    : `<input data-cmstx="${key}.${l}" value="${esc(val(l))}" maxlength="${CMS_TEXT_MAX}" lang="${l}" autocomplete="off" aria-describedby="txd-${key}-${l}">`;
  const head = inList
    ? `<div class="cms-tx-h"><button type="button" class="cms-txl-b" data-act="acmstxclose" data-v="${key}" aria-expanded="true"><span class="cms-txl-t">${esc(acmsTxNow(key))}</span><code>${esc(key)}</code></button>${acmsTxPill(key)}</div>`
    : `<div class="cms-tx-h"><code>${esc(key)}</code>${acmsTxPill(key)}</div>`;
  return `<div class="cms-tx ${inList ? "is-open" : ""}" id="tx-${key}">${head}
    <fieldset class="cms-txf"><legend class="sr-only">${esc(key)} — ${esc(acmsTxNow(key))}</legend>
    <div class="sgrid sgrid-3">${CMS_LANGS.map((l, i) => `<div class="cms-txc"><label class="field"><span>${l.toUpperCase()}</span>${input(l, i)}</label>
      <small class="cms-def muted" id="txd-${key}-${l}">${esc(t("cms_tx_def"))}: ${esc(def[i])}</small></div>`).join("")}</div></fieldset>
    ${ph.length ? `<p class="small muted">${esc(tf("cms_tx_ph", { ph:ph.join(", ") }))}</p>` : ""}
    <div class="err" id="txerr-${key}" hidden></div>
    <div class="row"><button type="button" class="solid sm" data-act="acmstxsave" data-v="${key}" aria-label="${esc(t("st_save"))}: ${esc(acmsTxNow(key))}" ${guard("content.edit")}>${esc(t("st_save"))}</button>
      ${acmsTxReset(key)}${inList ? `<button type="button" class="link" data-act="acmstxclose" data-v="${key}">${esc(t("cancel"))}</button>` : ""}</div></div>`;
}
/* Главная: заголовок и подзаголовок героя у каждого раздела поиска. */
function acmsHero(){
  const ov = cmsTexts();
  return `<section class="card stack"><div class="stack" style="gap:4px"><h2>${esc(t("cms_hero_h"))}</h2><p class="muted small">${esc(t("cms_hero_d"))}</p></div>
    ${MODULE_ORDER.map(k => `<details class="cms-hero" data-keep="cmsHero_${k}" ${M.ui["cmsHero_" + k] ? "open" : ""}><summary><span class="task-ic">${MODULES[k].icon}</span><b>${esc(t(MODULES[k].label))}</b>
      ${ov["hero_" + k] || ov[`hero_${k}_sub`] ? `<span class="pill st-PAID">${esc(t("cms_tx_changed"))}</span>` : ""}</summary>
      <div class="stack">${acmsTextRow("hero_" + k)}${acmsTextRow(`hero_${k}_sub`)}</div></details>`).join("")}</section>`;
}
function acmsTxKeys(){
  const q = (M.ui.cmsq || "").trim().toLowerCase(), ov = cmsTexts();
  return SITE_KEYS.filter(k => (!M.ui.cmsTxOnly || ov[k]) && (!q || k.toLowerCase().includes(q) || SITE_STR[k].some(s => s.toLowerCase().includes(q))
    || CMS_LANGS.some(l => (ov[k]?.[l] || "").toLowerCase().includes(q))));
}
const acmsTxMax = () => (M.ui.cmsq || "").trim() || M.ui.cmsTxOnly ? ACMS_TX_FIND : ACMS_TX_SHOW;
const acmsTxCount = keys => keys.length > acmsTxMax() ? tf("cms_tx_more", { n:acmsTxMax(), total:keys.length }) : tf("cms_tx_count", { n:keys.length });
const acmsTxList = keys => keys.length ? keys.slice(0, acmsTxMax()).map(acmsTextLine).join("") : `<p class="muted">${esc(t("cms_tx_none"))}</p>`;
function acmsTexts(){
  const keys = acmsTxKeys();
  return `<section class="card stack"><div class="stack" style="gap:4px"><h2>${esc(t("cms_tab_texts"))}</h2><p class="muted small">${esc(t("cms_tx_d"))}</p></div>
    <div class="ofind"><label class="search">${IC.search}<input id="cmsq" type="search" value="${esc(M.ui.cmsq || "")}" placeholder="${esc(t("cms_tx_search"))}" aria-label="${esc(t("cms_tx_search"))}"></label>
      <label class="chk"><input type="checkbox" id="cmsTxOnly" ${M.ui.cmsTxOnly ? "checked" : ""}><span>${esc(t("cms_tx_only"))}</span></label></div>
    <p class="muted small" id="cmstxcount" aria-live="polite">${esc(acmsTxCount(keys))}</p>
    <div id="cmstxlist" class="stack">${acmsTxList(keys)}</div></section>`;
}
const acmsTxRefresh = () => { const keys = acmsTxKeys(), l = $("#cmstxlist"), c = $("#cmstxcount"); if (l) l.innerHTML = acmsTxList(keys); if (c) c.textContent = acmsTxCount(keys); };

/* Сохранить замену: пустая на всех языках — удаляем; совпала с текстом по
   умолчанию — это не замена. Не принимаем подстановку, которой нет в тексте
   по умолчанию (сайт её не заполнит), и < > " — замена только текстом
   (13-cms.js, cmsTx). Язык, который правили и здесь, и в другой вкладке
   по-разному, — не затираем: черновик сбрасываем, просим повторить. */
function acmsTxBad(key, l, v, known){
  const stray = (v.match(/\{\w+\}/g) || []).find(p => !known.includes(p));
  return stray ? tf("err_cms_ph", { ph:stray }) : CMS_TX_BAD.test(v) ? t("err_cms_html") : v.length > CMS_TEXT_MAX ? t("err_cms_long") : "";
}
function acmsSaveText(key, clear = false){
  if (denied("content.edit")) return false;
  const def = SITE_STR[key]; if (!def) return false;
  const dr = clear ? null : M.ui.cmsTx?.[key], old = cmsFresh().texts[key] || {}, known = def.join(" ");
  const edited = clear ? CMS_LANGS : CMS_LANGS.filter(l => dr && l in dr.v);
  const norm = (v, i) => { const s = String(v || "").trim().replace(/'/g, "’"); return s === def[i].replace(/'/g, "’") ? "" : s; };
  for (const l of clear ? [] : edited) {
    const bad = acmsTxBad(key, l, String(dr.v[l] || "").trim(), known); if (!bad) continue;
    const f = $(`[data-cmstx="${key}.${l}"]`); f?.setAttribute("aria-invalid", "true"); f?.setAttribute("aria-describedby", `txerr-${key} txd-${key}-${l}`);
    acmsSay(`#txerr-${CSS.escape(key)}`, `${l.toUpperCase()}: ${bad}`); acmsFocusBad(f); return false;
  }
  const done = () => { if (M.ui.cmsTx) delete M.ui.cmsTx[key]; if (M.ui.cmsTxOpen === key) M.ui.cmsTxOpen = null; rerender(); acmsTxFocus(key); };
  const val = Object.fromEntries(CMS_LANGS.map((l, i) => [l, !edited.includes(l) ? old[l] || "" : clear ? "" : norm(dr.v[l], i)]));
  if (!clear && edited.some(l => (old[l] || "") !== dr.base[l] && (old[l] || "") !== val[l])) { done(); toast(t("err_cms_changed")); return false; }
  let same = false;
  const ok = acmsCommit("cms_text", s => {
    const was = s.texts[key] || {}, diff = [];
    CMS_LANGS.forEach((l, i) => { if ((was[l] || "") === val[l]) return;
      const [from, to] = acmsPair(was[l] || def[i], val[l] || def[i]); diff.push({ k:"cms_f_text", sub:l.toUpperCase(), from, to }); });
    if (!diff.length) { same = true; return null; }
    if (CMS_LANGS.some(l => val[l])) s.texts[key] = val; else delete s.texts[key];
    return { vars:{ key }, diff };
  });
  if (!ok) { if (same) { done(); toast(t("pr_same")); } return false; }
  done(); toast(t(clear ? "t_cms_tx_reset" : "t_cms_saved"));
  return true;
}

/* Фокус после сохранения: на кнопку строки (в списке) или «Сохранить» (на главной). */
const acmsTxFocus = key => ($(`[data-act="acmstxopen"][data-v="${key}"]`) || $(`[data-act="acmstxsave"][data-v="${key}"]`))?.focus();

/* ---- настройки сайта ----
   Раздел seo (название, описание, логотип, значок) и contacts (телефон, почта,
   адрес, соцсети) сохраняются отдельно. Черновик — только поля, которые
   правили: M.ui.cmsSite = { v:{ ключ:значение }, base:{ ключ:что было в
   хранилище при первой правке } }, ключи плоские — title.ru, logo,
   socials.telegram… Остальные поля показываем и сохраняем из хранилища:
   правка другой вкладки (логотип, название) не откатывается. */
const ACMS_SITE_PARTS = { seo:["title", "desc", "logo", "favicon"], contacts:["phone", "email", "address", "socials"] };
const ACMS_SITE_L = ["title", "desc", "address"];
function acmsSiteFlat(site){
  const o = {};
  for (const f of [...ACMS_SITE_PARTS.seo, ...ACMS_SITE_PARTS.contacts]) {
    if (f === "socials") for (const k of CMS_SOCIALS) o["socials." + k] = site.socials?.[k] || "";
    else if (ACMS_SITE_L.includes(f)) for (const l of CMS_LANGS) o[`${f}.${l}`] = site[f]?.[l] || "";
    else o[f] = f === "logo" || f === "favicon" ? site[f] || null : site[f] || "";
  }
  return o;
}
const acmsSitePart = k => ACMS_SITE_PARTS.seo.includes(k.split(".")[0]) ? "seo" : "contacts";
const acmsSiteVal = k => { const d = M.ui.cmsSite; return d && k in d.v ? d.v[k] : acmsSiteFlat(cmsSite())[k]; };
function acmsSiteSet(k, v){
  const d = M.ui.cmsSite ||= { v:{}, base:{} };
  if (!(k in d.v)) d.base[k] = acmsSiteFlat(cmsSite())[k];
  d.v[k] = v;
}
function acmsSiteDrop(part){
  const d = M.ui.cmsSite; if (!d) return;
  for (const k of Object.keys(d.v)) if (acmsSitePart(k) === part) { delete d.v[k]; delete d.base[k]; }
}
function acmsSiteLang(part, f, max, long){
  const dis = can("content.manage") ? "" : "disabled", v = l => acmsSiteVal(`${f}.${l}`);
  return `<fieldset class="cms-lf"><legend>${esc(t("cms_f_site_" + f))}</legend><div class="sgrid sgrid-3">${CMS_LANGS.map(l => `<label class="field"><span>${l.toUpperCase()}</span>${long
    ? `<textarea rows="3" data-cs="${f}.${l}" maxlength="${max}" lang="${l}" ${dis}>${esc(v(l))}</textarea>`
    : `<input data-cs="${f}.${l}" value="${esc(v(l))}" maxlength="${max}" lang="${l}" autocomplete="off" ${dis}>`}</label>`).join("")}</div></fieldset>`;
}
/* Кнопки загрузки и «Убрать» названы вместе с полем: «Логотип: Загрузить» и
   «Значок вкладки: Загрузить» в списке кнопок диктора различимы. */
function acmsSiteImg(f){
  const v = acmsSiteVal(f), manage = can("content.manage"), name = t("cms_f_" + f), act = t(v ? "cms_img_replace" : "cms_img_upload");
  return `<div class="field"><span>${esc(name)}</span><div class="row cms-img cms-img-${f}">${v ? `<img src="${v}" alt="${esc(t("cms_img_prev"))}">` : `<span class="muted small">${esc(t(f === "logo" ? "cms_logo_none" : "cms_fav_none"))}</span>`}
    ${manage ? `<label class="ghost sm filebtn">${IC.upload}<span>${esc(act)}</span><input id="cms-${f}" type="file" accept="image/png,image/jpeg,image/webp" aria-label="${esc(name)}: ${esc(act)}"></label>
      ${v ? `<button type="button" class="link danger" data-act="acmssiteimgx" data-v="${f}" aria-label="${esc(t("cms_img_remove"))}: ${esc(name)}">${esc(t("cms_img_remove"))}</button>` : ""}` : ""}</div>
    <p class="muted small">${esc(t(f === "logo" ? "cms_logo_hint" : "cms_fav_hint"))}</p></div>`;
}
const acmsSiteDirty = part => { const d = M.ui.cmsSite; if (!d) return false; const now = acmsSiteFlat(cmsSite()); return Object.keys(d.v).some(k => acmsSitePart(k) === part && d.v[k] !== now[k]); };
const acmsSiteBtns = part => `<div class="err" id="cmssiteerr-${part}" hidden></div>
  <div class="row"><button type="button" class="solid" data-act="acmssitesave" data-v="${part}" ${guard("content.manage")}>${esc(t("st_save"))}</button>
    ${acmsSiteDirty(part) ? `<button type="button" class="link" data-act="acmssitereset" data-v="${part}">${esc(t("cancel"))}</button>` : ""}</div>`;
function acmsSeo(){
  return `<section class="card stack" id="cmsseo"><div class="stack" style="gap:4px"><h2 id="cms-h-seo" tabindex="-1">${esc(t("cms_tab_seo"))}</h2><p class="muted small">${esc(t("cms_seo_d"))}</p></div>
    ${can("content.manage") ? "" : `<p class="note-live">${IC.lock}<span>${esc(t("cms_manage_only"))}</span></p>`}
    ${acmsSiteLang("seo", "title", CMS_LEN.siteTitle, false)}${acmsSiteLang("seo", "desc", CMS_LEN.siteDesc, true)}
    <div class="sgrid sgrid-2 cms-brand">${acmsSiteImg("logo")}${acmsSiteImg("favicon")}</div>
    ${acmsSiteBtns("seo")}</section>`;
}
function acmsContacts(){
  const dis = can("content.manage") ? "" : "disabled";
  const one = (f, label, attrs) => `<label class="field"><span>${esc(t(label))}</span><input data-cs="${f}" value="${esc(acmsSiteVal(f))}" ${attrs} ${dis}></label>`;
  return `<section class="card stack" id="cmscontacts"><div class="stack" style="gap:4px"><h2 id="cms-h-contacts" tabindex="-1">${esc(t("cms_contacts_h"))}</h2><p class="muted small">${esc(t("cms_contacts_d"))}</p></div>
    ${can("content.manage") ? "" : `<p class="note-live">${IC.lock}<span>${esc(t("cms_manage_only"))}</span></p>`}
    <div class="sgrid sgrid-2">${one("phone", "phone_label", 'type="tel" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+998 71 200 00 00"')}${one("email", "agency_email", 'type="email" maxlength="80" autocomplete="off" placeholder="info@charteri.uz"')}</div>
    ${acmsSiteLang("contacts", "address", CMS_LEN.address, false)}
    <fieldset class="cms-lf"><legend>${esc(t("cms_follow"))}</legend><div class="sgrid sgrid-2">${CMS_SOCIALS.map(k => one("socials." + k, "cms_soc_" + k, `inputmode="url" maxlength="200" autocomplete="off" spellcheck="false" placeholder="${k === "telegram" || k === "instagram" ? "@charteri" : "https://…"}"`)).join("")}</div>
      <p class="muted small">${esc(t("cms_soc_hint"))}</p></fieldset>
    ${acmsSiteBtns("contacts")}</section>`;
}
/* Соцсеть: @имя в Telegram и Instagram — адрес профиля; остальное — ссылка https. */
function acmsSocial(k, v){
  const s = String(v || "").trim(); if (!s) return "";
  const h = s.replace(/^@/, "");
  if (k === "telegram" && /^\w{3,32}$/.test(h)) return "https://t.me/" + h;
  if (k === "instagram" && /^[\w.]{2,30}$/.test(h) && !s.includes("/") && !/\.\w{2,}$/.test(h)) return "https://www.instagram.com/" + h + "/";
  return cmsWebHref(cmsNormHref(s)) || null;
}
/* Раздел для записи: поля черновика поверх хранилища, в виде хранилища. */
function acmsSiteBuild(part, fail){
  const V = acmsSiteVal, x = {}, tr = f => Object.fromEntries(CMS_LANGS.map(l => [l, String(V(`${f}.${l}`) || "").trim()]));
  if (part === "seo") {
    x.title = tr("title"); x.desc = tr("desc"); x.logo = cmsImg(V("logo")); x.favicon = cmsImg(V("favicon"));
    for (const l of CMS_LANGS) if (x.title[l].length < 2) return fail("err_cms_site_title", "title." + l);
    return x;
  }
  x.phone = String(V("phone") || "").trim(); x.email = String(V("email") || "").trim(); x.address = tr("address"); x.socials = {};
  if (x.phone && !cmsPhone(x.phone)) return fail("err_cms_phone", "phone");
  if (x.email && !cmsEmail(x.email)) return fail("err_email", "email");
  for (const k of CMS_SOCIALS) { const v = acmsSocial(k, V("socials." + k)); if (v === null) return fail("err_cms_social", "socials." + k); x.socials[k] = v; }
  return x;
}
function acmsSiteDiff(part, a, x){
  const diff = [];
  for (const f of ACMS_SITE_PARTS[part]) {
    const was = a[f], now = x[f];
    if (f === "logo" || f === "favicon") { if ((was || null) !== (now || null)) diff.push({ k:"cms_f_" + f, from:strRef(was ? "cms_img_yes" : "cms_img_no"), to:strRef(now ? (was ? "cms_img_new" : "cms_img_yes") : "cms_img_no") }); }
    else if (f === "socials") { for (const k of CMS_SOCIALS) if ((was[k] || "") !== now[k]) diff.push({ k:"cms_soc_" + k, from:was[k] || "", to:now[k] }); }
    else if (typeof now === "object") { for (const l of CMS_LANGS) if ((was[l] || "") !== now[l]) { const [from, to] = acmsPair(was[l], now[l]); diff.push({ k:"cms_f_site_" + f, sub:l.toUpperCase(), from, to }); } }
    else if ((was || "") !== now) diff.push({ k:f === "phone" ? "phone_label" : "agency_email", from:was || "", to:now });
  }
  return diff;
}
function acmsSaveSite(part){
  if (denied("content.manage")) return false;
  const errId = "#cmssiteerr-" + part, fail = (key, field) => {
    const f = $(`[data-cs="${field}"]`); f?.setAttribute("aria-invalid", "true"); f?.setAttribute("aria-describedby", errId.slice(1));
    acmsSay(errId, t(key)); acmsFocusBad(f); return null; };
  $$(`#cms${part} [aria-invalid]`).forEach(x => x.removeAttribute("aria-invalid"));
  const x = acmsSiteBuild(part, fail); if (!x) return false;
  // Поле правили и здесь, и в другой вкладке, и по-разному — не затираем чужое.
  const d = M.ui.cmsSite, fresh = cmsFresh().site, now = acmsSiteFlat(fresh), mine = acmsSiteFlat({ ...fresh, ...x });
  if (d && Object.keys(d.v).some(k => acmsSitePart(k) === part && now[k] !== d.base[k] && now[k] !== mine[k])) {
    acmsSiteDrop(part); rerender(); toast(t("err_cms_changed")); $(`#cms-h-${part}`)?.focus(); return false; }
  let same = false;
  const ok = acmsCommit("cms_site", s => {
    const diff = acmsSiteDiff(part, s.site, x);
    if (!diff.length) { same = true; return null; }
    Object.assign(s.site, x);
    return { vars:{ what:strRef(part === "seo" ? "cms_tab_seo" : "cms_contacts_h") }, diff };
  });
  if (!ok && !same) return false;
  // Сохранённый раздел — из хранилища; правки другого раздела остаются в черновике.
  acmsSiteDrop(part);
  rerender(); toast(t(ok ? "t_cms_saved" : "pr_same")); $(`[data-act="acmssitesave"][data-v="${part}"]`)?.focus();
  return true;
}
/* Логотип — до 480 px с прозрачностью; значок вкладки — квадрат 64 px. */
async function acmsSiteImage(f, file){
  try {
    const url = await acmsImage(file, f === "logo" ? { sides:[480, 320, 240], png:true } : { sides:[64], png:true, square:64 });
    acmsSiteSet(f, url); rerender(); $(`#cms-${f}`)?.focus();
  } catch(err) { showErr("#cmssiteerr-seo", t(typeof err === "string" ? err : "err_logo_type")); }
}

Object.assign(ACT, {
  acmstxsave:    el => acmsSaveText(el.dataset.v),
  acmstxclear:   el => acmsSaveText(el.dataset.v, true),
  acmstxopen:    el => { M.ui.cmsTxOpen = el.dataset.v; acmsTxRefresh(); $(`[data-cmstx="${el.dataset.v}.${S.lang}"]`)?.focus(); },
  acmstxclose:   el => { const k = el.dataset.v; if (M.ui.cmsTx) delete M.ui.cmsTx[k]; M.ui.cmsTxOpen = null; acmsTxRefresh(); acmsTxFocus(k); },
  acmssitesave:  el => acmsSaveSite(el.dataset.v),
  // «Отмена» — только свой раздел; фокус — на его заголовок.
  acmssitereset: el => { const part = el.dataset.v; acmsSiteDrop(part); rerender(); $(`#cms-h-${part}`)?.focus(); },
  acmssiteimgx:  el => { acmsSiteSet(el.dataset.v, null); rerender(); $(`#cms-${el.dataset.v}`)?.focus(); }
});
document.addEventListener("input", e => {
  const tx = e.target.dataset?.cmstx, cs = e.target.dataset?.cs;
  if (tx) { const [key, l] = tx.split("."), dr = (M.ui.cmsTx ||= {})[key] ||= { v:{}, base:{} };
    if (!(l in dr.v)) dr.base[l] = cmsTexts()[key]?.[l] || "";
    dr.v[l] = e.target.value; e.target.removeAttribute("aria-invalid"); }
  if (cs) { acmsSiteSet(cs, e.target.value); e.target.removeAttribute("aria-invalid"); }
  if (e.target.id === "cmsq") { M.ui.cmsq = e.target.value; acmsTxRefresh(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "cmsTxOnly") { M.ui.cmsTxOnly = e.target.checked; acmsTxRefresh(); }
  if ((e.target.id === "cms-logo" || e.target.id === "cms-favicon") && e.target.files?.[0]) acmsSiteImage(e.target.id.slice(4), e.target.files[0]);
});
