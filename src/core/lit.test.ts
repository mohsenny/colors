import { describe, expect, it } from 'vitest'
import {
  armsCrowd,
  containAxis,
  crowdCap,
  crowdDragTo,
  crowdFromDrag,
  crowdInside,
  crowdLanded,
  halfSpanX,
  inPaperGrab,
  litArea,
  litEdgePx,
  litRect,
  widestSpan,
} from './lit'
import { CROWD_SLACK, TAB_PROUD } from './constants'
import { stockSizeFrac } from './size'

const A = 1440 / 900

describe('litRect', () => {
  it('is the whole box when no paper is in', () => {
    const r = litRect(A, 0)
    expect(r.x0).toBe(0)
    expect(r.x1).toBe(A)
    expect(r.y0).toBe(0)
    expect(r.y1).toBe(1)
  })

  it('takes width from the left and nowhere else', () => {
    for (const crowd of [0.1, 0.25, 0.5, 0.75, 1]) {
      const r = litRect(A, crowd)
      expect(r.x0).toBeCloseTo(A * crowd, 12)
      expect(r.x1).toBe(A)
      expect(r.y0).toBe(0)
      expect(r.y1).toBe(1)
    }
  })

  it('clamps, so a runaway pointer cannot invert the room', () => {
    expect(litRect(A, -3).x0).toBe(0)
    expect(litRect(A, 4).x0).toBe(A)
    expect(litRect(A, 4).x0).toBeLessThanOrEqual(litRect(A, 4).x1)
  })

  it('is bit identical to the literals it replaced at crowd 0', () => {
    // The whole feature rests on this: the wall arithmetic has to produce the
    // same floats it did when the four edges were written out by hand, or
    // trajectories diverge at 1e-17 and every seeded test drifts.
    const r = litRect(A, 0)
    expect(r.x0 + 0.06).toBe(0.06)
    expect(r.y1 - 0.04).toBe(0.96)
    expect((r.x0 + r.x1) / 2).toBe(A / 2)
    expect((r.y0 + r.y1) / 2).toBe(0.5)
  })
})

describe('litArea', () => {
  it('shrinks with the room and reaches zero, never below', () => {
    expect(litArea(litRect(A, 0))).toBeCloseTo(A, 12)
    expect(litArea(litRect(A, 0.5))).toBeCloseTo(A / 2, 12)
    expect(litArea(litRect(A, 1))).toBe(0)
    expect(litArea(litRect(A, 3))).toBe(0)
  })
})

describe('the crowd gesture', () => {
  // 1440x900: the leading edge is at crowd * 1440, and the strip that grabs it
  // is one stock sheet, 0.27 * 900.
  const reach = stockSizeFrac(900) * 900

  it('reaches one stock sheet in from the edge and no further', () => {
    expect(reach).toBeCloseTo(243, 9)
    const edge = litEdgePx(litRect(A, 0), 900)
    expect(inPaperGrab(0, edge, reach)).toBe(true)
    expect(inPaperGrab(242, edge, reach)).toBe(true)
    expect(inPaperGrab(244, edge, reach)).toBe(false)
    expect(inPaperGrab(720, edge, reach)).toBe(false)
  })

  it('travels with the paper, so the handle is always the lit edge', () => {
    const edge = litEdgePx(litRect(A, 0.25), 900)
    expect(edge).toBeCloseTo(360, 9)
    // Behind the edge is paper, which is not a surface anything can be pressed
    // on: the gesture starts on lit surface at every crowd value.
    expect(inPaperGrab(200, edge, reach)).toBe(false)
    expect(inPaperGrab(400, edge, reach)).toBe(true)
    expect(inPaperGrab(700, edge, reach)).toBe(false)
  })

  it('moves the paper exactly as far as the hand', () => {
    expect(crowdFromDrag(0, 360, 1440)).toBeCloseTo(0.25, 12)
    expect(crowdFromDrag(0.25, 360, 1440)).toBeCloseTo(0.5, 12)
    // Backwards takes it out again, and a drag that ends where it started
    // leaves the room exactly as it was rather than one epsilon off.
    expect(crowdFromDrag(0.5, -720, 1440)).toBeCloseTo(0, 12)
    expect(crowdFromDrag(0.31, 0, 1440)).toBe(0.31)
  })

  it('cannot invert the room however far the hand goes', () => {
    expect(crowdFromDrag(0.5, 9000, 1440)).toBe(1)
    expect(crowdFromDrag(0.5, -9000, 1440)).toBe(0)
    // A viewport measured as zero must not hand NaN to the walls.
    expect(crowdFromDrag(0.4, 100, 0)).toBe(0.4)
  })

  it('keeps the proportion through a resize, not the pixels', () => {
    // The same 10% of the width on both screens, which is what makes crowd a
    // fraction rather than a paper width in px.
    expect(crowdFromDrag(0.2, 144, 1440)).toBeCloseTo(0.3, 12)
    expect(crowdFromDrag(0.2, 80, 800)).toBeCloseTo(0.3, 12)
  })
})

