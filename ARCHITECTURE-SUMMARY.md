# 記賬 App 架構與需求摘要

> Household Budget App — Vite + React(JS,非 TS)+ Supabase + inline styles(無 CSS framework、無 Tailwind)。單一大檔 `src/BudgetApp.jsx`(UI 全部喺度)+ `src/lib/db.js`(資料層,row⇄app mapping 淨係喺呢度做)+ `src/lib/settle.js`/`csv.js`/`categorize.js`(pure、有 `*.test.js`)。呢份摘要供新對話接續開發用,睇完呢份文件就唔使再由頭 explore 個 codebase。

---

## 1. 帳本 Template 劃分與 Feature Flags

Template 值儲喺 `ledgers.template` 欄(`household` / `personal` / `travel` / `blank`)。「Family」= 呢個 app 原有嘅 `household`(同一概念,冇加新 key)。

**Feature flags**(`src/lib/db.js` → `TEMPLATE_FEATURES` + `featuresFor(template)`):

| Template(顯示名) | `showSplit` | `hasRecurring` | `hasBudget` | `hasCurrency` |
|---|---|---|---|---|
| `household`(Family) | ✅ | ✅ | ✅ | ❌ |
| `personal`(Personal) | ❌ | ✅ | ✅ | ❌ |
| `travel`(Travel) | ✅ | ❌ | ✅ | ✅ |
| `blank`(Blank) | ✅ | ✅ | ✅ | ❌ |

前端 hook:`useLedgerFeatures(ledger)`(BudgetApp.jsx),內部包住 `db.featuresFor(ledger.template)`,`useMemo` cache。

各 template 有自己嘅預設分類(`db.TEMPLATES`),建帳簿時 seed 落 `categories` 表:
- **household**:Rent / Utilities / Household / Grocery / Food Delivery / Dine in / Entertainment
- **travel**:Flights / Accommodation / Food / Transport / Activities / Shopping / Other
- **personal**:Food / Transport / Shopping / Health / Subscriptions / Other
- **blank**:冇預設分類

**成員(`ledger_members`)已經冇晒 auto-seed**:`createLedger()`(db.js)以前會幫每本新帳簿塞返「Tommy」「Wing」兩個成員,而家**完全刪除咗**——任何 template 開新帳簿一律零成員,要自己去「Edit members」加。**例外**:`!showSplit` 嘅 template(即係 Personal)由於 UI 完全隱藏晒「Who paid?」/「Edit members」入口(見下),冇呢個入口就冇辦法加成員,所以 `createLedger()` 對呢類 template 會自動幫 ledger 擁有者本人加一個成員(名讀 `app_user.name`,攞唔到就 fallback email,再攞唔到就叫「Me」)。

---

## 2. 各 Template 細節規則

### `showSplit = false`(Personal)
- **Add Expense 表格**:完全隱藏「Who paid?」同「Split」兩個 section(唔係 disable,係唔 render)。付款人靜靜雞 default 做 `members[0]`,`split` 強制 `"personal"`,`sharedWith: []`。
- **Header menu**:隱藏「Manage members」(邏輯:Personal = 得你一個人,冇第二人要畀權限)。
- **Batch import 預覽表**:同樣隱藏「Default card owner」selector 同每行嘅「Paid by」dropdown;每行 silently 用 `members[0]` 做付款人,`split: "personal"`。

### `hasRecurring = false`(Travel)
- **Header menu**:隱藏「Recurring expenses」呢一項(`onRecurring={features.hasRecurring ? ... : undefined}`)。

### `hasCurrency = true`(Travel 專屬)— 見第 4 節

### `hasBudget`
- 三個 template 而家全部係 `true`,**未有任何 UI 根據呢個 flag 隱藏嘢**(避免死代碼)。

