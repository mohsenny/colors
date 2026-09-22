/**
 * The colour engine.
 *
 * OKLab because the palette work is perceptual: equal steps in L and C have to
 * look like equal steps, and hue has to stay put when chroma changes. Everything
 * here is pure; nothing caches, nothing touches the DOM.
 *
 * Two spaces are in play and they must not be confused:
 *   - LINEAR sRGB, what the optics are computed in (transmittance, density).
 *   - ENCODED sRGB, 0..1 after the transfer curve, what CSS paints and what
 *     `mix-blend-mode: multiply` multiplies.
 */

import type { Dye, Oklch } from './types'

const DEG = Math.PI / 180

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/** Linear -> encoded sRGB. Odd-symmetric so out-of-gamut negatives never go NaN. */
export function encode(x: number): number {
  if (x < 0) return -encode(-x)
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

/** Encoded sRGB -> linear. */
export function decode(x: number): number {
  if (x < 0) return -decode(-x)
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

/** OKLCh (h in degrees) -> linear sRGB. May be out of gamut. */
export function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos(h * DEG)
  const bb = C * Math.sin(h * DEG)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** Linear sRGB -> OKLCh. `h` comes back in degrees, 0..360. */
export function linearToOklch(r: number, g: number, b: number): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const C = Math.hypot(a, bb)
  let h = Math.atan2(bb, a) / DEG
  if (h < 0) h += 360
  return { L, C, h }
}

const GAMUT_LO = -0.001
const GAMUT_HI = 1.001

function inGamut(rgb: readonly [number, number, number]): boolean {
  return (
    rgb[0] >= GAMUT_LO &&
    rgb[0] <= GAMUT_HI &&
    rgb[1] >= GAMUT_LO &&
    rgb[1] <= GAMUT_HI &&
    rgb[2] >= GAMUT_LO &&
    rgb[2] <= GAMUT_HI
  )
}

/**
 * The most chroma sRGB can hold at this lightness and hue, never more than
 * `limit`. The palette generator caps its dyes with this so a recorded dye is
 * always the colour it will actually be: yellow tops out near C 0.19 and blue
 * near C 0.31, and a generator that ignored that would treat them as equals.
 */
export function maxChroma(L: number, h: number, limit: number): number {
  if (inGamut(oklchToLinear(L, limit, h))) return limit
  let lo = 0
  let hi = limit
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Bring a colour into sRGB by giving up chroma only: L and h are preserved, so a
 * clipped dye stays the same colour, just less saturated. `clip` is how much
 * chroma the request lost, which the palette scorer penalises.
 */
export function gamutMap(
  L: number,
  C: number,
  h: number,
): { r: number; g: number; b: number; clip: number } {
  const direct = oklchToLinear(L, C, h)
  if (inGamut(direct)) {
    return { r: clamp(direct[0], 0, 1), g: clamp(direct[1], 0, 1), b: clamp(direct[2], 0, 1), clip: 0 }
  }

  let lo = 0
  let hi = C
  let best = oklchToLinear(L, 0, h)
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const trial = oklchToLinear(L, mid, h)
    if (inGamut(trial)) {
      lo = mid
      best = trial
    } else {
      hi = mid
    }
  }
  return { r: clamp(best[0], 0, 1), g: clamp(best[1], 0, 1), b: clamp(best[2], 0, 1), clip: C - lo }
}

export function linearTo255(r: number, g: number, b: number): [number, number, number] {
  return [
    Math.round(clamp(encode(r), 0, 1) * 255),
    Math.round(clamp(encode(g), 0, 1) * 255),
    Math.round(clamp(encode(b), 0, 1) * 255),
  ]
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0')
}

export function linearToHex(r: number, g: number, b: number): string {
  const [rr, gg, bb] = linearTo255(r, g, b)
  return `#${hex2(rr)}${hex2(gg)}${hex2(bb)}`
}

// --- the film model ---------------------------------------------------------

/**
 * A slide is a dyed sheet over a backlight, not a painted rectangle. Density `d`
 * is how much of the white the sheet takes away, so the transmitted colour sits
 * on the line from white (d = 0) to the pure dye (d = 1).
 */
export function filmLinear(dye: Dye): [number, number, number] {
  const g = gamutMap(dye.L, dye.C, dye.h)
  const d = dye.d
  return [1 - d * (1 - g.r), 1 - d * (1 - g.g), 1 - d * (1 - g.b)]
}

export function filmRgb255(dye: Dye): [number, number, number] {
  const [r, g, b] = filmLinear(dye)
  return linearTo255(r, g, b)
}

export function filmHex(dye: Dye): string {
  const [r, g, b] = filmLinear(dye)
  return linearToHex(r, g, b)
}

/**
 * Gels in series. A plain per-channel product: that is both the physics of
 * stacked transmittances and exactly what the GPU does for `multiply`, which is
 * why the render track gets the optics for free. Feed it the channel values of
 * the space you are compositing in (the renderer composites in encoded sRGB).
 *
 * There is no second colour for a sheet any more. Mode B used to be opaque ink,
 * so a sheet had a print colour as well as a transmitted one and the tab had to
 * pick. Now both modes are light through the same film and only the crossings
 * differ, so a sheet's hex is `filmHex` and it does not change when the mode
 * does.
 */
export function stackLinear(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [
    clamp((a[0] ?? 0) * (b[0] ?? 0), 0, 1),
    clamp((a[1] ?? 0) * (b[1] ?? 0), 0, 1),
    clamp((a[2] ?? 0) * (b[2] ?? 0), 0, 1),
  ]
}

function easeOutQuint(t: number): number {
  const u = 1 - t
  return 1 - u * u * u * u * u
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Hue runs ahead of density on purpose: the eye reads the new colour arriving
 * before the sheet finishes thickening, which is a gel being swapped rather than
 * a crossfade between two pictures.
 */
export function mixDye(from: Dye, to: Dye, t: number): Dye {
  if (t <= 0) return { ...from }
  if (t >= 1) return { ...to }

  // Normalises into [-180, 180), so exactly opposite hues (no short way round)
  // land on -180 and turn anticlockwise rather than picking a direction per call.
  const dh = ((to.h - from.h) % 360 + 540) % 360 - 180

  const eh = easeOutQuint(t)
  const eb = easeInOutCubic(t)

  let h = from.h + dh * eh
  h = ((h % 360) + 360) % 360

  return {
    L: from.L + (to.L - from.L) * eb,
    C: from.C + (to.C - from.C) * eb,
    h,
    d: from.d + (to.d - from.d) * eb,
  }
}
