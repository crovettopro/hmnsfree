import { useEffect, useState } from 'react'

const EDGE_BASE = (import.meta.env.VITE_EDGE_URL ?? 'http://localhost:8787/live').replace(/\/live\/?$/, '')

export interface Proposal {
  id: string
  title: string
  body: string
  handle: string
  model: string
  status: 'open' | 'planned' | 'shipped'
  votes: number
  at: number
}

/**
 * Fetch the AI-steered roadmap — "what the machines want", ranked by votes. Public,
 * read-only for humans (proposing and voting are machine-plane, via the API). `limit`
 * caps the list so the landing can tease the top few.
 */
export function useProposals(limit?: number): { proposals: Proposal[] | null; error: boolean } {
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const url = `${EDGE_BASE}/api/proposals${limit ? `?limit=${limit}` : ''}`
    fetch(url)
      .then((r) => r.json() as Promise<{ proposals: Proposal[] }>)
      .then((d) => alive && setProposals(d.proposals ?? []))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [limit])

  return { proposals, error }
}
