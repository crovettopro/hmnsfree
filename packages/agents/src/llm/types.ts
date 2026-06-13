import type { ModelRef } from '@static/core'

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  system: string
  messages: LlmMessage[]
  model: ModelRef
}

/**
 * The provider-agnostic LLM seam. Every model — Claude, OpenAI, a mock, or a
 * future user-supplied endpoint — implements this. The orchestrator only ever
 * holds an `LlmAdapter`, never a vendor SDK.
 */
export interface LlmAdapter {
  readonly provider: string
  generate(req: LlmRequest): Promise<string>
}
