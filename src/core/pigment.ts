/**
 * The mixing model.
 *
 * What this replaces and why. Until now the overlaps were composited by the
 * GPU: `mix-blend-mode: multiply`, which is a per-channel product of the two
 * sRGB values. That product is the correct optics for two gels in series and it
 * is the only physical compositor CSS offers, but it is the wrong ARTIST model,
 * and this is a tool for looking at colour combinations. Multiply works on the
 * additive primaries, so it can only ever subtract light in R, G and B. Put a
 * yellow sheet over a blue one and multiply returns a dark olive grey, because
 * yellow has almost no blue channel and blue has almost no red or green, so
 * every channel loses. Every painter alive expects green. Red over blue gives a
 * muddy near-black rather than purple, for the same reason.
 *
 * The practical consequence was worse than the wrong hue. Because complementary
 * pairs collapsed to sludge, the palette generator had to forbid them, so rolls
 * came out analogous, so every overlap read as "a darker version of whichever
 * slide is on top". That is the complaint this module exists to answer.
 *
 * So the mix is computed here instead, in RYB: the subtractive primaries of
 * pigment, using Gossett and Chen's trilinear cube. Red plus yellow is orange,
 * yellow plus blue is green, red plus blue is purple. Two properties of the
 * accumulation matter as much as the space:
 *
 *   - It is ORDER FREE. The mixed colour is a function of the SET of slides
 *     over a point, not of their stacking. No slide can dictate an overlap, and
 *     the same three sheets read the same whichever way they drifted together.
 *   - Light does NOT accumulate losses. A real stack absorbs once per sheet, so
 *     a fourth layer costs a quarter of the light and every busy region drifts
 *     to sludge: that is the correct physics and it is bad to look at, and the
 *     whole point of the thing is looking. So pigment decides only the HUE of
 *     an overlap, and its lightness comes from the sheets themselves. An
 *     overlap is never darker than the darkest sheet in it, at any depth.
 *
 * Mode B keeps the ordered, digital reading on purpose (see `stackInk`), so the
 * two modes are now a real choice between two models rather than one model and
 * a tint.
 *
 * Spaces: the cube's corners are defined in ENCODED sRGB, so the trilinear
 * interpolation happens there. Depth darkening is a light-transport term, so it
 * happens in LINEAR sRGB. Mixing those up desaturates everything.
 */

import { decode, encode, gamutMap, linearToOklch, maxChroma } from './oklab'

/** Concentrations of red, yellow and blue pigment. 0 is bare white light. */
export type Ryb = [number, number, number]

/**
 * The cube, in encoded sRGB. Index bits: 1 red, 2 yellow, 4 blue. Gossett and
 * Chen's published corners, with two changed: their blue and purple are paint,
 * mixed for a white page, and this is a backlit gel. Their ultramarine
 * (#2A5F99) and their dark purple cannot transmit a bright blue at any
 * concentration, which left everything from cyan round to magenta outside the
 * model, a third of the wheel and exactly the third the palette was favouring.
 * The black corner stays a warm near-black rather than 0, which is why all
 * three primaries at once read as a bistre wash rather than a hole.
 */
const CUBE: readonly Ryb[] = [
  [1, 1, 1], // white
  [1, 0, 0], // red
  [1, 1, 0], // yellow
  [1, 0.5, 0], // red + yellow, orange
  [0.05, 0.35, 0.95], // blue
  [0.6, 0.1, 0.8], // red + blue, purple
  [0, 0.66, 0.2], // yellow + blue, green
  [0.2, 0.094, 0.0], // all three, near-black
]

/**
 * How much deeper the pigment reads per extra sheet. Not a light loss: it only
 * raises the mix's CHROMA, because lightness is set separately (see `mixFilm`).
 * Two pale sheets of the same hue should read as one deeper sheet of it, which
 * is the one bit of stacking that is worth keeping.
 */
const OVERLAP_BOOST = 0.35
/**
 * And the ceiling on it. Without one, a five-sheet pile multiplies its way to
 * full chroma whatever colours went into it, which is the opposite failure to
 * the one this model was written to fix: not mud, but a lurid stain that has
 * nothing to do with the sheets making it.
 */
const OVERLAP_BOOST_MAX = 1.45

/**
 * Where an overlap's lightness sits between the mean of its sheets (0) and the
 * darkest of them (1). At 0.3 the overlap is a touch heavier than the average
 * of what made it, which still reads as material, while the bound holds: an
 * overlap is never darker than its darkest sheet, however many sheets there
 * are. Raise it toward 1 for a denser, more literal stack.
 */
const L_MIN_BIAS = 0.3

/** Upper bound for the chroma search. Nothing in sRGB exceeds it. */
const CHROMA_CEILING = 0.45

