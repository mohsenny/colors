import type { Chapter, Crossing } from './life'

/*
 * Where the sheets lie. Two rows, learning on top and work below, laid along
 * a line of years from the oldest on the left. Everything here is in sheet
 * widths (u) until `fit` turns it into stage pixels, so the same life lays
 * out on a phone and a wall and only the camera differs.
 *
 * Under 620px the line turns on its side: the rows become two columns and the
 * years run down. "Along" is the axis the years run on, "across" the one the
 * rows sit on, and only `toStage` knows which of x and y each one is.
 */

/** The next chapter in the same row, from the last one's left edge. A tenth of a sheet clear, plus the room a lean takes. */
export const STEP = 1.12

/** A chapter that crossed the last one sits this far on, in the other row, so the two share 0.4 of a sheet along. */
export const CROSS = 0.6

/** How far the rows overlap, across. Together with CROSS that is the crossing: 0.4 by 0.3 of a sheet. */
export const OVERLAP = 0.3

/** The life's width across both rows. */
export const ACROSS = 2 - OVERLAP

/** Under this width the life runs down instead of across, the same break as the rest of the chrome. */
export const NARROW = 620

/** Clear of the card above and the dock below, and of the stage's sides when the life is wider. */
export const MARGIN = 40

/**
 * A life a little wider than the room gives up its side margins, down to
 * this, before the camera pans. At 1280 the 160px floor makes it 1248px:
 * with 40 a side the camera would pan and cut Growing up at the left edge,
 * with 16 a side it fits.
 */
export const MARGIN_TIGHT = 16

/**
 * A phone's margin above and below the band, half the desktop's. At 320x568
 * the facts card leaves 231px between itself and the dock, and a 174px sheet
 * with its 18px tab only fits the band with 20 either side. Above the band
 * the life fades out across this margin rather than passing under the card.
 */
export const MARGIN_NARROW = MARGIN / 2

/** A sheet's width on screen, px. The smallest keeps a 60px tab and some film beside it; the largest is Lightbox's own. */
export const U_MIN = 160
export const U_MAX = 560

/** A phone's columns stand this far in from each side, together. */
export const NARROW_SIDES = 24

/** One sheet as laid: its centre in u, along and across, and its lean in degrees. */
export interface Placed {
  along: number
  across: number
  lean: number
}

/** Whether two chapters are declared to cross, either way round. */
export function crosses(crossings: readonly Crossing[], a: string, b: string): boolean {
  return crossings.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
}

/**
 * The life in sheet widths, centres, in the chapters' own order. The gap to
 * the next chapter is the only decision: a full step on when it started after
 * the last one ended, a shorter one into the other row when they ran at once.
 * With the life's eight chapters that puts the left edges at 0, 1.12, 2.24,
 * 2.84, 3.96, 5.08, 6.2 and 6.8.
 */
export function place(chapters: readonly Chapter[], crossings: readonly Crossing[]): Placed[] {
  const out: Placed[] = []
  let left = 0
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i] as Chapter
    const last = chapters[i - 1]
    if (last) left += crosses(crossings, last.id, c.id) ? CROSS : STEP
    out.push({ along: left + 0.5, across: c.row === 'learn' ? 0.5 : 1.5 - OVERLAP, lean: c.lean })
  }
  return out
}

/** How long the life is along, in u: from the first sheet's near edge to the furthest far edge. */
export function length(placed: readonly Placed[]): number {
  let end = 0
  for (const p of placed) end = Math.max(end, p.along + 0.5)
  return end
}

/** The stage and the room left in it, px. `top` is the card's lower edge, `bottom` the dock's upper one. */
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
  /** The years run down rather than across. */
  narrow: boolean
  /** The band the life is laid in along, stage px, and its middle across. */
  near: number
  far: number
  middle: number
  /** The life's length, u. */
  length: number
  /**
   * On a phone, the card's lower edge, stage px: the life fades out between
   * here and `near`, so nothing panned above the band shows under the card or
   * the title. Null across a desktop, where the life lies beside the card.
   */
  edge: number | null
}

/**
 * The size of a sheet and the band it is laid in. Across a desktop the life
 * fills the width less the margins, a sheet 7.8 of it, and no taller than
 * the room between the card and the dock; at 1440x900 that is 174px, and at
 * 1024 the floor of 160 makes the life wider than the stage and the camera
 * pans. On a phone a sheet is set by the width alone, both columns and the
 * margins across it, 215px at 390.
 */
export function fit(room: Room, len: number): Fit {
  const clamp = (u: number): number => Math.min(U_MAX, Math.max(U_MIN, u))
  if (room.width < NARROW) {
    const top = room.top + MARGIN_NARROW
    const bottom = room.bottom - MARGIN_NARROW
    return {
      u: (room.width - NARROW_SIDES) / ACROSS,
      narrow: true,
      near: top,
      far: Math.max(top, bottom),
      middle: room.width / 2,
      length: len,
      edge: room.top,
    }
  }
  const top = room.top + MARGIN
  const bottom = Math.max(top, room.bottom - MARGIN)
  const u = clamp(Math.min((room.width - 2 * MARGIN) / len, (bottom - top) / ACROSS))
  const side = Math.max(MARGIN_TIGHT, Math.min(MARGIN, (room.width - len * u) / 2))
  // Only when that is enough to fit: a life that pans anyway keeps the full margin.
  const sides = room.width - 2 * side >= len * u - 0.5 ? side : MARGIN
  return {
    u,
    narrow: false,
    near: sides,
    far: room.width - sides,
    middle: (top + bottom) / 2,
    length: len,
    edge: null,
  }
}

/**
 * Where the camera can look, in u along: the middle of the life when it fits
 * the band, and otherwise anywhere that keeps the band full of life, so a
 * chapter at either end comes to rest at the band's edge rather than in the
 * middle of an empty stage.
 */
export function aim(f: Fit, along: number): number {
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

/** One placed sheet on the stage, with the camera looking at `camera` u along. */
export function toStage(f: Fit, p: Placed, camera: number): Laid {
  const along = (f.near + f.far) / 2 + (p.along - camera) * f.u
  const across = f.middle + (p.across - ACROSS / 2) * f.u
  const rot = (p.lean * Math.PI) / 180
  return f.narrow ? { x: across, y: along, side: f.u, rot } : { x: along, y: across, side: f.u, rot }
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
