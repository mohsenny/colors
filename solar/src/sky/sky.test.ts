import { Body as AE, HelioVector, Illumination, MakeTime } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { AU_KM, BODIES, bodyById } from './bodies'
import type { BodyId } from './bodies'
import { nearEclipse, nextEclipse, previousEclipse, stepTo, stepsFrom } from './eclipses'
import type { Eclipse, EclipseType } from './eclipses'
import { TIME_MAX, TIME_MIN, posesAt, toEcliptic } from './ephemeris'
import type { Vec3 } from './ephemeris'
import { keplerMoon } from './kepler'
import { DARK, excess, gain, glareOf, limit, luxOf, magnitude, noonLux, pointLook, ringsMagnitude, skyAt } from './light'

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

/** UTC milliseconds for a Julian day of Barycentric Dynamical Time, with the gap between the two as Astronomy Engine counts it in any century. */
function msAt(jd: number): number {
  const tt = jd - 2451545
  let ut = tt
  for (let k = 0; k < 3; k++) ut -= MakeTime(ut).tt - tt
  return Date.UTC(2000, 0, 1, 12) + ut * 86_400_000
}

/** 2000-01-01 12:00, 2026-01-05 21:00:41 and 2100-01-01 12:00 TDB. */
const MOMENTS = [2451545, 2461046.37548, 2488070]

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

  // The rest, on JPL's mean ellipses, against Horizons at the three MOMENTS;
  // Saturn's small inner ones at the first two only, as Horizons has them from
  // 1950 to 2050 alone. An ellipse cannot follow everything that pulls these
  // about: Prometheus and Pandora kick each other chaotically, the Sun drags
  // Himalia and Phoebe round, and Janus and Epimetheus are only near where
  // their trading puts them. So each bound is half as much again as the worst
  // miss at these moments, and the note by it the worst in km over all the
  // years Horizons covers.
  const ELLIPSES: Array<[BodyId, number, Vec3[]]> = [
    // 250, 1610 to 2200
    ['metis', 250, [[-123_250, 34_868.2, -565.6], [-57_059.9, -114_538.7, -4_934.4], [112_658.5, -60_478.1, -512.1]]],
    // 320, 1610 to 2200
    ['adrastea', 150, [[-108_455.9, -69_552.1, -4_068.9], [-119_284.4, -48_792.5, -3_480.8], [-50_714.9, -118_436.1, -4_969]]],
    // 3,200, 1610 to 2200
    ['amalthea', 3_000, [[112_555.8, 141_511.7, 7_618.5], [-108_557.3, 145_335.9, 2_539], [103_339.7, 148_405.8, 6_745]]],
    // 16,000, 1610 to 2200, from 3,100 between 1950 and 2050
    ['thebe', 7_500, [[-223_902.1, -28_293.4, -6_299.8], [-86_850, 207_325.3, 6_214.8], [146_443.2, -164_716.7, -584.2]]],
    // 1,400,000, 1800 to 2200
    [
      'himalia',
      2_000_000,
      [[-4_919_977.6, 8_938_733.5, 4_851_926.1], [3_892_888.4, 8_417_664.1, 2_453_870.9], [11_809_380.7, 2_760_767.7, 5_714_523.8]],
    ],
    // 37,000, 1950 to 2050
    ['prometheus', 25_000, [[-95_293.3, -86_060.7, 54_337.6], [-48_588.5, -114_001.9, 64_430]]],
    // 62,000, 1950 to 2050
    ['pandora', 40_000, [[-45_036.6, 121_067.7, -59_099.9], [-20_416.1, -123_039.6, 66_588]]],
    // 16,000, 1950 to 2050, from 290,000 were they not to trade
    ['epimetheus', 6_000, [[-77_239.7, -114_180.8, 66_249.2], [-124_443, 78_790.3, -29_175.4]]],
    // 10,000, 1950 to 2050, from 100,000 were they not to trade
    ['janus', 4_500, [[86_028.9, 107_414.3, -64_237.8], [-116_205, 90_999.4, -36_666.8]]],
    // 110,000, 1750 to 2250
    ['hyperion', 150_000, [[171_049.3, 1_274_310.9, -659_385.8], [43_499.2, -1_201_179.8, 599_085.1], [854_580.8, -933_306.3, 394_564.6]]],
    // 530,000, 1750 to 2250
    [
      'phoebe',
      550_000,
      [[-11_732_539.4, -2_733_632.8, 1_338_805.3], [-3_791_524.3, 14_418_435.5, 445_386.1], [4_374_034, 14_263_377.8, -1_275_988.7]],
    ],
  ]

  it('puts the small and far ones near where JPL Horizons has them', () => {
    for (const [id, within, wants] of ELLIPSES) {
      wants.forEach((want, k) => expect(len(toward(want, fromPlanet(msAt(MOMENTS[k]), id))), id).toBeLessThan(within))
    }
  })

  it('keeps Janus and Epimetheus apart as they trade, as Horizons has them 10,225 to 10,654 km apart at their nearest', () => {
    // Every swap from 1000 to 3000, four years apart, from January 2026's.
    for (let swap = 2461060 - 250 * 1461.33; swap < 2461060 + 250 * 1461.33; swap += 1461.33) {
      let nearest = Infinity
      for (let jd = swap - 40; jd < swap + 40; jd += 0.25) nearest = Math.min(nearest, len(toward(keplerMoon('janus', jd), keplerMoon('epimetheus', jd))))
      expect(nearest).toBeGreaterThan(9_000)
      expect(nearest).toBeLessThan(11_000)
    }
  })

  it('swings Epimetheus in and out only as far as Horizons has it, 149,850 to 153,050 km from Saturn', () => {
    const r: number[] = []
    for (let jd = 2451545; jd < 2451545 + 365; jd += 0.05) r.push(len(keplerMoon('epimetheus', jd)))
    expect(Math.min(...r)).toBeGreaterThan(149_500)
    expect(Math.max(...r)).toBeLessThan(153_400)
  })

  it("keeps them over their planet's equator, but Iapetus, Himalia and Phoebe, which go 15 to 30 degrees off it", () => {
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
      if (id === 'iapetus' || id === 'himalia' || id === 'phoebe') expect(lat, id).toBeGreaterThan(10)
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
      // Off -90 only by as much as the orbit is out of round: under 2 degrees, but up to 10 for Himalia, Hyperion and Phoebe.
      const way = toward(fromPlanet(ms - 1000, b.id), fromPlanet(ms + 1000, b.id))
      const [wLon, wLat] = onBody(way, m.x, m.y, m.z)
      const round = b.id === 'himalia' || b.id === 'hyperion' || b.id === 'phoebe' ? 10 : 2
      expect(Math.abs(wLon + 90), b.id).toBeLessThan(round)
      expect(Math.abs(wLat)).toBeLessThan(0.01)
    }
  })
})

