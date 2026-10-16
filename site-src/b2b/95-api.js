/* ==========================================================================
   Кабинет агентства с сервером (CONFIG.api.base задан; пусто — этот файл
   ничего не делает). Подменяет домены по одному (API.remote):
     auth      вход кодом через /auth/otp/*, заявка на подключение
     agency    /agency, /agency/ledger, /agency/topups — баланс, выписка,
               пополнения (перевод и касса — заявка, карта — POST /payments
               {provider: payme|uzum, topup}; зачисляет только вебхук)
     orders    расчёт (/quotes, B2B) → заказ → оплата с баланса
               (Idempotency-Key, expectedVersion), отмена, заявка на чартер
     notes     колокольчик: /notifications (опрос), прочитано
     brand     PUT /agency/brand, логотип — POST /agency/logo
     clients   база клиентов агентства: /agency/clients (в маске), поиск в
               оформлении — /agency/clients/search, заполнение и правка —
               /agency/clients/reveal; после оплаты сервер сам кладёт в базу
               пассажиров с галочкой (save), первого — с контактами заказа
   В localStorage — только язык, валюта и тема (charteri.b2b.prefs); паспорта
   клиентов в браузере не хранятся.
   ========================================================================== */
"use strict";

if (API.on) {
  document.body.classList.add("api");
  apiUseServerData();
  apiAiCheckout();                 // «Сканировать паспорт» у путешественников (js/07-api-ai.js)
  const PREFS = "charteri.b2b.prefs", POLL_MS = 20000, BRAND_DEBOUNCE_MS = 1200;
  const RB = { loaded:false, brandSent:"", brandTimer:0, brandErr:"", brandDirty:false, payKeys:{} };
  const prefs = () => { const p = readJSON(PREFS, {}); return p && typeof p === "object" ? p : {}; };
  const blank = () => { const p = prefs();
    return { v:1, lang:p.lang || sysCfg().langs.def, cur:p.cur || sysCfg().cur.def, theme:p.theme || "system", user:null, session:null,
      agency:{ name:"", legal:"", inn:"", phone:"", email:"", status:"verified", blockReason:"", since:TODAY, credit:0 },
      brand:apiBrand(null, ""), balance:0, ledger:[], topups:[], orders:[], notes:[], travellers:[] }; };

  /* ---- состояние: только настройки и клиенты в браузере ---- */
  loadState = () => blank();
  freshState = () => (S = blank());
  refresh = () => S;
  tickCharter = () => {};
  // Без клиентов: их хранит сервер (прежняя версия держала их здесь — затираем).
  save = () => {
    writeJSON(PREFS, { lang:S.lang, cur:S.cur, theme:S.theme });
    if (S.session && RB.loaded) brandSoon();
  };
  if (prefs().travellers) writeJSON(PREFS, { lang:prefs().lang, cur:prefs().cur, theme:prefs().theme });

  /* ---- загрузка с сервера ---- */
  const brandKey = b => JSON.stringify(["name", "phone", "email", "address", "telegram", "instagram", "website", "color", "bank", "acc", "mfo"].map(k => b[k] || ""));
  async function load(){
    const [ag, led, tu, ord, nt, cl] = await Promise.all([API.call("GET", "/agency"), API.call("GET", "/agency/ledger?limit=200"),
      API.call("GET", "/agency/topups?limit=100"), API.call("GET", "/orders?limit=100&details=1"), API.call("GET", "/notifications?limit=40", undefined, { passive:true }),
      API.call("GET", "/agency/clients?limit=200", undefined, { passive:true }).catch(e => e.code === "TRAVELLERS_NOT_CONFIGURED" ? { items:[] } : Promise.reject(e))]);
    const was = JSON.stringify([S.agency, S.balance, S.ledger, S.topups, S.orders.map(o => [o.id, o.version, o.status]), S.notes, S.travellers]);
    S.travellers = cl.items.map(apiSaved);
    // PENDING — агентство на проверке у сайта: не «заблокировано», но и платить нельзя.
    S.agency = { name:ag.name, legal:ag.legalName || ag.name, inn:ag.inn || "", phone:ag.phone ? prettyPhone(ag.phone) : "", email:ag.email || "",
      status:ag.status === "ACTIVE" ? "verified" : ag.status === "BLOCKED" ? "blocked" : "pending", blockReason:ag.blockReason || "", since:tzYmd(apiTs(ag.createdAt)) || TODAY, credit:Number(ag.creditLimit) || 0,
      companyId:ag.companyId, version:ag.version, available:ag.available };
    S.balance = Number(ag.balance) || 0;
    // Несохранённая правка бренда (ждёт отправки или сервер её не принял) не перетирается опросом.
    if (!RB.brandTimer && !RB.brandDirty) { S.brand = apiBrand(ag.brand, ag.name); RB.brandSent = brandKey(S.brand); }
    S.topups = tu.items.map(apiTopup);
    S.ledger = led.items.map(l => apiLedger(l, S.topups));
    const prev = new Map(S.orders.map(o => [o.id, o]));
    S.orders = ord.items.map(x => { const p = prev.get(x.id), o = apiOrder(x, p);
      o.clientId = p?.clientId || clientByPhone(o.contact.phone)?.id || null; return o; });
    S.notes = nt.items.map(note2demo);
    RB.loaded = true;
    return was !== JSON.stringify([S.agency, S.balance, S.ledger, S.topups, S.orders.map(o => [o.id, o.version, o.status]), S.notes, S.travellers]);
  }
  /* База клиентов: полные данные — только для заполнения формы или правки. */
  revealSaved = async (ids, end) => (await API.call("POST", "/agency/clients/reveal", { ids, ...(end ? { tripDate:end } : {}) })).items.map(apiSavedFull);
  searchClients = async q => (await API.call("POST", "/agency/clients/search", { q:q.trim().slice(0, 60), limit:8 })).items.map(apiSaved);
  const NOTE_ORDER = { PENDING:"price_ready", PAID:"paid", CONFIRMED:"confirmed", CANCELLED:"cancelled", REFUNDED:"refunded", COMPLETED:"confirmed" };
  const NOTE_KIND = { TOPUP_CONFIRMED:"topup_ok", TOPUP_REJECTED:"topup_rejected", ADJUST:"adjust", CREDIT:"credit", BLOCKED:"blocked", UNBLOCKED:"unblocked", MESSAGE:"message" };
  function note2demo(n){
    const p = n.payload || {}, kind = n.type === "ORDER_STATUS" ? NOTE_ORDER[p.to] || "confirmed" : NOTE_KIND[n.type] || "message";
    const amount = p.amount ?? p.amountUzs ?? p.limitUzs ?? (kind === "refunded" ? S.orders.find(o => o.id === p.orderId)?.refund?.uzs : undefined);
    return { id:n.id, at:apiTs(n.at), kind, read:!!n.read, orderId:p.orderId || undefined, ...(amount != null ? { amount:Number(amount) } : {}), reason:p.reason || p.text || "" };
  }
  async function reload(quiet = false){
    try { const changed = await load(); if (changed || !quiet) onExternalChange(); }
    catch(e) { if (!quiet) toast(API.errText(e)); }
  }
  /* Вошли (или вход из прошлого раза): агентство из actor, затем данные. */
  async function enter(actor){
    if (!actor?.agency) { await API.signOut(); throw new ApiError("NOT_AGENT", 403); }
    S.session = { phone:actor.email || actor.phone || "", at:Date.now(), uid:actor.uid };
    S.agency.name = actor.agency.name;
    await load();
  }

  /* ---- вход ---- */
  const AUTH_RENDER = PAGES.auth.render, AUTH_AFTER = PAGES.auth.after;
  PAGES.auth.render = () => API.booting ? `<div class="auth"><section class="auth-main"><div class="card stack authcard"><p class="pcheck wait"><span class="spin"></span>${esc(t("api_loading"))}</p></div></section></div>` : AUTH_RENDER();
  PAGES.auth.after = () => {
    AUTH_AFTER?.();
    const ph = $("#lph"); if (ph) { ph.type = "text"; ph.inputMode = "email"; ph.autocomplete = "username"; ph.closest("label").querySelector("span").textContent = t("api_login_id");
      if (!M.ui.loginPhone) ph.value = ""; }
    apiOtpPatch("lotp");
    $('[data-act="regdemo"]')?.remove();
  };
  ACT.lsend = async () => {
    const id = apiLoginId($("#lph")?.value); hideErr("#lerr");
    if (!id) return showErr("#lerr", t("api_err_login_id"));
    overlay(t("api_sending"));
    try { await API.otpSend(id); M.ui.loginPhone = id; M.ui.loginStep = "code"; rerender(); toast(t("api_otp_hint")); }
    catch(e) { showErr("#lerr", API.errText(e)); }
    finally { overlay(""); }
  };
  doVerify = async () => {
    const code = ($("#lotp")?.value || "").trim();
    if (!new RegExp(`^\\d{${API_OTP_LEN}}$`).test(code)) return showErr("#lerr", t("api_err_code"));
    if (doVerify.busy) return; doVerify.busy = true; overlay(t("api_sending"));
    try {
      await enter(await API.otpVerify(M.ui.loginPhone, code));
      M.ui.loginStep = "phone"; toast(t("signed_in"));
      if (currentParts()[0] === "auth") go(""); else render(true);
      // Вернулись с оплаты пополнения без сессии (оплата в другом браузере, сессия истекла): дождаться итога.
      if (/[?&]payment=/.test(location.search)) paymentReturn();
    } catch(e) { showErr("#lerr", API.errText(e)); const el = $("#lotp"); if (el) el.value = ""; }
    finally { doVerify.busy = false; overlay(""); }
  };
  apiOtpInput("lotp", () => doVerify());
  /* Заявка на подключение: те же проверки, что в демо, отправка — на сервер. */
  ACT.regsend = async () => {
    const r = M.ui.reg; if (!r) return;
    if (r.company.trim().length < 2) return showErr("#rerr", t("err_company"));
    if (!/^\d{9}$/.test(digits(r.inn))) return showErr("#rerr", t("err_inn"));
    if (r.person.trim().length < 2) return showErr("#rerr", t("err_your_name"));
    if (!validPhone(r.phone)) return showErr("#rerr", t("err_phone"));
    if (!r.email || !validEmail(r.email)) return showErr("#rerr", t("err_email"));
    overlay(t("api_sending"));
    try {
      await API.call("POST", "/agency/applications", { company:r.company.trim(), inn:digits(r.inn), person:r.person.trim(), phone:apiPhone(r.phone), email:r.email.trim(), lang:S.lang }, { auth:false });
      r.phone = prettyPhone(r.phone); M.ui.regDone = true; rerender();
    } catch(e) { showErr("#rerr", API.errText(e)); }
    finally { overlay(""); }
  };
  ACT.regdemo = () => {};
  ACT.signout = async () => { await API.signOut(); M.ui = {}; S = blank(); toast(t("signed_out")); go(""); };
  ACT.reset = () => toast(t("api_e_NOT_SUPPORTED"));
  API.onLost(code => { S = blank(); M.ui = {}; toast(t(code === "SESSION_IDLE" ? "api_e_SESSION_IDLE" : "api_e_SESSION")); render(true); });

  /* ---- оформление: цену считает сервер, оплата — с баланса ---- */
  const START = startCheckout;
  startCheckout = spec => { START(spec); if (M.checkout) { M.checkout.pstate = "checking"; M.checkout.recheck = true; } };
  PAGES.checkout.after = () => { const c = M.checkout; if (c && c.pstate === "checking" && !c.qBusy) apiCheckoutRecheck("B2B"); };
  const CHECKOUT = PAGES.checkout.render;
  PAGES.checkout.render = p => { const html = CHECKOUT(p); return html && html.replace(esc(t("secure_note")), esc(t("api_secure_note"))); };
  ACT.caccept = () => { const c = M.checkout; if (!c?.pending) return; Object.assign(c, { total:c.pending.total, lines:c.pending.lines, details:c.pending.details, accepted:true, pstate:"ok" }); rerender(); };
  ACT.cpay = async () => {
    const c = M.checkout; if (!c || c.pstate !== "ok" || c.busy || !validateCheckout()) return;
    if (!agencyActive()) return showErr("#cerr", t("agency_blocked_d"));
    const phone = prettyPhone(c.contact.phone);
    c.busy = true; overlay(t("processing_balance"));
    try {
      if (!c.order) {
        let q = c.quote;
        if (!apiQuoteFresh(q) || q.used) q = c.quote = await apiQuote(c, "B2B");
        if (q.gross.usd !== c.total.usd || q.gross.uzs !== c.total.uzs) {
          c.pending = { total:q.gross, lines:apiQuoteLines(q), details:{ ...c.details, ...q.details } }; c.pstate = "changed"; rerender(); toast(t("api_e_PRICING_CHANGED")); return;
        }
        if (q.due.uzs > available()) { showErr("#cerr", tf("err_short", { amount:fmtUZS(q.due.uzs - available()) })); return; }
        const key = (c.orderKeys ||= {})[q.id] ||= API.uuid();
        const d = await API.call("POST", "/orders", { quoteId:q.id, travellers:c.travellers.map((x, i) => apiCheckoutTraveller(x, i, c)),
          contact:{ phone:apiPhone(phone), ...(c.contact.email ? { email:c.contact.email.trim() } : {}) } }, { idem:key });
        q.used = true; c.order = d.order;
      }
      // Пассажиров с галочкой сервер положил в базу клиентов сам (после оплаты); load() их подтянет.
      await API.call("POST", `/orders/${c.order.id}/pay`, { expectedVersion:c.order.version }, { idem:c.payKey ||= API.uuid() });
      const id = c.order.id; M.checkout = null; M.ui.forClient = null;
      await load().catch(() => {});
      go(`done/${id}`);
    } catch(e) {
      if (["QUOTE_EXPIRED", "QUOTE_USED", "PRICING_CHANGED", "PROMO_UNAVAILABLE"].includes(e.code)) { c.quote = null; c.order = null; c.pstate = "checking"; rerender(); }
      else if (c.order && ["VERSION_CONFLICT", "ORDER_EXPIRED"].includes(e.code)) { const id = c.order.id; M.checkout = null; await load().catch(() => {}); go(`orders/${id}`); }
      showErr("#cerr", API.errText(e)); toast(API.errText(e));
    } finally { overlay(""); if (M.checkout === c) c.busy = false; }
  };

  /* ---- база клиентов: карточка и правка — на сервере ---- */
  const clientOut = d => ({ surname:d.surname.trim().toUpperCase(), given:d.given.trim().toUpperCase(), passport:d.passport, cit:d.cit || null,
    gender:d.gender || null, dob:d.dob || null, expiry:d.expiry || null, phone:d.phone ? apiPhone(d.phone) : null, email:d.email ? d.email.trim() : null });
  ACT.cledit = async el => {
    try { const [c] = await revealSaved([el.dataset.v]); if (c) { M.ui.clDraft = { ...blankClient(), ...c }; rerender(); } }
    catch(e) { toast(API.errText(e)); }
  };
  ACT.clsave = async () => {
    const d = M.ui.clDraft; if (!d || d.busy) return;
    const e = validClient(d); if (e) return showErr("#clerr", t(e));
    d.busy = true;
    try {
      if (d.id) await API.call("PATCH", `/agency/clients/${encodeURIComponent(d.id)}`, clientOut(d));
      else await API.call("POST", "/agency/clients", clientOut(d));
      M.ui.clDraft = null; await load(); rerender(); toast(t("client_saved"));
    } catch(err) { showErr("#clerr", err.code === "TRAVELLER_DUPLICATE" ? t("err_client_dup") : API.errText(err)); }
    finally { d.busy = false; }
  };
  ACT.cldel = async el => {
    if (!confirm(t("client_delete_q"))) return;
    try {
      await API.call("DELETE", `/agency/clients/${encodeURIComponent(el.dataset.v)}`);
      M.ui.clDraft = null; await load(); toast(t("client_deleted"));
      if (currentParts()[0] === "clients" && currentParts()[1]) go("clients"); else rerender();
    } catch(e) { toast(API.errText(e)); }
  };
  /* Заявка на самолёт или вертолёт — без цены: её назначит оператор Charteri. */
  createOrder = (spec, then) => {
    if (spec.status !== "NEW") { toast(t("api_e_NOT_SUPPORTED")); return null; }
    const name = (spec.travellers[0]?.given || "").trim(), phone = spec.contact?.phone;
    const key = createOrder.key ||= API.uuid();
    overlay(t("api_sending"));
    API.call("POST", "/orders", { service:spec.type, title:spec.title || t("type_" + spec.type), client:{ name:name || S.agency.name, ...(phone ? { phone:apiPhone(phone) } : {}) },
      details:spec.details, serviceStart:spec.start, serviceEnd:spec.end }, { idem:key })
      .then(async d => { createOrder.key = null; M.ui.forClient = null; await load().catch(() => {}); then?.(d.order.id); })
      .catch(e => { if (e.code !== "NETWORK") createOrder.key = null; toast(API.errText(e)); })
      .finally(() => overlay(""));
    return null;
  };

  /* ---- заказы: оплата заявки с ценой, отмена ---- */
  ACT.opay = async el => {
    const o = S.orders.find(x => x.id === el.dataset.v); if (!o || o.status !== "PENDING" || !agencyActive()) return;
    const due = dueOf(o); if (due && due.uzs > available()) return toast(tf("err_short", { amount:fmtUZS(due.uzs - available()) }));
    overlay(t("processing_balance"));
    try {
      await API.call("POST", `/orders/${o.id}/pay`, { expectedVersion:o.version }, { idem:RB.payKeys[o.id + ":" + o.version] ||= API.uuid() });
      await load(); rerender(); toast(tf("n_paid", { no:o.no }));
    } catch(e) { await load().catch(() => {}); rerender(); toast(API.errText(e)); }
    finally { overlay(""); }
  };
  ACT.ocancelgo = async el => {
    const o = S.orders.find(x => x.id === el.dataset.v); if (!o) return rerender();
    M.ui.cancelFor = null; overlay(t("api_sending"));
    try {
      const d = await API.call("POST", `/orders/${o.id}/cancel`, { reason:t("api_cancel_reason") });
      await load(); rerender(); toast(d.status === "REQUESTED" ? t("api_cancel_requested") : tf("n_cancelled", { no:o.no }));
    } catch(e) { rerender(); toast(API.errText(e)); }
    finally { overlay(""); }
  };
  /* Карточка заказа: путешественники и история — из /orders/:id. */
  const ORDER_AFTER = PAGES["orders/:id"].after;
  PAGES["orders/:id"].after = p => {
    ORDER_AFTER?.(p);
    const o = S.orders.find(x => x.id === p.id); if (!o || o.fullV === o.version) return;
    o.fullV = o.version;
    API.call("GET", `/orders/${o.id}`).then(d => {
      const i = S.orders.findIndex(x => x.id === o.id); if (i < 0) return;
      S.orders[i] = Object.assign(apiOrderFull(d, o), { clientId:o.clientId, fullV:d.order.version });
      if (currentParts()[0] === "orders" && currentParts()[1] === o.id) onExternalChange();
    }).catch(e => { o.fullV = null; toast(API.errText(e)); });
  };

  /* ---- баланс: перевод и касса — заявка, карта — платёж Payme или Uzum (POST /payments, сумма — с сервера) ---- */
  const TU_PROVIDERS = ["payme", "uzum"], TU_NAMES = { payme:"Payme", uzum:"Uzum" };
  // Платёжные системы, выключенные в админке для сайта, не предлагаем и здесь (обе выключены — показываем обе: решает сервер).
  const tuProviders = () => { const on = TU_PROVIDERS.filter(payOn); return on.length ? on : TU_PROVIDERS; };
  const tuProvider = () => tuProviders().includes(M.ui.tuProv) ? M.ui.tuProv : tuProviders()[0];
  const TOPUP_FORM = topupForm;
  topupForm = () => {
    const html = TOPUP_FORM();
    if (M.ui.tuShown !== "card") return html;
    const pick = `<div class="field"><span>${esc(t("api_tu_provider"))}</span>${seg("tuprov", tuProviders().map(k => [k, TU_NAMES[k]]), tuProvider())}</div>`;
    return html.replace('<div class="err" id="tuerr"', pick + '<div class="err" id="tuerr"');
  };
  ACT.tuprov = el => { readAmount(); M.ui.tuProv = el.dataset.v; rerender(); };
  ACT.tugo = async () => {
    if (sysMaint()) return render(false);
    const amount = readAmount(), m = M.ui.tuShown || firstTopup(); hideErr("#tuerr");
    if (!topupOn(m)) { M.ui.tuMethod = firstTopup(); rerender(); return showErr("#tuerr", t("pay_off")); }
    if (!agencyActive()) return showErr("#tuerr", t("agency_blocked_d"));
    if (amount < TOPUP_MIN || amount > TOPUP_MAX) return showErr("#tuerr", tf("err_topup", { min:fmtUZS(TOPUP_MIN), max:fmtUZS(TOPUP_MAX) }));
    const provider = m === "card" ? tuProvider() : null, slot = `${m}:${provider || ""}:${amount}`;
    const key = (RB.tuKeys ||= {})[slot] ||= API.uuid();
    overlay(t(m === "card" ? "api_pay_redirect" : "api_sending"));
    let leaving = false;
    try {
      if (m === "card") {
        const d = await API.call("POST", "/payments", { provider, topup:{ amountUzs:amount }, lang:S.lang }, { idem:key });
        delete RB.tuKeys[slot];
        // Повтор того же ключа по уже закрытому платежу: ссылки нет — показываем его итог.
        if (!d.redirectUrl) { await load(); rerender(); toast(t(d.payment?.status === "SUCCEEDED" ? "api_tu_ok" : "api_tu_fail")); return; }
        leaving = true; location.assign(d.redirectUrl); return;
      }
      await API.call("POST", "/agency/topups", { method:m.toUpperCase(), amountUzs:amount }, { idem:key });
      delete RB.tuKeys[slot]; M.ui.tuAmount = "";
      await load(); rerender(); toast(tf("n_topup_pending", { amount:fmtUZS(amount) }));
    } catch(e) { showErr("#tuerr", API.errText(e)); }
    finally { if (!leaving) overlay(""); }
  };
  /* Возврат с платёжной страницы: ?payment=<id> — опрос статуса. */
  async function paymentReturn(){
    const q = new URLSearchParams(location.search), id = q.get("payment"); if (!id || !/^[\w-]{8,64}$/.test(id)) return;
    history.replaceState(null, "", location.pathname + location.hash);
    overlay(t("api_pay_wait"));
    try {
      for (let i = 0; i < 20; i++) {
        const { payment } = await API.call("GET", `/payments/${encodeURIComponent(id)}`);
        const tu = payment.kind === "TOPUP";
        if (payment.status === "SUCCEEDED") { await load(); toast(t(tu ? "api_tu_ok" : "api_pay_ok")); return; }
        if (["CANCELLED", "FAILED"].includes(payment.status)) { await load(); toast(t(tu ? "api_tu_fail" : "api_pay_fail")); return; }
        await new Promise(r => setTimeout(r, 1500));
      }
      toast(t("api_pay_slow"));
    } catch(e) { toast(API.errText(e)); }
    finally { overlay(""); rerender(); }
  }

  /* ---- колокольчик ---- */
  const markRead = body => API.call("POST", "/notifications/read", body).catch(e => toast(API.errText(e)));
  ACT.bellread = () => { S.notes.forEach(n => n.read = true); markRead({ all:true }); renderNav(matchRoute(currentParts()).key); };
  ACT.bellgo = el => { M.ui.bell = false; S.notes.forEach(n => n.read = true); markRead({ all:true }); location.hash = el.getAttribute("href"); };

  /* ---- бренд: сохраняется сам, когда поля в порядке (счёт 20 цифр, МФО 5) ---- */
  function brandSoon(){
    if (brandKey(S.brand) !== RB.brandSent) RB.brandDirty = true;
    clearTimeout(RB.brandTimer);
    RB.brandTimer = setTimeout(brandSend, BRAND_DEBOUNCE_MS);
  }
  async function brandSend(){
    RB.brandTimer = 0;
    const b = S.brand;
    try {
      if (b.logo && b.logo.startsWith("data:")) { const d = await API.call("POST", "/agency/logo", { image:b.logo }); b.logo = d.logoUrl; toast(t("logo_saved")); }
      if (brandKey(b) === RB.brandSent) { RB.brandDirty = false; return; }
      if (brandReqErr(b)) return;
      const brand = apiBrandOut(b);
      await API.call("PUT", "/agency/brand", { brand });
      RB.brandSent = brandKey(b); RB.brandErr = ""; RB.brandDirty = brandKey(S.brand) !== RB.brandSent;
    } catch(e) { const m = API.errText(e); if (m !== RB.brandErr) { RB.brandErr = m; toast(m); } }
  }

  /* ---- запуск: после 99-boot.js ---- */
  setTimeout(async () => {
    try { await apiLoadPublic(false); } catch(e) { toast(API.errText(e)); }
    try { const a = await API.restore(); if (a) await enter(a); }
    catch(e) { toast(API.errText(e)); }
    API.booting = false;
    render(true);
    if (S.session) paymentReturn();
    API.poll(POLL_MS, async () => { if (await apiLoadPublic(false).catch(() => false)) render(false); if (S.session) await reload(true); });
  }, 0);
}
