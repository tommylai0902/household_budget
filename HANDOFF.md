# Project Handoff — Household Budget

> Snapshot: 2026-07-20, commit `ed11ec7` (24 commits), plus **uncommitted work in
> `src/BudgetApp.jsx`** — see 尚未完成功能. Live at
> https://household-budget-nine-zeta.vercel.app, repo `tommylai0902/household_budget`.

## 專案目標

Tommy 同 Wing 嘅家庭記帳 app,取代共用 Google Sheet。已經長出多帳簿
(Household / Travel / Personal),支援多人分帳結算、收據 AI 掃描、
月度預算同報表。雙語 UI(EN / 繁中),Supabase 即時同步,手機瀏覽器係主要使用場景。

## 已完成功能

- **多帳簿** — picker 首頁,每本帳簿獨立嘅分類/成員/預算/店家;範本
  (household / travel / personal / blank)決定起始分類同列表 icon;可改名、換 icon、刪除
- **帳簿成員** — 任意人數;N 方結算(netting + 最大債仔配最大債主,`src/lib/settle.js`,
  有 `settle.test.js` 覆蓋);移除仲有支出嘅成員會被 FK 擋住並有人話嘅錯誤訊息
- **逐筆分帳** — 每筆 shared 支出可揀邊幾個成員夾(`expense_splits` join table);
  付款人可以唔喺分帳名單(請客案例)
- **收據掃描** — 影相 → Vercel serverless → Gemini(structured output)→ 預填
  描述/金額/日期/分類 + **逐件商品**;每件可揀 分帳/私人(送去另一本帳簿)/唔計,
  稅款按價錢比例攤分;明細存 `expense_items`,詳情面板顯示,重開可再編輯
- **預算** — 逐分類每月一個數(`budgets`),狀態條(綠/橙/紅),月總預算 = 分類之和
- **月度報表** — SVG pie chart 按分類,月份切換,撳分類 drill-down 睇明細
- **店家記憶** — 明確剔格先記(永不自動),自寫下拉建議(唔用 datalist,見 Known Bugs),
  可管理增刪改
- **雜項** — 13% HST 快捷、成員 icon(migration 007)、手機 layout 修正
  (box-sizing / 16px input / minWidth)、☰ menu、即時同步全表

## 尚未完成功能

1. 收據掃描唔會自動揀分帳成員(預設全員)
2. 分帳只可平分,冇按比例(60/40)
3. 舊支出(`expense_items` 之前)嘅明細只喺 note 文字度,未搬遷
4. 收據相唔會上傳存底(`expenses.receipt_url` 欄位一直空置;原 Step 4 構想係 Supabase Storage)

## Tech Stack

- Vite 5 + React 18(**plain JS,唔係 TypeScript**)
- Supabase:Auth + Postgres + Realtime(`@supabase/supabase-js`)
- Gemini `gemini-3.5-flash` via `@google/genai` v2(**只喺 serverless 用**)
- `lucide-react` icons;無 CSS framework(inline styles + 細 `index.css`)
- 部署:GitHub → Vercel 自動 deploy(push main 即上線)

## Folder Structure

```
api/scan-receipt.js       # Vercel serverless:收據 → Gemini → JSON(唯一 API route)
migrations/001..007.sql   # 逐個喺 Supabase SQL Editor 手動跑(見下)
src/main.jsx              # entry,StrictMode
src/index.css             # reset + box-sizing + 手機修正(有註解解釋每行)
src/BudgetApp.jsx         # 全部 UI 一個檔(~1500 行):App/Login/LedgerPicker/Ledger
                          #   + 所有 panel(Budget/Report/Members/Stores/Cats/Settlement)
src/lib/supabase.js       # client(空 env 時用 placeholder 令 UI 照 render)
src/lib/db.js             # 資料層:row⇄app mappers、CRUD、realtime。所有 mapping 只准喺呢度
src/lib/settle.js         # N 方結算數學(pure,無依賴)
src/lib/settle.test.js    # node src/lib/settle.test.js — 改錢邏輯前後必跑
supabase-schema.sql       # 全新安裝用嘅完整 schema(每次遷移都要同步更新佢)
vite.config.js            # 含 dev middleware:本地 /api/scan-receipt 行同一個 handler
CLAUDE.md / AGENTS.md     # ⚠️ 已過時,見最尾
```

