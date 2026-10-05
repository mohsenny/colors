import { describe, expect, it } from 'vitest'
import { AU_KM } from './bodies'
import { nextEclipse } from './eclipses'
import type { EclipseType } from './eclipses'
import { posesAt } from './ephemeris'
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

describe('eclipses', () => {
  const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

  function run(type: EclipseType, from: number, n: number): string[] {
    const out: string[] = []
    let ms = from
    for (let i = 0; i < n; i++) {
      const e = nextEclipse(type, ms)
      out.push(`${day(e.peak)} ${e.kind}`)
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

  it('says where a solar eclipse falls', () => {
    const e = nextEclipse('solar', Date.UTC(2024, 3, 1))
    // Greatest eclipse was over Nazas, Mexico.
    expect(e.where?.lat).toBeCloseTo(25.3, 0)
    expect(e.where?.lon).toBeCloseTo(-104.1, 0)
  })
})
