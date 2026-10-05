/* ==========================================================================
   Содержимое сайта из админки (CMS). Админка пишет его в CMS_KEY, сайт
   читает при загрузке и при изменении в другой вкладке. Кабинет файл тоже
   загружает, но содержимое сайта не показывает.

   { v:1, texts:{ ключ:{ru,uz,en} }, site:{ title, desc, logo, favicon, phone,
     email, address, socials:{telegram,instagram,facebook,youtube},
     foot:{contacts,socials} }, items:[…], home:[{k,on}], hist:{ texts, site } }
   texts — замены строк сайта (t() берёт их первыми); site — название и
   описание для поисковиков, логотип, значок вкладки, контакты, соцсети;
   foot — показывать ли контакты и соцсети в подвале.
   home — блоки главной под поиском (CMS_HOME) по порядку, on — виден ли.
   hist — прежние версии замен текста (по ключу) и настроек сайта (по полю):
     { at, by, prev:[{ v, at, by }] } — кто и когда поставил нынешнее значение
     и прежние значения, новые сверху; at 0 — значение было до истории.
   Элемент: { id, type, status, deleted, order, at, by, …поля типа }:
     banner  title, text, btn, href, icon, image, video, tone, place
     page    slug, title, body, seoTitle, seoDesc, menu, mo
     faq     q, a, group
     news    title, date, image, text
     link    label, href, place, icon, mo
   mo — место в меню своего места (шапка или подвал): страницы с меню и ссылки
   идут в нём одним списком (cmsMenuItems), order у них — только для списков админки.
   Тексты — {ru,uz,en}; status — draft | published | hidden; deleted — время
   переноса в корзину (0 — не в корзине). Ключа нет — встроенное содержимое
   (cmsDefaults): так демо сразу показывает страницы, и «Сбросить все демо»
   к нему возвращает.
   ========================================================================== */
"use strict";

const CMS_KEY = "charteri.cms";
const CMS_LANGS = ["ru", "uz", "en"];
const CMS_TYPES = ["banner", "page", "faq", "news", "link"];
const CMS_STATUS = ["draft", "published", "hidden"];
const CMS_PLACES = ["top", "mid", "end"], CMS_MENUS = ["none", "header", "footer"], CMS_LINK_PLACES = ["header", "footer"];
const CMS_ICONS = ["flights", "tours", "hotels", "jet", "heli", "shield", "globe", "clock", "star", "ok", "bag"];
const CMS_TONES = ["blue", "navy", "sky", "mint", "sand"];
const CMS_SOCIALS = ["telegram", "instagram", "facebook", "youtube"];
/* Картинка — строкой data:, поэтому пределы в символах. Всё хранилище —
   не больше CMS_MAX: localStorage у сайта один на всех (≈ 5 МБ). */
const CMS_IMG_MAX = 400_000, CMS_MAX = 2_500_000, CMS_ITEMS_MAX = 300, CMS_TEXTS_MAX = 800, CMS_TEXT_MAX = 1000;
const CMS_LEN = { title:120, text:600, btn:40, q:200, a:2000, body:20000, label:40, seoTitle:70, seoDesc:200, group:60, news:5000, siteTitle:80, siteDesc:200, address:160 };
const CMS_IMG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const CMS_SLUG_RE = /^[a-z0-9-]{2,40}$/, CMS_YT_RE = /^[\w-]{11}$/, CMS_ID_RE = /^[\w-]{1,40}$/, CMS_TKEY_RE = /^[A-Za-z][\w]{0,60}$/;
const CMS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/* Блоки главной под поиском (поиск с заголовком — всегда первый и всегда
   виден); banner_* — места баннеров. Порядок здесь — порядок по умолчанию. */
const CMS_HOME = ["banner_top", "board", "dest", "banner_mid", "services", "how", "banner_end", "trust"];
/* История: до CMS_HIST_MAX прежних версий на ключ или поле, картинок — не
   больше CMS_HIST_IMG прежних на поле (они тяжёлые). Не хватает места —
   CMS_HIST_CUT версий, потом без истории (cmsWrite). */
const CMS_HIST_MAX = 10, CMS_HIST_IMG = 2, CMS_HIST_CUT = 3;
let CMS_CACHE = null;

