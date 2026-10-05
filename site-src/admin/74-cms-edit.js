/* ==========================================================================
   Редактор элемента сайта (баннер, страница, вопрос, новость, ссылка).
   Черновик — в M.ui.cmsEd, поля как их ввели. Черновик сохраняется с
   заполненным русским главным полем; опубликовать можно только элемент,
   заполненный на всех трёх языках. Проверяются все поля сразу: у каждого
   плохого — красная рамка, текст ошибки под ним (aria-invalid и
   aria-describedby), перечень «поле: ошибка» — над кнопками; фокус и
   прокрутка — к первому плохому полю.
   ========================================================================== */
"use strict";

/* Поля: [поле, вид, варианты]. Вид: l — строка на трёх языках, lt — текст на
   трёх языках, href — ссылка, sel — выбор, tone — цвет, icon — значок,
   img — картинка, yt — видео YouTube, slug — адрес страницы, date — дата. */
const ACMS_FIELDS = {
  banner: [["title", "l"], ["text", "lt"], ["btn", "l"], ["href", "href"], ["place", "sel", CMS_PLACES], ["tone", "tone"], ["icon", "icon"], ["image", "img"], ["video", "yt"]],
  page:   [["title", "l"], ["slug", "slug"], ["menu", "sel", CMS_MENUS], ["body", "lt"], ["seoTitle", "l"], ["seoDesc", "lt"]],
  faq:    [["q", "l"], ["a", "lt"], ["group", "l"]],
  news:   [["title", "l"], ["date", "date"], ["image", "img"], ["text", "lt"]],
  link:   [["label", "l"], ["href", "href"], ["place", "sel", CMS_LINK_PLACES], ["icon", "icon"]]
};
const ACMS_REQ = { banner:["title"], page:["title", "body"], faq:["q", "a"], news:["title", "text"], link:["label"] };
/* Длинный текст — языки друг под другом, а не в три узкие колонки. */
const ACMS_LONG = new Set(["body", "a"]);
const acmsLong = (type, f) => ACMS_LONG.has(f) || (type === "news" && f === "text");
const acmsMax = (type, f) => type === "news" && f === "text" ? CMS_LEN.news : CMS_LEN[f];
const ACMS_BODY_HINT = new Set(["body", "a", "text"]);
const ACMS_FILE_MAX = 8 * 1024 * 1024;
const acmsL = () => ({ ru:"", uz:"", en:"" });

function acmsBlank(type){
  const d = { type, id:null, status:"draft" };
  for (const [f, kind, opts] of ACMS_FIELDS[type])
    d[f] = kind === "l" || kind === "lt" ? acmsL() : kind === "sel" ? opts[0] : kind === "tone" ? "blue" : kind === "img" ? null : kind === "date" ? TODAY : "";
  if (type === "link") d.place = "footer";
  return d;
}
/* Поля элемента плоско («title.ru», «href» …): по ним черновик сверяют с тем,
   что было при открытии редактора (base), и с тем, что в хранилище сейчас. */
function acmsFlat(type, x){
  const o = {};
  for (const [f, kind] of ACMS_FIELDS[type]) {
    if (kind === "l" || kind === "lt") for (const l of CMS_LANGS) o[`${f}.${l}`] = x[f]?.[l] || "";
    else o[f] = kind === "img" ? x[f] || null : x[f] ?? "";
  }
  return o;
}
function acmsDraftOf(x){
  const d = { type:x.type, id:x.id, status:x.status, base:acmsFlat(x.type, x) };
  for (const [f] of ACMS_FIELDS[x.type]) d[f] = x[f] && typeof x[f] === "object" ? { ...x[f] } : x[f] ?? "";
  return d;
}
/* Правки черновика поверх свежего элемента: пишем только поля, которые меняли
   в редакторе, остальные — как в хранилище (их могли поменять в другой
   вкладке). Поле поменяли и там, и здесь, и по-разному — clash: чужую правку
   молча не затираем. */
