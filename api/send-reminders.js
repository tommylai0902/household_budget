import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { notificationUrl } from "../src/lib/notificationLink.js";

// Daily reminder run (scheduled in vercel.json). Two jobs, in order:
//
//   1. Generate the expiry reminder rows that the client would otherwise only
//      create when somebody opens a ledger. Without this the push half has
//      nothing to send: no visit, no rows.
//   2. Push whatever is now due to every device that asked for one.
//
// Mirrors db.js's syncExpiryReminders rather than importing it — that module is
// bound to the browser's anon-key client, and this runs with the service role,
// past RLS. The upsert shape and the cycle_date guard are deliberately
// identical; if one changes the other has to follow.
//
// Inventory (and the expiry reminders it produces) is household-wide, not
// ledger-scoped (migration 038) — those notifications write ledger_id null
// and go to every household member (`members`), not one ledger's roster.

const EXPIRY_LEAD_DAYS = 3; // keep in step with db.js

// The one string this job writes. Kept here rather than imported from the UI's
// table: the API routes don't share a module with BudgetApp.jsx, and this is
// one line per language against a whole i18n dictionary.
const EXPIRY_TITLE = {
  en: (name, date) => `${name} expires ${date}`,
  zh: (name, date) => `${name} ${date} 到期`,
  "zh-Hans": (name, date) => `${name} ${date} 到期`,
  fr: (name, date) => `${name} périme le ${date}`,
  es: (name, date) => `${name} caduca el ${date}`,
};
const DATE_LOCALES = { en: "en-CA", zh: "zh-HK", "zh-Hans": "zh-CN", fr: "fr-CA", es: "es-ES" };

