import { createServer } from 'node:http'
import { Broadcaster } from './broadcast'
import { runChannel } from './channel'
import { serveEpisodes } from './static'

/**
 * STATIC live edge. A tiny HTTP server with ONE meaningful endpoint — an SSE
 * stream of the live debate — plus the always-on channel that produces episodes
 * and broadcasts them. The web subscribes; it can only ever read.
 */
// Hosts (Railway/Render/Fly) inject PORT; fall back to our own var, then default.
const PORT = Number(process.env.PORT ?? process.env.STATIC_EDGE_PORT ?? 8787)

const broadcaster = new Broadcaster()

const server = createServer((req, res) => {
  const url = req.url ?? '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    return res.end()
  }
  if (url.startsWith('/live')) {
    return broadcaster.addClient(res)
  }
  if (url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    return res.end(JSON.stringify({ ok: true, listeners: broadcaster.listenerCount }))
  }
  if (url.startsWith('/episodes/')) {
    void serveEpisodes(url, res)
    return
  }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`STATIC edge listening on http://localhost:${PORT}  (SSE: /live)`)
})

// Start the channel. Length defaults are short so the local sim is watchable.
runChannel({
  broadcaster,
  intermissionSec: Number(process.env.STATIC_EDGE_INTERMISSION ?? 8),
  minTurns: process.env.STATIC_EDGE_MIN ? Number(process.env.STATIC_EDGE_MIN) : 6,
  maxTurns: process.env.STATIC_EDGE_MAX ? Number(process.env.STATIC_EDGE_MAX) : 10,
}).catch((err) => {
  console.error('channel crashed:', err)
  process.exit(1)
})
