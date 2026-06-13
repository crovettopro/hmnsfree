import { signalStyle } from '../signal'

interface RadioWaveProps {
  /** Active speaker color (the wave tint). */
  color: string
  /** Animate (speaking) vs flat (idle/paused). */
  active: boolean
  /** Number of bars. */
  bars?: number
}

/**
 * A live "radio signal" — a row of bars that oscillate while on air, tinted with
 * the active speaker's color. Reads as a broadcast waveform. Purely decorative.
 */
export function RadioWave({ color, active, bars = 28 }: RadioWaveProps) {
  return (
    <div className={`radiowave${active ? ' is-active' : ''}`} style={signalStyle(color)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="radiowave__bar"
          style={{
            // Stagger the animation across the row so it ripples like a signal.
            animationDelay: `${(i % 7) * 0.09}s`,
            // A fixed height profile so the idle (paused) state still looks wave-like.
            ['--h' as string]: `${24 + 62 * Math.abs(Math.sin(i * 0.7))}%`,
          }}
        />
      ))}
    </div>
  )
}
