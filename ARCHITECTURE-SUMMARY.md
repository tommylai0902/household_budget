# 記賬 App 架構與需求摘要

> **Monira**(app 名,原名 Household Budget)——Vite + React(JS,非 TS)+ Supabase + inline styles(無 CSS framework、無 Tailwind)。單一大檔 `src/BudgetApp.jsx`(UI 全部喺度)+ `src/lib/db.js`(資料層,row⇄app mapping 淨係喺呢度做)+ `src/lib/settle.js`/`csv.js`/`categorize.js`/`recurring.js`(pure、有 `*.test.js`,`recurring.js` 淨係得 date math 冇 Supabase)。呢份摘要供新對話接續開發用,睇完呢份文件就唔使再由頭 explore 個 codebase。
>
> **Migration 狀態**:`migrations/001` 到 `019` **全部已經喺 Supabase 行過,現時資料庫已經係最新**。之後新開對話如果加新功能要新欄/新表,記得跟返呢個習慣:寫一條新編號嘅 `.sql` 檔,叫用戶去 Supabase SQL editor 行,唔好假設佢自動行咗。

---

## 1. 帳本 Template 劃分與 Feature Flags

Template 值儲喺 `ledgers.template` 欄(`household` / `personal` / `travel` / `kid` / `blank`)。「Family」= 呢個 app 原有嘅 `household`(同一概念,冇加新 key)。

**Feature flags**(`src/lib/db.js` → `TEMPLATE_FEATURES` + `featuresFor(template)`):

| Template(顯示名) | `showSplit` | `hasRecurring` | `hasBudget` | `hasCurrency` |
|---|---|---|---|---|
| `household`(Family) | ✅ | ✅ | ✅ | ❌ |
| `personal`(Personal) | ❌ | ✅ | ✅ | ❌ |
| `travel`(Travel) | ✅ | ❌ | ✅ | ✅ |
| `kid`(Kids) | ❌ | ❌ | ❌ | ❌ |
| `blank`(Blank) | ✅ | ✅ | ✅ | ❌ |

前端 hook:`useLedgerFeatures(ledger)`(BudgetApp.jsx),內部包住 `db.featuresFor(ledger.template)`,`useMemo` cache。`kid` 嗰四個 flag 其實冇乜 UI 邏輯掛住(見第 13 節,`KidLedgerDashboard` 係完全獨立嘅 render path,唔會行到呢啲 flag 控制嘅代碼),擺 false 淨係為咗將來如果 flag 真係開始生效,default 唔會不小心開錯嘢。

`ledgers.template` 呢欄**仲有自己嘅 DB check constraint**(migration 005,而家已經包埋 `kid`,見 `alter table ledgers ... check (template in ('household','travel','personal','kid','blank'))`)——同 `db.js` 嘅 `TEMPLATE_FEATURES` 係兩回事,以後加第 6 個 template,兩處都要改,唔係得 `db.js` 就會 insert 400。

各 template 有自己嘅預設分類(`db.TEMPLATES`),建帳簿時 seed 落 `categories` 表:
- **household**:Rent / Utilities / Household / Grocery / Food Delivery / Dine in / Entertainment
- **travel**:Flights / Accommodation / Food / Transport / Activities / Shopping / Other
- **personal**:Food / Transport / Shopping / Health / Subscriptions / Other
- **kid**:Chores🧹 / Snacks🍦 / Toys🧸 / Games🎮 / Gifts🎁 / Allowance💰(見第 13 節)
- **blank**:冇預設分類

**成員(`ledger_members`)已經冇晒 auto-seed**:`createLedger()`(db.js)以前會幫每本新帳簿塞返「Tommy」「Wing」兩個成員,而家**完全刪除咗**——任何 template 開新帳簿一律零成員,要自己去「Edit members」加。**例外**:`!showSplit` 嘅 template(即係 Personal 同 Kid)由於 UI 完全隱藏晒「Who paid?」/「Edit members」入口(見下),冇呢個入口就冇辦法加成員,所以 `createLedger()` 對呢類 template 會自動幫 ledger 擁有者本人加一個成員(名讀 `app_user.name`,攞唔到就 fallback email,再攞唔到就叫「Me」)。

---

## 2. 各 Template 細節規則