function acmsMerge(d, cur, x){
  const now = acmsFlat(d.type, cur), mine = acmsFlat(d.type, x), out = {};
  for (const [f, kind] of ACMS_FIELDS[d.type]) out[f] = kind === "l" || kind === "lt" ? { ...cur[f] } : cur[f];
  let clash = false;
  for (const k of Object.keys(mine)) {
    if (mine[k] === d.base[k]) continue;
    if (now[k] !== d.base[k] && now[k] !== mine[k]) clash = true;
    const [f, l] = k.split("."); if (l) out[f][l] = mine[k]; else out[f] = mine[k];
  }
  return { x:out, clash };
}
/* Есть несохранённые правки: черновик отличается от открытого элемента (или от пустого). */
function acmsDirty(d){
  const mine = acmsFlat(d.type, acmsRead(d).x), base = d.base || acmsFlat(d.type, acmsRead(acmsBlank(d.type)).x);
  return Object.keys(mine).some(k => mine[k] !== base[k]);
}
/* Закрыть или заменить редактор: правки есть — только если человек согласен их бросить. */
const acmsMayDrop = () => !M.ui.cmsEd || !acmsDirty(M.ui.cmsEd) || confirm(t("cms_discard_q"));

/* ---- разметка ---- */
function acmsLangField(d, f, kind){
  const req = ACMS_REQ[d.type].includes(f), max = acmsMax(d.type, f), long = acmsLong(d.type, f);
  const input = l => kind === "lt"
    ? `<textarea data-ce="${f}.${l}" maxlength="${max}" rows="${long ? 7 : 3}" lang="${l}">${esc(d[f][l])}</textarea>`
    : `<input data-ce="${f}.${l}" value="${esc(d[f][l])}" maxlength="${max}" lang="${l}" autocomplete="off">`;
  return `<fieldset class="cms-lf"><legend>${esc(t("cms_f_" + f))}${req ? ` <span class="muted small">${esc(t("cms_required"))}</span>` : ""}</legend>
    <div class="${long ? "stack cms-long" : "sgrid sgrid-3"}">${CMS_LANGS.map(l => `<label class="field"><span>${l.toUpperCase()}</span>${input(l)}</label>`).join("")}</div>
    ${ACMS_BODY_HINT.has(f) && kind === "lt" && d.type !== "banner" ? `<p class="muted small">${esc(t("cms_body_hint"))}</p>` : ""}</fieldset>`;
}
function acmsField(d, f, kind, opts){
  const lab = `<span>${esc(t("cms_f_" + f))}</span>`;
  if (kind === "l" || kind === "lt") return acmsLangField(d, f, kind);
  if (kind === "href") return `<label class="field">${lab}<input data-ce="${f}" value="${esc(d[f])}" maxlength="300" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://… · #/faq · tel:+998…" aria-describedby="cms-hint-${f}"></label>
    <p class="muted small" id="cms-hint-${f}">${esc(t("cms_href_hint"))}</p>`;
  if (kind === "slug") return `<label class="field">${lab}<span class="cms-slug"><i aria-hidden="true">/p/</i><input data-ce="slug" value="${esc(d.slug)}" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="none" aria-describedby="cms-hint-slug"></span></label>
    <p class="muted small" id="cms-hint-slug">${esc(t("cms_slug_hint"))}</p>`;
  if (kind === "date") return `<label class="field cms-date">${lab}<input type="date" data-ce="date" value="${esc(d.date)}"></label>`;
  if (kind === "yt") return `<label class="field">${lab}<input data-ce="video" value="${esc(d.video)}" maxlength="120" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://youtu.be/…" aria-describedby="cms-hint-video"></label>
    <p class="muted small" id="cms-hint-video">${esc(t("cms_video_hint"))}</p>`;
  if (kind === "sel") return `<label class="field cms-sel">${lab}<select data-ce="${f}">${opts.map(v => `<option value="${v}" ${d[f] === v ? "selected" : ""}>${esc(t((f === "menu" ? "cms_menu_" : "cms_place_") + v))}</option>`).join("")}</select></label>`;
  // Цвет и значок — панели кнопок: одна остановка Tab, дальше стрелки (acmsToolbarKey).
  const tb = (v, cur) => `tabindex="${v === cur ? 0 : -1}" aria-pressed="${v === cur}"`;
  if (kind === "tone") return `<fieldset class="cms-lf"><legend>${esc(t("cms_f_tone"))}</legend><div class="cms-sws cms-tb" role="toolbar" aria-label="${esc(t("cms_f_tone"))}">${CMS_TONES.map(v =>
    `<button type="button" class="cms-sw tone-${v}" data-act="acmsset" data-f="tone" data-v="${v}" ${tb(v, d.tone)} aria-label="${esc(t("cms_f_tone"))}: ${esc(t("cms_tone_" + v))}" title="${esc(t("cms_tone_" + v))}"><span aria-hidden="true">Aa</span></button>`).join("")}</div></fieldset>`;
  if (kind === "icon") return `<fieldset class="cms-lf"><legend>${esc(t("cms_f_icon"))}</legend><div class="cms-icons cms-tb" role="toolbar" aria-label="${esc(t("cms_f_icon"))}">${["", ...CMS_ICONS].map(v =>
    `<button type="button" class="cms-icb" data-act="acmsset" data-f="icon" data-v="${v}" ${tb(v, d.icon || "")} aria-label="${esc(t("cms_f_icon"))}: ${esc(t(v ? "cms_ic_" + v : "cms_ic_none"))}" title="${esc(t(v ? "cms_ic_" + v : "cms_ic_none"))}">${v ? cmsIcon(v) : "—"}</button>`).join("")}</div></fieldset>`;
  if (kind === "img") return `<div class="field">${lab}<div class="row cms-img">${d.image ? `<img src="${d.image}" alt="${esc(t("cms_img_prev"))}">` : `<span class="muted small">${esc(t("cms_img_none"))}</span>`}
      <label class="ghost sm filebtn">${IC.upload}<span>${esc(t(d.image ? "cms_img_replace" : "cms_img_upload"))}</span><input id="cmsimg" type="file" accept="image/png,image/jpeg,image/webp" aria-label="${esc(t("cms_f_image"))}: ${esc(t(d.image ? "cms_img_replace" : "cms_img_upload"))}"></label>
      ${d.image ? `<button type="button" class="link danger" data-act="acmsimgx" aria-label="${esc(t("cms_img_remove"))}: ${esc(t("cms_f_image"))}">${esc(t("cms_img_remove"))}</button>` : ""}</div>
    <p class="muted small">${esc(t("cms_img_hint"))}</p></div>`;
  return "";
}
/* Кнопки: новый — «Опубликовать» и «Сохранить черновик»; существующий —
   «Сохранить» (статус прежний) и, если он не опубликован, «Сохранить и опубликовать». */
