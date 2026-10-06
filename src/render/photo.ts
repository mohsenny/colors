/*
 * The paper and the mounts drawn for a photograph, as the page draws them:
 * each card's shadows, outside it only, then the card with its fibre over it,
 * then its cut edge. The tabs and grips are chrome and stay out of the
 * picture, so the edge closes where a tab stood.
 */

/** One of the shadows a card casts, in CSS pixels, before the card turns. */
export interface Shade {
  ox: number
  oy: number
  blur: number
  alpha: number
}

/** What every card is made of, off the stylesheet. */
export interface Stock {
  mount: string
  edge: string
  /** The hairline lip every shadow stack ends in. */
  lip: string
  fibre: CanvasPattern | null
}

/** A mount, centred on (x, y) in stage px and turned by `rot`, its shadows bottom first. */
export interface MountShot {
  x: number
  y: number
  rot: number
  w: number
  h: number
  frame: number
  radius: number
  shades: readonly Shade[]
}

const SHADOW_RGB = '46, 52, 72'
/** Past any screen: a rectangle this size stands for everything outside a card. */
const FAR = 1e5

/**
 * The shadows, then the lip, outside the card only, as CSS draws an outer
 * shadow. On the page the offsets turn with the card; a canvas takes them, and
 * the blur, in device pixels and unturned, so they are turned here.
 */
function cast(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  shades: readonly Shade[],
  lip: string,
  rot: number,
  dpr: number,
): void {
  ctx.save()
  const outside = new Path2D()
  outside.rect(-FAR, -FAR, 2 * FAR, 2 * FAR)
  outside.addPath(outline)
  ctx.clip(outside, 'evenodd')
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  // The card that casts them is filled off the canvas, so only its shadows
  // land. Filled in place, a canvas whose clip is antialiased, as Safari's is,
  // lets some of the black through on the card's edge.
  const m = ctx.getTransform()
  const away = 2 * (ctx.canvas.width + ctx.canvas.height)
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e + away, m.f)
  ctx.fillStyle = '#000'
  for (const s of shades) {
    ctx.shadowOffsetX = (s.ox * cos - s.oy * sin) * dpr - away
    ctx.shadowOffsetY = (s.ox * sin + s.oy * cos) * dpr
    ctx.shadowBlur = s.blur * dpr
    ctx.shadowColor = `rgba(${SHADOW_RGB}, ${s.alpha})`
    ctx.fill(outline)
  }
  ctx.setTransform(m)
  ctx.shadowColor = 'transparent'
  // A 0.5px spread: a 1px line on the outline, its inner half clipped away.
  ctx.lineWidth = 1
  ctx.strokeStyle = lip
  ctx.stroke(outline)
  ctx.restore()
}

/** The fibre, from (x, y) as a background starts there, at 1/dpr so a tile is its size in CSS pixels. */
function fibre(ctx: CanvasRenderingContext2D, stock: Stock, shape: Path2D, x: number, y: number, dpr: number): void {
  if (!stock.fibre) return
  stock.fibre.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, x, y]))
  ctx.fillStyle = stock.fibre
  ctx.fill(shape, 'evenodd')
}

/** The paper in from the left, `width` across, its cut edge down its leading side only. */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shades: readonly Shade[],
  stock: Stock,
  dpr: number,
): void {
  const outline = new Path2D()
  outline.rect(0, 0, width, height)
  cast(ctx, outline, shades, stock.lip, 0, dpr)
  ctx.fillStyle = stock.mount
  ctx.fill(outline)
  fibre(ctx, stock, outline, 0, 0, dpr)
  ctx.fillStyle = stock.edge
  ctx.fillRect(width - 1, 0, 1, height)
}

/** A mount: the ring of card round the paint, and the hairline round the ring. */
export function drawMount(ctx: CanvasRenderingContext2D, m: MountShot, stock: Stock, dpr: number): void {
  const { w, h, frame: f, radius: r } = m
  ctx.save()
  ctx.translate(m.x, m.y)
  ctx.rotate(m.rot)
  const outline = new Path2D()
  outline.roundRect(-w / 2, -h / 2, w, h, r)
  cast(ctx, outline, m.shades, stock.lip, m.rot, dpr)
  const ring = new Path2D(outline)
  ring.roundRect(-w / 2 + f, -h / 2 + f, Math.max(0, w - 2 * f), Math.max(0, h - 2 * f), Math.max(0, r - f))
  ctx.fillStyle = stock.mount
  ctx.fill(ring, 'evenodd')
  fibre(ctx, stock, ring, -w / 2 + f, -h / 2 + f, dpr)
  ctx.beginPath()
  ctx.roundRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, Math.max(0, r - 0.5))
  ctx.lineWidth = 1
  ctx.strokeStyle = stock.edge
  ctx.stroke()
  ctx.restore()
}