/** Search tolerance for the inverse, as a squared error in encoded sRGB. */
const INVERT_TOL = 1e-6
/** Ties in the inverse go to less pigment. See `srgbToRyb`. */
const INVERT_LAMBDA = 1e-4

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Chroma as a fraction of the most sRGB can hold at that lightness and hue.
 * Absolute chroma is not comparable across the wheel: 0.14 is a washed-out red
 * and a vivid yellow. Everything in the mix is reasoned about in this unit.
 */
function saturation(L: number, C: number, h: number): number {
  return clamp01(C / Math.max(1e-6, maxChroma(L, h, CHROMA_CEILING)))
}

/**
 * Trilinear interpolation through the cube. Writes into `out` because this runs
 * a few hundred times per inverse and allocating a triple each time is the only
 * part of this file that would ever show up in a profile.
 */
export function rybToSrgb(r: number, y: number, b: number, out: Ryb = [0, 0, 0]): Ryb {
  const r0 = 1 - r
  const y0 = 1 - y
  const b0 = 1 - b

  const w = [
    r0 * y0 * b0,
    r * y0 * b0,
    r0 * y * b0,
    r * y * b0,
    r0 * y0 * b,
    r * y0 * b,
    r0 * y * b,
    r * y * b,
  ]

  let cr = 0
  let cg = 0
  let cb = 0
  for (let i = 0; i < 8; i++) {
    const k = w[i] as number
    if (k === 0) continue
    const c = CUBE[i] as Ryb
    cr += k * c[0]
    cg += k * c[1]
    cb += k * c[2]
  }

  out[0] = cr
  out[1] = cg
  out[2] = cb
  return out
}

/**
 * The inverse, fast path: Newton from the origin.
 *
 * The forward map is trilinear, so its Jacobian is available in closed form
 * (each column is the difference between two opposite faces, bilinearly
 * weighted), and three or four iterations land on the answer. Starting at zero
 * pigment matters for more than speed: the cube's mud region can be reached
 * both by a little of two primaries and by a lot of all three, and only the
 * first answer goes on mixing sensibly, so the search has to converge to the
 * root NEAREST the origin.
 *
 * Returns null when it cannot get there, which happens for colours outside the
 * pigment gamut: a neon cyan has no solution at all, and clamping into the cube
 * face by face can stall. Those fall through to the search below.
 */
function newtonRyb(target: readonly [number, number, number]): Ryb | null {
  const A = CUBE[0] as Ryb
  const B = CUBE[1] as Ryb
  const C = CUBE[2] as Ryb
  const D = CUBE[3] as Ryb
  const E = CUBE[4] as Ryb
  const F = CUBE[5] as Ryb
  const G = CUBE[6] as Ryb
  const H = CUBE[7] as Ryb

  let r = 0
  let y = 0
  let b = 0
  const f: Ryb = [0, 0, 0]

  for (let iter = 0; iter < 12; iter++) {
    rybToSrgb(r, y, b, f)
    const e0 = f[0] - (target[0] as number)
    const e1 = f[1] - (target[1] as number)
    const e2 = f[2] - (target[2] as number)
    if (e0 * e0 + e1 * e1 + e2 * e2 <= INVERT_TOL) return [r, y, b]

    const r1 = 1 - r
    const y1 = 1 - y
    const b1 = 1 - b
    // Columns of the Jacobian, one per pigment.
    const jr = [0, 0, 0]
    const jy = [0, 0, 0]
    const jb = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      jr[k] =
        y1 * b1 * ((B[k] as number) - (A[k] as number)) +
        y * b1 * ((D[k] as number) - (C[k] as number)) +
        y1 * b * ((F[k] as number) - (E[k] as number)) +
        y * b * ((H[k] as number) - (G[k] as number))
      jy[k] =
        r1 * b1 * ((C[k] as number) - (A[k] as number)) +
        r * b1 * ((D[k] as number) - (B[k] as number)) +
        r1 * b * ((G[k] as number) - (E[k] as number)) +
        r * b * ((H[k] as number) - (F[k] as number))
      jb[k] =
        r1 * y1 * ((E[k] as number) - (A[k] as number)) +
        r * y1 * ((F[k] as number) - (B[k] as number)) +
        r1 * y * ((G[k] as number) - (C[k] as number)) +
        r * y * ((H[k] as number) - (D[k] as number))
    }

    const a11 = jr[0] as number
    const a12 = jy[0] as number
    const a13 = jb[0] as number
    const a21 = jr[1] as number
    const a22 = jy[1] as number
    const a23 = jb[1] as number
    const a31 = jr[2] as number
    const a32 = jy[2] as number
    const a33 = jb[2] as number
    const det =
      a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)
    if (Math.abs(det) < 1e-9) return null

    const dr =
      (e0 * (a22 * a33 - a23 * a32) - a12 * (e1 * a33 - a23 * e2) + a13 * (e1 * a32 - a22 * e2)) /
      det
    const dy =
      (a11 * (e1 * a33 - a23 * e2) - e0 * (a21 * a33 - a23 * a31) + a13 * (a21 * e2 - e1 * a31)) /
      det
    const db =
      (a11 * (a22 * e2 - e1 * a32) - a12 * (a21 * e2 - e1 * a31) + e0 * (a21 * a32 - a22 * a31)) /
      det

    const nr = clamp01(r - dr)
    const ny = clamp01(y - dy)
    const nb = clamp01(b - db)
    // No movement left but still off target: the root is outside the cube.
    if (Math.abs(nr - r) < 1e-9 && Math.abs(ny - y) < 1e-9 && Math.abs(nb - b) < 1e-9) return null
    r = nr
    y = ny
    b = nb
  }
  return null
}

