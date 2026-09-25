/* ==========================================================================
   Кабинет агентства: состояние, деньги, лента событий, жизнь заказов.

   Агентство платит за услуги с баланса в сумах. К стоимости услуги Charteri
   добавляет сервисный сбор (3%, ставку меняет админка — prices()), который
   виден до оплаты и не возвращается при отмене (спецификация, §4). Заказ хранит стоимость услуги (total) и сбор (fee)
   отдельно: строки чека собираются из деталей, как на сайте, а сбор — своей строкой.
   ========================================================================== */
"use strict";

/* Сбор округляется вверх до целого: в сумах — до сума, в долларах — до доллара. */
const feeOf = (a, bps = prices().feeBps) => ({ usd: Math.ceil(a.usd * bps / 10000), uzs: Math.ceil(a.uzs * bps / 10000) });
const withFee = a => addA(a, feeOf(a));
/* Баланс агентства — всегда в сумах, в какой бы валюте ни смотрели цены. */
const fmtUZS = n => (n < 0 ? "−" : "") + grp(Math.abs(n)) + NB + t("cur_uzs");
const PAID_TO_CONFIRMED_MS = 2500;       // поставщик подтверждает бронь
/* Эти три шага — работа оператора Charteri. Пока открыта админка (opsLive),
   их делает человек, а не таймер. */
const PRICE_READY_MS = 5000;             // оператор Charteri выставляет цену чартера
const REFUND_MS = 3000;                  // возврат зачисляют после ответа поставщика
const TOPUP_CLEAR_MS = 8000;             // банк или касса подтверждают пополнение

/* ---- баланс и проводки ----
   Каждое движение денег — проводка с остатком после неё: так выписка
   сходится с балансом без пересчёта. st — состояние агентства: в кабинете это
   S, в админке — любое из агентств. */
/* Сколько можно потратить: баланс плюс кредитный лимит, который ставит
   Charteri в админке (баланс может уйти в минус до лимита). */
const creditOf = (st = S) => Number.isInteger(st.agency?.credit) && st.agency.credit > 0 ? st.agency.credit : 0;
const available = (st = S) => st.balance + creditOf(st);
function post(kind, amount, extra = {}, st = S){
  st.balance += amount;
  st.ledger.unshift({ id:uid("l"), at:Date.now(), kind, amount, after:st.balance, ...extra });
}
/* ---- лента событий ---- */
function note(kind, extra = {}, st = S){
  st.notes.unshift({ id:uid("n"), at:Date.now(), kind, read:false, ...extra });
  st.notes = st.notes.slice(0, 40);
}
/* Заблокированное агентство не платит и не пополняет баланс: решение Charteri в админке. */
const agencyActive = () => S.agency.status !== "blocked";
const unread = () => S.notes.filter(n => !n.read).length;
function noteText(n){
  const o = n.orderId && S.orders.find(x => x.id === n.orderId);
  return tf("n_" + n.kind, { no: o ? o.no : "", title: o ? orderTitle(o) : "", amount: n.amount != null ? fmtUZS(n.amount) : "", reason: n.reason || "" });
}

/* ---- жизнь заказов и пополнений: раз в секунду ----
   Заменяет таймер сайта: здесь подтверждаются все типы заказов, а не только чартеры. */
