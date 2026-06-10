// 本機日文複習 App。資料來自 data.js (window.LESSONS)。
// 無需伺服器，直接用瀏覽器開 index.html 即可。

const ARTICLES = (window.ARTICLES || []);
const GROUP_RANK = { "文法": 0, "会話": 1, "基礎": 2, "文章": 3 };
const groupRank = l => (GROUP_RANK[l._group || "文法"] ?? 0);
// 把文章包成可在選單選取的項目（內容放 _article）
const ARTICLE_LESSONS = ARTICLES.map((a, i) => ({
  _group: "文章",
  _code: "A-" + (a._file ? a._file.replace(/\.ya?ml$/, "") : i),
  _label: a.title || ("文章" + (i + 1)),
  title: a.title || "", intro: a.intro || "", order: a.order || (i + 1) * 10,
  grammar: [], vocab: [], exercises: [], notes: [], _article: a
}));
// 廣播：放進「📖 文章」群組當第一個項目（order 最小），點了在主畫面顯示播放器
const RADIO_LESSON = {
  _group: "文章", _code: "RADIO", _label: "🎧 廣播（連續聽）", title: "廣播聽力",
  order: -1, grammar: [], vocab: [], exercises: [], notes: [], _radio: true
};
const LESSONS = (window.LESSONS || []).concat(ARTICLE_LESSONS, [RADIO_LESSON]).sort((a, b) =>
  groupRank(a) - groupRank(b) ||
  (a.book || 0) - (b.book || 0) || (a.lesson || 0) - (b.lesson || 0) ||
  (a.order || 0) - (b.order || 0));
const ST = JSON.parse(localStorage.getItem("jp_srs") || "{}"); // 熟練度記錄

// 文章長短分類 & 廣播自選清單
function isLongArticle(a) { return ((a && a.body) ? a.body.length : 0) >= 40; }
function articleId(a) { return a && (a._file || a.title || ""); }
let playlist = new Set(JSON.parse(localStorage.getItem("jp_playlist") || "[]"));
function savePlaylist() { localStorage.setItem("jp_playlist", JSON.stringify([...playlist])); }
function inPlaylist(a) { return playlist.has(articleId(a)); }
function togglePlaylist(a) { const id = articleId(a); if (playlist.has(id)) playlist.delete(id); else playlist.add(id); savePlaylist(); }

function save() { localStorage.setItem("jp_srs", JSON.stringify(ST)); }
function lessonKey(l) { return l._code || l.title || l._file; }
function lessonLabel(l) { return l._label || l._code || l.title || "?"; }

// 來源（文法／会話）與重點徽章
function badges(item) {
  let h = "";
  if (item.source) h += `<span class="tag src">${item.source}</span>`;
  if (item.key) h += `<span class="tag keytag">★重點</span>`;
  return h;
}

// ---- 設定（深色模式 + 自動播放）----
const SET_KEY = "jp_settings";
const settings = Object.assign(
  { theme: null, repeats: 3, repeatGap: 0.8, gap: 4, rate: 0.9, volume: 1, readShow: "all",
    radioMins: 20, radioRepeat: 2, radioGap: 1.5, radioZh: false, radioScope: "article" },
  JSON.parse(localStorage.getItem(SET_KEY) || "{}"));
if (!settings.theme)
  settings.theme = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
function saveSettings() { localStorage.setItem(SET_KEY, JSON.stringify(settings)); }
function numSet(key, def) { const v = Number(settings[key]); return (isFinite(v) && v >= 0) ? v : def; }
function applyTheme() { document.body.classList.toggle("dark", settings.theme === "dark"); }
applyTheme();

function syncSettingsUI() {
  const d = document.getElementById("set-dark"); if (d) d.checked = settings.theme === "dark";
  const r = document.getElementById("set-repeats"); if (r) r.value = numSet("repeats", 3);
  const rg = document.getElementById("set-repeat-gap"); if (rg) rg.value = numSet("repeatGap", 0.8);
  const g = document.getElementById("set-gap"); if (g) g.value = numSet("gap", 4);
  const rt = document.getElementById("set-rate"); if (rt) rt.value = numSet("rate", 0.9);
  const vol = document.getElementById("set-volume"); if (vol) vol.value = Math.round(numSet("volume", 1) * 100);
}
(function initSettings() {
  const panel = document.getElementById("settings-panel");
  const gear = document.getElementById("settings-toggle");
  if (gear) gear.onclick = () => { syncSettingsUI(); panel.classList.remove("hidden"); };
  const close = document.getElementById("set-close");
  if (close) close.onclick = () => panel.classList.add("hidden");
  if (panel) panel.onclick = e => { if (e.target === panel) panel.classList.add("hidden"); };
  const dark = document.getElementById("set-dark");
  if (dark) dark.onchange = () => { settings.theme = dark.checked ? "dark" : "light"; applyTheme(); saveSettings(); };
  const rep = document.getElementById("set-repeats");
  if (rep) rep.onchange = () => { settings.repeats = Math.max(1, Math.min(10, parseInt(rep.value) || 3)); saveSettings(); };
  const rgap = document.getElementById("set-repeat-gap");
  if (rgap) rgap.onchange = () => { settings.repeatGap = Math.max(0, Math.min(10, parseFloat(rgap.value) || 0.8)); saveSettings(); };
  const gap = document.getElementById("set-gap");
  if (gap) gap.onchange = () => { settings.gap = Math.max(1, Math.min(30, parseInt(gap.value) || 4)); saveSettings(); };
  const rate = document.getElementById("set-rate");
  if (rate) rate.onchange = () => { settings.rate = parseFloat(rate.value) || 0.9; saveSettings(); };
  const vol = document.getElementById("set-volume");
  if (vol) vol.oninput = () => { settings.volume = Math.max(0, Math.min(1, (parseInt(vol.value) || 0) / 100)); saveSettings(); };
})();

// 廣播在「📖 文章」群組裡（選 🎧 項目→主畫面顯示播放器）。播放中可切到別課，背景續播。
function syncRadioBtn() {
  document.querySelectorAll('#lesson-checks label').forEach(el => {
    if (el.textContent.indexOf("廣播") >= 0) el.classList.toggle("playing", !!radio.on);
  });
}

