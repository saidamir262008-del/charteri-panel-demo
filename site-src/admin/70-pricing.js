/* ==========================================================================
   Услуги и цены. Всё, что сайт и кабинет берут из prices(): сбор агентств,
   наценка на авиабилеты, доступность и поправки каждой услуги для сайта
   (B2C) и агентств (B2B), скидка тура, трансфер и страховка, поправки по
   направлениям, индивидуальные цены агентств, промокоды и акции.
   Правки копятся в черновике и сохраняются вместе; для всех, кроме
   основателя, — через подтверждение (правило «Изменения цен»).
   ========================================================================== */
"use strict";

const EX_USD = 1000;                         // пример: цена поставщика $1 000
const cfgNow = () => { const p = prices(); return JSON.parse(JSON.stringify({ feeBps:p.feeBps, flightMarkupBps:p.flightMarkupBps, svc:p.svc, dest:p.dest, agents:p.agents, promos:p.promos })); };
const pctIn = bps => String(bps / 100).replace(".", S.lang === "en" ? "." : ",");
const numIn = s => Number(String(s).trim().replace(/\s/g, "").replace(",", "."));
/* Направления для поправок: аэропорты (кроме Ташкента) и площадки вертолётов. */
const destOptions = () => [...AIRPORTS.filter(a => a.iata !== "TAS" && !a.hidden).map(a => [a.iata, `${cityName(a.iata)} · ${a.iata}`]),
  ...HELI_DEST.map(d => [d.id, `${heliName(d.id)} · ${t("type_HELI")}`])];

