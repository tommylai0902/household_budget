// Shared error handling for the two Gemini-backed scan routes.
//
// Both used to return `e.message` verbatim, which on a quota error meant the
// expense form displayed a full paragraph of Google's prose and doc URLs
// ("You exceeded your current quota... head to https://ai.google.dev/..."),
// in English, inside an otherwise translated app. Worse, it reads as a broken
// app when it's just the free tier's few-requests-per-minute ceiling, which
// clears on its own in seconds.
//
// So: 429 becomes a code the client can translate, plus how long to wait.
// Everything else keeps passing the real message through — those are genuine
// faults worth seeing.

export function scanErrorResponse(res, e, label) {
  console.error(`${label} failed:`, e);
  const status = e?.status >= 400 && e.status < 600 ? e.status : 500;
  if (status !== 429) return res.status(status).json({ error: e?.message || "scan failed" });

  // Google puts the wait in the message: "Please retry in 9.930840722s".
  const secs = Number(/retry in ([\d.]+)\s*s/i.exec(e?.message || "")?.[1]);
  const retryAfter = Math.min(60, Math.max(1, Math.ceil(secs || 15)));
  return res.status(429).json({ error: "rate_limited", code: "rate_limited", retryAfter });
}
