import { createClient } from "@supabase/supabase-js";
import { hasChineseChars, translateZhGroceryTerm } from "../src/lib/zhGroceryTerms.js";

// User-facing price lookup. Searches the flyer_items mirror and nothing else --
// Flipp is only ever called by the Thursday cron (api/refresh-flyers.js), so
// no amount of tapping "Price Match Check" can get this IP rate-limited.
//
// Because the cron copies whole flyers rather than caching past searches, a
// term nobody has ever looked up still answers immediately, as long as the
// product appears in some flyer for that region.

const MAX_RESULTS = 25;
const normalisePostal = (s) => (s || "").toUpperCase().replace(/\s+/g, "");
// PostgREST treats these as wildcards inside ilike, so a search for "50%" or
// "cream_cheese" would otherwise match far more than the user typed.
const escapeLike = (s) => s.replace(/[%_\\]/g, "\\$&");
// Same idea for the regex matcher below. Must not be skipped: the term comes
// straight from a grocery-list row, and an unescaped `(a+)+` reaching Postgres
// is a query that never finishes.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// `\y` is Postgres's word boundary. Plain substring matching is far too loose
// on a flyer table: `%egg%` returns 105 rows for this region, 41 of them
// Eggplant/Veggie/Eggo, which then push real eggs off the end of the 25-row
// limit. The trailing `(s|es)?` keeps plurals working — "egg" still has to
// find "Large White Eggs" — without letting a term match inside a longer word.
// Measured on the live mirror: 105 rows -> 50, keeping all 48 genuine egg rows.
const wordPattern = (term) => `\\y${escapeRegex(term)}(s|es)?\\y`;

