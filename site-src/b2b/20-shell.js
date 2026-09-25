/* ==========================================================================
   Каркас кабинета: боковое меню, верхняя панель с балансом и уведомлениями.
   Сайт рисует шапку в #nav — здесь #nav становится боковым меню, а над
   страницей появляется #top. На телефоне меню выезжает слева.
   ========================================================================== */
"use strict";

Object.assign(IC, {
  home:   svg('<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  users:  svg('<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.9c1.9.6 3.3 2.1 4 4.6"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1.5 3"/>'),
  brush:  svg('<path d="M14.5 4.5l5 5-8 8-5-5z"/><path d="M6.5 12.5l-2 2c-1 1-1 3 0 4s3 1 4 0l2-2"/>'),
  gear:   svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>'),
  bell:   svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  plus:   svg('<path d="M12 5v14M5 12h14"/>'),
  out:    svg('<path d="M14 5h4a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>'),
  menu:   svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close:  svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  print:  svg('<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>'),
  doc:    svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
  upload: svg('<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5"/><path d="M5 17v2h14v-2"/>'),
  x:      svg('<path d="M7 7l10 10M17 7L7 17"/>')
});

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
const monogram = name => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "A";
/* Логотип — только PNG, который кабинет сам сделал из загруженного файла. */
const brandMark = (cls = "") => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(S.brand.logo || "")
  ? `<span class="bmark ${cls}"><img src="${S.brand.logo}" alt=""></span>`
  : `<span class="bmark mono-mark ${cls}">${esc(monogram(S.brand.name))}</span>`;

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
      <span class="side-status">${IC.ok}${esc(t("agency_verified"))}</span></span></a>
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
    </div></div>`;
  $("#footer").innerHTML = `<div class="foot-in"><p class="small">${esc(t("panel_foot"))}</p><p class="small">${esc(t("credits"))}</p></div>`;
  syncDrawer();
}
/* На телефоне меню — выезжающая панель. Закрытая, она уезжает за край и
   выключается целиком (inert): Tab и экранный диктор её не видят. */
const DRAWER_MQ = window.matchMedia("(max-width: 1024px)");
function syncDrawer(){ const nav = $("#nav"); if (nav) nav.inert = DRAWER_MQ.matches && !document.body.classList.contains("nav-open"); }
DRAWER_MQ.addEventListener("change", () => { document.body.classList.remove("nav-open"); syncDrawer(); });
function closeDrawer(){
  if (!document.body.classList.contains("nav-open")) return;
  document.body.classList.remove("nav-open"); syncDrawer();
  $('[data-act="navopen"]')?.focus({ preventScroll:true });
}
const waitingCount = () => S.orders.filter(o => o.status === "PENDING").length;

function bellPanel(){
  const list = S.notes.slice(0, 8);
  return `<div class="bellpanel" id="bellpanel">
    <div class="bell-h"><b>${esc(t("notifications"))}</b>${unread() ? `<button type="button" class="link" data-act="bellread">${esc(t("mark_read"))}</button>` : ""}</div>
    ${list.length ? list.map(n => `<a class="bell-row ${n.read ? "" : "unread"}" href="#/${n.orderId ? "orders/" + n.orderId : "balance"}" data-act="bellgo">
      <span class="bell-dot"></span><span class="stack" style="gap:2px;min-width:0"><span>${esc(noteText(n))}</span><span class="muted small">${esc(fdt(n.at))}</span></span></a>`).join("")
      : `<p class="muted small" style="padding:12px 16px">${esc(t("notes_empty"))}</p>`}
  </div>`;
}

Object.assign(ACT, {
  navopen: () => { document.body.classList.add("nav-open"); syncDrawer(); $("#nav .side-link")?.focus({ preventScroll:true }); },
  navclose: () => closeDrawer(),
  bell: () => { M.ui.bell = !M.ui.bell; renderNav(matchRoute(currentParts()).key); },
  bellread: () => { S.notes.forEach(n => n.read = true); save(); renderNav(matchRoute(currentParts()).key); },
  bellgo: el => { M.ui.bell = false; S.notes.forEach(n => n.read = true); save(); location.hash = el.getAttribute("href"); }
});
/* Клик вне панели уведомлений закрывает её; ссылка меню на телефоне закрывает меню. */
document.addEventListener("click", e => {
  if (M.ui.bell && e.target.isConnected && !e.target.closest(".bellwrap")) { M.ui.bell = false; renderNav(matchRoute(currentParts()).key); }
  if (e.target.closest(".side-link, .side-sublink, .side-agency")) { document.body.classList.remove("nav-open"); syncDrawer(); }
});
/* Escape закрывает меню и уведомления; фокус возвращается на кнопку, которая их открыла. */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeDrawer();
  if (M.ui.bell) { M.ui.bell = false; renderNav(matchRoute(currentParts()).key); $('[data-act="bell"]')?.focus({ preventScroll:true }); }
});
document.addEventListener("change", e => { if (e.target.id === "langSel") { S.lang = e.target.value; save(); rerender(); $("#langSel")?.focus({ preventScroll:true }); } });