const shortDate = (iso, lang) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(DATE_LOCALES[lang] || "en-CA", { month: "short", day: "numeric" });

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function handler(req, res) {
  const {
    VITE_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE: SERVICE, CRON_SECRET,
    VITE_VAPID_PUBLIC_KEY: VAPID_PUBLIC, VAPID_PRIVATE_KEY: VAPID_PRIVATE,
    VAPID_SUBJECT,
  } = process.env;

  // Same gate as refresh-flyers: Vercel sends this header on scheduled runs.
  // Without it this is a public button for spamming everyone's phone.
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!SERVICE) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE not configured" });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(500).json({ error: "VAPID keys not configured" });

  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:noreply@example.com", VAPID_PUBLIC, VAPID_PRIVATE);
  const supabase = createClient(SUPABASE_URL, SERVICE);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ---- 1. generate expiry reminders ----
    // Inventory is household-wide, not ledger-scoped (migration 038), so
    // these rows are written with ledger_id null — see langOf/recipients below.
    const [{ data: items, error: ierr }, { data: tracked, error: terr }, { data: subs, error: serr }, { data: members, error: merr }] = await Promise.all([
      supabase.from("inventory_items").select("id, name, expiry_date").not("expiry_date", "is", null),
      supabase.from("notifications").select("inventory_item_id, cycle_date").not("inventory_item_id", "is", null),
      supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, lang"),
      supabase.from("members").select("user_id"),
    ]);
    if (ierr) throw ierr;
    if (terr) throw terr;
    if (serr) throw serr;
    if (merr) throw merr;

    const trackedByItem = new Map((tracked || []).map((r) => [r.inventory_item_id, r.cycle_date]));

    // Who can see each ledger: its owner, plus anyone holding a role on it.
    // Only used for the (still per-ledger) upcoming-charge producer's
    // recipients now — inventory expiry uses the household-wide set below.
    const [{ data: roles }, { data: ledgers }] = await Promise.all([
      supabase.from("ledger_role").select("ledger_id, user_id"),
      supabase.from("ledgers").select("id, owner_id"),
    ]);
    const usersByLedger = new Map();
    for (const l of ledgers || []) usersByLedger.set(l.id, new Set([l.owner_id].filter(Boolean)));
    for (const r of roles || []) {
      if (!usersByLedger.has(r.ledger_id)) usersByLedger.set(r.ledger_id, new Set());
      usersByLedger.get(r.ledger_id).add(r.user_id);
    }
    // Everyone in the household allowlist — the recipient set for
    // household-wide (ledger_id null) notifications, i.e. inventory expiry.
    const householdUsers = new Set((members || []).map((m) => m.user_id));

    // Which language to write a row's title in. The row feeds the in-app bell,
    // which is shared by everyone who can see it, so there is no single right
    // answer for a mixed-language household — the first subscribed member's
    // language is the closest available guess, and English if nobody has
    // subscribed. The push itself is per-device and always in that device's
    // own language, further down.
    const langByUser = new Map((subs || []).map((s) => [s.user_id, s.lang]));
    const langOf = (userIds) => [...userIds].map((u) => langByUser.get(u)).find(Boolean) || "en";

    let created = 0;
    for (const item of items || []) {
      if (trackedByItem.get(item.id) === item.expiry_date) continue; // already built for this date
      const lang = langOf(householdUsers);
      const title = (EXPIRY_TITLE[lang] || EXPIRY_TITLE.en)(item.name, shortDate(item.expiry_date, lang));
      const { error } = await supabase.from("notifications").upsert(
        {
          ledger_id: null, inventory_item_id: item.id, title,
          remind_at: addDays(item.expiry_date, -EXPIRY_LEAD_DAYS),
          cycle_date: item.expiry_date, read: false,
        },
        { onConflict: "inventory_item_id" },
      );
      if (error) throw error;
      created++;
    }

    // ---- 2. push what's due ----
    // Unread only: something already dealt with in the bell shouldn't buzz a
    // phone. pushed_at null keeps a daily cron from re-sending the same one.
    // The three source ids come along so each push can deep-link to the row
    // that triggered it (notificationUrl) instead of dumping everyone on "/".
    const { data: due, error: derr } = await supabase
      .from("notifications").select("id, ledger_id, expense_id, recurring_rule_id, inventory_item_id, title")
      .lte("remind_at", today).is("pushed_at", null).eq("read", false);
    if (derr) throw derr;

    if (!due?.length) return res.status(200).json({ ok: true, created, due: 0, sent: 0 });
    if (!subs?.length) return res.status(200).json({ ok: true, created, due: due.length, sent: 0, note: "no push subscriptions yet" });

    const subsByUser = new Map();
    for (const s of subs) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id).push(s);
    }

    let sent = 0, pruned = 0;
    const pushedIds = [], deadEndpoints = [];
    for (const n of due) {
      let anySent = false;
      const url = notificationUrl(n);
      const recipients = n.ledger_id == null ? householdUsers : (usersByLedger.get(n.ledger_id) || []);
      for (const userId of recipients) {
        for (const s of subsByUser.get(userId) || []) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: n.title, body: "", tag: `notif-${n.id}`, url }),
            );
            sent++; anySent = true;
          } catch (e) {
            // 404/410 = the browser threw this subscription away (app deleted,
            // permission revoked). It will never work again, so drop it rather
            // than retrying it every night forever.
            if (e.statusCode === 404 || e.statusCode === 410) deadEndpoints.push(s.endpoint);
            else console.error("send-reminders: push failed", e.statusCode, e.body || e.message);
          }
        }
      }
      // Only mark sent if something actually went out — otherwise a run with
      // every subscription temporarily failing would silently burn the reminder.
      if (anySent) pushedIds.push(n.id);
    }

    if (pushedIds.length) {
      const { error } = await supabase.from("notifications")
        .update({ pushed_at: new Date().toISOString() }).in("id", pushedIds);
      if (error) throw error;
    }
    if (deadEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
      pruned = deadEndpoints.length;
    }

    return res.status(200).json({ ok: true, created, due: due.length, sent, marked: pushedIds.length, pruned });
  } catch (e) {
    console.error("send-reminders failed:", e);
    return res.status(500).json({ error: e.message || "send failed" });
  }
}
