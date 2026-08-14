import { createClient } from "@supabase/supabase-js";

// Thursday/Saturday flyer mirror (scheduled in vercel.json). For every
// distinct postal code any household has saved, this copies every item out
// of every current flyer into flyer_items. api/scan-deals.js then answers
// user searches from that table,
// so Flipp sees one batch a week from this IP instead of a request per tap --
// and anything printed in a flyer is searchable immediately, even for items
// added to a list days after the run.
//
// Measured shape (M5A0E7): ~170 flyers, ~790 items each, ~435ms per flyer.
// Sequential that's 74s, past every serverless limit, hence CONCURRENCY.

const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";
const LOCALE = "en-ca";
const CONCURRENCY = 6;          // polite but finishes in ~15s rather than ~75s
const INSERT_BATCH = 2000;      // rows per PostgREST call
// ponytail: fixed budget rather than resumable checkpointing. Vercel kills the
// function at maxDuration and a half-written region is worse than a capped
// one, so the loop stops cleanly and reports how far it got. If regions grow
// past this, add a `?after=<flyerId>` cursor and chain a second invocation.
const TIME_BUDGET_MS = 240_000;
// Vercel Hobby fires crons roughly daily whatever the expression says, so the
// cadence is enforced here rather than trusted to the schedule. This can't be
// a plain age threshold: 6 days once skipped the real Thursday run because a
// manual refresh had happened 5 days earlier (Sat), which left the mirror 12
// days stale and every grocery flyer in it expired. So gate on the day
// instead; anything else only rescues a mirror that has gone stale enough to
// be serving expired prices.
//
// Thursday AND Saturday, because Flipp publishes each flyer on its own
// schedule and one weekly run cannot cover both shapes. Flipp exposes
// `available_from` separately from `valid_from`: roughly half the region's
// flyers go up a day early (the big chains' Thursday flyer is already up on
// Wednesday, so Thursday catches them), but the other half become available
// the same day they take effect. That second group is mostly Friday-start
// merchants -- T&T, Oceans, Blue Sky, Bestco, Fresh Land, Tone Tai, Food
// Depot -- whose flyers run Fri->Thu. A Thursday-only run reaches them just
// as they expire, so they were effectively never searchable. Saturday catches
// that group while it is still fresh.
const REFRESH_DAYS = [4, 6];                             // Thu, Sat (UTC)
const MIN_REFRESH_GAP_MS = 20 * 60 * 60 * 1000;          // never twice in one day
const STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;          // a missed run self-heals

// Pure so it can be tested without a database or a live clock — this guard has
// already caused one silent multi-day outage, and its bugs are invisible from
// the outside (a wrongly-skipped run looks exactly like "nothing is on sale").
export function isRefreshDue(lastFetchedAt, now = Date.now()) {
  if (!lastFetchedAt) return true;                       // empty mirror: always run
  const age = now - new Date(lastFetchedAt).getTime();
  if (age < MIN_REFRESH_GAP_MS) return false;
  return REFRESH_DAYS.includes(new Date(now).getUTCDay()) || age >= STALE_AFTER_MS;
}

// Flipp's flyer endpoint wants no spaces; storing the same normalised form is
// what lets a search for "M5A 0E7" hit rows written as "M5A0E7".
const normalisePostal = (s) => (s || "").toUpperCase().replace(/\s+/g, "");

// Flipp hands back http:// image URLs. The app is served over HTTPS, where
// browsers block mixed content outright — stored as-is these render as broken
// images. Both hosts serve the same asset fine over TLS.
const https = (u) => (u ? u.replace(/^http:\/\//i, "https://") : null);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`flipp responded ${res.status}`);
  return res.json();
}

// Runs `worker` over `jobs` with a fixed number of parallel runners. Plain
// Promise.all would fire all 170 requests at once, which is exactly the
// traffic shape that gets an IP blocked.
async function pool(jobs, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (i < jobs.length) await worker(jobs[i++]);
  });
  await Promise.all(runners);
}