## Database Schema

全部 RLS:`is_member()`(security definer,查 `members`)gate 晒讀寫。
Realtime publication 包晒所有表。

| Table | 重點欄位 | 備註 |
|---|---|---|
| `members` | user_id → auth.users, label | **登入 allowlist**,手動 insert |
| `ledgers` | name, template(check 四值), sort_order | template 決定 icon |
| `ledger_members` | ledger_id ⇢cascade, name, color, icon, unique(ledger,name) | 分帳嘅「人」;icon 係 007 加(**執行狀態未確認,用前 probe**) |
| `categories` | ledger_id ⇢cascade, name, name_zh, color, unique(ledger,name) | name 同 name_zh **刻意相同**(語言中性),寫入時兩欄一齊寫 |
| `merchants` | ledger_id ⇢cascade, name, unique(ledger,name) | 記住嘅店家 |
| `expenses` | ledger_id, category_id ⇢set null, paid_by_id → ledger_members **⇢restrict**, split_type `personal\|shared_50`, receipt_url(空置) | `shared_50` 歷史命名 = 「揀中嘅人平分」 |
| `expense_splits` | (expense_id ⇢cascade, member_id ⇢restrict) PK | 邊個夾呢筆;personal 冇 row |
| `expense_items` | expense_id ⇢cascade, name, amount, sort_order | 掃描明細;**amount 已含攤分稅**,加埋=支出總額 |
| `budgets` | ledger_id, category_id ⇢cascade, month(存月初日), unique(category,month) | 冇 row = 冇預算(≠ 0) |

**Migration 紀律:** 新遷移 = `migrations/008-*.sql`,guarded(`if not exists`/`drop … if exists`)、
可重跑;同步改 `supabase-schema.sql`;**由用戶手動喺 Supabase SQL Editor 跑**,
code 依賴新 schema 就要等用戶確認先驗證。純新增遷移可以先跑後 deploy(冇空窗);
破壞性遷移(改/刪欄)會令舊 code 壞,push 前提醒用戶次序。

## API Routes

得一條:**`POST /api/scan-receipt`**(Vercel function;本地由 vite.config.js middleware 掛同一 handler)

1. 驗證 method/body/圖大小(base64 ≤5MB)/mime(jpeg png webp)
2. **授權**:body 帶 Supabase access token → 以該身份查 `members`,唔喺 allowlist 即 403
   (呢個 endpoint 燒 Gemini quota,唔可以裸奔)
3. Gemini `client.interactions.create({ model, system_instruction, input:[text,image],
   response_format:{type:"text", mime_type:"application/json", schema} })`
   → 回 `{description, amount, date, category(enum=現有分類名), items:[{name,price}]}`
4. items 係**印刷價(未稅)**;客戶端按 `總額/明細和` 比例攤稅

客戶端先將相縮到 2000px JPEG 0.85 再上傳(Vercel body 上限 4.5MB + 慳 vision token)。

## Authentication Flow

1. Supabase email/password(用戶喺 Dashboard → Authentication 手動建帳號)
2. 登入後 UID 必須喺 `members` 表(手動 insert),否則 RLS 下乜都讀唔到
3. App root 聽 `onAuthStateChange`;無 session → Login,有 → LedgerPicker
4. anon key 放前端係設計如此(RLS 先係真閘門);**service_role 永不落 client**

## Environment Variables

`.env.local`(gitignored)同 Vercel 兩邊都要有:

```
VITE_SUPABASE_URL=        # Supabase project URL
VITE_SUPABASE_ANON_KEY=   # anon public key(前端安全)
GEMINI_API_KEY=           # ⚠️ 冇 VITE_ 前綴!server-side only,加咗前綴會打包入前端 JS
```

Vercel 加/改 env var 後要手動 redeploy 先食到。

## Coding Style

- Plain JS,冇 TS、冇 class、冇 CSS 檔(inline style objects,共用樣式喺 BudgetApp.jsx 底部)
- DB snake_case ⇄ app camelCase,**所有 mapping 只喺 db.js**
- i18n:`STRINGS.en/zh` + `makeT`;每加 UI 文字兩邊都要加;分類/店家/成員名唔翻譯
- 慳依賴:成個 project 得 5 個 runtime deps;能用原生就唔加 library(pie chart 都係手畫 SVG)
- 錢邏輯必須有可跑檢查(`settle.test.js` 模式:node assert,無框架)
- Commit message:無 prefix 慣例,標題講「點解」,body 散文解釋 trade-off,
  結尾 `Co-Authored-By: Claude <model> <noreply@anthropic.com>`

