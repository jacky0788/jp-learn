# 日文複習專案（jp-learn）

把「來學日本語」的**課本、老師講義、上課板書照片**，整理成結構化資料（YAML），
自動產生**可在電腦／手機上複習的網頁**與 **Anki 牌組**，並能逐課持續擴充。

🔗 **線上版（免安裝，手機可離線）**：<https://jacky0788.github.io/jp-learn/>
> 點開即用，不需要自己的電腦或伺服器；加到主畫面後可離線複習（PWA）。

---

## ✨ 特色

- **三軌學習**，互不干擾：
  - 📘 **文法課**（依冊／課，`B<冊>L<課>`）
  - 💬 **會話課**（依文法主題，一個主題一個檔）
  - 📚 **基礎文法**（自學補充，如動詞活用、て形音便）
- **圖解表格**：變化／對比／接續／換算用表格呈現，會用紅色標出變化處、漢字附假名（ruby）。
- **講義版面還原**：文型 → 接続 → 説明 → 圖解 → 例 → 練習，讀起來像上課講義。
- **單字卡**：翻卡、SRS 熟練度、自動隨機播放、動詞顯示第 **I/II/III 類**徽章。
- **測驗**：中→日出題、顯示題號、可一次列出整個單元題庫，每單元至少 6 題。
- **語音**：例句／單字一鍵聽日語發音（瀏覽器內建 TTS）。
- **搜尋**：關鍵字快速找主題／文法／單字。
- **Anki 匯出**：零碎時間用手機背單字與文法。

---

## 🚀 使用方式

### 方式一：線上版（推薦，最省事）
直接開 <https://jacky0788.github.io/jp-learn/>。
手機可「加入主畫面」當 App 用，之後**離線**也能複習。

### 方式二：本機啟動器（自己改內容／離線備援）
- **Windows**：雙擊 `start.bat`
- **macOS / Linux**：`./start.sh`（或 `python3 start.py`）

啟動器會自動：檢查 Python → 安裝缺少套件 → 產生最新資料 → 開啟網頁，
並印出**手機網址＋QR code**（手機與電腦同一 Wi-Fi 即可掃碼複習）。

> 需先安裝 [Python 3.8+](https://www.python.org/downloads/)（勾選「Add Python to PATH」）。

---

## 📱 複習網頁怎麼用

| 分頁 | 功能 |
|------|------|
| **說明** | 每課導讀、學習目標、重點筆記（先看這個進入狀況） |
| **單字卡** | 翻卡複習，可只看不評分（按「下一個」）；🔀 自動隨機播放＋發音；📋 全部單字＋例句；動詞顯示 I/II/III 類 |
| **文法** | 還原講義版面：文型→接続→説明→**圖解**→例→練習（答案可隱藏/顯示） |
| **測驗** | 中→日出題，顯示「第 N／共 M 題」；📋 可列出整個單元題庫（答案可隱藏）；每單元 ≥6 題 |

其他：🔊 語音播放、🔍 主題搜尋、⚙️ 設定（深色模式／自動播放次數・間隔・語速）、上方可單選某一課／主題。

### Anki
匯入 `exports/anki_vocab.tsv`、`exports/anki_grammar.tsv`（分隔選「Tab」、勾「允許 HTML」）。
卡片帶 `課代碼`／`文法`／`会話`／`重点` 標籤可篩選。

---

## ➕ 持續擴充

傳照片給 Claude 並說明來源，即可整理成 YAML：
- **文法課**：「匯入第三冊第4課」→ `data/lessons/B3L04.yaml`（依冊編號，需 book/lesson）
- **會話課**：「這是會話，主題是 XX」→ `data/kaiwa/<主題>.yaml`（依文法主題）
- **基礎文法**：自學補充 → `data/kiso/<主題>.yaml`

Claude 會辨識照片、補假名與中文、依講義結構整理文型／圖解／練習，再跑 `python scripts/build.py`。
資料格式詳見 [SCHEMA.md](SCHEMA.md)。

> 隱私：`raw/` 原始照片（含板書、可能拍到同學）**不會上傳 GitHub**，只留本機備份。

---

## 📁 專案結構

```
jp-learn/
├── start.bat / start.sh / start.py   啟動器（自動裝套件＋開網站）
├── data/
│   ├── lessons/*.yaml                📘 文法課（依冊）
│   ├── kaiwa/*.yaml                  💬 會話課（依主題）
│   └── kiso/*.yaml                   📚 基礎文法（自學補充）
├── scripts/build.py                  YAML → web/data.js ＋ Anki，並自動戳印版本
├── web/                              複習網頁（純前端 PWA：HTML/CSS/JS＋Service Worker）
├── exports/                          Anki 匯入檔（自動產生）
├── raw/                              原始照片備份（本機，不上傳）
├── .github/workflows/deploy.yml      push → 自動建置並部署到 GitHub Pages
├── SCHEMA.md                         資料格式說明
└── README.md
```

---

## 🛠️ 疑難排解

| 狀況 | 解法 |
|------|------|
| 雙擊 bat 閃一下就關 | 沒裝 Python 或沒勾「Add to PATH」，重裝並勾選 |
| 手機連不到本機 | 同一 Wi-Fi；Windows 防火牆按「允許」；公共 Wi-Fi 常擋裝置互連（改用線上版即可） |
| 埠號被占用 | `python start.py --port 8080` |
| 套件裝不起來 | `pip install -r requirements.txt` |
| 匯入 HEIC 照片 | 需 `pillow-heif`（一般複習用不到） |

---

## 🧰 技術說明

- **資料／複習分離**：所有材料由 `data/**/*.yaml` 生成，改內容只需改 YAML。
- 網頁為**純前端 PWA**：無後端、Service Worker 提供離線與自動更新；SRS／設定存 localStorage。
- **自動版本號**：`build.py` 以內容雜湊戳印 `index.html`／`sw.js`，內容變才更新快取，免手動處理。
- **部署**：push 到 `main` → GitHub Actions 自動建置並發佈 `web/` 到 GitHub Pages。
- 語音用瀏覽器內建日語 TTS（Chrome／Edge／Safari 最佳）。
