# 高雄運動｜每月活動總入口

一套可部署在 **GitHub Pages** 的活動入口網站，搭配 **Supabase Auth + Postgres + Row Level Security (RLS)**，提供：

- 公開活動入口：月份切換、搜尋、科室／類型篩選、焦點活動、分享。
- 小編登入後台：Email + 密碼。
- 一般「科室小編」只能新增／修改／刪除自己科室的活動。
- 「總編」與「綜企科小編」可管理所有科室活動。
- 草稿／發布狀態，避免未完成資料直接出現在前台。
- 圖片上傳。
- 活動異動紀錄，方便多人協作追蹤。
- 無 npm、無 build step；直接放 GitHub Pages 即可。

> 為什麼不能只用 GitHub Pages？GitHub Pages 只負責 HTML/CSS/JS 靜態檔案，無法安全地替你保存密碼、登入狀態與多人可寫入資料。因此本專案把「畫面」放 GitHub Pages，「帳號／密碼／資料／權限」放 Supabase。

## 檔案

```text
index.html       公開活動入口
admin.html       小編登入與活動管理
styles.css       共用外觀
app.js           前台功能
admin.js         後台登入、CRUD、圖片上傳
config.js        Supabase Project URL + Publishable key
supabase.sql     資料表、RLS、安全規則、Storage
README.md        安裝說明
```

## 1. 建立 Supabase 專案

1. 建立一個 Supabase Project。
2. 進入 **SQL Editor**。
3. 將 `supabase.sql` 全部貼上並執行。
4. 到 **Settings → API Keys**，取得：
   - Project URL
   - Publishable key（舊專案也可使用 anon key）
5. 修改 `config.js`：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_KEY: "sb_publishable_xxxxx",
  SITE_NAME: "高雄運動｜每月活動總入口"
};
```

### 安全重點

`config.js` 會公開在 GitHub，這是正常的；請只放 **Publishable key / anon key**。權限安全由 RLS 保護。

**絕對不要把 Secret key 或 service_role key 放進 GitHub、HTML、JS 或瀏覽器。**

## 2. 設定科室

`supabase.sql` 先放了三個範例：

- 綜合企劃科
- 全民運動科
- 競技運動科

可在 Supabase 的 `departments` Table Editor 直接新增／改名／停用其他科室。

## 3. 建立允許登入的小編

本系統採「允許名單 + Auth 帳號」雙重判斷。

### 先加入 allowed_editors

範例：

```sql
insert into public.allowed_editors(email,display_name,department_id,role)
select 'editor@example.gov.tw','全民運動科小編',id,'department_editor'
from public.departments where name='全民運動科';
```

角色共有：

- `department_editor`：只能管理自己的科室。
- `chief_editor`：總編，可管理全部。
- `planning_editor`：綜企科小編，可管理全部。

### 再建立 Auth 使用者

Supabase Dashboard → **Authentication → Users → Add user**。

輸入同一個 Email，設定密碼。系統 trigger 會自動依 `allowed_editors` 建立 `profiles` 權限資料。

建議：**關閉公開 Sign Up**，只由管理者建立／邀請核准的小編帳號。

## 4. GitHub Pages 部署

1. GitHub 建立一個新 Repository，例如：`kaohsiung-sports-events`。
2. 將本資料夾所有檔案上傳到 repo 根目錄。
3. GitHub → **Settings → Pages**。
4. Source 選 **Deploy from a branch**。
5. Branch 選 `main`、Folder 選 `/ (root)`，儲存。
6. 等 GitHub Pages 完成發布。

公開首頁：

```text
https://你的GitHub帳號.github.io/kaohsiung-sports-events/
```

小編後台：

```text
https://你的GitHub帳號.github.io/kaohsiung-sports-events/admin.html
```

## 5. Supabase Auth 網址設定

到 Supabase → **Authentication → URL Configuration**：

- Site URL：填 GitHub Pages 網址。
- Redirect URLs：加入首頁與 `admin.html` 網址。

這樣「忘記密碼」信件才能正常導回網站。

## 權限如何保護？

真正的限制在 `supabase.sql` 的 RLS，不是只在畫面上隱藏按鈕：

| 身分 | 讀取 | 新增／編輯／刪除 |
|---|---|---|
| 未登入民眾 | 只看已發布活動 | 不可 |
| 科室小編 | 已發布活動 + 自科草稿 | 只限自己科室 |
| 總編 | 全部 | 全部科室 |
| 綜企科小編 | 全部 | 全部科室 |

因此即使有人自行改瀏覽器 JavaScript、手動呼叫 API，一般科室小編也無法越權修改其他科室資料。

## 建議正式上線前再做的 5 件事

1. 把所有實際科室加入 `departments`。
2. 整理每位小編的核准信箱、姓名、科室、角色。
3. Supabase Auth 關閉公開註冊。
4. 測試 A 科小編無法修改 B 科活動；總編／綜企可修改全部。
5. 若是正式政府服務，建議改綁機關網域或由資訊單位確認資安、個資與備份規範。

## 未連 Supabase 時

`index.html` 會自動顯示 3 筆示範活動，方便先看版型；`admin.html` 會提示尚未設定 Supabase。
