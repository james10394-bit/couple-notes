# 兩個人的小日子 ♡

版本 1.0.0。情侶共用記事、共同待辦、值班表；Firebase Firestore 即時同步。各自授權後可挑選 Google Tasks 工作清單與 Google Calendar 日曆匯入共用畫面。Google 匯入是單向唯讀：在 Google 修改，網頁開啟時每 5 分鐘同步；網頁關閉或授權過期時停止，按「重新授權 Google」繼續。這不是在背景執行的全天候雙向同步。

## 啟用前準備

1. 建立 [Firebase 專案](https://console.firebase.google.com/)，新增 Web App，啟用 Authentication 的 **Google** 登入和 Cloud Firestore。將正式網址與 `localhost` 加入 Firebase Authentication 的授權網域。
2. 將 `firestore.rules` 貼到 Firestore → Rules 並發布。務必先發布規則，再分享邀請碼。邀請碼 7 天有效、僅供第二位成員加入；請私下傳送。
3. 在 [Google Cloud Console](https://console.cloud.google.com/) 啟用 **Google Tasks API** 與 **Google Calendar API**。建立 OAuth 同意畫面與 **Web application** OAuth client ID，新增網站正式網址及本機 `http://localhost:5173` 為 Authorized JavaScript origins。若應用仍為 Testing，將雙方 Google 帳號加入 test users，或依 Google 要求完成驗證。
4. 複製 `.env.example` 為 `.env`，填入 Firebase Web App 配置與 Google OAuth client ID。這些都是公開的前端識別值，**不要放入服務帳戶金鑰、client secret 或私人 token**。Firebase 安全性由 Firestore Rules 控制。

## 本機執行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

打開 `http://localhost:5173`。兩人分別以 Google 登入；一方建立空間並私傳邀請碼，另一方輸入邀請碼。連接 Google 後，勾選要分享的工作清單與值班日曆，按「立即同步」。選擇記錄只存在當前瀏覽器，不會把 OAuth token 儲存在資料庫。

## 部署 GitHub Pages

此專案需提供 `.env` 值給建置流程。到儲存庫 Settings → Secrets and variables → Actions → **Repository variables**，逐一新增 `.env.example` 列出的五項值。不要把 `.env` 上傳到儲存庫。

將下面檔案存為 `.github/workflows/deploy.yml`（本包已附），到 Settings → Pages → Build and deployment 選 **GitHub Actions**，推送 `main` 後自動發布。若儲存庫是 `owner/repo`，網址是 `https://owner.github.io/repo/`；請將該網址的 **origin** `https://owner.github.io` 加入 Firebase 授權網域和 Google OAuth Authorized JavaScript origins。不同 GitHub Pages 儲存庫共用 origin，僅適合信任同一 GitHub 帳號下其他 Pages 的情況；正式服務建議用獨立網域。

Google Tasks 和 Calendar 權限是唯讀，Google 匯入項目無法在此網站勾選完成或刪除；請到 Google 原始清單修改。值班日曆只匯入未來 90 天內的事件。移除勾選不會刪除已經分享的項目；若要停止分享，先在 Google 刪除或修改原始資料並保持勾選後同步，或由管理者在 Firestore 刪除相應匯入資料。請只勾選願意讓另一半閱讀的內容。

## GitHub

建立一個新的私有儲存庫，例如 `couple-notes`，上傳這個程式包內所有檔案（不要上傳 `.env` 或 `node_modules`）。若 GitHub App 已提供可寫入的既有儲存庫，也可建立分支及 PR。程式原始碼即使放在私有儲存庫，GitHub Pages 的網站內容和前端建置後的識別值仍應視為公開。