Object.assign(IC, {
  up:     svg('<path d="M6 15l6-6 6 6"/>'),
  down:   svg('<path d="M6 9l6 6 6-6"/>'),
  ext:    svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  play:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>',
  layout: svg('<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M9 9v11"/>')
});

/* Значок элемента. Звезда в IC залита цветом рейтинга отеля (.stars svg) —
   здесь она берёт цвет текста, как контурные значки. */
const cmsIcon = k => k === "star" ? IC.star.replace("<path ", '<path fill="currentColor" ') : IC[k] || "";

/* ---- проверка чужих данных ----
   Всё из хранилища — чужое: берём только известные поля в правильном виде. */
const cmsL = (v, max) => Object.fromEntries(CMS_LANGS.map(l => [l, typeof v?.[l] === "string" ? v[l].trim().slice(0, max) : ""]));
const cmsImg = v => typeof v === "string" && v.length <= CMS_IMG_MAX && CMS_IMG_RE.test(v) ? v : null;
const cmsEnum = (v, list, def) => list.includes(v) ? v : def;
const cmsPhone = v => typeof v === "string" && /^\+?[\d\s()-]{7,20}$/.test(v.trim()) ? v.trim() : "";
const cmsEmail = v => typeof v === "string" && v.trim().length <= 80 && /^[^@\s"'<>]+@[^@\s"'<>]+\.[^@\s"'<>]+$/.test(v.trim()) ? v.trim() : "";
const cmsDate = v => typeof v === "string" && CMS_DATE_RE.test(v) && !isNaN(parseYMD(v)) ? v : "";
/* Ссылка: адрес сайта (http/https), телефон, почта или страница этого сайта
   «#/…». Всё прочее (javascript:, data: и т. п.) — пустая строка. */
