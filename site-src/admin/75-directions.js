/* ==========================================================================
   Направления: встроенный каталог (из договоров, только просмотр) и
   направления, которые добавил главный администратор. Новое направление
   сразу появляется на сайте и в кабинете: поиск рейсов, карта, табло,
   а курорт с отелями — ещё и туры с отелями (js/12-directions.js).
   ========================================================================== */
"use strict";

const DIR_COLORS = [["#2F6FE0", "#16275C"], ["#0FA3B1", "#1E5FD0"], ["#E15B4B", "#8E2F5C"], ["#13A376", "#136C9E"], ["#D99A3E", "#8C4A22"], ["#7A1F3D", "#2F3A4A"]];
const blankHotel = () => ({ name:"", stars:4, base:"", board:"BB", area:"", beach:"city", pool:false });
const NAME_MAX = 40;
const blankDir = () => ({ iata:"", city:{ ru:"", uz:"", en:"" }, country:{ ru:"", uz:"", en:"" }, lat:"", lon:"", eco:"", popular:true, resort:false, hotels:[blankHotel()], color:0 });
const dirsSaved = () => loadDirections();
/* Сколько заказов уже ведут в направление: удалять такое нельзя, только скрыть. */
function ordersTo(code){
  const hits = o => { const d = o.details || {}; return [d.from, d.to, d.out?.from, d.out?.to, d.back?.from, d.back?.to, hotelById(d.hotelId)?.city].includes(code); };
  return allOrders().filter(r => hits(r.o)).length;
}
const flightHours = d => { const km = distanceKm(COORDS.TAS, [d.lat, d.lon]); return { km:Math.round(km), min:Math.round(km / CRUISE_KMH * 60 + TAXI_MIN) }; };