describe('the moons of Uranus and Neptune', () => {
  const fromPlanet = (ms: number, id: BodyId): Vec3 => {
    const p = posesAt(ms)
    return toward(p[bodyById(id)?.parent as BodyId].at, p[id].at)
  }

  // Ellipses fitted to JPL Horizons from 1950 to 2100, against it at the three
  // MOMENTS, each bound half as much again as the worst miss at these moments
  // and the note by it the worst in km over all those years. What is left is
  // mostly the moons pulling on each other.
  const HORIZONS: Array<[BodyId, number, Vec3[]]> = [
    // 330
    ['miranda', 400, [[-104_329.5, 4_597.7, -77_052.5], [-90_703.6, 11_480.2, -92_257.1], [95_115.1, -19_198.6, 86_137.5]]],
    // 770
    ['ariel', 1_100, [[175_677.9, -46_703.8, -59_273.4], [131_667.5, -9_659.4, 137_974.1], [164_518.9, -22_844.8, 94_826]]],
    // 770
    ['umbriel', 600, [[100_010.3, -55_025.3, -240_255.1], [205_103.5, -21_358, 167_927], [15_657.2, 33_392.3, 264_243.6]]],
    // 2,900
    ['titania', 3_500, [[-63_107, -46_441.1, -428_906.5], [-253_125.2, 103_080.3, 341_225.4], [-85_060.2, 78_049.3, 420_422.9]]],
    // 2,500
    ['oberon', 2_000, [[-560_570, 104_036.9, -124_464.2], [182_985.9, -116_830.8, -541_564.2], [-488_235.1, 63_447.5, -311_378.4]]],
    // 1,200
    ['triton', 850, [[-205_696.5, 124_061.5, 261_000.8], [-224_658.5, -268_856.1, -55_816.3], [-105_318.1, 237_326.2, 241_688.3]]],
  ]

  it('puts them where JPL Horizons has them, within a few hundred km for the inner ones and a few thousand for the outer', () => {
    for (const [id, within, wants] of HORIZONS) {
      wants.forEach((want, k) => expect(len(toward(want, fromPlanet(msAt(MOMENTS[k]), id))), id).toBeLessThan(within))
    }
  })

  it("keeps Uranus's moons over its equator, Miranda within its 4.4 degrees, and Triton going round Neptune backward, 23 degrees off its equator", () => {
    const most = new Map<BodyId, number>()
    for (let day = 0; day < 30; day += 0.1) {
      const p = posesAt(Date.UTC(2026, 9, 5) + day * 86_400_000)
      for (const [id] of HORIZONS) {
        const planet = p[bodyById(id)?.parent as BodyId]
        const r = toward(planet.at, p[id].at)
        const lat = Math.abs((Math.asin(dot(r, planet.z) / len(r)) * 180) / Math.PI)
        most.set(id, Math.max(most.get(id) ?? 0, lat))
      }
    }
    for (const [id, lat] of most) expect(Math.abs(lat - (id === 'miranda' ? 4.4 : id === 'triton' ? 23 : 0)), id).toBeLessThan(0.5)
  })

  it('turns one face to the planet, north where the IAU has it, so each leads with the side at 90 degrees east', () => {
    const ms = Date.UTC(2026, 9, 5)
    const p = posesAt(ms)
    for (const [id] of HORIZONS) {
      const m = p[id]
      const [lon, lat] = onBody(toward(m.at, p[bodyById(id)?.parent as BodyId].at), m.x, m.y, m.z)
      expect(Math.abs(lon)).toBeLessThan(0.01)
      expect(Math.abs(lat)).toBeLessThan(0.01)
      const [wLon] = onBody(toward(fromPlanet(ms - 1000, id), fromPlanet(ms + 1000, id)), m.x, m.y, m.z)
      expect(Math.abs(wLon - 90), id).toBeLessThan(1)
    }
  })

  it('lit the south, which their maps show, when Voyager 2 flew by', () => {
    for (const [ms, ids, under] of [
      [Date.UTC(1986, 0, 24, 18), ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'], -75],
      [Date.UTC(1989, 7, 25, 9), ['triton'], -40],
    ] as const) {
      const p = posesAt(ms)
      for (const id of ids) {
        const m = p[id]
        expect(onBody(toward(m.at, [0, 0, 0]), m.x, m.y, m.z)[1], id).toBeLessThan(under)
      }
    }
  })
})

describe('Pluto and Charon', () => {
  // JPL Horizons at the three MOMENTS, km on the ecliptic of J2000: Pluto from
  // the Sun, Pluto from the point it and Charon go round, and Charon from Pluto.
  const PLUTO: Vec3[] = [
    [-1_477_330_922.3, -4_182_574_867.5, 875_215_480.8],
    [2_878_433_939.7, -4_435_198_382, -357_822_063.8],
    [5_935_267_748.3, 3_725_840_949.6, -2_115_788_058.7],
  ]
  const OFF_CENTRE: Vec3[] = [
    [743.7, 1_575.1, 1_229],
    [-1_198.2, -1_664.5, -580.2],
    [-264.9, -1_318.9, -1_652.8],
  ]
  const CHARON: Vec3[] = [
    [-6_837.7, -14_480.6, -11_298.6],
    [11_014.1, 15_300.8, 5_333.4],
    [2_435.7, 12_126.4, 15_196.4],
  ]

  it('puts Pluto as near where JPL Horizons has it as Astronomy Engine can', () => {
    // Astronomy Engine works Pluto out by integrating from a table of states,
    // and drifts from Horizons away from 2000: about 10,000 km then, 135,000 in
    // 2026, 310,000 in 2100, and 3.7 million by the years 1000 and 3000, which
    // from the Sun is under three minutes of arc.
    const within = [15_000, 200_000, 450_000]
    MOMENTS.forEach((jd, k) => expect(len(toward(PLUTO[k], posesAt(msAt(jd)).pluto.at))).toBeLessThan(within[k]))
  })

  it('puts Pluto and Charon either side of the point they go round, as Horizons does', () => {
    MOMENTS.forEach((jd, k) => {
      const ms = msAt(jd)
      const p = posesAt(ms)
      const c = HelioVector(AE.Pluto, MakeTime(new Date(ms)))
      const centre = toEcliptic(c.x * AU_KM, c.y * AU_KM, c.z * AU_KM)
      expect(len(toward(OFF_CENTRE[k], toward(centre, p.pluto.at)))).toBeLessThan(10)
      expect(len(toward(CHARON[k], toward(p.pluto.at, p.charon.at)))).toBeLessThan(50)
    })
  })

  it('keeps the same faces turned to each other', () => {
    for (const ms of [Date.UTC(1000, 0, 1), Date.UTC(2026, 9, 5), Date.UTC(2999, 11, 31)]) {
      const p = posesAt(ms)
      // Pluto's prime meridian is defined as the one under Charon, and the IAU's
      // rate for it holds within a few degrees over the whole clock.
      const [lon, lat] = onBody(toward(p.pluto.at, p.charon.at), p.pluto.x, p.pluto.y, p.pluto.z)
      expect(Math.abs(lon)).toBeLessThan(5)
      expect(Math.abs(lat)).toBeLessThan(0.01)
      const [back] = onBody(toward(p.charon.at, p.pluto.at), p.charon.x, p.charon.y, p.charon.z)
      expect(Math.abs(back)).toBeLessThan(0.01)
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

describe('how bright things are', () => {
  const deg = Math.PI / 180
  const radius = (id: BodyId): number => (BODIES.find((b) => b.id === id) as (typeof BODIES)[number]).radius

  it('makes a full Moon magnitude -12.7', () => {
    expect(magnitude('moon', radius('moon'), 384_400, 1, 0)).toBeCloseTo(-12.7, 1)
  })

  it('makes the planets from the Earth as bright as Astronomy Engine has them, over fifty years', () => {
    // Saturn's rings are reckoned a different way there, and Pluto is there
    // with Charon, as one point.
    const PLANETS = { mercury: AE.Mercury, venus: AE.Venus, mars: AE.Mars, jupiter: AE.Jupiter, saturn: AE.Saturn, uranus: AE.Uranus, neptune: AE.Neptune, pluto: AE.Pluto } as const
    const within: Partial<Record<BodyId, number>> = { saturn: 0.3, pluto: 0.3 }
    for (let ms = Date.UTC(1990, 0, 1); ms < Date.UTC(2040, 0, 1); ms += 3.3e9) {
      const t = MakeTime(new Date(ms))
      for (const [id, body] of Object.entries(PLANETS) as Array<[keyof typeof PLANETS, AE]>) {
        const il = Illumination(body, t)
        const tilt = (il.ring_tilt ?? 0) * deg
        const m = (on: Exclude<BodyId, 'sun'>): number =>
          magnitude(on, radius(on), il.geo_dist * AU_KM, il.helio_dist, il.phase_angle * deg, 1, on === 'saturn' ? ringsMagnitude(tilt, tilt) : 0)
        const ours = id === 'pluto' ? -2.5 * Math.log10(10 ** (-0.4 * m('pluto')) + 10 ** (-0.4 * m('charon'))) : m(id)
        expect(Math.abs(ours - il.mag)).toBeLessThan(within[id] ?? 0.15)
      }
    }
  })

  it('makes Venus brighter again as a thin crescent, and Saturn brighter with its rings open to both the Sun and the eye', () => {
    const venus = (a: number): number => magnitude('venus', radius('venus'), 4e7, 0.72, a * deg)
    expect(venus(175)).toBeLessThan(venus(165))
    expect(ringsMagnitude(26 * deg, 26 * deg)).toBeCloseTo(-0.8, 1)
    expect(ringsMagnitude(-10 * deg, 10 * deg)).toBe(0)
  })

  it('gives 128,000 lux at noon a sunlit AU away, a square less farther out', () => {
    expect(noonLux(1)).toBe(128_000)
    expect(noonLux(39.5)).toBeCloseTo(82, 0)
    expect(luxOf(-26.74)).toBeCloseTo(128_000, -1)
  })

  it('draws the faintest stars, 6.5, on a dark sky as they were drawn before', () => {
    expect(limit(DARK)).toBeCloseTo(6.63, 2)
    const { a, size } = pointLook(excess(6.5, DARK, 0))
    // As bright as they were drawn: 1.33 for each magnitude under 6.8.
    const before = (6.8 - 6.5) * 1.33
    expect(a).toBeCloseTo(0.1 + 0.085 * before, 4)
    expect(size).toBeCloseTo(2.2 + 0.36 * before, 3)
    // Lost a quarter of a magnitude under the limit, and no step where the
    // size stops growing evenly.
    expect(pointLook(-0.25).a).toBe(0)
    expect(pointLook(11 / 1.33 + 1e-6).size).toBeCloseTo(pointLook(11 / 1.33 - 1e-6).size, 4)
  })

  it('lets a lens show fainter, up to a 20 cm telescope', () => {
    expect(gain(1)).toBe(0)
    expect(gain(30)).toBeCloseTo(7.39, 2)
    expect(gain(300)).toBe(gain(30))
  })

  it('leaves only the brightest stars next to a full Moon, and most of them across the sky', () => {
    const glare = [{ id: 'moon' as const, dir: [1, 0, 0] as Vec3, k: glareOf(luxOf(-12.7), 1), min: 0.25 * deg }]
    const at = (a: number): number => limit(skyAt(glare, [Math.cos(a * deg), Math.sin(a * deg), 0]))
    expect(at(5)).toBeLessThan(2)
    expect(at(60)).toBeGreaterThan(5)
    // Not its own glare.
    expect(skyAt(glare, [1, 0, 0], 'moon')).toBe(DARK)
  })
})
