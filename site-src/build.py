#!/usr/bin/env python3
"""
Собирает три приложения Charteri из одних модулей, каждое — в один HTML-файл:

  ../b2c/index.html     сайт для пассажиров
  ../index.html         кабинет агентства
  ../admin/index.html   админка Charteri (операторы, касса, бухгалтерия)

  python3 build.py              все три
  python3 build.py b2b admin    только перечисленные
  python3 build.py --api-base http://127.0.0.1:3101/api/v1 --out /tmp/charteri-api-demo
                                локальная копия, которая ходит на сервер charteri-api
                                (CONFIG.api.base в копии; в репозитории base остаётся
                                пустым, и без --out флаг не принимается)

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
import base64, hashlib, json, pathlib, re, sys

here = pathlib.Path(__file__).parent
MIME = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}

SITE_ONLY = ("70-pages.js", "71-cms-pages.js", "97-api-site.js", "99-boot.js")
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

STRING_FILES = ("00-data.js", "01-strings.js", "05-api-strings.js", "01-strings-b2b.js", "01-strings-admin.js")

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

# ---- адрес сервера для локальной копии (--api-base … --out …) -----------------------
args = sys.argv[1:]
def take(flag):
    if flag not in args: return None
    i = args.index(flag)
    if i + 1 >= len(args): print(f"{flag}: нужно значение"); sys.exit(1)
    v = args[i + 1]; del args[i:i + 2]; return v
API_BASE, OUT_DIR = take("--api-base"), take("--out")
if API_BASE and not OUT_DIR:
    print("--api-base пишет только в отдельную папку (--out): собранные файлы репозитория остаются на тестовых данных"); sys.exit(1)
if OUT_DIR and here.parent.resolve() in [pathlib.Path(OUT_DIR).resolve(), *pathlib.Path(OUT_DIR).resolve().parents]:
    print("--out: нужна папка вне репозитория"); sys.exit(1)
if API_BASE and not re.fullmatch(r"(https://[\w.-]+|http://(127\.0\.0\.1|localhost))(:\d+)?(/[\w./-]*)?", API_BASE):
    print("--api-base: https-адрес или http://127.0.0.1"); sys.exit(1)

def with_api(js):
    """CONFIG.api.base в копии: ровно одна замена пустой строки в блоке api."""
    pat = re.compile(r'(\n  api: \{\n    base: )""')
    if len(pat.findall(js)) != 1: print("00-config.js: не найден CONFIG.api.base"); sys.exit(1)
    return pat.sub(lambda m: m.group(1) + json.dumps(API_BASE), js)

# ---- политика безопасности страницы (CSP) для сборки с сервером --------------------
# Когда в сборке задан CONFIG.api.base (рабочая версия или --api-base), в <head>
# ставится Content-Security-Policy: скрипты — только встроенный (по хешу) и два
# файла CDN по точному адресу (qrcode-generator и maplibre из CONFIG.map.lib),
# запросы — только к серверу API и тайлам карты. Демо без сервера (GitHub Pages)
# собирается как раньше.
def cfg_str(js, block, key):
    m = re.search(r"\n  " + block + r": \{\n(?:    .*\n)*?    " + key + r': ("(?:[^"\\]|\\.)*")', js)
    return json.loads(m.group(1)) if m else ""

def sha(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"

def origin(url):
    m = re.match(r"(https?://[^/]+)", url or ""); return m.group(1) if m else ""

def with_csp(html, js):
    base = cfg_str(js, "api", "base")
    if not base: return html
    lib = cfg_str(js, "map", "lib")
    inline = [m for m in re.findall(r"<script>(.*?)</script>", html, re.S)]
    handlers = sorted(set(re.findall(r'\son(?:load|error)="([^"$`{}]+)"', html)))
    cdn = re.findall(r'<script src="(https://[^"]+)"', html)
    script = " ".join([*map(sha, inline), *(["'unsafe-hashes'", *map(sha, handlers)] if handlers else []), *cdn,
                       *([lib + "maplibre-gl.js"] if lib else [])])
    policy = "; ".join([
        "default-src 'self'",
        "script-src " + script,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" + (" " + lib + "maplibre-gl.css" if lib else ""),
        "font-src https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' " + " ".join(sorted({origin(base), "https://tiles.openfreemap.org"} - {""})),
        "worker-src blob:", "child-src blob:", "frame-src https://www.youtube-nocookie.com",
        "object-src 'none'", "base-uri 'none'", "form-action 'self'"])
    meta = f'<meta http-equiv="Content-Security-Policy" content="{policy}">'
    return html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + meta, 1)

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
    if API_BASE: js = with_api(js)
    css = "\n".join((here / c).read_text() for c in app["css"])
    out = (here / app["shell"]).read_text().replace("/*__CSS__*/", css).replace("/*__JS__*/", js)
    out = with_csp(out, js)
    dest = pathlib.Path(OUT_DIR) / app["out"].relative_to(here.parent) if OUT_DIR else app["out"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out)
    shown = dest if OUT_DIR else dest.relative_to(here.parent)
    print(f"{shown}: {len(out)//1024} КБ · модулей JS: {len(app['files'])} · ключей проверено: {n_used} · префиксов: {n_pref}" + (f" · API {API_BASE}" if API_BASE else "")
          + (" · CSP" if "Content-Security-Policy" in out else ""))

for name in (args or APPS):
    build(name)
