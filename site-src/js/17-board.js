/* ==========================================================================
   Табло вылетов на главной — «Board» из брендбука (IBM Plex Mono).
   Рейсы настоящие: базовые рейсы маршрутов из движка приложения на завтра.
   Перекидные буквы щёлкают один раз, когда табло попадает в поле зрения;
   до и после этого — конечный текст, так что страница читается и без анимации.
   ========================================================================== */
"use strict";

const BOARD_DEST = ["IST","DXB","AYT","JED","SSH","CXR","HKT","DME"];
const FLAP_POOL = {
  lat:"ABCDEFGHIJKLMNOPQRSTUVWXYZ", cyr:"АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ", dig:"0123456789"
};
const poolFor = ch => /\d/.test(ch) ? FLAP_POOL.dig : /[А-ЯЁ]/.test(ch) ? FLAP_POOL.cyr : FLAP_POOL.lat;
const flaps = (s, row, col0) => [...s].map((ch, i) =>
  `<span class="fl${ch === " " ? " fl-sp" : ""}" data-r="${row}" data-c="${col0 + i}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");

function boardRows(){
  const d = addDays(TODAY, 1);
  return BOARD_DEST.map(c => ({ c, o:baseOffer("TAS", c, d) })).sort((a, b) => a.o.depTime.localeCompare(b.o.depTime));
}
function departureBoard(){
  const rows = boardRows(), locale = LOC[S.lang];
  const names = rows.map(r => cityName(r.c).toLocaleUpperCase(locale));
  const w = Math.max(...names.map(n => n.length));
  return `<section class="container section">
    <div class="sec-h"><h2>${esc(t("board_title"))}</h2><p class="muted">${esc(t("board_sub"))}</p></div>
    <div class="board" id="board" role="table" aria-label="${esc(t("board_title"))}">
      <div class="brd-h" role="row"><span role="columnheader">${esc(t("board_time"))}</span><span role="columnheader" class="brd-fn">${esc(t("board_flight"))}</span>
        <span role="columnheader">${esc(t("board_to"))}</span><span role="columnheader" class="brd-pr">${esc(t("board_price"))}</span></div>
      ${rows.map((r, i) => `<button type="button" class="brd-row" role="row" data-act="boardgo" data-v="${r.c}">
        <span class="brd-cell" role="cell">${flaps(r.o.depTime, i, 0)}</span>
        <span class="brd-cell brd-fn" role="cell">${flaps(r.o.flightNo.padEnd(7, " "), i, 6)}</span>
        <span class="brd-cell" role="cell">${flaps(names[i].padEnd(w, " "), i, 14)}</span>
        <span class="brd-pr" role="cell">${priceFrom(fmt({ usd:r.o.priceUSD, uzs:r.o.priceUZS }))}</span>
      </button>`).join("")}
    </div></section>`;
}
/* Один цикл requestAnimationFrame на всё табло, с условием остановки. */
function flapBoard(board){
  if (REDUCED || !board) return;
  const t0 = performance.now();
  const jobs = [...board.querySelectorAll(".fl:not(.fl-sp)")].map(el => ({
    el, final:el.textContent, pool:poolFor(el.textContent),
    end: t0 + 180 + Number(el.dataset.c) * 26 + Number(el.dataset.r) * 55 + Math.random() * 140 }));
  let last = 0;
  const tick = now => {
    if (!board.isConnected) return;
    if (now - last >= 50) {
      last = now; let busy = false;
      for (const j of jobs) {
        if (j.done) continue;
        if (now >= j.end) { j.el.textContent = j.final; j.done = true; }
        else { busy = true; j.el.textContent = j.pool[Math.floor(Math.random() * j.pool.length)]; }
      }
      if (!busy) return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/* Табло щёлкает, когда его видно, и один раз за посещение главной. */
function armBoard(){
  const board = $("#board"); if (!board || M.ui.boardDone || REDUCED) return;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect(); M.ui.boardDone = true; flapBoard(board);
  }, { threshold:0.35 });
  io.observe(board);
}
ACT.boardgo = el => {
  Object.assign(M.flights, { from:"TAS", to:el.dataset.v, type:"oneway", depart:addDays(TODAY, 1) });
  M.module = "flights"; ACT.fsearch();
};
