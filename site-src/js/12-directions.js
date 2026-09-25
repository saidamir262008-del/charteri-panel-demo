/* ==========================================================================
   Направления, добавленные в админке. Каталог сайта (AIRPORTS, COORDS,
   ROUTES, RESORTS, HOTELS) собран при сборке; админка дописывает к нему свои
   направления в DIRS_KEY, а сайт, кабинет и админка вливают их при загрузке и
   при изменении в другой вкладке. Встроенные направления не трогаются.

   Направление: { iata, city:{ru,uz,en}, country:{ru,uz,en}, lat, lon, eco,
     popular, resort, hotels:[…], color:[a,b], hidden }
   eco — тариф эконом из Ташкента в одну сторону, USD, до наценки.
   ========================================================================== */
"use strict";

const DIRS_KEY = "charteri.ops.dirs";
const CRUISE_KMH = 780, TAXI_MIN = 35;           // оценка времени полёта по расстоянию
let DIRS_APPLIED = [];                           // коды, которые уже влиты: их можно убрать перед новым вливанием

function loadDirections(){ const d = readJSON(DIRS_KEY, []); return Array.isArray(d) ? d.filter(validDirection) : []; }
/* Данные из хранилища — чужие: берём только то, что прошло проверку формы. */
function validDirection(d){
  return d && /^[A-Z]{3}$/.test(d.iata) && ["ru", "uz", "en"].every(l => typeof d.city?.[l] === "string" && d.city[l].trim() && typeof d.country?.[l] === "string")
    && Number.isFinite(d.lat) && Math.abs(d.lat) <= 90 && Number.isFinite(d.lon) && Math.abs(d.lon) <= 180 && Number.isFinite(d.eco) && d.eco >= 50 && d.eco <= 5000;
}
/* Маршрут в обе стороны: время — по расстоянию, вылет утром, обратно — днём. */
function routesFor(d){
  const km = distanceKm(COORDS.TAS, [d.lat, d.lon]), dur = Math.round((km / CRUISE_KMH) * 60 + TAXI_MIN);
  const n = 100 + (seedFrom(d.iata) % 800), plane = km > 3500 ? "Boeing 787-8" : "Airbus A321neo";
  const mk = (from, to, dep, no, eco) => ({ carrier:"Uzbekistan Airways", flightNo:`HY-${no}`, plane, depTime:dep, arrTime:addMinutes(dep, dur), ecoPrice:eco, busPrice:Math.round(eco * 1.85), durationMin:dur });
  return { [`TAS-${d.iata}`]:mk("TAS", d.iata, "09:30", n * 2 + 1, Math.round(d.eco)), [`${d.iata}-TAS`]:mk(d.iata, "TAS", "15:10", n * 2 + 2, Math.round(d.eco * 0.93)) };
}
/* Отель направления — в формате каталога; незаполненное — по умолчанию. */
const BEACH_M = { beach:0, near:400, city:null };
const dirHotel = (d, h, i) => ({ id:`${d.iata.toLowerCase()}-${i + 1}`, city:d.iata, name:h.name, stars:clamp(Math.round(h.stars) || 4, 3, 5), area:h.area || "",
  board:BOARDS.includes(h.board) ? h.board : "BB", base:clamp(Math.round(h.base) || 120, 20, 5000), rating:null,
  beach:h.beach in BEACH_M ? BEACH_M[h.beach] : null, am:[...(h.beach === "beach" ? ["beach"] : []), ...(h.pool ? ["pool"] : []), "wifi"], custom:true });

function unapplyDirections(){
  const codes = new Set(DIRS_APPLIED); if (!codes.size) return;
  const drop = (arr, test) => { for (let i = arr.length - 1; i >= 0; i--) if (test(arr[i])) arr.splice(i, 1); };
  drop(AIRPORTS, a => a.custom && codes.has(a.iata)); drop(RESORTS, c => codes.has(c)); drop(HOTELS, h => h.custom && codes.has(h.city));
  drop(WORLD_BG, c => codes.has(c)); drop(BOARD_DEST, c => codes.has(c));
  for (const c of codes) { delete COORDS[c]; delete PALETTE[c]; delete ROUTES[`TAS-${c}`]; delete ROUTES[`${c}-TAS`]; }
  DIRS_APPLIED = [];
}
/* Скрытое направление пропадает из поиска и витрин, но его город и отели
   остаются в каталоге: по ним уже могут быть заказы. Вызывается при запуске
   каждого приложения — после того как объявлены все списки. */
