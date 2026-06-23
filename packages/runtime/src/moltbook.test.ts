import { describe, it, expect, vi } from 'vitest'
import { MoltbookClient, parseChallenge, extractNumbers, MoltbookError } from './moltbook'

// Real challenge texts captured from Moltbook (obfuscated lobster/physics word problems).
const CORPUS: { text: string; answer: number | null }[] = [
  { text: 'A] LoBb.StErR~ ClAwW ExErTs^ FoRtY FiVe{ nEu-ToNs] UmMm AnD^ ThE/ OtHeR~ ClAwW ExErTs< TwEnTy ThReE~ nEuToNs, HoW^ MuCh] ToTaL{ FoRcE?', answer: 68 },
  { text: 'A] L oB sT eR S^wImS[ aT/ tW eN tY T hR eE mE tE rS pE r] sE cO nD, uM aN d A cC eL eR aTeS/ bY[ fI vE mE tE rS pE r] sE cO nD, wH-aT iS^ tHe/ nE w V eL oC iT y?', answer: 28 },
  { text: 'A] Lo^bS-tEr ClAw F[oR^cE Is] FoR tY NeW]tOnS AnD GaI^nS TwEnTy ThReE NeW}tOnS, WhA t Is ToTaL FoRcE?', answer: 63 },
  { text: 'LooO bSssT]eR lOo^bSt-Er ClA~w F oR cE iS tHiR tY TwO nEe^tO ns umm umm / aNd ItS ClAw PoWeR Is Mu lTi PlIeD By Se V]eN~ dUrInG MoL tInG, WhAt Is ThE ToTaL FoR cE?', answer: 224 },
  // Distractor: three+ numbers ("twenty two ... no, eight ... product of twenty two and eight") — MUST abstain.
  { text: 'A] lOoO bS t-ErRr LooobsssSteR^ sWiMmS~ aNd Um| eXtErTs- cLaW fOrCeS ]tWeNtY tWo^ nEwToNs[ aNd- aNoThEr WeNtY-tWo? Um nO, sIlLy, iT sAyS ]eIgHt{ nEwToNs<, So^ wHaT| Is^ tHe/ pRoDuCt- oF tWeNtY tWo }aNd- eIgHt?', answer: null },
  { text: 'A] lO.bSt-Er ClAw] ExErTs^ ThIrTy~ NeOwToNs| aNd- Um AnOtHeR] AdDs^ TwElVe< NooToNs~, ToTaL} FoRcE/?', answer: 42 },
]

describe('parseChallenge (real Moltbook corpus)', () => {
  for (const { text, answer } of CORPUS) {
    it(`${answer === null ? 'abstains on' : `solves to ${answer} for`} "${text.slice(0, 28)}…"`, () => {
      const sol = parseChallenge(text)
      if (answer === null) expect(sol).toBeNull()
      else expect(sol?.answer).toBe(answer)
    })
  }

  it('abstains when two numbers are present but no operation keyword is', () => {
    expect(parseChallenge('forty two and twenty three nearby')).toBeNull()
    expect(parseChallenge('twenty three and forty')).toBeNull()
  })

  it('still solves a clean additive problem', () => {
    expect(parseChallenge('a force of forty plus twenty three, total?')?.answer).toBe(63)
  })

  it('handles division and rounds to 2 decimals', () => {
    expect(parseChallenge('forty divided by three, what is the quotient?')?.answer).toBe(13.33)
  })

  it('abstains on empty / junk', () => {
    expect(parseChallenge('')).toBeNull()
    expect(parseChallenge('no numbers here at all')).toBeNull()
  })
})

describe('extractNumbers', () => {
  it('merges split/obfuscated number words', () => {
    expect(extractNumbers('fortyfive')).toEqual([45])
    expect(extractNumbers('twentythreesomethingfive')).toEqual([23, 5])
    expect(extractNumbers('onehundred')).toEqual([100])
  })
})

// ── Client (mocked transport) ──

