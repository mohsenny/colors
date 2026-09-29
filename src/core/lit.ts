/**
 * The lit area.
 *
 * One rectangle, in the normalised height units the simulation works in: y runs
 * 0 to 1 and x runs 0 to aspect. Everything that used to repeat the four wall
 * literals reads this instead. There were seven copies of them before crowding
 * (two in the resolver, two in depenetrate, three sets of placement insets),
 * which was harmless only for as long as the room never changed shape.
 */

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
 * How far a span of half-extent `h` centred on `c` has to move to sit inside
 * [lo, hi]. Zero when it already does.
 *
 * The degenerate case is the one worth writing down: when the room is narrower
 * than the sheet, the answer is to centre it and not to push it. A push
 * satisfies one edge by violating the other, and the two-pass resolver then
 * swaps which edge is violated on every pass for as long as the paper is in.
 */
export function containAxis(c: number, h: number, lo: number, hi: number): number {
  if (hi - lo < 2 * h) return (lo + hi) / 2 - c
  if (c - h < lo) return lo - (c - h)
  if (c + h > hi) return hi - (c + h)
  return 0
}