export default async function handler(req, res) {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  const { searchParams } = new URL(req.url, "http://internal");
  const q = (searchParams.get("q") || "").trim();
  const postalCode = normalisePostal(searchParams.get("postalCode") || searchParams.get("postal_code") || "");
  if (!q) return res.status(400).json({ error: "q required" });

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

  // Rebuilt per attempt rather than reused — postgrest-js filter methods mutate
  // and return `this`, so a shared builder can't be branched on brand below.
  // Takes the search term as a parameter (not closed over q) so the Chinese
  // fallback further down can rebuild it against a translated term too.
  const baseQuery = (term, loose = false) => {
    let qb = supabase
      .from("flyer_items")
      .select("name, price, merchant, valid_from, valid_to, image_url, merchant_logo, flyer_id, item_id")
      .eq("postal_code", postalCode);
    // Precise by default, substring only as a last resort — see searchTerm.
    qb = loose
      ? qb.ilike("name", `%${escapeLike(term)}%`)
      : qb.filter("name", "imatch", wordPattern(term));
    // Expired deals are worse than no deal — a cashier checks the date and turns
    // it down, having wasted the trip. Weekly flyers overlap, so the mirror
    // always holds some already-past items. Rows with no end date are kept: an
    // unknown expiry is not the same as a known-expired one.
    if (searchParams.get("includeExpired") !== "1") {
      const today = new Date().toISOString().slice(0, 10);
      qb = qb.or(`valid_to.gte.${today},valid_to.is.null`);
    }
    return qb;
  };

  // Flipp writes the brand into the item name itself ("NEILSON CHOCOLATE MILK
  // 750mL"), so narrowing is just a further substring match on the same column
  // rather than a separate field. Optional; blank adds no filter.
  //
  // A `size` filter worked the same way and was dropped in migration 027 —
  // matched as a substring it made results worse, "750" pulling in
  // "MILK BONE DOG BISCUITS ... 750-900 G" on a search for milk.
  const brand = (searchParams.get("brand") || "").trim();

  // One attempt: word-boundary or substring, with or without the brand filter.
  const attempt = (term, { loose, withBrand }) => {
    const qb = baseQuery(term, loose);
    return (withBrand ? qb.ilike("name", `%${escapeLike(brand)}%`) : qb)
      .order("price", { ascending: true }).limit(MAX_RESULTS);
  };

  // Widens in fixed order and stops at the first attempt that finds anything,
  // so the most precise result available always wins.
  //
  // Dropping the brand comes first because Flipp folds several products into
  // one "OR" flyer line ("REAL DAIRY OR DRUMSTICK ICE CREAM") without naming
  // the manufacturer — a brand match failing is not proof the deal is missing.
  // Substring comes last: it is what pulls Eggplant into a search for eggs, so
  // it is only worth reaching for once the precise pass has found nothing at
  // all, where a loose hit still beats reporting "no deals".
  const searchTerm = async (term) => {
    const widening = brand
      ? [{ loose: false, withBrand: true }, { loose: false, withBrand: false },
         { loose: true, withBrand: true }, { loose: true, withBrand: false }]
      : [{ loose: false, withBrand: false }, { loose: true, withBrand: false }];
    let last;
    for (const step of widening) {
      last = await attempt(term, step);
      if (last.error || last.data?.length) return last;
    }
    return last;
  };

  // The same flyer line can arrive from more than one term, so results are
  // always deduped and re-sorted before being cut to MAX_RESULTS — otherwise
  // merging two searches could return the same deal twice and push a cheaper
  // one off the end.
  const mergeDeals = (...lists) => {
    const seen = new Set();
    return lists.flat()
      .filter((d) => {
        const k = `${d.merchant}|${d.name}|${d.price}`;
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_RESULTS);
  };

  let { data, error } = await searchTerm(q);
  if (error) return res.status(500).json({ error: error.message });

  // A Chinese-typed item ("雞脾") is searched in BOTH languages and the results
  // merged — not English-only-if-Chinese-found-nothing. The region carries
  // flyers in both: a handful of Asian grocers publish in Chinese, everyone
  // else in English. Falling back only on zero results meant one match at one
  // Chinese-language grocer suppressed the English search entirely, hiding
  // every English flyer for the same product — including cheaper ones, which
  // is the whole point of looking.
  //
  // One term can also map to several competing English spellings (cling wrap /
  // clingwrap / plastic wrap all appear for 保鮮紙), so every alternative is
  // searched too rather than stopping at the first that hits.
  if (hasChineseChars(q)) {
    const lists = [data || []];
    for (const en of translateZhGroceryTerm(q) || []) {
      const alt = await searchTerm(en);
      if (alt.error) return res.status(500).json({ error: alt.error.message });
      lists.push(alt.data || []);
    }
    data = mergeDeals(...lists);
  }

  const deals = (data || []).map((d) => ({
    name: d.name, price: Number(d.price), merchant: d.merchant,
    validFrom: d.valid_from, validTo: d.valid_to,
    imageUrl: d.image_url, merchantLogo: d.merchant_logo,
    // Enough to rebuild the public flyer URL client-side — see migration 028.
    // itemId (039) lets that link jump straight to this item's position in
    // the flyer instead of the front page; older mirrored rows may not have
    // one yet, in which case the client falls back to the flyer-only link.
    flyerId: d.flyer_id, itemId: d.item_id, postalCode,
  }));

  // An empty result has three very different causes and the user cannot tell
  // them apart from the outside -- a mirror that never ran, and a mirror that
  // has gone stale, both look exactly like "nothing is on sale". Separate them
  // before answering, so a data-collection failure is never reported as a
  // shopping fact.
  if (!deals.length) {
    const today = new Date().toISOString().slice(0, 10);
    const region = supabase.from("flyer_items").select("id", { count: "exact", head: true }).eq("postal_code", postalCode);
    const { count: total } = await region;
    // Never mirrored this region.
    if (!total) return res.status(200).json({ query: q, deals: [], lowestPrice: null, lowestMerchant: null, pending: true });

    // Mirrored, but nothing in it is still valid. This is exact rather than a
    // staleness threshold: the region always carries some live flyer while the
    // cron is keeping up, so zero live rows means a run was missed, full stop.
    const { count: live } = await supabase
      .from("flyer_items").select("id", { count: "exact", head: true })
      .eq("postal_code", postalCode).or(`valid_to.gte.${today},valid_to.is.null`);
    if (!live) {
      const { data: last } = await supabase
        .from("flyer_items").select("fetched_at").eq("postal_code", postalCode)
        .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      return res.status(200).json({
        query: q, deals: [], lowestPrice: null, lowestMerchant: null,
        stale: true, lastRun: last?.fetched_at || null,
      });
    }
  }

  return res.status(200).json({
    query: q,
    deals,
    lowestPrice: deals[0]?.price ?? null,
    lowestMerchant: deals[0]?.merchant ?? null,
  });
}
