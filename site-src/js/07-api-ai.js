/* ==========================================================================
   Помощники ИИ с сервером (charteri-api: /ai/status, /ai/passport). Без
   CONFIG.api.base ничего не делает: в демо кнопок нет.

     APIAI.load()        что включено: ключ на сервере, переключатель в
                         «Системе», месячный лимит (GET /ai/status)
     APIAI.on(f)         показывать ли кнопку: passport, translate, seo, crm
     APIAI.pick(fn)      выбор фото: на телефоне — камера или галерея/файлы
     APIAI.scan(file, o) фото → JPEG до 2000 px в браузере (метаданные и GPS
                         отбрасываются, HEIC iPhone браузер сам переводит в
                         JPEG; не открылось — файл как есть, метаданные
                         вырезает сервер) → POST /ai/passport → поля паспорта
   «Сканировать паспорт» у каждого путешественника: оформление на сайте и в
   кабинете (apiAiCheckout), заказ в офисе и правка пассажиров в админке
   (admin/96-api-ai.js). Поля заполняются, сомнительные выделяются; рядом —
   пояснение ai_privacy: фото уходит в OpenAI, Charteri его не хранит, OpenAI
   может хранить запрос до 30 дней. Фото нигде не сохраняется: ни в
   localStorage, ни в состоянии страницы.
   ========================================================================== */
"use strict";

const APIAI = (() => {
  const MAX_SIDE = 2000, QUALITY = 0.85, RETRY_MS = 30000, OFF_CODES = ["AI_OFF", "AI_NOT_CONFIGURED", "AI_BUDGET"];
  // Статус — того, кто вошёл: вышли или вошёл другой — загружается заново.
  let status = null, uid = null, loading = null, failAt = 0;
  async function load(){
    const who = API.on && API.actor()?.uid; if (!who) return null;
    if (loading) return loading;
    if (Date.now() - failAt < RETRY_MS) return null;           // нет связи — не спрашивать на каждой перерисовке
    loading = API.call("GET", "/ai/status")
      .then(s => { status = s; uid = who; return s; }, e => {
        if (e.code === "NETWORK") { failAt = Date.now(); return null; }
        status = { configured:false, features:{} }; uid = who; return status; })
      .finally(() => { loading = null; });
    return loading;
  }
  /* Первый показ формы: статус ещё не известен — загрузить и перерисовать. */
  function on(f){
    const who = API.on && API.actor()?.uid; if (!who) return false;
    if (uid !== who) { load().then(s => { if (s?.features?.[f]) rerender(); }); return false; }
    return !!status?.features?.[f];
  }
  /* Сервер отказал (выключили, нет ключа, лимит) — кнопка пропадает. */
  function off(e){ if (OFF_CODES.includes(e?.code) && status) { status = { ...status, features:{} }; return true; } return false; }

  function pick(fn){
    // Без capture: телефон предлагает и камеру, и галерею/файлы (готовое фото
    // паспорта, вложение из Telegram).
    const inp = Object.assign(document.createElement("input"), { type:"file", accept:"image/*" });
    inp.style.display = "none";
    inp.addEventListener("change", () => { const f = inp.files?.[0]; inp.remove(); if (f) fn(f); }, { once:true });
    document.body.append(inp); inp.click();
  }
  const readUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new ApiError("BAD_IMAGE")); r.readAsDataURL(file); });
  function decode(file){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
      img.src = url;
    });
  }
  /* Уменьшить и пересжать: меньше трафика и токенов, без EXIF. Не открылось
     (HEIC в браузере без поддержки) — JPEG/PNG/WebP уходят как есть (EXIF и GPS
     вырезает сервер до OpenAI), остальное — ошибка. */
  async function shrink(file){
    try {
      const img = await decode(file), k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = Object.assign(document.createElement("canvas"), { width:Math.round(img.naturalWidth * k), height:Math.round(img.naturalHeight * k) });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", QUALITY);
    } catch(e) {
      if (/^image\/(jpeg|png|webp)$/.test(file.type)) return readUrl(file);
      throw new ApiError("BAD_IMAGE", 422, { reason:/hei[cf]/i.test(file.type + file.name) ? "err_img_heic" : "err_img_type" });
    }
  }
  async function scan(file, o = {}){
    const image = await shrink(file);
    try { return await API.call("POST", "/ai/passport", { image, app:API.app, ...(o.tripDate ? { tripDate:o.tripDate } : {}) }); }
    catch(e) { off(e); throw e; }
  }
  return { load, on, off, pick, scan, status:() => status, reset:() => { status = null; uid = null; } };
})();

