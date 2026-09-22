/**
 * The interiors.
 *
 * Everything inside the mounts is painted here, on one canvas that sits under
 * every slide's chrome and multiplies into the lit surface. The white mounts,
 * tabs, shadows and hit testing stay in the DOM (see stage.ts); only the colour
 * comes through here.
 *
 * Why a canvas at all. The old build gave every slide three blended DOM layers
 * and let `mix-blend-mode: multiply` do the mixing. That works, and it is real
 * optics, but the mix it produces is an RGB channel product, which is the wrong
 * model for looking at colour: yellow over blue came out olive grey instead of
 * green (core/pigment.ts opens with the full argument). Computing the mix means
 * owning the compositing, and owning the compositing means one surface.
 *
 * Two things fell out of the change. Twenty-one blended layers became one
 * canvas, and the mix became a pure function that a unit test can hold to
 * "yellow over blue is green".
 *
 * How the regions are found. Every distinct region of the stage is defined by
 * the SET of slides covering it, so the painter walks the subsets: start from
 * each slide's interior, clip it against a later slide, recurse. Regions are
 * then filled in order of increasing set size, which is the one detail that
 * makes this look seamless: a region of k+1 slides is by construction strictly
 * inside every region of k it came from, so each fill lands on solid paint
 * rather than on the edge between paint and background, and no antialiasing
 * seam can appear between neighbouring regions.
 */

import { CORNER_INNER } from '../core/constants'
import { encode, filmLinear, inkAlpha, inkLinear } from '../core/oklab'
import { blendModes, filmStat, filmToRyb, mixFilm, stackInk } from '../core/pigment'
import type { Ryb, SheetStat } from '../core/pigment'
import type { RenderOptions, SimState, SlideState, Viewport } from '../core/types'

/** Depth luminance lift: 2% toward white for a slide at the top of the stack. */
const LIFT_PER_Z = 0.02

/**
 * The sheen. Dyed acetate is never perfectly even, and a sheet held over a lamp
 * thins where the light catches it. Painted in the slide's own frame, so it
 * turns with the slide: a fixed-angle highlight on a turning object reads as a
 * screen effect instantly. White means less dye.
 */
const SHEEN_ANGLE = 148
const SHEEN_HIGH = 0.055
const SHEEN_LOW = 0.02

/** The film's own edge, darkened so the sheet reads as seated in its mount. */
const LIP_ALPHA = 0.045
const LIP_PX = 0.6

/** Mode B's registration edge: the ink at higher density, so it reads as print. */
const HAIRLINE_DENSITY = 0.88
const HAIRLINE_ALPHA = 0.9

/** Regions smaller than this many square px are not worth a fill. */
const MIN_AREA = 0.5

interface Sheet {
  id: number
  /** Interior quad, world px, clockwise from the top-left corner. */
  poly: number[]
  cx: number
  cy: number
  hw: number
  hh: number
  rot: number
  z: number
  /** Stacking order for mode B only. Mode A does not have one, by design. */
  rank: number
  film: [number, number, number]
  ryb: Ryb
  stat: SheetStat
  ink: [number, number, number]
  alpha: number
}

interface Cached {
  L: number
  C: number
  h: number
  d: number
  film: [number, number, number]
  ryb: Ryb
  stat: SheetStat
  ink: [number, number, number]
  alpha: number
}

interface Region {
  poly: number[]
  set: number[]
}

function shoelace(p: readonly number[]): number {
  const n = p.length / 2
  if (n < 3) return 0
  let a = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += (p[2 * i] as number) * (p[2 * j + 1] as number)
    a -= (p[2 * j] as number) * (p[2 * i + 1] as number)
  }
  return Math.abs(a) / 2
}

/** Clip a convex polygon to the half-plane nx*x + ny*y <= c. Sutherland-Hodgman. */
function clipHalf(src: readonly number[], nx: number, ny: number, c: number): number[] {
  const out: number[] = []
  const n = src.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = src[2 * i] as number
    const ay = src[2 * i + 1] as number
    const bx = src[2 * j] as number
    const by = src[2 * j + 1] as number
    const da = nx * ax + ny * ay - c
    const db = nx * bx + ny * by - c
    if (da <= 0) out.push(ax, ay)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }
  return out
}

