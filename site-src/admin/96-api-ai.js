/* ==========================================================================
   Помощники ИИ в админке с сервером (без CONFIG.api.base файл ничего не делает).
     - «Сканировать паспорт»: заказ в офисе и правка пассажиров заказа
       (право «Заказы: правка»); пол, даты и гражданство из паспорта (и из
       поиска клиента по телефону) видны и правятся в строке пассажира и уходят
       на сервер вместе с именем и номером; другой человек в строке — сброс;
     - редактор сайта: «Перевести» (RU → UZ латиницей и EN) и, у страниц,
       «Предложить SEO» — только черновики в форме, сохраняет и публикует
       сотрудник обычными кнопками;
     - CRM (лид, клиент, агентство): «Сводка» и «Черновик ответа» — на экране,
       копировать или в заметку; сервер ничего не отправляет;
     - «Система»: карточка «Помощники ИИ» — переключатели (settings.manage),
       модель и расходы месяца.
   Кнопки видны, только когда сервер говорит, что помощник включён (APIAI.on).
   ========================================================================== */
"use strict";

if (API.on) {
  apiAiActs();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const busy = k => M.ui.aiBusy === k || String(M.ui.aiBusy || "").startsWith(k + ":");
  const spinOr = (k, label) => busy(k) ? `<span class="spin"></span><span>${esc(t("ai_busy"))}</span>` : `<span>${esc(t(label))}</span>`;
  /* Вставить блок после n-й легенды (строки пассажиров — fieldset с legend). */
  const afterLegends = (html, block) => { let n = 0; return html.replace(/<\/legend>/g, m => m + block(n++)); };
  const SCAN_KEYS = ["gender", "dob", "expiry", "cit"];
  const scanExtras = r => { const f = apiAiFields(r); return Object.fromEntries(SCAN_KEYS.filter(k => f[k]).map(k => [k, f[k]])); };
  const snapOf = x => ({ surname:x.surname, given:x.given, passport:x.passport });
  /* Пол, даты и гражданство из скана или поиска по телефону уходят на сервер —
     поэтому они видны и правятся в строке пассажира (не скрыты), сомнительные
     выделены. Поля data-sc="<scope>.<i>.<поле>" пишут в row.scan. */
  function scanFieldsHtml(scope, i, x){
    const sc = x.scan || {}, mark = k => (x.aiv || []).includes(k) ? " data-ai-verify" : "";
    const inp = (k, label, extra) => `<label class="field"><span>${esc(t(label))}</span><input data-sc="${scope}.${i}.${k}" value="${esc(sc[k] || "")}" ${extra}${mark(k)}></label>`;
    return `<div class="sgrid sgrid-2 ai-scan-extra">
      <label class="field"><span>${esc(t("gender"))}</span><select data-sc="${scope}.${i}.gender"${mark("gender")}><option value=""></option>${["M", "F"].map(v =>
        `<option value="${v}" ${sc.gender === v ? "selected" : ""}>${esc(t(v === "M" ? "gender_m" : "gender_f"))}</option>`).join("")}</select></label>
      ${inp("cit", "citizenship", 'class="upper" maxlength="3" autocomplete="off" spellcheck="false"')}
      ${inp("dob", "dob", `type="date" max="${TODAY}"`)}${inp("expiry", "expiry", 'type="date"')}</div>`;
  }
  /* Вставить поля скана в n-ю строку пассажира (перед </fieldset>), где они есть. */
  const withScanFields = (html, scope, list, show) => { let n = 0; return html.replace(/<\/fieldset>/g, m => { const i = n++, x = list[i];
    return (x && x.scan && show(x) ? scanFieldsHtml(scope, i, x) : "") + m; }); };
  const scanList = scope => scope === "on" ? M.ui.onew?.list : scope === "ot" ? M.ui.otEdit?.list : null;
  const onScanField = e => {
    const p = e.target.dataset?.sc; if (!p) return;
    const [scope, i, k] = p.split("."), x = scanList(scope)?.[i]; if (!x || !SCAN_KEYS.includes(k)) return;
    const v = k === "cit" ? e.target.value.trim().toUpperCase() : e.target.value;
    x.scan = { ...(x.scan || {}) }; if (v) x.scan[k] = v; else delete x.scan[k];
    if (x.aiv?.length) x.aiv = x.aiv.filter(f => f !== k);
    if (k === "expiry" && x.aiw?.length) x.aiw = x.aiw.filter(c => !EXPIRY_WARN.includes(c));
    e.target.removeAttribute("data-ai-verify");
  };
  document.addEventListener("input", onScanField);
  document.addEventListener("change", onScanField);

  /* ---------------- заказ в офисе ---------------- */
  const onFlight = () => M.ui.onew?.type === "FLIGHT";
  AI_SCOPES.on = {
    x:i => M.ui.onew?.list[i],
    // «Проверьте» — только для полей, которые видны в строке.
    visible:() => ["surname", "given", ...(onFlight() ? ["passport", ...SCAN_KEYS] : [])],
    trip:() => { const d = M.ui.onew; if (!d) return ""; return d.type === "FLIGHT" ? d.date : addDays(d.checkin, Number(d.nights) || 0); },
    apply:(x, r) => { const f = apiAiFields(r);
      for (const k of ["surname", "given", ...(M.ui.onew?.type === "FLIGHT" ? ["passport"] : [])]) if (f[k]) x[k] = f[k];
      x.scan = scanExtras(r); x.scanSnap = snapOf(x); },
  };
  const ON_FORM = orderNewForm;
  orderNewForm = () => {
    let html = ON_FORM(); const d = M.ui.onew;
    if (!d || !html) return html;
    html = withScanFields(html, "on", d.list, () => d.type === "FLIGHT");
    if (!can("orders.edit") || !APIAI.on("passport")) return html;
    return afterLegends(apiAiMarkRows(html, d.list, (i, k) => `data-onp="${i}.${k}"`), i => apiAiScanBlock("on", i, d.list[i]));
  };
  function apiAiMarkRows(html, list, sel){
    list.forEach((x, i) => { html = apiAiMark(html, k => sel(i, k), (x.aiv || []).filter(k => ["surname", "given", "passport"].includes(k))); });
    return html;
  }

  /* ---------------- правка пассажиров заказа ---------------- */
  AI_SCOPES.ot = {
    x:i => M.ui.otEdit?.list[i],
    visible:x => ["surname", "given", ...(x.pp ? ["passport", ...SCAN_KEYS] : [])],
    trip:() => M.ui.aiOtEnd || "",
    apply:(x, r) => { const f = apiAiFields(r);
      for (const k of ["surname", "given", ...(x.pp ? ["passport"] : [])]) if (f[k]) x[k] = f[k];
      x.scan = x.pp ? scanExtras(r) : null; x.scanSnap = snapOf(x); },
  };
  const PAX_EDIT = paxEdit;
  paxEdit = r => {
    let html = PAX_EDIT(r); const d = M.ui.otEdit;
    if (!d || d.id !== r.o.id || d.free) return html;
    html = withScanFields(html, "ot", d.list, x => x.pp);
    if (!can("orders.edit") || !APIAI.on("passport")) return html;
    M.ui.aiOtEnd = r.o.end || "";
    return afterLegends(apiAiMarkRows(html, d.list, (i, k) => `data-ot="${i}.${k}"`), i => apiAiScanBlock("ot", i, d.list[i]));
  };
  /* Пол, даты и гражданство из скана — в пассажиров заказа перед отправкой (PUT travellers). */
  const SAVE_PAX = savePax;
  savePax = r => {
    const d = M.ui.otEdit, extras = d?.id === r.o.id ? d.list.map(x => x.scan || null) : [];
    if (!extras.some(Boolean)) return SAVE_PAX(r);
    const MUT = mutOrder;
    mutOrder = (rr, fn) => MUT(rr, (o, st) => { const res = fn(o, st); o.travellers = o.travellers.map((y, i) => extras[i] ? { ...y, ...extras[i] } : y); return res; });
    try { return SAVE_PAX(r); } finally { mutOrder = MUT; }
  };

  /* ---------------- редактор сайта: перевод и SEO ---------------- */
  const langFields = d => ACMS_FIELDS[d.type].filter(([, kind]) => kind === "l" || kind === "lt").map(([f]) => f);
  const ACMS_FORM = acmsForm;
  acmsForm = d => {
    let html = ACMS_FORM(d);
    const editor = can("content.edit") || can("content.create");
    const tr = editor && APIAI.on("translate"), seo = editor && d.type === "page" && APIAI.on("seo");
    if (!tr && !seo) return html;
    html = apiAiMark(html, k => `data-ce="${k}"`, d.aiv || []);
    const row = `<div class="row ai-row" style="gap:8px;flex-wrap:wrap">
      ${tr ? `<button type="button" class="ghost sm" data-act="aitr" ${busy("cms") ? "disabled" : ""}>${spinOr("cms:tr", "ai_translate")}</button>` : ""}
      ${seo ? `<button type="button" class="ghost sm" data-act="aiseo" ${busy("cms") ? "disabled" : ""}>${spinOr("cms:seo", "ai_seo")}</button>` : ""}
      <span class="muted small">${esc(t("ai_cms_note"))}</span></div>`;
    return html.replace(/(<div class="card-h">[\s\S]*?<\/div>)/, `$1${row}`);
  };
  async function cmsAi(kind, fn){
    const d = M.ui.cmsEd; if (!d || M.ui.aiBusy) return;
    M.ui.aiBusy = "cms:" + kind; rerender();
    try { if (await fn(d) !== false && M.ui.cmsEd === d) toast(t(kind === "tr" ? "ai_translate_done" : "ai_seo_done")); }
    catch(e) { APIAI.off(e); toast(API.errText(e)); }
    finally { M.ui.aiBusy = null; rerender(); }
  }
  ACT.aitr = () => cmsAi("tr", async d => {
    const keys = langFields(d).filter(f => String(d[f]?.ru || "").trim());
    if (!keys.length) { toast(t("ai_translate_none")); return false; }
    if (keys.some(f => d[f].uz || d[f].en) && !confirm(t("ai_translate_q"))) return false;
    const r = await API.call("POST", "/admin/ai/translate", { ...(UUID.test(d.id || "") ? { itemId:d.id } : {}), fields:Object.fromEntries(keys.map(f => [f, d[f].ru.trim()])) });
    if (M.ui.cmsEd !== d) return false;
    d.aiv = [];
    for (const f of keys) for (const l of ["uz", "en"]) { const v = r.fields?.[f]?.[l]; if (v) { d[f][l] = v.slice(0, acmsMax(d.type, f)); d.aiv.push(`${f}.${l}`); } }
  });
  ACT.aiseo = () => cmsAi("seo", async d => {
    const title = String(d.title?.ru || "").trim(); if (!title) { toast(t("ai_translate_none")); return false; }
    if ([...CMS_LANGS].some(l => d.seoTitle?.[l] || d.seoDesc?.[l]) && !confirm(t("ai_seo_q"))) return false;
    const r = await API.call("POST", "/admin/ai/seo", { ...(UUID.test(d.id || "") ? { itemId:d.id } : {}), title, text:String(d.body?.ru || "").slice(0, 6000) });
    if (M.ui.cmsEd !== d) return false;
    d.aiv = [];
    for (const [f, src] of [["seoTitle", r.seoTitle], ["seoDesc", r.seoDesc]]) for (const l of CMS_LANGS) if (src?.[l]) { d[f][l] = src[l].slice(0, acmsMax(d.type, f)); d.aiv.push(`${f}.${l}`); }
  });

  /* ---------------- CRM: сводка и черновик ответа ---------------- */
  const CRM_TARGET = /^(l:[0-9a-f-]{36}|c:\d{9,15}|a:[0-9a-f-]{36})$/i;
  const crmState = tg => ((M.ui.aiCrm ||= {})[tg] ||= {});
  const NOTES = notesBlock;
  notesBlock = (target, targets) => NOTES(target, targets) + aiCrmBlock(target);
  function aiCrmBlock(tg){
    if (!CRM_TARGET.test(tg) || (tg.startsWith("l:") && !UUID.test(tg.slice(2))) || !can("crm.view") || !APIAI.on("crm")) return "";
    const s = crmState(tg), id = "aih-" + cssKey(tg), k = "crm:" + tg, edit = can("crm.edit");
    return `<section class="card stack ai-crm" aria-labelledby="${id}"><h2 id="${id}">${esc(t("ai_crm_h"))}</h2>
      <p class="muted small">${esc(t("ai_crm_privacy"))}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="aisum" data-v="${esc(tg)}" ${M.ui.aiBusy ? "disabled" : ""}>${spinOr(k + ":sum", "ai_summary")}</button></div>
      ${s.summary ? `<div class="ai-out" role="status"><p style="margin:0">${esc(s.summary)}</p>${s.next ? `<p class="small" style="margin:8px 0 0"><b>${esc(t("ai_next"))}:</b> ${esc(s.next)}</p>` : ""}</div>` : ""}
      ${edit ? `<div class="sgrid sgrid-2"><label class="field"><span>${esc(t("ai_reply_lang"))}</span><select data-inp="ail:${esc(tg)}">${CMS_LANGS.map(l =>
          `<option value="${l}" ${inp("ail:" + tg, S.lang) === l ? "selected" : ""}>${esc(langName(l))}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("ai_reply_hint"))}</span>${inpField("aih:" + tg, { label:t("ai_reply_hint"), extra:'maxlength="300"' })}</label></div>
        <div class="row"><button type="button" class="ghost sm" data-act="aireply" data-v="${esc(tg)}" ${M.ui.aiBusy ? "disabled" : ""}>${spinOr(k + ":reply", "ai_reply")}</button></div>
        ${s.draft != null ? `<div class="ai-out stack" style="gap:8px"><textarea data-aidraft="${esc(tg)}" rows="5" lang="${esc(s.lang || "")}" aria-label="${esc(t("ai_reply"))}">${esc(s.draft)}</textarea>
          <div class="row"><button type="button" class="ghost sm" data-act="aicopy" data-v="${esc(tg)}">${esc(t("ai_copy"))}</button>
          ${canNote(tg) ? `<button type="button" class="link" data-act="aitonote" data-v="${esc(tg)}">${esc(t("ai_to_note"))}</button>` : ""}</div></div>` : ""}` : ""}
      <p class="muted small">${esc(t("ai_draft_note"))}</p></section>`;
  }
  async function crmAi(tg, kind, fn){
    if (M.ui.aiBusy) return;
    M.ui.aiBusy = `crm:${tg}:${kind}`; rerender();
    try { await fn(crmState(tg)); } catch(e) { APIAI.off(e); toast(API.errText(e)); }
    finally { M.ui.aiBusy = null; rerender(); }
  }
  ACT.aisum = el => crmAi(el.dataset.v, "sum", async s => {
    const r = await API.call("POST", "/admin/ai/crm/summary", { target:el.dataset.v, lang:S.lang });
    s.summary = r.summary; s.next = r.nextStep || "";
  });
  ACT.aireply = el => crmAi(el.dataset.v, "reply", async s => {
    const tg = el.dataset.v, hint = String(inp("aih:" + tg, "")).trim();
    const r = await API.call("POST", "/admin/ai/crm/reply", { target:tg, lang:inp("ail:" + tg, S.lang), ...(hint ? { hint } : {}) });
    s.draft = r.draft; s.lang = r.lang;
  });
  ACT.aicopy = el => {
    const tg = el.dataset.v, text = crmState(tg).draft || "", done = () => toast(t("ai_copied"));
    const area = $(`[data-aidraft="${CSS.escape(tg)}"]`);
    // Буфер обмена есть только на https; иначе — выделить текст и скопировать по-старому.
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => {});
    else if (area) { area.select(); if (document.execCommand("copy")) done(); }
  };
  ACT.aitonote = el => { const tg = el.dataset.v, s = crmState(tg);
    Object.assign(M.ui.inp ||= {}, { ["nt:" + tg]:String(s.draft || "").slice(0, NOTE_MAX), ["nk:" + tg]:"message" }); rerender(); $(`[data-inp="${CSS.escape("nt:" + tg)}"]`)?.focus(); };
  document.addEventListener("input", e => { const tg = e.target.dataset?.aidraft; if (tg) crmState(tg).draft = e.target.value; });

  /* ---------------- «Система»: переключатели помощников ---------------- */
  const AI_SW = [["passport_enabled", "sys_ai_passport"], ["translate_enabled", "sys_ai_translate"], ["seo_enabled", "sys_ai_seo"], ["crm_enabled", "sys_ai_crm"]];
  function sysAiCard(){
    const s = APIAI.status(), u = s?.usage, sw = M.ui.aisw || s?.switches || {}, dis = can("settings.manage") ? "" : "disabled";
    if (!s && !M.ui.aiSysLoad) { M.ui.aiSysLoad = true; APIAI.load().then(x => { if (x) rerender(); }); }
    const state = !s ? "" : !s.configured ? t("sys_ai_nokey")
      : `${tf("sys_ai_state", { model:u?.model || "—", spent:String(u?.spentUsd ?? 0), cap:String(u?.capUsd ?? 0), calls:String(u?.calls ?? 0) })}${u && !u.budgetLeft ? " · " + t("sys_ai_budget") : ""}`;
    return sysCard("ai", `${state ? `<p class="small">${esc(state)}</p>` : ""}
      <fieldset class="sys-checks"><legend class="sr-only">${esc(t("sys_h_ai"))}</legend>${AI_SW.map(([k, label]) =>
        `<label class="chk"><input type="checkbox" data-aisw="${k}" ${sw[k] !== false ? "checked" : ""} ${dis}><span>${esc(t(label))}</span></label>`).join("")}</fieldset>
      <div class="row sys-foot"><button type="button" class="solid sm" data-act="aiswsave" ${guard("settings.manage")} ${busy("sys") ? "disabled" : ""}>${esc(t("st_save"))}</button></div>`);
  }
  SYS_CARDS.splice(SYS_CARDS.indexOf("api") + 1, 0, "ai");
  SYS_RENDER.ai = sysAiCard;
  document.addEventListener("change", e => { const k = e.target.dataset?.aisw; if (!k) return; (M.ui.aisw ||= { ...(APIAI.status()?.switches || {}) })[k] = e.target.checked; });
  ACT.aiswsave = async () => {
    if (denied("settings.manage") || M.ui.aiBusy) return;
    const cur = APIAI.status()?.switches || {}, sw = M.ui.aisw || cur;
    const value = Object.fromEntries(AI_SW.map(([k]) => [k, sw[k] !== false]));
    M.ui.aiBusy = "sys"; rerender();
    try { await API.call("PUT", "/admin/settings/ai", { value }); M.ui.aisw = null; await APIAI.load(); toast(t("api_saved")); }
    catch(e) { toast(API.errText(e)); }
    finally { M.ui.aiBusy = null; rerender(); }
  };
}