### 邊個角色可以做咩(RBAC,同 template 冇關,但常同時出現)
- Owner / Editor / Viewer 三個角色,menu **對三者顯示一樣**(唔再按角色隱藏掣)。
- 撳落 owner-only 動作(delete ledger、invite、change role、remove member、revoke invite)先至檢查權限,冇權會彈 `ownerOnlyErr` 訊息,唔會靜靜雞冇反應。
- 所有刪除確認(ledger / expense / member / recurring rule)已經由 `window.confirm()` 改用自訂 `ConfirmDialog` component(因為 native confirm 有「Prevent this page from creating additional dialogs」呢個瀏覽器陷阱,一中就全部刪除掣好似壞晒)。
- Auth/roster 走嘅係 `app_user` + `ledger_role` + `ledger_invite`(migration 008/009),同 bill-split 用嘅 `ledger_members` 係**兩個完全獨立嘅概念**(RBAC = 邊個睇到/改到呢本帳,ledger_members = 邊個要夾份)。

---

## 3. 缺缺(既有,未變)Reports panel 圖表寫法

**冇用 Recharts 或者任何 chart library**——手寫 SVG donut + div-bar,冇加新 dependency。

`MonthlyReport` component 現時結構(由頂至尾):
1. Total spending 卡(當月總額)。
2. **Category Pie Chart**:手寫 SVG donut,中心顯示總金額。
3. **Category breakdown**:唔再係「色點 + 名」嘅細行,而係**每個分類自己一張卡**(白底/CARD 底、border、圓角),左邊一個色底圓形 icon(emoji,見第 8 節嘅 `categoryIcon()`),中間名、右邊 % 同金額,**成張卡都撳得**(drill-down 去 `CategoryExpenseList`,唔止個名先撳得)。
4. **Select month / Compare to 雙 dropdown**:由 panel 最頂**搬咗去 bar chart 之前**,順便取代原本嗰句靜態「This month vs {month}」標題文字——dropdown 本身已經講緊同一件事,唔使再多一句標題。Select month 依然係控制成個 panel(pie/breakdown/total 全部跟佢),唔止 bar chart。
5. **Month-over-Month Bar Chart**:逐個分類一行,兩條疊住嘅水平 bar(今月 accent 色,compare 月灰),右側 delta(`+$X (+Y%)` / `-$X (-Y%)` / `New this month` / `Gone this month` / `No change`)。
6. 兩個月嘅分類總額經同一個 `categoryTotalsFor()` function 計(而家仲會夾埋 `category` raw object 一齊 return,俾 icon lookup 用),pie 同 bar 唔會有數對唔上。

---

## 4. 帳本貨幣(Ledger currency,Travel 專屬)

- `ledgers.currency` 欄(migration 014),3 字母 ISO code,預設 `CAD`。**得 Travel template**(`hasCurrency`)先可以改。
- 改嘅地方:入到帳本之後,☰ menu 有一行「Currency」,揀完即時生效(`db.updateLedger` + 更新 App 揸住嗰個 `ledger` state,唔使 refetch)。
- **`activeCurrency`**(BudgetApp.jsx 頂部一個 module-level `let`)—— 淨係一個 `<Ledger>` 會同時掛住,所以用 module 變數而唔係逐層 thread prop,`Ledger` 一 render 就即刻設定,子components 全部靠 `money()`/`currencySymbol()` 讀返呢個值。
- 金額輸入框(Amount 一類)嘅 `$` 前綴一律用 `currencySymbol(activeCurrency)`,唔再係寫死嘅 `$`。

---

## 5. 主題系統(Light/Dark)同 Settings 頁

