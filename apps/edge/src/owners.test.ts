import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// owners.ts resolves its store path from STATIC_DATA_DIR at module load — point it at
// a throwaway tmp dir BEFORE importing so the test never touches the real volume.
let owners: typeof import('./owners')
let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hmnsoff-owners-'))
  process.env.STATIC_DATA_DIR = dir
  owners = await import('./owners')
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createOwner', () => {
  it('mints an empty portfolio with a unique recovery key', async () => {
    const a = await owners.createOwner()
    const b = await owners.createOwner()
    expect(a.ownerKey).toMatch(/^HMNSOFF-OWNER-[0-9a-f]{32}$/)
    expect(a.handles).toEqual([])
    expect(a.label).toBeUndefined()
    expect(b.ownerKey).not.toBe(a.ownerKey)
    // both retrievable by their key
    expect((await owners.ownerByKey(a.ownerKey))?.ownerKey).toBe(a.ownerKey)
  })

  it('keeps an optional label', async () => {
    const rec = await owners.createOwner('  My lab  ')
    expect(rec.label).toBe('My lab')
  })

  it('caps the label at 60 chars on create (matches the rename cap)', async () => {
    const rec = await owners.createOwner('x'.repeat(120))
    expect(rec.label).toHaveLength(60)
  })
})

describe('setOwnerLabel', () => {
  it('renames a portfolio and clears it with an empty string', async () => {
    const rec = await owners.createOwner()
    const renamed = await owners.setOwnerLabel(rec.ownerKey, 'Eduardo’s AIs')
    expect(renamed?.label).toBe('Eduardo’s AIs')
    const cleared = await owners.setOwnerLabel(rec.ownerKey, '')
    expect(cleared?.label).toBeUndefined()
  })

  it('returns undefined for an unknown key', async () => {
    expect(await owners.setOwnerLabel('HMNSOFF-OWNER-nope', 'x')).toBeUndefined()
  })
})

describe('recordOwner roster linking', () => {
  it('links a second AI onto an existing account and de-dupes by handle', async () => {
    const first = await owners.recordOwner('@alpha', 'modelA')
    expect(first.handles.map((h) => h.handle)).toEqual(['@alpha'])

    const linked = await owners.recordOwner('@beta', 'modelB', undefined, first.ownerKey)
    expect(linked.ownerKey).toBe(first.ownerKey)
    expect(linked.handles.map((h) => h.handle)).toEqual(['@alpha', '@beta'])

    // Re-claiming @beta refreshes the entry, doesn't duplicate it.
    const again = await owners.recordOwner('@beta', 'modelB2', undefined, first.ownerKey)
    expect(again.handles).toHaveLength(2)
    expect(again.handles.find((h) => h.handle === '@beta')?.model).toBe('modelB2')
  })

  it('counts published-catalogue appearances even with an empty volume (After Hours undercount fix)', async () => {
    // The tmp volume has no episodes, but the committed catalogue.json carries the
    // guest-featuring shows — so @openbuddy's After Hours run must still resolve.
    const s = await owners.statsForHandle({ handle: '@openbuddy', model: '', claimedAt: 0 })
    expect(s.debates).toBeGreaterThanOrEqual(5)
    expect(s.appearances.some((a) => a.id.startsWith('ah-'))).toBe(true)
    expect(typeof s.comments).toBe('number')
    expect(typeof s.reactions).toBe('number')
    // Unfilled "GUEST N" placeholder seats must never show as a partner.
    expect(s.partners.some((p) => /^GUEST \d+$/i.test(p))).toBe(false)
    // ep-001's cast lists @OpenBuddy in TWO seats — both seats' turns must be counted
    // (27, not just the first seat's 17): the duplicate-seat undercount fix.
    const ep1 = s.appearances.find((a) => a.id === 'ep-001')
    expect(ep1?.turns).toBe(27)
  })

  it('statsForOwner surfaces the label + every handle (0 debates with no library)', async () => {
    const rec = await owners.createOwner('Roster')
    await owners.recordOwner('@solo', 'm', undefined, rec.ownerKey)
    const fresh = await owners.ownerByKey(rec.ownerKey)
    const acct = await owners.statsForOwner(fresh!)
    expect(acct.label).toBe('Roster')
    expect(acct.agents).toHaveLength(1)
    expect(acct.agents[0]).toMatchObject({ handle: '@solo', debates: 0, turns: 0 })
  })
})
