import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Plus, Pencil, Trash2, X, Check, Tag,
  Users, User, ArrowLeft, Receipt, ChevronRight, ChevronDown, LogOut, Loader2, Camera, Upload, Menu, BookOpen, PieChart, Store, Languages,
  Home, Plane, Repeat, Pause, Play,
} from "lucide-react";

// Each starter template gets its own mark in the ledger list.
const LEDGER_ICONS = { household: Home, travel: Plane, personal: Users, blank: BookOpen };
const ledgerIcon = (tpl) => LEDGER_ICONS[tpl] || BookOpen;
const MEMBER_ICONS = { user: User, people: Users, home: Home, plane: Plane, book: BookOpen, tag: Tag };
const memberIcon = (icon) => MEMBER_ICONS[icon] || User;
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";
import { settlements, netBalances } from "./lib/settle";
import { nextOccurrence } from "./lib/recurring";

/* ------------------------------------------------------------------ *
 * Household Budget — Step 2: shared, live-synced ledger (Supabase).
 * Auth-gated; both members see one dataset that updates in real time.
 * Same UI as Step 1 (clickable rows + detail panel, dual language).
 * ------------------------------------------------------------------ */

const INK = "#141A20";
const SUB = "#5B6570";
const LINE = "#E4E7EB";
const PAPER = "#F6F7F9";
const TEAL = "#0E9384";

// Members come from the ledger now — a trip splits between whoever came along.
const memberById = (members, id) => members.find((m) => m.id === id) || null;

