/*
 * What the films lie on: three wide white light sources seen through a sheet
 * of textured glass. One fragment pass, drawn only when something it shows
 * changes: the viewport, a lamp, the switch-on at load.
 *
 * In Paint the light under a film is mostly flat, so a film reads close to the
 * colour its tab names. A second canvas lays the lamps' colour under every
 * sheet, grown to hide its edge under the mount, and lets part of the glass
 * through. In Light the film is a filter over the lightbox and all of the glass
 * shows through it.
 *
 * WebGL2 or nothing: without it both canvases stay hidden and the stage's CSS
 * surface is what shows, as it did before there was glass.
 */

import { GLASS_DEPTH_MAX, GLASS_MID } from '../core/constants'
import type { Lamp } from '../core/lamps'
import type { GlassTune, Viewport } from '../core/types'
import type { Painter } from './paint'

export type Kind = 'grid' | 'fluted' | 'off'

/** The order G steps through them. Temporary, while the two glasses are compared. */
const KINDS: readonly Kind[] = ['grid', 'fluted', 'off']

/** How much of the glass shows through a film in Paint. In Light, all of it. */
const TRACE_PAINT = 0.4

/** Device pixels per CSS pixel, at most. The glass is soft, so past 2 is cost rather than detail. */
const DPR_MAX = 2

/** When each tube strikes, ms after the box first draws, left to right: the middle one first. */
const STRIKE_MS = [150, 0, 270] as const

/** By when every tube is fully on. */
export const SWITCH_MS = 750

/**
 * A tube's light `ms` after the box first draws, 0 to 1. One blink, a dark beat
 * while the electrodes heat, then on, so no tube flashes more than once.
 */
export function switchOn(ms: number, i: number): number {
  const t = ms - (STRIKE_MS[i] ?? 0)
  if (t < 0) return 0
  if (t < 70) return 0.8
  if (t < 230) return 0.1
  return Math.min(1, 0.75 + (0.25 * (t - 230)) / 250)
}

/** The glass a page asks for with `?glass=`, grid unless it names another. */
export function kindOf(search: string): Kind {
  const asked = new URLSearchParams(search).get('glass')
  return KINDS.find((k) => k === asked) ?? 'grid'
}

/** The light under a film: the lamps' mean colour at full brightness, as bytes. */
export function flatOf(lamps: readonly Lamp[]): [number, number, number] {
  const sum = [0, 0, 0]
  for (const l of lamps) {
    sum[0] += l.r
    sum[1] += l.g
    sum[2] += l.b
  }
  const n = Math.max(1, lamps.length)
  return sum.map((v) => Math.min(255, Math.round(v / n))) as [number, number, number]
}

/** The glass at `t` on its dial: deeper as it goes up, and the glow giving way. */
export function glassAt(t: number): GlassTune {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5
  const depth = k < 0.5 ? GLASS_MID.depth * 2 * k : GLASS_MID.depth + (GLASS_DEPTH_MAX - GLASS_MID.depth) * (2 * k - 1)
  return { size: GLASS_MID.size, depth, shape: GLASS_MID.shape, glow: GLASS_MID.glow * 2 * (1 - k) }
}

export function sameGlass(a: GlassTune, b: GlassTune): boolean {
  return a.size === b.size && a.depth === b.depth && a.shape === b.shape && a.glow === b.glow
}

/** How much of the glass shows through a film, `mix` 0 for Paint to 1 for Light. */
export function traceOf(mix: number): number {
  const m = mix < 0 ? 0 : mix > 1 ? 1 : mix
  return TRACE_PAINT + (1 - TRACE_PAINT) * m
}

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/*
 * Positions are CSS pixels from the top left. Three wide sources light the box,
 * each a diffuser panel with the tubes inside it showing as brighter strips,
 * spilling a little past its edge, the box a shade dimmer between and around
 * them. The glass then shows each pixel the light from a little way off. Every
 * cell is a low dome, flat where it meets the next, so no joint ever shows: a
 * cell shows a wider patch than it covers, and a strip behind it comes out as
 * a small copy, cell after cell. Where the light is even the glass all but
 * disappears, as real glass does.
 */
const FS = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uDev;
uniform int uKind;
uniform float uCell;
uniform vec3 uX;
uniform vec3 uSrc;
uniform vec3 uLamp[3];
uniform vec3 uOn;
uniform float uDepth;
uniform float uShape;
uniform float uGlow;
out vec4 outColor;

const float PI = 3.14159265;
const float AMB = 0.935;
const float PANEL = 0.03;
const float BLOOM = 0.02;
const float STRIP = 0.045;
const float LENS = 0.08;
const float DISP = 0.1;
const float KNEE = 0.965;

