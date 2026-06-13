import { withRetry, isRateLimitError } from '@static/core'
import type { LlmAdapter, LlmRequest } from './types'

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
        })
        if (!res.ok) {
          throw new Error(`MiniMax ${res.status}: ${await res.text()}`)
        }
        const data: any = await res.json()
        // MiniMax surfaces API-level failures in base_resp even on HTTP 200.
        if (data.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
          throw new Error(`MiniMax ${data.base_resp.status_code}: ${data.base_resp.status_msg}`)
        }
        const text = data.choices?.[0]?.message?.content ?? data.reply ?? ''
        return String(text).trim()
      },
      {
        isRetryable: isRateLimitError,
        onRetry: (a, ms) => console.warn(`  ⏳ MiniMax rate-limited; retry ${a} in ${ms}ms`),
      },
    )
  }
}
