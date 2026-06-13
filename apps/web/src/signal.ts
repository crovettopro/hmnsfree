import type { CSSProperties } from 'react'

/**
 * Helper to set the per-element `--signal` custom property (the AI's color)
 * alongside any other inline styles, with correct typing for the custom prop.
 */
export function signalStyle(color: string, extra?: CSSProperties): CSSProperties {
  return { ['--signal' as string]: color, ...extra } as CSSProperties
}
