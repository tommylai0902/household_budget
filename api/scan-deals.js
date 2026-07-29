import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  const { searchParams } = new URL(req.url, "http://internal");
  const q = (searchParams.get("q") || "").trim();
  const postalCode = normalisePostal(searchParams.get("postalCode") || searchParams.get("postal_code") || "");
  if (!q) return res.status(400).json({ error: "q required" });

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

  let query = supabase
    .from("flyer_items")
    .select("name, price, merchant, valid_from, valid_to, image_url, merchant_logo, flyer_id")
    .eq("postal_code", postalCode)
    .ilike("name", `%${escapeLike(q)}%`);

  // Flipp writes the brand into the item name itself ("NEILSON CHOCOLATE MILK
  // 750mL"), so narrowing is just a further substring match on the same column
  // rather than a separate field. Optional; blank adds no filter.
  //
  // A `size` filter worked the same way and was dropped in migration 027 —
  // matched as a substring it made results worse, "750" pulling in
  // "MILK BONE DOG BISCUITS ... 750-900 G" on a search for milk.
  const brand = (searchParams.get("brand") || "").trim();
  if (brand) query = query.ilike("name", `%${escapeLike(brand)}%`);

  // Expired deals are worse than no deal — a cashier checks the date and turns
  // it down, having wasted the trip. Weekly flyers overlap, so the mirror
  // always holds some already-past items. Rows with no end date are kept: an
  // unknown expiry is not the same as a known-expired one.
  if (searchParams.get("includeExpired") !== "1") {
    const today = new Date().toISOString().slice(0, 10);
    query = query.or(`valid_to.gte.${today},valid_to.is.null`);
  }

  const { data, error } = await query.order("price", { ascending: true }).limit(MAX_RESULTS);
  if (error) return res.status(500).json({ error: error.message });

  const deals = (data || []).map((d) => ({
    name: d.name, price: Number(d.price), merchant: d.merchant,
    validFrom: d.valid_from, validTo: d.valid_to,
    imageUrl: d.image_url, merchantLogo: d.merchant_logo,
    // Enough to rebuild the public flyer URL client-side — see migration 028.
    flyerId: d.flyer_id, postalCode,
  }));

  // No rows for the region at all means the weekly mirror hasn't run for it
  // yet -- worth telling the user apart from "we looked, nothing is on sale".
  if (!deals.length) {
    const { count } = await supabase
      .from("flyer_items").select("id", { count: "exact", head: true }).eq("postal_code", postalCode);
    if (!count) return res.status(200).json({ query: q, deals: [], lowestPrice: null, lowestMerchant: null, pending: true });
  }

  return res.status(200).json({
    query: q,
    deals,
    lowestPrice: deals[0]?.price ?? null,
    lowestMerchant: deals[0]?.merchant ?? null,
  });
}