/** Clip against a slide's interior: four half-planes in the slide's own frame. */
function clipToSheet(poly: readonly number[], s: Sheet): number[] {
  const ux = Math.cos(s.rot)
  const uy = Math.sin(s.rot)
  const du = ux * s.cx + uy * s.cy
  const dv = -uy * s.cx + ux * s.cy
  let p = clipHalf(poly, ux, uy, du + s.hw)
  if (p.length < 6) return p
  p = clipHalf(p, -ux, -uy, -du + s.hw)
  if (p.length < 6) return p
  p = clipHalf(p, -uy, ux, dv + s.hh)
  if (p.length < 6) return p
  return clipHalf(p, uy, -ux, -dv + s.hh)
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0')
}

function byte(x: number): number {
  const v = encode(x)
  return Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255)
}

export class Painter {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly cache = new Map<number, Cached>()
  private readonly sheets: Sheet[] = []
  private readonly levels: Region[][] = []
  private dpr = 1
  /** The blend mix of the last draw, so a sample answers for what is on screen. */
  private lastMix = 0
  private cssW = 0
  private cssH = 0

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lb-paint'
    this.canvas.setAttribute('aria-hidden', 'true')
    root.prepend(this.canvas)
    // alpha is required: everything outside a slide has to stay transparent so
    // the multiply leaves the lit surface exactly as it is.
    this.ctx = this.canvas.getContext('2d', { alpha: true })
  }

  destroy(): void {
    this.canvas.remove()
    this.cache.clear()
  }

  resize(vp: Viewport): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    if (vp.width === this.cssW && vp.height === this.cssH && dpr === this.dpr) return
    this.cssW = vp.width
    this.cssH = vp.height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(vp.width * dpr))
    this.canvas.height = Math.max(1, Math.round(vp.height * dpr))
    this.canvas.style.width = `${vp.width}px`
    this.canvas.style.height = `${vp.height}px`
  }

  draw(state: SimState, opts: RenderOptions): void {
    const ctx = this.ctx
    if (!ctx) return
    const vp = opts.viewport
    this.resize(vp)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, vp.width, vp.height)

    const sheets = this.collect(state, opts)
    const n = sheets.length
    if (n === 0) return

    // --- find every region ----------------------------------------------------
    const levels = this.levels
    for (let i = 0; i < levels.length; i++) (levels[i] as Region[]).length = 0
    const push = (depth: number, poly: number[], set: number[]): void => {
      while (levels.length <= depth) levels.push([])
      ;(levels[depth] as Region[]).push({ poly, set })
    }

    const walk = (poly: number[], set: number[], next: number): void => {
      push(set.length - 1, poly, set.slice())
      for (let j = next; j < n; j++) {
        const clipped = clipToSheet(poly, sheets[j] as Sheet)
        if (clipped.length < 6 || shoelace(clipped) < MIN_AREA) continue
        set.push(j)
        walk(clipped, set, j + 1)
        set.pop()
      }
    }
    for (let i = 0; i < n; i++) walk((sheets[i] as Sheet).poly, [i], i + 1)

    // --- fill, thinnest stack first ------------------------------------------
    const mix = state.modeMix < 0 ? 0 : state.modeMix > 1 ? 1 : state.modeMix
    this.lastMix = mix
    for (let depth = 0; depth < levels.length; depth++) {
      const regions = levels[depth] as Region[]
      for (let r = 0; r < regions.length; r++) {
        const region = regions[r] as Region
        ctx.fillStyle = this.colourFor(region.set, sheets, mix)
        if (depth === 0) {
          const s = sheets[region.set[0] as number] as Sheet
          this.pathRounded(ctx, s)
        } else {
          this.pathPoly(ctx, region.poly)
        }
        ctx.fill()
      }
    }

    // --- per-sheet material ---------------------------------------------------
    for (let i = 0; i < n; i++) this.material(ctx, sheets[i] as Sheet, mix)
  }

  // --- pieces ----------------------------------------------------------------

  private collect(state: SimState, opts: RenderOptions): Sheet[] {
    const vp = opts.viewport
    const vh = vp.height
    const slides = state.slides
    const sheets = this.sheets
    sheets.length = 0

    const live = new Set<number>()
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      if (!slide) continue
      live.add(slide.id)
      const hw = Math.max(0, (slide.w * vh) / 2 - vp.frame)
      const hh = Math.max(0, (slide.h * vh) / 2 - vp.frame)
      if (hw < 0.5 || hh < 0.5) continue
      const c = this.colours(slide)
      const cx = slide.x * vh
      const cy = slide.y * vh
      const cos = Math.cos(slide.rot)
      const sin = Math.sin(slide.rot)
      const corner = (sx: number, sy: number): [number, number] => [
        cx + sx * hw * cos - sy * hh * sin,
        cy + sx * hw * sin + sy * hh * cos,
      ]
      const [x0, y0] = corner(-1, -1)
      const [x1, y1] = corner(1, -1)
      const [x2, y2] = corner(1, 1)
      const [x3, y3] = corner(-1, 1)
      sheets.push({
        id: slide.id,
        poly: [x0, y0, x1, y1, x2, y2, x3, y3],
        cx,
        cy,
        hw,
        hh,
        rot: slide.rot,
        z: slide.z,
        rank: 0,
        film: c.film,
        ryb: c.ryb,
        stat: c.stat,
        ink: c.ink,
        alpha: c.alpha,
      })
    }
    for (const id of this.cache.keys()) if (!live.has(id)) this.cache.delete(id)

    // Mode B needs a stacking order, and it has to be the same one the mounts
    // use, including the lift a selected slide gets: the interior would
    // otherwise disagree with the chrome about which slide is on top.
    const order = sheets.slice().sort((a, b) => (a.z === b.z ? a.id - b.id : a.z - b.z))
    for (let i = 0; i < order.length; i++) (order[i] as Sheet).rank = i
    for (const s of sheets) if (s.id === opts.selectedId) s.rank = order.length

    return sheets
  }

  /** Dye to paint, cached: the RYB inverse is a search, not a formula. */
  private colours(slide: SlideState): Cached {
    const dye = slide.dye
    const hit = this.cache.get(slide.id)
    if (hit && hit.L === dye.L && hit.C === dye.C && hit.h === dye.h && hit.d === dye.d) return hit
    const film = filmLinear(dye)
    const next: Cached = {
      L: dye.L,
      C: dye.C,
      h: dye.h,
      d: dye.d,
      film,
      ryb: filmToRyb(film),
      stat: filmStat(film),
      ink: inkLinear(dye),
      alpha: inkAlpha(dye),
    }
    this.cache.set(slide.id, next)
    return next
  }

  /**
   * What the box is showing at one point, and which slides are making it.
   *
   * This is the only way to reach an overlap. The crossing of two gels is not
   * any slide's colour and has no element of its own: it is a region this
   * painter computed and filled, and the moment the slides separate it is gone.
   * So the interaction that saves one has to ask the painter, which is what
   * double-clicking the stage does.
   *
   * Reads the sheets retained from the last draw, so it answers for exactly
   * what is on screen, including while paused or scrubbed.
   *
   * `x`/`y` are stage pixels, the same space the canvas is drawn in.
   */
  sampleAt(x: number, y: number): { ids: number[]; hex: string } | null {
    const sheets = this.sheets
    const set: number[] = []
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i] as Sheet
      const dx = x - s.cx
      const dy = y - s.cy
      const cos = Math.cos(s.rot)
      const sin = Math.sin(s.rot)
      if (Math.abs(dx * cos + dy * sin) <= s.hw && Math.abs(-dx * sin + dy * cos) <= s.hh) {
        set.push(i)
      }
    }
    if (set.length === 0) return null
    const [r, g, b] = this.rgbFor(set, sheets, this.lastMix)
    return {
      ids: set.map((i) => (sheets[i] as Sheet).id),
      hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`,
    }
  }

  private colourFor(set: readonly number[], sheets: readonly Sheet[], mix: number): string {
    const [r, g, b] = this.rgbFor(set, sheets, mix)
    return `rgb(${r},${g},${b})`
  }

  /** The mixed colour of a set of sheets, as three bytes. */
  private rgbFor(
    set: readonly number[],
    sheets: readonly Sheet[],
    mix: number,
  ): [number, number, number] {
    const pigments: Ryb[] = []
    const films: [number, number, number][] = []
    const stats: SheetStat[] = []
    let zSum = 0
    for (let i = 0; i < set.length; i++) {
      const s = sheets[set[i] as number] as Sheet
      pigments.push(s.ryb)
      films.push(s.film)
      stats.push(s.stat)
      zSum += s.z
    }

    let out = mixFilm(pigments, films, stats)
    if (mix > 0) {
      const ordered = set
        .map((i) => sheets[i] as Sheet)
        .sort((a, b) => a.rank - b.rank)
      out = blendModes(
        out,
        stackInk(
          ordered.map((s) => s.ink),
          ordered.map((s) => s.alpha),
        ),
        mix,
      )
    }

    // Depth, as brightness. Averaged over the set so the lift cannot depend on
    // stacking order, which the mix itself never does.
    const lift = LIFT_PER_Z * (zSum / set.length)
    return [
      byte(out[0] + (1 - out[0]) * lift),
      byte(out[1] + (1 - out[1]) * lift),
      byte(out[2] + (1 - out[2]) * lift),
    ]
  }

  private pathPoly(ctx: CanvasRenderingContext2D, poly: readonly number[]): void {
    ctx.beginPath()
    ctx.moveTo(poly[0] as number, poly[1] as number)
    for (let i = 1; i < poly.length / 2; i++) {
      ctx.lineTo(poly[2 * i] as number, poly[2 * i + 1] as number)
    }
    ctx.closePath()
  }

  /** A lone slide gets the mount's inner radius; overlaps are cut square. The
   *  difference is a pixel and a half, and the mount's border covers it. */
  private pathRounded(ctx: CanvasRenderingContext2D, s: Sheet): void {
    ctx.beginPath()
    if (s.rot === 0) {
      const r = Math.min(CORNER_INNER, s.hw, s.hh)
      ctx.roundRect(s.cx - s.hw, s.cy - s.hh, s.hw * 2, s.hh * 2, r)
      return
    }
    this.pathPoly(ctx, s.poly)
  }

  /** Sheen, lip and (in mode B) the registration hairline, in the slide's frame. */
  private material(ctx: CanvasRenderingContext2D, s: Sheet, mix: number): void {
    if (s.hw < 1 || s.hh < 1) return
    ctx.save()
    ctx.translate(s.cx, s.cy)
    if (s.rot !== 0) ctx.rotate(s.rot)
    const w = s.hw * 2
    const h = s.hh * 2
    ctx.beginPath()
    ctx.roundRect(-s.hw, -s.hh, w, h, Math.min(CORNER_INNER, s.hw, s.hh))
    ctx.clip()

    const film = 1 - mix
    if (film > 0.01) {
      const a = (SHEEN_ANGLE * Math.PI) / 180
      const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
      const gx = (Math.cos(a) * len) / 2
      const gy = (Math.sin(a) * len) / 2
      const grad = ctx.createLinearGradient(-gx, -gy, gx, gy)
      grad.addColorStop(0, `rgba(255,255,255,${(SHEEN_HIGH * film).toFixed(4)})`)
      grad.addColorStop(0.38, `rgba(255,255,255,${(0.012 * film).toFixed(4)})`)
      grad.addColorStop(0.62, 'rgba(255,255,255,0)')
      grad.addColorStop(1, `rgba(0,0,0,${(SHEEN_LOW * film).toFixed(4)})`)
      ctx.fillStyle = grad
      ctx.fillRect(-s.hw, -s.hh, w, h)
    }

    ctx.lineWidth = LIP_PX
    ctx.strokeStyle = `rgba(0,0,0,${LIP_ALPHA})`
    ctx.beginPath()
    ctx.roundRect(
      -s.hw + LIP_PX / 2,
      -s.hh + LIP_PX / 2,
      w - LIP_PX,
      h - LIP_PX,
      Math.min(CORNER_INNER, s.hw, s.hh),
    )
    ctx.stroke()

    if (mix > 0.01) {
      const d = HAIRLINE_DENSITY
      const r = byte(s.ink[0] * d)
      const g = byte(s.ink[1] * d)
      const b = byte(s.ink[2] * d)
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(${r},${g},${b},${(HAIRLINE_ALPHA * mix).toFixed(3)})`
      ctx.beginPath()
      ctx.roundRect(-s.hw + 0.5, -s.hh + 0.5, w - 1, h - 1, Math.min(CORNER_INNER, s.hw, s.hh))
      ctx.stroke()
    }

    ctx.restore()
  }
}
