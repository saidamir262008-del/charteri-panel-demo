/* ==========================================================================
   Каркас админки: меню слева по правам роли, сверху — задачи, отметка
   «оператор на месте» и переключатель сотрудника (в демо — чтобы показать,
   что видит каждая роль).
   ========================================================================== */
"use strict";

Object.assign(IC, {
  inbox:  svg('<path d="M4 13l2.5-7h11l2.5 7v5H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>'),
  chart:  svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  plug:   svg('<path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'),
  list:   svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  badge:  svg('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7"/>'),
  tag:    svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  person: svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.3-3.4 3.9-5.1 7-5.1s5.7 1.7 7 5.1"/>')
});

/* Разделы: ключ маршрута, строка, значок, право на просмотр (null — всем). */
const ADM_NAV = [
  ["", "an_dash", "home", null], ["tasks", "an_tasks", "inbox", "tasks"], ["orders", "an_orders", "bag", "orders"],
  ["agencies", "an_agencies", "users", "agencies"], ["customers", "an_customers", "person", "customers"], ["finance", "an_finance", "wallet", "finance"],
  ["pricing", "an_pricing", "tag", null], ["integrations", "an_integrations", "plug", "integrations"], ["staff", "an_staff", "badge", "staff"],
  ["audit", "an_audit", "list", "audit"], ["settings", "an_settings", "gear", null]
];
const admSection = key => { const head = key.split("/")[0]; return ADM_NAV.some(([k]) => k === head) ? head : ""; };

function renderNav(key){
  document.body.classList.toggle("is-auth", !me());
  if (!me()) { $("#nav").innerHTML = ""; $("#top").innerHTML = ""; $("#footer").innerHTML = ""; return; }
  const sec = admSection(key), n = taskCount(), u = me();
  $("#nav").innerHTML = `<div class="side-in">
    <a class="side-logo" href="#/" aria-label="Charteri"><span class="wordmark">CHARTERI<b>.UZ</b></span><span class="side-tag">${esc(t("adm_tag"))}</span></a>
    <nav class="side-nav" aria-label="${esc(t("adm_menu"))}" data-ind="side"><span class="ind" aria-hidden="true"></span>
      ${ADM_NAV.filter(([, , , p]) => !p || can(p)).map(([k, label, ic]) => `<a class="side-link" href="#/${k}" ${sec === k ? 'aria-current="page"' : ""}>${IC[ic]}<span>${esc(t(label))}</span>${
        k === "tasks" && n ? `<i class="side-badge">${n}</i>` : ""}</a>`).join("")}
    </nav>
    <div class="side-me"><span class="avatar sm">${esc(monogram(u.name))}</span><span class="stack" style="gap:1px;min-width:0"><b>${esc(u.name)}</b>
      <span class="side-role">${esc(roleName(u.role))}</span></span></div>
  </div>`;
  const title = t(ADM_NAV.find(([k]) => k === sec)?.[1] || "an_dash");
  $("#top").innerHTML = `<div class="top-in">
    <button type="button" class="iconbtn only-m" data-act="navopen" aria-label="${esc(t("adm_menu"))}">${IC.menu}</button>
    <span class="top-title">${esc(title)}</span>
    <div class="top-right">
      <span class="live-pill" title="${esc(t("live_d"))}"><i aria-hidden="true"></i>${esc(t("live_on"))}</span>
      ${can("tasks") ? `<a class="taskchip ${n ? "has" : ""}" href="#/tasks" aria-label="${esc(tf("tasks_n", { n }))}">${IC.inbox}<span class="tc-l" aria-hidden="true">${esc(t("an_tasks"))}</span><b aria-hidden="true">${n}</b></a>` : ""}
      <label class="whosel"><span class="sr-only">${esc(t("switch_staff"))}</span>
        <select id="whoSel" class="minisel" aria-label="${esc(t("switch_staff"))}">${O.staff.map(s => `<option value="${s.id}" ${s.id === u.id ? "selected" : ""}>${esc(s.name.split(" ")[0])} · ${esc(roleName(s.role))}</option>`).join("")}</select></label>
      <select id="langSel" class="minisel" aria-label="${esc(t("language"))}">${[["uz","O‘z"],["ru","Рус"],["en","Eng"]].map(([k, l]) => `<option value="${k}" ${S.lang === k ? "selected" : ""}>${l}</option>`).join("")}</select>
    </div></div>`;
  $("#footer").innerHTML = `<div class="foot-in"><p class="small">${esc(t("adm_foot"))}</p><p class="small">${esc(t("credits"))}</p></div>`;
  syncDrawer();
}

let whoTimer = 0;
function switchStaff(id){
  const s = O.staff.find(x => x.id === id); if (!s || s.id === O.session?.staffId) return;
  O.session = { staffId:s.id, at:Date.now() }; audit("switch", { name:s.name, role:roleName(s.role) }); saveOps();
  toast(tf("switched", { name:s.name, role:roleName(s.role) })); render(true);
  $("#whoSel")?.focus({ preventScroll:true });
}
/* Язык и тема админки — свои; кабинет и сайт помнят свои. Язык меняем и в S:
   его читают общие функции (t, даты). */
document.addEventListener("change", e => {
  if (e.target.id === "langSel") { O.lang = e.target.value; adminPrefs(); saveOps(); rerender(); $("#langSel")?.focus({ preventScroll:true }); }
  if (e.target.id === "whoSel") { clearTimeout(whoTimer); const id = e.target.value; whoTimer = setTimeout(() => switchStaff(id), 450); }
});

/* Раздел, закрытый для роли. */
PAGES.denied = {
  render: () => `<div class="page narrow-page"><div class="card empty">${IC.lock}<h1 class="h-empty">${esc(t("denied_h"))}</h1>
    <p class="muted">${esc(tf("denied_d", { role:roleName(me().role) }))}</p><a class="solid" href="#/">${esc(t("an_dash"))}</a></div></div>`
};
