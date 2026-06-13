import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'
import type { LlmEnv } from '@static/agents'
import type { VoiceEnv } from '@static/voice'

// Load the monorepo-root .env regardless of which package cwd the script runs in.
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

export interface StudioEnv {
  mode: 'mock' | 'live'
  llm: LlmEnv
  voice: VoiceEnv
}

/**
 * Resolve runtime config from the environment. Mode is 'live' only when
 * explicitly requested AND at least one provider key is present; otherwise we
 * stay in 'mock' so a fresh checkout produces an episode with no setup.
 */
export function loadEnv(): StudioEnv {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || undefined
  const openaiKey = process.env.OPENAI_API_KEY || undefined
  const minimaxKey = process.env.MINIMAX_API_KEY || undefined
  const minimaxGroupId = process.env.MINIMAX_GROUP_ID || undefined
  const minimaxBaseUrl = process.env.MINIMAX_BASE_URL || undefined
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY || undefined

  const wantsLive = (process.env.STATIC_MODE || 'mock').toLowerCase() === 'live'
  const hasAnyKey = !!(anthropicKey || openaiKey || minimaxKey || elevenLabsKey)
  const mode: 'mock' | 'live' = wantsLive && hasAnyKey ? 'live' : 'mock'

  // Synthetic-signature intensity. Default 1; set STATIC_ROBOTIZE=0 to disable.
  const robotize = process.env.STATIC_ROBOTIZE != null ? Number(process.env.STATIC_ROBOTIZE) : 1

  return {
    mode,
    llm: { mode, anthropicKey, openaiKey, minimaxKey, minimaxGroupId, minimaxBaseUrl },
    voice: {
      mode,
      elevenLabsKey,
      minimaxKey,
      minimaxBaseUrl,
      minimaxGroupId,
      minimaxTtsModel: process.env.MINIMAX_TTS_MODEL || undefined,
      robotize,
    },
  }
}
