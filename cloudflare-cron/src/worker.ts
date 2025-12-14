import type { ScheduledEvent } from '@cloudflare/workers-types'

export interface Env {
  VERCEL_BASE_URL: string
  CRON_SECRET: string
}

// Endpoint paths
const endpoints = {
  investingFr: "/api/investing?lang=fr&db=true",
  investingEn: "/api/investing?lang=en&db=true",
  renewalNotice: "/api/cron/renewal-notice",
  renewTradovate: "/api/cron/renew-tradovate-token",
} as const

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const base = env.VERCEL_BASE_URL?.replace(/\/$/, "")
    if (!base) return new Response("Missing VERCEL_BASE_URL", { status: 500 })

    const url = new URL(request.url)
    const task = url.searchParams.get("task") // one of: investing-fr, investing-en, renewal-notice, renew-tradovate-token
    const allowed = new Map<string, string>([
      ["investing-fr", endpoints.investingFr],
      ["investing-en", endpoints.investingEn],
      ["renewal-notice", endpoints.renewalNotice],
      ["renew-tradovate-token", endpoints.renewTradovate],
    ])

    if (!task || !allowed.has(task)) {
      return Response.json({
        ok: false,
        error: "Provide ?task=investing-fr|investing-en|renewal-notice|renew-tradovate-token",
      }, { status: 400 })
    }

    const path = allowed.get(task)!
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Cloudflare-Worker-Cron",
      }
      if (env.CRON_SECRET) {
        headers.authorization = `Bearer ${env.CRON_SECRET}`
      }
      const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers,
      })
      const text = await res.text()
      return Response.json({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        body: text,
      }, { status: res.ok ? 200 : res.status })
    } catch (err) {
      return Response.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const base = env.VERCEL_BASE_URL?.replace(/\/$/, "")
    if (!base) {
      console.error("VERCEL_BASE_URL is not set")
      return
    }

    // Use event.scheduledTime (ms) in UTC to gate tasks
    const now = new Date(event.scheduledTime)
    const minute = now.getUTCMinutes()
    const hour = now.getUTCHours()
    const day = now.getUTCDay() // 0=Sun, 1=Mon

    const requests: Array<{ name: string; path: string }> = []

    // Every 10 minutes: renew Tradovate token
    if (minute % 10 === 0) {
      requests.push({ name: "renew-tradovate-token", path: endpoints.renewTradovate })
    }

    // Daily at 09:00 UTC: renewal notice
    if (hour === 9 && minute === 0) {
      requests.push({ name: "renewal-notice", path: endpoints.renewalNotice })
    }

    // Mondays at 05:00 UTC: investing FR and EN
    if (day === 1 && hour === 5 && minute === 0) {
      requests.push({ name: "investing-fr", path: endpoints.investingFr })
      requests.push({ name: "investing-en", path: endpoints.investingEn })
    }

    if (requests.length === 0) {
      return
    }

    await Promise.all(
      requests.map(async ({ name, path }) => {
        const url = `${base}${path}`
        try {
          const headers: Record<string, string> = {
            "User-Agent": "Cloudflare-Worker-Cron",
          }
          if (env.CRON_SECRET) {
            headers.authorization = `Bearer ${env.CRON_SECRET}`
          }
          const res = await fetch(url, {
            method: "GET",
            headers,
          })
          if (!res.ok) {
            const text = await res.text()
            console.error(`[${name}] ${res.status} ${res.statusText}: ${text}`)
          } else {
            console.log(`[${name}] OK ${res.status}`)
          }
        } catch (err) {
          console.error(`[${name}] Fetch failed:`, err)
        }
      })
    )
  },
}

export default worker
