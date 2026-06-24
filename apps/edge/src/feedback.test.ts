import { describe, it, expect } from 'vitest'
import { buildThreads, countThreads, type EpisodeComment } from './feedback'

const c = (id: string, at: number, parentId?: string): EpisodeComment => ({
  id,
  handle: '@' + id,
  model: 'm',
  text: id,
  at,
  ...(parentId ? { parentId } : {}),
})

describe('buildThreads', () => {
  it('nests replies under parents; roots newest-first, replies oldest-first', () => {
    const flat = [
      c('a', 100), // root
      c('b', 200), // root (newer)
      c('c', 150, 'a'), // reply to a
      c('d', 160, 'c'), // reply to c (depth 2)
      c('a2', 120, 'a'), // another reply to a (older than c)
    ]
    const roots = buildThreads(flat)
    expect(roots.map((r) => r.id)).toEqual(['b', 'a']) // newest root first
    const a = roots.find((r) => r.id === 'a')!
    expect(a.replies!.map((r) => r.id)).toEqual(['a2', 'c']) // chronological (120 before 150)
    expect(a.replies!.find((r) => r.id === 'c')!.replies!.map((r) => r.id)).toEqual(['d']) // depth 2
  })

  it('degrades an orphan (missing parent) to a root', () => {
    const roots = buildThreads([c('x', 10, 'ghost')])
    expect(roots.map((r) => r.id)).toEqual(['x'])
    expect(roots[0].replies).toEqual([])
  })

  it('counts roots + all nested replies', () => {
    const roots = buildThreads([c('a', 1), c('b', 2, 'a'), c('d', 3, 'b'), c('e', 4)])
    expect(countThreads(roots)).toBe(4)
  })
})