/* --------------------------- i18n ---------------------------------- */
const STRINGS = {
  en: {
    eyebrow: "Household Ledger",
    signInTitle: "Sign in",
    signInHint: "Use the account set up for your household.",
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
    spentIn: "Spent in {month}",
    settleUp: "Settle up", allSquare: "All square this month 🎉",
    emptyState: "No expenses in {month} yet. Add your first one above.",
    paidByRow: "{name} paid", split5050: "Split 50/50", personal: "Personal",
    uncategorised: "Uncategorised", edit: "Edit", delete: "Delete",
    deleteConfirm: 'Delete "{name}"?',
    stepFooter: "Live-synced across your household · Next: budgets, reports, receipt scanning.",
    loadErr: "Couldn't reach the ledger: {msg}",
    editExpense: "Edit expense", formWhat: "What was it?", formWhatPh: "e.g. Foody groceries",
    amount: "Amount", date: "Date", addHst: "Add 13% HST",
    category: "Category", whoPaid: "Who paid?", paidBy: "Paid by", split: "Split",
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
    budget: "Budget", tripBudget: "Trip budget", budgetFor: "Budget for {month}", budgetTotal: "All categories",
    budgetNone: "No budgets set for {month}. Give any category an amount below.",
    budgetSpent: "Spent", budgetLeft: "Left", budgetOver: "Over budget",
    budgetSave: "Save budgets", budgetClearHint: "Leave a category empty for no budget", setBudgetPh: "Set budget",
    budgetPct: "{pct}% used", budgetOtherMonths: "Other months",
    budgetUncat: "Uncategorised spending isn't counted against any category budget.",
    monthlyReport: "Reports", reportFor: "Spending in {month}",
    reportTotal: "Total spending", reportCategories: "By category",
    reportEmpty: "No spending recorded for this month yet.", reportUncategorised: "Uncategorised",
    categoryExpenses: "Expenses in {category}", categoryExpensesEmpty: "No expenses in this category for this month.",
    splitBetween: "Split", splitWays: "{n} ways · {amount} each", splitWaysShort: "Split {n} ways",
    items: "Receipt items", itemSplit: "Split", itemPersonal: "Personal", itemDrop: "Not mine",
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
    recurring: "Recurring expenses", recurringAdd: "Add new", noRecurring: "No recurring expenses yet.",
    recurNew: "New recurring expense", recurEdit: "Edit recurring expense",
    freqWeekly: "Weekly", freqMonthly: "Monthly", freqYearly: "Yearly", frequency: "Frequency",
    startDate: "Start date", nextDue: "Next due", paused: "Paused",
    pauseRule: "Pause", resumeRule: "Resume", saveRule: "Save",
    recurDeleteConfirm: "Delete this recurring rule? Expenses it already created stay.",
    newMemberPh: "New member name", saveMembers: "Save members", deleteMember: "Remove member",
    receiptTitle: "Receipt items",
    receiptEmpty: "No receipt attached yet. When you scan a receipt, its line items will show up here.",
    scanReceipt: "Scan receipt", uploadReceipt: "Upload receipt", scanning: "Reading receipt…",
    scanHint: "or fill it in yourself", scanFailed: "Couldn't read that receipt: {msg}",
    editCategories: "Edit categories", menu: "Menu",
    ledgers: "Ledgers", ledgersHint: "Pick a ledger, or start a new one.",
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
    exit: "Exit", language: "Language", openLedger: "Open {name}",
    startWith: "Start with", tplHousehold: "Household", tplTravel: "Travel",
    tplPersonal: "Personal", tplBlank: "Blank",
    tplHint: "{n} categories — you can rename or add more later",
    tplHintBlank: "No categories — add your own from inside the ledger",
    deleteLedger: "Delete ledger", renameLedger: "Rename ledger",
    deleteLedgerConfirm: 'Delete "{name}" and every expense in it? This cannot be undone.',
  },
  zh: {
    eyebrow: "家庭帳簿",
    signInTitle: "登入",
    signInHint: "使用為你們家庭設定的帳戶登入。",
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
    spentIn: "{month}支出",
    settleUp: "結算", allSquare: "本月已結清 🎉",
    emptyState: "{month}還沒有支出，先在上方新增一筆。",
    paidByRow: "{name} 已付", split5050: "平分 50/50", personal: "個人",
    uncategorised: "未分類", edit: "修改", delete: "刪除",
    deleteConfirm: "確定刪除「{name}」？",
    stepFooter: "已與家庭即時同步 · 下一步：預算、報表、收據掃描。",
    loadErr: "無法連接帳簿：{msg}",
    editExpense: "修改支出", formWhat: "支出項目", formWhatPh: "例如：買餸",
    amount: "金額", date: "日期", addHst: "加 13% 稅（HST）",
    category: "類別", whoPaid: "付款人", paidBy: "付款人", split: "分帳",
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
    budget: "預算", tripBudget: "旅程預算", budgetFor: "{month}預算", budgetTotal: "所有類別",
    budgetNone: "{month}未設預算。喺下面任何一個類別填個數就得。",
    budgetSpent: "已用", budgetLeft: "剩餘", budgetOver: "超出預算",
    budgetSave: "儲存預算", budgetClearHint: "留空即該類別冇預算", setBudgetPh: "設定預算",
    budgetPct: "已用 {pct}%", budgetOtherMonths: "其他月份",
    budgetUncat: "未分類嘅支出唔會計入任何類別預算。",
    monthlyReport: "每月報告", reportFor: "{month}支出", reportTotal: "總支出", reportCategories: "按類別",
    reportEmpty: "這個月尚未有支出紀錄。", reportUncategorised: "未分類",
    categoryExpenses: "{category}支出", categoryExpensesEmpty: "這個月此類別尚未有支出。",
    splitBetween: "分帳", splitWays: "{n} 人分 · 每人 {amount}", splitWaysShort: "{n} 人分",
    items: "收據明細", itemSplit: "分帳", itemPersonal: "私人", itemDrop: "唔計",
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
    recurring: "定期支出", recurringAdd: "新增", noRecurring: "仲未有定期支出。",
    recurNew: "新增定期支出", recurEdit: "編輯定期支出",
    freqWeekly: "每週", freqMonthly: "每月", freqYearly: "每年", frequency: "頻率",
    startDate: "開始日期", nextDue: "下次", paused: "已暫停",
    pauseRule: "暫停", resumeRule: "恢復", saveRule: "儲存",
    recurDeleteConfirm: "刪除呢條定期規則？佢已經產生嘅支出會保留。",
    newMemberPh: "新成員名稱", saveMembers: "儲存成員", deleteMember: "移除成員",
    receiptTitle: "收據項目",
    receiptEmpty: "尚未附上收據。掃描收據後，明細項目會顯示在這裡。",
    scanReceipt: "掃描收據", uploadReceipt: "上載收據", scanning: "讀取收據中…",
    scanHint: "或自己填寫", scanFailed: "讀唔到張收據：{msg}",
    editCategories: "編輯類別", menu: "選單",
    ledgers: "帳簿", ledgersHint: "揀一本帳簿，或者開一本新嘅。",
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
    noLedgers: "仲未有帳簿。喺下面建立第一本。",
    exit: "離開", language: "語言", openLedger: "開啟{name}",
    startWith: "起始類別", tplHousehold: "家用", tplTravel: "旅行",
    tplPersonal: "個人", tplBlank: "空白",
    tplHint: "{n} 個類別 — 之後可以改名或者加",
    tplHintBlank: "冇類別 — 入咗帳簿之後自己加",
    deleteLedger: "刪除帳簿", renameLedger: "重新命名帳簿",
    deleteLedgerConfirm: '刪除「{name}」同入面所有支出？此操作無法復原。',
  },
};
const interpolate = (str, vars) =>
  vars ? str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`)) : str;
const makeT = (lang) => (key, vars) =>
  interpolate((STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key, vars);
const dateLocale = (lang) => (lang === "zh" ? "zh-Hant" : "en-CA");
// Category names are deliberately language-neutral — one name, shown as-is in both
// EN and 繁中. `lang` is still accepted so call sites read consistently with the
// rest of the UI, which does translate.
const catName = (c) => (!c ? "" : c.name || c.nameZh || "");

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (n) => CAD.format(Number(n || 0));
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthOf = (iso) => (iso || "").slice(0, 7);
const monthName = (m, lang) =>
  new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });
const shortDate = (iso, lang) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" });

const getLang = () => {
  try { const l = localStorage.getItem("lang"); if (l === "en" || l === "zh") return l; } catch {}
  return "en";
};

/* ============================ Root ================================= */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined=checking, null=logged out
  const [lang, setLang] = useState(getLang);
  const changeLang = (l) => { setLang(l); try { localStorage.setItem("lang", l); } catch {} };
  const t = makeT(lang);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // No ledger picked = the picker is home. Exiting a ledger comes back here.
  const [ledger, setLedger] = useState(null);

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
  if (!session) return <Login lang={lang} changeLang={changeLang} t={t} hasInvite={!!inviteToken} />;
  if (inviteToken) return <AcceptInvite token={inviteToken} lang={lang} changeLang={changeLang} t={t} onResult={finishInvite} />;
  if (!ledger) return <LedgerPicker lang={lang} changeLang={changeLang} t={t} onOpen={setLedger} currentUserId={session.user.id}
    inviteMsg={inviteMsg} onDismissInvite={() => setInviteMsg(null)} />;
  return <Ledger ledger={ledger} currentUserId={session.user.id} onExit={() => setLedger(null)} onSwitchLedger={setLedger} lang={lang} changeLang={changeLang} t={t} />;
}

function Centered({ children }) {
  return (
    <div style={{ background: PAPER, minHeight: 420, display: "grid", placeItems: "center", color: SUB, fontFamily: "Inter, system-ui, sans-serif", gap: 10 }}>
      <Loader2 size={22} className="spin" style={{ color: TEAL }} />
      <div>{children}</div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ============================ Login =============================== */
function Login({ lang, changeLang, t, hasInvite }) {
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
    <div style={{ background: PAPER, minHeight: 520, display: "grid", placeItems: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 20 }}>
      <div style={{ width: "min(360px, 100%)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: TEAL, fontWeight: 700 }}>{t("eyebrow")}</div>
          <LangToggle lang={lang} changeLang={changeLang} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{signup ? t("signUpTitle") : t("signInTitle")}</h1>
        <p style={{ fontSize: 13, color: SUB, margin: "0 0 16px" }}>{signup ? t("signUpHint") : t("signInHint")}</p>

        {signup && (
          <Field label={nameRequired ? `${t("nameLabel")} *` : t("nameLabel")}>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={t("namePh")} style={input} />
            {nameEqualsEmail ? (
              <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{t("usernameSameAsEmailErr")}</div>
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
        {notice && <div style={{ background: "#E3F5F2", border: "1px solid #B8E4DD", color: "#0F5E55", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginTop: 4, fontWeight: 600 }}>{notice}</div>}

        <button onClick={submit} disabled={busy || !email || !pw || (nameRequired && !name.trim()) || nameEqualsEmail}
          style={{ ...addBtn, opacity: busy || !email || !pw || (nameRequired && !name.trim()) || nameEqualsEmail ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
          {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />} {signup ? t("signUpBtn") : t("signInBtn")}
        </button>

        <button onClick={swap} style={{ display: "block", width: "100%", marginTop: 12, padding: 4, border: "none", background: "none", color: TEAL, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
function AcceptInvite({ token, lang, changeLang, t, onResult }) {
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
    <div style={{ background: PAPER, minHeight: 520, display: "grid", placeItems: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 20 }}>
      <div style={{ width: "min(380px, 100%)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: TEAL, fontWeight: 700 }}>{t("inviteTitle")}</div>
          <LangToggle lang={lang} changeLang={changeLang} />
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
              <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: "#E3F5F2", color: "#0F5E55", flexShrink: 0 }}><Users size={20} /></span>
              <p style={{ fontSize: 15, margin: 0, color: INK, lineHeight: 1.45 }}>
                {preview.ledgerName
                  ? t("invitePromptNamed", { ledger: preview.ledgerName, role: roleName })
                  : t("invitePrompt")}
              </p>
            </div>
            <button onClick={accept} disabled={busy} style={{ ...addBtn, marginTop: 0, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
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
function LedgerPicker({ lang, changeLang, t, onOpen, inviteMsg, onDismissInvite, currentUserId }) {
  const [ledgers, setLedgers] = useState(null); // null = still loading
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("household");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setError(""); setLedgers(await db.fetchLedgers()); }
    catch (e) { setError(e.message || String(e)); setLedgers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.subscribeLedgerList(() => load()), [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await db.createLedger(trimmed, template);
      setName("");
      onOpen(created); // drop straight into the ledger you just made
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

  // Renaming happens in place: the row swaps its open-button for an input so the
  // whole row can't double as "open this ledger" while you're typing in it.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftTpl, setDraftTpl] = useState("household");
  const startRename = (l) => {
    if (l.ownerId !== currentUserId) { setError(t("ownerOnlyErr")); return; }
    setEditingId(l.id); setDraft(l.name); setDraftTpl(l.template);
  };
  const cancelRename = () => { setEditingId(null); setDraft(""); };
  const saveRename = async (l) => {
    const trimmed = draft.trim();
    if (!trimmed) return cancelRename();
    if (trimmed === l.name && draftTpl === l.template) return cancelRename();
    try { await db.updateLedger(l.id, { name: trimmed, template: draftTpl }); cancelRename(); load(); }
    catch (e) { setError(e.message || String(e)); cancelRename(); }
  };

  if (ledgers === null) return <Centered>{t("connecting")}</Centered>;

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.4 }}>{t("ledgers")}</h1>
          {/* Same overflow menu as inside a ledger, minus the entries that need one. */}
          <HeaderMenu t={t} lang={lang} changeLang={changeLang} />
        </div>
        <p style={{ fontSize: 13, color: SUB, margin: "6px 0 16px" }}>{t("ledgersHint")}</p>

        {inviteMsg && (
          <div onClick={onDismissInvite} style={{ cursor: "pointer", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12,
            background: inviteMsg.ok ? "#E3F5F2" : "#FEF2F2", border: `1px solid ${inviteMsg.ok ? "#B8E4DD" : "#FECACA"}`, color: inviteMsg.ok ? "#0F5E55" : "#B91C1C", fontWeight: 600 }}>
            {inviteMsg.text}
          </div>
        )}

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ledgers.length === 0 && (
            <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "26px 18px", textAlign: "center", color: SUB, fontSize: 13 }}>
              <BookOpen size={22} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>{t("noLedgers")}</div>
            </div>
          )}
          {ledgers.map((l) => {
            return (
            <div key={l.id}>
              {editingId === l.id ? (
                <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(l); if (e.key === "Escape") cancelRename(); }}
                      style={{ ...input, flex: 1, fontWeight: 700 }} />
                    <button onClick={() => saveRename(l)} style={{ ...iconBtn, color: TEAL }} aria-label={t("saveChanges")}><Check size={16} /></button>
                    <button onClick={cancelRename} style={iconBtn} aria-label={t("cancel")}><X size={15} /></button>
                  </div>
                  {/* Icon is editable here too, otherwise ledgers made before this
                      existed would be stuck with the default mark. */}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {["household", "travel", "personal", "blank"].map((k) => {
                      const Icon = ledgerIcon(k);
                      return (
                        <button key={k} onClick={() => setDraftTpl(k)} aria-label={t("tpl" + k[0].toUpperCase() + k.slice(1))}
                          style={{ ...iconBtn, width: 38, height: 38, borderColor: draftTpl === k ? TEAL : LINE, background: draftTpl === k ? TEAL : "#fff", color: draftTpl === k ? "#fff" : SUB }}>
                          <Icon size={16} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => onOpen(l)} aria-label={t("openLedger", { name: l.name })}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "15px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    {(() => { const Icon = ledgerIcon(l.template); return <Icon size={17} style={{ color: TEAL, flexShrink: 0 }} />; })()}
                    <span style={{ fontSize: 15, fontWeight: 700, color: INK, flex: 1 }}>{l.name}</span>
                    <ChevronRight size={17} style={{ color: SUB }} />
                  </button>
                  <button onClick={() => startRename(l)} style={iconBtn} aria-label={t("renameLedger")}><Pencil size={15} /></button>
                  <button onClick={() => remove(l)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteLedger")}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 16, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("startWith")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["household", "travel", "personal", "blank"].map((k) => (
              <button key={k} onClick={() => setTemplate(k)} style={selectablePill(TEAL, template === k)}>
                {t("tpl" + k[0].toUpperCase() + k.slice(1))}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: SUB, margin: "8px 0 12px" }}>
            {db.TEMPLATES[template].length
              ? `${t("tplHint", { n: db.TEMPLATES[template].length })} · ${db.TEMPLATES[template].map((c) => c.name).join(", ")}`
              : t("tplHintBlank")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={t("newLedgerPh")} style={{ ...input, flex: 1 }} />
          <button onClick={create} disabled={!name.trim() || busy}
            style={{ ...addBtn, width: "auto", flexShrink: 0, marginTop: 0, whiteSpace: "nowrap", opacity: !name.trim() || busy ? 0.5 : 1, cursor: !name.trim() || busy ? "not-allowed" : "pointer" }}>
            {busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} {t("createLedger")}
          </button>
        </div>
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
      {confirmDelete && <ConfirmDialog t={t} message={t("deleteLedgerConfirm", { name: confirmDelete.name })} onConfirm={doDelete} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

// Per-template feature toggles (db.TEMPLATE_FEATURES) as a hook so call sites
// read like ledger.features rather than reaching into db directly.
function useLedgerFeatures(ledger) {
  return useMemo(() => db.featuresFor(ledger.template), [ledger.template]);
}

// Loads every ledger the signed-in user can open (RLS already scopes this to
// owned + shared — no client-side filtering needed) and owns the dropdown's
// open/close state, so the header component below just renders.
function useLedgerSwitcher(currentId) {
  const [ledgers, setLedgers] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { db.fetchLedgers().then(setLedgers).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { ledgers, currentId, open, setOpen };
}

// Replaces the static ledger-name heading: click it to switch ledgers in place,
// no exit-to-picker round trip. "+ Create ledger" still hands off to the picker,
// which already has the template chooser — no need to duplicate that here.
function LedgerSwitcher({ ledger, onSwitch, onCreateNew, t }) {
  const { ledgers, open, setOpen } = useLedgerSwitcher(ledger.id);
  const select = (l) => { setOpen(false); if (l.id !== ledger.id) onSwitch(l); };
  return (
    <div className="ledger-switcher" style={{ position: "relative", minWidth: 150, flex: "1 1 auto" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.4, minWidth: 0, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: INK }}>
          {ledger.name}
        </h1>
        {/* Caret hugs the title (title is flex:0 1 auto so it doesn't stretch and
            shove the arrow to the far edge) — a clear "this opens" cue. */}
        <ChevronDown size={20} strokeWidth={2.5} style={{ color: TEAL, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 220, maxWidth: 320, zIndex: 60 }}>
          {ledgers.map((l) => {
            const Icon = ledgerIcon(l.template);
            const active = l.id === ledger.id;
            return (
              <button key={l.id} role="menuitem" onClick={() => select(l)}
                style={{ ...menuItem, background: active ? "#E3F5F2" : "none", color: active ? "#0F5E55" : INK }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                {active && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />
          <button role="menuitem" onClick={() => { setOpen(false); onCreateNew(); }} style={{ ...menuItem, color: TEAL }}>
            <Plus size={15} /> {t("createLedger")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================ Ledger ============================== */
function Ledger({ ledger, currentUserId, onExit, onSwitchLedger, lang, changeLang, t }) {
  const isOwner = ledger.ownerId === currentUserId; // only owners may manage access
  const features = useLedgerFeatures(ledger);
  // "Monthly" framing doesn't fit a trip — a travel ledger's budget is one lump
  // sum for the whole trip, not a per-month allowance like every other template.
  const budgetLabel = ledger.template === "travel" ? t("tripBudget") : t("budget");
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const [month, setMonth] = useState(monthOf(todayISO()));
  const [editing, setEditing] = useState(null);   // null | "new" | expense
  const [detail, setDetail] = useState(null);      // null | expense
  const [managingCats, setManagingCats] = useState(false);
  const [managingMembers, setManagingMembers] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState(false);
  const [budgets, setBudgets] = useState(new Map());
  const [merchants, setMerchants] = useState([]);
  const [managingStores, setManagingStores] = useState(false);
  const [allLedgers, setAllLedgers] = useState([]);

  const refresh = useCallback(async () => {
    try {
      setError("");
      // Materialise any due recurring occurrences before reading expenses, so they
      // show up in this same load. Best-effort: a viewer can't insert, and a hiccup
      // here shouldn't block the ledger from opening.
      await db.generateDueRecurring(ledger.id).catch(() => {});
      // No lazy seeding here — categories are seeded from the chosen template when
      // the ledger is created, so an intentionally blank ledger stays blank.
      const [cats, exps, mems, buds, shops, leds] = await Promise.all([
        db.fetchCategories(ledger.id), db.fetchExpenses(ledger.id),
        db.fetchMembers(ledger.id), db.fetchBudgets(ledger.id), db.fetchMerchants(ledger.id),
        db.fetchLedgers(), // for sending personal receipt items elsewhere
      ]);
      setAllLedgers(leds);
      setMembers(mems);
      setBudgets(buds);
      setMerchants(shops);
      setCategories(cats);
      setExpenses(exps);
      setReady(true);
    } catch (e) {
      setError(e.message || String(e));
      setReady(true);
    }
  }, [ledger.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => db.subscribeLedger(() => refresh()), [refresh]); // live sync

  const catById = (id) => categories.find((c) => c.id === id);

  // Spend per category for the month on screen, for the budget bars.
  const spentByCategory = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      if (monthOf(e.date) !== month || !e.categoryId) continue;
      m.set(e.categoryId, (m.get(e.categoryId) || 0) + (Number(e.amount) || 0));
    }
    return m;
  }, [expenses, month]);

  const saveBudgets = async (entries) => {
    try {
      for (const { categoryId, amount } of entries) await db.setBudget(ledger.id, categoryId, month, amount);
      setBudgets(await db.fetchBudgets(ledger.id));
    } catch (e) { setError(e.message); }
  };

  const upsertExpense = async (draft, rememberName, personal) => {
    try {
      if (rememberName) await db.rememberMerchant(ledger.id, rememberName);
      if (draft.id) await db.updateExpense(draft.id, draft);
      else await db.insertExpense(draft, ledger.id);
      if (personal) await db.insertPersonalExpense(personal, memberById(members, draft.paidById)?.name);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  };
  const removeExpense = async (id) => { try { await db.deleteExpense(id); refresh(); } catch (e) { setError(e.message); } };
  const reassign = async (id, categoryId) => { try { await db.setExpenseCategory(id, categoryId); refresh(); } catch (e) { setError(e.message); } };
  const commitCategories = async (list) => { try { setCategories(await db.persistCategories(list, categories, ledger.id)); } catch (e) { setError(e.message); } };
  // Removing someone who still has expenses is refused by the FK, so the error
  // surfaces here rather than silently dropping who paid for what.
  const commitStores = async (list) => { try { setMerchants(await db.persistMerchants(list, merchants, ledger.id)); } catch (e) { setError(e.message); } };
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
    () => expenses.filter((e) => monthOf(e.date) === month).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses, month]
  );

  const summary = useMemo(() => {
    let total = 0;
    const paid = new Map(members.map((m) => [m.id, 0]));
    const sharedShare = new Map(members.map((m) => [m.id, 0]));
    for (const e of rows) {
      const amt = Number(e.amount) || 0;
      total += amt;
      if (paid.has(e.paidById)) paid.set(e.paidById, paid.get(e.paidById) + amt);
      if (e.split === "shared") {
        const sharers = (e.sharedWith || []).filter((id) => sharedShare.has(id));
        if (sharers.length) for (const id of sharers) sharedShare.set(id, sharedShare.get(id) + amt / sharers.length);
      }
    }
    return { total, paid, sharedShare, balances: netBalances(rows, members), transfers: settlements(rows, members) };
  }, [rows, members]);

  if (!ready) return <Centered>{t("connecting")}</Centered>;
  const label = monthName(month, lang);

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      <style>{`
        .exp-row { display:grid !important; grid-template-columns:minmax(0, 1fr) auto; grid-template-rows:auto auto; column-gap:12px; row-gap:7px; transition:background .12s ease; }
        .exp-main { grid-column:1; grid-row:1; min-width:0; }
        .exp-meta { grid-column:1 / -1; grid-row:2; min-width:0; }
        .exp-total { grid-column:2; grid-row:1; align-self:center; }
        .exp-row:hover { background: #FAFBFC; }
        .exp-row:focus-visible { background: #F1F5F4; box-shadow: inset 3px 0 0 ${TEAL}; }
        @media (max-width: 560px) {
          .ledger-switcher { flex-basis:100%; }
          .ledger-controls { width:100%; justify-content:flex-end; margin-left:0 !important; }
          .exp-row { padding:14px !important; }
        }
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        {/* minWidth keeps the title from shrinking to a stub, so on a narrow screen
            the controls wrap to their own line; marginLeft:auto then holds them
            against the right edge instead of falling back to the left. */}
        <div className="ledger-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <LedgerSwitcher ledger={ledger} onSwitch={onSwitchLedger} onCreateNew={onExit} t={t} />
          <div className="ledger-controls" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <button onClick={onExit} style={ghostBtn} aria-label={t("exit")}>
              <ArrowLeft size={15} /> {t("exit")}
            </button>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("selectMonth")} style={selectStyle}>
              {monthsAvailable.map((m) => (
                <option key={m} value={m}>{new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" })}</option>
              ))}
            </select>
            <HeaderMenu t={t} lang={lang} changeLang={changeLang} onBudget={() => setShowBudget(true)} onReport={() => setShowReport(true)}
              onStores={() => setManagingStores(true)} budgetLabel={budgetLabel}
              onManageMembers={features.showSplit ? () => setShowManageMembers(true) : undefined}
              onRecurring={features.hasRecurring ? () => setShowRecurring(true) : undefined} />
          </div>
        </div>

        {error && <div style={errorBox}>{t("loadErr", { msg: error })}</div>}

        {/* Summary / settlement */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: SUB, fontWeight: 600 }}>{t("spentIn", { month: label })}</span>
          <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(summary.total)}</span>
        </div>

        <SettlementBar transfers={summary.transfers} members={members} t={t} onClick={() => setShowSettlement(true)} />

        <button onClick={() => setEditing("new")} style={addBtn}><Plus size={18} /> {t("addExpense")}</button>

        {/* List */}
        <div style={{ marginTop: 14, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: SUB }}>
              <Receipt size={26} style={{ opacity: 0.4 }} />
              <p style={{ margin: "10px 0 0" }}>{t("emptyState", { month: label })}</p>
            </div>
          ) : (
            rows.map((e, i) => {
              const cat = catById(e.categoryId);
              const payer = memberById(members, e.paidById);
              return (
                <div key={e.id} className="exp-row" role="button" tabIndex={0}
                  onClick={() => setDetail(e)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDetail(e); } }}
                  style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`, cursor: "pointer", outline: "none" }}>
                  <div className="exp-main">
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.description}</div>
                  </div>
                  <div className="exp-total" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(e.amount)}</div>
                    <ChevronRight size={17} style={{ color: "#B7BEC6" }} />
                  </div>
                  <div className="exp-meta" style={{ fontSize: 12, color: SUB, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 8px", borderRadius: 99, background: "#E3F5F2", color: "#0F5E55", fontSize: 11, fontWeight: 700 }}>
                      {cat ? catName(cat, lang) : t("uncategorised")}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{shortDate(e.date, lang)}</span>
                    <span aria-hidden="true">·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: payer?.color || SUB }} />
                      {payer?.name || "—"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: e.split === "shared" ? TEAL : SUB }}>
                      {e.split === "shared" ? <Users size={11} /> : <User size={11} />}
                      {e.split === "shared" ? t("splitWaysShort", { n: (e.sharedWith || []).length }) : t("personal")}
                    </span>
                    {e.recurringRuleId && (
                      <span title={t("recurring")} aria-label={t("recurring")} style={{ display: "inline-flex", alignItems: "center", color: "#94A3B8" }}>
                        <Repeat size={12} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p style={{ fontSize: 12, color: SUB, marginTop: 14, textAlign: "center" }}>{t("stepFooter")}</p>
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
          merchants={merchants} ledgers={allLedgers} lang={lang} t={t}
          onClose={() => setEditing(null)} onSave={upsertExpense} onEditMembers={() => setManagingMembers(true)}
          onEditCategories={() => setManagingCats(true)} defaultMonth={month} />
      )}
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
        <BudgetPanel month={month} monthLabel={label} categories={categories} expenses={expenses} budgets={budgets} lang={lang}
          spentByCategory={spentByCategory} spent={summary.total} t={t} title={budgetLabel}
          onSave={saveBudgets} onClose={() => setShowBudget(false)} />
      )}
      {showReport && (
        <MonthlyReport month={month} months={monthsAvailable} expenses={expenses} categories={categories}
          lang={lang} t={t} onMonthChange={setMonth} onClose={() => setShowReport(false)} />
      )}
      {showSettlement && <SettlementDetails members={members} summary={summary} t={t} onClose={() => setShowSettlement(false)} />}
      {showManageMembers && <ManageMembersModal ledger={ledger} isOwner={isOwner} t={t} onClose={() => setShowManageMembers(false)} />}
      {showRecurring && <RecurringPanel ledger={ledger} categories={categories} members={members} lang={lang} t={t}
        onClose={() => setShowRecurring(false)} onChanged={refresh} />}
    </div>
  );
}

/* ----------------------------- Pieces ----------------------------- */

function LangToggle({ lang, changeLang }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${LINE}`, borderRadius: 9, overflow: "hidden" }}>
      {[["en", "EN"], ["zh", "繁中"]].map(([l, lbl]) => (
        <button key={l} onClick={() => changeLang(l)} style={{ padding: "8px 11px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: lang === l ? TEAL : "#fff", color: lang === l ? "#fff" : SUB }}>{lbl}</button>
      ))}
    </div>
  );
}