// ---- 語音播放（日語 TTS）----
if (window.speechSynthesis) speechSynthesis.getVoices(); // 預載語音清單
function jaVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return vs.find(v => (v.lang || "").toLowerCase().startsWith("ja"));
}
function speak(text) {
  if (!window.speechSynthesis || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP"; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
  const v = jaVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
// 清掉會被唸出來、打斷節奏的符號（保留。、自然停頓、片假名長音ー、？！語調）
function stripSymbols(t) {
  t = String(t == null ? "" : t);
  t = t.replace(/【[^】]*】/g, " ");                       // 【】註記
  t = t.replace(/[（(][^）)]*[）)]/g, " ");                // （）內補充說明
  t = t.replace(/[「」『』《》〈〉〔〕［］\[\]｛｝{}"'`＂＇]/g, " "); // 引號/括號（保留內文）
  t = t.replace(/[／/・･｜|]/g, "、");                      // 分隔符 → 停頓
  t = t.replace(/[―—–\-]/g, "、");                        // 破折號 → 停頓（不含長音ー U+30FC）
  t = t.replace(/[→⇒⇨←↑↓↗↘]/g, "、");                    // 箭頭 → 停頓
  t = t.replace(/[…‥※＊*#~〜～≒=＝]/g, " ");               // 其他符號直接去掉
  t = t.replace(/\s*、\s*/g, "、");                        // 收掉停頓符前後多餘空白
  t = t.replace(/、{2,}/g, "、").replace(/。[、。]+/g, "。").replace(/、。/g, "。"); // 合併多餘停頓
  t = t.replace(/\s{2,}/g, " ").replace(/^[、。\s]+/, "").trim();
  return t;
}
function sayText(ex) { return stripSymbols(ex.kana || ex.jp || ""); }  // 朗讀文字：優先假名
function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function playBtn(ex) {
  const t = sayText(ex);
  return t ? `<button class="play" data-say="${escAttr(t)}" title="播放發音">🔊</button>` : "";
}

// ---- 選課狀態（一次只選一課，預設選最新的文法課）----
const bunpouLessons = LESSONS.filter(l => (l._group || "文法") === "文法");
let selectedKey = (bunpouLessons.length ? lessonKey(bunpouLessons[bunpouLessons.length - 1])
  : (LESSONS[0] ? lessonKey(LESSONS[0]) : null));

function activeLessons() { return LESSONS.filter(l => lessonKey(l) === selectedKey); }

const GROUPS = [["文法", "📘 文法課"], ["会話", "💬 會話課"], ["基礎", "📚 基礎文法"], ["文章", "📖 文章"]];

// ---- 搜尋：用關鍵字過濾課程／主題 ----
let pickerQuery = "";
function lessonHaystack(l) {
  if (l._hay) return l._hay;
  const parts = [l._label, l._code, l.title, l.intro];
  (l.goals || []).forEach(x => parts.push(x));
  (l.notes || []).forEach(x => parts.push(x));
  (l.grammar || []).forEach(g => {
    parts.push(g.point, g.explain);
    (g.setsuzoku || []).forEach(s => parts.push(s));
    (g.examples || []).forEach(e => parts.push(e.jp, e.kana, e.zh));
  });
  (l.vocab || []).forEach(v => parts.push(v.jp, v.kana, v.zh, v.pos));
  if (l._article) (l._article.body || []).forEach(s => parts.push(s.jp, s.kana, s.zh));
  l._hay = parts.filter(Boolean).join(" ").toLowerCase();
  return l._hay;
}
function lessonMatches(l, q) {
  return !q || lessonHaystack(l).includes(q);
}

let collapsedGroups = new Set(JSON.parse(localStorage.getItem("jp_collapsed") || "[]"));
function saveCollapsed() { localStorage.setItem("jp_collapsed", JSON.stringify([...collapsedGroups])); }

function appendLabel(box, l) {
  const key = lessonKey(l);
  const label = document.createElement("label");
  label.className = (key === selectedKey ? "on" : "") + (l._radio && radio.on ? " playing" : "");
  label.textContent = lessonLabel(l);
  label.onclick = () => {
    if (key === selectedKey) return;
    selectedKey = key;
    cancelAuto();                     // 換課時停止自動播放
    renderPicker();
    renderActive();
  };
  box.appendChild(label);
}

let activeGroup = null;   // 目前選的群組（文法/会話/基礎/文章）
function subHeader(box, text) {
  const sh = document.createElement("span");
  sh.className = "pick-subgroup";
  sh.textContent = text;
  box.appendChild(sh);
}
function renderGroupBody(box, g, items) {
  if (g === "文法") {                       // 依冊分組
    const books = [...new Set(items.map(l => l.book || 0))].sort((a, b) => a - b);
    books.forEach(bk => {
      if (books.length > 1) subHeader(box, bk ? `第${bk}冊` : "其他");
      items.filter(l => (l.book || 0) === bk).forEach(l => appendLabel(box, l));
    });
  } else if (g === "文章") {                 // 廣播在最前，再分 短／長文章
    items.filter(l => l._radio).forEach(l => appendLabel(box, l));
    [["短文章", a => !isLongArticle(a)], ["長文章", a => isLongArticle(a)]].forEach(([name, pred]) => {
      const sub = items.filter(l => l._article && pred(l._article));
      if (!sub.length) return;
      subHeader(box, name + "（" + sub.length + "）");
      sub.forEach(l => appendLabel(box, l));
    });
  } else {
    items.forEach(l => appendLabel(box, l));
  }
}

function renderPicker() {
  const box = document.getElementById("lesson-checks");
  box.innerHTML = "";
  const q = pickerQuery.trim().toLowerCase();

  if (q) {                                   // 搜尋：跨群組列出所有符合（附群組小標）
    let shown = 0;
    GROUPS.forEach(([g, gname]) => {
      const items = LESSONS.filter(l => (l._group || "文法") === g && lessonMatches(l, q));
      if (!items.length) return;
      shown += items.length;
      subHeader(box, gname);
      renderGroupBody(box, g, items);
    });
    if (!shown) {
      const empty = document.createElement("span");
      empty.className = "pick-empty";
      empty.textContent = "找不到符合「" + pickerQuery.trim() + "」的主題";
      box.appendChild(empty);
    }
    return;
  }

  // 一般：上方一排群組切換鈕，下方只顯示目前群組的項目（不再疊多層）
  const avail = GROUPS.filter(([g]) => LESSONS.some(l => (l._group || "文法") === g));
  if (activeGroup === null || !avail.some(([g]) => g === activeGroup)) {
    const sel = LESSONS.find(l => lessonKey(l) === selectedKey);
    activeGroup = (sel && sel._group) || (avail[0] && avail[0][0]) || "文法";
  }
  const tabs = document.createElement("div");
  tabs.className = "grp-tabs";
  avail.forEach(([g, gname]) => {
    const n = LESSONS.filter(l => (l._group || "文法") === g).length;
    const b = document.createElement("button");
    b.className = "grp-tab" + (g === activeGroup ? " on" : "");
    b.innerHTML = `${gname} <span class="gcount">${n}</span>`;
    b.onclick = () => { activeGroup = g; renderPicker(); };
    tabs.appendChild(b);
  });
  box.appendChild(tabs);
  renderGroupBody(box, activeGroup, LESSONS.filter(l => (l._group || "文法") === activeGroup));
}

function initSearch() {
  const inp = document.getElementById("lesson-search");
  if (!inp) return;
  inp.oninput = () => { pickerQuery = inp.value; renderPicker(); };
}

// ---- 分頁 ----
let currentTab = "intro";
document.querySelectorAll("nav button").forEach(b => {
  b.onclick = () => {
    cancelAuto();
    currentTab = b.dataset.tab;
    document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === currentTab));
    renderActive();
  };
});

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === tab));
}

