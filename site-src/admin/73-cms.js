/* ==========================================================================
   Управление сайтом (CMS): главная (тексты героя и баннеры), страницы, меню
   и подвал, вопросы и ответы, новости, тексты сайта, SEO и бренд, корзина.
   Хранилище — js/13-cms.js; сайт видит изменения сразу, в том числе в
   соседней вкладке. У каждого элемента: создать, изменить, опубликовать,
   скрыть, удалить в корзину, восстановить, удалить навсегда. Подтверждения
   не нужны: удаление обратимо через корзину. Акции, скидки, тарифы и цены —
   в «Услугах и ценах», здесь только ссылка туда.
   Редактор элемента — 74-cms-edit.js, тексты и настройки сайта — 76-cms-site.js.
   ========================================================================== */
"use strict";

const ACMS_TABS = ["home", "pages", "menu", "faq", "news", "texts", "seo", "trash"];
const acmsTab = () => ACMS_TABS.includes(M.ui.cmsTab) ? M.ui.cmsTab : "home";
const ACMS_PILL = { draft:"st-PENDING", published:"st-CONFIRMED", hidden:"st-NEW" };
const acmsPill = x => `<span class="pill ${ACMS_PILL[x.status]}">${esc(t("cms_st_" + x.status))}</span>`;
const acmsName = x => x[CMS_MAIN[x.type]];
/* Для журнала: вид элемента строкой интерфейса и название на трёх языках. */
const acmsVars = x => ({ what:strRef("cms_t_" + x.type), name:{ ...acmsName(x) } });

/* Где элемент на сайте — для «Открыть на сайте». Телефон и почту не открываем. */
function acmsSiteHref(x){
  const base = "../b2c/";
  if (x.type === "page") return `${base}#/p/${x.slug}`;
  if (x.type === "faq") return `${base}#/faq`;
  if (x.type === "news") return `${base}#/news/${x.id}`;
  if (x.type === "link") return cmsIsExt(x.href) ? x.href : x.href.startsWith("#/") ? base + x.href : null;
  return `${base}#/`;
}
function acmsSub(x){
  // Место баннера — заголовок его группы в списке, здесь не повторяем.
  if (x.type === "banner") return x.video ? t("cms_f_video") : x.image ? t("cms_f_image") : "";
  if (x.type === "page") return `/p/${x.slug} · ${t("cms_menu_" + x.menu)}`;
  if (x.type === "faq") return cmsText(x.group);
  if (x.type === "news") return fdateY(x.date);
  return `${t("cms_place_" + x.place)} · ${x.href}`;
}

/* ---- запись ----
   fn получает свежую копию хранилища, меняет её и возвращает { vars, diff }
   для журнала (и action, если действие стало ясно только по свежим данным)
   или null — менять нечего. Не поместилось — сообщение, без журнала. */
function acmsCommit(action, fn){
  const next = cmsClone(cmsFresh()), r = fn(next);
  if (!r) { rerender(); return false; }
  if (!cmsWrite(next)) { toast(t("err_cms_quota")); return false; }
  change(() => audit(r.action || action, r.vars, { module:"content", diff:r.diff || [] }));
  return true;
}
const acmsFind = (store, id) => store.items.find(x => x.id === id) || null;
const acmsStDiff = (a, b) => [{ k:"col_status", from:strRef(a), to:strRef(b) }];

/* Опубликовать можно только заполненный на трёх языках элемент: иначе — в
   редактор с ошибкой. Открыт редактор другого элемента с несохранёнными
   правками — сначала спрашиваем, можно ли их бросить. Статус в открытом
   редакторе этого же элемента берётся из хранилища (acmsForm), править его не надо. */