### `showSplit = false`(Personal、Kid)
- **Add Expense 表格**(`ExpenseForm`):完全隱藏「Who paid?」同「Split」兩個 section(唔係 disable,係唔 render)。付款人靜靜雞 default 做 `members[0]`,`split` 強制 `"personal"`,`sharedWith: []`。
- **Recurring expense 表格**(`RecurringForm`):同一個 gate,一樣隱藏「Who paid?」/「Split」——呢個係之後先補嘅(見第 14 節),一開始淨係 `ExpenseForm` 有做,`RecurringForm` 漏咗,用戶報咗先發現。
- **Expense list 每行嘅 badge**:「邊個俾錢」個色點+名、「Personal」/「Split N ways」個 tag,喺 `!features.showSplit` 嘅 template 都唔會 render——因為淨係得一個人、一定係 personal,兩個 badge 淨係重複緊同一件事,冇資訊。
- **Header menu**:隱藏「Manage members」(邏輯:Personal/Kid = 得你一個人,冇第二人要畀權限)。
- **Batch import 預覽表**:同樣隱藏「Default card owner」selector 同每行嘅「Paid by」dropdown;每行 silently 用 `members[0]` 做付款人,`split: "personal"`。

### `hasRecurring = false`(Travel、Kid)
- **Header menu**:隱藏「Recurring expenses」呢一項(`onRecurring={features.hasRecurring ? ... : undefined}`)。

### `hasCurrency = true`(Travel 專屬)— 見第 4 節

### `hasBudget`
- household/travel/personal/blank 四個 template 而家全部係 `true`,**未有任何 UI 根據呢個 flag 隱藏嘢**(避免死代碼)。Kid 就係 `false`,但因為 Kid 用緊完全獨立嘅 dashboard(第 13 節),呢個 flag 對佢嚟講純粹係資料,冇實際攔截效果。

### 邊個角色可以做咩(RBAC,同 template 冇關,但常同時出現)
- Owner / Editor / Viewer 三個角色,menu **對三者顯示一樣**(唔再按角色隱藏掣)。
- 撳落 owner-only 動作(delete ledger、invite、change role、remove member、revoke invite)先至檢查權限,冇權會彈 `ownerOnlyErr` 訊息,唔會靜靜雞冇反應。
- 所有刪除確認(ledger / expense / member / recurring rule)已經由 `window.confirm()` 改用自訂 `ConfirmDialog` component(因為 native confirm 有「Prevent this page from creating additional dialogs」呢個瀏覽器陷阱,一中就全部刪除掣好似壞晒)。
- Auth/roster 走嘅係 `app_user` + `ledger_role` + `ledger_invite`(migration 008/009),同 bill-split 用嘅 `ledger_members` 係**兩個完全獨立嘅概念**(RBAC = 邊個睇到/改到呢本帳,ledger_members = 邊個要夾份)。

---

## 3. Reports panel 圖表寫法

**冇用 Recharts 或者任何 chart library**——手寫 SVG donut + div-bar,冇加新 dependency。

`MonthlyReport` component 現時結構(由頂至尾):
1. Total spending 卡(當月總額)。
2. **Category Pie Chart**:手寫 SVG donut,中心顯示總金額。
3. **Category breakdown**:**每個分類自己一張卡**(白底/CARD 底、border、圓角),左邊一個色底圓形 icon(emoji,見第 8 節嘅 `categoryIcon()`),中間名、右邊 % 同金額,**成張卡都撳得**(drill-down 去 `CategoryExpenseList`)。
4. **Select month / Compare to 雙 dropdown**:擺喺 bar chart 之前,取代原本靜態標題文字。Select month 控制成個 panel(pie/breakdown/total 全部跟佢),唔止 bar chart。
5. **Month-over-Month Bar Chart**:逐個分類一行,兩條疊住嘅水平 bar(今月 accent 色,compare 月灰),右側 delta(`+$X (+Y%)` / `-$X (-Y%)` / `New this month` / `Gone this month` / `No change`)。
6. 兩個月嘅分類總額經同一個 `categoryTotalsFor()` function 計,pie 同 bar 唔會有數對唔上。

---

## 4. 帳本貨幣(Ledger currency,Travel 專屬)

- `ledgers.currency` 欄(migration 014),3 字母 ISO code,預設 `CAD`。**得 Travel template**(`hasCurrency`)先可以改。
- 改嘅地方:入到帳本之後,☰ menu 有一行「Currency」,揀完即時生效(`db.updateLedger` + 更新 App 揸住嗰個 `ledger` state,唔使 refetch)。
- **`activeCurrency`**(BudgetApp.jsx 頂部一個 module-level `let`)—— 淨係一個 `<Ledger>`/`<KidLedgerDashboard>` 會同時掛住,所以用 module 變數而唔係逐層 thread prop,一 render 就即刻設定,子components 全部靠 `money()`/`currencySymbol()` 讀返呢個值。
- 金額輸入框(Amount 一類)嘅 `$` 前綴一律用 `currencySymbol(activeCurrency)`,唔再係寫死嘅 `$`。

---

## 5. 主題系統(Light/Dark)