/* Черновик формы: строки, как их ввели; base — настройки на момент открытия. */
function prDraft(){
  if (M.ui.prf && JSON.stringify(cfgNow()) !== M.ui.prf.base && !prChanges(M.ui.prf)) M.ui.prf = null;
  if (M.ui.prf) return M.ui.prf;
  const p = cfgNow();
  return (M.ui.prf = { base:JSON.stringify(p), fee:pctIn(p.feeBps), markup:pctIn(p.flightMarkupBps), pkg:pctIn(p.svc.TOUR.pkg),
    svc:Object.fromEntries(SVC_TYPES.map(k => [k, { on:p.svc[k].on, b2c:pctIn(p.svc[k].b2c), b2b:pctIn(p.svc[k].b2b) }])),
    TRANSFER:{ on:p.svc.TRANSFER.on, usd:String(p.svc.TRANSFER.usd) }, INSURANCE:{ on:p.svc.INSURANCE.on, usd:String(p.svc.INSURANCE.usd) },
    dest:Object.entries(p.dest).map(([code, v]) => ({ code, v:pctIn(v) })), agents:Object.entries(p.agents).map(([id, v]) => ({ id, v:pctIn(v) })),
    promos:p.promos.map(x => ({ ...x, svc:[...(x.svc || [])] })) });
}
/* Черновик → настройки. Ошибка — путь поля (для фокуса) и ключ строки. */
function prBuild(f){
  let err = null;
  const bad = (path, key, vars = {}) => { err ||= { path, key, vars }; return NaN; };
  const P = (raw, path, lo, hi) => { const v = numIn(raw); return String(raw).trim() === "" || !Number.isFinite(v) || v < lo || v > hi ? bad(path, "err_pr_pct", { min:lo, max:hi }) : Math.round(v * 100); };
  const U = (raw, path) => /^\d{1,4}$/.test(String(raw).trim()) && numIn(raw) <= 1000 ? numIn(raw) : bad(path, "err_pr_usd");
  const cfg = { feeBps:P(f.fee, "fee", 0, 10), flightMarkupBps:P(f.markup, "markup", 0, 30), svc:{}, dest:{}, agents:{}, promos:f.promos.map(x => ({ ...x })) };
  for (const k of SVC_TYPES) cfg.svc[k] = { on:!!f.svc[k].on, b2c:P(f.svc[k].b2c, `svc.${k}.b2c`, -50, 50), b2b:P(f.svc[k].b2b, `svc.${k}.b2b`, -50, 50) };
  cfg.svc.TOUR.pkg = P(f.pkg, "pkg", 0, 30);
  for (const k of ADDONS) cfg.svc[k] = { on:!!f[k].on, usd:U(f[k].usd, `${k}.usd`) };
  const codes = [...destOptions().map(([c]) => c), ...Object.keys(JSON.parse(f.base).dest)];
  f.dest.forEach((d, i) => { if (!codes.includes(d.code)) return bad(`dest.${i}.code`, "err_pr_dest"); if (d.code in cfg.dest) return bad(`dest.${i}.code`, "err_pr_dup");
    const v = P(d.v, `dest.${i}.v`, -50, 50); if (v) cfg.dest[d.code] = v; });
  f.agents.forEach((a, i) => { if (!agencyById(a.id)) return bad(`agents.${i}.id`, "err_pr_agency"); if (a.id in cfg.agents) return bad(`agents.${i}.id`, "err_pr_dup");
    const v = P(a.v, `agents.${i}.v`, -50, 50); if (v) cfg.agents[a.id] = v; });
  return { cfg, err };
}
/* Что было → что стало, по строке на изменение; без языка — для журнала и запроса. */
function configDiff(a, b){
  const out = [], pct = v => ({ pct:v, sign:true }), onoff = v => strRef(v ? "pr_on" : "pr_off");
  const row = (k, x, y, conv = pct, sub) => { if (JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)) out.push({ k, from:x == null ? "" : conv(x), to:y == null ? "" : conv(y), ...(sub ? { sub } : {}) }); };
  row("pr_fee", a.feeBps, b.feeBps, v => ({ pct:v })); row("pr_markup", a.flightMarkupBps, b.flightMarkupBps, v => ({ pct:v }));
  for (const k of SVC_TYPES) { row(["type_" + k, "pr_col_on"], a.svc[k].on, b.svc[k].on, onoff); row(["type_" + k, "pr_col_b2c"], a.svc[k].b2c, b.svc[k].b2c); row(["type_" + k, "pr_col_b2b"], a.svc[k].b2b, b.svc[k].b2b); }
  row(["type_TOUR", "pr_col_pkg"], a.svc.TOUR.pkg, b.svc.TOUR.pkg, v => ({ pct:v }));
  for (const k of ADDONS) { row(["pr_" + k.toLowerCase(), "pr_col_on"], a.svc[k].on, b.svc[k].on, onoff); row(["pr_" + k.toLowerCase(), "pr_col_usd"], a.svc[k].usd, b.svc[k].usd, v => "$" + v); }
  for (const c of new Set([...Object.keys(a.dest), ...Object.keys(b.dest)])) row("pr_dest", a.dest[c], b.dest[c], pct, { dest:{ code:c, heli:!AIRPORTS.some(x => x.iata === c) } });
  for (const id of new Set([...Object.keys(a.agents), ...Object.keys(b.agents)])) row("pr_agents", a.agents[id], b.agents[id], pct, agencyById(id)?.name || id);
  // Промокод: новый или удалённый — одной строкой; изменённый — строкой на каждое поле.
  const pa = new Map(a.promos.map(x => [x.id, x])), pb = new Map(b.promos.map(x => [x.id, x]));
  for (const id of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(id), y = pb.get(id), name = (y || x).code || (y || x).name;
    if (!x || !y) { row("pr_promos", x, y, z => ({ promo:{ kind:z.kind, value:z.value, active:!!z.active } }), name); continue; }
    for (const [, label, conv] of PROMO_DIFF) row(["pr_promos", label], conv(x), conv(y), v => v, name);
  }
  return out;
}
const PROMO_DIFF = [["value", "pm_col_off", z => ({ promo:{ kind:z.kind, value:z.value, active:true } })], ["active", "col_status", z => strRef(z.active ? "pm_st_on" : "pm_st_off")],
  ["code", "pm_code", z => z.code || "—"], ["name", "pm_name", z => z.name], ["svc", "pm_svc", z => ({ svcs:z.svc || [] })], ["min", "pm_min", z => z.minUsd ? "$" + z.minUsd : "—"],
  ["limit", "pm_limit", z => z.limit ? String(z.limit) : "—"], ["dates", "pm_col_dates", z => `${z.starts || "…"} — ${z.ends || "…"}`]];
