import { useEffect, useMemo, useState } from 'react'
import type { Episode, Participant } from './types'
import { loadProducedEpisodes } from './data/loadProduced'
import { usePlayer } from './playback/usePlayer'
import type { AudioEngine } from './playback/audio/AudioEngine'
import { CompositeEngine } from './playback/audio/CompositeEngine'
import { Header, type View, type Mode } from './components/Header'
import { Stage } from './components/Stage'
import { TranscriptPanel } from './components/TranscriptPanel'
import { ChatPanel } from './components/ChatPanel'
import { Footer } from './components/Footer'
import { EpisodeBrowser } from './components/EpisodeBrowser'
import { AiInfoCard } from './components/AiInfoCard'
import { LiveView } from './components/LiveView'
import { BackOffice } from './admin/BackOffice'
import { ConnectPage } from './connect/ConnectPage'

/** Reactively tracks whether the URL hash requests the back office (#admin). */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

/** Shown only in the header until the first episode loads (never in the list). */
const PLACEHOLDER: Episode = {
  id: '', number: 'STATIC', tag: '', topic: '', listeners: '—',
  cast: [], turns: [], status: 'published',
}
import { DEMO_AUDIENCE } from './data/audience'

/**
 * The product surface: the live debate player. Owns the episode library
 * (hand-authored seeds + episodes produced by the studio pipeline), the chosen
 * view, and the audio engine. Everything else flows from usePlayer.
 *
 * The audio engine is injected once. CompositeEngine plays a real audio clip when
 * a turn carries one (produced episodes) and falls back to on-device TTS
 * otherwise — swap it for a live-stream engine later and nothing downstream
 * changes.
 */
export function App() {
  // The library is the studio/edge-produced episodes (loaded at runtime). No
  // hand-authored seeds — only real, voiced episodes ship.
  const [episodes, setEpisodes] = useState<Episode[]>([])
  // A share link (/s/<id>.html → /?ep=<id>) deep-links straight to an episode.
  const [episodeId, setEpisodeId] = useState(() => new URLSearchParams(window.location.search).get('ep') ?? '')
  const [view, setView] = useState<View>('full')
  const [mode, setMode] = useState<Mode>('replay')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [selectedAi, setSelectedAi] = useState<Participant | null>(null)
  const hash = useHashRoute()

  // Pull in produced episodes; select the first once they arrive.
  useEffect(() => {
    let alive = true
    loadProducedEpisodes().then((produced) => {
      if (!alive || !produced.length) return
      setEpisodes((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...produced.filter((e) => !seen.has(e.id))]
      })
      setEpisodeId((cur) => cur || produced[0].id)
    })
    return () => {
      alive = false
    }
  }, [])

  const loading = episodes.length === 0
  const episode = useMemo(
    () => episodes.find((e) => e.id === episodeId) ?? episodes[0] ?? PLACEHOLDER,
    [episodes, episodeId],
  )

  const engine = useMemo<AudioEngine>(() => new CompositeEngine(), [])
  const player = usePlayer(loading ? undefined : episode, engine)

  // Routing. The LANDING (connect guide, moltbook-style) is the front door; you
  // enter the podcast from there. The show lives at #listen; a ?ep=<id> deep-link
  // (share pages) opens the player straight to that episode. An explicit hash
  // always wins over the deep-link so in-app "connect" links work everywhere.
  if (hash === '#admin') return <BackOffice />
  if (hash === '#connect') return <ConnectPage />
  if (hash !== '#listen' && !new URLSearchParams(window.location.search).has('ep')) return <ConnectPage />

  return (
    <div className="app">
      <div className="ambient-vignette" aria-hidden />
      <div className="ambient-grid" aria-hidden />

      <Header
        episode={episode}
        view={view}
        onView={setView}
        mode={mode}
        onMode={setMode}
        onOpenBrowser={() => setBrowserOpen(true)}
      />

      {browserOpen && mode === 'replay' && (
        <EpisodeBrowser
          episodes={episodes}
          currentId={episodeId}
          onSelect={setEpisodeId}
          onClose={() => setBrowserOpen(false)}
        />
      )}

      {mode === 'live' ? (
        <LiveView view={view} onSelectAi={setSelectedAi} />
      ) : loading ? (
        <main className="main main--live-empty">
          <div className="live-empty">
            <span className="live-empty__dot" />
            Loading episodes…
          </div>
        </main>
      ) : (
        <main className="main">
          {/* The AIs (stage) show in every mode. */}
          <Stage
            episode={episode}
            activeSpeaker={player.activeSpeaker}
            playing={player.playing}
            view={view}
            onSelectAi={setSelectedAi}
          />

          {/* Side panel: Chat (Full) · nothing (No Chat) · Transcript (Transcript). */}
          {view === 'full' && <ChatPanel messages={DEMO_AUDIENCE} />}
          {view === 'transcript' && (
            <TranscriptPanel
              episode={episode}
              turnStarts={player.turnStarts}
              cursor={player.cursor}
              started={player.started}
              playing={player.playing}
              activeSpeaker={player.activeSpeaker}
              elapsed={player.elapsed}
              onSeek={player.seekMs}
            />
          )}
        </main>
      )}

      {selectedAi && (
        <AiInfoCard participant={selectedAi} episode={episode} onClose={() => setSelectedAi(null)} />
      )}

      {mode === 'replay' && !loading && (
      <Footer
        episode={episode}
        elapsed={player.elapsed}
        total={player.total}
        progress={player.progress}
        playing={player.playing}
        rate={player.rate}
        activeSpeaker={player.activeSpeaker}
        onSeekFraction={player.seekFraction}
        onToggle={player.toggle}
        onStepBack={player.stepBack}
        onStepForward={player.stepForward}
        onCycleRate={player.cycleRate}
      />
      )}
    </div>
  )
}
