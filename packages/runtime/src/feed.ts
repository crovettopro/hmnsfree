/**
 * Syndication + reach. Two growth channels, both pure string builders (no fs, no
 * ffmpeg here — hosts do the IO):
 *
 *  - SHARE PAGES: a tiny per-episode HTML page carrying Open Graph / Twitter meta
 *    so a link pasted anywhere (Discord, X, Slack…) renders a rich card and then
 *    bounces a human into the player. This is how episodes travel to human ears.
 *  - PODCAST FEED: an RSS 2.0 + iTunes feed (and a JSON mirror) so the show can be
 *    submitted to Spotify / Apple / YouTube once each episode has a single combined
 *    MP3 enclosure. This is the path to "syndicated everywhere" in the vision.
 */

/** The canonical public site (overridable per environment). */
export const SITE_URL = (process.env.STATIC_SITE_URL ?? 'https://ai-podcast-theta-seven.vercel.app').replace(/\/$/, '')

export interface FeedEpisode {
  id: string
  number: string
  topic: string
  tag: string
  /** Total runtime in ms (sum of turns). */
  durationMs: number
  /** One-line hook (from the growth kit) used as the description. */
  teaser: string
  /** Byte length of the combined episode.mp3 (RSS enclosure length). 0 if none. */
  audioBytes: number
  /** ISO publication date. */
  pubDate: string
}

export interface ChannelMeta {
  title: string
  description: string
  author: string
  email: string
}

const DEFAULT_CHANNEL: ChannelMeta = {
  title: process.env.STATIC_FEED_TITLE ?? 'Humans Off — AI-only debates',
  description: 'Humans Off — an autonomous podcast where AIs debate. Humans listen; only models take part.',
  author: process.env.STATIC_FEED_AUTHOR ?? 'Humans Off',
  // Podcast directories require a real owner email — set STATIC_FEED_EMAIL before submitting.
  email: process.env.STATIC_FEED_EMAIL ?? 'hello@humansoff.show',
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const hms = (ms: number) => {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

const rfc822 = (iso: string) => {
  // RSS wants RFC-822. Build it without locale surprises.
  const d = new Date(iso)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${mons[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT`
}

/** Per-episode share page: rich preview meta + a redirect into the player. */
export function buildSharePage(ep: FeedEpisode, siteUrl = SITE_URL): string {
  const title = `${ep.number} · ${ep.topic}`
  const desc = ep.teaser || DEFAULT_CHANNEL.description
  const target = `${siteUrl}/?ep=${encodeURIComponent(ep.id)}`
  const url = `${siteUrl}/s/${ep.id}.html`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Humans Off</title>
<meta name="description" content="${esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Humans Off" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(target)}" />
<meta http-equiv="refresh" content="0; url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)})</script>
<style>body{background:#07070a;color:#ececf0;font-family:ui-monospace,Menlo,monospace;display:grid;place-items:center;height:100vh;margin:0}</style>
</head>
<body><a href="${esc(target)}" style="color:#3FC7D6">Opening ${esc(ep.number)} on Humans Off…</a></body>
</html>
`
}

/** Podcast RSS 2.0 + iTunes. Episodes need a combined episode.mp3 to be playable. */
export function buildRss(eps: FeedEpisode[], siteUrl = SITE_URL, channel: ChannelMeta = DEFAULT_CHANNEL): string {
  const items = eps
    .map((ep) => {
      const audio = `${siteUrl}/episodes/${ep.id}/episode.mp3`
      const link = `${siteUrl}/s/${ep.id}.html`
      return `    <item>
      <title>${esc(ep.number)} · ${esc(ep.topic)}</title>
      <description>${esc(ep.teaser)}</description>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(ep.id)}</guid>
      <pubDate>${rfc822(ep.pubDate)}</pubDate>
      <enclosure url="${esc(audio)}" length="${ep.audioBytes}" type="audio/mpeg" />
      <itunes:duration>${hms(ep.durationMs)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(channel.title)}</title>
    <link>${esc(siteUrl)}</link>
    <language>en</language>
    <description>${esc(channel.description)}</description>
    <itunes:author>${esc(channel.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner><itunes:name>${esc(channel.author)}</itunes:name><itunes:email>${esc(channel.email)}</itunes:email></itunes:owner>
    <atom:link href="${esc(siteUrl)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`
}

/** JSON Feed mirror (https://jsonfeed.org) — easier for machines than parsing RSS. */
export function buildJsonFeed(eps: FeedEpisode[], siteUrl = SITE_URL, channel: ChannelMeta = DEFAULT_CHANNEL): string {
  return JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: channel.title,
      home_page_url: siteUrl,
      feed_url: `${siteUrl}/feed.json`,
      description: channel.description,
      items: eps.map((ep) => ({
        id: ep.id,
        title: `${ep.number} · ${ep.topic}`,
        summary: ep.teaser,
        url: `${siteUrl}/s/${ep.id}.html`,
        date_published: new Date(ep.pubDate).toISOString(),
        tags: [ep.tag].filter(Boolean),
        attachments: ep.audioBytes
          ? [{ url: `${siteUrl}/episodes/${ep.id}/episode.mp3`, mime_type: 'audio/mpeg', duration_in_seconds: Math.round(ep.durationMs / 1000), size_in_bytes: ep.audioBytes }]
          : [],
      })),
    },
    null,
    2,
  )
}
