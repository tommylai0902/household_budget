// Run: node api/refresh-flyers.test.js
import assert from "node:assert";
import { isRefreshDue } from "./refresh-flyers.js";

// 2026-08-13 is a Thursday, so: 08-12 Wed, 08-14 Fri, 08-15 Sat, 08-08 Sat.
const THU = "2026-08-13T08:00:00Z";
const FRI = "2026-08-14T08:00:00Z";
const SAT = "2026-08-15T08:00:00Z";
const at = (iso) => new Date(iso).getTime();
const hoursBefore = (iso, h) => new Date(at(iso) - h * 3_600_000).toISOString();
const daysBefore = (iso, d) => hoursBefore(iso, d * 24);

// An empty mirror always runs — there is nothing to serve until it does.
assert.equal(isRefreshDue(null, at(THU)), true);
assert.equal(isRefreshDue(undefined, at(FRI)), true);

// Thursday and Saturday are the scheduled days.
assert.equal(isRefreshDue(daysBefore(THU, 3), at(THU)), true, "Thursday should run");
assert.equal(isRefreshDue(daysBefore(SAT, 2), at(SAT)), true, "Saturday should run");

// Saturday is the whole point of the second day: Friday-start merchants (T&T,
// Oceans, Blue Sky...) publish on the day they take effect, so a Thursday-only
// mirror only ever reached them on their final day.
assert.equal(isRefreshDue(daysBefore(SAT, 2), at(SAT)), true);

// Any other day is not a scheduled run.
assert.equal(isRefreshDue(daysBefore(FRI, 1), at(FRI)), false, "Friday should skip");

// ...unless the mirror has gone stale enough to be serving expired prices, in
// which case a missed run self-heals instead of waiting a full cycle.
assert.equal(isRefreshDue(daysBefore(FRI, 9), at(FRI)), true, "9 days stale should self-heal");
assert.equal(isRefreshDue(daysBefore(FRI, 7), at(FRI)), false, "7 days is not yet stale");

// Vercel Hobby fires crons roughly daily whatever the expression says, so a
// same-day re-fire must not mirror the whole region twice.
assert.equal(isRefreshDue(hoursBefore(THU, 3), at(THU)), false, "same-day re-fire");
assert.equal(isRefreshDue(hoursBefore(THU, 19), at(THU)), false, "under the 20h floor");
assert.equal(isRefreshDue(hoursBefore(THU, 21), at(THU)), true, "over the 20h floor");

// Regression, the bug that caused the outage: a one-off manual refresh on the
// Saturday left the real Thursday run 5 days later, and the old flat "skip if
// under 6 days" threshold silently skipped it — pushing the next attempt out a
// further week and leaving every grocery flyer in the mirror expired.
assert.equal(isRefreshDue("2026-08-08T02:00:00Z", at(THU)), true, "manual Sat refresh must not block Thu");

console.log("refresh-flyers.js: all checks passed");
