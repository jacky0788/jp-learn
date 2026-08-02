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
ARTICLES_DIR = ROOT / "data" / "articles"  # 廣播用連貫文章
WEB_DIR = ROOT / "web"
EXPORTS_DIR = ROOT / "exports"

GROUP_RANK = {"文法": 0, "会話": 1, "基礎": 2}

# ==== 漢字注音（ruby / 振り仮名）自動對齊 ====
# 原理：用 jp 裡的「假名段」當錨點去切 kana，反推每個漢字段的讀音。
# ⚠️ 安全鐵則：**只有切法唯一時才輸出**。有兩種以上切法（例：一日に一万歩、24時間）
#    代表無法確定，寧可不標也不能標錯；這些會列進 lint 清單，之後用 {{漢字|假名}} 手動補。
KANJI_R = r"一-鿿々〆ヶ"
_OPT_PUNCT = "。、，,．.！!？?「」『』（）()・…—-~〜／/：:；;　 "
RUBY_RE = re.compile(r"\{\{([^|{}]+)\|([^{}]+)\}\}")
RUBY_STATS = {}          # build 過程累積：ok/lex/manual/ambiguous/nomatch/none ＋ _list 待補清單
RUBY_ITEMS = []          # 所有待標注音的 {jp,kana} 物件（載入完後由 assign_ruby 統一處理）


def kata2hira(s):
    return "".join(chr(ord(c) - 0x60) if 0x30a1 <= ord(c) <= 0x30f6 else c for c in (s or ""))


def _norm_kana(s):
    s = kata2hira(s).replace("　", "").replace(" ", "")
    return s.replace("／", "").replace("/", "")


def _clean_jp(jp):
    jp = re.sub(r"【[^】]*】", "", jp)                        # 去【I】【無意志動詞×】等標記
    jp = re.sub(r"(^|[\s　])[A-Za-zＡ-Ｚ][：:]", r"\1", jp)    # 去 A： B： 說話者標籤
    return jp


def _segments(jp):
    """切成 [(kind, text)]；kind: read=需注音, alnum=數字/字母, lit=字面錨點"""
    out = []
    for m in re.finditer(r"[%s]+|[0-9０-９]+|[A-Za-zＡ-Ｚａ-ｚ]+|[^%s0-9０-９A-Za-zＡ-Ｚａ-ｚ]+"
                         % (KANJI_R, KANJI_R), jp):
        t = m.group()
        if re.match(r"^[%s]" % KANJI_R, t):
            out.append(("read", t))
        elif re.match(r"^[0-9０-９A-Za-zＡ-Ｚａ-ｚ]", t):
            out.append(("alnum", t))
        else:
            out.append(("lit", t))
    return out


def _solutions(segs, k, alnum_literal, cap=8):
    """列舉所有可能切法（最多 cap 個，足以判斷是否唯一）"""
    res = []

    def rec(si, ki, acc):
        if len(res) >= cap:
            return
        if si == len(segs):
            if ki == len(k):
                res.append(tuple(acc))
            return
        kind, t = segs[si]
        if kind == "read" or (kind == "alnum" and not alnum_literal):
            for ln in range(1, min(len(t) * 6, len(k) - ki) + 1):
                r = k[ki:ki + ln]
                if not re.fullmatch(r"[ぁ-ゖー]+", r):
                    break
                rec(si + 1, ki + ln, acc + [r])
        else:
            kk = ki
            for c in _norm_kana(t):
                if kk < len(k) and k[kk] == c:
                    kk += 1
                elif c in _OPT_PUNCT:
                    pass
                else:
                    return
            rec(si + 1, kk, acc)

    rec(0, 0, [])
    return res


_NUM_BASE = {0: "ぜろ", 1: "いち", 2: "に", 3: "さん", 4: "よん", 5: "ご",
             6: "ろく", 7: "なな", 8: "はち", 9: "きゅう", 10: "じゅう",
             100: "ひゃく", 1000: "せん", 10000: "まん"}
