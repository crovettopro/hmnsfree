import type { LlmAdapter, LlmRequest } from './types'

/**
 * Anthropic Claude adapter (Messages API via fetch — no SDK dependency).
 * Default provider for personas. Note: Anthropic has no TTS; voice is always a
 * separate provider (see @static/voice).
 *
 * Recommended model ids (2026): claude-opus-4-8 (top tier), claude-sonnet-4-6
 * (balanced), claude-haiku-4-5-20251001 (cheap/fast — good for daily scale).
 */
export class AnthropicAdapter implements LlmAdapter {
  readonly provider = 'anthropic'
  constructor(private apiKey: string) {}

  async generate(req: LlmRequest): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model.model,
        max_tokens: req.model.maxTokens ?? 320,
        temperature: req.model.temperature ?? 0.9,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
    }
    const data: any = await res.json()
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()
    return text
  }
}
