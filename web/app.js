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

// ---- 間隔複習 SRS：記得了→間隔逐次拉長；還不熟→打回今天 ----
const SRS_STEPS = [1, 3, 7, 14, 30, 60];        // 連續記得第 n 次後，隔幾天再問
function todayNum() { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.round(d.getTime() / 86400000); }
function srsOf(id) {                             // 相容舊資料（只有 score 的）
  const r = ST[id];
  if (!r) return { score: 0, streak: 0, due: 0, isNew: true };
  return {
    score: r.score || 0,
    streak: r.streak != null ? r.streak : Math.max(0, r.score || 0),
    due: r.due != null ? r.due : 0,
    isNew: false
  };
}
function srsInterval(streak) { return SRS_STEPS[Math.min(streak, SRS_STEPS.length - 1)]; }
function isDue(id) { const s = srsOf(id); return s.isNew || s.due <= todayNum(); }
function dueText(id) {
  const s = srsOf(id);
  if (s.isNew) return "還沒學過";
  const d = s.due - todayNum();
  return d <= 0 ? "今天要複習" : (d === 1 ? "明天再問" : `${d} 天後再問`);
}
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
  { theme: null, minimal: false, fontScale: 100, kanaMode: "line", quizLen: 20, cardLen: 20,
    repeats: 3, repeatGap: 0.8, gap: 4, rate: 0.9, volume: 1, voiceName: "", readShow: "all",
    radioMins: 20, radioRepeat: 2, radioGap: 1.5, radioZh: false, radioShowZh: false, radioScope: "article" },
  JSON.parse(localStorage.getItem(SET_KEY) || "{}"));
if (!settings.theme)
  settings.theme = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
function saveSettings() { localStorage.setItem(SET_KEY, JSON.stringify(settings)); }
function numSet(key, def) { const v = Number(settings[key]); return (isFinite(v) && v >= 0) ? v : def; }
function applyTheme() { document.body.classList.toggle("dark", settings.theme === "dark"); }
// ---- 漢字注音（ruby）：line=整句假名在下(預設) / ruby=漢字上方 / off=不顯示假名 ----
function kanaMode() { return ["line", "ruby", "off"].indexOf(settings.kanaMode) >= 0 ? settings.kanaMode : "line"; }
function applyKanaMode() {
  const m = kanaMode();
  document.body.classList.toggle("kana-ruby", m === "ruby");
  document.body.classList.toggle("kana-off", m === "off");
}
function jpRuby(s) {   // 把 {{漢字|假名}} 轉成 <ruby>；其餘照 escape
  return escHtml(s).replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, "<ruby>$1<rt>$2</rt></ruby>");
}
function jpHtml(item) {  // 依設定決定 jp 要不要帶注音（測驗頁一律不用此函式）
  if (!item) return "";
  return (kanaMode() === "ruby" && item._ruby) ? jpRuby(item._ruby) : escHtml(item.jp || "");
}
// 有實際標到注音才加 has-ruby：標不到的句子（如含數字）保留整句假名當後備，不會變成無讀音
function rubyCls(item) { return (kanaMode() === "ruby" && item && item._ruby) ? " has-ruby" : ""; }
applyTheme();
function applyMinimal() { document.body.classList.toggle("minimal", !!settings.minimal); }
applyMinimal();
function fontScaleVal() { const v = parseInt(settings.fontScale); return (isFinite(v) ? Math.max(70, Math.min(200, v)) : 100); }
function applyFontScale() { document.documentElement.style.setProperty("--fs", fontScaleVal() / 100); }
applyFontScale();
// 側邊欄收合（桌機）：狀態存 localStorage，按鈕在側欄右緣中間
// 手機預設收合選單（螢幕小，選好課後選單就不常用了）；使用者手動切換過就記住他的選擇
let sideCollapsed = (localStorage.getItem("jp_sidecollapsed") === null)
  ? window.innerWidth < 900
  : localStorage.getItem("jp_sidecollapsed") === "1";
function applySideCollapsed() {
  document.body.classList.toggle("side-collapsed", sideCollapsed);
  const b = document.getElementById("side-toggle");
  if (b) b.title = sideCollapsed ? "展開選單" : "收起選單";   // 箭頭/文字交給 CSS ::before
}
function initSideToggle() {
  const b = document.getElementById("side-toggle");
  if (!b) return;
  b.onclick = () => {
    sideCollapsed = !sideCollapsed;
    localStorage.setItem("jp_sidecollapsed", sideCollapsed ? "1" : "0");
    applySideCollapsed();
  };
  applySideCollapsed();
}