_NUM_ALT = {1: ["いち", "いっ", "ひと", "ひとつ"], 2: ["に", "ふた", "ふたつ"],
            3: ["さん", "みっ"], 4: ["よん", "し", "よ", "よっ"], 5: ["ご", "いつ"],
            6: ["ろく", "ろっ", "むい"], 7: ["なな", "しち"], 8: ["はち", "はっ", "よう"],
            9: ["きゅう", "く", "ここの"], 10: ["じゅう", "じゅっ", "じっ", "とお"],
            20: ["にじゅう", "はた"], 0: ["ぜろ", "れい"]}


def number_readings(s):
    """數字字串的可能讀音集合（用來裁決含數字的歧義句，寧可寬鬆也不要漏）"""
    s = s.replace(",", "").replace("，", "")
    s = "".join(chr(ord(c) - 0xFEE0) if "０" <= c <= "９" else c for c in s)
    if not s.isdigit():
        return set()
    n = int(s)
    out = set(_NUM_ALT.get(n, []))
    if n in _NUM_BASE:
        out.add(_NUM_BASE[n])
    if 10 < n < 100:                       # 11〜99
        t, o = divmod(n, 10)
        tens = ["じゅう", "じゅっ", "じっ"] if t == 1 else \
               [a + "じゅう" for a in _NUM_ALT.get(t, [_NUM_BASE.get(t, "")]) if a]
        if o == 0:
            out |= set(tens)
        else:
            ones = _NUM_ALT.get(o, [_NUM_BASE.get(o, "")])
            out |= {a + b for a in tens for b in ones if a and b}
    if n >= 100:                           # 粗略：百/千/萬，允許各段變體
        out.add("".join(_NUM_BASE.get(int(c), "") for c in s))
    return {x for x in out if x}


def _score_solution(segs, reads, alnum_literal, lex):
    """用『讀音是否在別處被證實過』替候選切法評分；全部有佐證才算可信"""
    score, i, all_ok = 0, 0, True
    for kind, t in segs:
        if kind == "read" or (kind == "alnum" and not alnum_literal):
            r = reads[i]
            i += 1
            if kind == "alnum":
                ok = r in number_readings(t) or r in lex.get(t, set())
            else:
                ok = r in lex.get(t, set())
            score += 2 if ok else -3
            all_ok = all_ok and ok
    return score, all_ok


def _emit(segs, reads, alnum_literal):
    out, i = [], 0
    for kind, t in segs:
        if kind == "read" or (kind == "alnum" and not alnum_literal):
            r = reads[i]
            i += 1
            if not r or len(r) > len(t) * 6:
                return None
            out.append("{{%s|%s}}" % (t, r))
        else:
            out.append(t)
    return "".join(out)


def ruby_markup(jp, kana, lex=None):
    """回傳 (markup, status)。status: ok / lex(靠佐證裁決) / none / ambiguous / nomatch / manual

    ⚠️ 安全鐵則：切法唯一 → 直接採用；有多種切法 → 只有在「唯一一種切法的每個讀音
    都能在專案別處找到佐證」時才採用，否則寧可不標。
    """
    if not jp or not kana:
        return None, "none"
    if RUBY_RE.search(jp):                       # YAML 已手動標記 → 直接沿用
        return jp, "manual"
    # kana 用「／」列舉多種讀音（例：何＝なに／なん）→ 不是單一句讀音，不標注音
    if re.search(r"[／/]", kana) and not re.search(r"[／/]", jp) \
            and not re.search(r"[A-Za-zＡ-Ｚ][：:]", jp):
        return None, "none"
    jpc = _clean_jp(jp)
    segs = _segments(jpc)
    if not any(k == "read" for k, _ in segs):
        return None, "none"
    k = _norm_kana(kana)
    for alnum_literal in (True, False):
        sols = _solutions(segs, k, alnum_literal, cap=60)
        if not sols:
            continue
        if len(sols) == 1:
            mk = _emit(segs, list(sols[0]), alnum_literal)
            return (mk, "ok") if mk else (None, "nomatch")
        if lex is None:
            return None, "ambiguous"
        scored = [(_score_solution(segs, list(s), alnum_literal, lex), s) for s in sols]
        good = [(sc, s) for (sc, ok), s in scored if ok]
        if len(good) == 1:
            mk = _emit(segs, list(good[0][1]), alnum_literal)
            return (mk, "lex") if mk else (None, "nomatch")
        if good:                                  # 多個都通過 → 取分數唯一最高者
            best = max(sc for sc, _ in good)
            top = [s for sc, s in good if sc == best]
            if len(top) == 1:
                mk = _emit(segs, list(top[0]), alnum_literal)
                return (mk, "lex") if mk else (None, "nomatch")
        return None, "ambiguous"
    return None, "nomatch"