function applyDirections(){
  unapplyDirections();
  for (const d of loadDirections()) {
    if (AIRPORTS.some(a => a.iata === d.iata)) continue;                  // встроенный код не перекрываем
    AIRPORTS.push({ iata:d.iata, city:{ ...d.city }, country:{ ...d.country }, popular:d.popular ? 90 : 40, custom:true, hidden:!!d.hidden });
    COORDS[d.iata] = [d.lat, d.lon];
    Object.assign(ROUTES, routesFor(d));
    PALETTE[d.iata] = Array.isArray(d.color) && d.color.every(c => /^#[0-9a-f]{6}$/i.test(c)) ? d.color : ["#2F6FE0", "#16275C"];
    const hotels = (d.hotels || []).filter(h => h && typeof h.name === "string" && h.name.trim());
    hotels.forEach((h, i) => HOTELS.push(dirHotel(d, h, i)));
    if (!d.hidden && d.resort && hotels.length) RESORTS.push(d.iata);
    if (!d.hidden && d.popular) { WORLD_BG.push(d.iata); BOARD_DEST.push(d.iata); }
    DIRS_APPLIED.push(d.iata);
  }
}
/* ---- доступно ли направление сейчас ---- */
const destShown = c => AIRPORTS.some(a => a.iata === c && !a.hidden);
const hotelShown = id => { const h = HOTELS.find(x => x.id === id); return !!h && RESORTS.includes(h.city); };
/* Детали брони: все её города видны, отель есть в каталоге. Вертолёт летает
   по своим площадкам (HELI_DEST), не по аэропортам. */
function detailsShown(d){
  if (!d) return true;
  if (d.hotelId && !hotelShown(d.hotelId)) return false;
  if (d.kind === "heli") return true;
  return [d.from, d.to, d.out?.from, d.out?.to, d.back?.from, d.back?.to].filter(Boolean).every(destShown);
}
/* Карта: код без координат (направление удалили) — рисуем маршрут по умолчанию. */
const safeRoute = st => st.local || (COORDS[st.from] && COORDS[st.to]) ? st : { local:false, from:"TAS", to:"IST" };

/* Выбор в формах поиска, который указывает на скрытое или удалённое
   направление, возвращается к направлению по умолчанию. Возвращает, было ли что менять. */
function sanitizeSelections(){
  let changed = false;
  const fix = (q, k, ok, def) => { if (q && q[k] && !ok(q[k])) { q[k] = def; q.searched = false; changed = true; } };
  fix(M.flights, "from", destShown, "TAS"); fix(M.flights, "to", destShown, M.flights?.from === "IST" ? "DXB" : "IST");
  fix(M.tours, "to", c => RESORTS.includes(c), "AYT"); fix(M.hotels, "city", c => RESORTS.includes(c), "AYT");
  fix(M.jet, "from", destShown, "TAS"); fix(M.jet, "to", destShown, M.jet?.from === "DXB" ? "IST" : "DXB");
  const sel = M.flights?.sel;
  if (sel?.out && !detailsShown({ out:sel.out, back:sel.back })) { M.flights.sel = { out:null, back:null }; M.flights.searched = false; changed = true; }
  if (M.checkout && !detailsShown(M.checkout.details)) { M.checkout = null; changed = true; }
  return changed;
}
/* Админка изменила направления в другой вкладке. Если человек смотрит выдачу,
   оформление или заявку по направлению, которого больше нет, — возвращаем к
   поиску с объяснением, даже если он печатает: иначе он отправил бы заявку
   не туда, куда выбирал. */
const DIR_PAGES = ["flights", "hotels", "tours", "charter", "checkout"];
window.addEventListener("storage", e => {
  if (e.key !== DIRS_KEY) return;
  applyDirections();
  if (typeof GL !== "undefined") GL.key = null;                     // карта заново расставит точки
  const changed = sanitizeSelections();
  if (!S) return;
  if (changed && DIR_PAGES.includes(currentParts()[0])) { toast(t("dir_gone")); go(SEARCH_PATH); return; }
  onExternalChange();
});
