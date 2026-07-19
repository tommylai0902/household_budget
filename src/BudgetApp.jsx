import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Pencil, Trash2, X, Check, Tag, SlidersHorizontal,
  Users, User, ArrowRight, ArrowLeft, Receipt, ChevronRight, LogOut, Loader2, Camera, Menu, BookOpen,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";

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

const PEOPLE = [
  { id: "tommy", name: "Tommy", color: "#0E9384" },
  { id: "wing", name: "Wing", color: "#E4572E" },
];
const personById = (id) => PEOPLE.find((p) => p.id === id) || PEOPLE[0];
const otherPerson = (id) => PEOPLE.find((p) => p.id !== id) || PEOPLE[1];

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
  const startRename = (l) => { setEditingId(l.id); setDraft(l.name); };
  const cancelRename = () => { setEditingId(null); setDraft(""); };
  const saveRename = async (l) => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === l.name) return cancelRename();
    try { await db.renameLedger(l.id, trimmed); cancelRename(); load(); }
    catch (e) { setError(e.message || String(e)); cancelRename(); }
  };

  if (ledgers === null) return <Centered>{t("connecting")}</Centered>;

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100%", padding: "20px 16px 40px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: TEAL, fontWeight: 700 }}>Tommy &amp; Wing</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.4 }}>{t("ledgers")}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <LangToggle lang={lang} changeLang={changeLang} />
            <button onClick={() => supabase.auth.signOut()} style={iconBtn} aria-label={t("signOut")} title={t("signOut")}>
              <LogOut size={16} />
            </button>
          </div>
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
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editingId === l.id ? (
                <>
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(l); if (e.key === "Escape") cancelRename(); }}
                    style={{ ...input, flex: 1, fontWeight: 700 }} />
                  <button onClick={() => saveRename(l)} style={{ ...iconBtn, color: TEAL }} aria-label={t("saveChanges")}><Check size={16} /></button>
                  <button onClick={cancelRename} style={iconBtn} aria-label={t("cancel")}><X size={15} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => onOpen(l)} aria-label={t("openLedger", { name: l.name })}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "15px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <BookOpen size={17} style={{ color: TEAL, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: INK, flex: 1 }}>{l.name}</span>
                    <ChevronRight size={17} style={{ color: SUB }} />
                  </button>
                  <button onClick={() => startRename(l)} style={iconBtn} aria-label={t("renameLedger")}><Pencil size={15} /></button>
                  <button onClick={() => remove(l)} style={{ ...iconBtn, color: "#DC2626" }} aria-label={t("deleteLedger")}><Trash2 size={15} /></button>
                </>
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
  const [expenses, setExpenses] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const [month, setMonth] = useState(monthOf(todayISO()));
  const [editing, setEditing] = useState(null);   // null | "new" | expense
  const [detail, setDetail] = useState(null);      // null | expense
  const [managingCats, setManagingCats] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError("");
      // No lazy seeding here — categories are seeded from the chosen template when
      // the ledger is created, so an intentionally blank ledger stays blank.
      const [cats, exps] = await Promise.all([db.fetchCategories(ledger.id), db.fetchExpenses(ledger.id)]);
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

  const upsertExpense = async (draft) => {
    try {
      if (draft.id) await db.updateExpense(draft.id, draft);
      else await db.insertExpense(draft, ledger.id);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  };
  const removeExpense = async (id) => { try { await db.deleteExpense(id); refresh(); } catch (e) { setError(e.message); } };
  const reassign = async (id, categoryId) => { try { await db.setExpenseCategory(id, categoryId); refresh(); } catch (e) { setError(e.message); } };
  const commitCategories = async (list) => { try { setCategories(await db.persistCategories(list, categories, ledger.id)); } catch (e) { setError(e.message); } };

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
    let total = 0; const paid = { tommy: 0, wing: 0 }; let balance = 0;
    for (const e of rows) {
      const amt = Number(e.amount) || 0; total += amt; paid[e.paidBy] += amt;
      if (e.split === "shared") balance += e.paidBy === "tommy" ? amt / 2 : -amt / 2;
    }
    return { total, paid, balance };
  }, [rows]);

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
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: TEAL, fontWeight: 700 }}>Tommy &amp; Wing</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.4 }}>{ledger.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onExit} style={ghostBtn} aria-label={t("exit")}>
              <ArrowLeft size={15} /> {t("exit")}
            </button>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("selectMonth")} style={selectStyle}>
              {monthsAvailable.map((m) => (
                <option key={m} value={m}>{new Date(m + "-02").toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" })}</option>
              ))}
            </select>
            <HeaderMenu t={t} lang={lang} changeLang={changeLang} />
          </div>
        </div>

        {error && <div style={errorBox}>{t("loadErr", { msg: error })}</div>}

        {/* Summary / settlement */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          <Stat label={t("spentIn", { month: label })} value={money(summary.total)} big />
          <Stat label={t("paidSuffix", { name: "Tommy" })} value={money(summary.paid.tommy)} dot={PEOPLE[0].color} />
          <Stat label={t("paidSuffix", { name: "Wing" })} value={money(summary.paid.wing)} dot={PEOPLE[1].color} />
        </div>

        <SettlementBar balance={summary.balance} t={t} />

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
              const payer = personById(e.paidBy);
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
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: payer.color }} />
                        {t("paidByRow", { name: payer.name })}
                      </span>
                      <span style={splitBadge(e.split)}>
                        {e.split === "shared" ? <Users size={11} /> : <User size={11} />}
                        {e.split === "shared" ? t("split5050") : t("personal")}
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
        <ExpenseDetail expense={detail} categories={categories} lang={lang} t={t}
          onReassign={(cid) => { reassign(detail.id, cid); setDetail({ ...detail, categoryId: cid }); }}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => { if (confirm(t("deleteConfirm", { name: detail.description }))) { removeExpense(detail.id); setDetail(null); } }}
          onEditCategories={() => setManagingCats(true)}
          onClose={() => setDetail(null)} />
      )}
      {editing !== null && (
        <ExpenseForm initial={editing === "new" ? null : editing} categories={categories} lang={lang} t={t}
          onClose={() => setEditing(null)} onSave={upsertExpense}
          onEditCategories={() => setManagingCats(true)} defaultMonth={month} />
      )}
      {managingCats && (
        <CategoryManager categories={categories} lang={lang} t={t} onChange={commitCategories} onClose={() => setManagingCats(false)} />
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

function SettlementBar({ balance, t }) {
  const settled = Math.abs(balance) < 0.005;
  const wingOwes = balance > 0;
  const from = wingOwes ? PEOPLE[1] : PEOPLE[0];
  const to = wingOwes ? PEOPLE[0] : PEOPLE[1];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 14, borderRadius: 12, color: "#fff", background: settled ? "#334155" : `linear-gradient(90deg, ${from.color}, ${to.color})` }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.85, fontWeight: 700 }}>{t("settleUp")}</div>
      {settled ? (
        <div style={{ fontWeight: 700 }}>{t("allSquare")}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, flexWrap: "wrap" }}>
          <span>{from.name}</span><ArrowRight size={16} /><span>{to.name}</span>
          <span style={{ marginLeft: 4, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{money(Math.abs(balance))}</span>
        </div>
      )}
    </div>
  );
}

