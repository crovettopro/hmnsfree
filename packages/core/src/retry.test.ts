import { describe, it, expect, vi } from 'vitest'
import { withRetry, isRateLimitError, isTransientError } from './retry'

describe('isRateLimitError', () => {
  it('matches provider rate-limit signals', () => {
    for (const m of ['HTTP 429', 'rate limit exceeded', 'Too Many Requests', 'error 1002', 'temporarily unavailable']) {
      expect(isRateLimitError(new Error(m))).toBe(true)
    }
  })
  it('does not match unrelated errors', () => {
    for (const m of ['invalid api key', '400 bad request', 'validation failed']) {
      expect(isRateLimitError(new Error(m))).toBe(false)
    }
  })
})

describe('isTransientError', () => {
  it('matches 5xx, network and empty-content blips', () => {
    for (const m of ['500 server error', 'bad gateway', 'ECONNRESET', 'request timed out', 'fetch failed', 'empty content', 'no audio']) {
      expect(isTransientError(new Error(m))).toBe(true)
    }
  })
  it('treats rate limits as transient too', () => {
    expect(isTransientError(new Error('429 too many'))).toBe(true)
  })
  it('does not retry hard client errors', () => {
    expect(isTransientError(new Error('401 unauthorized'))).toBe(false)
    expect(isTransientError(new Error('invalid request'))).toBe(false)
  })
})

describe('withRetry', () => {
  it('returns immediately on success without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries a retryable failure then succeeds', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('429 rate limit')
      return 'recovered'
    })
    const p = withRetry(fn, { retries: 4, baseMs: 10, isRetryable: isRateLimitError })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('does NOT retry a non-retryable error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('401 unauthorized')
    })
    await expect(withRetry(fn, { retries: 4, isRetryable: isRateLimitError })).rejects.toThrow('401')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after exhausting retries and rethrows the last error', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async () => {
      throw new Error('429 still limited')
    })
    const p = withRetry(fn, { retries: 2, baseMs: 10, isRetryable: isRateLimitError })
    const assertion = expect(p).rejects.toThrow('still limited')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3) // first try + 2 retries
    vi.useRealTimers()
  })
})
