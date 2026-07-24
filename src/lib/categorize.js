// Learns from history instead of a stored mapping: once the same description
// (exact, case-insensitive) has been filed under one category 3+ times,
// typing it again suggests that category. Ties or fewer than 3 matches
// return null — never guess off a slim majority.
export function suggestCategoryId(description, expenses) {
  const norm = (description || "").trim().toLowerCase();
  if (!norm) return null;
  const counts = new Map();
  for (const e of expenses) {
    if (!e.categoryId || (e.description || "").trim().toLowerCase() !== norm) continue;
    counts.set(e.categoryId, (counts.get(e.categoryId) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [id, count] of counts) if (count > bestCount) { best = id; bestCount = count; }
  return bestCount >= 3 ? best : null;
}
