/*
 * What the films lie on: three fluorescent tubes on a white floor, seen through
 * a sheet of textured glass. One fragment pass, drawn only when something it
 * shows changes: the viewport, a lamp, the switch-on at load.
 *
 * Under a film the light is flat. Glass bends light, so a film over the full
 * effect would read as several colours where its tab says one. A second canvas
 * lays the tubes' mean colour under every sheet, grown to hide its edge under
 * the mount, and lets a trace of the glass through.
 *
 * WebGL2 or nothing: without it both canvases stay hidden and the stage's CSS
 * surface is what shows, as it did before there was glass.
 */

import type { Lamp } from '../core/lamps'
import type { Viewport } from '../core/types'
import type { Painter } from './paint'

export type Kind = 'grid' | 'fluted' | 'off'

/** The order G steps through them. Temporary, while the two glasses are compared. */
const KINDS: readonly Kind[] = ['grid', 'fluted', 'off']

/** How much of the glass shows through a film. Its contrast is about 15%, so 1 to 2% gets through. */
const TRACE = 0.1

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

/** The light under a film: the three tubes' mean, as bytes. */
export function flatOf(lamps: readonly Lamp[]): [number, number, number] {
  const sum = [0, 0, 0]
  for (const l of lamps) {
    sum[0] += l.r * l.gain
    sum[1] += l.g * l.gain
    sum[2] += l.b * l.gain
  }
  const n = Math.max(1, lamps.length)
  return sum.map((v) => Math.min(255, Math.round(v / n))) as [number, number, number]
}

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/*
 * Positions are CSS pixels from the top left. The floor is lit by what reaches
 * it from all three tubes, plus a broad halo and a close glow from each; the
 * tubes lie over it. The glass then shows each pixel the floor a little way
 * off, per cell, and shades the cell's own slope and the joints between cells.
 */
const FS = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uDev;
uniform int uKind;
uniform float uCell;
uniform vec3 uX;
uniform vec3 uTube;
uniform vec3 uLamp[3];
uniform vec3 uOn;
out vec4 outColor;

const float FLOOR = 0.85;
const float HALO = 0.06;
const float GLOW = 0.04;
const float MAG = 0.62;
const float BEND = 0.09;
const float DISP = 0.05;
const float BEVEL = 0.005;
const float GROOVE = 0.03;

float inside(float d, float r) {
  return clamp(r - d + 0.5, 0.0, 1.0);
}

// One tube at (dx, dy) from its centre: colour and cover.
vec4 tube(float dx, float dy, vec3 lamp, float on, vec3 metal) {
  float hw = uTube.x;
  float hl = uTube.y;
  float ax = abs(dx);
  float cap = hw;
  float body = hl - cap;
  // Lit phosphor is flat across and at full brightness whatever the tube's
  // gain, as a camera sees one, a shade darker where the glass turns away and
  // grey toward the electrodes.
  float limb = 1.0 - 0.08 * pow(ax / hw, 6.0);
  float worn = 1.0 - 0.18 * on * smoothstep(body - hw * 1.6, body, dy);
  vec3 lit = mix(vec3(0.8, 0.81, 0.82), lamp / max(max(lamp.r, lamp.g), lamp.b), on);
  vec3 col = lit * limb * worn;
  float a = inside(ax, hw) * inside(dy, body);
  // The cap: aluminium, a little wider, lit down its length, crimped where it meets the glass.
  float capA = inside(ax, hw * 1.05) * inside(dy, hl) * clamp(dy - body + 0.5, 0.0, 1.0);
  float shine = exp(-pow((dx + 0.3 * hw) / (0.22 * hw), 2.0));
  float crimp = 1.0 - 0.25 * exp(-pow((dy - body - 1.5) / 1.2, 2.0));
  vec3 capCol = metal * (0.7 + 0.25 * shine - 0.1 * pow(ax / hw, 2.0)) * crimp;
  col = mix(col, capCol, capA);
  a = max(a, capA);
  // Two pins into the holder.
  float pin = inside(abs(ax - 0.42 * hw), max(0.08 * hw, 0.6)) * clamp(dy - hl + 0.5, 0.0, 1.0)
    * inside(dy, hl + 0.35 * hw);
  col = mix(col, metal * 0.62, pin);
  return vec4(col, max(a, pin));
}

