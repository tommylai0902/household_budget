import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import {
  Plus, Pencil, Trash2, X, Check, Tag, Coins, Settings, Sun, Moon,
  Users, User, Receipt, ChevronRight, ChevronDown, LogOut, Loader2, Camera, Upload, Menu, BookOpen, PieChart, Store, Languages,
  Home, Plane, Repeat, Pause, Play, PiggyBank, Bell, Palette, Lock,
  Package, ShoppingCart, Search, Minus, ArrowLeft, Wallet, ArrowUpRight, Sparkles, Info, MapPin, MoreHorizontal, MoreVertical, ExternalLink,
  Archive, ArchiveRestore, Filter,
} from "lucide-react";
import kidPigMascot from "./assets/kid-pig.svg";

// Each starter template gets its own mark in the ledger list.
const LEDGER_ICONS = { household: Home, travel: Plane, personal: Users, kid: PiggyBank, blank: BookOpen };
const ledgerIcon = (tpl) => LEDGER_ICONS[tpl] || BookOpen;
// Picker-card accent per template — each card's label/dot/glow pick up their
// template's color instead of one flat teal for every ledger.
const LEDGER_ACCENTS = { household: "#2DD4BF", travel: "#38BDF8", personal: "#C084FC", kid: "#FBBF24", blank: "#94A3B8" };
const ledgerAccent = (tpl) => LEDGER_ACCENTS[tpl] || LEDGER_ACCENTS.blank;
const LEDGER_LABEL_KEYS = { household: "ledgerLabelHousehold", travel: "ledgerLabelTravel", personal: "ledgerLabelPersonal", kid: "ledgerLabelKid", blank: "ledgerLabelBlank" };
const ledgerLabelKey = (tpl) => LEDGER_LABEL_KEYS[tpl] || LEDGER_LABEL_KEYS.blank;
const LEDGER_DESC_KEYS = { household: "tplDescHousehold", travel: "tplDescTravel", personal: "tplDescPersonal", kid: "tplDescKid", blank: "tplDescBlank" };
const ledgerDescKey = (tpl) => LEDGER_DESC_KEYS[tpl] || LEDGER_DESC_KEYS.blank;
const MEMBER_ICONS = { user: User, people: Users, home: Home, plane: Plane, book: BookOpen, tag: Tag };
const memberIcon = (icon) => MEMBER_ICONS[icon] || User;
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";
import { settlements, netBalances, sharedShares } from "./lib/settle";
import { nextOccurrence, addDays } from "./lib/recurring";
import { parseCsvText, guessCategoryId, buildPreviewRows } from "./lib/csv";
import { parseNotificationUrl, notificationTarget } from "./lib/notificationLink";
import { suggestCategoryId } from "./lib/categorize";

/* ------------------------------------------------------------------ *
 * Household Budget — Step 2: shared, live-synced ledger (Supabase).
 * Auth-gated; both members see one dataset that updates in real time.
 * Same UI as Step 1 (clickable rows + detail panel, dual language).
 * ------------------------------------------------------------------ */

// These point at index.css custom properties (not literal hex) so every
// inline style built from them repaints for the dark theme automatically —
// see the :root[data-theme] block there. TEAL is the name kept from before
// accent became user-pickable (Settings → Accent colour); it now reads
// --accent, which App sets as an inline style on <html> and which stays the
// same across both themes, same as it always did.
const INK = "var(--ink)";
const SUB = "var(--sub)";
const LINE = "var(--line)";
const PAPER = "var(--paper)";
const CARD = "var(--card)";
const TEAL = "var(--accent)";
// TEAL as a fill, ACCENT_TEXT as text or an icon. Same colour in dark mode;
// light mode darkens it, since the accents are picked to be read as fills and
// none of them survives as small text over the daylight backdrop.
const ACCENT_TEXT = "var(--accent-text)";
// Chip/icon-button fill. CARD everywhere else; light mode makes just these
// translucent so secondary controls stop shouting over the daylight backdrop.
const CHIP_BG = "var(--chip-bg)";
// The accent palette now spans dark, dusty tones and light, pastel ones (see
// ACCENT_COLORS below) — a single hardcoded "#fff" stopped being safe as the
// text/icon colour drawn on top of it. ACCENT_INK is computed per pick (see
// accentInkFor) and kept as a matching CSS var, same mechanism as TEAL itself.
const ACCENT_INK = "var(--accent-ink)";
// Tinted surfaces come in bg/ink pairs — always use a tint's own ink on it,
// never INK, or the pair breaks when the theme flips.
const OK_BG = "var(--ok-bg)";
const OK_INK = "var(--ok-ink)";
const OK_LINE = "var(--ok-line)";
const OK_STRONG = "var(--ok-strong)";
const BAD_BG = "var(--bad-bg)";
const BAD_INK = "var(--bad-ink)";
const BAD_LINE = "var(--bad-line)";
const TRACK = "var(--track)";      // empty half of a progress bar
const MUTED_BG = "var(--muted-bg)";
const DANGER = "var(--danger)";    // destructive text/icons, not solid fills
const WARN = "var(--warn)";        // cautionary text (owes money, currency mismatch)

// Members come from the ledger now — a trip splits between whoever came along.
const memberById = (members, id) => members.find((m) => m.id === id) || null;

/* --------------------------- i18n ---------------------------------- */
const STRINGS = {
  en: {
    eyebrow: "Monira",
    signInTitle: "Sign in",
    signInHint: "One simple step toward a better financial life.",
    signUpTitle: "Create account", signUpHint: "Sign up, then create or join a ledger.",
    nameLabel: "Name", namePh: "How you'll show up in a ledger",
    signUpBtn: "Create account", toSignUp: "New here? Create an account", toSignIn: "Already have an account? Sign in",
    checkEmail: "Almost there — check your email to confirm, then sign in.",
    usernameRequiredHint: "Required to accept the invite — this is the name others will see.",
    usernameRequiredErr: "Please enter a name before continuing.",
    usernameSameAsEmailErr: "Your display name can't be the same as your email.",
    email: "Email", password: "Password", signInBtn: "Sign in", signOut: "Sign out",
    connecting: "Connecting…",
    categories: "Categories", manageCats: "Manage categories", selectMonth: "Select month",
    addExpense: "Add expense",
    totalSpending: "Spending", balance: "Balance", settleUp: "Settle up",
    emptyState: "No expenses in {month} yet. Add your first one above.",
    emptyStateDay: "No expenses on {date}.", showAll: "Show all",
    viewAllLedgers: "View all {n} ledgers", showLess: "Show less",
    paidByRow: "{name} paid", split5050: "Split 50/50", personal: "No Split",
    uncategorised: "Uncategorised", edit: "Edit", delete: "Delete",
    deleteConfirm: 'Delete "{name}"?',
    stepFooter: "Live-synced across your household · Next: budgets, reports, receipt scanning.",
    loadErr: "Couldn't reach the ledger: {msg}",
    editExpense: "Edit expense", formWhat: "What was it?", formWhatPh: "e.g. Foody groceries",
    amount: "Amount", date: "Date", addHst: "Add 13% HST",
    category: "Category", whoPaid: "Who paid?", paidBy: "Paid by", split: "Split",
    noMembersHint: "No members yet", noCategoriesHint: "No categories yet",
    noteLabel: "Note (optional)", noteDisplay: "Note", notePh: "Note",
    cancel: "Cancel", saveChanges: "Save changes",
    newCatPh: "New category name", saveCategories: "Save categories", deleteCategory: "Delete category",
    close: "Close",
    owesLine: "{debtor} owes {creditor} {amount}", personalLine: "Personal expense — not split",
    settlementDetails: "Settlement details", paidThisMonth: "Paid this month", sharedShare: "Shared-bill share",
    shouldReceive: "Should receive", shouldPay: "Should pay", noSharedBills: "No shared bills to settle this month.",
    sharedLine: "Split {n} ways — {amount} each",
    members: "Members", manageMembers: "Edit members",
    memberHasExpenses: "That member still has expenses in this ledger. Reassign or delete them first.",
    budget: "Budget", budgetFor: "Budget for {month}", budgetTotal: "All categories", editBudget: "Edit budget",
    budgetNone: "No budgets set for {month}. Give any category an amount below.",
    budgetSpent: "Spent", budgetLeft: "Left", budgetOver: "Over budget",
    budgetSave: "Save budgets", budgetClearHint: "Leave a category empty for no budget", setBudgetPh: "Set budget",
    carryForward: "Carry to next month", carryForwardDone: "Carried ✓",
    budgetAmountLabel: "{amount} budget", budgetOtherMonths: "Other months",
    budgetUncat: "Uncategorised spending isn't counted against any category budget.",
    monthlyReport: "Reports", reportFor: "Spending in {month}",
    reportTotal: "Total spending", reportCategories: "By category",
    reportEmpty: "No spending recorded for this month yet.", reportUncategorised: "Uncategorised",
    compareMonth: "Compare to",
    compareEmpty: "Nothing to compare — no spending in either month.",
    compareUnchanged: "No change", compareNew: "New this month",
    compareGoneLabel: "Gone this month",
    categoryExpenses: "Expenses in {category}", categoryExpensesEmpty: "No expenses in this category for this month.",
    splitBetween: "Split", splitWays: "{n} ways · {amount} each", splitWaysShort: "Split {n} ways",
    selectAll: "Everyone",
    items: "Receipt items", itemSplit: "Split", itemPersonal: "Personal", itemDrop: "Not mine",
    itemAddToInventory: "Add to Inventory", itemAddToGrocery: "Add to Grocery List",
    itemsHint: "Tax is shared out across whatever you keep, in proportion to price.",
    itemsPersonalNote: "{n} personal · {amount} — saved as a second, unsplit expense",
    itemsDropped: "{n} removed",
    itemsClear: "Clear items", itemsTotalsOff: "Items add up to {sum}, receipt says {total}",
    splitNobody: "Tick at least one person to split between.",
    sharedAmong: "Split between {names}",
    stores: "Saved shops", rememberStore: 'Remember "{name}"',
    rememberHint: "Saved shops are suggested as you type. Nothing is saved unless you tick this.",
    newStorePh: "New shop name", saveStores: "Save shops", deleteStore: "Remove shop",
    noStores: "No saved shops yet. Tick the box when adding an expense to keep one.",
    // Inventory / Grocery
    addToInventory: "Add to Inventory", addToInventoryHint: "Track this purchase in your inventory",
    quantity: "Quantity", unit: "Unit", expiryDate: "Expiry date",
    searchInventoryPh: "Search inventory…", noInventoryItems: "No inventory items yet.",
    addItem: "Add Item", itemNamePh: "Item name", minQuantityLabel: "Low stock at (optional)",
    editItem: "Edit item", deleteItem: "Delete item", saveItem: "Save changes",
    deleteItemConfirm: 'Delete "{name}" from your inventory? This cannot be undone.',
    lowStock: "Low stock", expiringSoon: "Expiring soon", expired: "Expired",
    addToGroceryList: "Add to Grocery List", addedToGroceryList: "{name} added to your grocery list",
    alreadyOnGroceryList: "{name} is already on your grocery list. Add it again?", addAnyway: "Add anyway",
    addGroceryItemPh: "Add an item…", noGroceryItems: "Grocery list is empty.",
    priceMatchCheck: "🔍 Price Match Check", checkingDeals: "Checking…",
    postalCodePh: "Postal code for price match", priceMatchBadge: "Best: {price} at {merchant}",
    priceMatchBadgeExpired: "Expired: {price} at {merchant}",
    dealExpiredHint: "This flyer price has expired — tap 🔍 to check again.",
    postalCodeRequired: "Enter your postal code first — flyer prices are local.",
    storeSetup: "My stores", storeSetupHint: "Shops with flyers near you. Set the one you actually shop at, then add others to its price-match list.",
    searchStoresPh: "Search stores…", myStoresCount: "My stores ({n})", browseStores: "Browse",
    myStore: "My store", markMyStore: "Mark as mine",
    storeItemCount: "{n} items on sale", noStoresForRegion: "No flyers for this postal code yet — the weekly update runs Thursday.",
    noStoresMatch: "No stores match that.",
    priceMatchesQ: "Would {store} price match this store's flyer?", yes: "Yes", no: "No", notSure: "Not sure",
    shoppingAt: "Shopping at {store}", pmListCount: "{n} stores in the price-match list",
    noMatchListStores: "No stores in the price-match list yet — add some in My stores.",
    lastConfirmed: "Last confirmed {date}",
    storeNotePh: "Conditions, e.g. identical size, local competitors only",
    includeNonGrocery: "All Stores", typeSupermarkets: "Supermarkets", typeHardware: "Hardware & home",
    priceMatchMode: "Price Match Mode", priceMatchBtn: "Price Match", pickShoppingStore: "Which store are you shopping at?",
    noMatchStores: "No stores marked as yours yet.", changeStore: "Change store",
    pmWillMatch: "Show a competitor's flyer at the till and they'll match it.",
    pmWontMatch: "This store doesn't price match — these are cheaper elsewhere.",
    pmMatchUnknown: "Not sure if this store price matches — worth asking.",
    pmChecking: "Checking your list…", pmSummary: "{n} of {total} items are cheaper elsewhere",
    pmAlreadyHere: "cheapest here, {price}", pmNoDeals: "no flyer deal",
    dealCheckErr: "Couldn't check prices: {msg}",
    dealsPending: "No flyer prices for this area yet — the first update is still to run.",
    dealsStale: "Flyer prices are out of date (last updated {date}), so this isn't a reliable \"no deals\".",
    dealsNoneFound: "No flyer deals found for this item.",
    priceMatchTitle: "Flyer prices: {name}", priceMatchHint: "Show this to the cashier to price match. Tap one to save it to your list.",
    dealValidUntil: "Valid until {date}", dealNoImage: "This flyer deal has no picture.",
    viewFullFlyer: "View the whole flyer", completedCount: "Completed ({n})",
    scanBarcode: "Scan a product", scanNoProduct: "Couldn't tell what that is. Try the barcode or the front of the pack.",
    invCategory: "Category", invLocation: "Stored in", manageLabels: "Manage",
    noInvCategory: "No category", noLocation: "No location", allLocations: "Everywhere",
    invCategories: "Inventory categories", invLocations: "Storage locations",
    noInvCategories: "No categories yet.", noInvLocations: "No locations yet.",
    newInvCategoryPh: "New category, e.g. Dairy", newInvLocationPh: "New location, e.g. Freezer",
    labelDeleteHint: "Deleting one only unfiles its items — the items themselves stay.",
    brandLabel: "Brand", brandPh: "e.g. Neilson",
    brandHint: "Optional — narrows the flyer search to the exact product.",
    backToDashboard: "Back",
    ledgerCard: "Ledger & Transactions", totalMonthSpent: "Total Month Spent", lastEntry: "Last Entry",
    navDropdownLabel: "Ledgers",
    inventoryCardTitle: "Inventory Hub", trackedItemsLabel: "Total Items Tracked:", lowStockAlert: "{n} items Low Stock!",
    groceryCardTitle: "Smart Grocery & Deals", groceryShortTitle: "Smart Grocery", pendingItemsLabel: "Pending Items:", dealsActiveBadge: "Deals Active! · Price Match Check",
    viewingLedger: "Viewing: {name}",
    budgetBannerLine: "SPENT: {spent}/{budget} ({pct}%)",
    budgetRemainingLine: "Remaining: {amount}", budgetOverLine: "Over by {amount}",
    noBudgetSetPrompt: "No budget set — tap to add one",
    recurring: "Recurring expenses", recurringAdd: "Add new", noRecurring: "No recurring expenses yet.",
    recurNew: "New recurring expense", recurEdit: "Edit recurring expense",
    freqWeekly: "Weekly", freqMonthly: "Monthly", freqYearly: "Yearly", frequency: "Frequency",
    startDate: "Start date", nextDue: "Next due", paused: "Paused",
    pauseRule: "Pause", resumeRule: "Resume", saveRule: "Save",
    recurDeleteConfirm: "Delete this recurring rule? Expenses it already created stay.",
    csvImportTitle: "Import expenses", csvNoRows: "No usable rows found in that file.",
    csvDefaultOwner: "Default card owner / Paid by", csvRowCount: "{n} rows ready to import",
    csvConfirm: "Confirm & import", csvImporting: "Importing…",
    csvResult: "Imported {ok} of {total}.", csvResultFail: " {fail} failed.",
    csvRemoveRow: "Remove row",
    newMemberPh: "New member name", saveMembers: "Save members", deleteMember: "Remove member",
    receiptTitle: "Receipt items",
    receiptEmpty: "No receipt attached yet. When you scan a receipt, its line items will show up here.",
    scanReceipt: "Scan receipt", uploadReceipt: "Upload receipt", scanning: "Reading receipt…",
    scanHint: "or fill it in yourself", scanFailed: "Couldn't read that receipt: {msg}", saveFailed: "Couldn't save: {msg}",
    scanRetryIn: "Scanner busy — retrying in {secs}s…",
    scanRateLimited: "too many scans just now. Wait a minute and try again.",
    scanItemsWithAi: "Read the individual items with AI",
    currencyMismatch: "This receipt looks like it's in {scanned}, but this ledger is set to {ledger}. Amount was kept as printed — no conversion applied.",
    editCategories: "Edit categories", menu: "Menu",
    settings: "Settings", appearance: "Appearance", light: "Light", dark: "Dark", accentColor: "Accent colour",
    saveAccent: "Save colour", accentSaved: "Saved", accentSaveErr: "Couldn't save your colour: {msg}",
    profile: "Profile", editName: "Edit name", saveName: "Save name", nameSaved: "Saved", nameSaveErr: "Couldn't save your name: {msg}",
    currentPasswordLabel: "Current password", newPasswordLabel: "New password", confirmPasswordLabel: "Confirm new password",
    changePassword: "Change password", passwordChanged: "Password updated.", passwordSaveErr: "Couldn't update your password: {msg}",
    passwordMismatchErr: "New passwords don't match.", currentPasswordWrongErr: "Current password is incorrect.",
    ledgers: "Ledgers", home: "Home",
    newLedgerPh: "e.g. Travel — Japan", createLedger: "Create ledger",
    invitePeople: "Invite people", inviteAccess: "Their access",
    manageAccess: "Manage members", currentMembers: "Who has access",
    roleOwner: "Owner", roleEditor: "Editor", roleViewer: "Viewer",
    removeMemberBtn: "Remove", removeMemberConfirm: "Remove {name} from this ledger?",
    ownerOnlyErr: "Only the ledger owner can do this.",
    pendingInvite: "Pending invite", openInviteLink: "Open invite link", revokeInviteBtn: "Revoke invite",
    roleEditorHint: "Can view and add or change expenses, budgets and members.",
    roleViewerHint: "Can view everything, but not make changes.",
    inviteEmailLabel: "Email",
    inviteEmailHint: "The invite link will only work for this account.",
    inviteEmailRequiredErr: "Enter a valid email to generate an invite.",
    generateInvite: "Generate invite link", inviteLinkReady: "Share this link — valid 7 days:",
    copyLink: "Copy", copiedLink: "Copied",
    inviteJoined: "You've joined the ledger.", inviteFailed: "Couldn't accept the invite: {msg}",
    inviteTitle: "Ledger invitation",
    invitePromptNamed: "You've been invited to join {ledger} as {role}.",
    invitePrompt: "You've been invited to join a ledger.",
    inviteAcceptBtn: "Accept & join", inviteDecline: "Not now",
    inviteInvalid: "This invite link isn't valid.", inviteExpired: "This invite has expired.",
    inviteUsed: "This invite has already been used.",
    noLedgers: "No ledgers yet. Create your first one below.",
    language: "Language", openLedger: "Open {name}",
    startWith: "Start with a template", tplHousehold: "Home Budget", tplTravel: "Travel",
    tplPersonal: "Personal", tplKid: "Kids", tplBlank: "Blank",
    tplHint: "{n} categories — you can rename or add more later",
    tplHintBlank: "No categories — add your own from inside the ledger",
    tplDescHousehold: "Detailed household tracking", tplDescPersonal: "Individual spending",
    tplDescTravel: "Trip expense categories", tplDescKid: "Chores, savings & allowance", tplDescBlank: "Start from scratch",
    ledgerNameLabel: "Ledger name", continueBtn: "Continue",
    deleteLedger: "Delete ledger", renameLedger: "Rename ledger", moreActions: "More actions",
    deleteLedgerConfirm: 'Delete "{name}" and every expense in it? This cannot be undone.',
    archiveLedger: "Archive", archivedLedgers: "Archived ledgers", archivedShort: "Archived",
    noArchivedLedgers: "Nothing archived yet.",
    archiveConfirm: 'Archive "{name}"? It keeps everything in it and hides from your list — restore it any time from Settings.',
    restoreLedger: "Restore", restoreConfirm: 'Put "{name}" back in your ledger list?',
    ledgerLabelHousehold: "Home Budget", ledgerLabelTravel: "Travel Expenses", ledgerLabelPersonal: "Personal Expenses",
    ledgerLabelKid: "Kids Fund", ledgerLabelBlank: "Custom Ledger",
    transactionsCount: "{n} this month", transactionsCountAll: "{n} Transactions",
    justNow: "Just now", minutesAgo: "{n}m ago", hoursAgo: "{n}h ago",
    updatedToday: "Today", updatedYesterday: "Yesterday", updatedLine: "Updated {when}",
    currency: "Currency",
    tripDates: "Trip dates", tripStartDate: "Trip start date", tripEndDate: "Trip end date",
    vaultTitle: "Treasure Vault", earnedMoney: "Earned Money", boughtSomething: "Spent Money",
    kidAdd: "Add it!", noGoalYet: "No goal yet — tap to set one!",
    setGoalTitle: "Set a wishlist goal", goalNameLabel: "What are you saving for?",
    goalNamePh: "e.g. Lego Star Wars", goalAmountLabel: "Target amount", saveGoal: "Save goal",
    goalReached: "🎉 Goal reached!", recentActivity: "Recent Activity",
    noKidActivity: "No adventures yet!", kidEmptyCta: "Let's earn some coins!",
    cancellationReminder: "Cancellation Reminder", remindMeToCancel: "Remind me to cancel",
    cancellationReminderTitle: "Cancel {name} before it renews",
    upcomingChargeTitle: "Upcoming charge for {name} in {days} days",
    // Dated rather than "expires soon": the row outlives the day it appears,
    // and a stale "soon" on something a week gone reads as a broken app.
    expiryReminderTitle: "{name} expires {date}",
    pushEnable: "Notify me on this device", pushDisable: "Stop notifying this device",
    pushBlocked: "Notifications are blocked in your browser settings.",
    upcomingChargeReminder: "Upcoming Charge Reminder", remindMeUpcoming: "Remind me before each charge",
    daysBeforeLabel: "days before",
    notifications: "Notifications", noNotifications: "You're all caught up!",
    markAllRead: "Mark all as read", markAsRead: "Mark as read", dismiss: "Dismiss",
    manageReminders: "Manage reminders", noReminders: "No reminders set.",
    autoReminderHint: "From a recurring rule — resets once it reaches its next charge. Pause the rule to stop it for good.",
    autoExpiryHint: "From an inventory item — resets while it still has an expiry date. Clear the item's expiry date to stop it for good.",
  },
  zh: {
    eyebrow: "Monira",
    signInTitle: "登入",
    signInHint: "One simple step toward a better financial life.",
    signUpTitle: "建立帳戶", signUpHint: "註冊後，建立或加入帳簿。",
    nameLabel: "名稱", namePh: "你喺帳簿入面顯示嘅名",
    signUpBtn: "建立帳戶", toSignUp: "未有帳戶？建立一個", toSignIn: "已經有帳戶？登入",
    checkEmail: "就快好 — 去電郵確認帳戶，然後再登入。",
    usernameRequiredHint: "接受邀請一定要填 — 呢個名其他人會見到。",
    usernameRequiredErr: "請先填個名先可以繼續。",
    usernameSameAsEmailErr: "顯示名稱唔可以同電郵一樣。",
    email: "電郵", password: "密碼", signInBtn: "登入", signOut: "登出",
    connecting: "連線中…",
    categories: "類別", manageCats: "管理類別", selectMonth: "選擇月份",
    addExpense: "新增支出",
    totalSpending: "支出", balance: "結餘", settleUp: "結算",
    emptyState: "{month}還沒有支出，先在上方新增一筆。",
    emptyStateDay: "{date} 冇支出記錄。", showAll: "顯示全部",
    paidByRow: "{name} 已付", split5050: "平分 50/50", personal: "唔分帳",
    uncategorised: "未分類", edit: "修改", delete: "刪除",
    deleteConfirm: "確定刪除「{name}」？",
    stepFooter: "已與家庭即時同步 · 下一步：預算、報表、收據掃描。",
    loadErr: "無法連接帳簿：{msg}",
    editExpense: "修改支出", formWhat: "支出項目", formWhatPh: "例如：買餸",
    amount: "金額", date: "日期", addHst: "加 13% 稅（HST）",
    category: "類別", whoPaid: "付款人", paidBy: "付款人", split: "分帳",
    noMembersHint: "仲未有成員", noCategoriesHint: "仲未有類別",
    noteLabel: "備註（可選）", noteDisplay: "備註", notePh: "附註",
    cancel: "取消", saveChanges: "儲存修改",
    newCatPh: "新類別名稱", saveCategories: "儲存類別", deleteCategory: "刪除類別",
    close: "關閉",
    owesLine: "{debtor} 欠 {creditor} {amount}", personalLine: "個人支出，不分帳",
    settlementDetails: "結算明細", paidThisMonth: "本月已付", sharedShare: "分帳應付",
    shouldReceive: "應收", shouldPay: "應付", noSharedBills: "這個月沒有需要結算的分帳支出。",
    sharedLine: "{n} 人平分 — 每人 {amount}",
    members: "成員", manageMembers: "編輯成員",
    memberHasExpenses: "呢位成員喺呢本帳簿仲有支出，要先改咗付款人或者刪走嗰啲支出。",
    budget: "預算", budgetFor: "{month}預算", budgetTotal: "所有類別", editBudget: "編輯預算",
    budgetNone: "{month}未設預算。喺下面任何一個類別填個數就得。",
    budgetSpent: "已用", budgetLeft: "剩餘", budgetOver: "超出預算",
    budgetSave: "儲存預算", budgetClearHint: "留空即該類別冇預算", setBudgetPh: "設定預算",
    carryForward: "帶去下個月", carryForwardDone: "已帶去 ✓",
    budgetAmountLabel: "預算 {amount}", budgetOtherMonths: "其他月份",
    budgetUncat: "未分類嘅支出唔會計入任何類別預算。",
    monthlyReport: "每月報告", reportFor: "{month}支出", reportTotal: "總支出", reportCategories: "按類別",
    reportEmpty: "這個月尚未有支出紀錄。", reportUncategorised: "未分類",
    compareMonth: "比較月份",
    compareEmpty: "兩個月都冇支出，冇嘢好比較。",
    compareUnchanged: "冇變動", compareNew: "本月新增",
    compareGoneLabel: "本月冇咗",
    categoryExpenses: "{category}支出", categoryExpensesEmpty: "這個月此類別尚未有支出。",
    splitBetween: "分帳", splitWays: "{n} 人分 · 每人 {amount}", splitWaysShort: "{n} 人分",
    selectAll: "全部人",
    items: "收據明細", itemSplit: "分帳", itemPersonal: "私人", itemDrop: "唔計",
    itemAddToInventory: "加入存貨", itemAddToGrocery: "加入買餸清單",
    itemsHint: "稅款會按價錢比例攤分落你保留嘅項目。",
    itemsPersonalNote: "{n} 件私人 · {amount} — 會另存一張唔分帳嘅支出",
    itemsDropped: "已剔走 {n} 件",
    itemsClear: "清除明細", itemsTotalsOff: "明細加埋係 {sum}，收據寫住 {total}",
    splitNobody: "至少要剔一個人先分到帳。",
    sharedAmong: "由 {names} 平分",
    stores: "已記住嘅店家", rememberStore: "記住「{name}」",
    rememberHint: "記住咗嘅店家打頭幾個字就會彈出。唔剔呢格就唔會記。",
    newStorePh: "新店家名稱", saveStores: "儲存店家", deleteStore: "移除店家",
    noStores: "仲未記低任何店家。入數時剔個格就會記住。",
    // 存貨 / 買餸清單
    addToInventory: "加入存貨", addToInventoryHint: "將呢次買嘅嘢記入存貨",
    quantity: "數量", unit: "單位", expiryDate: "到期日",
    searchInventoryPh: "搵存貨…", noInventoryItems: "仲未有存貨。",
    addItem: "新增物品", itemNamePh: "物品名稱", minQuantityLabel: "低過幾多就提醒（可選）",
    editItem: "編輯物品", deleteItem: "刪除物品", saveItem: "儲存修改",
    deleteItemConfirm: "確定喺存貨度刪除「{name}」？呢個動作無法還原。",
    lowStock: "存貨唔夠", expiringSoon: "快到期", expired: "已過期",
    addToGroceryList: "加入買餸清單", addedToGroceryList: "已將「{name}」加入買餸清單",
    alreadyOnGroceryList: "「{name}」已經喺買餸清單度。要再加一次？", addAnyway: "照加",
    addGroceryItemPh: "加樣嘢…", noGroceryItems: "買餸清單係空嘅。",
    priceMatchCheck: "🔍 格價", checkingDeals: "格緊價…",
    postalCodePh: "郵政編碼（用嚟格價）", priceMatchBadge: "最平：{merchant} {price}",
    priceMatchBadgeExpired: "已過期：{merchant} {price}",
    dealExpiredHint: "呢個海報價已經過期——撳 🔍 再check過。",
    postalCodeRequired: "請先填郵政編碼——海報優惠係分地區嘅。",
    storeSetup: "我嘅超市", storeSetupHint: "你附近有出海報嘅舖頭。揀返你真係會去嗰間做「我嘅舖」，再揀邊幾間肯畀佢 match 價，加入清單。",
    searchStoresPh: "搵超市…", myStoresCount: "我嘅超市（{n}）", browseStores: "睇吓",
    myStore: "我嘅超市", markMyStore: "設為我嘅",
    storeItemCount: "{n} 件特價貨", noStoresForRegion: "呢個郵政編碼仲未有海報——星期四先更新。",
    noStoresMatch: "搵唔到相符嘅超市。",
    priceMatchesQ: "{store} 會唔會 match 呢間嘅價？", yes: "肯", no: "唔肯", notSure: "唔清楚",
    shoppingAt: "而家喺 {store} 買緊嘢", pmListCount: "價目清單有 {n} 間舖",
    noMatchListStores: "價目清單重未有舖——去「我嘅超市」加返幾間。",
    lastConfirmed: "上次確認：{date}",
    storeNotePh: "條件，例如：同款同容量、只限本地對手",
    includeNonGrocery: "所有舖頭", typeSupermarkets: "超市", typeHardware: "五金/傢俬",
    priceMatchMode: "格價模式", priceMatchBtn: "格價", pickShoppingStore: "你而家喺邊間買嘢？",
    noMatchStores: "仲未設定過自己嘅超市。", changeStore: "換間舖",
    pmWillMatch: "喺收銀處攞對手嘅海報出嚟，佢哋就會 match 個價。",
    pmWontMatch: "呢間唔 match 價——以下係其他舖平啲嘅價。",
    pmMatchUnknown: "唔肯定呢間 match 唔 match 價——不妨問吓。",
    pmChecking: "檢查緊你張清單…", pmSummary: "{total} 樣入面有 {n} 樣其他舖更平",
    pmAlreadyHere: "呢度最平，{price}", pmNoDeals: "冇海報優惠",
    dealCheckErr: "格價失敗：{msg}",
    dealsPending: "呢區仲未有海報價，第一次更新未跑過。",
    dealsStale: "海報價已經過期（最後更新 {date}），所以呢個「冇優惠」信唔過。",
    dealsNoneFound: "搵唔到呢件貨嘅海報優惠。",
    priceMatchTitle: "海報價：{name}", priceMatchHint: "俾收銀睇呢張就可以格價。撳一個存返落清單。",
    dealValidUntil: "有效期至 {date}", dealNoImage: "呢個海報優惠冇圖。",
    viewFullFlyer: "睇成份海報", completedCount: "已買（{n}）",
    scanBarcode: "掃描貨品", scanNoProduct: "認唔出係咩嚟。試吓影條碼或者包裝正面。",
    invCategory: "分類", invLocation: "擺喺邊", manageLabels: "管理",
    noInvCategory: "冇分類", noLocation: "冇指定位置", allLocations: "全部位置",
    invCategories: "存貨分類", invLocations: "存放位置",
    noInvCategories: "仲未有分類。", noInvLocations: "仲未有位置。",
    newInvCategoryPh: "新分類，例如：奶類", newInvLocationPh: "新位置，例如：冰格",
    labelDeleteHint: "刪咗淨係將啲貨品變返冇分類／冇位置，貨品本身唔會冇咗。",
    brandLabel: "牌子", brandPh: "例如 Neilson",
    brandHint: "選填——填咗可以喺海報度搵得準啲。",
    moreActions: "更多操作",
    backToDashboard: "返回",
    ledgerCard: "帳簿同交易", totalMonthSpent: "本月總支出", lastEntry: "最新一筆",
    navDropdownLabel: "帳簿",
    inventoryCardTitle: "存貨中心", trackedItemsLabel: "追蹤中：", lowStockAlert: "{n} 樣嘢存貨唔夠！",
    groceryCardTitle: "智能買餸格價", groceryShortTitle: "智能買餸", pendingItemsLabel: "未買：", dealsActiveBadge: "有優惠喇！· 格價",
    viewingLedger: "而家睇緊：{name}",
    budgetBannerLine: "已用：{spent}/{budget}（{pct}%）",
    budgetRemainingLine: "剩餘：{amount}", budgetOverLine: "超出咗 {amount}",
    noBudgetSetPrompt: "未設預算——撳去加一個",
    recurring: "定期支出", recurringAdd: "新增", noRecurring: "仲未有定期支出。",
    recurNew: "新增定期支出", recurEdit: "編輯定期支出",
    freqWeekly: "每週", freqMonthly: "每月", freqYearly: "每年", frequency: "頻率",
    startDate: "開始日期", nextDue: "下次", paused: "已暫停",
    pauseRule: "暫停", resumeRule: "恢復", saveRule: "儲存",
    recurDeleteConfirm: "刪除呢條定期規則？佢已經產生嘅支出會保留。",
    csvImportTitle: "匯入支出", csvNoRows: "個檔案入面搵唔到有用嘅資料行。",
    csvDefaultOwner: "預設卡主 / 邊個俾錢", csvRowCount: "{n} 行準備匯入",
    csvConfirm: "確認並匯入", csvImporting: "匯入緊…",
    csvResult: "已匯入 {ok} / {total}。", csvResultFail: "有 {fail} 行失敗。",
    csvRemoveRow: "移除呢行",
    newMemberPh: "新成員名稱", saveMembers: "儲存成員", deleteMember: "移除成員",
    receiptTitle: "收據項目",
    receiptEmpty: "尚未附上收據。掃描收據後，明細項目會顯示在這裡。",
    scanReceipt: "掃描收據", uploadReceipt: "上載收據", scanning: "讀取收據中…",
    scanHint: "或自己填寫", scanFailed: "讀唔到張收據：{msg}", saveFailed: "儲存唔到：{msg}",
    scanRetryIn: "掃描器繁忙——{secs} 秒後再試…",
    scanRateLimited: "一時間掃得太密。等一分鐘再試。",
    scanItemsWithAi: "用 AI 讀逐件商品",
    currencyMismatch: "呢張收據睇落係 {scanned},但呢本帳簿設定咗 {ledger}。金額已按原數保留，冇做轉換。",
    editCategories: "編輯類別", menu: "選單",
    settings: "設定", appearance: "外觀", light: "淺色", dark: "深色", accentColor: "主題色",
    saveAccent: "儲存顏色", accentSaved: "已儲存", accentSaveErr: "儲存唔到你揀嘅顏色：{msg}",
    profile: "個人資料", editName: "編輯名稱", saveName: "儲存名稱", nameSaved: "已儲存", nameSaveErr: "儲存唔到你嘅名：{msg}",
    currentPasswordLabel: "目前密碼", newPasswordLabel: "新密碼", confirmPasswordLabel: "確認新密碼",
    changePassword: "更改密碼", passwordChanged: "密碼已更新。", passwordSaveErr: "更改唔到密碼：{msg}",
    passwordMismatchErr: "兩次輸入嘅新密碼唔一致。", currentPasswordWrongErr: "目前密碼唔啱。",
    ledgers: "帳簿", home: "主頁",
    newLedgerPh: "例如：旅行 — 日本", createLedger: "建立帳簿",
    invitePeople: "邀請成員", inviteAccess: "權限",
    manageAccess: "管理成員", currentMembers: "邊個有權限",
    roleOwner: "擁有者", roleEditor: "可編輯", roleViewer: "只可查看",
    removeMemberBtn: "移除", removeMemberConfirm: "將 {name} 移出呢本帳簿？",
    ownerOnlyErr: "只有帳簿擁有者先可以咁做。",
    pendingInvite: "邀請待接受", openInviteLink: "開放邀請連結", revokeInviteBtn: "撤銷邀請",
    roleEditorHint: "可以睇同埋新增/修改支出、預算、成員。",
    roleViewerHint: "可以睇晒所有嘢，但唔可以改。",
    inviteEmailLabel: "電郵",
    inviteEmailHint: "呢條邀請連結只限呢個帳號用。",
    inviteEmailRequiredErr: "填個有效電郵先可以產生邀請。",
    generateInvite: "產生邀請連結", inviteLinkReady: "分享呢條連結 — 7 日有效：",
    copyLink: "複製", copiedLink: "已複製",
    inviteJoined: "你已加入帳簿。", inviteFailed: "接受邀請失敗：{msg}",
    inviteTitle: "帳簿邀請",
    invitePromptNamed: "你被邀請以「{role}」身份加入「{ledger}」。",
    invitePrompt: "你被邀請加入一本帳簿。",
    inviteAcceptBtn: "接受並加入", inviteDecline: "暫時唔要",
    inviteInvalid: "呢條邀請連結無效。", inviteExpired: "呢個邀請已過期。",
    inviteUsed: "呢個邀請已經用咗。",
    transactionsCount: "本月 {n} 筆", transactionsCountAll: "{n} 筆交易",
    justNow: "啱啱", minutesAgo: "{n} 分鐘前", hoursAgo: "{n} 小時前",
    updatedToday: "今日", updatedYesterday: "尋日", updatedLine: "{when}更新",
    noLedgers: "仲未有帳簿。喺下面建立第一本。",
    language: "語言", openLedger: "開啟{name}",
    startWith: "揀個範本開始", tplHousehold: "家庭預算", tplTravel: "旅行",
    tplPersonal: "個人", tplKid: "小朋友", tplBlank: "空白",
    tplHint: "{n} 個類別 — 之後可以改名或者加",
    tplHintBlank: "冇類別 — 入咗帳簿之後自己加",
    tplDescHousehold: "詳細家庭開支追蹤", tplDescPersonal: "個人洗費",
    tplDescTravel: "旅行洗費分類", tplDescKid: "家務、儲蓄同零用錢", tplDescBlank: "由零開始自訂",
    ledgerNameLabel: "帳簿名稱", continueBtn: "繼續",
    deleteLedger: "刪除帳簿", renameLedger: "重新命名帳簿",
    deleteLedgerConfirm: '刪除「{name}」同入面所有支出？此操作無法復原。',
    archiveLedger: "封存", archivedLedgers: "已封存帳簿", archivedShort: "已封存",
    noArchivedLedgers: "仲未封存過任何帳簿。",
    archiveConfirm: '封存「{name}」？入面啲嘢全部留住，淨係喺清單度收起，隨時可以喺設定度攞返出嚟。',
    restoreLedger: "還原", restoreConfirm: '將「{name}」放返落帳簿清單？',
    currency: "貨幣",
    tripDates: "旅程日期", tripStartDate: "旅程開始日", tripEndDate: "旅程結束日",
    vaultTitle: "寶藏庫", earnedMoney: "賺咗錢", boughtSomething: "使咗錢",
    kidAdd: "加落去！", noGoalYet: "仲未有目標 — 撳呢度設定一個！",
    setGoalTitle: "設定願望清單目標", goalNameLabel: "你想儲錢買咩？",
    goalNamePh: "例如：Lego Star Wars", goalAmountLabel: "目標金額", saveGoal: "儲存目標",
    goalReached: "🎉 達成目標喇！", recentActivity: "最近活動",
    noKidActivity: "仲未有冒險！", kidEmptyCta: "去賺啲金幣啦！",
    cancellationReminder: "取消提醒", remindMeToCancel: "提醒我取消",
    cancellationReminderTitle: "續約前記得取消{name}",
    upcomingChargeTitle: "{name} {days} 日後扣款",
    expiryReminderTitle: "{name} {date} 到期",
    pushEnable: "喺呢部機通知我", pushDisable: "唔好再喺呢部機通知",
    pushBlocked: "通知俾瀏覽器設定封鎖咗。",
    upcomingChargeReminder: "扣款提醒", remindMeUpcoming: "每次扣款前提醒我",
    daysBeforeLabel: "日前",
    notifications: "通知", noNotifications: "冧晒，冇嘢要跟。",
    markAllRead: "全部標記為已讀", markAsRead: "標記為已讀", dismiss: "移除",
    manageReminders: "管理提醒", noReminders: "仲未設定任何提醒。",
    autoReminderHint: "嚟自定期規則——去到下次扣款會重設返。想永久停就去暫停嗰條規則。",
    autoExpiryHint: "嚟自存貨項目——淨係要仲有到期日就會重設。想永久停就去清咗嗰件嘢嘅到期日。",
  },
  // Simplified Chinese is written in standard Mandarin, not a character-by-character
  // conversion of the zh block above — that one is deliberately colloquial Cantonese.
  "zh-Hans": {
    eyebrow: "Monira",
    signInTitle: "登录",
    signInHint: "One simple step toward a better financial life.",
    signUpTitle: "创建账户", signUpHint: "注册后，创建或加入账本。",
    nameLabel: "名称", namePh: "你在账本中显示的名字",
    signUpBtn: "创建账户", toSignUp: "还没有账户？创建一个", toSignIn: "已有账户？登录",
    checkEmail: "就快好了 — 请到邮箱确认，然后再登录。",
    usernameRequiredHint: "接受邀请必须填写 — 其他人会看到这个名字。",
    usernameRequiredErr: "请先填写名称再继续。",
    usernameSameAsEmailErr: "显示名称不能和邮箱相同。",
    email: "邮箱", password: "密码", signInBtn: "登录", signOut: "退出登录",
    connecting: "连接中…",
    categories: "类别", manageCats: "管理类别", selectMonth: "选择月份",
    addExpense: "添加支出",
    totalSpending: "支出", balance: "结余", settleUp: "结算",
    emptyState: "{month}还没有支出，先在上方添加一笔。",
    emptyStateDay: "{date} 没有支出记录。", showAll: "显示全部",
    paidByRow: "{name} 已付", split5050: "平分 50/50", personal: "不分账",
    uncategorised: "未分类", edit: "修改", delete: "删除",
    deleteConfirm: "确定删除「{name}」？",
    stepFooter: "与家庭实时同步 · 下一步：预算、报表、收据扫描。",
    loadErr: "无法连接账本：{msg}",
    editExpense: "修改支出", formWhat: "支出项目", formWhatPh: "例如：买菜",
    amount: "金额", date: "日期", addHst: "加 13% 税（HST）",
    category: "类别", whoPaid: "付款人", paidBy: "付款人", split: "分账",
    noMembersHint: "还没有成员", noCategoriesHint: "还没有类别",
    noteLabel: "备注（可选）", noteDisplay: "备注", notePh: "备注",
    cancel: "取消", saveChanges: "保存修改",
    newCatPh: "新类别名称", saveCategories: "保存类别", deleteCategory: "删除类别",
    close: "关闭",
    owesLine: "{debtor} 欠 {creditor} {amount}", personalLine: "个人支出，不分账",
    settlementDetails: "结算明细", paidThisMonth: "本月已付", sharedShare: "分账应付",
    shouldReceive: "应收", shouldPay: "应付", noSharedBills: "本月没有需要结算的分账支出。",
    sharedLine: "{n} 人平分 — 每人 {amount}",
    members: "成员", manageMembers: "编辑成员",
    memberHasExpenses: "该成员在这个账本还有支出，请先改付款人或删除这些支出。",
    budget: "预算", budgetFor: "{month}预算", budgetTotal: "全部类别", editBudget: "编辑预算",
    budgetNone: "{month}还没有设预算。在下面任意类别填个金额即可。",
    budgetSpent: "已用", budgetLeft: "剩余", budgetOver: "超出预算",
    budgetSave: "保存预算", budgetClearHint: "留空表示该类别不设预算", setBudgetPh: "设置预算",
    carryForward: "结转到下个月", carryForwardDone: "已结转 ✓",
    budgetAmountLabel: "预算 {amount}", budgetOtherMonths: "其他月份",
    budgetUncat: "未分类的支出不计入任何类别预算。",
    monthlyReport: "报表", reportFor: "{month}支出",
    reportTotal: "总支出", reportCategories: "按类别",
    reportEmpty: "本月还没有支出记录。", reportUncategorised: "未分类",
    compareMonth: "比较月份",
    compareEmpty: "两个月都没有支出，无法比较。",
    compareUnchanged: "无变化", compareNew: "本月新增",
    compareGoneLabel: "本月已无",
    categoryExpenses: "{category}支出", categoryExpensesEmpty: "本月该类别还没有支出。",
    splitBetween: "分账", splitWays: "{n} 人分 · 每人 {amount}", splitWaysShort: "{n} 人分",
    selectAll: "所有人",
    items: "收据明细", itemSplit: "分账", itemPersonal: "个人", itemDrop: "不算",
    itemAddToInventory: "加入库存", itemAddToGrocery: "加入购物清单",
    itemsHint: "税款会按价格比例分摊到你保留的项目上。",
    itemsPersonalNote: "{n} 件个人 · {amount} — 会另存为一笔不分账的支出",
    itemsDropped: "已移除 {n} 件",
    itemsClear: "清除明细", itemsTotalsOff: "明细合计 {sum}，收据显示 {total}",
    splitNobody: "至少勾选一个人才能分账。",
    sharedAmong: "由 {names} 平分",
    stores: "已保存的店铺", rememberStore: "记住「{name}」",
    rememberHint: "保存过的店铺会在输入时提示。不勾选就不会保存。",
    newStorePh: "新店铺名称", saveStores: "保存店铺", deleteStore: "移除店铺",
    noStores: "还没有保存任何店铺。记账时勾选该项即可保存。",
    // 库存 / 购物清单
    addToInventory: "加入库存", addToInventoryHint: "把这次购买记入库存",
    quantity: "数量", unit: "单位", expiryDate: "到期日",
    searchInventoryPh: "搜索库存…", noInventoryItems: "还没有库存物品。",
    addItem: "新增物品", itemNamePh: "物品名称", minQuantityLabel: "低于多少时提醒（可选）",
    editItem: "编辑物品", deleteItem: "删除物品", saveItem: "保存修改",
    deleteItemConfirm: "确定从库存中删除「{name}」？此操作无法撤销。",
    lowStock: "库存不足", expiringSoon: "即将到期", expired: "已过期",
    addToGroceryList: "加入购物清单", addedToGroceryList: "已将「{name}」加入购物清单",
    alreadyOnGroceryList: "「{name}」已在购物清单中。要再加一次吗？", addAnyway: "仍然添加",
    addGroceryItemPh: "添加物品…", noGroceryItems: "购物清单是空的。",
    priceMatchCheck: "🔍 比价", checkingDeals: "比价中…",
    postalCodePh: "邮政编码（用于比价）", priceMatchBadge: "最低：{merchant} {price}",
    priceMatchBadgeExpired: "已过期：{merchant} {price}",
    dealExpiredHint: "这个海报价已经过期——点击 🔍 重新查看。",
    postalCodeRequired: "请先填邮政编码——传单优惠是分地区的。",
    storeSetup: "我的超市", storeSetupHint: "你附近有发传单的商店。选出你实际会去的那一家作为「我的店」，再把愿意帮它比价的其他店加入清单。",
    searchStoresPh: "搜索超市…", myStoresCount: "我的超市（{n}）", browseStores: "浏览",
    myStore: "我的超市", markMyStore: "设为我的",
    storeItemCount: "{n} 件特价商品", noStoresForRegion: "这个邮政编码还没有传单——每周四更新。",
    noStoresMatch: "没有找到相符的超市。",
    priceMatchesQ: "{store} 会不会跟这家比价？", yes: "愿意", no: "不愿意", notSure: "不确定",
    shoppingAt: "正在 {store} 购物", pmListCount: "比价清单有 {n} 家店",
    noMatchListStores: "比价清单还没有店——去「我的超市」添加几家。",
    lastConfirmed: "上次确认：{date}",
    storeNotePh: "条件，例如：同款同规格、仅限本地竞争对手",
    includeNonGrocery: "所有店铺", typeSupermarkets: "超市", typeHardware: "五金/家具",
    priceMatchMode: "比价模式", priceMatchBtn: "比价", pickShoppingStore: "你现在在哪家店购物？",
    noMatchStores: "还没有设定自己的超市。", changeStore: "更换商店",
    pmWillMatch: "在收银台出示对手的传单，他们就会比价。",
    pmWontMatch: "这家不比价——以下是其他店更便宜的价格。",
    pmMatchUnknown: "不确定这家是否比价——可以问一下。",
    pmChecking: "正在检查你的清单…", pmSummary: "{total} 项中有 {n} 项在其他店更便宜",
    pmAlreadyHere: "这里最便宜，{price}", pmNoDeals: "没有传单优惠",
    dealCheckErr: "比价失败：{msg}",
    dealsPending: "本地区还没有传单价格，第一次更新尚未运行。",
    dealsStale: "传单价格已过期（最后更新 {date}），所以这个「没有优惠」不可靠。",
    dealsNoneFound: "没有找到这件商品的传单优惠。",
    priceMatchTitle: "传单价格：{name}", priceMatchHint: "把这个给收银员看即可比价。点一个保存到清单。",
    dealValidUntil: "有效期至 {date}", dealNoImage: "这个传单优惠没有图片。",
    viewFullFlyer: "查看整份传单", completedCount: "已完成（{n}）",
    scanBarcode: "扫描商品", scanNoProduct: "认不出这是什么。试试拍条形码或包装正面。",
    invCategory: "分类", invLocation: "存放位置", manageLabels: "管理",
    noInvCategory: "无分类", noLocation: "未指定位置", allLocations: "全部位置",
    invCategories: "库存分类", invLocations: "存放位置",
    noInvCategories: "还没有分类。", noInvLocations: "还没有位置。",
    newInvCategoryPh: "新分类，例如：乳制品", newInvLocationPh: "新位置，例如：冷冻室",
    labelDeleteHint: "删除只会让物品变成未分类／未指定位置，物品本身不会删除。",
    brandLabel: "品牌", brandPh: "例如 Neilson",
    brandHint: "选填——填了可以更准确地找到传单商品。",
    moreActions: "更多操作",
    backToDashboard: "返回",
    ledgerCard: "账本与交易", totalMonthSpent: "本月总支出", lastEntry: "最新一笔",
    navDropdownLabel: "账本",
    inventoryCardTitle: "库存中心", trackedItemsLabel: "追踪中：", lowStockAlert: "{n} 件商品库存不足！",
    groceryCardTitle: "智能购物比价", groceryShortTitle: "智能购物", pendingItemsLabel: "待购：", dealsActiveBadge: "有优惠了！· 比价",
    viewingLedger: "正在查看：{name}",
    budgetBannerLine: "已用：{spent}/{budget}（{pct}%）",
    budgetRemainingLine: "剩余：{amount}", budgetOverLine: "超支 {amount}",
    noBudgetSetPrompt: "未设置预算——点击添加",
    recurring: "定期支出", recurringAdd: "新增", noRecurring: "还没有定期支出。",
    recurNew: "新增定期支出", recurEdit: "编辑定期支出",
    freqWeekly: "每周", freqMonthly: "每月", freqYearly: "每年", frequency: "频率",
    startDate: "开始日期", nextDue: "下次", paused: "已暂停",
    pauseRule: "暂停", resumeRule: "恢复", saveRule: "保存",
    recurDeleteConfirm: "删除这条定期规则？已经生成的支出会保留。",
    csvImportTitle: "导入支出", csvNoRows: "该文件中没有可用的数据行。",
    csvDefaultOwner: "默认持卡人 / 付款人", csvRowCount: "{n} 行待导入",
    csvConfirm: "确认并导入", csvImporting: "导入中…",
    csvResult: "已导入 {ok} / {total}。", csvResultFail: "有 {fail} 行失败。",
    csvRemoveRow: "移除该行",
    newMemberPh: "新成员名称", saveMembers: "保存成员", deleteMember: "移除成员",
    receiptTitle: "收据项目",
    receiptEmpty: "还没有附上收据。扫描收据后，明细会显示在这里。",
    scanReceipt: "扫描收据", uploadReceipt: "上传收据", scanning: "读取收据中…",
    scanHint: "或自己填写", scanFailed: "读取不了这张收据：{msg}", saveFailed: "保存不了：{msg}",
    scanRetryIn: "扫描器繁忙——{secs} 秒后重试…",
    scanRateLimited: "短时间内扫描太多次。等一分钟再试。",
    scanItemsWithAi: "用 AI 读逐件商品",
    currencyMismatch: "这张收据看起来是 {scanned}，但本账本设置为 {ledger}。金额按原数保留，未做换算。",
    editCategories: "编辑类别", menu: "菜单",
    settings: "设置", appearance: "外观", light: "浅色", dark: "深色", accentColor: "主题色",
    saveAccent: "保存颜色", accentSaved: "已保存", accentSaveErr: "无法保存你选的颜色：{msg}",
    profile: "个人资料", editName: "编辑名字", saveName: "保存名字", nameSaved: "已保存", nameSaveErr: "无法保存你的名字：{msg}",
    currentPasswordLabel: "当前密码", newPasswordLabel: "新密码", confirmPasswordLabel: "确认新密码",
    changePassword: "更改密码", passwordChanged: "密码已更新。", passwordSaveErr: "无法更改密码：{msg}",
    passwordMismatchErr: "两次输入的新密码不一致。", currentPasswordWrongErr: "当前密码不正确。",
    ledgers: "账本", home: "主页",
    newLedgerPh: "例如：旅行 — 日本", createLedger: "创建账本",
    invitePeople: "邀请成员", inviteAccess: "权限",
    manageAccess: "管理成员", currentMembers: "谁有权限",
    roleOwner: "所有者", roleEditor: "可编辑", roleViewer: "仅查看",
    removeMemberBtn: "移除", removeMemberConfirm: "将 {name} 移出这个账本？",
    ownerOnlyErr: "只有账本所有者才能这样做。",
    pendingInvite: "待接受的邀请", openInviteLink: "打开邀请链接", revokeInviteBtn: "撤销邀请",
    roleEditorHint: "可以查看并添加或修改支出、预算和成员。",
    roleViewerHint: "可以查看全部内容，但不能修改。",
    inviteEmailLabel: "邮箱",
    inviteEmailHint: "这条邀请链接只对该账户有效。",
    inviteEmailRequiredErr: "填写有效邮箱才能生成邀请。",
    generateInvite: "生成邀请链接", inviteLinkReady: "分享这条链接 — 7 天内有效：",
    copyLink: "复制", copiedLink: "已复制",
    inviteJoined: "你已加入账本。", inviteFailed: "接受邀请失败：{msg}",
    inviteTitle: "账本邀请",
    invitePromptNamed: "你被邀请以「{role}」身份加入「{ledger}」。",
    invitePrompt: "你被邀请加入一个账本。",
    inviteAcceptBtn: "接受并加入", inviteDecline: "暂时不用",
    inviteInvalid: "这条邀请链接无效。", inviteExpired: "这个邀请已过期。",
    inviteUsed: "这个邀请已经被使用过了。",
    transactionsCount: "本月 {n} 笔", transactionsCountAll: "{n} 笔交易",
    justNow: "刚刚", minutesAgo: "{n} 分钟前", hoursAgo: "{n} 小时前",
    updatedToday: "今天", updatedYesterday: "昨天", updatedLine: "{when}更新",
    noLedgers: "还没有账本。在下面创建第一个。",
    language: "语言", openLedger: "打开{name}",
    startWith: "选个模板开始", tplHousehold: "家庭预算", tplTravel: "旅行",
    tplPersonal: "个人", tplKid: "小朋友", tplBlank: "空白",
    tplHint: "{n} 个类别 — 之后可以改名或添加",
    tplHintBlank: "没有类别 — 进入账本后自己添加",
    tplDescHousehold: "详细的家庭开支追踪", tplDescPersonal: "个人消费",
    tplDescTravel: "旅行开支分类", tplDescKid: "家务、储蓄与零花钱", tplDescBlank: "从零开始自定义",
    ledgerNameLabel: "账本名称", continueBtn: "继续",
    deleteLedger: "删除账本", renameLedger: "重命名账本",
    deleteLedgerConfirm: "删除「{name}」及其中所有支出？此操作无法撤销。",
    archiveLedger: "归档", archivedLedgers: "已归档账本", archivedShort: "已归档",
    noArchivedLedgers: "还没有归档任何账本。",
    archiveConfirm: "归档「{name}」？其中内容全部保留，只是从列表中隐藏，随时可以在设置中恢复。",
    restoreLedger: "恢复", restoreConfirm: "将「{name}」放回账本列表？",
    currency: "货币",
    tripDates: "旅程日期", tripStartDate: "旅程开始日", tripEndDate: "旅程结束日",
    vaultTitle: "宝藏库", earnedMoney: "赚到钱", boughtSomething: "花了钱",
    kidAdd: "记一笔！", noGoalYet: "还没有目标 — 点这里设置一个！",
    setGoalTitle: "设置心愿清单目标", goalNameLabel: "你想攒钱买什么？",
    goalNamePh: "例如：乐高星球大战", goalAmountLabel: "目标金额", saveGoal: "保存目标",
    goalReached: "🎉 达成目标啦！", recentActivity: "最近活动",
    noKidActivity: "还没有冒险！", kidEmptyCta: "去赚点金币吧！",
    cancellationReminder: "取消提醒", remindMeToCancel: "提醒我取消",
    cancellationReminderTitle: "续约前记得取消{name}",
    upcomingChargeTitle: "{name} 将在 {days} 天后扣款",
    expiryReminderTitle: "{name} {date} 到期",
    pushEnable: "在这台设备上通知我", pushDisable: "停止在这台设备上通知",
    pushBlocked: "通知已被浏览器设置阻止。",
    upcomingChargeReminder: "扣款提醒", remindMeUpcoming: "每次扣款前提醒我",
    daysBeforeLabel: "天前",
    notifications: "通知", noNotifications: "全部搞定，没有待办通知。",
    markAllRead: "全部标记为已读", markAsRead: "标记为已读", dismiss: "移除",
    manageReminders: "管理提醒", noReminders: "还没有设置任何提醒。",
    autoReminderHint: "来自定期规则——到下次扣款会重设。想永久停止请暂停该规则。",
    autoExpiryHint: "来自库存物品——只要还有到期日就会重设。想永久停止请清除该物品的到期日。",
  },
  fr: {
    eyebrow: "Monira",
    signInTitle: "Connexion",
    signInHint: "One simple step toward a better financial life.",
    signUpTitle: "Créer un compte", signUpHint: "Inscrivez-vous, puis créez ou rejoignez un registre.",
    nameLabel: "Nom", namePh: "Le nom affiché dans le registre",
    signUpBtn: "Créer un compte", toSignUp: "Nouveau ici ? Créez un compte", toSignIn: "Vous avez déjà un compte ? Connectez-vous",
    checkEmail: "Presque fini — confirmez votre courriel, puis connectez-vous.",
    usernameRequiredHint: "Obligatoire pour accepter l'invitation — c'est le nom que les autres verront.",
    usernameRequiredErr: "Veuillez entrer un nom avant de continuer.",
    usernameSameAsEmailErr: "Votre nom affiché ne peut pas être identique à votre courriel.",
    email: "Courriel", password: "Mot de passe", signInBtn: "Se connecter", signOut: "Se déconnecter",
    connecting: "Connexion…",
    categories: "Catégories", manageCats: "Gérer les catégories", selectMonth: "Choisir le mois",
    addExpense: "Ajouter une dépense",
    totalSpending: "Dépenses", balance: "Solde", settleUp: "Régler",
    emptyState: "Aucune dépense en {month}. Ajoutez la première ci-dessus.",
    emptyStateDay: "Aucune dépense le {date}.", showAll: "Tout afficher",
    paidByRow: "Payé par {name}", split5050: "Partagé 50/50", personal: "Non partagé",
    uncategorised: "Sans catégorie", edit: "Modifier", delete: "Supprimer",
    deleteConfirm: "Supprimer « {name} » ?",
    stepFooter: "Synchronisé en direct dans votre ménage · À venir : budgets, rapports, lecture de reçus.",
    loadErr: "Impossible d'accéder au registre : {msg}",
    editExpense: "Modifier la dépense", formWhat: "C'était quoi ?", formWhatPh: "ex. épicerie",
    amount: "Montant", date: "Date", addHst: "Ajouter 13 % de TVH",
    category: "Catégorie", whoPaid: "Qui a payé ?", paidBy: "Payé par", split: "Partage",
    noMembersHint: "Aucun membre", noCategoriesHint: "Aucune catégorie",
    noteLabel: "Note (facultatif)", noteDisplay: "Note", notePh: "Note",
    cancel: "Annuler", saveChanges: "Enregistrer",
    newCatPh: "Nom de la nouvelle catégorie", saveCategories: "Enregistrer les catégories", deleteCategory: "Supprimer la catégorie",
    close: "Fermer",
    owesLine: "{debtor} doit {amount} à {creditor}", personalLine: "Dépense personnelle — non partagée",
    settlementDetails: "Détail du règlement", paidThisMonth: "Payé ce mois-ci", sharedShare: "Part des dépenses partagées",
    shouldReceive: "Doit recevoir", shouldPay: "Doit payer", noSharedBills: "Aucune dépense partagée à régler ce mois-ci.",
    sharedLine: "Partagé en {n} — {amount} chacun",
    members: "Membres", manageMembers: "Modifier les membres",
    memberHasExpenses: "Ce membre a encore des dépenses dans ce registre. Réattribuez-les ou supprimez-les d'abord.",
    budget: "Budget", budgetFor: "Budget de {month}", budgetTotal: "Toutes les catégories", editBudget: "Modifier le budget",
    budgetNone: "Aucun budget pour {month}. Donnez un montant à une catégorie ci-dessous.",
    budgetSpent: "Dépensé", budgetLeft: "Restant", budgetOver: "Dépassé",
    budgetSave: "Enregistrer les budgets", budgetClearHint: "Laissez vide pour aucun budget", setBudgetPh: "Définir",
    carryForward: "Reporter au mois prochain", carryForwardDone: "Reporté ✓",
    budgetAmountLabel: "budget de {amount}", budgetOtherMonths: "Autres mois",
    budgetUncat: "Les dépenses sans catégorie ne comptent dans aucun budget.",
    monthlyReport: "Rapports", reportFor: "Dépenses en {month}",
    reportTotal: "Dépenses totales", reportCategories: "Par catégorie",
    reportEmpty: "Aucune dépense enregistrée ce mois-ci.", reportUncategorised: "Sans catégorie",
    compareMonth: "Comparer à",
    compareEmpty: "Rien à comparer — aucune dépense dans l'un ou l'autre mois.",
    compareUnchanged: "Aucun changement", compareNew: "Nouveau ce mois-ci",
    compareGoneLabel: "Disparu ce mois-ci",
    categoryExpenses: "Dépenses — {category}", categoryExpensesEmpty: "Aucune dépense dans cette catégorie ce mois-ci.",
    splitBetween: "Partager", splitWays: "en {n} · {amount} chacun", splitWaysShort: "Partagé en {n}",
    selectAll: "Tout le monde",
    items: "Articles du reçu", itemSplit: "Partagé", itemPersonal: "Personnel", itemDrop: "Pas à moi",
    itemAddToInventory: "Ajouter à l'inventaire", itemAddToGrocery: "Ajouter à la liste de courses",
    itemsHint: "La taxe est répartie sur ce que vous gardez, au prorata du prix.",
    itemsPersonalNote: "{n} personnel · {amount} — enregistré comme une seconde dépense non partagée",
    itemsDropped: "{n} retiré",
    itemsClear: "Effacer les articles", itemsTotalsOff: "Les articles totalisent {sum}, le reçu indique {total}",
    splitNobody: "Cochez au moins une personne pour partager.",
    sharedAmong: "Partagé entre {names}",
    stores: "Commerces enregistrés", rememberStore: "Retenir « {name} »",
    rememberHint: "Les commerces enregistrés sont suggérés pendant la saisie. Rien n'est enregistré sans cette case.",
    newStorePh: "Nom du commerce", saveStores: "Enregistrer les commerces", deleteStore: "Retirer le commerce",
    noStores: "Aucun commerce enregistré. Cochez la case en ajoutant une dépense pour en garder un.",
    // Inventaire / Liste de courses
    addToInventory: "Ajouter à l'inventaire", addToInventoryHint: "Suivre cet achat dans votre inventaire",
    quantity: "Quantité", unit: "Unité", expiryDate: "Date de péremption",
    searchInventoryPh: "Rechercher dans l'inventaire…", noInventoryItems: "Aucun article pour l'instant.",
    addItem: "Ajouter un article", itemNamePh: "Nom de l'article", minQuantityLabel: "Alerte sous (facultatif)",
    editItem: "Modifier l'article", deleteItem: "Supprimer l'article", saveItem: "Enregistrer",
    deleteItemConfirm: "Supprimer « {name} » de votre inventaire ? Cette action est irréversible.",
    lowStock: "Stock faible", expiringSoon: "Bientôt périmé", expired: "Périmé",
    addToGroceryList: "Ajouter à la liste de courses", addedToGroceryList: "« {name} » ajouté à votre liste de courses",
    alreadyOnGroceryList: "« {name} » est déjà sur votre liste de courses. L'ajouter encore ?", addAnyway: "Ajouter quand même",
    addGroceryItemPh: "Ajouter un article…", noGroceryItems: "La liste de courses est vide.",
    priceMatchCheck: "🔍 Comparer les prix", checkingDeals: "Vérification…",
    postalCodePh: "Code postal pour comparer les prix", priceMatchBadge: "Meilleur : {price} chez {merchant}",
    priceMatchBadgeExpired: "Expiré : {price} chez {merchant}",
    dealExpiredHint: "Ce prix de circulaire a expiré — appuyez sur 🔍 pour vérifier à nouveau.",
    postalCodeRequired: "Entrez d'abord votre code postal — les circulaires sont régionales.",
    storeSetup: "Mes magasins", storeSetupHint: "Magasins avec circulaires près de chez vous. Choisissez celui où vous faites vos courses, puis ajoutez d'autres magasins à sa liste d'ajustement de prix.",
    searchStoresPh: "Rechercher un magasin…", myStoresCount: "Mes magasins ({n})", browseStores: "Parcourir",
    myStore: "Mon magasin", markMyStore: "Marquer comme mien",
    storeItemCount: "{n} articles en solde", noStoresForRegion: "Aucune circulaire pour ce code postal — la mise à jour hebdomadaire a lieu le jeudi.",
    noStoresMatch: "Aucun magasin correspondant.",
    priceMatchesQ: "{store} ajusterait-il le prix de ce magasin ?", yes: "Oui", no: "Non", notSure: "Pas sûr",
    shoppingAt: "Achats chez {store}", pmListCount: "{n} magasins dans la liste d'ajustement de prix",
    noMatchListStores: "Aucun magasin dans la liste d'ajustement de prix — ajoutez-en dans Mes magasins.",
    lastConfirmed: "Confirmé le {date}",
    storeNotePh: "Conditions, p. ex. format identique, concurrents locaux seulement",
    includeNonGrocery: "Tous les magasins", typeSupermarkets: "Supermarchés", typeHardware: "Quincaillerie & maison",
    priceMatchMode: "Mode ajustement de prix", priceMatchBtn: "Ajustement de prix", pickShoppingStore: "Dans quel magasin êtes-vous ?",
    noMatchStores: "Aucun magasin marqué comme le vôtre.", changeStore: "Changer de magasin",
    pmWillMatch: "Montrez la circulaire d'un concurrent à la caisse et ils ajusteront le prix.",
    pmWontMatch: "Ce magasin n'ajuste pas les prix — voici où c'est moins cher.",
    pmMatchUnknown: "Incertain que ce magasin ajuste les prix — ça vaut la peine de demander.",
    pmChecking: "Vérification de votre liste…", pmSummary: "{n} article(s) sur {total} moins chers ailleurs",
    pmAlreadyHere: "le moins cher ici, {price}", pmNoDeals: "aucune aubaine",
    dealCheckErr: "Impossible de vérifier les prix : {msg}",
    dealsPending: "Pas encore de prix de circulaire pour cette région — la première mise à jour n'a pas encore eu lieu.",
    dealsStale: "Les prix des circulaires sont périmés (dernière mise à jour : {date}), donc cette absence d'aubaines n'est pas fiable.",
    dealsNoneFound: "Aucune aubaine trouvée pour cet article.",
    priceMatchTitle: "Prix en circulaire : {name}", priceMatchHint: "Montrez ceci à la caisse pour l'ajustement de prix. Touchez-en un pour l'enregistrer.",
    dealValidUntil: "Valide jusqu'au {date}", dealNoImage: "Cette aubaine n'a pas d'image.",
    viewFullFlyer: "Voir la circulaire complète", completedCount: "Terminés ({n})",
    scanBarcode: "Scanner un produit", scanNoProduct: "Impossible d'identifier ce produit. Essayez le code-barres ou le devant de l'emballage.",
    invCategory: "Catégorie", invLocation: "Rangé dans", manageLabels: "Gérer",
    noInvCategory: "Sans catégorie", noLocation: "Aucun emplacement", allLocations: "Partout",
    invCategories: "Catégories d'inventaire", invLocations: "Emplacements de rangement",
    noInvCategories: "Aucune catégorie pour l'instant.", noInvLocations: "Aucun emplacement pour l'instant.",
    newInvCategoryPh: "Nouvelle catégorie, p. ex. Produits laitiers", newInvLocationPh: "Nouvel emplacement, p. ex. Congélateur",
    labelDeleteHint: "La suppression ne fait que déclasser les articles — ils restent dans l'inventaire.",
    brandLabel: "Marque", brandPh: "p. ex. Neilson",
    brandHint: "Facultatif — précise la recherche dans les circulaires.",
    moreActions: "Plus d'actions",
    backToDashboard: "Retour",
    ledgerCard: "Registre et transactions", totalMonthSpent: "Dépenses totales du mois", lastEntry: "Dernière entrée",
    navDropdownLabel: "Registres",
    inventoryCardTitle: "Centre d'inventaire", trackedItemsLabel: "Articles suivis :", lowStockAlert: "{n} article(s) en stock faible !",
    groceryCardTitle: "Courses intelligentes et offres", groceryShortTitle: "Courses intelligentes",
    pendingItemsLabel: "Articles en attente :", dealsActiveBadge: "Offres actives ! · Comparer les prix",
    viewingLedger: "Affichage : {name}",
    budgetBannerLine: "DÉPENSÉ : {spent}/{budget} ({pct} %)",
    budgetRemainingLine: "Restant : {amount}", budgetOverLine: "Dépassement de {amount}",
    noBudgetSetPrompt: "Aucun budget défini — touchez pour en ajouter un",
    recurring: "Dépenses récurrentes", recurringAdd: "Ajouter", noRecurring: "Aucune dépense récurrente.",
    recurNew: "Nouvelle dépense récurrente", recurEdit: "Modifier la dépense récurrente",
    freqWeekly: "Hebdomadaire", freqMonthly: "Mensuelle", freqYearly: "Annuelle", frequency: "Fréquence",
    startDate: "Date de début", nextDue: "Prochaine", paused: "En pause",
    pauseRule: "Pause", resumeRule: "Reprendre", saveRule: "Enregistrer",
    recurDeleteConfirm: "Supprimer cette règle récurrente ? Les dépenses déjà créées restent.",
    csvImportTitle: "Importer des dépenses", csvNoRows: "Aucune ligne exploitable dans ce fichier.",
    csvDefaultOwner: "Titulaire de la carte / Payé par", csvRowCount: "{n} lignes prêtes à importer",
    csvConfirm: "Confirmer et importer", csvImporting: "Importation…",
    csvResult: "{ok} sur {total} importées.", csvResultFail: " {fail} en échec.",
    csvRemoveRow: "Retirer la ligne",
    newMemberPh: "Nom du nouveau membre", saveMembers: "Enregistrer les membres", deleteMember: "Retirer le membre",
    receiptTitle: "Articles du reçu",
    receiptEmpty: "Aucun reçu joint. Après la lecture d'un reçu, ses articles apparaîtront ici.",
    scanReceipt: "Scanner un reçu", uploadReceipt: "Téléverser un reçu", scanning: "Lecture du reçu…",
    scanHint: "ou remplissez vous-même", scanFailed: "Impossible de lire ce reçu : {msg}", saveFailed: "Enregistrement impossible : {msg}",
    scanRetryIn: "Lecteur occupé — nouvelle tentative dans {secs} s…",
    scanRateLimited: "trop de lectures d'un coup. Attendez une minute et réessayez.",
    scanItemsWithAi: "Lire les articles avec l'IA",
    currencyMismatch: "Ce reçu semble être en {scanned}, mais ce registre est en {ledger}. Le montant a été gardé tel quel — aucune conversion.",
    editCategories: "Modifier les catégories", menu: "Menu",
    settings: "Paramètres", appearance: "Apparence", light: "Clair", dark: "Sombre", accentColor: "Couleur d'accent",
    saveAccent: "Enregistrer la couleur", accentSaved: "Enregistré", accentSaveErr: "Impossible d'enregistrer votre couleur : {msg}",
    profile: "Profil", editName: "Modifier le nom", saveName: "Enregistrer le nom", nameSaved: "Enregistré", nameSaveErr: "Impossible d'enregistrer votre nom : {msg}",
    currentPasswordLabel: "Mot de passe actuel", newPasswordLabel: "Nouveau mot de passe", confirmPasswordLabel: "Confirmer le nouveau mot de passe",
    changePassword: "Changer le mot de passe", passwordChanged: "Mot de passe mis à jour.", passwordSaveErr: "Impossible de changer le mot de passe : {msg}",
    passwordMismatchErr: "Les nouveaux mots de passe ne correspondent pas.", currentPasswordWrongErr: "Le mot de passe actuel est incorrect.",
    ledgers: "Registres", home: "Accueil",
    newLedgerPh: "ex. Voyage — Japon", createLedger: "Créer le registre",
    invitePeople: "Inviter des personnes", inviteAccess: "Leur accès",
    manageAccess: "Gérer les membres", currentMembers: "Qui a accès",
    roleOwner: "Propriétaire", roleEditor: "Éditeur", roleViewer: "Lecteur",
    removeMemberBtn: "Retirer", removeMemberConfirm: "Retirer {name} de ce registre ?",
    ownerOnlyErr: "Seul le propriétaire du registre peut faire cela.",
    pendingInvite: "Invitation en attente", openInviteLink: "Ouvrir le lien d'invitation", revokeInviteBtn: "Révoquer l'invitation",
    roleEditorHint: "Peut voir et modifier les dépenses, budgets et membres.",
    roleViewerHint: "Peut tout voir, sans rien modifier.",
    inviteEmailLabel: "Courriel",
    inviteEmailHint: "Le lien d'invitation ne fonctionnera que pour ce compte.",
    inviteEmailRequiredErr: "Entrez un courriel valide pour générer une invitation.",
    generateInvite: "Générer le lien", inviteLinkReady: "Partagez ce lien — valide 7 jours :",
    copyLink: "Copier", copiedLink: "Copié",
    inviteJoined: "Vous avez rejoint le registre.", inviteFailed: "Impossible d'accepter l'invitation : {msg}",
    inviteTitle: "Invitation au registre",
    invitePromptNamed: "Vous êtes invité à rejoindre {ledger} comme {role}.",
    invitePrompt: "Vous êtes invité à rejoindre un registre.",
    inviteAcceptBtn: "Accepter et rejoindre", inviteDecline: "Pas maintenant",
    inviteInvalid: "Ce lien d'invitation n'est pas valide.", inviteExpired: "Cette invitation a expiré.",
    inviteUsed: "Cette invitation a déjà été utilisée.",
    transactionsCount: "{n} ce mois-ci", transactionsCountAll: "{n} transactions",
    justNow: "À l'instant", minutesAgo: "il y a {n} min", hoursAgo: "il y a {n} h",
    updatedToday: "aujourd'hui", updatedYesterday: "hier", updatedLine: "Mis à jour {when}",
    noLedgers: "Aucun registre. Créez le premier ci-dessous.",
    language: "Langue", openLedger: "Ouvrir {name}",
    startWith: "Commencer avec un modèle", tplHousehold: "Budget familial", tplTravel: "Voyage",
    tplPersonal: "Personnel", tplKid: "Enfants", tplBlank: "Vierge",
    tplHint: "{n} catégories — renommables, et vous pouvez en ajouter",
    tplHintBlank: "Aucune catégorie — ajoutez les vôtres depuis le registre",
    tplDescHousehold: "Suivi détaillé du foyer", tplDescPersonal: "Dépenses individuelles",
    tplDescTravel: "Catégories de dépenses de voyage", tplDescKid: "Corvées, épargne et argent de poche", tplDescBlank: "Partir de zéro",
    ledgerNameLabel: "Nom du registre", continueBtn: "Continuer",
    deleteLedger: "Supprimer le registre", renameLedger: "Renommer le registre",
    deleteLedgerConfirm: "Supprimer « {name} » et toutes ses dépenses ? Action irréversible.",
    archiveLedger: "Archiver", archivedLedgers: "Registres archivés", archivedShort: "Archivés",
    noArchivedLedgers: "Rien d'archivé pour l'instant.",
    archiveConfirm: "Archiver « {name} » ? Tout son contenu est conservé, il disparaît simplement de votre liste — restaurable à tout moment depuis les Réglages.",
    restoreLedger: "Restaurer", restoreConfirm: "Remettre « {name} » dans votre liste de registres ?",
    currency: "Devise",
    tripDates: "Dates du voyage", tripStartDate: "Date de début du voyage", tripEndDate: "Date de fin du voyage",
    vaultTitle: "Coffre au trésor", earnedMoney: "Argent gagné", boughtSomething: "Argent dépensé",
    kidAdd: "Ajouter !", noGoalYet: "Pas encore d'objectif — touche ici pour en fixer un !",
    setGoalTitle: "Fixer un objectif", goalNameLabel: "Pour quoi économises-tu ?",
    goalNamePh: "ex. Lego Star Wars", goalAmountLabel: "Montant visé", saveGoal: "Enregistrer l'objectif",
    goalReached: "🎉 Objectif atteint !", recentActivity: "Activité récente",
    noKidActivity: "Pas encore d'aventures !", kidEmptyCta: "Gagnons des pièces !",
    cancellationReminder: "Rappel d'annulation", remindMeToCancel: "Me rappeler d'annuler",
    cancellationReminderTitle: "Annuler {name} avant le renouvellement",
    upcomingChargeTitle: "Prélèvement de {name} dans {days} jours",
    expiryReminderTitle: "{name} périme le {date}",
    pushEnable: "M'avertir sur cet appareil", pushDisable: "Ne plus avertir cet appareil",
    pushBlocked: "Les notifications sont bloquées dans les réglages de votre navigateur.",
    upcomingChargeReminder: "Rappel de prélèvement", remindMeUpcoming: "Me rappeler avant chaque prélèvement",
    daysBeforeLabel: "jours avant",
    notifications: "Notifications", noNotifications: "Tout est à jour !",
    markAllRead: "Tout marquer comme lu", markAsRead: "Marquer comme lu", dismiss: "Ignorer",
    manageReminders: "Gérer les rappels", noReminders: "Aucun rappel défini.",
    autoReminderHint: "Issu d'une règle récurrente — se réinitialise à la prochaine échéance. Mettez la règle en pause pour l'arrêter définitivement.",
    autoExpiryHint: "Issu d'un article de l'inventaire — se réinitialise tant qu'il a une date de péremption. Supprimez cette date pour l'arrêter définitivement.",
  },
  es: {
    eyebrow: "Monira",
    signInTitle: "Iniciar sesión",
    signInHint: "One simple step toward a better financial life.",
    signUpTitle: "Crear cuenta", signUpHint: "Regístrate y luego crea o únete a un libro.",
    nameLabel: "Nombre", namePh: "Cómo aparecerás en el libro",
    signUpBtn: "Crear cuenta", toSignUp: "¿Nuevo aquí? Crea una cuenta", toSignIn: "¿Ya tienes cuenta? Inicia sesión",
    checkEmail: "Casi listo: confirma tu correo y luego inicia sesión.",
    usernameRequiredHint: "Obligatorio para aceptar la invitación: es el nombre que verán los demás.",
    usernameRequiredErr: "Escribe un nombre antes de continuar.",
    usernameSameAsEmailErr: "Tu nombre visible no puede ser igual a tu correo.",
    email: "Correo", password: "Contraseña", signInBtn: "Iniciar sesión", signOut: "Cerrar sesión",
    connecting: "Conectando…",
    categories: "Categorías", manageCats: "Gestionar categorías", selectMonth: "Elegir mes",
    addExpense: "Añadir gasto",
    totalSpending: "Gasto", balance: "Saldo", settleUp: "Liquidar",
    emptyState: "No hay gastos en {month}. Añade el primero arriba.",
    emptyStateDay: "No hay gastos el {date}.", showAll: "Ver todo",
    paidByRow: "Pagó {name}", split5050: "Dividido 50/50", personal: "Sin dividir",
    uncategorised: "Sin categoría", edit: "Editar", delete: "Eliminar",
    deleteConfirm: '¿Eliminar "{name}"?',
    stepFooter: "Sincronizado en vivo con tu hogar · Próximamente: presupuestos, informes, lectura de recibos.",
    loadErr: "No se pudo acceder al libro: {msg}",
    editExpense: "Editar gasto", formWhat: "¿Qué fue?", formWhatPh: "p. ej. compra del súper",
    amount: "Importe", date: "Fecha", addHst: "Añadir 13 % de HST",
    category: "Categoría", whoPaid: "¿Quién pagó?", paidBy: "Pagado por", split: "División",
    noMembersHint: "Aún no hay miembros", noCategoriesHint: "Aún no hay categorías",
    noteLabel: "Nota (opcional)", noteDisplay: "Nota", notePh: "Nota",
    cancel: "Cancelar", saveChanges: "Guardar cambios",
    newCatPh: "Nombre de la nueva categoría", saveCategories: "Guardar categorías", deleteCategory: "Eliminar categoría",
    close: "Cerrar",
    owesLine: "{debtor} le debe {amount} a {creditor}", personalLine: "Gasto personal, no se divide",
    settlementDetails: "Detalle de la liquidación", paidThisMonth: "Pagado este mes", sharedShare: "Parte de gastos compartidos",
    shouldReceive: "Debe recibir", shouldPay: "Debe pagar", noSharedBills: "No hay gastos compartidos que liquidar este mes.",
    sharedLine: "Dividido entre {n} — {amount} cada uno",
    members: "Miembros", manageMembers: "Editar miembros",
    memberHasExpenses: "Ese miembro aún tiene gastos en este libro. Reasígnalos o elimínalos primero.",
    budget: "Presupuesto", budgetFor: "Presupuesto de {month}", budgetTotal: "Todas las categorías", editBudget: "Editar presupuesto",
    budgetNone: "Sin presupuestos para {month}. Asigna un importe a cualquier categoría abajo.",
    budgetSpent: "Gastado", budgetLeft: "Restante", budgetOver: "Excedido",
    budgetSave: "Guardar presupuestos", budgetClearHint: "Deja la categoría vacía para no ponerle presupuesto", setBudgetPh: "Poner",
    carryForward: "Llevar al próximo mes", carryForwardDone: "Llevado ✓",
    budgetAmountLabel: "presupuesto de {amount}", budgetOtherMonths: "Otros meses",
    budgetUncat: "El gasto sin categoría no cuenta para ningún presupuesto.",
    monthlyReport: "Informes", reportFor: "Gastos de {month}",
    reportTotal: "Gasto total", reportCategories: "Por categoría",
    reportEmpty: "Aún no hay gastos registrados este mes.", reportUncategorised: "Sin categoría",
    compareMonth: "Comparar con",
    compareEmpty: "Nada que comparar: no hay gastos en ninguno de los dos meses.",
    compareUnchanged: "Sin cambios", compareNew: "Nuevo este mes",
    compareGoneLabel: "Ya no aparece",
    categoryExpenses: "Gastos en {category}", categoryExpensesEmpty: "No hay gastos de esta categoría este mes.",
    splitBetween: "Dividir", splitWays: "entre {n} · {amount} cada uno", splitWaysShort: "Entre {n}",
    selectAll: "Todos",
    items: "Artículos del recibo", itemSplit: "Compartido", itemPersonal: "Personal", itemDrop: "No es mío",
    itemAddToInventory: "Añadir al inventario", itemAddToGrocery: "Añadir a la lista de la compra",
    itemsHint: "El impuesto se reparte entre lo que conserves, en proporción al precio.",
    itemsPersonalNote: "{n} personal · {amount} — se guarda como un segundo gasto sin dividir",
    itemsDropped: "{n} quitado",
    itemsClear: "Borrar artículos", itemsTotalsOff: "Los artículos suman {sum}, el recibo dice {total}",
    splitNobody: "Marca al menos a una persona para dividir.",
    sharedAmong: "Dividido entre {names}",
    stores: "Tiendas guardadas", rememberStore: 'Recordar "{name}"',
    rememberHint: "Las tiendas guardadas se sugieren mientras escribes. No se guarda nada si no marcas esta casilla.",
    newStorePh: "Nombre de la tienda", saveStores: "Guardar tiendas", deleteStore: "Quitar tienda",
    noStores: "Aún no hay tiendas guardadas. Marca la casilla al añadir un gasto para guardar una.",
    // Inventario / Lista de la compra
    addToInventory: "Añadir al inventario", addToInventoryHint: "Registra esta compra en tu inventario",
    quantity: "Cantidad", unit: "Unidad", expiryDate: "Fecha de caducidad",
    searchInventoryPh: "Buscar en el inventario…", noInventoryItems: "Aún no hay artículos.",
    addItem: "Añadir artículo", itemNamePh: "Nombre del artículo", minQuantityLabel: "Avisar por debajo de (opcional)",
    editItem: "Editar artículo", deleteItem: "Eliminar artículo", saveItem: "Guardar cambios",
    deleteItemConfirm: '¿Eliminar "{name}" de tu inventario? Esta acción no se puede deshacer.',
    lowStock: "Pocas existencias", expiringSoon: "Caduca pronto", expired: "Caducado",
    addToGroceryList: "Añadir a la lista de la compra", addedToGroceryList: '"{name}" añadido a tu lista de la compra',
    alreadyOnGroceryList: '"{name}" ya está en tu lista de la compra. ¿Añadirlo otra vez?', addAnyway: "Añadir igualmente",
    addGroceryItemPh: "Añadir un artículo…", noGroceryItems: "La lista de la compra está vacía.",
    priceMatchCheck: "🔍 Comparar precios", checkingDeals: "Comprobando…",
    postalCodePh: "Código postal para comparar precios", priceMatchBadge: "Mejor: {price} en {merchant}",
    priceMatchBadgeExpired: "Caducado: {price} en {merchant}",
    dealExpiredHint: "Este precio del folleto ha caducado — toca 🔍 para volver a comprobarlo.",
    postalCodeRequired: "Introduce primero tu código postal — las ofertas son regionales.",
    storeSetup: "Mis tiendas", storeSetupHint: "Tiendas con folletos cerca de ti. Elige la tienda donde realmente compras, luego añade otras a su lista de igualación de precios.",
    searchStoresPh: "Buscar tiendas…", myStoresCount: "Mis tiendas ({n})", browseStores: "Explorar",
    myStore: "Mi tienda", markMyStore: "Marcar como mía",
    storeItemCount: "{n} artículos en oferta", noStoresForRegion: "Aún no hay folletos para este código postal — la actualización semanal es el jueves.",
    noStoresMatch: "Ninguna tienda coincide.",
    priceMatchesQ: "¿{store} igualaría el precio de esta tienda?", yes: "Sí", no: "No", notSure: "No estoy seguro",
    shoppingAt: "Comprando en {store}", pmListCount: "{n} tiendas en la lista de igualación de precios",
    noMatchListStores: "Aún no hay tiendas en la lista de igualación de precios — añade algunas en Mis tiendas.",
    lastConfirmed: "Confirmado el {date}",
    storeNotePh: "Condiciones, p. ej. mismo formato, solo competidores locales",
    includeNonGrocery: "Todas las tiendas", typeSupermarkets: "Supermercados", typeHardware: "Ferretería y hogar",
    priceMatchMode: "Modo igualar precios", priceMatchBtn: "Igualar precios", pickShoppingStore: "¿En qué tienda estás comprando?",
    noMatchStores: "Aún no has marcado ninguna tienda como tuya.", changeStore: "Cambiar de tienda",
    pmWillMatch: "Muestra el folleto de un competidor en caja y te igualarán el precio.",
    pmWontMatch: "Esta tienda no iguala precios — aquí está dónde sale más barato.",
    pmMatchUnknown: "No se sabe si esta tienda iguala precios — vale la pena preguntar.",
    pmChecking: "Revisando tu lista…", pmSummary: "{n} de {total} artículos más baratos en otra tienda",
    pmAlreadyHere: "más barato aquí, {price}", pmNoDeals: "sin oferta de folleto",
    dealCheckErr: "No se pudieron comprobar los precios: {msg}",
    dealsPending: "Aún no hay precios de folleto para esta zona — la primera actualización todavía no se ha ejecutado.",
    dealsStale: "Los precios de folleto están desactualizados (última actualización: {date}), así que este «sin ofertas» no es fiable.",
    dealsNoneFound: "No se encontraron ofertas de folleto para este artículo.",
    priceMatchTitle: "Precios de folleto: {name}", priceMatchHint: "Muestra esto en caja para igualar el precio. Toca uno para guardarlo en tu lista.",
    dealValidUntil: "Válido hasta el {date}", dealNoImage: "Esta oferta no tiene imagen.",
    viewFullFlyer: "Ver el folleto completo", completedCount: "Completados ({n})",
    scanBarcode: "Escanear un producto", scanNoProduct: "No se pudo identificar. Prueba con el código de barras o el frente del envase.",
    invCategory: "Categoría", invLocation: "Guardado en", manageLabels: "Gestionar",
    noInvCategory: "Sin categoría", noLocation: "Sin ubicación", allLocations: "En todas partes",
    invCategories: "Categorías de inventario", invLocations: "Ubicaciones de almacenamiento",
    noInvCategories: "Aún no hay categorías.", noInvLocations: "Aún no hay ubicaciones.",
    newInvCategoryPh: "Nueva categoría, p. ej. Lácteos", newInvLocationPh: "Nueva ubicación, p. ej. Congelador",
    labelDeleteHint: "Borrar solo desclasifica los artículos — los artículos siguen ahí.",
    brandLabel: "Marca", brandPh: "p. ej. Neilson",
    brandHint: "Opcional — afina la búsqueda en los folletos.",
    moreActions: "Más acciones",
    backToDashboard: "Volver",
    ledgerCard: "Registro y transacciones", totalMonthSpent: "Gasto total del mes", lastEntry: "Última entrada",
    navDropdownLabel: "Libros",
    inventoryCardTitle: "Centro de inventario", trackedItemsLabel: "Artículos registrados:", lowStockAlert: "¡{n} artículo(s) con poco stock!",
    groceryCardTitle: "Compras inteligentes y ofertas", groceryShortTitle: "Compras inteligentes",
    pendingItemsLabel: "Artículos pendientes:", dealsActiveBadge: "¡Ofertas activas! · Comparar precios",
    viewingLedger: "Viendo: {name}",
    budgetBannerLine: "GASTADO: {spent}/{budget} ({pct}%)",
    budgetRemainingLine: "Restante: {amount}", budgetOverLine: "Excedido en {amount}",
    noBudgetSetPrompt: "Sin presupuesto — toca para añadir uno",
    recurring: "Gastos recurrentes", recurringAdd: "Añadir", noRecurring: "Aún no hay gastos recurrentes.",
    recurNew: "Nuevo gasto recurrente", recurEdit: "Editar gasto recurrente",
    freqWeekly: "Semanal", freqMonthly: "Mensual", freqYearly: "Anual", frequency: "Frecuencia",
    startDate: "Fecha de inicio", nextDue: "Próximo", paused: "En pausa",
    pauseRule: "Pausar", resumeRule: "Reanudar", saveRule: "Guardar",
    recurDeleteConfirm: "¿Eliminar esta regla recurrente? Los gastos ya creados se conservan.",
    csvImportTitle: "Importar gastos", csvNoRows: "No se encontraron filas utilizables en ese archivo.",
    csvDefaultOwner: "Titular de la tarjeta / Pagado por", csvRowCount: "{n} filas listas para importar",
    csvConfirm: "Confirmar e importar", csvImporting: "Importando…",
    csvResult: "Importadas {ok} de {total}.", csvResultFail: " {fail} fallaron.",
    csvRemoveRow: "Quitar fila",
    newMemberPh: "Nombre del nuevo miembro", saveMembers: "Guardar miembros", deleteMember: "Quitar miembro",
    receiptTitle: "Artículos del recibo",
    receiptEmpty: "Aún no hay recibo adjunto. Al escanear uno, sus artículos aparecerán aquí.",
    scanReceipt: "Escanear recibo", uploadReceipt: "Subir recibo", scanning: "Leyendo el recibo…",
    scanHint: "o rellénalo tú", scanFailed: "No se pudo leer ese recibo: {msg}", saveFailed: "No se pudo guardar: {msg}",
    scanRetryIn: "Escáner ocupado — reintentando en {secs} s…",
    scanRateLimited: "demasiados escaneos seguidos. Espera un minuto e inténtalo de nuevo.",
    scanItemsWithAi: "Leer los artículos con IA",
    currencyMismatch: "Este recibo parece estar en {scanned}, pero este libro usa {ledger}. El importe se mantuvo tal cual, sin conversión.",
    editCategories: "Editar categorías", menu: "Menú",
    settings: "Ajustes", appearance: "Apariencia", light: "Claro", dark: "Oscuro", accentColor: "Color de acento",
    saveAccent: "Guardar color", accentSaved: "Guardado", accentSaveErr: "No se pudo guardar tu color: {msg}",
    profile: "Perfil", editName: "Editar nombre", saveName: "Guardar nombre", nameSaved: "Guardado", nameSaveErr: "No se pudo guardar tu nombre: {msg}",
    currentPasswordLabel: "Contraseña actual", newPasswordLabel: "Nueva contraseña", confirmPasswordLabel: "Confirmar nueva contraseña",
    changePassword: "Cambiar contraseña", passwordChanged: "Contraseña actualizada.", passwordSaveErr: "No se pudo cambiar la contraseña: {msg}",
    passwordMismatchErr: "Las nuevas contraseñas no coinciden.", currentPasswordWrongErr: "La contraseña actual es incorrecta.",
    ledgers: "Libros", home: "Inicio",
    newLedgerPh: "p. ej. Viaje — Japón", createLedger: "Crear libro",
    invitePeople: "Invitar personas", inviteAccess: "Su acceso",
    manageAccess: "Gestionar miembros", currentMembers: "Quién tiene acceso",
    roleOwner: "Propietario", roleEditor: "Editor", roleViewer: "Lector",
    removeMemberBtn: "Quitar", removeMemberConfirm: "¿Quitar a {name} de este libro?",
    ownerOnlyErr: "Solo el propietario del libro puede hacer esto.",
    pendingInvite: "Invitación pendiente", openInviteLink: "Abrir enlace de invitación", revokeInviteBtn: "Revocar invitación",
    roleEditorHint: "Puede ver y añadir o cambiar gastos, presupuestos y miembros.",
    roleViewerHint: "Puede verlo todo, pero no hacer cambios.",
    inviteEmailLabel: "Correo",
    inviteEmailHint: "El enlace de invitación solo funcionará para esta cuenta.",
    inviteEmailRequiredErr: "Escribe un correo válido para generar una invitación.",
    generateInvite: "Generar enlace", inviteLinkReady: "Comparte este enlace — válido 7 días:",
    copyLink: "Copiar", copiedLink: "Copiado",
    inviteJoined: "Te has unido al libro.", inviteFailed: "No se pudo aceptar la invitación: {msg}",
    inviteTitle: "Invitación al libro",
    invitePromptNamed: "Te han invitado a unirte a {ledger} como {role}.",
    invitePrompt: "Te han invitado a unirte a un libro.",
    inviteAcceptBtn: "Aceptar y unirme", inviteDecline: "Ahora no",
    inviteInvalid: "Este enlace de invitación no es válido.", inviteExpired: "Esta invitación ha caducado.",
    inviteUsed: "Esta invitación ya se ha usado.",
    transactionsCount: "{n} este mes", transactionsCountAll: "{n} transacciones",
    justNow: "Ahora mismo", minutesAgo: "hace {n} min", hoursAgo: "hace {n} h",
    updatedToday: "hoy", updatedYesterday: "ayer", updatedLine: "Actualizado {when}",
    noLedgers: "Aún no hay libros. Crea el primero abajo.",
    language: "Idioma", openLedger: "Abrir {name}",
    startWith: "Empezar con una plantilla", tplHousehold: "Presupuesto del hogar", tplTravel: "Viaje",
    tplPersonal: "Personal", tplKid: "Niños", tplBlank: "En blanco",
    tplHint: "{n} categorías — puedes renombrarlas o añadir más",
    tplHintBlank: "Sin categorías — añade las tuyas dentro del libro",
    tplDescHousehold: "Seguimiento detallado del hogar", tplDescPersonal: "Gastos individuales",
    tplDescTravel: "Categorías de gastos de viaje", tplDescKid: "Tareas, ahorros y mesada", tplDescBlank: "Empezar desde cero",
    ledgerNameLabel: "Nombre del libro", continueBtn: "Continuar",
    deleteLedger: "Eliminar libro", renameLedger: "Renombrar libro",
    deleteLedgerConfirm: '¿Eliminar "{name}" y todos sus gastos? No se puede deshacer.',
    archiveLedger: "Archivar", archivedLedgers: "Libros archivados", archivedShort: "Archivados",
    noArchivedLedgers: "Nada archivado todavía.",
    archiveConfirm: '¿Archivar "{name}"? Conserva todo su contenido y desaparece de tu lista — puedes restaurarlo cuando quieras desde Ajustes.',
    restoreLedger: "Restaurar", restoreConfirm: '¿Devolver "{name}" a tu lista de libros?',
    currency: "Moneda",
    tripDates: "Fechas del viaje", tripStartDate: "Fecha de inicio del viaje", tripEndDate: "Fecha de fin del viaje",
    vaultTitle: "Cofre del tesoro", earnedMoney: "Dinero ganado", boughtSomething: "Dinero gastado",
    kidAdd: "¡Añadir!", noGoalYet: "Aún no hay meta — ¡toca aquí para poner una!",
    setGoalTitle: "Establecer una meta", goalNameLabel: "¿Para qué estás ahorrando?",
    goalNamePh: "p. ej. Lego Star Wars", goalAmountLabel: "Monto objetivo", saveGoal: "Guardar meta",
    goalReached: "🎉 ¡Meta alcanzada!", recentActivity: "Actividad reciente",
    noKidActivity: "¡Aún no hay aventuras!", kidEmptyCta: "¡Vamos a ganar monedas!",
    cancellationReminder: "Recordatorio de cancelación", remindMeToCancel: "Recuérdame cancelar",
    cancellationReminderTitle: "Cancela {name} antes de que se renueve",
    upcomingChargeTitle: "Cargo próximo de {name} en {days} días",
    expiryReminderTitle: "{name} caduca el {date}",
    pushEnable: "Avisarme en este dispositivo", pushDisable: "Dejar de avisar en este dispositivo",
    pushBlocked: "Las notificaciones están bloqueadas en los ajustes de tu navegador.",
    upcomingChargeReminder: "Recordatorio de cargo", remindMeUpcoming: "Recuérdame antes de cada cargo",
    daysBeforeLabel: "días antes",
    notifications: "Notificaciones", noNotifications: "¡Estás al día!",
    markAllRead: "Marcar todo como leído", markAsRead: "Marcar como leído", dismiss: "Descartar",
    manageReminders: "Gestionar recordatorios", noReminders: "No hay recordatorios.",
    autoReminderHint: "Viene de una regla recurrente: se reinicia en el próximo cobro. Pausa la regla para detenerlo definitivamente.",
    autoExpiryHint: "Viene de un artículo del inventario: se reinicia mientras tenga fecha de caducidad. Borra esa fecha para detenerlo definitivamente.",
  },
};
// Order here is the order of the toggle in Settings. `zh` predates the others
// and stays the key for Traditional/Cantonese — renaming it would reset the
// stored preference of everyone already using it.
const LANGS = [["en", "EN"], ["zh", "繁中"], ["zh-Hans", "简中"], ["fr", "FR"], ["es", "ES"]];
const interpolate = (str, vars) =>
  vars ? str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`)) : str;
const makeT = (lang) => (key, vars) =>
  interpolate((STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key, vars);
// Canadian variants where they exist — the app is CAD/HST by default, and
// fr-CA writes dates the way people here read them.
const DATE_LOCALES = { zh: "zh-Hant", "zh-Hans": "zh-Hans", fr: "fr-CA", es: "es-ES" };
const dateLocale = (lang) => DATE_LOCALES[lang] || "en-CA";
// Category names are deliberately language-neutral — one name, shown as-is in both
// EN and 繁中. `lang` is still accepted so call sites read consistently with the
// rest of the UI, which does translate.
const catName = (c) => (!c ? "" : c.name || c.nameZh || "");
// Emoji, not an icon library — category names are language-neutral canonical
// English (see catName), so an exact-match lookup covers every TEMPLATES
// name (db.js) with no per-language duplication. A custom/renamed category
// just falls through to the generic tag.
const CATEGORY_ICONS = {
  rent: "🏠", utilities: "💡", household: "🧹", grocery: "🛒",
  "food delivery": "🛵", "dine in": "🍽️", entertainment: "🎬",
  flights: "✈️", accommodation: "🏨", food: "🍔", transport: "🚌",
  activities: "🎡", shopping: "🛍️", health: "💊", subscriptions: "📱", other: "🏷️",
  chores: "🧹", snacks: "🍦", toys: "🧸", games: "🎮", gifts: "🎁", allowance: "💰",
};
const categoryIcon = (c) => (c ? CATEGORY_ICONS[catName(c).toLowerCase()] || "🏷️" : "❔");

// Ledger-level currency (travel only — see TEMPLATE_FEATURES.hasCurrency).
// A module var instead of a threaded prop: only one <Ledger> is ever mounted
// at a time, and it sets this synchronously before any child renders.
let activeCurrency = "CAD";
const moneyFmts = new Map();
const moneyFmt = (currency) => {
  if (!moneyFmts.has(currency)) moneyFmts.set(currency, new Intl.NumberFormat("en-CA", { style: "currency", currency }));
  return moneyFmts.get(currency);
};
const money = (n) => moneyFmt(activeCurrency).format(Number(n || 0));
const currencySymbol = (currency) =>
  moneyFmt(currency).formatToParts(0).find((p) => p.type === "currency")?.value || currency;
const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "JPY", "KRW", "TWD", "HKD", "CNY", "THB", "AUD", "SGD"];
// Settings → Accent colour. A small, curated set matching the app's own
// glassmorphic glow palette — not MEMBER_COLORS, which stay saturated on
// purpose for telling people apart at a glance in chips and charts, a
// different job from an app-wide theme colour.
//
// green and blue are pulled verbatim from colours already on screen
// elsewhere (the Home budget bar's fill, the Travel ledger card's accent),
// for visual consistency with the app's own chrome — deliberately, over the
// older rule below, which the other three still follow:
//
// Pastel/light entries were tried and pulled: the accent isn't only a fill
// behind white text (where ACCENT_INK's light/dark switch would cover it) —
// it's also used bare, as the colour of text and borders directly on the
// page (unselected pills, links), and there's no "ink" to swap there. A pale
// accent just goes low-contrast and washes out. So every other entry here is
// kept dark enough (WCAG luminance <= 0.179) to clear ~4.5:1 against white on
// its own, not just as a fill — green/blue trade a little of that contrast
// for matching the exact colours already established elsewhere in the app.
// [0] (green) is the default — it matches the mint/teal glow already
// hardcoded across the app's buttons and hover states, so a fresh install's
// picked accent doesn't clash with its own chrome.
const ACCENT_COLORS = [
  "#2DD4BF", // mint teal — original app glow colour
  "#38BDF8", // sky blue
  "#A855F7", // purple
  "#EC4899", // pink
  "#F97316", // orange
];
// WCAG relative luminance -> pick whichever of white/near-black ink contrasts
// better against that background. Crossover is ~0.179 (solving
// 1.05/(L+.05) = (L+.05)/.05 for L); this is the same formula the earlier
// hand-checked "~4.8:1" comment relied on, just automated across a bigger
// palette instead of eyeballing each new addition.
const relLuminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const accentInkFor = (hex) => (relLuminance(hex) > 0.179 ? "#1A1F24" : "#fff");
const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };
// `amount` of `hex` blended into `base`. Used to derive the settle-up/shared
// "OK" tint from whatever accent is picked, the same way the light/dark
// theme's own OK_BG/OK_INK were hand-picked as a pale tint + a readable ink
// of the original fixed teal — this just does that blend for an arbitrary
// accent instead of one hardcoded color.
const mix = (hex, base, amount) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(base.slice(1), 16);
  const chan = (shift) => Math.round(((a >> shift) & 255) * amount + ((b >> shift) & 255) * (1 - amount));
  return "#" + [16, 8, 0].map((s) => chan(s).toString(16).padStart(2, "0")).join("");
};
// Every ACCENT_COLORS entry is already dark enough to read as text on its
// own (that's the whole point of the luminance filter above), so it doubles
// as OK_INK in light mode with no separate lightening step.
const okTintsFor = (accent, theme) => (theme === "dark"
  ? { bg: mix(accent, "#14171A", 0.24), ink: mix(accent, "#ffffff", 0.55), line: mix(accent, "#14171A", 0.44), strong: mix(accent, "#14171A", 0.34) }
  : { bg: mix(accent, "#ffffff", 0.12), ink: accent, line: mix(accent, "#ffffff", 0.32), strong: mix(accent, "#ffffff", 0.22) });
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthOf = (iso) => (iso || "").slice(0, 7);
const nextMonthOf = (month) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed, so this lands on next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthName = (m, lang) =>
  new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });
const shortDate = (iso, lang) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" });
// Ledger picker card's "Updated ..." line. Precise for the last couple hours
// (that's when the exact count still matters to whoever's looking), then
// collapses to day-level granularity — "3h ago" thirty seconds later would
// just be noise.
const relativeUpdated = (iso, lang, t) => {
  if (!iso) return null;
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return t("minutesAgo", { n: diffMin });
  const sameDay = new Date(iso).toDateString() === new Date().toDateString();
  if (diffMin < 240 && sameDay) return t("hoursAgo", { n: Math.floor(diffMin / 60) });
  if (sameDay) return t("updatedToday");
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (new Date(iso).toDateString() === yesterday.toDateString()) return t("updatedYesterday");
  return new Date(iso).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" });
};

const getLang = () => {
  try { const l = localStorage.getItem("lang"); if (STRINGS[l]) return l; } catch {}
  return "en";
};

// First visit follows the OS/browser preference; after that, whatever you
// picked in Settings sticks regardless of what the system does.
const getTheme = () => {
  try { const s = localStorage.getItem("theme"); if (s === "light" || s === "dark") return s; } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
// The account (app_user.accent) is the source of truth — localStorage is only a
// cache of it, so the app paints the right colour on load instead of flashing
// the default while the profile fetch is in flight. A hex no longer in the
// palette (renamed/removed) falls back to the default rather than being trusted.
const getAccent = () => {
  try { const c = localStorage.getItem("accent"); if (c && ACCENT_COLORS.includes(c)) return c; } catch {}
  return ACCENT_COLORS[0];
};
const cacheAccent = (c) => { try { localStorage.setItem("accent", c); } catch {} };
// Device-level, not account-level — Flipp results are location-specific, and
// nothing else in the schema has a place for it.
const getPostalCode = () => { try { return localStorage.getItem("postalCode") || ""; } catch { return ""; } };
const cachePostalCode = (v) => { try { localStorage.setItem("postalCode", v); } catch {} };
// Which ledger to auto-open on a fresh sign-in, so Bento home doesn't need a
// picker round-trip every time. Device-level, like accent/theme/postal code.
const getLastLedgerId = () => { try { return localStorage.getItem("lastLedgerId") || null; } catch { return null; } };
const cacheLastLedgerId = (id) => { try { localStorage.setItem("lastLedgerId", id); } catch {} };

/* ============================ Root ================================= */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined=checking, null=logged out
  const [lang, setLang] = useState(getLang);
  const changeLang = (l) => { setLang(l); try { localStorage.setItem("lang", l); } catch {} };
  const t = makeT(lang);
  const [theme, setTheme] = useState(getTheme);
  const changeTheme = (th) => { setTheme(th); try { localStorage.setItem("theme", th); } catch {} };
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  const [accent, setAccent] = useState(getAccent);
  // Unlike changeLang/changeTheme this one is preview-only: it repaints the app
  // but doesn't persist. SettingsPanel owns the Save (and the revert-on-close),
  // so a colour can be tried on the real UI before it sticks.
  const changeAccent = setAccent;
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-ink", accentInkFor(accent));
    document.documentElement.style.setProperty("--accent-rgb", hexToRgb(accent));
    // The settle-up bar and the "shared"/category tag next to it were still
    // the original fixed teal even after the accent picker shipped — this
    // ties that "OK" tint to whatever accent is picked instead, same as
    // everything else already was. Depends on theme too: it's a different
    // blend base (dark surface vs white) in each.
    const ok = okTintsFor(accent, theme);
    document.documentElement.style.setProperty("--ok-bg", ok.bg);
    document.documentElement.style.setProperty("--ok-ink", ok.ink);
    document.documentElement.style.setProperty("--ok-line", ok.line);
    document.documentElement.style.setProperty("--ok-strong", ok.strong);
  }, [accent, theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Whoever signs in brings their own saved colour, overriding whatever this
  // browser had cached from the last account to use it. Failures are silent:
  // the cached/default colour is already on screen and is good enough.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    db.fetchMyAccent().then((c) => {
      if (!live || !c || !ACCENT_COLORS.includes(c)) return;
      setAccent(c);
      cacheAccent(c);
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // No ledger picked = the picker is home. Exiting a ledger comes back here.
  const [ledger, setLedger] = useState(null);
  // What a freshly-opened Ledger should land on: "home" (its Bento dashboard)
  // for the auto-loaded last-used ledger below, "ledger" (straight to the
  // transactions/calendar) for a ledger explicitly chosen from the picker or
  // switcher — picking one there is a clear "I want to work in this book"
  // signal, not another dashboard to look at.
  const [entryView, setEntryView] = useState("home");
  // Inventory and Grocery are household-wide (migration 038) and take no
  // ledger props, but they were only ever rendered inside Ledger's viewState —
  // so an account with no ledger yet could not reach them at all, despite them
  // needing none. Held here so they can be shown on their own in that case.
  const [standaloneView, setStandaloneView] = useState(null); // "inventory" | "grocery"
  // Cleared on open, or exiting a ledger later would drop straight back into
  // the tool instead of the picker.
  const openLedger = (l, view) => { setStandaloneView(null); setEntryView(view); cacheLastLedgerId(l.id); setLedger(l); };

  // Arriving from a tapped push notification: /?view=…[&ledger=…][&expense=…],
  // built by api/send-reminders.js and opened by sw.js. Read once at mount
  // (same one-shot shape as ?invite= below) and cleared from the address bar
  // so a later refresh doesn't yank the user back to it.
  const [deepLink] = useState(() => parseNotificationUrl(window.location.search));
  useEffect(() => {
    if (deepLink) window.history.replaceState({}, "", window.location.pathname);
  }, [deepLink]);

  // Where a tapped notification wants to go — set by the push link above, and
  // by the in-app bell, which routes to exactly the same place. `n` counts
  // taps so re-tapping the same notification is a new instruction rather than
  // one the Ledger has already handled and ignores.
  const [nav, setNav] = useState(() => (deepLink ? { ...deepLink, n: 0 } : null));

  // Which ledger a notification opens in. Its own, when it names one —
  // otherwise the last-used one, since household-wide inventory reminders
  // (migration 038) belong to no single ledger. Never a Kid ledger: that
  // template replaces the whole UI and has no Inventory Hub to land on.
  const pickLedger = (all, wantedId) => {
    const grownUp = all.filter((l) => l.template !== "kid");
    return all.find((l) => l.id === wantedId) || grownUp.find((l) => l.id === getLastLedgerId()) || grownUp[0] || null;
  };

  const openNotification = useCallback(async (target) => {
    if (!target) return;
    try {
      const all = await db.fetchLedgers();
      const match = pickLedger(all, target.ledgerId);
      if (!match) return;
      setNav((prev) => ({ ...target, n: (prev?.n || 0) + 1 }));
      // "recurring" is a panel over the ledger, not a view of its own — the
      // Ledger's nav effect opens it; entryView just needs the page under it.
      openLedger(match, target.view === "recurring" ? "ledger" : target.view);
    } catch { /* offline or the ledger vanished — the bell stays open, nothing breaks */ }
  }, []);

  // Bento home is the landing page now — on a fresh sign-in, skip the picker
  // and drop straight into whichever ledger was open last, same idea as the
  // accent/theme caches. Silently falls back to the picker (unchanged) if
  // nothing's cached yet, or the cached ledger is gone/inaccessible.
  useEffect(() => {
    if (!userId || ledger) return;
    // A deep link names its own ledger, except for household-wide inventory
    // (migration 038), which still needs *some* ledger to render inside —
    // hence the first-ledger fallback rather than bouncing to the picker.
    if (!deepLink && !getLastLedgerId()) return;
    let live = true;
    db.fetchLedgers().then((all) => {
      const match = deepLink ? pickLedger(all, deepLink.ledgerId) : all.find((l) => l.id === getLastLedgerId());
      if (!live || !match) return;
      openLedger(match, deepLink?.view === "recurring" ? "ledger" : (deepLink?.view || "home"));
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // An invite link lands as /?invite=<token>. Held in state (not consumed) so that,
  // once signed in, we show a confirmation screen and only redeem on an explicit tap.
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [inviteMsg, setInviteMsg] = useState(null); // banner shown on the picker afterwards
  const finishInvite = (msg) => {
    setInviteToken(null);
    setInviteMsg(msg); // null when declined
    window.history.replaceState({}, "", window.location.pathname); // don't re-prompt on refresh
  };

  if (session === undefined) return <Centered>{t("connecting")}</Centered>;
  if (!session) return <Login lang={lang} changeLang={changeLang} t={t} theme={theme} hasInvite={!!inviteToken} />;
  if (inviteToken) return <AcceptInvite token={inviteToken} lang={lang} changeLang={changeLang} t={t} theme={theme} onResult={finishInvite} />;
  // Picker's Home menu entry / header nav — jumps into a ledger's Bento
  // dashboard. Prefers the last-used ledger, but the cache is per-device: on a
  // browser that's never opened one it falls back to the first ledger, so Home
  // is there wherever you have at least one. (LedgerPicker hides these entries
  // for a genuinely empty account, where there's nowhere to go.)
  const goToView = async (view) => {
    try {
      const all = await db.fetchLedgers();
      const match = all.find((l) => l.id === getLastLedgerId()) || all[0];
      if (match) return openLedger(match, view);
      // Nothing to host them, but Inventory and Grocery don't need a ledger —
      // show them standalone rather than dead-ending the tap.
      if (view === "inventory" || view === "grocery") setStandaloneView(view);
    } catch {}
  };

  if (!ledger && standaloneView) {
    const Panel = standaloneView === "inventory" ? InventoryPanel : GroceryListPanel;
    return (
      <ToolScreen theme={theme}>
        {/* "ledger" is the only exit with no ledger to switch to — back to the
            picker, which is where a ledger gets created. */}
        <Panel t={t} lang={lang} onSwitchView={(v) => setStandaloneView(v === "ledger" ? null : v)} />
      </ToolScreen>
    );
  }

  if (!ledger) return <LedgerPicker lang={lang} changeLang={changeLang} t={t} theme={theme} changeTheme={changeTheme} accent={accent} changeAccent={changeAccent}
    onOpen={(l) => openLedger(l, "ledger")} onHome={() => goToView("home")}
    onNavigate={goToView} onNotification={openNotification}
    currentUserId={session.user.id} inviteMsg={inviteMsg} onDismissInvite={() => setInviteMsg(null)} />;
  return <Ledger ledger={ledger} startView={entryView} nav={nav} onNotification={openNotification} currentUserId={session.user.id} onExit={() => setLedger(null)}
    onSwitchLedger={(l) => openLedger(l, "ledger")} onSwitchLedgerHome={(l) => openLedger(l, "home")} lang={lang} changeLang={changeLang} t={t}
    theme={theme} changeTheme={changeTheme} accent={accent} changeAccent={changeAccent} />;
}

// The shell Ledger paints around Inventory/Grocery, for showing them without
// one. Backgrounds are per-view in this app — there is no layout wrapper
// supplying one — so a screen rendered outside Ledger has to bring its own or
// it lands on flat paper while everything around it has a starfield.
function ToolScreen({ theme, children }) {
  return (
    <div style={{ position: "relative", background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      {theme === "dark" ? <CosmicBackground /> : <DaylightBackground />}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ background: PAPER, minHeight: 420, display: "grid", placeItems: "center", color: SUB, fontFamily: "Inter, system-ui, sans-serif", gap: 10 }}>
      <Loader2 size={22} className="spin" style={{ color: ACCENT_TEXT }} />
      <div>{children}</div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// A dense Milky Way-style starfield for the two "first impression" screens
// (sign-in, ledger picker) in dark mode — replaces the earlier, much
// brighter animated aurora there: deep navy/black gradient, two barely-there
// nebula blobs, a thick scattered field of stars in a range of sizes (mostly
// static, a couple dozen genuinely independently twinkling), and one faint
// streak that crosses the screen every so often.
function CosmicBackground() {
  // Canvas engine: the base gradient, nebula haze, both star layers and the
  // meteor are all painted per-frame on one canvas rather than as CSS/DOM
  // layers — cheap even with hundreds of particles, and lets the nebula use
  // a 'screen' blend so overlapping clouds brighten instead of muddying.
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    const timeouts = [];

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    // Soft color-blob haze, static — no drift, just depth.
    const nebulaClouds = [
      { x: canvas.width * 0.75, y: canvas.height * 0.25, r: 240, color: "rgba(56,189,248,0.15)" },
      { x: canvas.width * 0.25, y: canvas.height * 0.55, r: 200, color: "rgba(168,85,247,0.09)" },
      { x: canvas.width * 0.60, y: canvas.height * 0.75, r: 260, color: "rgba(14,116,144,0.12)" },
    ];

    // Ultra-fine dust: mostly clustered along one diagonal "stardust belt"
    // rather than spread perfectly uniform, so the field reads as denser in
    // a band the way a real sky does.
    const dustParticles = Array.from({ length: 380 }, () => {
      const clustered = Math.random() < 0.55;
      let x, y;
      if (clustered) {
        const t = Math.random();
        x = canvas.width * t + (Math.random() - 0.5) * 120;
        y = canvas.height * t * 0.8 + (Math.random() - 0.5) * 160;
      } else {
        x = Math.random() * canvas.width;
        y = Math.random() * canvas.height;
      }
      return {
        x, y, radius: Math.random() * 0.75 + 0.15,
        alpha: Math.random() * 0.7 + 0.15, twinkleSpeed: 0.002 + Math.random() * 0.008,
        color: Math.random() > 0.4 ? "#ffffff" : Math.random() > 0.5 ? "#bae6fd" : "#e9d5ff",
      };
    });

    const mainStars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      radius: Math.random() * 1.1 + 0.6, alpha: Math.random(),
      speed: 0.005 + Math.random() * 0.012, color: Math.random() > 0.3 ? "#ffffff" : "#bae6fd",
    }));

    // One meteor at a time, not a shower: it fades/exits, then waits 5s
    // before the next one at a fresh random spot in the upper-left band.
    const meteor = { x: 0, y: 0, length: 80, speed: 10, angle: Math.PI / 3.8, alpha: 1, active: true };
    const resetMeteor = () => {
      meteor.x = Math.random() * (canvas.width * 0.6);
      meteor.y = Math.random() * (canvas.height * 0.2);
      meteor.alpha = 1;
      meteor.active = true;
    };
    resetMeteor();

    const drawNebula = () => {
      nebulaClouds.forEach((cloud) => {
        const grad = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.r);
        grad.addColorStop(0, cloud.color);
        grad.addColorStop(0.5, cloud.color.replace(/[\d.]+\)$/, "0.05)"));
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bgGrad = ctx.createRadialGradient(
        canvas.width * 0.85, canvas.height * 0.15, 10,
        canvas.width * 0.5, canvas.height * 0.5, canvas.height
      );
      bgGrad.addColorStop(0, "#0a1d36");
      bgGrad.addColorStop(0.5, "#030b18");
      bgGrad.addColorStop(1, "#01040a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawNebula();

      dustParticles.forEach((p) => {
        p.alpha += p.twinkleSpeed;
        if (p.alpha > 0.85 || p.alpha < 0.1) p.twinkleSpeed = -p.twinkleSpeed;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      mainStars.forEach((s) => {
        s.alpha += s.speed;
        if (s.alpha > 1 || s.alpha < 0.1) s.speed = -s.speed;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (meteor.active) {
        const endX = meteor.x + Math.cos(meteor.angle) * meteor.length;
        const endY = meteor.y + Math.sin(meteor.angle) * meteor.length;
        const grad = ctx.createLinearGradient(meteor.x, meteor.y, endX, endY);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.7, "rgba(56,189,248,0.7)");
        grad.addColorStop(1, `rgba(255,255,255,${meteor.alpha})`);
        ctx.save();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        meteor.x += Math.cos(meteor.angle) * meteor.speed;
        meteor.y += Math.sin(meteor.angle) * meteor.speed;
        meteor.alpha -= 0.009;
        if (meteor.alpha <= 0 || meteor.y > canvas.height) {
          meteor.active = false;
          timeouts.push(setTimeout(resetMeteor, 5000));
        }
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, background: "#01040a" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <span style={{
        position: "absolute", top: "38%", right: "12%", color: "#fff", fontSize: 24, opacity: 0.85,
        filter: "drop-shadow(0 0 10px rgba(255,255,255,0.9)) drop-shadow(0 0 20px rgba(56,189,248,0.6))",
        animation: "pulseGlow 4s ease-in-out infinite alternate",
      }}>✦</span>
      <style>{`@keyframes pulseGlow { 0% { transform: scale(.9); opacity: .7; } 100% { transform: scale(1.1); opacity: 1; } }`}</style>
    </div>
  );
}

// Light mode's counterpart to CosmicBackground — a cosmic-sunrise backdrop
// (deep blue to gold, lens-flare ring, prism-tinted star canvas). Deliberately
// SCOPED TO THE BACKDROP ONLY: cards and text everywhere in light mode read
// this same var(--glass-bg)/INK pair they always have, unrelated to this
// component — that's a decision, not an oversight, confirmed explicitly
// rather than assumed, since a white-on-white card readability problem
// would otherwise show up on every light-mode screen, not just the three
// this backdrop renders behind. Same overall shape as the dark one (fixed,
// aria-hidden, pointerEvents none, cleaned up on unmount) so the two stay
// drop-in swappable per theme.
function DaylightBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    // ~6% of stars get a 4-point cross sparkle instead of a plain dot.
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      size: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.8 + 0.2,
      twinkleSpeed: Math.random() * 0.03 + 0.005,
      isSparkle: Math.random() < 0.06,
    }));

    const drawSparkle = (x, y, size, alpha) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-size * 5, 0); ctx.lineTo(size * 5, 0);
      ctx.moveTo(0, -size * 5); ctx.lineTo(0, size * 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
      ctx.restore();
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Prism flare: a wide, heavily blurred diagonal stroke, corner to
      // corner, tinted through green/pink/gold rather than one hue.
      ctx.save();
      const grad = ctx.createLinearGradient(0, canvas.height, canvas.width, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.3, "rgba(167,243,208,0.15)");
      grad.addColorStop(0.5, "rgba(244,114,182,0.2)");
      grad.addColorStop(0.7, "rgba(253,224,71,0.25)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 120;
      ctx.filter = "blur(40px)";
      ctx.beginPath();
      ctx.moveTo(-100, canvas.height + 100);
      ctx.lineTo(canvas.width + 100, -100);
      ctx.stroke();
      ctx.restore();

      for (const s of stars) {
        s.alpha += Math.sin(Date.now() * s.twinkleSpeed) * 0.015;
        const alpha = Math.max(0.1, Math.min(1, s.alpha));
        if (s.isSparkle) {
          drawSparkle(s.x, s.y, s.size * 1.4, alpha);
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.shadowBlur = s.size > 1.2 ? 6 : 0;
          ctx.shadowColor = "rgba(255,255,255,0.9)";
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fill();
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Every decorative element below is sized against viewport WIDTH, capped
  // at the value that reads well on desktop. Fixed px alone doesn't work
  // here: a 620px glow is ~63% of a 976px desktop pane but ~165% of a 375px
  // phone, so on mobile it swamped the whole top in yellow. Offsets are
  // expressed as a fraction of each element's own size so the framing stays
  // identical as they scale.
  const sunSize = "min(620px, 63vw)";
  const ringSize = "min(500px, 51vw)";
  const bokehSize = "min(90px, 14vw)";

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
      background: "linear-gradient(180deg, #182b49 0%, #223a5e 35%, #3d587f 65%, #c88d6d 100%)",
    }}>
      {/* Sunrise gold glow, top right — large and diffuse enough that its
          warmth reaches the top-right corner of the first card (the SPENT
          bar) rather than staying a self-contained corner blob. */}
      <div style={{
        position: "absolute", top: `calc(${sunSize} * -0.16)`, right: `calc(${sunSize} * -0.16)`,
        width: sunSize, height: sunSize, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(254,240,138,0.9) 0%, rgba(249,115,22,0.4) 45%, rgba(0,0,0,0) 75%)",
        filter: "blur(40px)",
      }} />
      {/* Lens-flare ring, top left. */}
      <div style={{
        position: "absolute", top: `calc(${ringSize} * -0.36)`, left: `calc(${ringSize} * -0.24)`,
        width: ringSize, height: ringSize, borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.35)",
        boxShadow: "0 0 30px rgba(255,255,255,0.25), inset 0 0 20px rgba(255,255,255,0.15)",
      }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {/* Prismatic lens-flare beam — placed after the canvas so
          mix-blend-mode:screen composites against the stars/gradient
          beneath, not just this wrapper's flat CSS background. Everything
          here — the gradient, the glow, the stars, this beam — lives inside
          this same position:fixed wrapper, so there's no isolation boundary
          in the way. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {/* Rainbow split — deliberately softer than the earlier pass: alphas
            roughly halved and blur nearly tripled, so it reads as a diffuse
            wash of colour behind the cards rather than a hard saturated
            band competing with the content on top of it. */}
        <div style={{
          position: "absolute", top: "43%", left: "-25%", width: "150%", height: "clamp(16px, 2.9vw, 28px)", transform: "rotate(-38deg)", transformOrigin: "center",
          background: "linear-gradient(90deg, rgba(236,72,153,0) 0%, rgba(236,72,153,0.32) 18%, rgba(249,115,22,0.38) 35%, rgba(250,204,21,0.42) 50%, rgba(45,212,191,0.38) 68%, rgba(168,85,247,0.32) 85%, rgba(168,85,247,0) 100%)",
          filter: "blur(20px) saturate(1.15) brightness(1.02)", mixBlendMode: "screen",
        }} />
        {/* Faint parallel ghost ray, off the main beam's axis — the
            secondary reflection a real anamorphic lens throws alongside its
            main streak. */}
        <div style={{
          position: "absolute", top: "41%", left: "-25%", width: "150%", height: 2, transform: "rotate(-38deg)", transformOrigin: "center",
          background: "linear-gradient(90deg, rgba(168,85,247,0) 0%, rgba(168,85,247,0.4) 35%, rgba(45,212,191,0.4) 65%, rgba(45,212,191,0) 100%)",
          filter: "blur(1px)", mixBlendMode: "screen",
        }} />
        {/* Bright white core, on the same axis as the main beam, thin and
            almost unblurred so it reads as a sharp streak rather than
            washing the spectrum out. */}
        <div style={{
          position: "absolute", top: "44.8%", left: "-25%", width: "150%", height: 1.5, transform: "rotate(-38deg)", transformOrigin: "center",
          background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 30%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,0) 100%)",
          boxShadow: "0 0 6px #ffffff",
          filter: "blur(0.5px)", mixBlendMode: "screen",
        }} />
        {[
          { top: "52%", left: "35%" },
          { top: "68%", left: "18%" },
          { top: "34%", left: "58%" },
          { top: "88%", left: "4%" },
        ].map((b, i) => (
          <div key={i} style={{
            position: "absolute", top: b.top, left: b.left, width: bokehSize, height: bokehSize, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(186,230,253,0.08) 60%, rgba(0,0,0,0) 80%)",
            border: "1px solid rgba(255,255,255,0.35)",
            boxShadow: "inset 0 0 10px rgba(244,114,182,0.25), 0 0 12px rgba(56,189,248,0.2)",
            filter: "blur(1px)", mixBlendMode: "screen",
          }} />
        ))}
        {/* One of the ghost bubbles is a dog instead — same white edge, same
            screen blend, so it reads as another lens artefact until you look
            at it. Stroke/fill match the circles above; box-shadow can't
            follow an SVG outline, so the outer glow is a drop-shadow filter. */}
        <svg viewBox="0 0 100 100" style={{
          position: "absolute", top: "calc(79% - 30px)", left: "calc(57% - 30px)", width: 150, height: 150,
          transform: "rotate(20deg)",
          filter: "blur(1px) drop-shadow(0 0 8px rgba(56,189,248,0.35))", mixBlendMode: "screen",
        }}>
          {/* A sitting puppy: oversized head on a small body, which is the
              whole trick to reading as cute at this size. Ears and body come
              first so the head overlaps them. */}
          <g fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round">
            <path d="M50 55 C34 55 27 72 29 83 C30 91 39 94 50 94 C61 94 70 91 71 83 C73 72 66 55 50 55 Z" />
            <path d="M71 84 C83 85 88 75 82 68" fill="none" />
            <ellipse cx="40" cy="90" rx="6.5" ry="5" />
            <ellipse cx="60" cy="90" rx="6.5" ry="5" />
            <ellipse cx="26" cy="42" rx="8.5" ry="18" transform="rotate(12 26 42)" />
            <ellipse cx="74" cy="42" rx="8.5" ry="18" transform="rotate(-12 74 42)" />
            <ellipse cx="50" cy="34" rx="23" ry="21" />
            <ellipse cx="50" cy="45" rx="11" ry="8" />
            <ellipse cx="50" cy="39" rx="3.5" ry="2.8" fill="rgba(255,255,255,0.3)" />
            {/* Smiling eyes — arcs rather than dots, brighter than the body
                stroke so they still read through the blur. */}
            <path d="M37 32.5 Q41 26.5 45 32.5 M55 32.5 Q59 26.5 63 32.5"
              fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ============================ Login =============================== */
function Login({ lang, changeLang, t, theme, hasInvite }) {
  // Arriving via an invite link almost always means a new person — start them on
  // sign-up rather than making them find the toggle themselves.
  const [mode, setMode] = useState(hasInvite ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); // e.g. "check your email"
  const signup = mode === "signup";
  // A username is optional for a normal sign-up, but mandatory when joining via an
  // invite — the roster and settle-up screens need a name, not a bare email, to
  // mean anything once a second household's worth of people can join a ledger.
  const nameRequired = signup && hasInvite;
  // A display name of your own email defeats the point of having one — it's what
  // migration 009's backfill did for pre-existing accounts, which is exactly the
  // duplicated name/email display this is meant to stop happening again.
  const nameEqualsEmail = signup && name.trim() && email.trim()
    && name.trim().toLowerCase() === email.trim().toLowerCase();

  const submit = async () => {
    if (!email || !pw || busy) return;
    if (nameRequired && !name.trim()) { setError(t("usernameRequiredErr")); return; }
    if (nameEqualsEmail) { setError(t("usernameSameAsEmailErr")); return; }
    setBusy(true); setError(""); setNotice("");
    if (signup) {
      // The DB trigger mirrors the new auth user into app_user; name rides along as
      // metadata. If the project requires email confirmation, no session comes back
      // yet — tell them to confirm rather than leaving them on a dead screen.
      const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { name: name.trim() || null } } });
      if (error) { setError(error.message); setBusy(false); return; }
      if (!data.session) { setNotice(t("checkEmail")); setBusy(false); return; }
      // otherwise onAuthStateChange swaps the view, then App's inviteToken carries
      // straight into the accept-invite confirmation screen (see AcceptInvite).
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) { setError(error.message); setBusy(false); }
    }
  };

  const swap = () => { setMode(signup ? "signin" : "signup"); setError(""); setNotice(""); };

  return (
    <div style={{ position: "relative", overflow: "hidden", background: PAPER, minHeight: 520, display: "grid", placeItems: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 20 }}>
      {/* Each theme gets its own full background: the calm starfield at night,
          the daylight haze-blue wash with drifting motes by day. */}
      {theme === "dark" ? <CosmicBackground /> : <DaylightBackground />}
      <div style={{ position: "relative", zIndex: 1, width: "min(360px, 100%)", background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{
            fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: 800,
            background: "linear-gradient(90deg, color-mix(in srgb, var(--accent-text) 60%, var(--brand-sheen)), var(--accent-text), color-mix(in srgb, var(--accent-text) 65%, var(--brand-sheen)))",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>{t("eyebrow")}</div>
          <LangToggle lang={lang} changeLang={changeLang} t={t} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{signup ? t("signUpTitle") : t("signInTitle")}</h1>
        <p style={{ fontSize: 13, color: SUB, margin: "0 0 16px" }}>{signup ? t("signUpHint") : t("signInHint")}</p>

        {signup && (
          <Field label={nameRequired ? `${t("nameLabel")} *` : t("nameLabel")}>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={t("namePh")} style={input} />
            {nameEqualsEmail ? (
              <div style={{ fontSize: 12, color: DANGER, marginTop: 6 }}>{t("usernameSameAsEmailErr")}</div>
            ) : nameRequired ? (
              <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{t("usernameRequiredHint")}</div>
            ) : null}
          </Field>
        )}
        <Field label={t("email")}>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />
        </Field>
        <Field label={t("password")}>
          <input type="password" autoComplete={signup ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />
        </Field>

        {error && <div style={{ ...errorBox, marginTop: 4 }}>{error}</div>}
        {notice && <div style={{ background: OK_BG, border: `1px solid ${OK_LINE}`, color: OK_INK, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginTop: 4, fontWeight: 600 }}>{notice}</div>}

        <button onClick={submit} disabled={busy || !email || !pw || (nameRequired && !name.trim()) || nameEqualsEmail} className="btn-glow"
          style={{ ...addBtn, opacity: busy || !email || !pw || (nameRequired && !name.trim()) || nameEqualsEmail ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
          {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />} {signup ? t("signUpBtn") : t("signInBtn")}
        </button>

        <button onClick={swap} style={{ display: "block", width: "100%", marginTop: 12, padding: 4, border: "none", background: "none", color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {signup ? t("toSignIn") : t("toSignUp")}
        </button>
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

/* ===================== Accept-invite screen ====================== */
// Shown after sign-in when the URL carried an invite token, so joining is an
// explicit choice rather than an automatic side effect of logging in. Previews
// the ledger/role first; if the preview RPC isn't available it degrades to a
// generic prompt, so the accept still works before migration 010 is applied.
function AcceptInvite({ token, lang, changeLang, t, theme, onResult }) {
  const [preview, setPreview] = useState(null); // null=loading; {status, ledgerName?, role?}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    db.previewInvite(token)
      .then((p) => live && setPreview(p || { status: "ok" }))
      .catch(() => live && setPreview({ status: "ok" })); // degrade to a generic prompt
    return () => { live = false; };
  }, [token]);

  const accept = async () => {
    setBusy(true);
    try { await db.acceptInvite(token); onResult({ ok: true, text: t("inviteJoined") }); }
    catch (e) { onResult({ ok: false, text: t("inviteFailed", { msg: e.message || String(e) }) }); }
  };

  const roleName = preview?.role === "VIEWER" ? t("roleViewer") : t("roleEditor");
  const badStatus = preview && preview.status !== "ok"
    ? { invalid: t("inviteInvalid"), expired: t("inviteExpired"), used: t("inviteUsed") }[preview.status] || t("inviteInvalid")
    : null;

  return (
    <div style={{ position: "relative", background: PAPER, minHeight: 520, display: "grid", placeItems: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 20 }}>
      {theme === "dark" ? <CosmicBackground /> : <DaylightBackground />}
      <div style={{ position: "relative", zIndex: 1, width: "min(380px, 100%)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: ACCENT_TEXT, fontWeight: 700 }}>{t("inviteTitle")}</div>
          <LangToggle lang={lang} changeLang={changeLang} t={t} />
        </div>

        {!preview ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: SUB, padding: "16px 0" }}>
            <Loader2 size={18} className="spin" /> {t("connecting")}
          </div>
        ) : badStatus ? (
          <>
            <p style={{ fontSize: 15, margin: "6px 0 18px", color: INK }}>{badStatus}</p>
            <button onClick={() => onResult(null)} style={{ ...ghostBtn, width: "100%", justifyContent: "center", padding: 12 }}>{t("inviteDecline")}</button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 18px" }}>
              <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: OK_BG, color: OK_INK, flexShrink: 0 }}><Users size={20} /></span>
              <p style={{ fontSize: 15, margin: 0, color: INK, lineHeight: 1.45 }}>
                {preview.ledgerName
                  ? t("invitePromptNamed", { ledger: preview.ledgerName, role: roleName })
                  : t("invitePrompt")}
              </p>
            </div>
            <button onClick={accept} disabled={busy} className="btn-glow" style={{ ...addBtn, marginTop: 0, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
              {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />} {t("inviteAcceptBtn")}
            </button>
            <button onClick={() => onResult(null)} disabled={busy} style={{ display: "block", width: "100%", marginTop: 10, padding: 8, border: "none", background: "none", color: SUB, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {t("inviteDecline")}
            </button>
          </>
        )}
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

/* ========================= Ledger picker ========================== */
function LedgerPicker({ lang, changeLang, t, theme, changeTheme, accent, changeAccent, onOpen, onHome, onNavigate, onNotification, inviteMsg, onDismissInvite, currentUserId }) {
  const [ledgers, setLedgers] = useState(null); // null = still loading
  // Transaction count per ledger, fetched once here (rather than per-row)
  // so the list can be ranked by it before LedgerRow ever renders.
  const [statsById, setStatsById] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const all = await db.fetchLedgers();
      setLedgers(all);
      const entries = await Promise.all(
        all.map((l) => db.fetchLedgerStats(l).then((s) => [l.id, s]).catch(() => [l.id, null]))
      );
      setStatsById(Object.fromEntries(entries));
    } catch (e) { setError(e.message || String(e)); setLedgers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeLedgerList(() => load()), [load]);

  // Busiest-first, so the top 3 are the ones actually worth seeing without
  // scrolling. The count is now this month's, which is a better "worth seeing
  // now" signal than an all-time total — but it resets on the 1st, and every
  // ledger sitting at 0 would collapse the order back to whatever the database
  // returned. Last activity breaks that tie, so early-month ordering stays
  // meaningful instead of jumping around.
  const rankedLedgers = useMemo(
    () => [...ledgers || []].sort((a, b) => {
      const byCount = (statsById[b.id]?.count || 0) - (statsById[a.id]?.count || 0);
      if (byCount) return byCount;
      return String(statsById[b.id]?.lastUpdated || "").localeCompare(String(statsById[a.id]?.lastUpdated || ""));
    }),
    [ledgers, statsById]
  );
  const visibleLedgers = showAll ? rankedLedgers : rankedLedgers.slice(0, 3);

  const create = async ({ name, template, members, currency, startDate, endDate }) => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await db.createLedger(trimmed, template);
      // Travel-only fields and starter members are set right after creation
      // (same create-then-patch pattern changeCurrency/changePeriod already
      // use) rather than threading them through createLedger's own signature.
      if (template === "travel") {
        await db.updateLedger(created.id, { currency, start_date: startDate || null, end_date: endDate || null });
      }
      if (db.featuresFor(template).showSplit && members?.length) {
        await db.persistMembers(members, [], created.id);
      }
      // Merge the travel fields in so the ledger opens already showing the
      // right period/currency with no reload; members are skipped here — the
      // ledger view fetches them itself, and persistMembers has already landed.
      onOpen({ ...created, currency: template === "travel" ? currency : undefined, startDate, endDate });
    } catch (e) { setError(e.message || String(e)); setBusy(false); }
  };

  // Rename/delete are shown to everyone now (same menu regardless of role) — the
  // owner check happens on click, so a non-owner gets a clear "you can't do this"
  // instead of either a hidden button or a raw RLS error.
  const [confirmDelete, setConfirmDelete] = useState(null); // ledger pending delete confirmation
  const remove = (l) => {
    if (l.ownerId !== currentUserId) { setError(t("ownerOnlyErr")); return; }
    setConfirmDelete(l);
  };
  const doDelete = async () => {
    const l = confirmDelete;
    setConfirmDelete(null);
    try { await db.deleteLedger(l.id); load(); }
    catch (e) { setError(e.message || String(e)); }
  };

  // Archiving keeps everything and just hides the ledger (migration 041).
  // Owner-only for the same reason rename/delete are: ledger_update's RLS is
  // owner_id = auth.uid(), so checking here turns a raw policy violation into
  // a sentence the user can act on.
  const [confirmArchive, setConfirmArchive] = useState(null);
  const archive = (l) => {
    if (l.ownerId !== currentUserId) { setError(t("ownerOnlyErr")); return; }
    setConfirmArchive(l);
  };
  const doArchive = async () => {
    const l = confirmArchive;
    setConfirmArchive(null);
    try { await db.updateLedger(l.id, { archived: true }); cancelRename(); load(); }
    catch (e) { setError(e.message || String(e)); }
  };

  // Renaming happens in place: the row swaps its open-button for an input so the
  // whole row can't double as "open this ledger" while you're typing in it.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftTpl, setDraftTpl] = useState("household");
  const [draftCurrency, setDraftCurrency] = useState("CAD");
  const startRename = (l) => {
    if (l.ownerId !== currentUserId) { setError(t("ownerOnlyErr")); return; }
    setEditingId(l.id); setDraft(l.name); setDraftTpl(l.template); setDraftCurrency(l.currency || "CAD");
  };
  const cancelRename = () => { setEditingId(null); setDraft(""); };
  const saveRename = async (l) => {
    const trimmed = draft.trim();
    if (!trimmed) return cancelRename();
    // Leaving travel drops back to the base currency — a household/personal
    // ledger has no UI to change it, so it must not stay stuck on a foreign one.
    const currency = draftTpl === "travel" ? draftCurrency : "CAD";
    if (trimmed === l.name && draftTpl === l.template && currency === (l.currency || "CAD")) return cancelRename();
    try { await db.updateLedger(l.id, { name: trimmed, template: draftTpl, currency }); cancelRename(); load(); }
    catch (e) { setError(e.message || String(e)); cancelRename(); }
  };

  if (ledgers === null) return <Centered>{t("connecting")}</Centered>;

  return (
    <div style={{ position: "relative", background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      {/* Same pair as the sign-in screen — starfield at night, daylight wash
          by day. */}
      {theme === "dark" ? <CosmicBackground /> : <DaylightBackground />}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto" }}>
        {/* Same header block as the Bento home now: brand centered, bell/menu
            on the right — same string in every language, like the eyebrow on
            the sign-in screen. */}
        <BrandHeader
          // Shown even with no ledgers: Inventory and Grocery are household-wide
          // (migration 038) and reachable on their own, so this is the only way
          // a brand-new account gets to them without first creating a ledger it
          // may not want.
          left={onNavigate ? <ViewSwitcher current="ledger" label={t("navDropdownLabel")} hideIcon onSwitch={onNavigate} t={t} /> : undefined}
          right={<>
          <NotificationBell t={t} lang={lang} onNavigate={onNotification} />
          {/* Same overflow menu as inside a ledger, minus the entries that need one
              — plus Home, which jumps into a ledger's Bento dashboard (shown
              whenever there's at least one ledger to land on). */}
          {/* Shown here too: the picker *is* the ledger list, so a ledger
              hidden from it is exactly what someone standing here would look
              for. */}
          <HeaderMenu t={t} lang={lang} changeLang={changeLang} theme={theme} changeTheme={changeTheme} accent={accent} changeAccent={changeAccent} onHome={ledgers?.length ? onHome : undefined} showArchivedLedgers />
        </>} />

        {inviteMsg && (
          <div onClick={onDismissInvite} style={{ cursor: "pointer", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12,
            background: inviteMsg.ok ? OK_BG : BAD_BG, border: `1px solid ${inviteMsg.ok ? OK_LINE : BAD_LINE}`, color: inviteMsg.ok ? OK_INK : BAD_INK, fontWeight: 600 }}>
            {inviteMsg.text}
          </div>
        )}

        {error && <div style={{ background: BAD_BG, border: `1px solid ${BAD_LINE}`, color: BAD_INK, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ledgers.length === 0 && (
            <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "26px 18px", textAlign: "center", color: SUB, fontSize: 13 }}>
              <BookOpen size={22} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>{t("noLedgers")}</div>
            </div>
          )}
          {visibleLedgers.map((l) => {
            return (
            <div key={l.id}>
              {editingId === l.id ? (
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(l); if (e.key === "Escape") cancelRename(); }}
                      style={{ ...input, flex: 1, fontWeight: 700 }} />
                    <button onClick={() => saveRename(l)} style={{ ...iconBtn, color: ACCENT_TEXT }} aria-label={t("saveChanges")}><Check size={16} /></button>
                    <button onClick={cancelRename} style={iconBtn} aria-label={t("cancel")}><X size={15} /></button>
                  </div>
                  {/* Icon is editable here too, otherwise ledgers made before this
                      existed would be stuck with the default mark. */}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {["household", "travel", "personal", "kid", "blank"].map((k) => {
                      const Icon = ledgerIcon(k);
                      return (
                        <button key={k} onClick={() => setDraftTpl(k)} aria-label={t("tpl" + k[0].toUpperCase() + k.slice(1))}
                          style={{ ...iconBtn, width: 38, height: 38, borderColor: draftTpl === k ? TEAL : LINE, background: draftTpl === k ? TEAL : CARD, color: draftTpl === k ? ACCENT_INK : SUB, boxShadow: draftTpl === k ? ACCENT_GLOW : "none" }}>
                          <Icon size={16} />
                        </button>
                      );
                    })}
                  </div>
                  {draftTpl === "travel" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 4 }}>{t("currency")}</div>
                      <select value={draftCurrency} onChange={(e) => setDraftCurrency(e.target.value)} style={{ ...input, width: "auto" }}>
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Put it away without losing it — the gentler neighbour of the
                      delete action on the row behind this editor. */}
                  <button onClick={() => archive(l)} style={{ ...ghostBtn, width: "100%", justifyContent: "center", marginTop: 10 }}>
                    <Archive size={15} /> {t("archiveLedger")}
                  </button>
                </div>
              ) : (
                <LedgerRow l={l} stats={statsById[l.id]} t={t} lang={lang} onOpen={onOpen} onRename={startRename} onDelete={remove} />
              )}
            </div>
            );
          })}
          {rankedLedgers.length > 3 && (
            <button onClick={() => setShowAll((s) => !s)} className="swipe-row" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))",
              border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)",
              borderRadius: 12, padding: "14px 16px", cursor: "pointer", fontFamily: "inherit",
              fontSize: 14, fontWeight: 800, color: ACCENT_TEXT, width: "100%",
            }}>
              {showAll ? t("showLess") : t("viewAllLedgers", { n: rankedLedgers.length })}
              <ChevronDown size={16} style={{ flexShrink: 0, transform: showAll ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
            </button>
          )}
        </div>

        <NewLedgerFlow t={t} busy={busy} onCreate={create} />
      </div>
      {confirmDelete && <ConfirmDialog t={t} message={t("deleteLedgerConfirm", { name: confirmDelete.name })} onConfirm={doDelete} onCancel={() => setConfirmDelete(null)} />}
      {/* Not the danger tone — nothing is destroyed, so it shouldn't wear the
          same red as delete. */}
      {confirmArchive && (
        <ConfirmDialog t={t} message={t("archiveConfirm", { name: confirmArchive.name })}
          confirmLabel={t("archiveLedger")} icon={Archive} tone="primary"
          onConfirm={doArchive} onCancel={() => setConfirmArchive(null)} />
      )}
    </div>
  );
}

const NEW_LEDGER_TEMPLATE_ORDER = ["household", "personal", "travel", "kid", "blank"];

// Progressive mobile flow: pick a template (horizontal snap carousel), confirm
// it, then members (split-capable templates only) and travel-only trip
// dates/currency each get their own section with their own "Continue" —
// nothing later in the flow shows until the step before it is confirmed, and
// the name field (the actual create step) only appears once every step ahead
// of it is done. Member setup here is the same ledger_members concept
// MemberManager edits post-creation (display-name+colour tags for splitting),
// not the email/role invite system — that one requires a ledger id to already
// exist, so it stays a post-creation action.
function NewLedgerFlow({ t, busy, onCreate }) {
  const [template, setTemplate] = useState(null);
  const [templateConfirmed, setTemplateConfirmed] = useState(false);
  const [members, setMembers] = useState([]);
  const [memberName, setMemberName] = useState("");
  const [membersConfirmed, setMembersConfirmed] = useState(false);
  const [currency, setCurrency] = useState("CAD");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelConfirmed, setTravelConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [profile] = useMyProfile();
  const carouselRef = useRef(null);
  const confirmRef = useRef(null);
  const membersRef = useRef(null);
  const travelRef = useRef(null);
  const nameRef = useRef(null);

  const features = template ? db.featuresFor(template) : null;
  const needsMembers = !!features?.showSplit;
  const needsTravel = template === "travel";
  const showMembers = templateConfirmed && needsMembers;
  const showTravel = templateConfirmed && needsTravel && (!needsMembers || membersConfirmed);
  const showName = templateConfirmed && (!needsMembers || membersConfirmed) && (!needsTravel || travelConfirmed);

  const pickTemplate = (k) => {
    // A drag that ended on a card is scrolling, not choosing.
    if (dragRef.current?.moved) return;
    setTemplate(k);
    setTemplateConfirmed(false);
    setMembersConfirmed(false);
    setTravelConfirmed(false);
  };

  // Hiding the scrollbar left the desktop with no way into this strip: a mouse
  // wheel only scrolls vertically and a scroll container isn't click-draggable,
  // so both gestures are translated to scrollLeft here. Touch and trackpad
  // already scroll it natively and are left alone.
  //
  // Native listener rather than onWheel: React registers wheel passively, so a
  // preventDefault inside its handler is ignored.
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const next = Math.min(el.scrollWidth - el.clientWidth, Math.max(0, el.scrollLeft + delta));
      // At either end, leave the event alone so the page scrolls on instead of
      // the cursor getting stuck over a dead strip.
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === "touch") return; // native touch scrolling is already right
    dragRef.current = { x: e.clientX, left: carouselRef.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true; // past a jitter threshold this is a drag, not a click
    if (d.moved) carouselRef.current.scrollLeft = d.left - dx;
  };
  // Cleared after the click event that follows pointerup, so pickTemplate above
  // can see it and swallow that click.
  const onPointerUp = () => { setTimeout(() => { dragRef.current = null; }, 0); };

  useEffect(() => {
    if (template && !templateConfirmed) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [template, templateConfirmed]);
  useEffect(() => {
    if (showMembers) membersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showMembers]);
  useEffect(() => {
    if (showTravel) travelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showTravel]);
  useEffect(() => {
    if (showName) nameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showName]);

  // Seed one default member ("you") the first time a split-capable template
  // is confirmed, same fallback name createLedger itself uses for the silent
  // single-payer templates.
  useEffect(() => {
    if (showMembers && members.length === 0) {
      setMembers([{ id: uid(), name: profile?.name || "Me", color: db.MEMBER_COLORS[0], icon: "user" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMembers, profile]);

  const addMember = () => {
    const trimmed = memberName.trim();
    if (!trimmed) return;
    setMembers((m) => [...m, { id: uid(), name: trimmed, color: db.MEMBER_COLORS[m.length % db.MEMBER_COLORS.length], icon: "user" }]);
    setMemberName("");
  };
  const removeMember = (id) => setMembers((m) => m.filter((x) => x.id !== id));

  const create = () => {
    if (!name.trim() || busy) return;
    onCreate({
      name, template,
      members: features?.showSplit ? members : [],
      currency: template === "travel" ? currency : "CAD",
      startDate: template === "travel" ? (startDate || null) : null,
      endDate: template === "travel" ? (endDate || null) : null,
    });
  };

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 20 }}>
      {/* Same eyebrow-over-title idiom as the ledger cards above, so starting a
          new one reads as a peer of the list rather than a footnote under it. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={22} strokeWidth={2.75} style={{ color: ACCENT_TEXT, flexShrink: 0 }} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: INK }}>{t("createLedger")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: ACCENT_TEXT }}>
          <Sparkles size={12} style={{ flexShrink: 0 }} /> {t("startWith")}
        </div>
      </div>
      <div ref={carouselRef} className="no-scrollbar"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}
        style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", paddingBottom: 4,
          // Otherwise dragging across the strip highlights the card labels.
          userSelect: "none" }}>
        {NEW_LEDGER_TEMPLATE_ORDER.map((k) => {
          const Icon = ledgerIcon(k);
          const active = template === k;
          return (
            // Same frosted-glass surface as the ledger rows above (and the
            // same hover glow, via .swipe-row) — one card treatment for the
            // whole page instead of these sitting flat against it.
            <button key={k} onClick={() => pickTemplate(k)} className="swipe-row" style={{
              position: "relative", scrollSnapAlign: "start", flexShrink: 0, width: 240, textAlign: "left", display: "flex", alignItems: "center", gap: 12,
              padding: "13px 16px 13px 13px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
              background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))",
              border: `1.5px solid ${active ? TEAL : "var(--glass-border)"}`,
              boxShadow: active ? ACCENT_GLOW : "var(--glass-card-shadow)",
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: active ? TEAL : MUTED_BG }}>
                <Icon size={18} style={{ color: active ? ACCENT_INK : SUB }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>{t(ledgerLabelKey(k))}</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 2, lineHeight: 1.3 }}>{t(ledgerDescKey(k))}</div>
              </div>
              <Sparkles size={12} style={{ position: "absolute", top: 10, right: 10, color: active ? ACCENT_TEXT : SUB, opacity: active ? 0.9 : 0.35 }} />
            </button>
          );
        })}
      </div>

      {template && !templateConfirmed && (
        <button ref={confirmRef} onClick={() => setTemplateConfirmed(true)} className="btn-glow"
          style={{ ...addBtn, marginTop: 14 }}>
          <Check size={17} /> {t("continueBtn")}
        </button>
      )}

      {showMembers && (
        <div ref={membersRef} style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("members")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: m.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: INK }}>{m.name}</span>
                <button onClick={() => removeMember(m.id)} style={{ ...iconBtn, width: 28, height: 28 }} aria-label={t("deleteMember")}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={memberName} onChange={(e) => setMemberName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMember(); } }}
              placeholder={t("newMemberPh")} style={{ ...input, flex: 1 }} />
            <button onClick={addMember} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
          </div>
          {!membersConfirmed && (
            <button onClick={() => setMembersConfirmed(true)} className="btn-glow" style={{ ...addBtn, marginTop: 12 }}>
              <Check size={17} /> {t("continueBtn")}
            </button>
          )}
        </div>
      )}

      {showTravel && (
        <div ref={travelRef} style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("tripDates")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)}
              aria-label={t("tripStartDate")} style={{ ...input, flex: 1 }} />
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
              aria-label={t("tripEndDate")} style={{ ...input, flex: 1 }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("currency")}</div>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...input, width: "auto" }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {!travelConfirmed && (
            <button onClick={() => setTravelConfirmed(true)} className="btn-glow" style={{ ...addBtn, marginTop: 12 }}>
              <Check size={17} /> {t("continueBtn")}
            </button>
          )}
        </div>
      )}

      {showName && (
        <div ref={nameRef} style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("ledgerNameLabel")}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={t("newLedgerPh")} style={input} autoFocus />
          <button onClick={create} disabled={!name.trim() || busy} className="btn-glow"
            style={{ ...addBtn, opacity: !name.trim() || busy ? 0.5 : 1, cursor: !name.trim() || busy ? "not-allowed" : "pointer" }}>
            {busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} {t("createLedger")}
          </button>
        </div>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        .no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
        .no-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

const LEDGER_ROW_ACTIONS_WIDTH = 92; // two 44px action tiles + a hairline gap
const INVENTORY_ROW_ACTIONS_WIDTH = 92;

// Shared drag-to-reveal machinery behind every swipeable row (ledger picker,
// inventory list): touch drag, trackpad two-finger swipe, and mouse
// click-drag all drive the same PointerEvent handlers (pointer events unify
// all three); a trackpad's horizontal swipe can also arrive as a wheel event
// (deltaX) instead, handled separately in onWheel. `onTapOrClose` is the
// click handler every row wants: a tap while open just closes the row
// instead of triggering whatever a plain tap does, and a drag's release
// shouldn't also fire as a tap.
function useSwipeReveal(actionsWidth) {
  const [x, setXState] = useState(0);
  const xRef = useRef(0);
  const setX = (v) => { xRef.current = v; setXState(v); };
  const dragRef = useRef(null); // { startX, startY, originX, axis, moved }
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const wheelIdleRef = useRef(null);

  const clamp = (v) => Math.min(0, Math.max(-actionsWidth, v));
  const snap = () => setX(xRef.current < -actionsWidth / 2 ? -actionsWidth : 0);
  const closeRow = () => setX(0);
  const toggle = () => setX(xRef.current === 0 ? -actionsWidth : 0);

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: xRef.current, axis: null, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.axis) {
      if (Math.hypot(dx, dy) < 4) return; // not yet enough movement to tell a drag from a tap
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; // vertical drags stay a page scroll
      if (d.axis === "x") {
        setDragging(true);
        // Capture only once this is definitely a drag, never on pointerdown:
        // a captured pointer retargets the following click to the capturing
        // element, which swallowed clicks on the row's own child buttons.
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
    if (d.axis !== "x") return;
    d.moved = true;
    setX(clamp(d.originX + dx));
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d && d.axis === "x") {
      if (d.moved) suppressClickRef.current = true; // the drag's release shouldn't also count as a tap
      snap();
    }
  };
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll, let the page handle it
    e.preventDefault();
    setX(clamp(xRef.current - e.deltaX));
    clearTimeout(wheelIdleRef.current);
    wheelIdleRef.current = setTimeout(snap, 150); // trackpad swipes arrive as a burst of small deltas, not a single up event
  };
  const onTapOrClose = (onTap) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (xRef.current !== 0) { closeRow(); return; }
    onTap();
  };

  return {
    x, xRef, dragging, closeRow, toggle, onTapOrClose,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel },
  };
}

// Rename/Delete used to sit as their own always-visible icon buttons next to
// each row; now they live under it, revealed by dragging the row left. Mice
// without a drag gesture get a hover-revealed "more" button as a click
// fallback (CSS-only, see .swipe-more-btn in index.css).
function LedgerRow({ l, stats, t, lang, onOpen, onRename, onDelete }) {
  const accent = ledgerAccent(l.template);
  const { x, dragging, closeRow, toggle, onTapOrClose, handlers } = useSwipeReveal(LEDGER_ROW_ACTIONS_WIDTH);
  const handleRowClick = () => onTapOrClose(() => onOpen(l));
  const Icon = ledgerIcon(l.template);

  return (
    <div style={{ position: "relative", borderRadius: 20 }}>
      {/* Hidden while the row is closed — the row above is translucent glass
          now, so these solid tiles would otherwise show straight through it. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 20, display: "flex", justifyContent: "flex-end", alignItems: "stretch", gap: 6, padding: 4, visibility: x ? "visible" : "hidden" }}>
        <button onClick={() => { closeRow(); onRename(l); }} style={{ ...swipeActionBtn, background: TEAL, color: ACCENT_INK }} aria-label={t("renameLedger")}>
          <Pencil size={17} />
        </button>
        <button onClick={() => { closeRow(); onDelete(l); }} style={{ ...swipeActionBtn, background: "#DC2626", color: "#fff" }} aria-label={t("deleteLedger")}>
          <Trash2 size={17} />
        </button>
      </div>
      <div role="button" tabIndex={0} aria-label={t("openLedger", { name: l.name })} className="swipe-row"
        {...handlers} onClick={handleRowClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(); } }}
        style={{
          position: "relative", zIndex: 1,
          // Same frosted glass treatment as the Bento home cards: a
          // near-transparent surface the starfield reads through, neutral
          // translucent border, plus a thin inset top highlight for a touch
          // of glass edge-lighting. No backdrop blur — it smears the point
          // stars behind into nothing. The template accent stays in the
          // eyebrow/icon/dot only.
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-card-shadow)",
          borderRadius: 20, padding: "18px 20px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          transform: x ? `translateX(${x}px)` : "none", transition: dragging ? "none" : "transform .2s ease", touchAction: "pan-y", userSelect: "none",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: ACCENT_TEXT, minWidth: 0 }}>
            <Icon size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(ledgerLabelKey(l.template))}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <ChevronRight size={16} style={{ color: SUB }} />
            <button className="swipe-more-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}
              aria-label={t("moreActions")} style={moreBtn}>
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3, color: INK, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
        {stats && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, letterSpacing: 0.2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", color: SUB }}>
            {/* Mint status dot with its own halo, same tone as the card glow. */}
            <span style={{ width: 6, height: 6, borderRadius: 99, background: TEAL, boxShadow: "0 0 8px rgba(var(--accent-rgb),0.8)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {/* A trip-period travel ledger isn't month-scoped anywhere, so its
                  count covers the whole ledger and must not claim "this month". */}
              {t(stats.periodScoped ? "transactionsCountAll" : "transactionsCount", { n: stats.count })}
              {stats.lastUpdated && ` • ${t("updatedLine", { when: relativeUpdated(stats.lastUpdated, lang, t) })}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Per-template feature toggles (db.TEMPLATE_FEATURES) as a hook so call sites
// read like ledger.features rather than reaching into db directly.
function useLedgerFeatures(ledger) {
  return useMemo(() => db.featuresFor(ledger.template), [ledger.template]);
}

/* ========================= Kid Ledger ============================== */
// Deliberately its own bright, fixed palette rather than the app's --accent/
// --ink theme vars: the brief calls for a gamified look that reads as its own
// thing next to the grown-up ledgers, not a tinted variant of them. Doesn't
// respond to the user's chosen accent or dark mode by design.
const KID_PURPLE = "#7C3AED";
const KID_PURPLE_DARK = "#5B21B6";
const KID_YELLOW = "#FACC15";
const KID_GREEN = "#16A34A";
const KID_ORANGE = "#F97316";

const kidActionBtn = (color) => ({
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
  padding: "18px 10px", borderRadius: 20, border: "none", background: color, color: "#fff",
  fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3,
  boxShadow: `0 8px 20px ${color}55`,
});

// Soft-pastel skin for the dashboard itself. The saturated KID_* above stay
// for KidActionModal, where a solid fill is what a primary CTA wants; these
// are backgrounds carrying dark text, which is a different job.
const KID_BG = "#F8F6FF";
const KID_INK = "#2D1B4E";
const KID_INK_SOFT = "#5C3E9B";
const KID_LILAC = "#E8E0FF";
const KID_LILAC_LINE = "#D6C7FF";
const KID_VIOLET = "#8B5CF6";
const KID_MINT = "#E0F7FA"; const KID_MINT_LINE = "#B2EBF2";
const KID_TEAL = "#00838F";
const KID_PEACH = "#FFE0B2"; const KID_PEACH_LINE = "#FFCC80";
const KID_CORAL = "#E65100";
const KID_HAIRLINE = "#EFEAF8";
// Rounded faces if the device has one (Apple ships SF Rounded as ui-rounded);
// Quicksand/Nunito are named so they're picked up if ever self-hosted, but
// nothing here loads a webfont. Elsewhere this falls back to the system sans.
const KID_FONT = '"Quicksand", "Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
const KID_SOFT_SHADOW = "0 4px 12px rgba(0,0,0,0.03)";
const KID_ROW_ACTIONS_WIDTH = 92; // same two 44px tiles as every other swipe row

const kidSoftBtn = (bg, line, ink) => ({
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "18px 12px", borderRadius: 22, background: bg, border: `1px solid ${line}`, color: ink,
  textAlign: "center", cursor: "pointer", fontFamily: "inherit", boxShadow: KID_SOFT_SHADOW,
});

// The vault mascot. Licensed vector art (VectorStock #47618104), dropped in
// as a bundled asset rather than redrawn — swap src/assets/kid-pig.svg to
// change it. Background rect stripped from the source file so it sits
// transparent on the card.
function PiggyMascot({ size = 180 }) {
  // Rendered bigger than the row it sits in on purpose; the negative vertical
  // margin lets it overflow the row visually without growing the vault card.
  return <img src={kidPigMascot} width={size} height={size} style={{ flexShrink: 0, margin: "-20px 0" }} alt="" />;
}

// Empty-state mascot: a bear asleep on a pillow under a blanket. Same reason
// as PiggyMascot for drawing it rather than shipping a PNG.
function SleepyBear({ width = 150 }) {
  const FUR = "#A97244", FUR_DEEP = "#8D5C34", MUZZLE = "#EFE0C9",
    PILLOW = "#F8F2E9", BLANKET = "#EFE4D6", BLANKET_DEEP = "#E2D4C2",
    NOSE = "#5B3A21", SPARK = "#C6C0E6";
  const spark = (x, y, r) => `M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`;
  return (
    <svg viewBox="0 0 170 115" width={width} style={{ flexShrink: 0, maxWidth: "100%" }} aria-hidden="true">
      <g fill={SPARK}>
        <path d={spark(28, 34, 8)} />
        <path d={spark(14, 62, 5)} />
        <path d={spark(150, 40, 6)} />
        <path d={spark(140, 78, 4)} />
      </g>
      {/* Pillow */}
      <path d="M24 76 C24 64 38 60 52 62 C66 64 72 72 70 82 C68 92 52 96 38 94 C28 92 24 86 24 76 Z" fill={PILLOW} />
      {/* Body under the blanket */}
      <ellipse cx="104" cy="76" rx="46" ry="24" fill={FUR} />
      <path d="M70 62 C86 52 122 52 142 64 C152 70 152 88 140 94 C118 104 84 102 70 92 Z" fill={BLANKET} />
      <path d="M70 92 C84 100 118 102 140 94 C143 92 145 89 146 86 C120 96 90 95 70 86 Z" fill={BLANKET_DEEP} />
      {/* Ears */}
      <circle cx="52" cy="36" r="12" fill={FUR} />
      <circle cx="52" cy="36" r="6" fill={FUR_DEEP} />
      <circle cx="90" cy="34" r="10" fill={FUR} />
      <circle cx="90" cy="34" r="5" fill={FUR_DEEP} />
      {/* Head */}
      <ellipse cx="70" cy="58" rx="30" ry="27" fill={FUR} />
      {/* Muzzle */}
      <ellipse cx="74" cy="70" rx="19" ry="14" fill={MUZZLE} />
      <ellipse cx="74" cy="62" rx="5" ry="4" fill={NOSE} />
      <path d="M74 66 L74 70 M74 70 C73 74 69 74 68 71 M74 70 C75 74 79 74 80 71" fill="none" stroke={NOSE} strokeWidth="2" strokeLinecap="round" />
      {/* Closed eyes */}
      <g fill="none" stroke={NOSE} strokeWidth="2.6" strokeLinecap="round">
        <path d="M52 56 C55 61 60 61 63 56" />
        <path d="M86 54 C89 59 94 59 96 54" />
      </g>
    </svg>
  );
}

// Same swipe-to-reveal Edit/Delete as the ledger picker and inventory rows,
// via the same hook. Skips the shared `.swipe-row` class on purpose: its hover
// glow is keyed to the app accent, and this screen doesn't follow that.
function KidActivityRow({ e, cat, lang, t, first, onEdit, onDelete }) {
  const { x, dragging, closeRow, toggle, onTapOrClose, handlers } = useSwipeReveal(KID_ROW_ACTIONS_WIDTH);
  const earn = e.kind === "earn";
  return (
    <div style={{ position: "relative", borderTop: first ? "none" : `1px solid ${KID_HAIRLINE}` }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 16, display: "flex", justifyContent: "flex-end", alignItems: "stretch", gap: 6, padding: 4, visibility: x ? "visible" : "hidden" }}>
        <button onClick={() => { closeRow(); onEdit(); }} style={{ ...swipeActionBtn, background: KID_VIOLET, color: "#fff" }} aria-label={t("editItem")}>
          <Pencil size={17} />
        </button>
        <button onClick={() => { closeRow(); onDelete(); }} style={{ ...swipeActionBtn, background: "#DC2626", color: "#fff" }} aria-label={t("deleteItem")}>
          <Trash2 size={17} />
        </button>
      </div>
      <div {...handlers} onClick={() => onTapOrClose(() => {})}
        style={{
          position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12,
          background: "#fff", borderRadius: 16, padding: "12px 6px",
          transform: x ? `translateX(${x}px)` : "none", transition: dragging ? "none" : "transform .2s ease",
          touchAction: "pan-y", userSelect: "none",
        }}>
        <span style={{ fontSize: 26 }} aria-hidden="true">{categoryIcon(cat)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: KID_INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: KID_INK_SOFT }}>{shortDate(e.date, lang)}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 16, color: earn ? KID_TEAL : KID_CORAL, flexShrink: 0 }}>
          {earn ? "+" : "-"}{money(Math.abs(Number(e.amount) || 0))}
        </div>
        <button className="swipe-more-btn" onClick={(ev) => { ev.stopPropagation(); toggle(); }}
          aria-label={t("moreActions")} style={moreBtn}>
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  );
}

function KidLedgerDashboard({ ledger, categories, expenses, members, goal, onAddExpense, onDeleteExpense, onSaveGoal, error,
  lang, changeLang, t, theme, changeTheme, accent, changeAccent, onExit, onNotification }) {
  const [actionKind, setActionKind] = useState(null); // null | "earn" | "spend"
  const [editingEntry, setEditingEntry] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);

  // All-time, not month-scoped — a vault is a running total, not a monthly one.
  const balance = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.kind === "earn" ? 1 : -1) * (Number(e.amount) || 0), 0),
    [expenses]
  );
  const recent = useMemo(
    () => expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15),
    [expenses]
  );
  const raised = goal ? Math.max(0, Math.min(balance, goal.targetAmount)) : 0;
  const pct = goal ? Math.round((raised / goal.targetAmount) * 100) : 0;
  const reached = goal && balance >= goal.targetAmount;

  return (
    <div style={{ background: KID_BG, color: KID_INK, fontFamily: KID_FONT, minHeight: "100%", padding: "20px 16px 40px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Back pill / ledger switcher / bell + menu. The switcher keeps its
            own chrome: it's shared with the grown-up ledgers, and it already
            renders as the white name pill this design asks for. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onExit} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20,
            background: "#fff", border: `1px solid ${KID_HAIRLINE}`, color: KID_INK,
            fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", boxShadow: KID_SOFT_SHADOW, flexShrink: 0,
          }}><ArrowLeft size={15} /> {t("backToDashboard")}</button>
          {/* A label, not the switcher the other ledgers get — switching from
              here goes through Back or the menu's Home. */}
          <div style={{ minWidth: 0, flex: 1, display: "flex", justifyContent: "center" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "100%",
              padding: "7px 14px", borderRadius: 20, background: "#fff",
              border: `1px solid ${KID_HAIRLINE}`, boxShadow: KID_SOFT_SHADOW,
            }}>
              <span style={{ fontSize: 16 }} aria-hidden="true">🐱</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: KID_INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ledger.name}</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <NotificationBell t={t} lang={lang} onNavigate={onNotification} />
            <HeaderMenu t={t} lang={lang} changeLang={changeLang} theme={theme} changeTheme={changeTheme}
              accent={accent} changeAccent={changeAccent} onHome={onExit} />
          </div>
        </div>

        {error && <div style={errorBox}>{t("loadErr", { msg: error })}</div>}

        {/* Treasure vault */}
        <div style={{
          background: KID_LILAC, border: `1px solid ${KID_LILAC_LINE}`, borderRadius: 28, padding: "24px 20px",
          display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 8px 20px rgba(139, 92, 246, 0.08)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: KID_INK_SOFT, marginBottom: 4 }}>{t("vaultTitle")}</div>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: KID_INK, fontVariantNumeric: "tabular-nums" }}>{money(balance)}</div>
            </div>
            <PiggyMascot />
          </div>

          {/* Tap anywhere on the goal to set or edit it — still the only entry
              point for something this small a feature needs. */}
          <div role="button" tabIndex={0} onClick={() => setEditingGoal(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingGoal(true); } }}
            style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
            {goal ? (
              <>
                <div style={{ height: 14, background: "#fff", borderRadius: 20, padding: 2, boxSizing: "border-box" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: KID_VIOLET, borderRadius: 20, transition: "width .3s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 800 }}>
                  <span style={{ color: KID_INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🎯 {goal.name} ({money(raised)} / {money(goal.targetAmount)})
                  </span>
                  <span style={{ color: KID_INK_SOFT, flexShrink: 0 }}>{reached ? t("goalReached") : `${pct}%`}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800, textAlign: "center", color: KID_INK_SOFT }}>🎯 {t("noGoalYet")}</div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button onClick={() => setActionKind("earn")} style={kidSoftBtn(KID_MINT, KID_MINT_LINE, KID_TEAL)}>
            <span style={{ fontSize: 18 }} aria-hidden="true">🪙</span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>+ {t("earnedMoney")}</span>
          </button>
          <button onClick={() => setActionKind("spend")} style={kidSoftBtn(KID_PEACH, KID_PEACH_LINE, KID_CORAL)}>
            <span style={{ fontSize: 18 }} aria-hidden="true">🛍️</span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>- {t("boughtSomething")}</span>
          </button>
        </div>

        {/* Recent activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: KID_INK, margin: "0 4px" }}>{t("recentActivity")}</h3>
          <div style={{
            background: "#fff", border: `1px solid ${KID_HAIRLINE}`, borderRadius: 28,
            padding: recent.length === 0 ? "28px 20px" : "14px", boxShadow: "0 6px 16px rgba(0,0,0,0.02)",
            // Rows live inside this card rather than being cards themselves,
            // so a swiped row would otherwise slide out past its left edge.
            overflow: "hidden",
          }}>
            {/* Bear left, thought bubble right. The bubble stays an ordinary
                rounded box rather than a drawn cloud outline, so it grows with
                whatever the translation is; the two trailing dots are what make
                it read as a thought rather than a label. */}
            {recent.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                <SleepyBear />
                <div style={{ position: "relative", flex: "1 1 150px", minWidth: 130 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: -6, bottom: 12, width: 9, height: 9, borderRadius: "50%", background: KID_BG, border: `1.5px solid #E2D9F3` }} />
                  <span aria-hidden="true" style={{ position: "absolute", left: -16, bottom: 4, width: 6, height: 6, borderRadius: "50%", background: KID_BG, border: `1.5px solid #E2D9F3` }} />
                  <div style={{
                    background: KID_BG, border: `1.5px solid #E2D9F3`, borderRadius: 20, padding: "12px 14px",
                    fontSize: 12, fontWeight: 700, color: "#4C3378", textAlign: "center", lineHeight: 1.5,
                  }}>
                    <div>{t("noKidActivity")}</div>
                    <div>{t("kidEmptyCta")}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recent.map((e, i) => (
                  <KidActivityRow key={e.id} e={e} cat={categories.find((c) => c.id === e.categoryId)}
                    lang={lang} t={t} first={i === 0}
                    onEdit={() => setEditingEntry(e)} onDelete={() => setConfirmDelete(e)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {actionKind && (
        <KidActionModal kind={actionKind} categories={categories} members={members} t={t}
          onSave={onAddExpense} onClose={() => setActionKind(null)} />
      )}
      {editingEntry && (
        <KidActionModal kind={editingEntry.kind} initial={editingEntry} categories={categories} members={members} t={t}
          onSave={onAddExpense} onClose={() => setEditingEntry(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog t={t} message={t("deleteConfirm", { name: confirmDelete.description })}
          onConfirm={() => { onDeleteExpense(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)} />
      )}
      {editingGoal && (
        <KidGoalEditor goal={goal} t={t} onSave={onSaveGoal} onClose={() => setEditingGoal(false)} />
      )}
    </div>
  );
}

// The "modal with 6 emoji tiles" from the brief: tap a category, an amount
// field appears, Save logs it. `kind` (earn/spend) comes from which of the two
// big buttons opened this, not from the category — Chores and Allowance read
// as "earn" reasons, Snacks/Toys/Games/Gifts as "spend" ones, but the tile
// grid itself is the same seeded category list either way (db.TEMPLATES.kid).
function KidActionModal({ kind, initial, categories, members, t, onSave, onClose }) {
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? null);
  const [amount, setAmount] = useState(initial ? String(Math.abs(Number(initial.amount) || 0)) : "");
  const [busy, setBusy] = useState(false);
  const amt = Number(amount) || 0;
  const valid = categoryId && amt > 0 && !busy;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const cat = categories.find((c) => c.id === categoryId);
    // No separate description field — kid-friendly means tap, type an amount,
    // done. The category name doubles as the activity list's entry title.
    await onSave({
      // Editing keeps the entry's own id and date; only what the two fields
      // here can change is rewritten.
      ...(initial ? { id: initial.id, date: initial.date } : { date: todayISO() }),
      description: catName(cat), amount: amt, categoryId, note: "",
      paidById: members[0]?.id || null, split: "personal", sharedWith: [], kind,
    });
    setBusy(false);
    onClose();
  };

  return (
    <Overlay title={kind === "earn" ? t("earnedMoney") : t("boughtSomething")} onClose={onClose} t={t}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 6px",
              borderRadius: 18, border: categoryId === c.id ? `3px solid ${KID_PURPLE}` : `2px solid ${LINE}`,
              background: categoryId === c.id ? `${KID_PURPLE}14` : CARD, cursor: "pointer", fontFamily: "inherit",
            }}>
            <span style={{ fontSize: 32 }} aria-hidden="true">{categoryIcon(c)}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK, textAlign: "center" }}>{catName(c)}</span>
          </button>
        ))}
      </div>
      {categoryId && (
        <div style={{ marginTop: 16 }}>
          <Field label={t("amount")}>
            <div style={{ ...input, display: "flex", alignItems: "center", gap: 4, fontSize: 22, fontWeight: 800 }}>
              <span>{currencySymbol(activeCurrency)}</span>
              <input autoFocus type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit", color: "inherit", width: "100%" }} />
            </div>
          </Field>
          <button onClick={save} disabled={!valid} className="btn-glow"
            style={{ ...addBtn, background: kind === "earn" ? KID_GREEN : KID_ORANGE, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
            {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {initial ? t("saveChanges") : t("kidAdd")}
          </button>
        </div>
      )}
    </Overlay>
  );
}

// One goal per ledger, overwritten rather than archived (see saveWishlistGoal)
// — simple on purpose, no goal history to manage.
function KidGoalEditor({ goal, t, onSave, onClose }) {
  const [name, setName] = useState(goal?.name || "");
  const [amount, setAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [busy, setBusy] = useState(false);
  const valid = name.trim() && Number(amount) > 0 && !busy;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    await onSave(name.trim(), Number(amount));
    setBusy(false);
    onClose();
  };

  return (
    <Overlay title={t("setGoalTitle")} onClose={onClose} t={t}>
      <Field label={t("goalNameLabel")}>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goalNamePh")}
          onKeyDown={(e) => e.key === "Enter" && save()} style={input} />
      </Field>
      <Field label={t("goalAmountLabel")}>
        <div style={{ ...input, display: "flex", alignItems: "center", gap: 4 }}>
          <span>{currencySymbol(activeCurrency)}</span>
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit", color: "inherit", width: "100%" }} />
        </div>
      </Field>
      <button onClick={save} disabled={!valid} className="btn-glow" style={{ ...addBtn, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
        {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("saveGoal")}
      </button>
    </Overlay>
  );
}

// Click-outside-to-close for every dropdown/menu in the header (ledger
// switcher, notifications, overflow menu). Returns a ref to attach to the
// menu's own wrapper; only acts on pointers landing outside it, rather than
// relying on the trigger button's stopPropagation to suppress a document
// "click" listener — that only works if the outside click actually fires
// one, and iOS Safari doesn't reliably synthesize a click event from a tap
// on a plain, non-interactive element (no cursor:pointer, no handler), so a
// menu closed only that way often just never closed on a phone. "mousedown"
// (not "click") fires immediately and is what AccordionRow below already
// used successfully for the same reason.
function useCloseOnOutside(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

// Loads every ledger the signed-in user can open (RLS already scopes this to
// owned + shared — no client-side filtering needed) and owns the dropdown's
// open/close state, so the header component below just renders.
function useLedgerSwitcher(currentId) {
  const [ledgers, setLedgers] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { db.fetchLedgers().then(setLedgers).catch(() => {}); }, []);
  const ref = useCloseOnOutside(open, () => setOpen(false));
  return { ledgers, currentId, open, setOpen, ref };
}

// Replaces the static ledger-name heading: click it to switch ledgers in place,
// no exit-to-picker round trip. "+ Create ledger" still hands off to the picker,
// which already has the template chooser — no need to duplicate that here.
function LedgerSwitcher({ ledger, onSwitch, onCreateNew, t }) {
  const { ledgers, open, setOpen, ref } = useLedgerSwitcher(ledger.id);
  const select = (l) => { setOpen(false); if (l.id !== ledger.id) onSwitch(l); };
  return (
    <div ref={ref} className="ledger-switcher" style={{ position: "relative", minWidth: 150, flex: "1 1 auto" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.4, minWidth: 0, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: INK }}>
          {ledger.name}
        </h1>
        {/* Caret hugs the title (title is flex:0 1 auto so it doesn't stretch and
            shove the arrow to the far edge) — a clear "this opens" cue. */}
        <ChevronDown size={20} strokeWidth={2.5} style={{ color: ACCENT_TEXT, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 220, maxWidth: 320, zIndex: 60 }}>
          {ledgers.map((l) => {
            const Icon = ledgerIcon(l.template);
            const active = l.id === ledger.id;
            return (
              <button key={l.id} role="menuitem" onClick={() => select(l)}
                style={{ ...menuItem, background: active ? OK_BG : "none", color: active ? OK_INK : INK }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                {active && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />
          <button role="menuitem" onClick={() => { setOpen(false); onCreateNew(); }} style={{ ...menuItem, color: ACCENT_TEXT }}>
            <Plus size={15} /> {t("createLedger")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================ Ledger ============================== */
function Ledger({ ledger, startView, nav, onNotification, currentUserId, onExit, onSwitchLedger, onSwitchLedgerHome, lang, changeLang, t, theme, changeTheme, accent, changeAccent }) {
  activeCurrency = ledger.currency || "CAD"; // set before children below read money()/currencySymbol()
  const isOwner = ledger.ownerId === currentUserId; // only owners may manage access
  const features = useLedgerFeatures(ledger);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const [month, setMonth] = useState(monthOf(todayISO()));
  // A travel ledger with a trip period set (migration 040) stops being
  // month-scoped entirely — transaction list/budget/Report/Settlement/Home
  // banner all become whole-ledger instead of flipping between calendar
  // months. Opt-in: a travel ledger with neither date set is unaffected.
  const isPeriodLedger = ledger.template === "travel" && !!ledger.startDate && !!ledger.endDate;
  // Budgets stay keyed the same way they always were (ledger + a
  // "YYYY-MM"-shaped string) — a period ledger just always resolves to the
  // same fixed key, so "this month's budget" becomes "the trip's budget"
  // for free, with no change to the budgets table at all.
  const budgetMonth = isPeriodLedger ? ledger.startDate.slice(0, 7) : month;
  const [editing, setEditing] = useState(null);   // null | "new" | expense
  const [detail, setDetail] = useState(null);      // null | expense
  const [managingCats, setManagingCats] = useState(false);
  const [managingMembers, setManagingMembers] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showEditBudget, setShowEditBudget] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  // Bento dashboard is the landing page; tapping a card switches into that
  // destination full-view instead of opening a slide-over. startView (from
  // App) skips straight to "ledger" when this mount came from an explicit
  // picker/switcher choice rather than the auto-loaded last-used ledger.
  const [viewState, setViewState] = useState(startView || "home"); // "home" | "ledger" | "inventory" | "grocery"
  const [batchRows, setBatchRows] = useState(null); // transactions pending batch review (from Upload)
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // MonthCalendar tap — filters the list only, not summary/settlement
  const [budgets, setBudgets] = useState(new Map());
  const [merchants, setMerchants] = useState([]);
  const [managingStores, setManagingStores] = useState(false);
  const [allLedgers, setAllLedgers] = useState([]);
  const [goal, setGoal] = useState(null); // Kid Ledger's wishlist goal, null elsewhere
  const [reminders, setReminders] = useState(new Map()); // expenseId -> {title, remindAt}, any template

  const refresh = useCallback(async () => {
    try {
      setError("");
      // Materialise any due recurring occurrences before reading expenses, so they
      // show up in this same load. Best-effort: a viewer can't insert, and a hiccup
      // here shouldn't block the ledger from opening.
      await db.generateDueRecurring(ledger.id).catch(() => {});
      // Auto-managed upcoming-charge reminders for recurring Subscriptions
      // rules — no toggle, just kept current alongside the generation above.
      await db.syncUpcomingChargeReminders(ledger.id, (name, days) => t("upcomingChargeTitle", { name, days })).catch(() => {});
      // Same deal for food about to go off — expiry_date has existed since
      // migration 021 but never reached the bell (migration 033). Inventory
      // is household-wide (038), so this isn't scoped to this ledger — it
      // just runs opportunistically whenever any ledger loads.
      await db.syncExpiryReminders((name, date) => t("expiryReminderTitle", { name, date: shortDate(date, lang) })).catch(() => {});
      // No lazy seeding here — categories are seeded from the chosen template when
      // the ledger is created, so an intentionally blank ledger stays blank.
      // Wishlist goal is Kid-Ledger-only — every other template skips the query
      // entirely, so this table existing (migration 016) is only a prerequisite
      // for that one template, never a trip hazard for the other four.
      const [cats, exps, mems, buds, shops, leds, wish, rems] = await Promise.all([
        db.fetchCategories(ledger.id), db.fetchExpenses(ledger.id),
        db.fetchMembers(ledger.id), db.fetchBudgets(ledger.id), db.fetchMerchants(ledger.id),
        db.fetchLedgers(), // for sending personal receipt items elsewhere
        ledger.template === "kid" ? db.fetchWishlistGoal(ledger.id) : Promise.resolve(null),
        db.fetchLedgerReminders(ledger.id),
      ]);
      setAllLedgers(leds);
      setMembers(mems);
      setBudgets(buds);
      setMerchants(shops);
      setCategories(cats);
      setExpenses(exps);
      setGoal(wish);
      setReminders(rems);
      setReady(true);
    } catch (e) {
      setError(e.message || String(e));
      setReady(true);
    }
  }, [ledger.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => db.subscribeLedger(() => refresh()), [refresh]); // live sync

  // A tapped notification (bell, or the push that opened the app) says which
  // view it belongs to — see notificationLink.js. "recurring" is a panel over
  // the ledger rather than a view of its own.
  useEffect(() => {
    if (!nav) return;
    if (nav.view === "recurring") { setViewState("ledger"); setShowRecurring(true); }
    else if (nav.view) setViewState(nav.view);
  }, [nav]);

  // ...and, for a cancellation reminder, which expense: open its own detail
  // panel rather than the list it's buried somewhere in, with the month moved
  // to match. Waits for `expenses` because the tap can land before this
  // ledger's rows have loaded, so this retries until the row shows up.
  // `handledNav` keeps that retry from re-opening the panel on every later
  // refresh, while still letting the *next* tap through.
  const handledNav = useRef(-1);
  useEffect(() => {
    if (!nav?.expenseId || handledNav.current === nav.n) return;
    const match = expenses.find((e) => e.id === nav.expenseId);
    if (!match) return;
    handledNav.current = nav.n;
    setMonth(monthOf(match.date));
    setDetail(match);
  }, [nav, expenses]);

  const catById = (id) => categories.find((c) => c.id === id);

  // Spend per category — the month on screen, or (period ledger) the whole
  // trip — for the budget bars.
  const spentByCategory = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      if ((!isPeriodLedger && monthOf(e.date) !== month) || !e.categoryId) continue;
      m.set(e.categoryId, (m.get(e.categoryId) || 0) + (Number(e.amount) || 0));
    }
    return m;
  }, [expenses, month, isPeriodLedger]);

  // For the calendar footer's "Balance from budget" — sum of each category's
  // saved budget for the month on screen, or the trip's one budget for a
  // period ledger (0 if nothing's been set at all).
  const totalBudget = useMemo(
    () => categories.reduce((sum, c) => sum + (budgets.get(db.budgetKey(budgetMonth, c.id)) || 0), 0),
    [categories, budgets, budgetMonth]
  );

  const saveBudgets = async (entries) => {
    try {
      for (const { categoryId, amount } of entries) await db.setBudget(ledger.id, categoryId, budgetMonth, amount);
      setBudgets(await db.fetchBudgets(ledger.id));
    } catch (e) { setError(e.message); }
  };
  // Copies this month's saved budget onto next month, category by category —
  // categories with no budget set are skipped rather than carrying a 0. Not
  // offered for a period ledger (see the Budget panel mount) — there's no
  // "next month" for a single trip.
  const carryBudgetForward = async () => {
    try {
      const next = nextMonthOf(month);
      for (const c of categories) {
        const amount = budgets.get(db.budgetKey(month, c.id));
        if (amount != null) await db.setBudget(ledger.id, c.id, next, amount);
      }
      setBudgets(await db.fetchBudgets(ledger.id));
    } catch (e) { setError(e.message); }
  };
  const saveGoal = async (name, targetAmount) => {
    try { await db.saveWishlistGoal(ledger.id, { name, targetAmount }); setGoal(await db.fetchWishlistGoal(ledger.id)); }
    catch (e) { setError(e.message); }
  };

  const upsertExpense = async (draft, rememberName, personal) => {
    try {
      if (rememberName) await db.rememberMerchant(ledger.id, rememberName);
      let expenseId = draft.id;
      if (draft.id) await db.updateExpense(draft.id, draft);
      else expenseId = await db.insertExpense(draft, ledger.id);
      if (draft.hasReminder && draft.reminderDate) {
        await db.upsertReminderNotification(ledger.id, expenseId, {
          title: t("cancellationReminderTitle", { name: draft.description }), remindAt: draft.reminderDate,
        });
      } else if (reminders.has(expenseId)) {
        // The toggle was turned off, or the category changed away from
        // Subscriptions — either way, a reminder that's no longer wanted
        // shouldn't survive un-set.
        await db.deleteReminderNotification(expenseId);
      }
      if (personal) await db.insertPersonalExpense(personal, memberById(members, draft.paidById)?.name);
      // No ledger id: inventory and grocery are household-wide as of migration
      // 038. These three calls kept passing one and were silently shifting
      // every argument along — the item object landed in a parameter that no
      // longer exists, and the write failed on a row with no name.
      if (draft.addToInventory && draft.description) {
        await db.upsertInventoryItem({
          name: draft.description, quantity: draft.invQuantity, unit: draft.invUnit,
          expiryDate: draft.invExpiryDate, category: catName(catById(draft.categoryId), lang),
        });
      }
      // Per-line-item adds from a scanned receipt — separate from the
      // whole-receipt toggle above, one row per item rather than one lump
      // entry named after the merchant. Sequential, not Promise.all, same as
      // every other batch write in this file (importExpensesBatch etc.) —
      // household-scale volume, and upsertInventoryItem's own read-then-write
      // isn't safe to run concurrently against itself.
      for (const name of draft.inventoryItemNames || []) {
        await db.upsertInventoryItem({ name, quantity: 1, unit: "", expiryDate: null, category: catName(catById(draft.categoryId), lang) });
      }
      for (const name of draft.groceryItemNames || []) {
        await db.addGroceryItem(name, 1);
      }
      setEditing(null);
      refresh();
    } catch (e) {
      // Rethrown so ExpenseForm can show this itself: the form is a fixed,
      // full-screen overlay, so setError alone painted the message behind it
      // where nobody could ever see it.
      setError(e.message);
      throw e;
    }
  };
  const removeExpense = async (id) => { try { await db.deleteExpense(id); refresh(); } catch (e) { setError(e.message); } };
  const reassign = async (id, categoryId) => { try { await db.setExpenseCategory(id, categoryId); refresh(); } catch (e) { setError(e.message); } };
  const commitCategories = async (list) => { try { setCategories(await db.persistCategories(list, categories, ledger.id)); } catch (e) { setError(e.message); } };
  // Removing someone who still has expenses is refused by the FK, so the error
  // surfaces here rather than silently dropping who paid for what.
  const commitStores = async (list) => { try { setMerchants(await db.persistMerchants(list, merchants, ledger.id)); } catch (e) { setError(e.message); } };
  // Updates the ledger object App holds, not just the DB row — otherwise the new
  // currency wouldn't take effect until you left and reopened this ledger.
  const changeCurrency = async (currency) => {
    try { await db.updateLedger(ledger.id, { currency }); onSwitchLedger({ ...ledger, currency }); }
    catch (e) { setError(e.message); }
  };
  // Same pattern as changeCurrency — updates the ledger object App holds, not
  // just the DB row, so the switch away from monthly scoping takes effect
  // immediately rather than waiting for a reload.
  const changePeriod = async (startDate, endDate) => {
    try {
      await db.updateLedger(ledger.id, { start_date: startDate || null, end_date: endDate || null });
      onSwitchLedger({ ...ledger, startDate: startDate || null, endDate: endDate || null });
    } catch (e) { setError(e.message); }
  };
  const commitMembers = async (list) => {
    try { setMembers(await db.persistMembers(list, members, ledger.id)); }
    catch (e) { setError(/foreign key/i.test(e.message || "") ? t("memberHasExpenses") : e.message); }
  };

  const monthsAvailable = useMemo(() => {
    const set = new Set(expenses.map((e) => monthOf(e.date)));
    set.add(monthOf(todayISO()));
    return [...set].sort().reverse();
  }, [expenses]);

  const rows = useMemo(
    () => (isPeriodLedger ? expenses : expenses.filter((e) => monthOf(e.date) === month)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses, month, isPeriodLedger]
  );
  // Display-only filter from tapping a MonthCalendar day — summary/settlement
  // below are computed from `rows`, not this, so they stay whole-month.
  const visibleRows = useMemo(
    () => (selectedDay ? rows.filter((e) => e.date === selectedDay) : rows),
    [rows, selectedDay]
  );

  const summary = useMemo(() => {
    let total = 0;
    const paid = new Map(members.map((m) => [m.id, 0]));
    for (const e of rows) {
      const amt = Number(e.amount) || 0;
      total += amt;
      if (paid.has(e.paidById)) paid.set(e.paidById, paid.get(e.paidById) + amt);
    }
    // Shares come from settle.js rather than being re-derived here: splitting
    // them separately in floats is what let two members each show $1,463.69 of
    // a $2,927.37 bill — a cent more than was actually spent.
    return {
      total, paid, sharedShare: sharedShares(rows, members),
      balances: netBalances(rows, members), transfers: settlements(rows, members),
    };
  }, [rows, members]);

  if (!ready) return <Centered>{t("connecting")}</Centered>;

  // Its own dashboard entirely, not another branch inside the household/travel/
  // personal UI below — a kid's vault/goal/activity view has nothing in common
  // with month grids and settle-up, so bolting it on here would mean threading
  // template checks through code that has nothing to do with it.
  if (ledger.template === "kid") {
    return (
      <KidLedgerDashboard ledger={ledger} categories={categories} expenses={expenses} members={members}
        goal={goal} onAddExpense={upsertExpense} onDeleteExpense={removeExpense} onSaveGoal={saveGoal} error={error}
        lang={lang} changeLang={changeLang} t={t} theme={theme} changeTheme={changeTheme}
        accent={accent} changeAccent={changeAccent} onExit={onExit}
        onNotification={onNotification} />
    );
  }

  const label = monthName(month, lang);
  const periodLabel = isPeriodLedger ? `${shortDate(ledger.startDate, lang)} – ${shortDate(ledger.endDate, lang)}` : label;

  // Bell + overflow menu, the same in every view — only which menu entries are
  // offered changes. Hoisted so the branded header (home/inventory/grocery) and
  // the ledger's back-button header share one definition instead of two copies.
  const headerControls = (
    <>
      <NotificationBell t={t} lang={lang} onNavigate={onNotification} />
      <HeaderMenu t={t} lang={lang} changeLang={changeLang} theme={theme} changeTheme={changeTheme} accent={accent} changeAccent={changeAccent}
        onHome={viewState === "home" ? undefined : () => setViewState("home")}
        onBudget={viewState === "ledger" ? () => setShowBudget(true) : undefined}
        onReport={viewState === "ledger" ? () => setShowReport(true) : undefined}
        onStores={viewState === "ledger" ? () => setManagingStores(true) : undefined}
        onManageMembers={viewState === "ledger" && features.showSplit ? () => setShowManageMembers(true) : undefined}
        onRecurring={viewState === "ledger" && features.hasRecurring ? () => setShowRecurring(true) : undefined}
        currency={viewState === "ledger" && features.hasCurrency ? ledger.currency : undefined} onChangeCurrency={changeCurrency}
        showArchivedLedgers={viewState === "ledger"}
        tripDates={viewState === "ledger" && ledger.template === "travel" ? { startDate: ledger.startDate, endDate: ledger.endDate } : undefined}
        onChangeTripDates={changePeriod} />
    </>
  );

  return (
    <div style={{ position: "relative", background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      {/* Behind every view here (home/ledger/inventory/grocery), not just the
          sign-in and picker entry screens. Light mode now has a real
          background of its own, so it no longer skips home the way the old
          scoped accent glow did. */}
      {theme === "dark" ? <CosmicBackground /> : <DaylightBackground />}
      <style>{`
        .exp-row { display:grid !important; grid-template-columns:minmax(0, 1fr) auto; grid-template-rows:auto auto; column-gap:12px; row-gap:7px; }
        .exp-main { grid-column:1; grid-row:1; min-width:0; }
        .exp-meta { grid-column:1 / -1; grid-row:2; min-width:0; }
        .exp-total { grid-column:2; grid-row:1; align-self:center; }
        /* .swipe-row supplies the hover/focus glow (same glass-card treatment
           as the ledger picker/Inventory/Grocery rows) — this row has no
           swipe gesture of its own, just borrows that class for the glow. */
        .exp-row:focus-visible { border-color: rgba(var(--accent-rgb),0.75) !important; box-shadow: var(--glass-card-shadow), 0 0 16px rgba(var(--accent-rgb),0.3), 0 0 40px rgba(var(--accent-rgb),0.14) !important; }
        @media (max-width: 560px) {
          .ledger-switcher { flex-basis:100%; }
          .exp-row { padding:14px !important; }
        }
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        {/* Home, Inventory and Grocery all wear the brand: they're the screens
            you land on and hand around, and the wordmark is what says which app
            this is. Only "ledger" swaps it for a "Back to Dashboard" button —
            that goes all the way out to the picker (onExit), a different
            destination than the overflow menu's Home entry, so it can't be
            folded into the branded header. Inventory/Grocery never had that
            button: their only way back is Home, which the menu already does.
            Month-select is ledger-only. So are the overflow menu's
            ledger-management entries (Budget/Reports/Recurring/members/
            stores/currency) — gated to viewState==="ledger" specifically,
            not "every non-home view": Inventory/Grocery are part of the
            same ledger, but those entries operate on transactions/
            categories/splits, which don't mean anything from either. */}
        {viewState === "ledger" ? (
          <div className="ledger-header" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {/* Back button and the bell/menu share the top row — they're both
                navigation, not page content, so they read as one header line
                rather than bell/menu drifting down to sit with the month. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={onExit} style={ghostBtn}><ArrowLeft size={15} /> {t("backToDashboard")}</button>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                {headerControls}
              </div>
            </div>
            {/* Month and Add expense scope the page below them, so they get
                their own row — Add expense shrunk to a chip beside the month
                instead of the full-width button it used to be under the
                calendar, since this is the more-used path once a ledger is
                already open (the calendar's own days still open the form too). */}
            <div className="ledger-controls" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
              {/* A period ledger has nothing to switch between — one fixed
                  trip, not a recurring monthly cycle — so this is a label,
                  not a picker. */}
              {isPeriodLedger ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{periodLabel}</span>
              ) : (
                // Same 34px/radius-8 box as the bell/menu buttons above —
                // selectStyle's own height/radius (built for a full-width
                // Report picker) read taller and rounder next to them.
                <select value={month} onChange={(e) => { setMonth(e.target.value); setSelectedDay(null); }} aria-label={t("selectMonth")}
                  style={{ ...selectStyle, height: 34, borderRadius: 8, fontSize: 14, padding: "0 10px" }}>
                  {monthsAvailable.map((m) => (
                    <option key={m} value={m}>{new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" })}</option>
                  ))}
                </select>
              )}
              {/* Matched to the month select's explicit 34px: chip()'s height
                  comes out of its padding and lands ~2px short of it. */}
              <button onClick={() => setEditing("new")} className="btn-glow" style={{ ...chip(true), height: 34 }}>
                <Plus size={14} /> {t("addExpense")}
              </button>
            </div>
          </div>
        ) : (
          <BrandHeader right={headerControls} />
        )}

        {error && <div style={errorBox}>{t("loadErr", { msg: error })}</div>}

        {viewState === "home" && (
          <HomePage ledgerId={ledger.id} ledgerName={ledger.name} t={t} spent={summary.total} budget={totalBudget} lastEntry={expenses[0] || null}
            onOpenLedger={onExit} onViewTransactions={() => setViewState("ledger")}
            onOpenInventory={() => setViewState("inventory")} onOpenGrocery={() => setViewState("grocery")}
            onOpenBudget={() => setShowBudget(true)} onSwitchLedger={onSwitchLedgerHome} />
        )}

        {viewState === "ledger" && (
          <>
            {/* Add expense moved up into the header chip beside the month —
                no full-width button needed here any more. */}
            <MonthCalendar month={month} expenses={expenses} lang={lang} selectedDay={selectedDay} onSelectDay={setSelectedDay} t={t}
              total={summary.total} totalBudget={totalBudget} onCheckSettleUp={() => setShowSettlement(true)} />

            {/* List — one glass card per expense (matching Inventory Hub/Smart
                Grocery's row style) instead of a single bordered block with
                hairline dividers between rows. */}
            {visibleRows.length === 0 ? (
              <div style={{ marginTop: 14, padding: "40px 20px", textAlign: "center", color: SUB }}>
                <Receipt size={26} style={{ opacity: 0.4 }} />
                <p style={{ margin: "10px 0 0" }}>
                  {selectedDay ? t("emptyStateDay", { date: shortDate(selectedDay, lang) }) : t("emptyState", { month: periodLabel })}
                </p>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {visibleRows.map((e) => {
                  const cat = catById(e.categoryId);
                  const payer = memberById(members, e.paidById);
                  return (
                    <div key={e.id} className="exp-row swipe-row" role="button" tabIndex={0}
                      onClick={() => setDetail(e)}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDetail(e); } }}
                      style={{
                        padding: "12px 14px", cursor: "pointer", outline: "none",
                        background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)",
                        boxShadow: "var(--glass-card-shadow)",
                        borderRadius: 12,
                      }}>
                      <div className="exp-main">
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.description}</div>
                      </div>
                      <div className="exp-total" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(e.amount)}</div>
                        <ChevronRight size={17} style={{ color: SUB }} />
                      </div>
                      <div className="exp-meta" style={{ fontSize: 12, color: SUB, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 8px", borderRadius: 99, background: OK_BG, color: OK_INK, fontSize: 11, fontWeight: 700 }}>
                          <span aria-hidden="true">{categoryIcon(cat)}</span>
                          {cat ? catName(cat, lang) : t("uncategorised")}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{shortDate(e.date, lang)}</span>
                        {/* Who-paid and split-mode are both meaningless on a Personal
                            ledger — there's exactly one (silent) payer and every
                            expense is personal, so the badges would just repeat
                            the same two things on every single row. */}
                        {features.showSplit && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 99, background: payer?.color || SUB }} />
                              {payer?.name || "—"}
                            </span>
                            <span aria-hidden="true">·</span>
                            {/* Plain SUB, matching the date/payer either side — it stood
                                out as the one accent-coloured thing in an otherwise
                                neutral metadata row. */}
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: SUB }}>
                              {e.split === "shared" ? <Users size={11} /> : <User size={11} />}
                              {e.split === "shared" ? t("split") : t("personal")}
                            </span>
                          </>
                        )}
                        {e.recurringRuleId && (
                          <span title={t("recurring")} aria-label={t("recurring")} style={{ display: "inline-flex", alignItems: "center", color: "#94A3B8" }}>
                            <Repeat size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ fontSize: 12, color: SUB, marginTop: 14, textAlign: "center" }}>{t("stepFooter")}</p>
          </>
        )}

        {/* "ledger" routes to the picker (onExit), not setViewState("ledger") —
            matching what "Ledger & Transactions" already means everywhere
            else it appears (the Home dashboard's card does the same); the
            in-ledger transactions view is reached via the budget banner's
            "View transactions" instead, same as from Home. */}
        {/* No ledgerId — Inventory Hub and Smart Grocery are household-wide,
            not scoped to this ledger (migration 038). */}
        {viewState === "inventory" && <InventoryPanel t={t} lang={lang} onSwitchView={(v) => (v === "ledger" ? onExit() : setViewState(v))} />}
        {viewState === "grocery" && <GroceryListPanel t={t} lang={lang} onSwitchView={(v) => (v === "ledger" ? onExit() : setViewState(v))} />}
      </div>

      {detail && (
        <ExpenseDetail expense={detail} categories={categories} members={members} lang={lang} t={t}
          onReassign={(cid) => { reassign(detail.id, cid); setDetail({ ...detail, categoryId: cid }); }}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => setConfirmDeleteExpense(true)}
          onClose={() => setDetail(null)} />
      )}
      {confirmDeleteExpense && (
        <ConfirmDialog t={t} message={t("deleteConfirm", { name: detail.description })}
          onConfirm={() => { removeExpense(detail.id); setDetail(null); setConfirmDeleteExpense(false); }}
          onCancel={() => setConfirmDeleteExpense(false)} />
      )}
      {editing !== null && (
        <ExpenseForm initial={editing === "new" ? null : editing} categories={categories} members={members} features={features}
          merchants={merchants} expenses={expenses} ledgers={allLedgers} lang={lang} t={t}
          existingReminder={editing && editing !== "new" ? reminders.get(editing.id) : null}
          onClose={() => setEditing(null)} onSave={upsertExpense} onEditMembers={() => setManagingMembers(true)}
          onEditCategories={() => setManagingCats(true)} defaultMonth={month} defaultDate={selectedDay}
          onBatchImport={(transactions) => { setEditing(null); setBatchRows(transactions); }} />
      )}
      {/* Rendered before MemberManager below (same fixed z-index everywhere —
          later in the DOM wins), so "Edit members" opened from inside this modal
          stacks on top instead of behind it. */}
      {batchRows && <BatchImportModal ledger={ledger} features={features} categories={categories} members={members} lang={lang} t={t}
        initialRows={batchRows} onClose={() => setBatchRows(null)} onImported={refresh} onEditMembers={() => setManagingMembers(true)} />}
      {managingStores && (
        <StoreManager merchants={merchants} t={t} onChange={commitStores} onClose={() => setManagingStores(false)} />
      )}
      {managingCats && (
        <CategoryManager categories={categories} lang={lang} t={t} onChange={commitCategories} onClose={() => setManagingCats(false)} />
      )}
      {managingMembers && (
        <MemberManager members={members} t={t} onChange={commitMembers} onClose={() => setManagingMembers(false)} />
      )}
      {showBudget && (
        <BudgetPanel month={budgetMonth} monthLabel={periodLabel} categories={categories} expenses={expenses} budgets={budgets} lang={lang}
          spentByCategory={spentByCategory} spent={summary.total} t={t}
          periodRange={isPeriodLedger ? { startDate: ledger.startDate, endDate: ledger.endDate } : null}
          onEditBudget={() => setShowEditBudget(true)} onClose={() => setShowBudget(false)} />
      )}
      {/* Rendered after BudgetPanel — same fixed z-index everywhere, later in
          the DOM wins, so opening this from BudgetPanel's "Edit budget" badge
          stacks on top instead of behind it (same fix as the batch-import/
          member-manager stacking issue). onCarryForward omitted for a period
          ledger — one trip has no "next month" to carry a budget into. */}
      {showEditBudget && (
        <EditBudgetPanel month={budgetMonth} monthLabel={periodLabel} categories={categories} budgets={budgets} t={t}
          onSave={saveBudgets} onCarryForward={isPeriodLedger ? undefined : carryBudgetForward} onClose={() => setShowEditBudget(false)} />
      )}
      {showReport && (
        <MonthlyReport month={month} months={monthsAvailable} expenses={expenses} categories={categories}
          lang={lang} t={t} onMonthChange={setMonth} onClose={() => setShowReport(false)}
          isPeriodLedger={isPeriodLedger} periodLabel={periodLabel} />
      )}
      {showSettlement && <SettlementDetails members={members} summary={summary} t={t} onClose={() => setShowSettlement(false)} />}
      {showManageMembers && <ManageMembersModal ledger={ledger} isOwner={isOwner} t={t} onClose={() => setShowManageMembers(false)} />}
      {showRecurring && <RecurringPanel ledger={ledger} categories={categories} members={members} features={features} lang={lang} t={t}
        onClose={() => setShowRecurring(false)} onChanged={refresh} />}
    </div>
  );
}

/* ----------------------------- Pieces ----------------------------- */

// A select, not a row of buttons: five languages wrapped to two lines in the
// login header, and the list only grows. Native picker, so it stays one line
// at any count and gets the platform's own wheel/menu on mobile.
function LangToggle({ lang, changeLang, t }) {
  return (
    <select value={lang} onChange={(e) => changeLang(e.target.value)} aria-label={t("language")}
      style={{ ...selectStyle, fontSize: 13, padding: "7px 8px" }}>
      {LANGS.map(([l, lbl]) => <option key={l} value={l}>{lbl}</option>)}
    </select>
  );
}

// Shows the single largest transfer as plain "X owes Y $n"; the full list (there
// can be several with 3+ members) lives in the SettlementDetails panel this opens.
// Month-grid view of daily spend, sitting above the transaction list. Tapping
// a day is a display filter only — it narrows the list below, but summary/
// settlement math stays whole-month (netBalances/settlements run on the
// unfiltered rows in Ledger; this component never sees them). The spend
// total and settle-up entry point (formerly two separate bars) live as a
// footer row on this same card — "Check settle up" is deliberately detail-
// free, the amounts/who-owes-whom live in SettlementDetails behind it.
function MonthCalendar({ month, expenses, lang, selectedDay, onSelectDay, t, total, totalBudget, onCheckSettleUp }) {
  const totals = useMemo(() => dailyTotalsFor(month, expenses), [month, expenses]);
  const [year, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mo, 0).getDate();
  const startWeekday = (new Date(year, mo - 1, 1).getDay() + 6) % 7; // Monday = 0
  // A known Monday, walked forward — gives locale-correct short weekday names
  // without hardcoding a translated list, same trick monthName/shortDate use.
  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      return d.toLocaleDateString(dateLocale(lang), { weekday: "short" });
    });
  }, [lang]);
  const today = todayISO();
  const cells = Array(startWeekday).fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`));
  // Fixed, not scaled by amount — this is "did you spend that day", not a
  // heatmap of how much. A flat tint is easier to read at a glance across a
  // whole month than a gradient is at this size.
  const SPEND_TINT = `color-mix(in srgb, ${WARN} 12%, transparent)`;

  return (
    <div style={{ background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 14, padding: 14, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {weekdayLabels.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const amt = totals.get(iso) || 0;
          const isToday = iso === today;
          const isSelected = iso === selectedDay;
          // Selected wins the whole cell (solid square, like before this
          // round of tweaks); today and "spent that day" are both a small
          // circle behind just the number, so they can't visually collide
          // with the selected state.
          const badgeBg = isToday ? OK_BG : amt > 0 ? SPEND_TINT : "transparent";
          const badgeInk = isToday ? OK_INK : INK;
          return (
            // justifyContent: flex-start, not center — a grid row stretches every
            // cell to match its tallest (the ones with a second, amount line), and
            // centering made a one-line cell's day number drift down to the middle
            // of that taller box while a two-line cell's stayed pinned near the
            // top. Same padding-top on every cell keeps every number aligned along
            // one row regardless of which cells carry an amount underneath.
            <button key={iso} onClick={() => onSelectDay(isSelected ? null : iso)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 3,
                minHeight: 46, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", padding: "6px 0 0", border: "none",
                background: isSelected ? TEAL : "transparent", color: isSelected ? ACCENT_INK : INK,
              }}>
              <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, fontSize: 13, fontWeight: isToday || isSelected ? 800 : 600, background: isSelected ? "transparent" : badgeBg, color: isSelected ? ACCENT_INK : badgeInk }}>
                {Number(iso.slice(-2))}
              </span>
              {amt > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isSelected ? ACCENT_INK : SUB }}>
                  {money(amt)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: SUB }}>{shortDate(selectedDay, lang)}</span>
          <button onClick={() => onSelectDay(null)} style={{ ...categoryLink, color: ACCENT_TEXT }}>{t("showAll")}</button>
        </div>
      )}
      {/* One bar: two compact stats, then Settle up + chevron flush right.
          Smaller type than a standalone stat card needs, specifically so all
          three fit on one line at phone width without wrapping. */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, color: SUB, fontWeight: 600, whiteSpace: "nowrap" }}>{t("totalSpending")}</div>
          <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(total)}</div>
        </div>
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, color: SUB, fontWeight: 600, whiteSpace: "nowrap" }}>{t("balance")}</div>
          <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: totalBudget > 0 ? (totalBudget - total < 0 ? DANGER : TEAL) : INK }}>
            {totalBudget > 0 ? money(totalBudget - total) : "—"}
          </div>
        </div>
        <button onClick={onCheckSettleUp} style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>{t("settleUp")}</span>
          <ChevronRight size={18} style={{ color: SUB, flexShrink: 0 }} />
        </button>
      </div>
    </div>
  );
}

function SettlementDetails({ members, summary, t, onClose }) {
  return (
    <Overlay title={t("settlementDetails")} t={t} onClose={onClose}>
      {/* Who pays whom comes first: it's the answer you opened this panel for.
          The per-member cards below are the working that backs it up. */}
      {summary.transfers.length === 0 ? <div style={{ color: SUB, fontSize: 13 }}>{t("noSharedBills")}</div> : (
        <div style={{ background: OK_BG, color: OK_INK, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700 }}>
          {summary.transfers.map((transfer, index) => <div key={index}>{t("owesLine", { debtor: memberById(members, transfer.fromId)?.name || "—", creditor: memberById(members, transfer.toId)?.name || "—", amount: money(transfer.amount) })}</div>)}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((member) => {
          const balance = summary.balances.get(member.id) || 0;
          const receiving = balance > 0.005;
          const paying = balance < -0.005;
          return (
            <div key={member.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: member.color }} /> {member.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div><div style={{ fontSize: 11, color: SUB, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("paidThisMonth")}</div><div style={{ fontWeight: 800, marginTop: 3 }}>{money(summary.paid.get(member.id) || 0)}</div></div>
                <div><div style={{ fontSize: 11, color: SUB, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("sharedShare")}</div><div style={{ fontWeight: 800, marginTop: 3 }}>{money(summary.sharedShare.get(member.id) || 0)}</div></div>
              </div>
              {(receiving || paying) && <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10, fontSize: 13, fontWeight: 700, color: receiving ? ACCENT_TEXT : WARN }}>{receiving ? t("shouldReceive") : t("shouldPay")}: {money(Math.abs(balance))}</div>}
            </div>
          );
        })}
      </div>
    </Overlay>
  );
}

// Owner-only. Top: the access roster (owner + everyone with a role), each row
// showing name/email beside their role — Editor/Viewer changeable in place,
// removable; the owner's own row is fixed (ownership lives on ledgers.owner_id,
// not this table, so there's nothing here to edit for them). Bottom: the invite
// form, folded in rather than its own overlay — one panel for "who has access".
function ManageMembersModal({ ledger, isOwner, t, onClose }) {
  const [roster, setRoster] = useState(null); // null = loading
  const [pending, setPending] = useState([]); // invites nobody has redeemed yet
  const [rosterErr, setRosterErr] = useState("");
  const [busyUser, setBusyUser] = useState(null); // userId currently being changed/removed
  const [busyInvite, setBusyInvite] = useState(null); // invite id being revoked

  const load = useCallback(() => {
    Promise.all([db.fetchRoster(ledger.id), db.fetchPendingInvites(ledger.id)])
      .then(([r, p]) => { setRoster(r); setPending(p); })
      .catch((e) => setRosterErr(e.message || String(e)));
  }, [ledger.id]);
  useEffect(load, [load]);

  // Everyone (Editor, Viewer, Owner) sees this same panel now; these writes stay
  // owner-only. Checking isOwner before the network call means a non-owner gets a
  // clear "you can't do this" instead of a raw RLS-violation error string.
  const changeRole = async (m, role) => {
    if (!isOwner) { setRosterErr(t("ownerOnlyErr")); return; }
    if (m.role === role) return;
    setBusyUser(m.userId);
    try { await db.updateMemberRole(ledger.id, m.userId, role); load(); }
    catch (e) { setRosterErr(e.message || String(e)); }
    finally { setBusyUser(null); }
  };
  const [confirmRemove, setConfirmRemove] = useState(null); // roster row pending removal
  const removeOne = (m) => {
    if (!isOwner) { setRosterErr(t("ownerOnlyErr")); return; }
    setConfirmRemove(m);
  };
  const doRemove = async () => {
    const m = confirmRemove;
    setConfirmRemove(null);
    setBusyUser(m.userId);
    try { await db.removeMember(ledger.id, m.userId); load(); }
    catch (e) { setRosterErr(e.message || String(e)); }
    finally { setBusyUser(null); }
  };
  const revoke = async (inv) => {
    if (!isOwner) { setRosterErr(t("ownerOnlyErr")); return; }
    setBusyInvite(inv.id);
    try { await db.revokeInvite(inv.id); load(); }
    catch (e) { setRosterErr(e.message || String(e)); }
    finally { setBusyInvite(null); }
  };

  const [role, setRole] = useState("EDITOR");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  // Invites now require an email — the link is locked to that account rather than
  // being an open link anyone could redeem. Loose regex on purpose: it rejects the
  // obviously-empty/garbled, the real check is delivery + accept_invite's own match.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const generate = async () => {
    if (!isOwner) { setErr(t("ownerOnlyErr")); return; }
    if (!emailValid) { setErr(t("inviteEmailRequiredErr")); return; }
    setBusy(true); setErr("");
    try { setLink(await db.createInvite(ledger.id, role, email.trim())); load(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked; the field is selectable */ }
  };

  return (
    <Overlay title={t("manageAccess")} t={t} onClose={onClose}>
      <Field label={t("currentMembers")}>
        {rosterErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 8 }}>{rosterErr}</div>}
        {!roster ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: SUB, fontSize: 13, padding: "8px 0" }}><Loader2 size={15} className="spin" /> {t("connecting")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {roster.map((m) => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", opacity: busyUser === m.userId ? 0.6 : 1 }}>
                {/* Username is the identity people recognise; email rides along
                    underneath rather than competing with it for the same line. */}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.email}</div>
                  {/* Pre-invite-feature accounts got name backfilled to their email
                      (migration 009's coalesce fallback) — skip the redundant line. */}
                  {m.name && m.name !== m.email && <div style={{ fontSize: 12, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>}
                </span>
                {m.isOwner ? (
                  <span style={{ ...pill(TEAL), fontSize: 11, flexShrink: 0 }}>{t("roleOwner")}</span>
                ) : (
                  <>
                    <button disabled={busyUser === m.userId} onClick={() => changeRole(m, "EDITOR")} style={chip(m.role === "EDITOR")}>{t("roleEditor")}</button>
                    <button disabled={busyUser === m.userId} onClick={() => changeRole(m, "VIEWER")} style={chip(m.role === "VIEWER")}>{t("roleViewer")}</button>
                    <button disabled={busyUser === m.userId} onClick={() => removeOne(m)} style={{ ...iconBtn, color: DANGER, flexShrink: 0 }} aria-label={t("removeMemberBtn")}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
            {/* Invites nobody has redeemed yet — no user_id exists for these, so
                there's nothing to change roles on, only revoke. */}
            {pending.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, background: MUTED_BG, border: `1px dashed ${LINE}`, borderRadius: 10, padding: "9px 10px", opacity: busyInvite === inv.id ? 0.6 : 1 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email || t("openInviteLink")}</div>
                  <span style={{ ...pill("#D97706"), fontSize: 10, marginTop: 2, display: "inline-block" }}>{t("pendingInvite")}</span>
                </span>
                <span style={{ ...pill("#94A3B8"), fontSize: 11, flexShrink: 0 }}>{inv.role === "VIEWER" ? t("roleViewer") : t("roleEditor")}</span>
                <button disabled={busyInvite === inv.id} onClick={() => revoke(inv)} style={{ ...iconBtn, color: DANGER, flexShrink: 0 }} aria-label={t("revokeInviteBtn")}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
        <Field label={t("invitePeople")}>
          <div style={{ display: "flex", gap: 3, background: MUTED_BG, borderRadius: 10, padding: 3 }}>
            <button onClick={() => { setRole("EDITOR"); setLink(""); }} style={segItem(role === "EDITOR")}>{t("roleEditor")}</button>
            <button onClick={() => { setRole("VIEWER"); setLink(""); }} style={segItem(role === "VIEWER")}>{t("roleViewer")}</button>
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{role === "EDITOR" ? t("roleEditorHint") : t("roleViewerHint")}</div>
        </Field>
        <Field label={t("inviteEmailLabel")}>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setLink(""); }} placeholder="name@example.com" style={input} />
          <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{t("inviteEmailHint")}</div>
        </Field>
        {err && <div style={{ color: DANGER, fontSize: 13 }}>{err}</div>}
        {!link ? (
          <button onClick={generate} disabled={busy || !emailValid} className="btn-glow" style={{ ...addBtn, justifyContent: "center", opacity: busy || !emailValid ? 0.6 : 1, cursor: busy ? "wait" : !emailValid ? "not-allowed" : "pointer" }}>
            {busy ? <Loader2 size={18} className="spin" /> : <Users size={18} />} {t("generateInvite")}
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("inviteLinkReady")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...input, flex: 1, minWidth: 0, fontSize: 13 }} />
              <button onClick={copy} style={{ ...ghostBtn, padding: "10px 14px", whiteSpace: "nowrap" }}>{copied ? <Check size={15} /> : null} {copied ? t("copiedLink") : t("copyLink")}</button>
            </div>
          </div>
        )}
      </div>
      {confirmRemove && (
        <ConfirmDialog t={t} message={t("removeMemberConfirm", { name: confirmRemove.name || confirmRemove.email })}
          confirmLabel={t("removeMemberBtn")} onConfirm={doRemove} onCancel={() => setConfirmRemove(null)} />
      )}
    </Overlay>
  );
}

// Lists the ledger's recurring rules and opens the form to add/edit one. Rule
// changes bubble up via onChanged so the ledger re-runs catch-up generation and
// the new expenses/badges appear without reopening anything.
function RecurringPanel({ ledger, categories, members, features, lang, t, onClose, onChanged }) {
  const [rules, setRules] = useState(null); // null = loading
  const [editing, setEditing] = useState(null); // null | "new" | rule
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    db.fetchRecurringRules(ledger.id).then(setRules).catch((e) => setErr(e.message || String(e)));
  }, [ledger.id]);
  useEffect(load, [load]);

  // Generation (in onChanged) advances each rule's cursor, so refetch the rules
  // AFTER it runs — otherwise the card's "next due" shows the pre-generation value.
  const after = async () => { await onChanged(); load(); };
  const save = async (rule) => {
    setErr("");
    try { await db.upsertRecurringRule(rule, ledger.id); setEditing(null); await after(); }
    // Re-thrown so RecurringForm (which replaces this panel's own render while
    // open — see the early return above) can show the failure itself; this
    // still sets `err` too, for the rarer case something goes wrong on the
    // list view (pause/delete) instead.
    catch (e) { setErr(e.message || String(e)); throw e; }
  };
  const togglePause = async (r) => {
    setBusyId(r.id);
    try { await db.setRecurringPaused(r.id, !r.paused); await after(); }
    catch (e) { setErr(e.message || String(e)); } finally { setBusyId(null); }
  };
  const [confirmDelete, setConfirmDelete] = useState(null); // rule pending delete confirmation
  const remove = (r) => setConfirmDelete(r);
  const doDelete = async () => {
    const r = confirmDelete;
    setConfirmDelete(null);
    setBusyId(r.id);
    try { await db.deleteRecurringRule(r.id); await after(); }
    catch (e) { setErr(e.message || String(e)); } finally { setBusyId(null); }
  };

  const freqLabel = (f) => ({ weekly: t("freqWeekly"), monthly: t("freqMonthly"), yearly: t("freqYearly") }[f]);
  const nextDue = (r) => (r.paused ? null : r.lastGeneratedDate ? nextOccurrence(r.lastGeneratedDate, r.frequency) : r.startDate);

  if (editing !== null) {
    // This early-return replaces RecurringPanel's own render entirely, so its
    // {err && ...} banner below is unreachable from here — RecurringForm keeps
    // its own error state instead (fresh on every mount), or a failed save
    // would fail silently with the form just sitting there.
    return <RecurringForm initial={editing === "new" ? null : editing} categories={categories} members={members} features={features}
      lang={lang} t={t} onClose={() => setEditing(null)} onSave={save} />;
  }

  return (
    <Overlay onClose={onClose} title={t("recurring")} t={t}>
      <button onClick={() => setEditing("new")} className="btn-glow" style={{ ...addBtn, marginTop: 0, justifyContent: "center" }}>
        <Plus size={18} /> {t("recurringAdd")}
      </button>
      {err && <div style={{ color: DANGER, fontSize: 13 }}>{err}</div>}
      {!rules ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: SUB, fontSize: 13, padding: "8px 0" }}><Loader2 size={15} className="spin" /> {t("connecting")}</div>
      ) : rules.length === 0 ? (
        <div style={{ color: SUB, fontSize: 13, textAlign: "center", padding: "18px 0" }}>{t("noRecurring")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const due = nextDue(r);
            return (
              <div key={r.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, opacity: busyId === r.id ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</span>
                  <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(r.amount)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: SUB }}>
                  {cat && <span style={{ ...pill(cat.color || "#94A3B8"), fontSize: 11 }}>{catName(cat, lang)}</span>}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Repeat size={12} /> {freqLabel(r.frequency)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{r.paused ? t("paused") : `${t("nextDue")}: ${shortDate(due, lang)}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button onClick={() => togglePause(r)} disabled={busyId === r.id} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>
                    {r.paused ? <><Play size={14} /> {t("resumeRule")}</> : <><Pause size={14} /> {t("pauseRule")}</>}
                  </button>
                  <button onClick={() => setEditing(r)} style={iconBtn} aria-label={t("recurEdit")}><Pencil size={15} /></button>
                  <button onClick={() => remove(r)} disabled={busyId === r.id} style={{ ...iconBtn, color: DANGER }} aria-label={t("deleteStore")}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmDelete && <ConfirmDialog t={t} message={t("recurDeleteConfirm")} onConfirm={doDelete} onCancel={() => setConfirmDelete(null)} />}
    </Overlay>
  );
}

// Add/edit one rule. Mirrors the who-paid / split controls of the expense form so
// generated expenses land with a correct payer and sharers — the spec's five
// fields alone can't produce a valid expense in this split-aware ledger.
// Personal-template ledgers (features.showSplit false) hide both fields, same
// as ExpenseForm: one silent payer, every generated occurrence is personal.
function RecurringForm({ initial, categories, members, features, lang, t, onClose, onSave }) {
  const [d, setD] = useState(() => initial || {
    description: "", amount: "", categoryId: categories[0]?.id || null,
    paidById: members[0]?.id || null,
    split: features.showSplit ? "shared" : "personal",
    sharedWith: features.showSplit ? members.map((m) => m.id) : [],
    frequency: "monthly", startDate: todayISO(),
    // Same default as the DB column (migration 019) — on by default, so a
    // rule reminds you unless you turn it off.
    hasReminder: true, reminderLeadDays: 2,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sharerCount = d.split === "shared" ? (d.sharedWith || []).length : 0;
  const valid = d.description.trim() && Number(d.amount) > 0 && d.startDate && d.paidById
    && (d.split !== "shared" || sharerCount > 0)
    && (!d.hasReminder || Number(d.reminderLeadDays) > 0) && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr("");
    try { await onSave({ ...d, description: d.description.trim(), amount: Number(d.amount) }); }
    catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  return (
    <Overlay onClose={onClose} title={initial ? t("recurEdit") : t("recurNew")} t={t}>
      <Field label={t("formWhat")}>
        <input autoFocus value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder={t("formWhatPh")} style={input} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label={t("amount")} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: 12, color: SUB }}>$</span>
            <input type="number" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" style={{ ...input, paddingLeft: 24 }} />
          </div>
        </Field>
        <Field label={t("startDate")} style={{ flex: 1, minWidth: 0 }}>
          <input type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} style={dateInput} />
        </Field>
      </div>
      <Field label={t("frequency")}>
        <div style={{ display: "flex", gap: 3, background: MUTED_BG, borderRadius: 10, padding: 3 }}>
          {[["weekly", t("freqWeekly")], ["monthly", t("freqMonthly")], ["yearly", t("freqYearly")]].map(([f, label]) => (
            <button key={f} onClick={() => setD({ ...d, frequency: f })} style={segItem(d.frequency === f)}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label={t("category")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setD({ ...d, categoryId: c.id })} style={chip(d.categoryId === c.id)}>{catName(c, lang)}</button>
          ))}
        </div>
      </Field>
      {/* Every recurring rule gets this, not just Subscriptions-category ones —
          gating it by category name meant a rule under "SUB" or a typo'd
          category silently never showed the option at all. */}
      <Field label={t("upcomingChargeReminder")}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer" }}>
          <input type="checkbox" checked={d.hasReminder} onChange={(e) => setD({ ...d, hasReminder: e.target.checked })} />
          {t("remindMeUpcoming")}
        </label>
        {d.hasReminder && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="number" inputMode="numeric" min={1} value={d.reminderLeadDays}
              onChange={(e) => setD({ ...d, reminderLeadDays: e.target.value })}
              style={{ ...input, width: 70 }} />
            <span style={{ fontSize: 13, color: SUB }}>{t("daysBeforeLabel")}</span>
          </div>
        )}
      </Field>
      {features.showSplit && (
        <>
          <Field label={t("whoPaid")}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {members.map((m) => {
                const Icon = memberIcon(m.icon);
                return (
                  <button key={m.id} onClick={() => setD({ ...d, paidById: m.id })} style={chip(d.paidById === m.id)}>
                    <Icon size={13} /> {m.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t("split")}>
            <div style={{ display: "flex", gap: 3, background: MUTED_BG, borderRadius: 10, padding: 3 }}>
              <button onClick={() => setD({ ...d, split: "personal" })} style={segItem(d.split === "personal")}><User size={14} /> {t("personal")}</button>
              <button onClick={() => setD({ ...d, split: "shared", sharedWith: d.sharedWith?.length ? d.sharedWith : members.map((m) => m.id) })} style={segItem(d.split === "shared")}>
                <Users size={14} /> {t("splitBetween")}
              </button>
            </div>
            {d.split === "shared" && (
              <div style={{ marginTop: 10 }}>
                <SplitMemberPicker members={members} sharedWith={d.sharedWith || []} t={t}
                  onChange={(sharedWith) => setD({ ...d, sharedWith })} />
              </div>
            )}
          </Field>
        </>
      )}
      {err && <div style={errorBox}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "12px" }}>{t("cancel")}</button>
        <button onClick={submit} disabled={!valid} className="btn-glow" style={{ ...addBtn, flex: 2, marginTop: 0, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
          {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("saveRule")}
        </button>
      </div>
    </Overlay>
  );
}

// Batch add — the review/edit table for multiple transactions at once. The only
// way in is via the Add-expense form's Upload button (see ExpenseForm), which
// hands off already-parsed rows (a real CSV, or an AI-read statement screenshot/
// PDF) as `initialRows`; there's no file picker in here. The "Default card owner"
// selector only touches rows the user hasn't hand-picked a payer for
// (paidByTouched) — editing one row's payer opts it out of future bulk changes.
function BatchImportModal({ ledger, features, categories, members, lang, t, initialRows, onClose, onImported, onEditMembers }) {
  const [rows, setRows] = useState(() => buildPreviewRows(initialRows, categories, members[0]?.id || null));
  const [defaultPaidBy, setDefaultPaidBy] = useState(members[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, fail, total } after a confirm

  const patchRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const changeDefaultPaidBy = (memberId) => {
    setDefaultPaidBy(memberId);
    setRows((rs) => rs.map((r) => (r.paidByTouched ? r : { ...r, paidById: memberId })));
  };

  const valid = rows.length > 0 && members.length > 0 && !busy;

  const confirm = async () => {
    setBusy(true); setResult(null);
    const toInsert = rows.map((r) => ({
      description: r.description, amount: r.amount, date: r.date, categoryId: r.categoryId,
      paidById: r.paidById, note: null,
      split: features.showSplit ? "shared" : "personal",
      sharedWith: features.showSplit ? members.map((m) => m.id) : [],
    }));
    const results = await db.importExpensesBatch(toInsert, ledger.id);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    setBusy(false);
    setResult({ ok, fail, total: results.length });
    await onImported();
    // Keep only the rows that failed, so retrying doesn't re-insert (and
    // duplicate) the ones that already landed.
    if (fail === 0) onClose();
    else setRows((rs) => rs.filter((_, i) => !results[i].ok));
  };

  return (
    <Overlay onClose={onClose} title={t("csvImportTitle")} t={t}>
      {features.showSplit && (
        <Field label={
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {t("csvDefaultOwner")}
            <button onClick={onEditMembers} style={{ ...categoryLink, fontSize: 12, color: ACCENT_TEXT }}>{t("manageMembers")}</button>
          </span>
        }>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {members.map((m) => {
              const Icon = memberIcon(m.icon);
              return (
                <button key={m.id} onClick={() => changeDefaultPaidBy(m.id)} style={chip(defaultPaidBy === m.id)}>
                  <Icon size={13} /> {m.name}
                </button>
              );
            })}
          </div>
          {members.length === 0 && <div style={{ fontSize: 12, color: DANGER, marginTop: 6 }}>{t("noMembersHint")}</div>}
        </Field>
      )}
      {rows.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "20px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("csvNoRows")}</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: SUB }}>{t("csvRowCount", { n: rows.length })}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Native selects per row rather than the touch-friendly chip pickers used
                elsewhere in the app: with dozens of rows on screen at once, the
                compact form matters more here than it does for a single expense. */}
            {rows.map((r) => (
              <div key={r.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="date" value={r.date} onChange={(e) => patchRow(r.id, { date: e.target.value })} style={{ ...dateInput, width: 132, fontSize: 12, padding: "6px 8px" }} />
                  <input type="text" value={r.description} onChange={(e) => patchRow(r.id, { description: e.target.value })} style={{ ...input, flex: 1, fontSize: 13, padding: "6px 8px" }} />
                  <button onClick={() => removeRow(r.id)} style={{ ...iconBtn, width: 28, height: 28, color: DANGER, flexShrink: 0 }} aria-label={t("csvRemoveRow")}><Trash2 size={13} /></button>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ ...input, display: "flex", alignItems: "center", gap: 3, width: 92, flexShrink: 0, padding: "6px 8px", fontSize: 12 }}>
                    <span style={{ color: SUB, flexShrink: 0 }}>{currencySymbol(activeCurrency)}</span>
                    <input type="number" inputMode="decimal" value={r.amount}
                      onChange={(e) => patchRow(r.id, { amount: Number(e.target.value) || 0 })}
                      style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit", color: "inherit", width: "100%" }} />
                  </div>
                  <select value={r.categoryId || ""} onChange={(e) => patchRow(r.id, { categoryId: e.target.value || null })}
                    style={{ ...selectStyle, flex: 1, width: "auto", fontSize: 12, padding: "6px 8px" }}>
                    <option value="">{t("uncategorised")}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{catName(c, lang)}</option>)}
                  </select>
                  {features.showSplit && (
                    <select value={r.paidById || ""} onChange={(e) => patchRow(r.id, { paidById: e.target.value, paidByTouched: true })}
                      style={{ ...selectStyle, width: "auto", fontSize: 12, padding: "6px 8px" }}>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {result && (
        <div style={{ fontSize: 13, fontWeight: 600, color: result.fail ? DANGER : ACCENT_TEXT }}>
          {t("csvResult", { ok: result.ok, total: result.total })}{result.fail ? t("csvResultFail", { fail: result.fail }) : ""}
        </div>
      )}
      <button onClick={confirm} disabled={!valid} className="btn-glow" style={{ ...addBtn, marginTop: 6, justifyContent: "center", opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
        {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {busy ? t("csvImporting") : t("csvConfirm")}
      </button>
    </Overlay>
  );
}

function ExpenseDetail({ expense, categories, members, lang, t, onReassign, onEdit, onDelete, onClose }) {
  const payer = memberById(members, expense.paidById);
  const amt = Number(expense.amount) || 0;
  const shared = expense.split === "shared";
  const sharers = members.filter((m) => (expense.sharedWith || []).includes(m.id));
  const share = sharers.length ? amt / sharers.length : amt;
  return (
    <Overlay title={expense.description} onClose={onClose} t={t}>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(amt)}</div>
        <div style={{ fontSize: 13, color: shared ? ACCENT_TEXT : SUB, fontWeight: 600, marginTop: 2 }}>
          {shared ? t("sharedLine", { n: sharers.length, amount: money(share) }) : t("personalLine")}
        </div>
      </div>

      {/* Category — tap a pill to re-file this expense */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("category")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => onReassign(c.id)} style={chip(c.id === expense.categoryId)}>{catName(c, lang)}</button>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "2px 14px" }}>
        <FieldRow label={t("date")}>{expense.date}</FieldRow>
        <FieldRow label={t("paidBy")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: payer?.color || SUB }} />{payer?.name || "—"}
          </span>
        </FieldRow>
        <FieldRow label={t("split")}>
          {shared ? t("sharedAmong", { names: sharers.map((m) => m.name).join(", ") || "—" }) : t("personal")}
        </FieldRow>
        <FieldRow label={t("noteDisplay")} last>{expense.note ? expense.note : "—"}</FieldRow>
      </div>

      {/* Receipt items — stub for the future scan feature */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("receiptTitle")}</div>
        {expense.items?.length ? (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
            {expense.items.map((i, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 14px", borderTop: idx === 0 ? "none" : `1px solid ${LINE}`, fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                <span style={{ color: SUB, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{money(i.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: `1px dashed ${LINE}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", color: SUB, background: CARD }}>
            <Receipt size={22} style={{ opacity: 0.4 }} />
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{t("receiptEmpty")}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={onEdit} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "12px" }}><Pencil size={16} /> {t("edit")}</button>
        <button onClick={onDelete} style={dangerBtn}><Trash2 size={16} /> {t("delete")}</button>
      </div>
    </Overlay>
  );
}

function FieldRow({ label, children, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: last ? "none" : `1px solid ${LINE}` }}>
      <span style={{ fontSize: 13, color: SUB, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: "right", minWidth: 0 }}>{children}</span>
    </div>
  );
}

// Shared by the expense form and the recurring-rule form, which showed the
// same list of tickboxes. The "everyone" row on top is checked only when all
// are — with a big roster, ticking it is faster than tapping each name, and
// unticking it clears the list to start from nobody.
function SplitMemberPicker({ members, sharedWith, onChange, t }) {
  const all = members.length > 0 && members.every((m) => sharedWith.includes(m.id));
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer", fontSize: 14, fontWeight: 600 };
  const box = { width: 17, height: 17, accentColor: TEAL, flexShrink: 0 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label style={{ ...row, color: SUB, borderBottom: `1px solid ${LINE}` }}>
        <input type="checkbox" checked={all} style={box}
          onChange={() => onChange(all ? [] : members.map((m) => m.id))} />
        <Users size={14} /> {t("selectAll")}
      </label>
      {members.map((m) => {
        const on = sharedWith.includes(m.id);
        const Icon = memberIcon(m.icon);
        return (
          <label key={m.id} style={row}>
            <input type="checkbox" checked={on} style={box}
              onChange={() => onChange(on ? sharedWith.filter((x) => x !== m.id) : [...sharedWith, m.id])} />
            <Icon size={14} style={{ color: SUB }} /> {m.name}
          </label>
        );
      })}
    </div>
  );
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result.split(",")[1]);
  fr.onerror = () => reject(new Error("could not read file"));
  fr.readAsDataURL(blob);
});

// Phone photos run ~5MB; Vercel caps request bodies at 4.5MB and large images
// cost more vision tokens. 2000px on the long edge still reads receipt text fine.
async function toScaledJpegBase64(file, max = 2000) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blobToBase64(blob);
}

// Images get downscaled to keep the body small; PDFs go as-is — the model reads
// them natively, and there's no canvas path to rescale a PDF without a renderer.
async function fileToUpload(file) {
  if (file.type === "application/pdf") return { image: await blobToBase64(file), mediaType: "application/pdf" };
  return { image: await toScaledJpegBase64(file), mediaType: "image/jpeg" };
}

function ExpenseForm({ initial, categories, members, merchants, expenses = [], ledgers = [], lang, t, onClose, onSave, onEditMembers, onEditCategories, defaultMonth, defaultDate, features, onBatchImport, existingReminder }) {
  // Personal-template ledgers (features.showSplit false) have no one to split
  // with — the payer is just whoever's account this is, silently the first
  // member, and every expense is personal. Nothing left to ask about.
  // hasReminder/reminderDate aren't part of `initial` (they live in the
  // notifications table, not expenses) — merged in from existingReminder
  // (looked up by expense id in Ledger) so re-opening an expense that already
  // has one shows it as set, instead of the toggle defaulting to off and
  // deleting it on the next save.
  const [d, setD] = useState(() => ({
    ...(initial || {
      // A day tapped on the calendar wins; otherwise today, if the ledger is
      // currently showing the month today falls in — a stray future/past date
      // wasn't the point, and a mid-month guess made every untapped expense
      // land on the 15th regardless of when it was actually added. Viewing a
      // different month (via Reports' selector) keeps the old 15th-of-that-
      // month fallback, since "today" wouldn't even be in it.
      description: "", amount: "", categoryId: categories[0]?.id || null,
      date: defaultDate || (monthOf(todayISO()) === defaultMonth ? todayISO() : `${defaultMonth}-15`), note: "", paidById: members[0]?.id || null,
      // Follows this ledger's last entry (expenses come back newest-first), so a
      // household that doesn't split taps Personal once instead of on every
      // expense. Ticking nobody is not the way to say "don't split" — that's a
      // blocked state, see `valid` below; Personal is.
      split: features.showSplit ? (expenses[0]?.split || "shared") : "personal",
      sharedWith: members.map((m) => m.id), // everyone by default; untick who wasn't there
    }),
    hasReminder: !!existingReminder,
    reminderDate: existingReminder?.remindAt || "",
  }));
  const [addHst, setAddHst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  // Save failures shown in the form itself — see submit.
  const [saveErr, setSaveErr] = useState("");
  const [retryIn, setRetryIn] = useState(0); // seconds left on a rate-limit wait
  const [currencyMismatch, setCurrencyMismatch] = useState(null); // scanned receipt's ISO code, when it differs from the ledger's
  const [remember, setRemember] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Once you've picked a category yourself (or this is an existing expense),
  // typing stops trying to guess one for you.
  const [categoryTouched, setCategoryTouched] = useState(!!initial);
  const applyDescription = (value) => setD((prev) => {
    const next = { ...prev, description: value };
    if (!categoryTouched) {
      const suggested = suggestCategoryId(value, expenses);
      if (suggested) next.categoryId = suggested;
    }
    return next;
  });
  // { name, price, mode: split|personal|drop }. Reopening a saved expense brings
  // its stored lines back; those prices already include their share of the tax,
  // which is why scanTotal stays null and the ratio below comes out as 1.
  const [items, setItems] = useState(() => (initial?.items || []).map((i) => ({ name: i.name, price: i.amount, mode: "split", addToInventory: false, addToGrocery: false })));
  // Which rows have their Inventory/Grocery toggles revealed — name+price+the
  // three split-mode buttons already fill a phone-width row, so these two are
  // an opt-in second line rather than two more permanent icons.
  const [expandedItemIdx, setExpandedItemIdx] = useState(() => new Set());
  const [scanTotal, setScanTotal] = useState(null); // receipt total, tax included
  const [personalLedgerId, setPersonalLedgerId] = useState(ledgers[0]?.id || null);

  // Scanning only prefills the form — you still review and save it yourself.
  //
  // The server reads most receipts with OCR + regex, which is free but never
  // returns line items (see src/lib/receiptOcr.js). So the scanned photo is
  // kept here: if the result comes back with no items, the form offers to ask
  // the AI for them, re-sending this same image rather than making you shoot
  // the receipt again. wantItems skips the OCR path server-side.
  const [scannedPhoto, setScannedPhoto] = useState(null); // { image, mediaType } of the last scan
  const [itemsFromAi, setItemsFromAi] = useState(false); // true once the AI pass has run for this photo

  const runScan = async ({ image, mediaType, wantItems }) => {
    setScanErr(""); setCurrencyMismatch(null); setScanning(true); setRetryIn(0);
    try {
      const { data } = await supabase.auth.getSession();
      const body = JSON.stringify({
        image, mediaType, categories: categories.map((c) => c.name),
        token: data.session?.access_token, lang, wantItems,
      });
      const post = async () => {
        const res = await fetch("/api/scan-receipt", { method: "POST", headers: { "content-type": "application/json" }, body });
        return { res, out: await res.json() };
      };

      let { res, out } = await post();
      // Gemini's free tier allows only a handful of calls a minute and tells us
      // exactly how long to wait. That's seconds, and the photo is already in
      // hand — so sit out the wait once rather than making someone re-shoot a
      // receipt over a limit that clears itself.
      if (res.status === 429 && out.retryAfter) {
        for (let s = out.retryAfter; s > 0; s--) {
          setRetryIn(s);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setRetryIn(0);
        ({ res, out } = await post());
      }
      if (!res.ok) throw new Error(out.code === "rate_limited" ? t("scanRateLimited") : (out.error || res.statusText));
      setD((prev) => ({
        ...prev,
        description: out.description || prev.description,
        amount: out.amount != null ? String(out.amount) : prev.amount,
        date: out.date || prev.date,
        categoryId: categories.find((c) => c.name === out.category)?.id ?? prev.categoryId,
      }));
      setAddHst(false); // a receipt total already includes tax
      setScanTotal(out.amount ?? null);
      setItems((out.items || []).map((i) => ({ name: i.name, price: Number(i.price) || 0, mode: "split", addToInventory: false, addToGrocery: false })));
      if (wantItems) setItemsFromAi(true);
      // Informational only — never touches the amount or the ledger's currency.
      const scannedCcy = (out.currency || "").toUpperCase();
      setCurrencyMismatch(/^[A-Z]{3}$/.test(scannedCcy) && scannedCcy !== activeCurrency ? scannedCcy : null);
    } catch (e) {
      setScanErr(e.message);
    } finally {
      setScanning(false); setRetryIn(0);
    }
  };

  const scanReceipt = async (file) => {
    let photo;
    try {
      photo = await fileToUpload(file); // decoding a HEIC/corrupt image throws here, before any request
    } catch (e) {
      setScanErr(e.message || String(e));
      return;
    }
    setScannedPhoto(photo);
    setItemsFromAi(false);
    await runScan(photo);
  };

  // Upload always means "many at once": a real CSV, or a screenshot/PDF of a
  // statement that the AI reads into separate transactions — never straight into
  // this single-expense form. That's deliberately how Scan and Upload differ now:
  // Scan is live single-receipt capture (with itemisation, above); Upload hands
  // off to the batch review table (see onBatchImport / BatchImportModal).
  const importBatchFile = async (file) => {
    setScanErr(""); setScanning(true);
    try {
      let transactions;
      if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
        transactions = parseCsvText(await file.text(), todayISO());
      } else {
        const { image, mediaType } = await fileToUpload(file);
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/scan-statement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image, mediaType, token: data.session?.access_token }),
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || res.statusText);
        transactions = out.transactions || [];
      }
      if (!transactions.length) { setScanErr(t("csvNoRows")); return; }
      onBatchImport(transactions);
    } catch (e) {
      setScanErr(e.message || String(e));
    } finally {
      setScanning(false);
    }
  };

  // Line items are printed pre-tax while the receipt total includes it, so the
  // total is shared out across whatever you keep, in proportion to price. Keep
  // everything and the parts add back up to the printed total.
  const round2 = (n) => Math.round(n * 100) / 100;
  const itemsSum = items.reduce((s, i) => s + i.price, 0);
  const taxRatio = items.length && itemsSum > 0 && scanTotal ? scanTotal / itemsSum : 1;
  const sumOf = (mode) => items.filter((i) => i.mode === mode).reduce((s, i) => s + i.price, 0);
  const splitItems = items.filter((i) => i.mode === "split");
  const personalItems = items.filter((i) => i.mode === "personal");
  const droppedCount = items.filter((i) => i.mode === "drop").length;
  const personalTotal = round2(sumOf("personal") * taxRatio);

  // With items on screen the amount is theirs to determine; typing over it would
  // only be undone the next time a row changed. The note is left alone — the
  // breakdown is already listed above it.
  useEffect(() => {
    if (!items.length) return;
    setD((prev) => ({ ...prev, amount: String(round2(sumOf("split") * taxRatio)) }));
  }, [items, taxRatio]);

  const setItemMode = (idx, mode) => setItems(items.map((it, i) => (i === idx ? { ...it, mode } : it)));
  // Independent of mode on purpose — a coupon line should never reach
  // inventory regardless of split state, but an item paid by points (and so
  // marked "drop") might still be worth tracking, so these aren't gated by it.
  const toggleItemFlag = (idx, key) => setItems(items.map((it, i) => (i === idx ? { ...it, [key]: !it[key] } : it)));
  const toggleItemExpanded = (idx) => setExpandedItemIdx((prev) => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  const base = Number(d.amount) || 0;
  const finalAmount = addHst ? Math.round(base * 1.13 * 100) / 100 : base;
  // A shared expense with nobody ticked can't be divided, so block saving it.
  const sharerCount = d.split === "shared" ? (d.sharedWith || []).length : 0;
  const valid = d.description.trim() && finalAmount > 0 && d.date && d.categoryId && d.paidById
    && (d.split !== "shared" || sharerCount > 0) && (!d.hasReminder || d.reminderDate) && !busy;
  // Name-based, not template-based — "Subscriptions" only ships pre-seeded in
  // the Personal template, but any ledger can rename/add a category to match.
  const isSubscription = catName(categories.find((c) => c.id === d.categoryId)) === "Subscriptions";
  const toggleReminder = () => setD((prev) => ({
    ...prev, hasReminder: !prev.hasReminder,
    // Default only fills in once, on the way from off to on — a date you've
    // already adjusted shouldn't get silently overwritten by re-deriving it
    // from the billing date on every render.
    reminderDate: !prev.hasReminder && !prev.reminderDate ? addDays(prev.date, -3) : prev.reminderDate,
  }));

  // Offer to keep a shop only when it isn't already saved, and never pre-ticked —
  // plenty of entries are one-offs that shouldn't clutter the suggestions.
  const typed = d.description.trim();
  const canRemember = typed.length > 1 && !merchants.some((m) => m.name.toLowerCase() === typed.toLowerCase());
  // Nothing shows until something is typed — an empty box would otherwise match
  // every shop (includes("") is always true) and dump the whole list on focus.
  // Substring, not prefix, so "frills" still finds "No Frills"; an exact match is
  // dropped so the list doesn't hang around once you've picked one.
  const suggestions = typed
    ? merchants
        .filter((m) => m.name.toLowerCase().includes(typed.toLowerCase()) && m.name.toLowerCase() !== typed.toLowerCase())
        .slice(0, 6)
    : [];
  // Every distinct name gets its own unticked ask. Without this, ticking for one
  // shop and then retyping a different name would silently keep the second one.
  useEffect(() => { setRemember(false); }, [typed]);

  const submit = async () => {
    if (!valid || busy) return; // a second tap mid-save would double-write
    setBusy(true);
    setSaveErr("");
    try {
      await doSubmit();
    } catch (e) {
      setSaveErr(e?.message || String(e));
    } finally {
      // A successful save unmounts this form, so this only matters when onSave
      // throws — without it the spinner ran forever and a genuine failure was
      // indistinguishable from a slow network.
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    // Items marked personal leave as their own unsplit expense in the ledger you
    // chose, so they never reach this ledger's settle-up.
    const asItems = (list) => list.map((i) => ({ name: i.name, amount: round2(i.price * taxRatio) }));
    const personal = personalItems.length && personalLedgerId && personalTotal > 0
      ? {
          ledgerId: personalLedgerId,
          amount: personalTotal,
          description: typed,
          date: d.date,
          note: null,
          items: asItems(personalItems),
        }
      : null;
    await onSave(
      {
        ...d, description: typed, amount: finalAmount, items: asItems(splitItems),
        // Every flagged item regardless of split/personal/drop — see
        // toggleItemFlag above for why these aren't filtered by mode.
        inventoryItemNames: items.filter((i) => i.addToInventory).map((i) => i.name),
        groceryItemNames: items.filter((i) => i.addToGrocery).map((i) => i.name),
      },
      remember && canRemember ? typed : null,
      personal,
    );
  };

  return (
    <Overlay onClose={onClose} title={initial ? t("editExpense") : t("addExpense")} t={t}>
      {scanning ? (
        <div style={{ ...addBtn, marginTop: 0, width: "100%", justifyContent: "center", cursor: "wait", opacity: 0.6 }}>
          <Loader2 size={18} className="spin" /> {retryIn ? t("scanRetryIn", { secs: retryIn }) : t("scanning")}
        </div>
      ) : (
        // Scan and Upload do different things, not just different sources: Scan
        // forces the live camera for one receipt (with itemisation). Upload is
        // always batch — a real CSV, or a screenshot/PDF the AI reads into several
        // transactions — which is why its accept list is extensions rather than
        // "image/*". (iOS Safari shows "Take Photo" in its picker regardless —
        // that's a platform quirk, no accept list avoids it.)
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <label className="btn-glow" style={{ ...addBtn, marginTop: 0, flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <Camera size={18} /> {t("scanReceipt")}
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanReceipt(f); }} />
          </label>
          <label className="btn-glow" style={{ ...addBtn, marginTop: 0, flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <Upload size={18} /> {t("uploadReceipt")}
            <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png,.heic,.pdf,.csv,text/csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importBatchFile(f); }} />
          </label>
        </div>
      )}
      {/* Only when the free OCR pass read the receipt but found no line items,
          and only once per photo — asking the AI costs a metered request, so
          it stays an explicit choice rather than an automatic second attempt. */}
      {!scanning && scannedPhoto && !itemsFromAi && !items.length && (
        <button type="button" className="press-fx" style={{ ...ghostBtn, width: "100%", justifyContent: "center", fontSize: 12 }}
          onClick={() => runScan({ ...scannedPhoto, wantItems: true })}>
          <Sparkles size={14} /> {t("scanItemsWithAi")}
        </button>
      )}
      {scanErr && <div style={{ color: DANGER, fontSize: 12 }}>{t("scanFailed", { msg: scanErr })}</div>}
      {currencyMismatch && <div style={{ color: WARN, fontSize: 12 }}>{t("currencyMismatch", { scanned: currencyMismatch, ledger: activeCurrency })}</div>}
      <div style={{ textAlign: "center", color: SUB, fontSize: 12, margin: "-2px 0 2px" }}>{t("scanHint")}</div>

      <Field label={t("formWhat")}>
        {/* A native <datalist> was the obvious choice here, but Chrome dismisses its
            popup when the "remember" checkbox below appears mid-typing, so the
            suggestions never showed. Hand-rolled dropdown instead. */}
        <div style={{ position: "relative" }}>
          <input autoFocus value={d.description}
            onChange={(e) => { applyDescription(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setSuggestOpen(false)}
            placeholder={t("formWhatPh")} autoComplete="off" style={input} />
          {suggestOpen && suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 70, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", overflow: "hidden" }}>
              {suggestions.map((m) => (
                // mousedown, not click: blur would close the list first otherwise.
                <button key={m.id} onMouseDown={(e) => { e.preventDefault(); applyDescription(m.name); setSuggestOpen(false); }} style={suggestItem}>
                  <Store size={13} style={{ color: SUB, flexShrink: 0 }} /> {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {canRemember && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: SUB, cursor: "pointer", marginTop: 8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{t("rememberStore", { name: typed })}</span>
          </label>
        )}
        <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{t("rememberHint")}</div>
      </Field>
      {/* minWidth:0 lets both shrink — a date input has a wide intrinsic minimum
          and would otherwise push the row past the edge of a phone screen. */}
      <div style={{ display: "flex", gap: 10 }}>
        <Field label={t("amount")} style={{ flex: 1, minWidth: 0 }}>
          {/* Flex row rather than an absolutely-positioned prefix: a currency
              symbol can be several characters (e.g. "JP¥"), not just "$", and a
              fixed paddingLeft sized for one character overlapped the digits. */}
          <div style={{ ...input, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: SUB, flexShrink: 0 }}>{currencySymbol(activeCurrency)}</span>
            <input type="number" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00"
              style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit", color: "inherit", width: "100%" }} />
          </div>
        </Field>
        <Field label={t("date")} style={{ flex: 1, minWidth: 0 }}>
          <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} style={dateInput} />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer", marginTop: -4 }}>
        <input type="checkbox" checked={addHst} onChange={(e) => setAddHst(e.target.checked)} />
        {t("addHst")} {addHst && base > 0 && <span style={{ color: INK, fontWeight: 600 }}>→ {money(finalAmount)}</span>}
      </label>
      {items.length > 0 && (
        <Field label={t("items")}>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ padding: "9px 12px", borderTop: idx === 0 ? "none" : `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", opacity: it.mode === "drop" ? 0.45 : 1 }}>
                <span style={{ flex: 1, minWidth: 110, fontSize: 13, fontWeight: 600, textDecoration: it.mode === "drop" ? "line-through" : "none" }}>{it.name}</span>
                <span style={{ fontSize: 13, color: SUB, fontVariantNumeric: "tabular-nums" }}>{money(round2(it.price * taxRatio))}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {/* Split/Personal are the two everyday choices — Drop moved
                      into the reveal below along with Inventory/Grocery, since
                      four permanent buttons plus name+price was too tight on
                      a phone (Split/Personal/Drop/⋯ was already the full
                      width; Drop is also the least-used of the three). */}
                  {[["split", t("itemSplit"), Users], ["personal", t("itemPersonal"), User]].map(([mode, label, Icon]) => (
                    <button key={mode} onClick={() => setItemMode(idx, mode)} aria-label={label} title={label}
                      style={{ ...iconBtn, width: 30, height: 28, borderColor: it.mode === mode ? TEAL : LINE, background: it.mode === mode ? TEAL : CARD, color: it.mode === mode ? ACCENT_INK : SUB, boxShadow: it.mode === mode ? ACCENT_GLOW : "none" }}>
                      <Icon size={13} />
                    </button>
                  ))}
                  <button onClick={() => toggleItemExpanded(idx)} aria-label={t("moreActions")} title={t("moreActions")}
                    style={{ ...iconBtn, width: 30, height: 28, background: expandedItemIdx.has(idx) ? MUTED_BG : CARD, color: SUB }}>
                    <MoreHorizontal size={13} />
                  </button>
                </div>
                {expandedItemIdx.has(idx) && (
                  <div style={{ display: "flex", gap: 4, width: "100%", justifyContent: "flex-end" }}>
                    <button onClick={() => setItemMode(idx, "drop")} aria-label={t("itemDrop")} title={t("itemDrop")}
                      style={{ ...iconBtn, width: 30, height: 28, borderColor: it.mode === "drop" ? TEAL : LINE, background: it.mode === "drop" ? TEAL : CARD, color: it.mode === "drop" ? ACCENT_INK : SUB, boxShadow: it.mode === "drop" ? ACCENT_GLOW : "none" }}>
                      <Trash2 size={13} />
                    </button>
                    {[["addToInventory", t("itemAddToInventory"), Package], ["addToGrocery", t("itemAddToGrocery"), ShoppingCart]].map(([key, label, Icon]) => (
                      <button key={key} onClick={() => toggleItemFlag(idx, key)} aria-label={label} title={label}
                        style={{ ...iconBtn, width: 30, height: 28, borderColor: it[key] ? TEAL : LINE, background: it[key] ? TEAL : CARD, color: it[key] ? ACCENT_INK : SUB, boxShadow: it[key] ? ACCENT_GLOW : "none" }}>
                        <Icon size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>{t("itemsHint")}{droppedCount > 0 && ` · ${t("itemsDropped", { n: droppedCount })}`}</span>
            <button onClick={() => { setItems([]); setScanTotal(null); }} style={{ ...editCatsPill, padding: "3px 8px", fontSize: 11 }}>{t("itemsClear")}</button>
          </div>
          {personalItems.length > 0 && (
            <div style={{ marginTop: 8, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>
                {t("itemsPersonalNote", { n: personalItems.length, amount: money(personalTotal) })}
              </div>
              <select value={personalLedgerId || ""} onChange={(e) => setPersonalLedgerId(e.target.value)} style={{ ...input, padding: "8px 10px", fontSize: 13 }}>
                {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </Field>
      )}

      <Field label={
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {t("category")}
          <button onClick={onEditCategories} style={{ ...categoryLink, fontSize: 12, color: ACCENT_TEXT }}>{t("editCategories")}</button>
        </span>
      }>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => { setCategoryTouched(true); setD({ ...d, categoryId: c.id }); }} style={chip(d.categoryId === c.id)}>{catName(c, lang)}</button>
          ))}
        </div>
        {categories.length === 0 && <div style={{ fontSize: 12, color: DANGER, marginTop: 6 }}>{t("noCategoriesHint")}</div>}
      </Field>
      <Field label={t("addToInventory")}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer" }}>
          <input type="checkbox" checked={!!d.addToInventory} onChange={(e) => setD({ ...d, addToInventory: e.target.checked })} />
          {t("addToInventoryHint")}
        </label>
        {d.addToInventory && (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Field label={t("quantity")} style={{ width: 90 }}>
                <input type="number" inputMode="decimal" value={d.invQuantity || ""}
                  onChange={(e) => setD({ ...d, invQuantity: e.target.value })} style={input} />
              </Field>
              <Field label={t("unit")} style={{ width: 90 }}>
                <input type="text" value={d.invUnit || ""} onChange={(e) => setD({ ...d, invUnit: e.target.value })} style={input} />
              </Field>
            </div>
            {/* Its own row, not a third flex item alongside Quantity/Unit: a native
                <input type="date"> has an intrinsic minimum width that ignores
                flex-shrink/minWidth, so cramming it in with the other two let it
                overflow the card edge on a phone. */}
            <Field label={t("expiryDate")} style={{ marginTop: 8 }}>
              <input type="date" value={d.invExpiryDate || ""} onChange={(e) => setD({ ...d, invExpiryDate: e.target.value })} style={dateInput} />
            </Field>
          </>
        )}
      </Field>
      {isSubscription && (
        <Field label={t("cancellationReminder")}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer" }}>
            <input type="checkbox" checked={d.hasReminder} onChange={toggleReminder} />
            {t("remindMeToCancel")}
          </label>
          {d.hasReminder && (
            <input type="date" value={d.reminderDate} onChange={(e) => setD({ ...d, reminderDate: e.target.value })}
              style={{ ...dateInput, marginTop: 8 }} />
          )}
        </Field>
      )}
      {features.showSplit && (
        <>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {t("whoPaid")}
              <button onClick={onEditMembers} style={{ ...categoryLink, fontSize: 12, color: ACCENT_TEXT }}>{t("manageMembers")}</button>
            </span>
          }>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {members.map((m) => {
                const Icon = memberIcon(m.icon);
                return (
                  <button key={m.id} onClick={() => setD({ ...d, paidById: m.id })} style={chip(d.paidById === m.id)}>
                    <Icon size={13} /> {m.name}
                  </button>
                );
              })}
            </div>
            {members.length === 0 && <div style={{ fontSize: 12, color: DANGER, marginTop: 6 }}>{t("noMembersHint")}</div>}
          </Field>
          <Field label={t("split")}>
            <div style={{ display: "flex", gap: 3, background: MUTED_BG, borderRadius: 10, padding: 3 }}>
              <button onClick={() => setD({ ...d, split: "personal" })} style={segItem(d.split === "personal")}><User size={14} /> {t("personal")}</button>
              <button onClick={() => setD({ ...d, split: "shared", sharedWith: d.sharedWith?.length ? d.sharedWith : members.map((m) => m.id) })} style={segItem(d.split === "shared")}>
                <Users size={14} /> {t("splitBetween")}
              </button>
            </div>
            {d.split === "shared" && (
              <div style={{ marginTop: 10 }}>
                <SplitMemberPicker members={members} sharedWith={d.sharedWith || []} t={t}
                  onChange={(sharedWith) => setD({ ...d, sharedWith })} />
                <div style={{ fontSize: 12, color: sharerCount ? SUB : DANGER, marginTop: 6 }}>
                  {sharerCount ? t("splitWays", { n: sharerCount, amount: money(finalAmount / sharerCount) }) : t("splitNobody")}
                </div>
              </div>
            )}
          </Field>
        </>
      )}
      <Field label={t("noteLabel")}>
        {/* Textarea, not an input: scanned item lists are one line per item. */}
        <textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder={t("notePh")}
          rows={2} style={{ ...input, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
      </Field>
      {/* Sits inside the overlay on purpose: the ledger's own error banner is
          painted underneath this fixed, full-screen form and can't be seen. */}
      {saveErr && (
        <div style={{ background: BAD_BG, border: `1px solid ${BAD_LINE}`, color: BAD_INK, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginTop: 6 }}>
          {t("saveFailed", { msg: saveErr })}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "12px" }}>{t("cancel")}</button>
        <button onClick={submit} disabled={!valid || busy} className="btn-glow" style={{ ...addBtn, flex: 2, marginTop: 0, opacity: valid && !busy ? 1 : 0.5, cursor: valid && !busy ? "pointer" : "not-allowed" }}>
          {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {initial ? t("saveChanges") : t("addExpense")}
        </button>
      </div>
    </Overlay>
  );
}

function CategoryManager({ categories, lang, t, onChange, onClose }) {
  const [list, setList] = useState(categories);
  const [name, setName] = useState("");
  // Colours are auto-assigned from the shared palette (the report chart shows them);
  // this UI manages names only, so there's no picker to fuss with. Cycling by length
  // spreads new categories across the palette the same way members are coloured.
  const nextColor = () => db.MEMBER_COLORS[list.length % db.MEMBER_COLORS.length];

  const add = () => {
    if (!name.trim()) return;
    setList([...list, { id: uid(), name: name.trim(), nameZh: name.trim(), color: nextColor(), budget: null }]);
    setName("");
  };
  // Write both name fields together so the EN and 繁中 names can never drift apart.
  const patchName = (id, val) => setList(list.map((c) => (c.id === id ? { ...c, name: val, nameZh: val } : c)));
  const del = (id) => setList(list.filter((c) => c.id !== id));
  // Saving with text still sitting in the new-category field used to discard it
  // silently. Treat a filled field as an intent to add — the + button is a shortcut,
  // not a required step.
  const done = () => {
    const pending = name.trim();
    onChange(pending ? [...list, { id: uid(), name: pending, nameZh: pending, color: nextColor(), budget: null }] : list);
    onClose();
  };

  return (
    <Overlay onClose={onClose} title={t("categories")} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input value={catName(c)} onChange={(e) => patchName(c.id, e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => del(c.id)} style={{ ...iconBtn, color: DANGER }} aria-label={t("deleteCategory")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("newCatPh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} className="btn-glow" style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveCategories")}</button>
    </Overlay>
  );
}

// Green under 80% of a budget, amber approaching it, red once past. A bar never
// overflows its track — how far over you are is in the number, not the bar.
// The over-budget case uses a fixed hex, not DANGER — that var is tuned for
// destructive TEXT on a dark background (soft coral, so it doesn't glare) and
// reads as pink instead of red when used as a solid fill. Same #DC2626 the
// delete buttons already use for solid destructive fills, in both themes.
const budgetBarColor = (spent, budget) =>
  !budget ? LINE : spent > budget ? "#DC2626" : spent / budget > 0.8 ? "#D97706" : TEAL;

// `pace` (0-100, only passed for the month actually in progress) marks how
// far through the month "today" is — a quick "on track or not" cue next to
// the fill, not derived from spend/budget at all.
function BudgetBar({ spent, budget, height = 8, pace }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div style={{ position: "relative", height, borderRadius: 99, background: TRACK, overflow: "hidden" }}>
      <div style={{ width: `${budget > 0 ? Math.max(pct, spent > 0 ? 2 : 0) : 0}%`, height: "100%", background: budgetBarColor(spent, budget), borderRadius: 99, transition: "width .25s ease" }} />
      {pace != null && budget > 0 && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pace}%`, width: 2, background: INK, opacity: 0.3 }} />
      )}
    </div>
  );
}

// Read-only — editing moved to EditBudgetPanel, reached via the "Edit
// budget" badge. Budget figures here come straight from the saved `budgets`
// map, not from a local draft, since there's nothing to draft.
function BudgetPanel({ month, monthLabel, categories, expenses, budgets, spentByCategory, spent, lang, t, onEditBudget, onClose, periodRange }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const budgetOf = (id) => budgets.get(db.budgetKey(month, id)) || 0;
  const totalBudget = categories.reduce((sum, c) => sum + budgetOf(c.id), 0);
  const left = totalBudget - spent;
  const over = left < 0;
  const uncategorised = spent - categories.reduce((s, c) => s + (spentByCategory.get(c.id) || 0), 0);
  // Only meaningful while the thing being paced against is actually in
  // progress — a past/future month (or a trip not yet started/already over)
  // has nothing to mark a pace against.
  const today = todayISO();
  const pace = periodRange
    ? (periodRange.startDate && periodRange.endDate && today >= periodRange.startDate && today <= periodRange.endDate
        ? ((new Date(today) - new Date(periodRange.startDate)) / (new Date(periodRange.endDate) - new Date(periodRange.startDate)) || 0) * 100
        : null)
    : (monthOf(today) === month
        ? (Number(today.slice(-2)) / new Date(...month.split("-").map(Number), 0).getDate()) * 100
        : null);

  return (
    <Overlay onClose={onClose} title={t("budget")} t={t}>
      <div style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{t("budgetFor", { month: monthLabel })}</div>

      {/* Whole-month roll-up */}
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t("budgetTotal")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {totalBudget > 0 && <span style={{ fontSize: 13, color: SUB }}>{t("budgetAmountLabel", { amount: money(totalBudget) })}</span>}
            <button onClick={onEditBudget} style={pill(TEAL)}>{t("editBudget")}</button>
          </div>
        </div>
        <BudgetBar spent={spent} budget={totalBudget} height={12} pace={pace} />
        {totalBudget > 0 ? (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
            <span><b style={{ fontWeight: 800 }}>{money(spent)}</b> <span style={{ color: SUB }}>{t("budgetSpent")}</span></span>
            <span><b style={{ fontWeight: 800, color: over ? DANGER : INK }}>{money(Math.abs(left))}</b> <span style={{ color: SUB }}>{over ? t("budgetOver") : t("budgetLeft")}</span></span>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, color: SUB }}>{t("budgetNone", { month: monthLabel })}</div>
        )}
      </div>

      {/* Per-category — each its own card, same spent/budget/remaining shape
          as the roll-up above it, since that's just their sum. Read-only:
          the amount is just displayed, not an input — see EditBudgetPanel. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c) => {
          const s = spentByCategory.get(c.id) || 0;
          const b = budgetOf(c.id);
          const hasBudget = budgets.has(db.budgetKey(month, c.id));
          const catLeft = b - s;
          const catOver = catLeft < 0;
          return (
            <div key={c.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <button onClick={() => setSelectedCategory(c)} style={{ ...categoryLink, flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{catName(c)}</button>
                {hasBudget && <span style={{ fontSize: 13, color: SUB, fontWeight: 600, flexShrink: 0 }}>{money(b)}</span>}
              </div>
              <BudgetBar spent={s} budget={b} pace={pace} />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span><b style={{ fontWeight: 800 }}>{money(s)}</b> <span style={{ color: SUB }}>{t("budgetSpent")}</span></span>
                {hasBudget && (
                  <span><b style={{ fontWeight: 800, color: catOver ? DANGER : INK }}>{money(Math.abs(catLeft))}</b> <span style={{ color: SUB }}>{catOver ? t("budgetOver") : t("budgetLeft")}</span></span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {uncategorised > 0.005 && <div style={{ fontSize: 12, color: SUB }}>{t("budgetUncat")}</div>}

      {selectedCategory && <CategoryExpenseList category={selectedCategory} month={month} expenses={expenses} lang={lang} t={t} onClose={() => setSelectedCategory(null)} />}
    </Overlay>
  );
}

// The only place budgets are actually editable, reached via BudgetPanel's
// "Edit budget" badge. Same per-category draft-then-save shape the old
// combined panel used, just on its own page.
function EditBudgetPanel({ month, monthLabel, categories, budgets, t, onSave, onCarryForward, onClose }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(categories.map((c) => {
      const v = budgets.get(db.budgetKey(month, c.id));
      return [c.id, v == null ? "" : String(v)];
    })),
  );
  const [busy, setBusy] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [carried, setCarried] = useState(false);
  const budgetOf = (id) => Number(drafts[id]) || 0;
  const hasAnyBudget = categories.some((c) => budgets.get(db.budgetKey(month, c.id)) != null);

  const save = async () => {
    setBusy(true);
    await onSave(categories.map((c) => ({ categoryId: c.id, amount: drafts[c.id].trim() === "" ? null : budgetOf(c.id) })));
    setBusy(false);
    onClose();
  };
  const carryForward = async () => {
    setCarrying(true);
    await onCarryForward();
    setCarrying(false);
    setCarried(true);
  };

  return (
    <Overlay onClose={onClose} title={t("editBudget")} t={t}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{t("budgetFor", { month: monthLabel })}</div>
        {/* Absent for a period ledger (onCarryForward undefined) — one trip
            has no "next month" to carry a budget into. */}
        {hasAnyBudget && onCarryForward && (
          <button onClick={carryForward} disabled={carrying || carried} style={{ ...pill(TEAL), opacity: carrying ? 0.6 : 1 }}>
            {carried ? <Check size={13} /> : carrying ? <Loader2 size={13} className="spin" /> : null}
            {carried ? t("carryForwardDone") : t("carryForward")}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c) => {
          const hasBudget = drafts[c.id] != null && drafts[c.id] !== "";
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catName(c)}</span>
              <div style={{ ...input, display: "flex", alignItems: "center", gap: 3, width: 104, flexShrink: 0, padding: "7px 8px", fontSize: 13 }}>
                {/* Dollar sign only once there's a value, so an unset field reads as
                    "Set budget" rather than a misleading "$ 0.00". */}
                {hasBudget && <span style={{ color: SUB, flexShrink: 0 }}>{currencySymbol(activeCurrency)}</span>}
                <input type="number" inputMode="decimal" value={drafts[c.id] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder={t("setBudgetPh")} style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit", color: "inherit", width: "100%" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: SUB }}>{t("budgetClearHint")}</div>
      <button onClick={save} disabled={busy} className="btn-glow" style={{ ...addBtn, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("budgetSave")}
      </button>
    </Overlay>
  );
}

// Per-day totals for one month, for MonthCalendar's day cells.
function dailyTotalsFor(month, expenses) {
  const totals = new Map();
  for (const e of expenses) {
    if (monthOf(e.date) !== month) continue;
    totals.set(e.date, (totals.get(e.date) || 0) + (Number(e.amount) || 0));
  }
  return totals;
}

// Category totals for one month, shared by the pie chart and both sides of the
// month-over-month comparison so the two views can never disagree on a number.
// A falsy targetMonth means "every expense, no filter" — used for a period
// ledger's whole-trip breakdown instead of one calendar month.
function categoryTotalsFor(targetMonth, expenses, categories, lang, t) {
  const totals = new Map();
  for (const expense of expenses) {
    if (targetMonth && monthOf(expense.date) !== targetMonth) continue;
    const key = expense.categoryId || "uncategorised";
    totals.set(key, (totals.get(key) || 0) + (Number(expense.amount) || 0));
  }
  return [...totals.entries()].map(([id, amount]) => {
    const category = categories.find((c) => c.id === id);
    return {
      id,
      amount,
      category,
      name: category ? catName(category, lang) : t("reportUncategorised"),
      color: category?.color || "#94A3B8",
    };
  }).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
}

function MonthlyReport({ month, months, expenses, categories, lang, t, onMonthChange, onClose, isPeriodLedger, periodLabel }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  // null for a period ledger — the whole trip, not one calendar month.
  const breakdown = useMemo(() => categoryTotalsFor(isPeriodLedger ? null : month, expenses, categories, lang, t), [expenses, month, categories, lang, t, isPeriodLedger]);

  // Defaults to the month right before the one on screen (months is newest-first),
  // so opening the report already shows a meaningful comparison.
  const [compareMonth, setCompareMonth] = useState(() => {
    const i = months.indexOf(month);
    return months[i + 1] || month;
  });
  const compareBreakdown = useMemo(() => categoryTotalsFor(compareMonth, expenses, categories, lang, t), [expenses, compareMonth, categories, lang, t]);
  // Union of both months' categories, ranked by current-month spend (falling back
  // to compare-month spend for a category that only existed back then).
  const comparison = useMemo(() => {
    const byId = new Map();
    for (const item of breakdown) byId.set(item.id, { id: item.id, name: item.name, color: item.color, current: item.amount, compare: 0 });
    for (const item of compareBreakdown) {
      const row = byId.get(item.id);
      if (row) row.compare = item.amount;
      else byId.set(item.id, { id: item.id, name: item.name, color: item.color, current: 0, compare: item.amount });
    }
    return [...byId.values()].sort((a, b) => (b.current || b.compare) - (a.current || a.compare));
  }, [breakdown, compareBreakdown]);
  const comparisonMax = Math.max(1, ...comparison.map((r) => Math.max(r.current, r.compare)));

  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  let offset = 0;
  const slices = breakdown.map((item) => {
    const start = offset;
    offset += item.amount / total;
    const end = offset;
    const point = (fraction) => {
      const angle = fraction * Math.PI * 2 - Math.PI / 2;
      return [50 + 42 * Math.cos(angle), 50 + 42 * Math.sin(angle)];
    };
    const [x1, y1] = point(start);
    const [x2, y2] = point(end);
    const large = end - start > 0.5 ? 1 : 0;
    return { ...item, path: end - start >= 0.999 ? "M 50 8 A 42 42 0 1 1 49.99 8 Z" : `M 50 50 L ${x1} ${y1} A 42 42 0 ${large} 1 ${x2} ${y2} Z` };
  });

  return (
    <Overlay onClose={onClose} title={t("monthlyReport")} t={t}>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>{t("reportTotal")}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{money(total)}</div>
        <div style={{ fontSize: 13, color: SUB, marginTop: 2 }}>{t("reportFor", { month: isPeriodLedger ? periodLabel : monthName(month, lang) })}</div>
      </div>
      {breakdown.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "28px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("reportEmpty")}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <svg viewBox="0 0 100 100" width="230" height="230" role="img" aria-label={t("reportCategories")}>
              {slices.map((slice) => <path key={slice.id} d={slice.path} fill={slice.color} stroke={CARD} strokeWidth="1.5" />)}
              <circle cx="50" cy="50" r="26" fill={CARD} />
              <text x="50" y="48" textAnchor="middle" fontSize="7" fontWeight="700" fill={SUB}>{t("reportTotal")}</text>
              <text x="50" y="57" textAnchor="middle" fontSize="7" fontWeight="800" fill={INK}>{money(total)}</text>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {breakdown.map((item) => (
              <button key={item.id} onClick={() => setSelectedCategory(item)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 999, background: item.color, fontSize: 16, flexShrink: 0 }} aria-hidden="true">
                  {categoryIcon(item.category)}
                </span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                <span style={{ color: SUB, fontSize: 12, flexShrink: 0 }}>{Math.round((item.amount / total) * 100)}%</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right", flexShrink: 0 }}>{money(item.amount)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Comparing to another month doesn't mean anything for a single trip
          — there's no "last month" to compare a period ledger against. */}
      {!isPeriodLedger && <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
        {/* Select month/Compare to used to sit at the top of the whole panel;
            moved here since this comparison section is the only place they
            actually matter — the pie chart/breakdown above only ever reflect
            "Select month" anyway. Doubles as this section's header, replacing
            the old static "This month vs {month}" title. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{t("selectMonth")}</div>
            <select value={month} onChange={(e) => onMonthChange(e.target.value)} aria-label={t("selectMonth")} style={{ ...selectStyle, width: "100%" }}>
              {months.map((value) => <option key={value} value={value}>{monthName(value, lang)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{t("compareMonth")}</div>
            <select value={compareMonth} onChange={(e) => setCompareMonth(e.target.value)} aria-label={t("compareMonth")} style={{ ...selectStyle, width: "100%" }}>
              {months.map((value) => <option key={value} value={value}>{monthName(value, lang)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: SUB, marginBottom: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: TEAL }} /> {monthName(month, lang)}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#94A3B8" }} /> {monthName(compareMonth, lang)}</span>
        </div>
        {comparison.length === 0 ? (
          <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "20px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("compareEmpty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {comparison.map((row) => {
              const delta = row.current - row.compare;
              const deltaLabel = row.compare === 0 && row.current > 0 ? t("compareNew")
                : row.current === 0 && row.compare > 0 ? t("compareGoneLabel")
                : delta === 0 ? t("compareUnchanged")
                : `${delta > 0 ? "+" : "-"}${money(Math.abs(delta))} (${delta > 0 ? "+" : "-"}${Math.round(Math.abs(delta) / row.compare * 100)}%)`;
              const deltaColor = delta > 0 ? DANGER : delta < 0 ? ACCENT_TEXT : SUB;
              return (
                <div key={row.id} title={`${row.name}: ${money(row.current)} vs ${money(row.compare)}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor, whiteSpace: "nowrap", marginLeft: 8 }}>{deltaLabel}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ height: 7, borderRadius: 99, background: TRACK, overflow: "hidden" }}>
                      <div style={{ width: `${(row.current / comparisonMax) * 100}%`, height: "100%", background: TEAL, borderRadius: 99 }} />
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: TRACK, overflow: "hidden" }}>
                      <div style={{ width: `${(row.compare / comparisonMax) * 100}%`, height: "100%", background: "#94A3B8", borderRadius: 99 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {selectedCategory && (
        <CategoryExpenseList category={selectedCategory} month={isPeriodLedger ? null : month} periodLabel={periodLabel}
          expenses={expenses} lang={lang} t={t} onClose={() => setSelectedCategory(null)} />
      )}
    </Overlay>
  );
}

// month null (a period ledger's whole-trip drill-down) means every expense
// in that category, not one calendar month's worth.
function CategoryExpenseList({ category, month, periodLabel, expenses, lang, t, onClose }) {
  const rows = expenses.filter((expense) => (!month || monthOf(expense.date) === month) && (expense.categoryId || "uncategorised") === category.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Overlay title={t("categoryExpenses", { category: category.name })} t={t} onClose={onClose}>
      <div style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{month ? monthName(month, lang) : periodLabel}</div>
      {rows.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "28px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("categoryExpensesEmpty")}</div>
      ) : (
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          {rows.map((expense, index) => (
            <div key={expense.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderTop: index ? `1px solid ${LINE}` : "none" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{expense.description}</div>
                <div style={{ color: SUB, fontSize: 12, marginTop: 2 }}>{expense.date}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(expense.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}

function StoreManager({ merchants, t, onChange, onClose }) {
  const [list, setList] = useState(merchants);
  const [name, setName] = useState("");

  const add = () => {
    if (!name.trim()) return;
    setList([...list, { id: uid(), name: name.trim() }]);
    setName("");
  };
  const patch = (id, val) => setList(list.map((m) => (m.id === id ? { ...m, name: val } : m)));
  const del = (id) => setList(list.filter((m) => m.id !== id));
  // Same as the other managers: a name typed but not yet added still counts.
  const done = () => {
    const pending = name.trim();
    onChange(pending ? [...list, { id: uid(), name: pending }] : list);
    onClose();
  };

  return (
    <Overlay onClose={onClose} title={t("stores")} t={t}>
      {list.length === 0 && (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: SUB, fontSize: 13 }}>
          <Store size={20} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 8 }}>{t("noStores")}</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Store size={15} style={{ color: SUB, flexShrink: 0 }} />
            <input value={m.name} onChange={(e) => patch(m.id, e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => del(m.id)} style={{ ...iconBtn, color: DANGER }} aria-label={t("deleteStore")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("newStorePh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} className="btn-glow" style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveStores")}</button>
    </Overlay>
  );
}

function MemberManager({ members, t, onChange, onClose }) {
  const [list, setList] = useState(members);
  const [name, setName] = useState("");

  const nextColor = () => db.MEMBER_COLORS[list.length % db.MEMBER_COLORS.length];
  const add = () => {
    if (!name.trim()) return;
    setList([...list, { id: uid(), name: name.trim(), color: nextColor(), icon: "user" }]);
    setName("");
  };
  const patch = (id, key, val) => setList(list.map((m) => (m.id === id ? { ...m, [key]: val } : m)));
  const del = (id) => setList(list.filter((m) => m.id !== id));
  // Same as the category manager: a name typed but not yet added still counts.
  const done = () => {
    const pending = name.trim();
    onChange(pending ? [...list, { id: uid(), name: pending, color: nextColor(), icon: "user" }] : list);
    onClose();
  };

  return (
    <Overlay onClose={onClose} title={t("members")} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((m) => (
          <Fragment key={m.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={m.color} onChange={(e) => patch(m.id, "color", e.target.value)} style={{ width: 34, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
              <input value={m.name} onChange={(e) => patch(m.id, "name", e.target.value)} style={{ ...input, flex: 1 }} />
              <button onClick={() => del(m.id)} style={{ ...iconBtn, color: DANGER }} aria-label={t("deleteMember")}><Trash2 size={15} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, margin: "-2px 0 4px 42px" }}>
              {Object.entries(MEMBER_ICONS).map(([key, Icon]) => (
                <button key={key} onClick={() => patch(m.id, "icon", key)} aria-label={key}
                  style={{ ...iconBtn, width: 30, height: 30, borderColor: (m.icon || "user") === key ? m.color : LINE, background: (m.icon || "user") === key ? m.color : CARD, color: (m.icon || "user") === key ? "#fff" : SUB }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("newMemberPh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} className="btn-glow" style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveMembers")}</button>
    </Overlay>
  );
}

// Header overflow menu. Editing categories moved into the category lists themselves,
// so this is the slot for account actions and the features still to come
// (budgets, reports) rather than a one-off button per feature.
// Same name source as the Manage members roster (app_user.name), so "who am I"
// and "who's on this ledger" never disagree. Fetched once per mount, not per
// open — refresh() lets ProfilePanel pull the dropdown's cached name/email
// back in sync right after a save, instead of waiting for a remount.
function useMyProfile() {
  const [profile, setProfile] = useState(null); // { name, email } | null while loading
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) return;
    try {
      const { data: row } = await supabase.from("app_user").select("name, email").eq("id", u.id).single();
      setProfile({ name: row?.name || null, email: row?.email || u.email });
    } catch {
      setProfile({ name: null, email: u.email });
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return [profile, refresh];
}

// Global, not ledger-scoped — same as fetchLedgers(), RLS already narrows
// db.fetchNotifications() to whatever ledgers this account can see, so one
// bell covers every ledger without threading a ledgerId through it. Sits next
// to HeaderMenu everywhere that renders (picker, every ledger template).
function NotificationBell({ t, lang, onNavigate }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  // Computed from the button's real on-screen position when it opens, not a
  // CSS `right: 0` relative to the button's own tiny wrapper — that anchor
  // is fine for the last icon in the header row, but this bell isn't the
  // last one (the overflow menu sits to its right), so `right: 0` landed
  // the panel well short of the true screen edge and, at up to 90vw wide,
  // its left edge ran off the left side of the screen on a phone.
  // width is also computed here rather than left as a CSS `min(340px, ...)`:
  // that only bounds against the *full* viewport, not against the space
  // actually available to the right of wherever this particular right
  // offset lands, so a bell sitting further from the edge could still leave
  // the panel too wide to fit — capping width against `innerWidth - right`
  // guarantees a left margin no matter where the button is.
  const [pos, setPos] = useState(null);
  const load = useCallback(() => { db.fetchNotifications().then(setItems).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeNotifications(load), [load]);
  const wrapRef = useCloseOnOutside(open, () => setOpen(false));

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const right = Math.max(12, window.innerWidth - r.right);
      const width = Math.min(340, window.innerWidth - right - 12);
      setPos({ top: r.bottom + 6, right, width });
    }
    setOpen((o) => !o);
  };

  const unread = items.filter((n) => !n.read);
  const markRead = async (id) => { try { await db.markNotificationsRead([id]); load(); } catch {} };
  const markAllRead = async () => { try { await db.markNotificationsRead(unread.map((n) => n.id)); load(); } catch {} };
  const dismiss = async (id) => { try { await db.dismissNotification(id); load(); } catch {} };
  // Tapping the row itself goes to whatever triggered it — the same
  // destination its push notification uses (notificationLink.js). Acting on
  // one is as good as reading it, so this marks it read on the way out.
  const go = async (n) => {
    const target = notificationTarget(n);
    if (!target || !onNavigate) return;
    setOpen(false);
    if (!n.read) { try { await db.markNotificationsRead([n.id]); load(); } catch {} }
    onNavigate(target);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button ref={btnRef} onClick={toggleOpen} style={{ ...iconBtn, position: "relative" }}
        aria-label={t("notifications")} aria-haspopup="menu" aria-expanded={open}>
        <Bell size={16} />
        {unread.length > 0 && (
          <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 99, background: DANGER, color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", lineHeight: 1 }}>
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, right: pos.right, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", width: pos.width, maxHeight: 420, overflowY: "auto", zIndex: 60 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, background: CARD }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{t("notifications")}</span>
            {unread.length > 0 && (
              <button onClick={markAllRead} style={{ ...categoryLink, fontSize: 12, color: ACCENT_TEXT, flexShrink: 0 }}>{t("markAllRead")}</button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "26px 14px", textAlign: "center", color: SUB, fontSize: 13 }}>{t("noNotifications")}</div>
          ) : (
            items.map((n) => {
            // Not every row has somewhere to go (a source row can be deleted
            // out from under it) — those stay plain text rather than a button
            // that looks tappable and does nothing.
            const target = onNavigate ? notificationTarget(n) : null;
            return (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, background: n.read ? "transparent" : OK_BG }}>
                <button onClick={() => go(n)} disabled={!target}
                  style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", textAlign: "left", fontFamily: "inherit", cursor: target ? "pointer" : "default" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: n.read ? 600 : 800, color: INK }}>{n.title}</span>
                    {target && <ChevronRight size={14} style={{ color: SUB, flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{shortDate(n.remindAt, lang)}</div>
                </button>
                <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                  {!n.read && <button onClick={() => markRead(n.id)} style={{ ...categoryLink, fontSize: 12, color: ACCENT_TEXT }}>{t("markAsRead")}</button>}
                  <button onClick={() => dismiss(n.id)} style={{ ...categoryLink, fontSize: 12, color: SUB }}>{t("dismiss")}</button>
                </div>
              </div>
            );
            })
          )}
        </div>
      )}
    </div>
  );
}

function HeaderMenu({ t, lang, changeLang, theme, changeTheme, accent, changeAccent, onHome, onBudget, onReport, onStores, onRecurring, onManageMembers, currency, onChangeCurrency, tripDates, onChangeTripDates, showArchivedLedgers }) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [profile, refreshProfile] = useMyProfile();
  const ref = useCloseOnOutside(open, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={iconBtn} aria-label={t("menu")} aria-haspopup="menu" aria-expanded={open}>
        <Menu size={16} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 190, zIndex: 60 }}>
          {profile && (
            // Pre-invite-feature accounts had name backfilled to their email
            // (migration 009) — show it once, not as a duplicated name+email pair.
            <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "-6px -6px 6px", padding: "12px 14px", background: PAPER, borderBottom: `1px solid ${LINE}`, borderRadius: "10px 10px 0 0" }}>
              <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 99, background: TEAL, color: ACCENT_INK, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {(profile.name || profile.email || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name || profile.email}</div>
                {profile.name && profile.name !== profile.email && (
                  <div style={{ fontSize: 11, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.email}</div>
                )}
              </div>
            </div>
          )}
          {/* Absent on the picker itself — that page is where this leads. */}
          {onHome && (
            <button role="menuitem" onClick={() => { setOpen(false); onHome(); }} style={menuItem}>
              <Home size={15} /> {t("home")}
            </button>
          )}
          {/* Ledger-scoped entries are absent on the picker, which has no ledger. */}
          {onBudget && (
            <button role="menuitem" onClick={() => { setOpen(false); onBudget(); }} style={menuItem}>
              <PieChart size={15} /> {t("budget")}
            </button>
          )}
          {onReport && (
            <button role="menuitem" onClick={() => { setOpen(false); onReport(); }} style={menuItem}>
              <PieChart size={15} /> {t("monthlyReport")}
            </button>
          )}
          {onRecurring && (
            <button role="menuitem" onClick={() => { setOpen(false); onRecurring(); }} style={menuItem}>
              <Repeat size={15} /> {t("recurring")}
            </button>
          )}
          {onManageMembers && (
            <button role="menuitem" onClick={() => { setOpen(false); onManageMembers(); }} style={menuItem}>
              <Users size={15} /> {t("manageAccess")}
            </button>
          )}
          {currency && (
            <div style={menuItem}>
              <Coins size={15} /> <span style={{ flex: 1 }}>{t("currency")}</span>
              <select value={currency} onChange={(e) => onChangeCurrency(e.target.value)} onClick={(e) => e.stopPropagation()}
                style={{ border: "none", background: "none", fontSize: 13, fontWeight: 700, color: ACCENT_TEXT, cursor: "pointer" }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {/* Travel-only (migration 040) — a fixed trip period instead of
              the monthly cycle every other ledger runs on. Blank means "not
              set yet", not an error; the ledger just stays month-scoped
              until both are filled in. */}
          {tripDates && (
            <div style={{ ...menuItem, flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Plane size={15} /> <span style={{ flex: 1 }}>{t("tripDates")}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <input type="date" value={tripDates.startDate || ""} max={tripDates.endDate || undefined}
                  onChange={(e) => onChangeTripDates(e.target.value, tripDates.endDate)}
                  aria-label={t("tripStartDate")} style={{ ...input, flex: 1, fontSize: 12, padding: "6px 8px" }} />
                <input type="date" value={tripDates.endDate || ""} min={tripDates.startDate || undefined}
                  onChange={(e) => onChangeTripDates(tripDates.startDate, e.target.value)}
                  aria-label={t("tripEndDate")} style={{ ...input, flex: 1, fontSize: 12, padding: "6px 8px" }} />
              </div>
            </div>
          )}
          {(onHome || onBudget || onReport || onRecurring || onManageMembers || currency || tripDates) && <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />}
          {/* Beside Settings rather than inside it: getting a ledger back is a
              navigation action like the entries above, not a preference, and
              burying it two taps deep made archiving feel one-way. Gated to the
              transactions view for the same reason Budget/Report/Recurring are —
              Inventory and Smart Grocery are household-wide tools, so a
              ledger-management action has no business in their menus. */}
          {showArchivedLedgers && (
            <button role="menuitem" onClick={() => { setOpen(false); setShowArchived(true); }} style={menuItem}>
              <Archive size={15} /> {t("archivedShort")}
            </button>
          )}
          <button role="menuitem" onClick={() => { setOpen(false); setShowSettings(true); }} style={menuItem}>
            <Settings size={15} /> {t("settings")}
          </button>
          <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />
          <button role="menuitem" onClick={() => { setOpen(false); supabase.auth.signOut(); }} style={menuItem}>
            <LogOut size={15} /> {t("signOut")}
          </button>
        </div>
      )}
      {showSettings && (
        <SettingsPanel t={t} lang={lang} changeLang={changeLang} theme={theme} changeTheme={changeTheme} accent={accent} changeAccent={changeAccent}
          profile={profile} onProfileChange={refreshProfile} onStores={onStores} onClose={() => setShowSettings(false)} />
      )}
      {showArchived && <ArchivedLedgersPanel t={t} onClose={() => setShowArchived(false)} />}
    </div>
  );
}

// Same row look as the plain ghostBtn entries below it (Manage reminders,
// Saved shops) — border, radius, icon + label — but these three expand in
// place instead of opening a new stacked panel.
function AccordionRow({ icon: Icon, label, open, onToggle, children }) {
  const ref = useCloseOnOutside(open, onToggle);

  return (
    <div ref={ref} style={{ border: `1px solid ${LINE}`, borderRadius: 9, overflow: "hidden", background: CARD }}>
      <button onClick={onToggle} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: INK }}>
        <Icon size={15} />
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        <ChevronDown size={15} style={{ color: SUB, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
      </button>
      {open && <div style={{ padding: "0 12px 12px" }}>{children}</div>}
    </div>
  );
}

// App-wide, not ledger-scoped — same panel opens from the picker or from
// inside any ledger, which is why it only needs t/lang/theme, nothing here.
function SettingsPanel({ t, lang, changeLang, theme, changeTheme, accent, changeAccent, profile, onProfileChange, onStores, onClose }) {
  // Language and theme commit on tap; the accent doesn't. Tapping a swatch only
  // previews it live on the app behind this panel — Save writes it to the
  // account, closing without saving puts the stored colour back.
  const [saved, setSaved] = useState(getAccent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showReminders, setShowReminders] = useState(false);
  // Same row style as Manage reminders/Saved shops below, but these four
  // expand in place instead of opening a new stacked panel — quick tweaks,
  // not screens with their own data. Accordion, not independent toggles, so
  // the panel doesn't just go back to "everything open" (today's design).
  const [openSection, setOpenSection] = useState(null); // null | "profile" | "language" | "appearance" | "accent"
  const toggleSection = (key) => setOpenSection((s) => (s === key ? null : key));
  // Nested accordion inside Profile — its own name/password rows, independent
  // of the top-level openSection above.
  const [profileSection, setProfileSection] = useState(null); // null | "name" | "password"
  const toggleProfileSection = (key) => setProfileSection((s) => (s === key ? null : key));
  const dirty = accent !== saved;
  const close = () => { if (dirty) changeAccent(saved); onClose(); };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      // Account first: the localStorage copy is only a cache of it, so it must
      // not claim a colour the server rejected.
      await db.saveMyAccent(accent);
      cacheAccent(accent);
      setSaved(accent);
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  };

  // Name mirrors the accent's dirty/saved toggle exactly (see save() above).
  const [name, setName] = useState(profile?.name || "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameErr, setNameErr] = useState("");
  const nameDirty = name.trim() !== "" && name.trim() !== (profile?.name || "");
  const saveName = async () => {
    setNameBusy(true);
    setNameErr("");
    try {
      await db.updateMyName(name);
      await onProfileChange();
    } catch (e) {
      setNameErr(e.message || String(e));
    }
    setNameBusy(false);
  };

  // Re-authenticates with the current password first (signInWithPassword) so a
  // still-open session on a shared device can't silently take over the account —
  // Supabase's updateUser() alone would accept a new password from just the
  // active session, no current-password check at all.
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);
  const changePassword = async () => {
    setPwErr("");
    setPwDone(false);
    if (newPw !== confirmPw) { setPwErr(t("passwordMismatchErr")); return; }
    setPwBusy(true);
    try {
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: profile?.email, password: currentPw });
      if (reauthErr) { setPwErr(t("currentPasswordWrongErr")); setPwBusy(false); return; }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwDone(true);
    } catch (e) {
      setPwErr(t("passwordSaveErr", { msg: e.message || String(e) }));
    }
    setPwBusy(false);
  };

  return (
    <Overlay title={t("settings")} onClose={close} t={t}>
      <AccordionRow icon={User} label={t("profile")} open={openSection === "profile"} onToggle={() => toggleSection("profile")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AccordionRow icon={Pencil} label={t("editName")} open={profileSection === "name"} onToggle={() => toggleProfileSection("name")}>
            <Field label={t("email")}>
              <div style={{ ...input, color: SUB }}>{profile?.email || ""}</div>
            </Field>
            <Field label={t("nameLabel")}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()} style={input} />
            </Field>
            <button onClick={saveName} disabled={!nameDirty || nameBusy} className="btn-glow"
              style={{ ...addBtn, justifyContent: "center", opacity: nameDirty ? (nameBusy ? 0.6 : 1) : 0.5, cursor: nameDirty && !nameBusy ? "pointer" : "default" }}>
              {nameBusy ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
              {nameDirty ? t("saveName") : t("nameSaved")}
            </button>
            {nameErr && <div style={{ color: DANGER, fontSize: 12, marginTop: 6 }}>{t("nameSaveErr", { msg: nameErr })}</div>}
          </AccordionRow>
          <AccordionRow icon={Lock} label={t("changePassword")} open={profileSection === "password"} onToggle={() => toggleProfileSection("password")}>
            <Field label={t("currentPasswordLabel")}>
              <input type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={input} />
            </Field>
            <Field label={t("newPasswordLabel")}>
              <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={input} />
            </Field>
            <Field label={t("confirmPasswordLabel")}>
              <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && changePassword()} style={input} />
            </Field>
            <button onClick={changePassword} disabled={pwBusy || !currentPw || !newPw || !confirmPw} className="btn-glow"
              style={{ ...addBtn, justifyContent: "center", opacity: (pwBusy || !currentPw || !newPw || !confirmPw) ? 0.5 : 1 }}>
              {pwBusy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("changePassword")}
            </button>
            {pwErr && <div style={{ color: DANGER, fontSize: 12, marginTop: 6 }}>{pwErr}</div>}
            {pwDone && <div style={{ color: OK_INK, fontSize: 12, marginTop: 6 }}>{t("passwordChanged")}</div>}
          </AccordionRow>
        </div>
      </AccordionRow>
      <AccordionRow icon={Languages} label={t("language")} open={openSection === "language"} onToggle={() => toggleSection("language")}>
        <LangToggle lang={lang} changeLang={changeLang} t={t} />
      </AccordionRow>
      <AccordionRow icon={Sun} label={t("appearance")} open={openSection === "appearance"} onToggle={() => toggleSection("appearance")}>
        <div style={{ display: "flex", border: `1px solid ${LINE}`, borderRadius: 9, overflow: "hidden" }}>
          {[["light", t("light"), Sun], ["dark", t("dark"), Moon]].map(([value, label, Icon]) => (
            <button key={value} onClick={() => changeTheme(value)}
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 11px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: theme === value ? TEAL : CARD, color: theme === value ? ACCENT_INK : SUB }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </AccordionRow>
      <AccordionRow icon={Palette} label={t("accentColor")} open={openSection === "accent"} onToggle={() => toggleSection("accent")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {ACCENT_COLORS.map((c) => (
            <button key={c} onClick={() => changeAccent(c)} aria-label={c} aria-pressed={accent === c}
              style={{ width: 32, height: 32, borderRadius: 99, border: accent === c ? `2px solid ${INK}` : `1px solid ${LINE}`, padding: 0, background: c, cursor: "pointer", display: "grid", placeItems: "center" }}>
              {/* Own colour's ink, not the currently-picked accent's — a pale
                  swatch needs a dark tick even while a dusty one is selected. */}
              {accent === c && <Check size={15} color={accentInkFor(c)} />}
            </button>
          ))}
        </div>
        <button onClick={save} disabled={!dirty || busy} className="btn-glow"
          style={{ ...addBtn, justifyContent: "center", opacity: dirty ? (busy ? 0.6 : 1) : 0.5, cursor: dirty && !busy ? "pointer" : "default" }}>
          {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
          {dirty ? t("saveAccent") : t("accentSaved")}
        </button>
        {err && <div style={{ color: DANGER, fontSize: 12, marginTop: 6 }}>{t("accentSaveErr", { msg: err })}</div>}
      </AccordionRow>
      {/* Same account-wide scope as the Bell — every reminder you've set,
          across every ledger, not just the one Settings happened to open from. */}
      <button onClick={() => setShowReminders(true)} style={ghostBtn}>
        <Bell size={15} /> {t("manageReminders")}
      </button>
      <PushToggle t={t} lang={lang} />
      {showReminders && <ManageRemindersPanel t={t} lang={lang} onClose={() => setShowReminders(false)} />}
      {/* Absent on the picker (no ledger, nothing to remember shops for) — same
          optional-prop gate every other ledger-scoped menu entry already uses. */}
      {onStores && (
        <button onClick={onStores} style={ghostBtn}>
          <Store size={15} /> {t("stores")}
        </button>
      )}
    </Overlay>
  );
}

// Per-device opt-in for push reminders. Per-device on purpose: a push
// subscription belongs to one browser on one phone, so signing in elsewhere
// doesn't silently start buzzing a device that never agreed to it.
//
// The service worker that receives these lives in src/sw.js.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC;

// applicationServerKey wants raw bytes, and the key ships as base64url.
const vapidKeyBytes = (base64url) => {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

// serviceWorker.ready never rejects — if registration failed it simply waits
// forever, which left the toggle spinning with no error to show. Racing it
// turns that into a normal failure.
const swReady = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => setTimeout(() => reject(new Error("service worker unavailable")), 10_000)),
]);

function PushToggle({ t, lang }) {
  const [sub, setSub] = useState(null);      // the live PushSubscription, or null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const supported = pushSupported();

  useEffect(() => {
    if (!supported) return;
    swReady()
      .then((reg) => reg.pushManager.getSubscription())
      .then(setSub)
      .catch(() => {});
  }, [supported]);

  const enable = async () => {
    setBusy(true); setErr("");
    try {
      // Must be asked from a user gesture, and Safari refuses outright if the
      // PWA isn't installed to the home screen — hence the explicit denied case.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setErr(t("pushBlocked")); setBusy(false); return; }
      const reg = await swReady();
      const next = await reg.pushManager.subscribe({
        userVisibleOnly: true, // required; a silent push gets the subscription revoked
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC),
      });
      const { keys } = next.toJSON();
      await db.savePushSubscription({ endpoint: next.endpoint, p256dh: keys.p256dh, auth: keys.auth, lang });
      setSub(next);
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true); setErr("");
    try {
      // Row first: if unsubscribe succeeds and the delete then fails, the cron
      // keeps pushing to a dead endpoint until it 410s.
      await db.deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  if (!supported) return null; // nothing actionable to offer — don't show a dead control
  return (
    <>
      <button onClick={sub ? disable : enable} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? <Loader2 size={15} className="spin" /> : <Bell size={15} />}
        {sub ? t("pushDisable") : t("pushEnable")}
      </button>
      {err && <div style={{ color: DANGER, fontSize: 12 }}>{err}</div>}
    </>
  );
}

function ManageRemindersPanel({ t, lang, onClose }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState("");
  const load = useCallback(() => {
    db.fetchAllReminders().then(setItems).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeNotifications(load), [load]);

  const updateDate = async (id, remindAt) => {
    try { await db.updateNotificationDate(id, remindAt); load(); } catch (e) { setError(e.message || String(e)); }
  };
  const remove = async (id) => {
    try { await db.dismissNotification(id); load(); } catch (e) { setError(e.message || String(e)); }
  };

  return (
    <Overlay title={t("manageReminders")} onClose={onClose} t={t}>
      {error && <div style={errorBox}>{error}</div>}
      {items === null ? (
        <Centered>{t("connecting")}</Centered>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", color: SUB, padding: "30px 0", fontSize: 13 }}>{t("noReminders")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n) => {
            // Auto-managed (recurring_rule_id / inventory_item_id) reminders
            // are editable — their sync functions track occurrences via
            // cycle_date rather than remind_at, so an edited date survives
            // until the rule/item actually advances to its next cycle (see
            // db.js). Removing one here now sets `dismissed` rather than
            // deleting the row, so the sync's cycle_date check still sees it
            // and won't recreate it — it only comes back once there's a
            // genuinely new occurrence (next charge / new expiry date).
            const auto = !!n.recurringRuleId || !!n.inventoryItemId;
            return (
              <div key={n.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                  <input type="date" value={n.remindAt} onChange={(e) => updateDate(n.id, e.target.value)}
                    style={{ ...dateInput, marginTop: 6, padding: "6px 8px", fontSize: 13, width: "auto" }} />
                  {auto && <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{t(n.recurringRuleId ? "autoReminderHint" : "autoExpiryHint")}</div>}
                </div>
                <button onClick={() => remove(n.id)} style={{ ...iconBtn, color: DANGER, flexShrink: 0 }} aria-label={t("dismiss")}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}

// The other side of archiving (migration 041). Everywhere else in the app
// reads db.fetchLedgers(), which filters archived ones out — this is the one
// place that asks for them, which is why restoring lives here rather than in
// the picker that can no longer see them.
function ArchivedLedgersPanel({ t, onClose }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(null);
  // Archiving and restoring are both the owner's call (ledger_update's RLS is
  // owner_id = auth.uid()). Settings has no ledger and never carried a user id,
  // so read it here rather than threading one through HeaderMenu's three
  // render sites for a single check.
  const [myId, setMyId] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user?.id || null));
  }, []);
  const load = useCallback(() => {
    db.fetchArchivedLedgers().then(setItems).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Same show-it-then-check-on-tap shape the picker uses for rename/delete: a
  // non-owner gets a sentence they can act on instead of a hidden row or a
  // policy violation.
  const askRestore = (l) => {
    if (l.ownerId !== myId) { setError(t("ownerOnlyErr")); return; }
    setError("");
    setConfirmRestore(l);
  };
  const doRestore = async () => {
    const l = confirmRestore;
    setConfirmRestore(null);
    try { await db.updateLedger(l.id, { archived: false }); load(); }
    catch (e) { setError(e.message || String(e)); }
  };

  return (
    <Overlay title={t("archivedLedgers")} onClose={onClose} t={t}>
      {error && <div style={errorBox}>{error}</div>}
      {items === null ? (
        <Centered>{t("connecting")}</Centered>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", color: SUB, padding: "30px 0", fontSize: 13 }}>{t("noArchivedLedgers")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((l) => {
            const Icon = ledgerIcon(l.template);
            return (
              <button key={l.id} onClick={() => askRestore(l)}
                style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon size={16} style={{ color: SUB, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: ACCENT_TEXT, flexShrink: 0 }}>
                  <ArchiveRestore size={14} /> {t("restoreLedger")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {confirmRestore && (
        <ConfirmDialog t={t} message={t("restoreConfirm", { name: confirmRestore.name })}
          confirmLabel={t("restoreLedger")} icon={ArchiveRestore} tone="primary"
          onConfirm={doRestore} onCancel={() => setConfirmRestore(null)} />
      )}
    </Overlay>
  );
}

// Bento home's per-card colour coding — fixed hex (not var(--accent)) since
// glassmorphism hues stay constant across light/dark; only the frosted
// surface underneath (--glass-* in index.css) adapts to theme.
const HOME_CYAN = "var(--accent)";
const HOME_AMBER = "#FBBF24";
const HOME_SKY = "#38BDF8";
const glassCard = {
  background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", borderRadius: 20, padding: 20,
  boxShadow: "var(--glass-card-shadow)",
  cursor: "pointer", fontFamily: "inherit", display: "block", width: "100%", textAlign: "left",
};

// Shared by the Bento home header and the picker's header — a CSS grid
// (1fr auto 1fr), not flex+absolute-center: with true grid columns, the
// brand middle column always centers on the row's own width, and the flanking
// columns just shrink/truncate instead of visually overlapping it the way an
// absolutely-positioned center did on the narrower picker (a long greeting
// text ran straight into "Monira" there).
function BrandHeader({ left, right }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20, marginBottom: 16 }}>
      {/* overflow stays visible: the left slot holds a dropdown whose menu is
          absolutely positioned and would be clipped otherwise. */}
      <div style={{ minWidth: 0, whiteSpace: "nowrap" }}>{left}</div>
      <div style={{
        fontSize: 24, fontWeight: 800, letterSpacing: -0.4, whiteSpace: "nowrap",
        background: "linear-gradient(90deg, color-mix(in srgb, var(--accent-text) 60%, var(--brand-sheen)), var(--accent-text), color-mix(in srgb, var(--accent-text) 65%, var(--brand-sheen)))",
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
      }}>Monira</div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{right}</div>
    </div>
  );
}

// Bento dashboard, the ledger's landing view — Ledger renders this when
// viewState==="home". Card counts (inventory/grocery) are fetched here rather
// than threaded through Ledger's central refresh(), same self-contained
// pattern as InventoryPanel/GroceryListPanel below.
// Card header shared by all three bento cards: icon + uppercase title on the
// left, a small decorative icon on the right — matches the approved mockup's
// card anatomy exactly, so it's factored out once. Each card passes its own
// hex accent (cyan/amber/sky) so the three read as distinct categories at a
// glance; `accent` must be a plain hex string (not a var()) since the
// corner-icon tint appends an alpha suffix to it. `divider`/`cornerClass` are
// per-card opt-ins: Ledger and Inventory dropped the divider for a seamless
// look, and Ledger's corner arrow gets its own hover-glow class.
function BentoCardHeader({ icon: Icon, title, corner: Corner, accent, divider = true, cornerClass }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={20} style={{ color: accent }} />
          <span style={{ fontSize: 19, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: INK }}>{title}</span>
        </div>
        {Corner && (
          <span className={cornerClass} style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: `${accent}26`, transition: "box-shadow .18s ease" }}>
            <Corner size={14} style={{ color: accent }} />
          </span>
        )}
      </div>
      {divider && <div style={{ borderTop: "1px solid var(--hairline)", margin: "10px 0" }} />}
    </>
  );
}

// Same dropdown pattern as LedgerSwitcher (reuses its ledger-fetching/
// open-state hook), styled as the small pill badge instead of a page
// heading — picking a ledger here is the one thing that decides which
// ledger's Home dashboard is showing, and it sticks (cacheLastLedgerId)
// until picked again, here or via the in-ledger switcher.
function HomeLedgerSwitcher({ ledgerId, ledgerName, t, onSwitch }) {
  const { ledgers, open, setOpen, ref } = useLedgerSwitcher(ledgerId);
  const select = (l) => { setOpen(false); if (l.id !== ledgerId) onSwitch(l); };
  return (
    <div ref={ref} style={{ position: "relative", zIndex: 5, alignSelf: "flex-start" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} style={{
        display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--badge-teal-border)", background: "var(--badge-teal-bg)",
        borderRadius: 7, padding: "4px 12px", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--badge-teal-ink)", cursor: "pointer",
      }}>
        <MapPin size={12} /> {t("viewingLedger", { name: ledgerName })}
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", left: 0, top: "calc(100% + 6px)", borderRadius: 12, padding: 6, minWidth: 200, maxWidth: 300, zIndex: 60,
          // Opaque, not --glass-bg: that token is near-transparent so cards
          // show the starfield, but a popup floating over page content needs
          // to cover it or the rows underneath read straight through.
          background: "var(--card)", border: "1px solid var(--glass-border)",
          boxShadow: "0 10px 30px var(--glass-shadow), 0 0 24px rgba(var(--accent-rgb),0.1)",
        }}>
          {ledgers.map((l) => {
            const Icon = ledgerIcon(l.template);
            const active = l.id === ledgerId;
            return (
              <button key={l.id} role="menuitem" onClick={() => select(l)}
                style={{ ...menuItem, background: active ? "var(--badge-teal-bg)" : "none", color: active ? "var(--badge-teal-ink)" : INK }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                {active && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HomePage({ ledgerId, ledgerName, t, spent, budget, lastEntry, onOpenLedger, onViewTransactions, onOpenInventory, onOpenGrocery, onOpenBudget, onSwitchLedger }) {
  const [inventoryCount, setInventoryCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingGrocery, setPendingGrocery] = useState(0);
  const [dealsActive, setDealsActive] = useState(false);

  // Inventory/grocery are household-wide, not ledger-scoped (migration 038)
  // — these counts don't depend on ledgerId, and shouldn't refetch (or
  // change) when the Home ledger switcher changes.
  useEffect(() => {
    let live = true;
    db.fetchInventoryItems().then((items) => {
      if (!live) return;
      setInventoryCount(items.length);
      setLowStockCount(items.filter((it) => it.minQuantity != null && it.quantity <= it.minQuantity).length);
    }).catch(() => {});
    db.fetchGroceryList().then((items) => {
      if (!live) return;
      setPendingGrocery(items.filter((it) => !it.isCompleted).length);
      // A deal past its own valid-to date isn't "active" — the flyer mirror
      // sweeps it away on the next Thursday run regardless, but the saved
      // row on the item survives until re-checked (nothing re-validates it),
      // so this badge shouldn't claim a stale price is still on.
      const today = todayISO();
      setDealsActive(items.some((it) => it.targetSupermarket && (!it.dealValidTo || it.dealValidTo >= today)));
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const over = budget > 0 && spent > budget;
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
      {/* Purely decorative ambient glow behind the glass cards — glassmorphism
          needs something with colour/shape behind the frosted panes to blur,
          otherwise backdrop-filter has nothing to do against a flat page
          background. Fixed to this wrapper (overflow hidden further down),
          never intercepts clicks. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "-40px -20px auto -20px", height: 260, background: "radial-gradient(circle at 20% 20%, rgba(var(--accent-rgb),0.25), transparent 60%), radial-gradient(circle at 80% 0%, rgba(var(--accent-rgb),0.15), transparent 55%)", filter: "blur(30px)", pointerEvents: "none", zIndex: 0 }} />
      <style>{`
        .bento-glass { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .bento-glass:hover { transform: translateY(-2px); }
        .bento-glass-ledger:hover, .bento-glass-inventory:hover, .bento-glass-grocery:hover {
          border-color: rgba(var(--accent-rgb),0.75) !important;
          box-shadow: var(--glass-card-shadow), 0 0 16px rgba(var(--accent-rgb),0.3), 0 0 40px rgba(var(--accent-rgb),0.14) !important;
        }
        .bento-glass-budget:hover { border-color: rgba(var(--accent-rgb),0.75) !important; box-shadow: var(--glass-card-shadow), 0 0 16px rgba(var(--accent-rgb),0.3), 0 0 40px rgba(var(--accent-rgb),0.14) !important; }
        .bento-glass-ledger:hover .ledger-corner-glow { box-shadow: 0 0 12px rgba(var(--accent-rgb),0.4); }
        .price-match-pill { cursor: pointer; transition: background .18s ease; }
        .bento-glass-grocery:hover .price-match-pill { background: rgba(56,189,248,0.2) !important; }
      `}</style>

      {/* Greeting now lives in the shared header, next to the centered brand
          (see Ledger's header row) — this is just the multi-ledger context
          label, styled as a small pill/badge. Now a dropdown (same list/select
          pattern as LedgerSwitcher) rather than plain text, so which ledger
          Home displays is an explicit, sticky pick made right here instead of
          a side-effect of whatever was opened last elsewhere in the app. */}
      <HomeLedgerSwitcher ledgerId={ledgerId} ledgerName={ledgerName} t={t} onSwitch={onSwitchLedger} />

      <button onClick={budget > 0 ? onViewTransactions : onOpenBudget} className="bento-glass bento-glass-budget" style={{ position: "relative", zIndex: 1, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 20, padding: 20, width: "100%" }}>
        {budget > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, fontSize: 14, fontWeight: 800, letterSpacing: 0.3, marginBottom: 12, color: INK }}>
              <span>{t("budgetBannerLine", { spent: money(spent), budget: money(budget), pct })}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: over ? DANGER : SUB }}>
                {over ? t("budgetOverLine", { amount: money(spent - budget) }) : t("budgetRemainingLine", { amount: money(budget - spent) })}
              </span>
            </div>
            {/* Own progress bar rather than the shared BudgetBar — that component
                is reused by the plain Budget panel too, and this glow-gradient
                treatment is specific to the Bento dashboard's premium look. */}
            <div style={{ position: "relative", height: 12, borderRadius: 99, background: "var(--track)", overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct))}%`, height: "100%", borderRadius: 99,
                background: over ? "linear-gradient(90deg, #F87171, #FB923C)" : "linear-gradient(90deg, color-mix(in srgb, var(--accent) 80%, white), var(--accent))",
                boxShadow: over ? "0 0 12px rgba(248,113,113,0.5)" : "0 0 12px rgba(var(--accent-rgb),0.5)",
                transition: "width .25s ease",
              }} />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: SUB }}>
            <PiggyBank size={16} style={{ color: ACCENT_TEXT }} /> {t("noBudgetSetPrompt")}
          </div>
        )}
      </button>

      {/* auto-fit/minmax, not a fixed two-track grid: a real phone's content
          width (~340-400px) can't fit two 300px+ cards side by side without
          crushing "SMART GROCERY & DEALS" into three wrapped lines, so this
          collapses to a single column there and only goes two-up once the
          container is wide enough (tablet/desktop). */}
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <button onClick={onOpenLedger} className="bento-glass bento-glass-ledger" style={{ ...glassCard, gridColumn: "1 / -1" }}>
          <BentoCardHeader icon={Wallet} title={t("ledgerCard")} corner={ArrowUpRight} accent={HOME_CYAN} cornerClass="ledger-corner-glow" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: SUB, fontWeight: 400 }}>{t("totalMonthSpent")}: </span>
              <span style={{ color: INK, fontWeight: 800, fontSize: 16 }}>{money(spent)}</span>
            </div>
            {lastEntry && (
              <div style={{ fontSize: 14 }}>
                <span style={{ color: SUB, fontWeight: 400 }}>{t("lastEntry")}: </span>
                <span style={{ color: INK, fontWeight: 800, fontSize: 16 }}>{lastEntry.description} - {money(lastEntry.amount)}</span>
              </div>
            )}
          </div>
        </button>

        <button onClick={onOpenInventory} className="bento-glass bento-glass-inventory" style={glassCard}>
          <BentoCardHeader icon={Package} title={t("inventoryCardTitle")} corner={Package} accent={HOME_AMBER} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: SUB, fontWeight: 400 }}>{t("trackedItemsLabel")} </span>
              <span style={{ color: INK, fontWeight: 800, fontSize: 16 }}>{inventoryCount}</span>
            </div>
            {lowStockCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--badge-amber-bg)", border: "1px solid var(--badge-amber-border)", color: "var(--badge-amber-ink)", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 800 }}>
                {t("lowStockAlert", { n: lowStockCount })}
              </span>
            )}
          </div>
        </button>

        <button onClick={onOpenGrocery} className="bento-glass bento-glass-grocery" style={glassCard}>
          <BentoCardHeader icon={ShoppingCart} title={t("groceryCardTitle")} corner={Sparkles} accent={HOME_SKY} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: SUB, fontWeight: 400 }}>{t("pendingItemsLabel")} </span>
              <span style={{ color: INK, fontWeight: 800, fontSize: 16 }}>{pendingGrocery}</span>
            </div>
            <span className="price-match-pill" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--badge-sky-bg)", border: "1px solid var(--badge-sky-border)", color: "var(--badge-sky-ink)", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 800, boxShadow: dealsActive ? "0 0 10px rgba(56,189,248,0.35)" : "none" }}>
              <Info size={13} /> {dealsActive ? t("dealsActiveBadge") : t("priceMatchCheck")}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

const NEW_INVENTORY_ITEM = { name: "", quantity: "1", unit: "", minQuantity: "", expiryDate: "", categoryId: "", locationId: "" };

// Categories and storage locations are the same thing — a per-ledger list of
// names you tag items with — so one manager serves both, told apart by `kind`.
// Same edit-in-place shape as CategoryManager/StoreManager: the whole list is
// handed back on save and reconciled in db.saveInventoryLabels.
function InventoryLabelManager({ kind, labels, t, onSave, onClose }) {
  const [list, setList] = useState(labels);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const isCat = kind === "category";

  const add = () => {
    if (!name.trim()) return;
    setList([...list, { id: uid(), name: name.trim(), isNew: true }]);
    setName("");
  };
  const patch = (id, val) => setList(list.map((l) => (l.id === id ? { ...l, name: val } : l)));
  const del = (id) => setList(list.filter((l) => l.id !== id));
  // Same as the other managers: a name typed but not yet added still counts.
  const done = async () => {
    if (saving) return;
    setSaving(true);
    const pending = name.trim();
    try {
      await onSave(pending ? [...list, { id: uid(), name: pending, isNew: true }] : list);
      onClose();
    } catch (e) { setSaving(false); throw e; }
  };

  return (
    <Overlay onClose={onClose} title={t(isCat ? "invCategories" : "invLocations")} t={t}>
      {list.length === 0 && (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: SUB, fontSize: 13 }}>
          {isCat ? <Tag size={20} style={{ opacity: 0.4 }} /> : <MapPin size={20} style={{ opacity: 0.4 }} />}
          <div style={{ marginTop: 8 }}>{t(isCat ? "noInvCategories" : "noInvLocations")}</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isCat ? <Tag size={15} style={{ color: SUB, flexShrink: 0 }} /> : <MapPin size={15} style={{ color: SUB, flexShrink: 0 }} />}
            <input value={l.name} onChange={(e) => patch(l.id, e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => del(l.id)} style={{ ...iconBtn, color: DANGER }} aria-label={t("delete")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {/* Deleting only unfiles the items — worth saying, since "delete the
          Freezer" sounds like it might take the frozen peas with it. */}
      <div style={{ fontSize: 11.5, color: SUB, marginTop: 8 }}>{t("labelDeleteHint")}</div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t(isCat ? "newInvCategoryPh" : "newInvLocationPh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} disabled={saving} className="btn-glow" style={{ ...addBtn, justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("saveChanges")}
      </button>
    </Overlay>
  );
}

// Label picker used by both inventory forms: a plain <select> plus a link to
// manage the list, mirroring how the expense form pairs Category with
// "Edit categories".
function LabelSelect({ label, value, labels, placeholder, manageLabel, onChange, onManage }) {
  return (
    <Field label={
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1 }}>{label}</span>
        <button onClick={onManage} style={{ ...categoryLink, color: ACCENT_TEXT, fontSize: 12 }}>{manageLabel}</button>
      </span>
    }>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={input}>
        <option value="">{placeholder}</option>
        {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Field>
  );
}

// The three non-Home views a ledger has, in the order they appear here —
// reused by ViewSwitcher below and by whichever view renders it.
// `shortLabelKey` is optional, for the header title only (see ActiveIcon's h2
// below) — the dropdown menu has room for the full name, but "Smart Grocery &
// Deals" next to the icon/chevron/Add-Item button truncated to "Smart Grocery
// & De…" at phone width.
const VIEW_OPTIONS = [
  { key: "ledger", icon: Wallet, labelKey: "ledgerCard" },
  { key: "inventory", icon: Package, labelKey: "inventoryCardTitle" },
  { key: "grocery", icon: ShoppingCart, labelKey: "groceryCardTitle", shortLabelKey: "groceryShortTitle" },
];

// Replaces Inventory/Grocery's static icon+title with a dropdown so you can
// jump straight to either sibling view (or back to the ledger itself)
// without detouring through Home first — Home is still reachable too, via
// the overflow menu's Home entry, same as before.
// `label`/`hideIcon` exist for the ledger picker's header, which reuses this
// whole dropdown but titles it "Ledgers" with no icon — the picker isn't one
// of VIEW_OPTIONS, it just sits in the ledger half of the app, so `current`
// is "ledger" there and the tick lands on Ledger & Transactions.
function ViewSwitcher({ current, onSwitch, t, label, hideIcon }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside(open, () => setOpen(false));
  const active = VIEW_OPTIONS.find((v) => v.key === current);
  const ActiveIcon = active.icon;
  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        // color must be explicit: iOS Safari paints unstyled <button> text in
        // its own system blue, which is what made this title blue on iPhone.
        style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: INK }}>
        {!hideIcon && <ActiveIcon size={18} style={{ color: ACCENT_TEXT, flexShrink: 0 }} />}
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label || t(active.shortLabelKey || active.labelKey)}</h2>
        <ChevronDown size={16} style={{ color: ACCENT_TEXT, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 220, zIndex: 60 }}>
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon;
            const isActive = v.key === current;
            return (
              <button key={v.key} role="menuitem" onClick={() => { setOpen(false); if (!isActive) onSwitch(v.key); }}
                style={{ ...menuItem, background: isActive ? OK_BG : "none", color: isActive ? OK_INK : INK }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(v.labelKey)}</span>
                {isActive && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InventoryPanel({ t, lang, onSwitchView }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | low | expiring
  const [placeFilter, setPlaceFilter] = useState(""); // "" = every location
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState(NEW_INVENTORY_ITEM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Photograph a product (or its barcode) and open the add form already
  // filled in. It reads the label rather than decoding the barcode: Safari
  // has no BarcodeDetector, and this is an iPhone PWA — see api/scan-product.js.
  // Everything stays editable; nothing is saved until Add Item is pressed.
  const scanProduct = async (file) => {
    setScanning(true); setError("");
    try {
      const { image, mediaType } = await fileToUpload(file);
      const { data } = await supabase.auth.getSession();
      const out = await db.scanProduct({ image, mediaType, token: data.session?.access_token, lang });
      // Brand is worth having on the shelf label, but not twice over — plenty
      // of products already lead with it ("Astro Original").
      const name = out.brand && !out.name.toLowerCase().includes(out.brand.toLowerCase())
        ? `${out.brand} ${out.name}` : out.name;
      setDraft({ ...NEW_INVENTORY_ITEM, name, unit: out.unit || "" });
      setShowAddForm(true);
    } catch (e) {
      setError(
        e.code === "no_product" ? t("scanNoProduct")
        : e.code === "rate_limited" ? t("scanRateLimited")
        : (e.message || String(e)),
      );
    }
    setScanning(false);
  };
  const load = useCallback(() => {
    db.fetchInventoryItems().then(setItems).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeInventory(load), [load]);

  const [labels, setLabels] = useState([]);
  const [manageKind, setManageKind] = useState(null); // 'category' | 'location' while its manager is open
  const loadLabels = useCallback(() => {
    db.fetchInventoryLabels().then(setLabels).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => { loadLabels(); }, [loadLabels]);
  useEffect(() => db.subscribeInventoryLabels(loadLabels), [loadLabels]);
  const categories = labels.filter((l) => l.kind === "category");
  const locations = labels.filter((l) => l.kind === "location");
  const labelName = (id) => labels.find((l) => l.id === id)?.name || "";
  const saveLabels = async (kind, list) => {
    await db.saveInventoryLabels(kind, list);
    loadLabels();
    load(); // a deleted label leaves its items unfiled — reflect that straight away
  };

  const adjust = async (id, delta) => {
    try { await db.adjustInventoryQuantity(id, delta); load(); } catch (e) { setError(e.message || String(e)); }
  };
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const saveEdit = async (id, fields) => {
    try { await db.updateInventoryItem(id, fields); setEditingId(null); load(); }
    catch (e) { setError(e.message || String(e)); }
  };
  const doDeleteItem = async () => {
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    try { await db.deleteInventoryItem(item.id); load(); } catch (e) { setError(e.message || String(e)); }
  };
  const [confirmAddItem, setConfirmAddItem] = useState(null); // inventory item pending "already on the list" confirmation
  const [toast, setToast] = useState(null); // { id, text } — id changes so a repeat message restarts the timer
  const doAddToGrocery = async (item) => {
    try {
      await db.addGroceryItem(item.name, Math.max(1, (item.minQuantity || 1) - item.quantity));
      setToast({ id: Date.now(), text: t("addedToGroceryList", { name: item.name }) });
    } catch (e) { setError(e.message || String(e)); }
  };
  const addToGrocery = async (item) => {
    try {
      const groceryItems = await db.fetchGroceryList();
      const alreadyPending = groceryItems.some((g) => !g.isCompleted && g.itemName.toLowerCase() === item.name.toLowerCase());
      if (alreadyPending) { setConfirmAddItem(item); return; }
      await doAddToGrocery(item);
    } catch (e) { setError(e.message || String(e)); }
  };
  const addItem = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try {
      await db.upsertInventoryItem({
        name: draft.name.trim(), quantity: draft.quantity, unit: draft.unit,
        minQuantity: draft.minQuantity === "" ? null : Number(draft.minQuantity),
        expiryDate: draft.expiryDate || null,
        categoryId: draft.categoryId || null, locationId: draft.locationId || null,
      });
      setDraft(NEW_INVENTORY_ITEM);
      setShowAddForm(false);
      load();
    } catch (e) { setError(e.message || String(e)); }
    setSaving(false);
  };
  const cancelAddItem = () => { setDraft(NEW_INVENTORY_ITEM); setShowAddForm(false); };

  const today = todayISO();
  const isExpiring = (d) => !!d && d >= today && d <= addDays(today, 3);
  const isExpired = (d) => !!d && d < today;
  const isLow = (it) => it.minQuantity != null && it.quantity <= it.minQuantity;

  const matchesStatus = (it, f) =>
    f === "all" || (f === "low" && isLow(it)) || (f === "expiring" && (isExpiring(it.expiryDate) || isExpired(it.expiryDate)));

  const visible = (items || [])
    .filter((it) => it.name.toLowerCase().includes(query.toLowerCase()))
    .filter((it) => matchesStatus(it, filter))
    // "What's in the freezer" is the question a location is for, so it filters
    // rather than only labelling. Kept separate from the status chips above —
    // they answer a different question and you want both at once.
    .filter((it) => !placeFilter || it.locationId === placeFilter);

  // Search hides behind an icon: a household inventory is usually short enough
  // to read, so a permanent full-width bar cost a row for nothing. It opens on
  // demand, stays open while there's a query to see, and opens itself once the
  // list is long enough that scanning it stops being realistic.
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef(null);
  const alwaysSearch = (items?.length || 0) > 15;
  const searchOpen = showSearch || alwaysSearch || !!query;
  const toggleSearch = () => {
    if (searchOpen) { setShowSearch(false); setQuery(""); return; } // closing clears, or it'd filter invisibly
    setShowSearch(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ViewSwitcher current="inventory" onSwitch={onSwitchView} t={t} />
        <button onClick={() => setShowAddForm((s) => !s)} style={{ ...ghostBtn, padding: "8px 12px", marginLeft: "auto", flexShrink: 0 }}>
          <Plus size={15} /> {t("addItem")}
        </button>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      {showAddForm && (
        <div style={{ background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* A label, not a button — the file input is what has to be clicked to
              open the camera, and wrapping it is the only way to style that.
              Lives inside the panel, not the header: it's an alternative to
              typing the fields below, not a separate action. */}
          <label className={scanning ? "" : "press-fx btn-glow"} title={t("scanBarcode")} aria-label={t("scanBarcode")}
            style={{ ...addBtn, marginTop: 0, cursor: scanning ? "wait" : "pointer", opacity: scanning ? 0.6 : 1 }}>
            {scanning ? <Loader2 size={15} className="spin" /> : <Camera size={15} />} {t("scanBarcode")}
            <input type="file" accept="image/*" capture="environment" disabled={scanning} style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanProduct(f); }} />
          </label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder={t("itemNamePh")} style={input} />
          <div style={{ display: "flex", gap: 8 }}>
            <Field label={t("quantity")} style={{ width: 90 }}>
              <input type="number" inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} style={input} />
            </Field>
            <Field label={t("unit")} style={{ width: 90 }}>
              <input type="text" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={input} />
            </Field>
          </div>
          {/* Its own row, not a third flex item alongside Quantity/Unit: a native
              <input type="date"> has an intrinsic minimum width that ignores
              flex-shrink/minWidth, so cramming it in with the other two let it
              overflow the card edge on a phone. */}
          <Field label={t("expiryDate")}>
            <input type="date" value={draft.expiryDate} onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} style={dateInput} />
          </Field>
          <Field label={t("minQuantityLabel")}>
            <input type="number" inputMode="decimal" value={draft.minQuantity} onChange={(e) => setDraft({ ...draft, minQuantity: e.target.value })} style={input} />
          </Field>
          <LabelSelect label={t("invCategory")} value={draft.categoryId} labels={categories}
            placeholder={t("noInvCategory")} manageLabel={t("manageLabels")}
            onChange={(v) => setDraft({ ...draft, categoryId: v })} onManage={() => setManageKind("category")} />
          <LabelSelect label={t("invLocation")} value={draft.locationId} labels={locations}
            placeholder={t("noLocation")} manageLabel={t("manageLabels")}
            onChange={(v) => setDraft({ ...draft, locationId: v })} onManage={() => setManageKind("location")} />
          <div style={{ display: "flex", gap: 10 }}>
            {/* Back to the same ghostBtn/addBtn pairing every other Cancel/Save
                pair in the app uses (InventoryItemForm, GroceryItemForm) — the
                matched mint-green pair was a deliberate one-off for this form
                specifically, but read as inconsistent against those. */}
            <button onClick={cancelAddItem} disabled={saving} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: 12 }}>{t("cancel")}</button>
            <button onClick={addItem} disabled={!draft.name.trim() || saving} className="btn-glow"
              style={{ ...addBtn, flex: 1, marginTop: 0, justifyContent: "center", opacity: draft.name.trim() ? (saving ? 0.6 : 1) : 0.5 }}>
              {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("addItem")}
            </button>
          </div>
        </div>
      )}
      {/* Search joins the two filter chips on one row — all three narrow the
          same list, so they read as one control group. Hidden once the list is
          long enough that search stays open anyway; a toggle that can't turn
          anything off is just a dead control. Right-aligned to sit under the
          "Add item" button above, rather than the left edge. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
        {!alwaysSearch && (
          <button onClick={toggleSearch} aria-label={t("searchInventoryPh")} aria-expanded={searchOpen}
            style={chip(searchOpen)}>
            <Search size={13} />
          </button>
        )}
        <FilterDropdown icon={Filter} value={filter} onChange={setFilter}
          options={[
            { value: "all", label: t("showAll") },
            { value: "low", label: t("lowStock") },
            { value: "expiring", label: t("expiringSoon") },
          ]} />
        {locations.length > 0 && (
          <FilterDropdown icon={MapPin} value={placeFilter} onChange={setPlaceFilter}
            options={[{ value: "", label: t("allLocations") }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
        )}
      </div>
      {/* Directly under its own toggle, not above the row — it should expand
          from the control that opened it. */}
      {searchOpen && (
        <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchInventoryPh")} style={input} />
      )}
      {items === null ? (
        <Centered>{t("connecting")}</Centered>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", color: SUB, padding: "30px 0", fontSize: 13 }}>{t("noInventoryItems")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((it) => (
            editingId === it.id ? (
              <InventoryItemForm key={it.id} item={it} t={t} categories={categories} locations={locations}
                onManage={setManageKind}
                onSave={(fields) => saveEdit(it.id, fields)} onCancel={() => setEditingId(null)} />
            ) : (
              <InventoryRow key={it.id} it={it} t={t}
                categoryName={labelName(it.categoryId)} locationName={labelName(it.locationId)}
                low={isLow(it)} expired={isExpired(it.expiryDate)} expiring={!isExpired(it.expiryDate) && isExpiring(it.expiryDate)}
                onAdjust={adjust} onAddToGrocery={addToGrocery}
                onEdit={() => setEditingId(it.id)} onDelete={() => setConfirmDeleteItem(it)} />
            )
          ))}
        </div>
      )}
      {confirmAddItem && (
        <ConfirmDialog t={t} tone="neutral" icon={ShoppingCart}
          message={t("alreadyOnGroceryList", { name: confirmAddItem.name })}
          confirmLabel={t("addAnyway")}
          onConfirm={() => { doAddToGrocery(confirmAddItem); setConfirmAddItem(null); }}
          onCancel={() => setConfirmAddItem(null)} />
      )}
      {confirmDeleteItem && (
        <ConfirmDialog t={t}
          message={t("deleteItemConfirm", { name: confirmDeleteItem.name })}
          onConfirm={doDeleteItem} onCancel={() => setConfirmDeleteItem(null)} />
      )}
      {manageKind && (
        <InventoryLabelManager kind={manageKind} t={t}
          labels={(manageKind === "category" ? categories : locations).map((l) => ({ id: l.id, name: l.name }))}
          onSave={(list) => saveLabels(manageKind, list)} onClose={() => setManageKind(null)} />
      )}
      {toast && <Toast key={toast.id} message={toast.text} onDone={() => setToast(null)} />}
    </div>
  );
}

// Tinted label — used for the Low stock / Expiring soon / Expired badges on
// an inventory row.
function StatusPill({ tone, label }) {
  // Smaller than a typical pill and no glow dot — this one has to share a row
  // with the category/location text on an inventory row, sometimes two of
  // them at once, so it stays as compact as still reads as a pill. Rounded
  // rectangle, not a capsule — see the app-wide chip/pill/StatusPill radius
  // unification (chip():9, pill():8, this:6, scaled to each one's height).
  //
  // Fill and border are derived from the one tone rather than passed in:
  // callers used to hand over their own bg/border trio, and the solid
  // --bad-* tokens next to a color-mix'd amber made two pills on the same
  // row look like different components.
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6,
      background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
      color: tone, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// Same swipe-to-reveal treatment as the ledger picker rows, minus the "open
// this" tap target — an inventory row has no detail view to open, so a tap
// only ever closes an open row. Quantity stepper and the grocery-list cart
// button live inline on their own line (no expand/collapse) — they were
// tried behind a tap-to-expand first, but that stacked a second hidden
// interaction on top of the swipe-to-reveal Edit/Delete already there.
function InventoryRow({ it, t, categoryName, locationName, low, expired, expiring, onAdjust, onAddToGrocery, onEdit, onDelete }) {
  const { x, dragging, closeRow, toggle, onTapOrClose, handlers } = useSwipeReveal(INVENTORY_ROW_ACTIONS_WIDTH);
  return (
    <div style={{ position: "relative", borderRadius: 12 }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, display: "flex", justifyContent: "flex-end", alignItems: "stretch", gap: 6, padding: 4, visibility: x ? "visible" : "hidden" }}>
        <button onClick={() => { closeRow(); onEdit(); }} style={{ ...swipeActionBtn, background: TEAL, color: ACCENT_INK }} aria-label={t("editItem")}>
          <Pencil size={17} />
        </button>
        <button onClick={() => { closeRow(); onDelete(); }} style={{ ...swipeActionBtn, background: "#DC2626", color: "#fff" }} aria-label={t("deleteItem")}>
          <Trash2 size={17} />
        </button>
      </div>
      <div className="swipe-row" {...handlers} onClick={() => onTapOrClose(() => {})}
        style={{
          position: "relative", zIndex: 1,
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-card-shadow)",
          borderRadius: 12, padding: 12,
          transform: x ? `translateX(${x}px)` : "none", transition: dragging ? "none" : "transform .2s ease", touchAction: "pan-y", userSelect: "none",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
          {/* The old separate −/+ icon buttons sat apart from the "1 box" text
              elsewhere in the row, so nothing showed they adjusted that number.
              One pill with the live quantity between them makes the
              relationship obvious at a glance. */}
          {/* --glass-border, not LINE: this pill is the one control here with
              no fill of its own, so its border is all there is to see — and
              LINE is near-black against the transparent card. */}
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--hairline)", borderRadius: 9, flexShrink: 0, overflow: "hidden" }}>
            <button className="press-fx" onClick={(e) => { e.stopPropagation(); onAdjust(it.id, -1); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, border: "none", background: "none", color: INK, cursor: "pointer" }} aria-label="-">
              <Minus size={13} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "0 3px", minWidth: 26, textAlign: "center", whiteSpace: "nowrap" }}>{it.quantity} {it.unit}</span>
            <button className="press-fx" onClick={(e) => { e.stopPropagation(); onAdjust(it.id, 1); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, border: "none", background: "none", color: INK, cursor: "pointer" }} aria-label="+">
              <Plus size={13} />
            </button>
          </div>
          {/* Same 28px as the more-actions button beside it — iconBtn's default
              34px only reads as "matched" against another 34px button, and once
              the row picked up the stepper pill this was the only one left
              still at the old size. */}
          <button className="press-fx" onClick={(e) => { e.stopPropagation(); onAddToGrocery(it); }}
            style={{ ...iconBtn, width: 28, height: 28, flexShrink: 0 }} aria-label={t("addToGroceryList")}>
            <ShoppingCart size={14} />
          </button>
          <button className="swipe-more-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={t("moreActions")} style={moreBtn}>
            <MoreVertical size={16} />
          </button>
        </div>
        {/* Warnings and category/location share one line under the actions —
            wraps rather than truncates when both are present, since a pill
            cutting off mid-label reads worse than the row growing a line.
            Category/location anchors the left edge, warnings the right —
            two groups, not one long cluster reading left to right. */}
        {(low || expired || expiring || categoryName || locationName) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              {/* Location earns the pin icon; a category is just a word. */}
              {categoryName && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: SUB, flexShrink: 0 }}><Tag size={10} /> {categoryName}</span>}
              {locationName && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: SUB, flexShrink: 0 }}><MapPin size={10} /> {locationName}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              {low && <StatusPill tone={BAD_INK} label={t("lowStock")} />}
              {expired && <StatusPill tone={BAD_INK} label={t("expired")} />}
              {expiring && <StatusPill tone={WARN} label={t("expiringSoon")} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// In-place edit form, swapped in for the row it's editing — same shape as the
// "Add Item" form above it, but the quantity here replaces rather than adds.
function InventoryItemForm({ item, t, categories = [], locations = [], onManage, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    name: item.name, quantity: String(item.quantity), unit: item.unit,
    minQuantity: item.minQuantity == null ? "" : String(item.minQuantity),
    expiryDate: item.expiryDate || "",
    categoryId: item.categoryId || "", locationId: item.locationId || "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    await onSave({
      name: draft.name.trim(), quantity: draft.quantity, unit: draft.unit,
      minQuantity: draft.minQuantity === "" ? null : Number(draft.minQuantity),
      expiryDate: draft.expiryDate || null,
      categoryId: draft.categoryId || null, locationId: draft.locationId || null,
    });
    setSaving(false);
  };
  return (
    <div style={{ background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} placeholder={t("itemNamePh")} style={input} />
      <div style={{ display: "flex", gap: 8 }}>
        <Field label={t("quantity")} style={{ width: 90 }}>
          <input type="number" inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} style={input} />
        </Field>
        <Field label={t("unit")} style={{ width: 90 }}>
          <input type="text" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={input} />
        </Field>
      </div>
      {/* Its own row, not a third flex item alongside Quantity/Unit: a native
          <input type="date"> has an intrinsic minimum width that ignores
          flex-shrink/minWidth, so cramming it in with the other two let it
          overflow the card edge on a phone. */}
      <Field label={t("expiryDate")}>
        <input type="date" value={draft.expiryDate} onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} style={dateInput} />
      </Field>
      <Field label={t("minQuantityLabel")}>
        <input type="number" inputMode="decimal" value={draft.minQuantity} onChange={(e) => setDraft({ ...draft, minQuantity: e.target.value })} style={input} />
      </Field>
      <LabelSelect label={t("invCategory")} value={draft.categoryId} labels={categories}
        placeholder={t("uncategorised")} manageLabel={t("manageLabels")}
        onChange={(v) => setDraft({ ...draft, categoryId: v })} onManage={() => onManage?.("category")} />
      <LabelSelect label={t("invLocation")} value={draft.locationId} labels={locations}
        placeholder={t("noLocation")} manageLabel={t("manageLabels")}
        onChange={(v) => setDraft({ ...draft, locationId: v })} onManage={() => onManage?.("location")} />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: 12 }}>{t("cancel")}</button>
        <button onClick={save} disabled={!draft.name.trim() || saving} className="btn-glow"
          style={{ ...addBtn, flex: 1, marginTop: 0, justifyContent: "center", opacity: draft.name.trim() ? (saving ? 0.6 : 1) : 0.5 }}>
          {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("saveItem")}
        </button>
      </div>
    </div>
  );
}

const NEW_GROCERY_ITEM = { itemName: "", quantityNeeded: 1, brand: "" };

// An empty deal lookup has three causes and only one of them is about
// shopping. `pending` (this region was never mirrored) and `stale` (it was,
// but every flyer in it has expired) both mean the data collection failed —
// reporting either as "no deals" tells the user a product isn't on sale when
// nobody actually looked. Returns "" when the result is genuinely empty, so
// callers can fall through to their own not-found message.
const dealsMirrorMessage = (result, t, lang) => {
  if (result?.pending) return t("dealsPending");
  if (result?.stale) {
    const date = result.lastRun
      ? new Date(result.lastRun).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" })
      : "—";
    return t("dealsStale", { date });
  }
  return "";
};

function GroceryListPanel({ t, lang, onSwitchView }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  // The device cache renders instantly while the real (household-wide, not
  // per-ledger — migration 038) value loads in the background below.
  const [postalCode, setPostalCode] = useState(() => getPostalCode());
  useEffect(() => {
    db.fetchHouseholdPostalCode().then((pc) => { if (pc) { setPostalCode(pc); cachePostalCode(pc); } }).catch(() => {});
  }, []);
  const postalRef = useRef(null); // focused when a search is attempted without one
  const [toast, setToast] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const load = useCallback(() => {
    db.fetchGroceryList().then(setItems).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeGroceryList(load), [load]);

  // Same form as editing, so brand can be set while adding. Bumping addKey
  // remounts it blank: the form seeds its fields from props once, and the
  // panel stays open because adding several in a row is the normal case.
  const [addKey, setAddKey] = useState(0);
  const add = async ({ itemName, quantityNeeded, brand }) => {
    try {
      await db.addGroceryItem(itemName, quantityNeeded, brand);
      setAddKey((k) => k + 1);
      load();
    } catch (e) { setError(e.message || String(e)); }
  };
  const toggle = async (id, isCompleted) => {
    try { await db.toggleGroceryItem(id, isCompleted); load(); } catch (e) { setError(e.message || String(e)); }
  };
  const remove = async (id) => {
    try { await db.deleteGroceryItem(id); load(); } catch (e) { setError(e.message || String(e)); }
  };
  const [editingId, setEditingId] = useState(null);
  const saveEdit = async (id, fields, previousName) => {
    try {
      // A new name means whatever deal was matched (cutout, price, flyer
      // link) was matched against the old product — it shouldn't survive
      // pointing at something that's no longer what this row is.
      const clearDeal = previousName != null && fields.itemName.trim().toLowerCase() !== previousName.trim().toLowerCase();
      await db.updateGroceryItem(id, { ...fields, clearDeal });
      setEditingId(null); load();
    } catch (e) { setError(e.message || String(e)); }
  };
  // Opens the match list rather than silently stamping the cheapest hit on the
  // row: the flyer cutout is the whole point at the till, and only a person
  // can tell whether "Milk 2L" is actually the thing in their basket.
  const [dealsFor, setDealsFor] = useState(null); // { item, deals }
  const checkDeals = async (item) => {
    // Flyer prices are regional — without a postal code there is nothing to
    // search: the weekly mirror never fetched this region, so the lookup can
    // only ever come back empty. Say so and put the cursor in the field
    // rather than letting it look like the search found nothing.
    if (!postalCode.trim()) {
      setToast({ id: Date.now(), text: t("postalCodeRequired") });
      postalRef.current?.focus();
      return;
    }
    setCheckingId(item.id);
    setError("");
    try {
      const result = await db.fetchDeals(item.itemName, postalCode, { brand: item.brand });
      // Three different empty results, and only the last one is a fact about
      // shopping: `pending` = never mirrored here, `stale` = mirrored but
      // everything in it expired, so a missed cron run is never reported as
      // "nothing is on sale". Nothing to retry either way — the lookup never
      // touches Flipp live by design.
      const mirrorMsg = dealsMirrorMessage(result, t, lang);
      if (mirrorMsg) setToast({ id: Date.now(), text: mirrorMsg });
      else if (!result.deals?.length) setToast({ id: Date.now(), text: t("dealsNoneFound") });
      else setDealsFor({ item, deals: result.deals });
    } catch (e) {
      setError(t("dealCheckErr", { msg: e.message || String(e) }));
    }
    setCheckingId(null);
  };
  // Photograph a product in the aisle and jump straight to its flyer prices —
  // the same price-match search as the row button, but the query is read off
  // the label instead of coming from a list item. Picking a deal drops the
  // product onto the list with that deal already attached (see pickDeal), so
  // scan-and-save is one tap. Reads the label, not the barcode — see the
  // inventory scanner and api/scan-product.js for why.
  const scanForDeals = async (file) => {
    if (!postalCode.trim()) { setToast({ id: Date.now(), text: t("postalCodeRequired") }); postalRef.current?.focus(); return; }
    setScanning(true); setError("");
    try {
      const { image, mediaType } = await fileToUpload(file);
      const { data } = await supabase.auth.getSession();
      const out = await db.scanProduct({ image, mediaType, token: data.session?.access_token, lang });
      // Same brand-dedupe the inventory scanner uses: don't repeat a brand the
      // product name already leads with.
      const name = out.brand && !out.name.toLowerCase().includes(out.brand.toLowerCase())
        ? `${out.brand} ${out.name}` : out.name;
      const result = await db.fetchDeals(name, postalCode, { brand: out.brand });
      const mirrorMsg = dealsMirrorMessage(result, t, lang);
      if (mirrorMsg) setToast({ id: Date.now(), text: mirrorMsg });
      else if (!result.deals?.length) setToast({ id: Date.now(), text: t("dealsNoneFound") });
      else setDealsFor({ item: { id: null, itemName: name, brand: out.brand || "" }, deals: result.deals });
    } catch (e) {
      setError(
        e.code === "no_product" ? t("scanNoProduct")
        : e.code === "rate_limited" ? t("scanRateLimited")
        : (e.message || String(e)),
      );
    }
    setScanning(false);
  };
  const hasPostal = !!postalCode.trim();
  const [showStores, setShowStores] = useState(false);
  const [showPriceMatch, setShowPriceMatch] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // Loaded here rather than inside the two panels so both share one fetch and
  // stay in step — marking a store in one is reflected in the other.
  const [storePolicies, setStorePolicies] = useState([]);
  const loadStorePolicies = useCallback(() => {
    db.fetchStorePolicies().then(setStorePolicies).catch(() => {});
  }, []);
  useEffect(() => { loadStorePolicies(); }, [loadStorePolicies]);
  useEffect(() => db.subscribeStorePolicies(loadStorePolicies), [loadStorePolicies]);
  const pending = (items || []).filter((it) => !it.isCompleted);
  const done = (items || []).filter((it) => it.isCompleted);
  // Both lists render the same thing; only which bucket they sit in differs.
  const renderRow = (it) =>
    editingId === it.id ? (
      <GroceryItemForm key={it.id} item={it} t={t}
        onSave={(fields) => saveEdit(it.id, fields, it.itemName)} onCancel={() => setEditingId(null)} />
    ) : (
      <GroceryRow key={it.id} it={it} t={t} lang={lang} checkingId={checkingId} hasPostal={hasPostal}
        onToggle={toggle} onCheckDeals={checkDeals}
        onEdit={() => setEditingId(it.id)} onDelete={() => remove(it.id)} />
    );

  const pickDeal = async (deal) => {
    try {
      // A scanned product isn't on the list yet (id null) — add it first, then
      // stamp the deal on the new row. A real list item already has an id.
      const id = dealsFor.item.id ?? await db.addGroceryItem(dealsFor.item.itemName, 1, dealsFor.item.brand);
      await db.setGroceryDeal(id, {
        targetSupermarket: deal.merchant, dealPrice: deal.price,
        dealImageUrl: deal.imageUrl, dealItemName: deal.name,
        dealValidTo: deal.validTo, dealMerchantLogo: deal.merchantLogo,
        dealFlyerId: deal.flyerId, dealItemId: deal.itemId, dealPostalCode: deal.postalCode,
      });
      setDealsFor(null);
      load();
    } catch (e) { setError(e.message || String(e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ViewSwitcher current="grocery" onSwitch={onSwitchView} t={t} />
        {/* Scan moved inside the add-item panel below — it's an alternative to
            typing the fields there, not a separate header action. */}
        <button onClick={() => setShowAddForm((s) => !s)} style={{ ...ghostBtn, padding: "8px 12px", marginLeft: "auto", flexShrink: 0 }}>
          <Plus size={15} /> {t("addItem")}
        </button>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      {/* Postal code and the two store actions used to be two rows — the code
          field full-width above, the buttons below it. They all scope the
          same region/shop context, so they're one row now: the code field
          matched down to the buttons' own 34px/radius-8 (its full-width,
          40px-tall style was built to stand alone, not to sit beside them).
          The buttons stay gated on hasPostal exactly as before — only the
          layout changed, not when each piece appears. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <MapPin size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: SUB, pointerEvents: "none" }} />
          {/* Saved household-wide on blur, not per keystroke — the cron reads
              it from there to know which region's flyers to pull. */}
          <input ref={postalRef} value={postalCode} onChange={(e) => { setPostalCode(e.target.value); cachePostalCode(e.target.value); }}
            onBlur={() => db.updateHouseholdPostalCode(postalCode.trim()).catch((e) => setError(e.message || String(e)))}
            placeholder={t("postalCodePh")}
            style={{ ...input, width: 104, height: 34, borderRadius: 8, fontSize: 13, padding: "0 6px 0 25px", borderColor: hasPostal ? undefined : WARN }} />
        </div>
        {hasPostal && (
          <>
            <button onClick={() => setShowStores(true)} style={ghostBtn}>
              <Store size={14} /> {t("storeSetup")}
            </button>
            {/* Only offered once there's a list to check and a shop to check it
                against — an empty report helps nobody. */}
            {pending.length > 0 && storePolicies.some((s) => s.isLocal) && (
              <button onClick={() => setShowPriceMatch(true)} style={ghostBtn}>
                <Sparkles size={14} /> {t("priceMatchBtn")}
              </button>
            )}
          </>
        )}
      </div>
      {/* Stated up front rather than only on a failed tap — price matching is
          the point of this screen and it can't work without a region. */}
      {!hasPostal && <div style={{ fontSize: 12, color: WARN, marginTop: -4 }}>{t("postalCodeRequired")}</div>}
      {/* Stays open after each add — the toast comment below spells out why
          adding several in a row is the normal case here. */}
      {showAddForm && (
        <GroceryItemForm key={addKey} item={NEW_GROCERY_ITEM} t={t}
          onSave={add} onCancel={() => setShowAddForm(false)} onScan={scanForDeals} scanning={scanning} />
      )}
      {items === null ? (
        <Centered>{t("connecting")}</Centered>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", color: SUB, padding: "30px 0", fontSize: 13 }}>{t("noGroceryItems")}</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{pending.map(renderRow)}</div>
          {/* Ticked-off items drop out of the shopping list into a collapsed
              pile at the bottom. What's left to buy is the only thing worth
              scanning while you're in the aisle; done items are just proof the
              trip is going well, so they stay one tap away rather than in the
              way. Collapsed by default, and the count carries the reassurance
              without opening it. */}
          {done.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <button onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}
                style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 2px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: SUB }}>
                <ChevronDown size={14} style={{ transition: "transform .15s", transform: showDone ? "rotate(180deg)" : "none", flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: "left" }}>{t("completedCount", { n: done.length })}</span>
              </button>
              {showDone && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{done.map(renderRow)}</div>}
            </div>
          )}
        </>
      )}
      {dealsFor && (
        <PriceMatchPanel deals={dealsFor.deals} itemName={dealsFor.item.itemName} t={t} lang={lang}
          onPick={pickDeal} onClose={() => setDealsFor(null)} />
      )}
      {showStores && (
        <StoreSetupPanel postalCode={postalCode} t={t} lang={lang} onClose={() => setShowStores(false)} />
      )}
      {showPriceMatch && (
        <PriceMatchModePanel postalCode={postalCode} items={pending} stores={storePolicies}
          t={t} lang={lang} onClose={() => setShowPriceMatch(false)}
          onSetUpStores={() => { setShowPriceMatch(false); setShowStores(true); }} />
      )}
      {toast && <Toast key={toast.id} message={toast.text} onDone={() => setToast(null)} />}
    </div>
  );
}

// The thing you actually hold up at the till. Each row is the flyer's own
// cutout artwork — the product clipped straight out of this week's flyer with
// its price on it — plus the merchant and the expiry date, which is what a
// cashier checks before honouring a match. A number alone proves nothing.
function PriceMatchPanel({ deals, itemName, t, lang, onPick, onClose }) {
  return (
    <Overlay title={t("priceMatchTitle", { name: itemName })} onClose={onClose} t={t}>
      <div style={{ fontSize: 12.5, color: SUB, marginBottom: 4 }}>{t("priceMatchHint")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {deals.map((d, i) => (
          <div key={i} style={{ position: "relative" }}>
          <button onClick={() => onPick(d)} className="press-fx"
            style={{
              display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
              background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", borderRadius: 12,
              padding: 10, cursor: "pointer", fontFamily: "inherit", color: INK,
            }}>
            {/* Fixed box so a missing or slow image doesn't reflow the list. */}
            <div style={{ width: 74, height: 74, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: MUTED_BG, display: "grid", placeItems: "center" }}>
              {d.imageUrl
                ? <img src={d.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <Tag size={20} style={{ color: SUB }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: OK_INK }}>{money(d.price)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>
                {d.merchantLogo && <img src={d.merchantLogo} alt="" loading="lazy" style={{ height: 14, maxWidth: 60, objectFit: "contain" }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.merchant}</span>
              </div>
              <div style={{ fontSize: 11.5, color: SUB, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
              {d.validTo && <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{t("dealValidUntil", { date: shortDate(d.validTo, lang) })}</div>}
            </div>
          </button>
          {/* Its own control, not nested in the card button — a link inside a
              button is invalid HTML and picking the deal would swallow the tap. */}
          {d.flyerId && (
            <a href={db.dealUrl(d.itemId, d.flyerId, d.postalCode)} target="_blank" rel="noopener noreferrer"
              title={t("viewFullFlyer")} aria-label={t("viewFullFlyer")}
              style={{ ...iconBtn, position: "absolute", top: 8, right: 8, width: 28, height: 28, background: CARD }}>
              <ExternalLink size={14} />
            </a>
          )}
          </div>
        ))}
      </div>
    </Overlay>
  );
}

// Same swipe-to-reveal treatment as InventoryRow — Edit/Delete live under
// the row, revealed by dragging left, instead of the delete icon sitting
// there permanently.
//
// Two taps, two jobs, deliberately split: the big accent circle ticks the item
// off, and a tap anywhere else opens the saved flyer cutout. The row used to
// toggle on any tap, but once an item carries proof for the till that has to
// be reachable in one tap while standing at the counter — and the circle is
// now a large, obvious target in its own right, which is what the earlier
// "the checklist isn't obvious" pass was actually fixing.
function GroceryRow({ it, t, lang, checkingId, hasPostal = true, onToggle, onCheckDeals, onEdit, onDelete }) {
  const { x, dragging, closeRow, toggle, onTapOrClose, handlers } = useSwipeReveal(INVENTORY_ROW_ACTIONS_WIDTH);
  const [open, setOpen] = useState(false);
  const done = it.isCompleted;
  const checking = checkingId === it.id;
  const hasDeal = !!it.targetSupermarket;
  // Saved deals are never re-validated once picked — nothing re-checks a row
  // against the flyer mirror's Thursday sweep, so a price can sit there
  // advertising a competitor's flyer that's already gone. No valid-to date
  // is treated as still fresh: unknown expiry isn't the same as known-expired.
  const dealExpired = hasDeal && it.dealValidTo && it.dealValidTo < todayISO();
  return (
    <div style={{ position: "relative", borderRadius: 12 }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, display: "flex", justifyContent: "flex-end", alignItems: "stretch", gap: 6, padding: 4, visibility: x ? "visible" : "hidden" }}>
        <button onClick={() => { closeRow(); onEdit(); }} style={{ ...swipeActionBtn, background: TEAL, color: ACCENT_INK }} aria-label={t("editItem")}>
          <Pencil size={17} />
        </button>
        <button onClick={() => { closeRow(); onDelete(); }} style={{ ...swipeActionBtn, background: "#DC2626", color: "#fff" }} aria-label={t("deleteItem")}>
          <Trash2 size={17} />
        </button>
      </div>
      <div className="swipe-row" {...handlers}
        onClick={() => onTapOrClose(() => hasDeal && setOpen((o) => !o))}
        style={{
          position: "relative", zIndex: 1,
          background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-card-shadow)",
          borderRadius: 12, padding: 12, cursor: hasDeal ? "pointer" : "default", opacity: done ? 0.55 : 1,
          transform: x ? `translateX(${x}px)` : "none", transition: dragging ? "none" : "transform .2s ease, opacity .2s ease", touchAction: "pan-y", userSelect: "none",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button role="checkbox" aria-checked={done} aria-label={it.itemName}
            onClick={(e) => { e.stopPropagation(); onToggle(it.id, !done); }}
            style={{
              display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 99, flexShrink: 0, padding: 0, cursor: "pointer",
              border: done ? "2px solid transparent" : `2px solid ${SUB}`, background: done ? TEAL : "transparent",
              color: ACCENT_INK, boxShadow: done ? ACCENT_GLOW : "none", transition: "background .15s ease",
            }}>
            {done && <Check size={14} strokeWidth={3} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: done ? "line-through" : "none", color: done ? SUB : INK }}>
              {it.itemName}{it.quantityNeeded > 1 ? ` ×${it.quantityNeeded}` : ""}
            </div>
            {/* A pill, not a second line of colored body text — on a list
                where most rows have a deal, full-width coloured sentences
                competed with the item names for attention and the "what do I
                still need to buy" read got lost. Contained as a tag instead,
                it's scannable as an aside rather than a second row of content. */}
            {hasDeal && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, maxWidth: "100%",
                padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                color: dealExpired ? WARN : OK_INK,
                background: dealExpired ? `color-mix(in srgb, ${WARN} 14%, transparent)` : OK_BG,
                border: `1px solid ${dealExpired ? `color-mix(in srgb, ${WARN} 45%, transparent)` : OK_LINE}`,
              }}>
                <ChevronDown size={11} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {money(it.dealPrice)} · {it.targetSupermarket}
                </span>
                {dealExpired && <Info size={11} style={{ flexShrink: 0 }} />}
              </div>
            )}
          </div>
          {/* Dimmed without a postal code, but still tappable — the tap is
              what explains why and focuses the field, which a disabled button
              couldn't do. */}
          <button className="press-fx" onClick={(e) => { e.stopPropagation(); onCheckDeals(it); }} disabled={checking}
            aria-label={t("priceMatchCheck")} title={hasPostal ? t("priceMatchCheck") : t("postalCodeRequired")}
            style={{ ...iconBtn, flexShrink: 0, opacity: checking || !hasPostal ? 0.6 : 1 }}>
            {checking ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
          </button>
          <button className="swipe-more-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={t("moreActions")} style={moreBtn}>
            <MoreVertical size={16} />
          </button>
        </div>
        {/* The proof, sized to be readable across a counter rather than as a
            thumbnail — this is meant to be turned around and shown to someone. */}
        {open && hasDeal && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
            {/* Right above the cutout, not just in the collapsed badge — this
                is the moment someone's about to turn the phone around at the
                till, and the warning needs to land before that, not after. */}
            {dealExpired && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: WARN, marginBottom: 8 }}>
                <Info size={13} style={{ flexShrink: 0 }} /> {t("dealExpiredHint")}
              </div>
            )}
            {it.dealImageUrl ? (
              <img src={it.dealImageUrl} alt={it.dealItemName || it.itemName}
                style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, background: "#fff" }} />
            ) : (
              <div style={{ fontSize: 12, color: SUB }}>{t("dealNoImage")}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              {it.dealMerchantLogo && <img src={it.dealMerchantLogo} alt="" style={{ height: 16, maxWidth: 70, objectFit: "contain" }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{it.targetSupermarket}</div>
                {it.dealItemName && <div style={{ fontSize: 11.5, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.dealItemName}</div>}
                {it.dealValidTo && <div style={{ fontSize: 11, color: SUB }}>{t("dealValidUntil", { date: shortDate(it.dealValidTo, lang) })}</div>}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: OK_INK, flexShrink: 0 }}>{money(it.dealPrice)}</div>
            </div>
            {/* Some cashiers want the whole flyer, not just the cutout. Links
                out to Flipp's own page rather than mirroring it — see
                migration 028 — and straight to this item's position when a
                deal_item_id is on hand (migration 039), not just the front
                page. stopPropagation so it doesn't collapse the row. */}
            {it.dealFlyerId && (
              <a href={db.dealUrl(it.dealItemId, it.dealFlyerId, it.dealPostalCode)} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ ...ghostBtn, marginTop: 8, width: "100%", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>
                <ExternalLink size={14} /> {t("viewFullFlyer")}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// In-place edit form, swapped in for the row it's editing — grocery items
// only have a name, a quantity and a brand, so this is much smaller than
// InventoryItemForm.
//
// Also the ADD form — an item with no id is a new one. Adding used to be a
// lone name box, which meant the brand that makes price matching land on the
// right product could only be filled in by editing the item afterwards, a
// step nobody takes.
function GroceryItemForm({ item, t, onSave, onCancel, onScan, scanning }) {
  const isNew = !item.id;
  const [name, setName] = useState(item.itemName);
  const [quantity, setQuantity] = useState(String(item.quantityNeeded));
  const [brand, setBrand] = useState(item.brand || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave({ itemName: name.trim(), quantityNeeded: Math.max(1, Number(quantity) || 1), brand: brand.trim() });
    setSaving(false);
  };
  return (
    <div style={{ background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-card-shadow)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Add-only — editing an existing row has no "scan to fill this in"
          moment. A label, not a button: the hidden file input is what has to
          be clicked to open the camera. Photo → flyer prices, straight into a
          price match, same as the row-level scan-for-deals button. */}
      {isNew && onScan && (
        <label className={scanning ? "" : "press-fx btn-glow"} title={t("scanBarcode")} aria-label={t("scanBarcode")}
          style={{ ...addBtn, marginTop: 0, cursor: scanning ? "wait" : "pointer", opacity: scanning ? 0.6 : 1 }}>
          {scanning ? <Loader2 size={15} className="spin" /> : <Camera size={15} />} {t("scanBarcode")}
          <input type="file" accept="image/*" capture="environment" disabled={scanning} style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onScan(f); }} />
        </label>
      )}
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} placeholder={t("addGroceryItemPh")} style={input} />
      <Field label={t("quantity")} style={{ width: 90 }}>
        <input type="number" inputMode="numeric" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} style={input} />
      </Field>
      {/* Narrows the flyer search rather than describing the item for its own
          sake, so it says so — otherwise it reads as a busywork field. A size
          field sat here too and was removed: matched as a substring it made
          results worse, "750" turning up Milk-Bone dog biscuits (migration 027). */}
      <Field label={t("brandLabel")}>
        <input value={brand} onChange={(e) => setBrand(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
          placeholder={t("brandPh")} style={input} />
      </Field>
      <div style={{ fontSize: 11.5, color: SUB, marginTop: -4 }}>{t("brandHint")}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: 12 }}>{t("cancel")}</button>
        <button onClick={save} disabled={!name.trim() || saving} className="btn-glow"
          style={{ ...addBtn, flex: 1, marginTop: 0, justifyContent: "center", opacity: name.trim() ? (saving ? 0.6 : 1) : 0.5 }}>
          {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {isNew ? t("addItem") : t("saveItem")}
        </button>
      </div>
    </div>
  );
}

// Price Match Mode — you're standing in a shop, and this says which items on
// the list are cheaper elsewhere and hands you the flyer to prove it.
//
// Reuses /api/scan-deals (db.fetchDeals) for the lookup rather than
// reimplementing flyer matching — it already sorts by price, filters expired
// deals and returns the cutout and flyer link.
//
// Deliberately no "current price" or "savings" figure: Flipp carries flyer
// prices only, never shelf prices, so what you'd otherwise pay here is
// unknowable for anything not in this store's own flyer. A savings number
// would have to be invented for those, and an invented number on a screen you
// take to a cashier is worse than no number.
function PriceMatchModePanel({ postalCode, items, stores, t, lang, onClose, onSetUpStores }) {
  // Exactly one store is local (migration 036) — the one you actually stand
  // in. Nothing left to pick, so the report just runs.
  const localStore = stores.find((s) => s.isLocal);
  // Stores confirmed onto that store's price-match list — the whole
  // comparison universe. A cheaper flyer anywhere else isn't actionable:
  // your local store won't honour a flyer from a shop it doesn't recognise.
  const matchStores = localStore ? stores.filter((s) => s.priceMatches === true && s.merchant !== localStore.merchant) : [];
  const matchNames = matchStores.map((s) => s.merchant).sort().join(",");
  const itemKey = items.map((it) => `${it.id}:${it.itemName}:${it.brand || ""}`).join("|");

  const [report, setReport] = useState(null); // null = not run, [] = ran, empty
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStore || matchStores.length === 0) { setReport(null); return; }
    let live = true;
    setRunning(true); setError(""); setReport(null);
    const names = new Set(matchStores.map((s) => s.merchant));
    // Read-only lookups, so these can go in parallel — unlike the batch
    // writes elsewhere in this file, there's no read-then-write to serialise.
    // Every lookup shares one mirror, so if it's unusable the whole report is
    // meaningless — not a list of items that happen to have no deal. Held
    // aside and checked before any of it is shown.
    let mirrorProblem = "";
    Promise.all(items.map(async (it) => {
      const out = await db.fetchDeals(it.itemName, postalCode, { brand: it.brand });
      mirrorProblem ||= dealsMirrorMessage(out, t, lang);
      const deals = (out.deals || []).filter((d) => names.has(d.merchant) || d.merchant === localStore.merchant);
      const elsewhere = deals.filter((d) => d.merchant !== localStore.merchant);
      const here = deals.find((d) => d.merchant === localStore.merchant);
      const best = elsewhere[0];
      // `here` beating everything else means there's nothing to ask for —
      // it's already the cheapest advertised price on the list.
      if (here && (!best || here.price <= best.price)) {
        return { productName: it.itemName, status: "already_here", lowestPrice: here.price, matchedName: here.name };
      }
      if (!best) return { productName: it.itemName, status: "no_deals" };
      return {
        productName: it.itemName, status: "can_match",
        cheaperStore: best.merchant, lowestPrice: best.price, matchedName: best.name,
        imageUrl: best.imageUrl, merchantLogo: best.merchantLogo, validTo: best.validTo,
        flyerUrl: db.dealUrl(best.itemId, best.flyerId, best.postalCode),
      };
    })).then((rows) => {
      if (!live) return;
      // A stale mirror would otherwise render as every item cleanly reporting
      // "no deals" — the single most misleading thing this panel can say.
      if (mirrorProblem) { setError(mirrorProblem); setReport(null); return; }
      setReport(rows);
    })
      .catch((e) => { if (live) setError(e.message || String(e)); })
      .finally(() => { if (live) setRunning(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStore?.merchant, matchNames, itemKey, postalCode]);

  const matchable = (report || []).filter((r) => r.status === "can_match");
  const others = (report || []).filter((r) => r.status !== "can_match");

  return (
    <Overlay title={t("priceMatchMode")} onClose={onClose} t={t}>
      {error && <div style={errorBox}>{error}</div>}

      {!localStore ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: SUB, fontSize: 13 }}>
          <Store size={20} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 8 }}>{t("noMatchStores")}</div>
          <button onClick={onSetUpStores} style={{ ...ghostBtn, marginTop: 10 }}>{t("storeSetup")}</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Store size={16} style={{ color: ACCENT_TEXT, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 800 }}>{t("shoppingAt", { store: localStore.merchant })}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: SUB }}>{t("pmListCount", { n: matchStores.length })}</span>
            <button onClick={onSetUpStores} style={{ ...categoryLink, color: ACCENT_TEXT, fontSize: 12 }}>{t("storeSetup")}</button>
          </div>

          {matchStores.length === 0 ? (
            <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: SUB, fontSize: 13 }}>
              {t("noMatchListStores")}
            </div>
          ) : running ? (
            <Centered>{t("pmChecking")}</Centered>
          ) : report && (
            <>
              <div style={{ fontSize: 12.5, color: SUB }}>{t("pmWillMatch")}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t("pmSummary", { n: matchable.length, total: report.length })}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {matchable.map((r, i) => (
                  <div key={i} style={{ background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: `1px solid ${OK_LINE}`, borderRadius: 12, padding: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 66, height: 66, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: MUTED_BG, display: "grid", placeItems: "center" }}>
                      {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Tag size={18} style={{ color: SUB }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.productName}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: OK_INK }}>{money(r.lowestPrice)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, marginTop: 1 }}>
                        {r.merchantLogo && <img src={r.merchantLogo} alt="" loading="lazy" style={{ height: 13, maxWidth: 54, objectFit: "contain" }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cheaperStore}</span>
                      </div>
                      {/* What we actually matched — lets you catch a coconut
                          milk standing in for the milk you meant. */}
                      <div style={{ fontSize: 11, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.matchedName}</div>
                      {r.validTo && <div style={{ fontSize: 11, color: SUB }}>{t("dealValidUntil", { date: shortDate(r.validTo, lang) })}</div>}
                      {r.flyerUrl && (
                        <a href={r.flyerUrl} target="_blank" rel="noopener noreferrer"
                          style={{ ...ghostBtn, marginTop: 6, width: "100%", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>
                          <ExternalLink size={13} /> {t("viewFullFlyer")}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Kept, not hidden: "already cheapest here" is a useful answer,
                  and "no flyer deal" tells you not to go looking. */}
              {others.length > 0 && (
                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                  {others.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: SUB, padding: "6px 2px" }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.productName}</span>
                      <span style={{ flexShrink: 0 }}>
                        {r.status === "already_here" ? t("pmAlreadyHere", { price: money(r.lowestPrice) }) : t("pmNoDeals")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Overlay>
  );
}

// Store setup — the prerequisite for Price Match Mode (migration 030).
//
// The "nearby supermarkets" list comes from the flyer mirror, not a places
// API: Flipp already answers per postal code, and shops that publish flyers
// there are exactly the ones price matching can act on. A Places lookup would
// list stores we hold no flyer data for.
//
// Price-match policy is asked, never assumed. Three states, and "not sure"
// must stay distinct from "no" — a wrong "no" quietly hides real savings, a
// wrong "yes" sends you to the counter for an argument. Nothing ships
// pre-filled because policies vary by franchise owner and change unannounced.
function StoreSetupPanel({ postalCode, t, lang, onClose }) {
  const [merchants, setMerchants] = useState(null); // null = loading
  const [policies, setPolicies] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  // Which "mine" and which shop type to show are two different questions —
  // kept as separate state (and separate chip rows below) so they read as
  // two different questions too, instead of one row that looked like it had
  // a redundant "show everything" option twice.
  const [typeFilter, setTypeFilter] = useState("grocery"); // "grocery" | "homeGarden" | "all"
  // The type-filter row is a dropdown anchored to "Browse", not a permanent
  // second row — it opens on tap and folds away on an outside tap, so it
  // doesn't sit there taking up space once you've already picked one.
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const filterRowRef = useRef(null);
  useEffect(() => {
    if (!typeFilterOpen) return;
    const onOutside = (e) => { if (filterRowRef.current && !filterRowRef.current.contains(e.target)) setTypeFilterOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [typeFilterOpen]);

  const loadPolicies = useCallback(() => {
    db.fetchStorePolicies().then(setPolicies).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => {
    db.fetchNearbyMerchants(postalCode).then(setMerchants).catch((e) => { setError(e.message || String(e)); setMerchants([]); });
  }, [postalCode]);
  useEffect(() => { loadPolicies(); }, [loadPolicies]);
  useEffect(() => db.subscribeStorePolicies(loadPolicies), [loadPolicies]);

  const policyFor = (merchant) => policies.find((p) => p.merchant === merchant) || {};
  const patch = async (merchant, fields) => {
    try { await db.setStorePolicy(merchant, fields); loadPolicies(); }
    catch (e) { setError(e.message || String(e)); }
  };
  const setLocal = async (merchant) => {
    try { await db.setLocalStore(merchant); loadPolicies(); }
    catch (e) { setError(e.message || String(e)); }
  };

  // Exactly one store is "local" (migration 036) — the one you actually stand
  // in. Every other row's price_matches answers a different question now:
  // whether that store belongs on the local store's price-match list.
  const localStore = policies.find((p) => p.isLocal);
  const isConfigured = (p) => p.isLocal || p.priceMatches === true;

  // The region returns ~109 merchants, most of them hardware, electronics and
  // furniture shops. Leading with the ones Flipp files under Groceries is what
  // makes the list usable — sort order alone never did, whether by flyer size
  // or alphabetically (see migration 032). Non-grocers stay one tap away.
  const anyGrocery = (merchants || []).some((m) => m.isGrocery);
  const visible = (merchants || [])
    .filter((m) => m.merchant.toLowerCase().includes(query.toLowerCase()))
    .filter((m) => !onlyMine || isConfigured(policyFor(m.merchant)))
    // The type filter is hidden (and skipped) in "My stores" — see below —
    // and a search is an explicit request for that shop, so both override it;
    // otherwise searching "canadian tire" would find nothing.
    .filter((m) => onlyMine || typeFilter === "all" || query.trim() || !anyGrocery
      || (typeFilter === "homeGarden" ? m.isHomeGarden : m.isGrocery));
  const mineCount = policies.filter(isConfigured).length;

  return (
    <Overlay title={t("storeSetup")} onClose={onClose} t={t}>
      <div style={{ fontSize: 12.5, color: SUB }}>{t("storeSetupHint")}</div>
      {error && <div style={errorBox}>{error}</div>}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchStoresPh")} style={input} />
      <div ref={filterRowRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => { if (onlyMine) { setOnlyMine(false); setTypeFilterOpen(true); } else setTypeFilterOpen((o) => !o); }}
            style={chip(!onlyMine)}>{t("browseStores")}</button>
          <button onClick={() => { setOnlyMine(true); setTypeFilterOpen(false); }} style={chip(onlyMine)}>{t("myStoresCount", { n: mineCount })}</button>
        </div>
        {/* A dropdown off "Browse", not a permanent row — that list is
            ~109 merchants and the type filter earns its keep there, but
            once you've picked one it's just taking up space; "My stores"
            is already short and hand-picked and never needs it at all.
            Also only offered once the mirror actually carries categories —
            before that every shop looks non-grocery and the filter would
            be a lie. */}
        {!onlyMine && typeFilterOpen && anyGrocery && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setTypeFilter("grocery")} style={chip(typeFilter === "grocery")}>{t("typeSupermarkets")}</button>
            <button onClick={() => setTypeFilter("homeGarden")} style={chip(typeFilter === "homeGarden")}>{t("typeHardware")}</button>
            <button onClick={() => setTypeFilter("all")} style={chip(typeFilter === "all")}>{t("includeNonGrocery")}</button>
          </div>
        )}
      </div>
      {merchants === null ? (
        <Centered>{t("connecting")}</Centered>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", color: SUB, padding: "30px 0", fontSize: 13 }}>
          {merchants.length === 0 ? t("noStoresForRegion") : t("noStoresMatch")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((m) => {
            const p = policyFor(m.merchant);
            const isLocal = !!p.isLocal;
            return (
              <div key={m.merchant} style={{ background: CARD, border: `1px solid ${isLocal ? OK_LINE : LINE}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.merchantLogo && <img src={m.merchantLogo} alt="" loading="lazy" style={{ height: 18, maxWidth: 64, objectFit: "contain", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.merchant}</div>
                    <div style={{ fontSize: 11.5, color: SUB }}>{t("storeItemCount", { n: m.itemCount })}</div>
                  </div>
                  {/* Only one store can be local — picking a new one silently
                      replaces the old (setLocalStore clears it server-side). */}
                  <button onClick={() => isLocal ? patch(m.merchant, { isLocal: false }) : setLocal(m.merchant)} style={chip(isLocal)}>
                    {isLocal ? <><Check size={13} /> {t("myStore")}</> : t("markMyStore")}
                  </button>
                </div>
                {/* The price-match question is now about every OTHER store —
                    "would my local store honour this one's flyer" — so it
                    only makes sense once a local store exists to ask it about. */}
                {!isLocal && localStore && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("priceMatchesQ", { store: localStore.merchant })}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[[true, t("yes")], [false, t("no")], [null, t("notSure")]].map(([val, label]) => (
                        <button key={String(val)} onClick={() => patch(m.merchant, { priceMatches: val })}
                          style={chip(p.priceMatches === val || (val === null && p.priceMatches == null))}>{label}</button>
                      ))}
                    </div>
                    {p.confirmedAt && (
                      <div style={{ fontSize: 11, color: SUB, marginTop: 6 }}>
                        {t("lastConfirmed", { date: shortDate(p.confirmedAt.slice(0, 10), lang) })}
                      </div>
                    )}
                    {/* The boolean can't hold "identical item and size only" or
                        "local competitors, not online" — this is the text you
                        actually want in front of you at the counter. */}
                    {p.priceMatches === true && (
                      <input defaultValue={p.note} onBlur={(e) => e.target.value !== (p.note || "") && patch(m.merchant, { note: e.target.value })}
                        placeholder={t("storeNotePh")} style={{ ...input, marginTop: 8, fontSize: 13 }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}

// Glass slide-over, same treatment as the Bento home — this is the shared
// wrapper behind ~18 panels (Budget, Reports, Settlement, Recurring,
// Settings, Manage members, Batch import, Category/Store managers, Manage
// reminders, Expense form, Inventory/Grocery's own panels don't use this one
// but everything else does), so restyling it once carries the look almost
// everywhere without touching each panel individually. The decorative glow
// sits behind the scrollable content in its own layer (position:relative +
// overflow:hidden on the panel) so it doesn't scroll away with the content.
function Overlay({ title, onClose, t, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay-scrim)", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "relative", overflow: "hidden", width: "min(440px, 100%)", height: "100%", display: "flex", flexDirection: "column",
        // Deliberately NOT --glass-bg: that token is tuned near-transparent so
        // cards let the starfield through, which for a full-height overlay
        // means the page underneath competes with the panel's own rows.
        // --overlay-bg is the middle setting: light mode frosts it (a blur
        // does the covering that opacity used to), dark mode stays opaque.
        background: "var(--overlay-bg)", backdropFilter: "blur(var(--overlay-blur))",
        borderLeft: "1px solid var(--hairline)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.25), 0 0 40px rgba(var(--accent-rgb),0.08)",
      }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: "-60px -40px auto -40px", height: 220, background: "radial-gradient(circle at 30% 20%, rgba(var(--accent-rgb),0.2), transparent 60%)", filter: "blur(30px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, overflowY: "auto", padding: "18px 18px 32px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Tag size={18} style={{ color: ACCENT_TEXT }} />
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
            <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto", flexShrink: 0 }} aria-label={t("close")}><X size={18} /></button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// Success confirmation, deliberately a toast and not a ConfirmDialog: adding
// to the grocery list is something you may do several times in a row, and a
// modal demanding a dismiss click each time turns a confirmation into a
// chore. Auto-dismisses. Callers give it a changing `key` so re-showing the
// same message remounts it and restarts the timer.
function Toast({ message, onDone }) {
  // Kept in a ref so an inline arrow from the caller doesn't re-run the
  // effect on every parent render and reset the timer forever.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => doneRef.current(), 2400);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <div role="status" style={{
      position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 95,
      display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "calc(100% - 32px)",
      background: "var(--glass-bg)", backdropFilter: "blur(var(--glass-blur))", WebkitBackdropFilter: "blur(var(--glass-blur))", border: "1px solid var(--glass-border)",
      boxShadow: "var(--glass-card-shadow), 0 0 24px rgba(var(--accent-rgb),0.18)",
      borderRadius: 99, padding: "10px 16px", fontSize: 13, fontWeight: 700, color: INK,
      animation: "toast-in .18s ease", pointerEvents: "none",
    }}>
      <Check size={16} style={{ color: ACCENT_TEXT, flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message}</span>
    </div>
  );
}

// Replaces window.confirm() for every destructive action in the app. Native
// confirm() has a real failure mode: after a couple of them, Chrome (and other
// browsers) offer "Prevent this page from creating additional dialogs" — once a
// user ticks that, every future confirm() on the page silently returns false with
// no dialog at all, which reads as "delete does nothing" everywhere at once.
// zIndex above Overlay's 50 so it can sit on top of a panel that opened it.
// tone/icon default to the original destructive look (solid red, Trash2) so
// every existing call site is unaffected; tone="neutral" is for the rare
// non-destructive confirmation (e.g. "already on your list, add again?"),
// which would lie if it kept the red delete styling.
function ConfirmDialog({ message, confirmLabel, t, onConfirm, onCancel, tone = "danger", icon: Icon = Trash2 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,26,32,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, borderRadius: 14, padding: 20, width: "min(360px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: 14, color: INK, lineHeight: 1.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: 12 }}>{t("cancel")}</button>
          {/* Solid red stays literal in both themes: DANGER lightens for dark
              mode so it reads as text, which would leave white-on-pale here. */}
          <button onClick={onConfirm} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1, padding: 12, borderRadius: 9, border: "none", background: tone === "danger" ? "#DC2626" : TEAL, color: tone === "danger" ? "#fff" : ACCENT_INK, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon size={16} /> {confirmLabel || t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// A div, not a label: most fields here wrap a *group* of controls (the swatch
// grid, the light/dark pair, the language row), and a label forwards a click on
// its caption to the first control inside it. Tapping the words "Accent colour"
// silently picked the first swatch — one Save away from being written to the
// account. Cost of the div: clicking a caption no longer focuses the input in
// the single-input fields.
function Field({ label, children, style }) {
  return (
    // minWidth: 0 overrides the flex-item default of min-width: auto — without
    // it, a Field placed directly in a column flex container (e.g. the
    // inventory add-item card) can't shrink below its content's intrinsic
    // width, and a native <input type="date"> is wide enough on iOS to blow
    // past the card edge even though the input itself is width: 100%.
    <div style={{ display: "block", minWidth: 0, ...style }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ----------------------------- Styles ----------------------------- */
const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: `1px solid ${LINE}`, background: CARD, fontSize: 15, color: INK, outline: "none", fontFamily: "inherit" };
// iOS Safari renders <input type="date">'s calendar-icon/text as native chrome
// that can bleed past the box's own width regardless of CSS width/min-width —
// not a flex or box-sizing bug, appearance:none is what actually stops it
// (the date picker itself still opens on tap).
const dateInput = { ...input, WebkitAppearance: "none", appearance: "none" };
// fontSize 16, not input's 15: below 16px, iOS Safari zooms in on focus and,
// for a <select>, sometimes doesn't fully zoom back out after you pick a
// value — leaving the page clipped/squeezed at the top until you scroll.
const selectStyle = { ...input, width: "auto", padding: "8px 10px", cursor: "pointer", fontWeight: 600, fontSize: 16 };
const addBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 12, padding: "13px 16px", borderRadius: 11, border: "none", background: TEAL, color: ACCENT_INK, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${LINE}`, background: CHIP_BG, color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const categoryLink = { padding: 0, border: "none", background: "none", color: INK, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dangerBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1, padding: "12px", borderRadius: 9, border: `1px solid ${BAD_LINE}`, background: CARD, color: DANGER, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: CHIP_BG, color: SUB, cursor: "pointer" };
// The row overflow ("...") — deliberately not iconBtn. As a chip it claimed as
// much width as a real action for a control that only reveals the row's swipe
// actions, and every row carries one. Bare vertical dots, no fill or border.
// Negative margins on top of the narrow width: the dots themselves are only
// ~4px of the 16px icon, and each row's own flex gap sits outside that again,
// so trimming the box alone still leaves it floating in white space.
const moreBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 28, margin: "0 -4px", padding: 0, border: "none", background: "none", color: SUB, cursor: "pointer", flexShrink: 0 };
// Rounded rather than square-edged: flush square tiles butted right up
// against the card's own rounded corners read as a harsh, bolted-on block
// next to the rest of the app's soft glass aesthetic. A shared radius plus a
// visible gap (see the swipe-reveal wrapper) makes each one its own floating
// pill instead of one hard-edged strip.
const swipeActionBtn = { width: 44, borderRadius: 10, border: "none", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)" };
const menuItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: 7, border: "none", background: "none", color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
const suggestItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", background: "none", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
// Dashed outline sets it apart from the coloured category pills — it's an action, not a category.
const editCatsPill = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 8, border: `1px dashed ${SUB}`, background: "none", color: SUB, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const errorBox = { fontSize: 13, color: BAD_INK, background: BAD_BG, border: `1px solid ${BAD_LINE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 };
const backdrop = { position: "fixed", inset: 0, zIndex: 20 };

// Rounded rectangle, not a capsule — see the app-wide chip/pill radius
// unification. selectablePill (identical shape, unused) was dropped as part
// of the same pass.
function pill(color) {
  return { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, color: "#fff", background: color, fontFamily: "inherit", whiteSpace: "nowrap" };
}
// Same accent-glow recipe as .accent-glow/.swipe-row:hover in index.css —
// baked inline (rather than a className) since these return plain style
// objects, not JSX, so every "selected" pill/chip in the app halos the same
// way as a focused input or an open swipe row.
const ACCENT_GLOW = "0 0 16px rgba(var(--accent-rgb),0.3), 0 0 40px rgba(var(--accent-rgb),0.14)";
// Unified selectable chip: neutral grey when off, brand green when on. Category
// and member tags share it, so the form reads as one system rather than a row of
// clashing coloured outlines.
function chip(active) {
  // Unselected used to be a flat light-gray fill that needed no border to read
  // as a pill; now that it's CARD (white in light mode, dark in night mode) a
  // border keeps it visible against the page background in both themes.
  return { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: active ? "1px solid transparent" : `1px solid ${LINE}`, boxShadow: active ? ACCENT_GLOW : "none", fontFamily: "inherit", color: active ? ACCENT_INK : INK, background: active ? TEAL : CHIP_BG };
}
// A chip that opens a themed popover instead of a native <select> — same menu
// pattern LedgerSwitcher/HeaderMenu already use (CARD surface, active row in
// OK_BG/OK_INK with a check mark), because a native select's option list is
// drawn by the OS, not this page: color-scheme:dark gets it partway on some
// browsers, but the hover highlight is always the system accent colour and
// can't be styled at all — which is exactly the mismatch this replaces.
function FilterDropdown({ icon: Icon, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside(open, () => setOpen(false));
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ ...chip(current.value !== options[0].value), paddingRight: 8 }}>
        <Icon size={13} style={{ flexShrink: 0 }} />
        {current.label}
        <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 170, zIndex: 60 }}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button key={o.value} role="menuitem" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ ...menuItem, background: active ? OK_BG : "none", color: active ? OK_INK : INK }}>
                <span style={{ flex: 1 }}>{o.label}</span>
                {active && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
// One grey track, the active half lifts to green — a proper segmented control.
function segItem(active) {
  return { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", color: active ? ACCENT_INK : SUB, background: active ? TEAL : "transparent" };
}
