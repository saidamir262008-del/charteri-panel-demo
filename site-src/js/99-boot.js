/* ==========================================================================
   Запуск: начальное состояние с двумя демо-заказами и сохранённым путешественником
   (siteFresh — js/65-site-seed.js, его же берёт админка).
   ========================================================================== */
"use strict";

function freshState(){ return siteFresh({ lang:S?.lang || sysCfg().langs.def, cur:S?.cur || sysCfg().cur.def, theme:S?.theme || "system" }); }

applyDirections();                // направления из админки — до первой отрисовки
S = loadState();
// freshState() форматирует даты и склонения через S.lang — сначала нужен язык.
if (!S) { S = { v:1, lang:sysCfg().langs.def, cur:sysCfg().cur.def, theme:"system", user:null, travellers:[], orders:[] }; S = freshState(); save(); }
render(true);
tickCharter();
setInterval(tickCharter, 1000);
