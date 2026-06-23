import { withRetry, isTransientError } from '@static/core'

/**
 * YouTube Data API v3 client — proxied through the EDGE so the API key never ships
 * to the browser (it would be a public read/quota-burn key in the VITE bundle). It
 * powers three product surfaces: reading comments on uploaded shows, pulling the
 * historical catalogue of videos/lives, and polling a live broadcast's chat.
 *
 * Quota-aware by construction (10k units/day): comment + video reads are 1 unit each
 * and history uses channels→playlistItems (1+1) — NEVER search.list (100 units) for
 * enumeration. Inert until YOUTUBE_API_KEY is set (`configured === false`), so the
 * edge runs unchanged without credentials.
 */
const DEFAULT_BASE = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeComment {
  id: string
  author: string
  authorImage?: string
  text: string
  likeCount: number
  publishedAt: string
}
export interface YouTubeVideo {
  id: string
  title: string
  publishedAt: string
  thumbnail?: string
}
export interface YouTubeChatMessage {
  id: string
  author: string
  text: string
  publishedAt: string
}

export interface YouTubeOptions {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'YouTubeError'
  }
}

export class YouTubeClient {
  private apiKey: string
  private base: string
  private fetchImpl: typeof fetch
  private uploadsPlaylist = new Map<string, string>()
  /** Best-effort running quota tally (units) for back-office observability. */
  unitsUsed = 0

  constructor(opts: YouTubeOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.YOUTUBE_API_KEY ?? ''
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch)
  }

  get configured(): boolean {
    return !!this.apiKey
  }

  /** Comments on a video (commentThreads.list, 1 unit). Newest first. */
  async listComments(videoId: string, opts: { pageToken?: string; maxResults?: number } = {}): Promise<{ comments: YouTubeComment[]; nextPageToken?: string }> {
    const data = await this.get('/commentThreads', {
      part: 'snippet',
      videoId,
      order: 'time',
      maxResults: String(opts.maxResults ?? 50),
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    })
    const comments: YouTubeComment[] = (data.items ?? []).map((it: any) => {
      const s = it.snippet?.topLevelComment?.snippet ?? {}
      return {
        id: it.id,
        author: s.authorDisplayName ?? '',
        authorImage: s.authorProfileImageUrl,
        text: s.textDisplay ?? '',
        likeCount: s.likeCount ?? 0,
        publishedAt: s.publishedAt ?? '',
      }
    })
    return { comments, nextPageToken: data.nextPageToken }
  }

  /** Historical uploads (channels.list contentDetails → playlistItems.list, 1+1 units,
   *  the channels lookup cached). Never search.list (100 units). */
  async listUploads(channelId: string, opts: { pageToken?: string; maxResults?: number } = {}): Promise<{ videos: YouTubeVideo[]; nextPageToken?: string }> {
    let playlistId = this.uploadsPlaylist.get(channelId)
    if (!playlistId) {
      const ch = await this.get('/channels', { part: 'contentDetails', id: channelId })
      playlistId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
      if (!playlistId) throw new YouTubeError(`no uploads playlist for channel ${channelId}`, 404)
      this.uploadsPlaylist.set(channelId, playlistId)
    }
    const data = await this.get('/playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(opts.maxResults ?? 50),
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    })
    const videos: YouTubeVideo[] = (data.items ?? []).map((it: any) => ({
      id: it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId ?? '',
      title: it.snippet?.title ?? '',
      publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? '',
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url,
    }))
    return { videos, nextPageToken: data.nextPageToken }
  }

  /** The active live-chat id for a currently-live video, or null if not live (1 unit). */
  async getActiveLiveChatId(videoId: string): Promise<string | null> {
    const data = await this.get('/videos', { part: 'liveStreamingDetails', id: videoId })
    return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null
  }

  /**
   * One page of a live broadcast's chat (liveChatMessages.list). RESPECT the returned
   * pollingIntervalMillis between calls — polling faster (e.g. 1s) burns the daily quota
   * in ~30 min. A single poller per show fits one show/day inside the 10k budget.
   */
  async listLiveChat(liveChatId: string, opts: { pageToken?: string } = {}): Promise<{ messages: YouTubeChatMessage[]; nextPageToken?: string; pollingIntervalMillis: number }> {
    const data = await this.get('/liveChat/messages', {
      part: 'snippet,authorDetails',
      liveChatId,
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    })
    const messages: YouTubeChatMessage[] = (data.items ?? []).map((it: any) => ({
      id: it.id,
      author: it.authorDetails?.displayName ?? '',
      text: it.snippet?.displayMessage ?? '',
      publishedAt: it.snippet?.publishedAt ?? '',
    }))
    return { messages, nextPageToken: data.nextPageToken, pollingIntervalMillis: data.pollingIntervalMillis ?? 5000 }
  }

  private async get(path: string, params: Record<string, string>): Promise<any> {
    if (!this.apiKey) throw new YouTubeError('YOUTUBE_API_KEY is not set', 0)
    const q = new URLSearchParams({ ...params, key: this.apiKey })
    const url = `${this.base}${path}?${q}`
    const doFetch = async (): Promise<any> => {
      const res = await this.fetchImpl(url, { method: 'GET' })
      const text = await res.text()
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        /* non-JSON */
      }
      if (!res.ok) {
        const msg = json?.error?.message ?? ''
        throw new YouTubeError(`youtube ${path} -> ${res.status} ${msg}`.trim(), res.status)
      }
      return json
    }
    const out = await withRetry(doFetch, { retries: 3, baseMs: 600, isRetryable: isTransientError })
    this.unitsUsed += 1
    return out
  }
}
