# CLAUDE.md — 接手須知（給後續 AI agent）

這是 **jp-learn 日文複習專案** 的交接文件。接手前先讀完本檔＋ `README.md`、`SCHEMA.md`。
用途：把「來學日本語」課本／講義／板書照片 → 結構化 YAML → 自動生成複習網頁(PWA)＋Anki 牌組，逐課持續擴充。
**一律用繁體中文回覆使用者。**

---

## ⭐ 工作日誌規則（data/changelog.yaml）— 重要

設定面板「📋 工作日誌」顯示的內容，來源是 `data/changelog.yaml`，build 後變成 `window.CHANGELOG`。

維護規則（務必遵守）：
1. **日期＝該批內容/功能「實際 commit 的日期」**（用 `git log --date=format:'%Y-%m-%d'` 對齊），不要用「今天」或憑印象寫。
2. **只寫「內容更新」與「功能更新」**給使用者看。過濾掉開發雜項：部署觸發、Initial commit、README/SCHEMA 更新、版本雜湊戳印、lint/build 內部工具等不要寫。
3. **新的放最上面**；同一天的多筆併在同一個 `{date, items:[...]}` 區塊。
4. 條目用使用者看得懂的話、可加 emoji 前綴（📘課程／💬會話／📚基礎／🖼圖解／🔊語音／🃏單字卡／📝測驗／🛠修正／🗂功能）。
5. 格式：`- {date: "YYYY-MM-DD", items: ["...", "..."]}`。
6. 若日期跑掉或太雜，可整份重寫（曾於 2026-06-29 依 commit 時間全面重寫過一次）。

---

## 🔒 隱私與 git 鐵則

- **`raw/` 整個資料夾已 gitignore，照片「絕不」上傳 GitHub**（板書拍到同學的臉，避免肖像外流）。照片只留本機備份。提交前用 `git status` 確認沒有 `raw/` 檔被加入。
- 提交者 email 固定為 `jp-learn <jp-learn@users.noreply.github.com>`（使用者 gmail 不可進公開歷史）。
- commit 訊息結尾加 `Co-Authored-By: Claude ...`。
- 線上站：<https://jacky0788.github.io/jp-learn/>（repo `jacky0788/jp-learn`，public）。push main → GitHub Actions 自動 build＋部署，PWA 自動更新。

---

## 🔁 標準流程（每次改完內容/程式）

1. 改 `data/**/*.yaml` 或 `web/*`。
2. **跑 `python scripts/build.py`**（生成 `web/data.js`＋Anki TSV，內含 `lint_lessons()` 內容檢查，會印「⚠️提醒」或「全部通過✅」）。
   - build 會自動把 `data.js+app.js+style.css` 的 sha1 前8碼戳進 `index.html ?v=` 與 `sw.js` 的 CACHE 名 → **不用手動 bump 版本**。
3. 在 `data/changelog.yaml` 最上面加一筆（見上方規則）。
4. 若改到網頁可見的東西，用 preview 工具驗證（preview_start / preview_eval / preview_screenshot）。
5. `git add -A && git commit && git push`。

---

## 🗂 資料結構（三軌＋文章）

- `data/lessons/B<冊>L<課>.yaml`：**文法課**（依冊/課），需 `book`+`lesson`。代碼 `B?L??`。
- `data/kaiwa/<topic>.yaml`：**會話課**（依文法主題），需 `track:会話`、`topic`、`order`、`label`、`title`。代碼 `K-<topic>`。
  - **會話課依課別／上課日期分類**：可加 `lesson:` 欄位＝課本課號，或 `date:` 欄位＝上課日期（`YYYY-MM-DD`）。
    選單順序＝**第N課（依 lesson）→ 📅 日期（依 date）→ 未分類**（三者都無的收這裡，預設收合）。
    對不上課本課號的板書內容（例：自由主題的會話課）就用 `date:` 標上課日期。
  - 使用者會「拍某課課本內容」→ 用課本文法/主題判定哪些既有 kaiwa 主題屬該課，加 `lesson` 欄位＋補該課新內容。已標：第17課=能力経験/どのぐらい/可能形；第18課=誘い(mashouka)/推測伝聞。