def attach_ruby(d, stats, src):
    """先登記，等全部載入完再統一處理（見 assign_ruby）"""
    if isinstance(d, dict) and d.get("jp") and d.get("kana"):
        RUBY_ITEMS.append((d, src))


def assign_ruby(stats):
    """兩階段：①先做切法唯一的，累積「漢字→讀音」佐證字典
              ②再用字典裁決有歧義的（只有唯一一種切法全部有佐證才採用）"""
    lex = {}

    def learn(markup):
        for kj, rd in RUBY_RE.findall(markup or ""):
            lex.setdefault(kj, set()).add(rd)

    pending = []
    for d, src in RUBY_ITEMS:                     # 第一階段
        mk, st = ruby_markup(d["jp"], d["kana"])
        if st in ("ok", "manual"):
            d["_ruby"] = mk
            d["jp"] = RUBY_RE.sub(r"\1", d["jp"])
            learn(mk)
            stats[st] = stats.get(st, 0) + 1
        elif st == "none":
            stats["none"] = stats.get("none", 0) + 1
        else:
            pending.append((d, src))
    for d, src in pending:                        # 第二階段（用佐證裁決）
        mk, st = ruby_markup(d["jp"], d["kana"], lex)
        stats[st] = stats.get(st, 0) + 1
        if mk:
            d["_ruby"] = mk
            d["jp"] = RUBY_RE.sub(r"\1", d["jp"])
        else:
            stats.setdefault("_list", []).append((st, src, d["jp"], d["kana"]))
    stats["_lex"] = len(lex)


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


# 「る」結尾卻是五段（第I類）的常見例外動詞（辭書形假名）
GODAN_RU_EXCEPTIONS = {
    "かえる", "はしる", "はいる", "いる", "しる", "きる", "しゃべる", "へる",
    "まいる", "かぎる", "ちる", "ける", "あせる", "ねる",  # ねる(練る)等少數；寝る另判
    "すべる", "にぎる", "かじる", "よみがえる",
}
_II_PRECEDING = set("いきしちにひみりぎじびぴゃゅょぃ"  # イ段
                    "えけせてねへめれげぜべぺ")          # エ段


def classify_verb(kana):
    """由辭書形假名粗略判定動詞類別 I/II/III（無法判定回 None）。
    注意：本專案單字多以「ます形」儲存，ます形無法可靠分辨 I/II，故保守處理：
    〜します→III（可靠），其他ます形一律不猜（回 None），交由 pos 明確標示。"""
    if not kana:
        return None
    k = kana.strip()
    if k in ("する", "くる", "来る") or k.endswith("する"):
        return "III"
    if k.endswith("します"):
        return "III"
    if k.endswith("ます") or k.endswith("ません"):
        return None
    if k.endswith("る") and len(k) >= 2:
        if k in GODAN_RU_EXCEPTIONS:
            return "I"
        return "II" if k[-2] in _II_PRECEDING else "I"
    if k[-1] in "うくぐすつぬぶむ":
        return "I"
    return None


