import { describe, expect, it } from 'vitest'
import { AU_KM, BODIES } from './bodies'
import type { BodyId } from './bodies'
import { nearEclipse, nextEclipse, previousEclipse, stepTo, stepsFrom } from './eclipses'
import type { Eclipse, EclipseType } from './eclipses'
import { TIME_MAX, TIME_MIN, posesAt } from './ephemeris'
import type { Vec3 } from './ephemeris'

function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Longitude and latitude, degrees, of a direction in a body's own frame. */
function onBody(d: Vec3, x: Vec3, y: Vec3, z: Vec3): [number, number] {
  const l = len(d)
  const deg = 180 / Math.PI
  return [Math.atan2(dot(d, y), dot(d, x)) * deg, Math.asin(dot(d, z) / l) * deg]
}

function toward(from: Vec3, to: Vec3): Vec3 {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
}

describe('where things are', () => {
  it('keeps the Earth between perihelion and aphelion', () => {
    expect(len(posesAt(Date.UTC(2026, 0, 3)).earth.at) / AU_KM).toBeCloseTo(0.9833, 3)
    expect(len(posesAt(Date.UTC(2026, 6, 6)).earth.at) / AU_KM).toBeCloseTo(1.0166, 3)
  })

  it('keeps the Moon within its perigee and apogee', () => {
    for (let day = 0; day < 60; day++) {
      const p = posesAt(Date.UTC(2026, 9, 5) + day * 86_400_000)
      const d = len(toward(p.earth.at, p.moon.at))
      expect(d).toBeGreaterThan(356_000)
      expect(d).toBeLessThan(407_000)
    }
  })

  it('tilts the Earth 23.44 degrees from the ecliptic', () => {
    const z = posesAt(Date.UTC(2026, 9, 5)).earth.z
    expect((Math.acos(z[2]) * 180) / Math.PI).toBeCloseTo(23.44, 1)
  })

  it('puts noon over Greenwich at noon UTC, and the Sun over the tropic at the solstice', () => {
    const at = (ms: number): [number, number] => {
      const e = posesAt(ms).earth
      return onBody(toward(e.at, [0, 0, 0]), e.x, e.y, e.z)
    }
    const [lon, lat] = at(Date.UTC(2026, 2, 20, 12))
    expect(Math.abs(lon)).toBeLessThan(5)
    expect(Math.abs(lat)).toBeLessThan(1)
    expect(at(Date.UTC(2026, 5, 21, 12))[1]).toBeCloseTo(23.44, 0)
  })

  it('turns the Moon the same face to the Earth', () => {
    for (let day = 0; day < 30; day += 3) {
      const p = posesAt(Date.UTC(2026, 9, 5) + day * 86_400_000)
      const [lon, lat] = onBody(toward(p.moon.at, p.earth.at), p.moon.x, p.moon.y, p.moon.z)
      // Libration rocks it by up to eight degrees either way.
      expect(Math.abs(lon)).toBeLessThan(9)
      expect(Math.abs(lat)).toBeLessThan(9)
    }
  })
})

