/*
 * The small moons' real shapes: for each, how far out its surface is in every
 * direction of its own frame, on the same grid of longitude and latitude as
 * the maps, as a share of its highest point. Saturn's small moons are P.C.
 * Thomas's from Cassini (PDS), Phoebe R.W. Gaskell's, Phobos and Deimos C.M.
 * Ernst's (JHU APL), Amalthea, Thebe, Proteus and Larissa P.J. Stooke's from
 * Voyager and Galileo, and the rest ellipsoids of the sizes measured: the
 * IAU's for Metis and Adrastea, Cassini's for Himalia and New Horizons' for
 * Pluto's four, Kerberos two lobes. Puck and Nereid were never seen well
 * enough to have one, and are drawn round.
 *
 * Of the giants' other moons (crowd.ts), those measured are ellipsoids of
 * their sizes, Methone, Pallene and Aegaeon as smooth as Cassini saw them and
 * the rest roughened. Those never seen as more than points share two dozen
 * made up here, picked by name: potatoes, cratered and lumpy, a few of two
 * lobes, the big ones rounder.
 */

import { BODIES } from '../sky/bodies'
import type { BodyId } from '../sky/bodies'
import { CROWD, seeded } from '../sky/crowd'
import type { CrowdMoon } from '../sky/crowd'
import type { Vec3 } from '../sky/ephemeris'
import shapes from '../assets/shapes.bin?url'

export const SHAPES = shapes

/** The grid: rows from north to south, columns from 180 degrees west eastward, each sampled at its middle. */
export const SHAPE_ROWS = 64
export const SHAPE_COLUMNS = 128
const CELLS = SHAPE_ROWS * SHAPE_COLUMNS

/** Each column's longitude, as its sine and cosine. */
const LONGITUDES = Array.from({ length: SHAPE_COLUMNS }, (_, j) => {
  const lon = -Math.PI + (j + 0.5) * (Math.PI / SHAPE_ROWS)
  return [Math.sin(lon), Math.cos(lon)]
})

/** Those that have a shape in the file, in its order: the named small moons, then Larissa. */
const SHAPED: string[] = [...BODIES.filter((b) => b.outer).map((b) => b.id), 'Larissa']

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
  if (raw.length !== SHAPED.length * CELLS) return null
  const out = new Float32Array(raw.length * 4)
  for (let k = 0; k < SHAPED.length; k++) withNormals(Float32Array.from(raw.subarray(k * CELLS, (k + 1) * CELLS), (x) => x / 65535), out, k)
  return out
}

/** One shape's grid into `out` as the `k`th, with which way its ground faces. */
function withNormals(grid: Float32Array, out: Float32Array, k: number): void {
  // A step between points, the same along a meridian and along the equator.
  const step = Math.PI / SHAPE_ROWS
  // Off the top or bottom row, the next point is over the pole, half a turn round.
  const r = (i: number, j: number): number => {
    const flip = i < 0 || i >= SHAPE_ROWS
    const row = i < 0 ? 0 : i >= SHAPE_ROWS ? SHAPE_ROWS - 1 : i
    const col = (((j + (flip ? SHAPE_COLUMNS / 2 : 0)) % SHAPE_COLUMNS) + SHAPE_COLUMNS) % SHAPE_COLUMNS
    return grid[row * SHAPE_COLUMNS + col]
  }
  for (let i = 0; i < SHAPE_ROWS; i++) {
    const lat = Math.PI / 2 - (i + 0.5) * step
    const [sa, ca] = [Math.sin(lat), Math.cos(lat)]
    for (let j = 0; j < SHAPE_COLUMNS; j++) {
      const [so, co] = LONGITUDES[j]
      const here = r(i, j)
      const north = (r(i - 1, j) - r(i + 1, j)) / (2 * step)
      const east = (r(i, j + 1) - r(i, j - 1)) / (2 * step) / ca
      const x = here * ca * co + north * sa * co + east * so
      const y = here * ca * so + north * sa * so - east * co
      const z = here * sa - north * ca
      const l = Math.sqrt(x * x + y * y + z * z)
      const at = (k * CELLS + i * SHAPE_COLUMNS + j) * 4
      out[at] = here
      out[at + 1] = x / l
      out[at + 2] = y / l
      out[at + 3] = z / l
    }
  }
}