def verb_group(v):
    """回傳單字的動詞類別 I/II/III；非動詞回 None。
    優先讀 pos 內標示（動詞I/II/III、五段/一段/變格），否則由辭書形自動判定。"""
    pos = str(v.get("pos") or "")
    if v.get("vgroup"):
        return str(v["vgroup"]).replace("1", "I").replace("2", "II").replace("3", "III")
    if "動詞" not in pos and "动词" not in pos:
        return None
    m = re.search(r"(III|II|I|Ⅲ|Ⅱ|Ⅰ|３|２|１|3|2|1)", pos)
    if m:
        return {"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "１": "I", "２": "II", "３": "III",
                "1": "I", "2": "II", "3": "III"}.get(m.group(1), m.group(1))
    if "一段" in pos:
        return "II"
    if "五段" in pos:
        return "I"
    if "変格" in pos or "變格" in pos or "サ変" in pos or "カ変" in pos:
        return "III"
    return classify_verb(v.get("kana") or v.get("jp"))


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
    # 自動為動詞單字標上類別 I/II/III（給網頁顯示徽章用）
    for v in data["vocab"]:
        if isinstance(v, dict):
            g = verb_group(v)
            if g:
                v["_vgroup"] = g
    # 漢字注音（只在切法唯一時才標）
    for v in data["vocab"]:
        if isinstance(v, dict):
            attach_ruby(v, RUBY_STATS, f.name + ":單字")
            if isinstance(v.get("ex"), dict):
                attach_ruby(v["ex"], RUBY_STATS, f.name + ":單字例句")
    for g in data["grammar"]:
        if isinstance(g, dict):
            for ex in (g.get("examples") or []):
                attach_ruby(ex, RUBY_STATS, f.name + ":例句")
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


def load_articles():
    items = []
    for f in sorted(ARTICLES_DIR.glob("*.yaml")):
        with open(f, encoding="utf-8") as fp:
            d = yaml.safe_load(fp)
        if not d:
            continue
        d["_file"] = f.name
        d.setdefault("body", [])
        for s in d["body"]:
            attach_ruby(s, RUBY_STATS, "文章:" + f.name)
        items.append(d)
    return items


def load_changelog():
    f = ROOT / "data" / "changelog.yaml"
    if not f.exists():
        return []
    with open(f, encoding="utf-8") as fp:
        return yaml.safe_load(fp) or []


def build_web(lessons, articles):
    WEB_DIR.mkdir(exist_ok=True)
    payload = json.dumps(lessons, ensure_ascii=False, indent=2)
    apayload = json.dumps(articles, ensure_ascii=False, indent=2)
    cpayload = json.dumps(load_changelog(), ensure_ascii=False, indent=2)
    out = WEB_DIR / "data.js"
    out.write_text("window.LESSONS = " + payload + ";\nwindow.ARTICLES = " + apayload +
                   ";\nwindow.CHANGELOG = " + cpayload + ";\n", encoding="utf-8")
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


def quiz_count(lz):
    n = 0
    for v in lz.get("vocab", []):
        if isinstance(v, dict) and v.get("zh") and v.get("jp"):
            n += 1
    for g in lz.get("grammar", []):
        for p in (g.get("practice") or []):
            if p.get("q") and p.get("a"):
                n += 1
    for e in lz.get("exercises", []):
        if isinstance(e, dict) and e.get("q") and e.get("a"):
            n += 1
    return n


