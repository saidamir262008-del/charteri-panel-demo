/* ==========================================================================
   Настоящая карта в шапке главной: MapLibre GL + векторные тайлы OpenFreeMap
   (данные OpenStreetMap) и рельеф Natural Earth, в фирменном тёмно-синем.

   Карта одна на всё время жизни страницы. Сайт перерисовывает страницу через
   innerHTML, поэтому узел карты живёт отдельно и после каждой отрисовки
   переставляется в новую «док»-обёртку героя — WebGL-контекст и загруженные
   тайлы при этом сохраняются.

   Смена маршрута: камера перелетает к новому маршруту, затем линия
   прорисовывается, и по ней летит самолёт (дуга большого круга — так летают
   настоящие рейсы). Для вертолётов камера опускается к Ташкентской области.
   Если WebGL или сервис карт недоступны — показывается схема из 16-routemap.js.
   ========================================================================== */
"use strict";

const GL_BASE = CONFIG.map.lib;                                          // адреса карты — в 00-config.js
const GL_TIMEOUT = 15000;                 // библиотека не загрузилась за это время — запасная схема
const TILES_WAIT = 8000;                  // тайлы медленные — показываем карту и маршрут, подложка догрузится
const FLY_MS = 1150;                      // полёт самолёта по линии
const MAPC = {
  land:"#1C2F6E", water:"#122254", border:"rgba(150,182,255,.42)", cover:"#26418A",
  road:"rgba(200,218,255,.13)", glow:"rgba(140,182,255,.5)", halo:"rgba(14,26,72,.75)",
  country:"rgba(196,212,250,.4)", sea:"rgba(128,162,236,.62)", city:"rgba(228,236,255,.74)", port:"rgba(226,234,255,.68)"
};
const EMPTY = { type:"FeatureCollection", features:[] };
/* Маркеры смотрят носом вверх — как PLANE_PATH; поворот задаёт MapLibre.
   Вертолёт — вид сверху, несущий винт вращается, пока он в полёте. */