function syncSettingsUI() {
  const d = document.getElementById("set-dark"); if (d) d.checked = settings.theme === "dark";
  const mi = document.getElementById("set-minimal"); if (mi) mi.checked = !!settings.minimal;
  const fr = document.getElementById("set-fontsize-range"); if (fr) fr.value = fontScaleVal();
  const fn = document.getElementById("set-fontsize-num"); if (fn) fn.value = fontScaleVal();
  const km = document.getElementById("set-kana"); if (km) km.value = kanaMode();
  const ql = document.getElementById("set-quizlen"); if (ql) ql.value = String(quizLen());
  const cl = document.getElementById("set-cardlen"); if (cl) cl.value = String(cardLen());
  const r = document.getElementById("set-repeats"); if (r) r.value = numSet("repeats", 3);
  const rg = document.getElementById("set-repeat-gap"); if (rg) rg.value = numSet("repeatGap", 0.8);
  const g = document.getElementById("set-gap"); if (g) g.value = numSet("gap", 4);
  const rt = document.getElementById("set-rate"); if (rt) rt.value = numSet("rate", 0.9);
  const vol = document.getElementById("set-volume"); if (vol) vol.value = Math.round(numSet("volume", 1) * 100);
  fillVoiceSelect();
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
  const kana = document.getElementById("set-kana");
  if (kana) kana.onchange = () => { settings.kanaMode = kana.value; saveSettings(); applyKanaMode(); renderActive(); };
  const qlen = document.getElementById("set-quizlen");
  if (qlen) qlen.onchange = () => { settings.quizLen = parseInt(qlen.value) || 0; saveSettings(); quizKey = null; renderActive(); };
  const clen = document.getElementById("set-cardlen");
  if (clen) clen.onchange = () => { settings.cardLen = parseInt(clen.value) || 0; saveSettings(); renderActive(); };
  const setFont = (v) => {
    settings.fontScale = Math.max(70, Math.min(200, parseInt(v) || 100));
    saveSettings(); applyFontScale();
    const fr = document.getElementById("set-fontsize-range"); if (fr) fr.value = settings.fontScale;
    const fn = document.getElementById("set-fontsize-num"); if (fn) fn.value = settings.fontScale;
  };
  const frange = document.getElementById("set-fontsize-range");
  if (frange) frange.oninput = () => setFont(frange.value);
  const fnum = document.getElementById("set-fontsize-num");
  if (fnum) fnum.onchange = () => setFont(fnum.value);
  const minimal = document.getElementById("set-minimal");
  if (minimal) minimal.onchange = () => {
    settings.minimal = minimal.checked; saveSettings(); applyMinimal();
    if (settings.minimal) {
      stopRadio(); stopReader();                          // 廣播/文章朗讀屬隱藏功能，一併停止
      const cur = LESSONS.find(l => lessonKey(l) === selectedKey);
      if (!cur || MINIMAL_GROUPS.indexOf(cur._group || "文法") < 0) {
        const bun = LESSONS.filter(l => (l._group || "文法") === "文法");
        if (bun.length) selectedKey = lessonKey(bun[bun.length - 1]);   // 跳回最新文法課
        activeGroup = "文法";
      }
    }
    renderPicker(); renderActive();
  };
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
  const voiceSel = document.getElementById("set-voice");
  if (voiceSel) voiceSel.onchange = () => {
    settings.voiceName = voiceSel.value; saveSettings();
    speak("こんにちは");                                  // 試聽一下選的聲音
  };
})();

// ---- 📋 工作日誌（內容更新紀錄，資料來自 data/changelog.yaml）----
(function initLog() {
  const panel = document.getElementById("log-panel");
  const open = document.getElementById("log-open");
  const close = document.getElementById("log-close");
  if (!panel || !open) return;
  open.onclick = () => {
    const log = window.CHANGELOG || [];
    document.getElementById("log-body").innerHTML = log.length
      ? log.map(e => `<div class="log-entry"><div class="log-date">${e.date || ""}</div>
          <ul>${(e.items || []).map(i => `<li>${i}</li>`).join("")}</ul></div>`).join("")
      : '<p class="empty">還沒有日誌。</p>';
    document.getElementById("settings-panel").classList.add("hidden");
    panel.classList.remove("hidden");
  };
  if (close) close.onclick = () => panel.classList.add("hidden");
  panel.onclick = e => { if (e.target === panel) panel.classList.add("hidden"); };
})();

// 廣播在「📖 文章」群組裡（選 🎧 項目→主畫面顯示播放器）。播放中可切到別課，背景續播。
function syncRadioBtn() {
  document.querySelectorAll('#lesson-checks label').forEach(el => {
    if (el.textContent.indexOf("廣播") >= 0) el.classList.toggle("playing", !!radio.on);
  });
}

// ---- 語音播放（日語 TTS）----
// 手機上 getVoices() 是非同步載入：要監聽 voiceschanged，否則拿到空清單→落回粗糙的預設引擎
let VOICES = [];
function refreshVoices() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices() || [];
  if (vs.length) VOICES = vs;
  fillVoiceSelect();
}
if (window.speechSynthesis) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
  setTimeout(refreshVoices, 800);                       // 部分手機瀏覽器不觸發事件，補抓一次
}
function jaVoices() {
  if (window.speechSynthesis) {                          // 每次都拿最新：手機清單常在首次互動後才補齊
    const vs = speechSynthesis.getVoices() || [];
    if (vs.length) VOICES = vs;
  }
  return VOICES.filter(v => (v.lang || "").toLowerCase().startsWith("ja"));
}
// 裝置沒有日語語音 → 預設引擎會把假名一字一字唸。提示使用者安裝（只提示一次）
let warnedNoJa = false;
function warnNoJaVoice() {
  if (warnedNoJa) return; warnedNoJa = true;
  const d = document.createElement("div");
  d.className = "tts-warn";
  d.innerHTML = `⚠️ 此裝置沒有「日語語音」，目前用系統預設聲音唸（會一字一字唸）。<br>
    <b>Android</b>：設定 → 一般/系統管理 → 語言 → 文字轉語音(TTS) → Google 語音服務 → 安裝「日文」語音資料，裝完重開瀏覽器。<br>
    <b>iPhone</b>：設定 → 輔助使用 → 朗讀內容 → 聲音 → 日文 → 下載一個聲音。
    <button id="tts-warn-close">知道了</button>`;
  document.body.appendChild(d);
  document.getElementById("tts-warn-close").onclick = () => d.remove();
}
function applyJaVoice(u) {
  const v = jaVoice();
  if (v) u.voice = v; else warnNoJaVoice();
}
function voiceScore(v) {                                 // 品質排序：挑最自然的日語聲音
  const n = (v.name || "").toLowerCase();
  let s = 0;
  if (n.includes("siri")) s += 110;                              // iOS Siri 聲音（若系統有開放）最優先
  if (n.includes("google")) s += 100;                            // Android/Chrome 的 Google 日本語
  if (n.includes("natural") || n.includes("online")) s += 90;    // Edge 的 Natural 系列
  if (/kyoko|otoya|o-ren|hattori/.test(n)) s += 85;              // iOS/macOS 高品質
  if (/enhanced|premium|拡張|進階/.test(n)) s += 15;             // 進階版（如 Kyoko Enhanced）再加分
  if (/nanami|keita|ayumi|haruka|ichiro|sayaka/.test(n)) s += 60;// Microsoft 系列
  if (/espeak|eloquence|compact|android speech/.test(n)) s -= 80;// 粗糙引擎排到最後
  if (!v.localService) s += 5;                                   // 雲端聲音通常較自然
  return s;
}
function jaVoice() {
  const vs = jaVoices();
  if (!vs.length) return null;
  if (settings.voiceName) {                              // 使用者在設定指定的優先
    const pick = vs.find(v => v.name === settings.voiceName);
    if (pick) return pick;
  }
  return vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}
