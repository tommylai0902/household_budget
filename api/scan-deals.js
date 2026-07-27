import { createClient } from "@supabase/supabase-js";

// Flipp's internal backend endpoint (no official API/key) -- shape below is a
// best guess from typical Flipp flyer-item JSON; adjust field names once
// tested against a real response.
const FLIPP_URL = "https://backflipp.wishabi.com/flipp/items/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export default async function handler(req, res) {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  const { searchParams } = new URL(req.url, "http://internal");
  const q = (searchParams.get("q") || "").trim();
  const postalCode = (searchParams.get("postalCode") || searchParams.get("postal_code") || "").trim();
  if (!q) return res.status(400).json({ error: "q required" });

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

  const { data: cached } = await supabase
    .from("deals_cache").select("results, fetched_at").eq("query", q).eq("postal_code", postalCode).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return res.status(200).json(cached.results);
  }

  try {
    const url = `${FLIPP_URL}?q=${encodeURIComponent(q)}&postal_code=${encodeURIComponent(postalCode)}`;
    const flippRes = await fetch(url);
    if (!flippRes.ok) throw new Error(`flipp responded ${flippRes.status}`);
    const raw = await flippRes.json();

    const items = (raw.items || raw.data?.items || [])
      .map((it) => ({
        name: it.name || q,
        merchant: it.merchant_name || it.flyer_name || "Unknown",
        price: Number(it.current_price ?? it.price ?? 0),
      }))
      .filter((d) => d.price > 0)
      .sort((a, b) => a.price - b.price);

    const result = {
      query: q,
      deals: items,
      lowestPrice: items[0]?.price ?? null,
      lowestMerchant: items[0]?.merchant ?? null,
    };

    await supabase.from("deals_cache").upsert(
      { query: q, postal_code: postalCode, results: result, fetched_at: new Date().toISOString() },
      { onConflict: "query,postal_code" },
    );

    return res.status(200).json(result);
  } catch (e) {
    console.error("scan-deals failed:", e);
    if (cached) return res.status(200).json(cached.results); // stale cache beats nothing
    return res.status(502).json({ error: e.message || "deal lookup failed" });
  }
}