function cmsSafeHref(h){
  if (typeof h !== "string") return "";
  const s = h.trim(); if (!s || s.length > 300) return "";
  if (/^#\/[\w\-/.~%?=&]*$/.test(s)) return s;
  if (/^tel:\+?[\d\s()-]{3,30}$/.test(s)) return s.replace(/\s/g, "");
  if (/^mailto:[^@\s"'<>]+@[^@\s"'<>]+\.[^@\s"'<>]+$/.test(s)) return s;
  try { const u = new URL(s); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : ""; } catch(e) { return ""; }
}
const cmsWebHref = h => { const v = cmsSafeHref(h); return /^https?:/.test(v) ? v : ""; };
const cmsIsExt = h => /^https?:/.test(h);
/* Замена строки сайта — только текст: на сайте t() вставляют в разметку и в
   атрибуты без экранирования. Поэтому без < > и ", апостроф — типографский. */
const CMS_TX_BAD = /[<>"]/;
const cmsTx = s => s.replace(/[<>"]/g, "").replace(/'/g, "’");
const cmsMo = (x, it) => Number.isInteger(x.mo) ? clamp(x.mo, 0, 9999) : it.order;
/* Адрес, как его ввёл человек: «charteri.uz/…» и «www.…» — это https. */
const cmsNormHref = h => { const s = String(h ?? "").trim(); return /^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})(\/|$)/i.test(s) ? "https://" + s : s; };
const cmsTxL = v => Object.fromEntries(Object.entries(cmsL(v, CMS_TEXT_MAX)).map(([x, s]) => [x, cmsTx(s)]));
/* Поля настроек сайта: проверка значения (и для истории). */
const CMS_SITE_V = {
  title:v => cmsL(v, CMS_LEN.siteTitle), desc:v => cmsL(v, CMS_LEN.siteDesc), logo:v => cmsImg(v), favicon:v => cmsImg(v),
  phone:v => cmsPhone(v), email:v => cmsEmail(v), address:v => cmsL(v, CMS_LEN.address),
  socials:v => Object.fromEntries(CMS_SOCIALS.map(k => [k, cmsWebHref(v?.[k])]))
};
const CMS_SITE_F = Object.keys(CMS_SITE_V), CMS_SITE_IMG = ["logo", "favicon"];

const CMS_CLEAN = {
  banner: (x, it) => ({ ...it, title:cmsL(x.title, CMS_LEN.title), text:cmsL(x.text, CMS_LEN.text), btn:cmsL(x.btn, CMS_LEN.btn), href:cmsSafeHref(x.href),
    icon:cmsEnum(x.icon, CMS_ICONS, ""), image:cmsImg(x.image), video:typeof x.video === "string" && CMS_YT_RE.test(x.video) ? x.video : "",
    tone:cmsEnum(x.tone, CMS_TONES, "blue"), place:cmsEnum(x.place, CMS_PLACES, "top") }),
  page: (x, it) => CMS_SLUG_RE.test(x.slug) ? { ...it, slug:x.slug, title:cmsL(x.title, CMS_LEN.title), body:cmsL(x.body, CMS_LEN.body),
    seoTitle:cmsL(x.seoTitle, CMS_LEN.seoTitle), seoDesc:cmsL(x.seoDesc, CMS_LEN.seoDesc), menu:cmsEnum(x.menu, CMS_MENUS, "none"), mo:cmsMo(x, it) } : null,
  faq: (x, it) => ({ ...it, q:cmsL(x.q, CMS_LEN.q), a:cmsL(x.a, CMS_LEN.a), group:cmsL(x.group, CMS_LEN.group) }),
  news: (x, it) => cmsDate(x.date) ? { ...it, title:cmsL(x.title, CMS_LEN.title), date:x.date, image:cmsImg(x.image), text:cmsL(x.text, CMS_LEN.news) } : null,
  link: (x, it) => cmsSafeHref(x.href) ? { ...it, label:cmsL(x.label, CMS_LEN.label), href:cmsSafeHref(x.href), place:cmsEnum(x.place, CMS_LINK_PLACES, "footer"), icon:cmsEnum(x.icon, CMS_ICONS, ""), mo:cmsMo(x, it) } : null
};
/* Главное поле элемента: по нему элемент называют в списках и журнале. */
const CMS_MAIN = { banner:"title", page:"title", faq:"q", news:"title", link:"label" };
function cmsCleanItem(x){
  if (!x || typeof x !== "object" || typeof x.id !== "string" || !CMS_ID_RE.test(x.id) || !CMS_TYPES.includes(x.type) || !CMS_STATUS.includes(x.status)) return null;
  const it = { id:x.id, type:x.type, status:x.status, deleted:Number.isFinite(x.deleted) && x.deleted > 0 ? x.deleted : 0,
    order:Number.isInteger(x.order) ? clamp(x.order, 0, 9999) : 0, at:Number.isFinite(x.at) ? x.at : 0, by:typeof x.by === "string" ? x.by.slice(0, 60) : "" };
  const r = CMS_CLEAN[x.type](x, it);
  if (r && x.type === "faq" && !r.a.ru) return null;
  return r && r[CMS_MAIN[x.type]].ru ? r : null;
}
const cmsObj = v => v && typeof v === "object" && !Array.isArray(v);
/* Блоки главной: известные, без повторов; пропущенный — на своё место по
   умолчанию (после ближайшего предшественника из CMS_HOME), видимым. */
function cmsHomeClean(v){
  const out = [];
  for (const x of Array.isArray(v) ? v : []) if (CMS_HOME.includes(x?.k) && !out.some(y => y.k === x.k)) out.push({ k:x.k, on:x.on !== false });
  CMS_HOME.forEach((k, i) => { if (out.some(y => y.k === k)) return;
    const prev = CMS_HOME.slice(0, i).reverse().find(p => out.some(y => y.k === p));
    out.splice(prev ? out.findIndex(y => y.k === prev) + 1 : 0, 0, { k, on:true }); });
  return out;
}
/* История одного ключа или поля; img — у поля картинка: прежних картинок
   не больше CMS_HIST_IMG, версии «без картинки» остаются. */
const cmsWhen = x => ({ at:Number.isFinite(x?.at) && x.at > 0 ? x.at : 0, by:typeof x?.by === "string" ? x.by.slice(0, 60) : "" });
function cmsHistOne(h, clean, img){
  if (!cmsObj(h)) return null;
  let imgs = 0;
  const prev = (Array.isArray(h.prev) ? h.prev : []).filter(e => cmsObj(e) && "v" in e).slice(0, CMS_HIST_MAX)
    .map(e => ({ v:clean(e.v), ...cmsWhen(e) })).filter(e => !img || !e.v || ++imgs <= CMS_HIST_IMG);
  const x = { ...cmsWhen(h), prev };
  return prev.length || x.at ? x : null;
}
function cmsHistClean(h){
  const out = { texts:{}, site:{} }; if (!cmsObj(h)) return out;
  if (cmsObj(h.texts)) for (const [k, v] of Object.entries(h.texts).slice(0, CMS_TEXTS_MAX)) { const x = CMS_TKEY_RE.test(k) && cmsHistOne(v, cmsTxL); if (x) out.texts[k] = x; }
  if (cmsObj(h.site)) for (const f of CMS_SITE_F) { const x = cmsHistOne(h.site[f], CMS_SITE_V[f], CMS_SITE_IMG.includes(f)); if (x) out.site[f] = x; }
  return out;
}
function cmsClean(r){
  if (!r || typeof r !== "object" || r.v !== 1) return null;
  const texts = {};
  if (cmsObj(r.texts))
    for (const [k, v] of Object.entries(r.texts).slice(0, CMS_TEXTS_MAX)) { if (!CMS_TKEY_RE.test(k)) continue;
      const l = cmsTxL(v); if (CMS_LANGS.some(x => l[x])) texts[k] = l; }
  const s = cmsObj(r.site) ? r.site : {};
  const site = { ...Object.fromEntries(CMS_SITE_F.map(f => [f, CMS_SITE_V[f](s[f])])),
    foot:{ contacts:s.foot?.contacts !== false, socials:s.foot?.socials !== false } };
  // Повтор номера или адреса страницы — берём первый: второй перекрыл бы его на сайте.
  const ids = new Set(), slugs = new Set(), items = [];
  for (const raw of (Array.isArray(r.items) ? r.items : []).slice(0, CMS_ITEMS_MAX)) {
    const x = cmsCleanItem(raw); if (!x || ids.has(x.id) || (x.slug && slugs.has(x.slug))) continue;
    ids.add(x.id); if (x.slug) slugs.add(x.slug); items.push(x);
  }
  return { v:1, texts, site, items, home:cmsHomeClean(r.home), hist:cmsHistClean(r.hist) };
}

/* ---- встроенное содержимое ----
   Ответы FAQ — ровно о том, как работает демо: способы оплаты из оформления,
   цена чартера от менеджера, «Изменить или отменить» в карточке заказа,
   возврат за вычетом штрафа поставщика. */
function cmsDefaults(){
  const sup = CONFIG.support || {}, tg = String(sup.telegram || "").trim().replace(/^@/, "");
  const it = (id, type, order, x) => ({ id, type, status:"published", deleted:0, order, at:0, by:"Charteri", ...x });
  return cmsClean({ v:1, texts:{},
    site:{ title:{ ru:"Charteri — авиабилеты, туры, отели и частные рейсы", uz:"Charteri — aviachiptalar, turlar, mehmonxonalar va xususiy reyslar", en:"Charteri — flights, tours, hotels and private charters" },
      desc:{ ru:"Демонстрация сайта Charteri: авиабилеты, туры, отели, частные самолёты и вертолёты из Узбекистана с оплатой онлайн.",
        uz:"Charteri sayti namoyishi: O‘zbekistondan aviachiptalar, turlar, mehmonxonalar, xususiy samolyot va vertolyotlar — onlayn to‘lov bilan.",
        en:"Charteri site demo: flights, tours, hotels, private jets and helicopters from Uzbekistan, paid online." },
      logo:null, favicon:null, phone:sup.phone || "", email:sup.email || "", address:{ ru:"", uz:"", en:"" },
      socials:{ telegram:/^[\w]{3,32}$/.test(tg) ? "https://t.me/" + tg : cmsWebHref(sup.telegram), instagram:"", facebook:"", youtube:"" } },
    items:[
      it("c-about", "page", 0, { slug:"about", menu:"footer",
        title:{ ru:"О компании", uz:"Kompaniya haqida", en:"About us" },
        seoTitle:{ ru:"О компании Charteri", uz:"Charteri kompaniyasi haqida", en:"About Charteri" },
        seoDesc:{ ru:"Charteri — бронирование авиабилетов, туров, отелей и частных рейсов из Узбекистана.", uz:"Charteri — O‘zbekistondan aviachipta, tur, mehmonxona va xususiy reyslarni bron qilish.", en:"Charteri books flights, tours, hotels and private charters from Uzbekistan." },
        body:{
          ru:"Charteri — сервис бронирования путешествий из Узбекистана: авиабилеты, туры, отели, частные самолёты и вертолёты в одном месте.\n\n## Что мы делаем\n- Ищем рейсы и показываем цены до оплаты\n- Собираем туры «перелёт + отель + трансфер»\n- Бронируем отели на курортах и в городах\n- Организуем частные рейсы на самолёте и вертолёте\n\n## Как с нами работать\nПассажиры бронируют на этом сайте, турагентства — в своём кабинете Charteri. Оплата — Payme, Click, Uzum, Uzcard, Humo или картой Visa и Mastercard. Билеты и ваучеры приходят с кодом брони и QR-кодом.\n\nЭто демонстрация на тестовых данных: деньги не списываются, названия отелей вымышлены.",
          uz:"Charteri — O‘zbekistondan sayohatlarni bron qilish xizmati: aviachiptalar, turlar, mehmonxonalar, xususiy samolyot va vertolyotlar bir joyda.\n\n## Nima qilamiz\n- Reyslarni topamiz va narxni to‘lovdan oldin ko‘rsatamiz\n- «Parvoz + mehmonxona + transfer» turlarini yig‘amiz\n- Kurort va shaharlarda mehmonxona bron qilamiz\n- Samolyot va vertolyotda xususiy reyslar tashkil qilamiz\n\n## Biz bilan qanday ishlash mumkin\nYo‘lovchilar shu saytda, turagentliklar Charteri kabinetida bron qiladi. To‘lov — Payme, Click, Uzum, Uzcard, Humo yoki Visa va Mastercard kartasi. Chipta va vaucherlar bron kodi va QR-kod bilan keladi.\n\nBu test ma’lumotlaridagi namoyish: pul yechilmaydi, mehmonxona nomlari o‘ylab topilgan.",
          en:"Charteri books trips from Uzbekistan: flights, tours, hotels, private jets and helicopters in one place.\n\n## What we do\n- Find flights and show the price before you pay\n- Put together tours: flight, hotel and transfer\n- Book hotels at resorts and in cities\n- Arrange private flights by jet and helicopter\n\n## How to work with us\nTravellers book on this site, travel agencies in their Charteri workspace. Pay with Payme, Click, Uzum, Uzcard, Humo or a Visa or Mastercard card. Tickets and vouchers come with a booking reference and a QR code.\n\nThis is a demo on test data: no money is charged and hotel names are fictional." } }),
      it("c-faq-pay", "faq", 0, { group:{ ru:"Оплата и возврат", uz:"To‘lov va qaytarish", en:"Payment and refunds" },
        q:{ ru:"Как оплатить заказ?", uz:"Buyurtmani qanday to‘lash mumkin?", en:"How do I pay?" },
        a:{ ru:"Через Payme, Click или Uzum, картой Uzcard или Humo, а также картой Visa или Mastercard — способ выбирается на шаге оплаты. В демо деньги не списываются.",
          uz:"Payme, Click yoki Uzum orqali, Uzcard yoki Humo kartasi, shuningdek Visa yoki Mastercard kartasi bilan — usul to‘lov bosqichida tanlanadi. Demoda pul yechilmaydi.",
          en:"With Payme, Click or Uzum, an Uzcard or Humo card, or a Visa or Mastercard card — you choose at the payment step. The demo charges no money." } }),
      it("c-faq-refund", "faq", 1, { group:{ ru:"Оплата и возврат", uz:"To‘lov va qaytarish", en:"Payment and refunds" },
        q:{ ru:"Вернут ли деньги, если отменить бронь?", uz:"Bron bekor qilinsa, pul qaytariladimi?", en:"Do I get my money back if I cancel?" },
        a:{ ru:"Да, за вычетом штрафа поставщика по правилам услуги. Штраф и сумму возврата вы увидите в карточке заказа, деньги возвращаются на карту.",
          uz:"Ha, xizmat qoidalari bo‘yicha yetkazib beruvchi jarimasi ushlab qolinadi. Jarima va qaytariladigan summa buyurtma kartasida ko‘rinadi, pul kartaga qaytadi.",
          en:"Yes, minus the supplier’s penalty under the service rules. The order card shows the penalty and the refund; the money goes back to your card." } }),
      it("c-faq-change", "faq", 2, { group:{ ru:"Заказы", uz:"Buyurtmalar", en:"Orders" },
        q:{ ru:"Как перенести дату, поменять пассажира или отменить бронь?", uz:"Sanani qanday ko‘chirish, yo‘lovchini almashtirish yoki bronni bekor qilish mumkin?", en:"How do I change the date or passenger, or cancel?" },
        a:{ ru:"Откройте заказ в «Моих заказах» и нажмите «Изменить или отменить». Выберите, что нужно сделать, и оставьте комментарий — оператор ответит в карточке заказа.",
          uz:"«Buyurtmalarim»da buyurtmani oching va «O‘zgartirish yoki bekor qilish» tugmasini bosing. Nima qilish kerakligini tanlab, izoh qoldiring — operator javobi buyurtma kartasida chiqadi.",
          en:"Open the order in My orders and press Change or cancel. Pick what you need and leave a comment — the operator replies in the order card." } }),
      it("c-faq-docs", "faq", 3, { group:{ ru:"Заказы", uz:"Buyurtmalar", en:"Orders" },
        q:{ ru:"Где мой билет или ваучер?", uz:"Chipta yoki vaucherim qayerda?", en:"Where is my ticket or voucher?" },
        a:{ ru:"В разделе «Мои заказы». После оплаты там появляется документ с кодом брони и QR-кодом.",
          uz:"«Buyurtmalarim» bo‘limida. To‘lovdan keyin u yerda bron kodi va QR-kodli hujjat paydo bo‘ladi.",
          en:"In My orders. After payment the document with the booking reference and a QR code appears there." } }),
      it("c-faq-charter", "faq", 4, { group:{ ru:"Частные рейсы", uz:"Xususiy reyslar", en:"Private flights" },
        q:{ ru:"Как заказать частный самолёт или вертолёт?", uz:"Xususiy samolyot yoki vertolyotni qanday buyurtma qilish mumkin?", en:"How do I book a private jet or helicopter?" },
        a:{ ru:"Выберите маршрут, дату и число пассажиров — сайт покажет ориентировочную цену. После заявки менеджер проверит борт и слоты в аэропортах и пришлёт точную цену, обычно за 15 минут. Оплата — только после вашего подтверждения.",
          uz:"Yo‘nalish, sana va yo‘lovchilar sonini tanlang — sayt taxminiy narxni ko‘rsatadi. So‘rovdan keyin menejer samolyot va aeroport slotlarini tekshirib, aniq narxni odatda 15 daqiqada yuboradi. To‘lov — faqat sizning tasdig‘ingizdan keyin.",
          en:"Pick the route, date and number of passengers — the site shows an estimate. After your request a manager checks the aircraft and airport slots and sends the exact price, usually within 15 minutes. You pay only after you confirm." } }),
      it("c-news-demo", "news", 0, { date:"2026-09-20", image:null,
        title:{ ru:"Сайт Charteri открыт в демо-режиме", uz:"Charteri sayti demo rejimida ochildi", en:"The Charteri site is open in demo mode" },
        text:{ ru:"На сайте работают все пять разделов: авиабилеты, туры, отели, частные самолёты и вертолёты.\n\n- Цена показывается до оплаты\n- Документы приходят с QR-кодом\n- Заявку на частный рейс оценивает менеджер\n\nЭто демонстрация на тестовых данных: деньги не списываются.",
          uz:"Saytda beshta bo‘lim ishlaydi: aviachiptalar, turlar, mehmonxonalar, xususiy samolyot va vertolyotlar.\n\n- Narx to‘lovdan oldin ko‘rsatiladi\n- Hujjatlar QR-kod bilan keladi\n- Xususiy reys so‘rovini menejer baholaydi\n\nBu test ma’lumotlaridagi namoyish: pul yechilmaydi.",
          en:"All five sections work: flights, tours, hotels, private jets and helicopters.\n\n- You see the price before you pay\n- Documents come with a QR code\n- A manager prices private flight requests\n\nThis is a demo on test data: no money is charged." } }),
      // Черновик: на сайте его нет, пока в админке не нажмут «Опубликовать».
      // «#/?m=tours» — главная с открытым поиском туров (PAGES[""]).
      { ...it("c-banner-tours", "banner", 0, { place:"top", tone:"blue", icon:"tours", href:"#/?m=tours", image:null, video:"",
        title:{ ru:"Туры на лето — бронируйте заранее", uz:"Yozgi turlar — oldindan bron qiling", en:"Summer tours — book early" },
        text:{ ru:"Пакет «перелёт + отель + трансфер» дешевле, чем покупать всё по отдельности.", uz:"«Parvoz + mehmonxona + transfer» paketi hammasini alohida sotib olishdan arzonroq.", en:"A flight, hotel and transfer package costs less than buying each separately." },
        btn:{ ru:"Выбрать тур", uz:"Tur tanlash", en:"Choose a tour" } }), status:"draft" }
    ] });
}

/* ---- чтение и запись ---- */
function cmsLoad(){
  if (CMS_CACHE) return CMS_CACHE;
  return (CMS_CACHE = cmsClean(readJSON(CMS_KEY, null)) || cmsDefaults());
}
/* Перед правкой — свежие данные: другая вкладка админки могла записать их только что. */
function cmsFresh(){ CMS_CACHE = null; return cmsLoad(); }
const cmsClone = x => JSON.parse(JSON.stringify(x));
/* История короче: 1 — без прежних картинок, 2 — ещё и по CMS_HIST_CUT версий,
   3 — без истории. */
function cmsHistLess(c, level){
  if (level === 3) return { ...c, hist:{ texts:{}, site:{} } };
  const cut = (x, img) => ({ ...x, prev:x.prev.filter(e => !img || !e.v).slice(0, level === 2 ? CMS_HIST_CUT : CMS_HIST_MAX) });
  const map = (o, img) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, cut(x, img(k))]));
  return { ...c, hist:{ texts:map(c.hist.texts, () => false), site:map(c.hist.site, f => CMS_SITE_IMG.includes(f)) } };
}
/* Запись: false — не поместилось (предел CMS_MAX или хранилище браузера полно).
   Сначала жертвуем историей (cmsHistLess): содержимое сайта важнее. */
