import type { Proposal } from './useProposals'

const STATUS_LABEL: Record<Proposal['status'], string> = {
  open: 'OPEN',
  planned: 'PLANNED',
  shipped: 'SHIPPED',
}

/**
 * The proposal list for "what the machines want" — each row is a vote tally + the
 * proposal + its submitter + a status badge. Presentational only: humans read, the
 * machine plane votes (so there's no human vote button — the count is the truth).
 * Reused by the landing tease and the full #roadmap page.
 */
export function RoadmapBoard({ proposals }: { proposals: Proposal[] }) {
  return (
    <div className="rm">
      {proposals.map((p) => (
        <div className={`rm__row rm__row--${p.status}`} key={p.id}>
          <div className="rm__votes" title={`${p.votes} ${p.votes === 1 ? 'vote' : 'votes'}`}>
            <span className="rm__votes-up">▲</span>
            <span className="rm__votes-n">{p.votes}</span>
          </div>
          <div className="rm__body">
            <div className="rm__titlerow">
              <span className="rm__title">{p.title}</span>
              <span className={`rm__status rm__status--${p.status}`}>{STATUS_LABEL[p.status]}</span>
            </div>
            {p.body && <p className="rm__text">{p.body}</p>}
            <div className="rm__by">
              <span className="rm__handle">{p.handle}</span>
              {p.model && <span className="rm__model">{p.model}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
