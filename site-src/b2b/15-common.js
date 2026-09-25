/* ==========================================================================
   Общее для кабинета и админки: значки, знак агентства, документы с брендом,
   строки чека со сбором, выезжающее меню на телефоне. Админка показывает
   документы разных агентств, поэтому бренд передаётся параметром.
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
const TYPE_ICON = { FLIGHT:IC.flights, TOUR:IC.tours, HOTEL:IC.hotels, JET:IC.jet, HELI:IC.heli };

const monogram = name => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "A";
/* Логотип — только PNG, который кабинет сам сделал из загруженного файла. */
const brandMark = (cls = "", b = S.brand) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.logo || "")
  ? `<span class="bmark ${cls}"><img src="${b.logo}" alt=""></span>`
  : `<span class="bmark mono-mark ${cls}">${esc(monogram(b.name))}</span>`;

/* ---- документы с брендом агентства ---- */
/* Текст на фирменной плашке — белый или тёмный, смотря по яркости цвета. */
function inkOn(hex){
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#fff";
  const n = parseInt(hex.slice(1), 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
  return L > 0.42 ? "#16181D" : "#fff";
}
const brandColor = (b = S.brand) => /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#16275C";
const brandStyle = (b = S.brand) => `--bc:${brandColor(b)};--bi:${inkOn(brandColor(b))}`;
const brandContacts = (b = S.brand) => [b.phone, b.email, b.telegram].filter(Boolean).map(esc).join(" · ");
function brandTop(kind, b = S.brand){
  return `<div class="bd-top" style="${brandStyle(b)}">${brandMark("bd-mark", b)}<span class="bd-name">${esc(b.name)}</span><span class="v-kind">${esc(kind)}</span></div>`;
}
function brandFoot(b = S.brand){
  return `<div class="bd-foot"><div class="stack" style="gap:2px"><b>${esc(b.name)}</b><span>${brandContacts(b)}</span>${b.address ? `<span>${esc(b.address)}</span>` : ""}</div>
    <span class="bd-pw">${esc(t("powered_by"))} <span class="wordmark dark">CHARTERI<b>.UZ</b></span></span></div>`;
}
/* b = бренд агентства; null — документ Charteri для пассажира сайта. */
function orderDocument(o, b = S.brand){
  if (o.type === "FLIGHT") return b ? `<div class="bdoc">${brandTop(t("doc_FLIGHT"), b)}${flightDocument(o)}${brandFoot(b)}</div>` : flightDocument(o);
  const body = { TOUR:tourVoucherBody, HOTEL:hotelVoucherBody, JET:charterVoucherBody, HELI:charterVoucherBody }[o.type](o);
  const top = b ? brandTop(t("doc_" + o.type), b) : `<div class="v-top"><span class="wordmark">CHARTERI<b>.UZ</b></span><span class="v-kind">${esc(t("doc_" + o.type))}</span></div>`;
  return `<article class="voucher ${b ? "bdoc-v" : ""} rise">${top}<div class="v-body">${body}</div><div class="perf"></div>${qrStub(o)}${b ? brandFoot(b) : ""}</article>`;
}

/* ---- сбор Charteri ----
   Ставка фиксируется в заказе (feeBps), как курс: смена сбора в админке
   меняет только новые заказы. */
const pctText = bps => String(bps / 100).replace(".", S.lang === "en" ? "." : ",");
const orderFeeBps = o => o.feeBps ?? (o.fee && o.total?.uzs ? Math.round(o.fee.uzs / o.total.uzs * 10000) : prices().feeBps);
/* Строки чека услуги и сбор отдельной строкой. */
const feeLines = (lines, total, fee, bps) => [...lines, [tf("service_fee", { p:pctText(bps) }), fee]];

/* ---- CSV для Excel ----
   Число — как есть. Строка, начинающаяся с = + - @, получает апостроф, иначе
   Excel выполнит её как формулу (название агентства из заявки — чужие данные). */
const csvCell = v => typeof v === "number" ? String(v) : `"${String(v ?? "").replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`;
const csvText = rows => "\ufeff" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");

/* ---- на телефоне меню — выезжающая панель ----
   Закрытая, она уезжает за край и выключается целиком (inert): Tab и
   экранный диктор её не видят. */
const DRAWER_MQ = window.matchMedia("(max-width: 1024px)");
function syncDrawer(){
  const nav = $("#nav"), open = document.body.classList.contains("nav-open");
  if (nav) nav.inert = DRAWER_MQ.matches && !open;
  $('[data-act="navopen"]')?.setAttribute("aria-expanded", String(open && DRAWER_MQ.matches));
}
DRAWER_MQ.addEventListener("change", () => { document.body.classList.remove("nav-open"); syncDrawer(); });
function closeDrawer(){
  if (!document.body.classList.contains("nav-open")) return;
  document.body.classList.remove("nav-open"); syncDrawer();
  $('[data-act="navopen"]')?.focus({ preventScroll:true });
}
Object.assign(ACT, {
  navopen: () => { document.body.classList.add("nav-open"); syncDrawer(); $("#nav .side-link")?.focus({ preventScroll:true }); },
  navclose: () => closeDrawer()
});
document.addEventListener("click", e => { if (e.target.closest(".side-link, .side-sublink, .side-agency")) { document.body.classList.remove("nav-open"); syncDrawer(); } });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") return closeDrawer();
  // Открытое меню на телефоне держит Tab внутри себя, как диалог.
  if (e.key !== "Tab" || !document.body.classList.contains("nav-open") || !DRAWER_MQ.matches) return;
  const f = $$("#nav a[href], #nav button:not([disabled]), #nav select"); if (!f.length) return;
  const first = f[0], last = f.at(-1);
  if (e.shiftKey && (document.activeElement === first || !$("#nav").contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !$("#nav").contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});