- **Theme**:`localStorage["theme"]`,第一次開冇存過就跟 `prefers-color-scheme`,之後就記住你揀嘅嗰個,唔會再跟 OS 變。套用方式:`document.documentElement.setAttribute("data-theme", theme)`,`src/index.css` 有 `:root[data-theme="light"|"dark"]` 兩組 CSS custom properties(`--ink` `--sub` `--line` `--paper` `--card` `--ok-*` `--bad-*` `--track` `--muted-bg` `--danger` `--warn`)。
- BudgetApp.jsx 頂部啲顏色常數(`INK` `SUB` `LINE` `PAPER` `CARD` `OK_BG` `OK_INK` … )全部係 `"var(--xxx)"` 字串,唔係寫死 hex——所以淨係加一個 `data-theme` attribute,成個 app 嘅 inline style 就跟晒轉,唔使逐個 component 改。
- **一定要記住嘅陷阱**:一個 tint(例如 `OK_BG`)背景,永遠要配返佢自己嗰組 ink(`OK_INK`),唔可以用 `INK`——早前試過寫死淺色主題嗰對 tint,dark mode 就變咗「近乎白色字」印喺「淺青色底」,睇唔到。
- **Settings 頁而家係 accordion 樣式**(見第 15 節)——Language/Appearance/Accent colour 呢三樣,連同呢度講嘅 Theme 選擇,全部收埋做可以展開嘅一行,唔再成頁攤晒出嚟。

---

## 6. Accent 主題色(Settings → Accent colour)

- 使用者可以自己揀成個 app 嘅主色(原本淨係寫死 teal)。已試過三輪先定案:
  1. 第一輪:8 隻深色 dusty/Morandi 色。
  2. 第二輪:加咗幾隻 pastel 淺色 —— 之後發現**淺色會令白字睇唔到**,加咗 `accentInkFor(hex)`(WCAG relative luminance,閾值 `0.179`)自動揀返白字定深字。
  3. 第三輪:用戶指出淺色喺「唔經 ink、直接做文字/邊框色」嘅場合(例如未選中嘅 pill 邊框、連結文字)一樣會洗色——**淺色options 全部移除**,`ACCENT_COLORS`(BudgetApp.jsx)而家 18 隻,全部 luminance ≤ 0.179,保證企喺白底都夠 4.5:1。`accentInkFor` 依然留住做 safety net,唔係因為而家個 list 需要淺色分支。
- 機制同 theme 一樣:`document.documentElement.style.setProperty("--accent", accent)`,`TEAL` 呢個常數而家係 `"var(--accent)"`(改名歷史包袱,值已經唔一定係 teal)。
- **預設色 = 灰(`#656565`,即 `ACCENT_COLORS[0]`)**,`index.css` 嘅 `--accent` fallback 同步咗。
- **儲存方式**:accent **跟帳號走**,存喺 `app_user.accent`(migration 015,已行)。`localStorage["accent"]` 淨係一個 cache,俾 app 開機即刻上色,唔使等 profile fetch 返嚟先閃一下預設色;登入之後 `db.fetchMyAccent()` 覆蓋佢(所以換部機/換瀏覽器登入都會見返自己嗰隻色)。
- **揀色 ≠ 儲存**:`changeAccent` 淨係 preview(即場重畫成個 app,唔寫任何嘢),`SettingsPanel` 自己揸住「Save colour / Saved」掣先真係寫入(先寫 DB,成功先更新 localStorage cache),中途唔 save 就撳 X/背景關閉會自動 revert 返已儲存嗰隻。語言同 light/dark 就冇呢個 draft 步驟,照舊撳即生效。
- **Settle-up / shared 呢一類「OK」tint**(`--ok-bg` 等)跟住 accent 一齊變,唔再係寫死 teal——`okTintsFor(accent, theme)` 用 `mix()`(簡單 RGB channel blend,唔係 hex library)將 accent 撈落白色/深色底,即場算出 bg/ink/line/strong 四個值。「你欠幾多」嗰句紅色/橙色(`DANGER`/`WARN`)保持寫死,唔跟 accent 變(語意色,唔係品牌色)。

---

## 7. 月曆 View(Ledger 頁面頂部)

