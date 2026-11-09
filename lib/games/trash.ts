// Trash — side bets on individual holes (birdies, greenies, sandies, other).
//
// Each item is worth one point, and points settle the same way 9s points do:
// a player's points are measured against the group average and multiplied by
// the point value. That keeps the money zero-sum, so it can be settled.
//
// Birdies are derived from the scorecard rather than tallied by hand; the rest
// can't be worked out from scores, so they're entered manually.

export interface TrashCounts {
  birdies: number;
  greenies: number;
  sandies: number;
  others: number;
}

export interface TrashSettlement {
  playerId: string;
  playerName: string;
  counts: TrashCounts;
  totalPoints: number;
  netPoints: number; // Points relative to the group average
  amount: number; // Money won (positive) or owed (negative)
}

export const EMPTY_TRASH_COUNTS: TrashCounts = {
  birdies: 0,
  greenies: 0,
  sandies: 0,
  others: 0,
};

// One point per item, whatever the category
export function totalTrashPoints(counts: TrashCounts): number {
  return counts.birdies + counts.greenies + counts.sandies + counts.others;
}

// A birdie is any hole played under par. Anything better than a birdie counts
// for the strokes it beat par by, so an eagle is worth two.
export function countBirdies(
  scores: { holeNumber: number; grossStrokes: number }[],
  holes: { holeNumber: number; par: number }[]
): number {
  let birdies = 0;

  for (const score of scores) {
    const hole = holes.find((h) => h.holeNumber === score.holeNumber);
    if (!hole) continue;

    const underPar = hole.par - score.grossStrokes;
    if (underPar > 0) birdies += underPar;
  }

  return birdies;
}

export function calculateTrashSettlement(
  players: { playerId: string; playerName: string; counts: TrashCounts }[],
  pointValue: number
): TrashSettlement[] {
  const totals = players.map((p) => totalTrashPoints(p.counts));
  const pointsAwarded = totals.reduce((sum, points) => sum + points, 0);
  const averagePoints = players.length > 0 ? pointsAwarded / players.length : 0;

  return players.map((player, index) => {
    const totalPoints = totals[index];
    const netPoints = totalPoints - averagePoints;

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      counts: player.counts,
      totalPoints,
      netPoints: Math.round(netPoints * 100) / 100,
      amount: Math.round(netPoints * pointValue * 100) / 100,
    };
  });
}
