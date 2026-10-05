#!/usr/bin/env python3
"""
Собирает три приложения Charteri из одних модулей, каждое — в один HTML-файл:

  ../b2c/index.html     сайт для пассажиров
  ../index.html         кабинет агентства
  ../admin/index.html   админка Charteri (операторы, касса, бухгалтерия)

  python3 build.py              все три
  python3 build.py b2b admin    только перечисленные

Общие модули лежат в js/ (данные, поиск, отели, туры, чартеры, оформление,
карта, табло, фото, содержимое сайта и системные настройки из админки —
js/13-cms.js, js/14-system.js). Страницы сайта — js/70-pages.js,
js/71-cms-pages.js и js/99-boot.js (SITE_ONLY), в кабинет и админку они не
входят. Страницы кабинета — b2b/*.js, его оформление — b2b/panel.css поверх
общего styles.css. Админка берёт из кабинета только общие части (строки,
состояние и деньги, документы с брендом) и свои страницы admin/*.js.

Админке нужны тексты сайта такими, какими их видит посетитель: её строки
перекрывают часть ключей сайта. Поэтому в её сборку сразу за js/01-strings.js
(до строк кабинета и админки) вставляются SITE_KEYS — все ключи, которые может
показать сайт (строки js/01-strings.js и ключи словаря приложения из кода
сайта), и SITE_STR — их копия на трёх языках в тот момент.

Перед сборкой проверяет, что каждый ключ строки, который встречается в коде
приложения, есть в словаре мобильного приложения (00-data.js) или в строках
сайта и кабинета. Иначе посетитель увидел бы сырой ключ вместо текста.
"""
import base64, json, pathlib, re, sys

here = pathlib.Path(__file__).parent
MIME = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}

SITE_ONLY = ("70-pages.js", "71-cms-pages.js", "99-boot.js")
APPS = {
    "b2c": {"files": sorted((here / "js").glob("*.js")),
            "css": ["styles.css"], "shell": "shell.html", "out": here.parent / "b2c" / "index.html"},
    "b2b": {"files": [p for p in sorted((here / "js").glob("*.js")) if p.name not in SITE_ONLY]
                     + sorted((here / "b2b").glob("*.js")),
            "css": ["styles.css", "b2b/panel.css"], "shell": "b2b/shell.html", "out": here.parent / "index.html"},
    "admin": {"files": [p for p in sorted((here / "js").glob("*.js")) if p.name not in SITE_ONLY]
                       + [here / "b2b" / n for n in ("01-strings-b2b.js", "10-state.js", "15-common.js")]
                       + sorted((here / "admin").glob("*.js")),
              "css": ["styles.css", "b2b/panel.css", "admin/admin.css"], "shell": "admin/shell.html", "out": here.parent / "admin" / "index.html"},
}

# ---- словарь -------------------------------------------------------------------------
data = (here / "js/00-data.js").read_text()
app_keys = set(json.loads(re.search(r"const I18N = (\{.*?\});\n", data, re.S).group(1)))

def str_keys(path):
    return set(re.findall(r"^\s+(\w+):\[", path.read_text(), re.M)) if path.exists() else set()

def calls(src, name):
    """Аргументы вызовов name(...) с учётом вложенных скобок."""
    out, i = [], 0
    pat = re.compile(r"(?<![\w.$])" + name + r"\(")
    while (m := pat.search(src, i)):
        depth, j = 1, m.end()
        while j < len(src) and depth:
            depth += {"(": 1, ")": -1}.get(src[j], 0); j += 1
        out.append(src[m.end():j - 1]); i = j
    return out

STRING_FILES = ("00-data.js", "01-strings.js", "01-strings-b2b.js", "01-strings-admin.js")

