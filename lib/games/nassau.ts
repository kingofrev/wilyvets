import { MatchSegment } from "@prisma/client";

export interface HoleResult {
  holeNumber: number;
  player1Gross: number;
  player2Gross: number;
  player1Net: number;
  player2Net: number;
  player1StrokesReceived: number;
  player2StrokesReceived: number;
  winner: "player1" | "player2" | "tie";
}

export interface SegmentStatus {
  segment: MatchSegment;
  player1Status: number; // Positive = up, negative = down
  holesPlayed: number;
  holesRemaining: number;
  isComplete: boolean;
  isClosed: boolean; // Match ended early
  winnerId?: string;
}

export interface PressStatus {
  id?: string;
  segment: MatchSegment;
  startHole: number;
  player1Status: number;
  holesPlayed: number;
  holesRemaining: number;
  isComplete: boolean;
  isClosed: boolean;
  winnerId?: string;
  triggeredBy: string;
  childPresses: PressStatus[];
}

export interface MatchState {
  front9: SegmentStatus;
  back9: SegmentStatus;
  overall18: SegmentStatus;
  presses: PressStatus[];
  holeResults: HoleResult[];
}

// Calculate which holes belong to which segment
export function getSegmentHoles(segment: MatchSegment): number[] {
  switch (segment) {
    case "FRONT_9":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    case "BACK_9":
      return [10, 11, 12, 13, 14, 15, 16, 17, 18];
    case "OVERALL_18":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  }
}

export function getSegmentForHole(holeNumber: number): MatchSegment {
  return holeNumber <= 9 ? "FRONT_9" : "BACK_9";
}

// Calculate match state from hole results
export function calculateMatchState(
  holeResults: HoleResult[],
  autoPressAt2: boolean,
  player1Id: string,
  player2Id: string
): MatchState {
  const front9Status = calculateSegmentStatus("FRONT_9", holeResults);
  const back9Status = calculateSegmentStatus("BACK_9", holeResults);
  const overall18Status = calculateSegmentStatus("OVERALL_18", holeResults);

  // Calculate presses if auto-press is enabled
  const presses: PressStatus[] = [];
  if (autoPressAt2) {
    // Check for press triggers in front 9
    const front9Presses = calculatePresses(
      "FRONT_9",
      holeResults.filter((h) => h.holeNumber <= 9),
      player1Id,
      player2Id
    );
    presses.push(...front9Presses);

    // Check for press triggers in back 9
    const back9Presses = calculatePresses(
      "BACK_9",
      holeResults.filter((h) => h.holeNumber > 9),
      player1Id,
      player2Id
    );
    presses.push(...back9Presses);
  }

  return {
    front9: front9Status,
    back9: back9Status,
    overall18: overall18Status,
    presses,
    holeResults,
  };
}

function calculateSegmentStatus(
  segment: MatchSegment,
  holeResults: HoleResult[]
): SegmentStatus {
  const segmentHoles = getSegmentHoles(segment);
  const relevantResults = holeResults.filter((h) =>
    segmentHoles.includes(h.holeNumber)
  );

  let player1Status = 0;
  for (const result of relevantResults) {
    if (result.winner === "player1") {
      player1Status++;
    } else if (result.winner === "player2") {
      player1Status--;
    }
  }

  const holesPlayed = relevantResults.length;
  const totalHoles = segment === "OVERALL_18" ? 18 : 9;
  const holesRemaining = totalHoles - holesPlayed;
  const isClosed = Math.abs(player1Status) > holesRemaining;
  const isComplete = holesRemaining === 0 || isClosed;

  return {
    segment,
    player1Status,
    holesPlayed,
    holesRemaining,
    isComplete,
    isClosed,
    winnerId: isComplete && player1Status !== 0
      ? player1Status > 0 ? "player1" : "player2"
      : undefined,
  };
}