float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 light(vec2 p) {
  float hw = uSrc.x;
  float hl = uSrc.y;
  float ay = abs(p.y - uSrc.z);
  vec3 mean = (uLamp[0] + uLamp[1] + uLamp[2]) / 3.0;
  vec3 col = AMB * (0.93 + 0.07 * (uOn.x + uOn.y + uOn.z) / 3.0) * mean;
  float along = 1.0 - smoothstep(hl - 0.5 * hw, hl + 0.5 * hw, ay);
  float past = max(ay - hl, 0.0);
  for (int i = 0; i < 3; i++) {
    float dx = p.x - uX[i];
    float ax = abs(dx);
    float panel = (1.0 - smoothstep(hw * 0.75, hw * 1.25, ax)) * along;
    // Three tubes under the diffuser, each a hard line in a narrow glow.
    float strip = 0.0;
    for (int k = -1; k <= 1; k++) {
      float x = (dx - float(k) * 0.53 * hw) / hw;
      strip += 0.5 * exp(-x * x / 0.002) + 0.5 * exp(-x * x / 0.03);
    }
    float e = max(ax - hw, 0.0);
    float bloom = exp(-(e * e + past * past) / (2.0 * 0.64 * hw * hw));
    col += uOn[i] * uLamp[i] * (PANEL * panel + STRIP * strip * panel + BLOOM * bloom);
  }
  // The housing takes a little light at the edges of the box.
  vec2 e2 = min(p, uSize - p);
  col *= 1.0 - 0.07 * exp(-min(e2.x, e2.y) / 110.0);
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uDev.y - gl_FragCoord.y) * uSize / uDev;
  float cell = uCell;
  vec2 id = floor(p / cell);
  vec2 u = (p - (id + 0.5) * cell) / (0.5 * cell);
  // Each cell a soft pillow, flat at its top and where it meets the next:
  // steepest halfway out, so light bends around its shoulders and corners.
  // uShape is how square it is, 2 a circle. Upright ribs for the fluted glass.
  if (uKind != 0) u.y = 0.0;
  vec2 au = abs(u);
  vec2 an = pow(au, vec2(uShape));
  float rad = pow(an.x + an.y, 1.0 / uShape);
  vec2 grad = sign(u) * pow(clamp(au / max(rad, 1e-6), 0.0, 1.0), vec2(uShape - 1.0));
  vec2 slope = rad < 1.0 ? sin(PI * rad) * grad : vec2(0.0);
  // No two cells come out of the mould quite alike.
  float bend = 0.8 + 0.4 * hash(uKind == 0 ? id : vec2(id.x, 0.0));
  vec2 d = LENS * uDepth * 0.5 * PI * bend * slope * cell;
  // Red and blue part slightly where the cell turns hardest.
  vec3 col = vec3(
    light(p + d * (1.0 - DISP)).r,
    light(p + d).g,
    light(p + d * (1.0 + DISP)).b
  );
  // Glow lifts the dimmer parts toward white. Then a soft shoulder, not a
  // clamp, so a strip that runs past white still shows its core.
  col += uGlow * max(1.0 - col, 0.0);
  vec3 over = clamp(col - KNEE, 0.0, 2.0 * (1.0 - KNEE));
  col -= over * over / (4.0 * (1.0 - KNEE));
  // Half a byte of noise, so the falloffs do not band.
  float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  outColor = vec4(clamp(col, 0.0, 1.0) + (r - 0.5) / 255.0, 1.0);
}`

const UNIFORMS = ['uSize', 'uDev', 'uKind', 'uCell', 'uX', 'uSrc', 'uLamp', 'uOn', 'uDepth', 'uShape', 'uGlow'] as const
type Uniform = (typeof UNIFORMS)[number]

export class Glass {
  private readonly canvas: HTMLCanvasElement
  private readonly under: HTMLCanvasElement
  private readonly underCtx: CanvasRenderingContext2D | null
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private loc: Partial<Record<Uniform, WebGLUniformLocation | null>> = {}
  private kind: Kind
  private w = 0
  private h = 0
  private scale = 0
  private lampKey = ''
  private tune: GlassTune = { ...GLASS_MID }
  private readonly lamp = new Float32Array(9)
  private readonly on = new Float32Array(3)
  private flat = '255, 255, 255'
  /** performance.now() at the first draw, -1 before it. */
  private strike = -1
  private settled = false
  private dirty = true
  private drawn = false

  constructor(root: HTMLElement) {
    this.kind = kindOf(location.search)

    this.under = document.createElement('canvas')
    this.under.className = 'lb-under'
    this.under.setAttribute('aria-hidden', 'true')
    this.under.hidden = true
    this.underCtx = this.under.getContext('2d', { alpha: true })

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lb-glass'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.hidden = true
    root.prepend(this.canvas, this.under)

    this.canvas.addEventListener('webglcontextlost', this.onLost)
    this.canvas.addEventListener('webglcontextrestored', this.onRestored)
    window.addEventListener('keydown', this.onKey)
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      // Kept for the photograph, which reads it between frames.
      preserveDrawingBuffer: true,
    })
    this.build()
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey)
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    this.canvas.remove()
    this.under.remove()
  }

  /** The glass and the light under the films, for a photograph. Nothing when the CSS surface is showing. */
  get layers(): CanvasImageSource[] {
    return this.live && this.drawn ? [this.canvas, this.under] : []
  }

  private get live(): boolean {
    return this.kind !== 'off' && this.program !== null
  }

  /** Every frame, after the painter: the glass if anything it shows has changed, and the light under the films. */
  draw(vp: Viewport, lamps: readonly Lamp[], painter: Painter, mix: number, reduced: boolean, tune: GlassTune): void {
    if (!this.live) return
    if (!sameGlass(tune, this.tune)) {
      this.tune = { ...tune }
      this.dirty = true
    }
    const scale = Math.min(window.devicePixelRatio || 1, DPR_MAX)
    if (vp.width !== this.w || vp.height !== this.h || scale !== this.scale) this.size(vp, scale)

    // Colour only. The sources are at the top of the range, where a few
    // percent of breathing would not show and would cost a redraw a frame.
    const key = lamps.map((l) => `${l.r} ${l.g} ${l.b}`).join('|')
    if (key !== this.lampKey) {
      this.lampKey = key
      for (let i = 0; i < 3; i++) {
        const l = lamps[i]
        if (!l) continue
        this.lamp[3 * i] = l.r / 255
        this.lamp[3 * i + 1] = l.g / 255
        this.lamp[3 * i + 2] = l.b / 255
      }
      this.flat = flatOf(lamps).join(', ')
      this.dirty = true
    }

    if (!this.settled) {
      const now = performance.now()
      if (this.strike < 0) this.strike = now
      const ms = reduced ? SWITCH_MS : now - this.strike
      for (let i = 0; i < 3; i++) this.on[i] = switchOn(ms, i)
      this.settled = ms >= SWITCH_MS
      this.dirty = true
    }

    if (this.dirty) this.render()
    this.lay(painter, vp.frame, 1 - traceOf(mix))
  }

  private size(vp: Viewport, scale: number): void {
    this.w = vp.width
    this.h = vp.height
    this.scale = scale
    this.canvas.width = Math.max(1, Math.round(vp.width * scale))
    this.canvas.height = Math.max(1, Math.round(vp.height * scale))
    // One pixel per CSS pixel: its only edges are under the mounts.
    this.under.width = Math.max(1, Math.round(vp.width))
    this.under.height = Math.max(1, Math.round(vp.height))
    this.dirty = true
  }

  private build(): void {
    const gl = this.gl
    this.program = null
    if (!gl) return
    try {
      this.program = compile(gl, VS, FS)
    } catch {
      return
    }
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(this.program, name)
    this.dirty = true
  }

  private render(): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return
    const loc = this.loc
    const w = this.w
    const h = this.h
    const short = Math.min(w, h)
    // Wide, but always with a gap between them, however narrow the screen.
    const hw = Math.min(short * 0.18, (w / 3) * 0.32)
    const cell = Math.max(8, Math.round(Math.min(84, Math.max(48, short * 0.085)) * this.tune.size))

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(program)
    gl.uniform2f(loc.uSize ?? null, w, h)
    gl.uniform2f(loc.uDev ?? null, this.canvas.width, this.canvas.height)
    gl.uniform1i(loc.uKind ?? null, this.kind === 'fluted' ? 1 : 0)
    gl.uniform1f(loc.uCell ?? null, this.kind === 'fluted' ? Math.round(cell / 2) : cell)
    gl.uniform3f(loc.uX ?? null, w / 6, w / 2, (5 * w) / 6)
    gl.uniform3f(loc.uSrc ?? null, hw, h * 0.46, h / 2)
    gl.uniform3fv(loc.uLamp ?? null, this.lamp)
    gl.uniform3fv(loc.uOn ?? null, this.on)
    gl.uniform1f(loc.uDepth ?? null, this.tune.depth)
    gl.uniform1f(loc.uShape ?? null, this.tune.shape)
    gl.uniform1f(loc.uGlow ?? null, this.tune.glow)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.dirty = false

    if (!this.drawn) {
      this.drawn = true
      this.canvas.hidden = false
      this.under.hidden = false
    }
  }

  /** The lamps' colour under every sheet at `alpha`, clipped where the paper is. */
  private lay(painter: Painter, frame: number, alpha: number): void {
    const ctx = this.underCtx
    if (!ctx) return
    ctx.clearRect(0, 0, this.under.width, this.under.height)
    if (alpha < 0.005) return
    ctx.beginPath()
    const x0 = painter.trace(ctx, frame / 2)
    ctx.fillStyle = `rgba(${this.flat}, ${alpha.toFixed(3)})`
    ctx.fill()
    if (x0 > 0) ctx.clearRect(0, 0, x0, this.under.height)
  }

  private show(on: boolean): void {
    this.canvas.hidden = !on
    this.under.hidden = !on
  }

  private onLost = (e: Event): void => {
    e.preventDefault()
    this.program = null
    this.drawn = false
    this.show(false)
  }

  private onRestored = (): void => {
    this.build()
  }

  /** G steps through grid, fluted and none. Temporary, while the two glasses are compared. */
  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyG' || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input[type="text"], textarea, [contenteditable="true"]')) return
    this.kind = KINDS[(KINDS.indexOf(this.kind) + 1) % KINDS.length] as Kind
    this.dirty = true
    if (this.kind === 'off') {
      this.drawn = false
      this.show(false)
    }
  }
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type) as WebGLShader
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const p = gl.createProgram() as WebGLProgram
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}