function dirForm(){
  const d = M.ui.dirDraft; if (!d) return "";
  const txt = (path, label, extra = "") => `<label class="field"><span>${esc(label)}</span><input data-dir="${path}" value="${esc(path.split(".").reduce((o, k) => o?.[k], d) ?? "")}" ${extra}></label>`;
  const lat = Number(String(d.lat).replace(",", ".")), lon = Number(String(d.lon).replace(",", "."));
  const est = Number.isFinite(lat) && Number.isFinite(lon) && d.lat !== "" && d.lon !== "" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? flightHours({ lat, lon }) : null;
  return `<section class="card stack cl-edit" id="diredit"><div class="card-h"><h2>${esc(t("dir_new"))}</h2>
      <button type="button" class="iconbtn" data-act="dirclose" aria-label="${esc(t("cancel"))}">${IC.x}</button></div>
    <div class="sgrid sgrid-3">
      ${txt("iata", t("dir_iata"), 'class="upper mono" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DPS"')}
      ${txt("lat", t("dir_lat"), 'inputmode="decimal" placeholder="-8.7482"')}${txt("lon", t("dir_lon"), 'inputmode="decimal" placeholder="115.1672"')}
      ${txt("city.ru", t("dir_city") + " · RU", `placeholder="Бали" maxlength="${NAME_MAX}"`)}${txt("city.uz", t("dir_city") + " · UZ", `placeholder="Bali" maxlength="${NAME_MAX}"`)}${txt("city.en", t("dir_city") + " · EN", `placeholder="Bali" maxlength="${NAME_MAX}"`)}
      ${txt("country.ru", t("dir_country") + " · RU", `placeholder="Индонезия" maxlength="${NAME_MAX}"`)}${txt("country.uz", t("dir_country") + " · UZ", `placeholder="Indoneziya" maxlength="${NAME_MAX}"`)}${txt("country.en", t("dir_country") + " · EN", `placeholder="Indonesia" maxlength="${NAME_MAX}"`)}
    </div>
    <div class="sgrid sgrid-3">${txt("eco", t("dir_eco"), 'inputmode="numeric" placeholder="450"')}
      <div class="field"><span>${esc(t("dir_color"))}</span><div class="swatches">${DIR_COLORS.map((c, i) => `<button type="button" class="swatch" style="--c:${c[0]};background:linear-gradient(135deg,${c[0]},${c[1]})" data-act="dircolor" data-v="${i}" aria-pressed="${d.color === i}" aria-label="${esc(t("dir_color"))}: ${esc(t("dc_" + i))}"></button>`).join("")}</div></div>
      <p class="muted small dir-est">${est ? esc(tf("dir_est", { km:grp(est.km), time:dur(est.min) })) : esc(t("dir_est_none"))}</p></div>
    <label class="chk"><input type="checkbox" data-dir="popular" ${d.popular ? "checked" : ""}><span>${esc(t("dir_popular"))}</span></label>
    <label class="chk"><input type="checkbox" data-dir="resort" ${d.resort ? "checked" : ""}><span>${esc(t("dir_resort"))}</span></label>
    ${d.resort ? `<div class="stack dir-hotels"><h3>${esc(t("dir_hotels"))}</h3><p class="muted small">${esc(t("dir_hotels_d"))}</p>
      ${d.hotels.map((h, i) => `<fieldset class="dir-hotel-set"><legend class="sr-only">${esc(tf("dir_hotel_n", { n:i + 1 }))}</legend><div class="sgrid dir-hotel">
        <label class="field"><span>${esc(t("hotel"))}</span><input data-dh="${i}.name" value="${esc(h.name)}" maxlength="50" placeholder="Ubud Garden Resort"></label>
        <label class="field"><span>${esc(t("dir_area"))}</span><input data-dh="${i}.area" value="${esc(h.area)}" maxlength="30" placeholder="Ubud"></label>
        <label class="field"><span>${esc(t("dir_stars"))}</span><select data-dh="${i}.stars">${[3, 4, 5].map(n => `<option ${Number(h.stars) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("board"))}</span><select data-dh="${i}.board">${BOARDS.map(b => `<option value="${b}" ${h.board === b ? "selected" : ""}>${b} · ${esc(t("board_" + b))}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("dir_night"))}</span><input data-dh="${i}.base" value="${esc(h.base)}" inputmode="numeric" placeholder="140"></label>
        ${d.hotels.length > 1 ? `<button type="button" class="iconbtn" data-act="dirhoteldel" data-v="${i}" aria-label="${esc(tf("dir_hotel_del_n", { n:i + 1 }))}">${IC.x}</button>` : ""}</div>
        <div class="row dir-hotel-more"><label class="field"><span>${esc(t("dir_beach"))}</span><select data-dh="${i}.beach">${["beach", "near", "city"].map(b => `<option value="${b}" ${h.beach === b ? "selected" : ""}>${esc(t("dir_beach_" + b))}</option>`).join("")}</select></label>
          <label class="chk"><input type="checkbox" data-dh="${i}.pool" ${h.pool ? "checked" : ""}><span>${esc(t("dir_pool"))}</span></label></div></fieldset>`).join("")}
      ${d.hotels.length < 6 ? `<button type="button" class="ghost sm" data-act="dirhoteladd">${IC.plus}<span>${esc(t("dir_hotel_add"))}</span></button>` : ""}</div>` : ""}
    <div class="err" id="direrr" hidden></div>
    <div class="row"><button type="button" class="solid" data-act="dirsave" ${guard("catalog.edit")}>${esc(t("dir_save"))}</button>
      <button type="button" class="link" data-act="dirclose">${esc(t("cancel"))}</button></div></section>`;
}
function dirRows(){
  const saved = dirsSaved(), rows = [
    ...saved.map(d => ({ d, custom:true })),
    ...AIRPORTS.filter(a => !a.custom && a.iata !== "TAS").map(a => ({ d:{ iata:a.iata, city:a.city, country:a.country, resort:RESORTS.includes(a.iata), popular:WORLD_BG.includes(a.iata) }, custom:false }))
  ];
  const q = (M.ui.dirq || "").trim().toLowerCase();
  return rows.filter(({ d }) => !q || [d.iata, d.city.ru, d.city.en, d.city.uz, d.country.ru, d.country.en, d.country.uz].join(" ").toLowerCase().includes(q));
}
function dirList(){
  const rows = dirRows();
  if (!rows.length) return `<p class="muted">${esc(t("dir_none_match"))}</p>`;
  return `<div class="atable" style="--cols:minmax(0,1.8fr) minmax(0,1.2fr) minmax(0,1.5fr) minmax(0,1.2fr) auto">
    <div class="arow ahead" aria-hidden="true"><span>${esc(t("dir_city"))}</span><span>${esc(t("dir_country"))}</span><span>${esc(t("dir_services"))}</span><span>${esc(t("col_source"))}</span><span></span></div>
    ${rows.map(({ d, custom }) => {
      const n = custom ? ordersTo(d.iata) : 0;
      return `<div class="arow ${d.hidden ? "past" : ""}"><span class="a-main a-with-mark"><span class="dir-pc" style="background:linear-gradient(135deg,${esc((PALETTE[d.iata] || DIR_COLORS[0])[0])},${esc((PALETTE[d.iata] || DIR_COLORS[0])[1])})">${esc(d.iata)}</span>
          <span class="stack" style="gap:1px;min-width:0"><b>${esc(d.city[S.lang] || d.city.ru)}</b>${d.hidden ? `<span class="small muted">${esc(t("dir_hidden"))}</span>` : ""}</span></span>
        <span class="a-cell a-sub">${esc(d.country[S.lang] || d.country.ru)}</span>
        <span class="a-cell wrap small">${esc([t("type_FLIGHT"), t("type_JET"), ...(d.resort ? [t("type_TOUR"), t("type_HOTEL")] : [])].join(", "))}${d.popular ? ` · <b>${esc(t("dir_popular_short"))}</b>` : ""}</span>
        <span class="a-cell muted small">${custom ? esc(tf("dir_added_by", { name:d.by || "—", date:d.at ? fdate(ymd(new Date(d.at))) : "" })) : esc(t("dir_builtin"))}</span>
        <span class="a-end row" style="gap:10px;flex-wrap:nowrap">${custom ? `<button type="button" class="link" data-act="${d.hidden ? "dirshow" : "dirhide"}" data-v="${esc(d.iata)}" aria-label="${esc(t(d.hidden ? "dir_show" : "dir_hide"))}: ${esc(d.city[S.lang] || d.city.ru)}" ${guard("catalog.edit")}>${esc(t(d.hidden ? "dir_show" : "dir_hide"))}</button>
          ${n ? `<span class="muted small">${esc(tf("dir_in_orders", { n:pl(n, "order") }))}</span>` : `<button type="button" class="link danger" data-act="dirdel" data-v="${esc(d.iata)}" aria-label="${esc(t("dir_delete"))}: ${esc(d.city[S.lang] || d.city.ru)}" ${guard("catalog.edit")}>${esc(t("dir_delete"))}</button>`}` : ""}</span></div>`; }).join("")}</div>`;
}
PAGES.directions = {
  render(){
    return `<div class="page">
      <div class="pagehead row-head"><div class="stack" style="gap:6px"><h1>${esc(t("an_directions"))}</h1><p class="muted">${esc(t("directions_sub"))}</p></div>
        <button type="button" class="solid" data-act="dirnew" ${guard("catalog.edit")}>${IC.plus}<span>${esc(t("dir_new"))}</span></button></div>
      ${dirForm()}
      <div class="card stack">
        <label class="search wide">${IC.search}<input id="dirq" type="search" value="${esc(M.ui.dirq || "")}" placeholder="${esc(t("dir_search"))}" aria-label="${esc(t("dir_search"))}"></label>
        <div id="dirlist">${dirList()}</div></div>
      <p class="muted small" style="margin-top:12px">${esc(t("directions_note"))}</p></div>`;
  },
  after(){ if (M.ui.dirDraft && M.ui.dirFocus) { $("#diredit [data-dir=iata]")?.focus(); M.ui.dirFocus = false; } }
};

/* ---- проверка и сохранение ---- */
function readDir(d){
  const num = v => Number(String(v).trim().replace(",", "."));
  const clean = o => ({ ru:o.ru.trim(), uz:o.uz.trim(), en:o.en.trim() });
  return { iata:d.iata.trim().toUpperCase(), city:clean(d.city), country:clean(d.country), lat:num(d.lat), lon:num(d.lon), eco:Math.round(num(d.eco)),
    popular:!!d.popular, resort:!!d.resort, color:DIR_COLORS[d.color] || DIR_COLORS[0],
    hotels:d.resort ? d.hotels.map(h => ({ name:h.name.trim(), area:h.area.trim(), stars:Number(h.stars), board:h.board, base:Math.round(num(h.base)), beach:h.beach, pool:!!h.pool })) : [] };
}
/* Ошибка и поле, к которому она относится: фокус ставим на это поле. */
function dirError(x){
  const L = ["ru", "uz", "en"], bad = (k, f) => ({ key:k, field:f });
  if (!/^[A-Z]{3}$/.test(x.iata)) return bad("err_dir_iata", "iata");
  if (AIRPORTS.some(a => a.iata === x.iata) || dirsSaved().some(d => d.iata === x.iata)) return bad("err_dir_dup", "iata");
  for (const g of ["city", "country"]) for (const l of L) if (x[g][l].length < 2 || x[g][l].length > NAME_MAX) return bad("err_dir_names", `${g}.${l}`);
  if (!Number.isFinite(x.lat) || Math.abs(x.lat) > 90) return bad("err_dir_coords", "lat");
  if (!Number.isFinite(x.lon) || Math.abs(x.lon) > 180) return bad("err_dir_coords", "lon");
  if (distanceKm(COORDS.TAS, [x.lat, x.lon]) < 150) return bad("err_dir_near", "lat");
  if (!Number.isFinite(x.eco) || x.eco < 50 || x.eco > 5000) return bad("err_dir_eco", "eco");
  if (x.resort) { const i = x.hotels.findIndex(h => h.name.length < 3 || !(h.base >= 20 && h.base <= 5000));
    if (i >= 0) return { key:"err_dir_hotels", hotel:`${i}.${x.hotels[i].name.length < 3 ? "name" : "base"}` }; }
  return null;
}
function saveDirs(list, action, vars){
  writeJSON(DIRS_KEY, list); applyDirections();
  change(() => audit(action, vars));
}
Object.assign(ACT, {
  dirnew:   () => { if (denied("catalog.edit")) return; M.ui.dirDraft = blankDir(); M.ui.dirFocus = true; rerender(); },
  dirclose: () => { M.ui.dirDraft = null; rerender(); },
  dircolor: el => { M.ui.dirDraft.color = Number(el.dataset.v); rerender(); },
  dirhoteladd: () => { const h = M.ui.dirDraft.hotels; h.push(blankHotel()); rerender(); $(`[data-dh="${h.length - 1}.name"]`)?.focus(); },
  dirhoteldel: el => { M.ui.dirDraft.hotels.splice(Number(el.dataset.v), 1); rerender(); ($('[data-act="dirhoteladd"]') || $('[data-dh="0.name"]'))?.focus(); },
  dirsave: () => {
    if (denied("catalog.edit")) return;
    const x = readDir(M.ui.dirDraft), e = dirError(x);
    if (e) {
      $$("#diredit [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
      const f = e.field ? $(`#diredit [data-dir="${e.field}"]`) : $(`#diredit [data-dh="${e.hotel}"]`);
      if (f) { f.setAttribute("aria-invalid", "true"); f.setAttribute("aria-describedby", "direrr"); }
      showErr("#direrr", t(e.key)); f?.focus({ preventScroll:true }); return;
    }
    saveDirs([...dirsSaved(), { ...x, hidden:false, by:me().name, at:Date.now() }], "dir_add", { city:x.city, iata:x.iata });
    M.ui.dirDraft = null; rerender(); toast(tf("t_dir_add", { city:x.city[S.lang] || x.city.ru }));
  },
  dirhide: el => { if (denied("catalog.edit")) return; const list = dirsSaved(), d = list.find(x => x.iata === el.dataset.v); if (!d) return;
    d.hidden = true; saveDirs(list, "dir_hide", { city:d.city, iata:d.iata }); $(`[data-act="dirshow"][data-v="${d.iata}"]`)?.focus(); },
  dirshow: el => { if (denied("catalog.edit")) return; const list = dirsSaved(), d = list.find(x => x.iata === el.dataset.v); if (!d) return;
    d.hidden = false; saveDirs(list, "dir_show", { city:d.city, iata:d.iata }); $(`[data-act="dirhide"][data-v="${d.iata}"]`)?.focus(); },
  dirdel: el => {
    if (denied("catalog.edit")) return;
    const code = el.dataset.v, d0 = dirsSaved().find(x => x.iata === code); if (!d0) return;
    if (!confirm(tf("dir_delete_q", { city:d0.city[S.lang] || d0.city.ru }))) return;
    // Пока было открыто окно подтверждения, другая вкладка могла изменить данные.
    S = loadState() || S; adminPrefs(); SITE = loadSite(); O = loadOps() || O;
    const list = dirsSaved(), d = list.find(x => x.iata === code); if (!d) return rerender();
    if (ordersTo(code)) { rerender(); return toast(t("dir_has_orders")); }
    saveDirs(list.filter(x => x.iata !== code), "dir_delete", { city:d.city, iata:d.iata }); $("#dirq")?.focus();
  }
});
/* Поля формы → черновик. Флажки перерисовывают форму (курорт открывает отели). */
document.addEventListener("input", e => {
  const d = M.ui.dirDraft, k = e.target.dataset?.dir, h = e.target.dataset?.dh;
  if (d && k && e.target.type !== "checkbox") { const ks = k.split("."); (ks.length === 2 ? d[ks[0]] : d)[ks.at(-1)] = k === "iata" ? e.target.value.toUpperCase() : e.target.value;
    if (k === "lat" || k === "lon") { const p = $(".dir-est"); if (p) { const x = readDir(d); p.textContent = Number.isFinite(x.lat) && Number.isFinite(x.lon) && d.lat !== "" && d.lon !== "" ? tf("dir_est", { km:grp(flightHours(x).km), time:dur(flightHours(x).min) }) : t("dir_est_none"); } } }
  if (d && h) { const [i, f] = h.split("."); if (d.hotels[i]) d.hotels[i][f] = e.target.value; }
  if (e.target.id === "dirq") { M.ui.dirq = e.target.value; const l = $("#dirlist"); if (l) l.innerHTML = dirList(); }
});
document.addEventListener("change", e => {
  const d = M.ui.dirDraft, k = e.target.dataset?.dir, h = e.target.dataset?.dh;
  if (d && k && e.target.type === "checkbox") { d[k] = e.target.checked; rerender(); $(`#diredit [data-dir="${k}"]`)?.focus(); }
  if (d && h) { const [i, f] = h.split("."); if (d.hotels[i]) d.hotels[i][f] = e.target.type === "checkbox" ? e.target.checked : e.target.value; }
});
