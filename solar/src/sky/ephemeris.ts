/*
 * Where everything is, and which way it is turned, at any moment. Positions
 * come from Astronomy Engine (VSOP87 for the planets, ELP for the Moon,
 * checked against JPL Horizons to under an arcminute) and the turn of each
 * body from the IAU's rotational elements, so the right face of the Earth is
 * in daylight and the Moon shows the side it really shows.
 *
 * The frame is the ecliptic of J2000 with the Sun at the middle and km as the
 * unit: x toward the March equinox, z toward ecliptic north, so the plane the
 * planets keep to is the floor.
 */

import { Body as AE, GeoMoon, HelioVector, MakeTime, RotationAxis } from 'astronomy-engine'
import type { AstroTime } from 'astronomy-engine'
import { AU_KM, BODIES } from './bodies'
import type { BodyId } from './bodies'

export type Vec3 = [number, number, number]

/** J2000 mean obliquity: the tilt between the equator the catalogues use and the ecliptic. */
const OBLIQUITY = (23.4392911 * Math.PI) / 180
const CE = Math.cos(OBLIQUITY)
const SE = Math.sin(OBLIQUITY)

/** Equatorial J2000 to ecliptic J2000. */
export function toEcliptic(x: number, y: number, z: number): Vec3 {
  return [x, CE * y + SE * z, -SE * y + CE * z]
}

const ENGINE: Record<BodyId, AE> = {
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

/** Centre of a body, km from the Sun's. */
export function centreOf(id: BodyId, time: AstroTime): Vec3 {
  if (id === 'sun') return [0, 0, 0]
  if (id === 'moon') {
    const e = km(HelioVector(AE.Earth, time))
    const m = km(GeoMoon(time))
    return [e[0] + m[0], e[1] + m[1], e[2] + m[2]]
  }
  return km(HelioVector(ENGINE[id], time))
}

/** The Moon from the Earth's centre, km. */
export function moonFromEarth(ms: number): Vec3 {
  return km(GeoMoon(MakeTime(new Date(ms))))
}

/**
 * The body-fixed axes. The prime meridian is `spin` degrees east along the
 * body's equator from where that equator crosses the Earth's, as the IAU
 * defines it.
 */
function axesOf(id: BodyId, time: AstroTime): [Vec3, Vec3, Vec3] {
  const a = RotationAxis(ENGINE[id], time)
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

/** Every body at `ms`, a UTC time in milliseconds. */
export function posesAt(ms: number): Poses {
  const time = MakeTime(new Date(ms))
  const earth = km(HelioVector(AE.Earth, time))
  const out = {} as Poses
  for (const b of BODIES) {
    let at: Vec3
    if (b.id === 'earth') at = earth
    else if (b.id === 'moon') {
      const m = km(GeoMoon(time))
      at = [earth[0] + m[0], earth[1] + m[1], earth[2] + m[2]]
    } else at = centreOf(b.id, time)
    const [x, y, z] = axesOf(b.id, time)
    out[b.id] = { at, x, y, z }
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
}

/**
 * One lap of an orbit, centred on `ms`: km from the Sun's centre, or for the
 * Moon from the Earth's. The planets barely change lap to lap, so this is
 * worked out now and then rather than every frame.
 */
export function orbitOf(id: BodyId, ms: number, samples: number): Float64Array {
  const days = PERIOD[id] ?? 0
  const out = new Float64Array(samples * 3)
  for (let i = 0; i < samples; i++) {
    const t = ms + ((i / (samples - 1) - 0.5) * days * 86_400_000)
    const p = id === 'moon' ? moonFromEarth(t) : centreOf(id, MakeTime(new Date(t)))
    out.set(p, i * 3)
  }
  return out
}