const prChanges = f => { const { cfg, err } = prBuild(f); return err ? -1 : configDiff(JSON.parse(f.base), cfg).length; };

/* ---- сохранение ---- */
function savePricing(){
  if (denied("pricing.edit")) return;
  const f = prDraft();
  if (JSON.stringify(cfgNow()) !== f.base) { M.ui.prf = null; rerender(); return toast(t("pr_conflict")); }
  const { cfg, err } = prBuild(f);
  $$("#app [data-pf][aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (err) { const fld = $(`[data-pf="${err.path}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "prerr"); showErr("#prerr", tf(err.key, err.vars));
    fld?.scrollIntoView({ block:"center" }); fld?.focus({ preventScroll:true }); return; }
  const from = JSON.parse(f.base), diff = configDiff(from, cfg);
  if (!diff.length) { M.ui.prf = null; rerender(); return toast(t("pr_same")); }
  if (needsApproval("pricing")) { if (requestApproval("pricing", { key:"pricing", payload:{ from, to:cfg }, diff })) { M.ui.prf = null; rerender(); $("h1")?.focus(); } return; }
  let e = null; change(() => { e = execPricing({ from, to:cfg }); });
  M.ui.prf = null; rerender(); $("h1")?.focus(); toast(e ? t(e) : t("pr_saved"));
}
/* Исполнитель (см. 17-approvals.js): цены могли поменяться, пока запрос ждал. */
function execPricing({ from, to }){
  const now = cfgNow();
  // Запрос прошлой версии хранил только сбор и наценку.
  if (!from.svc) { if (now.feeBps !== from.feeBps || now.flightMarkupBps !== from.flightMarkupBps) return "ap_err_changed"; to = { ...now, feeBps:to.feeBps, flightMarkupBps:to.flightMarkupBps }; }
  else if (JSON.stringify(now) !== JSON.stringify(from)) return "ap_err_changed";
  writeJSON(PRICES_KEY, to); PRICES = null;
  audit("pricing", {}, { diff:configDiff(now, to) });
  return null;
}