const acmsGuard2 = (a, b) => guard(can(a) ? b : a);
function acmsForm(d){
  // Статус — из хранилища: элемент могли опубликовать или скрыть, пока открыт редактор.
  const perm = d.id ? "content.edit" : "content.create", st = (d.id && acmsFind(cmsLoad(), d.id)?.status) || d.status;
  const btns = d.id
    ? `<button type="button" class="solid" data-act="acmssave" data-s="keep" ${guard(perm)}>${esc(t("st_save"))}</button>
       ${st !== "published" ? `<button type="button" class="ghost" data-act="acmssave" data-s="published" ${acmsGuard2(perm, "content.manage")}>${esc(t("cms_save_pub"))}</button>` : ""}`
    : `<button type="button" class="solid" data-act="acmssave" data-s="published" ${acmsGuard2(perm, "content.manage")}>${esc(t("cms_publish"))}</button>
       <button type="button" class="ghost" data-act="acmssave" data-s="draft" ${guard(perm)}>${esc(t("cms_save_draft"))}</button>`;
  return `<div class="stack cl-edit cms-form" id="cmsedit" role="group" aria-labelledby="cmsedit-h"><div class="card-h"><h3 id="cmsedit-h">${esc(t((d.id ? "cms_edit_" : "cms_new_") + d.type))}</h3>
      <button type="button" class="iconbtn" data-act="acmsclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    ${d.id ? `<p class="small muted">${esc(t("col_status"))}: ${acmsPill({ status:st })}${st === "published" ? ` · ${esc(t("cms_live_note"))}` : ""}</p>` : ""}
    ${ACMS_FIELDS[d.type].map(([f, kind, opts]) => acmsField(d, f, kind, opts)).join("")}
    <div class="err" id="cmserr" hidden></div>
    <div class="row">${btns}<button type="button" class="link" data-act="acmsclose">${esc(t("cancel"))}</button></div></div>`;
}

