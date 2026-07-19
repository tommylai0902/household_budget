// Who owes whom, for any number of members.
//
// With two people this is a single number; with three or more it isn't, so the
// balances get netted first and then matched biggest-debtor-to-biggest-creditor.
// That yields at most n-1 transfers, which is enough — computing the true
// minimum is NP-hard and nobody splitting a holiday needs it.

const round2 = (n) => Math.round(n * 100) / 100;

/** Net position per member: positive = owed money, negative = owes money. */
export function netBalances(expenses, members) {
  const net = new Map(members.map((m) => [m.id, 0]));
  if (!members.length) return net;

  for (const e of expenses) {
    // A personal expense is paid and borne by the same person — nets to zero.
    if (e.split !== "shared") continue;
    if (!net.has(e.paidById)) continue; // payer no longer in the ledger

    // Only the people actually on this expense share it — the payer may not be
    // one of them (covering a meal you didn't eat still leaves you owed in full).
    const sharers = (e.sharedWith || []).filter((id) => net.has(id));
    if (!sharers.length) continue;

    const amount = Number(e.amount) || 0;
    const share = amount / sharers.length;
    for (const id of sharers) net.set(id, net.get(id) - share);
    net.set(e.paidById, net.get(e.paidById) + amount);
  }

  for (const [id, v] of net) net.set(id, round2(v));
  return net;
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