function acmsSetStatus(id, status){
  if (denied("content.manage")) return false;
  const x = acmsFind(cmsFresh(), id); if (!x || x.deleted || x.status === status) return rerender();
  if (status === "published") { const e = acmsIssue(x.type, x, true, x.id);
    if (e.length) {
      const ed = M.ui.cmsEd; if (ed?.id !== id && !acmsMayDrop()) return false;
      if (ed?.id !== id) M.ui.cmsEd = acmsDraftOf(x);
      M.ui.cmsEdErr = e; rerender(); return false; } }
  return acmsCommit(status === "published" ? "cms_publish" : "cms_hide", s => { const y = acmsFind(s, id); if (!y || y.deleted) return null;
    const from = y.status; Object.assign(y, { status, at:Date.now(), by:me().name });
    return { vars:acmsVars(y), diff:acmsStDiff("cms_st_" + from, "cms_st_" + status) }; });
}
function acmsTrashIt(id, back){
  if (denied("content.delete")) return false;
  const ok = acmsCommit(back ? "cms_restore" : "cms_delete", s => { const y = acmsFind(s, id); if (!y || !!y.deleted === !back) return null;
    y.deleted = back ? 0 : Date.now();
    return { vars:acmsVars(y), diff:acmsStDiff(back ? "cms_in_trash" : "cms_st_" + y.status, back ? "cms_st_" + y.status : "cms_in_trash") }; });
  // Удалённый элемент был открыт в редакторе — закрываем: сохранять его уже некуда.
  if (ok && !back && M.ui.cmsEd?.id === id) { M.ui.cmsEd = null; rerender(); }
  return ok;
}
function acmsPurge(id){
  if (denied("content.delete")) return false;
  const x = acmsFind(cmsFresh(), id); if (!x) return rerender();
  if (!confirm(tf("cms_purge_q", { name:cmsText(acmsName(x)) }))) return false;
  return acmsCommit("cms_purge", s => { const i = s.items.findIndex(y => y.id === id && y.deleted); if (i < 0) return null;
    const [y] = s.items.splice(i, 1); return { vars:acmsVars(y) }; });
}
/* Порядок — внутри своего вида, у баннеров — внутри своего места на главной
   (порядок между местами на сайте ничего не меняет). Новости сайт ставит по
   дате — их не двигаем. Страницы и ссылки двигают во вкладке «Меню и подвал»
   (menu): у шапки и подвала один список на страницы и ссылки, номер — mo.
   Номера после перестановки идут подряд. */
const acmsSame = (x, y) => x.type === y.type && (x.type !== "banner" || x.place === y.place);
const acmsByOrder = (a, b) => a.order - b.order || a.at - b.at;
const acmsInMenu = x => x.type === "page" || x.type === "link";
/* Новое место в меню (или в «не в меню») — в конец его списка. */
const acmsMoEnd = (s, place, skip) => Math.max(-1, ...cmsMenuList(s.items.filter(x => !x.deleted && x.id !== skip), place).map(x => x.mo)) + 1;
function acmsMoveMenu(s, y, d){
  const place = cmsMenuOf(y); if (!CMS_LINK_PLACES.includes(place)) return null;
  const group = cmsMenuList(s.items.filter(x => !x.deleted), place), i = group.indexOf(y), j = i + d;
  if (j < 0 || j >= group.length) return null;
  [group[i], group[j]] = [group[j], group[i]]; group.forEach((x, n) => { x.mo = n; });
  return { vars:acmsVars(y), diff:[{ k:"cms_f_mo", from:String(i + 1), to:String(j + 1) }] };
}
function acmsMove(id, d, menu = false){
  if (denied("content.edit")) return false;
  return acmsCommit("cms_order", s => {
    const y = acmsFind(s, id); if (!y || y.deleted || y.type === "news" || acmsInMenu(y) !== menu) return null;
    if (menu) return acmsMoveMenu(s, y, d);
    const all = s.items.filter(x => x.type === y.type && !x.deleted).sort(acmsByOrder), group = all.filter(x => acmsSame(x, y));
    const i = group.indexOf(y), j = i + d;
    if (j < 0 || j >= group.length) return null;
    const a = all.indexOf(group[i]), b = all.indexOf(group[j]);
    [all[a], all[b]] = [all[b], all[a]]; all.forEach((x, n) => { x.order = n; });
    return { vars:acmsVars(y), diff:[{ k:"cms_f_order", from:String(i + 1), to:String(j + 1) }] };
  });
}

