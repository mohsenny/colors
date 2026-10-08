/*
 * Where everything is, and which way it is turned, at any moment. Positions
 * come from Astronomy Engine (VSOP87 for the planets, ELP for the Moon, L1.2
 * for the big moons of Jupiter, its own integration for Pluto), from Meeus for
 * the round moons of Saturn and from ellipses, JPL's mean elements or fitted
 * to Horizons, for the rest, all checked against JPL Horizons. The turn of
 * each planet, of Pluto and of the Moon is the IAU's, so the right face of
 * the Earth is in daylight and the Moon shows the side it really shows; the
 * other moons keep one face to their planet, as all but Hyperion, Himalia and
 * Phoebe do (those three have no map to show which way they face).
 *
 * Past 2000 BC and AD 3000 the theories give way to mean orbits (deep.ts),
 * which the Sun's life widens (sun.ts), and each body's turn goes on as it was
 * at their edge, the Earth's axis still wheeling round once in 26,000 years.
 *
 * The frame is the ecliptic of J2000 with the Sun at the middle and km as the
 * unit: x toward the March equinox, z toward ecliptic north, so the plane the
 * planets keep to is the floor.
 */

import { Body as AE, AstroTime, GeoMoon, HelioVector, JupiterMoons, RotationAxis } from 'astronomy-engine'
import type { JupiterMoonsInfo } from 'astronomy-engine'
import { AU_KM, BODIES, bodyById } from './bodies'
import type { BodyId } from './bodies'
import { BLEND, DAY_MS, EXACT, J2000_MS, YEAR_MS, meanMoon, meanPlanet, pastTheory, ttOf } from './deep'
import type { Planet } from './deep'
import { farMoon, isFar, isKepler, keplerMoon } from './kepler'
import type { FarMoon, KeplerMoon } from './kepler'
import { saturnMoon } from './saturn'
import type { SaturnMoon } from './saturn'
import { moonWidening, widening } from './sun'

export type Vec3 = [number, number, number]

/** J2000 mean obliquity: the tilt between the equator the catalogues use and the ecliptic. */
const OBLIQUITY = (23.4392911 * Math.PI) / 180
const CE = Math.cos(OBLIQUITY)
const SE = Math.sin(OBLIQUITY)

/** Equatorial J2000 to ecliptic J2000. */
export function toEcliptic(x: number, y: number, z: number): Vec3 {
  return [x, CE * y + SE * z, -SE * y + CE * z]
}

/** The Sun, the planets, Pluto and the Moon, which Astronomy Engine knows the turn of too. */
const ENGINE: Partial<Record<BodyId, AE>> = {
  sun: AE.Sun,
  mercury: AE.Mercury,
  venus: AE.Venus,
  earth: AE.Earth,
  moon: AE.Moon,
  mars: AE.Mars,
  jupiter: AE.Jupiter,
  saturn: AE.Saturn,
  uranus: AE.Uranus,
  neptune: AE.Neptune,
  pluto: AE.Pluto,
}

/** A body's centre and its own axes: to its prime meridian, 90 degrees east of that, and its north pole. */
export interface Pose {
  at: Vec3
  x: Vec3
  y: Vec3
  z: Vec3
}

export type Poses = Record<BodyId, Pose>

/** The clock runs from 4.5 billion years ago, when the Sun had just lit, to 10 billion years on, when it is a cold white dwarf. */
export const TIME_MIN = J2000_MS - 4.5e9 * YEAR_MS
export const TIME_MAX = J2000_MS + 1e10 * YEAR_MS

/** Years from J2000 Pluto's theory starts at: Astronomy Engine has it from AD 1, given a century to give way. */
const PLUTO_FROM = -1400

/** A moment the sky is worked out at. */
export interface Moment {
  ms: number
  /** Days from J2000, Terrestrial Time. */
  tt: number
  /** How far the theories have given way, 0 to 1; Pluto's, which starts later, by itself. */
  past: number
  plutoPast: number
  /** For the theories, while they count at all. */
  time: AstroTime | null
}

export function momentAt(ms: number): Moment {
  const past = pastTheory(ms)
  return { ms, tt: ttOf(ms), past, plutoPast: pastTheory(ms, PLUTO_FROM), time: past < 1 ? new AstroTime((ms - J2000_MS) / DAY_MS) : null }
}

/** The same moment a minute and a half on, to tell which way things go. */
function soon(m: Moment): Moment {
  return { ...m, ms: m.ms + 86_400, tt: m.tt + 1e-3, time: m.time && m.time.AddDays(1e-3) }
}

/** `a` given way to `b` by `w`, each worked out only if it counts. */
function mix(a: () => Vec3, b: () => Vec3, w: number): Vec3 {
  if (w <= 0) return a()
  if (w >= 1) return b()
  const [p, q] = [a(), b()]
  return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w]
}