/* ---- проверка ---- */
const acmsSlugify = s => String(s || "").toLowerCase().replace(/[‘’'`ʻʼ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
/* Видео: ссылка YouTube любого вида или сам номер ролика. "" — нет видео, null — не разобрать. */
function acmsYtId(s){
  s = String(s || "").trim(); if (!s) return ""; if (CMS_YT_RE.test(s)) return s;
  try {
    const u = new URL(s), h = u.hostname.replace(/^(www|m)\./, "");
    const id = h === "youtu.be" ? u.pathname.slice(1) : /^youtube(-nocookie)?\.com$/.test(h) ? u.searchParams.get("v") || u.pathname.split("/")[2] || "" : "";
    return CMS_YT_RE.test(id) ? id : null;
  } catch(e) { return null; }
}
/* Черновик формы → поля элемента и ошибки разбора [{ key, field }]. */
function acmsRead(d){
  const x = {}, errs = [];
  for (const [f, kind] of ACMS_FIELDS[d.type]) {
    if (kind === "l" || kind === "lt") x[f] = Object.fromEntries(CMS_LANGS.map(l => [l, String(d[f]?.[l] || "").trim().slice(0, acmsMax(d.type, f))]));
    else if (kind === "href") { const raw = String(d[f] || "").trim(), h = cmsSafeHref(cmsNormHref(raw)); if (raw && !h) errs.push({ key:"err_cms_href", field:f }); x[f] = h; }
    else if (kind === "yt") { const id = acmsYtId(d.video); if (id === null) errs.push({ key:"err_cms_video", field:"video" }); x.video = id || ""; }
    else if (kind === "slug") x.slug = String(d.slug || "").trim().toLowerCase() || acmsSlugify(d.title?.en || d.title?.uz || d.title?.ru);
    else if (kind === "img") x.image = cmsImg(d.image);
    else x[f] = d[f];
  }
  return { x, errs };
}
/* Каждое «[текст](» должно быть ссылкой, которую сайт откроет (CMS_LINK_RE и
   cmsSafeHref): «[x](javascript:…)» или адрес с пробелом сайт показал бы разметкой. */
const ACMS_LINK_AT = new RegExp(CMS_LINK_RE.source, "y");
function acmsBadLink(s){
  for (const m of s.matchAll(/\[[^\[\]\n]{1,200}\]\(/g)) { ACMS_LINK_AT.lastIndex = m.index; const r = ACMS_LINK_AT.exec(s); if (!r || !cmsSafeHref(r[2])) return true; }
  return false;
}
/* Ошибки элемента [{ key, field }] (пусто — всё верно). strict — для публикации:
   все три языка у обязательных полей, у необязательных — все или ни одного. */
function acmsIssue(type, x, strict, id){
  const errs = [], bad = (key, field) => errs.push({ key, field });
  for (const [f, kind] of ACMS_FIELDS[type]) {
    if (kind !== "l" && kind !== "lt") continue;
    const v = x[f] || {}, req = ACMS_REQ[type].includes(f), some = CMS_LANGS.some(l => v[l]);
    if (req && !v.ru) bad("err_cms_req", `${f}.ru`);
    if (strict && (req || some)) CMS_LANGS.filter(z => !v[z] && !(z === "ru" && req)).forEach(l => bad("err_cms_lang", `${f}.${l}`));
  }
  // Ссылка [текст](адрес), которую сайт не откроет, осталась бы на сайте разметкой.
  for (const [f, kind] of ACMS_FIELDS[type]) if (kind === "lt" && ACMS_BODY_HINT.has(f) && type !== "banner")
    for (const l of CMS_LANGS) if (acmsBadLink(String(x[f]?.[l] || ""))) bad("err_cms_body_link", `${f}.${l}`);
  if (type === "banner" && strict) {
    if (CMS_LANGS.some(l => x.btn?.[l]) && !x.href) bad("err_cms_btn_href", "href");
    if (x.href && !x.btn?.ru) bad("err_cms_href_btn", "btn.ru");
  }
  // Адрес из пустого заголовка не собрать — хватит ошибки у заголовка.
  if (type === "page" && (x.slug || x.title?.ru)) {
    if (!CMS_SLUG_RE.test(x.slug || "")) bad("err_cms_slug", "slug");
    else if (cmsFresh().items.some(y => y.type === "page" && y.slug === x.slug && y.id !== id)) bad("err_cms_slug_dup", "slug");
  }
  if (type === "news" && !cmsDate(x.date)) bad("err_cms_date", "date");
  if (type === "link" && !x.href) bad("err_cms_href_req", "href");
  return errs;
}
/* Сообщение без прокрутки к нему (showErr прокрутил бы к списку, а нужно к полю). */
function acmsSay(sel, msg){ const e = $(sel); if (!e) return; e.setAttribute("role", "alert"); e.hidden = false; e.textContent = msg; }
function acmsFocusBad(f){ if (!f) return; f.focus({ preventScroll:true }); f.scrollIntoView({ block:"center" }); }
const acmsFieldName = field => { const [f, l] = field.split("."); return t("cms_f_" + f) + (l ? ` (${l.toUpperCase()})` : ""); };
const acmsErrId = field => "cmserr-" + field.replace(".", "-");
function acmsClearErr(f){
  f.removeAttribute("aria-invalid");
  const ids = (f.getAttribute("aria-describedby") || "").split(" "), own = ids.find(x => x.startsWith("cmserr-"));
  if (own) { document.getElementById(own)?.remove(); const rest = ids.filter(x => x && x !== own).join(" "); rest ? f.setAttribute("aria-describedby", rest) : f.removeAttribute("aria-describedby"); }
}
function acmsShowErr(errs){
  $$("#cmsedit [aria-invalid]").forEach(acmsClearErr);
  // Одна ошибка на поле, по порядку полей в форме.
  const pos = Object.fromEntries($$("#cmsedit [data-ce]").map((el, i) => [el.dataset.ce, i]));
  const seen = new Set(), list = errs.filter(e => !seen.has(e.field) && seen.add(e.field)).sort((a, b) => (pos[a.field] ?? 999) - (pos[b.field] ?? 999));
  for (const e of list) {
    const f = $(`#cmsedit [data-ce="${e.field}"]`); if (!f) continue;
    const id = acmsErrId(e.field), rest = (f.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    (f.closest(".cms-slug") || f).insertAdjacentHTML("afterend", `<small class="ferr" id="${id}">${esc(t(e.key))}</small>`);
    f.setAttribute("aria-invalid", "true"); f.setAttribute("aria-describedby", [id, ...rest].join(" "));
  }
  acmsSay("#cmserr", list.map(e => `${acmsFieldName(e.field)}: ${t(e.key)}`).join("\n"));
  acmsFocusBad($("#cmsedit [aria-invalid]"));
}

/* ---- журнал: что было → что стало, по языкам ----
   Длинный текст — не начало, а окно вокруг изменённого места: иначе у правки
   в конце страницы «было» и «стало» в журнале совпали бы. */
const ACMS_CUT = 120, ACMS_CTX = 40;
function acmsPair(a, b){
  a = String(a ?? ""); b = String(b ?? "");
  if (a.length <= ACMS_CUT && b.length <= ACMS_CUT) return [a, b];
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const win = s => {
    const i = Math.max(0, p - ACMS_CTX), j = Math.min(s.length, s.length - q + ACMS_CTX);
    const mid = s.slice(i, j), cut = mid.length > ACMS_CUT ? mid.slice(0, ACMS_CUT - 1) + "…" : mid;
    return (i > 0 ? "…" : "") + cut + (j < s.length && cut === mid ? "…" : "");
  };
  return [win(a), win(b)];
}
function acmsDiff(type, a, b){
  const out = [], ref = (k, v) => strRef(k + v);
  for (const [f, kind] of ACMS_FIELDS[type]) {
    if (kind === "l" || kind === "lt") { for (const l of CMS_LANGS) if ((a[f]?.[l] || "") !== (b[f]?.[l] || "")) { const [from, to] = acmsPair(a[f]?.[l], b[f]?.[l]); out.push({ k:"cms_f_" + f, sub:l.toUpperCase(), from, to }); } continue; }
    const x = f === "image" ? a.image || null : a[f] ?? "", y = f === "image" ? b.image || null : b[f] ?? "";
    if (x === y) continue;
    if (kind === "img") out.push({ k:"cms_f_image", from:strRef(x ? "cms_img_yes" : "cms_img_no"), to:strRef(y ? (x ? "cms_img_new" : "cms_img_yes") : "cms_img_no") });
    else if (kind === "sel") out.push({ k:"cms_f_" + f, from:ref(f === "menu" ? "cms_menu_" : "cms_place_", x), to:ref(f === "menu" ? "cms_menu_" : "cms_place_", y) });
    else if (kind === "tone") out.push({ k:"cms_f_tone", from:ref("cms_tone_", x), to:ref("cms_tone_", y) });
    else if (kind === "icon") out.push({ k:"cms_f_icon", from:ref("cms_ic_", x || "none"), to:ref("cms_ic_", y || "none") });
    else out.push({ k:"cms_f_" + f, from:String(x), to:String(y) });
  }
  return out;
}

/* ---- сохранение ----
   Существующий элемент: правки черновика — поверх свежего (acmsMerge);
   «Сохранить» (keep) оставляет статус, какой у элемента сейчас в хранилище.
   Сменить статус — только с правом публиковать. Действие в журнале — по
   переходу статуса: стал опубликованным — cms_publish, перестал — cms_hide. */
const acmsStAction = (from, to) => to === from ? "cms_edit" : to === "published" ? "cms_publish" : from === "published" ? "cms_hide" : "cms_edit";
/* Заголовок списка — после сохранения; страницу из меню правят во вкладке меню. */
const acmsFocusList = type => ($(`#cms-h-${type}`) || $("#cmspanel h2[tabindex]"))?.focus();
function acmsSave(mode){
  const d = M.ui.cmsEd; if (!d) return;
  if (denied(d.id ? "content.edit" : "content.create")) return;
  const r = acmsRead(d);
  let x = r.x, from = null;
  if (d.id) {
    const cur = acmsFind(cmsFresh(), d.id);
    if (!cur || cur.deleted) { M.ui.cmsEd = null; rerender(); return toast(t("err_cms_gone")); }
    const m = acmsMerge(d, cur, r.x);
    if (m.clash) { M.ui.cmsEd = acmsDraftOf(cur); M.ui.cmsEdFocus = true; rerender(); return toast(t("err_cms_changed")); }
    x = m.x; from = cur.status;
  }
  const status = mode === "keep" ? from || "draft" : mode;
  if ((d.id ? status !== from : status === "published") && denied("content.manage")) return;
  const e = [...r.errs, ...acmsIssue(d.type, x, status === "published", d.id)];
  if (e.length) return acmsShowErr(e);
  let same = false, full = false;
  const ok = acmsCommit("cms_create", s => {
    const at = Date.now(), by = me().name, place = cmsMenuOf({ type:d.type, ...x });
    if (!d.id) {
      if (s.items.length >= CMS_ITEMS_MAX) { full = true; return null; }
      const order = Math.max(-1, ...s.items.filter(y => y.type === d.type && !y.deleted).map(y => y.order)) + 1;
      const y = { id:uid("c"), type:d.type, status, deleted:0, order, at, by, ...x, ...(acmsInMenu(d) ? { mo:acmsMoEnd(s, place) } : {}) }; s.items.push(y);
      return { vars:acmsVars(y), diff:acmsStDiff("cms_new", "cms_st_" + status) };
    }
    const y = acmsFind(s, d.id); if (!y || y.deleted) return null;
    const diff = [...acmsDiff(d.type, y, x), ...(y.status !== status ? acmsStDiff("cms_st_" + y.status, "cms_st_" + status) : [])];
    if (!diff.length) { same = true; return null; }
    const action = acmsStAction(y.status, status);
    // Перешла в другое меню — в конец его списка.
    Object.assign(y, x, { status, at, by }, acmsInMenu(y) && place !== cmsMenuOf(y) ? { mo:acmsMoEnd(s, place, y.id) } : {});
    return { vars:acmsVars(y), diff, action };
  });
  if (full) return toast(t("err_cms_many"));
  if (same) { M.ui.cmsEd = null; rerender(); acmsFocusList(d.type); return toast(t("pr_same")); }
  if (!ok) return;
  M.ui.cmsEd = null; rerender(); acmsFocusList(d.type);
  toast(t(status === "published" ? "t_cms_pub" : "t_cms_saved"));
}

/* Картинка: уменьшаем на холсте, пока строка не станет меньше CMS_IMG_MAX.
   png — сохраняет прозрачность (логотип, значок); иначе JPEG на белом. */
async function acmsImage(file, { sides, png = false, square = 0 }){
  if (!AB_LOGO_TYPES.includes(file.type)) throw "err_logo_type";
  if (file.size > ACMS_FILE_MAX) throw "err_cms_file";
  const img = await createImageBitmap(file);
  for (const side of sides) {
    const k = Math.min(1, side / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const c = Object.assign(document.createElement("canvas"), { width:square || w, height:square || h }), g = c.getContext("2d");
    if (!png) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    for (const q of png ? [0] : [0.84, 0.72]) { const url = png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", q); if (url.length <= CMS_IMG_MAX) return url; }
  }
  throw "err_cms_img_big";
}
async function acmsItemImage(file){
  try { const url = await acmsImage(file, { sides:[1600, 1200, 960, 720] }); if (!M.ui.cmsEd) return; M.ui.cmsEd.image = url; rerender(); $("#cmsimg")?.focus(); }
  catch(err) { showErr("#cmserr", t(typeof err === "string" ? err : "err_logo_type")); }
}

Object.assign(ACT, {
  acmsnew:   el => { if (denied("content.create") || !acmsMayDrop()) return; M.ui.cmsEd = acmsBlank(el.dataset.v); M.ui.cmsEdFocus = true; rerender(); },
  acmsedit:  el => {
    if (denied("content.edit")) return;
    if (M.ui.cmsEd?.id === el.dataset.v) return $("#cmsedit [data-ce]")?.focus();   // уже открыт — не сбрасываем правки
    if (!acmsMayDrop()) return;
    const x = acmsFind(cmsFresh(), el.dataset.v); if (!x) return rerender(); M.ui.cmsEd = acmsDraftOf(x); M.ui.cmsEdFocus = true; rerender(); },
  acmsclose: () => { const type = M.ui.cmsEd?.type; if (!acmsMayDrop()) return; M.ui.cmsEd = null; rerender(); acmsFocusList(type); },
  acmssave:  el => acmsSave(el.dataset.s),
  acmsset:   el => { const d = M.ui.cmsEd; if (!d) return; d[el.dataset.f] = el.dataset.v; rerender(); $(`#cmsedit [data-act="acmsset"][data-f="${el.dataset.f}"][data-v="${el.dataset.v}"]`)?.focus(); },
  acmsimgx:  () => { if (!M.ui.cmsEd) return; M.ui.cmsEd.image = null; rerender(); $("#cmsimg")?.focus(); }
});
/* Поля редактора → черновик; без перерисовки, чтобы не сбить ввод. */
document.addEventListener("input", e => {
  const k = e.target.dataset?.ce, d = M.ui.cmsEd; if (!k || !d || e.target.type === "file") return;
  const [f, l] = k.split("."); if (l) d[f][l] = e.target.value; else d[f] = e.target.value;
  if (e.target.getAttribute("aria-invalid")) acmsClearErr(e.target);
});
/* Панель кнопок (цвет, значок): стрелки, Home и End переводят фокус; выбор — Enter или пробел. */
function acmsToolbarKey(e){
  const bar = e.target.closest?.(".cms-tb"); if (!bar || e.target.tagName !== "BUTTON") return false;
  const bs = [...bar.querySelectorAll("button")], i = bs.indexOf(e.target), n = bs.length;
  const j = { ArrowRight:i + 1, ArrowDown:i + 1, ArrowLeft:i - 1 + n, ArrowUp:i - 1 + n, Home:0, End:n - 1 }[e.key]; if (j == null) return false;
  e.preventDefault(); bs.forEach(b => { b.tabIndex = -1; }); bs[j % n].tabIndex = 0; bs[j % n].focus(); return true;
}
/* Esc в редакторе — закрыть его, как «Отмена» (с правками — после вопроса). */
document.addEventListener("keydown", e => {
  if (!M.ui.cmsEd || !e.target.closest?.("#cmsedit")) return;
  if (acmsToolbarKey(e)) return;
  if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); ACT.acmsclose(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "cmsimg" && e.target.files?.[0]) return acmsItemImage(e.target.files[0]);
  const k = e.target.dataset?.ce, d = M.ui.cmsEd; if (!k || !d || e.target.tagName !== "SELECT") return;
  d[k] = e.target.value;
});