function updateTabs() {
  // 依內容決定要顯示哪些分頁；文章只顯示「📖 文章」閱讀頁
  const l = activeLessons()[0];
  const art = !!(l && (l._article || l._radio));
  const has = {
    intro: !art && !!(l && (l.intro || (l.goals || []).length || (l.notes || []).length)),
    cards: !art && !!(l && (l.vocab || []).length),
    grammar: !art && !!(l && (l.grammar || []).length),
    quiz: !art && !!(l && ((l.vocab || []).some(v => v.zh && v.jp)
      || (l.grammar || []).some(g => (g.practice || []).length)
      || (l.exercises || []).length)),
    read: art
  };
  ["intro", "cards", "grammar", "quiz", "read"].forEach(t => {
    const btn = document.querySelector(`nav button[data-tab="${t}"]`);
    if (btn) btn.style.display = has[t] ? "" : "none";
  });
  if (!has[currentTab]) setTab(art ? "read" : (["intro", "grammar", "cards", "quiz"].find(t => has[t]) || "intro"));
}

function renderActive() {
  if (currentTab !== "read") stopReader();    // 離開閱讀分頁就停止朗讀
  updateTabs();
  if (currentTab === "intro") renderIntro();
  else if (currentTab === "cards") renderCards();
  else if (currentTab === "grammar") renderGrammar();
  else if (currentTab === "quiz") renderQuiz();
  else if (currentTab === "read") { const a = activeLessons()[0]; if (a && a._radio) renderRadio(); else renderArticle(); }
}

