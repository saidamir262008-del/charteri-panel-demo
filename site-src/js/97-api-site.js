/* ==========================================================================
   Сайт для пассажиров с сервером (CONFIG.api.base задан; пусто — файл ничего
   не делает). Домены (API.remote):
     auth      вход по телефону кодом через /auth/otp/*
     config    /public/config, /public/destinations, /public/cms — курс,
               языки, способы оплаты, техработы, направления, содержимое
     checkout  расчёт /quotes (B2C, промокод проверяет сервер) → /orders →
               /payments (Payme или Uzum) → переход на страницу оплаты →
               возврат ?payment=<id> → опрос /payments/:id
     orders    /orders (свои заказы), карточка — /orders/:id, отмена неоплаченного
     travellers сохранённые пассажиры: /travellers (в маске), заполнение формы —
               /travellers/reveal, «это я» — PATCH, удалить — DELETE, «удалить
               мои данные» — /me/erase; после оплаты сервер сам сохраняет
               пассажиров с галочкой (save), «это я» — первым во второй покупке
   В localStorage — только язык, валюта и тема (charteri.site.prefs); паспорта
   в браузере не хранятся. Заявки на чартер и просьбы об изменении заказа у
   сервера пока без маршрута — сайт просит позвонить.
   ========================================================================== */
"use strict";