function fillVoiceSelect() {                             // 設定面板的「日語語音」下拉
  const sel = document.getElementById("set-voice");
  if (!sel) return;
  const vs = jaVoices();
  const cur = settings.voiceName || "";
  sel.innerHTML = '<option value="">自動（挑最佳）</option>' +
    vs.map(v => `<option value="${escAttr(v.name)}"${v.name === cur ? " selected" : ""}>${escAttr(v.name)}${v.localService ? "" : " ☁"}</option>`).join("");
  if (!vs.length) sel.innerHTML = '<option value="">（此裝置未提供日語語音）</option>';
  const now = document.getElementById("voice-now");
  if (now) {
    const v = jaVoice();
    now.textContent = v ? ("目前使用：" + v.name) : "⚠️ 沒有日語語音→會一字一字唸。請在手機安裝日文 TTS 語音資料後重開瀏覽器。";
    now.classList.toggle("warn", !v);
  }
}
function speak(text) {
  if (!window.speechSynthesis || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP"; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
  applyJaVoice(u);
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
  t = t.replace(/[…‥※＊*#~〜～≒=＝＋+×✕✖%％°★☆♪◎○●△▲□■◆◇＜＞<>≦≧≠÷±§¶’”“‘•‧]/g, " "); // 數學/標記符號直接去掉
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
// 極簡模式：只顯示 文法課/會話課（基礎文法、文章與廣播隱藏）
const MINIMAL_GROUPS = ["文法", "会話"];
function visibleGroups() { return settings.minimal ? GROUPS.filter(([g]) => MINIMAL_GROUPS.indexOf(g) >= 0) : GROUPS; }

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
// 子分類收合：短文章／長文章 預設收起；文法課預設只展開「最新一課所在的冊」
let collapsedSubs = (() => {
  const stored = localStorage.getItem("jp_subcollapsed2");
  if (stored) return new Set(JSON.parse(stored));
  const s = new Set(["文章:短文章", "文章:長文章", "会話:0"]);
  const bun = LESSONS.filter(l => (l._group || "文法") === "文法");
  if (bun.length) {
    const latestBook = bun[bun.length - 1].book || 0;
    [...new Set(bun.map(l => l.book || 0))].forEach(bk => { if (bk !== latestBook) s.add("文法:" + bk); });
  }
  return s;
})();
function saveSubs() { localStorage.setItem("jp_subcollapsed2", JSON.stringify([...collapsedSubs])); }

function pickerLabel(l) {   // 文章選單只顯示日文標題（去掉中文括號），讓藥丸更短
  if (l._article) { const t = (l._label || "").replace(/（[^）]*）/g, "").trim(); return t || l._label; }
  return lessonLabel(l);
}
// 該課單字熟練度（熟練＝SRS 分數 ≥3）；沒有單字的課回傳 null
function lessonProgress(l) {
  const vs = l.vocab || [];
  if (!vs.length) return null;
  let known = 0;
  vs.forEach((v, i) => { if ((ST[lessonKey(l) + ":v" + i]?.score || 0) >= 3) known++; });
  return { known, total: vs.length, pct: Math.round(known / vs.length * 100) };
}

function appendLabel(box, l) {
  const key = lessonKey(l);
  const label = document.createElement("label");
  label.className = (key === selectedKey ? "on" : "") + (l._radio && radio.on ? " playing" : "");
  label.textContent = pickerLabel(l);
  const pr = lessonProgress(l);          // 進度小圓點：空心=沒碰過、半滿、實心=已熟
  if (pr) {
    const dot = document.createElement("span");
    dot.className = "prog " + (pr.pct >= 80 ? "p3" : pr.pct >= 40 ? "p2" : pr.pct > 0 ? "p1" : "p0");
    dot.title = `單字熟練 ${pr.known}/${pr.total}（${pr.pct}%）`;
    label.appendChild(dot);
  }
  label.onclick = () => {
    if (key === selectedKey) return;
    selectedKey = key;
    cancelAuto();                     // 換課時停止自動播放
    renderPicker();
    renderActive();
  };
  box.appendChild(label);
}

function classDate(d) {   // "2026-07-17" → "7/17 上課"
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${+m[2]}/${+m[3]} 上課` : String(d || "");
}

let activeGroup = null;   // 目前選的群組（文法/会話/基礎/文章）
function subHeader(box, text) {
  const sh = document.createElement("span");
  sh.className = "pick-subgroup";
  sh.textContent = text;
  box.appendChild(sh);
}
function renderGroupBody(box, g, items, forceOpen) {
  // 可收合的子分類
  const sub = (key, text, arr) => {
    if (!arr.length) return;
    const collapsed = !forceOpen && collapsedSubs.has(key);
    const h = document.createElement("button");
    h.className = "pick-subgroup sub-toggle" + (collapsed ? " collapsed" : "");
    h.innerHTML = `<span class="caret">${collapsed ? "▶" : "▼"}</span> ${text}`;
    h.onclick = () => {
      if (collapsedSubs.has(key)) collapsedSubs.delete(key); else collapsedSubs.add(key);
      saveSubs(); renderPicker();
    };
    box.appendChild(h);
    if (!collapsed) arr.forEach(l => appendLabel(box, l));
  };
  if (g === "文法") {                       // 依冊分組（預設展開）
    const books = [...new Set(items.map(l => l.book || 0))].sort((a, b) => a - b);
    books.forEach(bk => {
      const arr = items.filter(l => (l.book || 0) === bk);
      if (books.length > 1) sub("文法:" + bk, bk ? `第${bk}冊` : "其他", arr);
      else arr.forEach(l => appendLabel(box, l));
    });
  } else if (g === "会話") {   // 先依課本課別（第N課），再依上課日期，剩下的收在「未分類」
    const byLesson = [...new Set(items.filter(l => l.lesson).map(l => l.lesson))].sort((a, b) => a - b);
    const byDate = [...new Set(items.filter(l => !l.lesson && l.date).map(l => l.date))].sort();
    const rest = items.filter(l => !l.lesson && !l.date);
    if (byLesson.length || byDate.length) {
      byLesson.forEach(ln => sub("会話:L" + ln, `第${ln}課`, items.filter(l => l.lesson === ln)));
      byDate.forEach(d => sub("会話:D" + d, "📅 " + classDate(d),
        items.filter(l => !l.lesson && l.date === d)));
      if (rest.length) sub("会話:0", "未分類", rest);
    } else {
      items.forEach(l => appendLabel(box, l));
    }
  } else if (g === "文章") {                 // 廣播在最前，短／長文章預設收合
    items.filter(l => l._radio).forEach(l => appendLabel(box, l));
    sub("文章:短文章", "短文章（" + items.filter(l => l._article && !isLongArticle(l._article)).length + "）",
      items.filter(l => l._article && !isLongArticle(l._article)));
    sub("文章:長文章", "長文章（" + items.filter(l => l._article && isLongArticle(l._article)).length + "）",
      items.filter(l => l._article && isLongArticle(l._article)));
  } else {
    items.forEach(l => appendLabel(box, l));
  }
}

function renderPicker() {
  const box = document.getElementById("lesson-checks");
  box.innerHTML = "";
  const q = pickerQuery.trim().toLowerCase();

  if (q) {                                   // 搜尋：跨群組列出所有符合（附群組小標）
    const list = document.createElement("div");
    list.className = "pick-list";
    let shown = 0;
    visibleGroups().forEach(([g, gname]) => {
      const items = LESSONS.filter(l => (l._group || "文法") === g && lessonMatches(l, q));
      if (!items.length) return;
      shown += items.length;
      subHeader(list, gname);
      renderGroupBody(list, g, items, true);
    });
    if (!shown) {
      const empty = document.createElement("span");
      empty.className = "pick-empty";
      empty.textContent = "找不到符合「" + pickerQuery.trim() + "」的主題";
      list.appendChild(empty);
    }
    box.appendChild(list);
    return;
  }

  // 一般：上方一排群組切換鈕，下方只顯示目前群組的項目（不再疊多層）
  const avail = visibleGroups().filter(([g]) => LESSONS.some(l => (l._group || "文法") === g));
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
  const list = document.createElement("div");
  list.className = "pick-list";
  renderGroupBody(list, activeGroup, LESSONS.filter(l => (l._group || "文法") === activeGroup));
  box.appendChild(list);
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
let cardScope = "due";              // due＝只出今天到期的 / all＝全部單字
let cardWrong = [], cardRight = 0;  // 本輪標「還不熟」的字、答對數
let vocabFilter = "all";            // 全部單字清單的篩選：all / weak

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
function cardLen() { const v = parseInt(settings.cardLen); return isFinite(v) && v > 0 ? v : 0; }  // 0＝全部
function buildDeck(pool) {
  const items = (pool || (cardScope === "due" ? vocabItems().filter(v => isDue(v._id)) : vocabItems())).slice();
  // 依熟練度排序：陌生(低分)優先，並做加權打散
  items.forEach(it => { it._w = srsOf(it._id).score + Math.random() * 0.5; });
  items.sort((a, b) => a._w - b._w);
  const n = cardLen();
  return (n && items.length > n) ? items.slice(0, n) : items;   // 只取最該複習的前 N 張
}

// ---- 自動隨機播放 ----
const autoPlay = { on: false, paused: false, deck: [], idx: 0, timer: null, seq: 0 };
function clearAutoTimers() {
  if (autoPlay.timer) { clearTimeout(autoPlay.timer); autoPlay.timer = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
function cancelAuto() { autoPlay.on = false; autoPlay.paused = false; autoPlay.seq++; clearAutoTimers(); }
function startAuto() {
  const items = vocabItems();
  if (!items.length) return;
  cancelAuto();
  autoPlay.deck = shuffle(items); autoPlay.idx = 0; autoPlay.on = true; autoPlay.paused = false;
  drawAuto();
}
function stopAuto() { cancelAuto(); renderCards(); }
function pauseAuto() { autoPlay.paused = true; autoPlay.seq++; clearAutoTimers(); drawAuto(); }   // 暫停（不前進）
function resumeAuto() { autoPlay.paused = false; drawAuto(); }                                    // 繼續（重聽目前字）
function nextAuto() {
  autoPlay.paused = false; autoPlay.seq++; clearAutoTimers();
  autoPlay.idx++;
  if (autoPlay.idx >= autoPlay.deck.length) finishAuto(); else drawAuto();
}
function prevAuto() {                       // 回上一個（同一輪洗牌順序，不重洗）
  if (autoPlay.idx <= 0) return;
  autoPlay.paused = false; autoPlay.seq++; clearAutoTimers();
  autoPlay.idx--;
  drawAuto();
}
function speakTimes(text, times, done) {            // 連續朗讀同一字 times 次
  if (!window.speechSynthesis || !text) { if (done) done(); return; }
  const mySeq = autoPlay.seq;
  speechSynthesis.cancel();
  let n = 0;
  const step = () => {
    if (autoPlay.seq !== mySeq || !autoPlay.on) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = settings.rate || 0.9; u.volume = numSet("volume", 1);
    applyJaVoice(u);
    const after = () => {
      if (autoPlay.seq !== mySeq || !autoPlay.on) return;
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
      <div class="jp">${jpHtml(c)} ${playBtn(c)}</div>
      <div class="kana">${c.kana || ""}</div>
      <div class="zh">${c.zh || ""}</div>
      ${c.pos ? `<div class="pos">${c.pos}</div>` : ""}
    </div>
    <div class="controls">
      <button class="btn-next" id="auto-prev"${autoPlay.idx === 0 ? " disabled" : ""}>← 上一個</button>
      ${autoPlay.paused
      ? `<button class="btn-good" id="auto-resume">▶ 繼續</button>`
      : `<button class="btn-next" id="auto-pause">⏸ 暫停</button>`}
      <button class="btn-next" id="auto-next">下一個 →</button>
      <button class="btn-bad" id="auto-stop">■ 停止</button>
    </div>
    <div class="progress">🔀 自動播放（隨機）　${autoPlay.idx + 1} / ${autoPlay.deck.length}　·　${c._lesson}${autoPlay.paused ? "　·　⏸ 已暫停" : ""}</div>`;
  const pb = root.querySelector(".play");
  if (pb) pb.onclick = e => { e.stopPropagation(); speak(pb.dataset.say); };
  document.getElementById("auto-stop").onclick = stopAuto;
  document.getElementById("auto-next").onclick = nextAuto;
  const prevBtn = document.getElementById("auto-prev");
  if (prevBtn) prevBtn.onclick = prevAuto;
  const pauseBtn = document.getElementById("auto-pause");
  if (pauseBtn) pauseBtn.onclick = pauseAuto;
  const resumeBtn = document.getElementById("auto-resume");
  if (resumeBtn) resumeBtn.onclick = resumeAuto;
  if (autoPlay.paused) return;                       // 暫停時不朗讀，可按🔊重聽或按繼續
  const seq = ++autoPlay.seq;
  speakTimes(sayText(c), settings.repeats, () => {
    if (autoPlay.seq !== seq || !autoPlay.on) return;
    autoPlay.timer = setTimeout(() => {
      if (autoPlay.seq !== seq || !autoPlay.on) return;
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

function renderCards(pool) {
  const root = document.getElementById("cards");
  const all = vocabItems();
  if (!all.length) { root.innerHTML = '<p class="empty">這些課還沒有單字資料。</p>'; return; }
  if (cardsView === "list") { renderVocabList(); return; }
  if (!pool && cardScope === "due" && !all.some(v => isDue(v._id))) {   // 今天沒有到期的
    const next = Math.min(...all.map(v => srsOf(v._id).due)) - todayNum();
    root.innerHTML = `
      <div class="quiz-result">
        <div class="qr-score good">✓</div>
        <div class="qr-sub">今天這一課沒有要複習的單字了！<br>最近的下次複習是 <b>${next <= 1 ? "明天" : next + " 天後"}</b>。</div>
      </div>
      <div class="controls">
        <button class="btn-next" id="card-all">📚 照樣複習全部單字</button>
        <button class="btn-next" id="card-list2">📋 全部單字＋例句</button>
      </div>`;
    document.getElementById("card-all").onclick = () => { cardScope = "all"; renderCards(); };
    document.getElementById("card-list2").onclick = () => { cardsView = "list"; renderCards(); };
    return;
  }
  deck = buildDeck(pool);
  if (!deck.length) { root.innerHTML = '<p class="empty">沒有可複習的單字。</p>'; return; }
  cardWrong = []; cardRight = 0;
  cardIdx = 0; flipped = false;
  drawCard();
}

function starBar(score) {           // 熟練度 ★★★☆☆
  const n = Math.max(0, Math.min(5, score));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ---- 全部單字清單（含例句）----
function renderVocabList() {
  const root = document.getElementById("cards");
  const all = vocabItems();
  const items = vocabFilter === "weak" ? all.filter(v => srsOf(v._id).score < 3) : all;
  const weakCnt = all.filter(v => srsOf(v._id).score < 3).length;
  const fb = (k, t) => `<button class="link${vocabFilter === k ? " on" : ""}" data-vf="${k}">${t}</button>`;
  root.innerHTML = `
    <div class="auto-bar">
      <button class="link" id="view-card">🃏 卡片模式</button>
      <button class="link" id="list-auto">🔀 自動播放</button>
      ${fb("all", `全部 ${all.length}`)}${fb("weak", `只看不熟 ${weakCnt}`)}
      <span class="vcount">共 ${items.length} 個單字</span>
    </div>
    ${items.length ? "" : '<p class="empty">這個篩選下沒有單字。</p>'}
    <div class="vocab-list">${items.map(v => `
      <div class="vrow">
        <div class="vsrs"><span class="stars" title="熟練度 ${srsOf(v._id).score}/5">${starBar(srsOf(v._id).score)}</span>
          <span class="vdue">${dueText(v._id)}</span>
          ${srsOf(v._id).isNew ? "" : `<button class="link vreset" data-id="${escAttr(v._id)}" title="把這個字的熟練度歸零">↺</button>`}</div>
        <div class="vhead${rubyCls(v)}"><span class="vjp">${jpHtml(v)}</span> ${playBtn(v)}
          <span class="vkana">${v.kana || ""}</span>${v.pos ? `<span class="vpos">${v.pos}</span>` : ""}${v._vgroup ? `<span class="vgrp">${v._vgroup}類</span>` : ""}</div>
        <div class="vzh">${v.zh || ""}${v.note ? `　<span class="vnote">${v.note}</span>` : ""}</div>
        ${v.ex ? `<div class="vex${rubyCls(v.ex)}"><span class="vex-jp">${jpHtml(v.ex)} ${playBtn(v.ex)}</span>
          <span class="vex-kana">${v.ex.kana || ""}</span><span class="vex-zh">${v.ex.zh || ""}</span></div>` : ""}
      </div>`).join("")}</div>`;
  document.getElementById("view-card").onclick = () => { cardsView = "card"; renderCards(); };
  document.getElementById("list-auto").onclick = startAuto;
  root.querySelectorAll(".play").forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); });
  root.querySelectorAll("[data-vf]").forEach(b => b.onclick = () => { vocabFilter = b.dataset.vf; renderVocabList(); });
  root.querySelectorAll(".vreset").forEach(b => b.onclick = () => {
    delete ST[b.dataset.id]; save(); renderVocabList(); renderPicker();
  });
}

function drawCard() {
  const root = document.getElementById("cards");
  const c = deck[cardIdx];
  const s = srsOf(c._id);
  const dueCnt = vocabItems().filter(v => isDue(v._id)).length;
  root.innerHTML = `
    <div class="auto-bar"><button class="link" id="start-auto">🔀 自動播放（隨機）</button>
      <button class="link" id="view-list">📋 全部單字＋例句</button>
      <button class="link" id="scope-toggle">${cardScope === "due" ? `📅 今天到期（${dueCnt}）` : "📚 全部單字"}</button>
      <span class="vcount">✓ ${cardRight}　↻ ${cardWrong.length}</span></div>
    <div class="flashcard${flipped ? rubyCls(c) : ""}" id="fc">
      <div class="jp">${flipped ? jpHtml(c) : escHtml(c.jp || "")} ${playBtn(c)}</div>
      ${flipped ? `
        <div class="kana">${c.kana || ""}</div>
        <div class="zh">${c.zh || ""}</div>
        ${c.pos ? `<div class="pos">${c.pos}</div>` : ""}
        ${c._vgroup ? `<div class="pos"><span class="vgrp">${c._vgroup}類動詞</span></div>` : ""}
        ${c.note ? `<div class="pos">${c.note}</div>` : ""}
        ${(c.source || c.key) ? `<div class="pos">${badges(c)}</div>` : ""}
        <div class="srs-info">熟練度 ${starBar(s.score)} ${s.score}/5　·　${dueText(c._id)}
          <br><span class="srs-hint">記得了 → ${srsInterval(s.streak)} 天後再問　·　還不熟 → 今天再出現</span></div>
      ` : `<div class="hint">點一下看答案 · ${c._lesson} · 熟練度 ${s.score}</div>`}
    </div>
    <div class="controls">
      <button class="btn-next" id="prev"${cardIdx === 0 ? " disabled" : ""}>← 上一個</button>
      ${flipped
      ? `<button class="btn-bad" id="bad">還不熟</button>
         <button class="btn-good" id="good">記得了</button>
         <button class="btn-next" id="next">下一個 →</button>`
      : `<button class="btn-next" id="flip">翻面</button>
         <button class="btn-next" id="next">下一個 →</button>`}
    </div>
    <div class="progress">${cardIdx + 1} / ${deck.length}　·　「還不熟／記得了」可按可不按，只想瀏覽就按「上一個／下一個」</div>`;

  document.getElementById("fc").onclick = () => { flipped = !flipped; drawCard(); };
  document.getElementById("start-auto").onclick = startAuto;
  document.getElementById("scope-toggle").onclick = () => {
    cardScope = cardScope === "due" ? "all" : "due"; renderCards();
  };
  document.getElementById("view-list").onclick = () => { cardsView = "list"; renderCards(); };
  document.getElementById("next").onclick = nextCard;
  document.getElementById("prev").onclick = prevCard;
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
  if (cardIdx >= deck.length) finishCardRound();
  else drawCard();
}

// 本輪單字卡跑完：顯示整課熟練度，可續下一批
function finishCardRound() {
  const root = document.getElementById("cards");
  const all = vocabItems();
  const known = all.filter(v => srsOf(v._id).score >= 3).length;
  const pct = all.length ? Math.round(known / all.length * 100) : 0;
  const wrongItems = deck.filter(v => cardWrong.indexOf(v._id) >= 0);
  const stillDue = all.filter(v => isDue(v._id)).length;
  root.innerHTML = `
    <div class="quiz-result">
      <div class="qr-score ${pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad"}">${pct}<span>%</span></div>
      <div class="qr-sub">本輪 ${deck.length} 張：記得 <b>${deck.length - wrongItems.length}</b>、不熟 <b>${wrongItems.length}</b>
        <br>整課熟練 <b>${known}</b> / ${all.length} 個單字　·　今天還有 <b>${stillDue}</b> 個待複習</div>
    </div>
    ${wrongItems.length ? `<div class="block"><span class="blabel">本輪不熟的字</span>
      <div class="vocab-list">${wrongItems.map(v => `<div class="vrow">
        <div class="vhead"><span class="vjp">${escHtml(v.jp || "")}</span> <span class="vkana">${v.kana || ""}</span></div>
        <div class="vzh">${v.zh || ""}</div></div>`).join("")}</div></div>` : ""}
    <div class="controls">
      ${wrongItems.length ? `<button class="btn-bad" id="card-redo">↻ 只重看不熟的 ${wrongItems.length} 張</button>` : ""}
      ${stillDue ? `<button class="btn-good" id="card-next-batch">▶ 繼續下一批</button>` : ""}
      <button class="btn-next" id="card-restart">🔀 再看一輪</button>
      <button class="btn-next" id="card-list">📋 全部單字＋例句</button>
    </div>`;
  const rd = document.getElementById("card-redo");
  if (rd) rd.onclick = () => renderCards(wrongItems);
  const nb = document.getElementById("card-next-batch");
  if (nb) nb.onclick = () => renderCards();
  document.getElementById("card-restart").onclick = () => renderCards(deck.slice());
  document.getElementById("card-list").onclick = () => { cardsView = "list"; renderCards(); };
}

function prevCard() {                       // 回上一張（不重洗牌、不評熟練度）
  if (cardIdx <= 0) return;
  cardIdx--; flipped = false;
  drawCard();
}

function grade(c, delta) {
  const s = srsOf(c._id), t = todayNum();
  const score = Math.max(-3, Math.min(5, s.score + delta));
  const up = delta > 0;
  const days = up ? srsInterval(s.streak) : 0;
  ST[c._id] = { score, streak: up ? s.streak + 1 : 0, due: up ? t + days : t };
  save();
  if (!up) { if (cardWrong.indexOf(c._id) < 0) cardWrong.push(c._id); }
  else { const i = cardWrong.indexOf(c._id); if (i >= 0) cardWrong.splice(i, 1); }
  cardRight = deck.slice(0, cardIdx + 1).filter(x => cardWrong.indexOf(x._id) < 0).length;
  srsToast(up, s.score, score, days);
  cardIdx++; flipped = false;
  if (cardIdx >= deck.length) { finishCardRound(); } else { drawCard(); }
}

// 評分後的即時回饋（不擋畫面，1.6 秒後自動淡出）
function srsToast(up, oldScore, newScore, days) {
  let el = document.getElementById("srs-toast");
  if (!el) { el = document.createElement("div"); el.id = "srs-toast"; document.body.appendChild(el); }
  el.className = "srs-toast show " + (up ? "good" : "bad");
  el.innerHTML = `${up ? "✓ 記得了" : "↻ 還不熟"}　熟練度 ${oldScore} → <b>${newScore}</b>`
    + (days ? `　·　${days} 天後再問` : "　·　今天會再出現");
  clearTimeout(srsToast._t);
  srsToast._t = setTimeout(() => { el.className = "srs-toast"; }, 1600);
}

// ---- 圖解表格（cell 支援 [x] 標色變化處、{{漢字|假名}} ruby 注音）----
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cellHtml(s) {
  let t = escHtml(s);
  // 注音：統一由設定「假名顯示方式」控制；off＝整個 App 都不顯示假名
  t = (kanaMode() === "off")
    ? t.replace(/\{\{([^|{}]+)\|[^{}]+\}\}/g, "$1")
    : t.replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, "<ruby>$1<rt>$2</rt></ruby>");
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
    <div class="gtable-wrap"><table class="gtable">${cap}${head}${body}</table></div>
    <div class="gtable-hint">🔊 點表格的字即可發音</div></div>`;
}

// 表格格子的朗讀文字：ruby 取漢字本體（TTS 會唸對），去掉括號附註
function cellSayText(td) {
  const c = td.cloneNode(true);
  c.querySelectorAll("rt").forEach(r => r.remove());
  return stripSymbols(c.textContent);
}

// ---- 文法（講義版面：接続 / 説明 / 圖解 / 例 / 練習）----
// 文法點過多時預設收合，點標題展開（狀態記在本次工作階段，切分頁不會跑掉）
const gramOpen = new Set();
let gramInit = new Set();          // 已套過預設值的課，避免每次 render 都重設
function gramKey(l, gi) { return lessonKey(l) + "#" + gi; }
const COLLAPSE_FROM = 4;           // 文法點 ≥ 這個數量就預設收合

function renderGrammar() {
  const root = document.getElementById("grammar");
  const ls = activeLessons().filter(l => (l.grammar || []).length);
  if (!ls.length) { root.innerHTML = '<p class="empty">這些課還沒有文法資料。</p>'; return; }
  let html = "";
  ls.forEach(l => {
    const pts = l.grammar || [];
    const k = lessonKey(l);
    if (!gramInit.has(k)) {          // 第一次進這一課：決定預設展開或收合
      gramInit.add(k);
      if (pts.length < COLLAPSE_FROM) pts.forEach((_, gi) => gramOpen.add(gramKey(l, gi)));
    }
    const openCnt = pts.filter((_, gi) => gramOpen.has(gramKey(l, gi))).length;
    html += `<h2 class="lesson-h">${lessonLabel(l)}　${l.title || ""}</h2>`;
    const gidOf = gi => `g_${lessonKey(l)}_${gi}`;
    if (pts.length >= COLLAPSE_FROM) {     // 文法點多時：小目錄可跳轉 ＋ 全部展開/收合
      html += `<div class="gram-toc">${pts.map((g, gi) =>
        `<button class="toc-chip" data-go="${gidOf(gi)}" data-gi="${gi}">${(g.point || "").replace(/^🔖\s*/, "")}</button>`).join("")}
        <button class="toc-chip toc-all" data-all="${openCnt >= pts.length ? "close" : "open"}" data-lk="${k}">${openCnt >= pts.length ? "▲ 全部收合" : "▼ 全部展開"}</button></div>`;
    }
    pts.forEach((g, gi) => {
      const on = gramOpen.has(gramKey(l, gi));
      html += `<div class="gram-item${on ? "" : " folded"}" id="${gidOf(gi)}">
        <h3 class="gram-h" data-gk="${gramKey(l, gi)}"><span class="caret">${on ? "▼" : "▶"}</span> ${g.point || ""}${badges(g)}</h3>
        <div class="gram-body">`;
      if (g.setsuzoku && g.setsuzoku.length)
        html += `<div class="block"><span class="blabel">接続</span><ul class="setsuzoku">${g.setsuzoku.map(s => `<li>${s}</li>`).join("")}</ul></div>`;
      if (g.explain)
        html += `<div class="block"><span class="blabel">説明</span><div class="explain">${mdParagraphs(g.explain)}</div></div>`;
      if (g.table) html += tableHtml(g.table);
      if (g.examples && g.examples.length)
        html += `<div class="block"><span class="blabel">例</span>${g.examples.map(ex => `
          <div class="example${rubyCls(ex)}"><div class="jp">${jpHtml(ex)} ${playBtn(ex)}</div><div class="kana">${ex.kana || ""}</div><div class="zh">${ex.zh || ""}</div></div>`).join("")}</div>`;
      if (g.practice && g.practice.length) {
        const pid = `pr_${lessonKey(l)}_${gi}`;
        html += `<div class="block"><span class="blabel">練習</span>${g.practice_note ? `<span class="pnote">${g.practice_note}</span>` : ""} <button class="link toggle-ans" data-t="${pid}">顯示/隱藏答案</button>
          <ol class="practice" id="${pid}">${g.practice.map(p => `
            <li><span class="pq">${p.q || ""}</span> <span class="ans">${p.a || ""}</span>${p.note ? `<span class="ans-note">（${p.note}）</span>` : ""}</li>`).join("")}</ol></div>`;
      }
      html += `</div></div>`;      // /gram-body /gram-item
    });
  });
  root.innerHTML = html;
  // 文法點展開／收合
  root.querySelectorAll(".gram-h").forEach(h => h.onclick = () => {
    const gk = h.dataset.gk;
    if (gramOpen.has(gk)) gramOpen.delete(gk); else gramOpen.add(gk);
    const keep = h.getBoundingClientRect().top;
    renderGrammar();
    const again = document.querySelector(`.gram-h[data-gk="${CSS.escape(gk)}"]`);
    if (again) window.scrollBy(0, again.getBoundingClientRect().top - keep);
  });
  // 全部展開／收合
  root.querySelectorAll(".toc-all").forEach(b => b.onclick = () => {
    const l = activeLessons().find(x => lessonKey(x) === b.dataset.lk);
    if (!l) return;
    (l.grammar || []).forEach((_, gi) => {
      if (b.dataset.all === "open") gramOpen.add(gramKey(l, gi)); else gramOpen.delete(gramKey(l, gi));
    });
    renderGrammar();
  });
  // 整組顯示/隱藏
  root.querySelectorAll(".toggle-ans").forEach(b => b.onclick = () =>
    document.getElementById(b.dataset.t).classList.toggle("show-ans"));
  // 點單一題顯示該題答案
  root.querySelectorAll(".practice li").forEach(li => li.onclick = () => li.classList.toggle("revealed"));
  // 語音播放鈕
  root.querySelectorAll(".play").forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); });
  // 圖解表格：點格子發音
  root.querySelectorAll(".gtable td").forEach(td => td.onclick = () => {
    const t = cellSayText(td);
    if (t) speak(t);
  });
  // 小目錄跳轉（順便展開該文法點）
  root.querySelectorAll(".toc-chip[data-go]").forEach(b => b.onclick = () => {
    const id = b.dataset.go;
    const el0 = document.getElementById(id);
    if (el0 && el0.classList.contains("folded")) {
      const h = el0.querySelector(".gram-h");
      if (h) { gramOpen.add(h.dataset.gk); renderGrammar(); }
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ---- 測驗（單字中→日 + 練習題）----
let quizPool = [], quizOrder = [], quizIdx = 0, quizCur = null, quizView = "quiz", quizKey = null;
let quizWrong = [], quizAnswered = false;   // 本輪答錯的題號、本題是否已作答

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

function quizLen() { const v = parseInt(settings.quizLen); return isFinite(v) && v > 0 ? v : 0; }  // 0＝全部
function newQuizRound(fromIdx) {          // fromIdx：只重做這些題（錯題重做用）
  const all = fromIdx || quizPool.map((_, i) => i);
  const n = quizLen();
  quizOrder = shuffle(all);
  if (!fromIdx && n && quizOrder.length > n) quizOrder = quizOrder.slice(0, n);
  quizIdx = 0; quizWrong = [];
}

function renderQuiz() {
  const root = document.getElementById("quiz");
  quizPool = buildQuizPool();
  if (!quizPool.length) { root.innerHTML = '<p class="empty">這些課還沒有可出題的資料。</p>'; return; }
  const key = selectedKey + "#" + quizPool.length + "#" + quizLen();
  if (key !== quizKey) { quizKey = key; newQuizRound(); }
  if (quizView === "list") renderQuizList(); else drawQuiz();
}

function quizBar(extra) {
  return `<div class="auto-bar">
    <button class="link" id="quiz-list">📋 列出全部題庫</button>
    ${extra || ""}</div>`;
}

function drawQuiz() {
  const root = document.getElementById("quiz");
  if (quizIdx >= quizOrder.length) {              // ---- 本輪結束：成績單 ----
    const total = quizOrder.length, wrong = quizWrong.length, right = total - wrong;
    const pct = total ? Math.round(right / total * 100) : 0;
    root.innerHTML = quizBar(`<span class="vcount">題庫共 ${quizPool.length} 題</span>`) + `
      <div class="quiz-result">
        <div class="qr-score ${pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad"}">${pct}<span>%</span></div>
        <div class="qr-sub">本輪 ${total} 題，答對 <b>${right}</b> 題、答錯 <b>${wrong}</b> 題</div>
      </div>
      ${wrong ? `<div class="block"><span class="blabel">錯題</span>
        <ol class="practice show-ans">${quizWrong.map(i => {
          const c = quizPool[i];
          return `<li><span class="pq">${c.q}</span> <span class="ans">${c.a}</span>${c.sub ? `<span class="ans-note">（${c.sub}）</span>` : ""}</li>`;
        }).join("")}</ol></div>` : `<p class="empty">🎉 全部答對！</p>`}
      <div class="controls">
        ${wrong ? `<button class="btn-bad" id="quiz-wrong">↻ 只重做錯的 ${wrong} 題</button>` : ""}
        <button class="btn-good" id="quiz-again">🔀 再來一輪</button>
      </div>`;
    document.getElementById("quiz-again").onclick = () => { newQuizRound(); drawQuiz(); };
    const wb = document.getElementById("quiz-wrong");
    if (wb) wb.onclick = () => { newQuizRound(quizWrong.slice()); drawQuiz(); };
    document.getElementById("quiz-list").onclick = () => { quizView = "list"; renderQuiz(); };
    return;
  }
  quizAnswered = false;
  quizCur = quizPool[quizOrder[quizIdx]];
  root.innerHTML = quizBar(`<span class="vcount">第 ${quizIdx + 1} / ${quizOrder.length} 題${quizWrong.length ? `　·　✗${quizWrong.length}` : ""}</span>`) + `
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
    if (!quizAnswered) {                       // 只計一次（避免重複按「看答案」）
      quizAnswered = true;
      if (!ok) quizWrong.push(quizOrder[quizIdx]);
    }
    document.getElementById("qans").innerHTML =
      `${ok ? '<span class="correct">✓ 正確！</span><br>' : '<span class="wrong">✗ 再看一次</span><br>'}答案：<b>${quizCur.a}</b>` +
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
  applyJaVoice(u);
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
      ${(a.body || []).map((s, i) => `<p class="rsent${rubyCls(s)}" id="rs${i}" data-i="${i}">
        <span class="rs-jp">${jpHtml(s)}</span>
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
    if (p.lang.indexOf("ja") === 0) applyJaVoice(u);
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
    <div class="rn-zh">${(settings.radioShowZh || settings.radioZh) ? (it.zh || "") : ""}</div>`;
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
      <label class="set-row"><span>同時顯示中文翻譯</span><input type="checkbox" id="radio-showzh" ${settings.radioShowZh ? "checked" : ""}></label>
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
  document.getElementById("radio-showzh").onchange = e => { settings.radioShowZh = e.target.checked; saveSettings(); if (radio.now) drawRadioNow(radio.now); };
  document.getElementById("radio-zh").onchange = e => { settings.radioZh = e.target.checked; saveSettings(); if (radio.now) drawRadioNow(radio.now); };
  document.getElementById("radio-toggle").onclick = () => { if (radio.on) { stopRadio(); renderRadio(); } else startRadio(); };
}

// ---- 啟動 ----
if (!LESSONS.length) {
  document.querySelector("main").innerHTML =
    '<p class="empty">還沒有資料。請先執行 <code>python scripts/build.py</code> 生成 data.js。</p>';
} else {
  initSearch();
  initSideToggle();
  applyKanaMode();
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