- **Settings** 係新加嘅一個 panel(`SettingsPanel`),由 ☰ menu 入面「Settings」呢一項開;原本掛喺 menu 度嘅 EN/繁中 language toggle **搬咗入去** Settings(menu 度唔再有語言選項)。
- **Theme**:`localStorage["theme"]`,第一次開冇存過就跟 `prefers-color-scheme`,之後就記住你揀嘅嗰個,唔會再跟 OS 變。套用方式:`document.documentElement.setAttribute("data-theme", theme)`,`src/index.css` 有 `:root[data-theme="light"|"dark"]` 兩組 CSS custom properties(`--ink` `--sub` `--line` `--paper` `--card` `--ok-*` `--bad-*` `--track` `--muted-bg` `--danger` `--warn`)。
- BudgetApp.jsx 頂部啲顏色常數(`INK` `SUB` `LINE` `PAPER` `CARD` `OK_BG` `OK_INK` … )全部係 `"var(--xxx)"` 字串,唔係寫死 hex——所以淨係加一個 `data-theme` attribute,成個 app 嘅 inline style 就跟晒轉,唔使逐個 component 改。
- **一定要記住嘅陷阱**:一個 tint(例如 `OK_BG`)背景,永遠要配返佢自己嗰組 ink(`OK_INK`),唔可以用 `INK`——早前試過寫死淺色主題嗰對 tint,dark mode 就變咗「近乎白色字」印喺「淺青色底」,睇唔到。

---

## 6. Accent 主題色(Settings → Accent colour)

- 使用者可以自己揀成個 app 嘅主色(原本淨係寫死 teal)。已試過三輪先定案:
  1. 第一輪:8 隻深色 dusty/Morandi 色。
  2. 第二輪:加咗幾隻 pastel 淺色 —— 之後發現**淺色會令白字睇唔到**,加咗 `accentInkFor(hex)`(WCAG relative luminance,閾值 `0.179`)自動揀返白字定深字。
  3. 第三輪:用戶指出淺色喺「唔經 ink、直接做文字/邊框色」嘅場合(例如未選中嘅 pill 邊框、連結文字)一樣會洗色——**淺色options 全部移除**,`ACCENT_COLORS`(BudgetApp.jsx)而家 18 隻,全部 luminance ≤ 0.179,保證企喺白底都夠 4.5:1。`accentInkFor` 依然留住做 safety net,唔係因為而家個 list 需要淺色分支。
- 機制同 theme 一樣:`document.documentElement.style.setProperty("--accent", accent)`,`TEAL` 呢個常數而家係 `"var(--accent)"`(改名歷史包袱,值已經唔一定係 teal)。
- **預設色 = 灰(`#656565`,即 `ACCENT_COLORS[0]`)**,`index.css` 嘅 `--accent` fallback 同步咗。
- **儲存方式(2026-07 改)**:accent **跟帳號走**,存喺 `app_user.accent`(migration 015)。`localStorage["accent"]` 淨係一個 cache,俾 app 開機即刻上色,唔使等 profile fetch 返嚟先閃一下預設色;登入之後 `db.fetchMyAccent()` 覆蓋佢(所以換部機/換瀏覽器登入都會見返自己嗰隻色)。
- **揀色 ≠ 儲存**:`changeAccent` 而家淨係 preview(即場重畫成個 app,唔寫任何嘢),`SettingsPanel` 自己揸住「Save colour / Saved」掣先真係寫入(先寫 DB,成功先更新 localStorage cache),中途唔 save 就撳 X/背景關閉會自動 revert 返已儲存嗰隻。語言同 light/dark 就冇呢個 draft 步驟,照舊撳即生效。
- **Settle-up / shared 呢一類「OK」tint**(`--ok-bg` 等)而家**跟住 accent 一齊變**,唔再係寫死 teal——`okTintsFor(accent, theme)` 用 `mix()`(簡單 RGB channel blend,唔係 hex library)將 accent 撈落白色/深色底,即場算出 bg/ink/line/strong 四個值,喺 accent 或 theme 一變就重新 set 做 inline style。「你欠幾多」嗰句紅色/橙色(`DANGER`/`WARN`)保持寫死,唔跟 accent 變(語意色,唔係品牌色)。

---

## 7. 月曆 View(Ledger 頁面頂部,新增)

原本頁面由上至下:標題 → Spent 卡 → Settle-up bar → Add expense → list。而家:

