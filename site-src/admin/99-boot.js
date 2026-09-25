/* ==========================================================================
   Запуск админки. Если кабинет в этом браузере ещё не открывали — создаём
   его демо-данные здесь же: админке нужно живое агентство.
   ========================================================================== */
"use strict";

S = loadState();
if (!S || !Array.isArray(S.ledger) || !S.agency) { S = freshState(); S.session = null; S.rev = 1; writeJSON(CAB_KEY, S); }
O = loadOps() || freshOps(null);
if (!O.rev) saveOps();
SITE = loadSite();
seedApps();
adminPrefs();
heartbeat();
render(true);