vec3 field(vec2 p) {
  vec2 n = p / uSize;
  float k = clamp(0.5 + 0.6 * dot(n - 0.5, vec2(0.883, 0.469)), 0.0, 1.0);
  vec3 albedo = mix(vec3(1.012, 1.0, 0.975), vec3(0.985, 0.995, 1.02), k);
  vec3 mean = (uLamp[0] + uLamp[1] + uLamp[2]) / 3.0;
  float hw = uTube.x;
  float hl = uTube.y;
  float dy = abs(p.y - uTube.z);
  float sh = uSize.x * 0.085;
  float sg = hw * 0.9;
  float past = max(dy - hl, 0.0);
  float pastLit = max(dy - hl + hw, 0.0);
  vec3 light = FLOOR * mean;
  for (int i = 0; i < 3; i++) {
    float dx = abs(p.x - uX[i]);
    float e = max(dx - hw, 0.0);
    float halo = exp(-(dx * dx + past * past) / (2.0 * sh * sh));
    float glow = exp(-(e * e + pastLit * pastLit) / (2.0 * sg * sg));
    light += uOn[i] * uLamp[i] * (HALO * halo + GLOW * glow);
  }
  vec3 col = albedo * light;
  for (int i = 0; i < 3; i++) {
    vec4 t = tube(p.x - uX[i], dy, uLamp[i], uOn[i], mean);
    col = mix(col, t.rgb, t.a);
  }
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uDev.y - gl_FragCoord.y) * uSize / uDev;
  float cell = uCell;
  vec2 c;
  vec2 u;
  vec2 g;
  if (uKind == 0) {
    // Square cells, each a shallow pillow.
    c = (floor(p / cell) + 0.5) * cell;
    u = (p - c) / (0.5 * cell);
    vec2 u2 = u * u;
    vec2 h = 1.0 - u2 * u2;
    g = vec2(-4.0 * u2.x * u.x * h.y, -4.0 * u2.y * u.y * h.x);
  } else {
    // Upright ribs, each a half cylinder.
    c = vec2((floor(p.x / cell) + 0.5) * cell, p.y);
    u = vec2((p.x - c.x) / (0.5 * cell), 0.0);
    g = vec2(-2.0 * u.x, 0.0);
  }
  // Magnified a little through the middle of a cell, bent outward where it
  // turns, red and blue parting slightly.
  vec2 d = (p - c) * (MAG - 1.0) - g * BEND * cell;
  vec3 col = vec3(
    field(p + d * (1.0 - DISP)).r,
    field(p + d).g,
    field(p + d * (1.0 + DISP)).b
  );
  // The slope against the room's light, from the top left, then the joints.
  col *= 1.0 + BEVEL * dot(-g, vec2(-0.7071, -0.7071));
  vec2 b = (1.0 - abs(u)) * 0.5 * cell * uDev.x / uSize.x;
  float m = uKind == 0 ? min(b.x, b.y) : b.x;
  col *= 1.0 - GROOVE * (1.0 - smoothstep(0.0, 1.5, m));
  // The room on the glass, and the housing's shade at its edges.
  vec2 n = p / uSize;
  col += 0.018 * exp(-pow((dot(n, vec2(0.6, 0.8)) - 0.32) / 0.14, 2.0));
  vec2 e2 = min(p, uSize - p);
  float edge = min(e2.x, e2.y);
  col *= 1.0 - 0.05 * exp(-edge / 18.0);
  col = mix(col, col * vec3(0.95, 1.0, 0.985), exp(-edge / 6.0));
  // Half a byte of noise, so the halos do not band.
  float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  outColor = vec4(clamp(col + (r - 0.5) / 255.0, 0.0, 1.0), 1.0);
}`

const UNIFORMS = ['uSize', 'uDev', 'uKind', 'uCell', 'uX', 'uTube', 'uLamp', 'uOn'] as const
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
  private readonly lamp = new Float32Array(9)
  private readonly on = new Float32Array(3)
  private flat = 'rgba(255, 255, 255, 1)'
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
  draw(vp: Viewport, lamps: readonly Lamp[], painter: Painter, reduced: boolean): void {
    if (!this.live) return
    const scale = Math.min(window.devicePixelRatio || 1, DPR_MAX)
    if (vp.width !== this.w || vp.height !== this.h || scale !== this.scale) this.size(vp, scale)

    const key = lamps.map((l) => `${l.r} ${l.g} ${l.b} ${l.gain.toFixed(3)}`).join('|')
    if (key !== this.lampKey) {
      this.lampKey = key
      for (let i = 0; i < 3; i++) {
        const l = lamps[i]
        if (!l) continue
        this.lamp[3 * i] = (l.r / 255) * l.gain
        this.lamp[3 * i + 1] = (l.g / 255) * l.gain
        this.lamp[3 * i + 2] = (l.b / 255) * l.gain
      }
      const [r, g, b] = flatOf(lamps)
      this.flat = `rgba(${r}, ${g}, ${b}, ${1 - TRACE})`
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
    this.lay(painter, vp.frame)
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
    // Thicker on a big screen, never under 18px across on a phone.
    const hw = Math.min(30, Math.max(9, short * 0.03))
    const cell = Math.round(Math.min(32, Math.max(18, short * 0.034)))

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(program)
    gl.uniform2f(loc.uSize ?? null, w, h)
    gl.uniform2f(loc.uDev ?? null, this.canvas.width, this.canvas.height)
    gl.uniform1i(loc.uKind ?? null, this.kind === 'fluted' ? 1 : 0)
    gl.uniform1f(loc.uCell ?? null, this.kind === 'fluted' ? Math.round(cell / 2) : cell)
    gl.uniform3f(loc.uX ?? null, w / 6, w / 2, (5 * w) / 6)
    gl.uniform3f(loc.uTube ?? null, hw, h * 0.42, h / 2)
    gl.uniform3fv(loc.uLamp ?? null, this.lamp)
    gl.uniform3fv(loc.uOn ?? null, this.on)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.dirty = false

    if (!this.drawn) {
      this.drawn = true
      this.canvas.hidden = false
      this.under.hidden = false
    }
  }

  /** The tubes' mean colour under every sheet, clipped where the paper is. */
  private lay(painter: Painter, frame: number): void {
    const ctx = this.underCtx
    if (!ctx) return
    ctx.clearRect(0, 0, this.under.width, this.under.height)
    ctx.beginPath()
    const x0 = painter.trace(ctx, frame / 2)
    ctx.fillStyle = this.flat
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
    if (target?.closest('input, textarea, [contenteditable="true"]')) return
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