## Design System

- 色:`TEAL #0E9384`(主)、`PAPER`(底)、`INK`(文字)、`SUB`(次要)、`LINE`(邊框)、
  `#DC2626` 危險紅、`#D97706` 預算橙;成員色由 `MEMBER_COLORS` 輪流派
- 佈局:主欄 maxWidth 880;所有 panel 用 `Overlay`(右側滑出,`min(440px,100%)`)
- 控件:`selectablePill`(分類/成員揀選)、`editCatsPill`(虛線=動作非選項)、
  `segBtn`、`iconBtn`、`ghostBtn`、`addBtn`、`menuItem`
- 手機規則:input 字體 ≥16px(iOS zoom)、全域 border-box、flex 行內元素要 `minWidth:0`、
  任何新畫面要喺 375px 檢查冇橫向溢出

## Known Bugs

- 「JWT issued at future」— 本機時鐘偏移時出現過一次;校時或重新登入即好
- 原生 `<datalist>` 喺 Chrome 會被表單中途插入嘅 DOM 收起 — **已改用自寫下拉,唔好改返去**
- `npm audit` 有 2 個 vulnerabilities(moderate/high),未處理
- 舊支出嘅明細殘留喺 note 文字(見 尚未完成 #4)
- iOS/Android 只喺桌面模擬 375px 驗證過;真機日期選擇器/鍵盤行為未實測

## Current TODO

1. Migration 007(成員 icon)喺 DB 嘅執行狀態未確認 — probe `ledger_members.icon`
2. 更新過時嘅 CLAUDE.md / AGENTS.md(見最尾)
3. 尚未完成功能 #1–#4 按用戶需求逐個做
4. Settlement details 面板已喺瀏覽器驗證(Tokyo 3 人帳簿,數字對得上,375px 冇溢出)
   同 commit(`cc5a51d`)—**未 push**,等用戶話先郁。

## Claude 在之後開發時需要知道的事項

1. **☠️ 唔好用 PowerShell regex 批量改 `BudgetApp.jsx`。** 檔案有 681 個中文字元
   (仲有 `…` `—`),試過一次批量改寫令 92 個字元變 `??` 全檔報廢,要 git checkout 重做。
   一律用逐個精準 edit;改完數中文字元核對(而家係 **681**,加中文字串時按預期增加)。
2. **測試資料紀律:** 驗證慣例係用瀏覽器 console + localStorage 攞 session token 直打
   Supabase REST。測試名用 `__xxx__` 前綴,完事即刪。⚠️ PostgREST `like` 濾器入面
   `_` 係萬用字元 — `name=like.__*` 會 match 到所有 ≥2 字元嘅名,試過險啲清錯庫,
   刪嘢用 `eq.` 逐個做。
3. **Gemini SDK 唔好靠記憶寫。** `@google/genai` v2 係 `client.interactions.create`
   (唔係舊嘅 `generateContent`);API 變得快,寫之前查 `node_modules/@google/genai/dist/genai.d.ts`。
4. **驗證要驗「見唔見到」,唔止「資料啱唔啱」。** datalist 事故:HTML 完全正確但 popup
   從未彈出。UI 功能要 screenshot 或直接 query 可見元素,唔可以只驗 state。
5. **每個功能完成先 commit,等用戶話 "commit + push" 先郁**;push main = 即時上 production。
6. **CLAUDE.md 同 AGENTS.md 已過時**(仲寫住 `paid_by` 係 text 'tommy'/'wing'、
   roadmap 話 budgets/scanning 未做)。以本檔同實際 code 為準;值得順手更新佢哋。
7. 用戶用廣東話溝通,鍾意:先講「做咗乜 + 點驗證」嘅表格、⚠️ 標明未驗證/風險位、
   刻意嘅設計決定要解釋點解。功能完成後佢會自己喺手機實測。
8. 收據掃描嘅真實效果只可以用真收據驗(自畫 canvas 收據字體太乾淨,唔代表實況);
   prompt 已寫明「讀唔清就回空 items,唔好作」— 保住呢個行為。