def lint_lessons(lessons):
    """檢查內容完整性，回傳警告清單（不中斷 build，只提醒）。"""
    w = []
    for lz in lessons:
        name = lz.get("_label") or lz.get("_code") or lz.get("_file")
        grp = lz["_group"]
        if not lz.get("title"):
            w.append("[%s] 缺 title" % name)
        if grp == "文法":
            if lz.get("lesson") is None:
                w.append("[%s] 文法課缺 lesson 欄位" % name)
        else:
            if not lz.get("topic"):
                w.append("[%s] 缺 topic 欄位" % name)
            if not lz.get("label"):
                w.append("[%s] 缺 label 欄位" % name)
        if not lz.get("intro"):
            w.append("[%s] 缺 intro（導讀）" % name)
        if not lz.get("goals"):
            w.append("[%s] 缺 goals（學習目標）" % name)
        for i, g in enumerate(lz.get("grammar", [])):
            gp = g.get("point") or ("#%d" % (i + 1))
            if not g.get("point"):
                w.append("[%s] grammar#%d 缺 point" % (name, i + 1))
            for ex in (g.get("examples") or []):
                for k in ("jp", "kana", "zh"):
                    if not ex.get(k):
                        w.append("[%s/%s] 例句缺 %s：%s" % (name, gp, k, ex.get("jp") or ex.get("zh") or "?"))
            for p in (g.get("practice") or []):
                if not p.get("q") or not p.get("a"):
                    w.append("[%s/%s] 練習題缺 q 或 a" % (name, gp))
            tb = g.get("table")
            if tb:
                hl = len(tb.get("headers") or [])
                rows = tb.get("rows") or []
                if not rows:
                    w.append("[%s/%s] table 無 rows" % (name, gp))
                for ri, row in enumerate(rows):
                    if hl and len(row) != hl:
                        w.append("[%s/%s] 表格第%d列欄數(%d)≠表頭(%d)" % (name, gp, ri + 1, len(row), hl))
        for v in lz.get("vocab", []):
            if isinstance(v, dict):
                if not v.get("jp"):
                    w.append("[%s] 單字缺 jp" % name)
                if not v.get("zh"):
                    w.append("[%s] 單字缺 zh：%s" % (name, v.get("jp")))
        qc = quiz_count(lz)
        if qc < 6:
            w.append("[%s] 測驗只有 %d 題（建議≥6，請補 practice 或 vocab）" % (name, qc))
    return w


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    lessons = load_lessons()
    if not lessons:
        sys.exit("找不到任何課程資料（data/lessons/*.yaml）")
    articles = load_articles()
    assign_ruby(RUBY_STATS)          # 全部載入後再統一標注音（第二階段要用全域佐證字典）
    load_extra_readings()            # 人工補充讀音（data/readings.yaml）
    build_text_lexicon(lessons, articles)
    annotate_lessons(lessons)        # 練習題／接続／標題／表格也補注音
    web_out = build_web(lessons, articles)
    ver = stamp_version()
    nv, ng = build_anki(lessons)
    total_vocab = sum(len(l["vocab"]) for l in lessons)
    n_bun = sum(1 for l in lessons if l["_group"] == "文法")
    n_kai = sum(1 for l in lessons if l["_group"] == "会話")
    n_kis = sum(1 for l in lessons if l["_group"] == "基礎")
    art_sent = sum(len(a.get("body") or []) for a in articles)
    print("已載入 文法課 %d、會話課主題 %d、基礎文法 %d、文章 %d篇(%d句)；單字 %d、文法 %d" % (
          n_bun, n_kai, n_kis, len(articles), art_sent, total_vocab,
          sum(len(l["grammar"]) for l in lessons)))
    print("  -> %s（版本 %s 已自動戳印到 index.html／sw.js）" % (web_out.relative_to(ROOT), ver))
    print("  -> exports/anki_vocab.tsv (%d 張)、exports/anki_grammar.tsv (%d 張)" % (nv, ng))
    warns = lint_lessons(lessons)
    for a in articles:
        nm = a.get("title") or a.get("_file")
        if not a.get("body"):
            warns.append("[文章:%s] 沒有 body 內容" % nm)
        for si, s in enumerate(a.get("body") or []):
            for k in ("jp", "kana", "zh"):
                if not s.get(k):
                    warns.append("[文章:%s] 第%d句缺 %s" % (nm, si + 1, k))
    if warns:
        print("\n⚠️ 內容檢查發現 %d 個提醒：" % len(warns))
        for x in warns:
            print("   - " + x)
    else:
        print("\n內容檢查：全部通過 ✅")
    report_ruby()
    print("\n複習網頁：用瀏覽器開啟 web/index.html")
    print("Anki：匯入 exports/*.tsv（匯入時欄位選 製表符 / Tab 分隔）")


