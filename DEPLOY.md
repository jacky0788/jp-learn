# 上線到網路（GitHub Pages）

目標：得到一個**網址**，任何手機/電腦點連結就能複習，**你的電腦不用開機**。

本專案已設定好自動部署（`.github/workflows/deploy.yml`）：
- 每次 `git push`，GitHub 會在**雲端**自動 `pip install pyyaml`、跑 `scripts/build.py`、
  把 **`web/` 資料夾**發佈成網站。
- **照片不會上傳**（`raw/` 已排除），所以黑板上同學的臉不會外流。
- 網站是公開連結（有連結的人都能看；內容只是日文課程文字）。

---

## 一次性設定（約 5 分鐘）

### 步驟 1：建立 GitHub 帳號
若還沒有 → https://github.com/signup

### 步驟 2：在 GitHub 建一個新的 repo
- 到 https://github.com/new
- Repository name：`jp-learn`
- 選 **Public**（免費版的 Pages 需要公開 repo；放心，照片不會被上傳）
- **不要**勾選 Add README / .gitignore（本專案已經有了）
- 按 Create repository

### 步驟 3：把專案推上去
在本專案資料夾開終端機（或用 PowerShell），執行（把 `你的帳號` 換掉）：

```bash
git remote add origin https://github.com/你的帳號/jp-learn.git
git push -u origin main
```

> 第一次 push 會要求登入 GitHub（瀏覽器授權即可）。

### 步驟 4：開啟 GitHub Pages
- 到 repo 的 **Settings → Pages**
- **Build and deployment → Source** 選 **GitHub Actions**
- 完成後到 **Actions** 分頁，會看到部署流程跑完（綠勾）

### 完成 🎉
網址會是：

```
https://你的帳號.github.io/jp-learn/
```

把這個連結存到手機書籤／加到主畫面，之後點一下就能複習。

### 📲 加到手機主畫面 ＋ 離線使用
這個網站是 **PWA（漸進式網頁 App）**，第一次用網路開過之後就會自動快取，**之後沒網路也能用**。
- **iPhone（Safari）**：開啟連結 → 點分享鈕 → 「加入主畫面」
- **Android（Chrome）**：開啟連結 → 右上選單 → 「安裝應用程式／加到主畫面」

加完會像一個 App 一樣有圖示，點開即用、不需網路；有網路時會自動更新成最新內容。

---

## 之後要更新內容（新增課程）

1. 用 Claude 匯入新課（產生 `data/lessons/B?L??.yaml`）
2. 在本資料夾執行：
   ```bash
   git add -A
   git commit -m "新增第X課"
   git push
   ```
3. 約 1 分鐘後網站自動更新（GitHub Actions 會自動重新 build）。

> 連你電腦都不想開？也可以直接在 GitHub 網站上編輯 `data/lessons/*.yaml` 再 commit，
> 一樣會自動更新——但「從照片辨識整理」這一步還是交給 Claude 最省事。

---

## （可選）用指令一次搞定
若你安裝了 GitHub CLI（`winget install GitHub.cli`，然後 `gh auth login`）：

```bash
gh repo create jp-learn --public --source=. --push
gh api -X POST repos/{owner}/jp-learn/pages -f build_type=workflow
```

---

## 想要更私密？
目前是「有連結就能看」。若日後想加**密碼保護**，改用 **Cloudflare Pages**（可串私人 repo、
連照片都能一起私密備份，並用 Cloudflare Access 設密碼）。需要時再請 Claude 協助切換。
