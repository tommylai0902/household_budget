// Who owes whom, for any number of members.
//
// With two people this is a single number; with three or more it isn't, so the
// balances get netted first and then matched biggest-debtor-to-biggest-creditor.
// That yields at most n-1 transfers, which is enough — computing the true
// minimum is NP-hard and nobody splitting a holiday needs it.
//
// ALL ARITHMETIC HERE IS IN INTEGER CENTS. Splitting an odd number of cents
// evenly has no exact answer, and the previous version rounded each member's
// balance separately at the end — which let the two halves disagree. A real
// month came out as Tommy "should receive $1,187.44" while Wing "should pay
// $1,187.43", because Math.round sends +x.5 up but -x.5 toward zero, so each
// side of the same half-cent rounded the opposite way. Cents make the split
// exact by construction: the parts always add back up to the amount.

const round2 = (n) => Math.round(n * 100) / 100;
const toCents = (n) => Math.round((Number(n) || 0) * 100);

// Deterministic starting offset from an id, so the leftover cent doesn't land
// on the same person for every expense. Not a good hash and doesn't need to
// be — it only has to be stable and spread out across ids.
const offsetFor = (id, n) => {
  const s = String(id ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return n ? h % n : 0;
};

/**
 * Splits `cents` into `n` integer parts that sum to exactly `cents`.
 * Any remainder is spread one cent at a time starting at `start`, so no part
 * is ever off by more than a cent. Handles negatives (a refund splits too).
 */
export function splitCents(cents, n, start = 0) {
  if (n <= 0) return [];
  const base = Math.trunc(cents / n);
  const remainder = cents - base * n;
  const step = remainder >= 0 ? 1 : -1;
  const parts = new Array(n).fill(base);
  for (let k = 0; k < Math.abs(remainder); k++) parts[(start + k) % n] += step;
  return parts;
}

// One pass over the shared expenses, in cents. Both public functions below are
// views of this, so a member's share can never disagree with their balance.
function tally(expenses, members) {
  const share = new Map(members.map((m) => [m.id, 0]));
  const paid = new Map(members.map((m) => [m.id, 0]));
  if (!members.length) return { share, paid };

  for (const e of expenses) {
    // A personal expense is paid and borne by the same person — nets to zero.
    if (e.split !== "shared") continue;
    if (!paid.has(e.paidById)) continue; // payer no longer in the ledger

    // Only the people actually on this expense share it — the payer may not be
    // one of them (covering a meal you didn't eat still leaves you owed in full).
    // Sorted so the leftover cent lands predictably rather than following
    // whatever order sharedWith happens to arrive in.
    const sharers = (e.sharedWith || []).filter((id) => share.has(id)).sort();
    if (!sharers.length) continue;

    const cents = toCents(e.amount);
    const parts = splitCents(cents, sharers.length, offsetFor(e.id, sharers.length));
    sharers.forEach((id, i) => share.set(id, share.get(id) + parts[i]));
    paid.set(e.paidById, paid.get(e.paidById) + cents);
  }
  return { share, paid };
}

/** Net position per member: positive = owed money, negative = owes money. */
export function netBalances(expenses, members) {
  const { share, paid } = tally(expenses, members);
  const net = new Map();
  for (const m of members) net.set(m.id, ((paid.get(m.id) || 0) - (share.get(m.id) || 0)) / 100);
  return net;
}

/**
 * Each member's share of the shared bills. Exposed so the settle-up screen
 * shows the same figures the balances were derived from — computing it
 * separately is what let the displayed shares add up to a cent more than the
 * total they were split from.
 */
export function sharedShares(expenses, members) {
  const { share } = tally(expenses, members);
  const out = new Map();
  for (const m of members) out.set(m.id, (share.get(m.id) || 0) / 100);
  return out;
}

/** Transfers that clear the balances: [{ fromId, toId, amount }]. */
export function settlements(expenses, members) {
  const net = netBalances(expenses, members);
  const debtors = [];
  const creditors = [];
  for (const m of members) {
    const v = net.get(m.id) ?? 0;
    if (v < -0.005) debtors.push({ id: m.id, amount: -v });
    else if (v > 0.005) creditors.push({ id: m.id, amount: v });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amount, creditors[j].amount));
    if (pay > 0.005) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amount: pay });
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }
  return out;
}