- `data/kiso/<topic>.yaml`：**基礎文法**（自學補充），需 `track:基礎`。代碼 `G-<topic>`。
- `data/articles/*.yaml`：**文章**（朗讀/廣播用），每篇 `title/level/order/intro/body[{jp,kana,zh}]`。
- 共用：每課要有 `intro`(導讀)＋`goals`(目標)；文法用 `setsuzoku/explain/examples/practice` 還原講義版面；圖解用 `table`（cell 支援 `[標色]` 與 `{{漢字|假名}}` ruby）。詳見 `SCHEMA.md`。

---

## 📸 照片匯入流程（使用者最在意）

1. 使用者丟 HEIC 照片路徑（通常在 Temp），說明是哪一課、文法課還是會話課。
2. 用 `pillow_heif`+PIL 轉 JPG 讀取；課本頁常需 `rotate(90, expand=True)` 轉正再讀（必要時放大裁切讀手寫/小字）。
3. **逐句全收**：講義/課本的例句與練習一句都不能漏，寫完拿照片逐項點數核對；看不清楚或缺頁要「標出來請使用者確認」，不要自行編造。
4. 中翻日作業（HW）要附參考解答；若有老師板書官方解答，以板書為準。
5. 照片存 `raw/<課>/...` 備份（不上傳），暫存裁切檔放 `raw/_chk/` 用完 `rm -rf`。

---

## 🌐 平台/環境注意

- Windows 11；主 shell 為 PowerShell（也有 Bash 工具，POSIX 語法）。
- TTS 限制：**iPhone Safari 只能用基本 Kyoko**（Apple 不開放 Siri 語音給網頁，硬限制）；電腦/Android 自動用較佳語音。**使用者已決定維持輕量化、不做音檔/雲端/WASM 語音方案——別再提語音升級。**
- 使用者也有一份持久記憶在 `~/.claude/projects/.../memory/jp-learn-project.md`（更詳細的歷史脈絡），可一併參考。

---

## 🧱 技術架構與工作邏輯（深入）

### 技術棧
- **純前端 PWA**：原生 HTML/CSS/JS，**零框架、零打包、零 npm**。`web/` 直接就是網站。
- **資料層**：YAML（唯一真實來源）。建置腳本 **Python 3 + PyYAML**（唯一執行期相依；`qrcode` 為啟動器選用）。
- **離線**：Service Worker（network-first）＋ manifest＝可安裝、可離線的 PWA。
- **部署**：GitHub Actions → GitHub Pages（push main 自動建置發佈）。
- **儲存**：全部狀態存瀏覽器 `localStorage`，無後端、無資料庫、無帳號、無追蹤碼。

### 核心資料流（單向）
```
data/**/*.yaml ──python scripts/build.py──▶ web/data.js (window.LESSONS / ARTICLES / CHANGELOG)
                                        └──▶ exports/anki_*.tsv (Anki 牌組)
web/index.html ──載入──▶ data.js + app.js + style.css ──▶ 純前端渲染（讀 LESSONS 畫 UI）
```
**關鍵：網頁從不讀 YAML，只讀 build 產出的 `web/data.js`。改完 YAML 一定要重跑 build 才會生效。** `web/data.js` 是產物，已 gitignore（雲端部署時自動重建）。

