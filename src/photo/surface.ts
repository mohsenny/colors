/*
 * The lit surface Lightbox and Lattice stand on, painted for a photograph:
 * stage.css's gradients from the bottom up, then its grain. The gradients are
 * copied from the stylesheet, as a computed gradient is a string no canvas
 * takes, so a change to one is a change to both. The tubes are read off the
 * stage as they are now, since they drift.
 *
 * Every pair of stops shares its colour and only the alpha falls, so the
 * canvas, which blends stops unpremultiplied, lands where CSS does.
 */

type Pair = readonly [number, number]

/** Where the four tubes stand, as fractions of the stage. */
const TUBES: readonly Pair[] = [
  [0.125, 0.47],
  [0.375, 0.5],
  [0.625, 0.5],
  [0.875, 0.53],
]

const GRAIN_PX = 140
const GRAIN_ALPHA = 0.04

const tiles = new Map<string, Promise<HTMLCanvasElement | null>>()

/**
 * A texture tile from a stylesheet's url(), `size` CSS pixels square, drawn at
 * `scale` device pixels to the CSS pixel. Null if it will not load, or if the
 * browser counts it as foreign, which would stop the photograph being saved:
 * the picture goes without that layer rather than not at all.
 */
export function tile(css: string, size: number, scale: number): Promise<HTMLCanvasElement | null> {
  const url = /url\((['"]?)(.*)\1\)/.exec(css)?.[2]
  if (!url) return Promise.resolve(null)
  const key = `${size} ${scale} ${url}`
  let made = tiles.get(key)
  if (!made) {
    made = draw(url, Math.max(1, Math.round(size * scale))).catch(() => null)
    tiles.set(key, made)
  }
  return made
}

async function draw(url: string, px: number): Promise<HTMLCanvasElement | null> {
  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, px, px)
  // Throws if the tile has made the canvas unreadable.
  ctx.getImageData(0, 0, 1, 1)
  return canvas
}

/** The stage's grain, from its ::after. */
export function grainOf(stage: HTMLElement, scale: number): Promise<HTMLCanvasElement | null> {
  return tile(getComputedStyle(stage, '::after').backgroundImage, GRAIN_PX, scale)
}

/** A tile as a pattern `size` CSS pixels across under a transform of `scale`. */
export function patternOf(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  scale: number,
): CanvasPattern | null {
  const pattern = ctx.createPattern(tile, 'repeat')
  pattern?.setTransform(new DOMMatrix().scaleSelf(1 / scale))
  return pattern
}

/**
 * A canvas `width` by `height` device pixels with the stage's surface and
 * grain on it, and a transform of `scale` device pixels to the CSS pixel.
 */
export function litSurface(
  stage: HTMLElement,
  width: number,
  height: number,
  scale: number,
  grain: HTMLCanvasElement | null,
): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D
  const w = width / scale
  const h = height / scale
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // The base, through the middle at 118 degrees, over a line as long as CSS
  // makes it so the corners land on the end colours.
  const a = (118 * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const base = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half)
  base.addColorStop(0, 'rgb(247, 244, 236)')
  base.addColorStop(1, 'rgb(239, 242, 250)')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  ellipse(ctx, w, h, [0.81, 0.86], [1.58, 1.5], '228, 233, 244', 0.34, 0.7)
  ellipse(ctx, w, h, [0.28, 0.18], [1.54, 1.46], '255, 255, 255', 0.2, 0.66)

  rim(ctx, w, h, 'to left', 0.28, 0.035)
  rim(ctx, w, h, 'to right', 0.28, 0.035)
  rim(ctx, w, h, 'to top', 0.3, 0.05)
  rim(ctx, w, h, 'to bottom', 0.34, 0.055)

  const css = getComputedStyle(stage)
  const tubes = TUBES.map((at, i) => ({
    at,
    rgb: css.getPropertyValue(`--lb-tube-${i + 1}`).trim().split(/\s+/).join(', '),
    gain: Number(css.getPropertyValue(`--lb-tube-${i + 1}-i`)) || 1,
  })).reverse()
  // The halos, then the cores in them, the first tube on top of each.
  for (const t of tubes) ellipse(ctx, w, h, t.at, [0.17, 0.88], t.rgb, Math.min(1, 0.82 * t.gain), 0.74)
  for (const t of tubes) ellipse(ctx, w, h, t.at, [0.019, 0.44], t.rgb, Math.min(1, 0.92 * t.gain), 0.58)

  const pattern = grain && patternOf(ctx, grain, scale)
  if (pattern) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = GRAIN_ALPHA
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  return ctx
}

/** A radial gradient as CSS draws one with its radii in percent: an ellipse, the alpha gone by `stop`. */
function ellipse(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  at: Pair,
  radii: Pair,
  rgb: string,
  alpha: number,
  stop: number,
): void {
  const cx = at[0] * w
  const cy = at[1] * h
  const rx = radii[0] * w
  const ry = radii[1] * h
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`)
  g.addColorStop(stop, `rgba(${rgb}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(-cx / rx, -cy / ry, w / rx, h / ry)
  ctx.restore()
}

/** The housing's shade along one edge, named as CSS names it: `to left` is the right edge. */
function rim(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  to: 'to left' | 'to right' | 'to top' | 'to bottom',
  alpha: number,
  stop: number,
): void {
  const g =
    to === 'to left'
      ? ctx.createLinearGradient(w, 0, 0, 0)
      : to === 'to right'
        ? ctx.createLinearGradient(0, 0, w, 0)
        : to === 'to top'
          ? ctx.createLinearGradient(0, h, 0, 0)
          : ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, `rgba(223, 229, 240, ${alpha})`)
  g.addColorStop(stop, 'rgba(223, 229, 240, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}