function km(v: { x: number; y: number; z: number }): Vec3 {
  return toEcliptic(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM)
}

type Galilean = 'io' | 'europa' | 'ganymede' | 'callisto'

/** Julian day of the J2000 epoch, which Astronomy Engine counts its days from. */
const J2000 = 2451545

/** Saturn's radius as the theory of its moons counts it, km: fitted against JPL Horizons. */
const SATURN_UNIT = 60_434

/**
 * The ecliptic and equinox of B1950, which the moons of Saturn are worked out
 * on, to J2000's: onto the old equator, through fifty years of precession
 * (Lieske 1976), and off the new equator. Kept as its three columns.
 */
const FROM_B1950: number[] = (() => {
  const arcsec = Math.PI / 648_000
  const [ca, sa] = [Math.cos(1152.8425 * arcsec), Math.sin(1152.8425 * arcsec)]
  const [cb, sb] = [Math.cos(1153.0407 * arcsec), Math.sin(1153.0407 * arcsec)]
  const [ct, st] = [Math.cos(1002.2611 * arcsec), Math.sin(1002.2611 * arcsec)]
  const e = (23.4457889 * Math.PI) / 180
  const out: number[] = []
  for (const [x, y0, z0] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) {
    const y = Math.cos(e) * y0 - Math.sin(e) * z0
    const z = Math.sin(e) * y0 + Math.cos(e) * z0
    out.push(
      ...toEcliptic(
        (ca * ct * cb - sa * sb) * x - (sa * ct * cb + ca * sb) * y - st * cb * z,
        (ca * ct * sb + sa * cb) * x - (sa * ct * sb - ca * cb) * y - st * sb * z,
        ca * st * x - sa * st * y + ct * z,
      ),
    )
  }
  return out
})()

/** A moon of Saturn from Saturn's centre, km, at a Julian ephemeris day. */
function fromSaturn(id: SaturnMoon, jde: number): Vec3 {
  const [x, y, z] = saturnMoon(id, jde)
  const m = FROM_B1950
  return [
    (m[0] * x + m[3] * y + m[6] * z) * SATURN_UNIT,
    (m[1] * x + m[4] * y + m[7] * z) * SATURN_UNIT,
    (m[2] * x + m[5] * y + m[8] * z) * SATURN_UNIT,
  ]
}

/** A moon on its ellipse from its planet's centre, km, at a Julian ephemeris day. */
function fromElements(id: KeplerMoon, jde: number): Vec3 {
  const [x, y, z] = keplerMoon(id, jde)
  return toEcliptic(x, y, z)
}

/** Charon's share of the mass of Pluto and Charon, as JPL Horizons has it. */
const CHARON_SHARE = 0.10877

/** The Moon's share of the mass of the Earth and the Moon. */
const MOON_SHARE = 0.0121505856

/** A moon from its planet's centre, km. `jupiter` is where Jupiter's are, if already known. */
function localAt(id: BodyId, m: Moment, jupiter?: JupiterMoonsInfo | null): Vec3 {
  const jde = m.tt + J2000
  if (isKepler(id)) return fromElements(id, jde)
  const far = (): Vec3 => toEcliptic(...farMoon(id as FarMoon, jde))
  const parent = bodyById(id)?.parent
  if (parent === 'jupiter') return mix(() => km((jupiter ?? JupiterMoons(m.time as AstroTime))[id as Galilean]), far, m.past)
  if (parent === 'saturn' && isFar(id)) return mix(() => fromSaturn(id as SaturnMoon, jde), far, m.past)
  return mix(
    () => km(GeoMoon(m.time as AstroTime)),
    () => meanMoon(m.tt, moonWidening(m.ms)),
    m.past,
  )
}

/** A planet or Pluto, km from the Sun's centre, by the theories. */
function centreOf(id: BodyId, time: AstroTime): Vec3 {
  const c = km(HelioVector(ENGINE[id] as AE, time))
  if (id !== 'pluto') return c
  // Astronomy Engine follows the point Pluto and Charon both go round, so Pluto is off it, away from Charon.
  const m = fromElements('charon', time.tt + J2000)
  return [c[0] - CHARON_SHARE * m[0], c[1] - CHARON_SHARE * m[1], c[2] - CHARON_SHARE * m[2]]
}

