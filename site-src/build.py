#!/usr/bin/env python3
"""
Собирает сайт в один файл ../b2c/index.html.

  python3 build.py

Исходники разложены по модулям (js/*.js, в порядке префиксов), а GitHub Pages
отдаёт один файл — тот же надёжный формат, что у агентской панели.

Перед сборкой проверяет, что каждый ключ строки, который встречается в коде,
есть в словаре приложения (00-data.js) или в строках сайта (01-strings.js).
Иначе посетитель увидел бы на странице сырой ключ вместо текста.
"""
import json, pathlib, re, sys

here = pathlib.Path(__file__).parent
js_files = sorted((here / "js").glob("*.js"))
js = "\n".join(f"/* ---- {p.name} ---- */\n" + p.read_text() for p in js_files)
code = "\n".join(p.read_text() for p in js_files if p.name not in ("00-data.js", "01-strings.js"))

# ---- проверка строк --------------------------------------------------------------
data = (here / "js/00-data.js").read_text()
app_keys = set(json.loads(re.search(r"const I18N = (\{.*?\});\n", data, re.S).group(1)))
site_keys = set(re.findall(r"^\s+(\w+):\[", (here / "js/01-strings.js").read_text(), re.M))
known = app_keys | site_keys

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

# ---- логотипы авиакомпаний: встраиваются в страницу, без лишних запросов ----------
import base64
MIME = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}
logos = {}
for f in sorted((here / "img" / "airlines").glob("*")):
    if f.suffix in MIME and "-" not in f.stem:
        logos[f.stem] = f"data:{MIME[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()
marks = {}
for f in sorted((here / "img" / "airlines").glob("*-wordmark.*")):
    if f.suffix in MIME:
        marks[f.stem.split("-")[0]] = f"data:{MIME[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()
js = js.replace('/* ---- 10-core.js ---- */', "/* ---- логотипы (build.py) ---- */\nconst LOGOS = " + json.dumps(logos) + ";\nconst WORDMARKS = " + json.dumps(marks) + ";\n/* ---- 10-core.js ---- */", 1)

# ---- сборка ------------------------------------------------------------------------
shell = (here / "shell.html").read_text()
css = (here / "styles.css").read_text()
out = shell.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)
dst = here.parent / "b2c" / "index.html"
dst.parent.mkdir(exist_ok=True)
dst.write_text(out)
print(f"b2c/index.html: {len(out)//1024} КБ · модулей JS: {len(js_files)} · ключей проверено: {len(used)} · префиксов: {len(prefixes)}")
