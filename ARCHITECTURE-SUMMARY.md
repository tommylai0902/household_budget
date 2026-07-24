# 記賬 App 架構與需求摘要

> Household Budget App — Vite + React (JS, 非 TS) + Supabase + inline styles(無 CSS framework、無 Tailwind)。呢份摘要供新對話接續開發用。

---

## 1. 帳本 Template 劃分與 Feature Flags

Template 值儲喺 `ledgers.template` 欄(`household` / `personal` / `travel` / `blank`)。「Family」= 呢個 app 原有嘅 `household`(同一概念,冇加新 key)。

**Feature flags**(`src/lib/db.js` → `TEMPLATE_FEATURES` + `featuresFor(template)`):

| Template(顯示名) | `showSplit` | `hasRecurring` | `hasBudget` |
|---|---|---|---|
| `household`(Family) | ✅ | ✅ | ✅ |
| `personal`(Personal) | ❌ | ✅ | ✅ |
| `travel`(Travel) | ✅ | ❌ | ✅ |
| `blank`(Blank) | ✅ | ✅ | ✅ |

前端 hook:`useLedgerFeatures(ledger)`(BudgetApp.jsx),內部包住 `db.featuresFor(ledger.template)`,`useMemo` cache。

各 template 有自己嘅預設分類(`db.TEMPLATES`),建帳簿時 seed 落 `categories` 表:
- **household**:Rent / Utilities / Household / Grocery / Food Delivery / Dine in / Entertainment
- **travel**:Flights / Accommodation / Food / Transport / Activities / Shopping / Other
- **personal**:Food / Transport / Shopping / Health / Subscriptions / Other
- **blank**:冇預設分類

---

## 2. 各 Template 細節規則

### `showSplit = false`(Personal)
- **Add Expense 表格**:完全隱藏「Who paid?」同「Split」兩個 section(唔係 disable,係唔 render)。付款人靜靜雞 default 做 `members[0]`,`split` 強制 `"personal"`,`sharedWith: []`。
- **Header menu**:隱藏「Manage members」(邏輯:Personal = 得你一個人,冇第二人要畀權限)。
- **Batch import 預覽表**:同樣隱藏「Default card owner」selector 同每行嘅「Paid by」dropdown;每行 silently 用 `members[0]` 做付款人,`split: "personal"`。

### `hasRecurring = false`(Travel)
- **Header menu**:隱藏「Recurring expenses」呢一項(`onRecurring={features.hasRecurring ? ... : undefined}`)。

### `hasBudget`
- 三個 template 而家全部係 `true`,**未有任何 UI 根據呢個 flag 隱藏嘢**(避免死代碼)。之前試過將 Budget 選單改名做「Trip budget」(Travel 專用),但**已 revert 返做「Budget」**——同其他 ledger 一致,冇特別命名。

### 邊個角色可以做咩(RBAC,同 template 冇關,但常同時出現)
- Owner / Editor / Viewer 三個角色,menu **對三者顯示一樣**(唔再按角色隱藏掣)。
- 撳落 owner-only 動作(delete ledger、invite、change role、remove member、revoke invite)先至檢查權限,冇權會彈 `ownerOnlyErr` 訊息,唔會靜靜雞冇反應。
- 所有刪除確認(ledger / expense / member / recurring rule)已經由 `window.confirm()` 改用自訂 `ConfirmDialog` component(因為 native confirm 有「Prevent this page from creating additional dialogs」呢個瀏覽器陷阱,一中就全部刪除掣好似壞晒)。

---

## 3. 圖表 Panel 布局(Reports / Monthly Report panel)

**冇用 Recharts 或者任何 chart library**——原本 spec 成日寫「React + Recharts」,但呢個 app 一直用手寫 SVG/div-bar,呢次都跟返呢個做法(唔加新 dependency)。

Panel 結構(`MonthlyReport` component):

