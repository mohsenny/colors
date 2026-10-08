import { Body as AE, HelioVector, Illumination, MakeTime } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { AU_KM, BODIES, bodyById } from './bodies'
import type { BodyId } from './bodies'
import { CROWD, crowdAt, crowdAxes, crowdPresence } from './crowd'
import type { CrowdMoon } from './crowd'
import { BLEND, EXACT, J2000_MS, YEAR_MS, presenceOf, smearOf } from './deep'
import { ECLIPSES_FROM, ECLIPSES_TO, nearEclipse, nextEclipse, previousEclipse, stepTo, stepsFrom } from './eclipses'
import type { Eclipse, EclipseType } from './eclipses'
import { TIME_MAX, TIME_MIN, posesAt, spins, toEcliptic } from './ephemeris'
import type { Vec3 } from './ephemeris'
import { keplerMoon } from './kepler'
import { DARK, bareMagnitude, excess, gain, glareOf, limit, luxOf, magnitude, noonLux, pointLook, ringsMagnitude, skyAt } from './light'
import { engulfed, sunAt, widening } from './sun'
import { SHAPE_COLUMNS, SHAPE_ROWS, crowdShapes, shapeOf, unpackShapes } from '../render/shapes'
import shapesFile from '../assets/shapes.bin?url&inline'

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