1. **`MonthCalendar`** 組件擺成頁最頂,7 欄月曆格仔(Monday-first,weekday label 用 `toLocaleDateString(...,{weekday:"short"})` 自動跟語言,唔使寫死翻譯)。
   - 每格:日期數字 + (如果嗰日有支出)`money()` 顯示嗰日總額。
   - **今日**:淺色 badge 圈住個數字(`OK_BG`/`OK_INK`)。
   - **撳中嗰日(selected)**:成粒格填實 accent 色(`TEAL`/`ACCENT_INK`),同今日嘅badge 分得開。
   - **有支出嘅日**:淺色圓圈(固定透明度,`color-mix(in srgb, ${WARN} 12%, transparent)`),唔跟金額深淺變。
   - 撳一日 = **淨係篩選底下個 list**,月結算(settle-up)、總額呢啲數繼續睇成個月,唔會因為揀咗一日而變(`Ledger` 用 `visibleRows = selectedDay ? rows.filter(...) : rows`)。撳多次同一日或者撳「Show all」清空。轉月會自動清返 selectedDay。
2. **Calendar 底部一個 footer bar**(合併咗「Spent in {month}」+「Settle up」):
   - 左:「Total Spending」+ 金額。
   - 中:「Balance」(呢個月啲分類預算加埋 - 已使 = 幾多,冇 budget 就顯示「—」)。
   - 右:「Settle up ›」——純粹一個入口掣,撳落先開返 `SettlementDetails` 睇詳情。
3. Add Expense 表格嘅日期,跟返月曆揀嗰日(`ExpenseForm` 嘅 `defaultDate` prop,有揀就用嗰日,冇揀先 fallback 返月中 15 號)。

---

## 8. 分類 Emoji Icon

- `CATEGORY_ICONS`(BudgetApp.jsx):一個 `{分類英文名小寫: emoji}` 嘅 map,cover 晒 `db.TEMPLATES` 全部分類名,包括 Kid template 嗰 6 個(chores🧹/snacks🍦/toys🧸/games🎮/gifts🎁/allowance💰),自訂/改名分類冇對應就 fallback 🏷️,冇分類(Uncategorised)用 ❔。
- 因為分類名本身係 language-neutral(`catName()` 一早就係咁設計),呢個 lookup 唔使分語言版本。
- 用喺:Expense list 每行嘅分類 badge(icon 就喺個 pill 入面)、Reports 分類卡嘅色底圓形 icon、Kid Ledger 嘅 tile grid 同 activity list。

---

## 9. Split 相關細節

- **`SplitMemberPicker`**:Add expense 表格 + 定期支出表格共用一個 component,加咗一行「Everyone」(全揀先勾,揀晒自動勾)擺喺 list 最頂。
- **Overlay 疊層陷阱**:全部 Overlay 都用同一個寫死 `z-index:50`,邊個喺 DOM 後面邊個就贏——`<BatchImportModal>` 一定要喺 `<MemberManager>` 之前 render(唔係邏輯有問題,純粹 DOM 次序)。**呢個係一個通用陷阱**:之後如果再喺邊個 modal 入面開多一層 modal,記得檢查邊個要喺 DOM 後面。
- **另一個通用陷阱(`Field` 曾經係 `<label>`)**:`Field` component(BudgetApp.jsx,俾成個 app 大部分表格用嘅「標題 + 內容」wrapper)一開始用 `<label>` 包住,而 `<label>` 撳落會 forward 個 click 去入面**第一個** form control——大部分 `Field` 包住嘅係一堆掣(swatch grid、language row),唔係單一 input,結果撳中個 caption 文字(例如「Accent colour」四個字)就會靜雞雞揀咗第一個 swatch。而家 `Field` 改咗做普通 `<div>`,代價係單一 input 嘅 Field(Amount、Note)撳個 caption 唔再自動 focus 個 input。**如果之後要加返類似「撳 label 就 focus input」嘅方便,要逐個 Field 用 `id`/`htmlFor` 手動接返,唔可以成個 component 改返做 `<label>`。**
- Add expense / Batch import,如果嗰本帳冇成員/冇分類,會有紅色字提示(「No members yet」/「No categories yet」),唔可撳。

---

## 10. Budget Panel:睇 vs 編輯分開咗

- **`BudgetPanel`**(主 Budget 頁)完全 read-only:「All categories」總卡 + 逐個分類卡,金額全部係文字顯示,每張卡都有 bar(有 pace tick)+「{spent} Spent」/「{left} Left / Over」。
- 總卡右上有個實色 pill「Edit budget」badge,撳先開 **`EditBudgetPanel`**(獨立頁面)——淨係呢頁先有得改,底部「Save budgets」掣,save 完自動關返自己、返去(已更新嘅)read-only 頁。
- **Pace tick**:`BudgetBar` 嘅 `pace` prop(0–100,淨係當睇緊「今個月」先計),bar 上面一條幼線,表示「今日行到成個月幾多 %」,同支出/預算嘅比例完全冇關,純粹進度參考線。

---

## 11. 批量 Import 三步式預覽流