describe('the moons of Jupiter and Saturn', () => {
  const MOONS = BODIES.filter((b) => b.parent === 'jupiter' || b.parent === 'saturn')

  /** UTC milliseconds for a Julian day of Barycentric Dynamical Time, which ran 69.184 s ahead from 2017. */
  const utc = (jd: number): number => (jd - 2440587.5) * 86_400_000 - 69_184

  // JPL Horizons, km from the planet's centre on the ecliptic of J2000, at
  // 2020-01-01 07:46:19 and 2026-01-05 21:00:41 TDB, and how near each must
  // come: within hundreds of km for Jupiter's, a couple of thousand for
  // Saturn's, more for far-out Iapetus.
  const HORIZONS: Array<[BodyId, number, Vec3, Vec3]> = [
    ['io', 1_000, [367_120.9, 203_758.6, 12_818.7], [-188_308.8, -375_244.3, -16_114.2]],
    ['europa', 1_000, [-530_852.7, -399_581.9, -27_482.2], [406_062.8, 525_855.9, 24_883.9]],
    ['ganymede', 1_000, [-807_195.9, -703_999.6, -37_633.7], [-739_724.2, -772_799.7, -40_231.2]],
    ['callisto', 1_000, [1_647_095.3, -888_421.0, -5_861.5], [-1_840_078.5, -457_286.8, -39_114.3]],
    ['mimas', 2_500, [72_803.7, -151_882.0, 78_292.3], [-172_258.3, -56_897.7, 49_915.0]],
    ['enceladus', 2_500, [237_074.1, 4_685.4, -25_399.4], [210_308.7, 89_940.0, -67_522.5]],
    ['tethys', 2_500, [-209_544.8, 193_113.7, -74_918.6], [263_364.2, -125_189.8, 42_554.6]],
    ['dione', 2_500, [228_187.0, -274_310.9, 121_750.2], [-327_920.2, 176_597.2, -60_713.0]],
    ['rhea', 2_500, [-524_057.8, -18_430.5, 57_047.8], [-19_256.3, -464_636.1, 247_609.7]],
    ['titan', 4_000, [-1_250_494.1, 82_506.0, 81_930.4], [-81_757.4, 1_094_373.2, -556_227.6]],
    ['iapetus', 10_000, [-1_502_614.7, -3_127_354.8, 1_027_388.5], [-2_644_209.4, 2_471_105.2, -37_813.5]],
  ]

  const fromPlanet = (ms: number, id: BodyId): Vec3 => {
    const p = posesAt(ms)
    const parent = MOONS.find((b) => b.id === id)?.parent as BodyId
    return toward(p[parent].at, p[id].at)
  }

  it('puts each where JPL Horizons has it', () => {
    for (const [id, within, a, b] of HORIZONS) {
      for (const [jd, want] of [
        [2458849.82383, a],
        [2461046.37548, b],
      ] as const) {
        expect(len(toward(want, fromPlanet(utc(jd), id))), id).toBeLessThan(within)
      }
    }
  })

  it("keeps them over their planet's equator, but Iapetus, which goes 15 degrees off it", () => {
    const most = new Map<BodyId, number>()
    for (let day = 0; day < 80; day += 0.75) {
      const p = posesAt(Date.UTC(2026, 9, 5) + day * 86_400_000)
      for (const b of MOONS) {
        const planet = p[b.parent as BodyId]
        const r = toward(planet.at, p[b.id].at)
        const lat = Math.abs((Math.asin(dot(r, planet.z) / len(r)) * 180) / Math.PI)
        most.set(b.id, Math.max(most.get(b.id) ?? 0, lat))
      }
    }
    for (const [id, lat] of most) {
      if (id === 'iapetus') expect(lat).toBeGreaterThan(10)
      else expect(lat, id).toBeLessThan(2)
    }
  })

  it('turns one face to the planet and leads with the side at 90 degrees west', () => {
    const ms = Date.UTC(2026, 9, 5)
    const p = posesAt(ms)
    for (const b of MOONS) {
      const m = p[b.id]
      const [lon, lat] = onBody(toward(m.at, p[b.parent as BodyId].at), m.x, m.y, m.z)
      expect(Math.abs(lon)).toBeLessThan(0.01)
      expect(Math.abs(lat)).toBeLessThan(0.01)
      // Off -90 only by as much as the orbit is out of round.
      const way = toward(fromPlanet(ms - 1000, b.id), fromPlanet(ms + 1000, b.id))
      const [wLon, wLat] = onBody(way, m.x, m.y, m.z)
      expect(Math.abs(wLon + 90), b.id).toBeLessThan(2)
      expect(Math.abs(wLat)).toBeLessThan(0.01)
    }
  })
})

