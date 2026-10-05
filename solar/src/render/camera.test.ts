import { describe, expect, it } from 'vitest'
import { AU_KM } from '../sky/bodies'
import type { Vec3 } from '../sky/ephemeris'
import {
  FOV,
  LOW,
  RISE_MAX,
  across,
  add,
  backOf,
  facing,
  frameOf,
  globeEye,
  norm,
  project,
  scale,
  seatEye,
  sub,
  zMax,
  zgMax,
} from './camera'
import type { Eye } from './camera'

const H = 1000

/** Where the seat's horizon, or a shell `lift` radii above it, crosses the middle column of the screen, in pixels from the top. */
function horizonY(eye: Eye, seat: Vec3, radius: number, lift = 0): number {
  const fr = frameOf(eye, 1)
  const toSeat = sub(seat, eye.at)
  const c = norm(toSeat)
  const L = Math.asin((radius * (1 + lift)) / Math.hypot(...toSeat))
  const side = across(fr.forward, c, fr.up)
  const p = project(fr, add(scale(c, Math.cos(L)), scale(side, Math.sin(L))), H, H)
  if (!p) throw new Error('horizon behind the eye')
  return p[1]
}

const at = (low: number): number => (H / 2) * (1 + low)

describe('sitting on a body', () => {
  it('puts the horizon where it is asked, below a target far away', () => {
    const seat: Vec3 = [0, 0, 0]
    for (const low of [0.2, LOW, 0.9]) {
      const eye = seatEye(seat, 1, [1e9, 3e8, 1e8], 0, 0.4, 0.1, 0, low)
      expect(horizonY(eye, seat, 1)).toBeCloseTo(at(low), -1)
    }
  })

  it('allows for a target only a few dozen radii off, through a narrow lens', () => {
    // The Sun looking at Mercury: 83 of its radii away, through a lens of a few hundredths of a degree.
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [0, 83, 0]
    const z = Math.log((0.04 * Math.PI) / 180 / FOV)
    const eye = seatEye(seat, 1, target, z, 0, 0)
    expect(horizonY(eye, seat, 1)).toBeCloseTo(at(LOW), -1)
  })

  it('looks over the air rather than through it when the lens is narrow', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [6e9, 0, 0]
    const air = 0.014
    // Wide: the ground's horizon stays where it was asked.
    const wide = seatEye(seat, 1, target, 0, 0, 0, air)
    expect(horizonY(wide, seat, 1)).toBeCloseTo(at(LOW), -1)
    // Narrow: the top of the air sits below the target.
    const z = Math.log((0.075 * Math.PI) / 180 / FOV)
    const narrow = seatEye(seat, 1, target, z, 0, 0, air)
    expect(horizonY(narrow, seat, 1, air)).toBeGreaterThan(H / 2 + 0.1 * H)
  })

  it('backs away without losing the target', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [1e9, 0, 0]
    const eye = seatEye(seat, 1, target, 3, 0, 0)
    expect(Math.hypot(...eye.at)).toBeCloseTo(backOf(3), 6)
    const fr = frameOf(eye, 1)
    const p = project(fr, norm(sub(target, eye.at)), H, H)
    expect(p?.[0]).toBeCloseTo(H / 2, 6)
    expect(p?.[1]).toBeCloseTo(H / 2, 6)
  })
})

describe('dragging round the seat', () => {
  const seat: Vec3 = [0, 0, 0]
  const moon = 1737
  const earth: Vec3 = [384_400, 0, 0]
  const px = (2 * Math.tan(FOV / 2)) / H

  it('turns the sky the way the hand moves', () => {
    // Swinging and rising by ten pixels' worth carries the target ten pixels right and down.
    const swung = seatEye(seat, moon, earth, 0, 10 * px, 0)
    const risen = seatEye(seat, moon, earth, 0, 0, 10 * px)
    const a = project(frameOf(swung, 1), norm(sub(earth, swung.at)), H, H)
    const b = project(frameOf(risen, 1), norm(sub(earth, risen.at)), H, H)
    expect(a?.[0]).toBeCloseTo(H / 2 + 10, 0)
    expect(b?.[1]).toBeCloseTo(H / 2 + 10, 0)
  })

  it('keeps you under the view, level, all the way round', () => {
    for (const swing of [0.7, Math.PI / 2, Math.PI, 4]) {
      const eye = seatEye(seat, moon, earth, 0, swing, 0)
      expect(horizonY(eye, seat, moon)).toBeCloseTo(at(LOW), -1)
      expect(project(frameOf(eye, 1), norm(sub(seat, eye.at)), H, H)?.[0]).toBeCloseTo(H / 2, 6)
    }
  })

  it('brings the Sun behind you round into view', () => {
    // On the Moon, the Earth ahead and the Sun behind: half way round, the Sun is ahead.
    const sun: Vec3 = [-1.5e8, 0, 0]
    const eye = seatEye(seat, moon, earth, 0, Math.PI, 0)
    const p = project(frameOf(eye, 1), norm(sub(sun, eye.at)), H, H)
    expect(p?.[0]).toBeCloseTo(H / 2, 6)
    expect(Math.abs((p?.[1] ?? 0) - H / 2)).toBeLessThan(10)
  })

  it('stops short of the poles of the sky', () => {
    expect(Math.asin(facing(earth, 0, 9)[2])).toBeCloseTo(RISE_MAX, 9)
    expect(Math.asin(facing(earth, 0, -9)[2])).toBeCloseTo(-RISE_MAX, 9)
  })
})

describe('backing away', () => {
  // On the Moon, the Earth toward the Sun.
  const moon = 1737
  const seat: Vec3 = [AU_KM, 0, 0]
  const earth: Vec3 = [AU_KM - 384_400, 0, 0]
  const neptune = Array.from({ length: 72 }, (_, i): Vec3 => {
    const t = (i / 72) * 2 * Math.PI
    return [31 * AU_KM * Math.cos(t), 31 * AU_KM * Math.sin(t), 0]
  })
  const fits = (eye: Eye): boolean =>
    neptune.every((p) => {
      const q = project(frameOf(eye, 1), norm(sub(p, eye.at)), H, H)
      return q !== null && q[0] > 0 && q[0] < H && q[1] > 0 && q[1] < H
    })

  it('goes far enough from even the Moon to fit the orbit of Neptune', () => {
    expect(fits(seatEye(seat, moon, earth, 0, 0, 0))).toBe(false)
    expect(fits(seatEye(seat, moon, earth, zMax(moon), 0, 0))).toBe(true)
    expect(fits(seatEye(seat, moon, earth, zMax(moon), 2, 1))).toBe(true)
    expect(fits(globeEye(seat, moon, zgMax(moon), 0.3, 1.2))).toBe(true)
  })
})
