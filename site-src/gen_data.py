#!/usr/bin/env python3
"""
Переносит данные мобильного приложения Charteri в сайт — не перепечатывая.

  python3 gen_data.py [путь-к-charteri-mobile]      (по умолчанию ~/charteri-mobile)

Пишет js/00-data.js: словарь приложения на трёх языках, таблицу маршрутов,
перевозчиков, борта и аэропорты. Запускать, когда в приложении поменялись
маршруты или тексты; потом — build.py.
"""
import json, pathlib, re, sys

app = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "charteri-mobile") / "src"
here = pathlib.Path(__file__).parent

# ---- словарь: key: { uz: '…', ru: '…', en: '…' } --------------------------------
src = (app / "i18n/translations.ts").read_text()
q = r"('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")"
i18n = {}
for m in re.finditer(r"(\w+):\s*\{\s*((?:\w+:\s*" + q + r"\s*,?\s*)+)\}", src):
    langs = {lm.group(1): lm.group(2)[1:-1].replace("\\'", "'")
             for lm in re.finditer(r"(uz|ru|en):\s*" + q, m.group(2))}
    if {"uz", "ru", "en"} <= set(langs):
        i18n[m.group(1)] = langs

# ---- поисковый движок: таблицы как есть, это валидный JS ---------------------------
flights = (app / "data/flights.ts").read_text()
routes   = re.search(r"const ROUTES: Record<string, RouteSeed> = (\{.*?\n\});", flights, re.S).group(1)
carriers = re.search(r"const CARRIERS = (\[.*?\]);", flights, re.S).group(1)
planes   = re.search(r"const PLANES = (\[.*?\]);", flights, re.S).group(1)
usd_uzs  = re.search(r"export const USD_TO_UZS = (\d+);", flights).group(1)

# ---- аэропорты -----------------------------------------------------------------------
un = lambda s: s[1:-1].replace("\\'", "'")
ap_re = re.compile(r"\{\s*iata:\s*'(\w+)',\s*city:\s*\{\s*uz:\s*" + q + r",\s*ru:\s*" + q + r",\s*en:\s*" + q +
                   r"\s*\},\s*country:\s*\{\s*uz:\s*" + q + r",\s*ru:\s*" + q + r",\s*en:\s*" + q + r"\s*\},\s*popular:\s*(\d+)")
airports = [{"iata": m[0], "city": {"uz": un(m[1]), "ru": un(m[2]), "en": un(m[3])},
             "country": {"uz": un(m[4]), "ru": un(m[5]), "en": un(m[6])}, "popular": int(m[7])}
            for m in ap_re.findall((app / "data/airports.ts").read_text()) if re.fullmatch(r"[A-Z]{3}", m[0])]

out = f"""/* СГЕНЕРИРОВАНО gen_data.py из charteri-mobile — не править руками. */
"use strict";
const I18N = {json.dumps(i18n, ensure_ascii=False)};
const USD_TO_UZS = {usd_uzs};
const ROUTES = {routes};
const CARRIERS = {carriers};
const PLANES = {planes};
const AIRPORTS = {json.dumps(airports, ensure_ascii=False)};
"""
(here / "js/00-data.js").write_text(out)
print(f"строк: {len(i18n)} · маршрутов: {routes.count('ecoPrice')} · перевозчиков: {carriers.count('code')} · "
      f"аэропортов: {len(airports)} · курс: {usd_uzs}")
