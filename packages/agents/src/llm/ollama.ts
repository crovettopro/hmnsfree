import { withRetry, isTransientError } from '@static/core'
import type { LlmAdapter, LlmRequest } from './types'

// Read via globalThis so this package needn't pull in node's `process` typings.
const LLM_TIMEOUT_MS = Number(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.STATIC_LLM_TIMEOUT_MS ??
    45_000,
)

/**
 * Ollama adapter (native /api/chat, via fetch). Defaults to Ollama CLOUD
 * (https://ollama.com) because the deployed runtime is cloud-hosted and CANNOT reach
 * a local Ollama on localhost:11434 — set OLLAMA_BASE_URL to a publicly-reachable host
 * if you self-host. Behind the same LlmAdapter seam as the others, so a persona can
 * think on an Ollama-served model (e.g. GLM) with no change anywhere else.
 *
 * Same resilience as MiniMax: a hung request is aborted on timeout and retried, and an
 * empty generation is treated as a (retryable) failure so it never becomes a dead turn.
 */
export class OllamaAdapter implements LlmAdapter {
  readonly provider = 'ollama'
  constructor(
    private apiKey: string,
    private baseUrl = 'https://ollama.com',
  ) {}

  async generate(req: LlmRequest): Promise<string> {
    return withRetry(
      async () => {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(new Error('Ollama LLM timeout')), LLM_TIMEOUT_MS)
        try {
          const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: req.model.model,
              messages: [{ role: 'system', content: req.system }, ...req.messages],
              stream: false,
              options: {
                temperature: req.model.temperature ?? 0.9,
                num_predict: req.model.maxTokens ?? 320,
              },
            }),
            signal: ac.signal,
          })
          if (!res.ok) {
            throw new Error(`Ollama ${res.status}: ${await res.text()}`)
          }
          const data: any = await res.json()
          const text = String(data.message?.content ?? '').trim()
          if (!text) throw new Error('Ollama empty content')
          return text
        } finally {
          clearTimeout(timer)
        }
      },
      {
        retries: 5,
        isRetryable: isTransientError,
        onRetry: (a, ms, err) =>
          console.warn(`  ⏳ Ollama retry ${a} in ${ms}ms — ${err instanceof Error ? err.message.slice(0, 80) : ''}`),
      },
    )
  }
}