function calculatePresses(
  segment: MatchSegment,
  holeResults: HoleResult[],
  player1Id: string,
  player2Id: string
): PressStatus[] {
  const presses: PressStatus[] = [];
  const segmentStartHole = segment === "FRONT_9" ? 1 : 10;
  const segmentEndHole = segment === "FRONT_9" ? 9 : 18;

  // Track running status and active presses
  let mainStatus = 0;
  const activePresses: {
    startHole: number;
    status: number;
    triggeredBy: string;
    parent?: number;
  }[] = [];

  for (const result of holeResults.sort((a, b) => a.holeNumber - b.holeNumber)) {
    const statusChange =
      result.winner === "player1" ? 1 : result.winner === "player2" ? -1 : 0;

    // Update main match status
    mainStatus += statusChange;

    // Check if main match triggers a press (2 down)
    if (
      Math.abs(mainStatus) === 2 &&
      result.holeNumber < segmentEndHole &&
      !activePresses.some((p) => p.parent === undefined)
    ) {
      activePresses.push({
        startHole: result.holeNumber + 1,
        status: 0,
        triggeredBy: mainStatus > 0 ? player2Id : player1Id,
      });
    }

    // Update all active presses
    for (let i = 0; i < activePresses.length; i++) {
      const press = activePresses[i];
      if (result.holeNumber >= press.startHole) {
        press.status += statusChange;

        // Check if this press triggers another press
        if (
          Math.abs(press.status) === 2 &&
          result.holeNumber < segmentEndHole
        ) {
          const existingChildPress = activePresses.find(
            (p) => p.parent === i
          );
          if (!existingChildPress) {
            activePresses.push({
              startHole: result.holeNumber + 1,
              status: 0,
              triggeredBy: press.status > 0 ? player2Id : player1Id,
              parent: i,
            });
          }
        }
      }
    }
  }

  // Convert active presses to PressStatus
  for (let i = 0; i < activePresses.length; i++) {
    const press = activePresses[i];
    const holesPlayed = Math.max(
      0,
      holeResults.filter((h) => h.holeNumber >= press.startHole).length
    );
    const holesRemaining = segmentEndHole - press.startHole + 1 - holesPlayed;
    const isClosed = Math.abs(press.status) > holesRemaining;
    const isComplete = holesRemaining === 0 || isClosed;

    presses.push({
      segment,
      startHole: press.startHole,
      player1Status: press.status,
      holesPlayed,
      holesRemaining,
      isComplete,
      isClosed,
      winnerId:
        isComplete && press.status !== 0
          ? press.status > 0
            ? player1Id
            : player2Id
          : undefined,
      triggeredBy: press.triggeredBy,
      childPresses: [], // Will be populated by recursive structure if needed
    });
  }

  return presses;
}

// Calculate settlement amounts for a match
export interface SettlementResult {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  breakdown: {
    front9: number;
    back9: number;
    overall18: number;
    presses: number;
  };
}

export function calculateSettlement(
  matchState: MatchState,
  betAmount: number,
  player1Id: string,
  player2Id: string
): SettlementResult | null {
  let player1Winnings = 0;
  const breakdown = {
    front9: 0,
    back9: 0,
    overall18: 0,
    presses: 0,
  };

  // Front 9
  if (matchState.front9.isComplete && matchState.front9.player1Status !== 0) {
    const amount = matchState.front9.player1Status > 0 ? betAmount : -betAmount;
    player1Winnings += amount;
    breakdown.front9 = amount;
  }

  // Back 9
  if (matchState.back9.isComplete && matchState.back9.player1Status !== 0) {
    const amount = matchState.back9.player1Status > 0 ? betAmount : -betAmount;
    player1Winnings += amount;
    breakdown.back9 = amount;
  }

  // Overall 18
  if (matchState.overall18.isComplete && matchState.overall18.player1Status !== 0) {
    const amount = matchState.overall18.player1Status > 0 ? betAmount : -betAmount;
    player1Winnings += amount;
    breakdown.overall18 = amount;
  }

  // Presses
  for (const press of matchState.presses) {
    if (press.isComplete && press.player1Status !== 0) {
      const amount = press.player1Status > 0 ? betAmount : -betAmount;
      player1Winnings += amount;
      breakdown.presses += amount;
    }
  }

  if (player1Winnings === 0) return null;

  return {
    fromPlayerId: player1Winnings > 0 ? player2Id : player1Id,
    toPlayerId: player1Winnings > 0 ? player1Id : player2Id,
    amount: Math.abs(player1Winnings),
    breakdown,
  };
}
