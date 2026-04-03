// Rebuild Players Championship golfers using the actual ESPN field + correct odds
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

const TOURNAMENT_ID = "cmmmt3ey30001qbwj21i4voac"

// Actual Players Championship 2026 odds (DraftKings/BetOnline composite, March 12 2026)
// Keyed by the exact ESPN displayName
const KNOWN_ODDS = {
  "Scottie Scheffler":         360,
  "Rory McIlroy":              850,
  "Bryson DeChambeau":        1200,
  "Collin Morikawa":          2000,
  "Tommy Fleetwood":          2000,
  "Ludvig Åberg":             2200,
  "Xander Schauffele":        2200,
  "Justin Rose":              3000,
  "Chris Gotterup":           3500,
  "Hideki Matsuyama":         3500,
  "Viktor Hovland":           3500,
  "Jordan Spieth":            4000,
  "Justin Thomas":            4000,
  "Cameron Young":            4000,
  "Brooks Koepka":            4000,
  "Robert MacIntyre":         4000,
  "Shane Lowry":              4500,
  "Patrick Cantlay":          5000,
  "Ben Griffin":              5000,
  "Akshay Bhatia":            5500,
  "Matt Fitzpatrick":         5500,
  "Si Woo Kim":               6000,
  "Corey Conners":            6000,
  "Russell Henley":           6600,
  "Min Woo Lee":              6600,
  "Max Homa":                 6600,
  "Jason Day":                6600,
  "Adam Scott":               6600,
  "Sepp Straka":              7000,
  "Sam Burns":                7000,
  "Daniel Berger":            7000,
  "Sungjae Im":               8000,
  "Marco Penge":              8000,
  "J.J. Spaun":               9000,
  "Wyndham Clark":            9000,
  "Harris English":           9000,
  "Jacob Bridgeman":          9000,
  "Sahith Theegala":          9000,
  "Maverick McNealy":        10000,
  "Matt McCarty":            10000,
  "Tony Finau":              10000,
  "Alex Noren":              10000,
  "Ryan Gerard":             11000,
  "Ryan Fox":                12000,
  "Keegan Bradley":          12000,
  "Jake Knapp":              12000,
  "Harry Hall":              13000,
  "Aaron Rai":               13000,
  "Pierceson Coody":         13000,
  "Johnny Keefer":           13000,
  "Davis Thompson":          14000,
  "Taylor Pendrith":         15000,
  "Rasmus Højgaard":         15000,
  "Kurt Kitayama":           15000,
  "Brian Harman":            15000,
  "Sam Stevens":             15000,
  "Nicolai Højgaard":        15000,
  "Sami Välimäki":           19000,
  "Michael Kim":             20000,
  "Andrew Novak":            20000,
  "Aldrich Potgieter":       20000,
  "Rickie Fowler":           25000,
  "Nick Taylor":             25000,
  "Max Greyserman":          25000,
  "Haotong Li":              25000,
  "Nico Echavarria":         25000,
  "Kristoffer Reitan":       30000,
  // Field players with estimated odds
  "Emiliano Grillo":         30000,
  "Christiaan Bezuidenhout": 30000,
  "Cam Davis":               30000,
  "Adam Schenk":             30000,
  "Garrick Higgo":           30000,
  "Davis Riley":             30000,
  "Tom Hoge":                30000,
  "Denny McCarthy":          30000,
  "Lee Hodges":              30000,
  "Keith Mitchell":          30000,
  "Erik van Rooyen":         30000,
  "Stephan Jaeger":          30000,
  "Chris Kirk":              30000,
  "Karl Vilips":             30000,
  "Matthieu Pavon":          30000,
  "Takumi Kanaya":           30000,
  "Matti Schmid":            30000,
  "S.H. Kim":                30000,
  "Thorbjørn Olesen":        35000,
  "Mackenzie Hughes":        35000,
  "Mark Hubbard":            35000,
  "Eric Cole":               35000,
  "Rico Hoey":               35000,
  "Mac Meissner":            35000,
  "Bud Cauley":              35000,
  "Vince Whaley":            40000,
  "Michael Thorbjornsen":    35000,
  "Chandler Phillips":       40000,
  "Danny Walker":            40000,
  "Jhonattan Vegas":         40000,
  "Gary Woodland":           40000,
  "Kevin Yu":                35000,
  "Ricky Castillo":          40000,
  "Lucas Glover":            35000,
  "Patton Kizzire":          40000,
  "Séamus Power":            35000,
  "Zecheng Dou":             40000,
  "Jordan Smith":            40000,
  "Andrew Putnam":           40000,
  "Patrick Rodgers":         40000,
  "Kevin Roy":               40000,
  "Joel Dahmen":             35000,
  "Alex Smalley":            40000,
  "Chad Ramey":              40000,
  "Taylor Moore":            40000,
  "Ryo Hisatsune":           40000,
  "Brian Campbell":          50000,
  "Steven Fisk":             50000,
  "Joe Highsmith":           50000,
  "William Mouw":            50000,
  "Austin Smotherman":       50000,
  "Max McGreevy":            50000,
  "Zach Bauchou":            50000,
  "A.J. Ewart":              50000,
  "Sudarshan Yellamaraju":   50000,
}

function assignTier(index) {
  if (index < 10) return 1
  if (index < 20) return 2
  if (index < 30) return 3
  if (index < 40) return 4
  if (index < 50) return 5
  return 6
}

async function main() {
  const { readFileSync } = await import("fs")
  const players = JSON.parse(readFileSync(new URL("./players_field.json", import.meta.url)))

  // Build full list with odds, sort ascending (favorites first), assign tiers
  const withOdds = players.map(p => ({
    espnId: p.id,
    name: p.name,
    odds: KNOWN_ODDS[p.name] ?? 50000,
  })).sort((a, b) => a.odds - b.odds)

  console.log(`Field: ${players.length} players`)
  console.log(`With known odds: ${players.filter(p => KNOWN_ODDS[p.name] !== undefined).length}`)
  console.log(`With estimated odds (50000): ${players.filter(p => KNOWN_ODDS[p.name] === undefined).length}`)
  players.filter(p => KNOWN_ODDS[p.name] === undefined).forEach(p => console.log("  UNKNOWN:", p.name))

  // Delete existing golfers
  const deleted = await prisma.majorsGolfer.deleteMany({ where: { tournamentId: TOURNAMENT_ID } })
  console.log(`\nDeleted ${deleted.count} old golfers`)

  // Create correct golfers
  const created = await prisma.majorsGolfer.createMany({
    data: withOdds.map((g, i) => ({
      tournamentId: TOURNAMENT_ID,
      name: g.name,
      espnId: g.espnId,
      odds: g.odds,
      tier: assignTier(i),
    }))
  })
  console.log(`Created ${created.count} golfers`)

  // Show tier breakdown
  for (let t = 1; t <= 6; t++) {
    const tier = withOdds.filter((_, i) => assignTier(i) === t)
    console.log(`\nTier ${t}: ${tier.map(g => `${g.name} (+${g.odds})`).join(", ")}`)
  }

  await prisma.majorsTournament.update({
    where: { id: TOURNAMENT_ID },
    data: { oddsUpdatedAt: new Date() }
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
