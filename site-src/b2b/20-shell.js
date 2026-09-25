/* ==========================================================================
   Каркас кабинета: боковое меню, верхняя панель с балансом и уведомлениями.
   Сайт рисует шапку в #nav — здесь #nav становится боковым меню, а над
   страницей появляется #top. На телефоне меню выезжает слева.
   ========================================================================== */
"use strict";


/* Разделы меню. Бронирование раскрывается пятью услугами сайта. */
const NAV = [["", "nav_dash", "home"], ["book", "nav_book", "search"], ["orders", "nav_orders", "bag"],
  ["clients", "nav_clients", "users"], ["balance", "nav_balance", "wallet"], ["brand", "nav_brand", "brush"], ["settings", "nav_settings", "gear"]];
const BOOK_KEYS = ["book", "flights", "hotels", "tours", "charter", "checkout", "done"];
function navSection(key){
  const head = key.split("/")[0];
  if (BOOK_KEYS.includes(head)) return "book";
  return NAV.some(([k]) => k === head) ? head : "";
}
/* Модуль, который сейчас открыт в разделе «Бронирование». */
function navModule(key){
  const [head, sub] = key.split("/");
  if (head === "charter") return sub === "jet" ? "jet" : "heli";
  if (["flights", "hotels", "tours"].includes(head)) return head;
  if (head === "book") return M.module;
  return null;
}

function renderNav(key){
  const app = document.body;
  app.classList.toggle("is-auth", !S.session);
  if (!S.session) { $("#nav").innerHTML = ""; $("#top").innerHTML = ""; $("#footer").innerHTML = ""; return; }
  const sec = navSection(key), mod = navModule(key);
  $("#nav").innerHTML = `<div class="side-in">
    <a class="side-logo" href="#/" aria-label="Charteri"><span class="wordmark">CHARTERI<b>.UZ</b></span><span class="side-tag">${esc(t("panel_tag"))}</span></a>
    <nav class="side-nav" aria-label="${esc(t("panel_menu"))}" data-ind="side"><span class="ind" aria-hidden="true"></span>
      ${NAV.map(([k, label, ic]) => `<a class="side-link" href="#/${k}" ${sec === k ? 'aria-current="page"' : ""}>${IC[ic]}<span>${esc(t(label))}</span>${
        k === "orders" && waitingCount() ? `<i class="side-badge">${waitingCount()}</i>` : ""}</a>
        ${k === "book" && sec === "book" ? `<div class="side-sub">${MODULE_ORDER.map(m => `<a class="side-sublink" href="#/book/${m}" ${mod === m ? 'aria-current="true"' : ""}>${esc(t(MODULES[m].label))}</a>`).join("")}</div>` : ""}`).join("")}
    </nav>
    <a class="side-agency" href="#/brand" style="${brandStyle()}">${brandMark()}<span class="stack" style="gap:1px;min-width:0"><b>${esc(S.agency.name)}</b>
      ${agencyActive() ? `<span class="side-status">${IC.ok}${esc(t("agency_verified"))}</span>` : `<span class="side-status is-off">${IC.lock}${esc(t("agency_blocked"))}</span>`}</span></a>
  </div>`;
  const title = t(NAV.find(([k]) => k === sec)?.[1] || "nav_dash");
  $("#top").innerHTML = `<div class="top-in">
    <button type="button" class="iconbtn only-m" data-act="navopen" aria-label="${esc(t("panel_menu"))}">${IC.menu}</button>
    <span class="top-title">${esc(title)}</span>
    <div class="top-right">
      <a class="balchip" href="#/balance" aria-label="${esc(t("balance_now"))}"><span class="balchip-l">${esc(t("balance_now"))}</span>
        <b class="mono">${fmtUZS(S.balance)}</b></a>
      <a class="solid sm topup-btn" href="#/balance?topup">${IC.plus}<span>${esc(t("topup"))}</span></a>
      <select id="langSel" class="minisel" aria-label="${esc(t("language"))}">${[["uz","O‘z"],["ru","Рус"],["en","Eng"]].map(([k, l]) => `<option value="${k}" ${S.lang === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="bellwrap">
        <button type="button" class="iconbtn" data-act="bell" aria-expanded="${!!M.ui.bell}" aria-controls="bellpanel" aria-label="${esc(t("notifications"))}">${IC.bell}${unread() ? `<i class="badge">${unread()}</i>` : ""}</button>
        ${M.ui.bell ? bellPanel() : ""}
      </div>
    </div></div>
    ${agencyActive() ? "" : `<div class="blockbar" role="status">${IC.lock}<span>${esc(t("agency_blocked_d"))}</span></div>`}`;
  $("#footer").innerHTML = `<div class="foot-in"><p class="small">${esc(t("panel_foot"))}</p><p class="small">${esc(t("credits"))}</p></div>`;
  syncDrawer();
}
const waitingCount = () => S.orders.filter(o => o.status === "PENDING").length;

function bellPanel(){
  const list = S.notes.slice(0, 8);
  return `<div class="bellpanel" id="bellpanel">
    <div class="bell-h"><b>${esc(t("notifications"))}</b>${unread() ? `<button type="button" class="link" data-act="bellread">${esc(t("mark_read"))}</button>` : ""}</div>
    ${list.length ? list.map(n => `<a class="bell-row ${n.read ? "" : "unread"}" href="#/${n.orderId ? "orders/" + n.orderId : n.kind === "message" ? "" : "balance"}" data-act="bellgo">
      <span class="bell-dot"></span><span class="stack" style="gap:2px;min-width:0"><span>${esc(noteText(n))}</span><span class="muted small">${esc(fdt(n.at))}</span></span></a>`).join("")
      : `<p class="muted small" style="padding:12px 16px">${esc(t("notes_empty"))}</p>`}
  </div>`;
}

Object.assign(ACT, {
  bell: () => { M.ui.bell = !M.ui.bell; renderNav(matchRoute(currentParts()).key); },
  bellread: () => { S.notes.forEach(n => n.read = true); save(); renderNav(matchRoute(currentParts()).key); },
  bellgo: el => { M.ui.bell = false; S.notes.forEach(n => n.read = true); save(); location.hash = el.getAttribute("href"); }
});
/* Клик вне панели уведомлений закрывает её. */
document.addEventListener("click", e => {
  if (M.ui.bell && e.target.isConnected && !e.target.closest(".bellwrap")) { M.ui.bell = false; renderNav(matchRoute(currentParts()).key); }
});
/* Escape закрывает уведомления; фокус возвращается на колокольчик. */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (M.ui.bell) { M.ui.bell = false; renderNav(matchRoute(currentParts()).key); $('[data-act="bell"]')?.focus({ preventScroll:true }); }
});
document.addEventListener("change", e => { if (e.target.id === "langSel") { S.lang = e.target.value; save(); rerender(); $("#langSel")?.focus({ preventScroll:true }); } });
