/* ==========================================================================
   Бронирование: те же пять форм поиска, что на сайте. Выдача, карточки
   отелей и туров, расчёт чартера — общие модули; кабинет меняет только
   оплату (с баланса агентства) и документы (с брендом агентства).
   ========================================================================== */
"use strict";

function bookPage(m){
  if (m && MODULES[m]) M.module = m;
  const mod = MODULES[M.module], forClient = S.travellers.find(c => c.id === M.ui.forClient);
  return `<div class="page">
    <div class="pagehead"><h1>${esc(t("book_title"))}</h1><p class="muted">${esc(t("book_sub"))}</p></div>
    ${forClient ? `<div class="forclient">${IC.user}<span>${esc(tf("booking_for", { name:`${forClient.given} ${forClient.surname}` }))}</span>
      <button type="button" class="link" data-act="forclear">${esc(t("cancel"))}</button></div>` : ""}
    <div class="bookbox"><nav class="modtabs" aria-label="${esc(t("nav_book"))}" data-ind="modtabs" data-ind-line><span class="ind" aria-hidden="true"></span>${MODULE_ORDER.map(k =>
      `<a class="modtab" href="#/book/${k}" ${M.module === k ? 'aria-current="page"' : ""}>${MODULES[k].icon}<span>${esc(t(MODULES[k].label))}</span></a>`).join("")}</nav>
      ${mod.form()}</div>
    ${M.module === "flights" ? departureBoard() : `<p class="book-note">${IC.shield}<span>${esc(t("book_note_" + M.module))}</span></p>`}
  </div>`;
}
PAGES.book = { render: () => bookPage(), after(){ armBoard(); } };
PAGES["book/:m"] = { render: ({ m }) => bookPage(m), after(){ armBoard(); } };
ACT.forclear = () => { M.ui.forClient = null; rerender(); };
