import { describe, expect, it } from 'vitest'
import { AU_KM, LIGHT_KM_S } from '../sky/bodies'
import { covered, crossesDisc, distanceLabel, lightLabel, luxLabel, sizeLabel } from './instrument'
import { TAPE_S, Tape } from './tape'
import { DEAD, clockLabel, dayLabel, daysIn, dialOf, leadOf, minuteLabel, momentOf, notch, partsOf, rateOf, shiftMonths, speedLabel, speedSaid } from './time'

describe('the clock', () => {
  const YEAR = 365.2425 * 86_400
  const ROUND = [60, 600, 3600, 21_600, 86_400, 604_800, 30.436875 * 86_400, YEAR]

  it('rests on real time in the middle of the knob and climbs either way to a year a second', () => {
    expect(rateOf(0)).toBe(1)
    expect(rateOf(DEAD * 0.9)).toBe(1)
    expect(rateOf(-DEAD * 0.9)).toBe(1)
    expect(rateOf(DEAD)).toBeCloseTo(60, 6)
    expect(rateOf(1) / YEAR).toBeCloseTo(1, 9)
    expect(rateOf(5)).toBe(rateOf(1))
    let last = 1
    for (let d = DEAD; d <= 1; d += 0.01) {
      expect(rateOf(d)).toBeGreaterThan(last)
      expect(rateOf(-d)).toBe(-rateOf(d))
      last = rateOf(d)
    }
  })

  it('steps through the round speeds, each way', () => {
    for (const r of ROUND) expect(rateOf(dialOf(r)) / r).toBeCloseTo(1, 9)
    const want = [...ROUND.map((r) => -r).reverse(), 1, ...ROUND]
    let d = -1
    for (const r of want) {
      expect(rateOf(d) / r).toBeCloseTo(1, 9)
      d = notch(d, 1)
    }
    expect(notch(1, 1)).toBe(1)
    expect(notch(-1, -1)).toBe(-1)
    expect(rateOf(notch(dialOf(5000), -1))).toBeCloseTo(3600, 6)
    expect(rateOf(notch(dialOf(-5000), 1))).toBeCloseTo(-3600, 6)
  })

  it('reads the speed in two figures, signed, and carries into the next unit', () => {
    expect(speedLabel(0)).toBe('Real time')
    expect(speedLabel(dialOf(600))).toBe('+10 min/s')
    expect(speedLabel(dialOf(-2.5 * 3600))).toBe('\u22122.5 hr/s')
    expect(speedLabel(dialOf(3590))).toBe('+1 hr/s')
    expect(speedLabel(dialOf(23.9 * 3600))).toBe('+1 day/s')
    expect(speedLabel(-1)).toBe('\u22121 yr/s')
    expect(speedSaid(0)).toBe('Real time')
    expect(speedSaid(dialOf(-86_400))).toBe('1 day a second, backward')
    expect(speedSaid(dialOf(2.5 * 86_400))).toBe('2.5 days a second')
  })

  it('reads in UTC', () => {
    const ms = Date.UTC(2026, 9, 5, 8, 4, 9)
    expect(dayLabel(ms)).toBe('5 Oct 2026')
    expect(clockLabel(ms)).toBe('08:04:09')
    expect(minuteLabel(ms)).toBe('08:04')
  })

  it('finds its way round the calendar', () => {
    const ms = Date.UTC(2024, 0, 31, 22, 15, 40)
    expect(partsOf(ms)).toEqual({ year: 2024, month: 0, day: 31, hour: 22, minute: 15, second: 40 })
    expect(momentOf(partsOf(ms))).toBe(ms)
    expect(daysIn(2024, 1)).toBe(29)
    expect(daysIn(2100, 1)).toBe(28)
    // The 31st a month on is the last of February, at the same time.
    expect(shiftMonths(ms, 1)).toBe(Date.UTC(2024, 1, 29, 22, 15, 40))
    expect(shiftMonths(ms, -12)).toBe(Date.UTC(2023, 0, 31, 22, 15, 40))
    expect(shiftMonths(ms, 13)).toBe(Date.UTC(2025, 1, 28, 22, 15, 40))
    // Minutes past the hour carry into the next day.
    expect(momentOf({ ...partsOf(ms), hour: 23, minute: 60, second: 0 })).toBe(Date.UTC(2024, 1, 1))
    // 1 October 2026 is a Thursday, three days into a week that starts on Monday.
    expect(leadOf(2026, 9)).toBe(3)
    expect(leadOf(2024, 0)).toBe(0)
    expect(momentOf({ year: 1000, month: 0, day: 1, hour: 0, minute: 0, second: 0 })).toBe(Date.UTC(1000, 0, 1))
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
    tape.know({ type: 'lunar', kind: 'Total', peak })
    tape.jump(0)
    const end = play(tape, 0, 10, HOUR)
    expect(tape.markings).toHaveLength(1)
    expect(tape.at(tape.markings[0].at)).toBeCloseTo(peak, 3)
    expect(tape.markings[0].e.type).toBe('lunar')
    play(tape, end, 10, -HOUR)
    expect(tape.markings).toHaveLength(2)
    for (const m of tape.markings) expect(tape.at(m.at)).toBeCloseTo(peak, 3)
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
    expect(sizeLabel((0.1 / 3600) * deg)).toBe('0.1″')
    // Metis from the Earth, and Adrastea from Pluto.
    expect(sizeLabel((0.0104 / 3600) * deg)).toBe('0.010″')
    expect(sizeLabel((0.00055 / 3600) * deg)).toBe('0.00055″')
  })

  it('gives the noon light in lux to three figures', () => {
    expect(luxLabel(128_000)).toBe('128,000 lux')
    expect(luxLabel(1361.3)).toBe('1,360 lux')
    expect(luxLabel(999.7)).toBe('1,000 lux')
    expect(luxLabel(101.3)).toBe('101 lux')
    expect(luxLabel(12.8)).toBe('12.8 lux')
  })
})

describe('names in the sky', () => {
  // Jupiter's disc, 23 px in radius, at 0, 0, and a moon's name set 9 px right of its dot, 60 px long.
  const jupiter = { x: 0, y: 0, r: 23 }
  const name = (x: number, y: number) => [x + 5, y - 9, x + 69, y + 9]

  it("keeps a moon's name off its planet from the planet's left", () => {
    expect(crossesDisc(name(-60, 0), -60, 0, jupiter)).toBe(true)
    expect(crossesDisc(name(-60, 25), -60, 25, jupiter)).toBe(true)
  })

  it('lets it be from the right, from well above, from far off, and over the planet', () => {
    expect(crossesDisc(name(40, 0), 40, 0, jupiter)).toBe(false)
    expect(crossesDisc(name(-60, 40), -60, 40, jupiter)).toBe(false)
    expect(crossesDisc(name(-100, 0), -100, 0, jupiter)).toBe(false)
    expect(crossesDisc(name(-10, 5), -10, 5, jupiter)).toBe(false)
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
