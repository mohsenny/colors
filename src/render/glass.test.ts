import { describe, expect, it } from 'vitest'
import { SWITCH_MS, flatOf, kindOf, switchOn } from './glass'

describe('switchOn', () => {
  it('starts dark and ends fully on, every tube', () => {
    for (let i = 0; i < 3; i++) {
      expect(switchOn(-1, i)).toBe(0)
      expect(switchOn(SWITCH_MS, i)).toBe(1)
      expect(switchOn(SWITCH_MS * 4, i)).toBe(1)
    }
  })

  it('flashes each tube at most once', () => {
    for (let i = 0; i < 3; i++) {
      let flashes = 0
      let lit = false
      for (let ms = 0; ms <= SWITCH_MS; ms++) {
        const on = switchOn(ms, i) > 0.5
        if (on && !lit) flashes++
        lit = on
      }
      // The blink, then the final switch-on.
      expect(flashes).toBeLessThanOrEqual(2)
    }
  })
})

describe('kindOf', () => {
  it('reads ?glass= and falls back to grid', () => {
    expect(kindOf('')).toBe('grid')
    expect(kindOf('?glass=fluted')).toBe('fluted')
    expect(kindOf('?glass=off')).toBe('off')
    expect(kindOf('?glass=marble')).toBe('grid')
  })
})

describe('flatOf', () => {
  it('is the mean of the lit tubes, clamped to a byte', () => {
    const lamps = [
      { r: 255, g: 240, b: 220, gain: 1 },
      { r: 245, g: 250, b: 255, gain: 1 },
      { r: 255, g: 255, b: 255, gain: 1.07 },
    ]
    expect(flatOf(lamps)).toEqual([255, 254, 249])
    expect(flatOf([])).toEqual([0, 0, 0])
  })
})
