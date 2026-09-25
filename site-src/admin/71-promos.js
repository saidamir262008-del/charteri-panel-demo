/* ==========================================================================
   Промокоды и акции сайта. Промокод пассажир вводит при оформлении; акция
   (без кода) применяется сама. Скидка на заказ одна — бо́льшая (bestPromo в
   ядре). Правки промокодов идут в тот же черновик, что и остальные цены, и
   сохраняются общей кнопкой — с подтверждением, если оно нужно.
   Хранение: value — сотые процента (pct) или доллары (fixed).
   ========================================================================== */
"use strict";

const blankPromo = () => ({ id:uid("pm"), code:"", name:"", kind:"pct", value:"10", svc:[], minUsd:"", starts:TODAY, ends:"", limit:"", active:true, auto:false, isNew:true });
/* Состояние для списка: выключен, ещё не начался, закончился, исчерпан, действует. */
function promoState(x){
  if (!x.active) return "off";
  if (x.starts && TODAY < x.starts) return "soon";
  if (x.ends && TODAY > x.ends) return "ended";
  if (x.limit && promoUsed(x, SITE?.orders || []) >= x.limit) return "used";
  return "on";
}
const promoValue = x => x.kind === "pct" ? `−${pctText(x.value)}%` : `−$${grp(x.value)}`;
const promoDates = x => x.starts || x.ends ? `${x.starts ? fdate(x.starts) : "…"} — ${x.ends ? fdate(x.ends) : "…"}` : t("pm_always");