describe('where the gesture ends', () => {
  /** Stock sheets on three screens: [name, aspect, height, short]. */
  const SCREENS: ReadonlyArray<readonly [string, number, number, number]> = [
    ['1920x1080', 1920 / 1080, 1080, 1080],
    ['1440x900', A, 900, 900],
    ['390x780', 390 / 780, 780, 390],
  ]

  function stockFor(height: number, short: number): number {
    return (stockSizeFrac(short) * short) / height
  }

  it('measures a sheet as the box the walls hold, lean and tab included', () => {
    // Upright, so the span is the width and the tab hangs off the top only.
    expect(2 * halfSpanX(0.27, 0.27, 0, 14 / 1080)).toBeCloseTo(0.27, 12)
    // Leaning 5 degrees, which is TILT_DEG: 292px of sheet needs 318px of room.
    const leaning = 2 * halfSpanX(0.27, 0.27, (5 * Math.PI) / 180, TAB_PROUD / 1080)
    expect(leaning * 1080).toBeCloseTo(317.1, 1)
    // Sign of the lean cannot matter, and neither can a half turn.
    expect(halfSpanX(0.27, 0.3, -0.4, 0.01)).toBeCloseTo(halfSpanX(0.27, 0.3, 0.4, 0.01), 12)
    expect(halfSpanX(0.27, 0.3, Math.PI + 0.4, 0.01)).toBeCloseTo(
      halfSpanX(0.27, 0.3, 0.4, 0.01),
      12,
    )
  })

  it('takes the widest sheet and not the first or the average', () => {
    const sheets = [
      { w: 0.2, h: 0.2, rot: 0 },
      { w: 0.5, h: 0.2, rot: 0 },
      { w: 0.3, h: 0.3, rot: 0 },
    ]
    expect(widestSpan(sheets, 0)).toBeCloseTo(0.5, 12)
    expect(widestSpan([], 0)).toBe(0)
  })

  it('always leaves a sheet of lit surface, at every shape and count', () => {
    for (const [, aspect, height, short] of SCREENS) {
      const stock = stockFor(height, short)
      for (const count of [3, 8, 12]) {
        const sheets = Array.from({ length: count }, (_, i) => ({
          w: stock,
          h: stock,
          // The band of resting leans, so the widest is a leaning one.
          rot: ((i - count / 2) * 5 * Math.PI) / 180 / count,
        }))
        const widest = widestSpan(sheets, TAB_PROUD / height)
        const cap = crowdCap(aspect, widest, stock)
        const room = litRect(aspect, cap).x1 - litRect(aspect, cap).x0
        // The room still holds the widest sheet, so `containAxis` pushes
        // rather than centres, and still holds the whole grab strip.
        expect(room).toBeGreaterThan(widest)
        expect(room).toBeGreaterThan(stock)
        expect(room).toBeCloseTo(Math.max(widest, stock) * (1 + CROWD_SLACK), 12)
        expect(cap).toBeLessThan(1)
      }
    }
  })

  it('stops the paper where the measurements say it should', () => {
    // A settled eight-sheet field, spans taken off the simulation itself.
    expect(crowdCap(1920 / 1080, 0.2945, 0.27)).toBeCloseTo(0.826, 3)
    expect(crowdCap(A, 0.2948, 0.27)).toBeCloseTo(0.8066, 3)
    // The portrait phone, where the old degenerate end began at 0.601.
    expect(crowdCap(390 / 780, 0.2121, 0.2)).toBeCloseTo(0.5545, 3)
    expect(crowdCap(390 / 780, 0.2121, 0.2)).toBeLessThan(0.601)
  })

  it('never returns a room the sheet cannot be in, however odd the input', () => {
    // A sheet wider than the whole box: no paper at all is the only answer.
    expect(crowdCap(1, 2, 0.27)).toBe(0)
    expect(crowdCap(0, 0.27, 0.27)).toBe(0)
    expect(crowdCap(Number.NaN, 0.27, 0.27)).toBe(0)
    // Nothing on the glass yet still leaves the strip its stock sheet.
    expect(crowdCap(A, 0, 0.27)).toBeCloseTo(1 - (0.27 * 1.05) / A, 12)
  })

  it('holds a gesture inside the cap and outside a negative room', () => {
    expect(crowdInside(0.4, 0.83)).toBe(0.4)
    expect(crowdInside(0.9, 0.83)).toBe(0.83)
    expect(crowdInside(1, 0.83)).toBe(0.83)
    expect(crowdInside(-2, 0.83)).toBe(0)
    expect(crowdInside(Number.NaN, 0.83)).toBe(0)
    // Idempotent, which is what lets the caller compare against the value it
    // is holding and do nothing when the gesture asks for no change.
    expect(crowdInside(crowdInside(0.9, 0.83), 0.83)).toBe(crowdInside(0.9, 0.83))
  })

  it('arms on travel the paper can answer and on no other', () => {
    // The tap from the report: 7px of travel, 6 of it down the glass.
    expect(armsCrowd(1, 6)).toBe(false)
    expect(Math.hypot(1, 6)).toBeGreaterThan(6)
    expect(armsCrowd(6, 6)).toBe(true)
    expect(armsCrowd(-6, 6)).toBe(true)
    expect(armsCrowd(-5.9, 6)).toBe(false)
    expect(armsCrowd(0, 6)).toBe(false)
  })
})

