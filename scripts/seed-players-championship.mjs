// Seed the 2026 Players Championship pool
// Odds are DraftKings composite sourced March 11-12, 2026
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Sorted ascending by odds (favorites first) — tiers auto-assigned: 1-10, 11-20, 21-30, 31-40, 41-50, 51+
const GOLFERS = [
  // --- Tier 1 (favorites, positions 1-10) ---
  { name: "Scottie Scheffler",           odds: 360  },
  { name: "Rory McIlroy",               odds: 850  },
  { name: "Bryson DeChambeau",          odds: 1200 },
  { name: "Jon Rahm",                   odds: 1500 },
  { name: "Collin Morikawa",            odds: 2000 },
  { name: "Tommy Fleetwood",            odds: 2000 },
  { name: "Ludvig Aberg",               odds: 2200 },
  { name: "Xander Schauffele",          odds: 2200 },
  { name: "Justin Rose",                odds: 3000 },
  { name: "Patrick Reed",               odds: 3000 },
  // --- Tier 2 (positions 11-20) ---
  { name: "Christopher Gotterup",       odds: 3500 },
  { name: "Hideki Matsuyama",           odds: 3500 },
  { name: "Viktor Hovland",             odds: 3500 },
  { name: "Jordan Spieth",              odds: 4000 },
  { name: "Justin Thomas",              odds: 4000 },
  { name: "Cameron Young",              odds: 4000 },
  { name: "Brooks Koepka",              odds: 4000 },
  { name: "Robert Macintyre",           odds: 4000 },
  { name: "Tyrrell Hatton",             odds: 4000 },
  { name: "Shane Lowry",                odds: 4500 },
  // --- Tier 3 (positions 21-30) ---
  { name: "Patrick Cantlay",            odds: 5000 },
  { name: "Ben Griffin",                odds: 5000 },
  { name: "Joaquin Niemann",            odds: 5000 },
  { name: "Akshay Bhatia",              odds: 5500 },
  { name: "Matthew Fitzpatrick",        odds: 5500 },
  { name: "Will Zalatoris",             odds: 5500 },
  { name: "Si Woo Kim",                 odds: 6000 },
  { name: "Corey Conners",              odds: 6000 },
  { name: "Russell Henley",             odds: 6600 },
  { name: "Min Woo Lee",                odds: 6600 },
  // --- Tier 4 (positions 31-40) ---
  { name: "Max Homa",                   odds: 6600 },
  { name: "Jason Day",                  odds: 6600 },
  { name: "Cameron Smith",              odds: 6600 },
  { name: "Adam Scott",                 odds: 6600 },
  { name: "Sepp Straka",                odds: 7000 },
  { name: "Sam Burns",                  odds: 7000 },
  { name: "Daniel Berger",              odds: 7000 },
  { name: "Sungjae Im",                 odds: 8000 },
  { name: "Marco Penge",                odds: 8000 },
  { name: "J. J. Spaun",               odds: 9000 },
  // --- Tier 5 (positions 41-50) ---
  { name: "Wyndham Clark",              odds: 9000 },
  { name: "Harris English",             odds: 9000 },
  { name: "Dustin Johnson",             odds: 9000 },
  { name: "Jacob Bridgeman",            odds: 9000 },
  { name: "Sahith Theegala",            odds: 9000 },
  { name: "Maverick Mcnealy",           odds: 10000 },
  { name: "Sergio Garcia",              odds: 10000 },
  { name: "Matt McCarty",               odds: 10000 },
  { name: "Tony Finau",                 odds: 10000 },
  { name: "Alexander Noren",            odds: 10000 },
  // --- Tier 6 (positions 51+) ---
  { name: "Ryan Gerard",                odds: 11000 },
  { name: "Ryan Fox",                   odds: 12000 },
  { name: "Keegan Bradley",             odds: 12000 },
  { name: "Jake Knapp",                 odds: 12000 },
  { name: "Harry Hall",                 odds: 13000 },
  { name: "Aaron Rai",                  odds: 13000 },
  { name: "Pierceson Coody",            odds: 13000 },
  { name: "John Keefer",                odds: 13000 },
  { name: "Rasmus Neergaard-Petersen",  odds: 13000 },
  { name: "Davis Thompson",             odds: 14000 },
  { name: "Tom McKibbin",               odds: 14000 },
  { name: "Taylor Pendrith",            odds: 15000 },
  { name: "Tiger Woods",                odds: 15000 },
  { name: "Rasmus Hojgaard",            odds: 15000 },
  { name: "Kurt Kitayama",              odds: 15000 },
  { name: "Carlos Ortiz",               odds: 15000 },
  { name: "Brian Harman",               odds: 15000 },
  { name: "Sam Stevens",                odds: 15000 },
  { name: "Nicolai Hojgaard",           odds: 15000 },
  { name: "Sami Valimaki",              odds: 19000 },
  { name: "Phil Mickelson",             odds: 20000 },
  { name: "Michael Kim",                odds: 20000 },
  { name: "Andrew Novak",               odds: 20000 },
  { name: "Aldrich Potgieter",          odds: 20000 },
  { name: "Jayden Trey Schaper",        odds: 20000 },
  { name: "Rickie Fowler",              odds: 25000 },
  { name: "Nick Taylor",                odds: 25000 },
  { name: "Max Greyserman",             odds: 25000 },
  { name: "Haotong Li",                 odds: 25000 },
  { name: "Nico Echavarria",            odds: 25000 },
  { name: "Kristoffer Reitan",          odds: 30000 },
  { name: "Charl Schwartzel",           odds: 35000 },
  { name: "Zach Johnson",               odds: 40000 },
]

function assignTier(index) {
  if (index < 10) return 1
  if (index < 20) return 2
  if (index < 30) return 3
  if (index < 40) return 4
  if (index < 50) return 5
  return 6
}

async function main() {
  // Find the first user (the admin)
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (!user) {
    console.error("No users found — please register an account first at http://localhost:3000/register")
    process.exit(1)
  }
  console.log(`Creating tournament for user: ${user.name} (${user.email})`)

  // Check if it already exists
  const existing = await prisma.majorsTournament.findFirst({
    where: { type: "PLAYERS_CHAMPIONSHIP", year: 2026 },
  })
  if (existing) {
    console.log(`Tournament already exists: ${existing.id}`)
    console.log(`Visit: http://localhost:3000/majors/${existing.id}`)
    process.exit(0)
  }

  const tournament = await prisma.majorsTournament.create({
    data: {
      name: "2026 The Players Championship",
      type: "PLAYERS_CHAMPIONSHIP",
      year: 2026,
      status: "UPCOMING",
      espnLeague: "pga",
      espnEventId: "401811937",
      oddsUpdatedAt: new Date(),
      createdById: user.id,
      golfers: {
        create: GOLFERS.map((g, i) => ({
          name: g.name,
          odds: g.odds,
          tier: assignTier(i),
        })),
      },
    },
  })

  console.log(`\n✓ Tournament created: ${tournament.id}`)
  console.log(`  ${GOLFERS.length} golfers seeded across 6 tiers`)
  console.log(`\nAdmin page:  http://localhost:3000/majors/${tournament.id}`)
  console.log(`Entry link:  http://localhost:3000/majors/${tournament.id}/enter`)
  console.log(`\nOdds source: DraftKings composite (March 11-12, 2026)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
