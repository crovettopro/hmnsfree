/** mm:ss formatter shared by the player and studio logs. */
export function fmtTime(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m + ':' + (s < 10 ? '0' : '') + s
}

/** "1.0×" / "1.25×" rate label. */
export function fmtRate(rate: number): string {
  return rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + '×'
}
