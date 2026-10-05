import { describe, expect, it } from 'vitest'
import { AU_KM, LIGHT_KM_S } from '../sky/bodies'
import { covered, distanceLabel, lightLabel, sizeLabel } from './instrument'
import { TOP, clampRung, clockLabel, dayLabel, minuteLabel, rateName, rateOf } from './time'

describe('the clock', () => {
  it('climbs from real time to a year a second, and runs back the same way', () => {
    expect(rateOf(0)).toBe(1)
    expect(rateOf(TOP)).toBe(365.2425 * 86_400)
    expect(rateOf(-1)).toBe(-60)
    expect(rateOf(TOP + 3)).toBe(rateOf(TOP))
    expect(clampRung(-99)).toBe(-TOP)
    for (let r = 1; r <= TOP; r++) expect(rateOf(r)).toBeGreaterThan(rateOf(r - 1))
    expect(rateName(0)).toBe('Real time')
    expect(rateName(-5)).toBe(rateName(5))
  })

  it('reads in UTC', () => {
    const ms = Date.UTC(2026, 9, 5, 8, 4, 9)
    expect(dayLabel(ms)).toBe('5 Oct 2026')
    expect(clockLabel(ms)).toBe('08:04:09')
    expect(minuteLabel(ms)).toBe('08:04')
  })
})

describe('the readout', () => {
  it('gives distances in km, millions of km, then AU', () => {
    expect(distanceLabel(384_400)).toBe('384,400 km')
    expect(distanceLabel(1.5e6)).toBe('1.50M km')
    expect(distanceLabel(AU_KM)).toBe('1.000 AU')
    expect(distanceLabel(30.07 * AU_KM)).toBe('30.1 AU')
  })

  it('gives light time', () => {
    expect(lightLabel(384_400)).toBe('1.28 s')
    expect(lightLabel(AU_KM)).toBe('8 min 19 s')
    expect(lightLabel(30 * AU_KM)).toBe('4 h 10 min')
    // Rounding carries into the next unit rather than reading 60.
    expect(lightLabel(539.6 * LIGHT_KM_S)).toBe('9 min 0 s')
    expect(lightLabel(14_370 * LIGHT_KM_S)).toBe('4 h 0 min')
  })

  it('gives apparent size in degrees, arcminutes or arcseconds', () => {
    const deg = Math.PI / 180
    expect(sizeLabel(2 * deg)).toBe('2.00°')
    expect(sizeLabel(0.52 * deg)).toBe('31.2′')
    expect(sizeLabel((33.6 / 3600) * deg)).toBe('33.6″')
  })
})

describe('one disc over another', () => {
  it('covers none, all, or a ring of it', () => {
    expect(covered(1, 1, 2.5)).toBe(0)
    expect(covered(1, 1.05, 0.02)).toBe(1)
    expect(covered(1, 0.9, 0)).toBeCloseTo(0.81, 6)
  })

  it('covers the lens where they overlap', () => {
    // Two equal discs a radius apart overlap by 2 pi / 3 - sqrt(3) / 2 of pi.
    expect(covered(1, 1, 1)).toBeCloseTo((2 * Math.PI) / 3 / Math.PI - Math.sqrt(3) / 2 / Math.PI, 6)
    expect(covered(1, 1, 1.999)).toBeLessThan(0.001)
  })
})