/**
 * The file's shapes and the crowd's after them, and for each of the crowd,
 * where its shape is and how far out its highest point is against its mean
 * radius.
 */
export function crowdShapes(file: Float32Array): { data: Float32Array; of: Array<{ at: number; ratio: number }> } {
  const made: Float32Array[] = []
  const add = (grid: Float32Array): number => SHAPED.length + made.push(grid) - 1
  const gentle = Array.from({ length: 4 }, (_, k) => add(potato(seeded('gentle ' + k), GENTLE, false)))
  const rough = Array.from({ length: 20 }, (_, k) => add(potato(seeded('rough ' + k), ROUGH, k < 3)))
  const at = CROWD.map((c) => {
    const filed = SHAPED.indexOf(c.name)
    if (filed >= 0) return filed
    if (c.dims) return add(measured(c, c.dims))
    const pick = c.radius >= 30 ? gentle : rough
    return pick[Math.floor(c.look * pick.length)]
  })
  const data = new Float32Array(file.length + made.length * CELLS * 4)
  data.set(file)
  made.forEach((grid, k) => withNormals(grid, data, SHAPED.length + k))
  const ratios = new Map<number, number>()
  return {
    data,
    of: at.map((k) => {
      if (!ratios.has(k)) ratios.set(k, ratioOf(data, k))
      return { at: k, ratio: ratios.get(k) as number }
    }),
  }
}

/** How far out a shape's highest point is against a ball of its volume. */
function ratioOf(data: Float32Array, k: number): number {
  let sum = 0
  let all = 0
  for (let i = 0; i < SHAPE_ROWS; i++) {
    const w = Math.sin(((i + 0.5) * Math.PI) / SHAPE_ROWS)
    for (let j = 0; j < SHAPE_COLUMNS; j++) {
      sum += w * data[(k * CELLS + i * SHAPE_COLUMNS + j) * 4] ** 3
      all += w
    }
  }
  return 1 / Math.cbrt(sum / all)
}

/** How a made-up shape is drawn: its middle axis against its longest and its shortest against its middle, how high its hills, how many craters and how wide the widest, degrees. */
interface Look {
  middle: [number, number]
  short: [number, number]
  hills: number
  pits: number
  widest: number
}

const GENTLE: Look = { middle: [0.8, 0.95], short: [0.8, 0.95], hills: 0.04, pits: 8, widest: 30 }
const ROUGH: Look = { middle: [0.6, 0.95], short: [0.7, 0.95], hills: 0.08, pits: 10, widest: 60 }

function potato(next: () => number, look: Look, lobed: boolean): Float32Array {
  const within = ([a, b]: [number, number]): number => a + (b - a) * next()
  if (lobed) {
    // Two lobes end to end, each a little more or less than these.
    const k = (): number => 0.9 + 0.2 * next()
    const a = { at: 0.42, size: [0.56 * k(), 0.5 * k(), 0.46 * k()] }
    const b = { at: -0.4, size: [0.5 * k(), 0.45 * k(), 0.42 * k()] }
    return grid(roughened(next, (u) => Math.max(exit(u, a.at, a.size), exit(u, b.at, b.size)), look.hills, look.pits, look.widest))
  }
  const b = within(look.middle)
  return grid(roughened(next, ellipsoid(1, b, b * within(look.short)), look.hills, look.pits, look.widest))
}

/** Seen by Cassini, as smooth as eggs. */
const SMOOTH = new Set(['Methone', 'Pallene', 'Aegaeon'])

