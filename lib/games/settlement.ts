// Turning per-player net amounts into a short list of who pays whom.
//
// Every bet in the app nets out to zero across the group, so the people who are
// down can always cover the people who are up. This pays the largest debt into
// the largest credit first, which keeps the number of handoffs small.

export interface PlayerNet {
  playerId: string;
  playerName: string;
  amount: number; // Positive = owed money, negative = owes money
}

export interface Payment {
  fromPlayerId: string;
  fromPlayer: string;
  toPlayerId: string;
  toPlayer: string;
  amount: number;
}

// Money is in dollars and cents, so anything under half a cent is float dust
const EPSILON = 0.005;

export function settleUp(nets: PlayerNet[]): Payment[] {
  const creditors = nets
    .filter((n) => n.amount > EPSILON)
    .map((n) => ({ ...n, remaining: n.amount }))
    .sort((a, b) => b.remaining - a.remaining);

  const debtors = nets
    .filter((n) => n.amount < -EPSILON)
    .map((n) => ({ ...n, remaining: -n.amount }))
    .sort((a, b) => b.remaining - a.remaining);

  const payments: Payment[] = [];

  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (debtor.remaining <= EPSILON) break;
      if (creditor.remaining <= EPSILON) continue;

      const amount =
        Math.round(Math.min(debtor.remaining, creditor.remaining) * 100) / 100;
      if (amount <= 0) continue;

      payments.push({
        fromPlayerId: debtor.playerId,
        fromPlayer: debtor.playerName,
        toPlayerId: creditor.playerId,
        toPlayer: creditor.playerName,
        amount,
      });

      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }
  }

  return payments;
}

// Add up the same player's net across several bets
export function combineNets(...bets: PlayerNet[][]): PlayerNet[] {
  const combined = new Map<string, PlayerNet>();

  for (const bet of bets) {
    for (const net of bet) {
      const existing = combined.get(net.playerId);
      if (existing) {
        existing.amount += net.amount;
      } else {
        combined.set(net.playerId, { ...net });
      }
    }
  }

  return Array.from(combined.values()).map((net) => ({
    ...net,
    amount: Math.round(net.amount * 100) / 100,
  }));
}