/**
 * The inverse: what concentrations of red, yellow and blue pigment transmit
 * this colour. Newton first, then a coarse grid plus halving refinements for
 * the colours pigment cannot reach, where the answer wanted is the closest
 * point the cube CAN reach.
 *
 * The grid objective carries a small penalty on total pigment, for the same
 * reason Newton starts at the origin. Out-of-gamut colours are also why a
 * single sheet is painted from its own film colour and never from its pigment:
 * see `mixFilm`.
 */
export function srgbToRyb(target: readonly [number, number, number]): Ryb {
  const fast = newtonRyb(target)
  if (fast) return fast

  const probe: Ryb = [0, 0, 0]
  const cost = (r: number, y: number, b: number): number => {
    rybToSrgb(r, y, b, probe)
    const dr = probe[0] - (target[0] as number)
    const dg = probe[1] - (target[1] as number)
    const db = probe[2] - (target[2] as number)
    return dr * dr + dg * dg + db * db + INVERT_LAMBDA * (r + y + b)
  }

  const N = 6
  let br = 0
  let by = 0
  let bb = 0
  let best = Infinity
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      for (let k = 0; k <= N; k++) {
        const c = cost(i / N, j / N, k / N)
        if (c < best) {
          best = c
          br = i / N
          by = j / N
          bb = k / N
        }
      }
    }
  }

  let step = 1 / N
  for (let pass = 0; pass < 7 && best > INVERT_TOL; pass++) {
    step /= 2
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          if (!i && !j && !k) continue
          const r = clamp01(br + i * step)
          const y = clamp01(by + j * step)
          const b = clamp01(bb + k * step)
          const c = cost(r, y, b)
          if (c < best) {
            best = c
            br = r
            by = y
            bb = b
          }
        }
      }
    }
  }

  return [br, by, bb]
}

/**
 * What a sheet contributes to a mix besides its pigment: how much light it
 * passes, and how saturated it is in units of the chroma available at that
 * lightness. Both involve a binary search, and the painter asks for the same
 * sheet in every region it touches, so they are computed once per frame and
 * handed to `mixFilm`.
 */
export interface SheetStat {
  L: number
  sat: number
}

export function filmStat(film: readonly [number, number, number]): SheetStat {
  const o = linearToOklch(film[0] as number, film[1] as number, film[2] as number)
  return { L: o.L, sat: saturation(o.L, o.C, o.h) }
}

/** The pigment a dyed sheet holds, derived from what it transmits (linear). */
export function filmToRyb(film: readonly [number, number, number]): Ryb {
  return srgbToRyb([encode(film[0] as number), encode(film[1] as number), encode(film[2] as number)])
}

/**
 * The colour of a region, in linear sRGB, given the pigment of every sheet
 * covering it and the exact transmitted colour of each.
 *
 * A single sheet is returned verbatim. It has to be: the tab on that sheet
 * displays a hex, the user copies that hex, and the two have to be the same
 * colour, which rules out a round trip through a pigment gamut that cannot hold
 * every sRGB colour. Mixing only starts where a hex is no longer being claimed.
 */
export function mixFilm(
  pigments: readonly Ryb[],
  films: readonly (readonly [number, number, number])[],
  stats?: readonly SheetStat[],
): [number, number, number] {
  const n = pigments.length
  if (n === 0) return [1, 1, 1]
  const only = films[0]
  if (n === 1 && only) return [only[0] as number, only[1] as number, only[2] as number]

  const m = mixSummary(pigments, stats ?? films.map((f) => filmStat(f)))
  const g = gamutMap(m.L, m.sat * maxChroma(m.L, m.h, CHROMA_CEILING), m.h)
  return [g.r, g.g, g.b]
}