/* ---- разметка ---- */
const pf = (path, val, attrs = "") => `<input data-pf="${path}" value="${esc(val)}" ${attrs}>`;
const pctBox = (path, val, label, dis, signed) => `<span class="pct-in sm">${pf(path, val, `inputmode="${signed ? "text" : "decimal"}" maxlength="6" aria-label="${esc(label)}" ${dis}`)}<i>%</i></span>`;
/* Пример на $1 000 поставщика: цена на сайте и для агентства (со сбором). */
function exampleText(f, k){
  const n = v => { const x = numIn(v); return Number.isFinite(x) ? x / 100 : 0; }, base = EX_USD * (k === "FLIGHT" ? 1 + n(f.markup) : 1);
  const site = Math.round(base * (1 + n(f.svc[k].b2c))), ag = Math.round(base * (1 + n(f.svc[k].b2b))), fee = Math.ceil(ag * n(f.fee));
  return tf(k === "TOUR" ? "pr_example_tour" : "pr_example", { base:"$" + grp(EX_USD), site:"$" + grp(site), agency:"$" + grp(ag), fee:"$" + grp(fee) });
}
function svcTable(f, dis){
  return `<div class="atable pr-table" style="--cols:minmax(0,1.6fr) 120px 120px minmax(0,2.2fr)">
    <div class="arow ahead" aria-hidden="true"><span>${esc(t("pr_col_svc"))}</span><span>${esc(t("pr_col_b2c"))}</span><span>${esc(t("pr_col_b2b"))}</span><span>${esc(t("pr_col_example"))}</span></div>
    ${SVC_TYPES.map(k => `<div class="arow ${f.svc[k].on ? "" : "past"}"><label class="chk"><input type="checkbox" data-pf="svc.${k}.on" ${f.svc[k].on ? "checked" : ""} ${dis}>
        <span class="stack" style="gap:1px"><b>${esc(t("type_" + k))}</b><span class="small muted">${esc(t(f.svc[k].on ? "pr_svc_on" : "pr_svc_off"))}</span></span></label>
      <span class="pr-cell"><span class="pr-lbl">${esc(t("pr_col_b2c"))}</span>${pctBox(`svc.${k}.b2c`, f.svc[k].b2c, `${t("type_" + k)}: ${t("pr_col_b2c")}`, dis, true)}</span>
      <span class="pr-cell"><span class="pr-lbl">${esc(t("pr_col_b2b"))}</span>${pctBox(`svc.${k}.b2b`, f.svc[k].b2b, `${t("type_" + k)}: ${t("pr_col_b2b")}`, dis, true)}</span>
      <span class="small muted pr-ex" id="ex-${k}">${esc(exampleText(f, k))}</span></div>`).join("")}</div>`;
}
function adjRows(kind, f, dis){
  const rows = f[kind], key = kind === "dest" ? "code" : "id";
  // Направление скрыли или удалили, а поправка осталась — показываем её, чтобы можно было убрать.
  const base = kind === "dest" ? destOptions() : agencies().map(a => [a.id, a.name]);
  const opts = [...base, ...Object.keys(JSON.parse(f.base)[kind]).filter(c => !base.some(([v]) => v === c)).map(c => [c, `${c} · ${t("pr_hidden")}`])];
  return `<div class="adj-rows">${rows.map((r, i) => `<div class="adj-row">
      <select class="minisel" data-pf="${kind}.${i}.${key}" aria-label="${esc(t(kind === "dest" ? "crm_dest" : "customer"))}" ${dis}><option value="">—</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${r[key] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      ${pctBox(`${kind}.${i}.v`, r.v, t("pr_adj"), dis, true)}
      ${dis ? "" : `<button type="button" class="iconbtn" data-act="pradjdel" data-k="${kind}" data-v="${i}" aria-label="${esc(t("pr_row_del"))}">${IC.x}</button>`}</div>`).join("")
    || `<p class="muted small">${esc(t(kind === "dest" ? "pr_dest_none" : "pr_agents_none"))}</p>`}
    ${dis ? "" : `<button type="button" class="ghost sm" data-act="pradjadd" data-k="${kind}">${IC.plus}<span>${esc(t(kind === "dest" ? "pr_dest_add" : "pr_agents_add"))}</span></button>`}</div>`;
}
function saveBar(f){
  const n = prChanges(f); if (!n) return "";
  return `<div class="savebar" role="region" aria-label="${esc(t("pr_unsaved"))}"><span>${esc(n < 0 ? t("err_pr_check") : tf("role_changed", { n }))}</span>
    ${needsApproval("pricing") ? `<span class="muted small">${esc(t("pr_needs_ap"))}</span>` : ""}
    <div class="err" id="prerr" hidden></div>
    <span class="row"><button type="button" class="link" data-act="prreset">${esc(t("cancel"))}</button><button type="button" class="solid" data-act="prsave">${esc(t("pr_save"))}</button></span></div>`;
}
PAGES.pricing = {
  render(){
    const f = prDraft(), edit = can("pricing.edit"), dis = edit ? "" : "disabled", pend = pendingAp("pricing");
    return `<div class="page">
      <div class="pagehead"><h1>${esc(t("an_pricing"))}</h1><p class="muted">${esc(t("pricing_sub"))}</p></div>
      ${pend ? `<div class="card stack"><p class="note-live">${IC.clock}<span>${esc(t("pr_pending"))}</span></p>${apDiff(pend)}</div>` : ""}
      ${edit ? "" : `<p class="muted">${esc(t("pr_admin_only"))}</p>`}
      <div class="stack" style="margin-top:12px">
        <section class="card stack"><h2>${esc(t("pr_fee_h"))}</h2>
          <div class="sgrid sgrid-2"><div class="stack" style="gap:6px"><b>${esc(t("pr_fee"))}</b><p class="muted small">${esc(t("pr_fee_d"))}</p>${pctBox("fee", f.fee, t("pr_fee"), dis)}</div>
            <div class="stack" style="gap:6px"><b>${esc(t("pr_markup"))}</b><p class="muted small">${esc(t("pr_markup_d"))}</p>${pctBox("markup", f.markup, t("pr_markup"), dis)}</div></div></section>
        <section class="card stack"><div class="stack" style="gap:4px"><h2>${esc(t("pr_svc_h"))}</h2><p class="muted small">${esc(t("pr_svc_d"))}</p></div>${svcTable(f, dis)}
          <div class="sgrid sgrid-3 pr-extra">
            <div class="stack" style="gap:6px"><b>${esc(t("pr_col_pkg"))}</b><p class="muted small">${esc(t("pr_pkg_d"))}</p>${pctBox("pkg", f.pkg, t("pr_col_pkg"), dis)}</div>
            ${ADDONS.map(k => `<div class="stack" style="gap:6px"><label class="chk"><input type="checkbox" data-pf="${k}.on" ${f[k].on ? "checked" : ""} ${dis}><b>${esc(t("pr_" + k.toLowerCase()))}</b></label>
              <p class="muted small">${esc(t("pr_" + k.toLowerCase() + "_d"))}</p><span class="usd-in"><i>$</i>${pf(`${k}.usd`, f[k].usd, `inputmode="numeric" maxlength="4" aria-label="${esc(t("pr_" + k.toLowerCase()))}" ${dis || (f[k].on ? "" : "disabled")}`)}</span></div>`).join("")}</div></section>
        <section class="card stack"><div class="stack" style="gap:4px"><h2>${esc(t("pr_dest"))}</h2><p class="muted small">${esc(t("pr_dest_d"))}</p></div>${adjRows("dest", f, dis)}</section>
        <section class="card stack"><div class="stack" style="gap:4px"><h2>${esc(t("pr_agents"))}</h2><p class="muted small">${esc(t("pr_agents_d"))}</p></div>${adjRows("agents", f, dis)}</section>
        ${promoSection(f, dis)}
      </div>
      <div id="prbar">${edit ? saveBar(f) : ""}</div></div>`;
  },
  after(){ if (M.ui.promoEd && M.ui.peFocus) { $("#promoed input")?.focus(); M.ui.peFocus = false; } }
};

/* ---- поля ---- */
function setPath(o, path, v){ const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; }
document.addEventListener("input", e => {
  const path = e.target.dataset?.pf; if (path == null || !M.ui.prf || e.target.type === "checkbox" || e.target.tagName === "SELECT") return;
  setPath(M.ui.prf, path, e.target.value);
  // Пример и полоса «сохранить» обновляются на месте, без перерисовки поля ввода.
  for (const k of SVC_TYPES) { const ex = $("#ex-" + k); if (ex) ex.textContent = exampleText(M.ui.prf, k); }
  const bar = $("#prbar"); if (bar && can("pricing.edit")) bar.innerHTML = saveBar(M.ui.prf);
});
document.addEventListener("change", e => {
  const path = e.target.dataset?.pf; if (path == null || !M.ui.prf || (e.target.type !== "checkbox" && e.target.tagName !== "SELECT")) return;
  setPath(M.ui.prf, path, e.target.type === "checkbox" ? e.target.checked : e.target.value);
  rerender(); $(`[data-pf="${CSS.escape(path)}"]`)?.focus();
});
Object.assign(ACT, {
  prsave:   () => savePricing(),
  prreset:  () => { M.ui.prf = null; M.ui.promoEd = null; rerender(); $("h1")?.focus(); },
  pradjadd: el => { const f = prDraft(), k = el.dataset.k; f[k].push(k === "dest" ? { code:"", v:"5" } : { id:"", v:"-5" }); rerender(); $(`[data-pf="${k}.${f[k].length - 1}.${k === "dest" ? "code" : "id"}"]`)?.focus(); },
  pradjdel: el => { const f = prDraft(), k = el.dataset.k; f[k].splice(Number(el.dataset.v), 1); rerender(); $(`[data-act="pradjadd"][data-k="${k}"]`)?.focus(); }
});
