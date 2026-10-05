/* ==========================================================================
   История версий: замены текстов сайта (по ключу) и настройки сайта (по
   полю: название, описание, логотип, значок, телефон, почта, адрес, соцсети).
   Хранится в CMS_KEY (13-cms.js, hist): кто и когда поставил нынешнее
   значение и до CMS_HIST_MAX прежних, у картинок — не больше CMS_HIST_IMG
   прежних. «Восстановить» ставит версию на сайт, нынешнее значение уходит в
   историю. Право — как у сохранения: тексты — content.edit, настройки —
   content.manage.
   ========================================================================== */
"use strict";

const acmsEq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/* Сохранение: прежнее значение — наверх prev (с тем, кто и когда его поставил),
   нынешнее — от меня и сейчас. Лишнее обрезает cmsClean при записи. */
function acmsHistRec(s, kind, key, was, now){
  if (acmsEq(was, now)) return;
  const h = s.hist[kind][key] || { at:0, by:"", prev:[] };
  s.hist[kind][key] = { at:Date.now(), by:me().name, prev:[{ v:was, at:h.at, by:h.by }, ...h.prev] };
}
const acmsHistOf = (kind, key) => cmsLoad().hist[kind][key] || null;
const acmsHistId = (kind, key) => `${kind}:${key}`;
/* Название поля настроек для журнала. */
const ACMS_HIST_LBL = { title:"cms_f_site_title", desc:"cms_f_site_desc", logo:"cms_f_logo", favicon:"cms_f_favicon",
  phone:"phone_label", email:"agency_email", address:"cms_f_site_address", socials:"cms_follow" };

/* ---- показ ---- */
const ACMS_HIST_CUT = 90;
const acmsCut = s => s.length > ACMS_HIST_CUT ? s.slice(0, ACMS_HIST_CUT - 1) + "…" : s;
const acmsHistNone = key => `<span class="muted">${esc(t(key))}</span>`;
/* Текст на трёх языках: только заполненные языки; пусто — текст по умолчанию (у замен) или «пусто». */
function acmsHistLines(v, isText){
  const ls = CMS_LANGS.filter(l => v?.[l]);
  return ls.length ? ls.map(l => `<span class="cms-hist-l"><i>${l.toUpperCase()}</i>${esc(acmsCut(v[l]))}</span>`).join("") : acmsHistNone(isText ? "cms_hist_def" : "cms_hist_empty");
}
function acmsHistPrev(kind, key, v){
  if (kind === "texts" || ACMS_SITE_L.includes(key)) return acmsHistLines(v, kind === "texts");
  if (CMS_SITE_IMG.includes(key)) return v ? `<img src="${v}" alt="${esc(t("cms_hist_img"))}">` : acmsHistNone("cms_hist_noimg");
  if (key === "socials") { const ls = CMS_SOCIALS.filter(k => v?.[k]);
    return ls.length ? ls.map(k => `<span class="cms-hist-l"><i>${esc(t("cms_soc_" + k))}</i>${esc(v[k])}</span>`).join("") : acmsHistNone("cms_hist_empty"); }
  return v ? esc(v) : acmsHistNone("cms_hist_empty");
}
/* Кнопка «История (n)» — только если есть прежние версии; label — что это за поле. */
function acmsHistBtn(kind, key, label){
  const n = acmsHistOf(kind, key)?.prev.length || 0; if (!n) return "";
  const id = acmsHistId(kind, key), open = M.ui.cmsHist === id;
  return `<button type="button" class="link cms-hist-b" data-act="acmshist" data-v="${id}" aria-expanded="${open}"${open ? ` aria-controls="hist-${kind}-${key}"` : ""}
    aria-label="${esc(tf("cms_hist_n", { n }))}: ${esc(label)}">${esc(tf("cms_hist_n", { n }))}</button>`;
}
function acmsHistPanel(kind, key, label){
  const id = acmsHistId(kind, key), h = acmsHistOf(kind, key);
  if (M.ui.cmsHist !== id || !h?.prev.length) return "";
  const perm = kind === "texts" ? "content.edit" : "content.manage";
  const when = e => e.at ? `${e.by || "—"} · ${fdt(e.at)}` : t("cms_hist_orig");
  const cur = kind === "texts" ? acmsTxOf(cmsTexts()[key]) : cmsSite()[key];
  return `<div class="cms-hist" id="hist-${kind}-${key}" role="group" aria-label="${esc(t("cms_hist"))}: ${esc(label)}">
    <p class="small muted">${esc(tf(CMS_SITE_IMG.includes(key) ? "cms_hist_d_img" : "cms_hist_d", { n:CMS_HIST_MAX, m:CMS_HIST_IMG }))}</p><ol>
    <li class="is-now"><div class="cms-hist-v">${acmsHistPrev(kind, key, cur)}</div><span class="small muted"><b>${esc(t("cms_hist_now"))}</b> · ${esc(when(h))}</span></li>
    ${h.prev.map((e, i) => `<li><div class="cms-hist-v">${acmsHistPrev(kind, key, e.v)}</div><span class="small muted">${esc(when(e))}</span>
      <button type="button" class="link" data-act="acmshistgo" data-v="${id}" data-i="${i}" data-at="${e.at}" aria-label="${esc(t("cms_hist_go"))}: ${esc(label)} — ${esc(when(e))}" ${guard(perm)}>${esc(t("cms_hist_go"))}</button></li>`).join("")}</ol></div>`;
}