function cmsWrite(next){
  const clean = cmsClean(next); if (!clean) return false;
  const hasHist = Object.keys(clean.hist.texts).length || Object.keys(clean.hist.site).length;
  for (const level of hasHist ? [0, 1, 2, 3] : [0]) {
    const c = level ? cmsHistLess(clean, level) : clean, json = JSON.stringify(c);
    if (json.length > CMS_MAX) continue;
    try { localStorage.setItem(CMS_KEY, json); } catch(e) { continue; }
    CMS_CACHE = c; return true;
  }
  return false;
}
const cmsTexts = () => (CMS_CACHE || cmsLoad()).texts;
const cmsSite = () => cmsLoad().site;
const cmsHome = () => cmsLoad().home;
const cmsText = v => v?.[S.lang] || v?.ru || "";
/* Элементы типа по порядку; published — только опубликованные, trash — только корзина. */
function cmsItems(type, { published = false, trash = false } = {}){
  return cmsLoad().items.filter(x => (!type || x.type === type) && (trash ? !!x.deleted : !x.deleted) && (!published || x.status === "published"))
    .sort((a, b) => a.order - b.order || a.at - b.at);
}
/* Меню места: страницы с этим меню и ссылки — одним списком по mo; при
   равных — страница раньше ссылки, внутри вида — по order (сортировка стабильна). */
