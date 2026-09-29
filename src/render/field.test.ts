import { describe, expect, it } from 'vitest'
import { clipToRect, integrateField, shoelace } from './paint'
import type { FieldRegion } from './paint'
import { containAxis, litRect } from '../core/lit'

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

  it('gives a lone sheet its own area and nothing else', () => {
    const out: [number, number, number] = [0, 0, 0]
    const shares = new Float64Array(4)
    integrateField(levelsOf(region(0b01, 250, BLACK)), 1000, out, shares)
    expect(shares[0]).toBeCloseTo(0.25, 12)
    expect(shares[1]).toBe(0)
  })

  it('splits the crossing equally and never past the covered fraction', () => {
    // Two sheets of 100 crossing by 40. Each keeps its 60 of open sheet and
    // takes half of the 40, so each is 80 of 1000. Handing the crossing to a
    // topmost sheet would make one of them 100 and the other 60, and there is
    // no topmost sheet in this renderer to ask.
    const out: [number, number, number] = [0, 0, 0]
    const shares = new Float64Array(4)
    const levels = levelsOf(
      region(0b01, 100, BLACK),
      region(0b10, 100, BLACK),
      region(0b11, 40, BLACK),
    )
    const covered = integrateField(levels, 1000, out, shares)
    expect(shares[0]).toBeCloseTo(0.08, 12)
    expect(shares[1]).toBeCloseTo(0.08, 12)
    expect((shares[0] as number) + (shares[1] as number)).toBeCloseTo(covered, 12)
  })

  it('dilutes every sheet as another one joins, while the total climbs', () => {
    // The reading the tab is for, and the one thing credit-1/k guarantees that
    // "the topmost sheet owns the region" does not. Two sheets of 300 in a
    // room of 1000 crossing by 150, then a third crossing each of them by 150
    // with all three sharing 60.
    const out: [number, number, number] = [0, 0, 0]
    const two = new Float64Array(4)
    const coveredTwo = integrateField(
      levelsOf(region(0b001, 300, BLACK), region(0b010, 300, BLACK), region(0b011, 150, BLACK)),
      1000,
      out,
      two,
    )
    const three = new Float64Array(4)
    const coveredThree = integrateField(
      levelsOf(
        region(0b001, 300, BLACK),
        region(0b010, 300, BLACK),
        region(0b100, 300, BLACK),
        region(0b011, 150, BLACK),
        region(0b101, 150, BLACK),
        region(0b110, 150, BLACK),
        region(0b111, 60, BLACK),
      ),
      1000,
      out,
      three,
    )
    // 150 of open sheet plus half of the 150 crossing, of 1000.
    expect(two[0]).toBeCloseTo(0.225, 12)
    expect(coveredTwo).toBeCloseTo(0.45, 12)
    // 60 open, half of each of two crossings, a third of the core.
    expect(three[0]).toBeCloseTo(0.17, 12)
    expect(three[0]).toBeLessThan(two[0] as number)
    expect(three[1]).toBeLessThan(two[1] as number)
    expect(coveredThree).toBeGreaterThan(coveredTwo)
    const sum = (three[0] as number) + (three[1] as number) + (three[2] as number)
    expect(sum).toBeCloseTo(coveredThree, 12)
  })

  it('zeroes a stale share rather than leaving it on the tab', () => {
    const out: [number, number, number] = [0, 0, 0]
    const shares = new Float64Array(4)
    shares[2] = 0.42
    integrateField(levelsOf(region(0b01, 250, BLACK)), 1000, out, shares)
    expect(shares[2]).toBe(0)
  })

  it('gives every sheet zero when there is no lit surface left', () => {
    const out: [number, number, number] = [0, 0, 0]
    const shares = new Float64Array(4)
    integrateField(levelsOf(region(0b01, 250, BLACK), region(0b10, 250, BLACK)), 0, out, shares)
    expect(shares[0]).toBe(0)
    expect(shares[1]).toBe(0)
  })

  it('is fully covered and fully coloured when the sheets fill the surface', () => {
    const out: [number, number, number] = [0, 0, 0]
    const covered = integrateField(levelsOf(region(0b01, 1000, BLACK)), 1000, out)
    expect(covered).toBeCloseTo(1, 12)
    expect(out[0]).toBeCloseTo(0, 12)
  })
})