describe('a crowd drag from press to release', () => {
  const W = 1440
  const DEADZONE = 6
  const CAP = 0.8066

  /** The drag, run to the end. `x` are client px, the press at 0. */
  function gesture(crowd0: number, xs: readonly number[]) {
    const drag = { crowd0, armed: false, moved: false }
    const asks: Array<number | null> = []
    for (const x of xs) {
      const asked = crowdDragTo(drag, x, W, DEADZONE)
      asks.push(asked)
      if (asked === null) continue
      crowdLanded(drag, crowdInside(asked, CAP))
    }
    return { drag, asks, ending: drag.moved ? 'crowd end' : 'deselect' }
  }

  it('leaves a tap alone, however far down the glass the thumb slid', () => {
    // The press that broke it: inside the strip, 7px of travel, 6 vertical.
    // Vertical travel is not in the arithmetic at all, so the whole tap is
    // one dx of 1px: nothing is asked for, so nothing commits a branch,
    // nothing forces a paused instrument live, and the release still
    // deselects the sheet the user had selected.
    const { drag, asks, ending } = gesture(0, [0, 1, 1])
    expect(asks.every((a) => a === null)).toBe(true)
    expect(drag.armed).toBe(false)
    expect(drag.moved).toBe(false)
    expect(ending).toBe('deselect')
  })

  it('moves the paper once the hand travels sideways', () => {
    const { drag, asks, ending } = gesture(0, [3, 10, 144])
    expect(asks[0]).toBe(null)
    expect(asks[1]).toBeCloseTo(10 / W, 12)
    expect(asks[2]).toBeCloseTo(0.1, 12)
    expect(drag.moved).toBe(true)
    expect(ending).toBe('crowd end')
  })

  it('still deselects when a drag ran the paper against the cap', () => {
    // Pressed with the room already at its cap and shoved to the right edge
    // of the window. Armed, 700px of travel, and the room never changed, so
    // the press was a press on bare lightbox and owes the deselect.
    const { drag, ending } = gesture(CAP, [40, 300, 700])
    expect(drag.armed).toBe(true)
    expect(drag.moved).toBe(false)
    expect(ending).toBe('deselect')
  })

  it('counts a drag that came back to where it started as a drag', () => {
    const { drag, ending } = gesture(0.3, [60, 200, 0])
    expect(drag.moved).toBe(true)
    expect(ending).toBe('crowd end')
  })
})

describe('containAxis', () => {
  it('leaves a span that already fits alone', () => {
    expect(containAxis(0.5, 0.2, 0, 1)).toBe(0)
    expect(containAxis(0.2, 0.2, 0, 1)).toBe(0)
  })

  it('pushes a span back off each edge exactly', () => {
    expect(containAxis(0.1, 0.2, 0, 1)).toBeCloseTo(0.1, 12)
    expect(containAxis(0.95, 0.2, 0, 1)).toBeCloseTo(-0.15, 12)
  })

  it('centres rather than pushes when the room is narrower than the span', () => {
    // A push satisfies one edge by breaking the other, and the resolver then
    // swaps which edge is broken on every pass for as long as the paper is in.
    const d = containAxis(0.1, 0.5, 0.4, 0.8)
    expect(0.1 + d).toBeCloseTo(0.6, 12)
  })

  it('is settled after one correction, from either side', () => {
    for (const lo of [0, 0.3, 1.2]) {
      for (const h of [0.05, 0.3, 0.9]) {
        for (const c of [-1, 0.2, 0.55, 1.4, 9]) {
          const hi = lo + 0.5
          const moved = c + containAxis(c, h, lo, hi)
          expect(containAxis(moved, h, lo, hi)).toBeCloseTo(0, 12)
        }
      }
    }
  })
})
