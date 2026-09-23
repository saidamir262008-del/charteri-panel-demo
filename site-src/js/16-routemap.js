/* ==========================================================================
   Маршрут из формы поиска на карте в шапке главной. Основная карта —
   настоящая (18-glmap.js). Здесь — общее состояние маршрута и запасная
   SVG-схема на случай, если WebGL или картографический сервис недоступны.
   Самолёт — фирменный силуэт, нос по направлению полёта (брендбук).
   ========================================================================== */
"use strict";

const MAP_W = 600, MAP_H = 340;
const WORLD = { lat0:4, lat1:58, lon0:24, lon1:114 };
const LOCAL = { lat0:39.25, lat1:42.15, lon0:66.3, lon1:70.9 };
const WORLD_BG = ["IST","AYT","DXB","SSH","JED","SHJ","CXR","HKT","DME"];

function mapState(){
  if (M.module === "heli") return { local:true, from:"TAS", to:M.heli.to };
  const r = { flights:[M.flights.from, M.flights.to], tours:["TAS", M.tours.to], hotels:["TAS", M.hotels.city], jet:[M.jet.from, M.jet.to] }[M.module];
  return { local:false, from:r[0], to:r[1] };
}
function mapAria(){
  const st = mapState();
  if (!st.local) return tf("map_aria", { a:cityName(st.from), b:cityName(st.to) });
  return HELI_DEST.find(d => d.id === st.to)?.tour ? heliName(st.to) : tf("map_aria", { a:t("heli_base").split(",")[0], b:heliName(st.to) });
}
/* Рамка карты растягивается, чтобы вместить любой выбранный аэропорт. */
function mapBounds(points, base){
  const b = { ...base };
  for (const [la, lo] of points) {
    b.lat0 = Math.min(b.lat0, la - 3); b.lat1 = Math.max(b.lat1, la + 3);
    b.lon0 = Math.min(b.lon0, lo - 5); b.lon1 = Math.max(b.lon1, lo + 5);
  }
  return b;
}
const project = (b, [la, lo]) => [(lo - b.lon0) / (b.lon1 - b.lon0) * MAP_W, (b.lat1 - la) / (b.lat1 - b.lat0) * MAP_H];
/* Дуга выгибается к северу — так выглядят маршруты по большому кругу. */
function arc([x1, y1], [x2, y2]){
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / d, ny = (x2 - x1) / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const k = Math.min(95, d * 0.3), cx = (x1 + x2) / 2 + nx * k, cy = (y1 + y2) / 2 + ny * k;
  return { d:`M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    end:[x2, y2], angle: Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI };
}
/* Обзорный полёт — петля над городом с возвращением на площадку. */
function loop([x, y]){
  return { d:`M${x} ${y} C${x + 70} ${y - 90} ${x + 190} ${y - 40} ${x + 120} ${y + 24} S${x + 10} ${y + 40} ${x} ${y}`,
    end:[x, y], angle:-150 };
}
function mapLabel([x, y], text, cls){
  const right = x > MAP_W - 130;
  return `<text class="${cls}" x="${(x + (right ? -12 : 12)).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${right ? "end" : "start"}">${esc(text)}</text>`;
}

/* Запасная схема: без подложки, только дуги и точки. */
function routeSvg(){
  const st = mapState(), key = `${M.module}:${st.from}-${st.to}`;
  const animate = !REDUCED && M.ui.mapKey !== key, first = !REDUCED && M.ui.mapKey == null;
  M.ui.mapKey = key;

  let b, pts, route, labels;
  if (st.local) {
    const dests = HELI_DEST.filter(d => d.coord);
    b = LOCAL; const home = project(b, HELI_BASE);
    const sel = HELI_DEST.find(d => d.id === st.to);
    pts = dests.map(d => ({ id:d.id, p:project(b, d.coord), name:d.name[S.lang] }));
    route = sel.tour ? loop(home) : arc(home, project(b, sel.coord));
    labels = mapLabel(home, t("heli_base").split(",")[0], "m-lbl m-lbl-home")
      + pts.filter(x => x.id === st.to).map(x => mapLabel(x.p, x.name, "m-lbl")).join("");
    pts = [{ id:"home", p:home }, ...pts];
  } else {
    const from = COORDS[st.from], to = COORDS[st.to];
    b = mapBounds([from, to], WORLD);
    const bg = [...new Set([...WORLD_BG, st.from, st.to])];
    pts = bg.map(c => ({ id:c, p:project(b, COORDS[c]) }));
    route = arc(project(b, from), project(b, to));
    labels = mapLabel(project(b, from), cityName(st.from), "m-lbl m-lbl-home") + mapLabel(route.end, cityName(st.to), "m-lbl");
  }
  const hub = st.local ? project(b, HELI_BASE) : project(b, COORDS["TAS"]);
  const bgArcs = pts.filter(x => x.id !== "home" && x.id !== "TAS").map((x, i) =>
    `<path class="m-bg" style="--i:${i}" d="${arc(hub, x.p).d}"/>`).join("");
  const dots = pts.map(x => { const sel = x.id === st.to || x.id === st.from || x.id === "home";
    return `<circle class="m-dot ${sel ? "m-dot-on" : ""}" cx="${x.p[0].toFixed(1)}" cy="${x.p[1].toFixed(1)}" r="${sel ? 4.5 : 3}"/>`; }).join("");
  const [ex, ey] = route.end;
  return `<svg class="rmap ${animate ? "anim" : ""} ${first ? "first" : ""}" viewBox="0 0 ${MAP_W} ${MAP_H}" aria-hidden="true">
    <defs>
      <pattern id="mdots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#fff"/></pattern>
      <radialGradient id="mfade" cx="55%" cy="45%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <mask id="mmask"><rect width="${MAP_W}" height="${MAP_H}" fill="url(#mfade)"/></mask>
    </defs>
    <rect width="${MAP_W}" height="${MAP_H}" fill="url(#mdots)" opacity=".15" mask="url(#mmask)"/>
    <g>${bgArcs}</g>
    <path class="m-glow" d="${route.d}" pathLength="1"/>
    <path id="mroute" class="m-route" d="${route.d}" pathLength="1"/>
    ${dots}
    <circle class="m-ping" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="6"/>
    ${labels}
    <g class="m-plane" ${animate ? 'opacity="0"' : `transform="translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${route.angle.toFixed(1)})"`}>
      <g transform="rotate(90) scale(.95) translate(-12 -12)"><path d="${PLANE_PATH}"/></g>
      ${animate ? `<animateMotion id="mfly" data-go="330" dur="0.9s" begin="indefinite" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.65 0 0.35 1"><mpath href="#mroute"/></animateMotion>
        <set attributeName="opacity" to="1" begin="mfly.begin" fill="freeze"/>` : ""}
    </g>
  </svg>`;
}

/* Дуга в деталях рейса: самолёт летит к вершине и остаётся там (брендбук).
   Время SMIL у встроенного SVG идёт от загрузки документа, поэтому видимость
   привязана к началу полёта (id.begin), а не к абсолютной задержке. */
let arcSeq = 0;
function arcTrack(animate, delay = 0){
  const id = "ta" + (++arcSeq);
  return `<svg class="tarc" viewBox="0 0 200 46" aria-hidden="true">
    <path class="ta-path" d="M8 40 Q100 -6 192 40"/>
    <circle class="ta-end" cx="8" cy="40" r="3"/><circle class="ta-end" cx="192" cy="40" r="3"/>
    <g class="ta-plane" ${animate ? 'opacity="0"' : 'transform="translate(100 17)"'}>
      <g transform="rotate(90) scale(.72) translate(-12 -12)"><path d="${PLANE_PATH}"/></g>
      ${animate ? `<animateMotion id="${id}" data-go="${140 + delay}" dur="0.9s" begin="indefinite" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;0.5" keyTimes="0;1" keySplines="0.33 0 0.2 1" path="M8 40 Q100 -6 192 40"/>
        <set attributeName="opacity" to="1" begin="${id}.begin" fill="freeze"/>` : ""}
    </g></svg>`;
}
