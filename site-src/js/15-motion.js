/* ==========================================================================
   Движение. Язык задан брендбуком Charteri:
     появление карточек   — подъём на 14 px, каскад 55 мс, 420 мс, ease-out
     детали рейса         — самолёт по дуге к вершине, 900 мс, cubic
     смена темы           — затухание всей страницы, 260 мс
     сортировка           — карточки переезжают на новые места, 260 мс
     оплата               — синяя галочка на пружине
     пустые поездки       — самолёт по кругу, 4,2 с
   Анимируются только transform и opacity. При «уменьшить движение» всё
   показывается сразу в конечном состоянии.
   ========================================================================== */
"use strict";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const canVT = () => !REDUCED && typeof document.startViewTransition === "function";

/* ---- переход между страницами (View Transitions) ---- */
function withTransition(update, kind = "nav"){
  if (!canVT()) return update();
  const root = document.documentElement;
  root.dataset.vt = kind;
  const vt = document.startViewTransition(update);
  vt.finished.finally(() => { delete root.dataset.vt; });
}

/* ---- FLIP: карточки переезжают, а не прыгают (сортировка, фильтры) ----
   Сначала все чтения, потом все записи: чередование вызвало бы
   пересчёт раскладки на каждой карточке. */
function flip(update){
  if (REDUCED) return update();
  const first = new Map($$("[data-flip]").map(el => [el.dataset.flip, el.getBoundingClientRect()]));
  update();
  const last = $$("[data-flip]").map(el => [el, el.getBoundingClientRect()]);
  for (const [el, r] of last) {
    const f = first.get(el.dataset.flip);
    if (!f) { el.animate([{ opacity:0, transform:"translateY(8px)" }, { opacity:1, transform:"none" }], { duration:260, easing:EASE_OUT }); continue; }
    const dx = f.left - r.left, dy = f.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform:`translate(${dx}px, ${dy}px)` }, { transform:"none" }], { duration:260, easing:EASE_IN_OUT });
  }
}
/* Каскад появления — только когда список пришёл впервые (новый поиск,
   переход на страницу). При сортировке и фильтрах работает FLIP, а не каскад. */
function listEnter(key){ const fresh = M.ui.listKey !== key; M.ui.listKey = key; return fresh ? "rise" : ""; }

/* ---- скользящий индикатор вкладок и сегментов ---- */
const IND = new Map();
function slideIndicators(animate = true){
  const route = currentParts().join("/") || "home", counts = {};
  const reads = $$("[data-ind]").map(g => {
    const k = (g.closest("#nav") ? "nav:" : route + ":") + g.dataset.ind;
    counts[k] = (counts[k] || 0) + 1;
    const on = g.querySelector('[aria-selected="true"],[aria-pressed="true"]');
    return { key: k + ":" + counts[k], ind: g.querySelector(":scope > .ind"), line: "indLine" in g.dataset,
      r: on && on.offsetWidth ? { x:on.offsetLeft, y:on.offsetTop, w:on.offsetWidth, h:on.offsetHeight } : null };
  });
  for (const { key, ind, line, r } of reads) {
    if (!ind) continue;
    if (!r) { ind.style.opacity = "0"; continue; }
    const to = `translate(${r.x}px, ${line ? 0 : r.y}px)`;
    Object.assign(ind.style, { opacity:"1", width:r.w + "px", height: line ? "" : r.h + "px", transform:to });
    const prev = IND.get(key); IND.set(key, r);
    if (animate && prev && !REDUCED && (prev.x !== r.x || prev.y !== r.y || prev.w !== r.w))
      ind.animate([{ transform:`translate(${prev.x}px, ${line ? 0 : prev.y}px) scaleX(${prev.w / r.w})` }, { transform:to }],
        { duration:240, easing:EASE_OUT });
  }
}

/* ---- счётчик суммы: только при изменении, не при первом показе ----
   Первый показ — сразу конечная цифра: сумму нельзя заставлять ждать. */
const COUNTS = new Map();
const fmtVal = v => S.cur === "USD" ? "$" + grp(v) : grp(v) + NB + t("cur_uzs");
function countUps(){
  for (const el of $$("[data-count]")) {
    const key = el.dataset.count, target = Number(S.cur === "USD" ? el.dataset.usd : el.dataset.uzs), prev = COUNTS.get(key);
    COUNTS.set(key, { cur:S.cur, v:target });
    if (REDUCED || !prev || prev.cur !== S.cur || prev.v === target) continue;
    const from = prev.v, t0 = performance.now(), D = 420;
    const tick = now => {
      if (!el.isConnected) return;                          // страницу перерисовали — останавливаемся
      const p = Math.min(1, (now - t0) / D), e = 1 - (1 - p) ** 3;
      el.textContent = fmtVal(Math.round(from + (target - from) * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
const countAttr = (key, a) => `data-count="${key}" data-usd="${a.usd}" data-uzs="${a.uzs}"`;

/* ---- степпер: цифра проезжает вверх или вниз ---- */
function rollStepper(){
  const s = M.ui.stepAnim; M.ui.stepAnim = null;
  if (!s || REDUCED) return;
  const btn = $(`[data-act="step"][data-bind="${s.bind}"]`), num = btn?.parentElement.querySelector("span");
  num?.animate([{ transform:`translateY(${s.d > 0 ? 9 : -9}px)`, opacity:0 }, { transform:"none", opacity:1 }], { duration:200, easing:EASE_OUT });
}

/* ---- ошибка: короткое покачивание, чтобы взгляд нашёл сообщение ---- */
function shake(el){ if (REDUCED || !el) return; el.animate(
  [{ transform:"none" }, { transform:"translateX(-6px)" }, { transform:"translateX(5px)" }, { transform:"translateX(-3px)" }, { transform:"translateX(2px)" }, { transform:"none" }],
  { duration:360, easing:"ease-out" }); }

/* ---- самолёты на дугах: SMIL animateMotion, запуск после отрисовки ---- */
function launchFlights(){
  if (REDUCED) return;
  $$("animateMotion[data-go]").forEach(a => setTimeout(() => a.beginElement?.(), Number(a.dataset.go)));
}

/* ---- высота плавающей шапки: герой заходит под неё ---- */
new ResizeObserver(([e]) => document.documentElement.style.setProperty("--navh", Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.target.offsetHeight) + "px"))
  .observe(document.getElementById("nav"));
