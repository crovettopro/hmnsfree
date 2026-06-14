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
 *
 * TWO PROGRAMMED STRANDS (both driven by the editorial calendar — see schedule.ts):
 *   • MAIN STAGE   — 4:00 PM ET — THE DEBATE     (heavyweight, adversarial)
 *   • AFTER HOURS  — 8:00 PM ET — THE LATE-NIGHT  (lighter, funnier, evening talk)
 * Each premieres once a day at its hour; the loop runs them automatically — nobody
 * has to press a button.
 */
export interface ChannelMeta {
  id: 'main' | 'two'
  name: string
  strand: string
  /** Daily premiere hour, EASTERN TIME (America/New_York) — staggered across channels. */
  premiereHour: number
  /** Debug: premiere every N minutes instead of daily (0 = off). */
  everyMin: number
  /** Pick its own topics (no editorial calendar) — only as a fallback now. */
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
  // Premiere hours are EASTERN TIME. Main = 4pm ET (16); After Hours = 8pm ET (20).
  const mainHour = Number(process.env.STATIC_PREMIERE_HOUR ?? 16)
  // A second channel is on by default now; flip STATIC_CHANNELS=1 for flagship-only.
  const second = (process.env.STATIC_CHANNELS ?? '2') !== '1'

  const metas: ChannelMeta[] = [
    // MAIN STAGE — the daily DEBATE at 4pm ET. Programmed from the editorial calendar.
    { id: 'main', name: 'Main Stage', strand: 'THE DEBATE · 4PM ET', premiereHour: mainHour, everyMin, autonomousTopics: false, keepInLibrary: true, idPrefix: 'ep' },
  ]
  if (second) {
    metas.push({
      // AFTER HOURS — the daily late-night TALK at 8pm ET. Also programmed (its own
      // strand in the calendar); falls back to autonomous only on unprogrammed dates.
      id: 'two',
      name: 'After Hours',
      strand: 'THE LATE-NIGHT · 8PM ET',
      premiereHour: Number(process.env.STATIC_PREMIERE_HOUR_2 ?? 20),
      everyMin,
      autonomousTopics: false,
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
