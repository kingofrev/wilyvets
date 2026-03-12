# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run db:push      # Push Prisma schema changes to database (no migration files)
npm run db:studio    # Open Prisma Studio GUI
```

Environment requires `DATABASE_URL` (PostgreSQL) and `NEXTAUTH_SECRET` set in `.env.local`.

## Architecture

**App name:** WilyVets — a multi-game golf betting webapp. Nassau is one of several games within it.

**Stack:** Next.js 14 App Router, TypeScript, Prisma (PostgreSQL), NextAuth v4 (JWT/credentials), Tailwind CSS, shadcn/ui components.

**App structure:**
- `app/(auth)/` — login/register pages (unauthenticated)
- `app/(dashboard)/` — main app layout with header + bottom nav (requires auth)
- `app/api/` — Route handlers for REST API (all endpoints check session via `getServerSession`)
- `lib/games/` — Pure game logic (no DB calls)
- `components/ui/` — shadcn/ui primitives

**Core game logic lives in `lib/`:**
- `lib/games/nassau.ts` — Match play calculation: `calculateMatchState()` computes front 9 / back 9 / overall 18 segment statuses and auto-press logic from an array of `HoleResult`. `calculateSettlement()` converts a `MatchState` to dollar amounts.
- `lib/games/nines.ts` — 9s game (3-4 players): `calculateHolePoints()` distributes 9 points per hole with carryovers. `calculateNinesState()` and `calculateNinesSettlement()` aggregate over a full round.
- `lib/utils.ts` — Shared helpers: `getStrokesOnHole()`, `calculateCourseHandicap()` (USGA formula), `generateMatchPairings()`, `formatMatchStatus()`, `formatMatchResult()`.

**Data model key relationships:**
- `Round` → `RoundPlayer[]` (snapshot of handicap at time of round) → `HoleScore[]`
- `Round` → `Match[]` (one per player pairing) → `MatchResult[]` (3 per match: FRONT_9, BACK_9, OVERALL_18) + `Press[]`
- `Round` → `Settlement[]` (calculated at completion)
- `Player` is a managed contact (created by a `User`); `RoundPlayer` can reference either a `Player` or a `User`

**Handicap modes** (`HandicapMode` enum):
- `GROUP_LOWEST` — all players play off the lowest handicap in the group (strokes given stored on `RoundPlayer.strokesGiven`)
- `MATCH_LOWEST` — each 1v1 match calculates strokes off the lower of the two players

**Round flow:** SETUP → IN_PROGRESS (skipped, round starts as IN_PROGRESS) → COMPLETED. Scores are submitted hole-by-hole via `POST /api/rounds/[id]/scores`. Round is completed via `POST /api/rounds/[id]/complete`.

**API routes:**
- `/api/rounds` — GET list, POST create (also creates all Match pairings and MatchResult rows)
- `/api/rounds/[id]` — GET full round with scores/matches
- `/api/rounds/[id]/scores` — POST to save hole scores for all players
- `/api/rounds/[id]/complete` — POST to finalize and compute settlements
- `/api/players`, `/api/courses`, `/api/records` — CRUD for contacts, courses, lifetime H2H records

**Auth:** `lib/auth.ts` exports `authOptions` used by the NextAuth route and `getServerSession()` in API handlers. Session includes `user.id` and `user.handicap`.