describe('the moons of Mars', () => {
  const fromMars = (ms: number, id: BodyId): Vec3 => {
    const p = posesAt(ms)
    return toward(p.mars.at, p[id].at)
  }

  // Ellipses fitted to JPL Horizons from 1900 to 2100, Phobos falling in, against
  // it at the three MOMENTS, each bound half as much again as the worst miss
  // at these moments and the note by it the worst in km over all those years.
  const HORIZONS: Array<[BodyId, number, Vec3[]]> = [
    // 20
    ['phobos', 6, [[-1_989, -9_287.5, 558.2], [8_384.4, -271.2, -4_312.3], [-7_967.7, 2_161.1, 4_218.9]]],
    // 68
    ['deimos', 40, [[10_366.4, -19_995.3, -6_530.5], [21_136.2, 4_650.1, -9_057.3], [15_682.3, -15_369.6, -8_256.8]]],
  ]

  it('puts them where JPL Horizons has them, within tens of km', () => {
    for (const [id, within, wants] of HORIZONS) {
      wants.forEach((want, k) => expect(len(toward(want, fromMars(msAt(MOMENTS[k]), id))), id).toBeLessThan(within))
    }
  })

  it("keeps them over Mars's equator, turning one face to it and leading with the side at 90 degrees west", () => {
    for (let day = 0; day < 3; day += 0.05) {
      const ms = Date.UTC(2026, 9, 5) + day * 86_400_000
      const p = posesAt(ms)
      for (const id of ['phobos', 'deimos'] as const) {
        const m = p[id]
        const r = toward(p.mars.at, m.at)
        expect(Math.abs((Math.asin(dot(r, p.mars.z) / len(r)) * 180) / Math.PI), id).toBeLessThan(3)
        const [lon, lat] = onBody(toward(m.at, p.mars.at), m.x, m.y, m.z)
        expect(Math.abs(lon)).toBeLessThan(0.01)
        expect(Math.abs(lat)).toBeLessThan(0.01)
        const [wLon] = onBody(toward(fromMars(ms - 1000, id), fromMars(ms + 1000, id)), m.x, m.y, m.z)
        expect(Math.abs(wLon + 90), id).toBeLessThan(2)
      }
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

  // The rest, on JPL's mean ellipses or fitted to Horizons, against it at the
  // three MOMENTS; Saturn's small inner ones at the first two only, as
  // Horizons has them from 1950 to 2050 alone, and Daphnis at the first, as
  // it has it from 1990 to 2018. An ellipse cannot follow everything that
  // pulls these about: Prometheus and Pandora kick each other and Atlas
  // chaotically, the Sun drags Himalia and Phoebe round, and Janus and
  // Epimetheus are only near where their trading puts them. So each bound is
  // half as much again as the worst miss at these moments, and the note by it
  // the worst in km over all the years Horizons covers.
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
    // 11, 1950 to 2050
    ['pan', 5, [[17_035.4, -118_029.4, 60_195.3], [-125_016.5, 45_576.8, -11_768.9]]],
    // 2,100, 1990 to 2018
    ['daphnis', 250, [[33_701.1, -118_481, 58_822.5]]],
    // 18,000, 1950 to 2050
    ['atlas', 1_300, [[-110_434.7, 76_655.2, -29_463.5], [-135_515.1, -12_574.7, 19_726.6]]],
    // 37,000, 1950 to 2050
    ['prometheus', 25_000, [[-95_293.3, -86_060.7, 54_337.6], [-48_588.5, -114_001.9, 64_430]]],
    // 62,000, 1950 to 2050
    ['pandora', 40_000, [[-45_036.6, 121_067.7, -59_099.9], [-20_416.1, -123_039.6, 66_588]]],
    // 16,000, 1950 to 2050, from 290,000 were they not to trade
    ['epimetheus', 6_000, [[-77_239.7, -114_180.8, 66_249.2], [-124_443, 78_790.3, -29_175.4]]],
    // 10,000, 1950 to 2050, from 100,000 were they not to trade
    ['janus', 4_500, [[86_028.9, 107_414.3, -64_237.8], [-116_205, 90_999.4, -36_666.8]]],
    // 320, 1900 to 2100
    ['telesto', 300, [[281_121.5, 65_308.1, -59_451], [241_091.2, 142_554.5, -91_805.7], [280_819.8, -87_277, 19_570.5]]],
    // 320, 1900 to 2100
    ['calypso', 500, [[-55_628.2, -253_776.4, 139_252.6], [266.9, -264_519.8, 129_874.8], [-215_889.8, -166_971.5, 111_061.3]]],
    // 1,600, 1900 to 2100
    ['helene', 1_100, [[373_716.4, -10_967.3, -29_000], [-314_500.9, -174_332, 121_826.7], [-268_963.2, 242_987, -100_275.2]]],
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
    for (const b of MOONS.filter((b) => !spins(b.id))) {
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

  // Their small ones, fitted from 1900 to 2100. The Sun pulls Nereid's long,
  // steep orbit about, so it is only near.
  const SMALL: Array<[BodyId, number, Vec3[]]> = [
    // 97
    ['puck', 50, [[5_145.6, -12_890.6, -84_126.2], [81_151.2, -13_969.2, 22_059.6], [19_210.4, 8_824.5, 83_586.3]]],
    // 180
    ['proteus', 150, [[46_051.8, -94_011.2, -53_714.7], [-38_139.6, -108_744.1, -23_946.4], [54_660.2, 103_293.1, 13_530.9]]],
    // 77,000
    ['nereid', 100_000, [[893_764.6, 9_317_777.5, 679_586.8], [-1_417_110.5, -781_791, -133_813.5], [1_401_729.1, -1_183_818.9, 13_392.7]]],
  ]

  it('puts them where JPL Horizons has them, within a few hundred km for the inner ones and a few thousand for the outer', () => {
    for (const [id, within, wants] of [...HORIZONS, ...SMALL]) {
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

  it('turns one face to the planet, north where the IAU has it, so all but Proteus lead with the side at 90 degrees east', () => {
    const ms = Date.UTC(2026, 9, 5)
    const p = posesAt(ms)
    for (const id of [...HORIZONS.map(([id]) => id), 'puck', 'proteus'] as BodyId[]) {
      const m = p[id]
      const [lon, lat] = onBody(toward(m.at, p[bodyById(id)?.parent as BodyId].at), m.x, m.y, m.z)
      expect(Math.abs(lon)).toBeLessThan(0.01)
      expect(Math.abs(lat)).toBeLessThan(0.01)
      // Proteus goes round Neptune forward, so leads with its west.
      const [wLon] = onBody(toward(fromPlanet(ms - 1000, id), fromPlanet(ms + 1000, id)), m.x, m.y, m.z)
      expect(Math.abs(wLon - (id === 'proteus' ? -90 : 90)), id).toBeLessThan(1)
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

  // The four small ones, fitted to Horizons from 1900 to 2100 round the point
  // Pluto and Charon go round, against it from Pluto at the three MOMENTS,
  // each bound half as much again as the worst miss at these moments and the
  // note by it the worst in km over all those years.
  const SMALL: Array<[BodyId, number, Vec3[]]> = [
    // 700
    ['styx', 300, [[30_203.4, 20_646.4, -19_496.5], [-2_171, -23_255.3, -33_543.1], [-24_887.5, -5_163.1, 35_120]]],
    // 160
    ['nix', 160, [[-3_191.6, 22_177.4, 41_110.3], [36_758.5, 26_734.4, -21_180.7], [-6_420.9, -29_207.6, -35_612.3]]],
    // 280
    ['kerberos', 325, [[5_356.9, -27_520.6, -52_672.6], [-33_840.5, -8_217.9, 45_121.9], [-19_577.2, 13_155, 54_402.1]]],
    // 57
    ['hydra', 55, [[31_410.4, -960.2, -57_006.9], [27_585.7, 50_624.9, 33_545.4], [5_964.2, -28_276.2, -55_300]]],
  ]

  it('puts the four small moons where JPL Horizons has them, within a few hundred km', () => {
    for (const [id, within, wants] of SMALL) {
      wants.forEach((want, k) => {
        const p = posesAt(msAt(MOMENTS[k]))
        expect(len(toward(want, toward(p.pluto.at, p[id].at))), id).toBeLessThan(within)
      })
    }
  })

  it('tips them over on their sides, Nix and Hydra past them, as New Horizons saw', () => {
    const ms = Date.UTC(2015, 6, 14)
    const [a, b] = [posesAt(ms - 60_000), posesAt(ms + 60_000)]
    const r = toward(a.pluto.at, a.charon.at)
    const v = toward(toward(a.pluto.at, a.charon.at), toward(b.pluto.at, b.charon.at))
    const n: Vec3 = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]
    for (const [id, tilt] of [
      ['styx', 91],
      ['nix', 123],
      ['kerberos', 96],
      ['hydra', 110],
    ] as const) {
      expect((Math.acos(dot(n, a[id].z) / len(n)) * 180) / Math.PI, id).toBeCloseTo(tilt, -0.5)
    }
  })
})

describe('the moons that turn on their own', () => {
  it('turns each forward about its north, as fast as it was seen to', () => {
    const ms = Date.UTC(2026, 9, 5)
    const [a, b] = [posesAt(ms), posesAt(ms + 864_000)]
    // Degrees in a hundredth of a day: from hours a turn, or days for Hyperion and Pluto's.
    for (const [id, deg] of [
      ['himalia', 86.4 / 7.7819],
      ['hyperion', 0.72],
      ['phoebe', 86.4 / 9.274],
      ['nereid', 86.4 / 11.594],
      ['styx', 3.6 / 3.24],
      ['nix', 3.6 / 1.829],
      ['kerberos', 3.6 / 5.31],
      ['hydra', 3.6 / 0.4295],
    ] as const) {
      expect(spins(id), id).toBe(true)
      expect(len(toward(a[id].z, b[id].z)), id).toBeLessThan(1e-9)
      expect(onBody(b[id].x, a[id].x, a[id].y, a[id].z)[0], id).toBeCloseTo(deg, 2)
    }
  })
})

describe("the giants' other moons", () => {
  const moon = (name: string): CrowdMoon => CROWD.find((c) => c.name === name) as CrowdMoon

  it('has 414, none of them one of the named', () => {
    expect(CROWD.length).toBe(414)
    expect(new Set(CROWD.map((c) => c.name)).size).toBe(414)
    for (const c of CROWD) expect(bodyById(c.name.toLowerCase() as BodyId), c.name).toBeUndefined()
  })

  // Ellipses fitted to JPL Horizons, against it at three moments, each bound
  // half as much again as the worst miss at them and the note by it the worst
  // in km over the years fitted. The far ones' are a good share of how far out
  // they are: the Sun swings them about more than an ellipse can follow.
  const CHECKS = [2451545, 2460676.5, 2461321.5]
  const HORIZONS: Array<[string, number, Vec3[]]> = [
    // 1,700,000
    ['Elara', 2_100_000, [[-5_889_184.2, -5_740_514.4, 4_227_062.9], [2_548_068.7, -8_759_201.2, -2_023_073], [-4_415_978.7, 13_106_481.1, 3_358_613]]],
    // 11,000,000
    ['Pasiphae', 15_000_000, [[1_351_933.4, -21_994_617.8, 12_389_532.3], [7_646_176.3, 14_084_278.6, 882_326], [-12_752_066.4, -5_377_809.4, -5_844_185.2]]],
    // 5,000,000
    ['Sinope', 5_500_000, [[-23_997_983.3, 17_315_839.8, 4_355_605.5], [-24_541_092.8, 17_688_717.5, -10_379_780.8], [-27_387_478.7, 403_838.3, -8_169_911.2]]],
    // 3,000,000
    ['Themisto', 1_800_000, [[6_456_349.5, -572_451.3, 3_121_862.9], [-1_316_200.8, 3_738_812.8, -3_815_883.4], [957_369.4, 3_861_380.3, -3_674_541.4]]],
    // 10,000,000
    ['Carpo', 12_000_000, [[190_063.2, 9_913_327.2, 9_766_733.8], [-16_189_638.3, -3_267_891.8, -9_074_034.2], [-4_018_088.2, -16_786_622.8, -18_335_704.2]]],
    // 7,400,000
    ['S/2021 J 8', 6_400_000, [[-7_545_679.6, 15_051_894.8, 3_156_760.8], [7_857_077.8, -22_226_200.6, -13_027_856.3], [2_506_118.4, -22_808_121.5, -10_550_705.7]]],
    // 6,600,000
    ['Valetudo', 5_700_000, [[16_643_809.3, -2_702_681.8, 9_107_597], [481_001.2, 13_811_853.9, -6_681_106.4], [-18_353_562.9, -617_122.3, -7_107_518.7]]],
    // 3,800,000
    ['Ymir', 3_000_000, [[23_685_188.2, -18_609_439.3, -3_316_004.6], [24_824_404.8, -15_299_291.8, -3_888_750.5], [-11_193_988, 11_430_420.5, 2_032_894]]],
    // 1,100,000
    ['Kiviuq', 890_000, [[-2_595_850, -8_289_718.6, -9_759_037.6], [10_415_071.1, -1_143_586.4, 1_794_318.6], [-11_408_555.7, 200_457.8, -3_134_207.5]]],
    // 7,100,000
    ['Albiorix', 7_900_000, [[-4_951_933.3, -6_326_367.7, 5_215_645.7], [19_166_483.2, 5_902_570.7, -11_327_012.6], [22_242_749.5, -1_416_609, -14_187_509.8]]],
    // 7,100,000
    ['Siarnaq', 4_500_000, [[10_866_422.8, -13_014_939.5, -17_493_316.6], [18_317_446.4, -2_955_239.2, -11_783_126.2], [6_560_040.7, -17_184_397.7, -17_855_475.2]]],
    // 3,700
    ['Methone', 3_600, [[150_794.8, -113_668.3, 44_901.5], [74_952.4, -161_741.7, 77_506.7], [-23_286.9, -169_781.8, 91_174.2]]],
    // 2,100
    ['Pallene', 2_300, [[6_964.8, -187_549.1, 97_376.3], [-177_646.5, 108_494.6, -39_617.2], [-203_985.8, 57_814.5, -9_869.8]]],
    // 18,000
    ['Polydeuces', 25_000, [[-261_376.1, -226_963.9, 144_826.2], [293_748.4, 206_904, -138_122.8], [192_307.9, -288_996, 132_191.2]]],
    // 2,300,000
    ['Aegir', 2_600_000, [[-5_861_435.8, -14_628_061.8, -3_099_726.8], [-20_012_503, -743_377.5, 2_615_786.7], [16_199_413.3, 13_662_522, 153_121.6]]],
    // 5,600
    ['Anthe', 4_900, [[134_854.7, 122_489, -77_265.7], [62_188.5, -168_463.7, 82_200.9], [108_963.3, 141_220, -84_623.8]]],
    // 3,100
    ['Aegaeon', 3_900, [[-94_279.9, -118_647.3, 71_297.1], [-166_760.2, 11_893.5, 9_924.1], [-85_391.9, -124_021.8, 73_257.7]]],
    // 2,200,000
    ['S/2023 S 63', 1_500_000, [[16_129_558.2, -15_982_369.6, 2_706_926.1], [16_917_097.8, 10_958_902.2, 4_446_014], [-13_883_324.5, 521_851.4, -2_527_004.8]]],
    // 160
    ['Cordelia', 240, [[48_606.8, -10_462.1, 2_248.5], [-3_794.1, -6_138, -49_213.3], [-43_661.6, 6_390.3, -22_969.4]]],
    // 3,400
    ['Portia', 4_200, [[-6_433.2, -4_558.4, -65_804.8], [29_675, 306, 58_918.6], [-31_939.5, 13_157.7, 56_623.9]]],
    // 140,000
    ['Caliban', 120_000, [[-6_455_421.8, 1_447_022.8, 751_463.3], [-74_256, -5_329_724.6, -4_532_847.3], [-4_736_525.7, -3_427_638.1, -3_221_135.3]]],
    // 1,700,000
    ['Sycorax', 1_400_000, [[12_897_984.7, 6_725_699, -5_606_465.4], [11_245_768.4, -142_012.9, -5_342_908.6], [1_079_429.7, 16_042_525.3, 836_138.4]]],
    // 4,600,000
    ['Margaret', 3_000_000, [[7_666_134.7, -4_660_435.3, -9_489_936.3], [-3_480_738.8, -18_189_245.4, -19_150_411.6], [5_368_823.6, -10_038_954.1, -13_364_768.8]]],
    // 1,400
    ['Mab', 2_100, [[73_718, -26_234.4, -57_630.2], [82_023.8, -12_087.3, 52_175.1], [7_519, 8_704.4, 97_021.1]]],
    // 310,000
    ['S/2023 U 1', 160_000, [[-289_271.2, 6_586_687.3, 776_945.2], [4_752_337.1, -7_058_185.5, -4_113_162.2], [5_887_906.4, -5_329_686.8, -4_889_688.5]]],
    // 500
    ['Naiad', 470, [[-37_078.7, 16_965.6, 25_738.5], [-43_125.4, -20_527.3, 6_644.1], [-45_810.2, -8_385.2, 12_500.4]]],
    // 450
    ['Thalassa', 440, [[32_789.3, -29_368.1, -23_853.3], [46_538.5, 9_576.5, -15_811.3], [-1_103.7, -47_345.7, -16_263.1]]],
    // 280
    ['Galatea', 76, [[-14_932.3, 54_413.6, 25_556.5], [-56_459.4, -19_747.5, 16_128.1], [51_865.3, -18_998.4, -28_067.5]]],
    // 640
    ['Larissa', 600, [[63_322.7, 35_256.8, -13_020.1], [-68_529.2, -9_491.3, 24_709.8], [-52_844.1, 37_035.6, 35_162]]],
    // 1,400,000
    ['Halimede', 760_000, [[-16_279_332.5, -11_118_511.1, 2_679_320.6], [-13_148_545.9, -14_278_162.7, -7_481_019.6], [-6_744_576, 1_805_735.3, 13_291_374.8]]],
    // 1,400,000
    ['Sao', 840_000, [[-8_652_269.5, 8_040_624.4, 15_129_781.2], [-15_182_255.5, -10_117_236.3, 10_591_375.3], [-2_959_007.4, -21_800_569, -11_253_233.5]]],
    // 25,000,000
    ['Neso', 12_000_000, [[-44_828_533.5, 44_080_237.3, -48_591_037.9], [-54_738_724.4, 43_651_947.8, -49_110_481.8], [-49_911_111.9, 50_198_952.3, -47_199_297.5]]],
    // 650
    ['Hippocamp', 190, [[35_934.5, -87_292.4, -46_590.7], [67_880.3, -62_348.8, -50_762.6], [-2_886.4, -99_351.6, -34_846.1]]],
    // 11,000,000
    ['S/2021 N 1', 12_000_000, [[57_280_294.4, 8_733_178.3, -45_867_414.1], [40_271_878.4, 26_496_754.9, -37_909_271.7], [47_027_391.1, 14_636_433.3, -45_532_452.6]]],
  ]

  it('puts each where Horizons has it, near enough', () => {
    for (const [name, bound, want] of HORIZONS) {
      want.forEach((p, k) => expect(len(toward(p, crowdAt(moon(name), CHECKS[k] - 2451545))), name).toBeLessThan(bound))
    }
  })

  it('turns those measured as fast as they were seen to, and keeps the close ones facing their planet', () => {
    const tt = 9_600
    // Degrees in a hundredth of a day, from hours a turn: Ymir's backward.
    for (const [name, deg] of [
      ['Sycorax', 86.4 / 6.9162],
      ['Ymir', -86.4 / 11.9222],
      ['Elara', 86.4 / 9.596],
    ] as const) {
      const c = moon(name)
      const [a, b] = [crowdAxes(c, tt, crowdAt(c, tt)), crowdAxes(c, tt + 0.01, crowdAt(c, tt + 0.01))]
      expect(len(toward(a[2], b[2])), name).toBeLessThan(1e-9)
      expect(onBody(b[0], a[0], a[1], a[2])[0], name).toBeCloseTo(deg, 2)
    }
    const close = CROWD.filter((c) => c.locked)
    expect(close.length).toBe(24)
    for (const c of close) {
      const l = crowdAt(c, tt)
      expect(dot(crowdAxes(c, tt, l)[0], l) / len(l), c.name).toBeCloseTo(-1, 9)
    }
  })

  it("loses each from its place as the named moons on ellipses are lost, Uranus's close ones sooner and the two found last within years", () => {
    const shown = (name: string, years: number): number => crowdPresence(moon(name), J2000_MS + years * YEAR_MS)
    expect([shown('Elara', 26), shown('Elara', 2100), shown('Elara', 4300)]).toEqual([1, 1, 0])
    expect([shown('Cordelia', 1200), shown('Cordelia', 1700)]).toEqual([1, 0])
    expect([shown('S/2023 S 38', 26), shown('S/2023 S 38', 35)]).toEqual([1, 0])
    expect(shown('S/2025 U 1', 26)).toBeGreaterThan(0.95)
    expect(shown('S/2025 U 1', 0)).toBe(0)
  })
})

describe('the small moons\' shapes', () => {
  const bytes = Uint8Array.from(atob(shapesFile.split(',')[1]), (c) => c.charCodeAt(0))
  const file = unpackShapes(bytes.buffer) as Float32Array
  const cells = SHAPE_ROWS * SHAPE_COLUMNS
  // A shape's highest point and lowest, and how little its ground faces outward at the worst.
  const survey = (data: Float32Array, k: number): [number, number, number] => {
    const one = Array.from({ length: cells }, (_, i) => data.subarray((k * cells + i) * 4, (k * cells + i + 1) * 4))
    const out = one.map((c, i) => {
      const lat = Math.PI / 2 - (Math.floor(i / SHAPE_COLUMNS) + 0.5) * (Math.PI / SHAPE_ROWS)
      const lon = -Math.PI + ((i % SHAPE_COLUMNS) + 0.5) * (Math.PI / SHAPE_ROWS)
      return dot([c[1], c[2], c[3]], [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)])
    })
    return [Math.max(...one.map((c) => c[0])), Math.min(...one.map((c) => c[0])), Math.min(...out)]
  }

  it('has one for every lumpy moon, reaching out to its highest point and nowhere near its middle, facing outward', () => {
    const lumpy = BODIES.filter((b) => b.outer)
    expect(lumpy.length).toBe(24)
    // And Larissa's.
    expect(file.length).toBe(25 * cells * 4)
    for (const b of lumpy) {
      const [high, low, out] = survey(file, shapeOf(b.id))
      expect(high, b.id).toBe(1)
      expect(low, b.id).toBeGreaterThan(0.3)
      // The ground faces outward, never back toward the middle.
      expect(out, b.id).toBeGreaterThan(0)
      expect(b.outer, b.id).toBeGreaterThan(b.radius)
    }
    expect(shapeOf('puck')).toBe(-1)
  })

  it("makes the crowd's as the file's are: Larissa's from it, one for each measured, and two dozen the rest share", () => {
    const { data, of } = crowdShapes(file)
    const layers = data.length / 4 / cells
    expect(layers).toBe(25 + 16 + 24)
    expect(of[CROWD.findIndex((c) => c.name === 'Larissa')].at).toBe(24)
    for (let k = 24; k < layers; k++) {
      const [high, low, out] = survey(data, k)
      expect(high, String(k)).toBeCloseTo(1, 6)
      expect(low, String(k)).toBeGreaterThan(0.3)
      expect(out, String(k)).toBeGreaterThan(0)
    }
    for (const [k, s] of of.entries()) expect(s.ratio, CROWD[k].name).toBeGreaterThan(1)
  })
})

describe('eclipses', () => {
  const say = (e: Eclipse | null): string => {
    if (!e) return 'none'
    const d = new Date(e.peak)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${e.kind}`
  }

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

  it('stops at either end of the years they are found over, 2000 BC and AD 3000', () => {
    for (const [type, first, last] of [
      ['solar', '-1999-05-25 Total', '2999-10-30 Partial'],
      ['lunar', '-1999-06-08 Penumbral', '2999-11-14 Total'],
    ] as const) {
      // From their ends, and from the ends of the clock, billions of years past them.
      for (const start of [ECLIPSES_FROM, TIME_MIN]) {
        expect(say(stepTo(type, start, -1))).toBe('none')
        expect(say(stepTo(type, start, 1))).toBe(first)
        expect(stepsFrom(nearEclipse(type, start), start)).toMatchObject({ at: false, back: false, on: true })
      }
      for (const end of [ECLIPSES_TO - 86_400_000, TIME_MAX]) {
        expect(say(stepTo(type, end, 1))).toBe('none')
        expect(say(stepTo(type, end, -1))).toBe(last)
        expect(stepsFrom(nearEclipse(type, end), end)).toMatchObject({ e: null, back: true, on: false })
      }
      // At the first and the last themselves.
      for (const [e, back, on] of [
        [nextEclipse(type, ECLIPSES_FROM), false, true],
        [previousEclipse(type, ECLIPSES_TO), true, false],
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

describe('deep time', () => {
  const at = (years: number): number => J2000_MS + years * YEAR_MS
  const gyr = (g: number): number => at(g * 1e9)

  it('keeps the Sun as it is now, and makes it a red giant 256 times as wide 7.59 billion years on, then a white dwarf the size of the Earth', () => {
    expect(sunAt(J2000_MS)).toEqual({ radius: 695_700, temperature: 5772, luminosity: 1, mass: 1 })
    // Seven tenths as bright as it began.
    expect(sunAt(TIME_MIN).luminosity).toBeCloseTo(0.69, 2)
    expect(sunAt(gyr(7.59)).radius / 695_700).toBeCloseTo(256, 0)
    const dwarf = sunAt(gyr(9))
    expect(dwarf.radius).toBeGreaterThan(6_000)
    expect(dwarf.radius).toBeLessThan(12_000)
    expect(dwarf.temperature).toBeGreaterThan(6_000)
  })

  it('takes Mercury, Venus, the Earth and the Moon as it swells, and widens the orbits of the rest as it loses mass', () => {
    for (const id of ['mercury', 'venus', 'earth', 'moon'] as const) expect([engulfed(id, gyr(7.5)), engulfed(id, gyr(7.6))]).toEqual([false, true])
    expect(engulfed('mars', TIME_MAX)).toBe(false)
    expect(widening('mars', J2000_MS)).toBe(1)
    expect(widening('mars', gyr(9))).toBeCloseTo(1 / 0.54, 6)
    // The Earth is dragged in to the Sun's edge.
    expect((widening('earth', gyr(7.5895)) * AU_KM) / sunAt(gyr(7.5895)).radius).toBeCloseTo(1, 6)
  })

  it('moves everything as smoothly where the theories give way to the mean orbits as it does now', () => {
    // How far each body is off the middle of where it was a minute before and will be a minute after, km: how much its path bends.
    const bend = (ms: number): Map<string, number> => {
      const [a, m, b] = [posesAt(ms - 60_000), posesAt(ms), posesAt(ms + 60_000)]
      return new Map(BODIES.map(({ id }) => [id, len([0, 1, 2].map((k) => (a[id].at[k] + b[id].at[k]) / 2 - m[id].at[k]) as Vec3)]))
    }
    const now = bend(Date.UTC(2026, 0, 1))
    for (const y of [EXACT[0] - BLEND, EXACT[0], EXACT[1], EXACT[1] + BLEND]) {
      for (const [id, km] of bend(at(y))) expect(km, `${id} ${y} years on`).toBeLessThan((now.get(id) as number) * 1.1 + 1)
    }
  })

  it('places every body as far back and on as the clock goes', () => {
    for (const ms of [TIME_MIN, TIME_MAX]) {
      for (const [id, p] of Object.entries(posesAt(ms))) expect([...p.at, ...p.x, ...p.y, ...p.z].every(Number.isFinite), id).toBe(true)
    }
  })

  it("loses a body's place along its orbit bit by bit: the Moon's over a few hundred thousand years, the Earth's over tens of millions", () => {
    const shown = (id: BodyId, years: number): number => presenceOf(smearOf(id, at(years)))
    for (const id of ['earth', 'moon', 'io', 'neptune'] as const) expect(shown(id, 26)).toBe(1)
    expect([shown('moon', 1e4), shown('moon', 1e6)]).toEqual([1, 0])
    expect([shown('earth', 1e6), shown('earth', 1e8)]).toEqual([1, 0])
    expect(shown('earth', 1e7)).toBeGreaterThan(0.2)
    expect(shown('earth', 1e7)).toBeLessThan(0.8)
    expect(shown('earth', -1e7)).toBeCloseTo(shown('earth', 1e7), 2)
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

  it('makes a moon known only by its absolute magnitude that bright an AU from both the Sun and the eye, full on', () => {
    expect(bareMagnitude(10, AU_KM, 1, 0)).toBeCloseTo(10, 1)
    // Fainter off full, and in a shadow.
    expect(bareMagnitude(10, AU_KM, 1, 0.5)).toBeGreaterThan(10.5)
    expect(bareMagnitude(10, AU_KM, 1, 0, 0.5) - bareMagnitude(10, AU_KM, 1, 0)).toBeCloseTo(2.5 * Math.log10(2), 9)
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