function ExpenseDetail({ expense, categories, lang, t, onReassign, onEdit, onDelete, onEditCategories, onClose }) {
  const payer = personById(expense.paidBy);
  const other = otherPerson(expense.paidBy);
  const amt = Number(expense.amount) || 0;
  const shared = expense.split === "shared";
  return (
    <Overlay title={expense.description} onClose={onClose} t={t}>
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(amt)}</div>
        <div style={{ fontSize: 13, color: shared ? TEAL : SUB, fontWeight: 600, marginTop: 2 }}>
          {shared ? t("owesLine", { debtor: other.name, creditor: payer.name, amount: money(amt / 2) }) : t("personalLine")}
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
            <span style={{ width: 8, height: 8, borderRadius: 99, background: payer.color }} />{payer.name}
          </span>
        </FieldRow>
        <FieldRow label={t("split")}>{shared ? t("split5050") : t("personal")}</FieldRow>
        <FieldRow label={t("noteDisplay")} last>{expense.note ? expense.note : "—"}</FieldRow>
      </div>

      {/* Receipt items — stub for the future scan feature */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 6 }}>{t("receiptTitle")}</div>
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", color: SUB, background: "#fff" }}>
          <Receipt size={22} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{t("receiptEmpty")}</div>
        </div>
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

function ExpenseForm({ initial, categories, lang, t, onClose, onSave, onEditCategories, defaultMonth }) {
  const [d, setD] = useState(() => initial || {
    description: "", amount: "", categoryId: categories[0]?.id || null,
    date: `${defaultMonth}-15`, note: "", paidBy: "tommy", split: "shared",
  });
  const [addHst, setAddHst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");

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
    } catch (e) {
      setScanErr(e.message);
    } finally {
      setScanning(false);
    }
  };

  const base = Number(d.amount) || 0;
  const finalAmount = addHst ? Math.round(base * 1.13 * 100) / 100 : base;
  const valid = d.description.trim() && finalAmount > 0 && d.date && d.categoryId && !busy;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    await onSave({ ...d, description: d.description.trim(), amount: finalAmount });
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
        <input autoFocus value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder={t("formWhatPh")} style={input} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label={t("amount")}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: 11, color: SUB }}>$</span>
            <input type="number" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" style={{ ...input, paddingLeft: 24 }} />
          </div>
        </Field>
        <Field label={t("date")}>
          <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} style={input} />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SUB, cursor: "pointer", marginTop: -4 }}>
        <input type="checkbox" checked={addHst} onChange={(e) => setAddHst(e.target.checked)} />
        {t("addHst")} {addHst && base > 0 && <span style={{ color: INK, fontWeight: 600 }}>→ {money(finalAmount)}</span>}
      </label>
      <Field label={t("category")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setD({ ...d, categoryId: c.id })} style={selectablePill(c.color, d.categoryId === c.id)}>{catName(c, lang)}</button>
          ))}
          <button onClick={onEditCategories} style={editCatsPill}><SlidersHorizontal size={13} /> {t("editCategories")}</button>
        </div>
      </Field>
      <Field label={t("whoPaid")}>
        <div style={{ display: "flex", gap: 8 }}>
          {PEOPLE.map((p) => (
            <button key={p.id} onClick={() => setD({ ...d, paidBy: p.id })} style={segBtn(d.paidBy === p.id, p.color)}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: p.color }} />{p.name}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("split")}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setD({ ...d, split: "personal" })} style={segBtn(d.split === "personal", TEAL)}><User size={14} /> {t("personal")}</button>
          <button onClick={() => setD({ ...d, split: "shared" })} style={segBtn(d.split === "shared", TEAL)}><Users size={14} /> {t("split5050")}</button>
        </div>
      </Field>
      <Field label={t("noteLabel")}>
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder={t("notePh")} style={input} />
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

// Header overflow menu. Editing categories moved into the category lists themselves,
// so this is the slot for account actions and the features still to come
// (budgets, reports) rather than a one-off button per feature.
function HeaderMenu({ t, lang, changeLang }) {
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
          <div style={{ padding: "6px 10px 4px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: SUB }}>{t("language")}</div>
          <div style={{ padding: "0 10px 8px" }}><LangToggle lang={lang} changeLang={changeLang} /></div>
          <div style={{ borderTop: `1px solid ${LINE}`, margin: "2px 0 4px" }} />
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

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
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
