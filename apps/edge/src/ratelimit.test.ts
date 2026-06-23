import { describe, it, expect } from 'vitest'
import { RateLimiter } from './ratelimit'

describe('RateLimiter', () => {
  it('allows up to max within a window, then blocks', () => {
    const t = 1000
    const rl = new RateLimiter({ max: 3, windowMs: 1000 }, () => t)
    expect(rl.check('ip').allowed).toBe(true) // 1
    expect(rl.check('ip').allowed).toBe(true) // 2
    const third = rl.check('ip') // 3
    expect(third.allowed).toBe(true)
    expect(third.remaining).toBe(0)
    const fourth = rl.check('ip') // blocked
    expect(fourth.allowed).toBe(false)
    expect(fourth.retryAfter).toBe(1) // ~1s until reset
  })

  it('resets after the window elapses', () => {
    let t = 0
    const rl = new RateLimiter({ max: 2, windowMs: 1000 }, () => t)
    rl.check('ip')
    rl.check('ip')
    expect(rl.check('ip').allowed).toBe(false)
    t = 1001
    expect(rl.check('ip').allowed).toBe(true) // new window
  })

  it('keys independently per client', () => {
    const t = 0
    const rl = new RateLimiter({ max: 1, windowMs: 1000 }, () => t)
    expect(rl.check('a').allowed).toBe(true)
    expect(rl.check('a').allowed).toBe(false)
    expect(rl.check('b').allowed).toBe(true) // b unaffected by a
  })

  it('evicts expired counters so the map does not grow unbounded', () => {
    let t = 0
    const rl = new RateLimiter({ max: 1, windowMs: 100 }, () => t)
    for (let i = 0; i < 50; i++) rl.check(`ip-${i}`)
    t = 1000 // well past every window; next check triggers a sweep
    rl.check('trigger')
    // @ts-expect-error reach into the private map purely to assert eviction happened
    expect(rl.hits.size).toBeLessThan(5)
  })
})
