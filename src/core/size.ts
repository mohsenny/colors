/**
 * How big a slide is allowed to be. One module because three places need the
 * same answer and they must not drift apart: the initial layout, the pointer
 * drag on the corner grip, and the relayout that follows a window resize.
 */

import {
  SIZE_FRAC_MAX,
  SIZE_FRAC_MIN,
  SIZE_FRAC_ONE,
  SIZE_FRAC_ONE_SMALL,
  SIZE_PX_MAX,
  SIZE_PX_MIN,
  SIZE_PX_MIN_CAP_FRAC,
  SMALL_VIEWPORT,
} from './constants'

export interface SideBand {
  /** Shortest a side may be, in CSS px. */
  min: number
  /** Longest a side may be, in CSS px. */
  max: number
}

/**
 * The legal length of one side, for a viewport whose short edge is `short` px.
 * Applied per side rather than to the area, which is what lets a slide be a
 * letterbox: the two sides are clamped independently and neither knows about
 * the other.
 *
 * Three rules, in the order they win:
 *
 *  - never below SIZE_FRAC_MIN of the short edge, so slides do not turn into
 *    confetti on a very large monitor;
 *  - never below SIZE_PX_MIN, which is the readability floor, except that on a
 *    small viewport the floor yields to SIZE_PX_MIN_CAP_FRAC rather than eating
 *    half the stage;
 *  - never above SIZE_PX_MAX or SIZE_FRAC_MAX of the short edge.
 */
export function sideBand(short: number): SideBand {
  const s = Math.max(1, short)
  const min = Math.max(s * SIZE_FRAC_MIN, Math.min(SIZE_PX_MIN, s * SIZE_PX_MIN_CAP_FRAC))
  const max = Math.max(min, Math.min(SIZE_PX_MAX, s * SIZE_FRAC_MAX))
  return { min, max }
}

/**
 * One side, clamped into the band, independently of the other. This is the
 * live-drag rule: pulling the grip past the floor on one axis just stops that
 * axis and leaves the other alone.
 */
export function clampSide(px: number, band: SideBand): number {
  if (!Number.isFinite(px)) return band.min
  return Math.min(band.max, Math.max(band.min, px))
}

/**
 * The size a sheet is cut to before anybody resizes it, as a fraction of the
 * short edge. The px band decides and the fraction follows: on a phone the
 * plain fraction lands under the readable floor, and on a very large monitor a
 * 30% sheet would cover most of the box.
 *
 * A function of the screen only, never of the count: a sheet arriving must not
 * resize the eleven already on the glass.
 *
 * It lives here rather than in the simulation because the stage needs the same
 * number: the strip of lit surface that takes hold of the paper is one stock
 * sheet wide, and a target that drifted from the thing it is sized after would
 * be a target nobody could learn.
 */
export function stockSizeFrac(short: number): number {
  const frac = short < SMALL_VIEWPORT ? SIZE_FRAC_ONE_SMALL : SIZE_FRAC_ONE
  const px = clampSide(frac * short, sideBand(short))
  const f = px / short
  return f < SIZE_FRAC_MIN ? SIZE_FRAC_MIN : f > SIZE_FRAC_MAX ? SIZE_FRAC_MAX : f
}

/**
 * Both sides into the band WITHOUT changing the shape, by scaling them
 * together. This is the relayout rule, and it has to be a different rule from
 * `clampSide`: a slide the user pulled into a letterbox and then a window
 * resize that squeezed the band would have had its long side clipped and its
 * short side left alone, which silently squares the slide up behind the user's
 * back. Uniform scaling gives up size instead of shape.
 *
 * The aspect is compressed first, and only if it is more extreme than the band
 * itself can express: at that point no uniform scale fits, and the shape has to
 * give.
 */
export function fitSides(wPx: number, hPx: number, band: SideBand): { w: number; h: number } {
  if (!(wPx > 0) || !(hPx > 0)) return { w: band.min, h: band.min }
  const limit = band.max / band.min
  const mean = Math.sqrt(wPx * hPx)
  const root = Math.sqrt(Math.min(limit, Math.max(1 / limit, wPx / hPx)))
  let w = mean * root
  let h = mean / root
  const grow = band.min / Math.min(w, h)
  if (grow > 1) {
    w *= grow
    h *= grow
  }
  const shrink = band.max / Math.max(w, h)
  if (shrink < 1) {
    w *= shrink
    h *= shrink
  }
  return { w, h }
}
