import { describe, expect, it } from 'vitest'
import { GLASS_DEPTH_MAX, GLASS_MID } from '../core/constants'
import { SWITCH_MS, flatOf, glassAt, kindOf, sameGlass, switchOn, traceOf } from './glass'

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
  it('is the mean colour of the lamps, whatever their brightness', () => {
    const lamps = [
      { r: 255, g: 246, b: 226, gain: 0.93 },
      { r: 255, g: 246, b: 226, gain: 1 },
      { r: 255, g: 246, b: 226, gain: 1.07 },
    ]
    expect(flatOf(lamps)).toEqual([255, 246, 226])
    expect(flatOf([])).toEqual([0, 0, 0])
  })
})

describe('traceOf', () => {
  it('lets part of the glass through in Paint and all of it in Light', () => {
    expect(traceOf(0)).toBeGreaterThan(0)
    expect(traceOf(0)).toBeLessThan(1)
    expect(traceOf(1)).toBe(1)
    expect(traceOf(0.5)).toBeGreaterThan(traceOf(0))
    expect(traceOf(-3)).toBe(traceOf(0))
    expect(traceOf(3)).toBe(1)
  })
})

describe('glassAt', () => {
  it('opens halfway on the glass as chosen', () => {
    expect(glassAt(0.5)).toEqual(GLASS_MID)
  })

  it('runs from flat glass in a glow to deep glass without one', () => {
    expect(glassAt(0).depth).toBe(0)
    expect(glassAt(0).glow).toBeCloseTo(GLASS_MID.glow * 2)
    expect(glassAt(1).depth).toBe(GLASS_DEPTH_MAX)
    expect(glassAt(1).glow).toBe(0)
    expect(glassAt(0.25).depth).toBeLessThan(glassAt(0.75).depth)
    expect(glassAt(0.25).glow).toBeGreaterThan(glassAt(0.75).glow)
  })

  it('holds the dial to its ends', () => {
    expect(glassAt(-2)).toEqual(glassAt(0))
    expect(glassAt(9)).toEqual(glassAt(1))
    expect(glassAt(Number.NaN)).toEqual(GLASS_MID)
  })

  it('compares every part', () => {
    expect(sameGlass(GLASS_MID, { ...GLASS_MID })).toBe(true)
    expect(sameGlass(GLASS_MID, { ...GLASS_MID, glow: 0 })).toBe(false)
  })
})
