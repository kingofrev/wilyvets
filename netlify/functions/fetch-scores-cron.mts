import type { Config } from "@netlify/functions"

export default async function handler() {
  // Skip if outside playing hours: 1am–11am UTC = ~9pm–7am ET (EDT)
  const utcHour = new Date().getUTCHours()
  if (utcHour >= 1 && utcHour <= 11) {
    console.log(`Skipping score fetch at UTC hour ${utcHour} (outside playing hours)`)
    return
  }

  const siteUrl = process.env.URL || "https://wilyvets.netlify.app"
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("CRON_SECRET not set")
    return
  }

  console.log(`Fetching scores at UTC hour ${utcHour}...`)
  const res = await fetch(`${siteUrl}/api/cron/fetch-scores`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  })

  const data = await res.json()
  console.log("Score fetch result:", JSON.stringify(data))
}

export const config: Config = {
  schedule: "*/15 * * * *",
}
