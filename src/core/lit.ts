/**
 * The lit area.
 *
 * One rectangle, in the normalised height units the simulation works in: y runs
 * 0 to 1 and x runs 0 to aspect. Everything that used to repeat the four wall
 * literals reads this instead. There were seven copies of them before crowding
 * (two in the resolver, two in depenetrate, three sets of placement insets),
 * which was harmless only for as long as the room never changed shape.
 */

import { CROWD_SLACK } from './constants'

/** Edges of the lit surface, in height units. */
export interface LitRect {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * The room, with `crowd` of the width taken by paper.
 *
 * Left edge only. `shadowStack` casts down and to the right, so a left-edge
 * sheet of paper is the one that reuses the existing shadow vocabulary verbatim
 * rather than needing a second set of offsets tuned the other way.
 */
export function litRect(aspect: number, crowd: number): LitRect {
  const c = crowd < 0 ? 0 : crowd > 1 ? 1 : crowd
  return { x0: aspect * c, x1: aspect, y0: 0, y1: 1 }
}

/**
 * How much lit floor there is, in height units squared. Derived from the rect
 * rather than from `aspect * (1 - crowd)`, which is the same number today and
 * would quietly stop being it the first time an edge other than the left one
 * moves.
 */
export function litArea(r: LitRect): number {
  return (r.x1 - r.x0) * (r.y1 - r.y0)
}

/**
 * The leading edge of the lit area in CSS px, measured from the left of the
 * stage. Off the rect rather than off `width * crowd`, so the renderer and the
 * gesture cannot disagree with the walls about where the room starts.
 */
export function litEdgePx(r: LitRect, vh: number): number {
  return r.x0 * vh
}

/**
 * Is a press at `xPx` on the strip of lit surface that takes hold of the paper?
 *
 * One stock sheet wide and measured inward from the leading edge, so the target
 * scales with the screen (243px at 1440x900) and is always the width of the
 * thing it is about to crowd. Not the paper itself: the paper takes no pointer,
 * and a gesture that started on it would be unreachable at crowd 0, which is
 * the only state the instrument is ever in when nobody has tried it yet.
 */
export function inPaperGrab(xPx: number, edgePx: number, reachPx: number): boolean {
  return xPx >= edgePx && xPx <= edgePx + reachPx
}

/**
 * Has a press on the grab strip travelled far enough to be a crowd drag?
 *
 * Horizontal travel and nothing else, because that is the only travel the
 * paper can answer. On the straight-line distance a tap that slid 6px down
 * the glass and 1px across armed the gesture, and on touch that is an
 * ordinary tap: it moved the paper two pixels, restarted a paused
 * instrument, and swallowed the deselect the press owed.
 */
export function armsCrowd(dxPx: number, deadzonePx: number): boolean {
  return Math.abs(dxPx) >= deadzonePx
}

/**
 * Where a crowd drag has got to: the crowd at the press, plus the travel since.
 *
 * Relative to the press and not absolute, so the paper never jumps to the
 * pointer on the first move. In fractions of the width rather than px, because
 * a window resized mid-sitting must keep the same proportion of room rather
 * than the same number of pixels of paper.
 */
export function crowdFromDrag(crowdAtPress: number, dxPx: number, widthPx: number): number {
  if (!(widthPx > 0)) return crowdAtPress
  const v = crowdAtPress + dxPx / widthPx
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** A crowd drag in progress. The stage owns one of these; this module runs it. */
export interface CrowdDrag {
  /** How far the paper was in when the pointer went down. */
  readonly crowd0: number
  /** True once horizontal travel has turned the press into a drag. */
  armed: boolean
  /** True once the room has actually changed width. */
  moved: boolean
}

/**
 * One pointer move of a crowd drag: the crowd to ask for, or null while the
 * press is still only a press.
 */
export function crowdDragTo(
  drag: CrowdDrag,
  dxPx: number,
  widthPx: number,
  deadzonePx: number,
): number | null {
  if (!drag.armed) {
    if (!armsCrowd(dxPx, deadzonePx)) return null
    drag.armed = true
  }
  return crowdFromDrag(drag.crowd0, dxPx, widthPx)
}

/**
 * What the room actually became, folded back in.
 *
 * Asked for and got are two different numbers, because the gesture is capped:
 * a hand that keeps pushing at the cap is armed and has moved nothing. Only
 * `moved` may decide the ending, and it latches, so a drag that goes out and
 * comes back to where it started is still a drag and not a click.
 */
export function crowdLanded(drag: CrowdDrag, applied: number): void {
  if (applied !== drag.crowd0) drag.moved = true
}

/** Enough of a sheet to say how wide a room has to be to hold it. */
export interface Spanned {
  w: number
  h: number
  rot: number
}

/**
 * Half the width of the upright box around a leaning sheet, tab included.
 *
 * The one copy of this. The wall resolver contains this box and the gesture
 * cap below refuses to make a room narrower than it, so the two have to agree
 * to the last bit: a cap computed off the bare `w` would stop the paper a
 * lean's worth short of the wall the sheets are actually held by.
 */
export function halfSpanX(w: number, h: number, rot: number, proud: number): number {
  return (Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * (h + proud)) / 2
}

/** The widest sheet on the glass, as the walls measure it. Zero for none. */
export function widestSpan(sheets: readonly Spanned[], proud: number): number {
  let widest = 0
  for (const s of sheets) {
    const span = 2 * halfSpanX(s.w, s.h, s.rot, proud)
    if (span > widest) widest = span
  }
  return widest
}

/**
 * The furthest in the gesture may push the paper, in the same 0 to 1 the drag
 * produces.
 *
 * `crowd` was clamped to 1, which is a room of zero width, and the last
 * fifteen per cent of that travel was all failure: the room goes narrower than
 * a sheet, `containAxis` has to centre rather than push, and the composition
 * becomes one column of identical mounts each with its right-hand part cropped
 * off by the window. The grab strip goes with it, because the strip is the lit
 * surface and there is none left, so at crowd 0.998 the only way back out is a
 * reload, which spends the seed.
 *
 * So the end of the gesture is the physical one: the room never goes narrower
 * than the widest sheet in it, nor than the stock sheet the grab strip is cut
 * to, plus CROWD_SLACK of that. One sheet's width of lit surface always
 * survives, the strip is always a full sheet wide, and the centring branch is
 * unreachable by pointer.
 *
 * Measured on a settled eight-sheet field: 0.826 at 1920x1080, which leaves
 * 1586px of paper and a 334px room against a widest sheet of 318px; 0.807 at
 * 1440x900; 0.870 at 2560x1080; 0.757 at 1280x1024; 0.686 at 1000x1000 with
 * twelve; and 0.554 on a 390x780 phone, which is where the ugly end used to
 * begin at 0.601, one comfortable swipe in.
 *
 * Every argument comes off the simulation state the history ring carries
 * (aspect, and each sheet's w, h and rot), never off the pointer, so a seed
 * and a set of inputs still replay to the same frame.
 */
export function crowdCap(aspect: number, widest: number, stock: number): number {
  if (!(aspect > 0)) return 0
  const need = Math.max(widest, stock, 0) * (1 + CROWD_SLACK)
  const cap = 1 - need / aspect
  return cap < 0 ? 0 : cap > 1 ? 1 : cap
}

/**
 * What the room becomes when a gesture asks for `crowd`. A NaN takes the
 * paper back out, which is the safe direction: it is the state where the
 * handle is certainly reachable.
 */
export function crowdInside(crowd: number, cap: number): number {
  if (!(crowd > 0)) return 0
  return crowd > cap ? cap : crowd
}

/**
 * How far a span of half-extent `h` centred on `c` has to move to sit inside
 * [lo, hi]. Zero when it already does.
 *
 * The degenerate case is the one worth writing down: when the room is narrower
 * than the sheet, the answer is to centre it and not to push it. A push
 * satisfies one edge by violating the other, and the two-pass resolver then
 * swaps which edge is violated on every pass for as long as the paper is in.
 *
 * `crowdCap` now keeps the gesture out of that case, but the branch stays: a
 * window resized down while the paper is in, or a sheet dragged up to
 * SIZE_PX_MAX inside a room already closed, both still arrive here and still
 * need a stable answer.
 */
export function containAxis(c: number, h: number, lo: number, hi: number): number {
  if (hi - lo < 2 * h) return (lo + hi) / 2 - c
  if (c - h < lo) return lo - (c - h)
  if (c + h > hi) return hi - (c + h)
  return 0
}