1. **`MonthCalendar`** 組件擺**成頁最頂**(标题下面即刻),7 欄月曆格仔(Monday-first,weekday label 用 `toLocaleDateString(...,{weekday:"short"})` 自動雙語,唔使寫死翻譯)。
   - 每格:日期數字 + (如果嗰日有支出)`money()` 顯示嗰日總額。
   - **今日**:淺色 badge 圈住個數字(`OK_BG`/`OK_INK`)。
   - **撳中嗰日(selected)**:成粒格填實 accent 色(`TEAL`/`ACCENT_INK`),同今日嘅badge 分得開。
   - **有支出嘅日**:淺色圓圈(固定透明度,`color-mix(in srgb, ${WARN} 12%, transparent)`),**唔跟金額深淺變**(試過做 heatmap 深淺,用戶話改返做統一淺色)。
   - 撳一日 = **淨係篩選底下個 list**,月結算(settle-up)、總額呢啲數**繼續睇成個月**,唔會因為揀咗一日而變(`Ledger` 用 `visibleRows = selectedDay ? rows.filter(...) : rows`)。撳多次同一日或者撳「Show all」清空。轉月會自動清返 selectedDay。
2. **Calendar 底部一個 footer bar**(合併咗原本獨立嘅「Spent in {month}」卡 + 「Settle up」bar 兩個嘢):
   - 左:「Total Spending」+ 金額。
   - 中:「Balance」(呢個月啲分類預算加埋 - 已使 = 幾多,冇 budget 就顯示「—」)。
   - 右:「Settle up ›」——純粹一個入口掣,唔顯示邊個欠邊個,撳落先開返 `SettlementDetails` 睇詳情。
   - 呢三樣本身喺唔同時間分開加嘅,而家全部一齊擠喺一行(電話闊度都試過冇問題)。
3. Add Expense 表格嘅日期,而家會**跟返月曆揀嗰日**(`ExpenseForm` 加咗 `defaultDate` prop,有揀就用嗰日,冇揀先 fallback 返月中 15 號)。

---

## 8. 分類 Emoji Icon

- `CATEGORY_ICONS`(BudgetApp.jsx):一個 `{分類英文名小寫: emoji}` 嘅 map,cover 晒 `db.TEMPLATES` 入面全部分類名(Rent🏠、Grocery🛒、Utilities💡、Food Delivery🛵、Dine in🍽️、Entertainment🎬、Flights✈️、Accommodation🏨、Food🍔、Transport🚌、Activities🎡、Shopping🛍️、Health💊、Subscriptions📱、Household🧹、Other🏷️),自訂/改名分類冇對應就 fallback 🏷️,冇分類(Uncategorised)用 ❔。
- 因為分類名本身係 language-neutral(`catName()` 一早就係咁設計),呢個 lookup 唔使分 EN/ZH 兩份。
- 用喺兩個地方:Expense list 每行嘅分類 badge 入面(icon 就喺個 pill 入面,同個 pill 一樣大細/顏色,唔係獨立一粒喺最左),同 Reports 分類卡嘅色底圓形 icon。

---

## 9. Split 相關細節

- **`SplitMemberPicker`**:Add expense 表格 + 定期支出表格,兩個地方以前各自有一份一模一樣嘅「揀邊個人夾」checkbox list,而家共用一個 component。加咗一行「Everyone」(全揀先勾,揀晒自動勾,唔係全揀就唔勾),擺喺成個 list 最頂,同底下逐個人隔一條線。
- Batch import modal 嘅「Edit members」掣以前撳落會**匿咗喺 batch modal 後面**(睇唔到)——成因:全部 Overlay 都用同一個寫死 `z-index:50`,邊個喺 DOM 後面邊個就贏。改法:`<BatchImportModal>` 喺 `<MemberManager>` 之前 render(唔係邏輯本身有問題,純粹 DOM 次序)。**呢個係一個通用陷阱**:之後如果再喺邊個 modal 入面開多一層 modal,記得檢查邊個要喺 DOM 後面。
- Add expense / Batch import,如果嗰本帳冇成員/冇分類,會有紅色字提示(「No members yet」/「No categories yet」),唔可撳。