// ---- 說明（導讀 / 學習目標 / 重點）----
function mdParagraphs(s) {
  return String(s).split(/\n\s*\n/).map(p => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`).join("");
}

function renderIntro() {
  const root = document.getElementById("intro");
  const ls = activeLessons();
  if (!ls.length) { root.innerHTML = '<p class="empty">請先在上方勾選課數。</p>'; return; }
  root.innerHTML = ls.map(l => `
    <div class="intro-card">
      <h2>${lessonLabel(l)}　${l.title || ""}</h2>
      ${l.intro ? `<div class="intro-text">${mdParagraphs(l.intro)}</div>` : ""}
      ${(l.goals && l.goals.length) ? `<h4>學習目標</h4><ul class="goals">${l.goals.map(g => `<li>${g}</li>`).join("")}</ul>` : ""}
      ${(l.notes && l.notes.length) ? `<h4>重點筆記</h4><ul>${l.notes.map(n => `<li>${n}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
}

// ---- 單字卡（含簡易間隔複習）----
let deck = [], cardIdx = 0, flipped = false, cardsView = "card";

function vocabItems() {
  const items = [];
  activeLessons().forEach(l => (l.vocab || []).forEach((v, i) => {
    items.push({ ...v, _id: lessonKey(l) + ":v" + i, _lesson: lessonLabel(l) });
  }));
  return items;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function buildDeck() {
  const items = vocabItems();
  // 依熟練度排序：陌生(低分)優先，並做加權打散
  items.forEach(it => { it._w = (ST[it._id]?.score || 0) + Math.random() * 0.5; });
  items.sort((a, b) => a._w - b._w);
  return items;
}

// ---- 自動隨機播放 ----
const autoPlay = { on: false, deck: [], idx: 0, timer: null };
function cancelAuto() {
  autoPlay.on = false;
  if (autoPlay.timer) { clearTimeout(autoPlay.timer); autoPlay.timer = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
function startAuto() {
  const items = vocabItems();
  if (!items.length) return;
  cancelAuto();
  autoPlay.deck = shuffle(items); autoPlay.idx = 0; autoPlay.on = true;
  drawAuto();
}
function stopAuto() { cancelAuto(); renderCards(); }
function speakTimes(text, times, done) {            // 連續朗讀同一字 times 次
  if (!window.speechSynthesis || !text) { if (done) done(); return; }
  speechSynthesis.cancel();
  let n = 0;
  const step = () => {
    if (!autoPlay.on) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
    const v = jaVoice(); if (v) u.voice = v;
    const after = () => {
      if (!autoPlay.on) return;
      n++;
      if (n < times) autoPlay.timer = setTimeout(step, numSet("repeatGap", 0.8) * 1000);
      else if (done) done();
    };
    u.onend = after; u.onerror = after;
    speechSynthesis.speak(u);
  };
  step();
}
function drawAuto() {
  const root = document.getElementById("cards");
  const c = autoPlay.deck[autoPlay.idx];
  root.innerHTML = `
    <div class="flashcard auto">
      <div class="jp">${c.jp || ""} ${playBtn(c)}</div>
      <div class="kana">${c.kana || ""}</div>
      <div class="zh">${c.zh || ""}</div>
      ${c.pos ? `<div class="pos">${c.pos}</div>` : ""}
    </div>
    <div class="controls"><button class="btn-bad" id="auto-stop">■ 停止</button></div>
    <div class="progress">🔀 自動播放（隨機）　${autoPlay.idx + 1} / ${autoPlay.deck.length}　·　${c._lesson}</div>`;
  document.getElementById("auto-stop").onclick = stopAuto;
  const pb = root.querySelector(".play");
  if (pb) pb.onclick = e => { e.stopPropagation(); speak(pb.dataset.say); };
  // 朗讀 N 次 → 等待 gap 秒 → 下一個
  speakTimes(sayText(c), settings.repeats, () => {
    if (!autoPlay.on) return;
    autoPlay.timer = setTimeout(() => {
      if (!autoPlay.on) return;
      autoPlay.idx++;
      if (autoPlay.idx >= autoPlay.deck.length) finishAuto();
      else drawAuto();
    }, numSet("gap", 4) * 1000);
  });
}
function finishAuto() {
  cancelAuto();
  const root = document.getElementById("cards");
  root.innerHTML = `<p class="empty">✅ 本課單字已全部播放完畢！</p>
    <div class="controls"><button class="btn-good" id="auto-again">🔀 再播一次</button>
    <button class="btn-next" id="auto-back">回到單字卡</button></div>`;
  document.getElementById("auto-again").onclick = startAuto;
  document.getElementById("auto-back").onclick = renderCards;
}

function renderCards() {
  const root = document.getElementById("cards");
  deck = buildDeck();
  if (!deck.length) { root.innerHTML = '<p class="empty">這些課還沒有單字資料。</p>'; return; }
  if (cardsView === "list") { renderVocabList(); return; }
  cardIdx = 0; flipped = false;
  drawCard();
}

// ---- 全部單字清單（含例句）----
function renderVocabList() {
  const root = document.getElementById("cards");
  const items = vocabItems();
  root.innerHTML = `
    <div class="auto-bar">
      <button class="link" id="view-card">🃏 卡片模式</button>
      <button class="link" id="list-auto">🔀 自動播放</button>
      <span class="vcount">共 ${items.length} 個單字</span>
    </div>
    <div class="vocab-list">${items.map(v => `
      <div class="vrow">
        <div class="vhead"><span class="vjp">${v.jp || ""}</span> ${playBtn(v)}
          <span class="vkana">${v.kana || ""}</span>${v.pos ? `<span class="vpos">${v.pos}</span>` : ""}${v._vgroup ? `<span class="vgrp">${v._vgroup}類</span>` : ""}</div>
        <div class="vzh">${v.zh || ""}${v.note ? `　<span class="vnote">${v.note}</span>` : ""}</div>
        ${v.ex ? `<div class="vex"><span class="vex-jp">${v.ex.jp || ""} ${playBtn(v.ex)}</span>
          <span class="vex-kana">${v.ex.kana || ""}</span><span class="vex-zh">${v.ex.zh || ""}</span></div>` : ""}
      </div>`).join("")}</div>`;
  document.getElementById("view-card").onclick = () => { cardsView = "card"; renderCards(); };
  document.getElementById("list-auto").onclick = startAuto;
  root.querySelectorAll(".play").forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); });
}

function drawCard() {
  const root = document.getElementById("cards");
  const c = deck[cardIdx];
  const known = ST[c._id]?.score || 0;
  root.innerHTML = `
    <div class="auto-bar"><button class="link" id="start-auto">🔀 自動播放（隨機）</button>
      <button class="link" id="view-list">📋 全部單字＋例句</button></div>
    <div class="flashcard" id="fc">
      <div class="jp">${c.jp || ""} ${playBtn(c)}</div>
      ${flipped ? `
        <div class="kana">${c.kana || ""}</div>
        <div class="zh">${c.zh || ""}</div>
        ${c.pos ? `<div class="pos">${c.pos}</div>` : ""}
        ${c._vgroup ? `<div class="pos"><span class="vgrp">${c._vgroup}類動詞</span></div>` : ""}
        ${c.note ? `<div class="pos">${c.note}</div>` : ""}
        ${(c.source || c.key) ? `<div class="pos">${badges(c)}</div>` : ""}
      ` : `<div class="hint">點一下看答案 · ${c._lesson} · 熟練度 ${known}</div>`}
    </div>
    <div class="controls">
      ${flipped
      ? `<button class="btn-bad" id="bad">還不熟</button>
         <button class="btn-good" id="good">記得了</button>
         <button class="btn-next" id="next">下一個 →</button>`
      : `<button class="btn-next" id="flip">翻面</button>
         <button class="btn-next" id="next">下一個 →</button>`}
    </div>
    <div class="progress">${cardIdx + 1} / ${deck.length}　·　「還不熟／記得了」可按可不按，只想瀏覽就按「下一個」</div>`;

  document.getElementById("fc").onclick = () => { flipped = !flipped; drawCard(); };
  document.getElementById("start-auto").onclick = startAuto;
  document.getElementById("view-list").onclick = () => { cardsView = "list"; renderCards(); };
  document.getElementById("next").onclick = nextCard;
  const pb = root.querySelector(".play");
  if (pb) pb.onclick = e => { e.stopPropagation(); speak(pb.dataset.say); };
  if (flipped) {
    document.getElementById("bad").onclick = () => grade(c, -1);
    document.getElementById("good").onclick = () => grade(c, 1);
  } else {
    document.getElementById("flip").onclick = () => { flipped = true; drawCard(); };
  }
}

function nextCard() {                       // 不評熟練度，單純跳下一張
  cardIdx++; flipped = false;
  if (cardIdx >= deck.length) renderCards();
  else drawCard();
}

function grade(c, delta) {
  const rec = ST[c._id] || { score: 0 };
  rec.score = Math.max(-3, Math.min(5, rec.score + delta));
  ST[c._id] = rec; save();
  cardIdx++; flipped = false;
  if (cardIdx >= deck.length) { renderCards(); } else { drawCard(); }
}

// ---- 圖解表格（cell 支援 [x] 標色變化處、{{漢字|假名}} ruby 注音）----
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cellHtml(s) {
  let t = escHtml(s);
  t = t.replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, "<ruby>$1<rt>$2</rt></ruby>"); // ruby
  t = t.replace(/\[([^\]]+)\]/g, '<span class="hl">$1</span>');               // 標色
  return t;
}
function tableHtml(tb) {
  if (!tb || !tb.rows || !tb.rows.length) return "";
  const head = (tb.headers && tb.headers.length)
    ? `<thead><tr>${tb.headers.map(h => `<th>${cellHtml(h)}</th>`).join("")}</tr></thead>` : "";
  const body = `<tbody>${tb.rows.map(r =>
    `<tr>${r.map(c => `<td>${cellHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  const cap = tb.caption ? `<caption>${cellHtml(tb.caption)}</caption>` : "";
  return `<div class="block"><span class="blabel">圖解</span>
    <div class="gtable-wrap"><table class="gtable">${cap}${head}${body}</table></div></div>`;
}

// ---- 文法（講義版面：接続 / 説明 / 圖解 / 例 / 練習）----
function renderGrammar() {
  const root = document.getElementById("grammar");
  const ls = activeLessons().filter(l => (l.grammar || []).length);
  if (!ls.length) { root.innerHTML = '<p class="empty">這些課還沒有文法資料。</p>'; return; }
  let html = "";
  ls.forEach(l => {
    html += `<h2 class="lesson-h">${lessonLabel(l)}　${l.title || ""}</h2>`;
    const pts = l.grammar || [];
    const gidOf = gi => `g_${lessonKey(l)}_${gi}`;
    if (pts.length >= 4) {                 // 文法點多時，頂端放小目錄可跳轉
      html += `<div class="gram-toc">${pts.map((g, gi) =>
        `<button class="toc-chip" data-go="${gidOf(gi)}">${(g.point || "").replace(/^🔖\s*/, "")}</button>`).join("")}</div>`;
    }
    pts.forEach((g, gi) => {
      html += `<div class="gram-item" id="${gidOf(gi)}"><h3>${g.point || ""}${badges(g)}</h3>`;
      if (g.setsuzoku && g.setsuzoku.length)
        html += `<div class="block"><span class="blabel">接続</span><ul class="setsuzoku">${g.setsuzoku.map(s => `<li>${s}</li>`).join("")}</ul></div>`;
      if (g.explain)
        html += `<div class="block"><span class="blabel">説明</span><div class="explain">${mdParagraphs(g.explain)}</div></div>`;
      if (g.table) html += tableHtml(g.table);
      if (g.examples && g.examples.length)
        html += `<div class="block"><span class="blabel">例</span>${g.examples.map(ex => `
          <div class="example"><div class="jp">${ex.jp || ""} ${playBtn(ex)}</div><div class="kana">${ex.kana || ""}</div><div class="zh">${ex.zh || ""}</div></div>`).join("")}</div>`;
      if (g.practice && g.practice.length) {
        const pid = `pr_${lessonKey(l)}_${gi}`;
        html += `<div class="block"><span class="blabel">練習</span>${g.practice_note ? `<span class="pnote">${g.practice_note}</span>` : ""} <button class="link toggle-ans" data-t="${pid}">顯示/隱藏答案</button>
          <ol class="practice" id="${pid}">${g.practice.map(p => `
            <li><span class="pq">${p.q || ""}</span> <span class="ans">${p.a || ""}</span>${p.note ? `<span class="ans-note">（${p.note}）</span>` : ""}</li>`).join("")}</ol></div>`;
      }
      html += `</div>`;
    });
  });
  root.innerHTML = html;
  // 整組顯示/隱藏
  root.querySelectorAll(".toggle-ans").forEach(b => b.onclick = () =>
    document.getElementById(b.dataset.t).classList.toggle("show-ans"));
  // 點單一題顯示該題答案
  root.querySelectorAll(".practice li").forEach(li => li.onclick = () => li.classList.toggle("revealed"));
  // 語音播放鈕
  root.querySelectorAll(".play").forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); });
  // 小目錄跳轉
  root.querySelectorAll(".toc-chip").forEach(b => b.onclick = () => {
    const el = document.getElementById(b.dataset.go);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ---- 測驗（單字中→日 + 練習題）----
let quizPool = [], quizOrder = [], quizIdx = 0, quizCur = null, quizView = "quiz", quizKey = null;

const EX_ASK = { translate: "把中文翻成日文", fill: "填入正確形態", choice: "選出正確答案" };
const asArr = x => Array.isArray(x) ? x : (x ? [x] : []);
function buildQuizPool() {
  const pool = [];
  activeLessons().forEach(l => {
    (l.vocab || []).forEach(v => {
      if (v.zh && v.jp) {
        const alts = (v.kana && v.kana !== v.jp) ? [v.kana] : [];  // 單字也接受假名作答
        pool.push({ q: v.zh, a: v.jp, sub: v.kana || "", alts, ask: "看中文，寫出日文單字", tag: lessonLabel(l) });
      }
    });
    (l.grammar || []).forEach(g => (g.practice || []).forEach(p => {
      if (p.q && p.a) pool.push({ q: p.q, a: p.a, sub: p.note || "", alts: asArr(p.alt), ask: g.point || "", tag: lessonLabel(l) });
    }));
    (l.exercises || []).forEach(e => { if (e.q && e.a) pool.push({ q: e.q, a: e.a, sub: e.explain || "", alts: asArr(e.alt), ask: EX_ASK[e.type] || "", tag: lessonLabel(l) }); });
  });
  return pool;
}

// 比對答案：忽略空白／全形空白、句尾句點，接受多個正解
function normAns(s) { return String(s == null ? "" : s).replace(/[\s　]/g, "").replace(/[。．.]+$/, "").trim(); }
function answerOK(input, cur) {
  const a = normAns(input);
  if (!a) return false;
  return [cur.a, ...(cur.alts || [])].some(x => normAns(x) === a);
}

function renderQuiz() {
  const root = document.getElementById("quiz");
  quizPool = buildQuizPool();
  if (!quizPool.length) { root.innerHTML = '<p class="empty">這些課還沒有可出題的資料。</p>'; return; }
  const key = selectedKey + "#" + quizPool.length;
  if (key !== quizKey) { quizKey = key; quizOrder = shuffle(quizPool.map((_, i) => i)); quizIdx = 0; }
  if (quizView === "list") renderQuizList(); else drawQuiz();
}

function quizBar(extra) {
  return `<div class="auto-bar">
    <button class="link" id="quiz-list">📋 列出全部題庫</button>
    ${extra || ""}</div>`;
}

function drawQuiz() {
  const root = document.getElementById("quiz");
  if (quizIdx >= quizOrder.length) {
    root.innerHTML = quizBar(`<span class="vcount">共 ${quizPool.length} 題</span>`) +
      `<p class="empty">✅ 本單元 ${quizPool.length} 題都出過一輪了！</p>
       <div class="controls"><button class="btn-good" id="quiz-again">🔀 再來一輪</button></div>`;
    document.getElementById("quiz-again").onclick = () => { quizOrder = shuffle(quizPool.map((_, i) => i)); quizIdx = 0; drawQuiz(); };
    document.getElementById("quiz-list").onclick = () => { quizView = "list"; renderQuiz(); };
    return;
  }
  quizCur = quizPool[quizOrder[quizIdx]];
  root.innerHTML = quizBar(`<span class="vcount">第 ${quizIdx + 1} / ${quizPool.length} 題</span>`) + `
    <div class="ex-item">
      ${quizCur.ask ? `<div class="quiz-ask">📝 考點：${quizCur.ask}</div>` : ""}
      <div class="quiz-q">${quizCur.q}<span class="tag">${quizCur.tag}</span></div>
      <input class="quiz-input" id="qin" placeholder="輸入日文答案後按 Enter…" autocomplete="off">
      <div class="quiz-ans" id="qans"></div>
      <div class="controls"><button class="btn-next" id="show">看答案</button></div>
    </div>`;
  document.getElementById("quiz-list").onclick = () => { quizView = "list"; renderQuiz(); };
  const input = document.getElementById("qin");
  input.focus();
  const reveal = () => {
    const ok = answerOK(input.value, quizCur);
    document.getElementById("qans").innerHTML =
      `${ok ? '<span class="correct">✓ 正確！</span><br>' : ""}答案：<b>${quizCur.a}</b>` +
      (quizCur.sub ? `<br><span style="color:#777;font-size:14px">${quizCur.sub}</span>` : "");
    const btn = document.getElementById("show");
    btn.textContent = quizIdx + 1 >= quizOrder.length ? "看結果" : "下一題 →";
    btn.onclick = () => { quizIdx++; drawQuiz(); };
  };
  input.onkeydown = e => { if (e.key === "Enter") reveal(); };
  document.getElementById("show").onclick = reveal;
}

// 列出全部題庫（像單字列表，答案預設隱藏，可整批或單題顯示）
function renderQuizList() {
  const root = document.getElementById("quiz");
  root.innerHTML = quizBar(
    `<button class="link" id="quiz-toggle">顯示/隱藏答案</button>
     <span class="vcount">共 ${quizPool.length} 題</span>`) +
    `<ol class="practice" id="quizlist">${quizPool.map(p => `
      <li>${p.ask ? `<span class="ans-note">［${p.ask}］</span> ` : ""}<span class="pq">${p.q}</span>
        <span class="ans">${p.a}</span>${p.sub ? `<span class="ans-note">（${p.sub}）</span>` : ""}</li>`).join("")}</ol>`;
  // 此模式下「列出全部題庫」鈕改成回作答
  const back = document.getElementById("quiz-list");
  back.textContent = "📝 作答模式";
  back.onclick = () => { quizView = "quiz"; renderQuiz(); };
  const list = document.getElementById("quizlist");
  document.getElementById("quiz-toggle").onclick = () => list.classList.toggle("show-ans");
  list.querySelectorAll("li").forEach(li => li.onclick = () => li.classList.toggle("revealed"));
}

// ---- 📖 文章閱讀（全文顯示＋朗讀，高亮目前句、可連續接下一篇）----
const reader = { on: false, art: null, idx: 0, tick: null, wake: null, continuous: true };
function articleKey(a) { return "A-" + (a._file ? a._file.replace(/\.ya?ml$/, "") : ARTICLES.indexOf(a)); }
async function reqWakeR() { try { if (navigator.wakeLock) reader.wake = await navigator.wakeLock.request("screen"); } catch (e) { } }
function relWakeR() { try { if (reader.wake) reader.wake.release(); } catch (e) { } reader.wake = null; }
function clearReadHL() { document.querySelectorAll("#read .rsent.now").forEach(e => e.classList.remove("now")); }
function highlightRead(i) {
  clearReadHL();
  const el = document.getElementById("rs" + i);
  if (el) { el.classList.add("now"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
}
function stopReader() {
  reader.on = false;
  if (reader.tick) { clearInterval(reader.tick); reader.tick = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  relWakeR();
  clearReadHL();
  const b = document.getElementById("read-toggle"); if (b) { b.textContent = "▶ 朗讀"; b.classList.remove("on"); }
}
function startReader(fromIdx) {
  const l = activeLessons()[0];
  if (!l || !l._article) return;
  reader.art = l._article;
  reader.idx = (typeof fromIdx === "number") ? fromIdx : 0;
  reader.on = true;
  reqWakeR();
  const b = document.getElementById("read-toggle"); if (b) { b.textContent = "⏹ 停止"; b.classList.add("on"); }
  if (!reader.tick) reader.tick = setInterval(() => { if (window.speechSynthesis && reader.on) { try { speechSynthesis.resume(); } catch (e) { } } }, 1000);
  readerStep();
}
function readerStep() {
  if (!reader.on) return;
  const body = reader.art.body || [];
  if (reader.idx >= body.length) {                       // 一篇唸完
    const ni = ARTICLES.indexOf(reader.art) + 1;
    if (reader.continuous && ni < ARTICLES.length) {       // 接下一篇
      if (window.speechSynthesis) speechSynthesis.cancel();
      const next = ARTICLES[ni];
      selectedKey = articleKey(next); reader.art = next; reader.idx = 0;
      setTab("read"); renderPicker(); renderArticle();
      readerStep();
    } else { finishReader(); }
    return;
  }
  const s = body[reader.idx];
  highlightRead(reader.idx);
  const u = new SpeechSynthesisUtterance(sayText(s));
  u.lang = "ja-JP"; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
  const v = jaVoice(); if (v) u.voice = v;
  u.onend = () => { if (reader.on) { reader.idx++; setTimeout(() => { if (reader.on) readerStep(); }, 350); } };
  u.onerror = () => { if (reader.on) { reader.idx++; readerStep(); } };
  if (window.speechSynthesis) speechSynthesis.speak(u);
}
function finishReader() {
  stopReader();
  const el = document.querySelector("#read .read-bar .read-done");
  if (el) el.textContent = "✅ 讀完了！";
}
function renderArticle() {
  const root = document.getElementById("read");
  const l = activeLessons()[0];
  if (!l || !l._article) { root.innerHTML = '<p class="empty">請在上方「📖 文章」選一篇文章。</p>'; return; }
  const a = l._article;
  const show = settings.readShow || "all";
  const showCls = show === "jp" ? "hide-zh" : (show === "jpzh" ? "hide-kana" : "");
  const showBtn = (v, label) => `<button class="seg ${show === v ? "on" : ""}" data-show="${v}">${label}</button>`;
  root.innerHTML = `
    <div class="read-head">
      <h2>${a.title || ""} ${a.level ? `<span class="lv">${a.level}</span>` : ""}</h2>
      ${a.intro ? `<div class="read-intro">${mdParagraphs(a.intro)}</div>` : ""}
      <div class="read-bar">
        <button class="btn-good ${reader.on ? "on" : ""}" id="read-toggle">${reader.on ? "⏹ 停止" : "▶ 朗讀"}</button>
        <label class="read-opt"><input type="checkbox" id="read-cont" ${reader.continuous ? "checked" : ""}> 播完接下一篇</label>
        <button class="link" id="read-fav">${inPlaylist(a) ? "★ 已在廣播清單" : "☆ 加入廣播清單"}</button>
        <span class="read-done"></span>
      </div>
      <div class="seg-row read-show">顯示：${showBtn("all", "日＋假名＋中")}${showBtn("jpzh", "日＋中")}${showBtn("jp", "日＋假名")}</div>
      <div class="read-hint">點任一句可從那句開始朗讀；朗讀時會高亮目前句子。</div>
    </div>
    <div class="read-body ${showCls}">
      ${(a.body || []).map((s, i) => `<p class="rsent" id="rs${i}" data-i="${i}">
        <span class="rs-jp">${s.jp || ""}</span>
        <span class="rs-kana">${s.kana || ""}</span>
        <span class="rs-zh">${s.zh || ""}</span></p>`).join("")}
    </div>`;
  document.getElementById("read-toggle").onclick = () => { if (reader.on) stopReader(); else startReader(); };
  document.getElementById("read-cont").onchange = e => { reader.continuous = e.target.checked; };
  const fav = document.getElementById("read-fav");
  if (fav) fav.onclick = () => { togglePlaylist(a); fav.textContent = inPlaylist(a) ? "★ 已在廣播清單" : "☆ 加入廣播清單"; };
  root.querySelectorAll("[data-show]").forEach(b => b.onclick = () => {
    settings.readShow = b.dataset.show; saveSettings();
    const rb = root.querySelector(".read-body");
    rb.classList.toggle("hide-zh", b.dataset.show === "jp");
    rb.classList.toggle("hide-kana", b.dataset.show === "jpzh");
    root.querySelectorAll("[data-show]").forEach(x => x.classList.toggle("on", x === b));
  });
  root.querySelectorAll(".rsent").forEach(p => p.onclick = () => { stopReader(); startReader(+p.dataset.i); });
  if (reader.on && reader.art === a) highlightRead(reader.idx);
}

// ---- 🎧 廣播聽力（連續朗讀，邊運動邊聽）----
const radio = { on: false, deck: [], idx: 0, timer: null, tick: null, endAt: 0, wake: null, now: null };

const ARTICLE_SCOPES = ["mine", "article", "short", "long"];
function articlePool(filterFn) {
  const pool = [];
  ARTICLES.filter(filterFn).forEach(a => (a.body || []).forEach(s => {
    if (s.jp) pool.push({ jp: s.jp, kana: s.kana, zh: s.zh, tag: a.title || "文章" });
  }));
  return pool;
}
function buildRadioPool() {
  const s = settings.radioScope;
  if (s === "mine") return articlePool(a => inPlaylist(a));            // ⭐ 自選清單
  if (s === "short") return articlePool(a => !isLongArticle(a));       // 短文章
  if (s === "long") return articlePool(a => isLongArticle(a));         // 長文章
  if (s === "article") return articlePool(() => true);                // 全部文章
  const pool = [];
  const lessons = (s === "all") ? LESSONS : LESSONS.filter(l => (l._group || "文法") === "会話");
  lessons.forEach(l => {
    const tag = lessonLabel(l);
    (l.grammar || []).forEach(g => (g.examples || []).forEach(ex => { if (ex.jp) pool.push({ jp: ex.jp, kana: ex.kana, zh: ex.zh, tag }); }));
    (l.vocab || []).forEach(v => { if (v.ex && v.ex.jp) pool.push({ jp: v.ex.jp, kana: v.ex.kana, zh: v.ex.zh, tag }); });
  });
  return pool;
}
const isArticleMode = () => ARTICLE_SCOPES.indexOf(settings.radioScope) >= 0;

async function reqWake() { try { if (navigator.wakeLock) radio.wake = await navigator.wakeLock.request("screen"); } catch (e) { } }
function relWake() { try { if (radio.wake) radio.wake.release(); } catch (e) { } radio.wake = null; }

function stopRadio() {
  radio.on = false;
  if (radio.timer) { clearTimeout(radio.timer); radio.timer = null; }
  if (radio.tick) { clearInterval(radio.tick); radio.tick = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  relWake();
  syncRadioBtn();
}

function speakSeq(parts, done) {
  if (!window.speechSynthesis || !parts.length) { if (done) done(); return; }
  let i = 0;
  const step = () => {
    if (!radio.on) return;
    if (i >= parts.length) { if (done) done(); return; }
    const p = parts[i++];
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = p.lang; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
    if (p.lang.indexOf("ja") === 0) { const v = jaVoice(); if (v) u.voice = v; }
    u.onend = () => { if (radio.on) step(); };
    u.onerror = () => { if (radio.on) step(); };
    speechSynthesis.speak(u);
  };
  step();
}

function fmtMMSS(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function radioRemain() { const el = document.getElementById("radio-remain"); if (el) el.textContent = "剩餘 " + fmtMMSS(radio.endAt - Date.now()); }

function startRadio() {
  const pool = buildRadioPool();
  if (!pool.length) { renderRadio(); return; }
  stopRadio();
  radio.deck = isArticleMode() ? pool : shuffle(pool);   // 文章照順序，其餘隨機
  radio.idx = 0; radio.on = true;
  radio.endAt = Date.now() + numSet("radioMins", 20) * 60000;
  reqWake();
  syncRadioBtn();
  renderRadio();                                   // 切換成「播放中」畫面
  radio.tick = setInterval(() => {
    radioRemain();
    if (window.speechSynthesis && radio.on) { try { speechSynthesis.resume(); } catch (e) { } } // 防部分瀏覽器中斷
  }, 1000);
  radioStep();
}

function radioStep() {
  if (!radio.on) return;
  if (Date.now() >= radio.endAt) { finishRadio(); return; }
  const it = radio.deck[radio.idx % radio.deck.length];
  radio.now = it;
  drawRadioNow(it);
  const reps = isArticleMode() ? 1 : Math.max(1, Math.round(numSet("radioRepeat", 2)));  // 文章不重複，保持連貫
  const parts = [];
  const ja = sayText(it);
  for (let k = 0; k < reps; k++) parts.push({ text: ja, lang: "ja-JP" });
  if (settings.radioZh && it.zh) parts.push({ text: stripSymbols(it.zh), lang: "zh-TW" });
  speakSeq(parts, () => {
    if (!radio.on) return;
    radio.timer = setTimeout(() => { if (!radio.on) return; radio.idx++; radioStep(); }, numSet("radioGap", 1.5) * 1000);
  });
}

function finishRadio() {
  stopRadio();
  const card = document.querySelector("#read .radio-now");
  if (card) card.innerHTML = `<p class="empty">✅ 播放結束（${numSet("radioMins", 20)} 分鐘）！辛苦了～</p>`;
  const btn = document.getElementById("radio-toggle");
  if (btn) { btn.textContent = "▶ 開始播放"; btn.classList.remove("on"); }
}

function drawRadioNow(it) {
  const el = document.querySelector("#read .radio-now");
  if (!el) return;
  el.innerHTML = `
    <div class="rn-tag">${it.tag || ""}</div>
    <div class="rn-jp">${it.jp || ""}</div>
    <div class="rn-kana">${it.kana || ""}</div>
    <div class="rn-zh">${settings.radioZh ? (it.zh || "") : ""}</div>`;
}

const RADIO_MINS = [15, 20, 30];
function renderRadio() {
  const root = document.getElementById("read");
  if (!root) return;
  const scope = settings.radioScope;
  const scopeBtn = (v, label) => `<button class="seg ${scope === v ? "on" : ""}" data-scope="${v}">${label}</button>`;
  const minBtn = m => `<button class="seg ${numSet("radioMins", 20) === m ? "on" : ""}" data-min="${m}">${m}分</button>`;
  const plEditor = `
    <details class="pl-details">
      <summary>⭐ 我的清單：已選 <b id="pl-count">${playlist.size}</b> 篇（點此展開勾選）</summary>
      <div class="pl-edit">
        ${[["短文章", ARTICLES.filter(a => !isLongArticle(a))], ["長文章", ARTICLES.filter(a => isLongArticle(a))]].map(([nm, arr]) =>
        `<div class="pl-sub">${nm}（${arr.length}）</div>` + arr.map(a =>
          `<label class="pl-row"><input type="checkbox" class="pl-cb" data-id="${escAttr(articleId(a))}" ${inPlaylist(a) ? "checked" : ""}><span>${a.title || ""}（${(a.body || []).length}句）</span></label>`
        ).join("")).join("")}
      </div>
    </details>`;
  const emptyMine = scope === "mine" && playlist.size === 0;
  const placeholder = emptyMine
    ? '⭐ 清單還是空的。請展開下方「我的清單」勾選想聽的文章，或改選其他範圍。'
    : '設定好按「開始播放」，就能一直聽下去 🎶';
  root.innerHTML = `
    <div class="radio-box">
      <div class="radio-hint">🎧 連續朗讀，邊運動邊聽。建議讓螢幕保持開啟（已自動嘗試防鎖屏）。${isArticleMode() ? "<br>📖 文章照順序連貫朗讀、不重複，一篇接一篇。" : ""}</div>
      <div class="set-section">聽什麼</div>
      <div class="seg-row">${scopeBtn("mine", "⭐ 我的清單")}${scopeBtn("article", "📖 全部文章")}${scopeBtn("short", "短文章")}${scopeBtn("long", "長文章")}${scopeBtn("kaiwa", "💬 全部會話")}${scopeBtn("all", "📚 全部")}</div>
      ${plEditor}
      <div class="set-section">播放時間</div>
      <div class="seg-row">${RADIO_MINS.map(minBtn).join("")}
        <label class="radio-custom">自訂 <input type="number" id="radio-mins" min="1" max="120" step="1" value="${numSet("radioMins", 20)}"> 分</label></div>
      <div class="set-section">播放設定</div>
      <label class="set-row"><span>每句日文重複次數</span><input type="number" id="radio-rep" min="1" max="5" step="1" value="${numSet("radioRepeat", 2)}"></label>
      <label class="set-row"><span>每句之間間隔（秒）</span><input type="number" id="radio-gap" min="0" max="10" step="0.5" value="${numSet("radioGap", 1.5)}"></label>
      <label class="set-row"><span>日文後也唸中文</span><input type="checkbox" id="radio-zh" ${settings.radioZh ? "checked" : ""}></label>
      <div class="controls">
        <button class="btn-good ${radio.on ? "on" : ""}" id="radio-toggle">${radio.on ? "⏹ 停止" : "▶ 開始播放"}</button>
        <span id="radio-remain" class="vcount">${radio.on ? "剩餘 " + fmtMMSS(radio.endAt - Date.now()) : ""}</span>
      </div>
      <div class="radio-now">${radio.on && radio.now ? "" : `<p class="empty">${placeholder}</p>`}</div>
    </div>`;
  if (radio.on && radio.now) drawRadioNow(radio.now);
  root.querySelectorAll(".pl-cb").forEach(cb => cb.onchange = () => {
    if (cb.checked) playlist.add(cb.dataset.id); else playlist.delete(cb.dataset.id);
    savePlaylist();
    const c = document.getElementById("pl-count"); if (c) c.textContent = playlist.size;
    syncRadioBtn();
  });
  root.querySelectorAll("[data-scope]").forEach(b => b.onclick = () => { settings.radioScope = b.dataset.scope; saveSettings(); renderRadio(); });
  root.querySelectorAll("[data-min]").forEach(b => b.onclick = () => { settings.radioMins = +b.dataset.min; saveSettings(); renderRadio(); });
  const mins = document.getElementById("radio-mins");
  mins.onchange = () => { settings.radioMins = Math.max(1, +mins.value || 20); saveSettings(); renderRadio(); };
  document.getElementById("radio-rep").onchange = e => { settings.radioRepeat = Math.max(1, +e.target.value || 2); saveSettings(); };
  document.getElementById("radio-gap").onchange = e => { settings.radioGap = Math.max(0, +e.target.value || 1.5); saveSettings(); };
  document.getElementById("radio-zh").onchange = e => { settings.radioZh = e.target.checked; saveSettings(); };
  document.getElementById("radio-toggle").onclick = () => { if (radio.on) { stopRadio(); renderRadio(); } else startRadio(); };
}

// ---- 啟動 ----
if (!LESSONS.length) {
  document.querySelector("main").innerHTML =
    '<p class="empty">還沒有資料。請先執行 <code>python scripts/build.py</code> 生成 data.js。</p>';
} else {
  initSearch();
  renderPicker();
  renderActive();
}

// ---- 離線支援（Service Worker）＋ 偵測到新版自動更新 ----
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;  // 首次安裝不重整，更新時才自動重整
    refreshing = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(reg => {
      reg.update();                            // 每次開啟主動檢查新版
      setInterval(() => reg.update(), 60 * 60 * 1000);
    }).catch(() => {});
  });
}