describe('eclipses', () => {
  const say = (e: Eclipse | null): string => (e ? `${new Date(e.peak).toISOString().slice(0, 10)} ${e.kind}` : 'none')

  function run(type: EclipseType, from: number, n: number, way: 1 | -1 = 1): string[] {
    const out: string[] = []
    let ms = from
    for (let i = 0; i < n; i++) {
      const e = way > 0 ? nextEclipse(type, ms) : previousEclipse(type, ms)
      out.push(say(e))
      ms = e.peak
    }
    return out
  }

  it('finds the solar eclipses in order', () => {
    expect(run('solar', Date.UTC(2024, 2, 1), 7)).toEqual([
      '2024-04-08 Total',
      '2024-10-02 Annular',
      '2025-03-29 Partial',
      '2025-09-21 Partial',
      '2026-02-17 Annular',
      '2026-08-12 Total',
      '2027-02-06 Annular',
    ])
    expect(run('solar', Date.UTC(2027, 1, 7), 1)).toEqual(['2027-08-02 Total'])
  })

  it('finds the lunar eclipses in order', () => {
    expect(run('lunar', Date.UTC(2025, 2, 1), 5)).toEqual([
      '2025-03-14 Total',
      '2025-09-07 Total',
      '2026-03-03 Total',
      '2026-08-28 Partial',
      '2027-02-20 Penumbral',
    ])
  })

  it('finds them going back, six months apart or one', () => {
    expect(run('solar', Date.UTC(2027, 1, 7), 7, -1)).toEqual(run('solar', Date.UTC(2024, 2, 1), 7).reverse())
    expect(run('lunar', Date.UTC(2027, 1, 21), 5, -1)).toEqual(run('lunar', Date.UTC(2025, 2, 1), 5).reverse())
    // Two partial solar eclipses a lunar month apart.
    expect(run('solar', Date.UTC(2018, 7, 12), 3, -1)).toEqual(['2018-08-11 Partial', '2018-07-13 Partial', '2018-02-15 Partial'])
  })

  it('steps from between two to the last and the next, and from one to either side of it', () => {
    const now = Date.UTC(2026, 9, 6)
    expect(say(stepTo('solar', now, -1))).toBe('2026-08-12 Total')
    expect(say(stepTo('solar', now, 1))).toBe('2027-02-06 Annular')
    expect(stepsFrom(nearEclipse('solar', now), now)).toMatchObject({ at: false, back: true, on: true })
    // Watching that one, from 90 minutes before its peak to two hours after.
    const peak = nextEclipse('solar', now).peak
    for (const ms of [peak - 90 * 60_000, peak + 2 * 3_600_000]) {
      expect(say(stepTo('solar', ms, -1))).toBe('2026-08-12 Total')
      expect(say(stepTo('solar', ms, 1))).toBe('2027-08-02 Total')
      expect(stepsFrom(nearEclipse('solar', ms), ms)).toMatchObject({ at: true, back: true, on: true })
    }
  })

  it("stops at either end of the clock's range", () => {
    const end = TIME_MAX - 86_400_000
    for (const [type, first, last] of [
      ['solar', '1000-04-13 Total', '2999-10-30 Partial'],
      ['lunar', '1000-03-28 Penumbral', '2999-11-14 Total'],
    ] as const) {
      expect(say(stepTo(type, TIME_MIN, -1))).toBe('none')
      expect(say(stepTo(type, TIME_MIN, 1))).toBe(first)
      expect(stepsFrom(nearEclipse(type, TIME_MIN), TIME_MIN)).toMatchObject({ at: false, back: false, on: true })
      expect(say(stepTo(type, end, 1))).toBe('none')
      expect(say(stepTo(type, end, -1))).toBe(last)
      expect(stepsFrom(nearEclipse(type, end), end)).toMatchObject({ e: null, back: true, on: false })
      // At the first and the last themselves.
      for (const [e, back, on] of [
        [nextEclipse(type, TIME_MIN), false, true],
        [previousEclipse(type, TIME_MAX), true, false],
      ] as const) {
        expect(stepsFrom(nearEclipse(type, e.peak), e.peak)).toMatchObject({ at: true, back, on })
      }
    }
  })

  it('says where a solar eclipse falls', () => {
    const e = nextEclipse('solar', Date.UTC(2024, 3, 1))
    // Greatest eclipse was over Nazas, Mexico.
    expect(e.where?.lat).toBeCloseTo(25.3, 0)
    expect(e.where?.lon).toBeCloseTo(-104.1, 0)
  })
})
