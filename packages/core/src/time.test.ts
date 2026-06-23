import { describe, it, expect } from 'vitest'
import { fmtTime, fmtRate } from './time'

describe('fmtTime', () => {
  it('formats whole minutes and zero-pads seconds', () => {
    expect(fmtTime(0)).toBe('0:00')
    expect(fmtTime(9_000)).toBe('0:09')
    expect(fmtTime(60_000)).toBe('1:00')
    expect(fmtTime(75_000)).toBe('1:15')
    expect(fmtTime(3_661_000)).toBe('61:01')
  })

  it('floors sub-second remainders', () => {
    expect(fmtTime(1_999)).toBe('0:01')
    expect(fmtTime(59_999)).toBe('0:59')
  })
})

describe('fmtRate', () => {
  it('labels a playback rate with one trailing significant decimal', () => {
    expect(fmtRate(1)).toBe('1.0×')
    expect(fmtRate(1.25)).toBe('1.25×')
    expect(fmtRate(1.5)).toBe('1.5×')
    expect(fmtRate(2)).toBe('2.0×')
  })
})