if (API.on) {
  document.body.classList.add("api");
  apiUseServerData();
  apiAiCheckout();                 // «Сканировать паспорт» у путешественников (js/07-api-ai.js)
  const PREFS = "charteri.site.prefs", POLL_MS = 30000, PAY_POLL = 24, PAY_STEP_MS = 1500;
  const RS = { payKeys:{} };
  const prefs = () => { const p = readJSON(PREFS, {}); return p && typeof p === "object" ? p : {}; };
  const blank = () => { const p = prefs();
    return { v:1, lang:p.lang || sysCfg().langs.def, cur:p.cur || sysCfg().cur.def, theme:p.theme || "system", user:null, travellers:[], orders:[] }; };
  loadState = () => blank();
  freshState = () => blank();
  refresh = () => S;
  tickCharter = () => {};
  // Без пассажиров: их хранит сервер (прежняя версия держала их здесь — затираем).
  save = () => writeJSON(PREFS, { lang:S.lang, cur:S.cur, theme:S.theme });
  if (prefs().travellers) save();

  /* Способ оплаты сайта → платёжная система сервера (Click, Humo и карты — через Uzum, пока их нет отдельно). */
  const provider = m => m === "payme" ? "payme" : "uzum";

  async function loadOrders(){
    const d = await API.call("GET", "/orders?limit=100&details=1", undefined, { passive:true });
    const prev = new Map(S.orders.map(o => [o.id, o]));
    const was = JSON.stringify(S.orders.map(o => [o.id, o.version, o.status]));
    S.orders = d.items.filter(x => x.channel !== "B2B").map(x => apiOrder(x, prev.get(x.id)));
    return was !== JSON.stringify(S.orders.map(o => [o.id, o.version, o.status]));
  }
  async function loadTravellers(){
    if (!API.actor()) return;
    S.travellers = (await API.call("GET", "/travellers", undefined, { passive:true })).items.map(apiSaved);
  }
  async function enter(actor){
    S.user = { phone:actor.phone ? prettyPhone(actor.phone) : actor.email || "", at:Date.now(), uid:actor.uid };
    await loadOrders();
    await loadTravellers().catch(e => { if (e.code !== "TRAVELLERS_NOT_CONFIGURED") toast(API.errText(e)); });
  }
  /* Полные данные для формы — только своих пассажиров, только при заполнении. */
  revealSaved = async (ids, end) => (await API.call("POST", "/travellers/reveal", { ids, ...(end ? { tripDate:end } : {}) })).items.map(apiSavedFull);

  /* ---- вход ---- */
  const LOGIN_AFTER = PAGES.login.after;
  PAGES.login.after = () => { LOGIN_AFTER?.(); const ph = $("#lph"); if (ph && !M.ui.loginPhone) ph.value = ""; apiOtpPatch("lotp"); };
  ACT.lsend = async () => {
    const v = $("#lph")?.value; hideErr("#lerr");
    if (!validPhone(v)) return showErr("#lerr", t("err_phone"));
    overlay(t("api_sending"));
    try { await API.otpSend(apiPhone(v)); M.ui.loginPhone = prettyPhone(v); M.ui.loginStep = "code"; rerender(); }
    catch(e) { showErr("#lerr", API.errText(e)); }
    finally { overlay(""); }
  };
  doVerify = async () => {
    const code = ($("#lotp")?.value || "").trim();
    if (!new RegExp(`^\\d{${API_OTP_LEN}}$`).test(code)) return showErr("#lerr", t("api_err_code"));
    if (doVerify.busy) return; doVerify.busy = true; overlay(t("api_sending"));
    try {
      await enter(await API.otpVerify(apiPhone(M.ui.loginPhone), code));
      const back = M.returnTo; M.returnTo = null;
      M.ui.loginStep = "phone"; toast(t("signed_in")); go(back || "orders");
      // Вход посреди оформления (новое устройство, чистый браузер): «это я» — в первую форму.
      if (back === "checkout" && M.checkout) autoFillSelf(M.checkout);
      // Вернулись с оплаты, а сессии не было (оплата открылась в другом браузере): дождаться итога.
      if (/[?&]payment=/.test(location.search)) paymentReturn();
    } catch(e) { showErr("#lerr", API.errText(e)); const el = $("#lotp"); if (el) el.value = ""; }
    finally { doVerify.busy = false; overlay(""); }
  };
  apiOtpInput("lotp", () => doVerify());
  ACT.signout = async () => { await API.signOut(); S.user = null; S.orders = []; S.travellers = []; toast(t("signed_out")); go(""); };
  /* Профиль: удалить пассажира, «это я», удалить мои данные — на сервере. */
  const travAct = async (fn, msg) => { try { await fn(); await loadTravellers(); rerender(); if (msg) toast(t(msg)); } catch(e) { toast(API.errText(e)); } };
  ACT.deltr = el => { if (confirm(t("delete_traveller_title"))) travAct(() => API.call("DELETE", `/travellers/${encodeURIComponent(el.dataset.v)}`)); };
  ACT.trself = el => travAct(() => API.call("PATCH", `/travellers/${encodeURIComponent(el.dataset.v)}`, { self:true }), "tr_self_set");
  ACT.eraseme = () => { if (confirm(t("tr_erase_q"))) travAct(() => API.call("POST", "/me/erase", { confirm:true }), "tr_erased"); };
  const ACCOUNT = PAGES.account.render;
  PAGES.account.render = () => ACCOUNT().replace(/<button type="button" class="ghost" data-act="reset">[\s\S]*?<\/button>/, "");
  ACT.reset = () => {};
  API.onLost(code => { S.user = null; S.orders = []; S.travellers = []; toast(t(code === "SESSION_IDLE" ? "api_e_SESSION_IDLE" : "api_e_SESSION")); render(false); });

  /* ---- оформление ---- */
  const START = startCheckout;
  startCheckout = spec => {
    START(spec);
    const c = M.checkout; if (!c) return;
    c.pstate = "checking"; c.recheck = true;
    // Свежий список (оплата на другом устройстве могла сохранить новых), затем «это я» в первую форму.
    loadTravellers().then(() => { if (M.checkout === c) { autoFillSelf(c); if (currentParts()[0] === "checkout") rerender(); } }).catch(() => {});
  };
  const CHECKOUT = PAGES.checkout.render;
  PAGES.checkout.render = p => {
    if (M.checkout && !API.actor()) { M.returnTo = "checkout"; toast(t("api_need_login")); go("login"); return null; }
    const html = CHECKOUT(p);
    return html && html.replace(esc(t("secure_note")), esc(t("api_secure_note")));
  };
  PAGES.checkout.after = () => { const c = M.checkout; if (c && c.pstate === "checking" && !c.qBusy && API.actor()) apiCheckoutRecheck("B2C"); };
  /* Промокод и акции считает сервер: скидка — из расчёта. */
  bestPromo = (type) => { const q = M.checkout?.quote; return q?.promo && q.service === type ? { id:q.promo.id, code:q.promo.code || "", name:q.promo.name, auto:!!q.promo.auto, off:q.promo.off } : null; };
  applyPromo = async () => {
    const c = M.checkout; if (!c) return;
    const code = String(c.promoIn || "").trim().toUpperCase(); hideErr("#perr");
    if (!code) { showErr("#perr", t("err_promo_empty")); return; }
    const was = c.promoCode; c.promoCode = code;
    try { const q = await apiQuote(c, "B2C"); c.quote = q; c.promoIn = ""; rerender(); toast(q.promo?.code === code ? tf("promo_ok", { code }) : t("promo_better_auto")); }
    catch(e) { c.promoCode = was; $("[data-pc]")?.setAttribute("aria-invalid", "true"); showErr("#perr", e.details?.reason && t(e.details.reason) !== e.details.reason ? tf(e.details.reason, { min:"" }) : API.errText(e)); }
  };
  ACT.cpromox = () => { const c = M.checkout; if (!c) return; c.promoCode = null; c.quote = null; c.pstate = "checking"; rerender(); };
  ACT.caccept = () => { const c = M.checkout; if (!c?.pending) return; Object.assign(c, { total:c.pending.total, lines:c.pending.lines, details:c.pending.details, accepted:true, pstate:"ok" }); rerender(); };
  ACT.cpay = async () => {
    const c = M.checkout; if (!c || c.pstate !== "ok" || c.busy || !validateCheckout()) return;
    if (!payOn(c.method)) { c.method = firstPay(); rerender(); return toast(t("pay_off")); }
    c.busy = true; overlay(t("processing"));
    try {
      let q = c.quote;
      if (!apiQuoteFresh(q) || q.used) q = c.quote = await apiQuote(c, "B2C");
      if (q.gross.usd !== c.total.usd || q.gross.uzs !== c.total.uzs) {
        c.pending = { total:q.gross, lines:apiQuoteLines(q), details:{ ...c.details, ...q.details } }; c.pstate = "changed"; rerender(); toast(t("api_e_PRICING_CHANGED")); return;
      }
      if ((q.promo?.off?.usd || 0) !== (c.shownOff || 0)) { rerender(); toast(t("promo_changed")); return; }
      // Пассажиров с галочкой сервер сохранит сам после оплаты (save), здесь ничего не хранится.
      if (!c.order) {
        const d = await API.call("POST", "/orders", { quoteId:q.id, travellers:c.travellers.map((x, i) => apiCheckoutTraveller(x, i, c)),
          contact:{ phone:apiPhone(c.contact.phone), ...(c.contact.email ? { email:c.contact.email.trim() } : {}) } }, { idem:(c.orderKeys ||= {})[q.id] ||= API.uuid() });
        q.used = true; c.order = d.order;
      }
      overlay(t("api_pay_redirect"));
      const p = await API.call("POST", "/payments", { provider:provider(c.method), orderId:c.order.id, lang:S.lang }, { idem:(c.payKeys ||= {})[c.method] ||= API.uuid() });
      try { sessionStorage.setItem("charteri.site.pay", JSON.stringify({ id:p.payment.id, orderId:c.order.id })); } catch(e) {}
      M.checkout = null;
      location.assign(p.redirectUrl);
    } catch(e) {
      overlay("");
      if (["QUOTE_EXPIRED", "QUOTE_USED", "PRICING_CHANGED", "PROMO_UNAVAILABLE"].includes(e.code)) { c.quote = null; c.order = null; c.pstate = "checking"; rerender(); }
      else if (c.order) { const id = c.order.id; M.checkout = null; await loadOrders().catch(() => {}); go(`orders/${id}`); }
      toast(API.errText(e)); showErr("#cerr", API.errText(e));
    } finally { if (M.checkout === c) c.busy = false; }
  };
  /* Заказ ждёт оплаты (вернулись без оплаты) — оплатить снова. */
  ACT.opay = async el => {
    const o = S.orders.find(x => x.id === el.dataset.v); if (!o || o.status !== "PENDING") return;
    const method = payOn(M.ui.opm) ? M.ui.opm : firstPay();
    overlay(t("api_pay_redirect"));
    try {
      const p = await API.call("POST", "/payments", { provider:provider(method), orderId:o.id, lang:S.lang }, { idem:RS.payKeys[o.id + method] ||= API.uuid() });
      try { sessionStorage.setItem("charteri.site.pay", JSON.stringify({ id:p.payment.id, orderId:o.id })); } catch(e) {}
      location.assign(p.redirectUrl);
    } catch(e) { overlay(""); toast(API.errText(e)); }
  };
  /* Просьбы об изменении и заявки на чартер — пока по телефону. */
  ACT.oreqsend = () => { M.ui.reqFor = null; rerender(); toast(t("api_e_NOT_SUPPORTED")); };
  createOrder = () => { toast(t("api_charter_off")); return null; };
  /* Карточка заказа — с сервера (путешественники, история, просьбы). */
  const ORDER_AFTER = PAGES["orders/:id"].after;
  PAGES["orders/:id"].after = p => {
    ORDER_AFTER?.(p);
    const o = S.orders.find(x => x.id === p.id); if (!o || o.fullV === o.version) return;
    o.fullV = o.version;
    API.call("GET", `/orders/${o.id}`).then(d => {
      const i = S.orders.findIndex(x => x.id === o.id); if (i < 0) return;
      S.orders[i] = Object.assign(apiOrderFull(d, o), { fullV:d.order.version });
      if (currentParts()[1] === o.id) onExternalChange();
    }).catch(e => { o.fullV = null; toast(API.errText(e)); });
  };

  /* Возврат со страницы оплаты: …?payment=<id> (Uzum: /pay/ok|fail, Payme: /pay/return). */
  async function paymentReturn(){
    const q = new URLSearchParams(location.search); let id = q.get("payment"), orderId = null;
    try { const s = JSON.parse(sessionStorage.getItem("charteri.site.pay") || "null"); if (s && (!id || s.id === id)) { id = id || null; orderId = s.orderId; } } catch(e) {}
    if (!id || !/^[\w-]{8,64}$/.test(id)) return;
    history.replaceState(null, "", location.pathname.replace(/\/pay\/(ok|fail|return)\/?$/, "/") + location.hash);
    overlay(t("api_pay_wait"));
    try {
      for (let i = 0; i < PAY_POLL; i++) {
        const { payment } = await API.call("GET", `/payments/${encodeURIComponent(id)}`);
        orderId = payment.orderId || orderId;
        if (payment.status === "SUCCEEDED") { try { sessionStorage.removeItem("charteri.site.pay"); } catch(e) {} await loadOrders(); loadTravellers().catch(() => {}); toast(t("api_pay_ok")); go(`done/${orderId}`); return; }
        if (["CANCELLED", "FAILED"].includes(payment.status)) { await loadOrders(); toast(t("api_pay_fail")); go(`orders/${orderId}`); return; }
        await new Promise(r => setTimeout(r, PAY_STEP_MS));
      }
      await loadOrders(); toast(t("api_pay_slow")); if (orderId) go(`orders/${orderId}`);
    } catch(e) { toast(API.errText(e)); }
    finally { overlay(""); }
  }

  /* ---- запуск: после 99-boot.js ---- */
  setTimeout(async () => {
    try { await apiLoadPublic(API.remote("cms")); } catch(e) { toast(API.errText(e)); }
    try { const a = await API.restore(); if (a) await enter(a); } catch(e) { toast(API.errText(e)); }
    API.booting = false;
    sanitizeSelections(); render(false);
    if (S.user) paymentReturn();
    API.poll(POLL_MS, async () => {
      const cfg = await apiLoadPublic(API.remote("cms")).catch(() => false), ord = S.user ? await loadOrders().catch(() => false) : false;
      if (cfg) render(false); else if (ord) onExternalChange();
    }, true);
  }, 0);
}
