import { describe, expect, it } from 'vitest'
import { AU_KM, LIGHT_KM_S } from '../sky/bodies'
import { covered, distanceLabel, lightLabel, sizeLabel } from './instrument'
import { TAPE_S, Tape } from './tape'
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

describe('the tape', () => {
  const HOUR = 3_600_000

  /** Plays for `s` seconds at 60 frames a second, the clock moving `rate` ms each second. */
  function play(tape: Tape, from: number, s: number, rate: number): number {
    let ms = from
    for (let i = 0; i < s * 60; i++) {
      ms += rate / 60
      tape.record(1 / 60, ms)
    }
    tape.seal(ms)
    return ms
  }

  it('finds a moment that has gone by', () => {
    const tape = new Tape()
    tape.jump(0)
    const end = play(tape, 0, 10, HOUR)
    expect(tape.at(0)).toBe(0)
    expect(tape.at(1)).toBe(end)
    expect(tape.at(0.5)).toBeCloseTo(end / 2, 3)
  })

  it('holds two minutes of watching, whatever the speed', () => {
    const tape = new Tape()
    tape.jump(0)
    const half = play(tape, 0, TAPE_S / 2, 1000)
    expect(tape.filled).toBeCloseTo(0.5, 2)
    const end = play(tape, half, TAPE_S, 1000)
    expect(tape.filled).toBe(1)
    expect(end - tape.at(0)).toBeCloseTo(TAPE_S * 1000, -2)
  })

  it('plays on from a scrubbed moment, forgetting what came after', () => {
    const tape = new Tape()
    tape.jump(0)
    play(tape, 0, 10, HOUR)
    const ms = tape.at(0.25)
    tape.cut(0.25)
    expect(tape.at(0)).toBe(0)
    expect(tape.at(1)).toBe(ms)
    expect(tape.filled).toBeLessThan(0.03)
  })

  it('keeps a jump a jump, with no years in between', () => {
    const tape = new Tape()
    tape.jump(0)
    const a = play(tape, 0, 1, HOUR)
    tape.jump(1e12)
    play(tape, 1e12, 1, HOUR)
    for (let p = 0; p <= 1; p += 0.005) {
      const ms = tape.at(p)
      expect(ms <= a || ms >= 1e12).toBe(true)
    }
  })

  it('marks the eclipse peaks it runs through, either way', () => {
    const tape = new Tape()
    const peak = 5.5 * HOUR
    tape.know(peak)
    tape.jump(0)
    const end = play(tape, 0, 10, HOUR)
    expect(tape.markings).toHaveLength(1)
    expect(tape.at(tape.markings[0])).toBeCloseTo(peak, 3)
    play(tape, end, 10, -HOUR)
    expect(tape.markings).toHaveLength(2)
    for (const m of tape.markings) expect(tape.at(m)).toBeCloseTo(peak, 3)
    // Cut before the peak, the marks after it go too.
    tape.cut(0.2)
    expect(tape.markings).toHaveLength(0)
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