1. **頂部雙 dropdown**:「Select month」(current)+「Compare to」(compare month),各自獨立揀,compare 預設揀 current 之前嗰個月。
2. **Category Pie Chart**:手寫 SVG donut,中心顯示總金額,底下列表(色點 + 名 + % + 金額),撳個名可以睇返嗰個分類嗰個月啲邊筆支出。
3. **Month-over-Month Bar Chart**(grouped bar,今個月 vs compare 月):
   - 逐個分類一行,兩條疊住嘅水平 bar(今月 teal,compare 月 `#94A3B8` 灰)。
   - 每行右側顯示 delta:`+$X (+Y%)` 紅色(加咗)/ `-$X (-Y%)` teal(少咗)/ `New this month` / `Gone this month` / `No change`。
   - 兩個月嘅分類總額經同一個 `categoryTotalsFor()` function 計,pie 同 bar 唔會有數對唔上嘅情況。

---

## 4. 批量 Import 三步式預覽流

**入口**:Add Expense 表格入面嘅兩個掣,而家做緊唔同嘢:
- **Scan receipt**(相機,`capture="environment"`):即場影相,單一收據,連 line items 拆分,填返呢個表格——**冇變**。
- **Upload receipt**(檔案):**一律 batch 模式**,唔會再入返單一表格。`accept="image/jpeg,image/png,.jpg,.jpeg,.png,.heic,.pdf,.csv,text/csv"`(用副檔名列表唔用 `image/*`,iOS Safari 通常會因此喺揀圖 sheet 隱藏「Take Photo」,唔保證每個 iOS 版本都咁)。

**三步流程**(冇獨立嘅「Import CSV」選單入口——已刪除,全部經 Upload 掣觸發):

1. **解析**(揀檔案嗰刻自動做,冇再有獨立「選檔案」畫面):
   - 檔案係 `.csv` / `text/csv` → 本機免費解析(`src/lib/csv.js` 嘅 `parseCsvText`,支援有/冇 header、MM/DD/YYYY 或 ISO 日期、quoted 欄位)。
   - 其他(screenshot / PDF)→ 送去 `/api/scan-statement.js`(新 serverless endpoint,同 `scan-receipt.js` 一樣嘅 auth/驗證寫法,Gemini vision 讀出 `{transactions: [{date, description, amount}]}`,唔含分類——刻意咁設計)。
2. **預覽表**(`BatchImportModal`,前身叫 `CsvImportModal`,而家冇晒自己嘅選檔案畫面,一定係帶住 `initialRows` 開嘅):
   - 逐行:日期(`<input type=date>`)、描述(text input)、金額(number input)、分類(native `<select>`,靠 `guessCategoryId()` keyword 比對**呢本帳簿真實存在嘅分類**估分類,估唔到就 Uncategorised——CSV 同 AI 嚟源共用同一個 `buildPreviewRows()` function,唔會兩套邏輯)、Paid by(`showSplit=true` 先顯示)。
   - **Default card owner / Paid by** selector(頂部,`showSplit=true` 先顯示):撳一下會 bulk 更新晒未手動改過嗰啲行嘅 Paid by(`paidByTouched` flag 追蹤邊行畀人手動改過,改過就唔會再被 bulk 更新影響)。
   - 每行有刪除掣。
3. **Confirm & Import**:
   - 逐行(sequential,唔係 `Promise.all`)call `db.importExpensesBatch()` → 底層用返同「手動加一筆支出」完全一樣嘅 `insertExpense()`,所以 split/items 行為一致。
   - 全部成功 → 自動關閉 modal + refresh 帳簿。
   - 部分失敗 → **只保留失敗嗰幾行**留喺表格畀你再試(已成功嗰啲會從 state 移除),防止撳多次 Confirm 會重複插入已經成功嗰啲行。

---

## 未驗證 / 已知限制(交低俾下一個對話)

- `/api/scan-statement.js` 嘅 AI 讀 statement 路徑(需要真實相/PDF + 有效 Gemini key,呢邊環境驗唔到)。
- iOS Safari 「Take Photo」消失咗未,需要手機實測(裝置層面行為,冇 HTML attribute 保證控制到)。
- `hasBudget` flag 而家淨係資料,冇 UI 邏輯掛住(YAGNI,三個 template 而家個 value 一樣)。
