#!/usr/bin/env python3
"""把 data/lessons/*.yaml 編譯成複習材料。

產出：
  web/data.js           本機網頁複習用（window.LESSONS）
  exports/anki_vocab.tsv    Anki 單字牌組（製表符分隔）
  exports/anki_grammar.tsv  Anki 文法牌組

用法：python scripts/build.py
"""
import sys
import json
import re
import hashlib
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("缺少 PyYAML，請先執行：pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
LESSONS_DIR = ROOT / "data" / "lessons"   # 文法課（依冊）
KAIWA_DIR = ROOT / "data" / "kaiwa"       # 會話課（依主題）
KISO_DIR = ROOT / "data" / "kiso"         # 基礎文法（自學補充）
WEB_DIR = ROOT / "web"
EXPORTS_DIR = ROOT / "exports"

GROUP_RANK = {"文法": 0, "会話": 1, "基礎": 2}


def load_lessons():
    items = []
    for f in sorted(LESSONS_DIR.glob("*.yaml")):
        items.append(_load_one(f, "文法"))
    for f in sorted(KAIWA_DIR.glob("*.yaml")):
        items.append(_load_one(f, "会話"))
    for f in sorted(KISO_DIR.glob("*.yaml")):
        items.append(_load_one(f, "基礎"))
    items = [d for d in items if d]
    # 排序：文法課在前（依冊、課）→ 會話課（依 order）→ 基礎文法（依 order）
    items.sort(key=lambda d: (
        GROUP_RANK.get(d["_group"], 1),
        d.get("book") or 0, d.get("lesson") or 0, d.get("order") or 0, d["_file"]))
    return items


def _load_one(f, group):
    with open(f, encoding="utf-8") as fp:
        data = yaml.safe_load(fp)
    if not data:
        return None
    # track 欄位可覆寫資料夾推斷
    if data.get("track") in ("会話", "會話", "kaiwa"):
        group = "会話"
    elif data.get("track") in ("文法", "bunpou"):
        group = "文法"
    elif data.get("track") in ("基礎", "基础", "kiso"):
        group = "基礎"
    data["_file"] = f.name
    data["_group"] = group
    data.setdefault("vocab", [])
    data.setdefault("grammar", [])
    data.setdefault("exercises", [])
    data.setdefault("notes", [])
    data["_code"], data["_label"] = lesson_code(data, group)
    return data


def lesson_code(data, group):
    """回傳 (唯一代碼, 顯示用短標籤)。文法＝B1L01；會話＝主題 slug＋短名。"""
    book, lesson = data.get("book"), data.get("lesson")
    if group == "文法" and lesson is not None:
        code = ("B%dL%02d" % (book, lesson)) if book else ("L%02d" % lesson)
        return code, code
    # 會話／基礎：用 topic 當唯一鍵，label 短名顯示在選單
    topic = data.get("topic") or data["_file"].rsplit(".", 1)[0]
    label = data.get("label") or data.get("title") or topic
    prefix = "G-" if group == "基礎" else "K-"
    return prefix + topic, label


def tsv_escape(s):
    return str(s or "").replace("\t", " ").replace("\n", "<br>").strip()


def item_tags(code, item):
    """組 Anki 標籤欄：課代碼 + 來源(文法/会話) + 重點。Anki 標籤不能有空白。"""
    tags = [code]
    src = item.get("source") or ""
    for part in src.replace("／", "・").replace("/", "・").split("・"):
        part = part.strip().replace("會", "会")  # 繁→日 統一
        if part:
            tags.append(part)
    if item.get("key"):
        tags.append("重点")
    return " ".join(tags)


def build_web(lessons):
    WEB_DIR.mkdir(exist_ok=True)
    payload = json.dumps(lessons, ensure_ascii=False, indent=2)
    out = WEB_DIR / "data.js"
    out.write_text("window.LESSONS = " + payload + ";\n", encoding="utf-8")
    return out


def stamp_version():
    """以內容雜湊當版本號，自動寫進 index.html(?v=) 與 sw.js(CACHE)。
    版本只在 data.js/app.js/style.css 內容變動時才改 → 不用手動 bump，也不會漏改造成快取不更新。"""
    assets = []
    for name in ("data.js", "app.js", "style.css"):
        p = WEB_DIR / name
        if p.exists():
            assets.append(p.read_bytes())
    ver = hashlib.sha1(b"".join(assets)).hexdigest()[:8]

    idx = WEB_DIR / "index.html"
    if idx.exists():
        html = idx.read_text(encoding="utf-8")
        html = re.sub(r'(style\.css|app\.js|data\.js)\?v=[^"\']*',
                      lambda m: "%s?v=%s" % (m.group(1), ver), html)
        idx.write_text(html, encoding="utf-8")

    sw = WEB_DIR / "sw.js"
    if sw.exists():
        swtext = sw.read_text(encoding="utf-8")
        swtext = re.sub(r'(const CACHE = "jp-learn-)[^"]*(")',
                        lambda m: m.group(1) + ver + m.group(2), swtext)
        sw.write_text(swtext, encoding="utf-8")
    return ver


def build_anki(lessons):
    EXPORTS_DIR.mkdir(exist_ok=True)
    vocab_rows, grammar_rows = [], []
    for lz in lessons:
        tag = lz["_code"]
        for v in lz["vocab"]:
            front = tsv_escape(v.get("jp"))
            back = "%s<br>%s" % (tsv_escape(v.get("kana")), tsv_escape(v.get("zh")))
            if v.get("pos"):
                back += "<br>[%s]" % tsv_escape(v["pos"])
            if v.get("note"):
                back += "<br>%s" % tsv_escape(v["note"])
            vocab_rows.append("%s\t%s\t%s" % (front, back, item_tags(tag, v)))
        for g in lz["grammar"]:
            front = tsv_escape(g.get("point"))
            parts = []
            for s in g.get("setsuzoku", []):
                parts.append("〔接続〕%s" % tsv_escape(s))
            parts.append(tsv_escape(g.get("explain")))
            for ex in g.get("examples", []):
                parts.append("%s（%s）%s" % (tsv_escape(ex.get("jp")),
                                            tsv_escape(ex.get("kana")),
                                            tsv_escape(ex.get("zh"))))
            grammar_rows.append("%s\t%s\t%s" % (front, "<br>".join(parts), item_tags(tag, g)))

    header = "#separator:tab\n#html:true\n#tags column:3\n"
    (EXPORTS_DIR / "anki_vocab.tsv").write_text(header + "\n".join(vocab_rows) + "\n", encoding="utf-8")
    (EXPORTS_DIR / "anki_grammar.tsv").write_text(header + "\n".join(grammar_rows) + "\n", encoding="utf-8")
    return len(vocab_rows), len(grammar_rows)


def main():
    lessons = load_lessons()
    if not lessons:
        sys.exit("找不到任何課程資料（data/lessons/*.yaml）")
    web_out = build_web(lessons)
    ver = stamp_version()
    nv, ng = build_anki(lessons)
    total_vocab = sum(len(l["vocab"]) for l in lessons)
    n_bun = sum(1 for l in lessons if l["_group"] == "文法")
    n_kai = sum(1 for l in lessons if l["_group"] == "会話")
    n_kis = sum(1 for l in lessons if l["_group"] == "基礎")
    print("已載入 文法課 %d、會話課主題 %d、基礎文法 %d；單字 %d、文法 %d" % (
          n_bun, n_kai, n_kis, total_vocab,
          sum(len(l["grammar"]) for l in lessons)))
    print("  -> %s（版本 %s 已自動戳印到 index.html／sw.js）" % (web_out.relative_to(ROOT), ver))
    print("  -> exports/anki_vocab.tsv (%d 張)、exports/anki_grammar.tsv (%d 張)" % (nv, ng))
    print("\n複習網頁：用瀏覽器開啟 web/index.html")
    print("Anki：匯入 exports/*.tsv（匯入時欄位選 製表符 / Tab 分隔）")


if __name__ == "__main__":
    main()
