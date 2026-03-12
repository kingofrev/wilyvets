// 9s Game (Nines / 9-Point Game)
// - 3 or 4 players
// - 9 points distributed each hole based on net scores
// - Carryovers when all players tie

export interface NinesHoleResult {
  holeNumber: number;
  netScores: { playerId: string; netScore: number }[];
  points: { playerId: string; points: number }[];
  carryover: number; // Points carried from previous ties
  isCarryover: boolean; // This hole's points carried to next
}

export interface NinesState {
  holeResults: NinesHoleResult[];
  totalPoints: { playerId: string; points: number }[];
  pendingCarryover: number; // Points waiting to be awarded
}

export interface NinesSettlement {
  playerId: string;
  playerName: string;
  totalPoints: number;
  netPoints: number; // Points relative to average
  amount: number; // Money won/lost
}

// Calculate points for a single hole - supports 3 or 4 players
export function calculateHolePoints(
  netScores: { playerId: string; netScore: number }[],
  carryoverPoints: number = 0
): { points: { playerId: string; points: number }[]; isCarryover: boolean } {
  const playerCount = netScores.length;

  if (playerCount !== 3 && playerCount !== 4) {
    throw new Error("9s game requires 3 or 4 players");
  }

  const sorted = [...netScores].sort((a, b) => a.netScore - b.netScore);
  const totalPoints = 9 + carryoverPoints;

  // Check if all players tied
  const allTie = sorted.every((p) => p.netScore === sorted[0].netScore);
  if (allTie) {
    return {
      points: netScores.map((p) => ({ playerId: p.playerId, points: 0 })),
      isCarryover: true,
    };
  }

  const pointsMap = new Map<string, number>();

  if (playerCount === 3) {
    // 3 player logic: 5-3-1
    const [low, mid, high] = sorted;
    const lowTiesMid = low.netScore === mid.netScore;
    const midTiesHigh = mid.netScore === high.netScore;

    let lowPoints: number;
    let midPoints: number;
    let highPoints: number;

    if (lowTiesMid) {
      // 2 tie for low: split 5+3=8, high gets 1
      lowPoints = Math.floor((totalPoints * 8) / 9 / 2);
      midPoints = lowPoints;
      highPoints = totalPoints - lowPoints * 2;
    } else if (midTiesHigh) {
      // 2 tie for high: low gets 5, split 3+1=4
      lowPoints = Math.floor((totalPoints * 5) / 9);
      const remainingPoints = totalPoints - lowPoints;
      midPoints = Math.floor(remainingPoints / 2);
      highPoints = remainingPoints - midPoints;
    } else {
      // All different: 5-3-1 distribution
      lowPoints = Math.floor((totalPoints * 5) / 9);
      midPoints = Math.floor((totalPoints * 3) / 9);
      highPoints = totalPoints - lowPoints - midPoints;
    }

    pointsMap.set(low.playerId, lowPoints);
    pointsMap.set(mid.playerId, midPoints);
    pointsMap.set(high.playerId, highPoints);
  } else {
    // 4 player logic: 5-3-1-0
    const [first, second, third, fourth] = sorted;

    // Check for ties at each position
    const firstTiesSecond = first.netScore === second.netScore;
    const secondTiesThird = second.netScore === third.netScore;
    const thirdTiesFourth = third.netScore === fourth.netScore;

    // Base distribution: 5-3-1-0
    let firstPoints = 0;
    let secondPoints = 0;
    let thirdPoints = 0;
    let fourthPoints = 0;

    if (firstTiesSecond && secondTiesThird) {
      // 3-way tie for first: split 5+3+1=9
      const splitPoints = Math.floor(totalPoints / 3);
      firstPoints = splitPoints;
      secondPoints = splitPoints;
      thirdPoints = totalPoints - splitPoints * 2;
      fourthPoints = 0;
    } else if (secondTiesThird && thirdTiesFourth) {
      // 3-way tie for last: first gets 5, others split 3+1+0=4
      firstPoints = Math.floor((totalPoints * 5) / 9);
      const remaining = totalPoints - firstPoints;
      const splitPoints = Math.floor(remaining / 3);
      secondPoints = splitPoints;
      thirdPoints = splitPoints;
      fourthPoints = remaining - splitPoints * 2;
    } else if (firstTiesSecond && thirdTiesFourth) {
      // 2-way tie for first, 2-way tie for last
      const topShare = Math.floor((totalPoints * 8) / 9); // 5+3
      firstPoints = Math.floor(topShare / 2);
      secondPoints = topShare - firstPoints;
      // Both 3rd/4th get 1 point as user requested
      thirdPoints = 1;
      fourthPoints = 0;
    } else if (firstTiesSecond) {
      // 2-way tie for first: split 5+3=8
      const topShare = Math.floor((totalPoints * 8) / 9);
      firstPoints = Math.floor(topShare / 2);
      secondPoints = topShare - firstPoints;
      thirdPoints = Math.floor((totalPoints * 1) / 9);
      fourthPoints = 0;
    } else if (secondTiesThird) {
      // 2-way tie for second: first gets 5, split 3+1=4
      firstPoints = Math.floor((totalPoints * 5) / 9);
      const midShare = totalPoints - firstPoints;
      secondPoints = Math.floor(midShare / 2);
      thirdPoints = midShare - secondPoints;
      fourthPoints = 0;
    } else if (thirdTiesFourth) {
      // 2-way tie for third/fourth: both get 1 as user requested
      firstPoints = Math.floor((totalPoints * 5) / 9);
      secondPoints = Math.floor((totalPoints * 3) / 9);
      // Both tied for 3rd get 1 point each
      thirdPoints = 1;
      fourthPoints = 1;
    } else {
      // All different: 5-3-1-0 distribution
      firstPoints = Math.floor((totalPoints * 5) / 9);
      secondPoints = Math.floor((totalPoints * 3) / 9);
      thirdPoints = Math.floor((totalPoints * 1) / 9);
      fourthPoints = 0;
    }

    pointsMap.set(first.playerId, firstPoints);
    pointsMap.set(second.playerId, secondPoints);
    pointsMap.set(third.playerId, thirdPoints);
    pointsMap.set(fourth.playerId, fourthPoints);
  }

  return {
    points: netScores.map((p) => ({
      playerId: p.playerId,
      points: pointsMap.get(p.playerId) || 0,
    })),
    isCarryover: false,
  };
}

