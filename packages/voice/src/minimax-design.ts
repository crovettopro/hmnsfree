/**
 * MiniMax Voice Design: generate a brand-new synthetic voice from a text
 * description (no cloning of any real person). Returns a reusable voice_id plus a
 * preview clip. The voice_id then works directly in T2A (see MiniMaxVoiceProvider).
 *
 * This is how STATIC gets ownable, deliberately-AI voices.
 */
export interface DesignResult {
  voiceId: string
  /** Preview audio (mp3 bytes). */
  audio: Buffer
}

export async function designMiniMaxVoice(opts: {
  apiKey: string
  baseUrl?: string
  groupId?: string
  /** Natural-language description of the voice (the "design prompt"). */
  prompt: string
  /** Sample text spoken in the preview (~100+ chars works well). */
  previewText: string
}): Promise<DesignResult> {
  const base = opts.baseUrl ?? 'https://api.minimaxi.chat'
  const qs = opts.groupId ? `?GroupId=${encodeURIComponent(opts.groupId)}` : ''
  const res = await fetch(`${base}/v1/voice_design${qs}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: opts.prompt, preview_text: opts.previewText }),
  })
  if (!res.ok) throw new Error(`MiniMax voice_design ${res.status}: ${await res.text()}`)
  const data: any = await res.json()
  if (data.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(`MiniMax voice_design ${data.base_resp.status_code}: ${data.base_resp.status_msg}`)
  }
  const voiceId: string = data.voice_id
  const hex: string = data.trial_audio ?? ''
  if (!voiceId) throw new Error('MiniMax voice_design returned no voice_id')
  return { voiceId, audio: Buffer.from(hex, 'hex') }
}
