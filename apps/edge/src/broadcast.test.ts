import { describe, it, expect } from 'vitest'
import { Broadcaster } from './broadcast'

/** Minimal ServerResponse stand-in that records writes and can simulate a dead socket. */
function mockRes() {
  const o: any = { writableEnded: false, destroyed: false, fail: false, _writes: [] as string[] }
  o.writeHead = (_s: number, h: any) => {
    o.headers = h
  }
  o.write = (chunk: string) => {
    if (o.fail) throw new Error('EPIPE: socket closed')
    o._writes.push(chunk)
    return true
  }
  o.on = () => {}
  return o
}

describe('Broadcaster fan-out resilience', () => {
  it('a client that closed (writableEnded) does not starve the rest of the fan-out', () => {
    const b = new Broadcaster()
    const dead = mockRes()
    const healthy = mockRes()
    b.addClient(dead) // dead is FIRST in the set — the old loop would abort here
    b.addClient(healthy)
    dead.writableEnded = true

    b.broadcast({ type: 'audience.post', authorModelId: 'x', authorName: '@a', text: 'still-delivered' })

    expect(healthy._writes.some((w: string) => w.includes('still-delivered'))).toBe(true)
    expect(b.listenerCount).toBe(1) // dead client was dropped
  })

  it('a throwing write is caught and that client dropped, others keep receiving', () => {
    const b = new Broadcaster()
    const boom = mockRes()
    const healthy = mockRes()
    b.addClient(boom)
    b.addClient(healthy)
    boom.fail = true // next write throws

    b.broadcast({ type: 'audience.post', authorModelId: 'x', authorName: '@a', text: 'survives' })

    expect(healthy._writes.some((w: string) => w.includes('survives'))).toBe(true)
    expect(b.listenerCount).toBe(1)
  })
})
