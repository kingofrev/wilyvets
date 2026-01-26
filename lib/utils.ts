import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatHandicap(handicap: number | string | null | undefined): string {
  if (handicap === null || handicap === undefined) return "N/A";
  const num = typeof handicap === "string" ? parseFloat(handicap) : handicap;
  return num >= 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
}

export function formatMatchStatus(status: number): string {
  if (status === 0) return "AS"; // All Square
  if (status > 0) return `${status} UP`;
  return `${Math.abs(status)} DN`;
}

export function formatMatchResult(status: number, holesRemaining: number): string {
  if (holesRemaining === 0) {
    if (status === 0) return "Tied";
    return status > 0 ? `Won ${status}&0` : `Lost ${Math.abs(status)}&0`;
  }
  if (Math.abs(status) > holesRemaining) {
    // Match is over early (e.g., 3&2)
    return status > 0
      ? `${status}&${holesRemaining}`
      : `${Math.abs(status)}&${holesRemaining}`;
  }
  return formatMatchStatus(status);
}

// Calculate USGA Course Handicap
// Formula: Course Handicap = Handicap Index × (Slope Rating / 113) + (Course Rating - Par)
export function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number | null,
  courseRating: number | null,
  coursePar: number
): number {
  // Default slope is 113 (standard), default course rating equals par
  const slope = slopeRating || 113;
  const rating = courseRating || coursePar;

  const courseHandicap = handicapIndex * (slope / 113) + (rating - coursePar);
  return Math.round(courseHandicap);
}

// Calculate strokes a player receives on a specific hole
export function getStrokesOnHole(
  playerHandicap: number,
  opponentHandicap: number,
  holeHandicap: number,
  mode: "GROUP_LOWEST" | "MATCH_LOWEST",
  groupLowestHandicap?: number
): number {
  let strokeDiff: number;

  if (mode === "GROUP_LOWEST" && groupLowestHandicap !== undefined) {
    strokeDiff = playerHandicap - groupLowestHandicap;
  } else {
    // MATCH_LOWEST
    const lowestInMatch = Math.min(playerHandicap, opponentHandicap);
    strokeDiff = playerHandicap - lowestInMatch;
  }

  // Player gets a stroke on this hole if their stroke difference
  // is >= the hole's handicap rating
  if (strokeDiff >= holeHandicap) {
    // Check for double strokes (handicap diff > 18)
    if (strokeDiff >= holeHandicap + 18) {
      return 2;
    }
    return 1;
  }
  return 0;
}

// Calculate net score for a hole
export function calculateNetScore(
  grossStrokes: number,
  strokesReceived: number
): number {
  return grossStrokes - strokesReceived;
}

// Determine hole winner in match play
export function determineHoleWinner(
  player1NetScore: number,
  player2NetScore: number
): "player1" | "player2" | "tie" {
  if (player1NetScore < player2NetScore) return "player1";
  if (player2NetScore < player1NetScore) return "player2";
  return "tie";
}

// Generate all match pairings for a group
export function generateMatchPairings<T extends { id: string }>(
  players: T[]
): Array<[T, T]> {
  const pairings: Array<[T, T]> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push([players[i], players[j]]);
    }
  }
  return pairings;
}

// Check if a match is dormie (can't be won, only tied or lost)
export function isDormie(status: number, holesRemaining: number): boolean {
  return Math.abs(status) === holesRemaining && holesRemaining > 0;
}

// Check if match is closed out
export function isMatchClosed(status: number, holesRemaining: number): boolean {
  return Math.abs(status) > holesRemaining;
}
