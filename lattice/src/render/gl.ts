/*
 * WebGL2, directly. What is on screen is a net of ribbons, a set of points and
 * one sphere drawn per pixel, which a 3D library would only add weight to.
 *
 * The canvas is transparent and sits on the lit CSS surface, so the room is
 * drawn on the same lightbox the sheets in Lightbox lie on. Everything is
 * premultiplied: graphite at low alpha over near-white is the whole look, and
 * straight alpha fringes it.
 */

import type { Mat4 } from './camera'
import { VIEW_AT, levelView } from '../physics/lattice'
import type { Level, Net } from '../physics/lattice'
import type { Vec3 } from '../physics/motion'

/*
 * Each rope is drawn a segment at a time, as a ribbon turned to face the
 * screen, so its weight can follow the pull: a hairline where space is at
 * rest, heavier where the mass has drawn it in. The bend is the boldest part
 * of every rope, and the straight run far out recedes.
 */
const LATTICE_VS = `#version 300 es
in vec2 aCorner;
in vec3 aA;
in vec3 aB;
in float aSqueezeA;
in float aSqueezeB;
in float aAxis;
in float aLink;
uniform mat4 uVP;
uniform vec2 uView;
uniform float uDpr;
uniform vec3 uEye;
uniform vec2 uFog;
uniform vec2 uReach;
uniform vec2 uNear;
uniform float uAlpha;
uniform float uBody;
uniform vec4 uInk[3];
uniform vec2 uWeight;
out float vAlpha;
out vec3 vInk;
out float vAcross;
out float vHalf;
const vec4 GONE = vec4(2.0, 2.0, 2.0, 1.0);
void main() {
  vAlpha = 0.0;
  vInk = vec3(0.0);
  vAcross = 0.0;
  vHalf = 1.0;
  // The last vertex of a rope does not run on into the next rope.
  if (aLink < 0.5) {
    gl_Position = GONE;
    return;
  }
  vec4 a = uVP * vec4(aA, 1.0);
  vec4 b = uVP * vec4(aB, 1.0);
  // Cut the segment where it passes behind the eye, or its direction on
  // screen turns inside out.
  const float E = 1e-3;
  if (a.w < E && b.w < E) {
    gl_Position = GONE;
    return;
  }
  float ta = a.w < E ? (E - a.w) / (b.w - a.w) : 0.0;
  float tb = b.w < E ? (E - a.w) / (b.w - a.w) : 1.0;
  vec4 ca = mix(a, b, ta);
  vec4 cb = mix(a, b, tb);
  float t = mix(ta, tb, aCorner.x);
  vec3 pos = mix(aA, aB, t);
  float squeeze = mix(aSqueezeA, aSqueezeB, t);

  // Weight in device pixels: one at rest, up to uWeight.x CSS px more at a
  // pull of uWeight.y. Under a pixel the ribbon stays a pixel and gives up ink
  // instead, which is how a hairline thinner than the screen looks.
  float pull = smoothstep(0.0, uWeight.y, squeeze);
  float w = 1.0 + uWeight.x * uDpr * pull;
  float cover = min(w, 1.0);
  w = max(w, 1.0);
  vHalf = 0.5 * w;
  // Half a pixel more each side, for the soft edge.
  float hw = vHalf + 0.5;
  vAcross = aCorner.y * hw;
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * uView;
  vec2 dir = dot(d, d) > 1e-8 ? normalize(d) : vec2(1.0, 0.0);
  vec4 c = mix(ca, cb, aCorner.x);
  c.xy += vec2(-dir.y, dir.x) * aCorner.y * hw * 2.0 / uView * c.w;
  gl_Position = c;

  vec4 ink = uInk[int(aAxis + 0.5)];
  vInk = ink.rgb;
  float dist = distance(pos, uEye);
  // Aerial perspective: far ropes sink into the surface, as far things do in a
  // lit room. Never to zero, or the back of the net stops being a net.
  float fog = 1.0 - 0.85 * smoothstep(uFog.x, uFog.y, dist);
  // The net dissolves into the surface away from the body instead of ending,
  // so there is never an edge. Measured at rest, which the squeeze gives back,
  // so how far a level shows does not depend on how hard it is pulled.
  float rest = length(pos) / max(1e-3, 1.0 - squeeze);
  float reach = 1.0 - smoothstep(uReach.x, uReach.y, rest);
  // A rope passing right by the lens would be a smear across the screen.
  float near = smoothstep(uNear.x, uNear.y, dist);
  // Ropes between the eye and the body thin to a ghost across its face, so
  // the body stays an object the net bends round rather than a thing in a cage.
  float D = length(uEye);
  vec3 toward = -uEye / D;
  vec3 v = pos - uEye;
  float along = dot(v, toward);
  float off = length(v - toward * along) * D / max(along, 1e-3);
  float front = 1.0 - smoothstep(D - uBody, D, along);
  float face = 1.0 - 0.8 * front * (1.0 - smoothstep(uBody, 1.3 * uBody, off));
  vAlpha = uAlpha * ink.a * cover * fog * reach * near * face * (1.0 + 1.5 * squeeze);
}`