/* Ответ сервера → поля формы демо. sex → gender, nationality → cit. */
const AI_FIELD = { surname:"surname", given:"given", passport:"passport", sex:"gender", nationality:"cit", dob:"dob", expiry:"expiry" };
function apiAiFields(r){
  const out = {}, f = r.fields || {};
  for (const [k, to] of Object.entries(AI_FIELD)) if (f[k]) out[to] = String(f[k]);
  return out;
}
const apiAiVerify = r => (r.verify || []).map(k => AI_FIELD[k]).filter(Boolean);
/* Ошибка распознавания — свой текст (размер фото другой, чем у логотипа). */
function apiAiErr(e){
  const heic = e?.details?.reason === "err_img_heic";
  if (e?.code === "BAD_IMAGE") return t(heic ? "ai_e_heic" : "ai_e_img");
  return API.errText(e);
}
const AI_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
/* Кнопка, пояснение о фото, итог проверки (что сверить, предупреждения). */
function apiAiScanBlock(scope, i, x){
  const busy = M.ui.aiBusy === `${scope}:${i}`, w = (x?.aiw || []).filter(c => t("ai_w_" + c) !== "ai_w_" + c);
  return `<div class="ai-scan stack" style="gap:4px">
    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="aiscan" data-scope="${scope}" data-i="${i}" ${busy ? 'disabled aria-busy="true"' : ""}>
      ${busy ? '<span class="spin"></span>' : AI_CAM}<span>${esc(t(busy ? "ai_scan_busy" : "ai_scan"))}</span></button>
      <span class="muted small">${esc(t("ai_privacy"))}</span></div>
    ${x?.aiMatch ? `<p class="small muted" role="status">${esc(tf("tr_matched", { name:x.aiMatch }))}</p>` : ""}
    ${x?.aiv?.length || w.length ? `<p class="small ai-check" role="status">${esc([...(x.aiv?.length ? [t("ai_verify")] : []), ...w.map(c => t("ai_w_" + c))].join(" · "))}</p>` : ""}</div>`;
}
/* Пометить поля «проверьте»: атрибут data-ai-verify у полей формы. */
function apiAiMark(html, sel, keys){
  for (const k of keys || []) html = html.split(sel(k)).join(`${sel(k)} data-ai-verify`);
  return html;
}
/* Распознать и разложить по полям: scope → {x(i) — объект полей, apply(x, r), trip()}. */
const AI_SCOPES = {};
async function apiAiRun(scope, i, file){
  const s = AI_SCOPES[scope]; if (!s) return;
  M.ui.aiBusy = `${scope}:${i}`; rerender();
  try {
    const r = await APIAI.scan(file, { tripDate:s.trip?.() || "" });
    const x = s.x(i); if (!x) return;
    s.apply(x, r);
    // «Проверьте» и предупреждения — только о полях, которые форма показывает.
    const vis = s.visible?.(x);
    x.aiv = apiAiVerify(r).filter(k => !vis || vis.includes(k));
    x.aiw = (r.warnings || []).map(w => w.code).filter(c => !vis || vis.includes("expiry") || !EXPIRY_WARN.includes(c));
    toast(t("ai_scan_done"));
  } catch(e) { toast(apiAiErr(e)); }
  finally { M.ui.aiBusy = null; rerender(); }
}
/* Кнопка и снятие отметки «проверьте» после правки руками. Вызывается из
   адаптеров приложений (ACT объявлен позже, в js/10-core.js). */
function apiAiActs(){
  if (!API.on || ACT.aiscan) return;
  ACT.aiscan = el => { const scope = el.dataset.scope, i = Number(el.dataset.i); APIAI.pick(file => apiAiRun(scope, i, file)); };
  document.addEventListener("input", e => { if (e.target.hasAttribute?.("data-ai-verify")) e.target.removeAttribute("data-ai-verify"); });
}

/* Оформление на сайте и в кабинете: кнопка у каждого путешественника с паспортом. */
function apiAiCheckout(){
  if (!API.on) return;
  apiAiActs();
  AI_SCOPES.co = {
    x:i => M.checkout?.travellers[i],
    trip:() => M.checkout?.end || "",
    // Тот же паспорт уже сохранён — форма ссылается на него (savedId); новый паспорт того же человека — ссылка остаётся.
    apply:(x, r) => {
      const was = x.fromId && `${x.surname}|${x.given}`;
      Object.assign(x, apiAiFields(r));
      x.fromId = r.saved?.id || (was && was === `${x.surname}|${x.given}` ? x.fromId : null);
      x.fromSnap = x.fromId ? { surname:x.surname, given:x.given, passport:x.passport } : null;
      x.aiMatch = r.saved ? `${r.saved.given} ${r.saved.surname}` : ""; x.renew = false;
    },
  };
  const TF = travellerForm;
  travellerForm = (x, i, mode) => {
    let html = TF(x, i, mode);
    if (mode !== "full" || !APIAI.on("passport")) return html;
    // Гражданство, которого нет в списке, — отдельной строкой списка.
    if (x.cit && !CITS.includes(x.cit)) html = html.replace(`data-tv="${i}" data-f="cit">`, `data-tv="${i}" data-f="cit"><option selected>${esc(x.cit)}</option>`);
    html = apiAiMark(html, k => `data-tv="${i}" data-f="${k}"`, (x.aiv || []).filter(k => k !== "gender"));
    if ((x.aiv || []).includes("gender")) html = apiAiMark(html, v => `data-act="cgender" data-v="${v}" data-i="${i}"`, ["M", "F"]);
    return html.replace(/(<div class="tform-h">[\s\S]*?<\/div>)/, `$1${apiAiScanBlock("co", i, x)}`);
  };
}