/* ---- списки ----
   Скрытое и черновики — приглушены название и статус, кнопки — в полную силу. */
/* menu — строка списка «Меню и подвал»: стрелки двигают её в меню места. */
function acmsRow(x, i, n, menu = false){
  const name = cmsText(acmsName(x)), href = x.status === "published" ? acmsSiteHref(x) : null, lbl = k => `${t(k)}: ${name}`;
  const mv = (dd, ic, k, off) => `<button type="button" class="iconbtn sm" data-act="acmsmove" data-v="${esc(x.id)}" data-d="${dd}"${menu ? ' data-m="1"' : ""} aria-label="${esc(lbl(k))}" ${off ? "disabled" : can("content.edit") ? "" : 'disabled aria-disabled="true"'}>${IC[ic]}</button>`;
  const movable = menu || !(x.type === "news" || acmsInMenu(x));
  return `<div class="arow ${x.status === "published" ? "" : "cms-dim"}">
    <span class="a-main"><b>${esc(name)}</b><span class="small muted">${esc(menu && x.type === "page" ? `${t("cms_t_page")} · /p/${x.slug}` : acmsSub(x))}</span></span>
    <span class="a-keep">${acmsPill(x)}</span>
    <span class="a-end cms-acts">${movable ? `<span class="cms-ord">${mv(-1, "up", "cms_up", i === 0)}${mv(1, "down", "cms_down", i === n - 1)}</span>` : ""}
      <button type="button" class="link" data-act="acmsedit" data-v="${esc(x.id)}" aria-label="${esc(lbl("edit"))}" ${guard("content.edit")}>${esc(t("edit"))}</button>
      ${x.status === "published" ? `<button type="button" class="link" data-act="acmshide" data-v="${esc(x.id)}" aria-label="${esc(lbl("cms_hide"))}" ${guard("content.manage")}>${esc(t("cms_hide"))}</button>`
        : `<button type="button" class="link" data-act="acmspub" data-v="${esc(x.id)}" aria-label="${esc(lbl("cms_publish"))}" ${guard("content.manage")}>${esc(t("cms_publish"))}</button>`}
      <button type="button" class="link danger" data-act="acmsdel" data-v="${esc(x.id)}" aria-label="${esc(lbl("delete_cta"))}" ${guard("content.delete")}>${esc(t("delete_cta"))}</button>
      ${href ? `<a class="link cms-open" href="${esc(href)}" target="_blank" rel="noopener">${esc(t("cms_open"))}${IC.ext}<span class="sr-only"> — ${esc(name)} (${esc(t("cms_new_tab"))})</span></a>` : ""}</span></div>`;
}
const acmsTable = (list, menu = false) => `<div class="atable cms-table" style="--cols:minmax(0,1fr) auto auto">${list.map((x, i) => acmsRow(x, i, list.length, menu)).join("")}</div>`;
/* Баннеры — по местам на главной, каждое место со своим порядком;
   новости — по дате, как на сайте; ссылки — меню шапки и подвала целиком,
   вместе со страницами из этого меню, в порядке сайта. */
