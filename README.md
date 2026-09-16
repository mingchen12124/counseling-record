# 輔導紀錄小幫手（網站版）

## 這是什麼
一個手機／電腦都能用的網頁，取代原本的 Google 試算表操作流程：
選學生 → 選對象 → 語音輸入輔導紀錄 → 自動套版產生導師／家長訊息（v1 版本尚未接 AI 潤飾，先用您說話的原始文字）→ 存進雲端資料庫 → 待追蹤提醒 → 學生歷程分析。

## 技術架構
- 前端：純 HTML／CSS／JavaScript（沒有用到額外框架，方便日後自己修改）
- 資料庫／登入：Google Firebase（Firestore 資料庫 + Google 帳號登入）
- 語音輸入：瀏覽器內建語音辨識（Web Speech API），免費、不需要金鑰，僅在 Chrome／Edge 效果較好
- 網站託管：GitHub Pages（免費）
- AI 潤飾：本版**尚未啟用**（需要另外申請 Anthropic API 金鑰才能加，之後要加隨時可以）

## 設定步驟

### 1. 建立 Firebase 專案
1. 到 https://console.firebase.google.com 用您的 Google 帳號登入
2. 新增專案 → 專案名稱可取「counseling-record」之類 → 一路下一步
3. 左側選單「建構」→「Authentication」→ 開始使用 → 啟用「Google」登入方式
4. 左側選單「建構」→「Firestore Database」→ 建立資料庫 → 選「正式環境模式」→ 選離台灣近的地區（如 asia-east1）
5. 進「規則」分頁，把這個專案裡 `firestore.rules` 的內容整個貼上去取代，按發布
6. 左上角齒輪 →「專案設定」→ 往下捲到「您的應用程式」→ 點網頁圖示 `</>` 新增網頁應用程式 → 取個名字 → 註冊後會看到一段 `firebaseConfig` 程式碼
7. 把那段內容複製，貼到專案裡 `js/firebase-config.js`，取代裡面的 `REPLACE_ME`

### 2. 建立 GitHub 儲存庫並上線
1. 到 https://github.com 登入 → 右上角 + →「New repository」
2. 取名（例如 counseling-record），設為 Public 或 Private 皆可 → Create repository
3. 把這個資料夾裡「全部的檔案」（index.html、style.css、app.js、data.js、firebase-config.js、firebase-init.js、speech.js、firestore.rules、README.md）一次全選拖進「uploading an existing file」的上傳區（所有檔案都放在同一層，不需要資料夾）→ Commit
4. 進 repo 的「Settings」→「Pages」→ Source 選「Deploy from a branch」→ Branch 選「main」、資料夾選「/ (root)」→ Save
5. 等 1-2 分鐘，畫面會顯示網站網址，例如 `https://您的帳號.github.io/counseling-record/`，這就是正式上線網址

## 資料庫欄位說明
- `students`：學生名單（name 姓名／klass 班級／grade 年級／active 是否在學）
- `records`：輔導紀錄（studentId／studentDisplay／grade／target 對象／content 內容／date／teacherMessage／parentMessage／tags）
- `tracking`：待追蹤事項（studentDisplay／description／dueDate／status／recordId）
- `iepGoals`：IEP 目標（studentDisplay／goalTitle／progress／notes）

## 之後可以再加的功能
- AI 潤飾訊息（需申請 Anthropic API 金鑰，並多架一個安全的後端來呼叫，不能直接把金鑰放在網頁程式碼裡）
- 待追蹤事項真正同步到 Google 日曆（需另外設定 Google Calendar API 授權）
- 把舊的 Google Sheets 資料匯入 Firestore