// Shows the single largest transfer as plain "X owes Y $n"; the full list (there
// can be several with 3+ members) lives in the SettlementDetails panel this opens.
function SettlementBar({ transfers, members, t, onClick }) {
  const settled = transfers.length === 0;
  const first = transfers[0];
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", marginBottom: 14, border: `1px solid ${settled ? LINE : "#B8E4DD"}`, borderRadius: 12, background: settled ? "#F1F3F5" : "#E3F5F2", color: INK, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 800, color: settled ? SUB : "#0F5E55", background: settled ? "#E4E7EB" : "#C7EBE4", padding: "3px 8px", borderRadius: 6, flexShrink: 0 }}>{t("settleUp")}</span>
      <span style={{ flex: 1, fontWeight: 700, minWidth: 0 }}>
        {settled ? t("allSquare") : t("owesLine", { debtor: memberById(members, first.fromId)?.name || "—", creditor: memberById(members, first.toId)?.name || "—", amount: money(first.amount) })}
      </span>
      <ChevronRight size={18} style={{ color: settled ? SUB : "#0F5E55", flexShrink: 0 }} />
    </button>
  );
}

function SettlementDetails({ members, summary, t, onClose }) {
  return (
    <Overlay title={t("settlementDetails")} t={t} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((member) => {
          const balance = summary.balances.get(member.id) || 0;
          const receiving = balance > 0.005;
          const paying = balance < -0.005;
          return (
            <div key={member.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: member.color }} /> {member.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div><div style={{ fontSize: 11, color: SUB, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("paidThisMonth")}</div><div style={{ fontWeight: 800, marginTop: 3 }}>{money(summary.paid.get(member.id) || 0)}</div></div>
                <div><div style={{ fontSize: 11, color: SUB, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("sharedShare")}</div><div style={{ fontWeight: 800, marginTop: 3 }}>{money(summary.sharedShare.get(member.id) || 0)}</div></div>
              </div>
              {(receiving || paying) && <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10, fontSize: 13, fontWeight: 700, color: receiving ? TEAL : "#C2410C" }}>{receiving ? t("shouldReceive") : t("shouldPay")}: {money(Math.abs(balance))}</div>}
            </div>
          );
        })}
      </div>
      {summary.transfers.length === 0 ? <div style={{ color: SUB, fontSize: 13 }}>{t("noSharedBills")}</div> : (
        <div style={{ background: "#E3F5F2", color: "#0F5E55", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700 }}>
          {summary.transfers.map((transfer, index) => <div key={index}>{t("owesLine", { debtor: memberById(members, transfer.fromId)?.name || "—", creditor: memberById(members, transfer.toId)?.name || "—", amount: money(transfer.amount) })}</div>)}
        </div>
      )}
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
        {rosterErr && <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 8 }}>{rosterErr}</div>}
        {!roster ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: SUB, fontSize: 13, padding: "8px 0" }}><Loader2 size={15} className="spin" /> {t("connecting")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {roster.map((m) => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", opacity: busyUser === m.userId ? 0.6 : 1 }}>
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
                    <button disabled={busyUser === m.userId} onClick={() => removeOne(m)} style={{ ...iconBtn, color: "#DC2626", flexShrink: 0 }} aria-label={t("removeMemberBtn")}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
            {/* Invites nobody has redeemed yet — no user_id exists for these, so
                there's nothing to change roles on, only revoke. */}
            {pending.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FAFBFC", border: `1px dashed ${LINE}`, borderRadius: 10, padding: "9px 10px", opacity: busyInvite === inv.id ? 0.6 : 1 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email || t("openInviteLink")}</div>
                  <span style={{ ...pill("#D97706"), fontSize: 10, marginTop: 2, display: "inline-block" }}>{t("pendingInvite")}</span>
                </span>
                <span style={{ ...pill("#94A3B8"), fontSize: 11, flexShrink: 0 }}>{inv.role === "VIEWER" ? t("roleViewer") : t("roleEditor")}</span>
                <button disabled={busyInvite === inv.id} onClick={() => revoke(inv)} style={{ ...iconBtn, color: "#DC2626", flexShrink: 0 }} aria-label={t("revokeInviteBtn")}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
        <Field label={t("invitePeople")}>
          <div style={{ display: "flex", gap: 3, background: "#EEF0F2", borderRadius: 10, padding: 3 }}>
            <button onClick={() => { setRole("EDITOR"); setLink(""); }} style={segItem(role === "EDITOR")}>{t("roleEditor")}</button>
            <button onClick={() => { setRole("VIEWER"); setLink(""); }} style={segItem(role === "VIEWER")}>{t("roleViewer")}</button>
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{role === "EDITOR" ? t("roleEditorHint") : t("roleViewerHint")}</div>
        </Field>
        <Field label={t("inviteEmailLabel")}>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setLink(""); }} placeholder="name@example.com" style={input} />
          <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{t("inviteEmailHint")}</div>
        </Field>
        {err && <div style={{ color: "#DC2626", fontSize: 13 }}>{err}</div>}
        {!link ? (
          <button onClick={generate} disabled={busy || !emailValid} style={{ ...addBtn, justifyContent: "center", opacity: busy || !emailValid ? 0.6 : 1, cursor: busy ? "wait" : !emailValid ? "not-allowed" : "pointer" }}>
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
function RecurringPanel({ ledger, categories, members, lang, t, onClose, onChanged }) {
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
    try { await db.upsertRecurringRule(rule, ledger.id); setEditing(null); await after(); }
    catch (e) { setErr(e.message || String(e)); }
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
    return <RecurringForm initial={editing === "new" ? null : editing} categories={categories} members={members}
      lang={lang} t={t} onClose={() => setEditing(null)} onSave={save} />;
  }

  return (
    <Overlay onClose={onClose} title={t("recurring")} t={t}>
      <button onClick={() => setEditing("new")} style={{ ...addBtn, marginTop: 0, justifyContent: "center" }}>
        <Plus size={18} /> {t("recurringAdd")}
      </button>
      {err && <div style={{ color: "#DC2626", fontSize: 13 }}>{err}</div>}
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
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, opacity: busyId === r.id ? 0.6 : 1 }}>
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
                  <button onClick={() => remove(r)} disabled={busyId === r.id} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteStore")}><Trash2 size={15} /></button>
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
function RecurringForm({ initial, categories, members, lang, t, onClose, onSave }) {
  const [d, setD] = useState(() => initial || {
    description: "", amount: "", categoryId: categories[0]?.id || null,
    paidById: members[0]?.id || null, split: "shared", sharedWith: members.map((m) => m.id),
    frequency: "monthly", startDate: todayISO(),
  });
  const [busy, setBusy] = useState(false);

  const sharerCount = d.split === "shared" ? (d.sharedWith || []).length : 0;
  const valid = d.description.trim() && Number(d.amount) > 0 && d.startDate && d.paidById
    && (d.split !== "shared" || sharerCount > 0) && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    await onSave({ ...d, description: d.description.trim(), amount: Number(d.amount) });
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
          <input type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} style={input} />
        </Field>
      </div>
      <Field label={t("frequency")}>
        <div style={{ display: "flex", gap: 3, background: "#EEF0F2", borderRadius: 10, padding: 3 }}>
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
        <div style={{ display: "flex", gap: 3, background: "#EEF0F2", borderRadius: 10, padding: 3 }}>
          <button onClick={() => setD({ ...d, split: "personal" })} style={segItem(d.split === "personal")}><User size={14} /> {t("personal")}</button>
          <button onClick={() => setD({ ...d, split: "shared", sharedWith: d.sharedWith?.length ? d.sharedWith : members.map((m) => m.id) })} style={segItem(d.split === "shared")}>
            <Users size={14} /> {t("splitBetween")}
          </button>
        </div>
        {d.split === "shared" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 10 }}>
            {members.map((m) => {
              const on = (d.sharedWith || []).includes(m.id);
              const Icon = memberIcon(m.icon);
              return (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  <input type="checkbox" checked={on}
                    onChange={() => setD({ ...d, sharedWith: on ? d.sharedWith.filter((x) => x !== m.id) : [...(d.sharedWith || []), m.id] })}
                    style={{ width: 17, height: 17, accentColor: TEAL, flexShrink: 0 }} />
                  <Icon size={14} style={{ color: SUB }} /> {m.name}
                </label>
              );
            })}
          </div>
        )}
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "12px" }}>{t("cancel")}</button>
        <button onClick={submit} disabled={!valid} style={{ ...addBtn, flex: 2, marginTop: 0, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
          {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("saveRule")}
        </button>
      </div>
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
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(amt)}</div>
        <div style={{ fontSize: 13, color: shared ? TEAL : SUB, fontWeight: 600, marginTop: 2 }}>
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
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "2px 14px" }}>
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
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
            {expense.items.map((i, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 14px", borderTop: idx === 0 ? "none" : `1px solid ${LINE}`, fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                <span style={{ color: SUB, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{money(i.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: `1px dashed ${LINE}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", color: SUB, background: "#fff" }}>
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

function ExpenseForm({ initial, categories, members, merchants, ledgers = [], lang, t, onClose, onSave, onEditMembers, onEditCategories, defaultMonth, features }) {
  // Personal-template ledgers (features.showSplit false) have no one to split
  // with — the payer is just whoever's account this is, silently the first
  // member, and every expense is personal. Nothing left to ask about.
  const [d, setD] = useState(() => initial || {
    description: "", amount: "", categoryId: categories[0]?.id || null,
    date: `${defaultMonth}-15`, note: "", paidById: members[0]?.id || null,
    split: features.showSplit ? "shared" : "personal",
    sharedWith: members.map((m) => m.id), // everyone by default; untick who wasn't there
  });
  const [addHst, setAddHst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [remember, setRemember] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // { name, price, mode: split|personal|drop }. Reopening a saved expense brings
  // its stored lines back; those prices already include their share of the tax,
  // which is why scanTotal stays null and the ratio below comes out as 1.
  const [items, setItems] = useState(() => (initial?.items || []).map((i) => ({ name: i.name, price: i.amount, mode: "split" })));
  const [scanTotal, setScanTotal] = useState(null); // receipt total, tax included
  const [personalLedgerId, setPersonalLedgerId] = useState(ledgers[0]?.id || null);

  // Scanning only prefills the form — you still review and save it yourself.
  const scanReceipt = async (file) => {
    setScanErr(""); setScanning(true);
    try {
      const { image, mediaType } = await fileToUpload(file);
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image,
          mediaType,
          categories: categories.map((c) => c.name),
          token: data.session?.access_token,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || res.statusText);
      setD((prev) => ({
        ...prev,
        description: out.description || prev.description,
        amount: out.amount != null ? String(out.amount) : prev.amount,
        date: out.date || prev.date,
        categoryId: categories.find((c) => c.name === out.category)?.id ?? prev.categoryId,
      }));
      setAddHst(false); // a receipt total already includes tax
      setScanTotal(out.amount ?? null);
      setItems((out.items || []).map((i) => ({ name: i.name, price: Number(i.price) || 0, mode: "split" })));
    } catch (e) {
      setScanErr(e.message);
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

  const base = Number(d.amount) || 0;
  const finalAmount = addHst ? Math.round(base * 1.13 * 100) / 100 : base;
  // A shared expense with nobody ticked can't be divided, so block saving it.
  const sharerCount = d.split === "shared" ? (d.sharedWith || []).length : 0;
  const valid = d.description.trim() && finalAmount > 0 && d.date && d.categoryId && d.paidById
    && (d.split !== "shared" || sharerCount > 0) && !busy;

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
    if (!valid) return;
    setBusy(true);
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
      { ...d, description: typed, amount: finalAmount, items: asItems(splitItems) },
      remember && canRemember ? typed : null,
      personal,
    );
  };

  return (
    <Overlay onClose={onClose} title={initial ? t("editExpense") : t("addExpense")} t={t}>
      {scanning ? (
        <div style={{ ...addBtn, marginTop: 0, width: "100%", justifyContent: "center", cursor: "wait", opacity: 0.6 }}>
          <Loader2 size={18} className="spin" /> {t("scanning")}
        </div>
      ) : (
        // Two entry points share one handler: Scan forces the camera (capture,
        // image only); Upload takes a screenshot, image or PDF from the files.
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <label style={{ ...addBtn, marginTop: 0, flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <Camera size={18} /> {t("scanReceipt")}
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanReceipt(f); }} />
          </label>
          <label style={{ ...addBtn, marginTop: 0, flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <Upload size={18} /> {t("uploadReceipt")}
            <input type="file" accept="image/*,application/pdf,.pdf" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanReceipt(f); }} />
          </label>
        </div>
      )}
      {scanErr && <div style={{ color: "#DC2626", fontSize: 12 }}>{t("scanFailed", { msg: scanErr })}</div>}
      <div style={{ textAlign: "center", color: SUB, fontSize: 12, margin: "-2px 0 2px" }}>{t("scanHint")}</div>

      <Field label={t("formWhat")}>
        {/* A native <datalist> was the obvious choice here, but Chrome dismisses its
            popup when the "remember" checkbox below appears mid-typing, so the
            suggestions never showed. Hand-rolled dropdown instead. */}
        <div style={{ position: "relative" }}>
          <input autoFocus value={d.description}
            onChange={(e) => { setD({ ...d, description: e.target.value }); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setSuggestOpen(false)}
            placeholder={t("formWhatPh")} autoComplete="off" style={input} />
          {suggestOpen && suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 70, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", overflow: "hidden" }}>
              {suggestions.map((m) => (
                // mousedown, not click: blur would close the list first otherwise.
                <button key={m.id} onMouseDown={(e) => { e.preventDefault(); setD({ ...d, description: m.name }); setSuggestOpen(false); }} style={suggestItem}>
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
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: 12, color: SUB }}>$</span>
            <input type="number" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" style={{ ...input, paddingLeft: 24 }} />
          </div>
        </Field>
        <Field label={t("date")} style={{ flex: 1, minWidth: 0 }}>
          <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} style={input} />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer", marginTop: -4 }}>
        <input type="checkbox" checked={addHst} onChange={(e) => setAddHst(e.target.checked)} />
        {t("addHst")} {addHst && base > 0 && <span style={{ color: INK, fontWeight: 600 }}>→ {money(finalAmount)}</span>}
      </label>
      {items.length > 0 && (
        <Field label={t("items")}>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ padding: "9px 12px", borderTop: idx === 0 ? "none" : `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", opacity: it.mode === "drop" ? 0.45 : 1 }}>
                <span style={{ flex: 1, minWidth: 110, fontSize: 13, fontWeight: 600, textDecoration: it.mode === "drop" ? "line-through" : "none" }}>{it.name}</span>
                <span style={{ fontSize: 13, color: SUB, fontVariantNumeric: "tabular-nums" }}>{money(round2(it.price * taxRatio))}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[["split", t("itemSplit"), Users], ["personal", t("itemPersonal"), User], ["drop", t("itemDrop"), Trash2]].map(([mode, label, Icon]) => (
                    <button key={mode} onClick={() => setItemMode(idx, mode)} aria-label={label} title={label}
                      style={{ ...iconBtn, width: 30, height: 28, borderColor: it.mode === mode ? TEAL : LINE, background: it.mode === mode ? TEAL : "#fff", color: it.mode === mode ? "#fff" : SUB }}>
                      <Icon size={13} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>{t("itemsHint")}{droppedCount > 0 && ` · ${t("itemsDropped", { n: droppedCount })}`}</span>
            <button onClick={() => { setItems([]); setScanTotal(null); }} style={{ ...editCatsPill, padding: "3px 8px", fontSize: 11 }}>{t("itemsClear")}</button>
          </div>
          {personalItems.length > 0 && (
            <div style={{ marginTop: 8, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>
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
          <button onClick={onEditCategories} style={{ ...categoryLink, fontSize: 12, color: TEAL }}>{t("editCategories")}</button>
        </span>
      }>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setD({ ...d, categoryId: c.id })} style={chip(d.categoryId === c.id)}>{catName(c, lang)}</button>
          ))}
        </div>
      </Field>
      {features.showSplit && (
        <>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {t("whoPaid")}
              <button onClick={onEditMembers} style={{ ...categoryLink, fontSize: 12, color: TEAL }}>{t("manageMembers")}</button>
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
          </Field>
          <Field label={t("split")}>
            <div style={{ display: "flex", gap: 3, background: "#EEF0F2", borderRadius: 10, padding: 3 }}>
              <button onClick={() => setD({ ...d, split: "personal" })} style={segItem(d.split === "personal")}><User size={14} /> {t("personal")}</button>
              <button onClick={() => setD({ ...d, split: "shared", sharedWith: d.sharedWith?.length ? d.sharedWith : members.map((m) => m.id) })} style={segItem(d.split === "shared")}>
                <Users size={14} /> {t("splitBetween")}
              </button>
            </div>
            {d.split === "shared" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {members.map((m) => {
                    const on = (d.sharedWith || []).includes(m.id);
                    const Icon = memberIcon(m.icon);
                    return (
                      <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                        <input type="checkbox" checked={on}
                          onChange={() => setD({ ...d, sharedWith: on ? d.sharedWith.filter((x) => x !== m.id) : [...(d.sharedWith || []), m.id] })}
                          style={{ width: 17, height: 17, accentColor: TEAL, flexShrink: 0 }} />
                        <Icon size={14} style={{ color: SUB }} /> {m.name}
                      </label>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: sharerCount ? SUB : "#DC2626", marginTop: 6 }}>
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
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "12px" }}>{t("cancel")}</button>
        <button onClick={submit} disabled={!valid} style={{ ...addBtn, flex: 2, marginTop: 0, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
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
            <button onClick={() => del(c.id)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteCategory")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("newCatPh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveCategories")}</button>
    </Overlay>
  );
}

// Green under 80% of a budget, amber approaching it, red once past. A bar never
// overflows its track — how far over you are is in the number, not the bar.
const budgetBarColor = (spent, budget) =>
  !budget ? LINE : spent > budget ? "#DC2626" : spent / budget > 0.8 ? "#D97706" : TEAL;

function BudgetBar({ spent, budget, height = 8 }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div style={{ height, borderRadius: 99, background: "#EEF2F1", overflow: "hidden" }}>
      <div style={{ width: `${budget > 0 ? Math.max(pct, spent > 0 ? 2 : 0) : 0}%`, height: "100%", background: budgetBarColor(spent, budget), borderRadius: 99, transition: "width .25s ease" }} />
    </div>
  );
}

function BudgetPanel({ month, monthLabel, categories, expenses, budgets, spentByCategory, spent, lang, t, onSave, onClose, title }) {
  // One draft per category; the month's budget is their sum, not its own field.
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(categories.map((c) => {
      const v = budgets.get(db.budgetKey(month, c.id));
      return [c.id, v == null ? "" : String(v)];
    })),
  );
  const [busy, setBusy] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const budgetOf = (id) => Number(drafts[id]) || 0;
  const totalBudget = categories.reduce((sum, c) => sum + budgetOf(c.id), 0);
  const left = totalBudget - spent;
  const over = left < 0;
  const uncategorised = spent - categories.reduce((s, c) => s + (spentByCategory.get(c.id) || 0), 0);

  const save = async () => {
    setBusy(true);
    await onSave(categories.map((c) => ({ categoryId: c.id, amount: drafts[c.id].trim() === "" ? null : budgetOf(c.id) })));
    setBusy(false);
  };

  return (
    <Overlay onClose={onClose} title={title || t("budget")} t={t}>
      <div style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{t("budgetFor", { month: monthLabel })}</div>

      {/* Whole-month roll-up */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>{t("budgetTotal")}</span>
          {totalBudget > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: SUB }}>{t("budgetPct", { pct: Math.round((spent / totalBudget) * 100) })}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(spent)}</span>
          {totalBudget > 0 && <span style={{ fontSize: 14, color: SUB, fontWeight: 600 }}>/ {money(totalBudget)}</span>}
        </div>
        <BudgetBar spent={spent} budget={totalBudget} height={12} />
        {totalBudget > 0 ? (
          <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>
              {over ? t("budgetOver") : t("budgetLeft")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: over ? "#DC2626" : TEAL, fontVariantNumeric: "tabular-nums" }}>
              {money(Math.abs(left))}
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 13, color: SUB }}>{t("budgetNone", { month: monthLabel })}</div>
        )}
      </div>

      {/* Per-category */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Column headers, aligned to the spent value and the budget field below. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{t("category")}</span>
          <span style={{ width: 72, textAlign: "right" }}>{t("budgetSpent")}</span>
          <span style={{ width: 104, textAlign: "left", paddingLeft: 2 }}>{t("budget")}</span>
        </div>
        {categories.map((c) => {
          const s = spentByCategory.get(c.id) || 0;
          const b = budgetOf(c.id);
          const hasBudget = drafts[c.id] != null && drafts[c.id] !== "";
          return (
            <div key={c.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <button onClick={() => setSelectedCategory(c)} style={{ ...categoryLink, flex: 1, minWidth: 0 }}>{catName(c)}</button>
                {/* Just what's been spent — the budget itself is in the field alongside. */}
                <span style={{ width: 72, textAlign: "right", fontSize: 12, color: b > 0 && s > b ? "#DC2626" : SUB, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {money(s)}
                </span>
                <div style={{ position: "relative", width: 104, flexShrink: 0 }}>
                  {/* Dollar sign only once there's a value, so an unset field reads as
                      "Set budget" rather than a misleading "$ 0.00". */}
                  {hasBudget && <span style={{ position: "absolute", left: 9, top: 8, color: SUB, fontSize: 13 }}>$</span>}
                  <input type="number" inputMode="decimal" value={drafts[c.id] ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && save()}
                    placeholder={t("setBudgetPh")} style={{ ...input, padding: hasBudget ? "7px 8px 7px 20px" : "7px 8px", fontSize: 13 }} />
                </div>
              </div>
              <BudgetBar spent={s} budget={b} />
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: SUB }}>
        {t("budgetClearHint")}
        {uncategorised > 0.005 && <> · {t("budgetUncat")}</>}
      </div>

      <button onClick={save} disabled={busy} style={{ ...addBtn, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {t("budgetSave")}
      </button>
      {selectedCategory && <CategoryExpenseList category={selectedCategory} month={month} expenses={expenses} lang={lang} t={t} onClose={() => setSelectedCategory(null)} />}
    </Overlay>
  );
}

function MonthlyReport({ month, months, expenses, categories, lang, t, onMonthChange, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const breakdown = useMemo(() => {
    const totals = new Map();
    for (const expense of expenses) {
      if (monthOf(expense.date) !== month) continue;
      const key = expense.categoryId || "uncategorised";
      totals.set(key, (totals.get(key) || 0) + (Number(expense.amount) || 0));
    }
    return [...totals.entries()].map(([id, amount]) => {
      const category = categories.find((c) => c.id === id);
      return {
        id,
        amount,
        name: category ? catName(category, lang) : t("reportUncategorised"),
        color: category?.color || "#94A3B8",
      };
    }).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [expenses, month, categories, lang, t]);

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
      <select value={month} onChange={(e) => onMonthChange(e.target.value)} aria-label={t("selectMonth")} style={selectStyle}>
        {months.map((value) => <option key={value} value={value}>{monthName(value, lang)}</option>)}
      </select>
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>{t("reportTotal")}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{money(total)}</div>
        <div style={{ fontSize: 13, color: SUB, marginTop: 2 }}>{t("reportFor", { month: monthName(month, lang) })}</div>
      </div>
      {breakdown.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "28px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("reportEmpty")}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <svg viewBox="0 0 100 100" width="230" height="230" role="img" aria-label={t("reportCategories")}>
              {slices.map((slice) => <path key={slice.id} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="1.5" />)}
              <circle cx="50" cy="50" r="26" fill="#fff" />
              <text x="50" y="48" textAnchor="middle" fontSize="7" fontWeight="700" fill={SUB}>{t("reportTotal")}</text>
              <text x="50" y="57" textAnchor="middle" fontSize="7" fontWeight="800" fill={INK}>{money(total)}</text>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {breakdown.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: item.color, flexShrink: 0 }} />
                <button onClick={() => setSelectedCategory(item)} style={{ ...categoryLink, flex: 1 }}>{item.name}</button>
                <span style={{ color: SUB, fontSize: 12 }}>{Math.round((item.amount / total) * 100)}%</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 76, textAlign: "right" }}>{money(item.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {selectedCategory && <CategoryExpenseList category={selectedCategory} month={month} expenses={expenses} lang={lang} t={t} onClose={() => setSelectedCategory(null)} />}
    </Overlay>
  );
}

function CategoryExpenseList({ category, month, expenses, lang, t, onClose }) {
  const rows = expenses.filter((expense) => monthOf(expense.date) === month && (expense.categoryId || "uncategorised") === category.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Overlay title={t("categoryExpenses", { category: category.name })} t={t} onClose={onClose}>
      <div style={{ fontSize: 13, fontWeight: 700, color: SUB }}>{monthName(month, lang)}</div>
      {rows.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "28px 16px", color: SUB, textAlign: "center", fontSize: 13 }}>{t("categoryExpensesEmpty")}</div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
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
            <button onClick={() => del(m.id)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteStore")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("newStorePh")} style={{ ...input, flex: 1 }} />
        <button onClick={add} style={{ ...ghostBtn, padding: "10px 12px" }}><Plus size={16} /></button>
      </div>
      <button onClick={done} style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveStores")}</button>
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
              <button onClick={() => del(m.id)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteMember")}><Trash2 size={15} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, margin: "-2px 0 4px 42px" }}>
              {Object.entries(MEMBER_ICONS).map(([key, Icon]) => (
                <button key={key} onClick={() => patch(m.id, "icon", key)} aria-label={key}
                  style={{ ...iconBtn, width: 30, height: 30, borderColor: (m.icon || "user") === key ? m.color : LINE, background: (m.icon || "user") === key ? m.color : "#fff", color: (m.icon || "user") === key ? "#fff" : SUB }}>
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
      <button onClick={done} style={{ ...addBtn, justifyContent: "center" }}><Check size={18} /> {t("saveMembers")}</button>
    </Overlay>
  );
}

// Header overflow menu. Editing categories moved into the category lists themselves,
// so this is the slot for account actions and the features still to come
// (budgets, reports) rather than a one-off button per feature.
// Same name source as the Manage members roster (app_user.name), so "who am I"
// and "who's on this ledger" never disagree. Fetched once per mount, not per open.
function useMyProfile() {
  const [profile, setProfile] = useState(null); // { name, email } | null while loading
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) return;
      supabase.from("app_user").select("name, email").eq("id", u.id).single()
        .then(({ data: row }) => { if (live) setProfile({ name: row?.name || null, email: row?.email || u.email }); })
        .catch(() => { if (live) setProfile({ name: null, email: u.email }); });
    });
    return () => { live = false; };
  }, []);
  return profile;
}

function HeaderMenu({ t, lang, changeLang, onBudget, onReport, onStores, onRecurring, onManageMembers, budgetLabel }) {
  const [open, setOpen] = useState(false);
  const profile = useMyProfile();
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} style={iconBtn} aria-label={t("menu")} aria-haspopup="menu" aria-expanded={open}>
        <Menu size={16} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.13)", padding: 6, minWidth: 190, zIndex: 60 }}>
          {profile && (
            // Pre-invite-feature accounts had name backfilled to their email
            // (migration 009) — show it once, not as a duplicated name+email pair.
            <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "-6px -6px 6px", padding: "12px 14px", background: PAPER, borderBottom: `1px solid ${LINE}`, borderRadius: "10px 10px 0 0" }}>
              <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 99, background: TEAL, color: "#fff", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
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
          {/* Ledger-scoped entries are absent on the picker, which has no ledger. */}
          {onBudget && (
            <button role="menuitem" onClick={() => { setOpen(false); onBudget(); }} style={menuItem}>
              <PieChart size={15} /> {budgetLabel || t("budget")}
            </button>
          )}
          {onReport && (
            <button role="menuitem" onClick={() => { setOpen(false); onReport(); }} style={menuItem}>
              <PieChart size={15} /> {t("monthlyReport")}
            </button>
          )}
          {onStores && (
            <button role="menuitem" onClick={() => { setOpen(false); onStores(); }} style={menuItem}>
              <Store size={15} /> {t("stores")}
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
          {(onBudget || onReport || onStores || onRecurring || onManageMembers) && <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />}
          {/* Plain rows like every other entry — a segmented toggle in here read as
              a different kind of control and sat oddly among them. */}
          {[["en", "English"], ["zh", "繁體中文"]].map(([code, label]) => (
            <button key={code} role="menuitem" onClick={() => { setOpen(false); changeLang(code); }} style={menuItem}>
              <Languages size={15} /> <span style={{ flex: 1 }}>{label}</span>
              {lang === code && <Check size={14} style={{ color: TEAL }} />}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />
          <button role="menuitem" onClick={() => { setOpen(false); supabase.auth.signOut(); }} style={menuItem}>
            <LogOut size={15} /> {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

function Overlay({ title, onClose, t, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,26,32,0.4)", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "min(440px, 100%)", height: "100%", overflowY: "auto", padding: "18px 18px 32px", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Tag size={18} style={{ color: TEAL }} />
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto", flexShrink: 0 }} aria-label={t("close")}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Replaces window.confirm() for every destructive action in the app. Native
// confirm() has a real failure mode: after a couple of them, Chrome (and other
// browsers) offer "Prevent this page from creating additional dialogs" — once a
// user ticks that, every future confirm() on the page silently returns false with
// no dialog at all, which reads as "delete does nothing" everywhere at once.
// zIndex above Overlay's 50 so it can sit on top of a panel that opened it.
function ConfirmDialog({ message, confirmLabel, t, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,26,32,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "min(360px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: 14, color: INK, lineHeight: 1.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: 12 }}>{t("cancel")}</button>
          <button onClick={onConfirm} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1, padding: 12, borderRadius: 9, border: "none", background: "#DC2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <Trash2 size={16} /> {confirmLabel || t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", ...style }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ----------------------------- Styles ----------------------------- */
const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, color: INK, outline: "none", fontFamily: "inherit" };
const selectStyle = { ...input, width: "auto", padding: "8px 10px", cursor: "pointer", fontWeight: 600 };
const addBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 12, padding: "13px 16px", borderRadius: 11, border: "none", background: TEAL, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${LINE}`, background: "#fff", color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const categoryLink = { padding: 0, border: "none", background: "none", color: INK, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dangerBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1, padding: "12px", borderRadius: 9, border: `1px solid #F3C4C4`, background: "#fff", color: "#DC2626", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff", color: SUB, cursor: "pointer" };
const menuItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: 7, border: "none", background: "none", color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
const suggestItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", background: "none", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
// Dashed outline sets it apart from the coloured category pills — it's an action, not a category.
const editCatsPill = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 999, border: `1px dashed ${SUB}`, background: "none", color: SUB, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const errorBox = { fontSize: 13, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, padding: "10px 12px", marginBottom: 12 };
const backdrop = { position: "fixed", inset: 0, zIndex: 20 };

function pill(color) {
  return { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 99, border: "none", fontSize: 12.5, fontWeight: 700, color: "#fff", background: color, fontFamily: "inherit", whiteSpace: "nowrap" };
}
function selectablePill(color, active) {
  return { padding: "6px 11px", borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: active ? "#fff" : color, background: active ? color : "transparent", border: `1.5px solid ${color}`, fontFamily: "inherit" };
}
// Unified selectable chip: neutral grey when off, brand green when on. Category
// and member tags share it, so the form reads as one system rather than a row of
// clashing coloured outlines.
function chip(active) {
  return { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", color: active ? "#fff" : "#374151", background: active ? TEAL : "#EEF0F2" };
}
// One grey track, the active half lifts to green — a proper segmented control.
function segItem(active) {
  return { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", color: active ? "#fff" : SUB, background: active ? TEAL : "transparent" };
}
function splitBadge(split) {
  const shared = split === "shared";
  return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: shared ? "#0E9384" : "#64748B", background: shared ? "#E3F5F2" : "#EFF1F3" };
}