**入口**:Add Expense 表格入面兩個掣:
- **Scan receipt**(相機,`capture="environment"`):即場影相,單一收據,連 line items 拆分。
- **Upload receipt**(檔案):一律 batch 模式。`accept="image/jpeg,image/png,.jpg,.jpeg,.png,.heic,.pdf,.csv,text/csv"`。

**三步流程**:
1. **解析**(揀檔案即刻做):`.csv`/`text/csv` → 本機免費解析(`src/lib/csv.js` 嘅 `parseCsvText`);其他(screenshot/PDF)→ `/api/scan-statement.js`(Gemini vision)。
2. **預覽表**(`BatchImportModal`):逐行日期/描述/金額/分類(`guessCategoryId()` keyword 估分類)/Paid by(`showSplit=true` 先顯示);「Default card owner」bulk 更新未手動改過嗰啲行(`paidByTouched` flag)。
3. **Confirm & Import**:逐行 sequential call `db.importExpensesBatch()`,底層同手動加一筆用返同一個 `insertExpense()`。部分失敗淨係留低失敗嗰幾行畀你再試。

---

## 12. App 品牌(Monira)同多語言

- **App 由「Household Budget」改名做「Monira」**:`index.html` 嘅 `<title>`、`package.json` 嘅 `name`、每種語言登入畫面上面嗰句 eyebrow 文字、同埋 ledger picker 首頁個大標題,全部改咗做固定字串 `"Monira"`——**唔跟語言變**(品牌名,同 `t()` 冧完全冇關,五種語言嘅 STRINGS 入面 `eyebrow` 呢個 key 個值全部一樣係 `"Monira"`)。Picker 個 h1 特登**冇**用返 `t("ledgers")`(嗰個 key 而家淨係俾入面 menu 嗰粒「Home」用,兩者意思唔同——一個係品牌名,一個係「呢粒掣帶你去邊」)。
- **語言:而家有 5 種**——`en`(English)、`zh`(繁體中文/廣東話口語,呢個係最舊嘅、原有嘅)、`zh-Hans`(簡體中文,普通話書面語,**唔係逐字轉繁做簡**,獨立寫嘅)、`fr`(Français)、`es`(Español)。`STRINGS` object 每種語言而家都係 247 個 key,加新 UI 文字記得 5 種都要加齊,唔係會 fallback 番做 English(`makeT` 嘅 `??` 鏈)。
- **語言揀法而家係 dropdown**(`<select>`),唔係一排掣——`LangToggle` component 改咗,原因係語言愈加愈多,一排 button 會摺行。`LANGS` 呢個 array(`[[code, label], ...]`)控制順序同顯示名,`getLang()` 驗證 localStorage 個值係咪 `STRINGS` 入面真係有嘅語言。
- **日期 locale 跟語言**:`DATE_LOCALES`(`zh: "zh-Hant"`, `zh-Hans: "zh-Hans"`, `fr: "fr-CA"`, `es: "es-ES"`),`fr-CA` 特登唔用返法國 `fr-FR`,因為呢個 app 預設 CAD/HST,想個日期格式同呢邊人睇開嗰種一致。
- **`/api/scan-receipt.js` 嘅 AI 都要識揀語言**:`targetLanguage` 由一個 `{zh, "zh-Hans", fr, es}` 對照 object 揀,冇對應就 fallback English——呢個係 whitelist 對照,唔係直接將 `lang` 塞落 prompt(避免 prompt injection)。

---

## 13. Kid Ledger(`kid` template)

一個俾小朋友用嘅「儲蓄 vault」模式,同其他四個 template 嗰種「月結、分帳」邏輯完全冇關係——`Ledger` component 一見 `ledger.template === "kid"` 就即刻 return `<KidLedgerDashboard>`,一個獨立成頁嘅 component,唔會行到底下嗰堆 month calendar/settle-up/budget 嘅 render code。