# ==== 沒有 kana 欄的欄位（練習題／接続／文法點標題／表格）也標注音 ====
# 做法：從已標好的 _ruby 學一份「漢字段→讀音」字典，再對這些文字做「整段」匹配。
# ⚠️ 安全鐵則（比對齊法更嚴）：
#   ① 只在「整段漢字」完整命中字典時才標，**絕不逐字硬拆**
#      （否則中文句子如「前面用辭書形還是」會被拆成「前(まえ)面用…」這種荒謬結果）
#   ② 同一漢字段有多種讀音、且送假名也無法區分時 → 不標
#   ③ 答案是純假名的題目＝在考讀音，題目不標（否則直接洩答案，如「1本 的唸法？」）
KANA_CLS = "ぁ-ゖァ-ヺー"
TEXT_LEX = {"ctx": {}, "plain": {}}
EXTRA_READINGS = {}          # 人工補充（見 data/readings.yaml）


def load_extra_readings():
    f = ROOT / "data" / "readings.yaml"
    if not f.exists():
        return
    with open(f, encoding="utf-8") as fp:
        d = yaml.safe_load(fp) or {}
    EXTRA_READINGS.update({str(k): str(v) for k, v in d.items() if k and v})


def build_text_lexicon(lessons, articles):
    from collections import defaultdict
    ctx, plain = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))

    def learn(mk):
        parts = re.split(r"(\{\{[^|{}]+\|[^{}]+\}\})", mk or "")
        for i, p in enumerate(parts):
            m = re.fullmatch(r"\{\{([^|{}]+)\|([^{}]+)\}\}", p or "")
            if not m:
                continue
            nxt = ""
            for q in parts[i + 1:]:
                if q and not q.startswith("{{"):
                    nxt = re.match(r"^[%s]{0,2}" % KANA_CLS, q).group()
                    break
                if q:
                    break
            ctx[(m.group(1), nxt)][m.group(2)] += 1
            plain[m.group(1)][m.group(2)] += 1

    def scan(o):
        if isinstance(o, dict) and o.get("_ruby"):
            learn(o["_ruby"])
    for l in lessons:
        for v in l.get("vocab") or []:
            if isinstance(v, dict):
                scan(v); scan(v.get("ex"))
        for g in l.get("grammar") or []:
            for ex in (g.get("examples") or []):
                scan(ex)
    for a in articles:
        for s in a.get("body") or []:
            scan(s)
    TEXT_LEX["ctx"] = {k: max(v, key=v.get) for k, v in ctx.items() if len(v) == 1}
    TEXT_LEX["plain"] = {k: max(v, key=v.get) for k, v in plain.items() if len(v) == 1}


def annotate_text(t):
    """把文字中『能確定讀音的整段漢字』加上 {{漢字|假名}}；不確定就原樣保留"""
    if not t or RUBY_RE.search(t):
        return t, 0, 0
    hit = miss = 0
    out, last = [], 0
    for m in re.finditer(r"[%s]+" % KANJI_R, t):
        seg = m.group()
        nxt = re.match(r"^[%s]{0,2}" % KANA_CLS, t[m.end():]).group()
        prev = t[m.start() - 1] if m.start() else ""
        after_num = bool(re.match(r"[0-9０-９]", prev))        # 數字後面＝量詞，要用音讀
        # 優先順序：數字後量詞 → 語料的送假名context → 人工(帶送假名) → 人工 → 語料唯一讀音
        rd = (EXTRA_READINGS.get("#" + seg) if after_num else None) \
            or TEXT_LEX["ctx"].get((seg, nxt)) \
            or EXTRA_READINGS.get(seg + "|" + nxt[:1]) \
            or EXTRA_READINGS.get(seg) \
            or TEXT_LEX["plain"].get(seg)
        if after_num and not EXTRA_READINGS.get("#" + seg) and seg in ("時", "人", "日", "月", "分", "本", "回", "個"):
            rd = None                                          # 量詞讀音會變（1本→いっぽん），不確定就不標
        out.append(t[last:m.start()])
        if rd:
            out.append("{{%s|%s}}" % (seg, rd)); hit += 1
        else:
            out.append(seg); miss += 1
        last = m.end()
    out.append(t[last:])
    return "".join(out), hit, miss


