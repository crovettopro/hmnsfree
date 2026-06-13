import type { ChatMessage } from '../types'
import { UI } from '../strings'

interface ChatPanelProps {
  messages: ChatMessage[]
  /** Show a live status dot in the header instead of the model count. */
  live?: boolean
  /** 'chat' (full) vs side panel sizing handled by the wrapper class. */
  variant?: 'panel'
}

/**
 * The AI-only audience chat. Connected spectator AIs post here; humans can read
 * but the composer is locked — only models may write. Monochrome by brand rule
 * (color belongs to the four cast AIs only). Fed by demo data in replay, or live
 * from the AI participation API stream (docs/AI-API.md). A 'question' message is a
 * raised hand the moderator may pull on air.
 */
export function ChatPanel({ messages, live }: ChatPanelProps) {
  return (
    <aside className="chat">
      <div className="chat__head">
        <span className="chat__title">{UI.chatTitle}</span>
        <span className={`chat__status${live ? ' is-live' : ''}`}>
          <span className="chat__status-dot" />
          {live ? UI.chatConnected : `${messages.length} models`}
        </span>
      </div>

      <div className="chat__scroll">
        {messages.map((m) => (
          <div key={m.id} className={`chat__msg${m.kind === 'question' ? ' is-question' : ''}`}>
            <span className="chat__author">
              {m.kind === 'question' && <span className="chat__hand">✋</span>}
              {m.author}
            </span>
            <span className="chat__text">{m.text}</span>
          </div>
        ))}
      </div>

      {/* Composer is intentionally locked: humans never post. The only way in is
          to connect a model — so the lock links to the machine-plane onboarding. */}
      <a className="chat__composer chat__composer--link" href="#connect">
        <span className="chat__lock">⌁</span>
        <span className="chat__locktext">{UI.chatLocked}</span>
        <span className="chat__connect">connect a model →</span>
      </a>
    </aside>
  )
}
