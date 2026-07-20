import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Plus, Pencil, Trash2, X, Check, Tag, SlidersHorizontal,
  Users, User, ArrowRight, ArrowLeft, Receipt, ChevronRight, LogOut, Loader2, Camera, Menu, BookOpen, PieChart, Store, Languages,
  Home, Plane,
} from "lucide-react";

// Each starter template gets its own mark in the ledger list.
const LEDGER_ICONS = { household: Home, travel: Plane, personal: Users, blank: BookOpen };
const ledgerIcon = (tpl) => LEDGER_ICONS[tpl] || BookOpen;
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";
import { settlements } from "./lib/settle";

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
    email: "Email", password: "Password", signInBtn: "Sign in", signOut: "Sign out",
    connecting: "Connecting…",
    categories: "Categories", manageCats: "Manage categories", selectMonth: "Select month",
    addExpense: "Add expense",
    spentIn: "Spent in {month}", paidSuffix: "{name} paid",
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
    sharedLine: "Split {n} ways — {amount} each",
    members: "Members", manageMembers: "Edit members", editMembers: "Edit members",
    memberHasExpenses: "That member still has expenses in this ledger. Reassign or delete them first.",
    budget: "Budget", budgetFor: "Budget for {month}", budgetTotal: "All categories",
    budgetNone: "No budgets set for {month}. Give any category an amount below.",
    budgetSpent: "Spent", budgetLeft: "Left", budgetOver: "Over budget",
    budgetSave: "Save budgets", budgetClearHint: "Leave a category empty for no budget",
    budgetPct: "{pct}% used", budgetOtherMonths: "Other months",
    budgetUncat: "Uncategorised spending isn't counted against any category budget.",
    splitBetween: "Split", splitWays: "{n} ways · {amount} each", splitWaysShort: "Split {n} ways",
    items: "Receipt items", itemSplit: "Split", itemPersonal: "Personal", itemDrop: "Not mine",
    itemsHint: "Tax is shared out across whatever you keep, in proportion to price.",
    itemsPersonalNote: "{n} personal · {amount} — saved as a second, unsplit expense",
    itemsDropped: "{n} removed",
    itemsClear: "Clear items", itemsTotalsOff: "Items add up to {sum}, receipt says {total}",
    splitNobody: "Tick at least one person to split between.",
    sharedAmong: "Split between {names}",
    stores: "Saved shops", editStores: "Edit saved shops", rememberStore: 'Remember "{name}"',
    rememberHint: "Saved shops are suggested as you type. Nothing is saved unless you tick this.",
    newStorePh: "New shop name", saveStores: "Save shops", deleteStore: "Remove shop",
    noStores: "No saved shops yet. Tick the box when adding an expense to keep one.",
    newMemberPh: "New member name", saveMembers: "Save members", deleteMember: "Remove member",
    receiptTitle: "Receipt items",
    receiptEmpty: "No receipt attached yet. When you scan a receipt, its line items will show up here.",
    scanReceipt: "Scan receipt", scanning: "Reading receipt…",
    scanHint: "or fill it in yourself", scanFailed: "Couldn't read that receipt: {msg}",
    editCategories: "Edit categories", menu: "Menu",
    ledgers: "Ledgers", ledgersHint: "Pick a ledger, or start a new one.",
    newLedgerPh: "e.g. Travel — Japan", createLedger: "Create ledger",
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
    email: "電郵", password: "密碼", signInBtn: "登入", signOut: "登出",
    connecting: "連線中…",
    categories: "類別", manageCats: "管理類別", selectMonth: "選擇月份",
    addExpense: "新增支出",
    spentIn: "{month}支出", paidSuffix: "{name} 已付",
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
    sharedLine: "{n} 人平分 — 每人 {amount}",
    members: "成員", manageMembers: "編輯成員", editMembers: "編輯成員",
    memberHasExpenses: "呢位成員喺呢本帳簿仲有支出，要先改咗付款人或者刪走嗰啲支出。",
    budget: "預算", budgetFor: "{month}預算", budgetTotal: "所有類別",
    budgetNone: "{month}未設預算。喺下面任何一個類別填個數就得。",
    budgetSpent: "已用", budgetLeft: "剩餘", budgetOver: "超出預算",
    budgetSave: "儲存預算", budgetClearHint: "留空即該類別冇預算",
    budgetPct: "已用 {pct}%", budgetOtherMonths: "其他月份",
    budgetUncat: "未分類嘅支出唔會計入任何類別預算。",
    splitBetween: "分帳", splitWays: "{n} 人分 · 每人 {amount}", splitWaysShort: "{n} 人分",
    items: "收據明細", itemSplit: "分帳", itemPersonal: "私人", itemDrop: "唔計",
    itemsHint: "稅款會按價錢比例攤分落你保留嘅項目。",
    itemsPersonalNote: "{n} 件私人 · {amount} — 會另存一張唔分帳嘅支出",
    itemsDropped: "已剔走 {n} 件",
    itemsClear: "清除明細", itemsTotalsOff: "明細加埋係 {sum}，收據寫住 {total}",
    splitNobody: "至少要剔一個人先分到帳。",
    sharedAmong: "由 {names} 平分",
    stores: "已記住嘅店家", editStores: "編輯店家", rememberStore: "記住「{name}」",
    rememberHint: "記住咗嘅店家打頭幾個字就會彈出。唔剔呢格就唔會記。",
    newStorePh: "新店家名稱", saveStores: "儲存店家", deleteStore: "移除店家",
    noStores: "仲未記低任何店家。入數時剔個格就會記住。",
    newMemberPh: "新成員名稱", saveMembers: "儲存成員", deleteMember: "移除成員",
    receiptTitle: "收據項目",
    receiptEmpty: "尚未附上收據。掃描收據後，明細項目會顯示在這裡。",
    scanReceipt: "掃描收據", scanning: "讀取收據中…",
    scanHint: "或自己填寫", scanFailed: "讀唔到張收據：{msg}",
    editCategories: "編輯類別", menu: "選單",
    ledgers: "帳簿", ledgersHint: "揀一本帳簿，或者開一本新嘅。",
    newLedgerPh: "例如：旅行 — 日本", createLedger: "建立帳簿",
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

  if (session === undefined) return <Centered>{t("connecting")}</Centered>;
  if (!session) return <Login lang={lang} changeLang={changeLang} t={t} />;
  if (!ledger) return <LedgerPicker lang={lang} changeLang={changeLang} t={t} onOpen={setLedger} />;
  return <Ledger ledger={ledger} onExit={() => setLedger(null)} lang={lang} changeLang={changeLang} t={t} />;
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
function Login({ lang, changeLang, t }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email || !pw) return;
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setError(error.message); setBusy(false); }
    // on success, onAuthStateChange in App swaps the view
  };

  return (
    <div style={{ background: PAPER, minHeight: 520, display: "grid", placeItems: "center", fontFamily: "Inter, system-ui, sans-serif", padding: 20 }}>
      <div style={{ width: "min(360px, 100%)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: TEAL, fontWeight: 700 }}>{t("eyebrow")}</div>
          <LangToggle lang={lang} changeLang={changeLang} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{t("signInTitle")}</h1>
        <p style={{ fontSize: 13, color: SUB, margin: "0 0 16px" }}>{t("signInHint")}</p>

        <Field label={t("email")}>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />
        </Field>
        <Field label={t("password")}>
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />
        </Field>

        {error && <div style={{ ...errorBox, marginTop: 4 }}>{error}</div>}

        <button onClick={submit} disabled={busy || !email || !pw}
          style={{ ...addBtn, opacity: busy || !email || !pw ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
          {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />} {t("signInBtn")}
        </button>
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

/* ========================= Ledger picker ========================== */
function LedgerPicker({ lang, changeLang, t, onOpen }) {
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

  const remove = async (l) => {
    if (!confirm(t("deleteLedgerConfirm", { name: l.name }))) return;
    try { await db.deleteLedger(l.id); load(); }
    catch (e) { setError(e.message || String(e)); }
  };

  // Renaming happens in place: the row swaps its open-button for an input so the
  // whole row can't double as "open this ledger" while you're typing in it.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftTpl, setDraftTpl] = useState("household");
  const startRename = (l) => { setEditingId(l.id); setDraft(l.name); setDraftTpl(l.template); };
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

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ledgers.length === 0 && (
            <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: "26px 18px", textAlign: "center", color: SUB, fontSize: 13 }}>
              <BookOpen size={22} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>{t("noLedgers")}</div>
            </div>
          )}
          {ledgers.map((l) => (
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
          ))}
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
    </div>
  );
}

/* ============================ Ledger ============================== */
function Ledger({ ledger, onExit, lang, changeLang, t }) {
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
  const [budgets, setBudgets] = useState(new Map());
  const [merchants, setMerchants] = useState([]);
  const [managingStores, setManagingStores] = useState(false);
  const [allLedgers, setAllLedgers] = useState([]);

  const refresh = useCallback(async () => {
    try {
      setError("");
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
    for (const e of rows) {
      const amt = Number(e.amount) || 0;
      total += amt;
      if (paid.has(e.paidById)) paid.set(e.paidById, paid.get(e.paidById) + amt);
    }
    return { total, paid, transfers: settlements(rows, members) };
  }, [rows, members]);

  if (!ready) return <Centered>{t("connecting")}</Centered>;
  const label = monthName(month, lang);

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      <style>{`
        .exp-row { transition: background .12s ease; }
        .exp-row:hover { background: #FAFBFC; }
        .exp-row:focus-visible { background: #F1F5F4; box-shadow: inset 3px 0 0 ${TEAL}; }
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ledger.name}</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onExit} style={ghostBtn} aria-label={t("exit")}>
              <ArrowLeft size={15} /> {t("exit")}
            </button>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("selectMonth")} style={selectStyle}>
              {monthsAvailable.map((m) => (
                <option key={m} value={m}>{new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" })}</option>
              ))}
            </select>
            <HeaderMenu t={t} lang={lang} changeLang={changeLang} onBudget={() => setShowBudget(true)} onStores={() => setManagingStores(true)} />
          </div>
        </div>

        {error && <div style={errorBox}>{t("loadErr", { msg: error })}</div>}

        {/* Summary / settlement */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          <Stat label={t("spentIn", { month: label })} value={money(summary.total)} big />
          {members.map((m) => (
            <Stat key={m.id} label={t("paidSuffix", { name: m.name })} value={money(summary.paid.get(m.id) || 0)} dot={m.color} />
          ))}
        </div>

        <SettlementBar transfers={summary.transfers} members={members} t={t} />

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
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`, cursor: "pointer", outline: "none" }}>
                  <span style={{ ...pill(cat?.color || "#94A3B8"), cursor: "inherit" }}>
                    {cat ? catName(cat, lang) : t("uncategorised")}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.description}</div>
                    <div style={{ fontSize: 12, color: SUB, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{e.date}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: payer?.color || SUB }} />
                        {t("paidByRow", { name: payer?.name || "—" })}
                      </span>
                      <span style={splitBadge(e.split)}>
                        {e.split === "shared" ? <Users size={11} /> : <User size={11} />}
                        {e.split === "shared" ? t("splitWaysShort", { n: (e.sharedWith || []).length }) : t("personal")}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(e.amount)}</div>
                    <ChevronRight size={17} style={{ color: "#B7BEC6" }} />
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
          onDelete={() => { if (confirm(t("deleteConfirm", { name: detail.description }))) { removeExpense(detail.id); setDetail(null); } }}
          onEditCategories={() => setManagingCats(true)}
          onClose={() => setDetail(null)} />
      )}
      {editing !== null && (
        <ExpenseForm initial={editing === "new" ? null : editing} categories={categories} members={members}
          merchants={merchants} ledgers={allLedgers} lang={lang} t={t}
          onClose={() => setEditing(null)} onSave={upsertExpense}
          onEditCategories={() => setManagingCats(true)} onEditMembers={() => setManagingMembers(true)}
          onEditStores={() => setManagingStores(true)} defaultMonth={month} />
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
        <BudgetPanel month={month} monthLabel={label} categories={categories} budgets={budgets}
          spentByCategory={spentByCategory} spent={summary.total} t={t}
          onSave={saveBudgets} onClose={() => setShowBudget(false)} />
      )}
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