/** The same on its mean orbit, as far out as the Sun's life has it. The Earth is off the barycentre the table follows, away from the Moon, and Pluto away from Charon. */
function deepCentre(id: BodyId, m: Moment): Vec3 {
  const s = widening(id, m.ms)
  const [x, y, z] = meanPlanet(id as Planet, m.tt)
  if (id !== 'earth' && id !== 'pluto') return [x * s, y * s, z * s]
  const [q, share] = id === 'earth' ? [meanMoon(m.tt, moonWidening(m.ms)), MOON_SHARE] : [fromElements('charon', m.tt + J2000), CHARON_SHARE]
  return [x * s - share * q[0], y * s - share * q[1], z * s - share * q[2]]
}

/** Centre of a body, km from the Sun's. */
function centreAt(id: BodyId, m: Moment): Vec3 {
  if (id === 'sun') return [0, 0, 0]
  const parent = bodyById(id)?.parent
  if (!parent) {
    return mix(
      () => centreOf(id, m.time as AstroTime),
      () => deepCentre(id, m),
      id === 'pluto' ? m.plutoPast : m.past,
    )
  }
  const p = centreAt(parent, m)
  const l = localAt(id, m)
  return [p[0] + l[0], p[1] + l[1], p[2] + l[2]]
}

/**
 * The body-fixed axes. The prime meridian is `spin` degrees east along the
 * body's equator from where that equator crosses the Earth's, as the IAU
 * defines it.
 */
function axesOf(id: BodyId, time: AstroTime): [Vec3, Vec3, Vec3] {
  const a = RotationAxis(ENGINE[id] as AE, time)
  const n = a.north
  // The ascending node of the body's equator on the J2000 equator: z cross pole.
  const h = Math.hypot(n.x, n.y) || 1
  const node = [-n.y / h, n.x / h, 0]
  const across = [n.y * node[2] - n.z * node[1], n.z * node[0] - n.x * node[2], n.x * node[1] - n.y * node[0]]
  const w = ((a.spin % 360) * Math.PI) / 180
  const c = Math.cos(w)
  const s = Math.sin(w)
  const x = [c * node[0] + s * across[0], c * node[1] + s * across[1], c * node[2] + s * across[2]]
  const y = [n.y * x[2] - n.z * x[1], n.z * x[0] - n.x * x[2], n.x * x[1] - n.y * x[0]]
  return [toEcliptic(x[0], x[1], x[2]), toEcliptic(y[0], y[1], y[2]), toEcliptic(n.x, n.y, n.z)]
}

/**
 * The axes of a moon that keeps one face to its planet: the prime meridian
 * under the planet, the pole square to the orbit. `at` is from the planet and
 * `way` the way the moon is going.
 */
function locked(at: Vec3, way: Vec3): [Vec3, Vec3, Vec3] {
  const r = Math.hypot(at[0], at[1], at[2])
  const x: Vec3 = [-at[0] / r, -at[1] / r, -at[2] / r]
  const n: Vec3 = [at[1] * way[2] - at[2] * way[1], at[2] * way[0] - at[0] * way[2], at[0] * way[1] - at[1] * way[0]]
  const l = Math.hypot(n[0], n[1], n[2])
  const z: Vec3 = [n[0] / l, n[1] / l, n[2] / l]
  return [x, [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], z]
}

/**
 * Moons whose north, as the IAU has it, is on the other side from the way they
 * go round: Uranus's, round a planet tipped past its side, and Triton, which
 * goes round backward. It is the north their maps have at the top.
 */
const OVER = new Set<BodyId>(['miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton'])

const D = Math.PI / 180

/** Turns axes `turn` radians about the ecliptic's pole, or about their own when `own`. */
function turned([x, y, z]: [Vec3, Vec3, Vec3], turn: number, own: boolean): [Vec3, Vec3, Vec3] {
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  if (own) return [[c * x[0] + s * y[0], c * x[1] + s * y[1], c * x[2] + s * y[2]], [c * y[0] - s * x[0], c * y[1] - s * x[1], c * y[2] - s * x[2]], z]
  const about = (v: Vec3): Vec3 => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]
  return [about(x), about(y), about(z)]
}

/** A body's axes where the theories end on one side, and how fast it turns there, radians a day. */
interface Edge {
  tt: number
  axes: [Vec3, Vec3, Vec3]
  spin: number
}

const edges = new Map<string, Edge>()

function edgeOf(id: BodyId, side: 0 | 1): Edge {
  const key = id + side
  let e = edges.get(key)
  if (!e) {
    const time = new AstroTime((side ? EXACT[1] + BLEND : EXACT[0] - BLEND) * 365.25)
    const a = RotationAxis(ENGINE[id] as AE, time).spin
    const b = RotationAxis(ENGINE[id] as AE, time.AddDays(0.01)).spin
    e = { tt: time.tt, axes: axesOf(id, time), spin: ((((b - a) % 360) + 540) % 360 - 180) * D * 100 }
    edges.set(key, e)
  }
  return e
}