- **Earn/spend 記帳**:冇整多一張表,直接用返 `expenses` 呢張表,加咗一個 `kind` 欄(`'spend'`(default)/`'earn'`,migration 016)。其他 template 由頭到尾唔會寫 `'earn'`,係加法,冇改到現有行為。
- **6 個 emoji 類別**(Chores🧹/Snacks🍦/Toys🧸/Games🎮/Gifts🎁/Allowance💰)其實就係 `db.TEMPLATES.kid` 嗰 6 個 category——同其他 template 一樣用返 `categories` 表,`kind` 先至決定係賺定使,類別本身冇分「賺嘅類別」定「使嘅類別」。撳「Earned Money」定「Bought Something」淨係決定會寫 `kind` 做邊個,兩個掣開返嗰個 tile grid 一樣。
- **Treasure Vault 金額** = 成個 ledger 歷史所有 `expenses` 加埋(earn 做 `+`,spend 做 `-`),**唔係月結**(冇 month selector,`KidLedgerDashboard` 完全唔理 `month`)。
- **Wishlist goal**:新表 `wishlist_goals`(migration 016),`ledger_id` 有 `unique` constraint,即係一本 kid ledger 淨係得一個目標,設定新嘅就直接覆蓋(冇歷史記錄)。撳個 progress bar 就開返 `KidGoalEditor` 改名/改金額。
- **HeaderMenu 淨係得 Home/Settings/Sign out**——冇 Budget/Reports/Manage members/Currency(kid template 四個 flag 全部 false,呢啲項目本身就唔會 render)。
- **顏色故意唔跟 `--accent`/dark mode**:`KID_PURPLE`/`KID_GREEN`/`KID_ORANGE`/`KID_YELLOW` 係寫死嘅 hex,唔係 `var(--xxx)`——呢個 dashboard 要睇落係獨立、鮮艷嘅嘢,唔係大人帳簿嗰套配色嘅變奏。
- **必踩坑,已修好**:一開始 `Ledger` 嘅 `refresh()` 對**所有** template 都 unconditional 咁 fetch `wishlist_goals`——`kid` template 先有嘅嘢,但因為冇擋住,test 出嚟**成個 household ledger 直接爆晒**(`Couldn't reach the ledger`,支出全部消失)。而家改咗做 `ledger.template === "kid" ? db.fetchWishlistGoal(...) : Promise.resolve(null)`,四個舊 template 完全唔會掂到嗰張表。

---

## 14. Notification Centre + Reminders

一路加咗四層,由手動、一次性,加到自動、可 toggle、唔理 category——睇落複雜,但邏輯係逐層疊加,同一張 `notifications` 表撐晒。

### 14a. Bell + 手動 cancellation reminder(migration 017)

- 新表 `notifications`(`ledger_id`、`expense_id` 或 `recurring_rule_id`(兩個都 nullable + unique,用嚟分係邊種 reminder,冇加多一個 `type` 欄)、`title`、`remind_at`、`read`)。一個全域(唔跟單一帳簿)嘅 Bell component,喺 picker 同每個 template 嘅 header 都會出現。
- **邊度會有 reminder**:Add/Edit Expense 表格,揀嘅 category 個名(`catName(c)`)一係 `"Subscriptions"`,就會多出一個「Cancellation Reminder」Field——按名嚟判斷,唔係按 template,所以邊個 template 有個叫「Subscriptions」嘅類別(seed 定自己改名都好)都會觸發。**呢個係四種 reminder 入面淨係得嘅一種仲係靠 category 名判斷**(見 14d,recurring 嗰種已經撇除咗呢個判斷)。
- **Toggle 一開,`reminderDate` 自動填 `billing date - 3 日`**,但淨係喺 off→on 嗰下先填一次——之後你自己改咗個日期,唔會因為改咗 billing date 就俾佢靜雞雞蓋返轉頭。
- **一個 expense 淨係得一個 reminder**:`db.upsertReminderNotification()` 用 `onConflict: expense_id`,再 save 一次就係覆蓋。撳走 toggle,或者 category 改咗做第樣,`Ledger.upsertExpense()` 就會 `deleteReminderNotification()`。
- **編輯緊嘅 expense 點知自己有冇 reminder**:`expenses` 表冇 `hasReminder`/`reminderDate` 呢兩個欄,`Ledger` 用 `db.fetchLedgerReminders(ledgerId)` 攞成個 ledger 嘅 reminder(用 `expense_id` 做 key 嘅 Map,**冇 due 唔 due 嘅篩選**),再用 `existingReminder` prop 傳落 `ExpenseForm` 補返落個 draft 度。呢一步唔做嘅話,打開一個已經有 reminder 嘅 subscription,toggle 會預設 off,一撳 Save 就會靜雞雞刪咗個原本嘅 reminder。
- **Bell 淨係顯示「到咗嘅」**:`db.fetchNotifications()` 有 `remind_at <= today` 嘅篩選——冇到嘅 reminder 編輯嗰陣照樣睇到個 toggle/日期,但唔會喺 bell 度出現同計入 unread count,因為冇跟排程 job,「到咗未」淨係前端攞返嚟嗰下同今日比較,同 `generateDueRecurring` 果套一樣土炮。
- **Mark as read vs Dismiss**:前者淨係 flip `read`,個 item 留喺個 list;後者係真係 delete 行。「Mark all as read」淨係傳緊喺畫面度嗰批 unread 嘅 id,唔係盲目 update 全部行。
- **必踩坑,已修好**:`fetchLedgerReminders` 一開始都係加落 `refresh()` 嘅 `Promise.all`,但呢次冇得好似 `wishlist_goals` 咁淨係 kid template 先 fetch(subscription reminder 邊個 template 都用得),所以 migration 017 行之前**四個舊 template 全部一齊爆**——呢個係預咗嘅、冇得避嘅代價,行完 migration 就冇事。

