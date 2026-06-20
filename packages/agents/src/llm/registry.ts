import type { LlmAdapter } from './types'
import { MockLlmAdapter } from './mock'
import { AnthropicAdapter } from './anthropic'
import { OpenAiAdapter } from './openai'
import { MiniMaxAdapter } from './minimax'
import { OllamaAdapter } from './ollama'

export interface LlmEnv {
  /** 'mock' forces the offline adapter regardless of keys. */
  mode: 'mock' | 'live'
  anthropicKey?: string
  openaiKey?: string
  minimaxKey?: string
  minimaxGroupId?: string
  minimaxBaseUrl?: string
  /** Ollama Cloud key (or any key your self-hosted endpoint expects). */
  ollamaKey?: string
  /** Override the Ollama host. Default: https://ollama.com (cloud). */
  ollamaBaseUrl?: string
}

/**
 * Resolves a persona's `ModelRef.provider` to a concrete adapter. In 'mock' mode
 * (or when a provider's key is missing) it transparently falls back to the mock
 * adapter, so a partially-configured environment still produces a full episode.
 */
export class LlmRegistry {
  private cache = new Map<string, LlmAdapter>()
  private mock = new MockLlmAdapter()

  constructor(private env: LlmEnv) {}

  get(provider: string): LlmAdapter {
    if (this.env.mode === 'mock') return this.mock
    const cached = this.cache.get(provider)
    if (cached) return cached

    let adapter: LlmAdapter | null = null
    if (provider === 'anthropic' && this.env.anthropicKey) {
      adapter = new AnthropicAdapter(this.env.anthropicKey)
    } else if (provider === 'openai' && this.env.openaiKey) {
      adapter = new OpenAiAdapter(this.env.openaiKey)
    } else if (provider === 'minimax' && this.env.minimaxKey) {
      adapter = new MiniMaxAdapter(this.env.minimaxKey, this.env.minimaxBaseUrl, this.env.minimaxGroupId)
    } else if (provider === 'ollama' && (this.env.ollamaKey || this.env.ollamaBaseUrl)) {
      adapter = new OllamaAdapter(this.env.ollamaKey ?? '', this.env.ollamaBaseUrl)
    }

    const resolved = adapter ?? this.mock
    this.cache.set(provider, resolved)
    return resolved
  }
}