def is_reading_quiz(q, a):
    """這題是不是在考『怎麼唸』？是的話題目不能標注音，否則直接洩答案。"""
    if re.search(r"唸法|読み方|よみかた|怎麼唸|如何唸|發音|读法", q or ""):
        return True
    # 題目只有「數字＋量詞」而答案是純假名（例：1本 的唸法？→ いっぽん）
    a2 = re.sub(r"[\s　。、！？!?・（）()「」/／×○]", "", a or "")
    return bool(a2) and bool(re.fullmatch(r"[%s]+" % KANA_CLS, a2)) \
        and bool(re.search(r"[0-9０-９][%s]" % KANJI_R, q or ""))


def annotate_lessons(lessons):
    """對練習題／接続／文法點標題／表格格子補注音（原欄位保持乾淨，另存 _r* 欄）"""
    hit = miss = 0

    def do(o, key, dst):
        nonlocal hit, miss
        v = o.get(key)
        if not isinstance(v, str) or not re.search(r"[%s]" % KANJI_R, v):
            return
        a, h, m = annotate_text(v)
        if h or RUBY_RE.search(v):     # 自動標到，或 YAML 已手寫 {{漢字|假名}}
            o[dst] = a
        hit += h; miss += m

    for l in lessons:
        for g in l.get("grammar") or []:
            if not isinstance(g, dict):
                continue
            do(g, "point", "_rpoint")
            if g.get("setsuzoku"):
                rs = [annotate_text(s) for s in g["setsuzoku"]]
                if any(x[1] for x in rs) or any(RUBY_RE.search(s) for s in g["setsuzoku"]):
                    g["_rsetsuzoku"] = [x[0] for x in rs]
                hit += sum(x[1] for x in rs); miss += sum(x[2] for x in rs)
            for p in (g.get("practice") or []):
                # 考「怎麼唸」的題目：題目不標，否則直接洩答案
                if not is_reading_quiz(p.get("q"), p.get("a")):
                    do(p, "q", "_rq")
                do(p, "a", "_ra")
            tb = g.get("table")
            if tb and tb.get("rows"):
                rows = [[annotate_text(c)[0] for c in row] for row in tb["rows"]]
                tb["rows"] = rows
                if tb.get("headers"):
                    tb["headers"] = [annotate_text(c)[0] for c in tb["headers"]]
                if tb.get("caption"):
                    tb["caption"] = annotate_text(tb["caption"])[0]
    RUBY_STATS["text_hit"] = hit
    RUBY_STATS["text_miss"] = miss


def report_ruby():
    """漢字注音統計＋待補清單（nomatch 多半代表 kana 寫錯，要優先修）"""
    s = RUBY_STATS
    ok, man, lx = s.get("ok", 0), s.get("manual", 0), s.get("lex", 0)
    amb, nom, non = s.get("ambiguous", 0), s.get("nomatch", 0), s.get("none", 0)
    tot = ok + man + lx + amb + nom
    if not tot:
        return
    print("\n🔤 漢字注音：切法唯一 %d／靠佐證裁決 %d／手動標記 %d／仍有歧義 %d／對不齊 %d"
          "（無漢字 %d，字典 %d 個漢字段）→ 覆蓋率 %.1f%%"
          % (ok, lx, man, amb, nom, non, s.get("_lex", 0), (ok + man + lx) / tot * 100))
    lst = s.get("_list", [])
    bad = [x for x in lst if x[0] == "nomatch"]
    if bad:
        print("   ⚠️ 對不齊（請檢查 kana 是否寫錯）：")
        for _, src, jp, kana in bad[:20]:
            print("      [%s] %s ／ %s" % (src, jp, kana))
    if amb:
        print("   ℹ️ 有歧義 %d 句已自動略過注音（多為數字），可用 {{漢字|假名}} 手動補。" % amb)
    th, tm = s.get("text_hit", 0), s.get("text_miss", 0)
    if th or tm:
        print("   📝 練習題／接続／標題／表格：已標 %d 段、未標 %d 段（未標多為中文敘述，本來就不該注音）"
              % (th, tm))


if __name__ == "__main__":
    main()
