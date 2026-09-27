/* ==========================================================================
   Содержимое сайта из админки (13-cms.js): баннеры на главной, страницы,
   вопросы и ответы, новости, ссылки в шапке и подвале, контакты и соцсети.
   Только сайт: в кабинет и админку этот файл не входит (build.py).
   ========================================================================== */
"use strict";

/* Внешняя ссылка — в новой вкладке, и диктор об этом предупреждает. */
const cmsExtAttrs = href => cmsIsExt(href) ? ' target="_blank" rel="noopener"' : "";
const cmsExtNote = href => cmsIsExt(href) ? `<span class="sr-only"> (${esc(t("cms_new_tab"))})</span>` : "";
const cmsA = (href, label, cls = "", extra = "") => `<a class="${cls}" href="${esc(href)}"${cmsExtAttrs(href)} ${extra}>${label}${cmsExtNote(href)}</a>`;

/* ---- баннеры ---- */
/* Видео — заглушка с кнопкой: YouTube грузится только по нажатию и играет
   сам только в этот раз. Перерисовка той же страницы (валюта, язык, правка в
   админке) оставляет плеер, но без автозапуска; ушли с главной — снова заглушка. */
function cmsVideo(b){
  if (M.ui.cmsPlay?.[b.id]) return `<div class="cms-vid">${cmsIframe(b, false)}</div>`;
  return `<div class="cms-vid">${b.image ? `<img src="${b.image}" alt="" loading="lazy">` : ""}
    <button type="button" class="cms-play" data-act="cmsplay" data-v="${esc(b.id)}"><span>${IC.play}</span><b>${esc(t("cms_play"))}</b></button></div>`;
}
const cmsIframe = (b, auto) => `<iframe src="https://www.youtube-nocookie.com/embed/${b.video}${auto ? "?autoplay=1" : ""}" title="${esc(cmsText(b.title))}" loading="lazy"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
function cmsBanner(b){
  const btn = cmsText(b.btn), media = b.video ? cmsVideo(b) : b.image ? `<img src="${b.image}" alt="" loading="lazy">` : "";
  return `<article class="cms-bn tone-${b.tone}"><div class="cms-bn-in ${media ? "has-media" : ""}">
    <div class="cms-bn-body">${b.icon && IC[b.icon] ? `<span class="cms-bn-ic">${cmsIcon(b.icon)}</span>` : ""}
      <h2>${esc(cmsText(b.title))}</h2>${cmsText(b.text) ? `<p>${esc(cmsText(b.text))}</p>` : ""}
      ${btn && b.href ? cmsA(b.href, esc(btn), "solid") : ""}</div>
    ${media ? `<div class="cms-bn-media">${media}</div>` : ""}</div></article>`;
}
function cmsBanners(place){
  const list = cmsItems("banner", { published:true }).filter(b => b.place === place);
  return list.length ? `<section class="container section cms-bn-sec" aria-label="${esc(t("cms_offers"))}"><div class="cms-bns">${list.map(cmsBanner).join("")}</div></section>` : "";
}
ACT.cmsplay = el => {
  const b = cmsItems("banner", { published:true }).find(x => x.id === el.dataset.v); if (!b?.video) return;
  (M.ui.cmsPlay ||= {})[b.id] = true;
  const box = el.closest(".cms-vid"); box.innerHTML = cmsIframe(b, true); box.querySelector("iframe")?.focus();
};
window.addEventListener("hashchange", () => { M.ui.cmsPlay = null; });

/* ---- шапка и подвал ---- */
/* Ссылки места (header/footer): страницы с этим меню и ссылки — в общем порядке (cmsMenuItems). */
const cmsMenu = place => cmsMenuItems(place, { published:true }).map(x => x.type === "page"
  ? { label:cmsText(x.title), href:`#/p/${x.slug}`, icon:"" } : { label:cmsText(x.label), href:x.href, icon:x.icon });
/* Значок ссылки — перед подписью, диктору он не нужен. */
const cmsMenuLabel = x => (x.icon && IC[x.icon] ? `<span class="cms-lic" aria-hidden="true">${cmsIcon(x.icon)}</span>` : "") + esc(x.label);
const cmsCurrent = href => href === "#/" + currentParts().join("/") ? 'aria-current="page"' : "";
/* Ссылки шапки — отдельной строкой под разделами: в одной полосе с ними
   на широком экране они уезжали за край. */
const cmsNavLinks = () => { const l = cmsMenu("header"); return l.length ? `<nav class="navcms" aria-label="${esc(t("cms_info"))}">${l.map(x => cmsA(x.href, cmsMenuLabel(x), "", cmsCurrent(x.href))).join("")}</nav>` : ""; };
/* Строка прокручивается вбок, полосы прокрутки нет — у края, за которым есть
   ещё ссылки, текст гаснет; текущая ссылка — посередине. */
