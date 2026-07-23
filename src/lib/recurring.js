// Pure date math for recurring rules — no Supabase, so it stays unit-testable.
// ISO strings compare correctly as YYYY-MM-DD, so everything is string-based and
// timezone-free.

export function nextOccurrence(iso, freq) {
  const d = new Date(iso + "T00:00:00");
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly; JS rolls month-end forward (Jan 31 -> Mar)
  return d.toISOString().slice(0, 10);
}

// Occurrences from `fromISO` up to and including `todayISO`. Capped so a bad start
// date can't loop forever. ponytail: 400 covers ~7 years of weekly; raise if needed.
export function dueOccurrences(fromISO, freq, todayISO, max = 400) {
  const out = [];
  let occ = fromISO, guard = 0;
  while (occ <= todayISO && guard < max) { out.push(occ); occ = nextOccurrence(occ, freq); guard++; }
  return out;
}
