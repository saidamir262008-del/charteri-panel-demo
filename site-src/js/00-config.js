/* ==========================================================================
   Настройки сайта — всё, что меняется при переезде с демо на боевой сервер.
   Сюда кладутся ТОЛЬКО публичные значения: этот файл уходит в браузер
   каждому посетителю. Секретные ключи (платёжные, поставщиков, service_role,
   SMS) живут только на сервере — см. INTEGRATION.md и .env.example.
   ========================================================================== */
"use strict";

const CONFIG = {
  /* "demo" — всё работает на тестовых данных в браузере (как сейчас).
     Внимание: пока этот флаг ни на что не влияет. Переключатели нужно провести
     по коду — список мест в INTEGRATION.md, раздел «Демо-режим». */
  mode: "demo",

  site: {
    /* Куда ведёт QR-код в билете и ваучере: страница проверки документа по номеру брони. */
    verifyUrl: "https://charteri.uz/v/",
  },

  /* Публичные адреса и ключи. В демо не используются — появятся в коде при интеграции. */
  supabase: {
    url: "",        // https://<project>.supabase.co — тот же проект, что у мобильного приложения
    anonKey: "",    // anon public key — безопасен в браузере только при включённом RLS на всех таблицах
  },
  api: {
    base: "",       // серверные методы сайта: поиск, перепроверка цены, заказы (Edge Functions или charteri.uz/api)
    pay: "",        // charteri-pay-server: создание платежа, адрес вида https://pay.charteri.uz
  },
  captchaSiteKey: "", // Cloudflare Turnstile или hCaptcha — site key (публичный); secret — только на сервере
  support: { phone: "", telegram: "", email: "" },

  /* Карта в шапке главной. OpenFreeMap бесплатен и работает без ключа.
     Для своего сервера тайлов или MapTiler — поменять адреса (ключ MapTiler
     ограничить доменом charteri.uz в кабинете MapTiler). */
  map: {
    lib: "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/",
    tiles: "https://tiles.openfreemap.org/planet",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    relief: "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png",
  },
};