def check_strings(files, known):
    code = "\n".join(p.read_text() for p in files if p.name not in STRING_FILES)
    used = set()
    for arg in calls(code, "t") + calls(code, "tf"):
        first = arg.split(",")[0] if "?" not in arg.split(",")[0] else arg
        if "?" in first:                     # тернарник: ключи только в ветвях, не в условии
            first = first.split("?", 1)[1]
        used |= set(re.findall(r'"([a-z][a-z_0-9]*|[a-z_]+_[A-Z]+)"', first))
    # ключи, собранные конкатенацией: "prefix_" + x
    prefixes = {p for a in calls(code, "t") + calls(code, "tf") for p in re.findall(r'"([a-z_]+_)"\s*\+', a)}
    used = {k for k in used if not k.endswith("_")}
    missing = sorted(k for k in used if k not in known)
    unused_prefix = [p for p in prefixes if not any(k.startswith(p) for k in known)]
    if missing or unused_prefix:
        print("НЕТ СТРОК:", missing, unused_prefix); sys.exit(1)
    return len(used), len(prefixes)

# ---- логотипы авиакомпаний: встраиваются в страницу, без лишних запросов ----------
logos, marks = {}, {}
for f in sorted((here / "img" / "airlines").glob("*")):
    if f.suffix in MIME and "-" not in f.stem:
        logos[f.stem] = f"data:{MIME[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()
for f in sorted((here / "img" / "airlines").glob("*-wordmark.*")):
    if f.suffix in MIME:
        marks[f.stem.split("-")[0]] = f"data:{MIME[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()
logo_js = "/* ---- логотипы (build.py) ---- */\nconst LOGOS = " + json.dumps(logos) + ";\nconst WORDMARKS = " + json.dumps(marks) + ";\n"

# ---- тексты сайта для админки ------------------------------------------------------
def site_snapshot():
    """SITE_KEYS и SITE_STR: что и на каком языке показывает сайт (см. докстринг)."""
    code = "\n".join(p.read_text() for p in APPS["b2c"]["files"] if p.name not in STRING_FILES)
    words = set(re.findall(r'"([A-Za-z]\w*)"', code))
    prefixes = set(re.findall(r'"([a-z_]+_)"\s*\+', code))
    keys = str_keys(here / "js/01-strings.js") | {k for k in app_keys if k in words or any(k.startswith(p) for p in prefixes)}
    return ("/* ---- тексты сайта для админки (build.py) ---- */\n"
            f"const SITE_KEYS = {json.dumps(sorted(keys))};\n"
            "const SITE_STR = Object.fromEntries(SITE_KEYS.map(k => [k, I18N[k] ? [I18N[k].ru, I18N[k].uz ?? I18N[k].ru, I18N[k].en ?? I18N[k].ru] : [...STR[k]]]));\n")

# ---- сборка ------------------------------------------------------------------------
def build(name):
    app = APPS[name]
    known = app_keys | set().union(*(str_keys(p) for p in app["files"] if p.name in STRING_FILES))
    n_used, n_pref = check_strings(app["files"], known)
    js = f'"use strict";\nconst APP = "{name}";\n' + "\n".join(f"/* ---- {p.name} ---- */\n" + p.read_text() for p in app["files"])
    js = js.replace("/* ---- 10-core.js ---- */", logo_js + "/* ---- 10-core.js ---- */", 1)
    if name == "admin":                 # сразу за строками сайта, до строк кабинета и админки
        names = [p.name for p in app["files"]]
        after = f"/* ---- {names[names.index('01-strings.js') + 1]} ---- */"
        js = js.replace(after, site_snapshot() + after, 1)
    css = "\n".join((here / c).read_text() for c in app["css"])
    out = (here / app["shell"]).read_text().replace("/*__CSS__*/", css).replace("/*__JS__*/", js)
    app["out"].parent.mkdir(exist_ok=True)
    app["out"].write_text(out)
    print(f"{app['out'].relative_to(here.parent)}: {len(out)//1024} КБ · модулей JS: {len(app['files'])} · ключей проверено: {n_used} · префиксов: {n_pref}")

for name in (sys.argv[1:] or APPS):
    build(name)
