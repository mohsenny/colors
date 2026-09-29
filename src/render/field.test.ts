import { describe, expect, it } from 'vitest'
import { integrateField } from './paint'
import type { FieldRegion } from './paint'

/**
 * The region lattice the depth walk produces, built by hand so the answer is
 * known. `area` is the area of the INTERSECTION of the set, not of the part
 * only that set covers, which is the whole reason the inversion is needed.
 */
function region(mask: number, area: number, linear: [number, number, number]): FieldRegion {
  return { mask, area, linear, exclusive: 0 }
}

function levelsOf(...rs: FieldRegion[]): FieldRegion[][] {
  const out: FieldRegion[][] = []
  for (const r of rs) {
    let bits = 0
    for (let m = r.mask; m; m >>= 1) bits += m & 1
    const d = bits - 1
    while (out.length <= d) out.push([])
    ;(out[d] as FieldRegion[]).push(r)
  }
  return out
}

const WHITE: [number, number, number] = [1, 1, 1]
const BLACK: [number, number, number] = [0, 0, 0]

describe('the field the tubes take their colour from', () => {
  it('is white when nothing is on the lit surface', () => {
    const out: [number, number, number] = [0, 0, 0]
    const covered = integrateField([], 1000, out)
    expect(covered).toBe(0)
    expect(out).toEqual([1, 1, 1])
  })

  it('counts an overlap once, not once per subset that contains it', () => {
    // Two black sheets of 100 each, overlapping by 40. The union is 160, so
    // 160 of the 1000 is black and 840 is bare white. Summing the regions as
    // the walk hands them over would give 100 + 100 + 40 = 240, counting the
    // overlap three times over and making the field far too dark.
    const out: [number, number, number] = [0, 0, 0]
    const levels = levelsOf(
      region(0b01, 100, BLACK),
      region(0b10, 100, BLACK),
      region(0b11, 40, BLACK),
    )
    const covered = integrateField(levels, 1000, out)
    expect(covered).toBeCloseTo(0.16, 12)
    expect(out[0]).toBeCloseTo(0.84, 12)
  })

  it('splits a three-way pile into disjoint pieces that add back up', () => {
    // Three sheets, every pair overlapping and all three sharing a core.
    const levels = levelsOf(
      region(0b001, 100, BLACK),
      region(0b010, 100, BLACK),
      region(0b100, 100, BLACK),
      region(0b011, 30, BLACK),
      region(0b101, 25, BLACK),
      region(0b110, 20, BLACK),
      region(0b111, 10, BLACK),
    )
    const out: [number, number, number] = [0, 0, 0]
    const covered = integrateField(levels, 1000, out)

    // Inclusion-exclusion: 300 - 75 + 10 = 235.
    expect(covered * 1000).toBeCloseTo(235, 9)

    // And the pieces themselves must be the disjoint decomposition.
    const flat = levels.flat()
    const triple = flat.find((r) => r.mask === 0b111) as FieldRegion
    const pair = flat.find((r) => r.mask === 0b011) as FieldRegion
    const lone = flat.find((r) => r.mask === 0b001) as FieldRegion
    expect(triple.exclusive).toBeCloseTo(10, 9)
    // The 0b011 intersection is 30, of which 10 is shared with the third.
    expect(pair.exclusive).toBeCloseTo(20, 9)
    // 100 less the 30 and 25 it shares, plus back the 10 counted twice.
    expect(lone.exclusive).toBeCloseTo(55, 9)
    expect(flat.reduce((a, r) => a + r.exclusive, 0)).toBeCloseTo(235, 9)
  })

  it('weights a region by its area, not by how many regions there are', () => {
    // One big pale sheet and one small dark one. The field must land nearer
    // the pale one. A plain mean over regions would put it halfway.
    const out: [number, number, number] = [0, 0, 0]
    integrateField(levelsOf(region(0b01, 800, WHITE), region(0b10, 100, BLACK)), 1000, out)
    // 900 white (800 covered plus 100 bare) and 100 black, out of 1000.
    expect(out[0]).toBeCloseTo(0.9, 12)
  })

  it('never returns a negative area when the walk pruned a deep region', () => {
    // The walk drops any intersection under MIN_AREA, so a parent can be left
    // owing area to a child that was never recorded. It must not go negative.
    const out: [number, number, number] = [0, 0, 0]
    const levels = levelsOf(region(0b01, 10, BLACK), region(0b11, 12, BLACK))
    const covered = integrateField(levels, 100, out)
    expect(covered).toBeGreaterThanOrEqual(0)
    for (const r of levels.flat()) expect(r.exclusive).toBeGreaterThanOrEqual(0)
    expect(out[0]).toBeGreaterThanOrEqual(0)
    expect(out[0]).toBeLessThanOrEqual(1)
  })

  it('is fully covered and fully coloured when the sheets fill the surface', () => {
    const out: [number, number, number] = [0, 0, 0]
    const covered = integrateField(levelsOf(region(0b01, 1000, BLACK)), 1000, out)
    expect(covered).toBeCloseTo(1, 12)
    expect(out[0]).toBeCloseTo(0, 12)
  })
})
