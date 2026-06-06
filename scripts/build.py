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
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("缺少 PyYAML，請先執行：pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
LESSONS_DIR = ROOT / "data" / "lessons"
DECKS_DIR = ROOT / "data" / "decks"
WEB_DIR = ROOT / "web"
EXPORTS_DIR = ROOT / "exports"


def load_lessons():
    files = sorted(LESSONS_DIR.glob("*.yaml")) + sorted(DECKS_DIR.glob("*.yaml"))
    lessons = []
    for f in files:
        with open(f, encoding="utf-8") as fp:
            data = yaml.safe_load(fp)
        if not data:
            continue
        data.setdefault("_file", f.name)
        data.setdefault("vocab", [])
        data.setdefault("grammar", [])
        data.setdefault("exercises", [])
        data.setdefault("notes", [])
        data["_code"] = lesson_code(data)
        lessons.append(data)
    # 依冊、課排序
    lessons.sort(key=lambda d: (d.get("book") or 0, d.get("lesson") or 0, d["_file"]))
    return lessons


def lesson_code(data):
    """產生顯示/標籤用代碼，例如 B1L01；無 book 時退回 L01。"""
    book, lesson = data.get("book"), data.get("lesson")
    if lesson is None:
        return data.get("title", data["_file"])
    if book:
        return "B%dL%02d" % (book, lesson)
    return "L%02d" % lesson


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
    nv, ng = build_anki(lessons)
    total_vocab = sum(len(l["vocab"]) for l in lessons)
    print("已載入 %d 課/牌組，單字 %d、文法 %d" % (len(lessons), total_vocab,
          sum(len(l["grammar"]) for l in lessons)))
    print("  -> %s" % web_out.relative_to(ROOT))
    print("  -> exports/anki_vocab.tsv (%d 張)、exports/anki_grammar.tsv (%d 張)" % (nv, ng))
    print("\n複習網頁：用瀏覽器開啟 web/index.html")
    print("Anki：匯入 exports/*.tsv（匯入時欄位選 製表符 / Tab 分隔）")


if __name__ == "__main__":
    main()
