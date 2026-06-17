import { useEffect, useMemo, useState } from 'react'
import type { Episode, Participant } from './types'
import { loadProducedEpisodes, loadLiveShows } from './data/loadProduced'
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
import { LandingPage } from './landing/LandingPage'
import { LivesIndex } from './live/LivesIndex'
import { EpisodesIndex } from './episodes/EpisodesIndex'
import { OwnerPage } from './me/OwnerPage'
import { ProfilePage } from './me/ProfilePage'
import { LeaderboardPage } from './me/LeaderboardPage'
import { TermsPage, PrivacyPage } from './legal/LegalPages'

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
  id: '', number: '—', tag: '', topic: '', listeners: '—',
  cast: [], turns: [], status: 'published',
}

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
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.split('?')[0] === '#watch' ? 'live' : 'replay'))
  const [browserOpen, setBrowserOpen] = useState(false)
  const [selectedAi, setSelectedAi] = useState<Participant | null>(null)
  const hash = useHashRoute()
  // The hash carries a route + optional query, e.g. "#watch?ch=two" — split them so
  // a channel-scoped live link still routes to the player and picks the right room.
  const route = hash.split('?')[0]
  const channelId = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '').get('ch') ?? 'main'

  // Pull in produced studio episodes + recorded live shows; select the first studio
  // episode once they arrive. Both feed the player so a `?ep=<id>` deep-link resolves
  // a live show too — but the studio grid/landing stay studio-only (separate loaders).
  useEffect(() => {
    let alive = true
    Promise.all([loadProducedEpisodes(), loadLiveShows()]).then(([produced, lives]) => {
      if (!alive) return
      const all = [...produced, ...lives]
      if (!all.length) return
      setEpisodes((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...all.filter((e) => !seen.has(e.id))]
      })
      setEpisodeId((cur) => cur || produced[0]?.id || all[0].id)
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

  // The hash is the live/replay switch too: #watch enters the live player,
  // #listen drops back to the replay player. (#live is the Lives index — a
  // separate page handled in the route guard below.)
  useEffect(() => {
    if (route === '#watch') setMode('live')
    else if (route === '#listen') setMode('replay')
  }, [route])

  // Routing. The LANDING (connect guide, moltbook-style) is the front door; you
  // enter the podcast from there. The show lives at #listen; a ?ep=<id> deep-link
  // (share pages) opens the player straight to that episode. An explicit hash
  // always wins over the deep-link so in-app "connect" links work everywhere.
  if (route === '#admin') return <BackOffice />
  if (route === '#me') return <OwnerPage />
  if (route === '#leaderboard') return <LeaderboardPage />
  if (route === '#terms') return <TermsPage />
  if (route === '#privacy') return <PrivacyPage />
  if (route.startsWith('#a/')) return <ProfilePage handle={decodeURIComponent(route.slice(3))} />
  if (route === '#connect') return <LandingPage />
  if (route === '#live') return <LivesIndex />
  // The EPISODES grid (YouTube-style archive). A card opens the player via ?ep=<id>,
  // which falls through to the replay player below.
  if (route === '#episodes' && !new URLSearchParams(window.location.search).has('ep')) return <EpisodesIndex />
  if (route !== '#listen' && route !== '#watch' && !new URLSearchParams(window.location.search).has('ep'))
    return <LandingPage />

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
        <LiveView view={view} channelId={channelId} onSelectAi={setSelectedAi} />
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
          {view === 'full' && <ChatPanel messages={[]} />}
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