function acmsListBody(type){
  if (type === "link") {
    const html = CMS_LINK_PLACES.map(p => { const g = cmsMenuItems(p);
      return g.length ? `<div class="cms-grp"><h3 class="cms-grp-h">${esc(t("cms_menu_" + p))}</h3>${acmsTable(g, true)}</div>` : ""; }).join("");
    return html || `<p class="muted">${esc(t("cms_none"))}</p>`;
  }
  const list = cmsItems(type);
  if (!list.length) return `<p class="muted">${esc(t("cms_none"))}</p>`;
  if (type === "news") return acmsTable([...list].sort(cmsByDate));
  if (type !== "banner") return acmsTable(list);
  return CMS_PLACES.map(p => { const g = list.filter(x => x.place === p);
    return g.length ? `<div class="cms-grp"><h3 class="cms-grp-h">${esc(t("cms_place_" + p))}</h3>${acmsTable(g)}</div>` : ""; }).join("");
}
function acmsList(type){
  // Во вкладке «Меню и подвал» страницу из меню тоже можно открыть в редакторе.
  const ed = M.ui.cmsEd, here = ed && (ed.type === type || (type === "link" && ed.type === "page"));
  return `<section class="card stack" aria-labelledby="cms-h-${type}"><div class="card-h cms-list-h"><div class="stack" style="gap:4px"><h2 id="cms-h-${type}" tabindex="-1">${esc(t("cms_h_" + type))}</h2><p class="muted small">${esc(t("cms_d_" + type))}</p></div>
      <button type="button" class="ghost sm" data-act="acmsnew" data-v="${type}" ${guard("content.create")}>${IC.plus}<span>${esc(t("cms_new_" + type))}</span></button></div>
    ${here ? acmsForm(ed) : ""}
    ${acmsListBody(type)}</section>`;
}
function acmsTrash(){
  const list = cmsItems(null, { trash:true }).sort((a, b) => b.deleted - a.deleted);
  return `<section class="card stack" aria-labelledby="cms-h-trash"><div class="stack" style="gap:4px"><h2 id="cms-h-trash" tabindex="-1">${esc(t("cms_tab_trash"))}</h2><p class="muted small">${esc(t("cms_d_trash"))}</p></div>
    ${list.length ? `<div class="atable cms-table" style="--cols:minmax(0,1fr) auto auto">${list.map(x => { const name = cmsText(acmsName(x));
      // В корзине элемента на сайте нет, какой бы статус у него ни был: статус до удаления — строкой ниже.
      return `<div class="arow cms-dim"><span class="a-main"><b>${esc(name)}</b><span class="small muted">${esc(t("cms_t_" + x.type))} · ${esc(tf("cms_deleted_ago", { ago:ago(x.deleted) }))} · ${esc(tf("cms_was", { st:t("cms_st_" + x.status) }))}</span></span>
        <span class="a-keep"><span class="pill st-NEW">${esc(t("cms_in_trash"))}</span></span>
        <span class="a-end cms-acts"><button type="button" class="link" data-act="acmsrestore" data-v="${esc(x.id)}" aria-label="${esc(t("cms_restore"))}: ${esc(name)}" ${guard("content.delete")}>${esc(t("cms_restore"))}</button>
          <button type="button" class="link danger" data-act="acmspurge" data-v="${esc(x.id)}" aria-label="${esc(t("cms_purge"))}: ${esc(name)}" ${guard("content.delete")}>${esc(t("cms_purge"))}</button></span></div>`; }).join("")}</div>`
      : `<p class="muted">${esc(t("cms_trash_empty"))}</p>`}</section>`;
}
/* Акции, скидки, тарифы и цены живут в «Услугах и ценах» — не дублируем. */
const acmsPricingCard = () => `<section class="card cms-pr"><span class="task-ic">${IC.tag}</span><div class="stack cms-pr-t" style="gap:2px"><b>${esc(t("cms_pr_h"))}</b>
  <p class="muted small">${esc(t("cms_pr_d"))}</p></div>${can("pricing.view") ? `<a class="ghost sm" href="#/pricing">${esc(t("an_pricing"))}</a>` : ""}</section>`;

