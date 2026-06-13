import { withRetry, isTransientError } from '@static/core'
import type { LlmAdapter, LlmRequest } from './types'

// Read via globalThis so this package needn't pull in node's `process` typings.
const LLM_TIMEOUT_MS = Number(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.STATIC_LLM_TIMEOUT_MS ??
    45_000,
)

/**
 * MiniMax adapter (chatcompletion_v2, OpenAI-compatible shape, via fetch).
 * The LLM provider we're starting with. Behind the same LlmAdapter seam, so
 * personas can later mix MiniMax with Claude/OpenAI/user models with no other
 * change.
 *
 * Base URL is configurable because MiniMax has regional hosts:
 *   - International: https://api.minimaxi.chat   (default)
 *   - Mainland CN:   https://api.minimax.chat
 * A GroupId is optional (only some setups require it) and appended as a query
 * param when provided.
 */
export class MiniMaxAdapter implements LlmAdapter {
  readonly provider = 'minimax'
  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.minimaxi.chat',
    private groupId?: string,
  ) {}

  async generate(req: LlmRequest): Promise<string> {
    const qs = this.groupId ? `?GroupId=${encodeURIComponent(this.groupId)}` : ''
    return withRetry(
      async () => {
        // Bound every call: a hung MiniMax connection must not freeze the whole
        // episode. On timeout the fetch aborts → a retryable error.
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(new Error('MiniMax LLM timeout')), LLM_TIMEOUT_MS)
        try {
          const res = await fetch(`${this.baseUrl}/v1/text/chatcompletion_v2${qs}`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: req.model.model,
              max_tokens: req.model.maxTokens ?? 320,
              temperature: req.model.temperature ?? 0.9,
              messages: [{ role: 'system', content: req.system }, ...req.messages],
            }),
            signal: ac.signal,
          })
          if (!res.ok) {
            throw new Error(`MiniMax ${res.status}: ${await res.text()}`)
          }
          const data: any = await res.json()
          // MiniMax surfaces API-level failures in base_resp even on HTTP 200.
          if (data.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
            throw new Error(`MiniMax ${data.base_resp.status_code}: ${data.base_resp.status_msg}`)
          }
          const text = String(data.choices?.[0]?.message?.content ?? data.reply ?? '').trim()
          // An empty generation would become a silent, broken turn — retry it.
          if (!text) throw new Error('MiniMax empty content')
          return text
        } finally {
          clearTimeout(timer)
        }
      },
      {
        retries: 5,
        isRetryable: isTransientError,
        onRetry: (a, ms, err) =>
          console.warn(`  ⏳ MiniMax retry ${a} in ${ms}ms — ${err instanceof Error ? err.message.slice(0, 80) : ''}`),
      },
    )
  }
}