function Stat({ label, value, big, dot }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: SUB, display: "flex", alignItems: "center", gap: 6 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />}
        {label}
      </div>
      <div style={{ fontSize: big ? 24 : 19, fontWeight: 800, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// With three or more members there can be several transfers, so this renders a
// list rather than a single "A owes B" line.
function SettlementBar({ transfers, members, t }) {
  const settled = transfers.length === 0;
  const first = transfers[0];
  // The transfer list is a grid rather than flex rows so every line shares column
  // widths — otherwise the arrows and amounts shift with the length of each name.
  const tint = settled || !first
    ? "#334155"
    : `linear-gradient(90deg, ${memberById(members, first.fromId)?.color || TEAL}, ${memberById(members, first.toId)?.color || TEAL})`;
  return (
    <div style={{ display: "flex", alignItems: transfers.length > 1 ? "flex-start" : "center", gap: 12, padding: "14px 16px", marginBottom: 14, borderRadius: 12, color: "#fff", background: tint, flexWrap: "wrap" }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.85, fontWeight: 700, paddingTop: transfers.length > 1 ? 3 : 0 }}>{t("settleUp")}</div>
      {settled ? (
        <div style={{ fontWeight: 700 }}>{t("allSquare")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", columnGap: 10, rowGap: 6, alignItems: "center", fontWeight: 700 }}>
          {transfers.map((x, i) => (
            <Fragment key={i}>
              <span>{memberById(members, x.fromId)?.name || "—"}</span>
              <ArrowRight size={16} />
              <span>{memberById(members, x.toId)?.name || "—"}</span>
              <span style={{ marginLeft: 4, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{money(x.amount)}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseDetail({ expense, categories, members, lang, t, onReassign, onEdit, onDelete, onEditCategories, onClose }) {
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
            <button key={c.id} onClick={() => onReassign(c.id)} style={selectablePill(c.color, c.id === expense.categoryId)}>{catName(c, lang)}</button>
          ))}
          <button onClick={onEditCategories} style={editCatsPill}><SlidersHorizontal size={13} /> {t("editCategories")}</button>
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
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.split(",")[1]);
    fr.onerror = () => reject(new Error("could not read file"));
    fr.readAsDataURL(blob);
  });
}

function ExpenseForm({ initial, categories, members, merchants, ledgers = [], lang, t, onClose, onSave, onEditCategories, onEditMembers, onEditStores, defaultMonth }) {
  const [d, setD] = useState(() => initial || {
    description: "", amount: "", categoryId: categories[0]?.id || null,
    date: `${defaultMonth}-15`, note: "", paidById: members[0]?.id || null, split: "shared",
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
      const image = await toScaledJpegBase64(file);
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image,
          mediaType: "image/jpeg",
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
  // Substring, not prefix — "frills" should still find "No Frills". An exact
  // match is dropped so the list doesn't hang around once you've picked one.
  const suggestions = merchants
    .filter((m) => m.name.toLowerCase().includes(typed.toLowerCase()) && m.name.toLowerCase() !== typed.toLowerCase())
    .slice(0, 6);
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
      <label style={{ ...addBtn, marginTop: 0, width: "100%", justifyContent: "center", cursor: scanning ? "wait" : "pointer", opacity: scanning ? 0.6 : 1 }}>
        {scanning ? <Loader2 size={18} className="spin" /> : <Camera size={18} />}
        {scanning ? t("scanning") : t("scanReceipt")}
        <input type="file" accept="image/*" capture="environment" disabled={scanning} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scanReceipt(f); }} />
      </label>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: SUB }}>{t("rememberHint")}</span>
          <button onClick={onEditStores} style={{ ...editCatsPill, flexShrink: 0, padding: "5px 9px", fontSize: 12 }}>
            <Store size={12} /> {t("editStores")}
          </button>
        </div>
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

      <Field label={t("category")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setD({ ...d, categoryId: c.id })} style={selectablePill(c.color, d.categoryId === c.id)}>{catName(c, lang)}</button>
          ))}
          <button onClick={onEditCategories} style={editCatsPill}><SlidersHorizontal size={13} /> {t("editCategories")}</button>
        </div>
      </Field>
      <Field label={t("whoPaid")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {members.map((m) => (
            <button key={m.id} onClick={() => setD({ ...d, paidById: m.id })} style={segBtn(d.paidById === m.id, m.color)}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: m.color }} />{m.name}
            </button>
          ))}
          <button onClick={onEditMembers} style={editCatsPill}><Users size={13} /> {t("editMembers")}</button>
        </div>
      </Field>
      <Field label={t("split")}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setD({ ...d, split: "personal" })} style={segBtn(d.split === "personal", TEAL)}><User size={14} /> {t("personal")}</button>
          <button onClick={() => setD({ ...d, split: "shared", sharedWith: d.sharedWith?.length ? d.sharedWith : members.map((m) => m.id) })} style={segBtn(d.split === "shared", TEAL)}>
            <Users size={14} /> {t("splitBetween")}
          </button>
        </div>
        {d.split === "shared" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m) => {
                const on = (d.sharedWith || []).includes(m.id);
                return (
                  <button key={m.id}
                    onClick={() => setD({ ...d, sharedWith: on ? d.sharedWith.filter((x) => x !== m.id) : [...(d.sharedWith || []), m.id] })}
                    style={selectablePill(m.color, on)}>
                    {on ? <Check size={12} /> : null} {m.name}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: sharerCount ? SUB : "#DC2626", marginTop: 6 }}>
              {sharerCount ? t("splitWays", { n: sharerCount, amount: money(finalAmount / sharerCount) }) : t("splitNobody")}
            </div>
          </div>
        )}
      </Field>
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
  const [color, setColor] = useState("#0E9384");

  const add = () => {
    if (!name.trim()) return;
    setList([...list, { id: uid(), name: name.trim(), nameZh: name.trim(), color, budget: null }]);
    setName("");
  };
  const patch = (id, key, val) => setList(list.map((c) => (c.id === id ? { ...c, [key]: val } : c)));
  // Write both name fields together so the EN and 繁中 names can never drift apart.
  const patchName = (id, val) => setList(list.map((c) => (c.id === id ? { ...c, name: val, nameZh: val } : c)));
  const del = (id) => setList(list.filter((c) => c.id !== id));
  // Saving with text still sitting in the new-category field used to discard it
  // silently. Treat a filled field as an intent to add — the + button is a shortcut,
  // not a required step.
  const done = () => {
    const pending = name.trim();
    onChange(pending ? [...list, { id: uid(), name: pending, nameZh: pending, color, budget: null }] : list);
    onClose();
  };

  return (
    <Overlay onClose={onClose} title={t("categories")} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="color" value={c.color} onChange={(e) => patch(c.id, "color", e.target.value)} style={{ width: 34, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
            <input value={catName(c)} onChange={(e) => patchName(c.id, e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => del(c.id)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteCategory")}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 34, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
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

function BudgetPanel({ month, monthLabel, categories, budgets, spentByCategory, spent, t, onSave, onClose }) {
  // One draft per category; the month's budget is their sum, not its own field.
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(categories.map((c) => {
      const v = budgets.get(db.budgetKey(month, c.id));
      return [c.id, v == null ? "" : String(v)];
    })),
  );
  const [busy, setBusy] = useState(false);

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
    <Overlay onClose={onClose} title={t("budget")} t={t}>
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
        {categories.map((c) => {
          const s = spentByCategory.get(c.id) || 0;
          const b = budgetOf(c.id);
          return (
            <div key={c.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catName(c)}</span>
                {/* Just what's been spent — the budget itself is in the field alongside. */}
                <span style={{ fontSize: 12, color: b > 0 && s > b ? "#DC2626" : SUB, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {money(s)}
                </span>
                <div style={{ position: "relative", width: 104, flexShrink: 0 }}>
                  <span style={{ position: "absolute", left: 9, top: 8, color: SUB, fontSize: 13 }}>$</span>
                  <input type="number" inputMode="decimal" value={drafts[c.id] ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && save()}
                    placeholder="0.00" style={{ ...input, padding: "7px 8px 7px 20px", fontSize: 13 }} />
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
    setList([...list, { id: uid(), name: name.trim(), color: nextColor() }]);
    setName("");
  };
  const patch = (id, key, val) => setList(list.map((m) => (m.id === id ? { ...m, [key]: val } : m)));
  const del = (id) => setList(list.filter((m) => m.id !== id));
  // Same as the category manager: a name typed but not yet added still counts.
  const done = () => {
    const pending = name.trim();
    onChange(pending ? [...list, { id: uid(), name: pending, color: nextColor() }] : list);
    onClose();
  };

  return (
    <Overlay onClose={onClose} title={t("members")} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="color" value={m.color} onChange={(e) => patch(m.id, "color", e.target.value)} style={{ width: 34, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
            <input value={m.name} onChange={(e) => patch(m.id, "name", e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => del(m.id)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteMember")}><Trash2 size={15} /></button>
          </div>
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
function HeaderMenu({ t, lang, changeLang, onBudget, onStores }) {
  const [open, setOpen] = useState(false);
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
          {/* Ledger-scoped entries are absent on the picker, which has no ledger. */}
          {onBudget && (
            <button role="menuitem" onClick={() => { setOpen(false); onBudget(); }} style={menuItem}>
              <PieChart size={15} /> {t("budget")}
            </button>
          )}
          {onStores && (
            <button role="menuitem" onClick={() => { setOpen(false); onStores(); }} style={menuItem}>
              <Store size={15} /> {t("stores")}
            </button>
          )}
          {(onBudget || onStores) && <div style={{ borderTop: `1px solid ${LINE}`, margin: "4px 0" }} />}
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
function segBtn(active, color) {
  return { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", color: active ? "#fff" : INK, background: active ? color : "#fff", border: `1.5px solid ${active ? color : LINE}`, fontFamily: "inherit" };
}
function splitBadge(split) {
  const shared = split === "shared";
  return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: shared ? "#0E9384" : "#64748B", background: shared ? "#E3F5F2" : "#EFF1F3" };
}