const LATTICE_FS = `#version 300 es
precision highp float;
in float vAlpha;
in vec3 vInk;
in float vAcross;
in float vHalf;
out vec4 o;
void main() {
  float edge = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  float a = min(vAlpha, 0.72) * edge;
  if (a <= 0.0) discard;
  o = vec4(vInk * a, a);
}`

const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const SPHERE_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInv;
uniform mat4 uVP;
uniform vec3 uEye;
uniform vec3 uLight;
uniform float uR;
uniform vec3 uColor;
uniform float uHole;
out vec4 o;
void main() {
  vec4 far = uInv * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uEye);
  float b = dot(uEye, dir);
  float c = dot(uEye, uEye) - uR * uR;
  float disc = b * b - c;
  float w = fwidth(disc);
  if (disc < -w) discard;
  float edge = clamp(disc / w + 1.0, 0.0, 1.0);
  float t = -b - sqrt(max(disc, 0.0));
  vec3 hit = uEye + dir * t;
  vec3 n = normalize(hit);
  float facing = max(dot(n, -dir), 0.0);
  float rim = pow(1.0 - facing, 3.0);
  vec3 col;
  if (uHole > 0.5) {
    // Ink, with a faint cool rim so it stays a sphere and not a hole in the screen.
    col = mix(vec3(0.063, 0.063, 0.078), vec3(0.40, 0.44, 0.56), rim * 0.6);
  } else {
    // The lamps are upper left, as they are in Lightbox; the shadow side goes
    // cool, as the shadows there do.
    float l = clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
    l = l * l;
    col = uColor * (0.58 + 0.5 * l);
    col = mix(col * vec3(0.80, 0.84, 0.95), col, l);
    col = mix(col, vec3(1.0), rim * 0.16);
  }
  vec4 clip = uVP * vec4(hit, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  o = vec4(col * edge, edge);
}`

const POINTS_VS = `#version 300 es
in vec3 aPos;
in vec4 aColor;
in vec2 aShape;
uniform mat4 uVP;
uniform float uDpr;
out vec4 vColor;
out float vRing;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = aShape.x * uDpr;
  vColor = aColor;
  vRing = aShape.y;
}`

const POINTS_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vRing;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float aa = max(fwidth(r), 0.02);
  float a = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (vRing > 0.5) a *= smoothstep(0.52 - aa, 0.52, r);
  a *= vColor.a;
  if (a <= 0.0) discard;
  o = vec4(vColor.rgb * a, a);
}`

/*
 * Light as a streak: a ribbon a few pixels wide, turned to face the screen,
 * soft across its width with a hot core near the front. Each sample carries
 * its neighbours so the ribbon bends at the sample and segments never overlap.
 */