function measured(c: CrowdMoon, [a, b, d]: [number, number, number]): Float32Array {
  const [hills, pits] = SMOOTH.has(c.name) ? [0, 0] : c.name === 'Polydeuces' ? [0.03, 0] : c.parent === 'uranus' ? [0.03, 4] : [0.06, 8]
  return grid(roughened(seeded(c.name), ellipsoid(1, b / a, d / a), hills, pits, 40))
}

function ellipsoid(a: number, b: number, c: number): (u: Vec3) => number {
  return (u) => 1 / Math.sqrt((u[0] / a) ** 2 + (u[1] / b) ** 2 + (u[2] / c) ** 2)
}

/** Where a ray from the middle leaves an ellipsoid of semi-axes `size` centred `at` along x, which holds the middle. */
function exit(u: Vec3, at: number, size: number[]): number {
  const A = (u[0] / size[0]) ** 2 + (u[1] / size[1]) ** 2 + (u[2] / size[2]) ** 2
  const B = (u[0] * at) / size[0] ** 2
  const C = (at / size[0]) ** 2 - 1
  return (B + Math.sqrt(B * B - A * C)) / A
}

/** A shape with `hills` as high as that, as a share, and `pits` bowls with rims up to `widest` degrees across. */
function roughened(next: () => number, base: (u: Vec3) => number, hills: number, pits: number, widest: number): (u: Vec3) => number {
  const toward = (): Vec3 => {
    const z = 2 * next() - 1
    const round = 2 * Math.PI * next()
    const h = Math.sqrt(1 - z * z)
    return [h * Math.cos(round), h * Math.sin(round), z]
  }
  // Past three of its widths a hill, and past two a bowl, changes the ground by under a hundred-thousandth, so is left out.
  const near = (widths: number, wide: number): number => Math.cos(Math.min(Math.PI, widths * wide))
  const bumps = hills
    ? Array.from({ length: 10 }, () => {
        const b = { at: toward(), high: hills * (2 * next() - 1), wide: 0.4 + 0.8 * next() }
        return { ...b, near: near(3, b.wide) }
      })
    : []
  const bowls = Array.from({ length: pits }, () => {
    const wide = ((8 + (widest - 8) * next() ** 2) * Math.PI) / 360
    return { at: toward(), wide, deep: 0.4 * wide, near: near(2, wide) }
  })
  const cos = (u: Vec3, v: Vec3): number => Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))
  return (u) => {
    let r = base(u)
    for (const b of bumps) {
      const c = cos(u, b.at)
      if (c > b.near) r *= 1 + b.high * Math.exp(-((Math.acos(c) / b.wide) ** 2))
    }
    for (const b of bowls) {
      const c = cos(u, b.at)
      if (c <= b.near) continue
      const x = Math.acos(c) / b.wide
      r *= 1 + b.deep * ((x < 1 ? x * x - 1 : 0) + 0.15 * Math.exp(-(((x - 1) / 0.3) ** 2)))
    }
    return r
  }
}

/** A shape on the grid, its highest point 1. The lowest is kept well off the middle, where the drawing takes it to be inside. */
function grid(r: (u: Vec3) => number): Float32Array {
  const out = new Float32Array(CELLS)
  const step = Math.PI / SHAPE_ROWS
  for (let i = 0; i < SHAPE_ROWS; i++) {
    const lat = Math.PI / 2 - (i + 0.5) * step
    const [sa, ca] = [Math.sin(lat), Math.cos(lat)]
    for (let j = 0; j < SHAPE_COLUMNS; j++) {
      const [so, co] = LONGITUDES[j]
      out[i * SHAPE_COLUMNS + j] = r([ca * co, ca * so, sa])
    }
  }
  let [low, high] = [Infinity, 0]
  for (const x of out) [low, high] = [Math.min(low, x), Math.max(high, x)]
  low /= high
  return out.map((x) => (low < 0.36 ? 0.36 + ((x / high - low) * 0.64) / (1 - low) : x / high))
}
