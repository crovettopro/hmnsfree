import type { IncomingMessage } from 'node:http'

/**
 * A tiny in-process, fixed-window rate limiter — defense-in-depth for the machine
 * plane under a public launch. It is NOT a substitute for an edge proxy (Cloudflare
 * in front of the edge is the real flood absorber, and the only place x-forwarded-for
 * is trustworthy); it's the cheap in-app backstop that stops a naive brute-force or
 * spam loop (the claim-code guesser, comment/proposal floods) without a deploy.
 *
 * Fixed-window over a token bucket on purpose: O(1), no timers per key, trivially
 * testable, and the small burst-at-boundary imprecision is irrelevant at these caps.
 */
export interface RateRule {
  /** Max requests allowed per window. */
  max: number
  /** Window length in ms. */
  windowMs: number
}

interface Counter {
  count: number
  resetAt: number
}

export interface RateVerdict {
  allowed: boolean
  /** Seconds until the window resets (for a Retry-After header) when blocked. */
  retryAfter: number
  remaining: number
}

/**
 * A keyed fixed-window limiter. One instance per logical bucket (e.g. "claim",
 * "post") so windows/caps don't bleed across endpoints. `now` is injectable for
 * deterministic tests.
 */
export class RateLimiter {
  private hits = new Map<string, Counter>()
  private lastSweep = 0

  constructor(
    private rule: RateRule,
    private now: () => number = Date.now,
  ) {}

  /** Record one hit for `key` and report whether it is within the limit. */
  check(key: string): RateVerdict {
    const t = this.now()
    this.maybeSweep(t)
    const cur = this.hits.get(key)
    if (!cur || t >= cur.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.rule.windowMs })
      return { allowed: true, retryAfter: 0, remaining: this.rule.max - 1 }
    }
    if (cur.count >= this.rule.max) {
      return { allowed: false, retryAfter: Math.ceil((cur.resetAt - t) / 1000), remaining: 0 }
    }
    cur.count++
    return { allowed: true, retryAfter: 0, remaining: this.rule.max - cur.count }
  }

  /** Evict expired counters occasionally so the map can't grow without bound. */
  private maybeSweep(t: number): void {
    if (t - this.lastSweep < this.rule.windowMs) return
    this.lastSweep = t
    for (const [k, c] of this.hits) if (t >= c.resetAt) this.hits.delete(k)
  }
}

/**
 * Best-effort client IP for rate-limit keying. Behind Railway (and, recommended,
 * Cloudflare) the real client is the LEFTMOST x-forwarded-for hop; the socket address
 * is the proxy and useless for keying. Spoofable without a trusted proxy in front —
 * which is exactly why Cloudflare is the production recommendation; this keeps a naive
 * attacker from a single host honest in the meantime.
 */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
  return first || req.socket.remoteAddress || 'unknown'
}