const BEAM_VS = `#version 300 es
in vec3 aPos;
in vec3 aPrev;
in vec3 aNext;
in vec4 aShape;
uniform mat4 uVP;
uniform vec2 uView;
uniform float uDpr;
out float vAcross;
out float vAlpha;
out float vHot;
vec2 screen(vec3 p) {
  vec4 c = uVP * vec4(p, 1.0);
  return c.xy / max(c.w, 1e-4) * uView * 0.5;
}
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  vec2 d = screen(aNext) - screen(aPrev);
  vec2 t = dot(d, d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  c.xy += vec2(-t.y, t.x) * aShape.x * aShape.y * uDpr / uView * c.w;
  gl_Position = c;
  vAcross = aShape.x;
  vAlpha = aShape.z;
  vHot = aShape.w;
}`

const BEAM_FS = `#version 300 es
precision highp float;
in float vAcross;
in float vAlpha;
in float vHot;
uniform vec3 uColor;
uniform vec3 uHot;
out vec4 o;
void main() {
  float x = abs(vAcross);
  float a = vAlpha * (1.0 - smoothstep(0.05, 1.0, x));
  vec3 col = mix(uColor, uHot, vHot * (1.0 - x));
  o = vec4(col * a, a);
}`

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

export interface BodyDraw {
  radius: number
  color: Vec3
  hole: boolean
}

export interface FrameDraw {
  viewProj: Mat4
  inverse: Mat4
  eye: Vec3
  light: Vec3
  /** The orbit distance the net is drawn for, and where ropes start to fade at the lens. */
  detail: number
  lens: number
  body: BodyDraw
  /** x y z, r g b a, size px, ring flag. */
  points: Float32Array
  pointCount: number
  /** x y z, previous, next, then side, width px, alpha, heat: gl.TRIANGLES. */
  beams: Float32Array
  beamCount: number
  /** Light's colour, and the hotter one at the front of its core. */
  beamColor: Vec3
  beamHot: Vec3
}

/**
 * One grey per direction, so crossing ropes stay told apart: x the darkest,
 * a warm graphite; z a cool slate a step lighter; the uprights lightest, so
 * they stand back instead of reading as bars. Ink, then weight.
 */
const INKS = new Float32Array([
  [40 / 255, 34 / 255, 30 / 255, 1],
  [70 / 255, 76 / 255, 88 / 255, 0.62],
  [34 / 255, 44 / 255, 62 / 255, 0.75],
].flat())

const POINT_STRIDE = 9
const BEAM_STRIDE = 13

/** A rope at full pull is this many CSS px heavier than a hairline, and full is this much drawn in. */
const WEIGHT_PX = 2
const WEIGHT_PULL = 0.5

export class Renderer {
  private gl: WebGL2RenderingContext
  private lattice: WebGLProgram
  private sphere: WebGLProgram
  private pointsProg: WebGLProgram
  private beamProg: WebGLProgram
  private latticeVao: WebGLVertexArrayObject
  private posBuf: WebGLBuffer
  private squeezeBuf: WebGLBuffer
  private axisBuf: WebGLBuffer
  private linkBuf: WebGLBuffer
  private levels: Level[] = []
  private quadVao: WebGLVertexArrayObject
  private pointsVao: WebGLVertexArrayObject
  private pointsBuf: WebGLBuffer
  private beamVao: WebGLVertexArrayObject
  private beamBuf: WebGLBuffer
  private dpr = 1
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl
    this.lattice = compile(gl, LATTICE_VS, LATTICE_FS)
    this.sphere = compile(gl, QUAD_VS, SPHERE_FS)
    this.pointsProg = compile(gl, POINTS_VS, POINTS_FS)
    this.beamProg = compile(gl, BEAM_VS, BEAM_FS)

