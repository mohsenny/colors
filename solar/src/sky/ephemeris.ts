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
 * The frame is the ecliptic of J2000 with the Sun at the middle and km as the
 * unit: x toward the March equinox, z toward ecliptic north, so the plane the
 * planets keep to is the floor.
 */

import { Body as AE, GeoMoon, HelioVector, JupiterMoons, MakeTime, RotationAxis } from 'astronomy-engine'
import type { AstroTime } from 'astronomy-engine'
import { AU_KM, BODIES, bodyById } from './bodies'
import type { BodyId } from './bodies'
import { isKepler, keplerMoon } from './kepler'
import type { KeplerMoon } from './kepler'
import { saturnMoon } from './saturn'
import type { SaturnMoon } from './saturn'

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

/** Years the clock may run between. The planetary theory holds for millennia either side of now. */
export const YEARS = [1000, 3000] as const
export const TIME_MIN = Date.UTC(YEARS[0], 0, 1)
export const TIME_MAX = Date.UTC(YEARS[1], 0, 1)

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

/** A moon on its mean ellipse from its planet's centre, km, at a Julian ephemeris day. */
function fromElements(id: KeplerMoon, jde: number): Vec3 {
  const [x, y, z] = keplerMoon(id, jde)
  return toEcliptic(x, y, z)
}

/** A moon from its planet's centre, km. */
function fromPlanet(id: BodyId, time: AstroTime): Vec3 {
  if (isKepler(id)) return fromElements(id, time.tt + J2000)
  const parent = bodyById(id)?.parent
  if (parent === 'jupiter') return km(JupiterMoons(time)[id as Galilean])
  if (parent === 'saturn') return fromSaturn(id as SaturnMoon, time.tt + J2000)
  return km(GeoMoon(time))
}

/** Charon's share of the mass of Pluto and Charon, as JPL Horizons has it. */
const CHARON_SHARE = 0.10877

/** Centre of a body, km from the Sun's. */
export function centreOf(id: BodyId, time: AstroTime): Vec3 {
  if (id === 'sun') return [0, 0, 0]
  const parent = bodyById(id)?.parent
  if (!parent) {
    const c = km(HelioVector(ENGINE[id] as AE, time))
    if (id !== 'pluto') return c
    // Astronomy Engine follows the point Pluto and Charon both go round, so Pluto is off it, away from Charon.
    const m = fromElements('charon', time.tt + J2000)
    return [c[0] - CHARON_SHARE * m[0], c[1] - CHARON_SHARE * m[1], c[2] - CHARON_SHARE * m[2]]
  }
  const p = centreOf(parent, time)
  const m = fromPlanet(id, time)
  return [p[0] + m[0], p[1] + m[1], p[2] + m[2]]
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

/** Every body at `ms`, a UTC time in milliseconds. */
export function posesAt(ms: number): Poses {
  const time = MakeTime(new Date(ms))
  const jde = time.tt + J2000
  const jupiter = JupiterMoons(time)
  const out = {} as Poses
  for (const b of BODIES) {
    if (!b.parent) {
      const [x, y, z] = axesOf(b.id, time)
      out[b.id] = { at: centreOf(b.id, time), x, y, z }
      continue
    }
    let m: Vec3
    let axes: [Vec3, Vec3, Vec3]
    if (isKepler(b.id)) {
      m = fromElements(b.id, jde)
      const next = fromElements(b.id, jde + 1e-3)
      const s = OVER.has(b.id) ? -1 : 1
      axes = locked(m, [s * (next[0] - m[0]), s * (next[1] - m[1]), s * (next[2] - m[2])])
    } else if (b.parent === 'jupiter') {
      const s = jupiter[b.id as Galilean]
      m = km(s)
      axes = locked(m, toEcliptic(s.vx, s.vy, s.vz))
    } else if (b.parent === 'saturn') {
      m = fromSaturn(b.id as SaturnMoon, jde)
      const next = fromSaturn(b.id as SaturnMoon, jde + 1e-3)
      axes = locked(m, [next[0] - m[0], next[1] - m[1], next[2] - m[2]])
    } else {
      m = km(GeoMoon(time))
      axes = axesOf(b.id, time)
    }
    const p = out[b.parent].at
    out[b.id] = { at: [p[0] + m[0], p[1] + m[1], p[2] + m[2]], x: axes[0], y: axes[1], z: axes[2] }
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
    const time = MakeTime(new Date(ms + (i / (samples - 1) - 0.5) * days * 86_400_000))
    out.set(moon ? fromPlanet(id, time) : centreOf(id, time), i * 3)
  }
  return out
}
