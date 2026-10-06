import { TAB_PROUD, TAB_W } from '../../src/core/constants'
import type { Chapter } from './life'

/*
 * Where the sheets lie: one row, left to right in time, under the story and
 * over the dock. Everything here is in sheet widths (u) until `fit` turns it
 * into stage pixels, so the same life lays out on a phone and a wall and only
 * the camera differs.
 *
 * Across a desktop the row fits the width when it can and the camera holds
 * still. Under 620px a sheet is set by the phone's width instead, the row runs
 * off both sides, and the camera keeps the current sheet in the middle.
 */

/** The next sheet, from the last one's left edge. A tenth of a sheet clear, plus the room a lean takes. */
export const STEP = 1.12

/** Under this width the row is a strip that pans, the same break as the rest of the chrome. */
export const NARROW = 620

/** Clear of the story above, the dock below and the stage's sides. */
export const MARGIN = 40

/** A phone's margin above and below the band, half the desktop's: at 320x568 there is no room for more. */
export const MARGIN_NARROW = MARGIN / 2

/**
 * A sheet's width on screen, px, across a desktop. The smallest keeps a
 * 60px tab and some film beside it, and lets the row fit at 1024 (143px)
 * without panning. The largest is what 1920x1080 comes to by width, 279px,
 * with some to spare. A stage too short for the smallest, a phone on its
 * side, gets what its band holds with a phone's margins, down to a tab's
 * width: 82px at 844x390, where ui.css sets the story small.
 */
export const U_MIN = 120
export const U_MAX = 320

/** A phone's sheet, as a share of its width: at 390 a 215px sheet in the middle and 62px of each neighbour. */
export const PHONE_U = 0.55

/** The smallest a phone's sheet comes to when the story leaves it little height. */
export const PHONE_U_MIN = 100

/**
 * The current sheet stands up off the row by this much of a sheet, and grows
 * by this share: 12px and 8px at 1440, enough to read as picked up, and its
 * neighbours still a tenth of a sheet clear less the leans.
 */
export const LIFT = 0.06
export const GROW = 0.04

/** One sheet as laid: its centre in u along the row, and its lean in degrees. */
export interface Placed {
  along: number
  lean: number
}

/** The life in sheet widths, centres, in the chapters' own order, a step apart. */
export function place(chapters: readonly Chapter[]): Placed[] {
  return chapters.map((c, i) => ({ along: i * STEP + 0.5, lean: c.lean }))
}

/** How long the row is, in u: from the first sheet's near edge to the last one's far edge. */
export function length(placed: readonly Placed[]): number {
  let end = 0
  for (const p of placed) end = Math.max(end, p.along + 0.5)
  return end
}

/** The stage and the room left in it, px. `top` is the story's lower edge, `bottom` the dock's upper one. */
export interface Room {
  width: number
  height: number
  top: number
  bottom: number
}

/** How the life sits on this stage. */
export interface Fit {
  /** A sheet's width, px. */
  u: number
  /** A phone's strip, which keeps the current sheet in the middle. */
  narrow: boolean
  /** The band the row is laid in across the stage, px, and the height of its middle. */
  near: number
  far: number
  middle: number
  /** The row's length, u. */
  length: number
}

/**
 * The size of a sheet and where the row lies. The band is the room between
 * the story and the dock less a margin each side, and a sheet is as large as
 * fits it with its tab and its lift, and no wider than the width allows: the
 * row across the width less the margins on a desktop, 206px at 1440x900, and
 * a share of the width on a phone. The row lies in the middle of the band,
 * its tabs counted in.
 */
export function fit(room: Room, len: number): Fit {
  const narrow = room.width < NARROW
  const margin = narrow ? MARGIN_NARROW : MARGIN
  // Lifted, a sheet stands LIFT higher and grows GROW, half of it upward.
  const across = (band: number): number => (band - TAB_PROUD) / (1 + 2 * LIFT + GROW)
  const tall = across(room.bottom - room.top - 2 * margin)
  const wide = narrow ? room.width * PHONE_U : (room.width - 2 * MARGIN) / len
  // A desktop floor that the band cannot hold gives way to what fits it
  // with a phone's margins, so the row stays between the story and the dock.
  const floor = Math.max(TAB_W, Math.min(U_MIN, across(room.bottom - room.top - 2 * MARGIN_NARROW)))
  const u = narrow
    ? Math.max(PHONE_U_MIN, Math.min(wide, tall))
    : Math.min(U_MAX, Math.max(floor, Math.min(wide, tall)))
  const side = narrow ? 0 : MARGIN
  return {
    u,
    narrow,
    near: side,
    far: room.width - side,
    // The tab stands up off the sheet, so the sheet sits half a tab low, in
    // the middle of the room whichever margin it keeps.
    middle: (room.top + room.bottom + TAB_PROUD) / 2,
    length: len,
  }
}

/**
 * Where the camera looks, in u along. A phone keeps the sheet it is given in
 * the middle, from the first sheet's to the last one's. A desktop row that
 * fits the band is looked at whole, and one that does not is panned only as
 * far as keeps the band full, so a sheet at either end comes to rest at the
 * band's edge rather than in the middle of an empty stage.
 */
export function aim(f: Fit, along: number): number {
  if (f.narrow) return Math.min(f.length - 0.5, Math.max(0.5, along))
  const half = (f.far - f.near) / 2 / f.u
  if (f.length <= 2 * half) return f.length / 2
  return Math.min(f.length - half, Math.max(half, along))
}

/** A sheet on the stage: its centre, px, its side and its lean in radians. */
export interface Laid {
  x: number
  y: number
  side: number
  rot: number
}

/**
 * One placed sheet on the stage, with the camera looking at `camera` u along
 * and the sheet `lift` of the way up: 0 at rest, 1 the current one.
 */
export function toStage(f: Fit, p: Placed, camera: number, lift = 0): Laid {
  return {
    x: (f.near + f.far) / 2 + (p.along - camera) * f.u,
    y: f.middle - lift * LIFT * f.u,
    side: f.u * (1 + lift * GROW),
    rot: (p.lean * Math.PI) / 180,
  }
}

/** A laid sheet's four corners, clockwise from its top left, px. */
export function corners(s: Laid): number[] {
  const h = s.side / 2
  const cos = Math.cos(s.rot)
  const sin = Math.sin(s.rot)
  const out: number[] = []
  for (const [dx, dy] of [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ] as const) {
    out.push(s.x + dx * cos - dy * sin, s.y + dx * sin + dy * cos)
  }
  return out
}

/** Whether a stage point is on a laid sheet, mount included. */
export function inside(s: Laid, x: number, y: number): boolean {
  const dx = x - s.x
  const dy = y - s.y
  const cos = Math.cos(s.rot)
  const sin = Math.sin(s.rot)
  const h = s.side / 2
  return Math.abs(dx * cos + dy * sin) <= h && Math.abs(-dx * sin + dy * cos) <= h
}