### build.py 做的事（`scripts/build.py`，約 360 行）
- `load_lessons()`：讀 lessons/kaiwa/kiso 三資料夾 → 每檔 `_load_one()` 補欄位：`_group`(文法/会話/基礎，可由 `track:` 覆寫)、`_file`、`_code`、`_label`、動詞 `_vgroup`(I/II/III，由 `verb_group()`/`classify_verb()` 判定)。排序鍵＝`(GROUP_RANK, book, lesson, order, file)`。
- `load_articles()`→`window.ARTICLES`；`load_changelog()`→`window.CHANGELOG`。
- `build_web()`：把三者 `json.dumps(ensure_ascii=False)` 寫成 `web/data.js`。
- `build_anki()`：產 `exports/anki_vocab.tsv`、`anki_grammar.tsv`（`item_tags()` 把 source/key 轉 Anki 標籤）。
- `stamp_version()`：算 `data.js+app.js+style.css` 的 **sha1 前 8 碼**，戳進 `index.html` 的 `?v=` 與 `sw.js` 的 `CACHE="jp-learn-<hash>"`。**內容沒變→版本不變→不會多寫檔；內容變→快取必更新。不要手動改版本。**
- **漢字注音（ruby／ふりがな）＝ `assign_ruby()`，目前覆蓋率 100%**。產生 `_ruby` 欄（`{{漢字|假名}}` 格式）。**兩階段**：
  1. `ruby_markup(jp, kana)` 用 jp 的假名段當錨點去切 kana，反推漢字讀音；**切法唯一才採用**（保證正確）。同時累積「漢字段→讀音」佐證字典（目前 1160 個）。
  2. 有歧義的（例 `人と人`：人=ひ/人=とひと 也對得上）再用**佐證字典＋數字讀音表**裁決：只有在「唯一一種切法的每個讀音都有佐證」時才採用，否則仍不標。
  **安全鐵則不變：不確定就不標，寧可沒有也不能標錯。**
  仍標不到的，就在 YAML 的 `jp` 直接手寫 `{{漢字|假名}}`（build 會原樣沿用，並把 `jp` 洗回無標記供測驗/Anki/TTS 使用）。目前有 42 句是這樣手標的（多為數字與熟字訓，如 `{{20歳|はたち}}`、`{{3日|みっか}}`、`{{24|にじゅうよ}}`）。
  build 結尾 `report_ruby()` 印出各類數量；**「對不齊」通常代表 kana 寫錯**（曾靠它抓到 3 筆錯字），要優先修。
  ⚠️ 新增內容後請確認覆蓋率仍是 100%，若出現「仍有歧義」就手動補標。
- **沒有 kana 欄的欄位也標注音**（練習題 q/a、接続、文法點標題、圖解表格）＝`annotate_lessons()`，另存 `_rq`/`_ra`/`_rpoint`/`_rsetsuzoku`（原欄位保持乾淨，測驗與 Anki 用原欄位）。
  讀音來源：①從已標好的 `_ruby` 學「漢字段(+送假名)→讀音」字典 ②`data/readings.yaml` 人工補充。
  **安全鐵則（比對齊法更嚴）**：只在「整段漢字」完整命中字典時才標，**絕不逐字硬拆**——否則中文句子（例「前面用辭書形還是」）會被拆成「前(まえ)面用…」這種荒謬結果。所以**未標的多半是中文敘述，那是正確行為**。
  另有兩個保護：數字後的量詞讀音會變（1本＝いっぽん）→ 不確定就不標；`is_reading_quiz()` 偵測「考怎麼唸」的題目 → 題目不標，避免直接洩答案。
  `data/readings.yaml` 的鍵：`漢字段` 或 `漢字段|送假名`（多讀音字必須用後者），`#漢字` 表示數字後的量詞讀音。
- `lint_lessons()`：內容完整性檢查（缺 title/intro/goals、例句缺 jp/kana/zh、practice 缺 q/a、表格欄數不符、單元測驗<6 題…），build 結尾印「⚠️提醒」或「全部通過✅」。**不中斷 build，但提醒就要補。**
- `main()` 開頭 `sys.stdout.reconfigure(utf-8)`，避免 Windows console 遇 emoji/日文崩潰。