/**
 * The mix as three numbers: how light it is, how saturated in units of the
 * chroma available there, and what hue. Everything the model decides is decided
 * here, and none of it needs a gamut search, which is what lets the palette
 * generator weigh a few thousand hypothetical overlaps per roll.
 */
export function mixSummary(
  pigments: readonly Ryb[],
  stats: readonly SheetStat[],
): { L: number; sat: number; h: number } {
  const n = pigments.length

  // Which pigment: the AVERAGE of the concentrations, then renormalised so the
  // strongest channel is full. Direction and strength have to be separated,
  // because the inside of the cube is grey: at half concentration the model
  // reads the missing half as white, so an average alone would turn every
  // overlap into a dusty pastel. What the average is good for is the RATIO of
  // red to yellow to blue, which is the part that decides the hue.
  let cr = 0
  let cy = 0
  let cb = 0
  for (let i = 0; i < n; i++) {
    const p = pigments[i] as Ryb
    cr += p[0]
    cy += p[1]
    cb += p[2]
  }
  const peak = Math.max(cr, cy, cb)
  if (peak <= 0) return { L: 1, sat: 0, h: 0 }
  cr /= peak
  cy /= peak
  cb /= peak

  const srgb = rybToSrgb(cr, cy, cb)
  const pure = linearToOklch(decode(srgb[0]), decode(srgb[1]), decode(srgb[2]))
  // How pure that pigment direction is, measured where the question actually
  // lives: in pigment. One primary is a clean hue and two are a clean
  // secondary, but all three at once is the only way to make grey with paint,
  // so the amount of the WEAKEST primary is the amount of mud. Red over green
  // is red over yellow-and-blue, all three present, and it greys out. Red over
  // yellow does not. This is the only thing allowed to desaturate an overlap:
  // it is a property of the colours in it, never of how many there are.
  const agree = 1 - Math.min(cr, cy, cb)

  // Lightness and saturation both come from the sheets themselves, in units of
  // what is available at that lightness. So an overlap transmits about as much
  // light as the sheets that make it, a fourth layer costs nothing, and the mix
  // is at least as saturated as the strongest sheet in it.
  let sum = 0
  let min = Infinity
  let strongest = 0
  for (let i = 0; i < n; i++) {
    const st = stats[i]
    if (!st) continue
    sum += st.L
    if (st.L < min) min = st.L
    if (st.sat > strongest) strongest = st.sat
  }
  const mean = sum / n
  const boost = Math.min(OVERLAP_BOOST_MAX, 1 + OVERLAP_BOOST * (n - 1))

  return {
    L: mean + (min - mean) * L_MIN_BIAS,
    sat: Math.min(1, agree * strongest * boost),
    h: pure.h,
  }
}

/**
 * Mode B. Deliberately the other model: opaque screen-printed panels laid down
 * in stacking order, so the top one does govern and the result is a graphic
 * flat rather than a transmission. Ordered on purpose, which is why the painter
 * hands it the sheets sorted by depth.
 *
 * `inks` are linear sRGB, bottom first. `alphas` are their coverages.
 */
export function stackInk(
  inks: readonly (readonly [number, number, number])[],
  alphas: readonly number[],
): [number, number, number] {
  let r = 1
  let g = 1
  let b = 1
  for (let i = 0; i < inks.length; i++) {
    const c = inks[i]
    if (!c) continue
    const a = clamp01(alphas[i] ?? 1)
    r = r * (1 - a) + (c[0] as number) * a
    g = g * (1 - a) + (c[1] as number) * a
    b = b * (1 - a) + (c[2] as number) * a
  }
  return [r, g, b]
}

/** Both models, crossfaded in linear light. `mix` 0 is film, 1 is ink. */
export function blendModes(
  film: readonly [number, number, number],
  ink: readonly [number, number, number],
  mix: number,
): [number, number, number] {
  if (mix <= 0) return [film[0] as number, film[1] as number, film[2] as number]
  if (mix >= 1) return [ink[0] as number, ink[1] as number, ink[2] as number]
  return [
    (film[0] as number) + ((ink[0] as number) - (film[0] as number)) * mix,
    (film[1] as number) + ((ink[1] as number) - (film[1] as number)) * mix,
    (film[2] as number) + ((ink[2] as number) - (film[2] as number)) * mix,
  ]
}

/** Convenience for tests and tooling: the mixed colour as an sRGB byte triple. */
export function mixBytes(
  pigments: readonly Ryb[],
  films: readonly (readonly [number, number, number])[],
): [number, number, number] {
  const [r, g, b] = mixFilm(pigments, films)
  return [
    Math.round(clamp01(encode(r)) * 255),
    Math.round(clamp01(encode(g)) * 255),
    Math.round(clamp01(encode(b)) * 255),
  ]
}
