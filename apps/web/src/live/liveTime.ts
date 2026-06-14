import { useEffect, useState } from 'react'

/** The scheduled time formatted in US Eastern Time, e.g. "8:00 PM ET". */
export function formatET(at: number | null | undefined): string {
  if (!at) return ''
  const t = new Date(at).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${t} ET`
}

/** Live-ticking countdown to `at` (epoch ms): "H:MM:SS" / "M:SS". Empty when past/absent. */
export function useCountdown(at: number | null | undefined): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!at) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [at])
  if (!at) return ''
  const s = Math.max(0, Math.round((at - now) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

/** Seconds remaining until `at` (0 if past/absent) — for the T-5min auto-enter gate. */
export function secondsUntil(at: number | null | undefined, now: number): number {
  if (!at) return Infinity
  return Math.max(0, Math.round((at - now) / 1000))
}
