import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../sky/ephemeris'
import { FOV, LOW, across, add, backOf, frameOf, norm, project, scale, seatEye, sub } from './camera'
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
      const eye = seatEye(seat, 1, [1e9, 3e8, 1e8], 0, 0.4, low)
      expect(horizonY(eye, seat, 1)).toBeCloseTo(at(low), -1)
    }
  })

  it('allows for a target only a few dozen radii off, through a narrow lens', () => {
    // The Sun looking at Mercury: 83 of its radii away, through a lens of a few hundredths of a degree.
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [0, 83, 0]
    const z = Math.log((0.04 * Math.PI) / 180 / FOV)
    const eye = seatEye(seat, 1, target, z, 0, LOW)
    expect(horizonY(eye, seat, 1)).toBeCloseTo(at(LOW), -1)
  })

  it('looks over the air rather than through it when the lens is narrow', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [6e9, 0, 0]
    const air = 0.014
    // Wide: the ground's horizon stays where it was asked.
    const wide = seatEye(seat, 1, target, 0, 0, LOW, air)
    expect(horizonY(wide, seat, 1)).toBeCloseTo(at(LOW), -1)
    // Narrow: the top of the air sits below the target.
    const z = Math.log((0.075 * Math.PI) / 180 / FOV)
    const narrow = seatEye(seat, 1, target, z, 0, LOW, air)
    expect(horizonY(narrow, seat, 1, air)).toBeGreaterThan(H / 2 + 0.1 * H)
  })

  it('backs away without losing the target', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [1e9, 0, 0]
    const eye = seatEye(seat, 1, target, 3, 0, LOW)
    expect(Math.hypot(...eye.at)).toBeCloseTo(backOf(3), 6)
    const fr = frameOf(eye, 1)
    const p = project(fr, norm(sub(target, eye.at)), H, H)
    expect(p?.[0]).toBeCloseTo(H / 2, 6)
    expect(p?.[1]).toBeCloseTo(H / 2, 6)
  })
})