function tickCharter(){
  // Свежие данные: админка могла записать их между тиками.
  refresh();
  const now = Date.now(), auto = !opsLive(); let changed = false;
  for (const o of S.orders) {
    const charter = o.type === "JET" || o.type === "HELI";
    if (auto && charter && o.status === "NEW" && now - o.createdAt >= PRICE_READY_MS) {
      o.status = "PENDING"; o.total = o.details.quote; o.feeBps = prices().feeBps; o.fee = feeOf(o.total, o.feeBps); hist(o, "PENDING"); changed = true;
      note("price_ready", { orderId:o.id }); toast(tf("toast_priced", { no:o.no }));
    }
    if (o.status === "PAID" && o.paidAt && now - o.paidAt >= PAID_TO_CONFIRMED_MS) {
      o.status = "CONFIRMED"; hist(o, "CONFIRMED"); changed = true;
      note("confirmed", { orderId:o.id }); toast(tf("n_confirmed", { no:o.no, title:orderTitle(o) }));
    }
    if (auto && o.status === "CANCELLED" && o.refund && !o.refund.done && now - o.refund.at >= REFUND_MS) {
      o.refund.done = true; o.status = "REFUNDED"; hist(o, "REFUNDED"); changed = true;
      if (o.refund.uzs > 0) post("refund", o.refund.uzs, { orderId:o.id });
      note("refunded", { orderId:o.id, amount:o.refund.uzs });
    }
  }
  for (const p of S.topups) {
    if (auto && p.status === "pending" && now - p.at >= TOPUP_CLEAR_MS) {
      p.status = "done"; post("topup", p.amount, { method:p.method }); changed = true;
      note("topup_ok", { amount:p.amount }); toast(tf("n_topup_ok", { amount:fmtUZS(p.amount) }));
    }
  }
  if (!changed) return;
  save();
  const page = currentParts()[0] || "";
  if (["", "orders", "balance"].includes(page)) rerender(); else renderNav(matchRoute(currentParts()).key);
}

/* ---- вход: кабинет с деньгами без входа не открывается ---- */
function routeGuard(key){
  if (!S.session) return key === "auth" ? null : "auth";
  return key === "auth" ? "" : null;
}

/* ---- поездки клиентов: для карты и «ближайших вылетов» ---- */
const live = o => o.end >= TODAY && !["CANCELLED", "REFUNDED"].includes(o.status);
const upcomingTrips = () => S.orders.filter(live).sort((a, b) => a.start.localeCompare(b.start));
const clientOf = o => o.client || (o.travellers[0] ? `${o.travellers[0].given} ${o.travellers[0].surname}`.trim() : "");
const isCharter = o => o.type === "JET" || o.type === "HELI";
/* Итог к оплате с баланса: стоимость услуги и сбор. У заявки на чартер до цены — пусто. */
const dueOf = o => o.total ? addA(o.total, o.fee || feeOf(o.total)) : null;

/* ---- демо-агентство ----
   Название, люди и документы вымышлены. Заказы собираются теми же функциями,
   что оформляют настоящие: цены, строки чека и документы сходятся. */
