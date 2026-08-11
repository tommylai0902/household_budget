// Run: node src/lib/settle.test.js
import assert from "node:assert/strict";
import { netBalances, settlements, sharedShares, splitCents } from "./settle.js";

const M = (...names) => names.map((n) => ({ id: n, name: n }));
// shared(payer, amount, ...whoShares) — the payer is not automatically included.
const shared = (paidById, amount, ...sharedWith) => ({ paidById, amount, split: "shared", sharedWith });
const personal = (paidById, amount) => ({ paidById, amount, split: "personal" });
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

// --- two members: the classic case the app started with ---
{
  const ms = M("t", "w");
  const net = netBalances([shared("t", 100, "t", "w")], ms);
  assert.equal(net.get("t"), 50, "payer is owed half");
  assert.equal(net.get("w"), -50, "other owes half");

  assert.deepEqual(settlements([shared("t", 100, "t", "w")], ms), [{ fromId: "w", toId: "t", amount: 50 }]);
}

// --- personal expenses never move money ---
{
  const ms = M("t", "w");
  assert.deepEqual(settlements([personal("t", 80)], ms), []);
  const mixed = settlements([personal("t", 80), shared("t", 100, "t", "w")], ms);
  assert.deepEqual(mixed, [{ fromId: "w", toId: "t", amount: 50 }], "personal ignored");
}

// --- three members, everyone in ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 90, "a", "b", "c")], ms);
  assert.equal(net.get("a"), 60, "paid 90, owes 30");
  assert.equal(net.get("b"), -30);
  assert.equal(net.get("c"), -30);

  const s = settlements([shared("a", 90, "a", "b", "c")], ms);
  assert.equal(s.length, 2, "two debtors, two transfers");
  assert.ok(s.every((x) => x.toId === "a"));
  assert.equal(sum(s.map((x) => x.amount)), 60);
}

// --- a subset shares it: c wasn't there ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 90, "a", "b")], ms);
  assert.equal(net.get("a"), 45, "split two ways, not three");
  assert.equal(net.get("b"), -45);
  assert.equal(net.get("c"), 0, "absent member owes nothing");

  assert.deepEqual(settlements([shared("a", 90, "a", "b")], ms), [{ fromId: "b", toId: "a", amount: 45 }]);
}

// --- the payer isn't always one of the sharers ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 60, "b", "c")], ms);
  assert.equal(net.get("a"), 60, "covered it without eating — owed the lot");
  assert.equal(net.get("b"), -30);
  assert.equal(net.get("c"), -30);
}

// --- three members who each paid the same: nothing to settle ---
{
  const ms = M("a", "b", "c");
  const all = ["a", "b", "c"];
  const s = settlements([shared("a", 30, ...all), shared("b", 30, ...all), shared("c", 30, ...all)], ms);
  assert.deepEqual(s, [], "already square");
}

// --- conservation: what leaves debtors equals what reaches creditors ---
{
  const ms = M("a", "b", "c", "d");
  const exps = [
    shared("a", 120, "a", "b", "c", "d"),
    shared("b", 40, "b", "c"),
    personal("c", 500),
    shared("d", 8, "a", "d"),
  ];
  const net = netBalances(exps, ms);
  assert.ok(Math.abs(sum([...net.values()])) < 0.02, "net balances cancel out");

  const s = settlements(exps, ms);
  const out = new Map();
  for (const { fromId, toId, amount } of s) {
    out.set(fromId, (out.get(fromId) ?? 0) - amount);
    out.set(toId, (out.get(toId) ?? 0) + amount);
  }
  for (const m of ms) {
    assert.ok(
      Math.abs((out.get(m.id) ?? 0) - net.get(m.id)) < 0.02,
      `${m.id}: transfers must clear its balance`,
    );
  }
}

// --- edge cases that would otherwise crash or quietly mis-split ---
{
  assert.deepEqual(settlements([], M("a", "b")), [], "no expenses");
  assert.deepEqual(settlements([shared("a", 10, "a", "b")], []), [], "no members");
  assert.deepEqual(
    settlements([shared("ghost", 10, "a", "b")], M("a", "b")),
    [],
    "payer removed from the ledger is skipped, not counted",
  );
  assert.deepEqual(
    settlements([shared("a", 10)], M("a", "b")),
    [],
    "shared with nobody is skipped rather than divided by zero",
  );
  assert.deepEqual(
    settlements([shared("a", 10, "a", "ghost")], M("a", "b")),
    [],
    "unknown sharer dropped; a paying only for itself owes nothing",
  );
}

// --- odd cents: the half-cent that used to make the two sides disagree ---
{
  // The real month that surfaced this. 2651.12 + 276.25 = 2927.37, an odd
  // number of cents, so half of it is 1463.685 — a half-cent that does not
  // exist. Rounding each balance separately produced "should receive 1187.44"
  // against "should pay 1187.43".
  const ms = M("t", "w");
  const exps = [shared("t", 2651.12, "t", "w"), shared("w", 276.25, "t", "w")];
  const net = netBalances(exps, ms);
  assert.equal(net.get("t") + net.get("w"), 0, "the two sides must cancel exactly");
  assert.equal(Math.abs(net.get("t")), Math.abs(net.get("w")), "receive must equal pay");

  // And the shares shown on screen must add back up to what was split.
  const shares = sharedShares(exps, ms);
  assert.equal(shares.get("t") + shares.get("w"), 2927.37, "shares must sum to the shared total");
}

// --- splitCents keeps its promise for every shape ---
{
  for (const [cents, n] of [[1, 2], [7, 2], [100, 3], [1, 3], [2927_37, 2], [99, 7], [0, 4]]) {
    const parts = splitCents(cents, n);
    assert.equal(parts.length, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), cents, `${cents}c into ${n} must sum back`);
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1, "parts differ by at most a cent");
  }
  // A refund splits too, without the remainder flipping sign.
  const refund = splitCents(-7, 2);
  assert.equal(refund.reduce((a, b) => a + b, 0), -7);
  assert.ok(refund.every((p) => p <= 0), "a negative split stays negative");
  assert.deepEqual(splitCents(10, 0), [], "no sharers, no division by zero");
}

// --- the odd cent doesn't always land on the same person ---
{
  // Two expenses with different ids and an odd split: whoever absorbs the extra
  // cent should not be the same both times, or a long ledger drifts one way.
  const ms = M("a", "b");
  const one = netBalances([{ id: "e1", ...shared("a", 0.01, "a", "b") }], ms);
  const two = netBalances([{ id: "e2", ...shared("a", 0.01, "a", "b") }], ms);
  assert.equal(one.get("a") + one.get("b"), 0);
  assert.equal(two.get("a") + two.get("b"), 0);
}

// --- three-way split of an amount that can't divide evenly ---
{
  const ms = M("a", "b", "c");
  const exps = [shared("a", 100, "a", "b", "c")]; // 10000c / 3 = 3333.33…
  const net = netBalances(exps, ms);
  assert.equal(sum([...net.values()]), 0, "no cent invented or lost");
  const shares = sharedShares(exps, ms);
  assert.equal(sum([...shares.values()]), 100, "shares still total the bill");
}

console.log("settle.js: all checks passed");