/* ---- восстановление ----
   Версию ищем в свежих данных по номеру и времени: другая вкладка могла
   записать новую версию — тогда номер сдвинулся, и мы не восстановим не то. */
function acmsHistRestore(kind, key, i, at){
  if (denied(kind === "texts" ? "content.edit" : "content.manage")) return false;
  const def = kind === "texts" ? SITE_STR[key] : null;
  if (kind === "texts" ? !def : !CMS_SITE_F.includes(key)) return false;
  let gone = false, same = false;
  const ok = acmsCommit("cms_restore_ver", s => {
    const h = s.hist[kind][key], e = h?.prev[i];
    if (!e || e.at !== at) { gone = true; return null; }
    const was = kind === "texts" ? acmsTxOf(s.texts[key]) : s.site[key], now = kind === "texts" ? acmsTxOf(e.v) : e.v;
    const diff = kind === "texts" ? acmsTxDiff(def, was, now) : acmsSiteDiff([key], s.site, { [key]:now });
    if (!diff.length) { same = true; return null; }
    if (kind === "site") s.site[key] = now;
    else if (CMS_LANGS.some(l => now[l])) s.texts[key] = now; else delete s.texts[key];
    s.hist[kind][key] = { at:Date.now(), by:me().name, prev:[{ v:was, at:h.at, by:h.by }, ...h.prev.filter((_, j) => j !== i)] };
    return { vars:{ what:kind === "texts" ? key : strRef(ACMS_HIST_LBL[key]) }, diff };
  });
  if (!ok) { if (gone || same) toast(t(gone ? "err_cms_changed" : "pr_same")); return false; }
  // Несохранённая правка этого текста или поля больше не к месту: на сайте — восстановленное.
  if (kind === "texts") { if (M.ui.cmsTx) delete M.ui.cmsTx[key]; }
  else for (const k of Object.keys(M.ui.cmsSite?.v || {})) if (k.split(".")[0] === key) { delete M.ui.cmsSite.v[k]; delete M.ui.cmsSite.base[k]; }
  return true;
}

Object.assign(ACT, {
  acmshist:   el => { const id = el.dataset.v; M.ui.cmsHist = M.ui.cmsHist === id ? null : id; rerender(); $(`[data-act="acmshist"][data-v="${CSS.escape(id)}"]`)?.focus(); },
  acmshistgo: el => {
    const id = el.dataset.v, c = id.indexOf(":"), kind = id.slice(0, c), key = id.slice(c + 1);
    if (!["texts", "site"].includes(kind) || !acmsHistRestore(kind, key, Number(el.dataset.i), Number(el.dataset.at))) return;
    rerender(); toast(t("t_cms_hist")); $(`[data-act="acmshist"][data-v="${CSS.escape(id)}"]`)?.focus();
  }
});