function cmsNavFade(el){
  const max = el.scrollWidth - el.clientWidth;
  el.classList.toggle("cms-fl", max > 1 && el.scrollLeft > 1); el.classList.toggle("cms-fr", max > 1 && el.scrollLeft < max - 1);
}
function cmsNavArm(){
  const el = $("#nav .navcms"); if (!el) return;
  centerActive(el.querySelector('[aria-current="page"]')); cmsNavFade(el);
  el.addEventListener("scroll", () => cmsNavFade(el), { passive:true });
}
window.addEventListener("resize", () => { const el = $("#nav .navcms"); if (el) cmsNavFade(el); });
const cmsSiteName = () => (cmsSiteTitle() || "Charteri").split(" — ")[0];
function cmsLogo(){
  const s = cmsSite();
  return s.logo ? `<img class="cms-logo" src="${s.logo}" alt="${esc(cmsSiteName())}">` : `<span class="wordmark dark">CHARTERI<b>.UZ</b></span>`;
}
/* В подвале логотип — на светлой плашке: подвал тёмный в любой теме. */
const cmsFootLogo = () => cmsSite().logo ? `<span class="foot-logo"><img src="${cmsSite().logo}" alt="${esc(cmsSiteName())}"></span>` : `<span class="wordmark">CHARTERI<b>.UZ</b></span>`;
/* Колонки подвала из админки: «Информация» (страницы, ссылки, FAQ, новости)
   и «Контакты» (телефон, почта, адрес, соцсети) — только если есть что показать. */
function cmsFootCols(){
  const s = cmsSite(), cols = [], link = (href, label) => cmsA(href, esc(label), "footlink");
  const info = [...cmsMenu("footer").map(x => cmsA(x.href, cmsMenuLabel(x), "footlink")),
    ...(cmsItems("faq", { published:true }).length ? [link("#/faq", t("cms_faq"))] : []),
    ...(cmsItems("news", { published:true }).length ? [link("#/news", t("cms_news"))] : [])];
  if (info.length) cols.push(`<div class="stack" style="gap:6px"><b>${esc(t("cms_info"))}</b>${info.join("")}</div>`);
  const soc = CMS_SOCIALS.filter(k => s.socials[k]).map(k => link(s.socials[k], t("cms_soc_" + k)));
  const con = [s.phone ? link("tel:" + s.phone.replace(/[^\d+]/g, ""), s.phone) : "", s.email ? link("mailto:" + s.email, s.email) : "",
    cmsText(s.address) ? `<span class="small">${esc(cmsText(s.address))}</span>` : ""].filter(Boolean);
  if (con.length || soc.length) cols.push(`<div class="stack" style="gap:6px"><b>${esc(t("cms_contacts"))}</b>${con.join("")}
    ${soc.length ? `<span class="foot-soc-h small">${esc(t("cms_follow"))}</span>${soc.join("")}` : ""}</div>`);
  return cols;
}

/* ---- страницы ---- */
const cmsNotFound = () => `<div class="container section">${backLink("", t("home"))}<div class="card empty"><h1 class="h-empty">${esc(t("cms_missing"))}</h1>
  <p class="muted">${esc(t("cms_missing_d"))}</p><a class="solid" href="#/">${esc(t("home"))}</a></div></div>`;
PAGES["p/:slug"] = {
  render({ slug }){
    const p = cmsPageBySlug(slug); if (!p) return cmsNotFound();
    return `<div class="container section"><article class="cms-page">${backLink("", t("home"))}
      <h1>${esc(cmsText(p.title))}</h1><div class="cms-body">${cmsBody(cmsText(p.body))}</div></article></div>`;
  }
};
PAGES.faq = {
  render(){
    const list = cmsItems("faq", { published:true }), groups = new Map();
    for (const x of list) { const g = cmsText(x.group) || t("cms_faq_other"); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
    const heads = groups.size > 1;
    return `<div class="container section"><div class="cms-page">${pageHead(t("cms_faq"), t("cms_faq_sub"))}
      ${!list.length ? `<div class="card empty"><h2>${esc(t("cms_faq_empty"))}</h2></div>` : [...groups].map(([g, xs]) => `<section class="cms-faq-g">${heads ? `<h2>${esc(g)}</h2>` : ""}
        ${xs.map(x => `<details class="cms-qa" data-keep="faq_${esc(x.id)}" ${M.ui["faq_" + x.id] ? "open" : ""}><summary>${esc(cmsText(x.q))}</summary>
          <div class="cms-body">${cmsBody(cmsText(x.a), "h3")}</div></details>`).join("")}</section>`).join("")}</div></div>`;
  }
};
const cmsNews = () => cmsItems("news", { published:true }).sort(cmsByDate);
PAGES.news = {
  render(){
    const list = cmsNews();
    return `<div class="container section">${pageHead(t("cms_news"), t("cms_news_sub"))}
      ${!list.length ? `<div class="card empty"><h2>${esc(t("cms_news_empty"))}</h2></div>` : `<div class="cms-news">${list.map(n => `<article class="cms-nc lift">
        ${n.image ? `<img src="${n.image}" alt="" loading="lazy">` : ""}<div class="cms-nc-b"><time class="small muted" datetime="${n.date}">${esc(fdateY(n.date))}</time>
          <h2><a href="#/news/${esc(n.id)}">${esc(cmsText(n.title))}</a></h2><p class="muted">${esc(cmsExcerpt(cmsText(n.text)))}</p></div></article>`).join("")}</div>`}</div>`;
  }
};
PAGES["news/:id"] = {
  render({ id }){
    const n = cmsNews().find(x => x.id === id); if (!n) return cmsNotFound();
    return `<div class="container section"><article class="cms-page">${backLink("news", t("cms_news"))}
      <time class="small muted" datetime="${n.date}">${esc(fdateY(n.date))}</time><h1>${esc(cmsText(n.title))}</h1>
      ${n.image ? `<img class="cms-hero-img" src="${n.image}" alt="">` : ""}<div class="cms-body">${cmsBody(cmsText(n.text))}</div></article></div>`;
  }
};
