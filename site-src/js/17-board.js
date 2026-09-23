/* ==========================================================================
   Табло вылетов на главной — как в аэропорту Ташкента (брендбук: «Board»,
   IBM Plex Mono). Табло живое: часы идут по ташкентскому времени, статус
   каждого рейса считается от текущей минуты — по расписанию, регистрация,
   посадка, выход закрыт, вылетел. Раз в минуту перещёлкиваются только те
   ячейки, где поменялся текст. Рейсы — базовые рейсы маршрутов из движка
   приложения, выход на посадку — тот же, что в посадочном талоне.
   ========================================================================== */
"use strict";

const BOARD_DEST = ["IST","DXB","AYT","JED","SSH","CXR","HKT","DME"];
const FLAP_POOL = {
  lat:"ABCDEFGHIJKLMNOPQRSTUVWXYZ", cyr:"АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ", dig:"0123456789"
};
/* Статус по минутам до вылета; вылетевший рейс висит на табло ещё полчаса. */
const FIDS = [["departed", 0], ["closed", 20], ["boarding", 50], ["checkin", 180], ["sched", Infinity]];
const DEPARTED_KEEP = 30;
const fidsStatus = m => FIDS.find(([, max]) => m <= max)[0];
const poolFor = ch => /\d/.test(ch) ? FLAP_POOL.dig : /[А-ЯЁ]/.test(ch) ? FLAP_POOL.cyr : FLAP_POOL.lat;
const flaps = (s, row, col0) => [...s].map((ch, i) =>
  `<span class="fl${ch === " " ? " fl-sp" : ""}" data-r="${row}" data-c="${col0 + i}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/* Ташкентское время: рейсы вылетают отсюда, где бы ни был посетитель. */
function tashNow(){
  const p = new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Tashkent", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date());
  const g = type => p.find(x => x.type === type).value;
  return { date:`${g("year")}-${g("month")}-${g("day")}`, min:Number(g("hour")) * 60 + Number(g("minute")) };
}
function boardRows(now){
  return BOARD_DEST.map(c => {
    const today = baseOffer("TAS", c, now.date), [h, mm] = today.depTime.split(":").map(Number);
    let m = h * 60 + mm - now.min, day = 0;
    if (m < -DEPARTED_KEEP) { m += 1440; day = 1; }
    const date = addDays(now.date, day), o = day ? baseOffer("TAS", c, date) : today;
    return { c, o, m, day, date, st:fidsStatus(m), code:o.flightNo.split("-")[0] };
  }).sort((a, b) => a.m - b.m);
}

/* Строка — кнопка. Экранному диктору — одна фраза целиком, а не буквы табло. */
const rowLabel = r => [r.o.depTime, `${r.o.flightNo} ${r.o.carrier}`, cityName(r.c), `${t("gate")} ${gateFor(r.o)}`, t("fs_" + r.st),
  priceFrom(fmt({ usd:r.o.priceUSD, uzs:r.o.priceUZS })), t("board_sub")].join(", ");
function boardRow(r, i, w){
  const name = cityName(r.c).toLocaleUpperCase(LOC[S.lang]);
  return `<button type="button" class="brd-row st-${r.st}" data-act="boardgo" data-v="${r.c}" data-d="${r.date}" data-st="${r.st}" aria-label="${esc(rowLabel(r))}">
    <span class="brd-cell brd-t" aria-hidden="true">${flaps(r.o.depTime, i, 0)}</span>
    <span class="brd-fl" aria-hidden="true">${carrierBadge(r.code, "cb-sm")}<span class="brd-cell brd-fn">${flaps(r.o.flightNo.padEnd(7, " "), i, 6)}</span></span>
    <span class="brd-cell brd-to" aria-hidden="true">${flaps(name.padEnd(w, " "), i, 14)}</span>
    <span class="brd-cell brd-gt" aria-hidden="true">${flaps(gateFor(r.o).padEnd(3, " "), i, 14 + w)}</span>
    <span class="brd-st" aria-hidden="true"><i></i><span>${esc(t("fs_" + r.st))}</span></span>
    <span class="brd-pr" aria-hidden="true"><span>${priceFrom(fmt({ usd:r.o.priceUSD, uzs:r.o.priceUZS }))}</span>${IC.chev}</span>
  </button>`;
}
const BOARD = { sig:"", timer:0 };
function boardHTML(){
  const now = tashNow(), rows = boardRows(now);
  const w = Math.max(...rows.map(r => cityName(r.c).length));
  BOARD.sig = rows.map(r => r.c + r.day).join();
  return `<div class="board" id="board" style="--w:${w}">
    <div class="brd-top">
      <span class="brd-kind"><span class="brd-kind-ic">${IC.flights}</span>${esc(t("board_dep"))}</span>
      <span class="brd-port">TAS · ${esc(cityName("TAS"))}</span>
      <span class="brd-clock" role="timer" aria-label="${esc(t("board_now"))}: ${hhmm(now.min)}"><span aria-hidden="true">${flaps(hhmm(now.min), "k", 0)}</span></span>
    </div>
    <div>
      <div class="brd-h" aria-hidden="true"><span>${esc(t("board_time"))}</span><span class="brd-fl">${esc(t("board_flight"))}</span>
        <span>${esc(t("board_to"))}</span><span class="brd-gt">${esc(t("gate"))}</span>
        <span class="brd-st">${esc(t("board_status"))}</span><span class="brd-pr">${esc(t("board_price"))}</span></div>
      ${rows.map((r, i) => (r.day && !rows[i - 1]?.day ? daySep(r.date) : "") + boardRow(r, i, w)).join("")}
    </div></div>`;
}
/* Рейсы, чей сегодняшний вылет уже прошёл, идут следом — под строкой с датой. */
const daySep = date => `<div class="brd-sep"><span>${esc(t("fs_tomorrow"))}, ${esc(fdate(date, { day:"numeric", month:"long" }))}</span></div>`;
function departureBoard(){
  return `<section class="container section">
    <div class="sec-h"><h2>${esc(t("board_title"))}</h2><p class="muted">${esc(t("board_sub"))}</p></div>
    ${boardHTML()}</section>`;
}

/* Перещёлкивание: один цикл requestAnimationFrame на все ячейки, с условием
   остановки. jobs — [{ el, final, pool, end }]. */
function flapRun(jobs, root){
  if (!jobs.length) return;
  let last = 0;
  const tick = now => {
    if (!root.isConnected) return;
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
const flapJob = (el, final, delay) => ({ el, final, pool:poolFor(final), end:performance.now() + delay });
/* Первое появление табло: щёлкают все буквы, каскадом по строкам и столбцам. */
function flapBoard(board){
  if (REDUCED || !board) return;
  flapRun($$(".brd-row .fl:not(.fl-sp)", board).map(el =>
    flapJob(el, el.textContent, 180 + Number(el.dataset.c) * 26 + Number(el.dataset.r) * 55 + Math.random() * 140)), board);
}
/* Точечная замена текста: щёлкают только изменившиеся буквы. */
function flapTo(cells, text, board){
  const jobs = [];
  [...text].forEach((ch, i) => {
    const el = cells[i]; if (!el || el.textContent === ch) return;
    if (REDUCED) el.textContent = ch; else jobs.push(flapJob(el, ch, 160 + i * 70));
  });
  flapRun(jobs, board);
}

/* На смене минуты: часы и статусы. Если порядок рейсов поменялся (рейс
   улетел и ушёл на завтра) — табло собирается заново. */
function boardTick(){
  const board = $("#board"); if (!board) return;
  const now = tashNow(), rows = boardRows(now);
  if (rows.map(r => r.c + r.day).join() !== BOARD.sig) {
    board.outerHTML = boardHTML();
    return flapBoard($("#board"));
  }
  const clock = $(".brd-clock", board);
  flapTo($$(".fl", clock), hhmm(now.min), board);
  clock.setAttribute("aria-label", `${t("board_now")}: ${hhmm(now.min)}`);
  for (const r of rows) {
    const row = $(`.brd-row[data-v="${r.c}"]`, board);
    if (!row || row.dataset.st === r.st) continue;
    row.classList.replace(`st-${row.dataset.st}`, `st-${r.st}`); row.dataset.st = r.st;
    const label = $(".brd-st span", row); label.textContent = t("fs_" + r.st);
    row.setAttribute("aria-label", rowLabel(r));
    if (!REDUCED) label.animate([{ opacity:0, transform:"translateY(-6px)" }, { opacity:1, transform:"none" }], { duration:320, easing:EASE_OUT });
  }
}
function scheduleBoardTick(){
  clearTimeout(BOARD.timer);
  BOARD.timer = setTimeout(() => { if (!$("#board")) return; boardTick(); scheduleBoardTick(); }, 60000 - Date.now() % 60000 + 40);
}
/* Табло щёлкает, когда его видно, и один раз за посещение главной. */
function armBoard(){
  const board = $("#board"); if (!board) return;
  scheduleBoardTick();
  if (M.ui.boardDone || REDUCED) return;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect(); M.ui.boardDone = true; flapBoard(board);
  }, { threshold:0.35 });
  io.observe(board);
}
/* Нажали на рейс: ищем его дату, а если регистрация уже идёт — следующий день. */
ACT.boardgo = el => {
  const d = el.dataset.st === "sched" ? el.dataset.d : addDays(el.dataset.d, 1);
  Object.assign(M.flights, { from:"TAS", to:el.dataset.v, type:"oneway", depart:d < TODAY ? TODAY : d });
  M.module = "flights"; ACT.fsearch();
};