/** An upright sheet's interior quad, flat xy pairs, as `collect` builds it. */
function quad(cx: number, cy: number, hw: number, hh: number): number[] {
  return [cx - hw, cy - hh, cx + hw, cy - hh, cx + hw, cy + hh, cx - hw, cy + hh]
}

/*
 * 1440x900, which puts a stock sheet at 0.27 * 900 less two 7px frames, so
 * 229px of film. At crowd 0.9 the room is 144px wide: narrower than the sheet,
 * which is the state `containAxis` answers by centring rather than pushing.
 */
const VH = 900
const A = 1440 / 900
const SHEET = 229

describe('the areas the field is integrated over', () => {
  it('leaves a sheet that is already inside the room untouched', () => {
    const r = litRect(A, 0.5)
    const p = quad(1000, 450, 100, 120)
    expect(clipToRect(p, r.x0 * VH, r.y0 * VH, r.x1 * VH, r.y1 * VH)).toEqual(p)
  })

  it('counts only the lit part of a sheet the narrow room had to centre', () => {
    const r = litRect(A, 0.9)
    const x0 = r.x0 * VH
    const x1 = r.x1 * VH
    const cx = 1000 + containAxis(1000, SHEET / 2, x0, x1)
    const whole = quad(cx, 450, SHEET / 2, SHEET / 2)
    // Centred in a room narrower than itself, so it hangs over BOTH walls and
    // the right-hand overhang is off the stage entirely.
    expect(shoelace(whole)).toBeCloseTo(SHEET * SHEET, 6)
    expect(shoelace(clipToRect(whole, x0, r.y0 * VH, x1, r.y1 * VH))).toBeCloseTo(
      (x1 - x0) * SHEET,
      6,
    )
  })

  it('clips every edge of the room and not only the one the paper moves', () => {
    const r = litRect(A, 0.9)
    const tall = quad(1368, 450, 60, VH)
    const lit = clipToRect(tall, r.x0 * VH, r.y0 * VH, r.x1 * VH, r.y1 * VH)
    expect(shoelace(lit)).toBeCloseTo(120 * VH, 6)
  })

  it('cannot report more surface than a narrow room has', () => {
    // Three stacked sheets, each centred by the walls and each overhanging.
    // Unclipped they measure 157,323px of a 129,600px room, so the coverage
    // reads 121%, every share is inflated with it, and the bare term
    // `litArea - covered` goes negative and drops the white surface out of
    // the average: the field brightens as the room closes, which is backwards.
    const r = litRect(A, 0.9)
    const x0 = r.x0 * VH
    const x1 = r.x1 * VH
    const room = (x1 - x0) * VH
    const cx = 1000 + containAxis(1000, SHEET / 2, x0, x1)
    const clipped: FieldRegion[] = []
    const raw: FieldRegion[] = []
    for (let i = 0; i < 3; i++) {
      const whole = quad(cx, 150 + i * 280, SHEET / 2, SHEET / 2)
      clipped.push(region(1 << i, shoelace(clipToRect(whole, x0, r.y0 * VH, x1, r.y1 * VH)), BLACK))
      raw.push(region(1 << i, shoelace(whole), BLACK))
    }

    const out: [number, number, number] = [0, 0, 0]
    const shares = new Float64Array(4)
    const covered = integrateField(levelsOf(...clipped), room, out, shares)
    expect(covered).toBeCloseTo((3 * (x1 - x0) * SHEET) / room, 12)
    expect(covered).toBeLessThan(1)
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of out) expect(v).toBeLessThanOrEqual(1)
    // Black sheets on white, so the field is exactly the bare fraction.
    expect(out[0]).toBeCloseTo(1 - covered, 12)
    const sum = (shares[0] as number) + (shares[1] as number) + (shares[2] as number)
    expect(sum).toBeCloseTo(covered, 12)

    const bad = integrateField(levelsOf(...raw), room, out)
    expect(bad).toBeGreaterThan(1.2)
  })
})
