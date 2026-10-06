/*
 * A map of Pluto drawn here rather than photographed: tan and peach ground,
 * redder toward the north, a pale polar cap, the dark belt of Cthulhu along
 * the equator and the pale heart of Tombaugh Regio, Sputnik Planitia its
 * brightest lobe, on the side that faces away from Charon. Laid out as the
 * photographed maps are: east longitude across from -180 to 180, the prime
 * meridian (under Charon) in the middle, north at the top.
 */

const W = 512
const H = 256
const D = Math.PI / 180

type Rgb = readonly [number, number, number]

const GROUND: Rgb = [201, 163, 131]
const NORTH: Rgb = [196, 146, 108]
const CAP: Rgb = [204, 192, 176]
const SOUTH: Rgb = [178, 152, 128]
const DARK: Rgb = [92, 54, 39]
const HEART: Rgb = [228, 216, 199]
const ICE: Rgb = [243, 237, 227]

/** A patch: east longitude and latitude of its middle, its half widths, all in degrees, and how much it covers. */
type Patch = readonly [lon: number, lat: number, rx: number, ry: number, k: number]

/** Cthulhu, west of the heart, and the row of smaller dark spots round the far side. */
const MACULAE: Patch[] = [
  [35, -10, 26, 17, 1],
  [80, -7, 34, 14, 1],
  [128, -4, 28, 11, 1],
  [158, -2, 12, 7, 0.8],
  [252, -9, 10, 7, 0.85],
  [281, -13, 12, 8, 0.85],
  [309, -7, 9, 6, 0.8],
  [334, -11, 8, 6, 0.7],
]

/** Tombaugh Regio's eastern lobe and its point to the south. */
const TOMBAUGH: Patch[] = [
  [206, 12, 22, 19, 0.9],
  [214, -6, 14, 11, 0.8],
  [190, -10, 9, 8, 0.7],
]

/** Sputnik Planitia, the western lobe: a plain of fresh nitrogen ice. */
const SPUTNIK: Patch[] = [
  [176, 19, 25, 20, 1],
  [181, 2, 13, 11, 0.9],
]

function hash(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374_761_393) + Math.imul(j, 668_265_263) + Math.imul(k, 1_440_662_683)
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const ease = (t: number): number => t * t * (3 - 2 * t)

/** Smooth noise, 0 to 1, through space, so that taken over the globe it has no seam and does not pinch at the poles. */
function noise(x: number, y: number, z: number): number {
  const [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)]
  const [u, v, w] = [ease(x - i), ease(y - j), ease(z - k)]
  const h = (a: number, b: number, c: number): number => hash(i + a, j + b, k + c)
  const near = lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v)
  const far = lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v)
  return lerp(near, far, w)
}

const smooth = (lo: number, hi: number, x: number): number => ease(Math.min(1, Math.max(0, (x - lo) / (hi - lo))))

const mix = (c: Rgb, d: Rgb, t: number): Rgb => [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t)]

/** How much of a point the patches cover, their edges ragged by `rough`. */
function cover(patches: Patch[], lon: number, lat: number, rough: number): number {
  let most = 0
  for (const p of patches) {
    const dy = (lat - p[1]) / p[3]
    // Too far north or south for even the most ragged edge to reach, which is most of the map.
    if (Math.abs(dy) > 1.3) continue
    const dx = ((((((lon - p[0]) % 360) + 540) % 360) - 180) * Math.cos(lat * D)) / p[2]
    most = Math.max(most, p[4] * (1 - smooth(0.75, 1.05, Math.sqrt(dx * dx + dy * dy) + rough)))
  }
  return most
}

/** The map as a picture the renderer can load. */
export function plutoMap(): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const img = ctx.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 360 - 180
      // The point on a globe four cells in radius, so a cell is about 15 degrees of its equator.
      const [p, q, r] = [4 * Math.cos(lat * D) * Math.cos(lon * D), 4 * Math.cos(lat * D) * Math.sin(lon * D), 4 * Math.sin(lat * D)]
      const grain = 0.5 * noise(p, q, r) + 0.3 * noise(3 * p + 17, 3 * q, 3 * r) + 0.2 * noise(7 * p + 41, 7 * q, 7 * r)
      const rough = 0.45 * (grain - 0.5)
      let c = mix(GROUND, NORTH, smooth(12, 40, lat) * (1 - smooth(55, 70, lat)))
      c = mix(c, CAP, smooth(58, 72, lat + 6 * rough))
      c = mix(c, SOUTH, smooth(-35, -60, lat))
      c = mix(c, DARK, cover(MACULAE, lon, lat, rough))
      c = mix(c, HEART, cover(TOMBAUGH, lon, lat, rough))
      c = mix(c, ICE, cover(SPUTNIK, lon, lat, 0.4 * rough))
      const k = 0.93 + 0.14 * grain
      const i = (y * W + x) * 4
      img.data[i] = c[0] * k
      img.data[i + 1] = c[1] * k
      img.data[i + 2] = c[2] * k
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}