export default async function handler(req, res) {
  // Not destructured to a bare `URL` — that shadows the global URL constructor
  // used just below, and the resulting TypeError takes the whole process down.
  const { VITE_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE: SERVICE, CRON_SECRET } = process.env;

  // Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
  // Without this the endpoint is a public button for hammering Flipp.
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!SERVICE) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE not configured" });

  // Service role: this job reads postal codes across every ledger and writes
  // flyer_items, both of which RLS blocks for the anon key.
  const supabase = createClient(SUPABASE_URL, SERVICE);
  const startedAt = Date.now();

  try {
    const params = new URL(req.url, "http://internal").searchParams;
    const force = params.get("force") === "1";
    const maxFlyers = Number(params.get("maxFlyers")) || Infinity;

    if (!force) {
      const { data: last } = await supabase
        .from("flyer_items").select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      if (last && !isRefreshDue(last.fetched_at)) {
        const age = Date.now() - new Date(last.fetched_at).getTime();
        return res.status(200).json({ skipped: "not due yet", lastRun: last.fetched_at, ageDays: +(age / 86_400_000).toFixed(1) });
      }
    }

    // household_settings is one row per household ledger (migration 043) —
    // several households can share a region, so postal codes are deduped
    // into a set before mirroring, same as the pre-038 per-ledger version of
    // this route did (each household's own local flyers, one Flipp call per
    // distinct region rather than per household).
    const { data: settings, error: settingsErr } = await supabase
      .from("household_settings").select("postal_code");
    if (settingsErr) throw settingsErr;

    const postalCodes = [...new Set((settings || []).map((s) => normalisePostal(s.postal_code)).filter(Boolean))];
    if (!postalCodes.length) return res.status(200).json({ skipped: "no household has a postal code set" });

    const report = [];
    for (const postalCode of postalCodes) {
      const runAt = new Date().toISOString();
      const { flyers = [] } = await getJson(`${FLIPP_BASE}/flyers?locale=${LOCALE}&postal_code=${postalCode}`);
      const wanted = flyers.slice(0, maxFlyers === Infinity ? flyers.length : maxFlyers);

      let rows = [], failed = 0, fetched = 0, timedOut = false;
      await pool(wanted, CONCURRENCY, async (f) => {
        if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; return; }
        try {
          const { items = [] } = await getJson(`${FLIPP_BASE}/flyers/${f.id}?locale=${LOCALE}`);
          for (const it of items) {
            const price = Number(it.price);
            // Plenty of flyer entries are images or headings with no price;
            // they'd only ever be noise in a "what's cheapest" search.
            if (!it.name || !Number.isFinite(price) || price <= 0) continue;
            rows.push({
              postal_code: postalCode,
              merchant: f.merchant || "Unknown",
              // Flipp's own labelling ("All Flyers,Groceries" vs
              // "...,Home & Garden,Automotive") — lets store setup lead with
              // supermarkets instead of listing every hardware shop in the
              // region. Kept as the raw CSV it arrives as; see migration 032.
              categories: f.categories_csv || null,
              name: it.name,
              price,
              valid_from: (it.valid_from || f.valid_from || "").slice(0, 10) || null,
              valid_to: (it.valid_to || f.valid_to || "").slice(0, 10) || null,
              flyer_id: f.id,
              // Flipp's own per-item id — lets a link jump straight to this
              // item's position in the flyer instead of the front page. See
              // migration 039.
              item_id: it.id || null,
              image_url: https(it.cutout_image_url),
              merchant_logo: https(f.merchant_logo),
              fetched_at: runAt,
            });
          }
          fetched++;
        } catch (e) {
          console.error(`refresh-flyers: flyer ${f.id} (${f.merchant}) failed:`, e.message);
          failed++;
        }
      });

      // Same item repeats across pages of one flyer; no point storing it twice.
      const seen = new Set();
      rows = rows.filter((r) => {
        const k = `${r.merchant}|${r.name}|${r.price}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });

      let inserted = 0;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error } = await supabase.from("flyer_items").insert(rows.slice(i, i + INSERT_BATCH));
        if (error) throw error;
        inserted += Math.min(INSERT_BATCH, rows.length - i);
      }

      // Sweep the previous run only after the new rows are safely in, so a
      // search during the refresh sees last week's prices rather than nothing.
      let swept = 0;
      if (inserted) {
        const { count } = await supabase.from("flyer_items")
          .delete({ count: "exact" }).eq("postal_code", postalCode).lt("fetched_at", runAt);
        swept = count ?? 0;
      }

      report.push({ postalCode, flyers: wanted.length, fetched, failed, items: inserted, swept, timedOut });
    }

    return res.status(200).json({ ok: true, elapsedMs: Date.now() - startedAt, regions: report });
  } catch (e) {
    console.error("refresh-flyers failed:", e);
    return res.status(500).json({ error: e.message || "refresh failed" });
  }
}
