// Shared request options + error handling for the Gemini-backed scan routes.
//
// SCAN_REQUEST_OPTS turns the SDK's retries off. By default it retries 429 (and
// 5xx/network) up to 5 times with backoff, up to ~30s — so against Google's
// tiny free-tier quota a single scan tap spends the whole per-minute allowance
// retrying itself, then still fails after a half-minute hang. strategy:"none"
// makes one tap cost one request and fail on the first response; the caller
// re-taps on a transient blip, which beats a 30s freeze.
//
// It's the SECOND arg to interactions.create, not a client option: the
// interactions bridge reads retry config per-call only — a retry_config on the
// constructor never reaches it (it builds its own inner client).
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

export const SCAN_REQUEST_OPTS = { retries: { strategy: "none" } };

export function scanErrorResponse(res, e, label) {
  console.error(`${label} failed:`, e);
  const status = e?.status >= 400 && e.status < 600 ? e.status : 500;
  if (status !== 429) return res.status(status).json({ error: e?.message || "scan failed" });

  // Google puts the wait in the message: "Please retry in 9.930840722s".
  const secs = Number(/retry in ([\d.]+)\s*s/i.exec(e?.message || "")?.[1]);
  const retryAfter = Math.min(60, Math.max(1, Math.ceil(secs || 15)));
  return res.status(429).json({ error: "rate_limited", code: "rate_limited", retryAfter });
}