function promoSection(f, dis){
  const list = f.promos, ed = M.ui.promoEd;
  return `<section class="card stack" id="promos"><div class="card-h"><div class="stack" style="gap:4px"><h2>${esc(t("pr_promos"))}</h2><p class="muted small">${esc(t("pr_promos_d"))}</p></div>
      ${dis ? "" : `<button type="button" class="ghost sm" data-act="pmnew">${IC.plus}<span>${esc(t("pm_new"))}</span></button>`}</div>
    ${ed ? promoForm(ed) : ""}
    ${list.length ? `<div class="atable" style="--cols:minmax(0,1.6fr) 90px minmax(0,1.3fr) minmax(0,1.3fr) 90px 130px auto">
      <div class="arow ahead" aria-hidden="true"><span>${esc(t("pm_col_code"))}</span><span>${esc(t("pm_col_off"))}</span><span>${esc(t("crm_service"))}</span><span>${esc(t("pm_col_dates"))}</span>
        <span class="a-num">${esc(t("pm_col_used"))}</span><span>${esc(t("col_status"))}</span><span></span></div>
      ${list.map(x => { const st = promoState(x), used = promoUsed(x, SITE?.orders || []);
        return `<div class="arow ${st === "on" ? "" : "past"}"><span class="a-main"><b class="${x.auto ? "" : "mono"}">${esc(x.auto ? t("pm_auto_short") : x.code)}</b><span class="small muted">${esc(x.name)}</span></span>
          <span class="a-cell mono a-sub">${esc(promoValue(x))}</span>
          <span class="a-cell small wrap">${esc(x.svc?.length ? x.svc.map(k => t("type_" + k)).join(", ") : t("pm_all_svc"))}${x.minUsd ? ` · ${esc(tf("pm_min_short", { min:"$" + grp(x.minUsd) }))}` : ""}</span>
          <span class="a-cell small">${esc(promoDates(x))}</span>
          <span class="a-num mono small">${used}${x.limit ? " / " + x.limit : ""}</span>
          <span><span class="pill pm-${st}">${esc(t((x.auto && st !== "on" ? "pm_sta_" : "pm_st_") + st))}</span></span>
          <span class="a-end row" style="gap:10px;flex-wrap:nowrap">${dis ? "" : `<button type="button" class="link" data-act="pmedit" data-v="${esc(x.id)}">${esc(t("edit"))}</button>
            <button type="button" class="link" data-act="pmtoggle" data-v="${esc(x.id)}">${esc(t(x.active ? "pm_hide" : "pm_show"))}</button>
            <button type="button" class="link danger" data-act="pmdel" data-v="${esc(x.id)}" aria-label="${esc(t("delete_cta"))}: ${esc(x.code || x.name)}">${esc(t("delete_cta"))}</button>`}</span></div>`; }).join("")}</div>`
      : `<p class="muted">${esc(t("pm_none"))}</p>`}</section>`;
}
function promoForm(d){
  const f = (k, label, attrs = "") => `<label class="field"><span>${esc(t(label))}</span><input data-pe="${k}" value="${esc(d[k])}" ${attrs}></label>`;
  return `<div class="stack cl-edit pm-form" id="promoed"><h3>${esc(t(d.isNew ? "pm_new" : d.auto ? "pm_edit_auto" : "pm_edit"))}</h3>
    <label class="chk"><input type="checkbox" data-pe="auto" ${d.auto ? "checked" : ""}><span>${esc(t("pm_auto"))}</span></label>
    <div class="sgrid sgrid-3">
      ${d.auto ? "" : f("code", "pm_code", 'maxlength="20" autocomplete="off" style="text-transform:uppercase"')}
      ${f("name", "pm_name", 'maxlength="60" autocomplete="off"')}
      <label class="field"><span>${esc(t("pm_kind"))}</span><select data-pe="kind"><option value="pct" ${d.kind === "pct" ? "selected" : ""}>${esc(t("pm_kind_pct"))}</option><option value="fixed" ${d.kind === "fixed" ? "selected" : ""}>${esc(t("pm_kind_fixed"))}</option></select></label>
      ${f("value", d.kind === "pct" ? "pm_value_pct" : "pm_value_usd", 'inputmode="decimal" maxlength="6"')}
      ${f("minUsd", "pm_min", 'inputmode="numeric" maxlength="6" placeholder="$"')}
      ${f("limit", "pm_limit", 'inputmode="numeric" maxlength="6"')}
      ${f("starts", "pm_starts", 'type="date"')}${f("ends", "pm_ends", 'type="date"')}
    </div>
    <fieldset class="pm-svc"><legend>${esc(t("pm_svc"))}</legend>${PROMO_TYPES.map(k => `<label class="chk"><input type="checkbox" data-pe-svc="${k}" ${d.svc.includes(k) ? "checked" : ""}><span>${esc(t("type_" + k))}</span></label>`).join("")}
      <p class="muted small">${esc(t("pm_svc_d"))}</p></fieldset>
    <label class="chk"><input type="checkbox" data-pe="active" ${d.active ? "checked" : ""}><span>${esc(t("pm_active"))}</span></label>
    ${d.auto ? `<p class="muted small">${esc(t("pm_auto_limit"))}</p>` : ""}
    <div class="err" id="pmerr" hidden></div>
    <div class="row"><button type="button" class="solid sm" data-act="pmdone">${esc(t("pm_done"))}</button><button type="button" class="link" data-act="pmclose">${esc(t("cancel"))}</button>
      <span class="muted small">${esc(t("pm_draft_note"))}</span></div></div>`;
}
/* Черновик промокода → запись. Ошибка — поле и ключ строки. */
function promoRead(d, all){
  const n = v => numIn(v), int = v => String(v).trim() === "" ? 0 : /^\d{1,6}$/.test(String(v).trim()) ? Number(v) : NaN;
  const code = String(d.code || "").trim().toUpperCase(), value = d.kind === "pct" ? Math.round(n(d.value) * 100) : n(d.value);
  if (!d.auto && !/^[A-Z0-9][A-Z0-9_-]{2,19}$/.test(code)) return { err:["err_pm_code", "code"] };
  if (!d.auto && all.some(x => x.id !== d.id && x.code === code)) return { err:["err_pm_dup", "code"] };
  if (d.name.trim().length < 2) return { err:["err_pm_name", "name"] };
  if (!Number.isInteger(value) || value <= 0 || value > (d.kind === "pct" ? 9000 : 100000)) return { err:["err_pm_value", "value"] };
  const minUsd = int(d.minUsd), limit = int(d.limit);
  if (Number.isNaN(minUsd)) return { err:["err_pm_int", "minUsd"] };
  if (Number.isNaN(limit)) return { err:["err_pm_int", "limit"] };
  if (d.starts && d.ends && d.ends < d.starts) return { err:["err_pm_dates", "ends"] };
  return { rec:{ id:d.id, code:d.auto ? "" : code, name:d.name.trim(), kind:d.kind, value, svc:PROMO_TYPES.filter(k => d.svc.includes(k)), minUsd, limit,
    starts:d.starts || "", ends:d.ends || "", active:!!d.active, auto:!!d.auto } };
}
Object.assign(ACT, {
  pmnew:    () => { if (denied("pricing.edit")) return; if (prDraft().promos.length >= PROMO_MAX) return toast(tf("err_pm_max", { n:PROMO_MAX })); M.ui.promoEd = blankPromo(); M.ui.peFocus = true; rerender(); },
  pmedit:   el => { const x = prDraft().promos.find(p => p.id === el.dataset.v); if (!x) return;
    M.ui.promoEd = { ...x, value:x.kind === "pct" ? pctIn(x.value) : String(x.value), minUsd:x.minUsd ? String(x.minUsd) : "", limit:x.limit ? String(x.limit) : "", svc:[...(x.svc || [])], isNew:false }; M.ui.peFocus = true; rerender(); },
  pmclose:  () => { M.ui.promoEd = null; rerender(); $('[data-act="pmnew"]')?.focus(); },
  pmdone:   () => {
    const d = M.ui.promoEd, f = prDraft(); if (!d) return;
    const { rec, err } = promoRead(d, f.promos);
    $$("#promoed [aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
    if (err) { const fld = $(`#promoed [data-pe="${err[1]}"]`); fld?.setAttribute("aria-invalid", "true"); fld?.setAttribute("aria-describedby", "pmerr"); showErr("#pmerr", t(err[0])); fld?.focus({ preventScroll:true }); return; }
    const i = f.promos.findIndex(x => x.id === rec.id); if (i >= 0) f.promos[i] = rec; else f.promos.unshift(rec);
    M.ui.promoEd = null; rerender(); $("#prbar .solid")?.focus();
  },
  pmtoggle: el => { const x = prDraft().promos.find(p => p.id === el.dataset.v); if (!x) return; x.active = !x.active; rerender(); $(`[data-act="pmtoggle"][data-v="${CSS.escape(x.id)}"]`)?.focus(); },
  pmdel:    el => { const f = prDraft(), x = f.promos.find(p => p.id === el.dataset.v); if (!x || !confirm(tf(x.auto ? "pm_del_q_auto" : "pm_del_q", { code:x.code || x.name }))) return;
    f.promos = f.promos.filter(p => p.id !== x.id); rerender(); $('[data-act="pmnew"]')?.focus(); }
});
document.addEventListener("input", e => { const k = e.target.dataset?.pe; if (k && M.ui.promoEd && e.target.type !== "checkbox") M.ui.promoEd[k] = e.target.value; });
document.addEventListener("change", e => {
  const d = M.ui.promoEd; if (!d) return;
  const k = e.target.dataset?.pe, s = e.target.dataset?.peSvc;
  if (s) { d.svc = e.target.checked ? [...new Set([...d.svc, s])] : d.svc.filter(x => x !== s); return; }
  if (!k) return;
  if (e.target.type === "checkbox") { d[k] = e.target.checked; if (k === "auto") { rerender(); $('#promoed [data-pe="auto"]')?.focus(); } return; }
  d[k] = e.target.value;
  if (k === "kind") { rerender(); $('#promoed [data-pe="kind"]')?.focus(); }
});