### 前端 app.js 運作邏輯（`web/app.js`，約 1200 行，單檔無模組）
啟動時：`LESSONS = window.LESSONS ＋ ARTICLE_LESSONS(文章包成偽課) ＋ RADIO_LESSON(廣播偽課)`，全部排序後共用同一套選課/分頁機制。
- **選課**：一次只選一課 `selectedKey`（預設＝最新文法課）。`renderPicker()` 畫左側選單：群組切換列(`GROUPS` 文法/会話/基礎/文章) → `renderGroupBody()` 依群組細分（文法依`book`冊、**會話依`lesson`課**、文章分短/長＋廣播）。可收合子分類、可搜尋(`lessonHaystack` 快取)。
- **分頁**：`updateTabs()` 依「該課有什麼內容」動態顯示分頁（有 vocab→單字卡、有 grammar→文法、文章→read…）。`renderActive()` 依 `currentTab` 呼叫對應 render。
- **五大檢視**：`renderIntro`(說明/導讀)、`renderCards`/`drawCard`(單字卡＋SRS)、`renderGrammar`(講義版面：接続/explain/`tableHtml`圖解/例/practice)、`drawQuiz`(中→日測驗)、`renderArticle`(文章朗讀)。
- **狀態機（共用守衛）**：自動播放 `autoPlay`、廣播 `radio`、朗讀 `reader` 各有 `seq` 序號，切換/停止時 `seq++` 讓殘留的 `setTimeout`/`utterance.onend` 失效，避免非同步回呼亂跳。
- **TTS**：`jaVoice()` 用 `voiceScore()` 挑最佳日語語音（Siri+110/Google+100/Kyoko 85/compact-80…），`settings.voiceName` 可指定；`stripSymbols()` 過濾不該唸的符號；手機需 `refreshVoices()` 多次補抓。
- **圖解表格**：`cellHtml()` 解析 `[標色]` 與 `{{漢字|假名}}` ruby；表格每格可點發音(`cellSayText` 去 rt 留漢字)。表格注音也受設定控管（`kanaMode()==="off"` 時去掉 ruby）。
- **漢字注音顯示**：`settings.kanaMode`＝`line`(整句假名在下，預設)／`ruby`(漢字上方)／`off`(不顯示)。`jpHtml(item)` 依模式決定要不要用 `_ruby`；`rubyCls(item)` 只在**真的標到注音**時加 `has-ruby`，CSS 才隱藏該項的假名行 → 標不到的句子自動保留整句假名當後備。
  ⚠️ **測驗頁一律不注音**（會洩題）；**單字卡正面也不注音**，翻面後才顯示。TTS 一律讀 `kana`/`jp` 資料欄而非 DOM，所以不會把注音唸兩次。

### localStorage 鍵（清快取/除錯時參考）
`jp_srs`(單字熟練度) · `jp_settings`(所有設定) · `jp_playlist`(廣播清單) · `jp_collapsed`/`jp_subcollapsed2`(選單收合) · `jp_sidecollapsed`(側欄收合)。

### PWA / 版本 / 更新流程
- `sw.js`：**network-first**——有網路抓最新並更新快取，離線時回退快取（最後回退 `index.html`）。`CACHE` 名含內容雜湊，`activate` 時刪舊快取。
- `index.html` 對 data.js/app.js/style.css 加 `?v=<hash>`；app.js 末尾註冊 SW 並監聽到新版自動 reload。→ 使用者永遠拿到最新版，不會卡舊快取。

### 部署（`.github/workflows/deploy.yml`）
push main → Actions：checkout → setup-python → `pip install pyyaml` → `python scripts/build.py` → 只上傳 `web/`(不含任何照片) 到 Pages。**雲端會自己 build，所以 `web/data.js` 不進版控也沒關係。**

### 本機開發/啟動
- 預覽用 `.claude/launch.json` 的 `python http.server 5599` 服務 `web/`（或用本對話的 preview 工具）。
- 跨平台啟動器 `start.bat`/`start.sh`/`start.py`：偵測 Python→自動裝缺套件→build→起 `0.0.0.0:5599`（no-cache）→印出區網 URL＋QR code 給手機掃。
