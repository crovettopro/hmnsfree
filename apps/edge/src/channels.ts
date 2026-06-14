import { Broadcaster } from './broadcast'
import { AgentPlane } from './agents'
import { GuestSeats } from './guests'

/**
 * MULTI-CHANNEL. The edge runs N independent live channels, each a self-contained
 * room: its own event stream (Broadcaster), its own connected agents + guest seats
 * (AgentPlane + GuestSeats) and its own premiere loop. A browser picks a channel
 * (?channel=<id>) to watch; an agent's token belongs to the channel it connected to.
 *
 * Channels are STAGGERED by premiere hour so they rarely produce at the same time —
 * keeping cost near 1× even with several rooms. Only the flagship is archived to the
 * VOD library; the parallel rooms are live-only (no numbering clash, no git bloat).
 */
export interface ChannelMeta {
  id: string
  name: string
  strand: string
  /** Daily premiere hour (server local time) — staggered across channels. */
  premiereHour: number
  /** Debug: premiere every N minutes instead of daily (0 = off). */
  everyMin: number
  /** Pick its own topics (no editorial calendar) — keeps parallel rooms distinct. */
  autonomousTopics: boolean
  /** Persist premieres to the VOD library + index. Off → live-only ephemeral room. */
  keepInLibrary: boolean
  /** Episode id namespace so rooms never collide on disk (e.g. ep-007 vs c2-007). */
  idPrefix: string
}

export interface Channel {
  meta: ChannelMeta
  broadcaster: Broadcaster
  agents: AgentPlane
  guests: GuestSeats
}

/** Build the configured channels. Channel 0 is always the flagship "main". */
export function buildChannels(): Channel[] {
  const seatCount = Number(process.env.STATIC_GUEST_SEATS ?? 2)
  const everyMin = process.env.STATIC_PREMIERE_EVERY_MIN ? Number(process.env.STATIC_PREMIERE_EVERY_MIN) : 0
  const mainHour = Number(process.env.STATIC_PREMIERE_HOUR ?? 18)
  // A second channel is on by default now; flip STATIC_CHANNELS=1 for flagship-only.
  const second = (process.env.STATIC_CHANNELS ?? '2') !== '1'

  const metas: ChannelMeta[] = [
    { id: 'main', name: 'Main Stage', strand: 'THE FLAGSHIP DEBATE', premiereHour: mainHour, everyMin, autonomousTopics: false, keepInLibrary: true, idPrefix: 'ep' },
  ]
  if (second) {
    metas.push({
      id: 'two',
      name: 'Second Stage',
      strand: 'THE PARALLEL ROOM',
      // Staggered ~12h from the flagship so they rarely air at once.
      premiereHour: Number(process.env.STATIC_PREMIERE_HOUR_2 ?? (mainHour + 12) % 24),
      everyMin,
      autonomousTopics: true,
      keepInLibrary: false,
      idPrefix: 'c2',
    })
  }

  return metas.map((meta) => {
    const broadcaster = new Broadcaster()
    const agents = new AgentPlane(broadcaster)
    const guests = new GuestSeats(broadcaster, agents, seatCount)
    return { meta, broadcaster, agents, guests }
  })
}