const cmsMenuOf = x => x.type === "link" ? x.place : x.type === "page" ? x.menu : "";
function cmsMenuList(items, place){
  const of = ty => items.filter(x => x.type === ty && cmsMenuOf(x) === place).sort((a, b) => a.order - b.order || a.at - b.at);
  return [...of("page"), ...of("link")].sort((a, b) => a.mo - b.mo);
}
const cmsMenuItems = (place, opts) => cmsMenuList(cmsItems(null, opts), place);
/* Новости — новые сверху; в один день — созданная позже выше. */
const cmsByDate = (a, b) => b.date.localeCompare(a.date) || b.order - a.order || b.at - a.at;
const cmsPageBySlug = slug => cmsItems("page", { published:true }).find(x => x.slug === slug) || null;

/* Ссылка в тексте: [текст](адрес). Адрес — только то, что пропускает
   cmsSafeHref (https, tel:, mailto:, #/…), иначе запись остаётся текстом.
   Внешняя — в новой вкладке, и диктор об этом предупреждает. */
const CMS_LINK_RE = /\[([^\[\]\n]{1,200})\]\(([^()\s]{1,300})\)/g;
function cmsInline(s){
  let out = "", i = 0;
  for (const m of s.matchAll(CMS_LINK_RE)) {
    const h = cmsSafeHref(m[2]); if (!h) continue;
    const ext = cmsIsExt(h);
    out += esc(s.slice(i, m.index)) + `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(m[1])}${ext ? `<span class="sr-only"> (${esc(t("cms_new_tab"))})</span>` : ""}</a>`;
    i = m.index + m[0].length;
  }
  return out + esc(s.slice(i));
}
/* Текст страницы: пустая строка — новый абзац, «- » — пункт списка,
   «## » — подзаголовок, [текст](адрес) — ссылка. HTML не принимается:
   всё остальное экранируется. */