// Calculate full 9s game state from hole-by-hole net scores
export function calculateNinesState(
  holeScores: {
    holeNumber: number;
    scores: { playerId: string; netScore: number }[];
  }[]
): NinesState {
  const holeResults: NinesHoleResult[] = [];
  const playerTotals = new Map<string, number>();
  let carryover = 0;

  // Get player count from first hole
  const playerCount = holeScores.length > 0 ? holeScores[0].scores.length : 0;

  // Initialize player totals
  if (holeScores.length > 0 && holeScores[0].scores.length > 0) {
    for (const score of holeScores[0].scores) {
      playerTotals.set(score.playerId, 0);
    }
  }

  // Process each hole in order
  const sortedHoles = [...holeScores].sort((a, b) => a.holeNumber - b.holeNumber);

  for (const hole of sortedHoles) {
    // Skip if not all players scored
    if (hole.scores.length !== playerCount) continue;

    const { points, isCarryover } = calculateHolePoints(hole.scores, carryover);

    holeResults.push({
      holeNumber: hole.holeNumber,
      netScores: hole.scores,
      points,
      carryover: carryover,
      isCarryover,
    });

    if (isCarryover) {
      carryover += 9; // Add this hole's 9 points to carryover
    } else {
      carryover = 0; // Reset carryover
      // Add points to totals
      for (const p of points) {
        playerTotals.set(p.playerId, (playerTotals.get(p.playerId) || 0) + p.points);
      }
    }
  }

  return {
    holeResults,
    totalPoints: Array.from(playerTotals.entries()).map(([playerId, points]) => ({
      playerId,
      points,
    })),
    pendingCarryover: carryover,
  };
}

// Calculate settlements for 9s game
export function calculateNinesSettlement(
  ninesState: NinesState,
  pointValue: number,
  playerNames: { playerId: string; name: string }[]
): NinesSettlement[] {
  // Average points based on total points awarded divided by player count
  const totalPointsAwarded = ninesState.totalPoints.reduce((sum, p) => sum + p.points, 0);
  const playerCount = ninesState.totalPoints.length;
  const averagePoints = playerCount > 0 ? totalPointsAwarded / playerCount : 0;

  return ninesState.totalPoints.map((p) => {
    const playerName = playerNames.find((n) => n.playerId === p.playerId)?.name || "Unknown";
    const netPoints = p.points - averagePoints;
    const amount = netPoints * pointValue;

    return {
      playerId: p.playerId,
      playerName,
      totalPoints: p.points,
      netPoints: Math.round(netPoints * 100) / 100, // Round to 2 decimals
      amount: Math.round(amount * 100) / 100,
    };
  });
}

// Format points display for a hole
export function formatHolePoints(points: number, isCarryover: boolean): string {
  if (isCarryover) return "C/O";
  return points.toString();
}
