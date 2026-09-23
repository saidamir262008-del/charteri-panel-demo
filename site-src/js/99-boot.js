/* ==========================================================================
   Запуск: начальное состояние с двумя демо-заказами и сохранённым путешественником.
   ========================================================================== */
"use strict";

const SEED_TRAVELLER = { id:"tr1", surname:"KARIMOV", given:"AZIZ", passport:"FA1234567", gender:"M", dob:"1988-04-12", expiry:"2031-06-30", cit:"UZB" };

function freshState(){
  const st = { v:1, lang:S?.lang || "ru", cur:S?.cur || "UZS", theme:S?.theme || "system", user:null, travellers:[{ ...SEED_TRAVELLER }], orders:[] };
  const traveller = ({ id, ...x }) => x;

  // Предстоящий перелёт в Стамбул — у демо сразу есть билет, который можно открыть.
  const d1 = addDays(TODAY, 9), out = baseOffer("TAS", "IST", d1), q1 = { adults:1, children:0, infants:0, cabin:"economy" };
  const t1 = Date.now() - 3 * 864e5;
  st.orders.push({ id:"o-seed-1", no:makeRef("seed-1" + d1), type:"FLIGHT", status:"CONFIRMED", createdAt:t1,
    title:`${cityName("TAS")} → ${cityName("IST")}`, sub:`${fdateY(d1)} · ${pl(1, "pax")}`, start:d1, end:d1,
    total:flightFare(out, null, q1).total, method:"payme", travellers:[traveller(SEED_TRAVELLER)],
    contact:{ phone:"+998 90 123 45 67", email:"" }, details:{ out, back:null, q:q1 }, req:null, paidAt:null,
    history:[{ s:"PAID", at:t1 }, { s:"CONFIRMED", at:t1 + 1000 }] });

  // Прошедший отдых в Анталии — показывает статус «Выполнен».
  const h = hotelById("ayt-lara"), ci = addDays(TODAY, -40), n = 7, t2 = Date.now() - 55 * 864e5;
  st.orders.push({ id:"o-seed-2", no:makeRef("seed-2" + ci), type:"HOTEL", status:"CONFIRMED", createdAt:t2,
    title:h.name, sub:`${cityName("AYT")} · ${fdateY(ci)} — ${fdateY(addDays(ci, n))} · ${pl(n, "night")}`, start:ci, end:addDays(ci, n),
    total:hotelStay(h, ci, n, 1, 1), method:"uzum", travellers:[traveller(SEED_TRAVELLER)],
    contact:{ phone:"+998 90 123 45 67", email:"" },
    details:{ hotelId:h.id, room:"standard", checkin:ci, checkout:addDays(ci, n), nights:n, adults:2, children:0, rooms:1 }, req:null, paidAt:null,
    history:[{ s:"PAID", at:t2 }, { s:"CONFIRMED", at:t2 + 1000 }] });
  return st;
}

S = loadState();
// freshState() форматирует даты и склонения через S.lang — сначала нужен язык.
if (!S) { S = { v:1, lang:"ru", cur:"UZS", theme:"system", user:null, travellers:[], orders:[] }; S = freshState(); save(); }
render(true);
tickCharter();
setInterval(tickCharter, 1000);