function mockFetch(handler: (url: string, init: any) => { status?: number; body?: any }) {
  const calls: { url: string; init: any }[] = []
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    const r = handler(String(url), init)
    const status = r.status ?? 200
    const text = r.body == null ? '' : JSON.stringify(r.body)
    return { ok: status >= 200 && status < 300, status, text: async () => text } as any
  })
  return { fn, calls }
}

describe('MoltbookClient', () => {
  it('sends the bearer key and parses the feed', async () => {
    const { fn, calls } = mockFetch(() => ({ body: { posts: [{ id: 'p1', title: 'hi' }] } }))
    const c = new MoltbookClient({ apiKey: 'testkey', fetchImpl: fn })
    const feed = await c.getFeed({ sort: 'new', limit: 5 })
    expect(feed).toHaveLength(1)
    expect(feed[0].id).toBe('p1')
    expect(calls[0].init.headers.Authorization).toBe('Bearer testkey')
    expect(calls[0].url).toContain('/posts?')
  })

  it('publishes immediately when no challenge is returned (trusted account)', async () => {
    const { fn } = mockFetch(() => ({ body: { post: { id: 'p1' } } }))
    const c = new MoltbookClient({ apiKey: 'k', fetchImpl: fn })
    const out = await c.publishPost({ submolt: 'general', title: 't', content: 'c' })
    expect(out).toMatchObject({ ok: true, id: 'p1', status: 'published' })
  })

  it('solves a confident challenge and verifies', async () => {
    let verifyBody: any = null
    const { fn } = mockFetch((url, init) => {
      if (url.endsWith('/posts')) return { body: { post: { id: 'p1', verification: { verification_code: 'vc', challenge_text: CORPUS[0].text } } } }
      if (url.endsWith('/verify')) {
        verifyBody = JSON.parse(init.body)
        return { body: { success: true } }
      }
      return { body: {} }
    })
    const c = new MoltbookClient({ apiKey: 'k', fetchImpl: fn })
    const out = await c.publishPost({ submolt: 'general', title: 't' })
    expect(out.status).toBe('published')
    expect(verifyBody).toEqual({ verification_code: 'vc', answer: '68.00' })
  })

  it('leaves content pending (and surfaces the challenge) when it cannot solve confidently', async () => {
    const verify = vi.fn()
    const { fn } = mockFetch((url) => {
      if (url.endsWith('/verify')) {
        verify()
        return { body: { success: true } }
      }
      return { body: { comment: { id: 'c1', verification: { verification_code: 'vc', challenge_text: CORPUS[4].text } } } }
    })
    const c = new MoltbookClient({ apiKey: 'k', fetchImpl: fn })
    const out = await c.publishComment('p1', 'nice point')
    expect(out.status).toBe('pending')
    expect(out.verification?.verification_code).toBe('vc')
    expect(verify).not.toHaveBeenCalled() // never guessed
  })

  it('trips the failure breaker instead of marching toward suspension', async () => {
    const { fn } = mockFetch((url) => {
      if (url.endsWith('/verify')) return { body: { success: false } } // rejects every answer
      return { body: { post: { id: 'p', verification: { verification_code: 'vc', challenge_text: CORPUS[0].text } } } }
    })
    const c = new MoltbookClient({ apiKey: 'k', fetchImpl: fn, maxConsecutiveFailures: 1 })
    const first = await c.publishPost({ submolt: 'general', title: 't' })
    expect(first.status).toBe('pending') // tried, rejected → 1 failure
    const second = await c.publishPost({ submolt: 'general', title: 't' })
    expect(second.reason).toMatch(/breaker/) // now refuses to try
  })

  it('throws a terminal MoltbookError on a 4xx (no retry)', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 401, body: { error: 'Unauthorized' } }))
    const c = new MoltbookClient({ apiKey: 'bad', fetchImpl: fn })
    await expect(c.getFeed()).rejects.toBeInstanceOf(MoltbookError)
    expect(calls).toHaveLength(1)
  })

  it('throws when no API key is configured', async () => {
    const c = new MoltbookClient({ apiKey: '', fetchImpl: vi.fn() })
    expect(c.configured).toBe(false)
    await expect(c.getFeed()).rejects.toThrow(/MOLTBOOK_API_KEY/)
  })
})
