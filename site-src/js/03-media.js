/* ==========================================================================
   Фотографии направлений, отелей и воздушных судов.
   Снимки — Unsplash (бесплатная лицензия) и Wikimedia Commons (с подписью
   автора и лицензии прямо на фото). Грузятся по ссылке нужной ширины.
   Под каждым снимком — фирменный градиент направления: пока фото грузится
   или если оно не загрузилось, карточка не пустая.
   Данные — PH в 04-photos.js.
   ========================================================================== */
"use strict";

/* Wikimedia отдаёт превью только стандартных ширин. */
const WIKI_STEPS = [330, 500, 960, 1280, 1920];
const wikiStep = w => WIKI_STEPS.find(s => s >= w) || WIKI_STEPS[WIKI_STEPS.length - 1];
/* ar — соотношение сторон кадра: Unsplash сам кадрирует, и полоса-баннер не
   тянет полный снимок 3:2. */
function phUrl(p, w, ar){
  if (p.src === "unsplash") return `${p.u}?auto=format&fit=crop&w=${w}${ar ? `&h=${Math.round(w / ar)}&crop=focalpoint&fp-x=.5&fp-y=${p.fy}` : ""}&q=${w > 1000 ? 58 : 66}`;
  return p.u.replace(/\/\d+px-/, `/${wikiStep(w)}px-`);
}
/* Кандидаты srcset с настоящими ширинами файлов. */
function phSet(p, w, ar){
  const ws = p.src === "unsplash" ? [Math.round(w / 2), w, Math.round(w * 1.6)] : [...new Set([w / 2, w, w * 1.6].map(wikiStep))];
  return [...new Set(ws)].map(x => `${phUrl(p, x, ar)} ${x}w`).join(", ");
}
/* Уже загруженные снимки при перерисовке показываются сразу, без проявления. */
const PH_SEEN = new Set();
function phLoaded(img){ PH_SEEN.add(img.dataset.k); img.classList.add("in"); }
/* Не загрузилось — убираем снимок с подписью; рамка, которая была только
   ради фото, сворачивается (класс ph-failed), остальные остаются с градиентом. */
function phFailed(img){ const box = img.parentElement; box?.querySelector(".ph-credit")?.remove(); box?.classList.add("ph-failed"); img.remove(); }
/* deco — снимок внутри кнопки или ссылки: подпись у них уже есть, описание
   фото только мешало бы экранному диктору. */
function photo(key, { w = 640, sizes = "100vw", cls = "", eager = false, deco = false, ar = 0 } = {}){
  const p = PH[key]; if (!p) return "";
  const credit = p.src === "unsplash" ? "" : `<span class="ph-credit" ${deco ? 'aria-hidden="true"' : ""}>${esc(p.by)} · ${esc(p.lic)}</span>`;
  const alt = deco ? "" : S.lang === "ru" ? p.ru : p.en, lang = !deco && S.lang === "uz" ? ' lang="en"' : "";
  return `<img class="ph ${PH_SEEN.has(key) ? "in" : ""} ${cls}" data-k="${key}" src="${phUrl(p, w, ar)}" srcset="${phSet(p, w, ar)}" sizes="${sizes}"
    alt="${esc(alt)}"${lang} loading="${eager ? "eager" : "lazy"}" decoding="async" style="object-position:50% ${Math.round(p.fy * 100)}%"
    onload="phLoaded(this)" onerror="phFailed(this)">${credit}`;
}
const hasPhoto = key => !!PH[key];