---

## 10. Budget Panel:睇 vs 編輯分開咗

- **`BudgetPanel`**(主 Budget 頁)而家**完全 read-only**:「All categories」總卡 + 逐個分類卡,金額全部係文字顯示(直接讀 `budgets` map,唔再靠本地 draft state),每張卡都有 bar(有 pace tick,見下)+「{spent} Spent」/「{left} Left / Over」。
- 總卡右上有個實色 pill「Edit budget」badge,撳先開 **`EditBudgetPanel`**(新獨立頁面)——淨係呢頁先有得改:逐個分類一個 input 填數字,底部先有「Save budgets」掣,save 完自動關返自己、返去(已更新嘅)read-only 頁。
- **Pace tick**:`BudgetBar` 加咗個 `pace` prop(0–100,淨係當睇緊「今個月」先計,過去/未來月冇意思),bar 上面一條幼線,表示「今日行到成個月幾多 %」,同支出/預算嘅比例完全冇關,純粹一個「進度參考線」。

---

## 11. 批量 Import 三步式預覽流(既有,未變)

**入口**:Add Expense 表格入面兩個掣:
- **Scan receipt**(相機,`capture="environment"`):即場影相,單一收據,連 line items 拆分——冇變。
- **Upload receipt**(檔案):一律 batch 模式。`accept="image/jpeg,image/png,.jpg,.jpeg,.png,.heic,.pdf,.csv,text/csv"`。

**三步流程**:
1. **解析**(揀檔案即刻做):`.csv`/`text/csv` → 本機免費解析(`src/lib/csv.js` 嘅 `parseCsvText`);其他(screenshot/PDF)→ `/api/scan-statement.js`(Gemini vision)。
2. **預覽表**(`BatchImportModal`):逐行日期/描述/金額/分類(`guessCategoryId()` keyword 估分類)/Paid by(`showSplit=true` 先顯示);「Default card owner」bulk 更新未手動改過嗰啲行(`paidByTouched` flag)。
3. **Confirm & Import**:逐行 sequential call `db.importExpensesBatch()`,底層同手動加一筆用返同一個 `insertExpense()`。部分失敗淨係留低失敗嗰幾行畀你再試。

---

## 12a. Kid Ledger(新 template,`kid`)

一個俾小朋友用嘅「儲蓄 vault」模式,同其他四個 template(household/travel/personal/blank)嗰種「月結、分帳」邏輯完全冇關係——`Ledger` component 一見 `ledger.template === "kid"` 就即刻 return `<KidLedgerDashboard>`,一個獨立成頁嘅 component,唔會行到底下嗰堆 month calendar/settle-up/budget 嘅 render code。