    // One instance per segment, read straight out of the vertex buffers: a
    // segment is a vertex and the one after it. Where they start is set per
    // level at draw time, since WebGL2 has no base instance.
    this.latticeVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.latticeVao)
    const corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    this.attrib(this.lattice, 'aCorner', 2, 0, 0)
    this.posBuf = gl.createBuffer() as WebGLBuffer
    this.squeezeBuf = gl.createBuffer() as WebGLBuffer
    this.axisBuf = gl.createBuffer() as WebGLBuffer
    this.linkBuf = gl.createBuffer() as WebGLBuffer
    for (const name of ['aA', 'aB', 'aSqueezeA', 'aSqueezeB', 'aAxis', 'aLink']) {
      const loc = gl.getAttribLocation(this.lattice, name)
      if (loc >= 0) gl.vertexAttribDivisor(loc, 1)
    }

    this.quadVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.quadVao)
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    this.attrib(this.sphere, 'aPos', 2, 0, 0)

    this.pointsVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.pointsVao)
    this.pointsBuf = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuf)
    const ps = POINT_STRIDE * 4
    this.attrib(this.pointsProg, 'aPos', 3, ps, 0)
    this.attrib(this.pointsProg, 'aColor', 4, ps, 12)
    this.attrib(this.pointsProg, 'aShape', 2, ps, 28)

    this.beamVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.beamVao)
    this.beamBuf = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf)
    const bs = BEAM_STRIDE * 4
    this.attrib(this.beamProg, 'aPos', 3, bs, 0)
    this.attrib(this.beamProg, 'aPrev', 3, bs, 12)
    this.attrib(this.beamProg, 'aNext', 3, bs, 24)
    this.attrib(this.beamProg, 'aShape', 4, bs, 36)

    gl.bindVertexArray(null)
  }

  private attrib(prog: WebGLProgram, name: string, size: number, stride: number, offset: number): void {
    const gl = this.gl
    const loc = gl.getAttribLocation(prog, name)
    if (loc < 0) return
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset)
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  setNet(net: Net): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisBuf)
    gl.bufferData(gl.ARRAY_BUFFER, net.axis, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf)
    gl.bufferData(gl.ARRAY_BUFFER, net.link, gl.STATIC_DRAW)
    this.levels = net.levels
  }

  /** Points the segment attributes at a level's first vertex. */
  private segmentsFrom(first: number): void {
    const gl = this.gl
    const p = this.lattice
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    this.attrib(p, 'aA', 3, 12, first * 12)
    this.attrib(p, 'aB', 3, 12, (first + 1) * 12)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.squeezeBuf)
    this.attrib(p, 'aSqueezeA', 1, 4, first * 4)
    this.attrib(p, 'aSqueezeB', 1, 4, (first + 1) * 4)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisBuf)
    this.attrib(p, 'aAxis', 1, 4, first * 4)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf)
    this.attrib(p, 'aLink', 1, 4, first * 4)
  }

  setShape(positions: Float32Array, squeeze: Float32Array): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.squeezeBuf)
    gl.bufferData(gl.ARRAY_BUFFER, squeeze, gl.DYNAMIC_DRAW)
  }

  draw(f: FrameDraw): void {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    // The body first, writing depth, so ropes and particles behind it are hidden.
    gl.useProgram(this.sphere)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.sphere, 'uInv'), false, f.inverse)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.sphere, 'uVP'), false, f.viewProj)
    gl.uniform3fv(gl.getUniformLocation(this.sphere, 'uEye'), f.eye)
    gl.uniform3fv(gl.getUniformLocation(this.sphere, 'uLight'), f.light)
    gl.uniform1f(gl.getUniformLocation(this.sphere, 'uR'), f.body.radius)
    gl.uniform3fv(gl.getUniformLocation(this.sphere, 'uColor'), f.body.color)
    gl.uniform1f(gl.getUniformLocation(this.sphere, 'uHole'), f.body.hole ? 1 : 0)
    gl.bindVertexArray(this.quadVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.depthMask(false)

    const lp = this.lattice
    gl.useProgram(lp)
    gl.uniformMatrix4fv(gl.getUniformLocation(lp, 'uVP'), false, f.viewProj)
    gl.uniform2f(gl.getUniformLocation(lp, 'uView'), this.canvas.width, this.canvas.height)
    gl.uniform1f(gl.getUniformLocation(lp, 'uDpr'), this.dpr)
    gl.uniform3fv(gl.getUniformLocation(lp, 'uEye'), f.eye)
    // The net looks the same at every zoom, so its fog scales with it.
    const z = f.detail / VIEW_AT
    gl.uniform2f(gl.getUniformLocation(lp, 'uFog'), f.detail - 6 * z, f.detail + 8 * z)
    gl.uniform2f(gl.getUniformLocation(lp, 'uNear'), f.lens, (8 / 3) * f.lens)
    gl.uniform4fv(gl.getUniformLocation(lp, 'uInk'), INKS)
    gl.uniform1f(gl.getUniformLocation(lp, 'uBody'), f.body.radius)
    // Close in, nearly every rope on screen is pulled and the bends read on
    // their own, so the weight eases off or the room turns to charcoal.
    gl.uniform2f(gl.getUniformLocation(lp, 'uWeight'), WEIGHT_PX * Math.min(1, Math.sqrt(z)), WEIGHT_PULL)
    gl.bindVertexArray(this.latticeVao)
    // A device pixel is half as wide on a retina screen, so it gets more ink.
    const ink = this.dpr > 1.5 ? 0.2 : 0.14
    for (let k = 0; k < this.levels.length; k++) {
      const { weight, reach } = levelView(k, f.detail)
      const level = this.levels[k]
      const count = ropesWithin(level, reach[1])
      if (weight <= 0 || count < 2) continue
      gl.uniform2f(gl.getUniformLocation(lp, 'uReach'), reach[0], reach[1])
      gl.uniform1f(gl.getUniformLocation(lp, 'uAlpha'), ink * Math.min(1, 2 * weight))
      this.segmentsFrom(level.first)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count - 1)
    }

    if (f.beamCount > 0) {
      const p = this.beamProg
      gl.useProgram(p)
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uVP'), false, f.viewProj)
      gl.uniform2f(gl.getUniformLocation(p, 'uView'), this.canvas.width, this.canvas.height)
      gl.uniform1f(gl.getUniformLocation(p, 'uDpr'), this.dpr)
      gl.uniform3fv(gl.getUniformLocation(p, 'uColor'), f.beamColor)
      gl.uniform3fv(gl.getUniformLocation(p, 'uHot'), f.beamHot)
      gl.bindVertexArray(this.beamVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf)
      gl.bufferData(gl.ARRAY_BUFFER, f.beams.subarray(0, f.beamCount * BEAM_STRIDE), gl.STREAM_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, f.beamCount)
    }

    if (f.pointCount > 0) {
      gl.useProgram(this.pointsProg)
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pointsProg, 'uVP'), false, f.viewProj)
      gl.uniform1f(gl.getUniformLocation(this.pointsProg, 'uDpr'), this.dpr)
      gl.bindVertexArray(this.pointsVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuf)
      gl.bufferData(gl.ARRAY_BUFFER, f.points.subarray(0, f.pointCount * POINT_STRIDE), gl.STREAM_DRAW)
      gl.drawArrays(gl.POINTS, 0, f.pointCount)
    }

    gl.bindVertexArray(null)
  }
}

export { BEAM_STRIDE, POINT_STRIDE }

/** Vertex count of a level's ropes that come within `reach` of the centre. */
function ropesWithin(level: Level, reach: number): number {
  let a = 0
  let b = level.miss.length
  while (a < b) {
    const m = (a + b) >> 1
    if (level.miss[m] < reach) a = m + 1
    else b = m
  }
  return a === 0 ? 0 : level.verts[a - 1]
}