const DEMO_CLIENTS = [
  { surname:"KARIMOV", given:"AZIZ", passport:"FA1234567", gender:"M", dob:"1988-04-12", expiry:"2031-06-30", cit:"UZB" },
  { surname:"YUSUPOVA", given:"MADINA", passport:"FA7654321", gender:"F", dob:"1992-09-03", expiry:"2030-02-14", cit:"UZB" },
  { surname:"TOSHMATOV", given:"BEKZOD", passport:"AB3456789", gender:"M", dob:"1979-11-21", expiry:"2029-08-01", cit:"UZB" },
  { surname:"ISMOILOVA", given:"NIGORA", passport:"AC9081726", gender:"F", dob:"1995-01-30", expiry:"2033-05-19", cit:"UZB" },
  { surname:"PETROV", given:"ALEKSEY", passport:"754219038", gender:"M", dob:"1984-06-17", expiry:"2032-10-10", cit:"RUS" }
];
function freshState(){
  const prev = typeof S !== "undefined" && S ? S : {};
  S = { v:1, lang:prev.lang || "ru", cur:prev.cur || "UZS", theme:prev.theme || "system", user:null, session:prev.session || null,
    agency:{ name:"Silk Road Travel", legal:"OOO «SILK ROAD TRAVEL»", inn:"305 678 912", phone:"+998 71 200 45 67", email:"booking@silkroad.uz", status:"verified", since:addDays(TODAY, -210) },
    brand:{ name:"Silk Road Travel", phone:"+998 71 200 45 67", email:"booking@silkroad.uz", address:"Toshkent, Amir Temur ko‘chasi, 107", telegram:"@silkroad_uz", color:"#0F5E54", logo:null },
    balance:0, ledger:[], topups:[], orders:[], notes:[],
    travellers: DEMO_CLIENTS.map((c, i) => ({ id:"cl" + (i + 1), phone:["+998 90 123 45 67","+998 93 555 12 34","+998 97 700 80 90","+998 99 410 22 33","+998 91 818 00 11"][i], ...c })) };
  const day = 864e5, now = Date.now(), cl = S.travellers;
  const pax = c => ({ surname:c.surname, given:c.given, passport:c.passport, gender:c.gender, dob:c.dob, expiry:c.expiry, cit:c.cit });
  const paid = (o, at, clientId) => {
    Object.assign(o, { createdAt:at, paidAt:at, clientId, history:[{ s:"PAID", at }, { s:"CONFIRMED", at:at + 90e3 }] });
    o.status = "CONFIRMED"; post("order", -dueOf(o).uzs, { orderId:o.id }); S.ledger[0].at = at;
    return o;
  };
  const order = spec => { const o = { id:uid("o"), no:makeRef(spec.ref), req:null, method:"balance", ...spec }; o.fee = o.total ? feeOf(o.total) : null; S.orders.push(o); return o; };

  post("topup", 150_000_000, { method:"bank" }); S.ledger[0].at = now - 40 * day;

  // Тур в Анталию — уже прошёл (показывает статус «Выполнен»).
  const hA = hotelById("ayt-belek"), qA = { to:"AYT", depart:addDays(TODAY, -34), nights:7, adults:2, children:0 }, pA = tourPackage(hA, qA);
  paid(order({ type:"TOUR", title:"", sub:"", start:qA.depart, end:addDays(qA.depart, qA.nights), total:pA.total, ref:"seed-tour",
    travellers:[pax(cl[1])], contact:{ phone:cl[1].phone, email:"" },
    details:{ hotelId:hA.id, to:"AYT", depart:qA.depart, nights:7, adults:2, children:0, rooms:pA.rooms, out:pA.out, back:pA.back, px:pA.px } }), now - 38 * day, "cl2");

  // Проводки идут по времени: остаток после каждой — как в настоящей выписке.
  post("topup", 120_000_000, { method:"card" }); S.ledger[0].at = now - 8 * day;
  // Рейс в Дубай (−6 дней) — потом отменён со штрафом авиакомпании, остаток вернулся на баланс.
  const d2 = addDays(TODAY, 16), out2 = baseOffer("TAS", "DXB", d2), q2 = { adults:2, children:0, infants:0, cabin:"economy" };
  const oC = paid(order({ type:"FLIGHT", title:"", sub:"", start:d2, end:d2, total:flightFare(out2, null, q2).total, ref:"seed-dxb-cx",
    travellers:[pax(cl[4]), pax(cl[3])], contact:{ phone:cl[4].phone, email:"" }, details:flightDetailsOf(out2, null, q2) }), now - 6 * day, "cl5");
  // Рейс в Стамбул через 9 дней — подтверждён, у клиента билет.
  const d1 = addDays(TODAY, 9), out1 = baseOffer("TAS", "IST", d1), q1 = { adults:1, children:0, infants:0, cabin:"economy" };
  paid(order({ type:"FLIGHT", title:"", sub:"", start:d1, end:d1, total:flightFare(out1, null, q1).total, ref:"seed-ist",
    travellers:[pax(cl[0])], contact:{ phone:cl[0].phone, email:"" }, details:flightDetailsOf(out1, null, q1) }), now - 3 * day, "cl1");

  const pen = penaltyOf(oC, addDays(TODAY, -2));
  oC.refund = { rate:pen.rate, penalty:pen.penalty, uzs:pen.refund, at:now - 2 * day, done:true };
  oC.status = "REFUNDED"; oC.history.push({ s:"CANCELLED", at:now - 2 * day }, { s:"REFUNDED", at:now - 2 * day + 3e5 });
  post("refund", pen.refund, { orderId:oC.id }); S.ledger[0].at = now - 2 * day + 3e5;

  // Отель в Дубае через 3 недели.
  const hD = hotelById("dxb-pearl"), ci = addDays(TODAY, 21), n = 5;
  paid(order({ type:"HOTEL", title:"", sub:"", start:ci, end:addDays(ci, n), total:hotelStay(hD, ci, n, 1, ROOM_TYPES[1].mult), ref:"seed-dxb",
    travellers:[pax(cl[2])], contact:{ phone:cl[2].phone, email:"" },
    details:{ hotelId:hD.id, room:"deluxe", checkin:ci, checkout:addDays(ci, n), nights:n, adults:2, children:0, rooms:1 } }), now - 1 * day, "cl3");

  // Частный самолёт в Дубай: цена от оператора пришла — ждёт оплаты с баланса.
  const qJ = { from:"TAS", to:"DXB", date:addDays(TODAY, 12), time:"10:00", pax:4, cls:"auto", trip:"oneway" }, eJ = jetEstimate(qJ);
  const oJ = order({ type:"JET", status:"PENDING", createdAt:now - 5 * 3600e3, paidAt:null, title:"", sub:"", start:qJ.date, end:qJ.date, total:eJ.final, ref:"seed-jet",
    travellers:[{ given:"AZIZ KARIMOV", surname:"" }], contact:{ phone:cl[0].phone, email:"" }, clientId:"cl1",
    details:{ kind:"jet", from:"TAS", to:"DXB", date:qJ.date, time:"10:00", pax:4, trip:"oneway", cls:eJ.cls.id, model:eJ.cls.model, hours:eJ.hours, km:eJ.km, low:eJ.low, high:eJ.high, quote:eJ.final, note:"" },
    history:[{ s:"NEW", at:now - 5 * 3600e3 }, { s:"PENDING", at:now - 4.5 * 3600e3 }] });

  // Вертолёт в Чимган: заявка только что ушла — через несколько секунд оператор пришлёт цену.
  const qH = { to:"chimgan", date:addDays(TODAY, 4), time:"11:00", pax:3, cls:"auto", trip:"roundtrip" }, eH = heliEstimate(qH);
  order({ type:"HELI", status:"NEW", createdAt:now, paidAt:null, title:"", sub:"", start:qH.date, end:qH.date, total:null, ref:"seed-heli",
    travellers:[{ given:"NIGORA ISMOILOVA", surname:"" }], contact:{ phone:cl[3].phone, email:"" }, clientId:"cl4",
    details:{ kind:"heli", from:"TAS", to:"chimgan", date:qH.date, time:"11:00", pax:3, trip:"roundtrip", cls:eH.cls.id, model:eH.cls.model, hours:eH.hours, km:eH.km, low:eH.low, high:eH.high, quote:eH.final, note:"" },
    history:[{ s:"NEW", at:now }] });

  // Пополнение наличными в офисе — ждёт подтверждения кассы.
  S.topups.push({ id:uid("t"), at:now - 2000, amount:10_000_000, method:"cash", status:"pending" });

  S.orders.sort((a, b) => b.createdAt - a.createdAt);
  S.ledger.sort((a, b) => b.at - a.at);
  S.notes = [
    { id:uid("n"), at:now - 1 * day, kind:"confirmed", orderId:S.orders.find(o => o.type === "HOTEL").id, read:true },
    { id:uid("n"), at:now - 2 * day, kind:"refunded", orderId:oC.id, amount:pen.refund, read:true },
    { id:uid("n"), at:now - 4.5 * 3600e3, kind:"price_ready", orderId:oJ.id, read:false },
    { id:uid("n"), at:now - 2000, kind:"topup_pending", amount:10_000_000, read:false }
  ].sort((a, b) => b.at - a.at);
  return S;
}

/* ---- отмена: штраф поставщика по правилам услуги ----
   Возвращается стоимость услуги за вычетом штрафа. Сбор Charteri не возвращается. */
function penaltyOf(o, when = TODAY){
  const days = daysBetween(when, o.start);
  const rate = o.type === "HOTEL" ? (days >= 7 ? 0 : 0.5)
    : o.type === "FLIGHT" ? (days >= 14 ? 0.1 : days >= 3 ? 0.25 : 0.5)
    : o.type === "TOUR" ? (days >= 14 ? 0.15 : 0.4)
    : days >= 7 ? 0.2 : 0.5;
  const penalty = Math.ceil(o.total.uzs * rate), refund = Math.max(0, o.total.uzs - penalty);
  return { days, rate, penalty, refund };
}