function cmsBody(text, h = "h2"){
  const out = []; let para = [], list = [];
  const flushP = () => { if (para.length) out.push(`<p>${para.map(cmsInline).join("<br>")}</p>`); para = []; };
  const flushL = () => { if (list.length) out.push(`<ul>${list.map(x => `<li>${cmsInline(x)}</li>`).join("")}</ul>`); list = []; };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) { flushP(); flushL(); continue; }
    if (l.startsWith("## ")) { flushP(); flushL(); out.push(`<${h}>${cmsInline(l.slice(3))}</${h}>`); continue; }
    if (l.startsWith("- ")) { flushP(); list.push(l.slice(2)); continue; }
    flushL(); para.push(l);
  }
  flushP(); flushL();
  return out.join("");
}
/* Первый абзац без разметки — для карточки новости и описания страницы. */
function cmsExcerpt(text, max = 180){
  const p = String(text || "").split(/\r?\n\s*\r?\n/).map(s => s.replace(/^(## |- )/gm, "").replace(CMS_LINK_RE, (m, a, h) => cmsSafeHref(h) ? a : m)
    .replace(/\s+/g, " ").trim()).find(Boolean) || "";
  return p.length > max ? p.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : p;
}

/* ---- заголовок вкладки, описание и значок сайта ---- */
const CMS_HEAD0 = { desc:$('meta[name="description"]')?.content || "", icon:$('link[rel="icon"]')?.getAttribute("href") || "" };
const cmsSiteTitle = () => cmsText(cmsSite().title);
/* Своё название и описание страницы сайта (или null — берутся общие). */
function cmsRouteSeo(parts){
  if (parts[0] === "p" && parts.length === 2) { const p = cmsPageBySlug(safeDecode(parts[1])); if (p) return { title:cmsText(p.seoTitle), desc:cmsText(p.seoDesc) || cmsExcerpt(cmsText(p.body), 200) }; }
  if (parts[0] === "news" && parts.length === 2) { const n = cmsItems("news", { published:true }).find(x => x.id === parts[1]); if (n) return { title:"", desc:cmsExcerpt(cmsText(n.text), 200) }; }
  return null;
}
function cmsApplyHead(desc){
  const d = desc || cmsText(cmsSite().desc) || CMS_HEAD0.desc;
  const set = (sel, v) => { const m = $(sel); if (m && m.getAttribute("content") !== v) m.setAttribute("content", v); };
  set('meta[name="description"]', d); set('meta[property="og:description"]', d); set('meta[property="og:title"]', document.title);
  const icon = $('link[rel="icon"]'), href = cmsSite().favicon || CMS_HEAD0.icon;
  if (icon && icon.getAttribute("href") !== href) icon.setAttribute("href", href);
}

/* Админка в другой вкладке изменила содержимое (или сбросила демо). */
window.addEventListener("storage", e => {
  if (e.key !== CMS_KEY && e.key !== null) return;
  CMS_CACHE = null;
  if (!S || APP === "b2b") return;
  onExternalChange();
  if (APP === "b2c") announcePage(false);
});
