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
  - **會話課依課別分類**（2026-06 新慣例）：可加 `lesson:` 欄位＝課本課號。選單會話課會依「第N課」分組（同文法課依冊），未分類(無 lesson)收在「未分類」（預設收合）。
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