- **Earn/spend 記帳**:冇整多一張表,直接用返 `expenses` 呢張表,新加咗一個 `kind` 欄(`'spend'`(default)/`'earn'`,migration 016)。`db.js` 嘅 `toAppExpense`/`toRowExpense` 加返呢個欄,其他 template 由頭到尾唔會寫 `'earn'`,所以係加法,冇改到現有行為。
- **6 個 emoji 類別**(Chores🧹/Snacks🍦/Toys🧸/Games🎮/Gifts🎁/Allowance💰)其實就係 `db.TEMPLATES.kid` 嗰 6 個 category——同其他 template 一樣用返 `categories` 表,`kind` 先至決定係賺定使,類別本身冇分「賺嘅類別」定「使嘅類別」。撳「Earned Money」定「Bought Something」淨係決定會寫 `kind` 做邊個,兩個掣開返嗰個 tile grid 一樣。
- **Treasure Vault 金額** = 成個 ledger 歷史所有 `expenses` 加埋(earn 做 `+`,spend 做 `-`),**唔係月結**(冇 month selector,`KidLedgerDashboard` 完全唔理 `month`)。
- **Wishlist goal**:新表 `wishlist_goals`(migration 016),`ledger_id` 有 `unique` constraint,即係一本 kid ledger 淨係得一個目標,設定新嘅就直接覆蓋(冇歷史記錄)。撳個 progress bar 就開返 `KidGoalEditor` 改名/改金額。
- **HeaderMenu 淨係得 Home/Settings/Sign out**——冇 Budget/Reports/Manage members/Currency(kid template 嘅 `TEMPLATE_FEATURES` 四個 flag 全部 false,呢啲項目本身就唔會 render)。
- **顏色故意唔跟 `--accent`/dark mode**:`KID_PURPLE`/`KID_GREEN`/`KID_ORANGE`/`KID_YELLOW` 係寫死嘅 hex,唔係 `var(--xxx)`——呢個 dashboard 要睇落係獨立、鮮艷嘅嘢,唔係大人帳簿嗰套配色嘅變奏。
- **必踩坑,已修好**:一開始 `Ledger` 嘅 `refresh()` 對**所有** template 都 unconditional 咁 fetch `wishlist_goals`——`kid` template 先有嘅嘢,但因為冇擋住,test 出嚟**成個 household ledger 直接爆晒**(`Couldn't reach the ledger`,支出全部消失)。而家改咗做 `ledger.template === "kid" ? db.fetchWishlistGoal(...) : Promise.resolve(null)`,四個舊 template 完全唔會掂到嗰張表。
- **`ledgers.template` 呢欄有自己嘅 DB check constraint**(migration 005,同 `db.js` 嘅 `TEMPLATE_FEATURES` 係兩回事)——加 `kid` 呢個 template 一定要連埋 migration 016 嗰句 `alter table ledgers ... check (template in (...,'kid',...))`,唔係就撞板(insert 400)。之後如果再加第 6 個 template,記得呢個 constraint 又要改多次。

---

## 12b. Notification Centre + 訂閱取消提醒(migration 017)

一個新表 `notifications`,**跨全部 template**(唔係淨係 kid ledger 嗰啲),同埋一個全域(唔跟單一帳簿)嘅 Bell component。