### 14b. Manage Reminders(Settings 入面)

- 同 Bell 一樣全域,睇晒**全部**reminder(唔止「到咗」嗰啲)。手動(`expense_id`)嗰啲可以改 `remind_at`/刪走;自動(下面 14c/14d,`recurring_rule_id`)嗰啲淨係顯示,冇編輯/刪除掣(見 14c 解釋原因)。
- **必踩坑,已修好**:`fetchAllReminders()` 一開始淨係 `.not("expense_id", "is", null)`,將全部 `recurring_rule_id`-anchor 嘅 reminder 篩走晒——測試嗰陣 Bell 明明有嘢,Manage Reminders 度就話「No reminders set.」。而家改咗做 `expense_id` 或 `recurring_rule_id` 隨便一個唔係 null 就算。
- **必踩坑,已修好**:`subscribeNotifications` 一開始用返同一個寫死嘅 channel 名,跟 `subscribeLedger`/`subscribeLedgerList` 嗰種「成個 app 淨係得一個呼叫者」唔同——Bell 成日都掛住,一旦「Manage reminders」都同時開住,第二個 `.channel(同名).subscribe()` 就會即刻拋 `cannot add postgres_changes callbacks... after subscribe()`,成個 app 冧晒(冇 error boundary,即刻變返白版)。而家 channel 名加咗個 random suffix,每次 call 都係獨立一個,幾多個同時訂閱都得。**如果之後想再加一個新嘅 `notifications` 訂閱源,唔使諗呢個問題,呢個 fix 已經係通用嘅。**

### 14c. 自動「即將扣款」提醒(migration 018,`recurring_rule_id`)

- 同 14a 嗰個手動 cancellation reminder獨立嘅第二種 reminder——每條符合條件嘅 recurring rule 自動出,唔使逐個 expense 咁樣手動 toggle。
- **點計「下次」**:同 `RecurringPanel` 顯示嘅「Next due」一樣條數(`last_generated_date ? nextOccurrence(...) : start_date`),`db.syncUpcomingChargeReminders()` 喺 `Ledger.refresh()` 入面同 `generateDueRecurring` 一齊跑(`addDays` 喺 `src/lib/recurring.js`,`db.js`/`BudgetApp.jsx` 兩邊都 import 返嚟用)。
- **唔會將已讀變返做未讀**:淨係當計出嚟嘅「下次」日期同上次記錄嘅**唔一樣**(即係 rule 行咗去下一個 cycle)先至 upsert(順便將 `read` 重設做 false)——如果日期冇變,乜都唔做。
- **Manage Reminders 度改唔到、刪唔到**:因為每次 refresh 都會重新算「下次」,你手動改嘅日期/刪走嘅行,落次 refresh 就會俾佢覆蓋/整返出嚟——所以呢類 reminder 喺 Manage Reminders 度淨係顯示(日期 + 一句「Auto-managed」提示),真正想停就要去該條 recurring rule 度剔走個 toggle(見 14d),或者撳個 rule 自己嘅刪除掣(**recurring rule 本身係有刪除掣㗎**,唔淨係得 pause)。

### 14d. Recurring rule 自己嘅 reminder toggle + 可調日數(migration 019)

- **新欄**:`recurring_rules.has_reminder`(boolean,預設 `true`)、`recurring_rules.reminder_lead_days`(int,預設 `2`,check > 0)。
- **UI 位置**:`RecurringForm` 入面「Upcoming Charge Reminder」呢個 Field,擺喺同 ExpenseForm 嘅 cancellation reminder toggle 一樣嘅位置——Category 之後,Who paid/Split 之前,入面係一個 checkbox + 一個「N days before」數字輸入(唔係好似 ExpenseForm 嗰種絕對日期,因為 recurring 冇一個固定日期,淨係得「早幾多日」呢個相對數)。
- `syncUpcomingChargeReminders` 讀返呢兩個欄,唔再係寫死 `addDays(next, -2)`;notification 個 title 都跟住動態(`upcomingChargeTitle` 有 `{days}` placeholder)。
- **必踩坑,已修好**:`toRowRule()` 一改咗就**無條件**幫所有 recurring rule(唔止 Subscriptions 嗰啲)加返呢兩個欄落去 update/insert 嘅 payload——即係話行 migration 019 之前,連 Household 個「Rent」呢類完全同 reminder 冇關嘅 rule,一撳 Save 都會因為個欄唔存在而失敗。
- **順手執咗嘅第二個舊 bug**:`RecurringPanel` 撞見 `editing !== null` 就會 `return <RecurringForm ...>`,即係完全冚蓋自己個 render(包括自己嗰句 `{err && ...}`)——所以之前如果 save 失敗,個 form 會乜反應都冇咁企喺度,錯誤訊息永遠冇機會顯示。而家 `RecurringForm` 自己攞埋一份 `err` state,`RecurringPanel.save()` catch 完之後會 `throw` 返出去畀 `RecurringForm.submit()` 收,先至有得喺個 form 度直接顯示個錯誤。

