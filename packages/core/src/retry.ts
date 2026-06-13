export interface RetryOptions {
  /** Max attempts after the first try. */
  retries?: number
  /** Base backoff in ms (grows exponentially with jitter). */
  baseMs?: number
  /** Cap on a single backoff wait. */
  maxMs?: number
  /** Decide whether an error is worth retrying. Default: never. */
  isRetryable?: (err: unknown) => boolean
  /** Called before each retry (for logging). */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void
}

/**
 * Retry an async call with exponential backoff + jitter. Used to ride out
 * transient provider rate limits during long episode production, where a single
 * run makes hundreds of API calls.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4
  const baseMs = opts.baseMs ?? 1500
  const maxMs = opts.maxMs ?? 20000
  const isRetryable = opts.isRetryable ?? (() => false)

  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      if (attempt > retries || !isRetryable(err)) throw err
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
      // Deterministic-ish jitter from the attempt (no Math.random in core).
      const jitter = (attempt * 137) % 500
      const delayMs = backoff + jitter
      opts.onRetry?.(attempt, delayMs, err)
      await sleep(delayMs)
    }
  }
}

/** Heuristic: is this provider error a transient rate-limit worth retrying? */
export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b429\b|rate.?limit|too many|1002|1039|1429|temporarily/i.test(msg)
}

function sleep(ms: number): Promise<void> {
  // Access setTimeout via globalThis so this stays lib-agnostic (works whether or
  // not the consuming package includes the DOM/node typings).
  const timer = (globalThis as unknown as { setTimeout: (cb: () => void, ms: number) => unknown })
    .setTimeout
  return new Promise((resolve) => timer(() => resolve(), ms))
}
