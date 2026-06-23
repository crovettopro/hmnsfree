import { describe, it, expect, vi } from 'vitest'
import { YouTubeClient, YouTubeError } from './youtube'

function mockFetch(routes: Record<string, { status?: number; body?: any }>) {
  const calls: string[] = []
  const fn = vi.fn(async (url: any, _init?: any) => {
    const u = String(url)
    calls.push(u)
    const path = new URL(u).pathname
    const r = routes[path] ?? { status: 404, body: { error: { message: 'not found' } } }
    const status = r.status ?? 200
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(r.body ?? {}) } as any
  })
  return { fn, calls }
}

describe('YouTubeClient', () => {
  it('is inert without a key', async () => {
    const c = new YouTubeClient({ apiKey: '' })
    expect(c.configured).toBe(false)
    await expect(c.listComments('v1')).rejects.toThrow(/YOUTUBE_API_KEY/)
  })

  it('sends the key as a query param (never a header) and parses comments', async () => {
    const { fn, calls } = mockFetch({
      '/youtube/v3/commentThreads': {
        body: {
          items: [
            { id: 'c1', snippet: { topLevelComment: { snippet: { authorDisplayName: 'Ada', textDisplay: 'first!', likeCount: 3, publishedAt: '2026-01-01' } } } },
          ],
          nextPageToken: 'NEXT',
        },
      },
    })
    const c = new YouTubeClient({ apiKey: 'KEY', fetchImpl: fn })
    const r = await c.listComments('vid', { maxResults: 10 })
    expect(r.comments).toEqual([{ id: 'c1', author: 'Ada', authorImage: undefined, text: 'first!', likeCount: 3, publishedAt: '2026-01-01' }])
    expect(r.nextPageToken).toBe('NEXT')
    expect(calls[0]).toContain('key=KEY')
    expect(calls[0]).toContain('videoId=vid')
    // GET only — assert no Authorization header was used
    expect(fn.mock.calls[0][1]?.headers).toBeUndefined()
    expect(c.unitsUsed).toBe(1)
  })

  it('lists uploads via channels→playlistItems and caches the playlist id', async () => {
    const { fn, calls } = mockFetch({
      '/youtube/v3/channels': { body: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UP123' } } }] } },
      '/youtube/v3/playlistItems': {
        body: { items: [{ contentDetails: { videoId: 'v9', videoPublishedAt: '2026-02-02' }, snippet: { title: 'Ep 9' } }] },
      },
    })
    const c = new YouTubeClient({ apiKey: 'K', fetchImpl: fn })
    const r1 = await c.listUploads('chan')
    expect(r1.videos[0]).toMatchObject({ id: 'v9', title: 'Ep 9', publishedAt: '2026-02-02' })
    await c.listUploads('chan') // second call should NOT re-hit /channels
    const channelHits = calls.filter((u) => u.includes('/channels')).length
    expect(channelHits).toBe(1)
  })

  it('resolves an active live chat id, or null when not live', async () => {
    const live = mockFetch({ '/youtube/v3/videos': { body: { items: [{ liveStreamingDetails: { activeLiveChatId: 'LC1' } }] } } })
    expect(await new YouTubeClient({ apiKey: 'K', fetchImpl: live.fn }).getActiveLiveChatId('v')).toBe('LC1')
    const notLive = mockFetch({ '/youtube/v3/videos': { body: { items: [{ liveStreamingDetails: {} }] } } })
    expect(await new YouTubeClient({ apiKey: 'K', fetchImpl: notLive.fn }).getActiveLiveChatId('v')).toBeNull()
  })

  it('parses live chat and surfaces pollingIntervalMillis', async () => {
    const { fn } = mockFetch({
      '/youtube/v3/liveChat/messages': {
        body: {
          items: [{ id: 'm1', authorDetails: { displayName: 'Bo' }, snippet: { displayMessage: 'hi', publishedAt: '2026-03-03' } }],
          nextPageToken: 'P2',
          pollingIntervalMillis: 4200,
        },
      },
    })
    const c = new YouTubeClient({ apiKey: 'K', fetchImpl: fn })
    const r = await c.listLiveChat('LC1')
    expect(r.messages[0]).toEqual({ id: 'm1', author: 'Bo', text: 'hi', publishedAt: '2026-03-03' })
    expect(r.pollingIntervalMillis).toBe(4200)
  })

  it('throws a YouTubeError on an API error', async () => {
    const { fn } = mockFetch({ '/youtube/v3/commentThreads': { status: 403, body: { error: { message: 'quota exceeded' } } } })
    const c = new YouTubeClient({ apiKey: 'K', fetchImpl: fn })
    await expect(c.listComments('v')).rejects.toBeInstanceOf(YouTubeError)
  })
})