### 14e. 除返 Subscriptions category 嘅 gate(最終形態)

- 用戶問「如果個 category 用戶自己改咗名/串錯咗/用短寫(例如 SUB)點算?」——14c/14d 一開始都係靠 `catName(c) === "Subscriptions"` 逐隻字比對,改錯名就會令個 reminder 完全隱形。答案唔係整鬆條 matching 規則,而係**成個 category gate 直接刪咗**——`RecurringForm` 嘅「Upcoming Charge Reminder」對住邊個 category 都會顯示,`syncUpcomingChargeReminders` 都唔會再 fetch categories 嚟比對(少咗一個 query),淨係睇 `rule.has_reminder` 嚟決定。
- **`ExpenseForm` 個一次性 cancellation reminder(14a)冇改**:嗰個仍然係靠 category 名嚟判斷——原本 spec 就係咁寫,而且呢次用戶淨係話「all recurring expenses」,冇提到一次性嗰個 expense 表格。如果之後想連嗰邊都撇除 category gate,做法一樣(刪咗 `isSubscription` 嗰句判斷)。
- **現時心智模型**:recurring rule 嘅 upcoming-charge reminder,已經由「Subscriptions 專屬功能」變成「任何 recurring rule 都可以揀開唔開嘅一個選項」,同「Subscriptions」呢個字冧完全冇關係。`ExpenseForm` 嗰個就仲係名字綁定嘅。

---

## 15. Settings 頁重整

- **入口變化**:HeaderMenu 一開始有「Ledgers」呢一項帶你返去 picker,後尾用戶話唔識個名代表咩,改咗做「Home」(house icon)。「Saved shops」原本自己一粒 top-level menu item,而家收埋落 Settings 入面,同「Manage reminders」擺埋一齊——邏輯係:呢啲係「設定一次、少改」嘅嘢,唔應該同 Budget/Reports 呢啲成日撳嘅入口平排。
- **Accordion 化**:Language / Appearance / Accent colour 三樣本來係成頁攤晒出嚟嘅 block,而家同「Manage reminders」/「Saved shops」睇齊,變成一行 icon + 標題 + chevron 嘅收埋狀態,撳先展開(`AccordionRow` component,`openSection` state 控制邊個開住,一開一個自動收晒其他,唔係獨立 toggle)。Save/Cancel 邏輯冇變,淨係外層包裝變咗。
- Settings panel 依家有齊:Language、Appearance、Accent colour(呢三個 accordion)、Manage reminders、Saved shops(`onStores` 有先顯示,picker 頁冇呢粒)。

---

## 16. 未驗證 / 已知限制(交低俾下一個對話)

- `/api/scan-statement.js` 嘅 AI 讀 statement 路徑(需要真實相/PDF + 有效 Gemini key,呢邊環境驗唔到)。
- iOS Safari「Take Photo」**已實測確認冇消失**——accept 入面只要有 image MIME type,Safari 就會加返呢個選項,HTML 冇任何屬性可以保證控制到。功能上冇壞,已確認係無法用 code 解決嘅平台限制,唔再追。
- **呢個開發環境嘅 browser session 會不定時無啦啦登出**(`localStorage` 清晒),原因未查(唔係 code bug,單純環境/瀏覽器層面),遇到就要用戶自己重新登入先可以再肉眼驗證。
- `hasBudget` flag 淨係資料,冇 UI 邏輯掛住(YAGNI)。
- 一個一直冇追到底嘅 console error(`RecurringForm` 相關,一次過測試時出現,之後幾次刻意重現都失敗)——高機率係自動化測試嗰陣快速連續撳掣造成嘅 race condition,唔係代碼本身嘅 bug,但都未 100% 排除,如果之後見到 RecurringForm 有奇怪行為,呢個係第一個懷疑對象。
- Kid Ledger 未做:allowance 冇 recurring 版本(`hasRecurring: false`),冧刪唔到自己個 wishlist goal(淨係得覆蓋),冇 budget/reports 呢類嘢(YAGNI,「vault」概念本身同月結 budget 冧唔埋)。