const PLANE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PLANE_PATH}"/></svg>`;
const HELI_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="9.5" rx="3.1" ry="4.6"/><rect x="11.25" y="12.5" width="1.5" height="8" rx=".75"/>
  <rect x="9.2" y="19.4" width="5.6" height="1.5" rx=".75"/><g class="rotor"><rect x="1.5" y="8.8" width="21" height="1.4" rx=".7"/><rect x="11.3" y="-1" width="1.4" height="21" rx=".7"/></g></svg>`;
/* state: idle → loading → script → ready; при ошибке — failed */
const GL = { state:"idle", map:null, el:null, key:null, lang:null, geo:null, seq:0, raf:0, pills:[], plane:null, ping:null };

/* ---- геометрия маршрута ---- */
const R = Math.PI / 180;
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * R / 2));
const ll = ([lat, lon]) => [lon, lat];                           // COORDS хранит [широта, долгота]
/* Дуга большого круга, точками [долгота, широта]. */
function gcLine(a, b, n = 96){
  const [p1, l1, p2, l2] = [a[0] * R, a[1] * R, b[0] * R, b[1] * R];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6) return [ll(a), ll(b)];
  return Array.from({ length:n + 1 }, (_, i) => {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    return [Math.atan2(y, x) / R, Math.atan2(z, Math.hypot(x, y)) / R];
  });
}
/* Короткий вертолётный перелёт: мягкая дуга, выгнутая к северу. */
function bowLine(a, b, n = 48){
  const [x1, y1, x2, y2] = [a[1], a[0], b[1], b[0]], k = Math.cos(y1 * R);
  let nx = -(y2 - y1), ny = (x2 - x1) * k;                         // нормаль в «квадратных» координатах
  const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const d = Math.hypot((x2 - x1) * k, y2 - y1) * 0.22, cx = (x1 + x2) / 2 + nx * d / k, cy = (y1 + y2) / 2 + ny * d;
  return Array.from({ length:n + 1 }, (_, i) => { const f = i / n, g = 1 - f;
    return [g * g * x1 + 2 * g * f * cx + f * f * x2, g * g * y1 + 2 * g * f * cy + f * f * y2]; });
}
/* Обзорный полёт: круг над городом с возвращением на площадку. */
function loopLine([lat, lon], n = 72){
  const r = 0.075, k = Math.cos(lat * R), c = [lon + r * 0.7 / k, lat + r * 0.7];
  const a0 = Math.atan2(lat - c[1], (lon - c[0]) * k);
  return Array.from({ length:n + 1 }, (_, i) => { const a = a0 - (i / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r / k, c[1] + Math.sin(a) * r]; });
}
/* Положение на линии по доле пути. Расстояния — в проекции Меркатора,
   как у line-progress, чтобы самолёт шёл ровно по кромке прорисовки. */
function pathAt(line){
  const acc = [0];
  for (let i = 1; i < line.length; i++)
    acc.push(acc[i - 1] + Math.hypot((line[i][0] - line[i - 1][0]) * R, mercY(line[i][1]) - mercY(line[i - 1][1])));
  const L = acc[acc.length - 1] || 1;
  return p => {
    const d = clamp(p, 0, 1) * L; let i = 1;
    while (i < acc.length - 1 && acc[i] < d) i++;
    const f = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1), a = line[i - 1], b = line[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
}
const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

/* Что показать для текущего модуля и формы. */
function glGeo(){
  const st = mapState();
  if (st.local) {
    const sel = HELI_DEST.find(d => d.id === st.to), home = { ll:ll(HELI_BASE), code:"", name:t("heli_base").split(",")[0] };
    return { key:`heli:${st.to}`, local:true, home,
      line: sel.tour ? loopLine(HELI_BASE) : bowLine(HELI_BASE, sel.coord),
      dest: sel.tour ? null : { ll:ll(sel.coord), code:"", name:heliName(st.to) },
      ports: HELI_DEST.filter(d => d.coord && d.id !== st.to).map(d => ({ id:d.id, ll:ll(d.coord), n:d.name[S.lang] })),
      maxZoom: sel.tour ? 10.6 : 9.6, minSpan: 0.35 };
  }
  /* Туры и отели — точки только курортов: на карте выбирают из того же списка, что в форме. */
  const bg = (["tours", "hotels"].includes(M.module) ? RESORTS : WORLD_BG).filter(c => c !== st.from && c !== st.to);
  return { key:`${M.module}:${st.from}-${st.to}`, local:false,
    home:{ ll:ll(COORDS[st.from]), code:st.from, name:cityName(st.from) },
    dest:{ ll:ll(COORDS[st.to]), code:st.to, name:cityName(st.to) },
    line: gcLine(COORDS[st.from], COORDS[st.to]),
    ports: bg.map(c => ({ id:c, ll:ll(COORDS[c]), n:cityName(c) })), maxZoom: 5.4, minSpan: 7 };
}
/* Рамка маршрута с полями — чтобы вокруг была узнаваемая география. */
function glBounds(g){
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  for (const [x, y] of g.line) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const mx = Math.max((x1 - x0) * 0.12, (g.minSpan - (x1 - x0)) / 2, 0), my = Math.max((y1 - y0) * 0.12, (g.minSpan * 0.6 - (y1 - y0)) / 2, 0);
  return [[x0 - mx, y0 - my], [x1 + mx, y1 + my]];
}
/* Где на карте свободно от текста: правая колонка героя на широком
   экране, полоса над заголовком на узком. Остальное закрыто текстом. */
function glPadding(){
  const box = GL.el?.isConnected ? GL.el : $(".hero"), frame = $("#mapframe");
  if (!box || !frame) return 40;
  const H = box.getBoundingClientRect(), F = frame.getBoundingClientRect();
  const p = { top:F.top - H.top, left:F.left - H.left, right:H.right - F.right, bottom:H.bottom - F.bottom };
  for (const k in p) p[k] = Math.max(18, Math.round(p[k]) + 18);
  return p;
}

/* Свободное поле в координатах карты — туда можно ставить подписи. */
function glFrameBox(){
  const frame = $("#mapframe");
  if (!frame || !GL.el?.isConnected) return { x0:0, y0:0, x1:GL.el?.clientWidth || 0, y1:GL.el?.clientHeight || 0 };
  const H = GL.el.getBoundingClientRect(), F = frame.getBoundingClientRect();
  return { x0:F.left - H.left, y0:F.top - H.top, x1:F.right - H.left, y1:F.bottom - H.top };
}

/* ---- стиль карты ---- */
/* Узбекских названий в тайлах нет (name:uz не выгружается), а name:latin — это
   местное написание: DEUTSCHLAND, ESPAÑA. Для стран и морей — свой словарь
   по английскому имени, для остального — латиница. */
const UZ_GEO = ["match", ["get", "name:en"], "Uzbekistan", "Oʻzbekiston", "Kazakhstan", "Qozogʻiston", "Kyrgyzstan", "Qirgʻiziston", "Tajikistan", "Tojikiston", "Turkmenistan", "Turkmaniston", "Afghanistan", "Afgʻoniston", "Iran", "Eron", "Pakistan", "Pokiston", "India", "Hindiston", "China", "Xitoy", "Mongolia", "Moʻgʻuliston", "Russia", "Rossiya", "Turkey", "Turkiya", "Türkiye", "Turkiya", "Azerbaijan", "Ozarbayjon", "Armenia", "Armaniston", "Georgia", "Gruziya", "Ukraine", "Ukraina", "Belarus", "Belarus", "Moldova", "Moldova", "Romania", "Ruminiya", "Bulgaria", "Bolgariya", "Greece", "Gretsiya", "Serbia", "Serbiya", "Hungary", "Vengriya", "Poland", "Polsha", "Germany", "Germaniya", "Austria", "Avstriya", "Czechia", "Chexiya", "Slovakia", "Slovakiya", "Italy", "Italiya", "France", "Fransiya", "Spain", "Ispaniya", "Portugal", "Portugaliya", "Switzerland", "Shveytsariya", "Netherlands", "Niderlandiya", "Belgium", "Belgiya", "Ireland", "Irlandiya", "United Kingdom", "Buyuk Britaniya", "Sweden", "Shvetsiya", "Norway", "Norvegiya", "Finland", "Finlandiya", "Denmark", "Daniya", "Lithuania", "Litva", "Latvia", "Latviya", "Estonia", "Estoniya", "Croatia", "Xorvatiya", "Bosnia and Herzegovina", "Bosniya va Gersegovina", "Albania", "Albaniya", "North Macedonia", "Shimoliy Makedoniya", "Montenegro", "Chernogoriya", "Syria", "Suriya", "Iraq", "Iroq", "Israel", "Isroil", "Jordan", "Iordaniya", "Lebanon", "Livan", "Cyprus", "Kipr", "Saudi Arabia", "Saudiya Arabistoni", "United Arab Emirates", "BAA", "Qatar", "Qatar", "Kuwait", "Quvayt", "Bahrain", "Bahrayn", "Oman", "Ummon", "Yemen", "Yaman", "Egypt", "Misr", "Libya", "Liviya", "Sudan", "Sudan", "South Sudan", "Janubiy Sudan", "Ethiopia", "Efiopiya", "Eritrea", "Eritreya", "Somalia", "Somali", "Kenya", "Keniya", "Chad", "Chad", "Tunisia", "Tunis", "Algeria", "Jazoir", "Morocco", "Marokash", "Niger", "Niger", "Mali", "Mali", "Nigeria", "Nigeriya", "Uganda", "Uganda", "Tanzania", "Tanzaniya", "Nepal", "Nepal", "Bhutan", "Butan", "Bangladesh", "Bangladesh", "Sri Lanka", "Shri-Lanka", "Myanmar", "Myanma", "Thailand", "Tailand", "Laos", "Laos", "Vietnam", "Vyetnam", "Cambodia", "Kambodja", "Malaysia", "Malayziya", "Indonesia", "Indoneziya", "Philippines", "Filippin", "Japan", "Yaponiya", "South Korea", "Janubiy Koreya", "North Korea", "Shimoliy Koreya", "Taiwan", "Tayvan", "Black Sea", "Qora dengiz", "Caspian Sea", "Kaspiy dengizi", "Mediterranean Sea", "Oʻrta yer dengizi", "Red Sea", "Qizil dengiz", "Arabian Sea", "Arab dengizi", "Persian Gulf", "Fors koʻrfazi", "Gulf of Oman", "Ummon koʻrfazi", "Gulf of Aden", "Aden koʻrfazi", "Aral Sea", "Orol dengizi", "Sea of Azov", "Azov dengizi", "Bay of Bengal", "Bengal koʻrfazi", "Andaman Sea", "Andaman dengizi", "South China Sea", "Janubiy Xitoy dengizi", "Indian Ocean", "Hind okeani", "Aegean Sea", "Egey dengizi", "Adriatic Sea", "Adriatika dengizi", "Ionian Sea", "Ion dengizi", "Tyrrhenian Sea", "Tirren dengizi", "Sea of Marmara", "Marmar dengizi", "Baltic Sea", "Boltiq dengizi", "North Sea", "Shimoliy dengiz", "Laccadive Sea", "Lakkadiv dengizi", "Gulf of Thailand", "Tailand koʻrfazi", "Yellow Sea", "Sariq dengiz", "East China Sea", "Sharqiy Xitoy dengizi", "Sea of Japan", "Yapon dengizi", "Philippine Sea", "Filippin dengizi", "Lake Balkhash", "Balxash koʻli", "Issyk-Kul", "Issiqkoʻl", ["coalesce", ["get", "name:latin"], ["get", "name"]]];
const glName = () => S.lang === "uz" ? UZ_GEO : ["coalesce", ["get", "name:" + S.lang], ["get", "name:latin"], ["get", "name"]];
const LABEL_LAYERS = ["l-sea", "l-sea-line", "l-country", "l-city", "l-town", "l-village", "l-peak"];
const grad = (p, c) => ["step", ["line-progress"], c, Math.max(1e-4, Math.min(1, p)), "rgba(0,0,0,0)"];
function glStyle(){
  const nm = glName(), zi = (...s) => ["interpolate", ["linear"], ["zoom"], ...s];
  const lbl = (id, layer, filter, minzoom, font, size, color, extra = {}) => ({ id, type:"symbol", source:"omt", "source-layer":layer, minzoom, filter,
    layout:{ "text-field":nm, "text-font":[font], "text-size":size, "text-max-width":8, ...extra.layout },
    paint:{ "text-color":color, "text-halo-color":MAPC.halo, "text-halo-width":extra.halo ?? 0 } });
  return { version:8, glyphs:CONFIG.map.glyphs,
    sources:{
      omt:{ type:"vector", url:CONFIG.map.tiles },
      /* 512: каждый тайл рельефа растягивается вдвое — при прозрачности 25–50 %
         разницы не видно, а загрузка меньше вчетверо. */
      relief:{ type:"raster", tiles:[CONFIG.map.relief], tileSize:512, maxzoom:6 },
      route:{ type:"geojson", data:EMPTY, lineMetrics:true },
      ports:{ type:"geojson", data:EMPTY },
      ends:{ type:"geojson", data:EMPTY } },
    layers:[
      { id:"bg", type:"background", paint:{ "background-color":MAPC.land } },
      { id:"relief", type:"raster", source:"relief", paint:{ "raster-opacity":zi(2, .5, 6, .42, 9, .26), "raster-saturation":-1,
        "raster-contrast":.35, "raster-brightness-min":.02, "raster-brightness-max":.5, "raster-fade-duration":0 } },
      { id:"cover", type:"fill", source:"omt", "source-layer":"landcover", minzoom:6, filter:["match", ["get", "class"], ["wood", "forest"], true, false],
        paint:{ "fill-color":MAPC.cover, "fill-opacity":.35 } },
      { id:"water", type:"fill", source:"omt", "source-layer":"water", filter:["!=", ["get", "brunnel"], "tunnel"], paint:{ "fill-color":MAPC.water } },
      { id:"river", type:"line", source:"omt", "source-layer":"waterway", minzoom:6, filter:["==", ["get", "class"], "river"],
        paint:{ "line-color":MAPC.water, "line-width":zi(6, .7, 10, 1.8) } },
      { id:"roads", type:"line", source:"omt", "source-layer":"transportation", minzoom:6.5,
        filter:["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false], paint:{ "line-color":MAPC.road, "line-width":zi(6.5, .5, 10, 1.4) } },
      { id:"border", type:"line", source:"omt", "source-layer":"boundary", filter:["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        layout:{ "line-join":"round" }, paint:{ "line-color":MAPC.border, "line-width":zi(2, .6, 8, 1.3) } },
      lbl("l-sea", "water_name", ["==", ["geometry-type"], "Point"], 0, "Noto Sans Italic", zi(2, 10, 6, 13), MAPC.sea, { layout:{ "text-letter-spacing":.08 } }),
      lbl("l-sea-line", "water_name", ["==", ["geometry-type"], "LineString"], 0, "Noto Sans Italic", 12, MAPC.sea, { layout:{ "symbol-placement":"line", "text-letter-spacing":.08 } }),
      lbl("l-country", "place", ["all", ["==", ["get", "class"], "country"], ["<=", ["get", "rank"], 2]], 0, "Noto Sans Bold", zi(2, 9, 5, 12, 8, 14), MAPC.country,
        { layout:{ "text-transform":"uppercase", "text-letter-spacing":.16 } }),
      lbl("l-city", "place", ["==", ["get", "class"], "city"], 5.6, "Noto Sans Regular", zi(5.6, 11, 10, 14), MAPC.city, { halo:1 }),
      lbl("l-town", "place", ["==", ["get", "class"], "town"], 8, "Noto Sans Regular", 11.5, MAPC.city, { halo:1 }),
      lbl("l-village", "place", ["==", ["get", "class"], "village"], 9.6, "Noto Sans Regular", 10.5, MAPC.country, { halo:1 }),
      lbl("l-peak", "mountain_peak", ["has", "ele"], 8.2, "Noto Sans Italic", 10.5, MAPC.country,
        { halo:1, layout:{ "symbol-sort-key":["-", 0, ["to-number", ["get", "ele"], 0]] } }),
      { id:"ports-hit", type:"circle", source:"ports", paint:{ "circle-radius":16, "circle-color":"#fff", "circle-opacity":0 } },
      { id:"ports-dot", type:"circle", source:"ports", paint:{ "circle-radius":2.8, "circle-color":"rgba(255,255,255,.55)" } },
      { id:"ports-lbl", type:"symbol", source:"ports",
        layout:{ "text-field":["get", "n"], "text-font":["Noto Sans Regular"], "text-size":11.5, "text-anchor":["get", "a"], "text-offset":["get", "o"], "text-optional":true },
        paint:{ "text-color":MAPC.port, "text-halo-color":MAPC.halo, "text-halo-width":1.2 } },
      { id:"route-glow", type:"line", source:"route", layout:{ "line-cap":"round", "line-join":"round" },
        paint:{ "line-width":10, "line-blur":8, "line-gradient":grad(0, MAPC.glow) } },
      { id:"route-line", type:"line", source:"route", layout:{ "line-cap":"round", "line-join":"round" },
        paint:{ "line-width":2.6, "line-gradient":grad(0, "#fff") } },
      { id:"ends", type:"circle", source:"ends", paint:{ "circle-radius":4.6, "circle-color":"#fff", "circle-stroke-width":5, "circle-stroke-color":"rgba(160,196,255,.32)" } },
      /* Невидимые «заглушки» под подписями-пилюлями и точками. Подписи —
         HTML-маркеры и в расстановке подписей карты не участвуют; заглушки —
         верхний слой, их ставят первыми, и подписи подложки под пилюлями
         (например, второе «Ташкент») не рисуются. */
      { id:"block-dot", type:"symbol", source:"ends", layout:{ "text-field":"OO", "text-font":["Noto Sans Bold"], "text-size":14, "text-allow-overlap":true },
        paint:{ "text-opacity":0 } },
      { id:"block-pill", type:"symbol", source:"ends", filter:["has", "t"],
        layout:{ "text-field":["get", "t"], "text-font":["Noto Sans Bold"], "text-size":14, "text-anchor":["get", "a"], "text-offset":["get", "o"],
          "text-allow-overlap":true, "text-padding":6 }, paint:{ "text-opacity":0 } }
    ] };
}

/* ---- загрузка ---- */
function loadGL(){
  GL.state = "loading";
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return glFail();
  const css = Object.assign(document.createElement("link"), { rel:"stylesheet", href:GL_BASE + "maplibre-gl.css" });
  const js = Object.assign(document.createElement("script"), { src:GL_BASE + "maplibre-gl.js", async:true });
  js.onload = () => {
    if (GL.state !== "loading") return;          // уже показали запасную схему — не рисуем вторую карту поверх
    GL.state = "script"; const dock = $("#mapdock"); if (dock) glCreate(dock);
  };
  js.onerror = glFail;
  document.head.append(css, js);
  setTimeout(() => { if (GL.state === "loading") glFail(); }, GL_TIMEOUT);
}
function glFail(){
  if (GL.state === "failed") return;
  GL.state = "failed";
  try { GL.map?.remove(); } catch (e) {}
  GL.el?.remove(); GL.map = GL.el = null;
  if (!currentParts().length) rerender();
}
function glCreate(dock){
  GL.el = Object.assign(document.createElement("div"), { className:"glmap" });
  dock.append(GL.el);
  const g = glGeo();
  let map;
  try {
    map = new maplibregl.Map({ container:GL.el, style:glStyle(), attributionControl:false,
      dragPan:false, scrollZoom:false, boxZoom:false, dragRotate:false, keyboard:false, doubleClickZoom:false, touchZoomRotate:false, touchPitch:false,
      bounds:glBounds(g), fitBoundsOptions:{ padding:glPadding(), maxZoom:g.maxZoom }, renderWorldCopies:false,
      fadeDuration:180, pixelRatio:Math.min(window.devicePixelRatio || 1, 2) });
  } catch (e) { return glFail(); }
  GL.map = map;
  map.on("error", () => {});              // отдельный недогруженный тайл — не повод шуметь в консоли
  /* Карта в герое — картинка, а не виджет: с клавиатуры до неё доходить не нужно,
     направление выбирается в форме поиска. */
  const cv = map.getCanvas();
  cv.tabIndex = -1; cv.removeAttribute("role"); cv.removeAttribute("aria-label");
  for (const id of ["ports-hit", "ports-lbl"]) {
    map.on("click", id, e => glPick(e.features[0]?.properties.id));
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
  const ready = () => {
    if (GL.state === "ready" || GL.map !== map || !map.getSource("route")) return;
    /* Сервис карт недоступен или так медленен, что за TILES_WAIT не пришло ни
       одного тайла подложки, — показываем запасную схему, а не пустой синий фон. */
    const hasBase = ["water", "boundary", "place"].some(l => map.querySourceFeatures("omt", { sourceLayer:l }).length);
    if (!hasBase) return glFail();
    GL.state = "ready";
    GL.el.classList.add("on");
    $("#mapframe")?.classList.add("gl-on");
    glUpdate(true);
  };
  map.once("load", ready);
  setTimeout(ready, TILES_WAIT);
}

/* ---- маркеры: подписи точек, самолёт, круг прибытия ----
   Подпись ставится с той стороны точки, куда не уходит линия, и не
   вылезает за край карты. Ставится после того, как камера встала. */
const PILL_OFFSET = { left:[13, 0], right:[-13, 0], top:[0, 11], bottom:[0, -11] };
const EDGE = 10;                                                              // отступ подписи от края свободного поля
const pillWidth = p => 22 + (p.code ? 34 : 0) + p.name.length * 8.2;         // оценка до вставки в DOM
/* Сторона — прочь от линии; не помещается в свободное поле — на другую сторону
   или над/под точкой, а центрированную подпись сдвигаем внутрь поля. */
function pillPlace(p, next){
  const ox = -(next[0] - p[0]) * Math.cos(p[1] * R), oy = next[1] - p[1];     // y экрана — вниз
  const vert = oy > 0 ? "top" : "bottom", f = glFrameBox(), x = GL.map.project(p.ll).x, w = pillWidth(p);
  const fitsR = x + 13 + w <= f.x1 - EDGE, fitsL = x - 13 - w >= f.x0 + EDGE;
  let a = Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? "left" : "right") : vert;
  if (a === "left" && !fitsR) a = fitsL && Math.abs(ox) > Math.abs(oy) * 2 ? "right" : vert;
  else if (a === "right" && !fitsL) a = fitsR && Math.abs(ox) > Math.abs(oy) * 2 ? "left" : vert;
  const off = [...PILL_OFFSET[a]];
  if (a === "top" || a === "bottom") off[0] = clamp(0, f.x0 + EDGE - (x - w / 2), f.x1 - EDGE - (x + w / 2));
  return { a, off };
}
function glPill(p, place, home){
  const el = document.createElement("div");
  el.className = "gl-pill" + (home ? " gl-home" : "");
  el.innerHTML = `${p.code ? `<b class="mono">${esc(p.code)}</b>` : ""}<span>${esc(p.name)}</span>`;
  return new maplibregl.Marker({ element:el, anchor:place.a, offset:place.off }).setLngLat(p.ll).addTo(GL.map);
}
const BLOCK_OFFSET = { left:[1.2, 0], right:[-1.2, 0], top:[0, .95], bottom:[0, -.95] };
function glMarkers(g){
  GL.pills.forEach(m => m.remove());
  const n = g.line.length, ends = [[g.home, g.line[Math.min(6, n - 1)]], ...(g.dest ? [[g.dest, g.line[Math.max(0, n - 7)]]] : [])];
  const places = ends.map(([p, next]) => pillPlace(p, next));
  GL.pills = ends.map(([p], i) => glPill(p, places[i], i === 0));
  GL.map.getSource("ends").setData({ type:"FeatureCollection", features:ends.map(([p], i) => { const { a, off } = places[i];
    const o = [BLOCK_OFFSET[a][0] + off[0] / 14 - PILL_OFFSET[a][0] / 14, BLOCK_OFFSET[a][1]];
    return { type:"Feature", geometry:{ type:"Point", coordinates:p.ll }, properties:{ t:`${p.code} ${p.name}`.trim(), a, o } }; }) });
  glPorts(g);
  if (GL.plane) { const el = GL.plane.getElement(); el.innerHTML = g.local ? HELI_ICON : PLANE_ICON; el.classList.toggle("is-heli", g.local); return; }
  const pe = Object.assign(document.createElement("div"), { className:"gl-plane" + (g.local ? " is-heli" : ""), innerHTML:g.local ? HELI_ICON : PLANE_ICON });
  GL.plane = new maplibregl.Marker({ element:pe, rotationAlignment:"viewport" }).setLngLat(g.home.ll).addTo(GL.map);
  GL.ping = new maplibregl.Marker({ element:Object.assign(document.createElement("div"), { className:"gl-ping" }) }).setLngLat(g.home.ll).addTo(GL.map);
}
/* Точки-города — только в свободном поле: под текстом и формой их не нажать. */
function glPorts(g){
  const f = glFrameBox(), pad = 24;
  const feats = g.ports.map(p => ({ p, ...GL.map.project(p.ll) }))
    .filter(({ x, y }) => x > f.x0 - pad && x < f.x1 + pad && y > f.y0 - pad && y < f.y1 + pad)
    .map(({ p, x }) => { const right = x + 14 + p.n.length * 7.2 > f.x1;       // подпись не влезает справа — ставим слева от точки
      return { type:"Feature", properties:{ n:p.n, id:p.id, a:right ? "right" : "left", o:right ? [-.75, 0] : [.75, 0] }, geometry:{ type:"Point", coordinates:p.ll } }; });
  GL.map.getSource("ports").setData({ type:"FeatureCollection", features:feats });
}
function glClearMarkers(){ GL.pills.forEach(m => m.remove()); GL.pills = []; GL.plane?.getElement().classList.remove("on"); }
function glSources(g){
  const pt = (c, props = {}) => ({ type:"Feature", properties:props, geometry:{ type:"Point", coordinates:c } });
  GL.map.getSource("ports").setData(EMPTY);                                // точки ставит glPorts, когда камера встанет
  GL.map.getSource("ends").setData({ type:"FeatureCollection", features:[pt(g.home.ll), ...(g.dest ? [pt(g.dest.ll)] : [])] });
  GL.map.getSource("route").setData({ type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates:g.line } });
}
/* Кадр полёта: линия прорисована до p, самолёт — на её кромке, нос по курсу. */
function glFrame(g, at, p){
  GL.map.setPaintProperty("route-line", "line-gradient", grad(p, "#fff"));
  GL.map.setPaintProperty("route-glow", "line-gradient", grad(p, MAPC.glow));
  const a = GL.map.project(at(Math.min(p, .996))), b = GL.map.project(at(Math.min(p, .996) + .004));
  GL.plane.setLngLat(at(p)).setRotation(Math.atan2(b.y - a.y, b.x - a.x) / R + 90);
}
function glFly(g){
  cancelAnimationFrame(GL.raf);
  const at = pathAt(g.line), seq = GL.seq;
  GL.plane.getElement().classList.add("on");
  if (REDUCED) { glFrame(g, at, 1); return; }
  const t0 = performance.now(), pe = GL.plane.getElement();
  pe.classList.add("flying"); GL.flying = true;
  const tick = now => {
    if (seq !== GL.seq || !GL.map) { GL.flying = false; return; }
    const x = Math.min(1, (now - t0) / FLY_MS);
    glFrame(g, at, easeInOut(x));
    if (x < 1) { GL.raf = requestAnimationFrame(tick); return; }
    pe.classList.remove("flying"); GL.flying = false;
    const ring = GL.ping.getElement();
    GL.ping.setLngLat(g.dest ? g.dest.ll : g.home.ll);
    ring.classList.remove("go"); void ring.offsetWidth; ring.classList.add("go");
  };
  GL.raf = requestAnimationFrame(tick);
}

/* Нажали на город на карте — он становится направлением в форме,
   и камера перелетает к новому маршруту. */
function glPick(id){
  if (!id) return;
  if (M.module === "heli") M.heli.to = id;
  else if (M.module === "tours") M.tours.to = id;
  else if (M.module === "hotels") M.hotels.city = id;
  else if (M.module === "jet") M.jet.to = id;
  else M.flights.to = id;
  rerender();
}

/* ---- обновление после каждой отрисовки героя ---- */
function glUpdate(first = false){
  if (!GL.el.isConnected) { GL.stale = true; return; }         // ушли с главной, пока карта грузилась
  const g = glGeo(), moved = g.key !== GL.key, relang = S.lang !== GL.lang;
  if (!moved && !relang && !first) return;
  GL.key = g.key; GL.lang = S.lang; GL.geo = g;
  if (relang) for (const id of LABEL_LAYERS) GL.map.setLayoutProperty(id, "text-field", glName());
  glSources(g);
  if (!moved && !first) { glRefit(true); return; }                     // сменился только язык: герой мог перестроиться

  const seq = ++GL.seq;
  cancelAnimationFrame(GL.raf);
  glClearMarkers();
  glFrame0();
  const cam = GL.map.cameraForBounds(glBounds(g), { padding:glPadding(), maxZoom:g.maxZoom });
  let started = false;
  /* GL.geo, а не g: если за время перелёта сменили язык, подписи — на новом. */
  const land = () => { if (started || seq !== GL.seq) return; started = true; glMarkers(GL.geo); glFly(GL.geo); GL.fit = glFitKey(); };
  if (first || !cam || REDUCED) { if (cam) GL.map.jumpTo(cam); setTimeout(land, first ? 350 : 0); return; }
  GL.map.flyTo({ ...cam, duration:1500, curve:1.35 });
  GL.map.once("moveend", land);
  setTimeout(land, 1750);                  // страховка, если moveend не придёт
}
/* Размер карты и свободного поля, под которые ставилась камера. */
const glFitKey = () => `${GL.el.clientWidth}x${GL.el.clientHeight}:${JSON.stringify(glPadding())}`;
/* Поле поменялось (поворот телефона, другая ширина окна, язык перестроил
   герой) — та же камера в новых полях, без анимации. Не поменялось — ничего:
   на телефоне resize приходит и при сворачивании адресной строки. */
function glRefit(force = false){
  if (GL.state !== "ready" || !GL.el?.isConnected || !GL.geo) return;
  const key = glFitKey();
  if (!force && key === GL.fit) return;
  GL.fit = key;
  const cam = GL.map.cameraForBounds(glBounds(GL.geo), { padding:glPadding(), maxZoom:GL.geo.maxZoom });
  if (cam) GL.map.jumpTo(cam);
  glMarkers(GL.geo);
  if (!GL.flying) glFrame(GL.geo, pathAt(GL.geo.line), 1);
}
/* Линия спрятана — перед перелётом камеры. */
function glFrame0(){
  GL.map.setPaintProperty("route-line", "line-gradient", grad(0, "#fff"));
  GL.map.setPaintProperty("route-glow", "line-gradient", grad(0, MAPC.glow));
}
/* Каждая отрисовка главной переставляет карту в новый герой. */
function dockMap(){
  const dock = $("#mapdock"); if (!dock) return;
  if (GL.state === "idle") return loadGL();
  if (GL.state === "script" && !GL.map) return glCreate(dock);
  if (!GL.el || GL.state === "failed") return;
  dock.append(GL.el);
  if (GL.state !== "ready") return;
  $("#mapframe")?.classList.add("gl-on");
  GL.map.resize();
  if (GL.stale) { GL.stale = false; GL.key = null; return glUpdate(true); }
  const before = GL.key;
  glUpdate();
  if (GL.key === before) glRefit();                                     // вернулись на главную после поворота экрана
}
/* Ширина окна изменилась — та же камера в новых полях, без анимации. */
let glResizeT = 0;
window.addEventListener("resize", () => { clearTimeout(glResizeT); glResizeT = setTimeout(() => glRefit(), 160); });
