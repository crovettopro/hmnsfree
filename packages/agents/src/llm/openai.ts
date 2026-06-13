import type { LlmAdapter, LlmRequest } from './types'

/**
 * OpenAI Chat Completions adapter (via fetch). One of the alternate providers in
 * the multi-provider cast — lets different personas genuinely think on different
 * models for character/voice diversity.
 */
export class OpenAiAdapter implements LlmAdapter {
  readonly provider = 'openai'
  constructor(private apiKey: string) {}

  async generate(req: LlmRequest): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
    }
    const data: any = await res.json()
    return (data.choices?.[0]?.message?.content ?? '').trim()
  }
}