/** The general precession: how far the Earth's axis wheels round the ecliptic's pole a century, radians. */
const PRECESSION = 1.3969713 * D

/** A planet's, Pluto's or the Sun's axes. Past the theories its pole holds where it was and it turns as it did. */
function axesAt(id: BodyId, m: Moment): [Vec3, Vec3, Vec3] {
  if (m.time) return axesOf(id, m.time)
  const e = edgeOf(id, m.tt < 0 ? 0 : 1)
  const days = m.tt - e.tt
  const axes = turned(e.axes, (e.spin * days) % (2 * Math.PI), true)
  return id === 'earth' ? turned(axes, ((-PRECESSION * days) / 36_525) % (2 * Math.PI), false) : axes
}

/** Axes from `a` to `b` by `w`, square to each other again. */
function between(a: [Vec3, Vec3, Vec3], b: [Vec3, Vec3, Vec3], w: number): [Vec3, Vec3, Vec3] {
  const lerp = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w]
  const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const z = unit(lerp(a[2], b[2]))
  const x0 = lerp(a[0], b[0])
  const d = x0[0] * z[0] + x0[1] * z[1] + x0[2] * z[2]
  const x = unit([x0[0] - d * z[0], x0[1] - d * z[1], x0[2] - d * z[2]])
  return [x, [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], z]
}

/** Every body at `ms`, a UTC time in milliseconds. */
export function posesAt(ms: number): Poses {
  const m = momentAt(ms)
  const next = soon(m)
  const jupiter = m.time && JupiterMoons(m.time)
  const jupiterNext = m.past > 0 && next.time ? JupiterMoons(next.time) : null
  const out = {} as Poses
  for (const b of BODIES) {
    if (!b.parent) {
      const [x, y, z] = axesAt(b.id, m)
      out[b.id] = { at: centreAt(b.id, m), x, y, z }
      continue
    }
    const l = localAt(b.id, m, jupiter)
    let axes: [Vec3, Vec3, Vec3]
    if (b.id === 'moon' && m.past === 0) axes = axesOf('moon', m.time as AstroTime)
    else if (b.parent === 'jupiter' && isFar(b.id) && jupiter && m.past === 0) {
      const v = jupiter[b.id as Galilean]
      axes = locked(l, toEcliptic(v.vx, v.vy, v.vz))
    } else {
      const n = localAt(b.id, next, jupiterNext)
      const s = OVER.has(b.id) ? -1 : 1
      axes = locked(l, [s * (n[0] - l[0]), s * (n[1] - l[1]), s * (n[2] - l[2])])
      // The Moon turns as the IAU has it, and past that keeps one face to the Earth.
      if (b.id === 'moon' && m.time) axes = between(axesOf('moon', m.time), axes, m.past)
    }
    const p = out[b.parent].at
    out[b.id] = { at: [p[0] + l[0], p[1] + l[1], p[2] + l[2]], x: axes[0], y: axes[1], z: axes[2] }
  }
  return out
}

/** Sidereal periods in days: how long one lap of each orbit drawn takes. */
export const PERIOD: Partial<Record<BodyId, number>> = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  moon: 27.3217,
  mars: 686.98,
  jupiter: 4332.59,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182,
  pluto: 90560,
  metis: 0.294779,
  adrastea: 0.29826,
  amalthea: 0.498179,
  thebe: 0.674536,
  io: 1.769138,
  europa: 3.551181,
  ganymede: 7.154553,
  callisto: 16.689018,
  himalia: 250.56,
  prometheus: 0.612988,
  pandora: 0.628506,
  epimetheus: 0.694589,
  janus: 0.694589,
  mimas: 0.942422,
  enceladus: 1.370218,
  tethys: 1.887802,
  dione: 2.736915,
  rhea: 4.518212,
  titan: 15.945421,
  hyperion: 21.27666,
  iapetus: 79.3215,
  phoebe: 550.304,
  miranda: 1.413479,
  ariel: 2.520379,
  umbriel: 4.144177,
  titania: 8.705869,
  oberon: 13.463237,
  triton: 5.876854,
  charon: 6.387222,
}

/**
 * One lap of an orbit, centred on `ms`: km from the Sun's centre, or for a
 * moon from its planet's. The planets barely change lap to lap, so this is
 * worked out now and then rather than every frame.
 */
export function orbitOf(id: BodyId, ms: number, samples: number): Float64Array {
  const days = PERIOD[id] ?? 0
  const moon = bodyById(id)?.parent !== undefined
  const out = new Float64Array(samples * 3)
  for (let i = 0; i < samples; i++) {
    const m = momentAt(ms + (i / (samples - 1) - 0.5) * days * DAY_MS)
    out.set(moon ? localAt(id, m) : centreAt(id, m), i * 3)
  }
  return out
}