- **邊度會有 reminder**:Add/Edit Expense 表格,揀嘅 category 個名(`catName(c)`)一係 `"Subscriptions"`,就會多出一個「Cancellation Reminder」Field——係按名嚟判斷,唔係按 template,所以邊個 template 有個叫「Subscriptions」嘅類別(seed 定自己改名都好)都會觸發,唔淨係 `personal` template 果 7 個預設類別入面嗰個。
- **Toggle 一開,`reminderDate` 自動填 `billing date - 3 日`**(`addDays(prev.date, -3)`),但淨係喺 off→on 嗰下先填一次——之後你自己改咗個日期,唔會因為改咗 billing date 就俾佢靜雞雞蓋返轉頭。
- **一個 expense 淨係得一個 reminder**:`notifications.expense_id` 有 `unique` constraint,`db.upsertReminderNotification()` 用 `onConflict: expense_id` 嚟做,再 save 一次就係覆蓋,唔會愈嚟愈多重複行。撳走 toggle,或者 category 改咗做第樣,`Ledger.upsertExpense()` 就會 `deleteReminderNotification()`。
- **編輯緊嘅 expense 點知自己有冇 reminder**:`expenses` 表冇呢兩個欄(`hasReminder`/`reminderDate`),`Ledger` 用 `db.fetchLedgerReminders(ledgerId)` 攞成個 ledger 嘅 reminder(用 `expense_id` 做 key 嘅 Map,**冇 due 唔 due 嘅篩選**),再用 `existingReminder` prop 傳落 `ExpenseForm` 補返落個 draft 度。呢一步唔做嘅話,打開一個已經有 reminder 嘅 subscription,toggle 會預設off,一撳 Save 就會靜雞雞刪咗個原本嘅 reminder——已經確認過真係會咁,而家補晒。
- **Bell 淨係顯示「到咗嘅」**:`db.fetchNotifications()` 有 `remind_at <= today` 嘅篩選——冇到嘅 reminder(例如 billing date 喺下個月)喺編輯嗰陣照樣睇到個 toggle/日期,但唔會喺 bell 度出現同計入 unread count,因為冇跟排程 job,「到咗未」淨係前端攞返嚟嗰下同今日比較,同 `generateDueRecurring` 果套一樣土炮。
- **Mark as read vs Dismiss**:前者淨係 flip `read`,個 item 留喺個 list(冇咗個「Mark as read」掣同個 unread 樣式);後者係真係 delete 行,成個消失。「Mark all as read」淨係傳緊喺畫面度嗰批 unread 嘅 id,唔係盲目 update read=false 嘅全部行(咁樣先唔會將未到期嘅 reminder 都錯手標成已讀)。
- **Bell 係全域,唔綁單一帳簿**:同 `fetchLedgers()` 一樣淨係靠 RLS 窄返去邊個帳簿你有得睇,`db.js` 冇傳任何 `ledgerId`——一個 bell 就跟晒你成個帳號嘅所有帳簿。
- **必踩坑,已修好**:同 Kid Ledger 嗰次一樣嘅陷阱又踩多次——`fetchLedgerReminders` 一開始都係加落 `refresh()` 嘅 `Promise.all`,但呢次冇得好似 `wishlist_goals` 咁淨係 kid template 先 fetch(subscription reminder 邊個 template 都用得),所以 migration 017 行之前**四個舊 template 全部一齊爆**(`Could not find the table 'public.notifications'`)——呢個係預咗嘅、冇得避嘅代價(呢個 feature 本身就要跨晒所有 template),行完 migration 就冇事。
- **Settings → Manage reminders**:同 Bell 一樣全域(唔跟單一帳簿),睇晒同改到**全部**reminder(唔止「到咗」嗰啲),兩個掣:改個 `remind_at`(`db.updateNotificationDate`)、刪走(重用返 `dismissNotification`)。
- **第二個必踩坑,已修好**:`subscribeNotifications` 一開始用返同一個寫死嘅 channel 名(`"notifications-changes"`),跟 `subscribeLedger`/`subscribeLedgerList` 嗰種「成個 app 淨係得一個呼叫者」唔同——Bell 成日都掛住,一旦「Manage reminders」都同時開住,第二個 `.channel(同名).subscribe()` 就會即刻拋 `cannot add postgres_changes callbacks... after subscribe()`,成個 app 冧晒(冇 error boundary,即刻變返白版)。而家 channel 名加咗個 random suffix,每次 call 都係獨立一個,幾多個同時訂閱都得。**如果之後想再加一個新嘅 `notifications` 訂閱源,唔使諗呢個問題,呢個 fix 已經係通用嘅。**

---

## 12. 未驗證 / 已知限制(交低俾下一個對話)

- `/api/scan-statement.js` 嘅 AI 讀 statement 路徑(需要真實相/PDF + 有效 Gemini key,呢邊環境驗唔到)。
- iOS Safari「Take Photo」**已實測確認冇消失**——accept 入面只要有 image MIME type,Safari 就會加返呢個選項,HTML 冇任何屬性可以保證控制到。功能上冇壞,已確認係無法用 code 解決嘅平台限制,唔再追。
- **呢個開發環境嘅 browser session 會不定時無啦啦登出**(`localStorage` 清晒),原因未查(唔係 code bug,單純環境/瀏覽器層面),遇到就要用戶自己重新登入先可以再肉眼驗證。
- `hasBudget` flag 而家淨係資料,冇 UI 邏輯掛住(YAGNI,四個 template 而家個 value 一樣)。
- Accent 而家跟帳號(見第 6 節),但 **`migrations/015-user-accent.sql` 要喺 Supabase SQL editor 行過一次**,唔行嘅話撳 Save 會出「Couldn't save your colour: Could not find the 'accent' column」,fallback 行為 = 淨係 preview,冇嘢寫得入去。Theme(light/dark)同語言就仲係純 `localStorage`,冇跟帳號。
