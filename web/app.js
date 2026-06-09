// 本機日文複習 App。資料來自 data.js (window.LESSONS)。
// 無需伺服器，直接用瀏覽器開 index.html 即可。

const groupRank = l => ((l._group || "文法") === "会話" ? 1 : 0);
const LESSONS = (window.LESSONS || []).slice().sort((a, b) =>
  groupRank(a) - groupRank(b) ||
  (a.book || 0) - (b.book || 0) || (a.lesson || 0) - (b.lesson || 0) ||
  (a.order || 0) - (b.order || 0));
const ST = JSON.parse(localStorage.getItem("jp_srs") || "{}"); // 熟練度記錄

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
  { theme: null, repeats: 3, repeatGap: 0.8, gap: 4, rate: 0.9 },
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
})();

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
  u.lang = "ja-JP"; u.rate = settings.rate || 0.9;
  const v = jaVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function sayText(ex) {                       // 朗讀用文字：優先假名，去掉【】與箭頭
  return String(ex.kana || ex.jp || "").replace(/【[^】]*】/g, "").replace(/[→⇒]/g, "、").trim();
}
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

const GROUPS = [["文法", "📘 文法課"], ["会話", "💬 會話課"]];
function renderPicker() {
  const box = document.getElementById("lesson-checks");
  box.innerHTML = "";
  GROUPS.forEach(([g, gname]) => {
    const items = LESSONS.filter(l => (l._group || "文法") === g);
    if (!items.length) return;
    const head = document.createElement("span");
    head.className = "pick-group";
    head.textContent = gname;
    box.appendChild(head);
    items.forEach(l => {
      const key = lessonKey(l);
      const label = document.createElement("label");
      label.className = key === selectedKey ? "on" : "";
      label.textContent = lessonLabel(l);
      label.onclick = () => {
        if (key === selectedKey) return;
        selectedKey = key;
        cancelAuto();                     // 換課時停止自動播放
        renderPicker();
        renderActive();
      };
      box.appendChild(label);
    });
  });
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
  // 會話課不顯示「單字卡」（沒有單字）
  const l = activeLessons()[0];
  const hideCards = !l || (l._group === "会話");
  const cardsBtn = document.querySelector('nav button[data-tab="cards"]');
  if (cardsBtn) cardsBtn.style.display = hideCards ? "none" : "";
  if (hideCards && currentTab === "cards") setTab("grammar");
}

function renderActive() {
  updateTabs();
  if (currentTab === "intro") renderIntro();
  else if (currentTab === "cards") renderCards();
  else if (currentTab === "grammar") renderGrammar();
  else renderQuiz();
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
    u.lang = "ja-JP"; u.rate = settings.rate || 0.9;
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
          <span class="vkana">${v.kana || ""}</span>${v.pos ? `<span class="vpos">${v.pos}</span>` : ""}</div>
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

// ---- 文法（講義版面：接続 / 説明 / 例 / 練習）----
function renderGrammar() {
  const root = document.getElementById("grammar");
  const ls = activeLessons().filter(l => (l.grammar || []).length);
  if (!ls.length) { root.innerHTML = '<p class="empty">這些課還沒有文法資料。</p>'; return; }
  let html = "";
  ls.forEach(l => {
    html += `<h2 class="lesson-h">${lessonLabel(l)}　${l.title || ""}</h2>`;
    (l.grammar || []).forEach((g, gi) => {
      html += `<div class="gram-item"><h3>${g.point || ""}${badges(g)}</h3>`;
      if (g.setsuzoku && g.setsuzoku.length)
        html += `<div class="block"><span class="blabel">接続</span><ul class="setsuzoku">${g.setsuzoku.map(s => `<li>${s}</li>`).join("")}</ul></div>`;
      if (g.explain)
        html += `<div class="block"><span class="blabel">説明</span><div class="explain">${mdParagraphs(g.explain)}</div></div>`;
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
}

// ---- 測驗（單字中→日 + 練習題）----
let quizPool = [], quizCur = null;

const EX_ASK = { translate: "把中文翻成日文", fill: "填入正確形態", choice: "選出正確答案" };
function buildQuizPool() {
  const pool = [];
  activeLessons().forEach(l => {
    (l.vocab || []).forEach(v => { if (v.zh && v.jp) pool.push({ q: v.zh, a: v.jp, sub: v.kana || "", ask: "看中文，寫出日文單字", tag: lessonLabel(l) }); });
    (l.grammar || []).forEach(g => (g.practice || []).forEach(p => {
      if (p.q && p.a) pool.push({ q: p.q, a: p.a, sub: p.note || "", ask: g.point || "", tag: lessonLabel(l) });
    }));
    (l.exercises || []).forEach(e => { if (e.q && e.a) pool.push({ q: e.q, a: e.a, sub: e.explain || "", ask: EX_ASK[e.type] || "", tag: lessonLabel(l) }); });
  });
  return pool;
}

function renderQuiz() {
  const root = document.getElementById("quiz");
  quizPool = buildQuizPool();
  if (!quizPool.length) { root.innerHTML = '<p class="empty">這些課還沒有可出題的資料。</p>'; return; }
  nextQuiz();
}

function nextQuiz() {
  const root = document.getElementById("quiz");
  quizCur = quizPool[Math.floor(Math.random() * quizPool.length)];
  root.innerHTML = `
    <div class="ex-item">
      ${quizCur.ask ? `<div class="quiz-ask">📝 考點：${quizCur.ask}</div>` : ""}
      <div class="quiz-q">${quizCur.q}<span class="tag">${quizCur.tag}</span></div>
      <input class="quiz-input" id="qin" placeholder="輸入日文答案後按 Enter…" autocomplete="off">
      <div class="quiz-ans" id="qans"></div>
      <div class="controls"><button class="btn-next" id="show">看答案</button></div>
    </div>`;
  const input = document.getElementById("qin");
  input.focus();
  const reveal = () => {
    const ok = input.value.trim() === quizCur.a.trim();
    document.getElementById("qans").innerHTML =
      `${ok ? '<span class="correct">✓ 正確！</span><br>' : ""}答案：<b>${quizCur.a}</b>` +
      (quizCur.sub ? `<br><span style="color:#777;font-size:14px">${quizCur.sub}</span>` : "");
    document.getElementById("show").textContent = "下一題";
    document.getElementById("show").onclick = nextQuiz;
  };
  input.onkeydown = e => { if (e.key === "Enter") reveal(); };
  document.getElementById("show").onclick = reveal;
}

// ---- 啟動 ----
if (!LESSONS.length) {
  document.querySelector("main").innerHTML =
    '<p class="empty">還沒有資料。請先執行 <code>python scripts/build.py</code> 生成 data.js。</p>';
} else {
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
