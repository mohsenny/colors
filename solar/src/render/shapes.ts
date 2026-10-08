/*
 * The small moons' real shapes: for each, how far out its surface is in every
 * direction of its own frame, on the same grid of longitude and latitude as
 * the maps, as a share of its highest point. Saturn's small moons are P.C.
 * Thomas's from Cassini (PDS), Phoebe R.W. Gaskell's, Phobos and Deimos C.M.
 * Ernst's (JHU APL), Amalthea, Thebe and Proteus P.J. Stooke's from Voyager
 * and Galileo, and the rest ellipsoids of the sizes measured: the IAU's for
 * Metis and Adrastea, Cassini's for Himalia and New Horizons' for Pluto's
 * four, Kerberos two lobes. Puck and Nereid were never seen well enough to
 * have one, and are drawn round.
 */

import { BODIES } from '../sky/bodies'
import type { BodyId } from '../sky/bodies'
import shapes from '../assets/shapes.bin?url'

export const SHAPES = shapes

/** The grid: rows from north to south, columns from 180 degrees west eastward, each sampled at its middle. */
export const SHAPE_ROWS = 64
export const SHAPE_COLUMNS = 128

/** Those that have a shape, in the file's order. */
const SHAPED: BodyId[] = BODIES.filter((b) => b.outer).map((b) => b.id)

/** Where a moon's shape is in the file, or -1 if it is round. */
export function shapeOf(id: BodyId): number {
  return SHAPED.indexOf(id)
}

/**
 * The file, 16 bits a point, as four floats a point: how far out the ground
 * is, as a share of the moon's highest point, and which way it faces there,
 * in the moon's own frame. Shaded by these rather than by the slope between
 * points, the ground is smooth instead of faceted. Null if the file is not as
 * long as the moons it should hold.
 */
export function unpackShapes(buf: ArrayBuffer): Float32Array | null {
  const raw = new Uint16Array(buf)
  const cells = SHAPE_ROWS * SHAPE_COLUMNS
  if (raw.length !== SHAPED.length * cells) return null
  const out = new Float32Array(raw.length * 4)
  // A step between points, the same along a meridian and along the equator.
  const step = Math.PI / SHAPE_ROWS
  for (let k = 0; k < SHAPED.length; k++) {
    // Off the top or bottom row, the next point is over the pole, half a turn round.
    const r = (i: number, j: number): number => {
      const flip = i < 0 || i >= SHAPE_ROWS
      const row = i < 0 ? 0 : i >= SHAPE_ROWS ? SHAPE_ROWS - 1 : i
      const col = (((j + (flip ? SHAPE_COLUMNS / 2 : 0)) % SHAPE_COLUMNS) + SHAPE_COLUMNS) % SHAPE_COLUMNS
      return raw[k * cells + row * SHAPE_COLUMNS + col] / 65535
    }
    for (let i = 0; i < SHAPE_ROWS; i++) {
      const lat = Math.PI / 2 - (i + 0.5) * step
      for (let j = 0; j < SHAPE_COLUMNS; j++) {
        const lon = -Math.PI + (j + 0.5) * step
        const here = r(i, j)
        const north = (r(i - 1, j) - r(i + 1, j)) / (2 * step)
        const east = (r(i, j + 1) - r(i, j - 1)) / (2 * step) / Math.cos(lat)
        const [sa, ca, so, co] = [Math.sin(lat), Math.cos(lat), Math.sin(lon), Math.cos(lon)]
        const n = [
          here * ca * co + north * sa * co + east * so,
          here * ca * so + north * sa * so - east * co,
          here * sa - north * ca,
        ]
        const l = Math.hypot(n[0], n[1], n[2])
        out.set([here, n[0] / l, n[1] / l, n[2] / l], (k * cells + i * SHAPE_COLUMNS + j) * 4)
      }
    }
  }
  return out
}