const ACMS_PANELS = {
  home:  () => acmsHero() + acmsList("banner"),
  pages: () => acmsList("page"),
  menu:  () => acmsList("link") + `<p class="muted small">${esc(t("cms_menu_note"))}</p>` + acmsContacts(),
  faq:   () => acmsList("faq"),
  news:  () => acmsList("news"),
  texts: () => acmsTexts(),
  seo:   () => acmsSeo(),
  trash: () => acmsTrash()
};
PAGES.cms = {
  render(){
    const cur = acmsTab(), n = cmsItems(null, { trash:true }).length;
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_cms"))}</h1><p class="muted">${esc(t("cms_sub"))}</p></div>
      <div class="chipbar cms-tabs" role="tablist" aria-label="${esc(t("an_cms"))}">${ACMS_TABS.map(k => `<button type="button" role="tab" class="chip" id="cmstab-${k}" data-act="acmstab" data-v="${k}"
        aria-selected="${k === cur}" aria-controls="cmspanel" tabindex="${k === cur ? 0 : -1}">${esc(t("cms_tab_" + k))}${k === "trash" && n ? `<span class="chip-n">${n}</span>` : ""}</button>`).join("")}</div>
      <div id="cmspanel" class="stack" role="tabpanel" aria-labelledby="cmstab-${cur}">${ACMS_PANELS[cur]()}</div>
      <div style="margin-top:14px">${acmsPricingCard()}</div></div>`;
  },
  after(){
    // На узком экране вкладки прокручиваются вбок — выбранную держим на виду.
    const tb = $('.cms-tabs [aria-selected="true"]'), bar = tb?.parentElement;
    if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = tb.offsetLeft - (bar.clientWidth - tb.offsetWidth) / 2;
    // Редактор открыли — фокус на первое поле (или на поле с ошибкой, если публикация не прошла).
    if (M.ui.cmsEdErr) { const e = M.ui.cmsEdErr; M.ui.cmsEdErr = null; M.ui.cmsEdFocus = false; acmsShowErr(e); }
    else if (M.ui.cmsEd && M.ui.cmsEdFocus) { M.ui.cmsEdFocus = false; $("#cmsedit [data-ce]")?.focus(); }
  }
};

/* ---- кнопки ---- */
/* Вкладки: стрелки, Home и End — как у списка вкладок в ARIA. */
/* Другая вкладка закрывает редактор — несохранённые правки только с согласия. */
function acmsGoTab(k, focus){
  if (M.ui.cmsTab !== k) { if (!acmsMayDrop()) return; M.ui.cmsTab = k; M.ui.cmsEd = null; rerender(); }
  if (focus) $(`#cmstab-${k}`)?.focus();
}
document.addEventListener("keydown", e => {
  if (!e.target.matches?.('.cms-tabs [role="tab"]')) return;
  const i = ACMS_TABS.indexOf(acmsTab()), n = ACMS_TABS.length;
  const j = { ArrowRight:i + 1, ArrowLeft:i - 1 + n, Home:0, End:n - 1 }[e.key]; if (j == null) return;
  e.preventDefault(); acmsGoTab(ACMS_TABS[j % n], true);
});
Object.assign(ACT, {
  acmstab:     el => acmsGoTab(el.dataset.v, true),
  acmspub:     el => { if (acmsSetStatus(el.dataset.v, "published")) { toast(t("t_cms_pub")); $(`[data-act="acmshide"][data-v="${CSS.escape(el.dataset.v)}"]`)?.focus(); } },
  acmshide:    el => { if (acmsSetStatus(el.dataset.v, "hidden")) { toast(t("t_cms_hide")); $(`[data-act="acmspub"][data-v="${CSS.escape(el.dataset.v)}"]`)?.focus(); } },
  acmsdel:     el => { const h = el.closest("section")?.querySelector("h2")?.id; if (acmsTrashIt(el.dataset.v, false)) { toast(t("t_cms_del")); if (h) $("#" + h)?.focus(); } },
  acmsrestore: el => { if (acmsTrashIt(el.dataset.v, true)) { toast(t("t_cms_restore")); $("#cms-h-trash")?.focus(); } },
  acmspurge:   el => { if (acmsPurge(el.dataset.v)) { toast(t("t_cms_purge")); $("#cms-h-trash")?.focus(); } },
  acmsmove:    el => {
    const id = el.dataset.v, d = Number(el.dataset.d);
    if (!acmsMove(id, d, !!el.dataset.m)) return;
    const b = $(`[data-act="acmsmove"][data-v="${CSS.escape(id)}"][data-d="${d}"]`);
    (b && !b.disabled ? b : $(`[data-act="acmsmove"][data-v="${CSS.escape(id)}"][data-d="${-d}"]`))?.focus();
    announce(t("t_cms_moved"));
  }
});
